import {
  SPEC_ADAPTER_MAX_SOURCE_BYTES,
  SpecAdapterError,
  validateSpecAdapterConfig,
  type SpecAdapterFieldMapping,
  type SpecAdapterHashPort,
  type SpecAdapterResult,
  type ValidatedSpecAdapterConfig,
} from './spec-adapter'
import { createAzureDevOpsSpecAdapter } from './spec-adapter-azure-devops'
import { createJiraSpecAdapter } from './spec-adapter-jira'

export const SPEC_ADAPTER_FETCH_TIMEOUT_MS = 12_000
export const SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES = SPEC_ADAPTER_MAX_SOURCE_BYTES

export type SpecAdapterFetchProviderId = 'azure-devops' | 'jira'
export type SpecAdapterFetchErrorCode =
  | 'CONTENT_TYPE_REJECTED'
  | 'DESTINATION_MISMATCH'
  | 'HTTP_REJECTED'
  | 'INVALID_CAPABILITY'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'PORT_FAILURE'
  | 'REDIRECT_REJECTED'
  | 'RESPONSE_TOO_LARGE'

export interface SpecAdapterFetchRequest {
  providerId: SpecAdapterFetchProviderId
  method: 'GET'
  url: string
  accept: 'application/json'
  redirect: 'error'
  timeoutMs: typeof SPEC_ADAPTER_FETCH_TIMEOUT_MS
  maxResponseBytes: typeof SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES
}

export interface SpecAdapterFetchResponse {
  status: number
  contentType: string
  finalUrl: string
  body: Uint8Array
}

export interface SpecAdapterFetchCapability {
  providerId: SpecAdapterFetchProviderId
  destinationBaseUrl: string
  execute(request: Readonly<SpecAdapterFetchRequest>): Promise<unknown> | unknown
}

interface SharedFetchInput {
  baseUrl: string
  sourceRef: string
  mapping: SpecAdapterFieldMapping
}

export interface JiraSpecAdapterLiveFetchInput extends SharedFetchInput {
  providerId: 'jira'
  issueIdOrKey: string
}

export interface AzureDevOpsSpecAdapterLiveFetchInput extends SharedFetchInput {
  providerId: 'azure-devops'
  organization: string
  project: string
  workItemId: number
}

export type SpecAdapterLiveFetchInput = JiraSpecAdapterLiveFetchInput | AzureDevOpsSpecAdapterLiveFetchInput

const SOURCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const JIRA_ITEM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const AZURE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i
const MAX_BASE_URL_CHARS = 2_048
const MAX_CONTENT_TYPE_CHARS = 256
const MAX_FINAL_URL_CHARS = 4_096
const JIRA_OAUTH_ORIGIN = 'https://api.atlassian.com'
const AZURE_DEVOPS_ORIGIN = 'https://dev.azure.com'
const JIRA_CLOUD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function safeProviderId(value: unknown): SpecAdapterFetchProviderId | 'unknown' {
  return value === 'jira' || value === 'azure-devops' ? value : 'unknown'
}

export class SpecAdapterFetchError extends Error {
  readonly providerId: SpecAdapterFetchProviderId | 'unknown'
  readonly code: SpecAdapterFetchErrorCode

  constructor(providerId: unknown, code: SpecAdapterFetchErrorCode) {
    const safeProvider = safeProviderId(providerId)
    super(`spec-adapter-fetch:${safeProvider}:${code}`)
    this.name = 'SpecAdapterFetchError'
    this.providerId = safeProvider
    this.code = code
    Object.freeze(this)
  }
}

function fail(providerId: unknown, code: SpecAdapterFetchErrorCode): never {
  throw new SpecAdapterFetchError(providerId, code)
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
  let actual: string[]
  try { actual = Object.keys(value).sort(compareText) } catch { return false }
  return JSON.stringify(actual) === JSON.stringify([...expected].sort(compareText))
}

function safeStringArray(value: unknown, providerId: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) fail(providerId, 'INVALID_INPUT')
  let keys: PropertyKey[]
  try { keys = Reflect.ownKeys(value) } catch { return fail(providerId, 'INVALID_INPUT') }
  const expected = [...Array.from({ length: value.length }, (_unused, index) => String(index)), 'length']
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail(providerId, 'INVALID_INPUT')
  const result: string[] = []
  try {
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') fail(providerId, 'INVALID_INPUT')
      result.push(descriptor.value)
    }
  } catch {
    fail(providerId, 'INVALID_INPUT')
  }
  return result
}

