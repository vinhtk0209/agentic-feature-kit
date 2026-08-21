import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { createClaudeNodeProcessPort } from './claude-cli-process-node';
import {
  createProviderParityCandidateVerifier,
  ProviderParityCandidateError,
  type ProviderParityCandidateErrorCode,
  type ProviderParityCandidateProcessExecution,
  type ProviderParityCandidateProcessPort,
  type ProviderParityCandidateProcessRequest,
} from './provider-parity-candidate-node';
import { createProviderParityFixtureLifecycle } from './provider-parity-fixture-node';

const repositoryRoot = process.cwd();
const goldenPath = path.join(repositoryRoot, 'docs', 'roadmap', 'fixtures', 'p17-007-provider-parity-golden.json');
const modulePath = path.join(repositoryRoot, '.claude', 'integrations', 'provider-parity-candidate-node.ts');
const PASS: ProviderParityCandidateProcessExecution = Object.freeze({
  exitCode: 0,
  signal: null,
  stdout: '',
  stderr: '',
  timedOut: false,
  outputCapped: false,
});
const IMPLEMENTATION = `function escapeCsv(value) {
  const text = String(value)
  return /[\",\\n\\r]/.test(text) ? \`\"\${text.replaceAll('\"', '\"\"')}\"\` : text
}

export function renderProgressCsv(rows) {
  const ordered = [...rows].sort((left, right) => left.learnerId.localeCompare(right.learnerId, 'en'))
  return [
    'course_id,learner_id,progress_percent',
    ...ordered.map((row) => [row.courseId, row.learnerId, row.progressPercent].map(escapeCsv).join(',')),
  ].join('\\n')
}
`;
const PLAN = `# Synthetic implementation plan

- AC-1: preserve the exact CSV header in src/report.js and the locked test.
- AC-2: sort by learner_id with ordinal string comparison.
- AC-3: quote fields with commas or quotes and double embedded quotes.
- Verification: run exactly node --test test/report.test.js once.
`;

type JsonRecord = Record<string, any>;

function loadGolden(): JsonRecord {
  return JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as JsonRecord;
}

function removeTreeNoFollow(target: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return;
  }
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(target)) removeTreeNoFollow(path.join(target, child));
    fs.rmdirSync(target);
    return;
  }
  fs.unlinkSync(target);
}

function createParent(prefix: string): string {
  return fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), prefix));
}

