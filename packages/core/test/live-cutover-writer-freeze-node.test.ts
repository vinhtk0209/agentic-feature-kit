import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  C5B_POLICY_VERSION,
  C5B_SCHEMA_VERSION,
  createC5BOperationReceipt,
  createC5BPreflightPacket,
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
  createC5BWriterFreezeNodePorts,
  type C5BWriterFreezeAcquireRequest,
  type C5BWriterFreezeConfig,
  type C5BWriterFreezeObservationRequest,
  type C5BWriterFreezeReleaseRequest,
  type C5BWriterFreezeSources,
} from '../src/live-cutover-writer-freeze-node'

const HASHES = Array.from({ length: 12 }, (_value, index) => (index + 1).toString(16).padStart(2, '0').repeat(32))
const START = '2026-08-20T02:00:00.000Z'
const END = '2026-08-20T03:00:00.000Z'
const NOW = '2026-08-20T02:10:00.000Z'

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
      migration0018Sha256: HASHES[0],
      migration0019Sha256: HASHES[1],
      rollback0018Sha256: HASHES[2],
      rollback0019Sha256: HASHES[3],
    },
    requirements: {
      providerRecoveryPoint: true,
      encryptedLogicalBackup: true,
      isolatedRestore: true,
      metadataOnlyEvidence: true,
    },
    limits: { maxStepDurationMs: 60_000, maxBackupBytes: 1_000_000, maxObjectCount: 100 },
  })
}

function receipt(
  value: C5BPreflightPacket,
  operation: 'attest_project' | 'probe_catalog_acl' | 'freeze_writers',
  evidence: Record<string, unknown>,
  minute: number,
): C5BOperationReceipt {
  const time = `2026-08-20T02:${minute.toString().padStart(2, '0')}:00.000Z`
  return createC5BOperationReceipt(value, {
    operation,
    status: 'passed',
    reasonCode: null,
    startedAt: time,
    completedAt: time,
    evidence,
  })
}

function freezeContext(value = packet()): C5BOperatorContext {
  return {
    packet: value,
    receipts: [
      receipt(value, 'attest_project', {
        projectMatch: true,
        environmentClass: value.environmentClass,
        attestedAt: '2026-08-20T02:01:00.000Z',
      }, 1),
      receipt(value, 'probe_catalog_acl', {
        catalogHash: HASHES[4],
        aclHash: HASHES[5],
        rpcHash: HASHES[6],
        policyHash: HASHES[7],
        extensionHash: HASHES[8],
        migrationObjectCount: 4,
        writerActivityCount: 1,
      }, 2),
    ],
  }
}

function frozenContext(context: C5BOperatorContext): C5BOperatorContext {
  return {
    packet: context.packet,
    receipts: [
      ...context.receipts,
      receipt(context.packet, 'freeze_writers', { freezeConfirmed: true, activeWriterCount: 0 }, 3),
    ],
  }
}

function config(overrides: Partial<C5BWriterFreezeConfig> = {}): C5BWriterFreezeConfig {
  return { maxLeaseTokenBytes: 64, timeoutMs: 1_000, now: () => NOW, ...overrides }
}

interface HarnessHooks {
  acquire?: (request: C5BWriterFreezeAcquireRequest) => Promise<unknown>
  observe?: (request: C5BWriterFreezeObservationRequest, index: number) => Promise<unknown>
  release?: (request: C5BWriterFreezeReleaseRequest) => Promise<unknown>
}

