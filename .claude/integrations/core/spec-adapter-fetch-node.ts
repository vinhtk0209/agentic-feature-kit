import {
  SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  SPEC_ADAPTER_FETCH_TIMEOUT_MS,
  validateSpecAdapterDestinationBaseUrl,
  type SpecAdapterFetchCapability,
  type SpecAdapterFetchProviderId,
  type SpecAdapterFetchRequest,
  type SpecAdapterFetchResponse,
} from './spec-adapter-fetch'

export const SPEC_ADAPTER_BEARER_TOKEN_MIN_BYTES = 16
export const SPEC_ADAPTER_BEARER_TOKEN_MAX_BYTES = 8 * 1024

export type SpecAdapterFetchNodeErrorCode =
  | 'CREDENTIAL_CONSUMED'
  | 'CREDENTIAL_MISMATCH'
  | 'DESTINATION_MISMATCH'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_CREDENTIAL'
  | 'NETWORK_REJECTED'
  | 'REDIRECT_REJECTED'
  | 'REQUEST_REJECTED'
  | 'RESPONSE_REJECTED'
  | 'RESPONSE_TOO_LARGE'
  | 'TIMEOUT'

export interface SpecAdapterBearerCredential {
  readonly kind: 'spec-adapter-bearer-v1'
  readonly providerId: SpecAdapterFetchProviderId
  readonly destinationBaseUrl: string
}

export interface SpecAdapterFetchNodeConfig {
  readonly providerId: SpecAdapterFetchProviderId
  readonly destinationBaseUrl: string
}

export interface SpecAdapterFetchNodeDependencies {
  readonly fetchImpl: typeof fetch
  readonly setTimeoutImpl: (handler: () => void, delayMs: number) => unknown
  readonly clearTimeoutImpl: (handle: unknown) => void
}

interface CredentialState {
  readonly providerId: SpecAdapterFetchProviderId
  readonly destinationBaseUrl: string
  readonly bytes: Uint8Array
  consumed: boolean
}

interface ValidatedDependencies {
  readonly fetchImpl: typeof fetch
  readonly setTimeoutImpl: (handler: () => void, delayMs: number) => unknown
  readonly clearTimeoutImpl: (handle: unknown) => void
}

interface ByteViewSnapshot {
  readonly view: Uint8Array
  readonly buffer: ArrayBuffer
  readonly byteOffset: number
  readonly byteLength: number
}

const credentialStates = new WeakMap<object, CredentialState>()
const REQUEST_KEYS = ['providerId', 'method', 'url', 'accept', 'redirect', 'timeoutMs', 'maxResponseBytes'] as const
const CONFIG_KEYS = ['providerId', 'destinationBaseUrl'] as const
const CREDENTIAL_INPUT_KEYS = ['providerId', 'destinationBaseUrl', 'accessToken'] as const
const CREDENTIAL_KEYS = ['kind', 'providerId', 'destinationBaseUrl'] as const
const DEPENDENCY_KEYS = ['fetchImpl', 'setTimeoutImpl', 'clearTimeoutImpl'] as const
const MAX_URL_CHARS = 4_096
const MAX_CONTENT_TYPE_CHARS = 256
const JIRA_ITEM_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const AZURE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/
const FIELD_LIST_PATTERN = /^[A-Za-z][A-Za-z0-9_.]*(?:,[A-Za-z][A-Za-z0-9_.]*){0,63}$/
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object
const BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'buffer')?.get
const BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteOffset')?.get
const BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteLength')?.get

function safeProviderId(value: unknown): SpecAdapterFetchProviderId | 'unknown' {
  return value === 'jira' || value === 'azure-devops' ? value : 'unknown'
}

export class SpecAdapterFetchNodeError extends Error {
  readonly providerId: SpecAdapterFetchProviderId | 'unknown'
  readonly code: SpecAdapterFetchNodeErrorCode

  constructor(providerId: unknown, code: SpecAdapterFetchNodeErrorCode) {
    const safeProvider = safeProviderId(providerId)
    super(`spec-adapter-fetch-node:${safeProvider}:${code}`)
    this.name = 'SpecAdapterFetchNodeError'
    this.providerId = safeProvider
    this.code = code
    Object.freeze(this)
  }
}

