/**
 * P2-C1 canonical kit-owned transport contract. This module only validates
 * data. It intentionally cannot create a worktree, start a process, or write
 * a database record.
 */
import * as path from 'path';
import { verifyBackendBoundBundle, verifyBundle } from './evidence-bundle';
import type { BackendIdentity } from './multi-provider-backends';

export const P2_TRANSPORT_SENTINEL = 'p2-role-transport/v1';
export const P2_TRANSPORT_ENVELOPE = '@@P2_ROLE_TRANSPORT@@';

export class P2TransportManifestError extends Error {
  constructor(message: string) {
    super(`p2 transport: ${message}`);
    this.name = 'P2TransportManifestError';
  }
}

export interface P2TransportValidationOptions {
  /** Root used by P1/I2 bundle verifiers. */
  cwd: string;
  /** Operator-approved directory in which role worktrees may exist. */
  approvedWorkspaceBase: string;
}

export interface P2RoleTransport {
  sentinel: typeof P2_TRANSPORT_SENTINEL;
  schemaVersion: 1;
  planHash: string;
  runId: string;
  taskId: string;
  role: 'dev' | 'design' | 'ui' | 'figma';
  workspace: {
    workspaceId: string;
    basePath: string;
    path: string;
    kind: 'git-worktree';
  };
  predecessors: Array<{
    featureName: string;
    phase: string;
    manifestHash: string;
    requireBackendBinding: boolean;
    backendBinding?: { bindingHash: string; identity: BackendIdentity };
  }>;
  outputCapBytes: number;
  timeoutMs: number;
  requireBackendBinding: boolean;
  stopReceipt: { kind: 'sidecar-stop'; runId: string };
}

export interface P2TransportStopReceipt {
  sentinel: typeof P2_TRANSPORT_SENTINEL;
  schemaVersion: 1;
  kind: 'sidecar-stop';
  runId: string;
  workspaceId: string;
  outputBytes: number;
  reason: 'completed' | 'deadline' | 'output-cap' | 'aborted';
}

const HASH = /^[a-f0-9]{64}$/;
const ROLES = new Set(['dev', 'design', 'ui', 'figma']);
const TOP_LEVEL_FIELDS = new Set([
  'sentinel', 'schemaVersion', 'planHash', 'runId', 'taskId', 'role',
  'workspace', 'predecessors', 'outputCapBytes', 'timeoutMs',
  'requireBackendBinding', 'stopReceipt',
]);
const RECEIPT_FIELDS = new Set([
  'sentinel', 'schemaVersion', 'kind', 'runId', 'workspaceId', 'outputBytes', 'reason',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every(key => expected.includes(key));
}

function canonicalCompare(value: string): string {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new P2TransportManifestError(`${name} malformed`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new P2TransportManifestError(`${name} must be a positive safe integer`);
  }
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new P2TransportManifestError(`${name} must be a nonnegative safe integer`);
  }
  return value as number;
}

function parseJsonRecord(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new P2TransportManifestError(`${label} is not JSON`);
  }
  if (!isPlainRecord(parsed)) throw new P2TransportManifestError(`${label} malformed`);
  return parsed;
}

function assertExactlyOneManifestSentinel(raw: string): void {
  const count = raw.match(/"sentinel"\s*:/g)?.length ?? 0;
  if (count !== 1) throw new P2TransportManifestError('requires exactly one manifest sentinel');
}

function hasRawParentSegment(value: string): boolean {
  return value.split(/[\\/]+/).some(segment => segment === '..');
}

function assertWorkspace(
  candidate: unknown,
  approvedWorkspaceBase: string,
): P2RoleTransport['workspace'] {
  if (!isPlainRecord(candidate) || candidate.kind !== 'git-worktree') {
    throw new P2TransportManifestError('workspace must be a git-worktree');
  }
  if (!hasExactlyKeys(candidate, ['workspaceId', 'basePath', 'path', 'kind'])) {
    throw new P2TransportManifestError('workspace has extra or missing fields');
  }
  const workspaceId = requiredText(candidate.workspaceId, 'workspaceId');
  const basePath = requiredText(candidate.basePath, 'workspace basePath');
  const workspacePath = requiredText(candidate.path, 'workspace path');
  if (hasRawParentSegment(basePath) || hasRawParentSegment(workspacePath)) {
    throw new P2TransportManifestError('workspace path traversal rejected');
  }
  if (/[^A-Za-z0-9._-]/.test(workspaceId)) {
    throw new P2TransportManifestError('workspaceId is not canonical');
  }
  const approved = path.resolve(approvedWorkspaceBase);
  const base = path.resolve(basePath);
  const work = path.resolve(workspacePath);
  const comparableBase = canonicalCompare(approved);
  const comparableWork = canonicalCompare(work);
  if (canonicalCompare(base) !== comparableBase || comparableWork === comparableBase || !comparableWork.startsWith(comparableBase + path.sep)) {
    throw new P2TransportManifestError('workspace must stay under the approved base');
  }
  // A junction/reparse point is never a valid requested workspace kind. These
  // names also make accidental node_modules junction plans fail before launch.
  if (/[\\/](?:node_modules|\.git)(?:[\\/]|$)/i.test(work)) {
    throw new P2TransportManifestError('workspace requests forbidden reparse intent');
  }
  return { workspaceId, basePath: base, path: work, kind: 'git-worktree' };
}