function writeCandidate(isolatedRoot: string, additionalTest?: string): void {
  const docs = path.join(isolatedRoot, 'docs');
  fs.mkdirSync(docs, { mode: 0o700, recursive: true });
  fs.writeFileSync(path.join(docs, 'plan.md'), PLAN, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(path.join(isolatedRoot, 'src', 'report.js'), IMPLEMENTATION, { encoding: 'utf8', mode: 0o600 });
  if (additionalTest !== undefined) {
    fs.writeFileSync(path.join(isolatedRoot, 'test', 'report.additional.test.js'), additionalTest, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}

async function withCandidate<T>(
  prefix: string,
  action: (context: {
    parentRoot: string;
    isolatedRoot: string;
    receipt: ReturnType<ReturnType<typeof createProviderParityFixtureLifecycle>['materialize']>;
    lifecycle: ReturnType<typeof createProviderParityFixtureLifecycle>;
  }) => Promise<T>,
): Promise<T> {
  const parentRoot = createParent(prefix);
  const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
  const receipt = lifecycle.materialize();
  try {
    writeCandidate(receipt.isolatedRoot);
    return await action({ parentRoot, isolatedRoot: receipt.isolatedRoot, receipt, lifecycle });
  } finally {
    if (lifecycle.getState() === 'materialized') {
      const cleanup = lifecycle.cleanup();
      assert.equal(cleanup.zeroResidue, true);
    }
    assert.deepEqual(fs.readdirSync(parentRoot), []);
    removeTreeNoFollow(parentRoot);
  }
}

function fakePort(
  execute: (request: ProviderParityCandidateProcessRequest) => Promise<unknown> | unknown = () => PASS,
): ProviderParityCandidateProcessPort {
  return { execute: execute as ProviderParityCandidateProcessPort['execute'] };
}

async function expectCode(
  action: () => Promise<unknown> | unknown,
  code: ProviderParityCandidateErrorCode,
  forbidden: readonly string[] = [],
): Promise<ProviderParityCandidateError> {
  let observed: unknown;
  try {
    await action();
  } catch (error) {
    observed = error;
  }
  assert.ok(observed instanceof ProviderParityCandidateError, `expected candidate error ${code}`);
  assert.equal(observed.code, code);
  assert.equal(observed.message, `Provider parity candidate verifier: ${code}`);
  for (const marker of forbidden) assert.equal(observed.message.includes(marker), false, `error leaked marker: ${marker}`);
  return observed;
}

test('runs the exact trusted Node test once through the bounded A3B1 process port', async () => {
  await withCandidate('p17-007-a3b2b-real-', async ({ isolatedRoot, receipt, lifecycle }) => {
    const delegatedPort = createClaudeNodeProcessPort({
      isolatedRoot,
      environment: {},
      terminationGraceMs: 5_000,
    });
    const requests: ProviderParityCandidateProcessRequest[] = [];
    const processPort = fakePort(async (request) => {
      requests.push(request);
      return delegatedPort.execute(request);
    });
    const verifier = createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort,
    });
    const result = await verifier.verify();

    assert.equal(result.state, 'passed', JSON.stringify(result, null, 2));
    assert.equal(verifier.getState(), 'verified');
    assert.equal(result.processCallCount, 1);
    assert.equal(result.trustedTest.status, 'passed');
    assert.equal(result.trustedTest.exitCode, 0);
    assert.equal(result.mutationDetected, false);
    assert.deepEqual(result.reasonCodes, []);
    assert.deepEqual(result.violations, {
      lockedPathEdit: false,
      undeclaredPath: false,
      externalDependency: false,
      secretOrPathDisclosure: false,
      permissionWidening: false,
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].executable, path.resolve(process.execPath));
    assert.deepEqual(requests[0].args, ['--test', 'test/report.test.js']);
    assert.equal(requests[0].cwd, isolatedRoot);
    assert.equal(requests[0].stdin, '');
    assert.equal(requests[0].timeoutMs, 1_200_000);
    assert.equal(requests[0].maxOutputBytes, 16_777_216);
    assert.equal(requests[0].shell, false);
    assert.equal(Object.isFrozen(requests[0]), true);
    assert.equal(Object.isFrozen(requests[0].args), true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.violations), true);
    assert.equal(Object.isFrozen(result.reasonCodes), true);
    assert.equal(Object.isFrozen(result.trustedTest), true);
    assert.match(result.verificationEvidenceSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.preTestTreeSha256, result.postTestTreeSha256);
    const serialized = JSON.stringify(result);
    for (const forbidden of [isolatedRoot, process.execPath, 'course_id', 'learner-a', 'Synthetic implementation plan']) {
      assert.equal(serialized.includes(forbidden), false, `receipt leaked candidate/process content: ${forbidden}`);
    }
    await expectCode(() => verifier.verify(), 'invalid-state', [isolatedRoot]);

    const cleanup = lifecycle.cleanup();
    assert.equal(cleanup.zeroResidue, true);
    assert.equal(fs.existsSync(isolatedRoot), false);
  });
});

test('accepts only the declared optional builtin imports and keeps the trusted request provider-neutral', async () => {
  await withCandidate('p17-007-a3b2b-builtins-', async ({ isolatedRoot, receipt }) => {
    writeCandidate(isolatedRoot, `import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { renderProgressCsv } from '../src/report.js'\ntest('additional', () => { assert.equal(renderProgressCsv([]).startsWith('course_id'), true) })\n`);
    let calls = 0;
    const result = await createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort: fakePort((request) => {
        calls += 1;
        assert.deepEqual(Object.keys(request).sort(), [
          'args', 'cwd', 'executable', 'maxOutputBytes', 'shell', 'stdin', 'timeoutMs',
        ]);
        return PASS;
      }),
    }).verify();
    assert.equal(result.state, 'passed');
    assert.equal(result.fileCount, 7);
    assert.equal(result.violations.externalDependency, false);
    assert.equal(calls, 1);
  });
});

