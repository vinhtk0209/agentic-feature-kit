#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  CLEAN_CLONE_OUTPUT_NAMES,
  CLEAN_CLONE_QUICKSTART_COMMANDS,
  aggregateCleanCloneReceipts,
  validateCleanCloneReceipt,
  type CleanCloneAdmissionCounts,
  type CleanCloneCommandId,
  type CleanCloneCommandReceipt,
  type CleanCloneOutput,
  type CleanClonePlatform,
  type CleanCloneReceipt,
  type CleanCloneSourceIdentity,
} from './release-clean-clone-contract'
import { validateFinalReleaseCandidate, type FinalReleaseAdmissionReport } from './release-archive-node'

export const CLEAN_CLONE_RECEIPT_SENTINEL = '@@CLEAN_CLONE_RECEIPT@@'
export const CLEAN_CLONE_MATRIX_SENTINEL = '@@CLEAN_CLONE_MATRIX@@'
export const CLEAN_CLONE_SMOKE_SENTINEL = 'build-provider-bundles.test: PASS (3 strict-admitted deterministic archives, 71 entries, 8 schema-valid/secret-clean sidecars, 11 checksums, 79 text scans, 15 clean runtime smokes, shared-core/version/content integrity, 4 attacks)'

const FULL_OBJECT_ID = /^[0-9a-f]{40}$/
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024
const PROCESS_TIMEOUT_MS = 20 * 60 * 1000
const MAX_MATRIX_RECEIPT_BYTES = 1024 * 1024

interface SourceInspection extends CleanCloneSourceIdentity {
  clean: boolean
}

interface CloneInspection {
  commit: string
  tree: string
  detached: boolean
  clean: boolean
  nodeModulesPresent: boolean
  distPresent: boolean
}

interface CommandResult {
  exitCode: number
  durationMs: number
  stdout: Uint8Array
  stderr: Uint8Array
}

interface InstallInspection {
  realPath: string
  physical: boolean
  noJunction: boolean
}

interface CandidateCapture {
  outputs: CleanCloneOutput[]
  admission: Pick<FinalReleaseAdmissionReport,
    'status' | 'archives' | 'archiveEntries' | 'sidecars' | 'checksums' | 'textFiles' | 'secretDetectorFamilies'>
}

export interface CleanCloneQualificationOptions {
  sourceRoot: string
  commit: string
  platform: CleanClonePlatform
}

export interface CleanCloneNodePorts {
  nativePlatform(): CleanClonePlatform | 'unsupported'
  inspectSource(sourceRoot: string): SourceInspection
  toolVersions(): CleanCloneReceipt['tools']
  createTempRoot(): string
  cloneSource(input: { sourceRoot: string; commit: string; tempRoot: string; cloneRoot: string; clone: 'A' | 'B' }): void
  inspectClone(input: { cloneRoot: string; clone: 'A' | 'B'; phase: 'before' | 'after' }): CloneInspection
  runCommand(input: { cloneRoot: string; clone: 'A' | 'B'; id: CleanCloneCommandId; sourceDateEpoch: number }): CommandResult
  inspectInstall(input: { cloneRoot: string; clone: 'A' | 'B' }): InstallInspection
  captureCandidate(input: { cloneRoot: string; clone: 'A' | 'B'; sourceDateEpoch: number }): CandidateCapture
  sha256(bytes: Uint8Array | string): string
  cleanupTempRoot(tempRoot: string): void
}

export type CleanCloneCliOptions =
  | { mode: 'qualify'; sourceRoot: string; commit: string; platform: CleanClonePlatform; outPath: string }
  | { mode: 'matrix'; directory: string }

export interface NpmInvocationRuntime {
  platform: NodeJS.Platform
  nodeExecutable: string
  environment: Readonly<Record<string, string | undefined>>
}

export class CleanCloneNodeError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`clean-clone-node:${code}`)
    this.name = 'CleanCloneNodeError'
    this.code = code
  }
}

