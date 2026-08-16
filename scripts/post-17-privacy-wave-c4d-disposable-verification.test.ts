import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = process.cwd()
const dashboardRoot = path.resolve(kitRoot, '..', 'kit-dashboard')
const readKit = (relative: string) => fs.readFileSync(path.join(kitRoot, relative), 'utf8')
const readDashboard = (relative: string) => fs.readFileSync(path.join(dashboardRoot, relative), 'utf8')

const runnerPath = 'scripts/p17-016-c4d-disposable-verification.ts'
const dashboardTestPath = 'tests/p17-016-c4d-disposable-verification.test.ts'
const seedPath = 'scripts/fixtures/p17-016-c4d-foundation-seed.sql'
const capabilityPath = '.claude/integrations/verification-writer-capability.ts'
const recordPath = '.claude/integrations/record-verify.ts'

assert.ok(
  fs.existsSync(path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c4-verification-sink-plan.md')),
  'C4D validator must run from the kit repository root',
)
for (const relative of [runnerPath, dashboardTestPath, seedPath]) {
  assert.ok(fs.existsSync(path.join(dashboardRoot, relative)), `missing C4D dashboard artifact ${relative}`)
}
for (const relative of [capabilityPath, recordPath]) {
  assert.ok(fs.existsSync(path.join(kitRoot, relative)), `missing C4D kit artifact ${relative}`)
}

const runner = readDashboard(runnerPath)
const dashboardTest = readDashboard(dashboardTestPath)
const seed = readDashboard(seedPath)
const capability = readKit(capabilityPath)
const record = readKit(recordPath)
const dashboardPackage = JSON.parse(readDashboard('package.json')) as { scripts: Record<string, string> }
const kitPackage = JSON.parse(readKit('package.json')) as { scripts: Record<string, string> }
const dashboardRegistry = JSON.parse(readDashboard('docs/roadmap/p17-016-dashboard-writer-registry.json')) as {
  entries: Array<Record<string, unknown>>
}
const kitRegistry = JSON.parse(readKit('docs/roadmap/p17-016-kit-writer-registry.json')) as {
  entries: Array<Record<string, unknown>>
}

for (const source of [runner, dashboardTest, seed]) {
  assert.doesNotMatch(source, /SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)/)
  assert.doesNotMatch(source, /https?:\/\//)
  assert.doesNotMatch(source, /[A-Za-z0-9+/]{160,}={0,2}/)
}
for (const source of [runner, seed]) assert.doesNotMatch(source, /vkuojxgvkxndftenrdno/)

for (const token of [
  'postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73',
  '0018_p17_016_tenant_foundation_quarantine.sql',
  '0019_p17_016_verification_sink.sql',
  'p17-016-wave-c4b-verification-sink-rollback.sql',
  'verification-writer-capability.ts',
  'createTenantFoundationRepository',
  'createTenantCryptographicPorts',
  'createVerificationSinkCapability',
  'persistVerificationWithCapability',
  'buildLegacyFunctionSeedSql',
  'validateLegacyFunctionFixture',
  "'--network', 'none'",
  "'--tmpfs'",
  'POSTGRES_HOST_AUTH_METHOD=trust',
  'p17-016-c4d=true',
  'workspace _tmp directory',
]) assert.ok(runner.includes(token), `C4D runner missing contract ${token}`)

assert.doesNotMatch(runner, /\bdocker\s+pull\b|['"]pull['"]|--publish|-p\s+\d/)
assert.match(runner, /'inspect'.*p17-016-c4d.*'rm', '--force'/s)
assert.match(runner, /liveProjectTouched: false/)
assert.match(runner, /functionBodiesPersisted: false/)
assert.match(runner, /syntheticTenants: 2/)

for (const scenario of [
  'engine_pg17',
  'forward_foundation_c3',
  'forward_verification_c4',
  'synthetic_attestation_context',
  'cross_repository_write',
  'same_hash_replay',
  'idempotency_conflict',
  'concurrent_same_hash',
  'concurrent_different_hash',
  'two_tenant_same_run',
  'stale_credential_refusal',
  'retention_boundary',
  'table_rpc_privilege_denials',
  'non_empty_rollback_atomicity',
  'empty_rollback',
  'forward_again',
  'rollback_privilege_drift_refusal',
]) assert.ok(runner.includes(scenario), `C4D runner missing scenario ${scenario}`)

assert.match(seed, /'server_session'/)
assert.match(seed, /'worker_credential'/)
assert.match(seed, /'verification_record'/)
assert.doesNotMatch(seed, /raw[_ ]?(repository|path|feature|spec)|owner_(?:name|email)/i)
assert.match(capability, /export async function executeVerificationWrite/)
assert.match(record, /export function persistVerificationWithCapability/)
assert.match(record, /return executeVerificationWrite\(/)
assert.equal((record.match(/const receipt = createVerificationWriterReceipt\(note\);/g) ?? []).length, 2)
assert.deepEqual(
  dashboardRegistry.entries.find((entry) => entry.id === 'dashboard.privacy.verification-sink-rpc'),
  {
    id: 'dashboard.privacy.verification-sink-rpc',
    sourcePath: 'src/features/privacy/infrastructure/verification-sink-rpc-capability.ts',
    sourceAnchor: 'export function createVerificationSinkCapability(input: {',
    transport: 'supabase_rpc',
    dataFamilies: ['verification'],
    currentPrivacyState: 'contract_validated',
    prohibitedFieldObservations: [],
    targetWave: 'C4',
    disposition: 'capability_ready',
    rationaleCode: 'disposable_verified_live_migration_pending',
  },
)
assert.deepEqual(
  kitRegistry.entries.find((entry) => entry.id === 'kit.verification.record'),
  {
    id: 'kit.verification.record',
    sourcePath: '.claude/integrations/verification-writer-capability.ts',
    sourceAnchor: 'export async function executeVerificationWrite(input: unknown): Promise<CentralWriterResult> {',
    transport: 'in_process',
    dataFamilies: ['verification'],
    currentPrivacyState: 'contract_validated',
    prohibitedFieldObservations: [],
    targetWave: 'C4',
    disposition: 'capability_ready',
    rationaleCode: 'disposable_verified_default_runtime_blocked',
  },
)

assert.equal(
  dashboardPackage.scripts['test:p17-016-c4d-disposable-verification'],
  'vitest run tests/p17-016-c4d-disposable-verification.test.ts',
)
assert.equal(
  dashboardPackage.scripts['p17-016:c4d'],
  'tsx scripts/p17-016-c4d-disposable-verification.ts',
)
assert.equal(
  kitPackage.scripts['test:post-17-privacy-wave-c4d-disposable-verification'],
  'npx tsx scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts',
)
assert.ok(
  kitPackage.scripts['test:kit']?.includes('npm run test:post-17-privacy-wave-c4d-disposable-verification'),
  'C4D cross-repository validator is not registered in the full kit suite',
)

console.log('P17-016 Wave C4D disposable verification: PASS (2 repositories, 2 tenants, 17 scenarios)')
