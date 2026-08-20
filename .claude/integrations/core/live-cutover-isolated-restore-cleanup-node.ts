import { createHash } from 'node:crypto'
import {
  evaluateC5BPreflightPrefix,
  validateC5BOperationReceipt,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'

export const C5B_ISOLATED_RESTORE_CLEANUP_SCHEMA_VERSION = 1 as const
export const C5B_ISOLATED_RESTORE_CLEANUP_POLICY_VERSION = 'p17-016-c5b-isolated-restore-cleanup-v1' as const

export interface C5BIsolatedRestoreCleanupRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly sourceBackupSha256: string
  readonly restoreManifestSha256: string
  readonly freezeExpiresAt: string
  readonly signal: AbortSignal
}

export interface C5BIsolatedRestoreResidualRequest extends C5BIsolatedRestoreCleanupRequest {
  readonly cleanupToken: Uint8Array
}

export interface C5BIsolatedRestoreCleanupSource {
  readonly cleanupIsolatedRestore: (request: C5BIsolatedRestoreCleanupRequest) => Promise<unknown>
}

export interface C5BIsolatedRestoreObservationSource {
  readonly observeIsolatedRestoreResidual: (request: C5BIsolatedRestoreResidualRequest) => Promise<unknown>
}

export interface C5BIsolatedRestoreCleanupSources {
  readonly cleanupSource: C5BIsolatedRestoreCleanupSource
  readonly observationSource: C5BIsolatedRestoreObservationSource
}

