import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  PHASE_MODEL_ROUTING_REASON_CODES,
  PhaseCapability,
  PhaseCapabilityMatrix,
  PhaseModelCandidate,
  PhaseModelFallback,
  PhaseModelRoutingRequest,
  hashPhaseCapabilityMatrix,
  hashPhaseContract,
  hashPhaseModelCandidate,
  hashPhaseModelRoutingRequest,
  routePhaseModel,
  validatePhaseCapabilityMatrix,
  validatePhaseModelCandidate,
  validatePhaseModelRoutingDecision,
  validatePhaseModelRoutingRequest,
  verifyPhaseModelRoutingDecision,
} from '../src/phase-model-router'

const root = path.resolve(__dirname, '..', '..', '..')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json'), 'utf8')) as PhaseCapabilityMatrix
const requestSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'phase-model-routing-request.schema.json'), 'utf8'))
const decisionSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'phase-model-routing-decision.schema.json'), 'utf8'))
const evaluatedAt = '2026-08-14T12:00:00.000Z'
const observedAt = '2026-08-13T12:00:00.000Z'
const runtimeExpiresAt = '2026-08-20T12:00:00.000Z'
const qualificationExpiresAt = '2026-09-12T12:00:00.000Z'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const phase = (phaseId: string, subject: PhaseCapabilityMatrix = matrix): PhaseCapability => subject.phases.find((entry) => entry.id === phaseId)!

function activeCapabilities(phaseId: string, activeConditionIds: string[], subject: PhaseCapabilityMatrix = matrix): string[] {
  const contract = phase(phaseId, subject)
  return [...new Set([
    ...contract.requiredCapabilities,
    ...contract.conditionalCapabilities.filter((entry) => activeConditionIds.includes(entry.conditionId)).flatMap((entry) => entry.capabilities),
  ])]
}

function requestFor(
  phaseId: string,
  candidateIds: string[],
  activeConditionIds: string[] = [],
  subject: PhaseCapabilityMatrix = matrix,
  fallback: PhaseModelFallback | null = null,
  requestedEffort: string | null = null,
): PhaseModelRoutingRequest {
  return {
    schemaVersion: '1.0.0',
    requestId: `request-${phaseId.replaceAll('.', '-')}`,
    phaseId,
    phaseContractHash: hashPhaseContract(subject, phaseId),
    matrixHash: hashPhaseCapabilityMatrix(subject),
    activeConditionIds,
    estimatedInputTokens: 4_096,
    candidateIds,
    requestedEffort,
    fallback,
  }
}

function candidateFor(
  phaseId: string,
  activeConditionIds: string[] = [],
  candidateId = 'candidate-primary',
  subject: PhaseCapabilityMatrix = matrix,
): PhaseModelCandidate {
  const contract = phase(phaseId, subject)
  const phaseContractSha256 = hashPhaseContract(subject, phaseId)
  const adapterCapabilitySha256 = digest(`${candidateId}:adapter`)
  return {
    candidateId,
    runnerId: `runner-${candidateId}`,
    providerId: `provider-${candidateId}`,
    modelId: `model-${candidateId}`,
    reasoningEffort: null,
    enabled: true,
    adapterCapabilitySha256,
    capabilities: activeCapabilities(phaseId, activeConditionIds, subject),
    supportedEfforts: [],
    contextWindowTokens: 128_000,
    runtimePermissions: [...contract.runtimeRequirements],
    documentation: {
      sourceUrl: `https://docs.example.com/${candidateId}`,
      sourceSha256: digest(`${candidateId}:documentation`),
      fetchedAt: observedAt,
      expiresAt: runtimeExpiresAt,
    },
    configurationCatalogSha256: digest(`${candidateId}:configuration`),
    runtimeEntitlement: {
      runnerId: `runner-${candidateId}`,
      providerId: `provider-${candidateId}`,
      modelId: `model-${candidateId}`,
      reasoningEffort: null,
      resolvedModelId: `model-${candidateId}`,
      adapterCapabilitySha256,
      evidenceSha256: digest(`${candidateId}:entitlement`),
      observedAt,
      expiresAt: runtimeExpiresAt,
    },
    availability: { status: 'available', observedAt, expiresAt: runtimeExpiresAt },
    phaseQualification: {
      phaseId,
      phaseContractSha256,
      adapterCapabilitySha256,
      fixtureSha256: digest('same-input-fixture'),
      verdict: 'pass',
      evidenceSha256: digest(`${candidateId}:qualification`),
      observedAt,
      expiresAt: qualificationExpiresAt,
    },
    observations: [],
  }
}

