import {
  normalizeSemanticSpec,
  type SemanticSourceCriterion,
  type SemanticSourceInput,
} from './semantic-spec'

export type { SemanticSourceInput } from './semantic-spec'

export const SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION = '1.1.0' as const
export const SPEC_ADAPTER_RESULT_SCHEMA_VERSION = '1.1.0' as const
export const SPEC_ADAPTER_MAX_SOURCE_BYTES = 256 * 1024
export const SPEC_ADAPTER_MAX_FIELDS = 64
export const SPEC_ADAPTER_MAX_PARAGRAPHS = 256
export const SPEC_ADAPTER_MAX_NODES = 1_024
export const SPEC_ADAPTER_MAX_TEXT_CHARS = 128 * 1024

export type SpecAdapterErrorCode =
  | 'DUPLICATE_ADAPTER'
  | 'HASH_FAILURE'
  | 'INVALID_BYTES'
  | 'INVALID_CONFIG'
  | 'INVALID_DESCRIPTOR'
  | 'INVALID_DISCOVERY'
  | 'INVALID_JSON'
  | 'INVALID_MAPPING'
  | 'INVALID_PAYLOAD'
  | 'INVALID_RESULT'
  | 'INVALID_SOURCE_REF'
  | 'INVALID_UTF8'
  | 'NO_ACCEPTANCE_CRITERIA'
  | 'PROVIDER_MISMATCH'
  | 'SOURCE_TOO_LARGE'
  | 'TEXT_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT'

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]{0,63}$/
const FIELD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SOURCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const REQUIRED_CONFIGURATION = ['base-url', 'field-mapping'] as const
const AC_LEAD_IN = /^\s*(?:\|\s*(?:\*\*|__)?AC[-\s]?\d+(?:\*\*|__)?\s*\||AC[-\s]?\d+[:.)]?|(?:acceptance\s+criteri(?:a|on)\s+\d+[:.)]?)|\d+[).]\s|[-*•]\s*(?:given|when|then)\b|given\b.*\bwhen\b.*\bthen\b)/i

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText)
  const wanted = [...expected].sort(compareText)
  return JSON.stringify(actual) === JSON.stringify(wanted)
}

function safeAdapterId(value: unknown): string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value) ? value : 'unknown-adapter'
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
    Object.freeze(value)
  }
  return value
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class SpecAdapterError extends Error {
  readonly adapterId: string
  readonly code: SpecAdapterErrorCode

  constructor(adapterId: string, code: SpecAdapterErrorCode) {
    const safeId = safeAdapterId(adapterId)
    super(`spec-adapter:${safeId}:${code}`)
    this.name = 'SpecAdapterError'
    this.adapterId = safeId
    this.code = code
    Object.freeze(this)
  }
}

function fail(adapterId: string, code: SpecAdapterErrorCode): never {
  throw new SpecAdapterError(adapterId, code)
}

export interface SpecAdapterDescriptor {
  schemaVersion: typeof SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION
  adapterId: string
  providerId: string
  inputKind: 'spec-ir-v1' | 'utf8-json'
  outputSchemaVersion: typeof SPEC_ADAPTER_RESULT_SCHEMA_VERSION
  sourceKinds: string[]
  configurationRequirements: [] | ['base-url', 'field-mapping']
  unsupportedBehavior: 'explicit-field-names'
}

export interface SpecAdapterDiscovery {
  schemaVersion: typeof SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION
  adapters: SpecAdapterDescriptor[]
}

export interface SpecAdapterFieldMapping {
  titleField: string
  paragraphFields: readonly string[]
  unsupportedFields: readonly string[]
}

export interface SpecAdapterConfig {
  baseUrl: string
  mapping: SpecAdapterFieldMapping
}

export interface ValidatedSpecAdapterConfig {
  baseOrigin: string
  mapping: {
    titleField: string
    paragraphFields: string[]
    unsupportedFields: string[]
  }
}

export interface SpecAdapterHashPort {
  sha256(sourceBytes: Uint8Array): string
}

