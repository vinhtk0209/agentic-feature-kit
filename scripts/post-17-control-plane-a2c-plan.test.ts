import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2c-state-lease-replay-plan.md')
const packagePath = path.join(root, 'package.json')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const a2bPlanPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2b-execution-envelope-plan.md')
const a2bEvidencePath = path.join(root, 'docs', 'evidence', 'post-17-control-plane-a2b-execution-envelope-2026-08-16.md')
const corePath = path.join(root, 'packages', 'core', 'src', 'control-plane.ts')
const commandName = 'test:post-17-control-plane-a2c-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a2c-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const task = roadmap.tasks.find((entry) => entry.id === 'P17-014')

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A2C state/lease/replay plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A2C readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Locked A2C decisions',
  '### S1 — Definition and attempt state are discriminated',
  '### V1 — Every mutation is expected-version checked',
  '### L1 — One bounded active A2B lease',
  '### C1 — Cancellation is intent-first and cooperative',
  '### R1 — Receipts are unsigned metadata-only content',
  '### U1 — Recovery is conservative and explicit',
  '### I1 — Replay is idempotent or quarantined',
  '### Q1 — A2C does not absorb successor ownership',
  '### E1 — Evidence is cumulative and immutable',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## State and race table',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A2C source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A2C plan section ${heading}`)

for (const decision of [
  'slice=A2C',
  'state=S1',
  'version=V1',
  'lease=L1',
  'cancel=C1',
  'receipt=R1',
  'recovery=U1',
  'replay=I1',
  'sequence=Q1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A2C decision ${decision}`)

for (const contract of [
  'separate pure control-plane-state domain module',
  'definition awaiting_approval and runtime awaiting_approval are structurally distinct',
  'draft → awaiting_approval → approved → queued',
  'queued → leased → running',
  'expectedResourceVersion',
  'resourceVersion increments by exactly one',
  'one active lease per task attempt',
  'A2B execution envelope',
  '15-second heartbeat interval',
  'never past deadlineAt',
  'worker disconnect is not cancellation',
  'cancel_requested',
  'completion committed before cancellation returns conflict',
  'cancellation committed before success quarantines the success receipt',
  'metadata-only receipt',
  'progressTailHash',
  'evidenceHashes',
  'receiptHash',
  'replaying the same receipt is idempotent',
  'conflicting receipt produces zero state mutation',
  'recovery_required',
  'no execution-start evidence may reclaim the same attempt',
  'unknown side effect is never auto-dispatched',
  'A2D owns complete P17-015 binding and retry-lineage proof',
  'A3 owns signatures, keys, and the durable worker journal',
  'No dashboard source change',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A2C contract: ${contract}`)

for (const attack of [
  'unknown state field',
  'prototype-bearing state',
  'accessor-bearing state',
  'stale expected version',
  'resource version overflow',
  'illegal rollback',
  'definition/runtime approval confusion',
  'two-worker claim',
  'envelope identity mismatch',
  'capability mismatch',
  'claim outside lease window',
  'heartbeat rollback',
  'heartbeat after expiry',
  'renewal past deadline',
  'cancel idempotency conflict',
  'completion-before-cancel race',
  'cancel-before-success race',
  'worker disconnect',
  'same receipt replay',
  'conflicting receipt replay',
  'late receipt',
  'receipt identity mismatch',
  'receipt hash tampering',
  'unknown side effect',
  'recovery without authority',
  'raw output',
  'credential material',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A2C attack: ${attack}`)

assert.deepEqual([task?.status, task?.readiness.complete, task?.readiness.missing], ['in_progress', true, []])
assert.ok(fs.existsSync(a2bPlanPath), 'A2B plan predecessor is missing')
assert.ok(fs.existsSync(a2bEvidencePath), 'A2B evidence predecessor is missing')
assert.ok(fs.readFileSync(a2bEvidencePath, 'utf8').includes('3e1d016914f3ad8896b6d97e255b863f14473ce4'))
assert.ok(fs.readFileSync(corePath, 'utf8').includes('serializeControlPlaneExecutionEnvelope'))
assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — A2C plan-first; no state implementation/)
const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /A2C (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /receipt (?:is|was) signed/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A2C state/lease/replay plan: PASS (S1/V1/L1/C1/R1/U1/I1/Q1/E1 locked)')
