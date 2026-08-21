import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createNodeSpecAdapterHashPort } from '../src/spec-adapter-node'
import {
  SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  SPEC_ADAPTER_FETCH_TIMEOUT_MS,
  fetchSpecAdapterResult,
  type SpecAdapterFetchRequest,
} from '../src/spec-adapter-fetch'
import {
  SpecAdapterFetchNodeError,
  createNodeSpecAdapterFetchCapability,
  createSpecAdapterBearerCredential,
  type SpecAdapterFetchNodeDependencies,
} from '../src/spec-adapter-fetch-node'

type JsonRecord = Record<string, any>

const root = process.cwd()
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const jiraBase = 'https://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd'
const azureBase = 'https://dev.azure.com'
const jiraUrl = `${jiraBase}/rest/api/3/issue/SYN-101?fields=description%2Csummary`
const azureUrl = `${azureBase}/synthetic-org/Synthetic%20Project/_apis/wit/workitems/202?fields=System.Description%2CSystem.Title&api-version=7.1`
const jiraFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-jira-minimal.json'), 'utf8')) as JsonRecord
const azureFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-azure-devops-minimal.json'), 'utf8')) as JsonRecord
let passed = 0
let attacks = 0

async function run(name: string, test: () => Promise<void> | void): Promise<void> {
  await test()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

function request(providerId: 'jira' | 'azure-devops' = 'jira'): SpecAdapterFetchRequest {
  return Object.freeze({
    providerId,
    method: 'GET',
    url: providerId === 'jira' ? jiraUrl : azureUrl,
    accept: 'application/json',
    redirect: 'error',
    timeoutMs: SPEC_ADAPTER_FETCH_TIMEOUT_MS,
    maxResponseBytes: SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  })
}

function response(
  url: string,
  chunks: Uint8Array[],
  overrides: Partial<{ status: number; contentType: string; contentLength: string; redirected: boolean; body: ReadableStream<Uint8Array> | null }> = {},
): Response {
  const body = overrides.body === undefined
    ? new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })
    : overrides.body
  const headers = new Headers()
  headers.set('content-type', overrides.contentType ?? 'application/json; charset=utf-8')
  if (overrides.contentLength !== undefined) headers.set('content-length', overrides.contentLength)
  return {
    status: overrides.status ?? 200,
    headers,
    url,
    redirected: overrides.redirected ?? false,
    body,
  } as Response
}

function dependencies(fetchImpl: typeof fetch): SpecAdapterFetchNodeDependencies {
  return {
    fetchImpl,
    setTimeoutImpl(handler, delay) { return setTimeout(handler, delay) },
    clearTimeoutImpl(handle) { clearTimeout(handle as ReturnType<typeof setTimeout>) },
  }
}

function credential(providerId: 'jira' | 'azure-devops', destinationBaseUrl: string, tokenText = 'synthetic.A2D-token_1234567890') {
  const transferred = encoder.encode(tokenText)
  const result = createSpecAdapterBearerCredential({ providerId, destinationBaseUrl, accessToken: transferred })
  assert.ok(transferred.every((byte) => byte === 0), 'transferred credential bytes must be zeroized')
  return result
}

function capability(
  providerId: 'jira' | 'azure-devops',
  destinationBaseUrl: string,
  fetchImpl: typeof fetch,
) {
  return createNodeSpecAdapterFetchCapability(
    { providerId, destinationBaseUrl },
    credential(providerId, destinationBaseUrl),
    dependencies(fetchImpl),
  )
}

async function expectNodeCode(action: () => Promise<unknown> | unknown, code: string, sensitive = 'SECRET'): Promise<void> {
  let caught: unknown
  try { await action() } catch (error) { caught = error }
  assert.ok(caught instanceof SpecAdapterFetchNodeError, `expected SpecAdapterFetchNodeError ${code}`)
  assert.equal(caught.code, code)
  assert.ok(!caught.message.includes(sensitive), `${code} leaked sensitive material`)
  attacks += 1
}

