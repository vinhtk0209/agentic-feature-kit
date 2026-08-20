import {
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BOperationReceipt,
  type C5BPreflightPacket,
  type C5BReasonCode,
  type C5BSourceBinding,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'
import {
  canonicalizeC5BCatalogAclRows,
  createC5BCatalogAclTranscriptBudget,
  hashC5BCatalogAclDomain,
  isC5BCatalogAclServerVersion,
  sameC5BCatalogAclHash,
} from './live-cutover-catalog-acl-transcript'

export const C5B_RESTORED_STATE_VERIFICATION_SCHEMA_VERSION = 1 as const

export interface C5BRestoredStateVerificationConfig {
  readonly expectedRollbackTestIds: readonly string[]
  readonly maxRowsPerDomain: number
  readonly maxRowBytes: number
  readonly maxTotalBytes: number
  readonly maxRollbackTests: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BRestoredStateMetadataRequest {
  readonly attemptId: string
  readonly packetHash: string
  readonly environmentClass: C5BEnvironmentClass
  readonly sourceBackupSha256: string
  readonly restoreManifestSha256: string
  readonly signal: AbortSignal
}

export interface C5BRestoredStateRollbackRequest extends C5BRestoredStateMetadataRequest {
  readonly expectedTestIds: readonly string[]
}

export interface C5BRestoredStateVerificationSources {
  readonly metadataCapability: {
    readonly readRestoredStateMetadata: (request: C5BRestoredStateMetadataRequest) => Promise<unknown>
  }
  readonly rollbackCapability: {
    readonly runRestoredStateRollbackSuite: (request: C5BRestoredStateRollbackRequest) => Promise<unknown>
  }
}

export interface C5BRestoredStateVerificationNodePorts {
  readonly verifyRestoredState: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

interface ValidatedFactory {
  readonly expectedRollbackTestIds: readonly string[]
  readonly maxRowsPerDomain: number
  readonly maxRowBytes: number
  readonly maxTotalBytes: number
  readonly maxRollbackTests: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly readMetadata: (request: C5BRestoredStateMetadataRequest) => Promise<unknown>
  readonly runRollback: (request: C5BRestoredStateRollbackRequest) => Promise<unknown>
}

interface Admission {
  readonly packet: C5BPreflightPacket
  readonly receipts: readonly C5BOperationReceipt[]
  readonly sourceBackupSha256: string
  readonly restoreManifestSha256: string
  readonly expectedCatalogHash: string
  readonly expectedAclHash: string
}

interface ParsedMetadata {
  readonly catalogHash: string
  readonly aclHash: string
}

interface ParsedRollback {
  readonly startedAt: string
  readonly completedAt: string
}

const CONFIG_KEYS = [
  'expectedRollbackTestIds', 'maxRowsPerDomain', 'maxRowBytes', 'maxTotalBytes',
  'maxRollbackTests', 'timeoutMs', 'now',
] as const
const SOURCE_KEYS = ['metadataCapability', 'rollbackCapability'] as const
const METADATA_CAPABILITY_KEYS = ['readRestoredStateMetadata'] as const
const ROLLBACK_CAPABILITY_KEYS = ['runRestoredStateRollbackSuite'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const METADATA_KEYS = ['serverVersionNum', 'catalog', 'acl', 'source'] as const
const SOURCE_BINDING_KEYS = [
  'migration0018Sha256', 'migration0019Sha256', 'rollback0018Sha256', 'rollback0019Sha256',
] as const
const ROLLBACK_KEYS = [
  'schemaVersion', 'attemptId', 'packetHash', 'sourceBackupSha256', 'restoreManifestSha256',
  'startedAt', 'completedAt', 'tests',
] as const
const TEST_KEYS = ['id', 'passed'] as const
const TEST_ID = /^[a-z][a-z0-9_]{2,63}$/
const HASH = /^[0-9a-f]{64}$/
const MAX_ROWS_PER_DOMAIN = 1_000_000
const MAX_ROW_BYTES = 65_536
const MAX_TOTAL_BYTES = 16 * 1024 * 1024
const MAX_ROLLBACK_TESTS = 1_000
const MAX_TIMEOUT_MS = 300_000

class C5BRestoredStateVerificationConfigurationError extends Error {
  constructor() {
    super('C5B restored-state verification configuration refused')
    this.name = 'C5BRestoredStateVerificationConfigurationError'
  }
}

class C5BRestoredStateVerificationBoundaryError extends Error {
  constructor() {
    super('C5B restored-state verification boundary refused')
    this.name = 'C5BRestoredStateVerificationBoundaryError'
  }
}

function configurationRefused(): never {
  throw new C5BRestoredStateVerificationConfigurationError()
}

function boundaryRefused(): never {
  throw new C5BRestoredStateVerificationBoundaryError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactDataRecord(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) return false
  const actual = (ownKeys as string[]).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
    && wanted.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return !!descriptor && 'value' in descriptor && descriptor.enumerable === true
    })
}

function ownDataValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function exactArray(value: unknown, maximumLength: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  const length = value.length
  if (!Number.isSafeInteger(length) || length > maximumLength) return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) return false
  const expected = Array.from({ length }, (_item, index) => String(index)).concat('length').sort()
  const actual = (ownKeys as string[]).sort()
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return false
  const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!descriptor || !('value' in descriptor) || descriptor.enumerable) return false
  return Array.from({ length }, (_item, index) => String(index)).every((key) => {
    const item = Object.getOwnPropertyDescriptor(value, key)
    return !!item && 'value' in item && item.enumerable === true
  })
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateFactory(
  config: C5BRestoredStateVerificationConfig,
  sources: C5BRestoredStateVerificationSources,
): ValidatedFactory {
  try {
    if (!exactDataRecord(config, CONFIG_KEYS) || !exactDataRecord(sources, SOURCE_KEYS)) configurationRefused()
    const metadataCapability = ownDataValue(sources, 'metadataCapability')
    const rollbackCapability = ownDataValue(sources, 'rollbackCapability')
    if (!exactDataRecord(metadataCapability, METADATA_CAPABILITY_KEYS)
      || !exactDataRecord(rollbackCapability, ROLLBACK_CAPABILITY_KEYS)
      || metadataCapability === rollbackCapability) configurationRefused()
    const readMetadata = ownDataValue(metadataCapability, 'readRestoredStateMetadata')
    const runRollback = ownDataValue(rollbackCapability, 'runRestoredStateRollbackSuite')
    if (typeof readMetadata !== 'function' || typeof runRollback !== 'function' || readMetadata === runRollback) {
      configurationRefused()
    }
    const maxRowsPerDomain = ownDataValue(config, 'maxRowsPerDomain')
    const maxRowBytes = ownDataValue(config, 'maxRowBytes')
    const maxTotalBytes = ownDataValue(config, 'maxTotalBytes')
    const maxRollbackTests = ownDataValue(config, 'maxRollbackTests')
    const timeoutMs = ownDataValue(config, 'timeoutMs')
    const now = ownDataValue(config, 'now')
    const expectedIds = ownDataValue(config, 'expectedRollbackTestIds')
    if (!positiveSafeInteger(maxRowsPerDomain, MAX_ROWS_PER_DOMAIN)
      || !positiveSafeInteger(maxRowBytes, MAX_ROW_BYTES)
      || !positiveSafeInteger(maxTotalBytes, MAX_TOTAL_BYTES)
      || !positiveSafeInteger(maxRollbackTests, MAX_ROLLBACK_TESTS)
      || !positiveSafeInteger(timeoutMs, MAX_TIMEOUT_MS)
      || typeof now !== 'function'
      || !exactArray(expectedIds, maxRollbackTests)
      || expectedIds.length === 0
      || !expectedIds.every((id) => typeof id === 'string' && TEST_ID.test(id))
      || expectedIds.some((id, index) => index > 0 && compareText(expectedIds[index - 1] as string, id as string) >= 0)) {
      configurationRefused()
    }
    return Object.freeze({
      expectedRollbackTestIds: Object.freeze([...(expectedIds as string[])]),
      maxRowsPerDomain,
      maxRowBytes,
      maxTotalBytes,
      maxRollbackTests,
      timeoutMs,
      now: now as () => string,
      readMetadata: readMetadata as ValidatedFactory['readMetadata'],
      runRollback: runRollback as ValidatedFactory['runRollback'],
    })
  } catch (error) {
    if (error instanceof C5BRestoredStateVerificationConfigurationError) throw error
    configurationRefused()
  }
}

function stringEvidence(receipt: C5BOperationReceipt, key: string): string | null {
  if (!exactDataRecord(receipt.evidence, Object.keys(receipt.evidence ?? {}))) return null
  const value = ownDataValue(receipt.evidence as Record<string, unknown>, key)
  return typeof value === 'string' && HASH.test(value) ? value : null
}

function admit(value: unknown): Admission | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const receiptValues = ownDataValue(value, 'receipts')
    if (!Array.isArray(receiptValues) || receiptValues.length !== 6) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    const prefix = evaluateC5BPreflightPrefix(packet, receiptValues)
    if (!prefix.ok || prefix.statusCode !== 'continue' || prefix.nextOperation !== 'verify_restored_state') return null
    const receipts = receiptValues as C5BOperationReceipt[]
    const sourceBackupSha256 = stringEvidence(receipts[5], 'sourceBackupSha256')
    const restoreManifestSha256 = stringEvidence(receipts[5], 'restoreManifestSha256')
    const expectedCatalogHash = stringEvidence(receipts[1], 'catalogHash')
    const expectedAclHash = stringEvidence(receipts[1], 'aclHash')
    if (!sourceBackupSha256 || !restoreManifestSha256 || !expectedCatalogHash || !expectedAclHash) return null
    return Object.freeze({
      packet,
      receipts: Object.freeze([...receipts]),
      sourceBackupSha256,
      restoreManifestSha256,
      expectedCatalogHash,
      expectedAclHash,
    })
  } catch {
    return null
  }
}