function fail(code: string): never {
  throw new CleanCloneNodeError(code)
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sha256(bytes: Uint8Array | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function outputSetIdentity(outputs: readonly CleanCloneOutput[], digest: CleanCloneNodePorts['sha256']): string {
  return digest(`${outputs.map((entry) => `${entry.name}\0${entry.bytes}\0${entry.sha256}`).join('\n')}\n`)
}

function assertSource(inspection: SourceInspection, commit: string, code: string): void {
  if (!FULL_OBJECT_ID.test(inspection.commit) || inspection.commit !== commit) fail(`${code}-commit`)
  if (!FULL_OBJECT_ID.test(inspection.tree)) fail(`${code}-tree`)
  if (!Number.isSafeInteger(inspection.sourceDateEpoch) || inspection.sourceDateEpoch < 1) fail(`${code}-epoch`)
  if (!inspection.clean) fail(`${code}-dirty`)
}

function commandReceipt(id: CleanCloneCommandId, result: CommandResult, digest: CleanCloneNodePorts['sha256']): CleanCloneCommandReceipt {
  if (result.exitCode !== 0) fail(`command-${id}-exit`)
  if (!Number.isSafeInteger(result.durationMs) || result.durationMs < 1 || result.durationMs > PROCESS_TIMEOUT_MS) fail(`command-${id}-duration`)
  if (!(result.stdout instanceof Uint8Array) || result.stdout.byteLength > MAX_PROCESS_OUTPUT_BYTES) fail(`command-${id}-stdout`)
  if (!(result.stderr instanceof Uint8Array) || result.stderr.byteLength > MAX_PROCESS_OUTPUT_BYTES) fail(`command-${id}-stderr`)
  return {
    id,
    exitCode: 0,
    durationMs: result.durationMs,
    stdoutBytes: result.stdout.byteLength,
    stdoutSha256: digest(result.stdout),
    stderrBytes: result.stderr.byteLength,
    stderrSha256: digest(result.stderr),
  }
}

function smokeSentinelPresent(bytes: Uint8Array): boolean {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return false
  }
  return text.split(CLEAN_CLONE_SMOKE_SENTINEL).length - 1 === 1
}

function admissionCounts(candidate: CandidateCapture): CleanCloneAdmissionCounts {
  const admission = candidate.admission
  if (admission.status !== 'admitted') fail('candidate-admission')
  return {
    archives: admission.archives,
    entries: admission.archiveEntries,
    sidecars: admission.sidecars,
    checksums: admission.checksums,
    textScans: admission.textFiles,
    runtimeSmokes: 15,
    secretDetectorFamilies: admission.secretDetectorFamilies,
  }
}

export function qualifyCleanClones(
  options: CleanCloneQualificationOptions,
  ports: CleanCloneNodePorts = createDefaultCleanCloneNodePorts(),
): CleanCloneReceipt {
  if (!FULL_OBJECT_ID.test(options.commit)) fail('option-commit')
  if (!['linux', 'windows'].includes(options.platform)) fail('option-platform')
  if (ports.nativePlatform() !== options.platform) fail('native-platform')

  const sourceStart = ports.inspectSource(options.sourceRoot)
  assertSource(sourceStart, options.commit, 'source-start')
  const tools = ports.toolVersions()
  let tempRoot: string | undefined
  let receipt: CleanCloneReceipt | undefined
  let pendingError: unknown

  try {
    tempRoot = ports.createTempRoot()
    const cloneReceipts: CleanCloneReceipt['clones'] = []
    const installRealPaths: string[] = []
    const candidateOutputs: CleanCloneOutput[][] = []
    const candidateAdmissions: CleanCloneAdmissionCounts[] = []

    for (const clone of ['A', 'B'] as const) {
      const cloneRoot = path.join(tempRoot, `clone-${clone}`)
      ports.cloneSource({ sourceRoot: options.sourceRoot, commit: options.commit, tempRoot, cloneRoot, clone })
      const before = ports.inspectClone({ cloneRoot, clone, phase: 'before' })
      if (before.commit !== options.commit || before.tree !== sourceStart.tree) fail(`clone-${clone}-identity-before`)
      if (!before.detached || !before.clean) fail(`clone-${clone}-state-before`)
      if (before.nodeModulesPresent || before.distPresent) fail(`clone-${clone}-inherited-output`)

      const npmCi = ports.runCommand({ cloneRoot, clone, id: 'npm-ci', sourceDateEpoch: sourceStart.sourceDateEpoch })
      const npmCiReceipt = commandReceipt('npm-ci', npmCi, ports.sha256)
      const install = ports.inspectInstall({ cloneRoot, clone })
      if (!install.physical || !install.noJunction || typeof install.realPath !== 'string' || install.realPath.length === 0) fail(`clone-${clone}-install`)
      installRealPaths.push(install.realPath)

      const build = ports.runCommand({ cloneRoot, clone, id: 'build-providers', sourceDateEpoch: sourceStart.sourceDateEpoch })
      const buildReceipt = commandReceipt('build-providers', build, ports.sha256)
      const distribution = ports.runCommand({ cloneRoot, clone, id: 'test-provider-distribution', sourceDateEpoch: sourceStart.sourceDateEpoch })
      const distributionReceipt = commandReceipt('test-provider-distribution', distribution, ports.sha256)
      if (!smokeSentinelPresent(distribution.stdout)) fail(`clone-${clone}-smoke-sentinel`)

      const after = ports.inspectClone({ cloneRoot, clone, phase: 'after' })
      if (after.commit !== options.commit || after.tree !== sourceStart.tree) fail(`clone-${clone}-identity-after`)
      if (!after.detached || !after.clean || !after.nodeModulesPresent || !after.distPresent) fail(`clone-${clone}-state-after`)

      const candidate = ports.captureCandidate({ cloneRoot, clone, sourceDateEpoch: sourceStart.sourceDateEpoch })
      const admission = admissionCounts(candidate)
      const identity = outputSetIdentity(candidate.outputs, ports.sha256)
      candidateOutputs.push(candidate.outputs)
      candidateAdmissions.push(admission)
      cloneReceipts.push({
        clone,
        detachedHead: true,
        headMatches: true,
        treeMatches: true,
        cleanBefore: true,
        cleanAfter: true,
        physicalInstall: true,
        noJunction: true,
        smokeSentinel: true,
        admissionStatus: 'admitted',
        outputSetSha256: identity,
        commands: [npmCiReceipt, buildReceipt, distributionReceipt],
      })
    }

    const leftInstall = options.platform === 'windows' ? installRealPaths[0].toLowerCase() : installRealPaths[0]
    const rightInstall = options.platform === 'windows' ? installRealPaths[1].toLowerCase() : installRealPaths[1]
    if (leftInstall === rightInstall) fail('install-realpath-parity')
    if (!same(candidateOutputs[0], candidateOutputs[1])) fail('candidate-output-parity')
    if (!same(candidateAdmissions[0], candidateAdmissions[1])) fail('candidate-admission-parity')

    const sourceEnd = ports.inspectSource(options.sourceRoot)
    assertSource(sourceEnd, options.commit, 'source-end')
    if (!same(sourceStart, sourceEnd)) fail('source-transition')

    receipt = validateCleanCloneReceipt({
      schemaVersion: '1.0.0',
      status: 'pass',
      platform: options.platform,
      source: {
        commit: sourceStart.commit,
        tree: sourceStart.tree,
        sourceDateEpoch: sourceStart.sourceDateEpoch,
      },
      tools,
      quickstart: { commands: [...CLEAN_CLONE_QUICKSTART_COMMANDS], matched: true },
      isolation: { cloneCount: 2, physicalInstalls: true, noJunctions: true, rawLogsPersisted: false },
      admission: candidateAdmissions[0],
      outputs: candidateOutputs[0],
      clones: cloneReceipts,
    })
  } catch (error) {
    pendingError = error
  }

  if (tempRoot !== undefined) {
    try {
      ports.cleanupTempRoot(tempRoot)
    } catch {
      fail('cleanup')
    }
  }
  if (pendingError !== undefined) throw pendingError
  if (!receipt) fail('receipt-missing')
  return receipt
}

function minimalChildEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const allowed = [
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC', 'WINDIR', 'windir',
    'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'PROGRAMFILES',
    'ProgramFiles(x86)', 'PROGRAMFILES(X86)', 'ProgramW6432', 'CI',
  ]
  const environment: NodeJS.ProcessEnv = {}
  for (const key of allowed) {
    const value = process.env[key]
    if (value !== undefined) environment[key] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (/(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE)/i.test(key)) fail('child-env-credential')
    environment[key] = value
  }
  return environment
}

