import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PHASE_ORDER, CONDITIONAL_EVIDENCE_PHASES } from '../../../.claude/integrations/evidence-bundle'
import {
  ArtifactReference,
  GateDecision,
  OrchestratorBoundaryContract,
  PhaseBoundary,
  PhaseEnvelope,
  compareCandidateToGolden,
  createArtifactReference,
  createPhaseEnvelope,
  resumeFromPhaseEnvelopes,
  validateBoundaryContract,
  validatePhaseEnvelope,
  verifyEnvelopeContent,
} from '../src/workflow-orchestrator'

const root = process.cwd()
const boundariesRaw = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'), 'utf8')) as unknown
const golden = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-golden.json'), 'utf8')) as any
const contract = validateBoundaryContract(boundariesRaw)

function boundary(phase: string): PhaseBoundary {
  const result = contract.phases.find((entry) => entry.id === phase)
  assert.ok(result)
  return result
}

function gateFor(phase: string, status: PhaseEnvelope['status'] = 'completed'): GateDecision {
  const rule = boundary(phase)
  if (status === 'skipped') return { required: false, status: 'not_required', authority: 'none', autoApproved: false }
  if (rule.gate === 'none') return { required: false, status: 'not_required', authority: 'none', autoApproved: false }
  if (phase === 'B11' || phase === 'B12') return { required: true, status: 'computed_pass', authority: 'trusted-verifier', autoApproved: false }
  if (rule.gate.includes('human') || phase === 'B9') return { required: true, status: 'approved', authority: 'human', autoApproved: false }
  return { required: true, status: 'computed_pass', authority: 'trusted-verifier', autoApproved: false }
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._~-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact'
}

function phaseArtifacts(phase: string): {
  inputs: ArtifactReference[]
  outputs: ArtifactReference[]
  evidence: ArtifactReference
  contents: Map<string, string>
} {
  const rule = boundary(phase)
  const contents = new Map<string, string>()
  const create = (role: 'input' | 'output' | 'evidence', key: string, index: number): ArtifactReference => {
    const uri = role === 'evidence'
      ? `evidence://run-001/${phase}/manifest`
      : `artifact://run-001/${phase}/${role}/${index}-${slug(key)}`
    const content = `${phase}|${role}|${key}`
    contents.set(uri, content)
    return createArtifactReference(role, key, uri, content)
  }
  return {
    inputs: rule.inputs.map((key, index) => create('input', key, index)),
    outputs: rule.outputs.map((key, index) => create('output', key, index)),
    evidence: create('evidence', 'phase-evidence', 0),
    contents,
  }
}

function makeEnvelope(phase: string, transitionIndex: number, previousEnvelopeHash: string | null, status: PhaseEnvelope['status'] = 'completed'): { envelope: PhaseEnvelope; contents: Map<string, string> } {
  const artifacts = phaseArtifacts(phase)
  const envelope = createPhaseEnvelope({
    runId: 'run-001',
    feature: golden.inputIdentity.featureName,
    phase,
    stage: boundary(phase).stage,
    transitionIndex,
    previousEnvelopeHash,
    status,
    inputs: artifacts.inputs,
    outputs: artifacts.outputs,
    evidence: artifacts.evidence,
    gate: gateFor(phase, status),
  })
  return { envelope, contents: artifacts.contents }
}

function trace(phases: string[]): Array<{ envelope: PhaseEnvelope; contents: Map<string, string> }> {
  const result: Array<{ envelope: PhaseEnvelope; contents: Map<string, string> }> = []
  let previous: string | null = null
  for (const [index, phase] of phases.entries()) {
    const entry = makeEnvelope(phase, index, previous)
    result.push(entry)
    previous = entry.envelope.envelopeHash
  }
  return result
}

