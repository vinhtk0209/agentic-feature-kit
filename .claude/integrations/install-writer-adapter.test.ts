import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  INSTALL_WRITER_ID,
  createBlockedInstallReceipt,
  resolveInstallCommandRunId,
  validateInstallCommandRunId,
  validateInstallWriterReceipt,
} from './install-writer-adapter'

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
    assert.equal(error.message, 'install writer adapter refused')
    assert.doesNotMatch(error.message, /secret|repository|tenant|token|version|target/i)
    return true
  })
}

test('I1 binds the exact canonical install writer ID', () => {
  assert.equal(INSTALL_WRITER_ID, 'kit.sync.install-report')
})

test('R1 creates once, preserves explicit UUIDs, and keeps validation generation-free', () => {
  let calls = 0
  assert.equal(resolveInstallCommandRunId(undefined, () => {
    calls += 1
    return UUID_A
  }), UUID_A)
  assert.equal(calls, 1)
  assert.equal(resolveInstallCommandRunId(UUID_B, () => {
    calls += 1
    return UUID_A
  }), UUID_B)
  assert.equal(calls, 1)
  assert.equal(validateInstallCommandRunId(UUID_A), UUID_A)
  expectRefusal(() => validateInstallCommandRunId(undefined), 'missing low-level run id')
})

test('T1/L1 returns the exact frozen unavailable-attestation receipt', () => {
  const receipt = createBlockedInstallReceipt({ runId: UUID_A, createdAt: NOW })
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    policyVersion: 'p17-016-v1',
    writerId: INSTALL_WRITER_ID,
    runId: UUID_A,
    tenantContextStatus: 'unavailable',
    outcome: 'blocked',
    reasonCode: 'tenant_attestation_unavailable',
    createdAt: NOW,
  })
  assert.ok(Object.isFrozen(receipt))
  assert.deepEqual(validateInstallWriterReceipt(receipt), receipt)
})

test('L1 refuses raw fields and writer/reason/context/hash tampering', () => {
  for (const extra of [
    { repository: 'private-repo' },
    { target: '../private-target' },
    { kitVersion: '3.25.0' },
    { token: 'SECRET_TOKEN' },
    { tenantId: UUID_B },
    { targetCount: 2 },
  ]) expectRefusal(
    () => createBlockedInstallReceipt({ runId: UUID_A, createdAt: NOW, ...extra }),
    `extra ${Object.keys(extra)[0]}`,
  )
  const receipt = createBlockedInstallReceipt({ runId: UUID_A, createdAt: NOW })
  for (const tampered of [
    { ...receipt, writerId: 'kit.telemetry.central-upsert' },
    { ...receipt, reasonCode: 'central_sink_unavailable' },
    { ...receipt, tenantContextStatus: 'attested' },
    { ...receipt, recordHash: 'a'.repeat(64) },
  ]) expectRefusal(() => validateInstallWriterReceipt(tampered), 'tamper')
})

test('adapter source is a thin no-I/O wrapper without raw install inputs', () => {
  const source = fs.readFileSync(path.join(__dirname, 'install-writer-adapter.ts'), 'utf8')
  assert.match(source, /blocked-central-writer/)
  for (const pattern of [
    /process\.env/,
    /node:fs|from ['"]fs['"]/,
    /child_process/,
    /fetch\s*\(/,
    /https?:\/\//,
    /SUPABASE/,
    /repository|target|kitVersion|tenantId|subjectId|targetCount/,
  ]) assert.doesNotMatch(source, pattern)
})

console.log(`install-writer-adapter.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
