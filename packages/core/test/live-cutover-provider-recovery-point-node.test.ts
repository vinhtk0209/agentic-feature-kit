import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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
  createC5BProviderRecoveryPointNodePorts,
  type C5BProviderRecoveryPointConfig,
  type C5BProviderRecoveryPointCreateRequest,
  type C5BProviderRecoveryPointObserveRequest,
  type C5BProviderRecoveryPointSources,
} from '../src/live-cutover-provider-recovery-point-node'

const HASHES = Array.from({ length: 12 }, (_value, index) => (index + 1).toString(16).padStart(2, '0').repeat(32))
const START = '2026-08-20T02:00:00.000Z'
const END = '2026-08-20T03:00:00.000Z'
const NOW = '2026-08-20T02:04:00.000Z'
const RECOVERY_EXPIRY = '2026-08-21T02:04:00.000Z'
const CAPABILITY = 'provider-managed-recovery-v1'

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

function receipt(
  value: C5BPreflightPacket,
  operation: 'attest_project' | 'probe_catalog_acl' | 'freeze_writers',
  evidence: Record<string, unknown>,
  minute: number,
): C5BOperationReceipt {
  const time = `2026-08-20T02:${minute.toString().padStart(2, '0')}:00.000Z`
  return createC5BOperationReceipt(value, {
    operation, status: 'passed', reasonCode: null, startedAt: time, completedAt: time, evidence,
  })
}

function recoveryContext(value = packet()): C5BOperatorContext {
  return {
    packet: value,
    receipts: [
      receipt(value, 'attest_project', {
        projectMatch: true, environmentClass: value.environmentClass, attestedAt: '2026-08-20T02:01:00.000Z',
      }, 1),
      receipt(value, 'probe_catalog_acl', {
        catalogHash: HASHES[4], aclHash: HASHES[5], rpcHash: HASHES[6], policyHash: HASHES[7],
        extensionHash: HASHES[8], migrationObjectCount: 4, writerActivityCount: 1,
      }, 2),
      receipt(value, 'freeze_writers', { freezeConfirmed: true, activeWriterCount: 0 }, 3),
    ],
  }
}

function config(overrides: Partial<C5BProviderRecoveryPointConfig> = {}): C5BProviderRecoveryPointConfig {
  return {
    expectedProviderCapabilityId: CAPABILITY,
    maxCorrelationTokenBytes: 64,
    minRetentionMs: 3_600_000,
    maxRetentionMs: 604_800_000,
    timeoutMs: 1_000,
    now: () => NOW,
    ...overrides,
  }
}

interface HarnessHooks {
  create?: (request: C5BProviderRecoveryPointCreateRequest) => Promise<unknown>
  observe?: (request: C5BProviderRecoveryPointObserveRequest) => Promise<unknown>
}

function observation(value = packet(), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerCapabilityId: CAPABILITY,
    attemptId: value.attemptId,
    packetHash: value.packetHash,
    recoveryPointCreated: true,
    restorable: true,
    createdAt: NOW,
    expiresAt: RECOVERY_EXPIRY,
    ...overrides,
  }
}

function harness(hooks: HarnessHooks = {}, value = packet()): {
  sources: C5BProviderRecoveryPointSources
  createCalls: C5BProviderRecoveryPointCreateRequest[]
  observeCalls: C5BProviderRecoveryPointObserveRequest[]
  sourceTokens: Uint8Array[]
} {
  const createCalls: C5BProviderRecoveryPointCreateRequest[] = []
  const observeCalls: C5BProviderRecoveryPointObserveRequest[] = []
  const sourceTokens: Uint8Array[] = []
  return {
    createCalls,
    observeCalls,
    sourceTokens,
    sources: {
      creationSource: {
        createProviderRecoveryPoint: async (request) => {
          createCalls.push(request)
          if (hooks.create) return hooks.create(request)
          const correlationToken = Uint8Array.from([5, 6, 7, 8])
          sourceTokens.push(correlationToken)
          return { correlationToken }
        },
      },
      observationSource: {
        observeProviderRecoveryPoint: async (request) => {
          observeCalls.push(request)
          return hooks.observe ? hooks.observe(request) : observation(value)
        },
      },
    },
  }
}

