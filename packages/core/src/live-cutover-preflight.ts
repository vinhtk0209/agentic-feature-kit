import { createHash } from 'node:crypto'

export const C5B_SCHEMA_VERSION = 1 as const
export const C5B_POLICY_VERSION = 'p17-016-c5b-v1' as const

export const C5B_OPERATIONS = [
  'attest_project',
  'probe_catalog_acl',
  'freeze_writers',
  'create_provider_recovery_point',
  'create_encrypted_logical_backup',
  'restore_isolated_backup',
  'verify_restored_state',
  'cleanup_isolated_restore',
  'complete_preflight',
] as const

export const C5B_REASON_CODES = [
  'invalid_packet',
  'invalid_receipt',
  'operation_sequence_invalid',
  'operation_refused',
  'project_mismatch',
  'freeze_window_invalid',
  'writer_activity_detected',
  'recovery_point_unavailable',
  'logical_backup_invalid',
  'restore_invalid',
  'restored_state_mismatch',
  'cleanup_incomplete',
  'integrity_mismatch',
  'provider_operation_refused',
] as const

export type C5BOperation = (typeof C5B_OPERATIONS)[number]
export type C5BReasonCode = (typeof C5B_REASON_CODES)[number]
export type C5BEnvironmentClass = 'managed_nonproduction' | 'managed_production'

export interface C5BSourceBinding {
  migration0018Sha256: string
  migration0019Sha256: string
  rollback0018Sha256: string
  rollback0019Sha256: string
}

export interface C5BRecoveryRequirements {
  providerRecoveryPoint: true
  encryptedLogicalBackup: true
  isolatedRestore: true
  metadataOnlyEvidence: true
}

export interface C5BLimits {
  maxStepDurationMs: number
  maxBackupBytes: number
  maxObjectCount: number
}

export interface C5BPreflightPacketInput {
  schemaVersion: typeof C5B_SCHEMA_VERSION
  policyVersion: typeof C5B_POLICY_VERSION
  attemptId: string
  approvalRef: string
  environmentClass: C5BEnvironmentClass
  freezeStartsAt: string
  freezeExpiresAt: string
  destinationCapabilityId: string
  source: C5BSourceBinding
  requirements: C5BRecoveryRequirements
  limits: C5BLimits
}

export interface C5BPreflightPacket extends C5BPreflightPacketInput {
  sourceBindingHash: string
  packetHash: string
}

export interface C5BOperationReceiptInput {
  operation: C5BOperation
  status: 'passed' | 'refused'
  reasonCode: C5BReasonCode | null
  startedAt: string
  completedAt: string
  evidence: Record<string, unknown> | null
}

export interface C5BOperationReceipt extends C5BOperationReceiptInput {
  schemaVersion: typeof C5B_SCHEMA_VERSION
  policyVersion: typeof C5B_POLICY_VERSION
  attemptId: string
  packetHash: string
  sequence: number
  durationMs: number
  receiptHash: string
}

export interface C5BCompletionReceipt {
  schemaVersion: typeof C5B_SCHEMA_VERSION
  policyVersion: typeof C5B_POLICY_VERSION
  attemptId: string
  packetHash: string
  environmentClass: C5BEnvironmentClass
  sourceBindingHash: string
  catalogHash: string
  aclHash: string
  recoveryPointMetadataHash: string
  backupSha256: string
  restoreManifestSha256: string
  freezeExpiresAt: string
  artifactsExpireAt: string
  completedAt: string
  residualResourceCount: 0
  completionHash: string
  receiptHash: string
}

export type C5BCompletionResult =
  | { ok: true; statusCode: 'completed'; reasonCode: null; ruleId: null; receipt: C5BCompletionReceipt }
  | { ok: false; statusCode: 'blocked'; reasonCode: C5BReasonCode; ruleId: string; receipt: null }

export type C5BPrefixResult =
  | {
    ok: true
    statusCode: 'continue'
    reasonCode: null
    ruleId: null
    nextOperation: C5BOperation
    receipt: null
  }
  | {
    ok: true
    statusCode: 'completed'
    reasonCode: null
    ruleId: null
    nextOperation: null
    receipt: C5BCompletionReceipt
  }
  | {
    ok: false
    statusCode: 'blocked'
    reasonCode: C5BReasonCode
    ruleId: string
    nextOperation: null
    receipt: null
  }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