function runProcess(command: string, args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv, timeout = PROCESS_TIMEOUT_MS): CommandResult {
  const started = Date.now()
  const result = spawnSync(command, [...args], {
    cwd,
    env: environment,
    encoding: null,
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
    timeout,
    windowsHide: true,
    shell: false,
  })
  const durationMs = Math.max(1, Date.now() - started)
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ETIMEDOUT' || code === 'ENOBUFS') fail(code === 'ETIMEDOUT' ? 'process-timeout' : 'process-output-bound')
    fail('process-spawn')
  }
  if (result.signal !== null || result.status === null) fail('process-termination')
  return {
    exitCode: result.status,
    durationMs,
    stdout: result.stdout instanceof Uint8Array ? result.stdout : new Uint8Array(),
    stderr: result.stderr instanceof Uint8Array ? result.stderr : new Uint8Array(),
  }
}

function checkedText(command: string, args: readonly string[], cwd: string, code: string): string {
  const result = runProcess(command, args, cwd, minimalChildEnvironment(), 2 * 60 * 1000)
  if (result.exitCode !== 0) fail(code)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(result.stdout).trim()
  } catch {
    fail(code)
  }
}

function ordinaryDirectory(directory: string, code: string): string {
  const resolved = path.resolve(directory)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(resolved)
  } catch {
    fail(code)
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code)
  return fs.realpathSync.native(resolved)
}

