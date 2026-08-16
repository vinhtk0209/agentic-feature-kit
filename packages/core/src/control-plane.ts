export const CONTROL_PLANE_SCHEMA_VERSION = 1 as const
export const CONTROL_PLANE_CONTRACT_VERSION = '1.0.0' as const
export const CONTROL_PLANE_MAX_OPERATION_INPUT_BYTES = 32 * 1024
export const CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES = 64 * 1024 * 1024
export const CONTROL_PLANE_MAX_WALL_TIME_MS = 30 * 60 * 1000
export const CONTROL_PLANE_MAX_RESULT_BYTES = 256 * 1024
export const CONTROL_PLANE_MAX_EVIDENCE_REFS = 16
export const CONTROL_PLANE_MAX_PROGRESS_EVENTS = 200
export const CONTROL_PLANE_MAX_ATTEMPTS = 50
export const CONTROL_PLANE_MAX_LEASE_INTERVAL_MS = 60 * 1000
export const CONTROL_PLANE_MAX_DEADLINE_INTERVAL_MS = CONTROL_PLANE_MAX_WALL_TIME_MS
export const CONTROL_PLANE_MAX_ENVELOPE_BYTES = 256 * 1024

export const CONTROL_PLANE_OPERATION_CODES = [
  'evidence.verify',
  'project_intelligence.inspect',
  'workflow_phase.execute',
  'workflow_verify.execute',
] as const

export const CONTROL_PLANE_CAPABILITY_IDS = [
  'evidence.verify',
  'project_intelligence.inspect',
  'provider.execute',
  'repository.read',
  'workflow_orchestrator.execute',
  'workflow_verification.execute',
] as const

export const CONTROL_PLANE_ERROR_CODES = [
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_OPERATION',
  'UNKNOWN_CAPABILITY',
  'DUPLICATE_VALUE',
  'NON_CANONICAL_ORDER',
  'CONTRACT_HASH_MISMATCH',
  'MANIFEST_HASH_MISMATCH',
  'MISSING_CAPABILITY',
  'LIMIT_EXCEEDED',
  'HASH_UNAVAILABLE',
] as const

export type OperationCode = (typeof CONTROL_PLANE_OPERATION_CODES)[number]
export type CapabilityId = (typeof CONTROL_PLANE_CAPABILITY_IDS)[number]
export type ControlPlaneErrorCode = (typeof CONTROL_PLANE_ERROR_CODES)[number]
export type OperationInputKind =
  | 'project_inspection'
  | 'workflow_phase'
  | 'workflow_verification'
  | 'evidence_verification'
export type OperationReplayClass = 'read_only' | 'manual_recovery'
export type ContentReferencePurpose = 'phase_envelope' | 'verification_request' | 'evidence'
export type ContentReferenceMediaType =
  | 'application/json'
  | 'application/zip'
  | 'text/markdown'
  | 'image/png'
  | 'image/jpeg'

export interface ControlPlaneHashPort {
  sha256(canonicalUtf8Text: string): string
}

export interface ControlPlaneContentReference {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly referenceId: string
  readonly purpose: ContentReferencePurpose
  readonly sha256: string
  readonly mediaType: ContentReferenceMediaType
  readonly bytes: number
}

export interface OperationResourceBudget {
  readonly profileId: 'evidence_small' | 'inspect_small' | 'verification_standard' | 'workflow_standard'
  readonly maxWallTimeMs: number
  readonly maxResultBytes: number
  readonly maxEvidenceRefs: number
  readonly maxProgressEvents: number
}

export interface OperationDescriptor {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly code: OperationCode
  readonly adapterId:
    | 'evidence-verifier-v1'
    | 'privacy-safe-verification-v1'
    | 'project-intelligence-v1'
    | 'workflow-orchestrator-phase-v1'
  readonly adapterVersion: '1.0.0'
  readonly inputKind: OperationInputKind
  readonly requiredCapabilities: readonly CapabilityId[]
  readonly replayClass: OperationReplayClass
  readonly resourceBudget: OperationResourceBudget
  readonly contractHash: string
}

export interface ProjectInspectionInput {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly repositoryId: string
}

export interface WorkflowPhaseInput {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly repositoryId: string
  readonly phaseId: string
  readonly phaseEnvelope: ControlPlaneContentReference
}

export interface WorkflowVerificationInput {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly repositoryId: string
  readonly verificationRequest: ControlPlaneContentReference
}

export interface EvidenceVerificationInput {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly evidence: ControlPlaneContentReference
}

export type ControlPlaneOperationInput =
  | ProjectInspectionInput
  | WorkflowPhaseInput
  | WorkflowVerificationInput
  | EvidenceVerificationInput

export interface WorkerOperationCapability {
  readonly code: OperationCode
  readonly contractHash: string
  readonly adapterId: OperationDescriptor['adapterId']
  readonly adapterVersion: OperationDescriptor['adapterVersion']
}

export interface WorkerCapabilityManifest {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly workerVersion: string
  readonly operations: readonly WorkerOperationCapability[]
  readonly capabilityIds: readonly CapabilityId[]
  readonly manifestHash: string
}

export interface WorkerCapabilityManifestInput {
  readonly workerVersion: string
  readonly operationCodes: readonly OperationCode[]
  readonly capabilityIds: readonly CapabilityId[]
}

