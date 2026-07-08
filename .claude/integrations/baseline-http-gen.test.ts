/**
 * baseline-http-gen.test.ts — tests the baseline `.http` generator against the REAL byte-identical
 * ProgressReports fixtures (same __fixtures__/ the contract-probe realfile test uses).
 *
 * The acceptance bar is the ROUND-TRIP: the emitted contract, fed straight back through
 * `probeContractDetailed` against the same types.ts, must verify with 0 errors — AND a
 * non-vacuity test proves the probe would actually catch a divergence (a dropped types field).
 *
 * Standalone, no jest. Run:  npx tsx .claude/integrations/baseline-http-gen.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { probeContractDetailed, parseApiReturnTypes, extractInterfaces } from './contract-probe';
import {
  generateBaselineHttp,
  emitContract,
  toRequestUrl,
  renderFieldType,
  reachableInterfaces,
} from './baseline-http-gen';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const FIX = path.join(__dirname, '__fixtures__', 'progress-reports');
const API = fs.readFileSync(path.join(FIX, 'api.ts'), 'utf8');
const TYPES = fs.readFileSync(path.join(FIX, 'types.ts'), 'utf8');
const FEATURE = 'US-AD-095-ProgressReports';

const HTTP = generateBaselineHttp(API, TYPES, FEATURE);

// ─── (a) emit shape: request blocks, methods, paths, query preserved ───────────────

test('emits 4 request lines with the right methods', () => {
  const reqs = HTTP.split('\n').filter((l) => /^(GET|POST|PUT|DELETE|PATCH)\s/.test(l));
  assert(reqs.length === 4, `expected 4 request lines, got ${reqs.length}:\n${reqs.join('\n')}`);
  assert(reqs.filter((l) => l.startsWith('GET ')).length === 3, 'expected 3 GET lines');
  assert(reqs.filter((l) => l.startsWith('POST ')).length === 1, 'expected 1 POST line');
});

test('request URLs start at {{baseUrl}}/api and map ${classId} → {{class_id}}', () => {
  assert(HTTP.includes('GET {{baseUrl}}/api/admin/v1/classes/{{class_id}}/progress-reports/overview/'),
    `overview URL not emitted as expected:\n${HTTP}`);
  assert(!/\$\{/.test(HTTP), `raw \${...} placeholder leaked into output:\n${HTTP}`);
});

test('query string is preserved on analytics + learners (normalizePath drops it — rawPath does not)', () => {
  assert(HTTP.includes('assessment-analytics/?assessment_id={{assessment_id}}'), 'analytics query missing');
  assert(HTTP.includes('learners/?assessment_id={{assessment_id}}'), 'learners query missing');
});

test('emits @baseUrl + @class_id + @assessment_id variable declarations', () => {
  assert(/^@baseUrl = /m.test(HTTP), '@baseUrl missing');
  assert(/^@class_id = 1$/m.test(HTTP), '@class_id default missing');
  assert(/^@assessment_id = all$/m.test(HTTP), '@assessment_id default missing');
});

// ─── (b) ROUND-TRIP: emitted .http is probe-verifiable against the same types.ts ────

test('ROUND-TRIP: emitted contract verifies with 0 errors + 37 fields (== human-written contract)', () => {
  const { findings, verifiedFields } = probeContractDetailed({ httpText: HTTP, typesText: TYPES, apiText: API });
  const errors = findings.filter((f) => f.level === 'error');
  assert(errors.length === 0, `expected 0 errors, got ${errors.length}: ${JSON.stringify(errors, null, 2)}`);
  assert(verifiedFields === 37, `expected 37 verified fields (parity with hand-written contract), got ${verifiedFields}`);
});

// ─── (b') NON-VACUITY: the round-trip is not vacuously passing ─────────────────────

test('NON-VACUITY: dropping a modeled field from types.ts makes the emitted contract flag it', () => {
  // Contract still declares completionRate (emitted from the full api/types); a types.ts that no
  // longer models it → contract=source-of-truth → a `missing` error. Proves the probe has teeth.
  const brokenTypes = TYPES.replace(/\n\s*completionRate: number;[^\n]*/, '\n  // removed for test');
  assert(brokenTypes !== TYPES, 'test setup failed: completionRate line not found in types.ts');
  const { findings } = probeContractDetailed({ httpText: HTTP, typesText: brokenTypes, apiText: API });
  const hit = findings.find((f) => f.level === 'error' && f.kind === 'missing' && /completionRate/.test(f.path));
  assert(!!hit, `expected a 'missing' error for completionRate, got: ${JSON.stringify(findings.filter((f) => f.level === 'error'), null, 2)}`);
});

