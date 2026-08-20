import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  createC5BProjectAttestationNodePorts,
  type C5BProjectApprovalRequest,
  type C5BProjectAttestationNodeConfig,
  type C5BProjectObservationRequest,
} from '../src/live-cutover-project-attestation-node'

const hashes = Array.from({ length: 8 }, (_, index) => (index + 1).toString(16).repeat(64).slice(0, 64))
const rawProjectIdentity = 'private-project-identity-alpha'
const rawProviderError = 'private-provider-error-control'

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
      migration0018Sha256: hashes[0], migration0019Sha256: hashes[1],
      rollback0018Sha256: hashes[2], rollback0019Sha256: hashes[3],
    },
    requirements: {
      providerRecoveryPoint: true, encryptedLogicalBackup: true,
      isolatedRestore: true, metadataOnlyEvidence: true,
    },
    limits: { maxStepDurationMs: 1_000, maxBackupBytes: 50_000, maxObjectCount: 100 },
  })
}

function context(value = packet()): C5BOperatorContext {
  return Object.freeze({ packet: value, receipts: Object.freeze([]) })
}

function bytes(value = rawProjectIdentity): Uint8Array {
  return new TextEncoder().encode(value)
}

function allZero(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0)
}

function config(overrides: Partial<C5BProjectAttestationNodeConfig> = {}): C5BProjectAttestationNodeConfig {
  return {
    maxIdentityBytes: 64,
    timeoutMs: 100,
    now: () => '2026-08-20T01:00:00.500Z',
    ...overrides,
  }
}

interface SourceHarness {
  readonly approvalCalls: C5BProjectApprovalRequest[]
  readonly observationCalls: C5BProjectObservationRequest[]
  readonly approvalIdentities: Uint8Array[]
  readonly observationIdentities: Uint8Array[]
  readonly approvalSource: { readonly resolveApprovedIdentity: (request: C5BProjectApprovalRequest) => Promise<unknown> }
  readonly observationSource: { readonly observeProjectIdentity: (request: C5BProjectObservationRequest) => Promise<unknown> }
  approval: (request: C5BProjectApprovalRequest) => Promise<unknown>
  observation: (request: C5BProjectObservationRequest) => Promise<unknown>
}

function harness(
  approved = rawProjectIdentity,
  observed = rawProjectIdentity,
  environmentClass = 'managed_nonproduction',
): SourceHarness {
  const value = {} as SourceHarness
  Object.assign(value, {
    approvalCalls: [],
    observationCalls: [],
    approvalIdentities: [],
    observationIdentities: [],
  })
  value.approval = async () => {
    const identity = bytes(approved)
    value.approvalIdentities.push(identity)
    return { identity }
  }
  value.observation = async () => {
    const identity = bytes(observed)
    value.observationIdentities.push(identity)
    return { identity, environmentClass }
  }
  Object.assign(value, {
    approvalSource: Object.freeze({
      resolveApprovedIdentity: async (request: C5BProjectApprovalRequest): Promise<unknown> => {
        value.approvalCalls.push(request)
        return value.approval(request)
      },
    }),
    observationSource: Object.freeze({
      observeProjectIdentity: async (request: C5BProjectObservationRequest): Promise<unknown> => {
        value.observationCalls.push(request)
        return value.observation(request)
      },
    }),
  })
  return value
}

