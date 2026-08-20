import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import {
  C5B_POLICY_VERSION,
  C5B_SCHEMA_VERSION,
  createC5BOperationReceipt,
  createC5BPreflightPacket,
  type C5BOperation,
  type C5BOperationReceipt,
  type C5BPreflightPacket,
} from '../src/live-cutover-preflight'
import type { C5BOperatorContext, C5BPortDecision } from '../src/live-cutover-preflight-operator'
import {
  qualifyC5BExecutableCapabilities,
  type C5BExecutableProbeExecution,
  type C5BExecutableProbeExecutor,
  type C5BExecutableProbeRequest,
  type C5BExecutableQualification,
} from '../src/live-cutover-executable-qualification-node'
import {
  qualifyC5BConnectionMaterial,
  type C5BConnectionMaterialQualification,
} from '../src/live-cutover-connection-material-qualification-node'
import {
  createC5BLogicalBackupNodePorts,
  createNodeC5BPipelineExecutor,
  type C5BLogicalBackupNodeConfig,
  type C5BPipelineExecution,
  type C5BPipelineExecutionRequest,
  type C5BPipelineExecutor,
  type C5BSpawnFactory,
} from '../src/live-cutover-logical-backup-node'

const hashes = Array.from({ length: 16 }, (_, index) => (index + 1).toString(16).repeat(64).slice(0, 64))
const encryptedFixture = Buffer.from('age-encrypted-fixture')
const manifestFixture = 'manifest-entry\n'
const rawSecretControl = 'raw-process-secret-must-not-escape'

interface QualifiedToolFixture {
  readonly pgDump: string
  readonly pgRestore: string
  readonly age: string
  readonly postgresReceipt: string
  readonly ageReceipt: string
  readonly capability: C5BExecutableQualification
}

interface QualifiedConnectionFixture {
  readonly pgServiceFile: string
  readonly pgPassFile: string
  readonly recipientsFile: string
  readonly identityFile: string
  readonly destinationDirectory: string
  readonly capability: C5BConnectionMaterialQualification
}

let qualifiedToolFixture: QualifiedToolFixture

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function packet(overrides: Partial<Parameters<typeof createC5BPreflightPacket>[0]> = {}): C5BPreflightPacket {
  return createC5BPreflightPacket({
    schemaVersion: C5B_SCHEMA_VERSION,
    policyVersion: C5B_POLICY_VERSION,
    attemptId: '123e4567-e89b-42d3-a456-426614174000',
    approvalRef: 'operator_approval',
    environmentClass: 'managed_nonproduction',
    freezeStartsAt: '2026-08-20T01:00:00.000Z',
    freezeExpiresAt: '2026-08-20T02:00:00.000Z',
    destinationCapabilityId: 'protected_backup',
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
    limits: { maxStepDurationMs: 10_000, maxBackupBytes: 50_000, maxObjectCount: 100 },
    ...overrides,
  })
}

function evidence(operation: Exclude<C5BOperation, 'complete_preflight'>, value: C5BPreflightPacket): Record<string, unknown> {
  switch (operation) {
    case 'attest_project': return { projectMatch: true, environmentClass: value.environmentClass }
    case 'probe_catalog_acl': return {
      catalogHash: hashes[4], aclHash: hashes[5], rpcHash: hashes[6], policyHash: hashes[7],
      extensionHash: hashes[8], migrationObjectCount: 4, writerActivityCount: 0,
    }
    case 'freeze_writers': return { freezeConfirmed: true, activeWriterCount: 0 }
    case 'create_provider_recovery_point': return {
      recoveryPointCreated: true, recoveryPointMetadataHash: hashes[9], expiresAt: '2026-08-21T02:00:00.000Z',
    }
    case 'create_encrypted_logical_backup': return {
      encrypted: true, byteCount: encryptedFixture.length, backupSha256: sha256(encryptedFixture),
      manifestSha256: sha256(manifestFixture), expiresAt: '2026-08-21T01:00:00.000Z',
    }
    case 'restore_isolated_backup': return {
      restored: true, isolated: true, sourceBackupSha256: sha256(encryptedFixture),
      restoreManifestSha256: sha256(manifestFixture),
    }
    case 'verify_restored_state': return {
      catalogHash: hashes[4], aclHash: hashes[5], sourceBindingHash: value.sourceBindingHash,
      sourceParity: true, rollbackSuitePassed: true,
    }
    case 'cleanup_isolated_restore': return { cleanupConfirmed: true, residualResourceCount: 0 }
  }
}

