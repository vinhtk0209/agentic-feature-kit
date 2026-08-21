/** Canonical provider-neutral SpecIR schema and provenance validator. */
import * as crypto from 'node:crypto'

export interface AnchoredParagraph {
  anchor: string
  text: string
}

export interface SpecAc {
  id: string
  text: string
  sourceAnchor: string
  sourceQuote: string
}

export type SourceKind = 'confluence' | 'excel' | 'pdf' | 'raw-us' | 'word'

export interface SpecIR {
  schemaVersion: 1
  sourceKind: SourceKind
  sourceRef: string
  sourceSha256: string
  title: string | null
  paragraphs: AnchoredParagraph[]
  acceptanceCriteria: SpecAc[]
  warnings: string[]
}

export class SpecAdapterError extends Error {
  constructor(
    public readonly sourceKind: SourceKind,
    public readonly reason: string,
    public readonly sourceRef?: string,
  ) {
    super(`spec-adapter-fail-closed: [${sourceKind}] ${reason}${sourceRef ? ` (source: ${sourceRef})` : ''}`)
    this.name = 'SpecAdapterError'
  }
}

export class SpecIrValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`spec-ir-invalid: ${issues.join('; ')}`)
    this.name = 'SpecIrValidationError'
  }
}

export const sha256 = (value: Buffer | string): string =>
  crypto.createHash('sha256').update(value).digest('hex')

const SOURCE_KINDS: readonly SourceKind[] = ['confluence', 'excel', 'pdf', 'raw-us', 'word']
const MAX_PARAGRAPHS = 256
const MAX_ACCEPTANCE_CRITERIA = 256
const MAX_WARNINGS = 64
const MAX_TEXT_CHARS = 128 * 1024
const MAX_WARNING_CHARS = 1024
const IR_FIELDS = [
  'schemaVersion',
  'sourceKind',
  'sourceRef',
  'sourceSha256',
  'title',
  'paragraphs',
  'acceptanceCriteria',
  'warnings',
].sort()
const AC_LEAD_IN = /^\s*(?:\|\s*(?:\*\*|__)?AC[-\s]?\d+(?:\*\*|__)?\s*\||AC[-\s]?\d+[:.)]?|(?:acceptance\s+criteri(?:a|on)\s+\d+[:.)]?)|\d+[).]\s|[-*•]\s*(?:given|when|then)\b|given\b.*\bwhen\b.*\bthen\b)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyText(value: unknown, maxChars = MAX_TEXT_CHARS): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= maxChars
}

export function extractAcceptanceCriteria(paragraphs: AnchoredParagraph[]): SpecAc[] {
  const acceptanceCriteria: SpecAc[] = []
  for (const paragraph of paragraphs) {
    const text = paragraph.text.trim()
    if (!text || !AC_LEAD_IN.test(text)) continue
    acceptanceCriteria.push({
      id: `AC-${acceptanceCriteria.length + 1}`,
      text,
      sourceAnchor: paragraph.anchor,
      sourceQuote: text,
    })
  }
  return acceptanceCriteria
}

