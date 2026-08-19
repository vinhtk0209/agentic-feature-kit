export const CLEAN_CLONE_SCHEMA_VERSION = '1.0.0' as const
export const CLEAN_CLONE_PLATFORMS = ['linux', 'windows'] as const
export const CLEAN_CLONE_QUICKSTART_COMMANDS = [
  'npm ci',
  'npm run build:providers',
  'npm run test:provider-distribution',
] as const
export const CLEAN_CLONE_OUTPUT_NAMES = [
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
] as const

export type CleanClonePlatform = typeof CLEAN_CLONE_PLATFORMS[number]
export type CleanCloneCommandId = 'npm-ci' | 'build-providers' | 'test-provider-distribution'

export interface CleanCloneSourceIdentity {
  commit: string
  tree: string
  sourceDateEpoch: number
}

export interface CleanCloneOutput {
  name: string
  bytes: number
  sha256: string
}

export interface CleanCloneCommandReceipt {
  id: CleanCloneCommandId
  exitCode: number
  durationMs: number
  stdoutBytes: number
  stdoutSha256: string
  stderrBytes: number
  stderrSha256: string
}

export interface CleanCloneCloneReceipt {
  clone: 'A' | 'B'
  detachedHead: boolean
  headMatches: boolean
  treeMatches: boolean
  cleanBefore: boolean
  cleanAfter: boolean
  physicalInstall: boolean
  noJunction: boolean
  smokeSentinel: boolean
  admissionStatus: 'admitted'
  outputSetSha256: string
  commands: CleanCloneCommandReceipt[]
}

export interface CleanCloneAdmissionCounts {
  archives: number
  entries: number
  sidecars: number
  checksums: number
  textScans: number
  runtimeSmokes: number
  secretDetectorFamilies: number
}

export interface CleanCloneReceipt {
  schemaVersion: typeof CLEAN_CLONE_SCHEMA_VERSION
  status: 'pass'
  platform: CleanClonePlatform
  source: CleanCloneSourceIdentity
  tools: { node: string; npm: string; git: string }
  quickstart: { commands: string[]; matched: true }
  isolation: { cloneCount: 2; physicalInstalls: true; noJunctions: true; rawLogsPersisted: false }
  admission: CleanCloneAdmissionCounts
  outputs: CleanCloneOutput[]
  clones: CleanCloneCloneReceipt[]
}

export interface CleanCloneAggregateReceipt {
  schemaVersion: typeof CLEAN_CLONE_SCHEMA_VERSION
  status: 'pass'
  source: CleanCloneSourceIdentity
  platforms: CleanClonePlatform[]
  quickstartCommands: string[]
  outputSetSha256: string
  admission: CleanCloneAdmissionCounts
}

export class CleanCloneContractError extends Error {
  readonly code: string

  constructor(code: string) {
    super(`clean-clone-contract:${code}`)
    this.name = 'CleanCloneContractError'
    this.code = code
  }
}

const HASH = /^[0-9a-f]{64}$/
const OBJECT_HASH = /^[0-9a-f]{40}$/
const NODE_VERSION = /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/
const NPM_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/
const GIT_VERSION = /^git version [0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9A-Za-z.-]+)?$/
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024
const MAX_COMMAND_DURATION_MS = 20 * 60 * 1000

function fail(code: string): never {
  throw new CleanCloneContractError(code)
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(code)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) fail(code)
}

function integer(value: unknown, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(code)
  return value as number
}

function hash(value: unknown, code: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) fail(code)
  return value
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateSource(value: unknown): CleanCloneSourceIdentity {
  const source = record(value, 'source-shape')
  exactKeys(source, ['commit', 'tree', 'sourceDateEpoch'], 'source-keys')
  if (typeof source.commit !== 'string' || !OBJECT_HASH.test(source.commit)) fail('source-commit')
  if (typeof source.tree !== 'string' || !OBJECT_HASH.test(source.tree)) fail('source-tree')
  return {
    commit: source.commit,
    tree: source.tree,
    sourceDateEpoch: integer(source.sourceDateEpoch, 1, 253_402_300_799, 'source-epoch'),
  }
}

function validateTools(value: unknown): CleanCloneReceipt['tools'] {
  const tools = record(value, 'tools-shape')
  exactKeys(tools, ['node', 'npm', 'git'], 'tools-keys')
  if (typeof tools.node !== 'string' || !NODE_VERSION.test(tools.node)) fail('tools-node')
  if (typeof tools.npm !== 'string' || !NPM_VERSION.test(tools.npm)) fail('tools-npm')
  if (typeof tools.git !== 'string' || !GIT_VERSION.test(tools.git)) fail('tools-git')
  return { node: tools.node, npm: tools.npm, git: tools.git }
}