function decisionFor(candidate: PhaseModelCandidate, request: PhaseModelRoutingRequest, subject: PhaseCapabilityMatrix = matrix) {
  return routePhaseModel(subject, request, [candidate], evaluatedAt)
}

const validatedMatrix = validatePhaseCapabilityMatrix(matrix)
assert.equal(validatedMatrix.phases.length, 24)
assert.equal(hashPhaseCapabilityMatrix(clone(matrix)), hashPhaseCapabilityMatrix(matrix), 'stable matrix hash must ignore object insertion identity')
assert.match(hashPhaseContract(matrix, 'B0'), /^[0-9a-f]{64}$/)

const requestProperties = Object.keys(requestSchema.properties).sort()
assert.deepEqual(requestProperties, ['activeConditionIds', 'candidateIds', 'estimatedInputTokens', 'fallback', 'matrixHash', 'phaseContractHash', 'phaseId', 'requestId', 'requestedEffort', 'schemaVersion'].sort())
assert.equal(requestSchema.additionalProperties, false)
assert.equal(requestSchema.properties.schemaVersion.const, '1.0.0')
assert.deepEqual(decisionSchema.$defs.reasonCode.enum, [...PHASE_MODEL_ROUTING_REASON_CODES])
assert.equal(decisionSchema.additionalProperties, false)
assert.equal(decisionSchema.properties.candidates.maxItems, 32)
assert.ok(decisionSchema.required.includes('requestHash'))
assert.ok(decisionSchema.$defs.candidateEvaluation.required.includes('candidateEvidenceHash'))

let selectedPhases = 0
let noModelPhases = 0
const activatedConditions = new Set<string>()
for (const contract of matrix.phases) {
  if (contract.modelUse === 'forbidden') {
    const decision = routePhaseModel(matrix, requestFor(contract.id, []), [], evaluatedAt)
    assert.equal(decision.status, 'no_model', contract.id)
    assert.deepEqual(decision.reasonCodes, ['phase_model_forbidden'])
    noModelPhases += 1
    continue
  }
  const active = contract.conditionalCapabilities.map((entry) => entry.conditionId)
  for (const condition of active) activatedConditions.add(condition)
  if (['optional', 'conditional'].includes(contract.modelUse)) {
    const inactive = routePhaseModel(matrix, requestFor(contract.id, []), [], evaluatedAt)
    assert.equal(inactive.status, 'no_model', `${contract.id} inactive`)
    assert.deepEqual(inactive.reasonCodes, ['phase_model_not_requested'])
    noModelPhases += 1
  }
  const candidate = candidateFor(contract.id, active)
  const decision = decisionFor(candidate, requestFor(contract.id, [candidate.candidateId], active))
  assert.equal(decision.status, 'selected', contract.id)
  assert.equal(decision.selectedCandidateId, candidate.candidateId)
  assert.deepEqual(decision.reasonCodes, ['operator_order_selected'])
  assert.deepEqual(validatePhaseModelRoutingDecision(decision), decision)
  selectedPhases += 1
}
assert.equal(selectedPhases + matrix.phases.filter((entry) => entry.modelUse === 'forbidden').length, 24)
assert.deepEqual([...activatedConditions].sort(), [...matrix.vocabulary.conditionIds].sort())

const canonicalIds = matrix.catalogReconciliation.runners.map((runner, index) => `configured-runner-${index}`)
const canonicalDecision = routePhaseModel(matrix, requestFor('B0', canonicalIds), [], evaluatedAt)
assert.equal(canonicalDecision.status, 'needs_input')
assert.deepEqual(canonicalDecision.reasonCodes, ['candidate_unknown'])
assert.ok(canonicalDecision.candidates.every((entry) => entry.reasonCodes[0] === 'candidate_unknown'))

const unknownCondition = routePhaseModel(matrix, requestFor('B2', [], ['future-condition']), [], evaluatedAt)
assert.deepEqual(unknownCondition.reasonCodes, ['condition_unknown'])
const wrongPhaseCondition = routePhaseModel(matrix, requestFor('B0', [], ['images-present']), [], evaluatedAt)
assert.deepEqual(wrongPhaseCondition.reasonCodes, ['condition_not_applicable'])

