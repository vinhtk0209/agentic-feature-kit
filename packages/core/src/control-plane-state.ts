import {
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_MAX_EVIDENCE_REFS,
  CONTROL_PLANE_SCHEMA_VERSION,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
  type OperationCode,
  type OperationDescriptor,
  type OperationReplayClass,
  type WorkerCapabilityManifest,
  validateControlPlaneExecutionEnvelope,
  validateControlPlaneOperationRegistry,
  validateWorkerCapabilityManifest,
} from './control-plane'

export const CONTROL_PLANE_HEARTBEAT_INTERVAL_MS = 15_000

export const CONTROL_PLANE_TASK_STATE_CODES = [
  'draft',
  'awaiting_approval',
  'approved',
  'queued',
  'leased',
  'running',
  'awaiting_input',
  'cancel_requested',
  'passed',
  'failed',
  'recovery_required',
  'cancelled',
] as const

export const CONTROL_PLANE_MUTATION_ACTIONS = [
  'submit_for_approval',
  'approve',
  'enqueue',
  'claim_lease',
  'start_execution',
  'pause_for_input',
  'resume_from_input',
  'request_runtime_approval',
  'approve_runtime',
  'heartbeat',
  'request_cancel',
  'accept_receipt',
  'recover_lease',
] as const

export const CONTROL_PLANE_MUTATION_REASON_CODES = [
  'workflow_transition',
  'operator_approved',
  'lease_claimed',
  'lease_started',
  'input_required',
  'input_available',
  'approval_required',
  'runtime_approved',
  'lease_heartbeat',
  'operator_cancelled',
  'receipt_received',
  'lease_expired',
] as const

export const CONTROL_PLANE_RECEIPT_OUTCOMES = ['passed', 'failed', 'cancelled', 'unknown_outcome'] as const
export const CONTROL_PLANE_RECOVERY_JOURNAL_STATES = ['not_started', 'receipt_available', 'execution_started', 'unknown'] as const

export type ControlPlaneTaskStateCode = (typeof CONTROL_PLANE_TASK_STATE_CODES)[number]
export type ControlPlaneMutationAction = (typeof CONTROL_PLANE_MUTATION_ACTIONS)[number]
export type ControlPlaneMutationReasonCode = (typeof CONTROL_PLANE_MUTATION_REASON_CODES)[number]
export type ControlPlaneReceiptOutcome = (typeof CONTROL_PLANE_RECEIPT_OUTCOMES)[number]
export type ControlPlaneRecoveryJournalState = (typeof CONTROL_PLANE_RECOVERY_JOURNAL_STATES)[number]

export type ControlPlaneTaskState =
  | { readonly code: 'awaiting_approval'; readonly approvalContext: 'definition' | 'runtime' }
  | { readonly code: Exclude<ControlPlaneTaskStateCode, 'awaiting_approval'> }

export interface ControlPlaneTaskIdentity {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly commandRunId: string
  readonly rootRunId: string
  readonly parentRunId: string | null
  readonly attempt: number
  readonly repositoryId: string
  readonly progressBindingHash: string
}

export interface ControlPlaneTaskOperationBinding {
  readonly code: OperationCode
  readonly contractHash: string
  readonly replayClass: OperationReplayClass
}

export interface ControlPlaneMutationIntent {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly actorId: string
  readonly action: ControlPlaneMutationAction
  readonly reasonCode: ControlPlaneMutationReasonCode
  readonly idempotencyKey: string
  readonly requestedAt: string
  readonly expectedResourceVersion: number
  readonly intentHash: string
}

export interface ControlPlaneMutationIntentInput {
  readonly tenantId: string
  readonly taskId: string
  readonly actorId: string
  readonly action: ControlPlaneMutationAction
  readonly reasonCode: ControlPlaneMutationReasonCode
  readonly idempotencyKey: string
  readonly requestedAt: string
  readonly expectedResourceVersion: number
}

export interface ControlPlaneLeaseRecord {
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly claimedAt: string
  readonly startedAt: string | null
  readonly lastHeartbeatAt: string
  readonly lastHeartbeatId: string | null
  readonly lastHeartbeatRequestHash: string | null
  readonly currentExpiresAt: string
}

export interface ControlPlaneTaskSnapshot {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly identity: ControlPlaneTaskIdentity
  readonly operation: ControlPlaneTaskOperationBinding
  readonly state: ControlPlaneTaskState
  readonly resourceVersion: number
  readonly lease: ControlPlaneLeaseRecord | null
  readonly cancellationIntent: ControlPlaneMutationIntent | null
  readonly acceptedReceiptHash: string | null
}

export interface ControlPlaneTaskSnapshotInput {
  readonly identity: ControlPlaneTaskIdentity
  readonly operationCode: OperationCode
}

export interface ControlPlaneExecutionReceipt {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly identity: ControlPlaneExecutionEnvelope['identity']
  readonly envelopeHash: string
  readonly operationCode: OperationCode
  readonly operationContractHash: string
  readonly outcome: ControlPlaneReceiptOutcome
  readonly completedAt: string
  readonly progressBindingHash: string
  readonly progressTailHash: string
  readonly evidenceHashes: readonly string[]
  readonly resultHash: string | null
  readonly receiptHash: string
}

export interface ControlPlaneExecutionReceiptInput extends Omit<ControlPlaneExecutionReceipt, 'schemaVersion' | 'contractVersion' | 'receiptHash'> {}

export type ControlPlaneTaskDecisionStatus = 'accepted' | 'idempotent' | 'rejected' | 'conflict' | 'quarantined'
export type ControlPlaneTaskDecisionReason =
  | 'illegal_transition'
  | 'stale_resource_version'
  | 'resource_version_overflow'
  | 'intent_scope_mismatch'
  | 'active_lease_exists'
  | 'lease_missing'
  | 'envelope_identity_mismatch'
  | 'operation_mismatch'
  | 'worker_capability_mismatch'
  | 'outside_lease_window'
  | 'lease_expired'
  | 'heartbeat_not_monotonic'
  | 'heartbeat_extension_exceeded'
  | 'deadline_exceeded'
  | 'heartbeat_id_conflict'
  | 'cancellation_pending'
  | 'idempotency_conflict'
  | 'terminal_state'
  | 'recovery_required'
  | 'receipt_conflict'
  | 'receipt_mismatch'
  | 'late_receipt'
  | 'cancellation_won'
  | 'unexpected_receipt_outcome'
  | 'lease_active'
  | 'receipt_replay_required'
  | 'a2d_retry_required'