const CLOSED_ID = /^[a-z][a-z0-9_]{2,63}$/
const ENVIRONMENTS = new Set<C5BEnvironmentClass>(['managed_nonproduction', 'managed_production'])
const OPERATIONS = new Set<C5BOperation>(C5B_OPERATIONS)
const REASONS = new Set<C5BReasonCode>(C5B_REASON_CODES)

const PACKET_INPUT_KEYS = [
  'schemaVersion', 'policyVersion', 'attemptId', 'approvalRef', 'environmentClass', 'freezeStartsAt',
  'freezeExpiresAt', 'destinationCapabilityId', 'source', 'requirements', 'limits',
] as const
const PACKET_KEYS = [...PACKET_INPUT_KEYS, 'sourceBindingHash', 'packetHash'] as const
const SOURCE_KEYS = ['migration0018Sha256', 'migration0019Sha256', 'rollback0018Sha256', 'rollback0019Sha256'] as const
const REQUIREMENT_KEYS = ['providerRecoveryPoint', 'encryptedLogicalBackup', 'isolatedRestore', 'metadataOnlyEvidence'] as const
const LIMIT_KEYS = ['maxStepDurationMs', 'maxBackupBytes', 'maxObjectCount'] as const
const RECEIPT_INPUT_KEYS = ['operation', 'status', 'reasonCode', 'startedAt', 'completedAt', 'evidence'] as const
const RECEIPT_KEYS = [
  'schemaVersion', 'policyVersion', 'attemptId', 'packetHash', 'sequence', 'operation', 'status',
  'reasonCode', 'startedAt', 'completedAt', 'durationMs', 'evidence', 'receiptHash',
] as const

class C5BBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode
  readonly ruleId: string

  constructor(reasonCode: C5BReasonCode, ruleId: string) {
    super('C5B preflight boundary refused')
    this.name = 'C5BBoundaryError'
    this.reasonCode = reasonCode
    this.ruleId = ruleId
  }
}

function refuse(reasonCode: C5BReasonCode, ruleId: string): never {
  throw new C5BBoundaryError(reasonCode, ruleId)
}

function blocked(reasonCode: C5BReasonCode, ruleId: string): C5BCompletionResult {
  return Object.freeze({ ok: false, statusCode: 'blocked', reasonCode, ruleId, receipt: null })
}

function prefixBlocked(reasonCode: C5BReasonCode, ruleId: string): C5BPrefixResult {
  return Object.freeze({
    ok: false,
    statusCode: 'blocked',
    reasonCode,
    ruleId,
    nextOperation: null,
    receipt: null,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], reasonCode: C5BReasonCode, ruleId: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) refuse(reasonCode, ruleId)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function timestamp(value: unknown, reasonCode: C5BReasonCode, ruleId: string): asserts value is string {
  if (typeof value !== 'string') refuse(reasonCode, ruleId)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) refuse(reasonCode, ruleId)
  const year = new Date(parsed).getUTCFullYear()
  if (year < 2000 || year > 2200) refuse(reasonCode, ruleId)
}

function hash(value: unknown, reasonCode: C5BReasonCode, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !HASH.test(value)) refuse(reasonCode, ruleId)
}

function closedId(value: unknown, reasonCode: C5BReasonCode, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !CLOSED_ID.test(value)) refuse(reasonCode, ruleId)
}

function integer(value: unknown, min: number, max: number, reasonCode: C5BReasonCode, ruleId: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) refuse(reasonCode, ruleId)
}

function boolean(value: unknown, reasonCode: C5BReasonCode, ruleId: string): asserts value is boolean {
  if (typeof value !== 'boolean') refuse(reasonCode, ruleId)
}

