import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a3b3a-policy-evidence-attestation-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  '.claude/integrations/provider-parity-attestation.test.ts',
  '.claude/integrations/provider-parity-attestation.ts',
  'docs/design/multi-provider-backends.md',
  'docs/roadmap/p17-007-a3b3a-policy-evidence-attestation-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-attestation-plan.test.ts',
  'scripts/post-17-provider-parity-candidate-verifier-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A3B3A ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

const plan = readRequired(planPath, 'plan')
const normalizedPlan = plan.replace(/\r\n/g, '\n')
const canonicalPlan = normalizedPlan.replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome', '## Reconciled evidence and prerequisites', '## Scope and non-scope',
  '## Architecture decision record', '## Pre-run policy attestation contract',
  '## Post-run evidence attestation contract', '## Attack and evidence ladder',
  '## TypeScript performance decision', '## Exact source manifest',
  '## Rollback and next gates', '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'domain=D1', 'identity=I1', 'policy=P1', 'hooks=H1', 'evidence=E1', 'metrics=M1',
  'verification=V1', 'cleanup=C1', 'privacy=R1', 'runtime=N1', 'scope=O1',
  'isolated-empty-v1', 'independently-attested-v1', 'independently-attested-empty-v1',
  'AC-1..AC-3', 'plan', 'implementation', 'trusted-verification', 'B3/B10/B11',
  'A3B2B', 'A3B2A', 'metadata-only', '10,000', 'A3B3B', 'A4 remains prohibited',
  'zero provider execution',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

assert.match(normalizedPlan, /^Status: approved A3B3A pure attestation implementation; zero provider execution\.$/m)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
  assert.ok(fs.existsSync(path.join(root, source)), `source manifest path missing: ${source}`)
}

const packageJson = parseRequired(packagePath, 'package')
assert.equal(packageJson.scripts?.['test:post-17-provider-parity-attestation-plan'], 'npx tsx scripts/post-17-provider-parity-attestation-plan.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-attestation-node'], 'npx tsx .claude/integrations/provider-parity-attestation.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-attestation'], 'npm run test:post-17-provider-parity-attestation-plan && npm run test:provider-parity-attestation-node')
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
assert.equal(packageJson.scripts?.['test:provider-parity-candidate-verifier'], 'npm run test:post-17-provider-parity-candidate-verifier-plan && npm run test:provider-parity-candidate-node && npm run test:provider-parity-receipt-composition')
assert.ok(mainRoute.includes('npm run test:provider-parity-candidate-verifier'), 'A3B2B/A3B3A aggregate must remain in the full suite')

const roadmap = readRequired(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md'), 'human roadmap')
assert.match(roadmap, /A3B3A adds the pure policy and evidence attestation boundary/)
const architecture = readRequired(path.join(root, 'docs', 'design', 'multi-provider-backends.md'), 'architecture')
assert.match(architecture, /P17-007 A3B3A adds the provider-neutral pure attestation boundary/)

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

console.log(`post-17-provider-parity-attestation-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 27 boundary phrases)`)
