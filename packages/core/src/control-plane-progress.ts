import {
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_SCHEMA_VERSION,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
  type OperationDescriptor,
  validateControlPlaneExecutionEnvelope,
  validateControlPlaneOperationRegistry,
} from './control-plane'
import {
  decideControlPlaneLeaseRecovery,
  type ControlPlaneExecutionReceipt,
  type ControlPlaneRecoveryObservation,
  type ControlPlaneTaskSnapshot,
  validateControlPlaneExecutionReceipt,
  validateControlPlaneTaskSnapshot,
} from './control-plane-state'
import type {
  EvidenceRef,
  ProgressAttemptView,
  ProgressRunBinding,
  ProgressState,
  ProgressTaskView,
} from './cross-machine-progress'

export interface ControlPlaneProgressLedgerPort {
  buildTaskView(ledger: unknown, expectedTaskId: string): unknown
}

export interface ControlPlaneProgressRepositoryBinding {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly tenantId: string
  readonly repositoryId: string
  readonly progressRepoId: string
  readonly repositoryBindingHash: string
}

export interface ControlPlaneProgressRepositoryBindingInput {
  readonly tenantId: string
  readonly repositoryId: string
  readonly progressRepoId: string
}

export interface ControlPlaneProgressBindingProof {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly commandRunId: string
  readonly attempt: number
  readonly envelopeHash: string
  readonly progressBindingHash: string
  readonly repositoryBindingHash: string
  readonly runner: string
  readonly providerExecutionId: string | null
  readonly progressState: ProgressState
  readonly progressTailHash: string
  readonly ledgerHash: string
  readonly proofHash: string
}

export interface ControlPlaneProgressBindingProofInput {
  readonly snapshot: ControlPlaneTaskSnapshot
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly repositoryBinding: ControlPlaneProgressRepositoryBinding
  readonly progressLedger: unknown
}

export interface ControlPlaneReceiptProgressProof {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly commandRunId: string
  readonly attempt: number
  readonly envelopeHash: string
  readonly progressBindingHash: string
  readonly repositoryBindingHash: string
  readonly receiptHash: string
  readonly outcome: ControlPlaneExecutionReceipt['outcome']
  readonly progressState: ProgressState
  readonly progressTailHash: string
  readonly evidenceHashes: readonly string[]
  readonly ledgerHash: string
  readonly proofHash: string
}

export interface ControlPlaneReceiptProgressProofInput {
  readonly snapshot: ControlPlaneTaskSnapshot
  readonly receipt: ControlPlaneExecutionReceipt
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly repositoryBinding: ControlPlaneProgressRepositoryBinding
  readonly progressLedger: unknown
}

export interface ControlPlaneRetryProgressProof {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly rootRunId: string
  readonly parentCommandRunId: string
  readonly successorCommandRunId: string
  readonly parentAttempt: number
  readonly successorAttempt: number
  readonly parentEnvelopeHash: string
  readonly successorEnvelopeHash: string
  readonly parentProgressBindingHash: string
  readonly successorProgressBindingHash: string
  readonly repositoryBindingHash: string
  readonly parentLedgerHash: string
  readonly successorLedgerHash: string
  readonly successorProgressTailHash: string
  readonly recoveryAction: 'retry_new_attempt'
  readonly proofHash: string
}

export interface ControlPlaneRetryProgressProofInput {
  readonly parentSnapshot: ControlPlaneTaskSnapshot
  readonly recoveryObservation: ControlPlaneRecoveryObservation
  readonly currentLedger: unknown
  readonly proposedLedger: unknown
  readonly successorEnvelope: ControlPlaneExecutionEnvelope
  readonly repositoryBinding: ControlPlaneProgressRepositoryBinding
}

export type ControlPlaneProgressProofErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_IDENTITY'
  | 'INVALID_MAPPING'
  | 'PROGRESS_LEDGER_INVALID'
  | 'PROGRESS_BINDING_MISMATCH'
  | 'PROGRESS_STATE_MISMATCH'
  | 'PROGRESS_RECEIPT_MISMATCH'
  | 'RETRY_NOT_AUTHORIZED'
  | 'RETRY_LINEAGE_MISMATCH'
  | 'HASH_UNAVAILABLE'
  | 'HASH_MISMATCH'

export class ControlPlaneProgressProofError extends Error {
  readonly code: ControlPlaneProgressProofErrorCode

  constructor(code: ControlPlaneProgressProofErrorCode, context: string) {
    super(`control plane progress: ${context}`)
    this.name = 'ControlPlaneProgressProofError'
    this.code = code
  }
}

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOWER_HASH = /^[0-9a-f]{64}$/
const TASK_ID = /^P17-\d{3}$/
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_LABEL = /^[a-z][a-z0-9_]{0,63}$/
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/
const HASH_PORT_PROBE = 'control-plane-progress-hash-port-probe-v1'
const MAX_PROGRESS_ATTEMPTS = 50
const MAX_PROGRESS_EVENTS_PER_ATTEMPT = 200
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024

const PROGRESS_STATES = new Set<ProgressState>([
  'queued', 'running', 'awaiting_input', 'awaiting_approval', 'passed', 'failed', 'cancelled',
  'tracking_failed',
])
const ACTIVE_PROGRESS_STATES = new Set<ProgressState>(['queued', 'running', 'awaiting_input', 'awaiting_approval'])
const RETENTION_CLASSES = new Set(['short_lived', 'standard'])
const EVIDENCE_STATUSES = new Set(['verified', 'quarantined', 'unavailable'])
const EVIDENCE_MEDIA_TYPES = new Set(['application/json', 'text/markdown', 'image/png', 'image/jpeg', 'application/zip'])
const REASONS_BY_STATE: Readonly<Record<ProgressState, ReadonlySet<string>>> = {
  queued: new Set(['scheduled', 'retry_started']),
  running: new Set(['started', 'resumed', 'phase_progress']),
  awaiting_input: new Set(['input_required']),
  awaiting_approval: new Set(['approval_required']),
  passed: new Set(['completed']),
  failed: new Set(['verification_failed', 'provider_failed']),
  cancelled: new Set(['operator_cancelled']),
  tracking_failed: new Set(['persistence_failed', 'integrity_conflict']),
}
const RECEIPT_PROGRESS_STATE: Readonly<Record<ControlPlaneExecutionReceipt['outcome'], ProgressState>> = {
  passed: 'passed',
  failed: 'failed',
  cancelled: 'cancelled',
  unknown_outcome: 'tracking_failed',
}

