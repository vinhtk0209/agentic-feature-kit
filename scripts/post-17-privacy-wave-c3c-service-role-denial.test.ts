import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const kitRoot = path.resolve(__dirname, '..')
const dashboardRoot = path.resolve(kitRoot, '..', 'kit-dashboard')
const readKit = (relative: string) => fs.readFileSync(path.join(kitRoot, relative), 'utf8')
const readDashboard = (relative: string) => fs.readFileSync(path.join(dashboardRoot, relative), 'utf8')

const baselineConsumers = [
  'src/app/activity/page.tsx',
  'src/app/api/bypass/[id]/route.ts',
  'src/app/api/bypass/route.ts',
  'src/app/api/data/errors/route.ts',
  'src/app/api/data/installs/route.ts',
  'src/app/api/data/repo-runs/route.ts',
  'src/app/api/data/version-metrics/route.ts',
  'src/app/api/data/version-usage/route.ts',
  'src/app/api/deploy/route.ts',
  'src/app/api/health/route.ts',
  'src/app/api/roles/route.ts',
  'src/app/api/run/preflight/route.ts',
  'src/app/api/run/retry/route.ts',
  'src/app/api/tokens/[id]/route.ts',
  'src/app/api/tokens/route.ts',
  'src/app/bypass/page.tsx',
  'src/app/deploy/page.tsx',
  'src/app/orchestrator/page.tsx',
  'src/app/page.tsx',
  'src/app/performance/page.tsx',
  'src/app/roles/page.tsx',
  'src/app/run/compare/page.tsx',
  'src/app/tokens/[id]/page.tsx',
  'src/app/tokens/page.tsx',
  'src/app/usage/page.tsx',
  'src/app/version-analysis/page.tsx',
  'src/features/roadmap-progress/infrastructure/supabase-progress-ledger.ts',
  'src/lib/rbac.ts',
] as const

const closedApis = [
  'src/app/api/bypass/[id]/route.ts',
  'src/app/api/bypass/route.ts',
  'src/app/api/data/errors/route.ts',
  'src/app/api/data/installs/route.ts',
  'src/app/api/data/repo-runs/route.ts',
  'src/app/api/data/version-metrics/route.ts',
  'src/app/api/data/version-usage/route.ts',
  'src/app/api/debug/route.ts',
  'src/app/api/deploy/route.ts',
  'src/app/api/health/route.ts',
  'src/app/api/roles/route.ts',
  'src/app/api/run/preflight/route.ts',
  'src/app/api/run/retry/route.ts',
  'src/app/api/tokens/[id]/route.ts',
  'src/app/api/tokens/route.ts',
] as const

const closedPages = [
  'src/app/activity/page.tsx',
  'src/app/bypass/page.tsx',
  'src/app/deploy/page.tsx',
  'src/app/errors/page.tsx',
  'src/app/orchestrator/page.tsx',
  'src/app/page.tsx',
  'src/app/performance/page.tsx',
  'src/app/roles/page.tsx',
  'src/app/run/compare/page.tsx',
  'src/app/tokens/[id]/page.tsx',
  'src/app/tokens/page.tsx',
  'src/app/usage/page.tsx',
  'src/app/version-analysis/page.tsx',
  'src/app/versions/page.tsx',
] as const

const closedWriterIds = [
  'dashboard.identity.bypass-create',
  'dashboard.identity.bypass-revoke',
  'dashboard.identity.deploy-record',
  'dashboard.identity.role-grant',
  'dashboard.identity.role-revoke',
  'dashboard.identity.token-create',
  'dashboard.identity.token-status',
] as const