function assertBindingReference(value: unknown): { bindingHash: string; identity: BackendIdentity } {
  if (!isPlainRecord(value) || !hasExactlyKeys(value, ['bindingHash', 'identity']) || typeof value.bindingHash !== 'string' || !HASH.test(value.bindingHash) || !isPlainRecord(value.identity) || !hasExactlyKeys(value.identity, ['provider', 'modelKey', 'modelId', 'adapterVersion'])) {
    throw new P2TransportManifestError('predecessor backend binding reference malformed');
  }
  return {
    bindingHash: value.bindingHash,
    identity: {
      provider: requiredText(value.identity.provider, 'binding provider'),
      modelKey: requiredText(value.identity.modelKey, 'binding modelKey'),
      modelId: requiredText(value.identity.modelId, 'binding modelId'),
      adapterVersion: requiredText(value.identity.adapterVersion, 'binding adapterVersion'),
    },
  };
}

function sameIdentity(left: BackendIdentity, right: BackendIdentity): boolean {
  return left.provider === right.provider && left.modelKey === right.modelKey
    && left.modelId === right.modelId && left.adapterVersion === right.adapterVersion;
}

function assertPredecessors(
  candidate: unknown,
  options: P2TransportValidationOptions,
): P2RoleTransport['predecessors'] {
  if (!Array.isArray(candidate)) throw new P2TransportManifestError('predecessors malformed');
  const seen = new Set<string>();
  return candidate.map(item => {
    if (!isPlainRecord(item) || typeof item.requireBackendBinding !== 'boolean') {
      throw new P2TransportManifestError('predecessor malformed');
    }
    if (!hasExactlyKeys(item, item.requireBackendBinding
      ? ['featureName', 'phase', 'manifestHash', 'requireBackendBinding', 'backendBinding']
      : ['featureName', 'phase', 'manifestHash', 'requireBackendBinding'])) {
      throw new P2TransportManifestError('predecessor has extra or missing fields');
    }
    const featureName = requiredText(item.featureName, 'predecessor feature');
    const phase = requiredText(item.phase, 'predecessor phase');
    if (typeof item.manifestHash !== 'string' || !HASH.test(item.manifestHash)) {
      throw new P2TransportManifestError('predecessor manifestHash malformed');
    }
    const key = `${featureName}\u0000${phase}`;
    if (seen.has(key)) throw new P2TransportManifestError('duplicate predecessor bundle reference');
    seen.add(key);
    const generic = verifyBundle(featureName, phase, options.cwd);
    if (!generic.valid || generic.manifest?.manifestHash !== item.manifestHash) {
      throw new P2TransportManifestError('unverified predecessor P1 bundle');
    }
    const backendBinding = item.requireBackendBinding ? assertBindingReference(item.backendBinding) : undefined;
    if (item.requireBackendBinding) {
      const strict = verifyBackendBoundBundle(featureName, phase, options.cwd);
      if (!strict.valid || !strict.backendBinding || strict.backendBinding.bindingHash !== backendBinding!.bindingHash || !sameIdentity(strict.backendBinding.identity, backendBinding!.identity)) {
        throw new P2TransportManifestError('unverified predecessor I2 binding');
      }
    }
    return { featureName, phase, manifestHash: item.manifestHash, requireBackendBinding: item.requireBackendBinding, ...(backendBinding ? { backendBinding } : {}) };
  });
}

