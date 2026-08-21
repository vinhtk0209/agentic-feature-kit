import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a3b2b-candidate-verifier-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  '.claude/integrations/provider-parity-candidate-node.test.ts',
  '.claude/integrations/provider-parity-candidate-node.ts',
  'docs/design/multi-provider-backends.md',
  'docs/roadmap/p17-007-a3b2b-candidate-verifier-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-candidate-verifier-plan.test.ts',
  'scripts/post-17-provider-parity-fixture-lifecycle-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A3B2B ${label} missing: ${path.relative(root, file)}`)
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
  '## Candidate inventory and violation contract',
  '## Trusted test and mutation contract',
  '## Attack and evidence ladder',
  '## TypeScript performance decision',
  '## Exact source manifest',
  '## Rollback and next gates',
  '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'candidate=C1', 'identity=I1', 'paths=P1', 'dependencies=D1', 'privacy=S1',
  'permissions=M1', 'test=T1', 'process=X1', 'mutation=U1', 'evidence=E1',
  'runtime=N1', 'scope=O1', 'exactly one', 'node --test test/report.test.js',
  'lockedPathEdit', 'undeclaredPath', 'externalDependency', 'secretOrPathDisclosure',
  'permissionWidening', 'metadata-only', '100 complete', 'zero provider execution',
  'A3B3', 'A4 remains prohibited',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

assert.match(normalizedPlan, /^Status: approved A3B2B offline candidate-verifier implementation; zero provider execution\.$/m)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
  assert.ok(fs.existsSync(path.join(root, source)), `source manifest path missing: ${source}`)
}

const packageJson = parseRequired(packagePath, 'package')
assert.equal(packageJson.scripts?.['test:post-17-provider-parity-candidate-verifier-plan'], 'npx tsx scripts/post-17-provider-parity-candidate-verifier-plan.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-candidate-node'], 'npx tsx .claude/integrations/provider-parity-candidate-node.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-candidate-verifier'], 'npm run test:post-17-provider-parity-candidate-verifier-plan && npm run test:provider-parity-candidate-node')
const foundationRoute = packageJson.scripts?.['test:kit:foundation'] ?? ''
const mainRoute = packageJson.scripts?.['test:kit'] ?? ''
assert.ok(mainRoute.startsWith('npm run test:kit:foundation && '), 'full kit must begin with the Windows-safe foundation route')
assert.ok(foundationRoute.length > 0 && foundationRoute.length < 2_000, 'foundation route must stay bounded')
assert.ok(mainRoute.length < 7_500, 'main full-kit route must remain below the locked Windows-safe ceiling')
const routedCommands = [...foundationRoute.split(' && '), ...mainRoute.split(' && ').slice(1)]
assert.equal(routedCommands.length, 193, 'full kit command count drifted')
assert.equal(new Set(routedCommands).size, routedCommands.length, 'full kit commands must remain unique')
assert.equal(routedCommands[0], 'npm run test:lint-feature')
assert.equal(routedCommands.at(-1), 'npm run check:lessons-sync')
assert.ok(mainRoute.includes('npm run test:provider-parity-fixture-lifecycle && npm run test:provider-parity-candidate-verifier'), 'A3B2B must follow A3B2A in the full suite')

const roadmap = readRequired(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md'), 'human roadmap')
assert.match(roadmap, /A3B2B adds independent candidate inventory and trusted-test execution/)
const architecture = readRequired(path.join(root, 'docs', 'design', 'multi-provider-backends.md'), 'architecture')
assert.match(architecture, /P17-007 A3B2B adds the provider-neutral candidate verifier/)

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

console.log(`post-17-provider-parity-candidate-verifier-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 23 boundary phrases)`)
