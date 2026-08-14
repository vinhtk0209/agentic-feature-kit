import crypto from 'node:crypto'

export const PHASE_MODEL_ROUTING_SCHEMA_VERSION = '1.0.0' as const
export const PHASE_MODEL_ROUTING_MAX_CANDIDATES = 32
export const PHASE_MODEL_ROUTING_MAX_OBSERVATIONS = 100

export const PHASE_MODEL_ROUTING_REASON_CODES = [
  'phase_model_forbidden',
  'phase_model_not_requested',
  'condition_unknown',
  'condition_not_applicable',
  'candidate_unknown',
  'candidate_disabled',
  'documentation_missing',
  'documentation_expired',
  'configuration_missing',
  'runtime_entitlement_missing',
  'runtime_entitlement_expired',
  'resolved_identity_mismatch',
  'availability_unknown',
  'candidate_unavailable',
  'phase_qualification_missing',
  'phase_qualification_expired',
  'phase_qualification_failed',
  'phase_contract_mismatch',
  'adapter_capability_hash_mismatch',
  'required_capability_missing',
  'runtime_permission_missing',
  'context_window_unknown',
  'context_window_insufficient',
  'requested_effort_unsupported',
  'fallback_missing_lineage',
  'fallback_not_replay_safe',
  'fallback_contract_mismatch',
  'fallback_permission_escalation',
  'performance_evidence_insufficient',
  'operator_order_selected',
  'qualified_tie_break_selected',
] as const

export type PhaseModelRoutingReasonCode = typeof PHASE_MODEL_ROUTING_REASON_CODES[number]
export type PhaseModelRoutingStatus = 'selected' | 'no_model' | 'needs_input'
export type ModelUse = 'forbidden' | 'optional' | 'required' | 'conditional'
export type AvailabilityStatus = 'available' | 'unavailable' | 'unknown'
export type FallbackFailureReason =
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_rate_limited'
  | 'provider_rejected'
  | 'provider_execution_failed'
  | 'evidence_rejected'

export const FALLBACK_FAILURE_REASONS: readonly FallbackFailureReason[] = [
  'provider_unavailable',
  'provider_timeout',
  'provider_rate_limited',
  'provider_rejected',
  'provider_execution_failed',
  'evidence_rejected',
]

export interface ConditionalCapability {
  conditionId: string
  when: string
  capabilities: string[]
}

export interface PhaseCapability {
  id: string
  decisionAuthority: 'computed' | 'human'
  modelUse: ModelUse
  riskClass: string
  requiredCapabilities: string[]
  conditionalCapabilities: ConditionalCapability[]
  runtimeRequirements: string[]
  minimumCatalogEvidence: 'phase-qualified' | 'not-applicable'
}

export interface PhaseCapabilityMatrix {
  schemaVersion: '1.1.0'
  artifactId: 'post-17-phase-capability-matrix'
  generatedOn: string
  approvalBasis: string
  sourceContracts: Record<string, unknown>
  vocabulary: {
    decisionAuthorities: string[]
    modelUse: string[]
    riskClasses: string[]
    catalogEvidenceTiers: string[]
    conditionIds: string[]
    modelCapabilities: string[]
    runtimeRequirements: string[]
  }
  catalogEvidencePolicy: {
    tierSemantics: unknown[]
    routeMinimum: 'phase-qualified'
    freshness: {
      officialCatalogMaxAgeDays: number
      runtimeEntitlementMaxAgeDays: number
      phaseQualificationMaxAgeDays: number
      expiredBehavior: 'needs_input'
    }
    unknownBehavior: 'needs_input'
    rules: string[]
  }
  selectionPolicy: {
    mode: 'explicit-evidence-bound'
    modelMayDecideGate: false
    steps: string[]
    forbidden: string[]
  }
  fallbackPolicy: {
    allowedOnlyWhen: string[]
    forbiddenWhen: string[]
    noEligibleFallback: 'needs_input'
    silentFallback: false
  }
  performanceEvidencePolicy: {
    optimizerEnabled: boolean
    currentDecision: string
    requiredObservationKey: string[]
    minimumComparableCompletedRunsPerCandidate: number
    maximumObservationAgeDays: number
    requiredMetrics: string[]
    rankingRules: string[]
    currentEvidenceGap: string
  }
  catalogReconciliation: {
    snapshotOn: string
    runners: Array<Record<string, unknown>>
    unmergedInventory: Array<Record<string, unknown>>
  }
  externalSources: Array<Record<string, unknown>>
  phaseGateBindings: Record<string, string>
  phases: PhaseCapability[]
}

export interface PhaseModelFallback {
  priorDecisionHash: string | null
  failedCandidateId: string | null
  failureReason: FallbackFailureReason | null
  originalPhaseContractHash: string
  originalRuntimePermissions: string[]
  replaySafe: boolean
}

export interface PhaseModelRoutingRequest {
  schemaVersion: typeof PHASE_MODEL_ROUTING_SCHEMA_VERSION
  requestId: string
  phaseId: string
  phaseContractHash: string
  matrixHash: string
  activeConditionIds: string[]
  estimatedInputTokens: number | null
  candidateIds: string[]
  requestedEffort: string | null
  fallback: PhaseModelFallback | null
}

export interface DocumentationEvidence {
  sourceUrl: string
  sourceSha256: string
  fetchedAt: string
  expiresAt: string
}

export interface RuntimeEntitlementEvidence {
  runnerId: string
  providerId: string
  modelId: string
  reasoningEffort: string | null
  resolvedModelId: string
  adapterCapabilitySha256: string
  evidenceSha256: string
  observedAt: string
  expiresAt: string
}

export interface AvailabilityEvidence {
  status: AvailabilityStatus
  observedAt: string | null
  expiresAt: string | null
}

export interface PhaseQualificationEvidence {
  phaseId: string
  phaseContractSha256: string
  adapterCapabilitySha256: string
  fixtureSha256: string
  verdict: 'pass' | 'fail'
  evidenceSha256: string
  observedAt: string
  expiresAt: string
}

export interface PhasePerformanceObservation {
  phaseId: string
  phaseContractSha256: string
  runnerId: string
  providerId: string
  modelId: string
  reasoningEffort: string | null
  adapterCapabilitySha256: string
  fixtureSha256: string
  trustedPhaseVerdict: 'pass' | 'fail'
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  pricingStatus: 'priced' | 'unpriced'
  costUsd: number | null
  completedAt: string
  evidenceSha256: string
}

export interface PhaseModelCandidate {
  candidateId: string
  runnerId: string
  providerId: string
  modelId: string
  reasoningEffort: string | null
  enabled: boolean
  adapterCapabilitySha256: string
  capabilities: string[]
  supportedEfforts: string[]
  contextWindowTokens: number | null
  runtimePermissions: string[]
  documentation: DocumentationEvidence | null
  configurationCatalogSha256: string | null
  runtimeEntitlement: RuntimeEntitlementEvidence | null
  availability: AvailabilityEvidence | null
  phaseQualification: PhaseQualificationEvidence | null
  observations: PhasePerformanceObservation[]
}

export interface CandidateRoutingEvaluation {
  candidateId: string
  candidateEvidenceHash: string | null
  eligible: boolean
  reasonCodes: PhaseModelRoutingReasonCode[]
}

