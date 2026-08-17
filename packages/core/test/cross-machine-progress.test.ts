import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CROSS_MACHINE_PROGRESS_SCHEMA_VERSION,
  CROSS_MACHINE_PROGRESS_SENTINEL,
  buildProgressTaskView,
  createProgressEvent,
  createProgressRunBinding,
  parseProgressSentinelLine,
  validateEvidenceRef,
  validateProgressEvent,
  validateProgressRunBinding,
  type EvidenceRef,
  type ProgressEvent,
  type ProgressReasonCode,
  type ProgressRunBinding,
  type ProgressState,
} from '../src/cross-machine-progress'

let assertions = 0
let attacks = 0

function assertion(name: string, run: () => void): void {
  run(); assertions += 1; console.log(`PASS ${name}`)
}

function attack(name: string, run: () => void): void {
  run(); attacks += 1; console.log(`PASS attack: ${name}`)
}

const TASK = 'P17-015'
const ROOT_RUN = '11111111-1111-4111-8111-111111111111'
const RETRY_RUN = '22222222-2222-4222-8222-222222222222'
const THIRD_RUN = '33333333-3333-4333-8333-333333333333'
const OTHER_ROOT = '44444444-4444-4444-8444-444444444444'
const MACHINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MACHINE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function timestamp(minute: number): string {
  return new Date(Date.UTC(2026, 7, 14, 8, minute, 0, 0)).toISOString()
}

function rootBinding(): ProgressRunBinding {
  return createProgressRunBinding({
    taskId: TASK,
    commandRunId: ROOT_RUN,
    machineId: MACHINE_A,
    repoId: 'kit',
    runner: 'codex',
    providerExecutionId: 'thread:root-1',
    rootRunId: ROOT_RUN,
    parentRunId: null,
    attempt: 1,
    retentionClass: 'standard',
    createdAt: timestamp(0),
  })
}

function retryBinding(): ProgressRunBinding {
  return createProgressRunBinding({
    taskId: TASK,
    commandRunId: RETRY_RUN,
    machineId: MACHINE_B,
    repoId: 'kit',
    runner: 'claude',
    providerExecutionId: null,
    rootRunId: ROOT_RUN,
    parentRunId: ROOT_RUN,
    attempt: 2,
    retentionClass: 'standard',
    createdAt: timestamp(4),
  })
}

function evidence(binding: ProgressRunBinding, status: EvidenceRef['verificationStatus'] = 'verified'): EvidenceRef {
  return validateEvidenceRef({
    schemaVersion: CROSS_MACHINE_PROGRESS_SCHEMA_VERSION,
    sha256: 'e'.repeat(64),
    manifestSchemaVersion: '1.0.0',
    mediaType: 'application/json',
    bytes: 1024,
    labelCode: 'terminal_evidence',
    verificationStatus: status,
    taskId: binding.taskId,
    commandRunId: binding.commandRunId,
    attempt: binding.attempt,
    bindingHash: binding.bindingHash,
  })
}

let eventCounter = 1
function event(
  binding: ProgressRunBinding,
  sequence: number,
  previous: ProgressEvent | null,
  state: ProgressState,
  reasonCode: ProgressReasonCode,
  minute: number,
  eventEvidence: EvidenceRef | null = null,
  machineId = binding.machineId,
): ProgressEvent {
  const suffix = String(eventCounter++).padStart(12, '0')
  return createProgressEvent({
    eventId: `00000000-0000-4000-8000-${suffix}`,
    taskId: binding.taskId,
    commandRunId: binding.commandRunId,
    machineId,
    bindingHash: binding.bindingHash,
    sequence,
    previousEventHash: previous?.eventHash ?? null,
    state,
    phaseId: state === 'queued' ? null : 'B11',
    reasonCode,
    evidence: eventEvidence,
    occurredAt: timestamp(minute),
    receivedAt: timestamp(minute),
  })
}

function fixture() {
  eventCounter = 1
  const root = rootBinding()
  const retry = retryBinding()
  const rootQueued = event(root, 1, null, 'queued', 'scheduled', 0)
  const rootRunning = event(root, 2, rootQueued, 'running', 'started', 1)
  const rootFailed = event(root, 3, rootRunning, 'failed', 'verification_failed', 2)
  const retryQueued = event(retry, 1, null, 'queued', 'retry_started', 4)
  const retryRunning = event(retry, 2, retryQueued, 'running', 'started', 5)
  const retryPassed = event(retry, 3, retryRunning, 'passed', 'completed', 6, evidence(retry))
  return { root, retry, rootQueued, rootRunning, rootFailed, retryQueued, retryRunning, retryPassed }
}

assertion('binding identity is deterministic and machine identity remains configured, not derived', () => {
  const first = rootBinding()
  const second = rootBinding()
  assert.equal(first.bindingHash, second.bindingHash)
  assert.equal(first.machineId, MACHINE_A)
  assert.equal(first.repoId, 'kit')
  assert.equal(validateProgressRunBinding(structuredClone(first)).bindingHash, first.bindingHash)
})

