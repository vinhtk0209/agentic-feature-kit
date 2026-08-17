import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a3c-worker-journal-plan.md')
const packagePath = path.join(root, 'package.json')
const parentPath = path.join(root, 'docs', 'roadmap', 'p17-014-control-plane-implementation-plan.md')
const a3bEvidencePath = path.join(
  root,
  'docs',
  'evidence',
  'post-17-control-plane-a3b-worker-request-auth-2026-08-17.md',
)
const commandName = 'test:post-17-control-plane-a3c-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a3c-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A3C transactional worker-journal plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A3C readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '# P17-014 A3C — Transactional Worker Journal and Crash Recovery Plan',
  '## Reconciled starting state',
  '## Locked A3C decisions',
  '### J1 — One exact signed-delivery journal',
  '### B1 — The journal key binds tenant, machine, and delivery',
  '### S1 — Journal states reuse the A2C recovery vocabulary',
  '### T1 — Every transition is a monotonic compare-and-set',
  '### F1 — The disposable Node adapter uses exclusive append-only commits',
  '### C1 — Crash ordering prevents unjournaled execution',
  '### R1 — Redelivery replays receipts and rejects changed delivery',
  '### Q1 — Recovery never guesses an unknown side effect',
  '### E1 — Evidence covers every crash and corruption boundary',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A3C source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A3C plan section ${heading}`)

for (const decision of [
  'slice=A3C',
  'journal=J1',
  'binding=B1',
  'state=S1',
  'transaction=T1',
  'storage=F1',
  'crash=C1',
  'replay=R1',
  'recovery=Q1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A3C decision ${decision}`)

for (const contract of [
  'journal key is exactly tenant ID, machine ID, and delivery ID',
  'operation cannot start before a prepared journal entry commits',
  'not_started, execution_started, receipt_available, or unknown',
  'journal revision is a positive monotonic safe integer',
  'compare-and-set accepts at most one writer for an expected revision',
  'same delivery ID with a different envelope or signature is rejected',
  'receipt is durably recorded before it is returned for acknowledgement',
  'acknowledgement never deletes the replayable receipt',
  'a trusted Control Plane verifier validates the signed envelope',
  'a trusted worker verifier validates the signed receipt',
  'ControlPlaneHashPort',
  'validateControlPlaneEnvelopeSignature',
  'validateControlPlaneReceiptSignature',
  'decideControlPlaneLeaseRecovery',
  'no production default journal directory',
  'committed segments are published exclusively after file flush and close',
  'temporary segments are never selected as committed state',
  'corrupt committed history fails closed',
  'A4 owns durable central persistence',
  'A6 owns worker process and executor wiring',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A3C contract: ${contract}`)

for (const attack of [
  'crash before journal prepare',
  'crash after prepare before execution',
  'crash after execution starts before receipt',
  'crash after receipt before acknowledgement',
  'same delivery with changed envelope',
  'same envelope with changed signature',
  'receipt identity mismatch',
  'receipt signature mismatch',
  'late receipt',
  'unknown side effect',
  'concurrent redelivery',
  'stale revision',
  'corrupt committed segment',
  'torn temporary segment',
  'write failure',
  'flush failure',
  'close failure',
  'publish failure',
  'storage exhaustion',
  'offline restart',
  'extra field',
  'prototype',
  'accessor',
  'cycle',
  'hidden property',
  'symbol property',
  'oversized snapshot',
  'symlink or reparse-point journal path',
  'port error echo',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A3C attack: ${attack}`)

for (const source of [
  'docs/roadmap/p17-014-a3c-worker-journal-plan.md',
  'scripts/post-17-control-plane-a3c-plan.test.ts',
  'docs/roadmap/p17-014-control-plane-implementation-plan.md',
  'scripts/post-17-control-plane-implementation-plan.test.ts',
  'packages/core/src/control-plane-worker-journal.ts',
  'packages/core/src/control-plane-worker-journal-node.ts',
  'packages/core/test/control-plane-worker-journal.test.ts',
  'packages/core/test/control-plane-worker-journal-node.test.ts',
  'packages/core/README.md',
  'package.json',
]) assert.ok(plan.includes(source), `missing A3C source manifest entry ${source}`)

assert.ok(fs.readFileSync(parentPath, 'utf8').includes('### A3 — Machine crypto and worker journal ports'))
assert.ok(fs.existsSync(a3bEvidencePath), 'A3B evidence predecessor is missing')
assert.ok(fs.readFileSync(a3bEvidencePath, 'utf8').includes('a836decd6b49da4f0977dba18932ebeea6c94303'))

const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /P17-014 (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /production worker journal (?:is|was) enabled/i)
assert.doesNotMatch(affirmativePlan, /worker process (?:is|was) enabled/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A3C plan: PASS (J1/B1/S1/T1/F1/C1/R1/Q1/E1 locked)')