export interface ControlPlaneTaskMutationDecision {
  readonly status: ControlPlaneTaskDecisionStatus
  readonly reason?: ControlPlaneTaskDecisionReason
  readonly snapshot: ControlPlaneTaskSnapshot
}

export interface ControlPlaneLeaseClaimInput {
  readonly intent: ControlPlaneMutationIntent
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly workerManifest: WorkerCapabilityManifest
  readonly observedAt: string
}

export interface ControlPlaneExecutionStartInput {
  readonly intent: ControlPlaneMutationIntent
  readonly observedAt: string
}

export interface ControlPlaneHeartbeatInput {
  readonly intent: ControlPlaneMutationIntent
  readonly heartbeatId: string
  readonly observedAt: string
  readonly requestedExpiresAt: string
}

export interface ControlPlaneReceiptAcceptanceInput {
  readonly intent: ControlPlaneMutationIntent
  readonly receipt: ControlPlaneExecutionReceipt
  readonly observedAt: string
}

export interface ControlPlaneRecoveryObservation {
  readonly observedAt: string
  readonly journalState: ControlPlaneRecoveryJournalState
  readonly receiptHash: string | null
}

export type ControlPlaneRecoveryAction =
  | 'wait_active_lease'
  | 'reclaim_same_attempt'
  | 'replay_receipt'
  | 'retry_new_attempt'
  | 'manual_recovery'

export interface ControlPlaneRecoveryDecision {
  readonly action: ControlPlaneRecoveryAction
  readonly receiptHash: string | null
}

export interface ControlPlaneLeaseRecoveryInput {
  readonly intent: ControlPlaneMutationIntent
  readonly observation: ControlPlaneRecoveryObservation
}

export type ControlPlaneStateErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_IDENTITY'
  | 'INVALID_STATE'
  | 'INVALID_TIME'
  | 'INVALID_HASH'
  | 'INVALID_INTENT'
  | 'HASH_UNAVAILABLE'

export class ControlPlaneStateContractError extends Error {
  readonly code: ControlPlaneStateErrorCode

  constructor(code: ControlPlaneStateErrorCode, context: string) {
    super(`control plane state: ${context}`)
    this.name = 'ControlPlaneStateContractError'
    this.code = code
  }
}

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const LOWER_HASH = /^[0-9a-f]{64}$/
const TASK_ID = /^P17-\d{3}$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const STATE_CODES = new Set<string>(CONTROL_PLANE_TASK_STATE_CODES)
const ACTIONS = new Set<string>(CONTROL_PLANE_MUTATION_ACTIONS)
const REASONS = new Set<string>(CONTROL_PLANE_MUTATION_REASON_CODES)
const OUTCOMES = new Set<string>(CONTROL_PLANE_RECEIPT_OUTCOMES)
const JOURNAL_STATES = new Set<string>(CONTROL_PLANE_RECOVERY_JOURNAL_STATES)

const ACTION_REASON: Readonly<Record<ControlPlaneMutationAction, ControlPlaneMutationReasonCode>> = {
  submit_for_approval: 'workflow_transition',
  approve: 'operator_approved',
  enqueue: 'workflow_transition',
  claim_lease: 'lease_claimed',
  start_execution: 'lease_started',
  pause_for_input: 'input_required',
  resume_from_input: 'input_available',
  request_runtime_approval: 'approval_required',
  approve_runtime: 'runtime_approved',
  heartbeat: 'lease_heartbeat',
  request_cancel: 'operator_cancelled',
  accept_receipt: 'receipt_received',
  recover_lease: 'lease_expired',
}

const TASK_IDENTITY_KEYS = ['schemaVersion', 'tenantId', 'taskId', 'commandRunId', 'rootRunId', 'parentRunId', 'attempt', 'repositoryId', 'progressBindingHash'] as const
const TASK_OPERATION_KEYS = ['code', 'contractHash', 'replayClass'] as const
const TASK_SNAPSHOT_KEYS = ['schemaVersion', 'contractVersion', 'identity', 'operation', 'state', 'resourceVersion', 'lease', 'cancellationIntent', 'acceptedReceiptHash'] as const
const TASK_SNAPSHOT_INPUT_KEYS = ['identity', 'operationCode'] as const
const INTENT_INPUT_KEYS = ['tenantId', 'taskId', 'actorId', 'action', 'reasonCode', 'idempotencyKey', 'requestedAt', 'expectedResourceVersion'] as const
const INTENT_KEYS = ['schemaVersion', 'contractVersion', ...INTENT_INPUT_KEYS, 'intentHash'] as const
const LEASE_KEYS = ['envelope', 'claimedAt', 'startedAt', 'lastHeartbeatAt', 'lastHeartbeatId', 'lastHeartbeatRequestHash', 'currentExpiresAt'] as const
const EXECUTION_IDENTITY_KEYS = ['schemaVersion', 'tenantId', 'taskId', 'commandRunId', 'rootRunId', 'parentRunId', 'attempt', 'deliveryId', 'leaseId', 'machineId', 'repositoryId', 'progressBindingHash'] as const
const CLAIM_KEYS = ['intent', 'envelope', 'workerManifest', 'observedAt'] as const
const START_KEYS = ['intent', 'observedAt'] as const
const HEARTBEAT_KEYS = ['intent', 'heartbeatId', 'observedAt', 'requestedExpiresAt'] as const
const RECEIPT_INPUT_KEYS = ['identity', 'envelopeHash', 'operationCode', 'operationContractHash', 'outcome', 'completedAt', 'progressBindingHash', 'progressTailHash', 'evidenceHashes', 'resultHash'] as const
const RECEIPT_KEYS = ['schemaVersion', 'contractVersion', ...RECEIPT_INPUT_KEYS, 'receiptHash'] as const
const RECEIPT_ACCEPT_KEYS = ['intent', 'receipt', 'observedAt'] as const
const RECOVERY_OBSERVATION_KEYS = ['observedAt', 'journalState', 'receiptHash'] as const
const RECOVERY_INPUT_KEYS = ['intent', 'observation'] as const

function fail(code: ControlPlaneStateErrorCode, context: string): never {
  throw new ControlPlaneStateContractError(code, context)
}

