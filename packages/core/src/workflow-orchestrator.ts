import crypto from 'node:crypto'

export const ORCHESTRATOR_CONTRACT_VERSION = '1.0.0' as const
export const PHASE_ENVELOPE_SCHEMA_VERSION = 1 as const

export type ArtifactRole = 'input' | 'output' | 'evidence'
export type PhaseStatus = 'completed' | 'skipped' | 'awaiting_gate' | 'failed'
export type GateStatus = 'not_required' | 'awaiting' | 'approved' | 'rejected' | 'computed_pass' | 'computed_fail'
export type GateAuthority = 'none' | 'human' | 'explicit-autonomy' | 'trusted-verifier'
export type ConditionalDisposition = 'pending' | 'executed' | 'skipped' | 'not-applicable'

export interface ArtifactReference {
  role: ArtifactRole
  contractKey: string
  uri: string
  sha256: string
  bytes: number
}

export interface GateDecision {
  required: boolean
  status: GateStatus
  authority: GateAuthority
  autoApproved: boolean
}

export interface PhaseEnvelope {
  schemaVersion: typeof PHASE_ENVELOPE_SCHEMA_VERSION
  contractVersion: typeof ORCHESTRATOR_CONTRACT_VERSION
  runId: string
  feature: string
  phase: string
  stage: string
  transitionIndex: number
  previousEnvelopeHash: string | null
  status: PhaseStatus
  inputs: ArtifactReference[]
  outputs: ArtifactReference[]
  evidence: ArtifactReference
  gate: GateDecision
  envelopeHash: string
}

export interface PhaseBoundary {
  id: string
  title: string
  stage: string
  sourceLines: [number, number]
  execution: string
  gate: string
  inputs: string[]
  outputs: string[]
}

export interface StageBoundary {
  id: string
  displayOrder: number
  phases: string[]
}

export interface OrchestratorBoundaryContract {
  schemaVersion: typeof ORCHESTRATOR_CONTRACT_VERSION
  artifactId: 'post-17-orchestrator-boundaries'
  mandatoryPhaseOrder: string[]
  conditionalPhases: string[]
  globalInvariants: string[]
  stages: StageBoundary[]
  phases: PhaseBoundary[]
}

export interface EnvelopeContentVerification {
  valid: boolean
  missing: string[]
  unexpected: string[]
  mismatched: Array<{ uri: string; expectedSha256: string; actualSha256: string }>
}

export interface OrchestratorResumeState {
  completedPhases: string[]
  lastCompletedPhase: string | null
  resumeFromPhase: string | 'DONE'
  conditionalDisposition: Record<string, ConditionalDisposition>
  traceHash: string
  blockedAt?: { phase: string; reason: 'missing' | 'incomplete' }
}

export interface GoldenCandidate {
  inputIdentity: Record<string, unknown>
  mandatoryPhaseCoverage: string[]
  conditionalPhaseDisposition: Record<string, string>
  gateSemantics: Array<{ phase: string; mayAdapterAutoApprove: boolean }>
  artifactClassIds: string[]
  tierAExit: number
  tierBExit: number
  verified: boolean
  resumeResult: string
}

interface GoldenContract {
  schemaVersion: string
  artifactId: 'post-17-orchestrator-golden'
  capturedOn: string
  purpose: string
  authority: Record<string, string>
  inputIdentity: Record<string, unknown>
  referenceExecution: {
    kitVersion: string
    verifiedRunId: string
    verifiedImplementationCommit: string
    finalizedCaptureCommit: string
    tierAExit: number
    tierBExit: number
    verified: boolean
    contentHash: string
    phaseBundleCount: number
    resumeResult: string
  }
  requiredPhaseCoverage: string[]
  conditionalPhaseDisposition: Record<string, string>
  requiredGateSemantics: Array<{ phase: string; decision: string; mayAdapterAutoApprove: boolean }>
  requiredArtifactClasses: Array<{ id: string; patterns: string[] }>
  referenceVerificationMetrics: Record<string, string | number | boolean>
  comparisonRules: Record<string, string[]>
  candidateEvidenceRequirements: string[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`workflow-orchestrator: ${label} must be an object`)
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...keys].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`workflow-orchestrator: ${label} fields must be exactly ${expected.join(', ')}`)
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`workflow-orchestrator: ${label} must be a non-empty string`)
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`workflow-orchestrator: ${label} must be one of ${allowed.join(', ')}`)
  }
}

