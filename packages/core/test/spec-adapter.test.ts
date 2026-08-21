import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  SpecAdapterError,
  createSpecAdapterDescriptor,
  createSpecAdapterResult,
  discoverSpecAdapters,
  validateSpecAdapterResult,
  type SemanticSourceInput,
} from '../src/spec-adapter'

let passed = 0

function run(name: string, test: () => void): void {
  test()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

function expectError(action: () => unknown, code: string): SpecAdapterError {
  let caught: unknown
  try { action() } catch (error) { caught = error }
  assert.ok(caught instanceof SpecAdapterError, `expected SpecAdapterError for ${code}`)
  assert.equal(caught.code, code)
  assert.equal(caught.message, `spec-adapter:${caught.adapterId}:${code}`)
  return caught
}

const jiraDescriptor = createSpecAdapterDescriptor({
  schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  adapterId: 'jira-cloud-json-v1',
  providerId: 'jira',
  inputKind: 'utf8-json',
  outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  sourceKinds: ['jira'],
  configurationRequirements: ['base-url', 'field-mapping'],
  unsupportedBehavior: 'explicit-field-names',
})

const azureDescriptor = createSpecAdapterDescriptor({
  schemaVersion: SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION,
  adapterId: 'azure-devops-work-item-json-v1',
  providerId: 'azure-devops',
  inputKind: 'utf8-json',
  outputSchemaVersion: SPEC_ADAPTER_RESULT_SCHEMA_VERSION,
  sourceKinds: ['azure-devops'],
  configurationRequirements: ['base-url', 'field-mapping'],
  unsupportedBehavior: 'explicit-field-names',
})

const resultSchema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'schemas', 'spec-adapter-result.schema.json'), 'utf8')) as object
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(resultSchema)

const source: SemanticSourceInput = {
  sourceKind: 'jira',
  sourceRef: 'SYN-101',
  sourceSha256: 'a'.repeat(64),
  title: 'Export report',
  paragraphs: [
    { anchor: 'jira:description:paragraph:1', text: 'A signed-in user can export a report.' },
    { anchor: 'jira:acceptance:paragraph:1', text: 'Given a report is ready, when export runs, then a file downloads.' },
  ],
  acceptanceCriteria: [{
    id: 'AC-1',
    text: 'Given a report is ready, when export runs, then a file downloads.',
    sourceAnchor: 'jira:acceptance:paragraph:1',
    sourceQuote: 'Given a report is ready, when export runs, then a file downloads.',
  }],
}

run('discovery sorts exact descriptors and deep-freezes the result', () => {
  const discovery = discoverSpecAdapters([jiraDescriptor, azureDescriptor])
  assert.equal(discovery.schemaVersion, SPEC_ADAPTER_DISCOVERY_SCHEMA_VERSION)
  assert.deepEqual(discovery.adapters.map((entry) => entry.adapterId), [
    'azure-devops-work-item-json-v1',
    'jira-cloud-json-v1',
  ])
  assert.ok(Object.isFrozen(discovery))
  assert.ok(Object.isFrozen(discovery.adapters))
  assert.ok(discovery.adapters.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.configurationRequirements)))
})

run('discovery rejects duplicate adapter IDs', () => {
  expectError(() => discoverSpecAdapters([jiraDescriptor, jiraDescriptor]), 'DUPLICATE_ADAPTER')
})

run('descriptor validation rejects extra fields and unknown versions', () => {
  expectError(() => createSpecAdapterDescriptor({ ...jiraDescriptor, surprise: true }), 'INVALID_DESCRIPTOR')
  expectError(() => createSpecAdapterDescriptor({ ...jiraDescriptor, schemaVersion: '1.0.0' }), 'INVALID_DESCRIPTOR')
  expectError(() => createSpecAdapterDescriptor({ ...jiraDescriptor, configurationRequirements: ['field-mapping', 'base-url'] }), 'INVALID_DESCRIPTOR')
  expectError(() => createSpecAdapterDescriptor({ ...jiraDescriptor, sourceKinds: ['jira', 'azure-devops'] }), 'INVALID_DESCRIPTOR')
})

run('descriptor validation bounds sourceKinds before indexed reads', () => {
  let indexed = false
  const sourceKinds: string[] = []
  sourceKinds.length = 17
  Object.defineProperty(sourceKinds, '0', {
    get() { indexed = true; throw new Error('sourceKinds index must not be read') },
  })
  expectError(() => createSpecAdapterDescriptor({ ...jiraDescriptor, sourceKinds }), 'INVALID_DESCRIPTOR')
  assert.equal(indexed, false)
})

run('result construction preserves one source contract and exact capability identity', () => {
  const result = createSpecAdapterResult({ descriptor: jiraDescriptor, source, unsupportedFields: ['customfield_19999'] })
  assert.equal(result.schemaVersion, SPEC_ADAPTER_RESULT_SCHEMA_VERSION)
  assert.equal(result.adapterId, jiraDescriptor.adapterId)
  assert.equal(result.providerId, jiraDescriptor.providerId)
  assert.deepEqual(result.capability, jiraDescriptor)
  assert.deepEqual(result.source, source)
  assert.deepEqual(result.unsupportedFields, ['customfield_19999'])
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.source) && Object.isFrozen(result.unsupportedFields))
  assert.deepEqual(validateSpecAdapterResult(JSON.parse(JSON.stringify(result))), result)
  assert.equal(validateSchema(result), true, JSON.stringify(validateSchema.errors))
})

run('result construction permits an explicit empty unsupported-field set', () => {
  const result = createSpecAdapterResult({ descriptor: jiraDescriptor, source, unsupportedFields: [] })
  assert.deepEqual(result.unsupportedFields, [])
  assert.equal(validateSchema(result), true, JSON.stringify(validateSchema.errors))
})

run('result validation rejects provider, capability, sorting, and extra-field drift', () => {
  const result = createSpecAdapterResult({ descriptor: jiraDescriptor, source, unsupportedFields: ['a', 'z'] })
  expectError(() => validateSpecAdapterResult({ ...result, providerId: 'azure-devops' }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, schemaVersion: '1.0.0' }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, adapterId: 'different-v1' }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, unsupportedFields: ['z', 'a'] }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, unsupportedFields: ['a', 'a'] }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, extra: true }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, source: { ...source, providerPayload: true } }), 'INVALID_RESULT')
  expectError(() => validateSpecAdapterResult({ ...result, unsupportedFields: ['bad field'] }), 'INVALID_RESULT')
  expectError(() => createSpecAdapterResult(undefined as unknown as Parameters<typeof createSpecAdapterResult>[0]), 'INVALID_RESULT')
  assert.equal(validateSchema({ ...result, extra: true }), false)
})

run('stable typed errors cannot echo source, URL, path, or credential material', () => {
  const error = new SpecAdapterError('jira-cloud-json-v1', 'INVALID_JSON')
  const serialized = JSON.stringify({ name: error.name, message: error.message, code: error.code, adapterId: error.adapterId })
  for (const sensitive of ['secret-value', 'https://tenant.invalid', 'C:\\private', 'Bearer token']) {
    assert.ok(!serialized.includes(sensitive))
  }
  assert.ok(Object.isFrozen(error))
})

console.log(`spec-adapter.test: PASS (${passed} contract cases)`)