function assertPlainTree(value: unknown, context: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) fail('INVALID_SHAPE', context)
  seen.add(value)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) fail('INVALID_SHAPE', context)
    assertPlainTree(descriptor.value, context, seen)
  }
  seen.delete(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail('INVALID_SHAPE', context)
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  assertPlainTree(value, context)
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', context)
  return value as Record<string, unknown>
}

function assertLowerUuid(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_UUID.test(value)) fail('INVALID_IDENTITY', context)
}

function assertLowerHash(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_HASH.test(value)) fail('INVALID_HASH', context)
}

function assertCanonicalTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) fail('INVALID_TIME', context)
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) fail('INVALID_TIME', context)
}

function epoch(value: string): number {
  return Date.parse(value)
}

function assertPositiveVersion(value: unknown, context: string): asserts value is number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1 || value >= Number.MAX_SAFE_INTEGER) fail('INVALID_SHAPE', context)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  }
  return value
}

function sha256(port: ControlPlaneHashPort, canonical: string, context: string): string {
  let result: unknown
  try {
    result = port.sha256(canonical)
  } catch {
    fail('HASH_UNAVAILABLE', context)
  }
  if (typeof result !== 'string' || !LOWER_HASH.test(result)) fail('HASH_UNAVAILABLE', context)
  return result
}

function canonicalIntent(value: Omit<ControlPlaneMutationIntent, 'intentHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    tenantId: value.tenantId,
    taskId: value.taskId,
    actorId: value.actorId,
    action: value.action,
    reasonCode: value.reasonCode,
    idempotencyKey: value.idempotencyKey,
    requestedAt: value.requestedAt,
    expectedResourceVersion: value.expectedResourceVersion,
  })
}

function canonicalReceipt(value: Omit<ControlPlaneExecutionReceipt, 'receiptHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    identity: value.identity,
    envelopeHash: value.envelopeHash,
    operationCode: value.operationCode,
    operationContractHash: value.operationContractHash,
    outcome: value.outcome,
    completedAt: value.completedAt,
    progressBindingHash: value.progressBindingHash,
    progressTailHash: value.progressTailHash,
    evidenceHashes: value.evidenceHashes,
    resultHash: value.resultHash,
  })
}

function canonicalFullReceipt(value: ControlPlaneExecutionReceipt): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    identity: value.identity,
    envelopeHash: value.envelopeHash,
    operationCode: value.operationCode,
    operationContractHash: value.operationContractHash,
    outcome: value.outcome,
    completedAt: value.completedAt,
    progressBindingHash: value.progressBindingHash,
    progressTailHash: value.progressTailHash,
    evidenceHashes: value.evidenceHashes,
    resultHash: value.resultHash,
    receiptHash: value.receiptHash,
  })
}

function validateTaskIdentity(value: unknown): ControlPlaneTaskIdentity {
  assertPlainTree(value, 'task identity')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'task identity')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, TASK_IDENTITY_KEYS, 'task identity')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) fail('UNSUPPORTED_VERSION', 'task identity')
  assertLowerUuid(record.tenantId, 'task identity')
  if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) fail('INVALID_IDENTITY', 'task identity')
  assertLowerUuid(record.commandRunId, 'task identity')
  assertLowerUuid(record.rootRunId, 'task identity')
  if (record.parentRunId !== null) assertLowerUuid(record.parentRunId, 'task identity')
  if (!Number.isSafeInteger(record.attempt) || typeof record.attempt !== 'number' || record.attempt < 1 || record.attempt > 50) fail('INVALID_IDENTITY', 'task identity')
  if (record.attempt === 1 && (record.parentRunId !== null || record.commandRunId !== record.rootRunId)) fail('INVALID_IDENTITY', 'task identity')
  if (record.attempt > 1 && (record.parentRunId === null || record.commandRunId === record.rootRunId || record.commandRunId === record.parentRunId)) fail('INVALID_IDENTITY', 'task identity')
  assertLowerUuid(record.repositoryId, 'task identity')
  assertLowerHash(record.progressBindingHash, 'task identity')
  return deepFreeze({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    tenantId: record.tenantId,
    taskId: record.taskId,
    commandRunId: record.commandRunId,
    rootRunId: record.rootRunId,
    parentRunId: record.parentRunId,
    attempt: record.attempt,
    repositoryId: record.repositoryId,
    progressBindingHash: record.progressBindingHash,
  })
}

function validateState(value: unknown): ControlPlaneTaskState {
  assertPlainTree(value, 'task state')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_STATE', 'task state')
  const record = value as unknown as Record<string, unknown>
  if (typeof record.code !== 'string' || !STATE_CODES.has(record.code)) fail('INVALID_STATE', 'task state')
  if (record.code === 'awaiting_approval') {
    exactKeys(record, ['code', 'approvalContext'], 'task state')
    if (record.approvalContext !== 'definition' && record.approvalContext !== 'runtime') fail('INVALID_STATE', 'task state')
    return deepFreeze({ code: 'awaiting_approval', approvalContext: record.approvalContext })
  }
  exactKeys(record, ['code'], 'task state')
  return deepFreeze({ code: record.code as Exclude<ControlPlaneTaskStateCode, 'awaiting_approval'> })
}

function descriptorFor(code: OperationCode, registryInput: unknown, port: ControlPlaneHashPort): OperationDescriptor {
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  const descriptor = registry.find((candidate) => candidate.code === code)
  if (!descriptor) fail('INVALID_SHAPE', 'task operation')
  return descriptor
}

function validateOperationBinding(value: unknown, registryInput: unknown, port: ControlPlaneHashPort): ControlPlaneTaskOperationBinding {
  assertPlainTree(value, 'task operation')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'task operation')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, TASK_OPERATION_KEYS, 'task operation')
  if (typeof record.code !== 'string') fail('INVALID_SHAPE', 'task operation')
  const descriptor = descriptorFor(record.code as OperationCode, registryInput, port)
  if (record.contractHash !== descriptor.contractHash || record.replayClass !== descriptor.replayClass) fail('INVALID_HASH', 'task operation')
  return deepFreeze({ code: descriptor.code, contractHash: descriptor.contractHash, replayClass: descriptor.replayClass })
}

