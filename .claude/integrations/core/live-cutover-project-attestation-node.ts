import { timingSafeEqual } from 'node:crypto'
import {
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BEnvironmentClass,
  type C5BPreflightPacket,
  type C5BReasonCode,
} from './live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from './live-cutover-preflight-operator'

export const C5B_PROJECT_ATTESTATION_SCHEMA_VERSION = 1 as const
export const C5B_PROJECT_ATTESTATION_POLICY_VERSION = 'p17-016-c5b-project-attestation-v1' as const

export interface C5BProjectApprovalRequest {
  readonly attemptId: string
  readonly approvalRef: string
  readonly signal: AbortSignal
}

export interface C5BProjectObservationRequest {
  readonly attemptId: string
  readonly environmentClass: C5BEnvironmentClass
  readonly signal: AbortSignal
}

export interface C5BProjectApprovalSource {
  readonly resolveApprovedIdentity: (request: C5BProjectApprovalRequest) => Promise<unknown>
}

export interface C5BProjectObservationSource {
  readonly observeProjectIdentity: (request: C5BProjectObservationRequest) => Promise<unknown>
}

export interface C5BProjectAttestationSources {
  readonly approvalSource: C5BProjectApprovalSource
  readonly observationSource: C5BProjectObservationSource
}

export interface C5BProjectAttestationNodeConfig {
  readonly maxIdentityBytes: number
  readonly timeoutMs: number
  readonly now: () => string
}

export interface C5BProjectAttestationNodePorts {
  readonly attestProject: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

type OwnedApproval = { readonly identity: Uint8Array }
type OwnedObservation = { readonly identity: Uint8Array; readonly environmentClass: C5BEnvironmentClass }
interface ValidatedFactory {
  readonly maxIdentityBytes: number
  readonly timeoutMs: number
  readonly now: () => string
  readonly resolveApprovedIdentity: C5BProjectApprovalSource['resolveApprovedIdentity']
  readonly observeProjectIdentity: C5BProjectObservationSource['observeProjectIdentity']
}

const CONFIG_KEYS = ['maxIdentityBytes', 'now', 'timeoutMs'] as const
const SOURCE_KEYS = ['approvalSource', 'observationSource'] as const
const APPROVAL_SOURCE_KEYS = ['resolveApprovedIdentity'] as const
const OBSERVATION_SOURCE_KEYS = ['observeProjectIdentity'] as const
const CONTEXT_KEYS = ['packet', 'receipts'] as const
const APPROVAL_RESULT_KEYS = ['identity'] as const
const OBSERVATION_RESULT_KEYS = ['environmentClass', 'identity'] as const
const ENVIRONMENTS = new Set<C5BEnvironmentClass>(['managed_nonproduction', 'managed_production'])
const MAX_IDENTITY_BYTES = 4_096
const MAX_TIMEOUT_MS = 300_000

class C5BProjectAttestationConfigurationError extends Error {
  constructor() {
    super('C5B project-attestation configuration refused')
    this.name = 'C5BProjectAttestationConfigurationError'
  }
}

class C5BProjectAttestationBoundaryError extends Error {
  readonly reasonCode: C5BReasonCode