assert.equal(contract.schemaVersion, '1.0.0')
assert.equal(contract.mandatoryPhaseOrder.length, 23)
assert.deepEqual(contract.mandatoryPhaseOrder, [...PHASE_ORDER])
assert.deepEqual(contract.conditionalPhases, [...CONDITIONAL_EVIDENCE_PHASES])
assert.equal(contract.stages.length, 8)
assert.equal(contract.phases.length, 24)

const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'schemas', 'orchestrator-phase-envelope.schema.json'), 'utf8')) as any
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal(schema.properties.contractVersion.const, contract.schemaVersion)
assert.equal(schema.properties.gate.properties.autoApproved.const, false)

const sourceOrderedPhases = [...contract.phases].sort((left, right) => left.sourceLines[0] - right.sourceLines[0]).map((entry) => entry.id)
const completeTrace = trace(sourceOrderedPhases)
for (const entry of completeTrace) {
  assert.deepEqual(validatePhaseEnvelope(entry.envelope, contract), entry.envelope)
  assert.deepEqual(verifyEnvelopeContent(entry.envelope, contract, entry.contents), { valid: true, missing: [], unexpected: [], mismatched: [] })
}

const completed = resumeFromPhaseEnvelopes(contract, completeTrace.map((entry) => entry.envelope), { 'D-cross-2': 'executed' })
assert.equal(completed.resumeFromPhase, 'DONE')
assert.deepEqual(completed.completedPhases, contract.mandatoryPhaseOrder)
assert.match(completed.traceHash, /^[0-9a-f]{64}$/)

const throughB6 = sourceOrderedPhases.slice(0, sourceOrderedPhases.indexOf('B6') + 1)
const partialTrace = trace(throughB6)
const partial = resumeFromPhaseEnvelopes(contract, partialTrace.map((entry) => entry.envelope), { 'D-cross-2': 'executed' })
assert.equal(partial.resumeFromPhase, 'B6.5')
assert.equal(partial.lastCompletedPhase, 'B6')
assert.deepEqual(partial.completedPhases, contract.mandatoryPhaseOrder.slice(0, contract.mandatoryPhaseOrder.indexOf('B6.5')))

const waitingPhases = sourceOrderedPhases.slice(0, sourceOrderedPhases.indexOf('B8') + 1)
const beforeWaiting = trace(waitingPhases.slice(0, -1))
const previous = beforeWaiting.at(-1)?.envelope.envelopeHash ?? null
const waitingArtifacts = phaseArtifacts('B8')
const waiting = createPhaseEnvelope({
  runId: 'run-001', feature: golden.inputIdentity.featureName, phase: 'B8', stage: 'APPROVE',
  transitionIndex: beforeWaiting.length, previousEnvelopeHash: previous, status: 'awaiting_gate',
  inputs: waitingArtifacts.inputs, outputs: waitingArtifacts.outputs, evidence: waitingArtifacts.evidence,
  gate: { required: true, status: 'awaiting', authority: 'human', autoApproved: false },
})
const waitingState = resumeFromPhaseEnvelopes(contract, [...beforeWaiting.map((entry) => entry.envelope), waiting], { 'D-cross-2': 'executed' })
assert.equal(waitingState.resumeFromPhase, 'B8')
assert.deepEqual(waitingState.blockedAt, { phase: 'B8', reason: 'incomplete' })

const candidate = {
  inputIdentity: structuredClone(golden.inputIdentity),
  mandatoryPhaseCoverage: [...contract.mandatoryPhaseOrder],
  conditionalPhaseDisposition: structuredClone(golden.conditionalPhaseDisposition),
  gateSemantics: golden.requiredGateSemantics.map(({ phase, mayAdapterAutoApprove }: any) => ({ phase, mayAdapterAutoApprove })),
  artifactClassIds: golden.requiredArtifactClasses.map(({ id }: any) => id),
  tierAExit: 0,
  tierBExit: 0,
  verified: true,
  resumeResult: 'DONE',
}
assert.deepEqual(compareCandidateToGolden(candidate, golden), [])

