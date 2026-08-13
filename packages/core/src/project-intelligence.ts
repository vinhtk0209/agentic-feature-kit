#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts = require('typescript')

export const PROJECT_PROFILE_SCHEMA_VERSION = '1.0.0' as const
export const PROJECT_PROFILE_SENTINEL = '@@PROJECT_PROFILE@@' as const

type Confidence = 'confirmed' | 'unknown' | 'conflict'

export interface EvidenceValue<T extends string = string> {
  value: T | null
  confidence: Confidence
  evidence: string[]
}

export interface CapabilityProfile {
  state: 'present' | 'absent' | 'conflict'
  implementations: string[]
  evidence: string[]
}

export interface ProjectProfileIssue {
  code:
    | 'package-json-malformed'
    | 'tsconfig-malformed'
    | 'framework-conflict'
    | 'framework-unknown'
    | 'router-framework-conflict'
    | 'package-manager-conflict'
    | 'unsafe-repository-entry'
  message: string
  evidence: string[]
}

export interface ReferenceFeature {
  path: string
  signals: string[]
}

export interface ProjectProfile {
  schemaVersion: typeof PROJECT_PROFILE_SCHEMA_VERSION
  status: 'ready' | 'needs_input'
  repository: {
    rootName: string
    fingerprint: string
  }
  framework: EvidenceValue<'react-web' | 'react-native' | 'vue' | 'angular'>
  language: EvidenceValue<'typescript' | 'javascript'>
  packageManager: EvidenceValue<'bun' | 'pnpm' | 'yarn' | 'npm'>
  router: CapabilityProfile
  i18n: CapabilityProfile
  styling: CapabilityProfile
  dataLayer: CapabilityProfile
  conventions: {
    httpClients: CapabilityProfile
    uiLibraries: CapabilityProfile
    importAliases: string[]
    featureLayouts: string[]
    evidence: string[]
  }
  taskTaxonomy: {
    dev: string[]
    build: string[]
    test: string[]
    lint: string[]
    typecheck: string[]
    format: string[]
    e2e: string[]
    evidence: string[]
  }
  evidenceBoundary: {
    sourceRoots: string[]
    testRoots: string[]
    instructionFiles: string[]
    ignoredSegments: string[]
    traversalDepth: number
    symlinkPolicy: 'do-not-follow'
  }
  instructions: string[]
  referenceFeatures: ReferenceFeature[]
  gates: {
    i18n: boolean
    router: boolean
    styling: boolean
  }
  issues: ProjectProfileIssue[]
  evidencePaths: string[]
}

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

interface SignalRule {
  id: string
  packages: string[]
}

const FRAMEWORK_RULES: Array<SignalRule & { value: NonNullable<ProjectProfile['framework']['value']> }> = [
  { id: 'react-native', value: 'react-native', packages: ['react-native', 'expo'] },
  { id: 'vue', value: 'vue', packages: ['vue'] },
  { id: 'angular', value: 'angular', packages: ['@angular/core'] },
  { id: 'react-web', value: 'react-web', packages: ['react-dom'] },
]

const ROUTER_RULES: SignalRule[] = [
  { id: 'react-router', packages: ['react-router', 'react-router-dom'] },
  { id: 'react-navigation', packages: ['@react-navigation/native'] },
  { id: 'expo-router', packages: ['expo-router'] },
  { id: 'vue-router', packages: ['vue-router'] },
  { id: 'angular-router', packages: ['@angular/router'] },
]

const I18N_RULES: SignalRule[] = [
  { id: 'react-intl', packages: ['react-intl'] },
  { id: 'i18next', packages: ['i18next', 'react-i18next'] },
  { id: 'vue-i18n', packages: ['vue-i18n'] },
  { id: 'angular-localize', packages: ['@angular/localize'] },
]

const STYLE_RULES: SignalRule[] = [
  { id: 'sass', packages: ['sass', 'node-sass'] },
  { id: 'styled-components', packages: ['styled-components'] },
  { id: 'emotion', packages: ['@emotion/react', '@emotion/styled'] },
  { id: 'tailwind', packages: ['tailwindcss'] },
  { id: 'css-modules', packages: [] },
]

