import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  CLEAN_CLONE_OUTPUT_NAMES,
  CLEAN_CLONE_QUICKSTART_COMMANDS,
  aggregateCleanCloneReceipts,
  validateCleanCloneReceipt,
  type CleanCloneOutput,
  type CleanClonePlatform,
  type CleanCloneReceipt,
} from './release-clean-clone-contract'

const COMMIT = 'a'.repeat(40)
const TREE = 'b'.repeat(40)

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function outputSetIdentity(outputs: readonly CleanCloneOutput[]): string {
  return sha(`${outputs.map((entry) => `${entry.name}\0${entry.bytes}\0${entry.sha256}`).join('\n')}\n`)
}

function outputs(): CleanCloneOutput[] {
  return [...CLEAN_CLONE_OUTPUT_NAMES].map((name, index) => ({
    name,
    bytes: 1_000 + index,
    sha256: sha(`output:${name}`),
  }))
}

function command(id: 'npm-ci' | 'build-providers' | 'test-provider-distribution', ordinal: number) {
  return {
    id,
    exitCode: 0,
    durationMs: 1_000 + ordinal,
    stdoutBytes: 100 + ordinal,
    stdoutSha256: sha(`stdout:${id}:${ordinal}`),
    stderrBytes: ordinal,
    stderrSha256: sha(`stderr:${id}:${ordinal}`),
  }
}

function receipt(platform: CleanClonePlatform): CleanCloneReceipt {
  const canonicalOutputs = outputs()
  const identity = outputSetIdentity(canonicalOutputs)
  return {
    schemaVersion: '1.0.0',
    status: 'pass',
    platform,
    source: { commit: COMMIT, tree: TREE, sourceDateEpoch: 1_754_000_000 },
    tools: { node: 'v24.15.0', npm: '11.8.0', git: 'git version 2.51.0' },
    quickstart: { commands: [...CLEAN_CLONE_QUICKSTART_COMMANDS], matched: true },
    isolation: { cloneCount: 2, physicalInstalls: true, noJunctions: true, rawLogsPersisted: false },
    admission: {
      archives: 3,
      entries: 71,
      sidecars: 8,
      checksums: 11,
      textScans: 79,
      runtimeSmokes: 15,
      secretDetectorFamilies: 10,
    },
    outputs: canonicalOutputs,
    clones: (['A', 'B'] as const).map((clone, cloneIndex) => ({
      clone,
      detachedHead: true,
      headMatches: true,
      treeMatches: true,
      cleanBefore: true,
      cleanAfter: true,
      physicalInstall: true,
      noJunction: true,
      smokeSentinel: true,
      admissionStatus: 'admitted' as const,
      outputSetSha256: identity,
      commands: [
        command('npm-ci', cloneIndex * 10 + 1),
        command('build-providers', cloneIndex * 10 + 2),
        command('test-provider-distribution', cloneIndex * 10 + 3),
      ],
    })),
  }
}

function mutate<T>(value: T, mutation: (copy: any) => void): T {
  const copy = structuredClone(value)
  mutation(copy)
  return copy
}

const windows = receipt('windows')
const linux = receipt('linux')
assert.deepEqual(validateCleanCloneReceipt(windows), windows)
assert.deepEqual(validateCleanCloneReceipt(linux), linux)

const aggregate = aggregateCleanCloneReceipts([windows, linux], 'success')
assert.deepEqual(aggregate, {
  schemaVersion: '1.0.0',
  status: 'pass',
  source: windows.source,
  platforms: ['linux', 'windows'],
  quickstartCommands: [...CLEAN_CLONE_QUICKSTART_COMMANDS],
  outputSetSha256: windows.clones[0].outputSetSha256,
  admission: windows.admission,
})

