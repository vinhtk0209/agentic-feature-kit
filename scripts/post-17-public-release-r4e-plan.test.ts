import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4e-public-operational-aliases-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4d-private-archive-boundary-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4e-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4e-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4E public operational aliases plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4E readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const normalizedParent = parentPlan.replace(/`/g, '').replace(/\s+/g, ' ')
const expectedSourcePaths = [
  '.claude/_content/images.md',
  '.gitignore',
  'docs-site/pages/api-reference.mdx',
  'docs/roadmap/p17-018-r4e-public-operational-aliases-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4e-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-operational-alias-contract.test.ts',
  'scripts/public-release-private-archive-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/sync-to-targets.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r4e-operational-aliases-2026-08-18.md',
  'release/public-release-manifest.json',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R4E — Public Operational Alias Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R4E decisions',
  '### S1 — Remediate only public operational surfaces',
  '### A1 — Reuse stable public aliases',
  '### G1 — Preserve behavior and prior release contracts',
  '### R1 — Reduce marker authority exactly',
  '### E1 — Keep evidence immutable and separate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4E plan heading: ${heading}`)

for (const phrase of [
  'slice=R4E, surfaces=S1, aliases=A1, regression=G1, registry=R1, evidence=E1',
  'four learning-target and one authoring-target occurrences',
  'example-learning-app and example-authoring-app',
  'classified occurrences fall from 15 to 10',
  'release blockers fall from 14 to nine',
  'source-stage manifest authority is 619 total paths, 619 include, and zero exclude',
  'evidence-stage manifest authority is 620 total paths, 620 include, and zero exclude',
  'TypeScript and Node remain the measured implementation choice',
  'no sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side effect',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R4E plan contract: ${phrase}`)

assert.match(normalizedParent, /genericize at 14 bindings and 15 occurrences/i)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4E source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R4E evidence manifest path: ${evidencePath}`)
}
assert.equal(manifestIdentity(expectedSourcePaths), 'c1544bbf499547ea825e8b07b03ea44246b425edb656751346ab28b51154abc7')
assert.equal(manifestIdentity(expectedEvidencePaths), 'caa319109c3c4b56c5035cdfe0a35440c4922cfc7523f6a39ec4adace4d15069')
assert.ok(plan.includes('`c1544bbf499547ea825e8b07b03ea44246b425edb656751346ab28b51154abc7`'))
assert.ok(plan.includes('`caa319109c3c4b56c5035cdfe0a35440c4922cfc7523f6a39ec4adace4d15069`'))
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)

console.log('post-17-public-release-r4e-plan.test: PASS (S1/A1/G1/R1/E1 locked)')
