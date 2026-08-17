import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CONDITIONAL_EVIDENCE_PHASES, PHASE_ORDER } from '../.claude/integrations/evidence-bundle'

type JsonRecord = Record<string, any>

const root = process.cwd()
const roadmapDir = path.join(root, 'docs', 'roadmap')
const boundaryPath = path.join(roadmapDir, 'post-17-orchestrator-boundaries.json')
const goldenPath = path.join(roadmapDir, 'post-17-orchestrator-golden.json')
const packagingPath = path.join(roadmapDir, 'post-17-provider-packaging.json')
const flagshipPath = path.join(root, '.claude', 'commands', 'feature-from-confluence.md')
const auditPath = path.join(root, 'docs', 'evidence', 'roadmap-17-of-17-audit-2026-08-13.md')
const designPath = path.join(root, 'docs', 'design', 'post-17-wave-1-input-contracts.md')

const parseJson = (file: string): JsonRecord => JSON.parse(fs.readFileSync(file, 'utf8'))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const canonicalText = (value: string): string => value.replace(/\r\n/g, '\n')
const sha256 = (value: string): string => crypto.createHash('sha256').update(canonicalText(value)).digest('hex')
const nonBlankStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0)

const expectedMandatory = [...PHASE_ORDER]
const expectedConditional = [...CONDITIONAL_EVIDENCE_PHASES]
const expectedStageOrder = ['INTAKE', 'SCOPE', 'DESIGN', 'APPROVE', 'PREP', 'BUILD', 'DONE', 'LEARN']
const expectedGateTypes: Record<string, string> = {
  B4: 'human-stop',
  'D-cross-2': 'conditional-human-stop',
  B6: 'human-stop',
  'B6.5': 'human-stop',
  B8: 'human-stop',
  B9: 'literal-human-stop',
  'B10.5': 'human-stop',
  B11: 'computed-verified-stop',
  B12: 'verified-ratio-stop',
}

function validateBoundary(boundary: JsonRecord, flagship: string): void {
  assert.equal(boundary.schemaVersion, '1.0.0')
  assert.equal(boundary.artifactId, 'post-17-orchestrator-boundaries')
  assert.deepEqual(boundary.mandatoryPhaseOrder, expectedMandatory, 'boundary order must equal the runtime evidence registry')
  assert.deepEqual(boundary.conditionalPhases, expectedConditional, 'conditional phase registry must equal runtime')
  assert.equal(boundary.source.path, '.claude/commands/feature-from-confluence.md')
  assert.equal(boundary.source.canonicalization, 'crlf-to-lf')
  assert.equal(boundary.source.sha256, sha256(flagship), 'boundary must be regenerated when the flagship changes')
  assert.equal(boundary.source.lineCount, flagship.split(/\r?\n/).length - (flagship.endsWith('\n') ? 1 : 0))
  assert.match(boundary.source.gitCommit, /^[0-9a-f]{40}$/)
  assert.match(boundary.source.gitBlob, /^[0-9a-f]{40}$/)
  assert.ok(nonBlankStrings(boundary.globalInvariants) && boundary.globalInvariants.length >= 8)

  assert.equal(boundary.stages.length, expectedStageOrder.length)
  assert.deepEqual(boundary.stages.map((stage: JsonRecord) => stage.id), expectedStageOrder)
  const partition = boundary.stages.flatMap((stage: JsonRecord) => stage.phases)
  assert.equal(new Set(partition).size, partition.length, 'a phase cannot be owned by two stages')
  assert.deepEqual(partition.filter((id: string) => id !== 'D-cross-2'), expectedMandatory)
  assert.equal(partition.filter((id: string) => id === 'D-cross-2').length, 1)
  for (const stage of boundary.stages) {
    for (const field of ['skill', 'agentPolicy', 'gatePolicy']) assert.ok(typeof stage[field] === 'string' && stage[field].trim())
    for (const field of ['phases', 'inputs', 'outputs', 'sideEffects']) assert.ok(nonBlankStrings(stage[field]), `${stage.id}.${field} must be non-empty`)
  }

  const phaseIds = boundary.phases.map((phase: JsonRecord) => phase.id)
  assert.equal(new Set(phaseIds).size, phaseIds.length, 'phase contracts must be unique')
  assert.deepEqual(phaseIds.filter((id: string) => id !== 'D-cross-2'), expectedMandatory)
  assert.equal(phaseIds.filter((id: string) => id === 'D-cross-2').length, 1)
  const flagshipLines = flagship.split(/\r?\n/)
  for (const phase of boundary.phases) {
    assert.ok(expectedMandatory.includes(phase.id) || expectedConditional.includes(phase.id), `unknown phase ${phase.id}`)
    assert.ok(expectedStageOrder.includes(phase.stage), `${phase.id} has an unknown stage`)
    assert.equal(boundary.stages.find((stage: JsonRecord) => stage.id === phase.stage).phases.includes(phase.id), true)
    assert.ok(nonBlankStrings(phase.inputs), `${phase.id}.inputs must be non-empty`)
    assert.ok(nonBlankStrings(phase.outputs), `${phase.id}.outputs must be non-empty`)
    assert.ok(Array.isArray(phase.sourceLines) && phase.sourceLines.length === 2)
    const [start, end] = phase.sourceLines
    assert.ok(Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start)
    assert.match(flagshipLines[start - 1], new RegExp(`^## ${phase.id.replace('.', '\\.')}(?:\\s|$)`), `${phase.id} line binding drifted`)
  }
  for (const [phaseId, gate] of Object.entries(expectedGateTypes)) {
    assert.equal(boundary.phases.find((phase: JsonRecord) => phase.id === phaseId)?.gate, gate, `${phaseId} gate cannot be weakened`)
  }
}

