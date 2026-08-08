/**
 * playwright-runner.test.ts — tests for the pure (non-browser) exports.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/playwright-runner.test.ts
 *
 * Strategy: only the pure exported functions (analyzeCascade) are tested here,
 * since the browser-driven path requires a real Playwright instance.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  analyzeCascade, CascadeAnalysis,
  assessDataReached, isNonEmptyBody, resolveWaitStrategy,
  ApiResponseObservation,
  deriveFeatureEndpoints, urlMatchesEndpoint, EndpointDerivationError,
  resolveDataAssessPoint, finalizeDataReachedVerdict, DataAssessPoint,
  replaceSummarySection, countChecklistSection, updateChecklistRows,
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
// §8.1: assessDataReached now REQUIRES an explicit E_feat (no unscoped path). These diagnostic
// tests exercise 401/403/5xx/empty/pass on the feature's OWN endpoint, so E_UNIT scopes to the
// `api()` helper's default url (/x). The scoping is a no-op here (every obs is the feature's) —
// the diagnostic under test is unchanged, but the call can no longer omit E_feat.
const E_UNIT = ['/x'];

test('§4 DECISIVE — empty-body 200 (skeleton) → FAILS tierB-empty-body', () => {
  // This is the exact false-proof: 200 OK but no data. A body-length shell check would PASS.
  for (const empty of ['', '[]', '{}', '{"data":[]}', '{"content":[],"totalElements":0}', 'null']) {
    const v = assessDataReached([api(200, empty)], E_UNIT);
    assert(v.passed === false, `empty body ${JSON.stringify(empty)} must FAIL, got pass`);
    assert(v.reason === 'tierB-empty-body', `expected tierB-empty-body for ${empty}, got ${v.reason}`);
  }
});
test('§4 — key API 401 → FAILS tierB-api-401 (stale-token render cannot pass)', () => {
  const v = assessDataReached([api(401, '{"message":"unauthorized"}')], E_UNIT);
  assert(v.passed === false && v.reason === 'tierB-api-401', `got ${v.reason}`);
});
test('§4 — key API 403 → FAILS tierB-api-403', () => {
  const v = assessDataReached([api(403, 'forbidden')], E_UNIT);
  assert(v.passed === false && v.reason === 'tierB-api-403', `got ${v.reason}`);
});
test('§4 — key API 500 → FAILS tierB-api-error', () => {
  const v = assessDataReached([api(500, '{"error":"boom"}')], E_UNIT);
  assert(v.passed === false && v.reason === 'tierB-api-error', `got ${v.reason}`);
});
test('§4 — no API observed (login redirect before fetch) → FAILS tierB-no-data-reached', () => {
  const v = assessDataReached([], E_UNIT);
  assert(v.passed === false && v.reason === 'tierB-no-data-reached', `got ${v.reason}`);
});
test('§4 — non-empty 200 (real rows) → PASSES data-reached', () => {
  const v = assessDataReached([api(200, '{"learners":[{"id":1,"name":"A"}]}')], E_UNIT);
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}: ${v.evidence}`);
});
test('§4 — top-level non-empty array → PASSES', () => {
  const v = assessDataReached([api(200, '[{"id":1}]')], E_UNIT);
  assert(v.passed === true, `array with rows must pass, got ${v.reason}`);
});
test('§4 — a 2xx-non-empty anywhere WINS over a sibling 401 (data did reach)', () => {
  const v = assessDataReached([api(401, '{}'), api(200, '{"rows":[{"x":1}]}')], E_UNIT);
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}`);
});
test('§4 — 401 is chosen over a bare 5xx as the more diagnostic failure', () => {
  const v = assessDataReached([api(500, ''), api(401, '')], E_UNIT);
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

// ── §8.1 AA.3 — feature-endpoint scope (deriveFeatureEndpoints + rescoped assessDataReached) ──
// Canary 2a. The severe blocker (L-2026-07-13-003, 6F): the broad api.fpt-apps.com|/api/ pattern
// PASSES §4 on a SIBLING page's data (class-edit fires its own api calls) while the feature's own
// data never loaded — a `verified=true` attesting the WRONG feature. E_feat scopes §4 to the
// feature's own endpoints, derived .http-primary + api.ts cross-check, fail-closed on divergence.

// A feature contract (.http) and its data-layer (api.ts) that AGREE on one endpoint:
//   GET /api/admin/v1/classes/{id}/progress-reports
// Real baseline-generated .http uses a `{{baseUrl}}` placeholder host (see __fixtures__/…/contract.full.http).
const FEATURE_HTTP = [
  '### Progress reports',
  'GET {{baseUrl}}/api/admin/v1/classes/{{classId}}/progress-reports',
  'Authorization: Bearer {{token}}',
].join('\n');
const FEATURE_API = [
  `import { getHttpClient } from 'infra';`,
  `export async function getProgressReports(classId: string): Promise<Report[]> {`,
  '  return getHttpClient().get(`${API_BASE_URL}/api/admin/v1/classes/${classId}/progress-reports`);',
  `}`,
].join('\n');
// api.ts that DRIFTED from the .http: singular `/progress-report` (missing trailing s).
const FEATURE_API_DRIFT = FEATURE_API.replace('/progress-reports`', '/progress-report`');

// Observed responses during a capture at /class-management/edit/1:
const FEAT_URL = 'https://api.fpt-apps.com/api/admin/v1/classes/1/progress-reports?page=0';
const SIBLING_URL = 'https://api.fpt-apps.com/api/admin/v1/classes/1'; // class-edit's OWN load call
const obs = (status: number, bodyText: string, url: string): ApiResponseObservation => ({ url, status, bodyText });
const NONEMPTY = '{"content":[{"id":1,"score":90}],"totalElements":1}';

// ── urlMatchesEndpoint: prefix + id-wildcard, does NOT match a shorter sibling ──
test('§8.1 — urlMatchesEndpoint matches feature url (id-wildcarded, query stripped)', () => {
  assert(urlMatchesEndpoint(FEAT_URL, '/api/admin/v1/classes/:p/progress-reports') === true, 'feature url must match');
});
test('§8.1 — urlMatchesEndpoint does NOT match a shorter sibling url', () => {
  assert(urlMatchesEndpoint(SIBLING_URL, '/api/admin/v1/classes/:p/progress-reports') === false, 'sibling must NOT match');
});

// ── deriveFeatureEndpoints: reconcile .http (H) vs api.ts (A) ──
test('§8.1 — deriveFeatureEndpoints: H === A → E_feat = agreed set', () => {
  const r = deriveFeatureEndpoints(FEATURE_HTTP, FEATURE_API, { dataGate: true });
  assert(r.applicable === true, 'agreed endpoints are applicable');
  assert(r.endpoints.length === 1 && r.endpoints[0] === '/api/admin/v1/classes/:p/progress-reports',
    `E_feat should be the agreed endpoint, got ${JSON.stringify(r.endpoints)}`);
});

// (a) SIBLING-ONLY — the AA.3 CORE: sibling 2xx-non-empty, feature endpoint never seen → FAIL.
test('§8.1 (a) SIBLING-ONLY → FAIL tierB-no-data-reached (the AA.3 core)', () => {
  const E = deriveFeatureEndpoints(FEATURE_HTTP, FEATURE_API, { dataGate: true }).endpoints;
  const v = assessDataReached([obs(200, NONEMPTY, SIBLING_URL)], E);
  assert(v.passed === false, `sibling data must NOT pass §4, got pass: ${v.evidence}`);
  assert(v.reason === 'tierB-no-data-reached', `expected tierB-no-data-reached, got ${v.reason}`);
});

// (b) FEATURE-PRESENT + sibling noise → PASS (feature data is what counts).
test('§8.1 (b) FEATURE-PRESENT (+ sibling noise) → PASS data-reached', () => {
  const E = deriveFeatureEndpoints(FEATURE_HTTP, FEATURE_API, { dataGate: true }).endpoints;
  const v = assessDataReached([obs(200, NONEMPTY, SIBLING_URL), obs(200, NONEMPTY, FEAT_URL)], E);
  assert(v.passed === true && v.reason === 'data-reached', `feature data must pass, got ${v.reason}: ${v.evidence}`);
});

// (c) SOURCE DIVERGENCE — .http says /progress-reports, api.ts calls /progress-report → STOP.
test('§8.1 (c) SOURCE DIVERGENCE → STOP tierB-endpoint-source-divergence (never silently reconcile)', () => {
  let threw: unknown = null;
  try { deriveFeatureEndpoints(FEATURE_HTTP, FEATURE_API_DRIFT, { dataGate: true }); }
  catch (e) { threw = e; }
  assert(threw instanceof EndpointDerivationError, `must throw EndpointDerivationError, got ${threw}`);
  const err = threw as EndpointDerivationError;
  assert(err.reason === 'tierB-endpoint-source-divergence', `expected divergence reason, got ${err.reason}`);
  // Both sets printed so the operator can see the drift.
  assert(err.httpSet.some((p) => p.endsWith('/progress-reports')), `httpSet must show .http endpoint, got ${JSON.stringify(err.httpSet)}`);
  assert(err.apiSet.some((p) => p.endsWith('/progress-report')), `apiSet must show api.ts endpoint, got ${JSON.stringify(err.apiSet)}`);
});

// REAL FEATURE — the reconciliation must NOT be so strict it STOPs a genuine feature (or Block 5
// stays stuck under tierB-endpoint-source-divergence). Uses the ACTUAL progress-reports fixture:
// the real contract.full.http (baseline convention, {{baseUrl}} host, trailing-slash-free paths,
// query strings) + the real feature data/api.ts (getConfig().API_BASE_URL host, URL-builder helpers,
// trailing slashes). H and A must reconcile to the same non-empty set of 4 endpoints.
test('§8.1 REAL — progress-reports fixture (actual .http + actual api.ts) reconciles cleanly, no divergence', () => {
  const FIX = path.join(__dirname, '__fixtures__', 'progress-reports');
  const httpText = fs.readFileSync(path.join(FIX, 'contract.full.http'), 'utf8');
  const apiText = fs.readFileSync(path.join(FIX, 'api.ts'), 'utf8');
  const r = deriveFeatureEndpoints(httpText, apiText, { dataGate: true }); // must NOT throw
  assert(r.applicable === true, 'real feature must be applicable (non-empty E_feat)');
  const expected = [
    '/api/admin/v1/classes/:p/progress-reports/assessment-analytics',
    '/api/admin/v1/classes/:p/progress-reports/export',
    '/api/admin/v1/classes/:p/progress-reports/learners',
    '/api/admin/v1/classes/:p/progress-reports/overview',
  ];
  assert(JSON.stringify(r.endpoints) === JSON.stringify(expected),
    `E_feat mismatch.\n  got:      ${JSON.stringify(r.endpoints)}\n  expected: ${JSON.stringify(expected)}`);
});

// §8.1 basePathPrefix — the double-/api base-URL bug (2026-08-07): API_BASE_URL itself carries a
// path segment (e.g. `http://host/api`), so the REAL runtime request lands at `/api/api/...`, but
// source-text parsing of the SAME `${getConfig().API_BASE_URL}/api/...` template in both .http and
// api.ts can only ever see the literal `/api/...` after the placeholder — H and A agree with each
// other (no divergence thrown) but BOTH are wrong relative to the real served path, so a genuine
// 2xx-non-empty response never matches E_feat. basePathPrefix fixes this by teaching the deriver
// what the placeholder itself resolves to. Reuses the same real progress-reports fixture as the
// §8.1 REAL test above — same H/A texts, only basePathPrefix differs.
test('§8.1 basePathPrefix — real fixture + basePathPrefix="/api" reconciles to the DOUBLE-/api set, still no divergence', () => {
  const FIX = path.join(__dirname, '__fixtures__', 'progress-reports');
  const httpText = fs.readFileSync(path.join(FIX, 'contract.full.http'), 'utf8');
  const apiText = fs.readFileSync(path.join(FIX, 'api.ts'), 'utf8');
  const r = deriveFeatureEndpoints(httpText, apiText, { dataGate: true }, '/api'); // must NOT throw
  assert(r.applicable === true, 'real feature must still be applicable with basePathPrefix set');
  const expected = [
    '/api/api/admin/v1/classes/:p/progress-reports/assessment-analytics',
    '/api/api/admin/v1/classes/:p/progress-reports/export',
    '/api/api/admin/v1/classes/:p/progress-reports/learners',
    '/api/api/admin/v1/classes/:p/progress-reports/overview',
  ];
  assert(JSON.stringify(r.endpoints) === JSON.stringify(expected),
    `E_feat mismatch.\n  got:      ${JSON.stringify(r.endpoints)}\n  expected: ${JSON.stringify(expected)}`);
});

test('§8.1 basePathPrefix — an observed double-/api URL now matches the corrected E_feat (was the RED case)', () => {
  const FIX = path.join(__dirname, '__fixtures__', 'progress-reports');
  const httpText = fs.readFileSync(path.join(FIX, 'contract.full.http'), 'utf8');
  const apiText = fs.readFileSync(path.join(FIX, 'api.ts'), 'utf8');
  const E = deriveFeatureEndpoints(httpText, apiText, { dataGate: true }, '/api').endpoints;
  const realObservedUrl = 'https://api.fpt-apps.com/api/api/admin/v1/classes/4/progress-reports/overview';
  const v = assessDataReached([obs(200, NONEMPTY, realObservedUrl)], E);
  assert(v.passed === true && v.reason === 'data-reached',
    `RED (before fix) was tierB-no-data-reached; GREEN expects data-reached, got ${v.reason}: ${v.evidence}`);
  // Sanity: WITHOUT basePathPrefix (the pre-fix E_feat), the same observed URL must NOT match —
  // proves the fix changed a real FAIL into a real PASS, not that the assertion is vacuous.
  const Eunfixed = deriveFeatureEndpoints(httpText, apiText, { dataGate: true }).endpoints;
  const vRed = assessDataReached([obs(200, NONEMPTY, realObservedUrl)], Eunfixed);
  assert(vRed.passed === false && vRed.reason === 'tierB-no-data-reached',
    `pre-fix E_feat must still fail on the double-/api observed URL (RED baseline), got ${vRed.reason}`);
});

// (d) EMPTY E_feat — opt-out vs fail-closed, per the gate flag.
test('§8.1 (d) EMPTY E_feat + --no-data-gate → skip (opt-out, applicable=false)', () => {
  const r = deriveFeatureEndpoints('', '', { dataGate: false });
  assert(r.applicable === false, 'empty E_feat under --no-data-gate is a sanctioned static opt-out');
  assert(r.endpoints.length === 0, 'no endpoints derived');
});
test('§8.1 (d) EMPTY E_feat + gate ON → STOP tierB-no-feature-endpoints (fail-closed)', () => {
  let threw: unknown = null;
  try { deriveFeatureEndpoints('', '', { dataGate: true }); }
  catch (e) { threw = e; }
  assert(threw instanceof EndpointDerivationError, `must throw, got ${threw}`);
  assert((threw as EndpointDerivationError).reason === 'tierB-no-feature-endpoints',
    `expected tierB-no-feature-endpoints, got ${(threw as EndpointDerivationError).reason}`);
});

// ── §8.2 AA.2 — re-assess §4 at the feature's data-ready POINT (Canary 2b) ──────────
// The feature's data fetch often fires only DURING interaction (e.g. ProgressReports loads only
// after the "Progress & reports" tab is clicked). v3.24 read apiObservations BEFORE the interaction
// steps → tierB-no-data-reached even with a fresh token + real API (false-FAIL). The assessment
// POINT moves: a named data-ready selector (assess right after it resolves, Z.2-capped) else after
// ALL interaction steps. Only the POINT moves — the page.on('response') listener is untouched.

// ── resolveDataAssessPoint — selector-present vs after-steps ──
test('§8.2 — named data-ready selector → assess-at-selector (bounded)', () => {
  const p = resolveDataAssessPoint('[data-testid="report-table"]');
  assert(p.kind === 'selector', `selector present → kind=selector, got ${p.kind}`);
  assert(p.kind === 'selector' && p.selector === '[data-testid="report-table"]', 'selector preserved');
  assert(p.kind === 'selector' && p.timeoutMs > 0 && p.timeoutMs <= 30_000, 'selector timeout bounded to Z.2 cap');
});
test('§8.2 — no/blank selector → assess-after-steps', () => {
  for (const s of [undefined, null, '', '   ']) {
    const p = resolveDataAssessPoint(s);
    assert(p.kind === 'after-steps', `blank ${JSON.stringify(s)} → after-steps, got ${p.kind}`);
  }
});
test('§8.2 — selector timeout hard-capped at 30s (Z.2 cap reused)', () => {
  const p = resolveDataAssessPoint('#x', { selectorTimeoutMs: 10_000_000, maxTimeoutMs: 30_000 });
  assert(p.kind === 'selector' && p.timeoutMs === 30_000, `capped to 30s, got ${(p as { timeoutMs?: number }).timeoutMs}`);
});

// ── finalizeDataReachedVerdict — the moved-point verdict, incl. distinct selector-timeout ──
const FEAT2 = 'https://api.fpt-apps.com/api/admin/v1/classes/1/progress-reports/overview';
const SIB2 = 'https://api.fpt-apps.com/api/admin/v1/classes/1';
const E2 = ['/api/admin/v1/classes/:p/progress-reports/overview'];
const NE2 = '{"content":[{"id":1}],"totalElements":1}';
const ob2 = (status: number, bodyText: string, url: string): ApiResponseObservation => ({ url, status, bodyText });
const SEL_POINT: DataAssessPoint = { kind: 'selector', selector: '#report', timeoutMs: 15_000 };
const STEPS_POINT: DataAssessPoint = { kind: 'after-steps' };

test('§8.2 — SELECTOR TIMED OUT → distinct FAIL tierB-data-ready-timeout (not no-data-reached)', () => {
  // Even if the feature endpoint DID respond, a timed-out data-ready selector is its own failure
  // class: the operator must be able to tell "selector wrong" from "backend never returned".
  const v = finalizeDataReachedVerdict({
    point: SEL_POINT, selectorTimedOut: true, observations: [ob2(200, NE2, FEAT2)], featureEndpoints: E2,
  });
  assert(v.passed === false, 'selector timeout must FAIL');
  assert(v.reason === 'tierB-data-ready-timeout', `expected tierB-data-ready-timeout, got ${v.reason}`);
});
test('§8.2 — selector RESOLVED + feature data present → PASS data-reached (at the point)', () => {
  const v = finalizeDataReachedVerdict({
    point: SEL_POINT, selectorTimedOut: false, observations: [ob2(200, NE2, FEAT2)], featureEndpoints: E2,
  });
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}: ${v.evidence}`);
});
test('§8.2 — after-steps + ONLY sibling data at the point → FAIL tierB-no-data-reached (AA.2+AA.3 join)', () => {
  const v = finalizeDataReachedVerdict({
    point: STEPS_POINT, selectorTimedOut: false, observations: [ob2(200, NE2, SIB2)], featureEndpoints: E2,
  });
  assert(v.passed === false && v.reason === 'tierB-no-data-reached', `sibling-at-point must FAIL, got ${v.reason}`);
});
test('§8.2 — after-steps + feature data present at the point → PASS data-reached', () => {
  const v = finalizeDataReachedVerdict({
    point: STEPS_POINT, selectorTimedOut: false, observations: [ob2(200, NE2, SIB2), ob2(200, NE2, FEAT2)], featureEndpoints: E2,
  });
  assert(v.passed === true && v.reason === 'data-reached', `got ${v.reason}`);
});
test('§8.2 — after-steps + zero observations at the point → FAIL tierB-no-data-reached (never benign)', () => {
  const v = finalizeDataReachedVerdict({
    point: STEPS_POINT, selectorTimedOut: false, observations: [], featureEndpoints: E2,
  });
  assert(v.passed === false && v.reason === 'tierB-no-data-reached', `zero-obs must FAIL, got ${v.reason}`);
});

// ── G-SUMMARY-TRUNCATE — replaceSummarySection (W3 pattern, canary hoist) ──────
// updateChecklistSummary's old tail was `text.replace(/## Summary[\s\S]*$/, newSummary)`:
// (1) SILENT-NOOP on any non-literal `## Summary` heading (e.g. `## 📊 Summary`), and
// (2) DATA-LOSS — `[\s\S]*$` eats every trailing section after Summary, not just Summary's
// own body. replaceSummarySection fixes both: heading-agnostic match via findHeadingLine,
// and bounded replacement (stops at the next `## ` heading, or EOF if Summary is last).

const R1_TEXT = [
  '# Checklist', '',
  '## Requirements Coverage', '',
  '| ID | Status |',
  '|----|--------|',
  '| REQ-001 | done |', '',
  '## Summary', '',
  '- OLD',
].join('\n');

test('G-SUMMARY-TRUNCATE R1 — plain heading, Summary is last section → replaced, content before untouched', () => {
  const newSummary = ['## Summary', '', '- NEW A', '- NEW B'].join('\n');
  const result = replaceSummarySection(R1_TEXT, newSummary);
  const beforeHeading = R1_TEXT.slice(0, R1_TEXT.indexOf('## Summary'));
  assert(result.startsWith(beforeHeading), 'content before the Summary heading must be byte-identical');
  assert(result.includes('- NEW A') && result.includes('- NEW B'), 'new summary content must appear');
  assert(!result.includes('- OLD'), 'old summary content must be gone');
});

// R2 — emoji heading. Under the ORIGINAL /## Summary[\s\S]*$/ regex this is a SILENT-NOOP:
// the literal string '## Summary' never matches '## 📊 Summary', so `updated === text`
// and the write guard skips writing — the section is simply never updated, forever.
const R2_TEXT = [
  '# Checklist', '',
  '## 📊 Summary', '',
  '- OLD',
].join('\n');

test('G-SUMMARY-TRUNCATE R2 — emoji heading `## 📊 Summary` must be found and replaced (current code SILENT-NOOPs)', () => {
  // Confirm the fixture actually contains the real codepoint, not a mojibake substitute.
  const emojiLine = R2_TEXT.split('\n')[2];
  assert(emojiLine.codePointAt(3) === 0x1F4CA, `fixture must contain U+1F4CA, got line: ${JSON.stringify(emojiLine)}`);

  const newSummary = ['## Summary', '', '- NEW A'].join('\n');
  const result = replaceSummarySection(R2_TEXT, newSummary);
  assert(!result.includes('- OLD'), 'emoji-headed Summary must be replaced, not left as-is (SILENT-NOOP fix)');
  assert(result.includes('- NEW A'), 'new summary content must appear');
});

// R3 — trailing section after Summary. Under the ORIGINAL regex, `[\s\S]*$` (no bound) eats
// EVERYTHING from '## Summary' to EOF, so a following '## Legend' section is destroyed.
const R3_TEXT = [
  '# Checklist', '',
  '## Summary', '',
  '- OLD', '',
  '## Legend', '',
  '| Icon | Meaning |',
  '|------|---------|',
  '| ✅ | pass |',
].join('\n');

test('G-SUMMARY-TRUNCATE R3 — trailing section after Summary survives byte-identical, Summary is replaced', () => {
  const newSummary = ['## Summary', '', '- NEW A'].join('\n');
  const result = replaceSummarySection(R3_TEXT, newSummary);
  const trailing = R3_TEXT.slice(R3_TEXT.indexOf('## Legend'));
  assert(result.includes(trailing), 'trailing ## Legend section must survive byte-identical (DATA-LOSS fix)');
  assert(!result.includes('- OLD'), 'old Summary content must be replaced');
  assert(result.includes('- NEW A'), 'new Summary content must appear');
});

// R4 — no Summary heading anywhere → append rather than silent no-op (buildPlaywrightInsert
// precedent, b11-runner.ts: never leave a "should have written" case as a no-op).
const R4_TEXT = [
  '# Checklist', '',
  '## Requirements Coverage', '',
  '| ID | Status |',
  '|----|--------|',
  '| REQ-001 | done |',
].join('\n');

test('G-SUMMARY-TRUNCATE R4 — no Summary heading anywhere → block is appended, original content intact', () => {
  const newSummary = ['## Summary', '', '- NEW A'].join('\n');
  const result = replaceSummarySection(R4_TEXT, newSummary);
  assert(result.startsWith(R4_TEXT), 'original content must be intact and appear first (append, not mutate)');
  assert(result.includes('- NEW A'), 'appended summary block must be present');
});

// R5 — CRLF round-trip. Byte-level count (not eyeballing): after stripping every CRLF pair,
// zero lone LF bytes may remain.
test('G-SUMMARY-TRUNCATE R5 — CRLF input preserves CRLF, no lone LF introduced (byte-level check)', () => {
  const before = ['# Checklist', '', '## Summary', '', '- OLD'].join('\r\n');
  const newSummary = ['## Summary', '', '- NEW A', '- NEW B'].join('\n'); // caller builds this with \n, same as real code
  const result = replaceSummarySection(before, newSummary);
  const crlfCount = (result.match(/\r\n/g) || []).length;
  const lfOnlyCount = (result.replace(/\r\n/g, '').match(/\n/g) || []).length;
  assert(crlfCount > 0, 'expected CRLF line breaks to be present in the CRLF fixture output');
  assert(lfOnlyCount === 0, `expected zero lone LF bytes, found ${lfOnlyCount}`);
});

// R6 — the template's actual shape: emoji heading AND a trailing section together.
const R6_TEXT = [
  '# Checklist', '',
  '## 📊 Summary', '',
  '- OLD', '',
  '## Legend', '',
  '| Icon | Meaning |',
  '|------|---------|',
  '| ✅ | pass |',
].join('\n');

test('G-SUMMARY-TRUNCATE R6 — emoji heading + trailing section together, both fixed simultaneously', () => {
  const newSummary = ['## Summary', '', '- NEW A'].join('\n');
  const result = replaceSummarySection(R6_TEXT, newSummary);
  const trailing = R6_TEXT.slice(R6_TEXT.indexOf('## Legend'));
  assert(!result.includes('- OLD'), 'emoji-headed Summary must be replaced');
  assert(result.includes('- NEW A'), 'new summary content must appear');
  assert(result.includes(trailing), 'trailing Legend section must survive byte-identical');
});

// ── G-COUNTSECTION-LITERAL-MATCH — countChecklistSection heading-agnostic match ──

const ACT_SECTION_LITERAL = [
  '# Checklist', '',
  '## ACT — Acceptance Test Cases', '',
  '| # | Test | Screen | Evidence | Status |',
  '|---|------|--------|----------|--------|',
  '| ACT-AC1 | check one | | ok | ✅ Pass |',
  '| ACT-AC2 | check two <!-- enforced-by: BE --> | | | ⚠️ |',
  '| ACT-AC3 | check three | | | ❌ Fail |',
  '', '## UX States', '',
  '| # | State | Screen | Evidence | Status |',
  '|---|-------|--------|----------|--------|',
  '| UX-1 | should not be counted in ACT | | | ⬜ |',
].join('\n');

test('countChecklistSection — literal heading still resolves (regression)', () => {
  const r = countChecklistSection(ACT_SECTION_LITERAL, 'ACT');
  assert(r.total === 2, `expected 2 non-BE rows, got ${r.total}`);
  assert(r.pass === 1, `expected 1 pass, got ${r.pass}`);
  assert(r.fail === 1, `expected 1 fail, got ${r.fail}`);
});

test('countChecklistSection — stops at next ## heading (lower bound preserved)', () => {
  const r = countChecklistSection(ACT_SECTION_LITERAL, 'ACT');
  assert(r.total === 2, 'UX-1 row from the next section must not leak into the ACT count');
});

// Same content, but the heading has drifted to the template's emoji form — the exact
// class of drift replaceSummarySection was already fixed for (G-SUMMARY-TRUNCATE).
const ACT_SECTION_EMOJI_HEADING = ACT_SECTION_LITERAL.replace(
  '## ACT — Acceptance Test Cases',
  '## 🧪 ACT — Acceptance Test Cases',
);

test('G-COUNTSECTION-LITERAL-MATCH — emoji-drifted heading still resolves (was silent zero)', () => {
  const r = countChecklistSection(ACT_SECTION_EMOJI_HEADING, 'ACT');
  assert(r.total === 2, `expected 2 non-BE rows on emoji heading, got ${r.total} (silent-zero bug if 0)`);
  assert(r.pass === 1, `expected 1 pass, got ${r.pass}`);
  assert(r.fail === 1, `expected 1 fail, got ${r.fail}`);
});

test('G-COUNTSECTION-LITERAL-MATCH — missing heading still returns all-zero, not a throw', () => {
  const r = countChecklistSection(ACT_SECTION_LITERAL, 'Nonexistent Section');
  assert(r.total === 0 && r.pass === 0 && r.fail === 0 && r.pending === 0, 'missing heading must return all-zero');
});

// ── §10.9 D9.2 — updateChecklistRows(deferInput) integration: writer stamps a DEFER marker
//    from real capture data, alongside (not instead of) the row's truthful Status/Evidence. ──

function withTempChecklist(body: string, fn: (checklistPath: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccheck-'));
  const p = path.join(dir, 'checklist.md');
  fs.writeFileSync(p, body, 'utf8');
  try { fn(p); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const ACT_TABLE_WITH_DEFER = [
  '# Checklist', '',
  '## ACT — Acceptance Test Cases', '',
  '| # | Test | Screen | Evidence | Status |',
  '|---|------|--------|----------|--------|',
  '| ACT-AC6 | select specific exam <!-- DEFER: §10.4 ; predicate:specific-exam-filter --> | Progress & Reports | | ⬜ |',
].join('\n');

test('updateChecklistRows(deferInput) — UNSATISFIED predicate: marker gets stamped, Status/Evidence stay the row\'s TRUTHFUL (failing) verdict — no fake-pass', () => {
  withTempChecklist(ACT_TABLE_WITH_DEFER, (p) => {
    // Real-shaped capture (mirrors the live-captured contract: exam 157, charts.empty=true — no
    // non-empty chart observed anywhere in this run) → specific-exam-filter is UNSATISFIED.
    const deferInput = {
      input: { perExamCharts: [{ empty: true }] },
      runRef: 'run-int-1',
    };
    updateChecklistRows(p, [{ id: 'ACT-AC6', passed: false, evidence: 'pr-status-chart not visible' }], deferInput);
    const out = fs.readFileSync(p, 'utf8');
    assert(out.includes('stamp:unsatisfied@run-int-1'), 'marker must carry the freshly evaluated unsatisfied stamp');
    assert(out.includes('❌ Fail'), 'Status cell must still show the row\'s REAL (failing) verdict — defer stamping never rewrites Status to a pass');
    assert(!out.includes('✅ Pass'), 'must never fake a pass on a row that genuinely failed, defer or not');
  });
});

test('updateChecklistRows(deferInput) — SATISFIED predicate: marker still stamped honestly (auto-invalidation signal), row unaffected otherwise', () => {
  withTempChecklist(ACT_TABLE_WITH_DEFER, (p) => {
    // A hypothetical run where a non-empty chart WAS observed — predicate flips to satisfied,
    // meaning (per §10.4/D9.1) this defer would auto-invalidate: the AC must be evaluated for
    // real, no grandfathering.
    const deferInput = {
      input: { perExamCharts: [{ empty: false }] },
      runRef: 'run-int-2',
    };
    updateChecklistRows(p, [{ id: 'ACT-AC6', passed: true, evidence: 'pr-status-chart visible' }], deferInput);
    const out = fs.readFileSync(p, 'utf8');
    assert(out.includes('stamp:satisfied@run-int-2'), 'marker must reflect the satisfied outcome');
    assert(out.includes('✅ Pass'), 'a genuinely-passing row must still show its real pass — stamping is additive, not a suppression mechanism');
  });
});

test('updateChecklistRows — omitted deferInput (existing callers) leaves a DEFER marker untouched, exactly the pre-this-session behavior', () => {
  withTempChecklist(ACT_TABLE_WITH_DEFER, (p) => {
    updateChecklistRows(p, [{ id: 'ACT-AC6', passed: false, evidence: 'x' }]);
    const out = fs.readFileSync(p, 'utf8');
    assert(out.includes('<!-- DEFER: §10.4 ; predicate:specific-exam-filter -->'), 'marker text must be byte-identical when no deferInput is supplied (backward compatibility)');
    assert(!out.includes('stamp:'), 'no stamp clause should appear without deferInput');
  });
});

// ── report ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