export interface SpecAdapterInput {
  sourceBytes: Uint8Array
  sourceRef: string
}

export interface SpecAdapterResult {
  schemaVersion: typeof SPEC_ADAPTER_RESULT_SCHEMA_VERSION
  adapterId: string
  providerId: string
  capability: SpecAdapterDescriptor
  source: SemanticSourceInput
  unsupportedFields: string[]
}

export interface SpecAdapter {
  readonly descriptor: SpecAdapterDescriptor
  adapt(input: Readonly<SpecAdapterInput>): SpecAdapterResult
}

export interface ParsedSpecAdapterJson {
  sourceRef: string
  sourceSha256: string
  value: unknown
}

export function createSpecAdapterDescriptor(value: unknown): SpecAdapterDescriptor {
  const adapterId = isRecord(value) ? safeAdapterId(value.adapterId) : 'unknown-adapter'
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion',
    'adapterId',
    'providerId',
    'inputKind',
    'outputSchemaVersion',
    'sourceKinds',
    'configurationRequirements',
    'unsupportedBehavior',
  ])) fail(adapterId, 'INVALID_DESCRIPTOR')
  const sourceKinds = Array.isArray(value.sourceKinds)
    && value.sourceKinds.length > 0
    && value.sourceKinds.length <= 16
    ? (() => {
        const bounded: string[] = []
        try {
          for (let index = 0; index < value.sourceKinds.length; index += 1) {
            const entry = value.sourceKinds[index]
            if (typeof entry !== 'string') return []
            bounded.push(entry)
          }
        } catch { return [] }
        return bounded
      })()
    : []
  const configurationRequirements = Array.isArray(value.configurationRequirements)
    && value.configurationRequirements.length <= 2
    ? (() => {
        const bounded: string[] = []
        try {
          for (let index = 0; index < value.configurationRequirements.length; index += 1) {
            const entry = value.configurationRequirements[index]
            if (typeof entry !== 'string') return []
            bounded.push(entry)
          }
        } catch { return [] }
        return bounded
      })()
    : null
  const sourceKindsValid = sourceKinds.length > 0
    && sourceKinds.length <= 16
    && sourceKinds.every((entry) => IDENTIFIER_PATTERN.test(entry))
    && new Set(sourceKinds).size === sourceKinds.length
    && JSON.stringify(sourceKinds) === JSON.stringify([...sourceKinds].sort(compareText))
  const configurationValid = (
    value.inputKind === 'utf8-json'
      && JSON.stringify(configurationRequirements) === JSON.stringify(REQUIRED_CONFIGURATION)
      && sourceKinds.length === 1
      && sourceKinds[0] === value.providerId
  ) || (
    value.inputKind === 'spec-ir-v1'
      && configurationRequirements !== null
      && configurationRequirements.length === 0
  )
  if (
    value.schemaVersion !== SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION
    || typeof value.adapterId !== 'string'
    || !IDENTIFIER_PATTERN.test(value.adapterId)
    || typeof value.providerId !== 'string'
    || !IDENTIFIER_PATTERN.test(value.providerId)
    || value.outputSchemaVersion !== SPEC_ADAPTER_RESULT_SCHEMA_VERSION
    || value.unsupportedBehavior !== 'explicit-field-names'
    || !sourceKindsValid
    || !configurationValid
  ) fail(adapterId, 'INVALID_DESCRIPTOR')
  const descriptor: SpecAdapterDescriptor = {
    schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
    adapterId: value.adapterId,
    providerId: value.providerId,
    inputKind: value.inputKind as SpecAdapterDescriptor['inputKind'],
    outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
    sourceKinds,
    configurationRequirements: configurationRequirements as SpecAdapterDescriptor['configurationRequirements'],
    unsupportedBehavior: 'explicit-field-names',
  }
  return deepFreeze(descriptor)
}

