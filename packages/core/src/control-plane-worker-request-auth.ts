import type { ControlPlaneHashPort } from './control-plane'
import {
  authorizeControlPlaneMachineKey,
  validateControlPlaneMachineKeySet,
  type ControlPlaneMachineKeySet,
} from './control-plane-machine-keys'
import type {
  ControlPlaneDetachedSignerPort,
  ControlPlaneDetachedVerifierPort,
} from './control-plane-signing'

export const CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION = 1 as const
export const CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION = '1.0.0' as const
export const CONTROL_PLANE_WORKER_REQUEST_ALGORITHM = 'Ed25519' as const
export const CONTROL_PLANE_WORKER_REQUEST_MAX_BODY_BYTES = 64 * 1024
export const CONTROL_PLANE_WORKER_REQUEST_MAX_AGE_MS = 60 * 1000
export const CONTROL_PLANE_WORKER_REQUEST_FUTURE_SKEW_MS = 30 * 1000

export const CONTROL_PLANE_WORKER_REQUEST_KINDS = [
  'claim',
  'heartbeat',
  'events',
  'complete',
  'key_rotate',
] as const

export type ControlPlaneWorkerRequestKind = (typeof CONTROL_PLANE_WORKER_REQUEST_KINDS)[number]

export interface ControlPlaneWorkerRequestSignatureInput {
  readonly requestKind: ControlPlaneWorkerRequestKind
  readonly leaseId: string | null
  readonly tenantId: string
  readonly machineId: string
  readonly keyId: string
  readonly keyVersion: number
  readonly signedAt: string
  readonly nonce: string
}

export interface ControlPlaneWorkerRequestSignature {
  readonly schemaVersion: typeof CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION
  readonly algorithm: typeof CONTROL_PLANE_WORKER_REQUEST_ALGORITHM
  readonly requestKind: ControlPlaneWorkerRequestKind
  readonly method: 'POST'
  readonly canonicalPath: string
  readonly tenantId: string
  readonly machineId: string
  readonly keyId: string
  readonly keyVersion: number
  readonly signedAt: string
  readonly nonce: string
  readonly bodyHash: string
  readonly signature: string
}

export interface ControlPlaneWorkerRequestClockPort {
  readonly now: () => string
}

export interface ControlPlaneMachineKeySetPort {
  readonly resolve: (input: {
    readonly tenantId: string
    readonly machineId: string
  }) => Promise<unknown>
}

export interface ControlPlaneWorkerRequestVerifierFactoryPort {
  readonly create: (publicKeySpki: string) => ControlPlaneDetachedVerifierPort
}

export interface ControlPlaneWorkerRequestNonceCommitInput {
  readonly tenantId: string
  readonly machineId: string
  readonly keyId: string
  readonly keyVersion: number
  readonly requestKind: ControlPlaneWorkerRequestKind
  readonly expectedKeySetVersion: number
  readonly nonceHash: string
  readonly signedAt: string
  readonly observedAt: string
  readonly expiresAt: string
}

export type ControlPlaneWorkerRequestNonceCommitOutcome = 'accepted' | 'replayed' | 'key_changed' | 'denied'

export interface ControlPlaneWorkerRequestNoncePort {
  readonly consumeAuthorized: (
    input: ControlPlaneWorkerRequestNonceCommitInput,
  ) => Promise<ControlPlaneWorkerRequestNonceCommitOutcome>
}

export interface ControlPlaneWorkerRequestDependencies {
  readonly clock: ControlPlaneWorkerRequestClockPort
  readonly keySets: ControlPlaneMachineKeySetPort
  readonly verifierFactory: ControlPlaneWorkerRequestVerifierFactoryPort
  readonly nonces: ControlPlaneWorkerRequestNoncePort
  readonly hashPort: ControlPlaneHashPort
}

export interface AuthenticateControlPlaneWorkerRequestInput {
  readonly signature: unknown
  readonly expectedRequestKind: ControlPlaneWorkerRequestKind
  readonly expectedLeaseId: string | null
  readonly canonicalBody: string
}