export function validateSpecIR(value: SpecIR): SpecIR {
  const issues: string[] = []
  if (!isRecord(value)) throw new SpecIrValidationError(['document must be an object'])
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(IR_FIELDS)) {
    issues.push(`fields must be exactly ${IR_FIELDS.join(', ')}`)
  }
  if (value.schemaVersion !== 1) issues.push('schemaVersion is unsupported')
  if (!SOURCE_KINDS.includes(value.sourceKind)) issues.push('sourceKind is unsupported')
  if (!nonEmptyText(value.sourceRef, 256)) issues.push('sourceRef must be bounded non-empty text')
  if (!nonEmptyText(value.sourceSha256, 64)) issues.push('sourceSha256 must be bounded non-empty text')
  if (value.title !== null && !nonEmptyText(value.title)) issues.push('title must be null or non-empty')
  const paragraphs = Array.isArray(value.paragraphs) && value.paragraphs.length <= MAX_PARAGRAPHS
    ? value.paragraphs
    : []
  if (!Array.isArray(value.paragraphs)) issues.push('paragraphs must be an array')
  else if (value.paragraphs.length > MAX_PARAGRAPHS) issues.push('paragraphs exceed the item bound')
  const acceptanceCriteria = Array.isArray(value.acceptanceCriteria)
    && value.acceptanceCriteria.length <= MAX_ACCEPTANCE_CRITERIA
    ? value.acceptanceCriteria
    : []
  if (!Array.isArray(value.acceptanceCriteria)) issues.push('acceptanceCriteria must be an array')
  else if (value.acceptanceCriteria.length > MAX_ACCEPTANCE_CRITERIA) issues.push('acceptanceCriteria exceed the item bound')
  const warnings = Array.isArray(value.warnings) && value.warnings.length <= MAX_WARNINGS
    ? value.warnings
    : []
  if (!Array.isArray(value.warnings)) issues.push('warnings must be an array')
  else if (value.warnings.length > MAX_WARNINGS) issues.push('warnings exceed the item bound')

  const byAnchor = new Map<string, string>()
  let textChars = typeof value.title === 'string' ? value.title.length : 0
  for (let index = 0; index < paragraphs.length; index += 1) {
    let paragraph: unknown
    try { paragraph = paragraphs[index] } catch { issues.push(`paragraphs[${index}] is inaccessible`); continue }
    if (!isRecord(paragraph) || JSON.stringify(Object.keys(paragraph).sort()) !== JSON.stringify(['anchor', 'text'])) {
      issues.push(`paragraphs[${index}] fields must be exactly anchor, text`)
      continue
    }
    if (!nonEmptyText(paragraph.anchor) || !nonEmptyText(paragraph.text)) {
      issues.push(`paragraphs[${index}] anchor and text must be non-empty`)
      continue
    }
    textChars += paragraph.anchor.length + paragraph.text.length
    if (textChars > MAX_TEXT_CHARS) issues.push('paragraph text exceeds the cumulative character bound')
    if (byAnchor.has(paragraph.anchor)) issues.push(`paragraphs[${index}] duplicates an anchor`)
    byAnchor.set(paragraph.anchor, paragraph.text)
  }

  const seenAcIds = new Set<string>()
  for (let index = 0; index < acceptanceCriteria.length; index += 1) {
    let criterion: unknown
    try { criterion = acceptanceCriteria[index] } catch { issues.push(`acceptanceCriteria[${index}] is inaccessible`); continue }
    if (!isRecord(criterion) || JSON.stringify(Object.keys(criterion).sort()) !== JSON.stringify(['id', 'sourceAnchor', 'sourceQuote', 'text'])) {
      issues.push(`acceptanceCriteria[${index}] fields must be exactly id, sourceAnchor, sourceQuote, text`)
      continue
    }
    if (
      !nonEmptyText(criterion.id)
      || !nonEmptyText(criterion.text)
      || !nonEmptyText(criterion.sourceAnchor)
      || !nonEmptyText(criterion.sourceQuote)
    ) {
      issues.push(`acceptanceCriteria[${index}] fields must be non-empty`)
      continue
    }
    textChars += criterion.id.length + criterion.text.length + criterion.sourceAnchor.length + criterion.sourceQuote.length
    if (textChars > MAX_TEXT_CHARS) issues.push('acceptance-criteria text exceeds the cumulative character bound')
    if (seenAcIds.has(criterion.id)) issues.push(`duplicate AC id at acceptanceCriteria[${index}]`)
    seenAcIds.add(criterion.id)
    const paragraphText = byAnchor.get(criterion.sourceAnchor)
    if (paragraphText === undefined) {
      issues.push(`acceptanceCriteria[${index}].sourceAnchor does not resolve`)
    } else if (!paragraphText.includes(criterion.sourceQuote)) {
      issues.push(`acceptanceCriteria[${index}].sourceQuote is not a literal substring`)
    }
  }
  for (let index = 0; index < warnings.length; index += 1) {
    let warning: unknown
    try { warning = warnings[index] } catch { issues.push(`warnings[${index}] is inaccessible`); continue }
    if (!nonEmptyText(warning, MAX_WARNING_CHARS)) issues.push(`warnings[${index}] must be bounded non-empty text`)
  }
  if (issues.length > 0) throw new SpecIrValidationError(issues)
  return value
}

export function emptyIrWarningsCheck(ir: SpecIR, sourceKind: SourceKind, sourceRef: string): void {
  if (ir.paragraphs.length === 0) {
    throw new SpecAdapterError(sourceKind, 'no extractable text found in source (0 paragraphs)', sourceRef)
  }
}
