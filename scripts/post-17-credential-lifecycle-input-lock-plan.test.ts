import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-019-a1-credential-lifecycle-input-lock-plan.md')
const roadmapJsonPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const roadmapMarkdownPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md')
const setupPath = path.join(root, '.claude', 'SETUP.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')
const workflowPath = path.join(root, 'bin', 'workflow.ts')

const sourceManifest = [
  '.claude/SETUP.md',
  'docs/roadmap/p17-019-a1-credential-lifecycle-input-lock-plan.md',
  'docs/roadmap/post-17-roadmap.json',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-credential-lifecycle-input-lock-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-019 A1 ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

function assertRoadmapBlocked(task: JsonRecord): void {
  assert.equal(task.id, 'P17-019')
  assert.equal(task.status, 'backlog', 'P17-019 must remain backlog while project inputs are missing')
  assert.equal(task.readiness?.complete, false, 'P17-019 readiness must remain false')
  assert.deepEqual(
    task.readiness?.missing,
    ['project-specific refresh capability fixture and security approval'],
    'P17-019 must retain the exact unresolved input',
  )
  assert.ok(
    task.readiness?.inputs?.includes('docs/roadmap/p17-019-a1-credential-lifecycle-input-lock-plan.md'),
    'P17-019 readiness inputs must register the A1 plan without claiming completion',
  )
}

function assertSetupTruth(setup: string): void {
  const canonicalSetup = setup.replace(/\r?\n>\s?/g, ' ').replace(/\s+/g, ' ')
  assert.match(canonicalSetup, /npm run workflow:login/)
  assert.doesNotMatch(canonicalSetup, /workflow:login` populates all three Playwright tokens automatically/)
  assert.match(canonicalSetup, /does not populate Playwright access, refresh, or expiry credentials/)
  assert.match(canonicalSetup, /project-specific authentication instructions/)
}

const plan = readRequired(planPath, 'plan')
const normalizedPlan = plan.replace(/\r\n/g, '\n')
const canonicalPlan = normalizedPlan.replace(/\s+/g, ' ')
const canonicalPlanLower = canonicalPlan.toLowerCase()
const requiredHeadings = [
  '## Context',
  '## Decision',
  '### B1 — Clean Architecture boundary',
  '### A1 — Project-provided authority only',
  '### O1 — Secret ownership never enters shared core',
  '### E1 — Expiry and refresh triggers are explicit',
  '### R1 — One single-use refresh attempt',
  '### X1 — In-process first; executable adapter is conditional',
  '### C1 — Metadata-only closed receipts',
  '### P1 — Privacy and disclosure stay closed',
  '### L1 — Compatibility is fail-closed',
  '### V1 — Evidence ladder cannot skip live proof',
  '### T1 — TypeScript first with measured reconsideration thresholds',
  '### N1 — A1 locks inputs only',
  '## Boundary state machine',
  '## Options Considered',
  '## Trade-off Analysis',
  '## Consequences',
  '## Input completeness and approval packet',
  '## Verification and attack plan',
  '## Rollback',
  '## Action Items',
  '## Non-claims',
]
for (const heading of requiredHeadings) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  '**Decision lock:** `boundary=B1, authority=A1, ownership=O1, expiry=E1, refresh=R1, execution=X1, receipt=C1, privacy=P1, compatibility=L1, evidence=V1, performance=T1, scope=N1`',
  'ProjectCredentialRefreshCapability',
  'needs_input',
  'expired_mid_run',
  'refresh_not_supported',
  'no transparent interaction replay',
  'one invocation at most',
  'non-serializable capability',
  'direct fixed argv',
  '`shell:false`',
  'built-in generic HTTP refresh',
  'rejected',
  'project-specific refresh capability fixture and security approval',
  'APPROVE P17-019 A2 INPUT-LOCK v1:',
  'https://playwright.dev/docs/auth',
  'https://www.rfc-editor.org/rfc/rfc6749#section-6',
  'https://nodejs.org/api/child_process.html',
  'No refresh runtime, token read, credential write, provider call, browser launch, or target mutation is authorized.',
]) assert.ok(canonicalPlanLower.includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
}

for (const forbiddenClaim of [
  /P17-019 (?:is|becomes) (?:ready|in_progress|done)/i,
  /refresh compatibility (?:is|was) proven/i,
  /Playwright credentials? (?:is|are|was|were) automatically refreshed/i,
  /generic refresh endpoint/i,
]) assert.doesNotMatch(normalizedPlan, forbiddenClaim)

const roadmap = parseRequired(roadmapJsonPath, 'roadmap catalog')
const credentialTask = roadmap.tasks.find((entry: JsonRecord) => entry.id === 'P17-019')
assert.ok(credentialTask, 'P17-019 missing from roadmap')
assertRoadmapBlocked(credentialTask)

const readyAttack = structuredClone(credentialTask)
readyAttack.status = 'ready'
assert.throws(() => assertRoadmapBlocked(readyAttack), /must remain backlog/)
const completeAttack = structuredClone(credentialTask)
completeAttack.readiness.complete = true
assert.throws(() => assertRoadmapBlocked(completeAttack), /must remain false/)
const missingInputAttack = structuredClone(credentialTask)
missingInputAttack.readiness.missing = []
assert.throws(() => assertRoadmapBlocked(missingInputAttack), /retain the exact unresolved input/)

const roadmapMarkdown = readRequired(roadmapMarkdownPath, 'human roadmap')
assert.match(roadmapMarkdown, /\| P17-019 \| P2 \| 4 \| backlog \| Credential lifecycle adapter \|/)
assert.match(roadmapMarkdown, /- \*\*P17-019 \(`B1\/A1\/O1\/E1\/R1\/X1\/C1\/P1\/L1\/V1\/T1\/N1`\):\*\*/)
assert.match(roadmapMarkdown, /P17-019 remains `backlog` with incomplete readiness/)

const setup = readRequired(setupPath, 'setup guide')
assertSetupTruth(setup)
assert.throws(
  () => assertSetupTruth(`${setup}\n> Shortcut: \`npm run workflow:login\` populates all three Playwright tokens automatically.`),
  (error: unknown) => error instanceof assert.AssertionError && error.operator === 'doesNotMatch',
)

const workflow = readRequired(workflowPath, 'workflow login source')
assert.match(workflow, /Enter your \$\{edition\.agent\} license token:/)
assert.match(workflow, /saveConfig\(cfg\)/)
for (const playwrightField of ['PLAYWRIGHT_ACCESS_TOKEN', 'PLAYWRIGHT_REFRESH_TOKEN', 'PLAYWRIGHT_TOKEN_EXPIRES_AT']) {
  assert.equal(workflow.includes(playwrightField), false, `workflow login must not claim or mutate ${playwrightField}`)
}

const packageJson = parseRequired(packagePath, 'package')
assert.equal(
  packageJson.scripts?.['test:post-17-credential-lifecycle-input-lock-plan'],
  'npx tsx scripts/post-17-credential-lifecycle-input-lock-plan.test.ts',
)
assert.ok(
  packageJson.scripts?.['test:kit']?.includes('npm run test:post-17-credential-lifecycle-input-lock-plan'),
  'full kit suite must register the P17-019 A1 validator',
)

const manifest = parseRequired(manifestPath, 'public manifest')
assert.ok(Array.isArray(manifest.entries), 'public manifest entries must be an array')
const manifestPaths = manifest.entries.map((entry: JsonRecord) => entry.path)
assert.equal(new Set(manifestPaths).size, manifestPaths.length, 'public manifest paths must be unique')
assert.deepEqual(manifestPaths, [...manifestPaths].sort(), 'public manifest paths must be JavaScript-ordinal sorted')
for (const publicPath of [
  'docs/roadmap/p17-019-a1-credential-lifecycle-input-lock-plan.md',
  'scripts/post-17-credential-lifecycle-input-lock-plan.test.ts',
]) {
  const matches: JsonRecord[] = manifest.entries.filter((entry: JsonRecord) => entry.path === publicPath)
  assert.equal(matches.length, 1, `public manifest must contain exactly one ${publicPath}`)
  assert.equal(matches[0]?.decision, 'include')
  assert.equal(matches[0]?.contentKind, 'text')
  assert.equal(matches[0]?.reasonCode, 'public-source')
}

console.log(`post-17-credential-lifecycle-input-lock-plan.test: PASS (${sourceManifest.length} source paths, 12 decisions, 3 readiness attacks, 1 documentation regression attack)`)
