import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

export const C5B_EXECUTABLE_QUALIFICATION_SCHEMA_VERSION = 1 as const
export const C5B_EXECUTABLE_QUALIFICATION_POLICY_VERSION = 'p17-016-c5b-executable-v1' as const
export const C5B_EXECUTABLE_QUALIFICATION_REASON = 'executable_qualification_invalid' as const

export type C5BExecutableRole = 'pg_dump' | 'pg_restore' | 'age'

export interface C5BExecutableExpectation {
  readonly executablePath: string
  readonly executableSha256: string
  readonly provenanceReceiptPath: string
  readonly provenanceReceiptSha256: string
  readonly expectedVersion: string
}

export interface C5BExecutableQualificationConfig {
  readonly pgDump: C5BExecutableExpectation
  readonly pgRestore: C5BExecutableExpectation
  readonly age: C5BExecutableExpectation
  readonly qualificationTtlMs: number
  readonly maxQualificationTtlMs: number
  readonly maxExecutableBytes: number
  readonly maxProvenanceBytes: number
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly now: () => string
}

export interface C5BExecutableProbeRequest {
  readonly role: C5BExecutableRole
  readonly executablePath: string
  readonly args: readonly ['--version']
  readonly cwd: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly shell: false
}

export interface C5BExecutableProbeExecution {
  readonly ok: boolean
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly outputCapped: boolean
  readonly stdout: string
  readonly stderr: string
}

export interface C5BExecutableProbeExecutor {
  readonly probe: (request: C5BExecutableProbeRequest) => Promise<C5BExecutableProbeExecution>
}

export type C5BProbeSpawnFactory = (
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd: string
    readonly shell: false
    readonly windowsHide: true
    readonly detached: boolean
    readonly stdio: ['pipe', 'pipe', 'pipe']
    readonly env: NodeJS.ProcessEnv
  },
) => ChildProcessWithoutNullStreams

export interface C5BNodeExecutableProbeExecutorOptions {
  readonly spawnFactory?: C5BProbeSpawnFactory
  readonly platform?: NodeJS.Platform
  readonly environmentSource?: NodeJS.ProcessEnv
  readonly terminateTree?: (child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform) => void
}

export interface C5BExecutableToolReceipt {
  readonly role: C5BExecutableRole
  readonly version: string
  readonly executableSha256: string
  readonly provenanceReceiptSha256: string
}

export interface C5BExecutableQualificationReceipt {
  readonly schemaVersion: typeof C5B_EXECUTABLE_QUALIFICATION_SCHEMA_VERSION
  readonly policyVersion: typeof C5B_EXECUTABLE_QUALIFICATION_POLICY_VERSION
  readonly qualifiedAt: string
  readonly expiresAt: string
  readonly tools: readonly C5BExecutableToolReceipt[]
}

export interface C5BExecutableQualification {
  readonly kind: 'c5b-executable-qualification'
  readonly receiptHash: string
}

export type C5BExecutableQualificationResult =
  | {
    readonly status: 'qualified'
    readonly capability: C5BExecutableQualification
    readonly receipt: C5BExecutableQualificationReceipt
  }
  | {
    readonly status: 'refused'
    readonly reasonCode: typeof C5B_EXECUTABLE_QUALIFICATION_REASON
  }

export interface C5BExecutableCurrentnessBinding {
  readonly pgDumpExecutable: string
  readonly pgRestoreExecutable: string
  readonly ageExecutable: string
  readonly observedAt: string
}

export interface C5BExecutablePathBinding {
  readonly pgDumpExecutable: string
  readonly pgRestoreExecutable: string
  readonly ageExecutable: string
}

interface FileSnapshot {
  readonly path: string
  readonly identity: string
  readonly byteCount: number
  readonly sha256: string
}

interface QualifiedToolBinding {
  readonly role: C5BExecutableRole
  readonly executable: FileSnapshot
  readonly provenance: FileSnapshot
  readonly version: string
}

interface QualificationBinding {
  readonly qualifiedAtMs: number
  readonly expiresAtMs: number
  readonly tools: readonly QualifiedToolBinding[]
}

