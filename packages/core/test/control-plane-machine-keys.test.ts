import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION,
  CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS,
  CONTROL_PLANE_MACHINE_KEY_MAX_ROTATION_GRACE_MS,
  CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION,
  ControlPlaneMachineKeyContractError,
  authorizeControlPlaneMachineKey,
  createControlPlaneMachineKeySet,
  revokeControlPlaneMachineKeySet,
  rotateControlPlaneMachineKeySet,
  validateControlPlaneMachineKeySet,
  type ControlPlaneMachineKeySet,
} from '../src/control-plane-machine-keys'
import { createNodeEd25519KeyPair } from '../src/control-plane-signing-node'

assert.equal(typeof createControlPlaneMachineKeySet, 'function', 'missing A3B initial key-set export')
assert.equal(typeof rotateControlPlaneMachineKeySet, 'function', 'missing A3B rotation export')
assert.equal(typeof revokeControlPlaneMachineKeySet, 'function', 'missing A3B revocation export')
assert.equal(typeof authorizeControlPlaneMachineKey, 'function', 'missing A3B key-authorization export')

const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  tenantB: '1b000000-0000-4000-8000-000000000001',
  machine: '5a000000-0000-4000-8000-000000000005',
  machineB: '5b000000-0000-4000-8000-000000000005',
} as const

const times = {
  activated: '2026-08-17T00:00:00.000Z',
  beforeActivated: '2026-08-16T23:59:59.999Z',
  rotated: '2026-08-17T00:01:00.000Z',
  grace: '2026-08-17T00:06:00.000Z',
  insideGrace: '2026-08-17T00:05:59.999Z',
  afterGrace: '2026-08-17T00:06:00.001Z',
  revoked: '2026-08-17T00:02:00.000Z',
} as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function expectKeyError(
  action: () => unknown,
  code?: InstanceType<typeof ControlPlaneMachineKeyContractError>['code'],
  forbiddenEcho?: string,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ControlPlaneMachineKeyContractError)
    if (code) assert.equal(error.code, code)
    if (forbiddenEcho) assert.equal(error.message.includes(forbiddenEcho), false, 'key error echoed attacker input')
    return true
  })
}

function initial(
  overrides: Partial<Parameters<typeof createControlPlaneMachineKeySet>[0]> = {},
): ControlPlaneMachineKeySet {
  const pair = createNodeEd25519KeyPair()
  return createControlPlaneMachineKeySet({
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: 'machine-key-1',
    publicKeySpki: pair.publicKeySpki,
    activatedAt: times.activated,
    ...overrides,
  })
}

function rotate(
  current: ControlPlaneMachineKeySet,
  version: number,
  rotatedAt: string = times.rotated,
  graceExpiresAt: string = times.grace,
): ControlPlaneMachineKeySet {
  const pair = createNodeEd25519KeyPair()
  return rotateControlPlaneMachineKeySet(current, {
    expectedSetVersion: current.setVersion,
    authenticatedKeyId: current.keys.find((key) => key.keyVersion === current.activeKeyVersion)!.keyId,
    authenticatedKeyVersion: current.activeKeyVersion!,
    newKeyId: `machine-key-${version}`,
    newKeyVersion: version,
    newPublicKeySpki: pair.publicKeySpki,
    rotatedAt,
    graceExpiresAt,
  })
}