async function main(): Promise<void> {
await run('credential transfer is zeroized and public descriptor is closed', () => {
  const token = encoder.encode('synthetic.A2D-token_1234567890')
  const descriptor = createSpecAdapterBearerCredential({ providerId: 'jira', destinationBaseUrl: jiraBase, accessToken: token })
  assert.deepEqual(descriptor, { kind: 'spec-adapter-bearer-v1', providerId: 'jira', destinationBaseUrl: jiraBase })
  assert.equal(Object.isFrozen(descriptor), true)
  assert.ok(token.every((byte) => byte === 0))
  assert.ok(!JSON.stringify(descriptor).toLowerCase().includes('token'))
})

await run('Jira OAuth gateway uses one exact bearer GET and returns owned bytes', async () => {
  const body = encoder.encode(JSON.stringify(jiraFixture.payload))
  let calls = 0
  let capturedAuthorization = ''
  const port = capability('jira', jiraBase, (async (input, init) => {
    calls += 1
    assert.equal(String(input), jiraUrl)
    assert.equal(init?.method, 'GET')
    assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal instanceof AbortSignal)
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('accept'), 'application/json')
    capturedAuthorization = headers.get('authorization') ?? ''
    return response(jiraUrl, [body])
  }) as typeof fetch)
  const result = await port.execute(request('jira'))
  assert.equal(calls, 1)
  assert.equal(capturedAuthorization, 'Bearer synthetic.A2D-token_1234567890')
  assert.equal(decoder.decode((result as { body: Uint8Array }).body), decoder.decode(body))
  body.fill(0)
  assert.notEqual(decoder.decode((result as { body: Uint8Array }).body), decoder.decode(body))
  await expectNodeCode(() => port.execute(request('jira')), 'CREDENTIAL_CONSUMED')
})

await run('Azure Entra bearer transport composes through A2C without exposing credentials', async () => {
  const payload = structuredClone(azureFixture.payload)
  payload.url = 'https://dev.azure.com/synthetic-org/_apis/wit/workitems/202'
  const body = encoder.encode(JSON.stringify(payload))
  let serializedInit = ''
  const port = capability('azure-devops', azureBase, (async (input, init) => {
    assert.equal(String(input), azureUrl.replace('System.Description%2CSystem.Title', 'Custom.SyntheticRisk%2CMicrosoft.VSTS.Common.AcceptanceCriteria%2CSystem.Description%2CSystem.Title'))
    serializedInit = JSON.stringify({ method: init?.method, redirect: init?.redirect })
    return response(String(input), [body.subarray(0, 7), body.subarray(7)])
  }) as typeof fetch)
  const result = await fetchSpecAdapterResult({
    providerId: 'azure-devops',
    baseUrl: azureBase,
    organization: 'synthetic-org',
    project: 'Synthetic Project',
    workItemId: 202,
    sourceRef: azureFixture.sourceRef,
    mapping: structuredClone(azureFixture.mapping),
  }, port, createNodeSpecAdapterHashPort())
  assert.equal(result.source.title, azureFixture.payload.fields['System.Title'])
  assert.equal(serializedInit, '{"method":"GET","redirect":"error"}')
})

await run('configuration, credential shape, and binding attacks fail before fetch', async () => {
  let calls = 0
  const never = (async () => { calls += 1; throw new Error('SECRET-FETCH') }) as typeof fetch
  for (const config of [
    { providerId: 'jira', destinationBaseUrl: 'https://jira.example.invalid' },
    { providerId: 'jira', destinationBaseUrl: `${jiraBase}/` },
    { providerId: 'azure-devops', destinationBaseUrl: 'https://dev.azure.com/other' },
    { providerId: 'azure-devops', destinationBaseUrl: azureBase, extra: true },
  ]) await expectNodeCode(
    () => createNodeSpecAdapterFetchCapability(config, credential('jira', jiraBase), dependencies(never)),
    'INVALID_CONFIGURATION',
  )

  for (const bytes of [new Uint8Array(), encoder.encode('space token value'), encoder.encode('short')]) {
    await expectNodeCode(
      () => createSpecAdapterBearerCredential({ providerId: 'jira', destinationBaseUrl: jiraBase, accessToken: bytes }),
      'INVALID_CREDENTIAL',
    )
  }
  const jiraCredential = credential('jira', jiraBase)
  await expectNodeCode(
    () => createNodeSpecAdapterFetchCapability({ providerId: 'azure-devops', destinationBaseUrl: azureBase }, jiraCredential, dependencies(never)),
    'CREDENTIAL_MISMATCH',
  )
  assert.equal(calls, 0)
})

