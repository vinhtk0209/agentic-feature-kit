import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_CAPABILITY_IDS,
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_ERROR_CODES,
  CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES,
  CONTROL_PLANE_MAX_EVIDENCE_REFS,
  CONTROL_PLANE_MAX_OPERATION_INPUT_BYTES,
  CONTROL_PLANE_MAX_PROGRESS_EVENTS,
  CONTROL_PLANE_MAX_RESULT_BYTES,
  CONTROL_PLANE_MAX_WALL_TIME_MS,
  CONTROL_PLANE_OPERATION_CODES,
  CONTROL_PLANE_SCHEMA_VERSION,
  ControlPlaneContractError,
  createControlPlaneOperationRegistry,
  createWorkerCapabilityManifest,
  validateControlPlaneOperationInput,
  validateControlPlaneOperationRegistry,
  validateWorkerCapabilityManifest,
  type CapabilityId,
  type ControlPlaneHashPort,
  type OperationCode,
  type OperationDescriptor,
  type WorkerCapabilityManifest,
} from '../src/control-plane'

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}

const ids = {
  repository: '11111111-1111-4111-8111-111111111111',
  phase: '22222222-2222-4222-8222-222222222222',
  verification: '33333333-3333-4333-8333-333333333333',
  evidence: '44444444-4444-4444-8444-444444444444',
} as const

const hashes = {
  phase: 'a'.repeat(64),
  verification: 'b'.repeat(64),
  evidence: 'c'.repeat(64),
} as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function expectContractError(
  action: () => unknown,
  code: (typeof CONTROL_PLANE_ERROR_CODES)[number],
  forbiddenEcho?: string,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ControlPlaneContractError)
    assert.equal(error.code, code)
    if (forbiddenEcho) assert.ok(!error.message.includes(forbiddenEcho), 'closed error echoed caller input')
    return true
  })
}

const tests: Array<{ name: string; run: () => void }> = []
function test(name: string, run: () => void): void {
  tests.push({ name, run })
}

const phaseReference = {
  schemaVersion: 1,
  referenceId: ids.phase,
  purpose: 'phase_envelope',
  sha256: hashes.phase,
  mediaType: 'application/json',
  bytes: 4096,
} as const

const verificationReference = {
  schemaVersion: 1,
  referenceId: ids.verification,
  purpose: 'verification_request',
  sha256: hashes.verification,
  mediaType: 'application/json',
  bytes: 8192,
} as const

const evidenceReference = {
  schemaVersion: 1,
  referenceId: ids.evidence,
  purpose: 'evidence',
  sha256: hashes.evidence,
  mediaType: 'application/zip',
  bytes: 16384,
} as const

test('registry is exact, canonical, deterministic, unique, and deeply frozen', () => {
  const first = createControlPlaneOperationRegistry(hashPort)
  const second = createControlPlaneOperationRegistry(hashPort)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map((entry) => entry.code), CONTROL_PLANE_OPERATION_CODES)
  assert.equal(first.length, 4)
  assert.equal(new Set(first.map((entry) => entry.contractHash)).size, 4)
  assert.ok(first.every((entry) => /^[0-9a-f]{64}$/.test(entry.contractHash)))
  assert.ok(isDeepFrozen(first))
  assert.deepEqual(validateControlPlaneOperationRegistry(first, hashPort), first)

  const expected = {
    'evidence.verify': ['evidence_small', 120000, 65536, 4, 20, 'read_only'],
    'project_intelligence.inspect': ['inspect_small', 60000, 262144, 4, 20, 'read_only'],
    'workflow_phase.execute': ['workflow_standard', 1800000, 262144, 16, 200, 'manual_recovery'],
    'workflow_verify.execute': ['verification_standard', 900000, 262144, 16, 200, 'manual_recovery'],
  } as const
  for (const descriptor of first) {
    const budget = descriptor.resourceBudget
    assert.deepEqual(
      [budget.profileId, budget.maxWallTimeMs, budget.maxResultBytes, budget.maxEvidenceRefs, budget.maxProgressEvents, descriptor.replayClass],
      expected[descriptor.code],
    )
  }
})

