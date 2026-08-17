import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a2a-registry-capability-plan.md')
const packagePath = path.join(root, 'package.json')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const implementationPlanPath = path.join(root, 'docs', 'roadmap', 'p17-014-control-plane-implementation-plan.md')
const commandName = 'test:post-17-control-plane-a2a-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a2a-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const implementationPlan = fs.readFileSync(implementationPlanPath, 'utf8')
const normalizedImplementationPlan = implementationPlan.replace(/\s+/g, ' ')
const task = roadmap.tasks.find((entry) => entry.id === 'P17-014')

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A2A registry/capability plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A2A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Locked A2A decisions',
  '### R1 — Exact four-operation registry',
  '### C1 — Explicit worker capability manifest',
  '### I1 — Opaque bounded operation inputs',
  '### B1 — Hard resource budgets',
  '### H1 — Injected deterministic hashing',
  '### A1 — Registration is not runtime availability',
  '### Q1 — A2 sub-slice sequence',
  '### E1 — Evidence and mutation discipline',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A2A source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A2A plan section ${heading}`)

for (const decision of [
  'slice=A2A',
  'registry=R1',
  'capability=C1',
  'input=I1',
  'budget=B1',
  'hashing=H1',
  'availability=A1',
  'sequence=Q1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A2A decision ${decision}`)

for (const operation of [
  'project_intelligence.inspect',
  'workflow_phase.execute',
  'workflow_verify.execute',
  'evidence.verify',
]) assert.ok(plan.includes(`\`${operation}\``), `missing A2A operation ${operation}`)

for (const contract of [
  'exactly four closed operation descriptors',
  'registry presence alone does not prove an adapter is installed',
  'ControlPlaneHashPort',
  'no Node, filesystem, process, environment, network, provider, dashboard, or platform import',
  'lowercase SHA-256',
  'repositoryId is an opaque UUID',
  'no alias, path, URL, header, secret, credential, shell, executable, argv, environment, or free text',
  'worker manifest is a strict subset of the registry',
  'operation code and contract hash pair',
  'capability IDs are closed and sorted',
  'A2A registry and capability manifest',
  'A2B execution envelope and identity',
  'A2C task, lease, cancellation, receipt, and recovery state',
  'A2D P17-015 binding plus complete A2 audit',
  'No dashboard source change',
  'no runtime implementation',
]) assert.ok(normalized.toLowerCase().includes(contract.toLowerCase()), `missing P17-014 A2A contract: ${contract}`)

for (const attack of [
  'duplicate operation code',
  'unknown operation',
  'duplicate capability',
  'unknown capability',
  'missing required capability',
  'contract hash tampering',
  'manifest hash tampering',
  'non-canonical order',
  'unknown top-level field',
  'unknown nested field',
  'prototype-bearing object',
  'malformed UUID',
  'oversized content reference',
  'mismatched content purpose',
  'raw path',
  'credential alias',
  'hash-port failure',
  'malformed hash-port output',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `missing P17-014 A2A attack: ${attack}`)

assert.deepEqual([task?.status, task?.readiness.complete, task?.readiness.missing], ['in_progress', true, []])
assert.ok(implementationPlan.includes('### A2 — Pure shared-core contracts'))
assert.ok(normalizedImplementationPlan.includes('No dashboard production file changes in A1'))
assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — A2A plan-first; no runtime implementation/)
const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /P17-014 (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /worker (?:is|was) installed/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A2A registry/capability plan: PASS (R1/C1/I1/B1/H1/A1/Q1/E1 locked)')
