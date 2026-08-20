import { createHash } from 'node:crypto'
import { createReadStream, lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

export const C5B_CONNECTION_MATERIAL_SCHEMA_VERSION = 1 as const
export const C5B_CONNECTION_MATERIAL_POLICY_VERSION = 'p17-016-c5b-connection-material-v1' as const

export interface C5BConnectionMaterialFileExpectation {
  readonly path: string
  readonly sha256: string
  readonly maxBytes: number
}

export interface C5BConnectionMaterialQualificationConfig {
  readonly destinationCapabilityId: string
  readonly destinationDirectory: string
  readonly sourceServiceCapability: string
  readonly isolatedServiceCapability: string
  readonly pgServiceFile: C5BConnectionMaterialFileExpectation
  readonly pgPassFile: C5BConnectionMaterialFileExpectation
  readonly recipientsFile: C5BConnectionMaterialFileExpectation
  readonly identityFile: C5BConnectionMaterialFileExpectation
  readonly qualificationTtlMs: number
  readonly maxQualificationTtlMs: number
  readonly now: () => string
  readonly platform: NodeJS.Platform
  readonly environmentSource: NodeJS.ProcessEnv
}

export interface C5BConnectionMaterialBinding {
  readonly destinationCapabilityId: string
  readonly destinationDirectory: string
  readonly sourceServiceCapability: string
  readonly isolatedServiceCapability: string
  readonly pgServiceFile: string
  readonly pgPassFile: string
  readonly recipientsFile: string
  readonly identityFile: string
}

export interface C5BConnectionMaterialCurrentBinding extends C5BConnectionMaterialBinding {
  readonly observedAt: string
}

export interface C5BConnectionMaterialQualification {
  readonly kind: 'c5b-connection-material-qualification'
  readonly receiptHash: string
}

export interface C5BConnectionMaterialReceipt {
  readonly schemaVersion: typeof C5B_CONNECTION_MATERIAL_SCHEMA_VERSION
  readonly policyVersion: typeof C5B_CONNECTION_MATERIAL_POLICY_VERSION
  readonly bindingHash: string
  readonly fileCount: 4
  readonly serviceCount: 2
  readonly recipientCount: number
  readonly qualifiedAt: string
  readonly expiresAt: string
  readonly destinationIdentityHash: string
  readonly receiptHash: string
}

export interface C5BConnectionMaterialProcessEnvironments {
  readonly sourcePostgresql: Readonly<NodeJS.ProcessEnv>
  readonly isolatedPostgresql: Readonly<NodeJS.ProcessEnv>
  readonly age: Readonly<NodeJS.ProcessEnv>
}

export type C5BConnectionMaterialQualificationResult =
  | {
    readonly status: 'qualified'
    readonly capability: C5BConnectionMaterialQualification
    readonly receipt: C5BConnectionMaterialReceipt
  }
  | { readonly status: 'refused'; readonly reasonCode: 'invalid_configuration' }

interface FileSnapshot {
  readonly path: string
  readonly identity: string
  readonly byteCount: number
  readonly mode: number
  readonly sha256: string
}

interface ReadFileSnapshot extends FileSnapshot {
  readonly bytes: Buffer
}

interface DirectorySnapshot {
  readonly path: string
  readonly identity: string
}

interface ServiceCoordinates {
  readonly host: string
  readonly port: string
  readonly dbname: string
  readonly user: string
  readonly connectTimeout: string
}

interface QualificationBinding {
  readonly binding: C5BConnectionMaterialBinding
  readonly files: readonly FileSnapshot[]
  readonly destination: DirectorySnapshot
  readonly qualifiedAtMs: number
  readonly expiresAtMs: number
  lastObservedAtMs: number
  readonly environments: C5BConnectionMaterialProcessEnvironments
}

const HASH = /^[0-9a-f]{64}$/
const CLOSED_ID = /^[a-z][a-z0-9_]{2,63}$/
const SAFE_COMPONENT = /^[A-Za-z0-9._-]{1,255}$/
const AGE_RECIPIENT = /^age1[023456789acdefghjklmnpqrstuvwxyz]{20,100}$/
const AGE_IDENTITY = /^AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{20,100}$/
const PLATFORMS = new Set<NodeJS.Platform>([
  'aix', 'android', 'darwin', 'freebsd', 'haiku', 'linux', 'openbsd', 'sunos', 'win32', 'cygwin', 'netbsd',
])
const SERVICE_KEYS = new Set([
  'host', 'port', 'dbname', 'user', 'sslmode', 'sslrootcert', 'connect_timeout',
])
const CONFIG_KEYS = [
  'destinationCapabilityId', 'destinationDirectory', 'sourceServiceCapability',
  'isolatedServiceCapability', 'pgServiceFile', 'pgPassFile', 'recipientsFile', 'identityFile',
  'qualificationTtlMs', 'maxQualificationTtlMs', 'now', 'platform', 'environmentSource',
] as const
const EXPECTATION_KEYS = ['path', 'sha256', 'maxBytes'] as const
const BINDING_KEYS = [
  'destinationCapabilityId', 'destinationDirectory', 'sourceServiceCapability',
  'isolatedServiceCapability', 'pgServiceFile', 'pgPassFile', 'recipientsFile', 'identityFile',
] as const
const CURRENT_BINDING_KEYS = [...BINDING_KEYS, 'observedAt'] as const
const capabilityBindings = new WeakMap<object, QualificationBinding>()

function refused(): C5BConnectionMaterialQualificationResult {
  return Object.freeze({ status: 'refused', reasonCode: 'invalid_configuration' })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: Buffer | string | Record<string, unknown>): string {
  const bytes = Buffer.isBuffer(value) || typeof value === 'string' ? value : canonical(value)
  return createHash('sha256').update(bytes).digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function sameNativePath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left)
  const normalizedRight = path.normalize(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function sameResolvedText(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function nativePathKey(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isInsideOrEqual(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function canonicalFilePath(value: unknown): string | null {
  if (!nonBlank(value) || !path.isAbsolute(value) || !sameResolvedText(value, path.resolve(value))) return null
  if (sameNativePath(value, path.parse(value).root)) return null
  try {
    const symbolic = lstatSync(value)
    const canonicalPath = realpathSync.native(value)
    const observed = statSync(canonicalPath)
    if (!symbolic.isFile() || symbolic.isSymbolicLink() || !observed.isFile()
      || !sameNativePath(value, canonicalPath)) return null
    return canonicalPath
  } catch {
    return null
  }
}

function canonicalDirectoryPath(value: unknown): string | null {
  if (!nonBlank(value) || !path.isAbsolute(value) || !sameResolvedText(value, path.resolve(value))) return null
  if (sameNativePath(value, path.parse(value).root)) return null
  try {
    const symbolic = lstatSync(value)
    const canonicalPath = realpathSync.native(value)
    const observed = statSync(canonicalPath)
    if (!symbolic.isDirectory() || symbolic.isSymbolicLink() || !observed.isDirectory()
      || !sameNativePath(value, canonicalPath)) return null
    return canonicalPath
  } catch {
    return null
  }
}

function fileIdentity(filePath: string): { readonly identity: string; readonly byteCount: number; readonly mode: number } | null {
  try {
    const symbolic = lstatSync(filePath)
    const canonicalPath = realpathSync.native(filePath)
    const observed = statSync(canonicalPath)
    if (!symbolic.isFile() || symbolic.isSymbolicLink() || !observed.isFile()
      || !sameNativePath(filePath, canonicalPath) || !Number.isSafeInteger(observed.size)
      || observed.size <= 0) return null
    return {
      identity: `${observed.dev}:${observed.ino}:${observed.size}:${observed.mtimeMs}:${observed.ctimeMs}`,
      byteCount: observed.size,
      mode: observed.mode,
    }
  } catch {
    return null
  }
}

function directorySnapshot(directoryPath: string): DirectorySnapshot | null {
  const canonicalPath = canonicalDirectoryPath(directoryPath)
  if (!canonicalPath) return null
  try {
    const observed = statSync(canonicalPath)
    return Object.freeze({
      path: canonicalPath,
      identity: `${observed.dev}:${observed.ino}:${observed.birthtimeMs}`,
    })
  } catch {
    return null
  }
}

async function readBounded(filePath: string, maximumBytes: number, expectedBytes: number): Promise<Buffer | null> {
  if (expectedBytes > maximumBytes) return null
  const chunks: Buffer[] = []
  let byteCount = 0
  const stream = createReadStream(filePath)
  try {
    for await (const chunkValue of stream) {
      const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
      byteCount += chunk.length
      if (byteCount > maximumBytes) {
        stream.destroy()
        return null
      }
      chunks.push(chunk)
    }
    return byteCount === expectedBytes ? Buffer.concat(chunks) : null
  } catch {
    return null
  }
}

async function snapshotFile(expectation: C5BConnectionMaterialFileExpectation): Promise<ReadFileSnapshot | null> {
  const canonicalPath = canonicalFilePath(expectation.path)
  if (!canonicalPath) return null
  const before = fileIdentity(canonicalPath)
  if (!before || before.byteCount > expectation.maxBytes) return null
  const bytes = await readBounded(canonicalPath, expectation.maxBytes, before.byteCount)
  const after = fileIdentity(canonicalPath)
  if (!bytes || !after || before.identity !== after.identity || before.byteCount !== after.byteCount) return null
  const digest = sha256(bytes)
  if (digest !== expectation.sha256) return null
  return Object.freeze({
    path: canonicalPath,
    identity: after.identity,
    byteCount: after.byteCount,
    mode: after.mode,
    sha256: digest,
    bytes,
  })
}

function validExpectation(value: unknown): value is C5BConnectionMaterialFileExpectation {
  return exactKeys(value, EXPECTATION_KEYS)
    && canonicalFilePath(value.path) !== null
    && typeof value.sha256 === 'string' && HASH.test(value.sha256)
    && positiveSafeInteger(value.maxBytes) && value.maxBytes <= 16 * 1024 * 1024
}

function validateConfig(value: unknown): C5BConnectionMaterialQualificationConfig | null {
  if (!exactKeys(value, CONFIG_KEYS)
    || typeof value.destinationCapabilityId !== 'string' || !CLOSED_ID.test(value.destinationCapabilityId)
    || typeof value.sourceServiceCapability !== 'string' || !CLOSED_ID.test(value.sourceServiceCapability)
    || typeof value.isolatedServiceCapability !== 'string' || !CLOSED_ID.test(value.isolatedServiceCapability)
    || value.sourceServiceCapability === value.isolatedServiceCapability
    || canonicalDirectoryPath(value.destinationDirectory) === null
    || !validExpectation(value.pgServiceFile)
    || !validExpectation(value.pgPassFile)
    || !validExpectation(value.recipientsFile)
    || !validExpectation(value.identityFile)
    || !positiveSafeInteger(value.qualificationTtlMs)
    || !positiveSafeInteger(value.maxQualificationTtlMs)
    || value.qualificationTtlMs > value.maxQualificationTtlMs
    || typeof value.now !== 'function'
    || typeof value.platform !== 'string' || !PLATFORMS.has(value.platform as NodeJS.Platform)
    || value.platform !== process.platform
    || !validRuntimeEnvironmentSource(value.environmentSource, value.platform as NodeJS.Platform)) return null
  return value as unknown as C5BConnectionMaterialQualificationConfig
}

function decodeUtf8(bytes: Buffer): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.charCodeAt(0) === 0xfeff || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null
    return text
  } catch {
    return null
  }
}

function parseServiceFile(text: string, sourceName: string, isolatedName: string): {
  readonly source: ServiceCoordinates
  readonly isolated: ServiceCoordinates
} | null {
  const sections = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.includes('\r')) return null
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const section = /^\[([a-z][a-z0-9_]{2,63})\]$/.exec(line)
    if (section) {
      if (sections.has(section[1])) return null
      current = new Map<string, string>()
      sections.set(section[1], current)
      continue
    }
    if (!current) return null
    const separator = line.indexOf('=')
    if (separator <= 0) return null
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || !SERVICE_KEYS.has(key)
      || !nonBlank(value) || current.has(key)) return null
    current.set(key, value)
  }
  if (sections.size !== 2) return null
  const parseCoordinates = (name: string): ServiceCoordinates | null => {
    const section = sections.get(name)
    if (!section) return null
    const host = section.get('host')
    const port = section.get('port')
    const dbname = section.get('dbname')
    const user = section.get('user')
    const sslmode = section.get('sslmode')
    const sslrootcert = section.get('sslrootcert')
    const connectTimeout = section.get('connect_timeout')
    if (section.size !== SERVICE_KEYS.size || !host || !port || !dbname || !user || !connectTimeout
      || sslmode !== 'verify-full' || sslrootcert !== 'system') return null
    if (![host, dbname, user].every((component) => SAFE_COMPONENT.test(component))) return null
    const portNumber = Number(port)
    const timeoutNumber = Number(connectTimeout)
    if (!Number.isSafeInteger(portNumber) || portNumber < 1 || portNumber > 65_535
      || !Number.isSafeInteger(timeoutNumber) || timeoutNumber < 1 || timeoutNumber > 60) return null
    return Object.freeze({ host, port, dbname, user, connectTimeout })
  }
  const source = parseCoordinates(sourceName)
  const isolated = parseCoordinates(isolatedName)
  if (!source || !isolated || canonical(source) === canonical(isolated)) return null
  return Object.freeze({ source, isolated })
}

