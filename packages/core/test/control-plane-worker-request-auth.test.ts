import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  createControlPlaneMachineKeySet,
  revokeControlPlaneMachineKeySet,
  rotateControlPlaneMachineKeySet,
  type ControlPlaneMachineKeySet,
} from '../src/control-plane-machine-keys'
import {
  CONTROL_PLANE_WORKER_REQUEST_ALGORITHM,
  CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION,
  CONTROL_PLANE_WORKER_REQUEST_FUTURE_SKEW_MS,
  CONTROL_PLANE_WORKER_REQUEST_MAX_AGE_MS,
  CONTROL_PLANE_WORKER_REQUEST_MAX_BODY_BYTES,
  CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION,
  ControlPlaneWorkerRequestContractError,
  authenticateControlPlaneWorkerRequest,
  createControlPlaneWorkerRequestSignature,
  serializeControlPlaneWorkerRequestSignatureBytes,
  validateControlPlaneWorkerRequestSignature,
  type ControlPlaneMachineKeySetPort,
  type ControlPlaneWorkerRequestClockPort,
  type ControlPlaneWorkerRequestNonceCommitInput,
  type ControlPlaneWorkerRequestNoncePort,
  type ControlPlaneWorkerRequestSignature,
  type ControlPlaneWorkerRequestVerifierFactoryPort,
} from '../src/control-plane-worker-request-auth'
import {
  createNodeEd25519KeyPair,
  createNodeEd25519Verifier,
  type NodeEd25519SignerBundle,
} from '../src/control-plane-signing-node'
import type { ControlPlaneHashPort } from '../src/control-plane'

assert.equal(typeof createControlPlaneWorkerRequestSignature, 'function', 'missing A3B request signer export')
assert.equal(typeof authenticateControlPlaneWorkerRequest, 'function', 'missing A3B request authenticator export')
assert.equal(typeof serializeControlPlaneWorkerRequestSignatureBytes, 'function', 'missing A3B request serializer export')

const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  tenantB: '1b000000-0000-4000-8000-000000000001',
  machine: '5a000000-0000-4000-8000-000000000005',
  machineB: '5b000000-0000-4000-8000-000000000005',
  lease: '4a000000-0000-4000-8000-000000000004',
  leaseB: '4b000000-0000-4000-8000-000000000004',
} as const

const times = {
  activated: '2026-08-16T23:50:00.000Z',
  signed: '2026-08-17T00:00:30.000Z',
  now: '2026-08-17T00:01:00.000Z',
  staleBoundary: '2026-08-17T00:00:00.000Z',
  stale: '2026-08-16T23:59:59.999Z',
  futureBoundary: '2026-08-17T00:01:30.000Z',
  future: '2026-08-17T00:01:30.001Z',
  rotated: '2026-08-17T00:00:10.000Z',
  grace: '2026-08-17T00:05:10.000Z',
  revoked: '2026-08-17T00:00:20.000Z',
} as const

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}

function nonce(fill: number): string {
  return Buffer.alloc(32, fill).toString('base64url')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function expectRequestError(
  action: () => unknown,
  code?: InstanceType<typeof ControlPlaneWorkerRequestContractError>['code'],
  forbiddenEcho?: string,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ControlPlaneWorkerRequestContractError)
    if (code) assert.equal(error.code, code)
    if (forbiddenEcho) assert.equal(error.message.includes(forbiddenEcho), false, 'request error echoed attacker input')
    return true
  })
}

function keyFixture(): { pair: NodeEd25519SignerBundle; keySet: ControlPlaneMachineKeySet } {
  const pair = createNodeEd25519KeyPair()
  return {
    pair,
    keySet: createControlPlaneMachineKeySet({
      tenantId: ids.tenant,
      machineId: ids.machine,
      keyId: 'machine-key-1',
      publicKeySpki: pair.publicKeySpki,
      activatedAt: times.activated,
    }),
  }
}

