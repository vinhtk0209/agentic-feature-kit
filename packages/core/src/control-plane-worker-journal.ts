import {
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
} from './control-plane'
import {
  type ControlPlaneExecutionReceipt,
  type ControlPlaneRecoveryJournalState,
  type ControlPlaneRecoveryObservation,
} from './control-plane-state'
import {
  serializeControlPlaneSignatureBytes,
  validateControlPlaneEnvelopeSignature,
  validateControlPlaneReceiptSignature,
  type ControlPlaneDetachedSignature,
  type ControlPlaneDetachedVerifierPort,
} from './control-plane-signing'

export const CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION = 1 as const
export const CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION = '1.0.0' as const
export const CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES = 384 * 1024
export const CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS = 8

export interface ControlPlaneWorkerJournalKey {
  readonly tenantId: string
  readonly machineId: string
  readonly deliveryId: string
}

export interface ControlPlaneWorkerJournalEntry {
  readonly schemaVersion: typeof CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION
  readonly journalRevision: number
  readonly stateChangedAt: string
  readonly envelope: ControlPlaneExecutionEnvelope
  readonly envelopeSignature: ControlPlaneDetachedSignature
  readonly journalState: ControlPlaneRecoveryJournalState
  readonly receipt: ControlPlaneExecutionReceipt | null
  readonly receiptSignature: ControlPlaneDetachedSignature | null
  readonly receiptAcknowledgedAt: string | null
  readonly recordHash: string
}

export interface ControlPlaneWorkerJournalPort {
  readonly load: (key: ControlPlaneWorkerJournalKey) => Promise<unknown | null>
  readonly compareAndSet: (
    key: ControlPlaneWorkerJournalKey,
    expectedRevision: number | null,
    next: ControlPlaneWorkerJournalEntry,
  ) => Promise<unknown>
}

export interface ControlPlaneWorkerJournalDependencies {
  readonly registry: unknown
  readonly hashPort: ControlPlaneHashPort
  readonly controlPlaneVerifier: ControlPlaneDetachedVerifierPort
  readonly workerVerifier: ControlPlaneDetachedVerifierPort
  readonly journalPort: ControlPlaneWorkerJournalPort
}

export type ControlPlaneWorkerJournalDecisionStatus = 'committed' | 'idempotent' | 'conflict'
export type ControlPlaneWorkerJournalDecisionAction =
  | 'prepared'
  | 'resume_not_started'
  | 'execution_started'
  | 'receipt_recorded'
  | 'replay_receipt'
  | 'unknown_recorded'
  | 'recovery_required'
  | 'acknowledged'
  | 'changed_delivery'
  | 'concurrent_change'
  | 'stale_revision'

export interface ControlPlaneWorkerJournalDecision {
  readonly status: ControlPlaneWorkerJournalDecisionStatus
  readonly action: ControlPlaneWorkerJournalDecisionAction
  readonly entry: ControlPlaneWorkerJournalEntry | null
}

export interface PrepareControlPlaneWorkerJournalInput {
  readonly key: ControlPlaneWorkerJournalKey
  readonly envelope: unknown
  readonly envelopeSignature: unknown
  readonly changedAt: string
}

export interface TransitionControlPlaneWorkerJournalInput {
  readonly key: ControlPlaneWorkerJournalKey
  readonly expectedRevision: number
  readonly changedAt: string
}

export interface RecordControlPlaneWorkerJournalReceiptInput extends TransitionControlPlaneWorkerJournalInput {
  readonly receipt: unknown
  readonly receiptSignature: unknown
}

export interface AcknowledgeControlPlaneWorkerJournalReceiptInput {
  readonly key: ControlPlaneWorkerJournalKey
  readonly expectedRevision: number
  readonly receiptHash: string
  readonly acknowledgedAt: string
}

export type ControlPlaneWorkerJournalErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_IDENTITY'
  | 'INVALID_STATE'
  | 'INVALID_TIME'
  | 'INVALID_HASH'
  | 'INVALID_ENVELOPE'
  | 'INVALID_RECEIPT'
  | 'ENTRY_TOO_LARGE'
  | 'REVISION_OVERFLOW'
  | 'PORT_UNAVAILABLE'

export class ControlPlaneWorkerJournalContractError extends Error {
  readonly code: ControlPlaneWorkerJournalErrorCode