function assertStringSet(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`workflow-orchestrator: ${label} must be an array of non-empty strings`)
  }
  if (new Set(value).size !== value.length) throw new Error(`workflow-orchestrator: ${label} must be unique`)
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`workflow-orchestrator: ${label} must be a non-negative integer`)
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`workflow-orchestrator: ${label} must be lowercase SHA-256`)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function boundaryById(contract: OrchestratorBoundaryContract, phase: string): PhaseBoundary {
  const boundary = contract.phases.find((entry) => entry.id === phase)
  if (!boundary) throw new Error(`workflow-orchestrator: unknown phase ${phase}`)
  return boundary
}

export function validateBoundaryContract(value: unknown): OrchestratorBoundaryContract {
  assertRecord(value, 'boundary contract')
  if (value.schemaVersion !== ORCHESTRATOR_CONTRACT_VERSION) throw new Error('workflow-orchestrator: unsupported boundary contract version')
  if (value.artifactId !== 'post-17-orchestrator-boundaries') throw new Error('workflow-orchestrator: unexpected boundary artifact')
  assertStringSet(value.mandatoryPhaseOrder, 'mandatoryPhaseOrder')
  assertStringSet(value.conditionalPhases, 'conditionalPhases')
  assertStringSet(value.globalInvariants, 'globalInvariants')
  const mandatoryPhaseOrder = value.mandatoryPhaseOrder
  const conditionalPhases = value.conditionalPhases
  if (mandatoryPhaseOrder.length !== 23) throw new Error('workflow-orchestrator: mandatoryPhaseOrder must contain 23 phases')
  if (!Array.isArray(value.stages) || !Array.isArray(value.phases)) throw new Error('workflow-orchestrator: stages and phases must be arrays')

  const stages = value.stages as unknown[]
  const phases = value.phases as unknown[]
  const stageIds: string[] = []
  const phaseValues: PhaseBoundary[] = []
  for (const [index, raw] of stages.entries()) {
    assertRecord(raw, `stages[${index}]`)
    assertString(raw.id, `stages[${index}].id`)
    if (!Number.isInteger(raw.displayOrder) || Number(raw.displayOrder) !== index + 1) throw new Error('workflow-orchestrator: stage displayOrder must be contiguous')
    assertStringSet(raw.phases, `stages[${index}].phases`)
    stageIds.push(raw.id)
  }
  if (new Set(stageIds).size !== stageIds.length) throw new Error('workflow-orchestrator: stage IDs must be unique')

  for (const [index, raw] of phases.entries()) {
    assertRecord(raw, `phases[${index}]`)
    for (const key of ['id', 'title', 'stage', 'execution', 'gate'] as const) assertString(raw[key], `phases[${index}].${key}`)
    if (!Array.isArray(raw.sourceLines) || raw.sourceLines.length !== 2 || raw.sourceLines.some((entry) => !Number.isInteger(entry))) {
      throw new Error(`workflow-orchestrator: phases[${index}].sourceLines must be a two-integer tuple`)
    }
    assertStringSet(raw.inputs, `phases[${index}].inputs`)
    assertStringSet(raw.outputs, `phases[${index}].outputs`)
    if (!stageIds.includes(raw.stage as string)) throw new Error(`workflow-orchestrator: phase ${String(raw.id)} references an unknown stage`)
    phaseValues.push(raw as unknown as PhaseBoundary)
  }

  const phaseIds = phaseValues.map((entry) => entry.id)
  if (new Set(phaseIds).size !== phaseIds.length) throw new Error('workflow-orchestrator: phase IDs must be unique')
  const expectedIds = [...mandatoryPhaseOrder, ...conditionalPhases].sort(compareText)
  if (JSON.stringify([...phaseIds].sort(compareText)) !== JSON.stringify(expectedIds)) {
    throw new Error('workflow-orchestrator: phase registry does not match mandatory and conditional phase lists')
  }
  for (const stage of stages as Array<Record<string, unknown>>) {
    const declared = stage.phases as string[]
    const actual = phaseValues.filter((phase) => phase.stage === stage.id).map((phase) => phase.id)
    if (JSON.stringify(declared) !== JSON.stringify(actual)) throw new Error(`workflow-orchestrator: stage ${String(stage.id)} phase list is inconsistent`)
  }
  const mandatoryFromSource = phaseValues.filter((phase) => mandatoryPhaseOrder.includes(phase.id)).sort((a, b) => a.sourceLines[0] - b.sourceLines[0]).map((phase) => phase.id)
  if (JSON.stringify(mandatoryFromSource) !== JSON.stringify(mandatoryPhaseOrder)) {
    throw new Error('workflow-orchestrator: mandatory phase order conflicts with source lines')
  }
  return value as unknown as OrchestratorBoundaryContract
}

