import crypto from 'node:crypto'
import {
  evaluateC5BPreflightPrefix,
  validateC5BOperationReceipt,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'

export const C5B_PROVIDER_RECOVERY_POINT_SCHEMA_VERSION = 1 as const
export const C5B_PROVIDER_RECOVERY_POINT_POLICY_VERSION = 'p17-016-c5b-provider-recovery-point-v1' as const

export interface C5BProviderRecoveryPointCreateRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly signal: AbortSignal
}

export interface C5BProviderRecoveryPointObserveRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly correlationToken: Uint8Array
  readonly signal: AbortSignal
}

export interface C5BProviderRecoveryPointCreationSource {
  readonly createProviderRecoveryPoint: (request: C5BProviderRecoveryPointCreateRequest) => Promise<unknown>
}

export interface C5BProviderRecoveryPointObservationSource {
  readonly observeProviderRecoveryPoint: (request: C5BProviderRecoveryPointObserveRequest) => Promise<unknown>
}

export interface C5BProviderRecoveryPointSources {
  readonly creationSource: C5BProviderRecoveryPointCreationSource
  readonly observationSource: C5BProviderRecoveryPointObservationSource
}

export interface C5BProviderRecoveryPointConfig {
  readonly expectedProviderCapabilityId: string
  readonly maxCorrelationTokenBytes: number
  readonly minRetentionMs: number
  readonly maxRetentionMs: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BProviderRecoveryPointNodePorts {
  readonly createProviderRecoveryPoint: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

interface ValidatedFactory {
  readonly expectedProviderCapabilityId: string
  readonly maxCorrelationTokenBytes: number
  readonly minRetentionMs: number
  readonly maxRetentionMs: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly createProviderRecoveryPoint: C5BProviderRecoveryPointCreationSource['createProviderRecoveryPoint']
  readonly observeProviderRecoveryPoint: C5BProviderRecoveryPointObservationSource['observeProviderRecoveryPoint']
}

interface AdmittedContext {
  readonly packet: C5BPreflightPacket
  readonly freezeCompletedAt: string
}

interface RecoveryObservation {
  readonly providerCapabilityId: string
  readonly attemptId: string
  readonly packetHash: string
  readonly recoveryPointCreated: true
  readonly restorable: true
  readonly createdAt: string
  readonly expiresAt: string
}

interface CorrelationMaterial {
  readonly raw: Uint8Array
  readonly owned: Uint8Array
}

const CONFIG_KEYS = [
  'expectedProviderCapabilityId', 'maxCorrelationTokenBytes', 'maxRetentionMs',
  'minRetentionMs', 'now', 'timeoutMs',
] as const
const SOURCES_KEYS = ['creationSource', 'observationSource'] as const
const CREATION_SOURCE_KEYS = ['createProviderRecoveryPoint'] as const
const OBSERVATION_SOURCE_KEYS = ['observeProviderRecoveryPoint'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const CREATE_RESULT_KEYS = ['correlationToken'] as const
const OBSERVATION_KEYS = [
  'attemptId', 'createdAt', 'expiresAt', 'packetHash', 'providerCapabilityId',
  'recoveryPointCreated', 'restorable',
] as const
const MAX_CORRELATION_TOKEN_BYTES = 4_096
const MAX_TIMEOUT_MS = 300_000
const MAX_RETENTION_MS = 31_536_000_000
const MAX_METADATA_BYTES = 2_048
const METADATA_DOMAIN = 'agentic-feature-kit/c5b/provider-recovery-metadata/v1\0'
const CAPABILITY_ID = /^[a-z][a-z0-9-]{2,63}$/

class C5BProviderRecoveryPointConfigurationError extends Error {
  constructor() {
    super('C5B provider-recovery-point configuration refused')
    this.name = 'C5BProviderRecoveryPointConfigurationError'
  }
}

class C5BProviderRecoveryPointBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode

  constructor(reasonCode: C5BReasonCode) {
    super('C5B provider-recovery-point boundary refused')
    this.name = 'C5BProviderRecoveryPointBoundaryError'
    this.reasonCode = reasonCode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactDataRecord(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string')) return false
  const actual = (keys as string[]).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) return false
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor !== undefined && 'value' in descriptor && descriptor.enumerable
  })
}

function ownDataValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor)) throw new C5BProviderRecoveryPointConfigurationError()
  return descriptor.value
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function validateFactory(
  configValue: C5BProviderRecoveryPointConfig,
  sourcesValue: C5BProviderRecoveryPointSources,
): ValidatedFactory {
  try {
    if (!exactDataRecord(configValue, CONFIG_KEYS) || !exactDataRecord(sourcesValue, SOURCES_KEYS)) {
      throw new C5BProviderRecoveryPointConfigurationError()
    }
    const expectedProviderCapabilityId = ownDataValue(configValue, 'expectedProviderCapabilityId')
    const maxCorrelationTokenBytes = ownDataValue(configValue, 'maxCorrelationTokenBytes')
    const minRetentionMs = ownDataValue(configValue, 'minRetentionMs')
    const maxRetentionMs = ownDataValue(configValue, 'maxRetentionMs')
    const timeoutMs = ownDataValue(configValue, 'timeoutMs')
    const now = ownDataValue(configValue, 'now')
    if (typeof expectedProviderCapabilityId !== 'string' || !CAPABILITY_ID.test(expectedProviderCapabilityId)
      || !integer(maxCorrelationTokenBytes, 1, MAX_CORRELATION_TOKEN_BYTES)
      || !integer(minRetentionMs, 1, MAX_RETENTION_MS)
      || !integer(maxRetentionMs, minRetentionMs, MAX_RETENTION_MS)
      || !integer(timeoutMs, 1, MAX_TIMEOUT_MS)
      || typeof now !== 'function') throw new C5BProviderRecoveryPointConfigurationError()

    const creationSource = ownDataValue(sourcesValue, 'creationSource')
    const observationSource = ownDataValue(sourcesValue, 'observationSource')
    if (!exactDataRecord(creationSource, CREATION_SOURCE_KEYS)
      || !exactDataRecord(observationSource, OBSERVATION_SOURCE_KEYS)
      || creationSource === observationSource) throw new C5BProviderRecoveryPointConfigurationError()
    const createProviderRecoveryPoint = ownDataValue(creationSource, 'createProviderRecoveryPoint')
    const observeProviderRecoveryPoint = ownDataValue(observationSource, 'observeProviderRecoveryPoint')
    if (typeof createProviderRecoveryPoint !== 'function'
      || typeof observeProviderRecoveryPoint !== 'function'
      || createProviderRecoveryPoint === observeProviderRecoveryPoint) {
      throw new C5BProviderRecoveryPointConfigurationError()
    }
    return Object.freeze({
      expectedProviderCapabilityId,
      maxCorrelationTokenBytes,
      minRetentionMs,
      maxRetentionMs,
      timeoutMs,
      now: now as () => string,
      createProviderRecoveryPoint: createProviderRecoveryPoint as ValidatedFactory['createProviderRecoveryPoint'],
      observeProviderRecoveryPoint: observeProviderRecoveryPoint as ValidatedFactory['observeProviderRecoveryPoint'],
    })
  } catch (error) {
    if (error instanceof C5BProviderRecoveryPointConfigurationError) throw error
    throw new C5BProviderRecoveryPointConfigurationError()
  }
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

function passed(observation: RecoveryObservation): C5BPortDecision {
  const metadata = JSON.stringify({
    schemaVersion: C5B_PROVIDER_RECOVERY_POINT_SCHEMA_VERSION,
    providerCapabilityId: observation.providerCapabilityId,
    attemptId: observation.attemptId,
    packetHash: observation.packetHash,
    recoveryPointCreated: observation.recoveryPointCreated,
    restorable: observation.restorable,
    createdAt: observation.createdAt,
    expiresAt: observation.expiresAt,
  })
  if (Buffer.byteLength(metadata, 'utf8') > MAX_METADATA_BYTES) {
    throw new C5BProviderRecoveryPointBoundaryError('provider_operation_refused')
  }
  const recoveryPointMetadataHash = crypto.createHash('sha256')
    .update(METADATA_DOMAIN, 'utf8')
    .update(metadata, 'utf8')
    .digest('hex')
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({
      recoveryPointCreated: true,
      recoveryPointMetadataHash,
      expiresAt: observation.expiresAt,
    }),
  })
}

