import { createHash } from 'node:crypto'

export const PRIVACY_POLICY_SCHEMA_VERSION = 1 as const
export const PRIVACY_POLICY_VERSION = 'p17-016-v1' as const

export const DATA_CLASSES = [
  'D0_public_contract',
  'D1_opaque_operational',
  'D2_sensitive_metadata',
  'D3_private_content',
  'D4_secret',
] as const

export const PROCESSING_SCOPES = [
  'essential_operations',
  'learning_metrics',
  'content_indexing',
  'cross_provider_evaluation',
  'diagnostic_content',
] as const

export const RETENTION_PROFILES = [
  'central_content',
  'short_lived',
  'standard',
  'learning_aggregate',
  'audit_release',
] as const

export const CENTRAL_FAMILIES = [
  'command_run',
  'token_usage',
  'progress',
  'verification',
  'install_run',
  'error_signal',
  'learning_aggregate',
  'release_dossier',
] as const

export const LEGACY_STATES = [
  'current',
  'legacy_unclassified',
  'legacy_mapped',
  'legacy_rejected',
  'purge_pending',
  'purged',
] as const

export const PRIVACY_REJECTION_REASONS = [
  'malformed_envelope',
  'unknown_fields',
  'untrusted_tenant_context',
  'processing_scope_disabled',
  'prohibited_content',
  'suspected_secret',
  'invalid_opaque_identifier',
  'invalid_timestamp',
  'invalid_retention_profile',
  'retention_extension_attempted',
  'invalid_field',
  'integrity_mismatch',
] as const

export type DataClass = (typeof DATA_CLASSES)[number]
export type ProcessingScope = (typeof PROCESSING_SCOPES)[number]
export type RetentionProfile = (typeof RETENTION_PROFILES)[number]
export type CentralFamily = (typeof CENTRAL_FAMILIES)[number]
export type LegacyState = (typeof LEGACY_STATES)[number]
export type PrivacyRejectionReason = (typeof PRIVACY_REJECTION_REASONS)[number]
export type TenantContextSource = 'server_session' | 'worker_credential'
export type GrantDecision = 'granted' | 'denied'

export interface TrustedTenantContext {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  tenantId: string
  subjectId: string
  sourceKind: TenantContextSource
  credentialBindingId: string
  policyVersion: typeof PRIVACY_POLICY_VERSION
}

export interface ProcessingGrant {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  tenantId: string
  subjectId: string
  scope: ProcessingScope
  policyVersion: typeof PRIVACY_POLICY_VERSION
  decision: GrantDecision
  purposeCode: string
  issuedAt: string
  expiresAt: string
  revokedAt: string | null
}

export interface ClockPort {
  now(): string
}

export interface OpaqueIdentifierResult {
  opaqueId: string
  keyVersion: string
}

export interface OpaqueIdentifierPort {
  create(input: { tenantId: string; namespace: 'repository'; localIdentifier: string }): OpaqueIdentifierResult
}

export interface TenantContextProvider {
  resolve(): TrustedTenantContext
}

export interface CentralRecord {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  tenantId: string
  family: CentralFamily
  processingScope: ProcessingScope
  retentionProfile: Exclude<RetentionProfile, 'central_content'>
  recordedAt: string
  expiresAt: string
  data: Record<string, unknown>
  recordHash: string
}

export type PrivacyEvaluation =
  | { allowed: true; reasonCode: null; ruleId: 'privacy.allowlist.accepted'; record: CentralRecord }
  | { allowed: false; reasonCode: PrivacyRejectionReason; ruleId: string; record: null }

export interface DeletionStoreResult {
  storeId: string
  affectedCount: number
  outcomeCode: 'deleted' | 'not_found' | 'failed_retryable' | 'failed_terminal'
}

export interface DeletionReceipt {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  tenantId: string
  requestId: string
  requestedAt: string
  completedAt: string | null
  storeResults: DeletionStoreResult[]
  outcomeCode: 'completed' | 'partial_retryable' | 'failed_retryable' | 'failed_terminal'
  retry: number
  receiptHash: string
}

export interface LegacyDisposition {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  policyVersion: typeof PRIVACY_POLICY_VERSION
  legacyId: string
  tenantId: string | null
  state: 'legacy_unclassified' | 'legacy_mapped' | 'legacy_rejected'
  eligibleForMigration: boolean
  tenantVisible: false
  purgeBy: string | null
  observedAt: string
}

export class PrivacyPolicyError extends Error {
  readonly reasonCode: PrivacyRejectionReason
  readonly ruleId: string

  constructor(reasonCode: PrivacyRejectionReason, ruleId: string) {
    super(`privacy policy rejected: ${reasonCode}`)
    this.name = 'PrivacyPolicyError'
    this.reasonCode = reasonCode
    this.ruleId = ruleId
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
const OPAQUE_ID = /^hmac_[0-9a-f]{64}$/
const CLOSED_CODE = /^[a-z][a-z0-9_]{0,63}$/
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/
const SAFE_LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_PROVIDER_EXECUTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const TASK_ID = /^P17-\d{3}$/
const PHASE_ID = /^(B(0(\.5)?|1|2|3|4|5|6(\.5)?|7|8(\.[56])?|9(\.[56])?|10(\.5)?|11|12(\.[568])?)|D(0(\.5)?|1(\.5)?|cross-2))$/
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/
const SECRET_MARKER = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]|\b(?:bearer|basic)\s+[A-Za-z0-9+/_=.-]{8,})/i
const TOKEN_SHAPE = /^(?:sk|ghp|github_pat|glpat|xox[baprs])[-_][A-Za-z0-9_-]{16,}$/i
const ENTROPY_EXEMPT_FIELDS = new Set([
  'tenantId', 'subjectId', 'credentialBindingId', 'runId', 'commandRunId', 'machineId',
  'tokenSubjectId', 'requestId', 'legacyId', 'repoOpaqueId', 'contentHash', 'eventHash',
  'evidenceHash', 'inputHash', 'verdictHash', 'recordHash', 'receiptHash',
])

