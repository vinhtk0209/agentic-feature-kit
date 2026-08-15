import { randomUUID } from 'node:crypto'
import { PRIVACY_POLICY_VERSION } from './core/privacy-policy'
import { PRIVACY_WRITER_SCHEMA_VERSION } from './core/privacy-writer'

export const VERIFICATION_WRITER_ID = 'kit.verification.record' as const

export interface BlockedVerificationReceipt {
  schemaVersion: typeof PRIVACY_WRITER_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  writerId: typeof VERIFICATION_WRITER_ID
  runId: string
  tenantContextStatus: 'unavailable'
  outcome: 'blocked'
  reasonCode: 'tenant_attestation_unavailable'
  createdAt: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INPUT_KEYS = ['createdAt', 'runId'] as const
const RECEIPT_KEYS = [
  'createdAt',
  'outcome',
  'policyVersion',
  'reasonCode',
  'runId',
  'schemaVersion',
  'tenantContextStatus',
  'writerId',
] as const

class VerificationWriterAdapterError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('verification writer adapter refused')
    this.name = 'VerificationWriterAdapterError'
    this.ruleId = ruleId
  }
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], ruleId: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new VerificationWriterAdapterError(ruleId)
  }
}

function commandRunId(value: unknown, ruleId: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new VerificationWriterAdapterError(ruleId)
  return value
}

function canonicalTimestamp(value: unknown, ruleId: string): string {
  if (typeof value !== 'string') throw new VerificationWriterAdapterError(ruleId)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new VerificationWriterAdapterError(ruleId)
  }
  return value
}

export function resolveCommandRunId(
  candidate: unknown,
  generate: () => string = randomUUID,
): string {
  const value = candidate === undefined ? generate() : candidate
  return validateCommandRunId(value)
}

export function validateCommandRunId(value: unknown): string {
  return commandRunId(value, 'verification.run_id')
}

export function createBlockedVerificationReceipt(input: unknown): BlockedVerificationReceipt {
  if (!plain(input)) throw new VerificationWriterAdapterError('verification.receipt_input_shape')
  exactKeys(input, INPUT_KEYS, 'verification.receipt_input_fields')
  const receipt: BlockedVerificationReceipt = {
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: VERIFICATION_WRITER_ID,
    runId: commandRunId(input.runId, 'verification.receipt_run_id'),
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: canonicalTimestamp(input.createdAt, 'verification.receipt_created_at'),
  }
  return Object.freeze(receipt)
}

export function validateVerificationWriterReceipt(value: unknown): BlockedVerificationReceipt {
  if (!plain(value)) throw new VerificationWriterAdapterError('verification.receipt_shape')
  exactKeys(value, RECEIPT_KEYS, 'verification.receipt_fields')
  if (
    value.schemaVersion !== PRIVACY_WRITER_SCHEMA_VERSION
    || value.policyVersion !== PRIVACY_POLICY_VERSION
    || value.writerId !== VERIFICATION_WRITER_ID
    || value.tenantContextStatus !== 'unavailable'
    || value.outcome !== 'blocked'
    || value.reasonCode !== 'tenant_attestation_unavailable'
  ) throw new VerificationWriterAdapterError('verification.receipt_contract')

  return Object.freeze({
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: VERIFICATION_WRITER_ID,
    runId: commandRunId(value.runId, 'verification.receipt_run_id'),
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: canonicalTimestamp(value.createdAt, 'verification.receipt_created_at'),
  })
}
