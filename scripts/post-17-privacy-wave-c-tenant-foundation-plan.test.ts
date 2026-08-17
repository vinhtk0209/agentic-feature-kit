import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-c-tenant-foundation-plan.md')
assert.ok(fs.existsSync(planPath), 'missing P17-016 Wave C1 tenant-foundation plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-016-kit-writer-registry.json'), 'utf8')) as {
  entries: Array<{ id: string; currentPrivacyState: string; disposition: string; rationaleCode: string }>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Read-only reconciliation',
  '## Locked decisions',
  '### F1 — Opaque tenant foundation',
  '### M1 — Server-resolved membership',
  '### G1 — Versioned processing grants',
  '### A1 — Trusted attestation boundary',
  '### Q1 — Additive quarantine before mapping',
  '### S1 — Central sink remains unavailable',
  '### X1 — Offline-only C1 execution',
  '### R1 — Forward rollback is designed before SQL',
  '### E1 — Evidence ladder and truth labels',
  '## Wave C sequencing',
  '### C1 — Plan and readiness gate',
  '### C2 — Exact schema inventory and additive migration design',
  '### C3 — Tenant foundation, quarantine, and repository adapters',
  '### C4 — Tenant-scoped central sink and writer capability',
  '### C5 — Authorized migration, rollback, and cutover proof',
  '## Architecture and dependency boundary',
  '## C1 implementation manifest',
  '## C1 executable checks',
  '## Edge cases and attacks reserved for later subwaves',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing C1 plan section ${heading}`)

for (const phrase of [
  'foundation=F1, membership=M1, grants=G1, attestation=A1, quarantine=Q1, sink=S1, execution=X1, rollback=R1, evidence=E1',
  'C1 is plan and executable readiness only',
  'Only C1 is input-complete',
  'C2 requires an exact local/live schema inventory',
  'explicit authorization for the named disposable or live project',
  'Historical rows are never assigned to it automatically',
  'Email may remain a private display/bootstrap attribute, but it is not a membership key or tenant selector',
  'optional scopes default off',
  'legacy `verify_kit_token` output are not attestation sources',
  'defaulting to `legacy_unclassified`',
  'C1 does not construct or enable a central sink',
  'No dashboard production or SQL file changes in C1',
  'forward-rollback section',
  'positive-control source denial',
  'No SQL execution and no sink',
  'No bulk registry relabeling',
  'does not inherit the C1 offline authorization',
  'P17-016 remains `in_progress`',
]) assert.ok(normalized.includes(phrase), `missing C1 contract phrase: ${phrase}`)

assert.match(plan, /\*\*Status:\*\* Authorized under standing continuation authority — C1 plan-only inputs complete; C2-C5 not authorized for external execution/)
assert.doesNotMatch(normalized, /tenant (is|was) safe/i)
assert.doesNotMatch(normalized, /attestation (is|was) implemented/i)
assert.doesNotMatch(normalized, /sink (is|was) available/i)
assert.doesNotMatch(normalized, /migration (is|was) executed/i)
assert.doesNotMatch(normalized, /Wave C (is|was) complete/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) complete/i)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

for (const [id, state, disposition, rationale] of [
  ['kit.sync.install-report', 'contract_validated', 'fail_closed', 'tenant_attestation_and_sink_unavailable'],
  ['kit.telemetry.central-upsert', 'contract_validated', 'fail_closed', 'tenant_attestation_and_sink_unavailable'],
  ['kit.verification.record', 'contract_validated', 'capability_ready', 'disposable_verified_default_runtime_blocked'],
  ['kit.bin.platform-rpc', 'legacy_raw', 'migration_blocked', 'generic_rpc_mixes_reads_and_verify_side_effects'],
  ['kit.telemetry.central-insert', 'legacy_raw', 'migration_blocked', 'legacy_usage_shape_has_no_exact_policy_family'],
  ['kit.telemetry.token-rpc', 'legacy_raw', 'migration_blocked', 'external_rpc_contract_and_tenant_resolution_are_missing'],
] as const) {
  const entry = registry.entries.find((candidate) => candidate.id === id)
  assert.ok(entry, `missing registry entry ${id}`)
  assert.deepEqual(
    [entry.currentPrivacyState, entry.disposition, entry.rationaleCode],
    [state, disposition, rationale],
    `unexpected C1-origin registry transition for ${id}`,
  )
}

const verificationRecordSource = fs.readFileSync(
  path.join(root, '.claude', 'integrations', 'record-verify.ts'),
  'utf8',
)
assert.equal(
  (verificationRecordSource.match(/const receipt = createVerificationWriterReceipt\(note\);/g) ?? []).length,
  2,
  'C4 capability transition must preserve both default B2B-blocked CLI paths',
)

for (const evidence of [
  'post-17-privacy-b2a-input-lock-2026-08-15.md',
  'post-17-privacy-b2b-verification-adapter-2026-08-15.md',
  'post-17-privacy-b2c-run-version-adapter-2026-08-15.md',
  'post-17-privacy-b2d-install-writer-adapter-2026-08-15.md',
  'post-17-privacy-b4a-dashboard-adapters-plan-2026-08-15.md',
  'post-17-privacy-b4b-identity-control-plan-2026-08-15.md',
]) assert.ok(fs.existsSync(path.join(root, 'docs', 'evidence', evidence)), `missing predecessor evidence ${evidence}`)

assert.equal(
  packageJson.scripts['test:post-17-privacy-wave-c-tenant-foundation-plan'],
  'npx tsx scripts/post-17-privacy-wave-c-tenant-foundation-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-wave-c-tenant-foundation-plan'))

console.log('post-17-privacy-wave-c-tenant-foundation-plan.test: PASS (F1/M1/G1/A1/Q1/S1/X1/R1/E1 locked; C1 offline-only)')
