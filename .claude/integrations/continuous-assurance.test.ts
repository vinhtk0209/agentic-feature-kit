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
  AssuranceReportError,
  detectSpecDrift,
  parseAssuranceManifest,
  runBattery,
  SPEC_REFETCH_SENTINEL,
  validateAuthoritativeBatteryReport,
} from './continuous-assurance';
import { SpecIR, sha256 } from './spec-ir';
import { KitVersionError, resolveCanonicalKitVersion } from './kit-version';

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

test('authoritative kit version resolver normalizes the sole PROMPT_VERSION and rejects missing, malformed, or duplicate declarations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-assurance-version-'));
  const commandDir = path.join(root, '.claude', 'commands');
  fs.mkdirSync(commandDir, { recursive: true });
  const commandFile = path.join(commandDir, 'feature-from-confluence.md');
  fs.writeFileSync(commandFile, 'PROMPT_VERSION:   v3.25\n', 'utf8');
  assert.strictEqual(resolveCanonicalKitVersion(root), '3.25.0');
  fs.writeFileSync(commandFile, 'PROMPT_VERSION: v3.25\nPROMPT_VERSION: v3.26\n', 'utf8');
  assert.throws(() => resolveCanonicalKitVersion(root), KitVersionError);
  fs.writeFileSync(commandFile, 'PROMPT_VERSION: v3.25.1\n', 'utf8');
  assert.throws(() => resolveCanonicalKitVersion(root), KitVersionError);
  fs.writeFileSync(commandFile, '# no version\n', 'utf8');
  assert.throws(() => resolveCanonicalKitVersion(root), KitVersionError);
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

test('version-scoped canaries bind canonical version, stable check id, status, evidence hash, and observed time deterministically', async () => {
  const parsed = parseAssuranceManifest(manifest());
  const first = await runBattery(parsed, {
    resolveKitVersion: () => '3.25.0',
    now: () => new Date('2026-08-10T00:00:00.000Z'),
    runCommand: () => ({ exitCode: 0, output: 'same evidence' }),
  });
  const second = await runBattery(parsed, {
    resolveKitVersion: () => '3.25.0',
    now: () => new Date('2026-08-11T00:00:00.000Z'),
    runCommand: () => ({ exitCode: 0, output: 'same evidence' }),
  });
  const canary = first.results[0].canary;
  assert.strictEqual(first.kitVersion, '3.25.0');
  assert.strictEqual(first.observedAt, '2026-08-10T00:00:00.000Z');
  assert.deepStrictEqual(canary, {
    kitVersion: '3.25.0',
    id: 'contract-attack',
    status: 'passed',
    evidenceHash: canary.evidenceHash,
    observedAt: '2026-08-10T00:00:00.000Z',
  });
  assert.match(canary.evidenceHash, /^[a-f0-9]{64}$/);
  assert.strictEqual(second.results[0].canary.evidenceHash, canary.evidenceHash, 'time fields must not affect evidence identity');
  assert.match(first.slackDigest, /kit 3\.25\.0/);
  assert.match(first.slackDigest, new RegExp(canary.evidenceHash));
  assert.deepStrictEqual(validateAuthoritativeBatteryReport(first), first);
});

test('Node test-runner timing metadata is excluded from evidence identity while semantic output remains hash-significant', async () => {
  const parsed = parseAssuranceManifest(manifest());
  const execute = (output: string) => runBattery(parsed, {
    resolveKitVersion: () => '3.25.0',
    now: () => new Date('2026-08-10T00:00:00.000Z'),
    runCommand: () => ({ exitCode: 0, output }),
  });
  const first = await execute('✔ exact contract (1.234ms)\nℹ duration_ms 12.345');
  const timingOnly = await execute('✔ exact contract (98.7ms)\nℹ duration_ms 999.1');
  const semanticChange = await execute('✔ wrong contract (1.234ms)\nℹ duration_ms 12.345');
  assert.strictEqual(first.results[0].canary.evidenceHash, timingOnly.results[0].canary.evidenceHash);
  assert.notStrictEqual(first.results[0].canary.evidenceHash, semanticChange.results[0].canary.evidenceHash);
  assert.notStrictEqual(first.results[0].output, timingOnly.results[0].output, 'raw transcripts remain exact');
});

test('authoritative canaries accept silent command output as exact evidence, not a malformed zero-like value', async () => {
  const report = await runBattery(parseAssuranceManifest(manifest()), {
    resolveKitVersion: () => '3.25.0',
    now: () => new Date('2026-08-10T00:00:00.000Z'),
    runCommand: () => ({ exitCode: 0, output: '' }),
  });
  assert.strictEqual(report.results[0].output, '');
  assert.match(report.slackDigest, /\(no output\)/);
  assert.match(report.results[0].canary.evidenceHash, /^[a-f0-9]{64}$/);
  assert.deepStrictEqual(validateAuthoritativeBatteryReport(report), report);
});

