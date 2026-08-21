import {
  fetchSpecAdapterResult,
  validateSpecAdapterDestinationBaseUrl,
  type SpecAdapterFetchProviderId,
  type SpecAdapterLiveFetchInput,
} from './spec-adapter-fetch'
import {
  createNodeSpecAdapterFetchCapability,
  type SpecAdapterBearerCredential,
} from './spec-adapter-fetch-node'
import {
  SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE,
  SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
  assessSpecAdapterLiveProofReadiness,
  createSpecAdapterLiveProofReceipt,
  type SpecAdapterLiveProofProviderId,
  type SpecAdapterLiveProofReasonCode,
  type SpecAdapterLiveProofReceipt,
  type SpecAdapterLiveProofResultMetadata,
} from './spec-adapter-live-proof'
import { createNodeSpecAdapterHashPort } from './spec-adapter-node'

export interface SpecAdapterLiveProofRunRequest {
  readonly providerId: SpecAdapterFetchProviderId
  readonly input: SpecAdapterLiveFetchInput | null
  readonly credential: SpecAdapterBearerCredential | null
}

const REQUEST_KEYS = ['providerId', 'input', 'credential'] as const

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function dataRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string')) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const snapshot = Object.create(null) as Record<string, unknown>
    for (const key of keys as string[]) {
      const descriptor = descriptors[key]
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null
      Object.defineProperty(snapshot, key, {
        value: descriptor.value,
        enumerable: true,
        writable: false,
        configurable: false,
      })
    }
    return snapshot
  } catch {
    return null
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  try {
    const actual = Object.keys(value).sort(compareText)
    return JSON.stringify(actual) === JSON.stringify([...expected].sort(compareText))
  } catch {
    return false
  }
}

function safeProviderId(value: unknown): SpecAdapterLiveProofProviderId {
  return value === 'jira' || value === 'azure-devops' ? value : 'unknown'
}

function observedAt(): string {
  return new Date().toISOString()
}

function receipt(
  providerId: SpecAdapterLiveProofProviderId,
  status: 'failed' | 'needs_input' | 'passed',
  reasonCodes: readonly SpecAdapterLiveProofReasonCode[],
  result: SpecAdapterLiveProofResultMetadata | null,
): SpecAdapterLiveProofReceipt {
  return createSpecAdapterLiveProofReceipt({
    schemaVersion: SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
    providerId,
    executionMode: SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE,
    status,
    observedAt: observedAt(),
    reasonCodes,
    result,
  }, createNodeSpecAdapterHashPort())
}

function failed(providerId: SpecAdapterLiveProofProviderId, code: SpecAdapterLiveProofReasonCode): SpecAdapterLiveProofReceipt {
  return receipt(providerId, 'failed', [code], null)
}

export async function runNodeSpecAdapterLiveProof(rawRequest: unknown): Promise<SpecAdapterLiveProofReceipt> {
  const request = dataRecord(rawRequest)
  const providerId = safeProviderId(request?.providerId)
  if (!request || !exactKeys(request, REQUEST_KEYS) || providerId === 'unknown') return failed('unknown', 'input_rejected')

  const readiness = assessSpecAdapterLiveProofReadiness({
    providerId,
    itemInputPresent: request.input !== null,
    bearerCapabilityPresent: request.credential !== null,
  })
  if (readiness.status === 'needs_input') return receipt(providerId, 'needs_input', readiness.reasonCodes, null)

  const input = dataRecord(request.input)
  if (!input || input.providerId !== providerId) return failed(providerId, 'input_rejected')
  let destinationBaseUrl: string
  try {
    destinationBaseUrl = validateSpecAdapterDestinationBaseUrl(input.baseUrl, providerId).destinationBaseUrl
  } catch {
    return failed(providerId, 'input_rejected')
  }

  const config = Object.freeze({ providerId, destinationBaseUrl })
  const credential = request.credential as SpecAdapterBearerCredential
  let capability
  try {
    capability = createNodeSpecAdapterFetchCapability(config, credential)
  } catch {
    return failed(providerId, 'capability_rejected')
  }

  try {
    const result = await fetchSpecAdapterResult(input, capability, createNodeSpecAdapterHashPort())
    return receipt(providerId, 'passed', [], {
      adapterId: result.adapterId,
      resultSchemaVersion: result.schemaVersion,
      sourceSha256: result.source.sourceSha256,
      paragraphCount: result.source.paragraphs?.length ?? 0,
      acceptanceCriteriaCount: result.source.acceptanceCriteria.length,
      unsupportedFieldCount: result.unsupportedFields.length,
    })
  } catch {
    return failed(providerId, 'execution_rejected')
  }
}
