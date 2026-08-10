import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBundle } from './evidence-bundle';
import {
  parseP2RoleTransport,
  parseP2RoleTransportEnvelope,
  parseP2TransportStopReceipt,
  P2RoleTransport,
  P2TransportManifestError,
  P2TransportValidationOptions,
  serializeP2RoleTransport,
  validateP2RoleTransportSet,
} from './p2-transport-manifest';
import { createEvidenceBinding } from './multi-provider-backends';

let passed = 0;
let failed = 0;
function test(name: string, run: () => void): void {
  try { run(); passed++; console.log(`✅ ${name}`); }
  catch (error) { failed++; console.error(`❌ ${name}`, error); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-transport-'));
const workBase = path.join(root, 'worktrees');
const options: P2TransportValidationOptions = { cwd: root, approvedWorkspaceBase: workBase };
const p1Bundle = buildBundle({ featureName: 'F', phase: 'B1', cwd: root, transcripts: { evidence: 'valid' } });
const i2Binding = createEvidenceBinding({
  trusted: {
    identity: { provider: 'codex', modelKey: 'codex', modelId: 'gpt-5.6-sol', adapterVersion: '1.0.0' },
    capabilities: ['execute-phase', 'evidence-binding'], capabilityHash: 'b'.repeat(64),
  },
  cost: { status: 'unknown', inputTokens: null, outputTokens: null, costUsd: null },
});
const i2Bundle = buildBundle({ featureName: 'I2', phase: 'B1', cwd: root, transcripts: { evidence: 'valid' }, backendBinding: i2Binding });

function value(): P2RoleTransport {
  return {
    sentinel: 'p2-role-transport/v1', schemaVersion: 1, planHash: 'a'.repeat(64),
    runId: 'run-1', taskId: 'task-ui', role: 'ui',
    workspace: {
      workspaceId: 'run-1-ui', basePath: workBase,
      path: path.join(workBase, 'run-1-ui'), kind: 'git-worktree',
    },
    predecessors: [{ featureName: 'F', phase: 'B1', manifestHash: p1Bundle.manifestHash, requireBackendBinding: false }],
    outputCapBytes: 100, timeoutMs: 1000, requireBackendBinding: false,
    stopReceipt: { kind: 'sidecar-stop', runId: 'run-1' },
  };
}

function parse(input: unknown): P2RoleTransport {
  return parseP2RoleTransport(JSON.stringify(input), options);
}

test('valid canonical manifest produces a one-line CLI envelope', () => {
  const manifest = value();
  const envelope = serializeP2RoleTransport(manifest, options);
  assert.equal(envelope.includes('\n'), false);
  assert.equal(parseP2RoleTransportEnvelope(envelope, options).workspace.workspaceId, 'run-1-ui');
});

test('missing, duplicate, and extra sentinels fail closed', () => {
  assert.throws(() => parse({ ...value(), sentinel: 'wrong' }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), extra: true }), P2TransportManifestError);
  const serial = serializeP2RoleTransport(value(), options);
  assert.throws(() => parseP2RoleTransportEnvelope(`${serial}\n${serial}`, options), P2TransportManifestError);
  assert.throws(() => parseP2RoleTransportEnvelope(`${serial} noise @@P2_ROLE_TRANSPORT@@`, options), P2TransportManifestError);
  assert.throws(() => parseP2RoleTransportEnvelope(`untrusted log line\n${serial}`, options), P2TransportManifestError);
  assert.throws(() => parseP2RoleTransport('{"sentinel":"p2-role-transport/v1","sentinel":"p2-role-transport/v1"}', options), P2TransportManifestError);
});

test('approved base, traversal, and junction intent fail before launch', () => {
  assert.throws(() => parse({ ...value(), workspace: { ...value().workspace, basePath: path.join(root, 'other') } }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), workspace: { ...value().workspace, path: `${workBase}${path.sep}..${path.sep}escape` } }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), workspace: { ...value().workspace, path: path.join(workBase, 'node_modules', 'bad') } }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), workspace: { ...value().workspace, kind: 'junction' } }), P2TransportManifestError);
});