function validateQuickstart(value: unknown): CleanCloneReceipt['quickstart'] {
  const quickstart = record(value, 'quickstart-shape')
  exactKeys(quickstart, ['commands', 'matched'], 'quickstart-keys')
  if (!Array.isArray(quickstart.commands) || !same(quickstart.commands, CLEAN_CLONE_QUICKSTART_COMMANDS)) fail('quickstart-commands')
  if (quickstart.matched !== true) fail('quickstart-match')
  return { commands: [...CLEAN_CLONE_QUICKSTART_COMMANDS], matched: true }
}

function validateIsolation(value: unknown): CleanCloneReceipt['isolation'] {
  const isolation = record(value, 'isolation-shape')
  exactKeys(isolation, ['cloneCount', 'physicalInstalls', 'noJunctions', 'rawLogsPersisted'], 'isolation-keys')
  if (isolation.cloneCount !== 2) fail('isolation-clones')
  if (isolation.physicalInstalls !== true) fail('isolation-physical')
  if (isolation.noJunctions !== true) fail('isolation-junction')
  if (isolation.rawLogsPersisted !== false) fail('isolation-logs')
  return { cloneCount: 2, physicalInstalls: true, noJunctions: true, rawLogsPersisted: false }
}

function validateAdmission(value: unknown): CleanCloneAdmissionCounts {
  const admission = record(value, 'admission-shape')
  exactKeys(admission, ['archives', 'entries', 'sidecars', 'checksums', 'textScans', 'runtimeSmokes', 'secretDetectorFamilies'], 'admission-keys')
  const expected: CleanCloneAdmissionCounts = {
    archives: 3,
    entries: 71,
    sidecars: 8,
    checksums: 11,
    textScans: 79,
    runtimeSmokes: 15,
    secretDetectorFamilies: 10,
  }
  for (const [key, count] of Object.entries(expected)) {
    if (admission[key] !== count) fail(`admission-${key}`)
  }
  return expected
}

function validateOutputs(value: unknown): CleanCloneOutput[] {
  if (!Array.isArray(value) || value.length !== CLEAN_CLONE_OUTPUT_NAMES.length) fail('outputs-count')
  const outputs = value.map((candidate, index) => {
    const output = record(candidate, 'output-shape')
    exactKeys(output, ['name', 'bytes', 'sha256'], 'output-keys')
    if (output.name !== CLEAN_CLONE_OUTPUT_NAMES[index]) fail('output-name')
    return {
      name: output.name as string,
      bytes: integer(output.bytes, 1, MAX_OUTPUT_BYTES, 'output-bytes'),
      sha256: hash(output.sha256, 'output-hash'),
    }
  })
  return outputs
}

function validateCommand(value: unknown, expectedId: CleanCloneCommandId): CleanCloneCommandReceipt {
  const command = record(value, 'command-shape')
  exactKeys(command, ['id', 'exitCode', 'durationMs', 'stdoutBytes', 'stdoutSha256', 'stderrBytes', 'stderrSha256'], 'command-keys')
  if (command.id !== expectedId) fail('command-id')
  if (command.exitCode !== 0) fail('command-exit')
  return {
    id: expectedId,
    exitCode: 0,
    durationMs: integer(command.durationMs, 1, MAX_COMMAND_DURATION_MS, 'command-duration'),
    stdoutBytes: integer(command.stdoutBytes, 0, MAX_COMMAND_OUTPUT_BYTES, 'command-stdout-bytes'),
    stdoutSha256: hash(command.stdoutSha256, 'command-stdout-hash'),
    stderrBytes: integer(command.stderrBytes, 0, MAX_COMMAND_OUTPUT_BYTES, 'command-stderr-bytes'),
    stderrSha256: hash(command.stderrSha256, 'command-stderr-hash'),
  }
}