export interface PhaseModelRoutingDecision {
  schemaVersion: typeof PHASE_MODEL_ROUTING_SCHEMA_VERSION
  requestId: string
  requestHash: string
  matrixHash: string
  phaseId: string
  phaseContractHash: string
  evaluatedAt: string
  status: PhaseModelRoutingStatus
  requiredCapabilities: string[]
  requiredRuntimePermissions: string[]
  activeConditionIds: string[]
  candidates: CandidateRoutingEvaluation[]
  selectedCandidateId: string | null
  reasonCodes: PhaseModelRoutingReasonCode[]
  fallback: PhaseModelFallback | null
  optimizerDisposition: 'not_applicable' | 'operator_order_selected' | 'performance_evidence_insufficient' | 'qualified_tie_break_selected'
  decisionHash: string
}

const MATRIX_KEYS = [
  'schemaVersion', 'artifactId', 'generatedOn', 'approvalBasis', 'sourceContracts', 'vocabulary',
  'catalogEvidencePolicy', 'selectionPolicy', 'fallbackPolicy', 'performanceEvidencePolicy',
  'catalogReconciliation', 'externalSources', 'phaseGateBindings', 'phases',
] as const
const PHASE_KEYS = ['id', 'decisionAuthority', 'modelUse', 'riskClass', 'requiredCapabilities', 'conditionalCapabilities', 'runtimeRequirements', 'minimumCatalogEvidence'] as const
const REQUEST_KEYS = ['schemaVersion', 'requestId', 'phaseId', 'phaseContractHash', 'matrixHash', 'activeConditionIds', 'estimatedInputTokens', 'candidateIds', 'requestedEffort', 'fallback'] as const
const FALLBACK_KEYS = ['priorDecisionHash', 'failedCandidateId', 'failureReason', 'originalPhaseContractHash', 'originalRuntimePermissions', 'replaySafe'] as const
const CANDIDATE_KEYS = ['candidateId', 'runnerId', 'providerId', 'modelId', 'reasoningEffort', 'enabled', 'adapterCapabilitySha256', 'capabilities', 'supportedEfforts', 'contextWindowTokens', 'runtimePermissions', 'documentation', 'configurationCatalogSha256', 'runtimeEntitlement', 'availability', 'phaseQualification', 'observations'] as const
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_EFFORT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SHA256 = /^[0-9a-f]{64}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`phase-model-router: ${label} must be an object`)
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...keys].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`phase-model-router: ${label} fields must be exactly ${expected.join(', ')}`)
}

function assertSafeId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(`phase-model-router: ${label} must be a safe identifier`)
}

function assertEffort(value: unknown, label: string): asserts value is string | null {
  if (value !== null && (typeof value !== 'string' || !SAFE_EFFORT.test(value))) throw new Error(`phase-model-router: ${label} must be null or a safe effort identifier`)
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`phase-model-router: ${label} must be lowercase SHA-256`)
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`phase-model-router: ${label} must be a finite non-negative number`)
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`phase-model-router: ${label} must be a non-negative integer`)
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`phase-model-router: ${label} must be a positive integer`)
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`phase-model-router: ${label} must be a non-empty string`)
}

function assertStringSet(value: unknown, allowed: readonly string[] | null, label: string, allowEmpty = true): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`phase-model-router: ${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings`)
  }
  if (new Set(value).size !== value.length) throw new Error(`phase-model-router: ${label} must be unique`)
  if (allowed && value.some((entry) => !allowed.includes(entry))) throw new Error(`phase-model-router: ${label} contains an unknown value`)
}

function assertIsoInstant(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`phase-model-router: ${label} must be an ISO instant`)
}