const baseRequest = requestFor('B0', ['candidate-primary'])
const baseCandidate = candidateFor('B0')
const deterministicA = decisionFor(baseCandidate, baseRequest)
const deterministicB = decisionFor(clone(baseCandidate), clone(baseRequest))
assert.deepEqual(deterministicA, deterministicB)
assert.deepEqual(verifyPhaseModelRoutingDecision(deterministicA, matrix, baseRequest, [baseCandidate]), deterministicA)
assert.equal(deterministicA.requestHash, hashPhaseModelRoutingRequest(baseRequest))
assert.equal(deterministicA.candidates[0].candidateEvidenceHash, hashPhaseModelCandidate(baseCandidate))
const changedRequest = clone(baseRequest)
changedRequest.estimatedInputTokens = 4_095
const changedRequestDecision = decisionFor(baseCandidate, changedRequest)
assert.notEqual(changedRequestDecision.requestHash, deterministicA.requestHash)
assert.notEqual(changedRequestDecision.decisionHash, deterministicA.decisionHash)
const changedEvidence = clone(baseCandidate)
changedEvidence.documentation!.sourceSha256 = digest('changed-documentation')
const changedEvidenceDecision = decisionFor(changedEvidence, baseRequest)
assert.notEqual(changedEvidenceDecision.candidates[0].candidateEvidenceHash, deterministicA.candidates[0].candidateEvidenceHash)
assert.notEqual(changedEvidenceDecision.decisionHash, deterministicA.decisionHash)

const attacks: Array<[string, (candidate: PhaseModelCandidate, request: PhaseModelRoutingRequest) => void, string]> = [
  ['disabled', (candidate) => { candidate.enabled = false }, 'candidate_disabled'],
  ['documentation missing', (candidate) => { candidate.documentation = null }, 'documentation_missing'],
  ['documentation expired', (candidate) => { candidate.documentation!.expiresAt = evaluatedAt }, 'documentation_expired'],
  ['configuration missing', (candidate) => { candidate.configurationCatalogSha256 = null }, 'configuration_missing'],
  ['entitlement missing', (candidate) => { candidate.runtimeEntitlement = null }, 'runtime_entitlement_missing'],
  ['entitlement expired', (candidate) => { candidate.runtimeEntitlement!.expiresAt = evaluatedAt }, 'runtime_entitlement_expired'],
  ['resolved identity mismatch', (candidate) => { candidate.runtimeEntitlement!.resolvedModelId = 'other-model' }, 'resolved_identity_mismatch'],
  ['availability unknown', (candidate) => { candidate.availability = null }, 'availability_unknown'],
  ['candidate unavailable', (candidate) => { candidate.availability!.status = 'unavailable' }, 'candidate_unavailable'],
  ['qualification missing', (candidate) => { candidate.phaseQualification = null }, 'phase_qualification_missing'],
  ['qualification expired', (candidate) => { candidate.phaseQualification!.expiresAt = evaluatedAt }, 'phase_qualification_expired'],
  ['qualification failed', (candidate) => { candidate.phaseQualification!.verdict = 'fail' }, 'phase_qualification_failed'],
  ['phase mismatch', (candidate) => { candidate.phaseQualification!.phaseId = 'B1' }, 'phase_contract_mismatch'],
  ['adapter mismatch', (candidate) => { candidate.phaseQualification!.adapterCapabilitySha256 = digest('wrong-adapter') }, 'adapter_capability_hash_mismatch'],
  ['capability missing', (candidate) => { candidate.capabilities = candidate.capabilities.slice(1) }, 'required_capability_missing'],
  ['permission missing', (candidate) => { candidate.runtimePermissions = candidate.runtimePermissions.slice(1) }, 'runtime_permission_missing'],
  ['context unknown', (candidate) => { candidate.contextWindowTokens = null }, 'context_window_unknown'],
  ['context insufficient', (candidate) => { candidate.contextWindowTokens = 1 }, 'context_window_insufficient'],
  ['effort unsupported', (candidate, request) => { request.requestedEffort = 'high' }, 'requested_effort_unsupported'],
]
for (const [name, mutate, expectedReason] of attacks) {
  const candidate = clone(baseCandidate)
  const request = clone(baseRequest)
  mutate(candidate, request)
  const decision = decisionFor(candidate, request)
  assert.equal(decision.status, 'needs_input', name)
  assert.ok(decision.candidates[0].reasonCodes.includes(expectedReason as any), name)
}

const laterCandidate = candidateFor('B0', [], 'candidate-later')
const firstRejected = clone(baseCandidate)
firstRejected.enabled = false
const preflight = routePhaseModel(matrix, requestFor('B0', ['candidate-primary', 'candidate-later']), [firstRejected, laterCandidate], evaluatedAt)
assert.equal(preflight.status, 'selected')
assert.equal(preflight.selectedCandidateId, 'candidate-later')
assert.deepEqual(preflight.candidates[0].reasonCodes, ['candidate_disabled'])

