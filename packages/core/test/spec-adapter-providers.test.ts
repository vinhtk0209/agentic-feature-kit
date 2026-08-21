import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { normalizeSemanticSpec } from '../src/semantic-spec'
import {
  SPEC_ADAPTER_MAX_SOURCE_BYTES,
  SPEC_ADAPTER_MAX_TEXT_CHARS,
  SpecAdapterError,
  discoverSpecAdapters,
  type SpecAdapterConfig,
  type SpecAdapterFieldMapping,
  type SpecAdapterHashPort,
} from '../src/spec-adapter'
import { createNodeSpecAdapterHashPort } from '../src/spec-adapter-node'
import { JIRA_SPEC_ADAPTER_DESCRIPTOR, createJiraSpecAdapter } from '../src/spec-adapter-jira'
import { AZURE_DEVOPS_SPEC_ADAPTER_DESCRIPTOR, createAzureDevOpsSpecAdapter } from '../src/spec-adapter-azure-devops'

type JsonRecord = Record<string, any>

const root = process.cwd()
const encoder = new TextEncoder()
const nodeHash = createNodeSpecAdapterHashPort()
let passed = 0
let attacks = 0

function run(name: string, test: () => void): void {
  test()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

function bytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function loadFixture(name: string): JsonRecord {
  return JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'fixtures', name), 'utf8')) as JsonRecord
}

function config(fixture: JsonRecord): SpecAdapterConfig {
  return { baseUrl: fixture.baseUrl, mapping: fixture.mapping as SpecAdapterFieldMapping }
}

function expectCode(action: () => unknown, code: string, sensitive?: string): void {
  let caught: unknown
  try { action() } catch (error) { caught = error }
  assert.ok(caught instanceof SpecAdapterError, `expected SpecAdapterError ${code}`)
  assert.equal(caught.code, code)
  if (sensitive) assert.ok(!caught.message.includes(sensitive), `${code} leaked sensitive source text`)
  attacks += 1
}

const jiraFixture = loadFixture('p17-004-jira-minimal.json')
const azureFixture = loadFixture('p17-004-azure-devops-minimal.json')

run('explicit discovery reports only the registered local adapters', () => {
  const discovery = discoverSpecAdapters([JIRA_SPEC_ADAPTER_DESCRIPTOR, AZURE_DEVOPS_SPEC_ADAPTER_DESCRIPTOR])
  assert.deepEqual(discovery.adapters.map((entry) => entry.adapterId), [
    'azure-devops-work-item-json-v1',
    'jira-cloud-json-v1',
  ])
})

const jiraAdapter = createJiraSpecAdapter(config(jiraFixture), nodeHash)
const azureAdapter = createAzureDevOpsSpecAdapter(config(azureFixture), nodeHash)
const jiraBytes = bytes(jiraFixture.payload)
const azureBytes = bytes(azureFixture.payload)
const jiraResult = jiraAdapter.adapt({ sourceBytes: jiraBytes, sourceRef: jiraFixture.sourceRef })
const azureResult = azureAdapter.adapt({ sourceBytes: azureBytes, sourceRef: azureFixture.sourceRef })

run('Jira exact bytes produce the locked A1 application result', () => {
  assert.equal(jiraResult.source.sourceSha256, crypto.createHash('sha256').update(jiraBytes).digest('hex'))
  assert.equal(jiraResult.source.title, jiraFixture.expected.title)
  assert.deepEqual(jiraResult.source.paragraphs, jiraFixture.expected.paragraphs)
  assert.deepEqual(jiraResult.source.acceptanceCriteria, jiraFixture.expected.acceptanceCriteria)
  assert.deepEqual(jiraResult.unsupportedFields, jiraFixture.expected.unsupportedFields)
})

run('Azure DevOps exact bytes produce the locked A1 application result', () => {
  assert.equal(azureResult.source.sourceSha256, crypto.createHash('sha256').update(azureBytes).digest('hex'))
  assert.equal(azureResult.source.title, azureFixture.expected.title)
  assert.deepEqual(azureResult.source.paragraphs, azureFixture.expected.paragraphs)
  assert.deepEqual(azureResult.source.acceptanceCriteria, azureFixture.expected.acceptanceCriteria)
  assert.deepEqual(azureResult.unsupportedFields, azureFixture.expected.unsupportedFields)
})

run('cross-provider normalization shares meaning while preserving provenance', () => {
  const jiraSpec = normalizeSemanticSpec(jiraResult.source)
  const azureSpec = normalizeSemanticSpec(azureResult.source)
  assert.equal(jiraSpec.semanticHash, azureSpec.semanticHash)
  assert.notEqual(jiraSpec.provenanceHash, azureSpec.provenanceHash)
})