const CONFIG_KEYS = [
  'pgDump', 'pgRestore', 'age', 'qualificationTtlMs', 'maxQualificationTtlMs',
  'maxExecutableBytes', 'maxProvenanceBytes', 'timeoutMs', 'maxOutputBytes', 'now',
] as const
const EXPECTATION_KEYS = [
  'executablePath', 'executableSha256', 'provenanceReceiptPath', 'provenanceReceiptSha256', 'expectedVersion',
] as const
const REQUEST_KEYS = ['role', 'executablePath', 'args', 'cwd', 'timeoutMs', 'maxOutputBytes', 'shell'] as const
const CURRENTNESS_KEYS = ['pgDumpExecutable', 'pgRestoreExecutable', 'ageExecutable', 'observedAt'] as const
const PATH_BINDING_KEYS = ['pgDumpExecutable', 'pgRestoreExecutable', 'ageExecutable'] as const
const HASH = /^[0-9a-f]{64}$/
const POSTGRES_VERSION = /^[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?$/
const AGE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/
const ROLES = ['pg_dump', 'pg_restore', 'age'] as const
const REDACTED_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'PGPASSWORD', 'PGSERVICEFILE', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'HOME', 'USERPROFILE',
])
const capabilityBindings = new WeakMap<object, QualificationBinding>()

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  const target = [...expected].sort()
  return keys.length === target.length && keys.every((key, index) => key === target[index])
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
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

function canonicalInputPath(value: unknown): string | null {
  if (!nonBlank(value) || !path.isAbsolute(value)) return null
  if (!sameResolvedText(value, path.resolve(value)) || sameNativePath(value, path.parse(value).root)) return null
  try {
    const symbolic = lstatSync(value)
    if (!symbolic.isFile() || symbolic.isSymbolicLink()) return null
    const canonical = realpathSync.native(value)
    if (!sameNativePath(value, canonical)) return null
    const observed = statSync(canonical)
    if (!observed.isFile()) return null
    return canonical
  } catch {
    return null
  }
}

function validIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
}

function validExpectation(value: unknown, kind: 'postgres' | 'age'): value is C5BExecutableExpectation {
  if (!exactKeys(value, EXPECTATION_KEYS)) return false
  return canonicalInputPath(value.executablePath) !== null
    && canonicalInputPath(value.provenanceReceiptPath) !== null
    && HASH.test(String(value.executableSha256))
    && HASH.test(String(value.provenanceReceiptSha256))
    && typeof value.expectedVersion === 'string'
    && (kind === 'postgres' ? POSTGRES_VERSION : AGE_VERSION).test(value.expectedVersion)
}

function validateConfig(value: unknown): C5BExecutableQualificationConfig | null {
  if (!exactKeys(value, CONFIG_KEYS)
    || !validExpectation(value.pgDump, 'postgres')
    || !validExpectation(value.pgRestore, 'postgres')
    || !validExpectation(value.age, 'age')
    || value.pgDump.expectedVersion !== value.pgRestore.expectedVersion
    || !positiveSafeInteger(value.qualificationTtlMs)
    || !positiveSafeInteger(value.maxQualificationTtlMs)
    || value.qualificationTtlMs > value.maxQualificationTtlMs
    || !positiveSafeInteger(value.maxExecutableBytes)
    || !positiveSafeInteger(value.maxProvenanceBytes)
    || !positiveSafeInteger(value.timeoutMs)
    || !positiveSafeInteger(value.maxOutputBytes)
    || typeof value.now !== 'function') return null
  return value as unknown as C5BExecutableQualificationConfig
}

function fileIdentity(filePath: string): { identity: string; byteCount: number } | null {
  try {
    const symbolic = lstatSync(filePath)
    const canonical = realpathSync.native(filePath)
    const observed = statSync(canonical)
    if (!symbolic.isFile() || symbolic.isSymbolicLink() || !observed.isFile()
      || !sameNativePath(filePath, canonical) || !Number.isSafeInteger(observed.size) || observed.size <= 0) return null
    return {
      identity: `${observed.dev}:${observed.ino}:${observed.size}:${observed.mtimeMs}:${observed.ctimeMs}`,
      byteCount: observed.size,
    }
  } catch {
    return null
  }
}

async function hashBoundedFile(filePath: string, maxBytes: number, expectedBytes: number): Promise<string | null> {
  if (expectedBytes > maxBytes) return null
  const hash = createHash('sha256')
  let byteCount = 0
  const stream = createReadStream(filePath)
  try {
    for await (const chunkValue of stream) {
      const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
      byteCount += chunk.length
      if (byteCount > maxBytes) {
        stream.destroy()
        return null
      }
      hash.update(chunk)
    }
    return byteCount === expectedBytes ? hash.digest('hex') : null
  } catch {
    return null
  }
}