export interface ControlPlaneExecutionIdentity {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly tenantId: string
  readonly taskId: string
  readonly commandRunId: string
  readonly rootRunId: string
  readonly parentRunId: string | null
  readonly attempt: number
  readonly deliveryId: string
  readonly leaseId: string
  readonly machineId: string
  readonly repositoryId: string
  readonly progressBindingHash: string
}

export interface ControlPlaneExecutionOperation {
  readonly descriptor: OperationDescriptor
  readonly input: ControlPlaneOperationInput
}

export interface ControlPlaneExecutionTiming {
  readonly issuedAt: string
  readonly leaseExpiresAt: string
  readonly deadlineAt: string
}

export interface ControlPlaneEvidencePolicy {
  readonly mode: 'metadata_only'
  readonly sink: 'p17_015_progress'
  readonly retentionClass: 'short_lived' | 'standard'
}

export interface ControlPlaneExecutionEnvelope {
  readonly schemaVersion: typeof CONTROL_PLANE_SCHEMA_VERSION
  readonly contractVersion: typeof CONTROL_PLANE_CONTRACT_VERSION
  readonly identity: ControlPlaneExecutionIdentity
  readonly operation: ControlPlaneExecutionOperation
  readonly timing: ControlPlaneExecutionTiming
  readonly evidencePolicy: ControlPlaneEvidencePolicy
  readonly envelopeHash: string
}

export interface ControlPlaneExecutionEnvelopeInput {
  readonly identity: ControlPlaneExecutionIdentity
  readonly operationCode: OperationCode
  readonly operationInput: ControlPlaneOperationInput
  readonly timing: ControlPlaneExecutionTiming
  readonly evidencePolicy: ControlPlaneEvidencePolicy
}

export class ControlPlaneContractError extends Error {
  readonly code: ControlPlaneErrorCode

  constructor(code: ControlPlaneErrorCode, message: string) {
    super(message)
    this.name = 'ControlPlaneContractError'
    this.code = code
  }
}

interface OperationDescriptorSeed extends Omit<OperationDescriptor, 'contractHash'> {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const LOWER_SHA256 = /^[0-9a-f]{64}$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const PHASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const PROGRESS_TASK_ID = /^P17-\d{3}$/
const OPERATION_SET = new Set<string>(CONTROL_PLANE_OPERATION_CODES)
const CAPABILITY_SET = new Set<string>(CONTROL_PLANE_CAPABILITY_IDS)
const ADAPTER_ID_SET = new Set<OperationDescriptor['adapterId']>([
  'evidence-verifier-v1',
  'privacy-safe-verification-v1',
  'project-intelligence-v1',
  'workflow-orchestrator-phase-v1',
])
const INPUT_KIND_SET = new Set<OperationInputKind>([
  'project_inspection',
  'workflow_phase',
  'workflow_verification',
  'evidence_verification',
])
const CONTENT_PURPOSES = new Set<ContentReferencePurpose>(['phase_envelope', 'verification_request', 'evidence'])
const CONTENT_MEDIA_TYPES = new Set<ContentReferenceMediaType>([
  'application/json',
  'application/zip',
  'text/markdown',
  'image/png',
  'image/jpeg',
])

const DESCRIPTOR_KEYS = [
  'schemaVersion',
  'contractVersion',
  'code',
  'adapterId',
  'adapterVersion',
  'inputKind',
  'requiredCapabilities',
  'replayClass',
  'resourceBudget',
  'contractHash',
] as const
const BUDGET_KEYS = ['profileId', 'maxWallTimeMs', 'maxResultBytes', 'maxEvidenceRefs', 'maxProgressEvents'] as const
const CONTENT_REFERENCE_KEYS = ['schemaVersion', 'referenceId', 'purpose', 'sha256', 'mediaType', 'bytes'] as const
const MANIFEST_KEYS = ['schemaVersion', 'contractVersion', 'workerVersion', 'operations', 'capabilityIds', 'manifestHash'] as const
const MANIFEST_INPUT_KEYS = ['workerVersion', 'operationCodes', 'capabilityIds'] as const
const MANIFEST_OPERATION_KEYS = ['code', 'contractHash', 'adapterId', 'adapterVersion'] as const
const EXECUTION_IDENTITY_KEYS = [
  'schemaVersion',
  'tenantId',
  'taskId',
  'commandRunId',
  'rootRunId',
  'parentRunId',
  'attempt',
  'deliveryId',
  'leaseId',
  'machineId',
  'repositoryId',
  'progressBindingHash',
] as const
const EXECUTION_OPERATION_KEYS = ['descriptor', 'input'] as const
const EXECUTION_TIMING_KEYS = ['issuedAt', 'leaseExpiresAt', 'deadlineAt'] as const
const EVIDENCE_POLICY_KEYS = ['mode', 'sink', 'retentionClass'] as const
const EXECUTION_ENVELOPE_KEYS = [
  'schemaVersion',
  'contractVersion',
  'identity',
  'operation',
  'timing',
  'evidencePolicy',
  'envelopeHash',
] as const
const EXECUTION_ENVELOPE_INPUT_KEYS = [
  'identity',
  'operationCode',
  'operationInput',
  'timing',
  'evidencePolicy',
] as const

const INPUT_CONTRACTS: Record<OperationInputKind, { readonly fields: readonly string[]; readonly referencePurpose: ContentReferencePurpose | null }> = {
  project_inspection: { fields: ['schemaVersion', 'repositoryId'], referencePurpose: null },
  workflow_phase: { fields: ['schemaVersion', 'repositoryId', 'phaseId', 'phaseEnvelope'], referencePurpose: 'phase_envelope' },
  workflow_verification: { fields: ['schemaVersion', 'repositoryId', 'verificationRequest'], referencePurpose: 'verification_request' },
  evidence_verification: { fields: ['schemaVersion', 'evidence'], referencePurpose: 'evidence' },
}

const DESCRIPTOR_SEEDS: readonly OperationDescriptorSeed[] = [
  {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    code: 'evidence.verify',
    adapterId: 'evidence-verifier-v1',
    adapterVersion: '1.0.0',
    inputKind: 'evidence_verification',
    requiredCapabilities: ['evidence.verify'],
    replayClass: 'read_only',
    resourceBudget: {
      profileId: 'evidence_small',
      maxWallTimeMs: 120000,
      maxResultBytes: 65536,
      maxEvidenceRefs: 4,
      maxProgressEvents: 20,
    },
  },
  {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    code: 'project_intelligence.inspect',
    adapterId: 'project-intelligence-v1',
    adapterVersion: '1.0.0',
    inputKind: 'project_inspection',
    requiredCapabilities: ['project_intelligence.inspect', 'repository.read'],
    replayClass: 'read_only',
    resourceBudget: {
      profileId: 'inspect_small',
      maxWallTimeMs: 60000,
      maxResultBytes: 262144,
      maxEvidenceRefs: 4,
      maxProgressEvents: 20,
    },
  },
  {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    code: 'workflow_phase.execute',
    adapterId: 'workflow-orchestrator-phase-v1',
    adapterVersion: '1.0.0',
    inputKind: 'workflow_phase',
    requiredCapabilities: ['provider.execute', 'repository.read', 'workflow_orchestrator.execute'],
    replayClass: 'manual_recovery',
    resourceBudget: {
      profileId: 'workflow_standard',
      maxWallTimeMs: 1800000,
      maxResultBytes: 262144,
      maxEvidenceRefs: 16,
      maxProgressEvents: 200,
    },
  },
  {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    code: 'workflow_verify.execute',
    adapterId: 'privacy-safe-verification-v1',
    adapterVersion: '1.0.0',
    inputKind: 'workflow_verification',
    requiredCapabilities: ['repository.read', 'workflow_verification.execute'],
    replayClass: 'manual_recovery',
    resourceBudget: {
      profileId: 'verification_standard',
      maxWallTimeMs: 900000,
      maxResultBytes: 262144,
      maxEvidenceRefs: 16,
      maxProgressEvents: 200,
    },
  },
]

function contractError(code: ControlPlaneErrorCode, category: string): never {
  throw new ControlPlaneContractError(code, `control-plane ${category} rejected`)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function assertPlainDataRecord(value: unknown, category: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) contractError('INVALID_SHAPE', category)
  try {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set) contractError('INVALID_SHAPE', category)
    }
  } catch (error) {
    if (error instanceof ControlPlaneContractError) throw error
    contractError('INVALID_SHAPE', category)
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], category: string): void {
  let actual: string[]
  try {
    actual = Object.keys(value).sort()
  } catch {
    contractError('INVALID_SHAPE', category)
  }
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) contractError('INVALID_SHAPE', category)
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function hashCanonical(port: ControlPlaneHashPort, value: string): string {
  if (!port || typeof port.sha256 !== 'function') contractError('HASH_UNAVAILABLE', 'hash port')
  let result: unknown
  try {
    result = port.sha256(value)
  } catch {
    contractError('HASH_UNAVAILABLE', 'hash port')
  }
  if (typeof result !== 'string' || !LOWER_SHA256.test(result)) contractError('HASH_UNAVAILABLE', 'hash port')
  return result
}

