#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

export const SYNCED_CORE_FILES = [
  'blocked-central-writer.ts',
  'legacy-backend-config.ts',
  'live-cutover-preflight.ts',
  'live-cutover-preflight-operator.ts',
  'privacy-policy.ts',
  'privacy-writer.ts',
  'project-intelligence.ts',
  'stack-portability.ts',
] as const

export interface SyncedCoreCheck {
  ok: boolean
  missing: string[]
  extra: string[]
  changed: string[]
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function locations(root: string): { sourceRoot: string; targetRoot: string } {
  return {
    sourceRoot: path.join(root, 'packages', 'core', 'src'),
    targetRoot: path.join(root, '.claude', 'integrations', 'core'),
  }
}

export function checkSyncedCore(root: string): SyncedCoreCheck {
  const { sourceRoot, targetRoot } = locations(root)
  const expected = [...SYNCED_CORE_FILES].sort(compareText)
  const actual = fs.existsSync(targetRoot)
    ? fs.readdirSync(targetRoot, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort(compareText)
    : []
  const missing = expected.filter((file) => !actual.includes(file))
  const extra = actual.filter((file) => !expected.includes(file as typeof SYNCED_CORE_FILES[number]))
  const changed = expected.filter((file) => {
    const source = path.join(sourceRoot, file)
    const target = path.join(targetRoot, file)
    return fs.existsSync(source) && fs.existsSync(target) && !fs.readFileSync(source).equals(fs.readFileSync(target))
  })
  for (const file of expected) {
    if (!fs.existsSync(path.join(sourceRoot, file))) throw new Error(`synced-core: canonical source missing: ${file}`)
  }
  return { ok: missing.length === 0 && extra.length === 0 && changed.length === 0, missing, extra, changed }
}

function atomicCopy(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp-${process.pid}`
  try {
    fs.writeFileSync(temporary, fs.readFileSync(source))
    fs.renameSync(temporary, target)
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true })
  }
}

export function writeSyncedCore(root: string): SyncedCoreCheck {
  const { sourceRoot, targetRoot } = locations(root)
  const before = checkSyncedCore(root)
  if (before.extra.length > 0) throw new Error(`synced-core: refuse to overwrite directory with extra files: ${before.extra.join(', ')}`)
  for (const file of SYNCED_CORE_FILES) atomicCopy(path.join(sourceRoot, file), path.join(targetRoot, file))
  return checkSyncedCore(root)
}

function main(argv = process.argv.slice(2)): number {
  if (argv.length !== 1 || !['--check', '--write'].includes(argv[0])) {
    console.error('usage: build-synced-core.ts --check|--write')
    return 2
  }
  try {
    const result = argv[0] === '--write' ? writeSyncedCore(process.cwd()) : checkSyncedCore(process.cwd())
    if (!result.ok) {
      console.error(`synced-core: drift detected missing=${result.missing.join(',') || '-'} extra=${result.extra.join(',') || '-'} changed=${result.changed.join(',') || '-'}`)
      return 1
    }
    console.log(`synced-core: PASS (${SYNCED_CORE_FILES.length} byte-identical files)`)
    return 0
  } catch (error) {
    console.error(`synced-core: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

if (require.main === module) process.exit(main())