run('hash port receives exact bytes before invalid JSON fails', () => {
  const seen: Uint8Array[] = []
  const spy: SpecAdapterHashPort = {
    sha256(sourceBytes) {
      seen.push(new Uint8Array(sourceBytes))
      return crypto.createHash('sha256').update(sourceBytes).digest('hex')
    },
  }
  const adapter = createJiraSpecAdapter(config(jiraFixture), spy)
  const malformed = encoder.encode('{"id":')
  expectCode(() => adapter.adapt({ sourceBytes: malformed, sourceRef: 'SYN-RED-1' }), 'INVALID_JSON')
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], malformed)
})

run('byte, UTF-8, source-reference, and hash-port boundaries fail closed', () => {
  expectCode(() => jiraAdapter.adapt({ sourceBytes: new Uint8Array(), sourceRef: 'SYN-1' }), 'INVALID_BYTES')
  expectCode(() => jiraAdapter.adapt({ sourceBytes: new Uint8Array(SPEC_ADAPTER_MAX_SOURCE_BYTES + 1), sourceRef: 'SYN-1' }), 'SOURCE_TOO_LARGE')
  expectCode(() => jiraAdapter.adapt({ sourceBytes: new Uint8Array([0xc3, 0x28]), sourceRef: 'SYN-1' }), 'INVALID_UTF8')
  expectCode(() => jiraAdapter.adapt({ sourceBytes: jiraBytes, sourceRef: 'https://tenant.invalid/item/1' }), 'INVALID_SOURCE_REF')
  const failingHash: SpecAdapterHashPort = { sha256() { throw new Error('secret-value') } }
  const adapter = createJiraSpecAdapter(config(jiraFixture), failingHash)
  expectCode(() => adapter.adapt({ sourceBytes: jiraBytes, sourceRef: 'SYN-1' }), 'HASH_FAILURE', 'secret-value')
})

run('base URL and mapping configuration attacks fail before adaptation', () => {
  for (const badUrl of [
    'http://jira.example.invalid',
    'https://user:secret@jira.example.invalid',
    'https://jira.example.invalid?token=x',
    'https://jira.example.invalid#fragment',
    'https://jira.example.invalid/root',
  ]) expectCode(() => createJiraSpecAdapter({ ...config(jiraFixture), baseUrl: badUrl }, nodeHash), 'INVALID_CONFIG', badUrl)

  expectCode(() => createJiraSpecAdapter({
    ...config(jiraFixture),
    mapping: { ...jiraFixture.mapping, paragraphFields: ['summary', ...jiraFixture.mapping.paragraphFields] },
  }, nodeHash), 'INVALID_MAPPING')
  expectCode(() => createJiraSpecAdapter({
    ...config(jiraFixture),
    mapping: { ...jiraFixture.mapping, surprise: ['x'] },
  } as unknown as SpecAdapterConfig, nodeHash), 'INVALID_MAPPING')
})

run('mapping conservation rejects absent, unaccounted, and duplicate provider fields', () => {
  const absent = structuredClone(jiraFixture.payload)
  delete absent.fields.description
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(absent), sourceRef: 'SYN-2' }), 'INVALID_MAPPING')

  const unaccounted = structuredClone(jiraFixture.payload)
  unaccounted.fields.unmapped = 'must fail'
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(unaccounted), sourceRef: 'SYN-3' }), 'INVALID_MAPPING', 'must fail')

  const missingUnsupported = structuredClone(jiraFixture.payload)
  delete missingUnsupported.fields.customfield_19999
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(missingUnsupported), sourceRef: 'SYN-4' }), 'INVALID_MAPPING')

  expectCode(() => jiraAdapter.adapt({ sourceBytes: azureBytes, sourceRef: 'SYN-CROSS-J' }), 'INVALID_PAYLOAD')
  expectCode(() => azureAdapter.adapt({ sourceBytes: jiraBytes, sourceRef: 'SYN-CROSS-A' }), 'INVALID_PAYLOAD')
})