const DATA_RULES: SignalRule[] = [
  { id: 'tanstack-query', packages: ['@tanstack/react-query', '@tanstack/vue-query'] },
  { id: 'react-query', packages: ['react-query'] },
  { id: 'pinia', packages: ['pinia'] },
  { id: 'ngrx', packages: ['@ngrx/store'] },
  { id: 'redux-toolkit', packages: ['@reduxjs/toolkit'] },
  { id: 'apollo', packages: ['@apollo/client'] },
]

const HTTP_CLIENT_RULES: SignalRule[] = [
  { id: 'axios', packages: ['axios'] },
  { id: 'ky', packages: ['ky'] },
  { id: 'graphql-request', packages: ['graphql-request'] },
  { id: 'apollo-client', packages: ['@apollo/client'] },
  { id: 'openedx-http-client', packages: ['@edx/frontend-platform'] },
]

const UI_LIBRARY_RULES: SignalRule[] = [
  { id: 'paragon', packages: ['@openedx/paragon'] },
  { id: 'mui', packages: ['@mui/material'] },
  { id: 'ant-design', packages: ['antd'] },
  { id: 'chakra', packages: ['@chakra-ui/react'] },
  { id: 'react-native-core', packages: ['react-native'] },
  { id: 'vuetify', packages: ['vuetify'] },
]

const IGNORED_SEGMENTS = new Set(['.git', '.codegraph', '.next', 'dist', 'node_modules'])
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md']
const LOCKFILES: Array<{ name: string; value: NonNullable<ProjectProfile['packageManager']['value']> }> = [
  { name: 'bun.lockb', value: 'bun' },
  { name: 'bun.lock', value: 'bun' },
  { name: 'pnpm-lock.yaml', value: 'pnpm' },
  { name: 'yarn.lock', value: 'yarn' },
  { name: 'package-lock.json', value: 'npm' },
]

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function fileExists(root: string, relative: string): boolean {
  const target = path.join(root, relative)
  try {
    const stat = fs.lstatSync(target)
    return !stat.isSymbolicLink() && stat.isFile()
  } catch {
    return false
  }
}

function readManifest(root: string, issues: ProjectProfileIssue[]): { manifest: PackageManifest; evidence: string[] } {
  if (!fileExists(root, 'package.json')) return { manifest: {}, evidence: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageManifest
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('root must be an object')
    return { manifest: parsed, evidence: ['package.json'] }
  } catch {
    issues.push({ code: 'package-json-malformed', message: 'package.json is malformed; package-derived signals are unavailable.', evidence: ['package.json'] })
    return { manifest: {}, evidence: ['package.json'] }
  }
}

function readImportAliases(root: string, issues: ProjectProfileIssue[]): { values: string[]; evidence: string[] } {
  if (!fileExists(root, 'tsconfig.json')) return { values: [], evidence: [] }
  try {
    const result = ts.readConfigFile(path.join(root, 'tsconfig.json'), (file) => fs.readFileSync(file, 'utf8'))
    if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'))
    const parsed = result.config as { compilerOptions?: { paths?: Record<string, unknown> } }
    const paths = parsed?.compilerOptions?.paths
    if (paths === undefined) return { values: [], evidence: ['tsconfig.json'] }
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) throw new Error('compilerOptions.paths must be an object')
    return { values: stableUnique(Object.keys(paths)), evidence: ['tsconfig.json#compilerOptions.paths'] }
  } catch {
    issues.push({ code: 'tsconfig-malformed', message: 'tsconfig.json is malformed; import aliases are unavailable.', evidence: ['tsconfig.json'] })
    return { values: [], evidence: ['tsconfig.json'] }
  }
}

function dependencies(manifest: PackageManifest): Set<string> {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
}

function matchRules(rules: SignalRule[], deps: Set<string>): { implementations: string[]; evidence: string[] } {
  const hits = rules.filter((rule) => rule.packages.some((name) => deps.has(name)))
  return {
    implementations: hits.map((rule) => rule.id),
    evidence: stableUnique(hits.flatMap((rule) => rule.packages.filter((name) => deps.has(name)).map((name) => `package.json#${name}`))),
  }
}

function capability(match: { implementations: string[]; evidence: string[] }, extraEvidence: string[] = []): CapabilityProfile {
  const implementations = stableUnique(match.implementations)
  const evidence = stableUnique([...match.evidence, ...extraEvidence])
  return { state: implementations.length > 0 || evidence.length > 0 ? 'present' : 'absent', implementations, evidence }
}

