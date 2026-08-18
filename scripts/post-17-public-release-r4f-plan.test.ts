import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4f-historical-identity-aliases-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4e-public-operational-aliases-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4f-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4f-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4F historical identity aliases plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4F readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const normalizedParent = parentPlan.replace(/`/g, '').replace(/\s+/g, ' ')
const expectedSourcePaths = [
  'docs/design/_review/section-10-clean.md',
  'docs/design/measurement-layer-b11-gate-and-version-bootstrap.md',
  'docs/design/measurement-layer-b11-wire.md',
  'docs/design/measurement-layer-tier-b-environment.md',
  'docs/design/measurement-layer-v1.md',
  'docs/evidence/post-17-worktree-browser-verification.md',
  'docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md',
  'docs/roadmap/p17-018-r4f-historical-identity-aliases-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4f-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-historical-alias-contract.test.ts',
  'scripts/public-release-operational-alias-contract.test.ts',
  'scripts/public-release-private-archive-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md',
  'release/public-release-manifest.json',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R4F — Historical Identity Alias Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R4F decisions',
  '### H1 — Remediate the complete final marker set',
  '### A1 — Use role-neutral public aliases',
  '### T1 — Prove only the marker-gate transition',
  '### R1 — Retain zero-count marker guards',
  '### E1 — Keep evidence immutable and separate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4F plan heading: ${heading}`)

for (const phrase of [
  'slice=R4F, surfaces=H1, aliases=A1, transition=T1, registry=R1, evidence=E1',
  'ten bound identity spans across seven historical design, evidence, and roadmap files',
  'example-learning-app, example-authoring-app, <supabase-project-ref>, and %TEMP%/agentic-feature-kit linked worktree Ω',
  'classified occurrences fall from 10 to zero',
  'release blockers fall from nine to zero',
  'source-stage manifest authority is 623 total paths, 623 include, and zero exclude',
  'evidence-stage manifest authority is 624 total paths, 624 include, and zero exclude',
  'eligible-for-later-gates',
  'TypeScript and Node remain the measured implementation choice',
  'no sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side effect',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R4F plan contract: ${phrase}`)

assert.match(normalizedParent, /nine historical-design\/evidence bindings/i)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4F source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R4F evidence manifest path: ${evidencePath}`)
}
assert.equal(manifestIdentity(expectedSourcePaths), '885535372dd3b8deecc62ac33b3adf9d0cc8748a54672f394fdbd0ac51f4b4d2')
assert.equal(manifestIdentity(expectedEvidencePaths), '056adb8673aa2e08f585312a99427113a8669a789ab86a18bc3d82418915e721')
assert.ok(plan.includes('`885535372dd3b8deecc62ac33b3adf9d0cc8748a54672f394fdbd0ac51f4b4d2`'))
assert.ok(plan.includes('`056adb8673aa2e08f585312a99427113a8669a789ab86a18bc3d82418915e721`'))
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)

console.log('post-17-public-release-r4f-plan.test: PASS (H1/A1/T1/R1/E1 locked)')