  constructor(reasonCode: C5BReasonCode) {
    super('C5B project-attestation boundary refused')
    this.name = 'C5BProjectAttestationBoundaryError'
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

function ownDataValue(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum
}

function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function configurationRefused(): never {
  throw new C5BProjectAttestationConfigurationError()
}

function validateFactory(
  config: C5BProjectAttestationNodeConfig,
  sources: C5BProjectAttestationSources,
): ValidatedFactory {
  if (!exactDataRecord(config, CONFIG_KEYS)
    || !positiveSafeInteger(config.maxIdentityBytes, MAX_IDENTITY_BYTES)
    || !positiveSafeInteger(config.timeoutMs, MAX_TIMEOUT_MS)
    || typeof config.now !== 'function'
    || !exactDataRecord(sources, SOURCE_KEYS)
    || !exactDataRecord(sources.approvalSource, APPROVAL_SOURCE_KEYS)
    || !exactDataRecord(sources.observationSource, OBSERVATION_SOURCE_KEYS)
    || typeof sources.approvalSource.resolveApprovedIdentity !== 'function'
    || typeof sources.observationSource.observeProjectIdentity !== 'function'
    || Object.is(sources.approvalSource, sources.observationSource)
    || Object.is(sources.approvalSource.resolveApprovedIdentity, sources.observationSource.observeProjectIdentity)) {
    configurationRefused()
  }
  return Object.freeze({
    maxIdentityBytes: config.maxIdentityBytes,
    timeoutMs: config.timeoutMs,
    now: config.now,
    resolveApprovedIdentity: sources.approvalSource.resolveApprovedIdentity,
    observeProjectIdentity: sources.observationSource.observeProjectIdentity,
  })
}

function refused(reasonCode: C5BReasonCode): C5BPortDecision {
  return Object.freeze({ status: 'refused', reasonCode })
}

function passed(environmentClass: C5BEnvironmentClass, attestedAt: string): C5BPortDecision {
  return Object.freeze({
    status: 'passed',
    evidence: Object.freeze({ projectMatch: true, environmentClass, attestedAt }),
  })
}

function expectedPacket(value: unknown): C5BPreflightPacket | null {
  try {
    if (!exactDataRecord(value, CONTEXT_KEYS) || !Array.isArray(value.receipts)) return null
    const packet = validateC5BPreflightPacket(value.packet)
    const prefix = evaluateC5BPreflightPrefix(packet, value.receipts)
    if (!prefix.ok || prefix.statusCode !== 'continue' || prefix.nextOperation !== 'attest_project') return null
    return packet
  } catch {
    return null
  }
}

function ownedIdentity(value: unknown, maximum: number): value is Uint8Array {
  try {
    return value instanceof Uint8Array
      && value.buffer instanceof ArrayBuffer
      && value.byteLength > 0
      && value.byteLength <= maximum
      && value.buffer.byteLength > 0
  } catch {
    return false
  }
}

function approvalResult(value: unknown, maximum: number): OwnedApproval | null {
  const identity = ownDataValue(value, 'identity')
  return exactDataRecord(value, APPROVAL_RESULT_KEYS) && ownedIdentity(identity, maximum)
    ? { identity }
    : null
}

function observationResult(value: unknown, maximum: number): OwnedObservation | null {
  const identity = ownDataValue(value, 'identity')
  const environmentClass = ownDataValue(value, 'environmentClass')
  return exactDataRecord(value, OBSERVATION_RESULT_KEYS)
    && ownedIdentity(identity, maximum)
    && typeof environmentClass === 'string'
    && ENVIRONMENTS.has(environmentClass as C5BEnvironmentClass)
    ? { identity, environmentClass: environmentClass as C5BEnvironmentClass }
    : null
}

function transferredIdentity(value: unknown): Uint8Array | null {
  try {
    const identity = ownDataValue(value, 'identity')
    return identity instanceof Uint8Array ? identity : null
  } catch {
    return null
  }
}

function zeroize(value: Uint8Array | null): void {
  if (!value) return
  try {
    value.fill(0)
  } catch {
    // A detached or invalid transferred view is still refused; there is no safe fallback write.
  }
}

function sameBackingStore(left: Uint8Array, right: Uint8Array): boolean {
  return left.buffer === right.buffer
}

function exactIdentityMatch(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength || sameBackingStore(left, right)) return false
  return timingSafeEqual(left, right)
}

async function resolveBeforeAbort(
  operation: () => Promise<unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  return operation().then((value) => {
    if (signal.aborted) {
      zeroize(transferredIdentity(value))
      throw new C5BProjectAttestationBoundaryError('provider_operation_refused')
    }
    return value
  })
}

async function withinDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new C5BProjectAttestationBoundaryError('provider_operation_refused'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([operation(controller.signal), expired])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

export function createC5BProjectAttestationNodePorts(
  config: C5BProjectAttestationNodeConfig,
  sources: C5BProjectAttestationSources,
): C5BProjectAttestationNodePorts {
  let factory: ValidatedFactory
  try {
    factory = validateFactory(config, sources)
  } catch {
    configurationRefused()
  }
  const consumedPacketHashes = new Set<string>()

  return Object.freeze({
    async attestProject(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const packet = expectedPacket(contextValue)
      if (!packet || consumedPacketHashes.has(packet.packetHash)) return refused('operation_sequence_invalid')
      consumedPacketHashes.add(packet.packetHash)

      let approvedIdentity: Uint8Array | null = null
      let observedIdentity: Uint8Array | null = null
      try {
        const effectiveTimeoutMs = Math.min(factory.timeoutMs, packet.limits.maxStepDurationMs)
        const resolved = await withinDeadline(effectiveTimeoutMs, async (signal) => {
          const approvalRequest = Object.freeze({
            attemptId: packet.attemptId,
            approvalRef: packet.approvalRef,
            signal,
          })
          const rawApproval = await resolveBeforeAbort(
            () => factory.resolveApprovedIdentity(approvalRequest),
            signal,
          )
          approvedIdentity = transferredIdentity(rawApproval)
          const approval = approvalResult(rawApproval, factory.maxIdentityBytes)
          if (!approval) throw new C5BProjectAttestationBoundaryError('provider_operation_refused')

          const observationRequest = Object.freeze({
            attemptId: packet.attemptId,
            environmentClass: packet.environmentClass,
            signal,
          })
          const rawObservation = await resolveBeforeAbort(
            () => factory.observeProjectIdentity(observationRequest),
            signal,
          )
          observedIdentity = transferredIdentity(rawObservation)
          const observation = observationResult(rawObservation, factory.maxIdentityBytes)
          if (!observation) throw new C5BProjectAttestationBoundaryError('provider_operation_refused')
          return { approval, observation }
        })

        if (resolved.observation.environmentClass !== packet.environmentClass
          || !exactIdentityMatch(resolved.approval.identity, resolved.observation.identity)) {
          return refused('project_mismatch')
        }
        const attestedAt = factory.now()
        if (!validInstant(attestedAt)
          || Date.parse(attestedAt) < Date.parse(packet.freezeStartsAt)
          || Date.parse(attestedAt) > Date.parse(packet.freezeExpiresAt)) {
          return refused('freeze_window_invalid')
        }
        return passed(resolved.observation.environmentClass, attestedAt)
      } catch (error) {
        return refused(error instanceof C5BProjectAttestationBoundaryError
          ? error.reasonCode
          : 'provider_operation_refused')
      } finally {
        zeroize(approvedIdentity)
        zeroize(observedIdentity)
      }
    },
  })
}
