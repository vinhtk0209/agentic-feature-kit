import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  inspectStackPortability,
  STACK_PORTABILITY_SCHEMA_VERSION,
  STACK_PORTABILITY_SENTINEL,
  validateStackPortabilityResult,
} from '../src/stack-portability'
import { inspectProject } from '../src/project-intelligence'

let assertions = 0
let attacks = 0
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-portability-'))
const repositoryRoot = path.resolve(__dirname, '..', '..', '..')

function fixture(name: string, dependencies: Record<string, string>, files: Record<string, string> = {}): string {
  const root = path.join(scratch, name)
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ name, private: true, dependencies }, null, 2)}\n`)
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify({ name, lockfileVersion: 3 })}\n`)
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  return root
}

function refingerprintProfile(profile: ReturnType<typeof inspectProject>): ReturnType<typeof inspectProject> {
  const { repository, ...payload } = profile
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ ...payload, repository: { rootName: repository.rootName } })).digest('hex')
  return { ...payload, repository: { rootName: repository.rootName, fingerprint } }
}

function pass(name: string, fn: () => void): void {
  try {
    fn()
    assertions += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  }
}

function attack(name: string, fn: () => void): void {
  try {
    fn()
    attacks += 1
    console.log(`PASS attack: ${name}`)
  } catch (error) {
    console.error(`FAIL attack: ${name}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  }
}

const openedx = fixture('openedx-react', {
  react: '19.0.0',
  'react-dom': '19.0.0',
  '@edx/frontend-platform': '9.0.0',
  '@openedx/paragon': '23.0.0',
  '@tanstack/react-query': '5.0.0',
  'react-intl': '7.0.0',
  sass: '1.0.0',
}, {
  'src/report/data/api.ts': [
    "import { camelCaseObject, snakeCaseObject } from '@edx/frontend-platform';",
    "import { getHttpClient } from '@edx/frontend-platform/auth';",
    "export async function loadReport() { const { data } = await getHttpClient().get('/api/report'); return camelCaseObject(data); }",
    "export async function saveReport(value: unknown) { return getHttpClient().post('/api/report', snakeCaseObject(value)); }",
  ].join('\n'),
})

const genericReact = fixture('generic-react', {
  react: '19.0.0',
  'react-dom': '19.0.0',
  axios: '1.0.0',
}, {
  'src/report/api.ts': "import axios from 'axios'; export const load = () => axios.get('/reports');",
})

const vue = fixture('vue-app', {
  vue: '3.0.0',
  pinia: '2.0.0',
  axios: '1.0.0',
  'vue-i18n': '10.0.0',
}, {
  'src/features/report/api/report.ts': "import axios from 'axios'; export const load = () => axios.get('/reports');",
  'src/features/report/Report.vue': '<template><main>Report</main></template>',
})

const reactNative = fixture('react-native-app', {
  react: '19.0.0',
  'react-native': '0.76.0',
  '@tanstack/react-query': '5.0.0',
  axios: '1.0.0',
}, {
  'src/report/api.ts': "import axios from 'axios'; export const load = () => axios.get('/reports');",
  'src/report/Report.tsx': 'export const Report = () => null;',
})

const angular = fixture('angular-app', {
  '@angular/core': '19.0.0',
  '@tanstack/react-query': '5.0.0',
}, {
  'src/app/report/report.component.ts': 'export class ReportComponent {}',
})

const unsupported = fixture('svelte-app', { svelte: '5.0.0' }, {
  'src/App.svelte': '<main>Unsupported fixture</main>',
})

pass('Open edX helpers activate only from observed imports and calls', () => {
  const result = inspectStackPortability(openedx)
  assert.equal(result.status, 'ready')
  assert.equal(result.framework.adapter, 'react-web')
  assert.deepEqual(result.conventions.http, {
    state: 'observed', adapter: 'openedx-get-http-client', symbol: 'getHttpClient', targetSpecific: true,
    evidence: ['source:src/report/data/api.ts#getHttpClient'],
  })
  assert.equal(result.conventions.responseTransform.adapter, 'openedx-camel-case')
  assert.equal(result.conventions.requestTransform.adapter, 'openedx-snake-case')
  assert.equal(result.assumptions.find((entry) => entry.id === 'paragon-ui')?.active, true)
})

pass('generic React keeps its own transport and generic mapper policy', () => {
  const result = inspectStackPortability(genericReact)
  assert.equal(result.status, 'ready')
  assert.equal(result.framework.adapter, 'react-web')
  assert.equal(result.conventions.http.adapter, 'axios')
  assert.equal(result.conventions.responseTransform.adapter, null)
  assert.equal(result.conventions.mappingPolicy, 'named-feature-mapper')
  assert.ok(result.assumptions.every((entry) => entry.active === false))
})

pass('Vue receives a Vue fallback layout without React component assumptions', () => {
  const result = inspectStackPortability(vue)
  assert.equal(result.status, 'ready')
  assert.equal(result.framework.adapter, 'vue')
  assert.ok(result.framework.fallbackFiles.includes('<Feature>.vue'))
  assert.ok(!result.framework.fallbackFiles.some((entry) => entry.endsWith('.tsx')))
  assert.equal(result.conventions.http.adapter, 'axios')
  assert.ok(result.framework.capabilityFiles.includes('i18n/<locale>.json'))
})

pass('React Native uses a native capability file instead of the React web hook layout', () => {
  const result = inspectStackPortability(reactNative)
  assert.equal(result.status, 'ready')
  assert.equal(result.framework.adapter, 'react-native')
  assert.ok(result.framework.capabilityFiles.includes('data/use<Feature>.ts'))
  assert.ok(!result.framework.capabilityFiles.includes('data/apiHooks.ts'))
})

pass('Angular keeps data access in its service boundary instead of a React hook', () => {
  const result = inspectStackPortability(angular)
  assert.equal(result.status, 'ready')
  assert.equal(result.framework.adapter, 'angular')
  assert.ok(result.framework.fallbackFiles.includes('<feature>.service.ts'))
  assert.ok(!result.framework.capabilityFiles.includes('data/apiHooks.ts'))
})

pass('unsupported framework returns structured needs_input', () => {
  const result = inspectStackPortability(unsupported)
  assert.equal(result.status, 'needs_input')
  assert.equal(result.framework.adapter, null)
  assert.ok(result.blockingFindings.includes('framework-unsupported-or-unknown'))
  assert.ok(result.blockingFindings.includes('project-profile:framework-unknown'))
})

pass('dependency-only Open edX does not activate getHttpClient or case transforms', () => {
  const root = fixture('openedx-dependency-only', {
    react: '19.0.0', 'react-dom': '19.0.0', '@edx/frontend-platform': '9.0.0',
  }, { 'src/index.tsx': 'export const App = () => null;' })
  const result = inspectStackPortability(root)
  assert.equal(result.conventions.http.state, 'unknown')
  assert.equal(result.conventions.responseTransform.state, 'unknown')
  assert.ok(result.assumptions.filter((entry) => entry.id.startsWith('openedx-')).every((entry) => !entry.active))
})

pass('an explicit available declaration is accepted and cited', () => {
  const root = fixture('declared-openedx', {
    react: '19.0.0', 'react-dom': '19.0.0', '@edx/frontend-platform': '9.0.0',
  }, {
    'CLAUDE.md': 'http_client: getHttpClient()\nresponse_transform: camelCaseObject\nrequest_transform: snakeCaseObject\n',
    'src/index.tsx': 'export const App = () => null;',
  })
  const result = inspectStackPortability(root)
  assert.equal(result.conventions.http.state, 'declared')
  assert.equal(result.conventions.http.adapter, 'openedx-get-http-client')
  assert.ok(result.conventions.http.evidence.includes('instruction:CLAUDE.md#http_client=getHttpClient'))
})

pass('the result validator accepts an exact round trip', () => {
  const result = inspectStackPortability(genericReact)
  assert.deepEqual(validateStackPortabilityResult(JSON.parse(JSON.stringify(result))), result)
})

pass('schema and CLI publish the exact public identity', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs', 'schemas', 'stack-portability.schema.json'), 'utf8'))
  assert.equal(schema.properties.schemaVersion.const, STACK_PORTABILITY_SCHEMA_VERSION)
  const tsxCli = require.resolve('tsx/cli')
  const child = spawnSync(process.execPath, [tsxCli, 'packages/core/src/stack-portability.ts', genericReact], {
    cwd: repositoryRoot, encoding: 'utf8', shell: false, windowsHide: true,
  })
  assert.equal(child.status, 0, child.stderr)
  const lines = child.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length, 1)
  assert.ok(lines[0].startsWith(STACK_PORTABILITY_SENTINEL))
  assert.equal(validateStackPortabilityResult(JSON.parse(lines[0].slice(STACK_PORTABILITY_SENTINEL.length))).status, 'ready')
})

pass('the sync-safe launcher executes the mirrored core against a real fixture', () => {
  const tsxCli = require.resolve('tsx/cli')
  const child = spawnSync(process.execPath, [tsxCli, '.claude/integrations/stack-portability.ts', genericReact], {
    cwd: repositoryRoot, encoding: 'utf8', shell: false, windowsHide: true,
  })
  assert.equal(child.status, 0, child.stderr)
  const lines = child.stdout.trim().split(/\r?\n/)
  assert.equal(lines.length, 1)
  assert.ok(lines[0].startsWith(STACK_PORTABILITY_SENTINEL))
  assert.equal(validateStackPortabilityResult(JSON.parse(lines[0].slice(STACK_PORTABILITY_SENTINEL.length))).status, 'ready')
})

attack('conflicting observed HTTP transports cannot be prioritized silently', () => {
  const root = fixture('transport-conflict', { react: '19.0.0', 'react-dom': '19.0.0', axios: '1.0.0' }, {
    'src/api.ts': "import axios from 'axios'; export const load = () => fetch('/a').then(() => axios.get('/b'));",
  })
  const result = inspectStackPortability(root)
  assert.equal(result.status, 'needs_input')
  assert.equal(result.conventions.http.state, 'conflict')
  assert.ok(result.blockingFindings.includes('http-adapter-conflict'))
})

attack('an unavailable declared Open edX adapter becomes a conflict', () => {
  const root = fixture('unavailable-declaration', { react: '19.0.0', 'react-dom': '19.0.0' }, {
    'CLAUDE.md': 'http_client: getHttpClient()\n', 'src/index.tsx': 'export const App = () => null;',
  })
  const result = inspectStackPortability(root)
  assert.equal(result.status, 'needs_input')
  assert.equal(result.conventions.http.state, 'conflict')
  assert.ok(result.conventions.http.evidence.includes('project-profile:declared-adapter-unavailable'))
})

attack('forged Project Profile identity is rejected before portability scanning', () => {
  const profile = inspectProject(genericReact)
  assert.throws(() => inspectStackPortability(genericReact, {
    ...profile, repository: { ...profile.repository, fingerprint: '0'.repeat(64) },
  }), /fingerprint mismatch/)
})

attack('a fingerprint-valid profile cannot escape the real repository root', () => {
  const profile = inspectProject(genericReact)
  const escaped = refingerprintProfile({
    ...profile,
    evidenceBoundary: { ...profile.evidenceBoundary, sourceRoots: ['../outside'] },
  })
  assert.throws(() => inspectStackPortability(genericReact, escaped), /profile source root escapes the repository/)
})

attack('source symlinks are not followed for helper evidence', () => {
  const root = fixture('symlink-evidence', {
    react: '19.0.0', 'react-dom': '19.0.0', '@edx/frontend-platform': '9.0.0',
  }, { 'src/index.tsx': 'export const App = () => null;' })
  const external = path.join(scratch, 'external-openedx-source')
  fs.mkdirSync(external)
  fs.writeFileSync(path.join(external, 'helper.ts'), "import { getHttpClient } from '@edx/frontend-platform/auth'; getHttpClient().get('/outside');\n")
  const linked = path.join(root, 'src', 'linked-external')
  fs.symlinkSync(external, linked, process.platform === 'win32' ? 'junction' : 'dir')
  try {
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true)
    const result = inspectStackPortability(root)
    assert.equal(result.conventions.http.state, 'unknown')
    assert.equal(result.evidencePaths.includes('repository:src/linked-external/helper.ts'), false)
    assert.ok(result.evidencePaths.some((entry) => entry.includes('linked-external')))
  } finally {
    fs.unlinkSync(linked)
  }
})

attack('oversize source evidence fails before it can influence a decision', () => {
  const root = fixture('oversize-source', { react: '19.0.0', 'react-dom': '19.0.0' }, {
    'src/huge.ts': `export const payload = ${JSON.stringify('x'.repeat(2 * 1024 * 1024))};`,
  })
  assert.throws(() => inspectStackPortability(root), /source evidence exceeds/)
})

attack('result hash tampering is rejected', () => {
  const result = inspectStackPortability(genericReact)
  assert.throws(() => validateStackPortabilityResult({ ...result, resultHash: '0'.repeat(64) }), /resultHash mismatch/)
})

attack('extra result fields are rejected', () => {
  const result = inspectStackPortability(genericReact)
  assert.throws(() => validateStackPortabilityResult({ ...result, extra: true }), /fields must be exactly/)
})

attack('a contradictory ready status is rejected', () => {
  const result = inspectStackPortability(unsupported)
  assert.throws(() => validateStackPortabilityResult({ ...result, status: 'ready' }), /status contradicts blockingFindings|resultHash mismatch/)
})

attack('a forged resolved unknown decision is rejected', () => {
  const result = inspectStackPortability(genericReact)
  assert.throws(() => validateStackPortabilityResult({
    ...result,
    conventions: {
      ...result.conventions,
      responseTransform: { ...result.conventions.responseTransform, adapter: 'openedx-camel-case', symbol: 'camelCaseObject', targetSpecific: true },
    },
  }), /unresolved decision is contradictory/)
})

attack('framework file layouts cannot contradict their resolved adapter', () => {
  const result = inspectStackPortability(vue)
  assert.throws(() => validateStackPortabilityResult({
    ...result,
    framework: { ...result.framework, fallbackFiles: ['<Feature>.tsx'] },
  }), /fallbackFiles contradict adapter/)
})

attack('target assumptions cannot contradict resolved convention decisions', () => {
  const result = inspectStackPortability(openedx)
  assert.throws(() => validateStackPortabilityResult({
    ...result,
    assumptions: result.assumptions.map((entry) => entry.id === 'openedx-http-client' ? { ...entry, active: false } : entry),
  }), /active contradicts convention decision/)
})

attack('advisories cannot be removed while their unresolved decisions remain', () => {
  const result = inspectStackPortability(genericReact)
  assert.throws(() => validateStackPortabilityResult({ ...result, advisories: [] }), /advisories contradict resolved decisions/)
})

attack('duplicate evidence is rejected before hash validation', () => {
  const result = inspectStackPortability(genericReact)
  assert.throws(() => validateStackPortabilityResult({
    ...result,
    evidencePaths: [...result.evidencePaths, result.evidencePaths[0]],
  }), /sorted unique non-empty strings/)
})

attack('generic core contains detector strings but imports no Open edX helper', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'packages', 'core', 'src', 'stack-portability.ts'), 'utf8')
  assert.doesNotMatch(source, /(?:import|require)\s*(?:\(|[^'"\n]*from\s*)['"]@(?:edx|openedx)\//)
})

attack('CLI rejects ambiguous argv without emitting a success envelope', () => {
  const tsxCli = require.resolve('tsx/cli')
  const child = spawnSync(process.execPath, [tsxCli, 'packages/core/src/stack-portability.ts', genericReact, 'extra'], {
    cwd: repositoryRoot, encoding: 'utf8', shell: false, windowsHide: true,
  })
  assert.equal(child.status, 2)
  assert.equal(child.stdout.includes(STACK_PORTABILITY_SENTINEL), false)
})

fs.rmSync(scratch, { recursive: true, force: true })
if (process.exitCode) process.exit(process.exitCode)
console.log(`stack-portability: ${assertions} assertions and ${attacks} attacks passed`)
