import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
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
  requestControlPlaneCancellation,
  startControlPlaneExecution,
  type ControlPlaneMutationAction,
  type ControlPlaneMutationReasonCode,
  type ControlPlaneRecoveryObservation,
  type ControlPlaneTaskMutationDecision,
  type ControlPlaneTaskSnapshot,
} from '../src/control-plane-state'
import {
  buildProgressTaskView,
  createProgressEvent,
  createProgressRunBinding,
  type EvidenceRef,
  type ProgressEvent,
  type ProgressLedger,
  type ProgressReasonCode,
  type ProgressRunBinding,
  type ProgressState,
} from '../src/cross-machine-progress'
import {
  ControlPlaneProgressProofError,
  createControlPlaneProgressBindingProof,
  createControlPlaneProgressRepositoryBinding,
  createControlPlaneReceiptProgressProof,
  createControlPlaneRetryProgressProof,
  validateControlPlaneProgressBindingProof,
  validateControlPlaneProgressRepositoryBinding,
  validateControlPlaneReceiptProgressProof,
  validateControlPlaneRetryProgressProof,
  type ControlPlaneProgressLedgerPort,
  type ControlPlaneProgressRepositoryBinding,
} from '../src/control-plane-progress'

assert.equal(typeof createControlPlaneProgressRepositoryBinding, 'function', 'missing A2D repository binding export')
assert.equal(typeof createControlPlaneProgressBindingProof, 'function', 'missing A2D progress binding proof export')
assert.equal(typeof createControlPlaneReceiptProgressProof, 'function', 'missing A2D receipt proof export')
assert.equal(typeof createControlPlaneRetryProgressProof, 'function', 'missing A2D retry proof export')

const hashPort: ControlPlaneHashPort = { sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex') }
const registry = createControlPlaneOperationRegistry(hashPort)
const progressPort: ControlPlaneProgressLedgerPort = {
  buildTaskView: (ledger, expectedTaskId) => buildProgressTaskView(ledger as ProgressLedger, expectedTaskId),
}

const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  parentRun: '2a000000-0000-4000-8000-000000000002',
  successorRun: '2b000000-0000-4000-8000-000000000002',
  siblingRun: '2c000000-0000-4000-8000-000000000002',
  gapRun: '2d000000-0000-4000-8000-000000000002',
  otherRoot: '2e000000-0000-4000-8000-000000000002',
  otherParent: '2f000000-0000-4000-8000-000000000002',
  parentDelivery: '3a000000-0000-4000-8000-000000000003',
  successorDelivery: '3b000000-0000-4000-8000-000000000003',
  parentLease: '4a000000-0000-4000-8000-000000000004',
  successorLease: '4b000000-0000-4000-8000-000000000004',
  parentMachine: '5a000000-0000-4000-8000-000000000005',
  successorMachine: '5b000000-0000-4000-8000-000000000005',
  siblingMachine: '5c000000-0000-4000-8000-000000000005',
  repository: '6a000000-0000-4000-8000-000000000006',
  actor: '7a000000-0000-4000-8000-000000000007',
} as const
const repoSlug = 'learning-frontend'
const evidenceHash = 'e'.repeat(64)
const resultHash = 'f'.repeat(64)
const times = {
  binding: '2026-08-16T00:00:00.000Z',
  queued: '2026-08-16T00:00:00.100Z',
  issued: '2026-08-16T00:00:01.000Z',
  claim: '2026-08-16T00:00:02.000Z',
  start: '2026-08-16T00:00:03.000Z',
  running: '2026-08-16T00:00:04.000Z',
  terminal: '2026-08-16T00:00:05.000Z',
  expiry: '2026-08-16T00:01:01.000Z',
  afterExpiry: '2026-08-16T00:01:01.001Z',
  deadline: '2026-08-16T00:30:01.000Z',
  successorBinding: '2026-08-16T00:02:00.000Z',
  successorQueued: '2026-08-16T00:02:00.100Z',
  successorIssued: '2026-08-16T00:02:01.000Z',
  successorExpiry: '2026-08-16T00:03:01.000Z',
  successorDeadline: '2026-08-16T00:32:01.000Z',
} as const

const manifest = createWorkerCapabilityManifest({
  workerVersion: '1.0.0',
  operationCodes: ['project_intelligence.inspect'],
  capabilityIds: ['project_intelligence.inspect', 'repository.read'],
}, registry, hashPort)

