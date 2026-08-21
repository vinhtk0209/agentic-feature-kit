import crypto from 'node:crypto'

export const PROVIDER_PARITY_SCHEMA_VERSION = '1.0.0' as const
export const PROVIDER_PARITY_PROVIDERS = ['codex', 'claude', 'copilot'] as const
export const PROVIDER_PARITY_ARTIFACT_CLASSES = ['plan', 'implementation', 'test', 'trusted-verification'] as const
export const PROVIDER_PARITY_PHASE_IDS = ['B3', 'B10', 'B11'] as const
export const PROVIDER_PARITY_MAX_RECEIPTS = 300

export const PROVIDER_PARITY_ADAPTER_REASON_CODES = [
  'cli_missing',
  'runtime_entitlement_missing',
  'authorization_missing',
  'model_unavailable',
  'cost_policy_unknown',
  'timeout',
  'output_overflow',
  'provider_refused',
  'malformed_event',
  'unauthorized_tool',
  'unauthorized_network',
  'process_failed',
] as const

export const PROVIDER_PARITY_EVALUATION_REASON_CODES = [
  ...PROVIDER_PARITY_ADAPTER_REASON_CODES,
  'fixture_identity_mismatch',
  'phase_identity_mismatch',
  'execution_policy_mismatch',
  'acceptance_criteria_missing',
  'artifact_missing',
  'gate_not_conserved',
  'api_contract_changed',
  'trusted_verification_failed',
  'locked_path_changed',
  'undeclared_path',
  'external_dependency',
  'secret_or_path_disclosure',
  'permission_widened',
  'cleanup_failed',
] as const

export const PROVIDER_PARITY_RANKING_REASON_CODES = [
  'qualification_mode',
  'qualification_incomplete',
  'insufficient_samples',
  'missing_metrics',
  'unpriced_samples',
  'mixed_identity',
] as const

export type ProviderParityProvider = typeof PROVIDER_PARITY_PROVIDERS[number]
export type ProviderParityArtifactClass = typeof PROVIDER_PARITY_ARTIFACT_CLASSES[number]
export type ProviderParityPhaseId = typeof PROVIDER_PARITY_PHASE_IDS[number]
export type ProviderParityAdapterReasonCode = typeof PROVIDER_PARITY_ADAPTER_REASON_CODES[number]
export type ProviderParityEvaluationReasonCode = typeof PROVIDER_PARITY_EVALUATION_REASON_CODES[number]
export type ProviderParityRankingReasonCode = typeof PROVIDER_PARITY_RANKING_REASON_CODES[number]
export type ProviderParityStatus = 'needs_input' | 'passed' | 'failed' | 'incomplete'

export interface ProviderParityPhaseBinding {
  phaseId: ProviderParityPhaseId
  phaseContractSha256: string
}

export interface ProviderParityPolicy {
  minimumSemanticRunsPerProvider: number
  minimumPerformanceRunsPerProvider: number
  maxRunDurationMs: number
  maxCapturedOutputBytes: number
  attemptsPerRun: 1
  rankingWhenIncomplete: 'forbidden'
}

export interface ProviderParityGoldenIdentity {
  fixtureId: string
  fixtureRevision: number
  fixtureSha256: string
  semanticSpecSha256: string
  taskPromptSha256: string
  seedTreeSha256: string
  providers: ProviderParityProvider[]
  acceptanceCriterionIds: string[]
  requiredArtifactClasses: ProviderParityArtifactClass[]
  phaseBindings: ProviderParityPhaseBinding[]
  policy: ProviderParityPolicy
}

export interface ProviderParityExecution {
  state: 'completed' | 'needs_input' | 'failed'
  reasonCodes: ProviderParityAdapterReasonCode[]
}

export interface ProviderParityIdentity {
  fixtureId: string
  fixtureRevision: number
  fixtureSha256: string
  semanticSpecSha256: string
  taskPromptSha256: string
  seedTreeSha256: string
  phaseBindings: ProviderParityPhaseBinding[]
  runnerId: string
  cliVersion: string | null
  modelId: string
  reasoningEffort: string | null
  adapterCapabilitySha256: string
  runtimeEntitlementEvidenceSha256: string | null
  materializedTreeSha256: string | null
  executionPolicySha256: string
  authorizationReceiptSha256: string | null
  sourceCommit: string
  observedAt: string
  timeoutMs: number
  maxCapturedOutputBytes: number
  attemptOrdinal: number
}

export interface ProviderParityEvidenceEntry {
  id: string
  evidenceSha256: string
}

export interface ProviderParityArtifactEvidence {
  artifactClass: ProviderParityArtifactClass
  evidenceSha256: string
}

export interface ProviderParityGateEvidence {
  phaseId: ProviderParityPhaseId
  conserved: boolean
  evidenceSha256: string
}

export interface ProviderParityTrustedVerification {
  exitCode: number
  evidenceSha256: string
}

export interface ProviderParityViolations {
  lockedPathEdit: boolean
  undeclaredPath: boolean
  externalDependency: boolean
  secretOrPathDisclosure: boolean
  permissionWidening: boolean
  cleanupFailed: boolean
}