/** Parse and verify one manifest before any consumer takes an external action. */
export function parseP2RoleTransport(
  raw: string,
  options: P2TransportValidationOptions,
): P2RoleTransport {
  if (!isPlainRecord(options) || typeof options.cwd !== 'string' || typeof options.approvedWorkspaceBase !== 'string') {
    throw new P2TransportManifestError('validation options malformed');
  }
  assertExactlyOneManifestSentinel(raw);
  const data = parseJsonRecord(raw, 'manifest');
  if (data.sentinel !== P2_TRANSPORT_SENTINEL || data.schemaVersion !== 1) {
    throw new P2TransportManifestError('manifest sentinel/schema invalid');
  }
  if (Object.keys(data).some(key => !TOP_LEVEL_FIELDS.has(key))) {
    throw new P2TransportManifestError('extra manifest field');
  }
  if (typeof data.planHash !== 'string' || !HASH.test(data.planHash)) {
    throw new P2TransportManifestError('planHash invalid');
  }
  const runId = requiredText(data.runId, 'runId');
  const taskId = requiredText(data.taskId, 'taskId');
  if (typeof data.role !== 'string' || !ROLES.has(data.role)) {
    throw new P2TransportManifestError('role invalid');
  }
  const workspace = assertWorkspace(data.workspace, options.approvedWorkspaceBase);
  const predecessors = assertPredecessors(data.predecessors, options);
  const outputCapBytes = positiveSafeInteger(data.outputCapBytes, 'outputCapBytes');
  const timeoutMs = positiveSafeInteger(data.timeoutMs, 'timeoutMs');
  if (typeof data.requireBackendBinding !== 'boolean'
    || !isPlainRecord(data.stopReceipt)
    || !hasExactlyKeys(data.stopReceipt, ['kind', 'runId'])
    || data.stopReceipt.kind !== 'sidecar-stop'
    || data.stopReceipt.runId !== runId) {
    throw new P2TransportManifestError('backend binding/stop receipt schema invalid');
  }
  return {
    sentinel: P2_TRANSPORT_SENTINEL,
    schemaVersion: 1,
    planHash: data.planHash,
    runId,
    taskId,
    role: data.role as P2RoleTransport['role'],
    workspace,
    predecessors,
    outputCapBytes,
    timeoutMs,
    requireBackendBinding: data.requireBackendBinding,
    stopReceipt: { kind: 'sidecar-stop', runId },
  };
}

/** Ensure a role wave cannot share a worktree identity or filesystem location. */
export function validateP2RoleTransportSet(manifests: readonly P2RoleTransport[]): void {
  if (!Array.isArray(manifests)) throw new P2TransportManifestError('manifest set malformed');
  const ids = new Set<string>();
  const paths = new Set<string>();
  let runId: string | undefined;
  let planHash: string | undefined;
  const taskIds = new Set<string>();
  for (const manifest of manifests) {
    if (!isPlainRecord(manifest) || !isPlainRecord(manifest.workspace)) {
      throw new P2TransportManifestError('manifest set item malformed');
    }
    if (runId === undefined) { runId = manifest.runId; planHash = manifest.planHash; }
    if (manifest.runId !== runId || manifest.planHash !== planHash) throw new P2TransportManifestError('manifest wave mixes run or plan');
    const workspaceId = canonicalCompare(manifest.workspace.workspaceId);
    const workspacePath = canonicalCompare(path.resolve(manifest.workspace.path));
    if (ids.has(workspaceId) || paths.has(workspacePath) || taskIds.has(manifest.taskId)) {
      throw new P2TransportManifestError('duplicate workspace identity');
    }
    ids.add(workspaceId);
    paths.add(workspacePath);
    taskIds.add(manifest.taskId);
  }
}

/** A CLI-safe single-line envelope. The consumer must parse it before launch. */
export function serializeP2RoleTransport(
  value: P2RoleTransport,
  options: P2TransportValidationOptions,
): string {
  const json = JSON.stringify(value);
  parseP2RoleTransport(json, options);
  return `${P2_TRANSPORT_ENVELOPE}${json}`;
}

export function parseP2RoleTransportEnvelope(
  raw: string,
  options: P2TransportValidationOptions,
): P2RoleTransport {
  const occurrences = raw.match(new RegExp(P2_TRANSPORT_ENVELOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length ?? 0;
  const nonblankLines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  const lines = nonblankLines.filter(line => line.startsWith(P2_TRANSPORT_ENVELOPE));
  if (occurrences !== 1 || lines.length !== 1 || nonblankLines.length !== 1) {
    throw new P2TransportManifestError('requires exactly one envelope sentinel');
  }
  return parseP2RoleTransport(lines[0].slice(P2_TRANSPORT_ENVELOPE.length), options);
}

/** Validate a stop receipt and reject output-over-cap before handoff/merge. */
export function parseP2TransportStopReceipt(
  raw: string,
  manifest: P2RoleTransport,
): P2TransportStopReceipt {
  const data = parseJsonRecord(raw, 'stop receipt');
  if (!hasExactlyKeys(data, [...RECEIPT_FIELDS])
    || data.sentinel !== P2_TRANSPORT_SENTINEL
    || data.schemaVersion !== 1
    || data.kind !== 'sidecar-stop'
    || data.runId !== manifest.runId
    || data.workspaceId !== manifest.workspace.workspaceId
    || !['completed', 'deadline', 'output-cap', 'aborted'].includes(data.reason as string)) {
    throw new P2TransportManifestError('stop receipt schema invalid');
  }
  const outputBytes = nonNegativeSafeInteger(data.outputBytes, 'stop receipt outputBytes');
  if (outputBytes > manifest.outputCapBytes) {
    throw new P2TransportManifestError('stop receipt output cap exceeded');
  }
  return {
    sentinel: P2_TRANSPORT_SENTINEL,
    schemaVersion: 1,
    kind: 'sidecar-stop',
    runId: manifest.runId,
    workspaceId: manifest.workspace.workspaceId,
    outputBytes,
    reason: data.reason as P2TransportStopReceipt['reason'],
  };
}
