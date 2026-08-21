import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  PROVIDER_PARITY_ARTIFACT_CLASSES,
  PROVIDER_PARITY_PHASE_IDS,
  PROVIDER_PARITY_PROVIDERS,
  evaluateProviderParity,
  hashProviderParityReceipt,
  type ProviderParityCandidateReceipt,
  type ProviderParityEvaluationRequest,
  type ProviderParityProvider,
} from '../src/provider-parity-evaluator'

type JsonRecord = Record<string, any>

const root = process.cwd()
const goldenFixture = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'fixtures', 'p17-007-provider-parity-golden.json'), 'utf8')) as JsonRecord
const requestSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'provider-parity-evaluation-request.schema.json'), 'utf8')) as JsonRecord
const reportSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'provider-parity-evaluation-report.schema.json'), 'utf8')) as JsonRecord
const HASH = 'a'.repeat(64)
const SOURCE_COMMIT = 'b'.repeat(40)

function makeGolden(): ProviderParityEvaluationRequest['golden'] {
  return {
    fixtureId: goldenFixture.fixtureId,
    fixtureRevision: goldenFixture.fixtureRevision,
    fixtureSha256: HASH,
    semanticSpecSha256: goldenFixture.semanticSpecSha256,
    taskPromptSha256: goldenFixture.taskPromptSha256,
    seedTreeSha256: goldenFixture.repositorySeed.seedTreeSha256,
    providers: [...PROVIDER_PARITY_PROVIDERS],
    acceptanceCriterionIds: goldenFixture.semanticSpec.requirements.map((entry: JsonRecord) => entry.id),
    requiredArtifactClasses: [...PROVIDER_PARITY_ARTIFACT_CLASSES],
    phaseBindings: goldenFixture.phaseBindings.map((entry: JsonRecord) => ({
      phaseId: entry.phaseId,
      phaseContractSha256: entry.phaseContractSha256,
    })),
    policy: {
      minimumSemanticRunsPerProvider: goldenFixture.evaluationPolicy.minimumSemanticRunsPerProvider,
      minimumPerformanceRunsPerProvider: goldenFixture.evaluationPolicy.minimumPerformanceRunsPerProvider,
      maxRunDurationMs: goldenFixture.evaluationPolicy.maxRunDurationMs,
      maxCapturedOutputBytes: goldenFixture.evaluationPolicy.maxCapturedOutputBytes,
      attemptsPerRun: 1,
      rankingWhenIncomplete: 'forbidden',
    },
  }
}

function rehash(receipt: ProviderParityCandidateReceipt): ProviderParityCandidateReceipt {
  const { receiptHash: _ignored, ...withoutHash } = receipt
  return { ...withoutHash, receiptHash: hashProviderParityReceipt(withoutHash) }
}