const oldImport = /from\s+['"]@\/lib\/supabase['"]/
const oldCall = /\b(?:createServerClient|createServiceClient)\s*\(/

function recursiveSources(relativeRoot: string): string[] {
  const output: string[] = []
  for (const entry of fs.readdirSync(path.join(dashboardRoot, relativeRoot), { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name).replace(/\\/g, '/')
    if (entry.isDirectory()) output.push(...recursiveSources(relative))
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) output.push(relative)
  }
  return output
}

function serviceCapabilityErrors(files: ReadonlyMap<string, string>): string[] {
  const errors: string[] = []
  for (const [file, source] of files) {
    if (oldImport.test(source)) errors.push(`old-import:${file}`)
    if (/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(source)) errors.push(`service-key:${file}`)
    if (/@supabase\/supabase-js/.test(source)) errors.push(`service-sdk:${file}`)
    if (/\/rest\/v1\//.test(source)) errors.push(`raw-rest:${file}`)
  }
  return errors
}

assert.equal(baselineConsumers.length, 28, 'C3C baseline must bind exactly 28 former consumers')
assert.equal(closedApis.length, 15, 'C3C must close exactly 15 API source files')
assert.equal(closedPages.length, 14, 'C3C must close exactly 14 page source files')

const normalizedPlan = readKit('docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md')
  .replace(/`/g, '')
  .replace(/\s+/g, ' ')
for (const phrase of [
  '31 invocations across 28 consumer files',
  'inherited 27/30 count omitted the version-metrics route',
  'C3C renders legacy application paths explicitly unavailable',
  'Wave E owns functional tenant-safe reads, actions, and dashboard restoration',
]) assert.ok(normalizedPlan.includes(phrase), `C3C plan missing corrected contract: ${phrase}`)

assert.equal(fs.existsSync(path.join(dashboardRoot, 'src/lib/supabase.ts')), false, 'global service client still exists')
for (const file of [...baselineConsumers, 'src/app/api/debug/route.ts']) {
  assert.ok(fs.existsSync(path.join(dashboardRoot, file)), `missing C3C source ${file}`)
}
for (const file of baselineConsumers) {
  const source = readDashboard(file)
  assert.doesNotMatch(source, oldImport, `old service import remains in ${file}`)
  assert.doesNotMatch(source, oldCall, `old service constructor remains in ${file}`)
  assert.doesNotMatch(source, /\.from\s*\(/, `direct table access remains in ${file}`)
  assert.doesNotMatch(source, /\.rpc\s*\(/, `direct RPC access remains in ${file}`)
}

const productionFiles = [
  ...recursiveSources('src/app'),
  ...recursiveSources('src/lib'),
  ...recursiveSources('src/features'),
  ...recursiveSources('server'),
].filter((file) => !file.includes('/domain/') && !file.includes('/generated/'))
assert.deepEqual(
  serviceCapabilityErrors(new Map(productionFiles.map((file) => [file, readDashboard(file)]))),
  [],
  'unscoped service capability remains in dashboard runtime',
)

for (const file of closedApis) {
  const source = readDashboard(file)
  assert.match(source, /tenantFoundationUnavailable(?:Action)?Response\(\)/i, `missing unavailable response in ${file}`)
  assert.doesNotMatch(source, /NextRequest|request\.json|\.from\s*\(|\.rpc\s*\(|fetch\s*\(/, `closed API consumes input or transport: ${file}`)
}
for (const file of closedPages) {
  const source = readDashboard(file)
  assert.match(source, /await requirePage\(\)/, `closed page is not authenticated: ${file}`)
  assert.match(source, /<TenantFoundationUnavailablePage/, `closed page lacks unavailable view: ${file}`)
  assert.doesNotMatch(source, /\.from\s*\(|\.rpc\s*\(|fetch\s*\(/, `closed page reads transport: ${file}`)
}

const payload = readDashboard('src/features/privacy/application/tenant-foundation-unavailable.ts')
assert.match(payload, /TENANT_FOUNDATION_UNAVAILABLE_CODE = 'tenant_foundation_unavailable'/)
assert.match(payload, /Object\.freeze\(/)
assert.match(payload, /Object\.keys\(record\)\.sort\(\)/)
const response = readDashboard('src/features/privacy/infrastructure/tenant-foundation-unavailable-response.ts')
assert.match(response, /const denied = await authenticate\(\)/)
assert.match(response, /return denied \?\? tenantFoundationUnavailableResponse\(\)/)
const view = readDashboard('src/features/privacy/presentation/tenant-foundation-unavailable.tsx')
assert.match(view, /role="status"/)
assert.match(view, /aria-live="polite"/)

const progress = readDashboard('src/features/roadmap-progress/infrastructure/supabase-progress-ledger.ts')
assert.match(progress, /return \{ ok: false, code: 'storage_unavailable' \}/)
const rbac = readDashboard('src/lib/rbac.ts')
assert.match(rbac, /createAuthServerClient/)
assert.doesNotMatch(rbac, /\.from\s*\(/)
const runClient = readDashboard('src/components/run-client.tsx')
assert.match(runClient, /isTenantFoundationUnavailable/)
assert.match(runClient, /preflightUnavailable/)
assert.match(runClient, /d\.message \|\| d\.error \|\| 'retry failed'/)

const registry = JSON.parse(readDashboard('docs/roadmap/p17-016-dashboard-writer-registry.json')) as {
  entries: Array<Record<string, unknown>>
}
for (const id of closedWriterIds) {
  const entry = registry.entries.find((candidate) => candidate.id === id)
  assert.deepEqual(entry && {
    transport: entry.transport,
    currentPrivacyState: entry.currentPrivacyState,
    targetWave: entry.targetWave,
    disposition: entry.disposition,
    rationaleCode: entry.rationaleCode,
  }, {
    transport: 'in_process',
    currentPrivacyState: 'contract_validated',
    targetWave: 'C3',
    disposition: 'fail_closed',
    rationaleCode: 'tenant_foundation_unavailable',
  }, `incorrect C3C writer transition ${id}`)
}

const attackBase = new Map([['page', readDashboard('src/app/page.tsx')]])
for (const [name, addition, expected] of [
  ['old import', "\nimport { createServerClient } from '@/lib/supabase'", 'old-import:page'],
  ['service key', '\nvoid process.env.SUPABASE_SERVICE_ROLE_KEY', 'service-key:page'],
  ['service SDK', "\nimport { createClient } from '@supabase/supabase-js'", 'service-sdk:page'],
  ['raw REST', "\nvoid '/rest/v1/tokens'", 'raw-rest:page'],
] as const) {
  const attacked = new Map(attackBase)
  attacked.set('page', `${attacked.get('page')}${addition}`)
  assert.ok(serviceCapabilityErrors(attacked).includes(expected), `${name} attack did not produce ${expected}`)
}

const kitPackage = JSON.parse(readKit('package.json')) as { scripts: Record<string, string> }
const dashboardPackage = JSON.parse(readDashboard('package.json')) as { scripts: Record<string, string> }
assert.equal(
  kitPackage.scripts['test:post-17-privacy-wave-c3c-service-role-denial'],
  'npx tsx scripts/post-17-privacy-wave-c3c-service-role-denial.test.ts',
)
assert.ok(kitPackage.scripts['test:kit'].includes('npm run test:post-17-privacy-wave-c3c-service-role-denial'))
assert.equal(
  dashboardPackage.scripts['test:p17-016-c3c-service-role-denial'],
  'vitest run tests/p17-016-c3c-service-role-denial.test.ts',
)

console.log('P17-016 Wave C3C service-role denial: PASS (28/31 baseline, 15 APIs, 14 pages, 7 writers, 4 attacks)')
