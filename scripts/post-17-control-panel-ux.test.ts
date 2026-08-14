import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const adrPath = path.join(root, 'docs', 'design', 'adr-005-control-panel-information-architecture-accessibility.md')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const adr = fs.readFileSync(adrPath, 'utf8')
const normalized = adr.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }

for (const heading of [
  '## Outcome',
  '## Context and current UI baseline',
  '## Requirements',
  '## Recommended decisions',
  '## Route and ownership model IA1',
  '## Navigation model N1',
  '## Page composition and progressive disclosure P1',
  '## Accessibility contract A11Y1',
  '## Responsive contract R1',
  '## Operational state vocabulary S1',
  '## Performance and boundedness PERF1',
  '## Clean Architecture and source ownership',
  '## Verification and evidence V1',
  '## Failure and edge-case matrix',
  '## Options considered',
  '## Trade-offs and consequences',
  '## Rollout and rollback',
  '## Operator decision required',
  '## Action items after approval',
]) assert.ok(adr.includes(heading), `missing Control Panel UX section ${heading}`)

assert.match(adr, /\*\*Status:\*\* Proposed — operator UX\/accessibility approval required/)
assert.match(adr, /\*\*Roadmap task:\*\* P17-021/)

const panel = roadmap.tasks.find((entry) => entry.id === 'P17-021')
assert.ok(panel)
assert.equal(panel.status, 'backlog')
assert.equal(panel.readiness.complete, false)
assert.equal(panel.readiness.missing.length, 9)
assert.ok(!panel.readiness.missing.includes('completed P17-015 machine/task/run/evidence and retry-lineage model'))
assert.ok(panel.readiness.missing.includes('approved Control Panel information architecture and accessibility acceptance'))

for (const choice of ['`IA1`', '`N1`', '`P1`', '`A11Y1`', '`R1`', '`S1`', '`PERF1`', '`V1`']) {
  assert.ok(adr.includes(choice), `missing Control Panel UX choice ${choice}`)
}

for (const route of [
  '/control-plane',
  '/control-plane/machines',
  '/control-plane/machines/[machineId]',
  '/control-plane/tasks',
  '/control-plane/tasks/[taskId]',
  '/control-plane/runs/[runId]',
  '/control-plane/evidence/[sha256]',
  '/control-plane/audit',
]) assert.ok(adr.includes(`\`${route}\``), `missing Control Panel route ${route}`)

for (const contract of [
  'WCAG 2.2 Level AA',
  'first-focus skip link to `#main-content`',
  'no page-level horizontal scrolling',
  '200% browser zoom',
  '320–2,560 CSS pixels',
  '360×800',
  '768×1024',
  '1280×720',
  '1440×900',
  'at most one announcement per second',
  'primary operational actions and mobile controls are at least 44×44 CSS pixels',
  'normal text contrast is at least 4.5:1',
  'One authenticated SSE connection per active page',
  '25 rows by default and 100 maximum',
  'Chromium, Firefox, and WebKit',
  'Windows NVDA keyboard smoke',
  'real-worker E2E',
  'supplements rather than replaces automated and assistive-technology evidence',
]) assert.ok(normalized.toLowerCase().includes(contract.toLowerCase()), `missing UX/accessibility contract: ${contract}`)

for (const state of [
  '`loading`',
  '`empty`',
  '`disabled`',
  '`misconfigured`',
  '`unauthorized`',
  '`partial`',
  '`stale`',
  '`offline`',
  '`reconnecting`',
  '`conflicted`',
  '`integrity_conflict`',
  '`quarantined`',
]) assert.ok(adr.includes(state), `missing operational UI state ${state}`)

assert.match(adr, /APPROVE P17-021 UX v1: routes=IA1, navigation=N1, progression=P1, accessibility=A11Y1, responsive=R1, states=S1, performance=PERF1, verification=V1\./)
assert.match(adr, /does not authorize UI implementation, package installation,\s+test identity creation, browser login, migration, remote execution, deployment, sync, or push/i)
assert.match(adr, /does not mark P17-021\s+ready or done/i)
assert.doesNotMatch(adr, /implementation (is|was) complete/i)

console.log('post-17-control-panel-ux.test: PASS (19 sections, IA1/N1/P1/A11Y1/R1/S1/PERF1/V1 proposed, P17-021 still has 9 gaps)')
