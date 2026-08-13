import crypto from 'node:crypto'

export const SEMANTIC_SPEC_SCHEMA_VERSION = '1.0.0' as const

export type SemanticContractState = 'known' | 'unknown' | 'conflict'

export interface SemanticSourceDocument {
  sourceKind: string
  sourceRef: string
  sourceSha256: string
}

export interface SemanticProvenance {
  sourceKind: string
  sourceRef: string
  sourceSha256: string
  anchor: string
  quote: string
}

export interface SemanticScenario {
  given: string
  when: string
  then: string
}

export interface SemanticRequirement {
  id: string
  statement: string
  scenario: SemanticScenario | null
  provenance: SemanticProvenance[]
}

export interface SemanticContract {
  key: string
  state: SemanticContractState
  values: string[]
  provenance: SemanticProvenance[]
}

export interface SemanticAmbiguity {
  code: 'API_CONTRACT_UNSPECIFIED' | 'CONTRACT_CONFLICT' | 'UNSTRUCTURED_ACCEPTANCE_CRITERION'
  field: string
  message: string
  provenance: SemanticProvenance[]
}

export interface SemanticSpec {
  schemaVersion: typeof SEMANTIC_SPEC_SCHEMA_VERSION
  title: string | null
  sourceDocuments: SemanticSourceDocument[]
  requirements: SemanticRequirement[]
  contracts: SemanticContract[]
  ambiguities: SemanticAmbiguity[]
  semanticHash: string
  provenanceHash: string
}

export interface SemanticSourceCriterion {
  id: string
  text: string
  sourceAnchor: string
  sourceQuote: string
}

export interface SemanticContractObservation {
  key: string
  value: string
  sourceAnchor: string
  sourceQuote: string
}

export interface SemanticSourceInput {
  sourceKind: string
  sourceRef: string
  sourceSha256: string
  title: string | null
  paragraphs?: Array<{ anchor: string; text: string }>
  acceptanceCriteria: SemanticSourceCriterion[]
  contractObservations?: SemanticContractObservation[]
}

export interface SemanticNormalizationOptions {
  requiredContractKeys?: string[]
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const DEFAULT_CONTRACT_KEYS = ['api.contract']

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactFields(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const wanted = [...expected].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`semantic-spec: ${label} fields must be exactly ${wanted.join(', ')}`)
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`semantic-spec: ${label} must be a non-empty string`)
  return value
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null
  return nonEmptyString(value, label)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim()
}