function validateSource(value: unknown): C5BSourceBinding {
  if (!isRecord(value)) refuse('invalid_packet', 'c5b.packet.source_shape')
  exactKeys(value, SOURCE_KEYS, 'invalid_packet', 'c5b.packet.source_fields')
  for (const key of SOURCE_KEYS) hash(value[key], 'invalid_packet', `c5b.packet.source_${key}`)
  if (new Set(SOURCE_KEYS.map((key) => value[key])).size !== SOURCE_KEYS.length) {
    refuse('invalid_packet', 'c5b.packet.source_hash_reuse')
  }
  return value as unknown as C5BSourceBinding
}

function validateRequirements(value: unknown): C5BRecoveryRequirements {
  if (!isRecord(value)) refuse('invalid_packet', 'c5b.packet.requirements_shape')
  exactKeys(value, REQUIREMENT_KEYS, 'invalid_packet', 'c5b.packet.requirements_fields')
  for (const key of REQUIREMENT_KEYS) if (value[key] !== true) refuse('invalid_packet', `c5b.packet.requirement_${key}`)
  return value as unknown as C5BRecoveryRequirements
}

function validateLimits(value: unknown): C5BLimits {
  if (!isRecord(value)) refuse('invalid_packet', 'c5b.packet.limits_shape')
  exactKeys(value, LIMIT_KEYS, 'invalid_packet', 'c5b.packet.limits_fields')
  integer(value.maxStepDurationMs, 1_000, 900_000, 'invalid_packet', 'c5b.packet.max_step_duration')
  integer(value.maxBackupBytes, 1, 10_000_000_000_000, 'invalid_packet', 'c5b.packet.max_backup_bytes')
  integer(value.maxObjectCount, 1, 1_000_000, 'invalid_packet', 'c5b.packet.max_object_count')
  return value as unknown as C5BLimits
}

function validatePacketInput(value: unknown): C5BPreflightPacketInput {
  if (!isRecord(value)) refuse('invalid_packet', 'c5b.packet.shape')
  exactKeys(value, PACKET_INPUT_KEYS, 'invalid_packet', 'c5b.packet.fields')
  if (value.schemaVersion !== C5B_SCHEMA_VERSION || value.policyVersion !== C5B_POLICY_VERSION) {
    refuse('invalid_packet', 'c5b.packet.version')
  }
  if (typeof value.attemptId !== 'string' || !UUID.test(value.attemptId)) refuse('invalid_packet', 'c5b.packet.attempt_id')
  closedId(value.approvalRef, 'invalid_packet', 'c5b.packet.approval_ref')
  if (typeof value.environmentClass !== 'string' || !ENVIRONMENTS.has(value.environmentClass as C5BEnvironmentClass)) {
    refuse('invalid_packet', 'c5b.packet.environment_class')
  }
  timestamp(value.freezeStartsAt, 'freeze_window_invalid', 'c5b.packet.freeze_start')
  timestamp(value.freezeExpiresAt, 'freeze_window_invalid', 'c5b.packet.freeze_expiry')
  const windowMs = Date.parse(value.freezeExpiresAt) - Date.parse(value.freezeStartsAt)
  if (windowMs <= 0 || windowMs > 24 * 60 * 60 * 1_000) refuse('freeze_window_invalid', 'c5b.packet.freeze_window')
  closedId(value.destinationCapabilityId, 'invalid_packet', 'c5b.packet.destination_capability')
  const source = validateSource(value.source)
  const requirements = validateRequirements(value.requirements)
  const limits = validateLimits(value.limits)
  return {
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: value.attemptId,
    approvalRef: value.approvalRef,
    environmentClass: value.environmentClass as C5BEnvironmentClass,
    freezeStartsAt: value.freezeStartsAt,
    freezeExpiresAt: value.freezeExpiresAt,
    destinationCapabilityId: value.destinationCapabilityId,
    source: structuredClone(source),
    requirements: structuredClone(requirements),
    limits: structuredClone(limits),
  }
}

export function createC5BPreflightPacket(input: C5BPreflightPacketInput): C5BPreflightPacket {
  const valid = validatePacketInput(input)
  const sourceBindingHash = sha256(valid.source)
  const withoutPacketHash = { ...valid, sourceBindingHash }
  return deepFreeze({ ...withoutPacketHash, packetHash: sha256(withoutPacketHash) })
}