function makeReceipt(provider: ProviderParityProvider, ordinal = 1, options: {
  priced?: boolean
  state?: 'completed' | 'needs_input' | 'failed'
  reasonCodes?: ProviderParityCandidateReceipt['execution']['reasonCodes']
} = {}): ProviderParityCandidateReceipt {
  const golden = makeGolden()
  const state = options.state ?? 'completed'
  const reasonCodes = options.reasonCodes ?? []
  const completed = state === 'completed'
  const priced = options.priced ?? false
  const withoutHash: Omit<ProviderParityCandidateReceipt, 'receiptHash'> = {
    schemaVersion: '1.0.0',
    runId: `${provider}-${String(ordinal).padStart(2, '0')}`,
    provider,
    execution: {
      state,
      reasonCodes,
    },
    identity: {
      fixtureId: golden.fixtureId,
      fixtureRevision: golden.fixtureRevision,
      fixtureSha256: golden.fixtureSha256,
      semanticSpecSha256: golden.semanticSpecSha256,
      taskPromptSha256: golden.taskPromptSha256,
      seedTreeSha256: golden.seedTreeSha256,
      phaseBindings: structuredClone(golden.phaseBindings),
      runnerId: `${provider}-runner`,
      cliVersion: state === 'needs_input' && reasonCodes.includes('cli_missing') ? null : '1.0.0',
      modelId: `${provider}-model`,
      reasoningEffort: 'medium',
      adapterCapabilitySha256: 'c'.repeat(64),
      runtimeEntitlementEvidenceSha256: state === 'needs_input' && reasonCodes.includes('runtime_entitlement_missing') ? null : 'd'.repeat(64),
      materializedTreeSha256: state === 'needs_input' ? null : ordinal === 1 ? `${provider === 'codex' ? '1' : provider === 'claude' ? '2' : '3'}`.repeat(64) : String((ordinal % 9) + 1).repeat(64),
      executionPolicySha256: 'e'.repeat(64),
      authorizationReceiptSha256: state === 'needs_input' && reasonCodes.includes('authorization_missing') ? null : 'f'.repeat(64),
      sourceCommit: SOURCE_COMMIT,
      observedAt: `2026-08-21T10:${String(ordinal).padStart(2, '0')}:00.000Z`,
      timeoutMs: golden.policy.maxRunDurationMs,
      maxCapturedOutputBytes: golden.policy.maxCapturedOutputBytes,
      attemptOrdinal: 1,
    },
    evidence: completed ? {
      acceptanceCriteria: golden.acceptanceCriterionIds.map((id, index) => ({ id, evidenceSha256: String(index + 1).repeat(64) })),
      artifacts: golden.requiredArtifactClasses.map((artifactClass, index) => ({ artifactClass, evidenceSha256: String(index + 4).repeat(64) })),
      gates: golden.phaseBindings.map((binding, index) => ({ phaseId: binding.phaseId, conserved: true, evidenceSha256: String(index + 5).repeat(64) })),
      apiContractConserved: true,
      trustedVerification: { exitCode: 0, evidenceSha256: '8'.repeat(64) },
      violations: {
        lockedPathEdit: false,
        undeclaredPath: false,
        externalDependency: false,
        secretOrPathDisclosure: false,
        permissionWidening: false,
        cleanupFailed: false,
      },
    } : {
      acceptanceCriteria: [],
      artifacts: [],
      gates: [],
      apiContractConserved: null,
      trustedVerification: null,
      violations: null,
    },
    metrics: {
      durationMs: completed ? 1000 + ordinal : null,
      inputTokens: priced ? 100 : null,
      outputTokens: priced ? 50 : null,
      cacheTokens: priced ? 10 : null,
      pricingStatus: priced ? 'priced' : 'unpriced',
      priceBasisSha256: priced ? '9'.repeat(64) : null,
      costUsd: priced ? 0.01 + ordinal / 1000 : null,
    },
  }
  return { ...withoutHash, receiptHash: hashProviderParityReceipt(withoutHash) }
}

function makeRequest(receipts: ProviderParityCandidateReceipt[], mode: 'qualification' | 'performance' = 'qualification'): ProviderParityEvaluationRequest {
  return {
    schemaVersion: '1.0.0',
    evaluationId: `evaluation-${mode}`,
    mode,
    golden: makeGolden(),
    receipts: [...receipts].sort((left, right) => left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0),
  }
}

function mutateReceipt(
  receipt: ProviderParityCandidateReceipt,
  mutate: (candidate: ProviderParityCandidateReceipt) => void,
): ProviderParityCandidateReceipt {
  const candidate = structuredClone(receipt)
  mutate(candidate)
  return rehash(candidate)
}

function evaluationFor(receipt: ProviderParityCandidateReceipt) {
  return evaluateProviderParity(makeRequest([receipt])).receiptEvaluations[0]
}

