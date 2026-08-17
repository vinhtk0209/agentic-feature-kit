import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-014-a3b-worker-request-auth-plan.md')
const packagePath = path.join(root, 'package.json')
const parentPath = path.join(root, 'docs', 'roadmap', 'p17-014-control-plane-implementation-plan.md')
const a3aEvidencePath = path.join(
  root,
  'docs',
  'evidence',
  'post-17-control-plane-a3a-detached-signing-2026-08-17.md',
)
const boundaryEvidencePath = path.join(
  root,
  'docs',
  'evidence',
  'pr2-clean-checkout-repository-boundary-remediation-2026-08-17.md',
)
const commandName = 'test:post-17-control-plane-a3b-plan'
const expectedCommand = 'npx tsx scripts/post-17-control-plane-a3b-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('A3B worker-request authentication plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-014 A3B readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()

for (const heading of [
  '# P17-014 A3B — Worker Request Authentication and Machine Key Lifecycle Plan',
  '## Reconciled starting state',
  '## Locked A3B decisions',
  '### W1 — One exact worker-request signature wrapper',
  '### P1 — Request kind derives the canonical POST path',
  '### F1 — Freshness uses an injected clock and fixed bounds',
  '### N1 — Nonce consumption is atomic with key-set CAS',
  '### K1 — Machine key sets are exact, bounded, and authorization-only',
  '### R1 — Rotation has one bounded non-renewable overlap',
  '### V1 — Revocation is immediate with no key fallback',
  '### C1 — Verification order closes replay and rotation races',
  '### Q1 — A3B stops before persistence, routes, and worker runtime',
  '### E1 — Evidence proves real crypto plus state and port attacks',
  '## Exact contracts',
  '## Clean Architecture and source ownership',
  '## Attack and test matrix',
  '## Implementation and verification sequence',
  '## A3B source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-014 A3B plan section ${heading}`)

for (const decision of [
  'slice=A3B',
  'request=W1',
  'path=P1',
  'freshness=F1',
  'nonce=N1',
  'keyset=K1',
  'rotation=R1',
  'revocation=V1',
  'composition=C1',
  'sequence=Q1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-014 A3B decision ${decision}`)

for (const contract of [
  'algorithm is exactly Ed25519',
  'method is exactly POST',
  'claim, heartbeat, events, complete, or key_rotate',
  'canonical path is derived from request kind and lease ID',
  'body is bounded to 64 KiB before hashing',
  'signedAt is at most 60 seconds old',
  'future skew is at most 30 seconds',
  'nonce is exactly 32 random bytes encoded as canonical base64url',
  'raw nonce is never passed to the persistence port',
  'machine key set version is rechecked atomically with nonce consumption',
  'retiring keys cannot authorize key_rotate',
  'rotation grace is at most five minutes',
  'revoked keys are denied immediately even inside freshness or grace windows',
  'revoking the active key never promotes or falls back to an older key',
  'ControlPlaneDetachedSignerPort',
  'ControlPlaneDetachedVerifierPort',
  'createNodeEd25519Verifier',
  'ControlPlaneHashPort',
  'A3C owns transactional journal and crash recovery',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-014 A3B contract: ${contract}`)

for (const attack of [
  'changed body after signing',
  'request-kind confusion',
  'canonical-path confusion',
  'wrong lease ID',
  'wrong tenant or machine',
  'wrong key ID or version',
  'stale timestamp',
  'future timestamp',
  'nonce replay',
  'nonce-store exception',
  'key lookup exception',
  'key rotation between lookup and nonce commit',
  'retiring-key rotation attempt',
  'rotation grace extension',
  'revoked active key',
  'old-key fallback',
  'wrong public key',
  'signature tampering',
  'constant hash output',
  'extra field',
  'prototype',
  'accessor',
  'cycle',
  'hidden property',
  'symbol property',
  'oversized UTF-8 body',
  'port error echo',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-014 A3B attack: ${attack}`)

for (const source of [
  'docs/roadmap/p17-014-a3b-worker-request-auth-plan.md',
  'scripts/post-17-control-plane-a3b-plan.test.ts',
  'docs/roadmap/p17-014-control-plane-implementation-plan.md',
  'packages/core/src/control-plane-machine-keys.ts',
  'packages/core/src/control-plane-worker-request-auth.ts',
  'packages/core/test/control-plane-machine-keys.test.ts',
  'packages/core/test/control-plane-worker-request-auth.test.ts',
  'packages/core/README.md',
  'package.json',
]) assert.ok(plan.includes(source), `missing A3B source manifest entry ${source}`)

assert.ok(fs.readFileSync(parentPath, 'utf8').includes('### A3 — Machine crypto and worker journal ports'))
assert.ok(fs.existsSync(a3aEvidencePath), 'A3A evidence predecessor is missing')
assert.ok(fs.readFileSync(a3aEvidencePath, 'utf8').includes('2a96bd7e052b6e7753e96cc255cba20583369b3c'))
assert.ok(fs.existsSync(boundaryEvidencePath), 'clean-checkout evidence predecessor is missing')
assert.ok(fs.readFileSync(boundaryEvidencePath, 'utf8').includes('3b1fab07ca7274a35d3cad64d1cdd04417c4da85'))

const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /A3B (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /nonce persistence (?:is|was) implemented/i)
assert.doesNotMatch(affirmativePlan, /HTTP route (?:is|was) enabled/i)
assert.doesNotMatch(affirmativePlan, /remote execution (?:is|was) enabled/i)

console.log('P17-014 A3B plan: PASS (W1/P1/F1/N1/K1/R1/V1/C1/Q1/E1 locked)')