function assertUuid(value: unknown, category: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) contractError('INVALID_SHAPE', category)
}

function assertLowerHash(value: unknown, category: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_SHA256.test(value)) contractError('INVALID_SHAPE', category)
}

function assertVersion(value: unknown, category: string): asserts value is string {
  if (typeof value !== 'string' || !SEMVER.test(value)) contractError('INVALID_SHAPE', category)
}

function assertSafePositiveInteger(value: unknown, maximum: number, category: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) contractError('INVALID_SHAPE', category)
  if (Number(value) > maximum) contractError('LIMIT_EXCEEDED', category)
}

function assertUniqueSorted(values: readonly string[], category: string): void {
  if (new Set(values).size !== values.length) contractError('DUPLICATE_VALUE', category)
  const sorted = [...values].sort()
  if (JSON.stringify(values) !== JSON.stringify(sorted)) contractError('NON_CANONICAL_ORDER', category)
}

function validateCapabilityIds(value: unknown, category: string): readonly CapabilityId[] {
  if (!Array.isArray(value) || value.length > CONTROL_PLANE_CAPABILITY_IDS.length) contractError('INVALID_SHAPE', category)
  const values: string[] = []
  for (const capability of value) {
    if (typeof capability !== 'string' || !CAPABILITY_SET.has(capability)) contractError('UNKNOWN_CAPABILITY', category)
    values.push(capability)
  }
  assertUniqueSorted(values, category)
  return values as CapabilityId[]
}

function validateOperationCodes(value: unknown, category: string): readonly OperationCode[] {
  if (!Array.isArray(value) || value.length > CONTROL_PLANE_OPERATION_CODES.length) contractError('INVALID_SHAPE', category)
  const values: string[] = []
  for (const operation of value) {
    if (typeof operation !== 'string' || !OPERATION_SET.has(operation)) contractError('UNKNOWN_OPERATION', category)
    values.push(operation)
  }
  assertUniqueSorted(values, category)
  return values as OperationCode[]
}