let passed = 0
function run(name: string, body: () => void): void {
  try {
    body()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

run('1. initial machine key set is exact, bounded, public-only, and deeply frozen', () => {
  const value = initial()
  assert.equal(value.schemaVersion, CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION)
  assert.equal(value.contractVersion, CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION)
  assert.equal(value.tenantId, ids.tenant)
  assert.equal(value.machineId, ids.machine)
  assert.equal(value.setVersion, 1)
  assert.equal(value.activeKeyVersion, 1)
  assert.deepEqual(Object.keys(value), [
    'schemaVersion', 'contractVersion', 'tenantId', 'machineId', 'setVersion', 'activeKeyVersion', 'keys',
  ])
  assert.equal(value.keys.length, 1)
  assert.deepEqual(Object.keys(value.keys[0]), [
    'keyId', 'keyVersion', 'publicKeySpki', 'state', 'activatedAt', 'retireAt', 'revokedAt',
  ])
  assert.equal(value.keys[0].state, 'active')
  assert.equal(value.keys[0].retireAt, null)
  assert.equal(value.keys[0].revokedAt, null)
  assert.equal(value.keys[0].publicKeySpki.includes('='), false)
  assert.equal('privateKey' in value.keys[0], false)
  assert.ok(isDeepFrozen(value))
  assert.deepEqual(validateControlPlaneMachineKeySet(clone(value)), value)
})

run('2. exact validation rejects structural, ordering, duplicate, and state attacks', () => {
  const value = initial()
  for (const invalid of [
    { ...value, schemaVersion: 2 },
    { ...value, contractVersion: '2.0.0' },
    { ...value, tenantId: ids.tenantB.toUpperCase() },
    { ...value, machineId: '' },
    { ...value, setVersion: 0 },
    { ...value, activeKeyVersion: 2 },
    { ...value, keys: [] },
    { ...value, keys: Array.from({ length: CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS + 1 }, () => value.keys[0]) },
    { ...value, keys: [{ ...value.keys[0], keyId: '../machine-key' }] },
    { ...value, keys: [{ ...value.keys[0], publicKeySpki: 'bad+spki' }] },
    { ...value, keys: [{ ...value.keys[0], publicKeySpki: `${value.keys[0].publicKeySpki.slice(0, -1)}B` }] },
    { ...value, keys: [{ ...value.keys[0], state: 'unknown' }] },
    { ...value, keys: [{ ...value.keys[0], state: 'active', retireAt: times.grace }] },
    { ...value, keys: [{ ...value.keys[0], state: 'retiring', retireAt: null }] },
    { ...value, keys: [{ ...value.keys[0], state: 'revoked', revokedAt: null }] },
    { ...value, activeKeyVersion: null, keys: [{ ...value.keys[0], state: 'revoked', retireAt: times.grace, revokedAt: times.revoked }] },
    { ...value, keys: [{ ...value.keys[0], activatedAt: '2026-08-17T00:00:00Z' }] },
    { ...value, extra: true },
  ]) expectKeyError(() => validateControlPlaneMachineKeySet(invalid))

  const pair2 = createNodeEd25519KeyPair()
  const duplicateVersion = {
    ...value,
    keys: [value.keys[0], { ...value.keys[0], keyId: 'machine-key-2', publicKeySpki: pair2.publicKeySpki }],
  }
  expectKeyError(() => validateControlPlaneMachineKeySet(duplicateVersion))
  const duplicateId = {
    ...value,
    activeKeyVersion: 2,
    keys: [
      { ...value.keys[0], state: 'retiring', retireAt: times.grace },
      { ...value.keys[0], keyVersion: 2, publicKeySpki: pair2.publicKeySpki },
    ],
  }
  expectKeyError(() => validateControlPlaneMachineKeySet(duplicateId))
  const duplicatePublic = {
    ...value,
    activeKeyVersion: 2,
    keys: [
      { ...value.keys[0], state: 'retiring', retireAt: times.grace },
      { ...value.keys[0], keyId: 'machine-key-2', keyVersion: 2 },
    ],
  }
  expectKeyError(() => validateControlPlaneMachineKeySet(duplicatePublic))
  const reversed = {
    ...value,
    activeKeyVersion: 2,
    keys: [
      { ...value.keys[0], keyId: 'machine-key-2', keyVersion: 2, publicKeySpki: pair2.publicKeySpki },
      { ...value.keys[0], state: 'retiring', retireAt: times.grace },
    ],
  }
  expectKeyError(() => validateControlPlaneMachineKeySet(reversed))
  const activeNotHighest = {
    ...value,
    setVersion: 2,
    keys: [
      value.keys[0],
      {
        ...value.keys[0],
        keyId: 'machine-key-2',
        keyVersion: 2,
        publicKeySpki: pair2.publicKeySpki,
        state: 'retiring',
        retireAt: times.grace,
      },
    ],
  }
  expectKeyError(() => validateControlPlaneMachineKeySet(activeNotHighest))

  const hiddenKeys = [...value.keys]
  Object.defineProperty(hiddenKeys, 'hidden', { enumerable: false, value: true })
  expectKeyError(() => validateControlPlaneMachineKeySet({ ...value, keys: hiddenKeys }))

  expectKeyError(() => validateControlPlaneMachineKeySet(Object.assign(Object.create({ polluted: true }), value)))
  let accessorRead = false
  const accessor = { ...value } as Record<string, unknown>
  Object.defineProperty(accessor, 'keys', { enumerable: true, get: () => { accessorRead = true; return value.keys } })
  expectKeyError(() => validateControlPlaneMachineKeySet(accessor))
  assert.equal(accessorRead, false)
  const cyclic = { ...value } as Record<string, unknown>
  cyclic.keys = [cyclic]
  expectKeyError(() => validateControlPlaneMachineKeySet(cyclic))
  const hidden = { ...value }
  Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true })
  expectKeyError(() => validateControlPlaneMachineKeySet(hidden))
  expectKeyError(() => validateControlPlaneMachineKeySet({ ...value, [Symbol('hidden')]: true }))
})