export interface ProviderParityEvidence {
  acceptanceCriteria: ProviderParityEvidenceEntry[]
  artifacts: ProviderParityArtifactEvidence[]
  gates: ProviderParityGateEvidence[]
  apiContractConserved: boolean | null
  trustedVerification: ProviderParityTrustedVerification | null
  violations: ProviderParityViolations | null
}

export interface ProviderParityMetrics {
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheTokens: number | null
  pricingStatus: 'priced' | 'unpriced'
  priceBasisSha256: string | null
  costUsd: number | null
}

export interface ProviderParityCandidateReceipt {
  schemaVersion: typeof PROVIDER_PARITY_SCHEMA_VERSION
  runId: string
  provider: ProviderParityProvider
  execution: ProviderParityExecution
  identity: ProviderParityIdentity
  evidence: ProviderParityEvidence
  metrics: ProviderParityMetrics
  receiptHash: string
}

export interface ProviderParityEvaluationRequest {
  schemaVersion: typeof PROVIDER_PARITY_SCHEMA_VERSION
  evaluationId: string
  mode: 'qualification' | 'performance'
  golden: ProviderParityGoldenIdentity
  receipts: ProviderParityCandidateReceipt[]
}

export interface ProviderParityReceiptEvaluation {
  provider: ProviderParityProvider
  runId: string
  receiptHash: string
  status: Exclude<ProviderParityStatus, 'incomplete'>
  reasonCodes: ProviderParityEvaluationReasonCode[]
  acceptanceCriterionCoverage: number
  artifactCoverage: number
  gateConservation: number
  apiContractConserved: boolean
  trustedVerificationPassed: boolean
  implementationTreeSha256: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheTokens: number | null
  pricingStatus: 'priced' | 'unpriced'
  costUsd: number | null
  evaluationHash: string
}

export interface ProviderParityPairwiseComparison {
  leftProvider: ProviderParityProvider
  rightProvider: ProviderParityProvider
  semanticSimilarity: number
  artifactSimilarity: number
  gateSimilarity: number
  implementationTreeEqual: boolean
}

export interface ProviderParityRankingRow {
  provider: ProviderParityProvider
  sampleCount: number
  averageDurationMs: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheTokens: number
  averageCostUsd: number
}

export interface ProviderParityRanking {
  status: 'forbidden' | 'ready'
  reasonCodes: ProviderParityRankingReasonCode[]
  rows: ProviderParityRankingRow[]
}

export interface ProviderParityEvaluationReport {
  schemaVersion: typeof PROVIDER_PARITY_SCHEMA_VERSION
  evaluationId: string
  mode: 'qualification' | 'performance'
  requestHash: string
  status: ProviderParityStatus
  providerOrder: ProviderParityProvider[]
  receiptEvaluations: ProviderParityReceiptEvaluation[]
  missingProviders: ProviderParityProvider[]
  pairwiseComparisons: ProviderParityPairwiseComparison[]
  ranking: ProviderParityRanking
  reportHash: string
}

const REQUEST_KEYS = ['schemaVersion', 'evaluationId', 'mode', 'golden', 'receipts'] as const
const GOLDEN_KEYS = ['fixtureId', 'fixtureRevision', 'fixtureSha256', 'semanticSpecSha256', 'taskPromptSha256', 'seedTreeSha256', 'providers', 'acceptanceCriterionIds', 'requiredArtifactClasses', 'phaseBindings', 'policy'] as const
const POLICY_KEYS = ['minimumSemanticRunsPerProvider', 'minimumPerformanceRunsPerProvider', 'maxRunDurationMs', 'maxCapturedOutputBytes', 'attemptsPerRun', 'rankingWhenIncomplete'] as const
const RECEIPT_KEYS = ['schemaVersion', 'runId', 'provider', 'execution', 'identity', 'evidence', 'metrics', 'receiptHash'] as const
const EXECUTION_KEYS = ['state', 'reasonCodes'] as const
const IDENTITY_KEYS = ['fixtureId', 'fixtureRevision', 'fixtureSha256', 'semanticSpecSha256', 'taskPromptSha256', 'seedTreeSha256', 'phaseBindings', 'runnerId', 'cliVersion', 'modelId', 'reasoningEffort', 'adapterCapabilitySha256', 'runtimeEntitlementEvidenceSha256', 'materializedTreeSha256', 'executionPolicySha256', 'authorizationReceiptSha256', 'sourceCommit', 'observedAt', 'timeoutMs', 'maxCapturedOutputBytes', 'attemptOrdinal'] as const
const PHASE_KEYS = ['phaseId', 'phaseContractSha256'] as const
const EVIDENCE_KEYS = ['acceptanceCriteria', 'artifacts', 'gates', 'apiContractConserved', 'trustedVerification', 'violations'] as const
const EVIDENCE_ENTRY_KEYS = ['id', 'evidenceSha256'] as const
const ARTIFACT_KEYS = ['artifactClass', 'evidenceSha256'] as const
const GATE_KEYS = ['phaseId', 'conserved', 'evidenceSha256'] as const
const TRUSTED_KEYS = ['exitCode', 'evidenceSha256'] as const
const VIOLATION_KEYS = ['lockedPathEdit', 'undeclaredPath', 'externalDependency', 'secretOrPathDisclosure', 'permissionWidening', 'cleanupFailed'] as const
const METRIC_KEYS = ['durationMs', 'inputTokens', 'outputTokens', 'cacheTokens', 'pricingStatus', 'priceBasisSha256', 'costUsd'] as const
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,127}$/
const SHA256 = /^[0-9a-f]{64}$/
const SOURCE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const NEEDS_INPUT_REASONS: readonly ProviderParityAdapterReasonCode[] = [
  'cli_missing', 'runtime_entitlement_missing', 'authorization_missing', 'model_unavailable', 'cost_policy_unknown',
]
const FAILED_REASONS: readonly ProviderParityAdapterReasonCode[] = [
  'timeout', 'output_overflow', 'provider_refused', 'malformed_event', 'unauthorized_tool', 'unauthorized_network', 'process_failed',
]

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPlainJson(value: unknown, label: string, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`provider-parity: ${label} must contain finite numbers`)
    return
  }
  if (typeof value !== 'object') throw new Error(`provider-parity: ${label} must contain JSON data only`)
  if (seen.has(value)) throw new Error(`provider-parity: ${label} must not be cyclic`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPlainJson(entry, `${label}[${index}]`, seen))
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`provider-parity: ${label} must be a plain object`)
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set) throw new Error(`provider-parity: ${label}.${key} must not be accessor-backed`)
      assertPlainJson(descriptor.value, `${label}.${key}`, seen)
    }
  }
  seen.delete(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`provider-parity: ${label} must be an object`)
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const wanted = [...expected].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`provider-parity: ${label} fields must be exactly ${wanted.join(', ')}`)
  }
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`provider-parity: ${label} contains an unknown value`)
}

