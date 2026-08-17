import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-b4b-identity-control-hardening-plan.md')

assert.ok(fs.existsSync(planPath), 'missing P17-016 B4B identity-control plan')

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
  '### I1 — Separate typed private-admin plane',
  '### V1 — Exact bounded inputs before secret generation or I/O',
  '### A1 — Authorization remains authoritative and precedes parsing',
  '### M1 — Prove mutation outcome and preserve atomic boundaries',
  '### S1 — Closed errors, bounded logging, and one-time secrets',
  '### U1 — Explicit client failure states',
  '### R1 — Regeneration fails closed until Wave C',
  '### G1 — Registry and source discovery stay truthful',
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
]) assert.ok(plan.includes(heading), `missing B4B plan section ${heading}`)

for (const phrase of [
  'identity=I1, validation=V1, authorization=A1, mutation=M1, secrecy=S1, ui=U1, regeneration=R1, registry=G1, evidence=E1',
  'seven essential private-admin operations',
  'Non-atomic token regeneration becomes an honest closed operation',
  'temporarily permits raw owner name, owner email, role email, and bypass label storage',
  'does not make those tables tenant safe',
  'fit within 4,096 UTF-8 bytes',
  'Authorization executes before body parsing',
  'A successful direct mutation is never inferred merely from an absent error',
  'existing `grant_role`/`revoke_role` RPCs',
  'B4B does not claim an affected-row count for roles',
  'Raw exception/provider/database text is never returned',
  'avoid `router.refresh()` on failure',
  'returns HTTP 409 with `operation_blocked`',
  'contains no legacy fetch/revoke/insert sequence',
  'exactly seven hardened plus one blocked identity entry',
  'five credential detectors',
  'No RED test may import or invoke production side effects',
  'full dashboard Vitest',
  'full kit suite',
  'P17-016 remains `in_progress`',
  'Do not use sync as rollback and do not push',
]) assert.ok(normalized.includes(phrase), `missing B4B contract phrase: ${phrase}`)

assert.match(plan, /\*\*Status:\*\* Authorized — inputs locked; implementation unproven/)
assert.match(plan, /\*\*Roadmap task:\*\* P17-016/)
assert.doesNotMatch(normalized, /identity data (is|are) tenant safe/i)
assert.doesNotMatch(normalized, /token rotation (is|was) atomic/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) done/i)
assert.match(normalized, /does not claim B4B implemented/)
assert.match(normalized, /does not authorize a live canary, database\/migration operation, browser operation, provider execution, target edit, real sync, push, merge, deployment, or publication/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b4b-identity-control-plan'],
  'npx tsx scripts/post-17-privacy-b4b-identity-control-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-b4b-identity-control-plan'))

console.log('post-17-privacy-b4b-identity-control-plan.test: PASS (I1/V1/A1/M1/S1/U1/R1/G1/E1 locked)')