const CONTEXT_KEYS = ['schemaVersion', 'tenantId', 'subjectId', 'sourceKind', 'credentialBindingId', 'policyVersion'] as const
const GRANT_KEYS = ['schemaVersion', 'tenantId', 'subjectId', 'scope', 'policyVersion', 'decision', 'purposeCode', 'issuedAt', 'expiresAt', 'revokedAt'] as const
const RECORD_KEYS = ['schemaVersion', 'policyVersion', 'tenantId', 'family', 'processingScope', 'retentionProfile', 'recordedAt', 'expiresAt', 'data', 'recordHash'] as const
const RECEIPT_KEYS = ['schemaVersion', 'policyVersion', 'tenantId', 'requestId', 'requestedAt', 'completedAt', 'storeResults', 'outcomeCode', 'retry', 'receiptHash'] as const
const RECEIPT_INPUT_KEYS = ['tenantId', 'requestId', 'requestedAt', 'completedAt', 'storeResults', 'outcomeCode', 'retry'] as const
const STORE_RESULT_KEYS = ['storeId', 'affectedCount', 'outcomeCode'] as const
const LEGACY_INPUT_KEYS = ['legacyId', 'mappingTenantId', 'sanitizerPassed', 'observedAt'] as const
const LEGACY_KEYS = ['schemaVersion', 'policyVersion', 'legacyId', 'tenantId', 'state', 'eligibleForMigration', 'tenantVisible', 'purgeBy', 'observedAt'] as const

const PAYLOAD_KEYS: Record<CentralFamily, readonly string[]> = {
  command_run: ['runId', 'repoLocalId', 'commandCode', 'runnerCode', 'modelCode', 'statusCode', 'reasonCode', 'kitVersion', 'startedAt', 'completedAt', 'durationMs', 'exitCode'],
  token_usage: ['runId', 'promptTokens', 'completionTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costMicros', 'modelCode', 'pricingVersion', 'pricingStatus', 'observedAt'],
  progress: ['taskId', 'commandRunId', 'machineId', 'providerExecutionId', 'attempt', 'state', 'phaseId', 'reasonCode', 'eventHash', 'evidenceHash', 'evidenceMediaType', 'evidenceBytes', 'verificationStatus', 'occurredAt'],
  verification: ['runId', 'repoLocalId', 'contentHash', 'kitVersion', 'verified', 'tierExitCodes', 'observedAt'],
  install_run: ['repoLocalId', 'eventCode', 'kitVersion', 'observedAt'],
  error_signal: ['runId', 'tokenSubjectId', 'errorType', 'phaseId', 'reasonCode', 'kitVersion', 'occurredAt'],
  learning_aggregate: ['lessonCode', 'metricCode', 'count', 'ratePpm', 'evidenceHash', 'bucketStart'],
  release_dossier: ['version', 'inputHash', 'verdictHash', 'runCount', 'passedCount', 'recommendationCode', 'canaryStatus', 'lessonCodes', 'createdAt'],
}

const OUTPUT_DATA_KEYS: Record<CentralFamily, readonly string[]> = {
  command_run: ['runId', 'repoOpaqueId', 'opaqueKeyVersion', 'commandCode', 'runnerCode', 'modelCode', 'statusCode', 'reasonCode', 'kitVersion', 'startedAt', 'completedAt', 'durationMs', 'exitCode'],
  token_usage: PAYLOAD_KEYS.token_usage,
  progress: [...PAYLOAD_KEYS.progress, 'retentionClass'],
  verification: ['runId', 'repoOpaqueId', 'opaqueKeyVersion', 'contentHash', 'kitVersion', 'verified', 'tierExitCodes', 'observedAt'],
  install_run: ['repoOpaqueId', 'opaqueKeyVersion', 'eventCode', 'kitVersion', 'observedAt'],
  error_signal: PAYLOAD_KEYS.error_signal,
  learning_aggregate: PAYLOAD_KEYS.learning_aggregate,
  release_dossier: PAYLOAD_KEYS.release_dossier,
}

const SCOPES = new Set<ProcessingScope>(PROCESSING_SCOPES)
const FAMILIES = new Set<CentralFamily>(CENTRAL_FAMILIES)
const RETENTIONS = new Set<RetentionProfile>(RETENTION_PROFILES)
const SOURCES = new Set<TenantContextSource>(['server_session', 'worker_credential'])
const COMMANDS = new Set(['feature_from_confluence', 'new_feature', 'drop_mock', 'api_contract', 'playwright_verify', 'codex_review', 'prompt', 'execute_roadmap_phase'])
const RUNNERS = new Set(['codex', 'claude', 'copilot', 'gemini', 'grok', 'local'])
const RUN_STATES = new Set(['queued', 'running', 'awaiting_input', 'awaiting_approval', 'passed', 'failed', 'cancelled', 'tracking_failed'])
const PRICING_STATUSES = new Set(['current', 'stale', 'unavailable'])
const INSTALL_RUN_EVENTS = new Set(['installed', 'ran'])
const VERIFICATION_STATUSES = new Set(['verified', 'quarantined', 'unavailable'])
const EVIDENCE_MEDIA_TYPES = new Set(['application/json', 'text/markdown', 'image/png', 'image/jpeg', 'application/zip'])
const ERROR_TYPES = new Set(['validation', 'provider', 'verification', 'transport', 'persistence', 'authorization', 'privacy'])
const RECOMMENDATIONS = new Set(['release', 'hold', 'reject'])
const CANARY_STATUSES = new Set(['not_run', 'passed', 'failed'])

