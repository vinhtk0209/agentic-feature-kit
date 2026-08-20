import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import {
  isC5BExecutableQualificationBound,
  isC5BExecutableQualificationCurrent,
  type C5BExecutableQualification,
} from './live-cutover-executable-qualification-node'
import {
  getC5BConnectionMaterialProcessEnvironments,
  isC5BConnectionMaterialQualificationBound,
  type C5BConnectionMaterialProcessEnvironments,
  type C5BConnectionMaterialQualification,
} from './live-cutover-connection-material-qualification-node'
import {
  evaluateC5BPreflightPrefix,
  validateC5BPreflightPacket,
  type C5BPreflightPacket,
} from './live-cutover-preflight'
import type {
  C5BOperatorContext,
  C5BPortDecision,
} from './live-cutover-preflight-operator'

export interface C5BPipelineProcess {
  readonly executable: string
  readonly args: readonly string[]
  readonly environment: Readonly<NodeJS.ProcessEnv>
}

export type C5BPipelineSourceInput =
  | { readonly kind: 'none' }
  | { readonly kind: 'file'; readonly path: string }

export type C5BPipelineOutput =
  | { readonly kind: 'capture' }
  | { readonly kind: 'file'; readonly path: string; readonly mode: number }

export interface C5BPipelineExecutionRequest {
  readonly source: C5BPipelineProcess
  readonly sink: C5BPipelineProcess
  readonly sourceInput: C5BPipelineSourceInput
  readonly output: C5BPipelineOutput
  readonly cwd: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly maxArtifactBytes: number
  readonly shell: false
}

export interface C5BPipelineExecution {
  readonly ok: boolean
  readonly sourceExitCode: number | null
  readonly sinkExitCode: number | null
  readonly sourceSignal: string | null
  readonly sinkSignal: string | null
  readonly timedOut: boolean
  readonly outputCapped: boolean
  readonly byteCount: number
  readonly sha256: string | null
  readonly capturedOutput: string | null
}

export interface C5BPipelineExecutor {
  readonly execute: (request: C5BPipelineExecutionRequest) => Promise<C5BPipelineExecution>
}

