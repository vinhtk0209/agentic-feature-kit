export const PUBLIC_RELEASE_MANIFEST_PATH = 'release/public-release-manifest.json' as const
export const INTERNAL_MARKER_REGISTRY_PATH = 'release/internal-marker-classification.json' as const
export const MARKER_FINGERPRINT_DOMAIN = 'agentic-feature-kit/public-marker/v1' as const

const SHA256 = /^[a-f0-9]{64}$/
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const MAX_PATH_BYTES = 1_024
const MANIFEST_REASON_CODES = new Set([
  'generated-or-local',
  'pending-classification',
  'private-evidence',
  'public-source',
  'required-release-control',
  'workspace-only',
])
const MARKER_REASON_CODES = new Set([
  'historical-private-evidence',
  'internal-service-fixture',
  'live-service-default',
  'local-user-context',
  'reviewed-public-reference',
  'workspace-identity',
])
const DISPOSITIONS = new Set<MarkerDisposition>([
  'genericize',
  'move-to-private-archive',
  'replace-with-synthetic-fixture',
  'reviewed-retained',
])
const DETECTOR_KINDS = new Set<MarkerDetectorKind>([
  'token',
  'hostname',
  'supabase-project-ref',
  'windows-user-path',
])

export type Sha256Port = (value: Uint8Array) => string
export type MarkerDisposition =
  | 'genericize'
  | 'move-to-private-archive'
  | 'replace-with-synthetic-fixture'
  | 'reviewed-retained'
export type MarkerDetectorKind = 'token' | 'hostname' | 'supabase-project-ref' | 'windows-user-path'

export interface PublicReleaseManifestEntry {
  path: string
  decision: 'include' | 'exclude'
  contentKind: 'text' | 'binary'
  reasonCode:
    | 'generated-or-local'
    | 'pending-classification'
    | 'private-evidence'
    | 'public-source'
    | 'required-release-control'
    | 'workspace-only'
  sha256?: string
}

export interface PublicReleaseManifest {
  schemaVersion: '1.0.0'
  artifactId: 'agentic-feature-kit-public-release'
  product: {
    displayName: 'Agentic Feature Kit'
    slug: 'agentic-feature-kit'
    license: 'Apache-2.0'
    packageVisibility: 'private'
    providers: ['codex', 'claude', 'copilot']
  }
  candidateSource: {
    kind: 'git-index'
    unknownPathPolicy: 'deny'
    pathNormalization: 'repo-relative-posix-nfc'
  }
  limits: {
    maxPaths: 10_000
    maxTextFileBytes: 4_194_304
    maxBinaryFileBytes: 8_388_608
    maxCandidateBytes: 268_435_456
  }
  markerRegistry: {
    path: typeof INTERNAL_MARKER_REGISTRY_PATH
    sha256: string
  }
  requiredPaths: string[]
  entries: PublicReleaseManifestEntry[]
  publicationBoundary: {
    packagePrivate: true
    externalWrites: 'forbidden'
  }
}

export interface MarkerDetector {
  id: string
  kind: MarkerDetectorKind
}

export interface MarkerOccurrence {
  path: string
  expectedCount: number
  disposition: MarkerDisposition
  reasonCode:
    | 'historical-private-evidence'
    | 'internal-service-fixture'
    | 'live-service-default'
    | 'local-user-context'
    | 'reviewed-public-reference'
    | 'workspace-identity'
  publicSafeRationale?: string
}

export interface InternalMarker {
  id: string
  detectorId: string
  fingerprintSha256: string
  expectedTotal: number
  occurrences: MarkerOccurrence[]
}

export interface InternalMarkerRegistry {
  schemaVersion: '1.0.0'
  artifactId: 'agentic-feature-kit-internal-marker-classification'
  fingerprint: {
    algorithm: 'sha256'
    domain: typeof MARKER_FINGERPRINT_DOMAIN
  }
  detectors: MarkerDetector[]
  markers: InternalMarker[]
}