  constructor(code: ControlPlaneWorkerJournalErrorCode, context: string) {
    super(`control plane worker journal: ${context}`)
    this.name = 'ControlPlaneWorkerJournalContractError'
    this.code = code
  }
}

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const LOWER_HASH = /^[0-9a-f]{64}$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const JOURNAL_STATES = new Set<ControlPlaneRecoveryJournalState>([
  'not_started',
  'execution_started',
  'receipt_available',
  'unknown',
])
const KEY_KEYS = ['tenantId', 'machineId', 'deliveryId'] as const
const ENTRY_KEYS = [
  'schemaVersion',
  'contractVersion',
  'journalRevision',
  'stateChangedAt',
  'envelope',
  'envelopeSignature',
  'journalState',
  'receipt',
  'receiptSignature',
  'receiptAcknowledgedAt',
  'recordHash',
] as const
const PREPARE_KEYS = ['key', 'envelope', 'envelopeSignature', 'changedAt'] as const
const TRANSITION_KEYS = ['key', 'expectedRevision', 'changedAt'] as const
const RECEIPT_KEYS = [...TRANSITION_KEYS, 'receipt', 'receiptSignature'] as const
const ACK_KEYS = ['key', 'expectedRevision', 'receiptHash', 'acknowledgedAt'] as const

function fail(code: ControlPlaneWorkerJournalErrorCode, context: string): never {
  throw new ControlPlaneWorkerJournalContractError(code, context)
}

interface PlainTreeBudget {
  nodes: number
  stringUnits: number
}

function assertPlainTree(
  value: unknown,
  context: string,
  seen = new Set<object>(),
  budget: PlainTreeBudget = { nodes: 0, stringUnits: 0 },
  depth = 0,
): void {
  budget.nodes += 1
  if (budget.nodes > 8_192 || depth > 32) fail('ENTRY_TOO_LARGE', context)
  if (typeof value === 'string') {
    budget.stringUnits += value.length
    if (budget.stringUnits > CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES) fail('ENTRY_TOO_LARGE', context)
  }
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) fail('INVALID_SHAPE', context)
  seen.add(value)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor) fail('INVALID_SHAPE', context)
    if (!('value' in descriptor)) fail('INVALID_SHAPE', context)
    assertPlainTree(descriptor.value, context, seen, budget, depth + 1)
  }
  seen.delete(value)
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  assertPlainTree(value, context)
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', context)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) fail('INVALID_SHAPE', context)
  const actual = (ownKeys as string[]).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('INVALID_SHAPE', context)
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  }
  return value
}

function assertCanonicalTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) fail('INVALID_TIME', context)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIME', context)
}

function assertRevision(value: unknown, context: string): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS
  ) fail('INVALID_STATE', context)
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

function hashText(port: ControlPlaneHashPort, value: string, context: string): string {
  let known: unknown
  let result: unknown
  try {
    known = port.sha256('')
    result = port.sha256(value)
  } catch {
    fail('INVALID_HASH', context)
  }
  if (known !== EMPTY_SHA256 || typeof result !== 'string' || !LOWER_HASH.test(result)) {
    fail('INVALID_HASH', context)
  }
  return result
}

function validateKey(value: unknown): ControlPlaneWorkerJournalKey {
  const record = asRecord(value, 'journal key')
  exactKeys(record, KEY_KEYS, 'journal key')
  for (const key of KEY_KEYS) {
    if (typeof record[key] !== 'string' || !LOWER_UUID.test(record[key])) fail('INVALID_IDENTITY', 'journal key')
  }
  return deepFreeze({
    tenantId: record.tenantId as string,
    machineId: record.machineId as string,
    deliveryId: record.deliveryId as string,
  })
}

function validateEnvelope(
  envelopeInput: unknown,
  signatureInput: unknown,
  dependencies: Pick<ControlPlaneWorkerJournalDependencies, 'registry' | 'hashPort' | 'controlPlaneVerifier'>,
): { readonly payload: ControlPlaneExecutionEnvelope; readonly signature: ControlPlaneDetachedSignature } {
  try {
    return validateControlPlaneEnvelopeSignature(
      envelopeInput,
      signatureInput,
      dependencies.registry,
      dependencies.hashPort,
      dependencies.controlPlaneVerifier,
    )
  } catch {
    fail('INVALID_ENVELOPE', 'signed envelope')
  }
}

