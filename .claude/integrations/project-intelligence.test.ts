import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PROJECT_PROFILE_SENTINEL,
  inspectProject,
  parseProjectProfileEnvelope,
  validateProjectProfile,
} from './project-intelligence'

interface Fixture {
  files: Record<string, string>
}

const fixturesRoot = path.join(process.cwd(), '.claude', 'integrations', 'fixtures', 'project-intelligence')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-intelligence-'))

function fixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(fixturesRoot, `${name}.json`), 'utf8')) as Fixture
}

function materialize(name: string, value: Fixture = fixture(name)): string {
  const root = path.join(tempRoot, name)
  fs.mkdirSync(root, { recursive: true })
  for (const [relative, content] of Object.entries(value.files)) {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  return root
}

function treeFingerprint(root: string): string {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else files.push(`${path.relative(root, target).split(path.sep).join('/')}:${crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')}`)
    }
  }
  visit(root)
  return crypto.createHash('sha256').update(files.join('\n')).digest('hex')
}

try {
  const reactRoot = materialize('react-web')
  const reactBefore = treeFingerprint(reactRoot)
  const react = inspectProject(reactRoot)
  assert.equal(react.status, 'ready')
  assert.deepEqual(react.framework, { value: 'react-web', confidence: 'confirmed', evidence: ['package.json#react-dom'] })
  assert.equal(react.router.state, 'present')
  assert.deepEqual(react.router.implementations, ['react-router'])
  assert.equal(react.i18n.state, 'present')
  assert.deepEqual(react.gates, { i18n: true, router: true, styling: true })
  assert.equal(react.packageManager.value, 'npm')
  assert.equal(react.language.value, 'typescript')
  assert.equal(react.referenceFeatures[0].path, 'src/accounts')
  assert.ok(react.referenceFeatures[0].signals.includes('data-layer'))
  assert.ok(react.evidencePaths.includes('AGENTS.md'))
  assert.deepEqual(react.conventions.httpClients.implementations, ['axios'])
  assert.deepEqual(react.conventions.uiLibraries.implementations, ['mui'])
  assert.deepEqual(react.conventions.importAliases, ['@app/*'])
  assert.deepEqual(react.taskTaxonomy.dev, ['dev'])
  assert.deepEqual(react.taskTaxonomy.test, ['test', 'test:e2e'])
  assert.deepEqual(react.taskTaxonomy.e2e, ['test:e2e'])
  assert.deepEqual(react.evidenceBoundary.sourceRoots, ['src'])
  assert.deepEqual(react.evidenceBoundary.instructionFiles, ['AGENTS.md'])
  assert.equal(react.evidenceBoundary.symlinkPolicy, 'do-not-follow')
  assert.equal(treeFingerprint(reactRoot), reactBefore, 'inspection must be read-only')

  const reactAgain = inspectProject(reactRoot)
  assert.deepEqual(reactAgain, react, 'same repository must yield a byte-stable normalized profile')
  assert.match(react.repository.fingerprint, /^[0-9a-f]{64}$/)

  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const cli = spawnSync(process.execPath, [tsxCli, '.claude/integrations/project-intelligence.ts', reactRoot], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  })
  assert.equal(cli.status, 0, cli.stderr)
  const cliLines = cli.stdout.trim().split(/\r?\n/)
  assert.equal(cliLines.length, 1, 'CLI must emit exactly one machine envelope')
  assert.ok(cliLines[0].startsWith(PROJECT_PROFILE_SENTINEL))
  assert.deepEqual(parseProjectProfileEnvelope(cli.stdout), react)

  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'schemas', 'project-profile.schema.json'), 'utf8')) as Record<string, unknown>
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.title, 'Agentic Feature Kit Project Profile')

  const forgedStatus = structuredClone(react) as unknown as Record<string, unknown>
  forgedStatus.status = 'needs_input'
  assert.throws(() => validateProjectProfile(forgedStatus), /status does not match issues/)

  const forgedFingerprint = structuredClone(react)
  forgedFingerprint.repository.fingerprint = '0'.repeat(64)
  assert.throws(() => validateProjectProfile(forgedFingerprint), /fingerprint mismatch/)

  const forgedGate = structuredClone(react)
  forgedGate.gates.i18n = false
  assert.throws(() => validateProjectProfile(forgedGate), /gates do not match capability states/)

  assert.throws(() => parseProjectProfileEnvelope(''), /exactly one Project Profile envelope/)
  assert.throws(() => parseProjectProfileEnvelope(`${PROJECT_PROFILE_SENTINEL}{}\n${PROJECT_PROFILE_SENTINEL}{}`), /exactly one Project Profile envelope/)
  assert.throws(() => parseProjectProfileEnvelope(`${PROJECT_PROFILE_SENTINEL}{broken}`), /invalid JSON/)

  const vue = inspectProject(materialize('vue'))
  assert.equal(vue.status, 'ready')
  assert.equal(vue.framework.value, 'vue')
  assert.deepEqual(vue.router.implementations, ['vue-router'])
  assert.deepEqual(vue.i18n.implementations, ['vue-i18n'])
  assert.ok(vue.styling.implementations.includes('sass'))
  assert.deepEqual(vue.dataLayer.implementations, ['pinia'])
  assert.equal(vue.packageManager.value, 'pnpm')

  const native = inspectProject(materialize('react-native'))
  assert.equal(native.status, 'ready')
  assert.equal(native.framework.value, 'react-native', 'React Native must not fall back to React web')
  assert.deepEqual(native.router.implementations, ['expo-router'])
  assert.equal(native.packageManager.value, 'yarn')

  const noI18n = inspectProject(materialize('no-i18n'))
  assert.equal(noI18n.status, 'ready')
  assert.equal(noI18n.i18n.state, 'absent')
  assert.equal(noI18n.gates.i18n, false, 'absence must not fabricate an i18n/messages gate')
  assert.equal(noI18n.gates.router, true)
  assert.equal(noI18n.gates.styling, true)

  const routerConflict = inspectProject(materialize('contradictory-router'))
  assert.equal(routerConflict.status, 'needs_input')
  assert.equal(routerConflict.framework.value, 'react-web')
  assert.equal(routerConflict.router.state, 'conflict')
  assert.ok(routerConflict.issues.some((issue) => issue.code === 'router-framework-conflict'))
  assert.equal(routerConflict.gates.router, false, 'a conflicted router cannot activate a router-specific gate')

  const unknownRoot = materialize('unknown', { files: { 'package.json': '{"dependencies":{}}', 'package-lock.json': '{}' } })
  const unknown = inspectProject(unknownRoot)
  assert.equal(unknown.status, 'needs_input')
  assert.equal(unknown.framework.value, null)
  assert.equal(unknown.framework.confidence, 'unknown')
  assert.ok(unknown.issues.some((issue) => issue.code === 'framework-unknown'))

  const frameworkConflictRoot = materialize('framework-conflict', {
    files: { 'package.json': '{"dependencies":{"react-dom":"19.0.0","vue":"3.5.0"}}', 'package-lock.json': '{}' },
  })
  const frameworkConflict = inspectProject(frameworkConflictRoot)
  assert.equal(frameworkConflict.framework.confidence, 'conflict')
  assert.equal(frameworkConflict.framework.value, null)
  assert.ok(frameworkConflict.issues.some((issue) => issue.code === 'framework-conflict'))

  const lockConflictRoot = materialize('lock-conflict', {
    files: { 'package.json': '{"dependencies":{"vue":"3.5.0"}}', 'package-lock.json': '{}', 'yarn.lock': '# fixture' },
  })
  const lockConflict = inspectProject(lockConflictRoot)
  assert.equal(lockConflict.packageManager.confidence, 'conflict')
  assert.ok(lockConflict.issues.some((issue) => issue.code === 'package-manager-conflict'))

  const malformedRoot = materialize('malformed', { files: { 'package.json': '{broken' } })
  const malformed = inspectProject(malformedRoot)
  assert.equal(malformed.status, 'needs_input')
  assert.ok(malformed.issues.some((issue) => issue.code === 'package-json-malformed'))

  assert.throws(() => inspectProject(path.join(tempRoot, 'missing')), /repository root does not exist or cannot be read/)

  console.log('project-intelligence.test: PASS (5 canonical fixtures, schema/envelope integrity, deterministic CLI/read-only proof, 11 negative controls)')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