function binding(attempt = 1, overrides: Partial<Omit<ProgressRunBinding, 'schemaVersion' | 'bindingHash'>> = {}): ProgressRunBinding {
  return createProgressRunBinding({
    taskId: 'P17-014',
    commandRunId: attempt === 1 ? ids.parentRun : ids.successorRun,
    machineId: attempt === 1 ? ids.parentMachine : ids.successorMachine,
    repoId: repoSlug,
    runner: 'control-plane-worker',
    providerExecutionId: null,
    rootRunId: ids.parentRun,
    parentRunId: attempt === 1 ? null : ids.parentRun,
    attempt,
    retentionClass: 'standard',
    createdAt: attempt === 1 ? times.binding : times.successorBinding,
    ...overrides,
  })
}

function executionEnvelope(runBinding: ProgressRunBinding, overrides: Partial<ControlPlaneExecutionEnvelope['identity']> = {}): ControlPlaneExecutionEnvelope {
  const successor = runBinding.attempt > 1
  return createControlPlaneExecutionEnvelope({
    identity: {
      schemaVersion: 1,
      tenantId: ids.tenant,
      taskId: runBinding.taskId,
      commandRunId: runBinding.commandRunId,
      rootRunId: runBinding.rootRunId,
      parentRunId: runBinding.parentRunId,
      attempt: runBinding.attempt,
      deliveryId: successor ? ids.successorDelivery : ids.parentDelivery,
      leaseId: successor ? ids.successorLease : ids.parentLease,
      machineId: runBinding.machineId,
      repositoryId: ids.repository,
      progressBindingHash: runBinding.bindingHash,
      ...overrides,
    },
    operationCode: 'project_intelligence.inspect',
    operationInput: { schemaVersion: 1, repositoryId: ids.repository },
    timing: successor
      ? { issuedAt: times.successorIssued, leaseExpiresAt: times.successorExpiry, deadlineAt: times.successorDeadline }
      : { issuedAt: times.issued, leaseExpiresAt: times.expiry, deadlineAt: times.deadline },
    evidencePolicy: { mode: 'metadata_only', sink: 'p17_015_progress', retentionClass: 'standard' },
  }, registry, hashPort)
}

const reasonByState: Record<ProgressState, ProgressReasonCode> = {
  queued: 'scheduled',
  running: 'started',
  awaiting_input: 'input_required',
  awaiting_approval: 'approval_required',
  passed: 'completed',
  failed: 'provider_failed',
  cancelled: 'operator_cancelled',
  tracking_failed: 'integrity_conflict',
}
let eventSequence = 20
function progressEvents(runBinding: ProgressRunBinding, states: readonly ProgressState[], retryStarted = false): ProgressEvent[] {
  const events: ProgressEvent[] = []
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]
    const previous = events.at(-1) ?? null
    const terminal = state === 'passed' || state === 'failed' || state === 'cancelled' || state === 'tracking_failed'
    const evidence: EvidenceRef | null = state === 'passed' ? {
      schemaVersion: 1,
      sha256: evidenceHash,
      manifestSchemaVersion: '1.0.0',
      mediaType: 'application/json',
      bytes: 2048,
      labelCode: 'verified_result',
      verificationStatus: 'verified',
      taskId: runBinding.taskId,
      commandRunId: runBinding.commandRunId,
      attempt: runBinding.attempt,
      bindingHash: runBinding.bindingHash,
    } : null
    const occurredAt = index === 0
      ? (runBinding.attempt === 1 ? times.queued : times.successorQueued)
      : index === states.length - 1 && terminal ? times.terminal : times.running
    const suffix = (eventSequence++).toString(16).padStart(12, '0')
    events.push(createProgressEvent({
      eventId: `8a000000-0000-4000-8000-${suffix}`,
      taskId: runBinding.taskId,
      commandRunId: runBinding.commandRunId,
      machineId: runBinding.machineId,
      bindingHash: runBinding.bindingHash,
      sequence: index + 1,
      previousEventHash: previous?.eventHash ?? null,
      state,
      phaseId: null,
      reasonCode: index === 0 && retryStarted ? 'retry_started' : reasonByState[state],
      evidence,
      occurredAt,
      receivedAt: occurredAt,
    }))
  }
  return events
}

function ledger(runBindings: ProgressRunBinding[], events: ProgressEvent[]): ProgressLedger {
  return { bindings: runBindings, events }
}

const parentBinding = binding()
const parentEnvelope = executionEnvelope(parentBinding)
const repositoryBinding = createControlPlaneProgressRepositoryBinding({
  tenantId: ids.tenant,
  repositoryId: ids.repository,
  progressRepoId: repoSlug,
}, hashPort)

