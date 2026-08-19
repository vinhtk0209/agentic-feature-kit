import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  ArchiveContractError,
  DEFAULT_STRICT_ZIP_LIMITS,
  parseStrictZip,
  validateDistributionArchive,
  validateReleaseOutputSet,
  type StrictZipEntry,
} from './release-archive-contract'
import {
  canonicalJson,
  evaluateSbomPair,
  type SbomBuildInput,
  type SbomPair,
} from './release-sbom-contract'
import {
  captureSourceSbomInput,
  loadSchemaRegistry,
  resolveEmbeddedComponents,
  validateSbomPairAgainstSchemas,
} from './release-sbom-node'
import { scanTextSecrets, type SecretScanResult } from './public-source-readiness-contract'
import { runPublicSourceReadiness } from './public-source-readiness-node'

export interface FinalReleaseAdmissionOptions {
  repositoryRoot: string
  releaseRoot: string
  sourceDateEpoch: number
  providerIds: string[]
  bundleVersion: string
  sharedCoreVersion: string
  sourceVersion: string
}

export interface FinalReleaseAdmissionReport {
  schemaVersion: '1.0.0'
  status: 'admitted'
  providers: string[]
  archives: number
  archiveEntries: number
  sidecars: number
  checksums: number
  textFiles: number
  secretDetectorFamilies: number
  elapsedMilliseconds: number
}

export interface PromoteReleaseOptions extends FinalReleaseAdmissionOptions {
  outputRoot: string
  stageRoot: string
}

const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_TEXT_BYTES = 64 * 1024 * 1024
const SHA256 = /^[0-9a-f]{64}$/

export class ReleaseArchiveAdmissionError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`release-archive-admission: ${code}`)
    this.name = 'ReleaseArchiveAdmissionError'
    this.code = code
  }
}

function fail(code: string): never {
  throw new ReleaseArchiveAdmissionError(code)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertWithin(root: string, candidate: string, code: string, allowRoot = false): void {
  if (!isWithin(root, candidate) || (!allowRoot && path.resolve(root) === path.resolve(candidate))) fail(code)
}

function assertOrdinaryDirectory(directory: string, containmentRoot: string, code: string): string {
  assertWithin(containmentRoot, directory, code, true)
  const stat = fs.lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code)
  const realRoot = fs.realpathSync.native(containmentRoot)
  const realDirectory = fs.realpathSync.native(directory)
  if (!isWithin(realRoot, realDirectory)) fail(code)
  return realDirectory
}

function readRegularFile(root: string, relativePath: string, maxBytes: number, code: string): Buffer {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('\\')
    || relativePath.startsWith('/')
    || /^[A-Za-z]:/.test(relativePath)
    || relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) fail(code)
  const file = path.join(root, ...relativePath.split('/'))
  assertWithin(root, file, code)
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) fail(code)
  const realRoot = fs.realpathSync.native(root)
  const realFile = fs.realpathSync.native(file)
  if (!isWithin(realRoot, realFile)) fail(code)
  const bytes = fs.readFileSync(file)
  if (bytes.length !== stat.size || bytes.length > maxBytes) fail(code)
  return bytes
}

function walkRegularFiles(root: string): string[] {
  assertOrdinaryDirectory(root, root, 'bundle-root')
  const realRoot = fs.realpathSync.native(root)
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort(compareText)) {
      const item = path.join(directory, name)
      assertWithin(root, item, 'bundle-path')
      const stat = fs.lstatSync(item)
      if (stat.isSymbolicLink()) fail('bundle-reparse')
      const realItem = fs.realpathSync.native(item)
      if (!isWithin(realRoot, realItem)) fail('bundle-realpath')
      if (stat.isDirectory()) visit(item)
      else if (stat.isFile()) files.push(path.relative(root, item).split(path.sep).join('/'))
      else fail('bundle-special-file')
    }
  }
  visit(root)
  return files.sort(compareText)
}

function listReleaseRoot(releaseRoot: string): { directories: string[]; files: string[] } {
  assertOrdinaryDirectory(releaseRoot, releaseRoot, 'release-root')
  const directories: string[] = []
  const files: string[] = []
  for (const name of fs.readdirSync(releaseRoot).sort(compareText)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name)) fail('release-top-level-name')
    const item = path.join(releaseRoot, name)
    const stat = fs.lstatSync(item)
    if (stat.isSymbolicLink()) fail('release-top-level-reparse')
    const realItem = fs.realpathSync.native(item)
    if (!isWithin(fs.realpathSync.native(releaseRoot), realItem)) fail('release-top-level-realpath')
    if (stat.isDirectory()) directories.push(name)
    else if (stat.isFile()) files.push(name)
    else fail('release-top-level-special')
  }
  return { directories, files }
}