export function createArtifactReference(role: ArtifactRole, contractKey: string, uri: string, content: string | Uint8Array): ArtifactReference {
  assertString(contractKey, 'artifact contractKey')
  assertString(uri, 'artifact uri')
  if (!/^(artifact|evidence):\/\/[A-Za-z0-9._~:/-]+$/.test(uri) || uri.includes('..')) {
    throw new Error('workflow-orchestrator: artifact uri must be a safe artifact:// or evidence:// URI')
  }
  const bytes = typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength
  return { role, contractKey, uri, sha256: sha256(content), bytes }
}

function validateArtifactReference(value: unknown, role: ArtifactRole, label: string): ArtifactReference {
  assertRecord(value, label)
  assertExactKeys(value, ['role', 'contractKey', 'uri', 'sha256', 'bytes'], label)
  if (value.role !== role) throw new Error(`workflow-orchestrator: ${label}.role must be ${role}`)
  assertString(value.contractKey, `${label}.contractKey`)
  assertString(value.uri, `${label}.uri`)
  if (!/^(artifact|evidence):\/\/[A-Za-z0-9._~:/-]+$/.test(value.uri) || value.uri.includes('..')) throw new Error(`workflow-orchestrator: ${label}.uri is unsafe`)
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) throw new Error(`workflow-orchestrator: ${label}.sha256 must be lowercase SHA-256`)
  if (!Number.isInteger(value.bytes) || Number(value.bytes) < 0) throw new Error(`workflow-orchestrator: ${label}.bytes must be a non-negative integer`)
  return value as unknown as ArtifactReference
}

