import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CENTRAL_FAMILIES,
  DATA_CLASSES,
  PRIVACY_POLICY_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
  PROCESSING_SCOPES,
  RETENTION_PROFILES,
  PrivacyPolicyError,
  buildCentralRecord,
  classifyLegacyRecord,
  computeRetentionExpiry,
  createDeletionReceipt,
  evaluateCentralRecord,
  evaluateProcessingGrant,
  validateCentralRecord,
  validateDeletionReceipt,
  validateProcessingGrant,
  validateTrustedTenantContext,
  type CentralFamily,
  type DeletionReceipt,
  type OpaqueIdentifierPort,
  type ProcessingGrant,
  type ProcessingScope,
  type TrustedTenantContext,
} from '../src/privacy-policy'

let assertions = 0
let attacks = 0

function assertion(name: string, run: () => void): void {
  run(); assertions += 1; console.log(`PASS ${name}`)
}

function attack(name: string, run: () => void): void {
  run(); attacks += 1; console.log(`PASS attack: ${name}`)
}

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'
const SUBJECT = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL = '44444444-4444-4444-8444-444444444444'
const RUN = '55555555-5555-4555-8555-555555555555'
const MACHINE = '66666666-6666-4666-8666-666666666666'
const REQUEST = '77777777-7777-4777-8777-777777777777'
const LEGACY = '88888888-8888-4888-8888-888888888888'
const NOW = '2026-08-14T10:00:00.000Z'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

const context: TrustedTenantContext = {
  schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
  tenantId: TENANT_A,
  subjectId: SUBJECT,
  sourceKind: 'worker_credential',
  credentialBindingId: CREDENTIAL,
  policyVersion: PRIVACY_POLICY_VERSION,
}

