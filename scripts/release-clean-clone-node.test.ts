import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CLEAN_CLONE_OUTPUT_NAMES,
  type CleanCloneOutput,
  type CleanClonePlatform,
  type CleanCloneReceipt,
} from './release-clean-clone-contract'
import {
  CLEAN_CLONE_MATRIX_SENTINEL,
  CLEAN_CLONE_RECEIPT_SENTINEL,
  captureReleaseOutputs,
  createDefaultCleanCloneNodePorts,
  loadCleanCloneMatrix,
  parseCleanCloneCliArgs,
  qualifyCleanClones,
  resolveNpmInvocation,
  type CleanCloneNodePorts,
} from './release-clean-clone-node'

const COMMIT = 'c'.repeat(40)
const TREE = 'd'.repeat(40)
const SMOKE_SENTINEL = 'build-provider-bundles.test: PASS (3 strict-admitted deterministic archives, 71 entries, 8 schema-valid/secret-clean sidecars, 11 checksums, 79 text scans, 15 clean runtime smokes, shared-core/version/content integrity, 4 attacks)'

function sha(bytes: Uint8Array | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function outputSet(): CleanCloneOutput[] {
  return [...CLEAN_CLONE_OUTPUT_NAMES].map((name, index) => ({
    name,
    bytes: 2_000 + index,
    sha256: sha(`candidate:${name}`),
  }))
}

interface FakeState {
  calls: string[]
  cleaned: number
  sourceReads: number
}

function fakePorts(overrides: Partial<CleanCloneNodePorts> = {}): { ports: CleanCloneNodePorts; state: FakeState } {
  const state: FakeState = { calls: [], cleaned: 0, sourceReads: 0 }
  const base: CleanCloneNodePorts = {
    nativePlatform: () => 'windows',
    inspectSource: () => {
      state.sourceReads += 1
      return { commit: COMMIT, tree: TREE, sourceDateEpoch: 1_754_000_000, clean: true }
    },
    toolVersions: () => ({ node: 'v24.15.0', npm: '11.8.0', git: 'git version 2.51.0' }),
    createTempRoot: () => 'owned-temp-root',
    cloneSource: ({ clone }) => { state.calls.push(`clone:${clone}`) },
    inspectClone: ({ clone, phase }) => ({
      commit: COMMIT,
      tree: TREE,
      detached: true,
      clean: true,
      nodeModulesPresent: phase === 'after',
      distPresent: phase === 'after',
    }),
    runCommand: ({ clone, id }) => {
      state.calls.push(`run:${clone}:${id}`)
      const stdout = id === 'test-provider-distribution'
        ? new TextEncoder().encode(`${SMOKE_SENTINEL}\n`)
        : new TextEncoder().encode(`${id}:ok\n`)
      return { exitCode: 0, durationMs: 100, stdout, stderr: new Uint8Array() }
    },
    inspectInstall: ({ clone }) => ({ realPath: `physical-install-${clone}`, physical: true, noJunction: true }),
    captureCandidate: ({ clone }) => {
      state.calls.push(`capture:${clone}`)
      return {
        outputs: outputSet(),
        admission: {
          status: 'admitted',
          archives: 3,
          archiveEntries: 71,
          sidecars: 8,
          checksums: 11,
          textFiles: 79,
          secretDetectorFamilies: 10,
        },
      }
    },
    sha256: sha,
    cleanupTempRoot: () => { state.cleaned += 1 },
  }
  return { ports: { ...base, ...overrides }, state }
}

function options(platform: CleanClonePlatform = 'windows') {
  return { sourceRoot: 'source-root', commit: COMMIT, platform }
}

const canonical = fakePorts()
const receipt = qualifyCleanClones(options(), canonical.ports)
assert.equal(receipt.platform, 'windows')
assert.deepEqual(receipt.source, { commit: COMMIT, tree: TREE, sourceDateEpoch: 1_754_000_000 })
assert.equal(receipt.clones.length, 2)
assert.equal(receipt.clones[0].outputSetSha256, receipt.clones[1].outputSetSha256)
assert.deepEqual(canonical.state.calls, [
  'clone:A',
  'run:A:npm-ci',
  'run:A:build-providers',
  'run:A:test-provider-distribution',
  'capture:A',
  'clone:B',
  'run:B:npm-ci',
  'run:B:build-providers',
  'run:B:test-provider-distribution',
  'capture:B',
])
assert.equal(canonical.state.sourceReads, 2)
assert.equal(canonical.state.cleaned, 1)

const attackFactories: Array<[string, (base: CleanCloneNodePorts, state: FakeState) => Partial<CleanCloneNodePorts>]> = [
  ['native platform mismatch', (base) => ({ nativePlatform: () => 'linux' })],
  ['dirty source', (base) => ({ inspectSource: () => ({ ...base.inspectSource(''), clean: false }) })],
  ['source head mismatch', (base) => ({ inspectSource: () => ({ ...base.inspectSource(''), commit: 'e'.repeat(40) }) })],
  ['clone head mismatch', (base) => ({ inspectClone: (input) => ({ ...base.inspectClone(input), commit: 'e'.repeat(40) }) })],
  ['clone attached', (base) => ({ inspectClone: (input) => ({ ...base.inspectClone(input), detached: false }) })],
  ['clone dirty', (base) => ({ inspectClone: (input) => ({ ...base.inspectClone(input), clean: false }) })],
  ['inherited install', (base) => ({ inspectClone: (input) => ({ ...base.inspectClone(input), nodeModulesPresent: true }) })],
  ['junction install', (base) => ({ inspectInstall: (input) => ({ ...base.inspectInstall(input), noJunction: false }) })],
  ['nonphysical install', (base) => ({ inspectInstall: (input) => ({ ...base.inspectInstall(input), physical: false }) })],
  ['same install realpath', () => ({ inspectInstall: () => ({ realPath: 'same-install', physical: true, noJunction: true }) })],
  ['command failed', (base) => ({ runCommand: (input) => ({ ...base.runCommand(input), exitCode: input.id === 'build-providers' ? 1 : 0 }) })],
  ['command timeout shape', (base) => ({ runCommand: (input) => ({ ...base.runCommand(input), durationMs: 0 }) })],
  ['missing smoke sentinel', (base) => ({ runCommand: (input) => ({ ...base.runCommand(input), stdout: new TextEncoder().encode('PASS\n') }) })],
  ['oversized stdout', (base) => ({ runCommand: (input) => ({ ...base.runCommand(input), stdout: new Uint8Array(1_048_577) }) })],
  ['admission drift', (base) => ({ captureCandidate: (input) => ({ ...base.captureCandidate(input), admission: { ...base.captureCandidate(input).admission, archiveEntries: 70 } }) })],
  ['output drift', (base) => ({ captureCandidate: (input) => {
    const candidate = base.captureCandidate(input)
    if (input.clone === 'B') candidate.outputs[0] = { ...candidate.outputs[0], sha256: sha('drift') }
    return candidate
  } })],
  ['source changes during run', (base, state) => ({ inspectSource: (root) => {
    const inspected = base.inspectSource(root)
    return state.sourceReads > 1 ? { ...inspected, tree: 'e'.repeat(40) } : inspected
  } })],
  ['cleanup failure', () => ({ cleanupTempRoot: () => { throw new Error('cleanup-failed') } })],
]

for (const [name, factory] of attackFactories) {
  const candidate = fakePorts()
  const patched = { ...candidate.ports, ...factory(candidate.ports, candidate.state) }
  assert.throws(() => qualifyCleanClones(options(), patched), `${name} attack unexpectedly passed`)
  if (name === 'native platform mismatch' || name === 'dirty source' || name === 'source head mismatch') {
    assert.equal(candidate.state.cleaned, 0, `${name} must fail before temp allocation`)
  } else if (name !== 'cleanup failure') {
    assert.equal(candidate.state.cleaned, 1, `${name} must clean the owned temp root`)
  }
}

assert.deepEqual(parseCleanCloneCliArgs([
  'qualify', '--source', '.', '--commit', COMMIT, '--platform', 'windows', '--out', 'receipt.json',
]), { mode: 'qualify', sourceRoot: '.', commit: COMMIT, platform: 'windows', outPath: 'receipt.json' })
assert.deepEqual(parseCleanCloneCliArgs(['qualify'], {
  CLEAN_CLONE_SOURCE: '.',
  CLEAN_CLONE_COMMIT: COMMIT,
  CLEAN_CLONE_PLATFORM: 'windows',
  CLEAN_CLONE_OUT: 'receipt.json',
}), { mode: 'qualify', sourceRoot: '.', commit: COMMIT, platform: 'windows', outPath: 'receipt.json' })
assert.deepEqual(parseCleanCloneCliArgs(['matrix', '--dir', 'receipts']), { mode: 'matrix', directory: 'receipts' })
for (const argv of [
  [],
  ['qualify'],
  ['qualify', '--source', '.', '--commit', 'short', '--platform', 'windows', '--out', 'receipt.json'],
  ['qualify', '--source', '.', '--commit', COMMIT, '--platform', 'darwin', '--out', 'receipt.json'],
  ['qualify', '--source', '.', '--commit', COMMIT, '--platform', 'windows', '--unknown', 'value'],
  ['matrix'],
  ['matrix', '--dir', 'receipts', '--extra', 'value'],
]) assert.throws(() => parseCleanCloneCliArgs(argv))

const npmRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r5d-npm-runtime-test-'))
try {
  const nodeExecutable = path.join(npmRuntimeRoot, 'node.exe')
  const fallbackCli = path.join(npmRuntimeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const explicitCli = path.join(npmRuntimeRoot, 'explicit', 'npm-cli.js')
  fs.mkdirSync(path.dirname(fallbackCli), { recursive: true })
  fs.mkdirSync(path.dirname(explicitCli), { recursive: true })
  fs.writeFileSync(nodeExecutable, 'node-fixture\n', 'utf8')
  fs.writeFileSync(fallbackCli, 'npm-fallback-fixture\n', 'utf8')
  fs.writeFileSync(explicitCli, 'npm-explicit-fixture\n', 'utf8')

  assert.deepEqual(resolveNpmInvocation(['ci'], {
    platform: 'linux',
    nodeExecutable,
    environment: {},
  }), { command: 'npm', args: ['ci'] })
  assert.deepEqual(resolveNpmInvocation(['--version'], {
    platform: 'win32',
    nodeExecutable,
    environment: { npm_execpath: explicitCli },
  }), { command: fs.realpathSync.native(nodeExecutable), args: [fs.realpathSync.native(explicitCli), '--version'] })
  assert.deepEqual(resolveNpmInvocation(['run', 'build:providers'], {
    platform: 'win32',
    nodeExecutable,
    environment: {},
  }), { command: fs.realpathSync.native(nodeExecutable), args: [fs.realpathSync.native(fallbackCli), 'run', 'build:providers'] })
  assert.throws(() => resolveNpmInvocation(['ci'], {
    platform: 'win32',
    nodeExecutable: 'relative-node.exe',
    environment: {},
  }))
  fs.rmSync(fallbackCli)
  assert.throws(() => resolveNpmInvocation(['ci'], {
    platform: 'win32',
    nodeExecutable,
    environment: { npm_execpath: path.join(npmRuntimeRoot, 'missing', 'npm-cli.js') },
  }))
} finally {
  fs.rmSync(npmRuntimeRoot, { recursive: true, force: true })
}

const defaultPorts = createDefaultCleanCloneNodePorts()
const npmConfigRoot = defaultPorts.createTempRoot()
try {
  assert.deepEqual(fs.readdirSync(npmConfigRoot).sort(), ['empty-global.npmrc', 'empty-user.npmrc'])
  const userConfig = path.join(npmConfigRoot, 'empty-user.npmrc')
  const globalConfig = path.join(npmConfigRoot, 'empty-global.npmrc')
  assert.equal(fs.readFileSync(userConfig, 'utf8'), '\n')
  assert.equal(fs.readFileSync(globalConfig, 'utf8'), '\n')
  assert.notEqual(fs.realpathSync.native(userConfig), fs.realpathSync.native(globalConfig))
} finally {
  defaultPorts.cleanupTempRoot(npmConfigRoot)
}

const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r5d-release-root-test-'))
try {
  for (const provider of ['claude', 'codex', 'copilot']) fs.mkdirSync(path.join(releaseRoot, provider))
  for (const name of CLEAN_CLONE_OUTPUT_NAMES) fs.writeFileSync(path.join(releaseRoot, name), `fixture:${name}\n`, 'utf8')
  assert.deepEqual(captureReleaseOutputs(releaseRoot).map((output) => output.name), [...CLEAN_CLONE_OUTPUT_NAMES])

  fs.mkdirSync(path.join(releaseRoot, 'extra-provider'))
  assert.throws(() => captureReleaseOutputs(releaseRoot))
  fs.rmdirSync(path.join(releaseRoot, 'extra-provider'))

  fs.rmdirSync(path.join(releaseRoot, 'claude'))
  assert.throws(() => captureReleaseOutputs(releaseRoot))
  fs.mkdirSync(path.join(releaseRoot, 'claude'))

  fs.rmSync(path.join(releaseRoot, CLEAN_CLONE_OUTPUT_NAMES[0]))
  fs.mkdirSync(path.join(releaseRoot, CLEAN_CLONE_OUTPUT_NAMES[0]))
  assert.throws(() => captureReleaseOutputs(releaseRoot))
} finally {
  fs.rmSync(releaseRoot, { recursive: true, force: true })
}

const matrixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r5d-matrix-test-'))
try {
  const linux = structuredClone(receipt) as CleanCloneReceipt
  linux.platform = 'linux'
  fs.writeFileSync(path.join(matrixRoot, 'linux.json'), `${JSON.stringify(linux)}\n`, 'utf8')
  fs.writeFileSync(path.join(matrixRoot, 'windows.json'), `${JSON.stringify(receipt)}\n`, 'utf8')
  const aggregate = loadCleanCloneMatrix(matrixRoot, 'success')
  assert.deepEqual(aggregate.platforms, ['linux', 'windows'])
  fs.writeFileSync(path.join(matrixRoot, 'extra.json'), '{}\n', 'utf8')
  assert.throws(() => loadCleanCloneMatrix(matrixRoot, 'success'))
} finally {
  fs.rmSync(matrixRoot, { recursive: true, force: true })
}

const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'release-clean-clone-node.ts'), 'utf8')
for (const required of [
  "['clone', '--local', '--no-hardlinks', '--no-checkout'",
  'validateFinalReleaseCandidate',
  'spawnSync',
  'shell: false',
  'fs.realpathSync.native',
  'fs.lstatSync',
  CLEAN_CLONE_RECEIPT_SENTINEL,
  CLEAN_CLONE_MATRIX_SENTINEL,
]) assert.ok(source.includes(required), `missing Node adapter control: ${required}`)
assert.doesNotMatch(source, /(?:execSync|shell:\s*true|git\s+worktree|mklink|New-Item[^\n]*-ItemType\s+Junction)/i)
assert.doesNotMatch(source, /from ['"](?:https?:|node-fetch|axios|undici)/)

console.log(`release-clean-clone-node.test: PASS (2 clones, 6 commands, ${attackFactories.length} orchestration attacks, 7 CLI attacks, 5 npm-invocation controls, 4 npm-config controls, 4 release-root controls, matrix I/O, static controls)`)