function validateGate(value: unknown, boundary: PhaseBoundary, status: PhaseStatus): GateDecision {
  assertRecord(value, 'gate')
  assertExactKeys(value, ['required', 'status', 'authority', 'autoApproved'], 'gate')
  if (typeof value.required !== 'boolean' || typeof value.autoApproved !== 'boolean') throw new Error('workflow-orchestrator: gate booleans are invalid')
  assertEnum(value.status, ['not_required', 'awaiting', 'approved', 'rejected', 'computed_pass', 'computed_fail'], 'gate.status')
  assertEnum(value.authority, ['none', 'human', 'explicit-autonomy', 'trusted-verifier'], 'gate.authority')
  const gate = value as unknown as GateDecision
  const contractRequiresGate = boundary.gate !== 'none'
  if (gate.required !== contractRequiresGate && status !== 'skipped') throw new Error(`workflow-orchestrator: ${boundary.id} gate requirement cannot be weakened`)
  if (gate.autoApproved) throw new Error(`workflow-orchestrator: ${boundary.id} provider adapters cannot auto-approve gates`)
  if (!gate.required && (gate.status !== 'not_required' || gate.authority !== 'none')) throw new Error(`workflow-orchestrator: ${boundary.id} non-required gate is inconsistent`)
  if (status === 'awaiting_gate' && gate.status !== 'awaiting') throw new Error(`workflow-orchestrator: ${boundary.id} awaiting status requires an awaiting gate`)
  if (status === 'failed' && !['rejected', 'computed_fail'].includes(gate.status)) throw new Error(`workflow-orchestrator: ${boundary.id} failed status requires a failing gate`)
  if (status === 'completed' && gate.required && !['approved', 'computed_pass'].includes(gate.status)) throw new Error(`workflow-orchestrator: ${boundary.id} completed status requires a passing gate`)
  if (boundary.id === 'B9' && status === 'completed' && (gate.status !== 'approved' || gate.authority !== 'human')) {
    throw new Error('workflow-orchestrator: B9 requires literal human approval')
  }
  if (boundary.id === 'B11' && status === 'completed' && (gate.status !== 'computed_pass' || gate.authority !== 'trusted-verifier')) {
    throw new Error('workflow-orchestrator: B11 requires a trusted computed verify result')
  }
  if (boundary.id === 'B12' && status === 'completed' && gate.authority !== 'trusted-verifier') {
    throw new Error('workflow-orchestrator: B12 completion must derive from trusted verification policy')
  }
  return gate
}

function envelopeHashPayload(envelope: Omit<PhaseEnvelope, 'envelopeHash'>): string {
  return stableJson(envelope)
}

export function createPhaseEnvelope(input: Omit<PhaseEnvelope, 'schemaVersion' | 'contractVersion' | 'envelopeHash'>): PhaseEnvelope {
  const withoutHash = { schemaVersion: PHASE_ENVELOPE_SCHEMA_VERSION, contractVersion: ORCHESTRATOR_CONTRACT_VERSION, ...input }
  return { ...withoutHash, envelopeHash: sha256(envelopeHashPayload(withoutHash)) }
}

export function validatePhaseEnvelope(value: unknown, contractInput: unknown): PhaseEnvelope {
  const contract = validateBoundaryContract(contractInput)
  assertRecord(value, 'phase envelope')
  assertExactKeys(value, [
    'schemaVersion', 'contractVersion', 'runId', 'feature', 'phase', 'stage', 'transitionIndex',
    'previousEnvelopeHash', 'status', 'inputs', 'outputs', 'evidence', 'gate', 'envelopeHash',
  ], 'phase envelope')
  if (value.schemaVersion !== PHASE_ENVELOPE_SCHEMA_VERSION || value.contractVersion !== ORCHESTRATOR_CONTRACT_VERSION) throw new Error('workflow-orchestrator: unsupported phase envelope version')
  assertString(value.runId, 'runId')
  assertString(value.feature, 'feature')
  assertString(value.phase, 'phase')
  assertString(value.stage, 'stage')
  if (!Number.isInteger(value.transitionIndex) || Number(value.transitionIndex) < 0) throw new Error('workflow-orchestrator: transitionIndex must be a non-negative integer')
  if (value.previousEnvelopeHash !== null && (typeof value.previousEnvelopeHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.previousEnvelopeHash))) throw new Error('workflow-orchestrator: previousEnvelopeHash is invalid')
  assertEnum(value.status, ['completed', 'skipped', 'awaiting_gate', 'failed'], 'status')
  const boundary = boundaryById(contract, value.phase)
  if (value.stage !== boundary.stage) throw new Error(`workflow-orchestrator: ${value.phase} stage must be ${boundary.stage}`)
  if (!Array.isArray(value.inputs) || !Array.isArray(value.outputs)) throw new Error('workflow-orchestrator: inputs and outputs must be arrays')
  const inputs = value.inputs.map((entry, index) => validateArtifactReference(entry, 'input', `inputs[${index}]`))
  const outputs = value.outputs.map((entry, index) => validateArtifactReference(entry, 'output', `outputs[${index}]`))
  const evidence = validateArtifactReference(value.evidence, 'evidence', 'evidence')
  if (evidence.contractKey !== 'phase-evidence') throw new Error('workflow-orchestrator: evidence.contractKey must be phase-evidence')
  const keys = (refs: ArtifactReference[]) => refs.map((entry) => entry.contractKey).sort(compareText)
  if (JSON.stringify(keys(inputs)) !== JSON.stringify([...boundary.inputs].sort(compareText))) throw new Error(`workflow-orchestrator: ${boundary.id} input contract is incomplete or extra`)
  if (JSON.stringify(keys(outputs)) !== JSON.stringify([...boundary.outputs].sort(compareText))) throw new Error(`workflow-orchestrator: ${boundary.id} output contract is incomplete or extra`)
  const uris = [...inputs, ...outputs, evidence].map((entry) => entry.uri)
  if (new Set(uris).size !== uris.length) throw new Error(`workflow-orchestrator: ${boundary.id} artifact URIs must be unique`)
  validateGate(value.gate, boundary, value.status)
  if (typeof value.envelopeHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.envelopeHash)) throw new Error('workflow-orchestrator: envelopeHash must be lowercase SHA-256')
  const envelope = value as unknown as PhaseEnvelope
  const { envelopeHash, ...withoutHash } = envelope
  if (sha256(envelopeHashPayload(withoutHash)) !== envelopeHash) throw new Error(`workflow-orchestrator: ${boundary.id} envelope hash mismatch`)
  return envelope
}