function validateGolden(golden: JsonRecord, boundary: JsonRecord, audit: string): void {
  assert.equal(golden.schemaVersion, '1.0.0')
  assert.equal(golden.artifactId, 'post-17-orchestrator-golden')
  assert.deepEqual(golden.requiredPhaseCoverage, boundary.mandatoryPhaseOrder)
  assert.equal(golden.referenceExecution.phaseBundleCount, boundary.mandatoryPhaseOrder.length)
  assert.equal(golden.referenceExecution.resumeResult, 'DONE')
  assert.equal(golden.referenceExecution.verified, true)
  assert.equal(golden.referenceExecution.tierAExit, 0)
  assert.equal(golden.referenceExecution.tierBExit, 0)
  assert.equal(golden.conditionalPhaseDisposition['D-cross-2'], 'executed-and-evidence-verified')
  assert.equal(golden.inputIdentity.acceptanceCriteriaCount, 19)
  assert.match(golden.inputIdentity.sourceSha256, /^[0-9a-f]{64}$/)
  assert.match(golden.referenceExecution.contentHash, /^[0-9a-f]{64}$/)
  assert.ok(audit.includes(golden.inputIdentity.sourceSha256), 'golden source identity must be cited by the audit')
  assert.ok(audit.includes(golden.referenceExecution.verifiedRunId), 'golden run must be cited by the audit')
  assert.ok(audit.includes(golden.referenceExecution.contentHash), 'golden verify hash must be cited by the audit')

  const gatePhases = golden.requiredGateSemantics.map((entry: JsonRecord) => entry.phase)
  assert.deepEqual(gatePhases, Object.keys(expectedGateTypes))
  assert.ok(golden.requiredGateSemantics.every((entry: JsonRecord) => entry.mayAdapterAutoApprove === false))
  const artifactIds = golden.requiredArtifactClasses.map((entry: JsonRecord) => entry.id)
  const requiredArtifactIds = [
    'source-provenance', 'normalized-spec', 'scope-and-resume', 'design-and-plan', 'executable-test-plan',
    'api-contract', 'implementation', 'closeout', 'phase-evidence', 'trusted-verification',
  ]
  assert.deepEqual(artifactIds, requiredArtifactIds)
  for (const artifact of golden.requiredArtifactClasses) assert.ok(nonBlankStrings(artifact.patterns), `${artifact.id} needs path patterns`)
  for (const field of ['mustRemainEqual', 'mustNotRegress', 'permittedDifferences', 'forbiddenClaims']) {
    assert.ok(nonBlankStrings(golden.comparisonRules[field]), `comparisonRules.${field} must be non-empty`)
  }
  assert.ok(nonBlankStrings(golden.candidateEvidenceRequirements) && golden.candidateEvidenceRequirements.length >= 5)
}

