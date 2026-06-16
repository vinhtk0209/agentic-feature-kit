/**
 * contract-probe.test.ts — tests for the contract↔types differ.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/contract-probe.test.ts
 */

import { probeContract, extractNullishFields, detectFallbackMasking, detectSuspectValues, type ContractFinding, type Shape } from './contract-probe';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
const has = (fs: ContractFinding[], kind: string, pathSub = '') =>
  fs.some((f) => f.kind === kind && f.path.includes(pathSub));

// Shared fixtures
const TYPES = [
  'export interface Foo {',
  '  id: string;',
  '  count: number;',
  '  maxPoints: number;',
  '  active: boolean;',
  '  nested: Bar;',
  '  items: Bar[];',
  '}',
  'export interface Bar {',
  '  label: string;',
  '  score: number | null;',
  '}',
].join('\n');

const API = [
  'export const getFoo = async (resourceId: string): Promise<Foo> => {',
  '  const { data } = await yourHttpClient().get(`${base()}/api/v1/foo/${resourceId}`);',
  '  return transformResponse(data) as Foo;',
  '};',
].join('\n');

function http(mock: unknown | null, path = '/api/v1/foo/{{courseId}}', method = 'GET'): string {
  const lines = ['###', `${method} {{baseUrl}}${path}`, 'Authorization: Bearer x', ''];
  if (mock === null) {
    lines.push('# Mock response:', '# HTTP/1.1 204 No Content');
  } else {
    lines.push('# Mock response:', '# HTTP/1.1 200 OK');
    JSON.stringify(mock, null, 2).split('\n').forEach((l) => lines.push(`# ${l}`));
  }
  return `${lines.join('\n')}\n`;
}

const cleanMock = {
  id: 'x', count: 3, max_points: 10, active: true,
  nested: { label: 'n', score: 5 },
  items: [{ label: 'a', score: null }],
};

// ─── Clean: snake→camel, nested ref, array, nullable all line up → no findings ───

