import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  BlockedCentralWriterError,
  createUnavailableTenantReceipt,
  resolveCommandRunId,
  validateBlockedCentralWriterReceipt,
  validateCommandRunId,
} from '../src/blocked-central-writer'

const WRITER_A = 'kit.verification.record'
const WRITER_B = 'kit.telemetry.central-upsert'
const WRITER_C = 'kit.sync.install-report'
const UUID_A = '123e4567-e89b-42d3-a456-426614174000'
const UUID_B = '123e4567-e89b-42d3-b456-426614174001'
const NOW = '2026-08-15T12:34:56.000Z'

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
    assert.ok(error instanceof BlockedCentralWriterError, `${label}: expected BlockedCentralWriterError`)
    assert.equal(error.message, 'central writer compatibility refused')
    assert.match(error.ruleId, /^compat\./)
    assert.doesNotMatch(error.message, /secret|repository|tenant|token/i)
    return true
  })
}

async function main(): Promise<void> {
  await test('R1 creates exactly one UUID at an empty command boundary', () => {
    let calls = 0
    assert.equal(resolveCommandRunId(undefined, () => {
      calls += 1
      return UUID_A
    }), UUID_A)
    assert.equal(calls, 1)
  })

  await test('R1 preserves explicit UUIDs and low-level validation never generates', () => {
    let calls = 0
    assert.equal(resolveCommandRunId(UUID_B, () => {
      calls += 1
      return UUID_A
    }), UUID_B)
    assert.equal(calls, 0)
    assert.equal(validateCommandRunId(UUID_A), UUID_A)
    expectRefusal(() => validateCommandRunId(undefined), 'missing low-level identity')
  })

  await test('R1 rejects legacy, malformed, blank, and non-string identities', () => {
    for (const value of ['run-123-deadbeef', '', '123e4567-e89b-42d3-7456-426614174000', null, 7]) {
      expectRefusal(() => resolveCommandRunId(value, () => UUID_A), `run id ${String(value)}`)
    }
  })

  await test('A1/L1 creates an exact frozen receipt for either allowlisted writer', () => {
    for (const writerId of [WRITER_A, WRITER_B, WRITER_C]) {
      const receipt = createUnavailableTenantReceipt({ writerId, runId: UUID_A, createdAt: NOW })
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
        writerId,
        runId: UUID_A,
        tenantContextStatus: 'unavailable',
        outcome: 'blocked',
        reasonCode: 'tenant_attestation_unavailable',
        createdAt: NOW,
      })
      assert.ok(Object.isFrozen(receipt))
      assert.deepEqual(validateBlockedCentralWriterReceipt(receipt, writerId), receipt)
    }
  })

  await test('L1 rejects raw/unknown input and polluted prototypes before construction', () => {
    for (const extra of [
      { repository: 'private-repo' },
      { owner: 'private-owner' },
      { token: 'SECRET_TOKEN' },
      { kitVersion: '3.25.0' },
      { tenantId: UUID_B },
      { sinkCapability: { persist: () => undefined } },
    ]) expectRefusal(
      () => createUnavailableTenantReceipt({ writerId: WRITER_B, runId: UUID_A, createdAt: NOW, ...extra }),
      `extra ${Object.keys(extra)[0]}`,
    )

    const polluted = Object.create({ tenantId: UUID_B }) as Record<string, unknown>
    polluted.writerId = WRITER_B
    polluted.runId = UUID_A
    polluted.createdAt = NOW
    expectRefusal(() => createUnavailableTenantReceipt(polluted), 'prototype')
  })

  await test('L1 rejects malformed time, writer, and receipt tampering', () => {
    for (const writerId of ['SECRET WRITER', 'kit.unregistered.writer']) {
      expectRefusal(
        () => createUnavailableTenantReceipt({ writerId, runId: UUID_A, createdAt: NOW }),
        `writer ${writerId}`,
      )
    }
    expectRefusal(
      () => createUnavailableTenantReceipt({ writerId: WRITER_B, runId: UUID_A, createdAt: 'tomorrow' }),
      'time',
    )
    const receipt = createUnavailableTenantReceipt({ writerId: WRITER_B, runId: UUID_A, createdAt: NOW })
    for (const tampered of [
      { ...receipt, writerId: WRITER_A },
      { ...receipt, reasonCode: 'central_sink_unavailable' },
      { ...receipt, tenantContextStatus: 'attested' },
      { ...receipt, recordHash: 'a'.repeat(64) },
      { ...receipt, createdAt: '2026-08-15T12:34:56Z' },
    ]) expectRefusal(() => validateBlockedCentralWriterReceipt(tampered, WRITER_B), 'tampered receipt')
  })

  await test('shared core has no environment, filesystem, process, network, sink, or raw-data dependency', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'blocked-central-writer.ts'), 'utf8')
    for (const pattern of [
      /process\.env/,
      /node:fs|from ['"]fs['"]/,
      /child_process/,
      /fetch\s*\(/,
      /https?:\/\//,
      /SUPABASE/,
      /sinkCapability/,
      /repository|owner|token|kitVersion|tenantId|subjectId|feature|prompt|log_tail/,
    ]) assert.doesNotMatch(source, pattern)
  })

  console.log(`blocked-central-writer.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
