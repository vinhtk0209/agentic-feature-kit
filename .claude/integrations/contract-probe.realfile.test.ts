/**
 * contract-probe.realfile.test.ts — regression tests against REAL flagship-generated files.
 *
 * These exist because the probe's original hand-written fixtures (`# Mock response:` JSON +
 * `export const … => `url`` api.ts) hid three walls that made it silently verify NOTHING on a real
 * `.http`. Every case here reads the byte-identical real US-AD-095 ProgressReports contract, api.ts,
 * and types.ts captured under __fixtures__/, so a regression to any of the three walls fails loudly.
 *
 * Standalone, no jest. Run:  npx tsx .claude/integrations/contract-probe.realfile.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseApiReturnTypes,
  parseExpectedShapes,
  probeContractDetailed,
  pickHttpFile,
  resolveContractHttp,
} from './contract-probe';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const FIX = path.join(__dirname, '__fixtures__', 'progress-reports');
const HTTP = fs.readFileSync(path.join(FIX, 'contract.full.http'), 'utf8');
const API = fs.readFileSync(path.join(FIX, 'api.ts'), 'utf8');
const TYPES = fs.readFileSync(path.join(FIX, 'types.ts'), 'utf8');

// ─── Wall 1: parseApiReturnTypes on real `export async function` + URL-helper api.ts ───────

test('Wall 1: parseApiReturnTypes extracts routes (regex parser returned 0 here)', () => {
  const routes = parseApiReturnTypes(API);
  assert(routes.length === 4, `expected 4 routes, got ${routes.length}: ${JSON.stringify(routes)}`);
});

test('Wall 1: routes resolve the URL-helper templates to the real normalized paths', () => {
  const routes = parseApiReturnTypes(API);
  const find = (m: string, sub: string) => routes.find((r) => r.method === m && r.path.includes(sub));

  const overview = find('GET', 'progress-reports/overview');
  assert(!!overview, `overview route missing: ${JSON.stringify(routes)}`);
  assert(overview!.path === '/api/admin/v1/classes/:p/progress-reports/overview', `bad overview path: ${overview!.path}`);
  assert(overview!.typeName === 'ProgressOverview' && overview!.isArray === false, `bad overview type: ${JSON.stringify(overview)}`);

  const analytics = find('GET', 'assessment-analytics');
  assert(!!analytics && analytics.typeName === 'AssessmentAnalytics', `bad analytics route: ${JSON.stringify(analytics)}`);

  const learners = find('GET', 'progress-reports/learners');
  assert(!!learners && learners.typeName === 'LearnerMetric' && learners.isArray === true, `learners must be LearnerMetric[]: ${JSON.stringify(learners)}`);

  const exp = find('POST', 'progress-reports/export');
  assert(!!exp && exp.typeName === 'ExportResult', `bad export route: ${JSON.stringify(exp)}`);
});

// ─── Wall 2: parseExpectedShapes on the real `### EXPECTED RESPONSE SHAPES` TS-prose ──────

test('Wall 2: parseExpectedShapes returns the top-level + nested contract interfaces', () => {
  const shapes = parseExpectedShapes(HTTP);
  for (const name of ['ProgressOverview', 'AssessmentAnalytics', 'LearnerMetric', 'ExportResult',
    'ExamOption', 'StatusBreakdown', 'ScoreBucket', 'OverTimePoint', 'LearnerScore']) {
    assert(shapes.has(name), `expected shape "${name}" to be parsed; got ${[...shapes.keys()].join(', ')}`);
  }
});

test('Wall 2: parsed contract fields match the prose (ProgressOverview, ScoreBucket nullable)', () => {
  const shapes = parseExpectedShapes(HTTP);
  const po = shapes.get('ProgressOverview')!;
  for (const f of ['completionRate', 'attendanceRate', 'totalLearners', 'totalEnrolled', 'hasPublishedAssessment', 'exams']) {
    assert(po.has(f), `ProgressOverview missing field ${f}`);
  }
  const exams = po.get('exams')!;
  assert(exams.type.kind === 'array' && exams.type.element.kind === 'ref' && exams.type.element.name === 'ExamOption', `exams should be ExamOption[]: ${JSON.stringify(exams.type)}`);

  const sb = shapes.get('ScoreBucket')!;
  const max = sb.get('max')!;
  assert(max.type.kind === 'primitive' && max.type.name === 'number' && max.type.nullable === true, `ScoreBucket.max should be nullable number: ${JSON.stringify(max.type)}`);
});

// ─── End-to-end: the whole point — a real field verification, not 0 ───────────────────────

test('E2E: probe verifies real fields with 0 errors (done-criteria: >=1 field, exit-clean)', () => {
  const { findings, verifiedFields } = probeContractDetailed({ httpText: HTTP, typesText: TYPES, apiText: API });
  const errors = findings.filter((f) => f.level === 'error');
  assert(verifiedFields >= 1, `expected >=1 verified field, got ${verifiedFields}`);
  assert(verifiedFields === 37, `expected 37 verified fields (full walk of 4 endpoints incl. nested), got ${verifiedFields}`);
  assert(errors.length === 0, `expected 0 errors on a types.ts generated from this contract, got ${errors.length}: ${JSON.stringify(errors)}`);
});

test('E2E: --get-only path (b11-runner mode) still verifies fields, 0 errors', () => {
  const { findings, verifiedFields } = probeContractDetailed({ httpText: HTTP, typesText: TYPES, apiText: API, getOnly: true });
  assert(verifiedFields === 35, `get-only should verify 35 fields (37 minus the 2 POST ExportResult fields), got ${verifiedFields}`);
  assert(findings.filter((f) => f.level === 'error').length === 0, 'get-only run must have 0 errors');
});

test('E2E: a contract field dropped from types.ts is caught as "missing" (proves it is not vacuous)', () => {
  const brokenTypes = TYPES.replace(/\n\s*hasPublishedAssessment: boolean;[^\n]*/, '');
  const { findings } = probeContractDetailed({ httpText: HTTP, typesText: brokenTypes, apiText: API });
  assert(findings.some((f) => f.kind === 'missing' && f.path.includes('hasPublishedAssessment') && f.level === 'error'),
    `dropping hasPublishedAssessment from types.ts must flag missing: ${JSON.stringify(findings.map((f) => ({ k: f.kind, p: f.path })))}`);
});

