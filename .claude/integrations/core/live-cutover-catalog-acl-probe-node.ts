import {
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'
import {
  canonicalizeC5BCatalogAclRows,
  createC5BCatalogAclTranscriptBudget,
  hashC5BCatalogAclDomain,
  isC5BCatalogAclServerVersion,
  sameC5BCatalogAclHash,
  type C5BCatalogAclHashDomain,
  type C5BCatalogAclProbeRow,
  type C5BCatalogAclProbeScalar,
} from './live-cutover-catalog-acl-transcript'

export {
  C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
  C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION,
} from './live-cutover-catalog-acl-transcript'
export type {
  C5BCatalogAclProbeRow,
  C5BCatalogAclProbeScalar,
} from './live-cutover-catalog-acl-transcript'

export interface C5BCatalogAclProbeObservation {
  readonly serverVersionNum: number
  readonly catalog: readonly C5BCatalogAclProbeRow[]
  readonly acl: readonly C5BCatalogAclProbeRow[]
  readonly rpc: readonly C5BCatalogAclProbeRow[]
  readonly policy: readonly C5BCatalogAclProbeRow[]
  readonly extension: readonly C5BCatalogAclProbeRow[]
  readonly migrationObject: readonly C5BCatalogAclProbeRow[]
  readonly writerActivity: readonly C5BCatalogAclProbeRow[]
}

export interface C5BCatalogAclProbeRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly sourceBindingHash: string
  readonly signal: AbortSignal
}

export interface C5BCatalogAclProbeSource {
  readonly readCatalogAclMetadata: (request: C5BCatalogAclProbeRequest) => Promise<unknown>
}

export interface C5BCatalogAclProbeExpectations {
  readonly serverVersionNum: number
  readonly catalogHash: string
  readonly aclHash: string
  readonly rpcHash: string
  readonly policyHash: string
  readonly extensionHash: string
}