export function verifyEnvelopeContent(envelopeInput: unknown, contractInput: unknown, contents: ReadonlyMap<string, string | Uint8Array>): EnvelopeContentVerification {
  const envelope = validatePhaseEnvelope(envelopeInput, contractInput)
  const references = [...envelope.inputs, ...envelope.outputs, envelope.evidence]
  const expectedUris = new Set(references.map((entry) => entry.uri))
  const missing: string[] = []
  const mismatched: EnvelopeContentVerification['mismatched'] = []
  for (const reference of references) {
    const content = contents.get(reference.uri)
    if (content === undefined) {
      missing.push(reference.uri)
      continue
    }
    const actualSha256 = sha256(content)
    const actualBytes = typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength
    if (actualSha256 !== reference.sha256 || actualBytes !== reference.bytes) mismatched.push({ uri: reference.uri, expectedSha256: reference.sha256, actualSha256 })
  }
  const unexpected = [...contents.keys()].filter((uri) => !expectedUris.has(uri)).sort(compareText)
  missing.sort(compareText)
  mismatched.sort((a, b) => compareText(a.uri, b.uri))
  return { valid: missing.length === 0 && unexpected.length === 0 && mismatched.length === 0, missing, unexpected, mismatched }
}

function traceHash(envelopes: PhaseEnvelope[], disposition: Record<string, ConditionalDisposition>): string {
  return sha256(stableJson({ envelopes: envelopes.map((entry) => entry.envelopeHash), conditionalDisposition: disposition }))
}

