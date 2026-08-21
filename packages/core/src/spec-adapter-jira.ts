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

const ADAPTER_ID = 'jira-cloud-json-v1'

export const JIRA_SPEC_ADAPTER_DESCRIPTOR = createSpecAdapterDescriptor({
  schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  adapterId: ADAPTER_ID,
  providerId: 'jira',
  inputKind: 'utf8-json',
  outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  sourceKinds: ['jira'],
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
  const allowed = new Set(['id', 'key', 'fields', 'self', 'expand'])
  return ['id', 'key', 'fields'].every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actual.every((key) => allowed.has(key))
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()
}

interface ParseBudget {
  nodes: number
  paragraphs: number
  textChars: number
}

function countNode(budget: ParseBudget): void {
  budget.nodes += 1
  if (budget.nodes > SPEC_ADAPTER_MAX_NODES) fail('UNSUPPORTED_CONTENT')
}

function parseAdfDocument(value: unknown, field: string, budget: ParseBudget): Array<{ anchor: string; text: string }> {
  if (!isRecord(value) || !exactKeys(value, ['type', 'version', 'content']) || value.type !== 'doc' || value.version !== 1 || !Array.isArray(value.content) || value.content.length === 0) {
    fail('UNSUPPORTED_CONTENT')
  }
  countNode(budget)
  const paragraphs: Array<{ anchor: string; text: string }> = []
  for (const paragraph of value.content) {
    if (!isRecord(paragraph) || !exactKeys(paragraph, ['type', 'content']) || paragraph.type !== 'paragraph' || !Array.isArray(paragraph.content) || paragraph.content.length === 0) {
      fail('UNSUPPORTED_CONTENT')
    }
    countNode(budget)
    let text = ''
    for (const node of paragraph.content) {
      if (!isRecord(node) || !exactKeys(node, ['type', 'text']) || node.type !== 'text' || typeof node.text !== 'string' || node.text.length === 0) {
        fail('UNSUPPORTED_CONTENT')
      }
      countNode(budget)
      budget.textChars += node.text.length
      if (budget.textChars > SPEC_ADAPTER_MAX_TEXT_CHARS) fail('TEXT_TOO_LARGE')
      text += node.text
    }
    const normalized = normalizeText(text)
    if (normalized === '') fail('UNSUPPORTED_CONTENT')
    budget.paragraphs += 1
    if (budget.paragraphs > SPEC_ADAPTER_MAX_PARAGRAPHS) fail('UNSUPPORTED_CONTENT')
    paragraphs.push({ anchor: `jira:${field}:paragraph:${paragraphs.length + 1}`, text: normalized })
  }
  return paragraphs
}

export function createJiraSpecAdapter(config: SpecAdapterConfig, hashPort: SpecAdapterHashPort): SpecAdapter {
  const validated = validateSpecAdapterConfig(config, ADAPTER_ID)
  return Object.freeze({
    descriptor: JIRA_SPEC_ADAPTER_DESCRIPTOR,
    adapt(input: Readonly<SpecAdapterInput>) {
      const parsed = parseSpecAdapterJsonBytes(input, ADAPTER_ID, hashPort)
      if (!isRecord(parsed.value) || !wireKeys(parsed.value)) fail('INVALID_PAYLOAD')
      if (typeof parsed.value.id !== 'string' || parsed.value.id.trim() === '' || typeof parsed.value.key !== 'string' || parsed.value.key.trim() === '') {
        fail('INVALID_PAYLOAD')
      }
      const fields = assertSpecAdapterFieldConservation(parsed.value.fields, validated.mapping, ADAPTER_ID)
      const title = fields[validated.mapping.titleField]
      if (typeof title !== 'string' || title.trim() === '' || title.length > SPEC_ADAPTER_MAX_TEXT_CHARS) fail('INVALID_PAYLOAD')

      const budget: ParseBudget = { nodes: 0, paragraphs: 0, textChars: title.length }
      const paragraphs = validated.mapping.paragraphFields.flatMap((field) => parseAdfDocument(fields[field], field, budget))
      const acceptanceCriteria = extractSpecAdapterCriteria(paragraphs, ADAPTER_ID)
      return createSpecAdapterResult({
        descriptor: JIRA_SPEC_ADAPTER_DESCRIPTOR,
        source: {
          sourceKind: 'jira',
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
