import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS,
  type ControlPlaneWorkerJournalEntry,
  type ControlPlaneWorkerJournalKey,
  type ControlPlaneWorkerJournalPort,
} from './control-plane-worker-journal'

export const CONTROL_PLANE_WORKER_JOURNAL_STORAGE_VERSION = 1 as const
export const CONTROL_PLANE_WORKER_JOURNAL_STORAGE_MAX_SEGMENT_BYTES = 384 * 1024

export type NodeControlPlaneWorkerJournalStorageErrorCode =
  | 'INVALID_PATH'
  | 'INVALID_KEY'
  | 'ENTRY_TOO_LARGE'
  | 'REVISION_OVERFLOW'
  | 'CORRUPT_HISTORY'
  | 'STORAGE_UNAVAILABLE'

export class NodeControlPlaneWorkerJournalStorageError extends Error {
  readonly code: NodeControlPlaneWorkerJournalStorageErrorCode

  constructor(code: NodeControlPlaneWorkerJournalStorageErrorCode, context: string) {
    super(`control plane worker journal storage: ${context}`)
    this.name = 'NodeControlPlaneWorkerJournalStorageError'
    this.code = code
  }
}

export interface NodeControlPlaneWorkerJournalFileOps {
  readonly existsSync: (target: fs.PathLike) => boolean
  readonly lstatSync: (target: fs.PathLike) => fs.Stats
  readonly mkdirSync: (target: fs.PathLike, options: { recursive: true; mode?: number }) => string | undefined
  readonly readdirSync: (target: fs.PathLike, options: { withFileTypes: true }) => fs.Dirent[]
  readonly readFileSync: (target: fs.PathOrFileDescriptor, encoding: 'utf8') => string
  readonly openSync: (target: fs.PathLike, flags: string, mode?: number) => number
  readonly writeFileSync: (target: fs.PathOrFileDescriptor, data: string, options: { encoding: 'utf8' }) => void
  readonly fsyncSync: (fileDescriptor: number) => void
  readonly closeSync: (fileDescriptor: number) => void
  readonly linkSync: (existingPath: fs.PathLike, newPath: fs.PathLike) => void
  readonly unlinkSync: (target: fs.PathLike) => void
}

export interface DisposableNodeControlPlaneWorkerJournalOptions {
  readonly rootDirectory: string
  readonly fileOps?: Partial<NodeControlPlaneWorkerJournalFileOps>
  readonly entropy?: () => string
}

interface StorageWrapper {
  readonly storageVersion: typeof CONTROL_PLANE_WORKER_JOURNAL_STORAGE_VERSION
  readonly keyHash: string
  readonly revision: number
  readonly entry: unknown
  readonly digest: string
}

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const LOWER_HASH = /^[0-9a-f]{64}$/
const ENTROPY = /^[0-9a-f]{32}$/
const SEGMENT = /^(\d{16})\.json$/
const TEMPORARY = /^\.[0-9a-f]{32}\.tmp$/
const KEY_KEYS = ['tenantId', 'machineId', 'deliveryId'] as const
const WRAPPER_KEYS = ['storageVersion', 'keyHash', 'revision', 'entry', 'digest'] as const

const DEFAULT_FILE_OPS: NodeControlPlaneWorkerJournalFileOps = {
  existsSync: fs.existsSync,
  lstatSync: fs.lstatSync,
  mkdirSync: fs.mkdirSync,
  readdirSync: (target, options) => fs.readdirSync(target, options),
  readFileSync: fs.readFileSync,
  openSync: fs.openSync,
  writeFileSync: fs.writeFileSync,
  fsyncSync: fs.fsyncSync,
  closeSync: fs.closeSync,
  linkSync: fs.linkSync,
  unlinkSync: fs.unlinkSync,
}