test('authoritative canary report fails closed on malformed versions, mismatched versions, malformed evidence, and duplicate checks', async () => {
  const report = await runBattery(parseAssuranceManifest(manifest()), {
    resolveKitVersion: () => '3.25.0',
    now: () => new Date('2026-08-10T00:00:00.000Z'),
    runCommand: () => ({ exitCode: 0, output: 'proof' }),
  });
  await assert.rejects(() => runBattery(parseAssuranceManifest(manifest()), {
    resolveKitVersion: () => 'v3.25',
    runCommand: () => ({ exitCode: 0, output: 'must not execute' }),
  }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({
    ...report,
    results: [{ ...report.results[0], canary: { ...report.results[0].canary, kitVersion: '3.24.0' } }],
  }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({
    ...report,
    results: [{ ...report.results[0], canary: { ...report.results[0].canary, evidenceHash: 'A'.repeat(64) } }],
  }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({
    ...report,
    results: [report.results[0], report.results[0]],
  }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({ ...report, unexpected: true }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({
    ...report,
    results: [{ ...report.results[0], unexpected: true }],
  }), AssuranceReportError);
  assert.throws(() => validateAuthoritativeBatteryReport({
    ...report,
    results: [{ ...report.results[0], canary: { ...report.results[0].canary, unexpected: true } }],
  }), AssuranceReportError);
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

test('spec-refetch-drift stages canonical Confluence B0 text, verifies hash/provenance, then detects drift', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-assurance-refetch-'));
  const baseline = ir('AC-1: Learner can view a progress report');
  fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(baseline), 'utf8');
  const sourceText = 'AC-1: Learner can export a progress report';
  const envelope = {
    v: 1,
    sourceRef: 'confluence:DEMO',
    sourceSha256: sha256(sourceText),
    sourceText,
  };
  const parsed = parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"fresh-spec","kind":"spec-refetch-drift","baselineIrPath":"baseline.json","actor":{"command":["node","actor.js"],"sourceRef":"confluence:DEMO"}}],
    "quarantine":[]
  }`);
  const report = await runBattery(parsed, { cwd: dir, runCommand: (argv) => {
    assert.deepStrictEqual(argv, ['node', 'actor.js']);
    return { exitCode: 0, output: `${SPEC_REFETCH_SENTINEL} ${JSON.stringify(envelope)}` };
  } });
  assert.strictEqual(report.gatePassed, false);
  assert.strictEqual(report.results[0].status, 'fail');
  assert.match(report.results[0].output, /confluence:DEMO/);
  assert.match(report.results[0].output, /export/);
  assert.match(report.slackDigest, /fresh-spec/);
});

test('spec-refetch-drift returns pass evidence when canonical baseline and refetch agree', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-assurance-refetch-pass-'));
  const sourceText = 'AC-1: Learner can view a progress report';
  fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(ir(sourceText)), 'utf8');
  const parsed = parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"fresh-spec","kind":"spec-refetch-drift","baselineIrPath":"baseline.json","actor":{"command":["node","actor.js"],"sourceRef":"confluence:DEMO"}}],
    "quarantine":[]
  }`);
  const report = await runBattery(parsed, { cwd: dir, runCommand: () => ({
    exitCode: 0,
    output: `${SPEC_REFETCH_SENTINEL} ${JSON.stringify({ v: 1, sourceRef: 'confluence:DEMO', sourceSha256: sha256(sourceText), sourceText })}`,
  }) });
  assert.strictEqual(report.gatePassed, true);
  assert.strictEqual(report.results[0].status, 'pass');
  assert.match(report.results[0].output, new RegExp(`sourceSha256=${sha256(sourceText)}`));
  assert.match(report.results[0].output, /drift=0/);
});

test('spec-refetch-drift rejects missing, duplicate, malformed, and hash-forged sentinel envelopes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'continuous-assurance-refetch-bad-'));
  fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(ir('AC-1: Learner can view')), 'utf8');
  const parsed = parseAssuranceManifest(`{
    "sentinel":"continuous-assurance/v1", "schemaVersion":1,
    "checks":[{"id":"fresh-spec","kind":"spec-refetch-drift","baselineIrPath":"baseline.json","actor":{"command":["node","actor.js"],"sourceRef":"confluence:DEMO"}}],
    "quarantine":[]
  }`);
  const badOutputs = [
    'ordinary actor output',
    `${SPEC_REFETCH_SENTINEL} {not json}`,
    `${SPEC_REFETCH_SENTINEL} {"v":1,"sourceRef":"confluence:OTHER","sourceSha256":"${sha256('AC-1: Learner can view')}","sourceText":"AC-1: Learner can view"}`,
    `${SPEC_REFETCH_SENTINEL} {"v":1,"sourceRef":"confluence:DEMO","sourceSha256":"${'0'.repeat(64)}","sourceText":"AC-1: Learner can view"}\n${SPEC_REFETCH_SENTINEL} {"v":1}`,
    `${SPEC_REFETCH_SENTINEL} {"v":1,"sourceRef":"confluence:DEMO","sourceSha256":"${'0'.repeat(64)}","sourceText":"AC-1: Learner can view"}`,
  ];
  for (const output of badOutputs) {
    const report = await runBattery(parsed, { cwd: dir, runCommand: () => ({ exitCode: 0, output }) });
    assert.strictEqual(report.gatePassed, false);
    assert.strictEqual(report.results[0].status, 'error');
  }
});

void Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
