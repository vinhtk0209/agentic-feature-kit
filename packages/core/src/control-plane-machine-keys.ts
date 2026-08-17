export const CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION = 1 as const
export const CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION = '1.0.0' as const
export const CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS = 8
export const CONTROL_PLANE_MACHINE_KEY_MAX_ROTATION_GRACE_MS = 5 * 60 * 1000

export const CONTROL_PLANE_MACHINE_KEY_STATES = ['active', 'retiring', 'revoked'] as const
export const CONTROL_PLANE_MACHINE_KEY_USAGES = ['worker_request', 'key_rotate'] as const

export type ControlPlaneMachineKeyState = (typeof CONTROL_PLANE_MACHINE_KEY_STATES)[number]
export type ControlPlaneMachineKeyUsage = (typeof CONTROL_PLANE_MACHINE_KEY_USAGES)[number]

export interface ControlPlaneMachineKeyRecord {
  readonly keyId: string
  readonly keyVersion: number
  readonly publicKeySpki: string
  readonly state: ControlPlaneMachineKeyState
  readonly activatedAt: string
  readonly retireAt: string | null
  readonly revokedAt: string | null
}

export interface ControlPlaneMachineKeySet {
  readonly schemaVersion: typeof CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION
  readonly tenantId: string
  readonly machineId: string
  readonly setVersion: number
  readonly activeKeyVersion: number | null
  readonly keys: readonly ControlPlaneMachineKeyRecord[]
}

export interface CreateControlPlaneMachineKeySetInput {
  readonly tenantId: string
  readonly machineId: string
  readonly keyId: string
  readonly publicKeySpki: string
  readonly activatedAt: string
}

export interface RotateControlPlaneMachineKeySetInput {
  readonly expectedSetVersion: number
  readonly authenticatedKeyId: string
  readonly authenticatedKeyVersion: number
  readonly newKeyId: string
  readonly newKeyVersion: number
  readonly newPublicKeySpki: string
  readonly rotatedAt: string
  readonly graceExpiresAt: string
}

export interface RevokeControlPlaneMachineKeySetInput {
  readonly expectedSetVersion: number
  readonly keyId: string
  readonly keyVersion: number
  readonly revokedAt: string
}

export interface AuthorizeControlPlaneMachineKeyInput {
  readonly tenantId: string
  readonly machineId: string
  readonly keyId: string
  readonly keyVersion: number
  readonly usage: ControlPlaneMachineKeyUsage
  readonly signedAt: string
  readonly observedAt: string
}

export type ControlPlaneMachineKeyAuthorization =
  | {
      readonly authorized: true
      readonly key: ControlPlaneMachineKeyRecord
      readonly keySetVersion: number
    }
  | {
      readonly authorized: false
      readonly auditCode: 'key_denied' | 'key_not_active' | 'key_retired' | 'key_revoked'
    }

export type ControlPlaneMachineKeyErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_IDENTITY'
  | 'INVALID_KEY'
  | 'INVALID_TIME'
  | 'INVALID_STATE'
  | 'DUPLICATE_KEY'
  | 'NON_CANONICAL_ORDER'
  | 'VERSION_CONFLICT'
  | 'ROTATION_DENIED'
  | 'REVOCATION_CONFLICT'
  | 'LIMIT_EXCEEDED'

export class ControlPlaneMachineKeyContractError extends Error {
  readonly code: ControlPlaneMachineKeyErrorCode

  constructor(code: ControlPlaneMachineKeyErrorCode, context: string) {
    super(`control plane machine keys: ${context}`)
    this.name = 'ControlPlaneMachineKeyContractError'
    this.code = code
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const BASE64URL = /^[A-Za-z0-9_-]{1,342}$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const STATES = new Set<string>(CONTROL_PLANE_MACHINE_KEY_STATES)
const USAGES = new Set<string>(CONTROL_PLANE_MACHINE_KEY_USAGES)
const SET_KEYS = [
  'schemaVersion',
  'contractVersion',
  'tenantId',
  'machineId',
  'setVersion',
  'activeKeyVersion',
  'keys',
] as const
const RECORD_KEYS = [
  'keyId',
  'keyVersion',
  'publicKeySpki',
  'state',
  'activatedAt',
  'retireAt',
  'revokedAt',
] as const
const CREATE_KEYS = ['tenantId', 'machineId', 'keyId', 'publicKeySpki', 'activatedAt'] as const
const ROTATE_KEYS = [
  'expectedSetVersion',
  'authenticatedKeyId',
  'authenticatedKeyVersion',
  'newKeyId',
  'newKeyVersion',
  'newPublicKeySpki',
  'rotatedAt',
  'graceExpiresAt',
] as const
const REVOKE_KEYS = ['expectedSetVersion', 'keyId', 'keyVersion', 'revokedAt'] as const
const AUTHORIZE_KEYS = [
  'tenantId',
  'machineId',
  'keyId',
  'keyVersion',
  'usage',
  'signedAt',
  'observedAt',
] as const

function fail(code: ControlPlaneMachineKeyErrorCode, context: string): never {
  throw new ControlPlaneMachineKeyContractError(code, context)
}

function assertPlainTree(value: unknown, context: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) fail('INVALID_SHAPE', context)
  seen.add(value)
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail('INVALID_SHAPE', context)
  } else if (Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) fail('INVALID_SHAPE', context)
    assertPlainTree(descriptor.value, context, seen)
  }
  seen.delete(value)
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  assertPlainTree(value, context)
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_SHAPE', context)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) fail('INVALID_SHAPE', context)
  const actual = (ownKeys as string[]).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('INVALID_SHAPE', context)
  }
}

