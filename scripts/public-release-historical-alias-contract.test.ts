import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluatePublicReleaseCandidate,
  parseInternalMarkerRegistry,
  parsePublicReleaseManifest,
  type CandidateFile,
} from './public-release-contract'
import { nodeSha256 } from './public-release-contract-node'

const root = process.cwd()
const rawLearningTarget = ['isu', 'elearner', 'learning'].join('-')
const rawAuthoringTarget = ['isu', 'elearner', 'authoring'].join('-')
const rawProjectRef = ['vkuojxgvkxnd', 'ftenrdno'].join('')
const rawLocalPath = [
  'C:',
  'Users',
  'vinht',
  'AppData',
  'Local',
  'Temp',
  'p17-011 linked worktree Ω xIW1Mb',
].join('\\')
const learningAlias = 'example-learning-app'
const authoringAlias = 'example-authoring-app'
const projectAlias = '<supabase-project-ref>'
const localPathAlias = '%TEMP%\\agentic-feature-kit linked worktree Ω'
const evidencePath = 'docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md'
const candidatePaths = [
  'docs/design/_review/section-10-clean.md',
  'docs/design/measurement-layer-b11-gate-and-version-bootstrap.md',
  'docs/design/measurement-layer-b11-wire.md',
  'docs/design/measurement-layer-tier-b-environment.md',
  'docs/design/measurement-layer-v1.md',
  'docs/evidence/post-17-worktree-browser-verification.md',
  'docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md',
] as const
const sourceManifest = [
  ...candidatePaths,
  'docs/roadmap/p17-018-r4f-historical-identity-aliases-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4f-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-historical-alias-contract.test.ts',
  'scripts/public-release-operational-alias-contract.test.ts',
  'scripts/public-release-private-archive-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const

type SurfaceAuthority = {
  path: typeof candidatePaths[number]
  sourceSha256: string
  transformedSha256: string
  lines: number
  sourceHadFinalNewline: boolean
  learningAliases: number
  authoringAliases: number
  projectAliases: number
  localPathAliases: number
}

type Marker = {
  id: string
  detectorId: string
  fingerprintSha256: string
  expectedTotal: number
  occurrences: unknown[]
}

const surfaceAuthorities: SurfaceAuthority[] = [
  {
    path: 'docs/design/_review/section-10-clean.md',
    sourceSha256: '95c036fe0369d1408d9e20220f5c77d740e7258a4b431677a956ae5e70fc9f3a',
    transformedSha256: '7d04f0b4c16186645854380973441a556fd7c5f985c3b00e4f3319579643b34c',
    lines: 263,
    sourceHadFinalNewline: false,
    learningAliases: 0,
    authoringAliases: 1,
    projectAliases: 0,
    localPathAliases: 0,
  },
  {
    path: 'docs/design/measurement-layer-b11-gate-and-version-bootstrap.md',
    sourceSha256: '1651897d6e32edb15d0c07f3f99c24b8b52fd13072eb9c56c45e262aa55438b5',
    transformedSha256: '3b5eb4ec1eac502cb3e94abd3fd690fbcf51e3826ede223c6e469d76026c04f1',
    lines: 148,
    sourceHadFinalNewline: true,
    learningAliases: 0,
    authoringAliases: 1,
    projectAliases: 0,
    localPathAliases: 0,
  },
  {
    path: 'docs/design/measurement-layer-b11-wire.md',
    sourceSha256: '30ee188222275efa7d95ef97fd65842b5205e91c28677280d647ca608ca9ebd6',
    transformedSha256: '031fded2528de9bf49179746c67fe12aaff8e9decea02cb3af5eff7a94373954',
    lines: 211,
    sourceHadFinalNewline: true,
    learningAliases: 1,
    authoringAliases: 1,
    projectAliases: 0,
    localPathAliases: 0,
  },
  {
    path: 'docs/design/measurement-layer-tier-b-environment.md',
    sourceSha256: 'b756d4646cc73194cb6565d0a083c9861bb199eef5571ae5971674f73694ebf9',
    transformedSha256: '0da19c4a22a5dcfdb9b3b61fca7a735aecf7eeb4823b7f2a73192fe91038cfcf',
    lines: 874,
    sourceHadFinalNewline: false,
    learningAliases: 0,
    authoringAliases: 2,
    projectAliases: 0,
    localPathAliases: 0,
  },
  {
    path: 'docs/design/measurement-layer-v1.md',
    sourceSha256: 'ff68f3e782c0edb75607fb2b14a6389c1480ec763e409ea876a478897dad93e3',
    transformedSha256: 'c69d79259b9cd7b8dd954ebe39df9a956e8c196ab5ceab71302f813a1b1ed86e',
    lines: 452,
    sourceHadFinalNewline: true,
    learningAliases: 1,
    authoringAliases: 1,
    projectAliases: 0,
    localPathAliases: 0,
  },
  {
    path: 'docs/evidence/post-17-worktree-browser-verification.md',
    sourceSha256: '99bdc3f12ebc5e22022cb00c9c7735de914682bc0ddede54311b03e4bef89b18',
    transformedSha256: '9d7c7fc5e34b94b135189fa76fca5eaa57ab5f4848afa3b8d1cd1b78fb292696',
    lines: 119,
    sourceHadFinalNewline: true,
    learningAliases: 0,
    authoringAliases: 0,
    projectAliases: 0,
    localPathAliases: 1,
  },
  {
    path: 'docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md',
    sourceSha256: 'a739f2da60b3e557ce960850e4109c9e0d6eb67e80d9462662edacad418f326b',
    transformedSha256: 'a355abce17a847f8405d8d4d8103d2b89a0348c4ae60245145a1bc6ce9b6b571',
    lines: 369,
    sourceHadFinalNewline: true,
    learningAliases: 0,
    authoringAliases: 0,
    projectAliases: 1,
    localPathAliases: 0,
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
    .replaceAll(rawProjectRef, projectAlias)
    .replaceAll(rawLocalPath, localPathAlias)
}

function reverseAliases(value: string): string {
  return value
    .replaceAll(learningAlias, rawLearningTarget)
    .replaceAll(authoringAlias, rawAuthoringTarget)
    .replaceAll(projectAlias, rawProjectRef)
    .replaceAll(localPathAlias, rawLocalPath)
}

function assertSurface(value: string, authority: SurfaceAuthority): void {
  assert.equal(value.includes('\r'), false, `${authority.path}: CR line ending`)
  assert.ok(value.endsWith('\n'), `${authority.path}: final newline`)
  assert.equal(count(value, rawLearningTarget), 0, `${authority.path}: raw learning identity`)
  assert.equal(count(value, rawAuthoringTarget), 0, `${authority.path}: raw authoring identity`)
  assert.equal(count(value, rawProjectRef), 0, `${authority.path}: raw project identity`)
  assert.equal(count(value, rawLocalPath), 0, `${authority.path}: raw local path`)
  assert.equal(count(value, learningAlias), authority.learningAliases, `${authority.path}: learning alias count`)
  assert.equal(count(value, authoringAlias), authority.authoringAliases, `${authority.path}: authoring alias count`)
  assert.equal(count(value, projectAlias), authority.projectAliases, `${authority.path}: project alias count`)
  assert.equal(count(value, localPathAlias), authority.localPathAliases, `${authority.path}: local-path alias count`)
  assert.equal(lineCount(value), authority.lines, `${authority.path}: line count`)
  assert.equal(sha256(value), authority.transformedSha256, `${authority.path}: transformed hash`)
  const reversed = reverseAliases(value)
  const original = authority.sourceHadFinalNewline ? reversed : reversed.slice(0, -1)
  if (!authority.sourceHadFinalNewline) {
    assert.ok(reversed.endsWith('\n'), `${authority.path}: normalized terminal LF`)
    assert.equal(original.endsWith('\n'), false, `${authority.path}: original terminal state`)
  }
  assert.equal(sha256(original), authority.sourceSha256, `${authority.path}: reversible source hash`)
}

function assertRegistryAuthority(): void {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as { markers: Marker[] }
  assert.deepEqual(registry.markers.map((marker) => [marker.id, marker.expectedTotal]), [
    ['internal-company-token', 0],
    ['internal-hostname', 0],
    ['live-supabase-project-ref', 0],
    ['local-user-path', 0],
    ['workspace-target-authoring', 0],
    ['workspace-target-learning', 0],
  ])
  assert.deepEqual(registry.markers.map((marker) => marker.detectorId), [
    'known-token-v1',
    'hostname-v1',
    'supabase-project-ref-v1',
    'windows-user-path-v1',
    'known-token-v1',
    'known-token-v1',
  ])
  assert.deepEqual(registry.markers.map((marker) => marker.fingerprintSha256), [
    '55e2df72e60870f1da684c144eb7ea720c5958259c9dc37e50f1d66eed2f9fb9',
    '49d59786804ea36cc1eaae2e270caf0e9df894eadcec92a110651f116c77d4cf',
    'd5b7bcc56029942d6f4e5274fec1b9f4dfe870943051dead0cb50e391bba8182',
    '0ac46f461df6235202015b30e55906d9c2c91479533465f0045fa161d44eb531',
    'dc8c0c3f495a30e7ae24ac811cd9c0a5cfa34689c6a8f46fdc2881a782c4418a',
    'e9b50f08930935c764e091eb6ae793f6d1305e0a4bd89f455237bff16acc7782',
  ])
  assert.equal(registry.markers.every((marker) => marker.occurrences.length === 0), true, 'zero occurrence bindings')
}

function assertR4ERegressionIsMonotonic(): void {
  const source = read('scripts/public-release-operational-alias-contract.test.ts')
  assert.match(source, /maximumTotals/)
  assert.match(source, /marker\.expectedTotal\s*<=\s*maximum/)
  assert.match(source, /bindings\.length\s*<=\s*9/)
  assert.match(source, /classifiedOccurrences\s*<=\s*10/)
  assert.doesNotMatch(source, /assert\.equal\(bindings\.length, 9/)
  assert.doesNotMatch(source, /assert\.equal\(result\.classifiedOccurrences, 10/)
}

function assertNodeAuthorityTracksR4F(): void {
  const source = read('scripts/public-release-contract-node.test.ts')
  assert.match(source, /\['live-supabase-project-ref', 0\]/)
  assert.match(source, /\['local-user-path', 0\]/)
  assert.match(source, /\['workspace-target-authoring', 0\]/)
  assert.match(source, /\['workspace-target-learning', 0\]/)
  assert.match(source, /assert\.equal\(result\.classifiedOccurrences, 0\)/)
  assert.match(source, /assert\.deepEqual\(result\.blockers, \[\]\)/)
  assert.match(source, /assert\.equal\(result\.candidateStatus, 'eligible-for-later-gates'\)/)
}

function assertPackageRouting(): void {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  assert.equal(
    pkg.scripts['test:public-release-historical-alias-contract'],
    'npx tsx scripts/public-release-historical-alias-contract.test.ts',
  )
  assert.ok(pkg.scripts['test:kit'].includes('npm run test:public-release-historical-alias-contract'))
}

function assertReleaseManifest(): void {
  const manifest = parsePublicReleaseManifest(JSON.parse(read('release/public-release-manifest.json')))
  const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  const hasEvidence = byPath.has(evidencePath)
  const expectedCount = hasEvidence ? 624 : 623
  assert.equal(manifest.entries.length, expectedCount)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'include').length, expectedCount)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'exclude').length, 0)
  for (const relativePath of sourceManifest) {
    const entry = byPath.get(relativePath)
    assert.equal(entry?.path, relativePath, `manifest path missing: ${relativePath}`)
    assert.equal(entry?.contentKind, 'text', `manifest content kind drift: ${relativePath}`)
    assert.equal(entry?.decision, 'include', `manifest decision drift: ${relativePath}`)
  }
  assert.equal(byPath.get(evidencePath)?.decision, hasEvidence ? 'include' : undefined)
}