const REPOSITORY_BINDING_INPUT_KEYS = ['tenantId', 'repositoryId', 'progressRepoId'] as const
const REPOSITORY_BINDING_KEYS = ['schemaVersion', 'contractVersion', ...REPOSITORY_BINDING_INPUT_KEYS, 'repositoryBindingHash'] as const
const BINDING_PROOF_INPUT_KEYS = ['snapshot', 'envelope', 'repositoryBinding', 'progressLedger'] as const
const BINDING_PROOF_KEYS = ['schemaVersion', 'contractVersion', 'tenantId', 'taskId', 'commandRunId', 'attempt', 'envelopeHash', 'progressBindingHash', 'repositoryBindingHash', 'runner', 'providerExecutionId', 'progressState', 'progressTailHash', 'ledgerHash', 'proofHash'] as const
const RECEIPT_PROOF_INPUT_KEYS = ['snapshot', 'receipt', 'envelope', 'repositoryBinding', 'progressLedger'] as const
const RECEIPT_PROOF_KEYS = ['schemaVersion', 'contractVersion', 'tenantId', 'taskId', 'commandRunId', 'attempt', 'envelopeHash', 'progressBindingHash', 'repositoryBindingHash', 'receiptHash', 'outcome', 'progressState', 'progressTailHash', 'evidenceHashes', 'ledgerHash', 'proofHash'] as const
const RETRY_PROOF_INPUT_KEYS = ['parentSnapshot', 'recoveryObservation', 'currentLedger', 'proposedLedger', 'successorEnvelope', 'repositoryBinding'] as const
const RETRY_PROOF_KEYS = ['schemaVersion', 'contractVersion', 'tenantId', 'taskId', 'rootRunId', 'parentCommandRunId', 'successorCommandRunId', 'parentAttempt', 'successorAttempt', 'parentEnvelopeHash', 'successorEnvelopeHash', 'parentProgressBindingHash', 'successorProgressBindingHash', 'repositoryBindingHash', 'parentLedgerHash', 'successorLedgerHash', 'successorProgressTailHash', 'recoveryAction', 'proofHash'] as const
const VIEW_KEYS = ['taskId', 'attempts', 'currentAttempt', 'currentState', 'ledgerHash'] as const
const ATTEMPT_KEYS = ['binding', 'events', 'state', 'eventCount', 'latestEventHash', 'evidence', 'clockStatus'] as const
const BINDING_KEYS = ['schemaVersion', 'taskId', 'commandRunId', 'machineId', 'repoId', 'runner', 'providerExecutionId', 'rootRunId', 'parentRunId', 'attempt', 'retentionClass', 'createdAt', 'bindingHash'] as const
const EVENT_KEYS = ['schemaVersion', 'eventId', 'taskId', 'commandRunId', 'machineId', 'bindingHash', 'sequence', 'previousEventHash', 'state', 'phaseId', 'reasonCode', 'evidence', 'occurredAt', 'receivedAt', 'eventHash'] as const
const EVIDENCE_KEYS = ['schemaVersion', 'sha256', 'manifestSchemaVersion', 'mediaType', 'bytes', 'labelCode', 'verificationStatus', 'taskId', 'commandRunId', 'attempt', 'bindingHash'] as const

function fail(code: ControlPlaneProgressProofErrorCode, context: string): never {
  throw new ControlPlaneProgressProofError(code, context)
}

function assertPlainTree(value: unknown, context: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) fail('INVALID_SHAPE', context)
  seen.add(value)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof typeof descriptors]
    if (!('value' in descriptor)) fail('INVALID_SHAPE', context)
    assertPlainTree(descriptor.value, context, seen)
  }
  seen.delete(value)
}

function asRecord(value: unknown, context: string, deep = true): Record<string, unknown> {
  if (deep) assertPlainTree(value, context)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (!('value' in descriptor)) fail('INVALID_SHAPE', context)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) fail('INVALID_SHAPE', context)
  const actual = (ownKeys as string[]).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail('INVALID_SHAPE', context)
}

function assertLowerUuid(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_UUID.test(value)) fail('INVALID_IDENTITY', context)
}

function assertLowerHash(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_HASH.test(value)) fail('INVALID_SHAPE', context)
}

function assertPositiveInteger(value: unknown, context: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail('INVALID_SHAPE', context)
}

function assertP17Uuid(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('PROGRESS_LEDGER_INVALID', context)
}

function assertCanonicalTimestamp(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail('PROGRESS_LEDGER_INVALID', context)
}

function assertSafeString(value: unknown, pattern: RegExp, context: string): asserts value is string {
  if (typeof value !== 'string' || !pattern.test(value)) fail('PROGRESS_LEDGER_INVALID', context)
}

function isProgressState(value: unknown): value is ProgressState {
  return typeof value === 'string' && PROGRESS_STATES.has(value as ProgressState)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  }
  return value
}

function hashCanonical(port: ControlPlaneHashPort, value: string, context: string): string {
  if (!port || typeof port.sha256 !== 'function') fail('HASH_UNAVAILABLE', context)
  let result: unknown
  let probe: unknown
  try {
    result = port.sha256(value)
    probe = port.sha256(HASH_PORT_PROBE)
  } catch {
    fail('HASH_UNAVAILABLE', context)
  }
  if (typeof result !== 'string' || !LOWER_HASH.test(result) || typeof probe !== 'string' || !LOWER_HASH.test(probe) || (value !== HASH_PORT_PROBE && result === probe)) fail('HASH_UNAVAILABLE', context)
  return result
}