export type ControlPlaneWorkerRequestAuthenticationResult =
  | {
      readonly ok: true
      readonly request: ControlPlaneWorkerRequestSignature
      readonly keySetVersion: number
      readonly observedAt: string
    }
  | {
      readonly ok: false
      readonly reasonCode: 'worker_request_denied'
      readonly auditCode:
        | 'request_invalid'
        | 'request_stale'
        | 'key_denied'
        | 'signature_invalid'
        | 'nonce_replayed'
        | 'key_changed'
    }
  | {
      readonly ok: false
      readonly reasonCode: 'worker_request_unavailable'
      readonly auditCode: 'dependency_unavailable'
    }

export type ControlPlaneWorkerRequestErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_IDENTITY'
  | 'INVALID_REQUEST'
  | 'INVALID_TIME'
  | 'INVALID_NONCE'
  | 'INVALID_HASH'
  | 'INVALID_SIGNATURE'
  | 'BODY_TOO_LARGE'
  | 'HASH_UNAVAILABLE'
  | 'SIGNER_UNAVAILABLE'

export class ControlPlaneWorkerRequestContractError extends Error {
  readonly code: ControlPlaneWorkerRequestErrorCode

  constructor(code: ControlPlaneWorkerRequestErrorCode, context: string) {
    super(`control plane worker request: ${context}`)
    this.name = 'ControlPlaneWorkerRequestContractError'
    this.code = code
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const HASH = /^[0-9a-f]{64}$/
const NONCE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/
const ED25519_SIGNATURE = /^[A-Za-z0-9_-]{85}[AQgw]$/
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const SIGNING_DOMAIN = 'claude-workflow-kit.control-plane.worker-request-signature.v1'
const NONCE_DOMAIN = 'claude-workflow-kit.control-plane.worker-request-nonce.v1'
const REQUEST_KINDS = new Set<string>(CONTROL_PLANE_WORKER_REQUEST_KINDS)
const LEASE_KINDS = new Set<ControlPlaneWorkerRequestKind>(['heartbeat', 'events', 'complete'])
const INPUT_KEYS = [
  'requestKind',
  'leaseId',
  'tenantId',
  'machineId',
  'keyId',
  'keyVersion',
  'signedAt',
  'nonce',
] as const
const SIGNATURE_KEYS = [
  'schemaVersion',
  'contractVersion',
  'algorithm',
  'requestKind',
  'method',
  'canonicalPath',
  'tenantId',
  'machineId',
  'keyId',
  'keyVersion',
  'signedAt',
  'nonce',
  'bodyHash',
  'signature',
] as const
const AUTH_INPUT_KEYS = ['signature', 'expectedRequestKind', 'expectedLeaseId', 'canonicalBody'] as const
const NONCE_OUTCOMES = new Set<string>(['accepted', 'replayed', 'key_changed', 'denied'])

function fail(code: ControlPlaneWorkerRequestErrorCode, context: string): never {
  throw new ControlPlaneWorkerRequestContractError(code, context)
}

function assertPlainTree(value: unknown, context: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) fail('INVALID_SHAPE', context)
  seen.add(value)
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) fail('INVALID_SHAPE', context)
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
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) fail('INVALID_IDENTITY', context)
}

function assertPositiveVersion(value: unknown, context: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) {
    fail('INVALID_IDENTITY', context)
  }
}

function assertCanonicalTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) fail('INVALID_TIME', context)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIME', context)
}

function assertRequestKind(value: unknown): asserts value is ControlPlaneWorkerRequestKind {
  if (typeof value !== 'string' || !REQUEST_KINDS.has(value)) fail('INVALID_REQUEST', 'request kind')
}

function assertNonce(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !NONCE.test(value) || /^A+$/.test(value)) fail('INVALID_NONCE', 'nonce')
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) bytes += 1
    else if (code <= 0x7ff) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1)
      if (low < 0xdc00 || low > 0xdfff) fail('INVALID_REQUEST', 'body encoding')
      bytes += 4
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('INVALID_REQUEST', 'body encoding')
    else bytes += 3
  }
  return bytes
}