function validateClones(value: unknown): CleanCloneCloneReceipt[] {
  if (!Array.isArray(value) || value.length !== 2) fail('clones-count')
  const expectedIds = ['A', 'B'] as const
  const expectedCommands: CleanCloneCommandId[] = ['npm-ci', 'build-providers', 'test-provider-distribution']
  const clones = value.map((candidate, index) => {
    const clone = record(candidate, 'clone-shape')
    exactKeys(clone, [
      'clone', 'detachedHead', 'headMatches', 'treeMatches', 'cleanBefore', 'cleanAfter',
      'physicalInstall', 'noJunction', 'smokeSentinel', 'admissionStatus', 'outputSetSha256', 'commands',
    ], 'clone-keys')
    if (clone.clone !== expectedIds[index]) fail('clone-id')
    for (const key of ['detachedHead', 'headMatches', 'treeMatches', 'cleanBefore', 'cleanAfter', 'physicalInstall', 'noJunction', 'smokeSentinel'] as const) {
      if (clone[key] !== true) fail(`clone-${key}`)
    }
    if (clone.admissionStatus !== 'admitted') fail('clone-admission')
    if (!Array.isArray(clone.commands) || clone.commands.length !== expectedCommands.length) fail('commands-count')
    const commands = clone.commands
    return {
      clone: expectedIds[index],
      detachedHead: true,
      headMatches: true,
      treeMatches: true,
      cleanBefore: true,
      cleanAfter: true,
      physicalInstall: true,
      noJunction: true,
      smokeSentinel: true,
      admissionStatus: 'admitted' as const,
      outputSetSha256: hash(clone.outputSetSha256, 'clone-output-set'),
      commands: expectedCommands.map((id, commandIndex) => validateCommand(commands[commandIndex], id)),
    }
  })
  if (clones[0].outputSetSha256 !== clones[1].outputSetSha256) fail('clone-output-parity')
  return clones
}

export function validateCleanCloneReceipt(value: unknown): CleanCloneReceipt {
  const receipt = record(value, 'receipt-shape')
  exactKeys(receipt, ['schemaVersion', 'status', 'platform', 'source', 'tools', 'quickstart', 'isolation', 'admission', 'outputs', 'clones'], 'receipt-keys')
  if (receipt.schemaVersion !== CLEAN_CLONE_SCHEMA_VERSION) fail('receipt-version')
  if (receipt.status !== 'pass') fail('receipt-status')
  if (!CLEAN_CLONE_PLATFORMS.includes(receipt.platform as CleanClonePlatform)) fail('receipt-platform')

  const normalized: CleanCloneReceipt = {
    schemaVersion: CLEAN_CLONE_SCHEMA_VERSION,
    status: 'pass',
    platform: receipt.platform as CleanClonePlatform,
    source: validateSource(receipt.source),
    tools: validateTools(receipt.tools),
    quickstart: validateQuickstart(receipt.quickstart),
    isolation: validateIsolation(receipt.isolation),
    admission: validateAdmission(receipt.admission),
    outputs: validateOutputs(receipt.outputs),
    clones: validateClones(receipt.clones),
  }

  const serialized = JSON.stringify(normalized)
  if (/(?:[A-Za-z]:\\|\/(?:tmp|home|Users)\/|file:\/\/|https?:\/\/)/i.test(serialized)) fail('receipt-redaction')
  if (/"[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|SERVICE_ROLE)[A-Z0-9_]*":/.test(serialized)) fail('receipt-redaction')
  return normalized
}

export function aggregateCleanCloneReceipts(receipts: readonly unknown[], matrixResult: unknown): CleanCloneAggregateReceipt {
  if (matrixResult !== 'success') fail('matrix-result')
  if (!Array.isArray(receipts) || receipts.length !== 2) fail('matrix-count')
  const normalized = receipts.map(validateCleanCloneReceipt).sort((left, right) => left.platform.localeCompare(right.platform))
  if (!same(normalized.map((receipt) => receipt.platform), CLEAN_CLONE_PLATFORMS)) fail('matrix-platforms')
  const [linux, windows] = normalized
  if (!same(linux.source, windows.source)) fail('matrix-source')
  if (!same(linux.quickstart.commands, windows.quickstart.commands)) fail('matrix-quickstart')
  if (!same(linux.admission, windows.admission)) fail('matrix-admission')
  if (!same(linux.outputs, windows.outputs)) fail('matrix-outputs')
  if (linux.clones[0].outputSetSha256 !== windows.clones[0].outputSetSha256) fail('matrix-output-set')

  return {
    schemaVersion: CLEAN_CLONE_SCHEMA_VERSION,
    status: 'pass',
    source: linux.source,
    platforms: [...CLEAN_CLONE_PLATFORMS],
    quickstartCommands: [...CLEAN_CLONE_QUICKSTART_COMMANDS],
    outputSetSha256: linux.clones[0].outputSetSha256,
    admission: linux.admission,
  }
}