test('operation inputs accept only opaque exact bounded shapes', () => {
  assert.deepEqual(validateControlPlaneOperationInput('project_intelligence.inspect', {
    schemaVersion: 1,
    repositoryId: ids.repository,
  }), { schemaVersion: 1, repositoryId: ids.repository })

  assert.deepEqual(validateControlPlaneOperationInput('workflow_phase.execute', {
    schemaVersion: 1,
    repositoryId: ids.repository,
    phaseId: 'B11',
    phaseEnvelope: phaseReference,
  }), {
    schemaVersion: 1,
    repositoryId: ids.repository,
    phaseId: 'B11',
    phaseEnvelope: phaseReference,
  })

  assert.deepEqual(validateControlPlaneOperationInput('workflow_verify.execute', {
    schemaVersion: 1,
    repositoryId: ids.repository,
    verificationRequest: verificationReference,
  }), {
    schemaVersion: 1,
    repositoryId: ids.repository,
    verificationRequest: verificationReference,
  })

  assert.deepEqual(validateControlPlaneOperationInput('evidence.verify', {
    schemaVersion: 1,
    evidence: evidenceReference,
  }), { schemaVersion: 1, evidence: evidenceReference })
})

test('worker manifests advertise only explicit canonical registry subsets', () => {
  const registry = createControlPlaneOperationRegistry(hashPort)
  const empty = createWorkerCapabilityManifest({ workerVersion: '1.0.0', operationCodes: [], capabilityIds: [] }, registry, hashPort)
  assert.deepEqual(empty.operations, [])
  assert.deepEqual(empty.capabilityIds, [])
  assert.ok(isDeepFrozen(empty))
  assert.deepEqual(validateWorkerCapabilityManifest(empty, registry, hashPort), empty)

  const inspect = createWorkerCapabilityManifest({
    workerVersion: '1.2.3',
    operationCodes: ['project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect', 'repository.read'],
  }, registry, hashPort)
  assert.deepEqual(inspect.operations.map((entry) => entry.code), ['project_intelligence.inspect'])
  assert.deepEqual(inspect.capabilityIds, ['project_intelligence.inspect', 'repository.read'])
  assert.equal(inspect.operations[0]?.contractHash, registry.find((entry) => entry.code === 'project_intelligence.inspect')?.contractHash)
  assert.deepEqual(validateWorkerCapabilityManifest(inspect, registry, hashPort), inspect)

  const full = createWorkerCapabilityManifest({
    workerVersion: '2.0.0-beta.1',
    operationCodes: [...CONTROL_PLANE_OPERATION_CODES],
    capabilityIds: [...CONTROL_PLANE_CAPABILITY_IDS],
  }, registry, hashPort)
  assert.equal(full.operations.length, 4)
  assert.equal(full.capabilityIds.length, 6)
})

test('public constants publish the locked versions and global bounds', () => {
  assert.equal(CONTROL_PLANE_SCHEMA_VERSION, 1)
  assert.equal(CONTROL_PLANE_CONTRACT_VERSION, '1.0.0')
  assert.equal(CONTROL_PLANE_MAX_OPERATION_INPUT_BYTES, 32 * 1024)
  assert.equal(CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES, 64 * 1024 * 1024)
  assert.equal(CONTROL_PLANE_MAX_WALL_TIME_MS, 30 * 60 * 1000)
  assert.equal(CONTROL_PLANE_MAX_RESULT_BYTES, 256 * 1024)
  assert.equal(CONTROL_PLANE_MAX_EVIDENCE_REFS, 16)
  assert.equal(CONTROL_PLANE_MAX_PROGRESS_EVENTS, 200)
  assert.deepEqual(CONTROL_PLANE_OPERATION_CODES, [
    'evidence.verify',
    'project_intelligence.inspect',
    'workflow_phase.execute',
    'workflow_verify.execute',
  ])
  assert.deepEqual(CONTROL_PLANE_CAPABILITY_IDS, [
    'evidence.verify',
    'project_intelligence.inspect',
    'provider.execute',
    'repository.read',
    'workflow_orchestrator.execute',
    'workflow_verification.execute',
  ])
  assert.deepEqual(CONTROL_PLANE_ERROR_CODES, [
    'INVALID_SHAPE',
    'UNSUPPORTED_VERSION',
    'UNKNOWN_OPERATION',
    'UNKNOWN_CAPABILITY',
    'DUPLICATE_VALUE',
    'NON_CANONICAL_ORDER',
    'CONTRACT_HASH_MISMATCH',
    'MANIFEST_HASH_MISMATCH',
    'MISSING_CAPABILITY',
    'LIMIT_EXCEEDED',
    'HASH_UNAVAILABLE',
  ])
})

