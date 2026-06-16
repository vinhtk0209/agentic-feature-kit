/**
 * integration.test.ts — end-to-end test of the B11 verification PATH used in production.
 *
 * Exercises the REAL functions the workflow runs at B11, on a realistic generated feature:
 *   - route resolution  : resolveRoutes() — the exact fn b11-runner.ts uses
 *   - coverage + ratio  : lint()          — the exact fn the coverage gate runs
 *   - gate enforcement  : the lint-feature.ts CLI with --gate --json — the exact command
 *                         b11-runner.runCoverageGate() spawns (validates exit code + JSON contract)
 *
 * It is built to FAIL (go red) if the historical regressions are reintroduced:
 *   - F1 : ux-states schema → silent route skip (flat states[].route) / coverage drop (nested schema)
 *   - F2 : checklist Summary format → HR35 verified-ratio parser falls back to row-scan
 *
 * Run: npx tsx .claude/integrations/integration.test.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { resolveRoutes, parseUxStates } from './ux-states';
import { lint, Args } from './lint-feature';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
const hasErr = (f: ReturnType<typeof lint>, rule: string, sub = '') => f.some((x) => x.rule === rule && x.level === 'error' && x.msg.includes(sub));
const finding = (f: ReturnType<typeof lint>, rule: string) => f.find((x) => x.rule === rule);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffc-integration-'));
function write(rel: string, content: string) {
  const full = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}
function args(folder: string, over: Partial<Args> = {}): Args {
  return {
    folder, responseTransform: 'transformResponse', minVerified: 0.6, gate: false, json: false, codeOnly: false, ...over,
  };
}
const ROUTE = '/course-dashboard/demo/home';

// ── A realistic generated feature (the shape B10 produces) ───────────────────
const feat = 'demo-feature';
write(`${feat}/data/types.ts`, 'export interface Exam { id: number; score: number; }\n');
write(`${feat}/data/transform.ts`, [
  "import { Exam } from './types';",
  'export const mapExam = (raw: Exam): Exam => raw;',
  '',
].join('\n'));
write(`${feat}/data/api.ts`, [
  "import { yourHttpClient } from '@your-org/http-client';",
  "import { transformResponse } from '@your-org/http-client';",
  "import { mapExam } from './transform';",
  'export const getExams = async () => {',
  "  const res = await yourHttpClient().get('/api/v1/exams');",
  '  return res.data.map((d) => mapExam(transformResponse(d)));',
  '};',
  '',
].join('\n'));
write(`${feat}/data/apiHooks.ts`, [
  "import { useQuery } from '@tanstack/react-query';",
  "import { getExams } from './api';",
  "export const useExams = () => useQuery({ queryKey: ['demo-feature', 'exams'], queryFn: getExams, staleTime: 60000 });",
  '',
].join('\n'));
write(`${feat}/utils/formatScore.ts`, 'export const formatScore = (n: number): string => n.toFixed(1);\n');
write(`${feat}/utils/formatScore.test.ts`, [
  "import { formatScore } from './formatScore';",
  "it('ACT-02 rounds score to 1 decimal', () => { expect(formatScore(7)).toBe('7.0'); });",
  '',
].join('\n'));
write(`${feat}/DemoFeature.tsx`, 'export const DemoFeature = () => null;\n');
write(`${feat}/messages.ts`, "import { defineMessages } from 'react-intl';\nexport default defineMessages({ title: { id: 'demo.title', defaultMessage: 'Demo' } });\n");

const checklistGood = write(`${feat}/checklist.md`, [
  '# Checklist — DemoFeature',
  '',
  '## Requirements Coverage',
  '| # | Requirement | Status |',
  '|---|-------------|--------|',
  '| REQ-01 | Show exam list | ✅ |',
  '',
  '## UI Verification',
  '| # | Component | Screen | Check | Status |',
  '|---|-----------|--------|-------|--------|',
  '| UI-01 | ExamList | Dashboard | renders | ✅ |',
  '| UI-02 | ScoreCard | Dashboard | shows score | ✅ |',
  '',
  '## ACT — Acceptance Test Cases',
  '| # | Test | Tool | Status |',
  '|---|------|------|--------|',
  '| ACT-01 | list renders on load | Playwright | ✅ |',
  '| ACT-02 | score rounds to 1 decimal | Unit Test | ✅ |',
  '',
  '## UX States',
  '| # | State | Screen | Status |',
  '|---|-------|--------|--------|',
  '| UX-01 | loading | Dashboard | ✅ |',
  '',
  '## Playwright Verify (B11)',
  '| Check | Result | Notes |',
  '|-------|--------|-------|',
  '| PLAYWRIGHT-001 | ✅ | |',
  '',
  '## Summary',
  '- Total Requirements rows: **1** — ✅ 1/1',
  '- Total UI rows: **2** — ✅ 2/2',
  '- Total ACT rows: **2** — ✅ 2/2',
  '- Total UX rows: **1** — ✅ 1/1',
  '- Playwright rows: **1** — ✅ 1/1',
  '',
].join('\n'));

// B5 FLAT ux-states: per-state route; ac_assertions cover ACT-01; unit_tests cover ACT-02. NO top-level routes[].
const uxFlat = {
  feature: 'DemoFeature',
  version: 'v2',
  states: [{
    name: 'dashboard-success',
    route: ROUTE,
    steps: [{ action: 'waitForSelector', selector: "[data-testid='exam-list']", label: 'load' }],
    ui_rows: ['UI-01', 'UI-02'],
    ac_assertions: [{ ac_id: 'ACT-01', selector: "[data-testid='exam-list']", expected: 'visible' }],
  }],
  negative_states: [],
  unit_tests: [{ ac_id: 'ACT-02', test_file: 'utils/formatScore.test.ts', grep: 'rounds' }],
};
const uxFlatPath = write(`${feat}/ux-states.json`, JSON.stringify(uxFlat, null, 2));

// ── 1. Route resolution (F1 regression guard) ────────────────────────────────
test('F1 — routes resolve from the B5 FLAT schema (states[].route), with NO top-level routes[]', () => {
  const routes = resolveRoutes(parseUxStates(JSON.stringify(uxFlat)));
  assert(routes.length === 1 && routes[0] === ROUTE,
    `expected [${ROUTE}], got ${JSON.stringify(routes)} — reverting readRoutes to routes[]-only would silently skip Playwright`);
});
test('F1 — routes also resolve when only a top-level routes[] is present', () => {
  const routes = resolveRoutes(parseUxStates(JSON.stringify({ routes: [ROUTE], states: [] })));
  assert(routes.length === 1 && routes[0] === ROUTE, 'top-level routes[] must still work');
});

// ── 2. Coverage parsing + verified ratio (F2 regression guard) ───────────────
test('coverage — a well-formed generated feature passes lint() with 0 errors', () => {
  const f = lint(args(path.join(tmp, feat), { checklist: checklistGood, uxStates: uxFlatPath }));
  const errs = f.filter((x) => x.level === 'error');
  assert(errs.length === 0, `expected 0 errors, got: ${errs.map((e) => `${e.rule}:${e.msg}`).join(' | ')}`);
});
test('F2 — verified ratio is parsed from the Summary (✅ v/N), NOT the row-scan fallback', () => {
  const f = lint(args(path.join(tmp, feat), { checklist: checklistGood, uxStates: uxFlatPath }));
  const hr35 = finding(f, 'HR35');
  assert(!!hr35, 'expected an HR35 finding');
  assert(hr35!.msg.includes('src: summary'),
    `expected Summary parse; got "${hr35!.msg}". A table-format Summary (the F2 bug) reads 'src: row-scan'.`);
});

// ── 3. Gate enforcement via the REAL CLI (the exact command b11-runner spawns) ─
function runGate(folder: string, checklist: string, ux: string): { code: number; errors: number } {
  const linter = path.join(process.cwd(), '.claude', 'integrations', 'lint-feature.ts');
  const cmd = `npx tsx "${linter}" "${folder}" --checklist "${checklist}" --ux-states "${ux}" --gate --json`;
  const r = spawnSync(cmd, { encoding: 'utf8', shell: true, timeout: 60000 });
  let errors = -1;
  try { const m = (r.stdout || '').match(/\{[\s\S]*\}/); if (m) errors = JSON.parse(m[0]).errors; } catch { /* ignore */ }
  return { code: r.status ?? -1, errors };
}
test('gate — clean fixture under --gate exits 0 with 0 coverage errors', () => {
  const { code, errors } = runGate(path.join(tmp, feat), checklistGood, uxFlatPath);
  assert(code === 0, `expected exit 0, got ${code}`);
  assert(errors === 0, `expected 0 errors, got ${errors}`);
});

