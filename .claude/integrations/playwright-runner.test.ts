/**
 * playwright-runner.test.ts — tests for the pure (non-browser) exports.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/playwright-runner.test.ts
 *
 * Strategy: only the pure exported functions (analyzeCascade) are tested here,
 * since the browser-driven path requires a real Playwright instance.
 */

import {
  analyzeCascade, CascadeAnalysis,
  assessDataReached, isNonEmptyBody, resolveWaitStrategy,
  ApiResponseObservation,
} from './playwright-runner';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ── analyzeCascade ────────────────────────────────────────────────────

test('analyzeCascade — all pass → no cascade', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: true, evidence: 'ok' },
    { name: 'state03', passed: true, evidence: 'ok' },
  ]);
  assert(r.rootFailure === null, 'no root failure when all pass');
  assert(r.cascadeBlockedCount === 0, 'no cascade-blocked states');
});

test('analyzeCascade — empty list → no cascade', () => {
  const r = analyzeCascade([]);
  assert(r.rootFailure === null, 'no root failure on empty list');
  assert(r.cascadeBlockedCount === 0, 'no cascade-blocked states');
});

test('analyzeCascade — failure in first state cascades to all others', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: false, evidence: 'element not found' },
    { name: 'state02', passed: true, evidence: 'would pass' },
    { name: 'state03', passed: true, evidence: 'would pass' },
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state01', `root failure must be state01, got ${r.rootFailure?.stateName}`);
  assert(r.rootFailure?.evidence === 'element not found', 'root failure evidence preserved');
  assert(r.cascadeBlockedCount === 3, `expected 3 cascade-blocked, got ${r.cascadeBlockedCount}`);
});

test('analyzeCascade — failure in middle cascades to subsequent states only', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: false, evidence: 'click failed' },
    { name: 'state03', passed: true, evidence: 'would pass' },
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state02', `root failure must be state02, got ${r.rootFailure?.stateName}`);
  assert(r.cascadeBlockedCount === 2, `expected 2 cascade-blocked, got ${r.cascadeBlockedCount}`);
});

test('analyzeCascade — failure in last state → 0 cascade-blocked', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: true, evidence: 'ok' },
    { name: 'state03', passed: false, evidence: 'timeout' },
  ]);
  assert(r.rootFailure?.stateName === 'state03', 'root failure is the last state');
  assert(r.cascadeBlockedCount === 0, 'no states after last one to cascade-block');
});

test('analyzeCascade — only the FIRST failure is the root cause (subsequent failures are cascade)', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: false, evidence: 'root cause' },
    { name: 'state03', passed: false, evidence: 'downstream failure' }, // cascade-blocked
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state02', 'first failure is the root');
  assert(r.rootFailure?.evidence === 'root cause', 'root cause evidence is from state02');
  assert(r.cascadeBlockedCount === 2, 'state03 and state04 are both cascade-blocked');
});

// ── §4 assessDataReached — the load-bearing Tier B data gate (v3.24) ──────────
// The whole point: a shell-only assertion PASSES on empty data; §4 must FAIL it.
const api = (status: number, bodyText: string, url = 'https://api.fpt-apps.com/x'): ApiResponseObservation =>
  ({ url, status, bodyText });