function stripMarkdown(value: string): string {
  return normalizeWhitespace(value.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/`([^`]+)`/g, '$1'))
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[;,.\s]+$/g, '').trim()
}

function sentenceCase(value: string): string {
  const normalized = trimTerminalPunctuation(value)
  return normalized.length === 0 ? normalized : normalized[0].toLocaleUpperCase('en-US') + normalized.slice(1)
}

function canonicalMeaning(value: string): string {
  return trimTerminalPunctuation(stripMarkdown(value)).toLocaleLowerCase('en-US')
}

function sourceKey(source: SemanticSourceDocument): string {
  return `${source.sourceKind}\u0000${source.sourceRef}\u0000${source.sourceSha256}`
}

function provenanceKey(provenance: SemanticProvenance): string {
  return `${sourceKey(provenance)}\u0000${provenance.anchor}\u0000${provenance.quote}`
}

function provenanceFor(input: SemanticSourceInput, anchor: string, quote: string): SemanticProvenance {
  return {
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    sourceSha256: input.sourceSha256,
    anchor,
    quote,
  }
}

function cleanAcPrefix(value: string): string {
  return stripMarkdown(value).replace(/^\s*(?:AC[-\s]?\d+|acceptance\s+criteri(?:a|on)\s+\d+)\s*[:.)-]?\s*/i, '').trim()
}

function tableScenario(value: string): SemanticScenario | null {
  const text = value.trim()
  if (!text.startsWith('|') || !text.endsWith('|')) return null
  const cells = text.slice(1, -1).split('|').map(stripMarkdown)
  if (cells.length < 4 || !/^(?:AC[-\s]?\d+|\d+)$/i.test(cells[0])) return null
  const [given, when, then] = cells.slice(1, 4).map(sentenceCase)
  return given && when && then ? { given, when, then } : null
}

function proseScenario(value: string): SemanticScenario | null {
  const text = cleanAcPrefix(value)
  const match = text.match(/^given\s*:?\s*(.+?)\s*[.;]?\s*when\s*:?\s*(.+?)\s*[.;]?\s*then\s*:?\s*(.+)$/i)
  if (!match) return null
  const [given, when, then] = match.slice(1, 4).map(sentenceCase)
  return given && when && then ? { given, when, then } : null
}

function parseCriterion(criterion: SemanticSourceCriterion): { statement: string; scenario: SemanticScenario | null } {
  const scenario = tableScenario(criterion.text) ?? proseScenario(criterion.text)
  if (!scenario) return { statement: cleanAcPrefix(criterion.text), scenario: null }
  return {
    statement: `Given ${scenario.given}; when ${scenario.when}; then ${scenario.then}.`,
    scenario,
  }
}

function semanticPayload(spec: Omit<SemanticSpec, 'semanticHash' | 'provenanceHash'>): unknown {
  return {
    title: spec.title === null ? null : canonicalMeaning(spec.title),
    requirements: spec.requirements.map((requirement) => ({
      id: requirement.id,
      statement: canonicalMeaning(requirement.statement),
      scenario: requirement.scenario === null ? null : {
        given: canonicalMeaning(requirement.scenario.given),
        when: canonicalMeaning(requirement.scenario.when),
        then: canonicalMeaning(requirement.scenario.then),
      },
    })),
    contracts: spec.contracts.map((contract) => ({
      key: contract.key,
      state: contract.state,
      values: contract.values.map(canonicalMeaning).sort(compareText),
    })),
    ambiguities: spec.ambiguities.map((ambiguity) => ({ code: ambiguity.code, field: ambiguity.field })),
  }
}

function provenancePayload(spec: Omit<SemanticSpec, 'semanticHash' | 'provenanceHash'>): unknown {
  return {
    sourceDocuments: spec.sourceDocuments,
    requirements: spec.requirements.map((requirement) => ({ id: requirement.id, provenance: requirement.provenance })),
    contracts: spec.contracts.map((contract) => ({ key: contract.key, provenance: contract.provenance })),
    ambiguities: spec.ambiguities.map((ambiguity) => ({ code: ambiguity.code, field: ambiguity.field, provenance: ambiguity.provenance })),
  }
}

function withHashes(spec: Omit<SemanticSpec, 'semanticHash' | 'provenanceHash'>): SemanticSpec {
  return {
    ...spec,
    semanticHash: sha256(stableJson(semanticPayload(spec))),
    provenanceHash: sha256(stableJson(provenancePayload(spec))),
  }
}

function assertSourceInput(input: SemanticSourceInput): void {
  nonEmptyString(input.sourceKind, 'sourceKind')
  nonEmptyString(input.sourceRef, 'sourceRef')
  if (!SHA256_PATTERN.test(input.sourceSha256)) throw new Error('semantic-spec: sourceSha256 must be lowercase SHA-256')
  nullableString(input.title, 'title')
  if (!Array.isArray(input.acceptanceCriteria) || input.acceptanceCriteria.length === 0) {
    throw new Error('semantic-spec: at least one acceptance criterion is required')
  }
  const paragraphs = new Map<string, string>()
  for (const paragraph of input.paragraphs ?? []) {
    const anchor = nonEmptyString(paragraph.anchor, 'paragraph.anchor')
    if (paragraphs.has(anchor)) throw new Error(`semantic-spec: duplicate paragraph anchor ${anchor}`)
    paragraphs.set(anchor, nonEmptyString(paragraph.text, 'paragraph.text'))
  }
  const criterionIds = new Set<string>()
  for (const criterion of input.acceptanceCriteria) {
    const id = nonEmptyString(criterion.id, 'acceptanceCriterion.id')
    if (criterionIds.has(id)) throw new Error(`semantic-spec: duplicate acceptance criterion ${id}`)
    criterionIds.add(id)
    nonEmptyString(criterion.text, `${id}.text`)
    const anchor = nonEmptyString(criterion.sourceAnchor, `${id}.sourceAnchor`)
    const quote = nonEmptyString(criterion.sourceQuote, `${id}.sourceQuote`)
    if (paragraphs.size > 0) {
      const paragraph = paragraphs.get(anchor)
      if (paragraph === undefined || !paragraph.includes(quote)) throw new Error(`semantic-spec: ${id} provenance does not resolve literally`)
    }
  }
  for (const [index, observation] of (input.contractObservations ?? []).entries()) {
    nonEmptyString(observation.key, `contractObservations[${index}].key`)
    nonEmptyString(observation.value, `contractObservations[${index}].value`)
    const anchor = nonEmptyString(observation.sourceAnchor, `contractObservations[${index}].sourceAnchor`)
    const quote = nonEmptyString(observation.sourceQuote, `contractObservations[${index}].sourceQuote`)
    if (paragraphs.size > 0) {
      const paragraph = paragraphs.get(anchor)
      if (paragraph === undefined || !paragraph.includes(quote)) throw new Error(`semantic-spec: contract observation ${index} provenance does not resolve literally`)
    }
  }
}

export function normalizeSemanticSpec(input: SemanticSourceInput, options: SemanticNormalizationOptions = {}): SemanticSpec {
  assertSourceInput(input)
  const document: SemanticSourceDocument = {
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    sourceSha256: input.sourceSha256,
  }
  const requirements: SemanticRequirement[] = input.acceptanceCriteria.map((criterion) => {
    const parsed = parseCriterion(criterion)
    return {
      id: criterion.id,
      statement: parsed.statement,
      scenario: parsed.scenario,
      provenance: [provenanceFor(input, criterion.sourceAnchor, criterion.sourceQuote)],
    }
  })
  const ambiguities: SemanticAmbiguity[] = requirements
    .filter((requirement) => requirement.scenario === null)
    .map((requirement) => ({
      code: 'UNSTRUCTURED_ACCEPTANCE_CRITERION',
      field: `requirements.${requirement.id}.scenario`,
      message: `${requirement.id} does not declare a complete Given/When/Then scenario.`,
      provenance: requirement.provenance,
    }))

  const observations = input.contractObservations ?? []
  const requiredKeys = [...new Set([...(options.requiredContractKeys ?? DEFAULT_CONTRACT_KEYS), ...observations.map((entry) => entry.key)])].sort(compareText)
  const contracts: SemanticContract[] = requiredKeys.map((key) => {
    const matching = observations.filter((entry) => entry.key === key)
    const values = [...new Set(matching.map((entry) => stripMarkdown(entry.value)))].sort(compareText)
    const provenance = matching.map((entry) => provenanceFor(input, entry.sourceAnchor, entry.sourceQuote)).sort((left, right) => compareText(provenanceKey(left), provenanceKey(right)))
    const state: SemanticContractState = values.length === 0 ? 'unknown' : values.length === 1 ? 'known' : 'conflict'
    if (state === 'unknown') {
      ambiguities.push({
        code: 'API_CONTRACT_UNSPECIFIED',
        field: key,
        message: `No source-backed value was provided for ${key}.`,
        provenance: [],
      })
    } else if (state === 'conflict') {
      ambiguities.push({
        code: 'CONTRACT_CONFLICT',
        field: key,
        message: `Multiple source-backed values were provided for ${key}.`,
        provenance,
      })
    }
    return { key, state, values, provenance }
  })

  return validateSemanticSpec(withHashes({
    schemaVersion: SEMANTIC_SPEC_SCHEMA_VERSION,
    title: input.title === null ? null : stripMarkdown(input.title),
    sourceDocuments: [document],
    requirements,
    contracts,
    ambiguities,
  }))
}

function validateProvenance(value: unknown, label: string, sources: Set<string>): SemanticProvenance {
  if (!isRecord(value)) throw new Error(`semantic-spec: ${label} must be an object`)
  exactFields(value, ['sourceKind', 'sourceRef', 'sourceSha256', 'anchor', 'quote'], label)
  const result: SemanticProvenance = {
    sourceKind: nonEmptyString(value.sourceKind, `${label}.sourceKind`),
    sourceRef: nonEmptyString(value.sourceRef, `${label}.sourceRef`),
    sourceSha256: nonEmptyString(value.sourceSha256, `${label}.sourceSha256`),
    anchor: nonEmptyString(value.anchor, `${label}.anchor`),
    quote: nonEmptyString(value.quote, `${label}.quote`),
  }
  if (!SHA256_PATTERN.test(result.sourceSha256)) throw new Error(`semantic-spec: ${label}.sourceSha256 must be lowercase SHA-256`)
  if (!sources.has(sourceKey(result))) throw new Error(`semantic-spec: ${label} references an undeclared source document`)
  return result
}

function validateProvenanceList(value: unknown, label: string, sources: Set<string>, required: boolean): SemanticProvenance[] {
  if (!Array.isArray(value) || (required && value.length === 0)) throw new Error(`semantic-spec: ${label} must be ${required ? 'a non-empty' : 'an'} array`)
  const result = value.map((entry, index) => validateProvenance(entry, `${label}[${index}]`, sources))
  const keys = result.map(provenanceKey)
  if (new Set(keys).size !== keys.length) throw new Error(`semantic-spec: ${label} contains duplicate provenance`)
  return result
}

export function validateSemanticSpec(value: unknown): SemanticSpec {
  if (!isRecord(value)) throw new Error('semantic-spec: document must be an object')
  exactFields(value, ['schemaVersion', 'title', 'sourceDocuments', 'requirements', 'contracts', 'ambiguities', 'semanticHash', 'provenanceHash'], 'document')
  if (value.schemaVersion !== SEMANTIC_SPEC_SCHEMA_VERSION) throw new Error(`semantic-spec: unsupported schemaVersion ${String(value.schemaVersion)}`)
  nullableString(value.title, 'title')
  if (!Array.isArray(value.sourceDocuments) || value.sourceDocuments.length === 0) throw new Error('semantic-spec: sourceDocuments must be a non-empty array')
  const sources = new Set<string>()
  for (const [index, entry] of value.sourceDocuments.entries()) {
    if (!isRecord(entry)) throw new Error(`semantic-spec: sourceDocuments[${index}] must be an object`)
    exactFields(entry, ['sourceKind', 'sourceRef', 'sourceSha256'], `sourceDocuments[${index}]`)
    const source: SemanticSourceDocument = {
      sourceKind: nonEmptyString(entry.sourceKind, `sourceDocuments[${index}].sourceKind`),
      sourceRef: nonEmptyString(entry.sourceRef, `sourceDocuments[${index}].sourceRef`),
      sourceSha256: nonEmptyString(entry.sourceSha256, `sourceDocuments[${index}].sourceSha256`),
    }
    if (!SHA256_PATTERN.test(source.sourceSha256)) throw new Error(`semantic-spec: sourceDocuments[${index}].sourceSha256 must be lowercase SHA-256`)
    const key = sourceKey(source)
    if (sources.has(key)) throw new Error('semantic-spec: sourceDocuments contains duplicates')
    sources.add(key)
  }
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) throw new Error('semantic-spec: requirements must be a non-empty array')
  const requirementIds = new Set<string>()
  for (const [index, entry] of value.requirements.entries()) {
    if (!isRecord(entry)) throw new Error(`semantic-spec: requirements[${index}] must be an object`)
    exactFields(entry, ['id', 'statement', 'scenario', 'provenance'], `requirements[${index}]`)
    const id = nonEmptyString(entry.id, `requirements[${index}].id`)
    if (requirementIds.has(id)) throw new Error(`semantic-spec: duplicate requirement ${id}`)
    requirementIds.add(id)
    nonEmptyString(entry.statement, `requirements[${index}].statement`)
    if (entry.scenario !== null) {
      if (!isRecord(entry.scenario)) throw new Error(`semantic-spec: requirements[${index}].scenario must be an object or null`)
      exactFields(entry.scenario, ['given', 'when', 'then'], `requirements[${index}].scenario`)
      nonEmptyString(entry.scenario.given, `requirements[${index}].scenario.given`)
      nonEmptyString(entry.scenario.when, `requirements[${index}].scenario.when`)
      nonEmptyString(entry.scenario.then, `requirements[${index}].scenario.then`)
    }
    validateProvenanceList(entry.provenance, `requirements[${index}].provenance`, sources, true)
  }
  if (!Array.isArray(value.contracts)) throw new Error('semantic-spec: contracts must be an array')
  const contractKeys = new Set<string>()
  for (const [index, entry] of value.contracts.entries()) {
    if (!isRecord(entry)) throw new Error(`semantic-spec: contracts[${index}] must be an object`)
    exactFields(entry, ['key', 'state', 'values', 'provenance'], `contracts[${index}]`)
    const key = nonEmptyString(entry.key, `contracts[${index}].key`)
    if (contractKeys.has(key)) throw new Error(`semantic-spec: duplicate contract ${key}`)
    contractKeys.add(key)
    if (!['known', 'unknown', 'conflict'].includes(String(entry.state))) throw new Error(`semantic-spec: contracts[${index}].state is invalid`)
    if (!Array.isArray(entry.values) || entry.values.some((item) => typeof item !== 'string' || item.trim() === '')) throw new Error(`semantic-spec: contracts[${index}].values must contain non-empty strings`)
    const uniqueValues = new Set(entry.values as string[])
    if (uniqueValues.size !== entry.values.length) throw new Error(`semantic-spec: contracts[${index}].values contains duplicates`)
    const provenance = validateProvenanceList(entry.provenance, `contracts[${index}].provenance`, sources, entry.state !== 'unknown')
    if (entry.state === 'unknown' && (entry.values.length !== 0 || provenance.length !== 0)) throw new Error(`semantic-spec: unknown contract ${key} cannot carry guessed values or provenance`)
    if (entry.state === 'known' && entry.values.length !== 1) throw new Error(`semantic-spec: known contract ${key} must carry exactly one value`)
    if (entry.state === 'conflict' && entry.values.length < 2) throw new Error(`semantic-spec: conflicting contract ${key} must carry at least two values`)
  }
  if (!Array.isArray(value.ambiguities)) throw new Error('semantic-spec: ambiguities must be an array')
  const ambiguityKeys = new Set<string>()
  for (const [index, entry] of value.ambiguities.entries()) {
    if (!isRecord(entry)) throw new Error(`semantic-spec: ambiguities[${index}] must be an object`)
    exactFields(entry, ['code', 'field', 'message', 'provenance'], `ambiguities[${index}]`)
    if (!['API_CONTRACT_UNSPECIFIED', 'CONTRACT_CONFLICT', 'UNSTRUCTURED_ACCEPTANCE_CRITERION'].includes(String(entry.code))) throw new Error(`semantic-spec: ambiguities[${index}].code is invalid`)
    const field = nonEmptyString(entry.field, `ambiguities[${index}].field`)
    const ambiguityKey = `${String(entry.code)}\u0000${field}`
    if (ambiguityKeys.has(ambiguityKey)) throw new Error(`semantic-spec: duplicate ambiguity ${String(entry.code)} for ${field}`)
    ambiguityKeys.add(ambiguityKey)
    nonEmptyString(entry.message, `ambiguities[${index}].message`)
    validateProvenanceList(entry.provenance, `ambiguities[${index}].provenance`, sources, false)
  }
  for (const entry of value.contracts as Array<Record<string, unknown>>) {
    const code = entry.state === 'unknown' ? 'API_CONTRACT_UNSPECIFIED' : entry.state === 'conflict' ? 'CONTRACT_CONFLICT' : null
    if (code !== null && !ambiguityKeys.has(`${code}\u0000${String(entry.key)}`)) {
      throw new Error(`semantic-spec: ${String(entry.state)} contract ${String(entry.key)} requires ${code} ambiguity`)
    }
  }
  for (const entry of value.requirements as Array<Record<string, unknown>>) {
    const field = `requirements.${String(entry.id)}.scenario`
    if (entry.scenario === null && !ambiguityKeys.has(`UNSTRUCTURED_ACCEPTANCE_CRITERION\u0000${field}`)) {
      throw new Error(`semantic-spec: unstructured requirement ${String(entry.id)} requires explicit ambiguity`)
    }
  }
  if (typeof value.semanticHash !== 'string' || !SHA256_PATTERN.test(value.semanticHash)) throw new Error('semantic-spec: semanticHash must be lowercase SHA-256')
  if (typeof value.provenanceHash !== 'string' || !SHA256_PATTERN.test(value.provenanceHash)) throw new Error('semantic-spec: provenanceHash must be lowercase SHA-256')
  const spec = value as unknown as SemanticSpec
  const unhashed: Omit<SemanticSpec, 'semanticHash' | 'provenanceHash'> = {
    schemaVersion: spec.schemaVersion,
    title: spec.title,
    sourceDocuments: spec.sourceDocuments,
    requirements: spec.requirements,
    contracts: spec.contracts,
    ambiguities: spec.ambiguities,
  }
  if (spec.semanticHash !== sha256(stableJson(semanticPayload(unhashed)))) throw new Error('semantic-spec: semanticHash mismatch')
  if (spec.provenanceHash !== sha256(stableJson(provenancePayload(unhashed)))) throw new Error('semantic-spec: provenanceHash mismatch')
  return spec
}

export function parseSemanticSpec(json: string): SemanticSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('semantic-spec: input is not valid JSON')
  }
  return validateSemanticSpec(parsed)
}

export function transformSemanticRequirements(
  spec: SemanticSpec,
  transform: (requirement: Readonly<SemanticRequirement>) => Pick<SemanticRequirement, 'statement' | 'scenario'>,
): SemanticSpec {
  validateSemanticSpec(spec)
  const requirements = spec.requirements.map((requirement) => {
    const changed = transform(structuredClone(requirement))
    return { ...requirement, statement: changed.statement, scenario: changed.scenario, provenance: structuredClone(requirement.provenance) }
  })
  const transformed = withHashes({
    schemaVersion: spec.schemaVersion,
    title: spec.title,
    sourceDocuments: structuredClone(spec.sourceDocuments),
    requirements,
    contracts: structuredClone(spec.contracts),
    ambiguities: structuredClone(spec.ambiguities),
  })
  assertSemanticFieldConservation(spec, transformed)
  return validateSemanticSpec(transformed)
}

export function assertSemanticFieldConservation(before: SemanticSpec, after: SemanticSpec): void {
  validateSemanticSpec(before)
  validateSemanticSpec(after)
  const conserved = (spec: SemanticSpec) => stableJson({
    sourceDocuments: spec.sourceDocuments,
    requirements: spec.requirements.map((entry) => ({ id: entry.id, provenance: entry.provenance })),
    contracts: spec.contracts.map((entry) => ({ key: entry.key, provenance: entry.provenance })),
  })
  if (conserved(before) !== conserved(after)) throw new Error('semantic-spec: transform lost or changed conserved fields')
}
