import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  TENANT_ATTESTATION_VERSION,
  TenantAttestationError,
  canonicalTenantAttestationProofInput,
  issueTenantAttestation,
  resolveProcessingGrantForTenant,
  validateTenantAttestation,
  verifyTenantAttestation,
  type AttestationProofPort,
  type TenantAttestation,
  type TenantAttestationNoncePort,
  type TenantCredentialBindingRecord,
  type TenantFoundationRepository,
  type TenantMembershipRecord,
  type TenantRecord,
} from '../src/tenant-attestation'
import {
  PRIVACY_POLICY_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
  type ProcessingGrant,
} from '../src/privacy-policy'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const SUBJECT = '33333333-3333-4333-8333-333333333333'
const MACHINE = '44444444-4444-4444-8444-444444444444'
const SESSION_BINDING = '55555555-5555-4555-8555-555555555555'
const WORKER_BINDING = '66666666-6666-4666-8666-666666666666'
const NOW = '2026-08-16T10:00:00.000Z'
const NONCE = 'a'.repeat(64)

let assertions = 0
let attacks = 0
const assertion = async (name: string, run: () => void | Promise<void>) => {
  await run(); assertions += 1; console.log(`PASS ${name}`)
}
const attack = async (name: string, run: () => void | Promise<void>) => {
  await run(); attacks += 1; console.log(`PASS attack: ${name}`)
}

function tenant(overrides: Partial<TenantRecord> = {}): TenantRecord {
  return {
    tenantId: TENANT_A,
    state: 'active',
    policyVersion: PRIVACY_POLICY_VERSION,
    version: 1,
    ...overrides,
  }
}

function membership(overrides: Partial<TenantMembershipRecord> = {}): TenantMembershipRecord {
  return {
    tenantId: TENANT_A,
    subjectId: SUBJECT,
    role: 'admin',
    state: 'active',
    policyVersion: PRIVACY_POLICY_VERSION,
    issuedAt: '2026-08-16T09:00:00.000Z',
    revokedAt: null,
    version: 1,
    ...overrides,
  }
}

function binding(sourceKind: 'server_session' | 'worker_credential', overrides: Partial<TenantCredentialBindingRecord> = {}): TenantCredentialBindingRecord {
  return {
    tenantId: TENANT_A,
    credentialBindingId: sourceKind === 'server_session' ? SESSION_BINDING : WORKER_BINDING,
    sourceKind,
    subjectId: sourceKind === 'server_session' ? SUBJECT : null,
    machineId: sourceKind === 'worker_credential' ? MACHINE : null,
    state: 'active',
    keyVersion: 1,
    policyVersion: PRIVACY_POLICY_VERSION,
    issuedAt: '2026-08-16T09:00:00.000Z',
    expiresAt: '2026-08-17T09:00:00.000Z',
    revokedAt: null,
    version: 1,
    ...overrides,
  }
}

