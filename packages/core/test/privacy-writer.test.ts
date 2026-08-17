import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CENTRAL_FAMILIES,
  PRIVACY_POLICY_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
  type CentralFamily,
  type OpaqueIdentifierPort,
  type ProcessingGrant,
  type ProcessingScope,
  type TrustedTenantContext,
} from '../src/privacy-policy'
import {
  PRIVACY_WRITER_REASON_CODES,
  PRIVACY_WRITER_SCHEMA_VERSION,
  buildCentralWriteAttempt,
  executeCentralWrite,
  validateCentralWriteAttempt,
  validateCentralWriteReceipt,
  type CentralWriteAttempt,
  type CentralWriterSinkCapability,
} from '../src/privacy-writer'

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222'
const SUBJECT = '33333333-3333-4333-8333-333333333333'
const CREDENTIAL = '44444444-4444-4444-8444-444444444444'
const RUN = '55555555-5555-4555-8555-555555555555'
const MACHINE = '66666666-6666-4666-8666-666666666666'
const PERSISTENCE = '77777777-7777-4777-8777-777777777777'
const NOW = '2026-08-14T10:00:00.000Z'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

let assertions = 0
let attacks = 0
const assertion = (name: string, run: () => void | Promise<void>) => Promise.resolve().then(run).then(() => { assertions += 1; console.log(`PASS ${name}`) })
const attack = (name: string, run: () => void | Promise<void>) => Promise.resolve().then(run).then(() => { attacks += 1; console.log(`PASS attack: ${name}`) })

const context: TrustedTenantContext = {
  schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
  tenantId: TENANT,
  subjectId: SUBJECT,
  sourceKind: 'worker_credential',
  credentialBindingId: CREDENTIAL,
  policyVersion: PRIVACY_POLICY_VERSION,
}

function grant(scope: ProcessingScope = 'essential_operations'): ProcessingGrant {
  return {
    schemaVersion: PRIVACY_POLICY_SCHEMA_VERSION,
    tenantId: TENANT,
    subjectId: SUBJECT,
    scope,
    policyVersion: PRIVACY_POLICY_VERSION,
    decision: 'granted',
    purposeCode: 'operational_run',
    issuedAt: '2026-08-14T09:00:00.000Z',
    expiresAt: '2026-08-15T09:00:00.000Z',
    revokedAt: null,
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
  command_run: { runId: RUN, repoLocalId: 'workflow-kit', commandCode: 'prompt', runnerCode: 'codex', modelCode: 'gpt-5.6', statusCode: 'passed', reasonCode: 'completed', kitVersion: '3.25.0', startedAt: '2026-08-14T09:59:00.000Z', completedAt: NOW, durationMs: 60_000, exitCode: 0 },
  token_usage: { runId: RUN, promptTokens: 1_000, completionTokens: 500, cacheReadTokens: 250, cacheWriteTokens: 0, costMicros: null, modelCode: 'gpt-5.6', pricingVersion: null, pricingStatus: 'unavailable', observedAt: NOW },
  progress: { taskId: 'P17-016', commandRunId: RUN, machineId: MACHINE, providerExecutionId: PERSISTENCE, attempt: 1, state: 'passed', phaseId: 'B11', reasonCode: 'completed', eventHash: HASH_A, evidenceHash: HASH_B, evidenceMediaType: 'application/json', evidenceBytes: 1024, verificationStatus: 'verified', occurredAt: NOW },
  verification: { runId: RUN, repoLocalId: 'workflow-kit', contentHash: HASH_A, kitVersion: '3.25.0', verified: true, tierExitCodes: [0, 0], observedAt: NOW },
  install_run: { repoLocalId: 'workflow-kit', eventCode: 'installed', kitVersion: '3.25.0', observedAt: NOW },
  error_signal: { runId: null, tokenSubjectId: SUBJECT, errorType: 'verification', phaseId: 'B11', reasonCode: 'tier_failed', kitVersion: '3.25.0', occurredAt: NOW },
  learning_aggregate: { lessonCode: 'selector_contract', metricCode: 'verified_rate', count: 10, ratePpm: 900_000, evidenceHash: HASH_A, bucketStart: '2026-08-14T00:00:00.000Z' },
  release_dossier: { version: '3.25.0', inputHash: HASH_A, verdictHash: HASH_B, runCount: 10, passedCount: 9, recommendationCode: 'hold', canaryStatus: 'not_run', lessonCodes: ['selector_contract'], createdAt: NOW },
}

function input(family: CentralFamily = 'command_run', overrides: Record<string, unknown> = {}) {
  return {
    writerId: `kit.test.${family}`,
    context,
    grant: grant(family === 'learning_aggregate' ? 'learning_metrics' : 'essential_operations'),
    family,
    payload: payloads[family],
    clock,
    opaqueIdentifierPort,
    ...overrides,
  }
}

function receipt(attempt: CentralWriteAttempt, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: PRIVACY_WRITER_SCHEMA_VERSION,
    policyVersion: PRIVACY_POLICY_VERSION,
    writerId: attempt.writerId,
    tenantId: attempt.record.tenantId,
    family: attempt.record.family,
    recordHash: attempt.record.recordHash,
    persistenceId: PERSISTENCE,
    replayed: false,
    storedAt: NOW,
    ...overrides,
  }
}

