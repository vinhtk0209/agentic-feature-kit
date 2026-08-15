import {
  PRIVACY_POLICY_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
  evaluateProcessingGrant,
  validateProcessingGrant,
  validateTrustedTenantContext,
  type ClockPort,
  type ProcessingGrant,
  type ProcessingScope,
  type TenantContextSource,
  type TrustedTenantContext,
} from './privacy-policy'

export const TENANT_ATTESTATION_VERSION = 'p17-016-attestation-v1' as const
export const TENANT_ATTESTATION_MAX_LIFETIME_MS = 5 * 60 * 1000
export const TENANT_ATTESTATION_FUTURE_SKEW_MS = 30 * 1000

export const TENANT_ATTESTATION_REASON_CODES = [
  'attestation_invalid',
  'attestation_denied',
  'attestation_unavailable',
  'processing_grant_denied',
  'processing_grant_unavailable',
] as const

export type TenantAttestationReasonCode = (typeof TENANT_ATTESTATION_REASON_CODES)[number]
export type TenantRole = 'admin' | 'operator' | 'viewer'
export type TenantState = 'active' | 'suspended' | 'deletion_requested' | 'deleting' | 'deletion_failed' | 'deleted'
export type TenantMembershipState = 'active' | 'suspended' | 'removed'
export type TenantCredentialState = 'active' | 'revoked' | 'expired'

export interface TenantAttestation {
  schemaVersion: typeof PRIVACY_POLICY_SCHEMA_VERSION
  attestationVersion: typeof TENANT_ATTESTATION_VERSION
  tenantId: string
  subjectId: string
  sourceKind: TenantContextSource
  credentialBindingId: string
  policyVersion: typeof PRIVACY_POLICY_VERSION
  purposeCode: string
  issuedAt: string
  expiresAt: string
  keyVersion: number
  nonce: string
  proof: string
}

export interface TenantRecord {
  tenantId: string
  state: TenantState
  policyVersion: typeof PRIVACY_POLICY_VERSION
  version: number
}

export interface TenantMembershipRecord {
  tenantId: string
  subjectId: string
  role: TenantRole
  state: TenantMembershipState
  policyVersion: typeof PRIVACY_POLICY_VERSION
  issuedAt: string
  revokedAt: string | null
  version: number
}

export interface TenantCredentialBindingRecord {
  tenantId: string
  credentialBindingId: string
  sourceKind: TenantContextSource
  subjectId: string | null
  machineId: string | null
  state: TenantCredentialState
  keyVersion: number
  policyVersion: typeof PRIVACY_POLICY_VERSION
  issuedAt: string
  expiresAt: string
  revokedAt: string | null
  version: number
}

export interface TenantFoundationRepository {
  resolveTenant(input: {
    tenantId: string
    policyVersion: typeof PRIVACY_POLICY_VERSION
  }): Promise<TenantRecord | null>
  resolveMembership(input: {
    tenantId: string
    subjectId: string
    policyVersion: typeof PRIVACY_POLICY_VERSION
  }): Promise<TenantMembershipRecord | null>
  resolveCredentialBinding(input: {
    tenantId: string
    credentialBindingId: string
    policyVersion: typeof PRIVACY_POLICY_VERSION
  }): Promise<TenantCredentialBindingRecord | null>
  resolveProcessingGrant(input: {
    tenantId: string
    subjectId: string
    scope: ProcessingScope
    policyVersion: typeof PRIVACY_POLICY_VERSION
    purposeCode: string
    evaluatedAt: string
  }): Promise<ProcessingGrant | null>
  reserveNonce(input: {
    tenantId: string
    credentialBindingId: string
    purposeCode: string
    nonceHash: string
    issuedAt: string
    expiresAt: string
  }): Promise<boolean>
  consumeNonce(input: {
    tenantId: string
    credentialBindingId: string
    purposeCode: string
    nonceHash: string
    consumedAt: string
  }): Promise<boolean>
}

export interface AttestationProofPort {
  sign(input: { keyVersion: number; canonicalPayload: string }): Promise<string>
  verify(input: { keyVersion: number; canonicalPayload: string; proof: string }): Promise<boolean>
}

export interface TenantAttestationNoncePort {
  create(): string
  hash(nonce: string): string
}

export type IssueTenantAttestationInput =
  | Readonly<{
    requestedTenantId: string
    sourceKind: 'server_session'
    authenticatedSubjectId: string
    credentialBindingId: string
    purposeCode: string
  }>
  | Readonly<{
    requestedTenantId: string
    sourceKind: 'worker_credential'
    authenticatedMachineId: string
    credentialBindingId: string
    purposeCode: string
  }>

