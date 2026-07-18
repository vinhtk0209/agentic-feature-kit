/**
 * contract-probe.defer.test.ts — §17.7 declared-defer mechanism for deriveFeatureEndpoints.
 *
 * Attack-tests T1–T6 (design §17.7.5). Hermetic: in-memory httpText/apiText fixtures only,
 * no dependency on any real repo file. Run:
 *   npx tsx --test .claude/integrations/contract-probe.defer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath } from './contract-probe';
import { deriveFeatureEndpoints, EndpointDerivationError } from './playwright-runner';

// ── Path templates (single-quoted → the `${…}` chars are LITERAL, normalizePath turns them into :p) ──
const P = {
  summary:  '/api/admin/v1/classes/${classId}/progress-summary',
  assess:   '/api/admin/v1/classes/${classId}/assessments',
  status:   '/api/admin/v1/classes/${classId}/assessment-status',
  perf:     '/api/admin/v1/classes/${classId}/assessment-performance',
  overTime: '/api/admin/v1/classes/${classId}/assessment-over-time',
  learners: '/api/admin/v1/classes/${classId}/learners',
  detail:   '/api/admin/v1/classes/${classId}/learners/${learnerId}/assessment-detail', // B7
  extra:    '/api/admin/v1/classes/${classId}/extra-endpoint',
};
const B1to6 = [P.summary, P.assess, P.status, P.perf, P.overTime, P.learners];

// ── Fixture builders ──
/** One `.http` request-block: `### title` separator, optional `# DEFER: …`, then the GET line. */
function httpBlock(path: string, defer?: string): string {
  const d = defer !== undefined ? `# DEFER: ${defer}\n` : '';
  return `### block ${path}\n${d}GET {{apiBaseUrl}}${path}\n\n`;
}
function httpDoc(blocks: string[]): string {
  return `# Contract fixture\n\n${blocks.join('')}`;
}
/** One api.ts call site: a Promise<T>-returning fn whose http-method call carries the template URL. */
function apiFn(name: string, path: string): string {
  return [
    `export async function ${name}(): Promise<Resp> {`,
    '  const { data } = await client.get(`' + path + '`);',
    '  return data as Resp;',
    '}',
  ].join('\n');
}
function apiDoc(entries: Array<[string, string]>): string {
  return entries.map(([n, p]) => apiFn(n, p)).join('\n\n');
}

const A6 = apiDoc([
  ['getSummary', P.summary], ['getAssessments', P.assess], ['getStatus', P.status],
  ['getPerf', P.perf], ['getOverTime', P.overTime], ['getLearners', P.learners],
]);

const ANCHORED = 'per §17.6 — drill-down out of scope; does-not-gate-verified-true';
const ANCHORLESS = 'skip for now';

const norm = (p: string) => normalizePath(p);
const expected6 = B1to6.map(norm).sort();
const B7norm = norm(P.detail);
const EXTRAnorm = norm(P.extra);
const LEARNERSnorm = norm(P.learners);

const opts = { dataGate: true } as const;

/** Assert the call throws an EndpointDerivationError with the divergence reason. */
function assertDivergence(fn: () => unknown): EndpointDerivationError {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof EndpointDerivationError, `expected EndpointDerivationError, got ${e}`);
    assert.equal((e as EndpointDerivationError).reason, 'tierB-endpoint-source-divergence',
      `expected divergence STOP, got reason=${(e as EndpointDerivationError).reason}`);
    return e as EndpointDerivationError;
  }
  throw new assert.AssertionError({ message: 'expected a STOP (throw), but the call returned' });
}

// ── T1: H=7 (B7 §-anchored # DEFER), A=6 → PASS, E_feat === the 6, B7 excluded ──
test('T1 — anchored defer on B7 → PASS, E_feat=6 (B7 excluded)', () => {
  const http = httpDoc([...B1to6.map((p) => httpBlock(p)), httpBlock(P.detail, ANCHORED)]);
  const res = deriveFeatureEndpoints(http, A6, opts);
  assert.equal(res.applicable, true);
  assert.deepEqual([...res.endpoints].sort(), expected6);
  assert.ok(!res.endpoints.includes(B7norm), 'B7 must NOT be in E_feat');
});

// ── T2 (PERMANENT): H=7 (B7 NO # DEFER), A=6 → STOP undeclaredMissing={B7} ──
test('T2 — B7 undeclared (no defer) → STOP divergence', () => {
  const http = httpDoc([...B1to6.map((p) => httpBlock(p)), httpBlock(P.detail)]);
  const err = assertDivergence(() => deriveFeatureEndpoints(http, A6, opts));
  assert.deepEqual(err.undeclaredMissing, [B7norm], 'B7 must be the undeclared-missing endpoint');
  assert.equal(err.extraInCode.length, 0, 'no endpoint in code that the contract lacks');
});