function request(
  pair: NodeEd25519SignerBundle,
  body = '{"status":"ok"}',
  overrides: Partial<Parameters<typeof createControlPlaneWorkerRequestSignature>[0]> = {},
  port: ControlPlaneHashPort = hashPort,
): ControlPlaneWorkerRequestSignature {
  return createControlPlaneWorkerRequestSignature({
    requestKind: 'claim',
    leaseId: null,
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: 'machine-key-1',
    keyVersion: 1,
    signedAt: times.signed,
    nonce: nonce(1),
    ...overrides,
  }, body, port, pair.signer)
}

type HarnessOptions = {
  now?: string
  keySet?: unknown
  nonceOutcome?: 'accepted' | 'replayed' | 'key_changed' | 'denied' | 'malformed'
  keyLookupError?: string
  nonceError?: string
  verifierError?: string
  publicKeyOverride?: string
}

function authHarness(defaultKeySet: ControlPlaneMachineKeySet, options: HarnessOptions = {}) {
  const calls: string[] = []
  const keyLookupInputs: Array<{ readonly tenantId: string; readonly machineId: string }> = []
  const nonceInputs: ControlPlaneWorkerRequestNonceCommitInput[] = []
  const consumed = new Set<string>()
  let clockReads = 0

  const clock: ControlPlaneWorkerRequestClockPort = {
    now: () => {
      calls.push('clock')
      clockReads += 1
      if (options.now === 'throw') throw new Error('clock-secret-must-not-echo')
      return options.now ?? times.now
    },
  }
  const keySets: ControlPlaneMachineKeySetPort = {
    resolve: async (input) => {
      calls.push('key_lookup')
      keyLookupInputs.push(input)
      if (options.keyLookupError) throw new Error(options.keyLookupError)
      return options.keySet ?? defaultKeySet
    },
  }
  const verifierFactory: ControlPlaneWorkerRequestVerifierFactoryPort = {
    create: (publicKeySpki) => {
      calls.push('verifier_factory')
      if (options.verifierError === 'factory') throw new Error('factory-secret-must-not-echo')
      const real = createNodeEd25519Verifier(options.publicKeyOverride ?? publicKeySpki)
      return {
        verify: (canonicalBytes, signature) => {
          calls.push('verify')
          if (options.verifierError === 'verify') throw new Error('verify-secret-must-not-echo')
          return real.verify(canonicalBytes, signature)
        },
      }
    },
  }
  const nonces: ControlPlaneWorkerRequestNoncePort = {
    consumeAuthorized: async (input) => {
      calls.push('nonce_commit')
      nonceInputs.push(input)
      if (options.nonceError) throw new Error(options.nonceError)
      if (options.nonceOutcome === 'malformed') return 'unexpected' as never
      if (options.nonceOutcome) return options.nonceOutcome
      const key = `${input.tenantId}:${input.machineId}:${input.keyId}:${input.keyVersion}:${input.nonceHash}`
      if (consumed.has(key)) return 'replayed'
      consumed.add(key)
      return 'accepted'
    },
  }

  return {
    dependencies: { clock, keySets, verifierFactory, nonces, hashPort },
    calls,
    keyLookupInputs,
    nonceInputs,
    get clockReads() { return clockReads },
  }
}

async function authenticate(
  signature: unknown,
  body: string,
  keySet: ControlPlaneMachineKeySet,
  harness = authHarness(keySet),
  expectedRequestKind: 'claim' | 'heartbeat' | 'events' | 'complete' | 'key_rotate' = 'claim',
  expectedLeaseId: string | null = null,
) {
  const result = await authenticateControlPlaneWorkerRequest({
    signature,
    expectedRequestKind,
    expectedLeaseId,
    canonicalBody: body,
  }, harness.dependencies)
  return { result, harness }
}

