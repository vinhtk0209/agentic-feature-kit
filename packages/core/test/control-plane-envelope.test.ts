import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_ERROR_CODES,
  CONTROL_PLANE_MAX_ATTEMPTS,
  CONTROL_PLANE_MAX_DEADLINE_INTERVAL_MS,
  CONTROL_PLANE_MAX_ENVELOPE_BYTES,
  CONTROL_PLANE_MAX_LEASE_INTERVAL_MS,
  CONTROL_PLANE_OPERATION_CODES,
  CONTROL_PLANE_SCHEMA_VERSION,
  ControlPlaneContractError,
  createControlPlaneExecutionEnvelope,
  createControlPlaneOperationRegistry,
  serializeControlPlaneExecutionEnvelope,
  validateControlPlaneExecutionEnvelope,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneExecutionEnvelopeInput,
  type ControlPlaneHashPort,
  type ControlPlaneOperationInput,
  type OperationCode,
  type OperationDescriptor,
} from '../src/control-plane'

type MutableEnvelopeInput = {
  -readonly [Key in keyof ControlPlaneExecutionEnvelopeInput]: ControlPlaneExecutionEnvelopeInput[Key]
}

assert.equal(typeof createControlPlaneExecutionEnvelope, 'function', 'missing A2B createControlPlaneExecutionEnvelope export')
assert.equal(typeof validateControlPlaneExecutionEnvelope, 'function', 'missing A2B validateControlPlaneExecutionEnvelope export')
assert.equal(typeof serializeControlPlaneExecutionEnvelope, 'function', 'missing A2B serializeControlPlaneExecutionEnvelope export')

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}

const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  commandRun: '20000000-0000-4000-8000-000000000002',
  retryRun: '20000000-0000-4000-8000-000000000003',
  delivery: '30000000-0000-4000-8000-000000000003',
  retryDelivery: '30000000-0000-4000-8000-000000000004',
  lease: '40000000-0000-4000-8000-000000000004',
  retryLease: '40000000-0000-4000-8000-000000000005',
  machine: '50000000-0000-4000-8000-000000000005',
  repository: '60000000-0000-4000-8000-000000000006',
  phaseReference: '70000000-0000-4000-8000-000000000007',
  verificationReference: '80000000-0000-4000-8000-000000000008',
  evidenceReference: '90000000-0000-4000-8000-000000000009',
} as const

const hashes = {
  binding: 'a'.repeat(64),
  phase: 'b'.repeat(64),
  verification: 'c'.repeat(64),
  evidence: 'd'.repeat(64),
} as const

const timing = {
  issuedAt: '2026-08-16T00:00:00.000Z',
  leaseExpiresAt: '2026-08-16T00:01:00.000Z',
  deadlineAt: '2026-08-16T00:30:00.000Z',
} as const

const evidencePolicy = {
  mode: 'metadata_only',
  sink: 'p17_015_progress',
  retentionClass: 'standard',
} as const

const identity = {
  schemaVersion: 1,
  tenantId: ids.tenant,
  taskId: 'P17-014',
  commandRunId: ids.commandRun,
  rootRunId: ids.commandRun,
  parentRunId: null,
  attempt: 1,
  deliveryId: ids.delivery,
  leaseId: ids.lease,
  machineId: ids.machine,
  repositoryId: ids.repository,
  progressBindingHash: hashes.binding,
} as const

