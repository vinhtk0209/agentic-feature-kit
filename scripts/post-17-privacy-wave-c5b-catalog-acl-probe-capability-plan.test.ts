import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-catalog-acl-probe-capability-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c5b-preflight-snapshot-contract-plan.md')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const planCommand = 'test:post-17-privacy-wave-c5b-catalog-acl-probe-capability-plan'
const runtimeCommand = 'test:privacy-c5b-catalog-acl-probe-node'
const gaps: string[] = []

if (!fs.existsSync(planPath)) gaps.push('C5B catalog/ACL probe capability plan')
if (!fs.existsSync(parentPlanPath)) gaps.push('C5B preflight parent plan')
if (packageJson.scripts[planCommand] !== 'npx tsx scripts/post-17-privacy-wave-c5b-catalog-acl-probe-capability-plan.test.ts') {
  gaps.push('focused plan registration')
}
if (packageJson.scripts[runtimeCommand] !== 'npx tsx packages/core/test/live-cutover-catalog-acl-probe-node.test.ts') {
  gaps.push('focused runtime registration')
}
if (!packageJson.scripts['test:kit']?.includes(`npm run ${planCommand}`)) gaps.push('full kit plan registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${runtimeCommand}`)) gaps.push('full kit runtime registration')
if (packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${planCommand}`)) {
  gaps.push('local infrastructure plan entered workspace registration')
}
const syncedCore = fs.readFileSync(path.join(root, 'scripts', 'build-synced-core.ts'), 'utf8')
if (!syncedCore.includes("'live-cutover-catalog-acl-probe-node.ts'")) gaps.push('synced-core registration')
assert.deepEqual(gaps, [], `C5B catalog/ACL probe readiness gaps: ${gaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const heading of [
  '## Context',
  '## Decision',
  '### A1 — Trust-separated observation port',
  '### R1 — Exact scalar rowset contract',
  '### H1 — Deterministic domain hashing',
  '### V1 — Server and source expectation binding',
  '### B1 — Bounded abortable capture',
  '### S1 — Single-use packet binding',
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
]) assert.ok(plan.includes(heading), `C5B catalog/ACL probe plan missing section: ${heading}`)

for (const decision of [
  'boundary=A1',
  'rows=R1',
  'hashing=H1',
  'version=V1',
  'bounds=B1',
  'replay=S1',
  'integration=O1',
  'result=M1',
  'runtime=N1',
]) assert.ok(normalized.includes(decision), `C5B catalog/ACL probe plan missing decision ${decision}`)

for (const sourcePath of [
  'docs/roadmap/p17-016-wave-c5b-catalog-acl-probe-capability-plan.md',
  'docs/schemas/p17-016-c5b-preflight-snapshot.schema.json',
  'packages/core/src/live-cutover-catalog-acl-probe-node.ts',
  'packages/core/test/live-cutover-catalog-acl-probe-node.test.ts',
  'packages/core/src/live-cutover-preflight.ts',
  'packages/core/test/live-cutover-preflight.test.ts',
  'packages/core/test/live-cutover-preflight-operator.test.ts',
  'packages/core/test/live-cutover-logical-backup-node.test.ts',
  '.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts',
  '.claude/integrations/core/live-cutover-preflight.ts',
  'scripts/post-17-privacy-wave-c5b-catalog-acl-probe-capability-plan.test.ts',
  'scripts/build-synced-core.ts',
  'package.json',
  'release/public-release-manifest.json',
]) assert.ok(plan.includes(`\`${sourcePath}\``), `C5B catalog/ACL probe plan missing source path: ${sourcePath}`)

for (const phrase of [
  'fixed metadata domains',
  'no arbitrary SQL',
  'exact own enumerable data properties',
  'scalar values only',
  'canonical UTF-8 JSON',
  'domain-separated SHA-256',
  'duplicate canonical row',
  'expected server version',
  'source expectation hashes',
  'bounded AbortSignal',
  'single use',
  'inside the freeze window',
  'metadata-only',
  'raw row values never cross',
  'catalog drift stops before writer freeze',
  'writer activity is observed but zero is enforced after freeze',
  'live C5B remains incomplete',
  'no measured threshold breach',
]) assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5B catalog/ACL probe plan missing contract: ${phrase}`)

for (const attack of [
  'invalid configuration',
  'invalid context',
  'wrong next operation',
  'concurrent replay',
  'sequential replay',
  'source exception',
  'timeout',
  'aborted signal',
  'accessor property',
  'symbol property',
  'hostile proxy',
  'unknown domain',
  'unknown field',
  'nested value',
  'non-finite number',
  'oversized row',
  'oversized rowset',
  'duplicate canonical row',
  'row-order permutation',
  'server version mismatch',
  'source expectation drift',
  'invalid observation time',
  'raw metadata leakage',
  'provider error leakage',
]) assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5B catalog/ACL probe plan missing attack: ${attack}`)

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
  assert.match(controls[index], privacyPatterns[index], `C5B catalog/ACL probe privacy positive control ${index} failed`)
  privacyPatterns[index].lastIndex = 0
  assert.doesNotMatch(plan, privacyPatterns[index], 'C5B catalog/ACL probe plan contains prohibited identity or credential material')
}

const affirmativeSurface = normalized.split('## Non-claims')[0]
for (const forbidden of [
  /live C5B (?:is|was) complete/i,
  /named project (?:is|was) matched/i,
  /live catalog (?:is|was) probed/i,
  /provider query adapter (?:is|was) configured/i,
  /P17-016 (?:is|was) complete/i,
]) assert.doesNotMatch(affirmativeSurface, forbidden, `C5B catalog/ACL probe plan contains premature claim: ${forbidden}`)

console.log('P17-016 C5B catalog/ACL probe capability plan: PASS (A1/R1/H1/V1/B1/S1/O1/M1/N1 locked)')
