import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-004-a2a-provider-local-adapter-runtime-plan.md')

function read(relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split('/'))
  assert.ok(fs.existsSync(absolute), `P17-004 A2A source missing: ${relativePath}`)
  return fs.readFileSync(absolute, 'utf8')
}

const plan = read('docs/roadmap/p17-004-a2a-provider-local-adapter-runtime-plan.md')
for (const marker of [
  'contract=S1, discovery=D1, bytes=B1, mapping=M1, jira=J1, azure=A1, failure=E1, privacy=R1, language=T1, scope=N1',
  '## Architecture decision record',
  '### S1 — One application result schema',
  '### D1 — Discovery is explicit, exact, frozen, and offline',
  '### B1 — Exact bytes are hashed before decoding or parsing',
  '### M1 — Mapping conservation precedes value access',
  '### J1 — Jira parser supports one closed ADF subset',
  '### A1 — Azure DevOps parser supports one closed HTML subset',
  '### E1 — Typed closed failures reveal no source data',
  '### R1 — Durable evidence is metadata only',
  '### T1 — TypeScript remains measured, not assumed',
  '### N1 — A2A local runtime only',
  '## Exact source manifest',
]) assert.ok(plan.includes(marker), `P17-004 A2A plan marker missing: ${marker}`)

for (const nonClaim of [
  'Confluence/local-file parity',
  'P17-004 completion',
  'credential lifecycle',
  'release eligibility',
  'publication',
]) assert.ok(plan.includes(nonClaim), `P17-004 A2A non-claim missing: ${nonClaim}`)

const sourceManifest = [
  'docs/roadmap/p17-004-a2a-provider-local-adapter-runtime-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'docs/schemas/spec-adapter-result.schema.json',
  'package.json',
  'packages/core/README.md',
  'packages/core/src/spec-adapter-azure-devops.ts',
  'packages/core/src/spec-adapter-jira.ts',
  'packages/core/src/spec-adapter-node.ts',
  'packages/core/src/spec-adapter.ts',
  'packages/core/test/spec-adapter-providers.test.ts',
  'packages/core/test/spec-adapter.test.ts',
  'release/public-release-manifest.json',
  'scripts/post-17-spec-adapter-runtime-plan.test.ts',
] as const

// Keep the registered RED anchored on the absent application boundary, not a later schema file.
read('packages/core/src/spec-adapter.ts')

for (const relativePath of sourceManifest) {
  assert.ok(plan.includes(`\`${relativePath}\``), `P17-004 A2A source manifest drift: ${relativePath}`)
  read(relativePath)
}

const roadmap = JSON.parse(read('docs/roadmap/post-17-roadmap.json')) as {
  tasks: Array<{ id: string; status: string; readiness: { complete: boolean }; acceptanceCriteria: string[]; tests: string[] }>
}
const task = roadmap.tasks.find((entry) => entry.id === 'P17-004')
assert.ok(task, 'P17-004 task missing')
assert.equal(task.status, 'in_progress')
assert.equal(task.readiness.complete, true)
assert.deepEqual(task.acceptanceCriteria, [
  'adapters share one output schema',
  'unsupported fields are explicit',
  'instance URL is configuration',
])
assert.deepEqual(task.tests, ['adapter contract suite', 'source parity fixtures', 'malformed source control'])

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.equal(packageJson.scripts['test:post-17-spec-adapter-runtime-plan'], 'npx tsx scripts/post-17-spec-adapter-runtime-plan.test.ts')
assert.equal(packageJson.scripts['test:spec-adapters'], 'npx tsx packages/core/test/spec-adapter.test.ts && npx tsx packages/core/test/spec-adapter-providers.test.ts')
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-spec-adapter-runtime-plan'))
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:spec-adapters'))

for (const forbidden of [
  /\bfetch\s*\(/,
  /node:(?:fs|http|https|net|tls)/,
  /process\.env/,
  /child_process/,
  /\bimport\s*\(/,
  /console\./,
]) {
  for (const relativePath of [
    'packages/core/src/spec-adapter.ts',
    'packages/core/src/spec-adapter-jira.ts',
    'packages/core/src/spec-adapter-azure-devops.ts',
  ]) assert.doesNotMatch(read(relativePath), forbidden, `${relativePath} crosses the A2A offline boundary`)
}

console.log(`post-17-spec-adapter-runtime-plan.test: PASS (${sourceManifest.length} source paths, 10 decision markers, 5 non-claims, 6 offline pattern families across 3 runtime sources)`)