const RETENTION_MS: Record<Exclude<RetentionProfile, 'central_content'>, number> = {
  short_lived: 24 * 60 * 60 * 1000,
  standard: 30 * 24 * 60 * 60 * 1000,
  learning_aggregate: 180 * 24 * 60 * 60 * 1000,
  audit_release: 365 * 24 * 60 * 60 * 1000,
}

function reject(reasonCode: PrivacyRejectionReason, ruleId: string): never {
  throw new PrivacyPolicyError(reasonCode, ruleId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], ruleId: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    reject('unknown_fields', ruleId)
  }
}

function assertUuid(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) reject('invalid_field', ruleId)
}

function assertHash(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !HASH.test(value)) reject('invalid_field', ruleId)
}

function assertClosedCode(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !CLOSED_CODE.test(value)) reject('invalid_field', ruleId)
}

function assertVersion(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_VERSION.test(value)) reject('invalid_field', ruleId)
}

function assertTimestamp(value: unknown, ruleId: string): asserts value is string {
  if (typeof value !== 'string') reject('invalid_timestamp', ruleId)
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) reject('invalid_timestamp', ruleId)
  const year = new Date(parsed).getUTCFullYear()
  if (year < 2000 || year > 2200) reject('invalid_timestamp', ruleId)
}

function assertNullableTimestamp(value: unknown, ruleId: string): asserts value is string | null {
  if (value === null) return
  assertTimestamp(value, ruleId)
}

function assertNullableInteger(value: unknown, min: number, max: number, ruleId: string): asserts value is number | null {
  if (value === null) return
  assertInteger(value, min, max, ruleId)
}

function assertInteger(value: unknown, min: number, max: number, ruleId: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) reject('invalid_field', ruleId)
}

function assertEnum(value: unknown, choices: ReadonlySet<string>, ruleId: string): asserts value is string {
  if (typeof value !== 'string' || !choices.has(value)) reject('invalid_field', ruleId)
}

function assertBoolean(value: unknown, ruleId: string): asserts value is boolean {
  if (typeof value !== 'boolean') reject('invalid_field', ruleId)
}

function scanString(value: string, key: string): void {
  if (CONTROL_OR_BIDI.test(value)) reject('prohibited_content', 'content.control_or_bidi')
  const decoded: string[] = [value]
  let current = value
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(current)
      if (next === current) break
      decoded.push(next)
      current = next
    } catch {
      break
    }
  }
  if (/^[A-Za-z0-9+/]{24,}={0,2}$/.test(value) && value.length % 4 === 0) {
    try { decoded.push(Buffer.from(value, 'base64').toString('utf8')) } catch { /* closed checks continue */ }
  }
  if (decoded.some((candidate) => SECRET_MARKER.test(candidate) || TOKEN_SHAPE.test(candidate))) {
    reject('suspected_secret', 'content.secret_marker')
  }
  const entropyExempt = ENTROPY_EXEMPT_FIELDS.has(key)
  if (!entropyExempt && value.length >= 32 && /^[A-Za-z0-9+/_=-]+$/.test(value) && new Set(value).size >= 12) {
    reject('suspected_secret', 'content.high_entropy')
  }
}

function scanValue(value: unknown, key: string): void {
  if (typeof value === 'string') scanString(value, key)
  else if (Array.isArray(value)) value.forEach((entry) => scanValue(entry, key))
  else if (value !== null && typeof value === 'object') reject('prohibited_content', 'content.nested_object')
}

function scanPayload(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) scanValue(value, key)
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function assertOpaqueResult(value: unknown): OpaqueIdentifierResult {
  if (!isRecord(value)) reject('invalid_opaque_identifier', 'opaque.result_shape')
  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'keyVersion' || keys[1] !== 'opaqueId') {
    reject('invalid_opaque_identifier', 'opaque.result_fields')
  }
  if (typeof value.opaqueId !== 'string' || !OPAQUE_ID.test(value.opaqueId)) reject('invalid_opaque_identifier', 'opaque.id')
  if (typeof value.keyVersion !== 'string' || !CLOSED_CODE.test(value.keyVersion)) reject('invalid_opaque_identifier', 'opaque.key_version')
  return { opaqueId: value.opaqueId, keyVersion: value.keyVersion }
}

function opaqueRepository(payload: Record<string, unknown>, context: TrustedTenantContext, port: OpaqueIdentifierPort): OpaqueIdentifierResult {
  if (typeof payload.repoLocalId !== 'string' || !SAFE_LOCAL_ID.test(payload.repoLocalId)) {
    reject('invalid_field', 'repository.local_identifier')
  }
  return assertOpaqueResult(port.create({ tenantId: context.tenantId, namespace: 'repository', localIdentifier: payload.repoLocalId }))
}

export function validateTrustedTenantContext(value: unknown): TrustedTenantContext {
  if (!isRecord(value)) reject('malformed_envelope', 'tenant.context_shape')
  exactKeys(value, CONTEXT_KEYS, 'tenant.context_fields')
  if (value.schemaVersion !== PRIVACY_POLICY_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) {
    reject('untrusted_tenant_context', 'tenant.policy_version')
  }
  assertUuid(value.tenantId, 'tenant.tenant_id')
  assertUuid(value.subjectId, 'tenant.subject_id')
  assertEnum(value.sourceKind, SOURCES, 'tenant.source_kind')
  assertUuid(value.credentialBindingId, 'tenant.credential_binding_id')
  return value as unknown as TrustedTenantContext
}

