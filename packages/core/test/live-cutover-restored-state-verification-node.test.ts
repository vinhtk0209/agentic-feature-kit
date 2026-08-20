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
  C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
  type C5BCatalogAclProbeRow,
} from '../src/live-cutover-catalog-acl-probe-node'
import {
  createC5BRestoredStateVerificationNodePorts,
  type C5BRestoredStateMetadataRequest,
  type C5BRestoredStateRollbackRequest,
  type C5BRestoredStateVerificationConfig,
  type C5BRestoredStateVerificationSources,
} from '../src/live-cutover-restored-state-verification-node'

const HASHES = Array.from({ length: 16 }, (_value, index) => (index + 1).toString(16).padStart(2, '0').repeat(32))
const SERVER_VERSION = 170004
const START = '2026-08-20T01:00:00.000Z'
const END = '2026-08-20T02:00:00.000Z'
const VERIFY_START = '2026-08-20T01:00:07.000Z'
const VERIFY_END = '2026-08-20T01:00:08.000Z'
const ROLLBACK_START = '2026-08-20T01:00:07.250Z'
const ROLLBACK_END = '2026-08-20T01:00:07.750Z'
const TEST_IDS = ['rollback_0018', 'rollback_0019'] as const
const RAW_RELATION = 'private_relation_control'
const RAW_PRINCIPAL = 'private_principal_control'
const RAW_ERROR = 'private_provider_error_control'

type Row = Record<string, string | number | boolean | null>

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

function catalogRows(): Row[] {
  return [
    { kind: 'table', name: RAW_RELATION, rls_enabled: true },
    { kind: 'function', name: 'persist_verification', security_definer: true },
  ]
}

function aclRows(): Row[] {
  return [{ grantable: false, grantee: RAW_PRINCIPAL, privilege: 'SELECT', relation: RAW_RELATION }]
}

function canonicalRow(value: Row): string {
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])))
}

function domainHash(domain: 'catalog' | 'acl', rows: readonly Row[], version = SERVER_VERSION): string {
  const sorted = rows.map(canonicalRow).sort().map((row) => JSON.parse(row) as Row)
  const transcript = domain === 'catalog'
    ? { schemaVersion: 1, policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION, domain, serverVersionNum: version, rows: sorted }
    : { schemaVersion: 1, policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION, domain, rows: sorted }
  return createHash('sha256').update(JSON.stringify(transcript), 'utf8').digest('hex')
}

function operationEvidence(operation: Exclude<C5BOperation, 'complete_preflight'>, value: C5BPreflightPacket): Record<string, unknown> {
  switch (operation) {
    case 'attest_project': return {
      projectMatch: true, environmentClass: value.environmentClass, attestedAt: '2026-08-20T01:00:00.250Z',
    }
    case 'probe_catalog_acl': return {
      catalogHash: domainHash('catalog', catalogRows()), aclHash: domainHash('acl', aclRows()),
      rpcHash: HASHES[4], policyHash: HASHES[5], extensionHash: HASHES[6],
      migrationObjectCount: 4, writerActivityCount: 0,
    }
    case 'freeze_writers': return { freezeConfirmed: true, activeWriterCount: 0 }
    case 'create_provider_recovery_point': return {
      recoveryPointCreated: true, recoveryPointMetadataHash: HASHES[7], expiresAt: '2026-08-21T01:00:00.000Z',
    }
    case 'create_encrypted_logical_backup': return {
      encrypted: true, byteCount: 4096, backupSha256: HASHES[8], manifestSha256: HASHES[9],
      expiresAt: '2026-08-21T01:00:00.000Z',
    }
    case 'restore_isolated_backup': return {
      restored: true, isolated: true, sourceBackupSha256: HASHES[8], restoreManifestSha256: HASHES[9],
    }
    case 'verify_restored_state': return {
      catalogHash: domainHash('catalog', catalogRows()), aclHash: domainHash('acl', aclRows()),
      sourceBindingHash: value.sourceBindingHash, sourceParity: true, rollbackSuitePassed: true,
    }
    case 'cleanup_isolated_restore': return { cleanupConfirmed: true, residualResourceCount: 0 }
  }
}

