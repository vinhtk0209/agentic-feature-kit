/** P2-B source-only runtime adapter. It dispatches through injected non-shell role boundaries; it never spawns. */
import type { GateVerdict } from './multi-provider-backends';
import {
  claimLease, readyTaskIds, recoverExpiredLeases, validateRoleDag, verifyAgentHandoff, verifyFinalMerge,
  type AgentHandoff, type EvidenceVerifier, type Lease, type LeaseLedger, type RoleDag, type RoleTask,
} from './multi-agent-orchestration';

export interface RoleContext { taskId: string; prompt: string; contextTokens: number; }
export interface BundleReference { taskId: string; featureName: string; phase: string; requireBackendBinding: boolean; }
export interface RoleExecutionRequest {
  task: RoleTask;
  context: RoleContext;
  lease: Lease;
  /** Only previously verified P1/I2 bundle references, never another role's raw context. */
  predecessorBundles: readonly BundleReference[];
  shell: false;
}
export type RoleExecutionResult = { status: 'handoff'; handoff: AgentHandoff } | { status: 'timeout' };
export interface RoleExecutor { execute(request: RoleExecutionRequest): Promise<RoleExecutionResult>; }
export interface MergeExecutor { merge(input: { handoffs: readonly AgentHandoff[]; bundles: readonly BundleReference[] }): Promise<string>; }
export interface RuntimeClock { nowMs(): number; }
export interface LeaseIdSource { next(taskId: string, attempt: number): string; }
/** Runtime owns the timeout decision; tests inject a deterministic race without real timers. */
export interface ExecutionDeadline { race<T>(input: { promise: Promise<T>; timeoutMs: number }): Promise<{ timedOut: boolean; value?: T }>; }

export interface RoleRuntimeInput {
  dag: RoleDag;
  featureName: string;
  contexts: readonly RoleContext[];
  evidenceVerifier: EvidenceVerifier;
  executor: RoleExecutor;
  merger: MergeExecutor;
  finalGate: (output: string) => Promise<GateVerdict>;
  clock: RuntimeClock;
  leaseIds: LeaseIdSource;
  deadline: ExecutionDeadline;
  maxAttemptsPerTask: number;
}
export interface RoleRuntimeResult {
  passed: boolean;
  reason?: 'runtime-input-malformed' | 'clock-error' | 'lease-id-error' | 'deadline-error' | 'deadline-malformed' | 'context-starved' | 'executor-error' | 'executor-malformed' | 'handoff-rejected' | 'timeout-exhausted' | 'merge-error' | 'merge-malformed' | 'final-gate-rejected';
  taskId?: string;
  handoffs: readonly AgentHandoff[];
}

function plain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function contextMap(dag: RoleDag, contexts: readonly RoleContext[]): Map<string, RoleContext> | undefined {
  if (!Array.isArray(contexts) || contexts.length !== dag.tasks.length) return undefined;
  const out = new Map<string, RoleContext>();
  for (const context of contexts) {
    if (!plain(context) || typeof context.taskId !== 'string' || typeof context.prompt !== 'string' || !context.prompt.trim() || !Number.isSafeInteger(context.contextTokens) || context.contextTokens < 0 || out.has(context.taskId)) return undefined;
    if (!dag.tasks.some((task) => task.id === context.taskId)) return undefined;
    out.set(context.taskId, { ...context });
  }
  return out;
}
function bundleReference(handoff: AgentHandoff): BundleReference {
  return { taskId: handoff.taskId, featureName: handoff.featureName, phase: handoff.phase, requireBackendBinding: handoff.requireBackendBinding };
}
function isExecutionResult(value: unknown): value is RoleExecutionResult {
  if (!plain(value) || (value.status !== 'timeout' && value.status !== 'handoff')) return false;
  const keys = Object.keys(value).sort();
  return value.status === 'timeout' ? keys.length === 1 && keys[0] === 'status' : keys.length === 2 && keys[0] === 'handoff' && keys[1] === 'status' && plain(value.handoff);
}
function frozenRequest(entry: { task: RoleTask; context: RoleContext; lease: Lease; predecessorBundles: BundleReference[] }): RoleExecutionRequest {
  const request = { task: { ...entry.task, dependsOn: [...entry.task.dependsOn] }, context: { ...entry.context }, lease: { ...entry.lease }, predecessorBundles: entry.predecessorBundles.map((bundle) => ({ ...bundle })), shell: false as const };
  Object.freeze(request.task.dependsOn); Object.freeze(request.task); Object.freeze(request.context); Object.freeze(request.lease);
  request.predecessorBundles.forEach(Object.freeze); Object.freeze(request.predecessorBundles); return Object.freeze(request);
}
function now(clock: RuntimeClock): number | undefined { try { const value = clock.nowMs(); return Number.isSafeInteger(value) && value >= 0 ? value : undefined; } catch { return undefined; } }

/**
 * Execute dependency-ready roles in parallel waves through `RoleExecutor`. The executor owns any
 * real tool transport; this kit boundary supplies only structured data and `shell:false`.
 */