export function resumeFromPhaseEnvelopes(contractInput: unknown, envelopeInputs: unknown[], dispositionInput: Record<string, ConditionalDisposition>): OrchestratorResumeState {
  const contract = validateBoundaryContract(contractInput)
  const disposition: Record<string, ConditionalDisposition> = {}
  for (const phase of contract.conditionalPhases) {
    const value = dispositionInput[phase]
    assertEnum(value, ['pending', 'executed', 'skipped', 'not-applicable'], `conditionalDisposition.${phase}`)
    disposition[phase] = value
  }
  if (Object.keys(dispositionInput).some((phase) => !contract.conditionalPhases.includes(phase))) throw new Error('workflow-orchestrator: unexpected conditional phase disposition')

  const envelopes = envelopeInputs.map((entry) => validatePhaseEnvelope(entry, contract)).sort((a, b) => a.transitionIndex - b.transitionIndex)
  if (new Set(envelopes.map((entry) => entry.phase)).size !== envelopes.length) throw new Error('workflow-orchestrator: duplicate phase envelope')
  for (const [index, envelope] of envelopes.entries()) {
    if (envelope.transitionIndex !== index) throw new Error('workflow-orchestrator: transition indexes must be contiguous from zero')
    const expectedPrevious = index === 0 ? null : envelopes[index - 1].envelopeHash
    if (envelope.previousEnvelopeHash !== expectedPrevious) throw new Error(`workflow-orchestrator: ${envelope.phase} transition chain mismatch`)
    if (index > 0) {
      const previousBoundary = boundaryById(contract, envelopes[index - 1].phase)
      const boundary = boundaryById(contract, envelope.phase)
      if (boundary.sourceLines[0] <= previousBoundary.sourceLines[0]) throw new Error('workflow-orchestrator: phase trace is out of canonical source order')
    }
  }

  for (const conditional of contract.conditionalPhases) {
    const found = envelopes.find((entry) => entry.phase === conditional)
    if (disposition[conditional] === 'executed' && (!found || found.status !== 'completed')) throw new Error(`workflow-orchestrator: executed ${conditional} requires a completed envelope`)
    if (disposition[conditional] === 'skipped' && (!found || found.status !== 'skipped')) throw new Error(`workflow-orchestrator: skipped ${conditional} requires a skip envelope`)
    if (['pending', 'not-applicable'].includes(disposition[conditional]) && found) throw new Error(`workflow-orchestrator: ${conditional} envelope conflicts with ${disposition[conditional]} disposition`)
  }

  const byPhase = new Map(envelopes.map((entry) => [entry.phase, entry]))
  const presentMandatory = contract.mandatoryPhaseOrder.filter((phase) => byPhase.has(phase))
  const expectedPrefix = contract.mandatoryPhaseOrder.slice(0, presentMandatory.length)
  if (JSON.stringify(presentMandatory) !== JSON.stringify(expectedPrefix)) throw new Error('workflow-orchestrator: mandatory envelope trace contains a gap')

  const completed: string[] = []
  for (const phase of contract.mandatoryPhaseOrder) {
    const envelope = byPhase.get(phase)
    if (!envelope) return { completedPhases: completed, lastCompletedPhase: completed.at(-1) ?? null, resumeFromPhase: phase, conditionalDisposition: disposition, traceHash: traceHash(envelopes, disposition), blockedAt: { phase, reason: 'missing' } }
    if (!['completed', 'skipped'].includes(envelope.status)) return { completedPhases: completed, lastCompletedPhase: completed.at(-1) ?? null, resumeFromPhase: phase, conditionalDisposition: disposition, traceHash: traceHash(envelopes, disposition), blockedAt: { phase, reason: 'incomplete' } }
    completed.push(phase)
  }
  if (Object.values(disposition).includes('pending')) throw new Error('workflow-orchestrator: a DONE trace cannot retain a pending conditional disposition')
  return { completedPhases: completed, lastCompletedPhase: completed.at(-1) ?? null, resumeFromPhase: 'DONE', conditionalDisposition: disposition, traceHash: traceHash(envelopes, disposition) }
}

