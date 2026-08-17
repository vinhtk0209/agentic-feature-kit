import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  OrchestratorBoundaryContract,
  PhaseBoundary,
  createArtifactReference,
  createPhaseEnvelope,
  validateBoundaryContract,
} from '../src/workflow-orchestrator'
import { ORCHESTRATOR_RESULT_SENTINEL, ORCHESTRATOR_STDIN_MAX_BYTES } from '../src/workflow-orchestrator-cli'

const root = process.cwd()
const contract = validateBoundaryContract(JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'), 'utf8')))
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cli = path.join('packages', 'core', 'src', 'workflow-orchestrator-cli.ts')

function boundary(contract: OrchestratorBoundaryContract, phase: string): PhaseBoundary {
  const result = contract.phases.find((entry) => entry.id === phase)
  assert.ok(result)
  return result
}

function b0Envelope(): { envelope: unknown; contents: Record<string, string> } {
  const rule = boundary(contract, 'B0')
  const contents: Record<string, string> = {}
  const inputs = rule.inputs.map((key, index) => {
    const uri = `artifact://cli/B0/input/${index}`
    const content = `input:${key}`
    contents[uri] = content
    return createArtifactReference('input', key, uri, content)
  })
  const outputs = rule.outputs.map((key, index) => {
    const uri = `artifact://cli/B0/output/${index}`
    const content = `output:${key}`
    contents[uri] = content
    return createArtifactReference('output', key, uri, content)
  })
  const evidenceUri = 'evidence://cli/B0/manifest'
  contents[evidenceUri] = 'evidence:B0'
  const envelope = createPhaseEnvelope({
    runId: 'cli-run', feature: 'CliFeature', phase: 'B0', stage: 'INTAKE', transitionIndex: 0,
    previousEnvelopeHash: null, status: 'completed', inputs, outputs,
    evidence: createArtifactReference('evidence', 'phase-evidence', evidenceUri, contents[evidenceUri]),
    gate: { required: true, status: 'computed_pass', authority: 'trusted-verifier', autoApproved: false },
  })
  return { envelope, contents }
}

function run(mode: string, request: string): { status: number | null; stdout: string; payload: any } {
  const result = spawnSync(process.execPath, [tsxCli, cli, mode], { cwd: root, input: request, encoding: 'utf8', shell: false })
  const lines = result.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length, 1, result.stderr)
  assert.ok(lines[0].startsWith(ORCHESTRATOR_RESULT_SENTINEL))
  return { status: result.status, stdout: result.stdout, payload: JSON.parse(lines[0].slice(ORCHESTRATOR_RESULT_SENTINEL.length)) }
}

const b0 = b0Envelope()
const valid = run('validate-envelope', JSON.stringify(b0))
assert.equal(valid.status, 0)
assert.deepEqual(valid.payload, { schemaVersion: '1.0.0', ok: true, result: { valid: true, missing: [], unexpected: [], mismatched: [] } })

const resume = run('resume', JSON.stringify({ envelopes: [b0.envelope], conditionalDisposition: { 'D-cross-2': 'pending' } }))
assert.equal(resume.status, 0)
assert.equal(resume.payload.result.resumeFromPhase, 'B0.5')
assert.deepEqual(resume.payload.result.completedPhases, ['B0'])

const malformed = run('resume', '{} trailing')
assert.equal(malformed.status, 1)
assert.match(malformed.payload.error, /exactly one valid JSON/)

const unknownMode = run('invented', '{}')
assert.equal(unknownMode.status, 2)
assert.match(unknownMode.payload.error, /usage/)

const oversized = run('resume', JSON.stringify({ padding: 'x'.repeat(ORCHESTRATOR_STDIN_MAX_BYTES + 1) }))
assert.equal(oversized.status, 1)
assert.match(oversized.payload.error, /stdin exceeds/)

console.log('workflow-orchestrator-cli.test: PASS (one-sentinel transport, validate/resume, malformed/mode/size controls)')