function emptyConfigFile(file: string, code: string): string {
  const resolved = path.resolve(file)
  try {
    const stat = fs.lstatSync(resolved)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 1) fail(code)
    const bytes = fs.readFileSync(resolved)
    if (bytes.length !== 1 || bytes[0] !== 0x0a) fail(code)
    return fs.realpathSync.native(resolved)
  } catch {
    fail(code)
  }
}

function inspectRepository(repositoryRoot: string): SourceInspection {
  const root = ordinaryDirectory(repositoryRoot, 'source-directory')
  const commit = checkedText('git', ['rev-parse', 'HEAD'], root, 'source-head')
  const tree = checkedText('git', ['show', '-s', '--format=%T', 'HEAD'], root, 'source-tree')
  const epochText = checkedText('git', ['show', '-s', '--format=%ct', 'HEAD'], root, 'source-epoch')
  const status = checkedText('git', ['status', '--porcelain=v1', '-uall'], root, 'source-status')
  const sourceDateEpoch = Number(epochText)
  return { commit, tree, sourceDateEpoch, clean: status.length === 0 }
}

function inspectCloneRepository(cloneRoot: string): CloneInspection {
  const root = ordinaryDirectory(cloneRoot, 'clone-directory')
  const commit = checkedText('git', ['rev-parse', 'HEAD'], root, 'clone-head')
  const tree = checkedText('git', ['show', '-s', '--format=%T', 'HEAD'], root, 'clone-tree')
  const branch = checkedText('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root, 'clone-branch')
  const status = checkedText('git', ['status', '--porcelain=v1', '-uall'], root, 'clone-status')
  return {
    commit,
    tree,
    detached: branch === 'HEAD',
    clean: status.length === 0,
    nodeModulesPresent: fs.existsSync(path.join(root, 'node_modules')),
    distPresent: fs.existsSync(path.join(root, 'dist')),
  }
}

export function resolveNpmInvocation(
  args: readonly string[],
  runtime: NpmInvocationRuntime = {
    platform: process.platform,
    nodeExecutable: process.execPath,
    environment: process.env,
  },
): { command: string; args: string[] } {
  if (runtime.platform !== 'win32') return { command: 'npm', args: [...args] }
  if (!path.isAbsolute(runtime.nodeExecutable)) fail('npm-node-executable')

  let nodeExecutable: string
  try {
    const nodeStat = fs.lstatSync(runtime.nodeExecutable)
    if (!nodeStat.isFile() || nodeStat.isSymbolicLink()) fail('npm-node-executable')
    nodeExecutable = fs.realpathSync.native(runtime.nodeExecutable)
  } catch {
    fail('npm-node-executable')
  }

  const candidates = [
    runtime.environment.npm_execpath,
    path.join(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate) || path.basename(candidate).toLowerCase() !== 'npm-cli.js') continue
    try {
      const stat = fs.lstatSync(candidate)
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      const npmCli = fs.realpathSync.native(candidate)
      if (path.basename(npmCli).toLowerCase() !== 'npm-cli.js') continue
      return { command: nodeExecutable, args: [npmCli, ...args] }
    } catch {
      continue
    }
  }
  fail('npm-cli-executable')
}

