import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { hashPhaseContract } from '../packages/core/src/phase-model-router'
import { validateSemanticSpec } from '../packages/core/src/semantic-spec'

type JsonRecord = Record<string, any>

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-007-a1-provider-parity-input-lock-plan.md')
const fixturePath = path.join(root, 'docs', 'roadmap', 'fixtures', 'p17-007-provider-parity-golden.json')
const matrixPath = path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json')
const roadmapJsonPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.json')
const roadmapMarkdownPath = path.join(root, 'docs', 'roadmap', 'post-17-roadmap.md')
const packagePath = path.join(root, 'package.json')
const manifestPath = path.join(root, 'release', 'public-release-manifest.json')

const sourceManifest = [
  'docs/roadmap/fixtures/p17-007-provider-parity-golden.json',
  'docs/roadmap/p17-007-a1-provider-parity-input-lock-plan.md',
  'docs/roadmap/post-17-roadmap.json',
  'docs/roadmap/post-17-roadmap.md',
  'package.json',
  'release/public-release-manifest.json',
  'scripts/post-17-provider-parity-input-lock-plan.test.ts',
] as const

function readRequired(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`P17-007 A1 ${label} missing: ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function parseRequired(file: string, label: string): JsonRecord {
  return JSON.parse(readRequired(file, label)) as JsonRecord
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

function digest(value: unknown): string {
  const bytes = typeof value === 'string' ? value : JSON.stringify(stableValue(value))
  return crypto.createHash('sha256').update(bytes, 'utf8').digest('hex')
}

function assertExactKeys(value: JsonRecord, expected: string[], label: string): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted`)
}

function assertRoadmapReady(task: JsonRecord): void {
  assert.equal(task.id, 'P17-007')
  assert.equal(task.status, 'in_progress', 'P17-007 must become in_progress after A1 input lock')
  assert.equal(task.readiness?.complete, true, 'P17-007 readiness must be complete')
  assert.deepEqual(task.readiness?.missing, [], 'P17-007 readiness must have no unresolved A1 inputs')
  for (const input of [
    'docs/roadmap/fixtures/p17-007-provider-parity-golden.json',
    'docs/roadmap/p17-007-a1-provider-parity-input-lock-plan.md',
    'operator-approved bounded external-provider execution boundary (2026-08-21)',
  ]) assert.ok(task.readiness?.inputs?.includes(input), `P17-007 readiness missing ${input}`)
}

