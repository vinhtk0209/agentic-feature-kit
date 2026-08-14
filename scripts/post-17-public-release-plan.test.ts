import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-public-release-plan.md')
const roadmapPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const packagingPath = path.join(root, 'docs', 'roadmap', 'post-17-provider-packaging.json')
const licensePath = path.join(root, 'LICENSE')
const packagePath = path.join(root, 'package.json')
const plan = fs.readFileSync(planPath, 'utf8')
const normalizedPlan = plan.replace(/\s+/g, ' ')
const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as { tasks: Array<Record<string, any>> }
const packaging = JSON.parse(fs.readFileSync(packagingPath, 'utf8')) as Record<string, any>
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as Record<string, any>

for (const heading of [
  '## Outcome',
  '## Decision authority',
  '## Audience decision A1',
  '## License decision L1',
  '## Current-state reconciliation',
  '## Product and naming contract',
  '## Version and release model',
  '## Documentation architecture',
  '## Governance, support, and security boundary',
  '## CI, nightly, and failure visibility',
  '## Clean-clone and package contract',
  '## Supply-chain and provenance boundary',
  '## Compatibility and deprecation policy',
  '## Edge cases and failure modes',
  '## Implementation plan',
  '## Verification and evidence ladder',
  '## Rollback and external-action boundary',
  '## Completion boundary',
]) assert.ok(plan.includes(heading), `missing release-plan section ${heading}`)

const task = roadmap.tasks.find((entry) => entry.id === 'P17-018')
assert.ok(task)
assert.equal(task.status, 'backlog', 'P17-018 must remain backlog until dependencies and implementation evidence pass')
assert.equal(task.readiness.complete, true, 'A1/L1 must close the only named P17-018 input gap')
assert.deepEqual(task.readiness.missing, [])
assert.deepEqual(task.dependencies, ['P17-008', 'P17-009', 'P17-013'])
assert.ok(task.readiness.inputs.includes('docs/roadmap/p17-018-public-release-plan.md'))
assert.ok(task.readiness.inputs.includes('LICENSE (Apache-2.0)'))

assert.match(fs.readFileSync(licensePath, 'utf8'), /Apache License\s+Version 2\.0, January 2004/)
assert.equal(packaging.distributionBoundary.licenseBoundary.includes('Apache-2.0'), true)
assert.equal(packageJson.private, true, 'public repository readiness must not silently enable npm publication')

for (const phrase of [
  'Canonical public display name: **Agentic Feature Kit**.',
  'Canonical repository and manifest slug: `agentic-feature-kit`.',
  'Stable archive name: `agentic-feature-kit-<provider>-<bundleVersion>.zip`.',
  'External software engineers and technical leads',
  'Retain **Apache-2.0**',
  'The license grants no trademark permission.',
  'Root `package.json` remains `private: true`.',
  'GitHub Private Vulnerability Reporting/Security Advisories',
  'GitHub Actions must be pinned to reviewed immutable commit SHAs',
  'Generate an SPDX or CycloneDX SBOM',
  'P17-009 must first prove the current Windows/Linux workflow from a real remote run.',
  'No public artifact is required or authorized to prove readiness.',
]) assert.ok(normalizedPlan.includes(phrase), `missing release policy contract: ${phrase}`)

for (const gap of [
  '`CONTRIBUTING.md`',
  '`SECURITY.md`',
  '`SUPPORT.md`',
  'changelog stops at 3.18',
  'No `schedule`',
  'hardcoded project-specific Supabase URLs/refs',
]) assert.ok(normalizedPlan.includes(gap), `missing current release gap: ${gap}`)

assert.match(plan, /fresh `git clone --no-hardlinks`/)
assert.match(plan, /paths with spaces or Unicode; CRLF/i)
assert.match(plan, /archive traversal, symlink\/reparse entries, duplicate\/case-colliding names/i)
assert.match(plan, /No sync, push, tag, release, visibility change, npm publish, marketplace submission/i)
assert.doesNotMatch(plan, /implementation (is|was) complete/i)

console.log('post-17-public-release-plan.test: PASS (18 sections, A1/L1 locked, P17-018 input-complete and dependency-blocked)')
