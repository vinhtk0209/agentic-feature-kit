import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-operator-application-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-operator-plan'
const runtimeCommand = 'test:privacy-c5b-operator'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B operator application plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B parent contract plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-operator-application-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-preflight-operator.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local application plan entered workspace registration')
}
assert.deepEqual(gaps, [], `C5B operator application readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Application service boundary',
  '### G1 — Core-owned incremental gate',
  '### P1 — Narrow typed ports',
  '### C1 — Exact compensation',
  '### R1 — Closed operator result',
  '### T1 — TypeScript threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B operator plan missing section: ${heading}`)

for (const decision of [
  'application=A1',
  'gate=G1',
  'ports=P1',
  'compensation=C1',
  'result=R1',
  'runtime=T1',
]) assert.ok(normalized.includes(decision), `C5B operator plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-operator-application-plan.md',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/test/live-cutover-preflight.test.ts',
  'packages/core/src/live-cutover-preflight-operator.ts',
  'packages/core/test/live-cutover-preflight-operator.test.ts',
  '.claude/integrations/core/live-cutover-preflight.ts',
  '.claude/integrations/core/live-cutover-preflight-operator.ts',
  'scripts/post-17-privacy-wave-c5b-operator-application-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B operator plan missing source path: ${sourcePath}`)

for (const phrase of [
  'not a provider adapter',
  'core owns success semantics',
  'incremental prefix gate',
  'project mismatch stops before catalog access',
  'exactly once and in canonical order',
  'first refusal stops later ports',
  'project identity remains inside a configured port closure',
  'metadata-only',
  'cleanup only after an isolated restore attempt',
  'never retry the same cleanup operation under one attempt',
  'unfreeze writers exactly once after a successful freeze',
  'provider errors collapse to a closed reason code',
  'no arbitrary SQL or shell input',
  'fake ports',
  'byte-identical',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B operator plan missing contract: ${phrase}`)

for (const attack of [
  'invalid packet',
  'project mismatch',
  'later port after refusal',
  'wrong operation order',
  'duplicate port call',
  'forged evidence',
  'port exception',
  'non-monotonic clock',
  'cleanup residual',
  'cleanup retry',
  'unfreeze failure',
  'raw provider error',
  'project identity leakage',
  'credential leakage',
  'backup bytes',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B operator plan missing attack: ${attack}`)

const privacyPatterns = [
  /supabase\.com\/dashboard\/project\/[a-z0-9]+/gi,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/gi,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{16,}/g,
]
const controls = [
  `https://supabase.com/dashboard/project/${'a'.repeat(20)}`,
  `https://${'a'.repeat(20)}.supabase.co`,
  `eyJ${'A'.repeat(24)}.${'B'.repeat(12)}.${'C'.repeat(12)}`,
  `sb_secret_${'A'.repeat(20)}`,
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ['SUPABASE_SERVICE_ROLE_KEY', '=', 'A'.repeat(20)].join(''),
]
for (let index = 0; index < privacyPatterns.length; index += 1) {
  assert.match(controls[index], privacyPatterns[index], `C5B operator privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], `C5B operator plan contains prohibited identity or credential material`)
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /provider recovery point (?:is|was) created/i,
  /logical backup (?:is|was) restored/i,
  /writer freeze (?:is|was) active/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B operator plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B operator application plan: PASS (A1/G1/P1/C1/R1/T1 locked)')