const actionReasons: Record<ControlPlaneMutationAction, ControlPlaneMutationReasonCode> = {
  submit_for_approval: 'workflow_transition',
  approve: 'operator_approved',
  enqueue: 'workflow_transition',
  claim_lease: 'lease_claimed',
  start_execution: 'lease_started',
  pause_for_input: 'input_required',
  resume_from_input: 'input_available',
  request_runtime_approval: 'approval_required',
  approve_runtime: 'runtime_approved',
  heartbeat: 'lease_heartbeat',
  request_cancel: 'operator_cancelled',
  accept_receipt: 'receipt_received',
  recover_lease: 'lease_expired',
}
let intentSequence = 30
function intent(snapshot: ControlPlaneTaskSnapshot, action: ControlPlaneMutationAction) {
  const suffix = (intentSequence++).toString(16).padStart(12, '0')
  return createControlPlaneMutationIntent({
    tenantId: ids.tenant,
    taskId: 'P17-014',
    actorId: ids.actor,
    action,
    reasonCode: actionReasons[action],
    idempotencyKey: `9a000000-0000-4000-8000-${suffix}`,
    requestedAt: times.claim,
    expectedResourceVersion: snapshot.resourceVersion,
  }, hashPort)
}
function accepted(decision: ControlPlaneTaskMutationDecision): ControlPlaneTaskSnapshot {
  assert.equal(decision.status, 'accepted', `${decision.status}:${decision.reason ?? ''}`)
  return decision.snapshot
}
function definitionSnapshot(runBinding = parentBinding, runEnvelope = parentEnvelope): ControlPlaneTaskSnapshot {
  return createControlPlaneTaskSnapshot({
    identity: {
      schemaVersion: 1,
      tenantId: runEnvelope.identity.tenantId,
      taskId: runBinding.taskId,
      commandRunId: runBinding.commandRunId,
      rootRunId: runBinding.rootRunId,
      parentRunId: runBinding.parentRunId,
      attempt: runBinding.attempt,
      repositoryId: runEnvelope.identity.repositoryId,
      progressBindingHash: runBinding.bindingHash,
    },
    operationCode: runEnvelope.operation.descriptor.code,
  }, registry, hashPort)
}
function queuedSnapshot(runBinding = parentBinding, runEnvelope = parentEnvelope): ControlPlaneTaskSnapshot {
  let snapshot = definitionSnapshot(runBinding, runEnvelope)
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'submit_for_approval'), registry, hashPort))
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'approve'), registry, hashPort))
  return accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'enqueue'), registry, hashPort))
}
function leasedSnapshot(): ControlPlaneTaskSnapshot {
  const snapshot = queuedSnapshot()
  return accepted(claimControlPlaneLease(snapshot, { intent: intent(snapshot, 'claim_lease'), envelope: parentEnvelope, workerManifest: manifest, observedAt: times.claim }, registry, hashPort))
}
function runningSnapshot(): ControlPlaneTaskSnapshot {
  const snapshot = leasedSnapshot()
  return accepted(startControlPlaneExecution(snapshot, { intent: intent(snapshot, 'start_execution'), observedAt: times.start }, registry, hashPort))
}
function terminalFixture(outcome: 'passed' | 'failed' | 'cancelled' | 'unknown_outcome') {
  let snapshot = runningSnapshot()
  const state: ProgressState = outcome === 'unknown_outcome' ? 'tracking_failed' : outcome
  const events = progressEvents(parentBinding, ['queued', 'running', state])
  if (outcome === 'cancelled') snapshot = accepted(requestControlPlaneCancellation(snapshot, intent(snapshot, 'request_cancel'), registry, hashPort))
  const terminalEvidence = events.at(-1)!.evidence
  const receipt = createControlPlaneExecutionReceipt({
    identity: parentEnvelope.identity,
    envelopeHash: parentEnvelope.envelopeHash,
    operationCode: parentEnvelope.operation.descriptor.code,
    operationContractHash: parentEnvelope.operation.descriptor.contractHash,
    outcome,
    completedAt: times.terminal,
    progressBindingHash: parentBinding.bindingHash,
    progressTailHash: events.at(-1)!.eventHash,
    evidenceHashes: terminalEvidence ? [terminalEvidence.sha256] : [],
    resultHash: outcome === 'passed' ? resultHash : null,
  }, parentEnvelope, registry, hashPort)
  snapshot = accepted(applyControlPlaneExecutionReceipt(snapshot, { intent: intent(snapshot, 'accept_receipt'), receipt, observedAt: times.terminal }, registry, hashPort))
  return { snapshot, receipt, progressLedger: ledger([parentBinding], events) }
}