assertion('two-machine linear retry resolves to the exact passed evidence and current attempt', () => {
  const f = fixture()
  const view = buildProgressTaskView({ bindings: [f.retry, f.root], events: [f.retryPassed, f.rootFailed, f.retryRunning, f.rootRunning, f.retryQueued, f.rootQueued] }, TASK)
  assert.equal(view.attempts.length, 2)
  assert.equal(view.currentAttempt, 2)
  assert.equal(view.currentState, 'passed')
  assert.equal(view.attempts[0].binding.machineId, MACHINE_A)
  assert.equal(view.attempts[1].binding.machineId, MACHINE_B)
  assert.equal(view.attempts[1].evidence?.sha256, 'e'.repeat(64))
  assert.match(view.ledgerHash, /^[0-9a-f]{64}$/)
})

assertion('an exact event replay is idempotent and does not duplicate progress', () => {
  const f = fixture()
  const view = buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, f.rootQueued, f.rootRunning, f.rootFailed] }, TASK)
  assert.equal(view.attempts[0].eventCount, 3)
  assert.equal(view.currentState, 'failed')
})

assertion('canonical sentinel round-trips both binding and event envelopes', () => {
  const f = fixture()
  const binding = parseProgressSentinelLine(`${CROSS_MACHINE_PROGRESS_SENTINEL}${JSON.stringify(f.root)}`)
  const parsedEvent = parseProgressSentinelLine(`${CROSS_MACHINE_PROGRESS_SENTINEL}${JSON.stringify(f.rootQueued)}`)
  assert.equal('bindingHash' in binding && binding.bindingHash, f.root.bindingHash)
  assert.equal('eventHash' in parsedEvent && parsedEvent.eventHash, f.rootQueued.eventHash)
})

assertion('public schema is closed and publishes the exact versioned binding/event union', () => {
  const schema = JSON.parse(fs.readFileSync(path.resolve('docs/schemas/cross-machine-progress.schema.json'), 'utf8'))
  assert.equal(schema.oneOf.length, 2)
  assert.equal(schema.$defs.progressRunBinding.additionalProperties, false)
  assert.equal(schema.$defs.progressEvent.additionalProperties, false)
  assert.equal(schema.$defs.progressRunBinding.properties.schemaVersion.const, CROSS_MACHINE_PROGRESS_SCHEMA_VERSION)
  assert.deepEqual(schema.$defs.progressEvent.properties.state.enum, ['queued', 'running', 'awaiting_input', 'awaiting_approval', 'passed', 'failed', 'cancelled', 'tracking_failed'])
})

assertion('clock status classifies bounded producer skew without changing event order', () => {
  const f = fixture()
  const ahead = createProgressEvent({ ...f.rootQueued, receivedAt: timestamp(10) })
  const view = buildProgressTaskView({ bindings: [f.root], events: [ahead] }, TASK)
  assert.equal(view.attempts[0].clockStatus, 'producer_behind')
})

attack('extra binding fields are rejected, including secret and host metadata', () => {
  const value = { ...rootBinding(), token: 'secret', hostname: 'worker-01' }
  assert.throws(() => validateProgressRunBinding(value), /fields are not exact/)
})

attack('binding hash tampering is rejected', () => {
  const value = { ...rootBinding(), repoId: 'dashboard' }
  assert.throws(() => validateProgressRunBinding(value), /hash mismatch/)
})

attack('first attempt cannot point at a different root or parent', () => {
  const value = { ...rootBinding(), rootRunId: OTHER_ROOT }
  assert.throws(() => validateProgressRunBinding(value), /first attempt/)
})

attack('one task cannot contain multiple independent root runs', () => {
  const f = fixture()
  const other = createProgressRunBinding({ ...f.root, commandRunId: OTHER_ROOT, rootRunId: OTHER_ROOT, providerExecutionId: null, createdAt: timestamp(8) })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, other], events: [] }, TASK), /multiple root runs/)
})

attack('two machines cannot create sibling retries from the same parent', () => {
  const f = fixture()
  const branch = createProgressRunBinding({ ...f.retry, commandRunId: THIRD_RUN, machineId: MACHINE_A, providerExecutionId: 'branch-2' })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, f.retry, branch], events: [f.rootQueued, f.rootRunning, f.rootFailed] }, TASK), /duplicate retry attempt|branches/)
})

attack('retry ordinals cannot skip a parent attempt', () => {
  const f = fixture()
  const gap = createProgressRunBinding({ ...f.retry, commandRunId: THIRD_RUN, attempt: 3 })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, gap], events: [f.rootQueued, f.rootRunning, f.rootFailed] }, TASK), /parent\/root\/ordinal/)
})

attack('a retry cannot predate its parent', () => {
  const f = fixture()
  const early = createProgressRunBinding({ ...f.retry, createdAt: new Date(Date.UTC(2026, 7, 14, 7, 59)).toISOString() })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, early], events: [f.rootQueued, f.rootRunning, f.rootFailed] }, TASK), /predates/)
})

