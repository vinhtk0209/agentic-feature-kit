import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

type ArchiveReceipt = {
  schemaVersion: string
  artifactId: string
  archiveId: string
  format: string
  sourceCommit: string
  artifactCount: number
  totalSourceBytes: number
  archiveSha256: string
  status: string
}

const root = process.cwd()
const receiptPath = 'release/private-archive-receipt.json'
const evidencePath = 'docs/evidence/post-17-public-release-r4d-private-archive-boundary-2026-08-18.md'
const archivedEvidencePaths = [
  'docs/evidence/i1-self-improvement-cycle-2026-08-12.json',
  'docs/evidence/i1-self-improvement-cycle-2026-08-12.md',
  'docs/evidence/post-17-cross-machine-tracking.md',
  'docs/evidence/post-17-privacy-wave-c2-schema-migration-design-2026-08-16.md',
] as const
const publicAliases = ['example-learning-app', 'example-authoring-app'] as const
const exactReceiptKeys = [
  'archiveId', 'archiveSha256', 'artifactCount', 'artifactId', 'format', 'schemaVersion',
  'sourceCommit', 'status', 'totalSourceBytes',
]

function parseReceipt(value: string): ArchiveReceipt {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('archive receipt must be valid JSON')
  }
  assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'archive receipt object')
  const object = parsed as Record<string, unknown>
  assert.deepEqual(Object.keys(object).sort(), exactReceiptKeys, 'archive receipt exact keys')
  assert.equal(object.schemaVersion, '1.0.0', 'archive receipt schema')
  assert.equal(object.artifactId, 'agentic-feature-kit-private-archive-receipt', 'archive receipt artifact ID')
  assert.equal(object.archiveId, 'p17-018-r4d-private-archive-2026-08-18', 'archive receipt ID')
  assert.equal(object.format, 'zip', 'archive format')
  assert.match(String(object.sourceCommit), /^[0-9a-f]{40}$/, 'archive source commit')
  assert.equal(object.artifactCount, 5, 'archive artifact count')
  assert.equal(object.totalSourceBytes, 23454, 'archive source bytes')
  assert.match(String(object.archiveSha256), /^[0-9a-f]{64}$/, 'archive digest')
  assert.equal(object.status, 'verified-private', 'archive status')
  const serialized = JSON.stringify(object)
  assert.doesNotMatch(serialized, /paths?|files?|items?|perFile|absolute|hostname|user|token|projectRef|content/i)
  return object as ArchiveReceipt
}

let passed = 0
function attack(name: string, value: unknown, expected: RegExp): void {
  assert.throws(() => parseReceipt(typeof value === 'string' ? value : `${JSON.stringify(value)}\n`), expected)
  console.log(`PASS attack: ${name}`)
  passed += 1
}

const validReceipt: ArchiveReceipt = {
  schemaVersion: '1.0.0',
  artifactId: 'agentic-feature-kit-private-archive-receipt',
  archiveId: 'p17-018-r4d-private-archive-2026-08-18',
  format: 'zip',
  sourceCommit: '57d6a5d7de4ffffffa51a9fea79cc3501e48bf54',
  artifactCount: 5,
  totalSourceBytes: 23454,
  archiveSha256: 'a'.repeat(64),
  status: 'verified-private',
}
assert.equal(parseReceipt(`${JSON.stringify(validReceipt)}\n`).archiveId, validReceipt.archiveId)
console.log('PASS valid metadata-only archive receipt')
passed += 1

attack('invalid JSON', '{', /valid JSON/)
attack('extra path field', { ...validReceipt, paths: ['private.md'] }, /exact keys/)
attack('per-file hash field', { ...validReceipt, perFileHashes: {} }, /exact keys/)
attack('wrong source commit', { ...validReceipt, sourceCommit: 'deadbeef' }, /source commit/)
attack('zero artifacts', { ...validReceipt, artifactCount: 0 }, /artifact count/)
attack('wrong byte total', { ...validReceipt, totalSourceBytes: 23453 }, /source bytes/)
attack('malformed digest', { ...validReceipt, archiveSha256: 'abc' }, /archive digest/)
attack('open status', { ...validReceipt, status: 'pending' }, /archive status/)

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}
function trackedPaths(): Set<string> {
  const buffer = execFileSync('git', ['-C', root, 'ls-files', '-z'])
  return new Set(buffer.toString('utf8').split('\0').filter(Boolean))
}