function context(receiptCount: 4 | 5, value = packet(), backupEvidence?: Record<string, unknown>): C5BOperatorContext {
  const operations = [
    'attest_project', 'probe_catalog_acl', 'freeze_writers', 'create_provider_recovery_point',
    'create_encrypted_logical_backup',
  ] as const
  const receipts: C5BOperationReceipt[] = []
  for (let index = 0; index < receiptCount; index += 1) {
    const operation = operations[index]
    receipts.push(createC5BOperationReceipt(value, {
      operation,
      status: 'passed',
      reasonCode: null,
      startedAt: new Date(Date.parse('2026-08-20T01:00:00.000Z') + index * 1_000).toISOString(),
      completedAt: new Date(Date.parse('2026-08-20T01:00:00.000Z') + index * 1_000 + 500).toISOString(),
      evidence: operation === 'create_encrypted_logical_backup' && backupEvidence
        ? backupEvidence
        : evidence(operation, value),
    }))
  }
  return { packet: value, receipts }
}

function successExecution(overrides: Partial<C5BPipelineExecution> = {}): C5BPipelineExecution {
  return {
    ok: true,
    sourceExitCode: 0,
    sinkExitCode: 0,
    sourceSignal: null,
    sinkSignal: null,
    timedOut: false,
    outputCapped: false,
    byteCount: 0,
    sha256: sha256(''),
    capturedOutput: '',
    ...overrides,
  }
}

class FakeExecutor implements C5BPipelineExecutor {
  readonly calls: C5BPipelineExecutionRequest[] = []
  readonly queue: C5BPipelineExecution[] = []

  async execute(request: C5BPipelineExecutionRequest): Promise<C5BPipelineExecution> {
    this.calls.push(request)
    const next = this.queue.shift() ?? successExecution()
    if (request.output.kind === 'file' && next.ok) {
      fs.writeFileSync(request.output.path, encryptedFixture, { flag: 'wx', mode: request.output.mode })
    }
    return next
  }
}

class QualificationProbeExecutor implements C5BExecutableProbeExecutor {
  async probe(request: C5BExecutableProbeRequest): Promise<C5BExecutableProbeExecution> {
    const stdout = request.role === 'pg_dump'
      ? 'pg_dump (PostgreSQL) 17.11\n'
      : request.role === 'pg_restore'
        ? 'pg_restore (PostgreSQL) 17.11\n'
        : 'v1.2.1\n'
    return { ok: true, exitCode: 0, signal: null, timedOut: false, outputCapped: false, stdout, stderr: '' }
  }
}

