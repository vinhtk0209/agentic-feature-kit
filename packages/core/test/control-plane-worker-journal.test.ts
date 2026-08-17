import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_SCHEMA_VERSION,
  createControlPlaneExecutionEnvelope,
  createControlPlaneOperationRegistry,
  createWorkerCapabilityManifest,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
} from '../src/control-plane'
import {
  applyControlPlaneExecutionReceipt,
  applyControlPlaneLifecycleIntent,
  claimControlPlaneLease,
  createControlPlaneExecutionReceipt,
  createControlPlaneMutationIntent,
  createControlPlaneTaskSnapshot,
  decideControlPlaneLeaseRecovery,
  startControlPlaneExecution,
  type ControlPlaneExecutionReceipt,
  type ControlPlaneTaskSnapshot,
} from '../src/control-plane-state'
import {
  createControlPlaneEnvelopeSignature,
  createControlPlaneReceiptSignature,
  type ControlPlaneDetachedSignature,
} from '../src/control-plane-signing'
import {
  createNodeEd25519KeyPair,
  createNodeEd25519Verifier,
} from '../src/control-plane-signing-node'
import {
  CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION,
  CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES,
  CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION,
  ControlPlaneWorkerJournalContractError,
  acknowledgeControlPlaneWorkerJournalReceipt,
  createControlPlaneWorkerRecoveryObservation,
  loadControlPlaneWorkerJournal,
  markControlPlaneWorkerJournalExecutionStarted,
  markControlPlaneWorkerJournalUnknown,
  prepareControlPlaneWorkerJournal,
  recordControlPlaneWorkerJournalReceipt,
  serializeControlPlaneWorkerJournalEntry,
  validateControlPlaneWorkerJournalEntry,
  type ControlPlaneWorkerJournalDependencies,
  type ControlPlaneWorkerJournalEntry,
  type ControlPlaneWorkerJournalKey,
  type ControlPlaneWorkerJournalPort,
} from '../src/control-plane-worker-journal'

assert.equal(typeof prepareControlPlaneWorkerJournal, 'function', 'missing A3C prepare export')
assert.equal(typeof markControlPlaneWorkerJournalExecutionStarted, 'function', 'missing A3C start export')
assert.equal(typeof recordControlPlaneWorkerJournalReceipt, 'function', 'missing A3C receipt export')

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}
const registry = createControlPlaneOperationRegistry(hashPort)
const controlPair = createNodeEd25519KeyPair()
const workerPair = createNodeEd25519KeyPair()
const controlVerifier = createNodeEd25519Verifier(controlPair.publicKeySpki)
const workerVerifier = createNodeEd25519Verifier(workerPair.publicKeySpki)

const ids = {
  tenant: '1c000000-0000-4000-8000-000000000001',
  commandRun: '2c000000-0000-4000-8000-000000000002',
  delivery: '3c000000-0000-4000-8000-000000000003',
  deliveryB: '3d000000-0000-4000-8000-000000000003',
  lease: '4c000000-0000-4000-8000-000000000004',
  leaseB: '4d000000-0000-4000-8000-000000000004',
  machine: '5c000000-0000-4000-8000-000000000005',
  machineB: '5d000000-0000-4000-8000-000000000005',
  repository: '6c000000-0000-4000-8000-000000000006',
  actor: '7c000000-0000-4000-8000-000000000007',
} as const

const times = {
  issued: '2026-08-17T03:00:00.000Z',
  claim: '2026-08-17T03:00:01.000Z',
  prepared: '2026-08-17T03:00:02.000Z',
  started: '2026-08-17T03:00:03.000Z',
  completed: '2026-08-17T03:00:40.000Z',
  lateCompleted: '2026-08-17T03:01:05.000Z',
  leaseExpires: '2026-08-17T03:01:00.000Z',
  acknowledged: '2026-08-17T03:00:45.000Z',
  deadline: '2026-08-17T03:30:00.000Z',
  recovery: '2026-08-17T03:01:06.000Z',
} as const