// ── T3: A has an endpoint not in H → STOP (extraInCode≠∅), even with a defer present ──
test('T3 — extra endpoint in api.ts → STOP even with B7 deferred', () => {
  const http = httpDoc([...B1to6.map((p) => httpBlock(p)), httpBlock(P.detail, ANCHORED)]); // B7 deferred
  const apiWithExtra = apiDoc([
    ['getSummary', P.summary], ['getAssessments', P.assess], ['getStatus', P.status],
    ['getPerf', P.perf], ['getOverTime', P.overTime], ['getLearners', P.learners], // full B1–6…
    ['getExtra', P.extra], // …PLUS an extra endpoint the contract lacks → pure extraInCode divergence
  ]);
  const err = assertDivergence(() => deriveFeatureEndpoints(http, apiWithExtra, opts));
  assert.ok(err.extraInCode.includes(EXTRAnorm), 'the extra endpoint must be reported in extraInCode');
  assert.equal(err.undeclaredMissing.length, 0, 'B7 is §-anchored-deferred → nothing undeclared-missing');
});

// ── T4: # DEFER on a non-B7 block while api.ts still lacks B7 → STOP (B7 still undeclared) ──
test('T4 — defer on wrong block, B7 still undeclared → STOP', () => {
  const http = httpDoc([
    httpBlock(P.summary, ANCHORED), // defer on B1 (present in A → irrelevant)
    ...B1to6.slice(1).map((p) => httpBlock(p)),
    httpBlock(P.detail), // B7 has NO defer
  ]);
  const err = assertDivergence(() => deriveFeatureEndpoints(http, A6, opts));
  assert.deepEqual(err.undeclaredMissing, [B7norm], 'B7 must be the undeclared-missing endpoint');
  assert.equal(err.extraInCode.length, 0, 'no endpoint in code that the contract lacks');
});

// ── T5 (backward-compat): no # DEFER anywhere, H===A → PASS (deferSet=∅) ──
test('T5 — no defer, H===A → PASS as before', () => {
  const http = httpDoc(B1to6.map((p) => httpBlock(p)));
  const res = deriveFeatureEndpoints(http, A6, opts);
  assert.equal(res.applicable, true);
  assert.deepEqual([...res.endpoints].sort(), expected6);
});

// ── T6 (PERMANENT): B7 has # DEFER but reason has NO §-anchor → STOP (anchorless=absent) ──
test('T6 — anchorless defer on B7 → STOP (orphan defer fails closed)', () => {
  const http = httpDoc([...B1to6.map((p) => httpBlock(p)), httpBlock(P.detail, ANCHORLESS)]);
  const err = assertDivergence(() => deriveFeatureEndpoints(http, A6, opts));
  assert.deepEqual(err.undeclaredMissing, [B7norm], 'B7 must be the undeclared-missing endpoint (anchorless defer ignored)');
  assert.equal(err.extraInCode.length, 0, 'no endpoint in code that the contract lacks');
});

// ── T7 (mixed divergence): B7 §-anchored-deferred, api.ts DROPS B6 AND ADDS an extra → a SINGLE
//    STOP must expose BOTH causes distinctly: undeclaredMissing=[B6] (H∖A, not deferred) and
//    extraInCode=[extra] (A∖H). Proves one throw carries both axes without conflation. ──
test('T7 — mixed divergence (drop B6 + add extra) → STOP exposing BOTH causes', () => {
  const http = httpDoc([...B1to6.map((p) => httpBlock(p)), httpBlock(P.detail, ANCHORED)]); // B7 deferred
  const apiMixed = apiDoc([
    ['getSummary', P.summary], ['getAssessments', P.assess], ['getStatus', P.status],
    ['getPerf', P.perf], ['getOverTime', P.overTime], // B1–5 present, B6 (getLearners) DROPPED…
    ['getExtra', P.extra], // …PLUS an extra endpoint the contract lacks → both axes non-empty
  ]);
  const err = assertDivergence(() => deriveFeatureEndpoints(http, apiMixed, opts));
  assert.deepEqual(err.undeclaredMissing, [LEARNERSnorm], 'B6 (learners) is missing from code, not deferred');
  assert.deepEqual(err.extraInCode, [EXTRAnorm], 'the extra endpoint is called by code but absent from the contract');
});
