import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  C5B_POLICY_VERSION,
  C5B_SCHEMA_VERSION,
  createC5BOperationReceipt,
  createC5BPreflightPacket,
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
  createC5BCatalogAclProbeNodePorts,
  type C5BCatalogAclProbeConfig,
  type C5BCatalogAclProbeObservation,
  type C5BCatalogAclProbeRequest,
} from '../src/live-cutover-catalog-acl-probe-node'

type Scalar = string | number | boolean | null
type Row = Record<string, Scalar>
type Domain = 'catalog' | 'acl' | 'rpc' | 'policy' | 'extension'

const packetHashes = Array.from({ length: 8 }, (_, index) => (index + 1).toString(16).repeat(64).slice(0, 64))
const rawRelation = 'private_relation_control'
const rawPrincipal = 'private_principal_control'
const rawProviderError = 'private_provider_error_control'
const serverVersionNum = 170004

function packet(attemptId = '123e4567-e89b-42d3-a456-426614174000'): C5BPreflightPacket {
  return createC5BPreflightPacket({
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId,
    approvalRef: 'operator_approval',
    environmentClass: 'managed_nonproduction',
    freezeStartsAt: '2026-08-20T01:00:00.000Z',
    freezeExpiresAt: '2026-08-20T02:00:00.000Z',
    destinationCapabilityId: 'protected_backup',
    source: {
      migration0018Sha256: packetHashes[0], migration0019Sha256: packetHashes[1],
      rollback0018Sha256: packetHashes[2], rollback0019Sha256: packetHashes[3],
    },
    requirements: {
      providerRecoveryPoint: true, encryptedLogicalBackup: true,
      isolatedRestore: true, metadataOnlyEvidence: true,
    },
    limits: { maxStepDurationMs: 1_000, maxBackupBytes: 50_000, maxObjectCount: 100 },
  })
}

function attestedContext(value = packet()): C5BOperatorContext {
  const attestation = createC5BOperationReceipt(value, {
    operation: 'attest_project', status: 'passed', reasonCode: null,
    startedAt: '2026-08-20T01:00:00.000Z', completedAt: '2026-08-20T01:00:01.000Z',
    evidence: {
      projectMatch: true, environmentClass: value.environmentClass,
      attestedAt: '2026-08-20T01:00:00.500Z',
    },
  })
  return Object.freeze({ packet: value, receipts: Object.freeze([attestation]) })
}

function observation(): C5BCatalogAclProbeObservation {
  return {
    serverVersionNum,
    catalog: [
      { kind: 'table', name: rawRelation, rls_enabled: true },
      { kind: 'function', name: 'verify_record', security_definer: true },
    ],
    acl: [
      { grantable: false, grantee: rawPrincipal, privilege: 'SELECT', relation: rawRelation },
    ],
    rpc: [
      { definition_sha256: 'a'.repeat(64), identity: 'verify_record(uuid,text)' },
    ],
    policy: [
      { command: 'SELECT', expression_sha256: 'b'.repeat(64), name: 'tenant_read', relation: rawRelation },
    ],
    extension: [
      { name: 'pgcrypto', version: '1.3' },
    ],
    migrationObject: [
      { kind: 'table', name: 'tenant_foundation' },
      { kind: 'function', name: 'persist_verification' },
    ],
    writerActivity: [
      { backend_type: 'client backend', state: 'idle in transaction' },
    ],
  }
}

function canonicalRow(value: Row): string {
  const ordered: Row = {}
  for (const key of Object.keys(value).sort()) ordered[key] = value[key]
  return JSON.stringify(ordered)
}

function domainHash(domain: Domain, rows: readonly Row[], version = serverVersionNum): string {
  const sorted = rows.map(canonicalRow).sort().map((row) => JSON.parse(row) as Row)
  const transcript = domain === 'catalog'
    ? { schemaVersion: 1, policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION, domain, serverVersionNum: version, rows: sorted }
    : { schemaVersion: 1, policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION, domain, rows: sorted }
  return createHash('sha256').update(JSON.stringify(transcript), 'utf8').digest('hex')
}

