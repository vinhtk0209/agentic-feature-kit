import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-isolated-restore-cleanup-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-plan'
const runtimeCommand = 'test:privacy-c5b-isolated-restore-cleanup-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B isolated-restore cleanup capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B preflight parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-isolated-restore-cleanup-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
const syncedCore = fs.readFileSync(path.join(root, 'scripts', 'build-synced-core.ts'), 'utf8')
if (!syncedCore.includes("'live-cutover-isolated-restore-cleanup-node.ts'")) {
  gaps.push('synced-core cleanup runtime registration')
}
assert.deepEqual(gaps, [], `C5B isolated-restore cleanup readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Independent cleanup and residual-observation capabilities',
  '### P1 — Exact seven-receipt admission and single use',
  '### O1 — Attempt-owned opaque cleanup authority',
  '### D1 — One total deadline and trusted chronology',
  '### Z1 — Terminal token custody',
  '### R1 — Independent zero-residual observation',
  '### Q1 — Uncertain-state quarantine and no retry',
  '### M1 — Exact metadata-only cleanup result',
  '### I1 — Operator fail-closed integration',
  '### N1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B isolated-restore cleanup plan missing section: ${heading}`)

for (const decision of [
  'boundary=A1',
  'admission=P1',
  'ownership=O1',
  'deadline=D1',
  'custody=Z1',
  'residual=R1',
  'quarantine=Q1',
  'result=M1',
  'integration=I1',
  'runtime=N1',
]) assert.ok(normalized.includes(decision), `C5B isolated-restore cleanup plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-isolated-restore-cleanup-capability-plan.md',
  'docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md',
  'docs/roadmap/p17-016-wave-c5b-operator-application-plan.md',
  'docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md',
  'docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md',
  'packages/core/src/live-cutover-isolated-restore-cleanup-node.ts',
  'packages/core/test/live-cutover-isolated-restore-cleanup-node.test.ts',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/src/live-cutover-preflight-operator.ts',
  '.claude/integrations/core/live-cutover-isolated-restore-cleanup-node.ts',
  'scripts/post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B isolated-restore cleanup plan missing source path: ${sourcePath}`)

for (const phrase of [
  'independent cleanup and residual-observation capabilities',
  'exact next operation is cleanup_isolated_restore',
  'exact seven-receipt prefix',
  'factory-wide single use',
  'attempt-owned opaque cleanup authority',
  'cannot choose a resource identifier',
  'bound to the attempt, packet, backup, and restore manifest',
  'one total AbortSignal deadline',
  'terminally zeroized',
  'separately controlled residual observation',
  'residualResourceCount=0 only after independent observation',
  'quarantines the factory',
  'no retry under the same attempt',
  'metadata-only',
  'successful cleanup reaches only writer unfreeze',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B isolated-restore cleanup plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'aliased cleanup and observation capability',
  'invalid context',
  'wrong next operation',
  'missing verification receipt',
  'concurrent replay',
  'sequential replay',
  'accessor property',
  'symbol property',
  'hostile proxy',
  'oversized token',
  'attempt binding mismatch',
  'packet binding mismatch',
  'backup binding mismatch',
  'restore-manifest binding mismatch',
  'cleanup capability mismatch',
  'cleanup refusal',
  'residual resource',
  'timeout',
  'aborted signal',
  'late settlement',
  'clock rollback',
  'provider error leakage',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B isolated-restore cleanup plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B cleanup privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B cleanup plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /isolated restore (?:is|was) cleaned/i,
  /writers (?:are|were) unfrozen/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B cleanup plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B isolated-restore cleanup capability plan: PASS (A1/P1/O1/D1/Z1/R1/Q1/M1/I1/N1 locked)')
