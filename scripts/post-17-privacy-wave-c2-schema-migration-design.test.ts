import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(kitRoot, '..')
const dashboardRoot = path.join(workspaceRoot, 'kit-dashboard')

const planPath = path.join(
  kitRoot,
  'docs',
  'roadmap',
  'p17-016-wave-c2-schema-inventory-migration-design-plan.md',
)
assert.ok(fs.existsSync(planPath), 'missing accepted P17-016 Wave C2 schema/migration design plan')

const queryPath = path.join(
  dashboardRoot,
  'docs',
  'evidence',
  'p17-016-wave-c2-live-catalog-query-2026-08-15.sql',
)
const snapshotPath = path.join(
  dashboardRoot,
  'docs',
  'evidence',
  'p17-016-wave-c2-live-catalog-snapshot-2026-08-15.json',
)
const aclQueryPath = path.join(
  dashboardRoot,
  'docs',
  'evidence',
  'p17-016-wave-c2-live-table-acl-query-2026-08-16.sql',
)
const aclSnapshotPath = path.join(
  dashboardRoot,
  'docs',
  'evidence',
  'p17-016-wave-c2-live-table-acl-snapshot-2026-08-16.json',
)
const forwardPath = path.join(
  dashboardRoot,
  'docs',
  'roadmap',
  'p17-016-wave-c2-additive-design.sql',
)
const rollbackPath = path.join(
  dashboardRoot,
  'docs',
  'roadmap',
  'p17-016-wave-c2-rollback-design.sql',
)
const dashboardTestPath = path.join(
  dashboardRoot,
  'tests',
  'p17-016-wave-c2-migration-design.test.ts',
)

for (const artifactPath of [
  queryPath,
  snapshotPath,
  aclQueryPath,
  aclSnapshotPath,
  forwardPath,
  rollbackPath,
  dashboardTestPath,
]) {
  assert.ok(fs.existsSync(artifactPath), `missing C2 artifact ${path.relative(workspaceRoot, artifactPath)}`)
}

