import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  VERIFICATION_WRITER_ID,
  createBlockedVerificationReceipt,
  resolveCommandRunId,
  validateCommandRunId,
  validateVerificationWriterReceipt,
} from './verification-writer-adapter'

const UUID_A = '123e4567-e89b-42d3-a456-426614174000'
const UUID_B = '123e4567-e89b-42d3-b456-426614174001'
const NOW = '2026-08-15T10:20:30.000Z'

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

function expectRefusal(body: () => unknown, label: string): void {
  assert.throws(body, (error: unknown) => {
    assert.ok(error instanceof Error, `${label}: expected Error`)
    assert.equal(error.message, 'verification writer adapter refused')
    return true
  })
}

async function main(): Promise<void> {
  await test('R1 creates one UUID at an empty command boundary and validates it', () => {
    let calls = 0
    const runId = resolveCommandRunId(undefined, () => {
      calls += 1
      return UUID_A
    })
    assert.equal(runId, UUID_A)
    assert.equal(calls, 1)
  })

  await test('R1 preserves an explicit UUID without invoking the generator', () => {
    let calls = 0
    const runId = resolveCommandRunId(UUID_B, () => {
      calls += 1
      return UUID_A
    })
    assert.equal(runId, UUID_B)
    assert.equal(calls, 0)
  })

  await test('R1 rejects legacy, malformed, blank, and non-string run identities', () => {
    for (const value of ['run-123-deadbeef', '', '123e4567-e89b-42d3-7456-426614174000', null, 7]) {
      expectRefusal(() => resolveCommandRunId(value, () => UUID_A), `run id ${String(value)}`)
    }
  })

  await test('R1 low-level validation never generates a missing run identity', () => {
    expectRefusal(() => validateCommandRunId(undefined), 'missing low-level run id')
    assert.equal(validateCommandRunId(UUID_A), UUID_A)
  })

  await test('A1/S1 returns one exact closed receipt before record construction or sink use', () => {
    const receipt = createBlockedVerificationReceipt({ runId: UUID_A, createdAt: NOW })
    assert.deepEqual(Object.keys(receipt).sort(), [
      'createdAt',
      'outcome',
      'policyVersion',
      'reasonCode',
      'runId',
      'schemaVersion',
      'tenantContextStatus',
      'writerId',
    ])
    assert.deepEqual(receipt, {
      schemaVersion: 1,
      policyVersion: 'p17-016-v1',
      writerId: VERIFICATION_WRITER_ID,
      runId: UUID_A,
      tenantContextStatus: 'unavailable',
      outcome: 'blocked',
      reasonCode: 'tenant_attestation_unavailable',
      createdAt: NOW,
    })
    assert.ok(Object.isFrozen(receipt))
    assert.deepEqual(validateVerificationWriterReceipt(receipt), receipt)
  })

  await test('L1 rejects unknown/raw fields before creating a receipt', () => {
    for (const extra of [
      { repository: 'private-repo' },
      { feature: 'AdminRefundProcessing' },
      { path: 'C:/private/source.ts' },
      { prompt: 'raw prompt' },
      { log: 'raw log' },
      { tenantId: UUID_B },
      { sinkCapability: { persist: () => undefined } },
    ]) {
      expectRefusal(
        () => createBlockedVerificationReceipt({ runId: UUID_A, createdAt: NOW, ...extra }),
        `extra field ${Object.keys(extra)[0]}`,
      )
    }
  })

  await test('L1 rejects malformed time, UUID, prototype, and receipt tampering without echo', () => {
    expectRefusal(() => createBlockedVerificationReceipt({ runId: 'SECRET-RUN', createdAt: NOW }), 'secret run')
    expectRefusal(() => createBlockedVerificationReceipt({ runId: UUID_A, createdAt: 'tomorrow' }), 'bad time')
    const polluted = Object.create({ tenantId: UUID_B }) as Record<string, unknown>
    polluted.runId = UUID_A
    polluted.createdAt = NOW
    expectRefusal(() => createBlockedVerificationReceipt(polluted), 'prototype')

    const receipt = createBlockedVerificationReceipt({ runId: UUID_A, createdAt: NOW })
    for (const tampered of [
      { ...receipt, reasonCode: 'central_sink_unavailable' },
      { ...receipt, tenantContextStatus: 'attested' },
      { ...receipt, recordHash: 'a'.repeat(64) },
      { ...receipt, createdAt: '2026-08-15T10:20:30Z' },
    ]) expectRefusal(() => validateVerificationWriterReceipt(tampered), 'tampered receipt')
  })

  await test('adapter source has no environment, filesystem, process, network, sink, or raw-note dependency', () => {
    const source = fs.readFileSync(path.join(__dirname, 'verification-writer-adapter.ts'), 'utf8')
    for (const pattern of [
      /process\.env/,
      /node:fs|from ['"]fs['"]/,
      /child_process/,
      /fetch\s*\(/,
      /https?:\/\//,
      /SUPABASE/,
      /sinkCapability/,
      /code_path|spec_name|feature|repository|prompt|log_tail/,
    ]) assert.doesNotMatch(source, pattern)
  })

  console.log(`verification-writer-adapter.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