function assertRefused(value: C5BPortDecision, reasonCode: string): void {
  assert.deepEqual(value, { status: 'refused', reasonCode })
  assert.equal(Object.isFrozen(value), true)
}

function expectedHash(value: C5BPreflightPacket): string {
  const metadata = JSON.stringify({
    schemaVersion: 1,
    providerCapabilityId: CAPABILITY,
    attemptId: value.attemptId,
    packetHash: value.packetHash,
    recoveryPointCreated: true,
    restorable: true,
    createdAt: NOW,
    expiresAt: RECOVERY_EXPIRY,
  })
  return crypto.createHash('sha256')
    .update('agentic-feature-kit/c5b/provider-recovery-metadata/v1\0', 'utf8')
    .update(metadata, 'utf8')
    .digest('hex')
}

function assertPassed(value: C5BPortDecision, input = packet()): void {
  assert.deepEqual(value, {
    status: 'passed',
    evidence: {
      recoveryPointCreated: true,
      recoveryPointMetadataHash: expectedHash(input),
      expiresAt: RECOVERY_EXPIRY,
    },
  })
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.status === 'passed' ? value.evidence : null), true)
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
    { ...config(), maxCorrelationTokenBytes: 0 },
    { ...config(), minRetentionMs: 0 },
    { ...config(), maxRetentionMs: 1_000 },
    { ...config(), timeoutMs: 0 },
    { ...config(), expectedProviderCapabilityId: 'unsafe capability' },
    { ...config(), extra: true },
  ]) assert.throws(() => createC5BProviderRecoveryPointNodePorts(invalid as C5BProviderRecoveryPointConfig, valid.sources))

  const accessor = Object.defineProperty({ ...config() }, 'now', { enumerable: true, get: () => () => NOW })
  assert.throws(() => createC5BProviderRecoveryPointNodePorts(accessor, valid.sources))
  assert.throws(() => createC5BProviderRecoveryPointNodePorts({ ...config(), [Symbol('hidden')]: true }, valid.sources))
  assert.throws(() => createC5BProviderRecoveryPointNodePorts(config(), new Proxy(valid.sources, {
    ownKeys: () => { throw new Error('secret provider message') },
  })))

  const same = async () => ({})
  assert.throws(() => createC5BProviderRecoveryPointNodePorts(config(), {
    creationSource: { createProviderRecoveryPoint: same },
    observationSource: { observeProviderRecoveryPoint: same },
  }))

  const mutable = harness()
  const ports = createC5BProviderRecoveryPointNodePorts(config(), mutable.sources)
  ;(mutable.sources.creationSource as {
    createProviderRecoveryPoint: C5BProviderRecoveryPointSources['creationSource']['createProviderRecoveryPoint']
  }).createProviderRecoveryPoint = async () => { throw new Error('mutated') }
  assert.equal(typeof ports.createProviderRecoveryPoint, 'function')
})

