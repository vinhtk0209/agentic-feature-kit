import {
  serializeControlPlaneExecutionEnvelope,
  validateControlPlaneExecutionEnvelope,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
} from './control-plane'
import {
  serializeControlPlaneExecutionReceipt,
  validateControlPlaneExecutionReceipt,
  type ControlPlaneExecutionReceipt,
} from './control-plane-state'

export const CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION = 1 as const
export const CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION = '1.0.0' as const
export const CONTROL_PLANE_SIGNATURE_ALGORITHM = 'Ed25519' as const

export const CONTROL_PLANE_SIGNED_PAYLOAD_KINDS = ['execution_envelope', 'execution_receipt'] as const
export const CONTROL_PLANE_SIGNER_KINDS = ['control_plane', 'worker_machine'] as const

export type ControlPlaneSignedPayloadKind = (typeof CONTROL_PLANE_SIGNED_PAYLOAD_KINDS)[number]
export type ControlPlaneSignerKind = (typeof CONTROL_PLANE_SIGNER_KINDS)[number]

export interface ControlPlaneSignatureMetadataInput {
  readonly signerId: string
  readonly keyId: string
  readonly keyVersion: number
  readonly signedAt: string
}

export interface ControlPlaneDetachedSignature extends ControlPlaneSignatureMetadataInput {
  readonly schemaVersion: typeof CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION
  readonly algorithm: typeof CONTROL_PLANE_SIGNATURE_ALGORITHM
  readonly payloadKind: ControlPlaneSignedPayloadKind
  readonly signerKind: ControlPlaneSignerKind
  readonly tenantId: string
  readonly payloadHash: string
  readonly signature: string
}

export interface ControlPlaneDetachedSignerPort {
  readonly sign: (canonicalBytes: string) => string
}

export interface ControlPlaneDetachedVerifierPort {
  readonly verify: (canonicalBytes: string, signature: string) => boolean
}

export interface ControlPlaneVerifiedEnvelopeSignature {
  readonly payload: ControlPlaneExecutionEnvelope
  readonly signature: ControlPlaneDetachedSignature
}

export interface ControlPlaneVerifiedReceiptSignature {
  readonly payload: ControlPlaneExecutionReceipt
  readonly signature: ControlPlaneDetachedSignature
}

export type ControlPlaneSigningErrorCode =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_METADATA'
  | 'INVALID_TIME'
  | 'INVALID_HASH'
  | 'INVALID_SIGNATURE'
  | 'INVALID_KEY'
  | 'HASH_UNAVAILABLE'
  | 'SIGNER_UNAVAILABLE'
  | 'VERIFIER_UNAVAILABLE'

export class ControlPlaneSigningContractError extends Error {
  readonly code: ControlPlaneSigningErrorCode

  constructor(code: ControlPlaneSigningErrorCode, context: string) {
    super(`control plane signing: ${context}`)
    this.name = 'ControlPlaneSigningContractError'
    this.code = code
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const HASH = /^[0-9a-f]{64}$/
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const ED25519_SIGNATURE = /^[A-Za-z0-9_-]{85}[AQgw]$/
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const PAYLOAD_KINDS = new Set<string>(CONTROL_PLANE_SIGNED_PAYLOAD_KINDS)
const SIGNER_KINDS = new Set<string>(CONTROL_PLANE_SIGNER_KINDS)
const METADATA_KEYS = ['signerId', 'keyId', 'keyVersion', 'signedAt'] as const
const SIGNATURE_KEYS = [
  'schemaVersion',
  'contractVersion',
  'algorithm',
  'payloadKind',
  'signerKind',
  'tenantId',
  ...METADATA_KEYS,
  'payloadHash',
  'signature',
] as const

function fail(code: ControlPlaneSigningErrorCode, context: string): never {
  throw new ControlPlaneSigningContractError(code, context)
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

function assertOpaqueId(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) fail('INVALID_METADATA', context)
}

function assertCanonicalTime(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) fail('INVALID_TIME', context)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('INVALID_TIME', context)
}

function assertPositiveVersion(value: unknown, context: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) {
    fail('INVALID_METADATA', context)
  }
}

function validateMetadata(value: unknown): ControlPlaneSignatureMetadataInput {
  const record = asRecord(value, 'signature metadata')
  exactKeys(record, METADATA_KEYS, 'signature metadata')
  assertOpaqueId(record.signerId, 'signature signer')
  assertOpaqueId(record.keyId, 'signature key')
  assertPositiveVersion(record.keyVersion, 'signature key version')
  assertCanonicalTime(record.signedAt, 'signature time')
  return deepFreeze({
    signerId: record.signerId,
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    signedAt: record.signedAt,
  })
}