function fail(code: NodeControlPlaneWorkerJournalStorageErrorCode, context: string): never {
  throw new NodeControlPlaneWorkerJournalStorageError(code, context)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], context: string): void {
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) fail('CORRUPT_HISTORY', context)
  const actual = (ownKeys as string[]).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('CORRUPT_HISTORY', context)
  }
}

function validateKey(value: unknown): ControlPlaneWorkerJournalKey {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('INVALID_KEY', 'journal key')
  }
  const record = value as Record<string, unknown>
  const ownKeys = Reflect.ownKeys(record)
  if (ownKeys.some((entry) => typeof entry !== 'string')) fail('INVALID_KEY', 'journal key')
  const actual = (ownKeys as string[]).sort()
  const wanted = [...KEY_KEYS].sort()
  if (actual.length !== wanted.length || actual.some((entry, index) => entry !== wanted[index])) {
    fail('INVALID_KEY', 'journal key')
  }
  const descriptors = Object.getOwnPropertyDescriptors(record)
  for (const key of KEY_KEYS) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) fail('INVALID_KEY', 'journal key')
    if (typeof descriptor.value !== 'string' || !LOWER_UUID.test(descriptor.value)) fail('INVALID_KEY', 'journal key')
  }
  return {
    tenantId: descriptors.tenantId.value as string,
    machineId: descriptors.machineId.value as string,
    deliveryId: descriptors.deliveryId.value as string,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function keyHash(key: ControlPlaneWorkerJournalKey): string {
  return sha256(JSON.stringify({
    domain: 'claude-workflow-kit.control-plane.worker-journal-storage-key.v1',
    tenantId: key.tenantId,
    machineId: key.machineId,
    deliveryId: key.deliveryId,
  }))
}

function wrapperContent(value: Omit<StorageWrapper, 'digest'>): string {
  return JSON.stringify({
    domain: 'claude-workflow-kit.control-plane.worker-journal-storage-segment.v1',
    storageVersion: value.storageVersion,
    keyHash: value.keyHash,
    revision: value.revision,
    entry: value.entry,
  })
}

function segmentName(revision: number): string {
  return `${revision.toString().padStart(16, '0')}.json`
}

function assertRevision(value: unknown): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS
  ) fail('REVISION_OVERFLOW', 'journal revision')
}

function assertStoredRevision(value: unknown): asserts value is number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS
  ) fail('CORRUPT_HISTORY', 'journal revision')
}

function assertNoLinkSegments(target: string, ops: NodeControlPlaneWorkerJournalFileOps): void {
  const root = path.parse(target).root
  let cursor = root
  const relative = path.relative(root, target)
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    if (ops.existsSync(cursor) && ops.lstatSync(cursor).isSymbolicLink()) fail('INVALID_PATH', 'journal directory')
  }
}

function resolveRoot(rootDirectory: unknown, ops: NodeControlPlaneWorkerJournalFileOps): string {
  if (typeof rootDirectory !== 'string' || !path.isAbsolute(rootDirectory)) fail('INVALID_PATH', 'journal directory')
  const resolved = path.normalize(rootDirectory)
  if (resolved === path.parse(resolved).root) fail('INVALID_PATH', 'journal directory')
  try {
    assertNoLinkSegments(resolved, ops)
    ops.mkdirSync(resolved, { recursive: true, mode: 0o700 })
    assertNoLinkSegments(resolved, ops)
    const stat = ops.lstatSync(resolved)
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('INVALID_PATH', 'journal directory')
  } catch (error) {
    if (error instanceof NodeControlPlaneWorkerJournalStorageError) throw error
    fail('STORAGE_UNAVAILABLE', 'journal directory')
  }
  return resolved
}

function recordDirectory(root: string, hash: string): string {
  return path.join(root, hash.slice(0, 2), hash)
}