async function createQualifiedToolFixture(root: string): Promise<QualifiedToolFixture> {
  const bin = path.join(root, 'bin')
  const receipts = path.join(root, 'receipts')
  fs.mkdirSync(bin, { recursive: true })
  fs.mkdirSync(receipts, { recursive: true })
  const pgDump = path.join(bin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump')
  const pgRestore = path.join(bin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore')
  const age = path.join(bin, process.platform === 'win32' ? 'age.exe' : 'age')
  const postgresReceipt = path.join(receipts, 'postgres.receipt')
  const ageReceipt = path.join(receipts, 'age.receipt')
  fs.writeFileSync(pgDump, 'qualified-pg-dump-bytes')
  fs.writeFileSync(pgRestore, 'qualified-pg-restore-bytes')
  fs.writeFileSync(age, 'qualified-age-bytes')
  fs.writeFileSync(postgresReceipt, 'externally-verified-postgres-receipt')
  fs.writeFileSync(ageReceipt, 'externally-verified-age-receipt')
  const expectation = (executablePath: string, provenanceReceiptPath: string, expectedVersion: string) => ({
    executablePath,
    executableSha256: sha256(fs.readFileSync(executablePath)),
    provenanceReceiptPath,
    provenanceReceiptSha256: sha256(fs.readFileSync(provenanceReceiptPath)),
    expectedVersion,
  })
  const result = await qualifyC5BExecutableCapabilities({
    pgDump: expectation(pgDump, postgresReceipt, '17.11'),
    pgRestore: expectation(pgRestore, postgresReceipt, '17.11'),
    age: expectation(age, ageReceipt, '1.2.1'),
    qualificationTtlMs: 3_600_000,
    maxQualificationTtlMs: 7_200_000,
    maxExecutableBytes: 1_000_000,
    maxProvenanceBytes: 1_000_000,
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
    now: () => '2026-08-20T01:00:00.000Z',
  }, new QualificationProbeExecutor())
  if (result.status !== 'qualified') throw new Error('test executable qualification refused')
  return { pgDump, pgRestore, age, postgresReceipt, ageReceipt, capability: result.capability }
}

async function createQualifiedConnectionFixture(root: string): Promise<QualifiedConnectionFixture> {
  const material = path.join(root, 'secrets')
  const destinationDirectory = path.join(root, 'protected')
  fs.mkdirSync(material, { recursive: true, mode: 0o700 })
  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 })
  const pgServiceFile = path.join(material, 'pg_service.conf')
  const pgPassFile = path.join(material, 'pgpass.conf')
  const recipientsFile = path.join(material, 'recipients.txt')
  const identityFile = path.join(material, 'identity.txt')
  const recipient = `age1${'q'.repeat(58)}`
  const identity = `${['AGE', 'SECRET', 'KEY', '1'].join('-')}${'Q'.repeat(58)}`
  fs.writeFileSync(pgServiceFile, [
    '[source_db]', 'host=source.example.invalid', 'port=5432', 'dbname=postgres', 'user=backup_user',
    'sslmode=verify-full', 'sslrootcert=system', 'connect_timeout=5', '',
    '[restore_db]', 'host=127.0.0.1', 'port=55432', 'dbname=restore', 'user=restore_user',
    'sslmode=verify-full', 'sslrootcert=system', 'connect_timeout=5', '',
  ].join('\n'), { mode: 0o600 })
  fs.writeFileSync(pgPassFile, [
    'source.example.invalid:5432:postgres:backup_user:synthetic-source-password',
    '127.0.0.1:55432:restore:restore_user:synthetic-restore-password',
    '',
  ].join('\n'), { mode: 0o600 })
  fs.writeFileSync(recipientsFile, `${recipient}\n`, { mode: 0o600 })
  fs.writeFileSync(identityFile, `# synthetic fixture\n${identity}\n`, { mode: 0o600 })
  if (process.platform !== 'win32') {
    for (const file of [pgServiceFile, pgPassFile, recipientsFile, identityFile]) fs.chmodSync(file, 0o600)
    fs.chmodSync(destinationDirectory, 0o700)
  }
  const expectation = (filePath: string) => ({
    path: filePath,
    sha256: sha256(fs.readFileSync(filePath)),
    maxBytes: 64 * 1024,
  })
  const result = await qualifyC5BConnectionMaterial({
    destinationCapabilityId: 'protected_backup',
    destinationDirectory,
    sourceServiceCapability: 'source_db',
    isolatedServiceCapability: 'restore_db',
    pgServiceFile: expectation(pgServiceFile),
    pgPassFile: expectation(pgPassFile),
    recipientsFile: expectation(recipientsFile),
    identityFile: expectation(identityFile),
    qualificationTtlMs: 3_600_000,
    maxQualificationTtlMs: 7_200_000,
    now: () => '2026-08-20T01:00:00.000Z',
    platform: process.platform,
    environmentSource: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: rawSecretControl,
      PGPASSWORD: rawSecretControl,
      PGSERVICEFILE: rawSecretControl,
    },
  })
  if (result.status !== 'qualified') throw new Error('test connection-material qualification refused')
  return { pgServiceFile, pgPassFile, recipientsFile, identityFile, destinationDirectory, capability: result.capability }
}

function config(root: string, overrides: Partial<C5BLogicalBackupNodeConfig> = {}): C5BLogicalBackupNodeConfig {
  return {
    destinationCapabilityId: 'protected_backup',
    destinationDirectory: path.join(root, 'protected'),
    sourceServiceCapability: 'source_db',
    isolatedServiceCapability: 'restore_db',
    pgDumpExecutable: qualifiedToolFixture.pgDump,
    pgRestoreExecutable: qualifiedToolFixture.pgRestore,
    ageExecutable: qualifiedToolFixture.age,
    executableQualification: qualifiedToolFixture.capability,
    pgServiceFile: path.join(root, 'secrets', 'pg_service.conf'),
    pgPassFile: path.join(root, 'secrets', 'pgpass.conf'),
    connectionMaterialQualification: {
      kind: 'c5b-connection-material-qualification', receiptHash: '0'.repeat(64),
    } as C5BConnectionMaterialQualification,
    recipientsFile: path.join(root, 'secrets', 'recipients.txt'),
    identityFile: path.join(root, 'secrets', 'identity.txt'),
    retentionMs: 86_400_000,
    maxRetentionMs: 604_800_000,
    timeoutMs: 10_000,
    maxOutputBytes: 64_000,
    now: () => '2026-08-20T01:00:00.000Z',
    ...overrides,
  }
}