function canonicalRepositoryBinding(value: Omit<ControlPlaneProgressRepositoryBinding, 'repositoryBindingHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    tenantId: value.tenantId,
    repositoryId: value.repositoryId,
    progressRepoId: value.progressRepoId,
  })
}

function canonicalBindingProof(value: Omit<ControlPlaneProgressBindingProof, 'proofHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    tenantId: value.tenantId,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    attempt: value.attempt,
    envelopeHash: value.envelopeHash,
    progressBindingHash: value.progressBindingHash,
    repositoryBindingHash: value.repositoryBindingHash,
    runner: value.runner,
    providerExecutionId: value.providerExecutionId,
    progressState: value.progressState,
    progressTailHash: value.progressTailHash,
    ledgerHash: value.ledgerHash,
  })
}

function canonicalReceiptProof(value: Omit<ControlPlaneReceiptProgressProof, 'proofHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    tenantId: value.tenantId,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    attempt: value.attempt,
    envelopeHash: value.envelopeHash,
    progressBindingHash: value.progressBindingHash,
    repositoryBindingHash: value.repositoryBindingHash,
    receiptHash: value.receiptHash,
    outcome: value.outcome,
    progressState: value.progressState,
    progressTailHash: value.progressTailHash,
    evidenceHashes: value.evidenceHashes,
    ledgerHash: value.ledgerHash,
  })
}

function canonicalRetryProof(value: Omit<ControlPlaneRetryProgressProof, 'proofHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    tenantId: value.tenantId,
    taskId: value.taskId,
    rootRunId: value.rootRunId,
    parentCommandRunId: value.parentCommandRunId,
    successorCommandRunId: value.successorCommandRunId,
    parentAttempt: value.parentAttempt,
    successorAttempt: value.successorAttempt,
    parentEnvelopeHash: value.parentEnvelopeHash,
    successorEnvelopeHash: value.successorEnvelopeHash,
    parentProgressBindingHash: value.parentProgressBindingHash,
    successorProgressBindingHash: value.successorProgressBindingHash,
    repositoryBindingHash: value.repositoryBindingHash,
    parentLedgerHash: value.parentLedgerHash,
    successorLedgerHash: value.successorLedgerHash,
    successorProgressTailHash: value.successorProgressTailHash,
    recoveryAction: value.recoveryAction,
  })
}

export function createControlPlaneProgressRepositoryBinding(
  value: ControlPlaneProgressRepositoryBindingInput,
  port: ControlPlaneHashPort,
): ControlPlaneProgressRepositoryBinding {
  exactKeys(asRecord(value, 'repository binding input'), REPOSITORY_BINDING_INPUT_KEYS, 'repository binding input')
  assertLowerUuid(value.tenantId, 'repository binding input')
  assertLowerUuid(value.repositoryId, 'repository binding input')
  if (typeof value.progressRepoId !== 'string' || !SAFE_SLUG.test(value.progressRepoId) || value.progressRepoId === '.' || value.progressRepoId === '..') fail('INVALID_MAPPING', 'repository binding input')
  const withoutHash = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: value.tenantId,
    repositoryId: value.repositoryId,
    progressRepoId: value.progressRepoId,
  }
  return deepFreeze({ ...withoutHash, repositoryBindingHash: hashCanonical(port, canonicalRepositoryBinding(withoutHash), 'repository binding hash') })
}

export function validateControlPlaneProgressRepositoryBinding(value: unknown, port: ControlPlaneHashPort): ControlPlaneProgressRepositoryBinding {
  const record = asRecord(value, 'repository binding')
  exactKeys(record, REPOSITORY_BINDING_KEYS, 'repository binding')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || record.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'repository binding')
  assertLowerUuid(record.tenantId, 'repository binding')
  assertLowerUuid(record.repositoryId, 'repository binding')
  if (typeof record.progressRepoId !== 'string' || !SAFE_SLUG.test(record.progressRepoId) || record.progressRepoId === '.' || record.progressRepoId === '..') fail('INVALID_MAPPING', 'repository binding')
  assertLowerHash(record.repositoryBindingHash, 'repository binding')
  const withoutHash = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: record.tenantId,
    repositoryId: record.repositoryId,
    progressRepoId: record.progressRepoId,
  }
  if (record.repositoryBindingHash !== hashCanonical(port, canonicalRepositoryBinding(withoutHash), 'repository binding hash')) fail('HASH_MISMATCH', 'repository binding')
  return deepFreeze({ ...withoutHash, repositoryBindingHash: record.repositoryBindingHash })
}

function validateEvidenceShape(value: unknown): EvidenceRef | null {
  if (value === null) return null
  const record = asRecord(value, 'progress evidence')
  exactKeys(record, EVIDENCE_KEYS, 'progress evidence')
  if (record.schemaVersion !== 1) fail('PROGRESS_LEDGER_INVALID', 'progress evidence')
  assertLowerHash(record.sha256, 'progress evidence')
  assertSafeString(record.manifestSchemaVersion, SEMVER, 'progress evidence')
  if (typeof record.mediaType !== 'string' || !EVIDENCE_MEDIA_TYPES.has(record.mediaType)) fail('PROGRESS_LEDGER_INVALID', 'progress evidence')
  if (typeof record.bytes !== 'number' || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || record.bytes > MAX_EVIDENCE_BYTES) fail('PROGRESS_LEDGER_INVALID', 'progress evidence')
  assertSafeString(record.labelCode, SAFE_LABEL, 'progress evidence')
  if (typeof record.verificationStatus !== 'string' || !EVIDENCE_STATUSES.has(record.verificationStatus)) fail('PROGRESS_LEDGER_INVALID', 'progress evidence')
  assertSafeString(record.taskId, TASK_ID, 'progress evidence')
  assertP17Uuid(record.commandRunId, 'progress evidence')
  if (typeof record.attempt !== 'number' || !Number.isSafeInteger(record.attempt) || record.attempt < 1 || record.attempt > MAX_PROGRESS_ATTEMPTS) fail('PROGRESS_LEDGER_INVALID', 'progress evidence')
  assertLowerHash(record.bindingHash, 'progress evidence')
  return value as EvidenceRef
}