let passed = 0
function run(name: string, body: () => void): void {
  try { body(); passed += 1; console.log(`  PASS ${name}`) } catch (error) { console.error(`  FAIL ${name}`); throw error }
}

run('1. repository mapping is exact, tenant-bound, canonical, and frozen', () => {
  const validated = validateControlPlaneProgressRepositoryBinding(repositoryBinding, hashPort)
  assert.deepEqual(validated, repositoryBinding)
  assert.ok(Object.isFrozen(validated))
  const permuted = createControlPlaneProgressRepositoryBinding({ progressRepoId: repoSlug, repositoryId: ids.repository, tenantId: ids.tenant }, hashPort)
  assert.equal(permuted.repositoryBindingHash, repositoryBinding.repositoryBindingHash)
  assert.throws(() => validateControlPlaneProgressRepositoryBinding({ ...repositoryBinding, progressRepoId: '../unsafe' }, hashPort), ControlPlaneProgressProofError)
  assert.throws(() => createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: '..' }, hashPort), ControlPlaneProgressProofError)
  assert.throws(() => createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: 'https://internal.invalid/repo' }, hashPort), ControlPlaneProgressProofError)
  assert.throws(() => validateControlPlaneProgressRepositoryBinding({ ...repositoryBinding, repositoryBindingHash: '0'.repeat(64) }, hashPort), ControlPlaneProgressProofError)
})

run('2. binding proof composes the real P17 ledger validator', () => {
  const snapshot = queuedSnapshot()
  const progressLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued']))
  const proof = createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, progressPort, registry, hashPort)
  assert.equal(proof.progressBindingHash, parentBinding.bindingHash)
  assert.equal(proof.progressState, 'queued')
  assert.equal(proof.runner, 'control-plane-worker')
  assert.equal(proof.providerExecutionId, null)
  assert.deepEqual(validateControlPlaneProgressBindingProof(proof, hashPort), proof)
  assert.ok(Object.isFrozen(proof))
})

run('3. running, waiting, runtime approval, and cancel-requested projections are closed', () => {
  const queuedLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued']))
  assert.equal(createControlPlaneProgressBindingProof({ snapshot: leasedSnapshot(), envelope: parentEnvelope, repositoryBinding, progressLedger: queuedLedger }, progressPort, registry, hashPort).progressState, 'queued')
  let snapshot = runningSnapshot()
  const runningLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running']))
  assert.equal(createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: runningLedger }, progressPort, registry, hashPort).progressState, 'running')
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'pause_for_input'), registry, hashPort))
  const inputLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running', 'awaiting_input']))
  assert.equal(createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: inputLedger }, progressPort, registry, hashPort).progressState, 'awaiting_input')
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'resume_from_input'), registry, hashPort))
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'request_runtime_approval'), registry, hashPort))
  const approvalLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running', 'awaiting_approval']))
  assert.equal(createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: approvalLedger }, progressPort, registry, hashPort).progressState, 'awaiting_approval')
  snapshot = accepted(applyControlPlaneLifecycleIntent(snapshot, intent(snapshot, 'approve_runtime'), registry, hashPort))
  snapshot = accepted(requestControlPlaneCancellation(snapshot, intent(snapshot, 'request_cancel'), registry, hashPort))
  assert.equal(createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: runningLedger }, progressPort, registry, hashPort).progressState, 'running')
})

