import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { buildBundle } from '../.claude/integrations/evidence-bundle';
import {
  P2_TRANSPORT_ENVELOPE,
  type P2RoleTransport,
} from '../.claude/integrations/p2-transport-manifest';
import {
  executeP2TransportValidation,
  formatP2TransportValidationResult,
  P2_TRANSPORT_VALIDATION_RESULT_SENTINEL,
  readP2TransportInput,
  runP2TransportValidationCli,
} from './p2-transport-validate';

let passed = 0;
let failed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try { await run(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}`, error); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-transport-cli-'));
const base = path.join(root, 'worktrees');
const bundle = buildBundle({ featureName: 'F', phase: 'B1', cwd: root, transcripts: { evidence: 'valid' } });
const argv = ['--cwd', root, '--approved-workspace-base', base];

function manifest(): P2RoleTransport {
  return {
    sentinel: 'p2-role-transport/v1', schemaVersion: 1, planHash: 'a'.repeat(64),
    runId: 'run-1', taskId: 'task-ui', role: 'ui',
    workspace: {
      workspaceId: 'run-1-ui', basePath: base,
      path: path.join(base, 'run-1-ui'), kind: 'git-worktree',
    },
    predecessors: [{
      featureName: 'F', phase: 'B1', manifestHash: bundle.manifestHash,
      requireBackendBinding: false,
    }],
    outputCapBytes: 1024, timeoutMs: 1000, requireBackendBinding: false,
    stopReceipt: { kind: 'sidecar-stop', runId: 'run-1' },
  };
}

function envelope(value: P2RoleTransport = manifest()): string {
  return `${P2_TRANSPORT_ENVELOPE}${JSON.stringify(value)}`;
}

async function main(): Promise<void> {
  await test('valid stdin envelope returns one canonical normalized manifest result', () => {
    const result = executeP2TransportValidation(argv, envelope());
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'manifest');
    assert.equal(result.errorCode, null);
    assert.equal(result.receipt, null);
    assert.equal(result.manifest?.workspace.path, path.resolve(base, 'run-1-ui'));
    const line = formatP2TransportValidationResult(result);
    assert.equal(line.split(P2_TRANSPORT_VALIDATION_RESULT_SENTINEL).length - 1, 1);
    assert.equal(line.includes('\n'), false);
  });

  await test('missing, duplicate, malformed, and noisy sentinels return safe failure with no manifest', () => {
    const cases = [
      JSON.stringify(manifest()),
      `${envelope()}\n${envelope()}`,
      `${envelope()}\nnoise`,
      `${P2_TRANSPORT_ENVELOPE}{bad-json}`,
    ];
    for (const raw of cases) {
      assert.deepEqual(executeP2TransportValidation(argv, raw), {
        schemaVersion: 1, kind: null, ok: false, manifest: null, receipt: null, errorCode: 'invalid_transport',
      });
    }
  });

  await test('argument ambiguity fails closed without returning validation detail', () => {
    assert.equal(executeP2TransportValidation([], envelope()).ok, false);
    assert.equal(executeP2TransportValidation([...argv, '--cwd', root], envelope()).ok, false);
    assert.equal(executeP2TransportValidation([...argv, '--unknown', 'x'], envelope()).ok, false);
  });

  await test('stdin reader enforces a cumulative byte cap across many chunks and multibyte text', async () => {
    await assert.rejects(() => readP2TransportInput(Readable.from(['1234', '5678', '9']), 8));
    await assert.rejects(() => readP2TransportInput(Readable.from(['é', 'é']), 3));
    assert.equal(await readP2TransportInput(Readable.from(['12', '34']), 4), '1234');
  });

  await test('stop-receipt mode validates exact manifest identity, receipt schema, and output cap through the kit parser', () => {
    const receiptArgv = [...argv, '--mode', 'stop-receipt'];
    const stopReceipt = JSON.stringify({
      sentinel: 'p2-role-transport/v1', schemaVersion: 1, kind: 'sidecar-stop',
      runId: 'run-1', workspaceId: 'run-1-ui', outputBytes: 0, reason: 'completed',
    });
    const raw = JSON.stringify({ manifestEnvelope: envelope(), stopReceipt });
    const result = executeP2TransportValidation(receiptArgv, raw);
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'stop-receipt');
    assert.equal(result.manifest?.runId, 'run-1');
    assert.equal(result.receipt?.outputBytes, 0);
    assert.equal(result.receipt?.workspaceId, 'run-1-ui');

    const forged = JSON.stringify({ manifestEnvelope: envelope(), stopReceipt: stopReceipt.replace('run-1-ui', 'other') });
    assert.equal(executeP2TransportValidation(receiptArgv, forged).ok, false);
    const overCap = JSON.stringify({ manifestEnvelope: envelope(), stopReceipt: stopReceipt.replace('"outputBytes":0', '"outputBytes":1025') });
    assert.equal(executeP2TransportValidation(receiptArgv, overCap).ok, false);
  });

  await test('stop-receipt request rejects missing, extra, malformed, and duplicate manifest-envelope sentinels', () => {
    const receiptArgv = [...argv, '--mode', 'stop-receipt'];
    const receipt = JSON.stringify({
      sentinel: 'p2-role-transport/v1', schemaVersion: 1, kind: 'sidecar-stop', runId: 'run-1',
      workspaceId: 'run-1-ui', outputBytes: 1, reason: 'completed',
    });
    const cases = [
      JSON.stringify({ stopReceipt: receipt }),
      JSON.stringify({ manifestEnvelope: envelope(), stopReceipt: receipt, extra: true }),
      JSON.stringify({ manifestEnvelope: `${envelope()}\n${envelope()}`, stopReceipt: receipt }),
      JSON.stringify({ manifestEnvelope: JSON.stringify(manifest()), stopReceipt: receipt }),
    ];
    for (const raw of cases) assert.equal(executeP2TransportValidation(receiptArgv, raw).ok, false);
  });

  await test('manifest-set mode accepts one coherent wave and returns no trusted manifest payload', () => {
    const setArgv = [...argv, '--mode', 'manifest-set'];
    const second = manifest();
    second.taskId = 'task-dev';
    second.role = 'dev';
    second.workspace.workspaceId = 'run-1-dev';
    second.workspace.path = path.join(base, 'run-1-dev');
    const result = executeP2TransportValidation(setArgv, JSON.stringify({ manifestEnvelopes: [envelope(), envelope(second)] }));
    assert.deepEqual(result, {
      schemaVersion: 1, kind: 'manifest-set', ok: true, manifest: null, receipt: null, errorCode: null,
    });
  });

  await test('manifest-set mode rejects mixed run/plan and duplicate task/workspace identities', () => {
    const setArgv = [...argv, '--mode', 'manifest-set'];
    const mutate = (change: (value: P2RoleTransport) => void): string => {
      const value = manifest();
      change(value);
      return JSON.stringify({ manifestEnvelopes: [envelope(), envelope(value)] });
    };
    const attacks = [
      mutate(value => { value.runId = 'run-2'; value.stopReceipt.runId = 'run-2'; }),
      mutate(value => { value.planHash = 'b'.repeat(64); }),
      mutate(value => { value.workspace.path = path.join(base, 'other'); value.taskId = 'other'; }),
      mutate(value => { value.workspace.workspaceId = 'other'; value.taskId = 'other'; }),
      mutate(value => { value.workspace.workspaceId = 'other'; value.workspace.path = path.join(base, 'other'); }),
    ];
    for (const raw of attacks) assert.equal(executeP2TransportValidation(setArgv, raw).ok, false);
  });

  await test('manifest-set mode applies filesystem-appropriate case-alias semantics', () => {
    const setArgv = [...argv, '--mode', 'manifest-set'];
    const mutate = (change: (value: P2RoleTransport) => void): string => {
      const value = manifest();
      change(value);
      return JSON.stringify({ manifestEnvelopes: [envelope(), envelope(value)] });
    };
    const caseAliases = [
      mutate(value => { value.workspace.workspaceId = 'RUN-1-UI'; value.workspace.path = path.join(base, 'other'); value.taskId = 'other'; }),
      mutate(value => { value.workspace.workspaceId = 'other'; value.workspace.path = path.join(base, 'RUN-1-UI'); value.taskId = 'other'; }),
    ];
    for (const raw of caseAliases) {
      assert.equal(executeP2TransportValidation(setArgv, raw).ok, process.platform !== 'win32');
    }
  });

  await test('manifest-set request rejects empty, oversized, malformed, and extra-field input', () => {
    const setArgv = [...argv, '--mode', 'manifest-set'];
    const cases = [
      JSON.stringify({ manifestEnvelopes: [] }),
      JSON.stringify({ manifestEnvelopes: Array.from({ length: 5 }, () => envelope()) }),
      JSON.stringify({ manifestEnvelopes: [1] }),
      JSON.stringify({ manifestEnvelopes: [envelope()], extra: true }),
      '{bad-json}',
    ];
    for (const raw of cases) assert.equal(executeP2TransportValidation(setArgv, raw).ok, false);
  });

  await test('CLI emits exactly one safe sentinel and a nonzero exit on read or validation failure', async () => {
    for (const readInput of [
      async () => { throw new Error('secret detail'); },
      async () => `${P2_TRANSPORT_ENVELOPE}{bad-json}`,
    ]) {
      const lines: string[] = [];
      const exitCode = await runP2TransportValidationCli(argv, { readInput, writeLine: line => lines.push(line) });
      assert.equal(exitCode, 1);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].startsWith(P2_TRANSPORT_VALIDATION_RESULT_SENTINEL), true);
      assert.equal(lines[0].includes('secret detail'), false);
      assert.equal(JSON.parse(lines[0].slice(P2_TRANSPORT_VALIDATION_RESULT_SENTINEL.length)).manifest, null);
    }
  });

  await test('CLI success emits one exact sentinel and exit zero', async () => {
    const lines: string[] = [];
    const exitCode = await runP2TransportValidationCli(argv, {
      readInput: async () => envelope(),
      writeLine: line => lines.push(line),
    });
    assert.equal(exitCode, 0);
    assert.equal(lines.length, 1);
    const result = JSON.parse(lines[0].slice(P2_TRANSPORT_VALIDATION_RESULT_SENTINEL.length));
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'manifest');
    assert.equal(result.manifest.taskId, 'task-ui');
  });

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