function assertSafeId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(`provider-parity: ${label} must be a safe identifier`)
}

function assertVersion(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_VERSION.test(value)) throw new Error(`provider-parity: ${label} must be a safe version identifier`)
}

function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`provider-parity: ${label} must be lowercase SHA-256`)
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`provider-parity: ${label} must be a positive integer`)
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`provider-parity: ${label} must be a non-negative integer`)
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`provider-parity: ${label} must be finite and non-negative`)
}

function assertIso(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`provider-parity: ${label} must be an ISO instant`)
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`provider-parity: ${label} must be boolean`)
}

function assertUniqueCanonicalStrings(value: unknown, allowed: readonly string[] | null, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !SAFE_ID.test(entry))) {
    throw new Error(`provider-parity: ${label} must be an array of safe identifiers`)
  }
  if (new Set(value).size !== value.length) throw new Error(`provider-parity: ${label} must be unique`)
  if (allowed && value.some((entry) => !allowed.includes(entry))) throw new Error(`provider-parity: ${label} contains an unknown value`)
  if (JSON.stringify(value) !== JSON.stringify([...value].sort(compareText))) throw new Error(`provider-parity: ${label} must be canonical ordinal order`)
}

function assertUniqueClosedOrder<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !allowed.includes(entry as T))) {
    throw new Error(`provider-parity: ${label} contains an unknown value`)
  }
  if (new Set(value).size !== value.length) throw new Error(`provider-parity: ${label} must be unique`)
  if (JSON.stringify(value) !== JSON.stringify(allowed.filter((entry) => value.includes(entry)))) {
    throw new Error(`provider-parity: ${label} must use closed vocabulary order`)
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([entry]) => entry !== key))
}

export function hashProviderParityReceipt(receipt: Omit<ProviderParityCandidateReceipt, 'receiptHash'>): string {
  assertPlainJson(receipt, 'receipt hash input')
  return sha256(stableJson(receipt))
}

function validatePhaseBindings(value: unknown, label: string): asserts value is ProviderParityPhaseBinding[] {
  if (!Array.isArray(value) || value.length !== PROVIDER_PARITY_PHASE_IDS.length) {
    throw new Error(`provider-parity: ${label} must contain B3, B10, and B11`)
  }
  value.forEach((entry, index) => {
    assertRecord(entry, `${label}[${index}]`)
    assertExactKeys(entry, PHASE_KEYS, `${label}[${index}]`)
    assertEnum(entry.phaseId, PROVIDER_PARITY_PHASE_IDS, `${label}[${index}].phaseId`)
    assertSha(entry.phaseContractSha256, `${label}[${index}].phaseContractSha256`)
    if (entry.phaseId !== PROVIDER_PARITY_PHASE_IDS[index]) throw new Error(`provider-parity: ${label} phase order must be B3, B10, B11`)
  })
}

