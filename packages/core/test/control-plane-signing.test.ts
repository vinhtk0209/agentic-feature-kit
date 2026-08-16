import assert from 'node:assert/strict'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_CONTRACT_VERSION,
  CONTROL_PLANE_SCHEMA_VERSION,
  createControlPlaneExecutionEnvelope,
  createControlPlaneOperationRegistry,
  type ControlPlaneExecutionEnvelope,
  type ControlPlaneHashPort,
} from '../src/control-plane'
import {
  createControlPlaneExecutionReceipt,
  serializeControlPlaneExecutionReceipt,
  type ControlPlaneExecutionReceipt,
} from '../src/control-plane-state'
import {
  CONTROL_PLANE_SIGNATURE_ALGORITHM,
  CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION,
  CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION,
  ControlPlaneSigningContractError,
  createControlPlaneEnvelopeSignature,
  createControlPlaneReceiptSignature,
  serializeControlPlaneSignatureBytes,
  validateControlPlaneEnvelopeSignature,
  validateControlPlaneReceiptSignature,
  type ControlPlaneDetachedSignature,
  type ControlPlaneDetachedSignerPort,
  type ControlPlaneDetachedVerifierPort,
} from '../src/control-plane-signing'
import {
  createNodeEd25519KeyPair,
  createNodeEd25519Signer,
  createNodeEd25519Verifier,
} from '../src/control-plane-signing-node'

assert.equal(typeof createControlPlaneEnvelopeSignature, 'function', 'missing A3A envelope signer export')
assert.equal(typeof createControlPlaneReceiptSignature, 'function', 'missing A3A receipt signer export')
assert.equal(typeof serializeControlPlaneExecutionReceipt, 'function', 'missing A3A-owned A2C receipt serializer export')
assert.equal(typeof createNodeEd25519KeyPair, 'function', 'missing A3A Node Ed25519 adapter export')

const hashPort: ControlPlaneHashPort = {
  sha256: (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
}
const registry = createControlPlaneOperationRegistry(hashPort)

const ids = {
  tenant: '1a000000-0000-4000-8000-000000000001',
  commandRun: '2a000000-0000-4000-8000-000000000002',
  delivery: '3a000000-0000-4000-8000-000000000003',
  deliveryB: '3b000000-0000-4000-8000-000000000003',
  lease: '4a000000-0000-4000-8000-000000000004',
  leaseB: '4b000000-0000-4000-8000-000000000004',
  machine: '5a000000-0000-4000-8000-000000000005',
  machineB: '5b000000-0000-4000-8000-000000000005',
  repository: '6a000000-0000-4000-8000-000000000006',
} as const

const hashes = {
  binding: 'a'.repeat(64),
  progress: 'b'.repeat(64),
  evidenceA: 'c'.repeat(64),
  evidenceB: 'd'.repeat(64),
  result: 'e'.repeat(64),
} as const

const times = {
  issued: '2026-08-17T00:00:00.000Z',
  leaseExpires: '2026-08-17T00:01:00.000Z',
  completed: '2026-08-17T00:00:50.000Z',
  deadline: '2026-08-17T00:30:00.000Z',
  signed: '2026-08-17T00:00:01.000Z',
} as const

function envelope(
  overrides: Partial<ControlPlaneExecutionEnvelope['identity']> = {},
  registryInput: unknown = registry,
  port: ControlPlaneHashPort = hashPort,
): ControlPlaneExecutionEnvelope {
  return createControlPlaneExecutionEnvelope({
    identity: {
      schemaVersion: CONTROL_PLANE_SCHEMA_VERSION,
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
      ...overrides,
    },
    operationCode: 'project_intelligence.inspect',
    operationInput: { schemaVersion: 1, repositoryId: ids.repository },
    timing: {
      issuedAt: times.issued,
      leaseExpiresAt: times.leaseExpires,
      deadlineAt: times.deadline,
    },
    evidencePolicy: { mode: 'metadata_only', sink: 'p17_015_progress', retentionClass: 'standard' },
  }, registryInput, port)
}

function receipt(
  target: ControlPlaneExecutionEnvelope,
  outcome: 'passed' | 'failed' = 'passed',
): ControlPlaneExecutionReceipt {
  return createControlPlaneExecutionReceipt({
    identity: target.identity,
    envelopeHash: target.envelopeHash,
    operationCode: target.operation.descriptor.code,
    operationContractHash: target.operation.descriptor.contractHash,
    outcome,
    completedAt: times.completed,
    progressBindingHash: target.identity.progressBindingHash,
    progressTailHash: hashes.progress,
    evidenceHashes: [hashes.evidenceA, hashes.evidenceB],
    resultHash: outcome === 'passed' ? hashes.result : null,
  }, target, registry, hashPort)
}

const controlMetadata = {
  signerId: 'control-plane-primary',
  keyId: 'control-plane-ed25519',
  keyVersion: 1,
  signedAt: times.signed,
} as const

const workerMetadata = {
  signerId: ids.machine,
  keyId: 'machine-ed25519',
  keyVersion: 1,
  signedAt: times.signed,
} as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  if (!Object.isFrozen(value)) return false
  return Object.values(value).every(isDeepFrozen)
}

