import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CONTROL_PLANE_SCHEMA_VERSION,
  createControlPlaneExecutionEnvelope,
  createControlPlaneOperationRegistry,
  type ControlPlaneHashPort,
} from '../src/control-plane'
import {
  createControlPlaneExecutionReceipt,
} from '../src/control-plane-state'
import {
  createControlPlaneEnvelopeSignature,
  createControlPlaneReceiptSignature,
} from '../src/control-plane-signing'
import {
  createNodeEd25519KeyPair,
  createNodeEd25519Verifier,
} from '../src/control-plane-signing-node'
import {
  CONTROL_PLANE_WORKER_JOURNAL_STORAGE_MAX_SEGMENT_BYTES,
  NodeControlPlaneWorkerJournalStorageError,
  createDisposableNodeControlPlaneWorkerJournal,
  type NodeControlPlaneWorkerJournalFileOps,
} from '../src/control-plane-worker-journal-node'
import {
  markControlPlaneWorkerJournalExecutionStarted,
  prepareControlPlaneWorkerJournal,
  recordControlPlaneWorkerJournalReceipt,
  type ControlPlaneWorkerJournalDependencies,
  type ControlPlaneWorkerJournalEntry,
  type ControlPlaneWorkerJournalKey,
  type ControlPlaneWorkerJournalPort,
} from '../src/control-plane-worker-journal'

assert.equal(typeof createDisposableNodeControlPlaneWorkerJournal, 'function', 'missing A3C Node journal adapter export')

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}
const registry = createControlPlaneOperationRegistry(hashPort)
const controlPair = createNodeEd25519KeyPair()
const workerPair = createNodeEd25519KeyPair()
const controlVerifier = createNodeEd25519Verifier(controlPair.publicKeySpki)
const workerVerifier = createNodeEd25519Verifier(workerPair.publicKeySpki)

const ids = {
  tenant: '1e000000-0000-4000-8000-000000000001',
  commandRun: '2e000000-0000-4000-8000-000000000002',
  delivery: '3e000000-0000-4000-8000-000000000003',
  lease: '4e000000-0000-4000-8000-000000000004',
  machine: '5e000000-0000-4000-8000-000000000005',
  repository: '6e000000-0000-4000-8000-000000000006',
} as const

const times = {
  issued: '2026-08-17T04:00:00.000Z',
  prepared: '2026-08-17T04:00:01.000Z',
  started: '2026-08-17T04:00:02.000Z',
  completed: '2026-08-17T04:00:30.000Z',
  leaseExpires: '2026-08-17T04:01:00.000Z',
  deadline: '2026-08-17T04:30:00.000Z',
} as const

function envelope() {
  return createControlPlaneExecutionEnvelope({
    identity: {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
      tenantId: ids.tenant,
      taskId: 'P17-014',
      commandRunId: ids.commandRun,
      rootRunId: ids.commandRun,
      parentRunId: null,
      attempt: 1,
      deliveryId: ids.delivery,
      leaseId: ids.lease,
      machineId: ids.machine,
      repositoryId: ids.repository,
      progressBindingHash: 'a'.repeat(64),
    },
    operationCode: 'project_intelligence.inspect',
    operationInput: { schemaVersion: 1, repositoryId: ids.repository },
    timing: { issuedAt: times.issued, leaseExpiresAt: times.leaseExpires, deadlineAt: times.deadline },
    evidencePolicy: { mode: 'metadata_only', sink: 'p17_015_progress', retentionClass: 'standard' },
  }, registry, hashPort)
}

function key(): ControlPlaneWorkerJournalKey {
  return { tenantId: ids.tenant, machineId: ids.machine, deliveryId: ids.delivery }
}

function dependencies(port: ControlPlaneWorkerJournalPort): ControlPlaneWorkerJournalDependencies {
  return { registry, hashPort, controlPlaneVerifier: controlVerifier, workerVerifier, journalPort: port }
}