function validateGolden(value: unknown): asserts value is ProviderParityGoldenIdentity {
  assertRecord(value, 'golden')
  assertExactKeys(value, GOLDEN_KEYS, 'golden')
  assertSafeId(value.fixtureId, 'golden.fixtureId')
  assertPositiveInteger(value.fixtureRevision, 'golden.fixtureRevision')
  for (const field of ['fixtureSha256', 'semanticSpecSha256', 'taskPromptSha256', 'seedTreeSha256'] as const) assertSha(value[field], `golden.${field}`)
  if (!Array.isArray(value.providers) || JSON.stringify(value.providers) !== JSON.stringify(PROVIDER_PARITY_PROVIDERS)) {
    throw new Error('provider-parity: golden.providers must be codex, claude, copilot')
  }
  assertUniqueCanonicalStrings(value.acceptanceCriterionIds, null, 'golden.acceptanceCriterionIds')
  if (value.acceptanceCriterionIds.length === 0) throw new Error('provider-parity: golden.acceptanceCriterionIds must not be empty')
  if (!Array.isArray(value.requiredArtifactClasses) || JSON.stringify(value.requiredArtifactClasses) !== JSON.stringify(PROVIDER_PARITY_ARTIFACT_CLASSES)) {
    throw new Error('provider-parity: golden.requiredArtifactClasses must use the locked order')
  }
  validatePhaseBindings(value.phaseBindings, 'golden.phaseBindings')
  assertRecord(value.policy, 'golden.policy')
  assertExactKeys(value.policy, POLICY_KEYS, 'golden.policy')
  assertPositiveInteger(value.policy.minimumSemanticRunsPerProvider, 'golden.policy.minimumSemanticRunsPerProvider')
  assertPositiveInteger(value.policy.minimumPerformanceRunsPerProvider, 'golden.policy.minimumPerformanceRunsPerProvider')
  assertPositiveInteger(value.policy.maxRunDurationMs, 'golden.policy.maxRunDurationMs')
  assertPositiveInteger(value.policy.maxCapturedOutputBytes, 'golden.policy.maxCapturedOutputBytes')
  if (value.policy.attemptsPerRun !== 1) throw new Error('provider-parity: golden.policy.attemptsPerRun must be 1')
  if (value.policy.rankingWhenIncomplete !== 'forbidden') throw new Error('provider-parity: golden.policy.rankingWhenIncomplete must be forbidden')
}

function validateExecution(value: unknown): asserts value is ProviderParityExecution {
  assertRecord(value, 'receipt.execution')
  assertExactKeys(value, EXECUTION_KEYS, 'receipt.execution')
  assertEnum(value.state, ['completed', 'needs_input', 'failed'] as const, 'receipt.execution.state')
  assertUniqueClosedOrder(value.reasonCodes, PROVIDER_PARITY_ADAPTER_REASON_CODES, 'receipt.execution.reasonCodes')
  if (value.state === 'completed' && value.reasonCodes.length !== 0) throw new Error('provider-parity: completed execution must have no reason codes')
  const allowed = value.state === 'needs_input' ? NEEDS_INPUT_REASONS : value.state === 'failed' ? FAILED_REASONS : []
  if (value.state !== 'completed' && (value.reasonCodes.length === 0 || value.reasonCodes.some((reason) => !allowed.includes(reason as ProviderParityAdapterReasonCode)))) {
    throw new Error(`provider-parity: ${value.state} execution reason codes contradict state`)
  }
}

function validateIdentity(value: unknown, execution: ProviderParityExecution): asserts value is ProviderParityIdentity {
  assertRecord(value, 'receipt.identity')
  assertExactKeys(value, IDENTITY_KEYS, 'receipt.identity')
  assertSafeId(value.fixtureId, 'receipt.identity.fixtureId')
  assertPositiveInteger(value.fixtureRevision, 'receipt.identity.fixtureRevision')
  for (const field of ['fixtureSha256', 'semanticSpecSha256', 'taskPromptSha256', 'seedTreeSha256', 'adapterCapabilitySha256', 'executionPolicySha256'] as const) {
    assertSha(value[field], `receipt.identity.${field}`)
  }
  for (const field of ['runtimeEntitlementEvidenceSha256', 'materializedTreeSha256', 'authorizationReceiptSha256'] as const) {
    if (value[field] !== null) assertSha(value[field], `receipt.identity.${field}`)
  }
  validatePhaseBindings(value.phaseBindings, 'receipt.identity.phaseBindings')
  assertSafeId(value.runnerId, 'receipt.identity.runnerId')
  if (value.cliVersion !== null) assertVersion(value.cliVersion, 'receipt.identity.cliVersion')
  assertSafeId(value.modelId, 'receipt.identity.modelId')
  if (value.reasoningEffort !== null) assertSafeId(value.reasoningEffort, 'receipt.identity.reasoningEffort')
  if (typeof value.sourceCommit !== 'string' || !SOURCE_COMMIT.test(value.sourceCommit)) throw new Error('provider-parity: receipt.identity.sourceCommit must be a commit hash')
  assertIso(value.observedAt, 'receipt.identity.observedAt')
  assertPositiveInteger(value.timeoutMs, 'receipt.identity.timeoutMs')
  assertPositiveInteger(value.maxCapturedOutputBytes, 'receipt.identity.maxCapturedOutputBytes')
  assertPositiveInteger(value.attemptOrdinal, 'receipt.identity.attemptOrdinal')
  if (execution.state === 'completed' || execution.state === 'failed') {
    for (const field of ['cliVersion', 'runtimeEntitlementEvidenceSha256', 'materializedTreeSha256', 'authorizationReceiptSha256'] as const) {
      if (value[field] === null) throw new Error(`provider-parity: ${execution.state} receipt.identity.${field} must not be null`)
    }
  } else {
    if (execution.reasonCodes.includes('cli_missing') !== (value.cliVersion === null)) {
      throw new Error('provider-parity: cli_missing must match null receipt.identity.cliVersion')
    }
    if (execution.reasonCodes.includes('runtime_entitlement_missing') !== (value.runtimeEntitlementEvidenceSha256 === null)) {
      throw new Error('provider-parity: runtime_entitlement_missing must match null receipt.identity.runtimeEntitlementEvidenceSha256')
    }
    if (execution.reasonCodes.includes('authorization_missing') !== (value.authorizationReceiptSha256 === null)) {
      throw new Error('provider-parity: authorization_missing must match null receipt.identity.authorizationReceiptSha256')
    }
    if (value.materializedTreeSha256 !== null) throw new Error('provider-parity: needs_input receipt must not claim a materialized tree')
  }
}