function validateLease(value: unknown, registryInput: unknown, port: ControlPlaneHashPort): ControlPlaneLeaseRecord {
  assertPlainTree(value, 'lease record')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'lease record')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, LEASE_KEYS, 'lease record')
  const envelope = validateControlPlaneExecutionEnvelope(record.envelope, registryInput, port)
  assertCanonicalTime(record.claimedAt, 'lease record')
  if (record.startedAt !== null) assertCanonicalTime(record.startedAt, 'lease record')
  assertCanonicalTime(record.lastHeartbeatAt, 'lease record')
  assertCanonicalTime(record.currentExpiresAt, 'lease record')
  const issued = epoch(envelope.timing.issuedAt)
  const initialExpiry = epoch(envelope.timing.leaseExpiresAt)
  const deadline = epoch(envelope.timing.deadlineAt)
  const claimed = epoch(record.claimedAt)
  const heartbeat = epoch(record.lastHeartbeatAt)
  const currentExpiry = epoch(record.currentExpiresAt)
  if (claimed < issued || claimed >= initialExpiry || heartbeat < claimed || heartbeat >= currentExpiry || currentExpiry < initialExpiry || currentExpiry > deadline) fail('INVALID_TIME', 'lease record')
  if (record.startedAt !== null && (epoch(record.startedAt) < claimed || epoch(record.startedAt) >= currentExpiry)) fail('INVALID_TIME', 'lease record')
  if ((record.lastHeartbeatId === null) !== (record.lastHeartbeatRequestHash === null)) fail('INVALID_SHAPE', 'lease record')
  if (record.lastHeartbeatId !== null) assertLowerUuid(record.lastHeartbeatId, 'lease record')
  if (record.lastHeartbeatRequestHash !== null) assertLowerHash(record.lastHeartbeatRequestHash, 'lease record')
  return deepFreeze({
    envelope,
    claimedAt: record.claimedAt,
    startedAt: record.startedAt,
    lastHeartbeatAt: record.lastHeartbeatAt,
    lastHeartbeatId: record.lastHeartbeatId,
    lastHeartbeatRequestHash: record.lastHeartbeatRequestHash,
    currentExpiresAt: record.currentExpiresAt,
  })
}

function assertSnapshotCoherence(snapshot: ControlPlaneTaskSnapshot): void {
  const state = snapshot.state
  const lease = snapshot.lease
  const preLease = state.code === 'draft' || state.code === 'approved' || state.code === 'queued'
    || (state.code === 'awaiting_approval' && state.approvalContext === 'definition')
  if (preLease && lease !== null) fail('INVALID_STATE', 'task snapshot')
  if ((state.code === 'leased' || state.code === 'running' || state.code === 'awaiting_input' || state.code === 'cancel_requested'
    || state.code === 'recovery_required' || (state.code === 'awaiting_approval' && state.approvalContext === 'runtime')) && lease === null) {
    fail('INVALID_STATE', 'task snapshot')
  }
  if (state.code === 'leased' && lease?.startedAt !== null) fail('INVALID_STATE', 'task snapshot')
  if ((state.code === 'running' || state.code === 'awaiting_input' || (state.code === 'awaiting_approval' && state.approvalContext === 'runtime')) && lease?.startedAt === null) fail('INVALID_STATE', 'task snapshot')
  if (state.code === 'cancel_requested' && snapshot.cancellationIntent === null) fail('INVALID_STATE', 'task snapshot')
  if ((state.code === 'passed' || state.code === 'failed') && (lease === null || snapshot.acceptedReceiptHash === null)) fail('INVALID_STATE', 'task snapshot')
  if (state.code === 'cancelled' && snapshot.cancellationIntent === null) fail('INVALID_STATE', 'task snapshot')
  if (snapshot.cancellationIntent !== null) {
    const cancellationState = state.code === 'cancel_requested' || state.code === 'cancelled' || state.code === 'recovery_required'
    if (!cancellationState || snapshot.cancellationIntent.expectedResourceVersion >= snapshot.resourceVersion) fail('INVALID_STATE', 'task snapshot')
  }
  if (snapshot.acceptedReceiptHash !== null) assertLowerHash(snapshot.acceptedReceiptHash, 'task snapshot')
  if (snapshot.acceptedReceiptHash !== null && state.code !== 'passed' && state.code !== 'failed' && state.code !== 'cancelled' && state.code !== 'recovery_required') fail('INVALID_STATE', 'task snapshot')
  if ((state.code === 'passed' || state.code === 'failed') && snapshot.cancellationIntent !== null) fail('INVALID_STATE', 'task snapshot')
}

export function createControlPlaneMutationIntent(value: ControlPlaneMutationIntentInput, port: ControlPlaneHashPort): ControlPlaneMutationIntent {
  exactKeys(asRecord(value, 'mutation intent input'), INTENT_INPUT_KEYS, 'mutation intent input')
  const withoutHash = validateIntentFields({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    ...value,
  })
  return deepFreeze({ ...withoutHash, intentHash: sha256(port, canonicalIntent(withoutHash), 'mutation intent hash') })
}

function validateIntentFields(value: Omit<ControlPlaneMutationIntent, 'intentHash'>): Omit<ControlPlaneMutationIntent, 'intentHash'> {
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || value.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'mutation intent')
  assertLowerUuid(value.tenantId, 'mutation intent')
  if (!TASK_ID.test(value.taskId)) fail('INVALID_IDENTITY', 'mutation intent')
  assertLowerUuid(value.actorId, 'mutation intent')
  if (!ACTIONS.has(value.action) || !REASONS.has(value.reasonCode) || ACTION_REASON[value.action] !== value.reasonCode) fail('INVALID_INTENT', 'mutation intent')
  assertLowerUuid(value.idempotencyKey, 'mutation intent')
  assertCanonicalTime(value.requestedAt, 'mutation intent')
  assertPositiveVersion(value.expectedResourceVersion, 'mutation intent')
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: value.tenantId,
    taskId: value.taskId,
    actorId: value.actorId,
    action: value.action,
    reasonCode: value.reasonCode,
    idempotencyKey: value.idempotencyKey,
    requestedAt: value.requestedAt,
    expectedResourceVersion: value.expectedResourceVersion,
  }
}

export function validateControlPlaneMutationIntent(value: unknown, port: ControlPlaneHashPort): ControlPlaneMutationIntent {
  assertPlainTree(value, 'mutation intent')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'mutation intent')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, INTENT_KEYS, 'mutation intent')
  const withoutHash = validateIntentFields(record as unknown as Omit<ControlPlaneMutationIntent, 'intentHash'>)
  assertLowerHash(record.intentHash, 'mutation intent')
  const computed = sha256(port, canonicalIntent(withoutHash), 'mutation intent hash')
  if (record.intentHash !== computed) fail('INVALID_HASH', 'mutation intent')
  return deepFreeze({ ...withoutHash, intentHash: record.intentHash })
}