function assertCurrentCandidateTransition(): void {
  const manifestBytes = fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'))
  const registryBytes = fs.readFileSync(path.join(root, 'release', 'internal-marker-classification.json'))
  const manifest = parsePublicReleaseManifest(JSON.parse(manifestBytes.toString('utf8')))
  parseInternalMarkerRegistry(JSON.parse(registryBytes.toString('utf8')))
  const files: CandidateFile[] = manifest.entries.map((entry) => {
    const absolute = path.join(root, ...entry.path.split('/'))
    const stat = fs.lstatSync(absolute)
    assert.equal(stat.isSymbolicLink(), false, `candidate path must not be a symlink: ${entry.path}`)
    assert.equal(stat.isFile(), true, `candidate path must be a file: ${entry.path}`)
    return {
      path: entry.path,
      gitMode: '100644',
      bytes: fs.readFileSync(absolute),
      reparsePoint: false,
    }
  })
  const result = evaluatePublicReleaseCandidate({ manifestBytes, registryBytes, files, sha256: nodeSha256 })
  assert.equal(result.contractValid, true, JSON.stringify(result))
  assert.equal(result.candidateStatus, 'eligible-for-later-gates')
  assert.equal(result.includedPaths, manifest.entries.length)
  assert.equal(result.excludedPaths, 0)
  assert.equal(result.classifiedOccurrences, 0)
  assert.deepEqual(result.blockers, [])
}

assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n${rawProjectRef}\n${rawLocalPath}\n`, rawLearningTarget), 1)
assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n${rawProjectRef}\n${rawLocalPath}\n`, rawAuthoringTarget), 1)
assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n${rawProjectRef}\n${rawLocalPath}\n`, rawProjectRef), 1)
assert.equal(count(`${rawLearningTarget}\n${rawAuthoringTarget}\n${rawProjectRef}\n${rawLocalPath}\n`, rawLocalPath), 1)

const syntheticSource = [rawLearningTarget, rawAuthoringTarget, rawProjectRef, rawLocalPath, ''].join('\n')
const syntheticGood = applyAliases(syntheticSource)
const syntheticAuthority: SurfaceAuthority = {
  path: 'docs/design/measurement-layer-v1.md',
  sourceSha256: sha256(syntheticSource),
  transformedSha256: sha256(syntheticGood),
  lines: 4,
  sourceHadFinalNewline: true,
  learningAliases: 1,
  authoringAliases: 1,
  projectAliases: 1,
  localPathAliases: 1,
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
attack('raw project identity', syntheticGood.replace(projectAlias, rawProjectRef), /raw project identity/)
attack('raw local path', syntheticGood.replace(localPathAlias, rawLocalPath), /raw local path/)
attack('missing learning alias', syntheticGood.replace(learningAlias, 'example-app'), /learning alias count/)
attack('missing authoring alias', syntheticGood.replace(authoringAlias, 'example-authoring'), /authoring alias count/)
attack('wrong project alias', syntheticGood.replace(projectAlias, '<project-ref>'), /project alias count/)
attack('wrong local-path alias', syntheticGood.replace(localPathAlias, '%TEMP%\\linked-worktree'), /local-path alias count/)
attack('extra alias', syntheticGood.replace(learningAlias, `${learningAlias} ${learningAlias}`), /learning alias count/)
attack('wrong alias case', syntheticGood.replace(authoringAlias, 'Example-Authoring-App'), /authoring alias count/)
attack('unrelated byte mutation', syntheticGood.replace('\n', ' changed\n'), /transformed hash/)
attack('line-count drift', `Context\n${syntheticGood}`, /line count/)
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

current('historical alias transform', () => {
  for (const authority of surfaceAuthorities) assertSurface(canonicalLf(read(authority.path)), authority)
})
current('zero-count marker registry authority', assertRegistryAuthority)
current('remediation-safe R4E authority', assertR4ERegressionIsMonotonic)
current('R4F Node Git-index authority', assertNodeAuthorityTracksR4F)
current('R4F release-manifest paths', assertReleaseManifest)
current('eligible-for-later-gates worktree transition', assertCurrentCandidateTransition)

assert.deepEqual(currentGaps, [], `R4F historical-alias current-tree gaps: ${currentGaps.join(', ')}`)
console.log(`public-release-historical-alias-contract.test: PASS (${attacks} attacks, 7 current surfaces)`)