let passed = 0
async function run(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

async function main(): Promise<void> {
  await run('1. real Ed25519 request round trip is exact, ordered, frozen, and nonce-safe', async () => {
    const { pair, keySet } = keyFixture()
    const body = '{"status":"ok"}'
    const signed = request(pair, body)
    assert.deepEqual(Object.keys(signed), [
      'schemaVersion', 'contractVersion', 'algorithm', 'requestKind', 'method', 'canonicalPath',
      'tenantId', 'machineId', 'keyId', 'keyVersion', 'signedAt', 'nonce', 'bodyHash', 'signature',
    ])
    assert.equal(signed.schemaVersion, CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION)
    assert.equal(signed.contractVersion, CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION)
    assert.equal(signed.algorithm, CONTROL_PLANE_WORKER_REQUEST_ALGORITHM)
    assert.equal(signed.requestKind, 'claim')
    assert.equal(signed.method, 'POST')
    assert.equal(signed.canonicalPath, '/api/control-plane/v1/worker/leases/claim')
    assert.equal(signed.tenantId, ids.tenant)
    assert.equal(signed.machineId, ids.machine)
    assert.equal(signed.nonce, nonce(1))
    assert.match(signed.bodyHash, /^[0-9a-f]{64}$/)
    assert.match(signed.signature, /^[A-Za-z0-9_-]{86}$/)
    assert.ok(isDeepFrozen(signed))

    const { result, harness } = await authenticate(signed, body, keySet)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.request, signed)
      assert.equal(result.keySetVersion, keySet.setVersion)
      assert.equal(result.observedAt, times.now)
    }
    assert.ok(isDeepFrozen(result))
    assert.deepEqual(harness.calls, ['clock', 'key_lookup', 'verifier_factory', 'verify', 'nonce_commit'])
    assert.equal(harness.clockReads, 1)
    assert.deepEqual(harness.keyLookupInputs, [{ tenantId: ids.tenant, machineId: ids.machine }])
    assert.deepEqual(Object.keys(harness.keyLookupInputs[0]), ['tenantId', 'machineId'])
    assert.equal(harness.nonceInputs.length, 1)
    assert.deepEqual(Object.keys(harness.nonceInputs[0]), [
      'tenantId', 'machineId', 'keyId', 'keyVersion', 'requestKind', 'expectedKeySetVersion',
      'nonceHash', 'signedAt', 'observedAt', 'expiresAt',
    ])
    assert.equal('nonce' in harness.nonceInputs[0], false)
    assert.equal(harness.nonceInputs[0].expectedKeySetVersion, keySet.setVersion)
    assert.match(harness.nonceInputs[0].nonceHash, /^[0-9a-f]{64}$/)
    assert.equal(harness.nonceInputs[0].nonceHash, hashPort.sha256(JSON.stringify({
      domain: 'claude-workflow-kit.control-plane.worker-request-nonce.v1',
      tenantId: signed.tenantId,
      machineId: signed.machineId,
      keyId: signed.keyId,
      keyVersion: signed.keyVersion,
      nonce: signed.nonce,
    })))
  })

  await run('2. request kind derives one canonical path and rejects kind, lease, and path confusion', async () => {
    const { pair, keySet } = keyFixture()
    const cases = [
      ['claim', null, '/api/control-plane/v1/worker/leases/claim'],
      ['heartbeat', ids.lease, `/api/control-plane/v1/worker/leases/${ids.lease}/heartbeat`],
      ['events', ids.lease, `/api/control-plane/v1/worker/leases/${ids.lease}/events`],
      ['complete', ids.lease, `/api/control-plane/v1/worker/leases/${ids.lease}/complete`],
      ['key_rotate', null, '/api/control-plane/v1/worker/keys/rotate'],
    ] as const
    let fill = 10
    for (const [requestKind, leaseId, expectedPath] of cases) {
      const signed = request(pair, '{}', { requestKind, leaseId, nonce: nonce(fill) })
      fill += 1
      assert.equal(signed.canonicalPath, expectedPath)
      const { result } = await authenticate(signed, '{}', keySet, authHarness(keySet), requestKind, leaseId)
      assert.equal(result.ok, true)
    }

    for (const invalid of [
      { requestKind: 'claim' as const, leaseId: ids.lease },
      { requestKind: 'key_rotate' as const, leaseId: ids.lease },
      { requestKind: 'heartbeat' as const, leaseId: null },
      { requestKind: 'events' as const, leaseId: ids.lease.toUpperCase() },
      { requestKind: 'complete' as const, leaseId: ids.leaseB, extra: true },
    ]) expectRequestError(() => request(pair, '{}', invalid as never))

    const heartbeat = request(pair, '{}', { requestKind: 'heartbeat', leaseId: ids.lease, nonce: nonce(30) })
    const wrongKind = await authenticate(heartbeat, '{}', keySet, authHarness(keySet), 'events', ids.lease)
    assert.deepEqual(wrongKind.result, { ok: false, reasonCode: 'worker_request_denied', auditCode: 'request_invalid' })
    const wrongLease = await authenticate(heartbeat, '{}', keySet, authHarness(keySet), 'heartbeat', ids.leaseB)
    assert.deepEqual(wrongLease.result, { ok: false, reasonCode: 'worker_request_denied', auditCode: 'request_invalid' })
    for (const tampered of [
      { ...heartbeat, method: 'GET' },
      { ...heartbeat, canonicalPath: `${heartbeat.canonicalPath}?retry=1` },
      { ...heartbeat, canonicalPath: `${heartbeat.canonicalPath}/` },
      { ...heartbeat, canonicalPath: heartbeat.canonicalPath.toUpperCase() },
      { ...heartbeat, requestKind: 'complete' },
    ]) expectRequestError(() => validateControlPlaneWorkerRequestSignature(tampered))
  })

  await run('3. exact UTF-8 body bytes are signed, bounded, and checked before nonce consumption', async () => {
    const { pair, keySet } = keyFixture()
    const body = '{"value":"original"}'
    const signed = request(pair, body, { nonce: nonce(40) })
    const changedHarness = authHarness(keySet)
    const changed = await authenticate(signed, '{"value":"changed"}', keySet, changedHarness)
    assert.deepEqual(changed.result, { ok: false, reasonCode: 'worker_request_denied', auditCode: 'signature_invalid' })
    assert.equal(changedHarness.nonceInputs.length, 0)

    const empty = request(pair, '', { nonce: nonce(41) })
    assert.equal((await authenticate(empty, '', keySet)).result.ok, true)
    const exact = 'é'.repeat(CONTROL_PLANE_WORKER_REQUEST_MAX_BODY_BYTES / 2)
    assert.doesNotThrow(() => request(pair, exact, { nonce: nonce(42) }))
    expectRequestError(
      () => request(pair, `${exact}é`, { nonce: nonce(43) }),
      'BODY_TOO_LARGE',
    )
    expectRequestError(() => createControlPlaneWorkerRequestSignature({
      requestKind: 'claim', leaseId: null, tenantId: ids.tenant, machineId: ids.machine,
      keyId: 'machine-key-1', keyVersion: 1, signedAt: times.signed, nonce: nonce(44),
    }, { not: 'a string' } as never, hashPort, pair.signer))
    assert.equal(CONTROL_PLANE_WORKER_REQUEST_MAX_BODY_BYTES, 64 * 1024)
  })

  await run('4. freshness accepts exact boundaries and closes stale, future, and clock failures', async () => {
    const { pair, keySet } = keyFixture()
    for (const [signedAt, fill] of [
      [times.now, 50],
      [times.staleBoundary, 51],
      [times.futureBoundary, 52],
    ] as const) {
      const signed = request(pair, '{}', { signedAt, nonce: nonce(fill) })
      const harness = authHarness(keySet)
      const result = await authenticate(signed, '{}', keySet, harness)
      assert.equal(result.result.ok, true)
      assert.equal(harness.clockReads, 1)
    }
    for (const [signedAt, fill] of [[times.stale, 53], [times.future, 54]] as const) {
      const signed = request(pair, '{}', { signedAt, nonce: nonce(fill) })
      const harness = authHarness(keySet)
      const result = await authenticate(signed, '{}', keySet, harness)
      assert.deepEqual(result.result, { ok: false, reasonCode: 'worker_request_denied', auditCode: 'request_stale' })
      assert.equal(harness.nonceInputs.length, 0)
      assert.equal(harness.calls.includes('key_lookup'), false)
    }
    for (const now of ['2026-08-17T00:01:00Z', 'invalid-time', 'throw']) {
      const signed = request(pair, '{}', { nonce: nonce(now.length) })
      const harness = authHarness(keySet, { now })
      const result = await authenticate(signed, '{}', keySet, harness)
      assert.deepEqual(result.result, {
        ok: false,
        reasonCode: 'worker_request_unavailable',
        auditCode: 'dependency_unavailable',
      })
      assert.equal(harness.nonceInputs.length, 0)
    }
    assert.equal(CONTROL_PLANE_WORKER_REQUEST_MAX_AGE_MS, 60 * 1000)
    assert.equal(CONTROL_PLANE_WORKER_REQUEST_FUTURE_SKEW_MS, 30 * 1000)
  })

  await run('5. key authorization composes identity, grace, rotation, and immediate revocation', async () => {
    const { pair, keySet } = keyFixture()
    for (const [overrides, fill] of [
      [{ tenantId: ids.tenantB }, 60],
      [{ machineId: ids.machineB }, 61],
      [{ keyId: 'unknown-key' }, 62],
      [{ keyVersion: 2 }, 63],
    ] as const) {
      const signed = request(pair, '{}', { ...overrides, nonce: nonce(fill) })
      const result = await authenticate(signed, '{}', keySet)
      assert.deepEqual(result.result, { ok: false, reasonCode: 'worker_request_denied', auditCode: 'key_denied' })
      assert.equal(result.harness.nonceInputs.length, 0)
    }

    const nextPair = createNodeEd25519KeyPair()
    const rotated = rotateControlPlaneMachineKeySet(keySet, {
      expectedSetVersion: keySet.setVersion,
      authenticatedKeyId: 'machine-key-1',
      authenticatedKeyVersion: 1,
      newKeyId: 'machine-key-2',
      newKeyVersion: 2,
      newPublicKeySpki: nextPair.publicKeySpki,
      rotatedAt: times.rotated,
      graceExpiresAt: times.grace,
    })
    const oldWorker = request(pair, '{}', { requestKind: 'heartbeat', leaseId: ids.lease, nonce: nonce(64) })
    assert.equal((await authenticate(oldWorker, '{}', rotated, authHarness(rotated), 'heartbeat', ids.lease)).result.ok, true)
    const oldRotate = request(pair, '{}', { requestKind: 'key_rotate', leaseId: null, nonce: nonce(65) })
    assert.deepEqual(
      (await authenticate(oldRotate, '{}', rotated, authHarness(rotated), 'key_rotate', null)).result,
      { ok: false, reasonCode: 'worker_request_denied', auditCode: 'key_denied' },
    )
    const revoked = revokeControlPlaneMachineKeySet(rotated, {
      expectedSetVersion: rotated.setVersion,
      keyId: 'machine-key-1',
      keyVersion: 1,
      revokedAt: times.revoked,
    })
    assert.deepEqual(
      (await authenticate(oldWorker, '{}', revoked, authHarness(revoked), 'heartbeat', ids.lease)).result,
      { ok: false, reasonCode: 'worker_request_denied', auditCode: 'key_denied' },
    )
  })

  await run('6. wrong keys, signature tampering, and verifier failures never consume a nonce or echo', async () => {
    const { pair, keySet } = keyFixture()
    const body = '{}'
    const signed = request(pair, body, { nonce: nonce(70) })
    const wrongPair = createNodeEd25519KeyPair()
    const wrongHarness = authHarness(keySet, { publicKeyOverride: wrongPair.publicKeySpki })
    assert.deepEqual((await authenticate(signed, body, keySet, wrongHarness)).result, {
      ok: false, reasonCode: 'worker_request_denied', auditCode: 'signature_invalid',
    })
    assert.equal(wrongHarness.nonceInputs.length, 0)

    for (const tampered of [
      { ...signed, signature: `${signed.signature.slice(0, -1)}${signed.signature.endsWith('A') ? 'Q' : 'A'}` },
      { ...signed, bodyHash: 'f'.repeat(64) },
      { ...signed, keyVersion: 2 },
      { ...signed, nonce: nonce(71) },
    ]) {
      const harness = authHarness(keySet)
      const result = await authenticate(tampered, body, keySet, harness)
      assert.equal(result.result.ok, false)
      assert.equal(harness.nonceInputs.length, 0)
    }

    for (const verifierError of ['factory', 'verify'] as const) {
      const harness = authHarness(keySet, { verifierError })
      const result = await authenticate(signed, body, keySet, harness)
      assert.deepEqual(result.result, {
        ok: false, reasonCode: 'worker_request_unavailable', auditCode: 'dependency_unavailable',
      })
      assert.equal(JSON.stringify(result.result).includes('secret-must-not-echo'), false)
      assert.equal(harness.nonceInputs.length, 0)
    }
  })

  await run('7. atomic nonce commit rejects replay, concurrent duplicate, key change, denial, and failures', async () => {
    const { pair, keySet } = keyFixture()
    const signed = request(pair, '{}', { nonce: nonce(80) })
    const harness = authHarness(keySet)
    assert.equal((await authenticate(signed, '{}', keySet, harness)).result.ok, true)
    assert.deepEqual((await authenticate(signed, '{}', keySet, harness)).result, {
      ok: false, reasonCode: 'worker_request_denied', auditCode: 'nonce_replayed',
    })

    const concurrent = request(pair, '{}', { nonce: nonce(81) })
    const concurrentHarness = authHarness(keySet)
    const results = await Promise.all([
      authenticate(concurrent, '{}', keySet, concurrentHarness),
      authenticate(concurrent, '{}', keySet, concurrentHarness),
    ])
    assert.equal(results.filter(({ result }) => result.ok).length, 1)
    assert.equal(results.filter(({ result }) => !result.ok && result.auditCode === 'nonce_replayed').length, 1)

    for (const [nonceOutcome, auditCode] of [
      ['key_changed', 'key_changed'],
      ['denied', 'key_denied'],
      ['replayed', 'nonce_replayed'],
    ] as const) {
      const outcomeHarness = authHarness(keySet, { nonceOutcome })
      const result = await authenticate(request(pair, '{}', { nonce: nonce(nonceOutcome.length + 90) }), '{}', keySet, outcomeHarness)
      assert.deepEqual(result.result, { ok: false, reasonCode: 'worker_request_denied', auditCode })
    }
    for (const options of [
      { nonceOutcome: 'malformed' as const },
      { nonceError: 'nonce-secret-must-not-echo' },
    ]) {
      const broken = authHarness(keySet, options)
      const result = await authenticate(request(pair, '{}', { nonce: nonce(100 + Object.keys(options).length) }), '{}', keySet, broken)
      assert.deepEqual(result.result, {
        ok: false, reasonCode: 'worker_request_unavailable', auditCode: 'dependency_unavailable',
      })
      assert.equal(JSON.stringify(result.result).includes('secret-must-not-echo'), false)
    }
  })

  await run('8. exact wrapper validation rejects encoding and object-graph attacks without accessors', () => {
    const { pair } = keyFixture()
    const signed = request(pair)
    for (const invalid of [
      { ...signed, schemaVersion: 2 },
      { ...signed, contractVersion: '2.0.0' },
      { ...signed, algorithm: 'RSA' },
      { ...signed, tenantId: ids.tenant.toUpperCase() },
      { ...signed, machineId: '' },
      { ...signed, keyId: '../key' },
      { ...signed, keyVersion: 0 },
      { ...signed, signedAt: '2026-08-17T00:00:30Z' },
      { ...signed, nonce: '' },
      { ...signed, nonce: `${signed.nonce}=` },
      { ...signed, nonce: `${signed.nonce.slice(0, -1)}+` },
      { ...signed, nonce: 'A'.repeat(43) },
      { ...signed, bodyHash: 'A'.repeat(64) },
      { ...signed, signature: '' },
      { ...signed, signature: `${signed.signature}=` },
      { ...signed, extra: true },
    ]) expectRequestError(() => validateControlPlaneWorkerRequestSignature(invalid))

    expectRequestError(() => validateControlPlaneWorkerRequestSignature(Object.assign(Object.create({ polluted: true }), signed)))
    let accessorRead = false
    const accessor = { ...signed } as Record<string, unknown>
    Object.defineProperty(accessor, 'signature', { enumerable: true, get: () => { accessorRead = true; return signed.signature } })
    expectRequestError(() => validateControlPlaneWorkerRequestSignature(accessor))
    assert.equal(accessorRead, false)
    const cyclic = { ...signed } as Record<string, unknown>
    cyclic.signature = cyclic
    expectRequestError(() => validateControlPlaneWorkerRequestSignature(cyclic))
    const hidden = { ...signed }
    Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true })
    expectRequestError(() => validateControlPlaneWorkerRequestSignature(hidden))
    expectRequestError(() => validateControlPlaneWorkerRequestSignature({ ...signed, [Symbol('hidden')]: true }))
  })

  await run('9. hash, lookup, and canonical-byte failures are closed and non-echoing', async () => {
    const { pair, keySet } = keyFixture()
    const secret = 'attacker-secret-must-not-echo'
    const constantHash: ControlPlaneHashPort = {
      sha256: (value) => value === '' ? '0'.repeat(64) : hashPort.sha256(value),
    }
    expectRequestError(
      () => request(pair, secret, { nonce: nonce(110) }, constantHash),
      'HASH_UNAVAILABLE',
      secret,
    )
    const throwingHash: ControlPlaneHashPort = { sha256: () => { throw new Error(secret) } }
    expectRequestError(() => request(pair, secret, { nonce: nonce(111) }, throwingHash), 'HASH_UNAVAILABLE', secret)

    const signed = request(pair, '{}', { nonce: nonce(112) })
    for (const options of [
      { keyLookupError: secret },
      { keySet: { malformed: true } },
    ]) {
      const harness = authHarness(keySet, options)
      const result = await authenticate(signed, '{}', keySet, harness)
      assert.deepEqual(result.result, {
        ok: false, reasonCode: 'worker_request_unavailable', auditCode: 'dependency_unavailable',
      })
      assert.equal(JSON.stringify(result.result).includes(secret), false)
      assert.equal(harness.nonceInputs.length, 0)
    }
    const canonical = serializeControlPlaneWorkerRequestSignatureBytes(signed)
    assert.deepEqual(Object.keys(JSON.parse(canonical) as Record<string, unknown>), [
      'domain', 'schemaVersion', 'contractVersion', 'algorithm', 'requestKind', 'method',
      'canonicalPath', 'tenantId', 'machineId', 'keyId', 'keyVersion', 'signedAt', 'nonce', 'bodyHash',
    ])
    assert.equal(JSON.parse(canonical).domain, 'claude-workflow-kit.control-plane.worker-request-signature.v1')
    assert.equal(serializeControlPlaneWorkerRequestSignatureBytes(Object.fromEntries(Object.entries(signed).reverse())), canonical)
  })

  await run('10. source ownership keeps request policy pure and A3A authorization-neutral', () => {
    const requestSource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-worker-request-auth.ts'),
      'utf8',
    )
    const keySource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-machine-keys.ts'),
      'utf8',
    )
    const a3aSource = fs.readFileSync(
      path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-signing.ts'),
      'utf8',
    )
    for (const source of [requestSource, keySource]) {
      assert.doesNotMatch(source, /from ['"]node:|process\.|fetch\(|supabase|filesystem|child_process|console\./)
      assert.doesNotMatch(source, /privateKey|providerToken|authorizationHeader|journal/i)
    }
    assert.match(requestSource, /control-plane-machine-keys/)
    assert.match(requestSource, /control-plane-signing/)
    assert.doesNotMatch(keySource, /control-plane-worker-request-auth/)
    assert.doesNotMatch(a3aSource, /nonce|revocation|rotation|journal|enrollment/i)
    assert.equal(CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION, 1)
    assert.equal(CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION, '1.0.0')
  })

  console.log(`P17-014 A3B worker request authentication: PASS (${passed} groups)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