function validateEvidenceEntries(value: unknown, label: string): asserts value is ProviderParityEvidenceEntry[] {
  if (!Array.isArray(value)) throw new Error(`provider-parity: ${label} must be an array`)
  value.forEach((entry, index) => {
    assertRecord(entry, `${label}[${index}]`)
    assertExactKeys(entry, EVIDENCE_ENTRY_KEYS, `${label}[${index}]`)
    assertSafeId(entry.id, `${label}[${index}].id`)
    assertSha(entry.evidenceSha256, `${label}[${index}].evidenceSha256`)
  })
  const ids = value.map((entry) => entry.id)
  if (new Set(ids).size !== ids.length) throw new Error(`provider-parity: ${label} IDs must be unique`)
  if (JSON.stringify(ids) !== JSON.stringify([...ids].sort(compareText))) throw new Error(`provider-parity: ${label} must be canonical ordinal order`)
}

function validateEvidence(value: unknown, executionState: ProviderParityExecution['state']): asserts value is ProviderParityEvidence {
  assertRecord(value, 'receipt.evidence')
  assertExactKeys(value, EVIDENCE_KEYS, 'receipt.evidence')
  validateEvidenceEntries(value.acceptanceCriteria, 'receipt.evidence.acceptanceCriteria')
  if (!Array.isArray(value.artifacts)) throw new Error('provider-parity: receipt.evidence.artifacts must be an array')
  value.artifacts.forEach((entry, index) => {
    assertRecord(entry, `receipt.evidence.artifacts[${index}]`)
    assertExactKeys(entry, ARTIFACT_KEYS, `receipt.evidence.artifacts[${index}]`)
    assertEnum(entry.artifactClass, PROVIDER_PARITY_ARTIFACT_CLASSES, `receipt.evidence.artifacts[${index}].artifactClass`)
    assertSha(entry.evidenceSha256, `receipt.evidence.artifacts[${index}].evidenceSha256`)
  })
  const artifactClasses = value.artifacts.map((entry) => entry.artifactClass)
  if (new Set(artifactClasses).size !== artifactClasses.length) throw new Error('provider-parity: receipt.evidence.artifacts must be unique')
  if (JSON.stringify(artifactClasses) !== JSON.stringify(PROVIDER_PARITY_ARTIFACT_CLASSES.filter((entry) => artifactClasses.includes(entry)))) {
    throw new Error('provider-parity: receipt.evidence.artifacts must use canonical class order')
  }
  if (!Array.isArray(value.gates)) throw new Error('provider-parity: receipt.evidence.gates must be an array')
  value.gates.forEach((entry, index) => {
    assertRecord(entry, `receipt.evidence.gates[${index}]`)
    assertExactKeys(entry, GATE_KEYS, `receipt.evidence.gates[${index}]`)
    assertEnum(entry.phaseId, PROVIDER_PARITY_PHASE_IDS, `receipt.evidence.gates[${index}].phaseId`)
    assertBoolean(entry.conserved, `receipt.evidence.gates[${index}].conserved`)
    assertSha(entry.evidenceSha256, `receipt.evidence.gates[${index}].evidenceSha256`)
  })
  const gateIds = value.gates.map((entry) => entry.phaseId)
  if (new Set(gateIds).size !== gateIds.length) throw new Error('provider-parity: receipt.evidence.gates must be unique')
  if (JSON.stringify(gateIds) !== JSON.stringify(PROVIDER_PARITY_PHASE_IDS.filter((entry) => gateIds.includes(entry)))) {
    throw new Error('provider-parity: receipt.evidence.gates must use canonical phase order')
  }
  if (executionState === 'completed') {
    assertBoolean(value.apiContractConserved, 'receipt.evidence.apiContractConserved')
    assertRecord(value.trustedVerification, 'receipt.evidence.trustedVerification')
    assertExactKeys(value.trustedVerification, TRUSTED_KEYS, 'receipt.evidence.trustedVerification')
    assertNonNegativeInteger(value.trustedVerification.exitCode, 'receipt.evidence.trustedVerification.exitCode')
    assertSha(value.trustedVerification.evidenceSha256, 'receipt.evidence.trustedVerification.evidenceSha256')
    assertRecord(value.violations, 'receipt.evidence.violations')
    assertExactKeys(value.violations, VIOLATION_KEYS, 'receipt.evidence.violations')
    for (const field of VIOLATION_KEYS) assertBoolean(value.violations[field], `receipt.evidence.violations.${field}`)
  } else if (value.acceptanceCriteria.length !== 0 || value.artifacts.length !== 0 || value.gates.length !== 0 || value.apiContractConserved !== null || value.trustedVerification !== null || value.violations !== null) {
    throw new Error('provider-parity: non-completed execution must not carry completion evidence')
  }
}