export interface CandidateFile {
  path: string
  gitMode: string
  bytes: Uint8Array
  reparsePoint: boolean
}

export interface PublicReleaseBlocker {
  code: string
  path?: string
  markerId?: string
  count?: number
}

export interface PublicReleaseEvaluation {
  contractValid: boolean
  candidateStatus: 'blocked' | 'eligible-for-later-gates'
  includedPaths: number
  excludedPaths: number
  classifiedOccurrences: number
  blockers: PublicReleaseBlocker[]
}

export interface EvaluatePublicReleaseCandidateInput {
  manifestBytes: Uint8Array
  registryBytes: Uint8Array
  files: CandidateFile[]
  sha256: Sha256Port
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isSafeRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || descriptor.get || descriptor.set) return false
  }
  return true
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isSafeRecord(value)) throw new Error(`${label} must be a plain data object`)
  return value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const sortedExpected = [...expected].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} fields must be exactly ${sortedExpected.join(', ')}`)
  }
}

function exactString(value: unknown, expected: string, label: string): string {
  if (value !== expected) throw new Error(`${label} must be ${expected}`)
  return expected
}

function safeInteger(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`)
  }
  return value as number
}

function exactArray(value: unknown, expected: readonly string[], label: string): string[] {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new Error(`${label} must contain exactly ${expected.join(', ')}`)
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) throw new Error(`${label} must contain exactly ${expected.join(', ')}`)
  }
  return [...expected]
}

function assertSortedUnique(values: readonly string[], label: string): void {
  const sorted = [...values].sort(compareText)
  if (new Set(values).size !== values.length || JSON.stringify(sorted) !== JSON.stringify(values)) {
    throw new Error(`${label} must be sorted and unique`)
  }
}

function assertNoCaseCollisions(paths: readonly string[], label: string): void {
  const seen = new Map<string, string>()
  for (const path of paths) {
    const key = path.toLowerCase()
    const previous = seen.get(key)
    if (previous && previous !== path) throw new Error(`${label} contains case-colliding paths`)
    seen.set(key, path)
  }
}

export function normalizeRepositoryPath(value: unknown, label = 'path'): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty path`)
  if (new TextEncoder().encode(value).length > MAX_PATH_BYTES) throw new Error(`${label} exceeds the path limit`)
  if (value.includes('\0')) throw new Error(`${label} contains NUL`)
  if (value.includes('\\')) throw new Error(`${label} contains a backslash alias`)
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw new Error(`${label} must not be absolute`)
  if (value.normalize('NFC') !== value) throw new Error(`${label} must use NFC normalization`)
  const segments = value.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an invalid path segment`)
  }
  for (const segment of segments) {
    if (segment.endsWith('.') || segment.endsWith(' ')) throw new Error(`${label} contains a Windows trailing-dot/space alias`)
    if (segment.includes(':')) throw new Error(`${label} contains a Windows alternate-data-stream alias`)
    const deviceBase = segment.split('.')[0]
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(deviceBase)) {
      throw new Error(`${label} contains a Windows reserved device name`)
    }
  }
  if (/[\u0000-\u001F\u007F]/u.test(value)) throw new Error(`${label} contains a control character`)
  return value
}

