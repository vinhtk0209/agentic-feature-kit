import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-provider-recovery-point-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-provider-recovery-point-capability-plan'
const runtimeCommand = 'test:privacy-c5b-provider-recovery-point-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B provider-recovery-point capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B preflight parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-provider-recovery-point-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-provider-recovery-point-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
const syncedCore = fs.readFileSync(path.join(root, 'scripts', 'build-synced-core.ts'), 'utf8')
if (!syncedCore.includes("'live-cutover-provider-recovery-point-node.ts'")) gaps.push('synced-core registration')
assert.deepEqual(gaps, [], `C5B provider-recovery readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Trust-separated creation and observation ports',
  '### P1 — Freeze-bound packet admission and single use',
  '### B1 — Bounded abortable creation and trusted chronology',
  '### R1 — Independently verified restorable recovery point',
  '### L1 — Opaque correlation ownership and zeroization',
  '### Q1 — Uncertain-state quarantine without destructive compensation',
  '### M1 — Canonical metadata-only result',
  '### O1 — Operator fail-closed integration',
  '### N1 — TypeScript and Node threshold',
  '## Options considered',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Failure and rollback behavior',
  '## External capability boundary',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B provider-recovery plan missing section: ${heading}`)

for (const decision of [
  'boundary=A1',
  'binding=P1',
  'bounds=B1',
  'recovery=R1',
  'lifecycle=L1',
  'quarantine=Q1',
  'result=M1',
  'integration=O1',
  'runtime=N1',
]) assert.ok(normalized.includes(decision), `C5B provider-recovery plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-provider-recovery-point-capability-plan.md',
  'docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md',
  'docs/roadmap/p17-016-wave-c5-live-cutover-plan.md',
  'docs/schemas/p17-016-c5b-preflight-snapshot.schema.json',
  'packages/core/src/live-cutover-provider-recovery-point-node.ts',
  'packages/core/test/live-cutover-provider-recovery-point-node.test.ts',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/src/live-cutover-preflight-operator.ts',
  'packages/core/src/live-cutover-writer-freeze-node.ts',
  'packages/core/test/live-cutover-writer-freeze-node.test.ts',
  '.claude/integrations/core/live-cutover-provider-recovery-point-node.ts',
  'scripts/post-17-privacy-wave-c5b-provider-recovery-point-capability-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B provider-recovery plan missing source path: ${sourcePath}`)

for (const phrase of [
  'independent creation and observation sources',
  'exact next operation is create_provider_recovery_point',
  'writer freeze receipt',
  'single use',
  'bounded AbortSignal',
  'created after writer freeze',
  'minimum and maximum retention',
  'restorable recovery point',
  'opaque correlation bytes remain in memory only',
  'zeroized after observation or refusal',
  'canonical metadata hash',
  'quarantines the factory',
  'never deletes or expires a recovery point automatically',
  'metadata-only',
  'provider error text never crosses',
  'successful recovery reaches only create_encrypted_logical_backup',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B provider-recovery plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'aliased creation and observation source',
  'invalid context',
  'wrong next operation',
  'missing freeze receipt',
  'concurrent replay',
  'sequential replay',
  'creation exception',
  'observation exception',
  'timeout',
  'aborted signal',
  'late settlement',
  'accessor property',
  'symbol property',
  'hostile proxy',
  'oversized correlation token',
  'attempt binding mismatch',
  'packet binding mismatch',
  'capability mismatch',
  'not restorable',
  'expiry outside retention bounds',
  'clock rollback',
  'raw correlation leakage',
  'provider error leakage',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B provider-recovery plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B provider-recovery privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B provider-recovery plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /named project (?:is|was) matched/i,
  /writer freeze (?:is|was) active/i,
  /provider recovery point (?:is|was) created/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B provider-recovery plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B provider-recovery-point capability plan: PASS (A1/P1/B1/R1/L1/Q1/M1/O1/N1 locked)')
