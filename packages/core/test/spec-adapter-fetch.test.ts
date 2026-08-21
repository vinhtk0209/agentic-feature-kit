import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createNodeSpecAdapterHashPort } from '../src/spec-adapter-node'
import {
  SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  SPEC_ADAPTER_FETCH_TIMEOUT_MS,
  SpecAdapterFetchError,
  fetchSpecAdapterResult,
  type SpecAdapterFetchCapability,
  type SpecAdapterFetchRequest,
  type SpecAdapterFetchResponse,
  type SpecAdapterLiveFetchInput,
} from '../src/spec-adapter-fetch'

type JsonRecord = Record<string, any>

const root = process.cwd()
const encoder = new TextEncoder()
const hashPort = createNodeSpecAdapterHashPort()
const jiraFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-jira-minimal.json'), 'utf8')) as JsonRecord
const azureFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-azure-devops-minimal.json'), 'utf8')) as JsonRecord
const jiraDestinationBaseUrl = 'https://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd'
let passed = 0
let attacks = 0

async function run(name: string, test: () => Promise<void> | void): Promise<void> {
  await test()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

function exactBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function response(url: string, body: Uint8Array): SpecAdapterFetchResponse {
  return { status: 200, contentType: 'application/json; charset=utf-8', finalUrl: url, body }
}

function fakeCapability(
  providerId: 'jira' | 'azure-devops',
  destinationBaseUrl: string,
  responder: (request: SpecAdapterFetchRequest) => Promise<unknown> | unknown,
): SpecAdapterFetchCapability {
  return { providerId, destinationBaseUrl, execute: responder }
}

function jiraInput(overrides: Partial<SpecAdapterLiveFetchInput> = {}): SpecAdapterLiveFetchInput {
  return {
    providerId: 'jira',
    baseUrl: jiraDestinationBaseUrl,
    issueIdOrKey: 'SYN-101',
    sourceRef: jiraFixture.sourceRef,
    mapping: structuredClone(jiraFixture.mapping),
    ...overrides,
  } as SpecAdapterLiveFetchInput
}

function azureInput(overrides: Partial<SpecAdapterLiveFetchInput> = {}): SpecAdapterLiveFetchInput {
  return {
    providerId: 'azure-devops',
    baseUrl: 'https://dev.azure.com',
    organization: 'synthetic-org',
    project: 'Synthetic Project',
    workItemId: 202,
    sourceRef: azureFixture.sourceRef,
    mapping: structuredClone(azureFixture.mapping),
    ...overrides,
  } as SpecAdapterLiveFetchInput
}

async function expectFetchCode(
  action: () => Promise<unknown>,
  code: string,
  sensitive?: string,
): Promise<void> {
  let caught: unknown
  try { await action() } catch (error) { caught = error }
  assert.ok(caught instanceof SpecAdapterFetchError, `expected SpecAdapterFetchError ${code}`)
  assert.equal(caught.code, code)
  if (sensitive) assert.ok(!caught.message.includes(sensitive), `${code} leaked sensitive material`)
  attacks += 1
}

async function main(): Promise<void> {
await run('Jira builds one deterministic credential-free request and preserves exact wire bytes', async () => {
  const payload = { ...structuredClone(jiraFixture.payload), self: 'SECRET-JIRA-SELF', expand: 'SECRET-EXPAND' }
  const body = exactBytes(payload)
  const requests: SpecAdapterFetchRequest[] = []
  const capability = fakeCapability('jira', jiraDestinationBaseUrl, async (request) => {
    requests.push(structuredClone(request))
    return response(request.url, body)
  })
  const result = await fetchSpecAdapterResult(jiraInput(), capability, hashPort)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], {
    providerId: 'jira',
    method: 'GET',
    url: 'https://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd/rest/api/3/issue/SYN-101?fields=customfield_10001%2Ccustomfield_19999%2Cdescription%2Csummary',
    accept: 'application/json',
    redirect: 'error',
    timeoutMs: SPEC_ADAPTER_FETCH_TIMEOUT_MS,
    maxResponseBytes: SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  })
  assert.equal(result.source.sourceSha256, crypto.createHash('sha256').update(body).digest('hex'))
  assert.ok(!JSON.stringify(result).includes('SECRET-JIRA-SELF'))
  assert.ok(!JSON.stringify(result).includes('SECRET-EXPAND'))
})

