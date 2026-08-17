#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  INTERNAL_MARKER_REGISTRY_PATH,
  PUBLIC_RELEASE_MANIFEST_PATH,
  evaluatePublicReleaseCandidate,
  normalizeRepositoryPath,
  type CandidateFile,
  type PublicReleaseEvaluation,
  type Sha256Port,
} from './public-release-contract'

export const PUBLIC_RELEASE_CONTRACT_SENTINEL = '@@PUBLIC_RELEASE_CONTRACT@@' as const

const MAX_GIT_INDEX_BYTES = 16 * 1024 * 1024
const MAX_GIT_INDEX_RECORDS = 10_000
const MAX_INDEX_BLOB_BYTES = 8_388_608
const MAX_CANDIDATE_BYTES = 268_435_456
const MAX_GIT_BATCH_BYTES = MAX_CANDIDATE_BYTES + (MAX_GIT_INDEX_RECORDS * 160)
const GIT_INDEX_RECORD = /^(\d{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])\t([\s\S]+)$/

export interface GitIndexRecord {
  mode: string
  objectId: string
  stage: number
  path: string
}

export interface PublicReleaseNodePorts {
  listGitIndex(repositoryRoot: string): Uint8Array
  lstat(absolutePath: string): { kind: 'file' | 'directory' | 'symlink' | 'other' | 'missing' }
  readIndexBlobs(repositoryRoot: string, objectIds: string[]): Map<string, Uint8Array>
}

export interface RunPublicReleaseContractOptions {
  repositoryRoot: string
  ports?: PublicReleaseNodePorts
}

export const nodeSha256: Sha256Port = (value) => crypto.createHash('sha256').update(value).digest('hex')

function decodeGitIndex(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Git index output is not valid UTF-8')
  }
}

export function parseGitIndexRecords(bytes: Uint8Array): GitIndexRecord[] {
  if (!(bytes instanceof Uint8Array)) throw new Error('Git index output must be bytes')
  if (bytes.byteLength > MAX_GIT_INDEX_BYTES) throw new Error('Git index output exceeds the bounded adapter limit')
  if (bytes.byteLength === 0) return []
  if (bytes[bytes.byteLength - 1] !== 0) throw new Error('Git index output must be NUL terminated')
  const decoded = decodeGitIndex(bytes)
  const rawRecords = decoded.split('\0')
  if (rawRecords.pop() !== '') throw new Error('Git index output has a malformed terminator')
  const records = rawRecords.map((record, index): GitIndexRecord => {
    const match = GIT_INDEX_RECORD.exec(record)
    if (!match) throw new Error(`Git index record ${index} is malformed`)
    const stage = Number(match[3])
    if (stage !== 0) throw new Error(`Git index record ${index} has unresolved stage state`)
    const normalizedPath = normalizeRepositoryPath(match[4], `Git index record ${index} candidate path`)
    return { mode: match[1], objectId: match[2], stage, path: normalizedPath }
  })
  if (records.length > MAX_GIT_INDEX_RECORDS) throw new Error('Git index record limit is 10,000')
  const paths = records.map((record) => record.path)
  if (new Set(paths).size !== paths.length) throw new Error('Git index output contains duplicate paths')
  return records
}

function findLf(bytes: Uint8Array, start: number): number {
  for (let index = start; index < bytes.byteLength; index += 1) if (bytes[index] === 10) return index
  return -1
}

export function parseGitBatchBlobs(bytes: Uint8Array, expectedObjectIds: string[]): Map<string, Uint8Array> {
  if (!(bytes instanceof Uint8Array)) throw new Error('Git batch output must be bytes')
  if (bytes.byteLength > MAX_GIT_BATCH_BYTES) throw new Error('Git batch output exceeds the bounded adapter limit')
  const blobs = new Map<string, Uint8Array>()
  let offset = 0
  let total = 0
  for (const expectedObjectId of expectedObjectIds) {
    const headerEnd = findLf(bytes, offset)
    if (headerEnd < 0) throw new Error('Git batch output has a truncated header')
    let header: string
    try {
      header = new TextDecoder('ascii', { fatal: true }).decode(bytes.subarray(offset, headerEnd))
    } catch {
      throw new Error('Git batch output header is invalid')
    }
    const match = /^([a-f0-9]{40}|[a-f0-9]{64}) blob ([0-9]+)$/.exec(header)
    if (!match || match[1] !== expectedObjectId) throw new Error('Git batch output object identity/type mismatch')
    const size = Number(match[2])
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_INDEX_BLOB_BYTES) {
      throw new Error('Git batch blob exceeds the bounded file limit')
    }
    const contentStart = headerEnd + 1
    const contentEnd = contentStart + size
    if (contentEnd >= bytes.byteLength || bytes[contentEnd] !== 10) throw new Error('Git batch output has truncated blob content')
    total += size
    if (total > MAX_CANDIDATE_BYTES) throw new Error('Git batch output exceeds the bounded candidate limit')
    blobs.set(expectedObjectId, Uint8Array.from(bytes.subarray(contentStart, contentEnd)))
    offset = contentEnd + 1
  }
  if (offset !== bytes.byteLength) throw new Error('Git batch output contains undeclared trailing data')
  return blobs
}

function classifyStat(stat: fs.Stats): ReturnType<PublicReleaseNodePorts['lstat']> {
  if (stat.isSymbolicLink()) return { kind: 'symlink' }
  if (stat.isFile()) return { kind: 'file' }
  if (stat.isDirectory()) return { kind: 'directory' }
  return { kind: 'other' }
}