export interface C5BCatalogAclProbeConfig {
  readonly expected: C5BCatalogAclProbeExpectations
  readonly maxRowsPerDomain: number
  readonly maxRowBytes: number
  readonly maxTotalBytes: number
  readonly maxMigrationObjects: number
  readonly maxWriterActivities: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BCatalogAclProbeNodePorts {
  readonly probeCatalogAcl: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

interface ValidatedFactory {
  readonly expected: C5BCatalogAclProbeExpectations
  readonly maxRowsPerDomain: number
  readonly maxRowBytes: number
  readonly maxTotalBytes: number
  readonly maxMigrationObjects: number
  readonly maxWriterActivities: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly readCatalogAclMetadata: C5BCatalogAclProbeSource['readCatalogAclMetadata']
}

interface ParsedObservation {
  readonly serverVersionNum: number
  readonly canonical: Readonly<Record<C5BCatalogAclHashDomain, readonly string[]>>
  readonly migrationObjectCount: number
  readonly writerActivityCount: number
}

const CONFIG_KEYS = [
  'expected', 'maxRowsPerDomain', 'maxRowBytes', 'maxTotalBytes',
  'maxMigrationObjects', 'maxWriterActivities', 'timeoutMs', 'now',
] as const
const EXPECTATION_KEYS = [
  'serverVersionNum', 'catalogHash', 'aclHash', 'rpcHash', 'policyHash', 'extensionHash',
] as const
const SOURCE_KEYS = ['readCatalogAclMetadata'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const OBSERVATION_KEYS = [
  'serverVersionNum', 'catalog', 'acl', 'rpc', 'policy', 'extension', 'migrationObject', 'writerActivity',
] as const
const HASH_DOMAINS = ['catalog', 'acl', 'rpc', 'policy', 'extension'] as const
const COUNT_DOMAINS = ['migrationObject', 'writerActivity'] as const
const HASH = /^[0-9a-f]{64}$/
const MAX_ROWS_PER_DOMAIN = 1_000_000
const MAX_ROW_BYTES = 65_536
const MAX_TOTAL_BYTES = 16 * 1024 * 1024
const MAX_TIMEOUT_MS = 300_000

class C5BCatalogAclProbeConfigurationError extends Error {
  constructor() {
    super('C5B catalog/ACL probe configuration refused')
    this.name = 'C5BCatalogAclProbeConfigurationError'
  }
}

class C5BCatalogAclProbeBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode

  constructor(reasonCode: C5BReasonCode) {
    super('C5B catalog/ACL probe boundary refused')
    this.name = 'C5BCatalogAclProbeBoundaryError'
    this.reasonCode = reasonCode
  }
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

function positiveSafeInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum
}

function serverVersion(value: unknown): value is number {
  return isC5BCatalogAclServerVersion(value)
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value)
}

function configurationRefused(): never {
  throw new C5BCatalogAclProbeConfigurationError()
}

function validateFactory(
  config: C5BCatalogAclProbeConfig,
  source: C5BCatalogAclProbeSource,
): ValidatedFactory {
  try {
    if (!exactDataRecord(config, CONFIG_KEYS) || !exactDataRecord(source, SOURCE_KEYS)) configurationRefused()
    const expectedValue = ownDataValue(config, 'expected')
    if (!exactDataRecord(expectedValue, EXPECTATION_KEYS)) configurationRefused()

    const expected = Object.freeze({
      serverVersionNum: ownDataValue(expectedValue, 'serverVersionNum'),
      catalogHash: ownDataValue(expectedValue, 'catalogHash'),
      aclHash: ownDataValue(expectedValue, 'aclHash'),
      rpcHash: ownDataValue(expectedValue, 'rpcHash'),
      policyHash: ownDataValue(expectedValue, 'policyHash'),
      extensionHash: ownDataValue(expectedValue, 'extensionHash'),
    })
    const maxRowsPerDomain = ownDataValue(config, 'maxRowsPerDomain')
    const maxRowBytes = ownDataValue(config, 'maxRowBytes')
    const maxTotalBytes = ownDataValue(config, 'maxTotalBytes')
    const maxMigrationObjects = ownDataValue(config, 'maxMigrationObjects')
    const maxWriterActivities = ownDataValue(config, 'maxWriterActivities')
    const timeoutMs = ownDataValue(config, 'timeoutMs')
    const now = ownDataValue(config, 'now')
    const readCatalogAclMetadata = ownDataValue(source, 'readCatalogAclMetadata')
    const expectedHashes = [
      expected.catalogHash, expected.aclHash, expected.rpcHash, expected.policyHash, expected.extensionHash,
    ]

    if (!serverVersion(expected.serverVersionNum)
      || !expectedHashes.every(sha256)
      || new Set(expectedHashes).size !== expectedHashes.length
      || !positiveSafeInteger(maxRowsPerDomain, MAX_ROWS_PER_DOMAIN)
      || !positiveSafeInteger(maxRowBytes, MAX_ROW_BYTES)
      || !positiveSafeInteger(maxTotalBytes, MAX_TOTAL_BYTES)
      || !positiveSafeInteger(maxMigrationObjects, MAX_ROWS_PER_DOMAIN)
      || !positiveSafeInteger(maxWriterActivities, MAX_ROWS_PER_DOMAIN)
      || !positiveSafeInteger(timeoutMs, MAX_TIMEOUT_MS)
      || typeof now !== 'function'
      || typeof readCatalogAclMetadata !== 'function') configurationRefused()

    return Object.freeze({
      expected: expected as C5BCatalogAclProbeExpectations,
      maxRowsPerDomain,
      maxRowBytes,
      maxTotalBytes,
      maxMigrationObjects,
      maxWriterActivities,
      timeoutMs,
      now: now as () => string,
      readCatalogAclMetadata: readCatalogAclMetadata as C5BCatalogAclProbeSource['readCatalogAclMetadata'],
    })
  } catch (error) {
    if (error instanceof C5BCatalogAclProbeConfigurationError) throw error
    configurationRefused()
  }
}

function parseObservation(
  value: unknown,
  factory: ValidatedFactory,
  packet: C5BPreflightPacket,
): ParsedObservation {
  if (!exactDataRecord(value, OBSERVATION_KEYS)) {
    throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  }
  const observedServerVersion = ownDataValue(value, 'serverVersionNum')
  if (!serverVersion(observedServerVersion)) {
    throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  }
  const total = createC5BCatalogAclTranscriptBudget(factory.maxTotalBytes)
  const maxRows = Math.min(factory.maxRowsPerDomain, packet.limits.maxObjectCount)
  const canonical = {} as Record<C5BCatalogAclHashDomain, readonly string[]>
  for (const domain of HASH_DOMAINS) {
    canonical[domain] = canonicalizeC5BCatalogAclRows(
      ownDataValue(value, domain), maxRows, factory.maxRowBytes, total,
    )
  }
  const migrationRows = canonicalizeC5BCatalogAclRows(
    ownDataValue(value, COUNT_DOMAINS[0]),
    Math.min(factory.maxMigrationObjects, packet.limits.maxObjectCount),
    factory.maxRowBytes,
    total,
  )
  const writerRows = canonicalizeC5BCatalogAclRows(
    ownDataValue(value, COUNT_DOMAINS[1]),
    Math.min(factory.maxWriterActivities, packet.limits.maxObjectCount),
    factory.maxRowBytes,
    total,
  )
  return Object.freeze({
    serverVersionNum: observedServerVersion,
    canonical: Object.freeze(canonical),
    migrationObjectCount: migrationRows.length,
    writerActivityCount: writerRows.length,
  })
}

function expectedPacket(value: unknown): C5BPreflightPacket | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const receipts = ownDataValue(value, 'receipts')
    if (!Array.isArray(receipts)) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    const prefix = evaluateC5BPreflightPrefix(packet, receipts)
    if (!prefix.ok || prefix.statusCode !== 'continue' || prefix.nextOperation !== 'probe_catalog_acl') return null
    return packet
  } catch {
    return null
  }
}

