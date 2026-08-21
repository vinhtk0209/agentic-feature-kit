import {
  SPEC_ADAPTER_MAX_FIELDS,
  SPEC_ADAPTER_MAX_PARAGRAPHS,
  type SpecAdapterHashPort,
} from './spec-adapter'
import type { SpecAdapterFetchProviderId } from './spec-adapter-fetch'

export const SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION = '1.0.0' as const
export const SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE = 'node-default-fetch-v1' as const

export type SpecAdapterLiveProofReadinessStatus = 'needs_input' | 'ready'
export type SpecAdapterLiveProofReceiptStatus = 'failed' | 'needs_input' | 'passed'
export type SpecAdapterLiveProofProviderId = SpecAdapterFetchProviderId | 'unknown'
export type SpecAdapterLiveProofReasonCode =
  | 'bearer_capability_missing'
  | 'capability_rejected'
  | 'execution_rejected'
  | 'input_rejected'
  | 'item_input_missing'

export type SpecAdapterLiveProofErrorCode = 'HASH_FAILURE' | 'INVALID_READINESS' | 'INVALID_RECEIPT'

export interface SpecAdapterLiveProofReadinessInput {
  readonly providerId: SpecAdapterFetchProviderId
  readonly itemInputPresent: boolean
  readonly bearerCapabilityPresent: boolean
}

export interface SpecAdapterLiveProofReadiness {
  readonly schemaVersion: typeof SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION
  readonly providerId: SpecAdapterFetchProviderId
  readonly status: SpecAdapterLiveProofReadinessStatus
  readonly reasonCodes: readonly SpecAdapterLiveProofReasonCode[]
}

export interface SpecAdapterLiveProofResultMetadata {
  readonly adapterId: string
  readonly resultSchemaVersion: string
  readonly sourceSha256: string
  readonly paragraphCount: number
  readonly acceptanceCriteriaCount: number
  readonly unsupportedFieldCount: number
}

export interface SpecAdapterLiveProofReceiptDraft {
  readonly schemaVersion: typeof SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION
  readonly providerId: SpecAdapterLiveProofProviderId
  readonly executionMode: typeof SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE
  readonly status: SpecAdapterLiveProofReceiptStatus
  readonly observedAt: string
  readonly reasonCodes: readonly SpecAdapterLiveProofReasonCode[]
  readonly result: SpecAdapterLiveProofResultMetadata | null
}

export interface SpecAdapterLiveProofReceipt extends SpecAdapterLiveProofReceiptDraft {
  readonly integritySha256: string
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/
const UTC_TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/
const READINESS_KEYS = ['providerId', 'itemInputPresent', 'bearerCapabilityPresent'] as const
const DRAFT_KEYS = ['schemaVersion', 'providerId', 'executionMode', 'status', 'observedAt', 'reasonCodes', 'result'] as const
const RECEIPT_KEYS = [...DRAFT_KEYS, 'integritySha256'] as const
const RESULT_KEYS = [
  'adapterId',
  'resultSchemaVersion',
  'sourceSha256',
  'paragraphCount',
  'acceptanceCriteriaCount',
  'unsupportedFieldCount',
] as const
const NEEDS_INPUT_ORDER: readonly SpecAdapterLiveProofReasonCode[] = [
  'item_input_missing',
  'bearer_capability_missing',
]
const FAILURE_CODES: readonly SpecAdapterLiveProofReasonCode[] = [
  'input_rejected',
  'capability_rejected',
  'execution_rejected',
]

export class SpecAdapterLiveProofError extends Error {
  readonly code: SpecAdapterLiveProofErrorCode

