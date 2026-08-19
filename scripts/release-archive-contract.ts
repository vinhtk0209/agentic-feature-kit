export interface StrictZipLimits {
  maxArchiveBytes: number
  maxEntries: number
  maxNameBytes: number
  maxEntryCompressedBytes: number
  maxEntryUncompressedBytes: number
  maxTotalUncompressedBytes: number
  maxCompressionRatio: number
}

export interface StrictZipEntry {
  name: string
  method: 0 | 8
  crc32: number
  compressedBytes: number
  uncompressedBytes: number
  localHeaderOffset: number
  content: Uint8Array
}

export interface StrictZipArchive {
  archiveBytes: number
  totalUncompressedBytes: number
  entries: StrictZipEntry[]
}

export type InflateRawPort = (compressed: Uint8Array, maxOutputBytes: number) => Uint8Array
export type Sha256Port = (bytes: Uint8Array) => string

export interface ChecksumRow {
  name: string
  sha256: string
}

export interface ReleaseOutputSetInput {
  topLevelDirectories: string[]
  topLevelFiles: string[]
  checksumText: string
  providerIds: string[]
  bundleVersion: string
  sourceVersion: string
}

export interface ReleaseOutputSet {
  distributableFiles: string[]
  checksums: ChecksumRow[]
}

export interface DistributionArchiveInput {
  archive: StrictZipArchive
  archiveRoot: string
  provider: string
  bundleVersion: string
  sharedCoreVersion: string
  sha256: Sha256Port
}

export interface DistributionArchiveResult {
  archiveEntries: number
  manifestFiles: string[]
  manifestHash: string
  textEntries: Array<{ path: string; bytes: Uint8Array }>
}

interface ParsedCentralEntry {
  name: string
  nameBytes: Uint8Array
  flags: number
  method: 0 | 8
  dosTime: number
  dosDate: number
  crc32: number
  compressedBytes: number
  uncompressedBytes: number
  localHeaderOffset: number
}

interface DistributionManifestFile {
  path: string
  bytes: number
  sha256: string
}

interface DistributionManifest {
  schemaVersion: 1
  product: 'agentic-feature-kit'
  provider: string
  bundleVersion: string
  sharedCoreVersion: string
  nodeEngine: '>=20'
  capabilities: string[]
  files: DistributionManifestFile[]
  manifestHash: string
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const UTF8_FLAG = 0x0800
const ARCHIVE_ROOT = 'agentic-feature-kit'
const DISTRIBUTION_CAPABILITIES = [
  'project-intelligence',
  'stack-portability',
  'conditional-quality-gates',
  'workflow-orchestrator',
  'phase-model-routing',
] as const
const WINDOWS_DEVICE = /^(?:CON|PRN|AUX|NUL|CLOCK\$|COM[1-9]|LPT[1-9])$/i
const SHA256 = /^[0-9a-f]{64}$/

export const DEFAULT_STRICT_ZIP_LIMITS: Readonly<StrictZipLimits> = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 20_000,
  maxNameBytes: 512,
  maxEntryCompressedBytes: 128 * 1024 * 1024,
  maxEntryUncompressedBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 512 * 1024 * 1024,
  maxCompressionRatio: 200,
})

export class ArchiveContractError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`release-archive-contract: ${code}`)
    this.name = 'ArchiveContractError'
    this.code = code
  }
}

function fail(code: string): never {
  throw new ArchiveContractError(code)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...keys].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function checkedInteger(value: number, code: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) fail(code)
  return value
}

function checkedAdd(left: number, right: number, code: string): number {
  const result = left + right
  if (!Number.isSafeInteger(result) || result < left || result < right) fail(code)
  return result
}

function readUInt16(bytes: Uint8Array, offset: number, code: string): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > bytes.length) fail(code)
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUInt32(bytes: Uint8Array, offset: number, code: string): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > bytes.length) fail(code)
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}

function decodeUtf8(bytes: Uint8Array, code: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return fail(code)
  }
}

