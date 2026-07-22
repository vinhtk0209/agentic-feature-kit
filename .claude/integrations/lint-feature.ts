/**
 * lint-feature.ts — machine-enforced v3.16 compliance checker for a generated feature.
 *
 * Turns the "trust the LLM" HARD RULES into checks a script can verify, so B11/B12 gate on
 * facts, not prose. Covers:
 *   - HR33  no blind cast: `<responseTransform>(...) as <Type>` on an HTTP response
 *   - HR34  business/display rules → a utils/ pure fn + co-located *.test.ts
 *   - HR35  done = verified: true verified-ratio of (UI + ACT) checklist rows
 *   - HR36  full AC/description coverage: every ACT row maps to ≥1 test
 *           (ux-states.json ac_assertions[] or unit_tests[], or a jest test referencing the id)
 *   - quality: no `any`, no console.log/debug in the feature folder
 *
 * Usage:
 *   npx tsx .claude/integrations/lint-feature.ts <feature-folder> \
 *     [--checklist docs/specs/<F>/checklist.md] \
 *     [--ux-states docs/specs/<F>/ux-states.json] \
 *     [--response-transform transformResponse] \
 *     [--min-verified 0.6] [--gate] [--json] [--code-only]
 *
 *   --code-only : run just the code-quality checks (blind-cast, transform layer, no any/console/deep-import,
 *                 assertion-less tests). Skips checklist/ux-states/coverage. Used at B10 self-eval in a worktree.
 *
 * Exit code: 0 if no blocking violation (or --gate omitted); 1 if a gate fails.
 * Pure Node — no external deps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseUxStates, type UxStatesDoc } from './ux-states';
import { loadConfig, type LearnedConfig } from './learned-config';
import { parseRowDefer, validateRowDefer, validateRowDeferStamp, isLineValidlyDeferred, LOCKED_ANCHORS, ChecklistDeferError } from './checklist-defer';

export interface Args {
  folder: string;
  checklist?: string;
  uxStates?: string;
  responseTransform: string;
  minVerified: number;
  gate: boolean;
  json: boolean;
  codeOnly: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    folder: '',
    responseTransform: 'transformResponse',
    minVerified: 0.6,
    gate: false,
    json: false,
    codeOnly: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--checklist') { a.checklist = argv[++i]; } else if (t === '--ux-states') { a.uxStates = argv[++i]; } else if (t === '--response-transform') { a.responseTransform = argv[++i]; } else if (t === '--min-verified') { a.minVerified = Number(argv[++i]); } else if (t === '--gate') { a.gate = true; } else if (t === '--json') { a.json = true; } else if (t === '--code-only') { a.codeOnly = true; } else { rest.push(t); }
  }
  a.folder = rest[0] || '';
  return a;
}

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...walk(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

export interface Finding { rule: string; level: 'error' | 'warn'; msg: string; }

const findings: Finding[] = [];
const add = (rule: string, level: 'error' | 'warn', msg: string) => findings.push({ rule, level, msg });

// ── HR33 — no blind cast ─────────────────────────────────────────────
function checkBlindCast(files: string[], transform: string) {
  // <transform>(...) as <Type>   OR   data as <Type>   in api files
  const reTransform = new RegExp(`${transform}\\s*\\([^)]*\\)\\s+as\\s+\\w`);
  const reData = /\bdata\s+as\s+[A-Z]\w*/;
  let hits = 0;
  for (const f of files) {
    const isApi = /(^|[\\/])(api|data)[\\/]?.*\.ts$/.test(f) || f.endsWith('api.ts');
    const lines = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // skip comment lines (avoid matching doc examples)
      if (reTransform.test(ln) || (isApi && reData.test(ln))) {
        hits += 1;
        add('HR33', 'error', `blind cast → use a mapXxx() in data/transform.ts: ${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    });
  }
  if (hits === 0) add('HR33', 'warn', 'no blind cast found ✅');
}

// ── transform layer present ──────────────────────────────────────────
function checkTransformLayer(folder: string, files: string[]) {
  const apiFiles = files.filter((f) => f.endsWith('api.ts'));
  if (apiFiles.length === 0) return;
  const makesHttp = apiFiles.some((f) => /[A-Za-z]*[Hh]ttp[Cc]lient\(\)|axios|fetch\(/.test(fs.readFileSync(f, 'utf8')));
  const hasTransform = files.some((f) => f.endsWith('transform.ts'));
  if (makesHttp && !hasTransform) {
    add('HR33', 'warn', 'api.ts makes HTTP calls but no data/transform.ts found — add an anti-corruption mapping layer');
  }
}

// ── checklist parsing ────────────────────────────────────────────────
interface Checklist { actIds: string[]; verifiedAct: number; totalAct: number; uiIds: string[]; verifiedUi: number; totalUi: number; brRows: string[]; verifiedSource: 'summary' | 'row-scan'; deferredActIds: string[]; }

function parseChecklist(file?: string): Checklist | null {
  if (!file || !fs.existsSync(file)) return null;
  const md = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  // §10.4 C3a + §10.9 C3b-i — fail-closed defer validation, run BEFORE any grab()/count loop so a
  // checklist that carries a MALFORMED row-level `<!-- DEFER: … -->` marker STOPs before a single
  // number is computed from it. parseRowDefer surfaces the marker; validateRowDefer throws
  // ChecklistDeferError on anchorless / predicate-less / anchor-not-locked (§10.5 T2/T3/T4);
  // validateRowDeferStamp throws on a missing capture-time stamp (§10.9 D9.3, T10). The lint() call
  // site (:561) converts either throw into an observable TIERB-DEFER error finding. Neither check
  // EXCLUDES a valid, stamped defer from the HR35 denominator / HR36 coverage set — that grab-path
  // wiring is C3b-ii, so a well-formed marker here is left counted (falls through untouched to grab
  // below).
  for (const ln of md.split('\n')) {
    if (!ln.includes('|')) continue;
    const d = parseRowDefer(ln);
    if (d) {
      validateRowDefer(d, LOCKED_ANCHORS);
      validateRowDeferStamp(d);
    }
  }
  const grab = (idRe: RegExp) => {
    const ids: string[] = [];
    for (const ln of md.split('\n')) {
      // Backend-only rows leave the FE coverage denominator (HR36): a row tagged
      // `<!-- enforced-by: BE -->` is not an FE-testable obligation, so it must not
      // be counted as uncovered. (audit F4 — prose said this; the script didn't.)
      if (/<!--\s*enforced-by:\s*BE/i.test(ln)) continue;
      // §10.9 D9.4 (C3b-ii) — a validly-deferred (unsatisfied-stamped) row is excluded from the
      // HR36 coverage set / HR35 denominator, same rationale as the BE skip above.
      if (isLineValidlyDeferred(ln)) continue;
      const m = ln.match(idRe);
      if (m && ln.includes('|')) ids.push(m[1]);
    }
    return [...new Set(ids)]; // unique IDs (a row should appear once; dedupe defends against stray refs)
  };
  const actIds = grab(/\b(ACT-[\w.]+)\b/);
  const uiIds = grab(/\b(UI-[\w.]+)\b/);

  // §10.9 D9.5 — HR36 defer-coverage: ids that carry a CURRENTLY valid (unsatisfied-stamped) defer,
  // collected separately from grab() (which already excludes these rows) so checkAcCoverage can
  // flag one that turns out to be already covered by a real test (a false defer claim).
  const deferredActIds: string[] = [];
  // §10.9 C3c — Summary-path (verifiedSource='summary') denominator+numerator exclusion. countChecklistSection
  // (playwright-runner.ts) counts ✅/total per-section blind to defer markers, so a valid defer's row is
  // still in the disk-written `✅ X/Y`. Denominator: subtract deferredActIds.length/deferredUiIds.length
  // from sAct.total/sUi.total below. Numerator: countChecklistSection's `pass` check is whole-line
  // `l.includes('✅')` (playwright-runner.ts:692), not final-cell — a valid defer whose evidence cell
  // carries a stray ✅ (e.g. a stale pass stamp from before it was deferred; T11's ACT-06 fixture proves
  // this shape) is wrongly counted as verified on disk. Mirror that exact whole-line check here so the
  // subtraction cancels precisely what countChecklistSection wrongly added — final-cell-only would miss it.
  let deferredActVerifiedCount = 0;
  const deferredUiIds: string[] = [];
  let deferredUiVerifiedCount = 0;
  for (const ln of md.split('\n')) {
    if (!ln.includes('|') || !isLineValidlyDeferred(ln)) continue;
    const mAct = ln.match(/\b(ACT-[\w.]+)\b/);
    if (mAct) { deferredActIds.push(mAct[1]); if (ln.includes('✅')) deferredActVerifiedCount += 1; }
    const mUi = ln.match(/\b(UI-[\w.]+)\b/);
    if (mUi) { deferredUiIds.push(mUi[1]); if (ln.includes('✅')) deferredUiVerifiedCount += 1; }
  }

  // Authoritative verified counts come from the `## Summary` section, NOT a row-level ✅ scan
  // (rows carry ✅ in evidence columns while their final Status is still ⬜ — counting those over-reports).
  // Both numerator AND denominator must come from the same `✅ X/Y` so the ratio stays ≤ 100%.
  // Format: `Total UI rows: **31** — ✅ 9/31 ...`
  const summaryPair = (label: RegExp): { verified: number; total: number } | null => {
    for (const ln of md.split('\n')) {
      if (label.test(ln)) {
        const m = ln.match(/✅\s*(\d+)\s*\/\s*(\d+)/);
        if (m) return { verified: Number(m[1]), total: Number(m[2]) };
      }
    }
    return null;
  };
  const sUi = summaryPair(/Total\s+UI\s+rows/i);
  const sAct = summaryPair(/Total\s+ACT\s+rows/i);
  const verifiedSource: 'summary' | 'row-scan' = (sUi !== null || sAct !== null) ? 'summary' : 'row-scan';
  // fallback row-scan: count rows whose FINAL cell (after last `|`) holds a ✅
  const finalCellVerified = (idRe: RegExp): number => {
    let ok = 0;
    for (const ln of md.split('\n')) {
      if (!ln.includes('|') || !idRe.test(ln)) continue;
      // §10.2 D2 (4th asymmetry): grab and brRows already drop backend-only rows; this reader did
      // not, so a BE row carrying a ✅ in its evidence cell was counted as FE-verified.
      if (/<!--\s*enforced-by:\s*BE/i.test(ln)) continue;
      // §10.9 D9.4 (C3b-ii) — same 4th-asymmetry class: a validly-deferred row's evidence cell
      // (e.g. a stray ✅) must not count toward the HR35 numerator either.
      if (isLineValidlyDeferred(ln)) continue;
      const cells = ln.split('|');
      const last = cells[cells.length - 2] || cells[cells.length - 1] || '';
      if (/✅|✔/.test(last)) ok += 1;
    }
    return ok;
  };
  // total = Summary's reported row count (consistent denominator), else unique-id count
  const act = {
    ids: actIds,
    ok: sAct ? sAct.verified - deferredActVerifiedCount : finalCellVerified(/\bACT-[\w.]+\b/),
    total: sAct ? sAct.total - deferredActIds.length : actIds.length,
  };
  const ui = {
    ids: uiIds,
    ok: sUi ? sUi.verified - deferredUiVerifiedCount : finalCellVerified(/\bUI-[\w.]+\b/),
    total: sUi ? sUi.total - deferredUiIds.length : uiIds.length,
  };
  // Business/display-rule rows (HR34). Locale-robust detection (audit F7): the strongest signal
  // is language-independent — an explicit `BR-` id or a `Unit Test` tool cell. Keyword-sniffing
  // is only a fallback and now covers VI/JP as well as EN, because the prior EN-only set silently
  // missed Vietnamese/Japanese display rules → untested formatting logic shipped with a green gate.
  const brRe = /\b(REQ-[\w.]+|ACT-[\w.]+|BR-?[\w.]+)\b/;
  const brKw = /(round|format|decimal|last[- ]attempt|rank|weight|K\/M|significant|threshold|immutab|N\/A|graded|làm\s*tròn|định\s*dạng|thập\s*phân|trọng\s*số|chữ\s*số|ngưỡng|四捨五入|丸め|フォーマット|書式|小数|重み|しきい値)/i;
  const isUnitTestRow = (s: string) => /\bunit\s*test\b/i.test(s);
  const brRows: string[] = [];
  for (const ln of md.split('\n')) {
    if (!ln.includes('|')) continue;
    if (/<!--\s*enforced-by:\s*BE/i.test(ln)) continue; // backend-only rows are not FE obligations
    if (isLineValidlyDeferred(ln)) continue; // §10.9 D9.4 (C3b-ii) — validly-deferred rows are not FE obligations yet either
    const m = ln.match(brRe);
    if (!m) continue;
    if (/\bBR-/.test(m[1]) || isUnitTestRow(ln) || brKw.test(ln)) brRows.push(m[1]);
  }
  return {
    actIds: act.ids, verifiedAct: act.ok, totalAct: act.total, uiIds: ui.ids, verifiedUi: ui.ok, totalUi: ui.total, brRows, verifiedSource, deferredActIds,
  };
}

// ── ux-states + jest test id collection ──────────────────────────────
function nonEmpty(v: unknown): boolean { return v != null && String(v).trim() !== ''; }

// A tautological assertion proves nothing (e.g. `expect(true).toBe(true)`, `expect(1).toBe(1)`).
const LIT = "(true|false|-?\\d+(?:\\.\\d+)?|'[^']*'|\"[^\"]*\")";
function tautologicalLine(ln: string): boolean {
  if (/\bexpect\(\s*true\s*\)\s*\.\s*toBeTruthy\(\)/.test(ln)) return true;
  if (/\bexpect\(\s*false\s*\)\s*\.\s*toBeFalsy\(\)/.test(ln)) return true;
  const m = ln.match(new RegExp(`\\bexpect\\(\\s*${LIT}\\s*\\)\\s*\\.\\s*(?:toBe|toEqual|toStrictEqual)\\(\\s*${LIT}\\s*\\)`));
  return !!m && m[1] === m[2]; // same literal both sides → tautology
}
// Returns whether the test text has any expect(), and how many are NON-tautological (meaningful).
function analyzeTest(txt: string): { hasExpect: boolean; meaningful: number } {
  let total = 0; let trivial = 0;
  for (const ln of txt.split('\n')) {
    const n = (ln.match(/\bexpect\s*\(/g) || []).length;
    if (n === 0) continue;
    total += n;
    if (tautologicalLine(ln)) trivial += n;
  }
  return { hasExpect: total > 0, meaningful: total - trivial };
}

// Returns AC ids whose backing test has SUBSTANCE (anti-fake-test):
//   ac_assertion counts only with a non-empty `expected`; unit_test only with `grep`/`test_file`;
//   a *.test.ts reference counts only if that file actually has an `expect(`.
// Hollow backings are reported via HR36/quality findings rather than silently crediting coverage.
function collectTestedAcIds(uxFile: string | undefined, files: string[]): Set<string> {
  const ids = new Set<string>();
  if (uxFile && fs.existsSync(uxFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(uxFile, 'utf8'));
      const states = [...(j.states || []), ...(j.negative_states || [])];
      states.forEach((s: any) => (s.ac_assertions || []).forEach((x: any) => {
        if (!x?.ac_id) return;
        if (nonEmpty(x.expected)) ids.add(String(x.ac_id));
        else add('HR36', 'error', `ac_assertion for ${x.ac_id} has no \`expected\` — hollow assertion does not count as coverage`);
      }));
      (j.unit_tests || []).forEach((u: any) => {
        if (!u?.ac_id) return;
        if (nonEmpty(u.grep) || nonEmpty(u.test_file)) ids.add(String(u.ac_id));
        else add('HR36', 'error', `unit_test for ${u.ac_id} has no \`grep\`/\`test_file\` — does not count as coverage`);
      });
    } catch (e) { add('HR36', 'warn', `ux-states.json parse failed: ${(e as Error).message}`); }
  }
  // an ACT-id referenced in a *.test.ts(x) counts ONLY if that file has a MEANINGFUL (non-tautological) assertion
  const testFiles = files.filter((f) => /\.test\.tsx?$/.test(f));
  const re = /\b(ACT-[\w.]+)\b/g;
  for (const f of testFiles) {
    const txt = fs.readFileSync(f, 'utf8');
    const meaningful = analyzeTest(txt).meaningful > 0;
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(txt))) { if (meaningful) ids.add(m[1]); }
  }
  return ids;
}