function error(providerId: unknown, code: SpecAdapterFetchNodeErrorCode): SpecAdapterFetchNodeError {
  return new SpecAdapterFetchNodeError(providerId, code)
}

function fail(providerId: unknown, code: SpecAdapterFetchNodeErrorCode): never {
  throw error(providerId, code)
}

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

function validateConfig(value: unknown): SpecAdapterFetchNodeConfig {
  const record = dataRecord(value)
  const providerId = record?.providerId
  if (!record || !exactKeys(record, CONFIG_KEYS) || (providerId !== 'jira' && providerId !== 'azure-devops')) {
    fail(providerId, 'INVALID_CONFIGURATION')
  }
  try {
    const validated = validateSpecAdapterDestinationBaseUrl(record.destinationBaseUrl, providerId)
    if (validated.destinationBaseUrl !== record.destinationBaseUrl) fail(providerId, 'INVALID_CONFIGURATION')
  } catch {
    fail(providerId, 'INVALID_CONFIGURATION')
  }
  return Object.freeze({ providerId, destinationBaseUrl: record.destinationBaseUrl as string })
}

function byteViewSnapshot(value: unknown): ByteViewSnapshot | null {
  try {
    if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype
      || !BUFFER_GETTER || !BYTE_OFFSET_GETTER || !BYTE_LENGTH_GETTER) return null
    const buffer = Reflect.apply(BUFFER_GETTER, value, []) as unknown
    const byteOffset = Reflect.apply(BYTE_OFFSET_GETTER, value, []) as unknown
    const byteLength = Reflect.apply(BYTE_LENGTH_GETTER, value, []) as unknown
    if (!(buffer instanceof ArrayBuffer)
      || !Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength)
      || (byteOffset as number) < 0 || (byteLength as number) < 0
      || (byteOffset as number) > buffer.byteLength - (byteLength as number)) return null
    return { view: value, buffer, byteOffset: byteOffset as number, byteLength: byteLength as number }
  } catch {
    return null
  }
}

function plainFullByteView(value: unknown): ByteViewSnapshot | null {
  try {
    const snapshot = byteViewSnapshot(value)
    if (!snapshot || snapshot.byteOffset !== 0 || snapshot.byteLength !== snapshot.buffer.byteLength) return null
    const keys = Reflect.ownKeys(snapshot.view)
    if (keys.length !== snapshot.byteLength) return null
    for (let index = 0; index < keys.length; index += 1) if (keys[index] !== String(index)) return null
    return snapshot
  } catch {
    return null
  }
}

function zeroize(value: Uint8Array | null): void {
  if (!value) return
  try { Uint8Array.prototype.fill.call(value, 0) } catch { /* An invalid transferred view is refused with no safe fallback write. */ }
}

function validBearerByte(value: number): boolean {
  return (value >= 0x30 && value <= 0x39)
    || (value >= 0x41 && value <= 0x5a)
    || (value >= 0x61 && value <= 0x7a)
    || [0x2d, 0x2e, 0x5f, 0x7e, 0x2b, 0x2f, 0x3d].includes(value)
}

export function createSpecAdapterBearerCredential(value: unknown): SpecAdapterBearerCredential {
  let transferred: Uint8Array | null = null
  try {
    const record = dataRecord(value)
    const providerId = record?.providerId
    if (!record || !exactKeys(record, CREDENTIAL_INPUT_KEYS) || (providerId !== 'jira' && providerId !== 'azure-devops')) {
      fail(providerId, 'INVALID_CREDENTIAL')
    }
    const config = validateConfig({ providerId, destinationBaseUrl: record.destinationBaseUrl })
    const token = plainFullByteView(record.accessToken)
    if (!token) fail(providerId, 'INVALID_CREDENTIAL')
    transferred = token.view
    if (
      token.byteLength < SPEC_ADAPTER_BEARER_TOKEN_MIN_BYTES
      || token.byteLength > SPEC_ADAPTER_BEARER_TOKEN_MAX_BYTES
    ) fail(providerId, 'INVALID_CREDENTIAL')
    for (let index = 0; index < token.byteLength; index += 1) {
      if (!validBearerByte(token.view[index])) fail(providerId, 'INVALID_CREDENTIAL')
    }
    const owned = new Uint8Array(token.byteLength)
    Uint8Array.prototype.set.call(owned, token.view)
    const descriptor: SpecAdapterBearerCredential = Object.freeze({
      kind: 'spec-adapter-bearer-v1',
      providerId: config.providerId,
      destinationBaseUrl: config.destinationBaseUrl,
    })
    credentialStates.set(descriptor, {
      providerId: config.providerId,
      destinationBaseUrl: config.destinationBaseUrl,
      bytes: owned,
      consumed: false,
    })
    return descriptor
  } catch (caught) {
    if (caught instanceof SpecAdapterFetchNodeError) throw caught
    fail('unknown', 'INVALID_CREDENTIAL')
  } finally {
    zeroize(transferred)
  }
}