export function validateC5BPreflightPacket(value: unknown): C5BPreflightPacket {
  if (!isRecord(value)) refuse('invalid_packet', 'c5b.packet.shape')
  exactKeys(value, PACKET_KEYS, 'invalid_packet', 'c5b.packet.fields')
  const input = Object.fromEntries(PACKET_INPUT_KEYS.map((key) => [key, value[key]]))
  const expected = createC5BPreflightPacket(input as unknown as C5BPreflightPacketInput)
  if (value.sourceBindingHash !== expected.sourceBindingHash || value.packetHash !== expected.packetHash) {
    refuse('integrity_mismatch', 'c5b.packet.integrity')
  }
  return expected
}

function evidenceObject(value: unknown, expected: readonly string[], ruleId: string): Record<string, unknown> {
  if (!isRecord(value)) refuse('invalid_receipt', `${ruleId}_shape`)
  exactKeys(value, expected, 'invalid_receipt', `${ruleId}_fields`)
  return value
}

function validateEvidence(operation: C5BOperation, value: unknown): Record<string, unknown> {
  switch (operation) {
    case 'attest_project': {
      const evidence = evidenceObject(value, ['projectMatch', 'environmentClass', 'attestedAt'], 'c5b.evidence.project')
      boolean(evidence.projectMatch, 'invalid_receipt', 'c5b.evidence.project_match')
      if (typeof evidence.environmentClass !== 'string' || !ENVIRONMENTS.has(evidence.environmentClass as C5BEnvironmentClass)) {
        refuse('invalid_receipt', 'c5b.evidence.environment_class')
      }
      timestamp(evidence.attestedAt, 'invalid_receipt', 'c5b.evidence.attested_at')
      return evidence
    }
    case 'probe_catalog_acl': {
      const evidence = evidenceObject(value, [
        'catalogHash', 'aclHash', 'rpcHash', 'policyHash', 'extensionHash', 'migrationObjectCount', 'writerActivityCount',
      ], 'c5b.evidence.catalog')
      for (const key of ['catalogHash', 'aclHash', 'rpcHash', 'policyHash', 'extensionHash']) {
        hash(evidence[key], 'invalid_receipt', `c5b.evidence.${key}`)
      }
      integer(evidence.migrationObjectCount, 0, 1_000_000, 'invalid_receipt', 'c5b.evidence.migration_object_count')
      integer(evidence.writerActivityCount, 0, 1_000_000, 'invalid_receipt', 'c5b.evidence.writer_activity_count')
      return evidence
    }
    case 'freeze_writers': {
      const evidence = evidenceObject(value, ['freezeConfirmed', 'activeWriterCount'], 'c5b.evidence.freeze')
      boolean(evidence.freezeConfirmed, 'invalid_receipt', 'c5b.evidence.freeze_confirmed')
      integer(evidence.activeWriterCount, 0, 1_000_000, 'invalid_receipt', 'c5b.evidence.active_writer_count')
      return evidence
    }
    case 'create_provider_recovery_point': {
      const evidence = evidenceObject(value, ['recoveryPointCreated', 'recoveryPointMetadataHash', 'expiresAt'], 'c5b.evidence.recovery')
      boolean(evidence.recoveryPointCreated, 'invalid_receipt', 'c5b.evidence.recovery_created')
      hash(evidence.recoveryPointMetadataHash, 'invalid_receipt', 'c5b.evidence.recovery_hash')
      timestamp(evidence.expiresAt, 'invalid_receipt', 'c5b.evidence.recovery_expiry')
      return evidence
    }
    case 'create_encrypted_logical_backup': {
      const evidence = evidenceObject(value, ['encrypted', 'byteCount', 'backupSha256', 'manifestSha256', 'expiresAt'], 'c5b.evidence.backup')
      boolean(evidence.encrypted, 'invalid_receipt', 'c5b.evidence.backup_encrypted')
      integer(evidence.byteCount, 0, 10_000_000_000_000, 'invalid_receipt', 'c5b.evidence.backup_bytes')
      hash(evidence.backupSha256, 'invalid_receipt', 'c5b.evidence.backup_hash')
      hash(evidence.manifestSha256, 'invalid_receipt', 'c5b.evidence.backup_manifest_hash')
      timestamp(evidence.expiresAt, 'invalid_receipt', 'c5b.evidence.backup_expiry')
      return evidence
    }
    case 'restore_isolated_backup': {
      const evidence = evidenceObject(value, ['restored', 'isolated', 'sourceBackupSha256', 'restoreManifestSha256'], 'c5b.evidence.restore')
      boolean(evidence.restored, 'invalid_receipt', 'c5b.evidence.restored')
      boolean(evidence.isolated, 'invalid_receipt', 'c5b.evidence.restore_isolated')
      hash(evidence.sourceBackupSha256, 'invalid_receipt', 'c5b.evidence.restore_source_hash')
      hash(evidence.restoreManifestSha256, 'invalid_receipt', 'c5b.evidence.restore_manifest_hash')
      return evidence
    }
    case 'verify_restored_state': {
      const evidence = evidenceObject(value, [
        'catalogHash', 'aclHash', 'sourceBindingHash', 'sourceParity', 'rollbackSuitePassed',
      ], 'c5b.evidence.verify')
      hash(evidence.catalogHash, 'invalid_receipt', 'c5b.evidence.verify_catalog_hash')
      hash(evidence.aclHash, 'invalid_receipt', 'c5b.evidence.verify_acl_hash')
      hash(evidence.sourceBindingHash, 'invalid_receipt', 'c5b.evidence.verify_source_hash')
      boolean(evidence.sourceParity, 'invalid_receipt', 'c5b.evidence.source_parity')
      boolean(evidence.rollbackSuitePassed, 'invalid_receipt', 'c5b.evidence.rollback_suite')
      return evidence
    }
    case 'cleanup_isolated_restore': {
      const evidence = evidenceObject(value, ['cleanupConfirmed', 'residualResourceCount'], 'c5b.evidence.cleanup')
      boolean(evidence.cleanupConfirmed, 'invalid_receipt', 'c5b.evidence.cleanup_confirmed')
      integer(evidence.residualResourceCount, 0, 1_000_000, 'invalid_receipt', 'c5b.evidence.cleanup_residual')
      return evidence
    }
    case 'complete_preflight': {
      const evidence = evidenceObject(value, ['allStepsPassed', 'completionHash'], 'c5b.evidence.complete')
      boolean(evidence.allStepsPassed, 'invalid_receipt', 'c5b.evidence.all_steps')
      hash(evidence.completionHash, 'invalid_receipt', 'c5b.evidence.completion_hash')
      return evidence
    }
  }
}