test('rejects ambiguous options and non-exact or mutable A3B2A receipts without executing a process', async () => {
  await withCandidate('p17-007-a3b2b-admission-', async ({ isolatedRoot, receipt }) => {
    let calls = 0;
    const processPort = fakePort(() => { calls += 1; return PASS; });
    const invalidOptions: Array<{ value: any; code: ProviderParityCandidateErrorCode }> = [
      { value: null, code: 'invalid-options' },
      { value: { materializationReceipt: receipt, nodeExecutable: 'node', processPort }, code: 'invalid-executable' },
      { value: { materializationReceipt: receipt, nodeExecutable: process.execPath, processPort: {} }, code: 'invalid-process-port' },
      { value: { materializationReceipt: receipt, nodeExecutable: process.execPath, processPort, extra: true }, code: 'invalid-options' },
      { value: { materializationReceipt: Object.freeze({ ...receipt, extra: true }), nodeExecutable: process.execPath, processPort }, code: 'invalid-materialization' },
      { value: { materializationReceipt: { ...receipt }, nodeExecutable: process.execPath, processPort }, code: 'invalid-materialization' },
    ];
    for (const attack of invalidOptions) {
      await expectCode(() => createProviderParityCandidateVerifier(attack.value), attack.code, [isolatedRoot]);
    }

    let getterCalls = 0;
    const accessorPort: Record<string, unknown> = {};
    Object.defineProperty(accessorPort, 'execute', {
      enumerable: true,
      get() { getterCalls += 1; return async () => PASS; },
    });
    await expectCode(
      () => createProviderParityCandidateVerifier({
        materializationReceipt: receipt,
        nodeExecutable: process.execPath,
        processPort: accessorPort as unknown as ProviderParityCandidateProcessPort,
      }),
      'invalid-process-port',
    );
    assert.equal(getterCalls, 0);
    assert.equal(calls, 0);
  });
});

test('fails closed before execution for locked edits and undeclared nodes', async () => {
  await withCandidate('p17-007-a3b2b-paths-', async ({ isolatedRoot, receipt }) => {
    fs.appendFileSync(path.join(isolatedRoot, 'AGENTS.md'), '\nATTACKER_LOCKED_EDIT\n', 'utf8');
    fs.writeFileSync(path.join(isolatedRoot, 'rogue.txt'), 'ATTACKER_UNDECLARED', { encoding: 'utf8', mode: 0o600 });
    let calls = 0;
    const result = await createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort: fakePort(() => { calls += 1; return PASS; }),
    }).verify();
    assert.equal(result.state, 'failed');
    assert.equal(result.processCallCount, 0);
    assert.equal(result.trustedTest.status, 'not-run');
    assert.equal(result.violations.lockedPathEdit, true);
    assert.equal(result.violations.undeclaredPath, true);
    assert.deepEqual(result.reasonCodes, ['locked-path-edit', 'undeclared-path']);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(result).includes('ATTACKER_'), false);
  });
});

test('flags external dependencies and secret or absolute-path disclosures only in writable candidate bytes', async () => {
  await withCandidate('p17-007-a3b2b-privacy-', async ({ isolatedRoot, receipt }) => {
    fs.writeFileSync(
      path.join(isolatedRoot, 'src', 'report.js'),
      `import thing from 'external-package'\nexport function renderProgressCsv() { return thing }\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(isolatedRoot, 'docs', 'plan.md'), `api_key = \"ATTACKER_SECRET_123456789\"\n`, 'utf8');
    let calls = 0;
    const result = await createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort: fakePort(() => { calls += 1; return PASS; }),
    }).verify();
    assert.equal(result.state, 'failed');
    assert.equal(result.processCallCount, 0);
    assert.equal(result.violations.externalDependency, true);
    assert.equal(result.violations.secretOrPathDisclosure, true);
    assert.deepEqual(result.reasonCodes, ['external-dependency', 'secret-or-path-disclosure']);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(result).includes('ATTACKER_SECRET'), false);
  });
});

test('rejects relative imports that traverse outside the fixture or target undeclared files', async () => {
  for (const specifier of ['../../outside.js', './undeclared-helper.js']) {
    await withCandidate('p17-007-a3b2b-relative-', async ({ isolatedRoot, receipt }) => {
      fs.writeFileSync(
        path.join(isolatedRoot, 'src', 'report.js'),
        `import value from '${specifier}'\nexport function renderProgressCsv() { return value }\n`,
        'utf8',
      );
      let calls = 0;
      const result = await createProviderParityCandidateVerifier({
        materializationReceipt: receipt,
        nodeExecutable: process.execPath,
        processPort: fakePort(() => { calls += 1; return PASS; }),
      }).verify();
      assert.equal(result.state, 'failed');
      assert.equal(result.violations.externalDependency, true);
      assert.deepEqual(result.reasonCodes, ['external-dependency']);
      assert.equal(result.processCallCount, 0);
      assert.equal(calls, 0);
    });
  }
});

