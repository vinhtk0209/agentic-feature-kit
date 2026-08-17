import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  evaluatePublicReleaseCandidate,
  fingerprintMarker,
  parseInternalMarkerRegistry,
  parsePublicReleaseManifest,
  type CandidateFile,
  type InternalMarkerRegistry,
  type MarkerDisposition,
  type PublicReleaseManifest,
  type PublicReleaseManifestEntry,
  type Sha256Port,
} from './public-release-contract'

const encoder = new TextEncoder()
const sha256: Sha256Port = (value) => crypto.createHash('sha256').update(value).digest('hex')

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

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function textFile(path: string, content: string, overrides: Partial<CandidateFile> = {}): CandidateFile {
  return { path, gitMode: '100644', bytes: encoder.encode(content), reparsePoint: false, ...overrides }
}

function binaryFile(path: string, bytes: Uint8Array, overrides: Partial<CandidateFile> = {}): CandidateFile {
  return { path, gitMode: '100644', bytes, reparsePoint: false, ...overrides }
}

function baseRegistry(): InternalMarkerRegistry {
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
    markers: [],
  }
}

function entry(
  path: string,
  decision: 'include' | 'exclude' = 'include',
  contentKind: 'text' | 'binary' = 'text',
  sha?: string,
): PublicReleaseManifestEntry {
  const value: PublicReleaseManifestEntry = {
    path,
    decision,
    contentKind,
    reasonCode: decision === 'include' ? 'public-source' : 'workspace-only',
  }
  if (sha) value.sha256 = sha
  return value
}