function validateResourceBudget(value: unknown): OperationResourceBudget {
  assertPlainDataRecord(value, 'resource budget')
  exactKeys(value, BUDGET_KEYS, 'resource budget')
  if (!['evidence_small', 'inspect_small', 'verification_standard', 'workflow_standard'].includes(String(value.profileId))) {
    contractError('INVALID_SHAPE', 'resource budget')
  }
  assertSafePositiveInteger(value.maxWallTimeMs, CONTROL_PLANE_MAX_WALL_TIME_MS, 'resource budget')
  assertSafePositiveInteger(value.maxResultBytes, CONTROL_PLANE_MAX_RESULT_BYTES, 'resource budget')
  assertSafePositiveInteger(value.maxEvidenceRefs, CONTROL_PLANE_MAX_EVIDENCE_REFS, 'resource budget')
  assertSafePositiveInteger(value.maxProgressEvents, CONTROL_PLANE_MAX_PROGRESS_EVENTS, 'resource budget')
  return value as unknown as OperationResourceBudget
}

function canonicalResourceBudget(value: OperationResourceBudget): Record<string, unknown> {
  return {
    profileId: value.profileId,
    maxWallTimeMs: value.maxWallTimeMs,
    maxResultBytes: value.maxResultBytes,
    maxEvidenceRefs: value.maxEvidenceRefs,
    maxProgressEvents: value.maxProgressEvents,
  }
}

function canonicalOperationContract(value: OperationDescriptorSeed): string {
  const inputContract = INPUT_CONTRACTS[value.inputKind]
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    code: value.code,
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion,
    inputKind: value.inputKind,
    inputContract: {
      fields: inputContract.fields,
      referencePurpose: inputContract.referencePurpose,
      contentReferenceFields: inputContract.referencePurpose === null ? [] : CONTENT_REFERENCE_KEYS,
      maxCanonicalBytes: CONTROL_PLANE_MAX_OPERATION_INPUT_BYTES,
      maxReferencedBytes: CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES,
    },
    requiredCapabilities: value.requiredCapabilities,
    replayClass: value.replayClass,
    resourceBudget: canonicalResourceBudget(value.resourceBudget),
  })
}

function validateDescriptorShape(value: unknown): OperationDescriptor {
  assertPlainDataRecord(value, 'operation descriptor')
  exactKeys(value, DESCRIPTOR_KEYS, 'operation descriptor')
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || value.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) {
    contractError('UNSUPPORTED_VERSION', 'operation descriptor')
  }
  if (typeof value.code !== 'string' || !OPERATION_SET.has(value.code)) contractError('UNKNOWN_OPERATION', 'operation descriptor')
  if (
    typeof value.adapterId !== 'string'
    || !ADAPTER_ID_SET.has(value.adapterId as OperationDescriptor['adapterId'])
    || value.adapterVersion !== '1.0.0'
    || typeof value.inputKind !== 'string'
    || !INPUT_KIND_SET.has(value.inputKind as OperationInputKind)
  ) {
    contractError('INVALID_SHAPE', 'operation descriptor')
  }
  const requiredCapabilities = validateCapabilityIds(value.requiredCapabilities, 'operation descriptor capabilities')
  if (value.replayClass !== 'read_only' && value.replayClass !== 'manual_recovery') contractError('INVALID_SHAPE', 'operation descriptor')
  const resourceBudget = validateResourceBudget(value.resourceBudget)
  assertLowerHash(value.contractHash, 'operation descriptor')
  return {
    ...(value as unknown as OperationDescriptor),
    requiredCapabilities,
    resourceBudget,
  }
}

export function createControlPlaneOperationRegistry(port: ControlPlaneHashPort): readonly OperationDescriptor[] {
  const registry = DESCRIPTOR_SEEDS.map((seed) => ({
    ...jsonClone(seed),
    contractHash: hashCanonical(port, canonicalOperationContract(seed)),
  }))
  if (new Set(registry.map((entry) => entry.contractHash)).size !== registry.length) {
    contractError('HASH_UNAVAILABLE', 'operation registry')
  }
  return deepFreeze(registry)
}

export function validateControlPlaneOperationRegistry(value: unknown, port: ControlPlaneHashPort): readonly OperationDescriptor[] {
  if (!Array.isArray(value) || value.length !== CONTROL_PLANE_OPERATION_CODES.length) contractError('INVALID_SHAPE', 'operation registry')
  const descriptors = value.map(validateDescriptorShape)
  const codes = descriptors.map((entry) => entry.code)
  if (new Set(codes).size !== codes.length) contractError('DUPLICATE_VALUE', 'operation registry')
  if (JSON.stringify(codes) !== JSON.stringify(CONTROL_PLANE_OPERATION_CODES)) {
    const sorted = [...codes].sort()
    if (JSON.stringify(codes) !== JSON.stringify(sorted)) contractError('NON_CANONICAL_ORDER', 'operation registry')
    contractError('INVALID_SHAPE', 'operation registry')
  }

  const expected = createControlPlaneOperationRegistry(port)
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index]!
    const { contractHash, ...withoutHash } = descriptor
    const computed = hashCanonical(port, canonicalOperationContract(withoutHash))
    if (computed !== contractHash) contractError('CONTRACT_HASH_MISMATCH', 'operation descriptor')
    if (JSON.stringify(descriptor) !== JSON.stringify(expected[index])) {
      contractError('CONTRACT_HASH_MISMATCH', 'operation descriptor')
    }
  }
  return deepFreeze(jsonClone(descriptors))
}

