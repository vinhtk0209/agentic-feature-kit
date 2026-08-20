import {
  C5B_OPERATIONS,
  evaluateC5BPreflightPrefix,
  validateC5BOperationReceipt,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'

export const C5B_WRITER_FREEZE_SCHEMA_VERSION = 1 as const
export const C5B_WRITER_FREEZE_POLICY_VERSION = 'p17-016-c5b-writer-freeze-v1' as const

export interface C5BWriterFreezeAcquireRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly signal: AbortSignal
}

export interface C5BWriterFreezeObservationRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly leaseToken: Uint8Array
  readonly signal: AbortSignal
}

export interface C5BWriterFreezeReleaseRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly leaseToken: Uint8Array
  readonly signal: AbortSignal
}

export interface C5BWriterFreezeControlSource {
  readonly acquireWriterFreeze: (request: C5BWriterFreezeAcquireRequest) => Promise<unknown>
  readonly releaseWriterFreeze: (request: C5BWriterFreezeReleaseRequest) => Promise<unknown>
}

export interface C5BWriterFreezeObservationSource {
  readonly observeWriterFreeze: (request: C5BWriterFreezeObservationRequest) => Promise<unknown>
}

export interface C5BWriterFreezeSources {
  readonly controlSource: C5BWriterFreezeControlSource
  readonly observationSource: C5BWriterFreezeObservationSource
}