function expected(value: C5BCatalogAclProbeObservation = observation()) {
  return {
    serverVersionNum: value.serverVersionNum,
    catalogHash: domainHash('catalog', value.catalog as Row[], value.serverVersionNum),
    aclHash: domainHash('acl', value.acl as Row[]),
    rpcHash: domainHash('rpc', value.rpc as Row[]),
    policyHash: domainHash('policy', value.policy as Row[]),
    extensionHash: domainHash('extension', value.extension as Row[]),
  }
}

function config(
  value: C5BCatalogAclProbeObservation = observation(),
  overrides: Partial<C5BCatalogAclProbeConfig> = {},
): C5BCatalogAclProbeConfig {
  return {
    expected: expected(value),
    maxRowsPerDomain: 20,
    maxRowBytes: 1_024,
    maxTotalBytes: 20_000,
    maxMigrationObjects: 20,
    maxWriterActivities: 20,
    timeoutMs: 100,
    now: () => '2026-08-20T01:00:02.000Z',
    ...overrides,
  }
}

interface Harness {
  readonly requests: C5BCatalogAclProbeRequest[]
  readonly source: { readCatalogAclMetadata: (request: C5BCatalogAclProbeRequest) => Promise<unknown> }
  result: (request: C5BCatalogAclProbeRequest) => Promise<unknown>
}

function harness(initial: unknown = observation()): Harness {
  const value = {} as Harness
  Object.assign(value, { requests: [] })
  value.result = async () => initial
  Object.assign(value, {
    source: {
      readCatalogAclMetadata: async (request: C5BCatalogAclProbeRequest): Promise<unknown> => {
        value.requests.push(request)
        return value.result(request)
      },
    },
  })
  return value
}