export interface C5BIsolatedRestoreCleanupConfig {
  readonly expectedCleanupCapabilityId: string
  readonly maxCleanupTokenBytes: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BIsolatedRestoreCleanupNodePorts {
  readonly cleanupIsolatedRestore: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

interface ValidatedFactory {
  readonly expectedCleanupCapabilityId: string
  readonly maxCleanupTokenBytes: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly cleanupIsolatedRestore: C5BIsolatedRestoreCleanupSource['cleanupIsolatedRestore']
  readonly observeIsolatedRestoreResidual: C5BIsolatedRestoreObservationSource['observeIsolatedRestoreResidual']
}

interface AdmittedContext {
  readonly packet: C5BPreflightPacket
  readonly sourceBackupSha256: string
  readonly restoreManifestSha256: string
  readonly verificationCompletedAt: string
}

interface CleanupMaterial {
  readonly ownedToken: Uint8Array
}

const CONFIG_KEYS = ['expectedCleanupCapabilityId', 'maxCleanupTokenBytes', 'now', 'timeoutMs'] as const
const SOURCES_KEYS = ['cleanupSource', 'observationSource'] as const
const CLEANUP_SOURCE_KEYS = ['cleanupIsolatedRestore'] as const
const OBSERVATION_SOURCE_KEYS = ['observeIsolatedRestoreResidual'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const CLEANUP_RESULT_KEYS = [
  'attemptId',
  'cleanupCapabilityId',
  'cleanupConfirmed',
  'cleanupToken',
  'packetHash',
  'restoreManifestSha256',
  'sourceBackupSha256',
] as const
const OBSERVATION_RESULT_KEYS = [
  'attemptId',
  'cleanupCapabilityId',
  'cleanupConfirmed',
  'cleanupTokenSha256',
  'packetHash',
  'residualResourceCount',
  'restoreManifestSha256',
  'sourceBackupSha256',
] as const
const CAPABILITY_ID = /^[a-z][a-z0-9_]{2,63}$/
const SHA256 = /^[0-9a-f]{64}$/
const MAX_CLEANUP_TOKEN_BYTES = 4_096
const MAX_TIMEOUT_MS = 300_000

class C5BIsolatedRestoreCleanupConfigurationError extends Error {
  constructor() {
    super('C5B isolated-restore cleanup configuration refused')
    this.name = 'C5BIsolatedRestoreCleanupConfigurationError'
  }
}

class C5BIsolatedRestoreCleanupBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode

  constructor(reasonCode: C5BReasonCode) {
    super('C5B isolated-restore cleanup boundary refused')
    this.name = 'C5BIsolatedRestoreCleanupBoundaryError'
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

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function configurationRefused(): never {
  throw new C5BIsolatedRestoreCleanupConfigurationError()
}

function validateFactory(
  configValue: C5BIsolatedRestoreCleanupConfig,
  sourcesValue: C5BIsolatedRestoreCleanupSources,
): ValidatedFactory {
  try {
    if (!exactDataRecord(configValue, CONFIG_KEYS) || !exactDataRecord(sourcesValue, SOURCES_KEYS)) {
      return configurationRefused()
    }
    const expectedCleanupCapabilityId = ownDataValue(configValue, 'expectedCleanupCapabilityId')
    const maxCleanupTokenBytes = ownDataValue(configValue, 'maxCleanupTokenBytes')
    const timeoutMs = ownDataValue(configValue, 'timeoutMs')
    const now = ownDataValue(configValue, 'now')
    const cleanupSource = ownDataValue(sourcesValue, 'cleanupSource')
    const observationSource = ownDataValue(sourcesValue, 'observationSource')
    if (typeof expectedCleanupCapabilityId !== 'string' || !CAPABILITY_ID.test(expectedCleanupCapabilityId)
      || !positiveSafeInteger(maxCleanupTokenBytes, MAX_CLEANUP_TOKEN_BYTES)
      || !positiveSafeInteger(timeoutMs, MAX_TIMEOUT_MS)
      || typeof now !== 'function'
      || !exactDataRecord(cleanupSource, CLEANUP_SOURCE_KEYS)
      || !exactDataRecord(observationSource, OBSERVATION_SOURCE_KEYS)
      || Object.is(cleanupSource, observationSource)) return configurationRefused()

    const cleanupIsolatedRestore = ownDataValue(cleanupSource, 'cleanupIsolatedRestore')
    const observeIsolatedRestoreResidual = ownDataValue(observationSource, 'observeIsolatedRestoreResidual')
    if (typeof cleanupIsolatedRestore !== 'function'
      || typeof observeIsolatedRestoreResidual !== 'function'
      || Object.is(cleanupIsolatedRestore, observeIsolatedRestoreResidual)) return configurationRefused()

    return Object.freeze({
      expectedCleanupCapabilityId,
      maxCleanupTokenBytes,
      timeoutMs,
      now: now as () => string,
      cleanupIsolatedRestore: cleanupIsolatedRestore as ValidatedFactory['cleanupIsolatedRestore'],
      observeIsolatedRestoreResidual: observeIsolatedRestoreResidual as ValidatedFactory['observeIsolatedRestoreResidual'],
    })
  } catch (error) {
    if (error instanceof C5BIsolatedRestoreCleanupConfigurationError) throw error
    return configurationRefused()
  }
}

function admittedContext(value: unknown): AdmittedContext | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const rawReceipts = ownDataValue(value, 'receipts')
    if (!Array.isArray(rawReceipts) || rawReceipts.length !== 7) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    const prefix = evaluateC5BPreflightPrefix(packet, rawReceipts)
    if (!prefix.ok || prefix.statusCode !== 'continue'
      || prefix.nextOperation !== 'cleanup_isolated_restore') return null
    const restore = validateC5BOperationReceipt(rawReceipts[5], packet)
    const verification = validateC5BOperationReceipt(rawReceipts[6], packet)
    const sourceBackupSha256 = restore.evidence?.sourceBackupSha256
    const restoreManifestSha256 = restore.evidence?.restoreManifestSha256
    if (restore.operation !== 'restore_isolated_backup' || restore.status !== 'passed'
      || verification.operation !== 'verify_restored_state' || verification.status !== 'passed'
      || typeof sourceBackupSha256 !== 'string' || !SHA256.test(sourceBackupSha256)
      || typeof restoreManifestSha256 !== 'string' || !SHA256.test(restoreManifestSha256)) return null
    return Object.freeze({
      packet,
      sourceBackupSha256,
      restoreManifestSha256,
      verificationCompletedAt: verification.completedAt,
    })
  } catch {
    return null
  }
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

function passed(): C5BPortDecision {
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({ cleanupConfirmed: true, residualResourceCount: 0 }),
  })
}

function zeroize(value: Uint8Array | null): void {
  if (value) value.fill(0)
}

function zeroizeTokenFromUnknown(value: unknown): void {
  try {
    if (!isRecord(value)) return
    const descriptor = Object.getOwnPropertyDescriptor(value, 'cleanupToken')
    if (descriptor && 'value' in descriptor && descriptor.value instanceof Uint8Array) {
      descriptor.value.fill(0)
    }
  } catch {
    // Best-effort cleanup protects late or malformed provider material without changing the result.
  }
}

function request(admitted: AdmittedContext, signal: AbortSignal): C5BIsolatedRestoreCleanupRequest {
  return Object.freeze({
    attemptId: admitted.packet.attemptId,
    environmentClass: admitted.packet.environmentClass,
    packetHash: admitted.packet.packetHash,
    sourceBackupSha256: admitted.sourceBackupSha256,
    restoreManifestSha256: admitted.restoreManifestSha256,
    freezeExpiresAt: admitted.packet.freezeExpiresAt,
    signal,
  })
}

function validateCleanup(
  factory: ValidatedFactory,
  admitted: AdmittedContext,
  value: unknown,
): CleanupMaterial {
  let rawToken: Uint8Array | null = null
  try {
    if (isRecord(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'cleanupToken')
      if (descriptor && 'value' in descriptor && descriptor.value instanceof Uint8Array) {
        rawToken = descriptor.value
      }
    }
    if (!exactDataRecord(value, CLEANUP_RESULT_KEYS)) throw new Error('shape')
    const cleanupToken = ownDataValue(value, 'cleanupToken')
    if (ownDataValue(value, 'cleanupCapabilityId') !== factory.expectedCleanupCapabilityId
      || ownDataValue(value, 'attemptId') !== admitted.packet.attemptId
      || ownDataValue(value, 'packetHash') !== admitted.packet.packetHash
      || ownDataValue(value, 'sourceBackupSha256') !== admitted.sourceBackupSha256
      || ownDataValue(value, 'restoreManifestSha256') !== admitted.restoreManifestSha256
      || ownDataValue(value, 'cleanupConfirmed') !== true
      || !(cleanupToken instanceof Uint8Array)
      || Object.getPrototypeOf(cleanupToken) !== Uint8Array.prototype
      || !(cleanupToken.buffer instanceof ArrayBuffer)
      || cleanupToken.byteLength < 1
      || cleanupToken.byteLength > factory.maxCleanupTokenBytes) throw new Error('binding')
    return Object.freeze({ ownedToken: Uint8Array.from(cleanupToken) })
  } catch {
    throw new C5BIsolatedRestoreCleanupBoundaryError('cleanup_incomplete')
  } finally {
    zeroize(rawToken)
  }
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function validateObservation(
  factory: ValidatedFactory,
  admitted: AdmittedContext,
  expectedTokenHash: string,
  value: unknown,
): void {
  try {
    if (!exactDataRecord(value, OBSERVATION_RESULT_KEYS)
      || ownDataValue(value, 'cleanupCapabilityId') !== factory.expectedCleanupCapabilityId
      || ownDataValue(value, 'attemptId') !== admitted.packet.attemptId
      || ownDataValue(value, 'packetHash') !== admitted.packet.packetHash
      || ownDataValue(value, 'sourceBackupSha256') !== admitted.sourceBackupSha256
      || ownDataValue(value, 'restoreManifestSha256') !== admitted.restoreManifestSha256
      || ownDataValue(value, 'cleanupTokenSha256') !== expectedTokenHash
      || ownDataValue(value, 'cleanupConfirmed') !== true
      || ownDataValue(value, 'residualResourceCount') !== 0) throw new Error('residual')
  } catch {
    throw new C5BIsolatedRestoreCleanupBoundaryError('cleanup_incomplete')
  }
}

function trustedNow(factory: ValidatedFactory): string {
  try {
    const value = factory.now()
    if (!canonicalTimestamp(value)) throw new Error('time')
    return value
  } catch {
    throw new C5BIsolatedRestoreCleanupBoundaryError('freeze_window_invalid')
  }
}

function remainingTimeout(factory: ValidatedFactory, packet: C5BPreflightPacket, now: string): number {
  const current = Date.parse(now)
  const start = Date.parse(packet.freezeStartsAt)
  const end = Date.parse(packet.freezeExpiresAt)
  const remaining = end - current
  if (current < start || current >= end || remaining <= 0) {
    throw new C5BIsolatedRestoreCleanupBoundaryError('freeze_window_invalid')
  }
  return Math.min(factory.timeoutMs, packet.limits.maxStepDurationMs, remaining)
}

function laterTime(factory: ValidatedFactory, admitted: AdmittedContext, previous: string): string {
  const value = trustedNow(factory)
  if (Date.parse(value) < Date.parse(previous)) {
    throw new C5BIsolatedRestoreCleanupBoundaryError('freeze_window_invalid')
  }
  remainingTimeout(factory, admitted.packet, value)
  return value
}

export function createC5BIsolatedRestoreCleanupNodePorts(
  configValue: C5BIsolatedRestoreCleanupConfig,
  sourcesValue: C5BIsolatedRestoreCleanupSources,
): C5BIsolatedRestoreCleanupNodePorts {
  const factory = validateFactory(configValue, sourcesValue)
  let terminal = false

  return Object.freeze({
    async cleanupIsolatedRestore(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const admitted = admittedContext(contextValue)
      if (!admitted || terminal) return refused('operation_sequence_invalid')
      terminal = true

      let ownedToken: Uint8Array | null = null
      let observationToken: Uint8Array | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      const controller = new AbortController()
      try {
        const startedAt = trustedNow(factory)
        if (Date.parse(startedAt) < Date.parse(admitted.verificationCompletedAt)) {
          throw new C5BIsolatedRestoreCleanupBoundaryError('freeze_window_invalid')
        }
        const timeoutMs = remainingTimeout(factory, admitted.packet, startedAt)
        let timedOut = false
        const operation = Promise.resolve().then(async () => {
          const rawCleanup = await factory.cleanupIsolatedRestore(request(admitted, controller.signal))
          if (controller.signal.aborted) {
            zeroizeTokenFromUnknown(rawCleanup)
            throw new C5BIsolatedRestoreCleanupBoundaryError('cleanup_incomplete')
          }
          const material = validateCleanup(factory, admitted, rawCleanup)
          ownedToken = material.ownedToken
          const afterCleanup = laterTime(factory, admitted, startedAt)
          const expectedTokenHash = digest(ownedToken)
          observationToken = Uint8Array.from(ownedToken)
          const rawObservation = await factory.observeIsolatedRestoreResidual(Object.freeze({
            ...request(admitted, controller.signal),
            cleanupToken: observationToken,
          }))
          if (controller.signal.aborted) {
            throw new C5BIsolatedRestoreCleanupBoundaryError('cleanup_incomplete')
          }
          laterTime(factory, admitted, afterCleanup)
          validateObservation(factory, admitted, expectedTokenHash, rawObservation)
          return passed()
        })
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            controller.abort()
            zeroize(ownedToken)
            zeroize(observationToken)
            reject(new C5BIsolatedRestoreCleanupBoundaryError('cleanup_incomplete'))
          }, timeoutMs)
        })
        try {
          return await Promise.race([operation, timeout])
        } catch (error) {
          if (timedOut) operation.then(() => undefined, () => undefined)
          throw error
        }
      } catch (error) {
        return refused(error instanceof C5BIsolatedRestoreCleanupBoundaryError
          ? error.reasonCode
          : 'cleanup_incomplete')
      } finally {
        if (timer) clearTimeout(timer)
        controller.abort()
        zeroize(ownedToken)
        zeroize(observationToken)
      }
    },
  })
}