function grant(scope: ProcessingScope = 'essential_operations', overrides: Partial<ProcessingGrant> = {}): ProcessingGrant {
  return {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    tenantId: TENANT_A,
    subjectId: SUBJECT,
    scope,
    policyVersion: PRIVACY_POLICY_VERSION,
    decision: 'granted',
    purposeCode: 'operational_run',
    issuedAt: '2026-08-14T09:00:00.000Z',
    expiresAt: '2026-08-15T09:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

const clock = { now: () => NOW }
const opaqueIdentifierPort: OpaqueIdentifierPort = {
  create(input) {
    return {
      opaqueId: `hmac_${createHash('sha256').update(`${input.tenantId}:${input.namespace}:${input.localIdentifier}`).digest('hex')}`,
      keyVersion: 'key_v1',
    }
  },
}

const payloads: Record<CentralFamily, Record<string, unknown>> = {
  command_run: {
    runId: RUN,
    repoLocalId: 'workflow-kit',
    commandCode: 'feature_from_confluence',
    runnerCode: 'codex',
    modelCode: 'gpt-5.6',
    statusCode: 'passed',
    reasonCode: 'completed',
    kitVersion: '3.25.0',
    startedAt: '2026-08-14T09:59:00.000Z',
    completedAt: NOW,
    durationMs: 60_000,
    exitCode: 0,
  },
  token_usage: {
    runId: RUN,
    promptTokens: 1_000,
    completionTokens: 500,
    cacheReadTokens: 250,
    cacheWriteTokens: 100,
    costMicros: 12_345,
    modelCode: 'gpt-5.6',
    pricingVersion: '2026-08-01',
    pricingStatus: 'current',
    observedAt: NOW,
  },
  progress: {
    taskId: 'P17-016',
    commandRunId: RUN,
    machineId: MACHINE,
    providerExecutionId: 'provider_run',
    attempt: 1,
    state: 'passed',
    phaseId: 'B11',
    reasonCode: 'completed',
    eventHash: HASH_A,
    evidenceHash: HASH_B,
    evidenceMediaType: 'application/json',
    evidenceBytes: 1024,
    verificationStatus: 'verified',
    occurredAt: NOW,
  },
  verification: {
    runId: RUN,
    repoLocalId: 'workflow-kit',
    contentHash: HASH_A,
    kitVersion: '3.25.0',
    verified: true,
    tierExitCodes: [0, 0, 0],
    observedAt: NOW,
  },
  install_run: {
    repoLocalId: 'workflow-kit',
    kitVersion: '3.25.0',
    installedAt: NOW,
    lastRunVersion: '3.25.0',
    lastRunAt: NOW,
  },
  error_signal: {
    runId: RUN,
    tokenSubjectId: SUBJECT,
    errorType: 'verification',
    phaseId: 'B11',
    reasonCode: 'tier_failed',
    kitVersion: '3.25.0',
    occurredAt: NOW,
  },
  learning_aggregate: {
    lessonCode: 'selector_contract',
    metricCode: 'verified_rate',
    count: 10,
    ratePpm: 900_000,
    evidenceHash: HASH_A,
    bucketStart: '2026-08-14T00:00:00.000Z',
  },
  release_dossier: {
    version: '3.25.0',
    inputHash: HASH_A,
    verdictHash: HASH_B,
    runCount: 10,
    passedCount: 9,
    recommendationCode: 'hold',
    canaryStatus: 'not_run',
    lessonCodes: ['selector_contract', 'tenant_boundary'],
    createdAt: NOW,
  },
}

function build(family: CentralFamily, payload = payloads[family], selectedGrant?: ProcessingGrant) {
  const requiredGrant = selectedGrant ?? grant(family === 'learning_aggregate' ? 'learning_metrics' : 'essential_operations')
  return buildCentralRecord({ context, grant: requiredGrant, family, payload, clock, opaqueIdentifierPort })
}

function stableCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCanonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableCanonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function rehashRecord(value: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(value)
  delete copy.recordHash
  return { ...copy, recordHash: createHash('sha256').update(stableCanonical(copy)).digest('hex') }
}

function expectRejected(
  result: ReturnType<typeof evaluateCentralRecord>,
  reasonCode: string,
  rulePattern?: RegExp,
): void {
  assert.equal(result.allowed, false)
  if (result.allowed) return
  assert.equal(result.reasonCode, reasonCode)
  assert.equal(result.record, null)
  if (rulePattern) assert.match(result.ruleId, rulePattern)
}

assertion('published vocabulary is complete and closed', () => {
  assert.equal(DATA_CLASSES.length, 5)
  assert.equal(PROCESSING_SCOPES.length, 5)
  assert.equal(RETENTION_PROFILES.length, 5)
  assert.deepEqual(CENTRAL_FAMILIES, ['command_run', 'token_usage', 'progress', 'verification', 'install_run', 'error_signal', 'learning_aggregate', 'release_dossier'])
})

assertion('trusted context and grants round-trip through exact validators', () => {
  assert.deepEqual(validateTrustedTenantContext(structuredClone(context)), context)
  assert.deepEqual(validateProcessingGrant(structuredClone(grant())), grant())
})

assertion('all eight central families construct deterministic tenant-scoped records', () => {
  for (const family of CENTRAL_FAMILIES) {
    const first = build(family)
    const second = build(family)
    assert.deepEqual(first, second, `${family} must be deterministic`)
    assert.equal(first.tenantId, TENANT_A)
    assert.match(first.recordHash, /^[0-9a-f]{64}$/)
    assert.deepEqual(validateCentralRecord(structuredClone(first)), first)
  }
})

assertion('repository identifiers leave the boundary only as tenant-keyed HMAC values', () => {
  for (const family of ['command_run', 'verification', 'install_run'] as const) {
    const serialized = JSON.stringify(build(family))
    assert.doesNotMatch(serialized, /workflow-kit/)
    assert.match(serialized, /hmac_[0-9a-f]{64}/)
    assert.match(serialized, /key_v1/)
  }
  const tenantBRecord = buildCentralRecord({
    context: { ...context, tenantId: TENANT_B },
    grant: grant('essential_operations', { tenantId: TENANT_B }),
    family: 'command_run',
    payload: payloads.command_run,
    clock,
    opaqueIdentifierPort,
  })
  assert.notEqual(tenantBRecord.data.repoOpaqueId, build('command_run').data.repoOpaqueId)
})

assertion('R1 retention is server-computed for all profiles and exact at boundaries', () => {
  assert.equal(computeRetentionExpiry('short_lived', NOW), '2026-08-15T10:00:00.000Z')
  assert.equal(computeRetentionExpiry('standard', NOW), '2026-09-13T10:00:00.000Z')
  assert.equal(computeRetentionExpiry('learning_aggregate', NOW), '2027-02-10T10:00:00.000Z')
  assert.equal(computeRetentionExpiry('audit_release', NOW), '2027-08-14T10:00:00.000Z')
  assert.equal(build('learning_aggregate').retentionProfile, 'learning_aggregate')
  assert.equal(build('release_dossier').retentionProfile, 'audit_release')
  assert.equal(build('progress', payloads.progress, grant('essential_operations', { purposeCode: 'disposable_canary' })).retentionProfile, 'short_lived')
})

assertion('optional processing stays off without an active same-tenant grant', () => {
  assert.deepEqual(evaluateProcessingGrant(context, 'learning_metrics', null, NOW), {
    allowed: false,
    reasonCode: 'processing_scope_disabled',
    ruleId: 'consent.grant_missing',
  })
  assert.equal(evaluateProcessingGrant(context, 'learning_metrics', grant('learning_metrics'), NOW).allowed, true)
})

assertion('language-neutral schema binds five public envelopes and all eight record families', () => {
  const schema = JSON.parse(fs.readFileSync(path.resolve('docs/schemas/privacy-policy.schema.json'), 'utf8'))
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.oneOf.length, 5)
  assert.equal(schema.$defs.centralRecord.oneOf.length, 8)
  assert.equal(schema.$defs.trustedTenantContext.additionalProperties, false)
  assert.equal(schema.$defs.processingGrant.additionalProperties, false)
  assert.equal(schema.$defs.recordEnvelope.additionalProperties, false)
  for (const name of ['commandRunData', 'tokenUsageData', 'progressData', 'verificationData', 'installRunData', 'errorSignalData', 'learningAggregateData', 'releaseDossierData']) {
    assert.equal(schema.$defs[name].additionalProperties, false, `${name} must be closed`)
  }
})

assertion('deletion receipts are sorted, bounded, deterministic, and integrity-bound', () => {
  const input: Omit<DeletionReceipt, 'schemaVersion' | 'policyVersion' | 'receiptHash'> = {
    tenantId: TENANT_A,
    requestId: REQUEST,
    requestedAt: NOW,
    completedAt: '2026-08-14T10:01:00.000Z',
    storeResults: [
      { storeId: 'verify_records', affectedCount: 3, outcomeCode: 'deleted' },
      { storeId: 'command_runs', affectedCount: 2, outcomeCode: 'deleted' },
    ],
    outcomeCode: 'completed',
    retry: 0,
  }
  const receipt = createDeletionReceipt(input)
  assert.deepEqual(receipt.storeResults.map((entry) => entry.storeId), ['command_runs', 'verify_records'])
  assert.deepEqual(validateDeletionReceipt(structuredClone(receipt)), receipt)
  assert.equal(createDeletionReceipt(structuredClone(input)).receiptHash, receipt.receiptHash)
})

assertion('legacy rows remain hidden and require explicit mapping plus a passing sanitizer', () => {
  const unmapped = classifyLegacyRecord({ legacyId: LEGACY, mappingTenantId: null, sanitizerPassed: false, observedAt: NOW })
  assert.deepEqual(unmapped, {
    schemaVersion: 1,
    policyVersion: PRIVACY_POLICY_VERSION,
    legacyId: LEGACY,
    tenantId: null,
    state: 'legacy_unclassified',
    eligibleForMigration: false,
    tenantVisible: false,
    purgeBy: '2026-09-13T10:00:00.000Z',
    observedAt: NOW,
  })
  const mapped = classifyLegacyRecord({ legacyId: LEGACY, mappingTenantId: TENANT_A, sanitizerPassed: true, observedAt: NOW })
  assert.equal(mapped.state, 'legacy_mapped')
  assert.equal(mapped.tenantId, TENANT_A)
  assert.equal(mapped.eligibleForMigration, true)
  assert.equal(mapped.tenantVisible, false)
})

attack('unknown fields reject raw email, path, URL, prompt, log, stack, and evidence bodies', () => {
  for (const extra of [
    { email: 'person@example.test' },
    { path: 'C:/private/repo' },
    { url: 'https://private.example.test/spec' },
    { prompt: 'private requirement text' },
    { logTail: 'private terminal output' },
    { stackTrace: 'Error at private-file.ts:1' },
    { evidenceBody: 'private screenshot bytes' },
  ]) {
    const result = evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, ...extra }, clock, opaqueIdentifierPort })
    expectRejected(result, 'unknown_fields')
  }
})

