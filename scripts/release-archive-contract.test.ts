import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import {
  ArchiveContractError,
  parseSha256Sums,
  parseStrictZip,
  validateDistributionArchive,
  validateReleaseOutputSet,
  type StrictZipLimits,
} from './release-archive-contract'

interface FixtureEntry {
  name: string
  content: Buffer
  method?: 0 | 8
}

interface ZipFixture {
  bytes: Buffer
  centralOffsets: number[]
  eocdOffset: number
  localOffsets: number[]
}

const UTF8_FLAG = 0x0800
const CAPABILITIES = [
  'project-intelligence',
  'stack-portability',
  'conditional-quality-gates',
  'workflow-orchestrator',
  'phase-model-routing',
]

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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function buildZip(rawEntries: FixtureEntry[], ordinal = true): ZipFixture {
  const entries = ordinal ? [...rawEntries].sort((left, right) => compareText(left.name, right.name)) : rawEntries
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  const localOffsets: number[] = []
  const centralOffsets: number[] = []
  let localOffset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const method = entry.method ?? 8
    const compressed = method === 8 ? zlib.deflateRawSync(entry.content, { level: 9 }) : Buffer.from(entry.content)
    const crc = crc32(entry.content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(33, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localOffsets.push(localOffset)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8_FLAG, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, name)
    localOffset += local.length + name.length + compressed.length
  }

  let centralOffset = localOffset
  for (const part of centralParts) {
    if (part.length === 46) centralOffsets.push(centralOffset)
    centralOffset += part.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  end.writeUInt16LE(0, 20)
  return {
    bytes: Buffer.concat([...localParts, centralDirectory, end]),
    centralOffsets,
    eocdOffset: localOffset + centralDirectory.length,
    localOffsets,
  }
}

function clone(fixture: ZipFixture): ZipFixture {
  return { ...fixture, bytes: Buffer.from(fixture.bytes) }
}

function inflateRaw(bytes: Uint8Array, maxOutputBytes: number): Uint8Array {
  return zlib.inflateRawSync(Buffer.from(bytes), { maxOutputLength: maxOutputBytes })
}

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const canonical = buildZip([
  { name: 'agentic-feature-kit/LICENSE', content: Buffer.from('Apache-2.0\n'), method: 0 },
  { name: 'agentic-feature-kit/runtime/tool.cjs', content: Buffer.from('module.exports = 1\n') },
])

const parsed = parseStrictZip(canonical.bytes, { inflateRaw })
assert.deepEqual(parsed.entries.map(({ name }) => name), [
  'agentic-feature-kit/LICENSE',
  'agentic-feature-kit/runtime/tool.cjs',
])
assert.equal(Buffer.from(parsed.entries[0].content).toString('utf8'), 'Apache-2.0\n')
assert.equal(Buffer.from(parsed.entries[1].content).toString('utf8'), 'module.exports = 1\n')
assert.equal(parsed.totalUncompressedBytes, 30)

let zipAttacks = 0
function rejectZip(label: string, fixture: ZipFixture | Buffer, limits?: Partial<StrictZipLimits>): void {
  zipAttacks += 1
  const bytes = Buffer.isBuffer(fixture) ? fixture : fixture.bytes
  assert.throws(
    () => parseStrictZip(bytes, { inflateRaw, limits }),
    (error: unknown) => error instanceof ArchiveContractError && error.message.startsWith('release-archive-contract:'),
    label,
  )
}

rejectZip('too small', Buffer.alloc(21))
rejectZip('archive bound', canonical, { maxArchiveBytes: canonical.bytes.length - 1 })

{
  const item = clone(canonical); item.bytes.writeUInt32LE(0, item.eocdOffset); rejectZip('missing EOCD', item)
}
rejectZip('trailing byte', Buffer.concat([canonical.bytes, Buffer.of(0)]))
rejectZip('duplicate EOCD', Buffer.concat([canonical.bytes, canonical.bytes.subarray(canonical.eocdOffset)]))
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.eocdOffset + 20); rejectZip('EOCD comment', item)
}
for (const field of [4, 6]) {
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.eocdOffset + field); rejectZip(`multi-disk ${field}`, item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.eocdOffset + 8); rejectZip('disk count drift', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(0xffff, item.eocdOffset + 10); rejectZip('ZIP64 count', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt32LE(0xffffffff, item.eocdOffset + 12); rejectZip('ZIP64 central size', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt32LE(item.bytes.readUInt32LE(item.eocdOffset + 12) - 1, item.eocdOffset + 12); rejectZip('central gap', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt32LE(item.bytes.readUInt32LE(item.eocdOffset + 16) + 1, item.eocdOffset + 16); rejectZip('central offset drift', item)
}
rejectZip('prepended byte', Buffer.concat([Buffer.of(0), canonical.bytes]))

for (const [label, centralField, localField, value] of [
  ['encryption', 8, 6, UTF8_FLAG | 0x0001],
  ['data descriptor', 8, 6, UTF8_FLAG | 0x0008],
  ['unsupported flag', 8, 6, UTF8_FLAG | 0x0010],
  ['unsupported method', 10, 8, 12],
] as const) {
  const item = clone(canonical)
  item.bytes.writeUInt16LE(value, item.centralOffsets[0] + centralField)
  item.bytes.writeUInt16LE(value, item.localOffsets[0] + localField)
  rejectZip(label, item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(45, item.centralOffsets[0] + 6); item.bytes.writeUInt16LE(45, item.localOffsets[0] + 4); rejectZip('unsupported required version', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.centralOffsets[0] + 30); rejectZip('central extra', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.centralOffsets[0] + 32); rejectZip('central comment', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.centralOffsets[0] + 34); rejectZip('central disk start', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt32LE(0xa0000000, item.centralOffsets[0] + 38); rejectZip('symlink external attributes', item)
}

for (const name of [
  '',
  '/absolute',
  'C:/drive',
  '\\\\server/share',
  'agentic-feature-kit\\backslash',
  'agentic-feature-kit/file:stream',
  '../escape',
  'agentic-feature-kit/../escape',
  'agentic-feature-kit/./dot',
  'agentic-feature-kit//empty',
  'agentic-feature-kit/trailing/',
  'agentic-feature-kit/trailing.',
  'agentic-feature-kit/trailing ',
  'agentic-feature-kit/NUL.txt',
  'agentic-feature-kit/COM1.log',
  'agentic-feature-kit/control\u0001.txt',
  'agentic-feature-kit/e\u0301.txt',
  'wrong-root/file.txt',
]) rejectZip(`unsafe name ${JSON.stringify(name)}`, buildZip([{ name, content: Buffer.from('x') }]))

rejectZip('exact duplicate', buildZip([
  { name: 'agentic-feature-kit/a.txt', content: Buffer.from('a') },
  { name: 'agentic-feature-kit/a.txt', content: Buffer.from('b') },
]))
rejectZip('case collision', buildZip([
  { name: 'agentic-feature-kit/A.txt', content: Buffer.from('a') },
  { name: 'agentic-feature-kit/a.txt', content: Buffer.from('b') },
]))
rejectZip('non-ordinal central order', buildZip([
  { name: 'agentic-feature-kit/z.txt', content: Buffer.from('z') },
  { name: 'agentic-feature-kit/a.txt', content: Buffer.from('a') },
], false))
rejectZip('name bound', canonical, { maxNameBytes: 5 })
{
  const item = buildZip([{ name: 'agentic-feature-kit/x.txt', content: Buffer.from('x') }])
  item.bytes[item.localOffsets[0] + 30] = 0xff
  item.bytes[item.centralOffsets[0] + 46] = 0xff
  rejectZip('invalid UTF-8', item)
}

{
  const item = clone(canonical); item.bytes.writeUInt32LE(0, item.localOffsets[0]); rejectZip('local signature', item)
}
for (const [label, centralField, width] of [
  ['flags', 8, 2],
  ['method', 10, 2],
  ['time', 12, 2],
  ['date', 14, 2],
  ['CRC', 16, 4],
  ['compressed size', 20, 4],
  ['uncompressed size', 24, 4],
] as const) {
  const item = clone(canonical)
  const offset = item.centralOffsets[0] + centralField
  if (width === 2) item.bytes.writeUInt16LE((item.bytes.readUInt16LE(offset) + 1) & 0xffff, offset)
  else item.bytes.writeUInt32LE((item.bytes.readUInt32LE(offset) + 1) >>> 0, offset)
  rejectZip(`local-central ${label}`, item)
}
{
  const item = clone(canonical); item.bytes[item.centralOffsets[0] + 46] ^= 1; rejectZip('local-central name', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt16LE(1, item.localOffsets[0] + 28); rejectZip('local extra', item)
}
{
  const item = clone(canonical); item.bytes.writeUInt32LE(item.localOffsets[0], item.centralOffsets[1] + 42); rejectZip('overlapping local ranges', item)
}
{
  const item = clone(canonical)
  const firstNameLength = item.bytes.readUInt16LE(item.localOffsets[0] + 26)
  const firstData = item.localOffsets[0] + 30 + firstNameLength
  item.bytes[firstData] ^= 0xff
  rejectZip('inflate or CRC mutation', item)
}
{
  const item = clone(canonical)
  const crc = (item.bytes.readUInt32LE(item.centralOffsets[0] + 16) + 1) >>> 0
  item.bytes.writeUInt32LE(crc, item.centralOffsets[0] + 16)
  item.bytes.writeUInt32LE(crc, item.localOffsets[0] + 14)
  rejectZip('payload CRC mismatch', item)
}
{
  const stored = buildZip([{ name: 'agentic-feature-kit/stored.txt', content: Buffer.from('stored'), method: 0 }])
  const size = stored.bytes.readUInt32LE(stored.centralOffsets[0] + 24) + 1
  stored.bytes.writeUInt32LE(size, stored.centralOffsets[0] + 24)
  stored.bytes.writeUInt32LE(size, stored.localOffsets[0] + 22)
  rejectZip('stored size mismatch', stored)
}
rejectZip('entry uncompressed bound', canonical, { maxEntryUncompressedBytes: 4 })
rejectZip('aggregate uncompressed bound', canonical, { maxTotalUncompressedBytes: 12 })
rejectZip('entry count bound', canonical, { maxEntries: 1 })
rejectZip('compression ratio bound', buildZip([{ name: 'agentic-feature-kit/repeated.txt', content: Buffer.alloc(10_000, 65) }]), { maxCompressionRatio: 2 })
assert.throws(
  () => parseStrictZip(buildZip([{ name: 'agentic-feature-kit/fail.txt', content: Buffer.from('inflate') }]).bytes, {
    inflateRaw: () => { throw new Error('candidate bytes must not appear') },
  }),
  (error: unknown) => error instanceof ArchiveContractError && !error.message.includes('candidate bytes must not appear'),
  'inflate diagnostics must be redacted',
)
zipAttacks += 1

const checksumNames = ['a.json', 'b.zip']
const checksumText = `${'1'.repeat(64)}  a.json\n${'2'.repeat(64)}  b.zip\n`
assert.deepEqual(parseSha256Sums(checksumText, checksumNames).map(({ name }) => name), checksumNames)

let checksumAttacks = 0
function rejectChecksums(label: string, text: string, expected = checksumNames): void {
  checksumAttacks += 1
  assert.throws(() => parseSha256Sums(text, expected), ArchiveContractError, label)
}
rejectChecksums('missing final LF', checksumText.trimEnd())
rejectChecksums('CRLF', checksumText.replace(/\n/g, '\r\n'))
rejectChecksums('missing row', `${'1'.repeat(64)}  a.json\n`)
rejectChecksums('extra row', `${checksumText}${'3'.repeat(64)}  c.txt\n`)
rejectChecksums('wrong order', `${'2'.repeat(64)}  b.zip\n${'1'.repeat(64)}  a.json\n`)
rejectChecksums('duplicate row', `${'1'.repeat(64)}  a.json\n${'2'.repeat(64)}  a.json\n`)
rejectChecksums('uppercase digest', `${'A'.repeat(64)}  a.json\n${'2'.repeat(64)}  b.zip\n`)
rejectChecksums('path name', `${'1'.repeat(64)}  ../a.json\n${'2'.repeat(64)}  b.zip\n`)
rejectChecksums('self checksum', `${'1'.repeat(64)}  SHA256SUMS\n`, ['SHA256SUMS'])
rejectChecksums('wrong separator', checksumText.replace('  a.json', ' a.json'))

const providerIds = ['codex', 'claude', 'copilot'] as const
const expectedReleaseFiles = [
  'SHA256SUMS',
  'agentic-feature-kit-claude-0.5.0.cdx.json',
  'agentic-feature-kit-claude-0.5.0.spdx.json',
  'agentic-feature-kit-claude-0.5.0.zip',
  'agentic-feature-kit-codex-0.5.0.cdx.json',
  'agentic-feature-kit-codex-0.5.0.spdx.json',
  'agentic-feature-kit-codex-0.5.0.zip',
  'agentic-feature-kit-copilot-0.5.0.cdx.json',
  'agentic-feature-kit-copilot-0.5.0.spdx.json',
  'agentic-feature-kit-copilot-0.5.0.zip',
  'agentic-feature-kit-source-3.25.0.cdx.json',
  'agentic-feature-kit-source-3.25.0.spdx.json',
]
const releaseChecksumNames = expectedReleaseFiles.filter((name) => name !== 'SHA256SUMS').sort(compareText)
const releaseChecksums = `${releaseChecksumNames.map((name, index) => `${(index + 1).toString(16).padStart(64, '0')}  ${name}`).join('\n')}\n`
const output = validateReleaseOutputSet({
  topLevelDirectories: [...providerIds],
  topLevelFiles: expectedReleaseFiles,
  checksumText: releaseChecksums,
  providerIds: [...providerIds],
  bundleVersion: '0.5.0',
  sourceVersion: '3.25.0',
})
assert.equal(output.checksums.length, 11)
assert.deepEqual(output.distributableFiles, releaseChecksumNames)
assert.throws(() => validateReleaseOutputSet({
  topLevelDirectories: ['codex', 'claude'],
  topLevelFiles: expectedReleaseFiles,
  checksumText: releaseChecksums,
  providerIds: [...providerIds],
  bundleVersion: '0.5.0',
  sourceVersion: '3.25.0',
}), ArchiveContractError)
assert.throws(() => validateReleaseOutputSet({
  topLevelDirectories: [...providerIds],
  topLevelFiles: [...expectedReleaseFiles, 'noise.txt'],
  checksumText: releaseChecksums,
  providerIds: [...providerIds],
  bundleVersion: '0.5.0',
  sourceVersion: '3.25.0',
}), ArchiveContractError)

function distributionFixture(mutator?: (manifest: Record<string, unknown>) => void): { archive: ReturnType<typeof parseStrictZip>; manifestHash: string } {
  const license = Buffer.from('Apache-2.0\n')
  const runtime = Buffer.from('module.exports = 1\n')
  const files = [
    { path: 'LICENSE', bytes: license.length, sha256: sha256(license) },
    { path: 'runtime/tool.cjs', bytes: runtime.length, sha256: sha256(runtime) },
  ]
  const withoutHash: Record<string, unknown> = {
    schemaVersion: 1,
    product: 'agentic-feature-kit',
    provider: 'codex',
    bundleVersion: '0.5.0',
    sharedCoreVersion: '1.3.0',
    nodeEngine: '>=20',
    capabilities: CAPABILITIES,
    files,
  }
  const manifestHash = sha256(Buffer.from(stableJson(withoutHash)))
  const manifest = { ...withoutHash, manifestHash }
  mutator?.(manifest)
  const bytes = buildZip([
    { name: 'agentic-feature-kit/LICENSE', content: license, method: 0 },
    { name: 'agentic-feature-kit/bundle-manifest.json', content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'agentic-feature-kit/runtime/tool.cjs', content: runtime },
  ]).bytes
  return { archive: parseStrictZip(bytes, { inflateRaw }), manifestHash }
}

const distribution = distributionFixture()
const distributionResult = validateDistributionArchive({
  archive: distribution.archive,
  archiveRoot: 'agentic-feature-kit',
  provider: 'codex',
  bundleVersion: '0.5.0',
  sharedCoreVersion: '1.3.0',
  sha256,
})
assert.equal(distributionResult.manifestHash, distribution.manifestHash)
assert.deepEqual(distributionResult.manifestFiles, ['LICENSE', 'runtime/tool.cjs'])
assert.equal(distributionResult.archiveEntries, 3)

let manifestAttacks = 0
for (const [label, mutator] of [
  ['provider', (manifest: Record<string, unknown>) => { manifest.provider = 'claude' }],
  ['bundle version', (manifest: Record<string, unknown>) => { manifest.bundleVersion = '9.9.9' }],
  ['core version', (manifest: Record<string, unknown>) => { manifest.sharedCoreVersion = '9.9.9' }],
  ['node engine', (manifest: Record<string, unknown>) => { manifest.nodeEngine = '>=18' }],
  ['capabilities', (manifest: Record<string, unknown>) => { manifest.capabilities = [] }],
  ['manifest hash', (manifest: Record<string, unknown>) => { manifest.manifestHash = '0'.repeat(64) }],
  ['extra key', (manifest: Record<string, unknown>) => { manifest.extra = true }],
  ['file bytes', (manifest: Record<string, unknown>) => { (manifest.files as Array<Record<string, unknown>>)[0].bytes = 999 }],
  ['file hash', (manifest: Record<string, unknown>) => { (manifest.files as Array<Record<string, unknown>>)[0].sha256 = '0'.repeat(64) }],
  ['unsafe file', (manifest: Record<string, unknown>) => { (manifest.files as Array<Record<string, unknown>>)[0].path = '../LICENSE' }],
  ['duplicate file', (manifest: Record<string, unknown>) => { (manifest.files as unknown[]) = [(manifest.files as unknown[])[0], (manifest.files as unknown[])[0]] }],
] as const) {
  manifestAttacks += 1
  const attacked = distributionFixture(mutator)
  assert.throws(() => validateDistributionArchive({
    archive: attacked.archive,
    archiveRoot: 'agentic-feature-kit',
    provider: 'codex',
    bundleVersion: '0.5.0',
    sharedCoreVersion: '1.3.0',
    sha256,
  }), ArchiveContractError, label)
}

console.log(`release-archive-contract.test: PASS (2 canonical ZIP methods, ${zipAttacks} ZIP attacks, ${checksumAttacks} checksum attacks, 2 output-set attacks, ${manifestAttacks} manifest attacks)`)