await run('Azure DevOps builds one 7.1 request and ignores only locked wire metadata', async () => {
  const payload = { ...structuredClone(azureFixture.payload), _links: { secret: 'SECRET-AZURE-LINK' } }
  payload.url = 'https://dev.azure.com/synthetic-org/_apis/wit/workitems/202'
  const body = exactBytes(payload)
  let seen: SpecAdapterFetchRequest | undefined
  const capability = fakeCapability('azure-devops', 'https://dev.azure.com', (request) => {
    seen = structuredClone(request)
    return response(request.url, body)
  })
  const result = await fetchSpecAdapterResult(azureInput(), capability, hashPort)
  assert.deepEqual(seen, {
    providerId: 'azure-devops',
    method: 'GET',
    url: 'https://dev.azure.com/synthetic-org/Synthetic%20Project/_apis/wit/workitems/202?fields=Custom.SyntheticRisk%2CMicrosoft.VSTS.Common.AcceptanceCriteria%2CSystem.Description%2CSystem.Title&api-version=7.1',
    accept: 'application/json',
    redirect: 'error',
    timeoutMs: SPEC_ADAPTER_FETCH_TIMEOUT_MS,
    maxResponseBytes: SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES,
  })
  assert.equal(result.source.sourceSha256, crypto.createHash('sha256').update(body).digest('hex'))
  assert.ok(!JSON.stringify(result).includes('SECRET-AZURE-LINK'))
})

await run('input shape, identifiers, and destination binding fail before port execution', async () => {
  let calls = 0
  const capability = fakeCapability('jira', jiraDestinationBaseUrl, () => { calls += 1; throw new Error('must not run') })
  for (const input of [
    { ...jiraInput(), extra: true },
    jiraInput({ baseUrl: 'http://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd' }),
    jiraInput({ baseUrl: 'https://user:secret@api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd' }),
    jiraInput({ baseUrl: 'https://jira.example.invalid' }),
    jiraInput({ baseUrl: 'https://api.atlassian.com' }),
    jiraInput({ baseUrl: 'https://api.atlassian.com/ex/jira/01234567-89AB-4CDE-8F01-23456789ABCD' }),
    jiraInput({ baseUrl: 'https://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd/' }),
    jiraInput({ issueIdOrKey: '../secret' }),
    jiraInput({ issueIdOrKey: 'A/B' }),
    jiraInput({ issueIdOrKey: 'A?token=x' }),
    jiraInput({ issueIdOrKey: '' }),
  ]) await expectFetchCode(() => fetchSpecAdapterResult(input, capability, hashPort), 'INVALID_INPUT', 'secret')
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), fakeCapability('jira', 'https://api.atlassian.com/ex/jira/11234567-89ab-4cde-8f01-23456789abcd', () => ({})), hashPort),
    'DESTINATION_MISMATCH',
  )
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), fakeCapability('azure-devops', jiraDestinationBaseUrl, () => ({})), hashPort),
    'DESTINATION_MISMATCH',
  )
  assert.equal(calls, 0)
})

await run('capability shape and low-level failures collapse without source leakage', async () => {
  let invalidHashCalls = 0
  await expectFetchCode(
    () => fetchSpecAdapterResult(
      jiraInput(),
      fakeCapability('jira', jiraDestinationBaseUrl, () => { invalidHashCalls += 1; return {} }),
      {} as typeof hashPort,
    ),
    'INVALID_CAPABILITY',
  )
  assert.equal(invalidHashCalls, 0, 'invalid hash capability must fail before transport execution')
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), { providerId: 'jira', destinationBaseUrl: jiraDestinationBaseUrl } as unknown as SpecAdapterFetchCapability, hashPort),
    'INVALID_CAPABILITY',
  )
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), { ...fakeCapability('jira', jiraDestinationBaseUrl, () => ({})), extra: true } as unknown as SpecAdapterFetchCapability, hashPort),
    'INVALID_CAPABILITY',
  )
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), fakeCapability('jira', jiraDestinationBaseUrl, () => { throw new Error('SECRET-PORT-FAILURE') }), hashPort),
    'PORT_FAILURE',
    'SECRET-PORT-FAILURE',
  )
})

