import {
  CENTRAL_FAMILIES,
  PRIVACY_POLICY_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
  PrivacyPolicyError,
  buildCentralRecord,
  validateCentralRecord,
  type CentralFamily,
  type CentralRecord,
  type ClockPort,
  type OpaqueIdentifierPort,
  type PrivacyRejectionReason,
} from './privacy-policy'

export const PRIVACY_WRITER_SCHEMA_VERSION = 1 as const

export const PRIVACY_WRITER_REASON_CODES = [
  'invalid_writer_request',
  'policy_rejected',
  'sink_capability_unavailable',
  'sink_response_refused',
  'storage_unavailable',
] as const

export type PrivacyWriterReasonCode = (typeof PRIVACY_WRITER_REASON_CODES)[number]

export interface CentralWriteAttempt {
  schemaVersion: typeof PRIVACY_WRITER_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  writerId: string
  record: CentralRecord
}

export interface CentralWriteReceipt {
  schemaVersion: typeof PRIVACY_WRITER_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  writerId: string
  tenantId: string
  family: CentralFamily
  recordHash: string
  persistenceId: string
  replayed: boolean
  storedAt: string
}

export interface CentralWriterSinkCapability {
  schemaVersion: typeof PRIVACY_WRITER_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  capabilityId: string
  tenantId: string
  families: readonly CentralFamily[]
  persist(attempt: CentralWriteAttempt): Promise<unknown>
}

export interface CentralWriteConstructionInput {
  writerId: string
  context: unknown
  grant: unknown
  family: CentralFamily
  payload: unknown
  clock: ClockPort
  opaqueIdentifierPort: OpaqueIdentifierPort
}

export interface ExecuteCentralWriteInput extends CentralWriteConstructionInput {
  sinkCapability: unknown
}

export type CentralWriterResult =
  | {
    ok: true
    statusCode: 'persisted' | 'replayed'
    reasonCode: null
    privacyReasonCode: null
    receipt: CentralWriteReceipt
  }
  | {
    ok: false
    statusCode: 'blocked'
    reasonCode: PrivacyWriterReasonCode
    privacyReasonCode: PrivacyRejectionReason | null
    ruleId: string
    receipt: null
  }

const WRITER_ID = /^[a-z][a-z0-9_.-]{2,127}$/
const CAPABILITY_ID = /^[a-z][a-z0-9_]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
const CONSTRUCTION_KEYS = ['writerId', 'context', 'grant', 'family', 'payload', 'clock', 'opaqueIdentifierPort'] as const
const EXECUTION_KEYS = [...CONSTRUCTION_KEYS, 'sinkCapability'] as const
const ATTEMPT_KEYS = ['schemaVersion', 'policyVersion', 'writerId', 'record'] as const
const CAPABILITY_KEYS = ['schemaVersion', 'policyVersion', 'capabilityId', 'tenantId', 'families', 'persist'] as const
const RECEIPT_KEYS = ['schemaVersion', 'policyVersion', 'writerId', 'tenantId', 'family', 'recordHash', 'persistenceId', 'replayed', 'storedAt'] as const

class WriterBoundaryError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('privacy writer boundary refused')
    this.name = 'WriterBoundaryError'
    this.ruleId = ruleId
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], ruleId: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new WriterBoundaryError(ruleId)
}