await test('P1 refuses invalid prefix, missing freeze, replay, concurrency, and overlap before extra I/O', async () => {
  let resolveCreate: ((value: unknown) => void) | undefined
  const value = harness({ create: () => new Promise((resolve) => { resolveCreate = resolve }) })
  const ports = createC5BProviderRecoveryPointNodePorts(config(), value.sources)
  assertRefused(await ports.createProviderRecoveryPoint({} as C5BOperatorContext), 'operation_sequence_invalid')
  const fullContext = recoveryContext()
  const missingFreeze: C5BOperatorContext = {
    packet: fullContext.packet,
    receipts: fullContext.receipts.slice(0, -1),
  }
  assertRefused(await ports.createProviderRecoveryPoint(missingFreeze), 'operation_sequence_invalid')
  assert.equal(value.createCalls.length, 0)

  const context = recoveryContext()
  const pending = ports.createProviderRecoveryPoint(context)
  await Promise.resolve()
  assertRefused(await ports.createProviderRecoveryPoint(context), 'operation_sequence_invalid')
  assertRefused(await ports.createProviderRecoveryPoint(recoveryContext(packet('223e4567-e89b-42d3-a456-426614174000'))), 'operation_sequence_invalid')
  assert.equal(value.createCalls.length, 1)
  resolveCreate?.({ correlationToken: Uint8Array.from([1, 2, 3]) })
  assertPassed(await pending)
  assertRefused(await ports.createProviderRecoveryPoint(recoveryContext(packet('323e4567-e89b-42d3-a456-426614174000'))), 'operation_sequence_invalid')
  assert.equal(value.createCalls.length, 1)
})