function createPorts(value: Harness, configuration = config()) {
  return createC5BCatalogAclProbeNodePorts(configuration, value.source)
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
    console.error(`FAIL ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  }
}

async function main(): Promise<void> {
  await test('A1 factory rejects widened/accessor/unsafe configuration and snapshots trusted inputs', async () => {
    const valid = harness()
    for (const invalid of [
      { ...config(), timeoutMs: 0 },
      { ...config(), maxRowsPerDomain: 0 },
      { ...config(), maxRowBytes: 0 },
      { ...config(), maxTotalBytes: Number.MAX_SAFE_INTEGER },
      { ...config(), maxMigrationObjects: -1 },
      { ...config(), maxMigrationObjects: 0 },
      { ...config(), maxWriterActivities: -1 },
      { ...config(), maxWriterActivities: 0 },
      { ...config(), expected: { ...expected(), catalogHash: 'A'.repeat(64) } },
      { ...config(), now: 'not-a-clock' },
      { ...config(), extra: true },
    ]) assert.throws(
      () => createC5BCatalogAclProbeNodePorts(invalid as C5BCatalogAclProbeConfig, valid.source),
      (error: unknown) => error instanceof Error && error.message === 'C5B catalog/ACL probe configuration refused',
    )

    const accessor = { ...config() }
    Object.defineProperty(accessor, 'timeoutMs', { enumerable: true, get: () => 100 })
    assert.throws(() => createC5BCatalogAclProbeNodePorts(accessor, valid.source))
    const symbolSource = { ...valid.source }
    Object.defineProperty(symbolSource, Symbol('hidden'), { value: rawProviderError })
    assert.throws(() => createC5BCatalogAclProbeNodePorts(config(), symbolSource))
    const hostile = new Proxy({}, { getPrototypeOf: () => { throw new Error(rawProviderError) } })
    assert.throws(
      () => createC5BCatalogAclProbeNodePorts(hostile as C5BCatalogAclProbeConfig, valid.source),
      (error: unknown) => error instanceof Error && !error.message.includes(rawProviderError),
    )

    const mutableExpected = expected()
    const mutableConfig = { ...config(), expected: mutableExpected }
    const mutableSource = { ...valid.source }
    const ports = createC5BCatalogAclProbeNodePorts(mutableConfig, mutableSource)
    mutableExpected.catalogHash = 'f'.repeat(64)
    mutableConfig.now = () => 'not-a-time'
    mutableSource.readCatalogAclMetadata = async () => { throw new Error(rawProviderError) }
    assert.equal((await ports.probeCatalogAcl(attestedContext())).status, 'passed')
  })

  await test('S1 context validation and replay consume one packet before repeated source access', async () => {
    const invalidHarness = harness()
    const invalidPorts = createPorts(invalidHarness)
    const value = packet()
    for (const attack of [
      null,
      { packet: value, receipts: [] },
      { packet: { ...value, packetHash: packetHashes[7] }, receipts: attestedContext(value).receipts },
      { ...attestedContext(value), extra: true },
    ]) assert.deepEqual(
      await invalidPorts.probeCatalogAcl(attack as C5BOperatorContext),
      { status: 'refused', reasonCode: 'operation_sequence_invalid' },
    )
    assert.equal(invalidHarness.requests.length, 0)

    const sequential = harness()
    const sequentialPorts = createPorts(sequential)
    assert.equal((await sequentialPorts.probeCatalogAcl(attestedContext())).status, 'passed')
    assert.deepEqual(await sequentialPorts.probeCatalogAcl(attestedContext()), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    assert.equal(sequential.requests.length, 1)

    const concurrent = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    concurrent.result = async () => { await gate; return observation() }
    const concurrentPorts = createPorts(concurrent)
    const first = concurrentPorts.probeCatalogAcl(attestedContext())
    await Promise.resolve()
    assert.deepEqual(await concurrentPorts.probeCatalogAcl(attestedContext()), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    assert.equal(concurrent.requests.length, 1)
    release()
    assert.equal((await first).status, 'passed')
  })

  await test('B1 source exception, timeout, abort, late settlement, and clock failure sanitize output', async () => {
    const thrown = harness()
    thrown.result = async () => { throw new Error(rawProviderError) }
    const thrownDecision = await createPorts(thrown).probeCatalogAcl(attestedContext())
    assert.deepEqual(thrownDecision, { status: 'refused', reasonCode: 'provider_operation_refused' })
    assert.equal(JSON.stringify(thrownDecision).includes(rawProviderError), false)

    const timed = harness()
    let aborted = false
    let settle!: (value: unknown) => void
    timed.result = async (request) => new Promise((resolve) => {
      settle = resolve
      request.signal.addEventListener('abort', () => { aborted = request.signal.aborted }, { once: true })
    })
    const timedDecision = await createPorts(timed, config(observation(), { timeoutMs: 10 })).probeCatalogAcl(attestedContext())
    assert.deepEqual(timedDecision, { status: 'refused', reasonCode: 'provider_operation_refused' })
    assert.equal(aborted, true)
    settle({ ...observation(), extra: rawProviderError })
    await Promise.resolve()

    const clock = harness()
    const clockDecision = await createPorts(clock, config(observation(), {
      now: () => { throw new Error(rawProviderError) },
    })).probeCatalogAcl(attestedContext())
    assert.deepEqual(clockDecision, { status: 'refused', reasonCode: 'provider_operation_refused' })
    assert.equal(JSON.stringify(clockDecision).includes(rawProviderError), false)
    assert.equal(timed.requests[0].signal instanceof AbortSignal, true)
    assert.deepEqual(Object.keys(timed.requests[0]).sort(), ['attemptId', 'environmentClass', 'signal', 'sourceBindingHash'])
    assert.equal(Object.isFrozen(timed.requests[0]), true)
  })

  await test('R1 exact observation rejects accessors, Symbols, proxies, sparse arrays, and unknown fields', async () => {
    const attacks: unknown[] = [
      { ...observation(), unknown: true },
      { ...observation(), catalog: Object.assign([...observation().catalog], { extra: true }) },
      { ...observation(), catalog: new Array(2) },
      { ...observation(), catalog: new Array(1_000_001) },
      { ...observation(), catalog: [{}] },
    ]
    const accessor = { ...observation() }
    Object.defineProperty(accessor, 'catalog', { enumerable: true, get: () => observation().catalog })
    attacks.push(accessor)
    const symbol = { ...observation() }
    Object.defineProperty(symbol, Symbol('hidden'), { value: rawProviderError })
    attacks.push(symbol)
    attacks.push(new Proxy({}, { getPrototypeOf: () => { throw new Error(rawProviderError) } }))
    for (const attack of attacks) {
      const value = harness(attack)
      const decision = await createPorts(value).probeCatalogAcl(attestedContext(packet(randomUUID())))
      assert.deepEqual(decision, { status: 'refused', reasonCode: 'provider_operation_refused' })
      assert.equal(JSON.stringify(decision).includes(rawProviderError), false)
    }
  })

  await test('R1 scalar enforcement rejects nested, unstable, unsafe, and prohibited row values', async () => {
    const values: unknown[] = [
      { nested: { value: 1 } },
      { text: 'e\u0301' },
      { text: 'line\nfeed' },
      { number: Number.NaN },
      { number: Number.POSITIVE_INFINITY },
      { number: Number.MAX_SAFE_INTEGER + 1 },
      { number: -0 },
      { missing: undefined },
      { bigint: BigInt(1) },
      { callback: () => true },
      { UPPER: 'value' },
    ]
    for (const row of values) {
      const value = harness({ ...observation(), catalog: [row] })
      assert.deepEqual(
        await createPorts(value).probeCatalogAcl(attestedContext(packet(randomUUID()))),
        { status: 'refused', reasonCode: 'provider_operation_refused' },
      )
    }
  })

  await test('B1 row, rowset, aggregate, migration, writer, and packet bounds fail closed', async () => {
    const attacks: Array<{ observed: C5BCatalogAclProbeObservation; configuration: C5BCatalogAclProbeConfig }> = []
    const oversizedRow = { ...observation(), catalog: [{ name: 'x'.repeat(80) }] }
    attacks.push({ observed: oversizedRow, configuration: config(oversizedRow, { maxRowBytes: 32 }) })
    const oversizedSet = { ...observation(), catalog: [{ key: 1 }, { key: 2 }] }
    attacks.push({ observed: oversizedSet, configuration: config(oversizedSet, { maxRowsPerDomain: 1 }) })
    attacks.push({ observed: observation(), configuration: config(observation(), { maxTotalBytes: 8 }) })
    const migrations = { ...observation(), migrationObject: [{ key: 1 }, { key: 2 }] }
    attacks.push({ observed: migrations, configuration: config(migrations, { maxMigrationObjects: 1 }) })
    const writers = { ...observation(), writerActivity: [{ key: 1 }, { key: 2 }] }
    attacks.push({ observed: writers, configuration: config(writers, { maxWriterActivities: 1 }) })
    for (const [index, attack] of attacks.entries()) {
      const value = harness(attack.observed)
      assert.deepEqual(
        await createPorts(value, attack.configuration).probeCatalogAcl(attestedContext(packet(`${index + 2}23e4567-e89b-42d3-a456-426614174000`))),
        { status: 'refused', reasonCode: 'provider_operation_refused' },
      )
    }

    const packetBound = packet('923e4567-e89b-42d3-a456-426614174000')
    const widened = { ...observation(), migrationObject: Array.from({ length: 101 }, (_, index) => ({ key: index })) }
    const value = harness(widened)
    assert.deepEqual(
      await createPorts(value, config(widened, { maxMigrationObjects: 200 })).probeCatalogAcl(attestedContext(packetBound)),
      { status: 'refused', reasonCode: 'provider_operation_refused' },
    )
  })

  await test('H1 hashes are canonical, permutation-stable, duplicate-refusing, and domain separated', async () => {
    const base = observation()
    const permuted: C5BCatalogAclProbeObservation = {
      ...base,
      catalog: [
        { security_definer: true, name: 'verify_record', kind: 'function' },
        { rls_enabled: true, name: rawRelation, kind: 'table' },
      ],
    }
    const first = await createPorts(harness(base), config(base)).probeCatalogAcl(attestedContext(packet('a23e4567-e89b-42d3-a456-426614174000')))
    const second = await createPorts(harness(permuted), config(base)).probeCatalogAcl(attestedContext(packet('b23e4567-e89b-42d3-a456-426614174000')))
    assert.equal(first.status, 'passed')
    assert.deepEqual(second, first)
    if (first.status !== 'passed') throw new Error('expected passed probe')
    assert.equal(first.evidence.catalogHash, expected(base).catalogHash)
    assert.equal(first.evidence.aclHash, expected(base).aclHash)
    assert.equal(new Set([
      first.evidence.catalogHash, first.evidence.aclHash, first.evidence.rpcHash,
      first.evidence.policyHash, first.evidence.extensionHash,
    ]).size, 5)

    const duplicate = { ...base, catalog: [base.catalog[0], { ...base.catalog[0] }] }
    assert.deepEqual(
      await createPorts(harness(duplicate), config(duplicate)).probeCatalogAcl(attestedContext(packet('c23e4567-e89b-42d3-a456-426614174000'))),
      { status: 'refused', reasonCode: 'provider_operation_refused' },
    )
  })

  await test('V1/M1 server/source/time drift refuses; success is exact frozen metadata with no raw rows', async () => {
    const base = observation()
    const mismatchedVersion = { ...base, serverVersionNum: base.serverVersionNum + 1 }
    assert.deepEqual(
      await createPorts(harness(mismatchedVersion), config(base)).probeCatalogAcl(attestedContext(packet('d23e4567-e89b-42d3-a456-426614174000'))),
      { status: 'refused', reasonCode: 'integrity_mismatch' },
    )
    for (const [index, key] of ['catalogHash', 'aclHash', 'rpcHash', 'policyHash', 'extensionHash'].entries()) {
      const baseline = config(base)
      const drifted = {
        ...baseline,
        expected: { ...baseline.expected, [key]: (index + 9).toString(16).repeat(64).slice(0, 64) },
      }
      assert.deepEqual(
        await createPorts(harness(base), drifted).probeCatalogAcl(attestedContext(packet(`e2${index}e4567-e89b-42d3-a456-426614174000`))),
        { status: 'refused', reasonCode: 'integrity_mismatch' },
      )
    }
    for (const observedAt of ['not-a-time', '2026-08-20T00:59:59.999Z', '2026-08-20T02:00:00.001Z']) {
      const decision = await createPorts(harness(base), config(base, { now: () => observedAt }))
        .probeCatalogAcl(attestedContext(packet(randomUUID())))
      assert.deepEqual(decision, { status: 'refused', reasonCode: 'freeze_window_invalid' })
    }
    const backwardTimes = ['2026-08-20T01:00:03.000Z', '2026-08-20T01:00:02.000Z']
    const backward = await createPorts(harness(base), config(base, {
      now: () => backwardTimes.shift() ?? '2026-08-20T01:00:02.000Z',
    })).probeCatalogAcl(attestedContext(packet('f13e4567-e89b-42d3-a456-426614174000')))
    assert.deepEqual(backward, { status: 'refused', reasonCode: 'freeze_window_invalid' })

    const decision = await createPorts(harness(base), config(base)).probeCatalogAcl(attestedContext(packet('f23e4567-e89b-42d3-a456-426614174000')))
    assert.deepEqual(decision, {
      status: 'passed',
      evidence: {
        catalogHash: expected(base).catalogHash,
        aclHash: expected(base).aclHash,
        rpcHash: expected(base).rpcHash,
        policyHash: expected(base).policyHash,
        extensionHash: expected(base).extensionHash,
        migrationObjectCount: 2,
        writerActivityCount: 1,
      },
    })
    assert.equal(Object.isFrozen(decision), true)
    assert.equal(decision.status === 'passed' && Object.isFrozen(decision.evidence), true)
    const serialized = JSON.stringify(decision)
    for (const prohibited of [rawRelation, rawPrincipal, String(serverVersionNum), rawProviderError]) {
      assert.equal(serialized.includes(prohibited), false)
    }
  })

  await test('O1 real operator enforces project-before-probe and probe-before-freeze with no I/O surface', async () => {
    const source = harness()
    const probe = createPorts(source)
    const reached: string[] = []
    const later = async (name: string): Promise<C5BPortDecision> => {
      reached.push(name)
      return { status: 'refused', reasonCode: 'provider_operation_refused' }
    }
    const ports: C5BOperatorPorts = {
      attestProject: async () => ({ status: 'passed', evidence: {
        projectMatch: true, environmentClass: 'managed_nonproduction', attestedAt: '2026-08-20T01:00:00.500Z',
      } }),
      probeCatalogAcl: probe.probeCatalogAcl,
      freezeWriters: () => later('freeze_writers'),
      createProviderRecoveryPoint: () => later('unexpected_recovery'),
      createEncryptedLogicalBackup: () => later('unexpected_backup'),
      restoreIsolatedBackup: () => later('unexpected_restore'),
      verifyRestoredState: () => later('unexpected_verify'),
      cleanupIsolatedRestore: () => later('unexpected_cleanup'),
      unfreezeWriters: async () => { reached.push('unexpected_unfreeze'); return { unfreezeConfirmed: true } },
    }
    let tick = 0
    const result = await runC5BPreflightOperator(packet('023e4567-e89b-42d3-a456-426614174000'), {
      clock: { now: () => new Date(Date.parse('2026-08-20T01:00:00.000Z') + tick++ * 500).toISOString() },
      ports,
    })
    assert.equal(result.ok, false)
    assert.equal(result.failedStage, 'freeze_writers')
    assert.equal(source.requests.length, 1)
    assert.deepEqual(reached, ['freeze_writers'])

    const blockedSource = harness()
    const blockedProbe = createPorts(blockedSource)
    const blocked = await runC5BPreflightOperator(packet('123e4567-e89b-42d3-a456-426614174001'), {
      clock: { now: () => '2026-08-20T01:00:00.250Z' },
      ports: { ...ports, attestProject: async () => ({ status: 'refused', reasonCode: 'project_mismatch' }), probeCatalogAcl: blockedProbe.probeCatalogAcl },
    })
    assert.equal(blocked.reasonCode, 'project_mismatch')
    assert.equal(blockedSource.requests.length, 0)

    const sourceText = fs.readFileSync(path.join(process.cwd(), 'packages/core/src/live-cutover-catalog-acl-probe-node.ts'), 'utf8')
    for (const prohibited of [
      "from 'node:fs'", "from 'node:child_process'", 'process.env', 'console.',
      'supabase', 'fetch(', 'http://', 'https://', 'select ', 'pg_catalog', 'information_schema',
    ]) assert.equal(sourceText.toLowerCase().includes(prohibited.toLowerCase()), false, `source contains ${prohibited}`)
  })

  console.log(`C5B catalog/ACL probe Node attacks: ${passed}/${passed + failed} grouped attacks passed`)
  if (failed > 0 || passed !== 9) process.exitCode = 1
}

void main()