function parseManifestEntry(value: unknown, index: number): PublicReleaseManifestEntry {
  const record = asRecord(value, `entries[${index}]`)
  const decision = record.decision
  const contentKind = record.contentKind
  if (decision !== 'include' && decision !== 'exclude') throw new Error(`entries[${index}].decision is unsupported`)
  if (contentKind !== 'text' && contentKind !== 'binary') throw new Error(`entries[${index}].contentKind is unsupported`)
  const requiresDigest = decision === 'include' && contentKind === 'binary'
  exactKeys(
    record,
    requiresDigest ? ['path', 'decision', 'contentKind', 'reasonCode', 'sha256'] : ['path', 'decision', 'contentKind', 'reasonCode'],
    `entries[${index}]`,
  )
  const path = normalizeRepositoryPath(record.path, `entries[${index}].path`)
  if (typeof record.reasonCode !== 'string' || !MANIFEST_REASON_CODES.has(record.reasonCode)) {
    throw new Error(`entries[${index}].reasonCode is unsupported`)
  }
  if (requiresDigest && (typeof record.sha256 !== 'string' || !SHA256.test(record.sha256))) {
    throw new Error(`entries[${index}].sha256 must be a lowercase SHA-256 digest`)
  }
  return {
    path,
    decision,
    contentKind,
    reasonCode: record.reasonCode as PublicReleaseManifestEntry['reasonCode'],
    ...(requiresDigest ? { sha256: record.sha256 as string } : {}),
  }
}

export function parsePublicReleaseManifest(value: unknown): PublicReleaseManifest {
  const root = asRecord(value, 'public release manifest')
  exactKeys(root, [
    'schemaVersion',
    'artifactId',
    'product',
    'candidateSource',
    'limits',
    'markerRegistry',
    'requiredPaths',
    'entries',
    'publicationBoundary',
  ], 'public release manifest')
  exactString(root.schemaVersion, '1.0.0', 'public release manifest schemaVersion')
  exactString(root.artifactId, 'agentic-feature-kit-public-release', 'public release manifest artifactId')

  const product = asRecord(root.product, 'product')
  exactKeys(product, ['displayName', 'slug', 'license', 'packageVisibility', 'providers'], 'product')
  exactString(product.displayName, 'Agentic Feature Kit', 'product.displayName')
  exactString(product.slug, 'agentic-feature-kit', 'product.slug')
  exactString(product.license, 'Apache-2.0', 'product.license')
  exactString(product.packageVisibility, 'private', 'product.packageVisibility')
  exactArray(product.providers, ['codex', 'claude', 'copilot'], 'product.providers')

  const source = asRecord(root.candidateSource, 'candidateSource')
  exactKeys(source, ['kind', 'unknownPathPolicy', 'pathNormalization'], 'candidateSource')
  exactString(source.kind, 'git-index', 'candidateSource.kind')
  exactString(source.unknownPathPolicy, 'deny', 'candidateSource.unknownPathPolicy')
  exactString(source.pathNormalization, 'repo-relative-posix-nfc', 'candidateSource.pathNormalization')

  const limits = asRecord(root.limits, 'limits')
  exactKeys(limits, ['maxPaths', 'maxTextFileBytes', 'maxBinaryFileBytes', 'maxCandidateBytes'], 'limits')
  if (
    safeInteger(limits.maxPaths, 1, 'limits.maxPaths') !== 10_000
    || safeInteger(limits.maxTextFileBytes, 1, 'limits.maxTextFileBytes') !== 4_194_304
    || safeInteger(limits.maxBinaryFileBytes, 1, 'limits.maxBinaryFileBytes') !== 8_388_608
    || safeInteger(limits.maxCandidateBytes, 1, 'limits.maxCandidateBytes') !== 268_435_456
  ) throw new Error('limits must match the locked R1 bounds')

  const markerRegistry = asRecord(root.markerRegistry, 'markerRegistry')
  exactKeys(markerRegistry, ['path', 'sha256'], 'markerRegistry')
  exactString(markerRegistry.path, INTERNAL_MARKER_REGISTRY_PATH, 'markerRegistry.path')
  if (typeof markerRegistry.sha256 !== 'string' || !SHA256.test(markerRegistry.sha256)) {
    throw new Error('markerRegistry.sha256 must be a lowercase SHA-256 digest')
  }

  if (!Array.isArray(root.requiredPaths) || root.requiredPaths.length === 0) {
    throw new Error('requiredPaths must be a non-empty array')
  }
  const requiredPaths = root.requiredPaths.map((path, index) => normalizeRepositoryPath(path, `requiredPaths[${index}]`))
  assertSortedUnique(requiredPaths, 'requiredPaths')
  assertNoCaseCollisions(requiredPaths, 'requiredPaths')

  if (!Array.isArray(root.entries) || root.entries.length === 0) throw new Error('entries must be a non-empty array')
  const entries = root.entries.map(parseManifestEntry)
  const entryPaths = entries.map((entry) => entry.path)
  assertSortedUnique(entryPaths, 'manifest entry paths')
  assertNoCaseCollisions(entryPaths, 'manifest entry paths')
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]))
  for (const path of requiredPaths) {
    if (entryByPath.get(path)?.decision !== 'include') throw new Error(`required path must be included: ${path}`)
  }
  for (const required of [PUBLIC_RELEASE_MANIFEST_PATH, INTERNAL_MARKER_REGISTRY_PATH]) {
    if (entryByPath.get(required)?.decision !== 'include') throw new Error(`release contract must include itself: ${required}`)
  }

  const publication = asRecord(root.publicationBoundary, 'publicationBoundary')
  exactKeys(publication, ['packagePrivate', 'externalWrites'], 'publicationBoundary')
  if (publication.packagePrivate !== true || publication.externalWrites !== 'forbidden') {
    throw new Error('publicationBoundary must preserve private/no-write controls')
  }

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
    markerRegistry: { path: INTERNAL_MARKER_REGISTRY_PATH, sha256: markerRegistry.sha256 },
    requiredPaths,
    entries,
    publicationBoundary: { packagePrivate: true, externalWrites: 'forbidden' },
  }
}