// uncovered variant: ACT-01 loses its ac_assertion and is referenced by no *.test.ts → uncovered → gate fails
const uxUncovered = { ...uxFlat, states: [{ ...uxFlat.states[0], ac_assertions: [] }] };
const uxUncoveredPath = write(`${feat}/ux-states.uncovered.json`, JSON.stringify(uxUncovered, null, 2));
test('gate — an uncovered ACT under --gate exits 1 (enforcement is real, not advisory)', () => {
  const { code, errors } = runGate(path.join(tmp, feat), checklistGood, uxUncoveredPath);
  assert(code === 1, `expected exit 1 (gate fail), got ${code}`);
  assert(errors >= 1, `expected >=1 error, got ${errors}`);
});

// ── 4. F1 second half — the NESTED Agent-B schema drops AC coverage ───────────
// Proves WHY the flat schema must win: a nested states[].states[] file exposes no ac_assertions
// at the read level, so the coverage gate sees ACT rows as uncovered.
const uxNested = {
  feature: 'DemoFeature',
  version: 'v2',
  routes: [ROUTE],
  states: [{
    screen: 'Dashboard',
    states: [
      { id: 'LOADING', selector: '.spinner', expected: 'visible' },
      { id: 'SUCCESS', selector: "[data-testid='exam-list']", expected: 'visible' },
    ],
    negative_states: [],
    unit_tests: [],
  }],
};
const uxNestedPath = write(`${feat}/ux-states.nested.json`, JSON.stringify(uxNested, null, 2));
test('F1 — nested Agent-B schema yields UNCOVERED ACT (proves the flat schema must be preserved)', () => {
  const f = lint(args(path.join(tmp, feat), { checklist: checklistGood, uxStates: uxNestedPath }));
  assert(hasErr(f, 'HR36', 'AC coverage'), 'nested schema must report ACT rows uncovered (no ac_assertions read)');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