function validateCredential(
  value: unknown,
  config: SpecAdapterFetchNodeConfig,
): { descriptor: SpecAdapterBearerCredential; state: CredentialState } {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, CREDENTIAL_KEYS)
    || record.kind !== 'spec-adapter-bearer-v1'
    || record.providerId !== config.providerId
    || record.destinationBaseUrl !== config.destinationBaseUrl) {
    fail(config.providerId, 'CREDENTIAL_MISMATCH')
  }
  const state = credentialStates.get(value as object)
  if (!state || state.providerId !== config.providerId || state.destinationBaseUrl !== config.destinationBaseUrl) {
    fail(config.providerId, 'CREDENTIAL_MISMATCH')
  }
  return { descriptor: value as SpecAdapterBearerCredential, state }
}

const defaultDependencies: SpecAdapterFetchNodeDependencies = Object.freeze({
  fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
  setTimeoutImpl: (handler: () => void, delayMs: number) => setTimeout(handler, delayMs),
  clearTimeoutImpl: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
})

function validateDependencies(value: unknown): ValidatedDependencies {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, DEPENDENCY_KEYS)
    || typeof record.fetchImpl !== 'function'
    || typeof record.setTimeoutImpl !== 'function'
    || typeof record.clearTimeoutImpl !== 'function') {
    fail('unknown', 'INVALID_CONFIGURATION')
  }
  return Object.freeze({
    fetchImpl: record.fetchImpl as typeof fetch,
    setTimeoutImpl: record.setTimeoutImpl as ValidatedDependencies['setTimeoutImpl'],
    clearTimeoutImpl: record.clearTimeoutImpl as ValidatedDependencies['clearTimeoutImpl'],
  })
}

function decodedSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.includes('/') || decoded.includes('\\') ? null : decoded
  } catch {
    return null
  }
}

function exactQuery(url: URL, providerId: SpecAdapterFetchProviderId): boolean {
  const keys = [...url.searchParams.keys()]
  const expected = providerId === 'jira' ? ['fields'] : ['fields', 'api-version']
  if (JSON.stringify(keys) !== JSON.stringify(expected)) return false
  if (expected.some((key) => url.searchParams.getAll(key).length !== 1)) return false
  const fields = url.searchParams.get('fields')
  if (!fields || fields.length > 8_192 || !FIELD_LIST_PATTERN.test(fields)) return false
  return providerId === 'jira' || url.searchParams.get('api-version') === '7.1'
}

function exactEndpoint(url: URL, config: SpecAdapterFetchNodeConfig): boolean {
  const base = new URL(config.destinationBaseUrl)
  if (url.origin !== base.origin || url.username !== '' || url.password !== '' || url.hash !== '') return false
  if (config.providerId === 'jira') {
    const prefix = `${base.pathname}/rest/api/3/issue/`
    if (!url.pathname.startsWith(prefix)) return false
    const item = decodedSegment(url.pathname.slice(prefix.length))
    return item !== null && JIRA_ITEM_PATTERN.test(item) && item !== '.' && item !== '..' && exactQuery(url, config.providerId)
  }
  const match = /^\/([^/]+)\/([^/]+)\/_apis\/wit\/workitems\/([1-9][0-9]*)$/.exec(url.pathname)
  if (!match) return false
  const organization = decodedSegment(match[1])
  const project = decodedSegment(match[2])
  return organization !== null && project !== null
    && organization.trim() === organization && project.trim() === project
    && AZURE_SEGMENT_PATTERN.test(organization) && AZURE_SEGMENT_PATTERN.test(project)
    && Number.isSafeInteger(Number(match[3]))
    && exactQuery(url, config.providerId)
}