function splitPgPass(line: string): string[] | null {
  const fields: string[] = []
  let field = ''
  let escaped = false
  for (const character of line) {
    if (escaped) {
      if (character !== ':' && character !== '\\') return null
      field += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === ':') {
      fields.push(field)
      field = ''
    } else {
      field += character
    }
  }
  if (escaped) return null
  fields.push(field)
  return fields.length === 5 ? fields : null
}

function parsePassFile(text: string, services: { source: ServiceCoordinates; isolated: ServiceCoordinates }): boolean {
  const records: string[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.includes('\r')) return false
    if (rawLine === '' || rawLine.startsWith('#')) continue
    if (rawLine.trim() !== rawLine) return false
    const fields = splitPgPass(rawLine)
    if (!fields || fields.slice(0, 4).some((field) => field === '' || field.includes('*')) || fields[4] === '') return false
    records.push(fields)
  }
  if (records.length !== 2) return false
  const tuple = (service: ServiceCoordinates): string => [service.host, service.port, service.dbname, service.user].join('\u0000')
  const expected = new Set([tuple(services.source), tuple(services.isolated)])
  const actual = records.map((record) => record.slice(0, 4).join('\u0000'))
  return new Set(actual).size === 2 && actual.every((value) => expected.has(value))
}

function parseRecipients(text: string): readonly string[] | null {
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text
  if (normalized.length === 0) return null
  const lines = normalized.split(/\r?\n/)
  if (lines.some((line) => line.includes('\r') || line.trim() !== line || !AGE_RECIPIENT.test(line))) return null
  return new Set(lines).size === lines.length ? Object.freeze([...lines]) : null
}