function admittedContext(value: unknown): AdmittedContext | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const rawReceipts = ownDataValue(value, 'receipts')
    if (!Array.isArray(rawReceipts) || rawReceipts.length !== 3) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    const prefix = evaluateC5BPreflightPrefix(packet, rawReceipts)
    if (!prefix.ok || prefix.statusCode !== 'continue'
      || prefix.nextOperation !== 'create_provider_recovery_point') return null
    const freeze = validateC5BOperationReceipt(rawReceipts[2], packet)
    if (freeze.operation !== 'freeze_writers' || freeze.status !== 'passed') return null
    return Object.freeze({ packet, freezeCompletedAt: freeze.completedAt })
  } catch {
    return null
  }
}

function trustedNow(factory: ValidatedFactory): string {
  let value: string
  try {
    value = factory.now()
  } catch {
    throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
  }
  if (!canonicalTimestamp(value)) throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
  return value
}

function transitionTimeout(factory: ValidatedFactory, packet: C5BPreflightPacket, now: string): number {
  const current = Date.parse(now)
  const start = Date.parse(packet.freezeStartsAt)
  const end = Date.parse(packet.freezeExpiresAt)
  const remaining = end - current
  if (current < start || current >= end || remaining <= 0) {
    throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
  }
  return Math.min(factory.timeoutMs, packet.limits.maxStepDurationMs, remaining)
}