function baseManifest(registryBytes: Uint8Array, extraEntries: PublicReleaseManifestEntry[] = []): PublicReleaseManifest {
  const entries = [
    entry('LICENSE'),
    entry('README.md'),
    entry('release/internal-marker-classification.json'),
    entry('release/public-release-manifest.json'),
    ...extraEntries,
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  return {
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
      sha256: sha256(registryBytes),
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
}

function evaluateFixture(
  registry: InternalMarkerRegistry,
  extraEntries: PublicReleaseManifestEntry[] = [],
  extraFiles: CandidateFile[] = [],
) {
  const registryBytes = jsonBytes(registry)
  const manifest = baseManifest(registryBytes, extraEntries)
  const manifestBytes = jsonBytes(manifest)
  const files = [
    textFile('LICENSE', 'Apache License\n'),
    textFile('README.md', 'Agentic Feature Kit\n'),
    textFile('release/internal-marker-classification.json', new TextDecoder().decode(registryBytes)),
    textFile('release/public-release-manifest.json', new TextDecoder().decode(manifestBytes)),
    ...extraFiles,
  ]
  return evaluatePublicReleaseCandidate({ manifestBytes, registryBytes, files, sha256 })
}

function marker(
  registry: InternalMarkerRegistry,
  input: {
    id: string
    detectorId: string
    raw: string
    path?: string
    disposition?: MarkerDisposition
    rationale?: string
    expectedTotal?: number
  },
): void {
  const occurrence = input.path === undefined ? [] : [{
    path: input.path,
    expectedCount: input.expectedTotal ?? 1,
    disposition: input.disposition ?? 'genericize',
    reasonCode: 'workspace-identity' as const,
    ...(input.disposition === 'reviewed-retained'
      ? { publicSafeRationale: input.rationale ?? 'Reviewed public compatibility reference.' }
      : {}),
  }]
  registry.markers.push({
    id: input.id,
    detectorId: input.detectorId,
    fingerprintSha256: fingerprintMarker(input.raw, sha256),
    expectedTotal: input.expectedTotal ?? occurrence.reduce((sum, current) => sum + current.expectedCount, 0),
    occurrences: occurrence,
  })
  registry.markers.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function main(): Promise<void> {
await test('positive contract accepts exact text tree and remains eligible for later gates', () => {
  const result = evaluateFixture(baseRegistry())
  assert.equal(result.contractValid, true)
  assert.equal(result.candidateStatus, 'eligible-for-later-gates')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.includedPaths, 4)
  assert.equal(result.excludedPaths, 0)
  assert.equal(result.classifiedOccurrences, 0)
})

await test('all four dispositions are classified while unresolved work keeps the candidate blocked', () => {
  const registry = baseRegistry()
  const cases: Array<{ id: string; raw: string; path: string; disposition: MarkerDisposition }> = [
    { id: 'genericize-marker', raw: 'internal-target-alpha', path: 'docs/a.md', disposition: 'genericize' },
    { id: 'private-archive-marker', raw: 'internal-target-beta', path: 'docs/b.md', disposition: 'move-to-private-archive' },
    { id: 'synthetic-fixture-marker', raw: 'internal-target-gamma', path: 'tests/c.txt', disposition: 'replace-with-synthetic-fixture' },
    { id: 'reviewed-marker', raw: 'public-reference-delta', path: 'docs/d.md', disposition: 'reviewed-retained' },
  ]
  for (const value of cases) marker(registry, { ...value, detectorId: 'known-token-v1' })
  const result = evaluateFixture(
    registry,
    cases.map((value) => entry(value.path, value.disposition === 'move-to-private-archive' ? 'exclude' : 'include')),
    cases.map((value) => textFile(value.path, `${value.raw}\n`)),
  )
  assert.equal(result.contractValid, true)
  assert.equal(result.candidateStatus, 'blocked')
  assert.equal(result.classifiedOccurrences, 4)
  assert.deepEqual(result.blockers.map((blocker) => blocker.code), [
    'unresolved-marker-disposition',
    'unresolved-marker-disposition',
    'unresolved-marker-disposition',
  ])
  assert.equal(JSON.stringify(result).includes('internal-target'), false)
})

await test('reviewed-retained with a public-safe rationale remains eligible', () => {
  const registry = baseRegistry()
  marker(registry, {
    id: 'reviewed-marker', detectorId: 'known-token-v1', raw: 'public-reference-delta',
    path: 'docs/reference.md', disposition: 'reviewed-retained', rationale: 'Public compatibility label.',
  })
  const result = evaluateFixture(
    registry,
    [entry('docs/reference.md')],
    [textFile('docs/reference.md', 'public-reference-delta\n')],
  )
  assert.equal(result.contractValid, true)
  assert.equal(result.candidateStatus, 'eligible-for-later-gates')
})

await test('zero-occurrence token fingerprint is a valid regression guard', () => {
  const registry = baseRegistry()
  marker(registry, { id: 'absent-marker', detectorId: 'known-token-v1', raw: 'must-remain-absent', expectedTotal: 0 })
  const result = evaluateFixture(registry)
  assert.equal(result.contractValid, true)
  assert.equal(result.candidateStatus, 'eligible-for-later-gates')
})

await test('unknown and missing tracked paths fail closed', () => {
  const registry = baseRegistry()
  const unknown = evaluateFixture(registry, [], [textFile('unknown.md', 'unknown\n')])
  assert.equal(unknown.contractValid, false)
  assert.ok(unknown.blockers.some((blocker) => blocker.code === 'unknown-tracked-path'))

  const registryBytes = jsonBytes(registry)
  const manifest = baseManifest(registryBytes, [entry('missing.md')])
  const manifestBytes = jsonBytes(manifest)
  const missing = evaluatePublicReleaseCandidate({
    manifestBytes,
    registryBytes,
    files: [
      textFile('LICENSE', 'Apache License\n'),
      textFile('README.md', 'Agentic Feature Kit\n'),
      textFile('release/internal-marker-classification.json', new TextDecoder().decode(registryBytes)),
      textFile('release/public-release-manifest.json', new TextDecoder().decode(manifestBytes)),
    ],
    sha256,
  })
  assert.equal(missing.contractValid, false)
  assert.ok(missing.blockers.some((blocker) => blocker.code === 'missing-tracked-path'))
})

await test('excluded descendants remain marker-scanned and cannot hide unresolved data', () => {
  const registry = baseRegistry()
  marker(registry, {
    id: 'excluded-marker', detectorId: 'known-token-v1', raw: 'private-history-alpha',
    path: 'docs/evidence/private.md', disposition: 'move-to-private-archive',
  })
  const result = evaluateFixture(
    registry,
    [entry('docs/evidence/private.md', 'exclude')],
    [textFile('docs/evidence/private.md', 'private-history-alpha\n')],
  )
  assert.equal(result.contractValid, true)
  assert.equal(result.excludedPaths, 1)
  assert.equal(result.classifiedOccurrences, 1)
  assert.equal(result.candidateStatus, 'blocked')
})

await test('manifest parser rejects traversal, absolute, backslash, duplicate, case, and Unicode aliases', () => {
  const registryBytes = jsonBytes(baseRegistry())
  const attacks = [
    '../escape',
    '/absolute',
    'C:/absolute',
    'docs\\alias.md',
    'docs//empty.md',
    'docs/./dot.md',
    `docs/cafe\u0301.md`,
    'docs/file.',
    'docs/file ',
    'docs/name:stream',
    'docs/CON.txt',
    'docs/aux',
  ]
  for (const attackedPath of attacks) {
    const manifest = baseManifest(registryBytes, [entry(attackedPath)])
    assert.throws(() => parsePublicReleaseManifest(manifest), /path|NFC|absolute|segment|backslash/i)
  }
  const duplicate = baseManifest(registryBytes)
  duplicate.entries.push(clone(duplicate.entries[0]))
  assert.throws(() => parsePublicReleaseManifest(duplicate), /sorted and unique/i)

  const collision = baseManifest(registryBytes, [entry('readme.md')])
  assert.throws(() => parsePublicReleaseManifest(collision), /case-colliding/i)
})

await test('candidate rejects symlink, reparse-point, unsupported mode, and candidate path aliases', () => {
  const registry = baseRegistry()
  const cases: CandidateFile[] = [
    textFile('README.md', 'safe\n', { gitMode: '120000' }),
    textFile('README.md', 'safe\n', { reparsePoint: true }),
    textFile('README.md', 'safe\n', { gitMode: '160000' }),
    textFile('README.md', 'safe\n', { path: 'docs\\alias.md' }),
  ]
  for (const attacked of cases) {
    const registryBytes = jsonBytes(registry)
    const manifest = baseManifest(registryBytes)
    const manifestBytes = jsonBytes(manifest)
    const files = [
      textFile('LICENSE', 'Apache License\n'),
      attacked,
      textFile('release/internal-marker-classification.json', new TextDecoder().decode(registryBytes)),
      textFile('release/public-release-manifest.json', new TextDecoder().decode(manifestBytes)),
    ]
    const result = evaluatePublicReleaseCandidate({ manifestBytes, registryBytes, files, sha256 })
    assert.equal(result.contractValid, false)
  }
})

await test('manifest parser rejects unknown fields and identity, version, provider, visibility, order, and limit drift', () => {
  const registryBytes = jsonBytes(baseRegistry())
  const base = baseManifest(registryBytes)
  const attacks: unknown[] = [
    { ...clone(base), surprise: true },
    { ...clone(base), schemaVersion: '2.0.0' },
    { ...clone(base), artifactId: 'other' },
    { ...clone(base), product: { ...clone(base.product), displayName: 'Other Kit' } },
    { ...clone(base), product: { ...clone(base.product), providers: ['claude', 'codex', 'copilot'] } },
    { ...clone(base), product: { ...clone(base.product), packageVisibility: 'public' } },
    { ...clone(base), limits: { ...clone(base.limits), maxPaths: 20_000 } },
    { ...clone(base), entries: [...clone(base.entries)].reverse() },
  ]
  for (const attacked of attacks) assert.throws(() => parsePublicReleaseManifest(attacked))
})

await test('manifest entry schema rejects unknown reasons and malformed binary digest contracts', () => {
  const registryBytes = jsonBytes(baseRegistry())
  const unknownReason = baseManifest(registryBytes, [
    { path: 'docs/x.md', decision: 'include', contentKind: 'text', reasonCode: 'invented-reason' as 'public-source' },
  ])
  assert.throws(() => parsePublicReleaseManifest(unknownReason), /reasonCode/)

  const missingDigest = baseManifest(registryBytes, [entry('assets/logo.png', 'include', 'binary')])
  assert.throws(() => parsePublicReleaseManifest(missingDigest), /sha256/)

  const extraDigest = baseManifest(registryBytes, [{ ...entry('docs/x.md'), sha256: '0'.repeat(64) }])
  assert.throws(() => parsePublicReleaseManifest(extraDigest), /sha256|fields/)
})

await test('registry parser rejects unknown fields, versions, duplicate IDs, detector drift, dispositions, and totals', () => {
  const base = baseRegistry()
  const unknownField = { ...clone(base), rawMarker: 'forbidden' }
  assert.throws(() => parseInternalMarkerRegistry(unknownField), /fields/)
  assert.throws(() => parseInternalMarkerRegistry({ ...clone(base), schemaVersion: '2.0.0' }), /unsupported|schemaVersion/)

  const duplicateDetector = clone(base)
  duplicateDetector.detectors.push(clone(duplicateDetector.detectors[0]))
  assert.throws(() => parseInternalMarkerRegistry(duplicateDetector), /detector IDs/)

  const unknownDetector = clone(base)
  marker(unknownDetector, { id: 'marker-a', detectorId: 'missing-v1', raw: 'value-a', expectedTotal: 0 })
  assert.throws(() => parseInternalMarkerRegistry(unknownDetector), /detectorId/)

  const unknownDisposition = clone(base)
  marker(unknownDisposition, { id: 'marker-b', detectorId: 'known-token-v1', raw: 'value-b', path: 'a.md' })
  unknownDisposition.markers[0].occurrences[0].disposition = 'other' as MarkerDisposition
  assert.throws(() => parseInternalMarkerRegistry(unknownDisposition), /disposition/)

  const totalMismatch = clone(base)
  marker(totalMismatch, { id: 'marker-c', detectorId: 'known-token-v1', raw: 'value-c', path: 'a.md' })
  totalMismatch.markers[0].expectedTotal = 2
  assert.throws(() => parseInternalMarkerRegistry(totalMismatch), /expectedTotal/)
})

await test('registry rejects ambiguous fingerprints and reviewed rationale misuse', () => {
  const duplicateFingerprint = baseRegistry()
  marker(duplicateFingerprint, { id: 'marker-a', detectorId: 'known-token-v1', raw: 'same-value', expectedTotal: 0 })
  marker(duplicateFingerprint, { id: 'marker-b', detectorId: 'known-token-v1', raw: 'same-value', expectedTotal: 0 })
  assert.throws(() => parseInternalMarkerRegistry(duplicateFingerprint), /fingerprint mapping/)

  const missingRationale = baseRegistry()
  marker(missingRationale, {
    id: 'reviewed', detectorId: 'known-token-v1', raw: 'reviewed-value',
    path: 'docs/x.md', disposition: 'reviewed-retained', rationale: '   ',
  })
  assert.throws(() => parseInternalMarkerRegistry(missingRationale), /publicSafeRationale/)

  const extraRationale = baseRegistry()
  marker(extraRationale, { id: 'unresolved', detectorId: 'known-token-v1', raw: 'internal-value', path: 'docs/x.md' })
  ;(extraRationale.markers[0].occurrences[0] as unknown as Record<string, unknown>).publicSafeRationale = 'Not allowed.'
  assert.throws(() => parseInternalMarkerRegistry(extraRationale), /fields/)
})

await test('marker binding rejects stale count, wrong path, fingerprint mismatch, and duplicate disposition', () => {
  const stale = baseRegistry()
  marker(stale, { id: 'stale', detectorId: 'known-token-v1', raw: 'marker-alpha', path: 'docs/x.md', expectedTotal: 2 })
  const staleResult = evaluateFixture(stale, [entry('docs/x.md')], [textFile('docs/x.md', 'marker-alpha\n')])
  assert.equal(staleResult.contractValid, false)
  assert.ok(staleResult.blockers.some((blocker) => blocker.code === 'marker-count-mismatch'))

  const wrongPath = baseRegistry()
  marker(wrongPath, { id: 'wrong-path', detectorId: 'known-token-v1', raw: 'marker-beta', path: 'docs/a.md' })
  const wrongPathResult = evaluateFixture(
    wrongPath,
    [entry('docs/a.md'), entry('docs/b.md')],
    [textFile('docs/a.md', 'safe\n'), textFile('docs/b.md', 'marker-beta\n')],
  )
  assert.equal(wrongPathResult.contractValid, false)
  assert.ok(wrongPathResult.blockers.some((blocker) => blocker.code === 'marker-path-mismatch'))

  const wrongFingerprint = baseRegistry()
  marker(wrongFingerprint, { id: 'wrong-fingerprint', detectorId: 'known-token-v1', raw: 'marker-gamma', path: 'docs/x.md' })
  wrongFingerprint.markers[0].fingerprintSha256 = sha256(encoder.encode('marker-gamma'))
  const wrongFingerprintResult = evaluateFixture(
    wrongFingerprint,
    [entry('docs/x.md')],
    [textFile('docs/x.md', 'marker-gamma\n')],
  )
  assert.equal(wrongFingerprintResult.contractValid, false)
  assert.ok(wrongFingerprintResult.blockers.some((blocker) => blocker.code === 'marker-count-mismatch'))

  const duplicate = baseRegistry()
  marker(duplicate, { id: 'duplicate', detectorId: 'known-token-v1', raw: 'marker-delta', path: 'docs/x.md' })
  duplicate.markers[0].occurrences.push(clone(duplicate.markers[0].occurrences[0]))
  duplicate.markers[0].expectedTotal = 2
  assert.throws(() => parseInternalMarkerRegistry(duplicate), /occurrence paths/)
})

await test('generic detectors reject unclassified service references and Windows user paths without echoing them', () => {
  const rawProject = 'abcdefghijklmnopqrst'
  const rawPath = ['C:', 'Users', 'example-user', 'private', 'file.txt'].join('\\')
  const projectResult = evaluateFixture(
    baseRegistry(),
    [entry('docs/project.md')],
    [textFile('docs/project.md', `https://${rawProject}.supabase.co\n`)],
  )
  assert.equal(projectResult.contractValid, false)
  assert.equal(projectResult.blockers.filter((blocker) => blocker.code === 'unclassified-marker').length, 1)

  const pathResult = evaluateFixture(
    baseRegistry(),
    [entry('docs/path.md')],
    [textFile('docs/path.md', `${rawPath}\n`)],
  )
  assert.equal(pathResult.contractValid, false)
  assert.equal(pathResult.blockers.filter((blocker) => blocker.code === 'unclassified-marker').length, 1)
  const serialized = `${JSON.stringify(projectResult)}${JSON.stringify(pathResult)}`
  assert.equal(serialized.includes(rawProject), false)
  assert.equal(serialized.includes(rawPath), false)
})

await test('registry plaintext leakage is rejected after a synthetic marker is detected', () => {
  const raw = 'internal-marker-plaintext'
  const registry = baseRegistry()
  marker(registry, {
    id: 'reviewed', detectorId: 'known-token-v1', raw,
    path: 'docs/x.md', disposition: 'reviewed-retained', rationale: `Unsafe echo: ${raw}`,
  })
  const result = evaluateFixture(registry, [entry('docs/x.md')], [textFile('docs/x.md', `${raw}\n`)])
  assert.equal(result.contractValid, false)
  assert.ok(result.blockers.some((blocker) => blocker.code === 'registry-plaintext-marker'))
  assert.equal(JSON.stringify(result).includes(raw), false)
})

await test('binary include is digest-bound and binary/text declaration attacks fail closed', () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 255])
  const valid = evaluateFixture(
    baseRegistry(),
    [entry('assets/logo.png', 'include', 'binary', sha256(bytes))],
    [binaryFile('assets/logo.png', bytes)],
  )
  assert.equal(valid.contractValid, true)

  const mismatch = evaluateFixture(
    baseRegistry(),
    [entry('assets/logo.png', 'include', 'binary', '0'.repeat(64))],
    [binaryFile('assets/logo.png', bytes)],
  )
  assert.equal(mismatch.contractValid, false)
  assert.ok(mismatch.blockers.some((blocker) => blocker.code === 'binary-digest-mismatch'))

  const invalidUtf8 = evaluateFixture(
    baseRegistry(),
    [entry('docs/invalid.txt')],
    [binaryFile('docs/invalid.txt', new Uint8Array([0xc3, 0x28]))],
  )
  assert.equal(invalidUtf8.contractValid, false)
  assert.ok(invalidUtf8.blockers.some((blocker) => blocker.code === 'invalid-utf8'))
})