// ─── (c) type/union aliases are refs, never fabricated as interfaces ───────────────

test('type/union aliases (AssessmentFilterValue, LearnerAssessmentStatus, ExportFormat) render as refs, not fabricated interfaces', () => {
  // They must appear as field types…
  assert(HTTP.includes('assessmentStatus: LearnerAssessmentStatus;'), 'LearnerAssessmentStatus ref missing');
  assert(HTTP.includes('format: ExportFormat;'), 'ExportFormat ref missing');
  assert(HTTP.includes('assessmentId: AssessmentFilterValue;'), 'AssessmentFilterValue ref missing');
  // …but NEVER be emitted as their own `# Name {` interface block.
  for (const alias of ['LearnerAssessmentStatus', 'ExportFormat', 'AssessmentFilterValue']) {
    assert(!new RegExp(`^# ${alias} \\{`, 'm').test(HTTP), `${alias} was fabricated as an interface block`);
  }
});

// ─── (d) rawPath is populated (guards the new RouteType field) ─────────────────────

test('rawPath is populated on all routes (the field baseline-gen depends on)', () => {
  const routes = parseApiReturnTypes(API);
  assert(routes.length === 4, `expected 4 routes, got ${routes.length}`);
  for (const r of routes) {
    assert(typeof r.rawPath === 'string' && r.rawPath.includes('/api'), `route ${r.method} ${r.path} has no usable rawPath: ${r.rawPath}`);
  }
  // The analytics rawPath must still carry the query that `path` strips.
  const analytics = routes.find((r) => r.typeName === 'AssessmentAnalytics')!;
  assert(/assessment_id=\$\{assessmentId\}/.test(analytics.rawPath ?? ''), `rawPath lost the query: ${analytics.rawPath}`);
  assert(!analytics.path.includes('assessment_id'), `path should NOT carry the query: ${analytics.path}`);
});

// ─── (e) unit-level guards for the helpers ─────────────────────────────────────────

test('toRequestUrl: slices at /api, snake-cases vars, preserves query', () => {
  const { url, vars } = toRequestUrl('${getConfig().API_BASE_URL}/api/v1/classes/${classId}/x/?assessment_id=${assessmentId}');
  assert(url === '{{baseUrl}}/api/v1/classes/{{class_id}}/x/?assessment_id={{assessment_id}}', `bad url: ${url}`);
  assert(vars.join(',') === 'class_id,assessment_id', `bad vars: ${vars}`);
});

test('renderFieldType: nullable + array + ref round-trip forms', () => {
  assert(renderFieldType({ kind: 'primitive', name: 'number', nullable: true }) === 'number | null', 'nullable primitive');
  assert(renderFieldType({ kind: 'array', element: { kind: 'ref', name: 'ExamOption', nullable: false }, nullable: false }) === 'ExamOption[]', 'array of ref');
  assert(renderFieldType({ kind: 'ref', name: 'LearnerScore', nullable: true }) === 'LearnerScore | null', 'nullable ref');
});

test('reachableInterfaces: transitive closure over refs, skips aliases', () => {
  const shapes = extractInterfaces(TYPES);
  const reach = reachableInterfaces(['ProgressOverview'], shapes);
  assert(reach.includes('ProgressOverview') && reach.includes('ExamOption'), `overview closure missing ExamOption: ${reach}`);
  assert(!reach.includes('AssessmentFilterValue'), 'alias leaked into closure');
});

// ─── (f) emitContract is pure over injected inputs (no I/O) ────────────────────────

test('emitContract is deterministic (same inputs → identical output)', () => {
  const routes = parseApiReturnTypes(API);
  const shapes = extractInterfaces(TYPES);
  const a = emitContract({ routes, shapes, featureName: FEATURE });
  const b = emitContract({ routes, shapes, featureName: FEATURE });
  assert(a === b, 'emitContract not deterministic');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