function validateRequest(value: unknown, config: SpecAdapterFetchNodeConfig): SpecAdapterFetchRequest {
  const record = dataRecord(value)
  if (!record || !exactKeys(record, REQUEST_KEYS)
    || record.providerId !== config.providerId
    || record.method !== 'GET'
    || record.accept !== 'application/json'
    || record.redirect !== 'error'
    || record.timeoutMs !== SPEC_ADAPTER_FETCH_TIMEOUT_MS
    || record.maxResponseBytes !== SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES
    || typeof record.url !== 'string' || record.url.length === 0 || record.url.length > MAX_URL_CHARS) {
    fail(config.providerId, 'REQUEST_REJECTED')
  }
  let url: URL
  try { url = new URL(record.url) } catch { return fail(config.providerId, 'REQUEST_REJECTED') }
  if (url.protocol !== 'https:' || url.port !== '' || url.toString() !== record.url || !exactEndpoint(url, config)) {
    fail(config.providerId, 'REQUEST_REJECTED')
  }
  return Object.freeze({
    providerId: config.providerId,
    method: 'GET',
    url: record.url,
    accept: 'application/json',
    redirect: 'error',
    timeoutMs: SPEC_ADAPTER_FETCH_TIMEOUT_MS,
    maxResponseBytes: SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  })
}

