import { createHash } from 'node:crypto'

export const CROSS_MACHINE_PROGRESS_SCHEMA_VERSION = 1 as const
export const CROSS_MACHINE_PROGRESS_SENTINEL = '@@CROSS_MACHINE_PROGRESS@@' as const
export const MAX_PROGRESS_ATTEMPTS = 50
export const MAX_PROGRESS_EVENTS_PER_ATTEMPT = 200
export const MAX_PROGRESS_EVENT_BYTES = 4 * 1024

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
const TASK_ID = /^P17-\d{3}$/
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_LABEL = /^[a-z][a-z0-9_]{0,63}$/
const PHASE_ID = /^(B(0(\.5)?|1|2|3|4|5|6(\.5)?|7|8(\.[56])?|9(\.[56])?|10(\.5)?|11|12(\.[568])?)|D(0(\.5)?|1(\.5)?|cross-2))$/

export const PROGRESS_STATES = [
  'queued',
  'running',
  'awaiting_input',
  'awaiting_approval',
  'passed',
  'failed',
  'cancelled',
  'tracking_failed',
] as const

export type ProgressState = (typeof PROGRESS_STATES)[number]
export type RetentionClass = 'short_lived' | 'standard'
export type EvidenceVerificationStatus = 'verified' | 'quarantined' | 'unavailable'
export type ProgressReasonCode =
  | 'scheduled'
  | 'retry_started'
  | 'started'
  | 'resumed'
  | 'phase_progress'
  | 'input_required'
  | 'approval_required'
  | 'completed'
  | 'verification_failed'
  | 'provider_failed'
  | 'operator_cancelled'
  | 'persistence_failed'
  | 'integrity_conflict'

export interface ProgressRunBinding {
  schemaVersion: typeof CROSS_MACHINE_PROGRESS_SCHEMA_VERSION
  taskId: string
  commandRunId: string
  machineId: string
  repoId: string
  runner: string
  providerExecutionId: string | null
  rootRunId: string
  parentRunId: string | null
  attempt: number
  retentionClass: RetentionClass
  createdAt: string
  bindingHash: string
}

export interface EvidenceRef {
  schemaVersion: typeof CROSS_MACHINE_PROGRESS_SCHEMA_VERSION
  sha256: string
  manifestSchemaVersion: string
  mediaType: 'application/json' | 'text/markdown' | 'image/png' | 'image/jpeg' | 'application/zip'
  bytes: number
  labelCode: string
  verificationStatus: EvidenceVerificationStatus
  taskId: string
  commandRunId: string
  attempt: number
  bindingHash: string
}

export interface ProgressEvent {
  schemaVersion: typeof CROSS_MACHINE_PROGRESS_SCHEMA_VERSION
  eventId: string
  taskId: string
  commandRunId: string
  machineId: string
  bindingHash: string
  sequence: number
  previousEventHash: string | null
  state: ProgressState
  phaseId: string | null
  reasonCode: ProgressReasonCode
  evidence: EvidenceRef | null
  occurredAt: string
  receivedAt: string
  eventHash: string
}

export interface ProgressLedger {
  bindings: ProgressRunBinding[]
  events: ProgressEvent[]
}

export interface ProgressAttemptView {
  binding: ProgressRunBinding
  events: ProgressEvent[]
  state: ProgressState | null
  eventCount: number
  latestEventHash: string | null
  evidence: EvidenceRef | null
  clockStatus: 'on_time' | 'producer_ahead' | 'producer_behind'
}

export interface ProgressTaskView {
  taskId: string
  attempts: ProgressAttemptView[]
  currentAttempt: number | null
  currentState: ProgressState | null
  ledgerHash: string
}

type BindingInput = Omit<ProgressRunBinding, 'schemaVersion' | 'bindingHash'>
type EventInput = Omit<ProgressEvent, 'schemaVersion' | 'eventHash'>