// Portable schema roots remain closed and versioned.
assert.equal(requestSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal(requestSchema.additionalProperties, false)
assert.deepEqual(requestSchema.required, ['schemaVersion', 'evaluationId', 'mode', 'golden', 'receipts'])
assert.equal(requestSchema.properties.schemaVersion.const, '1.0.0')
assert.equal(requestSchema.properties.receipts.maxItems, 300)
assert.equal(requestSchema.$defs.receipt.additionalProperties, false)
assert.equal(requestSchema.$defs.identity.additionalProperties, false)
assert.equal(requestSchema.$defs.evidence.additionalProperties, false)
assert.equal(reportSchema.additionalProperties, false)
assert.equal(reportSchema.properties.schemaVersion.const, '1.0.0')
assert.equal(reportSchema.$defs.receiptEvaluation.additionalProperties, false)
assert.equal(reportSchema.$defs.ranking.additionalProperties, false)
assert.ok(reportSchema.$defs.ranking.properties.reasonCodes.items.enum.includes('missing_metrics'))

// No evidence is an explicit needs_input report, never an empty pass.
const emptyReport = evaluateProviderParity(makeRequest([]))
assert.equal(emptyReport.status, 'needs_input')
assert.deepEqual(emptyReport.missingProviders, [...PROVIDER_PARITY_PROVIDERS])
assert.deepEqual(emptyReport.pairwiseComparisons, [])
assert.deepEqual(emptyReport.ranking, {
  status: 'forbidden',
  reasonCodes: ['qualification_mode', 'qualification_incomplete', 'insufficient_samples'],
  rows: [],
})

// Different implementation trees can conserve all semantic, artifact, gate, API, and trusted evidence.
const qualificationReceipts = PROVIDER_PARITY_PROVIDERS.map((provider) => makeReceipt(provider))
const qualificationRequest = makeRequest(qualificationReceipts)
const qualificationReport = evaluateProviderParity(qualificationRequest)
assert.equal(qualificationReport.status, 'passed')
assert.deepEqual(qualificationReport.missingProviders, [])
assert.equal(qualificationReport.receiptEvaluations.length, 3)
for (const evaluation of qualificationReport.receiptEvaluations) {
  assert.equal(evaluation.status, 'passed')
  assert.deepEqual(evaluation.reasonCodes, [])
  assert.equal(evaluation.acceptanceCriterionCoverage, 1)
  assert.equal(evaluation.artifactCoverage, 1)
  assert.equal(evaluation.gateConservation, 1)
  assert.equal(evaluation.apiContractConserved, true)
  assert.equal(evaluation.trustedVerificationPassed, true)
}
assert.equal(qualificationReport.pairwiseComparisons.length, 3)
for (const comparison of qualificationReport.pairwiseComparisons) {
  assert.equal(comparison.semanticSimilarity, 1)
  assert.equal(comparison.artifactSimilarity, 1)
  assert.equal(comparison.gateSimilarity, 1)
  assert.equal(comparison.implementationTreeEqual, false)
}
assert.deepEqual(qualificationReport, evaluateProviderParity(structuredClone(qualificationRequest)), 'pure replay must be byte-equivalent')
assert.doesNotMatch(JSON.stringify(qualificationReport), /taskPrompt|credential|transcript|rawDiff|sourceFile|localPath/i)

// Identity drift remains a derived closed failure even when a receipt re-hashes itself.
for (const attack of [
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.fixtureSha256 = '0'.repeat(64) }, reason: 'fixture_identity_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.semanticSpecSha256 = '0'.repeat(64) }, reason: 'fixture_identity_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.taskPromptSha256 = '0'.repeat(64) }, reason: 'fixture_identity_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.seedTreeSha256 = '0'.repeat(64) }, reason: 'fixture_identity_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.phaseBindings[1].phaseContractSha256 = '0'.repeat(64) }, reason: 'phase_identity_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.timeoutMs -= 1 }, reason: 'execution_policy_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.maxCapturedOutputBytes -= 1 }, reason: 'execution_policy_mismatch' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.identity.attemptOrdinal = 2 }, reason: 'execution_policy_mismatch' },
] as const) {
  const evaluation = evaluationFor(mutateReceipt(makeReceipt('codex'), attack.mutate))
  assert.equal(evaluation.status, 'failed')
  assert.ok(evaluation.reasonCodes.includes(attack.reason))
}

// Evidence conservation and policy violations each fail independently.
for (const attack of [
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.evidence.acceptanceCriteria.pop() }, reason: 'acceptance_criteria_missing' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.evidence.artifacts.pop() }, reason: 'artifact_missing' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.evidence.gates[0].conserved = false }, reason: 'gate_not_conserved' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { entry.evidence.apiContractConserved = false }, reason: 'api_contract_changed' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.trustedVerification) entry.evidence.trustedVerification.exitCode = 1 }, reason: 'trusted_verification_failed' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.lockedPathEdit = true }, reason: 'locked_path_changed' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.undeclaredPath = true }, reason: 'undeclared_path' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.externalDependency = true }, reason: 'external_dependency' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.secretOrPathDisclosure = true }, reason: 'secret_or_path_disclosure' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.permissionWidening = true }, reason: 'permission_widened' },
  { mutate: (entry: ProviderParityCandidateReceipt) => { if (entry.evidence.violations) entry.evidence.violations.cleanupFailed = true }, reason: 'cleanup_failed' },
] as const) {
  const evaluation = evaluationFor(mutateReceipt(makeReceipt('codex'), attack.mutate))
  assert.equal(evaluation.status, 'failed')
  assert.ok(evaluation.reasonCodes.includes(attack.reason))
}

