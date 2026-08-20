import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  C5B_OPERATIONS,
  C5B_POLICY_VERSION,
  C5B_SCHEMA_VERSION,
  createC5BPreflightPacket,
  type C5BOperation,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from '../src/live-cutover-preflight'
import {
  runC5BPreflightOperator,
  type C5BOperatorClockPort,
  type C5BOperatorContext,
  type C5BOperatorPorts,
  type C5BPortDecision,
} from '../src/live-cutover-preflight-operator'

const hashes = Array.from({ length: 16 }, (_, index) => (index + 1).toString(16).repeat(64).slice(0, 64))
const secretControl = 'provider-secret-error-should-never-escape'

function packet(): C5BPreflightPacket {
  return createC5BPreflightPacket({
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: '123e4567-e89b-42d3-a456-426614174000',
    approvalRef: 'operator_approval',
    environmentClass: 'managed_nonproduction',
    freezeStartsAt: '2026-08-20T01:00:00.000Z',
    freezeExpiresAt: '2026-08-20T02:00:00.000Z',
    destinationCapabilityId: 'protected_backup',
    source: {
      migration0018Sha256: hashes[0],
      migration0019Sha256: hashes[1],
      rollback0018Sha256: hashes[2],
      rollback0019Sha256: hashes[3],
    },
    requirements: {
      providerRecoveryPoint: true,
      encryptedLogicalBackup: true,
      isolatedRestore: true,
      metadataOnlyEvidence: true,
    },
    limits: { maxStepDurationMs: 10_000, maxBackupBytes: 50_000, maxObjectCount: 100 },
  })
}

function evidence(operation: Exclude<C5BOperation, 'complete_preflight'>, value: C5BPreflightPacket): Record<string, unknown> {
  switch (operation) {
    case 'attest_project':
      return { projectMatch: true, environmentClass: value.environmentClass, attestedAt: '2026-08-20T01:00:00.500Z' }
    case 'probe_catalog_acl':
      return {
        catalogHash: hashes[4], aclHash: hashes[5], rpcHash: hashes[6], policyHash: hashes[7],
        extensionHash: hashes[8], migrationObjectCount: 4, writerActivityCount: 0,
      }
    case 'freeze_writers':
      return { freezeConfirmed: true, activeWriterCount: 0 }
    case 'create_provider_recovery_point':
      return { recoveryPointCreated: true, recoveryPointMetadataHash: hashes[9], expiresAt: '2026-08-21T02:00:00.000Z' }
    case 'create_encrypted_logical_backup':
      return { encrypted: true, byteCount: 4096, backupSha256: hashes[10], manifestSha256: hashes[11], expiresAt: '2026-08-21T02:00:00.000Z' }
    case 'restore_isolated_backup':
      return { restored: true, isolated: true, sourceBackupSha256: hashes[10], restoreManifestSha256: hashes[11] }
    case 'verify_restored_state':
      return { catalogHash: hashes[4], aclHash: hashes[5], sourceBindingHash: value.sourceBindingHash, sourceParity: true, rollbackSuitePassed: true }
    case 'cleanup_isolated_restore':
      return { cleanupConfirmed: true, residualResourceCount: 0 }
  }
}

class DeterministicClock implements C5BOperatorClockPort {
  private tick = 0

  now(): string {
    const value = new Date(Date.parse('2026-08-20T01:00:00.000Z') + this.tick * 1_000).toISOString()
    this.tick += 1
    return value
  }
}

type ExternalOperation = Exclude<C5BOperation, 'complete_preflight'>

class FakePorts implements C5BOperatorPorts {
  readonly calls: string[] = []
  readonly contexts: C5BOperatorContext[] = []
  readonly refusals = new Map<ExternalOperation, C5BReasonCode>()
  readonly thrown = new Set<ExternalOperation>()
  readonly malformed = new Set<ExternalOperation>()
  readonly overrides = new Map<ExternalOperation, Record<string, unknown>>()
  unfreezeConfirmed = true

  constructor(readonly clock: C5BOperatorClockPort = new DeterministicClock()) {}

  private async decide(operation: ExternalOperation, context: C5BOperatorContext): Promise<C5BPortDecision> {
    this.calls.push(operation)
    this.contexts.push(context)
    if (this.thrown.has(operation)) throw new Error(secretControl)
    const refused = this.refusals.get(operation)
    if (refused) return { status: 'refused', reasonCode: refused }
    if (this.malformed.has(operation)) return { status: 'passed', evidence: { providerError: secretControl } }
    return { status: 'passed', evidence: this.overrides.get(operation) ?? evidence(operation, context.packet) }
  }

  attestProject(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('attest_project', context) }
  probeCatalogAcl(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('probe_catalog_acl', context) }
  freezeWriters(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('freeze_writers', context) }
  createProviderRecoveryPoint(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('create_provider_recovery_point', context) }
  createEncryptedLogicalBackup(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('create_encrypted_logical_backup', context) }
  restoreIsolatedBackup(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('restore_isolated_backup', context) }
  verifyRestoredState(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('verify_restored_state', context) }
  cleanupIsolatedRestore(context: C5BOperatorContext): Promise<C5BPortDecision> { return this.decide('cleanup_isolated_restore', context) }

