import crypto from 'node:crypto'
import type { SpecAdapterHashPort } from './spec-adapter'

/** The only A2A Node-specific port: deterministic SHA-256 over caller-supplied exact bytes. */
export function createNodeSpecAdapterHashPort(): SpecAdapterHashPort {
  return Object.freeze({
    sha256(sourceBytes: Uint8Array): string {
      return crypto.createHash('sha256').update(sourceBytes).digest('hex')
    },
  })
}