function validateAttemptShape(value: unknown): ProgressAttemptView {
  const record = asRecord(value, 'progress attempt')
  exactKeys(record, ATTEMPT_KEYS, 'progress attempt')
  const binding = asRecord(record.binding, 'progress binding')
  exactKeys(binding, BINDING_KEYS, 'progress binding')
  if (binding.schemaVersion !== 1) fail('PROGRESS_LEDGER_INVALID', 'progress binding')
  assertSafeString(binding.taskId, TASK_ID, 'progress binding')
  assertP17Uuid(binding.commandRunId, 'progress binding')
  assertP17Uuid(binding.machineId, 'progress binding')
  assertSafeString(binding.repoId, SAFE_SLUG, 'progress binding')
  assertSafeString(binding.runner, SAFE_SLUG, 'progress binding')
  if (binding.providerExecutionId !== null) assertSafeString(binding.providerExecutionId, SAFE_PROVIDER_ID, 'progress binding')
  assertP17Uuid(binding.rootRunId, 'progress binding')
  if (binding.parentRunId !== null) assertP17Uuid(binding.parentRunId, 'progress binding')
  if (typeof binding.attempt !== 'number' || !Number.isSafeInteger(binding.attempt) || binding.attempt < 1 || binding.attempt > MAX_PROGRESS_ATTEMPTS || typeof binding.retentionClass !== 'string' || !RETENTION_CLASSES.has(binding.retentionClass)) fail('PROGRESS_LEDGER_INVALID', 'progress binding')
  assertCanonicalTimestamp(binding.createdAt, 'progress binding')
  assertLowerHash(binding.bindingHash, 'progress binding')
  if (binding.attempt === 1 ? binding.rootRunId !== binding.commandRunId || binding.parentRunId !== null : binding.rootRunId === binding.commandRunId || binding.parentRunId === null || binding.parentRunId === binding.commandRunId) fail('PROGRESS_LEDGER_INVALID', 'progress binding lineage')
  if (!Array.isArray(record.events) || record.events.length > MAX_PROGRESS_EVENTS_PER_ATTEMPT) fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  const events = record.events.map((event) => {
    const eventRecord = asRecord(event, 'progress event')
    exactKeys(eventRecord, EVENT_KEYS, 'progress event')
    if (eventRecord.schemaVersion !== 1) fail('PROGRESS_LEDGER_INVALID', 'progress event')
    assertP17Uuid(eventRecord.eventId, 'progress event')
    assertSafeString(eventRecord.taskId, TASK_ID, 'progress event')
    assertP17Uuid(eventRecord.commandRunId, 'progress event')
    assertP17Uuid(eventRecord.machineId, 'progress event')
    assertLowerHash(eventRecord.bindingHash, 'progress event')
    assertLowerHash(eventRecord.eventHash, 'progress event')
    if (typeof eventRecord.sequence !== 'number' || !Number.isSafeInteger(eventRecord.sequence) || eventRecord.sequence < 1 || eventRecord.sequence > MAX_PROGRESS_EVENTS_PER_ATTEMPT || !isProgressState(eventRecord.state) || typeof eventRecord.reasonCode !== 'string' || !REASONS_BY_STATE[eventRecord.state].has(eventRecord.reasonCode)) fail('PROGRESS_LEDGER_INVALID', 'progress event')
    if (eventRecord.previousEventHash !== null) assertLowerHash(eventRecord.previousEventHash, 'progress event')
    if ((eventRecord.sequence === 1) !== (eventRecord.previousEventHash === null)) fail('PROGRESS_LEDGER_INVALID', 'progress event')
    if (eventRecord.phaseId !== null && typeof eventRecord.phaseId !== 'string') fail('PROGRESS_LEDGER_INVALID', 'progress event')
    assertCanonicalTimestamp(eventRecord.occurredAt, 'progress event')
    assertCanonicalTimestamp(eventRecord.receivedAt, 'progress event')
    const evidence = validateEvidenceShape(eventRecord.evidence)
    if (eventRecord.taskId !== binding.taskId || eventRecord.commandRunId !== binding.commandRunId || eventRecord.machineId !== binding.machineId || eventRecord.bindingHash !== binding.bindingHash) fail('PROGRESS_LEDGER_INVALID', 'progress event identity')
    if (evidence && (evidence.taskId !== binding.taskId || evidence.commandRunId !== binding.commandRunId || evidence.attempt !== binding.attempt || evidence.bindingHash !== binding.bindingHash)) fail('PROGRESS_LEDGER_INVALID', 'progress evidence identity')
    return event
  })
  if (typeof record.eventCount !== 'number' || record.eventCount !== events.length) fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  if (record.latestEventHash !== null) assertLowerHash(record.latestEventHash, 'progress attempt')
  const lastEvent = events.at(-1) as Record<string, unknown> | undefined
  if (record.state !== null && !isProgressState(record.state)) fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  if ((lastEvent?.eventHash ?? null) !== record.latestEventHash || (lastEvent?.state ?? null) !== record.state) fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as unknown as Record<string, unknown>
    const previous = index === 0 ? null : events[index - 1] as unknown as Record<string, unknown>
    if (event.sequence !== index + 1 || event.previousEventHash !== (previous?.eventHash ?? null)) fail('PROGRESS_LEDGER_INVALID', 'progress event chain')
  }
  const evidence = validateEvidenceShape(record.evidence)
  if (evidence !== (events.at(-1) as { evidence?: unknown } | undefined)?.evidence) {
    if (JSON.stringify(evidence) !== JSON.stringify((events.at(-1) as { evidence?: unknown } | undefined)?.evidence ?? null)) fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  }
  if (record.clockStatus !== 'on_time' && record.clockStatus !== 'producer_ahead' && record.clockStatus !== 'producer_behind') fail('PROGRESS_LEDGER_INVALID', 'progress attempt')
  return value as ProgressAttemptView
}

