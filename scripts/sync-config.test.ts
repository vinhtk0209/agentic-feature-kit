import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  LOCAL_SYNC_CONFIG_NAME,
  TRACKED_SYNC_CONFIG_NAME,
  SyncConfigError,
  loadSyncConfig,
  selectSyncConfigPath,
} from './sync-config'

let passed = 0
let failed = 0
function test(name: string, body: () => void): void {
  try {
    body()
    console.log(`PASS ${name}`)
    passed += 1
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
    failed += 1
  }
}

function withRoot(body: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-config-test-'))
  try {
    body(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function write(root: string, name: string, value: unknown): void {
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const tracked = {
  targets: ['../example-learning-app', '../example-authoring-app'],
  syncPaths: ['commands/', 'integrations/', 'mcp-server/index.ts'],
}
const local = {
  targets: ['../private-learning-app', '../nested/private-authoring-app'],
  syncPaths: ['commands/', 'integrations/'],
}

test('fixed local override wins over tracked public defaults', () => withRoot((root) => {
  write(root, TRACKED_SYNC_CONFIG_NAME, tracked)
  write(root, LOCAL_SYNC_CONFIG_NAME, local)
  assert.equal(selectSyncConfigPath(root), path.join(root, LOCAL_SYNC_CONFIG_NAME))
  const loaded = loadSyncConfig(root)
  assert.equal(loaded.source, 'local')
  assert.deepEqual(loaded.config, local)
  assert.equal(Object.isFrozen(loaded.config), true)
  assert.equal(Object.isFrozen(loaded.config.targets), true)
  assert.equal(Object.isFrozen(loaded.config.syncPaths), true)
}))

test('tracked public config is the only fallback', () => withRoot((root) => {
  write(root, TRACKED_SYNC_CONFIG_NAME, tracked)
  assert.equal(selectSyncConfigPath(root), path.join(root, TRACKED_SYNC_CONFIG_NAME))
  const loaded = loadSyncConfig(root)
  assert.equal(loaded.source, 'tracked')
  assert.deepEqual(loaded.config, tracked)
}))

test('missing both fixed files fails closed without an absolute path', () => withRoot((root) => {
  assert.throws(() => selectSyncConfigPath(root), (error: unknown) => {
    assert.ok(error instanceof SyncConfigError)
    assert.equal(error.code, 'missing-config')
    assert.equal(error.message.includes(root), false)
    return true
  })
}))

test('malformed local config never falls back to tracked config', () => withRoot((root) => {
  write(root, TRACKED_SYNC_CONFIG_NAME, tracked)
  fs.writeFileSync(path.join(root, LOCAL_SYNC_CONFIG_NAME), '{', 'utf8')
  assert.throws(() => loadSyncConfig(root), (error: unknown) => {
    assert.ok(error instanceof SyncConfigError)
    assert.equal(error.code, 'invalid-json')
    assert.match(error.message, /sync\.config\.local\.json/)
    return true
  })
}))

for (const [name, value, code] of [
  ['unknown key', { ...tracked, endpoint: 'https://example.invalid' }, 'invalid-shape'],
  ['empty targets', { ...tracked, targets: [] }, 'invalid-targets'],
  ['empty sync paths', { ...tracked, syncPaths: [] }, 'invalid-sync-paths'],
  ['non-string target', { ...tracked, targets: [1] }, 'invalid-targets'],
  ['duplicate target', { ...tracked, targets: ['../same', '../same'] }, 'invalid-targets'],
  ['absolute target', { ...tracked, targets: ['C:/private'] }, 'unsafe-target'],
  ['deep traversal target', { ...tracked, targets: ['../../escape'] }, 'unsafe-target'],
  ['sync traversal', { ...tracked, syncPaths: ['../escape'] }, 'unsafe-sync-path'],
  ['absolute sync path', { ...tracked, syncPaths: ['/absolute'] }, 'unsafe-sync-path'],
] as const) {
  test(`rejects ${name}`, () => withRoot((root) => {
    write(root, TRACKED_SYNC_CONFIG_NAME, value)
    assert.throws(() => loadSyncConfig(root), (error: unknown) => {
      assert.ok(error instanceof SyncConfigError)
      assert.equal(error.code, code)
      return true
    })
  }))
}

test('source exposes fixed filenames and no environment-selected config path', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'sync-config.ts'), 'utf8')
  assert.match(source, /sync\.config\.local\.json/)
  assert.match(source, /sync\.config\.json/)
  assert.doesNotMatch(source, /process\.env|SYNC_CONFIG_PATH|argv/)
})

console.log(`sync-config.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