attack('nested objects and prototype-pollution keys fail closed before construction', () => {
  expectRejected(evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, modelCode: { value: 'gpt' } }, clock, opaqueIdentifierPort }), 'prohibited_content')
  const polluted = JSON.parse(JSON.stringify(payloads.command_run).replace(/}$/, ',"__proto__":{"admin":true}}'))
  expectRejected(evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: polluted, clock, opaqueIdentifierPort }), 'unknown_fields')
})

attack('producer tenant and expiry fields cannot override trusted server decisions', () => {
  expectRejected(evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, tenantId: TENANT_B }, clock, opaqueIdentifierPort }), 'unknown_fields')
  expectRejected(evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, expiresAt: '2200-01-01T00:00:00.000Z' }, clock, opaqueIdentifierPort }), 'unknown_fields')
})

attack('wrong-tenant, revoked, expired, denied, and wrong-scope grants are rejected', () => {
  const cases = [
    grant('essential_operations', { tenantId: TENANT_B }),
    grant('essential_operations', { revokedAt: NOW }),
    grant('essential_operations', { expiresAt: NOW }),
    grant('essential_operations', { decision: 'denied' }),
    grant('learning_metrics'),
  ]
  for (const candidate of cases) {
    const result = evaluateCentralRecord({ context, grant: candidate, family: 'command_run', payload: payloads.command_run, clock, opaqueIdentifierPort })
    expectRejected(result, 'processing_scope_disabled', /^consent\./)
  }
})