function parseIdentity(text: string): boolean {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text)) return false
  const secrets: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.includes('\r')) return false
    if (rawLine === '' || rawLine.startsWith('#')) continue
    if (rawLine.trim() !== rawLine || !AGE_IDENTITY.test(rawLine)) return false
    secrets.push(rawLine)
  }
  return secrets.length === 1
}

function safeWindowsEnvironment(source: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { LANG: 'C', LC_ALL: 'C' }
  if (platform === 'win32') {
    if (nonBlank(source.SystemRoot)) result.SystemRoot = source.SystemRoot
    if (nonBlank(source.WINDIR)) result.WINDIR = source.WINDIR
  }
  return result
}

function validRuntimeEnvironmentSource(value: unknown, platform: NodeJS.Platform): value is NodeJS.ProcessEnv {
  if (!isRecord(value)) return false
  if (platform !== 'win32') return true
  return (['SystemRoot', 'WINDIR'] as const).every((key) => {
    const runtimeValue = process.env[key]
    return nonBlank(runtimeValue) ? value[key] === runtimeValue : value[key] === undefined
  })
}

function environments(
  config: C5BConnectionMaterialQualificationConfig,
  services: { source: ServiceCoordinates; isolated: ServiceCoordinates },
): C5BConnectionMaterialProcessEnvironments {
  const base = safeWindowsEnvironment(config.environmentSource, config.platform)
  const postgresql = (connectTimeout: string): Readonly<NodeJS.ProcessEnv> => Object.freeze({
    ...base,
    PGSERVICEFILE: config.pgServiceFile.path,
    PGPASSFILE: config.pgPassFile.path,
    PGCONNECT_TIMEOUT: connectTimeout,
  })
  return deepFreeze({
    sourcePostgresql: postgresql(services.source.connectTimeout),
    isolatedPostgresql: postgresql(services.isolated.connectTimeout),
    age: Object.freeze({ ...base }),
  })
}

