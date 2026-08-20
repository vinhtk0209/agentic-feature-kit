import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-restored-state-verification-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-restored-state-verification-capability-plan'
const runtimeCommand = 'test:privacy-c5b-restored-state-verification-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B restored-state verification capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B preflight parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-restored-state-verification-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-restored-state-verification-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
const syncedCore = fs.readFileSync(path.join(root, 'scripts', 'build-synced-core.ts'), 'utf8')
for (const file of [
  'live-cutover-catalog-acl-transcript.ts',
  'live-cutover-restored-state-verification-node.ts',
]) if (!syncedCore.includes(`'${file}'`)) gaps.push(`synced-core registration: ${file}`)
assert.deepEqual(gaps, [], `C5B restored-state verification readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Independent metadata and rollback capabilities',
  '### P1 — Exact six-receipt admission and single use',
  '### H1 — One canonical catalog/ACL transcript',
  '### S1 — Independently observed source binding',
  '### R1 — Closed rollback-suite transcript',
  '### B1 — One bounded deadline and trusted chronology',
  '### Q1 — Uncertain-state quarantine without cleanup ownership',
  '### M1 — Exact metadata-only verification result',
  '### O1 — Operator fail-closed integration',
  '### N1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B restored-state verification plan missing section: ${heading}`)

for (const decision of [
  'boundary=A1',
  'binding=P1',
  'hashing=H1',
  'source=S1',
  'rollback=R1',
  'bounds=B1',
  'quarantine=Q1',
  'result=M1',
  'integration=O1',
  'runtime=N1',
]) assert.ok(normalized.includes(decision), `C5B restored-state verification plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md',
  'docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md',
  'docs/roadmap/p17-016-wave-c5b-catalog-acl-probe-capability-plan.md',
  'docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md',
  'packages/core/src/live-cutover-catalog-acl-transcript.ts',
  'packages/core/src/live-cutover-catalog-acl-probe-node.ts',
  'packages/core/src/live-cutover-restored-state-verification-node.ts',
  'packages/core/test/live-cutover-restored-state-verification-node.test.ts',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/src/live-cutover-preflight-operator.ts',
  '.claude/integrations/core/live-cutover-catalog-acl-transcript.ts',
  '.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts',
  '.claude/integrations/core/live-cutover-restored-state-verification-node.ts',
  'scripts/post-17-privacy-wave-c5b-restored-state-verification-capability-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B restored-state verification plan missing source path: ${sourcePath}`)

for (const phrase of [
  'independent metadata and rollback capabilities',
  'exact next operation is verify_restored_state',
  'exact six-receipt prefix',
  'single use',
  'one canonical catalog/ACL transcript',
  'same domain-separated hash bytes',
  'four independently observed source digests',
  'closed expected rollback test identifiers',
  'bound to the attempt, packet, backup, and restore manifest',
  'one bounded AbortSignal',
  'sourceParity=true only after exact digest comparison',
  'rollbackSuitePassed=true only after every expected test passes',
  'quarantines the factory',
  'does not own isolated cleanup',
  'metadata-only',
  'successful verification reaches only cleanup_isolated_restore',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B restored-state verification plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'aliased metadata and rollback capability',
  'invalid context',
  'wrong next operation',
  'missing restore receipt',
  'concurrent replay',
  'sequential replay',
  'accessor property',
  'symbol property',
  'hostile proxy',
  'oversized metadata',
  'catalog drift',
  'ACL drift',
  'source digest mismatch',
  'duplicate rollback test',
  'missing rollback test',
  'unexpected rollback test',
  'rollback test failure',
  'attempt binding mismatch',
  'packet binding mismatch',
  'backup binding mismatch',
  'restore-manifest binding mismatch',
  'timeout',
  'aborted signal',
  'late settlement',
  'clock rollback',
  'provider error leakage',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B restored-state verification plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B restored-state privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B restored-state plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /restored state (?:is|was) verified/i,
  /rollback suite (?:is|was) passed/i,
  /isolated restore (?:is|was) cleaned/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B restored-state plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B restored-state verification capability plan: PASS (A1/P1/H1/S1/R1/B1/Q1/M1/O1/N1 locked)')