function grant(overrides: Partial<ProcessingGrant> = {}): ProcessingGrant {
  return {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    tenantId: TENANT_A,
    subjectId: SUBJECT,
    scope: 'essential_operations',
    policyVersion: PRIVACY_POLICY_VERSION,
    decision: 'granted',
    purposeCode: 'dashboard_session',
    issuedAt: '2026-08-16T09:00:00.000Z',
    expiresAt: '2026-08-16T11:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

function fixture(overrides: {
  tenant?: TenantRecord | null
  membership?: TenantMembershipRecord | null
  sessionBinding?: TenantCredentialBindingRecord | null
  workerBinding?: TenantCredentialBindingRecord | null
  grant?: ProcessingGrant | null
  proofValid?: boolean
} = {}) {
  const reserved = new Set<string>()
  const consumed: string[] = []
  const repository: TenantFoundationRepository = {
    async resolveTenant() { return overrides.tenant === undefined ? tenant() : overrides.tenant },
    async resolveMembership() { return overrides.membership === undefined ? membership() : overrides.membership },
    async resolveCredentialBinding(input) {
      if (input.credentialBindingId === SESSION_BINDING) {
        return overrides.sessionBinding === undefined ? binding('server_session') : overrides.sessionBinding
      }
      return overrides.workerBinding === undefined ? binding('worker_credential') : overrides.workerBinding
    },
    async resolveProcessingGrant() { return overrides.grant === undefined ? grant() : overrides.grant },
    async reserveNonce(input) {
      const key = `${input.tenantId}:${input.credentialBindingId}:${input.nonceHash}`
      if (reserved.has(key)) return false
      reserved.add(key); return true
    },
    async consumeNonce(input) {
      const key = `${input.tenantId}:${input.credentialBindingId}:${input.nonceHash}`
      if (!reserved.delete(key)) return false
      consumed.push(key); return true
    },
  }
  const proof: AttestationProofPort = {
    async sign(input) {
      return createHash('sha256').update(`test-key:${input.keyVersion}:${input.canonicalPayload}`).digest('base64url')
    },
    async verify(input) {
      if (overrides.proofValid === false) return false
      const expected = createHash('sha256').update(`test-key:${input.keyVersion}:${input.canonicalPayload}`).digest('base64url')
      return input.proof === expected
    },
  }
  const nonce: TenantAttestationNoncePort = {
    create: () => NONCE,
    hash: (value) => createHash('sha256').update(value).digest('hex'),
  }
  return { repository, proof, nonce, consumed }
}

const clock = { now: () => NOW }

async function issueServer(f = fixture()): Promise<TenantAttestation> {
  return issueTenantAttestation({
    requestedTenantId: TENANT_A,
    sourceKind: 'server_session',
    authenticatedSubjectId: SUBJECT,
    credentialBindingId: SESSION_BINDING,
    purposeCode: 'dashboard_session',
  }, { ...f, clock })
}

async function main(): Promise<void> {
  await assertion('server session issuance and verification return only trusted context plus membership role', async () => {
    const f = fixture()
    const attestation = await issueServer(f)
    assert.equal(attestation.attestationVersion, TENANT_ATTESTATION_VERSION)
    assert.deepEqual(Object.keys(attestation), [
      'schemaVersion', 'attestationVersion', 'tenantId', 'subjectId', 'sourceKind',
      'credentialBindingId', 'policyVersion', 'purposeCode', 'issuedAt', 'expiresAt',
      'keyVersion', 'nonce', 'proof',
    ])
    const result = await verifyTenantAttestation({
      attestation,
      authenticatedSubjectId: SUBJECT,
    }, { ...f, clock })
    assert.deepEqual(result, {
      ok: true,
      context: {
        schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
        tenantId: TENANT_A,
        subjectId: SUBJECT,
        sourceKind: 'server_session',
        credentialBindingId: SESSION_BINDING,
        policyVersion: PRIVACY_POLICY_VERSION,
      },
      membershipRole: 'admin',
    })
    assert.equal(f.consumed.length, 1)
  })

  await assertion('worker credential binds the machine subject without a session membership', async () => {
    const f = fixture({ membership: null })
    const attestation = await issueTenantAttestation({
      requestedTenantId: TENANT_A,
      sourceKind: 'worker_credential',
      authenticatedMachineId: MACHINE,
      credentialBindingId: WORKER_BINDING,
      purposeCode: 'workflow_worker',
    }, { ...f, clock })
    const result = await verifyTenantAttestation({ attestation, authenticatedMachineId: MACHINE }, { ...f, clock })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.context.subjectId, MACHINE)
      assert.equal(result.context.sourceKind, 'worker_credential')
      assert.equal(result.membershipRole, null)
    }
  })

  await assertion('canonical proof input is deterministic and excludes proof', async () => {
    const value = await issueServer()
    const first = canonicalTenantAttestationProofInput(value)
    const second = canonicalTenantAttestationProofInput({ ...value, proof: 'z'.repeat(43) })
    assert.equal(first, second)
    assert.equal(first.includes('proof'), false)
  })

  await assertion('processing grant resolution uses the verified tenant/subject/scope/purpose tuple', async () => {
    const f = fixture()
    const attestation = await issueServer(f)
    const verified = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, { ...f, clock })
    assert.equal(verified.ok, true)
    if (!verified.ok) return
    const result = await resolveProcessingGrantForTenant({
      context: verified.context,
      scope: 'essential_operations',
      purposeCode: 'dashboard_session',
    }, { repository: f.repository, clock })
    assert.equal(result.ok, true)
  })

  await attack('unknown, inherited, missing, and malformed envelope fields fail with safe errors', async () => {
    const value = await issueServer()
    for (const candidate of [
      { ...value, unexpected: true },
      Object.assign(Object.create({ unexpected: true }), value),
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'tenantId')),
      { ...value, tenantId: 'not-a-uuid' },
      { ...value, purposeCode: 'Unsafe Purpose' },
      { ...value, nonce: 'short' },
      { ...value, proof: 'short' },
    ]) {
      assert.throws(() => validateTenantAttestation(candidate), TenantAttestationError)
    }
  })

  await attack('forged producer tenant and wrong authenticated subject are denied before nonce consumption', async () => {
    const f = fixture()
    await assert.rejects(() => issueTenantAttestation({
      requestedTenantId: TENANT_B,
      sourceKind: 'server_session',
      authenticatedSubjectId: SUBJECT,
      credentialBindingId: SESSION_BINDING,
      purposeCode: 'dashboard_session',
    }, { ...f, clock }), TenantAttestationError)
    const attestation = await issueServer(f)
    const result = await verifyTenantAttestation({ attestation, authenticatedSubjectId: TENANT_B }, { ...f, clock })
    assert.deepEqual(result, { ok: false, reasonCode: 'attestation_denied', ruleId: 'attestation.authenticated_subject_mismatch' })
    assert.equal(f.consumed.length, 0)
  })

  await attack('wrong tenant, policy, key, source binding, and proof are denied without consuming the nonce', async () => {
    for (const mutate of [
      (value: TenantAttestation) => ({ ...value, tenantId: TENANT_B }),
      (value: TenantAttestation) => ({ ...value, policyVersion: 'p17-016-v2' }),
      (value: TenantAttestation) => ({ ...value, keyVersion: 2 }),
      (value: TenantAttestation) => ({ ...value, sourceKind: 'worker_credential' as const }),
      (value: TenantAttestation) => ({ ...value, proof: 'b'.repeat(43) }),
    ]) {
      const f = fixture()
      const result = await verifyTenantAttestation({
        attestation: mutate(await issueServer(f)),
        authenticatedSubjectId: SUBJECT,
      }, { ...f, clock })
      assert.equal(result.ok, false)
      assert.equal(f.consumed.length, 0)
    }
  })

  await attack('expired, future, and overlong attestations fail closed', async () => {
    const base = await issueServer()
    for (const candidate of [
      { ...base, issuedAt: '2026-08-16T09:50:00.000Z', expiresAt: '2026-08-16T10:00:00.000Z' },
      { ...base, issuedAt: '2026-08-16T10:00:31.000Z', expiresAt: '2026-08-16T10:04:00.000Z' },
      { ...base, issuedAt: '2026-08-16T10:00:00.000Z', expiresAt: '2026-08-16T10:05:01.000Z' },
    ]) {
      const f = fixture()
      const result = await verifyTenantAttestation({ attestation: candidate, authenticatedSubjectId: SUBJECT }, { ...f, clock })
      assert.equal(result.ok, false)
      assert.equal(f.consumed.length, 0)
    }
  })

  await attack('removed membership and stale credential fail before nonce consumption', async () => {
    for (const f of [
      fixture({ membership: membership({ state: 'removed', revokedAt: '2026-08-16T09:30:00.000Z' }) }),
      fixture({ sessionBinding: binding('server_session', { state: 'revoked', revokedAt: '2026-08-16T09:30:00.000Z' }) }),
      fixture({ sessionBinding: binding('server_session', { expiresAt: NOW }) }),
    ]) {
      const attestation = await issueServer()
      const result = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, { ...f, clock })
      assert.equal(result.ok, false)
      assert.equal(f.consumed.length, 0)
    }
  })

  await attack('nonce replay is atomic and the second verification is denied', async () => {
    const f = fixture()
    const attestation = await issueServer(f)
    const first = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, { ...f, clock })
    const second = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, { ...f, clock })
    assert.equal(first.ok, true)
    assert.deepEqual(second, { ok: false, reasonCode: 'attestation_denied', ruleId: 'attestation.nonce_replayed' })
    assert.equal(f.consumed.length, 1)
  })

  await attack('denied, expired, revoked, and wrong-purpose grants remain closed', async () => {
    const context = {
      schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
      tenantId: TENANT_A,
      subjectId: SUBJECT,
      sourceKind: 'server_session' as const,
      credentialBindingId: SESSION_BINDING,
      policyVersion: PRIVACY_POLICY_VERSION,
    }
    for (const f of [
      fixture({ grant: null }),
      fixture({ grant: grant({ decision: 'denied' }) }),
      fixture({ grant: grant({ expiresAt: NOW }) }),
      fixture({ grant: grant({ revokedAt: '2026-08-16T09:30:00.000Z' }) }),
      fixture({ grant: grant({ purposeCode: 'different_purpose' }) }),
      fixture({ grant: grant({ tenantId: TENANT_B }) }),
    ]) {
      const result = await resolveProcessingGrantForTenant({
        context,
        scope: 'essential_operations',
        purposeCode: 'dashboard_session',
      }, { repository: f.repository, clock })
      assert.equal(result.ok, false)
    }
  })

  await attack('repository and proof errors collapse to safe closed codes', async () => {
    const f = fixture()
    const attestation = await issueServer(f)
    const brokenRepository: TenantFoundationRepository = {
      ...f.repository,
      async resolveTenant() { throw new Error('raw database secret') },
    }
    const result = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, {
      ...f,
      repository: brokenRepository,
      clock,
    })
    assert.deepEqual(result, { ok: false, reasonCode: 'attestation_unavailable', ruleId: 'attestation.repository_unavailable' })
    assert.equal(JSON.stringify(result).includes('database secret'), false)
    const proofFailure = await verifyTenantAttestation({ attestation, authenticatedSubjectId: SUBJECT }, {
      ...f,
      proof: {
        ...f.proof,
        async verify() { throw new Error('raw signing key') },
      },
      clock,
    })
    assert.deepEqual(proofFailure, { ok: false, reasonCode: 'attestation_unavailable', ruleId: 'attestation.proof_unavailable' })
    assert.equal(JSON.stringify(proofFailure).includes('signing key'), false)
  })

  assert.equal(assertions, 4)
  assert.equal(attacks, 8)
  console.log(`Tenant attestation: PASS (${assertions} contracts, ${attacks} attack groups)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
