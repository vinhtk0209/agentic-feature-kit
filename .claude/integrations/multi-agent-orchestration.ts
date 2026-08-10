/**
 * P2 — pure role-DAG, lease, evidence-handoff, and merge-gate foundation.
 *
 * No subprocess, worktree, network, provider, database, or scheduler side effect belongs here.
 * The P1/I2 filesystem verifier is an optional boundary factory; the core receives it by injection.
 */
import { verifyBackendBoundBundle, verifyBundle } from './evidence-bundle';
import type { GateVerdict } from './multi-provider-backends';

export const ROLE_AGENTS = ['dev', 'design', 'ui', 'figma'] as const;
export type RoleAgent = typeof ROLE_AGENTS[number];
const HASH_RE = /^[a-f0-9]{64}$/;

export interface RoleTask {
  id: string;
  role: RoleAgent;
  dependsOn: readonly string[];
  evidencePhase: string;
  contextBudgetTokens: number;
  timeoutMs: number;
}

export interface RoleDag {
  contractHash: string;
  tasks: readonly RoleTask[];
}

export interface Lease {
  leaseId: string;
  taskId: string;
  ownerId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface LeaseLedger {
  active: Readonly<Record<string, Lease>>;
}

export interface LeaseRequest {
  leaseId: string;
  taskId: string;
  ownerId: string;
  nowMs: number;
  ttlMs: number;
}

export interface LeaseDecision {
  accepted: boolean;
  ledger: LeaseLedger;
  lease?: Lease;
  reason?: 'unknown-task' | 'already-completed' | 'dependencies-incomplete' | 'already-leased' | 'expired-lease-must-be-recovered' | 'duplicate-lease-id' | 'ttl-exceeds-task-timeout' | 'lease-expiry-overflow' | 'malformed-request';
}

export interface RecoveryDecision {
  action: 'reclaim-expired-lease' | 'await-active-lease' | 'dispatch-ready-task' | 'deadlock';
  taskIds: string[];
  ledger: LeaseLedger;
}

export interface EvidenceCheckRequest {
  featureName: string;
  phase: string;
  requireBackendBinding: boolean;
}

export interface EvidenceCheckResult {
  valid: boolean;
  reason?: string;
}

export interface EvidenceVerifier {
  verify(request: EvidenceCheckRequest): EvidenceCheckResult;
}

export interface AgentHandoff {
  taskId: string;
  role: RoleAgent;
  agentId: string;
  leaseId: string;
  featureName: string;
  phase: string;
  contractHash: string;
  /** Caller-provided measured/injected context size; never silently truncated by this core. */
  contextTokens: number;
  passClaim: boolean;
  requireBackendBinding: boolean;
}

export interface HandoffDecision {
  accepted: boolean;
  reason?: 'unknown-task' | 'role-mismatch' | 'lease-missing' | 'lease-mismatch' | 'lease-expired' | 'contract-drift' | 'phase-mismatch' | 'feature-mismatch' | 'pass-not-claimed' | 'context-starved' | 'evidence-invalid' | 'malformed-handoff';
  recovery?: 'summarize-and-retry' | 'reclaim-and-retry';
}

export interface MergeDecision {
  passed: boolean;
  reason?: 'merge-input-malformed' | 'handoffs-malformed' | 'handoff-rejected' | 'duplicate-handoff' | 'incomplete-handoffs' | 'dependency-not-handed-off' | 'gate-failed' | 'gate-malformed' | 'gate-error';
  rejectedTaskId?: string;
  handoff?: HandoffDecision;
  gate?: GateVerdict;
}

/** Named validation error: caller-supplied runtime scheduler state is never normalized or repaired. */
export class OrchestrationValidationError extends Error {
  constructor(message: string) {
    super(`multi-agent orchestration: ${message}`);
    this.name = 'OrchestrationValidationError';
  }
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f]/.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && value >= 0;
}

function cloneLedger(ledger: LeaseLedger): LeaseLedger {
  return { active: Object.fromEntries(Object.entries(ledger.active).map(([taskId, lease]) => [taskId, { ...lease }])) };
}

function taskMap(dag: RoleDag): Map<string, RoleTask> {
  return new Map(dag.tasks.map((task) => [task.id, task]));
}