async function snapshot(filePath: string, maxBytes: number): Promise<FileSnapshot | null> {
  const canonical = canonicalInputPath(filePath)
  if (!canonical) return null
  const before = fileIdentity(canonical)
  if (!before || before.byteCount > maxBytes) return null
  const digest = await hashBoundedFile(canonical, maxBytes, before.byteCount)
  const after = fileIdentity(canonical)
  if (!digest || !after || before.identity !== after.identity || before.byteCount !== after.byteCount) return null
  return Object.freeze({ path: canonical, identity: after.identity, byteCount: after.byteCount, sha256: digest })
}

function sameSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  return sameNativePath(left.path, right.path)
    && left.identity === right.identity
    && left.byteCount === right.byteCount
    && left.sha256 === right.sha256
}

function closedProbe(overrides: Partial<C5BExecutableProbeExecution> = {}): C5BExecutableProbeExecution {
  return Object.freeze({
    ok: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    outputCapped: false,
    stdout: '',
    stderr: '',
    ...overrides,
  })
}

function defaultTerminateTree(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform): void {
  if (platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
      env: sanitizedEnvironment(process.env, platform),
    })
    killer.unref()
    return
  }
  if (platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // Fall through to the direct child kill.
    }
  }
  try { child.kill('SIGKILL') } catch { /* closed failure is returned by the executor */ }
}

function sanitizedEnvironment(source: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { LANG: 'C', LC_ALL: 'C' }
  if (platform === 'win32') {
    if (nonBlank(source.SystemRoot)) result.SystemRoot = source.SystemRoot
    if (nonBlank(source.WINDIR)) result.WINDIR = source.WINDIR
  }
  for (const key of REDACTED_ENVIRONMENT_KEYS) delete result[key]
  return result
}

function validProbeRequest(value: unknown): value is C5BExecutableProbeRequest {
  if (!exactKeys(value, REQUEST_KEYS)) return false
  return ROLES.includes(value.role as C5BExecutableRole)
    && canonicalInputPath(value.executablePath) !== null
    && Array.isArray(value.args) && value.args.length === 1 && value.args[0] === '--version'
    && canonicalInputPath(path.join(String(value.cwd), path.basename(String(value.executablePath)))) !== null
    && sameNativePath(String(value.cwd), path.dirname(String(value.executablePath)))
    && positiveSafeInteger(value.timeoutMs)
    && positiveSafeInteger(value.maxOutputBytes)
    && value.shell === false
}

export function createNodeC5BExecutableProbeExecutor(
  options: C5BNodeExecutableProbeExecutorOptions = {},
): C5BExecutableProbeExecutor {
  const spawnFactory = options.spawnFactory ?? (spawn as unknown as C5BProbeSpawnFactory)
  const platform = options.platform ?? process.platform
  const environment = sanitizedEnvironment(options.environmentSource ?? process.env, platform)
  const terminateTree = options.terminateTree ?? defaultTerminateTree

  return Object.freeze({
    probe(requestValue: C5BExecutableProbeRequest): Promise<C5BExecutableProbeExecution> {
      if (!validProbeRequest(requestValue)) return Promise.resolve(closedProbe())
      return new Promise((resolve) => {
        let child: ChildProcessWithoutNullStreams
        let finished = false
        let timedOut = false
        let outputCapped = false
        let stdout = Buffer.alloc(0)
        let stderr = Buffer.alloc(0)
        let timer: ReturnType<typeof setTimeout> | null = null

        const finish = (exitCode: number | null, signal: string | null): void => {
          if (finished) return
          finished = true
          if (timer) clearTimeout(timer)
          const ok = exitCode === 0 && signal === null && !timedOut && !outputCapped
          resolve(closedProbe({
            ok,
            exitCode,
            signal,
            timedOut,
            outputCapped,
            stdout: ok ? stdout.toString('utf8') : '',
            stderr: ok ? stderr.toString('utf8') : '',
          }))
        }

        const append = (target: 'stdout' | 'stderr', chunkValue: unknown): void => {
          if (finished) return
          const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(String(chunkValue))
          const total = stdout.length + stderr.length + chunk.length
          if (total > requestValue.maxOutputBytes) {
            outputCapped = true
            try { terminateTree(child, platform) } catch { /* closed result below */ }
            finish(null, null)
            return
          }
          if (target === 'stdout') stdout = Buffer.concat([stdout, chunk])
          else stderr = Buffer.concat([stderr, chunk])
        }

        try {
          child = spawnFactory(requestValue.executablePath, ['--version'], {
            cwd: requestValue.cwd,
            shell: false,
            windowsHide: true,
            detached: platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...environment },
          })
          child.stdout.on('data', (chunk) => append('stdout', chunk))
          child.stderr.on('data', (chunk) => append('stderr', chunk))
          child.once('error', () => finish(null, null))
          child.once('close', (code, signal) => finish(code, signal))
          child.stdin.end()
          if (!finished) {
            timer = setTimeout(() => {
              timedOut = true
              try { terminateTree(child, platform) } catch { /* closed result below */ }
              finish(null, null)
            }, requestValue.timeoutMs)
          }
        } catch {
          finish(null, null)
        }
      })
    },
  })
}