function validateReceipt(
  receiptInput: unknown,
  envelopeInput: unknown,
  signatureInput: unknown,
  dependencies: Pick<ControlPlaneWorkerJournalDependencies, 'registry' | 'hashPort' | 'workerVerifier'>,
): { readonly payload: ControlPlaneExecutionReceipt; readonly signature: ControlPlaneDetachedSignature } {
  try {
    return validateControlPlaneReceiptSignature(
      receiptInput,
      envelopeInput,
      signatureInput,
      dependencies.registry,
      dependencies.hashPort,
      dependencies.workerVerifier,
    )
  } catch {
    fail('INVALID_RECEIPT', 'signed receipt')
  }
}

function canonicalEntry(value: Omit<ControlPlaneWorkerJournalEntry, 'recordHash'>): string {
  return JSON.stringify({
    domain: 'claude-workflow-kit.control-plane.worker-journal-entry.v1',
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    journalRevision: value.journalRevision,
    stateChangedAt: value.stateChangedAt,
    envelope: value.envelope,
    envelopeSignatureBytes: serializeControlPlaneSignatureBytes(value.envelopeSignature),
    envelopeSignature: value.envelopeSignature.signature,
    journalState: value.journalState,
    receipt: value.receipt,
    receiptSignatureBytes: value.receiptSignature === null
      ? null
      : serializeControlPlaneSignatureBytes(value.receiptSignature),
    receiptSignature: value.receiptSignature?.signature ?? null,
    receiptAcknowledgedAt: value.receiptAcknowledgedAt,
  })
}

function entryWithoutHash(
  value: Omit<ControlPlaneWorkerJournalEntry, 'recordHash'>,
): Omit<ControlPlaneWorkerJournalEntry, 'recordHash'> {
  return {
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    journalRevision: value.journalRevision,
    stateChangedAt: value.stateChangedAt,
    envelope: value.envelope,
    envelopeSignature: value.envelopeSignature,
    journalState: value.journalState,
    receipt: value.receipt,
    receiptSignature: value.receiptSignature,
    receiptAcknowledgedAt: value.receiptAcknowledgedAt,
  }
}

function createEntry(
  value: Omit<ControlPlaneWorkerJournalEntry, 'schemaVersion' | 'contractVersion' | 'recordHash'>,
  hashPort: ControlPlaneHashPort,
): ControlPlaneWorkerJournalEntry {
  const withoutHash: Omit<ControlPlaneWorkerJournalEntry, 'recordHash'> = {
    schemaVersion: CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION,
    ...value,
  }
  const result = deepFreeze({
    ...withoutHash,
    recordHash: hashText(hashPort, canonicalEntry(withoutHash), 'journal record hash'),
  })
  if (utf8ByteLength(JSON.stringify(result)) > CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES) {
    fail('ENTRY_TOO_LARGE', 'journal entry')
  }
  return result
}

function sameSignedEnvelope(
  entry: ControlPlaneWorkerJournalEntry,
  payload: ControlPlaneExecutionEnvelope,
  signature: ControlPlaneDetachedSignature,
): boolean {
  return entry.envelope.envelopeHash === payload.envelopeHash
    && JSON.stringify(entry.envelope) === JSON.stringify(payload)
    && JSON.stringify(entry.envelopeSignature) === JSON.stringify(signature)
}

function keyMatchesEnvelope(key: ControlPlaneWorkerJournalKey, envelope: ControlPlaneExecutionEnvelope): boolean {
  return key.tenantId === envelope.identity.tenantId
    && key.machineId === envelope.identity.machineId
    && key.deliveryId === envelope.identity.deliveryId
}

function decision(
  status: ControlPlaneWorkerJournalDecisionStatus,
  action: ControlPlaneWorkerJournalDecisionAction,
  entry: ControlPlaneWorkerJournalEntry | null,
): ControlPlaneWorkerJournalDecision {
  return deepFreeze({ status, action, entry })
}

function nextRevision(entry: ControlPlaneWorkerJournalEntry): number {
  if (entry.journalRevision >= CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS) {
    fail('REVISION_OVERFLOW', 'journal revision')
  }
  return entry.journalRevision + 1
}