function zeroize(value: Uint8Array): void {
  value.fill(0)
}

function cleanupLateCreate(value: unknown): void {
  try {
    if (!exactDataRecord(value, CREATE_RESULT_KEYS)) return
    const token = ownDataValue(value, 'correlationToken')
    if (token instanceof Uint8Array) zeroize(token)
  } catch {
    // Late cleanup is deliberately best-effort and cannot alter the closed public result.
  }
}

async function withinDeadline<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  onLate?: (value: T) => void,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const operation = Promise.resolve().then(() => run(controller.signal))
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new C5BProviderRecoveryPointBoundaryError('provider_operation_refused'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } catch (error) {
    if (timedOut && onLate) operation.then(onLate, () => undefined)
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function transferCorrelation(value: unknown, maximumBytes: number): CorrelationMaterial | null {
  if (!exactDataRecord(value, CREATE_RESULT_KEYS)) return null
  const raw = ownDataValue(value, 'correlationToken')
  if (!(raw instanceof Uint8Array)
    || Object.getPrototypeOf(raw) !== Uint8Array.prototype
    || raw.byteLength < 1
    || raw.byteLength > maximumBytes
    || (typeof SharedArrayBuffer !== 'undefined' && raw.buffer instanceof SharedArrayBuffer)) return null
  const owned = Uint8Array.from(raw)
  zeroize(raw)
  return { raw, owned }
}

function createRequest(packet: C5BPreflightPacket, signal: AbortSignal): C5BProviderRecoveryPointCreateRequest {
  return Object.freeze({
    attemptId: packet.attemptId,
    environmentClass: packet.environmentClass,
    packetHash: packet.packetHash,
    freezeExpiresAt: packet.freezeExpiresAt,
    signal,
  })
}

async function observe(
  factory: ValidatedFactory,
  admitted: AdmittedContext,
  ownedToken: Uint8Array,
  startedAt: string,
): Promise<RecoveryObservation> {
  const transitionStartedAt = trustedNow(factory)
  if (Date.parse(transitionStartedAt) < Date.parse(startedAt)) {
    throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
  }
  const timeoutMs = transitionTimeout(factory, admitted.packet, transitionStartedAt)
  const requestToken = Uint8Array.from(ownedToken)
  let raw: unknown
  try {
    raw = await withinDeadline(timeoutMs, (signal) => factory.observeProviderRecoveryPoint(Object.freeze({
      attemptId: admitted.packet.attemptId,
      environmentClass: admitted.packet.environmentClass,
      packetHash: admitted.packet.packetHash,
      freezeExpiresAt: admitted.packet.freezeExpiresAt,
      correlationToken: requestToken,
      signal,
    })))
  } finally {
    zeroize(requestToken)
  }
  const completedAt = trustedNow(factory)
  if (Date.parse(completedAt) < Date.parse(transitionStartedAt)) {
    throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
  }
  transitionTimeout(factory, admitted.packet, completedAt)
  return validateObservation(factory, admitted, raw, completedAt)
}

function validateObservation(
  factory: ValidatedFactory,
  admitted: AdmittedContext,
  value: unknown,
  completedAt: string,
): RecoveryObservation {
  try {
    if (!exactDataRecord(value, OBSERVATION_KEYS)) throw new Error('shape')
    const providerCapabilityId = ownDataValue(value, 'providerCapabilityId')
    const attemptId = ownDataValue(value, 'attemptId')
    const packetHash = ownDataValue(value, 'packetHash')
    const recoveryPointCreated = ownDataValue(value, 'recoveryPointCreated')
    const restorable = ownDataValue(value, 'restorable')
    const createdAt = ownDataValue(value, 'createdAt')
    const expiresAt = ownDataValue(value, 'expiresAt')
    if (providerCapabilityId !== factory.expectedProviderCapabilityId
      || attemptId !== admitted.packet.attemptId
      || packetHash !== admitted.packet.packetHash
      || recoveryPointCreated !== true
      || restorable !== true
      || !canonicalTimestamp(createdAt)
      || !canonicalTimestamp(expiresAt)) throw new Error('binding')
    const createdMs = Date.parse(createdAt)
    const expiresMs = Date.parse(expiresAt)
    const retentionMs = expiresMs - createdMs
    if (createdMs < Date.parse(admitted.freezeCompletedAt)
      || createdMs > Date.parse(completedAt)
      || expiresMs <= Date.parse(admitted.packet.freezeExpiresAt)
      || retentionMs < factory.minRetentionMs
      || retentionMs > factory.maxRetentionMs) throw new Error('time')
    return Object.freeze({
      providerCapabilityId,
      attemptId,
      packetHash,
      recoveryPointCreated: true,
      restorable: true,
      createdAt,
      expiresAt,
    })
  } catch {
    throw new C5BProviderRecoveryPointBoundaryError('provider_operation_refused')
  }
}

export function createC5BProviderRecoveryPointNodePorts(
  config: C5BProviderRecoveryPointConfig,
  sources: C5BProviderRecoveryPointSources,
): C5BProviderRecoveryPointNodePorts {
  const factory = validateFactory(config, sources)
  let terminal = false
  let inFlight = false

  return Object.freeze({
    async createProviderRecoveryPoint(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const admitted = admittedContext(contextValue)
      if (!admitted || terminal || inFlight) return refused('operation_sequence_invalid')
      terminal = true
      inFlight = true
      let rawToken: Uint8Array | null = null
      let ownedToken: Uint8Array | null = null
      try {
        const startedAt = trustedNow(factory)
        if (Date.parse(startedAt) < Date.parse(admitted.freezeCompletedAt)) {
          throw new C5BProviderRecoveryPointBoundaryError('freeze_window_invalid')
        }
        const timeoutMs = transitionTimeout(factory, admitted.packet, startedAt)
        const raw = await withinDeadline(
          timeoutMs,
          (signal) => factory.createProviderRecoveryPoint(createRequest(admitted.packet, signal)),
          cleanupLateCreate,
        )
        const material = transferCorrelation(raw, factory.maxCorrelationTokenBytes)
        if (!material) throw new C5BProviderRecoveryPointBoundaryError('provider_operation_refused')
        rawToken = material.raw
        ownedToken = material.owned
        const observed = await observe(factory, admitted, ownedToken, startedAt)
        return passed(observed)
      } catch (error) {
        return refused(error instanceof C5BProviderRecoveryPointBoundaryError
          ? error.reasonCode
          : 'provider_operation_refused')
      } finally {
        if (rawToken) zeroize(rawToken)
        if (ownedToken) zeroize(ownedToken)
        inFlight = false
      }
    },
  })
}