attack('secret markers, high entropy, double encoding, and controls reject without value echo', () => {
  const secrets = [
    'Bearer abcdefghijklmnopqrstuvwxyz123456',
    '-----BEGIN PRIVATE KEY-----',
    'AbCDefghijklmnopqrstuvwxyz0123456789_-',
    encodeURIComponent(encodeURIComponent('authorization=Bearer abcdefghijklmnop')),
    'gpt\u202ehidden',
  ]
  for (const secret of secrets) {
    const result = evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, modelCode: secret }, clock, opaqueIdentifierPort })
    assert.equal(result.allowed, false)
    if (result.allowed) continue
    assert.ok(['suspected_secret', 'prohibited_content'].includes(result.reasonCode))
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  const secret = 'Bearer do_not_echo_this_value_123456'
  assert.throws(
    () => buildCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, modelCode: secret }, clock, opaqueIdentifierPort }),
    (error: unknown) => error instanceof PrivacyPolicyError && !error.message.includes(secret) && error.reasonCode === 'suspected_secret',
  )
})

attack('malformed tenant context and producer-selected context fail closed', () => {
  assert.throws(() => validateTrustedTenantContext({ ...context, tenantId: 'tenant-a' }), PrivacyPolicyError)
  assert.throws(() => validateTrustedTenantContext({ ...context, email: 'admin@example.test' }), /unknown_fields/)
  const inherited = Object.create(context)
  assert.throws(() => validateTrustedTenantContext(inherited), /malformed_envelope/)
})

attack('opaque identifier ports cannot return raw hashes, malformed versions, or extra data', () => {
  const candidates: OpaqueIdentifierPort[] = [
    { create: () => ({ opaqueId: HASH_A, keyVersion: 'key_v1' }) },
    { create: () => ({ opaqueId: `hmac_${HASH_A}`, keyVersion: 'Key V1' }) },
    { create: () => ({ opaqueId: `hmac_${HASH_A}`, keyVersion: 'key_v1', raw: 'workflow-kit' } as any) },
  ]
  for (const port of candidates) {
    expectRejected(evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: payloads.command_run, clock, opaqueIdentifierPort: port }), 'invalid_opaque_identifier')
  }
})

attack('record expiry and integrity tampering are independently rejected', () => {
  const record = build('command_run')
  assert.throws(() => validateCentralRecord({ ...record, expiresAt: '2027-08-14T10:00:00.000Z' }), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'retention_extension_attempted')
  assert.throws(() => validateCentralRecord({ ...record, recordHash: HASH_A }), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'integrity_mismatch')
})

attack('recomputed hashes cannot authorize invalid family data or longer retention', () => {
  const command = build('command_run') as unknown as Record<string, unknown>
  const invalidState = structuredClone(command)
  ;(invalidState.data as Record<string, unknown>).statusCode = 'owner_email'
  assert.throws(() => validateCentralRecord(rehashRecord(invalidState)), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'invalid_field')

  const extended = structuredClone(command)
  extended.retentionProfile = 'audit_release'
  extended.expiresAt = computeRetentionExpiry('audit_release', extended.recordedAt as string)
  assert.throws(() => validateCentralRecord(rehashRecord(extended)), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'invalid_retention_profile')

  const progress = build('progress') as unknown as Record<string, unknown>
  ;(progress.data as Record<string, unknown>).retentionClass = 'short_lived'
  assert.throws(() => validateCentralRecord(rehashRecord(progress)), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'invalid_retention_profile')

  const dossier = build('release_dossier') as unknown as Record<string, unknown>
  ;(dossier.data as Record<string, unknown>).lessonCodes = ['tenant_boundary', 'selector_contract']
  assert.throws(() => validateCentralRecord(rehashRecord(dossier)), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'invalid_field')
})