const hashes = {
  binding: 'a'.repeat(64),
  progress: 'b'.repeat(64),
  evidence: 'c'.repeat(64),
  result: 'd'.repeat(64),
} as const

function envelope(
  overrides: Partial<ControlPlaneExecutionEnvelope['identity']> = {},
  operationInput: { schemaVersion: 1; repositoryId: string } = { schemaVersion: 1, repositoryId: ids.repository },
): ControlPlaneExecutionEnvelope {
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
      progressBindingHash: hashes.binding,
      ...overrides,
    },
    operationCode: 'project_intelligence.inspect',
    operationInput,
    timing: { issuedAt: times.issued, leaseExpiresAt: times.leaseExpires, deadlineAt: times.deadline },
    evidencePolicy: { mode: 'metadata_only', sink: 'p17_015_progress', retentionClass: 'standard' },
  }, registry, hashPort)
}

function envelopeSignature(target: ControlPlaneExecutionEnvelope, signedAt: string = times.prepared): ControlPlaneDetachedSignature {
  return createControlPlaneEnvelopeSignature(target, {
    signerId: 'control-plane-primary',
    keyId: 'control-plane-ed25519',
    keyVersion: 1,
    signedAt,
  }, registry, hashPort, controlPair.signer)
}

function receipt(
  target: ControlPlaneExecutionEnvelope,
  completedAt: string = times.completed,
  outcome: 'passed' | 'failed' | 'cancelled' | 'unknown_outcome' = 'passed',
): ControlPlaneExecutionReceipt {
  return createControlPlaneExecutionReceipt({
    identity: target.identity,
    envelopeHash: target.envelopeHash,
    operationCode: target.operation.descriptor.code,
    operationContractHash: target.operation.descriptor.contractHash,
    outcome,
    completedAt,
    progressBindingHash: target.identity.progressBindingHash,
    progressTailHash: hashes.progress,
    evidenceHashes: [hashes.evidence],
    resultHash: outcome === 'passed' ? hashes.result : null,
  }, target, registry, hashPort)
}

function receiptSignature(target: ControlPlaneExecutionEnvelope, value: ControlPlaneExecutionReceipt): ControlPlaneDetachedSignature {
  return createControlPlaneReceiptSignature(value, target, {
    signerId: target.identity.machineId,
    keyId: 'machine-ed25519',
    keyVersion: 1,
    signedAt: value.completedAt,
  }, registry, hashPort, workerPair.signer)
}

