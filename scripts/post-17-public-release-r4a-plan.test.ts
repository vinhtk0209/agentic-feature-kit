import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4a-legacy-backend-config-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4a-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4a-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4A legacy-backend configuration plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const expectedSourcePaths = [
  '.claude/integrations/core/legacy-backend-config.ts',
  '.claude/integrations/record-verify.test.ts',
  '.claude/integrations/telemetry.test.ts',
  '.claude/integrations/telemetry.ts',
  'bin/lib/bundle.ts',
  'bin/lib/supabase.ts',
  'bin/lib/supabase.test.ts',
  'docs/claude-commands/INTEGRATIONS.md',
  'docs/roadmap/p17-016-kit-writer-registry.json',
  'docs/roadmap/p17-018-r4a-legacy-backend-config-plan.md',
  'package.json',
  'packages/core/src/legacy-backend-config.ts',
  'packages/core/test/legacy-backend-config.test.ts',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-public-release-r4a-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/sync-to-targets.ts',
  'scripts/sync-verify-guard.test.ts',
] as const

for (const heading of [
  '# P17-018 R4A — Legacy Backend Configuration Hardening Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R4A decisions',
  '### C1 — One pure paired-configuration contract',
  '### T1 — Optional telemetry stays local-first and fetch-free when unconfigured',
  '### K1 — Workflow CLI fails closed before network use',
  '### S1 — Real sync admission remains fail-closed',
  '### R1 — Marker authority changes exactly',
  '### E1 — Evidence remains immutable and separate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4A plan heading: ${heading}`)

for (const phrase of [
  'slice=R4A, config=C1, telemetry=T1, cli=K1, sync=S1, registry=R1, evidence=E1',
  'SUPABASE_URL and SUPABASE_ANON_KEY are an atomic pair',
  'the pure contract imports no environment, process, filesystem, network, or provider SDK',
  'https is required except for explicit loopback development URLs',
  'missing or malformed configuration reaches zero fetch calls',
  'optional telemetry preserves its existing fail-open workflow outcome',
  'workflow login, init, update, and a non-forced real sync remain fail-closed',
  'dry-run and an explicit reasoned --force-unverified override retain their existing behavior',
  'the live-project marker falls from 11 to eight occurrences',
  'release blockers fall from 31 to 28 without suppressing the remaining findings',
  'TypeScript and Node remain the measured implementation choice',
  'no database, provider execution, sync, publish, release, tag, visibility, or direct-main push side effect',
  'restore the affected repository from today\'s verified snapshot',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R4A plan contract: ${phrase}`)

assert.match(parentPlan, /license\/secret\/internal-marker/)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4A source manifest path: ${sourcePath}`)
}
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /(?:all|zero) (?:marker|release) blockers (?:are|remain)/i)

console.log('post-17-public-release-r4a-plan.test: PASS (C1/T1/K1/S1/R1/E1 locked)')
