import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CROSS_PLATFORM_SENTINEL,
  finalizeCrossPlatformResult,
  normalizeLineEndings,
  qualifiedPlatform,
  runCrossPlatformSmoke,
  validateCrossPlatformResult,
  type CrossPlatformResult,
  type QualifiedPlatform,
} from './cross-platform-smoke';
import { RELEASE_MATRIX_SENTINEL, verifyReleaseMatrix } from './release-matrix-gate';
import { validateCrossPlatformWorkflow } from './cross-platform-workflow-contract';

const root = process.cwd();
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'release qualification Ω '));
}

function runTs(script: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

function runNpm(script: string, env?: NodeJS.ProcessEnv) {
  const inheritedCli = process.env.npm_execpath;
  assert.ok(inheritedCli, 'npm_execpath is required for a shell-free npm boundary test');
  const npmCli = inheritedCli.replace(/npx-cli\.js$/i, 'npm-cli.js');
  assert.ok(fs.existsSync(npmCli), `npm CLI is missing: ${npmCli}`);
  return spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...env },
    timeout: 30_000,
  });
}

function writeResult(directory: string, result: CrossPlatformResult): void {
  fs.writeFileSync(path.join(directory, `${result.platform}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function main(): Promise<void> {
await test('real local smoke proves runtime, opaque argv, CRLF, and bounded child cleanup', async () => {
  const platform = qualifiedPlatform();
  assert.ok(platform, `unsupported local platform: ${process.platform}`);
  const result = await runCrossPlatformSmoke(platform);
  assert.equal(result.status, 'pass');
  assert.equal(result.platform, platform);
  assert.equal(validateCrossPlatformResult(result), true);
  assert.deepEqual(result.probes.map((probe) => probe.id), ['node-runtime', 'path-and-argv', 'line-endings', 'process-cleanup']);
});

await test('qualification CLI preserves a spaced Unicode output path and emits one sentinel', () => {
  const platform = qualifiedPlatform();
  assert.ok(platform);
  const directory = tempDir();
  try {
    const target = path.join(directory, 'nested output Ω', `${platform}.json`);
    const run = runTs('scripts/cross-platform-smoke.ts', ['--platform', platform, '--out', target]);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stderr, '');
    const lines = run.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith(CROSS_PLATFORM_SENTINEL));
    const stdoutResult = JSON.parse(lines[0].slice(CROSS_PLATFORM_SENTINEL.length));
    const fileResult = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.deepEqual(fileResult, stdoutResult);
    assert.equal(validateCrossPlatformResult(fileResult), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

await test('npm workflow boundary preserves platform and output through explicit environment bindings', () => {
  const platform = qualifiedPlatform();
  assert.ok(platform);
  const directory = tempDir();
  try {
    const target = path.join(directory, 'npm output Ω', `${platform}.json`);
    const run = runNpm('test:cross-platform', {
      QUALIFICATION_PLATFORM: platform,
      QUALIFICATION_OUT: target,
    });
    assert.equal(run.status, 0, run.stderr);
    const sentinels = run.stdout.split(/\r?\n/).filter((line) => line.startsWith(CROSS_PLATFORM_SENTINEL));
    assert.equal(sentinels.length, 1);
    assert.equal(validateCrossPlatformResult(JSON.parse(fs.readFileSync(target, 'utf8'))), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

await test('platform mismatch fails with usage exit 2 and no success sentinel', () => {
  const platform = qualifiedPlatform();
  assert.ok(platform);
  const hostile = platform === 'windows' ? 'linux' : 'windows';
  const run = runTs('scripts/cross-platform-smoke.ts', ['--platform', hostile]);
  assert.equal(run.status, 2);
  assert.equal(run.stdout.includes(CROSS_PLATFORM_SENTINEL), false);
  assert.match(run.stderr, /platform mismatch/);
});

await test('CRLF normalization is deterministic and leaves LF stable', () => {
  assert.equal(normalizeLineEndings('a\r\nb\r\n'), 'a\nb\n');
  assert.equal(normalizeLineEndings('a\nb\n'), 'a\nb\n');
});

await test('result validator rejects forged hashes, extra fields, disorder, duplicates, and contradictory summaries', async () => {
  const platform = qualifiedPlatform();
  assert.ok(platform);
  const valid = await runCrossPlatformSmoke(platform);
  const forged = clone(valid); forged.contentHash = '0'.repeat(64);
  const extra = { ...clone(valid), claim: 'remote CI passed' };
  const disorder = clone(valid); disorder.probes.reverse();
  const duplicate = clone(valid); duplicate.probes[0].evidence.push(duplicate.probes[0].evidence[0]);
  const contradiction = clone(valid); contradiction.status = 'fail';
  for (const attacked of [forged, extra, disorder, duplicate, contradiction]) {
    assert.equal(validateCrossPlatformResult(attacked), false);
  }
});

await test('release gate requires successful aggregate matrix and exactly two valid platform artifacts', async () => {
  const platform = qualifiedPlatform();
  assert.ok(platform);
  const local = await runCrossPlatformSmoke(platform);
  const other: QualifiedPlatform = platform === 'windows' ? 'linux' : 'windows';
  const synthetic = finalizeCrossPlatformResult(other, clone(local.probes));
  const directory = tempDir();
  try {
    writeResult(directory, local);
    writeResult(directory, synthetic);
    assert.deepEqual(verifyReleaseMatrix(directory, 'success'), {
      status: 'pass', matrixResult: 'success', platforms: ['linux', 'windows'], reasons: [],
    });
    assert.equal(verifyReleaseMatrix(directory, 'failure').status, 'fail');
    fs.unlinkSync(path.join(directory, 'linux.json'));
    assert.equal(verifyReleaseMatrix(directory, 'success').status, 'fail');
    writeResult(directory, synthetic.platform === 'linux' ? synthetic : finalizeCrossPlatformResult('linux', clone(local.probes)));
    fs.writeFileSync(path.join(directory, 'unexpected.json'), '{}\n');
    assert.equal(verifyReleaseMatrix(directory, 'success').status, 'fail');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

await test('release gate CLI emits one fail-closed machine result when evidence is absent', () => {
  const directory = tempDir();
  try {
    const run = runTs('scripts/release-matrix-gate.ts', [directory], { MATRIX_RESULT: 'success' });
    assert.equal(run.status, 1);
    assert.equal(run.stderr, '');
    const lines = run.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith(RELEASE_MATRIX_SENTINEL));
    assert.equal(JSON.parse(lines[0].slice(RELEASE_MATRIX_SENTINEL.length)).status, 'fail');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

await test('workflow contract requires equal Linux/Windows legs and aggregate release gating', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'workflow-kit-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
  assert.deepEqual(validateCrossPlatformWorkflow(workflow), { passed: true, reasons: [] });
  const attacks = [
    workflow.replace('          - platform: windows\n            os: windows-latest\n', ''),
    workflow.replace('      fail-fast: false', '      fail-fast: true'),
    workflow.replace('    needs: [kit-verify]\n', ''),
    workflow.replace('      MATRIX_RESULT: ${{ needs.kit-verify.result }}', '      MATRIX_RESULT: success'),
    workflow.replace('run: npm run test:kit', 'run: npm run test:post-17-roadmap'),
  ];
  for (const attacked of attacks) assert.equal(validateCrossPlatformWorkflow(attacked).passed, false);
});

console.log(`\ncross-platform-release.test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
}

void main();