// ─── Wall 0: b11-runner .http lookup (docs/components first, prefer *.full.http) ───────────

test('Wall 0: pickHttpFile prefers *.full.http, falls back to *.http, else empty', () => {
  assert(pickHttpFile(['a.http', 'b.full.http']) === 'b.full.http', 'must prefer *.full.http');
  assert(pickHttpFile(['only.http']) === 'only.http', 'must fall back to any *.http');
  assert(pickHttpFile(['notes.md', 'types.ts']) === '', 'no .http → empty');
});

test('Wall 0: resolveContractHttp finds docs/components/<F> first, docs/specs fallback', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cprobe-'));
  const comp = path.join(tmp, 'docs', 'components', 'Feat');
  const specs = path.join(tmp, 'docs', 'specs', 'Feat');
  fs.mkdirSync(comp, { recursive: true });
  fs.mkdirSync(specs, { recursive: true });

  // Only specs has a .http → fallback used.
  fs.writeFileSync(path.join(specs, 'legacy.http'), '# x');
  assert(resolveContractHttp(comp, specs) === path.join(specs, 'legacy.http'), 'should fall back to docs/specs when components empty');

  // components gets the real .full.http → it wins over the specs fallback.
  fs.writeFileSync(path.join(comp, 'Feat.full.http'), '### EXPECTED RESPONSE SHAPES');
  assert(resolveContractHttp(comp, specs) === path.join(comp, 'Feat.full.http'), 'docs/components/*.full.http must win');

  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