export function createControlPlaneTaskSnapshot(
  value: ControlPlaneTaskSnapshotInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskSnapshot {
  exactKeys(asRecord(value, 'task snapshot input'), TASK_SNAPSHOT_INPUT_KEYS, 'task snapshot input')
  const identity = validateTaskIdentity(value.identity)
  const descriptor = descriptorFor(value.operationCode, registryInput, port)
  return deepFreeze({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    identity,
    operation: { code: descriptor.code, contractHash: descriptor.contractHash, replayClass: descriptor.replayClass },
    state: { code: 'draft' },
    resourceVersion: 1,
    lease: null,
    cancellationIntent: null,
    acceptedReceiptHash: null,
  })
}

export function validateControlPlaneTaskSnapshot(value: unknown, registryInput: unknown, port: ControlPlaneHashPort): ControlPlaneTaskSnapshot {
  assertPlainTree(value, 'task snapshot')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'task snapshot')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, TASK_SNAPSHOT_KEYS, 'task snapshot')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || record.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'task snapshot')
  const identity = validateTaskIdentity(record.identity)
  const operation = validateOperationBinding(record.operation, registryInput, port)
  const state = validateState(record.state)
  assertPositiveVersion(record.resourceVersion, 'task snapshot')
  const lease = record.lease === null ? null : validateLease(record.lease, registryInput, port)
  const cancellationIntent = record.cancellationIntent === null ? null : validateControlPlaneMutationIntent(record.cancellationIntent, port)
  if (cancellationIntent && (cancellationIntent.tenantId !== identity.tenantId || cancellationIntent.taskId !== identity.taskId || cancellationIntent.action !== 'request_cancel')) fail('INVALID_INTENT', 'task snapshot')
  if (record.acceptedReceiptHash !== null) assertLowerHash(record.acceptedReceiptHash, 'task snapshot')
  const snapshot = deepFreeze({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    identity,
    operation,
    state,
    resourceVersion: record.resourceVersion,
    lease,
    cancellationIntent,
    acceptedReceiptHash: record.acceptedReceiptHash,
  })
  if (lease) {
    if (!matchesTaskIdentity(identity, lease.envelope) || lease.envelope.operation.descriptor.code !== operation.code || lease.envelope.operation.descriptor.contractHash !== operation.contractHash) fail('INVALID_STATE', 'task snapshot')
  }
  assertSnapshotCoherence(snapshot)
  return snapshot
}

function matchesTaskIdentity(identity: ControlPlaneTaskIdentity, envelope: ControlPlaneExecutionEnvelope): boolean {
  const candidate = envelope.identity
  return candidate.schemaVersion === identity.schemaVersion
    && candidate.tenantId === identity.tenantId
    && candidate.taskId === identity.taskId
    && candidate.commandRunId === identity.commandRunId
    && candidate.rootRunId === identity.rootRunId
    && candidate.parentRunId === identity.parentRunId
    && candidate.attempt === identity.attempt
    && candidate.repositoryId === identity.repositoryId
    && candidate.progressBindingHash === identity.progressBindingHash
}

function decision(status: ControlPlaneTaskDecisionStatus, snapshot: ControlPlaneTaskSnapshot, reason?: ControlPlaneTaskDecisionReason): ControlPlaneTaskMutationDecision {
  return reason ? { status, reason, snapshot } : { status, snapshot }
}

function preflight(
  snapshot: ControlPlaneTaskSnapshot,
  intentInput: unknown,
  action: ControlPlaneMutationAction,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): { intent: ControlPlaneMutationIntent; rejected?: ControlPlaneTaskMutationDecision } {
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  const intent = validateControlPlaneMutationIntent(intentInput, port)
  if (intent.action !== action) return { intent, rejected: decision('rejected', snapshot, 'illegal_transition') }
  if (intent.tenantId !== snapshot.identity.tenantId || intent.taskId !== snapshot.identity.taskId) return { intent, rejected: decision('rejected', snapshot, 'intent_scope_mismatch') }
  if (intent.expectedResourceVersion !== snapshot.resourceVersion) return { intent, rejected: decision('conflict', snapshot, 'stale_resource_version') }
  if (snapshot.resourceVersion >= Number.MAX_SAFE_INTEGER - 1) return { intent, rejected: decision('rejected', snapshot, 'resource_version_overflow') }
  return { intent }
}

