import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2d-progress-binding-plan.md')
const packagePath = path.join(root, 'package.json')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const a2cPlanPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2c-state-lease-replay-plan.md')
const a2cEvidencePath = path.join(root, 'docs', 'evidence', 'post-17-control-plane-a2c-state-lease-replay-2026-08-16.md')
const progressPath = path.join(root, 'packages', 'core', 'src', 'cross-machine-progress.ts')
const commandName = 'test:post-17-control-plane-a2d-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a2d-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const task = roadmap.tasks.find((entry) => entry.id === 'P17-014')

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A2D progress-binding plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A2D readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Locked A2D decisions',
  '### P1 — Real P17-015 validation stays behind a pure port',
  '### R1 — Repository UUID and progress slug require an explicit mapping',
  '### B1 — Binding proof matches every shared immutable field',
  '### S1 — State projection composes; it does not copy P17-015',
  '### C1 — Receipt proof closes tail and evidence references',
  '### L1 — Retry proof adds exactly one linear successor',
  '### H1 — Every proof is content-addressed',
  '### Q1 — A2D closes A2 without absorbing A3+',
  '### E1 — Evidence composes the real predecessor',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Projection and retry tables',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A2D source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A2D plan section ${heading}`)

for (const decision of [
  'slice=A2D',
  'progress=P1',
  'repository=R1',
  'binding=B1',
  'projection=S1',
  'receipt=C1',
  'retry=L1',
  'hashing=H1',
  'sequence=Q1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A2D decision ${decision}`)

for (const contract of [
  'type-only ControlPlaneProgressLedgerPort',
  'real buildProgressTaskView',
  'no emitted cross-machine-progress import',
  'tenant-bound content-addressed repository mapping',
  'repositoryId',
  'progressRepoId',
  'repositoryBindingHash',
  'taskId',
  'commandRunId',
  'rootRunId',
  'parentRunId',
  'attempt',
  'machineId',
  'progressBindingHash',
  'retentionClass',
  'createdAt <= issuedAt',
  'current linear attempt',
  'runner and providerExecutionId remain committed by the P17-015 binding hash',
  'definition states have no progress projection',
  'cancel_requested does not invent a P17-015 state',
  'progressTailHash',
  'evidenceHashes equal the terminal P17-015 evidence set',
  'unknown_outcome maps only to tracking_failed',
  'retry_new_attempt',
  'entire prior ledger prefix is unchanged',
  'exactly one successor binding and queued retry_started event',
  'new command run, delivery, and lease',
  'A3 owns signatures, keys, and durable journal behavior',
  'A4 proves tenant row ownership',
  'No dashboard source change',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A2D contract: ${contract}`)

for (const attack of [
  'ledger-port exception',
  'malformed ledger-port view',
  'forged task identity',
  'forged tenant mapping',
  'repository UUID mismatch',
  'progress slug mismatch',
  'repository mapping hash tampering',
  'binding hash mismatch',
  'machine mismatch',
  'run mismatch',
  'root or parent mismatch',
  'attempt mismatch',
  'retention mismatch',
  'binding created after envelope',
  'non-current attempt',
  'state projection mismatch',
  'missing event tail',
  'receipt tail mismatch',
  'receipt evidence mismatch',
  'unverified passed evidence',
  'terminal outcome mismatch',
  'unknown outcome drift',
  'retry without A2C recovery decision',
  'non-terminal retry parent',
  'changed prior ledger prefix',
  'sibling retry',
  'retry ordinal gap',
  'changed retry root or parent',
  'reused command run',
  'reused delivery or lease',
  'successor state or reason drift',
  'proof hash tampering',
  'hash-port failure',
  'raw evidence body',
  'credential material',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A2D attack: ${attack}`)

assert.deepEqual([task?.status, task?.readiness.complete, task?.readiness.missing], ['in_progress', true, []])
assert.ok(fs.existsSync(a2cPlanPath), 'A2C plan predecessor is missing')
assert.ok(fs.existsSync(a2cEvidencePath), 'A2C evidence predecessor is missing')
assert.ok(fs.readFileSync(a2cEvidencePath, 'utf8').includes('3b5ed4369e0c512802c2489f53d182caee52bbdf'))
assert.ok(fs.readFileSync(progressPath, 'utf8').includes('export function buildProgressTaskView'))
assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — A2D plan-first; no progress-proof implementation/)
const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /A2D (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /tenant row ownership (?:is|was) proven/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A2D progress-binding plan: PASS (P1/R1/B1/S1/C1/L1/H1/Q1/E1 locked)')
