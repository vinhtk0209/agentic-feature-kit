import {
  SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  SPEC_ADAPTER_MAX_NODES,
  SPEC_ADAPTER_MAX_PARAGRAPHS,
  SPEC_ADAPTER_MAX_TEXT_CHARS,
  SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  SpecAdapterError,
  assertSpecAdapterFieldConservation,
  createSpecAdapterDescriptor,
  createSpecAdapterResult,
  extractSpecAdapterCriteria,
  parseSpecAdapterJsonBytes,
  validateSpecAdapterConfig,
  type SpecAdapter,
  type SpecAdapterConfig,
  type SpecAdapterHashPort,
  type SpecAdapterInput,
} from './spec-adapter'

const ADAPTER_ID = 'azure-devops-work-item-json-v1'

export const AZURE_DEVOPS_SPEC_ADAPTER_DESCRIPTOR = createSpecAdapterDescriptor({
  schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  adapterId: ADAPTER_ID,
  providerId: 'azure-devops',
  inputKind: 'utf8-json',
  outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  sourceKinds: ['azure-devops'],
  configurationRequirements: ['base-url', 'field-mapping'],
  unsupportedBehavior: 'explicit-field-names',
})

function fail(code: ConstructorParameters<typeof SpecAdapterError>[1]): never {
  throw new SpecAdapterError(ADAPTER_ID, code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
  return JSON.stringify(Object.keys(value).sort(compare)) === JSON.stringify([...expected].sort(compare))
}

function wireKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value)
  const allowed = new Set(['id', 'rev', 'fields', 'url', '_links'])
  return ['id', 'rev', 'fields', 'url'].every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => allowed.has(key))
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()
}

const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
  '#39': "'",
  '#x27': "'",
})

function decodeEntities(value: string): string {
  let decoded = ''
  for (let index = 0; index < value.length;) {
    if (value[index] !== '&') {
      decoded += value[index]
      index += 1
      continue
    }
    const end = value.indexOf(';', index + 1)
    if (end < 0) fail('UNSUPPORTED_CONTENT')
    const entity = value.slice(index + 1, end)
    const replacement = ENTITIES[entity]
    if (replacement === undefined) fail('UNSUPPORTED_CONTENT')
    decoded += replacement
    index = end + 1
  }
  return decoded
}

interface ParseBudget {
  nodes: number
  paragraphs: number
  textChars: number
}

function parseParagraphHtml(value: unknown, field: string, budget: ParseBudget): Array<{ anchor: string; text: string }> {
  if (typeof value !== 'string' || value.length === 0) fail('UNSUPPORTED_CONTENT')
  const paragraphs: Array<{ anchor: string; text: string }> = []
  const tokens = /<[^>]*>|[^<]+/g
  let cursor = 0
  let open = false
  let current = ''
  for (const match of value.matchAll(tokens)) {
    if (match.index !== cursor) fail('UNSUPPORTED_CONTENT')
    const token = match[0]
    cursor += token.length
    if (token.startsWith('<')) {
      budget.nodes += 1
      if (budget.nodes > SPEC_ADAPTER_MAX_NODES) fail('UNSUPPORTED_CONTENT')
      if (token === '<p>' && !open) {
        open = true
        current = ''
      } else if (token === '</p>' && open) {
        const text = normalizeText(current)
        if (text === '') fail('UNSUPPORTED_CONTENT')
        budget.paragraphs += 1
        if (budget.paragraphs > SPEC_ADAPTER_MAX_PARAGRAPHS) fail('UNSUPPORTED_CONTENT')
        paragraphs.push({ anchor: `azure-devops:${field}:paragraph:${paragraphs.length + 1}`, text })
        open = false
        current = ''
      } else {
        fail('UNSUPPORTED_CONTENT')
      }
    } else if (open) {
      const decoded = decodeEntities(token)
      budget.textChars += decoded.length
      if (budget.textChars > SPEC_ADAPTER_MAX_TEXT_CHARS) fail('TEXT_TOO_LARGE')
      current += decoded
    } else if (token.trim() !== '') {
      fail('UNSUPPORTED_CONTENT')
    }
  }
  if (cursor !== value.length || open || paragraphs.length === 0) fail('UNSUPPORTED_CONTENT')
  return paragraphs
}

function assertPayloadOrigin(value: unknown, expectedOrigin: string): void {
  if (typeof value !== 'string') fail('PROVIDER_MISMATCH')
  let url: URL
  try { url = new URL(value) } catch { return fail('PROVIDER_MISMATCH') }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.origin !== expectedOrigin
  ) fail('PROVIDER_MISMATCH')
}

export function createAzureDevOpsSpecAdapter(config: SpecAdapterConfig, hashPort: SpecAdapterHashPort): SpecAdapter {
  const validated = validateSpecAdapterConfig(config, ADAPTER_ID)
  return Object.freeze({
    descriptor: AZURE_DEVOPS_SPEC_ADAPTER_DESCRIPTOR,
    adapt(input: Readonly<SpecAdapterInput>) {
      const parsed = parseSpecAdapterJsonBytes(input, ADAPTER_ID, hashPort)
      if (!isRecord(parsed.value) || !wireKeys(parsed.value)) fail('INVALID_PAYLOAD')
      if (!Number.isSafeInteger(parsed.value.id) || (parsed.value.id as number) <= 0 || !Number.isSafeInteger(parsed.value.rev) || (parsed.value.rev as number) <= 0) {
        fail('INVALID_PAYLOAD')
      }
      assertPayloadOrigin(parsed.value.url, validated.baseOrigin)
      const fields = assertSpecAdapterFieldConservation(parsed.value.fields, validated.mapping, ADAPTER_ID)
      const title = fields[validated.mapping.titleField]
      if (typeof title !== 'string' || title.trim() === '' || title.length > SPEC_ADAPTER_MAX_TEXT_CHARS) fail('INVALID_PAYLOAD')

      const budget: ParseBudget = { nodes: 0, paragraphs: 0, textChars: title.length }
      const paragraphs = validated.mapping.paragraphFields.flatMap((field) => parseParagraphHtml(fields[field], field, budget))
      const acceptanceCriteria = extractSpecAdapterCriteria(paragraphs, ADAPTER_ID)
      return createSpecAdapterResult({
        descriptor: AZURE_DEVOPS_SPEC_ADAPTER_DESCRIPTOR,
        source: {
          sourceKind: 'azure-devops',
          sourceRef: parsed.sourceRef,
          sourceSha256: parsed.sourceSha256,
          title: normalizeText(title),
          paragraphs,
          acceptanceCriteria,
        },
        unsupportedFields: validated.mapping.unsupportedFields,
      })
    },
  })
}