function parseStrictJson(bytes: Buffer, code: string): unknown {
  if (bytes.length === 0 || bytes.length > MAX_JSON_BYTES || bytes.includes(0) || !bytes.toString('utf8').endsWith('\n')) fail(code)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (Buffer.byteLength(text, 'utf8') !== bytes.length || text.includes('\r') || text.charCodeAt(0) === 0xfeff) fail(code)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return fail(code)
  }
}

function readSbomPair(releaseRoot: string, prefix: string): { pair: SbomPair; files: Array<{ path: string; bytes: Buffer }> } {
  const spdxName = `${prefix}.spdx.json`
  const cycloneDxName = `${prefix}.cdx.json`
  const spdxBytes = readRegularFile(releaseRoot, spdxName, MAX_JSON_BYTES, 'spdx-sidecar')
  const cycloneDxBytes = readRegularFile(releaseRoot, cycloneDxName, MAX_JSON_BYTES, 'cyclonedx-sidecar')
  const spdxText = spdxBytes.toString('utf8')
  const cycloneDxText = cycloneDxBytes.toString('utf8')
  return {
    pair: {
      spdx: parseStrictJson(spdxBytes, 'spdx-json') as SbomPair['spdx'],
      cycloneDx: parseStrictJson(cycloneDxBytes, 'cyclonedx-json') as SbomPair['cycloneDx'],
      spdxText,
      cycloneDxText,
    },
    files: [
      { path: spdxName, bytes: spdxBytes },
      { path: cycloneDxName, bytes: cycloneDxBytes },
    ],
  }
}

function requireSbomPair(input: SbomBuildInput, pair: SbomPair, schemas: ReturnType<typeof loadSchemaRegistry>): void {
  if (validateSbomPairAgainstSchemas(pair, schemas).length !== 0) fail('sbom-schema')
  if (evaluateSbomPair(input, pair).length !== 0) fail('sbom-semantic')
}

function compareArchiveToExpandedBundle(provider: string, releaseRoot: string, entries: StrictZipEntry[]): void {
  const bundleRoot = path.join(releaseRoot, provider, 'agentic-feature-kit')
  assertWithin(releaseRoot, bundleRoot, 'expanded-bundle-root')
  const files = walkRegularFiles(bundleRoot)
  const archiveByPath = new Map(entries.map((entry) => [entry.name.slice('agentic-feature-kit/'.length), entry]))
  if (JSON.stringify(files) !== JSON.stringify([...archiveByPath.keys()].sort(compareText))) fail('expanded-entry-set')
  for (const file of files) {
    const bytes = readRegularFile(bundleRoot, file, DEFAULT_STRICT_ZIP_LIMITS.maxEntryUncompressedBytes, 'expanded-file')
    const archived = archiveByPath.get(file)
    if (!archived || bytes.length !== archived.content.length || !bytes.equals(Buffer.from(archived.content))) fail('expanded-entry-bytes')
  }
}

function requireLicensePayloads(repositoryRoot: string, entries: StrictZipEntry[]): void {
  const byName = new Map(entries.map((entry) => [entry.name, entry.content]))
  const authorities = [
    ['agentic-feature-kit/LICENSE', readRegularFile(repositoryRoot, 'LICENSE', MAX_TEXT_BYTES, 'license-authority')],
    ['agentic-feature-kit/THIRD_PARTY_NOTICES.md', readRegularFile(repositoryRoot, 'THIRD_PARTY_NOTICES.md', MAX_TEXT_BYTES, 'notices-authority')],
    ['agentic-feature-kit/licenses/typescript-LICENSE.txt', readRegularFile(repositoryRoot, 'node_modules/typescript/LICENSE.txt', MAX_TEXT_BYTES, 'typescript-license-authority')],
  ] as const
  for (const [name, expected] of authorities) {
    const actual = byName.get(name)
    if (!actual || !expected.equals(Buffer.from(actual))) fail('license-payload')
  }
}

export function scanArchiveTextEntries(entries: Array<{ path: string; bytes: Uint8Array }>): SecretScanResult {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100_000) fail('archive-text-input')
  return scanTextSecrets({
    files: entries.map((entry) => ({ path: entry.path, contentKind: 'text' as const, bytes: entry.bytes })),
    sha256,
    maxFileBytes: MAX_TEXT_BYTES,
    maxFindingsPerFile: 20,
    maxFindings: 200,
  })
}