function validateGoldenContract(value: unknown): GoldenContract {
  assertRecord(value, 'golden contract')
  assertExactKeys(value, [
    'schemaVersion', 'artifactId', 'capturedOn', 'purpose', 'authority', 'inputIdentity',
    'referenceExecution', 'requiredPhaseCoverage', 'conditionalPhaseDisposition',
    'requiredGateSemantics', 'requiredArtifactClasses', 'referenceVerificationMetrics',
    'comparisonRules', 'candidateEvidenceRequirements',
  ], 'golden contract')
  if (value.schemaVersion !== ORCHESTRATOR_CONTRACT_VERSION) throw new Error('workflow-orchestrator: unsupported golden contract version')
  if (value.artifactId !== 'post-17-orchestrator-golden') throw new Error('workflow-orchestrator: unexpected golden artifact')
  if (typeof value.capturedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.capturedOn)) throw new Error('workflow-orchestrator: golden capturedOn must be YYYY-MM-DD')
  assertString(value.purpose, 'golden purpose')

  assertRecord(value.authority, 'golden authority')
  assertExactKeys(value.authority, ['audit', 'handoff', 'verificationKind'], 'golden authority')
  for (const key of ['audit', 'handoff', 'verificationKind']) assertString(value.authority[key], `golden authority.${key}`)

  assertRecord(value.inputIdentity, 'golden inputIdentity')
  if (Object.keys(value.inputIdentity).length === 0) throw new Error('workflow-orchestrator: golden inputIdentity must not be empty')

  assertRecord(value.referenceExecution, 'golden referenceExecution')
  assertExactKeys(value.referenceExecution, [
    'kitVersion', 'verifiedRunId', 'verifiedImplementationCommit', 'finalizedCaptureCommit',
    'tierAExit', 'tierBExit', 'verified', 'contentHash', 'phaseBundleCount', 'resumeResult',
  ], 'golden referenceExecution')
  for (const key of ['kitVersion', 'verifiedRunId', 'verifiedImplementationCommit', 'finalizedCaptureCommit', 'resumeResult']) {
    assertString(value.referenceExecution[key], `golden referenceExecution.${key}`)
  }
  assertNonNegativeInteger(value.referenceExecution.tierAExit, 'golden referenceExecution.tierAExit')
  assertNonNegativeInteger(value.referenceExecution.tierBExit, 'golden referenceExecution.tierBExit')
  if (typeof value.referenceExecution.verified !== 'boolean') throw new Error('workflow-orchestrator: golden referenceExecution.verified must be boolean')
  assertSha256(value.referenceExecution.contentHash, 'golden referenceExecution.contentHash')
  assertNonNegativeInteger(value.referenceExecution.phaseBundleCount, 'golden referenceExecution.phaseBundleCount')

  assertStringSet(value.requiredPhaseCoverage, 'golden requiredPhaseCoverage')
  if (value.requiredPhaseCoverage.length !== 23) throw new Error('workflow-orchestrator: golden requiredPhaseCoverage must contain 23 phases')
  assertRecord(value.conditionalPhaseDisposition, 'golden conditionalPhaseDisposition')
  for (const [phase, disposition] of Object.entries(value.conditionalPhaseDisposition)) {
    assertString(phase, 'golden conditional phase')
    assertString(disposition, `golden conditionalPhaseDisposition.${phase}`)
  }

  if (!Array.isArray(value.requiredGateSemantics) || value.requiredGateSemantics.length === 0) throw new Error('workflow-orchestrator: golden requiredGateSemantics must be a non-empty array')
  const gatePhases: string[] = []
  for (const [index, raw] of value.requiredGateSemantics.entries()) {
    assertRecord(raw, `golden requiredGateSemantics[${index}]`)
    assertExactKeys(raw, ['phase', 'decision', 'mayAdapterAutoApprove'], `golden requiredGateSemantics[${index}]`)
    assertString(raw.phase, `golden requiredGateSemantics[${index}].phase`)
    assertString(raw.decision, `golden requiredGateSemantics[${index}].decision`)
    if (raw.mayAdapterAutoApprove !== false) throw new Error('workflow-orchestrator: golden gate semantics cannot permit adapter auto-approval')
    gatePhases.push(raw.phase)
  }
  if (new Set(gatePhases).size !== gatePhases.length) throw new Error('workflow-orchestrator: golden gate phases must be unique')

  if (!Array.isArray(value.requiredArtifactClasses) || value.requiredArtifactClasses.length === 0) throw new Error('workflow-orchestrator: golden requiredArtifactClasses must be a non-empty array')
  const artifactClassIds: string[] = []
  for (const [index, raw] of value.requiredArtifactClasses.entries()) {
    assertRecord(raw, `golden requiredArtifactClasses[${index}]`)
    assertExactKeys(raw, ['id', 'patterns'], `golden requiredArtifactClasses[${index}]`)
    assertString(raw.id, `golden requiredArtifactClasses[${index}].id`)
    assertStringSet(raw.patterns, `golden requiredArtifactClasses[${index}].patterns`)
    if (raw.patterns.length === 0) throw new Error(`workflow-orchestrator: golden requiredArtifactClasses[${index}].patterns must not be empty`)
    artifactClassIds.push(raw.id)
  }
  if (new Set(artifactClassIds).size !== artifactClassIds.length) throw new Error('workflow-orchestrator: golden artifact class IDs must be unique')

  assertRecord(value.referenceVerificationMetrics, 'golden referenceVerificationMetrics')
  if (Object.values(value.referenceVerificationMetrics).some((entry) => !['string', 'number', 'boolean'].includes(typeof entry))) {
    throw new Error('workflow-orchestrator: golden referenceVerificationMetrics values must be scalar')
  }
  assertRecord(value.comparisonRules, 'golden comparisonRules')
  assertExactKeys(value.comparisonRules, ['mustRemainEqual', 'mustNotRegress', 'permittedDifferences', 'forbiddenClaims'], 'golden comparisonRules')
  for (const key of ['mustRemainEqual', 'mustNotRegress', 'permittedDifferences', 'forbiddenClaims']) {
    assertStringSet(value.comparisonRules[key], `golden comparisonRules.${key}`)
  }
  assertStringSet(value.candidateEvidenceRequirements, 'golden candidateEvidenceRequirements')
  if (value.candidateEvidenceRequirements.length === 0) throw new Error('workflow-orchestrator: golden candidateEvidenceRequirements must not be empty')

  return value as unknown as GoldenContract
}

