import {
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto'
import {
  ControlPlaneSigningContractError,
  type ControlPlaneDetachedSignerPort,
  type ControlPlaneDetachedVerifierPort,
} from './control-plane-signing'

export interface NodeEd25519SignerBundle {
  readonly publicKeySpki: string
  readonly signer: ControlPlaneDetachedSignerPort
}

const BASE64URL = /^[A-Za-z0-9_-]+$/
const MAX_PUBLIC_KEY_CHARS = 342
const ED25519_SIGNATURE = /^[A-Za-z0-9_-]{85}[AQgw]$/

function invalidKey(): never {
  throw new ControlPlaneSigningContractError('INVALID_KEY', 'public key')
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

function decodePublicKey(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PUBLIC_KEY_CHARS || !BASE64URL.test(value)) {
    invalidKey()
  }
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length === 0 || encode(decoded) !== value) invalidKey()
  return decoded
}

function assertEd25519Key(value: unknown, expectedType: 'private' | 'public'): asserts value is KeyObject {
  if (!(value instanceof KeyObject) || value.type !== expectedType || value.asymmetricKeyType !== 'ed25519') {
    throw new ControlPlaneSigningContractError('INVALID_KEY', `${expectedType} key`)
  }
}

function publicSpki(value: KeyObject): string {
  assertEd25519Key(value, 'public')
  return encode(value.export({ format: 'der', type: 'spki' }))
}

export function createNodeEd25519Signer(signingKey: KeyObject, verificationKey: KeyObject): NodeEd25519SignerBundle {
  assertEd25519Key(signingKey, 'private')
  assertEd25519Key(verificationKey, 'public')
  try {
    const pairProbe = Buffer.from('claude-workflow-kit.control-plane.ed25519-key-pair.v1', 'utf8')
    const pairProof = nodeSign(null, pairProbe, signingKey)
    if (!nodeVerify(null, pairProbe, verificationKey, pairProof)) invalidKey()
    const signer: ControlPlaneDetachedSignerPort = Object.freeze({
      sign: (canonicalBytes: string): string => encode(nodeSign(null, Buffer.from(canonicalBytes, 'utf8'), signingKey)),
    })
    return Object.freeze({ publicKeySpki: publicSpki(verificationKey), signer })
  } catch (error) {
    if (error instanceof ControlPlaneSigningContractError) throw error
    invalidKey()
  }
}

export function createNodeEd25519KeyPair(): NodeEd25519SignerBundle {
  try {
    const pair = generateKeyPairSync('ed25519')
    return createNodeEd25519Signer(pair.privateKey, pair.publicKey)
  } catch (error) {
    if (error instanceof ControlPlaneSigningContractError) throw error
    throw new ControlPlaneSigningContractError('SIGNER_UNAVAILABLE', 'key generation')
  }
}

export function createNodeEd25519Verifier(publicKeySpki: unknown): ControlPlaneDetachedVerifierPort {
  let verificationKey: KeyObject
  try {
    verificationKey = createPublicKey({ key: decodePublicKey(publicKeySpki), format: 'der', type: 'spki' })
    assertEd25519Key(verificationKey, 'public')
  } catch (error) {
    if (error instanceof ControlPlaneSigningContractError) throw error
    invalidKey()
  }
  return Object.freeze({
    verify: (canonicalBytes: string, signature: string): boolean => {
      if (!ED25519_SIGNATURE.test(signature)) return false
      try {
        return nodeVerify(
          null,
          Buffer.from(canonicalBytes, 'utf8'),
          verificationKey,
          Buffer.from(signature, 'base64url'),
        )
      } catch {
        return false
      }
    },
  })
}
