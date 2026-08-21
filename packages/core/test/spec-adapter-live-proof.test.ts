import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createSpecAdapterBearerCredential } from '../src/spec-adapter-fetch-node'
import {
  SpecAdapterLiveProofError,
  SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE,
  SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
  assessSpecAdapterLiveProofReadiness,
  createSpecAdapterLiveProofReceipt,
  validateSpecAdapterLiveProofReceipt,
} from '../src/spec-adapter-live-proof'
import { runNodeSpecAdapterLiveProof } from '../src/spec-adapter-live-proof-node'
import { createNodeSpecAdapterHashPort } from '../src/spec-adapter-node'

type JsonRecord = Record<string, any>

const root = process.cwd()
const encoder = new TextEncoder()
const hashPort = createNodeSpecAdapterHashPort()
const observedAt = '2026-08-21T00:00:00.000Z'
const jiraBase = 'https://api.atlassian.com/ex/jira/01234567-89ab-4cde-8f01-23456789abcd'
const azureBase = 'https://dev.azure.com'
const jiraFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-jira-minimal.json'), 'utf8')) as JsonRecord
const azureFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/fixtures/p17-004-azure-devops-minimal.json'), 'utf8')) as JsonRecord
let passed = 0
let attacks = 0

async function run(name: string, test: () => Promise<void> | void): Promise<void> {
  await test()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SPEC_ADAPTER_LIVE_PROOF_SCHEMA_VERSION,
    providerId: 'jira',
    executionMode: SPEC_ADAPTER_LIVE_PROOF_EXECUTION_MODE,
    status: 'passed',
    observedAt,
    reasonCodes: [],
    result: {
      adapterId: 'jira-cloud-json-v1',
      resultSchemaVersion: '1.1.0',
      sourceSha256: 'a'.repeat(64),
      paragraphCount: 2,
      acceptanceCriteriaCount: 1,
      unsupportedFieldCount: 1,
    },
    ...overrides,
  }
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof SpecAdapterLiveProofError)
    assert.equal(error.code, code)
    assert.ok(!error.message.includes('SECRET'))
    return true
  })
  attacks += 1
}

function response(url: string, payload: unknown): Response {
  const bytes = encoder.encode(JSON.stringify(payload))
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  return { status: 200, headers, url, redirected: false, body } as Response
}

function credential(providerId: 'jira' | 'azure-devops', destinationBaseUrl: string) {
  const accessToken = encoder.encode('synthetic.A2E-token_1234567890')
  const descriptor = createSpecAdapterBearerCredential({ providerId, destinationBaseUrl, accessToken })
  assert.ok(accessToken.every((byte) => byte === 0))
  return descriptor
}

function jiraInput() {
  return {
    providerId: 'jira' as const,
    baseUrl: jiraBase,
    issueIdOrKey: 'SYN-101',
    sourceRef: jiraFixture.sourceRef,
    mapping: structuredClone(jiraFixture.mapping),
  }
}

function azureInput() {
  return {
    providerId: 'azure-devops' as const,
    baseUrl: azureBase,
    organization: 'synthetic-org',
    project: 'Synthetic Project',
    workItemId: 202,
    sourceRef: azureFixture.sourceRef,
    mapping: structuredClone(azureFixture.mapping),
  }
}

async function withFetch(fake: typeof fetch, action: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch
  globalThis.fetch = fake
  try { await action() } finally { globalThis.fetch = original }
}