function normalizeVersionOutput(role: C5BExecutableRole, execution: C5BExecutableProbeExecution): string | null {
  if (!execution.ok || execution.exitCode !== 0 || execution.signal !== null || execution.timedOut
    || execution.outputCapped || execution.stderr !== '' || typeof execution.stdout !== 'string'
    || Buffer.byteLength(execution.stdout) === 0) return null
  const line = execution.stdout.endsWith('\r\n')
    ? execution.stdout.slice(0, -2)
    : execution.stdout.endsWith('\n')
      ? execution.stdout.slice(0, -1)
      : execution.stdout
  if (line.length === 0 || line.length > 256 || /[\u0000-\u001f\u007f]/.test(line)) return null
  if (role === 'age') {
    const match = /^v?([0-9]+\.[0-9]+\.[0-9]+)$/.exec(line)
    return match?.[1] ?? null
  }
  const match = new RegExp(`^${role} \\(PostgreSQL\\) ([1-9][0-9]*\\.[0-9]+(?:\\.[0-9]+)?)(?: [\\x20-\\x7e]{1,120})?$`).exec(line)
  return match?.[1] ?? null
}

function expectationForRole(config: C5BExecutableQualificationConfig, role: C5BExecutableRole): C5BExecutableExpectation {
  return role === 'pg_dump' ? config.pgDump : role === 'pg_restore' ? config.pgRestore : config.age
}

function refusedQualification(): C5BExecutableQualificationResult {
  return Object.freeze({ status: 'refused', reasonCode: C5B_EXECUTABLE_QUALIFICATION_REASON })
}