function validateGoldenFixture(fixture: JsonRecord, matrix: JsonRecord): void {
  assertExactKeys(fixture, [
    'schemaVersion',
    'fixtureId',
    'fixtureRevision',
    'classification',
    'provenance',
    'providerTargets',
    'taskPrompt',
    'taskPromptSha256',
    'semanticSpec',
    'semanticSpecSha256',
    'phaseBindings',
    'repositorySeed',
    'evaluationPolicy',
  ], 'fixture')
  assert.equal(fixture.schemaVersion, '1.0.0')
  assert.equal(fixture.fixtureId, 'p17-007-provider-parity-golden')
  assert.equal(fixture.fixtureRevision, 1)
  assert.equal(fixture.classification, 'synthetic-public')
  assert.deepEqual(fixture.providerTargets, ['codex', 'claude', 'copilot'])

  assertExactKeys(fixture.provenance, [
    'kind', 'createdFor', 'license', 'containsCustomerData', 'containsCredentials',
    'containsPrivateSpecification', 'containsPersonalData',
  ], 'fixture.provenance')
  assert.equal(fixture.provenance.kind, 'synthetic')
  assert.equal(fixture.provenance.createdFor, 'P17-007')
  assert.equal(fixture.provenance.license, 'Apache-2.0')
  for (const field of ['containsCustomerData', 'containsCredentials', 'containsPrivateSpecification', 'containsPersonalData']) {
    assert.equal(fixture.provenance[field], false, `fixture provenance ${field} must be false`)
  }

  assert.equal(fixture.taskPromptSha256, digest(fixture.taskPrompt), 'task prompt hash drifted')
  assert.equal(fixture.semanticSpecSha256, digest(fixture.semanticSpec), 'semantic spec hash drifted')
  const semanticSpec = validateSemanticSpec(fixture.semanticSpec)
  assert.deepEqual(semanticSpec.requirements.map((entry) => entry.id), ['AC-1', 'AC-2', 'AC-3'])

  assert.deepEqual(fixture.phaseBindings.map((entry: JsonRecord) => entry.phaseId), ['B3', 'B10', 'B11'])
  for (const binding of fixture.phaseBindings) {
    assertExactKeys(binding, ['phaseId', 'purpose', 'phaseContractSha256'], `phase binding ${binding.phaseId}`)
    assert.equal(binding.phaseContractSha256, hashPhaseContract(matrix, binding.phaseId), `${binding.phaseId} contract hash drifted`)
  }

  assertExactKeys(fixture.repositorySeed, [
    'runtime', 'files', 'seedTreeSha256', 'lockedPaths', 'allowedWritePaths', 'testCommand',
    'expectedInitialStatus', 'expectedInitialFailureMarker',
  ], 'fixture.repositorySeed')
  assert.equal(fixture.repositorySeed.runtime, 'node>=20')
  assert.deepEqual(fixture.repositorySeed.testCommand, ['node', '--test', 'test/report.test.js'])
  assert.equal(fixture.repositorySeed.expectedInitialStatus, 'failed')
  assert.equal(fixture.repositorySeed.expectedInitialFailureMarker, 'P17-007 fixture: implementation missing')
  assert.deepEqual(fixture.repositorySeed.lockedPaths, ['AGENTS.md', 'package.json', 'spec/semantic-spec.json', 'test/report.test.js'])
  assert.deepEqual(fixture.repositorySeed.allowedWritePaths, ['docs/plan.md', 'src/report.js', 'test/report.additional.test.js'])

  const filePaths = fixture.repositorySeed.files.map((entry: JsonRecord) => entry.path)
  assert.deepEqual(filePaths, [...filePaths].sort(), 'fixture seed paths must be ordinal sorted')
  assert.equal(new Set(filePaths).size, filePaths.length, 'fixture seed paths must be unique')
  for (const file of fixture.repositorySeed.files) {
    assertExactKeys(file, ['path', 'content', 'sha256'], `seed file ${file.path}`)
    assert.equal(path.isAbsolute(file.path), false, `seed path must be relative: ${file.path}`)
    assert.equal(file.path.split('/').includes('..'), false, `seed path traversal blocked: ${file.path}`)
    assert.equal(file.sha256, digest(file.content), `seed file hash drifted: ${file.path}`)
  }
  const seededSpec = fixture.repositorySeed.files.find((entry: JsonRecord) => entry.path === 'spec/semantic-spec.json')
  assert.ok(seededSpec, 'fixture seed must include the normalized semantic spec')
  assert.deepEqual(JSON.parse(seededSpec.content), fixture.semanticSpec, 'seeded semantic spec must match fixture input')
  assert.equal(
    fixture.repositorySeed.seedTreeSha256,
    digest(fixture.repositorySeed.files.map((entry: JsonRecord) => ({ path: entry.path, sha256: entry.sha256 }))),
    'fixture seed tree hash drifted',
  )

  assertExactKeys(fixture.evaluationPolicy, [
    'requiredProviderCount', 'minimumSemanticRunsPerProvider', 'minimumPerformanceRunsPerProvider',
    'requiredAcceptanceCriterionCoverage', 'requiredArtifactCoverage', 'requiredGateConservation',
    'trustedVerificationRequired', 'transportSmokeMayQualify', 'providerRankingWhenIncomplete',
    'maxRunDurationMs', 'maxCapturedOutputBytes', 'attemptsPerRun', 'retainedContent',
  ], 'fixture.evaluationPolicy')
  assert.equal(fixture.evaluationPolicy.requiredProviderCount, 3)
  assert.equal(fixture.evaluationPolicy.minimumSemanticRunsPerProvider, 1)
  assert.equal(fixture.evaluationPolicy.minimumPerformanceRunsPerProvider, 5)
  assert.equal(fixture.evaluationPolicy.requiredAcceptanceCriterionCoverage, 1)
  assert.equal(fixture.evaluationPolicy.requiredArtifactCoverage, 1)
  assert.equal(fixture.evaluationPolicy.requiredGateConservation, 1)
  assert.equal(fixture.evaluationPolicy.trustedVerificationRequired, true)
  assert.equal(fixture.evaluationPolicy.transportSmokeMayQualify, false)
  assert.equal(fixture.evaluationPolicy.providerRankingWhenIncomplete, 'forbidden')
  assert.equal(fixture.evaluationPolicy.attemptsPerRun, 1)
  assert.deepEqual(fixture.evaluationPolicy.retainedContent, ['closed-status', 'counts', 'hashes', 'timings', 'token-usage', 'cost'])
}