function assertSafeMapping(value: unknown, providerId: unknown): SpecAdapterFieldMapping {
  const mapping = dataRecord(value)
  if (!mapping || !exactKeys(mapping, ['titleField', 'paragraphFields', 'unsupportedFields'])) {
    fail(providerId, 'INVALID_INPUT')
  }
  if (typeof mapping.titleField !== 'string') fail(providerId, 'INVALID_INPUT')
  return {
    titleField: mapping.titleField,
    paragraphFields: safeStringArray(mapping.paragraphFields, providerId),
    unsupportedFields: safeStringArray(mapping.unsupportedFields, providerId),
  }
}

export function validateSpecAdapterDestinationBaseUrl(value: unknown, providerId: SpecAdapterFetchProviderId): {
  destinationBaseUrl: string
  adapterBaseOrigin: string
} {
  if (typeof value !== 'string' || value.length > MAX_BASE_URL_CHARS || value.trim() !== value) {
    fail(providerId, 'INVALID_INPUT')
  }
  let url: URL
  try { url = new URL(value) } catch { return fail(providerId, 'INVALID_INPUT') }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || url.search !== ''
    || url.hash !== ''
  ) fail(providerId, 'INVALID_INPUT')
  if (providerId === 'jira') {
    const match = /^\/ex\/jira\/([^/]+)$/.exec(url.pathname)
    if (
      url.origin !== JIRA_OAUTH_ORIGIN
      || !match
      || !JIRA_CLOUD_ID_PATTERN.test(match[1])
      || value !== `${JIRA_OAUTH_ORIGIN}${url.pathname}`
    ) fail(providerId, 'INVALID_INPUT')
    return { destinationBaseUrl: value, adapterBaseOrigin: JIRA_OAUTH_ORIGIN }
  }
  if (url.origin !== AZURE_DEVOPS_ORIGIN || url.pathname !== '/' || value !== AZURE_DEVOPS_ORIGIN) {
    fail(providerId, 'INVALID_INPUT')
  }
  return { destinationBaseUrl: AZURE_DEVOPS_ORIGIN, adapterBaseOrigin: AZURE_DEVOPS_ORIGIN }
}

function validatedInput(value: unknown): {
  input: SpecAdapterLiveFetchInput
  destinationBaseUrl: string
  adapterBaseOrigin: string
  config: ValidatedSpecAdapterConfig
} {
  const record = dataRecord(value)
  const providerId = record?.providerId
  if (!record || (providerId !== 'jira' && providerId !== 'azure-devops')) fail(providerId, 'INVALID_INPUT')
  const expected = providerId === 'jira'
    ? ['providerId', 'baseUrl', 'issueIdOrKey', 'sourceRef', 'mapping']
    : ['providerId', 'baseUrl', 'organization', 'project', 'workItemId', 'sourceRef', 'mapping']
  if (!exactKeys(record, expected)) fail(providerId, 'INVALID_INPUT')
  const { destinationBaseUrl, adapterBaseOrigin } = validateSpecAdapterDestinationBaseUrl(record.baseUrl, providerId)
  if (typeof record.sourceRef !== 'string' || !SOURCE_REF_PATTERN.test(record.sourceRef)) fail(providerId, 'INVALID_INPUT')
  const mapping = assertSafeMapping(record.mapping, providerId)
  let config: ValidatedSpecAdapterConfig
  try { config = validateSpecAdapterConfig({ baseUrl: adapterBaseOrigin, mapping }, `${providerId}-fetch`) }
  catch { return fail(providerId, 'INVALID_INPUT') }

  if (providerId === 'jira') {
    if (
      typeof record.issueIdOrKey !== 'string'
      || !JIRA_ITEM_PATTERN.test(record.issueIdOrKey)
      || record.issueIdOrKey === '.'
      || record.issueIdOrKey === '..'
    ) fail(providerId, 'INVALID_INPUT')
    return {
      input: { providerId, baseUrl: destinationBaseUrl, issueIdOrKey: record.issueIdOrKey, sourceRef: record.sourceRef, mapping },
      destinationBaseUrl,
      adapterBaseOrigin,
      config,
    }
  }

  if (
    typeof record.organization !== 'string'
    || typeof record.project !== 'string'
    || record.organization.trim() !== record.organization
    || record.project.trim() !== record.project
    || !AZURE_SEGMENT_PATTERN.test(record.organization)
    || !AZURE_SEGMENT_PATTERN.test(record.project)
    || ['.', '..'].includes(record.organization)
    || ['.', '..'].includes(record.project)
    || !Number.isSafeInteger(record.workItemId)
    || (record.workItemId as number) <= 0
  ) fail(providerId, 'INVALID_INPUT')
  return {
    input: {
      providerId,
      baseUrl: destinationBaseUrl,
      organization: record.organization,
      project: record.project,
      workItemId: record.workItemId as number,
      sourceRef: record.sourceRef,
      mapping,
    },
    destinationBaseUrl,
    adapterBaseOrigin,
    config,
  }
}

