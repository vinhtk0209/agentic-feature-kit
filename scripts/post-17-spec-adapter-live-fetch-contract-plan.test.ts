import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split('/'))
  assert.ok(fs.existsSync(absolute), `P17-004 A2C source missing: ${relativePath}`)
  return fs.readFileSync(absolute, 'utf8')
}

const plan = read('docs/roadmap/p17-004-a2c-single-item-fetch-contract-plan.md')
for (const marker of [
  'boundary=B1, request=Q1, bytes=Y1, jira=J1, azure=Z1, auth=C1, failure=E1, privacy=P1, testing=T1, language=L1, scope=N1',
  '## Architecture decision record',
  '### B1 — Application boundary stays provider-neutral',
  '### Q1 — One deterministic credential-free GET request',
  '### Y1 — Exact response bytes cross into A2A',
  '### J1 — Jira wire metadata is bounded',
  '### Z1 — Azure DevOps wire metadata is bounded',
  '### C1 — Credential and destination authority stays in the port',
  '### E1 — Closed failures and one-call semantics',
  '### P1 — Evidence is metadata only',
  '### T1 — Testing pyramid and acceptance',
  '### L1 — TypeScript remains authoritative',
  '### N1 — Narrow local scope',
  '## Exact source manifest',
]) assert.ok(plan.includes(marker), `P17-004 A2C plan marker missing: ${marker}`)

for (const source of [
  'https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/',
  'https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1',
]) assert.ok(plan.includes(source), `P17-004 A2C official source missing: ${source}`)

for (const nonClaim of [
  'provider was contacted',
  'credentials work',
  'optional connectors are packaged',
  'P17-004 is complete',
  'P17-019 is ready',
]) assert.ok(plan.includes(nonClaim), `P17-004 A2C non-claim missing: ${nonClaim}`)

const sourceManifest = [
  '.claude/integrations/core/spec-adapter-fetch.ts',
  'docs/roadmap/p17-004-a2c-single-item-fetch-contract-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'packages/core/README.md',
  'packages/core/src/spec-adapter-azure-devops.ts',
  'packages/core/src/spec-adapter-fetch.ts',
  'packages/core/src/spec-adapter-jira.ts',
  'packages/core/test/spec-adapter-fetch.test.ts',
  'packages/core/test/spec-adapter-providers.test.ts',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-spec-adapter-live-fetch-contract-plan.test.ts',
] as const

// Keep the registered RED anchored on the absent application boundary.
read('packages/core/src/spec-adapter-fetch.ts')

for (const relativePath of sourceManifest) {
  assert.ok(plan.includes(`\`${relativePath}\``), `P17-004 A2C source manifest drift: ${relativePath}`)
  read(relativePath)
}

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.equal(
  packageJson.scripts['test:post-17-spec-adapter-live-fetch-contract-plan'],
  'npx tsx scripts/post-17-spec-adapter-live-fetch-contract-plan.test.ts',
)
assert.equal(
  packageJson.scripts['test:spec-adapter-live-fetch-contract'],
  'npx tsx packages/core/test/spec-adapter-fetch.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-spec-adapter-live-fetch-contract-plan'))
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:spec-adapter-live-fetch-contract'))

const runtime = read('packages/core/src/spec-adapter-fetch.ts')
for (const forbidden of [
  /\bfetch\s*\(/,
  /node:(?:fs|http|https|net|tls|child_process)/,
  /process\.env/,
  /Authorization/i,
  /\b(?:Bearer|Basic)\b/,
  /console\./,
]) assert.doesNotMatch(runtime, forbidden, 'A2C application contract crossed the credential/I/O boundary')

assert.equal(
  runtime,
  read('.claude/integrations/core/spec-adapter-fetch.ts'),
  'A2C application contract mirror must be byte-identical',
)

console.log(`P17-004 A2C single-item fetch contract plan: PASS (${sourceManifest.length} source paths, 11 decisions, 5 non-claims, 6 static boundary attacks)`)
