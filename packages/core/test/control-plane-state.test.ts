import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_SCHEMA_VERSION,
  createControlPlaneExecutionEnvelope,
  createControlPlaneOperationRegistry,
  createWorkerCapabilityManifest,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
} from '../src/control-plane'
import {
  CONTROL_PLANE_HEARTBEAT_INTERVAL_MS,
  ControlPlaneStateContractError,
  applyControlPlaneExecutionReceipt,
  applyControlPlaneLeaseRecovery,
  applyControlPlaneLifecycleIntent,
  claimControlPlaneLease,
  createControlPlaneExecutionReceipt,
  createControlPlaneMutationIntent,
  createControlPlaneTaskSnapshot,
  decideControlPlaneLeaseRecovery,
  heartbeatControlPlaneLease,
  requestControlPlaneCancellation,
  startControlPlaneExecution,
  validateControlPlaneExecutionReceipt,
  validateControlPlaneMutationIntent,
  validateControlPlaneTaskSnapshot,
  type ControlPlaneMutationAction,
  type ControlPlaneMutationReasonCode,
  type ControlPlaneTaskMutationDecision,
  type ControlPlaneTaskSnapshot,
} from '../src/control-plane-state'

assert.equal(typeof createControlPlaneTaskSnapshot, 'function', 'missing A2C createControlPlaneTaskSnapshot export')
assert.equal(typeof validateControlPlaneTaskSnapshot, 'function', 'missing A2C validateControlPlaneTaskSnapshot export')
assert.equal(typeof createControlPlaneMutationIntent, 'function', 'missing A2C createControlPlaneMutationIntent export')
assert.equal(typeof claimControlPlaneLease, 'function', 'missing A2C claimControlPlaneLease export')
assert.equal(typeof createControlPlaneExecutionReceipt, 'function', 'missing A2C createControlPlaneExecutionReceipt export')

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}
const registry = createControlPlaneOperationRegistry(hashPort)
const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  commandRun: '2a000000-0000-4000-8000-000000000002',
  delivery: '3a000000-0000-4000-8000-000000000003',
  lease: '4a000000-0000-4000-8000-000000000004',
  machine: '5a000000-0000-4000-8000-000000000005',
  repository: '6a000000-0000-4000-8000-000000000006',
  actor: '7a000000-0000-4000-8000-000000000007',
  heartbeat: '8a000000-0000-4000-8000-000000000008',
} as const
const hashes = {
  binding: 'a'.repeat(64),
  progress: 'b'.repeat(64),
  evidenceA: 'c'.repeat(64),
  evidenceB: 'd'.repeat(64),
  result: 'e'.repeat(64),
} as const
const times = {
  issued: '2026-08-16T00:00:00.000Z',
  claim: '2026-08-16T00:00:01.000Z',
  start: '2026-08-16T00:00:02.000Z',
  heartbeat: '2026-08-16T00:00:45.000Z',
  initialExpiry: '2026-08-16T00:01:00.000Z',
  renewedExpiry: '2026-08-16T00:01:15.000Z',
  completed: '2026-08-16T00:00:50.000Z',
  deadline: '2026-08-16T00:30:00.000Z',
} as const

const taskIdentity = {
  schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
  tenantId: ids.tenant,
  taskId: 'P17-014',
  commandRunId: ids.commandRun,
  rootRunId: ids.commandRun,
  parentRunId: null,
  attempt: 1,
  repositoryId: ids.repository,
  progressBindingHash: hashes.binding,
} as const

function envelope(overrides: Partial<ControlPlaneExecutionEnvelope['identity']> = {}): ControlPlaneExecutionEnvelope {
  return createControlPlaneExecutionEnvelope({
    identity: {
      ...taskIdentity,
      deliveryId: ids.delivery,
      leaseId: ids.lease,
      machineId: ids.machine,
      ...overrides,
    },
    operationCode: 'project_intelligence.inspect',
    operationInput: { schemaVersion: 1, repositoryId: ids.repository },
    timing: { issuedAt: times.issued, leaseExpiresAt: times.initialExpiry, deadlineAt: times.deadline },
    evidencePolicy: { mode: 'metadata_only', sink: 'p17_015_progress', retentionClass: 'standard' },
  }, registry, hashPort)
}