function harness(hooks: HarnessHooks = {}): {
  sources: C5BWriterFreezeSources
  acquireCalls: C5BWriterFreezeAcquireRequest[]
  observeCalls: C5BWriterFreezeObservationRequest[]
  releaseCalls: C5BWriterFreezeReleaseRequest[]
  sourceTokens: Uint8Array[]
} {
  const acquireCalls: C5BWriterFreezeAcquireRequest[] = []
  const observeCalls: C5BWriterFreezeObservationRequest[] = []
  const releaseCalls: C5BWriterFreezeReleaseRequest[] = []
  const sourceTokens: Uint8Array[] = []
  return {
    acquireCalls,
    observeCalls,
    releaseCalls,
    sourceTokens,
    sources: {
      controlSource: {
        acquireWriterFreeze: async (request) => {
          acquireCalls.push(request)
          if (hooks.acquire) return hooks.acquire(request)
          const leaseToken = Uint8Array.from([1, 2, 3, 4])
          sourceTokens.push(leaseToken)
          return { leaseToken, leaseExpiresAt: END }
        },
        releaseWriterFreeze: async (request) => {
          releaseCalls.push(request)
          return hooks.release ? hooks.release(request) : { releaseConfirmed: true }
        },
      },
      observationSource: {
        observeWriterFreeze: async (request) => {
          const index = observeCalls.length
          observeCalls.push(request)
          if (hooks.observe) return hooks.observe(request, index)
          return { freezeActive: index === 0, activeWriterCount: 0, leaseExpiresAt: END }
        },
      },
    },
  }
}

function assertPassed(value: C5BPortDecision): void {
  assert.deepEqual(value, { status: 'passed', evidence: { freezeConfirmed: true, activeWriterCount: 0 } })
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.status === 'passed' ? value.evidence : null), true)
}

function assertRefused(value: C5BPortDecision, reasonCode: string): void {
  assert.deepEqual(value, { status: 'refused', reasonCode })
  assert.equal(Object.isFrozen(value), true)
}

