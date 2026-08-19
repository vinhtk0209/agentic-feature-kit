import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv, { type AnySchema } from 'ajv'
import {
  C5B_OPERATIONS,
  C5B_POLICY_VERSION,
  C5B_REASON_CODES,
  C5B_SCHEMA_VERSION,
  computeC5BCompletionHash,
  createC5BOperationReceipt,
  createC5BPreflightPacket,
  evaluateC5BPreflight,
  validateC5BOperationReceipt,
  validateC5BPreflightPacket,
  type C5BOperationReceipt,
  type C5BPreflightPacket,
} from '../src/live-cutover-preflight'

const root = process.cwd()
const schemaPath = path.join(root, 'docs', 'schemas', 'p17-016-c5b-preflight-snapshot.schema.json')
const modulePath = path.join(root, 'packages', 'core', 'src', 'live-cutover-preflight.ts')
const hashes = Array.from({ length: 16 }, (_, index) => (index + 1).toString(16).repeat(64).slice(0, 64))
let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function packet(): C5BPreflightPacket {
  return createC5BPreflightPacket({
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: '11111111-1111-4111-8111-111111111111',
    approvalRef: 'c5b_approval_v1',
    environmentClass: 'managed_nonproduction',
    freezeStartsAt: '2026-08-20T01:00:00.000Z',
    freezeExpiresAt: '2026-08-20T02:00:00.000Z',
    destinationCapabilityId: 'protected_backup_vault',
    source: {
      migration0018Sha256: hashes[0],
      migration0019Sha256: hashes[1],
      rollback0018Sha256: hashes[2],
      rollback0019Sha256: hashes[3],
    },
    requirements: {
      providerRecoveryPoint: true,
      encryptedLogicalBackup: true,
      isolatedRestore: true,
      metadataOnlyEvidence: true,
    },
    limits: {
      maxStepDurationMs: 300_000,
      maxBackupBytes: 1_000_000_000,
      maxObjectCount: 10_000,
    },
  })
}

function timestamp(sequence: number, offsetSeconds = 0): string {
  return new Date(Date.parse('2026-08-20T01:00:00.000Z') + sequence * 60_000 + offsetSeconds * 1_000).toISOString()
}

function evidence(operation: (typeof C5B_OPERATIONS)[number], value: C5BPreflightPacket): Record<string, unknown> {
  switch (operation) {
    case 'attest_project':
      return { projectMatch: true, environmentClass: value.environmentClass }
    case 'probe_catalog_acl':
      return {
        catalogHash: hashes[4], aclHash: hashes[5], rpcHash: hashes[6], policyHash: hashes[7],
        extensionHash: hashes[8], migrationObjectCount: 17, writerActivityCount: 1,
      }
    case 'freeze_writers':
      return { freezeConfirmed: true, activeWriterCount: 0 }
    case 'create_provider_recovery_point':
      return { recoveryPointCreated: true, recoveryPointMetadataHash: hashes[9], expiresAt: '2026-08-21T02:00:00.000Z' }
    case 'create_encrypted_logical_backup':
      return {
        encrypted: true, byteCount: 42_000, backupSha256: hashes[10],
        manifestSha256: hashes[11], expiresAt: '2026-08-21T02:00:00.000Z',
      }
    case 'restore_isolated_backup':
      return { restored: true, isolated: true, sourceBackupSha256: hashes[10], restoreManifestSha256: hashes[11] }
    case 'verify_restored_state':
      return {
        catalogHash: hashes[4], aclHash: hashes[5], sourceBindingHash: value.sourceBindingHash,
        sourceParity: true, rollbackSuitePassed: true,
      }
    case 'cleanup_isolated_restore':
      return { cleanupConfirmed: true, residualResourceCount: 0 }
    case 'complete_preflight':
      throw new Error('completion evidence requires prior receipts')
  }
}

function canonicalReceipts(value: C5BPreflightPacket): C5BOperationReceipt[] {
  const receipts: C5BOperationReceipt[] = []
  for (const [sequence, operation] of C5B_OPERATIONS.entries()) {
    const stepEvidence = operation === 'complete_preflight'
      ? { allStepsPassed: true, completionHash: computeC5BCompletionHash(value, receipts) }
      : evidence(operation, value)
    receipts.push(createC5BOperationReceipt(value, {
      operation,
      status: 'passed',
      reasonCode: null,
      startedAt: timestamp(sequence),
      completedAt: timestamp(sequence, 5),
      evidence: stepEvidence,
    }))
  }
  return receipts
}

