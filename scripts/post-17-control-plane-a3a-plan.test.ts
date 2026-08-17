import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a3a-detached-signing-plan.md')
const packagePath = path.join(root, 'package.json')
const parentPath = path.join(root, 'docs', 'roadmap', 'p17-014-control-plane-implementation-plan.md')
const a2dEvidencePath = path.join(root, 'docs', 'evidence', 'post-17-control-plane-a2d-progress-binding-2026-08-17.md')
const commandName = 'test:post-17-control-plane-a3a-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a3a-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A3A detached-signing plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A3A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '# P17-014 A3A — Detached Envelope and Receipt Signing Plan',
  '## Reconciled starting state',
  '## Locked A3A decisions',
  '### S1 — One exact detached-signature envelope',
  '### E1 — A2B envelope signing uses its owned serializer',
  '### R1 — A2C receipt signing requires an owned serializer',
  '### C1 — Canonical bytes are domain-separated and fixed-key',
  '### K1 — Signature key references are opaque and authorization-neutral',
  '### D1 — The Node adapter is real Ed25519 with closure-local private keys',
  '### Q1 — A3 remains split into A3A/A3B/A3C',
  '### V1 — Evidence uses real vectors and exact predecessor topology',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A3A source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A3A plan section ${heading}`)

for (const decision of [
  'slice=A3A',
  'signature=S1',
  'envelope=E1',
  'receipt=R1',
  'canonical=C1',
  'keyref=K1',
  'ed25519=D1',
  'sequence=Q1',
  'evidence=V1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A3A decision ${decision}`)

for (const contract of [
  'algorithm is exactly Ed25519',
  'payloadKind is execution_envelope or execution_receipt',
  'signerKind is control_plane or worker_machine',
  'tenantId',
  'signerId',
  'keyId',
  'keyVersion',
  'signedAt',
  'payloadHash',
  'signature',
  'serializeControlPlaneExecutionEnvelope',
  'serializeControlPlaneExecutionReceipt',
  'signature wrapper never rewrites the A2 payload',
  'receipt signerId equals the envelope machineId',
  'domain separator differs by payload kind',
  'ControlPlaneHashPort',
  'base64url without padding',
  'private key remains closure-local',
  'public SPKI key',
  'Node crypto is isolated in control-plane-signing-node.ts',
  'A3B owns worker-request signing, nonce/time-window, rotation, revocation, and key authorization',
  'A3C owns the transactional journal port and disposable implementation',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A3A contract: ${contract}`)

for (const attack of [
  'changed envelope after signing',
  'changed receipt after signing',
  'payload-kind confusion',
  'cross-protocol replay',
  'tenant mismatch',
  'signer-kind mismatch',
  'receipt machine mismatch',
  'key ID or version drift',
  'signature tampering',
  'payload hash tampering',
  'key-order permutation',
  'extra field',
  'prototype',
  'accessor',
  'cycle',
  'malformed base64url',
  'wrong public key',
  'altered canonical bytes',
  'signer exception',
  'verifier exception',
  'constant hash output',
  'private-key export or log',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A3A attack: ${attack}`)

for (const source of [
  'docs/roadmap/p17-014-a3a-detached-signing-plan.md',
  'scripts/post-17-control-plane-a3a-plan.test.ts',
  'docs/roadmap/p17-014-control-plane-implementation-plan.md',
  'packages/core/src/control-plane-state.ts',
  'packages/core/src/control-plane-signing.ts',
  'packages/core/src/control-plane-signing-node.ts',
  'packages/core/test/control-plane-signing.test.ts',
  'packages/core/README.md',
  'package.json',
]) assert.ok(plan.includes(source), `missing A3A source manifest entry ${source}`)

assert.ok(fs.readFileSync(parentPath, 'utf8').includes('### A3 — Machine crypto and worker journal ports'))
assert.ok(fs.existsSync(a2dEvidencePath), 'A2D evidence predecessor is missing')
assert.ok(fs.readFileSync(a2dEvidencePath, 'utf8').includes('38888187c4191206dbb81562ccb387463fcbbc76'))
const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /A3A (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /private key (?:is|was) exported/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A3A detached-signing plan: PASS (S1/E1/R1/C1/K1/D1/Q1/V1 locked)')
