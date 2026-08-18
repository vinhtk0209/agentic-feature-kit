import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4d-private-archive-boundary-plan.md')
const adrPath = path.join(root, 'docs', 'design', 'adr-006-private-source-public-export-boundary.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4d-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4d-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4D private-archive plan')
if (!fs.existsSync(adrPath)) readinessGaps.push('ADR-006 private-source/public-export boundary')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4D readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const adr = fs.readFileSync(adrPath, 'utf8')
const normalizedPlan = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedAdr = adr.replace(/`/g, '').replace(/\s+/g, ' ')

const expectedSourcePaths = [
  '.claude/integrations/self-improvement-cycle.test.ts',
  '.gitignore',
  'docs/design/adr-006-private-source-public-export-boundary.md',
  'docs/evidence/i1-self-improvement-cycle-2026-08-12.json',
  'docs/evidence/i1-self-improvement-cycle-2026-08-12.md',
  'docs/evidence/post-17-cross-machine-tracking.md',
  'docs/evidence/post-17-privacy-wave-c2-schema-migration-design-2026-08-16.md',
  'docs/roadmap/p17-018-r4d-private-archive-boundary-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/private-archive-receipt.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4d-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-private-archive-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/sync-config.test.ts',
  'scripts/sync-config.ts',
  'scripts/sync-to-targets.ts',
  'sync.config.json',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r4d-private-archive-boundary-2026-08-18.md',
  'release/public-release-manifest.json',
] as const
function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R4D — Private-Archive Boundary Plan',
  '## Reconciled starting state',
  '## Locked R4D decisions',
  '### T1 — Keep canonical history private',
  '### A1 — Archive before removal or replacement',
  '### H1 — Preserve history without rewriting it',
  '### S1 — Separate public sync defaults from local operational targets',
  '### X1 — Export only a historyless eligible tree',
  '### E1 — Split private and public receipts',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4D plan heading: ${heading}`)

for (const phrase of [
  'slice=R4D, topology=T1, archive=A1, history=H1, sync=S1, export=X1, evidence=E1',
  'four private evidence files plus the operational sync configuration',
  'five artifacts and 23,454 source bytes',
  'sync.config.local.json',
  'example-learning-app and example-authoring-app',
  'no Git history rewrite',
  '615 total paths, 615 include, and zero exclude',
  '15 classified occurrences and 14 blockers',
  'genericize at 14 bindings and 15 occurrences',
  'TypeScript and Node remain the measured implementation choice',
  'no sync, direct-main push, tag, release, publication, visibility, database, provider, dashboard, or target side effect',
]) assert.ok(normalizedPlan.toLowerCase().includes(phrase.toLowerCase()), `missing R4D plan contract: ${phrase}`)

for (const heading of [
  '# ADR-006: Keep private canonical history and publish historyless exports',
  '## Context',
  '## Decision',
  '## Options considered',
  '## Trade-off analysis',
  '## Consequences',
  '## Action items',
]) assert.ok(adr.includes(heading), `missing ADR-006 heading: ${heading}`)
for (const phrase of [
  'canonical repository remains private',
  'deterministic historyless export',
  'manifest exclusion alone does not protect public Git history',
  'same-repository history rewrite',
  'in-place redaction',
  'separately governed private archive',
]) assert.ok(normalizedAdr.toLowerCase().includes(phrase.toLowerCase()), `missing ADR-006 contract: ${phrase}`)

for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4D source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R4D evidence manifest path: ${evidencePath}`)
}
assert.equal(manifestIdentity(expectedSourcePaths), '0c788abe3d66b2233749e17e761ba26b3cb6fa0126bd42045446d9406b3b5722')
assert.equal(manifestIdentity(expectedEvidencePaths), 'b00b88b78b03e2473caf99df4405e8dc1d439c6379e630fab2a11accbf86f362')
assert.ok(plan.includes('`0c788abe3d66b2233749e17e761ba26b3cb6fa0126bd42045446d9406b3b5722`'))
assert.ok(plan.includes('`b00b88b78b03e2473caf99df4405e8dc1d439c6379e630fab2a11accbf86f362`'))
assert.doesNotMatch(normalizedPlan, /repository (?:is|was) public/i)
assert.doesNotMatch(normalizedAdr, /rewrite (?:the )?canonical history/i)

console.log('post-17-public-release-r4d-plan.test: PASS (T1/A1/H1/S1/X1/E1 locked)')
