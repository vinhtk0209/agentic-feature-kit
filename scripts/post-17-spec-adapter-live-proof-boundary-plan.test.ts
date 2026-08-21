import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split('/'))
  assert.ok(fs.existsSync(absolute), `P17-004 A2E source missing: ${relativePath}`)
  return fs.readFileSync(absolute, 'utf8')
}

const plan = read('docs/roadmap/p17-004-a2e-live-proof-boundary-plan.md')
for (const marker of [
  'boundary=B1, input=I1, readiness=R1, provenance=P1, execution=X1, receipt=E1, integrity=H1, failure=F1, privacy=V1, testing=T1, language=L1, scope=N1',
  '## Architecture decision record',
  '### B1 — Pure contract and Node execution stay separate',
  '### I1 — One exact item input plus an existing bearer capability',
  '### R1 — Readiness is explicit and cannot imply execution',
  '### P1 — Live provenance requires the default Node transport',
  '### X1 — At most one read-only execution',
  '### E1 — Durable outcomes are closed metadata only',
  '### H1 — Canonical integrity covers every admitted field',
  '### F1 — Failures never expose provider diagnostics',
  '### V1 — Input and evidence privacy are deny-by-default',
  '### T1 — Synthetic qualification and conditional live proof are distinct',
  '### L1 — TypeScript and Node remain authoritative',
  '### N1 — Live-proof boundary only',
  '## Exact source manifest',
]) assert.ok(plan.includes(marker), `P17-004 A2E plan marker missing: ${marker}`)

for (const source of [
  'https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch',
  'https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptocreatehashalgorithm-options',
  'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
  'https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/',
  'https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops',
  'https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1',
]) assert.ok(plan.includes(source), `P17-004 A2E official source missing: ${source}`)

for (const nonClaim of [
  'provider was contacted',
  'credential works',
  'live compatibility is proven',
  'optional connectors are packaged',
  'P17-004 is complete',
  'P17-019 is ready',
]) assert.ok(plan.includes(nonClaim), `P17-004 A2E non-claim missing: ${nonClaim}`)

const sourceManifest = [
  '.claude/integrations/core/spec-adapter-live-proof-node.ts',
  '.claude/integrations/core/spec-adapter-live-proof.ts',
  'docs/roadmap/p17-004-a2e-live-proof-boundary-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'packages/core/README.md',
  'packages/core/src/spec-adapter-live-proof-node.ts',
  'packages/core/src/spec-adapter-live-proof.ts',
  'packages/core/test/spec-adapter-live-proof.test.ts',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-spec-adapter-live-proof-boundary-plan.test.ts',
] as const

// Keep the registered RED anchored on the absent pure contract first.
read('packages/core/src/spec-adapter-live-proof.ts')

for (const relativePath of sourceManifest) {
  assert.ok(plan.includes(`\`${relativePath}\``), `P17-004 A2E source manifest drift: ${relativePath}`)
  read(relativePath)
}

const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
assert.equal(
  packageJson.scripts['test:post-17-spec-adapter-live-proof-boundary-plan'],
  'npx tsx scripts/post-17-spec-adapter-live-proof-boundary-plan.test.ts',
)
assert.equal(
  packageJson.scripts['test:spec-adapter-live-proof-boundary'],
  'npx tsx packages/core/test/spec-adapter-live-proof.test.ts',
)
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:post-17-spec-adapter-live-proof-boundary-plan'))
assert.ok(packageJson.scripts['test:kit'].includes('npm run test:spec-adapter-live-proof-boundary'))

const pure = read('packages/core/src/spec-adapter-live-proof.ts')
const node = read('packages/core/src/spec-adapter-live-proof-node.ts')
assert.ok(!/(process\.env|readFile|writeFile|console\.|child_process|spawn\(|exec\(|\.env)/.test(pure), 'A2E pure contract gained ambient I/O')
assert.ok(!/(process\.env|readFile|writeFile|console\.|child_process|spawn\(|exec\(|\.env)/.test(node), 'A2E Node runner gained ambient or durable I/O')
assert.ok(node.includes('createNodeSpecAdapterFetchCapability(config, credential)'), 'A2E Node runner must omit injected A2D dependencies')
assert.ok(!node.includes('SpecAdapterFetchNodeDependencies'), 'A2E Node runner must not expose an injectable transport dependency')

console.log(`P17-004 A2E live-proof boundary plan: PASS (${sourceManifest.length} source paths, 12 decisions, 6 non-claims, 6 official-source groups)`)