const operationInputs: Record<OperationCode, ControlPlaneOperationInput> = {
  'evidence.verify': {
    schemaVersion: 1,
    evidence: {
      schemaVersion: 1,
      referenceId: ids.evidenceReference,
      purpose: 'evidence',
      sha256: hashes.evidence,
      mediaType: 'application/zip',
      bytes: 16384,
    },
  },
  'project_intelligence.inspect': {
    schemaVersion: 1,
    repositoryId: ids.repository,
  },
  'workflow_phase.execute': {
    schemaVersion: 1,
    repositoryId: ids.repository,
    phaseId: 'B11',
    phaseEnvelope: {
      schemaVersion: 1,
      referenceId: ids.phaseReference,
      purpose: 'phase_envelope',
      sha256: hashes.phase,
      mediaType: 'application/json',
      bytes: 4096,
    },
  },
  'workflow_verify.execute': {
    schemaVersion: 1,
    repositoryId: ids.repository,
    verificationRequest: {
      schemaVersion: 1,
      referenceId: ids.verificationReference,
      purpose: 'verification_request',
      sha256: hashes.verification,
      mediaType: 'application/json',
      bytes: 8192,
    },
  },
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
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

const registry = createControlPlaneOperationRegistry(hashPort)

function validInput(code: OperationCode = 'project_intelligence.inspect'): MutableEnvelopeInput {
  return {
    identity: clone(identity),
    operationCode: code,
    operationInput: clone(operationInputs[code]),
    timing: clone(timing),
    evidencePolicy: clone(evidencePolicy),
  }
}

const tests: Array<{ name: string; run: () => void }> = []
function test(name: string, run: () => void): void {
  tests.push({ name, run })
}

test('creates one exact deterministic frozen envelope and canonical serializer', () => {
  const first = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  const second = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  assert.deepEqual(first, second)
  const permutedInput = {
    evidencePolicy: clone(evidencePolicy),
    timing: clone(timing),
    operationInput: clone(operationInputs['project_intelligence.inspect']),
    operationCode: 'project_intelligence.inspect',
    identity: {
      progressBindingHash: hashes.binding,
      repositoryId: ids.repository,
      machineId: ids.machine,
      leaseId: ids.lease,
      deliveryId: ids.delivery,
      attempt: 1,
      parentRunId: null,
      rootRunId: ids.commandRun,
      commandRunId: ids.commandRun,
      taskId: 'P17-014',
      tenantId: ids.tenant,
      schemaVersion: 1,
    },
  } as const
  assert.deepEqual(createControlPlaneExecutionEnvelope(permutedInput, registry, hashPort), first)
  assert.equal(first.schemaVersion, CONTROL_PLANE_SCHEMA_VERSION)
  assert.equal(first.contractVersion, CONTROL_PLANE_CONTRACT_VERSION)
  assert.match(first.envelopeHash, /^[0-9a-f]{64}$/)
  assert.ok(isDeepFrozen(first))
  const serialized = serializeControlPlaneExecutionEnvelope(first, registry, hashPort)
  assert.deepEqual(JSON.parse(serialized), first)
  assert.equal(serialized, serializeControlPlaneExecutionEnvelope(second, registry, hashPort))
  assert.ok(utf8Bytes(serialized) <= CONTROL_PLANE_MAX_ENVELOPE_BYTES)
  assert.deepEqual(validateControlPlaneExecutionEnvelope(first, registry, hashPort), first)
  const permutedEnvelope = {
    envelopeHash: first.envelopeHash,
    evidencePolicy: first.evidencePolicy,
    timing: first.timing,
    operation: first.operation,
    identity: first.identity,
    contractVersion: first.contractVersion,
    schemaVersion: first.schemaVersion,
  }
  assert.deepEqual(validateControlPlaneExecutionEnvelope(permutedEnvelope, registry, hashPort), first)
})

test('binds all four operations to their canonical A2A descriptor and validated input', () => {
  for (const code of CONTROL_PLANE_OPERATION_CODES) {
    const envelope = createControlPlaneExecutionEnvelope(validInput(code), registry, hashPort)
    const descriptor = registry.find((entry) => entry.code === code)
    assert.ok(descriptor)
    assert.deepEqual(envelope.operation.descriptor, descriptor)
    assert.deepEqual(envelope.operation.input, operationInputs[code])
    assert.equal(validateControlPlaneExecutionEnvelope(envelope, registry, hashPort).envelopeHash, envelope.envelopeHash)
  }
})

test('accepts canonical first-attempt and linear-retry identity references only', () => {
  const first = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  assert.equal(first.identity.rootRunId, first.identity.commandRunId)
  assert.equal(first.identity.parentRunId, null)

  const retryInput = validInput()
  retryInput.identity = {
    ...retryInput.identity,
    commandRunId: ids.retryRun,
    rootRunId: ids.commandRun,
    parentRunId: ids.commandRun,
    attempt: 2,
    deliveryId: ids.retryDelivery,
    leaseId: ids.retryLease,
  }
  const retry = createControlPlaneExecutionEnvelope(retryInput, registry, hashPort)
  assert.equal(retry.identity.attempt, 2)
  assert.equal(retry.identity.rootRunId, ids.commandRun)
  assert.equal(retry.identity.parentRunId, ids.commandRun)
})

test('publishes the exact A2B bounds without changing the A2A protocol versions', () => {
  assert.equal(CONTROL_PLANE_SCHEMA_VERSION, 1)
  assert.equal(CONTROL_PLANE_CONTRACT_VERSION, '1.0.0')
  assert.equal(CONTROL_PLANE_MAX_ATTEMPTS, 50)
  assert.equal(CONTROL_PLANE_MAX_LEASE_INTERVAL_MS, 60_000)
  assert.equal(CONTROL_PLANE_MAX_DEADLINE_INTERVAL_MS, 30 * 60_000)
  assert.equal(CONTROL_PLANE_MAX_ENVELOPE_BYTES, 256 * 1024)
})

test('attack: envelope and nested schemas reject extras, prototypes, accessors, cycles, and arrays', () => {
  const envelope = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  expectContractError(() => validateControlPlaneExecutionEnvelope({ ...clone(envelope), message: 'raw' }, registry, hashPort), 'INVALID_SHAPE')

  const nestedExtra = clone(envelope) as unknown as Record<string, any>
  nestedExtra.timing.timezone = 'local'
  expectContractError(() => validateControlPlaneExecutionEnvelope(nestedExtra, registry, hashPort), 'INVALID_SHAPE')

  const inherited = Object.assign(Object.create({ secret: 'hidden' }), clone(envelope))
  expectContractError(() => validateControlPlaneExecutionEnvelope(inherited, registry, hashPort), 'INVALID_SHAPE')

  const accessor = clone(envelope) as unknown as Record<string, any>
  Object.defineProperty(accessor.identity, 'tenantId', { enumerable: true, get: () => ids.tenant })
  expectContractError(() => validateControlPlaneExecutionEnvelope(accessor, registry, hashPort), 'INVALID_SHAPE')

  const cyclic = clone(envelope) as unknown as Record<string, any>
  cyclic.operation.input = cyclic
  expectContractError(() => validateControlPlaneExecutionEnvelope(cyclic, registry, hashPort), 'INVALID_SHAPE')
  expectContractError(() => validateControlPlaneExecutionEnvelope([], registry, hashPort), 'INVALID_SHAPE')
})

test('attack: identity rejects malformed, ambiguous, mismatched, and invalid-lineage values', () => {
  const cases: Array<{ mutate: (value: MutableEnvelopeInput) => void; code: (typeof CONTROL_PLANE_ERROR_CODES)[number] }> = [
    { mutate: (value) => { value.identity = { ...value.identity, tenantId: ids.tenant.toUpperCase() } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, taskId: 'task-14' } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, attempt: 0 } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, attempt: CONTROL_PLANE_MAX_ATTEMPTS + 1 } }, code: 'LIMIT_EXCEEDED' },
    { mutate: (value) => { value.identity = { ...value.identity, rootRunId: ids.retryRun } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, parentRunId: ids.retryRun } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, attempt: 2, parentRunId: null } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, attempt: 2, parentRunId: ids.commandRun } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, leaseId: value.identity.deliveryId } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, progressBindingHash: 'A'.repeat(64) } }, code: 'INVALID_SHAPE' },
    { mutate: (value) => { value.identity = { ...value.identity, repositoryId: ids.retryRun } }, code: 'INVALID_SHAPE' },
  ]
  for (const entry of cases) {
    const input = validInput()
    entry.mutate(input)
    expectContractError(() => createControlPlaneExecutionEnvelope(input, registry, hashPort), entry.code)
  }
})