function detectFramework(deps: Set<string>, issues: ProjectProfileIssue[]): ProjectProfile['framework'] {
  const hits = FRAMEWORK_RULES.filter((rule) => rule.packages.some((name) => deps.has(name)))
  const values = stableUnique(hits.map((hit) => hit.value)) as Array<NonNullable<ProjectProfile['framework']['value']>>
  const evidence = stableUnique(hits.flatMap((hit) => hit.packages.filter((name) => deps.has(name)).map((name) => `package.json#${name}`)))
  if (values.length === 0) {
    issues.push({ code: 'framework-unknown', message: 'No supported framework has positive package evidence; no framework fallback was applied.', evidence })
    return { value: null, confidence: 'unknown', evidence }
  }
  if (values.length > 1) {
    issues.push({ code: 'framework-conflict', message: `Conflicting framework signals: ${values.join(', ')}.`, evidence })
    return { value: null, confidence: 'conflict', evidence }
  }
  return { value: values[0], confidence: 'confirmed', evidence }
}

function detectLanguage(root: string, deps: Set<string>): ProjectProfile['language'] {
  const tsEvidence = [fileExists(root, 'tsconfig.json') ? 'tsconfig.json' : '', deps.has('typescript') ? 'package.json#typescript' : ''].filter(Boolean)
  if (tsEvidence.length > 0) return { value: 'typescript', confidence: 'confirmed', evidence: stableUnique(tsEvidence) }
  return { value: 'javascript', confidence: 'confirmed', evidence: fileExists(root, 'package.json') ? ['package.json'] : [] }
}

function detectPackageManager(root: string, issues: ProjectProfileIssue[]): ProjectProfile['packageManager'] {
  const hits = LOCKFILES.filter((entry) => fileExists(root, entry.name))
  const values = stableUnique(hits.map((entry) => entry.value)) as Array<NonNullable<ProjectProfile['packageManager']['value']>>
  const evidence = stableUnique(hits.map((entry) => entry.name))
  if (values.length === 0) return { value: null, confidence: 'unknown', evidence: [] }
  if (values.length > 1) {
    issues.push({ code: 'package-manager-conflict', message: `Multiple package-manager lockfiles found: ${evidence.join(', ')}.`, evidence })
    return { value: null, confidence: 'conflict', evidence }
  }
  return { value: values[0], confidence: 'confirmed', evidence }
}

function routerCompatibility(framework: ProjectProfile['framework']['value'], router: CapabilityProfile, issues: ProjectProfileIssue[]): void {
  if (!framework || router.state !== 'present') return
  const compatible: Record<NonNullable<ProjectProfile['framework']['value']>, string[]> = {
    'react-web': ['react-router'],
    'react-native': ['react-navigation', 'expo-router'],
    vue: ['vue-router'],
    angular: ['angular-router'],
  }
  const incompatible = router.implementations.filter((entry) => !compatible[framework].includes(entry))
  if (incompatible.length > 0) {
    router.state = 'conflict'
    issues.push({
      code: 'router-framework-conflict',
      message: `Router signals ${incompatible.join(', ')} conflict with confirmed framework ${framework}.`,
      evidence: router.evidence,
    })
  }
}