async function main(): Promise<void> {
await run('readiness is closed, frozen, and does not inspect coordinates or credentials', () => {
  const missing = assessSpecAdapterLiveProofReadiness({
    providerId: 'jira', itemInputPresent: false, bearerCapabilityPresent: false,
  })
  assert.deepEqual(missing, {
    schemaVersion: '1.0.0', providerId: 'jira', status: 'needs_input',
    reasonCodes: ['item_input_missing', 'bearer_capability_missing'],
  })
  assert.equal(Object.isFrozen(missing), true)
  assert.equal(Object.isFrozen(missing.reasonCodes), true)
  assert.equal(assessSpecAdapterLiveProofReadiness({
    providerId: 'azure-devops', itemInputPresent: true, bearerCapabilityPresent: true,
  }).status, 'ready')
  assert.deepEqual(assessSpecAdapterLiveProofReadiness({
    providerId: 'jira', itemInputPresent: false, bearerCapabilityPresent: true,
  }).reasonCodes, ['item_input_missing'])
  assert.deepEqual(assessSpecAdapterLiveProofReadiness({
    providerId: 'azure-devops', itemInputPresent: true, bearerCapabilityPresent: false,
  }).reasonCodes, ['bearer_capability_missing'])
})

await run('passed receipt is exact, content-addressed, validated, and deeply frozen', () => {
  const receipt = createSpecAdapterLiveProofReceipt(draft(), hashPort)
  assert.equal(receipt.status, 'passed')
  assert.match(receipt.integritySha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(validateSpecAdapterLiveProofReceipt(JSON.parse(JSON.stringify(receipt)), hashPort), receipt)
  assert.equal(Object.isFrozen(receipt), true)
  assert.equal(Object.isFrozen(receipt.reasonCodes), true)
  assert.equal(Object.isFrozen(receipt.result), true)
})

await run('receipt contradictions, tampering, and invalid hash capabilities fail closed', () => {
  for (const candidate of [
    draft({ extra: true }),
    draft({ providerId: 'unknown' }),
    draft({ reasonCodes: ['execution_rejected'] }),
    draft({ result: null }),
    draft({ observedAt: '2026-08-21' }),
    draft({ result: { ...draft().result as object, sourceSha256: 'SECRET' } }),
    draft({ result: { ...draft().result as object, paragraphCount: 0 } }),
    draft({ status: 'needs_input', reasonCodes: [], result: null }),
    draft({ status: 'needs_input', reasonCodes: ['bearer_capability_missing', 'item_input_missing'], result: null }),
    draft({ status: 'failed', reasonCodes: ['input_rejected', 'execution_rejected'], result: null }),
  ]) expectCode(() => createSpecAdapterLiveProofReceipt(candidate, hashPort), 'INVALID_RECEIPT')
  expectCode(() => createSpecAdapterLiveProofReceipt(draft(), { sha256: () => 'SECRET' }), 'HASH_FAILURE')
  expectCode(() => createSpecAdapterLiveProofReceipt(draft(), { sha256: () => { throw new Error('SECRET') } }), 'HASH_FAILURE')
  const receipt = createSpecAdapterLiveProofReceipt(draft(), hashPort)
  expectCode(() => validateSpecAdapterLiveProofReceipt({ ...receipt, integritySha256: 'b'.repeat(64) }, hashPort), 'INVALID_RECEIPT')
})

await run('accessor, inherited, sparse-array, and proxy inputs never execute hooks', () => {
  let hooks = 0
  const accessor = Object.defineProperty({}, 'providerId', { enumerable: true, get() { hooks += 1; return 'jira' } })
  expectCode(() => assessSpecAdapterLiveProofReadiness(accessor), 'INVALID_READINESS')
  const inherited = Object.create({ providerId: 'jira' })
  inherited.itemInputPresent = true
  inherited.bearerCapabilityPresent = true
  expectCode(() => assessSpecAdapterLiveProofReadiness(inherited), 'INVALID_READINESS')
  const sparse = [] as string[]
  sparse.length = 1
  expectCode(() => createSpecAdapterLiveProofReceipt(draft({ reasonCodes: sparse }), hashPort), 'INVALID_RECEIPT')
  const proxied = new Proxy(draft(), { ownKeys() { hooks += 1; throw new Error('SECRET') } })
  expectCode(() => createSpecAdapterLiveProofReceipt(proxied, hashPort), 'INVALID_RECEIPT')
  assert.equal(hooks, 1)
})

await run('missing Jira and Azure inputs emit needs_input with zero provider I/O', async () => {
  let calls = 0
  await withFetch((async () => { calls += 1; throw new Error('SECRET') }) as typeof fetch, async () => {
    const jira = await runNodeSpecAdapterLiveProof({ providerId: 'jira', input: null, credential: null })
    const azure = await runNodeSpecAdapterLiveProof({ providerId: 'azure-devops', input: null, credential: null })
    const jiraItemMissing = await runNodeSpecAdapterLiveProof({
      providerId: 'jira', input: null, credential: credential('jira', jiraBase),
    })
    const azureCredentialMissing = await runNodeSpecAdapterLiveProof({
      providerId: 'azure-devops', input: azureInput(), credential: null,
    })
    assert.equal(jira.status, 'needs_input')
    assert.equal(azure.status, 'needs_input')
    assert.deepEqual(jira.reasonCodes, ['item_input_missing', 'bearer_capability_missing'])
    assert.deepEqual(azure.reasonCodes, ['item_input_missing', 'bearer_capability_missing'])
    assert.deepEqual(jiraItemMissing.reasonCodes, ['item_input_missing'])
    assert.deepEqual(azureCredentialMissing.reasonCodes, ['bearer_capability_missing'])
    for (const receipt of [jira, azure, jiraItemMissing, azureCredentialMissing]) {
      assert.deepEqual(validateSpecAdapterLiveProofReceipt(receipt, hashPort), receipt)
    }
    assert.ok(!JSON.stringify([jira, azure, jiraItemMissing, azureCredentialMissing]).includes('SECRET'))
  })
  assert.equal(calls, 0)
  attacks += 4
})

await run('malformed item and forged bearer descriptors fail before provider I/O', async () => {
  let calls = 0
  await withFetch((async () => { calls += 1; throw new Error('SECRET') }) as typeof fetch, async () => {
    const invalid = await runNodeSpecAdapterLiveProof({ providerId: 'jira', input: { ...jiraInput(), baseUrl: 'https://example.invalid' }, credential: {} as any })
    assert.deepEqual(invalid.reasonCodes, ['input_rejected'])
    const invalidEnvelope = await runNodeSpecAdapterLiveProof({ providerId: 'jira', input: null, credential: null, extra: true })
    assert.equal(invalidEnvelope.providerId, 'unknown')
    assert.deepEqual(invalidEnvelope.reasonCodes, ['input_rejected'])
    const forged = await runNodeSpecAdapterLiveProof({
      providerId: 'jira', input: jiraInput(),
      credential: { kind: 'spec-adapter-bearer-v1', providerId: 'jira', destinationBaseUrl: jiraBase },
    })
    assert.deepEqual(forged.reasonCodes, ['capability_rejected'])
    const malformedMapping = jiraInput()
    malformedMapping.mapping.paragraphFields = []
    const nested = await runNodeSpecAdapterLiveProof({
      providerId: 'jira', input: malformedMapping, credential: credential('jira', jiraBase),
    })
    assert.deepEqual(nested.reasonCodes, ['execution_rejected'])
    for (const receipt of [invalid, invalidEnvelope, forged, nested]) {
      assert.deepEqual(validateSpecAdapterLiveProofReceipt(receipt, hashPort), receipt)
    }
  })
  assert.equal(calls, 0)
  attacks += 4
})

await run('default Node transport composes one synthetic Jira call into metadata only', async () => {
  let calls = 0
  await withFetch((async (input) => {
    calls += 1
    return response(String(input), jiraFixture.payload)
  }) as typeof fetch, async () => {
    const receipt = await runNodeSpecAdapterLiveProof({
      providerId: 'jira', input: jiraInput(), credential: credential('jira', jiraBase),
    })
    assert.equal(receipt.status, 'passed')
    assert.equal(receipt.providerId, 'jira')
    assert.equal(receipt.result?.adapterId, 'jira-cloud-json-v1')
    assert.equal(receipt.result?.sourceSha256, hashPort.sha256(encoder.encode(JSON.stringify(jiraFixture.payload))))
    assert.deepEqual(validateSpecAdapterLiveProofReceipt(receipt, hashPort), receipt)
    const serialized = JSON.stringify(receipt)
    for (const forbidden of [jiraBase, 'SYN-101', jiraFixture.sourceRef, jiraFixture.payload.fields.summary]) {
      assert.ok(!serialized.includes(forbidden))
    }
  })
  assert.equal(calls, 1)
})

await run('default Node transport composes one synthetic Azure call into metadata only', async () => {
  const payload = structuredClone(azureFixture.payload)
  payload.url = 'https://dev.azure.com/synthetic-org/_apis/wit/workitems/202'
  let calls = 0
  await withFetch((async (input) => {
    calls += 1
    return response(String(input), payload)
  }) as typeof fetch, async () => {
    const receipt = await runNodeSpecAdapterLiveProof({
      providerId: 'azure-devops', input: azureInput(), credential: credential('azure-devops', azureBase),
    })
    assert.equal(receipt.status, 'passed')
    assert.equal(receipt.result?.adapterId, 'azure-devops-work-item-json-v1')
    assert.deepEqual(validateSpecAdapterLiveProofReceipt(receipt, hashPort), receipt)
    const serialized = JSON.stringify(receipt)
    for (const forbidden of [azureBase, 'synthetic-org', 'Synthetic Project', azureFixture.sourceRef]) {
      assert.ok(!serialized.includes(forbidden))
    }
  })
  assert.equal(calls, 1)
})

await run('provider failures collapse to one closed code without diagnostic leakage', async () => {
  await withFetch((async () => { throw new Error('SECRET-DNS-DETAIL') }) as typeof fetch, async () => {
    const receipt = await runNodeSpecAdapterLiveProof({
      providerId: 'jira', input: jiraInput(), credential: credential('jira', jiraBase),
    })
    assert.equal(receipt.status, 'failed')
    assert.deepEqual(receipt.reasonCodes, ['execution_rejected'])
    assert.deepEqual(validateSpecAdapterLiveProofReceipt(receipt, hashPort), receipt)
    assert.ok(!JSON.stringify(receipt).includes('SECRET'))
  })
  attacks += 1
})

await run('pure receipt contract stays below the TypeScript reconsideration threshold', () => {
  const samples: number[] = []
  for (let index = 0; index < 100; index += 1) {
    const start = performance.now()
    const receipt = createSpecAdapterLiveProofReceipt(draft({ observedAt: `2026-08-21T00:00:${String(index % 60).padStart(2, '0')}.000Z` }), hashPort)
    validateSpecAdapterLiveProofReceipt(receipt, hashPort)
    samples.push(performance.now() - start)
  }
  samples.sort((left, right) => left - right)
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
  assert.ok(p95 < 50, `A2E receipt p95 ${p95.toFixed(3)}ms exceeds 50ms`)
  console.log(`A2E receipt benchmark: 100 iterations, p95=${p95.toFixed(3)}ms`)
})

const pureSource = fs.readFileSync(path.join(root, 'packages/core/src/spec-adapter-live-proof.ts'), 'utf8')
const nodeSource = fs.readFileSync(path.join(root, 'packages/core/src/spec-adapter-live-proof-node.ts'), 'utf8')
for (const forbidden of ['process.env', 'readFile', 'writeFile', 'console.', 'child_process', 'authorization', 'accessToken']) {
  assert.ok(!pureSource.includes(forbidden), `pure source contains forbidden boundary: ${forbidden}`)
}
for (const forbidden of ['process.env', 'readFile', 'writeFile', 'console.', 'child_process', 'SpecAdapterFetchNodeDependencies']) {
  assert.ok(!nodeSource.includes(forbidden), `Node source contains forbidden boundary: ${forbidden}`)
}
assert.ok(nodeSource.includes('createNodeSpecAdapterFetchCapability(config, credential)'))

console.log(`spec-adapter-live-proof.test: PASS (${passed} behavior groups, ${attacks} attacks; synthetic default-fetch coverage only; live readiness=needs_input for 2 providers)`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