test('attack: operation descriptor and input drift cannot cross the envelope boundary', () => {
  const envelope = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  const hashDrift = clone(envelope) as unknown as Record<string, any>
  hashDrift.operation.descriptor.contractHash = 'e'.repeat(64)
  expectContractError(() => validateControlPlaneExecutionEnvelope(hashDrift, registry, hashPort), 'CONTRACT_HASH_MISMATCH')

  const adapterDrift = clone(envelope) as unknown as Record<string, any>
  adapterDrift.operation.descriptor.adapterId = 'system-shell-v1'
  expectContractError(() => validateControlPlaneExecutionEnvelope(adapterDrift, registry, hashPort), 'INVALID_SHAPE')

  const capabilityDrift = clone(envelope) as unknown as Record<string, any>
  capabilityDrift.operation.descriptor.requiredCapabilities.reverse()
  expectContractError(() => validateControlPlaneExecutionEnvelope(capabilityDrift, registry, hashPort), 'NON_CANONICAL_ORDER')

  const rawInput = validInput()
  rawInput.operationInput = { ...rawInput.operationInput, repositoryPath: 'C:\\raw-repository' } as unknown as ControlPlaneOperationInput
  expectContractError(() => createControlPlaneExecutionEnvelope(rawInput, registry, hashPort), 'INVALID_SHAPE', 'C:\\raw-repository')

  const wrongInput = validInput()
  wrongInput.operationInput = clone(operationInputs['evidence.verify'])
  expectContractError(() => createControlPlaneExecutionEnvelope(wrongInput, registry, hashPort), 'INVALID_SHAPE')
})