test('attack: registry rejects duplicates, omissions, unknown values, reordering, extras, and drift', () => {
  const registry = createControlPlaneOperationRegistry(hashPort)
  expectContractError(() => validateControlPlaneOperationRegistry([registry[0], registry[0], ...registry.slice(2)], hashPort), 'DUPLICATE_VALUE')
  expectContractError(() => validateControlPlaneOperationRegistry(registry.slice(1), hashPort), 'INVALID_SHAPE')

  const unknown = clone(registry) as unknown as Array<Record<string, unknown>>
  unknown[0]!.code = 'system.shell'
  expectContractError(() => validateControlPlaneOperationRegistry(unknown, hashPort), 'UNKNOWN_OPERATION')

  const reordered = [registry[1]!, registry[0]!, ...registry.slice(2)]
  expectContractError(() => validateControlPlaneOperationRegistry(reordered, hashPort), 'NON_CANONICAL_ORDER')

  const extra = clone(registry) as unknown as Array<Record<string, unknown>>
  extra[0]!.available = true
  expectContractError(() => validateControlPlaneOperationRegistry(extra, hashPort), 'INVALID_SHAPE')

  const nestedExtra = clone(registry) as unknown as Array<Record<string, unknown>>
  ;(nestedExtra[0]!.resourceBudget as Record<string, unknown>).cpu = 99
  expectContractError(() => validateControlPlaneOperationRegistry(nestedExtra, hashPort), 'INVALID_SHAPE')

  const tamperedHash = clone(registry) as OperationDescriptor[]
  tamperedHash[0] = { ...tamperedHash[0]!, contractHash: 'f'.repeat(64) }
  expectContractError(() => validateControlPlaneOperationRegistry(tamperedHash, hashPort), 'CONTRACT_HASH_MISMATCH')

  const enlarged = clone(registry) as unknown as Array<Record<string, unknown>>
  ;(enlarged[0]!.resourceBudget as Record<string, unknown>).maxWallTimeMs = CONTROL_PLANE_MAX_WALL_TIME_MS + 1
  expectContractError(() => validateControlPlaneOperationRegistry(enlarged, hashPort), 'LIMIT_EXCEEDED')

  for (const [field, changed, code] of [
    ['schemaVersion', 2, 'UNSUPPORTED_VERSION'],
    ['contractVersion', '2.0.0', 'UNSUPPORTED_VERSION'],
    ['adapterId', 'system-shell-v1', 'INVALID_SHAPE'],
    ['adapterVersion', '2.0.0', 'INVALID_SHAPE'],
    ['inputKind', '__proto__', 'INVALID_SHAPE'],
    ['replayClass', 'automatic', 'INVALID_SHAPE'],
  ] as const) {
    const changedRegistry = clone(registry) as unknown as Array<Record<string, unknown>>
    changedRegistry[0]![field] = changed
    expectContractError(() => validateControlPlaneOperationRegistry(changedRegistry, hashPort), code)
  }

  const changedCapabilities = clone(registry) as unknown as Array<Record<string, unknown>>
  changedCapabilities[0]!.requiredCapabilities = []
  expectContractError(() => validateControlPlaneOperationRegistry(changedCapabilities, hashPort), 'CONTRACT_HASH_MISMATCH')

  for (const [field, changed] of [
    ['profileId', 'inspect_small'],
    ['maxWallTimeMs', 119999],
    ['maxResultBytes', 65535],
    ['maxEvidenceRefs', 3],
    ['maxProgressEvents', 19],
  ] as const) {
    const changedRegistry = clone(registry) as unknown as Array<Record<string, unknown>>
    ;(changedRegistry[0]!.resourceBudget as Record<string, unknown>)[field] = changed
    expectContractError(() => validateControlPlaneOperationRegistry(changedRegistry, hashPort), 'CONTRACT_HASH_MISMATCH')
  }
})