export function discoverSpecAdapters(values: readonly unknown[]): SpecAdapterDiscovery {
  if (!Array.isArray(values) || values.length === 0 || values.length > 16) fail('discovery', 'INVALID_DISCOVERY')
  const adapters = values.map(createSpecAdapterDescriptor).sort((left, right) => compareText(left.adapterId, right.adapterId))
  if (new Set(adapters.map((entry) => entry.adapterId)).size !== adapters.length) fail('discovery', 'DUPLICATE_ADAPTER')
  return deepFreeze({ schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION, adapters })
}

function fieldName(value: unknown, adapterId: string, code: 'INVALID_MAPPING' | 'INVALID_RESULT' = 'INVALID_MAPPING'): string {
  if (typeof value !== 'string' || !FIELD_PATTERN.test(value)) fail(adapterId, code)
  return value
}

function fieldList(value: unknown, adapterId: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > SPEC_ADAPTER_MAX_FIELDS) fail(adapterId, 'INVALID_MAPPING')
  const result = value.map((entry) => fieldName(entry, adapterId))
  if (new Set(result).size !== result.length) fail(adapterId, 'INVALID_MAPPING')
  return result
}

export function validateSpecAdapterConfig(value: unknown, adapterId: string): ValidatedSpecAdapterConfig {
  if (!isRecord(value) || !exactKeys(value, ['baseUrl', 'mapping']) || typeof value.baseUrl !== 'string' || value.baseUrl.trim() !== value.baseUrl) {
    fail(adapterId, 'INVALID_CONFIG')
  }
  let url: URL
  try { url = new URL(value.baseUrl) } catch { return fail(adapterId, 'INVALID_CONFIG') }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
    || url.pathname !== '/'
    || url.href !== `${url.origin}/`
  ) fail(adapterId, 'INVALID_CONFIG')
  if (!isRecord(value.mapping) || !exactKeys(value.mapping, ['titleField', 'paragraphFields', 'unsupportedFields'])) {
    fail(adapterId, 'INVALID_MAPPING')
  }
  const titleField = fieldName(value.mapping.titleField, adapterId)
  const paragraphFields = fieldList(value.mapping.paragraphFields, adapterId)
  const unsupportedFields = fieldList(value.mapping.unsupportedFields, adapterId).sort(compareText)
  const owned = [titleField, ...paragraphFields, ...unsupportedFields]
  if (owned.length > SPEC_ADAPTER_MAX_FIELDS || new Set(owned).size !== owned.length) fail(adapterId, 'INVALID_MAPPING')
  return deepFreeze({ baseOrigin: url.origin, mapping: { titleField, paragraphFields, unsupportedFields } })
}

export function assertSpecAdapterFieldConservation(
  value: unknown,
  mapping: ValidatedSpecAdapterConfig['mapping'],
  adapterId: string,
): Record<string, unknown> {
  if (!isRecord(value)) fail(adapterId, 'INVALID_PAYLOAD')
  const actual = Object.keys(value).sort(compareText)
  if (actual.length === 0 || actual.length > SPEC_ADAPTER_MAX_FIELDS || actual.some((entry) => !FIELD_PATTERN.test(entry))) {
    fail(adapterId, 'INVALID_MAPPING')
  }
  const expected = [mapping.titleField, ...mapping.paragraphFields, ...mapping.unsupportedFields].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(adapterId, 'INVALID_MAPPING')
  return value
}

export function parseSpecAdapterJsonBytes(
  input: Readonly<SpecAdapterInput>,
  adapterId: string,
  hashPort: SpecAdapterHashPort,
): ParsedSpecAdapterJson {
  if (!isRecord(input) || !exactKeys(input, ['sourceBytes', 'sourceRef'])) fail(adapterId, 'INVALID_BYTES')
  if (!(input.sourceBytes instanceof Uint8Array) || input.sourceBytes.byteLength === 0) fail(adapterId, 'INVALID_BYTES')
  if (input.sourceBytes.byteLength > SPEC_ADAPTER_MAX_SOURCE_BYTES) fail(adapterId, 'SOURCE_TOO_LARGE')
  if (typeof input.sourceRef !== 'string' || !SOURCE_REF_PATTERN.test(input.sourceRef)) fail(adapterId, 'INVALID_SOURCE_REF')
  if (!isRecord(hashPort) || typeof hashPort.sha256 !== 'function') fail(adapterId, 'HASH_FAILURE')

  const exactBytes = new Uint8Array(input.sourceBytes)
  let sourceSha256: string
  try { sourceSha256 = hashPort.sha256(new Uint8Array(exactBytes)) } catch { return fail(adapterId, 'HASH_FAILURE') }
  if (!SHA256_PATTERN.test(sourceSha256)) fail(adapterId, 'HASH_FAILURE')

  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(exactBytes) } catch { return fail(adapterId, 'INVALID_UTF8') }
  let value: unknown
  try { value = JSON.parse(text) as unknown } catch { return fail(adapterId, 'INVALID_JSON') }
  return { sourceRef: input.sourceRef, sourceSha256, value }
}