// Boundary-map attacks.
const missingPhaseContract = structuredClone(boundariesRaw) as any
missingPhaseContract.mandatoryPhaseOrder.pop()
assert.throws(() => validateBoundaryContract(missingPhaseContract), /23 phases/)
const duplicatePhaseContract = structuredClone(boundariesRaw) as any
duplicatePhaseContract.phases[1].id = duplicatePhaseContract.phases[0].id
assert.throws(() => validateBoundaryContract(duplicatePhaseContract), /phase IDs must be unique|phase registry/)
const reorderedContract = structuredClone(boundariesRaw) as any
const firstPhase = reorderedContract.mandatoryPhaseOrder[0]
reorderedContract.mandatoryPhaseOrder[0] = reorderedContract.mandatoryPhaseOrder[1]
reorderedContract.mandatoryPhaseOrder[1] = firstPhase
assert.throws(() => validateBoundaryContract(reorderedContract), /mandatory phase order conflicts/)

// Envelope shape, contract, gate, and hash attacks.
const b4 = completeTrace.find((entry) => entry.envelope.phase === 'B4')!
const missingInput = structuredClone(b4.envelope)
missingInput.inputs.pop()
assert.throws(() => validatePhaseEnvelope(missingInput, contract), /input contract is incomplete or extra/)
const extraOutput = structuredClone(b4.envelope)
extraOutput.outputs.push(createArtifactReference('output', 'invented', 'artifact://run-001/B4/output/invented', 'invented'))
assert.throws(() => validatePhaseEnvelope(extraOutput, contract), /output contract is incomplete or extra/)
const extraField = { ...structuredClone(b4.envelope), providerOverride: true }
assert.throws(() => validatePhaseEnvelope(extraField, contract), /fields must be exactly/)
const forgedHash = structuredClone(b4.envelope)
forgedHash.envelopeHash = '0'.repeat(64)
assert.throws(() => validatePhaseEnvelope(forgedHash, contract), /envelope hash mismatch/)
const autoApproved = structuredClone(b4.envelope)
autoApproved.gate.autoApproved = true
assert.throws(() => validatePhaseEnvelope(autoApproved, contract), /cannot auto-approve/)
const b9 = completeTrace.find((entry) => entry.envelope.phase === 'B9')!
const nonLiteralB9 = structuredClone(b9.envelope)
nonLiteralB9.gate.authority = 'explicit-autonomy'
assert.throws(() => validatePhaseEnvelope(nonLiteralB9, contract), /B9 requires literal human approval/)
const b11 = completeTrace.find((entry) => entry.envelope.phase === 'B11')!
const modelVerified = structuredClone(b11.envelope)
modelVerified.gate.status = 'approved'
modelVerified.gate.authority = 'human'
assert.throws(() => validatePhaseEnvelope(modelVerified, contract), /B11 requires a trusted computed verify result/)

// Content-addressed handoff attacks.
const missingContents = new Map(b4.contents)
missingContents.delete(b4.envelope.inputs[0].uri)
assert.equal(verifyEnvelopeContent(b4.envelope, contract, missingContents).valid, false)
assert.deepEqual(verifyEnvelopeContent(b4.envelope, contract, missingContents).missing, [b4.envelope.inputs[0].uri])
const tamperedContents = new Map(b4.contents)
tamperedContents.set(b4.envelope.outputs[0].uri, 'tampered')
assert.equal(verifyEnvelopeContent(b4.envelope, contract, tamperedContents).mismatched.length, 1)
const noisyContents = new Map(b4.contents)
noisyContents.set('artifact://run-001/B4/extra', 'extra')
assert.deepEqual(verifyEnvelopeContent(b4.envelope, contract, noisyContents).unexpected, ['artifact://run-001/B4/extra'])

