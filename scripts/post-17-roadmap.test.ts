import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const jsonPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const markdownPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md')

const raw = fs.readFileSync(jsonPath, 'utf8')
assert.ok(Buffer.byteLength(raw, 'utf8') < 256 * 1024, 'roadmap catalog must remain bounded')

const roadmap = JSON.parse(raw) as Record<string, unknown>
assert.equal(roadmap.schemaVersion, '1.0.0')
assert.equal(roadmap.roadmapId, 'post-17')

const baseline = roadmap.baseline as Record<string, unknown>
assert.equal(baseline.originalRoadmap, '17/17 complete')
assert.equal(baseline.reopened, false, 'post-17 tracking must not reopen the completed roadmap')

const initiatives = roadmap.initiatives as Array<Record<string, unknown>>
const initiativeIds = new Set(initiatives.map((initiative) => String(initiative.id)))
assert.equal(initiativeIds.size, initiatives.length, 'initiative IDs must be unique')
assert.ok(initiativeIds.has('P17-I1'))
assert.ok(initiativeIds.has('P17-I2'))

const allowedStatuses = new Set(roadmap.statusValues as string[])
const tasks = roadmap.tasks as Array<Record<string, unknown>>
assert.equal(tasks.length, 21, 'catalog must retain the reconciled Wave 0 plus twenty delivery tasks')

const ids = tasks.map((task) => String(task.id))
assert.equal(new Set(ids).size, ids.length, 'task IDs must be unique')
const idSet = new Set(ids)

for (const task of tasks) {
  const id = String(task.id)
  assert.match(id, /^P17-\d{3}$/)
  assert.ok(initiativeIds.has(String(task.initiative)), `${id} references an unknown initiative`)
  assert.ok(allowedStatuses.has(String(task.status)), `${id} uses an unknown status`)
  assert.ok(Number.isInteger(task.wave) && Number(task.wave) >= 0, `${id} must have a non-negative wave`)
  assert.ok(['P0', 'P1', 'P2'].includes(String(task.priority)), `${id} has an invalid priority`)

  for (const field of ['problem', 'evidence']) {
    assert.ok(typeof task[field] === 'string' && String(task[field]).trim(), `${id}.${field} is required`)
  }
  for (const field of ['scope', 'outOfScope', 'packaging', 'acceptanceCriteria', 'tests', 'examples']) {
    assert.ok(Array.isArray(task[field]) && (task[field] as unknown[]).length > 0, `${id}.${field} must be non-empty`)
  }
  assert.ok((task.examples as unknown[]).length >= 2, `${id} needs a positive and failure/edge example`)

  const readiness = task.readiness as Record<string, unknown>
  assert.equal(typeof readiness.complete, 'boolean', `${id}.readiness.complete must be boolean`)
  assert.ok(Array.isArray(readiness.inputs) && (readiness.inputs as unknown[]).length > 0, `${id} needs source inputs`)
  assert.ok(Array.isArray(readiness.missing), `${id}.readiness.missing must be an array`)
  if (readiness.complete) {
    assert.equal((readiness.missing as unknown[]).length, 0, `${id} cannot be complete with missing inputs`)
  }
  if (task.status === 'ready' || task.status === 'in_progress' || task.status === 'done') {
    assert.equal(readiness.complete, true, `${id} cannot run before readiness is complete`)
  }
  if (task.status === 'needs_input') {
    assert.equal(readiness.complete, false, `${id} needs_input must fail closed`)
    assert.ok((readiness.missing as unknown[]).length > 0, `${id} needs_input must name what is missing`)
  }

  for (const dependency of task.dependencies as string[]) {
    assert.ok(idSet.has(dependency), `${id} references unknown dependency ${dependency}`)
    assert.notEqual(dependency, id, `${id} cannot depend on itself`)
  }
}

const markdown = fs.readFileSync(markdownPath, 'utf8')
assert.match(markdown, /No implementation task starts until its `readiness\.complete` value is `true`/)
assert.match(markdown, /transport\/action smoke is\s+never reported as planning or implementation parity/)
for (const id of ids) {
  const row = new RegExp(`^\\| ${id.replace('-', '\\-')} \\|`, 'm')
  assert.match(markdown, row, `${id} must have a summary row in the human-readable catalog`)
}

console.log(`post-17-roadmap.test: PASS (${tasks.length} tasks, ${initiatives.length} initiatives)`)