function expectSigningError(
  action: () => unknown,
  code?: InstanceType<typeof ControlPlaneSigningContractError>['code'],
  forbiddenEcho?: string,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof ControlPlaneSigningContractError)
    if (code) assert.equal(error.code, code)
    if (forbiddenEcho) assert.ok(!error.message.includes(forbiddenEcho), 'closed signing error echoed attacker input')
    return true
  })
}

function hexToBase64url(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64url')
}

let passed = 0
function run(name: string, body: () => void): void {
  try {
    body()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

run('1. generated Ed25519 envelope signature is exact, detached, frozen, and verifiable', () => {
  const target = envelope()
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  assert.deepEqual(Object.keys(signed), [
    'schemaVersion', 'contractVersion', 'algorithm', 'payloadKind', 'signerKind', 'tenantId',
    'signerId', 'keyId', 'keyVersion', 'signedAt', 'payloadHash', 'signature',
  ])
  assert.equal(signed.schemaVersion, CONTROL_PLANE_SIGNATURE_SCHEMA_VERSION)
  assert.equal(signed.contractVersion, CONTROL_PLANE_SIGNATURE_CONTRACT_VERSION)
  assert.equal(signed.algorithm, CONTROL_PLANE_SIGNATURE_ALGORITHM)
  assert.equal(signed.payloadKind, 'execution_envelope')
  assert.equal(signed.signerKind, 'control_plane')
  assert.equal(signed.tenantId, target.identity.tenantId)
  assert.match(signed.payloadHash, /^[0-9a-f]{64}$/)
  assert.match(signed.signature, /^[A-Za-z0-9_-]{86}$/)
  assert.ok(isDeepFrozen(signed))
  assert.equal('payload' in signed, false)
  const verified = validateControlPlaneEnvelopeSignature(
    target,
    signed,
    registry,
    hashPort,
    createNodeEd25519Verifier(pair.publicKeySpki),
  )
  assert.deepEqual(verified.payload, target)
  assert.deepEqual(verified.signature, signed)
  assert.ok(isDeepFrozen(verified))
})

run('2. receipt serializer and worker signature preserve A2C ownership and machine binding', () => {
  const targetEnvelope = envelope()
  const targetReceipt = receipt(targetEnvelope)
  const canonical = serializeControlPlaneExecutionReceipt(targetReceipt, targetEnvelope, registry, hashPort)
  assert.deepEqual(JSON.parse(canonical), targetReceipt)
  const permuted = Object.fromEntries(Object.entries(targetReceipt).reverse())
  assert.equal(
    serializeControlPlaneExecutionReceipt(permuted, targetEnvelope, registry, hashPort),
    canonical,
  )
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneReceiptSignature(
    targetReceipt,
    targetEnvelope,
    workerMetadata,
    registry,
    hashPort,
    pair.signer,
  )
  assert.equal(signed.payloadKind, 'execution_receipt')
  assert.equal(signed.signerKind, 'worker_machine')
  assert.equal(signed.signerId, targetEnvelope.identity.machineId)
  const verified = validateControlPlaneReceiptSignature(
    targetReceipt,
    targetEnvelope,
    signed,
    registry,
    hashPort,
    createNodeEd25519Verifier(pair.publicKeySpki),
  )
  assert.deepEqual(verified.payload, targetReceipt)
  assert.deepEqual(verified.signature, signed)
})

run('3. changed payload and every security-relevant wrapper field fail closed', () => {
  const target = envelope()
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  const verifier = createNodeEd25519Verifier(pair.publicKeySpki)
  const changed = envelope({ deliveryId: ids.deliveryB, leaseId: ids.leaseB })
  expectSigningError(() => validateControlPlaneEnvelopeSignature(changed, signed, registry, hashPort, verifier), 'INVALID_HASH')
  for (const mutation of [
    { tenantId: '1b000000-0000-4000-8000-000000000001' },
    { signerKind: 'worker_machine' },
    { signerId: 'control-plane-secondary' },
    { keyId: 'control-plane-rotated' },
    { keyVersion: 2 },
    { signedAt: '2026-08-17T00:00:02.000Z' },
    { payloadHash: 'f'.repeat(64) },
    { signature: `${signed.signature.slice(0, -1)}${signed.signature.endsWith('A') ? 'B' : 'A'}` },
  ]) {
    expectSigningError(
      () => validateControlPlaneEnvelopeSignature(target, { ...signed, ...mutation }, registry, hashPort, verifier),
    )
  }

  const targetReceipt = receipt(target)
  const receiptSignature = createControlPlaneReceiptSignature(
    targetReceipt,
    target,
    workerMetadata,
    registry,
    hashPort,
    pair.signer,
  )
  const changedReceipt = receipt(target, 'failed')
  expectSigningError(
    () => validateControlPlaneReceiptSignature(changedReceipt, target, receiptSignature, registry, hashPort, verifier),
    'INVALID_HASH',
  )
  expectSigningError(
    () => validateControlPlaneReceiptSignature(
      targetReceipt,
      target,
      { ...receiptSignature, signerId: ids.machineB },
      registry,
      hashPort,
      verifier,
    ),
    'INVALID_METADATA',
  )
})

run('4. domain separation rejects payload-kind confusion and cross-protocol replay', () => {
  const target = envelope()
  const targetReceipt = receipt(target)
  const pair = createNodeEd25519KeyPair()
  const verifier = createNodeEd25519Verifier(pair.publicKeySpki)
  const envelopeSignature = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  const receiptSignature = createControlPlaneReceiptSignature(targetReceipt, target, workerMetadata, registry, hashPort, pair.signer)
  assert.notEqual(
    serializeControlPlaneSignatureBytes(envelopeSignature),
    serializeControlPlaneSignatureBytes(receiptSignature),
  )
  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(
      target,
      receiptSignature as unknown as ControlPlaneDetachedSignature,
      registry,
      hashPort,
      verifier,
    ),
    'INVALID_METADATA',
  )
  expectSigningError(
    () => validateControlPlaneReceiptSignature(
      targetReceipt,
      target,
      envelopeSignature as unknown as ControlPlaneDetachedSignature,
      registry,
      hashPort,
      verifier,
    ),
    'INVALID_METADATA',
  )
  const confused = { ...envelopeSignature, payloadKind: 'execution_receipt' as const, signerKind: 'worker_machine' as const, signerId: ids.machine }
  expectSigningError(
    () => validateControlPlaneReceiptSignature(targetReceipt, target, confused, registry, hashPort, verifier),
  )
})

run('5. exact wrapper validation rejects encoding, key-reference, and structural attacks', () => {
  const target = envelope()
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  const verifier = createNodeEd25519Verifier(pair.publicKeySpki)
  for (const invalid of [
    { ...signed, signature: '' },
    { ...signed, signature: `${signed.signature}=` },
    { ...signed, signature: `${signed.signature.slice(0, -1)}+` },
    { ...signed, signature: 'A'.repeat(600) },
    { ...signed, keyVersion: 0 },
    { ...signed, keyVersion: Number.MAX_SAFE_INTEGER },
    { ...signed, keyId: '' },
    { ...signed, keyId: '../private-key' },
    { ...signed, signerId: 'x'.repeat(129) },
    { ...signed, signedAt: '2026-08-17T00:00:01Z' },
    { ...signed, extra: true },
  ]) expectSigningError(() => validateControlPlaneEnvelopeSignature(target, invalid, registry, hashPort, verifier))

  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(
      target,
      Object.assign(Object.create({ polluted: true }), signed),
      registry,
      hashPort,
      verifier,
    ),
  )
  let accessorRead = false
  const accessor = { ...signed } as Record<string, unknown>
  Object.defineProperty(accessor, 'signature', {
    enumerable: true,
    get: () => { accessorRead = true; return signed.signature },
  })
  expectSigningError(() => validateControlPlaneEnvelopeSignature(target, accessor, registry, hashPort, verifier))
  assert.equal(accessorRead, false)
  const cyclic = { ...signed } as Record<string, unknown>
  cyclic.signature = cyclic
  expectSigningError(() => validateControlPlaneEnvelopeSignature(target, cyclic, registry, hashPort, verifier))
  const hidden = { ...signed }
  Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true })
  expectSigningError(() => validateControlPlaneEnvelopeSignature(target, hidden, registry, hashPort, verifier))
  const symbolic = { ...signed, [Symbol('hidden')]: true }
  expectSigningError(() => validateControlPlaneEnvelopeSignature(target, symbolic, registry, hashPort, verifier))
  expectSigningError(() => createNodeEd25519Verifier('invalid+public/key'), 'INVALID_KEY', 'invalid+public/key')
})