const BINDING_KEYS = [
  'schemaVersion', 'taskId', 'commandRunId', 'machineId', 'repoId', 'runner',
  'providerExecutionId', 'rootRunId', 'parentRunId', 'attempt', 'retentionClass', 'createdAt',
  'bindingHash',
] as const

const EVIDENCE_KEYS = [
  'schemaVersion', 'sha256', 'manifestSchemaVersion', 'mediaType', 'bytes', 'labelCode',
  'verificationStatus', 'taskId', 'commandRunId', 'attempt', 'bindingHash',
] as const

const EVENT_KEYS = [
  'schemaVersion', 'eventId', 'taskId', 'commandRunId', 'machineId', 'bindingHash', 'sequence',
  'previousEventHash', 'state', 'phaseId', 'reasonCode', 'evidence', 'occurredAt', 'receivedAt',
  'eventHash',
] as const

const TERMINAL_STATES = new Set<ProgressState>(['passed', 'failed', 'cancelled', 'tracking_failed'])
const RETENTION_CLASSES = new Set<RetentionClass>(['short_lived', 'standard'])
const EVIDENCE_STATUSES = new Set<EvidenceVerificationStatus>(['verified', 'quarantined', 'unavailable'])
const MEDIA_TYPES = new Set<EvidenceRef['mediaType']>(['application/json', 'text/markdown', 'image/png', 'image/jpeg', 'application/zip'])
const STATES = new Set<ProgressState>(PROGRESS_STATES)
const REASONS_BY_STATE: Record<ProgressState, ReadonlySet<ProgressReasonCode>> = {
  queued: new Set(['scheduled', 'retry_started']),
  running: new Set(['started', 'resumed', 'phase_progress']),
  awaiting_input: new Set(['input_required']),
  awaiting_approval: new Set(['approval_required']),
  passed: new Set(['completed']),
  failed: new Set(['verification_failed', 'provider_failed']),
  cancelled: new Set(['operator_cancelled']),
  tracking_failed: new Set(['persistence_failed', 'integrity_conflict']),
}

const ALLOWED_TRANSITIONS: Record<ProgressState, ReadonlySet<ProgressState>> = {
  queued: new Set(['running', 'cancelled', 'tracking_failed']),
  running: new Set(['running', 'awaiting_input', 'awaiting_approval', 'passed', 'failed', 'cancelled', 'tracking_failed']),
  awaiting_input: new Set(['running', 'failed', 'cancelled', 'tracking_failed']),
  awaiting_approval: new Set(['running', 'failed', 'cancelled', 'tracking_failed']),
  passed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  tracking_failed: new Set(),
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} fields are not exact`)
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`${label} must be a UUID`)
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`${label} must be lowercase SHA-256`)
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC timestamp`)
  }
}

