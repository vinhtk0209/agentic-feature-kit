import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-logical-backup-adapter-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-operator-application-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-logical-backup-plan'
const runtimeCommand = 'test:privacy-c5b-logical-backup-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B logical-backup adapter plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B operator parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npm run test:post-17-privacy-wave-c5b-executable-capability-plan && npm run test:privacy-c5b-executable-capability-node && npx tsx packages/core/test/live-cutover-logical-backup-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
assert.deepEqual(gaps, [], `C5B logical-backup adapter readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Infrastructure adapter boundary',
  '### P1 — Fixed two-process pipelines',
  '### E1 — Streaming authenticated encryption',
  '### S1 — Protected attempt-scoped storage',
  '### R1 — Isolated restore binding',
  '### C1 — Closed failure cleanup',
  '### M1 — Metadata-only result',
  '### T1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B logical-backup plan missing section: ${heading}`)

for (const decision of [
  'adapter=A1',
  'pipeline=P1',
  'encryption=E1',
  'storage=S1',
  'restore=R1',
  'cleanup=C1',
  'result=M1',
  'runtime=T1',
]) assert.ok(normalized.includes(decision), `C5B logical-backup plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md',
  'packages/core/src/live-cutover-logical-backup-node.ts',
  'packages/core/test/live-cutover-logical-backup-node.test.ts',
  '.claude/integrations/core/live-cutover-logical-backup-node.ts',
  'scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B logical-backup plan missing source path: ${sourcePath}`)

for (const phrase of [
  'not a provider recovery-point adapter',
  'shell:false',
  'fixed argv',
  'pg_dump',
  'pg_restore',
  'age',
  'no plaintext backup at rest',
  'no connection string in argv',
  'service capability',
  'bounded output',
  'bounded timeout',
  'source-to-encrypt pipeline',
  'decrypt-to-restore pipeline',
  'attempt-scoped',
  'metadata-only',
  'raw process errors never cross',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B logical-backup plan missing contract: ${phrase}`)

for (const attack of [
  'invalid context',
  'wrong destination capability',
  'wrong operation prefix',
  'shell injection',
  'argument injection',
  'connection-string leakage',
  'credential leakage',
  'timeout',
  'output cap',
  'source failure',
  'sink failure',
  'partial artifact',
  'artifact collision',
  'backup size limit',
  'backup hash mismatch',
  'manifest mismatch',
  'cross-attempt restore',
  'double restore',
  'raw stderr',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B logical-backup plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B logical-backup privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B logical-backup plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /provider recovery point (?:is|was) created/i,
  /live logical backup (?:is|was) created/i,
  /isolated live restore (?:is|was) completed/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B logical-backup plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B logical-backup adapter plan: PASS (A1/P1/E1/S1/R1/C1/M1/T1 locked)')
