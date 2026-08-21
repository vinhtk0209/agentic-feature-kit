import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a3b2a-fixture-lifecycle-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  '.claude/integrations/provider-parity-fixture-node.test.ts',
  '.claude/integrations/provider-parity-fixture-node.ts',
  'docs/design/multi-provider-backends.md',
  'docs/roadmap/p17-007-a3b2a-fixture-lifecycle-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-fixture-lifecycle-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A3B2A ${label} missing: ${path.relative(root, file)}`)
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
  '## Reconciled evidence and prerequisites',
  '## Scope and non-scope',
  '## Architecture decision record',
  '## Golden admission and materialization contract',
  '## Cleanup, lifecycle, and privacy contract',
  '## Attack and evidence ladder',
  '## TypeScript performance decision',
  '## Exact source manifest',
  '## Rollback and next gates',
  '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'golden=G1', 'ownership=O1', 'paths=P1', 'materialize=M1', 'inventory=I1',
  'cleanup=C1', 'lifecycle=L1', 'evidence=E1', 'runtime=T1', 'scope=N1',
  'direct-child', 'exclusive', 'lstat', 'junction', 'zero residue', 'one-use',
  'metadata only', '100 complete', 'zero provider execution', 'A3B2B', 'A4 remains prohibited',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

assert.match(normalizedPlan, /^Status: approved A3B2A offline fixture-lifecycle implementation; zero provider execution\.$/m)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
  assert.ok(fs.existsSync(path.join(root, source)), `source manifest path missing: ${source}`)
}

const packageJson = parseRequired(packagePath, 'package')
assert.equal(packageJson.scripts?.['test:post-17-provider-parity-fixture-lifecycle-plan'], 'npx tsx scripts/post-17-provider-parity-fixture-lifecycle-plan.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-fixture-lifecycle-node'], 'npx tsx .claude/integrations/provider-parity-fixture-node.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-fixture-lifecycle'], 'npm run test:post-17-provider-parity-fixture-lifecycle-plan && npm run test:provider-parity-fixture-lifecycle-node')
const foundationRoute = packageJson.scripts?.['test:kit:foundation'] ?? ''
const mainRoute = packageJson.scripts?.['test:kit'] ?? ''
assert.ok(mainRoute.startsWith('npm run test:kit:foundation && '), 'full kit must begin with the Windows-safe foundation route')
assert.ok(foundationRoute.length > 0 && foundationRoute.length < 2_000, 'foundation route must stay bounded')
assert.ok(mainRoute.length < 7_500, 'main full-kit route must remain below the locked Windows-safe ceiling')
const routedCommands = [
  ...foundationRoute.split(' && '),
  ...mainRoute.split(' && ').slice(1),
]
assert.equal(routedCommands.length, 192, 'full kit command count drifted')
assert.equal(new Set(routedCommands).size, routedCommands.length, 'full kit commands must remain unique')
assert.equal(routedCommands[0], 'npm run test:lint-feature')
assert.equal(routedCommands.at(-1), 'npm run check:lessons-sync')
const fullSuiteRegistration = `${packageJson.scripts?.['pretest:kit'] ?? ''} ${foundationRoute} ${mainRoute}`
assert.ok(fullSuiteRegistration.includes('npm run test:provider-parity-fixture-lifecycle'), 'full kit suite missing A3B2A aggregate')

const roadmap = readRequired(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md'), 'human roadmap')
assert.match(roadmap, /A3B2A adds the provider-neutral\s+isolated fixture lifecycle/)
const architecture = readRequired(path.join(root, 'docs', 'design', 'multi-provider-backends.md'), 'architecture')
assert.match(architecture, /P17-007 A3B2A adds a provider-neutral one-use filesystem lifecycle/)

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

console.log(`post-17-provider-parity-fixture-lifecycle-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 21 boundary phrases)`)
