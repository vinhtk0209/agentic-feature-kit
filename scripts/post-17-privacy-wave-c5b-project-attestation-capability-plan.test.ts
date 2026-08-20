import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-project-attestation-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-project-attestation-capability-plan'
const runtimeCommand = 'test:privacy-c5b-project-attestation-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B project-attestation capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B preflight parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-project-attestation-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-project-attestation-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
const syncedCore = fs.readFileSync(path.join(root, 'scripts', 'build-synced-core.ts'), 'utf8')
if (!syncedCore.includes("'live-cutover-project-attestation-node.ts'")) gaps.push('synced-core registration')
assert.deepEqual(gaps, [], `C5B project-attestation readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Trust-separated capability boundary',
  '### E1 — Ephemeral identity ownership',
  '### B1 — Bounded abortable resolution',
  '### I1 — Exact identity and environment match',
  '### R1 — Single-use packet binding',
  '### T1 — Attestation-time receipt',
  '### O1 — Operator fail-closed integration',
  '### M1 — Metadata-only result',
  '### N1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B project-attestation plan missing section: ${heading}`)

for (const decision of [
  'boundary=A1',
  'identity=E1',
  'timeout=B1',
  'match=I1',
  'replay=R1',
  'receipt=T1',
  'integration=O1',
  'result=M1',
  'runtime=N1',
]) assert.ok(normalized.includes(decision), `C5B project-attestation plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-project-attestation-capability-plan.md',
  'docs/schemas/p17-016-c5b-preflight-snapshot.schema.json',
  'packages/core/src/live-cutover-project-attestation-node.ts',
  'packages/core/test/live-cutover-project-attestation-node.test.ts',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/test/live-cutover-preflight.test.ts',
  'packages/core/test/live-cutover-preflight-operator.test.ts',
  'packages/core/test/live-cutover-logical-backup-node.test.ts',
  '.claude/integrations/core/live-cutover-project-attestation-node.ts',
  '.claude/integrations/core/live-cutover-preflight.ts',
  'scripts/post-17-privacy-wave-c5b-project-attestation-capability-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B project-attestation plan missing source path: ${sourcePath}`)

for (const phrase of [
  'distinct approval and observation sources',
  'approved identity never reaches the observation source',
  'observed identity never reaches the approval source',
  'ownership transfers to the adapter',
  'zeroized in a finally block',
  'bounded AbortSignal',
  'single use',
  'timing-safe comparison',
  'exact environment class',
  'attestedAt',
  'inside the freeze window',
  'metadata-only',
  'project mismatch stops before catalog access',
  'raw project identity never crosses',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B project-attestation plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'same source object',
  'same resolver function',
  'invalid context',
  'wrong next operation',
  'concurrent replay',
  'sequential replay',
  'source exception',
  'timeout',
  'aborted signal',
  'empty identity',
  'oversized identity',
  'shared identity buffer',
  'identity mismatch',
  'environment mismatch',
  'invalid attestation time',
  'identity zeroization',
  'raw identity leakage',
  'provider error leakage',
  'forged attestedAt',
  'later port after mismatch',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B project-attestation plan missing attack: ${attack}`)

const privacyPatterns = [
  /supabase\.com\/dashboard\/project\/[a-z0-9]+/gi,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /(?:PGPASSWORD|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*\S{16,}/g,
]
const controls = [
  `https://supabase.com/dashboard/project/${'a'.repeat(20)}`,
  `https://${'a'.repeat(20)}.supabase.co`,
  `eyJ${'A'.repeat(24)}.${'B'.repeat(12)}.${'C'.repeat(12)}`,
  `sb_secret_${'A'.repeat(20)}`,
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ['PGPASSWORD', '=', 'A'.repeat(20)].join(''),
]
for (let index = 0; index < privacyPatterns.length; index += 1) {
  assert.match(controls[index], privacyPatterns[index], `C5B project-attestation privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B project-attestation plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /named project (?:is|was) matched/i,
  /provider identity source (?:is|was) configured/i,
  /project credentials (?:are|were) proven/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B project-attestation plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B project-attestation capability plan: PASS (A1/E1/B1/I1/R1/T1/O1/M1/N1 locked)')