async function preparedConfig(
  root: string,
  overrides: Partial<C5BLogicalBackupNodeConfig> = {},
): Promise<C5BLogicalBackupNodeConfig> {
  const material = await createQualifiedConnectionFixture(root)
  return config(root, {
    destinationDirectory: material.destinationDirectory,
    pgServiceFile: material.pgServiceFile,
    pgPassFile: material.pgPassFile,
    recipientsFile: material.recipientsFile,
    identityFile: material.identityFile,
    connectionMaterialQualification: material.capability,
    ...overrides,
  })
}

function assertRefused(decision: C5BPortDecision, reasonCode: string): void {
  assert.deepEqual(decision, { status: 'refused', reasonCode })
  assert.equal(JSON.stringify(decision).includes(rawSecretControl), false)
}

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(error)
  }
}

async function main(): Promise<void> {
const canonicalTempRoot = fs.realpathSync.native(os.tmpdir())
const scratch = fs.mkdtempSync(path.join(canonicalTempRoot, 'c5b-logical-backup-'))
qualifiedToolFixture = await createQualifiedToolFixture(path.join(scratch, 'qualified-tools'))

await test('configuration is closed, path-safe, secret-free, and rejects capability ambiguity', async () => {
  const valid = await preparedConfig(path.join(scratch, 'valid-config'))
  for (const override of [
    { destinationCapabilityId: 'bad;capability' },
    { sourceServiceCapability: 'same_db', isolatedServiceCapability: 'same_db' },
    { destinationDirectory: 'relative-path' },
    { destinationDirectory: path.parse(scratch).root },
    { identityFile: path.join(valid.destinationDirectory, 'identity.txt') },
    { recipientsFile: path.join(valid.destinationDirectory, 'recipients.txt') },
    { sourceServiceCapability: `source_db\n${rawSecretControl}` },
    { timeoutMs: 0 },
    { retentionMs: 700_000_000 },
  ] satisfies Array<Partial<C5BLogicalBackupNodeConfig>>) {
    let message = ''
    try { createC5BLogicalBackupNodePorts({ ...valid, ...override }, new FakeExecutor()) } catch (error) { message = String(error) }
    assert.match(message, /C5B logical-backup adapter configuration refused/)
    assert.equal(message.includes(rawSecretControl), false)
  }
})

await test('invalid context, destination mismatch, and wrong prefix stop before any process', async () => {
  const executor = new FakeExecutor()
  const ports = createC5BLogicalBackupNodePorts(await preparedConfig(path.join(scratch, 'invalid-context')), executor)
  assertRefused(await ports.createEncryptedLogicalBackup({ packet: packet(), receipts: [] }), 'logical_backup_invalid')
  const mismatch = packet({ destinationCapabilityId: 'other_backup' })
  assertRefused(await ports.createEncryptedLogicalBackup(context(4, mismatch)), 'logical_backup_invalid')
  assertRefused(await ports.restoreIsolatedBackup(context(4)), 'restore_invalid')
  assert.equal(executor.calls.length, 0)
})

await test('forged or stale executable capability stops both parent ports before any pipeline', async () => {
  const valid = await preparedConfig(path.join(scratch, 'forged-executable'))
  assert.throws(() => createC5BLogicalBackupNodePorts({ ...valid,
    executableQualification: { ...qualifiedToolFixture.capability },
  }, new FakeExecutor()), /C5B logical-backup adapter configuration refused/)

  const backupRoot = path.join(scratch, 'stale-before-backup')
  const backupTools = await createQualifiedToolFixture(path.join(backupRoot, 'tools'))
  const backupExecutor = new FakeExecutor()
  const backupPorts = createC5BLogicalBackupNodePorts(await preparedConfig(backupRoot, {
    pgDumpExecutable: backupTools.pgDump,
    pgRestoreExecutable: backupTools.pgRestore,
    ageExecutable: backupTools.age,
    executableQualification: backupTools.capability,
  }), backupExecutor)
  fs.writeFileSync(backupTools.age, 'replaced-after-qualification')
  assertRefused(await backupPorts.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
  assert.equal(backupExecutor.calls.length, 0)

  const restoreRoot = path.join(scratch, 'stale-before-restore')
  const restoreTools = await createQualifiedToolFixture(path.join(restoreRoot, 'tools'))
  const restoreExecutor = new FakeExecutor()
  restoreExecutor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
  )
  const restorePorts = createC5BLogicalBackupNodePorts(await preparedConfig(restoreRoot, {
    pgDumpExecutable: restoreTools.pgDump,
    pgRestoreExecutable: restoreTools.pgRestore,
    ageExecutable: restoreTools.age,
    executableQualification: restoreTools.capability,
  }), restoreExecutor)
  const backupDecision = await restorePorts.createEncryptedLogicalBackup(context(4))
  assert.equal(backupDecision.status, 'passed')
  if (backupDecision.status !== 'passed') return
  fs.writeFileSync(restoreTools.ageReceipt, 'replaced-provenance-after-qualification')
  assertRefused(await restorePorts.restoreIsolatedBackup(context(5, packet(), backupDecision.evidence)), 'restore_invalid')
  assert.equal(restoreExecutor.calls.length, 2)
})

await test('forged or stale connection-material capability stops both parent ports before any pipeline', async () => {
  const forgedConfig = await preparedConfig(path.join(scratch, 'forged-connection'))
  assert.throws(() => createC5BLogicalBackupNodePorts({
    ...forgedConfig,
    connectionMaterialQualification: { ...forgedConfig.connectionMaterialQualification },
  }, new FakeExecutor()), /C5B logical-backup adapter configuration refused/)

  const backupRoot = path.join(scratch, 'stale-connection-before-backup')
  const backupConfig = await preparedConfig(backupRoot)
  const backupExecutor = new FakeExecutor()
  const backupPorts = createC5BLogicalBackupNodePorts(backupConfig, backupExecutor)
  fs.writeFileSync(backupConfig.pgPassFile, `${rawSecretControl}\n`)
  assertRefused(await backupPorts.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
  assert.equal(backupExecutor.calls.length, 0)

  const restoreRoot = path.join(scratch, 'stale-connection-before-restore')
  const restoreConfig = await preparedConfig(restoreRoot)
  const restoreExecutor = new FakeExecutor()
  restoreExecutor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
  )
  const restorePorts = createC5BLogicalBackupNodePorts(restoreConfig, restoreExecutor)
  const backupDecision = await restorePorts.createEncryptedLogicalBackup(context(4))
  assert.equal(backupDecision.status, 'passed')
  if (backupDecision.status !== 'passed') return
  fs.writeFileSync(restoreConfig.identityFile, `${rawSecretControl}\n`)
  assertRefused(await restorePorts.restoreIsolatedBackup(context(5, packet(), backupDecision.evidence)), 'restore_invalid')
  assert.equal(restoreExecutor.calls.length, 2)
})

await test('backup uses exact dump-to-age and decrypt-to-manifest pipelines and publishes closed metadata', async () => {
  const root = path.join(scratch, 'success')
  const executor = new FakeExecutor()
  executor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
  )
  const prepared = await preparedConfig(root)
  const ports = createC5BLogicalBackupNodePorts(prepared, executor)
  const decision = await ports.createEncryptedLogicalBackup(context(4))
  assert.equal(decision.status, 'passed')
  if (decision.status !== 'passed') return
  assert.deepEqual(Object.keys(decision.evidence).sort(), ['backupSha256', 'byteCount', 'encrypted', 'expiresAt', 'manifestSha256'].sort())
  assert.deepEqual(decision.evidence, {
    encrypted: true,
    byteCount: encryptedFixture.length,
    backupSha256: sha256(encryptedFixture),
    manifestSha256: sha256(manifestFixture),
    expiresAt: '2026-08-21T01:00:00.000Z',
  })
  assert.equal(executor.calls.length, 2)
  const [dump, manifest] = executor.calls
  assert.equal(dump.shell, false)
  assert.deepEqual(dump.source.args, ['--dbname=service=source_db', '--format=custom', '--no-password'])
  assert.deepEqual(dump.sink.args, ['--encrypt', '--recipients-file', config(root).recipientsFile])
  const windowsBase = process.platform === 'win32'
    ? Object.fromEntries(Object.entries({ SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR })
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
    : {}
  const sourcePostgresql = {
    LANG: 'C', LC_ALL: 'C', ...windowsBase,
    PGSERVICEFILE: prepared.pgServiceFile, PGPASSFILE: prepared.pgPassFile, PGCONNECT_TIMEOUT: '5',
  }
  const ageEnvironment = { LANG: 'C', LC_ALL: 'C', ...windowsBase }
  assert.deepEqual(dump.source.environment, sourcePostgresql)
  assert.deepEqual(dump.sink.environment, ageEnvironment)
  assert.deepEqual(dump.sourceInput, { kind: 'none' })
  assert.equal(dump.output.kind, 'file')
  assert.deepEqual(manifest.source.args, ['--decrypt', '--identity', config(root).identityFile])
  assert.deepEqual(manifest.sink.args, ['--list'])
  assert.deepEqual(manifest.source.environment, ageEnvironment)
  assert.deepEqual(manifest.sink.environment, sourcePostgresql)
  assert.equal(manifest.sourceInput.kind, 'file')
  assert.deepEqual(manifest.output, { kind: 'capture' })
  const files = fs.readdirSync(config(root).destinationDirectory)
  assert.deepEqual(files, ['123e4567-e89b-42d3-a456-426614174000.dump.age'])
})

await test('backup failures, caps, collisions, and partial artifacts fail closed with exact cleanup', async () => {
  const failures: C5BPipelineExecution[] = [
    successExecution({ ok: false, sourceExitCode: 1 }),
    successExecution({ ok: false, sinkExitCode: 1 }),
    successExecution({ ok: false, timedOut: true }),
    successExecution({ ok: false, outputCapped: true }),
    successExecution({ byteCount: 60_000, sha256: hashes[12], capturedOutput: null }),
    successExecution({ byteCount: 0, sha256: sha256(''), capturedOutput: null }),
  ]
  for (let index = 0; index < failures.length; index += 1) {
    const root = path.join(scratch, `failure-${index}`)
    const executor = new FakeExecutor()
    executor.queue.push(failures[index])
    const ports = createC5BLogicalBackupNodePorts(await preparedConfig(root), executor)
    assertRefused(await ports.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
    const destination = config(root).destinationDirectory
    assert.deepEqual(fs.existsSync(destination) ? fs.readdirSync(destination) : [], [])
  }

  const collisionRoot = path.join(scratch, 'collision')
  fs.mkdirSync(config(collisionRoot).destinationDirectory, { recursive: true })
  fs.writeFileSync(path.join(config(collisionRoot).destinationDirectory, '123e4567-e89b-42d3-a456-426614174000.dump.age'), 'existing')
  const collisionExecutor = new FakeExecutor()
  const collisionPorts = createC5BLogicalBackupNodePorts(await preparedConfig(collisionRoot), collisionExecutor)
  assertRefused(await collisionPorts.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
  assert.equal(collisionExecutor.calls.length, 0)
})

await test('manifest failure removes temporary artifact and repeated backup never starts another process', async () => {
  const manifestRoot = path.join(scratch, 'manifest-failure')
  const manifestExecutor = new FakeExecutor()
  manifestExecutor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ ok: false, sinkExitCode: 1 }),
  )
  const manifestPorts = createC5BLogicalBackupNodePorts(await preparedConfig(manifestRoot), manifestExecutor)
  assertRefused(await manifestPorts.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
  assert.deepEqual(fs.readdirSync(config(manifestRoot).destinationDirectory), [])

  const repeatRoot = path.join(scratch, 'repeat')
  const repeatExecutor = new FakeExecutor()
  repeatExecutor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
  )
  const repeatPorts = createC5BLogicalBackupNodePorts(await preparedConfig(repeatRoot), repeatExecutor)
  assert.equal((await repeatPorts.createEncryptedLogicalBackup(context(4))).status, 'passed')
  assertRefused(await repeatPorts.createEncryptedLogicalBackup(context(4)), 'logical_backup_invalid')
  assert.equal(repeatExecutor.calls.length, 2)
})