type PublicManifest = {
  entries: Array<{ path: string; decision: string; contentKind?: string; reasonCode?: string }>
}
function assertPublicManifestAuthority(manifest: PublicManifest, hasEvidence: boolean): void {
  const expectedCount = hasEvidence ? 616 : 615
  assert.equal(manifest.entries.length, expectedCount)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'include').length, expectedCount)
  assert.equal(manifest.entries.filter((entry) => entry.decision === 'exclude').length, 0)
  assert.equal(manifest.entries.some((entry) => archivedEvidencePaths.includes(entry.path as never)), false)
  assert.equal(manifest.entries.find((entry) => entry.path === 'sync.config.json')?.decision, 'include')
  for (const required of [
    'docs/design/adr-006-private-source-public-export-boundary.md',
    'docs/roadmap/p17-018-r4d-private-archive-boundary-plan.md',
    receiptPath,
    'scripts/post-17-public-release-r4d-plan.test.ts',
    'scripts/public-release-private-archive-contract.test.ts',
    'scripts/sync-config.test.ts',
    'scripts/sync-config.ts',
  ]) assert.ok(manifest.entries.some((entry) => entry.path === required && entry.decision === 'include'))
  assert.equal(manifest.entries.find((entry) => entry.path === evidencePath)?.decision, hasEvidence ? 'include' : undefined)
}

const currentManifest = JSON.parse(read('release/public-release-manifest.json')) as PublicManifest
const sourceFixture: PublicManifest = {
  ...currentManifest,
  entries: currentManifest.entries.filter((entry) => entry.path !== evidencePath),
}
const evidenceFixture: PublicManifest = {
  ...sourceFixture,
  entries: [...sourceFixture.entries, {
    path: evidencePath,
    decision: 'include',
    contentKind: 'text',
    reasonCode: 'public-source',
  }].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
}
assertPublicManifestAuthority(sourceFixture, false)
console.log('PASS source manifest authority without evidence metadata')
passed += 1
assertPublicManifestAuthority(evidenceFixture, true)
console.log('PASS evidence manifest authority with exact metadata row')
passed += 1

const currentGaps: string[] = []
function current(name: string, body: () => void): void {
  try {
    body()
  } catch {
    currentGaps.push(name)
  }
}

current('metadata-only private archive receipt', () => parseReceipt(read(receiptPath)))
current('archived evidence absent from tracked HEAD', () => {
  const tracked = trackedPaths()
  for (const archivedPath of archivedEvidencePaths) assert.equal(tracked.has(archivedPath), false)
})
current('public and local sync-config boundary', () => {
  const config = JSON.parse(read('sync.config.json')) as { targets: string[] }
  assert.deepEqual(config.targets, publicAliases.map((alias) => `../${alias}`))
  assert.match(read('.gitignore'), /^sync\.config\.local\.json$/m)
  assert.match(read('scripts/sync-to-targets.ts'), /loadSyncConfig\(KIT_ROOT\)/)
})
current('R4D marker registry authority', () => {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as {
    markers: Array<{ expectedTotal: number; occurrences: Array<{ disposition: string; expectedCount: number }> }>
  }
  const bindings = registry.markers.flatMap((marker) => marker.occurrences)
  assert.equal(registry.markers.reduce((sum, marker) => sum + marker.expectedTotal, 0), 15)
  assert.equal(bindings.length, 14)
  assert.equal(bindings.some((binding) => binding.disposition === 'move-to-private-archive'), false)
  assert.deepEqual(bindings.reduce<Record<string, { bindings: number; occurrences: number }>>((result, binding) => {
    result[binding.disposition] ??= { bindings: 0, occurrences: 0 }
    result[binding.disposition].bindings += 1
    result[binding.disposition].occurrences += binding.expectedCount
    return result
  }, {}), { genericize: { bindings: 14, occurrences: 15 } })
})
current('R4D public manifest authority', () => {
  const tracked = trackedPaths()
  assertPublicManifestAuthority(currentManifest, tracked.has(evidencePath))
})
current('remediation-safe R4C authority', () => {
  const source = read('scripts/public-release-prompt-history-contract.test.ts')
  assert.match(source, /allowedDispositions/)
  assert.match(source, /genericize.*bindings.*14/s)
  assert.match(source, /move-to-private-archive.*bindings.*6/s)
})
current('R4D Node index authority', () => {
  const source = read('scripts/public-release-contract-node.test.ts')
  assert.match(source, /assert\.equal\(result\.includedPaths, expectedPaths\.length\)/)
  assert.match(source, /assert\.equal\(result\.excludedPaths, 0\)/)
  assert.match(source, /assert\.equal\(result\.classifiedOccurrences, 15\)/)
  assert.match(source, /assert\.equal\(result\.blockers\.length, 14\)/)
})

assert.deepEqual(currentGaps, [], `R4D private-archive current-tree gaps: ${currentGaps.join(', ')}`)
console.log(`public-release-private-archive-contract.test: ${passed} contract assertions, 7 current surfaces`)
