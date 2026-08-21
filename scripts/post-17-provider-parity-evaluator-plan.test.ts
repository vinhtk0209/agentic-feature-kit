import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a2-provider-parity-evaluator-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  'docs/roadmap/p17-007-a2-provider-parity-evaluator-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'docs/schemas/provider-parity-evaluation-report.schema.json',
  'docs/schemas/provider-parity-evaluation-request.schema.json',
  'package.json',
  'packages/core/src/provider-parity-evaluator.ts',
  'packages/core/test/provider-parity-evaluator.test.ts',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-evaluator-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A2 ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

const plan = readRequired(planPath, 'plan')
const normalizedPlan = plan.replace(/\r\n/g, '\n')
const canonicalPlan = normalizedPlan.replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome',
  '## Scope and non-scope',
  '## Architecture decision record',
  '## Clean Architecture',
  '## Closed domain contracts',
  '## Deterministic evaluation algorithm',
  '## Test and evidence ladder',
  '## TypeScript performance decision',
  '## Exact source manifest',
  '## Rollback and next gates',
  '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'pure evaluator',
  'provider-neutral',
  'no process, filesystem, environment, network, provider, credential, clock, database, dashboard, or model call',
  'transport smoke never qualifies',
  'ranking remains forbidden',
  'exact fields',
  'metadata-only',
  '10,000 admitted receipts',
  'p95 50 ms',
  '64 MiB',
  'A3',
  'A4',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
}

assert.match(normalizedPlan, /^Status: approved A2 pure-evaluator implementation; no provider execution\.$/m)

const packageJson = parseRequired(packagePath, 'package')
assert.equal(
  packageJson.scripts?.['test:post-17-provider-parity-evaluator-plan'],
  'npx tsx scripts/post-17-provider-parity-evaluator-plan.test.ts',
)
assert.equal(
  packageJson.scripts?.['test:provider-parity-evaluator'],
  'npx tsx packages/core/test/provider-parity-evaluator.test.ts',
)
const fullSuiteRegistration = `${packageJson.scripts?.['pretest:kit'] ?? ''} ${packageJson.scripts?.['test:kit'] ?? ''}`
for (const command of [
  'npm run test:post-17-provider-parity-evaluator-plan',
  'npm run test:provider-parity-evaluator',
]) assert.ok(fullSuiteRegistration.includes(command), `full kit suite missing ${command}`)

const manifest = parseRequired(manifestPath, 'public manifest')
assert.ok(Array.isArray(manifest.entries), 'public manifest entries must be an array')
const manifestPaths = manifest.entries.map((entry: JsonRecord) => entry.path)
assert.equal(new Set(manifestPaths).size, manifestPaths.length, 'public manifest paths must be unique')
assert.deepEqual(manifestPaths, [...manifestPaths].sort(), 'public manifest paths must be JavaScript-ordinal sorted')
for (const publicPath of sourceManifest.filter((entry) => !['package.json', 'release/public-release-manifest.json'].includes(entry))) {
  const matches: JsonRecord[] = manifest.entries.filter((entry: JsonRecord) => entry.path === publicPath)
  assert.equal(matches.length, 1, `public manifest must contain exactly one ${publicPath}`)
  assert.equal(matches[0]?.decision, 'include')
  assert.equal(matches[0]?.contentKind, 'text')
  assert.equal(matches[0]?.reasonCode, 'public-source')
}

console.log(`post-17-provider-parity-evaluator-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 12 boundary phrases)`)