test('attack: timing rejects non-canonical, reversed, equal, and over-limit intervals', () => {
  const cases: Array<{ timing: Record<string, unknown>; code: (typeof CONTROL_PLANE_ERROR_CODES)[number] }> = [
    { timing: { ...timing, issuedAt: '2026-08-16T07:00:00+07:00' }, code: 'INVALID_SHAPE' },
    { timing: { ...timing, leaseExpiresAt: timing.issuedAt }, code: 'INVALID_SHAPE' },
    { timing: { ...timing, leaseExpiresAt: '2026-08-16T00:30:00.001Z' }, code: 'INVALID_SHAPE' },
    { timing: { ...timing, leaseExpiresAt: '2026-08-16T00:01:00.001Z' }, code: 'LIMIT_EXCEEDED' },
    { timing: { ...timing, deadlineAt: '2026-08-16T00:30:00.001Z' }, code: 'LIMIT_EXCEEDED' },
  ]
  for (const entry of cases) {
    const input = validInput()
    input.timing = entry.timing as unknown as ControlPlaneExecutionEnvelopeInput['timing']
    expectContractError(() => createControlPlaneExecutionEnvelope(input, registry, hashPort), entry.code)
  }
})

test('attack: evidence policy is closed and cannot select a destination locator', () => {
  for (const changed of [
    { ...evidencePolicy, mode: 'body_and_metadata' },
    { ...evidencePolicy, sink: 'arbitrary_table' },
    { ...evidencePolicy, retentionClass: 'forever' },
    { ...evidencePolicy, bucketUrl: 'https://internal.invalid' },
  ]) {
    const input = validInput()
    input.evidencePolicy = changed as unknown as ControlPlaneExecutionEnvelopeInput['evidencePolicy']
    expectContractError(() => createControlPlaneExecutionEnvelope(input, registry, hashPort), 'INVALID_SHAPE')
  }
})

test('attack: envelope hash and hash ports fail closed without echoing provider details', () => {
  const envelope = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  expectContractError(() => validateControlPlaneExecutionEnvelope({ ...clone(envelope), envelopeHash: 'f'.repeat(64) }, registry, hashPort), 'CONTRACT_HASH_MISMATCH')
  const throwing: ControlPlaneHashPort = { sha256: () => { throw new Error('RAW_HASH_PROVIDER_DETAIL') } }
  expectContractError(() => validateControlPlaneExecutionEnvelope(envelope, registry, throwing), 'HASH_UNAVAILABLE', 'RAW_HASH_PROVIDER_DETAIL')
  expectContractError(() => validateControlPlaneExecutionEnvelope(envelope, registry, { sha256: () => 'not-a-hash' }), 'HASH_UNAVAILABLE')
  expectContractError(() => validateControlPlaneExecutionEnvelope(envelope, registry, { sha256: () => 'a'.repeat(64) }), 'HASH_UNAVAILABLE')
})

test('attack: created envelope cannot be mutated into a different authority claim', () => {
  const envelope = createControlPlaneExecutionEnvelope(validInput(), registry, hashPort)
  const before = serializeControlPlaneExecutionEnvelope(envelope, registry, hashPort)
  try { (envelope.identity as any).tenantId = ids.retryRun } catch (error) { assert.ok(error instanceof TypeError) }
  try { (envelope.operation.descriptor.requiredCapabilities as any).push('provider.execute') } catch (error) { assert.ok(error instanceof TypeError) }
  try { (envelope.timing as any).deadlineAt = '2099-01-01T00:00:00.000Z' } catch (error) { assert.ok(error instanceof TypeError) }
  assert.equal(serializeControlPlaneExecutionEnvelope(envelope, registry, hashPort), before)
})

test('structural: A2B remains pure, unsigned, and free of raw control fields', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane.ts'), 'utf8')
  const importPattern = /(?:from|require\s*\()\s*['"](?:node:|next|@supabase|playwright|child_process|fs|path|os|http|https)/
  assert.match("from 'node:fs'", importPattern, 'import scan positive control failed')
  assert.doesNotMatch(source, importPattern)
  const fieldPattern = /\b(?:signature|keyVersion|nonce|repositoryPath|credentialAlias|providerToken|rawEnvironment)\s*[?:]/
  assert.match('signature: string', fieldPattern, 'forbidden-field scan positive control failed')
  assert.doesNotMatch(source, fieldPattern)
  assert.doesNotMatch(source, /process\.|Deno\.|Bun\.|fetch\(|isAvailable\s*[:=]\s*true/)
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
console.log(`control-plane-envelope: ${tests.length} contract groups passed`)
