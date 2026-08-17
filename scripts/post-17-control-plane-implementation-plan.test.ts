import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = process.cwd()
const workspaceRoot = path.resolve(kitRoot, '..')
const dashboardRoot = path.join(workspaceRoot, 'kit-dashboard')
const planPath = path.join(kitRoot, 'docs', 'roadmap', 'p17-014-control-plane-implementation-plan.md')
const roadmapPath = path.join(kitRoot, 'docs', 'roadmap', 'post-17-roadmap.json')
const roadmapMdPath = path.join(kitRoot, 'docs', 'roadmap', 'post-17-roadmap.md')
const adrPath = path.join(kitRoot, 'docs', 'design', 'adr-003-distributed-control-plane-topology.md')
const dashboardTestPath = path.join(dashboardRoot, 'tests', 'post17-roadmap.test.ts')
const rbacTestPath = path.join(kitRoot, 'scripts', 'post-17-control-panel-rbac.test.ts')
const c5TestPath = path.join(kitRoot, 'scripts', 'post-17-privacy-wave-c5-live-cutover-plan.test.ts')
const packagePath = path.join(kitRoot, 'package.json')

const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const roadmapMd = fs.readFileSync(roadmapMdPath, 'utf8')
const adr = fs.readFileSync(adrPath, 'utf8')
const dashboardTest = fs.readFileSync(dashboardTestPath, 'utf8')
const rbacTest = fs.readFileSync(rbacTestPath, 'utf8')
const c5Test = fs.readFileSync(c5TestPath, 'utf8')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const commandName = 'test:post-17-control-plane-implementation-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-implementation-plan.test.ts'
const task = roadmap.tasks.find((candidate) => candidate.id === 'P17-014')

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('control-plane implementation plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${commandName}`)) {
  readinessGaps.push('workspace contract registration')
}
if (task?.status !== 'in_progress') readinessGaps.push('canonical P17-014 status transition')
if (!/\| P17-014 \| P2 \| 5 \| in_progress \|/.test(roadmapMd)) readinessGaps.push('human roadmap status transition')
if (!adr.includes('**Status:** Accepted — topology/trust locked; implementation planning started')) {
  readinessGaps.push('accepted ADR implementation status')
}
if (!dashboardTest.includes("P17-014')).toMatchObject({ status: 'in_progress'")) {
  readinessGaps.push('dashboard roadmap status expectation')
}
assert.deepEqual(readinessGaps, [], `P17-014 A1 readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Requirements and non-functional constraints',
  '## Locked implementation decisions',
  '### C1 — One shared control-plane core',
  '### O1 — Reuse provider-neutral operation runtimes',
  '### P1 — P17-015 remains the progress authority',
  '### V1 — Privacy gates persistence and remote execution',
  '### Q1 — Dependency-ordered implementation',
  '### D1 — Optional worker and provider distribution',
  '### E1 — Evidence cannot skip topology layers',
  '### X0 — A1 is plan and tracking only',
  '## Clean Architecture and source ownership',
  '## Implementation sequence',
  '### A1 — Plan, readiness, and truthful tracking',
  '### A2 — Pure shared-core contracts',
  '### A3 — Machine crypto and worker journal ports',
  '### A4 — Tenant-scoped persistence and repositories',
  '### A5 — Control Plane API and application services',
  '### A6 — Outbound worker and provider distribution',
  '### A7 — Network-separated E2E and completion audit',
  '## Dependency and input-readiness matrix',
  '## Attack and test strategy',
  '## Rollout, rollback, and growth thresholds',
  '## A1 implementation manifest',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A1 plan section ${heading}`)

for (const decision of [
  'topology=T1',
  'machine=M1',
  'execution=X1',
  'replay=R1',
  'e2e=E1',
  'scale=S1',
  'core=C1',
  'operations=O1',
  'progress=P1',
  'privacy=V1',
  'sequence=Q1',
  'distribution=D1',
  'evidence=E1',
  'planning=X0',
]) assert.ok(normalized.includes(decision), `missing P17-014 A1 decision ${decision}`)

