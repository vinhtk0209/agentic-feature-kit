import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5-live-cutover-plan.md')
const packagePath = path.join(root, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const command = 'test:post-17-privacy-wave-c5b-preflight-snapshot-plan'
const expectedCommand = 'npx tsx scripts/post-17-privacy-wave-c5b-preflight-snapshot-plan.test.ts'
const runtimeCommand = 'test:privacy-c5b-preflight-snapshot'
const expectedRuntimeCommand = 'npx tsx packages/core/test/live-cutover-preflight.test.ts'

const gaps: string[] = []
if (!fs.existsSync(planPath)) gaps.push('C5B local preflight/snapshot contract plan')
if (packageJson.scripts[command] !== expectedCommand) gaps.push('focused plan registration')
if (packageJson.scripts[runtimeCommand] !== expectedRuntimeCommand) gaps.push('canonical runtime test registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${command}`)) gaps.push('pure plan entered workspace registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${command}`)) gaps.push('full kit registration')
if (!packageJson.scripts['test:workspace-contracts']?.includes('npm run test:post-17-privacy-wave-c5-live-cutover-plan')) {
  gaps.push('parent C5A workspace registration')
}
assert.deepEqual(gaps, [], `C5B local contract readiness gaps: ${gaps.join(', ')}`)

assert.ok(fs.existsSync(parentPlanPath), 'C5B parent plan is missing')
const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome',
  '## Reconciled authority and dependency state',
  '## Requirements and constraints',
  '## Decisions',
  '### B1 — Clean Architecture boundary',
  '### P1 — Ephemeral project attestation',
  '### O1 — Ordered enumerated operations',
  '### R1 — Metadata-only receipts',
  '### F1 — Fail-closed completion',
  '### S1 — Language-neutral schema',
  '### T1 — TypeScript implementation threshold',
  '## Options considered',
  '## Contract model',
  '## Attack and test strategy',
  '## Implementation sequence',
  '## Exact source manifest',
  '## External input boundary',
  '## Failure and rollback behavior',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `C5B plan missing section: ${heading}`)

for (const decision of ['boundary=B1', 'project=P1', 'operations=O1', 'receipt=R1', 'failure=F1', 'schema=S1', 'runtime=T1']) {
  assert.ok(normalized.includes(decision), `C5B plan missing decision ${decision}`)
}

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md',
  'docs/schemas/p17-016-c5b-preflight-snapshot.schema.json',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/test/live-cutover-preflight.test.ts',
  '.claude/integrations/core/live-cutover-preflight.ts',
  'scripts/post-17-privacy-wave-c5b-preflight-snapshot-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B plan missing source path: ${sourcePath}`)

for (const phrase of [
  'not a substitute for authorized live C5B evidence',
  'project identity remains inside the infrastructure adapter',
  'no project identifier, URL, host, or connection material enters the packet or receipt',
  'attest_project',
  'probe_catalog_acl',
  'freeze_writers',
  'create_provider_recovery_point',
  'create_encrypted_logical_backup',
  'restore_isolated_backup',
  'verify_restored_state',
  'cleanup_isolated_restore',
  'complete_preflight',
  'exactly once and in canonical order',
  'shell:false',
  'backup bytes remain outside source, logs, and evidence',
  'provider recovery point plus encrypted logical backup',
  'source SHA-256 binding',
  'all nine operations must pass',
  'freeze window',
  'bounded output',
  'JSON Schema',
  'Rust, Go, or Python',
  'no measured threshold breach',
  'separate named-project C5B authorization packet',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B plan missing contract: ${phrase}`)

for (const attack of [
  'unknown field',
  'wrong operation order',
  'duplicate operation',
  'project mismatch',
  'stale freeze window',
  'active writer',
  'missing provider recovery point',
  'unencrypted logical backup',
  'backup digest mismatch',
  'restore source mismatch',
  'restored catalog drift',
  'rollback suite failure',
  'cleanup residual',
  'raw provider error',
  'project identity leakage',
  'credential leakage',
  'forged completion hash',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B plan missing attack: ${attack}`)

const roadmap = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean } }>
}
const tasks = new Map(roadmap.tasks.map((task) => [task.id, task]))
assert.deepEqual([tasks.get('P17-016')?.status, tasks.get('P17-016')?.readiness.complete], ['in_progress', true])
assert.deepEqual([tasks.get('P17-014')?.status, tasks.get('P17-014')?.readiness.complete], ['in_progress', true])
assert.deepEqual([tasks.get('P17-021')?.status, tasks.get('P17-021')?.readiness.complete], ['backlog', false])

const projectPatterns = [
  /supabase\.com\/dashboard\/project\/[a-z0-9]+/gi,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/gi,
]
const credentialPatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{16,}/g,
  /bearer\s+[A-Za-z0-9._-]{20,}/gi,
]
const controls = [
  `https://supabase.com/dashboard/project/${'a'.repeat(20)}`,
  `https://${'a'.repeat(20)}.supabase.co`,
  `eyJ${'A'.repeat(24)}.${'B'.repeat(12)}.${'C'.repeat(12)}`,
  `sb_secret_${'A'.repeat(20)}`,
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ['SUPABASE_SERVICE_ROLE_KEY', '=', 'A'.repeat(20)].join(''),
  `Bearer ${'A'.repeat(20)}`,
]
for (let index = 0; index < [...projectPatterns, ...credentialPatterns].length; index += 1) {
  const pattern = [...projectPatterns, ...credentialPatterns][index]
  assert.ok(pattern.test(controls[index]), `C5B privacy positive control ${index} failed`)
  pattern.lastIndex = 0
  assert.doesNotMatch(plan, pattern, `C5B plan contains prohibited identity or credential material: ${pattern}`)
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /provider recovery point (?:is|was) created/i,
  /logical backup (?:is|was) restored/i,
  /writer freeze (?:is|was) active/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B preflight/snapshot contract plan: PASS (B1/P1/O1/R1/F1/S1/T1 locked)')