export async function executeValidatedRolePlan(input: RoleRuntimeInput): Promise<RoleRuntimeResult> {
  const empty = (): RoleRuntimeResult => ({ passed: false, handoffs: [] });
  if (!plain(input) || typeof input.featureName !== 'string' || !input.featureName.trim() || !Number.isSafeInteger(input.maxAttemptsPerTask) || input.maxAttemptsPerTask < 1 || !input.executor || typeof input.executor.execute !== 'function' || !input.merger || typeof input.merger.merge !== 'function' || !input.clock || typeof input.clock.nowMs !== 'function' || !input.leaseIds || typeof input.leaseIds.next !== 'function' || !input.deadline || typeof input.deadline.race !== 'function' || typeof input.finalGate !== 'function') return { ...empty(), reason: 'runtime-input-malformed' };
  try { validateRoleDag(input.dag); } catch { return { ...empty(), reason: 'runtime-input-malformed' }; }
  const contexts = contextMap(input.dag, input.contexts);
  if (!contexts) return { ...empty(), reason: 'runtime-input-malformed' };
  let ledger: LeaseLedger = { active: {} };
  const completed: string[] = [];
  const handoffs: AgentHandoff[] = [];
  const attempts = new Map<string, number>();

  while (completed.length < input.dag.tasks.length) {
    let ready: string[];
    try { ready = readyTaskIds(input.dag, completed); } catch { return { passed: false, reason: 'runtime-input-malformed', handoffs }; }
    if (ready.length === 0) return { passed: false, reason: 'timeout-exhausted', handoffs };
    const wave: Array<{ task: RoleTask; context: RoleContext; lease: Lease; predecessorBundles: BundleReference[] }> = [];
    for (const taskId of ready) {
      const task = input.dag.tasks.find((candidate) => candidate.id === taskId)!;
      const context = contexts.get(taskId)!;
      if (context.contextTokens > task.contextBudgetTokens) return { passed: false, reason: 'context-starved', taskId, handoffs };
      const attempt = (attempts.get(taskId) ?? 0) + 1;
      const nowMs = now(input.clock); if (nowMs === undefined) return { passed: false, reason: 'clock-error', taskId, handoffs };
      let leaseId: string; try { leaseId = input.leaseIds.next(taskId, attempt); } catch { return { passed: false, reason: 'lease-id-error', taskId, handoffs }; }
      const claimed = claimLease(input.dag, completed, ledger, { leaseId, taskId, ownerId: `role:${task.role}`, nowMs, ttlMs: task.timeoutMs });
      if (!claimed.accepted || !claimed.lease) return { passed: false, reason: 'runtime-input-malformed', taskId, handoffs };
      ledger = claimed.ledger;
      wave.push({ task, context, lease: claimed.lease, predecessorBundles: task.dependsOn.map((dependency) => bundleReference(handoffs.find((handoff) => handoff.taskId === dependency)!)) });
    }
    const outcomes = await Promise.all(wave.map(async (entry) => {
      let promise: Promise<RoleExecutionResult | { executorErrored: true }>;
      try { promise = Promise.resolve(input.executor.execute(frozenRequest(entry))).catch(() => ({ executorErrored: true })); } catch { return { entry, result: undefined, executorErrored: true, timedOut: false, deadlineErrored: false }; }
      try { const bounded = await input.deadline.race({ promise, timeoutMs: entry.task.timeoutMs }); if (!plain(bounded) || typeof bounded.timedOut !== 'boolean') return { entry, result: undefined, executorErrored: false, timedOut: false, deadlineErrored: true }; return { entry, result: bounded.value as unknown, executorErrored: false, timedOut: bounded.timedOut, deadlineErrored: false }; } catch { return { entry, result: undefined, executorErrored: false, timedOut: false, deadlineErrored: true }; }
    }));
    for (const { entry, result, executorErrored, timedOut, deadlineErrored } of outcomes) {
      const taskId = entry.task.id;
      if (executorErrored) return { passed: false, reason: 'executor-error', taskId, handoffs };
      if (deadlineErrored) return { passed: false, reason: 'deadline-error', taskId, handoffs };
      if (plain(result) && result.executorErrored === true) return { passed: false, reason: 'executor-error', taskId, handoffs };
      const effectiveResult = timedOut ? { status: 'timeout' } : result;
      if (!isExecutionResult(effectiveResult)) return { passed: false, reason: 'executor-malformed', taskId, handoffs };
      if (effectiveResult.status === 'timeout') {
        const nextAttempt = (attempts.get(taskId) ?? 0) + 1;
        attempts.set(taskId, nextAttempt);
        if (nextAttempt >= input.maxAttemptsPerTask) return { passed: false, reason: 'timeout-exhausted', taskId, handoffs };
        ledger = recoverExpiredLeases(input.dag, ledger, entry.lease.expiresAtMs).ledger;
        continue;
      }
      if (effectiveResult.handoff.contextTokens !== entry.context.contextTokens) return { passed: false, reason: 'handoff-rejected', taskId, handoffs };
      const checkedAt = now(input.clock); if (checkedAt === undefined) return { passed: false, reason: 'clock-error', taskId, handoffs };
      const verdict = verifyAgentHandoff(input.dag, ledger, effectiveResult.handoff, checkedAt, input.evidenceVerifier, input.featureName);
      if (!verdict.accepted) return { passed: false, reason: 'handoff-rejected', taskId, handoffs };
      handoffs.push(effectiveResult.handoff);
      completed.push(taskId);
    }
  }
  let mergedOutput: string;
  try { mergedOutput = await input.merger.merge({ handoffs, bundles: handoffs.map(bundleReference) }); } catch { return { passed: false, reason: 'merge-error', handoffs }; }
  if (typeof mergedOutput !== 'string' || !mergedOutput.trim()) return { passed: false, reason: 'merge-malformed', handoffs };
  const mergedAt = now(input.clock); if (mergedAt === undefined) return { passed: false, reason: 'clock-error', handoffs };
  const merged = await verifyFinalMerge({ dag: input.dag, ledger, handoffs, nowMs: mergedAt, evidenceVerifier: input.evidenceVerifier, expectedFeatureName: input.featureName, mergedOutput, finalGate: input.finalGate });
  return merged.passed ? { passed: true, handoffs } : { passed: false, reason: 'final-gate-rejected', handoffs };
}
