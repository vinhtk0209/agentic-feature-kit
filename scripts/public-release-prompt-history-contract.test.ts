import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const historyPath = '.claude/prompt-evolution.md'
const rawLearningTarget = ['isu', 'elearner', 'learning'].join('-')
const rawAuthoringName = ['isu', 'elearner', 'authoring'].join('-')
const rawAuthoringTarget = ['tempp', rawAuthoringName].join('/')
const learningAlias = 'example-learning-app'
const authoringAlias = 'example-authoring-app'
const sourceManifest = [
  '.claude/prompt-evolution.md',
  'docs/roadmap/p17-018-r4c-prompt-history-genericization-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4c-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const

interface HistoryAuthority {
  sourceSha256: string
  transformedSha256: string
  lines: number
  headings: number
  lessons: number
  changeTokens: number
  learningAliases: number
  authoringAliases: number
}

interface MarkerOccurrence {
  path: string
  expectedCount: number
  disposition: string
  reasonCode: string
}

interface Marker {
  id: string
  detectorId: string
  fingerprintSha256: string
  expectedTotal: number
  occurrences: MarkerOccurrence[]
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function canonicalLf(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function countOccurrences(value: string, token: string): number {
  return value.split(token).length - 1
}

function applyAliases(value: string): string {
  return value
    .replaceAll(rawLearningTarget, learningAlias)
    .replaceAll(rawAuthoringTarget, authoringAlias)
}

function reverseAliases(value: string): string {
  return value
    .replaceAll(learningAlias, rawLearningTarget)
    .replaceAll(authoringAlias, rawAuthoringTarget)
}

function measureHistory(value: string) {
  const canonical = canonicalLf(value)
  return {
    canonical,
    lines: canonical.endsWith('\n') ? canonical.split('\n').length - 1 : canonical.split('\n').length,
    headings: canonical.match(/^#{1,6}\s/gm)?.length ?? 0,
    lessons: canonical.match(/<!--\s*@lesson\b/g)?.length ?? 0,
    changeTokens: canonical.match(/\bChange [A-Z](?:\.[0-9A-Za-z]+)?/g)?.length ?? 0,
  }
}

function assertHistoryAliases(value: string, authority: HistoryAuthority): void {
  const measured = measureHistory(value)
  assert.ok(measured.canonical.endsWith('\n'), 'history must have a final newline')
  assert.equal(countOccurrences(measured.canonical, rawLearningTarget), 0, 'raw learning-target identity')
  assert.equal(countOccurrences(measured.canonical, rawAuthoringName), 0, 'raw authoring-target identity')
  assert.equal(countOccurrences(measured.canonical, learningAlias), authority.learningAliases, 'learning alias count')
  assert.equal(countOccurrences(measured.canonical, authoringAlias), authority.authoringAliases, 'authoring alias count')
  assert.equal(countOccurrences(measured.canonical, `tempp/${authoringAlias}`), 0, 'historical workspace prefix')
  assert.equal(measured.lines, authority.lines, 'history line count')
  assert.equal(measured.headings, authority.headings, 'history heading count')
  assert.equal(measured.lessons, authority.lessons, 'lesson annotation count')
  assert.equal(measured.changeTokens, authority.changeTokens, 'Change token count')
  assert.equal(sha256(measured.canonical), authority.transformedSha256, 'transformed history hash')
  assert.equal(sha256(reverseAliases(measured.canonical)), authority.sourceSha256, 'reversible source hash')
}

function assertR4CRegistryAuthority(): void {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as { markers: Marker[] }
  const authoring = registry.markers.find((marker) => marker.id === 'workspace-target-authoring')
  const learning = registry.markers.find((marker) => marker.id === 'workspace-target-learning')
  assert.ok(authoring)
  assert.ok(learning)
  assert.equal(authoring.detectorId, 'known-token-v1')
  assert.equal(learning.detectorId, 'known-token-v1')
  assert.equal(authoring.fingerprintSha256, 'dc8c0c3f495a30e7ae24ac811cd9c0a5cfa34689c6a8f46fdc2881a782c4418a')
  assert.equal(learning.fingerprintSha256, 'e9b50f08930935c764e091eb6ae793f6d1305e0a4bd89f455237bff16acc7782')
  assert.ok(authoring.expectedTotal <= 8)
  assert.ok(learning.expectedTotal <= 7)
  assert.equal(authoring.occurrences.some((occurrence) => occurrence.path === historyPath), false)
  assert.equal(learning.occurrences.some((occurrence) => occurrence.path === historyPath), false)

  const bindings = registry.markers.flatMap((marker) => marker.occurrences)
  const classifiedOccurrences = registry.markers.reduce((sum, marker) => sum + marker.expectedTotal, 0)
  assert.ok(bindings.length <= 20)
  assert.ok(classifiedOccurrences <= 21)
  const allowedDispositions = new Set(['genericize', 'move-to-private-archive'])
  assert.equal(bindings.every((binding) => allowedDispositions.has(binding.disposition)), true)
  const dispositions = bindings.reduce<Record<string, { bindings: number; occurrences: number }>>((result, occurrence) => {
    result[occurrence.disposition] ??= { bindings: 0, occurrences: 0 }
    result[occurrence.disposition].bindings += 1
    result[occurrence.disposition].occurrences += occurrence.expectedCount
    return result
  }, {})
  const genericized = dispositions.genericize ?? { bindings: 0, occurrences: 0 }
  assert.ok(genericized.bindings <= 14, 'genericized binding count exceeds R4C authority')
  assert.ok(genericized.occurrences <= 15, 'genericized occurrence count exceeds R4C authority')
  const archived = dispositions['move-to-private-archive'] ?? { bindings: 0, occurrences: 0 }
  assert.ok(archived.bindings <= 6)
  assert.ok(archived.occurrences <= 6)
}

function assertR4BRegressionIsMonotonic(): void {
  const source = read('scripts/public-release-synthetic-fixture-contract.test.ts')
  for (const ceiling of [
    /bindings\.length\s*<=\s*22/,
    /classifiedOccurrences\s*<=\s*46/,
  ]) assert.match(source, ceiling, `R4B monotonic ceiling missing: ${ceiling}`)
  assert.doesNotMatch(source, /assert\.equal\(bindings\.length, 22\)/)
  assert.doesNotMatch(source, /assert\.equal\(classifiedOccurrences, 46\)/)
}

function assertNodeAuthorityTracksR4C(): void {
  const source = read('scripts/public-release-contract-node.test.ts')
  const authority = [
    ['workspace-target-authoring', 8],
    ['workspace-target-learning', 7],
  ] as const
  for (const [markerId, ceiling] of authority) {
    const match = source.match(new RegExp(`\\['${markerId}', (\\d+)\\]`))
    assert.ok(match, `Node marker authority missing: ${markerId}`)
    assert.ok(Number(match[1]) <= ceiling, `Node marker authority exceeds R4C: ${markerId}`)
  }
  const classified = source.match(/assert\.equal\(result\.classifiedOccurrences, (\d+)\)/)
  const blockers = source.match(/assert\.equal\(result\.blockers\.length, (\d+)\)/)
  assert.ok(classified && Number(classified[1]) <= 21, 'Node classified authority exceeds R4C')
  assert.ok(blockers && Number(blockers[1]) <= 20, 'Node blocker authority exceeds R4C')
}

function assertPackageRouting(): void {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  assert.equal(
    pkg.scripts['test:public-release-prompt-history-contract'],
    'npx tsx scripts/public-release-prompt-history-contract.test.ts',
  )
  assert.ok(pkg.scripts['test:kit'].includes('npm run test:public-release-prompt-history-contract'))
}

function assertReleaseManifestTracksR4C(): void {
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

assert.equal(countOccurrences(`${rawLearningTarget}\n${rawAuthoringName}\n`, rawLearningTarget), 1)
assert.equal(countOccurrences(`${rawLearningTarget}\n${rawAuthoringName}\n`, rawAuthoringName), 1)
assert.match(learningAlias, /^[a-z]+(?:-[a-z]+)+$/)
assert.match(authoringAlias, /^[a-z]+(?:-[a-z]+)+$/)

const syntheticSource = `# Change A\n<!-- @lesson id="synthetic" -->\nLearning ${rawLearningTarget}\nAuthoring ${rawAuthoringTarget}\n`
const syntheticGood = applyAliases(syntheticSource)
const syntheticAuthority: HistoryAuthority = {
  sourceSha256: sha256(syntheticSource),
  transformedSha256: sha256(syntheticGood),
  lines: 4,
  headings: 1,
  lessons: 1,
  changeTokens: 1,
  learningAliases: 1,
  authoringAliases: 1,
}
assertHistoryAliases(syntheticGood, syntheticAuthority)

let attacks = 0
function attack(name: string, value: string, pattern: RegExp): void {
  assert.throws(() => assertHistoryAliases(value, syntheticAuthority), pattern)
  attacks += 1
  console.log(`PASS attack: ${name}`)
}

attack('raw learning identity', syntheticGood.replace(learningAlias, rawLearningTarget), /raw learning-target identity/)
attack('raw authoring identity', syntheticGood.replace(authoringAlias, rawAuthoringName), /raw authoring-target identity/)
attack('missing learning alias', syntheticGood.replace(learningAlias, 'example-app'), /learning alias count/)
attack('extra learning alias', syntheticGood.replace(learningAlias, `${learningAlias} ${learningAlias}`), /learning alias count/)
attack('missing authoring alias', syntheticGood.replace(authoringAlias, 'example-authoring'), /authoring alias count/)
attack('historical workspace prefix', syntheticGood.replace(authoringAlias, `tempp/${authoringAlias}`), /historical workspace prefix/)
attack('line drift', syntheticGood.replace('Learning ', 'Learning context\nLearning '), /history line count/)
attack('heading drift', syntheticGood.replace('# Change A', 'Change A'), /history heading count/)
attack('lesson drift', syntheticGood.replace('<!-- @lesson', '<!-- lesson'), /lesson annotation count/)
attack('Change token drift', syntheticGood.replace('Change A', 'Update A'), /Change token count/)
attack('unrelated prose mutation', syntheticGood.replace('Learning ', 'Learner '), /transformed history hash/)
attack('missing final newline', syntheticGood.slice(0, -1), /final newline/)

assertPackageRouting()

const currentAuthority: HistoryAuthority = {
  sourceSha256: '28cca65197070069287da54c539f1ac63abd27a560b61587a7b99ce78b1fe1a9',
  transformedSha256: '709873d9ebdb4571be12e17563c0e0493dee360b07f49cf2a5c51712841feb90',
  lines: 1836,
  headings: 182,
  lessons: 60,
  changeTokens: 158,
  learningAliases: 23,
  authoringAliases: 2,
}
const currentGaps: string[] = []
function current(name: string, body: () => void): void {
  try {
    body()
  } catch {
    currentGaps.push(name)
  }
}

current('prompt-history alias transform', () => assertHistoryAliases(read(historyPath), currentAuthority))
current('R4C marker registry authority', assertR4CRegistryAuthority)
current('remediation-safe R4B authority', assertR4BRegressionIsMonotonic)
current('R4C Node index authority', assertNodeAuthorityTracksR4C)
current('R4C release-manifest paths', assertReleaseManifestTracksR4C)

assert.deepEqual(currentGaps, [], `R4C prompt-history current-tree gaps: ${currentGaps.join(', ')}`)
console.log(`public-release-prompt-history-contract.test: PASS (${attacks} attacks, 5 current surfaces)`)
