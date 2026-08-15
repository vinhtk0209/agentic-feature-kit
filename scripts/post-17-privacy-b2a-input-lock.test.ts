import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const decisionPath = path.join(root, 'docs', 'roadmap', 'p17-016-wave-b2a-input-lock.md')

assert.ok(
  fs.existsSync(decisionPath),
  'missing accepted P17-016 Wave B2A input-lock decision artifact',
)

const decision = fs.readFileSync(decisionPath, 'utf8')
const normalized = decision.replace(/\s+/g, ' ')
const plan = fs.readFileSync(
  path.join(root, 'docs', 'roadmap', 'p17-016-central-writer-cutover-plan.md'),
  'utf8',
)
const normalizedPlan = plan.replace(/\s+/g, ' ')
const registry = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-016-kit-writer-registry.json'), 'utf8'),
) as {
  entries: Array<{
    id: string
    targetWave: string
    disposition: string
    rationaleCode: string
  }>
}
const roadmap = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8'),
) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }>
}
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Context',
  '## Decision',
  '### T1 — Server-attested tenant context',
  '### R1 — One command-boundary run UUID',
  '### X1 — Auth-only legacy RPC quarantine',
  '### C1 — Adapter-planned cutover only',
  '### S1 — No central sink before Wave C',
  '### L1 — Local closed compatibility receipt',
  '### E1 — Evidence ladder',
  '## Boundary state machine',
  '## Options Considered',
  '## Trade-off Analysis',
  '## Consequences',
  '## Verification and attack plan',
  '## Rollback',
  '## Action Items',
  '## Non-claims',
]) assert.ok(decision.includes(heading), `missing B2A decision section ${heading}`)

assert.match(decision, /\*\*Status:\*\* Accepted — B2 input locked; writer cutover not started/)
assert.match(decision, /\*\*Roadmap task:\*\* P17-016/)

for (const phrase of [
  'APPROVE P17-016 WAVE B2A INPUT-LOCK v1: tenant=T1, run=R1, rpc=X1, cutover=C1, sink=S1, legacy=L1, evidence=E1',
  'server-attested runtime context',
  'authenticated subject and trusted enrollment mapping',
  'environment variable, local configuration, command argument, payload field, or repository content',
  'blocked before record construction or sink invocation',
  'one caller-created UUID at the command boundary',
  'passed unchanged through every adapter and writer attempt',
  '`verify_kit_token` remains an authentication-only legacy RPC',
  'must never be used as tenant attestation',
  '`kit.sync.install-report`',
  '`kit.telemetry.central-upsert`',
  '`kit.verification.record`',
  '`kit.bin.platform-rpc`',
  '`kit.telemetry.central-insert`',
  '`kit.telemetry.token-rpc`',
  'migration-blocked entries cannot be claimed converted',
  'Wave C tenant schema and RLS',
  '`central_sink_unavailable`',
  'local closed receipt',
  'raw text, path, repository name, feature name, prompt, argument, log, URL, token, or secret',
  'Full `npm run test:kit`',
  'positive-control credential scan',
]) assert.ok(normalized.includes(phrase), `missing B2A contract phrase: ${phrase}`)

assert.match(normalized, /Before v2 attestation is available, every central write attempt returns `blocked`/)
assert.match(normalized, /B2A does not modify a production writer, construct a central sink, call a database, apply a migration, use a browser or provider, sync, or push/)
assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /production writers? (is|are|was|were) converted/i)

const expectedRegistry = new Map([
  ['kit.sync.install-report', ['B2', 'adapter_planned', 'install_writer_needs_tenant_context_and_opaque_repo']],
  ['kit.telemetry.central-upsert', ['B2', 'fail_closed', 'tenant_attestation_and_sink_unavailable']],
  ['kit.verification.record', ['B2', 'fail_closed', 'tenant_attestation_and_sink_unavailable']],
  ['kit.bin.platform-rpc', ['B2', 'migration_blocked', 'generic_rpc_mixes_reads_and_verify_side_effects']],
  ['kit.telemetry.central-insert', ['B2', 'migration_blocked', 'legacy_usage_shape_has_no_exact_policy_family']],
  ['kit.telemetry.token-rpc', ['B2', 'migration_blocked', 'external_rpc_contract_and_tenant_resolution_are_missing']],
])

for (const [id, expected] of expectedRegistry) {
  const entry = registry.entries.find((candidate) => candidate.id === id)
  assert.ok(entry, `missing B2 registry entry ${id}`)
  assert.deepEqual(
    [entry.targetWave, entry.disposition, entry.rationaleCode],
    expected,
    `B2 registry contract drifted for ${id}`,
  )
}

assert.match(normalizedPlan, /B2A input contract is locked by `p17-016-wave-b2a-input-lock\.md`/)
assert.match(normalizedPlan, /B2B implements only `kit\.verification\.record`/)
assert.match(normalizedPlan, /B2C implements only `kit\.telemetry\.central-upsert`/)
assert.match(normalizedPlan, /remaining `kit\.sync\.install-report` entry stays `adapter_planned` and requires a separately confirmed scope/)
assert.match(normalizedPlan, /Central sink capability remains blocked until Wave C/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b2a-input-lock'],
  'npx tsx scripts/post-17-privacy-b2a-input-lock.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-b2a-input-lock'))

console.log('post-17-privacy-b2a-input-lock.test: PASS (T1/R1/X1/C1/S1/L1/E1 accepted, central B2 cutover blocked)')