export function compareCandidateToGolden(candidate: GoldenCandidate, goldenInput: unknown): string[] {
  const golden = validateGoldenContract(goldenInput)
  const issues: string[] = []
  if (stableJson(candidate.inputIdentity) !== stableJson(golden.inputIdentity)) issues.push('input identity differs from sanctioned golden')
  if (JSON.stringify(candidate.mandatoryPhaseCoverage) !== JSON.stringify(golden.requiredPhaseCoverage)) issues.push('mandatory phase coverage differs from sanctioned golden')
  if (stableJson(candidate.conditionalPhaseDisposition) !== stableJson(golden.conditionalPhaseDisposition)) issues.push('conditional phase disposition differs from sanctioned golden')
  const candidateGates = [...candidate.gateSemantics].sort((a, b) => compareText(a.phase, b.phase))
  const goldenGates = [...golden.requiredGateSemantics].sort((a, b) => compareText(a.phase, b.phase)).map(({ phase, mayAdapterAutoApprove }) => ({ phase, mayAdapterAutoApprove }))
  if (stableJson(candidateGates) !== stableJson(goldenGates)) issues.push('gate semantics differ from sanctioned golden')
  const expectedArtifacts = golden.requiredArtifactClasses.map((entry) => entry.id).sort(compareText)
  if (JSON.stringify([...candidate.artifactClassIds].sort(compareText)) !== JSON.stringify(expectedArtifacts)) issues.push('required artifact-class coverage differs from sanctioned golden')
  if (candidate.tierAExit !== golden.referenceExecution.tierAExit || candidate.tierBExit !== golden.referenceExecution.tierBExit || candidate.verified !== golden.referenceExecution.verified) issues.push('trusted verification result differs from sanctioned golden')
  if (candidate.resumeResult !== golden.referenceExecution.resumeResult) issues.push('resume result differs from sanctioned golden')
  return issues
}