export type VerifyTenantAttestationInput =
  | Readonly<{ attestation: unknown; authenticatedSubjectId: string; authenticatedMachineId?: never }>
  | Readonly<{ attestation: unknown; authenticatedMachineId: string; authenticatedSubjectId?: never }>

export type TenantAttestationVerification =
  | Readonly<{ ok: true; context: TrustedTenantContext; membershipRole: TenantRole | null }>
  | Readonly<{ ok: false; reasonCode: TenantAttestationReasonCode; ruleId: string }>

export type TenantProcessingGrantResolution =
  | Readonly<{ ok: true; grant: ProcessingGrant }>
  | Readonly<{ ok: false; reasonCode: 'processing_grant_denied' | 'processing_grant_unavailable'; ruleId: string }>

type Dependencies = Readonly<{
  repository: TenantFoundationRepository
  proof: AttestationProofPort
  nonce: TenantAttestationNoncePort
  clock: ClockPort
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PURPOSE = /^[a-z][a-z0-9_]{0,63}$/
const NONCE = /^[0-9a-f]{64}$/
const NONCE_HASH = /^[0-9a-f]{64}$/
const PROOF = /^[A-Za-z0-9_-]{43,128}$/
const ATTESTATION_KEYS = [
  'schemaVersion',
  'attestationVersion',
  'tenantId',
  'subjectId',
  'sourceKind',
  'credentialBindingId',
  'policyVersion',
  'purposeCode',
  'issuedAt',
  'expiresAt',
  'keyVersion',
  'nonce',
  'proof',
] as const
const TENANT_KEYS = ['tenantId', 'state', 'policyVersion', 'version'] as const
const MEMBERSHIP_KEYS = [
  'tenantId', 'subjectId', 'role', 'state', 'policyVersion', 'issuedAt', 'revokedAt', 'version',
] as const
const BINDING_KEYS = [
  'tenantId', 'credentialBindingId', 'sourceKind', 'subjectId', 'machineId', 'state', 'keyVersion',
  'policyVersion', 'issuedAt', 'expiresAt', 'revokedAt', 'version',
] as const

export class TenantAttestationError extends Error {
  readonly reasonCode: TenantAttestationReasonCode
  readonly ruleId: string

  constructor(reasonCode: TenantAttestationReasonCode, ruleId: string) {
    super(`${reasonCode}:${ruleId}`)
    this.name = 'TenantAttestationError'
    this.reasonCode = reasonCode
    this.ruleId = ruleId
  }
}

function fail(reasonCode: TenantAttestationReasonCode, ruleId: string): never {
  throw new TenantAttestationError(reasonCode, ruleId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], ruleId: string): void {
  const keys = Object.keys(value)
  if (keys.length !== expected.length || expected.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail('attestation_invalid', ruleId)
  }
}

function uuid(value: unknown, ruleId: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('attestation_invalid', ruleId)
  return value
}

function purpose(value: unknown, ruleId: string): string {
  if (typeof value !== 'string' || !PURPOSE.test(value)) fail('attestation_invalid', ruleId)
  return value
}

function timestamp(value: unknown, ruleId: string): string {
  if (typeof value !== 'string') fail('attestation_invalid', ruleId)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('attestation_invalid', ruleId)
  return value
}

function positiveInteger(value: unknown, ruleId: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) {
    fail('attestation_invalid', ruleId)
  }
  return value as number
}

function nullableTimestamp(value: unknown, ruleId: string): string | null {
  return value === null ? null : timestamp(value, ruleId)
}

function validateTenantRecord(value: unknown): TenantRecord {
  if (!isRecord(value)) fail('attestation_denied', 'attestation.tenant_missing')
  exactKeys(value, TENANT_KEYS, 'attestation.tenant_shape')
  const tenantId = uuid(value.tenantId, 'attestation.tenant_id')
  if (!['active', 'suspended', 'deletion_requested', 'deleting', 'deletion_failed', 'deleted'].includes(String(value.state))) {
    fail('attestation_denied', 'attestation.tenant_state')
  }
  if (value.policyVersion !== PRIVACY_POLICY_VERSION) fail('attestation_denied', 'attestation.tenant_policy')
  return {
    tenantId,
    state: value.state as TenantState,
    policyVersion: PRIVACY_POLICY_VERSION,
    version: positiveInteger(value.version, 'attestation.tenant_version'),
  }
}

