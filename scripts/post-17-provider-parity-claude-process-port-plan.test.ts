import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a3b1-claude-process-port-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  '.claude/integrations/claude-cli-process-node.test.ts',
  '.claude/integrations/claude-cli-process-node.ts',
  'docs/design/multi-provider-backends.md',
  'docs/roadmap/p17-007-a3b1-claude-process-port-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-claude-process-port-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A3B1 ${label} missing: ${path.relative(root, file)}`)
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
  '## Process and environment contract',
  '## Bounded lifecycle and privacy',
  '## Attack and evidence ladder',
  '## TypeScript performance decision',
  '## Exact source manifest',
  '## Rollback and next gates',
  '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'deny-default',
  'never reads `process.env`',
  'shell:false',
  'exact isolated root',
  'process-tree terminator',
  'termination grace',
  'raw bytes',
  'offline fake-child',
  'zero provider execution',
  '32-MiB',
  'A3B2',
  'A4 remains prohibited',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
  assert.ok(fs.existsSync(path.join(root, source)), `source manifest path missing: ${source}`)
}

assert.match(normalizedPlan, /^Status: approved A3B1 offline process-boundary implementation; zero provider execution\.$/m)

const packageJson = parseRequired(packagePath, 'package')
assert.equal(
  packageJson.scripts?.['test:post-17-provider-parity-claude-process-port-plan'],
  'npx tsx scripts/post-17-provider-parity-claude-process-port-plan.test.ts',
)
assert.equal(
  packageJson.scripts?.['test:claude-cli-process-port'],
  'npx tsx .claude/integrations/claude-cli-process-node.test.ts',
)
assert.equal(
  packageJson.scripts?.['test:provider-parity-claude-process-port'],
  'npm run test:post-17-provider-parity-claude-process-port-plan && npm run test:claude-cli-process-port',
)
const fullSuiteRegistration = `${packageJson.scripts?.['pretest:kit'] ?? ''} ${packageJson.scripts?.['test:kit'] ?? ''}`
assert.ok(fullSuiteRegistration.includes('npm run test:provider-parity-claude-process-port'), 'full kit suite missing A3B1 aggregate')

const roadmap = readRequired(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md'), 'human roadmap')
assert.match(roadmap, /A3B1 adds a deny-default Claude Node process port/)
const architecture = readRequired(path.join(root, 'docs', 'design', 'multi-provider-backends.md'), 'architecture')
assert.match(architecture, /P17-007 A3B1 adds the Node infrastructure implementation/)

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

console.log(`post-17-provider-parity-claude-process-port-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 12 boundary phrases)`)
