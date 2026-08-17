/**
 * Deterministic feature-identity canary.
 *
 * Run: npx tsx .claude/integrations/feature-identity.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { FeatureIdentityError, parseFeatureIdentityOutput, resolveFeatureIdentity } from './feature-identity';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (error) { failed += 1; console.log(`❌ ${name}\n     ${(error as Error).stack ?? (error as Error).message}`); }
}
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }
function tempRepo(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'feature-identity-')); }
function makeSpecDir(cwd: string, name: string): void { fs.mkdirSync(path.join(cwd, 'docs', 'specs', name), { recursive: true }); }
function resolveLoadedTsxCli(): string {
  const local = path.resolve(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(local)) return local;
  const loaded = Object.keys(require.cache).find((candidate) => /[\\/]node_modules[\\/]tsx[\\/]dist[\\/]register-[^\\/]+\.cjs$/.test(candidate));
  if (!loaded) throw new Error('test harness: unable to locate the loaded tsx runtime');
  const marker = `${path.sep}node_modules${path.sep}tsx${path.sep}`;
  const index = loaded.lastIndexOf(marker);
  if (index < 0) throw new Error('test harness: loaded tsx path is malformed');
  return path.join(loaded.slice(0, index), 'node_modules', 'tsx', 'dist', 'cli.mjs');
}
function assertIdentityError(fn: () => void, reason: string): void {
  try { fn(); } catch (error) {
    assert(error instanceof FeatureIdentityError, `expected FeatureIdentityError, got ${(error as Error).constructor?.name}`);
    assert((error as FeatureIdentityError).reason === reason, `expected reason ${reason}, got ${(error as FeatureIdentityError).reason}`);
    return;
  }
  throw new Error(`expected ${reason} failure, got success`);
}

test('unique ticket folder is reused even when a new run suggests a different title', () => {
  const cwd = tempRepo();
  makeSpecDir(cwd, 'US-AD-095-ProgressReports');
  const result = resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: 'ClassDetailsProgressReports' });
  assert(result.featureName === 'US-AD-095-ProgressReports', `unexpected identity: ${JSON.stringify(result)}`);
  assert(result.source === 'existing', 'unique existing folder must win');
});

test('no ticket folder yields one deterministic proposed identity', () => {
  const cwd = tempRepo();
  const first = resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: 'ProgressReports' });
  const second = resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: 'ProgressReports' });
  assert(first.featureName === 'US-AD-095-ProgressReports', `unexpected proposed name: ${first.featureName}`);
  assert(JSON.stringify(first) === JSON.stringify(second), 'same inputs must produce byte-equivalent identity data');
  assert(first.source === 'proposed', 'absent folder must be proposed, not falsely existing');
});

test('multiple ticket folders fail closed instead of choosing by enumeration order', () => {
  const cwd = tempRepo();
  makeSpecDir(cwd, 'US-AD-095-ProgressReports');
  makeSpecDir(cwd, 'US-AD-095-ClassDetailsProgressReports');
  assertIdentityError(() => resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: 'ProgressReports' }), 'ambiguous-ticket-folders');
});

test('malformed ticket and traversal-like suggestion fail before filesystem writes', () => {
  const cwd = tempRepo();
  assertIdentityError(() => resolveFeatureIdentity({ cwd, ticketId: '../US-AD-095', suggestedFeatureName: 'ProgressReports' }), 'invalid-ticket-id');
  assertIdentityError(() => resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: '../ProgressReports' }), 'invalid-suggested-name');
  assert(!fs.existsSync(path.join(cwd, 'docs')), 'resolver must be read-only and leave no directories');
});

test('CLI emits exactly one canonical sentinel and ambiguity emits none', () => {
  const cwd = tempRepo();
  makeSpecDir(cwd, 'US-AD-095-ProgressReports');
  const cli = path.resolve(__dirname, 'feature-identity.ts');
  const tsxCli = resolveLoadedTsxCli();
  const ok = spawnSync(process.execPath, [tsxCli, cli, 'resolve', 'US-AD-095', 'ClassDetailsProgressReports'], { cwd, encoding: 'utf8' });
  assert(ok.status === 0, `CLI should pass: ${ok.stderr}`);
  assert((ok.stdout.match(/@@FEATURE_IDENTITY@@/g) ?? []).length === 1, `expected one sentinel: ${ok.stdout}`);
  makeSpecDir(cwd, 'US-AD-095-ClassDetailsProgressReports');
  const bad = spawnSync(process.execPath, [tsxCli, cli, 'resolve', 'US-AD-095', 'ProgressReports'], { cwd, encoding: 'utf8' });
  assert(bad.status !== 0, 'ambiguous CLI must fail closed');
  assert(!bad.stdout.includes('@@FEATURE_IDENTITY@@'), 'ambiguous CLI must emit no success sentinel');
});

test('exact parser accepts one bound sentinel and rejects missing, duplicate, malformed, or extra output', () => {
  const cwd = tempRepo();
  makeSpecDir(cwd, 'US-AD-095-ProgressReports');
  const identity = resolveFeatureIdentity({ cwd, ticketId: 'US-AD-095', suggestedFeatureName: 'ClassDetailsProgressReports' });
  const line = `@@FEATURE_IDENTITY@@ ${JSON.stringify(identity)}\n`;
  assert(parseFeatureIdentityOutput(line, cwd).featureName === identity.featureName, 'exact sentinel must round-trip');
  for (const raw of ['', `${line}${line}`, '@@FEATURE_IDENTITY@@ {bad}\n', `${line}extra\n`]) {
    assertIdentityError(() => parseFeatureIdentityOutput(raw, cwd), 'malformed-sentinel');
  }
});

test('flagship workflow binds B0 identity and budget-safe evidence to deterministic contracts', () => {
  const prompt = fs.readFileSync(path.resolve(__dirname, '..', 'commands', 'feature-from-confluence.md'), 'utf8');
  assert(prompt.includes('feature-identity.ts resolve'), 'B0 must invoke the deterministic identity resolver');
  assert(prompt.includes('exactly one `@@FEATURE_IDENTITY@@`'), 'missing/malformed/duplicate identity sentinel must be an error');
  assert(/Do not include `\.incoming-spec\.md` or\s+`\.incoming-spec\.ir\.json` in the B0 bundle/.test(prompt), 'B0 must use budget-safe source provenance rather than raw staged source');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