test('clean contract matches types (snake→camel, nested, array, nullable null)', () => {
  const f = probeContract({ httpText: http(cleanMock), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.length === 0, `expected 0 findings, got ${f.length}: ${JSON.stringify(f)}`);
});

test('proves snake→camel: max_points maps to maxPoints (else it would be missing+extra)', () => {
  // Sanity: if camelization were broken, the clean case above would emit
  // missing(maxPoints) + extra(max_points). Its 0-findings result is the proof.
  const broken = { ...cleanMock };
  delete (broken as Record<string, unknown>).max_points;
  const f = probeContract({ httpText: http(broken), typesText: TYPES, apiText: API, getOnly: true });
  assert(has(f, 'missing', 'maxPoints'), 'a genuinely absent maxPoints must be flagged missing');
});

// ─── Drift detection ─────────────────────────────────────────────────────────────

test('missing required field → error', () => {
  const m = { ...cleanMock }; delete (m as Record<string, unknown>).count;
  const f = probeContract({ httpText: http(m), typesText: TYPES, apiText: API, getOnly: true });
  assert(has(f, 'missing', 'count'), 'must flag missing count');
  assert(f.some((x) => x.kind === 'missing' && x.level === 'error'), 'missing is error-level');
});

test('extra contract field not in type → warn', () => {
  const f = probeContract({ httpText: http({ ...cleanMock, surprise: 1 }), typesText: TYPES, apiText: API, getOnly: true });
  assert(has(f, 'extra', 'surprise'), 'must flag extra surprise');
  assert(f.find((x) => x.kind === 'extra')?.level === 'warn', 'extra is warn-level');
});

test('primitive type mismatch (number vs string) → error', () => {
  const f = probeContract({ httpText: http({ ...cleanMock, count: 'three' }), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.some((x) => x.kind === 'type_mismatch' && x.path === 'count' && x.level === 'error'), 'must flag count type mismatch');
});

test('drift inside an array element is found (items[0].score missing)', () => {
  const m = { ...cleanMock, items: [{ label: 'a' }] }; // score absent (required, nullable≠optional)
  const f = probeContract({ httpText: http(m), typesText: TYPES, apiText: API, getOnly: true });
  assert(has(f, 'missing', 'items[0].score'), 'must flag missing nested array field');
});

test('non-nullable field given null → type_mismatch error', () => {
  const m = { ...cleanMock, count: null };
  const f = probeContract({ httpText: http(m), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.some((x) => x.kind === 'type_mismatch' && x.path === 'count'), 'non-nullable null must be flagged');
});

test('endpoint with no matching api.ts return type → unmapped warn', () => {
  const f = probeContract({ httpText: http(cleanMock, '/api/v1/other/{{id}}'), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.some((x) => x.kind === 'unmapped' && x.level === 'warn'), 'unmapped endpoint flagged');
});

test('no JSON body (204) → info, never an error', () => {
  const f = probeContract({ httpText: http(null), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.some((x) => x.kind === 'no_response' && x.level === 'info'), 'no-body endpoint reported as info');
  assert(!f.some((x) => x.level === 'error'), 'no errors for a bodyless endpoint');
});

test('get-only skips non-GET endpoints', () => {
  const f = probeContract({ httpText: http(cleanMock, '/api/v1/foo/{{courseId}}', 'DELETE'), typesText: TYPES, apiText: API, getOnly: true });
  assert(f.length === 0, 'DELETE endpoint skipped under get-only');
});

// ─── L-09 drift classes ───────────────────────────────────────────────────────

// ── extractNullishFields ──────────────────────────────────────────────
test('extractNullishFields — detects .field ?? 0 pattern', () => {
  const fields = extractNullishFields('const v = item.score ?? 0;');
  assert(fields.has('score'), 'score ?? 0 should be extracted');
});

test('extractNullishFields — detects ?.field ?? "" pattern', () => {
  const fields = extractNullishFields("const v = item?.label ?? '';");
  assert(fields.has('label'), "label ?? '' should be extracted");
});

test('extractNullishFields — ignores non-literal fallbacks', () => {
  const fields = extractNullishFields('const v = item.score ?? getDefault();');
  assert(!fields.has('score'), 'non-literal fallback must not be flagged');
});

// Extended TYPES with an optional 'score' at the top level (for fallback_masking tests)
// and a 'text' field (for suspect_value tests). These additions don't break existing tests
// since the clean mock simply won't have those fields (they're optional).
const TYPES_EXT = [
  'export interface Foo {',
  '  id: string;',
  '  count: number;',
  '  maxPoints: number;',
  '  active: boolean;',
  '  nested: Bar;',
  '  items: Bar[];',
  '  score?: number;', // optional — compareShape won't flag if absent; fallback_masking will
  '  text?: string;',  // optional — for suspect_value tests
  '}',
  'export interface Bar {',
  '  label: string;',
  '  score: number | null;',
  '}',
].join('\n');

// ── fallback_masking ──────────────────────────────────────────────────
test('fallback_masking — optional type field with ?? absent from contract → error (not "missing")', () => {
  // score is optional in Foo (so compareShape will NOT flag it as missing) but
  // api.ts reads data.score ?? 0 — the fallback masks the absent field.
  const apiWithFallback = [
    'export const getFoo = async (id: string): Promise<Foo> => {',
    '  const { data } = await yourHttpClient().get(`${base()}/api/v1/foo/${id}`);',
    '  return { ...transformResponse(data), score: data.score ?? 0 };',
    '};',
  ].join('\n');
  // cleanMock has no top-level 'score' → absent; compareShape skips it (optional)
  const f = probeContract({ httpText: http(cleanMock), typesText: TYPES_EXT, apiText: apiWithFallback, getOnly: true });
  assert(!f.some((x) => x.kind === 'missing' && x.path === 'score'), 'optional field must not be flagged as missing');
  assert(f.some((x) => x.kind === 'fallback_masking' && x.level === 'error' && x.path === 'score'), `expected fallback_masking for score, got: ${JSON.stringify(f.map((x) => ({ kind: x.kind, path: x.path })))}`);
});

test('fallback_masking — field present in contract → no fallback_masking', () => {
  // count is present in cleanMock (value 3) and api reads data.count ?? 0 — no masking
  const apiWithFallback = [
    'export const getFoo = async (id: string): Promise<Foo> => {',
    '  const { data } = await yourHttpClient().get(`${base()}/api/v1/foo/${id}`);',
    '  return { ...transformResponse(data), count: data.count ?? 0 };',
    '};',
  ].join('\n');
  const f = probeContract({ httpText: http(cleanMock), typesText: TYPES, apiText: apiWithFallback, getOnly: true });
  assert(!f.some((x) => x.kind === 'fallback_masking'), `must not flag fallback_masking when field is present: ${JSON.stringify(f.filter((x) => x.kind === 'fallback_masking'))}`);
});

test('fallback_masking — field not in type → not flagged even with ??', () => {
  const apiWithUnknown = API.replace('return transformResponse(data) as Foo;', 'return { ...transformResponse(data), x: data.unknownField ?? 0 } as Foo;');
  const f = probeContract({ httpText: http(cleanMock), typesText: TYPES, apiText: apiWithUnknown, getOnly: true });
  assert(!f.some((x) => x.kind === 'fallback_masking' && x.path === 'unknownField'), 'field not in type must not generate fallback_masking');
});

// ── suspect_value ─────────────────────────────────────────────────────
test('suspect_value — two top-level string fields share same value (text === id) → warn', () => {
  // Both id and text equal 'abc-123' in the response — suspect wrong-field data
  const suspectMock = { id: 'abc-123', count: 3, max_points: 10, active: true, text: 'abc-123', nested: { label: 'n', score: 5 }, items: [] };
  const f = probeContract({ httpText: http(suspectMock), typesText: TYPES_EXT, apiText: API, getOnly: true });
  assert(f.some((x) => x.kind === 'suspect_value' && x.level === 'warn'), `expected suspect_value warn, got: ${JSON.stringify(f.map((x) => x.kind))}`);
});

test('suspect_value — all string fields have unique values → no suspect_value', () => {
  // cleanMock: id='x' is the only top-level string field in Foo
  const f = probeContract({ httpText: http(cleanMock), typesText: TYPES, apiText: API, getOnly: true });
  assert(!f.some((x) => x.kind === 'suspect_value'), `clean contract must not emit suspect_value: ${JSON.stringify(f.filter((x) => x.kind === 'suspect_value'))}`);
});

test('suspect_value — extra (unmodeled) field with same value as typed field does not trigger', () => {
  // 'surprise' is not in the Foo type → detectSuspectValues skips it; id='x' has no pair
  const mockWithExtra = { ...cleanMock, surprise: 'x' };
  const f = probeContract({ httpText: http(mockWithExtra), typesText: TYPES, apiText: API, getOnly: true });
  assert(!f.some((x) => x.kind === 'suspect_value'), 'unmodeled extra fields must not pair with typed fields for suspect_value');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