export type C5BSpawnFactory = (
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

export interface C5BNodePipelineExecutorOptions {
  readonly spawnFactory?: C5BSpawnFactory
  readonly platform?: NodeJS.Platform
  readonly terminateTree?: (child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform) => void
}

export interface C5BLogicalBackupNodeConfig {
  readonly destinationCapabilityId: string
  readonly destinationDirectory: string
  readonly sourceServiceCapability: string
  readonly isolatedServiceCapability: string
  readonly pgDumpExecutable: string
  readonly pgRestoreExecutable: string
  readonly ageExecutable: string
  readonly executableQualification: C5BExecutableQualification
  readonly pgServiceFile: string
  readonly pgPassFile: string
  readonly connectionMaterialQualification: C5BConnectionMaterialQualification
  readonly recipientsFile: string
  readonly identityFile: string
  readonly retentionMs: number
  readonly maxRetentionMs: number
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly now: () => string
}

export interface C5BLogicalBackupNodePorts {
  readonly createEncryptedLogicalBackup: (context: C5BOperatorContext) => Promise<C5BPortDecision>
  readonly restoreIsolatedBackup: (context: C5BOperatorContext) => Promise<C5BPortDecision>
}

interface ValidatedConfig extends C5BLogicalBackupNodeConfig {
  readonly destinationDirectory: string
}

interface ArtifactBinding {
  readonly packetHash: string
  readonly attemptId: string
  readonly path: string
  readonly byteCount: number
  readonly backupSha256: string
  readonly manifestSha256: string
  readonly expiresAt: string
  restored: boolean
}

const CLOSED_ID = /^[a-z][a-z0-9_]{2,63}$/
const HASH = /^[0-9a-f]{64}$/

class C5BLogicalBackupAdapterError extends Error {
  constructor() {
    super('C5B logical-backup adapter configuration refused')
    this.name = 'C5BLogicalBackupAdapterError'
  }
}

function configurationRefused(): never {
  throw new C5BLogicalBackupAdapterError()
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function absolutePath(value: unknown): value is string {
  return nonBlank(value) && path.isAbsolute(value)
}

function sameNativePath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left)
  const normalizedRight = path.normalize(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function isInsideOrEqual(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function validateConfig(value: C5BLogicalBackupNodeConfig): ValidatedConfig {
  const destination = absolutePath(value?.destinationDirectory) ? path.resolve(value.destinationDirectory) : ''
  const pgService = absolutePath(value?.pgServiceFile) ? path.resolve(value.pgServiceFile) : ''
  const pgPass = absolutePath(value?.pgPassFile) ? path.resolve(value.pgPassFile) : ''
  const recipients = absolutePath(value?.recipientsFile) ? path.resolve(value.recipientsFile) : ''
  const identity = absolutePath(value?.identityFile) ? path.resolve(value.identityFile) : ''
  if (!value || typeof value !== 'object'
    || !CLOSED_ID.test(value.destinationCapabilityId)
    || !CLOSED_ID.test(value.sourceServiceCapability)
    || !CLOSED_ID.test(value.isolatedServiceCapability)
    || value.sourceServiceCapability === value.isolatedServiceCapability
    || !absolutePath(value.destinationDirectory)
    || sameNativePath(destination, path.parse(destination).root)
    || !absolutePath(value.pgDumpExecutable)
    || !absolutePath(value.pgRestoreExecutable)
    || !absolutePath(value.ageExecutable)
    || !isC5BExecutableQualificationBound(value.executableQualification, {
      pgDumpExecutable: value.pgDumpExecutable,
      pgRestoreExecutable: value.pgRestoreExecutable,
      ageExecutable: value.ageExecutable,
    })
    || !absolutePath(value.pgServiceFile)
    || !absolutePath(value.pgPassFile)
    || !absolutePath(value.recipientsFile)
    || !absolutePath(value.identityFile)
    || isInsideOrEqual(destination, pgService)
    || isInsideOrEqual(destination, pgPass)
    || isInsideOrEqual(destination, recipients)
    || isInsideOrEqual(destination, identity)
    || !isC5BConnectionMaterialQualificationBound(value.connectionMaterialQualification, {
      destinationCapabilityId: value.destinationCapabilityId,
      destinationDirectory: value.destinationDirectory,
      sourceServiceCapability: value.sourceServiceCapability,
      isolatedServiceCapability: value.isolatedServiceCapability,
      pgServiceFile: value.pgServiceFile,
      pgPassFile: value.pgPassFile,
      recipientsFile: value.recipientsFile,
      identityFile: value.identityFile,
    })
    || !positiveSafeInteger(value.retentionMs)
    || !positiveSafeInteger(value.maxRetentionMs)
    || value.retentionMs > value.maxRetentionMs
    || !positiveSafeInteger(value.timeoutMs)
    || !positiveSafeInteger(value.maxOutputBytes)
    || typeof value.now !== 'function') configurationRefused()
  return Object.freeze({ ...value, destinationDirectory: destination })
}

async function connectionMaterialEnvironments(
  config: ValidatedConfig,
): Promise<C5BConnectionMaterialProcessEnvironments | null> {
  try {
    return await getC5BConnectionMaterialProcessEnvironments(config.connectionMaterialQualification, {
      destinationCapabilityId: config.destinationCapabilityId,
      destinationDirectory: config.destinationDirectory,
      sourceServiceCapability: config.sourceServiceCapability,
      isolatedServiceCapability: config.isolatedServiceCapability,
      pgServiceFile: config.pgServiceFile,
      pgPassFile: config.pgPassFile,
      recipientsFile: config.recipientsFile,
      identityFile: config.identityFile,
      observedAt: config.now(),
    })
  } catch {
    return null
  }
}

async function executableQualificationCurrent(config: ValidatedConfig): Promise<boolean> {
  try {
    return await isC5BExecutableQualificationCurrent(config.executableQualification, {
      pgDumpExecutable: config.pgDumpExecutable,
      pgRestoreExecutable: config.pgRestoreExecutable,
      ageExecutable: config.ageExecutable,
      observedAt: config.now(),
    })
  } catch {
    return false
  }
}

function validateProcess(processValue: C5BPipelineProcess): boolean {
  return !!processValue && absolutePath(processValue.executable) && Array.isArray(processValue.args)
    && processValue.args.every(nonBlank) && validProcessEnvironment(processValue.environment)
}

function validProcessEnvironment(value: unknown): value is Readonly<NodeJS.ProcessEnv> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false
  const environment = value as Record<string, unknown>
  const allowed = new Set([
    'LANG', 'LC_ALL', 'SystemRoot', 'WINDIR', 'PGSERVICEFILE', 'PGPASSFILE', 'PGCONNECT_TIMEOUT',
  ])
  if (Object.keys(environment).some((key) => !allowed.has(key))
    || environment.LANG !== 'C' || environment.LC_ALL !== 'C'
    || Object.values(environment).some((item) => !nonBlank(item))) return false
  const pgKeys = ['PGSERVICEFILE', 'PGPASSFILE', 'PGCONNECT_TIMEOUT'] as const
  const pgCount = pgKeys.filter((key) => key in environment).length
  if (pgCount !== 0 && pgCount !== pgKeys.length) return false
  if (pgCount === pgKeys.length) {
    if (!absolutePath(environment.PGSERVICEFILE) || !absolutePath(environment.PGPASSFILE)) return false
    const timeout = Number(environment.PGCONNECT_TIMEOUT)
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60) return false
  }
  return true
}

function validateExecutionRequest(value: C5BPipelineExecutionRequest): boolean {
  if (!value || typeof value !== 'object' || value.shell !== false
    || !validateProcess(value.source) || !validateProcess(value.sink)
    || !absolutePath(value.cwd)
    || !positiveSafeInteger(value.timeoutMs)
    || !positiveSafeInteger(value.maxOutputBytes)
    || !positiveSafeInteger(value.maxArtifactBytes)) return false
  if (!value.sourceInput || (value.sourceInput.kind !== 'none'
    && (value.sourceInput.kind !== 'file' || !absolutePath(value.sourceInput.path)))) return false
  return !!value.output && (value.output.kind === 'capture'
    || (value.output.kind === 'file' && absolutePath(value.output.path) && value.output.mode === 0o600))
}

function emptyExecution(overrides: Partial<C5BPipelineExecution> = {}): C5BPipelineExecution {
  return Object.freeze({
    ok: false,
    sourceExitCode: null,
    sinkExitCode: null,
    sourceSignal: null,
    sinkSignal: null,
    timedOut: false,
    outputCapped: false,
    byteCount: 0,
    sha256: null,
    capturedOutput: null,
    ...overrides,
  })
}

function taskkillEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { LANG: 'C', LC_ALL: 'C' }
  if (nonBlank(process.env.SystemRoot)) environment.SystemRoot = process.env.SystemRoot
  if (nonBlank(process.env.WINDIR)) environment.WINDIR = process.env.WINDIR
  return environment
}