function fallback(overrides: Partial<PhaseModelFallback> = {}): PhaseModelFallback {
  return {
    priorDecisionHash: digest('prior-decision'),
    failedCandidateId: 'candidate-failed',
    failureReason: 'provider_timeout',
    originalPhaseContractHash: hashPhaseContract(matrix, 'B0'),
    originalRuntimePermissions: [...phase('B0').runtimeRequirements],
    replaySafe: true,
    ...overrides,
  }
}

const validFallbackCandidate = candidateFor('B0', [], 'candidate-fallback')
const validFallback = routePhaseModel(matrix, requestFor('B0', ['candidate-fallback'], [], matrix, fallback()), [validFallbackCandidate], evaluatedAt)
assert.equal(validFallback.status, 'selected')
assert.equal(validFallback.selectedCandidateId, 'candidate-fallback')

for (const [name, fallbackValue, reason] of [
  ['missing lineage', fallback({ priorDecisionHash: null }), 'fallback_missing_lineage'],
  ['unsafe replay', fallback({ replaySafe: false }), 'fallback_not_replay_safe'],
  ['contract mismatch', fallback({ originalPhaseContractHash: digest('wrong-contract') }), 'fallback_contract_mismatch'],
  ['permission ceiling', fallback({ originalRuntimePermissions: [] }), 'fallback_permission_escalation'],
] as const) {
  const decision = routePhaseModel(matrix, requestFor('B0', ['candidate-fallback'], [], matrix, fallbackValue), [validFallbackCandidate], evaluatedAt)
  assert.equal(decision.status, 'needs_input', name)
  assert.ok(decision.reasonCodes.includes(reason), name)
}

const elevatedFallbackCandidate = clone(validFallbackCandidate)
elevatedFallbackCandidate.runtimePermissions.push('browser-read')
const elevatedFallbackDecision = routePhaseModel(matrix, requestFor('B0', ['candidate-fallback'], [], matrix, fallback()), [elevatedFallbackCandidate], evaluatedAt)
assert.ok(elevatedFallbackDecision.candidates[0].reasonCodes.includes('fallback_permission_escalation'))
assert.throws(() => validatePhaseModelRoutingRequest(requestFor('B0', ['candidate-failed'], [], matrix, fallback())), /failed candidate cannot be requested/)

function addObservations(candidate: PhaseModelCandidate, costUsd: number, durationMs: number, count = 5): void {
  for (let index = 0; index < count; index += 1) {
    candidate.observations.push({
      phaseId: 'B0',
      phaseContractSha256: candidate.phaseQualification!.phaseContractSha256,
      runnerId: candidate.runnerId,
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      reasoningEffort: candidate.reasoningEffort,
      adapterCapabilitySha256: candidate.adapterCapabilitySha256,
      fixtureSha256: candidate.phaseQualification!.fixtureSha256,
      trustedPhaseVerdict: 'pass',
      durationMs,
      inputTokens: 1_000,
      outputTokens: 500,
      pricingStatus: 'priced',
      costUsd,
      completedAt: `2026-08-${String(10 + index).padStart(2, '0')}T10:00:00.000Z`,
      evidenceSha256: digest(`${candidate.candidateId}:observation:${index}`),
    })
  }
}

const optimizedMatrix = clone(matrix)
optimizedMatrix.performanceEvidencePolicy.optimizerEnabled = true
optimizedMatrix.performanceEvidencePolicy.currentDecision = 'enabled-comparable-phase-specific-evidence'
const expensive = candidateFor('B0', [], 'candidate-expensive', optimizedMatrix)
const efficient = candidateFor('B0', [], 'candidate-efficient', optimizedMatrix)
addObservations(expensive, 0.02, 100)
addObservations(efficient, 0.01, 200)
const optimizedRequest = requestFor('B0', ['candidate-expensive', 'candidate-efficient'], [], optimizedMatrix)
const optimized = routePhaseModel(optimizedMatrix, optimizedRequest, [expensive, efficient], evaluatedAt)
assert.equal(optimized.status, 'selected')
assert.equal(optimized.selectedCandidateId, 'candidate-efficient')
assert.deepEqual(optimized.reasonCodes, ['qualified_tie_break_selected'])