function assertEvidenceWindow(observedAt: string, expiresAt: string, label: string): void {
  if (Date.parse(expiresAt) <= Date.parse(observedAt)) throw new Error(`phase-model-router: ${label} expiry must follow observation`)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function uniqueInOrder(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function sortedReasons(reasons: Iterable<PhaseModelRoutingReasonCode>): PhaseModelRoutingReasonCode[] {
  const set = new Set(reasons)
  return PHASE_MODEL_ROUTING_REASON_CODES.filter((reason) => set.has(reason))
}

function assertHttpsUrl(value: unknown, label: string): asserts value is string {
  assertString(value, label)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`phase-model-router: ${label} must be a valid HTTPS URL`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`phase-model-router: ${label} must be a credential-free HTTPS URL`)
}

export function validatePhaseCapabilityMatrix(value: unknown): PhaseCapabilityMatrix {
  assertRecord(value, 'matrix')
  assertExactKeys(value, MATRIX_KEYS, 'matrix')
  if (value.schemaVersion !== '1.1.0' || value.artifactId !== 'post-17-phase-capability-matrix') throw new Error('phase-model-router: unsupported matrix identity')
  assertString(value.generatedOn, 'matrix.generatedOn')
  assertString(value.approvalBasis, 'matrix.approvalBasis')
  assertRecord(value.sourceContracts, 'matrix.sourceContracts')

  assertRecord(value.vocabulary, 'matrix.vocabulary')
  assertExactKeys(value.vocabulary, ['decisionAuthorities', 'modelUse', 'riskClasses', 'catalogEvidenceTiers', 'conditionIds', 'modelCapabilities', 'runtimeRequirements'], 'matrix.vocabulary')
  const decisionAuthorities = value.vocabulary.decisionAuthorities
  const modelUse = value.vocabulary.modelUse
  const riskClasses = value.vocabulary.riskClasses
  const catalogEvidenceTiers = value.vocabulary.catalogEvidenceTiers
  const conditionIds = value.vocabulary.conditionIds
  const modelCapabilities = value.vocabulary.modelCapabilities
  const runtimeRequirements = value.vocabulary.runtimeRequirements
  assertStringSet(decisionAuthorities, null, 'matrix.vocabulary.decisionAuthorities', false)
  assertStringSet(modelUse, null, 'matrix.vocabulary.modelUse', false)
  assertStringSet(riskClasses, null, 'matrix.vocabulary.riskClasses', false)
  assertStringSet(catalogEvidenceTiers, null, 'matrix.vocabulary.catalogEvidenceTiers', false)
  assertStringSet(conditionIds, null, 'matrix.vocabulary.conditionIds', false)
  assertStringSet(modelCapabilities, null, 'matrix.vocabulary.modelCapabilities', false)
  assertStringSet(runtimeRequirements, null, 'matrix.vocabulary.runtimeRequirements', false)
  if (JSON.stringify(decisionAuthorities) !== JSON.stringify(['computed', 'human'])) throw new Error('phase-model-router: matrix decision authorities drifted')
  if (JSON.stringify(modelUse) !== JSON.stringify(['forbidden', 'optional', 'required', 'conditional'])) throw new Error('phase-model-router: matrix model-use vocabulary drifted')
  if (!catalogEvidenceTiers.includes('phase-qualified')) throw new Error('phase-model-router: matrix lacks phase-qualified evidence tier')

  assertRecord(value.selectionPolicy, 'matrix.selectionPolicy')
  assertExactKeys(value.selectionPolicy, ['mode', 'modelMayDecideGate', 'steps', 'forbidden'], 'matrix.selectionPolicy')
  if (value.selectionPolicy.mode !== 'explicit-evidence-bound' || value.selectionPolicy.modelMayDecideGate !== false) throw new Error('phase-model-router: matrix selection policy is unsafe')
  assertStringSet(value.selectionPolicy.steps, null, 'matrix.selectionPolicy.steps', false)
  assertStringSet(value.selectionPolicy.forbidden, null, 'matrix.selectionPolicy.forbidden', false)

  assertRecord(value.catalogEvidencePolicy, 'matrix.catalogEvidencePolicy')
  assertExactKeys(value.catalogEvidencePolicy, ['tierSemantics', 'routeMinimum', 'freshness', 'unknownBehavior', 'rules'], 'matrix.catalogEvidencePolicy')
  if (value.catalogEvidencePolicy.routeMinimum !== 'phase-qualified' || value.catalogEvidencePolicy.unknownBehavior !== 'needs_input') throw new Error('phase-model-router: matrix catalog evidence policy is unsafe')
  if (!Array.isArray(value.catalogEvidencePolicy.tierSemantics)) throw new Error('phase-model-router: matrix tier semantics must be an array')
  assertStringSet(value.catalogEvidencePolicy.rules, null, 'matrix.catalogEvidencePolicy.rules', false)
  assertRecord(value.catalogEvidencePolicy.freshness, 'matrix.catalogEvidencePolicy.freshness')
  assertExactKeys(value.catalogEvidencePolicy.freshness, ['officialCatalogMaxAgeDays', 'runtimeEntitlementMaxAgeDays', 'phaseQualificationMaxAgeDays', 'expiredBehavior'], 'matrix.catalogEvidencePolicy.freshness')
  for (const key of ['officialCatalogMaxAgeDays', 'runtimeEntitlementMaxAgeDays', 'phaseQualificationMaxAgeDays'] as const) assertPositiveInteger(value.catalogEvidencePolicy.freshness[key], `matrix.catalogEvidencePolicy.freshness.${key}`)
  if (value.catalogEvidencePolicy.freshness.expiredBehavior !== 'needs_input') throw new Error('phase-model-router: expired evidence must need input')

  assertRecord(value.fallbackPolicy, 'matrix.fallbackPolicy')
  assertExactKeys(value.fallbackPolicy, ['allowedOnlyWhen', 'forbiddenWhen', 'noEligibleFallback', 'silentFallback'], 'matrix.fallbackPolicy')
  assertStringSet(value.fallbackPolicy.allowedOnlyWhen, null, 'matrix.fallbackPolicy.allowedOnlyWhen', false)
  assertStringSet(value.fallbackPolicy.forbiddenWhen, null, 'matrix.fallbackPolicy.forbiddenWhen', false)
  if (value.fallbackPolicy.noEligibleFallback !== 'needs_input' || value.fallbackPolicy.silentFallback !== false) throw new Error('phase-model-router: matrix fallback policy is unsafe')

  assertRecord(value.performanceEvidencePolicy, 'matrix.performanceEvidencePolicy')
  assertExactKeys(value.performanceEvidencePolicy, ['optimizerEnabled', 'currentDecision', 'requiredObservationKey', 'minimumComparableCompletedRunsPerCandidate', 'maximumObservationAgeDays', 'requiredMetrics', 'rankingRules', 'currentEvidenceGap'], 'matrix.performanceEvidencePolicy')
  if (typeof value.performanceEvidencePolicy.optimizerEnabled !== 'boolean') throw new Error('phase-model-router: optimizerEnabled must be boolean')
  assertString(value.performanceEvidencePolicy.currentDecision, 'matrix.performanceEvidencePolicy.currentDecision')
  assertStringSet(value.performanceEvidencePolicy.requiredObservationKey, null, 'matrix.performanceEvidencePolicy.requiredObservationKey', false)
  assertPositiveInteger(value.performanceEvidencePolicy.minimumComparableCompletedRunsPerCandidate, 'matrix.performanceEvidencePolicy.minimumComparableCompletedRunsPerCandidate')
  if (value.performanceEvidencePolicy.minimumComparableCompletedRunsPerCandidate > PHASE_MODEL_ROUTING_MAX_OBSERVATIONS) throw new Error('phase-model-router: optimizer sample floor exceeds observation bound')
  assertPositiveInteger(value.performanceEvidencePolicy.maximumObservationAgeDays, 'matrix.performanceEvidencePolicy.maximumObservationAgeDays')
  assertStringSet(value.performanceEvidencePolicy.requiredMetrics, null, 'matrix.performanceEvidencePolicy.requiredMetrics', false)
  assertStringSet(value.performanceEvidencePolicy.rankingRules, null, 'matrix.performanceEvidencePolicy.rankingRules', false)
  assertString(value.performanceEvidencePolicy.currentEvidenceGap, 'matrix.performanceEvidencePolicy.currentEvidenceGap')

  assertRecord(value.catalogReconciliation, 'matrix.catalogReconciliation')
  assertExactKeys(value.catalogReconciliation, ['snapshotOn', 'runners', 'unmergedInventory'], 'matrix.catalogReconciliation')
  assertString(value.catalogReconciliation.snapshotOn, 'matrix.catalogReconciliation.snapshotOn')
  if (!Array.isArray(value.catalogReconciliation.runners) || !Array.isArray(value.catalogReconciliation.unmergedInventory)) throw new Error('phase-model-router: matrix catalog reconciliation arrays are invalid')
  for (const [index, runner] of value.catalogReconciliation.runners.entries()) {
    assertRecord(runner, `matrix.catalogReconciliation.runners[${index}]`)
    if (runner.routableNow !== false) throw new Error('phase-model-router: canonical catalog entries cannot be pre-authorized')
  }
  if (!Array.isArray(value.externalSources)) throw new Error('phase-model-router: matrix externalSources must be an array')
  assertRecord(value.phaseGateBindings, 'matrix.phaseGateBindings')
  if (!Array.isArray(value.phases) || value.phases.length === 0) throw new Error('phase-model-router: matrix phases must be non-empty')

  const phases: PhaseCapability[] = []
  for (const [index, raw] of value.phases.entries()) {
    assertRecord(raw, `matrix.phases[${index}]`)
    assertExactKeys(raw, PHASE_KEYS, `matrix.phases[${index}]`)
    assertSafeId(raw.id, `matrix.phases[${index}].id`)
    if (!decisionAuthorities.includes(raw.decisionAuthority as string)) throw new Error(`phase-model-router: ${raw.id} decision authority is unknown`)
    if (!modelUse.includes(raw.modelUse as string)) throw new Error(`phase-model-router: ${raw.id} model use is unknown`)
    assertString(raw.riskClass, `matrix.phases[${index}].riskClass`)
    if (!riskClasses.includes(raw.riskClass)) throw new Error(`phase-model-router: ${raw.id} risk class is unknown`)
    assertStringSet(raw.requiredCapabilities, modelCapabilities, `matrix.phases[${index}].requiredCapabilities`)
    assertStringSet(raw.runtimeRequirements, runtimeRequirements, `matrix.phases[${index}].runtimeRequirements`, false)
    if (!Array.isArray(raw.conditionalCapabilities)) throw new Error(`phase-model-router: ${raw.id} conditionalCapabilities must be an array`)
    const conditionalCapabilities: ConditionalCapability[] = []
    for (const [conditionIndex, condition] of raw.conditionalCapabilities.entries()) {
      assertRecord(condition, `matrix.phases[${index}].conditionalCapabilities[${conditionIndex}]`)
      assertExactKeys(condition, ['conditionId', 'when', 'capabilities'], `matrix.phases[${index}].conditionalCapabilities[${conditionIndex}]`)
      assertSafeId(condition.conditionId, `matrix.phases[${index}].conditionalCapabilities[${conditionIndex}].conditionId`)
      if (!conditionIds.includes(condition.conditionId)) throw new Error(`phase-model-router: ${raw.id} condition is unknown`)
      assertString(condition.when, `matrix.phases[${index}].conditionalCapabilities[${conditionIndex}].when`)
      assertStringSet(condition.capabilities, modelCapabilities, `matrix.phases[${index}].conditionalCapabilities[${conditionIndex}].capabilities`, false)
      conditionalCapabilities.push(condition as unknown as ConditionalCapability)
    }
    if (new Set(conditionalCapabilities.map((entry) => entry.conditionId)).size !== conditionalCapabilities.length) throw new Error(`phase-model-router: ${raw.id} condition IDs must be unique`)
    if (raw.modelUse === 'forbidden' && (raw.requiredCapabilities.length > 0 || conditionalCapabilities.length > 0 || raw.minimumCatalogEvidence !== 'not-applicable')) throw new Error(`phase-model-router: ${raw.id} forbidden-model contract is inconsistent`)
    if (raw.modelUse !== 'forbidden' && raw.minimumCatalogEvidence !== 'phase-qualified') throw new Error(`phase-model-router: ${raw.id} must require phase qualification`)
    if (raw.modelUse === 'required' && raw.requiredCapabilities.length === 0) throw new Error(`phase-model-router: ${raw.id} required-model contract lacks capabilities`)
    if (['optional', 'conditional'].includes(raw.modelUse as string) && conditionalCapabilities.length === 0) throw new Error(`phase-model-router: ${raw.id} conditional model contract lacks a condition`)
    phases.push(raw as unknown as PhaseCapability)
  }
  const phaseIds = phases.map((phase) => phase.id)
  if (new Set(phaseIds).size !== phaseIds.length) throw new Error('phase-model-router: phase IDs must be unique')
  if (phaseIds.length !== 24) throw new Error('phase-model-router: matrix must contain 24 phases')
  const boundConditionIds = phases.flatMap((entry) => entry.conditionalCapabilities.map((condition) => condition.conditionId))
  if (new Set(boundConditionIds).size !== boundConditionIds.length || JSON.stringify([...boundConditionIds].sort(compareText)) !== JSON.stringify([...conditionIds].sort(compareText))) {
    throw new Error('phase-model-router: matrix condition IDs must be bound exactly once')
  }
  const gateIds = Object.keys(value.phaseGateBindings)
  if (JSON.stringify(gateIds) !== JSON.stringify(phaseIds)) throw new Error('phase-model-router: phase gate bindings must match phase order exactly')
  for (const phase of phases) assertString(value.phaseGateBindings[phase.id], `matrix.phaseGateBindings.${phase.id}`)
  return value as unknown as PhaseCapabilityMatrix
}

export function hashPhaseCapabilityMatrix(matrixInput: unknown): string {
  return sha256(stableJson(validatePhaseCapabilityMatrix(matrixInput)))
}

export function hashPhaseContract(matrixInput: unknown, phaseId: string): string {
  const matrix = validatePhaseCapabilityMatrix(matrixInput)
  assertSafeId(phaseId, 'phaseId')
  const phase = matrix.phases.find((entry) => entry.id === phaseId)
  if (!phase) throw new Error(`phase-model-router: unknown phase ${phaseId}`)
  return sha256(stableJson({ matrixSchemaVersion: matrix.schemaVersion, gate: matrix.phaseGateBindings[phaseId], phase }))
}

function validateFallback(value: unknown): PhaseModelFallback | null {
  if (value === null) return null
  assertRecord(value, 'request.fallback')
  assertExactKeys(value, FALLBACK_KEYS, 'request.fallback')
  if (value.priorDecisionHash !== null) assertSha256(value.priorDecisionHash, 'request.fallback.priorDecisionHash')
  if (value.failedCandidateId !== null) assertSafeId(value.failedCandidateId, 'request.fallback.failedCandidateId')
  if (value.failureReason !== null && !FALLBACK_FAILURE_REASONS.includes(value.failureReason as FallbackFailureReason)) throw new Error('phase-model-router: request.fallback.failureReason is unknown')
  assertSha256(value.originalPhaseContractHash, 'request.fallback.originalPhaseContractHash')
  assertStringSet(value.originalRuntimePermissions, null, 'request.fallback.originalRuntimePermissions')
  if (typeof value.replaySafe !== 'boolean') throw new Error('phase-model-router: request.fallback.replaySafe must be boolean')
  return value as unknown as PhaseModelFallback
}

export function validatePhaseModelRoutingRequest(value: unknown): PhaseModelRoutingRequest {
  assertRecord(value, 'request')
  assertExactKeys(value, REQUEST_KEYS, 'request')
  if (value.schemaVersion !== PHASE_MODEL_ROUTING_SCHEMA_VERSION) throw new Error('phase-model-router: unsupported request schema')
  assertSafeId(value.requestId, 'request.requestId')
  assertSafeId(value.phaseId, 'request.phaseId')
  assertSha256(value.phaseContractHash, 'request.phaseContractHash')
  assertSha256(value.matrixHash, 'request.matrixHash')
  assertStringSet(value.activeConditionIds, null, 'request.activeConditionIds')
  if (value.estimatedInputTokens !== null) assertNonNegativeInteger(value.estimatedInputTokens, 'request.estimatedInputTokens')
  assertStringSet(value.candidateIds, null, 'request.candidateIds')
  if (value.candidateIds.length > PHASE_MODEL_ROUTING_MAX_CANDIDATES) throw new Error(`phase-model-router: request.candidateIds exceeds ${PHASE_MODEL_ROUTING_MAX_CANDIDATES}`)
  assertEffort(value.requestedEffort, 'request.requestedEffort')
  const fallback = validateFallback(value.fallback)
  if (fallback?.failedCandidateId && value.candidateIds.includes(fallback.failedCandidateId)) throw new Error('phase-model-router: a failed candidate cannot be requested as its own fallback')
  return { ...(value as unknown as PhaseModelRoutingRequest), fallback }
}

export function hashPhaseModelRoutingRequest(requestInput: unknown): string {
  return sha256(stableJson(validatePhaseModelRoutingRequest(requestInput)))
}

function validateDocumentation(value: unknown, label: string): DocumentationEvidence | null {
  if (value === null) return null
  assertRecord(value, label)
  assertExactKeys(value, ['sourceUrl', 'sourceSha256', 'fetchedAt', 'expiresAt'], label)
  assertHttpsUrl(value.sourceUrl, `${label}.sourceUrl`)
  assertSha256(value.sourceSha256, `${label}.sourceSha256`)
  assertIsoInstant(value.fetchedAt, `${label}.fetchedAt`)
  assertIsoInstant(value.expiresAt, `${label}.expiresAt`)
  assertEvidenceWindow(value.fetchedAt, value.expiresAt, label)
  return value as unknown as DocumentationEvidence
}

function validateEntitlement(value: unknown, label: string): RuntimeEntitlementEvidence | null {
  if (value === null) return null
  assertRecord(value, label)
  assertExactKeys(value, ['runnerId', 'providerId', 'modelId', 'reasoningEffort', 'resolvedModelId', 'adapterCapabilitySha256', 'evidenceSha256', 'observedAt', 'expiresAt'], label)
  for (const key of ['runnerId', 'providerId', 'modelId', 'resolvedModelId'] as const) assertSafeId(value[key], `${label}.${key}`)
  assertEffort(value.reasoningEffort, `${label}.reasoningEffort`)
  assertSha256(value.adapterCapabilitySha256, `${label}.adapterCapabilitySha256`)
  assertSha256(value.evidenceSha256, `${label}.evidenceSha256`)
  assertIsoInstant(value.observedAt, `${label}.observedAt`)
  assertIsoInstant(value.expiresAt, `${label}.expiresAt`)
  assertEvidenceWindow(value.observedAt, value.expiresAt, label)
  return value as unknown as RuntimeEntitlementEvidence
}

function validateAvailability(value: unknown, label: string): AvailabilityEvidence | null {
  if (value === null) return null
  assertRecord(value, label)
  assertExactKeys(value, ['status', 'observedAt', 'expiresAt'], label)
  if (!['available', 'unavailable', 'unknown'].includes(String(value.status))) throw new Error(`phase-model-router: ${label}.status is unknown`)
  if (value.status === 'unknown') {
    if (value.observedAt !== null || value.expiresAt !== null) throw new Error(`phase-model-router: ${label} unknown status cannot claim an evidence window`)
  } else {
    assertIsoInstant(value.observedAt, `${label}.observedAt`)
    assertIsoInstant(value.expiresAt, `${label}.expiresAt`)
    assertEvidenceWindow(value.observedAt, value.expiresAt, label)
  }
  return value as unknown as AvailabilityEvidence
}

function validateQualification(value: unknown, label: string): PhaseQualificationEvidence | null {
  if (value === null) return null
  assertRecord(value, label)
  assertExactKeys(value, ['phaseId', 'phaseContractSha256', 'adapterCapabilitySha256', 'fixtureSha256', 'verdict', 'evidenceSha256', 'observedAt', 'expiresAt'], label)
  assertSafeId(value.phaseId, `${label}.phaseId`)
  for (const key of ['phaseContractSha256', 'adapterCapabilitySha256', 'fixtureSha256', 'evidenceSha256'] as const) assertSha256(value[key], `${label}.${key}`)
  if (!['pass', 'fail'].includes(String(value.verdict))) throw new Error(`phase-model-router: ${label}.verdict is unknown`)
  assertIsoInstant(value.observedAt, `${label}.observedAt`)
  assertIsoInstant(value.expiresAt, `${label}.expiresAt`)
  assertEvidenceWindow(value.observedAt, value.expiresAt, label)
  return value as unknown as PhaseQualificationEvidence
}

function validateObservation(value: unknown, label: string): PhasePerformanceObservation {
  assertRecord(value, label)
  assertExactKeys(value, ['phaseId', 'phaseContractSha256', 'runnerId', 'providerId', 'modelId', 'reasoningEffort', 'adapterCapabilitySha256', 'fixtureSha256', 'trustedPhaseVerdict', 'durationMs', 'inputTokens', 'outputTokens', 'pricingStatus', 'costUsd', 'completedAt', 'evidenceSha256'], label)
  for (const key of ['phaseId', 'runnerId', 'providerId', 'modelId'] as const) assertSafeId(value[key], `${label}.${key}`)
  assertEffort(value.reasoningEffort, `${label}.reasoningEffort`)
  for (const key of ['phaseContractSha256', 'adapterCapabilitySha256', 'fixtureSha256', 'evidenceSha256'] as const) assertSha256(value[key], `${label}.${key}`)
  if (!['pass', 'fail'].includes(String(value.trustedPhaseVerdict))) throw new Error(`phase-model-router: ${label}.trustedPhaseVerdict is unknown`)
  for (const key of ['durationMs', 'inputTokens', 'outputTokens'] as const) if (value[key] !== null) assertNonNegativeInteger(value[key], `${label}.${key}`)
  if (!['priced', 'unpriced'].includes(String(value.pricingStatus))) throw new Error(`phase-model-router: ${label}.pricingStatus is unknown`)
  if (value.costUsd !== null) assertFiniteNonNegative(value.costUsd, `${label}.costUsd`)
  if ((value.pricingStatus === 'priced') !== (value.costUsd !== null)) throw new Error(`phase-model-router: ${label} pricing status and cost are inconsistent`)
  assertIsoInstant(value.completedAt, `${label}.completedAt`)
  return value as unknown as PhasePerformanceObservation
}

export function validatePhaseModelCandidate(value: unknown, index = 0): PhaseModelCandidate {
  const label = `candidates[${index}]`
  assertRecord(value, label)
  assertExactKeys(value, CANDIDATE_KEYS, label)
  for (const key of ['candidateId', 'runnerId', 'providerId', 'modelId'] as const) assertSafeId(value[key], `${label}.${key}`)
  assertEffort(value.reasoningEffort, `${label}.reasoningEffort`)
  if (typeof value.enabled !== 'boolean') throw new Error(`phase-model-router: ${label}.enabled must be boolean`)
  assertSha256(value.adapterCapabilitySha256, `${label}.adapterCapabilitySha256`)
  assertStringSet(value.capabilities, null, `${label}.capabilities`)
  assertStringSet(value.supportedEfforts, null, `${label}.supportedEfforts`)
  for (const effort of value.supportedEfforts) assertEffort(effort, `${label}.supportedEfforts`)
  if (value.contextWindowTokens !== null) assertPositiveInteger(value.contextWindowTokens, `${label}.contextWindowTokens`)
  assertStringSet(value.runtimePermissions, null, `${label}.runtimePermissions`)
  const documentation = validateDocumentation(value.documentation, `${label}.documentation`)
  if (value.configurationCatalogSha256 !== null) assertSha256(value.configurationCatalogSha256, `${label}.configurationCatalogSha256`)
  const runtimeEntitlement = validateEntitlement(value.runtimeEntitlement, `${label}.runtimeEntitlement`)
  const availability = validateAvailability(value.availability, `${label}.availability`)
  const phaseQualification = validateQualification(value.phaseQualification, `${label}.phaseQualification`)
  if (!Array.isArray(value.observations) || value.observations.length > PHASE_MODEL_ROUTING_MAX_OBSERVATIONS) throw new Error(`phase-model-router: ${label}.observations exceeds ${PHASE_MODEL_ROUTING_MAX_OBSERVATIONS}`)
  const observations = value.observations.map((entry, observationIndex) => validateObservation(entry, `${label}.observations[${observationIndex}]`))
  if (new Set(observations.map((entry) => entry.evidenceSha256)).size !== observations.length) throw new Error(`phase-model-router: ${label}.observations evidence hashes must be unique`)
  return { ...(value as unknown as PhaseModelCandidate), documentation, runtimeEntitlement, availability, phaseQualification, observations }
}

export function hashPhaseModelCandidate(candidateInput: unknown): string {
  return sha256(stableJson(validatePhaseModelCandidate(candidateInput)))
}

function isExpired(expiresAt: string, evaluatedMs: number): boolean {
  return Date.parse(expiresAt) <= evaluatedMs
}

function isFuture(observedAt: string, evaluatedMs: number): boolean {
  return Date.parse(observedAt) > evaluatedMs
}

function assertWindowWithin(observedAt: string, expiresAt: string, maximumDays: number, label: string): void {
  if (Date.parse(expiresAt) - Date.parse(observedAt) > maximumDays * 86_400_000) throw new Error(`phase-model-router: ${label} exceeds matrix freshness ceiling`)
}

function validateCandidateAgainstMatrix(candidate: PhaseModelCandidate, matrix: PhaseCapabilityMatrix): void {
  if (candidate.capabilities.some((capability) => !matrix.vocabulary.modelCapabilities.includes(capability))) throw new Error(`phase-model-router: ${candidate.candidateId} declares an unknown capability`)
  if (candidate.runtimePermissions.some((permission) => !matrix.vocabulary.runtimeRequirements.includes(permission))) throw new Error(`phase-model-router: ${candidate.candidateId} declares an unknown runtime permission`)
  if (candidate.documentation) assertWindowWithin(candidate.documentation.fetchedAt, candidate.documentation.expiresAt, matrix.catalogEvidencePolicy.freshness.officialCatalogMaxAgeDays, `${candidate.candidateId} documentation`)
  if (candidate.runtimeEntitlement) assertWindowWithin(candidate.runtimeEntitlement.observedAt, candidate.runtimeEntitlement.expiresAt, matrix.catalogEvidencePolicy.freshness.runtimeEntitlementMaxAgeDays, `${candidate.candidateId} runtime entitlement`)
  if (candidate.availability?.observedAt && candidate.availability.expiresAt) assertWindowWithin(candidate.availability.observedAt, candidate.availability.expiresAt, matrix.catalogEvidencePolicy.freshness.runtimeEntitlementMaxAgeDays, `${candidate.candidateId} availability`)
  if (candidate.phaseQualification) assertWindowWithin(candidate.phaseQualification.observedAt, candidate.phaseQualification.expiresAt, matrix.catalogEvidencePolicy.freshness.phaseQualificationMaxAgeDays, `${candidate.candidateId} phase qualification`)
}

function identityMatches(candidate: PhaseModelCandidate, entitlement: RuntimeEntitlementEvidence): boolean {
  return entitlement.runnerId === candidate.runnerId
    && entitlement.providerId === candidate.providerId
    && entitlement.modelId === candidate.modelId
    && entitlement.reasoningEffort === candidate.reasoningEffort
    && entitlement.resolvedModelId === candidate.modelId
    && entitlement.adapterCapabilitySha256 === candidate.adapterCapabilitySha256
}

function evaluateCandidate(
  candidate: PhaseModelCandidate,
  phase: PhaseCapability,
  request: PhaseModelRoutingRequest,
  requiredCapabilities: string[],
  evaluatedMs: number,
): CandidateRoutingEvaluation {
  const reasons = new Set<PhaseModelRoutingReasonCode>()
  if (!candidate.enabled) reasons.add('candidate_disabled')
  if (!candidate.documentation) reasons.add('documentation_missing')
  else if (isFuture(candidate.documentation.fetchedAt, evaluatedMs) || isExpired(candidate.documentation.expiresAt, evaluatedMs)) reasons.add('documentation_expired')
  if (!candidate.configurationCatalogSha256) reasons.add('configuration_missing')

  const entitlement = candidate.runtimeEntitlement
  if (!entitlement) reasons.add('runtime_entitlement_missing')
  else {
    if (isFuture(entitlement.observedAt, evaluatedMs) || isExpired(entitlement.expiresAt, evaluatedMs)) reasons.add('runtime_entitlement_expired')
    if (!identityMatches(candidate, entitlement)) reasons.add('resolved_identity_mismatch')
  }

  const availability = candidate.availability
  if (!availability || availability.status === 'unknown' || availability.observedAt === null || availability.expiresAt === null || isFuture(availability.observedAt, evaluatedMs) || isExpired(availability.expiresAt, evaluatedMs)) reasons.add('availability_unknown')
  else if (availability.status === 'unavailable') reasons.add('candidate_unavailable')

  const qualification = candidate.phaseQualification
  if (!qualification) reasons.add('phase_qualification_missing')
  else {
    if (isFuture(qualification.observedAt, evaluatedMs) || isExpired(qualification.expiresAt, evaluatedMs)) reasons.add('phase_qualification_expired')
    if (qualification.verdict !== 'pass') reasons.add('phase_qualification_failed')
    if (qualification.phaseId !== phase.id || qualification.phaseContractSha256 !== request.phaseContractHash) reasons.add('phase_contract_mismatch')
    if (qualification.adapterCapabilitySha256 !== candidate.adapterCapabilitySha256) reasons.add('adapter_capability_hash_mismatch')
  }

  if (requiredCapabilities.some((capability) => !candidate.capabilities.includes(capability))) reasons.add('required_capability_missing')
  if (phase.runtimeRequirements.some((permission) => !candidate.runtimePermissions.includes(permission))) reasons.add('runtime_permission_missing')
  if (request.fallback && candidate.runtimePermissions.some((permission) => !request.fallback!.originalRuntimePermissions.includes(permission))) reasons.add('fallback_permission_escalation')
  if (request.requestedEffort !== null && (!candidate.supportedEfforts.includes(request.requestedEffort) || candidate.reasoningEffort !== request.requestedEffort)) reasons.add('requested_effort_unsupported')
  if (requiredCapabilities.includes('context-window-fit')) {
    if (request.estimatedInputTokens === null || candidate.contextWindowTokens === null) reasons.add('context_window_unknown')
    else if (request.estimatedInputTokens > candidate.contextWindowTokens) reasons.add('context_window_insufficient')
  }
  const reasonCodes = sortedReasons(reasons)
  return { candidateId: candidate.candidateId, candidateEvidenceHash: hashPhaseModelCandidate(candidate), eligible: reasonCodes.length === 0, reasonCodes }
}

function fallbackReasons(fallback: PhaseModelFallback | null, request: PhaseModelRoutingRequest, phase: PhaseCapability): PhaseModelRoutingReasonCode[] {
  if (!fallback) return []
  const reasons = new Set<PhaseModelRoutingReasonCode>()
  if (!fallback.priorDecisionHash || !fallback.failedCandidateId || !fallback.failureReason) reasons.add('fallback_missing_lineage')
  if (!fallback.replaySafe) reasons.add('fallback_not_replay_safe')
  if (fallback.originalPhaseContractHash !== request.phaseContractHash) reasons.add('fallback_contract_mismatch')
  if (phase.runtimeRequirements.some((permission) => !fallback.originalRuntimePermissions.includes(permission))) reasons.add('fallback_permission_escalation')
  return sortedReasons(reasons)
}

interface ComparableScore {
  candidateId: string
  averageCostUsd: number
  averageDurationMs: number
}

function comparableScore(candidate: PhaseModelCandidate, phase: PhaseCapability, request: PhaseModelRoutingRequest, evaluatedMs: number, matrix: PhaseCapabilityMatrix): ComparableScore | null {
  const qualification = candidate.phaseQualification
  if (!qualification) return null
  const cutoff = evaluatedMs - matrix.performanceEvidencePolicy.maximumObservationAgeDays * 86_400_000
  const observations = candidate.observations.filter((entry) =>
    entry.phaseId === phase.id
    && entry.phaseContractSha256 === request.phaseContractHash
    && entry.runnerId === candidate.runnerId
    && entry.providerId === candidate.providerId
    && entry.modelId === candidate.modelId
    && entry.reasoningEffort === candidate.reasoningEffort
    && entry.adapterCapabilitySha256 === candidate.adapterCapabilitySha256
    && entry.fixtureSha256 === qualification.fixtureSha256
    && entry.trustedPhaseVerdict === 'pass'
    && entry.durationMs !== null
    && entry.pricingStatus === 'priced'
    && entry.costUsd !== null
    && Date.parse(entry.completedAt) >= cutoff
    && Date.parse(entry.completedAt) <= evaluatedMs
  )
  if (observations.length < matrix.performanceEvidencePolicy.minimumComparableCompletedRunsPerCandidate) return null
  return {
    candidateId: candidate.candidateId,
    averageCostUsd: observations.reduce((total, entry) => total + (entry.costUsd ?? 0), 0) / observations.length,
    averageDurationMs: observations.reduce((total, entry) => total + (entry.durationMs ?? 0), 0) / observations.length,
  }
}

function buildDecision(input: Omit<PhaseModelRoutingDecision, 'schemaVersion' | 'decisionHash'>): PhaseModelRoutingDecision {
  const withoutHash = { schemaVersion: PHASE_MODEL_ROUTING_SCHEMA_VERSION, ...input }
  return { ...withoutHash, decisionHash: sha256(stableJson(withoutHash)) }
}

export function validatePhaseModelRoutingDecision(value: unknown): PhaseModelRoutingDecision {
  assertRecord(value, 'decision')
  assertExactKeys(value, ['schemaVersion', 'requestId', 'requestHash', 'matrixHash', 'phaseId', 'phaseContractHash', 'evaluatedAt', 'status', 'requiredCapabilities', 'requiredRuntimePermissions', 'activeConditionIds', 'candidates', 'selectedCandidateId', 'reasonCodes', 'fallback', 'optimizerDisposition', 'decisionHash'], 'decision')
  if (value.schemaVersion !== PHASE_MODEL_ROUTING_SCHEMA_VERSION) throw new Error('phase-model-router: unsupported decision schema')
  assertSafeId(value.requestId, 'decision.requestId')
  assertSha256(value.requestHash, 'decision.requestHash')
  assertSafeId(value.phaseId, 'decision.phaseId')
  assertSha256(value.matrixHash, 'decision.matrixHash')
  assertSha256(value.phaseContractHash, 'decision.phaseContractHash')
  assertIsoInstant(value.evaluatedAt, 'decision.evaluatedAt')
  if (!['selected', 'no_model', 'needs_input'].includes(String(value.status))) throw new Error('phase-model-router: decision.status is unknown')
  assertStringSet(value.requiredCapabilities, null, 'decision.requiredCapabilities')
  assertStringSet(value.requiredRuntimePermissions, null, 'decision.requiredRuntimePermissions')
  assertStringSet(value.activeConditionIds, null, 'decision.activeConditionIds')
  if (!Array.isArray(value.candidates) || value.candidates.length > PHASE_MODEL_ROUTING_MAX_CANDIDATES) throw new Error('phase-model-router: decision.candidates is invalid')
  const candidateIds: string[] = []
  for (const [index, candidate] of value.candidates.entries()) {
    assertRecord(candidate, `decision.candidates[${index}]`)
    assertExactKeys(candidate, ['candidateId', 'candidateEvidenceHash', 'eligible', 'reasonCodes'], `decision.candidates[${index}]`)
    assertSafeId(candidate.candidateId, `decision.candidates[${index}].candidateId`)
    if (candidate.candidateEvidenceHash !== null) assertSha256(candidate.candidateEvidenceHash, `decision.candidates[${index}].candidateEvidenceHash`)
    if (typeof candidate.eligible !== 'boolean') throw new Error(`phase-model-router: decision.candidates[${index}].eligible must be boolean`)
    assertStringSet(candidate.reasonCodes, PHASE_MODEL_ROUTING_REASON_CODES, `decision.candidates[${index}].reasonCodes`)
    if (JSON.stringify(candidate.reasonCodes) !== JSON.stringify(sortedReasons(candidate.reasonCodes as PhaseModelRoutingReasonCode[]))) throw new Error(`phase-model-router: decision.candidates[${index}].reasonCodes are not canonical`)
    if (candidate.eligible !== (candidate.reasonCodes.length === 0)) throw new Error(`phase-model-router: decision.candidates[${index}] eligibility is inconsistent`)
    candidateIds.push(candidate.candidateId)
  }
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error('phase-model-router: decision candidate IDs must be unique')
  if (value.selectedCandidateId !== null) assertSafeId(value.selectedCandidateId, 'decision.selectedCandidateId')
  assertStringSet(value.reasonCodes, PHASE_MODEL_ROUTING_REASON_CODES, 'decision.reasonCodes')
  if (JSON.stringify(value.reasonCodes) !== JSON.stringify(sortedReasons(value.reasonCodes as PhaseModelRoutingReasonCode[]))) throw new Error('phase-model-router: decision.reasonCodes are not canonical')
  validateFallback(value.fallback)
  if (!['not_applicable', 'operator_order_selected', 'performance_evidence_insufficient', 'qualified_tie_break_selected'].includes(String(value.optimizerDisposition))) throw new Error('phase-model-router: decision.optimizerDisposition is unknown')
  assertSha256(value.decisionHash, 'decision.decisionHash')
  if (value.status === 'selected') {
    if (typeof value.selectedCandidateId !== 'string' || !value.candidates.some((entry) => isRecord(entry) && entry.candidateId === value.selectedCandidateId && entry.eligible === true)) throw new Error('phase-model-router: selected decision lacks an eligible candidate')
    if (!['operator_order_selected', 'qualified_tie_break_selected'].includes(String(value.optimizerDisposition)) || JSON.stringify(value.reasonCodes) !== JSON.stringify([value.optimizerDisposition])) throw new Error('phase-model-router: selected decision optimizer evidence is inconsistent')
  } else if (value.selectedCandidateId !== null) throw new Error('phase-model-router: non-selected decision cannot name a candidate')
  if (value.status === 'no_model' && (value.optimizerDisposition !== 'not_applicable' || value.reasonCodes.length !== 1 || !['phase_model_forbidden', 'phase_model_not_requested'].includes(value.reasonCodes[0] as string))) throw new Error('phase-model-router: no_model decision is inconsistent')
  if (value.status === 'needs_input') {
    if (value.reasonCodes.length === 0 || value.reasonCodes.some((reason) => ['operator_order_selected', 'qualified_tie_break_selected'].includes(reason as string))) throw new Error('phase-model-router: needs_input decision reasons are inconsistent')
    if ((value.optimizerDisposition === 'performance_evidence_insufficient') !== (JSON.stringify(value.reasonCodes) === JSON.stringify(['performance_evidence_insufficient']))) throw new Error('phase-model-router: needs_input optimizer evidence is inconsistent')
    if (!['not_applicable', 'performance_evidence_insufficient'].includes(String(value.optimizerDisposition))) throw new Error('phase-model-router: needs_input optimizer disposition is inconsistent')
  }
  const decision = value as unknown as PhaseModelRoutingDecision
  const { decisionHash, ...withoutHash } = decision
  if (sha256(stableJson(withoutHash)) !== decisionHash) throw new Error('phase-model-router: decision hash mismatch')
  return decision
}

export function routePhaseModel(matrixInput: unknown, requestInput: unknown, candidateInputs: unknown[], evaluatedAt: string): PhaseModelRoutingDecision {
  const matrix = validatePhaseCapabilityMatrix(matrixInput)
  const request = validatePhaseModelRoutingRequest(requestInput)
  assertIsoInstant(evaluatedAt, 'evaluatedAt')
  if (!Array.isArray(candidateInputs) || candidateInputs.length > PHASE_MODEL_ROUTING_MAX_CANDIDATES) throw new Error(`phase-model-router: candidates exceeds ${PHASE_MODEL_ROUTING_MAX_CANDIDATES}`)
  const candidates = candidateInputs.map((entry, index) => validatePhaseModelCandidate(entry, index))
  if (new Set(candidates.map((entry) => entry.candidateId)).size !== candidates.length) throw new Error('phase-model-router: candidate IDs must be unique')
  if (candidates.some((entry) => !request.candidateIds.includes(entry.candidateId))) throw new Error('phase-model-router: unrequested candidate evidence is forbidden')
  for (const candidate of candidates) validateCandidateAgainstMatrix(candidate, matrix)
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]))
  const passiveEvaluations = (reasonCodes: PhaseModelRoutingReasonCode[]): CandidateRoutingEvaluation[] => request.candidateIds.map((candidateId) => {
    const candidate = candidateById.get(candidateId)
    return { candidateId, candidateEvidenceHash: candidate ? hashPhaseModelCandidate(candidate) : null, eligible: false, reasonCodes }
  })

  const matrixHash = hashPhaseCapabilityMatrix(matrix)
  if (request.matrixHash !== matrixHash) throw new Error('phase-model-router: matrix hash mismatch')
  const phase = matrix.phases.find((entry) => entry.id === request.phaseId)
  if (!phase) throw new Error(`phase-model-router: unknown phase ${request.phaseId}`)
  const phaseContractHash = hashPhaseContract(matrix, phase.id)
  if (request.phaseContractHash !== phaseContractHash) throw new Error('phase-model-router: phase contract hash mismatch')

  const knownConditions = new Set(matrix.vocabulary.conditionIds)
  const phaseConditions = new Set(phase.conditionalCapabilities.map((entry) => entry.conditionId))
  const conditionReasons = new Set<PhaseModelRoutingReasonCode>()
  for (const condition of request.activeConditionIds) {
    if (!knownConditions.has(condition)) conditionReasons.add('condition_unknown')
    else if (!phaseConditions.has(condition)) conditionReasons.add('condition_not_applicable')
  }
  const activeConditionalCapabilities = phase.conditionalCapabilities
    .filter((entry) => request.activeConditionIds.includes(entry.conditionId))
    .flatMap((entry) => entry.capabilities)
  const requiredCapabilities = uniqueInOrder([...phase.requiredCapabilities, ...activeConditionalCapabilities])
  const common = {
    requestId: request.requestId,
    requestHash: hashPhaseModelRoutingRequest(request),
    matrixHash,
    phaseId: phase.id,
    phaseContractHash,
    evaluatedAt,
    requiredCapabilities,
    requiredRuntimePermissions: [...phase.runtimeRequirements],
    activeConditionIds: [...request.activeConditionIds],
    fallback: request.fallback,
  }

  if (conditionReasons.size > 0) {
    const reasons = sortedReasons(conditionReasons)
    return validatePhaseModelRoutingDecision(buildDecision({
      ...common,
      status: 'needs_input',
      candidates: passiveEvaluations(reasons),
      selectedCandidateId: null,
      reasonCodes: reasons,
      optimizerDisposition: 'not_applicable',
    }))
  }

  const phaseNoModelReason = phase.modelUse === 'forbidden'
    ? 'phase_model_forbidden'
    : (['optional', 'conditional'].includes(phase.modelUse) && activeConditionalCapabilities.length === 0 ? 'phase_model_not_requested' : null)
  if (phaseNoModelReason) {
    return validatePhaseModelRoutingDecision(buildDecision({
      ...common,
      status: 'no_model',
      candidates: passiveEvaluations([phaseNoModelReason]),
      selectedCandidateId: null,
      reasonCodes: [phaseNoModelReason],
      optimizerDisposition: 'not_applicable',
    }))
  }

  const fallbackFailures = fallbackReasons(request.fallback, request, phase)
  if (fallbackFailures.length > 0) {
    return validatePhaseModelRoutingDecision(buildDecision({
      ...common,
      status: 'needs_input',
      candidates: passiveEvaluations(fallbackFailures),
      selectedCandidateId: null,
      reasonCodes: fallbackFailures,
      optimizerDisposition: 'not_applicable',
    }))
  }

  const evaluatedMs = Date.parse(evaluatedAt)
  const evaluations = request.candidateIds.map((candidateId): CandidateRoutingEvaluation => {
    const candidate = candidateById.get(candidateId)
    if (!candidate) return { candidateId, candidateEvidenceHash: null, eligible: false, reasonCodes: ['candidate_unknown'] }
    return evaluateCandidate(candidate, phase, request, requiredCapabilities, evaluatedMs)
  })
  const eligible = evaluations.filter((entry) => entry.eligible).map((entry) => candidateById.get(entry.candidateId)!)
  if (eligible.length === 0) {
    const reasons = sortedReasons(evaluations.flatMap((entry) => entry.reasonCodes).concat(request.candidateIds.length === 0 ? ['candidate_unknown'] : []))
    return validatePhaseModelRoutingDecision(buildDecision({ ...common, status: 'needs_input', candidates: evaluations, selectedCandidateId: null, reasonCodes: reasons, optimizerDisposition: 'not_applicable' }))
  }

  if (!matrix.performanceEvidencePolicy.optimizerEnabled || eligible.length === 1) {
    return validatePhaseModelRoutingDecision(buildDecision({
      ...common,
      status: 'selected',
      candidates: evaluations,
      selectedCandidateId: eligible[0].candidateId,
      reasonCodes: ['operator_order_selected'],
      optimizerDisposition: 'operator_order_selected',
    }))
  }

  const fixtureHashes = new Set(eligible.map((candidate) => candidate.phaseQualification?.fixtureSha256))
  const scores = eligible.map((candidate) => comparableScore(candidate, phase, request, evaluatedMs, matrix))
  if (fixtureHashes.size !== 1 || scores.some((score) => score === null)) {
    return validatePhaseModelRoutingDecision(buildDecision({
      ...common,
      status: 'needs_input',
      candidates: evaluations,
      selectedCandidateId: null,
      reasonCodes: ['performance_evidence_insufficient'],
      optimizerDisposition: 'performance_evidence_insufficient',
    }))
  }
  const order = new Map(request.candidateIds.map((candidateId, index) => [candidateId, index]))
  const selected = (scores as ComparableScore[]).sort((left, right) =>
    left.averageCostUsd - right.averageCostUsd
    || left.averageDurationMs - right.averageDurationMs
    || (order.get(left.candidateId) ?? 0) - (order.get(right.candidateId) ?? 0)
  )[0]
  return validatePhaseModelRoutingDecision(buildDecision({
    ...common,
    status: 'selected',
    candidates: evaluations,
    selectedCandidateId: selected.candidateId,
    reasonCodes: ['qualified_tie_break_selected'],
    optimizerDisposition: 'qualified_tie_break_selected',
  }))
}

export function verifyPhaseModelRoutingDecision(
  decisionInput: unknown,
  matrixInput: unknown,
  requestInput: unknown,
  candidateInputs: unknown[],
): PhaseModelRoutingDecision {
  const decision = validatePhaseModelRoutingDecision(decisionInput)
  const expected = routePhaseModel(matrixInput, requestInput, candidateInputs, decision.evaluatedAt)
  if (stableJson(decision) !== stableJson(expected)) throw new Error('phase-model-router: decision does not match its request and candidate evidence')
  return decision
}