await test('restore is exact-bound, metadata-only, and at-most-once', async () => {
  const root = path.join(scratch, 'restore')
  const executor = new FakeExecutor()
  executor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
    successExecution(),
  )
  const prepared = await preparedConfig(root)
  const ports = createC5BLogicalBackupNodePorts(prepared, executor)
  const backup = await ports.createEncryptedLogicalBackup(context(4))
  assert.equal(backup.status, 'passed')
  if (backup.status !== 'passed') return
  const restoreContext = context(5, packet(), backup.evidence)
  const restored = await ports.restoreIsolatedBackup(restoreContext)
  assert.deepEqual(restored, {
    status: 'passed',
    evidence: {
      restored: true,
      isolated: true,
      sourceBackupSha256: sha256(encryptedFixture),
      restoreManifestSha256: sha256(manifestFixture),
    },
  })
  const restoreCall = executor.calls[2]
  assert.equal(restoreCall.shell, false)
  assert.deepEqual(restoreCall.source.args, ['--decrypt', '--identity', config(root).identityFile])
  assert.deepEqual(restoreCall.sink.args, [
    '--dbname=service=restore_db', '--exit-on-error', '--single-transaction', '--no-password',
  ])
  const windowsBase = process.platform === 'win32'
    ? Object.fromEntries(Object.entries({ SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR })
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
    : {}
  assert.deepEqual(restoreCall.source.environment, { LANG: 'C', LC_ALL: 'C', ...windowsBase })
  assert.deepEqual(restoreCall.sink.environment, {
    LANG: 'C', LC_ALL: 'C', ...windowsBase,
    PGSERVICEFILE: prepared.pgServiceFile, PGPASSFILE: prepared.pgPassFile, PGCONNECT_TIMEOUT: '5',
  })
  assert.equal(restoreCall.sourceInput.kind, 'file')
  assert.deepEqual(restoreCall.output, { kind: 'capture' })
  assertRefused(await ports.restoreIsolatedBackup(restoreContext), 'restore_invalid')
  assert.equal(executor.calls.length, 3)
  assert.equal(JSON.stringify(restored).includes(config(root).identityFile), false)
})