function bindingFromConfig(config: C5BConnectionMaterialQualificationConfig): C5BConnectionMaterialBinding {
  return Object.freeze({
    destinationCapabilityId: config.destinationCapabilityId,
    destinationDirectory: config.destinationDirectory,
    sourceServiceCapability: config.sourceServiceCapability,
    isolatedServiceCapability: config.isolatedServiceCapability,
    pgServiceFile: config.pgServiceFile.path,
    pgPassFile: config.pgPassFile.path,
    recipientsFile: config.recipientsFile.path,
    identityFile: config.identityFile.path,
  })
}

function bindingMatches(left: C5BConnectionMaterialBinding, value: unknown): value is C5BConnectionMaterialBinding {
  if (!exactKeys(value, BINDING_KEYS)
    || value.destinationCapabilityId !== left.destinationCapabilityId
    || value.sourceServiceCapability !== left.sourceServiceCapability
    || value.isolatedServiceCapability !== left.isolatedServiceCapability) return false
  return sameNativePath(String(value.destinationDirectory), left.destinationDirectory)
    && sameNativePath(String(value.pgServiceFile), left.pgServiceFile)
    && sameNativePath(String(value.pgPassFile), left.pgPassFile)
    && sameNativePath(String(value.recipientsFile), left.recipientsFile)
    && sameNativePath(String(value.identityFile), left.identityFile)
}