// Closed adapter states cannot smuggle completion evidence.
const needsInput = makeReceipt('codex', 1, { state: 'needs_input', reasonCodes: ['cli_missing'] })
const needsInputReport = evaluateProviderParity(makeRequest([
  needsInput,
  makeReceipt('claude', 1, { state: 'needs_input', reasonCodes: ['runtime_entitlement_missing'] }),
  makeReceipt('copilot', 1, { state: 'needs_input', reasonCodes: ['model_unavailable'] }),
]))
assert.equal(needsInputReport.status, 'needs_input')
assert.ok(needsInputReport.receiptEvaluations.every((entry) => entry.status === 'needs_input'))
assert.ok(needsInputReport.receiptEvaluations.every((entry) => entry.implementationTreeSha256 === null))
const failedSet = [
  makeReceipt('codex', 1, { state: 'failed', reasonCodes: ['timeout'] }),
  makeReceipt('claude'),
  makeReceipt('copilot'),
]
assert.equal(evaluateProviderParity(makeRequest(failedSet)).status, 'failed')
assert.equal(evaluateProviderParity(makeRequest(qualificationReceipts.slice(0, 2))).status, 'incomplete')

// Structural, privacy, contradiction, ordering, and integrity attacks fail before evaluation.
const unknownField = structuredClone(qualificationRequest) as JsonRecord
unknownField.rawPrompt = 'forbidden'
assert.throws(() => evaluateProviderParity(unknownField), /request fields must be exactly/)
const hashTamper = structuredClone(qualificationRequest)
hashTamper.receipts[0].receiptHash = '0'.repeat(64)
assert.throws(() => evaluateProviderParity(hashTamper), /receiptHash mismatch/)
const duplicateRun = makeRequest([makeReceipt('codex'), makeReceipt('claude')])
duplicateRun.receipts[1].runId = duplicateRun.receipts[0].runId
duplicateRun.receipts[1] = rehash(duplicateRun.receipts[1])
assert.throws(() => evaluateProviderParity(duplicateRun), /runId values must be unique/)
const reversed = makeRequest([makeReceipt('codex'), makeReceipt('claude')])
reversed.receipts.reverse()
assert.throws(() => evaluateProviderParity(reversed), /canonical runId order/)
const contradictory = structuredClone(needsInput)
contradictory.evidence = structuredClone(makeReceipt('codex').evidence)
contradictory.receiptHash = hashProviderParityReceipt((({ receiptHash: _hash, ...rest }) => rest)(contradictory))
assert.throws(() => evaluateProviderParity(makeRequest([contradictory])), /must not carry completion evidence/)
const accessorRequest = structuredClone(qualificationRequest) as JsonRecord
Object.defineProperty(accessorRequest.golden, 'fixtureId', { enumerable: true, get: () => goldenFixture.fixtureId })
assert.throws(() => evaluateProviderParity(accessorRequest), /must not be accessor-backed/)
const inheritedRequest = Object.assign(Object.create({ inherited: true }), structuredClone(qualificationRequest))
assert.throws(() => evaluateProviderParity(inheritedRequest), /must be a plain object/)
let unpricedContradiction = structuredClone(qualificationReceipts[0])
unpricedContradiction.metrics.costUsd = 0
unpricedContradiction = rehash(unpricedContradiction)
assert.throws(() => evaluateProviderParity(makeRequest([unpricedContradiction])), /unpriced metrics must keep price basis and cost null/)
const falseMissingCli = structuredClone(needsInput)
falseMissingCli.identity.cliVersion = '1.0.0'
falseMissingCli.receiptHash = rehash(falseMissingCli).receiptHash
assert.throws(() => evaluateProviderParity(makeRequest([falseMissingCli])), /cli_missing must match null/)
const reversedReasons = makeReceipt('codex', 1, {
  state: 'needs_input',
  reasonCodes: ['runtime_entitlement_missing', 'cli_missing'],
})
assert.throws(() => evaluateProviderParity(makeRequest([reversedReasons])), /closed vocabulary order/)
const cyclicRequest = structuredClone(qualificationRequest) as JsonRecord
cyclicRequest.self = cyclicRequest
assert.throws(() => evaluateProviderParity(cyclicRequest), /must not be cyclic/)
const nonFinite = structuredClone(qualificationRequest)
nonFinite.receipts[0].metrics.durationMs = Number.NaN
assert.throws(() => evaluateProviderParity(nonFinite), /must contain finite numbers/)
const oversized = makeRequest(Array.from({ length: 301 }, () => makeReceipt('codex')))
assert.throws(() => evaluateProviderParity(oversized), /at most 300/)
const unsafeModel = structuredClone(qualificationRequest)
unsafeModel.receipts[0].identity.modelId = '../private/model'
assert.throws(() => evaluateProviderParity(unsafeModel), /modelId must be a safe identifier/)

