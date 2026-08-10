/**
 * P2 live operator demo. Four kit-validated role envelopes consume the same strict I2/P1 bundle
 * and send only the already-authorized fixed prompt to the localhost dashboard sidecar.
 * Worktrees are intentionally retained for operator inspection; this script never removes them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  serializeP2RoleTransport,
  validateP2RoleTransportSet,
  type P2RoleTransport,
} from '../.claude/integrations/p2-transport-manifest';

const RESULT_SENTINEL = '@@P2_OPERATOR_DEMO_RESULT@@';
const FIXED_PROMPT = 'Reply with exactly I2_CODEX_LIVE_OK and nothing else.';
const ROLES = ['dev', 'design', 'ui', 'figma'] as const;
const REPO_ID = 'claude-workflow-kit';

type BundleManifest = { feature: string; phase: string; manifestHash: string };
type BackendBinding = {
  bindingHash: string;
  identity: { provider: string; modelKey: string; modelId: string; adapterVersion: string };
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`P2 operator demo requires ${name}`);
  return value;
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

async function main(): Promise<void> {
  if (process.env.P2_OPERATOR_DEMO_CONFIRM !== 'run-four-read-only-codex-roles') throw new Error('P2 operator demo confirmation is absent');
  const kitDir = path.resolve(__dirname, '..');
  const workspaceBase = path.resolve(requiredEnv('P2_APPROVED_WORKSPACE_BASE'));
  const token = requiredEnv('PTY_TOKEN');
  if (process.env.P2_INTERNAL_TRIGGER_ENABLED !== 'true') throw new Error('P2 internal trigger is not enabled');

  const evidenceDir = path.join(kitDir, 'docs', 'specs', 'i2-codex-live-smoke', '.evidence', 'B0');
  const manifest = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'manifest.json'), 'utf8')) as BundleManifest;
  const binding = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'backend-binding.json'), 'utf8')) as BackendBinding;
  if (manifest.feature !== 'i2-codex-live-smoke' || manifest.phase !== 'B0'
    || !/^[a-f0-9]{64}$/.test(manifest.manifestHash) || !/^[a-f0-9]{64}$/.test(binding.bindingHash)
    || binding.identity.provider !== 'codex' || binding.identity.modelId !== 'gpt-5.6-sol') {
    throw new Error('P2 predecessor evidence identity is invalid');
  }

  const runId = randomUUID();
  const planHash = createHash('sha256').update(JSON.stringify({ runId, roles: ROLES, prompt: FIXED_PROMPT })).digest('hex');
  const options = { cwd: kitDir, approvedWorkspaceBase: workspaceBase };
  const manifests: P2RoleTransport[] = ROLES.map(role => ({
    sentinel: 'p2-role-transport/v1', schemaVersion: 1, planHash, runId,
    taskId: `task-${role}`, role,
    workspace: {
      workspaceId: `${runId}-${role}`, basePath: workspaceBase,
      path: path.join(workspaceBase, `${runId}-${role}`), kind: 'git-worktree',
    },
    predecessors: [{
      featureName: manifest.feature, phase: manifest.phase, manifestHash: manifest.manifestHash,
      requireBackendBinding: true,
      backendBinding: { bindingHash: binding.bindingHash, identity: { ...binding.identity } },
    }],
    outputCapBytes: 1_048_576, timeoutMs: 180_000, requireBackendBinding: true,
    stopReceipt: { kind: 'sidecar-stop', runId },
  }));
  validateP2RoleTransportSet(manifests);
  const body = {
    repoId: REPO_ID,
    roles: manifests.map(item => ({ envelope: serializeP2RoleTransport(item, options), prompt: FIXED_PROMPT })),
  };

  const response = await fetch('http://127.0.0.1:4001/p2/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pty-token': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !exactObject(payload, ['ok', 'results']) || payload.ok !== true || !Array.isArray(payload.results) || payload.results.length !== ROLES.length) {
    throw new Error(`P2 sidecar returned an invalid result (${response.status})`);
  }
  const summaries = payload.results.map((candidate, index) => {
    if (!exactObject(candidate, ['ok', 'runId', 'taskId', 'role', 'reason']) || candidate.ok !== true
      || candidate.runId !== runId || candidate.taskId !== `task-${ROLES[index]}` || candidate.role !== ROLES[index] || candidate.reason !== 'completed') {
      throw new Error(`P2 role result ${index} is invalid`);
    }
    return { taskId: candidate.taskId, role: candidate.role, reason: candidate.reason };
  });
  process.stdout.write(`${RESULT_SENTINEL}${JSON.stringify({ schemaVersion: 1, runId, planHash, predecessorManifestHash: manifest.manifestHash, roles: summaries })}\n`);
}

main().catch(error => {
  process.stderr.write(`P2 operator demo failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