function sameFileSnapshot(current: FileSnapshot, expected: FileSnapshot): boolean {
  return sameNativePath(current.path, expected.path) && current.identity === expected.identity
    && current.byteCount === expected.byteCount && current.mode === expected.mode
    && current.sha256 === expected.sha256
}

async function snapshotsCurrent(binding: QualificationBinding): Promise<boolean> {
  const expectations = binding.files.map((file) => ({ path: file.path, sha256: file.sha256, maxBytes: file.byteCount }))
  for (let index = 0; index < expectations.length; index += 1) {
    const current = await snapshotFile(expectations[index])
    if (!current || !sameFileSnapshot(current, binding.files[index])) return false
  }
  const destination = directorySnapshot(binding.destination.path)
  return !!destination && destination.identity === binding.destination.identity
}

export async function qualifyC5BConnectionMaterial(value: unknown): Promise<C5BConnectionMaterialQualificationResult> {
  try {
    const config = validateConfig(value)
    if (!config) return refused()
    const destination = directorySnapshot(config.destinationDirectory)
    if (!destination) return refused()
    const expectations = [config.pgServiceFile, config.pgPassFile, config.recipientsFile, config.identityFile]
    const readFiles: ReadFileSnapshot[] = []
    for (const expectation of expectations) {
      const file = await snapshotFile(expectation)
      if (!file || isInsideOrEqual(destination.path, file.path)) return refused()
      readFiles.push(file)
    }
    if (new Set(readFiles.map((file) => nativePathKey(file.path))).size !== readFiles.length
      || new Set(readFiles.map((file) => file.identity)).size !== readFiles.length) return refused()
    if (config.platform !== 'win32' && [readFiles[1], readFiles[3]]
      .some((file) => (statSync(file.path).mode & 0o077) !== 0)) return refused()
    const decoded = readFiles.map((file) => decodeUtf8(file.bytes))
    if (decoded.some((text) => text === null)) return refused()
    const services = parseServiceFile(decoded[0] as string, config.sourceServiceCapability, config.isolatedServiceCapability)
    if (!services || !parsePassFile(decoded[1] as string, services)) return refused()
    const recipients = parseRecipients(decoded[2] as string)
    if (!recipients || !parseIdentity(decoded[3] as string)) return refused()
    const files: FileSnapshot[] = readFiles.map(({ bytes: _bytes, ...file }) => Object.freeze(file))
    const qualifiedAt = config.now()
    if (!validInstant(qualifiedAt)) return refused()
    const qualifiedAtMs = Date.parse(qualifiedAt)
    const expiresAtMs = qualifiedAtMs + config.qualificationTtlMs
    if (!Number.isSafeInteger(expiresAtMs)) return refused()
    const expiresAt = new Date(expiresAtMs).toISOString()
    const binding = bindingFromConfig(config)
    const destinationIdentityHash = sha256(destination.identity)
    const bindingHash = sha256({
      destinationCapabilityId: config.destinationCapabilityId,
      destinationIdentityHash,
      sourceServiceCapabilityHash: sha256(config.sourceServiceCapability),
      isolatedServiceCapabilityHash: sha256(config.isolatedServiceCapability),
      materialHashes: files.map((file) => file.sha256),
    })
    const receiptWithoutHash = {
      schemaVersion: C5B_CONNECTION_MATERIAL_SCHEMA_VERSION,
      policyVersion: C5B_CONNECTION_MATERIAL_POLICY_VERSION,
      bindingHash,
      fileCount: 4 as const,
      serviceCount: 2 as const,
      recipientCount: recipients.length,
      qualifiedAt,
      expiresAt,
      destinationIdentityHash,
    }
    const receipt = deepFreeze({ ...receiptWithoutHash, receiptHash: sha256(receiptWithoutHash) })
    const capability: C5BConnectionMaterialQualification = Object.freeze({
      kind: 'c5b-connection-material-qualification',
      receiptHash: receipt.receiptHash,
    })
    capabilityBindings.set(capability, {
      binding,
      files: Object.freeze(files),
      destination,
      qualifiedAtMs,
      expiresAtMs,
      lastObservedAtMs: qualifiedAtMs,
      environments: environments(config, services),
    })
    return deepFreeze({ status: 'qualified', capability, receipt })
  } catch {
    return refused()
  }
}

