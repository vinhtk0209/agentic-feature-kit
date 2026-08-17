import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r1-release-manifest-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const packagingPath = path.join(root, 'docs', 'roadmap', 'post-17-provider-packaging.json')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r1-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r1-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  private?: boolean
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R1 release-manifest and marker-classification plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R1 readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const packaging = JSON.parse(fs.readFileSync(packagingPath, 'utf8')) as {
  providers?: Array<{ id?: string }>
}

for (const heading of [
  '# P17-018 R1 — Public Release Manifest and Internal Marker Classification Plan',
  '## Reconciled starting state',
  '## Functional and non-functional requirements',
  '## Locked R1 decisions',
  '### M1 — One committed public-release manifest',
  '### C1 — Exhaustive marker disposition registry',
  '### N1 — Canonical public naming remains centralized',
  '### P1 — Classification precedes remediation',
  '### B1 — The candidate tree is an explicit fail-closed allowlist',
  '### E1 — Evidence and release authorization remain separate',
  '## Exact data contracts',
  '## Clean Architecture and ownership',
  '## Marker inventory and disposition policy',
  '## Threat model and attack matrix',
  '## Implementation and verification sequence',
  '## R1 source manifest',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing P17-018 R1 plan section ${heading}`)

for (const decision of [
  'slice=R1',
  'manifest=M1',
  'classification=C1',
  'naming=N1',
  'privacy=P1',
  'boundary=B1',
  'evidence=E1',
]) assert.ok(normalized.includes(decision), `missing P17-018 R1 decision ${decision}`)

for (const contract of [
  'Agentic Feature Kit',
  'agentic-feature-kit',
  'codex, claude, and copilot',
  'root package remains private: true',
  'tracked Git tree is the only candidate source universe',
  'unknown paths fail closed',
  'path matching uses normalized repository-relative POSIX paths',
  'case-colliding paths fail closed',
  'symlink and reparse-point entries fail closed',
  'marker values are never stored in plaintext in the registry',
  'SHA-256 fingerprint',
  'every detected occurrence has exactly one disposition',
  'genericize, move-to-private-archive, replace-with-synthetic-fixture, or reviewed-retained',
  'unclassified additions fail closed',
  'changed occurrence counts fail closed',
  'reviewed-retained requires an explicit public-safe rationale',
  'classification success does not imply release readiness',
  'no network, credential, database, provider, sync, publish, or release side effect',
  'TypeScript and Node remain sufficient for R1',
]) assert.ok(normalizedLower.includes(contract.toLowerCase()), `missing P17-018 R1 contract: ${contract}`)

for (const attack of [
  'unknown tracked path',
  'allowlisted directory with a denied descendant',
  'path traversal',
  'absolute path',
  'backslash alias',
  'case collision',
  'Unicode normalization collision',
  'symlink',
  'reparse point',
  'duplicate manifest entry',
  'unknown manifest field',
  'unknown disposition',
  'plaintext marker value',
  'unclassified marker',
  'stale occurrence count',
  'wrong path binding',
  'fingerprint mismatch',
  'reviewed-retained without rationale',
  'binary file',
  'oversized file',
  'invalid UTF-8',
  'secret-like value',
]) assert.ok(normalizedLower.includes(attack.toLowerCase()), `missing P17-018 R1 attack: ${attack}`)

for (const source of [
  'docs/roadmap/p17-018-r1-release-manifest-plan.md',
  'scripts/post-17-public-release-r1-plan.test.ts',
  'release/public-release-manifest.json',
  'release/internal-marker-classification.json',
  'scripts/public-release-contract.ts',
  'scripts/public-release-contract-node.ts',
  'scripts/public-release-contract.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'package.json',
]) assert.ok(plan.includes(source), `missing P17-018 R1 source manifest entry ${source}`)

assert.match(parentPlan, /Add a release-manifest contract and internal\/private marker classification/)
assert.equal(packageJson.private, true, 'R1 must preserve the package publication boundary')
assert.deepEqual(packaging.providers?.map((provider) => provider.id), ['codex', 'claude', 'copilot'])

const affirmativePlan = plan.split('## Non-claims')[0]
assert.doesNotMatch(affirmativePlan, /P17-018 (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /public[- ]ready (?:is|was) complete/i)
assert.doesNotMatch(affirmativePlan, /repository (?:is|was) public/i)
assert.doesNotMatch(affirmativePlan, /package (?:is|was) published/i)

console.log('P17-018 R1 plan: PASS (M1/C1/N1/P1/B1/E1 locked)')