const plan = fs.readFileSync(planPath, 'utf8')
const normalizedPlan = plan.replace(/\s+/g, ' ')
const query = fs.readFileSync(queryPath, 'utf8')
const aclQuery = fs.readFileSync(aclQueryPath, 'utf8')
const forward = fs.readFileSync(forwardPath, 'utf8')
const rollback = fs.readFileSync(rollbackPath, 'utf8')
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as {
  evidence_version: string
  project_ref: string
  schema: string
  boundary: Record<string, boolean>
  source_snapshot: { canonical_sha256: string; canonical_bytes: number; counts: Record<string, number> }
  relations: Array<{
    name: string
    rls_enabled: boolean
    rls_forced: boolean
    policies: Array<{ name: string }>
  }>
  functions: Array<Record<string, unknown>>
}
const aclSnapshot = JSON.parse(fs.readFileSync(aclSnapshotPath, 'utf8')) as {
  evidence_version: string
  project_ref: string
  schema: string
  boundary: Record<string, boolean>
  source_result: {
    expected_relation_count: number
    found_relation_count: number
    acl_entry_count: number
    public_entry_count: number
    grantable_entry_count: number
    grantors: string[]
    grantees: string[]
    manifest_sha256: string
  }
  normalization: {
    full_privileges: string[]
    broad_relations: string[]
    broad_grantees: string[]
    progress_relations: string[]
    progress_postgres_privileges: string[]
    progress_service_role_privileges: string[]
    role_audit_postgres_privileges: string[]
    role_audit_service_role_privileges: string[]
  }
}
const kitPackage = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const dashboardPackage = JSON.parse(fs.readFileSync(path.join(dashboardRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Authorized catalog boundary',
  '## Exact live inventory',
  '## Canonical SQL ownership and ordering',
  '## Locked design decisions',
  '### I1 — Reproducible catalog input',
  '### O1 — Dashboard-only Wave C SQL owner',
  '### D1 — Collision-safe promotion order',
  '### F1 — Closed tenant foundation',
  '### Q1 — Additive legacy quarantine',
  '### A1 — Direct-access quarantine',
  '### H1 — Legacy auth remediation gate',
  '### R1 — Forward rollback contract',
  '### X1 — Offline design execution',
  '### E1 — Evidence ladder',
  '## Exact relation and policy manifest',
  '## Forward design contract',
  '## Rollback design contract',
  '## C3 promotion gate',
  '## C2 implementation manifest',
  '## Attack matrix',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing C2 plan section ${heading}`)

for (const phrase of [
  'inventory=I1, ownership=O1, ordering=D1, foundation=F1, quarantine=Q1, access=A1, auth=H1, rollback=R1, execution=X1, evidence=E1',
  'e21954c4d0c30f15839a9fee3e15478135a54e4f5337f33ec872ea10c7fa7144',
  '7e4be34c27d919534204a3a850f9714308ae8ba98527c596b938496ffe836996',
  '20 public relations, 199 columns, 96 constraints, 53 indexes, 17 policies, 507 table grants, 12 functions, and 3 triggers',
  '`kit-dashboard` is the only Wave C SQL owner',
  'The kit migrations `0001` through `0004` are immutable legacy inputs',
  'no file is promoted into either `migrations/` directory in C2',
  'No bootstrap tenant is created',
  'No historical row is assigned to a tenant',
  '`legacy_unclassified`',
  'all 20 cataloged relations',
  'all 17 cataloged policies',
  'legacy `verify_kit_token` cannot be treated as authentication-only',
  'p17_016_c2_legacy_auth_side_effects_present',
  'p17_016_c2_legacy_auth_not_read_only',
  'p17_016_c2_policy_manifest_drift',
  'p17_016_c2_grant_principal_drift',
  'p17_016_c2_grant_manifest_drift',
  'does not produce `TrustedTenantContext`',
  'no central sink is available',
  'rollback refuses a non-empty foundation or classified legacy row',
  'C3 must re-prove the live catalog hash or stop for reconciliation',
  'P17-016 remains `in_progress`',
]) assert.ok(normalizedPlan.includes(phrase), `missing C2 contract phrase: ${phrase}`)

assert.match(
  plan,
  /\*\*Status:\*\* Authorized under standing continuation authority — C2 offline design in progress; no SQL execution or sink/,
)
const affirmativeClaimSurface = normalizedPlan
  .replace(/does not claim[^.]*\./gi, '')
  .replace(/no central sink (?:is|was) available/gi, '')
assert.doesNotMatch(affirmativeClaimSurface, /tenant (is|was) safe/i)
assert.doesNotMatch(affirmativeClaimSurface, /migration (is|was) applied/i)
assert.doesNotMatch(affirmativeClaimSurface, /sink (is|was) available/i)
assert.doesNotMatch(affirmativeClaimSurface, /Wave C (is|was) complete/i)
assert.doesNotMatch(affirmativeClaimSurface, /P17-016 (is|was) complete/i)

assert.equal(snapshot.evidence_version, 'p17-016-c2-live-catalog-v1')
assert.equal(snapshot.project_ref, 'vkuojxgvkxndftenrdno')
assert.equal(snapshot.schema, 'public')
assert.deepEqual(snapshot.boundary, {
  metadata_only: true,
  application_row_bodies_read: false,
  application_rpcs_called: false,
  ddl_executed: false,
  dml_executed: false,
  function_bodies_persisted: false,
})
assert.deepEqual(snapshot.source_snapshot, {
  canonical_sha256: 'e21954c4d0c30f15839a9fee3e15478135a54e4f5337f33ec872ea10c7fa7144',
  canonical_bytes: 127644,
  counts: {
    enums: 0,
    columns: 199,
    indexes: 53,
    policies: 17,
    triggers: 3,
    functions: 12,
    relations: 20,
    sequences: 0,
    constraints: 96,
    table_grants: 507,
  },
})

const relationNames = [
  'admin_bypass',
  'command_runs',
  'deployments',
  'error_reports',
  'installs',
  'needs_input_requests',
  'orchestrator_events',
  'phase_queue',
  'progress_events',
  'progress_run_bindings',
  'repo_runs',
  'role_audit',
  'token_usage',
  'tokens',
  'usage_logs',
  'user_roles',
  'verify_records',
  'version_analysis',
  'version_canaries',
  'version_lessons',
] as const
assert.deepEqual(snapshot.relations.map((relation) => relation.name), relationNames)
assert.ok(snapshot.relations.every((relation) => relation.rls_enabled && !relation.rls_forced))
assert.equal(snapshot.relations.flatMap((relation) => relation.policies).length, 17)
assert.equal(snapshot.functions.length, 12)
assert.ok(snapshot.functions.every((fn) => !Object.hasOwn(fn, 'definition')), 'function bodies must not persist')

const fullPrivileges = [
  'DELETE',
  'INSERT',
  'MAINTAIN',
  'REFERENCES',
  'SELECT',
  'TRIGGER',
  'TRUNCATE',
  'UPDATE',
]
assert.equal(aclSnapshot.evidence_version, 'p17-016-c2-table-acl-v1')
assert.equal(aclSnapshot.project_ref, 'vkuojxgvkxndftenrdno')
assert.equal(aclSnapshot.schema, 'public')
assert.deepEqual(aclSnapshot.boundary, {
  metadata_only: true,
  application_row_bodies_read: false,
  application_rpcs_called: false,
  ddl_executed: false,
  dml_executed: false,
})
assert.deepEqual(aclSnapshot.source_result, {
  expected_relation_count: 20,
  found_relation_count: 20,
  acl_entry_count: 580,
  public_entry_count: 0,
  grantable_entry_count: 0,
  grantors: ['postgres'],
  grantees: ['anon', 'authenticated', 'postgres', 'service_role'],
  manifest_sha256: '7e4be34c27d919534204a3a850f9714308ae8ba98527c596b938496ffe836996',
})
assert.deepEqual(aclSnapshot.normalization.full_privileges, fullPrivileges)
assert.deepEqual(aclSnapshot.normalization.broad_relations, relationNames.filter(
  (name) => !['progress_events', 'progress_run_bindings', 'role_audit'].includes(name),
))
assert.deepEqual(aclSnapshot.normalization.broad_grantees, [
  'anon',
  'authenticated',
  'postgres',
  'service_role',
])
assert.deepEqual(aclSnapshot.normalization.progress_relations, [
  'progress_events',
  'progress_run_bindings',
])
assert.deepEqual(aclSnapshot.normalization.progress_postgres_privileges, fullPrivileges)
assert.deepEqual(aclSnapshot.normalization.progress_service_role_privileges, [
  'MAINTAIN',
  'REFERENCES',
  'SELECT',
  'TRIGGER',
  'TRUNCATE',
])
assert.deepEqual(aclSnapshot.normalization.role_audit_postgres_privileges, fullPrivileges)
assert.deepEqual(aclSnapshot.normalization.role_audit_service_role_privileges, ['INSERT', 'SELECT'])
assert.equal(
  aclSnapshot.normalization.broad_relations.length * 4 * fullPrivileges.length
    + aclSnapshot.normalization.progress_relations.length
      * (fullPrivileges.length + aclSnapshot.normalization.progress_service_role_privileges.length)
    + fullPrivileges.length
    + aclSnapshot.normalization.role_audit_service_role_privileges.length,
  aclSnapshot.source_result.acl_entry_count,
)

const normalizedQuery = query.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
assert.match(normalizedQuery, /^with public_relations as \(/i)
assert.match(normalizedQuery, /select jsonb_pretty\(jsonb_build_object\(/i)
assert.match(normalizedQuery, /where n\.nspname = 'public'/i)
assert.match(normalizedQuery, /md5\(pg_get_functiondef\(p\.oid\)\)/i)
assert.doesNotMatch(normalizedQuery, /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call)\b/i)

const normalizedAclQuery = aclQuery.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
assert.match(normalizedAclQuery, /^with expected_relations\(name\) as \(/i)
assert.match(normalizedAclQuery, /aclexplode\(coalesce\(c\.relacl, acldefault\('r', c\.relowner\)\)\)/i)
assert.match(normalizedAclQuery, /case when acl\.grantee = 0 then 'PUBLIC'/i)
assert.match(normalizedAclQuery, /manifest_sha256/i)
assert.doesNotMatch(
  normalizedAclQuery,
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call)\b/i,
)

for (const artifact of [forward, rollback]) {
  assert.match(artifact, /P17-016 Wave C2/i)
  assert.match(artifact, /DESIGN ONLY/i)
  assert.match(artifact, /DO NOT APPLY/i)
  const utilityStatementSurface = artifact.replace(/three_arg_definition\s*~\s*'[^']*'/gi, '')
  assert.doesNotMatch(utilityStatementSurface, /\b(copy|vacuum|analyze|cluster|reindex)\b/i)
}

assert.match(forward, /p17_016_c2_legacy_auth_side_effects_present/)
assert.match(forward, /p17_016_c2_legacy_auth_not_read_only/)
assert.match(forward, /p17_016_c2_legacy_two_param_present/)
assert.match(forward, /p17_016_c2_token_helper_exposed/)
assert.match(forward, /p17_016_c2_policy_manifest_drift/)
assert.match(forward, /p17_016_c2_grant_principal_drift/)
assert.match(forward, /p17_016_c2_grant_manifest_drift/)
assert.match(forward, /aclexplode\(coalesce\(c\.relacl, acldefault\('r', c\.relowner\)\)\)/i)
assert.match(forward, /select \* from live_acl except select \* from expected_acl/i)
assert.match(forward, /select \* from expected_acl except select \* from live_acl/i)
assert.match(forward, /lower\(pg_get_functiondef\(three_arg_oid\)\)/i)
assert.match(forward, /owner_name/i)
assert.match(forward, /p\.provolatile/i)

assert.equal(
  kitPackage.scripts['test:post-17-privacy-wave-c2-schema-migration-design'],
  'npx tsx scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts',
)
assert.ok(
  kitPackage.scripts['test:workspace-contracts'].includes(
    'npm run test:post-17-privacy-wave-c2-schema-migration-design',
  ),
)
assert.equal(
  dashboardPackage.scripts['test:p17-016-wave-c2-migration-design'],
  'vitest run tests/p17-016-wave-c2-migration-design.test.ts',
)

console.log(
  'post-17-privacy-wave-c2-schema-migration-design.test: PASS (I1/O1/D1/F1/Q1/A1/H1/R1/X1/E1 locked; design-only)',
)