run('3. rotation advances exactly one version and preserves one immutable grace window', () => {
  const before = initial()
  const after = rotate(before, 2)
  assert.equal(before.setVersion, 1)
  assert.equal(before.keys[0].state, 'active')
  assert.equal(after.setVersion, 2)
  assert.equal(after.activeKeyVersion, 2)
  assert.equal(after.keys.length, 2)
  assert.deepEqual(after.keys.map((key) => key.keyVersion), [1, 2])
  assert.equal(after.keys[0].state, 'retiring')
  assert.equal(after.keys[0].retireAt, times.grace)
  assert.equal(after.keys[1].state, 'active')
  assert.equal(after.keys[1].activatedAt, times.rotated)
  assert.equal(after.keys[1].retireAt, null)
  assert.ok(isDeepFrozen(after))

  const rotatedAgain = rotate(
    after,
    3,
    '2026-08-17T00:02:00.000Z',
    '2026-08-17T00:07:00.000Z',
  )
  assert.equal(rotatedAgain.keys[0].retireAt, times.grace, 'second rotation extended the first grace window')
  assert.equal(rotatedAgain.keys[1].state, 'retiring')
  assert.equal(rotatedAgain.keys[2].state, 'active')
})

run('4. rotation rejects stale authority, gaps, reuse, grace extension, and record overflow', () => {
  const value = initial()
  const pair = createNodeEd25519KeyPair()
  const base = {
    expectedSetVersion: value.setVersion,
    authenticatedKeyId: value.keys[0].keyId,
    authenticatedKeyVersion: value.keys[0].keyVersion,
    newKeyId: 'machine-key-2',
    newKeyVersion: 2,
    newPublicKeySpki: pair.publicKeySpki,
    rotatedAt: times.rotated,
    graceExpiresAt: times.grace,
  }
  for (const invalid of [
    { ...base, expectedSetVersion: 2 },
    { ...base, authenticatedKeyId: 'other-active-key' },
    { ...base, authenticatedKeyVersion: 2 },
    { ...base, newKeyId: value.keys[0].keyId },
    { ...base, newKeyVersion: 3 },
    { ...base, newPublicKeySpki: value.keys[0].publicKeySpki },
    { ...base, graceExpiresAt: times.rotated },
    { ...base, graceExpiresAt: '2026-08-17T00:06:00.001Z' },
    { ...base, rotatedAt: times.beforeActivated },
    { ...base, extra: true },
  ]) expectKeyError(() => rotateControlPlaneMachineKeySet(value, invalid))

  const once = rotate(value, 2)
  expectKeyError(() => rotateControlPlaneMachineKeySet(once, {
    ...base,
    expectedSetVersion: once.setVersion,
    authenticatedKeyId: once.keys[0].keyId,
    authenticatedKeyVersion: once.keys[0].keyVersion,
    newKeyId: 'machine-key-3',
    newKeyVersion: 3,
    newPublicKeySpki: createNodeEd25519KeyPair().publicKeySpki,
  }), 'ROTATION_DENIED')

  let full = value
  for (let version = 2; version <= CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS; version += 1) {
    const minute = String(version).padStart(2, '0')
    full = rotate(
      full,
      version,
      `2026-08-17T00:${minute}:00.000Z`,
      `2026-08-17T00:${String(version + 5).padStart(2, '0')}:00.000Z`,
    )
  }
  assert.equal(full.keys.length, CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS)
  expectKeyError(() => rotateControlPlaneMachineKeySet(full, {
    expectedSetVersion: full.setVersion,
    authenticatedKeyId: full.keys.at(-1)!.keyId,
    authenticatedKeyVersion: full.activeKeyVersion!,
    newKeyId: 'machine-key-overflow',
    newKeyVersion: full.activeKeyVersion! + 1,
    newPublicKeySpki: createNodeEd25519KeyPair().publicKeySpki,
    rotatedAt: '2026-08-17T00:20:00.000Z',
    graceExpiresAt: '2026-08-17T00:25:00.000Z',
  }), 'LIMIT_EXCEEDED')
  assert.equal(CONTROL_PLANE_MACHINE_KEY_MAX_ROTATION_GRACE_MS, 5 * 60 * 1000)
})