test('bundle-only predecessors validate P1/I2 requirement and duplicates', () => {
  const duplicate = value();
  duplicate.predecessors.push({ ...duplicate.predecessors[0] });
  assert.throws(() => parse(duplicate), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), predecessors: [{ featureName: 'forged', phase: 'B1', manifestHash: p1Bundle.manifestHash, requireBackendBinding: false }] }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), predecessors: [{ featureName: 'F', phase: 'B1', manifestHash: 'c'.repeat(64), requireBackendBinding: false }] }), P2TransportManifestError);
  const bound = value();
  bound.predecessors = [{ featureName: 'I2', phase: 'B1', manifestHash: i2Bundle.manifestHash, requireBackendBinding: true, backendBinding: { bindingHash: i2Binding.bindingHash, identity: { ...i2Binding.identity } } }];
  assert.doesNotThrow(() => parse(bound));
  bound.predecessors[0].backendBinding!.identity.modelId = 'substituted';
  assert.throws(() => parse(bound), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), predecessors: [{ ...value().predecessors[0], extra: 'injected' }] }), P2TransportManifestError);
});

test('nested workspace and stop-receipt fields are exact', () => {
  assert.throws(() => parse({ ...value(), workspace: { ...value().workspace, extra: 'injected' } }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), stopReceipt: { ...value().stopReceipt, extra: 'injected' } }), P2TransportManifestError);
});

test('limits, stop receipt schema, and output overflow fail closed', () => {
  assert.throws(() => parse({ ...value(), outputCapBytes: 0 }), P2TransportManifestError);
  assert.throws(() => parse({ ...value(), timeoutMs: Number.MAX_SAFE_INTEGER + 1 }), P2TransportManifestError);
  const manifest = parse(value());
  const receipt = (outputBytes: number) => JSON.stringify({
    sentinel: 'p2-role-transport/v1', schemaVersion: 1, kind: 'sidecar-stop',
    runId: 'run-1', workspaceId: 'run-1-ui', outputBytes, reason: 'completed',
  });
  assert.equal(parseP2TransportStopReceipt(receipt(100), manifest).outputBytes, 100);
  assert.throws(() => parseP2TransportStopReceipt(receipt(101), manifest), P2TransportManifestError);
  assert.throws(() => parseP2TransportStopReceipt(JSON.stringify({ runId: 'run-1' }), manifest), P2TransportManifestError);
});

test('a manifest wave cannot share a workspace id or location', () => {
  const first = parse(value());
  const second = parse({ ...value(), taskId: 'task-dev', role: 'dev' });
  assert.throws(() => validateP2RoleTransportSet([first, second]), P2TransportManifestError);
  const third = parse({ ...value(), taskId: 'task-dev', role: 'dev', workspace: {
    ...value().workspace, workspaceId: 'run-1-dev', path: path.join(workBase, 'run-1-dev'),
  } });
  assert.doesNotThrow(() => validateP2RoleTransportSet([first, third]));
  assert.throws(() => validateP2RoleTransportSet([first, { ...third, runId: 'other' }]), P2TransportManifestError);
  assert.throws(() => validateP2RoleTransportSet([first, { ...third, planHash: 'b'.repeat(64) }]), P2TransportManifestError);
  assert.throws(() => validateP2RoleTransportSet([first, { ...third, taskId: first.taskId }]), P2TransportManifestError);
  const caseAlias = parse({ ...third, taskId: 'task-figma', role: 'figma', workspace: {
    ...third.workspace, workspaceId: 'RUN-1-DEV', basePath: third.workspace.basePath.toUpperCase(), path: third.workspace.path.toUpperCase(),
  } });
  if (process.platform === 'win32') assert.throws(() => validateP2RoleTransportSet([third, caseAlias]), P2TransportManifestError);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