function validateRelativePath(value: string, code: string, requiredRoot?: string): string {
  if (
    value.length === 0
    || value.length > 4_096
    || value.includes('\\')
    || value.includes(':')
    || value.startsWith('/')
    || value.startsWith('//')
    || /^[A-Za-z]:/.test(value)
    || /[\u0000-\u001f\u007f]/.test(value)
    || value.normalize('NFC') !== value
    || value.endsWith('/')
  ) fail(code)
  const segments = value.split('/')
  if (
    segments.some((segment) => (
      segment.length === 0
      || segment === '.'
      || segment === '..'
      || segment.endsWith('.')
      || segment.endsWith(' ')
      || WINDOWS_DEVICE.test(segment.split('.')[0])
    ))
  ) fail(code)
  if (requiredRoot && (segments.length < 2 || segments[0] !== requiredRoot)) fail(code)
  return value
}

function normalizeLimits(overrides: Partial<StrictZipLimits> | undefined): StrictZipLimits {
  const limits = { ...DEFAULT_STRICT_ZIP_LIMITS, ...(overrides ?? {}) }
  checkedInteger(limits.maxArchiveBytes, 'invalid-archive-limit')
  checkedInteger(limits.maxEntries, 'invalid-entry-count-limit')
  checkedInteger(limits.maxNameBytes, 'invalid-name-limit')
  checkedInteger(limits.maxEntryCompressedBytes, 'invalid-compressed-limit')
  checkedInteger(limits.maxEntryUncompressedBytes, 'invalid-uncompressed-limit')
  checkedInteger(limits.maxTotalUncompressedBytes, 'invalid-total-limit')
  if (!Number.isFinite(limits.maxCompressionRatio) || limits.maxCompressionRatio < 1) fail('invalid-ratio-limit')
  return limits
}

let crcTable: Uint32Array | undefined
function crc32(content: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let value = n
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
      crcTable[n] = value >>> 0
    }
  }
  let value = 0xffffffff
  for (const byte of content) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