function validateTaskView(value: unknown, expectedTaskId: string): ProgressTaskView {
  const record = asRecord(value, 'progress task view')
  exactKeys(record, VIEW_KEYS, 'progress task view')
  if (record.taskId !== expectedTaskId || !TASK_ID.test(expectedTaskId) || !Array.isArray(record.attempts) || record.attempts.length > MAX_PROGRESS_ATTEMPTS) fail('PROGRESS_LEDGER_INVALID', 'progress task view')
  const attempts = record.attempts.map(validateAttemptShape)
  if (record.currentAttempt !== null && (typeof record.currentAttempt !== 'number' || !Number.isSafeInteger(record.currentAttempt) || record.currentAttempt < 1 || record.currentAttempt > MAX_PROGRESS_ATTEMPTS)) fail('PROGRESS_LEDGER_INVALID', 'progress task view')
  if (record.currentState !== null && !isProgressState(record.currentState)) fail('PROGRESS_LEDGER_INVALID', 'progress task view')
  assertLowerHash(record.ledgerHash, 'progress task view')
  const latest = attempts.at(-1)
  if ((latest?.binding.attempt ?? null) !== record.currentAttempt || (latest?.state ?? null) !== record.currentState) fail('PROGRESS_LEDGER_INVALID', 'progress task view')
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].binding.taskId !== expectedTaskId || attempts[index].binding.attempt !== index + 1) fail('PROGRESS_LEDGER_INVALID', 'progress attempt order')
  }
  return value as ProgressTaskView
}

function buildView(port: ControlPlaneProgressLedgerPort, ledger: unknown, taskId: string): ProgressTaskView {
  if (!port || typeof port.buildTaskView !== 'function') fail('PROGRESS_LEDGER_INVALID', 'ledger port')
  let value: unknown
  try {
    value = port.buildTaskView(ledger, taskId)
  } catch {
    fail('PROGRESS_LEDGER_INVALID', 'ledger port')
  }
  return validateTaskView(value, taskId)
}

function descriptorFor(envelope: ControlPlaneExecutionEnvelope, registryInput: unknown, port: ControlPlaneHashPort): OperationDescriptor {
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  const descriptor = registry.find((entry) => entry.code === envelope.operation.descriptor.code)
  if (!descriptor || descriptor.contractHash !== envelope.operation.descriptor.contractHash) fail('PROGRESS_BINDING_MISMATCH', 'operation binding')
  return descriptor
}

function matchSnapshotEnvelope(snapshot: ControlPlaneTaskSnapshot, envelope: ControlPlaneExecutionEnvelope): void {
  const identity = envelope.identity
  if (snapshot.identity.tenantId !== identity.tenantId || snapshot.identity.taskId !== identity.taskId || snapshot.identity.commandRunId !== identity.commandRunId || snapshot.identity.rootRunId !== identity.rootRunId || snapshot.identity.parentRunId !== identity.parentRunId || snapshot.identity.attempt !== identity.attempt || snapshot.identity.repositoryId !== identity.repositoryId || snapshot.identity.progressBindingHash !== identity.progressBindingHash) fail('PROGRESS_BINDING_MISMATCH', 'snapshot envelope identity')
  if (snapshot.lease && snapshot.lease.envelope.envelopeHash !== envelope.envelopeHash) fail('PROGRESS_BINDING_MISMATCH', 'snapshot envelope lease')
  if (snapshot.operation.code !== envelope.operation.descriptor.code || snapshot.operation.contractHash !== envelope.operation.descriptor.contractHash) fail('PROGRESS_BINDING_MISMATCH', 'snapshot operation')
}

function matchBinding(
  binding: ProgressRunBinding,
  envelope: ControlPlaneExecutionEnvelope,
  repositoryBinding: ControlPlaneProgressRepositoryBinding,
): void {
  const identity = envelope.identity
  if (binding.taskId !== identity.taskId || binding.commandRunId !== identity.commandRunId || binding.rootRunId !== identity.rootRunId || binding.parentRunId !== identity.parentRunId || binding.attempt !== identity.attempt || binding.machineId !== identity.machineId || binding.bindingHash !== identity.progressBindingHash) fail('PROGRESS_BINDING_MISMATCH', 'progress identity')
  if (repositoryBinding.tenantId !== identity.tenantId || repositoryBinding.repositoryId !== identity.repositoryId || binding.repoId !== repositoryBinding.progressRepoId) fail('PROGRESS_BINDING_MISMATCH', 'progress repository')
  if (binding.retentionClass !== envelope.evidencePolicy.retentionClass) fail('PROGRESS_BINDING_MISMATCH', 'progress retention')
  if (Date.parse(binding.createdAt) > Date.parse(envelope.timing.issuedAt)) fail('PROGRESS_BINDING_MISMATCH', 'progress creation time')
}

function projectionMatches(snapshot: ControlPlaneTaskSnapshot, progressState: ProgressState | null): boolean {
  const state = snapshot.state
  if (state.code === 'queued' || state.code === 'leased') return progressState === 'queued'
  if (state.code === 'running') return progressState === 'running'
  if (state.code === 'awaiting_input') return progressState === 'awaiting_input'
  if (state.code === 'awaiting_approval' && state.approvalContext === 'runtime') return progressState === 'awaiting_approval'
  if (state.code === 'cancel_requested') return progressState === 'running' || progressState === 'awaiting_input' || progressState === 'awaiting_approval'
  if (state.code === 'passed' || state.code === 'failed' || state.code === 'cancelled') return progressState === state.code
  return false
}

interface ResolvedProgressContext {
  readonly snapshot: ControlPlaneTaskSnapshot
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly repositoryBinding: ControlPlaneProgressRepositoryBinding
  readonly view: ProgressTaskView
  readonly attempt: ProgressAttemptView
}