await run('request confusion fails before credential consumption and canonical retry succeeds', async () => {
  let calls = 0
  const fetchImpl = (async (input) => { calls += 1; return response(String(input), [encoder.encode('{}')]) }) as typeof fetch
  const port = capability('jira', jiraBase, fetchImpl)
  const canonical = request('jira')
  for (const candidate of [
    { ...canonical, method: 'POST' },
    { ...canonical, url: `${jiraBase}/rest/api/3/project?fields=description%2Csummary` },
    { ...canonical, url: `${jiraUrl}&expand=changelog` },
    { ...canonical, url: jiraUrl.replace('/SYN-101?', '/..%2Fsecret?') },
    { ...canonical, timeoutMs: 1 },
    { ...canonical, extra: true },
  ]) await expectNodeCode(() => port.execute(candidate as SpecAdapterFetchRequest), 'REQUEST_REJECTED')
  assert.equal(calls, 0)
  await port.execute(canonical)
  assert.equal(calls, 1)
})

await run('network failure consumes the credential and leaks no low-level error', async () => {
  let calls = 0
  const port = capability('jira', jiraBase, (async () => {
    calls += 1
    throw new Error('SECRET-DNS-FAILURE')
  }) as typeof fetch)
  await expectNodeCode(() => port.execute(request('jira')), 'NETWORK_REJECTED', 'SECRET-DNS-FAILURE')
  await expectNodeCode(() => port.execute(request('jira')), 'CREDENTIAL_CONSUMED')
  assert.equal(calls, 1)
})

await run('declared and cumulative response limits fail closed and cancel overflow', async () => {
  let calls = 0
  let declaredCancelled = false
  const declaredBody = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode('{}')) },
    cancel() { declaredCancelled = true },
  })
  const declared = capability('jira', jiraBase, (async () => {
    calls += 1
    return response(jiraUrl, [], {
      contentLength: String(SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES + 1),
      body: declaredBody,
    })
  }) as typeof fetch)
  await expectNodeCode(() => declared.execute(request('jira')), 'RESPONSE_TOO_LARGE')
  assert.equal(declaredCancelled, true)

  let cancelled = false
  const oversizedBody = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES + 1)) },
    cancel() { cancelled = true },
  })
  const cumulative = capability('jira', jiraBase, (async () => response(jiraUrl, [], { body: oversizedBody })) as typeof fetch)
  await expectNodeCode(() => cumulative.execute(request('jira')), 'RESPONSE_TOO_LARGE')
  assert.equal(cancelled, true)
  assert.equal(calls, 1)
})

await run('deadline aborts an unresolved fetch and late response cannot become success', async () => {
  let fire: (() => void) | undefined
  let aborted = false
  let resolveFetch: ((value: Response) => void) | undefined
  const fetchImpl = ((_: unknown, init?: RequestInit) => new Promise<Response>((resolve) => {
    resolveFetch = resolve
    init?.signal?.addEventListener('abort', () => { aborted = true }, { once: true })
  })) as typeof fetch
  const deps: SpecAdapterFetchNodeDependencies = {
    fetchImpl,
    setTimeoutImpl(handler, delay) { assert.equal(delay, SPEC_ADAPTER_FETCH_TIMEOUT_MS); fire = handler; return 1 },
    clearTimeoutImpl() {},
  }
  const port = createNodeSpecAdapterFetchCapability(
    { providerId: 'jira', destinationBaseUrl: jiraBase },
    credential('jira', jiraBase),
    deps,
  )
  const pending = port.execute(request('jira'))
  await Promise.resolve()
  assert.ok(resolveFetch, 'fake fetch must be in flight before the deadline fires')
  assert.ok(fire)
  fire()
  await expectNodeCode(() => pending, 'TIMEOUT')
  assert.equal(aborted, true)
  resolveFetch?.(response(jiraUrl, [encoder.encode('{}')]))
  await new Promise((resolve) => setImmediate(resolve))
  await expectNodeCode(() => port.execute(request('jira')), 'CREDENTIAL_CONSUMED')
})

await run('a synchronous deadline callback refuses before fetch invocation', async () => {
  let calls = 0
  const deps: SpecAdapterFetchNodeDependencies = {
    fetchImpl: (async () => { calls += 1; return response(jiraUrl, [encoder.encode('{}')]) }) as typeof fetch,
    setTimeoutImpl(handler, delay) { assert.equal(delay, SPEC_ADAPTER_FETCH_TIMEOUT_MS); handler(); return 1 },
    clearTimeoutImpl() {},
  }
  const port = createNodeSpecAdapterFetchCapability(
    { providerId: 'jira', destinationBaseUrl: jiraBase },
    credential('jira', jiraBase),
    deps,
  )
  await expectNodeCode(() => port.execute(request('jira')), 'TIMEOUT')
  assert.equal(calls, 0)
})