function validatePackaging(packaging: JsonRecord): void {
  assert.equal(packaging.schemaVersion, '1.0.0')
  assert.equal(packaging.artifactId, 'post-17-provider-packaging')
  assert.equal(packaging.distributionBoundary.mode, 'private-local-repository')
  assert.ok(nonBlankStrings(packaging.distributionBoundary.requiresSeparateAuthorization))
  const providers = packaging.providers as JsonRecord[]
  assert.deepEqual(providers.map((provider) => provider.id), ['codex', 'claude', 'copilot'])
  const allowedHosts: Record<string, string> = {
    codex: 'developers.openai.com',
    claude: 'code.claude.com',
    copilot: 'docs.github.com',
  }
  for (const provider of providers) {
    assert.ok(nonBlankStrings(provider.requiredPaths) && provider.requiredPaths.length >= 3)
    assert.ok(nonBlankStrings(provider.validation))
    assert.ok(typeof provider.agentBoundary === 'string' && provider.agentBoundary.trim())
    assert.ok(Array.isArray(provider.officialSources) && provider.officialSources.length >= 2)
    for (const source of provider.officialSources) {
      const parsed = new URL(source.url)
      assert.equal(parsed.hostname, allowedHosts[provider.id], `${provider.id} must use its official documentation host`)
      assert.ok(typeof source.claim === 'string' && source.claim.trim())
    }
    const joined = provider.requiredPaths.join('\n')
    assert.match(joined, /project-intelligence/)
    assert.match(joined, /workflow-orchestrator/)
  }
  assert.ok(providers.find((provider) => provider.id === 'codex').requiredPaths.includes('.codex-plugin/plugin.json'))
  assert.ok(providers.find((provider) => provider.id === 'claude').requiredPaths.includes('.claude-plugin/plugin.json'))
  assert.ok(providers.find((provider) => provider.id === 'copilot').requiredPaths.every((entry: string) => !entry.includes('plugin.json')), 'do not fabricate a Copilot plugin manifest')
}

const boundary = parseJson(boundaryPath)
const golden = parseJson(goldenPath)
const packaging = parseJson(packagingPath)
const flagship = fs.readFileSync(flagshipPath, 'utf8')
const audit = fs.readFileSync(auditPath, 'utf8')
const design = fs.readFileSync(designPath, 'utf8')

validateBoundary(boundary, flagship)
validateGolden(golden, boundary, audit)
validatePackaging(packaging)
for (const artifact of [path.basename(boundaryPath), path.basename(goldenPath), path.basename(packagingPath)]) {
  assert.ok(design.includes(artifact), `design companion must link ${artifact}`)
}
assert.match(design, /Build the provider-neutral Project Intelligence schema/)
assert.match(design, /No synthetic\s+Copilot plugin manifest is introduced/)

const missingPhase = clone(boundary)
missingPhase.phases = missingPhase.phases.filter((phase: JsonRecord) => phase.id !== 'B11')
assert.throws(() => validateBoundary(missingPhase, flagship), /deepStrictEqual|B11|phase/)

const duplicateOwner = clone(boundary)
duplicateOwner.stages.find((stage: JsonRecord) => stage.id === 'DONE').phases.push('B11')
assert.throws(() => validateBoundary(duplicateOwner, flagship), /two stages|deepStrictEqual/)

const weakenedGate = clone(boundary)
weakenedGate.phases.find((phase: JsonRecord) => phase.id === 'B9').gate = 'none'
assert.throws(() => validateBoundary(weakenedGate, flagship), /B9 gate cannot be weakened/)

const sourceDrift = clone(boundary)
sourceDrift.source.sha256 = '0'.repeat(64)
assert.throws(() => validateBoundary(sourceDrift, flagship), /regenerated when the flagship changes/)

const missingArtifactClass = clone(golden)
missingArtifactClass.requiredArtifactClasses = missingArtifactClass.requiredArtifactClasses.filter((entry: JsonRecord) => entry.id !== 'trusted-verification')
assert.throws(() => validateGolden(missingArtifactClass, boundary, audit), /strictly deep-equal|trusted-verification/)

const autoApprovedGate = clone(golden)
autoApprovedGate.requiredGateSemantics.find((entry: JsonRecord) => entry.phase === 'B10.5').mayAdapterAutoApprove = true
assert.throws(() => validateGolden(autoApprovedGate, boundary, audit))

const inventedCopilotManifest = clone(packaging)
inventedCopilotManifest.providers.find((provider: JsonRecord) => provider.id === 'copilot').requiredPaths.push('.copilot-plugin/plugin.json')
assert.throws(() => validatePackaging(inventedCopilotManifest), /fabricate a Copilot plugin manifest/)

console.log(`post-17-wave-1-inputs.test: PASS (${expectedMandatory.length} mandatory phases, ${expectedConditional.length} conditional phase, ${packaging.providers.length} providers, 7 negative controls)`)