function defaultTerminateTree(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform): void {
  if (platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
      env: taskkillEnvironment(),
    })
    killer.unref()
    return
  }
  if (platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // Fall through to the direct child without exposing the OS error.
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // The process has already reached a terminal state.
  }
}

export function createNodeC5BPipelineExecutor(
  options: C5BNodePipelineExecutorOptions = {},
): C5BPipelineExecutor {
  const spawnFactory = options.spawnFactory ?? (spawn as unknown as C5BSpawnFactory)
  const platform = options.platform ?? process.platform
  const terminateTree = options.terminateTree ?? defaultTerminateTree

  return Object.freeze({
    execute(request: C5BPipelineExecutionRequest): Promise<C5BPipelineExecution> {
      if (!validateExecutionRequest(request)) return Promise.resolve(emptyExecution())
      return new Promise<C5BPipelineExecution>((resolve) => {
        let source: ChildProcessWithoutNullStreams | null = null
        let sink: ChildProcessWithoutNullStreams
        try {
          const processOptions = {
            cwd: request.cwd,
            shell: false as const,
            windowsHide: true as const,
            detached: platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
          }
          source = spawnFactory(request.source.executable, request.source.args, {
            ...processOptions,
            env: { ...request.source.environment },
          })
          sink = spawnFactory(request.sink.executable, request.sink.args, {
            ...processOptions,
            env: { ...request.sink.environment },
          })
        } catch {
          if (source) {
            try { terminateTree(source, platform) } catch { /* closed result only */ }
          }
          return resolve(emptyExecution())
        }
        if (!source) return resolve(emptyExecution())

        let sourceExitCode: number | null = null
        let sinkExitCode: number | null = null
        let sourceSignal: string | null = null
        let sinkSignal: string | null = null
        let sourceClosed = false
        let sinkClosed = false
        let outputFinished = false
        let timedOut = false
        let outputCapped = false
        let streamFailed = false
        let settled = false
        let diagnosticBytes = 0
        let byteCount = 0
        const outputHash = createHash('sha256')
        const captured: Buffer[] = []
        const terminated = new Set<ChildProcessWithoutNullStreams>()

        const terminate = (child: ChildProcessWithoutNullStreams): void => {
          if (terminated.has(child)) return
          terminated.add(child)
          try { terminateTree(child, platform) } catch { /* closed result only */ }
        }
        const terminateBoth = (): void => {
          terminate(source)
          terminate(sink)
        }
        const cap = (): void => {
          if (outputCapped) return
          outputCapped = true
          terminateBoth()
        }
        const addDiagnostic = (data: Buffer): void => {
          diagnosticBytes += data.length
          if (diagnosticBytes > request.maxOutputBytes) cap()
        }
        const finish = (): void => {
          if (settled || !sourceClosed || !sinkClosed || !outputFinished) return
          settled = true
          clearTimeout(timer)
          const capturedOutput = request.output.kind === 'capture' ? Buffer.concat(captured).toString('utf8') : null
          const digest = byteCount > 0 || request.output.kind === 'capture' ? outputHash.digest('hex') : null
          const ok = !timedOut && !outputCapped && !streamFailed
            && sourceExitCode === 0 && sinkExitCode === 0 && sourceSignal === null && sinkSignal === null
          resolve(Object.freeze({
            ok,
            sourceExitCode,
            sinkExitCode,
            sourceSignal,
            sinkSignal,
            timedOut,
            outputCapped,
            byteCount,
            sha256: digest,
            capturedOutput,
          }))
        }
        const failStream = (): void => {
          streamFailed = true
          terminateBoth()
        }
        const timer = setTimeout(() => {
          timedOut = true
          terminateBoth()
        }, request.timeoutMs)

        source.stderr.on('data', (data: Buffer) => addDiagnostic(Buffer.from(data)))
        sink.stderr.on('data', (data: Buffer) => addDiagnostic(Buffer.from(data)))
        source.once('error', failStream)
        sink.once('error', failStream)
        source.once('close', (code, signal) => {
          sourceExitCode = code
          sourceSignal = signal
          sourceClosed = true
          if (code !== 0 || signal !== null) terminate(sink)
          finish()
        })
        sink.once('close', (code, signal) => {
          sinkExitCode = code
          sinkSignal = signal
          sinkClosed = true
          if (code !== 0 || signal !== null) terminate(source)
          finish()
        })

        source.stdout.pipe(sink.stdin)
        source.stdout.once('error', failStream)
        sink.stdin.once('error', failStream)

        if (request.sourceInput.kind === 'none') {
          source.stdin.end()
        } else {
          const input = createReadStream(request.sourceInput.path)
          input.once('error', failStream)
          source.stdin.once('error', failStream)
          input.pipe(source.stdin)
        }

        if (request.output.kind === 'capture') {
          sink.stdout.on('data', (data: Buffer) => {
            const chunk = Buffer.from(data)
            byteCount += chunk.length
            diagnosticBytes += chunk.length
            if (diagnosticBytes > request.maxOutputBytes) {
              cap()
              return
            }
            outputHash.update(chunk)
            captured.push(chunk)
          })
          sink.stdout.once('error', failStream)
          sink.stdout.once('end', () => {
            outputFinished = true
            finish()
          })
        } else {
          const output = createWriteStream(request.output.path, { flags: 'wx', mode: request.output.mode })
          output.once('error', () => {
            outputFinished = true
            failStream()
            finish()
          })
          output.once('finish', () => {
            outputFinished = true
            finish()
          })
          sink.stdout.on('data', (data: Buffer) => {
            const chunk = Buffer.from(data)
            byteCount += chunk.length
            if (byteCount > request.maxArtifactBytes) {
              cap()
              return
            }
            outputHash.update(chunk)
          })
          sink.stdout.once('error', failStream)
          sink.stdout.pipe(output)
        }
      })
    },
  })
}