export function isC5BConnectionMaterialQualificationBound(
  capability: unknown,
  value: unknown,
): value is C5BConnectionMaterialBinding {
  try {
    if (!capability || typeof capability !== 'object') return false
    const stored = capabilityBindings.get(capability as object)
    if (!stored || !exactKeys(capability, ['kind', 'receiptHash'])
      || capability.kind !== 'c5b-connection-material-qualification'
      || typeof capability.receiptHash !== 'string' || !HASH.test(capability.receiptHash)) return false
    return bindingMatches(stored.binding, value)
  } catch {
    return false
  }
}

export async function isC5BConnectionMaterialQualificationCurrent(
  capability: unknown,
  value: unknown,
): Promise<boolean> {
  try {
    if (!capability || typeof capability !== 'object') return false
    const stored = capabilityBindings.get(capability as object)
    if (!stored || !exactKeys(value, CURRENT_BINDING_KEYS)) return false
    const binding = Object.fromEntries(BINDING_KEYS.map((key) => [key, value[key]]))
    if (!isC5BConnectionMaterialQualificationBound(capability, binding) || !validInstant(value.observedAt)) return false
    const observedAtMs = Date.parse(value.observedAt)
    if (observedAtMs < stored.qualifiedAtMs || observedAtMs < stored.lastObservedAtMs
      || observedAtMs > stored.expiresAtMs) return false
    if (!await snapshotsCurrent(stored)) return false
    stored.lastObservedAtMs = observedAtMs
    return true
  } catch {
    return false
  }
}

export async function getC5BConnectionMaterialProcessEnvironments(
  capability: unknown,
  value: unknown,
): Promise<C5BConnectionMaterialProcessEnvironments | null> {
  try {
    if (!await isC5BConnectionMaterialQualificationCurrent(capability, value)) return null
    const stored = capabilityBindings.get(capability as object)
    if (!stored) return null
    return deepFreeze({
      sourcePostgresql: { ...stored.environments.sourcePostgresql },
      isolatedPostgresql: { ...stored.environments.isolatedPostgresql },
      age: { ...stored.environments.age },
    })
  } catch {
    return null
  }
}