function collectStyleFileEvidence(root: string): string[] {
  const candidates = ['tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'postcss.config.cjs', 'src/styles.scss', 'src/styles.css']
  return candidates.filter((candidate) => fileExists(root, candidate))
}

function listInstructions(root: string): string[] {
  return stableUnique(INSTRUCTION_FILES.filter((candidate) => fileExists(root, candidate)))
}

function existingDirectories(root: string, candidates: string[]): string[] {
  return stableUnique(candidates.filter((candidate) => {
    try {
      const stat = fs.lstatSync(path.join(root, candidate))
      return stat.isDirectory() && !stat.isSymbolicLink()
    } catch {
      return false
    }
  }))
}

function taskTaxonomy(manifest: PackageManifest): ProjectProfile['taskTaxonomy'] {
  const scriptNames = Object.keys(manifest.scripts ?? {}).sort(compareText)
  const select = (pattern: RegExp): string[] => scriptNames.filter((name) => pattern.test(name))
  return {
    dev: select(/^(dev|start|serve)(:|$)/),
    build: select(/^build(:|$)/),
    test: select(/^test(:|$)/),
    lint: select(/^lint(:|$)/),
    typecheck: select(/^(typecheck|type-check|check:types)(:|$)/),
    format: select(/^(format|fmt)(:|$)/),
    e2e: select(/^(e2e|test:e2e|test:playwright|playwright)(:|$)/),
    evidence: scriptNames.length > 0 ? ['package.json#scripts'] : [],
  }
}

function referenceFeatures(root: string, issues: ProjectProfileIssue[]): ReferenceFeature[] {
  const src = path.join(root, 'src')
  if (!fs.existsSync(src)) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(src, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates: ReferenceFeature[] = []
  for (const entry of entries.sort((a, b) => compareText(a.name, b.name))) {
    if (IGNORED_SEGMENTS.has(entry.name)) continue
    const relative = toPosix(path.join('src', entry.name))
    if (entry.isSymbolicLink()) {
      issues.push({ code: 'unsafe-repository-entry', message: `Symlinked repository entry was not traversed: ${relative}.`, evidence: [relative] })
      continue
    }
    if (!entry.isDirectory()) continue
    const directory = path.join(src, entry.name)
    let children: fs.Dirent[]
    try {
      children = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    const names = children.filter((child) => !child.isSymbolicLink()).map((child) => child.name)
    const signals = stableUnique([
      names.some((name) => /\.(tsx|jsx|vue)$/.test(name)) ? 'ui-entry' : '',
      names.includes('data') || names.includes('api') || names.includes('services') ? 'data-layer' : '',
      names.includes('messages.ts') || names.includes('i18n') ? 'i18n' : '',
      names.some((name) => /\.(test|spec)\.[jt]sx?$/.test(name)) ? 'tests' : '',
      names.some((name) => /\.(scss|css)$/.test(name)) ? 'styles' : '',
    ].filter(Boolean))
    if (signals.length >= 2) candidates.push({ path: relative, signals })
  }
  return candidates
    .sort((a, b) => b.signals.length - a.signals.length || compareText(a.path, b.path))
    .slice(0, 5)
}

function canonicalProfile(profile: Omit<ProjectProfile, 'repository'> & { repository: { rootName: string } }): string {
  return JSON.stringify(profile)
}

function profileFingerprintPayload(profile: ProjectProfile): Omit<ProjectProfile, 'repository'> & { repository: { rootName: string } } {
  return {
    schemaVersion: profile.schemaVersion,
    status: profile.status,
    framework: profile.framework,
    language: profile.language,
    packageManager: profile.packageManager,
    router: profile.router,
    i18n: profile.i18n,
    styling: profile.styling,
    dataLayer: profile.dataLayer,
    conventions: profile.conventions,
    taskTaxonomy: profile.taskTaxonomy,
    evidenceBoundary: profile.evidenceBoundary,
    instructions: profile.instructions,
    referenceFeatures: profile.referenceFeatures,
    gates: profile.gates,
    issues: profile.issues,
    evidencePaths: profile.evidencePaths,
    repository: { rootName: profile.repository.rootName },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`project-intelligence: ${label} must be an object`)
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`project-intelligence: ${label} must be one of ${allowed.join(', ')}`)
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`project-intelligence: ${label} must be an array of strings`)
  }
  const normalized = stableUnique(value)
  if (JSON.stringify(normalized) !== JSON.stringify(value)) {
    throw new Error(`project-intelligence: ${label} must be sorted and unique`)
  }
}

function assertEvidenceValue(value: unknown, allowed: readonly string[], label: string): void {
  assertRecord(value, label)
  if (value.value !== null) assertEnum(value.value, allowed, `${label}.value`)
  assertEnum(value.confidence, ['confirmed', 'unknown', 'conflict'], `${label}.confidence`)
  assertStringArray(value.evidence, `${label}.evidence`)
  if (value.confidence === 'confirmed' && value.value === null) {
    throw new Error(`project-intelligence: ${label} cannot be confirmed without a value`)
  }
  if (value.confidence !== 'confirmed' && value.value !== null) {
    throw new Error(`project-intelligence: ${label} cannot carry a value when confidence is ${value.confidence}`)
  }
}