function resolveContext(
  input: ControlPlaneProgressBindingProofInput,
  progressPort: ControlPlaneProgressLedgerPort,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
  requireProjection: boolean,
): ResolvedProgressContext {
  const snapshot = validateControlPlaneTaskSnapshot(input.snapshot, registryInput, hashPort)
  const envelope = validateControlPlaneExecutionEnvelope(input.envelope, registryInput, hashPort)
  descriptorFor(envelope, registryInput, hashPort)
  const repositoryBinding = validateControlPlaneProgressRepositoryBinding(input.repositoryBinding, hashPort)
  matchSnapshotEnvelope(snapshot, envelope)
  const view = buildView(progressPort, input.progressLedger, envelope.identity.taskId)
  if (view.currentAttempt !== envelope.identity.attempt) fail('PROGRESS_BINDING_MISMATCH', 'current progress attempt')
  const attempt = view.attempts.find((candidate) => candidate.binding.commandRunId === envelope.identity.commandRunId && candidate.binding.bindingHash === envelope.identity.progressBindingHash)
  if (!attempt || attempt !== view.attempts.at(-1)) fail('PROGRESS_BINDING_MISMATCH', 'current progress binding')
  matchBinding(attempt.binding, envelope, repositoryBinding)
  if (!attempt.latestEventHash || attempt.state === null) fail('PROGRESS_BINDING_MISMATCH', 'progress event tail')
  if (requireProjection && !projectionMatches(snapshot, attempt.state)) fail('PROGRESS_STATE_MISMATCH', 'progress projection')
  return { snapshot, envelope, repositoryBinding, view, attempt }
}

export function createControlPlaneProgressBindingProof(
  input: ControlPlaneProgressBindingProofInput,
  progressPort: ControlPlaneProgressLedgerPort,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
): ControlPlaneProgressBindingProof {
  const record = asRecord(input, 'binding proof input', false)
  exactKeys(record, BINDING_PROOF_INPUT_KEYS, 'binding proof input')
  const context = resolveContext(input, progressPort, registryInput, hashPort, true)
  if (!ACTIVE_PROGRESS_STATES.has(context.attempt.state!)) fail('PROGRESS_STATE_MISMATCH', 'terminal progress requires receipt proof')
  const withoutHash: Omit<ControlPlaneProgressBindingProof, 'proofHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: context.envelope.identity.tenantId,
    taskId: context.envelope.identity.taskId,
    commandRunId: context.envelope.identity.commandRunId,
    attempt: context.envelope.identity.attempt,
    envelopeHash: context.envelope.envelopeHash,
    progressBindingHash: context.attempt.binding.bindingHash,
    repositoryBindingHash: context.repositoryBinding.repositoryBindingHash,
    runner: context.attempt.binding.runner,
    providerExecutionId: context.attempt.binding.providerExecutionId,
    progressState: context.attempt.state!,
    progressTailHash: context.attempt.latestEventHash!,
    ledgerHash: context.view.ledgerHash,
  }
  return deepFreeze({ ...withoutHash, proofHash: hashCanonical(hashPort, canonicalBindingProof(withoutHash), 'binding proof hash') })
}

export function validateControlPlaneProgressBindingProof(value: unknown, hashPort: ControlPlaneHashPort): ControlPlaneProgressBindingProof {
  const record = asRecord(value, 'binding proof')
  exactKeys(record, BINDING_PROOF_KEYS, 'binding proof')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || record.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'binding proof')
  assertLowerUuid(record.tenantId, 'binding proof')
  if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) fail('INVALID_IDENTITY', 'binding proof')
  assertLowerUuid(record.commandRunId, 'binding proof')
  assertPositiveInteger(record.attempt, 'binding proof')
  for (const key of ['envelopeHash', 'progressBindingHash', 'repositoryBindingHash', 'progressTailHash', 'ledgerHash', 'proofHash'] as const) assertLowerHash(record[key], 'binding proof')
  if (typeof record.runner !== 'string' || !SAFE_SLUG.test(record.runner) || (record.providerExecutionId !== null && (typeof record.providerExecutionId !== 'string' || !SAFE_PROVIDER_ID.test(record.providerExecutionId))) || !isProgressState(record.progressState) || !ACTIVE_PROGRESS_STATES.has(record.progressState)) fail('INVALID_SHAPE', 'binding proof')
  const withoutHash = { ...record } as unknown as ControlPlaneProgressBindingProof
  const { proofHash, ...content } = withoutHash
  if (proofHash !== hashCanonical(hashPort, canonicalBindingProof(content), 'binding proof hash')) fail('HASH_MISMATCH', 'binding proof')
  return deepFreeze({ ...content, proofHash })
}