function assertWriterId(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !WRITER_ID.test(value)) throw new WriterBoundaryError(ruleId)
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function canonicalFamilies(value: unknown): value is CentralFamily[] {
  if (!Array.isArray(value) || value.length === 0) return false
  if (value.some((family) => typeof family !== 'string' || !CENTRAL_FAMILIES.includes(family as CentralFamily))) return false
  if (new Set(value).size !== value.length) return false
  const expected = [...value].sort((left, right) => CENTRAL_FAMILIES.indexOf(left as CentralFamily) - CENTRAL_FAMILIES.indexOf(right as CentralFamily))
  return expected.every((family, index) => family === value[index])
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function blocked(
  reasonCode: PrivacyWriterReasonCode,
  ruleId: string,
  privacyReasonCode: PrivacyRejectionReason | null = null,
): CentralWriterResult {
  return { ok: false, statusCode: 'blocked', reasonCode, privacyReasonCode, ruleId, receipt: null }
}

function validateConstructionInput(value: unknown, keys: readonly string[]): asserts value is CentralWriteConstructionInput {
  if (!isRecord(value)) throw new WriterBoundaryError('writer.request_shape')
  exactKeys(value, keys, 'writer.request_fields')
  assertWriterId(value.writerId, 'writer.writer_id')
  if (typeof value.family !== 'string' || !CENTRAL_FAMILIES.includes(value.family as CentralFamily)) throw new WriterBoundaryError('writer.family')
  if (!isRecord(value.clock) || typeof value.clock.now !== 'function') throw new WriterBoundaryError('writer.clock_port')
  if (!isRecord(value.opaqueIdentifierPort) || typeof value.opaqueIdentifierPort.create !== 'function') throw new WriterBoundaryError('writer.opaque_port')
}

export function buildCentralWriteAttempt(input: CentralWriteConstructionInput): CentralWriteAttempt {
  validateConstructionInput(input, CONSTRUCTION_KEYS)
  const record = buildCentralRecord({
    context: input.context,
    grant: input.grant,
    family: input.family,
    payload: input.payload,
    clock: input.clock,
    opaqueIdentifierPort: input.opaqueIdentifierPort,
  })
  return deepFreeze({
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: input.writerId,
    record: structuredClone(record),
  })
}

export function validateCentralWriteAttempt(value: unknown): CentralWriteAttempt {
  if (!isRecord(value)) throw new WriterBoundaryError('writer.attempt_shape')
  exactKeys(value, ATTEMPT_KEYS, 'writer.attempt_fields')
  if (value.schemaVersion !== PRIVACY_WRITER_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) throw new WriterBoundaryError('writer.attempt_version')
  assertWriterId(value.writerId, 'writer.attempt_writer_id')
  const record = validateCentralRecord(value.record)
  return deepFreeze({ schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION, policyVersion: PRIVACY_POLICY_VERSION, writerId: value.writerId, record: structuredClone(record) })
}

function validateSinkCapability(value: unknown, attempt: CentralWriteAttempt): CentralWriterSinkCapability {
  if (!isRecord(value)) throw new WriterBoundaryError('writer.sink_missing')
  exactKeys(value, CAPABILITY_KEYS, 'writer.sink_fields')
  if (value.schemaVersion !== PRIVACY_WRITER_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) throw new WriterBoundaryError('writer.sink_version')
  if (typeof value.capabilityId !== 'string' || !CAPABILITY_ID.test(value.capabilityId)) throw new WriterBoundaryError('writer.sink_capability_id')
  if (value.tenantId !== attempt.record.tenantId) throw new WriterBoundaryError('writer.sink_tenant')
  if (!canonicalFamilies(value.families) || !value.families.includes(attempt.record.family)) throw new WriterBoundaryError('writer.sink_families')
  if (typeof value.persist !== 'function') throw new WriterBoundaryError('writer.sink_persist')
  return value as unknown as CentralWriterSinkCapability
}

export function validateCentralWriteReceipt(value: unknown, expectedAttempt: CentralWriteAttempt): CentralWriteReceipt {
  const attempt = validateCentralWriteAttempt(expectedAttempt)
  if (!isRecord(value)) throw new WriterBoundaryError('writer.receipt_shape')
  exactKeys(value, RECEIPT_KEYS, 'writer.receipt_fields')
  if (value.schemaVersion !== PRIVACY_WRITER_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) throw new WriterBoundaryError('writer.receipt_version')
  if (value.writerId !== attempt.writerId) throw new WriterBoundaryError('writer.receipt_writer')
  if (value.tenantId !== attempt.record.tenantId) throw new WriterBoundaryError('writer.receipt_tenant')
  if (value.family !== attempt.record.family) throw new WriterBoundaryError('writer.receipt_family')
  if (value.recordHash !== attempt.record.recordHash || typeof value.recordHash !== 'string' || !HASH.test(value.recordHash)) throw new WriterBoundaryError('writer.receipt_hash')
  if (typeof value.persistenceId !== 'string' || !UUID.test(value.persistenceId)) throw new WriterBoundaryError('writer.receipt_persistence_id')
  if (typeof value.replayed !== 'boolean') throw new WriterBoundaryError('writer.receipt_replayed')
  if (!canonicalTimestamp(value.storedAt)) throw new WriterBoundaryError('writer.receipt_stored_at')
  return deepFreeze({
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: value.writerId,
    tenantId: value.tenantId,
    family: value.family,
    recordHash: value.recordHash,
    persistenceId: value.persistenceId,
    replayed: value.replayed,
    storedAt: value.storedAt,
  } as CentralWriteReceipt)
}

export async function executeCentralWrite(input: ExecuteCentralWriteInput): Promise<CentralWriterResult> {
  let attempt: CentralWriteAttempt
  try {
    validateConstructionInput(input, EXECUTION_KEYS)
    const { sinkCapability: _sinkCapability, ...construction } = input
    attempt = buildCentralWriteAttempt(construction)
  } catch (error) {
    if (error instanceof PrivacyPolicyError) return blocked('policy_rejected', error.ruleId, error.reasonCode)
    return blocked('invalid_writer_request', error instanceof WriterBoundaryError ? error.ruleId : 'writer.construction_refused')
  }

  let sink: CentralWriterSinkCapability
  try {
    sink = validateSinkCapability(input.sinkCapability, attempt)
  } catch (error) {
    return blocked('sink_capability_unavailable', error instanceof WriterBoundaryError ? error.ruleId : 'writer.sink_refused')
  }

  let rawReceipt: unknown
  try {
    rawReceipt = await sink.persist(attempt)
  } catch {
    return blocked('storage_unavailable', 'writer.sink_failed')
  }

  try {
    const receipt = validateCentralWriteReceipt(rawReceipt, attempt)
    return { ok: true, statusCode: receipt.replayed ? 'replayed' : 'persisted', reasonCode: null, privacyReasonCode: null, receipt }
  } catch {
    return blocked('sink_response_refused', 'writer.receipt_refused')
  }
}