function signedEnvelope() {
  const payload = envelope()
  const signature = createControlPlaneEnvelopeSignature(payload, {
    signerId: 'control-plane-primary', keyId: 'control-plane-ed25519', keyVersion: 1, signedAt: times.prepared,
  }, registry, hashPort, controlPair.signer)
  return { payload, signature }
}

async function createEntry(port: ControlPlaneWorkerJournalPort): Promise<ControlPlaneWorkerJournalEntry> {
  const signed = signedEnvelope()
  const result = await prepareControlPlaneWorkerJournal({
    key: key(), envelope: signed.payload, envelopeSignature: signed.signature, changedAt: times.prepared,
  }, dependencies(port))
  assert.equal(result.status, 'committed')
  return result.entry!
}

function tempRoot(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `p17-a3c-${label}-`))
}

function walk(root: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

function expectStorageError(
  action: () => unknown | Promise<unknown>,
  code?: InstanceType<typeof NodeControlPlaneWorkerJournalStorageError>['code'],
  forbiddenEcho?: string,
): Promise<void> | void {
  const inspect = (error: unknown) => {
    assert.ok(error instanceof NodeControlPlaneWorkerJournalStorageError)
    if (code) assert.equal(error.code, code)
    if (forbiddenEcho) assert.ok(!error.message.includes(forbiddenEcho), 'closed storage error echoed attacker input')
    return true
  }
  let result: unknown | Promise<unknown>
  try { result = action() } catch (error) { inspect(error); return }
  if (result instanceof Promise) return assert.rejects(result, inspect).then(() => undefined)
  assert.fail('Missing expected synchronous rejection')
}

let passed = 0
async function run(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

async function main(): Promise<void> {
  const cleanup: string[] = []
  try {
    await run('1. empty store commits revision one and restarts from digest-only paths', async () => {
      const root = tempRoot('restart')
      cleanup.push(root)
      const first = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      assert.equal(await first.load(key()), null)
      const entry = await createEntry(first)
      const restarted = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      assert.deepEqual(await restarted.load(key()), entry)
      const relative = walk(root).map((value) => path.relative(root, value)).join('\n')
      for (const raw of Object.values(ids)) assert.ok(!relative.includes(raw), `raw identity leaked into journal path: ${raw}`)
      assert.match(relative, /[0-9a-f]{64}/)
      assert.match(relative, /0000000000000001\.json/)
    })

    await run('2. append-only transition segments select the latest complete revision', async () => {
      const root = tempRoot('segments')
      cleanup.push(root)
      const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      const initial = await createEntry(port)
      const started = await markControlPlaneWorkerJournalExecutionStarted({
        key: key(), expectedRevision: initial.journalRevision, changedAt: times.started,
      }, dependencies(port))
      const target = initial.envelope
      const receipt = createControlPlaneExecutionReceipt({
        identity: target.identity,
        envelopeHash: target.envelopeHash,
        operationCode: target.operation.descriptor.code,
        operationContractHash: target.operation.descriptor.contractHash,
        outcome: 'passed',
        completedAt: times.completed,
        progressBindingHash: target.identity.progressBindingHash,
        progressTailHash: 'b'.repeat(64),
        evidenceHashes: ['c'.repeat(64)],
        resultHash: 'd'.repeat(64),
      }, target, registry, hashPort)
      const signature = createControlPlaneReceiptSignature(receipt, target, {
        signerId: ids.machine, keyId: 'machine-ed25519', keyVersion: 1, signedAt: times.completed,
      }, registry, hashPort, workerPair.signer)
      const recorded = await recordControlPlaneWorkerJournalReceipt({
        key: key(), expectedRevision: started.entry!.journalRevision,
        receipt, receiptSignature: signature, changedAt: times.completed,
      }, dependencies(port))
      const restarted = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      const loaded = await restarted.load(key()) as ControlPlaneWorkerJournalEntry
      assert.equal(loaded.journalRevision, 3)
      assert.equal(loaded.journalState, 'receipt_available')
      assert.deepEqual(loaded.receipt, recorded.entry?.receipt)
      assert.equal(walk(root).filter((value) => value.endsWith('.json')).length, 3)
    })

    await run('3. two adapter instances publish at most one expected revision', async () => {
      const root = tempRoot('concurrent')
      cleanup.push(root)
      const seedPort: ControlPlaneWorkerJournalPort = {
        load: async () => null,
        compareAndSet: async () => ({ status: 'committed' }),
      }
      const entry = await createEntry(seedPort)
      const first = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root, entropy: () => 'a'.repeat(32) })
      const second = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root, entropy: () => 'b'.repeat(32) })
      const results = await Promise.all([
        first.compareAndSet(key(), null, entry),
        second.compareAndSet(key(), null, entry),
      ])
      const statuses = results.map((value) => (value as { status: 'committed' | 'conflict' }).status)
      assert.equal(statuses.filter((value) => value === 'committed').length, 1)
      assert.equal(statuses.filter((value) => value === 'conflict').length, 1)
      assert.equal((await first.load(key()) as ControlPlaneWorkerJournalEntry).journalRevision, 1)
    })

    await run('4. torn temporary segments are ignored while corrupt committed history fails closed', async () => {
      const root = tempRoot('corruption')
      cleanup.push(root)
      const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      const entry = await createEntry(port)
      const recordDirectory = path.dirname(walk(root).find((value) => value.endsWith('.json'))!)
      fs.writeFileSync(path.join(recordDirectory, `.${'f'.repeat(32)}.tmp`), '{"partial":', 'utf8')
      assert.deepEqual(await createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root }).load(key()), entry)
      const committed = walk(root).find((value) => value.endsWith('.json'))!
      fs.writeFileSync(committed, '{"storageVersion":1,"corrupt":true}\n', 'utf8')
      await expectStorageError(
        () => createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root }).load(key()),
        'CORRUPT_HISTORY',
      )
    })

    await run('5. write, flush, close, publish, and storage exhaustion preserve the prior revision', async () => {
      const seedPort: ControlPlaneWorkerJournalPort = {
        load: async () => null,
        compareAndSet: async () => ({ status: 'committed' }),
      }
      const validEntry = await createEntry(seedPort)
      const faultNames = ['writeFileSync', 'fsyncSync', 'closeSync', 'linkSync'] as const
      for (const faultName of faultNames) {
        const root = tempRoot(`fault-${faultName}`)
        cleanup.push(root)
        const real = fs as unknown as NodeControlPlaneWorkerJournalFileOps
        const fileOps: Partial<NodeControlPlaneWorkerJournalFileOps> = {
          [faultName]: (...args: never[]) => {
            if (faultName === 'closeSync') real.closeSync(args[0] as unknown as number)
            throw Object.assign(new Error(`ATTACKER-${faultName}`), { code: faultName === 'writeFileSync' ? 'ENOSPC' : 'EIO' })
          },
        }
        const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root, fileOps })
        await expectStorageError(
          () => port.compareAndSet(key(), null, validEntry),
          undefined,
          `ATTACKER-${faultName}`,
        )
        assert.equal(await createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root }).load(key()), null)
      }
    })

    await run('6. path validation rejects relative, root, and symlink or reparse-point locations', async () => {
      expectStorageError(() => createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: 'relative-journal' }), 'INVALID_PATH')
      expectStorageError(() => createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: path.parse(process.cwd()).root }), 'INVALID_PATH')
      const parent = tempRoot('link')
      cleanup.push(parent)
      const real = path.join(parent, 'real')
      const linked = path.join(parent, 'linked')
      fs.mkdirSync(real)
      try {
        fs.symlinkSync(real, linked, process.platform === 'win32' ? 'junction' : 'dir')
        expectStorageError(() => createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: linked }), 'INVALID_PATH')
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EPERM' && code !== 'EACCES') throw error
        const hostileLstat: Partial<NodeControlPlaneWorkerJournalFileOps> = {
          lstatSync: () => ({ isSymbolicLink: () => true } as fs.Stats),
        }
        expectStorageError(() => createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: real, fileOps: hostileLstat }), 'INVALID_PATH')
      }

      const safeRoot = tempRoot('key-accessor')
      cleanup.push(safeRoot)
      const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: safeRoot })
      let getterCalled = false
      const accessorKey = {
        machineId: ids.machine,
        deliveryId: ids.delivery,
      } as Record<string, unknown>
      Object.defineProperty(accessorKey, 'tenantId', {
        enumerable: true,
        get: () => {
          getterCalled = true
          return ids.tenant
        },
      })
      await expectStorageError(() => port.load(accessorKey as unknown as ControlPlaneWorkerJournalKey), 'INVALID_KEY')
      assert.equal(getterCalled, false, 'journal key accessor executed before rejection')
    })

    await run('7. segment bounds, unexpected committed names, and revision mismatch fail closed', async () => {
      const oversizeRoot = tempRoot('oversize')
      cleanup.push(oversizeRoot)
      const oversizePort = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: oversizeRoot })
      const fake = { journalRevision: 1, padding: 'x'.repeat(CONTROL_PLANE_WORKER_JOURNAL_STORAGE_MAX_SEGMENT_BYTES) } as unknown as ControlPlaneWorkerJournalEntry
      await expectStorageError(() => oversizePort.compareAndSet(key(), null, fake), 'ENTRY_TOO_LARGE')

      const root = tempRoot('mismatch')
      cleanup.push(root)
      const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root })
      await createEntry(port)
      const committed = walk(root).find((value) => value.endsWith('.json'))!
      const wrapper = JSON.parse(fs.readFileSync(committed, 'utf8')) as Record<string, unknown>
      wrapper.revision = 2
      fs.writeFileSync(committed, `${JSON.stringify(wrapper)}\n`, 'utf8')
      await expectStorageError(() => port.load(key()), 'CORRUPT_HISTORY')

      const revisionRoot = tempRoot('bad-revision')
      cleanup.push(revisionRoot)
      const revisionPort = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: revisionRoot })
      await createEntry(revisionPort)
      const revisionOne = walk(revisionRoot).find((value) => value.endsWith('.json'))!
      fs.renameSync(revisionOne, path.join(path.dirname(revisionOne), '0000000000000009.json'))
      await expectStorageError(() => revisionPort.load(key()), 'CORRUPT_HISTORY')
    })

    await run('8. storage errors are stable and never echo raw path, key, or payload', async () => {
      const root = tempRoot('closed-error')
      cleanup.push(root)
      await createEntry(createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root }))
      const secret = 'ATTACKER-STORAGE-SECRET'
      const fileOps: Partial<NodeControlPlaneWorkerJournalFileOps> = {
        readdirSync: () => { throw new Error(secret) },
      }
      const port = createDisposableNodeControlPlaneWorkerJournal({ rootDirectory: root, fileOps })
      await expectStorageError(() => port.load(key()), 'STORAGE_UNAVAILABLE', secret)
      await assert.rejects(port.load(key()), (error: unknown) => {
        assert.ok(error instanceof NodeControlPlaneWorkerJournalStorageError)
        assert.ok(!error.message.includes(root))
        assert.ok(!error.message.includes(ids.tenant))
        return true
      })
    })

    await run('9. adapter source has no default path, network, database, executor, or provider coupling', () => {
      const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-worker-journal-node.ts'), 'utf8')
      for (const forbidden of [
        'os.homedir', 'process.cwd', 'process.env', 'fetch(', 'WebSocket', 'http:', 'https:',
        'supabase', 'postgres', 'child_process', 'spawn(', 'execFile(', 'execSync(', '.claude', 'provider', 'executeOperation',
      ]) assert.ok(!source.toLowerCase().includes(forbidden.toLowerCase()), `Node journal contains ${forbidden}`)
    })

    console.log(`control-plane-worker-journal-node: ${passed} groups passed`)
  } finally {
    for (const root of cleanup) fs.rmSync(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