export interface C5BWriterFreezeConfig {
  readonly maxLeaseTokenBytes: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BWriterFreezeNodePorts {
  readonly freezeWriters: (context: C5BOperatorContext) => Promise<C5BPortDecision>
  readonly unfreezeWriters: (context: C5BOperatorContext) => Promise<Readonly<{ unfreezeConfirmed: boolean }>>
}

interface ValidatedFactory {
  readonly maxLeaseTokenBytes: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly acquireWriterFreeze: C5BWriterFreezeControlSource['acquireWriterFreeze']
  readonly releaseWriterFreeze: C5BWriterFreezeControlSource['releaseWriterFreeze']
  readonly observeWriterFreeze: C5BWriterFreezeObservationSource['observeWriterFreeze']
}

interface ActiveSession {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly packetHash: string
  readonly freezeExpiresAt: string
  readonly leaseToken: Uint8Array
  expiryTimer: ReturnType<typeof setTimeout> | null
  releaseAttempted: boolean
}

interface FreezeObservation {
  readonly freezeActive: boolean
  readonly activeWriterCount: number
  readonly leaseExpiresAt: string
}

const CONFIG_KEYS = ['maxLeaseTokenBytes', 'now', 'timeoutMs'] as const
const SOURCES_KEYS = ['controlSource', 'observationSource'] as const
const CONTROL_KEYS = ['acquireWriterFreeze', 'releaseWriterFreeze'] as const
const OBSERVATION_SOURCE_KEYS = ['observeWriterFreeze'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const ACQUIRE_RESULT_KEYS = ['leaseExpiresAt', 'leaseToken'] as const
const OBSERVATION_RESULT_KEYS = ['activeWriterCount', 'freezeActive', 'leaseExpiresAt'] as const
const RELEASE_RESULT_KEYS = ['releaseConfirmed'] as const
const MAX_LEASE_TOKEN_BYTES = 4_096
const MAX_TIMEOUT_MS = 300_000
const MAX_ACTIVE_WRITERS = 1_000_000

class C5BWriterFreezeConfigurationError extends Error {
  constructor() {
    super('C5B writer-freeze configuration refused')
    this.name = 'C5BWriterFreezeConfigurationError'
  }
}

class C5BWriterFreezeBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode

  constructor(reasonCode: C5BReasonCode) {
    super('C5B writer-freeze boundary refused')
    this.name = 'C5BWriterFreezeBoundaryError'
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

function boundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ACTIVE_WRITERS
}

function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function configurationRefused(): never {
  throw new C5BWriterFreezeConfigurationError()
}

function validateFactory(config: C5BWriterFreezeConfig, sources: C5BWriterFreezeSources): ValidatedFactory {
  try {
    if (!exactDataRecord(config, CONFIG_KEYS)
      || !positiveSafeInteger(ownDataValue(config, 'maxLeaseTokenBytes'), MAX_LEASE_TOKEN_BYTES)
      || !positiveSafeInteger(ownDataValue(config, 'timeoutMs'), MAX_TIMEOUT_MS)
      || typeof ownDataValue(config, 'now') !== 'function'
      || !exactDataRecord(sources, SOURCES_KEYS)) configurationRefused()

    const control = ownDataValue(sources, 'controlSource')
    const observation = ownDataValue(sources, 'observationSource')
    if (!exactDataRecord(control, CONTROL_KEYS)
      || !exactDataRecord(observation, OBSERVATION_SOURCE_KEYS)) configurationRefused()

    const acquireWriterFreeze = ownDataValue(control, 'acquireWriterFreeze')
    const releaseWriterFreeze = ownDataValue(control, 'releaseWriterFreeze')
    const observeWriterFreeze = ownDataValue(observation, 'observeWriterFreeze')
    if (typeof acquireWriterFreeze !== 'function'
      || typeof releaseWriterFreeze !== 'function'
      || typeof observeWriterFreeze !== 'function'
      || Object.is(control, observation)
      || Object.is(acquireWriterFreeze, releaseWriterFreeze)
      || Object.is(acquireWriterFreeze, observeWriterFreeze)
      || Object.is(releaseWriterFreeze, observeWriterFreeze)) configurationRefused()

    return Object.freeze({
      maxLeaseTokenBytes: ownDataValue(config, 'maxLeaseTokenBytes') as number,
      timeoutMs: ownDataValue(config, 'timeoutMs') as number,
      now: ownDataValue(config, 'now') as () => string,
      acquireWriterFreeze: acquireWriterFreeze as C5BWriterFreezeControlSource['acquireWriterFreeze'],
      releaseWriterFreeze: releaseWriterFreeze as C5BWriterFreezeControlSource['releaseWriterFreeze'],
      observeWriterFreeze: observeWriterFreeze as C5BWriterFreezeObservationSource['observeWriterFreeze'],
    })
  } catch (error) {
    if (error instanceof C5BWriterFreezeConfigurationError) throw error
    return configurationRefused()
  }
}

function zeroize(value: Uint8Array | null): void {
  if (value) value.fill(0)
}

function currentAttemptSession(holder: Readonly<{ current: ActiveSession | null }>): ActiveSession | null {
  return holder.current
}

function clearSessionMaterial(session: ActiveSession): void {
  if (session.expiryTimer !== null) {
    clearTimeout(session.expiryTimer)
    session.expiryTimer = null
  }
  zeroize(session.leaseToken)
}

function transferredLease(value: unknown, maximum: number, expectedExpiry: string): Uint8Array | null {
  let rawToken: Uint8Array | null = null
  try {
    if (!exactDataRecord(value, ACQUIRE_RESULT_KEYS)) return null
    const candidate = ownDataValue(value, 'leaseToken')
    const expiry = ownDataValue(value, 'leaseExpiresAt')
    if (candidate instanceof Uint8Array) rawToken = candidate
    if (!(candidate instanceof Uint8Array)
      || !(candidate.buffer instanceof ArrayBuffer)
      || candidate.byteLength === 0
      || candidate.byteLength > maximum
      || !validInstant(expiry)
      || expiry !== expectedExpiry) return null
    return new Uint8Array(candidate)
  } catch {
    return null
  } finally {
    zeroize(rawToken)
  }
}

function observation(value: unknown, expectedExpiry: string): FreezeObservation | null {
  try {
    if (!exactDataRecord(value, OBSERVATION_RESULT_KEYS)) return null
    const freezeActive = ownDataValue(value, 'freezeActive')
    const activeWriterCount = ownDataValue(value, 'activeWriterCount')
    const leaseExpiresAt = ownDataValue(value, 'leaseExpiresAt')
    if (typeof freezeActive !== 'boolean'
      || !boundedCount(activeWriterCount)
      || !validInstant(leaseExpiresAt)
      || leaseExpiresAt !== expectedExpiry) return null
    return Object.freeze({ freezeActive, activeWriterCount, leaseExpiresAt })
  } catch {
    return null
  }
}

function releaseConfirmed(value: unknown): boolean {
  try {
    return exactDataRecord(value, RELEASE_RESULT_KEYS) && ownDataValue(value, 'releaseConfirmed') === true
  } catch {
    return false
  }
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

function passed(): C5BPortDecision {
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({ freezeConfirmed: true, activeWriterCount: 0 }),
  })
}

function unfreezeResult(unfreezeConfirmed: boolean): Readonly<{ unfreezeConfirmed: boolean }> {
  return Object.freeze({ unfreezeConfirmed })
}

function expectedFreezePacket(value: unknown): C5BPreflightPacket | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const receipts = ownDataValue(value, 'receipts')
    if (!Array.isArray(receipts)) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    const prefix = evaluateC5BPreflightPrefix(packet, receipts)
    if (!prefix.ok || prefix.statusCode !== 'continue' || prefix.nextOperation !== 'freeze_writers') return null
    return packet
  } catch {
    return null
  }
}