let passed = 0
let failed = 0
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}`, error)
  }
}

async function main(): Promise<void> {
await test('A1 rejects malformed, accessor, symbol, hostile, mutable, and aliased dependencies', () => {
  const valid = harness()
  for (const invalid of [
    {},
    { maxLeaseTokenBytes: 0, timeoutMs: 1_000, now: () => NOW },
    { maxLeaseTokenBytes: 64, timeoutMs: 0, now: () => NOW },
    { ...config(), extra: true },
  ]) assert.throws(() => createC5BWriterFreezeNodePorts(invalid as C5BWriterFreezeConfig, valid.sources))

  const accessor = Object.defineProperty({ maxLeaseTokenBytes: 64, timeoutMs: 1_000 }, 'now', {
    enumerable: true,
    get: () => () => NOW,
  })
  assert.throws(() => createC5BWriterFreezeNodePorts(accessor as C5BWriterFreezeConfig, valid.sources))

  const symbolConfig = { ...config(), [Symbol('hidden')]: true }
  assert.throws(() => createC5BWriterFreezeNodePorts(symbolConfig, valid.sources))
  assert.throws(() => createC5BWriterFreezeNodePorts(config(), new Proxy(valid.sources, {
    ownKeys: () => { throw new Error('secret provider message') },
  })))

  const same = async () => ({})
  const aliased = {
    controlSource: { acquireWriterFreeze: same, releaseWriterFreeze: same },
    observationSource: { observeWriterFreeze: same },
  }
  assert.throws(() => createC5BWriterFreezeNodePorts(config(), aliased))

  const mutable = harness()
  const ports = createC5BWriterFreezeNodePorts(config(), mutable.sources)
  ;(mutable.sources.controlSource as {
    acquireWriterFreeze: C5BWriterFreezeSources['controlSource']['acquireWriterFreeze']
  }).acquireWriterFreeze = async () => { throw new Error('mutated') }
  assert.equal(typeof ports.freezeWriters, 'function')
})

await test('P1 refuses invalid context, wrong order, replay, concurrency, and overlapping packets before I/O', async () => {
  const first = harness()
  const ports = createC5BWriterFreezeNodePorts(config(), first.sources)
  assertRefused(await ports.freezeWriters({} as C5BOperatorContext), 'operation_sequence_invalid')
  assertRefused(await ports.freezeWriters({ packet: packet(), receipts: [] }), 'operation_sequence_invalid')
  assert.equal(first.acquireCalls.length, 0)

  let releaseAcquire: (() => void) | undefined
  const concurrent = harness({
    acquire: async () => new Promise((resolve) => {
      releaseAcquire = () => resolve({ leaseToken: Uint8Array.from([7, 8]), leaseExpiresAt: END })
    }),
  })
  const concurrentPorts = createC5BWriterFreezeNodePorts(config(), concurrent.sources)
  const context = freezeContext()
  const pending = concurrentPorts.freezeWriters(context)
  await Promise.resolve()
  assertRefused(await concurrentPorts.freezeWriters(context), 'operation_sequence_invalid')
  releaseAcquire?.()
  assertPassed(await pending)
  assert.equal(concurrent.acquireCalls.length, 1)

  const other = freezeContext(packet('223e4567-e89b-42d3-a456-426614174000'))
  assertRefused(await concurrentPorts.freezeWriters(other), 'operation_sequence_invalid')
  assert.equal(concurrent.acquireCalls.length, 1)
})

await test('B1 collapses acquire exception, malformed output, timeout, abort, and late settlement', async () => {
  const thrown = harness({ acquire: async () => { throw new Error('token path host') } })
  assertRefused(await createC5BWriterFreezeNodePorts(config(), thrown.sources).freezeWriters(freezeContext()), 'provider_operation_refused')

  const malformed = harness({ acquire: async () => ({ leaseToken: Uint8Array.from([1]), leaseExpiresAt: END, extra: true }) })
  assertRefused(await createC5BWriterFreezeNodePorts(config(), malformed.sources).freezeWriters(freezeContext()), 'provider_operation_refused')

  let aborted = false
  const timeout = harness({
    acquire: async (request) => new Promise((_resolve) => {
      request.signal.addEventListener('abort', () => { aborted = true }, { once: true })
    }),
  })
  const timeoutPorts = createC5BWriterFreezeNodePorts(config({ timeoutMs: 10 }), timeout.sources)
  assertRefused(await timeoutPorts.freezeWriters(freezeContext()), 'provider_operation_refused')
  assert.equal(aborted, true)
  assertRefused(
    await timeoutPorts.freezeWriters(freezeContext(packet('723e4567-e89b-42d3-a456-426614174000'))),
    'operation_sequence_invalid',
  )
  assert.equal(timeout.acquireCalls.length, 1)

  let lateToken: Uint8Array | null = null
  const late = harness({
    acquire: async () => new Promise((resolve) => {
      setTimeout(() => {
        lateToken = Uint8Array.from([7, 6, 5])
        resolve({ leaseToken: lateToken, leaseExpiresAt: END })
      }, 25)
    }),
  })
  assertRefused(
    await createC5BWriterFreezeNodePorts(config({ timeoutMs: 5 }), late.sources).freezeWriters(freezeContext()),
    'provider_operation_refused',
  )
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(late.observeCalls.length, 0)
  assert.deepEqual(lateToken === null ? null : [...lateToken], [0, 0, 0])
})

await test('A1/M1 refuses malformed observations, active writers, accessors, symbols, and hostile proxies with closed output', async () => {
  const cases: Array<{ value: unknown; reason: string }> = [
    { value: { freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END }, reason: 'writer_activity_detected' },
    { value: { freezeActive: true, activeWriterCount: 1, leaseExpiresAt: END }, reason: 'writer_activity_detected' },
    { value: { freezeActive: true, activeWriterCount: -1, leaseExpiresAt: END }, reason: 'provider_operation_refused' },
    { value: { freezeActive: true, activeWriterCount: 0, leaseExpiresAt: '2026-08-20T02:59:59.000Z' }, reason: 'provider_operation_refused' },
    { value: { freezeActive: true, activeWriterCount: 0, leaseExpiresAt: END, extra: true }, reason: 'provider_operation_refused' },
  ]
  for (const entry of cases) {
    const value = harness({
      observe: async (_request, index) => index === 0
        ? entry.value
        : { freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END },
    })
    const result = await createC5BWriterFreezeNodePorts(config(), value.sources).freezeWriters(freezeContext())
    assertRefused(result, entry.reason)
    assert.equal(value.releaseCalls.length, 1)
    assert.doesNotMatch(JSON.stringify(result), /token|path|host|leaseToken/i)
  }

  const accessor = Object.defineProperty({ freezeActive: true, activeWriterCount: 0 }, 'leaseExpiresAt', {
    enumerable: true,
    get: () => END,
  })
  const symbol = { freezeActive: true, activeWriterCount: 0, leaseExpiresAt: END, [Symbol('hidden')]: true }
  for (const observation of [accessor, symbol, new Proxy({}, { ownKeys: () => { throw new Error('secret') } })]) {
    const value = harness({
      observe: async (_request, index) => index === 0
        ? observation
        : { freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END },
    })
    assertRefused(await createC5BWriterFreezeNodePorts(config(), value.sources).freezeWriters(freezeContext()), 'provider_operation_refused')
  }
})

await test('L1 binds exact expiry, owns bounded token bytes, isolates mutation, and zeroizes terminal material', async () => {
  for (const leaseToken of [new Uint8Array(), new Uint8Array(65), 'not-bytes']) {
    const value = harness({ acquire: async () => ({ leaseToken, leaseExpiresAt: END }) })
    assertRefused(await createC5BWriterFreezeNodePorts(config(), value.sources).freezeWriters(freezeContext()), 'provider_operation_refused')
  }
  for (const leaseExpiresAt of ['2026-08-20T02:59:59.000Z', 'invalid']) {
    const value = harness({ acquire: async () => ({ leaseToken: Uint8Array.from([1]), leaseExpiresAt }) })
    assertRefused(await createC5BWriterFreezeNodePorts(config(), value.sources).freezeWriters(freezeContext()), 'provider_operation_refused')
  }
  if (typeof SharedArrayBuffer !== 'undefined') {
    const shared = new Uint8Array(new SharedArrayBuffer(2))
    shared.set([4, 5])
    const value = harness({ acquire: async () => ({ leaseToken: shared, leaseExpiresAt: END }) })
    assertRefused(await createC5BWriterFreezeNodePorts(config(), value.sources).freezeWriters(freezeContext()), 'provider_operation_refused')
    assert.deepEqual([...shared], [0, 0])
  }

  const raw = Uint8Array.from([9, 8, 7])
  const value = harness({
    acquire: async () => ({ leaseToken: raw, leaseExpiresAt: END }),
    observe: async (request, index) => {
      assert.deepEqual([...request.leaseToken], [9, 8, 7])
      return { freezeActive: index === 0, activeWriterCount: 0, leaseExpiresAt: END }
    },
    release: async (request) => {
      assert.deepEqual([...request.leaseToken], [9, 8, 7])
      return { releaseConfirmed: true }
    },
  })
  const ports = createC5BWriterFreezeNodePorts(config(), value.sources)
  assertPassed(await ports.freezeWriters(freezeContext()))
  assert.deepEqual([...raw], [0, 0, 0])
  assert.deepEqual(await ports.unfreezeWriters(frozenContext(freezeContext())), { unfreezeConfirmed: true })
  for (const request of [...value.observeCalls, ...value.releaseCalls]) {
    assert.deepEqual([...request.leaseToken], [0, 0, 0])
  }
  assert.equal(Object.isFrozen(await ports.unfreezeWriters(frozenContext(freezeContext()))), true)

  const expiring = harness()
  const expiringPorts = createC5BWriterFreezeNodePorts(
    config({ now: () => '2026-08-20T02:59:59.970Z' }),
    expiring.sources,
  )
  const expiringContext = freezeContext(packet('a23e4567-e89b-42d3-a456-426614174000'))
  assertPassed(await expiringPorts.freezeWriters(expiringContext))
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.deepEqual(await expiringPorts.unfreezeWriters(frozenContext(expiringContext)), { unfreezeConfirmed: false })
  assert.equal(expiring.releaseCalls.length, 0)
})

await test('B1 rejects invalid or rolled-back trusted time and compensates a transferred lease', async () => {
  const invalid = harness()
  assertRefused(await createC5BWriterFreezeNodePorts(config({ now: () => 'invalid' }), invalid.sources).freezeWriters(freezeContext()), 'freeze_window_invalid')
  assert.equal(invalid.acquireCalls.length, 0)

  const times = [NOW, '2026-08-20T02:09:59.000Z', NOW, NOW]
  const rollback = harness()
  const result = await createC5BWriterFreezeNodePorts(config({ now: () => times.shift() ?? NOW }), rollback.sources).freezeWriters(freezeContext())
  assertRefused(result, 'freeze_window_invalid')
  assert.equal(rollback.releaseCalls.length, 1)
})

await test('C1 releases and independently observes inactive state on every post-acquire refusal', async () => {
  const value = harness({
    observe: async (_request, index) => index === 0
      ? { malformed: true }
      : { freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END },
  })
  const ports = createC5BWriterFreezeNodePorts(config(), value.sources)
  assertRefused(await ports.freezeWriters(freezeContext()), 'provider_operation_refused')
  assert.equal(value.releaseCalls.length, 1)
  assert.equal(value.observeCalls.length, 2)

  const releaseFailure = harness({
    observe: async (_request, index) => index === 0
      ? { freezeActive: true, activeWriterCount: 2, leaseExpiresAt: END }
      : { freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END },
    release: async () => { throw new Error('provider secret') },
  })
  assertRefused(await createC5BWriterFreezeNodePorts(config(), releaseFailure.sources).freezeWriters(freezeContext()), 'provider_operation_refused')
  assert.equal(releaseFailure.releaseCalls.length, 1)
  assert.equal(releaseFailure.observeCalls.length, 2)

  let observationAborted = false
  const observationTimeout = harness({
    observe: async (request, index) => index === 0
      ? new Promise((_resolve) => {
        request.signal.addEventListener('abort', () => { observationAborted = true }, { once: true })
      })
      : Promise.resolve({ freezeActive: false, activeWriterCount: 0, leaseExpiresAt: END }),
  })
  assertRefused(
    await createC5BWriterFreezeNodePorts(config({ timeoutMs: 10 }), observationTimeout.sources)
      .freezeWriters(freezeContext()),
    'provider_operation_refused',
  )
  assert.equal(observationAborted, true)
  assert.equal(observationTimeout.releaseCalls.length, 1)
  assert.equal(observationTimeout.observeCalls.length, 2)
})

await test('U1 confirms exact release once and refuses wrong packet, missing receipt, failure, active state, and double unfreeze', async () => {
  const value = harness()
  const ports = createC5BWriterFreezeNodePorts(config(), value.sources)
  const context = freezeContext()
  assertPassed(await ports.freezeWriters(context))
  const wrong = frozenContext(freezeContext(packet('323e4567-e89b-42d3-a456-426614174000')))
  assert.deepEqual(await ports.unfreezeWriters(wrong), { unfreezeConfirmed: false })
  assert.equal(value.releaseCalls.length, 0)
  assert.deepEqual(await ports.unfreezeWriters(context), { unfreezeConfirmed: false })
  assert.equal(value.releaseCalls.length, 0)
  assert.deepEqual(await ports.unfreezeWriters(frozenContext(context)), { unfreezeConfirmed: true })
  assert.equal(value.releaseCalls.length, 1)
  for (const request of [...value.observeCalls, ...value.releaseCalls]) {
    assert.deepEqual([...request.leaseToken], new Array(request.leaseToken.length).fill(0))
  }
  assert.deepEqual(await ports.unfreezeWriters(frozenContext(context)), { unfreezeConfirmed: false })
  assert.equal(value.releaseCalls.length, 1)

  for (const mode of ['release', 'malformed', 'observe'] as const) {
    const failing = harness({
      release: mode === 'release'
        ? async () => { throw new Error('secret') }
        : mode === 'malformed'
          ? async () => ({ releaseConfirmed: true, extra: true })
          : undefined,
      observe: async (_request, index) => index === 0
        ? { freezeActive: true, activeWriterCount: 0, leaseExpiresAt: END }
        : { freezeActive: mode === 'observe', activeWriterCount: 0, leaseExpiresAt: END },
    })
    const failingPorts = createC5BWriterFreezeNodePorts(config(), failing.sources)
    const attemptIds = {
      release: '423e4567-e89b-42d3-a456-426614174000',
      malformed: '523e4567-e89b-42d3-a456-426614174000',
      observe: '623e4567-e89b-42d3-a456-426614174000',
    } as const
    const nextAttemptIds = {
      release: '823e4567-e89b-42d3-a456-426614174000',
      malformed: '923e4567-e89b-42d3-a456-426614174000',
      observe: 'a23e4567-e89b-42d3-a456-426614174000',
    } as const
    const failingContext = freezeContext(packet(attemptIds[mode]))
    assertPassed(await failingPorts.freezeWriters(failingContext))
    assert.deepEqual(await failingPorts.unfreezeWriters(frozenContext(failingContext)), { unfreezeConfirmed: false })
    assert.equal(failing.observeCalls.length, 2)
    assert.doesNotMatch(JSON.stringify(await failingPorts.unfreezeWriters(frozenContext(failingContext))), /secret/)
    assertRefused(
      await failingPorts.freezeWriters(freezeContext(packet(nextAttemptIds[mode]))),
      'operation_sequence_invalid',
    )
    assert.equal(failing.acquireCalls.length, 1)
  }
})

await test('O1 real operator integration reaches only recovery then performs exact unfreeze and static no-I/O checks', async () => {
  const value = harness()
  const freeze = createC5BWriterFreezeNodePorts(config(), value.sources)
  const reached: string[] = []
  const later = async (name: string): Promise<C5BPortDecision> => {
    reached.push(name)
    return { status: 'refused', reasonCode: 'provider_operation_refused' }
  }
  const ports: C5BOperatorPorts = {
    attestProject: async (context) => ({
      status: 'passed',
      evidence: { projectMatch: true, environmentClass: context.packet.environmentClass, attestedAt: NOW },
    }),
    probeCatalogAcl: async () => ({
      status: 'passed',
      evidence: {
        catalogHash: HASHES[4], aclHash: HASHES[5], rpcHash: HASHES[6], policyHash: HASHES[7],
        extensionHash: HASHES[8], migrationObjectCount: 4, writerActivityCount: 1,
      },
    }),
    freezeWriters: freeze.freezeWriters,
    createProviderRecoveryPoint: () => later('create_provider_recovery_point'),
    createEncryptedLogicalBackup: () => later('create_encrypted_logical_backup'),
    restoreIsolatedBackup: () => later('restore_isolated_backup'),
    verifyRestoredState: () => later('verify_restored_state'),
    cleanupIsolatedRestore: () => later('cleanup_isolated_restore'),
    unfreezeWriters: freeze.unfreezeWriters,
  }
  const result = await runC5BPreflightOperator(packet('623e4567-e89b-42d3-a456-426614174000'), {
    clock: { now: () => NOW },
    ports,
  })
  assert.equal(result.ok, false)
  assert.equal(result.failedStage, 'create_provider_recovery_point')
  assert.equal(result.compensation.unfreezeAttempted, true)
  assert.equal(result.compensation.unfreezeConfirmed, true)
  assert.deepEqual(reached, ['create_provider_recovery_point'])
  assert.equal(value.acquireCalls.length, 1)
  assert.equal(value.releaseCalls.length, 1)
  assert.equal(value.observeCalls.length, 2)

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'live-cutover-writer-freeze-node.ts'), 'utf8')
  for (const forbidden of [
    /from ['"]node:(?:fs|http|https|net|tls|child_process|process|os)['"]/,
    /\b(?:fetch|console\.|process\.|readFile|writeFile|spawn|exec|query|sql)\b/i,
    /JSON\.stringify\([^\n]*(?:lease|token)/i,
  ]) assert.doesNotMatch(source, forbidden)
})

console.log(`C5B writer-freeze Node attacks: ${passed}/${passed + failed} grouped attacks passed`)
if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