function frozenDecision(status: 'passed', evidence: Record<string, unknown>): C5BPortDecision
function frozenDecision(status: 'refused', reasonCode: 'logical_backup_invalid' | 'restore_invalid'): C5BPortDecision
function frozenDecision(
  status: 'passed' | 'refused',
  value: Record<string, unknown> | 'logical_backup_invalid' | 'restore_invalid',
): C5BPortDecision {
  if (status === 'passed') return Object.freeze({ status, evidence: Object.freeze({ ...(value as Record<string, unknown>) }) })
  return Object.freeze({ status, reasonCode: value as 'logical_backup_invalid' | 'restore_invalid' })
}

function expectedContext(
  value: C5BOperatorContext,
  nextOperation: 'create_encrypted_logical_backup' | 'restore_isolated_backup',
): { packet: C5BPreflightPacket; context: C5BOperatorContext } | null {
  try {
    if (!value || typeof value !== 'object' || !Array.isArray(value.receipts)) return null
    const packet = validateC5BPreflightPacket(value.packet)
    const prefix = evaluateC5BPreflightPrefix(packet, value.receipts)
    if (!prefix.ok || prefix.statusCode !== 'continue' || prefix.nextOperation !== nextOperation) return null
    return { packet, context: value }
  } catch {
    return null
  }
}

