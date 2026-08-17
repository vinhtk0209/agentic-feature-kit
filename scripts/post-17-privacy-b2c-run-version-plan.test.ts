import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-b2c-run-version-adapter-plan.md')

assert.ok(fs.existsSync(planPath), 'missing P17-016 B2C run-version adapter plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8'),
) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Decisions',
  '### U1 — One writer only',
  '### C1 — Shared pure compatibility core',
  '### X1 — Legacy RPC remains auth-only',
  '### M1 — Existing kit-event marker is conserved',
  '### A1 — Current tenant context is unavailable',
  '### R1 — One verify-command UUID',
  '### L1 — Exact closed in-process receipt',
  '### S1 — No central sink or fallback',
  '### D1 — Public truth documentation',
  '### E1 — Evidence ladder',
  '## Clean architecture boundaries',
  '## Runtime sequence',
  '## Implementation manifest',
  '## RED controls',
  '## Verification and attack matrix',
  '## Failure handling',
  '## Evidence and completion',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing B2C plan section ${heading}`)

assert.match(plan, /\*\*Status:\*\* Approved — implementation authorized; completion unproven/)
assert.match(plan, /\*\*Roadmap task:\*\* P17-016/)

for (const phrase of [
  'writer=U1, core=C1, auth=X1, marker=M1, context=A1, run=R1, receipt=L1, sink=S1, docs=D1, evidence=E1',
  'every required permission except push',
  '`kit.telemetry.central-upsert`',
  '`kit.sync.install-report` stays `adapter_planned`',
  'generic raw telemetry insert and token RPC entries stay `migration_blocked`',
  'compatibility-preserving thin wrapper',
  '`verify_kit_token` behavior is not redesigned',
  'never treated as tenant context',
  'existing `@@KIT_EVENT@@` meta event',
  'separate `@@PRIVACY_RECEIPT@@` line',
  'The `verify` CLI case creates one UUID at its command boundary',
  '`KIT_RUN_ID`, `KIT_EVENT_NONCE`',
  'contains exactly `schemaVersion`, `policyVersion`, `writerId`, `runId`',
  'zero requests to `/rest/v1/repo_runs`',
  'Central sink capability remains blocked until Wave C',
  'No dashboard code or browser proof is required',
  'shared-core and run-version adapter tests fail because their modules do not exist',
  'valid mocked verify observes the existing `repo_runs` REST request',
  'five positive-control credential detectors',
  'full `npm run test:kit`',
  'Do not use sync as rollback and do not push',
]) assert.ok(normalized.includes(phrase), `missing B2C contract phrase: ${phrase}`)

assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) done/i)
assert.match(normalized, /This plan does not claim B2C implemented/)
assert.match(normalized, /does not authorize a central sink, migration, dashboard change, target edit, sync, or push/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b2c-run-version-plan'],
  'npx tsx scripts/post-17-privacy-b2c-run-version-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-b2c-run-version-plan'))

console.log('post-17-privacy-b2c-run-version-plan.test: PASS (U1/C1/X1/M1/A1/R1/L1/S1/D1/E1 locked)')
