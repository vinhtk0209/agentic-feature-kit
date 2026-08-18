import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { SYNCED_CORE_FILES } from './build-synced-core'

const root = process.cwd()
const runtimePaths = [
  '.claude/integrations/telemetry.ts',
  'bin/lib/supabase.ts',
  'scripts/sync-to-targets.ts',
] as const
const sourceManifest = [
  '.claude/integrations/core/legacy-backend-config.ts',
  '.claude/integrations/record-verify.test.ts',
  '.claude/integrations/telemetry.test.ts',
  '.claude/integrations/telemetry.ts',
  'bin/lib/bundle.ts',
  'bin/lib/supabase.ts',
  'bin/lib/supabase.test.ts',
  'docs/claude-commands/INTEGRATIONS.md',
  'docs/roadmap/p17-016-kit-writer-registry.json',
  'docs/roadmap/p17-018-r4a-legacy-backend-config-plan.md',
  'package.json',
  'packages/core/src/legacy-backend-config.ts',
  'packages/core/test/legacy-backend-config.test.ts',
  'release/internal-marker-classification.json',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-public-release-r4a-plan.test.ts',
  'scripts/public-release-contract-node.test.ts',
  'scripts/public-release-legacy-backend-contract.test.ts',
  'scripts/sync-to-targets.ts',
  'scripts/sync-verify-guard.test.ts',
] as const
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
const LIVE_PROJECT_URL = /https:\/\/[a-z]{20}\.supabase\.co\b/g

interface MarkerOccurrence {
  path: string
  expectedCount: number
  disposition: string
}

interface Marker {
  id: string
  expectedTotal: number
  occurrences: MarkerOccurrence[]
}

let passed = 0
let failed = 0

function test(name: string, body: () => void): void {
  try {
    body()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0
  return pattern.test(value)
}

test('detectors have positive controls without storing a candidate credential', () => {
  const jwtControl = ['eyJsyntheticHeader', 'eyJsyntheticPayload', 'syntheticSignature'].join('.')
  const urlControl = ['https:/', '/abcdefghijklmnopqrst', '.supabase.co'].join('')
  assert.equal(matches(JWT_LIKE, jwtControl), true)
  assert.equal(matches(LIVE_PROJECT_URL, urlControl), true)
  const source = read('scripts/public-release-legacy-backend-contract.test.ts')
  assert.equal(matches(JWT_LIKE, source), false)
  assert.equal(matches(LIVE_PROJECT_URL, source), false)
})

test('canonical config and portable mirror are byte-identical and registered', () => {
  const file = 'legacy-backend-config.ts'
  assert.ok(SYNCED_CORE_FILES.includes(file))
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'packages', 'core', 'src', file)),
    fs.readFileSync(path.join(root, '.claude', 'integrations', 'core', file)),
  )
})

test('three runtime adapters contain no embedded backend endpoint or credential', () => {
  for (const relativePath of runtimePaths) {
    const source = read(relativePath)
    assert.equal(matches(JWT_LIKE, source), false, `${relativePath}: embedded JWT-like credential`)
    assert.equal(matches(LIVE_PROJECT_URL, source), false, `${relativePath}: embedded live project URL`)
    for (const pattern of [
      /const\s+SUPABASE_URL\s*=/,
      /const\s+SUPABASE_ANON_KEY\s*=/,
      /FALLBACK_SUPABASE_URL/,
      /FALLBACK_SUPABASE_ANON_KEY/,
    ]) assert.doesNotMatch(source, pattern, `${relativePath}: embedded fallback authority`)
    assert.match(source, /resolveLegacyBackendConfig/, `${relativePath}: paired resolver not wired`)
  }
})

test('marker registry records only the eight deferred live-project occurrences', () => {
  const registry = JSON.parse(read('release/internal-marker-classification.json')) as { markers: Marker[] }
  const marker = registry.markers.find((candidate) => candidate.id === 'live-supabase-project-ref')
  assert.ok(marker)
  assert.equal(marker.expectedTotal, 8)
  assert.equal(marker.occurrences.length, 7)
  assert.equal(marker.occurrences.reduce((sum, occurrence) => sum + occurrence.expectedCount, 0), 8)
  for (const relativePath of runtimePaths) {
    assert.equal(marker.occurrences.some((occurrence) => occurrence.path === relativePath), false)
  }

  const bindings = registry.markers.flatMap((candidate) => candidate.occurrences)
  assert.equal(bindings.length, 28)
  assert.equal(registry.markers.reduce((sum, candidate) => sum + candidate.expectedTotal, 0), 70)
  const dispositions = bindings.reduce<Record<string, { bindings: number; occurrences: number }>>((result, occurrence) => {
    result[occurrence.disposition] ??= { bindings: 0, occurrences: 0 }
    result[occurrence.disposition].bindings += 1
    result[occurrence.disposition].occurrences += occurrence.expectedCount
    return result
  }, {})
  assert.deepEqual(dispositions, {
    genericize: { bindings: 16, occurrences: 40 },
    'move-to-private-archive': { bindings: 6, occurrences: 6 },
    'replace-with-synthetic-fixture': { bindings: 6, occurrences: 24 },
  })
})

test('integration guide documents env-only and asymmetric failure boundaries', () => {
  const guide = read('docs/claude-commands/INTEGRATIONS.md')
  assert.equal(/SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied at runtime as one required pair/.test(guide), true, 'missing paired-env guidance')
  assert.equal(/optional telemetry remains local-first and performs no fetch when the pair is unavailable/i.test(guide), true, 'missing optional-telemetry boundary')
  assert.equal(/workflow CLI and real sync verification remain fail-closed/.test(guide), true, 'missing fail-closed CLI/sync boundary')
  assert.equal(/key (?:is|remains) embedded/i.test(guide), false, 'guide still claims an embedded key')
})

test('release manifest includes every R4A source path as public text', () => {
  const manifest = JSON.parse(read('release/public-release-manifest.json')) as {
    entries: Array<{ path: string; contentKind: string; decision: string }>
  }
  const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  for (const relativePath of sourceManifest) {
    const entry = byPath.get(relativePath)
    assert.equal(entry?.path, relativePath, `manifest path missing: ${relativePath}`)
    assert.equal(entry?.contentKind, 'text', `manifest content kind drift: ${relativePath}`)
    assert.equal(entry?.decision, 'include', `manifest decision drift: ${relativePath}`)
  }
})

test('package routes focused config and release-boundary gates into the full kit', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
  assert.equal(pkg.scripts['test:legacy-backend-config'], 'npx tsx packages/core/test/legacy-backend-config.test.ts')
  assert.equal(pkg.scripts['test:public-release-legacy-backend-contract'], 'npx tsx scripts/public-release-legacy-backend-contract.test.ts')
  for (const command of ['test:legacy-backend-config', 'test:public-release-legacy-backend-contract']) {
    assert.ok(pkg.scripts['test:kit'].includes(`npm run ${command}`), `full-kit route missing: ${command}`)
  }
})

console.log(`public-release-legacy-backend-contract.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
