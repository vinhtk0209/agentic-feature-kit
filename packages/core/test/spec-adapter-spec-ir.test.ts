import assert from 'node:assert/strict'
import { normalizeSemanticSpec } from '../src/semantic-spec'
import {
  SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  SpecAdapterError,
  validateSpecAdapterResult,
} from '../src/spec-adapter'
import {
  SPEC_IR_ADAPTER_DESCRIPTOR,
  adaptSpecIR,
} from '../src/spec-adapter-spec-ir'
import {
  SpecIrValidationError,
  validateSpecIR,
  type SpecIR,
} from '../src/spec-ir'

const digest = 'a'.repeat(64)

function makeIr(overrides: Partial<SpecIR> = {}): SpecIR {
  return {
    schemaVersion: 1,
    sourceKind: 'raw-us',
    sourceRef: `local:raw-us:${digest}`,
    sourceSha256: digest,
    title: 'Export report',
    paragraphs: [
      { anchor: 'line:1', text: 'Export report' },
      { anchor: 'line:2', text: 'Given a ready report, when export runs, then a file downloads.' },
    ],
    acceptanceCriteria: [{
      id: 'AC-1',
      text: 'Given a ready report, when export runs, then a file downloads.',
      sourceAnchor: 'line:2',
      sourceQuote: 'Given a ready report, when export runs, then a file downloads.',
    }],
    warnings: [],
    ...overrides,
  }
}

function expectAdapterError(action: () => unknown, code: string): void {
  let caught: unknown
  try { action() } catch (error) { caught = error }
  assert.ok(caught instanceof SpecAdapterError)
  assert.equal(caught.code, code)
}

const ir = makeIr()
const result = adaptSpecIR(ir)
const expectedSource = {
  sourceKind: ir.sourceKind,
  sourceRef: ir.sourceRef,
  sourceSha256: ir.sourceSha256,
  title: ir.title,
  paragraphs: ir.paragraphs,
  acceptanceCriteria: ir.acceptanceCriteria,
}

assert.equal(SPEC_ADAPTER_RESULT_SCHEMA_VERSION, '1.1.0')
assert.deepEqual(SPEC_IR_ADAPTER_DESCRIPTOR, {
  schemaVersion: '1.1.0',
  adapterId: 'spec-ir-v1',
  providerId: 'spec-ir',
  inputKind: 'spec-ir-v1',
  outputSchemaVersion: '1.1.0',
  sourceKinds: ['confluence', 'excel', 'pdf', 'raw-us', 'word'],
  configurationRequirements: [],
  unsupportedBehavior: 'explicit-field-names',
})
assert.equal(result.schemaVersion, '1.1.0')
assert.deepEqual(result.source, expectedSource)
assert.deepEqual(result.unsupportedFields, [])
assert.deepEqual(validateSpecAdapterResult(JSON.parse(JSON.stringify(result))), result)
assert.deepEqual(normalizeSemanticSpec(result.source), normalizeSemanticSpec(expectedSource))
assert.ok(Object.isFrozen(result) && Object.isFrozen(result.source))

const warningText = 'page 1 leaked C:\\private\\tenant\\secret.pdf'
const warned = adaptSpecIR(makeIr({ warnings: [warningText] }))
assert.deepEqual(warned.unsupportedFields, ['warnings'])
assert.doesNotMatch(JSON.stringify(warned), /private|tenant|secret\.pdf/)

const confluence = adaptSpecIR(makeIr({
  sourceKind: 'confluence',
  sourceRef: 'confluence:424242',
}))
assert.equal(confluence.source.sourceKind, 'confluence')
assert.equal(confluence.source.sourceRef, 'confluence:424242')

expectAdapterError(() => adaptSpecIR(makeIr({ sourceRef: 'C:\\private\\spec.md' })), 'INVALID_RESULT')
expectAdapterError(() => adaptSpecIR(makeIr({ sourceKind: 'jira' as SpecIR['sourceKind'] })), 'INVALID_RESULT')

let paragraphIndexed = false
const oversizedParagraphs: SpecIR['paragraphs'] = []
oversizedParagraphs.length = 257
Object.defineProperty(oversizedParagraphs, '0', {
  get() { paragraphIndexed = true; throw new Error('paragraph index must not be read') },
})
expectAdapterError(() => adaptSpecIR(makeIr({ paragraphs: oversizedParagraphs })), 'INVALID_RESULT')
assert.equal(paragraphIndexed, false)

let warningIndexed = false
const oversizedWarnings: string[] = []
oversizedWarnings.length = 65
Object.defineProperty(oversizedWarnings, '0', {
  get() { warningIndexed = true; throw new Error('warning index must not be read') },
})
expectAdapterError(() => adaptSpecIR(makeIr({ warnings: oversizedWarnings })), 'INVALID_RESULT')
assert.equal(warningIndexed, false)

assert.throws(
  () => validateSpecIR({ ...makeIr(), extra: true } as unknown as SpecIR),
  SpecIrValidationError,
)
assert.throws(
  () => validateSpecIR(makeIr({ paragraphs: [...makeIr().paragraphs, { anchor: 'line:1', text: 'duplicate' }] })),
  SpecIrValidationError,
)

console.log('spec-adapter-spec-ir.test: PASS (offline bridge, identity, privacy, and fail-closed cases)')