run('6. signing bytes are fixed-key canonical and key-order independent', () => {
  const target = envelope()
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  const permuted = Object.fromEntries(Object.entries(signed).reverse())
  assert.equal(serializeControlPlaneSignatureBytes(permuted), serializeControlPlaneSignatureBytes(signed))
  const parsed = JSON.parse(serializeControlPlaneSignatureBytes(signed)) as Record<string, unknown>
  assert.deepEqual(Object.keys(parsed), [
    'domain', 'schemaVersion', 'contractVersion', 'algorithm', 'payloadKind', 'signerKind',
    'tenantId', 'signerId', 'keyId', 'keyVersion', 'signedAt', 'payloadHash',
  ])
  assert.equal(parsed.domain, 'claude-workflow-kit.control-plane.execution-envelope-signature.v1')
  const altered = serializeControlPlaneSignatureBytes({ ...signed, keyVersion: 2, signature: signed.signature })
  assert.notEqual(altered, serializeControlPlaneSignatureBytes(signed))
})

run('7. signer, verifier, hash, and wrong-key failures are closed and non-echoing', () => {
  const target = envelope()
  const secret = 'private-material-must-not-echo'
  const throwingSigner: ControlPlaneDetachedSignerPort = { sign: () => { throw new Error(secret) } }
  expectSigningError(
    () => createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, throwingSigner),
    'SIGNER_UNAVAILABLE',
    secret,
  )
  const malformedSigner: ControlPlaneDetachedSignerPort = { sign: () => 'not+a+signature' }
  expectSigningError(
    () => createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, malformedSigner),
    'SIGNER_UNAVAILABLE',
  )
  const pair = createNodeEd25519KeyPair()
  const signed = createControlPlaneEnvelopeSignature(target, controlMetadata, registry, hashPort, pair.signer)
  const throwingVerifier: ControlPlaneDetachedVerifierPort = { verify: () => { throw new Error(secret) } }
  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(target, signed, registry, hashPort, throwingVerifier),
    'VERIFIER_UNAVAILABLE',
    secret,
  )
  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(target, signed, registry, hashPort, { verify: () => false }),
    'INVALID_SIGNATURE',
  )
  const otherPair = createNodeEd25519KeyPair()
  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(target, signed, registry, hashPort, createNodeEd25519Verifier(otherPair.publicKeySpki)),
    'INVALID_SIGNATURE',
  )
  const realVerifier = createNodeEd25519Verifier(pair.publicKeySpki)
  expectSigningError(
    () => validateControlPlaneEnvelopeSignature(target, signed, registry, hashPort, {
      verify: (canonicalBytes, signature) => realVerifier.verify(`${canonicalBytes}\n`, signature),
    }),
    'INVALID_SIGNATURE',
  )
  const constantHash: ControlPlaneHashPort = {
    sha256: (value) => value === ''
      ? '0'.repeat(64)
      : createHash('sha256').update(value, 'utf8').digest('hex'),
  }
  const constantRegistry = createControlPlaneOperationRegistry(constantHash)
  const constantTarget = envelope({}, constantRegistry, constantHash)
  expectSigningError(
    () => createControlPlaneEnvelopeSignature(
      constantTarget,
      controlMetadata,
      constantRegistry,
      constantHash,
      pair.signer,
    ),
    'HASH_UNAVAILABLE',
  )
})