function capability(value: unknown, providerId: SpecAdapterFetchProviderId, destinationBaseUrl: string): SpecAdapterFetchCapability {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, ['providerId', 'destinationBaseUrl', 'execute']) || typeof record.execute !== 'function') {
    fail(providerId, 'INVALID_CAPABILITY')
  }
  if (record.providerId !== providerId || record.destinationBaseUrl !== destinationBaseUrl) fail(providerId, 'DESTINATION_MISMATCH')
  return record as unknown as SpecAdapterFetchCapability
}

function hashCapability(value: unknown, providerId: SpecAdapterFetchProviderId): SpecAdapterHashPort {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, ['sha256']) || typeof record.sha256 !== 'function') {
    fail(providerId, 'INVALID_CAPABILITY')
  }
  return record as unknown as SpecAdapterHashPort
}

function fieldList(config: ValidatedSpecAdapterConfig): string[] {
  return [
    config.mapping.titleField,
    ...config.mapping.paragraphFields,
    ...config.mapping.unsupportedFields,
  ].sort(compareText)
}

function buildRequest(input: SpecAdapterLiveFetchInput, config: ValidatedSpecAdapterConfig): SpecAdapterFetchRequest {
  const url = new URL(input.baseUrl)
  if (input.providerId === 'jira') {
    url.pathname = `${url.pathname}/rest/api/3/issue/${encodeURIComponent(input.issueIdOrKey)}`
  } else {
    url.pathname = `/${encodeURIComponent(input.organization)}/${encodeURIComponent(input.project)}/_apis/wit/workitems/${input.workItemId}`
  }
  url.searchParams.set('fields', fieldList(config).join(','))
  if (input.providerId === 'azure-devops') url.searchParams.set('api-version', '7.1')
  return Object.freeze({
    providerId: input.providerId,
    method: 'GET',
    url: url.toString(),
    accept: 'application/json',
    redirect: 'error',
    timeoutMs: SPEC_ADAPTER_FETCH_TIMEOUT_MS,
    maxResponseBytes: SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  })
}

function responseBytes(value: unknown, request: SpecAdapterFetchRequest): Uint8Array {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, ['status', 'contentType', 'finalUrl', 'body'])) fail(request.providerId, 'INVALID_RESPONSE')
  if (!Number.isInteger(record.status) || record.status !== 200) fail(request.providerId, 'HTTP_REJECTED')
  if (
    typeof record.contentType !== 'string'
    || record.contentType.length > MAX_CONTENT_TYPE_CHARS
    || !JSON_CONTENT_TYPE.test(record.contentType)
  ) {
    fail(request.providerId, 'CONTENT_TYPE_REJECTED')
  }
  if (
    typeof record.finalUrl !== 'string'
    || record.finalUrl.length > MAX_FINAL_URL_CHARS
    || record.finalUrl !== request.url
  ) fail(request.providerId, 'REDIRECT_REJECTED')
  if (!(record.body instanceof Uint8Array)) fail(request.providerId, 'INVALID_RESPONSE')
  let byteLength: number
  try { byteLength = record.body.byteLength } catch { return fail(request.providerId, 'INVALID_RESPONSE') }
  if (byteLength === 0) fail(request.providerId, 'INVALID_RESPONSE')
  if (byteLength > SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES) fail(request.providerId, 'RESPONSE_TOO_LARGE')
  try { return new Uint8Array(record.body) } catch { return fail(request.providerId, 'INVALID_RESPONSE') }
}

export async function fetchSpecAdapterResult(
  rawInput: unknown,
  rawCapability: unknown,
  hashPort: SpecAdapterHashPort,
): Promise<SpecAdapterResult> {
  const { input, destinationBaseUrl, adapterBaseOrigin, config: validatedConfig } = validatedInput(rawInput)
  const validatedHashPort = hashCapability(hashPort, input.providerId)
  const port = capability(rawCapability, input.providerId, destinationBaseUrl)
  const request = buildRequest(input, validatedConfig)
  let rawResponse: unknown
  try { rawResponse = await port.execute(request) }
  catch { return fail(input.providerId, 'PORT_FAILURE') }
  const sourceBytes = responseBytes(rawResponse, request)
  try {
    const adapterConfig = { baseUrl: adapterBaseOrigin, mapping: input.mapping }
    const adapter = input.providerId === 'jira'
      ? createJiraSpecAdapter(adapterConfig, validatedHashPort)
      : createAzureDevOpsSpecAdapter(adapterConfig, validatedHashPort)
    return adapter.adapt({ sourceBytes, sourceRef: input.sourceRef })
  } catch (error) {
    if (error instanceof SpecAdapterError) throw error
    return fail(input.providerId, 'INVALID_RESPONSE')
  }
}