function validateContentReference(value: unknown, purpose: ContentReferencePurpose): ControlPlaneContentReference {
  assertPlainDataRecord(value, 'content reference')
  exactKeys(value, CONTENT_REFERENCE_KEYS, 'content reference')
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'content reference')
  assertUuid(value.referenceId, 'content reference')
  if (typeof value.purpose !== 'string' || !CONTENT_PURPOSES.has(value.purpose as ContentReferencePurpose) || value.purpose !== purpose) {
    contractError('INVALID_SHAPE', 'content reference')
  }
  assertLowerHash(value.sha256, 'content reference')
  if (typeof value.mediaType !== 'string' || !CONTENT_MEDIA_TYPES.has(value.mediaType as ContentReferenceMediaType)) {
    contractError('INVALID_SHAPE', 'content reference')
  }
  if (!Number.isSafeInteger(value.bytes) || Number(value.bytes) < 0) contractError('INVALID_SHAPE', 'content reference')
  if (Number(value.bytes) > CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES) contractError('LIMIT_EXCEEDED', 'content reference')
  return deepFreeze(jsonClone(value as unknown as ControlPlaneContentReference))
}

function assertCanonicalInputSize(value: ControlPlaneOperationInput): void {
  const bytes = utf8ByteLength(JSON.stringify(value))
  if (bytes > CONTROL_PLANE_MAX_OPERATION_INPUT_BYTES) contractError('LIMIT_EXCEEDED', 'operation input')
}

export function validateControlPlaneOperationInput(code: OperationCode, value: unknown): ControlPlaneOperationInput {
  if (!OPERATION_SET.has(code)) contractError('UNKNOWN_OPERATION', 'operation input')
  assertPlainDataRecord(value, 'operation input')

  let result: ControlPlaneOperationInput
  switch (code) {
    case 'project_intelligence.inspect': {
      exactKeys(value, ['schemaVersion', 'repositoryId'], 'operation input')
      if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'operation input')
      assertUuid(value.repositoryId, 'operation input')
      result = { schemaVersion: CONTROL_PLANE_SCHEMA_VERSION, repositoryId: value.repositoryId }
      break
    }
    case 'workflow_phase.execute': {
      exactKeys(value, ['schemaVersion', 'repositoryId', 'phaseId', 'phaseEnvelope'], 'operation input')
      if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'operation input')
      assertUuid(value.repositoryId, 'operation input')
      if (typeof value.phaseId !== 'string') contractError('INVALID_SHAPE', 'operation input')
      if (value.phaseId.length > 64) contractError('LIMIT_EXCEEDED', 'operation input')
      if (!PHASE_ID.test(value.phaseId)) contractError('INVALID_SHAPE', 'operation input')
      result = {
        schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
        repositoryId: value.repositoryId,
        phaseId: value.phaseId,
        phaseEnvelope: validateContentReference(value.phaseEnvelope, 'phase_envelope'),
      }
      break
    }
    case 'workflow_verify.execute': {
      exactKeys(value, ['schemaVersion', 'repositoryId', 'verificationRequest'], 'operation input')
      if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'operation input')
      assertUuid(value.repositoryId, 'operation input')
      result = {
        schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
        repositoryId: value.repositoryId,
        verificationRequest: validateContentReference(value.verificationRequest, 'verification_request'),
      }
      break
    }
    case 'evidence.verify': {
      exactKeys(value, ['schemaVersion', 'evidence'], 'operation input')
      if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'operation input')
      result = {
        schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
        evidence: validateContentReference(value.evidence, 'evidence'),
      }
      break
    }
  }
  assertCanonicalInputSize(result)
  return deepFreeze(result)
}

function canonicalWorkerManifest(value: Omit<WorkerCapabilityManifest, 'manifestHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    workerVersion: value.workerVersion,
    operations: value.operations.map((entry) => ({
      code: entry.code,
      contractHash: entry.contractHash,
      adapterId: entry.adapterId,
      adapterVersion: entry.adapterVersion,
    })),
    capabilityIds: value.capabilityIds,
  })
}

function assertRequiredCapabilities(operations: readonly WorkerOperationCapability[], capabilities: readonly CapabilityId[], registry: readonly OperationDescriptor[]): void {
  const available = new Set(capabilities)
  for (const operation of operations) {
    const descriptor = registry.find((entry) => entry.code === operation.code)
    if (!descriptor) contractError('UNKNOWN_OPERATION', 'worker manifest')
    for (const required of descriptor.requiredCapabilities) {
      if (!available.has(required)) contractError('MISSING_CAPABILITY', 'worker manifest')
    }
  }
}

export function createWorkerCapabilityManifest(
  value: WorkerCapabilityManifestInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): WorkerCapabilityManifest {
  assertPlainDataRecord(value, 'worker manifest input')
  exactKeys(value, MANIFEST_INPUT_KEYS, 'worker manifest input')
  assertVersion(value.workerVersion, 'worker manifest input')
  const operationCodes = validateOperationCodes(value.operationCodes, 'worker manifest operations')
  const capabilityIds = validateCapabilityIds(value.capabilityIds, 'worker manifest capabilities')
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  const operations = operationCodes.map((code) => {
    const descriptor = registry.find((entry) => entry.code === code)
    if (!descriptor) contractError('UNKNOWN_OPERATION', 'worker manifest')
    return {
      code: descriptor.code,
      contractHash: descriptor.contractHash,
      adapterId: descriptor.adapterId,
      adapterVersion: descriptor.adapterVersion,
    }
  })
  assertRequiredCapabilities(operations, capabilityIds, registry)
  const withoutHash: Omit<WorkerCapabilityManifest, 'manifestHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    workerVersion: value.workerVersion,
    operations,
    capabilityIds,
  }
  return deepFreeze({ ...withoutHash, manifestHash: hashCanonical(port, canonicalWorkerManifest(withoutHash)) })
}

