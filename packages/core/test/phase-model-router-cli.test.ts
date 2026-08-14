import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  PHASE_MODEL_ROUTING_OUTPUT_MAX_BYTES,
  PHASE_MODEL_ROUTING_SENTINEL,
  PHASE_MODEL_ROUTING_STDIN_MAX_BYTES,
  executePhaseModelRoutingInput,
  serializePhaseModelRoutingEnvelope,
} from '../src/phase-model-router-cli'
import {
  PhaseCapabilityMatrix,
  PhaseModelCandidate,
  hashPhaseCapabilityMatrix,
  hashPhaseContract,
} from '../src/phase-model-router'

const root = path.resolve(__dirname, '..', '..', '..')
const source = path.join(root, 'packages', 'core', 'src', 'phase-model-router-cli.ts')
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json'), 'utf8')) as PhaseCapabilityMatrix
const fixedNow = '2026-08-14T12:00:00.000Z'
const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

const phase = matrix.phases.find((entry) => entry.id === 'B0')!
const candidate: PhaseModelCandidate = {
  candidateId: 'candidate-cli',
  runnerId: 'runner-cli',
  providerId: 'provider-cli',
  modelId: 'model-cli',
  reasoningEffort: null,
  enabled: true,
  adapterCapabilitySha256: digest('adapter'),
  capabilities: [...phase.requiredCapabilities],
  supportedEfforts: [],
  contextWindowTokens: 128_000,
  runtimePermissions: [...phase.runtimeRequirements],
  documentation: {
    sourceUrl: 'https://docs.example.com/model-cli',
    sourceSha256: digest('docs'),
    fetchedAt: '2026-08-13T12:00:00.000Z',
    expiresAt: '2026-08-20T12:00:00.000Z',
  },
  configurationCatalogSha256: digest('config'),
  runtimeEntitlement: {
    runnerId: 'runner-cli',
    providerId: 'provider-cli',
    modelId: 'model-cli',
    reasoningEffort: null,
    resolvedModelId: 'model-cli',
    adapterCapabilitySha256: digest('adapter'),
    evidenceSha256: digest('entitlement'),
    observedAt: '2026-08-13T12:00:00.000Z',
    expiresAt: '2026-08-20T12:00:00.000Z',
  },
  availability: {
    status: 'available',
    observedAt: '2026-08-13T12:00:00.000Z',
    expiresAt: '2026-08-20T12:00:00.000Z',
  },
  phaseQualification: {
    phaseId: 'B0',
    phaseContractSha256: hashPhaseContract(matrix, 'B0'),
    adapterCapabilitySha256: digest('adapter'),
    fixtureSha256: digest('fixture'),
    verdict: 'pass',
    evidenceSha256: digest('qualification'),
    observedAt: '2026-08-13T12:00:00.000Z',
    expiresAt: '2026-09-12T12:00:00.000Z',
  },
  observations: [],
}

const selectedInput = {
  matrix,
  request: {
    schemaVersion: '1.0.0',
    requestId: 'request-cli',
    phaseId: 'B0',
    phaseContractHash: hashPhaseContract(matrix, 'B0'),
    matrixHash: hashPhaseCapabilityMatrix(matrix),
    activeConditionIds: [],
    estimatedInputTokens: 4_096,
    candidateIds: ['candidate-cli'],
    requestedEffort: null,
    fallback: null,
  },
  candidates: [candidate],
}

const direct = executePhaseModelRoutingInput(selectedInput, fixedNow)
assert.equal(direct.status, 'selected')
assert.equal(direct.evaluatedAt, fixedNow)

function run(args: string[], input = '') {
  return spawnSync(process.execPath, [tsxCli, source, ...args], {
    cwd: root,
    encoding: 'utf8',
    input,
    env: { PATH: process.env.PATH ?? '' },
    maxBuffer: 2 * 1024 * 1024,
  })
}

function envelope(result: ReturnType<typeof run>): any {
  const lines = result.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length, 1, `${result.stderr}\n${result.stdout}`)
  assert.match(lines[0], new RegExp(`^${PHASE_MODEL_ROUTING_SENTINEL}`))
  assert.equal((result.stdout.match(/@@PHASE_MODEL_ROUTING@@/g) ?? []).length, 1)
  return JSON.parse(lines[0].slice(PHASE_MODEL_ROUTING_SENTINEL.length))
}

const selected = run(['route'], JSON.stringify(selectedInput))
assert.equal(selected.status, 0, selected.stderr)
assert.equal(envelope(selected).result.status, 'selected')

const blockedInput = JSON.parse(JSON.stringify(selectedInput))
blockedInput.candidates[0].phaseQualification = null
const blocked = run(['route'], JSON.stringify(blockedInput))
assert.equal(blocked.status, 1)
assert.equal(envelope(blocked).result.status, 'needs_input')

for (const [name, args, input, expectedError] of [
  ['usage', [], '', 'invalid_usage'],
  ['extra argv', ['route', 'extra'], '', 'invalid_usage'],
  ['empty stdin', ['route'], '', 'stdin_required'],
  ['invalid JSON', ['route'], '{', 'invalid_json'],
  ['multiple JSON values', ['route'], '{}{}', 'invalid_json'],
] as const) {
  const result = run([...args], input)
  assert.equal(result.status, 2, name)
  const payload = envelope(result)
  assert.equal(payload.ok, false, name)
  assert.equal(payload.error, expectedError, name)
}

const secretMarker = 'private-provider-error-marker'
const malformed = JSON.parse(JSON.stringify(selectedInput))
malformed.candidates[0].unexpected = secretMarker
const sanitized = run(['route'], JSON.stringify(malformed))
assert.equal(sanitized.status, 2)
assert.equal(envelope(sanitized).error, 'invalid_request')
assert.equal(sanitized.stdout.includes(secretMarker), false)

const exactBase = JSON.stringify({ ...selectedInput, candidates: [] })
const exactBound = `${exactBase}${' '.repeat(PHASE_MODEL_ROUTING_STDIN_MAX_BYTES - Buffer.byteLength(exactBase))}`
assert.equal(Buffer.byteLength(exactBound), PHASE_MODEL_ROUTING_STDIN_MAX_BYTES)
const atBound = run(['route'], exactBound)
assert.equal(atBound.status, 1)
assert.equal(envelope(atBound).result.status, 'needs_input')

const oversized = run(['route'], ' '.repeat(PHASE_MODEL_ROUTING_STDIN_MAX_BYTES + 1))
assert.equal(oversized.status, 2)
assert.equal(envelope(oversized).error, 'stdin_too_large')

assert.throws(
  () => serializePhaseModelRoutingEnvelope({ value: 'x'.repeat(PHASE_MODEL_ROUTING_OUTPUT_MAX_BYTES) }),
  /output_too_large/,
)

const cliSource = fs.readFileSync(source, 'utf8')
assert.doesNotMatch(cliSource, /process\.env|readFile|writeFile|spawn|exec\(/)

console.log('phase-model-router-cli.test: PASS (selected=0, needs_input=1, 5 usage/input attacks, exact/oversize stdin, sanitized failure, output cap, one sentinel, no env/file/process I/O)')