  constructor(code: SpecAdapterLiveProofErrorCode) {
    super(`spec-adapter-live-proof:${code}`)
    this.name = 'SpecAdapterLiveProofError'
    this.code = code
    Object.freeze(this)
  }
}

function fail(code: SpecAdapterLiveProofErrorCode): never {
  throw new SpecAdapterLiveProofError(code)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string')) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const snapshot = Object.create(null) as Record<string, unknown>
    for (const key of keys as string[]) {
      const descriptor = descriptors[key]
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null
      Object.defineProperty(snapshot, key, {
        value: descriptor.value,
        enumerable: true,
        writable: false,
        configurable: false,
      })
    }
    return snapshot
  } catch {
    return null
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  try {
    const actual = Object.keys(value).sort(compareText)
    return JSON.stringify(actual) === JSON.stringify([...expected].sort(compareText))
  } catch {
    return false
  }
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 2) return null
  try {
    const keys = Reflect.ownKeys(value)
    const expected = [...Array.from({ length: value.length }, (_unused, index) => String(index)), 'length']
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null
    const result: string[] = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') return null
      result.push(descriptor.value)
    }
    return result
  } catch {
    return null
  }
}

function providerId(value: unknown): SpecAdapterLiveProofProviderId | null {
  return value === 'jira' || value === 'azure-devops' || value === 'unknown' ? value : null
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) return false
  try { return new Date(value).toISOString() === value } catch { return false }
}

function count(value: unknown, maximum: number, allowZero: boolean): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (allowZero ? 0 : 1) && (value as number) <= maximum
}

function resultMetadata(value: unknown): SpecAdapterLiveProofResultMetadata | null {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, RESULT_KEYS)
    || typeof record.adapterId !== 'string' || !IDENTIFIER_PATTERN.test(record.adapterId)
    || typeof record.resultSchemaVersion !== 'string' || !VERSION_PATTERN.test(record.resultSchemaVersion)
    || typeof record.sourceSha256 !== 'string' || !SHA256_PATTERN.test(record.sourceSha256)
    || !count(record.paragraphCount, SPEC_ADAPTER_MAX_PARAGRAPHS, false)
    || !count(record.acceptanceCriteriaCount, SPEC_ADAPTER_MAX_PARAGRAPHS, false)
    || !count(record.unsupportedFieldCount, SPEC_ADAPTER_MAX_FIELDS, true)) return null
  return Object.freeze({
    adapterId: record.adapterId,
    resultSchemaVersion: record.resultSchemaVersion,
    sourceSha256: record.sourceSha256,
    paragraphCount: record.paragraphCount as number,
    acceptanceCriteriaCount: record.acceptanceCriteriaCount as number,
    unsupportedFieldCount: record.unsupportedFieldCount as number,
  })
}

function reasonCodes(value: unknown): SpecAdapterLiveProofReasonCode[] | null {
  const values = stringList(value)
  if (!values || values.some((entry) => ![...NEEDS_INPUT_ORDER, ...FAILURE_CODES].includes(entry as SpecAdapterLiveProofReasonCode))) return null
  if (new Set(values).size !== values.length) return null
  return values as SpecAdapterLiveProofReasonCode[]
}

function validatedDraft(value: unknown): SpecAdapterLiveProofReceiptDraft {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, DRAFT_KEYS)
    || record.schemaVersion !== SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION
    || record.executionMode !== SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE
    || !['failed', 'needs_input', 'passed'].includes(String(record.status))
    || !validTimestamp(record.observedAt)) fail('INVALID_RECEIPT')
  const provider = providerId(record.providerId)
  const reasons = reasonCodes(record.reasonCodes)
  const result = record.result === null ? null : resultMetadata(record.result)
  if (!provider || !reasons || (record.result !== null && !result)) fail('INVALID_RECEIPT')

  if (record.status === 'needs_input') {
    if (provider === 'unknown' || result !== null || reasons.length === 0) fail('INVALID_RECEIPT')
    const expected = NEEDS_INPUT_ORDER.filter((code) => reasons.includes(code))
    if (JSON.stringify(reasons) !== JSON.stringify(expected)) fail('INVALID_RECEIPT')
  } else if (record.status === 'failed') {
    if (result !== null || reasons.length !== 1 || !FAILURE_CODES.includes(reasons[0])) fail('INVALID_RECEIPT')
    if (provider === 'unknown' && reasons[0] !== 'input_rejected') fail('INVALID_RECEIPT')
  } else if (provider === 'unknown' || result === null || reasons.length !== 0) {
    fail('INVALID_RECEIPT')
  }

  return Object.freeze({
    schemaVersion: SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
    providerId: provider,
    executionMode: SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE,
    status: record.status as SpecAdapterLiveProofReceiptStatus,
    observedAt: record.observedAt,
    reasonCodes: Object.freeze([...reasons]),
    result,
  })
}

