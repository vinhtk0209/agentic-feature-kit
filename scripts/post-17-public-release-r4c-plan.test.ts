import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4c-prompt-history-genericization-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const r4bPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r4b-synthetic-fixtures-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r4c-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r4c-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R4C prompt-history alias plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R4C readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const r4bPlan = fs.readFileSync(r4bPlanPath, 'utf8')
const expectedSourcePaths = [
  '.claude/prompt-evolution.md',
  'docs/roadmap/p17-018-r4c-prompt-history-genericization-plan.md',
  'package.json',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r4c-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/public-release-prompt-history-contract.test.ts',
  'scripts/public-release-synthetic-fixture-contract.test.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r4c-prompt-history-aliases-2026-08-18.md',
  'release/public-release-manifest.json',
] as const
const evidenceManifestIdentity = createHash('sha256')
  .update(`${expectedEvidencePaths.join('\n')}\n`, 'utf8')
  .digest('hex')

for (const heading of [
  '# P17-018 R4C — Prompt-History Alias Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R4C decisions',
  '### H1 — Preserve prompt-history semantics and structure',
  '### A1 — Use stable provider-neutral aliases',
  '### G1 — Prior release contracts become remediation-safe',
  '### R1 — Marker authority changes exactly',
  '### E1 — Evidence remains immutable and separate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing R4C plan heading: ${heading}`)

for (const phrase of [
  'slice=R4C, history=H1, aliases=A1, regression=G1, registry=R1, evidence=E1',
  '23 learning-target and two authoring-target identity occurrences',
  'example-learning-app and example-authoring-app',
  '1,836 lines, 182 headings, 60 lesson annotations, and 158 Change tokens',
  '28cca65197070069287da54c539f1ac63abd27a560b61587a7b99ce78b1fe1a9',
  '709873d9ebdb4571be12e17563c0e0493dee360b07f49cf2a5c51712841feb90',
  'classified occurrences fall from 46 to 21',
  'release blockers fall from 22 to 20',
  'genericize at 14 bindings and 15 occurrences',
  'move-to-private-archive at six bindings and six occurrences',
  'source-stage manifest authority is 611 total paths, 606 include, and five exclude',
  'evidence-stage manifest authority is 612 total paths, 607 include, and five exclude',
  'TypeScript and Node remain the measured implementation choice',
  'restore the affected repository from today\'s verified snapshot',
  'no sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side effect',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R4C plan contract: ${phrase}`)

assert.match(parentPlan, /internal-marker/)
assert.match(r4bPlan, /R4B does not complete the remaining genericization/)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R4C source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R4C evidence manifest path: ${evidencePath}`)
}
assert.equal(evidenceManifestIdentity, '7f2646d0f2fc060c9d129bb4e0463d78ad38bbef59a09f6282baa4384a863cd0')
assert.ok(plan.includes(`\`${evidenceManifestIdentity}\``), 'R4C evidence-manifest identity must match its exact LF-final paths')
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /(?:all|zero) (?:marker|release) blockers (?:are|remain)/i)

console.log('post-17-public-release-r4c-plan.test: PASS (H1/A1/G1/R1/E1 locked)')