await test('path, file, and aggregate size limits fail before unbounded scanning', () => {
  const oversized = evaluateFixture(
    baseRegistry(),
    [entry('docs/large.txt')],
    [binaryFile('docs/large.txt', new Uint8Array(4_194_305))],
  )
  assert.equal(oversized.contractValid, false)
  assert.ok(oversized.blockers.some((blocker) => blocker.code === 'file-size-limit'))

  const registryBytes = jsonBytes(baseRegistry())
  const manifest = baseManifest(registryBytes)
  const attacked = clone(manifest) as unknown as { limits: { maxPaths: number } }
  attacked.limits.maxPaths = 3
  assert.throws(() => parsePublicReleaseManifest(attacked), /limits/)
})

await test('marker registry digest mismatch and manifest-file byte mismatch fail closed', () => {
  const registry = baseRegistry()
  const registryBytes = jsonBytes(registry)
  const manifest = baseManifest(registryBytes)
  manifest.markerRegistry.sha256 = '0'.repeat(64)
  const manifestBytes = jsonBytes(manifest)
  const digestMismatch = evaluatePublicReleaseCandidate({
    manifestBytes,
    registryBytes,
    files: [
      textFile('LICENSE', 'Apache License\n'),
      textFile('README.md', 'Agentic Feature Kit\n'),
      textFile('release/internal-marker-classification.json', new TextDecoder().decode(registryBytes)),
      textFile('release/public-release-manifest.json', new TextDecoder().decode(manifestBytes)),
    ],
    sha256,
  })
  assert.equal(digestMismatch.contractValid, false)
  assert.ok(digestMismatch.blockers.some((blocker) => blocker.code === 'marker-registry-digest-mismatch'))

  const validManifest = baseManifest(registryBytes)
  const validManifestBytes = jsonBytes(validManifest)
  const byteMismatch = evaluatePublicReleaseCandidate({
    manifestBytes: validManifestBytes,
    registryBytes,
    files: [
      textFile('LICENSE', 'Apache License\n'),
      textFile('README.md', 'Agentic Feature Kit\n'),
      textFile('release/internal-marker-classification.json', '{}\n'),
      textFile('release/public-release-manifest.json', '{}\n'),
    ],
    sha256,
  })
  assert.equal(byteMismatch.contractValid, false)
  assert.ok(byteMismatch.blockers.some((blocker) => blocker.code === 'contract-file-byte-mismatch'))
})

console.log(`\npublic-release-contract.test: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
}

void main()
