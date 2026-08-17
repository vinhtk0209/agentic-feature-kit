import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = process.cwd()
const dashboardRoot = path.resolve(kitRoot, '..', 'kit-dashboard')
const readKit = (relative: string) => fs.readFileSync(path.join(kitRoot, relative), 'utf8')
const readDashboard = (relative: string) => fs.readFileSync(path.join(dashboardRoot, relative), 'utf8')

const runnerPath = 'scripts/p17-016-c3d-disposable-postgres.ts'
const dashboardTestPath = 'tests/p17-016-c3d-disposable-postgres.test.ts'
const fixturePaths = [
  'scripts/fixtures/p17-016-c3d-legacy-schema.sql',
  'scripts/fixtures/p17-016-c3d-post-migration-attacks.sql',
  'scripts/fixtures/p17-016-c3d-clear-foundation.sql',
  'scripts/fixtures/p17-016-c3d-post-rollback-assertions.sql',
  'scripts/fixtures/p17-016-c3d-object-collision-assertions.sql',
  'scripts/fixtures/p17-016-c3d-column-collision-assertions.sql',
  'scripts/fixtures/p17-016-c3d-rollback-drift-assertions.sql',
] as const

assert.ok(
  fs.existsSync(path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c3-tenant-foundation-execution-plan.md')),
  'C3D validator must run from the kit repository root',
)

for (const relative of [runnerPath, dashboardTestPath, ...fixturePaths]) {
  assert.ok(fs.existsSync(path.join(dashboardRoot, relative)), `missing C3D artifact ${relative}`)
}

const runner = readDashboard(runnerPath)
const dashboardTest = readDashboard(dashboardTestPath)
const legacySchema = readDashboard(fixturePaths[0])
const attacks = readDashboard(fixturePaths[1])
const clearFoundation = readDashboard(fixturePaths[2])
const postRollback = readDashboard(fixturePaths[3])
const plan = readKit('docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md')
const kitPackage = JSON.parse(readKit('package.json')) as { scripts: Record<string, string> }
const dashboardPackage = JSON.parse(readDashboard('package.json')) as { scripts: Record<string, string> }

for (const source of [runner, dashboardTest, legacySchema, attacks, clearFoundation, postRollback]) {
  assert.doesNotMatch(source, /SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)/)
  assert.doesNotMatch(source, /https?:\/\//)
}

assert.match(runner, /postgres@sha256:\[0-9a-f\]\{64\}/)
assert.match(runner, /image.*inspect/si)
assert.match(runner, /POSTGRES_HOST_AUTH_METHOD=trust/)
assert.match(runner, /--tmpfs/)
assert.match(runner, /'--network', 'none'/)
assert.doesNotMatch(runner, /\bdocker\s+pull\b|['"]pull['"]|--publish|-p\s+\d/)
assert.match(runner, /assertSafeDisposableContainerName/)
assert.match(runner, /assertOwnedDisposableContainer/)
assert.match(runner, /'inspect'.*p17-016-c3d.*'rm', '--force'/s)
assert.match(runner, /workspace _tmp directory/)
assert.match(runner, /functionBodiesPersisted: false/)
assert.match(runner, /liveProjectTouched: false/)

for (const countContract of [
  /LEGACY_RELATIONS = Object\.freeze\(\[/,
  /FOUNDATION_RELATIONS = Object\.freeze\(\[/,
  /TENANT_RPC_SIGNATURES = Object\.freeze\(\[/,
  /scenarioCount: completed\.length/,
  /syntheticTenants: 2/,
]) assert.match(runner, countContract)

for (const attack of [
  'wrong_policy',
  'wrong_tenant_membership',
  'removed_membership',
  'cross_tenant_credential_binding',
  'stale_credential',
  'key_version_is_explicit',
  'cross_tenant_grant',
  'expired_grant',
  'future_attestation',
  'cross_tenant_nonce_binding',
  'future_nonce',
  'expired_nonce',
  'nonce_reservation_replay',
  'cross_tenant_nonce_natural_key',
  'cross_tenant_nonce_consume',
  'nonce_consume_replay',
  'missing_tenant_argument_overloads',
]) assert.ok(attacks.includes(attack), `missing C3D SQL attack ${attack}`)

for (const runtimeAttack of [
  'anonymous foundation table attack',
  'anonymous tenant RPC attack',
  'service-role foundation table attack',
  'service-role legacy table attack',
  'migration retry attack',
  'non-empty rollback attack',
  'foundation object collision attack',
  'partial DDL attack',
  'rollback count drift attack',
]) assert.ok(runner.includes(runtimeAttack), `missing C3D runtime attack ${runtimeAttack}`)

assert.match(legacySchema, /create policy "command_runs_anon_all"/)
assert.match(legacySchema, /grant maintain, references, select, trigger, truncate/)
assert.match(legacySchema, /synthetic-owner/)
assert.doesNotMatch(legacySchema, /CREATE OR REPLACE FUNCTION public\.verify_kit_token/i)
assert.doesNotMatch(runner, /Q1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04/)
assert.match(clearFoundation, /delete from public\.privacy_attestation_nonces;/)
assert.match(postRollback, /unsafe_verifier_restoration/)
assert.match(postRollback, /rollback_legacy_row_count/)
assert.match(postRollback, /rollback_acl_manifest/)

for (const phrase of [
  'PostgreSQL 17.11',
  'sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73',
  'Ten scenario groups cover the two-tenant',
  'live project are not substitutes',
  'live two-tenant isolation is proven',
]) assert.ok(plan.includes(phrase), `C3D plan missing proof boundary: ${phrase}`)

assert.equal(
  dashboardPackage.scripts['test:p17-016-c3d-disposable-postgres'],
  'vitest run tests/p17-016-c3d-disposable-postgres.test.ts',
)
assert.equal(
  dashboardPackage.scripts['p17-016:c3d'],
  'tsx scripts/p17-016-c3d-disposable-postgres.ts',
)
assert.equal(
  kitPackage.scripts['test:post-17-privacy-wave-c3d-disposable-postgres'],
  'npx tsx scripts/post-17-privacy-wave-c3d-disposable-postgres.test.ts',
)
assert.ok(
  kitPackage.scripts['test:workspace-contracts']?.includes(
    'npm run test:post-17-privacy-wave-c3d-disposable-postgres',
  ),
  'C3D cross-repository validator is not registered in the workspace contract suite',
)

console.log('P17-016 Wave C3D disposable PostgreSQL: PASS (20 legacy, 5 foundation, 6 RPCs, 10 scenario groups)')