function exactArray(value: readonly unknown[], context: string): void {
  const expected = ['length', ...value.map((_entry, index) => String(index))].sort()
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) fail('INVALID_SHAPE', context)
  const actual = (ownKeys as string[]).sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('INVALID_SHAPE', context)
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  }
  return value
}

function assertUuid(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_IDENTITY', context)
}

function assertOpaqueId(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) fail('INVALID_KEY', context)
}

function assertPublicKey(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !BASE64URL.test(value) || value.length % 4 === 1) fail('INVALID_KEY', context)
  const tail = value[value.length - 1]
  if (value.length % 4 === 2 && !/[AQgw]/.test(tail)) fail('INVALID_KEY', context)
  if (value.length % 4 === 3 && !/[AEIMQUYcgkosw048]/.test(tail)) fail('INVALID_KEY', context)
}

function assertPositiveVersion(value: unknown, context: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) {
    fail('INVALID_KEY', context)
  }
}

function assertCanonicalTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) fail('INVALID_TIME', context)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIME', context)
}

function validateRecord(value: unknown): ControlPlaneMachineKeyRecord {
  const record = asRecord(value, 'key record')
  exactKeys(record, RECORD_KEYS, 'key record')
  assertOpaqueId(record.keyId, 'key id')
  assertPositiveVersion(record.keyVersion, 'key version')
  assertPublicKey(record.publicKeySpki, 'public key')
  if (typeof record.state !== 'string' || !STATES.has(record.state)) fail('INVALID_STATE', 'key state')
  assertCanonicalTime(record.activatedAt, 'activation time')
  if (record.retireAt !== null) assertCanonicalTime(record.retireAt, 'retirement time')
  if (record.revokedAt !== null) assertCanonicalTime(record.revokedAt, 'revocation time')

  if (record.state === 'active' && (record.retireAt !== null || record.revokedAt !== null)) {
    fail('INVALID_STATE', 'active key state')
  }
  if (record.state === 'retiring' && (record.retireAt === null || record.revokedAt !== null)) {
    fail('INVALID_STATE', 'retiring key state')
  }
  if (record.state === 'revoked' && (record.retireAt !== null || record.revokedAt === null)) {
    fail('INVALID_STATE', 'revoked key state')
  }
  if (record.retireAt !== null && Date.parse(record.retireAt) <= Date.parse(record.activatedAt)) {
    fail('INVALID_TIME', 'retirement order')
  }
  if (record.revokedAt !== null && Date.parse(record.revokedAt) < Date.parse(record.activatedAt)) {
    fail('INVALID_TIME', 'revocation order')
  }

  return deepFreeze({
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    publicKeySpki: record.publicKeySpki,
    state: record.state as ControlPlaneMachineKeyState,
    activatedAt: record.activatedAt,
    retireAt: record.retireAt as string | null,
    revokedAt: record.revokedAt as string | null,
  })
}