function hashPayload(port: ControlPlaneHashPort, canonicalPayload: string): string {
  let known: unknown
  let result: unknown
  try {
    known = port.sha256('')
    result = port.sha256(canonicalPayload)
  } catch {
    fail('HASH_UNAVAILABLE', 'payload hash')
  }
  if (known !== EMPTY_SHA256 || typeof result !== 'string' || !HASH.test(result)) {
    fail('HASH_UNAVAILABLE', 'payload hash')
  }
  return result
}

function signatureDomain(payloadKind: ControlPlaneSignedPayloadKind): string {
  return payloadKind === 'execution_envelope'
    ? 'claude-workflow-kit.control-plane.execution-envelope-signature.v1'
    : 'claude-workflow-kit.control-plane.execution-receipt-signature.v1'
}

function canonicalSigningBytes(value: Omit<ControlPlaneDetachedSignature, 'signature'>): string {
  return JSON.stringify({
    domain: signatureDomain(value.payloadKind),
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    algorithm: value.algorithm,
    payloadKind: value.payloadKind,
    signerKind: value.signerKind,
    tenantId: value.tenantId,
    signerId: value.signerId,
    keyId: value.keyId,
    keyVersion: value.keyVersion,
    signedAt: value.signedAt,
    payloadHash: value.payloadHash,
  })
}

export function validateControlPlaneDetachedSignature(value: unknown): ControlPlaneDetachedSignature {
  const record = asRecord(value, 'detached signature')
  exactKeys(record, SIGNATURE_KEYS, 'detached signature')
  if (
    record.schemaVersion !== CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION
    || record.contractVersion !== CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION
    || record.algorithm !== CONTROL_PLANE_SIGNATURE_ALGORITHM
  ) fail('UNSUPPORTED_VERSION', 'detached signature')
  if (typeof record.payloadKind !== 'string' || !PAYLOAD_KINDS.has(record.payloadKind)) {
    fail('INVALID_METADATA', 'signature payload kind')
  }
  if (typeof record.signerKind !== 'string' || !SIGNER_KINDS.has(record.signerKind)) {
    fail('INVALID_METADATA', 'signature signer kind')
  }
  if (typeof record.tenantId !== 'string' || !UUID.test(record.tenantId)) fail('INVALID_METADATA', 'signature tenant')
  const metadata = validateMetadata({
    signerId: record.signerId,
    keyId: record.keyId,
    keyVersion: record.keyVersion,
    signedAt: record.signedAt,
  })
  if (typeof record.payloadHash !== 'string' || !HASH.test(record.payloadHash)) fail('INVALID_HASH', 'signature payload hash')
  if (typeof record.signature !== 'string' || !ED25519_SIGNATURE.test(record.signature)) {
    fail('INVALID_SIGNATURE', 'detached signature')
  }
  return deepFreeze({
    schemaVersion: CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION,
    algorithm: CONTROL_PLANE_SIGNATURE_ALGORITHM,
    payloadKind: record.payloadKind as ControlPlaneSignedPayloadKind,
    signerKind: record.signerKind as ControlPlaneSignerKind,
    tenantId: record.tenantId,
    ...metadata,
    payloadHash: record.payloadHash,
    signature: record.signature,
  })
}

export function serializeControlPlaneSignatureBytes(value: unknown): string {
  const signature = validateControlPlaneDetachedSignature(value)
  const { signature: _detached, ...metadata } = signature
  return canonicalSigningBytes(metadata)
}

function signerPort(value: unknown): ControlPlaneDetachedSignerPort {
  const record = asRecord(value, 'signer port')
  exactKeys(record, ['sign'], 'signer port')
  if (typeof record.sign !== 'function') fail('SIGNER_UNAVAILABLE', 'signer port')
  return value as ControlPlaneDetachedSignerPort
}

function verifierPort(value: unknown): ControlPlaneDetachedVerifierPort {
  const record = asRecord(value, 'verifier port')
  exactKeys(record, ['verify'], 'verifier port')
  if (typeof record.verify !== 'function') fail('VERIFIER_UNAVAILABLE', 'verifier port')
  return value as ControlPlaneDetachedVerifierPort
}

function sign(
  unsigned: Omit<ControlPlaneDetachedSignature, 'signature'>,
  portInput: unknown,
): ControlPlaneDetachedSignature {
  const port = signerPort(portInput)
  let result: unknown
  try {
    result = port.sign(canonicalSigningBytes(unsigned))
  } catch {
    fail('SIGNER_UNAVAILABLE', 'signer')
  }
  if (typeof result !== 'string' || !ED25519_SIGNATURE.test(result)) fail('SIGNER_UNAVAILABLE', 'signer output')
  return validateControlPlaneDetachedSignature({ ...unsigned, signature: result })
}

