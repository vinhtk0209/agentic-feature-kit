import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-executable-capability-qualification-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-logical-backup-adapter-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-executable-capability-plan'
const runtimeCommand = 'test:privacy-c5b-executable-capability-node'
const parentRuntimeCommand = 'test:privacy-c5b-logical-backup-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B executable-capability qualification plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B logical-backup parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-executable-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-executable-qualification-node.test.ts') {
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
assert.deepEqual(gaps, [], `C5B executable-capability readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Infrastructure qualification boundary',
  '### B1 — Exact byte and provenance binding',
  '### V1 — Strict version and tool-family compatibility',
  '### P1 — Canonical path and file identity',
  '### E1 — Enumerated non-mutating probes',
  '### F1 — Fresh in-memory capability',
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
]) assert.ok(plan.includes(heading), `C5B executable-capability plan missing section: ${heading}`)

for (const decision of [
  'qualification=A1',
  'bytes=B1',
  'versions=V1',
  'paths=P1',
  'probes=E1',
  'freshness=F1',
  'integration=I1',
  'result=M1',
  'runtime=T1',
]) assert.ok(normalized.includes(decision), `C5B executable-capability plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-executable-capability-qualification-plan.md',
  'packages/core/src/live-cutover-executable-qualification-node.ts',
  'packages/core/test/live-cutover-executable-qualification-node.test.ts',
  'packages/core/src/live-cutover-logical-backup-node.ts',
  'packages/core/test/live-cutover-logical-backup-node.test.ts',
  '.claude/integrations/core/live-cutover-executable-qualification-node.ts',
  '.claude/integrations/core/live-cutover-logical-backup-node.ts',
  'scripts/post-17-privacy-wave-c5b-executable-capability-plan.test.ts',
  'scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B executable-capability plan missing source path: ${sourcePath}`)

for (const phrase of [
  'exact SHA-256',
  'externally verified provenance receipt',
  'provenance receipt digest',
  'pg_dump --version',
  'pg_restore --version',
  'age --version',
  'same exact PostgreSQL release',
  'stable age semantic version',
  'shell:false',
  'fixed argv',
  'sanitized environment',
  'bounded output',
  'bounded timeout',
  'pre-probe and post-probe hashes',
  'canonical regular file',
  'symlink, junction, or reparse point',
  'in-memory unforgeable capability',
  'short-lived',
  'revalidated before each logical-backup port',
  'metadata-only',
  'raw process errors never cross',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B executable-capability plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'path alias',
  'symlink',
  'reparse point',
  'missing executable',
  'oversized executable',
  'executable digest mismatch',
  'missing provenance receipt',
  'provenance digest mismatch',
  'wrong PostgreSQL version',
  'mismatched pg_dump and pg_restore versions',
  'development age version',
  'version-output injection',
  'timeout',
  'output cap',
  'non-zero exit',
  'signal termination',
  'environment leakage',
  'executable replacement',
  'forged capability',
  'stale capability',
  'cross-configuration reuse',
  'raw stderr',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B executable-capability plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B executable-capability privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B executable-capability plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /supply-chain authenticity (?:is|was) proven/i,
  /provider recovery point (?:is|was) created/i,
  /live logical backup (?:is|was) created/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B executable-capability plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B executable-capability plan: PASS (A1/B1/V1/P1/E1/F1/I1/M1/T1 locked)')