function sinkFor(families: readonly CentralFamily[], persist: CentralWriterSinkCapability['persist']): CentralWriterSinkCapability {
  return { schemaVersion: 1, policyVersion: PRIVACY_POLICY_VERSION, capabilityId: 'tenant_sink_v1', tenantId: TENANT, families, persist }
}

async function main(): Promise<void> {
  await assertion('attempt construction is exact, immutable, deterministic, and round-trips', () => {
    const first = buildCentralWriteAttempt(input())
    const second = buildCentralWriteAttempt(input())
    assert.deepEqual(first, second)
    assert.ok(Object.isFrozen(first) && Object.isFrozen(first.record) && Object.isFrozen(first.record.data))
    assert.deepEqual(validateCentralWriteAttempt(structuredClone(first)), first)
    assert.doesNotMatch(JSON.stringify(first), /workflow-kit/)
  })

  await assertion('all eight families reach an explicitly enabled sink and return bound receipts', async () => {
    for (const family of CENTRAL_FAMILIES) {
      let calls = 0
      const selected = input(family)
      const result = await executeCentralWrite({ ...selected, sinkCapability: sinkFor(CENTRAL_FAMILIES, async (attempt) => { calls += 1; return receipt(attempt) }) })
      assert.equal(result.ok, true, family)
      assert.equal(calls, 1)
      if (result.ok) {
        assert.equal(result.statusCode, 'persisted')
        assert.equal(result.receipt.family, family)
        assert.equal(result.receipt.recordHash, buildCentralWriteAttempt(selected).record.recordHash)
      }
    }
  })

  await assertion('replay is explicit and a construct-only request is never called persisted', async () => {
    const selected = input()
    const replayed = await executeCentralWrite({ ...selected, sinkCapability: sinkFor(['command_run'], async (attempt) => receipt(attempt, { replayed: true })) })
    assert.equal(replayed.ok, true)
    if (replayed.ok) assert.equal(replayed.statusCode, 'replayed')
    const blocked = await executeCentralWrite({ ...selected, sinkCapability: null })
    assert.deepEqual(blocked, { ok: false, statusCode: 'blocked', reasonCode: 'sink_capability_unavailable', privacyReasonCode: null, ruleId: 'writer.sink_missing', receipt: null })
  })

  await assertion('language-neutral schema exposes four exact public envelopes', () => {
    const schema = JSON.parse(fs.readFileSync(path.resolve('docs/schemas/privacy-writer.schema.json'), 'utf8'))
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.oneOf.length, 4)
    for (const name of ['centralWriteAttempt', 'sinkCapabilityDescriptor', 'centralWriteReceipt', 'blockedResult']) assert.equal(schema.$defs[name].additionalProperties, false)
  })

  await attack('policy rejection prevents sink invocation and never echoes prohibited content', async () => {
    let calls = 0
    const secret = 'Bearer abcdefghijklmnop'
    const result = await executeCentralWrite({ ...input('command_run', { payload: { ...payloads.command_run, args: secret } }), sinkCapability: sinkFor(['command_run'], async (attempt) => { calls += 1; return receipt(attempt) }) })
    assert.equal(calls, 0)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reasonCode, 'policy_rejected')
    assert.doesNotMatch(JSON.stringify(result), /Bearer|abcdefghijklmnop/)
  })

  await attack('missing and mismatched capabilities block before I/O', async () => {
    const selected = input()
    let calls = 0
    const persist = async (attempt: CentralWriteAttempt) => { calls += 1; return receipt(attempt) }
    const candidates: unknown[] = [
      undefined,
      {},
      { ...sinkFor(['command_run'], persist), tenantId: OTHER_TENANT },
      { ...sinkFor(['token_usage'], persist) },
      { ...sinkFor(['command_run'], persist), policyVersion: 'p17-016-v0' },
      { ...sinkFor(['command_run'], persist), families: ['command_run', 'command_run'] },
      { ...sinkFor(['command_run'], persist), families: ['token_usage', 'command_run'] },
      { ...sinkFor(['command_run'], persist), extra: true },
    ]
    for (const sinkCapability of candidates) {
      const result = await executeCentralWrite({ ...selected, sinkCapability })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reasonCode, 'sink_capability_unavailable')
    }
    assert.equal(calls, 0)
  })

  await attack('receipt validation rejects every unbound or malformed response', async () => {
    const selected = input()
    const attempt = buildCentralWriteAttempt(selected)
    const candidates = [
      null,
      { ...receipt(attempt), extra: true },
      { ...receipt(attempt), policyVersion: 'p17-016-v0' },
      { ...receipt(attempt), writerId: 'kit.other.writer' },
      { ...receipt(attempt), tenantId: OTHER_TENANT },
      { ...receipt(attempt), family: 'token_usage' },
      { ...receipt(attempt), recordHash: HASH_B },
      { ...receipt(attempt), persistenceId: 'not-a-uuid' },
      { ...receipt(attempt), replayed: 'false' },
      { ...receipt(attempt), storedAt: 'not-a-time' },
    ]
    for (const candidate of candidates) {
      const result = await executeCentralWrite({ ...selected, sinkCapability: sinkFor(['command_run'], async () => candidate) })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reasonCode, 'sink_response_refused')
    }
    assert.throws(() => validateCentralWriteReceipt({ ...receipt(attempt), extra: true }, attempt), /privacy writer boundary refused/)
  })

  await attack('sink exceptions collapse to a closed secret-safe result', async () => {
    const result = await executeCentralWrite({ ...input(), sinkCapability: sinkFor(['command_run'], async () => { throw new Error('token=super-secret C:/private/path') }) })
    assert.deepEqual(result, { ok: false, statusCode: 'blocked', reasonCode: 'storage_unavailable', privacyReasonCode: null, ruleId: 'writer.sink_failed', receipt: null })
    assert.doesNotMatch(JSON.stringify(result), /super-secret|private\/path/)
  })

  await attack('sink cannot mutate the frozen attempt it receives', async () => {
    let receivedData: Record<string, unknown> | null = null
    const result = await executeCentralWrite({
      ...input(),
      sinkCapability: sinkFor(['command_run'], async (attempt) => {
        receivedData = attempt.record.data as Record<string, unknown>
        try { receivedData.args = 'private prompt' } catch { /* strict runtimes throw; loose runtimes still cannot mutate */ }
        return receipt(attempt)
      }),
    })
    assert.ok(receivedData)
    assert.equal(Object.hasOwn(receivedData, 'args'), false)
    assert.equal(result.ok, true)
    assert.doesNotMatch(JSON.stringify(result), /private prompt/)
  })

  await attack('request and attempt envelopes reject unknown fields, bad writer IDs, and malicious prototypes', async () => {
    const extra = await executeCentralWrite({ ...input(), extra: true, sinkCapability: null } as any)
    assert.equal(extra.ok, false)
    const badId = await executeCentralWrite({ ...input(), writerId: '../writer', sinkCapability: null })
    assert.equal(badId.ok, false)
    const inherited = Object.create({ writerId: 'kit.test.command' })
    Object.assign(inherited, input())
    assert.throws(() => buildCentralWriteAttempt(inherited), /privacy writer boundary refused/)
    assert.throws(() => validateCentralWriteAttempt({ ...buildCentralWriteAttempt(input()), extra: true }), /privacy writer boundary refused/)
  })

  await attack('shared writer core has no storage, provider, environment, process, filesystem, or UI dependency', () => {
    const source = fs.readFileSync(path.resolve('packages/core/src/privacy-writer.ts'), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
    assert.deepEqual(imports, ['./privacy-policy'])
    for (const forbidden of ['process.', 'process[', 'fetch(', 'readFile', 'writeFile', 'supabase', 'react', 'next/', 'playwright', 'child_process', 'node:fs', 'node:net', 'node:http']) {
      assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
    }
  })

  assert.deepEqual(PRIVACY_WRITER_REASON_CODES, ['invalid_writer_request', 'policy_rejected', 'sink_capability_unavailable', 'sink_response_refused', 'storage_unavailable'])
  assert.ok(attacks >= 7)
  console.log(`privacy-writer.test: PASS (${assertions} contract groups, ${attacks} attack groups, ${CENTRAL_FAMILIES.length} families)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