function parseWrapper(text: string, expectedHash: string, expectedRevision: number): StorageWrapper {
  if (Buffer.byteLength(text, 'utf8') > CONTROL_PLANE_WORKER_JOURNAL_STORAGE_MAX_SEGMENT_BYTES) {
    fail('CORRUPT_HISTORY', 'journal segment')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('CORRUPT_HISTORY', 'journal segment')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    fail('CORRUPT_HISTORY', 'journal segment')
  }
  const record = parsed as Record<string, unknown>
  exactKeys(record, WRAPPER_KEYS, 'journal segment')
  if (record.storageVersion !== CONTROL_PLANE_WORKER_JOURNAL_STORAGE_VERSION) fail('CORRUPT_HISTORY', 'journal segment')
  if (record.keyHash !== expectedHash || typeof record.keyHash !== 'string' || !LOWER_HASH.test(record.keyHash)) {
    fail('CORRUPT_HISTORY', 'journal segment')
  }
  if (record.revision !== expectedRevision) fail('CORRUPT_HISTORY', 'journal segment')
  assertStoredRevision(record.revision)
  if (!record.entry || typeof record.entry !== 'object' || Array.isArray(record.entry)) fail('CORRUPT_HISTORY', 'journal segment')
  const entryRevision = (record.entry as Record<string, unknown>).journalRevision
  if (entryRevision !== record.revision) fail('CORRUPT_HISTORY', 'journal segment')
  if (typeof record.digest !== 'string' || !LOWER_HASH.test(record.digest)) fail('CORRUPT_HISTORY', 'journal segment')
  const withoutDigest: Omit<StorageWrapper, 'digest'> = {
    storageVersion: CONTROL_PLANE_WORKER_JOURNAL_STORAGE_VERSION,
    keyHash: record.keyHash,
    revision: record.revision,
    entry: record.entry,
  }
  if (record.digest !== sha256(wrapperContent(withoutDigest))) fail('CORRUPT_HISTORY', 'journal segment')
  return {
    ...withoutDigest,
    digest: record.digest,
  }
}

function readLatest(
  root: string,
  key: ControlPlaneWorkerJournalKey,
  ops: NodeControlPlaneWorkerJournalFileOps,
): unknown | null {
  const hash = keyHash(key)
  const directory = recordDirectory(root, hash)
  try {
    if (!ops.existsSync(directory)) return null
    assertNoLinkSegments(directory, ops)
    const stat = ops.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CORRUPT_HISTORY', 'journal history')
    const segments: Array<{ name: string; revision: number }> = []
    for (const entry of ops.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) fail('CORRUPT_HISTORY', 'journal history')
      if (TEMPORARY.test(entry.name)) continue
      const match = SEGMENT.exec(entry.name)
      if (!match) fail('CORRUPT_HISTORY', 'journal history')
      const revision = Number(match[1])
      assertStoredRevision(revision)
      segments.push({ name: entry.name, revision })
    }
    segments.sort((left, right) => left.revision - right.revision)
    if (segments.length === 0) return null
    if (segments.length > CONTROL_PLANE_WORKER_JOURNAL_MAX_REVISIONS) fail('CORRUPT_HISTORY', 'journal history')
    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index].revision !== index + 1) fail('CORRUPT_HISTORY', 'journal history')
    }
    let latest: StorageWrapper | null = null
    for (const segment of segments) {
      const text = ops.readFileSync(path.join(directory, segment.name), 'utf8')
      latest = parseWrapper(text, hash, segment.revision)
    }
    return latest?.entry ?? null
  } catch (error) {
    if (error instanceof NodeControlPlaneWorkerJournalStorageError) throw error
    fail('STORAGE_UNAVAILABLE', 'journal read')
  }
}

function revisionOf(value: unknown | null): number | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CORRUPT_HISTORY', 'journal entry')
  const revision = (value as Record<string, unknown>).journalRevision
  assertStoredRevision(revision)
  return revision
}