function assertMonotonicTime(previous: string, next: string): void {
  assertCanonicalTime(next, 'journal transition time')
  if (Date.parse(next) < Date.parse(previous)) fail('INVALID_TIME', 'journal transition time')
}

function assertWithinSignedLease(envelope: ControlPlaneExecutionEnvelope, observedAt: string, context: string): void {
  const observed = Date.parse(observedAt)
  if (
    observed < Date.parse(envelope.timing.issuedAt)
    || observed >= Date.parse(envelope.timing.leaseExpiresAt)
  ) fail('INVALID_TIME', context)
}

async function loadUnknown(
  key: ControlPlaneWorkerJournalKey,
  port: ControlPlaneWorkerJournalPort,
): Promise<unknown | null> {
  try {
    return await port.load(key)
  } catch {
    fail('PORT_UNAVAILABLE', 'journal load')
  }
}

async function compareAndSet(
  key: ControlPlaneWorkerJournalKey,
  expectedRevision: number | null,
  next: ControlPlaneWorkerJournalEntry,
  port: ControlPlaneWorkerJournalPort,
): Promise<'committed' | 'conflict'> {
  let result: unknown
  try {
    result = await port.compareAndSet(key, expectedRevision, next)
  } catch {
    fail('PORT_UNAVAILABLE', 'journal compare-and-set')
  }
  const record = asRecord(result, 'journal compare-and-set result')
  exactKeys(record, ['status'], 'journal compare-and-set result')
  if (record.status !== 'committed' && record.status !== 'conflict') {
    fail('PORT_UNAVAILABLE', 'journal compare-and-set result')
  }
  return record.status
}

export function validateControlPlaneWorkerJournalEntry(
  value: unknown,
  registry: unknown,
  hashPort: ControlPlaneHashPort,
  controlPlaneVerifier: ControlPlaneDetachedVerifierPort,
  workerVerifier: ControlPlaneDetachedVerifierPort,
): ControlPlaneWorkerJournalEntry {
  const record = asRecord(value, 'journal entry')
  let rawEntry: string
  try {
    rawEntry = JSON.stringify(value)
  } catch {
    fail('INVALID_SHAPE', 'journal entry')
  }
  if (utf8ByteLength(rawEntry) > CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES) {
    fail('ENTRY_TOO_LARGE', 'journal entry')
  }
  exactKeys(record, ENTRY_KEYS, 'journal entry')
  if (
    record.schemaVersion !== CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION
    || record.contractVersion !== CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION
  ) fail('UNSUPPORTED_VERSION', 'journal entry')
  assertRevision(record.journalRevision, 'journal revision')
  assertCanonicalTime(record.stateChangedAt, 'journal state time')
  if (typeof record.journalState !== 'string' || !JOURNAL_STATES.has(record.journalState as ControlPlaneRecoveryJournalState)) {
    fail('INVALID_STATE', 'journal state')
  }
  const envelope = validateEnvelope(record.envelope, record.envelopeSignature, {
    registry, hashPort, controlPlaneVerifier,
  })
  let receipt: ControlPlaneExecutionReceipt | null = null
  let receiptSignature: ControlPlaneDetachedSignature | null = null
  if (record.receipt === null || record.receiptSignature === null) {
    if (record.receipt !== null || record.receiptSignature !== null) fail('INVALID_STATE', 'journal receipt')
  } else {
    const verified = validateReceipt(record.receipt, envelope.payload, record.receiptSignature, {
      registry, hashPort, workerVerifier,
    })
    receipt = verified.payload
    receiptSignature = verified.signature
  }
  if (record.journalState === 'receipt_available') {
    if (receipt === null || receiptSignature === null) fail('INVALID_STATE', 'journal receipt')
  } else if (receipt !== null || receiptSignature !== null || record.receiptAcknowledgedAt !== null) {
    fail('INVALID_STATE', 'journal receipt')
  }
  if (record.receiptAcknowledgedAt !== null) {
    assertCanonicalTime(record.receiptAcknowledgedAt, 'journal acknowledgement time')
    if (receipt === null || Date.parse(record.receiptAcknowledgedAt) < Date.parse(receipt.completedAt)) {
      fail('INVALID_TIME', 'journal acknowledgement time')
    }
  }
  if (typeof record.recordHash !== 'string' || !LOWER_HASH.test(record.recordHash)) fail('INVALID_HASH', 'journal record')
  const withoutHash = entryWithoutHash({
    schemaVersion: CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION,
    journalRevision: record.journalRevision,
    stateChangedAt: record.stateChangedAt,
    envelope: envelope.payload,
    envelopeSignature: envelope.signature,
    journalState: record.journalState as ControlPlaneRecoveryJournalState,
    receipt,
    receiptSignature,
    receiptAcknowledgedAt: record.receiptAcknowledgedAt as string | null,
  })
  const expectedHash = hashText(hashPort, canonicalEntry(withoutHash), 'journal record hash')
  if (record.recordHash !== expectedHash) fail('INVALID_HASH', 'journal record')
  const result = deepFreeze({ ...withoutHash, recordHash: record.recordHash })
  if (result.journalState === 'not_started' || result.journalState === 'execution_started') {
    assertWithinSignedLease(result.envelope, result.stateChangedAt, 'journal state time')
  }
  if (result.receipt !== null && Date.parse(result.stateChangedAt) < Date.parse(result.receipt.completedAt)) {
    fail('INVALID_TIME', 'journal receipt time')
  }
  if (result.receiptAcknowledgedAt !== null && result.receiptAcknowledgedAt !== result.stateChangedAt) {
    fail('INVALID_TIME', 'journal acknowledgement time')
  }
  if (utf8ByteLength(JSON.stringify(result)) > CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES) {
    fail('ENTRY_TOO_LARGE', 'journal entry')
  }
  return result
}

