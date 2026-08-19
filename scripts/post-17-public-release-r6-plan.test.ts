import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r6-final-readiness-plan.md')
const predecessorPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5d-clean-clone-qualification-plan.md')
const packagePath = path.join(root, 'package.json')
const preCommitHookPath = path.join(root, '.githooks', 'pre-commit')
const commandName = 'test:post-17-public-release-r6-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r6-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R6 final readiness reconciliation plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R6 readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const predecessorPlan = fs.readFileSync(predecessorPlanPath, 'utf8')
const preCommitHook = fs.readFileSync(preCommitHookPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const expectedSourcePaths = [
  '.githooks/pre-commit',
  'docs/evidence/post-17-public-release-readiness.md',
  'docs/roadmap/p17-018-public-release-plan.md',
  'docs/roadmap/p17-018-r6-final-readiness-plan.md',
  'docs/roadmap/post-17-roadmap.json',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-plan.test.ts',
  'scripts/post-17-public-release-r6-plan.test.ts',
  'scripts/post-17-roadmap.test.ts',
  'scripts/public-release-readiness-contract.test.ts',
  'scripts/public-release-readiness-contract.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-readiness.md',
  'release/public-release-manifest.json',
] as const
const expectedDashboardPaths = [
  'docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md',
  'scripts/o1-assurance-operator-run.ts',
  'tests/i1-roadmap-probe.test.ts',
  'tests/o1-assurance-operator-contract.test.ts',
  'tests/post17-roadmap.test.ts',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R6 — Final Public-Release Readiness Reconciliation',
  '## Outcome and delivery boundary',
  '## Reconciled starting state',
  '## Locked R6 decisions',
  '### C1 — Require one complete evidence chain',
  '### I1 — Bind completion to immutable identities',
  '### S1 — Make the status transition fail closed',
  '### D1 — Reconcile the dashboard without duplicating authority',
  '### E1 — Create one durable final evidence record',
  '### B1 — Preserve the external-action boundary',
  '## Completion predicate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and stop conditions',
  '## Deferred beyond R6',
]) assert.ok(plan.includes(heading), `missing R6 plan heading: ${heading}`)

for (const phrase of [
  'scope=R6, chain=C1, identity=I1, status=S1, dashboard=D1, evidence=E1, boundary=B1',
  'c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e',
  'P17-018 is the only task whose status may change',
  'ready to done',
  'all dependencies remain done',
  'package.json remains private: true',
  'No public artifact is required or authorized to prove readiness',
  'final evidence path exists and is manifest-admitted',
  'dashboard reads the canonical kit catalog',
  'TypeScript and Node.js',
  'no new dependency',
  'R6 does not authorize a tag, version bump, GitHub Release, visibility change, package publication, marketplace submission, signing, sync, target edit, or database mutation',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R6 plan contract: ${phrase}`)

for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R6 source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R6 evidence manifest path: ${evidencePath}`)
}
for (const dashboardPath of expectedDashboardPaths) {
  assert.ok(plan.includes(`- \`${dashboardPath}\``), `missing R6 dashboard manifest path: ${dashboardPath}`)
}
assert.ok(plan.includes(`\`${manifestIdentity(expectedSourcePaths)}\``), 'missing R6 source path-manifest digest')
assert.ok(plan.includes(`\`${manifestIdentity(expectedEvidencePaths)}\``), 'missing R6 evidence path-manifest digest')
assert.ok(plan.includes(`\`${manifestIdentity(expectedDashboardPaths)}\``), 'missing R6 dashboard path-manifest digest')
assert.match(predecessorPlan, /final P17-018 readiness reconciliation may cite R5D only after/i)
assert.match(preCommitHook, /exec node node_modules\/tsx\/dist\/cli\.mjs scripts\/pre-commit\.ts/)
assert.doesNotMatch(preCommitHook, /exec node_modules\/\.bin\/tsx/)
assert.doesNotMatch(normalized, /(?:repository|package|plugin|bundle) (?:was|is) published/i)

console.log('post-17-public-release-r6-plan.test: PASS (C1/I1/S1/D1/E1/B1 locked)')
