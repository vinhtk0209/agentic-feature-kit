import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-b4a-dashboard-central-adapters-plan.md')

assert.ok(fs.existsSync(planPath), 'missing P17-016 B4A dashboard adapters plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8'),
) as { tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }> }
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Decisions',
  '### P1 — Production progress fails closed before RPC',
  '### R1 — Release operators validate locally, then stop',
  '### D1 — Verified deploy survives; history becomes closed',
  '### K1 — Atomic canonical privacy-core distribution',
  '### U1 — One authoritative command UUID',
  '### L1 — Exact bounded unavailable-tenant receipts',
  '### C1 — Canary source retained but never executed',
  '### F1 — Zero raw fallback or hidden sink',
  '### E1 — Highest practical local evidence',
  '## Architecture decision record',
  '## Clean architecture boundaries',
  '## Runtime sequences',
  '## Implementation manifest',
  '## RED controls',
  '## Verification and attack matrix',
  '## Edge cases and failure handling',
  '## Evidence and completion',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing B4A plan section ${heading}`)

for (const phrase of [
  'progress=P1, release=R1, deploy=D1, core=K1, run=U1, receipt=L1, canary=C1, cutover=F1, evidence=E1',
  'four non-identity B4 writers',
  'binding.commandRunId',
  'event.commandRunId',
  'P17-015 canary-only module',
  'creates one UUID after confirmation and before its first fallible producer step',
  'stops before credential lookup or REST/readback',
  'deployment-history receipt alongside the existing deploy result',
  'blocked-central-writer.ts`, `privacy-policy.ts`, and `privacy-writer.ts',
  'renames the old directory to a backup',
  'Any injected failure restores the complete previous directory',
  'one command UUID per operator attempt',
  'no payload, count, raw identifier, endpoint, error, or secret',
  'eight B4B identity entries stay `deferred_identity`',
  'five positive-control credential detectors',
  'No RED control may import an operator `main`',
  'full dashboard Vitest',
  'full kit suite',
  'P17-016 remains `in_progress`',
  'Never use sync as rollback and do not push',
]) assert.ok(normalized.includes(phrase), `missing B4A contract phrase: ${phrase}`)

assert.match(plan, /\*\*Status:\*\* Authorized — inputs locked; implementation unproven/)
assert.match(plan, /\*\*Roadmap task:\*\* P17-016/)
assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) done/i)
assert.match(normalized, /does not claim B4A implemented/)
assert.match(normalized, /does not authorize a live canary, database operation, browser operation, provider execution, target edit, real sync, or push/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b4a-dashboard-adapters-plan'],
  'npx tsx scripts/post-17-privacy-b4a-dashboard-adapters-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-b4a-dashboard-adapters-plan'))

console.log('post-17-privacy-b4a-dashboard-adapters-plan.test: PASS (P1/R1/D1/K1/U1/L1/C1/F1/E1 locked)')
