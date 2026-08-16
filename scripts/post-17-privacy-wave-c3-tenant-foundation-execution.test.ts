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
  'p17-016-wave-c3-tenant-foundation-execution-plan.md',
)

assert.ok(fs.existsSync(planPath), 'missing accepted P17-016 Wave C3 tenant-foundation execution plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const packageJson = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const artifact of [
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c-tenant-foundation-plan.md'),
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c2-schema-inventory-migration-design-plan.md'),
  path.join(dashboardRoot, 'docs', 'roadmap', 'p17-016-wave-c2-additive-design.sql'),
  path.join(dashboardRoot, 'docs', 'roadmap', 'p17-016-wave-c2-rollback-design.sql'),
]) {
  assert.ok(fs.existsSync(artifact), `missing C3 predecessor ${path.relative(workspaceRoot, artifact)}`)
}

for (const phrase of [
  'C3A — Canonical attestation and repository contracts',
  'C3B — Migration 0018 and tenant-required RPCs',
  'C3C — Direct service-role denial and closed application cutover',
  'C3D — Disposable database proof',
  'existing production central writers remain blocked',
  'no tenant context is accepted from a producer payload',
  'server_session requires an active same-tenant membership',
  'worker_credential requires an active same-tenant credential binding',
  'nonce consumption is atomic and occurs only after every other verification succeeds',
  'the two-argument verify_kit_token overload is dropped',
  'the three-argument verifier is read-only and returns no raw owner identity',
  'token_id_for is not executable by PUBLIC, anon, authenticated, or service_role',
  'exactly one dashboard migration named 0018_p17_016_tenant_foundation_quarantine.sql',
  'all 20 legacy relations remain legacy_unclassified after migration',
  'service_role receives no direct table privilege on the 20 legacy relations',
  'there is no unscoped repository or RPC overload',
  'Wave E owns functional tenant-safe reads, actions, and dashboard restoration',
  'C3C renders legacy application paths explicitly unavailable',
  'PostgreSQL 17.11',
  'sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73',
  'Ten scenario groups cover the two-tenant',
  'no live project migration occurs in C3',
  'no central sink is available in C3',
  'no sync or push',
]) {
  assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C3 plan missing contract: ${phrase}`)
}

for (const decision of [
  'foundation=F1',
  'membership=M1',
  'grants=G1',
  'attestation=A1',
  'quarantine=Q1',
  'sink=S1',
  'execution=X1',
  'rollback=R1',
  'evidence=E1',
]) {
  assert.ok(normalized.includes(decision), `C3 plan missing accepted decision ${decision}`)
}

for (const attack of [
  'forged producer tenant',
  'wrong tenant',
  'wrong policy',
  'wrong key version',
  'expired attestation',
  'future attestation',
  'nonce replay',
  'removed membership',
  'stale credential',
  'unscoped service-role access',
  'silent bootstrap assignment',
  'cross-tenant natural-key collision',
  'partial DDL',
  'rollback count drift',
]) {
  assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C3 plan missing attack: ${attack}`)
}

const c3Command = 'npx tsx scripts/post-17-privacy-wave-c3-tenant-foundation-execution.test.ts'
assert.equal(packageJson.scripts['test:post-17-privacy-wave-c3-tenant-foundation-execution'], c3Command)
assert.ok(
  packageJson.scripts['test:kit']?.includes('npm run test:post-17-privacy-wave-c3-tenant-foundation-execution'),
  'C3 plan validator is not registered in the full kit suite',
)

const affirmativeSurface = normalized
  .replace(/C3 does not claim[^.]*\./gi, '')
  .replace(/no live project migration occurs in C3/gi, '')
  .replace(/no central sink is available in C3/gi, '')

for (const forbidden of [
  /C3 is complete/i,
  /Wave C is complete/i,
  /P17-016 is complete/i,
  /tenant safety is proven/i,
  /central sink is available/i,
  /live migration (?:is|was) applied/i,
  /two-tenant isolation is proven/i,
]) {
  assert.doesNotMatch(affirmativeSurface, forbidden, `C3 plan contains a premature claim: ${forbidden}`)
}

console.log('P17-016 Wave C3 execution plan: PASS (C3A/C3B/C3C/C3D, closed writers, migration and rollback boundaries)')
