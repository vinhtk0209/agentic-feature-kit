import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  RUN_VERSION_WRITER_ID,
  createBlockedRunVersionReceipt,
  resolveRunVersionCommandRunId,
  validateRunVersionCommandRunId,
  validateRunVersionWriterReceipt,
} from './run-version-writer-adapter'

const UUID_A = '123e4567-e89b-42d3-a456-426614174000'
const UUID_B = '123e4567-e89b-42d3-b456-426614174001'
const NOW = '2026-08-15T12:34:56.000Z'

let passed = 0
let failed = 0

function test(name: string, body: () => void): void {
  try {
    body()
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
    assert.equal(error.message, 'run-version writer adapter refused')
    assert.doesNotMatch(error.message, /secret|repository|tenant|token/i)
    return true
  })
}

test('U1 binds the exact canonical writer ID', () => {
  assert.equal(RUN_VERSION_WRITER_ID, 'kit.telemetry.central-upsert')
})

test('R1 creates once, preserves explicit UUIDs, and keeps low-level validation generation-free', () => {
  let calls = 0
  assert.equal(resolveRunVersionCommandRunId(undefined, () => {
    calls += 1
    return UUID_A
  }), UUID_A)
  assert.equal(calls, 1)
  assert.equal(resolveRunVersionCommandRunId(UUID_B, () => {
    calls += 1
    return UUID_A
  }), UUID_B)
  assert.equal(calls, 1)
  assert.equal(validateRunVersionCommandRunId(UUID_A), UUID_A)
  expectRefusal(() => validateRunVersionCommandRunId(undefined), 'missing low-level run id')
})

test('A1/S1 returns the exact frozen unavailable-attestation receipt', () => {
  const receipt = createBlockedRunVersionReceipt({ runId: UUID_A, createdAt: NOW })
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    policyVersion: 'p17-016-v1',
    writerId: RUN_VERSION_WRITER_ID,
    runId: UUID_A,
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: NOW,
  })
  assert.ok(Object.isFrozen(receipt))
  assert.deepEqual(validateRunVersionWriterReceipt(receipt), receipt)
})

test('L1 refuses raw fields and writer/reason/context/hash tampering', () => {
  for (const extra of [
    { repository: 'private-repo' },
    { owner: 'private-owner' },
    { token: 'SECRET_TOKEN' },
    { kitVersion: '3.25.0' },
    { tenantId: UUID_B },
  ]) expectRefusal(
    () => createBlockedRunVersionReceipt({ runId: UUID_A, createdAt: NOW, ...extra }),
    `extra ${Object.keys(extra)[0]}`,
  )
  const receipt = createBlockedRunVersionReceipt({ runId: UUID_A, createdAt: NOW })
  for (const tampered of [
    { ...receipt, writerId: 'kit.verification.record' },
    { ...receipt, reasonCode: 'central_sink_unavailable' },
    { ...receipt, tenantContextStatus: 'attested' },
    { ...receipt, recordHash: 'a'.repeat(64) },
  ]) expectRefusal(() => validateRunVersionWriterReceipt(tampered), 'tamper')
})

test('adapter source is a thin no-I/O wrapper without raw run-version inputs', () => {
  const source = fs.readFileSync(path.join(__dirname, 'run-version-writer-adapter.ts'), 'utf8')
  assert.match(source, /blocked-central-writer/)
  for (const pattern of [
    /process\.env/,
    /node:fs|from ['"]fs['"]/,
    /child_process/,
    /fetch\s*\(/,
    /https?:\/\//,
    /SUPABASE/,
    /repository|owner|token|kitVersion|tenantId|subjectId/,
  ]) assert.doesNotMatch(source, pattern)
})

console.log(`run-version-writer-adapter.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
