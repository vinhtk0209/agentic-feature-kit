import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4b-synthetic-fixtures-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const r4aPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4a-legacy-backend-config-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4b-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4b-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4B synthetic-fixture plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4B readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const r4aPlan = fs.readFileSync(r4aPlanPath, 'utf8')
const expectedSourcePaths = [
  '.claude/assurance/baselines/us-ad-095-progress-reports.spec-ir.json',
  '.claude/integrations/confluence-b0-intake.test.ts',
  '.claude/integrations/confluence-refetch-actor.test.ts',
  '.claude/mcp-server/confluence-http.test.ts',
  'docs/roadmap/p17-018-r4b-synthetic-fixtures-plan.md',
  'package.json',
  'packages/core/test/semantic-spec.test.ts',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts',
  'scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts',
  'scripts/post-17-public-release-r4b-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const

for (const heading of [
  '# P17-018 R4B — Synthetic Fixture Privacy Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R4B decisions',
  '### B1 — Fully synthetic semantic baseline',
  '### C1 — Reserved Confluence origins preserve security coverage',
  '### P1 — Project-reference assertions become value-independent',
  '### G1 — Prior regression contracts become remediation-safe',
  '### R1 — Marker authority changes exactly',
  '### E1 — Evidence remains immutable and separate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4B plan heading: ${heading}`)

for (const phrase of [
  'slice=R4B, baseline=B1, confluence=C1, projectRef=P1, regression=G1, registry=R1, evidence=E1',
  '95 paragraphs, 95 unique anchors, and 19 acceptance criteria',
  'all 19 provenance quotes resolve literally',
  'the synthetic source hash is recomputed from canonical fixture content',
  'reserved example.test origins',
  'same-origin, credential, scheme, path, and host-confusion attacks remain covered',
  'project_ref values are checked by shape and cross-snapshot equality',
  'no exact live project identifier remains in a public test',
  'r4a regression assertions use explicit runtime-path denial and monotonic ceilings',
  'internal-hostname falls from 21 occurrences to zero',
  'live-supabase-project-ref falls from eight occurrences to five',
  'classified occurrences fall from 70 to 46',
  'release blockers fall from 28 to 22',
  'final manifest authority is 608 total paths, 603 include, and five exclude',
  'TypeScript and Node remain the measured implementation choice',
  'no dashboard snapshot is modified',
  'restore the affected repository from today\'s verified snapshot',
  'no sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side effect',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R4B plan contract: ${phrase}`)

assert.match(parentPlan, /internal-marker/)
assert.match(r4aPlan, /R4A does not remediate the other 28 marker bindings/)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4B source manifest path: ${sourcePath}`)
}
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /(?:all|zero) (?:marker|release) blockers (?:are|remain)/i)

console.log('post-17-public-release-r4b-plan.test: PASS (B1/C1/P1/G1/R1/E1 locked)')
