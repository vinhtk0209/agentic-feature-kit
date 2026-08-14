import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const adrPath = path.join(root, 'docs', 'design', 'adr-003-distributed-control-plane-topology.md')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const adr = fs.readFileSync(adrPath, 'utf8')
const normalized = adr.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }

for (const heading of [
  '## Outcome',
  '## Requirements',
  '## Constraints and existing contracts',
  '## Recommended decisions',
  '## Acceptance record',
  '## High-level topology',
  '## Clean Architecture boundary',
  '## Machine identity and enrollment M1',
  '## Typed execution envelope X1',
  '## Task, lease, and replay model R1',
  '## State and cancellation semantics',
  '## Storage model',
  '## API and event boundary',
  '## Offline-safe and deployment boundary',
  '## Reliability, scale, and observability',
  '## Security and privacy attacks',
  '## E2E topology E1',
  '## Options considered',
  '## Trade-offs and consequences',
  '## Verification and evidence ladder',
  '## Rollout and rollback',
  '## Operator decision required',
]) assert.ok(adr.includes(heading), `missing topology section ${heading}`)

assert.match(adr, /\*\*Status:\*\* Accepted — topology\/trust input locked; implementation dependency-blocked/)
assert.match(adr, /\*\*Roadmap task:\*\* P17-014/)

const controlPlane = roadmap.tasks.find((entry) => entry.id === 'P17-014')
const progress = roadmap.tasks.find((entry) => entry.id === 'P17-015')
const privacy = roadmap.tasks.find((entry) => entry.id === 'P17-016')
const panel = roadmap.tasks.find((entry) => entry.id === 'P17-021')
assert.ok(controlPlane && progress && privacy && panel)
assert.equal(controlPlane.status, 'backlog')
assert.equal(controlPlane.readiness.complete, true)
assert.deepEqual(controlPlane.readiness.missing, [])
assert.deepEqual(controlPlane.dependencies, ['P17-002', 'P17-015'])
assert.equal(progress.status, 'in_progress')
assert.equal(privacy.status, 'in_progress')
assert.equal(privacy.readiness.complete, true)
assert.equal(panel.readiness.complete, false)

for (const choice of ['`T1`', '`M1`', '`X1`', '`R1`', '`E1`', '`S1`']) {
  assert.ok(adr.includes(choice), `missing topology choice ${choice}`)
}

for (const contract of [
  'workers connect outbound only',
  'The private key never leaves the worker.',
  '`shell:false`',
  'provider credentials on the worker',
  'no cross-machine shared filesystem requirement',
  'At-least-once network delivery',
  'do not claim impossible exactly-once network execution',
  'unknown outcome becomes `recovery_required`',
  'never auto-dispatched to a second worker',
  'one active lease per task attempt',
  '25-second server hold',
  '100 enrolled workers',
  '1,000 queued tasks',
  'Control Plane API p95 under 500 ms',
  'real network-separated/two-node test',
  'no shared volume with Node A',
  'project_intelligence.inspect',
  'existing local workflows/provider bundles operate unchanged',
]) assert.ok(normalized.toLowerCase().includes(contract.toLowerCase()), `missing topology contract: ${contract}`)

for (const endpoint of [
  '/api/control-plane/v1/machines/enroll',
  '/api/control-plane/v1/worker/leases/claim',
  '/api/control-plane/v1/worker/leases/{leaseId}/heartbeat',
  '/api/control-plane/v1/worker/leases/{leaseId}/events',
  '/api/control-plane/v1/worker/leases/{leaseId}/complete',
]) assert.ok(adr.includes(endpoint), `missing worker API ${endpoint}`)

assert.match(adr, /APPROVE P17-014 TOPOLOGY v1: topology=T1, machine=M1, execution=X1, replay=R1, e2e=E1, scale=S1\./)
assert.match(adr, /does not authorize implementation, migration, enrollment,\s+remote execution/i)
assert.match(normalized, /does not authorize[^.]+deployment, sync, or push\./i)
assert.doesNotMatch(adr, /implementation (is|was) complete/i)

console.log('post-17-control-plane-topology.test: PASS (22 sections, T1/M1/X1/R1/E1/S1 accepted, P17-014 dependency-blocked)')
