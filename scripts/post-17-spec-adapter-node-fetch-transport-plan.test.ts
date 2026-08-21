import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split('/'))
  assert.ok(fs.existsSync(absolute), `P17-004 A2D source missing: ${relativePath}`)
  return fs.readFileSync(absolute, 'utf8')
}

const plan = read('docs/roadmap/p17-004-a2d-node-fetch-transport-plan.md')
for (const marker of [
  'destination=D1, auth=A1, credential=C1, transport=T1, timeout=O1, bytes=B1, failure=E1, privacy=P1, testing=V1, language=L1, scope=N1',
  '## Architecture decision record',
  '### D1 — Bind the exact destination base URL',
  '### A1 — Bearer-only recommended authentication',
  '### C1 — Single-use owned credential capability',
  '### T1 — Narrow Node fetch capability',
  '### O1 — Deadline owns the entire operation',
  '### B1 — Declared and cumulative byte caps',
  '### E1 — Closed failures and no secret-bearing diagnostics',
  '### P1 — Durable evidence is metadata only',
  '### V1 — Adversarial testing before live proof',
  '### L1 — TypeScript/Node remains authoritative',
  '### N1 — Core transport only',
  '## Exact source manifest',
]) assert.ok(plan.includes(marker), `P17-004 A2D plan marker missing: ${marker}`)

for (const source of [
  'https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch',
  'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
  'https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/',
  'https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/',
  'https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops',
  'https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1',
]) assert.ok(plan.includes(source), `P17-004 A2D official source missing: ${source}`)

for (const nonClaim of [
  'provider was contacted',
  'credentials work',
  'optional connectors are packaged',
  'P17-004 is complete',
  'P17-019 is ready',
]) assert.ok(plan.includes(nonClaim), `P17-004 A2D non-claim missing: ${nonClaim}`)

const sourceManifest = [
  '.claude/integrations/core/spec-adapter-fetch-node.ts',
  '.claude/integrations/core/spec-adapter-fetch.ts',
  'docs/roadmap/p17-004-a2d-node-fetch-transport-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'packages/core/README.md',
  'packages/core/src/spec-adapter-fetch-node.ts',
  'packages/core/src/spec-adapter-fetch.ts',
  'packages/core/test/spec-adapter-fetch-node.test.ts',
  'packages/core/test/spec-adapter-fetch.test.ts',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-spec-adapter-node-fetch-transport-plan.test.ts',
] as const

// Keep the registered RED anchored on the absent production transport.
read('packages/core/src/spec-adapter-fetch-node.ts')

for (const relativePath of sourceManifest) {
  assert.ok(plan.includes(`\`${relativePath}\``), `P17-004 A2D source manifest drift: ${relativePath}`)
  read(relativePath)
}

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.equal(
  packageJson.scripts['test:post-17-spec-adapter-node-fetch-transport-plan'],
  'npx tsx scripts/post-17-spec-adapter-node-fetch-transport-plan.test.ts',
)
assert.equal(
  packageJson.scripts['test:spec-adapter-node-fetch-transport'],
  'npx tsx packages/core/test/spec-adapter-fetch-node.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-spec-adapter-node-fetch-transport-plan'))
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:spec-adapter-node-fetch-transport'))

console.log(`P17-004 A2D Node fetch transport plan: PASS (${sourceManifest.length} source paths, 11 decisions, 5 non-claims, 6 official-source groups)`)