function expectedUnfreezePacket(value: unknown, session: ActiveSession): C5BPreflightPacket | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS)) return null
    const receiptValues = ownDataValue(value, 'receipts')
    if (!Array.isArray(receiptValues) || receiptValues.length < 3 || receiptValues.length > 8) return null
    const packet = validateC5BPreflightPacket(ownDataValue(value, 'packet'))
    if (packet.packetHash !== session.packetHash
      || packet.attemptId !== session.attemptId
      || packet.environmentClass !== session.environmentClass
      || packet.freezeExpiresAt !== session.freezeExpiresAt) return null

    const prefix = evaluateC5BPreflightPrefix(packet, receiptValues.slice(0, 3))
    if (!prefix.ok || prefix.statusCode !== 'continue'
      || prefix.nextOperation !== 'create_provider_recovery_point') return null

    let previousCompletedAt: string | null = null
    for (let index = 0; index < receiptValues.length; index += 1) {
      const receipt = validateC5BOperationReceipt(receiptValues[index], packet)
      if (receipt.sequence !== index || receipt.operation !== C5B_OPERATIONS[index]) return null
      if (Date.parse(receipt.startedAt) < Date.parse(packet.freezeStartsAt)
        || Date.parse(receipt.completedAt) > Date.parse(packet.freezeExpiresAt)
        || (previousCompletedAt !== null && Date.parse(receipt.startedAt) < Date.parse(previousCompletedAt))) return null
      previousCompletedAt = receipt.completedAt
    }
    return packet
  } catch {
    return null
  }
}

function trustedStart(factory: ValidatedFactory, packet: C5BPreflightPacket): { startedAt: string; timeoutMs: number } {
  let startedAt: string
  try {
    startedAt = factory.now()
  } catch {
    throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
  }
  if (!validInstant(startedAt)
    || Date.parse(startedAt) < Date.parse(packet.freezeStartsAt)
    || Date.parse(startedAt) >= Date.parse(packet.freezeExpiresAt)) {
    throw new C5BWriterFreezeBoundaryError('freeze_window_invalid')
  }
  const remainingMs = Date.parse(packet.freezeExpiresAt) - Date.parse(startedAt)
  const timeoutMs = Math.min(factory.timeoutMs, packet.limits.maxStepDurationMs, remainingMs)
  if (timeoutMs <= 0) throw new C5BWriterFreezeBoundaryError('freeze_window_invalid')
  return { startedAt, timeoutMs }
}