  async unfreezeWriters(context: C5BOperatorContext): Promise<unknown> {
    this.calls.push('unfreeze_writers')
    this.contexts.push(context)
    if (!this.unfreezeConfirmed) throw new Error(secretControl)
    return { unfreezeConfirmed: true }
  }
}

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

function expectedSuccessCalls(): string[] {
  return [...C5B_OPERATIONS.slice(0, 8), 'unfreeze_writers']
}

async function main(): Promise<void> {
  await test('A1/G1 success invokes exact ports, unfreezes before completion, and returns a frozen closed result', async () => {
    const ports = new FakePorts()
    const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
    assert.equal(result.ok, true)
    assert.deepEqual(ports.calls, expectedSuccessCalls())
    assert.equal(result.receipts.length, 9)
    assert.deepEqual(result.receipts.map((receipt) => receipt.operation), C5B_OPERATIONS)
    assert.equal(result.compensation.cleanupAttempted, false)
    assert.equal(result.compensation.cleanupConfirmed, true)
    assert.equal(result.compensation.unfreezeAttempted, true)
    assert.equal(result.compensation.unfreezeConfirmed, true)
    assert.ok(result.completion)
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.receipts), true)
    assert.equal(Object.isFrozen(result.compensation), true)
    for (let index = 0; index < ports.contexts.length - 1; index += 1) {
      assert.equal(ports.contexts[index].receipts.length, index)
    }
  })

  await test('G1 invalid packet and project mismatch stop before unauthorized ports', async () => {
    const invalidPorts = new FakePorts()
    const invalid = await runC5BPreflightOperator({ ...packet(), projectId: 'forbidden' }, {
      clock: invalidPorts.clock,
      ports: invalidPorts,
    })
    assert.equal(invalid.ok, false)
    assert.equal(invalid.reasonCode, 'invalid_packet')
    assert.deepEqual(invalidPorts.calls, [])

    const mismatchPorts = new FakePorts()
    mismatchPorts.overrides.set('attest_project', {
      projectMatch: false, environmentClass: 'managed_nonproduction', attestedAt: '2026-08-20T01:00:00.500Z',
    })
    const mismatch = await runC5BPreflightOperator(packet(), { clock: mismatchPorts.clock, ports: mismatchPorts })
    assert.equal(mismatch.ok, false)
    assert.equal(mismatch.reasonCode, 'project_mismatch')
    assert.deepEqual(mismatchPorts.calls, ['attest_project'])
  })

  await test('P1 every refusal stops later ports and unfreezes only after a successful freeze', async () => {
    const operations = C5B_OPERATIONS.slice(0, 8) as ExternalOperation[]
    for (let index = 0; index < operations.length; index += 1) {
      const ports = new FakePorts()
      ports.refusals.set(operations[index], 'provider_operation_refused')
      const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
      assert.equal(result.ok, false, `${operations[index]} unexpectedly passed`)
      const reached: string[] = operations.slice(0, index + 1)
      if (index === 5 || index === 6) reached.push('cleanup_isolated_restore')
      if (index >= 3) reached.push('unfreeze_writers')
      assert.deepEqual(ports.calls, reached)
      assert.equal(ports.calls.includes('unfreeze_writers'), index >= 3)
      assert.equal(ports.calls.includes('complete_preflight'), false)
    }
  })

  await test('P1 malformed evidence and port exceptions collapse without provider text or later calls', async () => {
    for (const mode of ['malformed', 'throw'] as const) {
      const ports = new FakePorts()
      if (mode === 'malformed') ports.malformed.add('create_provider_recovery_point')
      else ports.thrown.add('create_provider_recovery_point')
      const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
      assert.equal(result.ok, false)
      assert.equal(result.reasonCode, mode === 'malformed' ? 'invalid_receipt' : 'provider_operation_refused')
      assert.equal(JSON.stringify(result).includes(secretControl), false)
      assert.equal(ports.calls.includes('create_encrypted_logical_backup'), false)
      assert.equal(ports.calls.at(-1), 'unfreeze_writers')
    }
  })

  await test('C1 restore attempt triggers one cleanup; earlier refusal triggers none; canonical cleanup never retries', async () => {
    const beforeRestore = new FakePorts()
    beforeRestore.refusals.set('create_encrypted_logical_backup', 'logical_backup_invalid')
    const early = await runC5BPreflightOperator(packet(), { clock: beforeRestore.clock, ports: beforeRestore })
    assert.equal(early.ok, false)
    assert.equal(beforeRestore.calls.filter((call) => call === 'cleanup_isolated_restore').length, 0)

    const restoreFailure = new FakePorts()
    restoreFailure.refusals.set('restore_isolated_backup', 'restore_invalid')
    const restored = await runC5BPreflightOperator(packet(), { clock: restoreFailure.clock, ports: restoreFailure })
    assert.equal(restored.ok, false)
    assert.equal(restoreFailure.calls.filter((call) => call === 'cleanup_isolated_restore').length, 1)
    assert.equal(restored.compensation.cleanupAttempted, true)
    assert.equal(restored.compensation.cleanupConfirmed, true)

    const cleanupFailure = new FakePorts()
    cleanupFailure.refusals.set('cleanup_isolated_restore', 'cleanup_incomplete')
    const cleanup = await runC5BPreflightOperator(packet(), { clock: cleanupFailure.clock, ports: cleanupFailure })
    assert.equal(cleanup.ok, false)
    assert.equal(cleanup.reasonCode, 'cleanup_incomplete')
    assert.equal(cleanupFailure.calls.filter((call) => call === 'cleanup_isolated_restore').length, 1)
    assert.equal(cleanupFailure.calls.at(-1), 'unfreeze_writers')
  })

  await test('C1 failed cleanup compensation dominates and is never retried', async () => {
    const ports = new FakePorts()
    ports.thrown.add('verify_restored_state')
    ports.refusals.set('cleanup_isolated_restore', 'cleanup_incomplete')
    const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
    assert.equal(result.ok, false)
    assert.equal(result.reasonCode, 'cleanup_incomplete')
    assert.equal(ports.calls.filter((call) => call === 'cleanup_isolated_restore').length, 1)
    assert.equal(result.compensation.cleanupAttempted, true)
    assert.equal(result.compensation.cleanupConfirmed, false)

    const residual = new FakePorts()
    residual.thrown.add('verify_restored_state')
    residual.overrides.set('cleanup_isolated_restore', { cleanupConfirmed: true, residualResourceCount: 1 })
    const residualResult = await runC5BPreflightOperator(packet(), { clock: residual.clock, ports: residual })
    assert.equal(residualResult.ok, false)
    assert.equal(residualResult.reasonCode, 'cleanup_incomplete')
    assert.equal(residualResult.compensation.cleanupConfirmed, false)
    assert.equal(residual.calls.filter((call) => call === 'cleanup_isolated_restore').length, 1)
  })

  await test('C1 unfreeze failure prevents complete_preflight and exposes no completion receipt', async () => {
    const ports = new FakePorts()
    ports.unfreezeConfirmed = false
    const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
    assert.equal(result.ok, false)
    assert.equal(result.reasonCode, 'provider_operation_refused')
    assert.equal(result.failedStage, 'unfreeze_writers')
    assert.equal(result.completion, null)
    assert.equal(result.receipts.length, 8)
    assert.equal(result.compensation.unfreezeAttempted, true)
    assert.equal(result.compensation.unfreezeConfirmed, false)
  })

  await test('G1 forged semantic evidence and non-monotonic clock stop before the next capability', async () => {
    const forged = new FakePorts()
    forged.overrides.set('freeze_writers', { freezeConfirmed: true, activeWriterCount: 1 })
    const forgedResult = await runC5BPreflightOperator(packet(), { clock: forged.clock, ports: forged })
    assert.equal(forgedResult.ok, false)
    assert.equal(forgedResult.reasonCode, 'writer_activity_detected')
    assert.equal(forged.calls.includes('create_provider_recovery_point'), false)
    assert.equal(forged.calls.at(-1), 'unfreeze_writers')

    const times = ['2026-08-20T01:00:02.000Z', '2026-08-20T01:00:01.000Z']
    const clock: C5BOperatorClockPort = { now: () => times.shift() ?? '2026-08-20T01:00:03.000Z' }
    const invalidTime = new FakePorts(clock)
    const timeResult = await runC5BPreflightOperator(packet(), { clock, ports: invalidTime })
    assert.equal(timeResult.ok, false)
    assert.equal(timeResult.reasonCode, 'invalid_receipt')
    assert.deepEqual(invalidTime.calls, ['attest_project'])
  })

  await test('R1 runtime source and results exclude infrastructure and privacy-bearing surfaces', async () => {
    const runtimePath = path.join(process.cwd(), 'packages', 'core', 'src', 'live-cutover-preflight-operator.ts')
    const source = fs.readFileSync(runtimePath, 'utf8')
    for (const pattern of [
      /node:fs|from ['"]fs['"]/,
      /child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(/,
      /process\.env|SUPABASE|postgres|pg_dump|psql/i,
      /fetch\s*\(|https?:\/\//,
      /projectId|projectRef|connectionString|password|serviceRole/i,
      /backupBytes|sqlBody|providerError/,
    ]) assert.doesNotMatch(source, pattern)

    const ports = new FakePorts()
    ports.thrown.add('restore_isolated_backup')
    const result = await runC5BPreflightOperator(packet(), { clock: ports.clock, ports })
    const serialized = JSON.stringify(result)
    for (const candidate of [secretControl, 'https://', 'password', 'service_role', 'backupBytes']) {
      assert.equal(serialized.includes(candidate), false, `operator result leaked ${candidate}`)
    }
  })

  console.log(`live-cutover-preflight-operator.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
