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
  'p17-016-wave-c4-verification-sink-plan.md',
)

assert.ok(fs.existsSync(planPath), 'missing P17-016 Wave C4 verification sink plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\s+/g, ' ')
const packageJson = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const predecessor of [
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c-tenant-foundation-plan.md'),
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c2-schema-inventory-migration-design-plan.md'),
  path.join(kitRoot, 'docs', 'roadmap', 'p17-016-wave-c3-tenant-foundation-execution-plan.md'),
  path.join(kitRoot, 'docs', 'evidence', 'post-17-privacy-b2b-verification-adapter-2026-08-15.md'),
  path.join(kitRoot, 'docs', 'evidence', 'post-17-privacy-wave-c3d-disposable-postgres-2026-08-16.md'),
  path.join(dashboardRoot, 'docs', 'evidence', 'post-17-privacy-wave-c3d-disposable-postgres-2026-08-16.md'),
]) {
  assert.ok(fs.existsSync(predecessor), `missing C4 predecessor ${path.relative(workspaceRoot, predecessor)}`)
}

for (const decision of [
  'family=V1',
  'storage=T1',
  'boundary=B1',
  'attestation=A1',
  'retention=R1',
  'idempotency=I1',
  'cutover=C1',
  'rollback=K1',
  'evidence=E1',
]) {
  assert.ok(normalized.includes(decision), `C4 plan missing input decision ${decision}`)
}

for (const section of [
  'C4A — Plan and input lock',
  'C4B — Typed storage and dashboard sink',
  'C4C — Kit verification capability path',
  'C4D — Disposable cross-repository proof',
]) {
  assert.ok(normalized.includes(section), `C4 plan missing execution slice ${section}`)
}

for (const phrase of [
  'verification is the only first family',
  'privacy_verification_records',
  '0019_p17_016_verification_sink.sql',
  'p17_016_persist_verification',
  'contains no JSON/JSONB',
  'no direct privilege for PUBLIC, anon, authenticated, or service_role',
  'server-only injected transport',
  'HMAC-SHA-256 with base64url output and constant-time verification',
  'attestation and opaque identifier keys are separate by construction',
  'exactly 30 days from recordedAt',
  '(tenant_id, writer_id, run_id)',
  'same key and exact record_hash',
  'p17_016_c4_verification_idempotency_conflict',
  'capability_ready in source',
  'existing call site remains B2B-blocked',
  'legacy verify_records reader and sync guard are not changed in C4',
  'rollback refuses when the verification table is non-empty',
  'apply exact 0018 then 0019',
  'no HTTP route is added in C4',
  'no live SQL',
]) {
  assert.ok(normalized.toLowerCase().includes(phrase.toLowerCase()), `C4 plan missing contract: ${phrase}`)
}

for (const attack of [
  'forged producer tenant',
  'unscoped service-role call',
  'expired/future/replayed/wrong-key attestation',
  'removed membership',
  'stale credential',
  'raw repository transmission',
  'cross-tenant local-name collision',
  'retention extension',
  'concurrent same/different hash',
  'cross-tenant same run',
  'migration retry',
  'partial DDL',
  'non-empty rollback',
  'registry bulk relabel',
]) {
  assert.ok(normalized.toLowerCase().includes(attack.toLowerCase()), `C4 plan missing attack: ${attack}`)
}

const expectedCommand = 'npx tsx scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts'
assert.equal(packageJson.scripts['test:post-17-privacy-wave-c4-verification-sink-plan'], expectedCommand)
assert.ok(
  packageJson.scripts['test:kit']?.includes('npm run test:post-17-privacy-wave-c4-verification-sink-plan'),
  'C4 plan validator is not registered in the full kit suite',
)

const affirmativeSurface = normalized
  .replace(/C4A does not claim[^.]*\./gi, '')
  .replace(/no live SQL/gi, '')

for (const forbidden of [
  /central sink (?:exists|is available)/i,
  /verification writer is capability-ready/i,
  /migration 001[89] is live/i,
  /tenant safety is proven/i,
  /C4 is complete/i,
  /Wave C is complete/i,
  /P17-016 is complete/i,
]) {
  assert.doesNotMatch(affirmativeSurface, forbidden, `C4 plan contains a premature claim: ${forbidden}`)
}

console.log('P17-016 Wave C4 verification sink plan: PASS (V1/T1/B1/A1/R1/I1/C1/K1/E1 locked)')
