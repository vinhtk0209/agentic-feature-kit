import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const plan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-016-central-writer-cutover-plan.md'), 'utf8')
const normalized = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

for (const heading of [
  '## Outcome',
  '## Locked inputs',
  '## B1 change boundary',
  '## Reconciled contract refinements',
  '### Command vocabulary',
  '### Honest unavailable pricing',
  '### Install/run observations',
  '### Error subject identity',
  '### Provider execution identity',
  '## Architecture and dependency rule',
  '## Writer port contract',
  '## Closed receipts',
  '## Registry contract',
  '## Exact file manifest',
  '## Implementation order',
  '## Attack matrix',
  '## Verification ladder',
  '## Rollback',
  '## B1 exit and non-claims',
  '## Next slices',
  '## Example outcomes',
]) assert.ok(plan.includes(heading), `missing B1 plan section ${heading}`)

for (const phrase of [
  'APPROVE P17-016 WAVE B1 v2',
  'ADR-002 `T1/R1/C1/L1/E1`',
  '`prompt` and `execute_roadmap_phase`',
  '`pricingStatus=unavailable`',
  '`costMicros` and `pricingVersion` are `null`',
  '`eventCode=installed|ran`',
  'at least one must be a UUID',
  'capability-gated sink port',
  'construct-only result is never labelled persisted',
  'separate machine-readable kit and dashboard writer registries',
  'independent source-coverage tests',
  'Full `npm run test:kit`',
  'full dashboard `npm test`',
  'positive control',
  'restore the affected repository from today\'s snapshot',
]) assert.ok(normalized.includes(phrase), `missing B1 contract phrase: ${phrase}`)

assert.match(normalized, /does not change a production writer, call a database, apply a migration, use a provider, use a browser, sync to a target, or push a branch/)
assert.match(normalized, /P17-016 remains `in_progress`; Wave B is not complete, no writer is claimed converted/)
assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /production writers? (is|are|was|were) converted/i)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(packageJson.scripts['test:post-17-privacy-writer-plan'], 'npx tsx scripts/post-17-privacy-writer-plan.test.ts')
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-writer-plan'))

console.log('post-17-privacy-writer-plan.test: PASS (21 sections, five refinements, no-I/O B1 boundary)')