function validateMetrics(value: unknown): asserts value is ProviderParityMetrics {
  assertRecord(value, 'receipt.metrics')
  assertExactKeys(value, METRIC_KEYS, 'receipt.metrics')
  for (const field of ['durationMs', 'inputTokens', 'outputTokens', 'cacheTokens'] as const) {
    if (value[field] !== null) assertFiniteNonNegative(value[field], `receipt.metrics.${field}`)
  }
  assertEnum(value.pricingStatus, ['priced', 'unpriced'] as const, 'receipt.metrics.pricingStatus')
  if (value.pricingStatus === 'priced') {
    for (const field of ['inputTokens', 'outputTokens', 'cacheTokens'] as const) {
      if (value[field] === null || !Number.isInteger(value[field])) throw new Error(`provider-parity: priced receipt.metrics.${field} must be an integer`)
    }
    assertSha(value.priceBasisSha256, 'receipt.metrics.priceBasisSha256')
    assertFiniteNonNegative(value.costUsd, 'receipt.metrics.costUsd')
  } else if (value.priceBasisSha256 !== null || value.costUsd !== null) {
    throw new Error('provider-parity: unpriced metrics must keep price basis and cost null')
  }
}

function validateReceipt(value: unknown): asserts value is ProviderParityCandidateReceipt {
  assertRecord(value, 'receipt')
  assertExactKeys(value, RECEIPT_KEYS, 'receipt')
  if (value.schemaVersion !== PROVIDER_PARITY_SCHEMA_VERSION) throw new Error('provider-parity: receipt schemaVersion mismatch')
  assertSafeId(value.runId, 'receipt.runId')
  assertEnum(value.provider, PROVIDER_PARITY_PROVIDERS, 'receipt.provider')
  validateExecution(value.execution)
  validateIdentity(value.identity, value.execution)
  validateEvidence(value.evidence, value.execution.state)
  validateMetrics(value.metrics)
  assertSha(value.receiptHash, 'receipt.receiptHash')
  const expected = sha256(stableJson(withoutKey(value, 'receiptHash')))
  if (value.receiptHash !== expected) throw new Error('provider-parity: receiptHash mismatch')
}

function validateRequest(value: unknown): asserts value is ProviderParityEvaluationRequest {
  assertPlainJson(value, 'request')
  assertRecord(value, 'request')
  assertExactKeys(value, REQUEST_KEYS, 'request')
  if (value.schemaVersion !== PROVIDER_PARITY_SCHEMA_VERSION) throw new Error('provider-parity: request schemaVersion mismatch')
  assertSafeId(value.evaluationId, 'request.evaluationId')
  assertEnum(value.mode, ['qualification', 'performance'] as const, 'request.mode')
  validateGolden(value.golden)
  if (!Array.isArray(value.receipts) || value.receipts.length > PROVIDER_PARITY_MAX_RECEIPTS) {
    throw new Error(`provider-parity: receipts must contain at most ${PROVIDER_PARITY_MAX_RECEIPTS} entries`)
  }
  value.receipts.forEach(validateReceipt)
  const runIds = value.receipts.map((receipt) => receipt.runId)
  if (new Set(runIds).size !== runIds.length) throw new Error('provider-parity: receipt runId values must be unique')
  const ordered = [...runIds].sort(compareText)
  if (JSON.stringify(runIds) !== JSON.stringify(ordered)) throw new Error('provider-parity: receipts must be canonical runId order')
}