function bearerText(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

function parseDeclaredLength(value: string | null, maximum: number, providerId: SpecAdapterFetchProviderId): void {
  if (value === null || !/^[0-9]+$/.test(value)) return
  try {
    if (BigInt(value) > BigInt(maximum)) fail(providerId, 'RESPONSE_TOO_LARGE')
  } catch (caught) {
    if (caught instanceof SpecAdapterFetchNodeError) throw caught
    fail(providerId, 'RESPONSE_REJECTED')
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try { await body.cancel() } catch { /* Cancellation is best effort after a closed refusal. */ }
}

async function responseMetadata(
  value: unknown,
  request: SpecAdapterFetchRequest,
  signal: AbortSignal,
): Promise<{ response: Response; contentType: string }> {
  let response: Response | null = null
  try {
    response = value as Response
    if (!response || typeof response !== 'object') fail(request.providerId, 'RESPONSE_REJECTED')
    if (signal.aborted) {
      await cancelBody(response.body)
      fail(request.providerId, 'TIMEOUT')
    }
    const status = response.status
    const finalUrl = response.url
    const redirected = response.redirected
    if (!Number.isInteger(status) || status < 100 || status > 599 || typeof redirected !== 'boolean') {
      await cancelBody(response.body)
      fail(request.providerId, 'RESPONSE_REJECTED')
    }
    if (redirected || (status >= 300 && status < 400)) {
      await cancelBody(response.body)
      fail(request.providerId, 'REDIRECT_REJECTED')
    }
    if (typeof finalUrl !== 'string' || finalUrl !== request.url) {
      await cancelBody(response.body)
      fail(request.providerId, 'DESTINATION_MISMATCH')
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.length > MAX_CONTENT_TYPE_CHARS) {
      await cancelBody(response.body)
      fail(request.providerId, 'RESPONSE_REJECTED')
    }
    try {
      parseDeclaredLength(response.headers.get('content-length'), request.maxResponseBytes, request.providerId)
    } catch (caught) {
      await cancelBody(response.body)
      throw caught
    }
    return { response, contentType }
  } catch (caught) {
    if (response) {
      try { await cancelBody(response.body) } catch { /* Closed response errors never expose cleanup details. */ }
    }
    if (caught instanceof SpecAdapterFetchNodeError) throw caught
    fail(request.providerId, 'RESPONSE_REJECTED')
  }
}

async function readBoundedBody(
  response: Response,
  request: SpecAdapterFetchRequest,
  signal: AbortSignal,
  deadline: Promise<never>,
): Promise<Uint8Array> {
  if (!response.body) fail(request.providerId, 'RESPONSE_REJECTED')
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  try {
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const rawNext = await Promise.race([reader.read(), deadline])
      if (signal.aborted) fail(request.providerId, 'TIMEOUT')
      const next = dataRecord(rawNext)
      if (!next || !exactKeys(next, ['done', 'value']) || typeof next.done !== 'boolean') {
        fail(request.providerId, 'RESPONSE_REJECTED')
      }
      if (next.done) {
        if (next.value !== undefined) fail(request.providerId, 'RESPONSE_REJECTED')
        break
      }
      const chunk = byteViewSnapshot(next.value)
      if (!chunk) fail(request.providerId, 'RESPONSE_REJECTED')
      const length = chunk.byteLength
      if (!Number.isSafeInteger(length) || length <= 0 || total > request.maxResponseBytes - length) {
        void reader.cancel().catch(() => undefined)
        fail(request.providerId, 'RESPONSE_TOO_LARGE')
      }
      const owned = new Uint8Array(length)
      Uint8Array.prototype.set.call(owned, chunk.view)
      chunks.push(owned)
      total += length
    }
    if (total === 0) fail(request.providerId, 'RESPONSE_REJECTED')
    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body
  } catch (caught) {
    if (reader) void reader.cancel().catch(() => undefined)
    if (caught instanceof SpecAdapterFetchNodeError) throw caught
    fail(request.providerId, signal.aborted ? 'TIMEOUT' : 'RESPONSE_REJECTED')
  } finally {
    try { reader?.releaseLock() } catch { /* A refused stream does not require a second failure. */ }
  }
  throw error(request.providerId, 'RESPONSE_REJECTED')
}

export function createNodeSpecAdapterFetchCapability(
  rawConfig: unknown,
  rawCredential: unknown,
  rawDependencies: unknown = defaultDependencies,
): SpecAdapterFetchCapability {
  const config = validateConfig(rawConfig)
  const { descriptor, state } = validateCredential(rawCredential, config)
  const dependencies = validateDependencies(rawDependencies)

  return Object.freeze({
    providerId: config.providerId,
    destinationBaseUrl: config.destinationBaseUrl,
    async execute(rawRequest: Readonly<SpecAdapterFetchRequest>): Promise<SpecAdapterFetchResponse> {
      const request = validateRequest(rawRequest, config)
      const current = credentialStates.get(descriptor)
      if (!current || current !== state || current.consumed) fail(config.providerId, 'CREDENTIAL_CONSUMED')
      current.consumed = true

      const controller = new AbortController()
      let timeoutHandle: unknown
      let timerCreated = false
      let rejectDeadline: ((reason: SpecAdapterFetchNodeError) => void) | undefined
      const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
      void deadline.catch(() => undefined)
      try {
        try {
          timeoutHandle = dependencies.setTimeoutImpl(() => {
            controller.abort()
            rejectDeadline?.(error(config.providerId, 'TIMEOUT'))
          }, request.timeoutMs)
          timerCreated = true
          if (controller.signal.aborted) fail(config.providerId, 'TIMEOUT')
        } catch (caught) {
          if (caught instanceof SpecAdapterFetchNodeError) throw caught
          fail(config.providerId, 'INVALID_CONFIGURATION')
        }

        const authorization = `Bearer ${bearerText(current.bytes)}`
        let response: Response
        try {
          const pending = Promise.resolve().then(() => dependencies.fetchImpl(request.url, {
            method: request.method,
            headers: { accept: request.accept, authorization },
            redirect: request.redirect,
            signal: controller.signal,
          })).then(async (resolved) => {
            if (controller.signal.aborted) {
              await cancelBody(resolved.body)
              fail(config.providerId, 'TIMEOUT')
            }
            return resolved
          })
          response = await Promise.race([pending, deadline])
        } catch (caught) {
          if (caught instanceof SpecAdapterFetchNodeError) throw caught
          fail(config.providerId, controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_REJECTED')
        }

        const metadata = await responseMetadata(response, request, controller.signal)
        const body = await readBoundedBody(metadata.response, request, controller.signal, deadline)
        if (controller.signal.aborted) fail(config.providerId, 'TIMEOUT')
        return Object.freeze({
          status: metadata.response.status,
          contentType: metadata.contentType,
          finalUrl: metadata.response.url,
          body,
        })
      } finally {
        if (timerCreated) {
          try { dependencies.clearTimeoutImpl(timeoutHandle) } catch { /* Cleanup cannot expose dependency failures. */ }
        }
        zeroize(current.bytes)
      }
    },
  })
}
