import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r3b-release-history-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r3b-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r3b-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R3B release-history plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R3B readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const expectedSourcePaths = [
  'CHANGELOG.md',
  'README.md',
  'docs/releasing/UNRELEASED.md',
  'docs/roadmap/p17-018-r3b-release-history-plan.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/changelog.test.ts',
  'scripts/changelog.ts',
  'scripts/post-17-public-release-r3b-plan.test.ts',
  'scripts/public-release-history-contract.test.ts',
] as const

for (const heading of [
  '# P17-018 R3B — Release History and Notes Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R3B decisions',
  '### H1 — Changelog separates version authority from publication',
  '### N1 — One unreleased note owns the current candidate',
  '### V1 — Three version domains remain independent',
  '### G1 — Changelog generation is fail-closed',
  '### P1 — Release prose is public-safe and non-promotional',
  '### E1 — Evidence is immutable and separate',
  '## Historical authority matrix',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) {
  assert.ok(plan.includes(heading), `missing R3B plan heading: ${heading}`)
}

for (const phrase of [
  'slice=R3B, history=H1, notes=N1, versions=V1, generator=G1, privacy=P1, evidence=E1',
  'numeric tags v3.17 and v3.18 are the only historical release tags',
  'GitHub Releases count is zero',
  'v3.19 through v3.25 are untagged version-authority milestones, not published releases',
  'post-v3.25 changes belong under Unreleased',
  'root package 3.25.0, provider bundle 0.5.0, and shared core 1.3.0 remain independent authorities',
  'no missing tag or GitHub Release is fabricated',
  'the default generator target is Unreleased unless an explicit validated semantic version is supplied',
  'Git arguments are passed without shell interpolation',
  'duplicate Unreleased or version headings fail closed',
  'all 31 unresolved marker dispositions remain deferred',
  'TypeScript and Node remain the measured implementation choice',
  'no network, credential, database, provider execution, sync, publish, release, tag, visibility, or merge side effect',
  'restore the affected repository from today\'s verified snapshot',
]) {
  assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R3B plan contract: ${phrase}`)
}

assert.match(parentPlan, /Add governance\/support\/security\/community files and current changelog\/release notes/)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R3B source manifest path: ${sourcePath}`)
}
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /v3\.(?:19|20|21|22|23|24|25) (?:is|was) (?:tagged|released)/i)

console.log('post-17-public-release-r3b-plan.test: PASS (H1/N1/V1/G1/P1/E1 locked)')
