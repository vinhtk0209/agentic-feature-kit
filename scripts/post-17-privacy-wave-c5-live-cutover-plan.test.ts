import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = process.cwd()
const workspaceRoot = path.resolve(kitRoot, '..')
const dashboardRoot = path.join(workspaceRoot, 'kit-dashboard')
const planPath = path.join(
  kitRoot,
  'docs',
  'roadmap',
  'p17-016-wave-c5-live-cutover-plan.md',
)
const packagePath = path.join(kitRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>
}
const commandName = 'test:post-17-privacy-wave-c5-live-cutover-plan'
const expectedCommand = 'npx tsx scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts'

const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('C5A architecture/readiness plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:workspace-contracts']?.includes(`npm run ${commandName}`)) {
  readinessGaps.push('workspace contract registration')
}
assert.deepEqual(readinessGaps, [], `C5A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')

for (const predecessor of [
  path.join(kitRoot, 'docs', 'design', 'adr-002-privacy-tenant-retention-boundary.md'),
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c-tenant-foundation-plan.md'),
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c4-verification-sink-plan.md'),
  path.join(kitRoot, 'docs', 'evidence', 'post-17-privacy-wave-c4d-disposable-verification-2026-08-16.md'),
  path.join(dashboardRoot, 'docs', 'evidence', 'post-17-privacy-wave-c4d-disposable-verification-2026-08-16.md'),
  path.join(dashboardRoot, 'migrations', '0018_p17_016_tenant_foundation_quarantine.sql'),
  path.join(dashboardRoot, 'migrations', '0019_p17_016_verification_sink.sql'),
  path.join(dashboardRoot, 'docs', 'roadmap', 'p17-016-wave-c3b-tenant-foundation-rollback.sql'),
  path.join(dashboardRoot, 'docs', 'roadmap', 'p17-016-wave-c4b-verification-sink-rollback.sql'),
]) {
  assert.ok(fs.existsSync(predecessor), `missing C5 predecessor ${path.relative(workspaceRoot, predecessor)}`)
}

for (const heading of [
  '## Outcome',
  '## Reconciled starting state',
  '## Constraints and non-functional requirements',
  '## Locked decisions',
  '### P1 — Named project without durable project identity',
  '### S1 — Two-layer rollback-grade snapshot',
  '### M1 — Exact additive migration sequence',
  '### B1 — Explicit bootstrap identities and no automatic legacy mapping',
  '### K1 — Separate externally held keys',
  '### C1 — Expiring tenant-bound credentials',
  '### G1 — Purpose-limited essential-operations grant',
  '### R1 — Server-only route and capability composition',
  '### L1 — Versioned fail-closed legacy cutover',
  '### O1 — Restore-or-continue operator decision',
  '### E1 — Metadata-only evidence ladder',
  '### X1 — C5A is local plan/readiness only',
  '## Options considered',
  '## Execution sequence',
  '### C5A — Plan and executable readiness',
  '### C5B — Authorized live read-only preflight and snapshot',
  '### C5C — Authorized additive migration and bootstrap',
  '### C5D — Authorized server composition and verification canary',
  '### C5E — Versioned legacy cutover and recovery decision',
  '### C5F — Completion audit and dependent-task release',
  '## Input readiness matrix',
  '## External authorization packets',
  '## Failure handling and rollback',
  '## Attack and test strategy',
  '## Architecture and source ownership',
  '## C5A implementation manifest',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing C5A plan section ${heading}`)

for (const decision of [
  'project=P1',
  'snapshot=S1',
  'migration=M1',
  'bootstrap=B1',
  'keys=K1',
  'credential=C1',
  'grant=G1',
  'route=R1',
  'legacy=L1',
  'rollback=O1',
  'evidence=E1',
  'execution=X1',
]) {
  assert.ok(normalized.includes(decision), `C5A plan missing input decision ${decision}`)
}