test('attack: inputs reject raw control fields, malformed identities, wrong purposes, and oversized values without echo', () => {
  const marker = 'DO_NOT_ECHO_RAW_MARKER'
  const rawFields = ['alias', 'path', 'url', 'header', 'secret', 'credentialAlias', 'shell', 'executable', 'argv', 'environment', 'message']
  for (const field of rawFields) {
    expectContractError(() => validateControlPlaneOperationInput('project_intelligence.inspect', {
      schemaVersion: 1,
      repositoryId: ids.repository,
      [field]: marker,
    }), 'INVALID_SHAPE', marker)
  }

  expectContractError(() => validateControlPlaneOperationInput('project_intelligence.inspect', {
    schemaVersion: 1,
    repositoryId: 'repo-alias',
  }), 'INVALID_SHAPE', 'repo-alias')

  expectContractError(() => validateControlPlaneOperationInput('workflow_phase.execute', {
    schemaVersion: 1,
    repositoryId: ids.repository,
    phaseId: 'B11',
    phaseEnvelope: { ...phaseReference, purpose: 'evidence' },
  }), 'INVALID_SHAPE')

  expectContractError(() => validateControlPlaneOperationInput('evidence.verify', {
    schemaVersion: 1,
    evidence: { ...evidenceReference, sha256: hashes.evidence.toUpperCase() },
  }), 'INVALID_SHAPE')

  expectContractError(() => validateControlPlaneOperationInput('evidence.verify', {
    schemaVersion: 1,
    evidence: { ...evidenceReference, bytes: CONTROL_PLANE_MAX_CONTENT_REFERENCE_BYTES + 1 },
  }), 'LIMIT_EXCEEDED')

  expectContractError(() => validateControlPlaneOperationInput('workflow_phase.execute', {
    schemaVersion: 1,
    repositoryId: ids.repository,
    phaseId: marker.repeat(4096),
    phaseEnvelope: phaseReference,
  }), 'LIMIT_EXCEEDED', marker)

  expectContractError(() => validateControlPlaneOperationInput('unknown.operation' as OperationCode, {}), 'UNKNOWN_OPERATION')
})

test('attack: exact schemas reject prototype-bearing and cyclic objects', () => {
  const inherited = Object.create({ shell: 'hidden' }) as Record<string, unknown>
  inherited.schemaVersion = 1
  inherited.repositoryId = ids.repository
  expectContractError(() => validateControlPlaneOperationInput('project_intelligence.inspect', inherited), 'INVALID_SHAPE')

  const cyclic: Record<string, unknown> = { schemaVersion: 1, repositoryId: ids.repository }
  cyclic.self = cyclic
  expectContractError(() => validateControlPlaneOperationInput('project_intelligence.inspect', cyclic), 'INVALID_SHAPE')

  const registry = createControlPlaneOperationRegistry(hashPort)
  const manifest = createWorkerCapabilityManifest({ workerVersion: '1.0.0', operationCodes: [], capabilityIds: [] }, registry, hashPort)
  const inheritedManifest = Object.assign(Object.create({ secret: 'hidden' }), clone(manifest))
  expectContractError(() => validateWorkerCapabilityManifest(inheritedManifest, registry, hashPort), 'INVALID_SHAPE')
})