export function validateProcessingGrant(value: unknown): ProcessingGrant {
  if (!isRecord(value)) reject('malformed_envelope', 'consent.grant_shape')
  exactKeys(value, GRANT_KEYS, 'consent.grant_fields')
  if (value.schemaVersion !== PRIVACY_POLICY_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) {
    reject('processing_scope_disabled', 'consent.policy_version')
  }
  assertUuid(value.tenantId, 'consent.tenant_id')
  assertUuid(value.subjectId, 'consent.subject_id')
  assertEnum(value.scope, SCOPES, 'consent.scope')
  assertEnum(value.decision, new Set(['granted', 'denied']), 'consent.decision')
  assertClosedCode(value.purposeCode, 'consent.purpose_code')
  assertTimestamp(value.issuedAt, 'consent.issued_at')
  assertTimestamp(value.expiresAt, 'consent.expires_at')
  assertNullableTimestamp(value.revokedAt, 'consent.revoked_at')
  if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) reject('processing_scope_disabled', 'consent.invalid_window')
  if (value.revokedAt !== null && Date.parse(value.revokedAt) < Date.parse(value.issuedAt)) reject('processing_scope_disabled', 'consent.invalid_revocation')
  return value as unknown as ProcessingGrant
}

export function evaluateProcessingGrant(
  contextValue: unknown,
  requiredScope: ProcessingScope,
  grantValue: unknown,
  nowValue: string,
): { allowed: true; grant: ProcessingGrant } | { allowed: false; reasonCode: 'processing_scope_disabled'; ruleId: string } {
  const context = validateTrustedTenantContext(contextValue)
  if (!SCOPES.has(requiredScope)) reject('processing_scope_disabled', 'consent.required_scope')
  assertTimestamp(nowValue, 'consent.evaluation_time')
  if (grantValue === null || grantValue === undefined) return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.grant_missing' }
  const grant = validateProcessingGrant(grantValue)
  if (grant.tenantId !== context.tenantId || grant.subjectId !== context.subjectId) {
    return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.subject_mismatch' }
  }
  if (grant.scope !== requiredScope) return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.scope_mismatch' }
  if (grant.decision !== 'granted') return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.denied' }
  if (grant.revokedAt !== null && Date.parse(grant.revokedAt) <= Date.parse(nowValue)) {
    return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.revoked' }
  }
  if (Date.parse(grant.issuedAt) > Date.parse(nowValue) || Date.parse(grant.expiresAt) <= Date.parse(nowValue)) {
    return { allowed: false, reasonCode: 'processing_scope_disabled', ruleId: 'consent.inactive' }
  }
  return { allowed: true, grant }
}

function requiredScope(family: CentralFamily): ProcessingScope {
  return family === 'learning_aggregate' ? 'learning_metrics' : 'essential_operations'
}

function retentionFor(family: CentralFamily, purposeCode: string): Exclude<RetentionProfile, 'central_content'> {
  if (family === 'learning_aggregate') return 'learning_aggregate'
  if (family === 'release_dossier') return 'audit_release'
  if (family === 'progress' && purposeCode === 'disposable_canary') return 'short_lived'
  return 'standard'
}

export function computeRetentionExpiry(profile: RetentionProfile, recordedAt: string): string {
  assertTimestamp(recordedAt, 'retention.recorded_at')
  if (!RETENTIONS.has(profile)) reject('invalid_retention_profile', 'retention.profile')
  if (profile === 'central_content') reject('prohibited_content', 'retention.central_content')
  return new Date(Date.parse(recordedAt) + RETENTION_MS[profile]).toISOString()
}

function validateCommonPayload(family: CentralFamily, payloadValue: unknown): Record<string, unknown> {
  if (!isRecord(payloadValue)) reject('malformed_envelope', `payload.${family}.shape`)
  exactKeys(payloadValue, PAYLOAD_KEYS[family], `payload.${family}.fields`)
  scanPayload(payloadValue)
  return payloadValue
}