function replaceReceipt(
  value: C5BPreflightPacket,
  receipts: C5BOperationReceipt[],
  index: number,
  replacementEvidence: Record<string, unknown>,
): C5BOperationReceipt[] {
  const next = [...receipts]
  const current = receipts[index]
  next[index] = createC5BOperationReceipt(value, {
    operation: current.operation,
    status: 'passed',
    reasonCode: null,
    startedAt: current.startedAt,
    completedAt: current.completedAt,
    evidence: replacementEvidence,
  })
  return next
}

test('canonical packet, nine receipts, and completion receipt are immutable and schema-valid', () => {
  const value = packet()
  const receipts = canonicalReceipts(value)
  const result = evaluateC5BPreflight(value, receipts)
  assert.equal(result.ok, true)
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.source), true)
  assert.equal(receipts.length, 9)
  assert.deepEqual(receipts.map((receipt) => receipt.operation), C5B_OPERATIONS)
  assert.ok(result.ok)
  assert.equal(result.receipt.residualResourceCount, 0)
  const completionEvidence = receipts[8].evidence
  assert.ok(completionEvidence)
  assert.equal(result.receipt.completionHash, completionEvidence.completionHash)

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as AnySchema
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
  for (const candidate of [value, ...receipts, result.receipt]) {
    assert.equal(validate(candidate), true, JSON.stringify(validate.errors))
  }
})

test('schema rejects status, reason, sequence, operation, and evidence mismatches', () => {
  const value = packet()
  const receipts = canonicalReceipts(value)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as AnySchema
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema)
  const first = receipts[0]
  const attacks = [
    { ...clone(first), evidence: null },
    { ...clone(first), reasonCode: 'invalid_receipt' },
    { ...clone(first), status: 'refused', reasonCode: null, evidence: null },
    { ...clone(first), status: 'refused', reasonCode: 'provider_operation_refused' },
    { ...clone(first), sequence: 1 },
    { ...clone(first), operation: 'probe_catalog_acl' },
  ]
  for (const attacked of attacks) {
    assert.equal(validate(attacked), false, `schema accepted ${JSON.stringify(attacked)}`)
  }
})

test('packet validation rejects unknown fields, identity-shaped values, weak recovery, and invalid windows', () => {
  const value = packet()
  for (const attacked of [
    { ...clone(value), projectId: 'forbidden' },
    { ...clone(value), destinationCapabilityId: 'https://provider.invalid/path' },
    { ...clone(value), freezeExpiresAt: value.freezeStartsAt },
    { ...clone(value), requirements: { ...value.requirements, encryptedLogicalBackup: false } },
    { ...clone(value), limits: { ...value.limits, maxBackupBytes: 0 } },
    { ...clone(value), packetHash: hashes[15] },
  ]) assert.throws(() => validateC5BPreflightPacket(attacked))
})

test('receipt validator rejects unknown fields, raw error text, duration forgery, and packet drift', () => {
  const value = packet()
  const receipt = canonicalReceipts(value)[0]
  for (const attacked of [
    { ...clone(receipt), providerError: 'raw provider failure' },
    { ...clone(receipt), durationMs: receipt.durationMs + 1 },
    { ...clone(receipt), packetHash: hashes[15] },
    { ...clone(receipt), evidence: { ...receipt.evidence, projectUrl: 'forbidden' } },
  ]) assert.throws(() => validateC5BOperationReceipt(attacked, value))
})

test('ordering, identity, freeze, recovery, restore, parity, cleanup, and integrity attacks fail closed', () => {
  const value = packet()
  const receipts = canonicalReceipts(value)
  const attacks: Array<[string, C5BOperationReceipt[]]> = [
    ['missing operation', receipts.slice(0, -1)],
    ['duplicate operation', [...receipts.slice(0, 2), receipts[1], ...receipts.slice(3)]],
    ['wrong operation order', [receipts[1], receipts[0], ...receipts.slice(2)]],
    ['project mismatch', replaceReceipt(value, receipts, 0, { projectMatch: false, environmentClass: value.environmentClass })],
    ['active writer', replaceReceipt(value, receipts, 2, { freezeConfirmed: true, activeWriterCount: 1 })],
    ['missing provider recovery point', replaceReceipt(value, receipts, 3, { recoveryPointCreated: false, recoveryPointMetadataHash: hashes[9], expiresAt: '2026-08-21T02:00:00.000Z' })],
    ['unencrypted logical backup', replaceReceipt(value, receipts, 4, { ...evidence('create_encrypted_logical_backup', value), encrypted: false })],
    ['restore source mismatch', replaceReceipt(value, receipts, 5, { ...evidence('restore_isolated_backup', value), sourceBackupSha256: hashes[12] })],
    ['restored catalog drift', replaceReceipt(value, receipts, 6, { ...evidence('verify_restored_state', value), catalogHash: hashes[12] })],
    ['rollback suite failure', replaceReceipt(value, receipts, 6, { ...evidence('verify_restored_state', value), rollbackSuitePassed: false })],
    ['cleanup residual', replaceReceipt(value, receipts, 7, { cleanupConfirmed: true, residualResourceCount: 1 })],
    ['forged completion hash', replaceReceipt(value, receipts, 8, { allStepsPassed: true, completionHash: hashes[15] })],
  ]
  for (const [name, attacked] of attacks) {
    const result = evaluateC5BPreflight(value, attacked)
    assert.equal(result.ok, false, `${name} unexpectedly passed`)
    assert.equal(result.receipt, null, `${name} emitted a receipt`)
  }
})

