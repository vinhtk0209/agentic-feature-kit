import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const plan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-016-privacy-implementation-plan.md'), 'utf8')
const normalizedPlan = plan.replace(/\s+/g, ' ')
const adr = fs.readFileSync(path.join(root, 'docs', 'design', 'adr-002-privacy-tenant-retention-boundary.md'), 'utf8')
const roadmap = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8')) as {
  tasks: Array<Record<string, any>>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Locked inputs',
  '## Non-goals',
  '## Architecture boundary',
  '## Shared-core contract',
  '### Versioned vocabulary',
  '### Trusted tenant context',
  '### Consent decision',
  '### Retention decision',
  '### Central record construction',
  '### Port interfaces',
  '### Deletion contract',
  '### Legacy contract',
  '## Delivery waves',
  '### Wave A — Pure policy contracts and attack harness',
  '### Wave B — Writer cutover before migration',
  '### Wave C — Tenant repositories and additive legacy migration',
  '### Wave D — Retention, purge, and tenant deletion',
  '### Wave E — Tenant-safe reads, actions, and dashboard',
  '### Wave F — Legacy completion and task closeout',
  '## Wave A attack matrix',
  '## Verification ladder',
  '## Status and evidence rules',
  '## Rollback',
  '## Example outcomes',
]) assert.ok(plan.includes(heading), `missing privacy implementation section ${heading}`)

assert.match(adr, /\*\*Status:\*\* Accepted — policy input locked; implementation in progress \(Wave A\)/)
assert.ok(adr.includes('Accepted choice set: `T1/R1/C1/L1/E1`'))
assert.ok(normalizedPlan.includes('ADR-002 `T1/R1/C1/L1/E1`'))

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress', 'P17-016 must remain in progress until all six waves pass')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])
assert.deepEqual(task.dependencies, ['P17-000'])
assert.deepEqual(task.acceptanceCriteria, [
  'only allowlisted fields persist',
  'tenant identity is enforced',
  'deletion/retention is testable',
])

for (const phrase of [
  '`central_content=0d`',
  '`short_lived=24h`',
  '`standard=30d`',
  '`learning_aggregate=180d`',
  '`audit_release=365d`',
  '`essential_operations`',
  '`learning_metrics`',
  '`content_indexing`',
  '`cross_provider_evaluation`',
  '`diagnostic_content`',
  '`D0_public_contract`',
  '`D4_secret`',
  '`command_run`',
  '`release_dossier`',
  '`OpaqueIdentifierPort`',
  '`ClockPort`',
  '`TenantContextProvider`',
  'constructs a new exact-field record',
  'producer-supplied tenant ID',
  'Raw SHA-256 surrogate',
]) assert.ok(normalizedPlan.includes(phrase), `missing privacy implementation contract: ${phrase}`)

assert.match(normalizedPlan, /Pure shared-core code must not import React, Next\.js, Supabase, provider SDKs/)
assert.match(normalizedPlan, /Move P17-016 from `ready` to `in_progress` only when this plan is locked and Wave A production code begins\./)
assert.match(normalizedPlan, /Do not mark P17-016 `done` at a Wave A checkpoint\./)
assert.match(normalizedPlan, /(?:do|must) not touch migrations, live data, dashboard writers\/UI, provider runs, sync, or push/i)
assert.match(normalizedPlan, /Database\/live\/provider\/remote tests remain explicitly authorized tiers/)
assert.doesNotMatch(plan, /implementation (is|was) complete/i)

assert.equal(packageJson.scripts['test:post-17-privacy-implementation-plan'], 'npx tsx scripts/post-17-privacy-implementation-plan.test.ts')
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-implementation-plan'))

console.log('post-17-privacy-implementation-plan.test: PASS (25 sections, six waves, Wave A fail-closed boundary)')