function assertBody(value: unknown): asserts value is string {
  if (typeof value !== 'string') fail('INVALID_REQUEST', 'body')
  if (utf8ByteLength(value) > CONTROL_PLANE_WORKER_REQUEST_MAX_BODY_BYTES) fail('BODY_TOO_LARGE', 'body')
}

function hashText(port: ControlPlaneHashPort, value: string, context: string): string {
  let known: unknown
  let result: unknown
  try {
    known = port.sha256('')
    result = port.sha256(value)
  } catch {
    fail('HASH_UNAVAILABLE', context)
  }
  if (known !== EMPTY_SHA256 || typeof result !== 'string' || !HASH.test(result)) {
    fail('HASH_UNAVAILABLE', context)
  }
  return result
}

function canonicalPath(requestKind: ControlPlaneWorkerRequestKind, leaseId: unknown): string {
  if (requestKind === 'claim') {
    if (leaseId !== null) fail('INVALID_REQUEST', 'claim path')
    return '/api/control-plane/v1/worker/leases/claim'
  }
  if (requestKind === 'key_rotate') {
    if (leaseId !== null) fail('INVALID_REQUEST', 'key rotation path')
    return '/api/control-plane/v1/worker/keys/rotate'
  }
  assertUuid(leaseId, 'lease identity')
  return `/api/control-plane/v1/worker/leases/${leaseId}/${requestKind}`
}

function validateCanonicalPath(requestKind: ControlPlaneWorkerRequestKind, value: unknown): string {
  if (typeof value !== 'string') fail('INVALID_REQUEST', 'canonical path')
  if (requestKind === 'claim' || requestKind === 'key_rotate') {
    if (value !== canonicalPath(requestKind, null)) fail('INVALID_REQUEST', 'canonical path')
    return value
  }
  const match = value.match(/^\/api\/control-plane\/v1\/worker\/leases\/([^/]+)\/(heartbeat|events|complete)$/)
  if (!match || match[2] !== requestKind || !UUID.test(match[1])) fail('INVALID_REQUEST', 'canonical path')
  if (value !== canonicalPath(requestKind, match[1])) fail('INVALID_REQUEST', 'canonical path')
  return value
}

function signingBytes(value: Omit<ControlPlaneWorkerRequestSignature, 'signature'>): string {
  return JSON.stringify({
    domain: SIGNING_DOMAIN,
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    algorithm: value.algorithm,
    requestKind: value.requestKind,
    method: value.method,
    canonicalPath: value.canonicalPath,
    tenantId: value.tenantId,
    machineId: value.machineId,
    keyId: value.keyId,
    keyVersion: value.keyVersion,
    signedAt: value.signedAt,
    nonce: value.nonce,
    bodyHash: value.bodyHash,
  })
}

function nonceHashBytes(value: ControlPlaneWorkerRequestSignature): string {
  return JSON.stringify({
    domain: NONCE_DOMAIN,
    tenantId: value.tenantId,
    machineId: value.machineId,
    keyId: value.keyId,
    keyVersion: value.keyVersion,
    nonce: value.nonce,
  })
}

function unavailable(): ControlPlaneWorkerRequestAuthenticationResult {
  return deepFreeze({
    ok: false,
    reasonCode: 'worker_request_unavailable',
    auditCode: 'dependency_unavailable',
  })
}

function denied(
  auditCode: Extract<ControlPlaneWorkerRequestAuthenticationResult, { reasonCode: 'worker_request_denied' }>['auditCode'],
): ControlPlaneWorkerRequestAuthenticationResult {
  return deepFreeze({ ok: false, reasonCode: 'worker_request_denied', auditCode })
}

