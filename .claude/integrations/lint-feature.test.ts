/**
 * Tests for lint-feature.ts — so the tool that enforces tests is itself tested.
 *
 * Standalone, no jest (the project's jest scopes to src/). Run:
 *   npx tsx .claude/integrations/lint-feature.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 *
 * Strategy: build throwaway fixture features in a temp dir, call lint() directly, assert findings.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { lint, parseArgs, gateExitCode, Args, requiredUxStateFindings, hasUxStateKind } from './lint-feature';
import { countChecklistSection, updateChecklistRows } from './playwright-runner';
import type { UxStatesDoc } from './ux-states';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-feature-test-'));
function write(rel: string, content: string) {
  const full = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}
function args(folder: string, over: Partial<Args> = {}): Args {
  return {
    folder, responseTransform: 'transformResponse', minVerified: 0.6, gate: false, json: false, codeOnly: false, ...over,
  };
}
const has = (f: ReturnType<typeof lint>, rule: string, sub = '') => f.some((x) => x.rule === rule && x.level === 'error' && x.msg.includes(sub));

// ── Fixture 1: clean feature → code-only should be 0 errors ──────────
const clean = 'clean-feature';
write(`${clean}/data/transform.ts`, 'export const mapFoo = (raw) => raw;\n'); // pass-through (HR33 #4), no `any`
write(`${clean}/data/api.ts`, [
  "import { yourHttpClient } from '@your-org/http-client';",
  "import { transformResponse } from '@your-org/http-client';",
  "import { mapFoo } from './transform';",
  'export const getFoo = async () => {',
  "  const { data } = await yourHttpClient().get('/api/foo');",
  '  return mapFoo(transformResponse(data));',
  '};',
  '',
].join('\n'));
write(`${clean}/utils/format.test.ts`, "it('ACT-01 formats', () => { expect(Math.round(1.4)).toBe(1); });\n"); // meaningful assertion

test('clean feature → code-only has 0 errors', () => {
  const f = lint(args(path.join(tmpRoot, clean), { codeOnly: true }));
  const errors = f.filter((x) => x.level === 'error');
  assert(errors.length === 0, `expected 0 errors, got ${errors.length}: ${errors.map((e) => e.rule).join(',')}`);
});

// ── Fixture 2: dirty feature → catches all code-quality violations ───
const dirty = 'dirty-feature';
write(`${dirty}/data/api.ts`, [
  "import { transformResponse } from '@your-org/http-client';",
  "import { yourHttpClient } from '@your-org/http-client';",
  "import y from '../../../shared/y';",          // deep import
  'export const getBar = async (data: any) => {', // any
  "  console.log('debug', y);",                    // console
  "  await yourHttpClient().get('/api/bar');",      // makes HTTP → transform.ts expected (but absent)
  '  return transformResponse(data) as Bar;',        // blind cast (HR33)
  '};',
  '',
].join('\n'));
write(`${dirty}/utils/empty.test.ts`, "it('does nothing', () => {});\n"); // placeholder, no expect

test('dirty feature → HR33 blind cast caught', () => {
  const f = lint(args(path.join(tmpRoot, dirty), { codeOnly: true }));
  assert(has(f, 'HR33', 'blind cast'), 'expected HR33 blind-cast error');
});
test('dirty feature → quality catches any / console / deep import', () => {
  const f = lint(args(path.join(tmpRoot, dirty), { codeOnly: true }));
  assert(has(f, 'quality', '`any`'), 'expected `any` error');
  assert(has(f, 'quality', 'console'), 'expected console error');
  assert(has(f, 'quality', 'deep cross-feature'), 'expected deep-import error');
});
test('dirty feature → anti-fake-test catches placeholder test', () => {
  const f = lint(args(path.join(tmpRoot, dirty), { codeOnly: true }));
  assert(has(f, 'test-quality', 'placeholder'), 'expected placeholder-test error');
});
// A `transformResponse(data) as Type` inside a COMMENT must not be flagged (false-positive guard).
const cmt = 'comment-feature';
write(`${cmt}/data/transform.ts`, 'export const mapX = (raw) => raw;\n');
write(`${cmt}/data/api.ts`, [
  '// docs: every response goes through mapX() — never `transformResponse(data) as Type`',
  "import { transformResponse } from '@your-org/http-client';",
  "import { yourHttpClient } from '@your-org/http-client';",
  "import { mapX } from './transform';",
  'export const getX = async () => {',
  "  const { data } = await yourHttpClient().get('/api/x');",
  '  return mapX(transformResponse(data));',
  '};',
  '',
].join('\n'));
test('blind-cast pattern inside a comment is NOT flagged (no false positive)', () => {
  const f = lint(args(path.join(tmpRoot, cmt), { codeOnly: true }));
  assert(!has(f, 'HR33', 'blind cast'), 'comment example must not trip HR33');
});

test('dirty feature → transform.ts absence is a warning, not crash', () => {
  const f = lint(args(path.join(tmpRoot, dirty), { codeOnly: true }));
  assert(f.some((x) => x.rule === 'HR33' && x.level === 'warn' && x.msg.includes('no data/transform.ts')), 'expected transform-missing warning');
});

// ── Fixture: locale-robust business-rule detection (audit F7) ────────
// A Vietnamese rounding rule with NO English keyword must still require a utils test (HR34),
// via the language-independent `Unit Test` tool cell AND the VI keyword set.
const vi = 'vi-rule-feature';
write(`${vi}/data/api.ts`, 'export const v = 1;\n'); // no utils/*.test.ts on purpose
const viChecklist = write(`${vi}/checklist.md`, [
  '## ACT — Acceptance Test Cases',
  '| # | Test | Tool | Status |',
  '|---|------|------|--------|',
  '| ACT-01 | Điểm hiển thị làm tròn 1 chữ số thập phân | Unit Test | ⬜ |',
  '',
  '## Summary',
  '- Total UI rows: **0** — ✅ 0/0',
  '- Total ACT rows: **1** — ✅ 0/1',
  '',
].join('\n'));
test('Vietnamese display-rule row (no EN keyword) still triggers HR34 utils-test requirement', () => {
  const f = lint(args(path.join(tmpRoot, vi), { checklist: viChecklist }));
  assert(has(f, 'HR34', 'business/display-rule'), 'expected HR34 error: VI rounding rule needs a utils test');
});

// ── Fixture 3: coverage + hollow assertion + verified ratio ──────────
const cov = 'cov-feature';
write(`${cov}/data/api.ts`, "export const x = 1;\n");
const checklist = write(`${cov}/checklist.md`, [
  '## ACT — Acceptance Test Cases',
  '| # | Test | Status |',
  '|---|------|--------|',
  '| ACT-01 | foo | ⬜ |',
  '| ACT-02 | bar | ⬜ |',
  '',
  '## Summary',
  '- Total UI rows: **0** — ✅ 0/0',
  '- Total ACT rows: **2** — ✅ 1/2',
  '',
].join('\n'));
const uxStates = write(`${cov}/ux-states.json`, JSON.stringify({
  feature: 'Cov',
  states: [{ ac_assertions: [
    { ac_id: 'ACT-01', selector: '.x', expected: 'visible' },
    { ac_id: 'ACT-02', selector: '.y', expected: '' }, // hollow — no expected
  ] }],
  negative_states: [],
  unit_tests: [],
}, null, 2));

test('coverage → HR36 flags uncovered + hollow ACT-02', () => {
  const f = lint(args(path.join(tmpRoot, cov), { checklist, uxStates }));
  assert(has(f, 'HR36', 'AC coverage'), 'expected HR36 coverage error (ACT-02 uncovered)');
  assert(has(f, 'HR36', 'ACT-02'), 'expected ACT-02 named as hollow/uncovered');
});
test('coverage → HR35 verified ratio from Summary (1/2 = 50% < 60%)', () => {
  const f = lint(args(path.join(tmpRoot, cov), { checklist, uxStates }));
  assert(has(f, 'HR35', '50%') && has(f, 'HR35', 'src: summary'), 'expected HR35 error at 50% from summary');
});
test('coverage checks are skipped in --code-only mode', () => {
  const f = lint(args(path.join(tmpRoot, cov), { checklist, uxStates, codeOnly: true }));
  assert(!f.some((x) => x.rule === 'HR36' || x.rule === 'HR35'), 'HR35/HR36 must not run in code-only mode');
});

// ── Fixture: backend-only ACT row leaves the FE coverage denominator (audit F4) ──
const be = 'be-feature';
write(`${be}/data/api.ts`, 'export const q = 1;\n');
const beChecklist = write(`${be}/checklist.md`, [
  '## ACT — Acceptance Test Cases',
  '| # | Test | Tool | Status |',
  '|---|------|------|--------|',
  '| ACT-01 | foo | Playwright | ⬜ |',
  '| ACT-02 | system auto-grade | BE | ⬜ | <!-- enforced-by: BE -->',
  '',
  '## Summary',
  '- Total UI rows: **0** — ✅ 0/0',
  '- Total ACT rows: **1** — ✅ 0/1',
  '',
].join('\n'));
const beUx = write(`${be}/ux-states.json`, JSON.stringify({
  feature: 'Be',
  states: [{ ac_assertions: [{ ac_id: 'ACT-01', selector: '.x', expected: 'visible' }] }],
  negative_states: [], unit_tests: [],
}, null, 2));
test('backend-only ACT row (enforced-by: BE) is excluded from the coverage denominator', () => {
  const f = lint(args(path.join(tmpRoot, be), { checklist: beChecklist, uxStates: beUx }));
  // ACT-01 covered; ACT-02 is BE-only → denominator = {ACT-01} → 100%, no HR36 coverage error.
  assert(!has(f, 'HR36', 'AC coverage'), 'BE row must not be counted as uncovered');
  assert(!has(f, 'HR36', 'ACT-02'), 'ACT-02 (BE) must not be named as uncovered');
});

// verified ratio must never exceed 100%, even if the Summary is malformed (verified > total)
const badCl = write(`${cov}/checklist-bad.md`, [
  '## ACT', '| ACT-01 | x | ⬜ |', '| ACT-02 | y | ⬜ |', '',
  '## Summary', '- Total UI rows: **0** — ✅ 0/0', '- Total ACT rows: **2** — ✅ 5/2', '',
].join('\n'));
test('HR35 verified ratio is clamped to ≤100% on a malformed Summary', () => {
  const f = lint(args(path.join(tmpRoot, cov), { checklist: badCl }));
  const hr35 = f.find((x) => x.rule === 'HR35');
  assert(!!hr35, 'expected an HR35 finding');
  const m = (hr35 as { msg: string }).msg.match(/=\s*(\d+)%/);
  assert(!!m && Number(m[1]) <= 100, `ratio must be ≤100, got: ${(hr35 as { msg: string }).msg}`);
});

// ── Fixture 4: tautological assertions (anti-fake, deeper) ───────────
const triv = 'trivial-feature';
write(`${triv}/data/api.ts`, 'export const z = 1;\n');
write(`${triv}/x.test.ts`, "it('ACT-09 noop', () => { expect(true).toBe(true); });\n"); // tautology only
const trivChecklist = write(`${triv}/checklist.md`, [
  '## ACT — Acceptance Test Cases', '| # | Test | Status |', '|---|------|--------|', '| ACT-09 | noop | ⬜ |', '',
  '## Summary', '- Total UI rows: **0** — ✅ 0/0', '- Total ACT rows: **1** — ✅ 0/1', '',
].join('\n'));

test('tautological-only test file → test-quality error', () => {
  const f = lint(args(path.join(tmpRoot, triv), { codeOnly: true }));
  assert(has(f, 'test-quality', 'tautological'), 'expected tautological-only error');
});
test('AC backed only by a tautological test is NOT credited as covered', () => {
  const f = lint(args(path.join(tmpRoot, triv), { checklist: trivChecklist }));
  assert(has(f, 'HR36', 'ACT-09'), 'ACT-09 should be reported uncovered (trivial test does not count)');
});

// ── parseArgs ────────────────────────────────────────────────────────
test('parseArgs — flags parsed', () => {
  const a = parseArgs(['feat', '--gate', '--code-only', '--min-verified', '0.8', '--checklist', 'c.md', '--ux-states', 'u.json', '--response-transform', 'toCamel', '--json']);
  assert(a.folder === 'feat', 'folder'); assert(a.gate === true, 'gate'); assert(a.codeOnly === true, 'codeOnly');
  assert(a.minVerified === 0.8, 'minVerified'); assert(a.checklist === 'c.md', 'checklist');
  assert(a.uxStates === 'u.json', 'uxStates'); assert(a.responseTransform === 'toCamel', 'responseTransform'); assert(a.json === true, 'json');
});
test('parseArgs — defaults', () => {
  const a = parseArgs(['feat']);
  assert(a.gate === false && a.codeOnly === false && a.json === false, 'bool defaults');
  assert(a.minVerified === 0.6, 'minVerified default'); assert(a.responseTransform === 'transformResponse', 'responseTransform default');
});

// ── exit-code decision (gateExitCode) ────────────────────────────────
test('gateExitCode — 1 only under --gate with errors', () => {
  assert(gateExitCode({ gate: true }, 3) === 1, 'gate + errors → 1');
  assert(gateExitCode({ gate: true }, 0) === 0, 'gate + no errors → 0');
  assert(gateExitCode({ gate: false }, 3) === 0, 'no gate → 0 even with errors');
});
test('end-to-end: dirty fixture under --gate would exit 1', () => {
  const f = lint(args(path.join(tmpRoot, dirty), { codeOnly: true, gate: true }));
  const errors = f.filter((x) => x.level === 'error').length;
  assert(gateExitCode({ gate: true }, errors) === 1, 'dirty + gate → exit 1');
});

// ── learned UX-state rules (promoted from verified amendments) ───────
const loadingDoc: UxStatesDoc = { states: [{ name: 'Loading', route: '/x' }, { name: 'Success', route: '/x' }] };
const errorDoc: UxStatesDoc = { states: [{ name: 'Success', route: '/x' }], negative_states: [{ name: 'Error', route: '/x' }] };
const bareDoc: UxStatesDoc = { states: [{ name: 'Success', route: '/x' }] };

test('hasUxStateKind — detects loading/error by name keyword', () => {
  assert(hasUxStateKind(loadingDoc, 'loading'), 'loading state detected');
  assert(!hasUxStateKind(bareDoc, 'loading'), 'no loading state in bare doc');
  assert(hasUxStateKind(errorDoc, 'error'), 'error state detected in negative_states');
  assert(!hasUxStateKind(bareDoc, 'error'), 'no error state in bare doc');
});

test('requiredUxStateFindings — off by default → no findings', () => {
  const f = requiredUxStateFindings({ requireLoadingState: false, requireErrorState: false }, bareDoc, true);
  assert(f.length === 0, 'default-off learned rules must not affect existing features');
});

test('requiredUxStateFindings — required-but-missing loading state → error', () => {
  const f = requiredUxStateFindings({ requireLoadingState: true, requireErrorState: false }, bareDoc, true);
  assert(f.some((x) => x.level === 'error' && /loading state is required/.test(x.msg)), 'must flag missing loading state');
});

test('requiredUxStateFindings — requirement satisfied → only a ✅ warn', () => {
  const f = requiredUxStateFindings({ requireLoadingState: true, requireErrorState: false }, loadingDoc, true);
  assert(!f.some((x) => x.level === 'error'), 'no error when loading state present');
  assert(f.some((x) => x.level === 'warn' && x.msg.includes('✅')), 'reports satisfied');
});

test('requiredUxStateFindings — required but ux-states.json missing → error', () => {
  const f = requiredUxStateFindings({ requireLoadingState: true, requireErrorState: false }, null, false);
  assert(f.some((x) => x.level === 'error' && /missing or malformed/.test(x.msg)), 'must flag missing ux-states.json');
});

// ── Fixture 5: W.2 i18n string-surgery + W.3 hand-rolled modal ───────
const wbad = 'w-bad-feature';
write(`${wbad}/data/api.ts`, 'export const w = 1;\n');
write(`${wbad}/components/Bad.tsx`, [
  "import { useIntl } from '@your-org/i18n';",
  'export const Bad = () => {',
  '  const intl = useIntl();',
  "  const label = intl.formatMessage(messages.noResults).replace('No results.', 'Number of students');",
  '  return (',
  '    <div className="app-modal-backdrop">',
  '      <div className="app-modal app-modal-sm">{label}</div>',
  '    </div>',
  '  );',
  '};',
  '',
].join('\n'));
test('W.2 → formatMessage(...).replace(...) is flagged', () => {
  const f = lint(args(path.join(tmpRoot, wbad), { codeOnly: true }));
  assert(has(f, 'W2', 'string-surgery'), 'expected W2 i18n string-surgery error');
});
test('W.3 → hand-rolled app-modal classname is flagged', () => {
  const f = lint(args(path.join(tmpRoot, wbad), { codeOnly: true }));
  assert(has(f, 'W3', 'hand-rolled modal'), 'expected W3 hand-rolled modal error');
});

// ── Fixture 6: W.2/W.3 clean component → no W2/W3 errors ─────────────
const wok = 'w-ok-feature';
write(`${wok}/data/api.ts`, 'export const w = 1;\n');
write(`${wok}/components/Ok.tsx`, [
  "import { Modal } from '@your-org/ui-lib';",
  "import { useIntl } from '@your-org/i18n';",
  'export const Ok = ({ isOpen, onClose }) => {',
  '  const intl = useIntl();',
  '  return (',
  '    <Modal isOpen={isOpen} onClose={onClose}>',
  '      <Modal.Body>{intl.formatMessage(messages.title)}</Modal.Body>',
  '    </Modal>',
  '  );',
  '};',
  '',
].join('\n'));
test('W.2/W.3 → clean ModalDialog component has no W2/W3 errors', () => {
  const f = lint(args(path.join(tmpRoot, wok), { codeOnly: true }));
  assert(!has(f, 'W2') && !has(f, 'W3'), 'clean component must not trip W2/W3');
});

// ── Fixture 7: W.7 duplicate-data-render (chart + sibling list smell) ──
const hasWarn = (f: ReturnType<typeof lint>, rule: string, sub = '') => f.some((x) => x.rule === rule && x.level === 'warn' && x.msg.includes(sub));
const wdup = 'w-dup-feature';
write(`${wdup}/data/api.ts`, 'export const w = 1;\n');
write(`${wdup}/components/Dup.tsx`, [
  'export const Dup = ({ question }) => (',
  '  <div>',
  '    {question.answers.map((a) => <span>{a.text}</span>)}',
  '    <Chart data={question.answers.map((a) => ({ v: a.n }))} />',
  '  </div>',
  ');',
  '',
].join('\n'));
test('W.7 → same domain array .map()d twice in one component is flagged (warn)', () => {
  const f = lint(args(path.join(tmpRoot, wdup), { codeOnly: true }));
  assert(hasWarn(f, 'W7', 'question.answers'), 'expected W7 duplicate-render warn for question.answers');
});
const wnodup = 'w-nodup-feature';
write(`${wnodup}/data/api.ts`, 'export const w = 1;\n');
write(`${wnodup}/components/NoDup.tsx`, [
  'export const NoDup = ({ question }) => (',
  '  <div>{question.answers.map((a) => <span>{a.text}</span>)}</div>',
  ');',
  '',
].join('\n'));
test('W.7 → a single .map() over a domain array is NOT flagged', () => {
  const f = lint(args(path.join(tmpRoot, wnodup), { codeOnly: true }));
  assert(!has(f, 'W7') && !hasWarn(f, 'W7'), 'single map must not trip W7');
});

// ── Fixture: L-05 literal chart value: 0 ──────────────────────────────
const chartBad = 'chart-bad-feature';
write(`${chartBad}/data/api.ts`, 'export const q = 1;\n');
write(`${chartBad}/components/Chart.tsx`, [
  'export const Chart = ({ data }) => {',
  '  const mapped = data.map((item) => ({',
  '    name: item.label,',
  '    value: 0,', // literal 0 inside .map() — L-05
  '  }));',
  '  return <BarChart data={mapped} />;',
  '};',
  '',
].join('\n'));
test('L-05 → literal value: 0 inside data.map() is flagged', () => {
  const f = lint(args(path.join(tmpRoot, chartBad), { codeOnly: true }));
  assert(has(f, 'L05', 'literal value: 0'), 'expected L05 error for hardcoded chart value');
});

const chartOk = 'chart-ok-feature';
write(`${chartOk}/data/api.ts`, 'export const q = 1;\n');
write(`${chartOk}/components/Chart.tsx`, [
  'export const Chart = ({ data }) => {',
  '  const mapped = data.map((item) => ({',
  '    name: item.label,',
  '    value: item.score,', // derived — OK
  '  }));',
  '  return <BarChart data={mapped} />;',
  '};',
  '',
].join('\n'));
test('L-05 → derived chart value is NOT flagged', () => {
  const f = lint(args(path.join(tmpRoot, chartOk), { codeOnly: true }));
  assert(!has(f, 'L05'), 'derived chart value must not trip L05');
});

const chartNoMap = 'chart-nomap-feature';
write(`${chartNoMap}/data/api.ts`, 'export const q = 1;\n');
write(`${chartNoMap}/components/Static.tsx`, [
  'export const Static = () => (',
  '  <div style={{ value: 0 }}>hello</div>',
  ');',
  '',
].join('\n'));
test('L-05 → value: 0 not inside a .map() context is NOT flagged', () => {
  const f = lint(args(path.join(tmpRoot, chartNoMap), { codeOnly: true }));
  assert(!has(f, 'L05'), 'value: 0 outside map context must not trip L05');
});

// ── Fixture: L-03 modal close selector type mismatch ─────────────────
const modalBad = 'modal-bad-feature';
write(`${modalBad}/data/api.ts`, 'export const q = 1;\n');
write(`${modalBad}/components/InfoModal.tsx`, [
  "import { ModalDialog } from '@your-org/ui-lib';",
  'export const InfoModal = ({ isOpen, onClose }) => (',
  '  <ModalDialog isOpen={isOpen} hasCloseButton onClose={onClose}>',
  '    <ModalDialog.Body>Content here</ModalDialog.Body>',
  '  </ModalDialog>',
  ');',
  '',
].join('\n'));
const modalBadUx = write(`${modalBad}/ux-states.json`, JSON.stringify({
  feature: 'ModalBad',
  states: [{ name: 'open', route: '/x', steps: [
    { action: 'click', selector: "button:has-text('Cancel')", label: 'close modal' },
  ], ac_assertions: [] }],
  negative_states: [],
  unit_tests: [],
}, null, 2));
test('L-03 → footer-button close selector on a modal without Footer/ActionRow is warned', () => {
  const f = lint(args(path.join(tmpRoot, modalBad), { uxStates: modalBadUx }));
  assert(hasWarn(f, 'L03', 'no Footer/ActionRow'), 'expected L03 warn for footer-button on display modal');
});

const modalOk = 'modal-ok-feature';
write(`${modalOk}/data/api.ts`, 'export const q = 1;\n');
write(`${modalOk}/components/ConfirmModal.tsx`, [
  "import { ModalDialog } from '@your-org/ui-lib';",
  'export const ConfirmModal = ({ isOpen, onClose, onConfirm }) => (',
  '  <ModalDialog isOpen={isOpen}>',
  '    <ModalDialog.Body>Are you sure?</ModalDialog.Body>',
  '    <ModalDialog.Footer>',
  '      <Button onClick={onClose}>Cancel</Button>',
  '      <Button onClick={onConfirm}>Confirm</Button>',
  '    </ModalDialog.Footer>',
  '  </ModalDialog>',
  ');',
  '',
].join('\n'));
const modalOkUx = write(`${modalOk}/ux-states.json`, JSON.stringify({
  feature: 'ModalOk',
  states: [{ name: 'open', route: '/x', steps: [
    { action: 'click', selector: "button:has-text('Cancel')", label: 'close modal' },
  ], ac_assertions: [] }],
  negative_states: [],
  unit_tests: [],
}, null, 2));
test('L-03 → footer-button close selector on a modal WITH Footer/ActionRow is OK', () => {
  const f = lint(args(path.join(tmpRoot, modalOk), { uxStates: modalOkUx }));
  assert(!has(f, 'L03'), 'confirmation modal with Footer must not trip L03 error');
});

// ── Fixture: L-02 / W.2b i18n case drift ──────────────────────────────
const i18nDrift = 'i18n-drift-feature';
write(`${i18nDrift}/data/api.ts`, 'export const q = 1;\n');
write(`${i18nDrift}/messages.ts`, [
  "import { defineMessages } from 'react-intl';",
  'export const messages = defineMessages({',
  "  title: { id: 'feature.title', defaultMessage: 'Best answers' },",
  "  status: { id: 'feature.status', defaultMessage: 'Pass' },",
  '});',
  '',
].join('\n'));
const i18nDriftUx = write(`${i18nDrift}/ux-states.json`, JSON.stringify({
  feature: 'I18nDrift',
  states: [{ name: 'success', route: '/x', steps: [], ac_assertions: [
    { ac_id: 'ACT-01', selector: '.title', expected: 'text:Best Answers' }, // wrong case (title vs sentence)
    { ac_id: 'ACT-02', selector: '.status', expected: 'text:PASS' }, // toUpperCase() — actually OK
  ] }],
  negative_states: [],
  unit_tests: [],
}, null, 2));
test('L-02 / W.2b → text: assertion case drift (Best Answers vs Best answers) is warned', () => {
  const f = lint(args(path.join(tmpRoot, i18nDrift), { uxStates: i18nDriftUx }));
  assert(hasWarn(f, 'W2', 'i18n case drift'), 'expected W2 warn for case-drifted text assertion');
});

const i18nOk = 'i18n-ok-feature';
write(`${i18nOk}/data/api.ts`, 'export const q = 1;\n');
write(`${i18nOk}/messages.ts`, [
  "import { defineMessages } from 'react-intl';",
  'export const messages = defineMessages({',
  "  label: { id: 'feature.label', defaultMessage: 'Total score' },",
  '});',
  '',
].join('\n'));
const i18nOkUx = write(`${i18nOk}/ux-states.json`, JSON.stringify({
  feature: 'I18nOk',
  states: [{ name: 'success', route: '/x', steps: [], ac_assertions: [
    { ac_id: 'ACT-01', selector: '.label', expected: 'text:Total score' }, // exact match
  ] }],
  negative_states: [],
  unit_tests: [],
}, null, 2));
test('L-02 / W.2b → text: assertion matching defaultMessage exactly is not warned', () => {
  const f = lint(args(path.join(tmpRoot, i18nOk), { uxStates: i18nOkUx }));
  assert(!hasWarn(f, 'W2', 'i18n case drift'), 'exact-match text: assertion must not trip W2 case drift');
});

// ── T6 (design §10.5, canary C1) — BE-exclusion symmetry ─────────────
// Invariant (§10.2 D2): a row marked `<!-- enforced-by: BE -->` is invisible to ALL of
//   (1) countChecklistSection — the Summary path        (playwright-runner.ts, §10.2 path 3)
//   (2) grab                  — the HR35 row-scan denominator
//   (3) checkAcCoverage       — the HR36 coverage set
//   (4) finalCellVerified     — the 4th asymmetry §10.2 flags (brRows filters; this did not)
// The fixture deliberately has NO `## Summary` `✅ X/Y` pair, so verifiedSource falls back to
// row-scan — that fallback is what exercises finalCellVerified. The BE row carries a ✅ in its
// final (evidence) cell, which is exactly what an unfiltered reader miscounts as verified.
const t6 = 't6-be-symmetry';
write(`${t6}/data/api.ts`, 'export const q = 1;\n');
const t6ChecklistText = [
  '## ACT — Acceptance Test Cases',
  '| ID | Description | Tool | Status | Evidence |',
  '|----|-------------|------|--------|----------|',
  '| ACT-01 | renders summary | Playwright | ✅ Pass | run-ref-1 ✅ |',
  '| ACT-BR2 | computes attendance rate | BE | ✅ Pass | BE-owned ✅ <!-- enforced-by: BE --> |',
  '',
].join('\n');
const t6Checklist = write(`${t6}/checklist.md`, t6ChecklistText);
const t6Ux = write(`${t6}/ux-states.json`, JSON.stringify({
  feature: 'T6',
  states: [{ ac_assertions: [{ ac_id: 'ACT-01', selector: '.x', expected: 'visible' }] }],
  negative_states: [], unit_tests: [],
}, null, 2));

test('T6 — BE row is invisible to countChecklistSection (Summary path, §10.2 path 3)', () => {
  const s = countChecklistSection(t6ChecklistText, 'ACT');
  assert(s.total === 1, `BE row must leave the Summary total: expected 1, got ${s.total}`);
  assert(s.pass === 1, `BE row must leave the Summary pass count: expected 1, got ${s.pass}`);
  // The point of the fix: with BE rows gone, a fully-verified section can reach pass === total,
  // which is what lets icon() emit ✅ and moves HR35 off the row-scan fallback (§10.2).
  assert(s.pass === s.total, 'section must be able to reach full-green once BE rows are excluded');
});

test('T6 — BE row is invisible to grab + checkAcCoverage (HR36 coverage set)', () => {
  const f = lint(args(path.join(tmpRoot, t6), { checklist: t6Checklist, uxStates: t6Ux }));
  assert(!has(f, 'HR36', 'ACT-BR2'), 'BE row must not be named as uncovered');
  assert(!has(f, 'HR36', 'AC coverage'), 'BE row must not be counted as uncovered');
});

test('T6 — BE row is invisible to finalCellVerified (HR35 row-scan, 4th asymmetry)', () => {
  const f = lint(args(path.join(tmpRoot, t6), { checklist: t6Checklist, uxStates: t6Ux }));
  const hr35 = f.find((x) => x.rule === 'HR35');
  assert(!!hr35, 'expected an HR35 finding');
  const msg = (hr35 as { msg: string }).msg;
  assert(/\[src: row-scan\]/.test(msg), `fixture must exercise the row-scan path, got: ${msg}`);
  const m = msg.match(/ACT\s+(\d+)\/(\d+)/);
  assert(!!m, `expected an "ACT n/m" pair in: ${msg}`);
  assert(m![1] === '1', `BE row must not be counted as verified: expected "ACT 1/…", got "${m![0]}"`);
});

// ── T5 + T7 (design §10.5, canary C2 = §10.3) — writer/reader alignment ───────────────
// RED-FIRST: authored BEFORE the §10.3 writer fix. Against current code:
//   • T5 → writer stamps `✅ Pass` into the STATUS cell + plain evidence → finalCellVerified
//     (reads the FINAL/evidence cell) sees no ✅ → numerator stays 0. Expected 1 → RED.
//   • T7 → writer never throws; it id-matches + writes via cells.length → the drifted UI header
//     (no Evidence col) is mutated → no STOP + bytes change → RED.
// Both flip GREEN only when C2 lands: evidence-cell ✅ stamp + header-resolved columns +
// fail-closed `tierB-checklist-unrecognized-layout`.
const sha256 = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// T5 fixture — RECOGNIZED template ACT layout (Evidence column present), unverified row, NO
// `## Summary ✅ X/Y` pair so the reader falls back to finalCellVerified row-scan (same trick as T6).
const t5 = 't5-cell-alignment';
write(`${t5}/data/api.ts`, 'export const q = 1;\n');
const t5ChecklistText = [
  '## ACT — Acceptance Test Cases',
  '| ID | Test Case | Tool | Status | Evidence |',
  '|----|-----------|------|--------|----------|',
  '| ACT-001 | renders summary chart | Playwright | ⬜ Pending | |',
  '',
].join('\n');
const t5Checklist = write(`${t5}/checklist.md`, t5ChecklistText);
const t5Ux = write(`${t5}/ux-states.json`, JSON.stringify({
  feature: 'T5',
  states: [{ ac_assertions: [{ ac_id: 'ACT-001', selector: '.x', expected: 'visible' }] }],
  negative_states: [], unit_tests: [],
}, null, 2));

test('T5 — writer PASS verdict must land a ✅ in the evidence (final) cell so finalCellVerified counts it (§10.5-T5; RED before §10.3)', () => {
  updateChecklistRows(t5Checklist, [{ id: 'ACT-001', passed: true, evidence: 'cap-run-42' }]);
  const f = lint(args(path.join(tmpRoot, t5), { checklist: t5Checklist, uxStates: t5Ux }));
  const hr35 = f.find((x) => x.rule === 'HR35');
  assert(!!hr35, 'expected an HR35 finding');
  const msg = (hr35 as { msg: string }).msg;
  assert(/\[src: row-scan\]/.test(msg), `fixture must exercise the row-scan path, got: ${msg}`);
  const m = msg.match(/ACT\s+(\d+)\/(\d+)/);
  assert(!!m, `expected an "ACT n/m" pair in: ${msg}`);
  assert(m![1] === '1', `after a PASS verdict the evidence cell must carry ✅ so it is counted: expected "ACT 1/…", got "ACT ${m![1]}/${m![2]}" — msg: ${msg}`);
});

// T7 fixture — the real DRIFTED target UI header (no Evidence column) → matches none of the 5
// recognized template layouts → must STOP `tierB-checklist-unrecognized-layout`, zero bytes written.
const t7 = 't7-unrecognized-header';
write(`${t7}/data/api.ts`, 'export const q = 1;\n');
const t7ChecklistText = [
  '## UI Verification',
  '| # | Component | Screen | Check | Status |',
  '|---|-----------|--------|-------|--------|',
  '| UI-01 | Dashboard heading | Progress & Reports | title renders | ⬜ |',
  '',
].join('\n');
const t7Checklist = write(`${t7}/checklist.md`, t7ChecklistText);

test('T7 — unrecognized/absent header → STOP tierB-checklist-unrecognized-layout, zero bytes written (§10.5-T7; RED before §10.3)', () => {
  const before = sha256(t7Checklist);
  let threw = false; let verdict = '';
  try {
    updateChecklistRows(t7Checklist, [{ id: 'UI-01', passed: true, evidence: 'cap-run-99' }]);
  } catch (e) {
    threw = true;
    verdict = ((e as { verdict?: string }).verdict) || (e as Error).message || '';
  }
  const after = sha256(t7Checklist);
  assert(threw, `writer must STOP (throw) on an unrecognized header, not degrade to cells.length — before=${before} after=${after}`);
  assert(/tierB-checklist-unrecognized-layout/.test(verdict), `STOP verdict must be tierB-checklist-unrecognized-layout, got: "${verdict}"`);
  assert(after === before, `zero bytes written on STOP: sha256 must be unchanged — before=${before} after=${after}`);
});

// T8 (design §10.5) — DOCUMENTED-RED "assert-the-gap": the reader still counts a BARE ✅ (no
// provenance run-ref) in the evidence cell. GREEN today = the known reader gap (§10.3 "Residual
// risk") is still open. Must stay GREEN across C1–C4; a flip to RED means a canary closed the
// reader gap unintentionally → investigate, do NOT edit T8. Reader-only (no writer call).
const t8 = 't8-bare-check-reader-gap';
write(`${t8}/data/api.ts`, 'export const q = 1;\n');
const t8ChecklistText = [
  '## ACT — Acceptance Test Cases',
  '| ID | Test Case | Tool | Status | Evidence |',
  '|----|-----------|------|--------|----------|',
  '| ACT-001 | renders summary chart | Playwright | ⬜ Pending | ✅ |',
  '',
].join('\n');
const t8Checklist = write(`${t8}/checklist.md`, t8ChecklistText);
const t8Ux = write(`${t8}/ux-states.json`, JSON.stringify({
  feature: 'T8',
  states: [{ ac_assertions: [{ ac_id: 'ACT-001', selector: '.x', expected: 'visible' }] }],
  negative_states: [], unit_tests: [],
}, null, 2));

test('T8 — reader still counts a BARE ✅ (no run-ref) in the evidence cell — documented-RED gap, must stay GREEN (§10.5-T8)', () => {
  const f = lint(args(path.join(tmpRoot, t8), { checklist: t8Checklist, uxStates: t8Ux }));
  const hr35 = f.find((x) => x.rule === 'HR35');
  assert(!!hr35, 'expected an HR35 finding');
  const msg = (hr35 as { msg: string }).msg;
  assert(/\[src: row-scan\]/.test(msg), `fixture must exercise the row-scan path, got: ${msg}`);
  const m = msg.match(/ACT\s+(\d+)\/(\d+)/);
  assert(!!m, `expected an "ACT n/m" pair in: ${msg}`);
  assert(m![1] === '1', `documented gap (§10.5-T8): a bare ✅ must still be counted — expected "ACT 1/…", got "ACT ${m![1]}/${m![2]}" — msg: ${msg}`);
});

// ── §10.5 canary C3 (§10.4 D4) — reader-path integration for AC-level declared-defer ─────────
// C3a lifts §17.7's declared-defer up to checklist rows: a row-level `<!-- DEFER: §<anchor> ;
// predicate:<key> -->` marker is admitted ONLY with BOTH a §-anchor to a *locked* decision AND a
// predicate key (§10.4). These tests exercise the READER path (lint()/parseChecklist), not just the
// unit validateRowDefer (that is checklist-defer.test.ts). A malformed marker must become an
// OBSERVABLE STOP — an 'error'-level TIERB-DEFER finding carrying the verdict — NOT an uncaught throw
// (the probe confirmed parseChecklist is called bare at lint-feature.ts:561) and NOT a silent pass.
// RED-FIRST: authored before the parseChecklist validate-pass + :561 catch are wired.
const dfr = 'defer-reader-feature';
write(`${dfr}/data/api.ts`, 'export const q = 1;\n');
// ACT-02 carries an anchorless defer (unit T2 lifted to the reader path): predicate present, NO §.
const dfrChecklist = write(`${dfr}/checklist.md`, [
  '## ACT — Acceptance Test Cases',
  '| # | Test | Tool | Status | Evidence |',
  '|---|------|------|--------|----------|',
  '| ACT-01 | renders summary | Playwright | ⬜ Pending | |',
  '| ACT-02 | absent-data state | Playwright | ⬜ Pending | <!-- DEFER: predicate:foo --> |',
  '',
].join('\n'));
test('§10.5 C3 reader — malformed (anchorless) DEFER → observable TIERB-DEFER STOP, not a crash/silent pass', () => {
  const f = lint(args(path.join(tmpRoot, dfr), { checklist: dfrChecklist }));
  assert(has(f, 'TIERB-DEFER', 'tierB-defer-anchorless'), 'anchorless row-defer must surface an error-level TIERB-DEFER finding carrying the verdict');
});

// GREEN-path guard: a well-formed, locked defer (§10.4 + predicate) must NOT STOP, and C3a must
// STILL COUNT the row (exclusion is C3b). "Still counted" is proven observably — the deferred ACT
// row, left uncovered by ux-states, is STILL named uncovered by HR36 → it remains in the coverage
// set (not excluded). When C3b lands this assertion flips (the row drops out) — expected, by design.
const dfrOk = 'defer-reader-ok-feature';
write(`${dfrOk}/data/api.ts`, 'export const q = 1;\n');
const dfrOkChecklist = write(`${dfrOk}/checklist.md`, [
  '## ACT — Acceptance Test Cases',
  '| # | Test | Tool | Status | Evidence |',
  '|---|------|------|--------|----------|',
  '| ACT-01 | renders summary | Playwright | ⬜ Pending | |',
  '| ACT-02 | absent-data state | Playwright | ⬜ Pending | <!-- DEFER: §10.4 ; predicate:bar ; stamp:unsatisfied@run-1 --> |',
  '',
].join('\n'));
const dfrOkUx = write(`${dfrOk}/ux-states.json`, JSON.stringify({
  feature: 'DeferOk',
  states: [{ ac_assertions: [{ ac_id: 'ACT-01', selector: '.x', expected: 'visible' }] }],
  negative_states: [], unit_tests: [],
}, null, 2));
test('§10.5 C3 reader — well-formed locked DEFER → no STOP, and row STILL counted (C3a does not exclude; C3b will)', () => {
  const f = lint(args(path.join(tmpRoot, dfrOk), { checklist: dfrOkChecklist, uxStates: dfrOkUx }));
  assert(!has(f, 'TIERB-DEFER'), 'a well-formed, locked defer must NOT STOP');
  assert(has(f, 'HR36', 'ACT-02'), 'C3a does not exclude: the deferred, uncovered row is STILL counted → HR36 names it');
});

// ── §10.9 (C3b-i, PROPOSED — not yet locked) — predicate-registry + capture-time stamp: runtime
// defer invalidation. RED-FIRST: authored BEFORE C3b lands. T10 below exercises the READER path
// (lint()) against the PROPOSED stamp shape
//   `<!-- DEFER: §<anchor> ; predicate:<key> ; stamp:<satisfied|unsatisfied>@<run-ref> -->`
// C3a's parseRowDefer/validateRowDefer are stamp-blind today: the `stamp:` clause parses as inert
// trailing text (PREDICATE regex only consumes up to the next non-word/dot/dash char), so a marker
// with or without a stamp is admitted identically, and an admitted row is NEVER excluded from any
// count (proven by the adjacent "well-formed locked DEFER ... C3a does not exclude" test above).
// No new imports are added here — the assertion below is a behavioral gap in the EXISTING lint()
// entry point, so it fails on assertions, not on import errors, and cannot affect any
// currently-passing test in this file.
//
// T1, T9, T11 moved to .claude/integrations/_c3b-ii-tests.scratch.ts (untracked) — all three
// require grab-path exclusion (grab/finalCellVerified/brRows) to pass, which is C3b-ii scope, not
// C3b-i (registry + stamp only). Shipping T1 alone here would mean grab() excludes a valid defer
// while finalCellVerified/brRows do not — the exact "4th asymmetry" bug §10.2 D2 and §10.9 D9.4
// both warn about. C3b-i therefore drives ONLY T10 green.

// T10 (design §10.9, NEW property — fail-closed stamp requirement, D5.4/A5) — a DEFER marker with a
// locked anchor + predicate key but NO capture-time stamp must STOP (verdict
// `tierB-defer-unstamped`), not be silently admitted. Closes the grandfathering hole: an
// un-evaluated defer must never be treated as validly deferred. NOTE: identical marker shape to the
// existing "well-formed locked DEFER → no STOP" GREEN test above (dfrOk) — implementing T10 will
// require that test's fixture to gain a stamp clause once C3b ships. Flagged for the implementation
// turn; not touched here.
const t10 = 't10-unstamped-defer';
write(`${t10}/data/api.ts`, 'export const q = 1;\n');
const t10ChecklistText = [
  '## ACT — Acceptance Test Cases',
  '| ID | Description | Tool | Status | Evidence |',
  '|----|-------------|------|--------|----------|',
  '| ACT-05 | locked anchor + predicate, no stamp | Playwright | ⬜ Pending | <!-- DEFER: §10.4 ; predicate:no-published-assessment --> |',
  '',
].join('\n');
const t10Checklist = write(`${t10}/checklist.md`, t10ChecklistText);

test('T10 — unstamped defer → STOP tierB-defer-unstamped (fail-closed, not treated as deferred) (§10.9 proposed, D5.4; RED — stamp check does not exist yet)', () => {
  const f = lint(args(path.join(tmpRoot, t10), { checklist: t10Checklist }));
  assert(has(f, 'TIERB-DEFER', 'tierB-defer-unstamped'), 'a defer with no capture-time stamp must STOP with verdict tierB-defer-unstamped');
});

// ── teardown + report ────────────────────────────────────────────────
try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