for (const phrase of [
  'P17-014 moves from ready to in_progress',
  'P17-015 is done',
  'P17-016 remains in_progress',
  'P17-021 remains backlog',
  'packages/core has no package-local manifest',
  'build-provider-bundles.ts is the root distribution compiler',
  'p2-transport-manifest.ts is a local role/worktree transport, not the network wire format',
  'no Control Plane source, migration, or route exists in dashboard',
  'project_intelligence.inspect',
  'workflow_phase.execute',
  'workflow_verify.execute',
  'evidence.verify',
  'cross-machine-progress.ts remains the single progress domain source',
  'no production persistence or remote execution before the P17-016 tenant/privacy runtime gate',
  'no arbitrary shell, executable, argv, environment, path, URL, or credential crosses the boundary',
  'Codex, Claude, and Copilot',
  'network-separated nodes with no shared filesystem',
  'existing local workflows remain unchanged',
  'No dashboard production file changes in A1',
  'no runtime implementation',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `missing P17-014 A1 contract: ${phrase}`)

for (const attack of [
  'duplicate operation code',
  'unknown capability',
  'unknown envelope field',
  'arbitrary shell',
  'raw environment',
  'raw repository path',
  'credential alias supplied by the Control Plane',
  'forged tenant',
  'cross-tenant run reference',
  'same delivery with a different envelope',
  'two-worker claim race',
  'lease renewal past deadline',
  'unknown side-effect outcome',
  'journal crash before and after execution',
  'mixed contract version',
  'evidence body leakage',
  'disabled-mode network call',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `missing P17-014 A1 attack: ${attack}`)

assert.ok(task)
assert.deepEqual([task.status, task.readiness.complete, task.readiness.missing], ['in_progress', true, []])
assert.equal(roadmap.tasks.find((candidate) => candidate.id === 'P17-015')?.status, 'done')
assert.equal(roadmap.tasks.find((candidate) => candidate.id === 'P17-016')?.status, 'in_progress')
assert.equal(roadmap.tasks.find((candidate) => candidate.id === 'P17-021')?.status, 'backlog')

for (const source of [
  path.join(kitRoot, 'packages', 'core', 'src', 'project-intelligence.ts'),
  path.join(kitRoot, 'packages', 'core', 'src', 'workflow-orchestrator.ts'),
  path.join(kitRoot, 'packages', 'core', 'src', 'cross-machine-progress.ts'),
  path.join(kitRoot, 'scripts', 'build-provider-bundles.ts'),
  path.join(kitRoot, '.claude', 'integrations', 'p2-transport-manifest.ts'),
]) assert.ok(fs.existsSync(source), `missing P17-014 predecessor ${path.relative(kitRoot, source)}`)

assert.ok(!fs.existsSync(path.join(kitRoot, 'packages', 'core', 'package.json')), 'unexpected package-local core manifest')
assert.match(adr, /\*\*Status:\*\* Accepted — topology\/trust locked; implementation planning started/)
assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — A1 planning in progress; no runtime implementation/)

const c5Plan = fs.readFileSync(
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c5-live-cutover-plan.md'),
  'utf8',
)
assert.ok(c5Plan.includes('P17-014 is now `in_progress` under its implementation plan'))
assert.match(
  c5Test,
  /assert\.deepEqual\(\s*\[byId\.get\('P17-014'\)\?\.status, byId\.get\('P17-014'\)\?\.readiness\.complete\],\s*\['in_progress', true\]/,
)
assert.ok(rbacTest.includes("assert.equal(topology.status, 'in_progress')"))

const topologyTest = fs.readFileSync(
  path.join(kitRoot, 'scripts', 'post-17-control-plane-topology.test.ts'),
  'utf8',
)
assert.ok(topologyTest.includes("assert.equal(controlPlane.status, 'in_progress')"))

const affirmativeSurface = normalized
  .replace(/A1 does not claim[^.]*\./gi, '')
  .replace(/no runtime implementation/gi, '')
for (const forbidden of [
  /shared control-plane core (?:exists|is implemented)/i,
  /machine enrollment (?:exists|is implemented)/i,
  /Control Plane API (?:exists|is implemented)/i,
  /remote worker (?:exists|is implemented)/i,
  /P17-014 (?:is|was) complete/i,
  /P17-021 (?:is|was) ready/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `premature P17-014 A1 claim: ${forbidden}`)

console.log('P17-014 control-plane implementation plan: PASS (T1/M1/X1/R1/E1/S1 + C1/O1/P1/V1/Q1/D1/E1/X0 locked)')
