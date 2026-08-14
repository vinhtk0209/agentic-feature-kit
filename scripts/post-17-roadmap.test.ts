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
assert.equal(tasks.length, 22, 'catalog must retain the reconciled Wave 0 plus twenty-one delivery tasks')

const ids = tasks.map((task) => String(task.id))
assert.equal(new Set(ids).size, ids.length, 'task IDs must be unique')
assert.deepEqual(ids, Array.from({ length: 22 }, (_, index) => `P17-${String(index).padStart(3, '0')}`), 'P17-021 must append without renumbering existing tasks')
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

const controlPanel = tasks.find((task) => task.id === 'P17-021')!
assert.deepEqual(controlPanel.dependencies, ['P17-014', 'P17-015', 'P17-016'])
assert.equal((controlPanel.readiness as Record<string, unknown>).complete, false)
assert.ok(((controlPanel.readiness as Record<string, unknown>).missing as string[]).includes('approved network-separated or two-node E2E topology'))
assert.ok((controlPanel.acceptanceCriteria as string[]).some((criterion) => criterion.includes('without mock substitution')))
assert.ok((controlPanel.tests as string[]).includes('Playwright exact-dashboard-server E2E with a real disposable worker'))
const controlPanelPlan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-021-distributed-control-panel-plan.md'), 'utf8')
for (const required of ['/control-plane', 'Control Panel', 'Control Plane', 'remote worker', 'RBAC', 'Playwright', 'network-separated/two-node']) assert.match(controlPanelPlan, new RegExp(required.replace('/', '\\/'), 'i'))

const crossMachineProgress = tasks.find((task) => task.id === 'P17-015')!
assert.equal(crossMachineProgress.status, 'done')
assert.equal((crossMachineProgress.readiness as Record<string, unknown>).complete, true)
assert.deepEqual((crossMachineProgress.readiness as Record<string, unknown>).missing, [])
const crossMachineProgressPlan = fs.readFileSync(path.join(root, 'docs', 'roadmap', 'p17-015-cross-machine-progress-plan.md'), 'utf8')
for (const required of ['/roadmap/[taskId]', 'opaque operator-assigned machine UUID', 'linear retry', 'hash-chained progress events', 'service-role-only', 'concurrent two-machine', 'P17-014', 'P17-016', 'P17-021']) {
  assert.ok(crossMachineProgressPlan.toLowerCase().includes(required.toLowerCase()), `P17-015 plan must retain ${required}`)
}

const phaseModelRouting = tasks.find((task) => task.id === 'P17-006')!
assert.equal(phaseModelRouting.status, 'done')
assert.equal((phaseModelRouting.readiness as Record<string, unknown>).complete, true)
assert.deepEqual((phaseModelRouting.readiness as Record<string, unknown>).missing, [])
assert.ok(((phaseModelRouting.readiness as Record<string, unknown>).inputs as string[]).includes('docs/roadmap/post-17-phase-capability-matrix.json'))
assert.ok(fs.existsSync(path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json')))

const publicRelease = tasks.find((task) => task.id === 'P17-018')!
assert.equal(publicRelease.status, 'backlog', 'P17-018 stays dependency-blocked after its inputs are locked')
assert.equal((publicRelease.readiness as Record<string, unknown>).complete, true)
assert.deepEqual((publicRelease.readiness as Record<string, unknown>).missing, [])
assert.ok(((publicRelease.readiness as Record<string, unknown>).inputs as string[]).includes('docs/roadmap/p17-018-public-release-plan.md'))
assert.ok(fs.existsSync(path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')))

const markdown = fs.readFileSync(markdownPath, 'utf8')
assert.match(markdown, /No implementation task starts until its `readiness\.complete` value is `true`/)
assert.match(markdown, /transport\/action smoke is\s+never reported as planning or implementation parity/)
for (const id of ids) {
  const row = new RegExp(`^\\| ${id.replace('-', '\\-')} \\|`, 'm')
  assert.match(markdown, row, `${id} must have a summary row in the human-readable catalog`)
}

console.log(`post-17-roadmap.test: PASS (${tasks.length} tasks, ${initiatives.length} initiatives)`)