function validateFinalReleaseCandidateInternal(options: FinalReleaseAdmissionOptions): FinalReleaseAdmissionReport {
  const started = Date.now()
  const repositoryRoot = path.resolve(options.repositoryRoot)
  const releaseRoot = path.resolve(options.releaseRoot)
  assertOrdinaryDirectory(repositoryRoot, repositoryRoot, 'repository-root')
  if (!isWithin(repositoryRoot, releaseRoot) && path.resolve(repositoryRoot) === releaseRoot) fail('release-root-identity')
  if (!Number.isSafeInteger(options.sourceDateEpoch) || options.sourceDateEpoch < 0) fail('source-date')
  if (JSON.stringify(options.providerIds) !== JSON.stringify(['codex', 'claude', 'copilot'])) fail('provider-identities')
  if (options.bundleVersion !== '0.5.0' || options.sharedCoreVersion !== '1.3.0' || options.sourceVersion !== '3.25.0') fail('version-identities')

  const topLevel = listReleaseRoot(releaseRoot)
  const checksumBytes = readRegularFile(releaseRoot, 'SHA256SUMS', 1024 * 1024, 'checksum-file')
  const checksumText = new TextDecoder('utf-8', { fatal: true }).decode(checksumBytes)
  const outputSet = validateReleaseOutputSet({
    topLevelDirectories: topLevel.directories,
    topLevelFiles: topLevel.files,
    checksumText,
    providerIds: options.providerIds,
    bundleVersion: options.bundleVersion,
    sourceVersion: options.sourceVersion,
  })
  const firstDigests = new Map<string, string>()
  for (const row of outputSet.checksums) {
    const maxBytes = row.name.endsWith('.zip') ? DEFAULT_STRICT_ZIP_LIMITS.maxArchiveBytes : MAX_JSON_BYTES
    const digest = sha256(readRegularFile(releaseRoot, row.name, maxBytes, 'checksummed-file'))
    if (digest !== row.sha256) fail('checksum-digest')
    firstDigests.set(row.name, digest)
  }

  const schemas = loadSchemaRegistry(repositoryRoot)
  const sourceCapture = captureSourceSbomInput(repositoryRoot, options.sourceDateEpoch, 4, 617)
  const sourceSidecars = readSbomPair(releaseRoot, `agentic-feature-kit-source-${options.sourceVersion}`)
  requireSbomPair(sourceCapture.input, sourceSidecars.pair, schemas)
  const embeddedComponents = resolveEmbeddedComponents(repositoryRoot, ['node_modules/typescript/lib/typescript.js'])
  if (embeddedComponents.length !== 1 || embeddedComponents[0].name !== 'typescript' || embeddedComponents[0].version !== '4.9.5') fail('embedded-component')

  const textEntries: Array<{ path: string; bytes: Uint8Array }> = sourceSidecars.files
  let archiveEntries = 0
  for (const provider of options.providerIds) {
    const archiveName = `agentic-feature-kit-${provider}-${options.bundleVersion}.zip`
    const archiveBytes = readRegularFile(releaseRoot, archiveName, DEFAULT_STRICT_ZIP_LIMITS.maxArchiveBytes, 'provider-archive')
    const archive = parseStrictZip(archiveBytes, {
      archiveRoot: 'agentic-feature-kit',
      inflateRaw: (compressed, maxOutputBytes) => zlib.inflateRawSync(Buffer.from(compressed), { maxOutputLength: maxOutputBytes }),
    })
    const distribution = validateDistributionArchive({
      archive,
      archiveRoot: 'agentic-feature-kit',
      provider,
      bundleVersion: options.bundleVersion,
      sharedCoreVersion: options.sharedCoreVersion,
      sha256,
    })
    compareArchiveToExpandedBundle(provider, releaseRoot, archive.entries)
    requireLicensePayloads(repositoryRoot, archive.entries)
    const archiveSha256 = sha256(archiveBytes)
    const sbomInput: SbomBuildInput = {
      artifact: {
        kind: 'provider',
        targetId: provider,
        name: `agentic-feature-kit-${provider}`,
        version: options.bundleVersion,
        purl: `pkg:generic/agentic-feature-kit-${provider}-${options.bundleVersion}@${options.bundleVersion}`,
        identitySha256: sha256(new TextEncoder().encode(canonicalJson({ archiveSha256, manifestHash: distribution.manifestHash }))),
        manifestSha256: distribution.manifestHash,
        artifactSha256: archiveSha256,
        createdEpochSeconds: options.sourceDateEpoch,
      },
      components: embeddedComponents,
    }
    const providerSidecars = readSbomPair(releaseRoot, `agentic-feature-kit-${provider}-${options.bundleVersion}`)
    requireSbomPair(sbomInput, providerSidecars.pair, schemas)
    textEntries.push(...distribution.textEntries.map((entry) => ({ path: `${provider}.zip/${entry.path}`, bytes: entry.bytes })))
    textEntries.push(...providerSidecars.files)
    archiveEntries += distribution.archiveEntries
  }

  const secretResult = scanArchiveTextEntries(textEntries)
  if (secretResult.findings.length !== 0) fail('archive-secret')
  const sourceReadiness = runPublicSourceReadiness(repositoryRoot)
  if (sourceReadiness.status !== 'eligible-for-r5c2' || sourceReadiness.issues.length !== 0) fail('source-readiness')
  const recapturedSource = captureSourceSbomInput(repositoryRoot, options.sourceDateEpoch, 4, 617)
  if (canonicalJson(recapturedSource.input) !== canonicalJson(sourceCapture.input)) fail('source-input-drift')
  for (const row of outputSet.checksums) {
    const maxBytes = row.name.endsWith('.zip') ? DEFAULT_STRICT_ZIP_LIMITS.maxArchiveBytes : MAX_JSON_BYTES
    const digest = sha256(readRegularFile(releaseRoot, row.name, maxBytes, 'checksummed-recapture'))
    if (digest !== row.sha256 || digest !== firstDigests.get(row.name)) fail('admission-output-drift')
  }
  return {
    schemaVersion: '1.0.0',
    status: 'admitted',
    providers: [...options.providerIds],
    archives: options.providerIds.length,
    archiveEntries,
    sidecars: 8,
    checksums: outputSet.checksums.length,
    textFiles: secretResult.textFiles,
    secretDetectorFamilies: secretResult.detectorFamilies,
    elapsedMilliseconds: Math.max(0, Date.now() - started),
  }
}

