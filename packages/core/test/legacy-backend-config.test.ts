import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  LegacyBackendConfigError,
  resolveLegacyBackendConfig,
} from '../src/legacy-backend-config'

const HTTPS_URL = 'https://control-plane.example.test'
const LOOPBACK_URL = 'http://127.0.0.1:54321/'
const KEY = 'synthetic-public-key-0001'

let passed = 0
let failed = 0

async function test(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function expectRefusal(input: unknown, label: string): void {
  assert.throws(() => resolveLegacyBackendConfig(input), (error: unknown) => {
    assert.ok(error instanceof LegacyBackendConfigError, `${label}: typed error required`)
    assert.equal(error.message, 'legacy backend configuration refused')
    assert.match(error.ruleId, /^legacy_config\./)
    for (const value of [HTTPS_URL, LOOPBACK_URL, KEY]) {
      assert.equal(error.message.includes(value), false, `${label}: message leaked input`)
    }
    return true
  })
}

async function main(): Promise<void> {
  await test('C1 resolves and freezes one normalized HTTPS pair', () => {
    const result = resolveLegacyBackendConfig({
      SUPABASE_URL: `${HTTPS_URL}/`,
      SUPABASE_ANON_KEY: KEY,
      UNRELATED: 'ignored',
    })
    assert.deepEqual(result, { url: HTTPS_URL, anonKey: KEY })
    assert.ok(Object.isFrozen(result))
  })

  await test('C1 permits exact loopback HTTP and rejects non-loopback HTTP', () => {
    assert.equal(resolveLegacyBackendConfig({
      SUPABASE_URL: LOOPBACK_URL,
      SUPABASE_ANON_KEY: KEY,
    }).url, 'http://127.0.0.1:54321')
    assert.equal(resolveLegacyBackendConfig({
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: KEY,
    }).url, 'http://localhost:54321')
    assert.equal(resolveLegacyBackendConfig({
      SUPABASE_URL: 'http://[::1]:54321',
      SUPABASE_ANON_KEY: KEY,
    }).url, 'http://[::1]:54321')
    expectRefusal({ SUPABASE_URL: 'http://control-plane.example.test', SUPABASE_ANON_KEY: KEY }, 'remote HTTP')
    expectRefusal({ SUPABASE_URL: 'http://localhost.example.test', SUPABASE_ANON_KEY: KEY }, 'deceptive loopback')
  })

  await test('C1 rejects missing, partial, blank, non-string, trimmed, inherited, and accessor values', () => {
    for (const input of [
      {},
      { SUPABASE_URL: HTTPS_URL },
      { SUPABASE_ANON_KEY: KEY },
      { SUPABASE_URL: '', SUPABASE_ANON_KEY: KEY },
      { SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: '' },
      { SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: 7 },
      { SUPABASE_URL: ` ${HTTPS_URL}`, SUPABASE_ANON_KEY: KEY },
      { SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: `${KEY} ` },
      null,
      [],
    ]) expectRefusal(input, `shape ${String(input)}`)

    const inherited = Object.create({ SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: KEY })
    expectRefusal(inherited, 'prototype-only configuration')

    let getterCalls = 0
    const accessorBacked = Object.create(null)
    Object.defineProperties(accessorBacked, {
      SUPABASE_URL: {
        enumerable: true,
        get: () => { getterCalls += 1; return HTTPS_URL },
      },
      SUPABASE_ANON_KEY: {
        enumerable: true,
        get: () => { getterCalls += 1; return KEY },
      },
    })
    expectRefusal(accessorBacked, 'accessor-backed configuration')
    assert.equal(getterCalls, 0, 'configuration refusal must not execute accessors')
  })

  await test('C1 rejects URL credential, path, query, fragment, scheme, controls, Unicode, and invalid port attacks', () => {
    for (const url of [
      'https://user:pass@control-plane.example.test',
      'https://control-plane.example.test/rest/v1',
      'https://control-plane.example.test?redirect=other',
      'https://control-plane.example.test#fragment',
      'ftp://control-plane.example.test',
      'https://control-plane.example.test\n',
      'https://café.example.test',
      'https://control-plane.example.test:99999',
      'not-a-url',
    ]) expectRefusal({ SUPABASE_URL: url, SUPABASE_ANON_KEY: KEY }, 'URL attack')
  })

  await test('C1 accepts bounded credential formats and rejects unsafe key bytes and size', () => {
    for (const key of [
      'sb_publishable_synthetic_0001',
      'header.payload.signature',
      '!'.repeat(16),
      '~'.repeat(4096),
    ]) assert.equal(resolveLegacyBackendConfig({ SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: key }).anonKey, key)

    for (const key of [
      'short',
      'contains space credential',
      'line\nbreak-is-unsafe',
      'tab\tcredential-is-unsafe',
      '~'.repeat(4097),
    ]) expectRefusal({ SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: key }, 'key attack')
  })

  await test('C1 errors expose only closed rule identifiers', () => {
    for (const input of [
      {},
      { SUPABASE_URL: HTTPS_URL },
      { SUPABASE_URL: 'http://remote.example.test', SUPABASE_ANON_KEY: KEY },
      { SUPABASE_URL: HTTPS_URL, SUPABASE_ANON_KEY: 'unsafe key value' },
    ]) {
      try {
        resolveLegacyBackendConfig(input)
        assert.fail('expected refusal')
      } catch (error) {
        assert.ok(error instanceof LegacyBackendConfigError)
        assert.deepEqual(Object.keys(error).sort(), ['name', 'ruleId'])
        assert.doesNotMatch(`${error.name}:${error.message}:${error.ruleId}`, /example\.test|synthetic|unsafe key/i)
      }
    }
  })

  await test('C1 canonical source stays pure and adapter-free', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy-backend-config.ts'), 'utf8')
    for (const pattern of [
      /process\b/,
      /node:fs|from ['"]fs['"]/,
      /child_process/,
      /fetch\s*\(/,
      /SUPABASE_URL\s*=|SUPABASE_ANON_KEY\s*=/,
      /https?:\/\//,
      /provider SDK/i,
    ]) assert.doesNotMatch(source, pattern)
  })

  console.log(`legacy-backend-config.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