export function parseStrictZip(
  input: Uint8Array,
  options: { inflateRaw: InflateRawPort; limits?: Partial<StrictZipLimits>; archiveRoot?: string },
): StrictZipArchive {
  if (!(input instanceof Uint8Array)) fail('archive-input-type')
  if (!options || typeof options.inflateRaw !== 'function') fail('inflate-port')
  const limits = normalizeLimits(options.limits)
  const archiveRoot = options.archiveRoot ?? ARCHIVE_ROOT
  validateRelativePath(`${archiveRoot}/sentinel`, 'archive-root')
  if (input.length < 22) fail('archive-too-small')
  if (input.length > limits.maxArchiveBytes) fail('archive-too-large')

  const eocdOffset = input.length - 22
  if (readUInt32(input, eocdOffset, 'eocd-truncated') !== EOCD_SIGNATURE) fail('eocd-final-signature')
  const diskNumber = readUInt16(input, eocdOffset + 4, 'eocd-disk')
  const centralDisk = readUInt16(input, eocdOffset + 6, 'eocd-central-disk')
  const diskEntries = readUInt16(input, eocdOffset + 8, 'eocd-disk-count')
  const totalEntries = readUInt16(input, eocdOffset + 10, 'eocd-count')
  const centralBytes = readUInt32(input, eocdOffset + 12, 'eocd-central-size')
  const centralOffset = readUInt32(input, eocdOffset + 16, 'eocd-central-offset')
  const commentBytes = readUInt16(input, eocdOffset + 20, 'eocd-comment')
  if (diskNumber !== 0 || centralDisk !== 0) fail('multi-disk')
  if (diskEntries !== totalEntries) fail('disk-entry-count')
  if (totalEntries === 0 || totalEntries === 0xffff || totalEntries > limits.maxEntries) fail('entry-count')
  if (centralBytes === 0xffffffff || centralOffset === 0xffffffff) fail('zip64-eocd')
  if (commentBytes !== 0) fail('eocd-comment')
  if (checkedAdd(centralOffset, centralBytes, 'central-range') !== eocdOffset) fail('central-eocd-boundary')

  const centralEnd = eocdOffset
  const centralEntries: ParsedCentralEntry[] = []
  const exactNames = new Set<string>()
  const collisionNames = new Set<string>()
  let totalUncompressedBytes = 0
  let cursor = centralOffset
  let previousName: string | undefined
  let previousLocalEnd = 0

  for (let index = 0; index < totalEntries; index += 1) {
    if (checkedAdd(cursor, 46, 'central-header-range') > centralEnd) fail('central-header-truncated')
    if (readUInt32(input, cursor, 'central-signature') !== CENTRAL_SIGNATURE) fail('central-signature')
    const versionMadeBy = readUInt16(input, cursor + 4, 'central-version-made-by')
    const versionNeeded = readUInt16(input, cursor + 6, 'central-version-needed')
    const flags = readUInt16(input, cursor + 8, 'central-flags')
    const method = readUInt16(input, cursor + 10, 'central-method')
    const dosTime = readUInt16(input, cursor + 12, 'central-time')
    const dosDate = readUInt16(input, cursor + 14, 'central-date')
    const expectedCrc = readUInt32(input, cursor + 16, 'central-crc')
    const compressedBytes = readUInt32(input, cursor + 20, 'central-compressed-size')
    const uncompressedBytes = readUInt32(input, cursor + 24, 'central-uncompressed-size')
    const nameBytes = readUInt16(input, cursor + 28, 'central-name-size')
    const extraBytes = readUInt16(input, cursor + 30, 'central-extra-size')
    const entryCommentBytes = readUInt16(input, cursor + 32, 'central-comment-size')
    const diskStart = readUInt16(input, cursor + 34, 'central-disk-start')
    const internalAttributes = readUInt16(input, cursor + 36, 'central-internal-attributes')
    const externalAttributes = readUInt32(input, cursor + 38, 'central-external-attributes')
    const localHeaderOffset = readUInt32(input, cursor + 42, 'central-local-offset')
    if (versionMadeBy !== 20 || versionNeeded < 10 || versionNeeded > 20) fail('zip-version')
    if (flags !== UTF8_FLAG) fail('zip-flags')
    if (method !== 0 && method !== 8) fail('zip-method')
    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localHeaderOffset === 0xffffffff) fail('zip64-entry')
    if (nameBytes === 0 || nameBytes > limits.maxNameBytes) fail('entry-name-size')
    if (extraBytes !== 0 || entryCommentBytes !== 0) fail('central-extra-or-comment')
    if (diskStart !== 0 || internalAttributes !== 0 || externalAttributes !== 0) fail('entry-attributes')
    if (compressedBytes > limits.maxEntryCompressedBytes || uncompressedBytes > limits.maxEntryUncompressedBytes) fail('entry-size-limit')
    if (uncompressedBytes > 0 && compressedBytes === 0) fail('entry-empty-compressed')
    if (uncompressedBytes / Math.max(1, compressedBytes) > limits.maxCompressionRatio) fail('entry-ratio')
    totalUncompressedBytes = checkedAdd(totalUncompressedBytes, uncompressedBytes, 'total-size-overflow')
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) fail('total-size-limit')

    const nameStart = cursor + 46
    const nameEnd = checkedAdd(nameStart, nameBytes, 'central-name-range')
    if (nameEnd > centralEnd) fail('central-name-truncated')
    const rawName = input.slice(nameStart, nameEnd)
    const name = validateRelativePath(decodeUtf8(rawName, 'entry-name-utf8'), 'entry-name-path', archiveRoot)
    if (previousName !== undefined && compareText(previousName, name) >= 0) fail('entry-name-order')
    previousName = name
    if (exactNames.has(name)) fail('entry-name-duplicate')
    exactNames.add(name)
    const collision = name.normalize('NFC').toLowerCase()
    if (collisionNames.has(collision)) fail('entry-name-collision')
    collisionNames.add(collision)

    const localEndMinimum = checkedAdd(localHeaderOffset, 30, 'local-header-range')
    if (localEndMinimum > centralOffset) fail('local-header-boundary')
    if (localHeaderOffset !== previousLocalEnd) fail('local-layout')
    if (readUInt32(input, localHeaderOffset, 'local-signature') !== LOCAL_SIGNATURE) fail('local-signature')
    const localVersion = readUInt16(input, localHeaderOffset + 4, 'local-version')
    const localFlags = readUInt16(input, localHeaderOffset + 6, 'local-flags')
    const localMethod = readUInt16(input, localHeaderOffset + 8, 'local-method')
    const localTime = readUInt16(input, localHeaderOffset + 10, 'local-time')
    const localDate = readUInt16(input, localHeaderOffset + 12, 'local-date')
    const localCrc = readUInt32(input, localHeaderOffset + 14, 'local-crc')
    const localCompressed = readUInt32(input, localHeaderOffset + 18, 'local-compressed-size')
    const localUncompressed = readUInt32(input, localHeaderOffset + 22, 'local-uncompressed-size')
    const localNameBytes = readUInt16(input, localHeaderOffset + 26, 'local-name-size')
    const localExtraBytes = readUInt16(input, localHeaderOffset + 28, 'local-extra-size')
    if (
      localVersion !== versionNeeded
      || localFlags !== flags
      || localMethod !== method
      || localTime !== dosTime
      || localDate !== dosDate
      || localCrc !== expectedCrc
      || localCompressed !== compressedBytes
      || localUncompressed !== uncompressedBytes
      || localNameBytes !== nameBytes
      || localExtraBytes !== 0
    ) fail('local-central-parity')
    const localNameStart = localHeaderOffset + 30
    const localNameEnd = checkedAdd(localNameStart, localNameBytes, 'local-name-range')
    const dataStart = checkedAdd(localNameEnd, localExtraBytes, 'local-data-start')
    const dataEnd = checkedAdd(dataStart, compressedBytes, 'local-data-end')
    if (dataEnd > centralOffset) fail('local-data-boundary')
    if (!equalBytes(rawName, input.slice(localNameStart, localNameEnd))) fail('local-central-name')
    previousLocalEnd = dataEnd

    centralEntries.push({
      name,
      nameBytes: rawName,
      flags,
      method,
      dosTime,
      dosDate,
      crc32: expectedCrc,
      compressedBytes,
      uncompressedBytes,
      localHeaderOffset,
    })
    cursor = nameEnd
  }
  if (cursor !== centralEnd) fail('central-directory-size')
  if (previousLocalEnd !== centralOffset) fail('local-central-gap')

  const entries = centralEntries.map((entry): StrictZipEntry => {
    const localNameBytes = readUInt16(input, entry.localHeaderOffset + 26, 'local-name-size')
    const dataStart = entry.localHeaderOffset + 30 + localNameBytes
    const compressed = input.slice(dataStart, dataStart + entry.compressedBytes)
    let content: Uint8Array
    if (entry.method === 0) {
      if (entry.compressedBytes !== entry.uncompressedBytes) fail('stored-size')
      content = compressed.slice()
    } else {
      try {
        const maxOutputBytes = Math.max(1, Math.min(entry.uncompressedBytes, limits.maxEntryUncompressedBytes))
        const inflated = options.inflateRaw(compressed, maxOutputBytes)
        if (!(inflated instanceof Uint8Array)) fail('inflate-output-type')
        content = inflated.slice()
      } catch {
        return fail('inflate-failure')
      }
    }
    if (content.length !== entry.uncompressedBytes) fail('uncompressed-size')
    if (crc32(content) !== entry.crc32) fail('crc32')
    return {
      name: entry.name,
      method: entry.method,
      crc32: entry.crc32,
      compressedBytes: entry.compressedBytes,
      uncompressedBytes: entry.uncompressedBytes,
      localHeaderOffset: entry.localHeaderOffset,
      content,
    }
  })
  return { archiveBytes: input.length, totalUncompressedBytes, entries }
}