// Transition/resume conservation attacks.
const brokenChain = completeTrace.map((entry) => structuredClone(entry.envelope))
const { envelopeHash: ignoredBrokenHash, ...brokenPayload } = brokenChain[2]
brokenChain[2] = createPhaseEnvelope({ ...brokenPayload, previousEnvelopeHash: '0'.repeat(64) })
assert.throws(() => resumeFromPhaseEnvelopes(contract, brokenChain, { 'D-cross-2': 'executed' }), /transition chain mismatch/)
const duplicateEnvelope = [...completeTrace.map((entry) => entry.envelope), completeTrace[0].envelope]
assert.throws(() => resumeFromPhaseEnvelopes(contract, duplicateEnvelope, { 'D-cross-2': 'executed' }), /duplicate phase envelope/)
const gapTrace = trace(['B0', 'B1'])
assert.throws(() => resumeFromPhaseEnvelopes(contract, gapTrace.map((entry) => entry.envelope), { 'D-cross-2': 'pending' }), /contains a gap/)
assert.throws(() => resumeFromPhaseEnvelopes(contract, completeTrace.map((entry) => entry.envelope), { 'D-cross-2': 'not-applicable' }), /conflicts with not-applicable/)
const mandatoryOnly = trace(contract.mandatoryPhaseOrder)
assert.throws(() => resumeFromPhaseEnvelopes(contract, mandatoryOnly.map((entry) => entry.envelope), { 'D-cross-2': 'pending' }), /DONE trace cannot retain a pending/)

// Golden conservation attacks remain diagnostic and non-overlapping.
const wrongInput = structuredClone(candidate)
wrongInput.inputIdentity.sourceSha256 = '0'.repeat(64)
assert.deepEqual(compareCandidateToGolden(wrongInput, golden), ['input identity differs from sanctioned golden'])
const missingCoverage = structuredClone(candidate)
missingCoverage.mandatoryPhaseCoverage.pop()
assert.deepEqual(compareCandidateToGolden(missingCoverage, golden), ['mandatory phase coverage differs from sanctioned golden'])
const weakGate = structuredClone(candidate)
weakGate.gateSemantics[0].mayAdapterAutoApprove = true
assert.deepEqual(compareCandidateToGolden(weakGate, golden), ['gate semantics differ from sanctioned golden'])
const missingArtifactClass = structuredClone(candidate)
missingArtifactClass.artifactClassIds.pop()
assert.deepEqual(compareCandidateToGolden(missingArtifactClass, golden), ['required artifact-class coverage differs from sanctioned golden'])
const fakeVerified = structuredClone(candidate)
fakeVerified.verified = false
assert.deepEqual(compareCandidateToGolden(fakeVerified, golden), ['trusted verification result differs from sanctioned golden'])
const incompleteResume = structuredClone(candidate)
incompleteResume.resumeResult = 'B11'
assert.deepEqual(compareCandidateToGolden(incompleteResume, golden), ['resume result differs from sanctioned golden'])
const goldenWithExtraField = { ...structuredClone(golden), untrustedOverride: true }
assert.throws(() => compareCandidateToGolden(candidate, goldenWithExtraField), /golden contract fields must be exactly/)
const goldenWithoutGates = structuredClone(golden)
delete goldenWithoutGates.requiredGateSemantics
assert.throws(() => compareCandidateToGolden(candidate, goldenWithoutGates), /golden contract fields must be exactly/)
const goldenWithAutoApproval = structuredClone(golden)
goldenWithAutoApproval.requiredGateSemantics[0].mayAdapterAutoApprove = true
assert.throws(() => compareCandidateToGolden(candidate, goldenWithAutoApproval), /cannot permit adapter auto-approval/)
const goldenWithForgedContentHash = structuredClone(golden)
goldenWithForgedContentHash.referenceExecution.contentHash = 'not-a-content-hash'
assert.throws(() => compareCandidateToGolden(candidate, goldenWithForgedContentHash), /contentHash must be lowercase SHA-256/)

console.log('workflow-orchestrator.test: PASS (24 phase boundaries, chained envelopes, content verification, resume/golden conservation, 26 attacks)')