function validateMembershipRecord(value: unknown): TenantMembershipRecord {
  if (!isRecord(value)) fail('attestation_denied', 'attestation.membership_missing')
  exactKeys(value, MEMBERSHIP_KEYS, 'attestation.membership_shape')
  if (!['admin', 'operator', 'viewer'].includes(String(value.role))) fail('attestation_denied', 'attestation.membership_role')
  if (!['active', 'suspended', 'removed'].includes(String(value.state))) fail('attestation_denied', 'attestation.membership_state')
  if (value.policyVersion !== PRIVACY_POLICY_VERSION) fail('attestation_denied', 'attestation.membership_policy')
  return {
    tenantId: uuid(value.tenantId, 'attestation.membership_tenant'),
    subjectId: uuid(value.subjectId, 'attestation.membership_subject'),
    role: value.role as TenantRole,
    state: value.state as TenantMembershipState,
    policyVersion: PRIVACY_POLICY_VERSION,
    issuedAt: timestamp(value.issuedAt, 'attestation.membership_issued'),
    revokedAt: nullableTimestamp(value.revokedAt, 'attestation.membership_revoked'),
    version: positiveInteger(value.version, 'attestation.membership_version'),
  }
}

function validateBindingRecord(value: unknown): TenantCredentialBindingRecord {
  if (!isRecord(value)) fail('attestation_denied', 'attestation.binding_missing')
  exactKeys(value, BINDING_KEYS, 'attestation.binding_shape')
  if (value.sourceKind !== 'server_session' && value.sourceKind !== 'worker_credential') {
    fail('attestation_denied', 'attestation.binding_source')
  }
  if (!['active', 'revoked', 'expired'].includes(String(value.state))) fail('attestation_denied', 'attestation.binding_state')
  if (value.policyVersion !== PRIVACY_POLICY_VERSION) fail('attestation_denied', 'attestation.binding_policy')
  const sourceKind = value.sourceKind
  const subjectId = value.subjectId === null ? null : uuid(value.subjectId, 'attestation.binding_subject')
  const machineId = value.machineId === null ? null : uuid(value.machineId, 'attestation.binding_machine')
  if ((sourceKind === 'server_session' && (subjectId === null || machineId !== null))
    || (sourceKind === 'worker_credential' && (machineId === null || subjectId !== null))) {
    fail('attestation_denied', 'attestation.binding_subject_shape')
  }
  return {
    tenantId: uuid(value.tenantId, 'attestation.binding_tenant'),
    credentialBindingId: uuid(value.credentialBindingId, 'attestation.binding_id'),
    sourceKind,
    subjectId,
    machineId,
    state: value.state as TenantCredentialState,
    keyVersion: positiveInteger(value.keyVersion, 'attestation.binding_key_version'),
    policyVersion: PRIVACY_POLICY_VERSION,
    issuedAt: timestamp(value.issuedAt, 'attestation.binding_issued'),
    expiresAt: timestamp(value.expiresAt, 'attestation.binding_expires'),
    revokedAt: nullableTimestamp(value.revokedAt, 'attestation.binding_revoked'),
    version: positiveInteger(value.version, 'attestation.binding_version'),
  }
}

export function validateTenantAttestation(value: unknown): TenantAttestation {
  if (!isRecord(value)) fail('attestation_invalid', 'attestation.envelope_shape')
  exactKeys(value, ATTESTATION_KEYS, 'attestation.envelope_fields')
  if (value.schemaVersion !== PRIVACY_POLICY_SCHEMA_VERSION) fail('attestation_invalid', 'attestation.schema_version')
  if (value.attestationVersion !== TENANT_ATTESTATION_VERSION) fail('attestation_denied', 'attestation.version')
  if (value.policyVersion !== PRIVACY_POLICY_VERSION) fail('attestation_denied', 'attestation.policy_version')
  if (value.sourceKind !== 'server_session' && value.sourceKind !== 'worker_credential') {
    fail('attestation_invalid', 'attestation.source_kind')
  }
  if (typeof value.nonce !== 'string' || !NONCE.test(value.nonce)) fail('attestation_invalid', 'attestation.nonce')
  if (typeof value.proof !== 'string' || !PROOF.test(value.proof)) fail('attestation_invalid', 'attestation.proof')
  return {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    attestationVersion: TENANT_ATTESTATION_VERSION,
    tenantId: uuid(value.tenantId, 'attestation.tenant_id'),
    subjectId: uuid(value.subjectId, 'attestation.subject_id'),
    sourceKind: value.sourceKind,
    credentialBindingId: uuid(value.credentialBindingId, 'attestation.credential_binding_id'),
    policyVersion: PRIVACY_POLICY_VERSION,
    purposeCode: purpose(value.purposeCode, 'attestation.purpose_code'),
    issuedAt: timestamp(value.issuedAt, 'attestation.issued_at'),
    expiresAt: timestamp(value.expiresAt, 'attestation.expires_at'),
    keyVersion: positiveInteger(value.keyVersion, 'attestation.key_version'),
    nonce: value.nonce,
    proof: value.proof,
  }
}