const receiptAttacks: Array<[string, unknown]> = [
  ['non-object', []],
  ['unknown root key', mutate(windows, (copy) => { copy.extra = true })],
  ['missing root key', mutate(windows, (copy) => { delete copy.tools })],
  ['schema drift', mutate(windows, (copy) => { copy.schemaVersion = '2.0.0' })],
  ['failed status', mutate(windows, (copy) => { copy.status = 'fail' })],
  ['unknown platform', mutate(windows, (copy) => { copy.platform = 'darwin' })],
  ['short commit', mutate(windows, (copy) => { copy.source.commit = 'abc' })],
  ['uppercase tree', mutate(windows, (copy) => { copy.source.tree = 'B'.repeat(40) })],
  ['invalid epoch', mutate(windows, (copy) => { copy.source.sourceDateEpoch = -1 })],
  ['tool path leak', mutate(windows, (copy) => { copy.tools.git = 'C:\\repo\\git.exe' })],
  ['tool URL leak', mutate(windows, (copy) => { copy.tools.npm = 'https://registry.example' })],
  ['quickstart reordered', mutate(windows, (copy) => { copy.quickstart.commands.reverse() })],
  ['quickstart changed', mutate(windows, (copy) => { copy.quickstart.commands[0] = 'npm install' })],
  ['quickstart unmatched', mutate(windows, (copy) => { copy.quickstart.matched = false })],
  ['clone count drift', mutate(windows, (copy) => { copy.isolation.cloneCount = 1 })],
  ['physical install false', mutate(windows, (copy) => { copy.isolation.physicalInstalls = false })],
  ['junction claim false', mutate(windows, (copy) => { copy.isolation.noJunctions = false })],
  ['raw logs persisted', mutate(windows, (copy) => { copy.isolation.rawLogsPersisted = true })],
  ['archive count drift', mutate(windows, (copy) => { copy.admission.archives = 2 })],
  ['runtime smoke drift', mutate(windows, (copy) => { copy.admission.runtimeSmokes = 14 })],
  ['secret family drift', mutate(windows, (copy) => { copy.admission.secretDetectorFamilies = 9 })],
  ['output missing', mutate(windows, (copy) => { copy.outputs.pop() })],
  ['output reordered', mutate(windows, (copy) => { copy.outputs.reverse() })],
  ['output unknown', mutate(windows, (copy) => { copy.outputs[0].name = 'unknown.zip' })],
  ['output bytes invalid', mutate(windows, (copy) => { copy.outputs[0].bytes = 0 })],
  ['output digest invalid', mutate(windows, (copy) => { copy.outputs[0].sha256 = '0' })],
  ['clone missing', mutate(windows, (copy) => { copy.clones.pop() })],
  ['clone order drift', mutate(windows, (copy) => { copy.clones.reverse() })],
  ['clone identity false', mutate(windows, (copy) => { copy.clones[0].headMatches = false })],
  ['clone not detached', mutate(windows, (copy) => { copy.clones[0].detachedHead = false })],
  ['clone dirty', mutate(windows, (copy) => { copy.clones[0].cleanAfter = false })],
  ['clone junction', mutate(windows, (copy) => { copy.clones[0].noJunction = false })],
  ['clone sentinel absent', mutate(windows, (copy) => { copy.clones[0].smokeSentinel = false })],
  ['clone admission failed', mutate(windows, (copy) => { copy.clones[0].admissionStatus = 'rejected' })],
  ['clone output identity drift', mutate(windows, (copy) => { copy.clones[0].outputSetSha256 = sha('drift') })],
  ['command missing', mutate(windows, (copy) => { copy.clones[0].commands.pop() })],
  ['command order drift', mutate(windows, (copy) => { copy.clones[0].commands.reverse() })],
  ['command failed', mutate(windows, (copy) => { copy.clones[0].commands[0].exitCode = 1 })],
  ['command duration invalid', mutate(windows, (copy) => { copy.clones[0].commands[0].durationMs = 0 })],
  ['command output oversized', mutate(windows, (copy) => { copy.clones[0].commands[0].stdoutBytes = 2_000_000 })],
  ['command hash invalid', mutate(windows, (copy) => { copy.clones[0].commands[0].stdoutSha256 = 'bad' })],
  ['unknown nested key', mutate(windows, (copy) => { copy.clones[0].tempPath = 'C:\\tmp' })],
]

for (const [name, attacked] of receiptAttacks) {
  assert.throws(() => validateCleanCloneReceipt(attacked), `${name} attack unexpectedly passed`)
}

const matrixAttacks: Array<[string, readonly unknown[], unknown]> = [
  ['matrix failed', [windows, linux], 'failure'],
  ['matrix result missing', [windows, linux], undefined],
  ['receipt missing', [windows], 'success'],
  ['receipt extra', [windows, linux, linux], 'success'],
  ['duplicate platform', [windows, windows], 'success'],
  ['source commit drift', [windows, mutate(linux, (copy) => { copy.source.commit = 'c'.repeat(40) })], 'success'],
  ['source tree drift', [windows, mutate(linux, (copy) => { copy.source.tree = 'c'.repeat(40) })], 'success'],
  ['epoch drift', [windows, mutate(linux, (copy) => { copy.source.sourceDateEpoch += 1 })], 'success'],
  ['output drift', [windows, mutate(linux, (copy) => {
    copy.outputs[0].sha256 = sha('other-output')
    const identity = outputSetIdentity(copy.outputs)
    copy.clones[0].outputSetSha256 = identity
    copy.clones[1].outputSetSha256 = identity
  })], 'success'],
]

for (const [name, receipts, matrixResult] of matrixAttacks) {
  assert.throws(() => aggregateCleanCloneReceipts(receipts, matrixResult), `${name} attack unexpectedly passed`)
}

console.log(`release-clean-clone-contract.test: PASS (2 canonical receipts, ${receiptAttacks.length} receipt attacks, ${matrixAttacks.length} matrix attacks)`)