function parseDetector(value: unknown, index: number): MarkerDetector {
  const record = asRecord(value, `detectors[${index}]`)
  exactKeys(record, ['id', 'kind'], `detectors[${index}]`)
  if (typeof record.id !== 'string' || !ID.test(record.id)) throw new Error(`detectors[${index}].id is invalid`)
  if (typeof record.kind !== 'string' || !DETECTOR_KINDS.has(record.kind as MarkerDetectorKind)) {
    throw new Error(`detectors[${index}].kind is unsupported`)
  }
  return { id: record.id, kind: record.kind as MarkerDetectorKind }
}

function parseOccurrence(value: unknown, markerIndex: number, index: number): MarkerOccurrence {
  const label = `markers[${markerIndex}].occurrences[${index}]`
  const record = asRecord(value, label)
  if (record.disposition === 'reviewed-retained') {
    exactKeys(record, ['path', 'expectedCount', 'disposition', 'reasonCode', 'publicSafeRationale'], label)
  } else {
    exactKeys(record, ['path', 'expectedCount', 'disposition', 'reasonCode'], label)
  }
  const path = normalizeRepositoryPath(record.path, `${label}.path`)
  const expectedCount = safeInteger(record.expectedCount, 1, `${label}.expectedCount`)
  if (typeof record.disposition !== 'string' || !DISPOSITIONS.has(record.disposition as MarkerDisposition)) {
    throw new Error(`${label}.disposition is unsupported`)
  }
  if (typeof record.reasonCode !== 'string' || !MARKER_REASON_CODES.has(record.reasonCode)) {
    throw new Error(`${label}.reasonCode is unsupported`)
  }
  if (record.disposition === 'reviewed-retained') {
    if (
      typeof record.publicSafeRationale !== 'string'
      || record.publicSafeRationale.trim().length === 0
      || record.publicSafeRationale.length > 500
      || /[\u0000-\u001F\u007F]/u.test(record.publicSafeRationale)
    ) throw new Error(`${label}.publicSafeRationale must be non-empty public-safe text`)
  }
  return {
    path,
    expectedCount,
    disposition: record.disposition as MarkerDisposition,
    reasonCode: record.reasonCode as MarkerOccurrence['reasonCode'],
    ...(record.disposition === 'reviewed-retained'
      ? { publicSafeRationale: record.publicSafeRationale as string }
      : {}),
  }
}

