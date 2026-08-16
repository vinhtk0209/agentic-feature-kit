import {
  executeCentralWrite,
  type CentralWriterResult,
} from './core/privacy-writer'
import type { ClockPort, OpaqueIdentifierPort } from './core/privacy-policy'
import { VERIFICATION_WRITER_ID } from './verification-writer-adapter'

export type VerificationWriterCapabilityDependencies = Readonly<{
  repoLocalId: string
  context: unknown
  grant: unknown
  clock: ClockPort
  opaqueIdentifierPort: OpaqueIdentifierPort
  sinkCapability: unknown
}>

export type VerificationWriteCapabilityInput = VerificationWriterCapabilityDependencies & Readonly<{
  runId: string
  contentHash: string
  kitVersion: string
  verified: boolean
  tierExitCodes: readonly number[]
  observedAt: string
}>

const INPUT_KEYS = [
  'clock',
  'contentHash',
  'context',
  'grant',
  'kitVersion',
  'observedAt',
  'opaqueIdentifierPort',
  'repoLocalId',
  'runId',
  'sinkCapability',
  'tierExitCodes',
  'verified',
] as const

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactInput(value: unknown): value is VerificationWriteCapabilityInput {
  if (!plain(value)) return false
  const keys = Object.keys(value).sort()
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) return false
  return typeof value.runId === 'string'
    && typeof value.repoLocalId === 'string'
    && typeof value.contentHash === 'string'
    && typeof value.kitVersion === 'string'
    && typeof value.verified === 'boolean'
    && Array.isArray(value.tierExitCodes)
    && value.tierExitCodes.every((exitCode) => typeof exitCode === 'number')
    && typeof value.observedAt === 'string'
    && plain(value.clock)
    && typeof value.clock.now === 'function'
    && plain(value.opaqueIdentifierPort)
    && typeof value.opaqueIdentifierPort.create === 'function'
}

function invalidRequest(): CentralWriterResult {
  return Object.freeze({
    ok: false,
    statusCode: 'blocked',
    reasonCode: 'invalid_writer_request',
    privacyReasonCode: null,
    ruleId: 'verification.capability_request_refused',
    receipt: null,
  })
}

function purposeRejected(): CentralWriterResult {
  return Object.freeze({
    ok: false,
    statusCode: 'blocked',
    reasonCode: 'policy_rejected',
    privacyReasonCode: 'processing_scope_disabled',
    ruleId: 'verification.grant_purpose',
    receipt: null,
  })
}

export async function executeVerificationWrite(input: unknown): Promise<CentralWriterResult> {
  try {
    if (!exactInput(input)) return invalidRequest()
    if (!plain(input.grant) || input.grant.purposeCode !== 'verification_record') return purposeRejected()
    return await executeCentralWrite({
      writerId: VERIFICATION_WRITER_ID,
      context: input.context,
      grant: input.grant,
      family: 'verification',
      payload: Object.freeze({
        runId: input.runId,
        repoLocalId: input.repoLocalId,
        contentHash: input.contentHash,
        kitVersion: input.kitVersion,
        verified: input.verified,
        tierExitCodes: [...input.tierExitCodes],
        observedAt: input.observedAt,
      }),
      clock: input.clock,
      opaqueIdentifierPort: input.opaqueIdentifierPort,
      sinkCapability: input.sinkCapability,
    })
  } catch {
    return invalidRequest()
  }
}