await run('response status, content type, final URL, body, and shape fail closed', async () => {
  const canonicalBody = exactBytes(jiraFixture.payload)
  const cases: Array<[unknown, string]> = [
    [{ status: 401, contentType: 'application/json', finalUrl: 'x', body: canonicalBody }, 'HTTP_REJECTED'],
    [{ status: 200, contentType: 'text/html', finalUrl: 'x', body: canonicalBody }, 'CONTENT_TYPE_REJECTED'],
    [{ status: 200, contentType: `application/json;${'x'.repeat(300)}`, finalUrl: 'x', body: canonicalBody }, 'CONTENT_TYPE_REJECTED'],
    [{ status: 200, contentType: 'application/json', finalUrl: 'https://evil.example.invalid/x', body: canonicalBody }, 'REDIRECT_REJECTED'],
    [{ status: 200, contentType: 'application/json', finalUrl: 'x', body: new Uint8Array() }, 'INVALID_RESPONSE'],
    [{ status: 200, contentType: 'application/json', finalUrl: 'x', body: new Uint8Array(SPEC_ADAPTER_FETCH_MAX_RESPONSE_BYTES + 1) }, 'RESPONSE_TOO_LARGE'],
    [{ status: 200, contentType: 'application/json', finalUrl: 'x', body: canonicalBody, extra: true }, 'INVALID_RESPONSE'],
    [null, 'INVALID_RESPONSE'],
  ]
  for (const [candidate, code] of cases) {
    const capability = fakeCapability('jira', jiraDestinationBaseUrl, (request) => {
      if (candidate && typeof candidate === 'object' && 'finalUrl' in candidate && (candidate as { finalUrl: string }).finalUrl === 'x') {
        return { ...candidate, finalUrl: request.url }
      }
      return candidate
    })
    await expectFetchCode(() => fetchSpecAdapterResult(jiraInput(), capability, hashPort), code)
  }
})

await run('response bytes are owned before caller mutation and downstream parsing sees the copy', async () => {
  const original = exactBytes(jiraFixture.payload)
  const expectedHash = crypto.createHash('sha256').update(original).digest('hex')
  const capability = fakeCapability('jira', jiraDestinationBaseUrl, (request) => response(request.url, original))
  const pending = fetchSpecAdapterResult(jiraInput(), capability, hashPort)
  const result = await pending
  original.fill(0)
  assert.equal(result.source.sourceSha256, expectedHash)
})

await run('provider parsers admit only the locked optional wire metadata names', async () => {
  const jiraUnknown = { ...structuredClone(jiraFixture.payload), changelog: 'SECRET-CHANGELOG' }
  const azureUnknown = { ...structuredClone(azureFixture.payload), relations: ['SECRET-RELATION'] }
  const jiraCapability = fakeCapability('jira', jiraDestinationBaseUrl, (request) => response(request.url, exactBytes(jiraUnknown)))
  const azureCapability = fakeCapability('azure-devops', 'https://dev.azure.com', (request) => response(request.url, exactBytes(azureUnknown)))
  await assert.rejects(() => fetchSpecAdapterResult(jiraInput(), jiraCapability, hashPort), /spec-adapter:jira-cloud-json-v1:INVALID_PAYLOAD/)
  await assert.rejects(() => fetchSpecAdapterResult(azureInput(), azureCapability, hashPort), /spec-adapter:azure-devops-work-item-json-v1:INVALID_PAYLOAD/)
  attacks += 2
})