// Performance comparison requires five comparable, fully priced, passed samples per provider.
const performanceReceipts = PROVIDER_PARITY_PROVIDERS.flatMap((provider) =>
  Array.from({ length: 5 }, (_, index) => makeReceipt(provider, index + 1, { priced: true })),
)
const performanceReport = evaluateProviderParity(makeRequest(performanceReceipts, 'performance'))
assert.equal(performanceReport.status, 'passed')
assert.equal(performanceReport.ranking.status, 'ready')
assert.deepEqual(performanceReport.ranking.reasonCodes, [])
assert.deepEqual(performanceReport.ranking.rows.map((entry) => entry.provider), [...PROVIDER_PARITY_PROVIDERS])
assert.ok(performanceReport.ranking.rows.every((entry) => entry.sampleCount === 5))
const insufficient = evaluateProviderParity(makeRequest(
  PROVIDER_PARITY_PROVIDERS.flatMap((provider) => Array.from({ length: 4 }, (_, index) => makeReceipt(provider, index + 1, { priced: true }))),
  'performance',
))
assert.deepEqual(insufficient.ranking, { status: 'forbidden', reasonCodes: ['insufficient_samples'], rows: [] })
const unpriced = evaluateProviderParity(makeRequest(
  PROVIDER_PARITY_PROVIDERS.flatMap((provider) => Array.from({ length: 5 }, (_, index) => makeReceipt(provider, index + 1))),
  'performance',
))
assert.deepEqual(unpriced.ranking, { status: 'forbidden', reasonCodes: ['unpriced_samples'], rows: [] })
const missingMetricsReceipts = structuredClone(performanceReceipts)
missingMetricsReceipts[0].metrics.durationMs = null
missingMetricsReceipts[0] = rehash(missingMetricsReceipts[0])
const missingMetrics = evaluateProviderParity(makeRequest(missingMetricsReceipts, 'performance'))
assert.deepEqual(missingMetrics.ranking, { status: 'forbidden', reasonCodes: ['missing_metrics'], rows: [] })
const mixedIdentityReceipts = structuredClone(performanceReceipts)
const mixedIndex = mixedIdentityReceipts.findIndex((entry) => entry.provider === 'codex' && entry.runId.endsWith('05'))
mixedIdentityReceipts[mixedIndex].identity.modelId = 'codex-other-model'
mixedIdentityReceipts[mixedIndex] = rehash(mixedIdentityReceipts[mixedIndex])
const mixedIdentity = evaluateProviderParity(makeRequest(mixedIdentityReceipts, 'performance'))
assert.deepEqual(mixedIdentity.ranking, { status: 'forbidden', reasonCodes: ['mixed_identity'], rows: [] })

// TypeScript performance threshold: 10,000 admitted receipts, per-evaluation p95 and RSS delta.
const benchmarkRequest = makeRequest([makeReceipt('codex')])
const durations: number[] = []
const rssBefore = process.memoryUsage().rss
for (let index = 0; index < 10_000; index += 1) {
  const started = performance.now()
  evaluateProviderParity(benchmarkRequest)
  durations.push(performance.now() - started)
}
const rssDelta = Math.max(0, process.memoryUsage().rss - rssBefore)
durations.sort((left, right) => left - right)
const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1]
assert.ok(p95Ms < 50, `10,000-receipt profile p95 ${p95Ms.toFixed(3)} ms breached 50 ms`)
assert.ok(rssDelta < 64 * 1024 * 1024, `10,000-receipt profile RSS delta ${rssDelta} breached 64 MiB`)

console.log(`provider-parity-evaluator.test: PASS (3 schemas/contracts, 8 identity attacks, 11 evidence attacks, 14 structure/privacy attacks, 5 aggregate modes, 10,000 admitted receipts; p95=${p95Ms.toFixed(3)}ms, rssDelta=${rssDelta})`)