function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function passed(parsed: ParsedObservation, hashes: Record<C5BCatalogAclHashDomain, string>): C5BPortDecision {
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({
      catalogHash: hashes.catalog,
      aclHash: hashes.acl,
      rpcHash: hashes.rpc,
      policyHash: hashes.policy,
      extensionHash: hashes.extension,
      migrationObjectCount: parsed.migrationObjectCount,
      writerActivityCount: parsed.writerActivityCount,
    }),
  })
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

async function withinDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new C5BCatalogAclProbeBoundaryError('provider_operation_refused'))
    }, timeoutMs)
  })
  try {
    const result = await Promise.race([operation(controller.signal), expired])
    if (controller.signal.aborted) throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
    return result
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export function createC5BCatalogAclProbeNodePorts(
  config: C5BCatalogAclProbeConfig,
  source: C5BCatalogAclProbeSource,
): C5BCatalogAclProbeNodePorts {
  const factory = validateFactory(config, source)
  const consumedPacketHashes = new Set<string>()

  return Object.freeze({
    async probeCatalogAcl(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const packet = expectedPacket(contextValue)
      if (!packet || consumedPacketHashes.has(packet.packetHash)) return refused('operation_sequence_invalid')
      consumedPacketHashes.add(packet.packetHash)

      try {
        let startedAt: string
        try {
          startedAt = factory.now()
        } catch {
          return refused('provider_operation_refused')
        }
        if (!validInstant(startedAt)
          || Date.parse(startedAt) < Date.parse(packet.freezeStartsAt)
          || Date.parse(startedAt) > Date.parse(packet.freezeExpiresAt)) {
          return refused('freeze_window_invalid')
        }
        const remainingMs = Date.parse(packet.freezeExpiresAt) - Date.parse(startedAt)
        if (remainingMs <= 0) return refused('freeze_window_invalid')
        const effectiveTimeoutMs = Math.min(factory.timeoutMs, packet.limits.maxStepDurationMs, remainingMs)
        const raw = await withinDeadline(effectiveTimeoutMs, (signal) => factory.readCatalogAclMetadata(Object.freeze({
          attemptId: packet.attemptId,
          environmentClass: packet.environmentClass,
          sourceBindingHash: packet.sourceBindingHash,
          signal,
        })))
        const parsed = parseObservation(raw, factory, packet)
        if (parsed.serverVersionNum !== factory.expected.serverVersionNum) return refused('integrity_mismatch')
        const hashes = {} as Record<C5BCatalogAclHashDomain, string>
        for (const domain of HASH_DOMAINS) {
          hashes[domain] = hashC5BCatalogAclDomain(domain, parsed.canonical[domain], parsed.serverVersionNum)
        }
        if (!sameC5BCatalogAclHash(hashes.catalog, factory.expected.catalogHash)
          || !sameC5BCatalogAclHash(hashes.acl, factory.expected.aclHash)
          || !sameC5BCatalogAclHash(hashes.rpc, factory.expected.rpcHash)
          || !sameC5BCatalogAclHash(hashes.policy, factory.expected.policyHash)
          || !sameC5BCatalogAclHash(hashes.extension, factory.expected.extensionHash)) {
          return refused('integrity_mismatch')
        }
        let completedAt: string
        try {
          completedAt = factory.now()
        } catch {
          return refused('provider_operation_refused')
        }
        if (!validInstant(completedAt)
          || Date.parse(completedAt) < Date.parse(packet.freezeStartsAt)
          || Date.parse(completedAt) > Date.parse(packet.freezeExpiresAt)
          || Date.parse(completedAt) < Date.parse(startedAt)) {
          return refused('freeze_window_invalid')
        }
        return passed(parsed, hashes)
      } catch (error) {
        return refused(error instanceof C5BCatalogAclProbeBoundaryError
          ? error.reasonCode
          : 'provider_operation_refused')
      }
    },
  })
}