function validateBaseFilename(name: string, code: string): string {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name === 'SHA256SUMS') fail(code)
  return name
}

export function parseSha256Sums(text: string, expectedNames: readonly string[]): ChecksumRow[] {
  if (typeof text !== 'string' || text.length === 0 || text.length > 1024 * 1024 || text.includes('\0')) fail('checksum-input')
  if (!text.endsWith('\n') || text.includes('\r') || text.endsWith('\n\n')) fail('checksum-newline')
  if (!Array.isArray(expectedNames) || expectedNames.length === 0 || expectedNames.length > 1000) fail('checksum-expected-set')
  const expected = expectedNames.map((name) => validateBaseFilename(name, 'checksum-expected-name'))
  if (new Set(expected).size !== expected.length || [...expected].sort(compareText).some((name, index) => name !== expected[index])) fail('checksum-expected-order')
  const lines = text.slice(0, -1).split('\n')
  if (lines.length !== expected.length) fail('checksum-row-count')
  const rows = lines.map((line, index): ChecksumRow => {
    const match = /^([0-9a-f]{64})  ([a-z0-9][a-z0-9.-]*)$/.exec(line)
    if (!match) fail('checksum-row')
    const name = validateBaseFilename(match[2], 'checksum-name')
    if (name !== expected[index]) fail('checksum-order')
    return { sha256: match[1], name }
  })
  if (new Set(rows.map(({ name }) => name)).size !== rows.length) fail('checksum-duplicate')
  return rows
}