export function createControlPlaneReceiptProgressProof(
  input: ControlPlaneReceiptProgressProofInput,
  progressPort: ControlPlaneProgressLedgerPort,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
): ControlPlaneReceiptProgressProof {
  const record = asRecord(input, 'receipt proof input', false)
  exactKeys(record, RECEIPT_PROOF_INPUT_KEYS, 'receipt proof input')
  const context = resolveContext({ snapshot: input.snapshot, envelope: input.envelope, repositoryBinding: input.repositoryBinding, progressLedger: input.progressLedger }, progressPort, registryInput, hashPort, false)
  const receipt = validateControlPlaneExecutionReceipt(input.receipt, context.envelope, registryInput, hashPort)
  if (context.snapshot.acceptedReceiptHash !== receipt.receiptHash) fail('PROGRESS_RECEIPT_MISMATCH', 'accepted receipt')
  const expectedState: Record<ControlPlaneExecutionReceipt['outcome'], { a2c: string; progress: ProgressState }> = {
    passed: { a2c: 'passed', progress: 'passed' },
    failed: { a2c: 'failed', progress: 'failed' },
    cancelled: { a2c: 'cancelled', progress: 'cancelled' },
    unknown_outcome: { a2c: 'recovery_required', progress: 'tracking_failed' },
  }
  const expected = expectedState[receipt.outcome]
  if (context.snapshot.state.code !== expected.a2c || context.attempt.state !== expected.progress || context.attempt.latestEventHash !== receipt.progressTailHash) fail('PROGRESS_RECEIPT_MISMATCH', 'terminal progress')
  const evidenceHashes = context.attempt.evidence ? [context.attempt.evidence.sha256] : []
  if (JSON.stringify(evidenceHashes) !== JSON.stringify(receipt.evidenceHashes)) fail('PROGRESS_RECEIPT_MISMATCH', 'terminal evidence')
  if (receipt.outcome === 'passed' && context.attempt.evidence?.verificationStatus !== 'verified') fail('PROGRESS_RECEIPT_MISMATCH', 'passed evidence')
  const withoutHash: Omit<ControlPlaneReceiptProgressProof, 'proofHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: context.envelope.identity.tenantId,
    taskId: context.envelope.identity.taskId,
    commandRunId: context.envelope.identity.commandRunId,
    attempt: context.envelope.identity.attempt,
    envelopeHash: context.envelope.envelopeHash,
    progressBindingHash: context.attempt.binding.bindingHash,
    repositoryBindingHash: context.repositoryBinding.repositoryBindingHash,
    receiptHash: receipt.receiptHash,
    outcome: receipt.outcome,
    progressState: context.attempt.state,
    progressTailHash: context.attempt.latestEventHash,
    evidenceHashes,
    ledgerHash: context.view.ledgerHash,
  }
  return deepFreeze({ ...withoutHash, proofHash: hashCanonical(hashPort, canonicalReceiptProof(withoutHash), 'receipt proof hash') })
}

export function validateControlPlaneReceiptProgressProof(value: unknown, hashPort: ControlPlaneHashPort): ControlPlaneReceiptProgressProof {
  const record = asRecord(value, 'receipt proof')
  exactKeys(record, RECEIPT_PROOF_KEYS, 'receipt proof')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || record.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) fail('UNSUPPORTED_VERSION', 'receipt proof')
  assertLowerUuid(record.tenantId, 'receipt proof')
  if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) fail('INVALID_IDENTITY', 'receipt proof')
  assertLowerUuid(record.commandRunId, 'receipt proof')
  assertPositiveInteger(record.attempt, 'receipt proof')
  for (const key of ['envelopeHash', 'progressBindingHash', 'repositoryBindingHash', 'receiptHash', 'progressTailHash', 'ledgerHash', 'proofHash'] as const) assertLowerHash(record[key], 'receipt proof')
  if (typeof record.outcome !== 'string' || !Object.hasOwn(RECEIPT_PROGRESS_STATE, record.outcome) || !isProgressState(record.progressState) || !Array.isArray(record.evidenceHashes) || record.evidenceHashes.length > 1) fail('INVALID_SHAPE', 'receipt proof')
  record.evidenceHashes.forEach((hash) => assertLowerHash(hash, 'receipt proof'))
  if (record.progressState !== RECEIPT_PROGRESS_STATE[record.outcome as ControlPlaneExecutionReceipt['outcome']] || (record.outcome === 'passed' && record.evidenceHashes.length !== 1)) fail('PROGRESS_RECEIPT_MISMATCH', 'receipt proof')
  const proof = record as unknown as ControlPlaneReceiptProgressProof
  const { proofHash, ...content } = proof
  if (proofHash !== hashCanonical(hashPort, canonicalReceiptProof(content), 'receipt proof hash')) fail('HASH_MISMATCH', 'receipt proof')
  return deepFreeze({ ...content, evidenceHashes: [...content.evidenceHashes], proofHash })
}

function attemptFingerprint(attempt: ProgressAttemptView): string {
  return JSON.stringify({
    bindingHash: attempt.binding.bindingHash,
    eventHashes: attempt.events.map((event) => event.eventHash),
    latestEventHash: attempt.latestEventHash,
  })
}