await test('B1 collapses creation exception, malformed output, timeout, abort, late settlement, and quarantines', async () => {
  const thrown = harness({ create: async () => { throw new Error('raw provider secret') } })
  const thrownPorts = createC5BProviderRecoveryPointNodePorts(config(), thrown.sources)
  assertRefused(await thrownPorts.createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')
  assertRefused(await thrownPorts.createProviderRecoveryPoint(recoveryContext(packet('423e4567-e89b-42d3-a456-426614174000'))), 'operation_sequence_invalid')
  assert.equal(thrown.createCalls.length, 1)

  const malformed = harness({ create: async () => ({ correlationToken: 'raw-token' }) })
  assertRefused(await createC5BProviderRecoveryPointNodePorts(config(), malformed.sources)
    .createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')

  let aborted = false
  let resolveLate: ((value: unknown) => void) | undefined
  const lateToken = Uint8Array.from([9, 8, 7])
  const timeout = harness({ create: (request) => new Promise((resolve) => {
    request.signal.addEventListener('abort', () => { aborted = true }, { once: true })
    resolveLate = resolve
  }) })
  const result = await createC5BProviderRecoveryPointNodePorts(config({ timeoutMs: 5 }), timeout.sources)
    .createProviderRecoveryPoint(recoveryContext())
  assertRefused(result, 'provider_operation_refused')
  assert.equal(aborted, true)
  resolveLate?.({ correlationToken: lateToken })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual([...lateToken], [0, 0, 0])
  assert.equal(timeout.observeCalls.length, 0)
  assert.doesNotMatch(JSON.stringify(result), /raw|secret|token/i)
})

await test('L1 owns, copies, bounds, and zeroizes opaque correlation material', async () => {
  const sourceToken = Uint8Array.from([11, 12, 13, 14])
  let observedDuringCall: number[] = []
  let observeReference: Uint8Array | undefined
  const value = harness({
    create: async () => ({ correlationToken: sourceToken }),
    observe: async (request) => {
      observeReference = request.correlationToken
      observedDuringCall = [...request.correlationToken]
      sourceToken.fill(99)
      return observation()
    },
  })
  const result = await createC5BProviderRecoveryPointNodePorts(config(), value.sources)
    .createProviderRecoveryPoint(recoveryContext())
  assertPassed(result)
  assert.deepEqual(observedDuringCall, [11, 12, 13, 14])
  assert.deepEqual([...sourceToken], [0, 0, 0, 0])
  assert.deepEqual([...(observeReference ?? [])], [0, 0, 0, 0])
  assert.doesNotMatch(JSON.stringify(result), /11|12|13|14|correlation|token/i)

  for (const raw of [
    { correlationToken: new Uint8Array() },
    { correlationToken: new Uint8Array(65) },
    { correlationToken: [1, 2, 3] },
    Object.defineProperty({}, 'correlationToken', { enumerable: true, get: () => Uint8Array.from([1]) }),
  ]) {
    const invalid = harness({ create: async () => raw })
    assertRefused(await createC5BProviderRecoveryPointNodePorts(config(), invalid.sources)
      .createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')
  }
})

await test('R1 rejects malformed observation, binding drift, false claims, and hostile values', async () => {
  const attacks: unknown[] = [
    {},
    observation(packet(), { attemptId: 'wrong' }),
    observation(packet(), { packetHash: HASHES[10] }),
    observation(packet(), { providerCapabilityId: 'other-capability-v1' }),
    observation(packet(), { recoveryPointCreated: false }),
    observation(packet(), { restorable: false }),
    { ...observation(), extra: true },
    Object.defineProperty({ ...observation() }, 'restorable', { enumerable: true, get: () => true }),
    { ...observation(), [Symbol('hidden')]: true },
    new Proxy(observation(), { ownKeys: () => { throw new Error('raw provider secret') } }),
  ]
  for (const attacked of attacks) {
    const value = harness({ observe: async () => attacked })
    const result = await createC5BProviderRecoveryPointNodePorts(config(), value.sources)
      .createProviderRecoveryPoint(recoveryContext())
    assertRefused(result, 'provider_operation_refused')
    assert.doesNotMatch(JSON.stringify(result), /raw provider secret|other-capability/i)
  }

  const thrown = harness({ observe: async () => { throw new Error('raw observation secret') } })
  assertRefused(await createC5BProviderRecoveryPointNodePorts(config(), thrown.sources)
    .createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')
})

await test('B1/R1 enforces freeze chronology, retention bounds, canonical time, and clock monotonicity', async () => {
  for (const [overrides, expectedConfig] of [
    [{ createdAt: '2026-08-20T02:02:00.000Z' }, config()],
    [{ createdAt: '2026-08-20T02:05:00.000Z' }, config()],
    [{ createdAt: 'invalid' }, config()],
    [{ expiresAt: END }, config()],
    [{ expiresAt: '2026-08-20T02:34:00.000Z' }, config()],
    [{ expiresAt: '2026-09-20T02:04:00.000Z' }, config()],
  ] as const) {
    const value = harness({ observe: async () => observation(packet(), overrides) })
    assertRefused(await createC5BProviderRecoveryPointNodePorts(expectedConfig, value.sources)
      .createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')
  }

  const invalidClock = harness()
  assertRefused(await createC5BProviderRecoveryPointNodePorts(config({ now: () => 'invalid' }), invalidClock.sources)
    .createProviderRecoveryPoint(recoveryContext()), 'freeze_window_invalid')

  const times = [NOW, '2026-08-20T02:03:59.000Z']
  const rollback = harness()
  assertRefused(await createC5BProviderRecoveryPointNodePorts(config({ now: () => times.shift() ?? NOW }), rollback.sources)
    .createProviderRecoveryPoint(recoveryContext()), 'freeze_window_invalid')
})

await test('M1 emits exact deterministic metadata hash and no raw provider material', async () => {
  const value = packet()
  const first = harness({}, value)
  const second = harness({}, value)
  const one = await createC5BProviderRecoveryPointNodePorts(config(), first.sources)
    .createProviderRecoveryPoint(recoveryContext(value))
  const two = await createC5BProviderRecoveryPointNodePorts(config(), second.sources)
    .createProviderRecoveryPoint(recoveryContext(value))
  assertPassed(one, value)
  assert.deepEqual(one, two)
  assert.deepEqual(Object.keys(one.status === 'passed' ? one.evidence : {}).sort(), [
    'expiresAt', 'recoveryPointCreated', 'recoveryPointMetadataHash',
  ])
  assert.doesNotMatch(JSON.stringify(one), /provider-managed|project|resource|correlation|credential|secret/i)
})

await test('Q1 is terminal after success or uncertainty and exposes no destructive lifecycle port', async () => {
  const good = harness()
  const ports = createC5BProviderRecoveryPointNodePorts(config(), good.sources)
  assert.deepEqual(Object.keys(ports), ['createProviderRecoveryPoint'])
  assertPassed(await ports.createProviderRecoveryPoint(recoveryContext()))
  assertRefused(await ports.createProviderRecoveryPoint(recoveryContext(packet('523e4567-e89b-42d3-a456-426614174000'))), 'operation_sequence_invalid')
  assert.equal(good.createCalls.length, 1)
  assert.equal('deleteProviderRecoveryPoint' in ports, false)
  assert.equal('expireProviderRecoveryPoint' in ports, false)

  const uncertain = harness({ observe: async () => ({}) })
  const uncertainPorts = createC5BProviderRecoveryPointNodePorts(config(), uncertain.sources)
  assertRefused(await uncertainPorts.createProviderRecoveryPoint(recoveryContext()), 'provider_operation_refused')
  assertRefused(await uncertainPorts.createProviderRecoveryPoint(recoveryContext(packet('623e4567-e89b-42d3-a456-426614174000'))), 'operation_sequence_invalid')
  assert.equal(uncertain.createCalls.length, 1)
})

await test('O1 real operator integration reaches only logical backup then unfreezes, with static no-I/O proof', async () => {
  const value = packet()
  const recovery = harness({}, value)
  const recoveryPorts = createC5BProviderRecoveryPointNodePorts(config(), recovery.sources)
  const reached: string[] = []
  let unfrozen = 0
  const passedDecision = (evidence: Record<string, unknown>): C5BPortDecision => Object.freeze({
    status: 'passed', evidence: Object.freeze(evidence),
  })
  const later = async (name: string): Promise<C5BPortDecision> => {
    reached.push(name)
    return Object.freeze({ status: 'refused', reasonCode: 'provider_operation_refused' })
  }
  const ports: C5BOperatorPorts = {
    attestProject: async () => passedDecision({
      projectMatch: true, environmentClass: value.environmentClass, attestedAt: '2026-08-20T02:00:00.500Z',
    }),
    probeCatalogAcl: async () => passedDecision({
      catalogHash: HASHES[4], aclHash: HASHES[5], rpcHash: HASHES[6], policyHash: HASHES[7],
      extensionHash: HASHES[8], migrationObjectCount: 4, writerActivityCount: 1,
    }),
    freezeWriters: async () => passedDecision({ freezeConfirmed: true, activeWriterCount: 0 }),
    createProviderRecoveryPoint: recoveryPorts.createProviderRecoveryPoint,
    createEncryptedLogicalBackup: () => later('create_encrypted_logical_backup'),
    restoreIsolatedBackup: () => later('unexpected_restore'),
    verifyRestoredState: () => later('unexpected_verify'),
    cleanupIsolatedRestore: () => later('unexpected_cleanup'),
    unfreezeWriters: async () => { unfrozen += 1; return { unfreezeConfirmed: true } },
  }
  let tick = 0
  const clock = {
    now: () => new Date(Date.parse('2026-08-20T02:00:00.000Z') + tick++ * 1_000).toISOString(),
  }
  const result = await runC5BPreflightOperator(value, { clock, ports })
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'blocked')
  assert.equal(result.failedStage, 'create_encrypted_logical_backup')
  assert.deepEqual(reached, ['create_encrypted_logical_backup'])
  assert.equal(recovery.createCalls.length, 1)
  assert.equal(recovery.observeCalls.length, 1)
  assert.equal(unfrozen, 1)

  const source = fs.readFileSync(path.join(process.cwd(), 'packages/core/src/live-cutover-provider-recovery-point-node.ts'), 'utf8')
  assert.doesNotMatch(source, /node:(?:fs|path|http|https|net|tls|child_process|process)|process\.|console\.|fetch\(|supabase|postgres|database|sql/i)
  assert.doesNotMatch(source, /deleteProviderRecoveryPoint|expireProviderRecoveryPoint/)
})

  console.log(`C5B provider-recovery-point Node attacks: ${passed}/9 grouped attacks passed`)
  if (failed > 0 || passed !== 9) process.exit(1)
}

void main()
