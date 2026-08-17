import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r2-public-entry-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const packagingPath = path.join(root, 'docs', 'roadmap', 'post-17-provider-packaging.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r2-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r2-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  name?: string
  version?: string
  private?: boolean
  bin?: Record<string, string>
  engines?: Record<string, string>
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R2 provider-neutral public-entry plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R2 readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const packaging = JSON.parse(fs.readFileSync(packagingPath, 'utf8')) as {
  providers?: Array<{ id?: string }>
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  entries?: Array<{ path?: string; disposition?: string }>
}

for (const heading of [
  '# P17-018 R2 — Provider-Neutral Public Entry Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R2 decisions',
  '### I1 — Agentic Feature Kit is the root public identity',
  '### M1 — Package metadata is complete but remains private',
  '### D1 — README is a provider-neutral decision tree',
  '### L1 — Root links are repository-relative and fail closed',
  '### C1 — Legacy package and flagship compatibility are explicit',
  '### P1 — Public prose carries no workspace-only dependency',
  '### E1 — Evidence and publication remain separate',
  '## README information architecture',
  '## Package metadata contract',
  '## Clean-clone quickstart contract',
  '## Clean Architecture and ownership',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) {
  assert.ok(plan.includes(heading), `missing R2 plan heading: ${heading}`)
}

for (const phrase of [
  'slice=R2, identity=I1, metadata=M1, readme=D1, links=L1, compatibility=C1, privacy=P1, evidence=E1',
  'canonical public display name is Agentic Feature Kit',
  'legacy package name remains feature-from-confluence-kit',
  'root package remains private: true',
  'provider IDs remain codex, claude, and copilot',
  'archive names remain agentic-feature-kit-<provider>-<bundleVersion>.zip',
  'repository, homepage, bugs, license, and keywords',
  'npm ci',
  'first local result after dependency installation',
  'every repository-relative README link resolves to a tracked file or directory',
  'formal governance, support, and security policy links remain deferred until their files exist',
  'the root README must not claim public-ready, published, official, endorsed, or marketplace availability',
  'no network, credential, database, provider execution, sync, publish, release, tag, visibility, or merge side effect',
  'unknown tracked paths fail closed through the R1 release manifest',
  'typescript and node remain the measured implementation choice',
  'restore the affected repository from today\'s verified snapshot',
]) {
  assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R2 plan contract: ${phrase}`)
}

assert.match(parentPlan, /Make root product metadata and README provider-neutral/)
assert.equal(packageJson.name, 'feature-from-confluence-kit')
assert.equal(packageJson.version, '3.25.0')
assert.equal(packageJson.private, true)
assert.equal(packageJson.engines?.node, '>=20')
assert.equal(packageJson.bin?.workflow, 'bin/workflow.ts')
assert.deepEqual(packaging.providers?.map((provider) => provider.id), ['codex', 'claude', 'copilot'])
assert.deepEqual(
  manifest.entries?.filter((entry) => entry.path === 'README.md' || entry.path === 'package.json').map((entry) => entry.path),
  ['README.md', 'package.json'],
)
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)

console.log('post-17-public-release-r2-plan.test: PASS (I1/M1/D1/L1/C1/P1/E1 locked)')