export function canonicalTenantAttestationProofInput(value: TenantAttestation): string {
  const attestation = validateTenantAttestation(value)
  return JSON.stringify({
    schemaVersion: attestation.schemaVersion,
    attestationVersion: attestation.attestationVersion,
    tenantId: attestation.tenantId,
    subjectId: attestation.subjectId,
    sourceKind: attestation.sourceKind,
    credentialBindingId: attestation.credentialBindingId,
    policyVersion: attestation.policyVersion,
    purposeCode: attestation.purposeCode,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    keyVersion: attestation.keyVersion,
    nonce: attestation.nonce,
  })
}

function validateWindow(issuedAt: string, expiresAt: string, now: string): void {
  const issued = Date.parse(issuedAt)
  const expires = Date.parse(expiresAt)
  const evaluated = Date.parse(timestamp(now, 'attestation.clock'))
  if (issued > evaluated + TENANT_ATTESTATION_FUTURE_SKEW_MS) fail('attestation_denied', 'attestation.issued_in_future')
  if (expires <= evaluated) fail('attestation_denied', 'attestation.expired')
  if (expires <= issued || expires - issued > TENANT_ATTESTATION_MAX_LIFETIME_MS) {
    fail('attestation_denied', 'attestation.invalid_lifetime')
  }
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof TenantAttestationError) throw error
    fail('attestation_unavailable', 'attestation.repository_unavailable')
  }
}

async function resolveAuthorization(
  input: {
    tenantId: string
    subjectId: string
    sourceKind: TenantContextSource
    credentialBindingId: string
  },
  dependencies: Pick<Dependencies, 'repository' | 'clock'>,
): Promise<{ binding: TenantCredentialBindingRecord; membershipRole: TenantRole | null }> {
  const now = timestamp(dependencies.clock.now(), 'attestation.clock')
  const tenantResult = await repositoryCall(() => dependencies.repository.resolveTenant({
    tenantId: input.tenantId,
    policyVersion: PRIVACY_POLICY_VERSION,
  }))
  const tenant = validateTenantRecord(tenantResult)
  if (tenant.tenantId !== input.tenantId || tenant.state !== 'active') fail('attestation_denied', 'attestation.tenant_inactive')

  const bindingResult = await repositoryCall(() => dependencies.repository.resolveCredentialBinding({
    tenantId: input.tenantId,
    credentialBindingId: input.credentialBindingId,
    policyVersion: PRIVACY_POLICY_VERSION,
  }))
  const binding = validateBindingRecord(bindingResult)
  if (binding.tenantId !== input.tenantId || binding.credentialBindingId !== input.credentialBindingId) {
    fail('attestation_denied', 'attestation.binding_mismatch')
  }
  if (binding.sourceKind !== input.sourceKind || binding.state !== 'active') fail('attestation_denied', 'attestation.binding_inactive')
  if (Date.parse(binding.issuedAt) > Date.parse(now) || Date.parse(binding.expiresAt) <= Date.parse(now) || binding.revokedAt !== null) {
    fail('attestation_denied', 'attestation.binding_stale')
  }
  const boundSubject = input.sourceKind === 'server_session' ? binding.subjectId : binding.machineId
  if (boundSubject !== input.subjectId) fail('attestation_denied', 'attestation.binding_subject_mismatch')

  if (input.sourceKind === 'worker_credential') return { binding, membershipRole: null }

  const membershipResult = await repositoryCall(() => dependencies.repository.resolveMembership({
    tenantId: input.tenantId,
    subjectId: input.subjectId,
    policyVersion: PRIVACY_POLICY_VERSION,
  }))
  const membership = validateMembershipRecord(membershipResult)
  if (membership.tenantId !== input.tenantId || membership.subjectId !== input.subjectId
    || membership.state !== 'active' || membership.revokedAt !== null || Date.parse(membership.issuedAt) > Date.parse(now)) {
    fail('attestation_denied', 'attestation.membership_inactive')
  }
  return { binding, membershipRole: membership.role }
}