function executionPassed(value: C5BPipelineExecution): boolean {
  return !!value && value.ok === true && value.sourceExitCode === 0 && value.sinkExitCode === 0
    && value.sourceSignal === null && value.sinkSignal === null && value.timedOut === false
    && value.outputCapped === false
}

async function hashFile(filePath: string, maximumBytes: number): Promise<{ byteCount: number; sha256: string } | null> {
  try {
    const metadata = await stat(filePath)
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > maximumBytes) return null
    const hash = createHash('sha256')
    let byteCount = 0
    const input = createReadStream(filePath)
    for await (const chunkValue of input) {
      const chunk = Buffer.from(chunkValue)
      byteCount += chunk.length
      if (byteCount > maximumBytes) {
        input.destroy()
        return null
      }
      hash.update(chunk)
    }
    return { byteCount, sha256: hash.digest('hex') }
  } catch {
    return null
  }
}

function safeRemove(filePath: string): boolean {
  try {
    if (existsSync(filePath)) rmSync(filePath, { force: true })
    return !existsSync(filePath)
  } catch {
    return false
  }
}

function protectedDestinationReady(destination: string): boolean {
  try {
    return statSync(destination).isDirectory() && sameNativePath(realpathSync.native(destination), destination)
  } catch {
    return false
  }
}

function publishWithoutClobber(temporary: string, final: string): boolean {
  try {
    linkSync(temporary, final)
    if (!safeRemove(temporary)) {
      safeRemove(final)
      return false
    }
    return existsSync(final) && !existsSync(temporary)
  } catch {
    safeRemove(temporary)
    return false
  }
}

function immediateArtifactPaths(config: ValidatedConfig, attemptId: string): { temporary: string; final: string } | null {
  const temporary = path.resolve(config.destinationDirectory, `${attemptId}.dump.age.partial`)
  const final = path.resolve(config.destinationDirectory, `${attemptId}.dump.age`)
  if (path.dirname(temporary) !== config.destinationDirectory || path.dirname(final) !== config.destinationDirectory) return null
  return { temporary, final }
}