function nextSnapshot(
  snapshot: ControlPlaneTaskSnapshot,
  patch: Partial<Pick<ControlPlaneTaskSnapshot, 'state' | 'lease' | 'cancellationIntent' | 'acceptedReceiptHash'>>,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskSnapshot {
  return validateControlPlaneTaskSnapshot({ ...snapshot, ...patch, resourceVersion: snapshot.resourceVersion + 1 }, registryInput, port)
}

export function applyControlPlaneLifecycleIntent(
  snapshot: ControlPlaneTaskSnapshot,
  intentInput: ControlPlaneMutationIntent,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  const allowed = new Set<ControlPlaneMutationAction>(['submit_for_approval', 'approve', 'enqueue', 'pause_for_input', 'resume_from_input', 'request_runtime_approval', 'approve_runtime'])
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  const validatedIntent = validateControlPlaneMutationIntent(intentInput, port)
  const action = validatedIntent.action
  if (!allowed.has(action)) return decision('rejected', snapshot, 'illegal_transition')
  const checked = preflight(snapshot, validatedIntent, action, registryInput, port)
  if (checked.rejected) return checked.rejected
  let state: ControlPlaneTaskState | undefined
  if (action === 'submit_for_approval' && snapshot.state.code === 'draft') state = { code: 'awaiting_approval', approvalContext: 'definition' }
  else if (action === 'approve' && snapshot.state.code === 'awaiting_approval' && snapshot.state.approvalContext === 'definition') state = { code: 'approved' }
  else if (action === 'enqueue' && snapshot.state.code === 'approved') state = { code: 'queued' }
  else if (action === 'pause_for_input' && snapshot.state.code === 'running') state = { code: 'awaiting_input' }
  else if (action === 'resume_from_input' && snapshot.state.code === 'awaiting_input') state = { code: 'running' }
  else if (action === 'request_runtime_approval' && snapshot.state.code === 'running') state = { code: 'awaiting_approval', approvalContext: 'runtime' }
  else if (action === 'approve_runtime' && snapshot.state.code === 'awaiting_approval' && snapshot.state.approvalContext === 'runtime') state = { code: 'running' }
  if (!state) return decision('rejected', snapshot, 'illegal_transition')
  return decision('accepted', nextSnapshot(snapshot, { state }, registryInput, port))
}

export function claimControlPlaneLease(
  snapshot: ControlPlaneTaskSnapshot,
  value: ControlPlaneLeaseClaimInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  exactKeys(asRecord(value, 'lease claim'), CLAIM_KEYS, 'lease claim')
  const checked = preflight(snapshot, value.intent, 'claim_lease', registryInput, port)
  if (checked.rejected) return checked.rejected
  if (snapshot.lease !== null) return decision('conflict', snapshot, 'active_lease_exists')
  if (snapshot.state.code !== 'queued') return decision('rejected', snapshot, 'illegal_transition')
  const envelope = validateControlPlaneExecutionEnvelope(value.envelope, registryInput, port)
  const workerManifest = validateWorkerCapabilityManifest(value.workerManifest, registryInput, port)
  assertCanonicalTime(value.observedAt, 'lease claim')
  if (!matchesTaskIdentity(snapshot.identity, envelope)) return decision('rejected', snapshot, 'envelope_identity_mismatch')
  if (envelope.operation.descriptor.code !== snapshot.operation.code || envelope.operation.descriptor.contractHash !== snapshot.operation.contractHash) return decision('rejected', snapshot, 'operation_mismatch')
  const capability = workerManifest.operations.find((entry) => entry.code === snapshot.operation.code)
  if (!capability || capability.contractHash !== snapshot.operation.contractHash) return decision('rejected', snapshot, 'worker_capability_mismatch')
  const observed = epoch(value.observedAt)
  if (observed < epoch(envelope.timing.issuedAt) || observed >= epoch(envelope.timing.leaseExpiresAt)) return decision('rejected', snapshot, 'outside_lease_window')
  const lease: ControlPlaneLeaseRecord = {
    envelope,
    claimedAt: value.observedAt,
    startedAt: null,
    lastHeartbeatAt: value.observedAt,
    lastHeartbeatId: null,
    lastHeartbeatRequestHash: null,
    currentExpiresAt: envelope.timing.leaseExpiresAt,
  }
  return decision('accepted', nextSnapshot(snapshot, { state: { code: 'leased' }, lease }, registryInput, port))
}

export function startControlPlaneExecution(
  snapshot: ControlPlaneTaskSnapshot,
  value: ControlPlaneExecutionStartInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  exactKeys(asRecord(value, 'execution start'), START_KEYS, 'execution start')
  const checked = preflight(snapshot, value.intent, 'start_execution', registryInput, port)
  if (checked.rejected) return checked.rejected
  if (snapshot.state.code !== 'leased' || snapshot.lease === null) return decision('rejected', snapshot, 'illegal_transition')
  assertCanonicalTime(value.observedAt, 'execution start')
  const observed = epoch(value.observedAt)
  if (observed < epoch(snapshot.lease.claimedAt)) return decision('rejected', snapshot, 'outside_lease_window')
  if (observed >= epoch(snapshot.lease.currentExpiresAt)) return decision('rejected', snapshot, 'lease_expired')
  return decision('accepted', nextSnapshot(snapshot, {
    state: { code: 'running' },
    lease: { ...snapshot.lease, startedAt: value.observedAt },
  }, registryInput, port))
}

function heartbeatRequestHash(value: ControlPlaneHeartbeatInput, port: ControlPlaneHashPort): string {
  return sha256(port, JSON.stringify({
    intentHash: value.intent.intentHash,
    heartbeatId: value.heartbeatId,
    observedAt: value.observedAt,
    requestedExpiresAt: value.requestedExpiresAt,
  }), 'heartbeat request hash')
}

export function heartbeatControlPlaneLease(
  snapshot: ControlPlaneTaskSnapshot,
  value: ControlPlaneHeartbeatInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  exactKeys(asRecord(value, 'lease heartbeat'), HEARTBEAT_KEYS, 'lease heartbeat')
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  const intent = validateControlPlaneMutationIntent(value.intent, port)
  assertLowerUuid(value.heartbeatId, 'lease heartbeat')
  assertCanonicalTime(value.observedAt, 'lease heartbeat')
  assertCanonicalTime(value.requestedExpiresAt, 'lease heartbeat')
  const requestHash = heartbeatRequestHash({ ...value, intent }, port)
  if (snapshot.lease?.lastHeartbeatId === value.heartbeatId) {
    return snapshot.lease.lastHeartbeatRequestHash === requestHash
      ? decision('idempotent', snapshot)
      : decision('conflict', snapshot, 'heartbeat_id_conflict')
  }
  const checked = preflight(snapshot, intent, 'heartbeat', registryInput, port)
  if (checked.rejected) return checked.rejected
  if (snapshot.lease === null) return decision('rejected', snapshot, 'lease_missing')
  if (snapshot.state.code === 'cancel_requested') return decision('rejected', snapshot, 'cancellation_pending')
  const active = snapshot.state.code === 'leased' || snapshot.state.code === 'running' || snapshot.state.code === 'awaiting_input'
    || (snapshot.state.code === 'awaiting_approval' && snapshot.state.approvalContext === 'runtime')
  if (!active) return decision('rejected', snapshot, 'illegal_transition')
  const observed = epoch(value.observedAt)
  const previousHeartbeat = epoch(snapshot.lease.lastHeartbeatAt)
  const currentExpiry = epoch(snapshot.lease.currentExpiresAt)
  const requestedExpiry = epoch(value.requestedExpiresAt)
  if (observed <= previousHeartbeat) return decision('rejected', snapshot, 'heartbeat_not_monotonic')
  if (observed >= currentExpiry) return decision('rejected', snapshot, 'lease_expired')
  if (requestedExpiry <= currentExpiry || requestedExpiry - currentExpiry > CONTROL_PLANE_HEARTBEAT_INTERVAL_MS) return decision('rejected', snapshot, 'heartbeat_extension_exceeded')
  if (requestedExpiry > epoch(snapshot.lease.envelope.timing.deadlineAt)) return decision('rejected', snapshot, 'deadline_exceeded')
  return decision('accepted', nextSnapshot(snapshot, {
    lease: {
      ...snapshot.lease,
      lastHeartbeatAt: value.observedAt,
      lastHeartbeatId: value.heartbeatId,
      lastHeartbeatRequestHash: requestHash,
      currentExpiresAt: value.requestedExpiresAt,
    },
  }, registryInput, port))
}

export function requestControlPlaneCancellation(
  snapshot: ControlPlaneTaskSnapshot,
  intentInput: ControlPlaneMutationIntent,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  const intent = validateControlPlaneMutationIntent(intentInput, port)
  if (snapshot.cancellationIntent?.idempotencyKey === intent.idempotencyKey) {
    return snapshot.cancellationIntent.intentHash === intent.intentHash
      ? decision('idempotent', snapshot)
      : decision('conflict', snapshot, 'idempotency_conflict')
  }
  const checked = preflight(snapshot, intent, 'request_cancel', registryInput, port)
  if (checked.rejected) return checked.rejected
  if (snapshot.state.code === 'passed' || snapshot.state.code === 'failed' || snapshot.state.code === 'cancelled') return decision('conflict', snapshot, 'terminal_state')
  if (snapshot.state.code === 'recovery_required') return decision('conflict', snapshot, 'recovery_required')
  if (snapshot.state.code === 'cancel_requested') return decision('conflict', snapshot, 'cancellation_pending')
  const preLease = snapshot.state.code === 'draft' || snapshot.state.code === 'approved' || snapshot.state.code === 'queued'
    || (snapshot.state.code === 'awaiting_approval' && snapshot.state.approvalContext === 'definition')
  const state: ControlPlaneTaskState = preLease ? { code: 'cancelled' } : { code: 'cancel_requested' }
  return decision('accepted', nextSnapshot(snapshot, { state, cancellationIntent: intent }, registryInput, port))
}

function validateReceiptContent(
  value: Omit<ControlPlaneExecutionReceipt, 'receiptHash'>,
  envelopeInput: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): Omit<ControlPlaneExecutionReceipt, 'receiptHash'> {
  const envelope = validateControlPlaneExecutionEnvelope(envelopeInput, registryInput, port)
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || value.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'execution receipt')
  const identity = asRecord(value.identity, 'execution receipt identity')
  exactKeys(identity, EXECUTION_IDENTITY_KEYS, 'execution receipt identity')
  if (EXECUTION_IDENTITY_KEYS.some((key) => identity[key] !== envelope.identity[key])) fail('INVALID_IDENTITY', 'execution receipt')
  assertLowerHash(value.envelopeHash, 'execution receipt')
  if (value.envelopeHash !== envelope.envelopeHash) fail('INVALID_HASH', 'execution receipt')
  if (value.operationCode !== envelope.operation.descriptor.code || value.operationContractHash !== envelope.operation.descriptor.contractHash) fail('INVALID_HASH', 'execution receipt')
  if (!OUTCOMES.has(value.outcome)) fail('INVALID_SHAPE', 'execution receipt')
  assertCanonicalTime(value.completedAt, 'execution receipt')
  assertLowerHash(value.progressBindingHash, 'execution receipt')
  if (value.progressBindingHash !== envelope.identity.progressBindingHash) fail('INVALID_HASH', 'execution receipt')
  assertLowerHash(value.progressTailHash, 'execution receipt')
  if (!Array.isArray(value.evidenceHashes) || value.evidenceHashes.length > CONTROL_PLANE_MAX_EVIDENCE_REFS) fail('INVALID_SHAPE', 'execution receipt')
  const evidenceHashes = value.evidenceHashes.map((hash) => {
    assertLowerHash(hash, 'execution receipt')
    return hash
  })
  if (evidenceHashes.some((hash, index) => index > 0 && hash <= evidenceHashes[index - 1])) fail('INVALID_SHAPE', 'execution receipt')
  if (value.resultHash !== null) assertLowerHash(value.resultHash, 'execution receipt')
  if (value.outcome === 'passed' && value.resultHash === null) fail('INVALID_SHAPE', 'execution receipt')
  if ((value.outcome === 'cancelled' || value.outcome === 'unknown_outcome') && value.resultHash !== null) fail('INVALID_SHAPE', 'execution receipt')
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    identity: envelope.identity,
    envelopeHash: envelope.envelopeHash,
    operationCode: envelope.operation.descriptor.code,
    operationContractHash: envelope.operation.descriptor.contractHash,
    outcome: value.outcome,
    completedAt: value.completedAt,
    progressBindingHash: value.progressBindingHash,
    progressTailHash: value.progressTailHash,
    evidenceHashes,
    resultHash: value.resultHash,
  }
}