const insufficient = clone(efficient)
insufficient.observations = insufficient.observations.slice(0, 4)
const insufficientDecision = routePhaseModel(optimizedMatrix, optimizedRequest, [expensive, insufficient], evaluatedAt)
assert.equal(insufficientDecision.status, 'needs_input')
assert.deepEqual(insufficientDecision.reasonCodes, ['performance_evidence_insufficient'])

const malformedCandidate = clone(baseCandidate) as any
malformedCandidate.prompt = 'forbidden'
assert.throws(() => validatePhaseModelCandidate(malformedCandidate), /fields must be exactly/)
const unknownCapability = clone(baseCandidate)
unknownCapability.capabilities.push('telepathy')
assert.throws(() => decisionFor(unknownCapability, baseRequest), /unknown capability/)
const unknownPermission = clone(baseCandidate)
unknownPermission.runtimePermissions.push('arbitrary-shell-root')
assert.throws(() => decisionFor(unknownPermission, baseRequest), /unknown runtime permission/)
const overlongDocumentation = clone(baseCandidate)
overlongDocumentation.documentation!.expiresAt = '2026-08-21T12:00:00.000Z'
assert.throws(() => decisionFor(overlongDocumentation, baseRequest), /freshness ceiling/)
const overlongEntitlement = clone(baseCandidate)
overlongEntitlement.runtimeEntitlement!.expiresAt = '2026-08-21T12:00:00.000Z'
assert.throws(() => decisionFor(overlongEntitlement, baseRequest), /freshness ceiling/)
const overlongQualification = clone(baseCandidate)
overlongQualification.phaseQualification!.expiresAt = '2026-09-13T12:00:00.000Z'
assert.throws(() => decisionFor(overlongQualification, baseRequest), /freshness ceiling/)
const duplicateConditionMatrix = clone(matrix)
duplicateConditionMatrix.phases.find((entry) => entry.id === 'B6.5')!.conditionalCapabilities[0].conditionId = 'images-present'
assert.throws(() => hashPhaseCapabilityMatrix(duplicateConditionMatrix), /condition IDs must be bound exactly once/)
const duplicateRequest = clone(baseRequest)
duplicateRequest.candidateIds.push(duplicateRequest.candidateIds[0])
assert.throws(() => validatePhaseModelRoutingRequest(duplicateRequest), /must be unique/)
assert.throws(() => routePhaseModel(matrix, { ...baseRequest, matrixHash: digest('tamper') }, [baseCandidate], evaluatedAt), /matrix hash mismatch/)
assert.throws(() => routePhaseModel(matrix, { ...baseRequest, phaseContractHash: digest('tamper') }, [baseCandidate], evaluatedAt), /phase contract hash mismatch/)
assert.throws(() => routePhaseModel(matrix, baseRequest, [baseCandidate, candidateFor('B0', [], 'extra')], evaluatedAt), /unrequested candidate evidence/)
const tamperedDecision = { ...deterministicA, selectedCandidateId: 'candidate-tampered' }
assert.throws(() => validatePhaseModelRoutingDecision(tamperedDecision), /selected decision lacks an eligible candidate|hash mismatch/)
const evidenceHashTamper = clone(deterministicA)
evidenceHashTamper.candidates[0].candidateEvidenceHash = digest('forged-evidence-identity')
const { decisionHash: ignoredEvidenceHash, ...evidenceHashPayload } = evidenceHashTamper
evidenceHashTamper.decisionHash = digest(stableJson(evidenceHashPayload))
assert.throws(() => verifyPhaseModelRoutingDecision(evidenceHashTamper, matrix, baseRequest, [baseCandidate]), /does not match its request and candidate evidence/)
const semanticTamper = clone(deterministicA)
semanticTamper.reasonCodes = ['performance_evidence_insufficient']
const { decisionHash: ignoredSemanticHash, ...semanticPayload } = semanticTamper
semanticTamper.decisionHash = digest(stableJson(semanticPayload))
assert.throws(() => validatePhaseModelRoutingDecision(semanticTamper), /selected decision optimizer evidence is inconsistent/)

const durations: number[] = []
for (let index = 0; index < 80; index += 1) {
  const started = performance.now()
  routePhaseModel(matrix, baseRequest, [baseCandidate], evaluatedAt)
  durations.push(performance.now() - started)
}
durations.sort((left, right) => left - right)
const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
assert.ok(p95 < 100, `phase routing p95 ${p95.toFixed(2)} ms exceeds 100 ms`)

console.log(`phase-model-router.test: PASS (24 phases, 5 conditions, ${attacks.length} candidate attacks, 5 fallback paths, canonical fail-closed, optimizer gate, schema/hash integrity, p95=${p95.toFixed(2)}ms)`)