function validateIssueInput(input: IssueTenantAttestationInput): {
  tenantId: string
  subjectId: string
  sourceKind: TenantContextSource
  credentialBindingId: string
  purposeCode: string
} {
  if (!isRecord(input)) fail('attestation_invalid', 'attestation.issue_shape')
  if (input.sourceKind === 'server_session') {
    exactKeys(input, ['requestedTenantId', 'sourceKind', 'authenticatedSubjectId', 'credentialBindingId', 'purposeCode'], 'attestation.issue_fields')
    return {
      tenantId: uuid(input.requestedTenantId, 'attestation.requested_tenant'),
      subjectId: uuid(input.authenticatedSubjectId, 'attestation.authenticated_subject'),
      sourceKind: 'server_session',
      credentialBindingId: uuid(input.credentialBindingId, 'attestation.credential_binding_id'),
      purposeCode: purpose(input.purposeCode, 'attestation.purpose_code'),
    }
  }
  if (input.sourceKind === 'worker_credential') {
    exactKeys(input, ['requestedTenantId', 'sourceKind', 'authenticatedMachineId', 'credentialBindingId', 'purposeCode'], 'attestation.issue_fields')
    return {
      tenantId: uuid(input.requestedTenantId, 'attestation.requested_tenant'),
      subjectId: uuid(input.authenticatedMachineId, 'attestation.authenticated_machine'),
      sourceKind: 'worker_credential',
      credentialBindingId: uuid(input.credentialBindingId, 'attestation.credential_binding_id'),
      purposeCode: purpose(input.purposeCode, 'attestation.purpose_code'),
    }
  }
  fail('attestation_invalid', 'attestation.issue_source')
}

export async function issueTenantAttestation(
  inputValue: IssueTenantAttestationInput,
  dependencies: Dependencies,
): Promise<TenantAttestation> {
  const input = validateIssueInput(inputValue)
  const authorization = await resolveAuthorization(input, dependencies)
  const issuedAt = timestamp(dependencies.clock.now(), 'attestation.clock')
  const expiresAt = new Date(Date.parse(issuedAt) + TENANT_ATTESTATION_MAX_LIFETIME_MS).toISOString()
  const nonce = dependencies.nonce.create()
  if (!NONCE.test(nonce)) fail('attestation_unavailable', 'attestation.nonce_unavailable')
  const nonceHash = dependencies.nonce.hash(nonce)
  if (!NONCE_HASH.test(nonceHash)) fail('attestation_unavailable', 'attestation.nonce_hash_unavailable')
  const unsigned: TenantAttestation = {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    attestationVersion: TENANT_ATTESTATION_VERSION,
    tenantId: input.tenantId,
    subjectId: input.subjectId,
    sourceKind: input.sourceKind,
    credentialBindingId: input.credentialBindingId,
    policyVersion: PRIVACY_POLICY_VERSION,
    purposeCode: input.purposeCode,
    issuedAt,
    expiresAt,
    keyVersion: authorization.binding.keyVersion,
    nonce,
    proof: 'a'.repeat(43),
  }
  let proof: string
  try {
    proof = await dependencies.proof.sign({
      keyVersion: unsigned.keyVersion,
      canonicalPayload: canonicalTenantAttestationProofInput(unsigned),
    })
  } catch {
    fail('attestation_unavailable', 'attestation.proof_unavailable')
  }
  const attestation = validateTenantAttestation({ ...unsigned, proof })
  const reserved = await repositoryCall(() => dependencies.repository.reserveNonce({
    tenantId: attestation.tenantId,
    credentialBindingId: attestation.credentialBindingId,
    purposeCode: attestation.purposeCode,
    nonceHash,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
  }))
  if (!reserved) fail('attestation_unavailable', 'attestation.nonce_reservation_failed')
  return attestation
}