const defaultPorts: PublicReleaseNodePorts = {
  listGitIndex(repositoryRoot) {
    const result = spawnSync('git', ['ls-files', '--stage', '-z'], {
      cwd: repositoryRoot,
      encoding: null,
      shell: false,
      windowsHide: true,
      maxBuffer: MAX_GIT_INDEX_BYTES,
      timeout: 30_000,
    })
    if (result.error || result.status !== 0 || !(result.stdout instanceof Uint8Array)) {
      throw new Error('Git index command failed')
    }
    return result.stdout
  },
  lstat(absolutePath) {
    try {
      return classifyStat(fs.lstatSync(absolutePath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
      throw error
    }
  },
  readIndexBlobs(repositoryRoot, objectIds) {
    if (objectIds.length === 0) return new Map()
    const result = spawnSync('git', ['cat-file', '--batch'], {
      cwd: repositoryRoot,
      input: `${objectIds.join('\n')}\n`,
      encoding: null,
      shell: false,
      windowsHide: true,
      maxBuffer: MAX_GIT_BATCH_BYTES,
      timeout: 60_000,
    })
    if (result.error || result.status !== 0 || !(result.stdout instanceof Uint8Array)) {
      throw new Error('Git batch blob command failed')
    }
    return parseGitBatchBlobs(result.stdout, objectIds)
  },
}

function assertWithin(repositoryRoot: string, candidate: string): void {
  const relative = path.relative(repositoryRoot, candidate)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) return
  throw new Error('candidate path escapes the repository root')
}

function inspectAncestors(
  repositoryRoot: string,
  relativePath: string,
  ports: PublicReleaseNodePorts,
): string {
  const root = path.resolve(repositoryRoot)
  let current = root
  const rootStat = ports.lstat(root)
  if (rootStat.kind === 'symlink') throw new Error('repository root is a symlink or reparse point')
  if (rootStat.kind !== 'directory') throw new Error('repository root is not a readable directory')
  const segments = relativePath.split('/')
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    assertWithin(root, current)
    const stat = ports.lstat(current)
    const final = index === segments.length - 1
    if (stat.kind === 'symlink') throw new Error('tracked path contains a symlink or reparse point')
    if (stat.kind === 'missing') throw new Error(final ? 'tracked file is missing' : 'tracked ancestor is missing')
    if (final && stat.kind !== 'file') throw new Error('tracked path is not a regular file')
    if (!final && stat.kind !== 'directory') throw new Error('tracked ancestor is not a directory')
  }
  return current
}

export function loadGitIndexCandidate(
  repositoryRoot: string,
  ports: PublicReleaseNodePorts = defaultPorts,
): CandidateFile[] {
  let indexBytes: Uint8Array
  try {
    indexBytes = ports.listGitIndex(path.resolve(repositoryRoot))
  } catch {
    throw new Error('Git index discovery failed')
  }
  const records = parseGitIndexRecords(indexBytes)
  for (const record of records) inspectAncestors(repositoryRoot, record.path, ports)
  const objectIds = [...new Set(records.map((record) => record.objectId))]
  let blobs: Map<string, Uint8Array>
  try {
    blobs = ports.readIndexBlobs(path.resolve(repositoryRoot), objectIds)
  } catch {
    throw new Error('tracked file read failed: Git index blob batch')
  }
  if (blobs.size !== objectIds.length || objectIds.some((objectId) => !blobs.has(objectId))) {
    throw new Error('tracked file read failed: Git index blob set is incomplete')
  }
  return records.map((record): CandidateFile => {
    const bytes = blobs.get(record.objectId)
    if (!(bytes instanceof Uint8Array)) throw new Error(`tracked file read returned invalid bytes: ${record.path}`)
    return {
      path: record.path,
      gitMode: record.mode,
      bytes,
      reparsePoint: false,
    }
  })
}

export function runPublicReleaseContract(options: RunPublicReleaseContractOptions): PublicReleaseEvaluation {
  const files = loadGitIndexCandidate(options.repositoryRoot, options.ports ?? defaultPorts)
  const manifest = files.find((file) => file.path === PUBLIC_RELEASE_MANIFEST_PATH)
  const registry = files.find((file) => file.path === INTERNAL_MARKER_REGISTRY_PATH)
  if (!manifest || !registry) throw new Error('public release contract files are missing from the Git index')
  return evaluatePublicReleaseCandidate({
    manifestBytes: manifest.bytes,
    registryBytes: registry.bytes,
    files,
    sha256: nodeSha256,
  })
}

function adapterFailure(): PublicReleaseEvaluation {
  return {
    contractValid: false,
    candidateStatus: 'blocked',
    includedPaths: 0,
    excludedPaths: 0,
    classifiedOccurrences: 0,
    blockers: [{ code: 'node-adapter-failure' }],
  }
}

function parseArgs(args: string[]): { repositoryRoot: string; requireEligible: boolean } {
  let repositoryRoot = process.cwd()
  let requireEligible = false
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--repository-root' && args[index + 1]) {
      repositoryRoot = path.resolve(args[index + 1])
      index += 1
    } else if (args[index] === '--require-eligible') {
      requireEligible = true
    } else {
      throw new Error('usage: public-release-contract-node [--repository-root <path>] [--require-eligible]')
    }
  }
  return { repositoryRoot, requireEligible }
}

function main(): void {
  let parsed: { repositoryRoot: string; requireEligible: boolean }
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'invalid arguments'}\n`)
    process.exitCode = 2
    return
  }
  let result: PublicReleaseEvaluation
  try {
    result = runPublicReleaseContract({ repositoryRoot: parsed.repositoryRoot })
  } catch {
    result = adapterFailure()
  }
  process.stdout.write(`${PUBLIC_RELEASE_CONTRACT_SENTINEL}${JSON.stringify(result)}\n`)
  process.exitCode = result.contractValid && (!parsed.requireEligible || result.candidateStatus === 'eligible-for-later-gates') ? 0 : 1
}

if (require.main === module) main()