function ratios(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function sortedEvaluationReasons(values: Iterable<ProviderParityEvaluationReasonCode>): ProviderParityEvaluationReasonCode[] {
  const set = new Set(values)
  return PROVIDER_PARITY_EVALUATION_REASON_CODES.filter((entry) => set.has(entry))
}

function samePhaseBindings(left: ProviderParityPhaseBinding[], right: ProviderParityPhaseBinding[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function evaluateReceipt(receipt: ProviderParityCandidateReceipt, golden: ProviderParityGoldenIdentity): ProviderParityReceiptEvaluation {
  const reasons = new Set<ProviderParityEvaluationReasonCode>(receipt.execution.reasonCodes)
  const fixtureMatches = receipt.identity.fixtureId === golden.fixtureId
    && receipt.identity.fixtureRevision === golden.fixtureRevision
    && receipt.identity.fixtureSha256 === golden.fixtureSha256
    && receipt.identity.semanticSpecSha256 === golden.semanticSpecSha256
    && receipt.identity.taskPromptSha256 === golden.taskPromptSha256
    && receipt.identity.seedTreeSha256 === golden.seedTreeSha256
  if (!fixtureMatches) reasons.add('fixture_identity_mismatch')
  if (!samePhaseBindings(receipt.identity.phaseBindings, golden.phaseBindings)) reasons.add('phase_identity_mismatch')
  if (receipt.identity.timeoutMs !== golden.policy.maxRunDurationMs
    || receipt.identity.maxCapturedOutputBytes !== golden.policy.maxCapturedOutputBytes
    || receipt.identity.attemptOrdinal !== golden.policy.attemptsPerRun) reasons.add('execution_policy_mismatch')

  const acceptanceIds = receipt.evidence.acceptanceCriteria.map((entry) => entry.id)
  const artifactClasses = receipt.evidence.artifacts.map((entry) => entry.artifactClass)
  const conservedPhases = receipt.evidence.gates.filter((entry) => entry.conserved).map((entry) => entry.phaseId)
  const acceptanceCovered = golden.acceptanceCriterionIds.filter((entry) => acceptanceIds.includes(entry)).length
  const artifactsCovered = golden.requiredArtifactClasses.filter((entry) => artifactClasses.includes(entry)).length
  const gatesCovered = golden.phaseBindings.filter((entry) => conservedPhases.includes(entry.phaseId)).length

  if (receipt.execution.state === 'completed') {
    if (acceptanceCovered !== golden.acceptanceCriterionIds.length || acceptanceIds.length !== golden.acceptanceCriterionIds.length) reasons.add('acceptance_criteria_missing')
    if (artifactsCovered !== golden.requiredArtifactClasses.length || artifactClasses.length !== golden.requiredArtifactClasses.length) reasons.add('artifact_missing')
    if (gatesCovered !== golden.phaseBindings.length || receipt.evidence.gates.length !== golden.phaseBindings.length) reasons.add('gate_not_conserved')
    if (receipt.evidence.apiContractConserved !== true) reasons.add('api_contract_changed')
    if (receipt.evidence.trustedVerification?.exitCode !== 0) reasons.add('trusted_verification_failed')
    const violations = receipt.evidence.violations as ProviderParityViolations
    if (violations.lockedPathEdit) reasons.add('locked_path_changed')
    if (violations.undeclaredPath) reasons.add('undeclared_path')
    if (violations.externalDependency) reasons.add('external_dependency')
    if (violations.secretOrPathDisclosure) reasons.add('secret_or_path_disclosure')
    if (violations.permissionWidening) reasons.add('permission_widened')
    if (violations.cleanupFailed) reasons.add('cleanup_failed')
  }

  const reasonCodes = sortedEvaluationReasons(reasons)
  const status: ProviderParityReceiptEvaluation['status'] = receipt.execution.state === 'needs_input'
    ? 'needs_input'
    : reasonCodes.length === 0 ? 'passed' : 'failed'
  const withoutHash = {
    provider: receipt.provider,
    runId: receipt.runId,
    receiptHash: receipt.receiptHash,
    status,
    reasonCodes,
    acceptanceCriterionCoverage: ratios(acceptanceCovered, golden.acceptanceCriterionIds.length),
    artifactCoverage: ratios(artifactsCovered, golden.requiredArtifactClasses.length),
    gateConservation: ratios(gatesCovered, golden.phaseBindings.length),
    apiContractConserved: receipt.evidence.apiContractConserved === true,
    trustedVerificationPassed: receipt.evidence.trustedVerification?.exitCode === 0,
    implementationTreeSha256: receipt.identity.materializedTreeSha256,
    durationMs: receipt.metrics.durationMs,
    inputTokens: receipt.metrics.inputTokens,
    outputTokens: receipt.metrics.outputTokens,
    cacheTokens: receipt.metrics.cacheTokens,
    pricingStatus: receipt.metrics.pricingStatus,
    costUsd: receipt.metrics.costUsd,
  }
  return { ...withoutHash, evaluationHash: sha256(stableJson(withoutHash)) }
}

function jaccard(left: string[], right: string[]): number {
  const union = new Set([...left, ...right])
  if (union.size === 0) return 1
  const rightSet = new Set(right)
  return left.filter((entry) => rightSet.has(entry)).length / union.size
}

function buildPairwise(receipts: ProviderParityCandidateReceipt[], evaluations: ProviderParityReceiptEvaluation[]): ProviderParityPairwiseComparison[] {
  const selected = new Map<ProviderParityProvider, ProviderParityCandidateReceipt>()
  for (const provider of PROVIDER_PARITY_PROVIDERS) {
    const evaluation = evaluations.find((entry) => entry.provider === provider && entry.status === 'passed')
    const receipt = evaluation ? receipts.find((entry) => entry.runId === evaluation.runId) : undefined
    if (receipt) selected.set(provider, receipt)
  }
  const comparisons: ProviderParityPairwiseComparison[] = []
  for (let leftIndex = 0; leftIndex < PROVIDER_PARITY_PROVIDERS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < PROVIDER_PARITY_PROVIDERS.length; rightIndex += 1) {
      const leftProvider = PROVIDER_PARITY_PROVIDERS[leftIndex]
      const rightProvider = PROVIDER_PARITY_PROVIDERS[rightIndex]
      const left = selected.get(leftProvider)
      const right = selected.get(rightProvider)
      if (!left || !right) continue
      comparisons.push({
        leftProvider,
        rightProvider,
        semanticSimilarity: jaccard(left.evidence.acceptanceCriteria.map((entry) => entry.id), right.evidence.acceptanceCriteria.map((entry) => entry.id)),
        artifactSimilarity: jaccard(left.evidence.artifacts.map((entry) => entry.artifactClass), right.evidence.artifacts.map((entry) => entry.artifactClass)),
        gateSimilarity: jaccard(left.evidence.gates.filter((entry) => entry.conserved).map((entry) => entry.phaseId), right.evidence.gates.filter((entry) => entry.conserved).map((entry) => entry.phaseId)),
        implementationTreeEqual: left.identity.materializedTreeSha256 === right.identity.materializedTreeSha256,
      })
    }
  }
  return comparisons
}

function comparableIdentity(receipt: ProviderParityCandidateReceipt): string {
  return stableJson({
    runnerId: receipt.identity.runnerId,
    cliVersion: receipt.identity.cliVersion,
    modelId: receipt.identity.modelId,
    reasoningEffort: receipt.identity.reasoningEffort,
    adapterCapabilitySha256: receipt.identity.adapterCapabilitySha256,
    executionPolicySha256: receipt.identity.executionPolicySha256,
  })
}

function buildRanking(request: ProviderParityEvaluationRequest, evaluations: ProviderParityReceiptEvaluation[], reportStatus: ProviderParityStatus): ProviderParityRanking {
  const reasons = new Set<ProviderParityRankingReasonCode>()
  if (request.mode !== 'performance') reasons.add('qualification_mode')
  if (reportStatus !== 'passed') reasons.add('qualification_incomplete')
  const rows: ProviderParityRankingRow[] = []
  for (const provider of PROVIDER_PARITY_PROVIDERS) {
    const passedIds = new Set(evaluations.filter((entry) => entry.provider === provider && entry.status === 'passed').map((entry) => entry.runId))
    const samples = request.receipts.filter((entry) => entry.provider === provider && passedIds.has(entry.runId))
    if (samples.length < request.golden.policy.minimumPerformanceRunsPerProvider) reasons.add('insufficient_samples')
    if (new Set(samples.map(comparableIdentity)).size > 1) reasons.add('mixed_identity')
    if (samples.some((entry) => entry.metrics.durationMs === null)) reasons.add('missing_metrics')
    if (samples.some((entry) => entry.metrics.pricingStatus !== 'priced'
      || entry.metrics.inputTokens === null
      || entry.metrics.outputTokens === null
      || entry.metrics.cacheTokens === null
      || entry.metrics.costUsd === null)) reasons.add('unpriced_samples')
    if (samples.length >= request.golden.policy.minimumPerformanceRunsPerProvider && reasons.size === 0) {
      rows.push({
        provider,
        sampleCount: samples.length,
        averageDurationMs: samples.reduce((sum, entry) => sum + (entry.metrics.durationMs as number), 0) / samples.length,
        totalInputTokens: samples.reduce((sum, entry) => sum + (entry.metrics.inputTokens as number), 0),
        totalOutputTokens: samples.reduce((sum, entry) => sum + (entry.metrics.outputTokens as number), 0),
        totalCacheTokens: samples.reduce((sum, entry) => sum + (entry.metrics.cacheTokens as number), 0),
        averageCostUsd: samples.reduce((sum, entry) => sum + (entry.metrics.costUsd as number), 0) / samples.length,
      })
    }
  }
  const reasonCodes = PROVIDER_PARITY_RANKING_REASON_CODES.filter((entry) => reasons.has(entry))
  return reasonCodes.length > 0 ? { status: 'forbidden', reasonCodes, rows: [] } : { status: 'ready', reasonCodes: [], rows }
}

function deriveStatus(request: ProviderParityEvaluationRequest, evaluations: ProviderParityReceiptEvaluation[]): ProviderParityStatus {
  if (evaluations.length === 0 || evaluations.every((entry) => entry.status === 'needs_input')) return 'needs_input'
  const missing = PROVIDER_PARITY_PROVIDERS.filter((provider) => !evaluations.some((entry) => entry.provider === provider))
  if (missing.length > 0) return 'incomplete'
  const passedFloor = PROVIDER_PARITY_PROVIDERS.every((provider) => evaluations.filter((entry) => entry.provider === provider && entry.status === 'passed').length >= request.golden.policy.minimumSemanticRunsPerProvider)
  if (passedFloor) return 'passed'
  if (evaluations.some((entry) => entry.status === 'failed')) return 'failed'
  return 'incomplete'
}

export function evaluateProviderParity(input: unknown): ProviderParityEvaluationReport {
  validateRequest(input)
  const request = input
  const requestHash = sha256(stableJson(request))
  const receiptEvaluations = request.receipts.map((receipt) => evaluateReceipt(receipt, request.golden))
  const status = deriveStatus(request, receiptEvaluations)
  const missingProviders = PROVIDER_PARITY_PROVIDERS.filter((provider) => !request.receipts.some((receipt) => receipt.provider === provider))
  const pairwiseComparisons = buildPairwise(request.receipts, receiptEvaluations)
  const ranking = buildRanking(request, receiptEvaluations, status)
  const withoutHash = {
    schemaVersion: PROVIDER_PARITY_SCHEMA_VERSION,
    evaluationId: request.evaluationId,
    mode: request.mode,
    requestHash,
    status,
    providerOrder: [...PROVIDER_PARITY_PROVIDERS],
    receiptEvaluations,
    missingProviders,
    pairwiseComparisons,
    ranking,
  }
  return { ...withoutHash, reportHash: sha256(stableJson(withoutHash)) }
}