export function validateControlPlaneWorkerRequestSignature(value: unknown): ControlPlaneWorkerRequestSignature {
  const record = asRecord(value, 'signature wrapper')
  exactKeys(record, SIGNATURE_KEYS, 'signature wrapper')
  if (
    record.schemaVersion !== CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION
    || record.contractVersion !== CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION
    || record.algorithm !== CONTROL_PLANE_WORKER_REQUEST_ALGORITHM
  ) fail('UNSUPPORTED_VERSION', 'signature wrapper')
  assertRequestKind(record.requestKind)
  if (record.method !== 'POST') fail('INVALID_REQUEST', 'request method')
  const path = validateCanonicalPath(record.requestKind, record.canonicalPath)
  assertUuid(record.tenantId, 'tenant identity')
  assertUuid(record.machineId, 'machine identity')
  assertOpaqueId(record.keyId, 'key identity')
  assertPositiveVersion(record.keyVersion, 'key version')
  assertCanonicalTime(record.signedAt, 'signed time')
  assertNonce(record.nonce)
  if (typeof record.bodyHash !== 'string' || !HASH.test(record.bodyHash)) fail('INVALID_HASH', 'body hash')
  if (typeof record.signature !== 'string' || !ED25519_SIGNATURE.test(record.signature)) {
    fail('INVALID_SIGNATURE', 'signature')
  }
  return deepFreeze({
    schemaVersion: CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION,
    algorithm: CONTROL_PLANE_WORKER_REQUEST_ALGORITHM,
    requestKind: record.requestKind,
    method: 'POST',
    canonicalPath: path,
    tenantId: record.tenantId,
    machineId: record.machineId,
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    signedAt: record.signedAt,
    nonce: record.nonce,
    bodyHash: record.bodyHash,
    signature: record.signature,
  })
}

export function serializeControlPlaneWorkerRequestSignatureBytes(value: unknown): string {
  const validated = validateControlPlaneWorkerRequestSignature(value)
  const { signature: _signature, ...unsigned } = validated
  return signingBytes(unsigned)
}

export function createControlPlaneWorkerRequestSignature(
  input: ControlPlaneWorkerRequestSignatureInput,
  canonicalBody: string,
  hashPort: ControlPlaneHashPort,
  signer: ControlPlaneDetachedSignerPort,
): ControlPlaneWorkerRequestSignature {
  const record = asRecord(input, 'signature input')
  exactKeys(record, INPUT_KEYS, 'signature input')
  assertRequestKind(record.requestKind)
  const path = canonicalPath(record.requestKind, record.leaseId)
  assertUuid(record.tenantId, 'tenant identity')
  assertUuid(record.machineId, 'machine identity')
  assertOpaqueId(record.keyId, 'key identity')
  assertPositiveVersion(record.keyVersion, 'key version')
  assertCanonicalTime(record.signedAt, 'signed time')
  assertNonce(record.nonce)
  assertBody(canonicalBody)
  const unsigned = deepFreeze({
    schemaVersion: CONTROL_PLANE_WORKER_REQUEST_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_WORKER_REQUEST_CONTRACT_VERSION,
    algorithm: CONTROL_PLANE_WORKER_REQUEST_ALGORITHM,
    requestKind: record.requestKind,
    method: 'POST' as const,
    canonicalPath: path,
    tenantId: record.tenantId,
    machineId: record.machineId,
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    signedAt: record.signedAt,
    nonce: record.nonce,
    bodyHash: hashText(hashPort, canonicalBody, 'body hash'),
  })
  let signature: unknown
  try {
    signature = signer.sign(signingBytes(unsigned))
  } catch {
    fail('SIGNER_UNAVAILABLE', 'signer')
  }
  if (typeof signature !== 'string' || !ED25519_SIGNATURE.test(signature)) fail('SIGNER_UNAVAILABLE', 'signer')
  return validateControlPlaneWorkerRequestSignature({ ...unsigned, signature })
}

