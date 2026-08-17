import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r3a-governance-surface-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r3a-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r3a-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R3A public governance surface plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R3A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const expectedSourcePaths = [
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/pull_request_template.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'README.md',
  'SECURITY.md',
  'SUPPORT.md',
  'docs/roadmap/p17-018-r3a-governance-surface-plan.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-public-release-r3a-plan.test.ts',
  'scripts/public-entry-contract.test.ts',
  'scripts/public-governance-contract.test.ts',
  'scripts/public-release-contract-node.test.ts',
] as const

for (const heading of [
  '# P17-018 R3A — Public Governance Surface Plan',
  '## Reconciled starting state',
  '## Scope and non-goals',
  '## Locked R3A decisions',
  '### G1 — Contribution guidance owns the development contract',
  '### S1 — Security reporting is private and non-secret',
  '### U1 — Support routing is explicit and carries no SLA',
  '### C1 — Community conduct is versioned and attributed',
  '### T1 — Issue and pull request templates collect bounded evidence',
  '### L1 — README routes to one canonical owner per policy',
  '### E1 — Evidence remains separate from policy',
  '## Document ownership and link graph',
  '## Governance contract matrix',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) {
  assert.ok(plan.includes(heading), `missing R3A plan heading: ${heading}`)
}

for (const phrase of [
  'slice=R3A, governance=G1, security=S1, support=U1, community=C1, templates=T1, links=L1, evidence=E1',
  'CONTRIBUTING.md owns development setup, architecture boundaries, plan readiness, test ladders, generated files, and contribution evidence',
  'SECURITY.md owns supported-version status, GitHub private vulnerability reporting, safe-harbor language, best-effort response targets, and disclosure coordination',
  'SUPPORT.md owns questions, bugs, security routing, required reproduction evidence, unsupported use cases, and the no-SLA boundary',
  'CODE_OF_CONDUCT.md is explicitly versioned and attributed to Contributor Covenant 2.1',
  'issue forms collect version, provider, operating system, Node version, reproduction, expected and actual behavior, and sanitized evidence',
  'the pull request template requires a plan or task, scope, tests and evidence, generated drift, security impact, compatibility, and external writes',
  'no personal or internal corporate email address is a reporting path',
  'CODEOWNERS remains absent until stable public maintainer identities are approved',
  'README links are repository-relative and resolve to the canonical policy owners',
  'changelog and release notes remain deferred to R3B',
  'all 31 unresolved marker dispositions remain deferred',
  'TypeScript and Node remain the measured implementation choice',
  'no network, credential, database, provider execution, sync, publish, release, tag, visibility, or merge side effect',
  'restore the affected repository from today\'s verified snapshot',
]) {
  assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R3A plan contract: ${phrase}`)
}

assert.match(parentPlan, /Add governance\/support\/security\/community files and current changelog\/release notes/)
for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R3A source manifest path: ${sourcePath}`)
}
assert.doesNotMatch(normalized, /repository (?:is|was) public/i)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)

console.log('post-17-public-release-r3a-plan.test: PASS (G1/S1/U1/C1/T1/L1/E1 locked)')
