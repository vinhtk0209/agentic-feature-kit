import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-006-phase-model-routing-plan.md')
const matrixPath = path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const plan = fs.readFileSync(planPath, 'utf8')
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as Record<string, any>
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }

for (const heading of [
  '## Outcome',
  '## Requirements',
  '## Current-state reconciliation',
  '## Clean Architecture',
  '## Domain contracts',
  '## Closed reason codes',
  '## Selection algorithm',
  '## Fallback semantics',
  '## CLI contract',
  '## Provider packaging and public documentation',
  '## Language and performance decision',
  '## Security and privacy',
  '## Reliability and scale',
  '## Verification and evidence ladder',
  '## Rollout, compatibility, and rollback',
  '## Trade-offs and revisit triggers',
]) assert.ok(plan.includes(heading), `missing plan section ${heading}`)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-006')
assert.ok(task)
assert.equal(task.status, 'in_progress', 'P17-006 starts only after the design gate is locked')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.readiness.missing, [])
assert.equal(matrix.schemaVersion, '1.1.0')
assert.equal(matrix.phases.length, 24)
assert.deepEqual(matrix.vocabulary.conditionIds, [
  'images-present',
  'design-images-present',
  'browser-visual-verification-selected',
  'model-closeout-requested',
  'model-feedback-clustering-requested',
])
assert.ok(matrix.catalogReconciliation.runners.every((entry: Record<string, unknown>) => entry.routableNow === false))

for (const file of [
  'packages/core/src/phase-model-router.ts',
  'packages/core/src/phase-model-router-cli.ts',
  'docs/schemas/phase-model-routing-request.schema.json',
  'docs/schemas/phase-model-routing-decision.schema.json',
  'runtime/phase-model-router.cjs',
  'docs/evidence/post-17-model-routing.md',
]) assert.ok(plan.includes(file), `missing planned artifact ${file}`)

for (const phrase of [
  '`selected`, `no_model`, or `needs_input`',
  'P17-007 must produce exact same-input qualification evidence',
  'no automatic switch occurs',
  'at least five comparable observations',
  '512 KiB',
  '32 candidates',
  '100 observations per candidate',
  '0.4.0` → `0.5.0',
  '1.2.0` → `1.3.0',
  'do not fabricate a Codex standalone-agent manifest or a Copilot plugin manifest',
  'Python, Rust, or Go is not forbidden',
  '100 ms p95',
  'No external call, provider run, credential read, installation, publication, sync, push',
]) assert.ok(plan.includes(phrase), `missing design contract: ${phrase}`)

for (const reason of [
  'phase_model_forbidden',
  'runtime_entitlement_missing',
  'phase_qualification_missing',
  'required_capability_missing',
  'fallback_permission_escalation',
  'performance_evidence_insufficient',
]) assert.ok(plan.includes(reason), `missing reason-code group marker ${reason}`)

assert.match(plan, /pure domain function/i)
assert.match(plan, /never reads environment variables, files, credentials/i)
assert.match(plan, /existing four runtimes and orchestrator envelopes remain usable/i)
assert.doesNotMatch(plan, /implementation (is|was) complete/i)

console.log('post-17-phase-model-routing-plan.test: PASS (16 sections, 24 phases, 5 conditions, architecture/version/security/rollback contracts)')
