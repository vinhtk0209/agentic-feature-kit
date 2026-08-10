/**
 * Attack tests for O2 continuous assurance.  The runner must be usable by the
 * scheduler, but these tests keep the safety semantics hermetic and deterministic.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AssuranceManifestError,
  detectSpecDrift,
  parseAssuranceManifest,
  runBattery,
} from './continuous-assurance';
import { SpecIR, sha256 } from './spec-ir';

let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  pending.push(Promise.resolve().then(fn).then(
    () => { passed += 1; console.log(`✅ ${name}`); },
    (error) => { failed += 1; console.error(`❌ ${name}\n     ${(error as Error).message}`); },
  ));
}

function ir(ac: string, anchor = 'line:3'): SpecIR {
  const paragraphs = [{ anchor, text: ac }];
  return {
    schemaVersion: 1,
    sourceKind: 'raw-us',
    sourceRef: 'confluence:DEMO',
    sourceSha256: sha256(ac),
    title: 'Demo',
    paragraphs,
    acceptanceCriteria: [{ id: 'AC-1', text: ac, sourceAnchor: anchor, sourceQuote: ac }],
    warnings: [],
  };
}

const manifest = (extra = '') => `{
  "sentinel": "continuous-assurance/v1",
  "schemaVersion": 1,
  "checks": [{"id":"contract-attack","kind":"command","command":["node","test.js"]}],
  "quarantine": []${extra}
}`;

test('drift false-positive corpus: whitespace/case/AC-number cosmetics produce no drift', () => {
  const result = detectSpecDrift(ir('AC-1: Learner can view a progress report'), ir('ac 1: learner   can view a progress report.'));
  assert.deepStrictEqual(result, []);
});

test('drift semantic AC edit is flagged with old and new quote-level provenance', () => {
  const result = detectSpecDrift(ir('AC-1: Learner can view a progress report', 'line:3'), ir('AC-1: Learner can export a progress report', 'line:9'));
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'changed');
  assert.strictEqual(result[0].before?.sourceAnchor, 'line:3');
  assert.match(result[0].before?.sourceQuote ?? '', /view/);
  assert.strictEqual(result[0].after?.sourceAnchor, 'line:9');
  assert.match(result[0].after?.sourceQuote ?? '', /export/);
});

test('drift input with duplicate AC ids fails closed through canonical Spec-IR validation', () => {
  const malformed = ir('AC-1: first');
  malformed.acceptanceCriteria.push({ id: 'AC-1', text: 'AC-2: second', sourceAnchor: 'line:3', sourceQuote: 'AC-1: first' });
  assert.throws(() => detectSpecDrift(malformed, ir('AC-1: first')), /duplicate AC id/);
});

test('assurance manifest rejects missing, malformed, and duplicate sentinels', () => {
  assert.throws(() => parseAssuranceManifest(manifest().replace('"sentinel": "continuous-assurance/v1",\n  ', '')), AssuranceManifestError);
  assert.throws(() => parseAssuranceManifest(manifest().replace('continuous-assurance/v1', 'continuous-assurance/v2')), AssuranceManifestError);
  assert.throws(() => parseAssuranceManifest(manifest().replace('"schemaVersion"', '"sentinel":"continuous-assurance/v1",\n  "schemaVersion"')), AssuranceManifestError);
});

test('assurance manifest rejects duplicate check and quarantine ids before any command runs', () => {
  assert.throws(() => parseAssuranceManifest(manifest(', "checks": []')), AssuranceManifestError);
  assert.throws(() => parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"same","kind":"command","command":["node","test.js"]},{"id":"same","kind":"command","command":["node","test.js"]}],
    "quarantine":[{"checkId":"same","reason":"known flake"}]
  }`), AssuranceManifestError);
});

test('seeded regression in a quarantined check still runs and surfaces in the Slack digest', async () => {
  const parsed = parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"known-flake","kind":"command","command":["node","test.js"]}],
    "quarantine":[{"checkId":"known-flake","reason":"seeded regression"}]
  }`);
  const report = await runBattery(parsed, {
    runCommand: () => ({ exitCode: 1, output: 'real regression' }),
  });
  assert.strictEqual(report.gatePassed, true, 'quarantine may hide from the gate only');
  assert.strictEqual(report.results[0].executed, true, 'quarantine must not skip execution');
  assert.strictEqual(report.results[0].quarantined, true);
  assert.match(report.slackDigest, /QUARANTINED FAILED.*known-flake/s);
  assert.match(report.slackDigest, /real regression/);
});

test('non-quarantined regression blocks the nightly gate and is reported', async () => {
  const parsed = parseAssuranceManifest(manifest());
  const report = await runBattery(parsed, {
    runCommand: () => ({ exitCode: 1, output: 'contract regression' }),
  });
  assert.strictEqual(report.gatePassed, false);
  assert.match(report.slackDigest, /FAILED.*contract-attack/s);
});

test('contract-probe battery check uses the existing parser and blocks a real shape mismatch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-assurance-contract-'));
  fs.writeFileSync(path.join(dir, 'contract.http'), '### item\nGET /api/item\n# Mock response:\n# HTTP/1.1 200 OK\n# {"name": 7}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'types.ts'), 'export interface Item { name: string; }', 'utf8');
  fs.writeFileSync(path.join(dir, 'api.ts'), 'export async function getItem(): Promise<Item> { return client.get(`/api/item`); }', 'utf8');
  const parsed = parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"shape","kind":"contract-probe","httpPath":"contract.http","typesPath":"types.ts","apiPath":"api.ts"}],
    "quarantine":[]
  }`);
  const report = await runBattery(parsed, { cwd: dir });
  assert.strictEqual(report.gatePassed, false);
  assert.strictEqual(report.results[0].status, 'fail');
  assert.match(report.results[0].output, /contract error/);
});

void Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
