import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  evaluatePublicReleaseCandidate,
  fingerprintMarker,
  parseInternalMarkerRegistry,
  parsePublicReleaseManifest,
  type CandidateFile,
  type InternalMarkerRegistry,
  type PublicReleaseManifest,
  type PublicReleaseManifestEntry,
} from './public-release-contract'
import {
  PUBLIC_RELEASE_CONTRACT_SENTINEL,
  loadGitIndexCandidate,
  nodeSha256,
  parseGitBatchBlobs,
  parseGitIndexRecords,
  runPublicReleaseContract,
  type PublicReleaseNodePorts,
} from './public-release-contract-node'

const root = process.cwd()
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
let passed = 0
let failed = 0

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  }
}

function sha256(value: Uint8Array): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function writeFile(directory: string, relative: string, content: string | Uint8Array): void {
  const target = path.join(directory, ...relative.split('/'))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function registry(markers: InternalMarkerRegistry['markers'] = []): InternalMarkerRegistry {
  return {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-internal-marker-classification',
    fingerprint: { algorithm: 'sha256', domain: 'agentic-feature-kit/public-marker/v1' },
    detectors: [
      { id: 'hostname-v1', kind: 'hostname' },
      { id: 'known-token-v1', kind: 'token' },
      { id: 'supabase-project-ref-v1', kind: 'supabase-project-ref' },
      { id: 'windows-user-path-v1', kind: 'windows-user-path' },
    ],
    markers,
  }
}

function manifestEntry(path: string): PublicReleaseManifestEntry {
  return { path, decision: 'include', contentKind: 'text', reasonCode: 'public-source' }
}

function writeContractFixture(
  directory: string,
  options: {
    registry?: InternalMarkerRegistry
    extraFiles?: Record<string, string>
  } = {},
): void {
  const markerRegistry = options.registry ?? registry()
  const registryText = `${JSON.stringify(markerRegistry, null, 2)}\n`
  const extraFiles = options.extraFiles ?? {}
  const entries = [
    manifestEntry('LICENSE'),
    manifestEntry('README.md'),
    ...Object.keys(extraFiles).map(manifestEntry),
    { ...manifestEntry('release/internal-marker-classification.json'), reasonCode: 'required-release-control' as const },
    { ...manifestEntry('release/public-release-manifest.json'), reasonCode: 'required-release-control' as const },
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const manifest: PublicReleaseManifest = {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-public-release',
    product: {
      displayName: 'Agentic Feature Kit',
      slug: 'agentic-feature-kit',
      license: 'Apache-2.0',
      packageVisibility: 'private',
      providers: ['codex', 'claude', 'copilot'],
    },
    candidateSource: {
      kind: 'git-index',
      unknownPathPolicy: 'deny',
      pathNormalization: 'repo-relative-posix-nfc',
    },
    limits: {
      maxPaths: 10_000,
      maxTextFileBytes: 4_194_304,
      maxBinaryFileBytes: 8_388_608,
      maxCandidateBytes: 268_435_456,
    },
    markerRegistry: {
      path: 'release/internal-marker-classification.json',
      sha256: sha256(new TextEncoder().encode(registryText)),
    },
    requiredPaths: [
      'LICENSE',
      'README.md',
      'release/internal-marker-classification.json',
      'release/public-release-manifest.json',
    ],
    entries,
    publicationBoundary: { packagePrivate: true, externalWrites: 'forbidden' },
  }
  writeFile(directory, 'LICENSE', 'Apache License\n')
  writeFile(directory, 'README.md', 'Agentic Feature Kit\n')
  for (const [relative, content] of Object.entries(extraFiles)) writeFile(directory, relative, content)
  writeFile(directory, 'release/internal-marker-classification.json', registryText)
  writeFile(directory, 'release/public-release-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
}

function initIndex(directory: string): void {
  const init = spawnSync('git', ['init', '--quiet'], { cwd: directory, encoding: 'utf8', shell: false, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  const add = spawnSync('git', ['add', '--all'], { cwd: directory, encoding: 'utf8', shell: false, windowsHide: true })
  assert.equal(add.status, 0, add.stderr)
}

function tempRepository(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'public release Ω '))
}

function runCli(repositoryRoot: string, args: string[] = []) {
  return spawnSync(process.execPath, [tsxCli, 'scripts/public-release-contract-node.ts', '--repository-root', repositoryRoot, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { PATH: process.env.PATH ?? '' },
    timeout: 30_000,
  })
}

async function main(): Promise<void> {
await test('NUL-delimited Git-index parser preserves spaces and Unicode and rejects malformed or unmerged records', () => {
  const valid = new TextEncoder().encode(
    '100644 0123456789012345678901234567890123456789 0\tdocs/path with spaces Ω.md\0'
      + '100755 abcdefabcdefabcdefabcdefabcdefabcdefabcd 0\tscripts/run.sh\0',
  )
  assert.deepEqual(parseGitIndexRecords(valid), [
    { mode: '100644', objectId: '0123456789012345678901234567890123456789', stage: 0, path: 'docs/path with spaces Ω.md' },
    { mode: '100755', objectId: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd', stage: 0, path: 'scripts/run.sh' },
  ])
  for (const attacked of [
    new TextEncoder().encode('100644 bad 0\tfile.txt\0'),
    new TextEncoder().encode('100644 0123456789012345678901234567890123456789 1\tfile.txt\0'),
    new TextEncoder().encode('100644 0123456789012345678901234567890123456789 0 file.txt\0'),
    new TextEncoder().encode('100644 0123456789012345678901234567890123456789 0\tfile.txt'),
    new Uint8Array([0xff, 0]),
  ]) assert.throws(() => parseGitIndexRecords(attacked), /Git index|UTF-8|stage/i)
  const tooMany = new TextEncoder().encode(Array.from(
    { length: 10_001 },
    (_, index) => `100644 0123456789012345678901234567890123456789 0\tfiles/${String(index).padStart(5, '0')}.txt\0`,
  ).join(''))
  assert.throws(() => parseGitIndexRecords(tooMany), /10,000|record limit/i)

  const objectId = '0123456789012345678901234567890123456789'
  const content = new Uint8Array([0, 1, 10, 255])
  const batch = Buffer.concat([
    Buffer.from(`${objectId} blob ${content.byteLength}\n`, 'ascii'),
    Buffer.from(content),
    Buffer.from('\n', 'ascii'),
  ])
  assert.deepEqual(parseGitBatchBlobs(batch, [objectId]), new Map([[objectId, content]]))
  for (const attacked of [
    batch.subarray(0, batch.byteLength - 1),
    Buffer.concat([batch, Buffer.from('extra')]),
    Buffer.from(`${objectId} tree 0\n\n`, 'ascii'),
    Buffer.from(`ffffffffffffffffffffffffffffffffffffffff blob 0\n\n`, 'ascii'),
  ]) assert.throws(() => parseGitBatchBlobs(attacked, [objectId]), /Git batch/i)
})

await test('adapter ports fail closed on Git failure, path escape, reparse ancestor, disappearance, and read error without content echo', () => {
  const safeRecord = new TextEncoder().encode('100644 0123456789012345678901234567890123456789 0\tdocs/file.txt\0')
  const base: PublicReleaseNodePorts = {
    listGitIndex: () => safeRecord,
    lstat: (absolutePath) => ({ kind: absolutePath.endsWith('file.txt') ? 'file' : 'directory' }),
    readIndexBlobs: (_repositoryRoot, objectIds) => new Map(
      objectIds.map((objectId) => [objectId, new TextEncoder().encode('safe-content')]),
    ),
  }
  assert.deepEqual(loadGitIndexCandidate('C:/fixture', base), [
    { path: 'docs/file.txt', gitMode: '100644', bytes: new TextEncoder().encode('safe-content'), reparsePoint: false },
  ])

  assert.throws(() => loadGitIndexCandidate('C:/fixture', {
    ...base,
    listGitIndex: () => { throw new Error('git failed with private output') },
  }), /Git index discovery failed/)
  assert.throws(() => loadGitIndexCandidate('C:/fixture', {
    ...base,
    listGitIndex: () => new TextEncoder().encode('100644 0123456789012345678901234567890123456789 0\t../escape\0'),
  }), /candidate path|segment/i)
  assert.throws(() => loadGitIndexCandidate('C:/fixture', {
    ...base,
    lstat: (absolutePath) => ({ kind: absolutePath.endsWith('docs') ? 'symlink' : absolutePath.endsWith('file.txt') ? 'file' : 'directory' }),
  }), /reparse|symlink/i)
  assert.throws(() => loadGitIndexCandidate('C:/fixture', {
    ...base,
    lstat: (absolutePath) => ({ kind: absolutePath.endsWith('file.txt') ? 'missing' : 'directory' }),
  }), /tracked file is missing/i)
  const raw = 'secret-like-value-must-not-echo'
  assert.throws(() => loadGitIndexCandidate('C:/fixture', {
    ...base,
    readIndexBlobs: () => { throw new Error(raw) },
  }), (error: unknown) => error instanceof Error && /tracked file read failed/.test(error.message) && !error.message.includes(raw))
})

await test('real Git-index adapter validates a path-with-spaces/Unicode fixture and CLI emits one sentinel', () => {
  const directory = tempRepository()
  try {
    writeContractFixture(directory, { extraFiles: { 'docs/path with spaces Ω.md': 'safe\n' } })
    initIndex(directory)
    const result = runPublicReleaseContract({ repositoryRoot: directory })
    assert.equal(result.contractValid, true)
    assert.equal(result.candidateStatus, 'eligible-for-later-gates')
    const cli = runCli(directory)
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stderr, '')
    const lines = cli.stdout.trim().split(/\r?\n/).filter(Boolean)
    assert.equal(lines.length, 1)
    assert.ok(lines[0].startsWith(PUBLIC_RELEASE_CONTRACT_SENTINEL))
    assert.deepEqual(JSON.parse(lines[0].slice(PUBLIC_RELEASE_CONTRACT_SENTINEL.length)), result)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

await test('candidate bytes remain bound to the Git index when the worktree becomes dirty after staging', () => {
  const directory = tempRepository()
  const rawProject = 'ponmlkjihgfedcbazyxw'
  try {
    writeContractFixture(directory)
    initIndex(directory)
    writeFile(directory, 'README.md', `https://${rawProject}.supabase.co\n`)
    const result = runPublicReleaseContract({ repositoryRoot: directory })
    assert.equal(result.contractValid, true, JSON.stringify(result))
    assert.equal(result.candidateStatus, 'eligible-for-later-gates')
    assert.equal(JSON.stringify(result).includes(rawProject), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

await test('contract mode permits exhaustive-but-unresolved classification while eligibility mode blocks', () => {
  const directory = tempRepository()
  const raw = 'internal-target-adapter'
  try {
    const markerRegistry = registry([{
      id: 'adapter-marker',
      detectorId: 'known-token-v1',
      fingerprintSha256: fingerprintMarker(raw, nodeSha256),
      expectedTotal: 1,
      occurrences: [{
        path: 'docs/internal.md',
        expectedCount: 1,
        disposition: 'genericize',
        reasonCode: 'workspace-identity',
      }],
    }])
    writeContractFixture(directory, { registry: markerRegistry, extraFiles: { 'docs/internal.md': `${raw}\n` } })
    initIndex(directory)
    const result = runPublicReleaseContract({ repositoryRoot: directory })
    assert.equal(result.contractValid, true)
    assert.equal(result.candidateStatus, 'blocked')
    assert.equal(runCli(directory).status, 0)
    assert.equal(runCli(directory, ['--require-eligible']).status, 1)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

await test('CLI rejects an unclassified synthetic service reference and never emits its raw value', () => {
  const directory = tempRepository()
  const rawProject = 'zyxwvutsrqponmlkjihg'
  try {
    writeContractFixture(directory, {
      extraFiles: { 'docs/internal.md': `https://${rawProject}.supabase.co\n` },
    })
    initIndex(directory)
    const cli = runCli(directory)
    assert.equal(cli.status, 1)
    assert.equal(cli.stderr, '')
    assert.equal(`${cli.stdout}${cli.stderr}`.includes(rawProject), false)
    const lines = cli.stdout.trim().split(/\r?\n/).filter(Boolean)
    assert.equal(lines.length, 1)
    const result = JSON.parse(lines[0].slice(PUBLIC_RELEASE_CONTRACT_SENTINEL.length))
    assert.equal(result.contractValid, false)
    assert.ok(result.blockers.some((blocker: { code: string }) => blocker.code === 'unclassified-marker'))
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

await test('current public-release authorities cover the exact planned index and report only unresolved dispositions', () => {
  const listed = spawnSync('git', ['ls-files', '--stage', '-z'], {
    cwd: root,
    encoding: null,
    shell: false,
    windowsHide: true,
  })
  assert.equal(listed.status, 0, listed.stderr?.toString())
  assert.ok(listed.stdout instanceof Uint8Array)
  const records = parseGitIndexRecords(listed.stdout)
  const modeByPath = new Map(records.map((record) => [record.path, record.mode]))
  const expectedPaths = [...modeByPath.keys()].sort()

  const manifestBytes = fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'))
  const registryBytes = fs.readFileSync(path.join(root, 'release', 'internal-marker-classification.json'))
  const manifest = parsePublicReleaseManifest(JSON.parse(manifestBytes.toString('utf8')))
  const markerRegistry = parseInternalMarkerRegistry(JSON.parse(registryBytes.toString('utf8')))
  assert.deepEqual(manifest.entries.map((entry) => entry.path), expectedPaths)
  const expectedExcludedEntries = [
    ['docs/evidence/i1-self-improvement-cycle-2026-08-12.json', 'private-evidence'],
    ['docs/evidence/i1-self-improvement-cycle-2026-08-12.md', 'private-evidence'],
    ['docs/evidence/post-17-cross-machine-tracking.md', 'private-evidence'],
    ['docs/evidence/post-17-privacy-wave-c2-schema-migration-design-2026-08-16.md', 'private-evidence'],
    ['sync.config.json', 'workspace-only'],
  ]
  assert.deepEqual(
    manifest.entries
      .filter((entry) => entry.decision === 'exclude')
      .map((entry) => [entry.path, entry.reasonCode]),
    expectedExcludedEntries,
  )
  assert.deepEqual(markerRegistry.markers.map((marker) => [marker.id, marker.expectedTotal]), [
    ['internal-company-token', 0],
    ['internal-hostname', 21],
    ['live-supabase-project-ref', 8],
    ['local-user-path', 1],
    ['workspace-target-authoring', 10],
    ['workspace-target-learning', 30],
  ])

  const files: CandidateFile[] = manifest.entries.map((entry) => {
    const absolute = path.join(root, ...entry.path.split('/'))
    const stat = fs.lstatSync(absolute)
    assert.equal(stat.isSymbolicLink(), false, `candidate path must not be a symlink: ${entry.path}`)
    assert.equal(stat.isFile(), true, `candidate path must be a file: ${entry.path}`)
    return {
      path: entry.path,
      gitMode: modeByPath.get(entry.path) ?? '100644',
      bytes: fs.readFileSync(absolute),
      reparsePoint: stat.isSymbolicLink(),
    }
  })
  const result = evaluatePublicReleaseCandidate({ manifestBytes, registryBytes, files, sha256: nodeSha256 })
  const expectedIncludedPaths = expectedPaths.length - expectedExcludedEntries.length
  assert.equal(result.contractValid, true, JSON.stringify(result))
  assert.equal(result.candidateStatus, 'blocked')
  assert.equal(result.includedPaths, expectedIncludedPaths)
  assert.equal(result.excludedPaths, expectedExcludedEntries.length)
  assert.equal(result.classifiedOccurrences, 70)
  assert.equal(result.blockers.length, 28)
  assert.deepEqual([...new Set(result.blockers.map((blocker) => blocker.code))], ['unresolved-marker-disposition'])
})

console.log(`\npublic-release-contract-node.test: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
}

void main()