function assertCapability(value: unknown, label: string): asserts value is CapabilityProfile {
  assertRecord(value, label)
  assertEnum(value.state, ['present', 'absent', 'conflict'], `${label}.state`)
  assertStringArray(value.implementations, `${label}.implementations`)
  assertStringArray(value.evidence, `${label}.evidence`)
  if (value.state === 'absent' && (value.implementations.length > 0 || value.evidence.length > 0)) {
    throw new Error(`project-intelligence: ${label} cannot be absent with positive evidence`)
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`project-intelligence: ${label} must be boolean`)
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...keys].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`project-intelligence: ${label} fields must be exactly ${expected.join(', ')}`)
  }
}

/**
 * Validate an untrusted Project Profile before a provider adapter uses it.
 * The validator intentionally duplicates only transport invariants; discovery
 * and gate business rules remain in inspectProject().
 */
export function validateProjectProfile(value: unknown): ProjectProfile {
  assertRecord(value, 'profile')
  assertExactKeys(value, [
    'schemaVersion', 'status', 'repository', 'framework', 'language', 'packageManager',
    'router', 'i18n', 'styling', 'dataLayer', 'conventions', 'taskTaxonomy',
    'evidenceBoundary', 'instructions', 'referenceFeatures', 'gates', 'issues', 'evidencePaths',
  ], 'profile')
  if (value.schemaVersion !== PROJECT_PROFILE_SCHEMA_VERSION) {
    throw new Error(`project-intelligence: unsupported schemaVersion ${String(value.schemaVersion)}`)
  }
  assertEnum(value.status, ['ready', 'needs_input'], 'profile.status')

  assertRecord(value.repository, 'profile.repository')
  assertExactKeys(value.repository, ['rootName', 'fingerprint'], 'profile.repository')
  if (typeof value.repository.rootName !== 'string' || value.repository.rootName.length === 0) {
    throw new Error('project-intelligence: profile.repository.rootName must be a non-empty string')
  }
  if (typeof value.repository.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.repository.fingerprint)) {
    throw new Error('project-intelligence: profile.repository.fingerprint must be lowercase SHA-256')
  }

  assertEvidenceValue(value.framework, ['react-web', 'react-native', 'vue', 'angular'], 'profile.framework')
  assertEvidenceValue(value.language, ['typescript', 'javascript'], 'profile.language')
  assertEvidenceValue(value.packageManager, ['bun', 'pnpm', 'yarn', 'npm'], 'profile.packageManager')
  assertCapability(value.router, 'profile.router')
  assertCapability(value.i18n, 'profile.i18n')
  assertCapability(value.styling, 'profile.styling')
  assertCapability(value.dataLayer, 'profile.dataLayer')

  assertRecord(value.conventions, 'profile.conventions')
  assertExactKeys(value.conventions, ['httpClients', 'uiLibraries', 'importAliases', 'featureLayouts', 'evidence'], 'profile.conventions')
  assertCapability(value.conventions.httpClients, 'profile.conventions.httpClients')
  assertCapability(value.conventions.uiLibraries, 'profile.conventions.uiLibraries')
  assertStringArray(value.conventions.importAliases, 'profile.conventions.importAliases')
  assertStringArray(value.conventions.featureLayouts, 'profile.conventions.featureLayouts')
  assertStringArray(value.conventions.evidence, 'profile.conventions.evidence')

  assertRecord(value.taskTaxonomy, 'profile.taskTaxonomy')
  assertExactKeys(value.taskTaxonomy, ['dev', 'build', 'test', 'lint', 'typecheck', 'format', 'e2e', 'evidence'], 'profile.taskTaxonomy')
  for (const key of ['dev', 'build', 'test', 'lint', 'typecheck', 'format', 'e2e', 'evidence'] as const) {
    assertStringArray(value.taskTaxonomy[key], `profile.taskTaxonomy.${key}`)
  }

  assertRecord(value.evidenceBoundary, 'profile.evidenceBoundary')
  assertExactKeys(value.evidenceBoundary, ['sourceRoots', 'testRoots', 'instructionFiles', 'ignoredSegments', 'traversalDepth', 'symlinkPolicy'], 'profile.evidenceBoundary')
  for (const key of ['sourceRoots', 'testRoots', 'instructionFiles', 'ignoredSegments'] as const) {
    assertStringArray(value.evidenceBoundary[key], `profile.evidenceBoundary.${key}`)
  }
  if (!Number.isInteger(value.evidenceBoundary.traversalDepth) || Number(value.evidenceBoundary.traversalDepth) < 0) {
    throw new Error('project-intelligence: profile.evidenceBoundary.traversalDepth must be a non-negative integer')
  }
  if (value.evidenceBoundary.symlinkPolicy !== 'do-not-follow') {
    throw new Error('project-intelligence: profile.evidenceBoundary.symlinkPolicy must be do-not-follow')
  }

  assertStringArray(value.instructions, 'profile.instructions')
  if (!Array.isArray(value.referenceFeatures)) throw new Error('project-intelligence: profile.referenceFeatures must be an array')
  for (const [index, reference] of value.referenceFeatures.entries()) {
    assertRecord(reference, `profile.referenceFeatures[${index}]`)
    assertExactKeys(reference, ['path', 'signals'], `profile.referenceFeatures[${index}]`)
    if (typeof reference.path !== 'string' || reference.path.length === 0) {
      throw new Error(`project-intelligence: profile.referenceFeatures[${index}].path must be non-empty`)
    }
    assertStringArray(reference.signals, `profile.referenceFeatures[${index}].signals`)
  }

  assertRecord(value.gates, 'profile.gates')
  assertExactKeys(value.gates, ['i18n', 'router', 'styling'], 'profile.gates')
  assertBoolean(value.gates.i18n, 'profile.gates.i18n')
  assertBoolean(value.gates.router, 'profile.gates.router')
  assertBoolean(value.gates.styling, 'profile.gates.styling')
  if (value.gates.i18n !== (value.i18n.state === 'present') ||
      value.gates.router !== (value.router.state === 'present') ||
      value.gates.styling !== (value.styling.state === 'present')) {
    throw new Error('project-intelligence: profile gates do not match capability states')
  }

  if (!Array.isArray(value.issues)) throw new Error('project-intelligence: profile.issues must be an array')
  for (const [index, issue] of value.issues.entries()) {
    assertRecord(issue, `profile.issues[${index}]`)
    assertExactKeys(issue, ['code', 'message', 'evidence'], `profile.issues[${index}]`)
    assertEnum(issue.code, [
      'package-json-malformed', 'tsconfig-malformed', 'framework-conflict', 'framework-unknown',
      'router-framework-conflict', 'package-manager-conflict', 'unsafe-repository-entry',
    ], `profile.issues[${index}].code`)
    if (typeof issue.message !== 'string' || issue.message.length === 0) {
      throw new Error(`project-intelligence: profile.issues[${index}].message must be non-empty`)
    }
    assertStringArray(issue.evidence, `profile.issues[${index}].evidence`)
  }
  assertStringArray(value.evidencePaths, 'profile.evidencePaths')
  if ((value.status === 'ready') !== (value.issues.length === 0)) {
    throw new Error('project-intelligence: profile status does not match issues')
  }

  const profile = value as unknown as ProjectProfile
  const expectedFingerprint = crypto.createHash('sha256').update(canonicalProfile(profileFingerprintPayload(profile))).digest('hex')
  if (profile.repository.fingerprint !== expectedFingerprint) {
    throw new Error('project-intelligence: profile fingerprint mismatch')
  }
  return profile
}