attack('a retry requires a non-passed terminal parent', () => {
  const f = fixture()
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, f.retry], events: [f.rootQueued, f.rootRunning] }, TASK), /non-passed terminal/)
  const parentPassed = event(f.root, 3, f.rootRunning, 'passed', 'completed', 2, evidence(f.root))
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, f.retry], events: [f.rootQueued, f.rootRunning, parentPassed] }, TASK), /non-passed terminal/)
})

attack('event machine identity cannot overwrite its immutable binding', () => {
  const f = fixture()
  const wrongMachine = event(f.root, 1, null, 'queued', 'scheduled', 0, null, MACHINE_B)
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [wrongMachine] }, TASK), /identity does not match binding/)
})

attack('event sequence gaps and previous-hash mismatches are rejected', () => {
  const f = fixture()
  const gap = createProgressEvent({ ...f.rootRunning, sequence: 3 })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, gap] }, TASK), /gap or hash mismatch/)
  const wrongPrevious = createProgressEvent({ ...f.rootRunning, previousEventHash: 'a'.repeat(64) })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, wrongPrevious] }, TASK), /gap or hash mismatch/)
})

attack('an event ID replay with different content is rejected', () => {
  const f = fixture()
  const changed = createProgressEvent({ ...f.rootQueued, receivedAt: timestamp(1) })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, changed] }, TASK), /reused with different content/)
})

attack('terminal state cannot move backward to running', () => {
  const f = fixture()
  const resurrected = event(f.root, 4, f.rootFailed, 'running', 'resumed', 3)
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, f.rootRunning, f.rootFailed, resurrected] }, TASK), /invalid progress transition/)
})

attack('passed requires verified evidence', () => {
  const f = fixture()
  assert.throws(() => event(f.root, 3, f.rootRunning, 'passed', 'completed', 2), /requires verified evidence/)
  assert.throws(() => event(f.root, 3, f.rootRunning, 'passed', 'completed', 2, evidence(f.root, 'quarantined')), /requires verified evidence/)
})

attack('evidence identity cannot be forged for another task, run, attempt, or binding', () => {
  const f = fixture()
  const forged = { ...evidence(f.retry), commandRunId: ROOT_RUN }
  const passed = event(f.retry, 3, f.retryRunning, 'passed', 'completed', 6, forged)
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, f.retry], events: [f.rootQueued, f.rootRunning, f.rootFailed, f.retryQueued, f.retryRunning, passed] }, TASK), /evidence identity/)
})

attack('evidence and event extra fields are rejected', () => {
  assert.throws(() => validateEvidenceRef({ ...evidence(rootBinding()), path: 'C:/secret' }), /fields are not exact/)
  assert.throws(() => validateProgressEvent({ ...fixture().rootQueued, message: 'raw log' }), /fields are not exact/)
})

attack('event hash tampering is rejected', () => {
  const value = { ...fixture().rootQueued, phaseId: 'B10' }
  assert.throws(() => validateProgressEvent(value), /hash mismatch/)
})

attack('reason codes and phase IDs are state-bound and closed', () => {
  const f = fixture()
  assert.throws(() => createProgressEvent({ ...f.rootQueued, reasonCode: 'completed' }), /does not match state/)
  assert.throws(() => createProgressEvent({ ...f.rootQueued, phaseId: 'P17-015' }), /phaseId is malformed/)
})

attack('non-terminal events cannot smuggle evidence', () => {
  const f = fixture()
  assert.throws(() => event(f.root, 2, f.rootQueued, 'running', 'started', 1, evidence(f.root)), /non-terminal/)
})

attack('event timestamps cannot move backward within a run', () => {
  const f = fixture()
  const backward = createProgressEvent({ ...f.rootRunning, occurredAt: timestamp(-1) })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [f.rootQueued, backward] }, TASK), /timestamps moved backward/)
})

attack('individual clock skew beyond seven days is rejected', () => {
  const f = fixture()
  const far = new Date(Date.parse(f.rootQueued.receivedAt) + 8 * 24 * 60 * 60 * 1000).toISOString()
  assert.throws(() => createProgressEvent({ ...f.rootQueued, receivedAt: far }), /clock skew/)
})

attack('ledger envelopes are closed and cannot mix task identities', () => {
  const f = fixture()
  assert.throws(() => buildProgressTaskView({ bindings: [f.root], events: [], extra: true } as never, TASK), /fields are not exact/)
  const otherTask = createProgressRunBinding({ ...f.root, taskId: 'P17-014' })
  assert.throws(() => buildProgressTaskView({ bindings: [f.root, otherTask], events: [] }), /mixes task identities/)
})

attack('malformed or unknown sentinel payloads fail closed', () => {
  assert.throws(() => parseProgressSentinelLine('no sentinel'), /missing/)
  assert.throws(() => parseProgressSentinelLine(`${CROSS_MACHINE_PROGRESS_SENTINEL}{`), /malformed/)
  assert.throws(() => parseProgressSentinelLine(`${CROSS_MACHINE_PROGRESS_SENTINEL}{"schemaVersion":1}`), /kind is unknown/)
})

console.log(`cross-machine-progress: ${assertions} assertions and ${attacks} attacks passed`)