await run('redirect, final URL, empty/null body, and malformed chunks fail closed', async () => {
  const cases: Array<[() => Response, string]> = [
    [() => response(jiraUrl, [encoder.encode('{}')], { status: 302 }), 'REDIRECT_REJECTED'],
    [() => response(jiraUrl, [encoder.encode('{}')], { redirected: true }), 'REDIRECT_REJECTED'],
    [() => response('https://evil.example.invalid/leak', [encoder.encode('{}')]), 'DESTINATION_MISMATCH'],
    [() => response(jiraUrl, [], { body: null }), 'RESPONSE_REJECTED'],
    [() => response(jiraUrl, []), 'RESPONSE_REJECTED'],
    [() => response(jiraUrl, [], { body: new ReadableStream({ start(controller) { controller.enqueue('SECRET' as never); controller.close() } }) }), 'RESPONSE_REJECTED'],
    [() => response(jiraUrl, [], { body: {
      getReader() {
        return {
          read: async () => Object.defineProperty({ value: undefined }, 'done', {
            enumerable: true,
            get() { throw new Error('SECRET-STREAM-ACCESSOR') },
          }),
          cancel: async () => undefined,
          releaseLock: () => undefined,
        }
      },
    } as unknown as ReadableStream<Uint8Array> }), 'RESPONSE_REJECTED'],
  ]
  for (const [makeResponse, code] of cases) {
    const port = capability('jira', jiraBase, (async () => makeResponse()) as typeof fetch)
    await expectNodeCode(() => port.execute(request('jira')), code)
  }
})

await run('accessors, proxies, and diagnostics cannot expose secret material', async () => {
  let getterCalls = 0
  const token = encoder.encode('synthetic.A2D-token_1234567890')
  const accessor = Object.defineProperty({ providerId: 'jira', destinationBaseUrl: jiraBase }, 'accessToken', {
    enumerable: true,
    get() { getterCalls += 1; return token },
  })
  await expectNodeCode(() => createSpecAdapterBearerCredential(accessor), 'INVALID_CREDENTIAL')
  assert.equal(getterCalls, 0)

  const proxiedToken = new Proxy(encoder.encode('synthetic.A2D-token_1234567890'), {}) as Uint8Array
  await expectNodeCode(
    () => createSpecAdapterBearerCredential({ providerId: 'jira', destinationBaseUrl: jiraBase, accessToken: proxiedToken }),
    'INVALID_CREDENTIAL',
  )

  let shadowCalls = 0
  const decoratedToken = encoder.encode('synthetic.A2D-token_1234567890')
  Object.defineProperty(decoratedToken, 'byteLength', {
    enumerable: true,
    get() { shadowCalls += 1; return 999 },
  })
  Object.defineProperty(decoratedToken, 'every', {
    enumerable: true,
    value() { shadowCalls += 1; return true },
  })
  await expectNodeCode(
    () => createSpecAdapterBearerCredential({ providerId: 'jira', destinationBaseUrl: jiraBase, accessToken: decoratedToken }),
    'INVALID_CREDENTIAL',
  )
  assert.equal(shadowCalls, 0, 'typed-array shadow hooks must not execute')

  const port = capability('jira', jiraBase, (async () => {
    const candidate = response(jiraUrl, [encoder.encode('{}')]) as unknown as Record<string, unknown>
    return Object.defineProperty(candidate, 'url', { enumerable: true, get() { throw new Error('SECRET-URL') } }) as unknown as Response
  }) as typeof fetch)
  await expectNodeCode(() => port.execute(request('jira')), 'RESPONSE_REJECTED', 'SECRET-URL')
})

await run('bounded fake-fetch transport stays below the TypeScript reconsideration threshold', async () => {
  const durations: number[] = []
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const port = capability('jira', jiraBase, (async () => response(jiraUrl, [encoder.encode('{}')])) as typeof fetch)
    const started = performance.now()
    await port.execute(request('jira'))
    durations.push(performance.now() - started)
  }
  durations.sort((left, right) => left - right)
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
  console.log(`spec-adapter-fetch-node benchmark: iterations=100 p95-ms=${p95.toFixed(3)} node=${process.version}`)
  assert.ok(p95 < 50, `transport p95 ${p95.toFixed(3)} ms exceeded the 50 ms reconsideration threshold`)
})

console.log(`spec-adapter-fetch-node.test: PASS (${passed} behavior groups, ${attacks} attacks, bearer-only single-use transport)`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