test('attack: manifest rejects order, duplicates, unknowns, missing capabilities, drift, and extras', () => {
  const registry = createControlPlaneOperationRegistry(hashPort)
  expectContractError(() => createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['workflow_phase.execute', 'project_intelligence.inspect'],
    capabilityIds: [...CONTROL_PLANE_CAPABILITY_IDS],
  }, registry, hashPort), 'NON_CANONICAL_ORDER')

  expectContractError(() => createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['project_intelligence.inspect', 'project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect', 'repository.read'],
  }, registry, hashPort), 'DUPLICATE_VALUE')

  expectContractError(() => createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['system.shell' as OperationCode],
    capabilityIds: [],
  }, registry, hashPort), 'UNKNOWN_OPERATION')

  expectContractError(() => createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: [],
    capabilityIds: ['unknown.capability' as CapabilityId],
  }, registry, hashPort), 'UNKNOWN_CAPABILITY')

  expectContractError(() => createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect'],
  }, registry, hashPort), 'MISSING_CAPABILITY')

  const valid = createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect', 'repository.read'],
  }, registry, hashPort)
  const driftedOperations = clone(valid.operations).map((entry) => ({ ...entry }))
  driftedOperations[0] = { ...driftedOperations[0]!, contractHash: 'd'.repeat(64) }
  const hashDrift: WorkerCapabilityManifest = { ...clone(valid), operations: driftedOperations }
  expectContractError(() => validateWorkerCapabilityManifest(hashDrift, registry, hashPort), 'CONTRACT_HASH_MISMATCH')

  const manifestDrift = { ...clone(valid), manifestHash: 'e'.repeat(64) }
  expectContractError(() => validateWorkerCapabilityManifest(manifestDrift, registry, hashPort), 'MANIFEST_HASH_MISMATCH')

  const extra = { ...clone(valid), machineId: ids.repository }
  expectContractError(() => validateWorkerCapabilityManifest(extra, registry, hashPort), 'INVALID_SHAPE')
  expectContractError(() => createWorkerCapabilityManifest({ workerVersion: 'v1', operationCodes: [], capabilityIds: [] }, registry, hashPort), 'INVALID_SHAPE')
})

test('attack: hash ports fail closed and constant output cannot collapse distinct contracts', () => {
  const throwing: ControlPlaneHashPort = { sha256: () => { throw new Error('raw provider detail') } }
  expectContractError(() => createControlPlaneOperationRegistry(throwing), 'HASH_UNAVAILABLE', 'raw provider detail')
  expectContractError(() => createControlPlaneOperationRegistry({ sha256: () => 'not-a-hash' }), 'HASH_UNAVAILABLE')
  expectContractError(() => createControlPlaneOperationRegistry({ sha256: () => 'a'.repeat(64) }), 'HASH_UNAVAILABLE')
})

test('attack: created contracts cannot be mutated into a different capability claim', () => {
  const registry = createControlPlaneOperationRegistry(hashPort)
  const manifest = createWorkerCapabilityManifest({
    workerVersion: '1.0.0',
    operationCodes: ['project_intelligence.inspect'],
    capabilityIds: ['project_intelligence.inspect', 'repository.read'],
  }, registry, hashPort)
  const adapterBefore = registry[0]!.adapterId
  const capabilitiesBefore = [...manifest.capabilityIds]
  try { (registry as any)[0].adapterId = 'shell' } catch (error) { assert.ok(error instanceof TypeError) }
  try { (manifest.capabilityIds as any).push('provider.execute') } catch (error) { assert.ok(error instanceof TypeError) }
  assert.equal(registry[0]!.adapterId, adapterBefore)
  assert.deepEqual(manifest.capabilityIds, capabilitiesBefore)
  assert.deepEqual(validateControlPlaneOperationRegistry(registry, hashPort), registry)
  assert.deepEqual(validateWorkerCapabilityManifest(manifest, registry, hashPort), manifest)
})

test('structural: the pure domain has no runtime/platform imports or availability claims', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane.ts'), 'utf8')
  assert.doesNotMatch(source, /(?:from|require\s*\()\s*['"](?:node:|next|@supabase|playwright|child_process|fs|path|os|http|https)/)
  assert.doesNotMatch(source, /process\.|Deno\.|Bun\.|fetch\(|isAvailable\s*[:=]\s*true|shell\s*[:=]\s*true/)
  for (const forbidden of ['credentialAlias', 'providerToken', 'repositoryPath', 'executablePath', 'rawEnvironment']) {
    assert.ok(!source.includes(forbidden), `forbidden control-plane field ${forbidden}`)
  }
})

let failures = 0
for (const entry of tests) {
  try {
    entry.run()
    console.log(`PASS ${entry.name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${entry.name}`)
    console.error(error)
  }
}

if (failures > 0) process.exit(1)
console.log(`control-plane: ${tests.length} contract groups passed`)