for (const phrase of [
  'C5A changes planning, validation, package registration, evidence, and handoff only',
  'exact 0018 then 0019',
  'one verified provider recovery point and one encrypted logical backup',
  'restore rehearsal against an isolated database before live apply',
  'SQL Editor history is not a database backup',
  'backup bytes never enter either repository or evidence',
  'operator-provided tenant UUID',
  'auth.uid() is the membership subject; email is never the key',
  'legacy rows remain legacy_unclassified until an explicit mapping passes the sanitizer',
  'attestation and opaque-identifier keys remain separate',
  'key bytes never enter SQL, source, logs, or evidence',
  'P17-019 must be input-complete or a separately accepted C5-scoped credential lifecycle must exist',
  'essential_operations',
  'verification_record',
  'P17-014 server composition boundary',
  'no direct kit-to-Supabase access',
  'no permissive OR dual-read',
  'a mismatch blocks verification and sync eligibility',
  'never restore anonymous legacy writes',
  'no real sync is used as a guard test',
  'P17-016 remains in_progress through C5A',
  'P17-014 is now in_progress under its implementation plan',
  'P17-019 remains input-blocked',
  'separate named-project authorization',
  'no live SQL',
]) {
  assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C5A plan missing contract: ${phrase}`)
}

for (const attack of [
  'wrong project',
  'catalog drift after snapshot',
  'missing logical backup',
  'failed restore rehearsal',
  '0018 succeeds and 0019 fails',
  'email used as tenant or membership identity',
  'automatic legacy-to-bootstrap assignment',
  'key reuse',
  'key-byte leakage',
  'expired or revoked credential',
  'missing or revoked grant',
  'forged tenant',
  'unscoped service-role call',
  'cross-tenant same run',
  'permissive dual-read',
  'mixed-version writer and guard',
  'rollback after a persisted verification row',
  'evidence body or application row leakage',
]) {
  assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C5A plan missing attack: ${attack}`)
}

const roadmap = JSON.parse(
  fs.readFileSync(path.join(kitRoot, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8'),
) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const byId = new Map(roadmap.tasks.map((task) => [task.id, task]))
assert.deepEqual(
  [byId.get('P17-016')?.status, byId.get('P17-016')?.readiness.complete],
  ['in_progress', true],
)
assert.deepEqual(
  [byId.get('P17-014')?.status, byId.get('P17-014')?.readiness.complete],
  ['in_progress', true],
)
assert.deepEqual(
  [byId.get('P17-019')?.status, byId.get('P17-019')?.readiness.complete],
  ['backlog', false],
)

const verificationSource = fs.readFileSync(
  path.join(kitRoot, '.claude', 'integrations', 'record-verify.ts'),
  'utf8',
)
assert.equal(
  (verificationSource.match(/const receipt = createVerificationWriterReceipt\(note\);/g) ?? []).length,
  2,
  'C5A must preserve both default B2B-blocked CLI paths',
)

const identityPatterns = [
  /supabase\.com\/dashboard\/project\/[a-z0-9]+/gi,
  /https:\/\/[a-z0-9]{20}\.supabase\.co/gi,
]
const credentialPatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S{16,}/g,
  /bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /[A-Za-z0-9+/]{256,}={0,2}/g,
]
const identityControls = [
  `https://supabase.com/dashboard/project/${'a'.repeat(20)}`,
  `https://${'a'.repeat(20)}.supabase.co`,
]
const credentialControls = [
  `eyJ${'A'.repeat(24)}.${'B'.repeat(12)}.${'C'.repeat(12)}`,
  `ghp_${'A'.repeat(20)}`,
  `sk-${'A'.repeat(20)}`,
  `sb_${'secret_'}${'A'.repeat(20)}`,
  ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
  ['SUPABASE_SERVICE_ROLE_KEY', '=', 'A'.repeat(20)].join(''),
  `Bearer ${'A'.repeat(20)}`,
  'A'.repeat(300),
]
for (let index = 0; index < identityPatterns.length; index += 1) {
  assert.ok(identityPatterns[index].test(identityControls[index]), `project identity positive control ${index} failed`)
}
for (let index = 0; index < credentialPatterns.length; index += 1) {
  assert.ok(credentialPatterns[index].test(credentialControls[index]), `credential positive control ${index} failed`)
}
for (const pattern of [...identityPatterns, ...credentialPatterns]) {
  pattern.lastIndex = 0
  assert.doesNotMatch(plan, pattern, `C5A plan contains prohibited identity or credential material: ${pattern}`)
}

assert.match(
  plan,
  /\*\*Status:\*\* Authorized under standing continuation authority — C5A plan\/readiness in progress; no external execution/,
)
const affirmativeSurface = normalized
  .replace(/C5A does not claim[^.]*\./gi, '')
  .replace(/no live SQL/gi, '')
for (const forbidden of [
  /live migrations (?:are|were) applied/i,
  /live tenant (?:is|was) bootstrapped/i,
  /server route (?:is|was) available/i,
  /legacy cutover (?:is|was) complete/i,
  /C5 (?:is|was) complete/i,
  /Wave C (?:is|was) complete/i,
  /P17-016 (?:is|was) complete/i,
]) {
  assert.doesNotMatch(affirmativeSurface, forbidden, `C5A plan contains a premature claim: ${forbidden}`)
}

console.log('P17-016 Wave C5A live cutover plan: PASS (P1/S1/M1/B1/K1/C1/G1/R1/L1/O1/E1/X1 locked)')