export function extractSpecAdapterCriteria(
  paragraphs: ReadonlyArray<{ anchor: string; text: string }>,
  adapterId: string,
): SemanticSourceCriterion[] {
  const criteria: SemanticSourceCriterion[] = []
  for (const paragraph of paragraphs) {
    if (!AC_LEAD_IN.test(paragraph.text)) continue
    const id = `AC-${criteria.length + 1}`
    criteria.push({ id, text: paragraph.text, sourceAnchor: paragraph.anchor, sourceQuote: paragraph.text })
  }
  if (criteria.length === 0) fail(adapterId, 'NO_ACCEPTANCE_CRITERIA')
  return criteria
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= SPEC_ADAPTER_MAX_TEXT_CHARS
}

function validateSourceShape(value: unknown, descriptor: SpecAdapterDescriptor): SemanticSourceInput {
  const adapterId = descriptor.adapterId
  if (!isRecord(value)) fail(adapterId, 'INVALID_RESULT')
  const required = ['sourceKind', 'sourceRef', 'sourceSha256', 'title', 'paragraphs', 'acceptanceCriteria']
  const allowed = value.contractObservations === undefined ? required : [...required, 'contractObservations']
  if (!exactKeys(value, allowed)) fail(adapterId, 'INVALID_RESULT')
  if (
    typeof value.sourceKind !== 'string'
    || !descriptor.sourceKinds.includes(value.sourceKind)
    || typeof value.sourceRef !== 'string'
    || !SOURCE_REF_PATTERN.test(value.sourceRef)
  ) fail(adapterId, 'INVALID_RESULT')
  if (typeof value.sourceSha256 !== 'string' || !SHA256_PATTERN.test(value.sourceSha256)) fail(adapterId, 'INVALID_RESULT')
  if (value.title !== null && !nonEmptyText(value.title)) fail(adapterId, 'INVALID_RESULT')
  if (!Array.isArray(value.paragraphs) || value.paragraphs.length === 0 || value.paragraphs.length > SPEC_ADAPTER_MAX_PARAGRAPHS) fail(adapterId, 'INVALID_RESULT')
  const anchors = new Set<string>()
  let textChars = typeof value.title === 'string' ? value.title.length : 0
  for (const paragraph of value.paragraphs) {
    if (!isRecord(paragraph) || !exactKeys(paragraph, ['anchor', 'text']) || !nonEmptyText(paragraph.anchor) || !nonEmptyText(paragraph.text)) {
      fail(adapterId, 'INVALID_RESULT')
    }
    if (anchors.has(paragraph.anchor)) fail(adapterId, 'INVALID_RESULT')
    anchors.add(paragraph.anchor)
    textChars += paragraph.anchor.length + paragraph.text.length
  }
  if (textChars > SPEC_ADAPTER_MAX_TEXT_CHARS) fail(adapterId, 'INVALID_RESULT')
  if (!Array.isArray(value.acceptanceCriteria) || value.acceptanceCriteria.length === 0 || value.acceptanceCriteria.length > SPEC_ADAPTER_MAX_PARAGRAPHS) {
    fail(adapterId, 'INVALID_RESULT')
  }
  for (const criterion of value.acceptanceCriteria) {
    if (!isRecord(criterion) || !exactKeys(criterion, ['id', 'text', 'sourceAnchor', 'sourceQuote'])) fail(adapterId, 'INVALID_RESULT')
    if (![criterion.id, criterion.text, criterion.sourceAnchor, criterion.sourceQuote].every(nonEmptyText)) fail(adapterId, 'INVALID_RESULT')
    const paragraph = value.paragraphs.find((entry) => isRecord(entry) && entry.anchor === criterion.sourceAnchor)
    if (!isRecord(paragraph) || typeof paragraph.text !== 'string' || !paragraph.text.includes(criterion.sourceQuote as string)) fail(adapterId, 'INVALID_RESULT')
    textChars += (criterion.id as string).length
      + (criterion.text as string).length
      + (criterion.sourceAnchor as string).length
      + (criterion.sourceQuote as string).length
  }
  if (value.contractObservations !== undefined) {
    if (!Array.isArray(value.contractObservations)) fail(adapterId, 'INVALID_RESULT')
    for (const observation of value.contractObservations as unknown[]) {
      if (!isRecord(observation) || !exactKeys(observation, ['key', 'value', 'sourceAnchor', 'sourceQuote'])) fail(adapterId, 'INVALID_RESULT')
      if (![observation.key, observation.value, observation.sourceAnchor, observation.sourceQuote].every(nonEmptyText)) fail(adapterId, 'INVALID_RESULT')
      textChars += (observation.key as string).length
        + (observation.value as string).length
        + (observation.sourceAnchor as string).length
        + (observation.sourceQuote as string).length
    }
  }
  if (textChars > SPEC_ADAPTER_MAX_TEXT_CHARS) fail(adapterId, 'INVALID_RESULT')
  const source = clone(value as unknown as SemanticSourceInput)
  try { normalizeSemanticSpec(source) } catch { return fail(adapterId, 'INVALID_RESULT') }
  return source
}