export function validateWorkerCapabilityManifest(
  value: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): WorkerCapabilityManifest {
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  assertPlainDataRecord(value, 'worker manifest')
  exactKeys(value, MANIFEST_KEYS, 'worker manifest')
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || value.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) {
    contractError('UNSUPPORTED_VERSION', 'worker manifest')
  }
  assertVersion(value.workerVersion, 'worker manifest')
  if (!Array.isArray(value.operations) || value.operations.length > CONTROL_PLANE_OPERATION_CODES.length) {
    contractError('INVALID_SHAPE', 'worker manifest')
  }
  const operations: WorkerOperationCapability[] = value.operations.map((entry) => {
    assertPlainDataRecord(entry, 'worker manifest operation')
    exactKeys(entry, MANIFEST_OPERATION_KEYS, 'worker manifest operation')
    if (typeof entry.code !== 'string' || !OPERATION_SET.has(entry.code)) contractError('UNKNOWN_OPERATION', 'worker manifest operation')
    assertLowerHash(entry.contractHash, 'worker manifest operation')
    if (typeof entry.adapterId !== 'string' || typeof entry.adapterVersion !== 'string') contractError('INVALID_SHAPE', 'worker manifest operation')
    const descriptor = registry.find((candidate) => candidate.code === entry.code)
    if (!descriptor) contractError('UNKNOWN_OPERATION', 'worker manifest operation')
    if (
      entry.contractHash !== descriptor.contractHash
      || entry.adapterId !== descriptor.adapterId
      || entry.adapterVersion !== descriptor.adapterVersion
    ) contractError('CONTRACT_HASH_MISMATCH', 'worker manifest operation')
    return {
      code: descriptor.code,
      contractHash: descriptor.contractHash,
      adapterId: descriptor.adapterId,
      adapterVersion: descriptor.adapterVersion,
    }
  })
  const operationCodes = operations.map((entry) => entry.code)
  assertUniqueSorted(operationCodes, 'worker manifest operations')
  const capabilityIds = validateCapabilityIds(value.capabilityIds, 'worker manifest capabilities')
  assertRequiredCapabilities(operations, capabilityIds, registry)
  assertLowerHash(value.manifestHash, 'worker manifest')
  const withoutHash: Omit<WorkerCapabilityManifest, 'manifestHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    workerVersion: value.workerVersion,
    operations,
    capabilityIds,
  }
  const computed = hashCanonical(port, canonicalWorkerManifest(withoutHash))
  if (computed !== value.manifestHash) contractError('MANIFEST_HASH_MISMATCH', 'worker manifest')
  return deepFreeze({ ...withoutHash, manifestHash: value.manifestHash })
}

function assertLowerUuid(value: unknown, category: string): asserts value is string {
  if (typeof value !== 'string' || !LOWER_UUID.test(value)) contractError('INVALID_SHAPE', category)
}

function assertCanonicalTimestamp(value: unknown, category: string): asserts value is string {
  if (typeof value !== 'string') contractError('INVALID_SHAPE', category)
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) contractError('INVALID_SHAPE', category)
  try {
    if (new Date(milliseconds).toISOString() !== value) contractError('INVALID_SHAPE', category)
  } catch (error) {
    if (error instanceof ControlPlaneContractError) throw error
    contractError('INVALID_SHAPE', category)
  }
}

function validateExecutionIdentity(value: unknown): ControlPlaneExecutionIdentity {
  assertPlainDataRecord(value, 'execution identity')
  exactKeys(value, EXECUTION_IDENTITY_KEYS, 'execution identity')
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION) contractError('UNSUPPORTED_VERSION', 'execution identity')
  assertLowerUuid(value.tenantId, 'execution identity')
  if (typeof value.taskId !== 'string' || !PROGRESS_TASK_ID.test(value.taskId)) contractError('INVALID_SHAPE', 'execution identity')
  assertLowerUuid(value.commandRunId, 'execution identity')
  assertLowerUuid(value.rootRunId, 'execution identity')
  if (value.parentRunId !== null) assertLowerUuid(value.parentRunId, 'execution identity')
  if (typeof value.attempt !== 'number' || !Number.isSafeInteger(value.attempt) || value.attempt < 1) {
    contractError('INVALID_SHAPE', 'execution identity')
  }
  if (value.attempt > CONTROL_PLANE_MAX_ATTEMPTS) contractError('LIMIT_EXCEEDED', 'execution identity')
  assertLowerUuid(value.deliveryId, 'execution identity')
  assertLowerUuid(value.leaseId, 'execution identity')
  assertLowerUuid(value.machineId, 'execution identity')
  assertLowerUuid(value.repositoryId, 'execution identity')
  assertLowerHash(value.progressBindingHash, 'execution identity')
  if (value.deliveryId === value.leaseId) contractError('INVALID_SHAPE', 'execution identity')

  if (value.attempt === 1) {
    if (value.rootRunId !== value.commandRunId || value.parentRunId !== null) {
      contractError('INVALID_SHAPE', 'execution identity')
    }
  } else if (
    value.parentRunId === null
    || value.commandRunId === value.rootRunId
    || value.commandRunId === value.parentRunId
  ) {
    contractError('INVALID_SHAPE', 'execution identity')
  }

  return deepFreeze({
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    tenantId: value.tenantId,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    rootRunId: value.rootRunId,
    parentRunId: value.parentRunId,
    attempt: value.attempt,
    deliveryId: value.deliveryId,
    leaseId: value.leaseId,
    machineId: value.machineId,
    repositoryId: value.repositoryId,
    progressBindingHash: value.progressBindingHash,
  })
}