export async function verifyTenantAttestation(
  input: VerifyTenantAttestationInput,
  dependencies: Dependencies,
): Promise<TenantAttestationVerification> {
  try {
    if (!isRecord(input)) fail('attestation_invalid', 'attestation.verify_shape')
    const hasSubject = Object.prototype.hasOwnProperty.call(input, 'authenticatedSubjectId')
    const hasMachine = Object.prototype.hasOwnProperty.call(input, 'authenticatedMachineId')
    if (hasSubject === hasMachine) fail('attestation_invalid', 'attestation.authenticated_principal_shape')
    exactKeys(input, hasSubject ? ['attestation', 'authenticatedSubjectId'] : ['attestation', 'authenticatedMachineId'], 'attestation.verify_fields')
    const attestation = validateTenantAttestation(input.attestation)
    const authenticated = uuid(
      hasSubject ? input.authenticatedSubjectId : input.authenticatedMachineId,
      'attestation.authenticated_principal',
    )
    if ((attestation.sourceKind === 'server_session') !== hasSubject || attestation.subjectId !== authenticated) {
      fail('attestation_denied', 'attestation.authenticated_subject_mismatch')
    }
    validateWindow(attestation.issuedAt, attestation.expiresAt, dependencies.clock.now())
    let proofValid = false
    try {
      proofValid = await dependencies.proof.verify({
        keyVersion: attestation.keyVersion,
        canonicalPayload: canonicalTenantAttestationProofInput(attestation),
        proof: attestation.proof,
      })
    } catch {
      fail('attestation_unavailable', 'attestation.proof_unavailable')
    }
    if (!proofValid) fail('attestation_denied', 'attestation.proof_invalid')
    const authorization = await resolveAuthorization({
      tenantId: attestation.tenantId,
      subjectId: attestation.subjectId,
      sourceKind: attestation.sourceKind,
      credentialBindingId: attestation.credentialBindingId,
    }, dependencies)
    if (authorization.binding.keyVersion !== attestation.keyVersion) fail('attestation_denied', 'attestation.key_version_mismatch')
    const nonceHash = dependencies.nonce.hash(attestation.nonce)
    if (!NONCE_HASH.test(nonceHash)) fail('attestation_unavailable', 'attestation.nonce_hash_unavailable')
    const consumed = await repositoryCall(() => dependencies.repository.consumeNonce({
      tenantId: attestation.tenantId,
      credentialBindingId: attestation.credentialBindingId,
      purposeCode: attestation.purposeCode,
      nonceHash,
      consumedAt: timestamp(dependencies.clock.now(), 'attestation.clock'),
    }))
    if (!consumed) fail('attestation_denied', 'attestation.nonce_replayed')
    const context = validateTrustedTenantContext({
      schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
      tenantId: attestation.tenantId,
      subjectId: attestation.subjectId,
      sourceKind: attestation.sourceKind,
      credentialBindingId: attestation.credentialBindingId,
      policyVersion: PRIVACY_POLICY_VERSION,
    })
    return { ok: true, context, membershipRole: authorization.membershipRole }
  } catch (error) {
    if (error instanceof TenantAttestationError) {
      return { ok: false, reasonCode: error.reasonCode, ruleId: error.ruleId }
    }
    return { ok: false, reasonCode: 'attestation_unavailable', ruleId: 'attestation.repository_unavailable' }
  }
}

export async function resolveProcessingGrantForTenant(
  input: Readonly<{
    context: unknown
    scope: ProcessingScope
    purposeCode: string
  }>,
  dependencies: Readonly<{ repository: TenantFoundationRepository; clock: ClockPort }>,
): Promise<TenantProcessingGrantResolution> {
  try {
    if (!isRecord(input)) fail('attestation_invalid', 'grant.request_shape')
    exactKeys(input, ['context', 'scope', 'purposeCode'], 'grant.request_fields')
    const context = validateTrustedTenantContext(input.context)
    const purposeCode = purpose(input.purposeCode, 'grant.purpose_code')
    const evaluatedAt = timestamp(dependencies.clock.now(), 'grant.clock')
    const grant = await repositoryCall(() => dependencies.repository.resolveProcessingGrant({
      tenantId: context.tenantId,
      subjectId: context.subjectId,
      scope: input.scope,
      policyVersion: PRIVACY_POLICY_VERSION,
      purposeCode,
      evaluatedAt,
    }))
    if (grant === null) return { ok: false, reasonCode: 'processing_grant_denied', ruleId: 'grant.missing' }
    const validated = validateProcessingGrant(grant)
    if (validated.purposeCode !== purposeCode) {
      return { ok: false, reasonCode: 'processing_grant_denied', ruleId: 'grant.purpose_mismatch' }
    }
    const decision = evaluateProcessingGrant(context, input.scope, validated, evaluatedAt)
    if (!decision.allowed) return { ok: false, reasonCode: 'processing_grant_denied', ruleId: decision.ruleId }
    return { ok: true, grant: decision.grant }
  } catch {
    return { ok: false, reasonCode: 'processing_grant_unavailable', ruleId: 'grant.repository_unavailable' }
  }
}