function checkedNpmText(args: readonly string[], cwd: string, code: string): string {
  const invocation = resolveNpmInvocation(args)
  return checkedText(invocation.command, invocation.args, cwd, code)
}

function runNpmProcess(args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv): CommandResult {
  const invocation = resolveNpmInvocation(args)
  return runProcess(invocation.command, invocation.args, cwd, environment)
}

function safeNpmEnvironment(cloneRoot: string, sourceDateEpoch: number): NodeJS.ProcessEnv {
  const tempRoot = path.dirname(cloneRoot)
  const userConfigPath = emptyConfigFile(path.join(tempRoot, 'empty-user.npmrc'), 'npm-user-config')
  const globalConfigPath = emptyConfigFile(path.join(tempRoot, 'empty-global.npmrc'), 'npm-global-config')
  const left = process.platform === 'win32' ? userConfigPath.toLowerCase() : userConfigPath
  const right = process.platform === 'win32' ? globalConfigPath.toLowerCase() : globalConfigPath
  if (left === right) fail('npm-config-identity')
  return minimalChildEnvironment({
    SOURCE_DATE_EPOCH: String(sourceDateEpoch),
    NPM_CONFIG_USERCONFIG: userConfigPath,
    NPM_CONFIG_GLOBALCONFIG: globalConfigPath,
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
  })
}

function commandArgs(id: CleanCloneCommandId): string[] {
  if (id === 'npm-ci') return ['ci']
  if (id === 'build-providers') return ['run', 'build:providers']
  return ['run', 'test:provider-distribution']
}

export function captureReleaseOutputs(releaseRoot: string): CleanCloneOutput[] {
  const root = ordinaryDirectory(releaseRoot, 'release-directory')
  const directories: string[] = []
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail('release-entry')
    if (entry.isDirectory()) directories.push(entry.name)
    else if (entry.isFile()) files.push(entry.name)
    else fail('release-entry')
  }
  directories.sort()
  files.sort()
  if (!same(directories, ['claude', 'codex', 'copilot'])) fail('release-directory-set')
  if (!same(files, CLEAN_CLONE_OUTPUT_NAMES)) fail('release-output-set')
  return CLEAN_CLONE_OUTPUT_NAMES.map((name) => {
    const file = path.join(root, name)
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 512 * 1024 * 1024) fail('release-output-file')
    return { name, bytes: stat.size, sha256: sha256(fs.readFileSync(file)) }
  })
}

function assertDirectOwnedTempRoot(tempRoot: string): string {
  const resolved = path.resolve(tempRoot)
  const tempParent = fs.realpathSync.native(path.resolve(os.tmpdir()))
  if (!path.basename(resolved).startsWith('agentic-r5d-')) fail('temp-name')
  if (path.resolve(path.dirname(resolved)).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()) fail('temp-parent')
  const stat = fs.lstatSync(resolved)
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('temp-type')
  const real = fs.realpathSync.native(resolved)
  if (path.dirname(real).toLowerCase() !== tempParent.toLowerCase()) fail('temp-realpath')
  return real
}