function assertSafeString(value: unknown, pattern: RegExp, label: string): asserts value is string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is malformed`)
}

function canonicalBinding(value: Omit<ProgressRunBinding, 'bindingHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    machineId: value.machineId,
    repoId: value.repoId,
    runner: value.runner,
    providerExecutionId: value.providerExecutionId,
    rootRunId: value.rootRunId,
    parentRunId: value.parentRunId,
    attempt: value.attempt,
    retentionClass: value.retentionClass,
    createdAt: value.createdAt,
  })
}

function canonicalEvidence(value: EvidenceRef): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    sha256: value.sha256,
    manifestSchemaVersion: value.manifestSchemaVersion,
    mediaType: value.mediaType,
    bytes: value.bytes,
    labelCode: value.labelCode,
    verificationStatus: value.verificationStatus,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    attempt: value.attempt,
    bindingHash: value.bindingHash,
  }
}

function canonicalEvent(value: Omit<ProgressEvent, 'eventHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    eventId: value.eventId,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    machineId: value.machineId,
    bindingHash: value.bindingHash,
    sequence: value.sequence,
    previousEventHash: value.previousEventHash,
    state: value.state,
    phaseId: value.phaseId,
    reasonCode: value.reasonCode,
    evidence: value.evidence ? canonicalEvidence(value.evidence) : null,
    occurredAt: value.occurredAt,
    receivedAt: value.receivedAt,
  })
}

export function createProgressRunBinding(input: BindingInput | ProgressRunBinding): ProgressRunBinding {
  const withoutHash: Omit<ProgressRunBinding, 'bindingHash'> = {
    ...input,
    schemaVersion: CROSS_MACHINE_PROGRESS_SCHEMA_VERSION,
  }
  const binding = { ...withoutHash, bindingHash: sha256(canonicalBinding(withoutHash)) }
  return validateProgressRunBinding(binding)
}

export function validateProgressRunBinding(value: unknown): ProgressRunBinding {
  if (!isRecord(value)) throw new Error('progress binding must be an object')
  exactKeys(value, BINDING_KEYS, 'progress binding')
  if (value.schemaVersion !== CROSS_MACHINE_PROGRESS_SCHEMA_VERSION) throw new Error('progress binding schemaVersion is unsupported')
  assertSafeString(value.taskId, TASK_ID, 'progress binding taskId')
  assertUuid(value.commandRunId, 'progress binding commandRunId')
  assertUuid(value.machineId, 'progress binding machineId')
  assertSafeString(value.repoId, SAFE_SLUG, 'progress binding repoId')
  assertSafeString(value.runner, SAFE_SLUG, 'progress binding runner')
  if (value.providerExecutionId !== null) assertSafeString(value.providerExecutionId, SAFE_PROVIDER_ID, 'progress binding providerExecutionId')
  assertUuid(value.rootRunId, 'progress binding rootRunId')
  if (value.parentRunId !== null) assertUuid(value.parentRunId, 'progress binding parentRunId')
  if (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1 || Number(value.attempt) > MAX_PROGRESS_ATTEMPTS) throw new Error('progress binding attempt is out of range')
  if (!RETENTION_CLASSES.has(value.retentionClass as RetentionClass)) throw new Error('progress binding retentionClass is unsupported')
  assertTimestamp(value.createdAt, 'progress binding createdAt')
  assertHash(value.bindingHash, 'progress binding bindingHash')

  if (value.attempt === 1 && (value.rootRunId !== value.commandRunId || value.parentRunId !== null)) throw new Error('first attempt must be its own root with no parent')
  if (Number(value.attempt) > 1 && (value.rootRunId === value.commandRunId || value.parentRunId === null || value.parentRunId === value.commandRunId)) throw new Error('retry attempt must name a different root and parent')

  const { bindingHash, ...withoutHash } = value as unknown as ProgressRunBinding
  if (bindingHash !== sha256(canonicalBinding(withoutHash))) throw new Error('progress binding hash mismatch')
  return value as unknown as ProgressRunBinding
}

export function validateEvidenceRef(value: unknown): EvidenceRef {
  if (!isRecord(value)) throw new Error('evidence reference must be an object')
  exactKeys(value, EVIDENCE_KEYS, 'evidence reference')
  if (value.schemaVersion !== CROSS_MACHINE_PROGRESS_SCHEMA_VERSION) throw new Error('evidence schemaVersion is unsupported')
  assertHash(value.sha256, 'evidence sha256')
  assertSafeString(value.manifestSchemaVersion, /^[0-9]+\.[0-9]+\.[0-9]+$/, 'evidence manifestSchemaVersion')
  if (!MEDIA_TYPES.has(value.mediaType as EvidenceRef['mediaType'])) throw new Error('evidence mediaType is unsupported')
  if (!Number.isSafeInteger(value.bytes) || Number(value.bytes) < 0 || Number(value.bytes) > 64 * 1024 * 1024) throw new Error('evidence bytes is out of range')
  assertSafeString(value.labelCode, SAFE_LABEL, 'evidence labelCode')
  if (!EVIDENCE_STATUSES.has(value.verificationStatus as EvidenceVerificationStatus)) throw new Error('evidence verificationStatus is unsupported')
  assertSafeString(value.taskId, TASK_ID, 'evidence taskId')
  assertUuid(value.commandRunId, 'evidence commandRunId')
  if (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1 || Number(value.attempt) > MAX_PROGRESS_ATTEMPTS) throw new Error('evidence attempt is out of range')
  assertHash(value.bindingHash, 'evidence bindingHash')
  return value as unknown as EvidenceRef
}

function validateStateEvidence(state: ProgressState, evidence: EvidenceRef | null): void {
  if (!TERMINAL_STATES.has(state) && evidence !== null) throw new Error('non-terminal progress event cannot carry evidence')
  if (state === 'passed' && (!evidence || evidence.verificationStatus !== 'verified')) throw new Error('passed progress event requires verified evidence')
}

export function createProgressEvent(input: EventInput | ProgressEvent): ProgressEvent {
  const withoutHash: Omit<ProgressEvent, 'eventHash'> = {
    ...input,
    schemaVersion: CROSS_MACHINE_PROGRESS_SCHEMA_VERSION,
  }
  const event = { ...withoutHash, eventHash: sha256(canonicalEvent(withoutHash)) }
  return validateProgressEvent(event)
}

export function validateProgressEvent(value: unknown): ProgressEvent {
  if (!isRecord(value)) throw new Error('progress event must be an object')
  exactKeys(value, EVENT_KEYS, 'progress event')
  if (value.schemaVersion !== CROSS_MACHINE_PROGRESS_SCHEMA_VERSION) throw new Error('progress event schemaVersion is unsupported')
  assertUuid(value.eventId, 'progress event eventId')
  assertSafeString(value.taskId, TASK_ID, 'progress event taskId')
  assertUuid(value.commandRunId, 'progress event commandRunId')
  assertUuid(value.machineId, 'progress event machineId')
  assertHash(value.bindingHash, 'progress event bindingHash')
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1 || Number(value.sequence) > MAX_PROGRESS_EVENTS_PER_ATTEMPT) throw new Error('progress event sequence is out of range')
  if (value.previousEventHash !== null) assertHash(value.previousEventHash, 'progress event previousEventHash')
  if ((value.sequence === 1) !== (value.previousEventHash === null)) throw new Error('progress event previous hash does not match sequence')
  if (!STATES.has(value.state as ProgressState)) throw new Error('progress event state is unsupported')
  if (value.phaseId !== null) assertSafeString(value.phaseId, PHASE_ID, 'progress event phaseId')
  if (!REASONS_BY_STATE[value.state as ProgressState].has(value.reasonCode as ProgressReasonCode)) throw new Error('progress event reasonCode does not match state')
  const evidence = value.evidence === null ? null : validateEvidenceRef(value.evidence)
  validateStateEvidence(value.state as ProgressState, evidence)
  assertTimestamp(value.occurredAt, 'progress event occurredAt')
  assertTimestamp(value.receivedAt, 'progress event receivedAt')
  if (Math.abs(Date.parse(value.receivedAt) - Date.parse(value.occurredAt)) > 7 * 24 * 60 * 60 * 1000) throw new Error('progress event clock skew exceeds seven days')
  assertHash(value.eventHash, 'progress event eventHash')

  const { eventHash, ...withoutHash } = value as unknown as ProgressEvent
  const bytes = Buffer.byteLength(canonicalEvent(withoutHash), 'utf8')
  if (bytes > MAX_PROGRESS_EVENT_BYTES) throw new Error('progress event exceeds canonical byte limit')
  if (eventHash !== sha256(canonicalEvent(withoutHash))) throw new Error('progress event hash mismatch')
  return value as unknown as ProgressEvent
}

export function assertProgressTransition(previous: ProgressState | null, next: ProgressState): void {
  if (previous === null) {
    if (next !== 'queued' && next !== 'running') throw new Error('first progress state must be queued or running')
    return
  }
  if (!ALLOWED_TRANSITIONS[previous].has(next)) throw new Error(`invalid progress transition ${previous} -> ${next}`)
}

function clockStatus(events: ProgressEvent[]): ProgressAttemptView['clockStatus'] {
  let maximumSkew = 0
  for (const event of events) {
    const skew = Date.parse(event.occurredAt) - Date.parse(event.receivedAt)
    if (Math.abs(skew) > Math.abs(maximumSkew)) maximumSkew = skew
  }
  if (Math.abs(maximumSkew) <= 5 * 60 * 1000) return 'on_time'
  return maximumSkew > 0 ? 'producer_ahead' : 'producer_behind'
}

export function buildProgressTaskView(ledger: ProgressLedger, expectedTaskId?: string): ProgressTaskView {
  if (!isRecord(ledger) || !Array.isArray(ledger.bindings) || !Array.isArray(ledger.events)) throw new Error('progress ledger must contain binding and event arrays')
  exactKeys(ledger, ['bindings', 'events'], 'progress ledger')
  if (ledger.bindings.length > MAX_PROGRESS_ATTEMPTS) throw new Error('progress ledger has too many attempts')
  if (ledger.events.length > MAX_PROGRESS_ATTEMPTS * MAX_PROGRESS_EVENTS_PER_ATTEMPT) throw new Error('progress ledger has too many events')

  const bindings = ledger.bindings.map(validateProgressRunBinding)
  const events = ledger.events.map(validateProgressEvent)
  const taskIds = new Set(bindings.map((binding) => binding.taskId))
  if (taskIds.size > 1) throw new Error('progress ledger mixes task identities')
  const taskId = bindings[0]?.taskId ?? expectedTaskId
  if (!taskId || !TASK_ID.test(taskId)) throw new Error('progress ledger task identity is missing')
  if (expectedTaskId && taskId !== expectedTaskId) throw new Error('progress ledger task identity mismatch')

  const byRun = new Map<string, ProgressRunBinding>()
  const byHash = new Map<string, ProgressRunBinding>()
  const byRootAttempt = new Set<string>()
  const rootRuns = new Set<string>()
  const parentRuns = new Set<string>()
  for (const binding of bindings) {
    if (binding.taskId !== taskId) throw new Error('progress binding task identity mismatch')
    if (byRun.has(binding.commandRunId)) throw new Error('duplicate progress command run')
    if (byHash.has(binding.bindingHash)) throw new Error('duplicate progress binding hash')
    const rootAttempt = `${binding.rootRunId}\u0000${binding.attempt}`
    if (byRootAttempt.has(rootAttempt)) throw new Error('duplicate retry attempt ordinal')
    if (binding.parentRunId && parentRuns.has(binding.parentRunId)) throw new Error('retry lineage branches from one parent')
    byRun.set(binding.commandRunId, binding)
    byHash.set(binding.bindingHash, binding)
    byRootAttempt.add(rootAttempt)
    rootRuns.add(binding.rootRunId)
    if (binding.parentRunId) parentRuns.add(binding.parentRunId)
  }
  if (rootRuns.size > 1) throw new Error('progress ledger has multiple root runs for one task')

  for (const binding of bindings) {
    if (binding.attempt === 1) continue
    const parent = byRun.get(binding.parentRunId!)
    if (!parent || parent.taskId !== binding.taskId || parent.rootRunId !== binding.rootRunId || parent.attempt + 1 !== binding.attempt) {
      throw new Error('retry lineage parent/root/ordinal mismatch')
    }
    if (Date.parse(binding.createdAt) < Date.parse(parent.createdAt)) throw new Error('retry attempt predates its parent')
  }

  const eventsByBinding = new Map<string, ProgressEvent[]>()
  const eventIds = new Map<string, string>()
  const eventHashes = new Set<string>()
  for (const event of events) {
    const binding = byHash.get(event.bindingHash)
    if (!binding || event.taskId !== binding.taskId || event.commandRunId !== binding.commandRunId || event.machineId !== binding.machineId) {
      throw new Error('progress event identity does not match binding')
    }
    const existingHash = eventIds.get(event.eventId)
    if (existingHash && existingHash !== event.eventHash) throw new Error('progress event ID was reused with different content')
    if (existingHash === event.eventHash) continue
    if (eventHashes.has(event.eventHash)) throw new Error('duplicate progress event hash')
    eventIds.set(event.eventId, event.eventHash)
    eventHashes.add(event.eventHash)
    const group = eventsByBinding.get(event.bindingHash) ?? []
    group.push(event)
    eventsByBinding.set(event.bindingHash, group)
  }

  const attempts: ProgressAttemptView[] = [...bindings]
    .sort((left, right) => left.attempt - right.attempt || left.commandRunId.localeCompare(right.commandRunId))
    .map((binding) => {
      const runEvents = (eventsByBinding.get(binding.bindingHash) ?? []).sort((left, right) => left.sequence - right.sequence)
      if (runEvents.length > MAX_PROGRESS_EVENTS_PER_ATTEMPT) throw new Error('progress attempt has too many events')
      let previous: ProgressEvent | null = null
      for (const event of runEvents) {
        const expectedSequence = (previous?.sequence ?? 0) + 1
        if (event.sequence !== expectedSequence || event.previousEventHash !== (previous?.eventHash ?? null)) throw new Error('progress event chain has a gap or hash mismatch')
        assertProgressTransition(previous?.state ?? null, event.state)
        if (previous && (Date.parse(event.occurredAt) < Date.parse(previous.occurredAt) || Date.parse(event.receivedAt) < Date.parse(previous.receivedAt))) {
          throw new Error('progress event timestamps moved backward')
        }
        if (event.evidence && (event.evidence.taskId !== binding.taskId || event.evidence.commandRunId !== binding.commandRunId || event.evidence.attempt !== binding.attempt || event.evidence.bindingHash !== binding.bindingHash)) {
          throw new Error('progress evidence identity does not match binding')
        }
        previous = event
      }
      return {
        binding,
        events: runEvents,
        state: previous?.state ?? null,
        eventCount: runEvents.length,
        latestEventHash: previous?.eventHash ?? null,
        evidence: previous?.evidence ?? null,
        clockStatus: clockStatus(runEvents),
      }
    })

  const attemptsByRun = new Map(attempts.map((attempt) => [attempt.binding.commandRunId, attempt]))
  for (const attempt of attempts) {
    if (attempt.binding.attempt === 1) continue
    const parent = attemptsByRun.get(attempt.binding.parentRunId!)
    if (!parent || !parent.state || !TERMINAL_STATES.has(parent.state) || parent.state === 'passed') {
      throw new Error('retry parent must have a non-passed terminal state')
    }
  }

  const latest = attempts.at(-1) ?? null
  const ledgerHash = sha256(JSON.stringify({
    taskId,
    attempts: attempts.map((attempt) => ({ bindingHash: attempt.binding.bindingHash, latestEventHash: attempt.latestEventHash })),
  }))
  return { taskId, attempts, currentAttempt: latest?.binding.attempt ?? null, currentState: latest?.state ?? null, ledgerHash }
}

export function parseProgressSentinelLine(line: string): ProgressRunBinding | ProgressEvent {
  if (!line.startsWith(CROSS_MACHINE_PROGRESS_SENTINEL)) throw new Error('progress sentinel is missing')
  const payload = line.slice(CROSS_MACHINE_PROGRESS_SENTINEL.length)
  let parsed: unknown
  try { parsed = JSON.parse(payload) } catch { throw new Error('progress sentinel JSON is malformed') }
  if (!isRecord(parsed)) throw new Error('progress sentinel payload must be an object')
  if ('bindingHash' in parsed && 'eventHash' in parsed) return validateProgressEvent(parsed)
  if ('bindingHash' in parsed) return validateProgressRunBinding(parsed)
  throw new Error('progress sentinel payload kind is unknown')
}