function buildFamilyData(
  family: CentralFamily,
  payload: Record<string, unknown>,
  context: TrustedTenantContext,
  opaquePort: OpaqueIdentifierPort,
  retentionProfile: Exclude<RetentionProfile, 'central_content'>,
): Record<string, unknown> {
  if (family === 'command_run') {
    assertUuid(payload.runId, 'command.run_id')
    const repo = opaqueRepository(payload, context, opaquePort)
    assertEnum(payload.commandCode, COMMANDS, 'command.command_code')
    assertEnum(payload.runnerCode, RUNNERS, 'command.runner_code')
    assertVersion(payload.modelCode, 'command.model_code')
    assertEnum(payload.statusCode, RUN_STATES, 'command.status_code')
    assertClosedCode(payload.reasonCode, 'command.reason_code')
    assertVersion(payload.kitVersion, 'command.kit_version')
    assertTimestamp(payload.startedAt, 'command.started_at')
    assertNullableTimestamp(payload.completedAt, 'command.completed_at')
    assertInteger(payload.durationMs, 0, 7 * 24 * 60 * 60 * 1000, 'command.duration_ms')
    assertInteger(payload.exitCode, -255, 255, 'command.exit_code')
    return { runId: payload.runId, repoOpaqueId: repo.opaqueId, opaqueKeyVersion: repo.keyVersion, commandCode: payload.commandCode, runnerCode: payload.runnerCode, modelCode: payload.modelCode, statusCode: payload.statusCode, reasonCode: payload.reasonCode, kitVersion: payload.kitVersion, startedAt: payload.startedAt, completedAt: payload.completedAt, durationMs: payload.durationMs, exitCode: payload.exitCode }
  }
  if (family === 'token_usage') {
    assertUuid(payload.runId, 'usage.run_id')
    for (const key of ['promptTokens', 'completionTokens', 'cacheReadTokens', 'cacheWriteTokens']) assertInteger(payload[key], 0, 1_000_000_000_000, `usage.${key}`)
    assertNullableInteger(payload.costMicros, 0, 1_000_000_000_000, 'usage.costMicros')
    assertVersion(payload.modelCode, 'usage.model_code')
    if (payload.pricingVersion !== null) assertVersion(payload.pricingVersion, 'usage.pricing_version')
    assertEnum(payload.pricingStatus, PRICING_STATUSES, 'usage.pricing_status')
    const unavailable = payload.pricingStatus === 'unavailable'
    if (unavailable
      ? payload.costMicros !== null || payload.pricingVersion !== null
      : payload.costMicros === null || payload.pricingVersion === null) reject('invalid_field', 'usage.pricing_pair')
    assertTimestamp(payload.observedAt, 'usage.observed_at')
    return { ...payload }
  }
  if (family === 'progress') {
    if (typeof payload.taskId !== 'string' || !TASK_ID.test(payload.taskId)) reject('invalid_field', 'progress.task_id')
    assertUuid(payload.commandRunId, 'progress.command_run_id')
    assertUuid(payload.machineId, 'progress.machine_id')
    if (payload.providerExecutionId !== null && (typeof payload.providerExecutionId !== 'string' || !SAFE_PROVIDER_EXECUTION_ID.test(payload.providerExecutionId))) reject('invalid_field', 'progress.provider_execution_id')
    assertInteger(payload.attempt, 1, 50, 'progress.attempt')
    assertEnum(payload.state, RUN_STATES, 'progress.state')
    if (payload.phaseId !== null && (typeof payload.phaseId !== 'string' || !PHASE_ID.test(payload.phaseId))) reject('invalid_field', 'progress.phase_id')
    assertClosedCode(payload.reasonCode, 'progress.reason_code')
    assertHash(payload.eventHash, 'progress.event_hash')
    if (payload.evidenceHash !== null) assertHash(payload.evidenceHash, 'progress.evidence_hash')
    if (payload.evidenceMediaType !== null) assertEnum(payload.evidenceMediaType, EVIDENCE_MEDIA_TYPES, 'progress.evidence_media_type')
    if (payload.evidenceBytes !== null) assertInteger(payload.evidenceBytes, 0, 100 * 1024 * 1024, 'progress.evidence_bytes')
    assertEnum(payload.verificationStatus, VERIFICATION_STATUSES, 'progress.verification_status')
    assertTimestamp(payload.occurredAt, 'progress.occurred_at')
    return { ...payload, retentionClass: retentionProfile }
  }
  if (family === 'verification') {
    assertUuid(payload.runId, 'verification.run_id')
    const repo = opaqueRepository(payload, context, opaquePort)
    assertHash(payload.contentHash, 'verification.content_hash')
    assertVersion(payload.kitVersion, 'verification.kit_version')
    assertBoolean(payload.verified, 'verification.verified')
    if (!Array.isArray(payload.tierExitCodes) || payload.tierExitCodes.length > 16) reject('invalid_field', 'verification.tier_exit_codes')
    payload.tierExitCodes.forEach((value) => assertInteger(value, -255, 255, 'verification.tier_exit_code'))
    assertTimestamp(payload.observedAt, 'verification.observed_at')
    return { runId: payload.runId, repoOpaqueId: repo.opaqueId, opaqueKeyVersion: repo.keyVersion, contentHash: payload.contentHash, kitVersion: payload.kitVersion, verified: payload.verified, tierExitCodes: [...payload.tierExitCodes], observedAt: payload.observedAt }
  }
  if (family === 'install_run') {
    const repo = opaqueRepository(payload, context, opaquePort)
    assertEnum(payload.eventCode, INSTALL_RUN_EVENTS, 'install.event_code')
    assertVersion(payload.kitVersion, 'install.kit_version')
    assertTimestamp(payload.observedAt, 'install.observed_at')
    return { repoOpaqueId: repo.opaqueId, opaqueKeyVersion: repo.keyVersion, eventCode: payload.eventCode, kitVersion: payload.kitVersion, observedAt: payload.observedAt }
  }
  if (family === 'error_signal') {
    if (payload.runId !== null) assertUuid(payload.runId, 'error.run_id')
    if (payload.tokenSubjectId !== null) assertUuid(payload.tokenSubjectId, 'error.token_subject_id')
    if (payload.runId === null && payload.tokenSubjectId === null) reject('invalid_field', 'error.subject_required')
    assertEnum(payload.errorType, ERROR_TYPES, 'error.error_type')
    if (payload.phaseId !== null && (typeof payload.phaseId !== 'string' || !PHASE_ID.test(payload.phaseId))) reject('invalid_field', 'error.phase_id')
    assertClosedCode(payload.reasonCode, 'error.reason_code')
    assertVersion(payload.kitVersion, 'error.kit_version')
    assertTimestamp(payload.occurredAt, 'error.occurred_at')
    return { ...payload }
  }
  if (family === 'learning_aggregate') {
    assertClosedCode(payload.lessonCode, 'learning.lesson_code')
    assertClosedCode(payload.metricCode, 'learning.metric_code')
    assertInteger(payload.count, 0, 1_000_000_000, 'learning.count')
    assertInteger(payload.ratePpm, 0, 1_000_000, 'learning.rate_ppm')
    assertHash(payload.evidenceHash, 'learning.evidence_hash')
    assertTimestamp(payload.bucketStart, 'learning.bucket_start')
    return { ...payload }
  }
  assertVersion(payload.version, 'release.version')
  assertHash(payload.inputHash, 'release.input_hash')
  assertHash(payload.verdictHash, 'release.verdict_hash')
  assertInteger(payload.runCount, 0, 1_000_000_000, 'release.run_count')
  assertInteger(payload.passedCount, 0, 1_000_000_000, 'release.passed_count')
  if ((payload.passedCount as number) > (payload.runCount as number)) reject('invalid_field', 'release.passed_count')
  assertEnum(payload.recommendationCode, RECOMMENDATIONS, 'release.recommendation_code')
  assertEnum(payload.canaryStatus, CANARY_STATUSES, 'release.canary_status')
  if (!Array.isArray(payload.lessonCodes) || payload.lessonCodes.length > 100) reject('invalid_field', 'release.lesson_codes')
  payload.lessonCodes.forEach((value) => assertClosedCode(value, 'release.lesson_code'))
  if (new Set(payload.lessonCodes).size !== payload.lessonCodes.length) reject('invalid_field', 'release.lesson_codes_duplicate')
  assertTimestamp(payload.createdAt, 'release.created_at')
  return { ...payload, lessonCodes: [...payload.lessonCodes].sort() }
}

