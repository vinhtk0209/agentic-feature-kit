import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-connection-material-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-executable-capability-qualification-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-connection-material-capability-plan'
const runtimeCommand = 'test:privacy-c5b-connection-material-capability-node'
const parentRuntimeCommand = 'test:privacy-c5b-logical-backup-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B connection-material capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B executable-capability parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-connection-material-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-connection-material-qualification-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts[parentRuntimeCommand]?.includes(`npm run ${planCommand}`)
  || !packageJson.scripts[parentRuntimeCommand]?.includes(`npm run ${runtimeCommand}`)
  || !packageJson.scripts[parentRuntimeCommand]?.includes('npx tsx packages/core/test/live-cutover-logical-backup-node.test.ts')) {
  gaps.push('parent logical-backup registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${parentRuntimeCommand}`)) gaps.push('full kit parent registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
assert.deepEqual(gaps, [], `C5B connection-material readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Infrastructure qualification boundary',
  '### F1 — Exact file and directory binding',
  '### S1 — Closed libpq service selection',
  '### C1 — Credential-file boundary',
  '### E1 — Age recipient and identity binding',
  '### N1 — Sanitized per-process environments',
  '### R1 — Fresh in-memory capability',
  '### I1 — Logical-backup adapter integration',
  '### M1 — Metadata-only result',
  '### T1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B connection-material plan missing section: ${heading}`)

for (const decision of [
  'qualification=A1',
  'files=F1',
  'services=S1',
  'credentials=C1',
  'encryption=E1',
  'environment=N1',
  'freshness=R1',
  'integration=I1',
  'result=M1',
  'runtime=T1',
]) assert.ok(normalized.includes(decision), `C5B connection-material plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-connection-material-capability-plan.md',
  'packages/core/src/live-cutover-connection-material-qualification-node.ts',
  'packages/core/test/live-cutover-connection-material-qualification-node.test.ts',
  'packages/core/src/live-cutover-logical-backup-node.ts',
  'packages/core/test/live-cutover-logical-backup-node.test.ts',
  '.claude/integrations/core/live-cutover-connection-material-qualification-node.ts',
  '.claude/integrations/core/live-cutover-logical-backup-node.ts',
  'scripts/post-17-privacy-wave-c5b-connection-material-capability-plan.test.ts',
  'scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B connection-material plan missing source path: ${sourcePath}`)

for (const phrase of [
  'PGSERVICEFILE',
  'PGPASSFILE',
  'source and isolated service names',
  'password and passfile overrides',
  'exact SHA-256',
  'canonical regular file',
  'canonical destination directory',
  'symlink, junction, or reparse point',
  'age recipient file',
  'age identity file',
  'fixed argv',
  'shell:false',
  'per-process environment',
  'ambient PostgreSQL variables',
  'SystemRoot and WINDIR',
  'in-memory unforgeable capability',
  'short-lived',
  'revalidated before each logical-backup port',
  'metadata-only',
  'raw file contents never cross',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B connection-material plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'path alias',
  'symlink',
  'reparse point',
  'missing file',
  'empty file',
  'oversized file',
  'digest mismatch',
  'duplicate path',
  'service name collision',
  'missing service section',
  'duplicate service section',
  'password override',
  'passfile override',
  'service recursion',
  'wildcard credential entry',
  'recipient injection',
  'identity format mismatch',
  'environment leakage',
  'file replacement',
  'forged capability',
  'stale capability',
  'cross-configuration reuse',
  'raw credential',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B connection-material plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B connection-material privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B connection-material plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /credential protection (?:is|was) proven/i,
  /named project (?:is|was) matched/i,
  /live logical backup (?:is|was) created/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B connection-material plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B connection-material capability plan: PASS (A1/F1/S1/C1/E1/N1/R1/I1/M1/T1 locked)')