export function validateFinalReleaseCandidate(options: FinalReleaseAdmissionOptions): FinalReleaseAdmissionReport {
  try {
    return validateFinalReleaseCandidateInternal(options)
  } catch (error) {
    if (error instanceof ReleaseArchiveAdmissionError || error instanceof ArchiveContractError) throw error
    throw new ReleaseArchiveAdmissionError('validation-failed')
  }
}

function assertDirectChild(outputRoot: string, target: string, code: string): void {
  const output = path.resolve(outputRoot)
  const candidate = path.resolve(target)
  if (path.dirname(candidate) !== output || !isWithin(output, candidate)) fail(code)
}

function removeTreeWithoutFollowingAliases(outputRoot: string, target: string): void {
  if (!fs.existsSync(target)) return
  assertDirectChild(outputRoot, target, 'cleanup-target')
  const remove = (item: string): void => {
    const stat = fs.lstatSync(item)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(item)
      return
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(item)) remove(path.join(item, name))
      fs.rmdirSync(item)
      return
    }
    fs.unlinkSync(item)
  }
  remove(target)
}

export function promoteAdmittedReleaseCandidate(options: PromoteReleaseOptions): FinalReleaseAdmissionReport {
  const outputRoot = path.resolve(options.outputRoot)
  const stageRoot = path.resolve(options.stageRoot)
  const releaseRoot = path.resolve(options.releaseRoot)
  assertOrdinaryDirectory(outputRoot, outputRoot, 'promotion-output-root')
  assertDirectChild(outputRoot, stageRoot, 'promotion-stage-root')
  assertDirectChild(outputRoot, releaseRoot, 'promotion-release-root')
  if (stageRoot === releaseRoot) fail('promotion-root-collision')

  let report: FinalReleaseAdmissionReport
  try {
    report = validateFinalReleaseCandidate({ ...options, releaseRoot: stageRoot })
  } catch (error) {
    try {
      removeTreeWithoutFollowingAliases(outputRoot, stageRoot)
    } catch {
      throw new ReleaseArchiveAdmissionError('stage-cleanup-failed')
    }
    if (error instanceof ReleaseArchiveAdmissionError || error instanceof ArchiveContractError) throw error
    throw new ReleaseArchiveAdmissionError('admission-failed')
  }

  const rollbackRoot = path.join(outputRoot, `.rollback-${path.basename(releaseRoot)}-${process.pid}`)
  assertDirectChild(outputRoot, rollbackRoot, 'promotion-rollback-root')
  if (fs.existsSync(rollbackRoot)) fail('promotion-rollback-collision')
  let retained = false
  try {
    if (fs.existsSync(releaseRoot)) {
      assertOrdinaryDirectory(releaseRoot, outputRoot, 'existing-release-root')
      fs.renameSync(releaseRoot, rollbackRoot)
      retained = true
    }
    fs.renameSync(stageRoot, releaseRoot)
  } catch {
    try {
      if (retained && !fs.existsSync(releaseRoot) && fs.existsSync(rollbackRoot)) fs.renameSync(rollbackRoot, releaseRoot)
      if (fs.existsSync(stageRoot)) removeTreeWithoutFollowingAliases(outputRoot, stageRoot)
    } catch {
      throw new ReleaseArchiveAdmissionError('promotion-restore-failed')
    }
    throw new ReleaseArchiveAdmissionError('promotion-rename-failed')
  }
  if (retained) removeTreeWithoutFollowingAliases(outputRoot, rollbackRoot)
  return report
}