export function createDefaultCleanCloneNodePorts(): CleanCloneNodePorts {
  return {
    nativePlatform: () => process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : 'unsupported',
    inspectSource: inspectRepository,
    toolVersions: () => ({
      node: process.version,
      npm: checkedNpmText(['--version'], process.cwd(), 'npm-version'),
      git: checkedText('git', ['--version'], process.cwd(), 'git-version'),
    }),
    createTempRoot: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-r5d-'))
      try {
        fs.writeFileSync(path.join(root, 'empty-user.npmrc'), '\n', { encoding: 'utf8', flag: 'wx' })
        fs.writeFileSync(path.join(root, 'empty-global.npmrc'), '\n', { encoding: 'utf8', flag: 'wx' })
        return root
      } catch {
        fs.rmSync(root, { recursive: true, force: true })
        fail('temp-config')
      }
    },
    cloneSource: ({ sourceRoot, commit, tempRoot, cloneRoot }) => {
      assertDirectOwnedTempRoot(tempRoot)
      if (path.dirname(path.resolve(cloneRoot)).toLowerCase() !== path.resolve(tempRoot).toLowerCase()) fail('clone-parent')
      if (fs.existsSync(cloneRoot)) fail('clone-exists')
      const cloneResult = runProcess('git', ['clone', '--local', '--no-hardlinks', '--no-checkout', path.resolve(sourceRoot), cloneRoot], tempRoot, minimalChildEnvironment(), 2 * 60 * 1000)
      if (cloneResult.exitCode !== 0) fail('clone-command')
      const checkoutResult = runProcess('git', ['checkout', '--detach', commit], cloneRoot, minimalChildEnvironment(), 2 * 60 * 1000)
      if (checkoutResult.exitCode !== 0) fail('clone-checkout')
    },
    inspectClone: ({ cloneRoot }) => inspectCloneRepository(cloneRoot),
    runCommand: ({ cloneRoot, id, sourceDateEpoch }) => runNpmProcess(
      commandArgs(id),
      ordinaryDirectory(cloneRoot, 'command-clone'),
      safeNpmEnvironment(cloneRoot, sourceDateEpoch),
    ),
    inspectInstall: ({ cloneRoot }) => {
      const installRoot = path.join(ordinaryDirectory(cloneRoot, 'install-clone'), 'node_modules')
      let stat: fs.Stats
      try {
        stat = fs.lstatSync(installRoot)
      } catch {
        fail('install-missing')
      }
      return {
        realPath: fs.realpathSync.native(installRoot),
        physical: stat.isDirectory(),
        noJunction: !stat.isSymbolicLink(),
      }
    },
    captureCandidate: ({ cloneRoot, sourceDateEpoch }) => {
      const repositoryRoot = ordinaryDirectory(cloneRoot, 'candidate-clone')
      const releaseRoot = path.join(repositoryRoot, 'dist', 'provider-bundles', '0.5.0')
      const admission = validateFinalReleaseCandidate({
        repositoryRoot,
        releaseRoot,
        sourceDateEpoch,
        providerIds: ['codex', 'claude', 'copilot'],
        bundleVersion: '0.5.0',
        sharedCoreVersion: '1.3.0',
        sourceVersion: '3.25.0',
      })
      return { outputs: captureReleaseOutputs(releaseRoot), admission }
    },
    sha256,
    cleanupTempRoot: (tempRoot) => {
      const real = assertDirectOwnedTempRoot(tempRoot)
      fs.rmSync(real, { recursive: true, force: false })
      if (fs.existsSync(real)) fail('cleanup-residue')
    },
  }
}

function exactFlagMap(args: readonly string[], allowed: readonly string[]): Record<string, string> {
  if (args.length !== allowed.length * 2) fail('cli-argument-count')
  const values: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!allowed.includes(flag) || Object.prototype.hasOwnProperty.call(values, flag) || typeof value !== 'string' || value.length === 0) fail('cli-argument')
    values[flag] = value
  }
  if (Object.keys(values).length !== allowed.length) fail('cli-argument-set')
  return values
}