function canonicalRecordWithoutHash(record: Omit<CentralRecord, 'recordHash'>): string {
  return canonical(record)
}

function validateOutputFamilyData(
  family: CentralFamily,
  data: Record<string, unknown>,
  retentionProfile: Exclude<RetentionProfile, 'central_content'>,
): void {
  if (family === 'command_run') {
    assertUuid(data.runId, 'record.command.run_id')
    assertOpaqueResult({ opaqueId: data.repoOpaqueId, keyVersion: data.opaqueKeyVersion })
    assertEnum(data.commandCode, COMMANDS, 'record.command.command_code')
    assertEnum(data.runnerCode, RUNNERS, 'record.command.runner_code')
    assertVersion(data.modelCode, 'record.command.model_code')
    assertEnum(data.statusCode, RUN_STATES, 'record.command.status_code')
    assertClosedCode(data.reasonCode, 'record.command.reason_code')
    assertVersion(data.kitVersion, 'record.command.kit_version')
    assertTimestamp(data.startedAt, 'record.command.started_at')
    assertNullableTimestamp(data.completedAt, 'record.command.completed_at')
    assertInteger(data.durationMs, 0, 7 * 24 * 60 * 60 * 1000, 'record.command.duration_ms')
    assertInteger(data.exitCode, -255, 255, 'record.command.exit_code')
    return
  }
  if (family === 'token_usage') {
    assertUuid(data.runId, 'record.usage.run_id')
    for (const key of ['promptTokens', 'completionTokens', 'cacheReadTokens', 'cacheWriteTokens']) assertInteger(data[key], 0, 1_000_000_000_000, `record.usage.${key}`)
    assertNullableInteger(data.costMicros, 0, 1_000_000_000_000, 'record.usage.costMicros')
    assertVersion(data.modelCode, 'record.usage.model_code')
    if (data.pricingVersion !== null) assertVersion(data.pricingVersion, 'record.usage.pricing_version')
    assertEnum(data.pricingStatus, PRICING_STATUSES, 'record.usage.pricing_status')
    const unavailable = data.pricingStatus === 'unavailable'
    if (unavailable
      ? data.costMicros !== null || data.pricingVersion !== null
      : data.costMicros === null || data.pricingVersion === null) reject('invalid_field', 'record.usage.pricing_pair')
    assertTimestamp(data.observedAt, 'record.usage.observed_at')
    return
  }
  if (family === 'progress') {
    if (typeof data.taskId !== 'string' || !TASK_ID.test(data.taskId)) reject('invalid_field', 'record.progress.task_id')
    assertUuid(data.commandRunId, 'record.progress.command_run_id')
    assertUuid(data.machineId, 'record.progress.machine_id')
    if (data.providerExecutionId !== null && (typeof data.providerExecutionId !== 'string' || !SAFE_PROVIDER_EXECUTION_ID.test(data.providerExecutionId))) reject('invalid_field', 'record.progress.provider_execution_id')
    assertInteger(data.attempt, 1, 50, 'record.progress.attempt')
    assertEnum(data.state, RUN_STATES, 'record.progress.state')
    if (data.phaseId !== null && (typeof data.phaseId !== 'string' || !PHASE_ID.test(data.phaseId))) reject('invalid_field', 'record.progress.phase_id')
    assertClosedCode(data.reasonCode, 'record.progress.reason_code')
    assertHash(data.eventHash, 'record.progress.event_hash')
    if (data.evidenceHash !== null) assertHash(data.evidenceHash, 'record.progress.evidence_hash')
    if (data.evidenceMediaType !== null) assertEnum(data.evidenceMediaType, EVIDENCE_MEDIA_TYPES, 'record.progress.evidence_media_type')
    if (data.evidenceBytes !== null) assertInteger(data.evidenceBytes, 0, 100 * 1024 * 1024, 'record.progress.evidence_bytes')
    assertEnum(data.verificationStatus, VERIFICATION_STATUSES, 'record.progress.verification_status')
    assertTimestamp(data.occurredAt, 'record.progress.occurred_at')
    if (data.retentionClass !== retentionProfile) reject('invalid_retention_profile', 'record.progress.retention_class')
    return
  }
  if (family === 'verification') {
    assertUuid(data.runId, 'record.verification.run_id')
    assertOpaqueResult({ opaqueId: data.repoOpaqueId, keyVersion: data.opaqueKeyVersion })
    assertHash(data.contentHash, 'record.verification.content_hash')
    assertVersion(data.kitVersion, 'record.verification.kit_version')
    assertBoolean(data.verified, 'record.verification.verified')
    if (!Array.isArray(data.tierExitCodes) || data.tierExitCodes.length > 16) reject('invalid_field', 'record.verification.tier_exit_codes')
    data.tierExitCodes.forEach((value) => assertInteger(value, -255, 255, 'record.verification.tier_exit_code'))
    assertTimestamp(data.observedAt, 'record.verification.observed_at')
    return
  }
  if (family === 'install_run') {
    assertOpaqueResult({ opaqueId: data.repoOpaqueId, keyVersion: data.opaqueKeyVersion })
    assertEnum(data.eventCode, INSTALL_RUN_EVENTS, 'record.install.event_code')
    assertVersion(data.kitVersion, 'record.install.kit_version')
    assertTimestamp(data.observedAt, 'record.install.observed_at')
    return
  }
  if (family === 'error_signal') {
    if (data.runId !== null) assertUuid(data.runId, 'record.error.run_id')
    if (data.tokenSubjectId !== null) assertUuid(data.tokenSubjectId, 'record.error.token_subject_id')
    if (data.runId === null && data.tokenSubjectId === null) reject('invalid_field', 'record.error.subject_required')
    assertEnum(data.errorType, ERROR_TYPES, 'record.error.error_type')
    if (data.phaseId !== null && (typeof data.phaseId !== 'string' || !PHASE_ID.test(data.phaseId))) reject('invalid_field', 'record.error.phase_id')
    assertClosedCode(data.reasonCode, 'record.error.reason_code')
    assertVersion(data.kitVersion, 'record.error.kit_version')
    assertTimestamp(data.occurredAt, 'record.error.occurred_at')
    return
  }
  if (family === 'learning_aggregate') {
    assertClosedCode(data.lessonCode, 'record.learning.lesson_code')
    assertClosedCode(data.metricCode, 'record.learning.metric_code')
    assertInteger(data.count, 0, 1_000_000_000, 'record.learning.count')
    assertInteger(data.ratePpm, 0, 1_000_000, 'record.learning.rate_ppm')
    assertHash(data.evidenceHash, 'record.learning.evidence_hash')
    assertTimestamp(data.bucketStart, 'record.learning.bucket_start')
    return
  }
  assertVersion(data.version, 'record.release.version')
  assertHash(data.inputHash, 'record.release.input_hash')
  assertHash(data.verdictHash, 'record.release.verdict_hash')
  assertInteger(data.runCount, 0, 1_000_000_000, 'record.release.run_count')
  assertInteger(data.passedCount, 0, 1_000_000_000, 'record.release.passed_count')
  if ((data.passedCount as number) > (data.runCount as number)) reject('invalid_field', 'record.release.passed_count')
  assertEnum(data.recommendationCode, RECOMMENDATIONS, 'record.release.recommendation_code')
  assertEnum(data.canaryStatus, CANARY_STATUSES, 'record.release.canary_status')
  if (!Array.isArray(data.lessonCodes) || data.lessonCodes.length > 100) reject('invalid_field', 'record.release.lesson_codes')
  data.lessonCodes.forEach((value) => assertClosedCode(value, 'record.release.lesson_code'))
  const sorted = [...data.lessonCodes].sort()
  if (new Set(data.lessonCodes).size !== data.lessonCodes.length || sorted.some((value, index) => value !== data.lessonCodes[index])) reject('invalid_field', 'record.release.lesson_codes_canonical')
  assertTimestamp(data.createdAt, 'record.release.created_at')
}