run('8. Node adapter matches the fixed RFC 8032 Ed25519 vector without exporting its private key', () => {
  const seed = hexToBase64url('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
  const publicX = hexToBase64url('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
  const expectedSignature = hexToBase64url(
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
    '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  )
  const privateKey = createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', d: seed, x: publicX },
    format: 'jwk',
  })
  const publicKey = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicX },
    format: 'jwk',
  })
  const bundle = createNodeEd25519Signer(privateKey, publicKey)
  assert.equal(bundle.signer.sign(''), expectedSignature)
  assert.equal(createNodeEd25519Verifier(bundle.publicKeySpki).verify('', expectedSignature), true)
  assert.deepEqual(Object.keys(bundle), ['publicKeySpki', 'signer'])
  assert.deepEqual(Object.keys(bundle.signer), ['sign'])
  assert.equal(JSON.stringify(bundle).includes(seed), false)
  assert.equal(String(bundle).includes(seed), false)
  assert.equal(bundle.publicKeySpki.includes('='), false)
  const unrelatedPair = generateKeyPairSync('ed25519')
  expectSigningError(() => createNodeEd25519Signer(privateKey, unrelatedPair.publicKey), 'INVALID_KEY')
  const wrongTypePair = generateKeyPairSync('x25519')
  expectSigningError(() => createNodeEd25519Signer(wrongTypePair.privateKey, wrongTypePair.publicKey), 'INVALID_KEY')
  expectSigningError(
    () => createNodeEd25519Signer({ type: 'private', asymmetricKeyType: 'ed25519' } as never, publicKey),
    'INVALID_KEY',
  )
})