await test('forged, cross-attempt, and mismatched restore bindings stop before decrypt', async () => {
  const root = path.join(scratch, 'restore-attacks')
  const executor = new FakeExecutor()
  executor.queue.push(
    successExecution({ byteCount: encryptedFixture.length, sha256: sha256(encryptedFixture), capturedOutput: null }),
    successExecution({ byteCount: Buffer.byteLength(manifestFixture), sha256: sha256(manifestFixture), capturedOutput: manifestFixture }),
  )
  const ports = createC5BLogicalBackupNodePorts(await preparedConfig(root), executor)
  const backup = await ports.createEncryptedLogicalBackup(context(4))
  assert.equal(backup.status, 'passed')
  if (backup.status !== 'passed') return
  const forged = { ...backup.evidence, backupSha256: hashes[15] }
  assertRefused(await ports.restoreIsolatedBackup(context(5, packet(), forged)), 'restore_invalid')
  const otherPacket = packet({ attemptId: '223e4567-e89b-42d3-a456-426614174000' })
  assertRefused(await ports.restoreIsolatedBackup(context(5, otherPacket, backup.evidence)), 'restore_invalid')
  assert.equal(executor.calls.length, 2)
})

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid: number
  killed = false

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill(): boolean {
    if (this.killed) return false
    this.killed = true
    queueMicrotask(() => {
      this.stdin.end()
      this.stdout.end()
      this.stderr.end()
      this.emit('close', null, 'SIGKILL')
    })
    return true
  }
}