export function parseInternalMarkerRegistry(value: unknown): InternalMarkerRegistry {
  const root = asRecord(value, 'internal marker registry')
  exactKeys(root, ['schemaVersion', 'artifactId', 'fingerprint', 'detectors', 'markers'], 'internal marker registry')
  exactString(root.schemaVersion, '1.0.0', 'internal marker registry schemaVersion')
  exactString(root.artifactId, 'agentic-feature-kit-internal-marker-classification', 'internal marker registry artifactId')

  const fingerprint = asRecord(root.fingerprint, 'fingerprint')
  exactKeys(fingerprint, ['algorithm', 'domain'], 'fingerprint')
  exactString(fingerprint.algorithm, 'sha256', 'fingerprint.algorithm')
  exactString(fingerprint.domain, MARKER_FINGERPRINT_DOMAIN, 'fingerprint.domain')

  if (!Array.isArray(root.detectors) || root.detectors.length === 0) throw new Error('detectors must be non-empty')
  const detectors = root.detectors.map(parseDetector)
  const detectorIds = detectors.map((detector) => detector.id)
  assertSortedUnique(detectorIds, 'detector IDs')
  const detectorById = new Map(detectors.map((detector) => [detector.id, detector]))

  if (!Array.isArray(root.markers)) throw new Error('markers must be an array')
  const markerIds: string[] = []
  const fingerprintMappings = new Set<string>()
  const markers = root.markers.map((value, markerIndex): InternalMarker => {
    const label = `markers[${markerIndex}]`
    const record = asRecord(value, label)
    exactKeys(record, ['id', 'detectorId', 'fingerprintSha256', 'expectedTotal', 'occurrences'], label)
    if (typeof record.id !== 'string' || !ID.test(record.id)) throw new Error(`${label}.id is invalid`)
    if (typeof record.detectorId !== 'string' || !detectorById.has(record.detectorId)) {
      throw new Error(`${label}.detectorId is unknown`)
    }
    if (typeof record.fingerprintSha256 !== 'string' || !SHA256.test(record.fingerprintSha256)) {
      throw new Error(`${label}.fingerprintSha256 is invalid`)
    }
    const mapping = `${record.detectorId}:${record.fingerprintSha256}`
    if (fingerprintMappings.has(mapping)) throw new Error('marker fingerprint mapping must be unique')
    fingerprintMappings.add(mapping)
    const expectedTotal = safeInteger(record.expectedTotal, 0, `${label}.expectedTotal`)
    if (!Array.isArray(record.occurrences)) throw new Error(`${label}.occurrences must be an array`)
    const occurrences = record.occurrences.map((occurrence, index) => parseOccurrence(occurrence, markerIndex, index))
    const occurrencePaths = occurrences.map((occurrence) => occurrence.path)
    assertSortedUnique(occurrencePaths, `${label} occurrence paths`)
    assertNoCaseCollisions(occurrencePaths, `${label} occurrence paths`)
    const total = occurrences.reduce((sum, occurrence) => sum + occurrence.expectedCount, 0)
    if (total !== expectedTotal) throw new Error(`${label}.expectedTotal must equal occurrence counts`)
    markerIds.push(record.id)
    return {
      id: record.id,
      detectorId: record.detectorId,
      fingerprintSha256: record.fingerprintSha256,
      expectedTotal,
      occurrences,
    }
  })
  assertSortedUnique(markerIds, 'marker IDs')

  return {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-internal-marker-classification',
    fingerprint: { algorithm: 'sha256', domain: MARKER_FINGERPRINT_DOMAIN },
    detectors,
    markers,
  }
}

