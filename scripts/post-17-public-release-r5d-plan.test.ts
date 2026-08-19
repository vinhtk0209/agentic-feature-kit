import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5d-clean-clone-qualification-plan.md')
const predecessorPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5c2b-strict-archive-gate-plan.md')
const packagePath = path.join(root, 'package.json')
const workflowPath = path.join(root, '.github', 'workflows', 'workflow-kit-ci.yml')
const commandName = 'test:post-17-public-release-r5d-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r5d-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R5D clean-clone qualification plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (packageJson.scripts['test:release-clean-clone-contract'] !== 'npx tsx scripts/release-clean-clone-contract.test.ts') readinessGaps.push('pure contract route')
if (packageJson.scripts['test:release-clean-clone-node'] !== 'npx tsx scripts/release-clean-clone-node.test.ts') readinessGaps.push('Node adapter route')
if (packageJson.scripts['qualify:public-release-clean-clone'] !== 'npx tsx scripts/release-clean-clone-node.ts qualify') readinessGaps.push('qualification CLI route')
if (packageJson.scripts['release:clean-clone-matrix-gate'] !== 'npx tsx scripts/release-clean-clone-node.ts matrix') readinessGaps.push('matrix gate route')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit plan registration')
if (!packageJson.scripts['test:kit']?.includes('npm run test:release-clean-clone-contract')) readinessGaps.push('full-kit contract registration')
if (!packageJson.scripts['test:kit']?.includes('npm run test:release-clean-clone-node')) readinessGaps.push('full-kit Node registration')
assert.deepEqual(readinessGaps, [], `P17-018 R5D readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const predecessorPlan = fs.readFileSync(predecessorPlanPath, 'utf8')
const workflow = fs.readFileSync(workflowPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const expectedSourcePaths = [
  '.github/workflows/workflow-kit-ci.yml',
  '.gitignore',
  'README.md',
  'docs/releasing/UNRELEASED.md',
  'docs/roadmap/p17-018-r5d-clean-clone-qualification-plan.md',
  'package.json',
  'providers/README.md',
  'release/public-release-manifest.json',
  'scripts/nightly-workflow-contract.test.ts',
  'scripts/nightly-workflow-contract.ts',
  'scripts/post-17-public-release-r5d-plan.test.ts',
  'scripts/public-release-history-contract.test.ts',
  'scripts/public-release-operational-alias-contract.test.ts',
  'scripts/public-source-readiness-contract.ts',
  'scripts/public-source-readiness-docs.test.ts',
  'scripts/release-clean-clone-contract.test.ts',
  'scripts/release-clean-clone-contract.ts',
  'scripts/release-clean-clone-node.test.ts',
  'scripts/release-clean-clone-node.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r5d-clean-clone-qualification-2026-08-19.md',
  'release/public-release-manifest.json',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R5D — Clean-Clone Cross-Platform Qualification',
  '## Outcome and delivery boundary',
  '## Reconciled starting state',
  '## Locked R5D decisions',
  '### C1 — Bind every qualification to one committed source identity',
  '### P1 — Qualify native Windows and GitHub-hosted Linux',
  '### I1 — Use two physically isolated installs per platform',
  '### D1 — Require byte-identical admitted outputs',
  '### R1 — Re-run extracted runtime smokes from each clone',
  '### B1 — Prove the documented quickstart and browser surface honestly',
  '### E1 — Bind receipts, CI, evidence, and rollback',
  '## Committed-clone execution contract',
  '## Qualification receipt and aggregation',
  '## Quickstart and browser evidence boundary',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and stop conditions',
  '## Deferred beyond R5D',
]) assert.ok(plan.includes(heading), `missing R5D plan heading: ${heading}`)

for (const phrase of [
  'scope=R5D, source=C1, platforms=P1, install=I1, determinism=D1, runtime=R1, browser=B1, evidence=E1',
  'b35406978e581060eb4c240ea9272ac848878cc3',
  'git clone --local --no-hardlinks',
  'npm ci',
  'npm run build:providers',
  'npm run test:provider-distribution',
  'two physically distinct node_modules trees',
  'eleven checksummed outputs',
  'three ZIP archives, 71 entries, eight SBOM sidecars, 11 checksums, 79 text scans, and 15 extracted runtime smokes',
  'Linux and Windows',
  '3.25.0 / v3.25 / 0.5.0 / 1.3.0',
  'no junction',
  'no new dependency',
  'in-app browser',
  'R5D does not authorize a tag, release, publication, package upload, marketplace submission, sync, target edit, or visibility change',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R5D plan contract: ${phrase}`)

for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R5D source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R5D evidence manifest path: ${evidencePath}`)
}
assert.ok(plan.includes(`\`${manifestIdentity(expectedSourcePaths)}\``), 'missing R5D source path-manifest digest')
assert.ok(plan.includes(`\`${manifestIdentity(expectedEvidencePaths)}\``), 'missing R5D evidence path-manifest digest')
assert.match(predecessorPlan, /R5D owns clean-clone Windows and Linux qualification/)
assert.match(workflow, /name: Workflow Kit CI/)
assert.doesNotMatch(normalized, /(?:tag|release|publication|visibility) (?:was|is) completed/i)

console.log('post-17-public-release-r5d-plan.test: PASS (C1/P1/I1/D1/R1/B1/E1 locked)')