test('enforces the POSIX permission ceiling and records the Windows no-follow rule explicitly', async () => {
  await withCandidate('p17-007-a3b2b-permissions-', async ({ isolatedRoot, receipt }) => {
    if (process.platform !== 'win32') fs.chmodSync(path.join(isolatedRoot, 'src', 'report.js'), 0o777);
    let calls = 0;
    const result = await createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort: fakePort(() => { calls += 1; return PASS; }),
    }).verify();
    if (process.platform === 'win32') {
      assert.equal(result.state, 'passed');
      assert.equal(result.permissionRule, 'windows-node-kind-v1');
      assert.equal(result.violations.permissionWidening, false);
      assert.equal(calls, 1);
    } else {
      assert.equal(result.state, 'failed');
      assert.equal(result.permissionRule, 'posix-mode-v1');
      assert.equal(result.violations.permissionWidening, true);
      assert.deepEqual(result.reasonCodes, ['permission-widening']);
      assert.equal(calls, 0);
    }
  });
});

test('normalizes every process failure to metadata-only trusted-test failure evidence', async () => {
  const cases: Array<{
    name: string;
    execute: (request: ProviderParityCandidateProcessRequest) => Promise<unknown> | unknown;
    privacy?: boolean;
  }> = [
    { name: 'throw', execute: () => { throw new Error('ATTACKER_THROW_SECRET'); } },
    { name: 'malformed', execute: () => ({}) },
    { name: 'nonzero', execute: () => ({ ...PASS, exitCode: 1 }) },
    { name: 'signal', execute: () => ({ ...PASS, exitCode: null, signal: 'SIGTERM' }) },
    { name: 'timeout', execute: () => ({ ...PASS, exitCode: null, timedOut: true }) },
    { name: 'cap', execute: () => ({ ...PASS, exitCode: null, outputCapped: true }) },
    { name: 'stderr', execute: () => ({ ...PASS, stderr: 'ATTACKER_TEST_FAILURE' }) },
    { name: 'disclosure', execute: (request) => ({ ...PASS, stdout: request.cwd }), privacy: true },
  ];

  for (const attack of cases) {
    await withCandidate(`p17-007-a3b2b-process-${attack.name}-`, async ({ isolatedRoot, receipt }) => {
      let calls = 0;
      const result = await createProviderParityCandidateVerifier({
        materializationReceipt: receipt,
        nodeExecutable: process.execPath,
        processPort: fakePort((request) => { calls += 1; return attack.execute(request); }),
      }).verify();
      assert.equal(result.state, 'failed', attack.name);
      assert.equal(result.processCallCount, 1, attack.name);
      assert.equal(result.trustedTest.status, 'failed', attack.name);
      assert.equal(result.reasonCodes.includes('trusted-test-failed'), true, attack.name);
      assert.equal(result.violations.secretOrPathDisclosure, attack.privacy ?? false, attack.name);
      assert.equal(calls, 1, attack.name);
      const serialized = JSON.stringify(result);
      for (const forbidden of [isolatedRoot, 'ATTACKER_THROW_SECRET', 'ATTACKER_TEST_FAILURE']) {
        assert.equal(serialized.includes(forbidden), false, `${attack.name} leaked process content`);
      }
    });
  }
});

test('detects a candidate mutation performed by the trusted process even when that process exits zero', async () => {
  await withCandidate('p17-007-a3b2b-mutation-', async ({ isolatedRoot, receipt }) => {
    let calls = 0;
    const result = await createProviderParityCandidateVerifier({
      materializationReceipt: receipt,
      nodeExecutable: process.execPath,
      processPort: fakePort(() => {
        calls += 1;
        fs.appendFileSync(path.join(isolatedRoot, 'docs', 'plan.md'), '\npost-test mutation\n', 'utf8');
        return PASS;
      }),
    }).verify();
    assert.equal(result.state, 'failed');
    assert.equal(result.trustedTest.status, 'passed');
    assert.equal(result.mutationDetected, true);
    assert.notEqual(result.preTestTreeSha256, result.postTestTreeSha256);
    assert.deepEqual(result.reasonCodes, ['candidate-mutated']);
    assert.equal(calls, 1);
  });
});

