import { createHash, timingSafeEqual } from 'node:crypto'
import {
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'

export const C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION = 1 as const
export const C5B_CATALOG_ACL_PROBE_POLICY_VERSION = 'p17-016-c5b-catalog-acl-probe-v1' as const

export type C5BCatalogAclProbeScalar = string | number | boolean | null
export type C5BCatalogAclProbeRow = Readonly<Record<string, C5BCatalogAclProbeScalar>>

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

type HashDomain = 'catalog' | 'acl' | 'rpc' | 'policy' | 'extension'

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
  readonly canonical: Readonly<Record<HashDomain, readonly string[]>>
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
const ROW_KEY = /^[a-z][a-z0-9_]{0,63}$/
const HASH = /^[0-9a-f]{64}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const MAX_SERVER_VERSION_NUM = 999_999
const MIN_SERVER_VERSION_NUM = 100_000
const MAX_ROWS_PER_DOMAIN = 1_000_000
const MAX_ROW_BYTES = 65_536
const MAX_TOTAL_BYTES = 16 * 1024 * 1024
const MAX_TIMEOUT_MS = 300_000
const MAX_FIELDS_PER_ROW = 64

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
  return Number.isSafeInteger(value)
    && (value as number) >= MIN_SERVER_VERSION_NUM
    && (value as number) <= MAX_SERVER_VERSION_NUM
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

function exactArray(value: unknown, maximumLength: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  const length = value.length
  if (!Number.isSafeInteger(length) || length > maximumLength) return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) return false
  const expected = Array.from({ length }, (_, index) => String(index)).concat('length').sort()
  const actual = (ownKeys as string[]).sort()
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return false
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor) || lengthDescriptor.enumerable) return false
  return Array.from({ length }, (_, index) => String(index)).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return !!descriptor && 'value' in descriptor && descriptor.enumerable === true
  })
}

function scalar(value: unknown): value is C5BCatalogAclProbeScalar {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isSafeInteger(value) && !Object.is(value, -0)
  if (typeof value !== 'string') return false
  return value.normalize('NFC') === value && !CONTROL.test(value)
}

function canonicalRow(value: unknown, maxRowBytes: number): { text: string; bytes: Buffer } {
  if (!isRecord(value)) throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length === 0 || ownKeys.length > MAX_FIELDS_PER_ROW
    || ownKeys.some((key) => typeof key !== 'string' || !ROW_KEY.test(key))) {
    throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  }
  const keys = (ownKeys as string[]).sort()
  const canonical: Record<string, C5BCatalogAclProbeScalar> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true || !scalar(descriptor.value)) {
      throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
    }
    if (typeof descriptor.value === 'string'
      && (descriptor.value.length > maxRowBytes || Buffer.byteLength(descriptor.value, 'utf8') > maxRowBytes)) {
      throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
    }
    canonical[key] = descriptor.value
  }
  const text = JSON.stringify(canonical)
  if (text.length > maxRowBytes || Buffer.byteLength(text, 'utf8') > maxRowBytes) {
    throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  }
  const bytes = Buffer.from(text, 'utf8')
  return { text, bytes }
}

function canonicalRows(
  value: unknown,
  maximumRows: number,
  maxRowBytes: number,
  total: { bytes: number },
  maxTotalBytes: number,
): readonly string[] {
  if (!exactArray(value, maximumRows)) {
    throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  }
  const rows: Array<{ text: string; bytes: Buffer }> = []
  total.bytes += 2
  if (total.bytes > maxTotalBytes) throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
  for (let index = 0; index < value.length; index += 1) {
    const row = canonicalRow(value[index], maxRowBytes)
    total.bytes += row.bytes.byteLength + (index === 0 ? 0 : 1)
    if (total.bytes > maxTotalBytes) throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
    rows.push(row)
  }
  rows.sort((left, right) => Buffer.compare(left.bytes, right.bytes))
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].text === rows[index].text) {
      throw new C5BCatalogAclProbeBoundaryError('provider_operation_refused')
    }
  }
  return Object.freeze(rows.map((row) => row.text))
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
  const total = { bytes: 0 }
  const maxRows = Math.min(factory.maxRowsPerDomain, packet.limits.maxObjectCount)
  const canonical = {} as Record<HashDomain, readonly string[]>
  for (const domain of HASH_DOMAINS) {
    canonical[domain] = canonicalRows(
      ownDataValue(value, domain), maxRows, factory.maxRowBytes, total, factory.maxTotalBytes,
    )
  }
  const migrationRows = canonicalRows(
    ownDataValue(value, COUNT_DOMAINS[0]),
    Math.min(factory.maxMigrationObjects, packet.limits.maxObjectCount),
    factory.maxRowBytes,
    total,
    factory.maxTotalBytes,
  )
  const writerRows = canonicalRows(
    ownDataValue(value, COUNT_DOMAINS[1]),
    Math.min(factory.maxWriterActivities, packet.limits.maxObjectCount),
    factory.maxRowBytes,
    total,
    factory.maxTotalBytes,
  )
  return Object.freeze({
    serverVersionNum: observedServerVersion,
    canonical: Object.freeze(canonical),
    migrationObjectCount: migrationRows.length,
    writerActivityCount: writerRows.length,
  })
}

function domainHash(domain: HashDomain, rows: readonly string[], serverVersionNum: number): string {
  const parsedRows = rows.map((row) => JSON.parse(row) as C5BCatalogAclProbeRow)
  const transcript = domain === 'catalog'
    ? {
      schemaVersion: C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION,
      policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
      domain,
      serverVersionNum,
      rows: parsedRows,
    }
    : {
      schemaVersion: C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION,
      policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
      domain,
      rows: parsedRows,
    }
  return createHash('sha256').update(JSON.stringify(transcript), 'utf8').digest('hex')
}

function sameHash(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
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

function passed(parsed: ParsedObservation, hashes: Record<HashDomain, string>): C5BPortDecision {
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
        const hashes = {} as Record<HashDomain, string>
        for (const domain of HASH_DOMAINS) {
          hashes[domain] = domainHash(domain, parsed.canonical[domain], parsed.serverVersionNum)
        }
        if (!sameHash(hashes.catalog, factory.expected.catalogHash)
          || !sameHash(hashes.acl, factory.expected.aclHash)
          || !sameHash(hashes.rpc, factory.expected.rpcHash)
          || !sameHash(hashes.policy, factory.expected.policyHash)
          || !sameHash(hashes.extension, factory.expected.extensionHash)) {
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
