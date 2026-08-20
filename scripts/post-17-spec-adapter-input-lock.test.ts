import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-004-a1-spec-adapter-input-lock-plan.md')
const jiraPath = path.join(root, 'docs', 'roadmap', 'fixtures', 'p17-004-jira-minimal.json')
const azurePath = path.join(root, 'docs', 'roadmap', 'fixtures', 'p17-004-azure-devops-minimal.json')
const roadmapJsonPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const roadmapMarkdownPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  'docs/roadmap/p17-004-a1-spec-adapter-input-lock-plan.md',
  'docs/roadmap/fixtures/p17-004-azure-devops-minimal.json',
  'docs/roadmap/fixtures/p17-004-jira-minimal.json',
  'docs/roadmap/post-17-roadmap.json',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-spec-adapter-input-lock.test.ts',
  'scripts/public-release-readiness-contract.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-004 A1 ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} must have exact keys`)
}

function nonBlankStrings(value: unknown, label: string): asserts value is string[] {
  assert.ok(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`)
  assert.ok(value.every((item) => typeof item === 'string' && item.trim().length > 0), `${label} must contain non-blank strings`)
}

function validateFixture(value: JsonRecord, provider: 'jira' | 'azure-devops'): void {
  exactKeys(value, ['fixtureVersion', 'sourceKind', 'sourceRef', 'baseUrl', 'payload', 'mapping', 'expected'], `${provider} fixture`)
  assert.equal(value.fixtureVersion, 1)
  assert.equal(value.sourceKind, provider)
  assert.match(value.sourceRef, provider === 'jira' ? /^JIRA-SYNTH-[0-9]+$/ : /^ADO-SYNTH-[0-9]+$/)
  const base = new URL(value.baseUrl)
  assert.equal(base.protocol, 'https:')
  assert.ok(base.hostname.endsWith('.example.invalid'), `${provider} fixture must use a reserved example host`)
  assert.equal(base.username, '', `${provider} fixture base URL must not contain userinfo`)
  assert.equal(base.password, '', `${provider} fixture base URL must not contain userinfo`)
  assert.equal(base.search, '')
  assert.equal(base.hash, '')

  exactKeys(value.mapping, ['titleField', 'paragraphFields', 'unsupportedFields'], `${provider}.mapping`)
  assert.equal(typeof value.mapping.titleField, 'string')
  nonBlankStrings(value.mapping.paragraphFields, `${provider}.mapping.paragraphFields`)
  nonBlankStrings(value.mapping.unsupportedFields, `${provider}.mapping.unsupportedFields`)
  assert.equal(new Set([...value.mapping.paragraphFields, ...value.mapping.unsupportedFields, value.mapping.titleField]).size,
    value.mapping.paragraphFields.length + value.mapping.unsupportedFields.length + 1,
    `${provider} mapping fields must be unique`)

  exactKeys(value.expected, ['title', 'paragraphs', 'acceptanceCriteria', 'unsupportedFields'], `${provider}.expected`)
  assert.equal(typeof value.expected.title, 'string')
  assert.ok(Array.isArray(value.expected.paragraphs) && value.expected.paragraphs.length > 0, `${provider}.expected.paragraphs must be non-empty`)
  const anchors = new Map<string, string>()
  for (const [index, paragraph] of value.expected.paragraphs.entries()) {
    exactKeys(paragraph, ['anchor', 'text'], `${provider}.expected.paragraphs[${index}]`)
    assert.equal(typeof paragraph.anchor, 'string')
    assert.equal(typeof paragraph.text, 'string')
    assert.ok(paragraph.anchor.trim() && paragraph.text.trim())
    assert.equal(anchors.has(paragraph.anchor), false, `${provider} paragraph anchors must be unique`)
    anchors.set(paragraph.anchor, paragraph.text)
  }
  assert.ok(Array.isArray(value.expected.acceptanceCriteria) && value.expected.acceptanceCriteria.length > 0,
    `${provider}.expected.acceptanceCriteria must be non-empty`)
  const criterionIds = new Set<string>()
  for (const [index, criterion] of value.expected.acceptanceCriteria.entries()) {
    exactKeys(criterion, ['id', 'text', 'sourceAnchor', 'sourceQuote'], `${provider}.expected.acceptanceCriteria[${index}]`)
    for (const field of ['id', 'text', 'sourceAnchor', 'sourceQuote']) assert.ok(typeof criterion[field] === 'string' && criterion[field].trim())
    assert.equal(criterionIds.has(criterion.id), false, `${provider} criterion IDs must be unique`)
    criterionIds.add(criterion.id)
    const paragraph = anchors.get(criterion.sourceAnchor)
    assert.ok(paragraph?.includes(criterion.sourceQuote), `${provider} criterion provenance must resolve literally`)
  }
  nonBlankStrings(value.expected.unsupportedFields, `${provider}.expected.unsupportedFields`)
  assert.deepEqual(value.expected.unsupportedFields, value.mapping.unsupportedFields)

  assert.ok(value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload))
  exactKeys(value.payload, provider === 'jira' ? ['id', 'key', 'fields'] : ['id', 'rev', 'fields', 'url'], `${provider}.payload`)
  assert.ok(value.payload.fields && typeof value.payload.fields === 'object' && !Array.isArray(value.payload.fields))
  const accounted = [value.mapping.titleField, ...value.mapping.paragraphFields, ...value.mapping.unsupportedFields].sort()
  assert.deepEqual(Object.keys(value.payload.fields).sort(), accounted, `${provider} fields must be mapped or explicitly unsupported`)
  assert.equal(value.expected.title, value.payload.fields[value.mapping.titleField], `${provider} title must resolve literally from its mapped field`)
  for (const paragraph of value.expected.paragraphs) {
    const sourceField = value.mapping.paragraphFields.find((field: string) => {
      const prefix = `${provider}:${field}:paragraph:`
      return paragraph.anchor.startsWith(prefix) && /^[1-9][0-9]*$/.test(paragraph.anchor.slice(prefix.length))
    })
    assert.ok(sourceField, `${provider} paragraph anchor must identify one mapped paragraph field`)
    assert.ok(JSON.stringify(value.payload.fields[sourceField]).includes(paragraph.text),
      `${provider} paragraph text must resolve literally from its mapped raw field`)
  }
  const expectedContent = JSON.stringify({ ...value.expected, unsupportedFields: [] })
  for (const unsupportedField of value.mapping.unsupportedFields) {
    const unsupportedValue = JSON.stringify(value.payload.fields[unsupportedField])
    assert.ok(unsupportedValue && !expectedContent.includes(unsupportedValue),
      `${provider} unsupported value must not enter expected adapter output`)
  }
  if (provider === 'jira') {
    assert.match(value.payload.id, /^[0-9]+$/)
    assert.match(value.payload.key, /^SYN-[0-9]+$/)
  } else {
    assert.ok(Number.isSafeInteger(value.payload.id) && value.payload.id > 0)
    assert.ok(Number.isSafeInteger(value.payload.rev) && value.payload.rev > 0)
    const resource = new URL(value.payload.url)
    assert.ok(resource.hostname.endsWith('.example.invalid'))
    assert.equal(resource.username, '', `${provider} payload URL must not contain userinfo`)
    assert.equal(resource.password, '', `${provider} payload URL must not contain userinfo`)
    assert.equal(resource.search, '')
    assert.equal(resource.hash, '')
    assert.equal(resource.origin, base.origin, `${provider} payload URL must use the configured base URL`)
  }
}

const plan = readRequired(planPath, 'plan')
const requiredPlanPhrases = [
  '**Decision lock:** `schema=S1, fixtures=F1, provenance=P1, mapping=M1, unsupported=U1, config=C1, discovery=D1, privacy=R1, failure=E1, scope=N1`',
  '### S1 — SemanticSourceInput remains the canonical content contract',
  '`SpecAdapterResult`',
  '### F1 — Approved synthetic exports only',
  '### P1 — Byte identity and field anchors are mandatory',
  '### M1 — One mapping contract for every provider',
  '### U1 — Every unconsumed field is explicit',
  '### C1 — Instance URLs are injected configuration',
  '### D1 — Capability discovery is deterministic and offline',
  '### R1 — Fixtures contain no tenant or person data',
  '### E1 — Malformed or partial inputs fail closed',
  '### N1 — Input lock only; adapters remain a later slice',
  'https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/',
  'https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1',
  'No credential refresh, tenant-wide crawl, network request, or provider execution is authorized.',
]
for (const phrase of requiredPlanPhrases) assert.ok(plan.includes(phrase), `plan missing: ${phrase}`)
for (const source of sourceManifest) assert.ok(plan.includes(`\`${source}\``), `plan source manifest missing ${source}`)

