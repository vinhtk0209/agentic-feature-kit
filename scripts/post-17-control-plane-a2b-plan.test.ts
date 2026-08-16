import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2b-execution-envelope-plan.md')
const packagePath = path.join(root, 'package.json')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const a2aPlanPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2a-registry-capability-plan.md')
const a2aEvidencePath = path.join(root, 'docs', 'evidence', 'post-17-control-plane-a2a-registry-capability-2026-08-16.md')
const corePath = path.join(root, 'packages', 'core', 'src', 'control-plane.ts')
const commandName = 'test:post-17-control-plane-a2b-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a2b-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const task = roadmap.tasks.find((entry) => entry.id === 'P17-014')

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A2B execution-envelope plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A2B readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Locked A2B decisions',
  '### E1 — One unsigned content-addressed envelope',
  '### I1 — Tenant and P17-015-compatible identity reference',
  '### O1 — Exact A2A operation binding',
  '### T1 — Canonical bounded timing',
  '### D1 — Metadata-only evidence destination policy',
  '### H1 — Canonical envelope hashing',
  '### B1 — Deferred P17-015 binding proof',
  '### Q1 — Ordered ownership and successors',
  '### V1 — Evidence and mutation discipline',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A2B source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A2B plan section ${heading}`)

for (const decision of [
  'slice=A2B',
  'envelope=E1',
  'identity=I1',
  'operation=O1',
  'timing=T1',
  'evidence=D1',
  'hashing=H1',
  'binding=B1',
  'sequence=Q1',
  'verification=V1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A2B decision ${decision}`)

for (const contract of [
  'exactly one unsigned content-addressed execution envelope',
  'canonical A2A descriptor and validated operation input',
  'tenantId',
  'taskId',
  'commandRunId',
  'rootRunId',
  'parentRunId',
  'attempt',
  'deliveryId',
  'leaseId',
  'machineId',
  'repositoryId',
  'progressBindingHash',
  'canonical lowercase UUID',
  'P17-000 through P17-999',
  'repository identity must equal the operation input repository identity',
  'issuedAt < leaseExpiresAt <= deadlineAt',
  '60 seconds',
  '30 minutes',
  '256 KiB',
  'metadata_only',
  'p17_015_progress',
  'short_lived',
  'standard',
  'ControlPlaneHashPort',
  'serializeControlPlaneExecutionEnvelope',
  'A3 must use these exact bytes as its signing payload',
  'A2D must validate the complete P17-015 ProgressRunBinding',
  'no signature or key field',
  'No dashboard source change',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A2B contract: ${contract}`)

for (const attack of [
  'unknown envelope field',
  'extra nested field',
  'prototype-bearing object',
  'accessor-bearing object',
  'malformed tenant',
  'uppercase UUID',
  'invalid task ID',
  'invalid attempt lineage',
  'repository mismatch',
  'operation descriptor drift',
  'operation input drift',
  'capability reordering',
  'invalid timestamp',
  'lease past deadline',
  'lease interval overflow',
  'deadline overflow',
  'evidence policy drift',
  'envelope hash tampering',
  'hash-port failure',
  'raw path',
  'credential alias',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A2B attack: ${attack}`)

assert.deepEqual([task?.status, task?.readiness.complete, task?.readiness.missing], ['in_progress', true, []])
assert.ok(fs.existsSync(a2aPlanPath), 'A2A plan predecessor is missing')
assert.ok(fs.existsSync(a2aEvidencePath), 'A2A evidence predecessor is missing')
assert.ok(fs.readFileSync(a2aEvidencePath, 'utf8').includes('4764c2666547fec10942c857c7fed422c9e38434'))
assert.ok(fs.readFileSync(corePath, 'utf8').includes('createControlPlaneOperationRegistry'))
assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — A2B plan-first; no envelope implementation/)
const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /A2B (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /envelope (?:is|was) signed/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A2B execution-envelope plan: PASS (E1/I1/O1/T1/D1/H1/B1/Q1/V1 locked)')