function hashPort(value: unknown): SpecAdapterHashPort {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, ['sha256']) || typeof record.sha256 !== 'function') fail('HASH_FAILURE')
  return record as unknown as SpecAdapterHashPort
}

function canonicalPayload(draft: SpecAdapterLiveProofReceiptDraft): string {
  return JSON.stringify({
    schemaVersion: draft.schemaVersion,
    providerId: draft.providerId,
    executionMode: draft.executionMode,
    status: draft.status,
    observedAt: draft.observedAt,
    reasonCodes: [...draft.reasonCodes],
    result: draft.result === null ? null : {
      adapterId: draft.result.adapterId,
      resultSchemaVersion: draft.result.resultSchemaVersion,
      sourceSha256: draft.result.sourceSha256,
      paragraphCount: draft.result.paragraphCount,
      acceptanceCriteriaCount: draft.result.acceptanceCriteriaCount,
      unsupportedFieldCount: draft.result.unsupportedFieldCount,
    },
  })
}

function integrity(draft: SpecAdapterLiveProofReceiptDraft, rawHashPort: unknown): string {
  const port = hashPort(rawHashPort)
  let value: unknown
  try { value = port.sha256(new TextEncoder().encode(canonicalPayload(draft))) } catch { return fail('HASH_FAILURE') }
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail('HASH_FAILURE')
  return value
}

function frozenReceipt(draft: SpecAdapterLiveProofReceiptDraft, integritySha256: string): SpecAdapterLiveProofReceipt {
  return Object.freeze({
    ...draft,
    reasonCodes: Object.freeze([...draft.reasonCodes]),
    result: draft.result === null ? null : Object.freeze({ ...draft.result }),
    integritySha256,
  })
}

export function assessSpecAdapterLiveProofReadiness(rawInput: unknown): SpecAdapterLiveProofReadiness {
  const input = dataRecord(rawInput)
  if (!input || !exactKeys(input, READINESS_KEYS)
    || (input.providerId !== 'jira' && input.providerId !== 'azure-devops')
    || typeof input.itemInputPresent !== 'boolean'
    || typeof input.bearerCapabilityPresent !== 'boolean') fail('INVALID_READINESS')
  const reasons = NEEDS_INPUT_ORDER.filter((code) => (
    code === 'item_input_missing' ? !input.itemInputPresent : !input.bearerCapabilityPresent
  ))
  return Object.freeze({
    schemaVersion: SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
    providerId: input.providerId,
    status: reasons.length === 0 ? 'ready' : 'needs_input',
    reasonCodes: Object.freeze(reasons),
  })
}

export function createSpecAdapterLiveProofReceipt(
  rawDraft: unknown,
  rawHashPort: unknown,
): SpecAdapterLiveProofReceipt {
  const draft = validatedDraft(rawDraft)
  return frozenReceipt(draft, integrity(draft, rawHashPort))
}

export function validateSpecAdapterLiveProofReceipt(
  rawReceipt: unknown,
  rawHashPort: unknown,
): SpecAdapterLiveProofReceipt {
  const receipt = dataRecord(rawReceipt)
  if (!receipt || !exactKeys(receipt, RECEIPT_KEYS)
    || typeof receipt.integritySha256 !== 'string'
    || !SHA256_PATTERN.test(receipt.integritySha256)) fail('INVALID_RECEIPT')
  const draft = validatedDraft({
    schemaVersion: receipt.schemaVersion,
    providerId: receipt.providerId,
    executionMode: receipt.executionMode,
    status: receipt.status,
    observedAt: receipt.observedAt,
    reasonCodes: receipt.reasonCodes,
    result: receipt.result,
  })
  if (integrity(draft, rawHashPort) !== receipt.integritySha256) fail('INVALID_RECEIPT')
  return frozenReceipt(draft, receipt.integritySha256)
}
