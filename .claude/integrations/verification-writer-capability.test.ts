import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  CentralWriteAttempt,
  CentralWriterResult,
  CentralWriterSinkCapability,
} from './core/privacy-writer'
import type {
  ClockPort,
  OpaqueIdentifierPort,
  ProcessingGrant,
  TrustedTenantContext,
} from './core/privacy-policy'

const root = process.cwd()
const capabilityPath = path.join(root, '.claude', 'integrations', 'verification-writer-capability.ts')
const recordPath = path.join(root, '.claude', 'integrations', 'record-verify.ts')
const packagePath = path.join(root, 'package.json')
const expectedCommand = 'npx tsx .claude/integrations/verification-writer-capability.test.ts'

const TENANT = '10000000-0000-4000-8000-000000000001'
const OTHER_TENANT = '20000000-0000-4000-8000-000000000002'
const SUBJECT = '30000000-0000-4000-8000-000000000003'
const BINDING = '40000000-0000-4000-8000-000000000004'
const RUN = '50000000-0000-4000-8000-000000000005'
const PERSISTENCE = '60000000-0000-4000-8000-000000000006'
const NOW = '2026-08-16T10:00:00.000Z'

type CapabilityModule = Readonly<{
  executeVerificationWrite(input: unknown): Promise<CentralWriterResult>
}>

type VerifyNote = Readonly<{
  phase: string
  feature: string
  code_path: string
  spec_name: string | null
  tierA_exit: number
  tierB_exit: number | null
  verified: boolean
  content_hash: string
  coverage: string[]
  runner_run_id: string
  kit_version: string
  at: string
}>

type CapabilityDependencies = Readonly<{
  repoLocalId: string
  context: TrustedTenantContext
  grant: ProcessingGrant
  clock: ClockPort
  opaqueIdentifierPort: OpaqueIdentifierPort
  sinkCapability: CentralWriterSinkCapability
}>

type RecordModule = Readonly<{
  createVerificationWriterReceipt(note: VerifyNote, createdAt?: string): unknown
  persistVerificationWithCapability(note: VerifyNote, dependencies: CapabilityDependencies): Promise<CentralWriterResult>
}>

let passed = 0
let failed = 0

async function test(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readinessGaps(): string[] {
  const gaps: string[] = []
  if (!fs.existsSync(capabilityPath)) gaps.push('verification_writer_capability_source')
  const recordSource = fs.readFileSync(recordPath, 'utf8')
  if (!recordSource.includes('export function persistVerificationWithCapability(')) gaps.push('record_verify_explicit_bridge')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string> }
  if (packageJson.scripts?.['test:verification-writer-capability'] !== expectedCommand) gaps.push('focused_package_script')
  if (!packageJson.scripts?.['test:record-verify']?.includes('npm run test:verification-writer-capability')) gaps.push('record_verify_chain_registration')
  return gaps
}

function context(tenantId = TENANT): TrustedTenantContext {
  return {
    schemaVersion: 1,
    tenantId,
    subjectId: SUBJECT,
    sourceKind: 'server_session',
    credentialBindingId: BINDING,
    policyVersion: 'p17-016-v1',
  }
}