const manifest = createWorkerCapabilityManifest({
  workerVersion: '1.0.0',
  operationCodes: ['project_intelligence.inspect'],
  capabilityIds: ['project_intelligence.inspect', 'repository.read'],
}, registry, hashPort)

const reasonByAction: Record<ControlPlaneMutationAction, ControlPlaneMutationReasonCode> = {
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
let intentSequence = 16
function mutationIntent(snapshot: ControlPlaneTaskSnapshot, action: ControlPlaneMutationAction, overrides: Record<string, unknown> = {}) {
  const suffix = (intentSequence++).toString(16).padStart(12, '0')
  return createControlPlaneMutationIntent({
    tenantId: snapshot.identity.tenantId,
    taskId: snapshot.identity.taskId,
    actorId: ids.actor,
    action,
    reasonCode: reasonByAction[action],
    idempotencyKey: `9a000000-0000-4000-8000-${suffix}`,
    requestedAt: times.claim,
    expectedResourceVersion: snapshot.resourceVersion,
    ...overrides,
  }, hashPort)
}

function accepted(decision: ControlPlaneTaskMutationDecision): ControlPlaneTaskSnapshot {
  assert.equal(decision.status, 'accepted', `expected accepted, got ${decision.status}:${decision.reason ?? ''}`)
  return decision.snapshot
}
function lifecycle(snapshot: ControlPlaneTaskSnapshot, action: ControlPlaneMutationAction): ControlPlaneTaskSnapshot {
  return accepted(applyControlPlaneLifecycleIntent(snapshot, mutationIntent(snapshot, action), registry, hashPort))
}
function queuedSnapshot(): ControlPlaneTaskSnapshot {
  let snapshot = createControlPlaneTaskSnapshot({ identity: taskIdentity, operationCode: 'project_intelligence.inspect' }, registry, hashPort)
  snapshot = lifecycle(snapshot, 'submit_for_approval')
  snapshot = lifecycle(snapshot, 'approve')
  return lifecycle(snapshot, 'enqueue')
}
function leasedSnapshot(): ControlPlaneTaskSnapshot {
  const snapshot = queuedSnapshot()
  return accepted(claimControlPlaneLease(snapshot, {
    intent: mutationIntent(snapshot, 'claim_lease'),
    envelope: envelope(),
    workerManifest: manifest,
    observedAt: times.claim,
  }, registry, hashPort))
}
function runningSnapshot(): ControlPlaneTaskSnapshot {
  const snapshot = leasedSnapshot()
  return accepted(startControlPlaneExecution(snapshot, {
    intent: mutationIntent(snapshot, 'start_execution'),
    observedAt: times.start,
  }, registry, hashPort))
}
function receiptFor(targetEnvelope: ControlPlaneExecutionEnvelope, outcome: 'passed' | 'failed' | 'cancelled' | 'unknown_outcome' = 'passed') {
  return createControlPlaneExecutionReceipt({
    identity: targetEnvelope.identity,
    envelopeHash: targetEnvelope.envelopeHash,
    operationCode: targetEnvelope.operation.descriptor.code,
    operationContractHash: targetEnvelope.operation.descriptor.contractHash,
    outcome,
    completedAt: times.completed,
    progressBindingHash: targetEnvelope.identity.progressBindingHash,
    progressTailHash: hashes.progress,
    evidenceHashes: [hashes.evidenceA, hashes.evidenceB],
    resultHash: outcome === 'passed' ? hashes.result : null,
  }, targetEnvelope, registry, hashPort)
}

let passed = 0
function run(name: string, body: () => void): void {
  try {
    body()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

run('1. exact initial snapshot and closed definition/runtime lifecycle', () => {
  assert.equal(CONTROL_PLANE_HEARTBEAT_INTERVAL_MS, 15_000)
  let snapshot = createControlPlaneTaskSnapshot({ identity: taskIdentity, operationCode: 'project_intelligence.inspect' }, registry, hashPort)
  assert.deepEqual(snapshot.state, { code: 'draft' })
  assert.equal(snapshot.resourceVersion, 1)
  snapshot = lifecycle(snapshot, 'submit_for_approval')
  assert.deepEqual(snapshot.state, { code: 'awaiting_approval', approvalContext: 'definition' })
  snapshot = lifecycle(snapshot, 'approve')
  snapshot = lifecycle(snapshot, 'enqueue')
  snapshot = accepted(claimControlPlaneLease(snapshot, { intent: mutationIntent(snapshot, 'claim_lease'), envelope: envelope(), workerManifest: manifest, observedAt: times.claim }, registry, hashPort))
  snapshot = accepted(startControlPlaneExecution(snapshot, { intent: mutationIntent(snapshot, 'start_execution'), observedAt: times.start }, registry, hashPort))
  snapshot = lifecycle(snapshot, 'request_runtime_approval')
  assert.deepEqual(snapshot.state, { code: 'awaiting_approval', approvalContext: 'runtime' })
  snapshot = lifecycle(snapshot, 'approve_runtime')
  snapshot = lifecycle(snapshot, 'pause_for_input')
  assert.deepEqual(snapshot.state, { code: 'awaiting_input' })
  snapshot = lifecycle(snapshot, 'resume_from_input')
  assert.deepEqual(snapshot.state, { code: 'running' })
  const illegal = applyControlPlaneLifecycleIntent(snapshot, mutationIntent(snapshot, 'approve'), registry, hashPort)
  assert.deepEqual([illegal.status, illegal.reason], ['rejected', 'illegal_transition'])
  let accessorRead = false
  const accessorIntent = { ...mutationIntent(snapshot, 'pause_for_input') } as Record<string, unknown>
  Object.defineProperty(accessorIntent, 'action', { enumerable: true, get: () => { accessorRead = true; return 'pause_for_input' } })
  assert.throws(() => applyControlPlaneLifecycleIntent(snapshot, accessorIntent as unknown as ReturnType<typeof mutationIntent>, registry, hashPort), ControlPlaneStateContractError)
  assert.equal(accessorRead, false)
})

run('2. CAS rejects stale versions and overflow without mutation', () => {
  const snapshot = queuedSnapshot()
  const before = JSON.stringify(snapshot)
  const stale = mutationIntent(snapshot, 'claim_lease', { expectedResourceVersion: snapshot.resourceVersion - 1 })
  const rejected = claimControlPlaneLease(snapshot, { intent: stale, envelope: envelope(), workerManifest: manifest, observedAt: times.claim }, registry, hashPort)
  assert.deepEqual([rejected.status, rejected.reason], ['conflict', 'stale_resource_version'])
  assert.strictEqual(rejected.snapshot, snapshot)
  assert.equal(JSON.stringify(snapshot), before)
  const overflow = { ...snapshot, resourceVersion: Number.MAX_SAFE_INTEGER }
  assert.throws(() => validateControlPlaneTaskSnapshot(overflow, registry, hashPort), ControlPlaneStateContractError)
})

run('3. lease claim binds envelope identity, operation, manifest, and one worker', () => {
  const queued = queuedSnapshot()
  const leased = accepted(claimControlPlaneLease(queued, { intent: mutationIntent(queued, 'claim_lease'), envelope: envelope(), workerManifest: manifest, observedAt: times.claim }, registry, hashPort))
  assert.deepEqual(leased.state, { code: 'leased' })
  assert.equal(leased.lease?.envelope.envelopeHash, envelope().envelopeHash)
  const second = claimControlPlaneLease(leased, { intent: mutationIntent(leased, 'claim_lease'), envelope: envelope({ machineId: '5b000000-0000-4000-8000-000000000005' }), workerManifest: manifest, observedAt: times.claim }, registry, hashPort)
  assert.deepEqual([second.status, second.reason], ['conflict', 'active_lease_exists'])
  const mismatch = claimControlPlaneLease(queued, { intent: mutationIntent(queued, 'claim_lease'), envelope: envelope({ tenantId: '1b000000-0000-4000-8000-000000000001' }), workerManifest: manifest, observedAt: times.claim }, registry, hashPort)
  assert.deepEqual([mismatch.status, mismatch.reason], ['rejected', 'envelope_identity_mismatch'])
  const missingCapability = createWorkerCapabilityManifest({ workerVersion: '1.0.0', operationCodes: [], capabilityIds: [] }, registry, hashPort)
  const unavailable = claimControlPlaneLease(queued, { intent: mutationIntent(queued, 'claim_lease'), envelope: envelope(), workerManifest: missingCapability, observedAt: times.claim }, registry, hashPort)
  assert.deepEqual([unavailable.status, unavailable.reason], ['rejected', 'worker_capability_mismatch'])
})

run('4. claim and start reject observations outside current authority', () => {
  const queued = queuedSnapshot()
  const early = claimControlPlaneLease(queued, { intent: mutationIntent(queued, 'claim_lease'), envelope: envelope(), workerManifest: manifest, observedAt: '2026-08-15T23:59:59.999Z' }, registry, hashPort)
  assert.deepEqual([early.status, early.reason], ['rejected', 'outside_lease_window'])
  const leased = leasedSnapshot()
  const lateStart = startControlPlaneExecution(leased, { intent: mutationIntent(leased, 'start_execution'), observedAt: times.initialExpiry }, registry, hashPort)
  assert.deepEqual([lateStart.status, lateStart.reason], ['rejected', 'lease_expired'])
})

run('5. heartbeat is monotonic, bounded, deadline-capped, and exactly idempotent', () => {
  const running = runningSnapshot()
  const intent = mutationIntent(running, 'heartbeat')
  const request = { intent, heartbeatId: ids.heartbeat, observedAt: times.heartbeat, requestedExpiresAt: times.renewedExpiry }
  const beat = heartbeatControlPlaneLease(running, request, registry, hashPort)
  const renewed = accepted(beat)
  assert.equal(renewed.lease?.currentExpiresAt, times.renewedExpiry)
  assert.equal(renewed.resourceVersion, running.resourceVersion + 1)
  const replay = heartbeatControlPlaneLease(renewed, request, registry, hashPort)
  assert.equal(replay.status, 'idempotent')
  assert.strictEqual(replay.snapshot, renewed)
  const rollback = heartbeatControlPlaneLease(renewed, { ...request, intent: mutationIntent(renewed, 'heartbeat'), heartbeatId: '8b000000-0000-4000-8000-000000000008', observedAt: times.start, requestedExpiresAt: times.renewedExpiry }, registry, hashPort)
  assert.deepEqual([rollback.status, rollback.reason], ['rejected', 'heartbeat_not_monotonic'])
  const tooFar = heartbeatControlPlaneLease(running, { ...request, intent: mutationIntent(running, 'heartbeat'), heartbeatId: '8c000000-0000-4000-8000-000000000008', requestedExpiresAt: '2026-08-16T00:01:15.001Z' }, registry, hashPort)
  assert.deepEqual([tooFar.status, tooFar.reason], ['rejected', 'heartbeat_extension_exceeded'])
})

run('6. cancellation is direct pre-lease, cooperative with a worker, and idempotency-safe', () => {
  const queued = queuedSnapshot()
  const queuedIntent = mutationIntent(queued, 'request_cancel')
  const direct = requestControlPlaneCancellation(queued, queuedIntent, registry, hashPort)
  assert.deepEqual(accepted(direct).state, { code: 'cancelled' })
  const running = runningSnapshot()
  const cancelIntent = mutationIntent(running, 'request_cancel')
  const requested = accepted(requestControlPlaneCancellation(running, cancelIntent, registry, hashPort))
  assert.deepEqual(requested.state, { code: 'cancel_requested' })
  const replay = requestControlPlaneCancellation(requested, cancelIntent, registry, hashPort)
  assert.equal(replay.status, 'idempotent')
  const conflictIntent = createControlPlaneMutationIntent({
    tenantId: cancelIntent.tenantId,
    taskId: cancelIntent.taskId,
    actorId: cancelIntent.actorId,
    action: cancelIntent.action,
    reasonCode: cancelIntent.reasonCode,
    idempotencyKey: cancelIntent.idempotencyKey,
    requestedAt: '2026-08-16T00:00:03.000Z',
    expectedResourceVersion: cancelIntent.expectedResourceVersion,
  }, hashPort)
  const conflict = requestControlPlaneCancellation(requested, conflictIntent, registry, hashPort)
  assert.deepEqual([conflict.status, conflict.reason], ['conflict', 'idempotency_conflict'])
  const noRenew = heartbeatControlPlaneLease(requested, { intent: mutationIntent(requested, 'heartbeat'), heartbeatId: ids.heartbeat, observedAt: times.heartbeat, requestedExpiresAt: times.renewedExpiry }, registry, hashPort)
  assert.deepEqual([noRenew.status, noRenew.reason], ['rejected', 'cancellation_pending'])
})

run('7. receipt is exact, metadata-only, canonical, and tamper-evident', () => {
  const targetEnvelope = envelope()
  const receipt = receiptFor(targetEnvelope)
  const validated = validateControlPlaneExecutionReceipt(receipt, targetEnvelope, registry, hashPort)
  assert.equal(validated.receiptHash, receipt.receiptHash)
  assert.ok(Object.isFrozen(validated))
  const permuted = createControlPlaneExecutionReceipt({
    resultHash: hashes.result,
    evidenceHashes: [hashes.evidenceA, hashes.evidenceB],
    progressTailHash: hashes.progress,
    progressBindingHash: hashes.binding,
    completedAt: times.completed,
    outcome: 'passed',
    operationContractHash: targetEnvelope.operation.descriptor.contractHash,
    operationCode: targetEnvelope.operation.descriptor.code,
    envelopeHash: targetEnvelope.envelopeHash,
    identity: targetEnvelope.identity,
  }, targetEnvelope, registry, hashPort)
  assert.equal(permuted.receiptHash, receipt.receiptHash)
  const permutedIdentity = Object.fromEntries(Object.entries(targetEnvelope.identity).reverse()) as unknown as ControlPlaneExecutionEnvelope['identity']
  const identityPermuted = createControlPlaneExecutionReceipt({
    identity: permutedIdentity,
    envelopeHash: targetEnvelope.envelopeHash,
    operationCode: targetEnvelope.operation.descriptor.code,
    operationContractHash: targetEnvelope.operation.descriptor.contractHash,
    outcome: 'passed',
    completedAt: times.completed,
    progressBindingHash: hashes.binding,
    progressTailHash: hashes.progress,
    evidenceHashes: [hashes.evidenceA, hashes.evidenceB],
    resultHash: hashes.result,
  }, targetEnvelope, registry, hashPort)
  assert.equal(identityPermuted.receiptHash, receipt.receiptHash)
  assert.throws(() => validateControlPlaneExecutionReceipt({ ...receipt, rawOutput: 'secret' }, targetEnvelope, registry, hashPort), ControlPlaneStateContractError)
  assert.throws(() => validateControlPlaneExecutionReceipt({ ...receipt, receiptHash: 'f'.repeat(64) }, targetEnvelope, registry, hashPort), ControlPlaneStateContractError)
  assert.throws(() => createControlPlaneExecutionReceipt({ ...receipt, resultHash: null }, targetEnvelope, registry, hashPort), ControlPlaneStateContractError)
})

run('8. receipt acceptance is terminal, replay-idempotent, and conflict-safe', () => {
  const running = runningSnapshot()
  const targetEnvelope = running.lease!.envelope
  const receipt = receiptFor(targetEnvelope)
  const intent = mutationIntent(running, 'accept_receipt')
  const completed = accepted(applyControlPlaneExecutionReceipt(running, { intent, receipt, observedAt: times.completed }, registry, hashPort))
  assert.deepEqual(completed.state, { code: 'passed' })
  const replay = applyControlPlaneExecutionReceipt(completed, { intent, receipt, observedAt: times.completed }, registry, hashPort)
  assert.equal(replay.status, 'idempotent')
  assert.strictEqual(replay.snapshot, completed)
  const wrongReplayIntent = applyControlPlaneExecutionReceipt(completed, { intent: mutationIntent(completed, 'heartbeat'), receipt, observedAt: times.completed }, registry, hashPort)
  assert.deepEqual([wrongReplayIntent.status, wrongReplayIntent.reason], ['rejected', 'illegal_transition'])
  const forgedSameHash = { ...receipt, outcome: 'failed' as const, resultHash: null }
  assert.throws(() => applyControlPlaneExecutionReceipt(completed, { intent, receipt: forgedSameHash, observedAt: times.completed }, registry, hashPort), ControlPlaneStateContractError)
  const conflicting = { ...receipt, outcome: 'failed' as const, resultHash: null, receiptHash: 'f'.repeat(64) }
  const before = JSON.stringify(completed)
  const decision = applyControlPlaneExecutionReceipt(completed, { intent: mutationIntent(completed, 'accept_receipt'), receipt: conflicting, observedAt: times.completed }, registry, hashPort)
  assert.equal(decision.status, 'conflict')
  assert.equal(JSON.stringify(completed), before)
  const cancel = requestControlPlaneCancellation(completed, mutationIntent(completed, 'request_cancel'), registry, hashPort)
  assert.deepEqual([cancel.status, cancel.reason], ['conflict', 'terminal_state'])
})

run('9. cancellation wins over success and late receipts are quarantined', () => {
  const running = runningSnapshot()
  const targetEnvelope = running.lease!.envelope
  const cancelRequested = accepted(requestControlPlaneCancellation(running, mutationIntent(running, 'request_cancel'), registry, hashPort))
  const success = receiptFor(targetEnvelope)
  const cancelWon = applyControlPlaneExecutionReceipt(cancelRequested, { intent: mutationIntent(cancelRequested, 'accept_receipt'), receipt: success, observedAt: times.completed }, registry, hashPort)
  assert.deepEqual([cancelWon.status, cancelWon.reason], ['quarantined', 'cancellation_won'])
  assert.strictEqual(cancelWon.snapshot, cancelRequested)
  const cancelledReceipt = receiptFor(targetEnvelope, 'cancelled')
  const cancelled = accepted(applyControlPlaneExecutionReceipt(cancelRequested, { intent: mutationIntent(cancelRequested, 'accept_receipt'), receipt: cancelledReceipt, observedAt: times.completed }, registry, hashPort))
  assert.deepEqual(cancelled.state, { code: 'cancelled' })
  const late = applyControlPlaneExecutionReceipt(running, { intent: mutationIntent(running, 'accept_receipt'), receipt: success, observedAt: '2026-08-16T00:01:00.001Z' }, registry, hashPort)
  assert.deepEqual([late.status, late.reason], ['quarantined', 'late_receipt'])
  const beforeStart = createControlPlaneExecutionReceipt({
    identity: success.identity,
    envelopeHash: success.envelopeHash,
    operationCode: success.operationCode,
    operationContractHash: success.operationContractHash,
    outcome: success.outcome,
    completedAt: '2026-08-16T00:00:01.500Z',
    progressBindingHash: success.progressBindingHash,
    progressTailHash: success.progressTailHash,
    evidenceHashes: success.evidenceHashes,
    resultHash: success.resultHash,
  }, targetEnvelope, registry, hashPort)
  const impossibleCompletion = applyControlPlaneExecutionReceipt(running, { intent: mutationIntent(running, 'accept_receipt'), receipt: beforeStart, observedAt: times.completed }, registry, hashPort)
  assert.deepEqual([impossibleCompletion.status, impossibleCompletion.reason], ['rejected', 'receipt_mismatch'])
  const observedBeforeCompletion = applyControlPlaneExecutionReceipt(running, { intent: mutationIntent(running, 'accept_receipt'), receipt: success, observedAt: '2026-08-16T00:00:49.999Z' }, registry, hashPort)
  assert.deepEqual([observedBeforeCompletion.status, observedBeforeCompletion.reason], ['rejected', 'receipt_mismatch'])
})

run('10. recovery is conservative and never creates a successor', () => {
  const leased = leasedSnapshot()
  assert.deepEqual(decideControlPlaneLeaseRecovery(leased, { observedAt: times.heartbeat, journalState: 'not_started', receiptHash: null }, registry, hashPort).action, 'wait_active_lease')
  const afterExpiry = '2026-08-16T00:01:00.001Z'
  const reclaim = decideControlPlaneLeaseRecovery(leased, { observedAt: afterExpiry, journalState: 'not_started', receiptHash: null }, registry, hashPort)
  assert.equal(reclaim.action, 'reclaim_same_attempt')
  const reclaimed = accepted(applyControlPlaneLeaseRecovery(leased, { intent: mutationIntent(leased, 'recover_lease'), observation: { observedAt: afterExpiry, journalState: 'not_started', receiptHash: null } }, registry, hashPort))
  assert.deepEqual(reclaimed.state, { code: 'queued' })
  assert.equal(reclaimed.lease, null)
  const running = runningSnapshot()
  assert.equal(decideControlPlaneLeaseRecovery(running, { observedAt: afterExpiry, journalState: 'execution_started', receiptHash: null }, registry, hashPort).action, 'retry_new_attempt')
  const unknown = applyControlPlaneLeaseRecovery(running, { intent: mutationIntent(running, 'recover_lease'), observation: { observedAt: afterExpiry, journalState: 'unknown', receiptHash: null } }, registry, hashPort)
  assert.deepEqual(accepted(unknown).state, { code: 'recovery_required' })
  const escape = applyControlPlaneLifecycleIntent(accepted(unknown), mutationIntent(accepted(unknown), 'enqueue'), registry, hashPort)
  assert.deepEqual([escape.status, escape.reason], ['rejected', 'illegal_transition'])
})

run('11. validators reject extras, prototypes, accessors, and input mutation', () => {
  const snapshot = queuedSnapshot()
  assert.deepEqual(validateControlPlaneTaskSnapshot(snapshot, registry, hashPort), snapshot)
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.identity) && Object.isFrozen(snapshot.operation))
  assert.throws(() => validateControlPlaneTaskSnapshot({ ...snapshot, extra: true }, registry, hashPort), ControlPlaneStateContractError)
  assert.throws(() => validateControlPlaneTaskSnapshot(Object.assign(Object.create({ polluted: true }), snapshot), registry, hashPort), ControlPlaneStateContractError)
  const accessor = { ...snapshot } as Record<string, unknown>
  Object.defineProperty(accessor, 'resourceVersion', { enumerable: true, get: () => snapshot.resourceVersion })
  assert.throws(() => validateControlPlaneTaskSnapshot(accessor, registry, hashPort), ControlPlaneStateContractError)
  assert.throws(() => validateControlPlaneTaskSnapshot({ ...snapshot, acceptedReceiptHash: hashes.result }, registry, hashPort), ControlPlaneStateContractError)
  assert.throws(() => createControlPlaneTaskSnapshot(null as unknown as Parameters<typeof createControlPlaneTaskSnapshot>[0], registry, hashPort), ControlPlaneStateContractError)
  const intent = mutationIntent(snapshot, 'enqueue')
  assert.deepEqual(validateControlPlaneMutationIntent(intent, hashPort), intent)
  assert.throws(() => validateControlPlaneMutationIntent({ ...intent, token: 'credential' }, hashPort), ControlPlaneStateContractError)
})

run('12. source remains pure and does not absorb P2/P17/runtime ownership', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-state.ts'), 'utf8')
  assert.doesNotMatch(source, /from ['"]node:/)
  assert.doesNotMatch(source, /multi-agent-orchestration|multi-agent-runtime/)
  assert.doesNotMatch(source, /cross-machine-progress/)
  assert.doesNotMatch(source, /child_process|process\.|fetch\(|supabase|database|filesystem/)
  assert.doesNotMatch(source, /rawOutput|promptText|credentialValue|providerResponse/)
  assert.match(source, /from ['"]\.\/control-plane['"]/)
  assert.equal(CONTROL_PLANE_SCHEMA_VERSION, 1)
  assert.equal(CONTROL_PLANE_CONTRACT_VERSION, '1.0.0')
})

console.log(`P17-014 A2C state/lease/replay: PASS (${passed} groups)`)
