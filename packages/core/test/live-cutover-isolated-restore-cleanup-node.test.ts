import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  C5B_POLICY_VERSION,
  C5B_SCHEMA_VERSION,
  createC5BOperationReceipt,
  createC5BPreflightPacket,
  type C5BOperation,
  type C5BOperationReceipt,
  type C5BPreflightPacket,
} from '../src/live-cutover-preflight'
import {
  runC5BPreflightOperator,
  type C5BOperatorContext,
  type C5BOperatorPorts,
  type C5BPortDecision,
} from '../src/live-cutover-preflight-operator'
import {
  createC5BIsolatedRestoreCleanupNodePorts,
  type C5BIsolatedRestoreCleanupConfig,
  type C5BIsolatedRestoreCleanupRequest,
  type C5BIsolatedRestoreCleanupSources,
  type C5BIsolatedRestoreResidualRequest,
} from '../src/live-cutover-isolated-restore-cleanup-node'

const HASHES = Array.from({ length: 16 }, (_value, index) => (index + 1).toString(16).padStart(2, '0').repeat(32))
const START = '2026-08-20T01:00:00.000Z'
const END = '2026-08-20T02:00:00.000Z'
const CLEANUP_START = '2026-08-20T01:00:07.000Z'
const CLEANUP_MIDDLE = '2026-08-20T01:00:07.250Z'
const CLEANUP_END = '2026-08-20T01:00:07.500Z'
const CAPABILITY_ID = 'isolated_cleanup_capability'
const RAW_ERROR = 'private_provider_cleanup_error'

function packet(attemptId = '123e4567-e89b-42d3-a456-426614174000'): C5BPreflightPacket {
  return createC5BPreflightPacket({
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId,
    approvalRef: 'approval_c5b',
    environmentClass: 'managed_nonproduction',
    freezeStartsAt: START,
    freezeExpiresAt: END,
    destinationCapabilityId: 'protected_backup',
    source: {
      migration0018Sha256: HASHES[0], migration0019Sha256: HASHES[1],
      rollback0018Sha256: HASHES[2], rollback0019Sha256: HASHES[3],
    },
    requirements: {
      providerRecoveryPoint: true, encryptedLogicalBackup: true,
      isolatedRestore: true, metadataOnlyEvidence: true,
    },
    limits: { maxStepDurationMs: 60_000, maxBackupBytes: 1_000_000, maxObjectCount: 100 },
  })
}

function evidence(operation: Exclude<C5BOperation, 'complete_preflight'>, value: C5BPreflightPacket): Record<string, unknown> {
  switch (operation) {
    case 'attest_project': return {
      projectMatch: true, environmentClass: value.environmentClass, attestedAt: '2026-08-20T01:00:00.250Z',
    }
    case 'probe_catalog_acl': return {
      catalogHash: HASHES[4], aclHash: HASHES[5], rpcHash: HASHES[6], policyHash: HASHES[7],
      extensionHash: HASHES[8], migrationObjectCount: 4, writerActivityCount: 0,
    }
    case 'freeze_writers': return { freezeConfirmed: true, activeWriterCount: 0 }
    case 'create_provider_recovery_point': return {
      recoveryPointCreated: true, recoveryPointMetadataHash: HASHES[9], expiresAt: '2026-08-21T01:00:00.000Z',
    }
    case 'create_encrypted_logical_backup': return {
      encrypted: true, byteCount: 4096, backupSha256: HASHES[10], manifestSha256: HASHES[11],
      expiresAt: '2026-08-21T01:00:00.000Z',
    }
    case 'restore_isolated_backup': return {
      restored: true, isolated: true, sourceBackupSha256: HASHES[10], restoreManifestSha256: HASHES[11],
    }
    case 'verify_restored_state': return {
      catalogHash: HASHES[4], aclHash: HASHES[5], sourceBindingHash: value.sourceBindingHash,
      sourceParity: true, rollbackSuitePassed: true,
    }
    case 'cleanup_isolated_restore': return { cleanupConfirmed: true, residualResourceCount: 0 }
  }
}

function context(value = packet(), count = 7): C5BOperatorContext {
  const operations = [
    'attest_project', 'probe_catalog_acl', 'freeze_writers', 'create_provider_recovery_point',
    'create_encrypted_logical_backup', 'restore_isolated_backup', 'verify_restored_state',
  ] as const
  const receipts: C5BOperationReceipt[] = operations.slice(0, count).map((operation, index) =>
    createC5BOperationReceipt(value, {
      operation,
      status: 'passed',
      reasonCode: null,
      startedAt: new Date(Date.parse(START) + index * 1_000).toISOString(),
      completedAt: new Date(Date.parse(START) + index * 1_000 + 500).toISOString(),
      evidence: evidence(operation, value),
    }))
  return Object.freeze({ packet: value, receipts: Object.freeze(receipts) })
}