attack('raw local identifiers receive high-entropy checks even though opaque IDs are exempt', () => {
  const result = evaluateCentralRecord({ context, grant: grant(), family: 'command_run', payload: { ...payloads.command_run, repoLocalId: 'AbCDefghijklmnopqrstuvwxyz0123456789_-' }, clock, opaqueIdentifierPort })
  expectRejected(result, 'suspected_secret', /high_entropy/)
})

attack('central content is never converted into a zero-duration persisted record', () => {
  assert.throws(() => computeRetentionExpiry('central_content', NOW), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'prohibited_content')
})

attack('deletion receipts reject arbitrary comments, count overflow, wrong order, and tampering', () => {
  const receipt = createDeletionReceipt({ tenantId: TENANT_A, requestId: REQUEST, requestedAt: NOW, completedAt: null, storeResults: [{ storeId: 'command_runs', affectedCount: 2, outcomeCode: 'deleted' }], outcomeCode: 'partial_retryable', retry: 1 })
  assert.throws(() => createDeletionReceipt({ ...receipt, comment: 'private operator note' } as any), /unknown_fields/)
  assert.throws(() => validateDeletionReceipt({ ...receipt, comment: 'private operator note' }), /unknown_fields/)
  assert.throws(() => createDeletionReceipt({ tenantId: TENANT_A, requestId: REQUEST, requestedAt: NOW, completedAt: null, storeResults: [{ storeId: 'command_runs', affectedCount: Number.MAX_SAFE_INTEGER, outcomeCode: 'deleted' }], outcomeCode: 'partial_retryable', retry: 1 }), /invalid_field/)
  const twoStores = createDeletionReceipt({ tenantId: TENANT_A, requestId: REQUEST, requestedAt: NOW, completedAt: null, storeResults: [{ storeId: 'verify_records', affectedCount: 1, outcomeCode: 'deleted' }, { storeId: 'command_runs', affectedCount: 2, outcomeCode: 'deleted' }], outcomeCode: 'completed', retry: 0 })
  assert.throws(() => validateDeletionReceipt({ ...twoStores, storeResults: [...twoStores.storeResults].reverse() }), /invalid_field/)
  assert.throws(() => validateDeletionReceipt({ ...receipt, receiptHash: HASH_A }), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'integrity_mismatch')
})

attack('legacy records cannot become mapped without both an explicit tenant and sanitizer pass', () => {
  assert.throws(() => classifyLegacyRecord({ legacyId: LEGACY, mappingTenantId: null, sanitizerPassed: true, observedAt: NOW }), (error: unknown) => error instanceof PrivacyPolicyError && error.reasonCode === 'untrusted_tenant_context')
  const rejected = classifyLegacyRecord({ legacyId: LEGACY, mappingTenantId: TENANT_A, sanitizerPassed: false, observedAt: NOW })
  assert.equal(rejected.state, 'legacy_rejected')
  assert.equal(rejected.tenantId, null)
  assert.equal(rejected.tenantVisible, false)
})

attack('shared core has no storage, provider, environment, process, filesystem, or UI dependency', () => {
  const source = fs.readFileSync(path.resolve('packages/core/src/privacy-policy.ts'), 'utf8')
  const imports = [...source.matchAll(/^import\s+.+?\s+from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1])
  assert.deepEqual(imports, ['node:crypto'])
  for (const forbidden of ['process.', 'process.env', 'child_process', 'fetch(', 'new WebSocket', 'createClient(', 'readFile', 'writeFile']) {
    assert.equal(source.includes(forbidden), false, `forbidden call site ${forbidden}`)
  }
  assert.match(source, /interface OpaqueIdentifierPort/)
  assert.match(source, /interface ClockPort/)
  assert.match(source, /interface TenantContextProvider/)
})

assert.ok(assertions >= 9)
assert.ok(attacks >= 12)
console.log(`privacy-policy.test: PASS (${CENTRAL_FAMILIES.length} families, ${assertions} contract groups, ${attacks} attack groups)`)
