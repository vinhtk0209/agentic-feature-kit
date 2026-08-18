import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const rawLearningTarget = ['isu', 'elearner', 'learning'].join('-')
const rawAuthoringTarget = ['isu', 'elearner', 'authoring'].join('-')
const learningAlias = 'example-learning-app'
const authoringAlias = 'example-authoring-app'
const evidencePath = 'docs/evidence/post-17-public-release-r4e-operational-aliases-2026-08-18.md'
const candidatePaths = [
  '.claude/_content/images.md',
  '.gitignore',
  'docs-site/pages/api-reference.mdx',
  'scripts/sync-to-targets.ts',
] as const
const sourceManifest = [
  '.claude/_content/images.md',
  '.gitignore',
  'docs-site/pages/api-reference.mdx',
  'docs/roadmap/p17-018-r4e-public-operational-aliases-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4e-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-operational-alias-contract.test.ts',
  'scripts/public-release-private-archive-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/sync-to-targets.ts',
] as const

type SurfaceAuthority = {
  path: typeof candidatePaths[number]
  sourceSha256: string
  transformedSha256: string
  lines: number
  learningAliases: number
  authoringAliases: number
}

type MarkerOccurrence = {
  path: string
  expectedCount: number
  disposition: string
  reasonCode: string
}

type Marker = {
  id: string
  detectorId: string
  fingerprintSha256: string
  expectedTotal: number
  occurrences: MarkerOccurrence[]
}