function verify(signature: ControlPlaneDetachedSignature, portInput: unknown): void {
  const port = verifierPort(portInput)
  let result: unknown
  try {
    result = port.verify(serializeControlPlaneSignatureBytes(signature), signature.signature)
  } catch {
    fail('VERIFIER_UNAVAILABLE', 'verifier')
  }
  if (result !== true) fail('INVALID_SIGNATURE', 'detached signature')
}

function unsignedSignature(
  payloadKind: ControlPlaneSignedPayloadKind,
  signerKind: ControlPlaneSignerKind,
  tenantId: string,
  metadataInput: unknown,
  payloadHash: string,
): Omit<ControlPlaneDetachedSignature, 'signature'> {
  const metadata = validateMetadata(metadataInput)
  return deepFreeze({
    schemaVersion: CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION,
    algorithm: CONTROL_PLANE_SIGNATURE_ALGORITHM,
    payloadKind,
    signerKind,
    tenantId,
    ...metadata,
    payloadHash,
  })
}

export function createControlPlaneEnvelopeSignature(
  payloadInput: unknown,
  metadataInput: unknown,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
  signer: ControlPlaneDetachedSignerPort,
): ControlPlaneDetachedSignature {
  const payload = validateControlPlaneExecutionEnvelope(payloadInput, registryInput, hashPort)
  const canonical = serializeControlPlaneExecutionEnvelope(payload, registryInput, hashPort)
  return sign(unsignedSignature(
    'execution_envelope',
    'control_plane',
    payload.identity.tenantId,
    metadataInput,
    hashPayload(hashPort, canonical),
  ), signer)
}

export function validateControlPlaneEnvelopeSignature(
  payloadInput: unknown,
  signatureInput: unknown,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
  verifier: ControlPlaneDetachedVerifierPort,
): ControlPlaneVerifiedEnvelopeSignature {
  const payload = validateControlPlaneExecutionEnvelope(payloadInput, registryInput, hashPort)
  const canonical = serializeControlPlaneExecutionEnvelope(payload, registryInput, hashPort)
  const signature = validateControlPlaneDetachedSignature(signatureInput)
  if (
    signature.payloadKind !== 'execution_envelope'
    || signature.signerKind !== 'control_plane'
    || signature.tenantId !== payload.identity.tenantId
  ) fail('INVALID_METADATA', 'envelope signature binding')
  if (signature.payloadHash !== hashPayload(hashPort, canonical)) fail('INVALID_HASH', 'envelope payload')
  verify(signature, verifier)
  return deepFreeze({ payload, signature })
}

export function createControlPlaneReceiptSignature(
  payloadInput: unknown,
  envelopeInput: unknown,
  metadataInput: unknown,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
  signer: ControlPlaneDetachedSignerPort,
): ControlPlaneDetachedSignature {
  const envelope = validateControlPlaneExecutionEnvelope(envelopeInput, registryInput, hashPort)
  const payload = validateControlPlaneExecutionReceipt(payloadInput, envelope, registryInput, hashPort)
  const metadata = validateMetadata(metadataInput)
  if (metadata.signerId !== envelope.identity.machineId) fail('INVALID_METADATA', 'receipt signer')
  const canonical = serializeControlPlaneExecutionReceipt(payload, envelope, registryInput, hashPort)
  return sign(unsignedSignature(
    'execution_receipt',
    'worker_machine',
    payload.identity.tenantId,
    metadata,
    hashPayload(hashPort, canonical),
  ), signer)
}

export function validateControlPlaneReceiptSignature(
  payloadInput: unknown,
  envelopeInput: unknown,
  signatureInput: unknown,
  registryInput: unknown,
  hashPort: ControlPlaneHashPort,
  verifier: ControlPlaneDetachedVerifierPort,
): ControlPlaneVerifiedReceiptSignature {
  const envelope = validateControlPlaneExecutionEnvelope(envelopeInput, registryInput, hashPort)
  const payload = validateControlPlaneExecutionReceipt(payloadInput, envelope, registryInput, hashPort)
  const canonical = serializeControlPlaneExecutionReceipt(payload, envelope, registryInput, hashPort)
  const signature = validateControlPlaneDetachedSignature(signatureInput)
  if (
    signature.payloadKind !== 'execution_receipt'
    || signature.signerKind !== 'worker_machine'
    || signature.tenantId !== payload.identity.tenantId
    || signature.signerId !== envelope.identity.machineId
  ) fail('INVALID_METADATA', 'receipt signature binding')
  if (signature.payloadHash !== hashPayload(hashPort, canonical)) fail('INVALID_HASH', 'receipt payload')
  verify(signature, verifier)
  return deepFreeze({ payload, signature })
}