test('§4 DECISIVE — empty-body 200 (skeleton) → FAILS tierB-empty-body', () => {
  // This is the exact false-proof: 200 OK but no data. A body-length shell check would PASS.
  for (const empty of ['', '[]', '{}', '{"data":[]}', '{"content":[],"totalElements":0}', 'null']) {
    const v = assessDataReached([api(200, empty)]);
    assert(v.passed === false, `empty body ${JSON.stringify(empty)} must FAIL, got pass`);
    assert(v.reason === 'tierB-empty-body', `expected tierB-empty-body for ${empty}, got ${v.reason}`);
  }
});
test('§4 — key API 401 → FAILS tierB-api-401 (stale-token render cannot pass)', () => {
  const v = assessDataReached([api(401, '{"message":"unauthorized"}')]);
  assert(v.passed === false && v.reason === 'tierB-api-401', `got ${v.reason}`);
});
test('§4 — key API 403 → FAILS tierB-api-403', () => {
  const v = assessDataReached([api(403, 'forbidden')]);
  assert(v.passed === false && v.reason === 'tierB-api-403', `got ${v.reason}`);
});
test('§4 — key API 500 → FAILS tierB-api-error', () => {
  const v = assessDataReached([api(500, '{"error":"boom"}')]);
  assert(v.passed === false && v.reason === 'tierB-api-error', `got ${v.reason}`);
});
test('§4 — no API observed (login redirect before fetch) → FAILS tierB-no-data-reached', () => {
  const v = assessDataReached([]);
  assert(v.passed === false && v.reason === 'tierB-no-data-reached', `got ${v.reason}`);
});
test('§4 — non-empty 200 (real rows) → PASSES data-reached', () => {
  const v = assessDataReached([api(200, '{"learners":[{"id":1,"name":"A"}]}')]);
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}: ${v.evidence}`);
});
test('§4 — top-level non-empty array → PASSES', () => {
  const v = assessDataReached([api(200, '[{"id":1}]')]);
  assert(v.passed === true, `array with rows must pass, got ${v.reason}`);
});
test('§4 — a 2xx-non-empty anywhere WINS over a sibling 401 (data did reach)', () => {
  const v = assessDataReached([api(401, '{}'), api(200, '{"rows":[{"x":1}]}')]);
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}`);
});
test('§4 — 401 is chosen over a bare 5xx as the more diagnostic failure', () => {
  const v = assessDataReached([api(500, ''), api(401, '')]);
  assert(v.passed === false && v.reason === 'tierB-api-401', `got ${v.reason}`);
});

// ── isNonEmptyBody unit cases ──
test('isNonEmptyBody — empties/skeletons are empty', () => {
  // Skeleton envelopes with a zero-row list are EMPTY even with a sibling count.
  for (const e of ['', '   ', '[]', '{}', 'null', '{"data":[]}', '{"a":{"b":[]}}', '{"total":0,"data":[]}'])
    assert(isNonEmptyBody(e) === false, `${JSON.stringify(e)} should be empty`);
});
test('isNonEmptyBody — real content is non-empty', () => {
  // rows in an array, a row-with-content, a scalar-only detail object, or text.
  for (const nz of ['[{"id":1}]', '[{}]', '{"name":"Class A"}', '{"count":5}', '<html>data</html>'])
    assert(isNonEmptyBody(nz) === true, `${JSON.stringify(nz)} should be non-empty`);
});

// ── Z.2 resolveWaitStrategy — bounded, correct path ──
test('Z.2 — named selector → selector strategy, bounded timeout', () => {
  const w = resolveWaitStrategy('[data-testid="report-table"]');
  assert(w.kind === 'selector', 'should pick selector');
  assert(w.kind === 'selector' && w.selector === '[data-testid="report-table"]', 'selector preserved');
  assert(w.timeoutMs > 0 && w.timeoutMs <= 30_000, 'timeout bounded');
});
test('Z.2 — no/blank selector → bounded networkidle fallback (NOT unbounded)', () => {
  for (const s of [undefined, null, '', '   ']) {
    const w = resolveWaitStrategy(s);
    assert(w.kind === 'networkidle', `blank ${JSON.stringify(s)} → networkidle`);
    assert(w.timeoutMs > 0 && w.timeoutMs <= 30_000, 'networkidle timeout is bounded');
  }
});
test('Z.2 — timeouts are hard-capped (cannot hang on a huge request)', () => {
  const w = resolveWaitStrategy(null, { networkidleTimeoutMs: 10_000_000, maxTimeoutMs: 30_000 });
  assert(w.timeoutMs === 30_000, `capped to 30s, got ${w.timeoutMs}`);
});

// ── report ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
