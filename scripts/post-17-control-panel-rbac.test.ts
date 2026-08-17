import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const adrPath = path.join(root, 'docs', 'design', 'adr-004-control-panel-rbac-action-governance.md')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const adr = fs.readFileSync(adrPath, 'utf8')
const normalized = adr.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }

for (const heading of [
  '## Outcome',
  '## Context and current gap',
  '## Requirements',
  '## Recommended decisions',
  '## Identity and tenant boundary I1',
  '## Capability model A1',
  '## Separation of duties S1',
  '## Action matrix M1',
  '## Action and decision contract D1',
  '## Audit and privacy boundary',
  '## Break-glass boundary B1',
  '## UI authorization contract U1',
  '## Clean Architecture boundary',
  '## E2E identities and evidence E1',
  '## Security and race attacks',
  '## Options considered',
  '## Trade-offs and consequences',
  '## Verification and evidence ladder',
  '## Rollout and rollback',
  '## Operator decision required',
  '## Action items after approval',
]) assert.ok(adr.includes(heading), `missing RBAC section ${heading}`)

assert.match(adr, /\*\*Status:\*\* Proposed — operator RBAC approval required/)
assert.match(adr, /\*\*Roadmap task:\*\* P17-021/)

const panel = roadmap.tasks.find((entry) => entry.id === 'P17-021')
const topology = roadmap.tasks.find((entry) => entry.id === 'P17-014')
const progress = roadmap.tasks.find((entry) => entry.id === 'P17-015')
const privacy = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(panel && topology && progress && privacy)
assert.equal(panel.status, 'backlog', 'P17-021 must remain backlog before all readiness inputs pass')
assert.equal(panel.readiness.complete, false, 'P17-021 must remain input-blocked before approval')
assert.equal(panel.readiness.missing.length, 9, 'only completed P17-015 may close one P17-021 input')
assert.ok(!panel.readiness.missing.includes('completed P17-015 machine/task/run/evidence and retry-lineage model'))
assert.ok(panel.readiness.missing.includes('operator-approved RBAC and separation-of-duties matrix'))
assert.deepEqual(panel.dependencies, ['P17-014', 'P17-015', 'P17-016'])
assert.equal(topology.status, 'in_progress')
assert.equal(topology.readiness.complete, true)
assert.equal(progress.status, 'done')
assert.equal(privacy.status, 'in_progress')
assert.equal(privacy.readiness.complete, true)

for (const choice of ['`I1`', '`A1`', '`S1`', '`M1`', '`D1`', '`B1`', '`U1`', '`E1`']) {
  assert.ok(adr.includes(choice), `missing RBAC choice ${choice}`)
}

for (const role of ['`viewer`', '`operator`', '`approver`', '`administrator`']) {
  assert.ok(adr.includes(role), `missing RBAC role ${role}`)
}

for (const contract of [
  'Email is display metadata only and never an authorization key supplied by a browser.',
  'No repository or RPC has an unscoped overload.',
  'no linear rank inheritance for Control Panel mutations',
  'self-approval is always forbidden',
  'Changing any bound field returns the task to `awaiting_approval`',
  'A retry is a new immutable P17-015 attempt.',
  'Cancellation is intentionally easier than starting more work.',
  'No route may replace this matrix with `canAccess(role, requiredRole)`.',
  'creates no task transition, lease, delivery, or worker side effect',
  'same non-disclosing response for an absent resource and an inaccessible cross-tenant resource',
  'two distinct configured human recovery subjects',
  'expires after 15 minutes',
  'missing/malformed authorization metadata: fail closed into read-only degraded mode',
  'project_intelligence.inspect',
  'real network-separated disposable worker',
]) assert.ok(normalized.toLowerCase().includes(contract.toLowerCase()), `missing RBAC contract: ${contract}`)

for (const reason of [
  'SELF_APPROVAL_FORBIDDEN',
  'STALE_RESOURCE_VERSION',
  'IDEMPOTENCY_CONFLICT',
  'POLICY_VERSION_CHANGED',
  'SECOND_SIGNER_REQUIRED',
  'CONTROL_PLANE_UNAVAILABLE',
]) assert.ok(adr.includes(reason), `missing closed decision reason ${reason}`)

for (const identity of [
  '`subject-viewer-a`',
  '`subject-operator-a`',
  '`subject-approver-a`',
  '`subject-admin-a`',
  '`subject-dual-a`',
  '`subject-operator-b`',
]) assert.ok(adr.includes(identity), `missing E2E identity ${identity}`)

assert.match(adr, /APPROVE P17-021 RBAC v1: identity=I1, authz=A1, duties=S1, matrix=M1, decision=D1, breakglass=B1, ui=U1, e2e=E1\./)
assert.match(adr, /does not authorize implementation, migration, identity\s+creation, remote execution, deployment, sync, or push/i)
assert.match(adr, /does not mark P17-021 ready or done/i)
assert.doesNotMatch(adr, /implementation (is|was) complete/i)

console.log('post-17-control-panel-rbac.test: PASS (21 sections, I1/A1/S1/M1/D1/B1/U1/E1 proposed, P17-021 still has 9 gaps)')
