import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkSyncedCore, SYNCED_CORE_FILES, writeSyncedCore } from './build-synced-core'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'synced-core-'))
const source = path.join(root, 'packages', 'core', 'src')
const target = path.join(root, '.claude', 'integrations', 'core')
fs.mkdirSync(source, { recursive: true })
for (const file of SYNCED_CORE_FILES) fs.writeFileSync(path.join(source, file), `canonical:${file}\n`)

let assertions = 0
function pass(name: string, fn: () => void): void {
  fn()
  assertions += 1
  console.log(`PASS ${name}`)
}

pass('missing mirrors fail closed', () => {
  const result = checkSyncedCore(root)
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, [...SYNCED_CORE_FILES].sort())
})

pass('write creates byte-identical mirrors atomically', () => {
  const result = writeSyncedCore(root)
  assert.equal(result.ok, true)
  for (const file of SYNCED_CORE_FILES) assert.deepEqual(fs.readFileSync(path.join(target, file)), fs.readFileSync(path.join(source, file)))
})

pass('content drift is reported without repair in check mode', () => {
  fs.appendFileSync(path.join(target, SYNCED_CORE_FILES[0]), 'drift\n')
  const result = checkSyncedCore(root)
  assert.equal(result.ok, false)
  assert.deepEqual(result.changed, [SYNCED_CORE_FILES[0]])
  writeSyncedCore(root)
})

pass('extra generated files are refused instead of deleted', () => {
  fs.writeFileSync(path.join(target, 'unexpected.ts'), 'do not delete\n')
  const before = fs.readFileSync(path.join(target, 'unexpected.ts'), 'utf8')
  assert.throws(() => writeSyncedCore(root), /extra files/)
  assert.equal(fs.readFileSync(path.join(target, 'unexpected.ts'), 'utf8'), before)
})

fs.rmSync(root, { recursive: true, force: true })
const repositoryCheck = checkSyncedCore(path.resolve(__dirname, '..'))
assert.equal(repositoryCheck.ok, true, JSON.stringify(repositoryCheck))
console.log(`build-synced-core.test: ${assertions} assertions passed`)
