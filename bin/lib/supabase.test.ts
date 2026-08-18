import assert from 'node:assert/strict'
import { LegacyBackendConfigError } from '../../packages/core/src/legacy-backend-config'
import { rpc } from './supabase'

const URL_A = 'https://control-a.example.test'
const URL_B = 'https://control-b.example.test'
const KEY = 'synthetic-public-key-0001'

let passed = 0
let failed = 0
let globalFetchCalls = 0
const originalFetch = globalThis.fetch

globalThis.fetch = async () => {
  globalFetchCalls += 1
  throw new Error('global fetch tripwire reached')
}

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

async function expectConfigRefusal(env: unknown, label: string): Promise<void> {
  const before = globalFetchCalls
  await assert.rejects(
    rpc('synthetic_rpc', {}, { env, fetch: globalThis.fetch }),
    (error: unknown) => {
      assert.ok(error instanceof LegacyBackendConfigError, `${label}: typed config refusal required`)
      assert.equal(error.message, 'legacy backend configuration refused')
      assert.doesNotMatch(`${error.message}:${error.ruleId}`, /example\.test|synthetic-public-key/i)
      return true
    },
  )
  assert.equal(globalFetchCalls, before, `${label}: validation reached fetch`)
}

async function main(): Promise<void> {
  try {
    await test('K1 missing, partial, and malformed config fail before fetch', async () => {
      for (const [label, env] of [
        ['missing', {}],
        ['URL only', { SUPABASE_URL: URL_A }],
        ['key only', { SUPABASE_ANON_KEY: KEY }],
        ['remote HTTP', { SUPABASE_URL: 'http://remote.example.test', SUPABASE_ANON_KEY: KEY }],
      ] as const) await expectConfigRefusal(env, label)
    })

    await test('K1 configured RPC uses only the injected fetch and exact bounded headers', async () => {
      let request: { url: string; init?: RequestInit } | undefined
      const result = await rpc<{ ok: boolean }>('synthetic_rpc', { value: 1 }, {
        env: { SUPABASE_URL: `${URL_A}/`, SUPABASE_ANON_KEY: KEY },
        fetch: async (input, init) => {
          request = { url: String(input), init }
          return { ok: true, json: async () => ({ ok: true }), text: async () => '' } as Response
        },
      })
      assert.deepEqual(result, { ok: true })
      assert.equal(request?.url, `${URL_A}/rest/v1/rpc/synthetic_rpc`)
      assert.deepEqual(request?.init, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Connection: 'close',
        },
        body: '{"value":1}',
      })
      assert.equal(globalFetchCalls, 0)
    })

    await test('K1 configuration is resolved per call rather than captured at module load', async () => {
      const urls: string[] = []
      const fetch = async (input: RequestInfo | URL) => {
        urls.push(String(input))
        return { ok: true, json: async () => ({}), text: async () => '' } as Response
      }
      await rpc('first', {}, { env: { SUPABASE_URL: URL_A, SUPABASE_ANON_KEY: KEY }, fetch })
      await rpc('second', {}, { env: { SUPABASE_URL: URL_B, SUPABASE_ANON_KEY: KEY }, fetch })
      assert.deepEqual(urls, [`${URL_A}/rest/v1/rpc/first`, `${URL_B}/rest/v1/rpc/second`])
    })

    await test('K1 non-OK responses remain bounded and do not print configuration values', async () => {
      await assert.rejects(
        rpc('synthetic_rpc', {}, {
          env: { SUPABASE_URL: URL_A, SUPABASE_ANON_KEY: KEY },
          fetch: async () => ({
            ok: false,
            status: 503,
            text: async () => 'bounded upstream failure',
          } as Response),
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /^RPC synthetic_rpc failed: 503 bounded upstream failure$/)
          assert.doesNotMatch(error.message, /example\.test|synthetic-public-key/i)
          return true
        },
      )
    })

    console.log(`supabase.test: ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exitCode = 1
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main()
