import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a3b3b-a2-receipt-composition-plan.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  '.claude/integrations/provider-parity-receipt-composer.test.ts',
  '.claude/integrations/provider-parity-receipt-composer.ts',
  'docs/design/multi-provider-backends.md',
  'docs/roadmap/p17-007-a3b3b-a2-receipt-composition-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'packages/core/src/provider-parity-evaluator.ts',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-attestation-plan.test.ts',
  'scripts/post-17-provider-parity-candidate-verifier-plan.test.ts',
  'scripts/post-17-provider-parity-receipt-composition-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A3B3B ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

const plan = readRequired(planPath, 'plan')
const normalizedPlan = plan.replace(/\r\n/g, '\n')
const canonicalPlan = normalizedPlan.replace(/\s+/g, ' ')

for (const heading of [
  '## Outcome', '## Reconciled sources and prerequisites', '## Scope and non-scope',
  '## Architecture decision record', '## Exact field mapping',
  '## Validation and privacy boundary', '## Attack and evidence ladder',
  '## TypeScript performance decision', '## Exact source manifest',
  '## Rollback and next gates', '## Non-claims',
]) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)

for (const phrase of [
  'domain=D1', 'source=S1', 'eligibility=E1', 'mapping=M1', 'validation=V1', 'hash=H1',
  'privacy=P1', 'immutability=I1', 'runtime=N1', 'scope=O1',
  'eligibleForA2Composition', 'candidateVerification.candidateTreeSha256',
  'not A3B3A `identity.materializedTreeSha256`', 'state: "completed"', 'reasonCodes: []',
  'A2 receipt validator', 'deeply immutable', 'metadata-only', '10,000',
  'A4 remains prohibited', 'zero provider execution',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)

assert.match(normalizedPlan, /^Status: approved A3B3B pure success-receipt composition; zero provider execution\.$/m)

for (const source of sourceManifest) {
  assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
  assert.ok(fs.existsSync(path.join(root, source)), `source manifest path missing: ${source}`)
}

const packageJson = parseRequired(packagePath, 'package')
assert.equal(packageJson.scripts?.['test:post-17-provider-parity-receipt-composition-plan'], 'npx tsx scripts/post-17-provider-parity-receipt-composition-plan.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-receipt-composer-node'], 'npx tsx .claude/integrations/provider-parity-receipt-composer.test.ts')
assert.equal(packageJson.scripts?.['test:provider-parity-receipt-composition'], 'npm run test:provider-parity-attestation && npm run test:post-17-provider-parity-receipt-composition-plan && npm run test:provider-parity-receipt-composer-node')
assert.equal(packageJson.scripts?.['test:provider-parity-candidate-verifier'], 'npm run test:post-17-provider-parity-candidate-verifier-plan && npm run test:provider-parity-candidate-node && npm run test:provider-parity-receipt-composition')
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
assert.ok(mainRoute.includes('npm run test:provider-parity-candidate-verifier'), 'A3B3B aggregate must remain in the full suite')

const evaluator = readRequired(path.join(root, 'packages', 'core', 'src', 'provider-parity-evaluator.ts'), 'A2 evaluator')
assert.match(evaluator, /export function assertProviderParityCandidateReceipt/)
const roadmap = readRequired(path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md'), 'human roadmap')
assert.match(roadmap, /A3B3B adds the pure success-only A2 receipt composer/)
const architecture = readRequired(path.join(root, 'docs', 'design', 'multi-provider-backends.md'), 'architecture')
assert.match(architecture, /P17-007 A3B3B adds one pure success-only composer/)

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

console.log(`post-17-provider-parity-receipt-composition-plan.test: PASS (${sourceManifest.length} source paths, 11 headings, 21 boundary phrases)`)