function validateFamilyRetention(family: CentralFamily, profile: Exclude<RetentionProfile, 'central_content'>): void {
  if (family === 'progress') {
    if (profile !== 'short_lived' && profile !== 'standard') reject('invalid_retention_profile', 'record.family_retention')
    return
  }
  const expected = family === 'learning_aggregate' ? 'learning_aggregate' : family === 'release_dossier' ? 'audit_release' : 'standard'
  if (profile !== expected) reject('invalid_retention_profile', 'record.family_retention')
}

export function validateCentralRecord(value: unknown): CentralRecord {
  if (!isRecord(value)) reject('malformed_envelope', 'record.shape')
  exactKeys(value, RECORD_KEYS, 'record.fields')
  if (value.schemaVersion !== PRIVACY_POLICY_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) reject('invalid_field', 'record.version')
  assertUuid(value.tenantId, 'record.tenant_id')
  assertEnum(value.family, FAMILIES, 'record.family')
  assertEnum(value.processingScope, SCOPES, 'record.processing_scope')
  assertEnum(value.retentionProfile, new Set(['short_lived', 'standard', 'learning_aggregate', 'audit_release']), 'record.retention_profile')
  if (value.processingScope !== requiredScope(value.family as CentralFamily)) reject('invalid_field', 'record.processing_scope_family')
  validateFamilyRetention(value.family as CentralFamily, value.retentionProfile as Exclude<RetentionProfile, 'central_content'>)
  assertTimestamp(value.recordedAt, 'record.recorded_at')
  assertTimestamp(value.expiresAt, 'record.expires_at')
  if (computeRetentionExpiry(value.retentionProfile as RetentionProfile, value.recordedAt) !== value.expiresAt) reject('retention_extension_attempted', 'record.expiry')
  if (!isRecord(value.data)) reject('malformed_envelope', 'record.data_shape')
  exactKeys(value.data, OUTPUT_DATA_KEYS[value.family as CentralFamily], 'record.data_fields')
  scanPayload(value.data)
  validateOutputFamilyData(value.family as CentralFamily, value.data, value.retentionProfile as Exclude<RetentionProfile, 'central_content'>)
  assertHash(value.recordHash, 'record.hash')
  const withoutHash = { ...value } as Record<string, unknown>
  delete withoutHash.recordHash
  if (sha256(canonical(withoutHash)) !== value.recordHash) reject('integrity_mismatch', 'record.hash_mismatch')
  return value as unknown as CentralRecord
}

export function buildCentralRecord(input: {
  context: unknown
  grant: unknown
  family: CentralFamily
  payload: unknown
  clock: ClockPort
  opaqueIdentifierPort: OpaqueIdentifierPort
}): CentralRecord {
  const context = validateTrustedTenantContext(input.context)
  if (!FAMILIES.has(input.family)) reject('malformed_envelope', 'record.family')
  const recordedAt = input.clock.now()
  assertTimestamp(recordedAt, 'record.clock')
  const scope = requiredScope(input.family)
  const consent = evaluateProcessingGrant(context, scope, input.grant, recordedAt)
  if (consent.allowed === false) reject(consent.reasonCode, consent.ruleId)
  const payload = validateCommonPayload(input.family, input.payload)
  const retentionProfile = retentionFor(input.family, consent.grant.purposeCode)
  const data = buildFamilyData(input.family, payload, context, input.opaqueIdentifierPort, retentionProfile)
  const withoutHash: Omit<CentralRecord, 'recordHash'> = {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    tenantId: context.tenantId,
    family: input.family,
    processingScope: scope,
    retentionProfile,
    recordedAt,
    expiresAt: computeRetentionExpiry(retentionProfile, recordedAt),
    data,
  }
  return validateCentralRecord({ ...withoutHash, recordHash: sha256(canonicalRecordWithoutHash(withoutHash)) })
}