function clock(values: readonly string[] = [CLEANUP_START, CLEANUP_MIDDLE, CLEANUP_END]): () => string {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}

function config(overrides: Partial<C5BIsolatedRestoreCleanupConfig> = {}): C5BIsolatedRestoreCleanupConfig {
  return {
    expectedCleanupCapabilityId: CAPABILITY_ID,
    maxCleanupTokenBytes: 64,
    timeoutMs: 1_000,
    now: clock(),
    ...overrides,
  }
}

function tokenHash(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

interface Hooks {
  cleanup?: (request: C5BIsolatedRestoreCleanupRequest) => Promise<unknown>
  observe?: (request: C5BIsolatedRestoreResidualRequest) => Promise<unknown>
}

function sources(value = packet(), hooks: Hooks = {}): {
  sources: C5BIsolatedRestoreCleanupSources
  calls: string[]
  rawTokens: Uint8Array[]
  observedTokens: Uint8Array[]
} {
  const calls: string[] = []
  const rawTokens: Uint8Array[] = []
  const observedTokens: Uint8Array[] = []
  return {
    calls,
    rawTokens,
    observedTokens,
    sources: {
      cleanupSource: {
        cleanupIsolatedRestore: hooks.cleanup ?? (async (request) => {
          calls.push('cleanup')
          const cleanupToken = new Uint8Array([1, 2, 3, 4])
          rawTokens.push(cleanupToken)
          return {
            cleanupCapabilityId: CAPABILITY_ID,
            attemptId: request.attemptId,
            packetHash: request.packetHash,
            sourceBackupSha256: request.sourceBackupSha256,
            restoreManifestSha256: request.restoreManifestSha256,
            cleanupConfirmed: true,
            cleanupToken,
          }
        }),
      },
      observationSource: {
        observeIsolatedRestoreResidual: hooks.observe ?? (async (request) => {
          calls.push('observe')
          observedTokens.push(request.cleanupToken)
          return {
            cleanupCapabilityId: CAPABILITY_ID,
            attemptId: request.attemptId,
            packetHash: request.packetHash,
            sourceBackupSha256: request.sourceBackupSha256,
            restoreManifestSha256: request.restoreManifestSha256,
            cleanupTokenSha256: tokenHash(request.cleanupToken),
            cleanupConfirmed: true,
            residualResourceCount: 0,
          }
        }),
      },
    },
  }
}

function cleanupResult(value: C5BIsolatedRestoreCleanupRequest, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cleanupCapabilityId: CAPABILITY_ID,
    attemptId: value.attemptId,
    packetHash: value.packetHash,
    sourceBackupSha256: value.sourceBackupSha256,
    restoreManifestSha256: value.restoreManifestSha256,
    cleanupConfirmed: true,
    cleanupToken: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
  }
}

function observationResult(value: C5BIsolatedRestoreResidualRequest, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cleanupCapabilityId: CAPABILITY_ID,
    attemptId: value.attemptId,
    packetHash: value.packetHash,
    sourceBackupSha256: value.sourceBackupSha256,
    restoreManifestSha256: value.restoreManifestSha256,
    cleanupTokenSha256: tokenHash(value.cleanupToken),
    cleanupConfirmed: true,
    residualResourceCount: 0,
    ...overrides,
  }
}