function validateExecutionTiming(value: unknown): ControlPlaneExecutionTiming {
  assertPlainDataRecord(value, 'execution timing')
  exactKeys(value, EXECUTION_TIMING_KEYS, 'execution timing')
  assertCanonicalTimestamp(value.issuedAt, 'execution timing')
  assertCanonicalTimestamp(value.leaseExpiresAt, 'execution timing')
  assertCanonicalTimestamp(value.deadlineAt, 'execution timing')
  const issuedAt = Date.parse(value.issuedAt)
  const leaseExpiresAt = Date.parse(value.leaseExpiresAt)
  const deadlineAt = Date.parse(value.deadlineAt)
  if (issuedAt >= leaseExpiresAt || leaseExpiresAt > deadlineAt) contractError('INVALID_SHAPE', 'execution timing')
  if (leaseExpiresAt - issuedAt > CONTROL_PLANE_MAX_LEASE_INTERVAL_MS) contractError('LIMIT_EXCEEDED', 'execution timing')
  if (deadlineAt - issuedAt > CONTROL_PLANE_MAX_DEADLINE_INTERVAL_MS) contractError('LIMIT_EXCEEDED', 'execution timing')
  return deepFreeze({ issuedAt: value.issuedAt, leaseExpiresAt: value.leaseExpiresAt, deadlineAt: value.deadlineAt })
}

function validateEvidencePolicy(value: unknown): ControlPlaneEvidencePolicy {
  assertPlainDataRecord(value, 'evidence policy')
  exactKeys(value, EVIDENCE_POLICY_KEYS, 'evidence policy')
  if (value.mode !== 'metadata_only' || value.sink !== 'p17_015_progress') contractError('INVALID_SHAPE', 'evidence policy')
  if (value.retentionClass !== 'short_lived' && value.retentionClass !== 'standard') {
    contractError('INVALID_SHAPE', 'evidence policy')
  }
  return deepFreeze({ mode: value.mode, sink: value.sink, retentionClass: value.retentionClass })
}

function canonicalContentReference(value: ControlPlaneContentReference): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    referenceId: value.referenceId,
    purpose: value.purpose,
    sha256: value.sha256,
    mediaType: value.mediaType,
    bytes: value.bytes,
  }
}

function canonicalOperationInput(code: OperationCode, value: ControlPlaneOperationInput): Record<string, unknown> {
  switch (code) {
    case 'project_intelligence.inspect': {
      const input = value as ProjectInspectionInput
      return { schemaVersion: input.schemaVersion, repositoryId: input.repositoryId }
    }
    case 'workflow_phase.execute': {
      const input = value as WorkflowPhaseInput
      return {
        schemaVersion: input.schemaVersion,
        repositoryId: input.repositoryId,
        phaseId: input.phaseId,
        phaseEnvelope: canonicalContentReference(input.phaseEnvelope),
      }
    }
    case 'workflow_verify.execute': {
      const input = value as WorkflowVerificationInput
      return {
        schemaVersion: input.schemaVersion,
        repositoryId: input.repositoryId,
        verificationRequest: canonicalContentReference(input.verificationRequest),
      }
    }
    case 'evidence.verify': {
      const input = value as EvidenceVerificationInput
      return { schemaVersion: input.schemaVersion, evidence: canonicalContentReference(input.evidence) }
    }
  }
}

function canonicalDescriptor(value: OperationDescriptor): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    code: value.code,
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion,
    inputKind: value.inputKind,
    requiredCapabilities: [...value.requiredCapabilities],
    replayClass: value.replayClass,
    resourceBudget: canonicalResourceBudget(value.resourceBudget),
    contractHash: value.contractHash,
  }
}

function canonicalIdentity(value: ControlPlaneExecutionIdentity): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    tenantId: value.tenantId,
    taskId: value.taskId,
    commandRunId: value.commandRunId,
    rootRunId: value.rootRunId,
    parentRunId: value.parentRunId,
    attempt: value.attempt,
    deliveryId: value.deliveryId,
    leaseId: value.leaseId,
    machineId: value.machineId,
    repositoryId: value.repositoryId,
    progressBindingHash: value.progressBindingHash,
  }
}

function canonicalTiming(value: ControlPlaneExecutionTiming): Record<string, unknown> {
  return { issuedAt: value.issuedAt, leaseExpiresAt: value.leaseExpiresAt, deadlineAt: value.deadlineAt }
}

function canonicalEvidencePolicy(value: ControlPlaneEvidencePolicy): Record<string, unknown> {
  return { mode: value.mode, sink: value.sink, retentionClass: value.retentionClass }
}

function canonicalEnvelopePayload(value: Omit<ControlPlaneExecutionEnvelope, 'envelopeHash'>): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    identity: canonicalIdentity(value.identity),
    operation: {
      descriptor: canonicalDescriptor(value.operation.descriptor),
      input: canonicalOperationInput(value.operation.descriptor.code, value.operation.input),
    },
    timing: canonicalTiming(value.timing),
    evidencePolicy: canonicalEvidencePolicy(value.evidencePolicy),
  })
}