const surfaceAuthorities: SurfaceAuthority[] = [
  {
    path: '.claude/_content/images.md',
    sourceSha256: '8b7cea3c9e4a354753fd925817b0e0d34a293cc464c58599544a3867cb1a8fa2',
    transformedSha256: '2af4469dce889d39abebdb6a43d135506672ff3b8b35d954619f33f49e0b37a2',
    lines: 321,
    learningAliases: 1,
    authoringAliases: 0,
  },
  {
    path: '.gitignore',
    sourceSha256: 'c11d7b239ca25f1480d848187c2e8203faa9ee273289dd22208d6c17bd0c2790',
    transformedSha256: '03042f82c599e1627837a359698361ae7831c29260a830709637c7b509a6a384',
    lines: 52,
    learningAliases: 1,
    authoringAliases: 1,
  },
  {
    path: 'docs-site/pages/api-reference.mdx',
    sourceSha256: '3196e7205a07ceeaecf738babf678ff15dc220ab228b136cd0091f1f7fccfe57',
    transformedSha256: '637bbe2dc5677f8d07f3910f520a9a215ac89a4bf873a6fa2002308ed7e5178f',
    lines: 82,
    learningAliases: 1,
    authoringAliases: 0,
  },
  {
    path: 'scripts/sync-to-targets.ts',
    sourceSha256: 'dfcfe7468d387e8bb6421738e19b023cfdee9ee44ee21c372c5a14358b3129e3',
    transformedSha256: '312fc77e346f50bbd64046fd752cf2ea2ae96dd405970c71172a95ce48448360',
    lines: 726,
    learningAliases: 1,
    authoringAliases: 0,
  },
]

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function canonicalLf(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function count(value: string, token: string): number {
  return value.split(token).length - 1
}

function lineCount(value: string): number {
  return value.endsWith('\n') ? value.split('\n').length - 1 : value.split('\n').length
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

function assertSurface(value: string, authority: SurfaceAuthority): void {
  assert.equal(value.includes('\r'), false, `${authority.path}: CR line ending`)
  assert.ok(value.endsWith('\n'), `${authority.path}: final newline`)
  assert.equal(count(value, rawLearningTarget), 0, `${authority.path}: raw learning identity`)
  assert.equal(count(value, rawAuthoringTarget), 0, `${authority.path}: raw authoring identity`)
  assert.equal(count(value, learningAlias), authority.learningAliases, `${authority.path}: learning alias count`)
  assert.equal(count(value, authoringAlias), authority.authoringAliases, `${authority.path}: authoring alias count`)
  assert.equal(lineCount(value), authority.lines, `${authority.path}: line count`)
  assert.equal(sha256(value), authority.transformedSha256, `${authority.path}: transformed hash`)
  assert.equal(sha256(reverseAliases(value)), authority.sourceSha256, `${authority.path}: reversible source hash`)
}

function assertRegistryAuthority(): void {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as { markers: Marker[] }
  const maximumTotals = new Map([
    ['internal-company-token', 0],
    ['internal-hostname', 0],
    ['live-supabase-project-ref', 1],
    ['local-user-path', 1],
    ['workspace-target-authoring', 6],
    ['workspace-target-learning', 2],
  ])
  assert.deepEqual(registry.markers.map((marker) => marker.id), [...maximumTotals.keys()])
  const expectedFingerprints = new Map([
    ['live-supabase-project-ref', 'd5b7bcc56029942d6f4e5274fec1b9f4dfe870943051dead0cb50e391bba8182'],
    ['local-user-path', '0ac46f461df6235202015b30e55906d9c2c91479533465f0045fa161d44eb531'],
    ['workspace-target-authoring', 'dc8c0c3f495a30e7ae24ac811cd9c0a5cfa34689c6a8f46fdc2881a782c4418a'],
    ['workspace-target-learning', 'e9b50f08930935c764e091eb6ae793f6d1305e0a4bd89f455237bff16acc7782'],
  ])
  for (const marker of registry.markers) {
    const maximum = maximumTotals.get(marker.id)
    assert.notEqual(maximum, undefined, `unexpected marker: ${marker.id}`)
    assert.ok(marker.expectedTotal <= maximum!, `R4E marker count increased: ${marker.id}`)
    const expected = expectedFingerprints.get(marker.id)
    if (expected) assert.equal(marker.fingerprintSha256, expected, `fingerprint drift: ${marker.id}`)
  }
  const bindings = registry.markers.flatMap((marker) => marker.occurrences)
  const classifiedOccurrences = registry.markers.reduce((sum, marker) => sum + marker.expectedTotal, 0)
  assert.ok(bindings.length <= 9, 'R4E marker binding ceiling')
  assert.ok(classifiedOccurrences <= 10, 'R4E occurrence ceiling')
  assert.equal(bindings.every((binding) => binding.disposition === 'genericize'), true, 'R4E disposition set')
  assert.equal(bindings.every((binding) => binding.reasonCode === 'workspace-identity' || binding.reasonCode === 'local-user-context'), true, 'R4E reason-code set')
  assert.equal(bindings.some((binding) => candidatePaths.includes(binding.path as never)), false, 'stale operational binding')
}

function assertR4CRegressionIsMonotonic(): void {
  const source = read('scripts/public-release-prompt-history-contract.test.ts')
  assert.match(source, /genericized\.bindings\s*<=\s*14/)
  assert.match(source, /genericized\.occurrences\s*<=\s*15/)
  assert.doesNotMatch(source, /deepEqual\(dispositions\.genericize, \{ bindings: 14, occurrences: 15 \}\)/)
}

function assertR4DRegressionIsMonotonic(): void {
  const source = read('scripts/public-release-private-archive-contract.test.ts')
  assert.match(source, /archivedEvidencePaths/)
  assert.match(source, /assertPublicManifestAuthority/)
  assert.match(source, /classifiedOccurrences\s*<=\s*15/)
  assert.match(source, /bindings\.length\s*<=\s*14/)
  assert.match(source, /genericized\.bindings\s*<=\s*14/)
  assert.match(source, /genericized\.occurrences\s*<=\s*15/)
}

function assertNodeAuthorityTracksR4E(): void {
  const source = read('scripts/public-release-contract-node.test.ts')
  assert.match(source, /\['workspace-target-authoring', 0\]/)
  assert.match(source, /\['workspace-target-learning', 0\]/)
  assert.match(source, /assert\.equal\(result\.classifiedOccurrences, 0\)/)
  assert.match(source, /assert\.deepEqual\(result\.blockers, \[\]\)/)
}

function assertPackageRouting(): void {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  assert.equal(
    pkg.scripts['test:public-release-operational-alias-contract'],
    'npx tsx scripts/public-release-operational-alias-contract.test.ts',
  )
  assert.ok(pkg.scripts['test:kit'].includes('npm run test:public-release-operational-alias-contract'))
}

function assertReleaseManifest(): void {
  const manifest = JSON.parse(read('release/public-release-manifest.json')) as {
    entries: Array<{ path: string; contentKind: string; decision: string }>
  }
  const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  const hasEvidence = byPath.has(evidencePath)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'include').length, manifest.entries.length)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'exclude').length, 0)
  for (const relativePath of sourceManifest) {
    const entry = byPath.get(relativePath)
    assert.equal(entry?.path, relativePath, `manifest path missing: ${relativePath}`)
    assert.equal(entry?.contentKind, 'text', `manifest content kind drift: ${relativePath}`)
    assert.equal(entry?.decision, 'include', `manifest decision drift: ${relativePath}`)
  }
  assert.equal(byPath.get(evidencePath)?.decision, hasEvidence ? 'include' : undefined)
}

assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n`, rawLearningTarget), 1)
assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n`, rawAuthoringTarget), 1)
assert.match(learningAlias, /^[a-z]+(?:-[a-z]+)+$/)
assert.match(authoringAlias, /^[a-z]+(?:-[a-z]+)+$/)

const syntheticSource = `Learning ${rawLearningTarget}\nAuthoring ${rawAuthoringTarget}\n`
const syntheticGood = applyAliases(syntheticSource)
const syntheticAuthority: SurfaceAuthority = {
  path: '.gitignore',
  sourceSha256: sha256(syntheticSource),
  transformedSha256: sha256(syntheticGood),
  lines: 2,
  learningAliases: 1,
  authoringAliases: 1,
}
assertSurface(syntheticGood, syntheticAuthority)

let attacks = 0
function attack(name: string, value: string, pattern: RegExp): void {
  assert.throws(() => assertSurface(value, syntheticAuthority), pattern)
  attacks += 1
  console.log(`PASS attack: ${name}`)
}

attack('raw learning identity', syntheticGood.replace(learningAlias, rawLearningTarget), /raw learning identity/)
attack('raw authoring identity', syntheticGood.replace(authoringAlias, rawAuthoringTarget), /raw authoring identity/)
attack('missing learning alias', syntheticGood.replace(learningAlias, 'example-app'), /learning alias count/)
attack('extra learning alias', syntheticGood.replace(learningAlias, `${learningAlias} ${learningAlias}`), /learning alias count/)
attack('missing authoring alias', syntheticGood.replace(authoringAlias, 'example-authoring'), /authoring alias count/)
attack('wrong alias case', syntheticGood.replace(learningAlias, 'Example-Learning-App'), /learning alias count/)
attack('unrelated byte mutation', syntheticGood.replace('Learning ', 'Learner '), /transformed hash/)
attack('line-count drift', syntheticGood.replace('Learning ', 'Context\nLearning '), /line count/)
attack('CRLF drift', syntheticGood.replaceAll('\n', '\r\n'), /CR line ending/)
attack('missing final newline', syntheticGood.slice(0, -1), /final newline/)

assertPackageRouting()

const currentGaps: string[] = []
function current(name: string, body: () => void): void {
  try {
    body()
  } catch {
    currentGaps.push(name)
  }
}

current('operational alias transform', () => {
  for (const authority of surfaceAuthorities) assertSurface(canonicalLf(read(authority.path)), authority)
})
current('R4E marker registry authority', assertRegistryAuthority)
current('remediation-safe R4C authority', assertR4CRegressionIsMonotonic)
current('remediation-safe R4D authority', assertR4DRegressionIsMonotonic)
current('R4E Node Git-index authority', assertNodeAuthorityTracksR4E)
current('R4E release-manifest paths', assertReleaseManifest)

assert.deepEqual(currentGaps, [], `R4E operational-alias current-tree gaps: ${currentGaps.join(', ')}`)
console.log(`public-release-operational-alias-contract.test: PASS (${attacks} attacks, 6 current surfaces)`)