export async function authenticateControlPlaneWorkerRequest(
  input: AuthenticateControlPlaneWorkerRequestInput,
  dependencies: ControlPlaneWorkerRequestDependencies,
): Promise<ControlPlaneWorkerRequestAuthenticationResult> {
  let authInput: Record<string, unknown>
  let request: ControlPlaneWorkerRequestSignature
  try {
    authInput = asRecord(input, 'authentication input')
    exactKeys(authInput, AUTH_INPUT_KEYS, 'authentication input')
    assertRequestKind(authInput.expectedRequestKind)
    assertBody(authInput.canonicalBody)
    const expectedPath = canonicalPath(authInput.expectedRequestKind, authInput.expectedLeaseId)
    request = validateControlPlaneWorkerRequestSignature(authInput.signature)
    if (request.requestKind !== authInput.expectedRequestKind || request.canonicalPath !== expectedPath) {
      return denied('request_invalid')
    }
  } catch (error) {
    if (error instanceof ControlPlaneWorkerRequestContractError && error.code === 'HASH_UNAVAILABLE') {
      return unavailable()
    }
    return denied('request_invalid')
  }

  let bodyHash: string
  try {
    bodyHash = hashText(dependencies.hashPort, authInput.canonicalBody as string, 'body hash')
  } catch {
    return unavailable()
  }
  if (bodyHash !== request.bodyHash) return denied('signature_invalid')

  let observedAt: string
  try {
    observedAt = dependencies.clock.now()
    assertCanonicalTime(observedAt, 'observed time')
  } catch {
    return unavailable()
  }
  const observedMs = Date.parse(observedAt)
  const signedMs = Date.parse(request.signedAt)
  if (
    observedMs - signedMs > CONTROL_PLANE_WORKER_REQUEST_MAX_AGE_MS
    || signedMs - observedMs > CONTROL_PLANE_WORKER_REQUEST_FUTURE_SKEW_MS
  ) return denied('request_stale')

  let keySet: ControlPlaneMachineKeySet
  try {
    keySet = validateControlPlaneMachineKeySet(await dependencies.keySets.resolve(deepFreeze({
      tenantId: request.tenantId,
      machineId: request.machineId,
    })))
  } catch {
    return unavailable()
  }
  const authorization = authorizeControlPlaneMachineKey(keySet, {
    tenantId: request.tenantId,
    machineId: request.machineId,
    keyId: request.keyId,
    keyVersion: request.keyVersion,
    usage: request.requestKind === 'key_rotate' ? 'key_rotate' : 'worker_request',
    signedAt: request.signedAt,
    observedAt,
  })
  if (!authorization.authorized) return denied('key_denied')

  let verified: boolean
  try {
    const verifier = dependencies.verifierFactory.create(authorization.key.publicKeySpki)
    verified = verifier.verify(serializeControlPlaneWorkerRequestSignatureBytes(request), request.signature)
  } catch {
    return unavailable()
  }
  if (!verified) return denied('signature_invalid')

  let nonceHash: string
  try {
    nonceHash = hashText(dependencies.hashPort, nonceHashBytes(request), 'nonce hash')
  } catch {
    return unavailable()
  }
  const commitInput = deepFreeze({
    tenantId: request.tenantId,
    machineId: request.machineId,
    keyId: request.keyId,
    keyVersion: request.keyVersion,
    requestKind: request.requestKind,
    expectedKeySetVersion: authorization.keySetVersion,
    nonceHash,
    signedAt: request.signedAt,
    observedAt,
    expiresAt: new Date(signedMs + CONTROL_PLANE_WORKER_REQUEST_MAX_AGE_MS).toISOString(),
  })
  let outcome: unknown
  try {
    outcome = await dependencies.nonces.consumeAuthorized(commitInput)
  } catch {
    return unavailable()
  }
  if (typeof outcome !== 'string' || !NONCE_OUTCOMES.has(outcome)) return unavailable()
  if (outcome === 'replayed') return denied('nonce_replayed')
  if (outcome === 'key_changed') return denied('key_changed')
  if (outcome === 'denied') return denied('key_denied')
  return deepFreeze({
    ok: true,
    request,
    keySetVersion: authorization.keySetVersion,
    observedAt,
  })
}