export function createControlPlaneRetryProgressProof(
  input: ControlPlaneRetryProgressProofInput,
  progressPort: ControlPlaneProgressLedgerPort,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
): ControlPlaneRetryProgressProof {
  const record = asRecord(input, 'retry proof input', false)
  exactKeys(record, RETRY_PROOF_INPUT_KEYS, 'retry proof input')
  const parentSnapshot = validateControlPlaneTaskSnapshot(input.parentSnapshot, registryInput, hashPort)
  if (!parentSnapshot.lease) fail('RETRY_NOT_AUTHORIZED', 'retry parent lease')
  let recovery
  try {
    recovery = decideControlPlaneLeaseRecovery(parentSnapshot, input.recoveryObservation, registryInput, hashPort)
  } catch {
    fail('RETRY_NOT_AUTHORIZED', 'retry recovery')
  }
  if (recovery.action !== 'retry_new_attempt') fail('RETRY_NOT_AUTHORIZED', 'retry recovery')
  const parentEnvelope = parentSnapshot.lease.envelope
  const repositoryBinding = validateControlPlaneProgressRepositoryBinding(input.repositoryBinding, hashPort)
  const currentView = buildView(progressPort, input.currentLedger, parentEnvelope.identity.taskId)
  if (currentView.currentAttempt !== parentEnvelope.identity.attempt) fail('RETRY_LINEAGE_MISMATCH', 'retry parent attempt')
  const parentAttempt = currentView.attempts.at(-1)
  if (!parentAttempt || (parentAttempt.state !== 'failed' && parentAttempt.state !== 'cancelled' && parentAttempt.state !== 'tracking_failed')) fail('RETRY_NOT_AUTHORIZED', 'retry parent state')
  matchBinding(parentAttempt.binding, parentEnvelope, repositoryBinding)
  const successorEnvelope = validateControlPlaneExecutionEnvelope(input.successorEnvelope, registryInput, hashPort)
  descriptorFor(successorEnvelope, registryInput, hashPort)
  const parentIdentity = parentEnvelope.identity
  const successorIdentity = successorEnvelope.identity
  if (successorIdentity.tenantId !== parentIdentity.tenantId || successorIdentity.taskId !== parentIdentity.taskId || successorIdentity.rootRunId !== parentIdentity.rootRunId || successorIdentity.parentRunId !== parentIdentity.commandRunId || successorIdentity.attempt !== parentIdentity.attempt + 1 || successorIdentity.repositoryId !== parentIdentity.repositoryId) fail('RETRY_LINEAGE_MISMATCH', 'retry successor identity')
  if (successorIdentity.commandRunId === parentIdentity.commandRunId || successorIdentity.deliveryId === parentIdentity.deliveryId || successorIdentity.leaseId === parentIdentity.leaseId || successorIdentity.progressBindingHash === parentIdentity.progressBindingHash || successorEnvelope.envelopeHash === parentEnvelope.envelopeHash) fail('RETRY_LINEAGE_MISMATCH', 'retry successor identifiers')
  if (successorEnvelope.operation.descriptor.code !== parentEnvelope.operation.descriptor.code || successorEnvelope.operation.descriptor.contractHash !== parentEnvelope.operation.descriptor.contractHash || successorEnvelope.evidencePolicy.retentionClass !== parentEnvelope.evidencePolicy.retentionClass) fail('RETRY_LINEAGE_MISMATCH', 'retry successor policy')
  const proposedView = buildView(progressPort, input.proposedLedger, successorIdentity.taskId)
  if (proposedView.attempts.length !== currentView.attempts.length + 1 || proposedView.currentAttempt !== successorIdentity.attempt) fail('RETRY_LINEAGE_MISMATCH', 'retry ledger size')
  for (let index = 0; index < currentView.attempts.length; index += 1) {
    if (attemptFingerprint(currentView.attempts[index]) !== attemptFingerprint(proposedView.attempts[index])) fail('RETRY_LINEAGE_MISMATCH', 'retry ledger prefix')
  }
  const successorAttempt = proposedView.attempts.at(-1)
  if (!successorAttempt) fail('RETRY_LINEAGE_MISMATCH', 'retry successor attempt')
  matchBinding(successorAttempt.binding, successorEnvelope, repositoryBinding)
  if (successorAttempt.state !== 'queued' || successorAttempt.events.length !== 1 || successorAttempt.events[0].state !== 'queued' || successorAttempt.events[0].reasonCode !== 'retry_started' || !successorAttempt.latestEventHash) fail('RETRY_LINEAGE_MISMATCH', 'retry successor event')
  const withoutHash: Omit<ControlPlaneRetryProgressProof, 'proofHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    tenantId: parentIdentity.tenantId,
    taskId: parentIdentity.taskId,
    rootRunId: parentIdentity.rootRunId,
    parentCommandRunId: parentIdentity.commandRunId,
    successorCommandRunId: successorIdentity.commandRunId,
    parentAttempt: parentIdentity.attempt,
    successorAttempt: successorIdentity.attempt,
    parentEnvelopeHash: parentEnvelope.envelopeHash,
    successorEnvelopeHash: successorEnvelope.envelopeHash,
    parentProgressBindingHash: parentAttempt.binding.bindingHash,
    successorProgressBindingHash: successorAttempt.binding.bindingHash,
    repositoryBindingHash: repositoryBinding.repositoryBindingHash,
    parentLedgerHash: currentView.ledgerHash,
    successorLedgerHash: proposedView.ledgerHash,
    successorProgressTailHash: successorAttempt.latestEventHash,
    recoveryAction: 'retry_new_attempt',
  }
  return deepFreeze({ ...withoutHash, proofHash: hashCanonical(hashPort, canonicalRetryProof(withoutHash), 'retry proof hash') })
}

export function validateControlPlaneRetryProgressProof(value: unknown, hashPort: ControlPlaneHashPort): ControlPlaneRetryProgressProof {
  const record = asRecord(value, 'retry proof')
  exactKeys(record, RETRY_PROOF_KEYS, 'retry proof')
  if (record.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || record.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION || record.recoveryAction !== 'retry_new_attempt') fail('UNSUPPORTED_VERSION', 'retry proof')
  assertLowerUuid(record.tenantId, 'retry proof')
  if (typeof record.taskId !== 'string' || !TASK_ID.test(record.taskId)) fail('INVALID_IDENTITY', 'retry proof')
  assertLowerUuid(record.rootRunId, 'retry proof')
  assertLowerUuid(record.parentCommandRunId, 'retry proof')
  assertLowerUuid(record.successorCommandRunId, 'retry proof')
  assertPositiveInteger(record.parentAttempt, 'retry proof')
  assertPositiveInteger(record.successorAttempt, 'retry proof')
  if (record.successorAttempt !== record.parentAttempt + 1 || record.successorCommandRunId === record.parentCommandRunId || record.successorCommandRunId === record.rootRunId || (record.parentAttempt === 1 ? record.parentCommandRunId !== record.rootRunId : record.parentCommandRunId === record.rootRunId)) fail('RETRY_LINEAGE_MISMATCH', 'retry proof')
  for (const key of ['parentEnvelopeHash', 'successorEnvelopeHash', 'parentProgressBindingHash', 'successorProgressBindingHash', 'repositoryBindingHash', 'parentLedgerHash', 'successorLedgerHash', 'successorProgressTailHash', 'proofHash'] as const) assertLowerHash(record[key], 'retry proof')
  if (record.parentEnvelopeHash === record.successorEnvelopeHash || record.parentProgressBindingHash === record.successorProgressBindingHash || record.parentLedgerHash === record.successorLedgerHash) fail('RETRY_LINEAGE_MISMATCH', 'retry proof')
  const proof = record as unknown as ControlPlaneRetryProgressProof
  const { proofHash, ...content } = proof
  if (proofHash !== hashCanonical(hashPort, canonicalRetryProof(content), 'retry proof hash')) fail('HASH_MISMATCH', 'retry proof')
  return deepFreeze({ ...content, proofHash })
}
