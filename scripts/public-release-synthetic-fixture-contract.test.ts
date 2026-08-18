import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeSemanticSpec, type SemanticSourceInput } from '../packages/core/src/semantic-spec'

const root = process.cwd()
const baselinePath = '.claude/assurance/baselines/us-ad-095-progress-reports.spec-ir.json'
const confluencePaths = [
  '.claude/integrations/confluence-b0-intake.test.ts',
  '.claude/integrations/confluence-refetch-actor.test.ts',
  '.claude/mcp-server/confluence-http.test.ts',
] as const
const projectRefPaths = [
  'scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts',
  'scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts',
] as const
const sourceManifest = [
  '.claude/assurance/baselines/us-ad-095-progress-reports.spec-ir.json',
  '.claude/integrations/confluence-b0-intake.test.ts',
  '.claude/integrations/confluence-refetch-actor.test.ts',
  '.claude/mcp-server/confluence-http.test.ts',
  'docs/roadmap/p17-018-r4b-synthetic-fixtures-plan.md',
  'package.json',
  'packages/core/test/semantic-spec.test.ts',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts',
  'scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts',
  'scripts/post-17-public-release-r4b-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const

const ASCII_TEXT = /^[\x09\x0a\x0d\x20-\x7e]*$/
const NETWORK_URL = /https?:\/\//i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const WINDOWS_USER_PATH = /\b[A-Z]:\\Users\\/i
const FILE_URI = /\bfile:\/\//i
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
const PROJECT_REF_ASSIGNMENT = /\bproject[_ -]?ref\s*[:=]\s*["']?[a-z]{20}\b/i
const INTERNAL_WORK_ITEM = /\b(?!AC-\d+\b)[A-Z]{2,12}(?:-[A-Z]{2,12})?-\d{2,}\b/
const PERSON_FIELD = /\b(?:author|created by|owner)\s*:\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/i
const QUOTED_PROJECT_REF = /["'][a-z]{20}["']/g
const URL_LITERAL = /https?:\/\/[^\s'"`),]+/g

interface BaselineInput extends SemanticSourceInput {
  schemaVersion: string
  paragraphs: Array<{ anchor: string; text: string }>
  warnings: string[]
}

interface MarkerOccurrence {
  path: string
  expectedCount: number
  disposition: string
}

interface Marker {
  id: string
  expectedTotal: number
  occurrences: MarkerOccurrence[]
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonicalFixtureSource(input: Pick<BaselineInput, 'paragraphs'>): string {
  return `${input.paragraphs.map((paragraph) => `${paragraph.anchor}\t${paragraph.text}`).join('\n')}\n`
}

function recomputeSourceHash(input: BaselineInput): BaselineInput {
  const clone = structuredClone(input)
  clone.sourceSha256 = sha256(canonicalFixtureSource(clone))
  return clone
}

function assertPublicFixtureText(value: string): void {
  assert.match(value, ASCII_TEXT, 'fixture must be ASCII English text')
  assert.doesNotMatch(value, NETWORK_URL, 'fixture must not contain network URLs')
  assert.doesNotMatch(value, EMAIL, 'fixture must not contain an email address')
  assert.doesNotMatch(value, WINDOWS_USER_PATH, 'fixture must not contain a user-profile path')
  assert.doesNotMatch(value, FILE_URI, 'fixture must not contain a file URI')
  assert.doesNotMatch(value, JWT_LIKE, 'fixture must not contain a JWT-like value')
  assert.doesNotMatch(value, PROJECT_REF_ASSIGNMENT, 'fixture must not contain a live-project-shaped assignment')
  assert.doesNotMatch(value, INTERNAL_WORK_ITEM, 'fixture must not contain an internal work-item marker')
  assert.doesNotMatch(value, PERSON_FIELD, 'fixture must not contain a person-identity field')
}

function assertSyntheticBaseline(input: BaselineInput, serialized: string): void {
  assert.equal(input.schemaVersion, '1.0.0')
  assert.equal(input.sourceKind, 'synthetic-fixture')
  assert.equal(input.sourceRef, 'synthetic:progress-reports-v1')
  assert.deepEqual(input.warnings, [])
  assert.equal(input.paragraphs.length, 95)
  assert.equal(new Set(input.paragraphs.map((paragraph) => paragraph.anchor)).size, 95)
  assert.deepEqual(
    input.acceptanceCriteria.map((criterion) => criterion.id),
    Array.from({ length: 19 }, (_, index) => `AC-${index + 1}`),
  )
  assert.equal(input.sourceSha256, sha256(canonicalFixtureSource(input)), 'synthetic source hash drift')
  assert.match(serialized, ASCII_TEXT, 'serialized fixture must be ASCII text')
  assertPublicFixtureText([
    input.sourceKind,
    input.sourceRef,
    input.title ?? '',
    canonicalFixtureSource(input),
  ].join('\n'))

  const paragraphs = new Map(input.paragraphs.map((paragraph) => [paragraph.anchor, paragraph.text]))
  for (const criterion of input.acceptanceCriteria) {
    assert.ok(paragraphs.get(criterion.sourceAnchor)?.includes(criterion.sourceQuote))
  }
  const semantic = normalizeSemanticSpec(input)
  assert.equal(semantic.requirements.length, 19)
  assert.equal(semantic.requirements.filter((requirement) => requirement.scenario !== null).length, 19)
  assert.equal(semantic.requirements.filter((requirement) => requirement.provenance.length === 1).length, 19)
  assert.match(semantic.semanticHash, /^[0-9a-f]{64}$/)
  assert.match(semantic.provenanceHash, /^[0-9a-f]{64}$/)
}

function syntheticBaseline(): BaselineInput {
  const paragraphs = Array.from({ length: 95 }, (_, index) => {
    const ordinal = index + 1
    const text = ordinal <= 19
      ? `AC-${ordinal}: Given a release operator, when synthetic check ${ordinal} runs, then deterministic result ${ordinal} is recorded.`
      : `Synthetic context paragraph ${ordinal} describes provider-neutral progress reporting behavior.`
    return { anchor: `line:${ordinal}`, text }
  })
  return recomputeSourceHash({
    schemaVersion: '1.0.0',
    sourceKind: 'synthetic-fixture',
    sourceRef: 'synthetic:progress-reports-v1',
    sourceSha256: '0'.repeat(64),
    title: 'Synthetic Progress Reports',
    paragraphs,
    acceptanceCriteria: paragraphs.slice(0, 19).map((paragraph, index) => ({
      id: `AC-${index + 1}`,
      text: paragraph.text,
      sourceAnchor: paragraph.anchor,
      sourceQuote: paragraph.text,
    })),
    warnings: [],
  })
}

function mutateContext(base: BaselineInput, text: string): BaselineInput {
  const clone = structuredClone(base)
  clone.paragraphs[94].text = text
  return recomputeSourceHash(clone)
}

function assertReservedConfluenceOrigins(): void {
  for (const relativePath of confluencePaths) {
    const source = read(relativePath)
    const urls = source.match(URL_LITERAL) ?? []
    assert.ok(urls.length > 0, `${relativePath}: missing URL attack surface`)
    for (const candidate of urls) {
      const url = new URL(candidate)
      assert.ok(
        url.hostname === 'example.test' || url.hostname.endsWith('.example.test'),
        `${relativePath}: non-reserved Confluence origin`,
      )
    }
  }
}

function assertValueIndependentProjectRefs(): void {
  for (const relativePath of projectRefPaths) {
    const source = read(relativePath)
    QUOTED_PROJECT_REF.lastIndex = 0
    assert.equal(QUOTED_PROJECT_REF.test(source), false, `${relativePath}: exact project-ref literal`)
  }
  const c2 = read(projectRefPaths[0])
  assert.match(c2, /const projectRefPattern = \/\^\[a-z\]\{20\}\$\//)
  assert.match(c2, /assert\.match\(snapshot\.project_ref, projectRefPattern\)/)
  assert.match(c2, /assert\.equal\(snapshot\.project_ref, aclSnapshot\.project_ref\)/)

  const c4d = read(projectRefPaths[1])
  assert.match(c4d, /const embeddedProjectRefPattern =/)
  assert.match(c4d, /assert\.doesNotMatch\(source, embeddedProjectRefPattern\)/)
}

function assertRemediationSafeR4ARegression(): void {
  const source = read('scripts/public-release-legacy-backend-contract.test.ts')
  for (const ceiling of [
    /marker\.expectedTotal\s*<=\s*8/,
    /marker\.occurrences\.length\s*<=\s*7/,
    /bindings\.length\s*<=\s*28/,
    /classifiedOccurrences\s*<=\s*70/,
  ]) assert.match(source, ceiling, `R4A monotonic ceiling missing: ${ceiling}`)
  assert.doesNotMatch(source, /assert\.equal\(marker\.expectedTotal, 8\)/)
  assert.doesNotMatch(source, /assert\.equal\(bindings\.length, 28\)/)
  assert.doesNotMatch(source, /assert\.equal\(classifiedOccurrences, 70\)/)
}

function assertR4BRegistryAuthority(): void {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as { markers: Marker[] }
  const internalHost = registry.markers.find((marker) => marker.id === 'internal-hostname')
  const liveProject = registry.markers.find((marker) => marker.id === 'live-supabase-project-ref')
  assert.ok(internalHost)
  assert.ok(liveProject)
  assert.equal(internalHost.expectedTotal, 0)
  assert.deepEqual(internalHost.occurrences, [])
  assert.equal(liveProject.expectedTotal, 5)
  assert.equal(liveProject.occurrences.length, 5)

  const bindings = registry.markers.flatMap((marker) => marker.occurrences)
  const classifiedOccurrences = registry.markers.reduce((sum, marker) => sum + marker.expectedTotal, 0)
  assert.equal(bindings.length, 22)
  assert.equal(classifiedOccurrences, 46)
  const dispositions = bindings.reduce<Record<string, { bindings: number; occurrences: number }>>((result, occurrence) => {
    result[occurrence.disposition] ??= { bindings: 0, occurrences: 0 }
    result[occurrence.disposition].bindings += 1
    result[occurrence.disposition].occurrences += occurrence.expectedCount
    return result
  }, {})
  assert.deepEqual(dispositions, {
    genericize: { bindings: 16, occurrences: 40 },
    'move-to-private-archive': { bindings: 6, occurrences: 6 },
  })
}

function assertNodeAuthorityTracksR4B(): void {
  const source = read('scripts/public-release-contract-node.test.ts')
  assert.match(source, /\['internal-hostname', 0\]/)
  assert.match(source, /\['live-supabase-project-ref', 5\]/)
  assert.match(source, /assert\.equal\(result\.classifiedOccurrences, 46\)/)
  assert.match(source, /assert\.equal\(result\.blockers\.length, 22\)/)
}

function assertReleaseManifestTracksR4B(): void {
  const manifest = JSON.parse(read('release/public-release-manifest.json')) as {
    entries: Array<{ path: string; contentKind: string; decision: string }>
  }
  const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  for (const relativePath of sourceManifest) {
    const entry = byPath.get(relativePath)
    assert.equal(entry?.path, relativePath, `manifest path missing: ${relativePath}`)
    assert.equal(entry?.contentKind, 'text', `manifest content kind drift: ${relativePath}`)
    assert.equal(entry?.decision, 'include', `manifest decision drift: ${relativePath}`)
  }
}

function assertPackageRouting(): void {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  assert.equal(
    pkg.scripts['test:public-release-synthetic-fixture-contract'],
    'npx tsx scripts/public-release-synthetic-fixture-contract.test.ts',
  )
  assert.ok(pkg.scripts['test:kit'].includes('npm run test:public-release-synthetic-fixture-contract'))
}

let attacks = 0
function attack(name: string, body: () => void, pattern: RegExp): void {
  assert.throws(body, pattern)
  attacks += 1
  console.log(`PASS attack: ${name}`)
}

const good = syntheticBaseline()
assertSyntheticBaseline(good, JSON.stringify(good))

attack('source hash tampering', () => {
  const forged = structuredClone(good)
  forged.sourceSha256 = '0'.repeat(64)
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /synthetic source hash drift/)
attack('private network origin', () => {
  const forged = mutateContext(good, ['Private origin: https:/', '/private', '.corp/spec'].join(''))
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /network URLs/)
attack('internal work item', () => {
  const forged = mutateContext(good, `Work item: ${['AB', 'CD', '123'].join('-')}`)
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /work-item marker/)
attack('person identity', () => {
  const forged = mutateContext(good, 'Owner: Sample Person')
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /person-identity/)
attack('email identity', () => {
  const forged = mutateContext(good, `Contact: ${['owner', 'synthetic.example'].join('@')}`)
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /email address/)
attack('local user path', () => {
  const forged = mutateContext(good, ['C:', 'Users', 'Example', 'secret.txt'].join('\\'))
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /user-profile path/)
attack('JWT-like credential', () => {
  const token = ['eyJsyntheticHeader', 'eyJsyntheticPayload', 'syntheticSignature'].join('.')
  const forged = mutateContext(good, `Credential: ${token}`)
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /JWT-like value/)
attack('live-project-shaped assignment', () => {
  const forged = mutateContext(good, `project_ref: ${'a'.repeat(20)}`)
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /live-project-shaped assignment/)
attack('non-ASCII source', () => {
  const forged = mutateContext(good, 'Non-English marker: Caf\u00e9')
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /ASCII (?:text|English)/)
attack('duplicate anchor', () => {
  const forged = structuredClone(good)
  forged.paragraphs[94].anchor = forged.paragraphs[93].anchor
  forged.sourceSha256 = sha256(canonicalFixtureSource(forged))
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /95/)
attack('unresolved provenance', () => {
  const forged = structuredClone(good)
  forged.acceptanceCriteria[0].sourceQuote = 'Fabricated quote'
  assertSyntheticBaseline(forged, JSON.stringify(forged))
}, /provenance|includes/)

assertPackageRouting()

const currentGaps: string[] = []
function current(name: string, body: () => void): void {
  try {
    body()
  } catch {
    currentGaps.push(name)
  }
}

current('synthetic semantic baseline', () => {
  const serialized = read(baselinePath)
  assertSyntheticBaseline(JSON.parse(serialized) as BaselineInput, serialized)
})
current('reserved Confluence origins', assertReservedConfluenceOrigins)
current('value-independent project refs', assertValueIndependentProjectRefs)
current('remediation-safe R4A regression', assertRemediationSafeR4ARegression)
current('R4B marker registry authority', assertR4BRegistryAuthority)
current('R4B Node index authority', assertNodeAuthorityTracksR4B)
current('R4B release-manifest paths', assertReleaseManifestTracksR4B)

assert.deepEqual(currentGaps, [], `R4B synthetic-fixture current-tree gaps: ${currentGaps.join(', ')}`)
console.log(`public-release-synthetic-fixture-contract.test: PASS (${attacks} attacks, 7 current surfaces)`)