function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function parseMetadata(
  value: unknown,
  factory: ValidatedFactory,
  admission: Admission,
): ParsedMetadata {
  if (!exactDataRecord(value, METADATA_KEYS)) boundaryRefused()
  const serverVersionNum = ownDataValue(value, 'serverVersionNum')
  if (!isC5BCatalogAclServerVersion(serverVersionNum)) boundaryRefused()
  const budget = createC5BCatalogAclTranscriptBudget(factory.maxTotalBytes)
  const maxRows = Math.min(factory.maxRowsPerDomain, admission.packet.limits.maxObjectCount)
  const catalog = canonicalizeC5BCatalogAclRows(
    ownDataValue(value, 'catalog'), maxRows, factory.maxRowBytes, budget,
  )
  const acl = canonicalizeC5BCatalogAclRows(
    ownDataValue(value, 'acl'), maxRows, factory.maxRowBytes, budget,
  )
  const catalogHash = hashC5BCatalogAclDomain('catalog', catalog, serverVersionNum)
  const aclHash = hashC5BCatalogAclDomain('acl', acl, serverVersionNum)
  if (!sameC5BCatalogAclHash(catalogHash, admission.expectedCatalogHash)
    || !sameC5BCatalogAclHash(aclHash, admission.expectedAclHash)) boundaryRefused()

  const source = ownDataValue(value, 'source')
  if (!exactDataRecord(source, SOURCE_BINDING_KEYS)) boundaryRefused()
  for (const key of SOURCE_BINDING_KEYS) {
    const observed = ownDataValue(source, key)
    const expected = admission.packet.source[key as keyof C5BSourceBinding]
    if (!sameC5BCatalogAclHash(observed, expected)) boundaryRefused()
  }
  return Object.freeze({ catalogHash, aclHash })
}