function createPorts(value: SourceHarness, overrides: Partial<C5BProjectAttestationNodeConfig> = {}) {
  return createC5BProjectAttestationNodePorts(config(overrides), {
    approvalSource: value.approvalSource,
    observationSource: value.observationSource,
  })
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
  await test('A1 factory rejects invalid, aliased, and widened trust sources with sanitized errors', async () => {
    const valid = harness()
    for (const invalidConfig of [
      { ...config(), timeoutMs: 0 },
      { ...config(), maxIdentityBytes: 0 },
      { ...config(), timeoutMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...config(), now: 'not-a-clock' },
    ]) {
      assert.throws(
        () => createC5BProjectAttestationNodePorts(invalidConfig as C5BProjectAttestationNodeConfig, {
          approvalSource: valid.approvalSource,
          observationSource: valid.observationSource,
        }),
        (error: unknown) => error instanceof Error && error.message === 'C5B project-attestation configuration refused',
      )
    }
    const hostileConfig = new Proxy({}, {
      getPrototypeOf: () => { throw new Error(rawProviderError) },
    })
    assert.throws(
      () => createC5BProjectAttestationNodePorts(hostileConfig as C5BProjectAttestationNodeConfig, {
        approvalSource: valid.approvalSource,
        observationSource: valid.observationSource,
      }),
      (error: unknown) => error instanceof Error
        && error.message === 'C5B project-attestation configuration refused'
        && !error.message.includes(rawProviderError),
    )

    const sameObject = {
      resolveApprovedIdentity: valid.approvalSource.resolveApprovedIdentity,
      observeProjectIdentity: valid.observationSource.observeProjectIdentity,
    }
    assert.throws(() => createC5BProjectAttestationNodePorts(config(), {
      approvalSource: sameObject,
      observationSource: sameObject,
    }))

    const sharedResolver = async (): Promise<unknown> => ({ identity: bytes() })
    assert.throws(() => createC5BProjectAttestationNodePorts(config(), {
      approvalSource: { resolveApprovedIdentity: sharedResolver },
      observationSource: { observeProjectIdentity: sharedResolver },
    }))
    assert.throws(() => createC5BProjectAttestationNodePorts(config(), {
      approvalSource: { ...valid.approvalSource, extra: rawProviderError } as typeof valid.approvalSource,
      observationSource: valid.observationSource,
    }))
    const symbolSource = { resolveApprovedIdentity: valid.approvalSource.resolveApprovedIdentity }
    Object.defineProperty(symbolSource, Symbol('hidden'), { value: rawProviderError })
    assert.throws(() => createC5BProjectAttestationNodePorts(config(), {
      approvalSource: symbolSource,
      observationSource: valid.observationSource,
    }))

    const mutableConfig = { ...config() }
    const mutableApproval = { resolveApprovedIdentity: valid.approvalSource.resolveApprovedIdentity }
    const mutableObservation = { observeProjectIdentity: valid.observationSource.observeProjectIdentity }
    const snapshotted = createC5BProjectAttestationNodePorts(mutableConfig, {
      approvalSource: mutableApproval,
      observationSource: mutableObservation,
    })
    mutableConfig.now = () => 'not-a-time'
    mutableApproval.resolveApprovedIdentity = async () => { throw new Error(rawProviderError) }
    mutableObservation.observeProjectIdentity = async () => { throw new Error(rawProviderError) }
    assert.equal((await snapshotted.attestProject(context())).status, 'passed')
  })

  await test('E1/M1 success transfers, zeroizes, freezes, and emits exact metadata only', async () => {
    const value = harness()
    const decision = await createPorts(value).attestProject(context())
    assert.deepEqual(decision, {
      status: 'passed',
      evidence: {
        projectMatch: true,
        environmentClass: 'managed_nonproduction',
        attestedAt: '2026-08-20T01:00:00.500Z',
      },
    })
    assert.equal(Object.isFrozen(decision), true)
    assert.equal(decision.status === 'passed' && Object.isFrozen(decision.evidence), true)
    assert.equal(value.approvalCalls.length, 1)
    assert.equal(value.observationCalls.length, 1)
    assert.deepEqual(Object.keys(value.approvalCalls[0]).sort(), ['approvalRef', 'attemptId', 'signal'])
    assert.deepEqual(Object.keys(value.observationCalls[0]).sort(), ['attemptId', 'environmentClass', 'signal'])
    assert.equal(Object.isFrozen(value.approvalCalls[0]), true)
    assert.equal(Object.isFrozen(value.observationCalls[0]), true)
    assert.equal(value.approvalCalls[0].signal, value.observationCalls[0].signal)
    assert.equal(value.approvalIdentities.every(allZero), true)
    assert.equal(value.observationIdentities.every(allZero), true)
    const serialized = JSON.stringify(decision)
    assert.equal(serialized.includes(rawProjectIdentity), false)
    assert.equal(serialized.includes(createHash('sha256').update(rawProjectIdentity).digest('hex')), false)
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/core/src/live-cutover-project-attestation-node.ts'), 'utf8')
    for (const prohibited of [
      "from 'node:fs'", "from 'node:child_process'", 'process.env', 'console.', 'createHash(',
      'supabase', 'fetch(', 'http://', 'https://',
    ]) assert.equal(source.toLowerCase().includes(prohibited.toLowerCase()), false, `source contains ${prohibited}`)
  })

  await test('E1/I1 malformed, empty, oversized, shared, and widened source results fail closed', async () => {
    const cases: Array<{
      mutate: (value: SourceHarness) => void
      reasonCode: string
    }> = [
      { mutate: (value) => { value.approval = async () => ({ identity: rawProjectIdentity }) }, reasonCode: 'provider_operation_refused' },
      { mutate: (value) => { value.approval = async () => ({ identity: new Uint8Array() }) }, reasonCode: 'provider_operation_refused' },
      { mutate: (value) => { value.approval = async () => ({ identity: new Uint8Array(65) }) }, reasonCode: 'provider_operation_refused' },
      { mutate: (value) => { value.observation = async () => ({ identity: bytes(), environmentClass: 'managed_nonproduction', extra: true }) }, reasonCode: 'provider_operation_refused' },
      { mutate: (value) => { value.observation = async () => ({ identity: bytes(), environmentClass: 'unknown' }) }, reasonCode: 'provider_operation_refused' },
      { mutate: (value) => { value.approval = async () => {
        const result = {}
        Object.defineProperty(result, 'identity', { enumerable: true, get: () => bytes() })
        return result
      } }, reasonCode: 'provider_operation_refused' },
    ]
    for (const attack of cases) {
      const value = harness()
      attack.mutate(value)
      const decision = await createPorts(value).attestProject(context())
      assert.deepEqual(decision, { status: 'refused', reasonCode: attack.reasonCode })
    }

    const shared = harness()
    const storage = new ArrayBuffer(64)
    new Uint8Array(storage).set(bytes())
    const approvedView = new Uint8Array(storage, 0, bytes().length)
    const observedView = new Uint8Array(storage, 0, bytes().length)
    shared.approval = async () => ({ identity: approvedView })
    shared.observation = async () => ({ identity: observedView, environmentClass: 'managed_nonproduction' })
    assert.deepEqual(await createPorts(shared).attestProject(context()), {
      status: 'refused', reasonCode: 'project_mismatch',
    })
    assert.equal(allZero(approvedView), true)
    assert.equal(allZero(observedView), true)
  })

  await test('I1 mismatch and environment mismatch zeroize identities and return only project_mismatch', async () => {
    for (const value of [harness(rawProjectIdentity, `${rawProjectIdentity}-other`), harness(rawProjectIdentity, rawProjectIdentity, 'managed_production')]) {
      const decision = await createPorts(value).attestProject(context())
      assert.deepEqual(decision, { status: 'refused', reasonCode: 'project_mismatch' })
      assert.equal(value.approvalIdentities.every(allZero), true)
      assert.equal(value.observationIdentities.every(allZero), true)
      assert.equal(JSON.stringify(decision).includes(rawProjectIdentity), false)
    }
  })

  await test('B1 source exceptions and one bounded abort refuse without provider text and zeroize transfers', async () => {
    const thrown = harness()
    thrown.observation = async () => { throw new Error(rawProviderError) }
    const thrownDecision = await createPorts(thrown).attestProject(context())
    assert.deepEqual(thrownDecision, { status: 'refused', reasonCode: 'provider_operation_refused' })
    assert.equal(thrown.approvalIdentities.every(allZero), true)
    assert.equal(JSON.stringify(thrownDecision).includes(rawProviderError), false)

    const timed = harness()
    let aborted = false
    timed.observation = async (request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => {
        aborted = request.signal.aborted
        reject(new Error(rawProviderError))
      }, { once: true })
    })
    const timedDecision = await createPorts(timed, { timeoutMs: 15 }).attestProject(context())
    assert.deepEqual(timedDecision, { status: 'refused', reasonCode: 'provider_operation_refused' })
    assert.equal(aborted, true)
    assert.equal(timed.approvalIdentities.every(allZero), true)
    assert.equal(JSON.stringify(timedDecision).includes(rawProviderError), false)
  })

  await test('T1 invalid/out-of-window clocks refuse and zeroize both identities', async () => {
    for (const attestedAt of ['not-a-time', '2026-08-20T00:59:59.999Z', '2026-08-20T02:00:00.001Z']) {
      const value = harness()
      const decision = await createPorts(value, { now: () => attestedAt }).attestProject(context())
      assert.deepEqual(decision, { status: 'refused', reasonCode: 'freeze_window_invalid' })
      assert.equal(value.approvalIdentities.every(allZero), true)
      assert.equal(value.observationIdentities.every(allZero), true)
    }
  })

  await test('R1 concurrent and sequential replay consume the packet before any repeated source access', async () => {
    const sequential = harness()
    const sequentialPorts = createPorts(sequential)
    assert.equal((await sequentialPorts.attestProject(context())).status, 'passed')
    assert.deepEqual(await sequentialPorts.attestProject(context()), {
      status: 'refused', reasonCode: 'operation_sequence_invalid',
    })
    assert.equal(sequential.approvalCalls.length, 1)
    assert.equal(sequential.observationCalls.length, 1)

    const concurrent = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    concurrent.approval = async () => {
      await gate
      const identity = bytes()
      concurrent.approvalIdentities.push(identity)
      return { identity }
    }
    const concurrentPorts = createPorts(concurrent)
    const first = concurrentPorts.attestProject(context())
    await Promise.resolve()
    const replay = await concurrentPorts.attestProject(context())
    assert.deepEqual(replay, { status: 'refused', reasonCode: 'operation_sequence_invalid' })
    assert.equal(concurrent.approvalCalls.length, 1)
    release()
    assert.equal((await first).status, 'passed')
    assert.equal(concurrent.observationCalls.length, 1)
  })

  await test('R1 invalid/corrupt/already-advanced contexts make zero source calls', async () => {
    const value = harness()
    const ports = createPorts(value)
    const validPacket = packet()
    const attested = createC5BOperationReceipt(validPacket, {
      operation: 'attest_project', status: 'passed', reasonCode: null,
      startedAt: '2026-08-20T01:00:00.000Z', completedAt: '2026-08-20T01:00:01.000Z',
      evidence: {
        projectMatch: true, environmentClass: 'managed_nonproduction',
        attestedAt: '2026-08-20T01:00:00.500Z',
      },
    })
    const attacks = [
      null,
      { packet: { ...validPacket, packetHash: hashes[7] }, receipts: [] },
      { packet: validPacket, receipts: [], extra: true },
      { packet: validPacket, receipts: [attested] },
    ]
    for (const attack of attacks) {
      const decision = await ports.attestProject(attack as C5BOperatorContext)
      assert.deepEqual(decision, { status: 'refused', reasonCode: 'operation_sequence_invalid' })
    }
    assert.equal(value.approvalCalls.length, 0)
    assert.equal(value.observationCalls.length, 0)
  })

  await test('O1 real operator mismatch makes zero later-port calls and leaks no identity', async () => {
    const value = harness(rawProjectIdentity, `${rawProjectIdentity}-other`)
    const project = createPorts(value)
    const laterCalls: string[] = []
    const later = async (name: string): Promise<C5BPortDecision> => {
      laterCalls.push(name)
      return { status: 'refused', reasonCode: 'provider_operation_refused' }
    }
    const ports: C5BOperatorPorts = {
      attestProject: project.attestProject,
      probeCatalogAcl: () => later('probe_catalog_acl'),
      freezeWriters: () => later('freeze_writers'),
      createProviderRecoveryPoint: () => later('create_provider_recovery_point'),
      createEncryptedLogicalBackup: () => later('create_encrypted_logical_backup'),
      restoreIsolatedBackup: () => later('restore_isolated_backup'),
      verifyRestoredState: () => later('verify_restored_state'),
      cleanupIsolatedRestore: () => later('cleanup_isolated_restore'),
      unfreezeWriters: async () => { laterCalls.push('unfreeze_writers'); return { unfreezeConfirmed: true } },
    }
    let tick = 0
    const result = await runC5BPreflightOperator(packet(), {
      clock: { now: () => new Date(Date.parse('2026-08-20T01:00:00.000Z') + tick++ * 1_000).toISOString() },
      ports,
    })
    assert.equal(result.ok, false)
    assert.equal(result.reasonCode, 'project_mismatch')
    assert.equal(laterCalls.length, 0)
    assert.equal(JSON.stringify(result).includes(rawProjectIdentity), false)

    const matching = harness()
    const matchingProject = createPorts(matching)
    const reached: string[] = []
    const successBoundary: C5BOperatorPorts = {
      attestProject: matchingProject.attestProject,
      probeCatalogAcl: async () => {
        reached.push('probe_catalog_acl')
        return { status: 'refused', reasonCode: 'provider_operation_refused' }
      },
      freezeWriters: () => later('unexpected_freeze'),
      createProviderRecoveryPoint: () => later('unexpected_recovery'),
      createEncryptedLogicalBackup: () => later('unexpected_backup'),
      restoreIsolatedBackup: () => later('unexpected_restore'),
      verifyRestoredState: () => later('unexpected_verify'),
      cleanupIsolatedRestore: () => later('unexpected_cleanup'),
      unfreezeWriters: async () => { laterCalls.push('unexpected_unfreeze'); return { unfreezeConfirmed: true } },
    }
    tick = 0
    const continued = await runC5BPreflightOperator(packet('223e4567-e89b-42d3-a456-426614174000'), {
      clock: { now: () => new Date(Date.parse('2026-08-20T01:00:00.000Z') + tick++ * 1_000).toISOString() },
      ports: successBoundary,
    })
    assert.equal(continued.ok, false)
    assert.equal(continued.reasonCode, 'provider_operation_refused')
    assert.deepEqual(reached, ['probe_catalog_acl'])
    assert.equal(laterCalls.length, 0)
  })

  console.log(`C5B project-attestation Node attacks: ${passed}/${passed + failed} grouped attacks passed`)
  if (failed > 0 || passed !== 9) process.exitCode = 1
}

void main()