function verificationContext(value = packet()): C5BOperatorContext {
  const operations = [
    'attest_project', 'probe_catalog_acl', 'freeze_writers', 'create_provider_recovery_point',
    'create_encrypted_logical_backup', 'restore_isolated_backup',
  ] as const
  const receipts: C5BOperationReceipt[] = operations.map((operation, index) => createC5BOperationReceipt(value, {
    operation,
    status: 'passed',
    reasonCode: null,
    startedAt: new Date(Date.parse(START) + index * 1_000).toISOString(),
    completedAt: new Date(Date.parse(START) + index * 1_000 + 500).toISOString(),
    evidence: operationEvidence(operation, value),
  }))
  return Object.freeze({ packet: value, receipts: Object.freeze(receipts) })
}

function metadata(value = packet(), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverVersionNum: SERVER_VERSION,
    catalog: catalogRows(),
    acl: aclRows(),
    source: { ...value.source },
    ...overrides,
  }
}

function rollback(value = packet(), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    attemptId: value.attemptId,
    packetHash: value.packetHash,
    sourceBackupSha256: HASHES[8],
    restoreManifestSha256: HASHES[9],
    startedAt: ROLLBACK_START,
    completedAt: ROLLBACK_END,
    tests: TEST_IDS.map((id) => ({ id, passed: true })),
    ...overrides,
  }
}

function clock(values: readonly string[] = [VERIFY_START, VERIFY_END]): () => string {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}

function config(overrides: Partial<C5BRestoredStateVerificationConfig> = {}): C5BRestoredStateVerificationConfig {
  return {
    expectedRollbackTestIds: [...TEST_IDS],
    maxRowsPerDomain: 20,
    maxRowBytes: 1_024,
    maxTotalBytes: 20_000,
    maxRollbackTests: 10,
    timeoutMs: 1_000,
    now: clock(),
    ...overrides,
  }
}

interface Hooks {
  metadata?: (request: C5BRestoredStateMetadataRequest) => Promise<unknown>
  rollback?: (request: C5BRestoredStateRollbackRequest) => Promise<unknown>
}

function harness(hooks: Hooks = {}, value = packet()): {
  readonly sources: C5BRestoredStateVerificationSources
  readonly metadataCalls: C5BRestoredStateMetadataRequest[]
  readonly rollbackCalls: C5BRestoredStateRollbackRequest[]
} {
  const metadataCalls: C5BRestoredStateMetadataRequest[] = []
  const rollbackCalls: C5BRestoredStateRollbackRequest[] = []
  return {
    metadataCalls,
    rollbackCalls,
    sources: {
      metadataCapability: {
        readRestoredStateMetadata: async (request) => {
          metadataCalls.push(request)
          return hooks.metadata ? hooks.metadata(request) : metadata(value)
        },
      },
      rollbackCapability: {
        runRestoredStateRollbackSuite: async (request) => {
          rollbackCalls.push(request)
          return hooks.rollback ? hooks.rollback(request) : rollback(value)
        },
      },
    },
  }
}

function assertRefused(value: C5BPortDecision, reasonCode = 'restored_state_mismatch'): void {
  assert.deepEqual(value, { status: 'refused', reasonCode })
  assert.equal(Object.isFrozen(value), true)
}