function unsupportedFields(value: unknown, adapterId: string): string[] {
  if (!Array.isArray(value) || value.length > SPEC_ADAPTER_MAX_FIELDS) fail(adapterId, 'INVALID_RESULT')
  const fields = value.map((entry) => fieldName(entry, adapterId, 'INVALID_RESULT'))
  if (new Set(fields).size !== fields.length || JSON.stringify(fields) !== JSON.stringify([...fields].sort(compareText))) {
    fail(adapterId, 'INVALID_RESULT')
  }
  return fields
}

export function createSpecAdapterResult(input: {
  descriptor: SpecAdapterDescriptor
  source: SemanticSourceInput
  unsupportedFields: readonly string[]
}): SpecAdapterResult {
  if (!isRecord(input) || !exactKeys(input, ['descriptor', 'source', 'unsupportedFields'])) fail('unknown-adapter', 'INVALID_RESULT')
  const descriptor = createSpecAdapterDescriptor(input.descriptor)
  const source = validateSourceShape(input.source, descriptor)
  const result: SpecAdapterResult = {
    schemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
    adapterId: descriptor.adapterId,
    providerId: descriptor.providerId,
    capability: descriptor,
    source,
    unsupportedFields: unsupportedFields(input.unsupportedFields, descriptor.adapterId),
  }
  return deepFreeze(result)
}

export function validateSpecAdapterResult(value: unknown): SpecAdapterResult {
  const adapterId = isRecord(value) ? safeAdapterId(value.adapterId) : 'unknown-adapter'
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion', 'adapterId', 'providerId', 'capability', 'source', 'unsupportedFields',
  ])) fail(adapterId, 'INVALID_RESULT')
  if (value.schemaVersion !== SPEC_ADAPTER_RESULT_SCHEMA_VERSION || !isRecord(value.capability)) fail(adapterId, 'INVALID_RESULT')
  const descriptor = createSpecAdapterDescriptor(value.capability)
  if (value.adapterId !== descriptor.adapterId || value.providerId !== descriptor.providerId) fail(adapterId, 'INVALID_RESULT')
  return createSpecAdapterResult({
    descriptor,
    source: value.source as SemanticSourceInput,
    unsupportedFields: value.unsupportedFields as string[],
  })
}