function parseRollback(value: unknown, factory: ValidatedFactory, admission: Admission): ParsedRollback {
  if (!exactDataRecord(value, ROLLBACK_KEYS)
    || ownDataValue(value, 'schemaVersion') !== C5B_RESTORED_STATE_VERIFICATION_SCHEMA_VERSION
    || ownDataValue(value, 'attemptId') !== admission.packet.attemptId
    || ownDataValue(value, 'packetHash') !== admission.packet.packetHash
    || !sameC5BCatalogAclHash(ownDataValue(value, 'sourceBackupSha256'), admission.sourceBackupSha256)
    || !sameC5BCatalogAclHash(ownDataValue(value, 'restoreManifestSha256'), admission.restoreManifestSha256)) {
    boundaryRefused()
  }
  const startedAt = ownDataValue(value, 'startedAt')
  const completedAt = ownDataValue(value, 'completedAt')
  const tests = ownDataValue(value, 'tests')
  if (!validInstant(startedAt) || !validInstant(completedAt)
    || !exactArray(tests, factory.maxRollbackTests)
    || tests.length !== factory.expectedRollbackTestIds.length) boundaryRefused()
  for (let index = 0; index < tests.length; index += 1) {
    const test = tests[index]
    if (!exactDataRecord(test, TEST_KEYS)
      || ownDataValue(test, 'id') !== factory.expectedRollbackTestIds[index]
      || ownDataValue(test, 'passed') !== true) boundaryRefused()
  }
  return Object.freeze({ startedAt, completedAt })
}