run('9. signing entry points retain A2 validation and do not become alternate parsers', () => {
  const target = envelope()
  const targetReceipt = receipt(target)
  const pair = createNodeEd25519KeyPair()
  assert.throws(
    () => createControlPlaneEnvelopeSignature({ ...target, rawCommand: 'forbidden' }, controlMetadata, registry, hashPort, pair.signer),
  )
  assert.throws(
    () => createControlPlaneReceiptSignature({ ...targetReceipt, rawOutput: 'forbidden' }, target, workerMetadata, registry, hashPort, pair.signer),
  )
  assert.throws(
    () => createControlPlaneReceiptSignature(targetReceipt, { ...target, envelopeHash: 'f'.repeat(64) }, workerMetadata, registry, hashPort, pair.signer),
  )
})

run('10. source ownership isolates pure contracts from Node and never exports private key material', () => {
  const pureSource = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-signing.ts'), 'utf8')
  const nodeSource = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'control-plane-signing-node.ts'), 'utf8')
  assert.doesNotMatch(pureSource, /from ['"]node:|process\.|fetch\(|supabase|filesystem|child_process|console\./)
  assert.match(pureSource, /serializeControlPlaneExecutionEnvelope/)
  assert.match(pureSource, /serializeControlPlaneExecutionReceipt/)
  assert.doesNotMatch(pureSource, /nonce|revocation|rotation|journal|enrollment/i)
  assert.match(nodeSource, /from ['"]node:crypto['"]/)
  assert.doesNotMatch(nodeSource, /process\.|fetch\(|supabase|filesystem|child_process|console\./)
  assert.doesNotMatch(nodeSource, /privateKey\s*:/)
  assert.doesNotMatch(nodeSource, /return\s+\{[^}]*privateKey/s)
  assert.doesNotMatch(nodeSource, /\.export\s*\([^)]*private/i)
  assert.equal(CONTROL_PLANE_SCHEMA_VERSION, 1)
  assert.equal(CONTROL_PLANE_CONTRACT_VERSION, '1.0.0')
})

console.log(`P17-014 A3A detached signing: PASS (${passed} groups)`)
