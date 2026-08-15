import { randomUUID } from 'node:crypto'
import { PRIVACY_POLICY_VERSION } from './privacy-policy'
import { PRIVACY_WRITER_SCHEMA_VERSION } from './privacy-writer'

export interface BlockedCentralWriterReceipt<WriterId extends string = string> {
  schemaVersion: typeof PRIVACY_WRITER_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  writerId: WriterId
  runId: string
  tenantContextStatus: 'unavailable'
  outcome: 'blocked'
  reasonCode: 'tenant_attestation_unavailable'
  createdAt: string
}

export interface UnavailableTenantReceiptInput {
  writerId: string
  runId: string
  createdAt: string
}

export interface WriterBoundReceiptInput {
  runId: string
  createdAt: string
}

export const BLOCKED_CENTRAL_WRITER_IDS = [
  'kit.sync.install-report',
  'kit.telemetry.central-upsert',
  'kit.verification.record',
] as const

export type BlockedCentralWriterId = (typeof BLOCKED_CENTRAL_WRITER_IDS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WRITER_ID = /^[a-z][a-z0-9_.-]{2,127}$/
const INPUT_KEYS = ['createdAt', 'runId', 'writerId'] as const
const WRITER_BOUND_INPUT_KEYS = ['createdAt', 'runId'] as const
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

export class BlockedCentralWriterError extends Error {
  readonly ruleId: string

  constructor(ruleId: string) {
    super('central writer compatibility refused')
    this.name = 'BlockedCentralWriterError'
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
    throw new BlockedCentralWriterError(ruleId)
  }
}

function isBlockedCentralWriterId(value: string): value is BlockedCentralWriterId {
  return BLOCKED_CENTRAL_WRITER_IDS.some((candidate) => candidate === value)
}

function validateWriterId(value: unknown): BlockedCentralWriterId {
  if (
    typeof value !== 'string'
    || !WRITER_ID.test(value)
    || !isBlockedCentralWriterId(value)
  ) {
    throw new BlockedCentralWriterError('compat.writer_id')
  }
  return value
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new BlockedCentralWriterError('compat.created_at')
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new BlockedCentralWriterError('compat.created_at')
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
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BlockedCentralWriterError('compat.run_id')
  }
  return value
}

export function validateWriterBoundReceiptInput(value: unknown): WriterBoundReceiptInput {
  if (!plain(value)) throw new BlockedCentralWriterError('compat.input_shape')
  exactKeys(value, WRITER_BOUND_INPUT_KEYS, 'compat.input_fields')
  return Object.freeze({
    runId: validateCommandRunId(value.runId),
    createdAt: canonicalTimestamp(value.createdAt),
  })
}

export function createUnavailableTenantReceipt(input: unknown): BlockedCentralWriterReceipt {
  if (!plain(input)) throw new BlockedCentralWriterError('compat.input_shape')
  exactKeys(input, INPUT_KEYS, 'compat.input_fields')
  return Object.freeze({
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: validateWriterId(input.writerId),
    runId: validateCommandRunId(input.runId),
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: canonicalTimestamp(input.createdAt),
  })
}

export function validateBlockedCentralWriterReceipt(
  value: unknown,
  expectedWriterId: string,
): BlockedCentralWriterReceipt {
  const writerId = validateWriterId(expectedWriterId)
  if (!plain(value)) throw new BlockedCentralWriterError('compat.receipt_shape')
  exactKeys(value, RECEIPT_KEYS, 'compat.receipt_fields')
  if (
    value.schemaVersion !== PRIVACY_WRITER_SCHEMA_VERSION
    || value.policyVersion !== PRIVACY_POLICY_VERSION
    || value.writerId !== writerId
    || value.tenantContextStatus !== 'unavailable'
    || value.outcome !== 'blocked'
    || value.reasonCode !== 'tenant_attestation_unavailable'
  ) throw new BlockedCentralWriterError('compat.receipt_contract')

  return Object.freeze({
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId,
    runId: validateCommandRunId(value.runId),
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: canonicalTimestamp(value.createdAt),
  })
}
