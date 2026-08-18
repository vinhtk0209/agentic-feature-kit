import fs from 'node:fs'
import path from 'node:path'

export const TRACKED_SYNC_CONFIG_NAME = 'sync.config.json'
export const LOCAL_SYNC_CONFIG_NAME = 'sync.config.local.json'

export interface SyncConfig {
  readonly targets: readonly string[]
  readonly syncPaths: readonly string[]
}

export type SyncConfigSource = 'local' | 'tracked'

export interface LoadedSyncConfig {
  readonly config: SyncConfig
  readonly path: string
  readonly source: SyncConfigSource
}

export type SyncConfigErrorCode =
  | 'missing-config'
  | 'invalid-json'
  | 'invalid-shape'
  | 'invalid-targets'
  | 'invalid-sync-paths'
  | 'unsafe-target'
  | 'unsafe-sync-path'

export class SyncConfigError extends Error {
  readonly code: SyncConfigErrorCode

  constructor(code: SyncConfigErrorCode, message: string) {
    super(message)
    this.name = 'SyncConfigError'
    this.code = code
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactShape(value: unknown, filename: string): asserts value is {
  targets: unknown
  syncPaths: unknown
} {
  if (!isPlainObject(value)) {
    throw new SyncConfigError('invalid-shape', `${filename}: expected an object`)
  }

  const keys = Object.keys(value).sort()
  if (keys.length !== 2 || keys[0] !== 'syncPaths' || keys[1] !== 'targets') {
    throw new SyncConfigError('invalid-shape', `${filename}: expected only targets and syncPaths`)
  }
}

function assertStringList(
  value: unknown,
  filename: string,
  field: 'targets' | 'syncPaths',
): asserts value is string[] {
  const code = field === 'targets' ? 'invalid-targets' : 'invalid-sync-paths'
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new SyncConfigError(code, `${filename}: ${field} must be a non-empty string array`)
  }
  if (new Set(value).size !== value.length) {
    throw new SyncConfigError(code, `${filename}: ${field} must not contain duplicates`)
  }
}

function assertSafeTarget(target: string, filename: string): void {
  if (
    target.trim() !== target
    || target.includes('\\')
    || target.includes('\0')
    || target.includes(':')
    || !target.startsWith('../')
  ) {
    throw new SyncConfigError('unsafe-target', `${filename}: target must use one explicit parent boundary`)
  }

  const remainder = target.slice(3)
  const segments = remainder.split('/')
  if (segments.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new SyncConfigError('unsafe-target', `${filename}: target contains an unsafe path segment`)
  }
}

function assertSafeSyncPath(syncPath: string, filename: string): void {
  if (
    syncPath.trim() !== syncPath
    || syncPath.includes('\\')
    || syncPath.includes('\0')
    || syncPath.includes(':')
    || syncPath.startsWith('/')
  ) {
    throw new SyncConfigError('unsafe-sync-path', `${filename}: sync path must be repository-relative`)
  }

  const normalized = syncPath.endsWith('/') ? syncPath.slice(0, -1) : syncPath
  const segments = normalized.split('/')
  if (normalized.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new SyncConfigError('unsafe-sync-path', `${filename}: sync path contains an unsafe path segment`)
  }
}

export function selectSyncConfigPath(root: string): string {
  const localPath = path.join(root, LOCAL_SYNC_CONFIG_NAME)
  if (fs.existsSync(localPath)) return localPath

  const trackedPath = path.join(root, TRACKED_SYNC_CONFIG_NAME)
  if (fs.existsSync(trackedPath)) return trackedPath

  throw new SyncConfigError(
    'missing-config',
    `Missing ${LOCAL_SYNC_CONFIG_NAME} and ${TRACKED_SYNC_CONFIG_NAME}`,
  )
}

export function loadSyncConfig(root: string): LoadedSyncConfig {
  const configPath = selectSyncConfigPath(root)
  const filename = path.basename(configPath)
  let parsed: unknown

  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : 'could not be read'
    throw new SyncConfigError('invalid-json', `${filename}: ${detail}`)
  }

  assertExactShape(parsed, filename)
  assertStringList(parsed.targets, filename, 'targets')
  assertStringList(parsed.syncPaths, filename, 'syncPaths')
  parsed.targets.forEach((target) => assertSafeTarget(target, filename))
  parsed.syncPaths.forEach((syncPath) => assertSafeSyncPath(syncPath, filename))

  const config = Object.freeze({
    targets: Object.freeze([...parsed.targets]),
    syncPaths: Object.freeze([...parsed.syncPaths]),
  })

  return Object.freeze({
    config,
    path: configPath,
    source: filename === LOCAL_SYNC_CONFIG_NAME ? 'local' : 'tracked',
  })
}