function keyFor(target: ControlPlaneExecutionEnvelope = envelope()): ControlPlaneWorkerJournalKey {
  return {
    tenantId: target.identity.tenantId,
    machineId: target.identity.machineId,
    deliveryId: target.identity.deliveryId,
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function memoryJournal(): ControlPlaneWorkerJournalPort {
  const records = new Map<string, unknown>()
  const id = (key: ControlPlaneWorkerJournalKey) => `${key.tenantId}:${key.machineId}:${key.deliveryId}`
  return {
    async load(key) {
      const value = records.get(id(key))
      return value === undefined ? null : clone(value)
    },
    async compareAndSet(key, expectedRevision, next) {
      const current = records.get(id(key)) as { journalRevision?: unknown } | undefined
      const currentRevision = current === undefined ? null : current.journalRevision
      if (currentRevision !== expectedRevision) return { status: 'conflict' }
      records.set(id(key), clone(next))
      return { status: 'committed' }
    },
  }
}

function dependencies(port: ControlPlaneWorkerJournalPort): ControlPlaneWorkerJournalDependencies {
  return { registry, hashPort, controlPlaneVerifier: controlVerifier, workerVerifier, journalPort: port }
}

function expectJournalError(
  action: () => unknown | Promise<unknown>,
  code?: InstanceType<typeof ControlPlaneWorkerJournalContractError>['code'],
  forbiddenEcho?: string,
): Promise<void> | void {
  const inspect = (error: unknown) => {
    assert.ok(error instanceof ControlPlaneWorkerJournalContractError)
    if (code) assert.equal(error.code, code)
    if (forbiddenEcho) assert.ok(!error.message.includes(forbiddenEcho), 'closed journal error echoed attacker input')
    return true
  }
  let result: unknown | Promise<unknown>
  try { result = action() } catch (error) { inspect(error); return }
  if (result instanceof Promise) return assert.rejects(result, inspect).then(() => undefined)
  assert.fail('Missing expected synchronous rejection')
}

async function prepared(port: ControlPlaneWorkerJournalPort = memoryJournal()) {
  const target = envelope()
  const signature = envelopeSignature(target)
  const decision = await prepareControlPlaneWorkerJournal({
    key: keyFor(target),
    envelope: target,
    envelopeSignature: signature,
    changedAt: times.prepared,
  }, dependencies(port))
  assert.equal(decision.status, 'committed')
  assert.equal(decision.action, 'prepared')
  assert.ok(decision.entry)
  return { port, target, signature, entry: decision.entry }
}

function taskIdentity(target: ControlPlaneExecutionEnvelope) {
  return {
    schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
    tenantId: target.identity.tenantId,
    taskId: target.identity.taskId,
    commandRunId: target.identity.commandRunId,
    rootRunId: target.identity.rootRunId,
    parentRunId: target.identity.parentRunId,
    attempt: target.identity.attempt,
    repositoryId: target.identity.repositoryId,
    progressBindingHash: target.identity.progressBindingHash,
  } as const
}

function taskIntent(snapshot: ControlPlaneTaskSnapshot, action: 'claim_lease' | 'start_execution' | 'accept_receipt') {
  const reasonCode = action === 'claim_lease' ? 'lease_claimed' : action === 'start_execution' ? 'lease_started' : 'receipt_received'
  return createControlPlaneMutationIntent({
    tenantId: snapshot.identity.tenantId,
    taskId: snapshot.identity.taskId,
    actorId: ids.actor,
    action,
    reasonCode,
    idempotencyKey: action === 'claim_lease'
      ? '8c000000-0000-4000-8000-000000000001'
      : action === 'start_execution'
        ? '8c000000-0000-4000-8000-000000000002'
        : '8c000000-0000-4000-8000-000000000003',
    requestedAt: times.claim,
    expectedResourceVersion: snapshot.resourceVersion,
  }, hashPort)
}

function runningSnapshot(target: ControlPlaneExecutionEnvelope): ControlPlaneTaskSnapshot {
  const manifest = createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect', 'repository.read'],
  }, registry, hashPort)
  let snapshot = createControlPlaneTaskSnapshot({
    identity: taskIdentity(target),
    operationCode: 'project_intelligence.inspect',
  }, registry, hashPort)
  for (const [action, reasonCode, idempotencyKey] of [
    ['submit_for_approval', 'workflow_transition', '8c000000-0000-4000-8000-000000000004'],
    ['approve', 'operator_approved', '8c000000-0000-4000-8000-000000000005'],
    ['enqueue', 'workflow_transition', '8c000000-0000-4000-8000-000000000006'],
  ] as const) {
    const decision = createControlPlaneMutationIntent({
      tenantId: snapshot.identity.tenantId,
      taskId: snapshot.identity.taskId,
      actorId: ids.actor,
      action,
      reasonCode,
      idempotencyKey,
      requestedAt: times.claim,
      expectedResourceVersion: snapshot.resourceVersion,
    }, hashPort)
    const applied = applyControlPlaneLifecycleIntent(snapshot, decision, registry, hashPort)
    assert.equal(applied.status, 'accepted')
    snapshot = applied.snapshot
  }
  const claimed = claimControlPlaneLease(snapshot, {
    intent: taskIntent(snapshot, 'claim_lease'),
    envelope: target,
    workerManifest: manifest,
    observedAt: times.claim,
  }, registry, hashPort)
  assert.equal(claimed.status, 'accepted')
  const started = startControlPlaneExecution(claimed.snapshot, {
    intent: taskIntent(claimed.snapshot, 'start_execution'),
    observedAt: times.started,
  }, registry, hashPort)
  assert.equal(started.status, 'accepted')
  return started.snapshot
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
  await run('1. signed prepare commits one exact frozen not-started journal entry', async () => {
    const { entry, target, signature } = await prepared()
    assert.equal(entry.schemaVersion, CONTROL_PLANE_WORKER_JOURNAL_SCHEMA_VERSION)
    assert.equal(entry.contractVersion, CONTROL_PLANE_WORKER_JOURNAL_CONTRACT_VERSION)
    assert.equal(entry.journalRevision, 1)
    assert.equal(entry.journalState, 'not_started')
    assert.deepEqual(entry.envelope, target)
    assert.deepEqual(entry.envelopeSignature, signature)
    assert.equal(entry.receipt, null)
    assert.equal(entry.receiptSignature, null)
    assert.equal(entry.receiptAcknowledgedAt, null)
    assert.match(entry.recordHash, /^[0-9a-f]{64}$/)
    assert.ok(isDeepFrozen(entry))
    assert.deepEqual(JSON.parse(serializeControlPlaneWorkerJournalEntry(entry, registry, hashPort, controlVerifier, workerVerifier)), entry)
    await expectJournalError(() => prepareControlPlaneWorkerJournal({
      key: keyFor(target), envelope: target, envelopeSignature: signature,
      changedAt: '2026-08-17T02:59:59.000Z',
    }, dependencies(memoryJournal())), 'INVALID_TIME')
  })

  await run('2. redelivery is idempotent only for the same signed envelope', async () => {
    const { port, target, signature, entry } = await prepared()
    const same = await prepareControlPlaneWorkerJournal({ key: keyFor(target), envelope: clone(target), envelopeSignature: clone(signature), changedAt: times.prepared }, dependencies(port))
    assert.equal(same.status, 'idempotent')
    assert.equal(same.action, 'resume_not_started')
    assert.equal(same.entry?.journalRevision, entry.journalRevision)

    const changed = envelope({ deliveryId: target.identity.deliveryId }, { schemaVersion: 1, repositoryId: ids.repository })
    const changedInput = clone(changed) as unknown as Record<string, unknown>
    ;(changedInput.operation as { input: { repositoryId: string } }).input.repositoryId = ids.machineB
    await expectJournalError(() => prepareControlPlaneWorkerJournal({
      key: keyFor(target), envelope: changedInput, envelopeSignature: signature, changedAt: times.prepared,
    }, dependencies(port)), 'INVALID_ENVELOPE')

    const changedSignature = envelopeSignature(target, times.started)
    const conflict = await prepareControlPlaneWorkerJournal({
      key: keyFor(target), envelope: target, envelopeSignature: changedSignature, changedAt: times.prepared,
    }, dependencies(port))
    assert.equal(conflict.status, 'conflict')
    assert.equal(conflict.action, 'changed_delivery')

    const changedEnvelope = envelope({ leaseId: ids.leaseB })
    const changedEnvelopeConflict = await prepareControlPlaneWorkerJournal({
      key: keyFor(target), envelope: changedEnvelope, envelopeSignature: envelopeSignature(changedEnvelope), changedAt: times.prepared,
    }, dependencies(port))
    assert.equal(changedEnvelopeConflict.status, 'conflict')
    assert.equal(changedEnvelopeConflict.action, 'changed_delivery')
  })

  await run('3. execution start uses monotonic CAS with exact idempotency', async () => {
    const { port, target, entry } = await prepared()
    const started = await markControlPlaneWorkerJournalExecutionStarted({
      key: keyFor(target), expectedRevision: entry.journalRevision, changedAt: times.started,
    }, dependencies(port))
    assert.equal(started.status, 'committed')
    assert.equal(started.action, 'execution_started')
    assert.equal(started.entry?.journalRevision, 2)
    assert.equal(started.entry?.journalState, 'execution_started')

    const duplicate = await markControlPlaneWorkerJournalExecutionStarted({
      key: keyFor(target), expectedRevision: entry.journalRevision, changedAt: times.started,
    }, dependencies(port))
    assert.equal(duplicate.status, 'idempotent')
    assert.equal(duplicate.entry?.journalRevision, 2)

    const stale = await markControlPlaneWorkerJournalExecutionStarted({
      key: keyFor(target), expectedRevision: 1, changedAt: times.acknowledged,
    }, dependencies(port))
    assert.equal(stale.status, 'conflict')

    const late = await prepared()
    await expectJournalError(() => markControlPlaneWorkerJournalExecutionStarted({
      key: keyFor(late.target), expectedRevision: late.entry.journalRevision, changedAt: times.leaseExpires,
    }, dependencies(late.port)), 'INVALID_TIME')
  })

  await run('4. signed receipt commits before replay and acknowledgement retains it', async () => {
    const { port, target, entry } = await prepared()
    const started = await markControlPlaneWorkerJournalExecutionStarted({ key: keyFor(target), expectedRevision: entry.journalRevision, changedAt: times.started }, dependencies(port))
    const value = receipt(target)
    const signature = receiptSignature(target, value)
    const recorded = await recordControlPlaneWorkerJournalReceipt({
      key: keyFor(target), expectedRevision: started.entry!.journalRevision,
      receipt: value, receiptSignature: signature, changedAt: times.completed,
    }, dependencies(port))
    assert.equal(recorded.status, 'committed')
    assert.equal(recorded.action, 'receipt_recorded')
    assert.equal(recorded.entry?.journalState, 'receipt_available')
    assert.deepEqual(recorded.entry?.receipt, value)

    const replay = await prepareControlPlaneWorkerJournal({
      key: keyFor(target), envelope: target, envelopeSignature: envelopeSignature(target), changedAt: times.prepared,
    }, dependencies(port))
    assert.equal(replay.status, 'idempotent')
    assert.equal(replay.action, 'replay_receipt')
    assert.deepEqual(replay.entry?.receipt, value)

    const acknowledged = await acknowledgeControlPlaneWorkerJournalReceipt({
      key: keyFor(target), expectedRevision: recorded.entry!.journalRevision,
      receiptHash: value.receiptHash, acknowledgedAt: times.acknowledged,
    }, dependencies(port))
    assert.equal(acknowledged.status, 'committed')
    assert.equal(acknowledged.entry?.receiptAcknowledgedAt, times.acknowledged)
    assert.deepEqual(acknowledged.entry?.receipt, value)
  })

  await run('5. receipt identity, envelope, key, and signature mismatches fail closed', async () => {
    const { port, target, entry } = await prepared()
    const started = await markControlPlaneWorkerJournalExecutionStarted({ key: keyFor(target), expectedRevision: entry.journalRevision, changedAt: times.started }, dependencies(port))
    const otherEnvelope = envelope({ deliveryId: ids.deliveryB })
    const wrongReceipt = receipt(otherEnvelope)
    await expectJournalError(() => recordControlPlaneWorkerJournalReceipt({
      key: keyFor(target), expectedRevision: started.entry!.journalRevision,
      receipt: wrongReceipt, receiptSignature: receiptSignature(otherEnvelope, wrongReceipt), changedAt: times.completed,
    }, dependencies(port)), 'INVALID_RECEIPT')

    const value = receipt(target)
    const wrongPair = createNodeEd25519KeyPair()
    const wrongSignature = createControlPlaneReceiptSignature(value, target, {
      signerId: target.identity.machineId, keyId: 'machine-ed25519', keyVersion: 1, signedAt: value.completedAt,
    }, registry, hashPort, wrongPair.signer)
    await expectJournalError(() => recordControlPlaneWorkerJournalReceipt({
      key: keyFor(target), expectedRevision: started.entry!.journalRevision,
      receipt: value, receiptSignature: wrongSignature, changedAt: times.completed,
    }, dependencies(port)), 'INVALID_RECEIPT')
  })

  await run('6. explicit unknown outcome is restricted to started execution and remains manual', async () => {
    const initial = await prepared()
    await expectJournalError(() => markControlPlaneWorkerJournalUnknown({
      key: keyFor(initial.target), expectedRevision: initial.entry.journalRevision, changedAt: times.started,
    }, dependencies(initial.port)), 'INVALID_STATE')
    const started = await markControlPlaneWorkerJournalExecutionStarted({ key: keyFor(initial.target), expectedRevision: initial.entry.journalRevision, changedAt: times.started }, dependencies(initial.port))
    const unknown = await markControlPlaneWorkerJournalUnknown({
      key: keyFor(initial.target), expectedRevision: started.entry!.journalRevision, changedAt: times.completed,
    }, dependencies(initial.port))
    assert.equal(unknown.entry?.journalState, 'unknown')
    const observation = createControlPlaneWorkerRecoveryObservation(
      unknown.entry, times.recovery, registry, hashPort, controlVerifier, workerVerifier,
    )
    assert.deepEqual(observation, { observedAt: times.recovery, journalState: 'unknown', receiptHash: null })
    const recovery = decideControlPlaneLeaseRecovery(runningSnapshot(initial.target), observation, registry, hashPort)
    assert.equal(recovery.action, 'manual_recovery')
  })

  await run('7. receipt restart observation composes with A2C late-receipt quarantine', async () => {
    const initial = await prepared()
    const started = await markControlPlaneWorkerJournalExecutionStarted({ key: keyFor(initial.target), expectedRevision: initial.entry.journalRevision, changedAt: times.started }, dependencies(initial.port))
    const late = receipt(initial.target, times.lateCompleted)
    const recorded = await recordControlPlaneWorkerJournalReceipt({
      key: keyFor(initial.target), expectedRevision: started.entry!.journalRevision,
      receipt: late, receiptSignature: receiptSignature(initial.target, late), changedAt: times.lateCompleted,
    }, dependencies(initial.port))
    const observation = createControlPlaneWorkerRecoveryObservation(
      recorded.entry, times.recovery, registry, hashPort, controlVerifier, workerVerifier,
    )
    assert.deepEqual(observation, { observedAt: times.recovery, journalState: 'receipt_available', receiptHash: late.receiptHash })
    assert.equal(decideControlPlaneLeaseRecovery(runningSnapshot(initial.target), observation, registry, hashPort).action, 'replay_receipt')
    const snapshot = runningSnapshot(initial.target)
    const decision = applyControlPlaneExecutionReceipt(snapshot, {
      intent: taskIntent(snapshot, 'accept_receipt'), receipt: late, observedAt: times.recovery,
    }, registry, hashPort)
    assert.equal(decision.status, 'quarantined')
    assert.equal(decision.reason, 'late_receipt')
  })

  await run('8. concurrent redelivery and transition CAS accept at most one writer', async () => {
    const port = memoryJournal()
    const target = envelope()
    const input = { key: keyFor(target), envelope: target, envelopeSignature: envelopeSignature(target), changedAt: times.prepared }
    const decisions = await Promise.all([
      prepareControlPlaneWorkerJournal(input, dependencies(port)),
      prepareControlPlaneWorkerJournal(input, dependencies(port)),
    ])
    assert.equal(decisions.filter((value) => value.status === 'committed').length, 1)
    assert.equal(decisions.filter((value) => value.status === 'conflict' || value.status === 'idempotent').length, 1)
    const loaded = await loadControlPlaneWorkerJournal(keyFor(target), dependencies(port))
    assert.equal(loaded?.journalRevision, 1)
  })

  await run('9. exact shape rejects extra, prototype, accessor, cycle, hidden, and symbol fields', async () => {
    const { entry } = await prepared()
    const oversized = clone(entry) as unknown as Record<string, unknown>
    const oversizedEnvelope = oversized.envelope as Record<string, unknown>
    const oversizedOperation = oversizedEnvelope.operation as Record<string, unknown>
    ;(oversizedOperation.input as Record<string, unknown>).repositoryId = 'x'.repeat(CONTROL_PLANE_WORKER_JOURNAL_MAX_ENTRY_BYTES)
    await expectJournalError(
      () => validateControlPlaneWorkerJournalEntry(oversized, registry, hashPort, controlVerifier, workerVerifier),
      'ENTRY_TOO_LARGE',
    )

    const deep = clone(entry) as unknown as Record<string, unknown>
    let cursor = deep
    for (let index = 0; index < 64; index += 1) {
      cursor.nested = {}
      cursor = cursor.nested as Record<string, unknown>
    }
    await expectJournalError(
      () => validateControlPlaneWorkerJournalEntry(deep, registry, hashPort, controlVerifier, workerVerifier),
      'ENTRY_TOO_LARGE',
    )

    const attacks: unknown[] = []
    attacks.push({ ...clone(entry), extra: true })
    const prototype = clone(entry) as object
    Object.setPrototypeOf(prototype, { polluted: true })
    attacks.push(prototype)
    const accessor = clone(entry) as unknown as Record<string, unknown>
    Object.defineProperty(accessor, 'journalRevision', { enumerable: true, get: () => 1 })
    attacks.push(accessor)
    const cycle = clone(entry) as unknown as Record<string, unknown>
    cycle.extra = cycle
    attacks.push(cycle)
    const hidden = clone(entry) as unknown as Record<string, unknown>
    Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true })
    attacks.push(hidden)
    const symbol = clone(entry) as unknown as Record<PropertyKey, unknown>
    symbol[Symbol('hidden')] = true
    attacks.push(symbol)
    for (const attack of attacks) {
      await expectJournalError(() => validateControlPlaneWorkerJournalEntry(attack, registry, hashPort, controlVerifier, workerVerifier), 'INVALID_SHAPE')
    }
  })

  await run('10. malformed and failing ports are closed and do not echo attacker values', async () => {
    const secret = 'ATTACKER-JOURNAL-PAYLOAD-DO-NOT-ECHO'
    const target = envelope()
    const base = dependencies(memoryJournal())
    for (const port of [
      { load: async () => { throw new Error(secret) }, compareAndSet: async () => ({ status: 'committed' as const }) },
      { load: async () => ({ attacker: secret }), compareAndSet: async () => ({ status: 'committed' as const }) },
      { load: async () => null, compareAndSet: async () => { throw new Error(secret) } },
      { load: async () => null, compareAndSet: async () => ({ status: 'surprise' }) as never },
    ] satisfies ControlPlaneWorkerJournalPort[]) {
      await expectJournalError(() => prepareControlPlaneWorkerJournal({
        key: keyFor(target), envelope: target, envelopeSignature: envelopeSignature(target), changedAt: times.prepared,
      }, { ...base, journalPort: port }), undefined, secret)
    }
  })

  await run('11. source boundary is pure and does not claim runtime ownership', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-worker-journal.ts'), 'utf8')
    for (const forbidden of [
      "from 'node:", 'require(', 'process.', 'Deno.', 'Bun.', 'fetch(', 'WebSocket', 'child_process',
      'supabase', 'postgres', 'next/', 'react', '.claude', 'provider', 'executeOperation',
    ]) assert.ok(!source.toLowerCase().includes(forbidden.toLowerCase()), `pure journal contains ${forbidden}`)
  })

  console.log(`control-plane-worker-journal: ${passed} groups passed`)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