export function createControlPlaneExecutionReceipt(
  value: ControlPlaneExecutionReceiptInput,
  envelopeInput: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneExecutionReceipt {
  exactKeys(asRecord(value, 'execution receipt input'), RECEIPT_INPUT_KEYS, 'execution receipt input')
  const withoutHash = validateReceiptContent({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    ...value,
  }, envelopeInput, registryInput, port)
  return deepFreeze({ ...withoutHash, receiptHash: sha256(port, canonicalReceipt(withoutHash), 'execution receipt hash') })
}

export function validateControlPlaneExecutionReceipt(
  value: unknown,
  envelopeInput: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneExecutionReceipt {
  assertPlainTree(value, 'execution receipt')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'execution receipt')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, RECEIPT_KEYS, 'execution receipt')
  const withoutHash = validateReceiptContent(record as unknown as Omit<ControlPlaneExecutionReceipt, 'receiptHash'>, envelopeInput, registryInput, port)
  assertLowerHash(record.receiptHash, 'execution receipt')
  const computed = sha256(port, canonicalReceipt(withoutHash), 'execution receipt hash')
  if (record.receiptHash !== computed) fail('INVALID_HASH', 'execution receipt')
  return deepFreeze({ ...withoutHash, receiptHash: record.receiptHash })
}

export function serializeControlPlaneExecutionReceipt(
  value: unknown,
  envelopeInput: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): string {
  return canonicalFullReceipt(validateControlPlaneExecutionReceipt(value, envelopeInput, registryInput, port))
}