test('refused operation, stale window, unexpired-artifact failure, and receipt forgery are closed', () => {
  const value = packet()
  const receipts = canonicalReceipts(value)
  const refused = [...receipts]
  refused[3] = createC5BOperationReceipt(value, {
    operation: 'create_provider_recovery_point', status: 'refused', reasonCode: 'provider_operation_refused',
    startedAt: receipts[3].startedAt, completedAt: receipts[3].completedAt, evidence: null,
  })
  const stale = clone(receipts)
  stale[1].startedAt = '2026-08-20T00:59:00.000Z'
  const expired = replaceReceipt(value, receipts, 3, {
    recoveryPointCreated: true, recoveryPointMetadataHash: hashes[9], expiresAt: receipts[8].completedAt,
  })
  const forged = clone(receipts)
  forged[4].receiptHash = hashes[15]
  for (const [name, attacked] of [['refused', refused], ['stale', stale], ['expired', expired], ['forged', forged]] as const) {
    const result = evaluateC5BPreflight(value, attacked)
    assert.equal(result.ok, false, `${name} unexpectedly passed`)
    assert.ok(C5B_REASON_CODES.includes(result.reasonCode))
  }
})

test('schema versions, operations, reason codes, and closed objects stay aligned with runtime', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
    $defs: Record<string, {
      enum?: unknown[]
      properties?: Record<string, { const?: unknown; enum?: unknown[] }>
      additionalProperties?: boolean
    }>
  }
  assert.equal(schema.$defs.packet.properties?.schemaVersion.const, C5B_SCHEMA_VERSION)
  assert.equal(schema.$defs.packet.properties?.policyVersion.const, C5B_POLICY_VERSION)
  assert.deepEqual(schema.$defs.operationReceipt.properties?.operation.enum, C5B_OPERATIONS)
  assert.deepEqual(schema.$defs.reasonCode.enum, C5B_REASON_CODES)
  for (const definition of Object.values(schema.$defs)) {
    if (definition.properties) assert.equal(definition.additionalProperties, false)
  }
})

test('core has no infrastructure imports and serialized success has no identity, secret, path, or provider text', () => {
  const source = fs.readFileSync(modulePath, 'utf8')
  for (const forbidden of [
    "from 'node:fs'", "from 'node:child_process'", "from 'node:process'", "from 'node:net'",
    'fetch(', 'process.env', 'SupabaseClient', 'pg_dump', 'pg_restore',
  ]) assert.equal(source.includes(forbidden), false, `core contains infrastructure surface ${forbidden}`)

  const value = packet()
  const result = evaluateC5BPreflight(value, canonicalReceipts(value))
  assert.ok(result.ok)
  const serialized = JSON.stringify({ value, receipt: result.receipt })
  const patterns = [
    /https:\/\/[a-z0-9]{20}\.example\.invalid/gi,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    /postgres(?:ql)?:\/\//gi,
    /[A-Za-z]:\\[^\s]+/g,
    /raw provider failure/gi,
  ]
  const controls = [
    `https://${'a'.repeat(20)}.example.invalid`,
    `eyJ${'A'.repeat(24)}.${'B'.repeat(12)}.${'C'.repeat(12)}`,
    ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    'postgresql://db.invalid/example',
    'C:\\backup\\private.dump',
    'raw provider failure',
  ]
  patterns.forEach((pattern, index) => {
    assert.ok(pattern.test(controls[index]), `privacy positive control ${index} failed`)
    pattern.lastIndex = 0
    assert.doesNotMatch(serialized, pattern)
  })
})

console.log(`\nlive-cutover-preflight.test: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