export function serializeControlPlaneWorkerJournalEntry(
  value: unknown,
  registry: unknown,
  hashPort: ControlPlaneHashPort,
  controlPlaneVerifier: ControlPlaneDetachedVerifierPort,
  workerVerifier: ControlPlaneDetachedVerifierPort,
): string {
  return JSON.stringify(validateControlPlaneWorkerJournalEntry(
    value,
    registry,
    hashPort,
    controlPlaneVerifier,
    workerVerifier,
  ))
}

async function loadEntry(
  keyInput: unknown,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<{ readonly key: ControlPlaneWorkerJournalKey; readonly entry: ControlPlaneWorkerJournalEntry | null }> {
  const key = validateKey(keyInput)
  const raw = await loadUnknown(key, dependencies.journalPort)
  if (raw === null) return { key, entry: null }
  const entry = validateControlPlaneWorkerJournalEntry(
    raw,
    dependencies.registry,
    dependencies.hashPort,
    dependencies.controlPlaneVerifier,
    dependencies.workerVerifier,
  )
  if (!keyMatchesEnvelope(key, entry.envelope)) fail('INVALID_IDENTITY', 'journal entry key')
  return { key, entry }
}

export async function loadControlPlaneWorkerJournal(
  keyInput: unknown,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalEntry | null> {
  return (await loadEntry(keyInput, dependencies)).entry
}

export async function prepareControlPlaneWorkerJournal(
  value: PrepareControlPlaneWorkerJournalInput,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalDecision> {
  exactKeys(asRecord(value, 'journal prepare'), PREPARE_KEYS, 'journal prepare')
  const key = validateKey(value.key)
  assertCanonicalTime(value.changedAt, 'journal prepare time')
  const verified = validateEnvelope(value.envelope, value.envelopeSignature, dependencies)
  if (!keyMatchesEnvelope(key, verified.payload)) fail('INVALID_IDENTITY', 'journal prepare key')
  assertWithinSignedLease(verified.payload, value.changedAt, 'journal prepare time')
  const currentRaw = await loadUnknown(key, dependencies.journalPort)
  if (currentRaw !== null) {
    const current = validateControlPlaneWorkerJournalEntry(
      currentRaw,
      dependencies.registry,
      dependencies.hashPort,
      dependencies.controlPlaneVerifier,
      dependencies.workerVerifier,
    )
    if (!keyMatchesEnvelope(key, current.envelope)) fail('INVALID_IDENTITY', 'journal entry key')
    if (!sameSignedEnvelope(current, verified.payload, verified.signature)) {
      return decision('conflict', 'changed_delivery', current)
    }
    if (current.journalState === 'not_started') return decision('idempotent', 'resume_not_started', current)
    if (current.journalState === 'receipt_available') return decision('idempotent', 'replay_receipt', current)
    return decision('idempotent', 'recovery_required', current)
  }
  const next = createEntry({
    journalRevision: 1,
    stateChangedAt: value.changedAt,
    envelope: verified.payload,
    envelopeSignature: verified.signature,
    journalState: 'not_started',
    receipt: null,
    receiptSignature: null,
    receiptAcknowledgedAt: null,
  }, dependencies.hashPort)
  const committed = await compareAndSet(key, null, next, dependencies.journalPort)
  return committed === 'committed'
    ? decision('committed', 'prepared', next)
    : decision('conflict', 'concurrent_change', null)
}

function validateTransitionInput(value: unknown): TransitionControlPlaneWorkerJournalInput {
  const record = asRecord(value, 'journal transition')
  exactKeys(record, TRANSITION_KEYS, 'journal transition')
  const key = validateKey(record.key)
  assertRevision(record.expectedRevision, 'expected journal revision')
  assertCanonicalTime(record.changedAt, 'journal transition time')
  return deepFreeze({ key, expectedRevision: record.expectedRevision, changedAt: record.changedAt })
}

export async function markControlPlaneWorkerJournalExecutionStarted(
  value: TransitionControlPlaneWorkerJournalInput,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalDecision> {
  const input = validateTransitionInput(value)
  const loaded = await loadEntry(input.key, dependencies)
  if (loaded.entry === null) fail('INVALID_STATE', 'journal execution start')
  const current = loaded.entry
  if (current.journalState === 'execution_started' && current.stateChangedAt === input.changedAt) {
    return decision('idempotent', 'execution_started', current)
  }
  if (current.journalRevision !== input.expectedRevision) return decision('conflict', 'stale_revision', current)
  if (current.journalState !== 'not_started') fail('INVALID_STATE', 'journal execution start')
  assertMonotonicTime(current.stateChangedAt, input.changedAt)
  assertWithinSignedLease(current.envelope, input.changedAt, 'journal execution start time')
  const next = createEntry({
    ...entryWithoutHash(current),
    journalRevision: nextRevision(current),
    stateChangedAt: input.changedAt,
    journalState: 'execution_started',
  }, dependencies.hashPort)
  const committed = await compareAndSet(loaded.key, current.journalRevision, next, dependencies.journalPort)
  return committed === 'committed'
    ? decision('committed', 'execution_started', next)
    : decision('conflict', 'concurrent_change', current)
}

export async function recordControlPlaneWorkerJournalReceipt(
  value: RecordControlPlaneWorkerJournalReceiptInput,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalDecision> {
  const record = asRecord(value, 'journal receipt transition')
  exactKeys(record, RECEIPT_KEYS, 'journal receipt transition')
  const input = validateTransitionInput({
    key: record.key,
    expectedRevision: record.expectedRevision,
    changedAt: record.changedAt,
  })
  const loaded = await loadEntry(input.key, dependencies)
  if (loaded.entry === null) fail('INVALID_STATE', 'journal receipt transition')
  const current = loaded.entry
  const verified = validateReceipt(record.receipt, current.envelope, record.receiptSignature, dependencies)
  if (current.journalState === 'receipt_available') {
    const same = JSON.stringify(current.receipt) === JSON.stringify(verified.payload)
      && JSON.stringify(current.receiptSignature) === JSON.stringify(verified.signature)
    if (same) return decision('idempotent', 'replay_receipt', current)
    return decision('conflict', 'changed_delivery', current)
  }
  if (current.journalRevision !== input.expectedRevision) return decision('conflict', 'stale_revision', current)
  if (current.journalState !== 'execution_started' && current.journalState !== 'unknown') {
    fail('INVALID_STATE', 'journal receipt transition')
  }
  assertMonotonicTime(current.stateChangedAt, input.changedAt)
  if (Date.parse(input.changedAt) < Date.parse(verified.payload.completedAt)) fail('INVALID_TIME', 'journal receipt time')
  const next = createEntry({
    ...entryWithoutHash(current),
    journalRevision: nextRevision(current),
    stateChangedAt: input.changedAt,
    journalState: 'receipt_available',
    receipt: verified.payload,
    receiptSignature: verified.signature,
    receiptAcknowledgedAt: null,
  }, dependencies.hashPort)
  const committed = await compareAndSet(loaded.key, current.journalRevision, next, dependencies.journalPort)
  return committed === 'committed'
    ? decision('committed', 'receipt_recorded', next)
    : decision('conflict', 'concurrent_change', current)
}

export async function markControlPlaneWorkerJournalUnknown(
  value: TransitionControlPlaneWorkerJournalInput,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalDecision> {
  const input = validateTransitionInput(value)
  const loaded = await loadEntry(input.key, dependencies)
  if (loaded.entry === null) fail('INVALID_STATE', 'journal unknown transition')
  const current = loaded.entry
  if (current.journalState === 'unknown' && current.stateChangedAt === input.changedAt) {
    return decision('idempotent', 'unknown_recorded', current)
  }
  if (current.journalRevision !== input.expectedRevision) return decision('conflict', 'stale_revision', current)
  if (current.journalState !== 'execution_started') fail('INVALID_STATE', 'journal unknown transition')
  assertMonotonicTime(current.stateChangedAt, input.changedAt)
  const next = createEntry({
    ...entryWithoutHash(current),
    journalRevision: nextRevision(current),
    stateChangedAt: input.changedAt,
    journalState: 'unknown',
  }, dependencies.hashPort)
  const committed = await compareAndSet(loaded.key, current.journalRevision, next, dependencies.journalPort)
  return committed === 'committed'
    ? decision('committed', 'unknown_recorded', next)
    : decision('conflict', 'concurrent_change', current)
}

export async function acknowledgeControlPlaneWorkerJournalReceipt(
  value: AcknowledgeControlPlaneWorkerJournalReceiptInput,
  dependencies: ControlPlaneWorkerJournalDependencies,
): Promise<ControlPlaneWorkerJournalDecision> {
  const record = asRecord(value, 'journal acknowledgement')
  exactKeys(record, ACK_KEYS, 'journal acknowledgement')
  const key = validateKey(record.key)
  assertRevision(record.expectedRevision, 'expected journal revision')
  if (typeof record.receiptHash !== 'string' || !LOWER_HASH.test(record.receiptHash)) fail('INVALID_HASH', 'journal acknowledgement')
  assertCanonicalTime(record.acknowledgedAt, 'journal acknowledgement time')
  const loaded = await loadEntry(key, dependencies)
  if (loaded.entry === null) fail('INVALID_STATE', 'journal acknowledgement')
  const current = loaded.entry
  if (current.journalState !== 'receipt_available' || current.receipt === null) {
    fail('INVALID_STATE', 'journal acknowledgement')
  }
  if (current.receipt.receiptHash !== record.receiptHash) fail('INVALID_HASH', 'journal acknowledgement')
  if (current.receiptAcknowledgedAt === record.acknowledgedAt) {
    return decision('idempotent', 'acknowledged', current)
  }
  if (current.journalRevision !== record.expectedRevision) return decision('conflict', 'stale_revision', current)
  assertMonotonicTime(current.stateChangedAt, record.acknowledgedAt)
  if (Date.parse(record.acknowledgedAt) < Date.parse(current.receipt.completedAt)) {
    fail('INVALID_TIME', 'journal acknowledgement')
  }
  const next = createEntry({
    ...entryWithoutHash(current),
    journalRevision: nextRevision(current),
    stateChangedAt: record.acknowledgedAt,
    receiptAcknowledgedAt: record.acknowledgedAt,
  }, dependencies.hashPort)
  const committed = await compareAndSet(loaded.key, current.journalRevision, next, dependencies.journalPort)
  return committed === 'committed'
    ? decision('committed', 'acknowledged', next)
    : decision('conflict', 'concurrent_change', current)
}

export function createControlPlaneWorkerRecoveryObservation(
  entryInput: unknown,
  observedAt: string,
  registry: unknown,
  hashPort: ControlPlaneHashPort,
  controlPlaneVerifier: ControlPlaneDetachedVerifierPort,
  workerVerifier: ControlPlaneDetachedVerifierPort,
): ControlPlaneRecoveryObservation {
  assertCanonicalTime(observedAt, 'journal recovery time')
  if (entryInput === null) return deepFreeze({ observedAt, journalState: 'not_started', receiptHash: null })
  const entry = validateControlPlaneWorkerJournalEntry(
    entryInput,
    registry,
    hashPort,
    controlPlaneVerifier,
    workerVerifier,
  )
  return deepFreeze({
    observedAt,
    journalState: entry.journalState,
    receiptHash: entry.receipt?.receiptHash ?? null,
  })
}