async function main(): Promise<void> {
  let passed = 0
  const test = async (name: string, run: () => void | Promise<void>) => {
    await run()
    passed += 1
    console.log(`PASS ${name}`)
  }

  await test('A1 rejects malformed, accessor, symbol, proxy, and aliased capability configuration', async () => {
    const base = sources().sources
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts({ ...config(), extra: true } as never, base))
    const accessor = Object.defineProperty({}, 'timeoutMs', { enumerable: true, get: () => 1_000 })
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts(accessor as never, base))
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts(config(), { ...base, [Symbol('x')]: true } as never))
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts(config(), new Proxy(base, {
      ownKeys: () => { throw new Error(RAW_ERROR) },
    })))
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts(config(), {
      cleanupSource: base.cleanupSource,
      observationSource: base.cleanupSource as never,
    }))
    const same = async () => ({})
    assert.throws(() => createC5BIsolatedRestoreCleanupNodePorts(config(), {
      cleanupSource: { cleanupIsolatedRestore: same },
      observationSource: { observeIsolatedRestoreResidual: same },
    }))
  })

  await test('P1 admits only the exact seven-receipt prefix and refuses concurrent/sequential replay', async () => {
    const invalid = sources()
    const invalidPorts = createC5BIsolatedRestoreCleanupNodePorts(config(), invalid.sources)
    assert.deepEqual(await invalidPorts.cleanupIsolatedRestore({ packet: packet(), receipts: [] }), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    assert.deepEqual(invalid.calls, [])

    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const concurrent = sources(packet(), { cleanup: async (request) => {
      concurrent.calls.push('cleanup')
      await gate
      return cleanupResult(request)
    } })
    const ports = createC5BIsolatedRestoreCleanupNodePorts(config(), concurrent.sources)
    const first = ports.cleanupIsolatedRestore(context())
    await Promise.resolve()
    assert.deepEqual(await ports.cleanupIsolatedRestore(context()), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    release()
    assert.equal((await first).status, 'passed')
    assert.deepEqual(await ports.cleanupIsolatedRestore(context(packet('123e4567-e89b-42d3-a456-426614174001'))), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    const missing = createC5BIsolatedRestoreCleanupNodePorts(config(), sources().sources)
    assert.equal((await missing.cleanupIsolatedRestore(context(packet(), 6))).status, 'refused')
  })

  await test('O1 refuses cleanup binding drift, malformed output, refusal, and oversized token before observation', async () => {
    const attacks: Array<(request: C5BIsolatedRestoreCleanupRequest) => unknown> = [
      (request) => cleanupResult(request, { attemptId: '123e4567-e89b-42d3-a456-426614174099' }),
      (request) => cleanupResult(request, { packetHash: HASHES[14] }),
      (request) => cleanupResult(request, { sourceBackupSha256: HASHES[14] }),
      (request) => cleanupResult(request, { restoreManifestSha256: HASHES[14] }),
      (request) => cleanupResult(request, { cleanupCapabilityId: 'wrong_capability' }),
      (request) => cleanupResult(request, { cleanupConfirmed: false }),
      (request) => cleanupResult(request, { cleanupToken: new Uint8Array(65) }),
      (_request) => ({ refused: true }),
      (request) => Object.defineProperty(cleanupResult(request), 'cleanupToken', {
        enumerable: true, get: () => new Uint8Array([1]),
      }),
      (request) => ({ ...cleanupResult(request), [Symbol('unexpected')]: true }),
      (request) => new Proxy(cleanupResult(request), { ownKeys: () => { throw new Error(RAW_ERROR) } }),
    ]
    for (const attack of attacks) {
      const fixture = sources(packet(), { cleanup: async (request) => {
        fixture.calls.push('cleanup')
        return attack(request)
      } })
      const result = await createC5BIsolatedRestoreCleanupNodePorts(config(), fixture.sources)
        .cleanupIsolatedRestore(context())
      assert.deepEqual(result, { status: 'refused', reasonCode: 'cleanup_incomplete' })
      assert.deepEqual(fixture.calls, ['cleanup'])
    }
    const malformedToken = new Uint8Array([7, 7, 7])
    const malformed = sources(packet(), { cleanup: async (request) => cleanupResult(request, {
      cleanupToken: malformedToken, unexpected: true,
    }) })
    assert.equal((await createC5BIsolatedRestoreCleanupNodePorts(config(), malformed.sources)
      .cleanupIsolatedRestore(context())).status, 'refused')
    assert.deepEqual([...malformedToken], [0, 0, 0])
    const thrown = sources(packet(), { cleanup: async () => { throw new Error(RAW_ERROR) } })
    const result = await createC5BIsolatedRestoreCleanupNodePorts(config(), thrown.sources)
      .cleanupIsolatedRestore(context())
    assert.equal(JSON.stringify(result).includes(RAW_ERROR), false)
  })

  await test('R1 requires separately observed exact zero residual state and token binding', async () => {
    const attacks: Array<(request: C5BIsolatedRestoreResidualRequest) => unknown> = [
      (request) => observationResult(request, { residualResourceCount: 1 }),
      (request) => observationResult(request, { cleanupConfirmed: false }),
      (request) => observationResult(request, { cleanupTokenSha256: HASHES[15] }),
      (request) => observationResult(request, { attemptId: '123e4567-e89b-42d3-a456-426614174099' }),
      (request) => observationResult(request, { packetHash: HASHES[14] }),
      (request) => observationResult(request, { sourceBackupSha256: HASHES[14] }),
      (request) => observationResult(request, { restoreManifestSha256: HASHES[14] }),
      (request) => observationResult(request, { cleanupCapabilityId: 'wrong_capability' }),
      (_request) => ({ residualResourceCount: 0 }),
      (request) => Object.defineProperty(observationResult(request), 'residualResourceCount', {
        enumerable: true, get: () => 0,
      }),
      (request) => ({ ...observationResult(request), [Symbol('unexpected')]: true }),
      (request) => new Proxy(observationResult(request), { ownKeys: () => { throw new Error(RAW_ERROR) } }),
    ]
    for (const attack of attacks) {
      const seenTokens: Uint8Array[] = []
      const fixture = sources(packet(), { observe: async (request) => {
        fixture.calls.push('observe')
        seenTokens.push(request.cleanupToken)
        return attack(request)
      } })
      const result = await createC5BIsolatedRestoreCleanupNodePorts(config(), fixture.sources)
        .cleanupIsolatedRestore(context())
      assert.deepEqual(result, { status: 'refused', reasonCode: 'cleanup_incomplete' })
      assert.deepEqual(fixture.calls, ['cleanup', 'observe'])
      assert.deepEqual(fixture.rawTokens.map((value) => [...value]), [[0, 0, 0, 0]])
      assert.deepEqual(seenTokens.map((value) => [...value]), [[0, 0, 0, 0]])
    }
    const thrown = sources(packet(), { observe: async () => { throw new Error(RAW_ERROR) } })
    const thrownResult = await createC5BIsolatedRestoreCleanupNodePorts(config(), thrown.sources)
      .cleanupIsolatedRestore(context())
    assert.equal(JSON.stringify(thrownResult).includes(RAW_ERROR), false)
  })

  await test('D1 enforces one total deadline, aborts late cleanup, suppresses observation, and rejects clock rollback', async () => {
    let release!: (value: unknown) => void
    const late = new Promise<unknown>((resolve) => { release = resolve })
    let capturedSignal: AbortSignal | null = null
    const fixture = sources(packet(), { cleanup: async (request) => {
      fixture.calls.push('cleanup')
      capturedSignal = request.signal
      return late
    } })
    const ports = createC5BIsolatedRestoreCleanupNodePorts(config({ timeoutMs: 10 }), fixture.sources)
    const pending = ports.cleanupIsolatedRestore(context())
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.deepEqual(await pending, { status: 'refused', reasonCode: 'cleanup_incomplete' })
    const abortedSignal = capturedSignal as AbortSignal | null
    assert.notEqual(abortedSignal, null)
    assert.equal(abortedSignal?.aborted, true)
    const lateToken = new Uint8Array([9, 8, 7])
    release(cleanupResult({
      attemptId: packet().attemptId,
      environmentClass: packet().environmentClass,
      packetHash: packet().packetHash,
      sourceBackupSha256: HASHES[10],
      restoreManifestSha256: HASHES[11],
      freezeExpiresAt: END,
      signal: new AbortController().signal,
    }, { cleanupToken: lateToken }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.deepEqual([...lateToken], [0, 0, 0])
    assert.deepEqual(fixture.calls, ['cleanup'])

    let releaseObservation!: (value: unknown) => void
    const lateObservation = new Promise<unknown>((resolve) => { releaseObservation = resolve })
    let observationRequest: C5BIsolatedRestoreResidualRequest | null = null
    const observationFixture = sources(packet(), { observe: async (request) => {
      observationFixture.calls.push('observe')
      observationRequest = request
      return lateObservation
    } })
    const observationPorts = createC5BIsolatedRestoreCleanupNodePorts(
      config({ timeoutMs: 10, now: clock([CLEANUP_START, CLEANUP_MIDDLE]) }),
      observationFixture.sources,
    )
    const observationPending = observationPorts.cleanupIsolatedRestore(context())
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.deepEqual(await observationPending, { status: 'refused', reasonCode: 'cleanup_incomplete' })
    const capturedObservation = observationRequest as C5BIsolatedRestoreResidualRequest | null
    assert.notEqual(capturedObservation, null)
    assert.equal(capturedObservation?.signal.aborted, true)
    assert.deepEqual(capturedObservation ? [...capturedObservation.cleanupToken] : [], [0, 0, 0, 0])
    if (capturedObservation) releaseObservation(observationResult(capturedObservation))
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.deepEqual(observationFixture.calls, ['cleanup', 'observe'])

    const rollbackFixture = sources()
    const rollback = createC5BIsolatedRestoreCleanupNodePorts(config({
      now: clock([CLEANUP_START, '2026-08-20T01:00:06.900Z']),
    }), rollbackFixture.sources)
    assert.deepEqual(await rollback.cleanupIsolatedRestore(context()), {
      status: 'refused', reasonCode: 'freeze_window_invalid',
    })
  })

  await test('Z1 zeroizes source, owned, and observation token material on success', async () => {
    const fixture = sources()
    const result = await createC5BIsolatedRestoreCleanupNodePorts(config(), fixture.sources)
      .cleanupIsolatedRestore(context())
    assert.deepEqual(result, {
      status: 'passed', evidence: { cleanupConfirmed: true, residualResourceCount: 0 },
    })
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.evidence), true)
    assert.deepEqual(fixture.rawTokens.map((value) => [...value]), [[0, 0, 0, 0]])
    assert.deepEqual(fixture.observedTokens.map((value) => [...value]), [[0, 0, 0, 0]])
    assert.equal(JSON.stringify(result).includes(CAPABILITY_ID), false)
  })

  await test('I1 integrates with the real operator without skipping unfreeze or completion guards', async () => {
    const cleanupFixture = sources()
    const cleanup = createC5BIsolatedRestoreCleanupNodePorts(config(), cleanupFixture.sources)
    const calls: string[] = []
    let tick = 0
    const operatorClock = { now: () => new Date(Date.parse(START) + tick++ * 500).toISOString() }
    const before = (operation: Exclude<C5BOperation, 'cleanup_isolated_restore' | 'complete_preflight'>) =>
      async (operatorContext: C5BOperatorContext): Promise<C5BPortDecision> => {
        calls.push(operation)
        return { status: 'passed', evidence: evidence(operation, operatorContext.packet) }
      }
    const operatorPorts: C5BOperatorPorts = {
      attestProject: before('attest_project'),
      probeCatalogAcl: before('probe_catalog_acl'),
      freezeWriters: before('freeze_writers'),
      createProviderRecoveryPoint: before('create_provider_recovery_point'),
      createEncryptedLogicalBackup: before('create_encrypted_logical_backup'),
      restoreIsolatedBackup: before('restore_isolated_backup'),
      verifyRestoredState: before('verify_restored_state'),
      cleanupIsolatedRestore: async (operatorContext) => {
        calls.push('cleanup_isolated_restore')
        return cleanup.cleanupIsolatedRestore(operatorContext)
      },
      unfreezeWriters: async () => { calls.push('unfreeze_writers'); return { unfreezeConfirmed: true } },
    }
    const result = await runC5BPreflightOperator(packet(), { clock: operatorClock, ports: operatorPorts })
    assert.equal(result.ok, true)
    assert.equal(result.receipts.length, 9)
    assert.equal(calls.filter((value) => value === 'cleanup_isolated_restore').length, 1)
    assert.equal(calls.at(-1), 'unfreeze_writers')

    const residualFixture = sources(packet(), {
      observe: async (request) => observationResult(request, { residualResourceCount: 1 }),
    })
    const refusedCleanup = createC5BIsolatedRestoreCleanupNodePorts(config(), residualFixture.sources)
    let failureTick = 0
    const failedCalls: string[] = []
    const failed = await runC5BPreflightOperator(packet(), {
      clock: { now: () => new Date(Date.parse(START) + failureTick++ * 500).toISOString() },
      ports: {
        ...operatorPorts,
        cleanupIsolatedRestore: async (operatorContext) => {
          failedCalls.push('cleanup')
          return refusedCleanup.cleanupIsolatedRestore(operatorContext)
        },
        unfreezeWriters: async () => { failedCalls.push('unfreeze'); return { unfreezeConfirmed: true } },
      },
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.reasonCode, 'cleanup_incomplete')
    assert.deepEqual(failedCalls, ['cleanup', 'unfreeze'])
  })

  await test('N1 static boundary has no provider, process, database, filesystem, network, or logging surface', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src',
      'live-cutover-isolated-restore-cleanup-node.ts'), 'utf8')
    for (const forbidden of [
      "node:fs", "node:child_process", 'process.', 'console.', 'fetch(', 'supabase', 'postgres',
      'pg_dump', 'pg_restore', 'spawn(', 'exec(', 'unlink(', 'rm(',
    ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `forbidden surface: ${forbidden}`)
  })

  assert.equal(passed, 8)
  console.log('P17-016 C5B isolated-restore cleanup Node capability: PASS (8/8 groups)')
}

void main()