/** Gate boundaries are runtime-adversarial: require exactly the documented verdict shape. */
function isExactGateVerdict(value: unknown): value is GateVerdict {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return keys.length === 2 && keys[0] === 'detail' && keys[1] === 'passed' && typeof record.passed === 'boolean' && nonBlank(record.detail);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Reject malformed, unknown-dependency, and cyclic role graphs before scheduling any lease. */
export function validateRoleDag(dag: RoleDag): void {
  if (!dag || !HASH_RE.test(dag.contractHash) || !Array.isArray(dag.tasks) || dag.tasks.length === 0) throw new OrchestrationValidationError('role DAG is malformed');
  const tasks = taskMap(dag);
  if (tasks.size !== dag.tasks.length) throw new OrchestrationValidationError('role DAG has duplicate task ids');
  for (const task of dag.tasks) {
    if (!nonBlank(task.id) || !ROLE_AGENTS.includes(task.role) || !Array.isArray(task.dependsOn) || !nonBlank(task.evidencePhase) || !positiveSafeInteger(task.contextBudgetTokens) || !positiveSafeInteger(task.timeoutMs)) {
      throw new OrchestrationValidationError('role DAG task is malformed');
    }
    if (new Set(task.dependsOn).size !== task.dependsOn.length || task.dependsOn.some((dependency) => !tasks.has(dependency) || dependency === task.id)) {
      throw new OrchestrationValidationError('role DAG dependency is malformed');
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new OrchestrationValidationError('role DAG contains a cycle');
    visiting.add(id);
    for (const dependency of tasks.get(id)!.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of dag.tasks) visit(task.id);
}

/** Validate runtime completion state; duplicate or unknown completion claims are never deduped. */
export function validateCompletedTaskIds(dag: RoleDag, completedTaskIds: readonly string[]): void {
  validateRoleDag(dag);
  if (!Array.isArray(completedTaskIds)) throw new OrchestrationValidationError('completed task ids must be an array');
  const known = taskMap(dag);
  const seen = new Set<string>();
  for (const taskId of completedTaskIds) {
    if (!nonBlank(taskId) || !known.has(taskId) || seen.has(taskId)) throw new OrchestrationValidationError('completed task ids contain an unknown, duplicate, or malformed id');
    seen.add(taskId);
  }
}

/** Validate externally supplied lease state before every scheduling or handoff operation. */
export function validateLeaseLedger(dag: RoleDag, ledger: LeaseLedger): void {
  validateRoleDag(dag);
  if (!ledger || typeof ledger !== 'object' || Object.getPrototypeOf(ledger) !== Object.prototype) throw new OrchestrationValidationError('lease ledger must be a plain record');
  const active = (ledger as { active?: unknown }).active;
  if (!active || typeof active !== 'object' || Array.isArray(active) || Object.getPrototypeOf(active) !== Object.prototype) throw new OrchestrationValidationError('lease ledger active must be a plain record');
  const known = taskMap(dag);
  const leaseIds = new Set<string>();
  for (const [taskId, rawLease] of Object.entries(active)) {
    if (!known.has(taskId) || !rawLease || typeof rawLease !== 'object' || Array.isArray(rawLease) || Object.getPrototypeOf(rawLease) !== Object.prototype) {
      throw new OrchestrationValidationError('lease ledger contains an unknown task or malformed lease');
    }
    const lease = rawLease as Lease;
    const task = known.get(taskId)!;
    if (
      lease.taskId !== taskId || !nonBlank(lease.leaseId) || !nonBlank(lease.ownerId) ||
      !nonNegativeSafeInteger(lease.issuedAtMs) || !nonNegativeSafeInteger(lease.expiresAtMs) || lease.expiresAtMs <= lease.issuedAtMs ||
      lease.expiresAtMs - lease.issuedAtMs > task.timeoutMs || leaseIds.has(lease.leaseId)
    ) throw new OrchestrationValidationError('lease ledger lease is malformed, mismatched, expired-at-issue, or duplicated');
    leaseIds.add(lease.leaseId);
  }
}

export function readyTaskIds(dag: RoleDag, completedTaskIds: readonly string[]): string[] {
  validateCompletedTaskIds(dag, completedTaskIds);
  const completed = new Set(completedTaskIds);
  return dag.tasks
    .filter((task) => !completed.has(task.id) && task.dependsOn.every((dependency) => completed.has(dependency)))
    .map((task) => task.id)
    .sort();
}

/** Explicitly reclaim expired leases; claims never overwrite a prior record. */
export function recoverExpiredLeases(dag: RoleDag, ledger: LeaseLedger, nowMs: number): { ledger: LeaseLedger; reclaimedTaskIds: string[] } {
  validateLeaseLedger(dag, ledger);
  if (!nonNegativeSafeInteger(nowMs)) throw new OrchestrationValidationError('lease recovery time is malformed');
  const active: Record<string, Lease> = {};
  const reclaimedTaskIds: string[] = [];
  for (const [taskId, lease] of Object.entries(ledger.active)) {
    if (lease.expiresAtMs <= nowMs) reclaimedTaskIds.push(taskId);
    else active[taskId] = { ...lease };
  }
  return { ledger: { active }, reclaimedTaskIds: reclaimedTaskIds.sort() };
}

export function claimLease(dag: RoleDag, completedTaskIds: readonly string[], ledger: LeaseLedger, request: LeaseRequest): LeaseDecision {
  validateCompletedTaskIds(dag, completedTaskIds);
  validateLeaseLedger(dag, ledger);
  const safeLedger = cloneLedger(ledger);
  if (!request || !nonBlank(request.leaseId) || !nonBlank(request.taskId) || !nonBlank(request.ownerId) || !nonNegativeSafeInteger(request.nowMs) || !positiveSafeInteger(request.ttlMs)) {
    return { accepted: false, ledger: safeLedger, reason: 'malformed-request' };
  }
  const task = taskMap(dag).get(request.taskId);
  if (!task) return { accepted: false, ledger: safeLedger, reason: 'unknown-task' };
  if (completedTaskIds.includes(task.id)) return { accepted: false, ledger: safeLedger, reason: 'already-completed' };
  if (!task.dependsOn.every((dependency) => completedTaskIds.includes(dependency))) return { accepted: false, ledger: safeLedger, reason: 'dependencies-incomplete' };
  if (request.ttlMs > task.timeoutMs) return { accepted: false, ledger: safeLedger, reason: 'ttl-exceeds-task-timeout' };
  if (request.nowMs > Number.MAX_SAFE_INTEGER - request.ttlMs) return { accepted: false, ledger: safeLedger, reason: 'lease-expiry-overflow' };
  const existing = safeLedger.active[task.id];
  if (existing) return { accepted: false, ledger: safeLedger, reason: existing.expiresAtMs <= request.nowMs ? 'expired-lease-must-be-recovered' : 'already-leased' };
  if (Object.values(safeLedger.active).some((lease) => lease.leaseId === request.leaseId)) return { accepted: false, ledger: safeLedger, reason: 'duplicate-lease-id' };
  const lease: Lease = { leaseId: request.leaseId, taskId: task.id, ownerId: request.ownerId, issuedAtMs: request.nowMs, expiresAtMs: request.nowMs + request.ttlMs };
  return { accepted: true, ledger: { active: { ...safeLedger.active, [task.id]: lease } }, lease };
}

/** Deterministic scheduler advice; it does not launch or retry any task. */
export function recommendRecovery(dag: RoleDag, completedTaskIds: readonly string[], ledger: LeaseLedger, nowMs: number): RecoveryDecision {
  validateCompletedTaskIds(dag, completedTaskIds);
  validateLeaseLedger(dag, ledger);
  const recovered = recoverExpiredLeases(dag, ledger, nowMs);
  if (recovered.reclaimedTaskIds.length > 0) return { action: 'reclaim-expired-lease', taskIds: recovered.reclaimedTaskIds, ledger: recovered.ledger };
  const ready = readyTaskIds(dag, completedTaskIds);
  const unleasedReady = ready.filter((taskId) => !recovered.ledger.active[taskId]);
  if (unleasedReady.length > 0) return { action: 'dispatch-ready-task', taskIds: unleasedReady, ledger: recovered.ledger };
  const activeReady = ready.filter((taskId) => !!recovered.ledger.active[taskId]);
  if (activeReady.length > 0) return { action: 'await-active-lease', taskIds: activeReady, ledger: recovered.ledger };
  return { action: 'deadlock', taskIds: [], ledger: recovered.ledger };
}

/** Production boundary for P1 generic evidence and optional strict I2 backend evidence. */
export function createP1EvidenceBundleVerifier(cwd: string = process.cwd()): EvidenceVerifier {
  return {
    verify(request) {
      const p1 = verifyBundle(request.featureName, request.phase, cwd);
      if (!p1.valid) return { valid: false, reason: 'p1-bundle-invalid' };
      if (!request.requireBackendBinding) return { valid: true };
      const i2 = verifyBackendBoundBundle(request.featureName, request.phase, cwd);
      return i2.valid ? { valid: true } : { valid: false, reason: 'i2-binding-invalid' };
    },
  };
}

/** Verify one role claim against its active lease, shared contract, budget, and P1/I2 evidence. */
export function verifyAgentHandoff(dag: RoleDag, ledger: LeaseLedger, handoff: AgentHandoff, nowMs: number, evidenceVerifier: EvidenceVerifier, expectedFeatureName: string): HandoffDecision {
  validateRoleDag(dag);
  validateLeaseLedger(dag, ledger);
  if (!nonNegativeSafeInteger(nowMs) || !handoff || !nonBlank(handoff.taskId) || !nonBlank(handoff.agentId) || !nonBlank(handoff.leaseId) || !nonBlank(handoff.featureName) || !nonBlank(handoff.phase) || !nonNegativeSafeInteger(handoff.contextTokens) || typeof handoff.requireBackendBinding !== 'boolean') {
    return { accepted: false, reason: 'malformed-handoff' };
  }
  const task = taskMap(dag).get(handoff.taskId);
  if (!task) return { accepted: false, reason: 'unknown-task' };
  if (handoff.role !== task.role) return { accepted: false, reason: 'role-mismatch' };
  const lease = ledger.active[task.id];
  if (!lease) return { accepted: false, reason: 'lease-missing' };
  if (lease.leaseId !== handoff.leaseId || lease.ownerId !== handoff.agentId || lease.taskId !== task.id) return { accepted: false, reason: 'lease-mismatch' };
  if (lease.expiresAtMs <= nowMs) return { accepted: false, reason: 'lease-expired', recovery: 'reclaim-and-retry' };
  if (handoff.contractHash !== dag.contractHash) return { accepted: false, reason: 'contract-drift' };
  if (handoff.phase !== task.evidencePhase) return { accepted: false, reason: 'phase-mismatch' };
  if (handoff.featureName !== expectedFeatureName) return { accepted: false, reason: 'feature-mismatch' };
  if (handoff.passClaim !== true) return { accepted: false, reason: 'pass-not-claimed' };
  if (handoff.contextTokens > task.contextBudgetTokens) return { accepted: false, reason: 'context-starved', recovery: 'summarize-and-retry' };
  try {
    if (!evidenceVerifier || typeof evidenceVerifier.verify !== 'function') return { accepted: false, reason: 'evidence-invalid' };
    const evidence = evidenceVerifier.verify({ featureName: handoff.featureName, phase: handoff.phase, requireBackendBinding: handoff.requireBackendBinding });
    return evidence?.valid === true ? { accepted: true } : { accepted: false, reason: 'evidence-invalid' };
  } catch {
    return { accepted: false, reason: 'evidence-invalid' };
  }
}

/**
 * Merge only a complete valid handoff set, then invoke the supplied single-agent gate exactly
 * once. The gate never receives agent count or role metadata, making its contract invariant.
 */
export async function verifyFinalMerge(input: {
  dag: RoleDag;
  ledger: LeaseLedger;
  handoffs: readonly AgentHandoff[];
  nowMs: number;
  evidenceVerifier: EvidenceVerifier;
  expectedFeatureName: string;
  mergedOutput: string;
  finalGate: (mergedOutput: string) => Promise<GateVerdict>;
}): Promise<MergeDecision> {
  if (!isPlainRecord(input) || typeof input.mergedOutput !== 'string' || !input.mergedOutput.trim() || typeof input.finalGate !== 'function') {
    return { passed: false, reason: 'merge-input-malformed' };
  }
  validateRoleDag(input.dag);
  if (!Array.isArray(input.handoffs)) return { passed: false, reason: 'handoffs-malformed' };
  const seen = new Set<string>();
  const taskIds = new Set(input.dag.tasks.map((task) => task.id));
  for (const handoff of input.handoffs) {
    if (!isPlainRecord(handoff)) return { passed: false, reason: 'handoffs-malformed' };
    if (seen.has(handoff.taskId)) return { passed: false, reason: 'duplicate-handoff', rejectedTaskId: handoff.taskId };
    seen.add(handoff.taskId);
    const verified = verifyAgentHandoff(input.dag, input.ledger, handoff, input.nowMs, input.evidenceVerifier, input.expectedFeatureName);
    if (!verified.accepted) return { passed: false, reason: 'handoff-rejected', rejectedTaskId: handoff.taskId, handoff: verified };
  }
  if (seen.size !== taskIds.size || [...taskIds].some((taskId) => !seen.has(taskId))) return { passed: false, reason: 'incomplete-handoffs' };
  const handoffByTask = new Map(input.handoffs.map((handoff) => [handoff.taskId, handoff]));
  for (const task of input.dag.tasks) {
    if (task.dependsOn.some((dependency) => !handoffByTask.has(dependency))) return { passed: false, reason: 'dependency-not-handed-off', rejectedTaskId: task.id };
  }
  let gate: GateVerdict;
  try {
    gate = await input.finalGate(input.mergedOutput);
  } catch {
    return { passed: false, reason: 'gate-error' };
  }
  if (!isExactGateVerdict(gate)) return { passed: false, reason: 'gate-malformed' };
  return gate.passed ? { passed: true, gate } : { passed: false, reason: 'gate-failed', gate };
}