run('5. revocation is immediate, CAS-aware, idempotent, and never falls back', () => {
  const rotated = rotate(initial(), 2)
  const active = rotated.keys[1]
  const revokedActive = revokeControlPlaneMachineKeySet(rotated, {
    expectedSetVersion: rotated.setVersion,
    keyId: active.keyId,
    keyVersion: active.keyVersion,
    revokedAt: times.revoked,
  })
  assert.equal(revokedActive.setVersion, rotated.setVersion + 1)
  assert.equal(revokedActive.activeKeyVersion, null)
  assert.equal(revokedActive.keys[0].state, 'retiring')
  assert.equal(revokedActive.keys[1].state, 'revoked')
  assert.equal(revokedActive.keys[1].revokedAt, times.revoked)
  assert.equal(revokeControlPlaneMachineKeySet(revokedActive, {
    expectedSetVersion: revokedActive.setVersion,
    keyId: active.keyId,
    keyVersion: active.keyVersion,
    revokedAt: times.revoked,
  }), revokedActive, 'exact revocation replay is not idempotent')

  expectKeyError(() => revokeControlPlaneMachineKeySet(rotated, {
    expectedSetVersion: 999,
    keyId: active.keyId,
    keyVersion: active.keyVersion,
    revokedAt: times.revoked,
  }), 'VERSION_CONFLICT')
  expectKeyError(() => revokeControlPlaneMachineKeySet(revokedActive, {
    expectedSetVersion: revokedActive.setVersion,
    keyId: active.keyId,
    keyVersion: active.keyVersion,
    revokedAt: '2026-08-17T00:03:00.000Z',
  }), 'REVOCATION_CONFLICT')
  expectKeyError(() => revokeControlPlaneMachineKeySet(rotated, {
    expectedSetVersion: rotated.setVersion,
    keyId: active.keyId,
    keyVersion: active.keyVersion,
    revokedAt: times.beforeActivated,
  }))

  const revokedRetiring = revokeControlPlaneMachineKeySet(rotated, {
    expectedSetVersion: rotated.setVersion,
    keyId: rotated.keys[0].keyId,
    keyVersion: rotated.keys[0].keyVersion,
    revokedAt: times.revoked,
  })
  assert.equal(revokedRetiring.activeKeyVersion, 2)
  assert.equal(revokedRetiring.keys[0].state, 'revoked')
  assert.equal(revokedRetiring.keys[0].retireAt, null)
})