export function validateControlPlaneMachineKeySet(value: unknown): ControlPlaneMachineKeySet {
  const record = asRecord(value, 'key set')
  exactKeys(record, SET_KEYS, 'key set')
  if (
    record.schemaVersion !== CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION
    || record.contractVersion !== CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION
  ) fail('UNSUPPORTED_VERSION', 'key set')
  assertUuid(record.tenantId, 'tenant identity')
  assertUuid(record.machineId, 'machine identity')
  assertPositiveVersion(record.setVersion, 'key-set version')
  const setVersion = record.setVersion
  if (record.activeKeyVersion !== null) assertPositiveVersion(record.activeKeyVersion, 'active key version')
  if (!Array.isArray(record.keys) || record.keys.length === 0) fail('INVALID_STATE', 'key records')
  if (record.keys.length > CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS) fail('LIMIT_EXCEEDED', 'key records')
  exactArray(record.keys, 'key records')

  const keys = record.keys.map(validateRecord)
  const ids = new Set<string>()
  const versions = new Set<number>()
  const publicKeys = new Set<string>()
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (index > 0 && keys[index - 1].keyVersion >= key.keyVersion) {
      fail('NON_CANONICAL_ORDER', 'key records')
    }
    if (ids.has(key.keyId) || versions.has(key.keyVersion) || publicKeys.has(key.publicKeySpki)) {
      fail('DUPLICATE_KEY', 'key records')
    }
    ids.add(key.keyId)
    versions.add(key.keyVersion)
    publicKeys.add(key.publicKeySpki)
  }

  const active = keys.filter((key) => key.state === 'active')
  if (record.activeKeyVersion === null) {
    if (active.length !== 0) fail('INVALID_STATE', 'active key')
  } else if (
    active.length !== 1
    || active[0].keyVersion !== record.activeKeyVersion
    || active[0].keyVersion !== keys[keys.length - 1].keyVersion
  ) {
    fail('INVALID_STATE', 'active key')
  }
  if (keys.some((key) => key.keyVersion > setVersion)) fail('INVALID_STATE', 'key-set version')

  return deepFreeze({
    schemaVersion: CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION,
    tenantId: record.tenantId,
    machineId: record.machineId,
    setVersion,
    activeKeyVersion: record.activeKeyVersion as number | null,
    keys,
  })
}

export function createControlPlaneMachineKeySet(input: CreateControlPlaneMachineKeySetInput): ControlPlaneMachineKeySet {
  const record = asRecord(input, 'create input')
  exactKeys(record, CREATE_KEYS, 'create input')
  assertUuid(record.tenantId, 'tenant identity')
  assertUuid(record.machineId, 'machine identity')
  assertOpaqueId(record.keyId, 'key id')
  assertPublicKey(record.publicKeySpki, 'public key')
  assertCanonicalTime(record.activatedAt, 'activation time')
  return validateControlPlaneMachineKeySet({
    schemaVersion: CONTROL_PLANE_MACHINE_KEY_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_MACHINE_KEY_CONTRACT_VERSION,
    tenantId: record.tenantId,
    machineId: record.machineId,
    setVersion: 1,
    activeKeyVersion: 1,
    keys: [{
      keyId: record.keyId,
      keyVersion: 1,
      publicKeySpki: record.publicKeySpki,
      state: 'active',
      activatedAt: record.activatedAt,
      retireAt: null,
      revokedAt: null,
    }],
  })
}

export function rotateControlPlaneMachineKeySet(
  current: ControlPlaneMachineKeySet,
  input: RotateControlPlaneMachineKeySetInput,
): ControlPlaneMachineKeySet {
  const keySet = validateControlPlaneMachineKeySet(current)
  const record = asRecord(input, 'rotation input')
  exactKeys(record, ROTATE_KEYS, 'rotation input')
  assertPositiveVersion(record.expectedSetVersion, 'expected key-set version')
  assertOpaqueId(record.authenticatedKeyId, 'authenticated key id')
  assertPositiveVersion(record.authenticatedKeyVersion, 'authenticated key version')
  assertOpaqueId(record.newKeyId, 'new key id')
  assertPositiveVersion(record.newKeyVersion, 'new key version')
  assertPublicKey(record.newPublicKeySpki, 'new public key')
  assertCanonicalTime(record.rotatedAt, 'rotation time')
  assertCanonicalTime(record.graceExpiresAt, 'grace expiry')

  if (record.expectedSetVersion !== keySet.setVersion) fail('VERSION_CONFLICT', 'rotation version')
  const active = keySet.keys.find((key) => key.keyVersion === keySet.activeKeyVersion)
  if (
    !active
    || active.state !== 'active'
    || active.keyId !== record.authenticatedKeyId
    || active.keyVersion !== record.authenticatedKeyVersion
  ) fail('ROTATION_DENIED', 'rotation authority')
  if (keySet.keys.length >= CONTROL_PLANE_MACHINE_KEY_MAX_RECORDS) fail('LIMIT_EXCEEDED', 'key records')
  if (record.newKeyVersion !== keySet.keys[keySet.keys.length - 1].keyVersion + 1) {
    fail('ROTATION_DENIED', 'new key version')
  }
  if (
    keySet.keys.some((key) => (
      key.keyId === record.newKeyId
      || key.keyVersion === record.newKeyVersion
      || key.publicKeySpki === record.newPublicKeySpki
    ))
  ) fail('ROTATION_DENIED', 'new key uniqueness')

  const rotatedAtMs = Date.parse(record.rotatedAt)
  const graceExpiresAtMs = Date.parse(record.graceExpiresAt)
  if (rotatedAtMs < Date.parse(active.activatedAt)) fail('INVALID_TIME', 'rotation order')
  if (
    graceExpiresAtMs <= rotatedAtMs
    || graceExpiresAtMs - rotatedAtMs > CONTROL_PLANE_MACHINE_KEY_MAX_ROTATION_GRACE_MS
  ) fail('ROTATION_DENIED', 'rotation grace')

  const keys = keySet.keys.map((key) => key.keyVersion === active.keyVersion
    ? { ...key, state: 'retiring' as const, retireAt: record.graceExpiresAt }
    : key)
  keys.push({
    keyId: record.newKeyId,
    keyVersion: record.newKeyVersion,
    publicKeySpki: record.newPublicKeySpki,
    state: 'active',
    activatedAt: record.rotatedAt,
    retireAt: null,
    revokedAt: null,
  })
  return validateControlPlaneMachineKeySet({
    ...keySet,
    setVersion: keySet.setVersion + 1,
    activeKeyVersion: record.newKeyVersion,
    keys,
  })
}