function scriptedSpawn(output: Buffer, hang = false): { factory: C5BSpawnFactory; calls: Array<Record<string, unknown>>; children: FakeChild[] } {
  const calls: Array<Record<string, unknown>> = []
  const children: FakeChild[] = []
  const factory: C5BSpawnFactory = (executable, args, options) => {
    const child = new FakeChild(100 + children.length)
    const index = children.length
    children.push(child)
    calls.push({ executable, args: [...args], options })
    if (!hang && index === 1) {
      child.stdin.resume()
      child.stdin.once('end', () => {
        if (child.killed) return
        child.stdout.end(output)
        child.stderr.end(rawSecretControl)
        child.emit('close', 0, null)
      })
    }
    if (!hang && index === 0) queueMicrotask(() => {
      child.stderr.end(rawSecretControl)
      if (index === 0) {
        child.stdout.end('source-bytes')
        child.emit('close', 0, null)
      }
    })
    return child as never
  }
  return { factory, calls, children }
}

function request(root: string, output: C5BPipelineExecutionRequest['output'], overrides: Partial<C5BPipelineExecutionRequest> = {}): C5BPipelineExecutionRequest {
  return {
    source: { executable: path.join(root, 'source'), args: ['--source'], environment: { LANG: 'C', LC_ALL: 'C' } },
    sink: { executable: path.join(root, 'sink'), args: ['--sink'], environment: { LANG: 'C', LC_ALL: 'C' } },
    sourceInput: { kind: 'none' },
    output,
    cwd: root,
    timeoutMs: 1_000,
    maxOutputBytes: 1_024,
    maxArtifactBytes: 1_024,
    shell: false,
    ...overrides,
  }
}