// ── anti-fake-test: every test file must contain a real assertion ────
function checkTestQuality(files: string[]) {
  const testFiles = files.filter((f) => /\.test\.tsx?$/.test(f));
  if (testFiles.length === 0) return;
  let bad = 0;
  for (const f of testFiles) {
    const { hasExpect, meaningful } = analyzeTest(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(process.cwd(), f);
    if (!hasExpect) { bad += 1; add('test-quality', 'error', `placeholder test (no expect()): ${rel}`); } else if (meaningful === 0) { bad += 1; add('test-quality', 'error', `tautological assertions only (e.g. expect(true).toBe(true)) — proves nothing: ${rel}`); }
  }
  if (bad === 0) add('test-quality', 'warn', `${testFiles.length} test file(s), all contain meaningful assertions ✅`);
}

// ── HR34 — business rules → utils + test ─────────────────────────────
function checkBusinessRules(folder: string, cl: Checklist | null, files: string[]) {
  if (!cl || cl.brRows.length === 0) return;
  const utilTests = files.filter((f) => /[\\/]utils[\\/].*\.test\.tsx?$/.test(f));
  if (utilTests.length === 0) {
    add('HR34', 'error', `${cl.brRows.length} business/display-rule row(s) in checklist (${cl.brRows.join(', ')}) but no utils/*.test.ts — implement as a tested pure fn or mark <!-- enforced-by: BE -->`);
  } else {
    add('HR34', 'warn', `${cl.brRows.length} BR row(s); ${utilTests.length} util test file(s) present ✅`);
  }
}

// ── HR36 — full AC coverage ──────────────────────────────────────────
function checkAcCoverage(cl: Checklist | null, tested: Set<string>) {
  if (!cl) { add('HR36', 'warn', 'no checklist.md — cannot verify AC coverage'); return; }
  // §10.9 D9.5 — a defer that resolves NO real gap (its row is already covered by a real test) is a
  // false claim: the marker should have been removed, not left in place. Runs BEFORE the "0 ACT
  // rows" early-return below: a checklist whose only row(s) are all validly-deferred has an EMPTY
  // actIds (2b excludes them), which must not suppress this check. Excluded (2b) and flagged (here)
  // are mutually exclusive — a defer only reaches here if it's in `tested`, i.e. covered.
  for (const id of cl.deferredActIds) {
    if (tested.has(id)) {
      add('HR36', 'error', `defer on ${id} resolves no real gap — row is already covered by a test; remove the DEFER marker (§10.9 D9.5)`);
    }
  }
  if (cl.actIds.length === 0) { add('HR36', 'warn', 'checklist has 0 ACT rows'); return; }
  const uncovered = cl.actIds.filter((id) => !tested.has(id));
  const pct = Math.round(((cl.actIds.length - uncovered.length) / cl.actIds.length) * 100);
  if (uncovered.length === 0) {
    add('HR36', 'warn', `AC coverage 100% (${cl.actIds.length}/${cl.actIds.length}) ✅`);
  } else {
    add('HR36', 'error', `AC coverage ${pct}% — ${uncovered.length}/${cl.actIds.length} ACT rows have NO test (e2e ac_assertion or unit): ${uncovered.join(', ')}`);
  }
}

// ── HR35 — verified ratio ────────────────────────────────────────────
function checkVerifiedRatio(cl: Checklist | null, min: number) {
  if (!cl) return;
  const total = cl.totalUi + cl.totalAct;
  if (total === 0) return;
  const ok = Math.min(cl.verifiedAct + cl.verifiedUi, total); // clamp — never report > 100%
  const ratio = ok / total;
  const msg = `verified ${ok}/${total} (UI ${cl.verifiedUi}/${cl.totalUi} · ACT ${cl.verifiedAct}/${cl.totalAct}) = ${Math.round(ratio * 100)}% [src: ${cl.verifiedSource}]`;
  if (ratio < min) add('HR35', 'error', `${msg} — below min ${Math.round(min * 100)}%; B12 must not claim "done" without explicit user ack`);
  else add('HR35', 'warn', `${msg} ✅`);
}

// ── quality: no any / console ────────────────────────────────────────
function checkQuality(files: string[]) {
  const reAny = /:\s*any\b|<any>|\bas any\b/;
  const reConsole = /console\.(log|debug)\(/;
  const reDeep = /\.\.\/\.\.\/\.\.\//;
  let anyHits = 0; let consoleHits = 0; let deepHits = 0;
  for (const f of files) {
    if (/\.test\.tsx?$/.test(f)) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((ln) => {
      if (reAny.test(ln)) anyHits += 1;
      if (reConsole.test(ln)) consoleHits += 1;
      if (reDeep.test(ln)) deepHits += 1;
    });
  }
  if (anyHits) add('quality', 'error', `${anyHits} \`any\` usage(s) in feature folder`);
  if (consoleHits) add('quality', 'error', `${consoleHits} console.log/debug call(s) in feature folder`);
  if (deepHits) add('quality', 'error', `${deepHits} deep cross-feature import(s) (../../../) — use the @src/ alias`);
  if (!anyHits && !consoleHits && !deepHits) add('quality', 'warn', 'no any / console / deep-import ✅');
}

// ── W.2: ban i18n string-surgery (formatMessage(...).replace(...)) ─────
// Patching a translated string at runtime means a wrong message key was
// reused; add the real message descriptor instead. (root cause of the
// truncated "Number of students" Y-axis label in AnalyzeData.)
function checkI18nStringSurgery(files: string[]) {
  const re = /formatMessage\([^)]*\)\s*\.replace\(/;
  let hits = 0;
  for (const f of files) {
    if (/\.test\.tsx?$/.test(f)) continue;
    fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((ln, i) => {
      const t = ln.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (re.test(ln)) {
        hits += 1;
        add('W2', 'error', `i18n string-surgery (formatMessage(...).replace) → add a real message descriptor: ${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    });
  }
  if (hits === 0) add('W2', 'warn', 'no i18n string-surgery ✅');
}

// ── W.2: warn on excessive inline layout styles (use the .scss + tokens) ─
function checkInlineLayoutStyle(files: string[]) {
  const LAYOUT = /(display|flex|grid|width|height|padding|margin|gap)\s*:/;
  const THRESHOLD = 6;
  for (const f of files) {
    if (!f.endsWith('.tsx') || /\.test\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const blocks = src.match(/style=\{\{[^}]+\}\}/g) ?? [];
    const layoutBlocks = blocks.filter((b) => LAYOUT.test(b)).length;
    if (layoutBlocks > THRESHOLD) {
      add('W2', 'warn', `${layoutBlocks} inline layout-style blocks (> ${THRESHOLD}) — move section layout to the co-located .scss using visual-properties.md tokens: ${path.relative(process.cwd(), f)}`);
    }
  }
}

// ── W.3: ban hand-rolled UI-library modal classnames ──────────────────
// Applying the framework's modal CSS classes without its portal component
// renders the dialog in-flow (top-left, no backdrop). Use the UI library's
// proper modal component instead. (root cause of the broken delete popup.)
function checkHandRolledModal(files: string[]) {
  const re = /className=["'`][^"'`]*(app-modal|__modal-backdrop)/;
  let hits = 0;
  for (const f of files) {
    if (!f.endsWith('.tsx') || /\.test\.tsx?$/.test(f)) continue;
    fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').forEach((ln, i) => {
      if (re.test(ln)) {
        hits += 1;
        add('W3', 'error', `hand-rolled modal classname → use the UI library's <ModalDialog>/<AlertModal> portal component, not raw modal CSS classes: ${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    });
  }
  if (hits === 0) add('W3', 'warn', 'no hand-rolled modal classnames ✅');
}

// ── L-05: literal chart value: 0 in a data.map() transform ──────────
// A chart data mapper that sets `value: 0` unconditionally hides all bars.
// Values in chart data.map() must be derived from the data item, never a literal 0
// (unless it is a documented sentinel value with a comment explaining the intent).
function checkLiteralChartValueZero(files: string[]) {
  const reValue = /\bvalue\s*:\s*0\b/;
  const reMap = /\.map\s*\(/;
  let hits = 0;
  for (const f of files) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (!reValue.test(lines[i])) continue;
      const start = Math.max(0, i - 15);
      const end = Math.min(lines.length - 1, i + 15);
      const context = lines.slice(start, end + 1).join('\n');
      if (reMap.test(context)) {
        hits += 1;
        add('L05', 'error', `literal value: 0 inside a data.map() transform — chart values must be derived, not hardcoded: ${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    }
  }
  if (hits === 0) add('L05', 'warn', 'no literal chart value: 0 in map transforms ✅');
}

// ── W.7: flag duplicate render of the same domain array (double-list smell) ─
// A dotted domain accessor (e.g. `question.answers`) mapped to JSX ≥2 times in
// one component is the static fingerprint of "chart + sibling list" duplication
// (the W-l Exam Details divergence). Warn — some double-maps are legitimate.
function checkDuplicateDataRender(files: string[]) {
  const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\.map\(/g;
  for (const f of files) {
    if (!f.endsWith('.tsx') || /\.test\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const counts = new Map<string, number>();
    let m: RegExpExecArray | null = re.exec(src);
    while (m !== null) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      m = re.exec(src);
    }
    for (const [id, n] of counts) {
      if (n >= 2) {
        add('W7', 'warn', `'${id}' is .map()'d ${n}× in one component — possible duplicate render (chart + sibling list smell): ${path.relative(process.cwd(), f)}`);
      }
    }
  }
}

// ── L-03: modal close selector type mismatch ────────────────────────
// A footer-button selector (button:has-text('Cancel')) used to close a display/info modal
// (which has only an X button, no Footer/ActionRow) will fail silently and leave the modal
// open, intercepting all subsequent pointer events — cascading to every downstream assertion.
function checkModalCloseSelector(uxFile: string | undefined, files: string[]) {
  if (!uxFile || !fs.existsSync(uxFile)) return;
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(uxFile, 'utf8')); } catch { return; }

  const FOOTER_BTN_RE = /button:has-text\s*\(\s*['"](?:Cancel|Close|No|Yes|OK|Confirm)['"]\s*\)/i;
  const allSteps: any[] = [
    ...(doc.states ?? []).flatMap((s: any) => s.steps ?? []),
    ...(doc.negative_states ?? []).flatMap((s: any) => s.steps ?? []),
  ];
  const footerStep = allSteps.find((step: any) =>
    step.action === 'click' && typeof step.selector === 'string' && FOOTER_BTN_RE.test(step.selector),
  );
  if (!footerStep) {
    add('L03', 'warn', 'no footer-button close selectors in ux-states ✅');
    return;
  }
  for (const f of files) {
    if (!f.endsWith('.tsx') || /\.test\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (!/ModalDialog|<Modal[\s>]/.test(src)) continue;
    if (!/Footer|ActionRow/.test(src)) {
      add('L03', 'warn', `ux-states uses footer-button close selector "${footerStep.selector}" but ${path.relative(process.cwd(), f)} has no Footer/ActionRow — confirm modal type; wrong close selector cascades to all downstream assertions`);
      return;
    }
  }
  add('L03', 'warn', 'footer-button close selector: modal has Footer/ActionRow ✅');
}

// ── W.2b: i18n case drift in ux-states text: assertions ─────────────
// A text: assertion that uses spec prose or title case instead of the actual
// defaultMessage value (after .toUpperCase()/.toLowerCase() transforms applied
// at the render site) will fail at B11. Read messages.ts verbatim.
function checkI18nCaseDrift(uxFile: string | undefined, files: string[]) {
  if (!uxFile || !fs.existsSync(uxFile)) return;
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(uxFile, 'utf8')); } catch { return; }

  const textAssertions: string[] = [];
  [...(doc.states ?? []), ...(doc.negative_states ?? [])].forEach((s: any) =>
    (s.ac_assertions ?? []).forEach((a: any) => {
      if (typeof a.expected === 'string' && a.expected.startsWith('text:')) {
        textAssertions.push(a.expected.slice(5).trim());
      }
    }),
  );
  if (textAssertions.length === 0) return;

  const msgFiles = files.filter((f) => f.endsWith('messages.ts') || f.endsWith('messages.tsx'));
  if (msgFiles.length === 0) return;

  const defaultMessages: string[] = [];
  for (const f of msgFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /defaultMessage\s*:\s*['"`]([^'"`]+)['"`]/g;
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(src)) !== null) defaultMessages.push(m[1]);
  }
  if (defaultMessages.length === 0) return;

  let driftCount = 0;
  for (const assertion of textAssertions) {
    const aTrim = assertion.trim();
    // Accept exact | after trim | after toUpperCase | after toLowerCase | trim+upper | trim+lower.
    // Full case-fold (toLowerCase both sides) is intentionally omitted — it would mask title-case drift.
    const matched = defaultMessages.some((dm) =>
      dm === assertion || dm.trim() === aTrim ||
      dm.toUpperCase() === assertion || dm.toLowerCase() === assertion ||
      dm.trim().toUpperCase() === aTrim || dm.trim().toLowerCase() === aTrim,
    );
    if (!matched) {
      driftCount += 1;
      add('W2', 'warn', `i18n case drift: text: assertion "${assertion.slice(0, 60)}" cannot be traced to a verbatim defaultMessage value (after case/trim transforms) — read messages.ts and check for .toUpperCase()/.toLowerCase() at render site`);
    }
  }
  if (driftCount === 0) add('W2', 'warn', `all ${textAssertions.length} text: assertion(s) traced to a defaultMessage value ✅`);
}

// ── learned rules (from learned-config.ts, promoted by verified amendments) ──
// A loading/error state is detected by name/screen keyword on any state or
// negative_state. These rules are OFF by default and only turn on after repeated
// user feedback is verified, so they never affect features authored before then.
export function hasUxStateKind(doc: UxStatesDoc | null, kind: 'loading' | 'error'): boolean {
  if (!doc) return false;
  const kw = kind === 'loading' ? /loading|spinner|skeleton/i : /error|fail|empty/i;
  const states = [...(doc.states ?? []), ...(doc.negative_states ?? [])];
  return states.some((s) => kw.test(String(s?.name ?? '')) || kw.test(String(s?.screen ?? '')));
}

/** Pure: findings for the learned UX-state requirements. Testable without IO. */
export function requiredUxStateFindings(
  cfg: Pick<LearnedConfig, 'requireLoadingState' | 'requireErrorState'>,
  doc: UxStatesDoc | null,
  uxFilePresent: boolean,
): Finding[] {
  const out: Finding[] = [];
  if (!cfg.requireLoadingState && !cfg.requireErrorState) return out;
  if (!uxFilePresent || !doc) {
    out.push({ rule: 'learned', level: 'error', msg: 'learned-config requires UX states but ux-states.json is missing or malformed' });
    return out;
  }
  if (cfg.requireLoadingState && !hasUxStateKind(doc, 'loading')) {
    out.push({ rule: 'learned', level: 'error', msg: 'learned rule (verified from repeated user feedback): a loading state is required in ux-states.json but none was found' });
  }
  if (cfg.requireErrorState && !hasUxStateKind(doc, 'error')) {
    out.push({ rule: 'learned', level: 'error', msg: 'learned rule (verified from repeated user feedback): an error state is required in ux-states.json but none was found' });
  }
  if (out.length === 0) out.push({ rule: 'learned', level: 'warn', msg: 'learned UX-state requirement(s) satisfied ✅' });
  return out;
}

function checkLearnedUxStates(uxFile?: string) {
  const cfg = loadConfig();
  if (!cfg.requireLoadingState && !cfg.requireErrorState) return; // default-off → no-op
  const present = !!uxFile && fs.existsSync(uxFile);
  const doc = present ? parseUxStates(fs.readFileSync(uxFile!, 'utf8')) : null;
  for (const f of requiredUxStateFindings(cfg, doc, present)) findings.push(f);
}

/** Pure entry point — returns findings for the given args. Safe to call repeatedly (resets state). */
export function lint(args: Args): Finding[] {
  findings.length = 0;
  const files = walk(args.folder, ['.ts', '.tsx']);

  // Always run code-quality checks (usable at B10 in a worktree, no checklist needed).
  checkBlindCast(files, args.responseTransform);
  checkTransformLayer(args.folder, files);
  checkTestQuality(files);
  checkQuality(files);
  checkI18nStringSurgery(files);
  checkInlineLayoutStyle(files);
  checkHandRolledModal(files);
  checkDuplicateDataRender(files);
  checkLiteralChartValueZero(files);

  // Spec-coupled checks (checklist + ux-states) — skipped in --code-only mode.
  if (!args.codeOnly) {
    // §10.4 C3a — reader-side catch (scoped to the checklist parse). A malformed row-level defer
    // STOPs as an observable, gate-failing TIERB-DEFER error (via :585/:602), NEVER an uncaught crash.
    // Mirrors the runner's ChecklistLayoutError handling (playwright-runner.ts:1605) — but on the
    // LINTER path, which the probe confirmed is a DIFFERENT code path the runner's catch never sees.
    // On STOP, cl is left null; the downstream HR checks already guard `if (!cl)` (:260/:271/:284), so
    // no count is produced from a checklist carrying a bad defer.
    let cl: Checklist | null;
    try {
      cl = parseChecklist(args.checklist);
    } catch (e) {
      if (e instanceof ChecklistDeferError) { add('TIERB-DEFER', 'error', `Tier B: checklist defer STOP (${e.verdict})`); cl = null; }
      else throw e;
    }
    const tested = collectTestedAcIds(args.uxStates, files);
    checkBusinessRules(args.folder, cl, files);
    checkAcCoverage(cl, tested);
    checkVerifiedRatio(cl, args.minVerified);
    checkLearnedUxStates(args.uxStates);
    checkModalCloseSelector(args.uxStates, files);
    checkI18nCaseDrift(args.uxStates, files);
  }
  return [...findings];
}

/** Pure exit-code decision: fail (1) only under --gate with ≥1 error; otherwise 0. */
export function gateExitCode(args: Pick<Args, 'gate'>, errorCount: number): number {
  return args.gate && errorCount > 0 ? 1 : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.folder) {
    console.error('usage: lint-feature.ts <feature-folder> [--checklist <md>] [--ux-states <json>] [--response-transform <fn>] [--min-verified 0.6] [--gate] [--json] [--code-only]');
    process.exit(2);
  }
  const result = lint(args);
  const errors = result.filter((f) => f.level === 'error');
  const warns = result.filter((f) => f.level === 'warn');

  if (args.json) {
    console.log(JSON.stringify({ folder: args.folder, errors: errors.length, warnings: warns.length, findings: result }, null, 2));
  } else {
    console.log(`\nlint-feature · ${args.folder}`);
    console.log('─'.repeat(60));
    for (const f of result) {
      // error → ❌; a passing check (msg ends with ✅) → ✅; an actual warning → ⚠️
      const icon = f.level === 'error' ? '❌' : (f.msg.includes('✅') ? '✅' : '⚠️');
      console.log(`${icon} [${f.rule}] ${f.msg}`);
    }
    console.log('─'.repeat(60));
    console.log(`${errors.length} error(s), ${warns.length} ok/info\n`);
  }

  process.exit(gateExitCode(args, errors.length));
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && /lint-feature\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