export function parseCleanCloneCliArgs(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): CleanCloneCliOptions {
  const [mode, ...args] = argv
  if (mode === 'qualify') {
    const values = args.length === 0
      ? {
          '--source': environment.CLEAN_CLONE_SOURCE,
          '--commit': environment.CLEAN_CLONE_COMMIT,
          '--platform': environment.CLEAN_CLONE_PLATFORM,
          '--out': environment.CLEAN_CLONE_OUT,
        }
      : exactFlagMap(args, ['--source', '--commit', '--platform', '--out'])
    const sourceRoot = values['--source']
    const commit = values['--commit']
    const platform = values['--platform']
    const outPath = values['--out']
    if (
      typeof sourceRoot !== 'string' || sourceRoot.length === 0
      || typeof commit !== 'string' || commit.length === 0
      || typeof platform !== 'string' || platform.length === 0
      || typeof outPath !== 'string' || outPath.length === 0
    ) fail('cli-environment')
    if (!FULL_OBJECT_ID.test(commit)) fail('cli-commit')
    if (!['linux', 'windows'].includes(platform)) fail('cli-platform')
    if (!outPath.toLowerCase().endsWith('.json')) fail('cli-output')
    return {
      mode,
      sourceRoot,
      commit,
      platform: platform as CleanClonePlatform,
      outPath,
    }
  }
  if (mode === 'matrix') {
    const values = exactFlagMap(args, ['--dir'])
    return { mode, directory: values['--dir'] }
  }
  fail('cli-mode')
}

function readReceiptFile(file: string): unknown {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_MATRIX_RECEIPT_BYTES) fail('matrix-file')
  const text = fs.readFileSync(file, 'utf8')
  if (!text.endsWith('\n') || text.includes('\r')) fail('matrix-encoding')
  try {
    return JSON.parse(text)
  } catch {
    fail('matrix-json')
  }
}

export function loadCleanCloneMatrix(directory: string, matrixResult: unknown) {
  const root = ordinaryDirectory(directory, 'matrix-directory')
  const actual = fs.readdirSync(root, { withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink()) fail('matrix-entry')
      return entry.name
    })
    .sort()
  if (!same(actual, ['linux.json', 'windows.json'])) fail('matrix-files')
  return aggregateCleanCloneReceipts([
    readReceiptFile(path.join(root, 'linux.json')),
    readReceiptFile(path.join(root, 'windows.json')),
  ], matrixResult)
}

function writeReceipt(outPath: string, receipt: CleanCloneReceipt): void {
  const target = path.resolve(outPath)
  if (!target.toLowerCase().endsWith('.json') || fs.existsSync(target)) fail('receipt-output')
  const parent = path.dirname(target)
  fs.mkdirSync(parent, { recursive: true })
  const parentStat = fs.lstatSync(parent)
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail('receipt-parent')
  const temp = path.join(parent, `.${path.basename(target)}.${process.pid}.tmp`)
  try {
    fs.writeFileSync(temp, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temp, target)
  } catch {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true })
    fail('receipt-write')
  }
}

export function runCleanCloneCli(
  argv: readonly string[],
  writeLine: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  writeError: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  ports?: CleanCloneNodePorts,
): number {
  try {
    const options = parseCleanCloneCliArgs(argv, process.env)
    if (options.mode === 'qualify') {
      const receipt = qualifyCleanClones(options, ports ?? createDefaultCleanCloneNodePorts())
      writeReceipt(options.outPath, receipt)
      writeLine(`${CLEAN_CLONE_RECEIPT_SENTINEL}${JSON.stringify(receipt)}`)
    } else {
      const aggregate = loadCleanCloneMatrix(options.directory, process.env.MATRIX_RESULT)
      writeLine(`${CLEAN_CLONE_MATRIX_SENTINEL}${JSON.stringify(aggregate)}`)
    }
    return 0
  } catch (error) {
    const code = error instanceof CleanCloneNodeError ? error.code : 'qualification-failed'
    writeError(`clean-clone qualification failed: ${code}`)
    return 1
  }
}

const launcher = process.argv[1]?.replace(/\\/g, '/') ?? ''
if (require.main === module && /release-clean-clone-node\.(?:ts|js|cjs|mjs)$/.test(launcher)) {
  process.exitCode = runCleanCloneCli(process.argv.slice(2))
}