function validateReceiptInput(value: unknown, packet: C5BPreflightPacket): C5BOperationReceiptInput {
  if (!isRecord(value)) refuse('invalid_receipt', 'c5b.receipt_input.shape')
  exactKeys(value, RECEIPT_INPUT_KEYS, 'invalid_receipt', 'c5b.receipt_input.fields')
  if (typeof value.operation !== 'string' || !OPERATIONS.has(value.operation as C5BOperation)) refuse('invalid_receipt', 'c5b.receipt.operation')
  if (value.status !== 'passed' && value.status !== 'refused') refuse('invalid_receipt', 'c5b.receipt.status')
  if (value.status === 'passed') {
    if (value.reasonCode !== null) refuse('invalid_receipt', 'c5b.receipt.passed_reason')
    validateEvidence(value.operation as C5BOperation, value.evidence)
  } else {
    if (typeof value.reasonCode !== 'string' || !REASONS.has(value.reasonCode as C5BReasonCode)) refuse('invalid_receipt', 'c5b.receipt.refused_reason')
    if (value.evidence !== null) refuse('invalid_receipt', 'c5b.receipt.refused_evidence')
  }
  timestamp(value.startedAt, 'invalid_receipt', 'c5b.receipt.started_at')
  timestamp(value.completedAt, 'invalid_receipt', 'c5b.receipt.completed_at')
  const durationMs = Date.parse(value.completedAt) - Date.parse(value.startedAt)
  if (durationMs < 0 || durationMs > packet.limits.maxStepDurationMs) refuse('invalid_receipt', 'c5b.receipt.duration')
  return {
    operation: value.operation as C5BOperation,
    status: value.status,
    reasonCode: value.reasonCode as C5BReasonCode | null,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    evidence: value.evidence === null ? null : structuredClone(value.evidence as Record<string, unknown>),
  }
}