export function revokeControlPlaneMachineKeySet(
  current: ControlPlaneMachineKeySet,
  input: RevokeControlPlaneMachineKeySetInput,
): ControlPlaneMachineKeySet {
  const keySet = validateControlPlaneMachineKeySet(current)
  const record = asRecord(input, 'revocation input')
  exactKeys(record, REVOKE_KEYS, 'revocation input')
  assertPositiveVersion(record.expectedSetVersion, 'expected key-set version')
  assertOpaqueId(record.keyId, 'key id')
  assertPositiveVersion(record.keyVersion, 'key version')
  assertCanonicalTime(record.revokedAt, 'revocation time')
  if (record.expectedSetVersion !== keySet.setVersion) fail('VERSION_CONFLICT', 'revocation version')

  const target = keySet.keys.find((key) => key.keyId === record.keyId && key.keyVersion === record.keyVersion)
  if (!target) fail('INVALID_KEY', 'revocation target')
  if (target.state === 'revoked') {
    if (target.revokedAt !== record.revokedAt) fail('REVOCATION_CONFLICT', 'revocation replay')
    return Object.isFrozen(current) ? current : keySet
  }
  if (Date.parse(record.revokedAt) < Date.parse(target.activatedAt)) fail('INVALID_TIME', 'revocation order')

  const keys = keySet.keys.map((key) => key.keyVersion === target.keyVersion
    ? { ...key, state: 'revoked' as const, retireAt: null, revokedAt: record.revokedAt }
    : key)
  return validateControlPlaneMachineKeySet({
    ...keySet,
    setVersion: keySet.setVersion + 1,
    activeKeyVersion: keySet.activeKeyVersion === target.keyVersion ? null : keySet.activeKeyVersion,
    keys,
  })
}

export function authorizeControlPlaneMachineKey(
  current: ControlPlaneMachineKeySet,
  input: AuthorizeControlPlaneMachineKeyInput,
): ControlPlaneMachineKeyAuthorization {
  const keySet = validateControlPlaneMachineKeySet(current)
  const record = asRecord(input, 'authorization input')
  exactKeys(record, AUTHORIZE_KEYS, 'authorization input')
  assertUuid(record.tenantId, 'tenant identity')
  assertUuid(record.machineId, 'machine identity')
  assertOpaqueId(record.keyId, 'key id')
  assertPositiveVersion(record.keyVersion, 'key version')
  if (typeof record.usage !== 'string' || !USAGES.has(record.usage)) fail('INVALID_STATE', 'key usage')
  assertCanonicalTime(record.signedAt, 'signed time')
  assertCanonicalTime(record.observedAt, 'observed time')

  if (record.tenantId !== keySet.tenantId || record.machineId !== keySet.machineId) {
    return deepFreeze({ authorized: false, auditCode: 'key_denied' })
  }
  const key = keySet.keys.find((candidate) => (
    candidate.keyId === record.keyId && candidate.keyVersion === record.keyVersion
  ))
  if (
    !key
    || Date.parse(record.signedAt) < Date.parse(key.activatedAt)
    || Date.parse(record.observedAt) < Date.parse(key.activatedAt)
  ) {
    return deepFreeze({ authorized: false, auditCode: 'key_denied' })
  }
  if (key.state === 'revoked') return deepFreeze({ authorized: false, auditCode: 'key_revoked' })
  if (key.state === 'retiring') {
    if (record.usage === 'key_rotate') return deepFreeze({ authorized: false, auditCode: 'key_not_active' })
    if (
      key.retireAt === null
      || Date.parse(record.signedAt) > Date.parse(key.retireAt)
      || Date.parse(record.observedAt) > Date.parse(key.retireAt)
    ) return deepFreeze({ authorized: false, auditCode: 'key_retired' })
  }
  return deepFreeze({ authorized: true, key, keySetVersion: keySet.setVersion })
}