function publish(
  root: string,
  key: ControlPlaneWorkerJournalKey,
  expectedRevision: number | null,
  next: ControlPlaneWorkerJournalEntry,
  ops: NodeControlPlaneWorkerJournalFileOps,
  entropy: () => string,
): 'committed' | 'conflict' {
  const current = readLatest(root, key, ops)
  if (revisionOf(current) !== expectedRevision) return 'conflict'
  const expectedNext = expectedRevision === null ? 1 : expectedRevision + 1
  assertRevision(expectedNext)
  if (!next || typeof next !== 'object' || next.journalRevision !== expectedNext) {
    fail('REVISION_OVERFLOW', 'journal revision')
  }

  const hash = keyHash(key)
  const withoutDigest: Omit<StorageWrapper, 'digest'> = {
    storageVersion: CONTROL_PLANE_WORKER_JOURNAL_STORAGE_VERSION,
    keyHash: hash,
    revision: expectedNext,
    entry: next,
  }
  const wrapper: StorageWrapper = {
    ...withoutDigest,
    digest: sha256(wrapperContent(withoutDigest)),
  }
  let encoded: string
  try {
    encoded = `${JSON.stringify(wrapper)}\n`
  } catch {
    fail('STORAGE_UNAVAILABLE', 'journal serialization')
  }
  if (Buffer.byteLength(encoded, 'utf8') > CONTROL_PLANE_WORKER_JOURNAL_STORAGE_MAX_SEGMENT_BYTES) {
    fail('ENTRY_TOO_LARGE', 'journal segment')
  }

  const directory = recordDirectory(root, hash)
  try {
    ops.mkdirSync(directory, { recursive: true, mode: 0o700 })
    assertNoLinkSegments(directory, ops)
    const nonce = entropy()
    if (typeof nonce !== 'string' || !ENTROPY.test(nonce)) fail('STORAGE_UNAVAILABLE', 'journal entropy')
    const temporary = path.join(directory, `.${nonce}.tmp`)
    const committed = path.join(directory, segmentName(expectedNext))
    let descriptor: number | null = null
    let closed = false
    try {
      descriptor = ops.openSync(temporary, 'wx', 0o600)
      ops.writeFileSync(descriptor, encoded, { encoding: 'utf8' })
      ops.fsyncSync(descriptor)
      ops.closeSync(descriptor)
      closed = true
      try {
        ops.linkSync(temporary, committed)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 'conflict'
        throw error
      } finally {
        if (ops.existsSync(temporary)) ops.unlinkSync(temporary)
      }
      return 'committed'
    } catch (error) {
      if (descriptor !== null && !closed) {
        try { ops.closeSync(descriptor) } catch { /* best-effort descriptor cleanup */ }
      }
      try {
        if (ops.existsSync(temporary)) ops.unlinkSync(temporary)
      } catch { /* retain the original closed storage result */ }
      throw error
    }
  } catch (error) {
    if (error instanceof NodeControlPlaneWorkerJournalStorageError) throw error
    fail('STORAGE_UNAVAILABLE', 'journal commit')
  }
}

export function createDisposableNodeControlPlaneWorkerJournal(
  options: DisposableNodeControlPlaneWorkerJournalOptions,
): ControlPlaneWorkerJournalPort {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_PATH', 'journal options')
  const ops: NodeControlPlaneWorkerJournalFileOps = { ...DEFAULT_FILE_OPS, ...options.fileOps }
  const root = resolveRoot(options.rootDirectory, ops)
  const entropy = options.entropy ?? (() => randomBytes(16).toString('hex'))
  return Object.freeze({
    async load(keyInput: ControlPlaneWorkerJournalKey): Promise<unknown | null> {
      return readLatest(root, validateKey(keyInput), ops)
    },
    async compareAndSet(
      keyInput: ControlPlaneWorkerJournalKey,
      expectedRevision: number | null,
      next: ControlPlaneWorkerJournalEntry,
    ): Promise<{ readonly status: 'committed' | 'conflict' }> {
      if (expectedRevision !== null) assertRevision(expectedRevision)
      const status = publish(root, validateKey(keyInput), expectedRevision, next, ops, entropy)
      return Object.freeze({ status })
    },
  })
}