function request(admission: Admission, signal: AbortSignal): C5BRestoredStateMetadataRequest {
  return Object.freeze({
    attemptId: admission.packet.attemptId,
    packetHash: admission.packet.packetHash,
    environmentClass: admission.packet.environmentClass,
    sourceBackupSha256: admission.sourceBackupSha256,
    restoreManifestSha256: admission.restoreManifestSha256,
    signal,
  })
}

async function withinDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new C5BRestoredStateVerificationBoundaryError())
    }, timeoutMs)
  })
  try {
    const result = await Promise.race([operation(controller.signal), expired])
    if (controller.signal.aborted) boundaryRefused()
    return result
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

function passed(metadata: ParsedMetadata, packet: C5BPreflightPacket): C5BPortDecision {
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({
      catalogHash: metadata.catalogHash,
      aclHash: metadata.aclHash,
      sourceBindingHash: packet.sourceBindingHash,
      sourceParity: true,
      rollbackSuitePassed: true,
    }),
  })
}

export function createC5BRestoredStateVerificationNodePorts(
  config: C5BRestoredStateVerificationConfig,
  sources: C5BRestoredStateVerificationSources,
): C5BRestoredStateVerificationNodePorts {
  const factory = validateFactory(config, sources)
  let consumed = false

  return Object.freeze({
    async verifyRestoredState(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const admission = admit(contextValue)
      if (!admission || consumed) return refused('operation_sequence_invalid')
      consumed = true
      try {
        let startedAt: string
        try {
          startedAt = factory.now()
        } catch {
          boundaryRefused()
        }
        if (!validInstant(startedAt)
          || Date.parse(startedAt) < Date.parse(admission.packet.freezeStartsAt)
          || Date.parse(startedAt) >= Date.parse(admission.packet.freezeExpiresAt)) boundaryRefused()
        const remainingMs = Date.parse(admission.packet.freezeExpiresAt) - Date.parse(startedAt)
        const timeoutMs = Math.min(factory.timeoutMs, admission.packet.limits.maxStepDurationMs, remainingMs)
        if (timeoutMs <= 0) boundaryRefused()

        const result = await withinDeadline(timeoutMs, async (signal) => {
          const baseRequest = request(admission, signal)
          const rawMetadata = await factory.readMetadata(baseRequest)
          if (signal.aborted) boundaryRefused()
          const parsedMetadata = parseMetadata(rawMetadata, factory, admission)
          const rawRollback = await factory.runRollback(Object.freeze({
            ...baseRequest,
            expectedTestIds: factory.expectedRollbackTestIds,
          }))
          if (signal.aborted) boundaryRefused()
          return Object.freeze({
            metadata: parsedMetadata,
            rollback: parseRollback(rawRollback, factory, admission),
          })
        })

        let completedAt: string
        try {
          completedAt = factory.now()
        } catch {
          boundaryRefused()
        }
        if (!validInstant(completedAt)
          || Date.parse(completedAt) < Date.parse(startedAt)
          || Date.parse(completedAt) > Date.parse(admission.packet.freezeExpiresAt)
          || Date.parse(result.rollback.startedAt) < Date.parse(startedAt)
          || Date.parse(result.rollback.completedAt) < Date.parse(result.rollback.startedAt)
          || Date.parse(result.rollback.completedAt) > Date.parse(completedAt)
          || Date.parse(result.rollback.startedAt) < Date.parse(admission.packet.freezeStartsAt)
          || Date.parse(result.rollback.completedAt) > Date.parse(admission.packet.freezeExpiresAt)) boundaryRefused()
        return passed(result.metadata, admission.packet)
      } catch {
        return refused('restored_state_mismatch')
      }
    },
  })
}