export function createC5BOperationReceipt(packetValue: C5BPreflightPacket, inputValue: C5BOperationReceiptInput): C5BOperationReceipt {
  const packet = validateC5BPreflightPacket(packetValue)
  const input = validateReceiptInput(inputValue, packet)
  const withoutHash = {
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: packet.attemptId,
    packetHash: packet.packetHash,
    sequence: C5B_OPERATIONS.indexOf(input.operation),
    ...input,
    durationMs: Date.parse(input.completedAt) - Date.parse(input.startedAt),
  }
  return deepFreeze({ ...withoutHash, receiptHash: sha256(withoutHash) })
}

export function validateC5BOperationReceipt(value: unknown, packetValue: C5BPreflightPacket): C5BOperationReceipt {
  const packet = validateC5BPreflightPacket(packetValue)
  if (!isRecord(value)) refuse('invalid_receipt', 'c5b.receipt.shape')
  exactKeys(value, RECEIPT_KEYS, 'invalid_receipt', 'c5b.receipt.fields')
  if (value.schemaVersion !== C5B_SCHEMA_VERSION || value.policyVersion !== C5B_POLICY_VERSION) refuse('invalid_receipt', 'c5b.receipt.version')
  if (value.attemptId !== packet.attemptId || value.packetHash !== packet.packetHash) refuse('integrity_mismatch', 'c5b.receipt.packet_binding')
  const input = Object.fromEntries(RECEIPT_INPUT_KEYS.map((key) => [key, value[key]]))
  const expected = createC5BOperationReceipt(packet, input as unknown as C5BOperationReceiptInput)
  if (value.sequence !== expected.sequence || value.durationMs !== expected.durationMs) refuse('invalid_receipt', 'c5b.receipt.derived_fields')
  if (value.receiptHash !== expected.receiptHash) refuse('integrity_mismatch', 'c5b.receipt.hash')
  return expected
}

export function computeC5BCompletionHash(packetValue: C5BPreflightPacket, receiptValues: readonly C5BOperationReceipt[]): string {
  const packet = validateC5BPreflightPacket(packetValue)
  if (!Array.isArray(receiptValues) || receiptValues.length !== C5B_OPERATIONS.length - 1) {
    refuse('operation_sequence_invalid', 'c5b.completion_hash.receipt_count')
  }
  const receipts = receiptValues.map((value, index) => {
    const receipt = validateC5BOperationReceipt(value, packet)
    if (receipt.operation !== C5B_OPERATIONS[index] || receipt.sequence !== index || receipt.status !== 'passed') {
      refuse('operation_sequence_invalid', 'c5b.completion_hash.sequence')
    }
    return receipt
  })
  return sha256({ packetHash: packet.packetHash, receiptHashes: receipts.map((receipt) => receipt.receiptHash) })
}

function evidence(receipt: C5BOperationReceipt): Record<string, unknown> {
  if (receipt.evidence === null) refuse('invalid_receipt', 'c5b.completion.missing_evidence')
  return receipt.evidence
}

function asString(value: unknown): string {
  if (typeof value !== 'string') refuse('invalid_receipt', 'c5b.completion.string_evidence')
  return value
}