run('4. binding proof rejects mapping, identity, current-attempt, tail, and state drift', () => {
  const snapshot = queuedSnapshot()
  const queuedEvents = progressEvents(parentBinding, ['queued'])
  const validLedger = ledger([parentBinding], queuedEvents)
  const wrongRepo = createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: 'other-repo' }, hashPort)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding: wrongRepo, progressLedger: validLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const wrongTenant = createControlPlaneProgressRepositoryBinding({ tenantId: '1b000000-0000-4000-8000-000000000001', repositoryId: ids.repository, progressRepoId: repoSlug }, hashPort)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding: wrongTenant, progressLedger: validLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const wrongRepositoryId = createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: '6b000000-0000-4000-8000-000000000006', progressRepoId: repoSlug }, hashPort)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding: wrongRepositoryId, progressLedger: validLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const foreignBinding = binding(1, { taskId: 'P17-999' })
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([foreignBinding], progressEvents(foreignBinding, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const corruptBinding = { ...parentBinding, bindingHash: '0'.repeat(64) } as ProgressRunBinding
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([corruptBinding], progressEvents(corruptBinding, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const wrongMachine = binding(1, { machineId: ids.successorMachine })
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([wrongMachine], progressEvents(wrongMachine, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const wrongRun = binding(1, { commandRunId: ids.otherRoot, rootRunId: ids.otherRoot })
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([wrongRun], progressEvents(wrongRun, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const shortBinding = binding(1, { retentionClass: 'short_lived' })
  const shortEnvelope = executionEnvelope(shortBinding)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot: queuedSnapshot(shortBinding, shortEnvelope), envelope: shortEnvelope, repositoryBinding, progressLedger: ledger([shortBinding], progressEvents(shortBinding, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const lateBinding = binding(1, { createdAt: '2026-08-16T00:00:01.001Z' })
  const lateEnvelope = executionEnvelope(lateBinding)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot: queuedSnapshot(lateBinding, lateEnvelope), envelope: lateEnvelope, repositoryBinding, progressLedger: ledger([lateBinding], progressEvents(lateBinding, ['queued'])) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([parentBinding], []) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const runningLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running']))
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: runningLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot: definitionSnapshot(), envelope: parentEnvelope, repositoryBinding, progressLedger: validLedger }, progressPort, registry, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'PROGRESS_STATE_MISMATCH')
  const failedEvents = progressEvents(parentBinding, ['queued', 'running', 'failed'])
  const successorBinding = binding(2)
  const successorEvents = progressEvents(successorBinding, ['queued'], true)
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([parentBinding, successorBinding], [...failedEvents, ...successorEvents]) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const terminal = terminalFixture('passed')
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot: terminal.snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: terminal.progressLedger }, progressPort, registry, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'PROGRESS_STATE_MISMATCH')
  const recovery = terminalFixture('unknown_outcome')
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot: recovery.snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger: recovery.progressLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
})

run('5. receipt proofs bind exact terminal tail and evidence through the real ledger', () => {
  for (const outcome of ['passed', 'failed', 'cancelled', 'unknown_outcome'] as const) {
    const fixture = terminalFixture(outcome)
    const proof = createControlPlaneReceiptProgressProof({ ...fixture, envelope: parentEnvelope, repositoryBinding }, progressPort, registry, hashPort)
    assert.equal(proof.receiptHash, fixture.receipt.receiptHash)
    assert.equal(proof.progressTailHash, fixture.receipt.progressTailHash)
    assert.deepEqual(proof.evidenceHashes, fixture.receipt.evidenceHashes)
    assert.deepEqual(validateControlPlaneReceiptProgressProof(proof, hashPort), proof)
  }
})

run('6. receipt proof rejects tail, evidence, terminal outcome, and accepted-hash drift', () => {
  const fixture = terminalFixture('passed')
  const wrongTailReceipt = createControlPlaneExecutionReceipt({
    identity: parentEnvelope.identity,
    envelopeHash: parentEnvelope.envelopeHash,
    operationCode: parentEnvelope.operation.descriptor.code,
    operationContractHash: parentEnvelope.operation.descriptor.contractHash,
    outcome: 'passed',
    completedAt: times.terminal,
    progressBindingHash: parentBinding.bindingHash,
    progressTailHash: '1'.repeat(64),
    evidenceHashes: [evidenceHash],
    resultHash,
  }, parentEnvelope, registry, hashPort)
  assert.throws(() => createControlPlaneReceiptProgressProof({ snapshot: fixture.snapshot, receipt: wrongTailReceipt, envelope: parentEnvelope, repositoryBinding, progressLedger: fixture.progressLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const failedLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running', 'failed']))
  assert.throws(() => createControlPlaneReceiptProgressProof({ snapshot: fixture.snapshot, receipt: fixture.receipt, envelope: parentEnvelope, repositoryBinding, progressLedger: failedLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const passedEvents = progressEvents(parentBinding, ['queued', 'running', 'passed'])
  const terminalEvent = passedEvents.at(-1)!
  const unverifiedEvent = { ...terminalEvent, evidence: { ...terminalEvent.evidence!, verificationStatus: 'quarantined' } } as ProgressEvent
  assert.throws(() => createControlPlaneReceiptProgressProof({ snapshot: fixture.snapshot, receipt: fixture.receipt, envelope: parentEnvelope, repositoryBinding, progressLedger: ledger([parentBinding], [...passedEvents.slice(0, -1), unverifiedEvent]) }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const unknown = terminalFixture('unknown_outcome')
  assert.throws(() => createControlPlaneReceiptProgressProof({ ...unknown, envelope: parentEnvelope, repositoryBinding, progressLedger: failedLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const wrongAcceptedHash = { ...fixture.snapshot, acceptedReceiptHash: '0'.repeat(64) }
  assert.throws(() => createControlPlaneReceiptProgressProof({ snapshot: wrongAcceptedHash, receipt: fixture.receipt, envelope: parentEnvelope, repositoryBinding, progressLedger: fixture.progressLedger }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const proof = createControlPlaneReceiptProgressProof({ ...fixture, envelope: parentEnvelope, repositoryBinding }, progressPort, registry, hashPort)
  assert.throws(() => validateControlPlaneReceiptProgressProof({ ...proof, proofHash: '0'.repeat(64) }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'HASH_MISMATCH')
})

run('7. retry proof preserves the real ledger prefix and adds one exact successor', () => {
  const parentSnapshot = runningSnapshot()
  const parentEvents = progressEvents(parentBinding, ['queued', 'running', 'failed'])
  const currentLedger = ledger([parentBinding], parentEvents)
  const successorBinding = binding(2)
  const successorEvents = progressEvents(successorBinding, ['queued'], true)
  const proposedLedger = ledger([parentBinding, successorBinding], [...parentEvents, ...successorEvents])
  const successorEnvelope = executionEnvelope(successorBinding)
  const observation: ControlPlaneRecoveryObservation = { observedAt: times.afterExpiry, journalState: 'execution_started', receiptHash: null }
  const proof = createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: observation, currentLedger, proposedLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort)
  assert.equal(proof.parentCommandRunId, ids.parentRun)
  assert.equal(proof.successorCommandRunId, ids.successorRun)
  assert.equal(proof.successorAttempt, 2)
  assert.deepEqual(validateControlPlaneRetryProgressProof(proof, hashPort), proof)
  const permuted = Object.fromEntries(Object.entries(proof).reverse())
  assert.deepEqual(validateControlPlaneRetryProgressProof(permuted, hashPort), proof)
  assert.ok(Object.isFrozen(proof))
})

run('8. retry proof rejects absent recovery, changed prefix, branch/lineage drift, and reused IDs', () => {
  const parentSnapshot = runningSnapshot()
  const parentEvents = progressEvents(parentBinding, ['queued', 'running', 'failed'])
  const currentLedger = ledger([parentBinding], parentEvents)
  const successorBinding = binding(2)
  const successorEvents = progressEvents(successorBinding, ['queued'], true)
  const proposedLedger = ledger([parentBinding, successorBinding], [...parentEvents, ...successorEvents])
  const successorEnvelope = executionEnvelope(successorBinding)
  const notExpired: ControlPlaneRecoveryObservation = { observedAt: times.running, journalState: 'execution_started', receiptHash: null }
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: notExpired, currentLedger, proposedLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const nonTerminalLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running']))
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: { observedAt: times.afterExpiry, journalState: 'execution_started', receiptHash: null }, currentLedger: nonTerminalLedger, proposedLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const passedLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued', 'running', 'passed']))
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: { observedAt: times.afterExpiry, journalState: 'execution_started', receiptHash: null }, currentLedger: passedLedger, proposedLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const changedParentEvents = progressEvents(parentBinding, ['queued', 'running', 'tracking_failed'])
  const changedPrefix = ledger([parentBinding, successorBinding], [...changedParentEvents, ...successorEvents])
  const expired: ControlPlaneRecoveryObservation = { observedAt: times.afterExpiry, journalState: 'execution_started', receiptHash: null }
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: changedPrefix, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const siblingBinding = binding(2, { commandRunId: ids.siblingRun, machineId: ids.siblingMachine })
  const siblingEvents = progressEvents(siblingBinding, ['queued'], true)
  const branchedLedger = ledger([parentBinding, successorBinding, siblingBinding], [...parentEvents, ...successorEvents, ...siblingEvents])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: branchedLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const gapBinding = binding(3, { commandRunId: ids.gapRun, parentRunId: ids.successorRun })
  const gapLedger = ledger([parentBinding, gapBinding], [...parentEvents, ...progressEvents(gapBinding, ['queued'], true)])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: gapLedger, successorEnvelope: executionEnvelope(gapBinding), repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const changedRootBinding = binding(2, { commandRunId: ids.siblingRun, rootRunId: ids.otherRoot })
  const changedRootLedger = ledger([parentBinding, changedRootBinding], [...parentEvents, ...progressEvents(changedRootBinding, ['queued'], true)])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: changedRootLedger, successorEnvelope: executionEnvelope(changedRootBinding), repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const changedParentBinding = binding(2, { commandRunId: ids.siblingRun, parentRunId: ids.otherParent })
  const changedParentLedger = ledger([parentBinding, changedParentBinding], [...parentEvents, ...progressEvents(changedParentBinding, ['queued'], true)])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: changedParentLedger, successorEnvelope: executionEnvelope(changedParentBinding), repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const reusedRunBinding = { ...successorBinding, commandRunId: ids.parentRun } as ProgressRunBinding
  const reusedRunLedger = ledger([parentBinding, reusedRunBinding], [...parentEvents, ...progressEvents(reusedRunBinding, ['queued'], true)])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: reusedRunLedger, successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const reusedEnvelope = executionEnvelope(successorBinding, { deliveryId: ids.parentDelivery })
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger, successorEnvelope: reusedEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const reusedLeaseEnvelope = executionEnvelope(successorBinding, { leaseId: ids.parentLease })
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger, successorEnvelope: reusedLeaseEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const runningSuccessor = progressEvents(successorBinding, ['running'])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: ledger([parentBinding, successorBinding], [...parentEvents, ...runningSuccessor]), successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const scheduledSuccessor = progressEvents(successorBinding, ['queued'])
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: ledger([parentBinding, successorBinding], [...parentEvents, ...scheduledSuccessor]), successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
  const mismatchedBinding = binding(2, { machineId: ids.siblingMachine })
  assert.throws(() => createControlPlaneRetryProgressProof({ parentSnapshot, recoveryObservation: expired, currentLedger, proposedLedger: ledger([parentBinding, mismatchedBinding], [...parentEvents, ...progressEvents(mismatchedBinding, ['queued'], true)]), successorEnvelope, repositoryBinding }, progressPort, registry, hashPort), ControlPlaneProgressProofError)
})

run('9. ports, proof validators, and hashes fail closed without caller content', () => {
  const snapshot = queuedSnapshot()
  const progressLedger = ledger([parentBinding], progressEvents(parentBinding, ['queued']))
  const validView = buildProgressTaskView(progressLedger, 'P17-014')
  const throwingPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => { throw new Error('sensitive-provider-detail') } }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, throwingPort, registry, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && !error.message.includes('sensitive-provider-detail'))
  const malformedPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => ({ taskId: 'P17-014' }) }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, malformedPort, registry, hashPort), ControlPlaneProgressProofError)
  const prototypePort: ControlPlaneProgressLedgerPort = { buildTaskView: () => Object.assign(Object.create({ inherited: true }), validView) }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, prototypePort, registry, hashPort), ControlPlaneProgressProofError)
  const extraKeyPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => ({ ...validView, unexpected: true }) }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, extraKeyPort, registry, hashPort), ControlPlaneProgressProofError)
  const hiddenKeyView = { ...validView }
  Object.defineProperty(hiddenKeyView, 'hidden', { enumerable: false, value: true })
  const hiddenKeyPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => hiddenKeyView }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, hiddenKeyPort, registry, hashPort), ControlPlaneProgressProofError)
  const symbolKeyView = { ...validView, [Symbol('hidden')]: true }
  const symbolKeyPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => symbolKeyView }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, symbolKeyPort, registry, hashPort), ControlPlaneProgressProofError)
  const inconsistentCountPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => ({ ...validView, attempts: [{ ...validView.attempts[0], eventCount: 99 }] }) }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, inconsistentCountPort, registry, hashPort), ControlPlaneProgressProofError)
  const accessorView = { ...validView } as Record<string, unknown>
  Object.defineProperty(accessorView, 'ledgerHash', { enumerable: true, get: () => validView.ledgerHash })
  const accessorPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => accessorView }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, accessorPort, registry, hashPort), ControlPlaneProgressProofError)
  const cyclicView = { ...validView } as Record<string, unknown>
  cyclicView.attempts = [cyclicView]
  const cyclicPort: ControlPlaneProgressLedgerPort = { buildTaskView: () => cyclicView }
  assert.throws(() => createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, cyclicPort, registry, hashPort), ControlPlaneProgressProofError)

  const bindingProof = createControlPlaneProgressBindingProof({ snapshot, envelope: parentEnvelope, repositoryBinding, progressLedger }, progressPort, registry, hashPort)
  assert.throws(() => validateControlPlaneProgressBindingProof({ ...bindingProof, commandRunId: 'not-a-uuid' }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'INVALID_IDENTITY')
  assert.throws(() => validateControlPlaneProgressBindingProof({ ...bindingProof, runner: '../unsafe' }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'INVALID_SHAPE')
  assert.throws(() => validateControlPlaneProgressBindingProof({ ...bindingProof, progressState: 'passed' }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'INVALID_SHAPE')

  const terminal = terminalFixture('passed')
  const receiptProof = createControlPlaneReceiptProgressProof({ ...terminal, envelope: parentEnvelope, repositoryBinding }, progressPort, registry, hashPort)
  assert.ok(Object.isFrozen(receiptProof) && Object.isFrozen(receiptProof.evidenceHashes))
  assert.throws(() => validateControlPlaneReceiptProgressProof({ ...receiptProof, outcome: '__proto__' }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'INVALID_SHAPE')
  assert.throws(() => validateControlPlaneReceiptProgressProof({ ...receiptProof, progressState: 'failed' }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'PROGRESS_RECEIPT_MISMATCH')
  assert.throws(() => validateControlPlaneReceiptProgressProof({ ...receiptProof, evidenceHashes: [] }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'PROGRESS_RECEIPT_MISMATCH')
  assert.throws(() => validateControlPlaneReceiptProgressProof({ ...receiptProof, rawEvidence: 'forbidden' }, hashPort), ControlPlaneProgressProofError)

  const parentSnapshot = runningSnapshot()
  const parentEvents = progressEvents(parentBinding, ['queued', 'running', 'failed'])
  const successorBinding = binding(2)
  const successorEvents = progressEvents(successorBinding, ['queued'], true)
  const successorEnvelope = executionEnvelope(successorBinding)
  const retryProof = createControlPlaneRetryProgressProof({
    parentSnapshot,
    recoveryObservation: { observedAt: times.afterExpiry, journalState: 'execution_started', receiptHash: null },
    currentLedger: ledger([parentBinding], parentEvents),
    proposedLedger: ledger([parentBinding, successorBinding], [...parentEvents, ...successorEvents]),
    successorEnvelope,
    repositoryBinding,
  }, progressPort, registry, hashPort)
  assert.throws(() => validateControlPlaneRetryProgressProof({ ...retryProof, successorCommandRunId: retryProof.parentCommandRunId }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'RETRY_LINEAGE_MISMATCH')
  assert.throws(() => validateControlPlaneRetryProgressProof({ ...retryProof, successorEnvelopeHash: retryProof.parentEnvelopeHash }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'RETRY_LINEAGE_MISMATCH')
  assert.throws(() => validateControlPlaneRetryProgressProof({ ...retryProof, proofHash: '0'.repeat(64) }, hashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && error.code === 'HASH_MISMATCH')
  const throwingHashPort: ControlPlaneHashPort = { sha256: () => { throw new Error('sensitive-hash-provider-detail') } }
  assert.throws(() => createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: repoSlug }, throwingHashPort), (error: unknown) => error instanceof ControlPlaneProgressProofError && !error.message.includes('sensitive-hash-provider-detail'))
  const constantPort: ControlPlaneHashPort = { sha256: () => 'a'.repeat(64) }
  assert.throws(() => createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: repoSlug }, constantPort), ControlPlaneProgressProofError)
  const badPort: ControlPlaneHashPort = { sha256: () => 'not-a-hash' }
  assert.throws(() => createControlPlaneProgressRepositoryBinding({ tenantId: ids.tenant, repositoryId: ids.repository, progressRepoId: repoSlug }, badPort), ControlPlaneProgressProofError)
})

run('10. source remains pure, type-only for P17, and free of payload/locator fields', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-progress.ts'), 'utf8')
  assert.match(source, /import type[\s\S]+from ['"]\.\/cross-machine-progress['"]/)
  assert.doesNotMatch(source, /import \{[\s\S]*buildProgressTaskView/)
  assert.doesNotMatch(source, /from ['"]node:/)
  assert.doesNotMatch(source, /child_process|fetch\(|supabase|database|filesystem/)
  assert.doesNotMatch(source, /rawEvidence|evidenceBody|credentialValue|repositoryPath|providerResponse/)
})

console.log(`P17-014 A2D progress binding: PASS (${passed} groups)`)
