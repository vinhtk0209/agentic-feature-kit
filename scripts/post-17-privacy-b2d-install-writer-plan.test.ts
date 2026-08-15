import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-b2d-install-writer-adapter-plan.md')

assert.ok(fs.existsSync(planPath), 'missing P17-016 B2D install writer plan')

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
  '### I1 — Final adapter-planned writer only',
  '### C1 — Reuse the canonical compatibility core',
  '### R1 — One sync-command UUID',
  '### B1 — One closed receipt per command batch',
  '### T1 — Tenant context remains unavailable',
  '### L1 — Exact non-durable receipt',
  '### S1 — No installs endpoint or fallback',
  '### D1 — Honest dry-run behavior',
  '### F1 — Preserve sync and rollback semantics',
  '### E1 — Highest practical local evidence',
  '## Clean architecture boundaries',
  '## Runtime sequence',
  '## Implementation manifest',
  '## RED controls',
  '## Verification and attack matrix',
  '## Edge cases and failure handling',
  '## Evidence and completion',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing B2D plan section ${heading}`)

for (const phrase of [
  'writer=I1, core=C1, command=R1, batch=B1, context=T1, receipt=L1, sink=S1, dry=D1, compatibility=F1, evidence=E1',
  '`kit.sync.install-report`, the final `adapter_planned` kit writer',
  'one UUID after rollback-mode classification and before sync admission',
  'exactly one receipt, regardless of target count',
  'An empty batch emits no receipt',
  '`KIT_RUN_ID`',
  'accepts exactly `runId` and `createdAt`',
  'no `/rest/v1/installs` request',
  'Dry-run remains non-writing and does not emit a blocked receipt',
  'Dirty-tree admission, verified-run admission',
  'malicious element getters are not touched in non-dry mode',
  'five positive-control credential detectors',
  'full kit suite',
  'No RED control may call `main`, invoke npm sync, reach Supabase, or touch a target',
  'P17-016 remains `in_progress`',
  'Never use sync as rollback and do not push',
]) assert.ok(normalized.includes(phrase), `missing B2D contract phrase: ${phrase}`)

assert.match(plan, /\*\*Status:\*\* Authorized — inputs locked; implementation unproven/)
assert.match(plan, /\*\*Roadmap task:\*\* P17-016/)
assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) done/i)
assert.match(normalized, /does not claim B2D implemented/)
assert.match(normalized, /does not authorize a database migration, browser operation, dashboard change, target edit, real sync, or push/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b2d-install-writer-plan'],
  'npx tsx scripts/post-17-privacy-b2d-install-writer-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-b2d-install-writer-plan'))

console.log('post-17-privacy-b2d-install-writer-plan.test: PASS (I1/C1/R1/B1/T1/L1/S1/D1/F1/E1 locked)')