function boundedExpiry(config: ValidatedConfig): string | null {
  try {
    const observed = config.now()
    const observedMs = typeof observed === 'string' ? Date.parse(observed) : Number.NaN
    if (!Number.isFinite(observedMs)) return null
    const expiresMs = observedMs + config.retentionMs
    if (!Number.isSafeInteger(expiresMs) || expiresMs <= observedMs) return null
    return new Date(expiresMs).toISOString()
  } catch {
    return null
  }
}

export function createC5BLogicalBackupNodePorts(
  configValue: C5BLogicalBackupNodeConfig,
  executor: C5BPipelineExecutor = createNodeC5BPipelineExecutor(),
): C5BLogicalBackupNodePorts {
  const config = validateConfig(configValue)
  if (!executor || typeof executor.execute !== 'function') configurationRefused()
  const bindings = new Map<string, ArtifactBinding>()
  const inFlight = new Set<string>()

  return Object.freeze({
    async createEncryptedLogicalBackup(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const validated = expectedContext(contextValue, 'create_encrypted_logical_backup')
      if (!validated || validated.packet.destinationCapabilityId !== config.destinationCapabilityId
        || bindings.has(validated.packet.packetHash) || inFlight.has(validated.packet.packetHash)) {
        return frozenDecision('refused', 'logical_backup_invalid')
      }
      const materialEnvironments = await connectionMaterialEnvironments(config)
      if (!materialEnvironments) return frozenDecision('refused', 'logical_backup_invalid')
      if (!await executableQualificationCurrent(config)) {
        return frozenDecision('refused', 'logical_backup_invalid')
      }
      const paths = immediateArtifactPaths(config, validated.packet.attemptId)
      const expiresAt = boundedExpiry(config)
      if (!paths || !expiresAt) return frozenDecision('refused', 'logical_backup_invalid')

      inFlight.add(validated.packet.packetHash)
      try {
        if (!protectedDestinationReady(config.destinationDirectory)) {
          return frozenDecision('refused', 'logical_backup_invalid')
        }
        if (existsSync(paths.temporary) || existsSync(paths.final)) {
          return frozenDecision('refused', 'logical_backup_invalid')
        }
        const timeoutMs = Math.min(config.timeoutMs, validated.packet.limits.maxStepDurationMs)
        const backup = await executor.execute({
          source: {
            executable: config.pgDumpExecutable,
            args: [`--dbname=service=${config.sourceServiceCapability}`, '--format=custom', '--no-password'],
            environment: materialEnvironments.sourcePostgresql,
          },
          sink: {
            executable: config.ageExecutable,
            args: ['--encrypt', '--recipients-file', config.recipientsFile],
            environment: materialEnvironments.age,
          },
          sourceInput: { kind: 'none' },
          output: { kind: 'file', path: paths.temporary, mode: 0o600 },
          cwd: config.destinationDirectory,
          timeoutMs,
          maxOutputBytes: config.maxOutputBytes,
          maxArtifactBytes: validated.packet.limits.maxBackupBytes,
          shell: false,
        })
        if (!executionPassed(backup) || backup.capturedOutput !== null || !HASH.test(backup.sha256 ?? '')) {
          safeRemove(paths.temporary)
          return frozenDecision('refused', 'logical_backup_invalid')
        }
        const observed = await hashFile(paths.temporary, validated.packet.limits.maxBackupBytes)
        if (!observed || observed.byteCount !== backup.byteCount || observed.sha256 !== backup.sha256) {
          safeRemove(paths.temporary)
          return frozenDecision('refused', 'logical_backup_invalid')
        }

        const manifest = await executor.execute({
          source: {
            executable: config.ageExecutable,
            args: ['--decrypt', '--identity', config.identityFile],
            environment: materialEnvironments.age,
          },
          sink: {
            executable: config.pgRestoreExecutable,
            args: ['--list'],
            environment: materialEnvironments.isolatedPostgresql,
          },
          sourceInput: { kind: 'file', path: paths.temporary },
          output: { kind: 'capture' },
          cwd: config.destinationDirectory,
          timeoutMs,
          maxOutputBytes: config.maxOutputBytes,
          maxArtifactBytes: validated.packet.limits.maxBackupBytes,
          shell: false,
        })
        if (!executionPassed(manifest) || typeof manifest.capturedOutput !== 'string'
          || manifest.capturedOutput.length === 0 || manifest.byteCount !== Buffer.byteLength(manifest.capturedOutput)
          || manifest.sha256 !== createHash('sha256').update(manifest.capturedOutput).digest('hex')) {
          safeRemove(paths.temporary)
          return frozenDecision('refused', 'logical_backup_invalid')
        }

        if (!publishWithoutClobber(paths.temporary, paths.final)) {
          return frozenDecision('refused', 'logical_backup_invalid')
        }
        const binding: ArtifactBinding = {
          packetHash: validated.packet.packetHash,
          attemptId: validated.packet.attemptId,
          path: paths.final,
          byteCount: observed.byteCount,
          backupSha256: observed.sha256,
          manifestSha256: manifest.sha256,
          expiresAt,
          restored: false,
        }
        bindings.set(validated.packet.packetHash, binding)
        return frozenDecision('passed', {
          encrypted: true,
          byteCount: binding.byteCount,
          backupSha256: binding.backupSha256,
          manifestSha256: binding.manifestSha256,
          expiresAt: binding.expiresAt,
        })
      } catch {
        safeRemove(paths.temporary)
        return frozenDecision('refused', 'logical_backup_invalid')
      } finally {
        inFlight.delete(validated.packet.packetHash)
      }
    },

    async restoreIsolatedBackup(contextValue: C5BOperatorContext): Promise<C5BPortDecision> {
      const validated = expectedContext(contextValue, 'restore_isolated_backup')
      if (!validated || validated.packet.destinationCapabilityId !== config.destinationCapabilityId) {
        return frozenDecision('refused', 'restore_invalid')
      }
      const materialEnvironments = await connectionMaterialEnvironments(config)
      if (!materialEnvironments) return frozenDecision('refused', 'restore_invalid')
      if (!await executableQualificationCurrent(config)) {
        return frozenDecision('refused', 'restore_invalid')
      }
      const binding = bindings.get(validated.packet.packetHash)
      const backupReceipt = validated.context.receipts[validated.context.receipts.length - 1]
      const backupEvidence = backupReceipt?.evidence
      if (!binding || binding.restored || binding.packetHash !== validated.packet.packetHash
        || binding.attemptId !== validated.packet.attemptId || !backupEvidence
        || backupEvidence.backupSha256 !== binding.backupSha256
        || backupEvidence.manifestSha256 !== binding.manifestSha256
        || backupEvidence.byteCount !== binding.byteCount) {
        return frozenDecision('refused', 'restore_invalid')
      }
      const observed = await hashFile(binding.path, validated.packet.limits.maxBackupBytes)
      if (!observed || observed.byteCount !== binding.byteCount || observed.sha256 !== binding.backupSha256) {
        return frozenDecision('refused', 'restore_invalid')
      }
      try {
        const restored = await executor.execute({
          source: {
            executable: config.ageExecutable,
            args: ['--decrypt', '--identity', config.identityFile],
            environment: materialEnvironments.age,
          },
          sink: {
            executable: config.pgRestoreExecutable,
            args: [
              `--dbname=service=${config.isolatedServiceCapability}`,
              '--exit-on-error',
              '--single-transaction',
              '--no-password',
            ],
            environment: materialEnvironments.isolatedPostgresql,
          },
          sourceInput: { kind: 'file', path: binding.path },
          output: { kind: 'capture' },
          cwd: config.destinationDirectory,
          timeoutMs: Math.min(config.timeoutMs, validated.packet.limits.maxStepDurationMs),
          maxOutputBytes: config.maxOutputBytes,
          maxArtifactBytes: validated.packet.limits.maxBackupBytes,
          shell: false,
        })
        if (!executionPassed(restored)) return frozenDecision('refused', 'restore_invalid')
        binding.restored = true
        return frozenDecision('passed', {
          restored: true,
          isolated: true,
          sourceBackupSha256: binding.backupSha256,
          restoreManifestSha256: binding.manifestSha256,
        })
      } catch {
        return frozenDecision('refused', 'restore_invalid')
      }
    },
  })
}