function buildCompletionReceipt(packet: C5BPreflightPacket, receipts: C5BOperationReceipt[]): C5BCompletionReceipt {
  const probe = evidence(receipts[1])
  const recovery = evidence(receipts[3])
  const backup = evidence(receipts[4])
  const restore = evidence(receipts[5])
  const cleanup = evidence(receipts[7])
  const finalEvidence = evidence(receipts[8])
  const recoveryExpiry = asString(recovery.expiresAt)
  const backupExpiry = asString(backup.expiresAt)
  const artifactsExpireAt = Date.parse(recoveryExpiry) <= Date.parse(backupExpiry) ? recoveryExpiry : backupExpiry
  const withoutReceiptHash = {
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: packet.attemptId,
    packetHash: packet.packetHash,
    environmentClass: packet.environmentClass,
    sourceBindingHash: packet.sourceBindingHash,
    catalogHash: asString(probe.catalogHash),
    aclHash: asString(probe.aclHash),
    recoveryPointMetadataHash: asString(recovery.recoveryPointMetadataHash),
    backupSha256: asString(backup.backupSha256),
    restoreManifestSha256: asString(restore.restoreManifestSha256),
    freezeExpiresAt: packet.freezeExpiresAt,
    artifactsExpireAt,
    completedAt: receipts[8].completedAt,
    residualResourceCount: cleanup.residualResourceCount as 0,
    completionHash: asString(finalEvidence.completionHash),
  }
  return deepFreeze({ ...withoutReceiptHash, receiptHash: sha256(withoutReceiptHash) })
}

function validateC5BReceiptPrefix(
  packet: C5BPreflightPacket,
  receiptValues: unknown[],
): C5BOperationReceipt[] | C5BPrefixResult {
  if (receiptValues.length > C5B_OPERATIONS.length) {
    return prefixBlocked('operation_sequence_invalid', 'c5b.completion.receipt_count')
  }

  const receipts: C5BOperationReceipt[] = []
  let previousCompletedAt: string | null = null
  for (let index = 0; index < receiptValues.length; index += 1) {
    let receipt: C5BOperationReceipt
    try {
      receipt = validateC5BOperationReceipt(receiptValues[index], packet)
    } catch (error) {
      return prefixBlocked(
        error instanceof C5BBoundaryError ? error.reasonCode : 'invalid_receipt',
        `c5b.completion.receipt_${index}`,
      )
    }
    if (receipt.sequence !== index || receipt.operation !== C5B_OPERATIONS[index]) {
      return prefixBlocked('operation_sequence_invalid', `c5b.completion.operation_${index}`)
    }
    if (receipt.status !== 'passed') {
      return prefixBlocked(receipt.reasonCode ?? 'operation_refused', `c5b.completion.refused_${index}`)
    }
    if (Date.parse(receipt.startedAt) < Date.parse(packet.freezeStartsAt)
      || Date.parse(receipt.completedAt) > Date.parse(packet.freezeExpiresAt)
      || (previousCompletedAt !== null && Date.parse(receipt.startedAt) < Date.parse(previousCompletedAt))) {
      return prefixBlocked('freeze_window_invalid', `c5b.completion.window_${index}`)
    }
    receipts.push(receipt)
    previousCompletedAt = receipt.completedAt
  }

  if (receipts.length >= 1) {
    const project = evidence(receipts[0])
    if (project.projectMatch !== true || project.environmentClass !== packet.environmentClass) {
      return prefixBlocked('project_mismatch', 'c5b.completion.project_match')
    }
    const attestedAt = Date.parse(asString(project.attestedAt))
    if (attestedAt < Date.parse(receipts[0].startedAt)
      || attestedAt > Date.parse(receipts[0].completedAt)
      || attestedAt < Date.parse(packet.freezeStartsAt)
      || attestedAt > Date.parse(packet.freezeExpiresAt)) {
      return prefixBlocked('freeze_window_invalid', 'c5b.completion.project_attested_at')
    }
  }
  if (receipts.length >= 2) {
    const probe = evidence(receipts[1])
    if ((probe.migrationObjectCount as number) > packet.limits.maxObjectCount) {
      return prefixBlocked('restored_state_mismatch', 'c5b.completion.object_bound')
    }
  }
  if (receipts.length >= 3) {
    const freeze = evidence(receipts[2])
    if (freeze.freezeConfirmed !== true || freeze.activeWriterCount !== 0) {
      return prefixBlocked('writer_activity_detected', 'c5b.completion.writer_freeze')
    }
  }
  const observedAt = receipts.at(-1)?.completedAt ?? packet.freezeStartsAt
  if (receipts.length >= 4) {
    const recovery = evidence(receipts[3])
    if (recovery.recoveryPointCreated !== true || Date.parse(asString(recovery.expiresAt)) <= Date.parse(observedAt)) {
      return prefixBlocked('recovery_point_unavailable', 'c5b.completion.recovery_point')
    }
  }
  if (receipts.length >= 5) {
    const backup = evidence(receipts[4])
    if (backup.encrypted !== true || typeof backup.byteCount !== 'number' || backup.byteCount <= 0
      || backup.byteCount > packet.limits.maxBackupBytes
      || Date.parse(asString(backup.expiresAt)) <= Date.parse(observedAt)) {
      return prefixBlocked('logical_backup_invalid', 'c5b.completion.logical_backup')
    }
  }
  if (receipts.length >= 6) {
    const backup = evidence(receipts[4])
    const restore = evidence(receipts[5])
    if (restore.restored !== true || restore.isolated !== true
      || restore.sourceBackupSha256 !== backup.backupSha256
      || restore.restoreManifestSha256 !== backup.manifestSha256) {
      return prefixBlocked('restore_invalid', 'c5b.completion.restore')
    }
  }
  if (receipts.length >= 7) {
    const probe = evidence(receipts[1])
    const verify = evidence(receipts[6])
    if (verify.catalogHash !== probe.catalogHash || verify.aclHash !== probe.aclHash
      || verify.sourceBindingHash !== packet.sourceBindingHash
      || verify.sourceParity !== true || verify.rollbackSuitePassed !== true) {
      return prefixBlocked('restored_state_mismatch', 'c5b.completion.restored_state')
    }
  }
  if (receipts.length >= 8) {
    const cleanup = evidence(receipts[7])
    if (cleanup.cleanupConfirmed !== true || cleanup.residualResourceCount !== 0) {
      return prefixBlocked('cleanup_incomplete', 'c5b.completion.cleanup')
    }
  }
  if (receipts.length === C5B_OPERATIONS.length) {
    let expectedCompletionHash: string
    try {
      expectedCompletionHash = computeC5BCompletionHash(packet, receipts.slice(0, 8))
    } catch {
      return prefixBlocked('integrity_mismatch', 'c5b.completion.hash_input')
    }
    const finalEvidence = evidence(receipts[8])
    if (finalEvidence.allStepsPassed !== true || finalEvidence.completionHash !== expectedCompletionHash) {
      return prefixBlocked('integrity_mismatch', 'c5b.completion.final_hash')
    }
  }
  return receipts
}