export function evaluateCentralRecord(input: Parameters<typeof buildCentralRecord>[0]): PrivacyEvaluation {
  try {
    return { allowed: true, reasonCode: null, ruleId: 'privacy.allowlist.accepted', record: buildCentralRecord(input) }
  } catch (error) {
    if (error instanceof PrivacyPolicyError) return { allowed: false, reasonCode: error.reasonCode, ruleId: error.ruleId, record: null }
    return { allowed: false, reasonCode: 'malformed_envelope', ruleId: 'privacy.unexpected_failure', record: null }
  }
}

function canonicalReceiptWithoutHash(receipt: Omit<DeletionReceipt, 'receiptHash'>): string {
  return canonical(receipt)
}

export function createDeletionReceipt(input: Omit<DeletionReceipt, 'schemaVersion' | 'policyVersion' | 'receiptHash'>): DeletionReceipt {
  if (!isRecord(input)) reject('malformed_envelope', 'deletion.input_shape')
  exactKeys(input, RECEIPT_INPUT_KEYS, 'deletion.input_fields')
  if (!Array.isArray(input.storeResults)) reject('invalid_field', 'deletion.store_results')
  const sortedResults = [...input.storeResults].sort((left, right) => left.storeId.localeCompare(right.storeId))
  const withoutHash: Omit<DeletionReceipt, 'receiptHash'> = {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    tenantId: input.tenantId,
    requestId: input.requestId,
    requestedAt: input.requestedAt,
    completedAt: input.completedAt,
    storeResults: sortedResults,
    outcomeCode: input.outcomeCode,
    retry: input.retry,
  }
  return validateDeletionReceipt({ ...withoutHash, receiptHash: sha256(canonicalReceiptWithoutHash(withoutHash)) })
}

export function validateDeletionReceipt(value: unknown): DeletionReceipt {
  if (!isRecord(value)) reject('malformed_envelope', 'deletion.receipt_shape')
  exactKeys(value, RECEIPT_KEYS, 'deletion.receipt_fields')
  if (value.schemaVersion !== PRIVACY_POLICY_SCHEMA_VERSION || value.policyVersion !== PRIVACY_POLICY_VERSION) reject('invalid_field', 'deletion.version')
  assertUuid(value.tenantId, 'deletion.tenant_id')
  assertUuid(value.requestId, 'deletion.request_id')
  assertTimestamp(value.requestedAt, 'deletion.requested_at')
  assertNullableTimestamp(value.completedAt, 'deletion.completed_at')
  if (!Array.isArray(value.storeResults) || value.storeResults.length > 32) reject('invalid_field', 'deletion.store_results')
  let previous = ''
  for (const result of value.storeResults) {
    if (!isRecord(result)) reject('malformed_envelope', 'deletion.store_result_shape')
    exactKeys(result, STORE_RESULT_KEYS, 'deletion.store_result_fields')
    assertClosedCode(result.storeId, 'deletion.store_id')
    assertInteger(result.affectedCount, 0, 1_000_000_000, 'deletion.affected_count')
    assertEnum(result.outcomeCode, new Set(['deleted', 'not_found', 'failed_retryable', 'failed_terminal']), 'deletion.store_outcome')
    if (result.storeId <= previous) reject('invalid_field', 'deletion.store_order')
    previous = result.storeId
  }
  assertEnum(value.outcomeCode, new Set(['completed', 'partial_retryable', 'failed_retryable', 'failed_terminal']), 'deletion.outcome')
  assertInteger(value.retry, 0, 100, 'deletion.retry')
  if (value.completedAt !== null && Date.parse(value.completedAt) < Date.parse(value.requestedAt)) reject('invalid_timestamp', 'deletion.completion_order')
  assertHash(value.receiptHash, 'deletion.receipt_hash')
  const withoutHash = { ...value } as Record<string, unknown>
  delete withoutHash.receiptHash
  if (sha256(canonical(withoutHash)) !== value.receiptHash) reject('integrity_mismatch', 'deletion.receipt_hash_mismatch')
  return value as unknown as DeletionReceipt
}

export function classifyLegacyRecord(value: unknown): LegacyDisposition {
  if (!isRecord(value)) reject('malformed_envelope', 'legacy.input_shape')
  exactKeys(value, LEGACY_INPUT_KEYS, 'legacy.input_fields')
  assertUuid(value.legacyId, 'legacy.id')
  if (value.mappingTenantId !== null) assertUuid(value.mappingTenantId, 'legacy.mapping_tenant_id')
  assertBoolean(value.sanitizerPassed, 'legacy.sanitizer_passed')
  assertTimestamp(value.observedAt, 'legacy.observed_at')
  if (value.mappingTenantId === null && value.sanitizerPassed) reject('untrusted_tenant_context', 'legacy.mapping_required')
  const state = value.mappingTenantId === null ? 'legacy_unclassified' : value.sanitizerPassed ? 'legacy_mapped' : 'legacy_rejected'
  const result: LegacyDisposition = {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    legacyId: value.legacyId,
    tenantId: state === 'legacy_mapped' ? value.mappingTenantId as string : null,
    state,
    eligibleForMigration: state === 'legacy_mapped',
    tenantVisible: false,
    purgeBy: state === 'legacy_mapped' ? null : new Date(Date.parse(value.observedAt) + 30 * 24 * 60 * 60 * 1000).toISOString(),
    observedAt: value.observedAt,
  }
  exactKeys(result as unknown as Record<string, unknown>, LEGACY_KEYS, 'legacy.output_fields')
  return result
}