const jiraText = readRequired(jiraPath, 'Jira fixture')
const azureText = readRequired(azurePath, 'Azure DevOps fixture')
const jira = JSON.parse(jiraText) as JsonRecord
const azure = JSON.parse(azureText) as JsonRecord
validateFixture(jira, 'jira')
validateFixture(azure, 'azure-devops')
assert.notDeepEqual(jira.expected.paragraphs, azure.expected.paragraphs, 'fixtures must exercise provider-specific source shapes')
assert.deepEqual(
  jira.expected.acceptanceCriteria.map((entry: JsonRecord) => [entry.id, entry.text]),
  azure.expected.acceptanceCriteria.map((entry: JsonRecord) => [entry.id, entry.text]),
  'fixtures must normalize to the same AC set',
)
assert.equal(jira.expected.title, azure.expected.title, 'fixtures must normalize to the same title')

const fixtureText = `${jiraText}\n${azureText}`
const privacyControls = [
  { label: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, positive: 'person@example.com' },
  { label: 'credential assignment', pattern: /\b(?:token|password|secret|authorization|api[_-]?key)\b\s*[:=]/i, positive: 'token=control' },
  { label: 'private IPv4', pattern: /\b(?:10(?:\.\d{1,3}){3}|127(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/, positive: '192.168.1.5' },
]
for (const control of privacyControls) {
  assert.match(control.positive, control.pattern, `${control.label} detector positive control failed`)
  assert.doesNotMatch(fixtureText, control.pattern, `fixtures contain ${control.label}`)
}
const urls = fixtureText.match(/https:\/\/[^"\\\s]+/g) ?? []
assert.ok(urls.length >= 3, 'fixtures must positively exercise configurable URLs')
for (const raw of urls) assert.ok(new URL(raw).hostname.endsWith('.example.invalid'), `non-reserved fixture URL: ${raw}`)

const roadmap = parseRequired(roadmapJsonPath, 'roadmap catalog')
const task = roadmap.tasks.find((entry: JsonRecord) => entry.id === 'P17-004')
assert.ok(task, 'P17-004 missing from roadmap')
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])
assert.ok(task.readiness.inputs.includes('privacy-safe synthetic Jira and Azure DevOps fixture exports'))

const roadmapMarkdown = readRequired(roadmapMarkdownPath, 'human roadmap')
assert.match(roadmapMarkdown, /\| P17-004 \| P1 \| 2 \| in_progress \| Provider-neutral specification adapters \|/)
assert.doesNotMatch(roadmapMarkdown, /- \*\*P17-004:\*\*/)
assert.match(roadmapMarkdown, /- \*\*P17-007:\*\*/)

const manifest = parseRequired(manifestPath, 'public manifest')
assert.ok(Array.isArray(manifest.entries), 'public manifest entries must be an array')
const manifestPaths = manifest.entries.map((entry: JsonRecord) => entry.path)
assert.equal(new Set(manifestPaths).size, manifestPaths.length, 'public manifest paths must be unique')
assert.deepEqual(manifestPaths, [...manifestPaths].sort(), 'public manifest paths must be JavaScript-ordinal sorted')
const newPublicPaths = [
  'docs/roadmap/fixtures/p17-004-azure-devops-minimal.json',
  'docs/roadmap/fixtures/p17-004-jira-minimal.json',
  'docs/roadmap/p17-004-a1-spec-adapter-input-lock-plan.md',
  'scripts/post-17-spec-adapter-input-lock.test.ts',
] as const
for (const publicPath of newPublicPaths) {
  const matches = manifest.entries.filter((candidate: JsonRecord) => candidate.path === publicPath)
  assert.equal(matches.length, 1, `public manifest must contain exactly one ${publicPath} entry`)
  const entry = matches[0]
  assert.equal(entry?.decision, 'include', `public manifest must include ${publicPath}`)
  assert.equal(entry?.contentKind, 'text', `${publicPath} must be classified as text`)
  assert.equal(entry?.reasonCode, 'public-source', `${publicPath} must be public source`)
}

const missingUnsupported = structuredClone(jira)
delete missingUnsupported.payload.fields[missingUnsupported.mapping.unsupportedFields[0]]
assert.throws(() => validateFixture(missingUnsupported, 'jira'), /mapped or explicitly unsupported/)

const duplicateMapping = structuredClone(azure)
duplicateMapping.mapping.unsupportedFields[0] = duplicateMapping.mapping.titleField
assert.throws(() => validateFixture(duplicateMapping, 'azure-devops'), /must be unique/)

const realHost = structuredClone(jira)
realHost.baseUrl = 'https://jira.example.com'
assert.throws(() => validateFixture(realHost, 'jira'), /reserved example host/)

const userinfoUrl = structuredClone(jira)
userinfoUrl.baseUrl = 'https://synthetic:secret@jira.example.invalid'
assert.throws(() => validateFixture(userinfoUrl, 'jira'), /must not contain userinfo/)

const crossOriginPayload = structuredClone(azure)
crossOriginPayload.payload.url = 'https://other.example.invalid/synthetic/_apis/wit/workitems/202'
assert.throws(() => validateFixture(crossOriginPayload, 'azure-devops'), /must use the configured base URL/)

console.log(`post-17-spec-adapter-input-lock.test: PASS (${sourceManifest.length} source paths, 2 synthetic providers, ${privacyControls.length} positive-controlled privacy families, 5 negative attacks)`)