function grant(overrides: Partial<ProcessingGrant> = {}): ProcessingGrant {
  return {
    schemaVersion: 1,
    tenantId: TENANT,
    subjectId: SUBJECT,
    scope: 'essential_operations',
    policyVersion: 'p17-016-v1',
    decision: 'granted',
    purposeCode: 'verification_record',
    issuedAt: '2026-08-16T09:55:00.000Z',
    expiresAt: '2026-08-16T10:05:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

function note(): VerifyNote {
  return {
    phase: 'verify_complete',
    feature: 'PRIVATE_FEATURE_NAME',
    code_path: 'src/private/feature',
    spec_name: 'PRIVATE_SPEC_NAME',
    tierA_exit: 0,
    tierB_exit: 0,
    verified: true,
    content_hash: 'a'.repeat(64),
    coverage: ['src/private/feature/index.ts'],
    runner_run_id: RUN,
    kit_version: '3.25.0',
    at: NOW,
  }
}

function opaquePort(): OpaqueIdentifierPort {
  return {
    create(input) {
      assert.deepEqual(input, { tenantId: TENANT, namespace: 'repository', localIdentifier: 'private-repository' })
      return { opaqueId: `hmac_${'b'.repeat(64)}`, keyVersion: 'opaque_v1' }
    },
  }
}

function sink(
  persist: (attempt: CentralWriteAttempt) => Promise<unknown>,
  tenantId = TENANT,
): CentralWriterSinkCapability {
  return {
    schemaVersion: 1,
    policyVersion: 'p17-016-v1',
    capabilityId: 'verification_rpc_v1',
    tenantId,
    families: ['verification'],
    persist,
  }
}

function exactInput(sinkCapability: CentralWriterSinkCapability): Record<string, unknown> {
  return {
    runId: RUN,
    repoLocalId: 'private-repository',
    contentHash: 'a'.repeat(64),
    kitVersion: '3.25.0',
    verified: true,
    tierExitCodes: [0, 0],
    observedAt: NOW,
    context: context(),
    grant: grant(),
    clock: { now: () => NOW },
    opaqueIdentifierPort: opaquePort(),
    sinkCapability,
  }
}

function receiptFor(attempt: CentralWriteAttempt): Record<string, unknown> {
  return {
    schemaVersion: 1,
    policyVersion: 'p17-016-v1',
    writerId: 'kit.verification.record',
    tenantId: TENANT,
    family: 'verification',
    recordHash: attempt.record.recordHash,
    persistenceId: PERSISTENCE,
    replayed: false,
    storedAt: NOW,
  }
}

async function main(): Promise<void> {
  await test('C4C readiness artifacts are present and registered', () => {
    assert.deepEqual(readinessGaps(), [])
  })
  if (failed > 0) {
    console.error(`verification-writer-capability.test: ${passed} passed, ${failed} failed; gaps=${readinessGaps().join(',')}`)
    process.exitCode = 1
    return
  }

  const capability = await import(pathToFileURL(capabilityPath).href) as CapabilityModule
  const record = await import(pathToFileURL(recordPath).href) as RecordModule

  await test('exact capability constructs one verification attempt and returns a bound receipt', async () => {
    const attempts: CentralWriteAttempt[] = []
    const result = await capability.executeVerificationWrite(exactInput(sink(async (attempt) => {
      attempts.push(attempt)
      return receiptFor(attempt)
    })))
    assert.equal(result.ok, true)
    assert.equal(result.statusCode, 'persisted')
    assert.equal(attempts.length, 1)
    assert.equal(attempts[0].writerId, 'kit.verification.record')
    assert.equal(attempts[0].record.family, 'verification')
    assert.deepEqual(Object.keys(attempts[0].record.data).sort(), [
      'contentHash', 'kitVersion', 'observedAt', 'opaqueKeyVersion', 'repoOpaqueId',
      'runId', 'tierExitCodes', 'verified',
    ])
    assert.doesNotMatch(JSON.stringify(attempts[0]), /private-repository/)
  })

  await test('explicit note bridge projects only allowlisted verification fields', async () => {
    let serializedAttempt = ''
    const result = await record.persistVerificationWithCapability(note(), {
      repoLocalId: 'private-repository',
      context: context(),
      grant: grant(),
      clock: { now: () => NOW },
      opaqueIdentifierPort: opaquePort(),
      sinkCapability: sink(async (attempt) => {
        serializedAttempt = JSON.stringify(attempt)
        return receiptFor(attempt)
      }),
    })
    assert.equal(result.ok, true)
    for (const raw of ['PRIVATE_FEATURE_NAME', 'src/private/feature', 'PRIVATE_SPEC_NAME', 'index.ts', 'private-repository']) {
      assert.equal(serializedAttempt.includes(raw), false, `attempt leaked ${raw}`)
    }
  })

  await test('explicit note bridge converts malformed runtime callers into a closed result', async () => {
    const result = await record.persistVerificationWithCapability(null as never, null as never)
    assert.deepEqual(
      { ok: result.ok, reasonCode: result.reasonCode, ruleId: result.ok ? null : result.ruleId },
      { ok: false, reasonCode: 'invalid_writer_request', ruleId: 'verification.capability_request_refused' },
    )
  })

  await test('default record-verify call remains the exact B2B blocked receipt', () => {
    assert.deepEqual(record.createVerificationWriterReceipt(note(), NOW), {
      schemaVersion: 1,
      policyVersion: 'p17-016-v1',
      writerId: 'kit.verification.record',
      runId: RUN,
      tenantContextStatus: 'unavailable',
      outcome: 'blocked',
      reasonCode: 'tenant_attestation_unavailable',
      createdAt: NOW,
    })
    const source = fs.readFileSync(recordPath, 'utf8')
    assert.equal((source.match(/persistVerificationWithCapability\(/g) ?? []).length, 1)
    assert.equal((source.match(/const receipt = createVerificationWriterReceipt\(note\);/g) ?? []).length, 2)
  })

  await test('unknown, inherited, and malformed envelopes block before sink I/O', async () => {
    let calls = 0
    const noCallSink = sink(async (attempt) => {
      calls += 1
      return receiptFor(attempt)
    })
    for (const candidate of [
      { ...exactInput(noCallSink), rawPath: 'C:/private/source.ts' },
      Object.assign(Object.create({ tenantId: OTHER_TENANT }), exactInput(noCallSink)),
      { ...exactInput(noCallSink), tierExitCodes: [0, '0'] },
      { ...exactInput(noCallSink), tierExitCodes: [0, 256] },
    ]) {
      const result = await capability.executeVerificationWrite(candidate)
      assert.equal(result.ok, false)
      assert.equal(result.statusCode, 'blocked')
    }
    assert.equal(calls, 0)
  })

  await test('policy and sink capability mismatches fail closed before persistence', async () => {
    let calls = 0
    const noCallSink = sink(async (attempt) => {
      calls += 1
      return receiptFor(attempt)
    })
    const denied = await capability.executeVerificationWrite({
      ...exactInput(noCallSink),
      grant: grant({ purposeCode: 'other_purpose' }),
    })
    assert.equal(denied.ok, false)
    assert.equal(denied.reasonCode, 'policy_rejected')
    const wrongTenant = await capability.executeVerificationWrite(exactInput(sink(async (attempt) => {
      calls += 1
      return receiptFor(attempt)
    }, OTHER_TENANT)))
    assert.equal(wrongTenant.ok, false)
    assert.equal(wrongTenant.reasonCode, 'sink_capability_unavailable')
    assert.equal(calls, 0)
  })

  await test('sink exceptions and forged receipts collapse to closed results', async () => {
    const unavailable = await capability.executeVerificationWrite(exactInput(sink(async () => {
      throw new Error('SECRET provider detail')
    })))
    assert.deepEqual(
      { ok: unavailable.ok, reasonCode: unavailable.reasonCode, ruleId: unavailable.ok ? null : unavailable.ruleId },
      { ok: false, reasonCode: 'storage_unavailable', ruleId: 'writer.sink_failed' },
    )
    const forged = await capability.executeVerificationWrite(exactInput(sink(async (attempt) => ({
      ...receiptFor(attempt),
      recordHash: 'c'.repeat(64),
    }))))
    assert.equal(forged.ok, false)
    assert.equal(forged.reasonCode, 'sink_response_refused')
  })

  await test('capability source has no environment, filesystem, transport, dashboard, or raw-note dependency', () => {
    const capabilitySource = fs.readFileSync(capabilityPath, 'utf8')
    for (const pattern of [
      /process\.env/,
      /node:fs|from ['"]fs['"]/,
      /child_process/,
      /fetch\s*\(/,
      /https?:\/\//,
      /SUPABASE/,
      /createClient\s*\(/,
      /dashboard/i,
      /code_path|spec_name|coverage|feature/,
    ]) assert.doesNotMatch(capabilitySource, pattern)
  })

  console.log(`verification-writer-capability.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()