function trustedCompletion(factory: ValidatedFactory, packet: C5BPreflightPacket, startedAt: string): void {
  let completedAt: string
  try {
    completedAt = factory.now()
  } catch {
    throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
  }
  if (!validInstant(completedAt)
    || Date.parse(completedAt) < Date.parse(startedAt)
    || Date.parse(completedAt) > Date.parse(packet.freezeExpiresAt)) {
    throw new C5BWriterFreezeBoundaryError('freeze_window_invalid')
  }
}

async function withinDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new C5BWriterFreezeBoundaryError('provider_operation_refused'))
    }, timeoutMs)
  })
  try {
    const result = await Promise.race([operation(controller.signal), expired])
    if (controller.signal.aborted) throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
    return result
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function acquireRequest(packet: C5BPreflightPacket, signal: AbortSignal): C5BWriterFreezeAcquireRequest {
  return Object.freeze({
    attemptId: packet.attemptId,
    environmentClass: packet.environmentClass,
    packetHash: packet.packetHash,
    freezeExpiresAt: packet.freezeExpiresAt,
    signal,
  })
}

async function withLeaseRequest<T>(
  session: ActiveSession,
  signal: AbortSignal,
  operation: (leaseToken: Uint8Array) => Promise<T>,
): Promise<T> {
  const leaseToken = new Uint8Array(session.leaseToken)
  try {
    return await operation(leaseToken)
  } finally {
    zeroize(leaseToken)
  }
}

function observationRequest(
  session: ActiveSession,
  leaseToken: Uint8Array,
  signal: AbortSignal,
): C5BWriterFreezeObservationRequest {
  return Object.freeze({
    attemptId: session.attemptId,
    environmentClass: session.environmentClass,
    packetHash: session.packetHash,
    freezeExpiresAt: session.freezeExpiresAt,
    leaseToken,
    signal,
  })
}

function releaseRequest(
  session: ActiveSession,
  leaseToken: Uint8Array,
  signal: AbortSignal,
): C5BWriterFreezeReleaseRequest {
  return Object.freeze({
    attemptId: session.attemptId,
    environmentClass: session.environmentClass,
    packetHash: session.packetHash,
    freezeExpiresAt: session.freezeExpiresAt,
    leaseToken,
    signal,
  })
}

async function observe(
  factory: ValidatedFactory,
  session: ActiveSession,
  signal: AbortSignal,
): Promise<FreezeObservation | null> {
  return withLeaseRequest(session, signal, async (leaseToken) => observation(
    await factory.observeWriterFreeze(observationRequest(session, leaseToken, signal)),
    session.freezeExpiresAt,
  ))
}

async function releaseSession(
  factory: ValidatedFactory,
  packet: C5BPreflightPacket,
  session: ActiveSession,
): Promise<boolean> {
  try {
    const { startedAt, timeoutMs } = trustedStart(factory, packet)
    const result = await withinDeadline(timeoutMs, async (signal) => {
      let released = false
      try {
        released = await withLeaseRequest(session, signal, async (leaseToken) => releaseConfirmed(
          await factory.releaseWriterFreeze(releaseRequest(session, leaseToken, signal)),
        ))
      } catch {
        released = false
      }
      const observed = await observe(factory, session, signal)
      return released && observed !== null && observed.freezeActive === false
    })
    trustedCompletion(factory, packet, startedAt)
    return result
  } catch {
    return false
  }
}

export function createC5BWriterFreezeNodePorts(
  config: C5BWriterFreezeConfig,
  sources: C5BWriterFreezeSources,
): C5BWriterFreezeNodePorts {
  const factory = validateFactory(config, sources)
  const consumedPacketHashes = new Set<string>()
  const activeSession: { current: ActiveSession | null } = { current: null }
  let leaseStateUncertain = false

  return Object.freeze({
    async freezeWriters(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const packet = expectedFreezePacket(contextValue)
      if (!packet || consumedPacketHashes.has(packet.packetHash) || activeSession.current !== null || leaseStateUncertain) {
        return refused('operation_sequence_invalid')
      }
      consumedPacketHashes.add(packet.packetHash)

      let refusalReason: C5BReasonCode = 'provider_operation_refused'
      let acquireAttempted = false
      const attemptSession: { current: ActiveSession | null } = { current: null }
      try {
        const { startedAt, timeoutMs } = trustedStart(factory, packet)
        await withinDeadline(timeoutMs, async (signal) => {
          acquireAttempted = true
          const raw = await factory.acquireWriterFreeze(acquireRequest(packet, signal))
          const leaseToken = transferredLease(raw, factory.maxLeaseTokenBytes, packet.freezeExpiresAt)
          if (!leaseToken) throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
          if (signal.aborted) {
            zeroize(leaseToken)
            throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
          }
          const session: ActiveSession = {
            attemptId: packet.attemptId,
            environmentClass: packet.environmentClass,
            packetHash: packet.packetHash,
            freezeExpiresAt: packet.freezeExpiresAt,
            leaseToken,
            expiryTimer: null,
            releaseAttempted: false,
          }
          attemptSession.current = session
          activeSession.current = session
          const remainingLeaseMs = Date.parse(packet.freezeExpiresAt) - Date.parse(startedAt)
          session.expiryTimer = setTimeout(() => {
            clearSessionMaterial(session)
            if (activeSession.current === session) activeSession.current = null
          }, remainingLeaseMs)
          session.expiryTimer.unref?.()
          const observed = await observe(factory, session, signal)
          if (!observed) throw new C5BWriterFreezeBoundaryError('provider_operation_refused')
          if (!observed.freezeActive || observed.activeWriterCount !== 0) {
            throw new C5BWriterFreezeBoundaryError('writer_activity_detected')
          }
        })
        const completedSession = currentAttemptSession(attemptSession)
        const liveSession = currentAttemptSession(activeSession)
        if (!completedSession || liveSession !== completedSession || completedSession.expiryTimer === null) {
          throw new C5BWriterFreezeBoundaryError('freeze_window_invalid')
        }
        trustedCompletion(factory, packet, startedAt)
        const stillLiveSession = currentAttemptSession(activeSession)
        if (stillLiveSession !== completedSession || completedSession.expiryTimer === null) {
          throw new C5BWriterFreezeBoundaryError('freeze_window_invalid')
        }
        return passed()
      } catch (error) {
        refusalReason = error instanceof C5BWriterFreezeBoundaryError
          ? error.reasonCode
          : 'provider_operation_refused'
        const session = attemptSession.current
        if (session) {
          session.releaseAttempted = true
          const compensated = await releaseSession(factory, packet, session)
          clearSessionMaterial(session)
          if (activeSession.current === session) activeSession.current = null
          if (!compensated) {
            leaseStateUncertain = true
            refusalReason = 'provider_operation_refused'
          }
        } else if (acquireAttempted) {
          leaseStateUncertain = true
        }
        return refused(refusalReason)
      }
    },

    async unfreezeWriters(contextValue: C5BOperatorContext): Promise<Readonly<{ unfreezeConfirmed: boolean }>> {
      const session = activeSession.current
      if (!session || session.releaseAttempted) return unfreezeResult(false)
      const packet = expectedUnfreezePacket(contextValue, session)
      if (!packet) return unfreezeResult(false)
      session.releaseAttempted = true
      try {
        const confirmed = await releaseSession(factory, packet, session)
        if (!confirmed) leaseStateUncertain = true
        return unfreezeResult(confirmed)
      } finally {
        clearSessionMaterial(session)
        if (activeSession.current === session) activeSession.current = null
      }
    },
  })
}