export function fingerprintMarker(value: string, sha256: Sha256Port): string {
  return sha256(new TextEncoder().encode(`${MARKER_FINGERPRINT_DOMAIN}\0${value}`))
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  let text: string
  try {
    text = decodeUtf8(bytes)
  } catch {
    throw new Error(`${label} is not valid UTF-8`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false
  return true
}

function addBlocker(blockers: PublicReleaseBlocker[], blocker: PublicReleaseBlocker): void {
  blockers.push(blocker)
}

function sortBlockers(blockers: PublicReleaseBlocker[]): PublicReleaseBlocker[] {
  return blockers.sort((left, right) => {
    const leftKey = `${left.code}\0${left.path ?? ''}\0${left.markerId ?? ''}\0${left.count ?? -1}`
    const rightKey = `${right.code}\0${right.path ?? ''}\0${right.markerId ?? ''}\0${right.count ?? -1}`
    return compareText(leftKey, rightKey)
  })
}

interface ExtractedCandidate {
  raw: string
  count: number
  reportUnknown: boolean
}

function addExtracted(
  candidates: Map<string, ExtractedCandidate>,
  raw: string,
  count = 1,
  reportUnknown = false,
): void {
  const existing = candidates.get(raw)
  if (existing) {
    existing.count += count
    existing.reportUnknown ||= reportUnknown
  } else {
    candidates.set(raw, { raw, count, reportUnknown })
  }
}

function regexCandidates(text: string, expression: RegExp, group = 0, normalize?: (value: string) => string): Map<string, ExtractedCandidate> {
  const candidates = new Map<string, ExtractedCandidate>()
  for (const match of text.matchAll(expression)) {
    const captured = match[group]
    if (typeof captured === 'string' && captured.length > 0) addExtracted(candidates, normalize ? normalize(captured) : captured)
  }
  return candidates
}

function extractCandidates(kind: MarkerDetectorKind, text: string): Map<string, ExtractedCandidate> {
  if (kind === 'token') return regexCandidates(text, /[A-Za-z0-9][A-Za-z0-9._-]{1,127}/g)
  if (kind === 'hostname') {
    return regexCandidates(
      text,
      /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}\b/g,
      0,
      (value) => value.toLowerCase(),
    )
  }
  if (kind === 'windows-user-path') {
    const candidates = regexCandidates(text, /\b[A-Za-z]:\\Users\\[^"'`\r\n<>|]+/g)
    for (const candidate of candidates.values()) candidate.reportUnknown = true
    return candidates
  }

  const candidates = regexCandidates(text, /\b[a-z0-9]{20}\b/g)
  for (const match of text.matchAll(/https?:\/\/([a-z0-9]{20})\.supabase\.co\b/gi)) {
    addExtracted(candidates, match[1].toLowerCase(), 0, true)
  }
  return candidates
}

const NON_CONTRACT_BLOCKERS = new Set(['unresolved-marker-disposition'])

export function evaluatePublicReleaseCandidate(input: EvaluatePublicReleaseCandidateInput): PublicReleaseEvaluation {
  const blockers: PublicReleaseBlocker[] = []
  let manifest: PublicReleaseManifest
  let registry: InternalMarkerRegistry
  try {
    manifest = parsePublicReleaseManifest(parseJsonBytes(input.manifestBytes, 'public release manifest'))
  } catch {
    return {
      contractValid: false,
      candidateStatus: 'blocked',
      includedPaths: 0,
      excludedPaths: 0,
      classifiedOccurrences: 0,
      blockers: [{ code: 'manifest-invalid' }],
    }
  }
  try {
    registry = parseInternalMarkerRegistry(parseJsonBytes(input.registryBytes, 'internal marker registry'))
  } catch {
    return {
      contractValid: false,
      candidateStatus: 'blocked',
      includedPaths: manifest.entries.filter((entry) => entry.decision === 'include').length,
      excludedPaths: manifest.entries.filter((entry) => entry.decision === 'exclude').length,
      classifiedOccurrences: 0,
      blockers: [{ code: 'registry-invalid' }],
    }
  }

  if (input.sha256(input.registryBytes) !== manifest.markerRegistry.sha256) {
    addBlocker(blockers, { code: 'marker-registry-digest-mismatch', path: INTERNAL_MARKER_REGISTRY_PATH })
  }
  if (input.files.length > manifest.limits.maxPaths) addBlocker(blockers, { code: 'path-count-limit', count: input.files.length })

  const filesByPath = new Map<string, CandidateFile>()
  const casePaths = new Map<string, string>()
  let candidateBytes = 0
  for (const file of input.files) {
    let normalized: string
    try {
      normalized = normalizeRepositoryPath(file.path, 'candidate path')
    } catch {
      addBlocker(blockers, { code: 'invalid-candidate-path' })
      continue
    }
    if (!(file.bytes instanceof Uint8Array)) {
      addBlocker(blockers, { code: 'invalid-candidate-bytes', path: normalized })
      continue
    }
    if (filesByPath.has(normalized)) addBlocker(blockers, { code: 'duplicate-candidate-path', path: normalized })
    const caseKey = normalized.toLowerCase()
    const previous = casePaths.get(caseKey)
    if (previous && previous !== normalized) addBlocker(blockers, { code: 'case-colliding-path', path: normalized })
    casePaths.set(caseKey, normalized)
    filesByPath.set(normalized, { ...file, path: normalized })
    candidateBytes += file.bytes.byteLength
    if (file.gitMode !== '100644' && file.gitMode !== '100755') {
      addBlocker(blockers, { code: file.gitMode === '120000' ? 'symlink-entry' : 'unsafe-git-mode', path: normalized })
    }
    if (file.reparsePoint) addBlocker(blockers, { code: 'reparse-point', path: normalized })
  }
  if (candidateBytes > manifest.limits.maxCandidateBytes) addBlocker(blockers, { code: 'candidate-byte-limit', count: candidateBytes })

  const manifestByPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  for (const path of filesByPath.keys()) {
    if (!manifestByPath.has(path)) addBlocker(blockers, { code: 'unknown-tracked-path', path })
  }
  for (const entry of manifest.entries) {
    if (!filesByPath.has(entry.path)) addBlocker(blockers, { code: 'missing-tracked-path', path: entry.path })
  }

  const manifestFile = filesByPath.get(PUBLIC_RELEASE_MANIFEST_PATH)
  const registryFile = filesByPath.get(INTERNAL_MARKER_REGISTRY_PATH)
  if (manifestFile && !equalBytes(manifestFile.bytes, input.manifestBytes)) {
    addBlocker(blockers, { code: 'contract-file-byte-mismatch', path: PUBLIC_RELEASE_MANIFEST_PATH })
  }
  if (registryFile && !equalBytes(registryFile.bytes, input.registryBytes)) {
    addBlocker(blockers, { code: 'contract-file-byte-mismatch', path: INTERNAL_MARKER_REGISTRY_PATH })
  }

  const textByPath = new Map<string, string>()
  for (const [path, file] of filesByPath) {
    const entry = manifestByPath.get(path)
    if (!entry) continue
    const limit = entry.contentKind === 'text' ? manifest.limits.maxTextFileBytes : manifest.limits.maxBinaryFileBytes
    if (file.bytes.byteLength > limit) {
      addBlocker(blockers, { code: 'file-size-limit', path, count: file.bytes.byteLength })
      continue
    }
    if (entry.contentKind === 'text') {
      try {
        textByPath.set(path, decodeUtf8(file.bytes))
      } catch {
        addBlocker(blockers, { code: 'invalid-utf8', path })
      }
    } else if (entry.decision === 'include' && input.sha256(file.bytes) !== entry.sha256) {
      addBlocker(blockers, { code: 'binary-digest-mismatch', path })
    }
  }

  const detectorById = new Map(registry.detectors.map((detector) => [detector.id, detector]))
  const markerByLookup = new Map(registry.markers.map((marker) => [
    `${marker.detectorId}:${marker.fingerprintSha256}`,
    marker,
  ]))
  const observed = new Map<string, Map<string, number>>()
  const observedRaw = new Map<string, Set<string>>()
  const unknownCounts = new Map<string, number>()

  for (const [path, text] of textByPath) {
    for (const detector of registry.detectors) {
      for (const candidate of extractCandidates(detector.kind, text).values()) {
        const digest = fingerprintMarker(candidate.raw, input.sha256)
        const marker = markerByLookup.get(`${detector.id}:${digest}`)
        if (marker) {
          const byPath = observed.get(marker.id) ?? new Map<string, number>()
          byPath.set(path, (byPath.get(path) ?? 0) + candidate.count)
          observed.set(marker.id, byPath)
          const rawValues = observedRaw.get(marker.id) ?? new Set<string>()
          rawValues.add(candidate.raw)
          observedRaw.set(marker.id, rawValues)
        } else if (candidate.reportUnknown) {
          const key = `${detector.id}\0${path}`
          unknownCounts.set(key, (unknownCounts.get(key) ?? 0) + Math.max(candidate.count, 1))
        }
      }
    }
  }

  for (const [key, count] of unknownCounts) {
    const [, path] = key.split('\0')
    addBlocker(blockers, { code: 'unclassified-marker', path, count })
  }

  let classifiedOccurrences = 0
  let registryText = ''
  try {
    registryText = decodeUtf8(input.registryBytes)
  } catch {
    addBlocker(blockers, { code: 'invalid-utf8', path: INTERNAL_MARKER_REGISTRY_PATH })
  }
  for (const marker of registry.markers) {
    const detector = detectorById.get(marker.detectorId)
    if (!detector) continue
    const byPath = observed.get(marker.id) ?? new Map<string, number>()
    const expectedPaths = new Set(marker.occurrences.map((occurrence) => occurrence.path))
    const observedTotal = [...byPath.values()].reduce((sum, count) => sum + count, 0)
    if (observedTotal !== marker.expectedTotal) {
      addBlocker(blockers, { code: 'marker-count-mismatch', markerId: marker.id, count: observedTotal })
    }
    for (const occurrence of marker.occurrences) {
      const actual = byPath.get(occurrence.path) ?? 0
      if (actual !== occurrence.expectedCount) {
        addBlocker(blockers, { code: 'marker-count-mismatch', path: occurrence.path, markerId: marker.id, count: actual })
      } else {
        classifiedOccurrences += actual
      }
      if (occurrence.disposition !== 'reviewed-retained') {
        addBlocker(blockers, {
          code: 'unresolved-marker-disposition',
          path: occurrence.path,
          markerId: marker.id,
          count: occurrence.expectedCount,
        })
      }
    }
    for (const [path, count] of byPath) {
      if (!expectedPaths.has(path)) addBlocker(blockers, { code: 'marker-path-mismatch', path, markerId: marker.id, count })
    }
    for (const raw of observedRaw.get(marker.id) ?? []) {
      if (registryText.includes(raw)) {
        addBlocker(blockers, { code: 'registry-plaintext-marker', path: INTERNAL_MARKER_REGISTRY_PATH, markerId: marker.id })
      }
    }
  }

  const uniqueBlockers = new Map<string, PublicReleaseBlocker>()
  for (const blocker of blockers) {
    const key = `${blocker.code}\0${blocker.path ?? ''}\0${blocker.markerId ?? ''}\0${blocker.count ?? -1}`
    uniqueBlockers.set(key, blocker)
  }
  const sorted = sortBlockers([...uniqueBlockers.values()])
  const contractValid = sorted.every((blocker) => NON_CONTRACT_BLOCKERS.has(blocker.code))
  return {
    contractValid,
    candidateStatus: sorted.length === 0 ? 'eligible-for-later-gates' : 'blocked',
    includedPaths: manifest.entries.filter((entry) => entry.decision === 'include').length,
    excludedPaths: manifest.entries.filter((entry) => entry.decision === 'exclude').length,
    classifiedOccurrences,
    blockers: sorted,
  }
}