export async function qualifyC5BExecutableCapabilities(
  configValue: C5BExecutableQualificationConfig,
  executor: C5BExecutableProbeExecutor = createNodeC5BExecutableProbeExecutor(),
): Promise<C5BExecutableQualificationResult> {
  try {
    const config = validateConfig(configValue)
    if (!config || !executor || typeof executor.probe !== 'function') return refusedQualification()
    const qualifiedAt = config.now()
    if (!validIsoInstant(qualifiedAt)) return refusedQualification()
    const qualifiedAtMs = Date.parse(qualifiedAt)
    const expiresAtMs = qualifiedAtMs + config.qualificationTtlMs
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= qualifiedAtMs) return refusedQualification()
    const expiresAt = new Date(expiresAtMs).toISOString()
    const tools: QualifiedToolBinding[] = []

    for (const role of ROLES) {
      const expected = expectationForRole(config, role)
      const executableBefore = await snapshot(expected.executablePath, config.maxExecutableBytes)
      const provenanceBefore = await snapshot(expected.provenanceReceiptPath, config.maxProvenanceBytes)
      if (!executableBefore || !provenanceBefore
        || executableBefore.sha256 !== expected.executableSha256
        || provenanceBefore.sha256 !== expected.provenanceReceiptSha256) return refusedQualification()
      const execution = await executor.probe({
        role,
        executablePath: executableBefore.path,
        args: ['--version'],
        cwd: path.dirname(executableBefore.path),
        timeoutMs: config.timeoutMs,
        maxOutputBytes: config.maxOutputBytes,
        shell: false,
      })
      const version = normalizeVersionOutput(role, execution)
      const executableAfter = await snapshot(expected.executablePath, config.maxExecutableBytes)
      const provenanceAfter = await snapshot(expected.provenanceReceiptPath, config.maxProvenanceBytes)
      if (!version || version !== expected.expectedVersion || !executableAfter || !provenanceAfter
        || !sameSnapshot(executableBefore, executableAfter)
        || !sameSnapshot(provenanceBefore, provenanceAfter)) return refusedQualification()
      tools.push(Object.freeze({ role, executable: executableAfter, provenance: provenanceAfter, version }))
    }

    const executableIdentities = tools.map((tool) => tool.executable.identity)
    if (new Set(executableIdentities).size !== executableIdentities.length) return refusedQualification()
    const provenanceIdentities = new Set(tools.map((tool) => tool.provenance.identity))
    if (executableIdentities.some((identity) => provenanceIdentities.has(identity))) return refusedQualification()

    const toolReceipts = Object.freeze(tools.map((tool) => Object.freeze({
      role: tool.role,
      version: tool.version,
      executableSha256: tool.executable.sha256,
      provenanceReceiptSha256: tool.provenance.sha256,
    })))
    const receipt: C5BExecutableQualificationReceipt = Object.freeze({
      schemaVersion: C5B_EXECUTABLE_QUALIFICATION_SCHEMA_VERSION,
      policyVersion: C5B_EXECUTABLE_QUALIFICATION_POLICY_VERSION,
      qualifiedAt,
      expiresAt,
      tools: toolReceipts,
    })
    const receiptHash = createHash('sha256').update(JSON.stringify(receipt)).digest('hex')
    const capability: C5BExecutableQualification = Object.freeze({ kind: 'c5b-executable-qualification', receiptHash })
    capabilityBindings.set(capability, Object.freeze({
      qualifiedAtMs,
      expiresAtMs,
      tools: Object.freeze(tools),
    }))
    return Object.freeze({ status: 'qualified', capability, receipt })
  } catch {
    return refusedQualification()
  }
}

function validCurrentnessBinding(value: unknown): value is C5BExecutableCurrentnessBinding {
  if (!exactKeys(value, CURRENTNESS_KEYS) || !validIsoInstant(value.observedAt)) return false
  return canonicalInputPath(value.pgDumpExecutable) !== null
    && canonicalInputPath(value.pgRestoreExecutable) !== null
    && canonicalInputPath(value.ageExecutable) !== null
}

function bindingMatchesPaths(binding: QualificationBinding, value: C5BExecutablePathBinding): boolean {
  const expectedPaths: Record<C5BExecutableRole, string> = {
    pg_dump: value.pgDumpExecutable,
    pg_restore: value.pgRestoreExecutable,
    age: value.ageExecutable,
  }
  return binding.tools.every((tool) => sameNativePath(tool.executable.path, expectedPaths[tool.role]))
}

export function isC5BExecutableQualificationBound(
  capability: unknown,
  value: C5BExecutablePathBinding,
): boolean {
  try {
    if (!capability || typeof capability !== 'object') return false
    const binding = capabilityBindings.get(capability as object)
    if (!binding || !exactKeys(value, PATH_BINDING_KEYS)
      || canonicalInputPath(value.pgDumpExecutable) === null
      || canonicalInputPath(value.pgRestoreExecutable) === null
      || canonicalInputPath(value.ageExecutable) === null) return false
    return bindingMatchesPaths(binding, value)
  } catch {
    return false
  }
}

export async function isC5BExecutableQualificationCurrent(
  capability: unknown,
  bindingValue: C5BExecutableCurrentnessBinding,
): Promise<boolean> {
  try {
    if (!capability || typeof capability !== 'object') return false
    const binding = capabilityBindings.get(capability as object)
    if (!binding || !validCurrentnessBinding(bindingValue)) return false
    const observedAtMs = Date.parse(bindingValue.observedAt)
    if (observedAtMs < binding.qualifiedAtMs || observedAtMs >= binding.expiresAtMs) return false
    if (!bindingMatchesPaths(binding, bindingValue)) return false
    for (const tool of binding.tools) {
      const executable = await snapshot(tool.executable.path, tool.executable.byteCount)
      const provenance = await snapshot(tool.provenance.path, tool.provenance.byteCount)
      if (!executable || !provenance || !sameSnapshot(tool.executable, executable)
        || !sameSnapshot(tool.provenance, provenance)) return false
    }
    return true
  } catch {
    return false
  }
}