function proveInitialRed(fixture: JsonRecord): void {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p17-007-a1-'))
  try {
    for (const file of fixture.repositorySeed.files) {
      const target = path.join(tempRoot, ...file.path.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, file.content, 'utf8')
    }
    const run = spawnSync(process.execPath, ['--test', 'test/report.test.js'], {
      cwd: tempRoot,
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
      env: Object.fromEntries(
        ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []),
      ),
    })
    assert.equal(run.status, 1, `fixture seed must begin RED, got ${run.status}: ${run.error?.message ?? ''}`)
    assert.match(`${run.stdout}\n${run.stderr}`, /P17-007 fixture: implementation missing/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

const plan = readRequired(planPath, 'plan')
const normalizedPlan = plan.replace(/\r\n/g, '\n')
const canonicalPlan = normalizedPlan.replace(/\s+/g, ' ')
const requiredHeadings = [
  '## Outcome',
  '## Current evidence and official boundaries',
  '## Architecture decision record',
  '### G1 — One public synthetic golden',
  '### B1 — Pure core and provider adapters stay separate',
  '### I1 — Exact input and execution identity',
  '### E1 — Per-run external execution authority',
  '### P1 — Three providers without ranking shortcuts',
  '### S1 — Semantic, artifact, and gate conservation',
  '### V1 — Trusted verification, never model self-attestation',
  '### C1 — Cost and latency remain truthful and nullable',
  '### R1 — Qualification and performance evidence are distinct',
  '### F1 — Missing or malformed evidence fails closed',
  '### D1 — Data minimization and bounded retention',
  '### T1 — TypeScript first with measured thresholds',
  '### N1 — A1 prepares inputs only',
  '## Golden fixture contract',
  '## Provider execution boundary',
  '## Implementation sequence',
  '## Exact source manifest',
  '## Rollback and next gates',
  '## Non-claims',
]
for (const heading of requiredHeadings) assert.ok(normalizedPlan.includes(heading), `plan missing ${heading}`)
for (const phrase of [
  'golden=G1, boundary=B1, identity=I1, execution=E1, providers=P1, semantics=S1, verification=V1, cost=C1, repetition=R1, failure=F1, privacy=D1, language=T1, scope=N1',
  'transport smoke cannot qualify',
  'shell:false',
  'one attempt',
  'no automatic retry',
  'runtime entitlement',
  'provider ranking is forbidden',
  'operator-approved bounded external-provider execution boundary (2026-08-21)',
  'https://developers.openai.com/codex/cli/reference/',
  'https://docs.anthropic.com/en/docs/claude-code/cli-usage',
  'https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference',
  'A1 does not claim cross-provider parity is proven',
  'No Codex, Claude, or Copilot model execution is performed by A1.',
]) assert.ok(canonicalPlan.toLowerCase().includes(phrase.toLowerCase()), `plan missing contract phrase: ${phrase}`)
for (const source of sourceManifest) assert.ok(normalizedPlan.includes(`\`${source}\``), `plan source manifest missing ${source}`)
assert.match(normalizedPlan, /^\*\*Status:\*\* Approved input\/readiness preparation; provider execution has not started\.$/m)

const fixture = parseRequired(fixturePath, 'golden fixture')
const matrix = parseRequired(matrixPath, 'phase capability matrix')
validateGoldenFixture(fixture, matrix)
proveInitialRed(fixture)

const roadmap = parseRequired(roadmapJsonPath, 'roadmap catalog')
const parityTask = roadmap.tasks.find((entry: JsonRecord) => entry.id === 'P17-007')
assert.ok(parityTask, 'P17-007 missing from roadmap')
assertRoadmapReady(parityTask)
for (const attack of [
  { mutate: (task: JsonRecord) => { task.status = 'backlog' }, pattern: /must become in_progress/ },
  { mutate: (task: JsonRecord) => { task.readiness.complete = false }, pattern: /must be complete/ },
  { mutate: (task: JsonRecord) => { task.readiness.missing = ['golden cross-provider evaluation fixture'] }, pattern: /must have no unresolved/ },
]) {
  const candidate = structuredClone(parityTask)
  attack.mutate(candidate)
  assert.throws(() => assertRoadmapReady(candidate), attack.pattern)
}

const roadmapMarkdown = readRequired(roadmapMarkdownPath, 'human roadmap')
assert.match(roadmapMarkdown, /\| P17-007 \| P1 \| 4 \| in_progress \| Normalized same-input provider parity \|/)
assert.doesNotMatch(roadmapMarkdown, /- \*\*P17-007:\*\* a golden cross-provider fixture/)
assert.match(roadmapMarkdown, /- \*\*P17-007:\*\* decision tuple `G1\/B1\/I1\/E1\/P1\/S1\/V1\/C1\/R1\/F1\/D1\/T1\/N1`;/)

const packageJson = parseRequired(packagePath, 'package')
assert.equal(
  packageJson.scripts?.['test:post-17-provider-parity-input-lock-plan'],
  'npx tsx scripts/post-17-provider-parity-input-lock-plan.test.ts',
)
assert.ok(
  packageJson.scripts?.['test:kit']?.includes('npm run test:post-17-provider-parity-input-lock-plan'),
  'full kit suite must register the P17-007 A1 validator',
)

const manifest = parseRequired(manifestPath, 'public manifest')
assert.ok(Array.isArray(manifest.entries), 'public manifest entries must be an array')
const manifestPaths = manifest.entries.map((entry: JsonRecord) => entry.path)
assert.equal(new Set(manifestPaths).size, manifestPaths.length, 'public manifest paths must be unique')
assert.deepEqual(manifestPaths, [...manifestPaths].sort(), 'public manifest paths must be JavaScript-ordinal sorted')
for (const publicPath of [
  'docs/roadmap/fixtures/p17-007-provider-parity-golden.json',
  'docs/roadmap/p17-007-a1-provider-parity-input-lock-plan.md',
  'scripts/post-17-provider-parity-input-lock-plan.test.ts',
]) {
  const matches: JsonRecord[] = manifest.entries.filter((entry: JsonRecord) => entry.path === publicPath)
  assert.equal(matches.length, 1, `public manifest must contain exactly one ${publicPath}`)
  assert.equal(matches[0]?.decision, 'include')
  assert.equal(matches[0]?.contentKind, 'text')
  assert.equal(matches[0]?.reasonCode, 'public-source')
}

console.log(`post-17-provider-parity-input-lock-plan.test: PASS (${sourceManifest.length} source paths, 13 decisions, 3 readiness attacks, 1 executable RED fixture)`)