function assertPassed(value: C5BPortDecision, input = packet()): void {
  assert.deepEqual(value, {
    status: 'passed',
    evidence: {
      catalogHash: domainHash('catalog', catalogRows()),
      aclHash: domainHash('acl', aclRows()),
      sourceBindingHash: input.sourceBindingHash,
      sourceParity: true,
      rollbackSuitePassed: true,
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
    console.error(`FAIL ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  }
}

async function main(): Promise<void> {
  await test('A1 configuration is exact, snapshotted, and trust-separated', async () => {
    const valid = harness()
    for (const invalid of [
      { ...config(), expectedRollbackTestIds: [] },
      { ...config(), expectedRollbackTestIds: ['rollback_0019', 'rollback_0018'] },
      { ...config(), expectedRollbackTestIds: ['rollback_0018', 'rollback_0018'] },
      { ...config(), expectedRollbackTestIds: ['UPPER'] },
      { ...config(), maxRowsPerDomain: 0 },
      { ...config(), maxRowBytes: 0 },
      { ...config(), maxTotalBytes: Number.MAX_SAFE_INTEGER },
      { ...config(), maxRollbackTests: 0 },
      { ...config(), timeoutMs: 0 },
      { ...config(), now: 'clock' },
      { ...config(), extra: true },
    ]) assert.throws(() => createC5BRestoredStateVerificationNodePorts(
      invalid as C5BRestoredStateVerificationConfig, valid.sources,
    ), /configuration refused/)

    const accessor = { ...config() }
    Object.defineProperty(accessor, 'timeoutMs', { enumerable: true, get: () => 1_000 })
    assert.throws(() => createC5BRestoredStateVerificationNodePorts(accessor, valid.sources))
    const symbolSources = { ...valid.sources }
    Object.defineProperty(symbolSources, Symbol('hidden'), { value: RAW_ERROR })
    assert.throws(() => createC5BRestoredStateVerificationNodePorts(config(), symbolSources))
    const hostile = new Proxy({}, { getPrototypeOf: () => { throw new Error(RAW_ERROR) } })
    assert.throws(() => createC5BRestoredStateVerificationNodePorts(
      hostile as C5BRestoredStateVerificationConfig, valid.sources,
    ), (error: unknown) => error instanceof Error && !error.message.includes(RAW_ERROR))

    const shared = async () => metadata()
    const aliased = {
      metadataCapability: { readRestoredStateMetadata: shared },
      rollbackCapability: { runRestoredStateRollbackSuite: shared },
    }
    assert.throws(() => createC5BRestoredStateVerificationNodePorts(config(), aliased))

    const mutableIds: string[] = [...TEST_IDS]
    const snap = config({ expectedRollbackTestIds: mutableIds })
    const snapHarness = harness()
    const ports = createC5BRestoredStateVerificationNodePorts(snap, snapHarness.sources)
    mutableIds[0] = 'mutated'
    Object.defineProperty(snap, 'timeoutMs', { value: 1, enumerable: true, configurable: true, writable: true })
    assertPassed(await ports.verifyRestoredState(verificationContext()))
    assert.deepEqual(snapHarness.rollbackCalls[0].expectedTestIds, TEST_IDS)
    assert.equal(Object.isFrozen(snapHarness.rollbackCalls[0].expectedTestIds), true)
  })

  await test('P1 exact prefix admission and at-most-once lifecycle refuse replay', async () => {
    const input = packet()
    const good = verificationContext(input)
    const h = harness({}, input)
    const ports = createC5BRestoredStateVerificationNodePorts(config(), h.sources)
    assertRefused(await ports.verifyRestoredState({ packet: input, receipts: good.receipts.slice(0, 5) }), 'operation_sequence_invalid')
    assert.equal(h.metadataCalls.length, 0)
    assertRefused(await ports.verifyRestoredState({ packet: input, receipts: [...good.receipts, good.receipts[5]] }), 'operation_sequence_invalid')
    assert.equal(h.metadataCalls.length, 0)
    const [first, concurrent] = await Promise.all([
      ports.verifyRestoredState(good),
      ports.verifyRestoredState(good),
    ])
    assert.equal([first.status, concurrent.status].filter((status) => status === 'passed').length, 1)
    assert.equal(h.metadataCalls.length, 1)
    assertRefused(await ports.verifyRestoredState(good), 'operation_sequence_invalid')
    assert.equal(h.metadataCalls.length, 1)
  })

  await test('A1 metadata boundary, timeout, abort, and late settlement fail closed', async () => {
    for (const bad of [
      null,
      { ...metadata(), extra: true },
      { ...metadata(), serverVersionNum: '170004' },
      { ...metadata(), catalog: [{ badKey: true }] },
      { ...metadata(), catalog: [{ name: 'x\u0000y' }] },
      { ...metadata(), source: { ...packet().source, extra: HASHES[10] } },
    ]) {
      const h = harness({ metadata: async () => bad })
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), h.sources)
        .verifyRestoredState(verificationContext()))
      assert.equal(h.rollbackCalls.length, 0)
    }
    const accessor = metadata()
    Object.defineProperty(accessor, 'acl', { enumerable: true, get: () => aclRows() })
    const accessorHarness = harness({ metadata: async () => accessor })
    assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), accessorHarness.sources)
      .verifyRestoredState(verificationContext()))
    const symbol = metadata()
    Object.defineProperty(symbol, Symbol('hidden'), { value: RAW_ERROR })
    const symbolHarness = harness({ metadata: async () => symbol })
    assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), symbolHarness.sources)
      .verifyRestoredState(verificationContext()))

    let aborted = false
    let settle: ((value: unknown) => void) | undefined
    const late = harness({ metadata: (request) => new Promise((resolve) => {
      settle = resolve
      request.signal.addEventListener('abort', () => { aborted = true }, { once: true })
    }) })
    const decision = await createC5BRestoredStateVerificationNodePorts(config({ timeoutMs: 10 }), late.sources)
      .verifyRestoredState(verificationContext())
    assertRefused(decision)
    assert.equal(aborted, true)
    settle?.(metadata())
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(late.rollbackCalls.length, 0)
    assert.doesNotMatch(JSON.stringify(decision), new RegExp(RAW_ERROR))
  })

  await test('H1 shared transcript preserves probe bytes and detects restored metadata drift', async () => {
    const reordered = metadata(packet(), {
      catalog: catalogRows().map((row) => Object.fromEntries(Object.entries(row).reverse())).reverse(),
      acl: aclRows().map((row) => Object.fromEntries(Object.entries(row).reverse())),
    })
    const good = harness({ metadata: async () => reordered })
    assertPassed(await createC5BRestoredStateVerificationNodePorts(config(), good.sources)
      .verifyRestoredState(verificationContext()))
    for (const changed of [
      { ...metadata(), catalog: [...catalogRows(), { kind: 'table', name: 'drift' }] },
      { ...metadata(), acl: [{ ...aclRows()[0], privilege: 'UPDATE' }] },
      { ...metadata(), serverVersionNum: SERVER_VERSION + 1 },
    ]) {
      const h = harness({ metadata: async () => changed })
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), h.sources)
        .verifyRestoredState(verificationContext()))
      assert.equal(h.rollbackCalls.length, 0)
    }
  })

  await test('S1 source parity derives only from four independently observed digest components', async () => {
    const input = packet()
    for (const key of Object.keys(input.source) as Array<keyof typeof input.source>) {
      const h = harness({ metadata: async () => metadata(input, { source: { ...input.source, [key]: HASHES[10] } }) }, input)
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), h.sources)
        .verifyRestoredState(verificationContext(input)))
      assert.equal(h.rollbackCalls.length, 0)
    }
    const uppercase = harness({ metadata: async () => metadata(input, {
      source: { ...input.source, migration0018Sha256: 'A'.repeat(64) },
    }) }, input)
    assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), uppercase.sources)
      .verifyRestoredState(verificationContext(input)))
    const result = await createC5BRestoredStateVerificationNodePorts(config(), harness({}, input).sources)
      .verifyRestoredState(verificationContext(input))
    assertPassed(result, input)
    assert.doesNotMatch(JSON.stringify(result), new RegExp(input.source.migration0018Sha256))
  })

  await test('R1 rollback transcript is closed, complete, ordered, and artifact-bound', async () => {
    const input = packet()
    const attacks: unknown[] = [
      null,
      { ...rollback(input), extra: true },
      { ...rollback(input), attemptId: '223e4567-e89b-42d3-a456-426614174000' },
      { ...rollback(input), packetHash: HASHES[10] },
      { ...rollback(input), sourceBackupSha256: HASHES[10] },
      { ...rollback(input), restoreManifestSha256: HASHES[10] },
      { ...rollback(input), tests: [{ id: TEST_IDS[0], passed: true }] },
      { ...rollback(input), tests: [...TEST_IDS.map((id) => ({ id, passed: true })), { id: TEST_IDS[0], passed: true }] },
      { ...rollback(input), tests: [...TEST_IDS.map((id) => ({ id, passed: true })), { id: 'rollback_0020', passed: true }] },
      { ...rollback(input), tests: TEST_IDS.map((id, index) => ({ id, passed: index !== 0 })) },
      { ...rollback(input), tests: [...TEST_IDS].reverse().map((id) => ({ id, passed: true })) },
    ]
    for (const attacked of attacks) {
      const h = harness({ rollback: async () => attacked }, input)
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), h.sources)
        .verifyRestoredState(verificationContext(input)))
      assert.equal(h.metadataCalls.length, 1)
      assert.equal(h.rollbackCalls.length, 1)
    }
  })

  await test('B1 one total deadline and trusted chronology reject clock rollback and late suite data', async () => {
    for (const invalidClock of [
      () => 'not-a-time',
      clock([VERIFY_END, VERIFY_START]),
      clock(['2026-08-20T00:59:59.000Z', VERIFY_END]),
      clock([VERIFY_START, '2026-08-20T02:00:01.000Z']),
    ]) {
      const h = harness()
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config({ now: invalidClock }), h.sources)
        .verifyRestoredState(verificationContext()))
    }
    for (const chronology of [
      { startedAt: '2026-08-20T01:00:06.999Z' },
      { startedAt: ROLLBACK_END, completedAt: ROLLBACK_START },
      { completedAt: '2026-08-20T01:00:08.001Z' },
      { completedAt: 'not-a-time' },
    ]) {
      const h = harness({ rollback: async () => rollback(packet(), chronology) })
      assertRefused(await createC5BRestoredStateVerificationNodePorts(config(), h.sources)
        .verifyRestoredState(verificationContext()))
    }
    let rollbackAborted = false
    const slow = harness({ rollback: (request) => new Promise(() => {
      request.signal.addEventListener('abort', () => { rollbackAborted = true }, { once: true })
    }) })
    assertRefused(await createC5BRestoredStateVerificationNodePorts(config({ timeoutMs: 10 }), slow.sources)
      .verifyRestoredState(verificationContext()))
    assert.equal(rollbackAborted, true)
  })

  await test('M1 exact result is immutable, single-use, metadata-only, and statically local', async () => {
    const h = harness()
    const ports = createC5BRestoredStateVerificationNodePorts(config(), h.sources)
    const decision = await ports.verifyRestoredState(verificationContext())
    assertPassed(decision)
    assert.deepEqual(Object.keys(ports), ['verifyRestoredState'])
    assert.equal(Object.isFrozen(ports), true)
    assertRefused(await ports.verifyRestoredState(verificationContext()), 'operation_sequence_invalid')
    assert.equal(h.metadataCalls.length, 1)
    const serialized = JSON.stringify(decision)
    for (const raw of [RAW_RELATION, RAW_PRINCIPAL, RAW_ERROR, TEST_IDS[0], TEST_IDS[1]]) {
      assert.equal(serialized.includes(raw), false)
    }
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/core/src/live-cutover-restored-state-verification-node.ts'), 'utf8')
    for (const forbidden of ['node:fs', 'node:child_process', 'process.env', 'fetch(', 'console.', 'supabase', 'postgres']) {
      assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `forbidden runtime surface: ${forbidden}`)
    }
  })

  await test('O1 operator integration reaches canonical cleanup and compensates verification refusal', async () => {
    const input = packet()
    const reached: string[] = []
    const verification = createC5BRestoredStateVerificationNodePorts(config(), harness({}, input).sources)
    const before = (operation: Exclude<C5BOperation, 'verify_restored_state' | 'cleanup_isolated_restore' | 'complete_preflight'>) =>
      async (): Promise<C5BPortDecision> => ({ status: 'passed', evidence: operationEvidence(operation, input) })
    const ports: C5BOperatorPorts = {
      attestProject: before('attest_project'),
      probeCatalogAcl: before('probe_catalog_acl'),
      freezeWriters: before('freeze_writers'),
      createProviderRecoveryPoint: before('create_provider_recovery_point'),
      createEncryptedLogicalBackup: before('create_encrypted_logical_backup'),
      restoreIsolatedBackup: before('restore_isolated_backup'),
      verifyRestoredState: async (context) => { reached.push('verify'); return verification.verifyRestoredState(context) },
      cleanupIsolatedRestore: async () => { reached.push('cleanup'); return { status: 'refused', reasonCode: 'cleanup_incomplete' } },
      unfreezeWriters: async () => { reached.push('unfreeze'); return { unfreezeConfirmed: true } },
    }
    let tick = 0
    const result = await runC5BPreflightOperator(input, {
      ports,
      clock: { now: () => new Date(Date.parse(START) + tick++ * 500).toISOString() },
    })
    assert.equal(result.ok, false)
    assert.deepEqual(reached, ['verify', 'cleanup', 'unfreeze'], JSON.stringify(result))

    const failedReached: string[] = []
    const drift = harness({ metadata: async () => metadata(input, { catalog: [{ kind: 'table', name: 'drift' }] }) }, input)
    const failedVerification = createC5BRestoredStateVerificationNodePorts(config(), drift.sources)
    const failedPorts: C5BOperatorPorts = {
      ...ports,
      verifyRestoredState: async (context) => { failedReached.push('verify'); return failedVerification.verifyRestoredState(context) },
      cleanupIsolatedRestore: async () => { failedReached.push('compensation-cleanup'); return {
        status: 'passed', evidence: { cleanupConfirmed: true, residualResourceCount: 0 },
      } },
      unfreezeWriters: async () => { failedReached.push('unfreeze'); return { unfreezeConfirmed: true } },
    }
    tick = 0
    const failedResult = await runC5BPreflightOperator(input, {
      ports: failedPorts,
      clock: { now: () => new Date(Date.parse(START) + tick++ * 500).toISOString() },
    })
    assert.equal(failedResult.ok, false)
    assert.deepEqual(failedReached, ['verify', 'compensation-cleanup', 'unfreeze'])
  })

  console.log(`P17-016 C5B restored-state verification Node: ${passed} passed, ${failed} failed`)
  if (failed > 0 || passed !== 9) process.exitCode = 1
}

void main()