/** Parse the one-line, one-sentinel machine transport contract. */
export function parseProjectProfileEnvelope(output: string): ProjectProfile {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length !== 1 || !lines[0].startsWith(PROJECT_PROFILE_SENTINEL)) {
    throw new Error('project-intelligence: expected exactly one Project Profile envelope')
  }
  const payload = lines[0].slice(PROJECT_PROFILE_SENTINEL.length)
  if (payload.length === 0) throw new Error('project-intelligence: Project Profile envelope is empty')
  try {
    return validateProjectProfile(JSON.parse(payload) as unknown)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('project-intelligence: Project Profile envelope contains invalid JSON')
    throw error
  }
}

export function inspectProject(repoRoot: string): ProjectProfile {
  const root = path.resolve(repoRoot)
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(root)
  } catch {
    throw new Error('project-intelligence: repository root does not exist or cannot be read')
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('project-intelligence: repository root must be a real directory')

  const issues: ProjectProfileIssue[] = []
  const { manifest, evidence: manifestEvidence } = readManifest(root, issues)
  const deps = dependencies(manifest)
  const framework = detectFramework(deps, issues)
  const language = detectLanguage(root, deps)
  const packageManager = detectPackageManager(root, issues)
  const router = capability(matchRules(ROUTER_RULES, deps))
  const i18n = capability(matchRules(I18N_RULES, deps))
  const styleFiles = collectStyleFileEvidence(root)
  const styleMatch = matchRules(STYLE_RULES, deps)
  if (styleFiles.some((entry) => entry.endsWith('.scss'))) styleMatch.implementations.push('scss')
  if (styleFiles.some((entry) => entry.endsWith('.css'))) styleMatch.implementations.push('css')
  const styling = capability(styleMatch, styleFiles)
  const dataLayer = capability(matchRules(DATA_RULES, deps))
  const instructions = listInstructions(root)
  const references = referenceFeatures(root, issues)
  const aliases = readImportAliases(root, issues)
  const conventions = {
    httpClients: capability(matchRules(HTTP_CLIENT_RULES, deps)),
    uiLibraries: capability(matchRules(UI_LIBRARY_RULES, deps)),
    importAliases: aliases.values,
    featureLayouts: stableUnique(references.flatMap((entry) => entry.signals)),
    evidence: stableUnique([...aliases.evidence, ...references.map((entry) => entry.path)]),
  }
  const tasks = taskTaxonomy(manifest)
  const evidenceBoundary = {
    sourceRoots: existingDirectories(root, ['app', 'src', 'packages']),
    testRoots: existingDirectories(root, ['e2e', 'test', 'tests']),
    instructionFiles: instructions,
    ignoredSegments: [...IGNORED_SEGMENTS].sort(compareText),
    traversalDepth: 2,
    symlinkPolicy: 'do-not-follow' as const,
  }

  routerCompatibility(framework.value, router, issues)
  const evidencePaths = stableUnique([
    ...manifestEvidence,
    ...framework.evidence,
    ...language.evidence,
    ...packageManager.evidence,
    ...router.evidence,
    ...i18n.evidence,
    ...styling.evidence,
    ...dataLayer.evidence,
    ...conventions.httpClients.evidence,
    ...conventions.uiLibraries.evidence,
    ...conventions.evidence,
    ...tasks.evidence,
    ...evidenceBoundary.sourceRoots,
    ...evidenceBoundary.testRoots,
    ...instructions,
    ...references.map((entry) => entry.path),
    ...issues.flatMap((issue) => issue.evidence),
  ])

  const withoutFingerprint = {
    schemaVersion: PROJECT_PROFILE_SCHEMA_VERSION,
    status: issues.length === 0 ? 'ready' as const : 'needs_input' as const,
    framework,
    language,
    packageManager,
    router,
    i18n,
    styling,
    dataLayer,
    conventions,
    taskTaxonomy: tasks,
    evidenceBoundary,
    instructions,
    referenceFeatures: references,
    gates: {
      i18n: i18n.state === 'present',
      router: router.state === 'present',
      styling: styling.state === 'present',
    },
    issues,
    evidencePaths,
  }
  const fingerprint = crypto.createHash('sha256').update(canonicalProfile({ ...withoutFingerprint, repository: { rootName: path.basename(root) } })).digest('hex')
  return validateProjectProfile({ ...withoutFingerprint, repository: { rootName: path.basename(root), fingerprint } })
}

export function runProjectIntelligenceCli(args: string[] = process.argv.slice(2)): number {
  if (args.length !== 1 || args[0].startsWith('-')) {
    console.error('Usage: npx tsx packages/core/src/project-intelligence.ts <repository-root>')
    return 2
  }
  try {
    const profile = inspectProject(args[0])
    console.log(`${PROJECT_PROFILE_SENTINEL}${JSON.stringify(profile)}`)
    return profile.status === 'ready' ? 0 : 1
  } catch (error) {
    console.error(`project-intelligence: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (require.main === module) process.exit(runProjectIntelligenceCli())
