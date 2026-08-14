import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, any>

const root = process.cwd()
const matrixPath = path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json')
const boundaryPath = path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json')
const goldenPath = path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-golden.json')
const kitModelPath = path.join(root, '.claude', 'integrations', 'model-config.ts')

const parse = (file: string): JsonRecord => JSON.parse(fs.readFileSync(file, 'utf8'))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const canonicalText = (value: string): string => value.replace(/\r\n/g, '\n')
const sha256File = (file: string): string => crypto.createHash('sha256').update(canonicalText(fs.readFileSync(file, 'utf8'))).digest('hex')
const uniqueStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0) && new Set(value).size === value.length

const boundary = parse(boundaryPath)
const golden = parse(goldenPath)
const matrix = parse(matrixPath)

const officialHosts: Record<string, Set<string>> = {
  openai: new Set(['developers.openai.com']),
  anthropic: new Set(['platform.claude.com', 'docs.anthropic.com']),
  github: new Set(['docs.github.com']),
  google: new Set(['ai.google.dev', 'google-gemini.github.io']),
}

function validate(value: JsonRecord): void {
  assert.equal(value.schemaVersion, '1.1.0')
  assert.equal(value.artifactId, 'post-17-phase-capability-matrix')
  assert.equal(value.generatedOn, '2026-08-14')
  assert.ok(typeof value.approvalBasis === 'string' && value.approvalBasis.includes('readiness-gated'))

  assert.equal(value.sourceContracts.phaseBoundary.path, 'docs/roadmap/post-17-orchestrator-boundaries.json')
  assert.equal(value.sourceContracts.phaseBoundary.sha256, sha256File(boundaryPath), 'phase boundary drift must invalidate the matrix')
  assert.equal(value.sourceContracts.conservationGolden.sha256, sha256File(goldenPath), 'golden drift must invalidate the matrix')
  assert.equal(value.sourceContracts.kitModelInventory.sha256, sha256File(kitModelPath), 'kit model inventory drift must invalidate the matrix')
  assert.match(value.sourceContracts.dashboardModelInventory.sha256, /^[0-9a-f]{64}$/)
  assert.match(value.sourceContracts.kitModelInventory.authority, /not entitlement or phase-quality evidence/)
  assert.match(value.sourceContracts.dashboardModelInventory.authority, /not entitlement or phase-quality evidence/)

  const vocabulary = value.vocabulary
  for (const field of ['decisionAuthorities', 'modelUse', 'riskClasses', 'catalogEvidenceTiers', 'conditionIds', 'modelCapabilities', 'runtimeRequirements']) {
    assert.ok(uniqueStrings(vocabulary[field]), `vocabulary.${field} must be unique and non-empty`)
  }
  assert.deepEqual(vocabulary.decisionAuthorities, ['computed', 'human'])
  assert.deepEqual(vocabulary.modelUse, ['forbidden', 'optional', 'required', 'conditional'])
  assert.deepEqual(vocabulary.catalogEvidenceTiers, ['documented', 'configured', 'runtime-entitled', 'phase-qualified'])
  assert.deepEqual(vocabulary.conditionIds, ['images-present', 'design-images-present', 'browser-visual-verification-selected', 'model-closeout-requested', 'model-feedback-clustering-requested'])

  assert.equal(value.selectionPolicy.mode, 'explicit-evidence-bound')
  assert.equal(value.selectionPolicy.modelMayDecideGate, false)
  assert.ok(uniqueStrings(value.selectionPolicy.steps) && value.selectionPolicy.steps.length >= 6)
  assert.ok(uniqueStrings(value.selectionPolicy.forbidden) && value.selectionPolicy.forbidden.length >= 6)
  assert.ok(value.selectionPolicy.forbidden.some((rule: string) => /unknown cost, latency, quality, or entitlement as zero or pass/.test(rule)))

  assert.equal(value.catalogEvidencePolicy.routeMinimum, 'phase-qualified')
  assert.equal(value.catalogEvidencePolicy.unknownBehavior, 'needs_input')
  assert.deepEqual(value.catalogEvidencePolicy.tierSemantics.map((entry: JsonRecord) => entry.tier), vocabulary.catalogEvidenceTiers)
  assert.equal(value.catalogEvidencePolicy.freshness.expiredBehavior, 'needs_input')
  for (const field of ['officialCatalogMaxAgeDays', 'runtimeEntitlementMaxAgeDays', 'phaseQualificationMaxAgeDays']) {
    assert.ok(Number.isInteger(value.catalogEvidencePolicy.freshness[field]) && value.catalogEvidencePolicy.freshness[field] > 0)
  }

  assert.equal(value.fallbackPolicy.silentFallback, false)
  assert.equal(value.fallbackPolicy.noEligibleFallback, 'needs_input')
  assert.ok(uniqueStrings(value.fallbackPolicy.allowedOnlyWhen) && value.fallbackPolicy.allowedOnlyWhen.length >= 5)
  assert.ok(uniqueStrings(value.fallbackPolicy.forbiddenWhen) && value.fallbackPolicy.forbiddenWhen.length >= 3)
  assert.ok(value.fallbackPolicy.allowedOnlyWhen.some((rule: string) => /exact phase-contract hash/.test(rule)))
  assert.ok(value.fallbackPolicy.allowedOnlyWhen.some((rule: string) => /superset/.test(rule)))

  assert.equal(value.performanceEvidencePolicy.optimizerEnabled, false)
  assert.equal(value.performanceEvidencePolicy.currentDecision, 'disabled-insufficient-phase-specific-evidence')
  assert.equal(value.performanceEvidencePolicy.minimumComparableCompletedRunsPerCandidate, 5)
  assert.ok(uniqueStrings(value.performanceEvidencePolicy.requiredObservationKey))
  assert.ok(value.performanceEvidencePolicy.requiredObservationKey.includes('phaseId'))
  assert.ok(value.performanceEvidencePolicy.requiredObservationKey.includes('phaseContractSha256'))
  assert.ok(value.performanceEvidencePolicy.requiredObservationKey.includes('adapterCapabilitySha256'))
  assert.ok(uniqueStrings(value.performanceEvidencePolicy.requiredMetrics))
  assert.ok(value.performanceEvidencePolicy.rankingRules.some((rule: string) => /remain unknown/.test(rule)))
  assert.match(value.performanceEvidencePolicy.currentEvidenceGap, /aggregate by runner and kit version/)

  const expectedPhaseIds = boundary.phases.map((phase: JsonRecord) => phase.id)
  assert.deepEqual(Object.keys(value.phaseGateBindings), expectedPhaseIds)
  assert.deepEqual(value.phaseGateBindings, Object.fromEntries(boundary.phases.map((phase: JsonRecord) => [phase.id, phase.gate])))
  assert.deepEqual(value.phases.map((phase: JsonRecord) => phase.id), expectedPhaseIds)
  assert.equal(new Set(value.phases.map((phase: JsonRecord) => phase.id)).size, expectedPhaseIds.length)

  const humanPhases = new Set(['B4', 'D-cross-2', 'B6', 'B6.5', 'B8', 'B9', 'B10.5', 'B12.6'])
  const modelForbidden = new Set(['B0.5', 'B6', 'B8', 'B8.5', 'B9', 'B9.5', 'B9.6', 'B10.5'])
  const providerTerms = /\b(?:openai|anthropic|github|google|xai|codex|claude|copilot|gemini|gpt|opus|sonnet|haiku|grok)\b/i
  for (const phase of value.phases) {
    assert.ok(vocabulary.decisionAuthorities.includes(phase.decisionAuthority), `${phase.id} has unknown decision authority`)
    assert.equal(phase.decisionAuthority, humanPhases.has(phase.id) ? 'human' : 'computed', `${phase.id} authority drifted`)
    assert.ok(vocabulary.modelUse.includes(phase.modelUse), `${phase.id} has unknown model use`)
    assert.ok(vocabulary.riskClasses.includes(phase.riskClass), `${phase.id} has unknown risk class`)
    assert.ok(Array.isArray(phase.requiredCapabilities) && new Set(phase.requiredCapabilities).size === phase.requiredCapabilities.length)
    assert.ok(Array.isArray(phase.conditionalCapabilities))
    assert.ok(uniqueStrings(phase.runtimeRequirements), `${phase.id} needs runtime requirements`)
    assert.ok(phase.requiredCapabilities.every((item: string) => vocabulary.modelCapabilities.includes(item)), `${phase.id} has unknown model capability`)
    assert.ok(phase.runtimeRequirements.every((item: string) => vocabulary.runtimeRequirements.includes(item)), `${phase.id} has unknown runtime requirement`)
    for (const conditional of phase.conditionalCapabilities) {
      assert.ok(vocabulary.conditionIds.includes(conditional.conditionId), `${phase.id} has unknown condition id`)
      assert.ok(typeof conditional.when === 'string' && conditional.when.trim())
      assert.ok(uniqueStrings(conditional.capabilities))
      assert.ok(conditional.capabilities.every((item: string) => vocabulary.modelCapabilities.includes(item)), `${phase.id} has unknown conditional capability`)
    }
    assert.doesNotMatch(JSON.stringify(phase), providerTerms, `${phase.id} requirements must stay provider-neutral`)
    if (modelForbidden.has(phase.id)) assert.equal(phase.modelUse, 'forbidden', `${phase.id} must not invoke a model`)
    if (phase.modelUse === 'forbidden') {
      assert.deepEqual(phase.requiredCapabilities, [])
      assert.deepEqual(phase.conditionalCapabilities, [])
      assert.equal(phase.minimumCatalogEvidence, 'not-applicable')
    } else {
      assert.equal(phase.minimumCatalogEvidence, 'phase-qualified')
    }
    if (phase.modelUse === 'required') assert.ok(phase.requiredCapabilities.length > 0)
    if (phase.modelUse === 'conditional' || phase.modelUse === 'optional') assert.ok(phase.conditionalCapabilities.length > 0)
  }
  const boundConditionIds = value.phases.flatMap((phase: JsonRecord) => phase.conditionalCapabilities.map((entry: JsonRecord) => entry.conditionId))
  assert.deepEqual([...boundConditionIds].sort(), [...vocabulary.conditionIds].sort(), 'every closed condition id must be bound exactly once')

  const b2 = value.phases.find((phase: JsonRecord) => phase.id === 'B2')
  assert.equal(b2.modelUse, 'conditional')
  assert.equal(b2.conditionalCapabilities[0].conditionId, 'images-present')
  assert.ok(b2.conditionalCapabilities[0].capabilities.includes('vision-input'))
  const b10 = value.phases.find((phase: JsonRecord) => phase.id === 'B10')
  assert.ok(b10.requiredCapabilities.includes('agentic-tool-use'))
  assert.ok(b10.runtimeRequirements.includes('isolated-agent-context'))
  assert.ok(b10.runtimeRequirements.includes('repository-write'))
  const b11 = value.phases.find((phase: JsonRecord) => phase.id === 'B11')
  assert.ok(b11.runtimeRequirements.includes('independent-verifier-context'))
  assert.ok(b11.conditionalCapabilities.some((entry: JsonRecord) => entry.capabilities.includes('vision-input')))

  assert.equal(value.externalSources.length, 7)
  for (const source of value.externalSources) {
    const url = new URL(source.url)
    assert.ok(officialHosts[source.providerId]?.has(url.hostname), `${source.providerId} must use an official documentation host`)
    const fetched = Date.parse(`${source.fetchedOn}T00:00:00Z`)
    const expires = Date.parse(`${source.expiresOn}T00:00:00Z`)
    assert.ok(Number.isFinite(fetched) && Number.isFinite(expires) && expires > fetched)
    assert.ok(expires - fetched <= 7 * 86_400_000, 'volatile catalog source cannot live longer than seven days')
    assert.equal(source.authority.includes('advisory'), true)
  }

  const runners = value.catalogReconciliation.runners as JsonRecord[]
  assert.deepEqual(runners.map((runner) => runner.runnerId), ['claude', 'codex', 'copilot', 'gemini'])
  for (const runner of runners) {
    assert.ok(uniqueStrings(runner.configuredModels))
    assert.equal(runner.routableNow, false, `${runner.runnerId} cannot be routable without phase qualification`)
    assert.notEqual(runner.highestObservedTier, 'phase-qualified')
  }
  assert.ok(value.catalogReconciliation.unmergedInventory.some((entry: JsonRecord) => entry.providerId === 'xai' && /must not synthesize/.test(entry.reason)))
  assert.deepEqual(golden.requiredPhaseCoverage, expectedPhaseIds.filter((id: string) => id !== 'D-cross-2'))
}