function canonicalEnvelope(value: ControlPlaneExecutionEnvelope): string {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    contractVersion: value.contractVersion,
    identity: canonicalIdentity(value.identity),
    operation: {
      descriptor: canonicalDescriptor(value.operation.descriptor),
      input: canonicalOperationInput(value.operation.descriptor.code, value.operation.input),
    },
    timing: canonicalTiming(value.timing),
    evidencePolicy: canonicalEvidencePolicy(value.evidencePolicy),
    envelopeHash: value.envelopeHash,
  })
}

function assertRepositoryBinding(
  identity: ControlPlaneExecutionIdentity,
  code: OperationCode,
  input: ControlPlaneOperationInput,
): void {
  if (code === 'evidence.verify') return
  const repositoryInput = input as ProjectInspectionInput | WorkflowPhaseInput | WorkflowVerificationInput
  if (repositoryInput.repositoryId !== identity.repositoryId) contractError('INVALID_SHAPE', 'execution repository binding')
}

function assertEnvelopeSize(value: ControlPlaneExecutionEnvelope): void {
  if (utf8ByteLength(canonicalEnvelope(value)) > CONTROL_PLANE_MAX_ENVELOPE_BYTES) {
    contractError('LIMIT_EXCEEDED', 'execution envelope')
  }
}

function canonicalRegistryDescriptor(
  code: OperationCode,
  registry: readonly OperationDescriptor[],
): OperationDescriptor {
  const descriptor = registry.find((entry) => entry.code === code)
  if (!descriptor) contractError('UNKNOWN_OPERATION', 'execution operation')
  return descriptor
}

export function createControlPlaneExecutionEnvelope(
  value: ControlPlaneExecutionEnvelopeInput,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneExecutionEnvelope {
  assertPlainDataRecord(value, 'execution envelope input')
  exactKeys(value, EXECUTION_ENVELOPE_INPUT_KEYS, 'execution envelope input')
  const identity = validateExecutionIdentity(value.identity)
  if (typeof value.operationCode !== 'string' || !OPERATION_SET.has(value.operationCode)) {
    contractError('UNKNOWN_OPERATION', 'execution operation')
  }
  const timing = validateExecutionTiming(value.timing)
  const evidencePolicy = validateEvidencePolicy(value.evidencePolicy)
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  const descriptor = canonicalRegistryDescriptor(value.operationCode, registry)
  const input = validateControlPlaneOperationInput(descriptor.code, value.operationInput)
  assertRepositoryBinding(identity, descriptor.code, input)
  const withoutHash: Omit<ControlPlaneExecutionEnvelope, 'envelopeHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    identity,
    operation: { descriptor, input },
    timing,
    evidencePolicy,
  }
  const envelope = deepFreeze({ ...withoutHash, envelopeHash: hashCanonical(port, canonicalEnvelopePayload(withoutHash)) })
  assertEnvelopeSize(envelope)
  return envelope
}

export function validateControlPlaneExecutionEnvelope(
  value: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): ControlPlaneExecutionEnvelope {
  assertPlainDataRecord(value, 'execution envelope')
  exactKeys(value, EXECUTION_ENVELOPE_KEYS, 'execution envelope')
  if (value.schemaVersion !== CONTROL_PLANE_SCHEMA_VERSION || value.contractVersion !== CONTROL_PLANE_CONTRACT_VERSION) {
    contractError('UNSUPPORTED_VERSION', 'execution envelope')
  }
  const identity = validateExecutionIdentity(value.identity)
  assertPlainDataRecord(value.operation, 'execution operation')
  exactKeys(value.operation, EXECUTION_OPERATION_KEYS, 'execution operation')
  const candidateDescriptor = validateDescriptorShape(value.operation.descriptor)
  const registry = validateControlPlaneOperationRegistry(registryInput, port)
  const descriptor = canonicalRegistryDescriptor(candidateDescriptor.code, registry)
  if (JSON.stringify(canonicalDescriptor(candidateDescriptor)) !== JSON.stringify(canonicalDescriptor(descriptor))) {
    contractError('CONTRACT_HASH_MISMATCH', 'execution operation')
  }
  const input = validateControlPlaneOperationInput(descriptor.code, value.operation.input)
  assertRepositoryBinding(identity, descriptor.code, input)
  const timing = validateExecutionTiming(value.timing)
  const evidencePolicy = validateEvidencePolicy(value.evidencePolicy)
  assertLowerHash(value.envelopeHash, 'execution envelope')
  const withoutHash: Omit<ControlPlaneExecutionEnvelope, 'envelopeHash'> = {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
    identity,
    operation: { descriptor, input },
    timing,
    evidencePolicy,
  }
  const computed = hashCanonical(port, canonicalEnvelopePayload(withoutHash))
  if (computed !== value.envelopeHash) contractError('CONTRACT_HASH_MISMATCH', 'execution envelope')
  const envelope = deepFreeze({ ...withoutHash, envelopeHash: value.envelopeHash })
  assertEnvelopeSize(envelope)
  return envelope
}

export function serializeControlPlaneExecutionEnvelope(
  value: unknown,
  registryInput: unknown,
  port: ControlPlaneHashPort,
): string {
  return canonicalEnvelope(validateControlPlaneExecutionEnvelope(value, registryInput, port))
}
