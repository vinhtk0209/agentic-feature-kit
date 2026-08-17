import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-016-b3-local-compatibility-plan.md')

assert.ok(fs.existsSync(planPath), 'missing P17-016 B3 local compatibility plan')

const plan = fs.readFileSync(planPath, 'utf8')
const normalized = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json'), 'utf8'),
) as { tasks: Array<{ id: string; status: string; readiness: { complete: boolean; missing: string[] } }> }
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

for (const heading of [
  '## Outcome',
  '## Decisions',
  '### F1 — One exact machine-local compatibility store',
  '### P1 — Per-user state outside repositories',
  '### K1 — Machine-local key and authenticated encryption',
  '### A1 — Dual-slot crash recovery',
  '### R1 — Store-owned retention and purge',
  '### C1 — Single-sidecar serialized commits',
  '### U1 — Coupled PTY, usage, and Codex resume cutover',
  '### O1 — Coupled Orchestrator and Slack cutover',
  '### Z1 — Zero raw central fallback and honest legacy reads',
  '### E1 — Offline evidence before local commits',
  '## Clean architecture boundaries',
  '## Implementation manifest',
  '## RED controls',
  '## Verification and attack matrix',
  '## Edge cases and failure handling',
  '## Evidence and completion',
  '## Rollback',
  '## Non-claims',
]) assert.ok(plan.includes(heading), `missing B3 plan section ${heading}`)

for (const phrase of [
  'store=F1, path=P1, key=K1, atomic=A1, retention=R1, concurrency=C1, run=U1, orchestrator=O1, central=Z1, evidence=E1',
  'B3A — store foundation',
  'B3B — run/usage/resume cutover',
  'B3C — orchestrator/Slack cutover',
  'one exact, encrypted, machine-local store',
  '16 MiB',
  'Windows junction/reparse-point aliases',
  'AES-256-GCM',
  'fresh 96-bit nonce',
  'Two absent slots create the exact empty state',
  'producer expiry extension',
  'a run older than 30 days becomes `recovery_required`',
  'within 24 hours after terminal state',
  'Only the PTY sidecar may write this store',
  'Run start persists an exact local row before provider spawn',
  'A resume claim is durable before sending the provider reply',
  'Slack configuration no longer requires Supabase credentials',
  'no reachable raw Supabase REST or RPC mutation',
  '`transport=in_process`, `currentPrivacyState=outside_central_scope`, and `disposition=fail_closed`',
  'not silently repointed to the raw local store',
  'five proven positive controls',
  'full dashboard regression',
  'full kit regression',
  'No RED control may import the side-effectful PTY main module',
  'P17-016 remains `in_progress`',
  'Never use sync as rollback and do not push',
]) assert.ok(normalized.includes(phrase), `missing B3 contract phrase: ${phrase}`)

assert.match(plan, /\*\*Status:\*\* Authorized — inputs locked; implementation unproven/)
assert.match(plan, /\*\*Roadmap task:\*\* P17-016/)
assert.doesNotMatch(normalized, /Wave B (is|was) complete/i)
assert.doesNotMatch(normalized, /P17-016 (is|was) done/i)
assert.match(normalized, /does not claim B3 implemented/)
assert.match(normalized, /does not authorize or claim a Supabase migration, live database read\/write/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])

assert.equal(
  packageJson.scripts['test:post-17-privacy-b3-local-compatibility-plan'],
  'npx tsx scripts/post-17-privacy-b3-local-compatibility-plan.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-kit-writer-registry'))
assert.ok(packageJson.scripts['test:post-17-kit-writer-registry'].includes('npm run test:post-17-privacy-b3-local-compatibility-plan'))

console.log('post-17-privacy-b3-local-compatibility-plan.test: PASS (F1/P1/K1/A1/R1/C1/U1/O1/Z1/E1 locked)')