await run('accessor, proxy, sparse, trailing-space, and typed-array traps fail closed', async () => {
  let inputGetterCalls = 0
  const accessorInput = Object.defineProperty({ ...jiraInput() }, 'sourceRef', {
    enumerable: true,
    get() { inputGetterCalls += 1; return 'SECRET-ACCESSOR' },
  })
  await expectFetchCode(
    () => fetchSpecAdapterResult(accessorInput, fakeCapability('jira', jiraDestinationBaseUrl, () => ({})), hashPort),
    'INVALID_INPUT',
    'SECRET-ACCESSOR',
  )
  assert.equal(inputGetterCalls, 0, 'input accessor must not execute')

  const sparseMapping = structuredClone(jiraFixture.mapping)
  sparseMapping.paragraphFields = Array(2)
  sparseMapping.paragraphFields[0] = 'description'
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput({ mapping: sparseMapping }), fakeCapability('jira', jiraDestinationBaseUrl, () => ({})), hashPort),
    'INVALID_INPUT',
  )

  const decoratedMapping = structuredClone(jiraFixture.mapping)
  Object.defineProperty(decoratedMapping.paragraphFields, 'extra', { value: 'SECRET-EXTRA', enumerable: true })
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput({ mapping: decoratedMapping }), fakeCapability('jira', jiraDestinationBaseUrl, () => ({})), hashPort),
    'INVALID_INPUT',
    'SECRET-EXTRA',
  )

  await expectFetchCode(
    () => fetchSpecAdapterResult(azureInput({ project: 'Synthetic Project ' }), fakeCapability('azure-devops', 'https://dev.azure.com', () => ({})), hashPort),
    'INVALID_INPUT',
  )

  let capabilityGetCalls = 0
  const proxiedCapability = new Proxy(
    fakeCapability('jira', jiraDestinationBaseUrl, (request) => response(request.url, exactBytes(jiraFixture.payload))),
    { get(target, property, receiver) { capabilityGetCalls += 1; return Reflect.get(target, property, receiver) } },
  )
  await fetchSpecAdapterResult(jiraInput(), proxiedCapability, hashPort)
  assert.equal(capabilityGetCalls, 0, 'capability must execute from its validated data-property snapshot')

  let hashGetCalls = 0
  const proxiedHashPort = new Proxy(hashPort, {
    get(target, property, receiver) { hashGetCalls += 1; return Reflect.get(target, property, receiver) },
  })
  await fetchSpecAdapterResult(
    jiraInput(),
    fakeCapability('jira', jiraDestinationBaseUrl, (request) => response(request.url, exactBytes(jiraFixture.payload))),
    proxiedHashPort,
  )
  assert.equal(hashGetCalls, 0, 'hash capability must execute from its validated data-property snapshot')

  const proxiedBody = new Proxy(exactBytes(jiraFixture.payload), {}) as Uint8Array
  await expectFetchCode(
    () => fetchSpecAdapterResult(
      jiraInput(),
      fakeCapability('jira', jiraDestinationBaseUrl, (request) => response(request.url, proxiedBody)),
      hashPort,
    ),
    'INVALID_RESPONSE',
  )

  let responseGetterCalls = 0
  const accessorResponse = Object.defineProperty(
    { status: 200, contentType: 'application/json', finalUrl: 'unused', body: exactBytes(jiraFixture.payload) },
    'finalUrl',
    { enumerable: true, get() { responseGetterCalls += 1; return 'SECRET-REDIRECT' } },
  )
  await expectFetchCode(
    () => fetchSpecAdapterResult(jiraInput(), fakeCapability('jira', jiraDestinationBaseUrl, () => accessorResponse), hashPort),
    'INVALID_RESPONSE',
    'SECRET-REDIRECT',
  )
  assert.equal(responseGetterCalls, 0, 'response accessor must not execute')
})

await run('public request and errors never expose credential-bearing fields', async () => {
  let serialized = ''
  const capability = fakeCapability('jira', jiraDestinationBaseUrl, (request) => {
    assert.equal(Object.isFrozen(request), true)
    serialized = JSON.stringify(request)
    return response(request.url, exactBytes(jiraFixture.payload))
  })
  await fetchSpecAdapterResult(jiraInput(), capability, hashPort)
  for (const forbidden of ['authorization', 'bearer', 'basic', 'token', 'password', 'cookie']) {
    assert.ok(!serialized.toLowerCase().includes(forbidden), `request exposed ${forbidden}`)
  }
})

console.log(`spec-adapter-fetch.test: PASS (${passed} behavior groups, ${attacks} attacks, one credential-free call per provider)`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