function exactOrdinal(values: string[], expected: string[], code: string): void {
  if (JSON.stringify(values) !== JSON.stringify(expected)) fail(code)
}

export function validateReleaseOutputSet(input: ReleaseOutputSetInput): ReleaseOutputSet {
  if (!Array.isArray(input.providerIds) || input.providerIds.length === 0) fail('provider-set')
  const providers = input.providerIds.map((provider) => validateBaseFilename(provider, 'provider-name'))
  if (new Set(providers).size !== providers.length) fail('provider-set')
  if (!/^\d+\.\d+\.\d+$/.test(input.bundleVersion) || !/^\d+\.\d+\.\d+$/.test(input.sourceVersion)) fail('release-version')
  const distributableFiles = [
    ...providers.flatMap((provider) => [
      `agentic-feature-kit-${provider}-${input.bundleVersion}.cdx.json`,
      `agentic-feature-kit-${provider}-${input.bundleVersion}.spdx.json`,
      `agentic-feature-kit-${provider}-${input.bundleVersion}.zip`,
    ]),
    `agentic-feature-kit-source-${input.sourceVersion}.cdx.json`,
    `agentic-feature-kit-source-${input.sourceVersion}.spdx.json`,
  ].sort(compareText)
  const expectedFiles = ['SHA256SUMS', ...distributableFiles].sort(compareText)
  const directories = input.topLevelDirectories.map((name) => validateBaseFilename(name, 'top-level-directory'))
  const files = input.topLevelFiles.map((name) => name === 'SHA256SUMS' ? name : validateBaseFilename(name, 'top-level-file'))
  exactOrdinal([...directories].sort(compareText), [...providers].sort(compareText), 'top-level-directories')
  exactOrdinal(files, expectedFiles, 'top-level-files')
  return { distributableFiles, checksums: parseSha256Sums(input.checksumText, distributableFiles) }
}

function parseJsonObject(bytes: Uint8Array, code: string): Record<string, unknown> {
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) fail(code)
  const text = decodeUtf8(bytes, code)
  if (text.includes('\0') || !text.endsWith('\n')) fail(code)
  try {
    const value = JSON.parse(text) as unknown
    if (!isRecord(value)) fail(code)
    return value
  } catch {
    return fail(code)
  }
}