run('6. authorization distinguishes active, grace, rotation, revocation, and identity without fallback', () => {
  const first = initial()
  const active = authorizeControlPlaneMachineKey(first, {
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: first.keys[0].keyId,
    keyVersion: 1,
    usage: 'key_rotate',
    signedAt: times.activated,
    observedAt: times.activated,
  })
  assert.equal(active.authorized, true)
  if (active.authorized) assert.equal(active.key.state, 'active')

  for (const identityDrift of [
    { tenantId: ids.tenantB },
    { machineId: ids.machineB },
    { keyId: 'unknown-key' },
    { keyVersion: 2 },
  ]) {
    const denied = authorizeControlPlaneMachineKey(first, {
      tenantId: ids.tenant,
      machineId: ids.machine,
      keyId: first.keys[0].keyId,
      keyVersion: 1,
      usage: 'worker_request',
      signedAt: times.activated,
      observedAt: times.activated,
      ...identityDrift,
    })
    assert.deepEqual(denied, { authorized: false, auditCode: 'key_denied' })
  }
  assert.deepEqual(authorizeControlPlaneMachineKey(first, {
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: first.keys[0].keyId,
    keyVersion: 1,
    usage: 'worker_request',
    signedAt: times.beforeActivated,
    observedAt: times.activated,
  }), { authorized: false, auditCode: 'key_denied' })
  assert.deepEqual(authorizeControlPlaneMachineKey(first, {
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: first.keys[0].keyId,
    keyVersion: 1,
    usage: 'worker_request',
    signedAt: times.activated,
    observedAt: times.beforeActivated,
  }), { authorized: false, auditCode: 'key_denied' })

  const rotated = rotate(first, 2)
  const retiringBase = {
    tenantId: ids.tenant,
    machineId: ids.machine,
    keyId: rotated.keys[0].keyId,
    keyVersion: 1,
    signedAt: times.insideGrace,
    observedAt: times.insideGrace,
  } as const
  const grace = authorizeControlPlaneMachineKey(rotated, { ...retiringBase, usage: 'worker_request' })
  assert.equal(grace.authorized, true)
  assert.deepEqual(
    authorizeControlPlaneMachineKey(rotated, { ...retiringBase, usage: 'key_rotate' }),
    { authorized: false, auditCode: 'key_not_active' },
  )
  assert.deepEqual(
    authorizeControlPlaneMachineKey(rotated, { ...retiringBase, usage: 'worker_request', observedAt: times.afterGrace }),
    { authorized: false, auditCode: 'key_retired' },
  )

  const revoked = revokeControlPlaneMachineKeySet(rotated, {
    expectedSetVersion: rotated.setVersion,
    keyId: rotated.keys[0].keyId,
    keyVersion: 1,
    revokedAt: times.revoked,
  })
  assert.deepEqual(
    authorizeControlPlaneMachineKey(revoked, { ...retiringBase, usage: 'worker_request' }),
    { authorized: false, auditCode: 'key_revoked' },
  )
})

run('7. source boundary remains pure, public-named, and independent from request/runtime layers', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-machine-keys.ts'),
    'utf8',
  )
  assert.doesNotMatch(source, /from ['"]node:|process\.|fetch\(|supabase|filesystem|child_process|console\./)
  assert.doesNotMatch(source, /control-plane-worker-request-auth|tenant-attestation|privacy-policy|journal/i)
  assert.doesNotMatch(source, /privateKey|credential|hostname|email|providerToken/)
  assert.match(source, /ControlPlaneMachineKeySet/)
  assert.match(source, /activeKeyVersion/)
  assert.equal(CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION, 1)
  assert.equal(CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION, '1.0.0')
})

console.log(`P17-014 A3B machine key lifecycle: PASS (${passed} groups)`)