export function applyControlPlaneExecutionReceipt(
  snapshot: ControlPlaneTaskSnapshot,
  value: ControlPlaneReceiptAcceptanceInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  exactKeys(asRecord(value, 'receipt acceptance'), RECEIPT_ACCEPT_KEYS, 'receipt acceptance')
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  if (snapshot.lease === null) return decision('rejected', snapshot, 'lease_missing')
  const receiptIntent = validateControlPlaneMutationIntent(value.intent, port)
  if (receiptIntent.action !== 'accept_receipt') return decision('rejected', snapshot, 'illegal_transition')
  if (receiptIntent.tenantId !== snapshot.identity.tenantId || receiptIntent.taskId !== snapshot.identity.taskId) return decision('rejected', snapshot, 'intent_scope_mismatch')
  const rawReceipt = asRecord(value.receipt, 'execution receipt')
  if (snapshot.acceptedReceiptHash !== null) {
    if (rawReceipt.receiptHash !== snapshot.acceptedReceiptHash) return decision('conflict', snapshot, 'receipt_conflict')
    validateControlPlaneExecutionReceipt(value.receipt, snapshot.lease.envelope, registryInput, port)
    return decision('idempotent', snapshot)
  }
  const receipt = validateControlPlaneExecutionReceipt(value.receipt, snapshot.lease.envelope, registryInput, port)
  const checked = preflight(snapshot, receiptIntent, 'accept_receipt', registryInput, port)
  if (checked.rejected) return checked.rejected
  assertCanonicalTime(value.observedAt, 'receipt acceptance')
  const authorityStartedAt = snapshot.lease.startedAt ?? snapshot.lease.claimedAt
  if (epoch(receipt.completedAt) < epoch(authorityStartedAt) || epoch(value.observedAt) < epoch(receipt.completedAt)) return decision('rejected', snapshot, 'receipt_mismatch')
  if (epoch(value.observedAt) >= epoch(snapshot.lease.currentExpiresAt) || epoch(receipt.completedAt) >= epoch(snapshot.lease.currentExpiresAt)) return decision('quarantined', snapshot, 'late_receipt')
  if (snapshot.state.code === 'cancel_requested' && receipt.outcome === 'passed') return decision('quarantined', snapshot, 'cancellation_won')
  const active = snapshot.state.code === 'running' || snapshot.state.code === 'awaiting_input'
    || snapshot.state.code === 'cancel_requested'
    || (snapshot.state.code === 'awaiting_approval' && snapshot.state.approvalContext === 'runtime')
  if (!active) return decision('rejected', snapshot, 'illegal_transition')
  let state: ControlPlaneTaskState
  if (receipt.outcome === 'passed') state = { code: 'passed' }
  else if (receipt.outcome === 'failed') state = { code: 'failed' }
  else if (receipt.outcome === 'unknown_outcome') state = { code: 'recovery_required' }
  else if (snapshot.state.code === 'cancel_requested') state = { code: 'cancelled' }
  else return decision('rejected', snapshot, 'unexpected_receipt_outcome')
  return decision('accepted', nextSnapshot(snapshot, { state, acceptedReceiptHash: receipt.receiptHash }, registryInput, port))
}

function validateRecoveryObservation(value: unknown): ControlPlaneRecoveryObservation {
  assertPlainTree(value, 'recovery observation')
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', 'recovery observation')
  const record = value as unknown as Record<string, unknown>
  exactKeys(record, RECOVERY_OBSERVATION_KEYS, 'recovery observation')
  assertCanonicalTime(record.observedAt, 'recovery observation')
  if (typeof record.journalState !== 'string' || !JOURNAL_STATES.has(record.journalState)) fail('INVALID_SHAPE', 'recovery observation')
  if (record.receiptHash !== null) assertLowerHash(record.receiptHash, 'recovery observation')
  if ((record.journalState === 'receipt_available') !== (record.receiptHash !== null)) fail('INVALID_SHAPE', 'recovery observation')
  return deepFreeze({ observedAt: record.observedAt, journalState: record.journalState as ControlPlaneRecoveryJournalState, receiptHash: record.receiptHash })
}

export function decideControlPlaneLeaseRecovery(
  snapshot: ControlPlaneTaskSnapshot,
  observationInput: ControlPlaneRecoveryObservation,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneRecoveryDecision {
  validateControlPlaneTaskSnapshot(snapshot, registryInput, port)
  const observation = validateRecoveryObservation(observationInput)
  if (snapshot.lease === null) fail('INVALID_STATE', 'lease recovery')
  if (epoch(observation.observedAt) < epoch(snapshot.lease.currentExpiresAt)) return deepFreeze({ action: 'wait_active_lease', receiptHash: null })
  if (observation.journalState === 'receipt_available') return deepFreeze({ action: 'replay_receipt', receiptHash: observation.receiptHash })
  if (snapshot.state.code === 'leased' && snapshot.lease.startedAt === null && observation.journalState === 'not_started') return deepFreeze({ action: 'reclaim_same_attempt', receiptHash: null })
  if (snapshot.state.code !== 'cancel_requested' && observation.journalState === 'execution_started' && snapshot.operation.replayClass === 'read_only') return deepFreeze({ action: 'retry_new_attempt', receiptHash: null })
  return deepFreeze({ action: 'manual_recovery', receiptHash: null })
}

export function applyControlPlaneLeaseRecovery(
  snapshot: ControlPlaneTaskSnapshot,
  value: ControlPlaneLeaseRecoveryInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneTaskMutationDecision {
  exactKeys(asRecord(value, 'lease recovery input'), RECOVERY_INPUT_KEYS, 'lease recovery input')
  const checked = preflight(snapshot, value.intent, 'recover_lease', registryInput, port)
  if (checked.rejected) return checked.rejected
  const recovery = decideControlPlaneLeaseRecovery(snapshot, value.observation, registryInput, port)
  if (recovery.action === 'wait_active_lease') return decision('rejected', snapshot, 'lease_active')
  if (recovery.action === 'replay_receipt') return decision('rejected', snapshot, 'receipt_replay_required')
  if (recovery.action === 'retry_new_attempt') return decision('rejected', snapshot, 'a2d_retry_required')
  if (recovery.action === 'reclaim_same_attempt') {
    return decision('accepted', nextSnapshot(snapshot, { state: { code: 'queued' }, lease: null }, registryInput, port))
  }
  return decision('accepted', nextSnapshot(snapshot, { state: { code: 'recovery_required' } }, registryInput, port))
}
