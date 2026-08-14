import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const decisionPath = path.join(root, 'docs', 'design', 'adr-002-privacy-tenant-retention-boundary.md')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const decision = fs.readFileSync(decisionPath, 'utf8')
const normalizedDecision = decision.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }

for (const heading of [
  '## Context',
  '## Decision',
  '## Acceptance record',
  '## Data classification',
  '## Central persistence allowlist',
  '## Tenant isolation',
  '## Processing grants and consent',
  '## Retention and deletion',
  '## Redaction and rejection boundary',
  '## Evidence, RAG, provider, and Control Plane boundaries',
  '## Legacy data migration',
  '## Verification and attack plan',
  '## Options considered',
  '## Trade-offs',
  '## Consequences',
  '## Operator decision required',
  '## Action items after approval',
]) assert.ok(decision.includes(heading), `missing decision section ${heading}`)

assert.match(decision, /\*\*Status:\*\* Accepted — policy input locked; implementation in progress \(Wave A\)/)
assert.match(decision, /\*\*Roadmap task:\*\* P17-016/)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-016')
assert.ok(task)
assert.equal(task.status, 'in_progress', 'P17-016 must remain in progress until every implementation wave passes')
assert.equal(task.readiness.complete, true, 'P17-016 readiness must reflect the accepted policy')
assert.deepEqual(task.readiness.missing, [])

for (const classification of [
  'D0_public_contract',
  'D1_opaque_operational',
  'D2_sensitive_metadata',
  'D3_private_content',
  'D4_secret',
]) assert.ok(decision.includes(classification), `missing data class ${classification}`)

for (const excluded of [
  '`args`',
  '`log_tail`',
  '`code_path`',
  '`spec_name`',
  'lesson title',
  'source reference',
  'exact quotes',
]) assert.ok(decision.toLowerCase().includes(excluded.toLowerCase()), `missing current-surface treatment ${excluded}`)

for (const contract of [
  'tenant-specific keyed HMAC',
  'No central table in this policy accepts arbitrary free text.',
  'a producer-supplied `tenant_id` is rejected or ignored, never trusted',
  'service role bypasses RLS',
  '`central_content` | `0` days',
  '`short_lived` | 24 hours',
  '`standard` | 30 days',
  '`learning_aggregate` | 180 days',
  '`audit_release` | 365 days',
  'There is no indefinite default and no silent legal hold.',
  'Silently assigning all historical rows to the bootstrap tenant is not allowed.',
  'APPROVE P17-016 POLICY v1: tenant=T1, retention=R1, consent=C1, legacy=L1, evidence=E1.',
]) assert.ok(normalizedDecision.includes(contract), `missing policy contract: ${contract}`)

for (const optionalScope of [
  '`learning_metrics` | Off.',
  '`content_indexing` | Off.',
  '`cross_provider_evaluation` | Off.',
  '`diagnostic_content` | Off.',
]) assert.ok(decision.includes(optionalScope), `optional processing scope is not fail-closed: ${optionalScope}`)

assert.match(decision, /no\s+migration or external write is implied by acceptance or by the pure shared-core implementation/i)
assert.match(decision, /No sync, provider run, database migration, installation, publication, or push is authorized/i)
assert.doesNotMatch(decision, /implementation (is|was) complete/i)

console.log('post-17-privacy-decision.test: PASS (17 sections, 5 data classes, T1/R1/C1/L1/E1 accepted, P17-016 in progress)')