function parseDistributionManifest(value: Record<string, unknown>, input: DistributionArchiveInput): DistributionManifest {
  exactKeys(value, ['schemaVersion', 'product', 'provider', 'bundleVersion', 'sharedCoreVersion', 'nodeEngine', 'capabilities', 'files', 'manifestHash'], 'manifest-keys')
  if (
    value.schemaVersion !== 1
    || value.product !== 'agentic-feature-kit'
    || value.provider !== input.provider
    || value.bundleVersion !== input.bundleVersion
    || value.sharedCoreVersion !== input.sharedCoreVersion
    || value.nodeEngine !== '>=20'
    || !Array.isArray(value.capabilities)
    || JSON.stringify(value.capabilities) !== JSON.stringify(DISTRIBUTION_CAPABILITIES)
    || !Array.isArray(value.files)
    || typeof value.manifestHash !== 'string'
    || !SHA256.test(value.manifestHash)
  ) fail('manifest-identity')
  if (value.files.length === 0 || value.files.length > DEFAULT_STRICT_ZIP_LIMITS.maxEntries) fail('manifest-file-count')
  const paths = new Set<string>()
  const collisions = new Set<string>()
  let previous: string | undefined
  const files = value.files.map((raw, index): DistributionManifestFile => {
    if (!isRecord(raw)) fail('manifest-file-row')
    exactKeys(raw, ['path', 'bytes', 'sha256'], 'manifest-file-keys')
    if (typeof raw.path !== 'string' || typeof raw.bytes !== 'number' || typeof raw.sha256 !== 'string') fail('manifest-file-types')
    const filePath = validateRelativePath(raw.path, 'manifest-file-path')
    if (previous !== undefined && compareText(previous, filePath) >= 0) fail('manifest-file-order')
    previous = filePath
    if (paths.has(filePath)) fail('manifest-file-duplicate')
    paths.add(filePath)
    const collision = filePath.toLowerCase()
    if (collisions.has(collision)) fail('manifest-file-collision')
    collisions.add(collision)
    if (!Number.isSafeInteger(raw.bytes) || raw.bytes < 0 || raw.bytes > DEFAULT_STRICT_ZIP_LIMITS.maxEntryUncompressedBytes || !SHA256.test(raw.sha256)) fail('manifest-file-metadata')
    void index
    return { path: filePath, bytes: raw.bytes, sha256: raw.sha256 }
  })
  return { ...value, files } as unknown as DistributionManifest
}

export function validateDistributionArchive(input: DistributionArchiveInput): DistributionArchiveResult {
  if (!input || typeof input.sha256 !== 'function') fail('distribution-input')
  validateRelativePath(`${input.archiveRoot}/sentinel`, 'distribution-root')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(input.provider)) fail('distribution-provider')
  const prefix = `${input.archiveRoot}/`
  const byRelative = new Map<string, StrictZipEntry>()
  for (const entry of input.archive.entries) {
    if (!entry.name.startsWith(prefix)) fail('distribution-root')
    const relative = entry.name.slice(prefix.length)
    validateRelativePath(relative, 'distribution-entry-path')
    if (byRelative.has(relative)) fail('distribution-entry-duplicate')
    byRelative.set(relative, entry)
  }
  const manifestEntry = byRelative.get('bundle-manifest.json')
  if (!manifestEntry) fail('manifest-missing')
  const manifestValue = parseJsonObject(manifestEntry.content, 'manifest-json')
  const manifest = parseDistributionManifest(manifestValue, input)
  const { manifestHash, ...withoutHash } = manifest
  const payload = new TextEncoder().encode(stableJson(withoutHash))
  const computedManifestHash = input.sha256(payload)
  if (!SHA256.test(computedManifestHash) || computedManifestHash !== manifestHash) fail('manifest-hash')

  const actualFiles = [...byRelative.keys()].filter((name) => name !== 'bundle-manifest.json').sort(compareText)
  const manifestFiles = manifest.files.map(({ path }) => path)
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles)) fail('manifest-entry-set')
  for (const file of manifest.files) {
    const entry = byRelative.get(file.path)
    if (!entry || entry.uncompressedBytes !== file.bytes) fail('manifest-entry-bytes')
    const digest = input.sha256(entry.content)
    if (!SHA256.test(digest) || digest !== file.sha256) fail('manifest-entry-hash')
  }
  return {
    archiveEntries: input.archive.entries.length,
    manifestFiles,
    manifestHash,
    textEntries: input.archive.entries.map((entry) => ({ path: entry.name, bytes: entry.content.slice() })),
  }
}