test('never follows an undeclared alias and lifecycle cleanup preserves the external victim', async (context) => {
  await withCandidate('p17-007-a3b2b-alias-', async ({ isolatedRoot, receipt }) => {
    const victimRoot = createParent('p17-007-a3b2b-victim-');
    const victimFile = path.join(victimRoot, 'victim.txt');
    fs.writeFileSync(victimFile, 'EXTERNAL_VICTIM_BYTES', { encoding: 'utf8', mode: 0o600 });
    const alias = path.join(isolatedRoot, 'docs', 'external-alias');
    try {
      try {
        fs.symlinkSync(victimRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          context.skip('platform policy does not permit the test-only alias');
          return;
        }
        throw error;
      }
      let calls = 0;
      const result = await createProviderParityCandidateVerifier({
        materializationReceipt: receipt,
        nodeExecutable: process.execPath,
        processPort: fakePort(() => { calls += 1; return PASS; }),
      }).verify();
      assert.equal(result.state, 'failed');
      assert.equal(result.violations.undeclaredPath, true);
      assert.equal(result.processCallCount, 0);
      assert.equal(calls, 0);
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'EXTERNAL_VICTIM_BYTES');
    } finally {
      assert.equal(fs.readFileSync(victimFile, 'utf8'), 'EXTERNAL_VICTIM_BYTES');
      removeTreeNoFollow(victimRoot);
    }
  });
});

test('source boundary retains local no-follow inventory and imports no executor, provider, environment, or network capability', () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  for (const required of [
    'fs.constants.O_NOFOLLOW',
    'fs.lstatSync',
    'fs.fstatSync',
    'fs.realpathSync.native',
    'fs.closeSync',
    'candidate-mutated',
    'windows-node-kind-v1',
    'posix-mode-v1',
  ]) assert.ok(source.includes(required), `production candidate verifier missing boundary: ${required}`);
  for (const forbidden of [
    "from 'node:child_process'",
    'process.env',
    "from 'node:http'",
    "from 'node:https'",
    'fetch(',
    'spawn(',
    'execFile(',
    'claude-cli-adapter',
    'codex-cli-adapter',
    'copilot-cli-adapter',
  ]) assert.equal(source.includes(forbidden), false, `production verifier contains forbidden capability: ${forbidden}`);
});

test('100 full real-filesystem verifications stay bounded with one injected call each and zero residue', async () => {
  const parentRoot = createParent('p17-007-a3b2b-sentinel-');
  const iterations = 100;
  const rssBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  let calls = 0;
  try {
    for (let index = 0; index < iterations; index += 1) {
      const lifecycle = createProviderParityFixtureLifecycle({ parentRoot, golden: loadGolden() });
      const receipt = lifecycle.materialize();
      writeCandidate(receipt.isolatedRoot);
      const result = await createProviderParityCandidateVerifier({
        materializationReceipt: receipt,
        nodeExecutable: process.execPath,
        processPort: fakePort(() => { calls += 1; return PASS; }),
      }).verify();
      assert.equal(result.state, 'passed');
      assert.equal(result.processCallCount, 1);
      assert.equal(lifecycle.cleanup().zeroResidue, true);
    }
    const elapsedMs = performance.now() - startedAt;
    const rssDeltaBytes = Math.max(0, process.memoryUsage().rss - rssBefore);
    assert.ok(elapsedMs < 15_000, `100 verifier sentinel exceeded 15s: ${elapsedMs.toFixed(3)}ms`);
    assert.ok(rssDeltaBytes < 64 * 1024 * 1024, `100 verifier sentinel exceeded 64 MiB RSS: ${rssDeltaBytes}`);
    assert.equal(calls, iterations);
    assert.deepEqual(fs.readdirSync(parentRoot), []);
    console.log(`provider-parity-candidate-node sentinel: ${iterations} cycles, ${elapsedMs.toFixed(3)} ms, RSS delta ${rssDeltaBytes} bytes, process calls ${calls}`);
  } finally {
    removeTreeNoFollow(parentRoot);
  }
});