run('Jira ADF rejects extra, unknown, truncated, empty, and over-budget content', () => {
  const extra = structuredClone(jiraFixture.payload)
  extra.fields.description.content[0].content[0].marks = []
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(extra), sourceRef: 'SYN-J1' }), 'UNSUPPORTED_CONTENT')

  const unknown = structuredClone(jiraFixture.payload)
  unknown.fields.description.content[0].content[0].type = 'media'
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(unknown), sourceRef: 'SYN-J2' }), 'UNSUPPORTED_CONTENT')

  const empty = structuredClone(jiraFixture.payload)
  empty.fields.customfield_10001.content = []
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(empty), sourceRef: 'SYN-J3' }), 'UNSUPPORTED_CONTENT')

  const noCriteria = structuredClone(jiraFixture.payload)
  noCriteria.fields.customfield_10001.content[0].content[0].text = 'Ordinary paragraph.'
  noCriteria.fields.customfield_10001.content[1].content[0].text = 'Another paragraph.'
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(noCriteria), sourceRef: 'SYN-J4' }), 'NO_ACCEPTANCE_CRITERIA')

  expectCode(() => jiraAdapter.adapt({ sourceBytes: encoder.encode('{"id":1'), sourceRef: 'SYN-J5' }), 'INVALID_JSON')

  const tooManyNodes = structuredClone(jiraFixture.payload)
  tooManyNodes.fields.description.content = Array.from({ length: 256 }, (_, index) => ({
    type: 'paragraph',
    content: Array.from({ length: 4 }, (_unused, textIndex) => ({ type: 'text', text: `${index}-${textIndex}` })),
  }))
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(tooManyNodes), sourceRef: 'SYN-J6' }), 'UNSUPPORTED_CONTENT')

  const tooMuchText = structuredClone(jiraFixture.payload)
  tooMuchText.fields.description.content[0].content[0].text = 'a'.repeat(SPEC_ADAPTER_MAX_TEXT_CHARS + 1)
  expectCode(() => jiraAdapter.adapt({ sourceBytes: bytes(tooMuchText), sourceRef: 'SYN-J7' }), 'TEXT_TOO_LARGE')
})

run('Azure HTML decodes the fixed entity subset in source order', () => {
  const entityPayload = structuredClone(azureFixture.payload)
  entityPayload.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] = '<p>Given A &amp; B are ready, when export runs, then a file downloads.</p>'
  const result = azureAdapter.adapt({ sourceBytes: bytes(entityPayload), sourceRef: 'SYN-A0' })
  assert.equal(result.source.acceptanceCriteria[0]?.text, 'Given A & B are ready, when export runs, then a file downloads.')
})

run('Azure HTML and payload-origin attacks fail closed', () => {
  for (const [index, html] of [
    '<p class="x">Given a, when b, then c.</p>',
    '<p><p>Given a, when b, then c.</p></p>',
    '<script>Given a, when b, then c.</script>',
    '<p>Given a &copy;, when b, then c.</p>',
    '<p>Given a, when b, then c.',
    'outside<p>Given a, when b, then c.</p>',
  ].entries()) {
    const payload = structuredClone(azureFixture.payload)
    payload.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] = html
    expectCode(() => azureAdapter.adapt({ sourceBytes: bytes(payload), sourceRef: `SYN-A${index + 1}` }), 'UNSUPPORTED_CONTENT', html)
  }

  const wrongOrigin = structuredClone(azureFixture.payload)
  wrongOrigin.url = 'https://other.example.invalid/_apis/wit/workitems/202'
  expectCode(() => azureAdapter.adapt({ sourceBytes: bytes(wrongOrigin), sourceRef: 'SYN-A7' }), 'PROVIDER_MISMATCH', wrongOrigin.url)
})

run('text budget and unsupported-value secrecy remain closed', () => {
  const oversized = structuredClone(azureFixture.payload)
  oversized.fields['System.Description'] = `<p>${'a'.repeat(SPEC_ADAPTER_MAX_TEXT_CHARS + 1)}</p>`
  expectCode(() => azureAdapter.adapt({ sourceBytes: bytes(oversized), sourceRef: 'SYN-BUDGET' }), 'TEXT_TOO_LARGE')

  const sentinel = 'SECRET-UNSUPPORTED-SENTINEL-9f2c'
  const payload = structuredClone(jiraFixture.payload)
  payload.fields.customfield_19999.value = sentinel
  const result = jiraAdapter.adapt({ sourceBytes: bytes(payload), sourceRef: 'SYN-SECRET' })
  assert.ok(!JSON.stringify(result).includes(sentinel))
})

run('bounded fixture timing stays below the TypeScript reconsideration threshold', () => {
  const samples: number[] = []
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const start = performance.now()
    jiraAdapter.adapt({ sourceBytes: jiraBytes, sourceRef: `PERF-J-${iteration}` })
    azureAdapter.adapt({ sourceBytes: azureBytes, sourceRef: `PERF-A-${iteration}` })
    samples.push(performance.now() - start)
  }
  samples.sort((left, right) => left - right)
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY
  assert.ok(p95 < 50, `bounded adapter p95 ${p95.toFixed(3)}ms exceeds the 50ms reconsideration threshold`)
  console.log(`adapter benchmark: iterations=100 pair-p95-ms=${p95.toFixed(3)} node=${process.version}`)
})

console.log(`spec-adapter-providers.test: PASS (${passed} behavior cases, ${attacks} closed attacks, 2 providers)`)