await test('Node pipeline executor enforces direct spawn, closed output, timeout, and output caps', async () => {
  const captureScript = scriptedSpawn(Buffer.from('captured'))
  const captureExecutor = createNodeC5BPipelineExecutor({ spawnFactory: captureScript.factory, platform: 'win32' })
  const captured = await captureExecutor.execute(request(scratch, { kind: 'capture' }))
  assert.equal(captured.ok, true)
  assert.equal(captured.capturedOutput, 'captured')
  assert.equal(JSON.stringify(captured).includes(rawSecretControl), false)
  assert.equal(captureScript.calls.length, 2)
  for (const call of captureScript.calls) {
    assert.deepEqual(call.options, {
      cwd: scratch,
      shell: false,
      windowsHide: true,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { LANG: 'C', LC_ALL: 'C' },
    })
  }

  const filePath = path.join(scratch, 'executor-output.age')
  const fileScript = scriptedSpawn(encryptedFixture)
  const fileExecutor = createNodeC5BPipelineExecutor({ spawnFactory: fileScript.factory, platform: 'win32' })
  const fileResult = await fileExecutor.execute(request(scratch, { kind: 'file', path: filePath, mode: 0o600 }))
  assert.equal(fileResult.ok, true)
  assert.equal(fileResult.byteCount, encryptedFixture.length)
  assert.equal(fileResult.sha256, sha256(encryptedFixture))
  assert.equal(fileResult.capturedOutput, null)

  const cappedScript = scriptedSpawn(Buffer.alloc(32, 1))
  let capTerminations = 0
  const cappedExecutor = createNodeC5BPipelineExecutor({
    spawnFactory: cappedScript.factory,
    platform: 'win32',
    terminateTree: (child) => { capTerminations += 1; child.kill() },
  })
  const capped = await cappedExecutor.execute(request(scratch, { kind: 'capture' }, { maxOutputBytes: 8 }))
  assert.equal(capped.ok, false)
  assert.equal(capped.outputCapped, true)
  assert.equal(capTerminations, 2)

  const hanging = scriptedSpawn(Buffer.alloc(0), true)
  let timeoutTerminations = 0
  const timeoutExecutor = createNodeC5BPipelineExecutor({
    spawnFactory: hanging.factory,
    platform: 'win32',
    terminateTree: (child) => { timeoutTerminations += 1; child.kill() },
  })
  const timed = await timeoutExecutor.execute(request(scratch, { kind: 'capture' }, { timeoutMs: 2 }))
  assert.equal(timed.ok, false)
  assert.equal(timed.timedOut, true)
  assert.equal(timeoutTerminations, 2)

  const orphanChildren: FakeChild[] = []
  let orphanTerminations = 0
  const secondSpawnThrows: C5BSpawnFactory = (_executable, _args, _options) => {
    if (orphanChildren.length > 0) throw new Error(rawSecretControl)
    const child = new FakeChild(999)
    orphanChildren.push(child)
    return child as never
  }
  const spawnFailureExecutor = createNodeC5BPipelineExecutor({
    spawnFactory: secondSpawnThrows,
    platform: 'win32',
    terminateTree: (child) => { orphanTerminations += 1; child.kill() },
  })
  const spawnFailure = await spawnFailureExecutor.execute(request(scratch, { kind: 'capture' }))
  assert.equal(spawnFailure.ok, false)
  assert.equal(JSON.stringify(spawnFailure).includes(rawSecretControl), false)
  assert.equal(orphanTerminations, 1)
})

await test('runtime source denies shell/SQL/network/provider coupling and recursive deletion', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'live-cutover-logical-backup-node.ts'), 'utf8')
  for (const forbidden of [
    /\bexec(?:File|Sync)?\s*\(/,
    /spawnSync\s*\(/,
    /shell\s*:\s*true/,
    /\bfetch\s*\(/,
    /@supabase|createClient\s*\(/,
    /\b(?:select|insert|update|delete|alter|drop|create)\s+(?:table|from|into|policy|function)\b/i,
    /rmSync\([^\n]+recursive\s*:\s*true/,
    /renameSync\s*\(/,
  ]) assert.doesNotMatch(source, forbidden)
  assert.match(source, /linkSync\s*\(/)
  assert.match(source, /realpathSync\.native\s*\(/)
})

fs.rmSync(scratch, { recursive: true, force: true })

if (failed > 0) {
  console.error(`C5B logical-backup Node adapter: FAIL (${failed} failed, ${passed} passed)`)
  process.exit(1)
}
console.log(`C5B logical-backup Node adapter: PASS (${passed} groups)`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