validate(matrix)
assert.ok(Buffer.byteLength(fs.readFileSync(matrixPath)) < 256 * 1024, 'matrix must remain bounded')

const attacks: Array<[string, (subject: JsonRecord) => void]> = [
  ['missing phase', (subject) => { subject.phases = subject.phases.filter((phase: JsonRecord) => phase.id !== 'B11') }],
  ['duplicate phase', (subject) => { subject.phases.push(clone(subject.phases[0])) }],
  ['weakened gate', (subject) => { subject.phaseGateBindings.B9 = 'none' }],
  ['provider-coupled phase', (subject) => { subject.phases[0].requiredCapabilities.push('codex') }],
  ['unknown capability', (subject) => { subject.phases[0].requiredCapabilities.push('telepathy') }],
  ['model in deterministic phase', (subject) => { subject.phases.find((phase: JsonRecord) => phase.id === 'B9').modelUse = 'required' }],
  ['lower evidence tier', (subject) => { subject.catalogEvidencePolicy.routeMinimum = 'runtime-entitled' }],
  ['source drift', (subject) => { subject.sourceContracts.phaseBoundary.sha256 = '0'.repeat(64) }],
  ['expired official source', (subject) => { subject.externalSources[0].expiresOn = subject.externalSources[0].fetchedOn }],
  ['premature optimizer', (subject) => { subject.performanceEvidencePolicy.optimizerEnabled = true }],
  ['silent fallback', (subject) => { subject.fallbackPolicy.silentFallback = true }],
  ['missing verifier isolation', (subject) => { subject.phases.find((phase: JsonRecord) => phase.id === 'B11').runtimeRequirements = ['repository-read'] }],
  ['unqualified routable candidate', (subject) => { subject.catalogReconciliation.runners[0].routableNow = true }],
  ['unknown condition id', (subject) => { subject.phases.find((phase: JsonRecord) => phase.id === 'B2').conditionalCapabilities[0].conditionId = 'images-maybe' }],
  ['duplicate condition id', (subject) => { subject.phases.find((phase: JsonRecord) => phase.id === 'B6.5').conditionalCapabilities[0].conditionId = 'images-present' }],
]

for (const [name, mutate] of attacks) {
  const subject = clone(matrix)
  mutate(subject)
  assert.throws(() => validate(subject), undefined, name)
}

console.log(`post-17-phase-capability-matrix.test: PASS (${matrix.phases.length} phases, ${matrix.externalSources.length} official sources, ${attacks.length} negative controls)`)