export function evaluateC5BPreflightPrefix(packetValue: unknown, receiptValues: unknown): C5BPrefixResult {
  let packet: C5BPreflightPacket
  try {
    packet = validateC5BPreflightPacket(packetValue)
  } catch (error) {
    return prefixBlocked(
      error instanceof C5BBoundaryError ? error.reasonCode : 'invalid_packet',
      'c5b.completion.packet_refused',
    )
  }
  if (!Array.isArray(receiptValues)) {
    return prefixBlocked('operation_sequence_invalid', 'c5b.completion.receipt_count')
  }

  const reduced = validateC5BReceiptPrefix(packet, receiptValues)
  if (!Array.isArray(reduced)) return reduced
  if (reduced.length < C5B_OPERATIONS.length) {
    return Object.freeze({
      ok: true,
      statusCode: 'continue',
      reasonCode: null,
      ruleId: null,
      nextOperation: C5B_OPERATIONS[reduced.length],
      receipt: null,
    })
  }
  return Object.freeze({
    ok: true,
    statusCode: 'completed',
    reasonCode: null,
    ruleId: null,
    nextOperation: null,
    receipt: buildCompletionReceipt(packet, reduced),
  })
}

export function evaluateC5BPreflight(packetValue: unknown, receiptValues: unknown): C5BCompletionResult {
  const result = evaluateC5BPreflightPrefix(packetValue, receiptValues)
  if (!result.ok) return blocked(result.reasonCode, result.ruleId)
  if (result.statusCode !== 'completed') return blocked('operation_sequence_invalid', 'c5b.completion.receipt_count')
  return Object.freeze({ ok: true, statusCode: 'completed', reasonCode: null, ruleId: null, receipt: result.receipt })
}
