#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { inspectProject, ProjectProfile, validateProjectProfile } from './project-intelligence'

export const STACK_PORTABILITY_SCHEMA_VERSION = '1.0.0' as const
export const STACK_PORTABILITY_SENTINEL = '@@STACK_PORTABILITY@@' as const

type FrameworkAdapter = 'react-web' | 'react-native' | 'vue' | 'angular'
type DecisionState = 'declared' | 'observed' | 'unknown' | 'conflict'
type HttpAdapter = 'openedx-get-http-client' | 'axios' | 'ky' | 'graphql-request' | 'apollo' | 'fetch'
type TransformAdapter = 'openedx-camel-case' | 'openedx-snake-case' | 'custom'

export interface ConventionDecision<T extends string> {
  state: DecisionState
  adapter: T | null
  symbol: string | null
  targetSpecific: boolean
  evidence: string[]
}

export interface StackPortabilityResult {
  schemaVersion: typeof STACK_PORTABILITY_SCHEMA_VERSION
  profileFingerprint: string
  status: 'ready' | 'needs_input'
  framework: {
    adapter: FrameworkAdapter | null
    strategy: 'reference-first' | 'framework-default' | 'unresolved'
    fallbackFiles: string[]
    capabilityFiles: string[]
    evidence: string[]
  }
  conventions: {
    http: ConventionDecision<HttpAdapter>
    responseTransform: ConventionDecision<TransformAdapter>
    requestTransform: ConventionDecision<TransformAdapter>
    mappingPolicy: 'named-feature-mapper'
  }
  assumptions: Array<{
    id: 'openedx-http-client' | 'openedx-response-transform' | 'openedx-request-transform' | 'paragon-ui'
    active: boolean
    evidence: string[]
  }>
  blockingFindings: string[]
  advisories: string[]
  evidencePaths: string[]
  resultHash: string
}

interface ScannedFile {
  path: string
  content: string
  instruction: boolean
}

interface Candidate<T extends string> {
  adapter: T
  symbol: string
  kind: 'declared' | 'observed'
  evidence: string
  available: boolean
}

const MAX_FILES = 512
const MAX_BYTES = 2 * 1024 * 1024
const MAX_DEPTH = 8
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue'])
const IGNORED_SEGMENTS = new Set(['.git', '.codegraph', '.next', 'dist', 'node_modules'])
const HTTP_ADAPTERS = ['openedx-get-http-client', 'axios', 'ky', 'graphql-request', 'apollo', 'fetch'] as const
const TRANSFORM_ADAPTERS = ['openedx-camel-case', 'openedx-snake-case', 'custom'] as const
const FRAMEWORK_ADAPTERS = ['react-web', 'react-native', 'vue', 'angular'] as const
const ASSUMPTION_IDS = ['openedx-http-client', 'openedx-response-transform', 'openedx-request-transform', 'paragon-ui'] as const

const FALLBACK_FILES: Record<FrameworkAdapter, string[]> = {
  'react-web': ['<Feature>.tsx', 'data/api.ts', 'data/transform.ts', 'data/types.ts'],
  'react-native': ['<Feature>.tsx', 'data/api.ts', 'data/transform.ts', 'data/types.ts'],
  vue: ['<Feature>.vue', 'api/<feature>.ts', 'data/transform.ts', 'data/types.ts'],
  angular: ['<feature>.component.html', '<feature>.component.ts', '<feature>.service.ts', 'data/types.ts'],
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactFields(value: Record<string, unknown>, fields: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...fields].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`stack-portability: ${label} fields must be exactly ${expected.join(', ')}`)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function boundedFiles(repoRoot: string, profile: ProjectProfile): ScannedFile[] {
  const root = fs.realpathSync(repoRoot)
  const files = new Map<string, ScannedFile>()
  let bytes = 0

  function addFile(absolute: string, instruction: boolean): void {
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || !stat.isFile()) return
    const relative = toPosix(path.relative(root, absolute))
    if (!relative || relative.split('/').some((segment) => segment === '..' || IGNORED_SEGMENTS.has(segment))) return
    if (!instruction && !SOURCE_EXTENSIONS.has(path.extname(relative))) return
    if (files.has(relative)) return
    if (files.size >= MAX_FILES) throw new Error(`stack-portability: source evidence exceeds ${MAX_FILES} files`)
    bytes += stat.size
    if (bytes > MAX_BYTES) throw new Error(`stack-portability: source evidence exceeds ${MAX_BYTES} bytes`)
    files.set(relative, { path: relative, content: fs.readFileSync(absolute, 'utf8'), instruction })
  }

  function walk(absolute: string, depth: number): void {
    if (depth > MAX_DEPTH || !within(root, absolute) || !fs.existsSync(absolute)) return
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink()) return
    if (stat.isFile()) {
      addFile(absolute, false)
      return
    }
    if (!stat.isDirectory()) return
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))
    for (const entry of entries) {
      if (IGNORED_SEGMENTS.has(entry.name)) continue
      walk(path.join(absolute, entry.name), depth + 1)
    }
  }

  for (const sourceRoot of profile.evidenceBoundary.sourceRoots) {
    const absolute = path.resolve(root, ...sourceRoot.replace(/\\/g, '/').split('/'))
    if (!within(root, absolute)) throw new Error('stack-portability: profile source root escapes the repository')
    walk(absolute, 0)
  }
  for (const instruction of profile.evidenceBoundary.instructionFiles) {
    const absolute = path.resolve(root, ...instruction.replace(/\\/g, '/').split('/'))
    if (!within(root, absolute)) throw new Error('stack-portability: instruction path escapes the repository')
    if (fs.existsSync(absolute)) addFile(absolute, true)
  }
  return [...files.values()].sort((left, right) => compareText(left.path, right.path))
}

function declaration(content: string, key: string): string[] {
  const values: string[] = []
  const direct = new RegExp(`\\b${key}\\b\\s*[:=]\\s*([^\\s#|]+)`, 'gi')
  const table = new RegExp(`\\|\\s*${key}\\s*\\|\\s*([^|]+)\\|`, 'gi')
  for (const match of content.matchAll(direct)) values.push(match[1].trim())
  for (const match of content.matchAll(table)) values.push(match[1].trim())
  return stableUnique(values)
}

function identifier(value: string): string | null {
  return value.match(/[A-Za-z_$][\w$]*/)?.[0] ?? null
}

function packageAvailable(profile: ProjectProfile, adapter: HttpAdapter | TransformAdapter): boolean {
  const clients = new Set(profile.conventions.httpClients.implementations)
  if (adapter === 'openedx-get-http-client' || adapter === 'openedx-camel-case' || adapter === 'openedx-snake-case') return clients.has('openedx-http-client')
  if (adapter === 'axios' || adapter === 'ky' || adapter === 'graphql-request' || adapter === 'apollo') return clients.has(adapter === 'apollo' ? 'apollo-client' : adapter)
  return true
}

function httpAdapter(symbol: string): HttpAdapter | null {
  const normalized = symbol.toLowerCase()
  if (normalized === 'gethttpclient') return 'openedx-get-http-client'
  if (normalized === 'axios') return 'axios'
  if (normalized === 'ky') return 'ky'
  if (normalized === 'graphqlclient' || normalized === 'request') return 'graphql-request'
  if (normalized === 'apolloclient' || normalized === 'usequery') return 'apollo'
  if (normalized === 'fetch') return 'fetch'
  return null
}

function transformAdapter(symbol: string): TransformAdapter {
  if (symbol === 'camelCaseObject') return 'openedx-camel-case'
  if (symbol === 'snakeCaseObject') return 'openedx-snake-case'
  return 'custom'
}

function collectCandidates(profile: ProjectProfile, files: ScannedFile[]): {
  http: Candidate<HttpAdapter>[]
  response: Candidate<TransformAdapter>[]
  request: Candidate<TransformAdapter>[]
} {
  const http: Candidate<HttpAdapter>[] = []
  const response: Candidate<TransformAdapter>[] = []
  const request: Candidate<TransformAdapter>[] = []
  const push = <T extends string>(target: Candidate<T>[], candidate: Candidate<T>) => target.push(candidate)

  for (const file of files) {
    if (file.instruction) {
      for (const value of declaration(file.content, 'http_client')) {
        const symbol = identifier(value)
        const adapter = symbol ? httpAdapter(symbol) : null
        if (symbol && adapter) push(http, { adapter, symbol, kind: 'declared', evidence: `instruction:${file.path}#http_client=${symbol}`, available: packageAvailable(profile, adapter) })
      }
      for (const [key, target] of [['response_transform', response], ['request_transform', request]] as const) {
        for (const value of declaration(file.content, key)) {
          const symbol = identifier(value)
          if (symbol) {
            const adapter = transformAdapter(symbol)
            push(target, { adapter, symbol, kind: 'declared', evidence: `instruction:${file.path}#${key}=${symbol}`, available: packageAvailable(profile, adapter) })
          }
        }
      }
      continue
    }

    const observations: Array<[RegExp, HttpAdapter, string]> = [
      [/from\s+['"]@edx\/frontend-platform\/auth['"][\s\S]*?\bgetHttpClient\s*\(|\bgetHttpClient\s*\([\s\S]*?from\s+['"]@edx\/frontend-platform\/auth['"]/, 'openedx-get-http-client', 'getHttpClient'],
      [/from\s+['"]axios['"]|require\(['"]axios['"]\)/, 'axios', 'axios'],
      [/from\s+['"]ky['"]|require\(['"]ky['"]\)/, 'ky', 'ky'],
      [/from\s+['"]graphql-request['"]|require\(['"]graphql-request['"]\)/, 'graphql-request', 'GraphQLClient'],
      [/from\s+['"]@apollo\/client['"]|require\(['"]@apollo\/client['"]\)/, 'apollo', 'ApolloClient'],
      [/\bfetch\s*\(/, 'fetch', 'fetch'],
    ]
    for (const [pattern, adapter, symbol] of observations) {
      if (pattern.test(file.content)) push(http, { adapter, symbol, kind: 'observed', evidence: `source:${file.path}#${symbol}`, available: true })
    }
    if (/from\s+['"]@edx\/frontend-platform['"][\s\S]*?\bcamelCaseObject\s*\(|\bcamelCaseObject\s*\([\s\S]*?from\s+['"]@edx\/frontend-platform['"]/.test(file.content)) {
      push(response, { adapter: 'openedx-camel-case', symbol: 'camelCaseObject', kind: 'observed', evidence: `source:${file.path}#camelCaseObject`, available: true })
    }
    if (/from\s+['"]@edx\/frontend-platform['"][\s\S]*?\bsnakeCaseObject\s*\(|\bsnakeCaseObject\s*\([\s\S]*?from\s+['"]@edx\/frontend-platform['"]/.test(file.content)) {
      push(request, { adapter: 'openedx-snake-case', symbol: 'snakeCaseObject', kind: 'observed', evidence: `source:${file.path}#snakeCaseObject`, available: true })
    }
  }
  return { http, response, request }
}

function decide<T extends string>(candidates: Candidate<T>[], unknownEvidence: string): ConventionDecision<T> {
  const unavailable = candidates.filter((candidate) => !candidate.available)
  const usable = candidates.filter((candidate) => candidate.available)
  const identities = stableUnique(usable.map((candidate) => `${candidate.adapter}\u0000${candidate.symbol}`))
  const evidence = stableUnique([...candidates.map((candidate) => candidate.evidence), ...(unavailable.length ? ['project-profile:declared-adapter-unavailable'] : [])])
  if (unavailable.length > 0 || identities.length > 1) return { state: 'conflict', adapter: null, symbol: null, targetSpecific: false, evidence }
  if (identities.length === 0) return { state: 'unknown', adapter: null, symbol: null, targetSpecific: false, evidence: [unknownEvidence] }
  const selected = usable[0]
  const state = usable.some((candidate) => candidate.kind === 'observed') ? 'observed' : 'declared'
  return {
    state,
    adapter: selected.adapter,
    symbol: selected.symbol,
    targetSpecific: String(selected.adapter).startsWith('openedx-'),
    evidence,
  }
}

function capabilityFiles(profile: ProjectProfile, framework: FrameworkAdapter): string[] {
  const files: string[] = []
  if (profile.gates.i18n) files.push(framework === 'vue' ? 'i18n/<locale>.json' : framework === 'angular' ? '<feature>.messages.ts' : 'messages.ts')
  if (profile.gates.styling) files.push(framework === 'vue' ? '<Feature>.vue#style' : framework === 'react-native' ? '<Feature>.styles.ts' : framework === 'angular' ? '<feature>.component.scss' : '<Feature>.<detected-style-extension>')
  if (profile.dataLayer.implementations.some((entry) => entry === 'tanstack-query' || entry === 'react-query')) {
    files.push(framework === 'vue' ? 'composables/use<Feature>.ts' : framework === 'angular' ? '<feature>.service.ts' : framework === 'react-native' ? 'data/use<Feature>.ts' : 'data/apiHooks.ts')
  }
  return stableUnique(files)
}

function resultPayload(result: Omit<StackPortabilityResult, 'resultHash'>): string {
  return stableJson(result)
}

export function inspectStackPortability(repoRoot: string, suppliedProfile?: ProjectProfile): StackPortabilityResult {
  const profile = validateProjectProfile(suppliedProfile ?? inspectProject(repoRoot))
  const files = boundedFiles(repoRoot, profile)
  const candidates = collectCandidates(profile, files)
  const http = decide(candidates.http, 'project-evidence:http-client=unknown')
  const responseTransform = decide(candidates.response, 'policy:named-feature-mapper; helper=unknown')
  const requestTransform = decide(candidates.request, 'project-evidence:request-transform=unknown')
  const framework = profile.framework.value
  const blockingFindings = stableUnique([
    ...profile.issues.map((issue) => `project-profile:${issue.code}`),
    ...(http.state === 'conflict' ? ['http-adapter-conflict'] : []),
    ...(responseTransform.state === 'conflict' ? ['response-transform-conflict'] : []),
    ...(requestTransform.state === 'conflict' ? ['request-transform-conflict'] : []),
    ...(!framework ? ['framework-unsupported-or-unknown'] : []),
  ])
  const advisories = stableUnique([
    ...(http.state === 'unknown' ? ['http-client-requires-input-before-http-feature'] : []),
    ...(responseTransform.state === 'unknown' ? ['use-named-feature-mapper-without-project-transform-helper'] : []),
    ...(requestTransform.state === 'unknown' ? ['request-transform-requires-input-before-mutation'] : []),
  ])
  const frameworkEvidence = stableUnique([
    ...profile.framework.evidence.map((entry) => `project-profile:${entry}`),
    ...profile.referenceFeatures.map((entry) => `project-profile:reference=${entry.path}`),
  ])
  const frameworkResult = {
    adapter: framework,
    strategy: !framework ? 'unresolved' as const : profile.referenceFeatures.length > 0 ? 'reference-first' as const : 'framework-default' as const,
    fallbackFiles: framework ? [...FALLBACK_FILES[framework]] : [],
    capabilityFiles: framework ? capabilityFiles(profile, framework) : [],
    evidence: frameworkEvidence.length > 0 ? frameworkEvidence : ['project-profile:framework=unknown'],
  }
  const assumptions: StackPortabilityResult['assumptions'] = [
    { id: 'openedx-http-client', active: http.adapter === 'openedx-get-http-client', evidence: http.adapter === 'openedx-get-http-client' ? http.evidence : ['portability:http-adapter-not-openedx'] },
    { id: 'openedx-response-transform', active: responseTransform.adapter === 'openedx-camel-case', evidence: responseTransform.adapter === 'openedx-camel-case' ? responseTransform.evidence : ['portability:response-transform-not-openedx'] },
    { id: 'openedx-request-transform', active: requestTransform.adapter === 'openedx-snake-case', evidence: requestTransform.adapter === 'openedx-snake-case' ? requestTransform.evidence : ['portability:request-transform-not-openedx'] },
    { id: 'paragon-ui', active: profile.conventions.uiLibraries.implementations.includes('paragon'), evidence: profile.conventions.uiLibraries.implementations.includes('paragon') ? profile.conventions.uiLibraries.evidence.map((entry) => `project-profile:${entry}`) : ['portability:ui-library-not-paragon'] },
  ].map((entry) => ({ ...entry, evidence: stableUnique(entry.evidence) }))
  const evidencePaths = stableUnique([
    ...profile.evidencePaths.map((entry) => `project-profile:${entry}`),
    ...files.map((file) => `repository:${file.path}`),
  ])
  const withoutHash: Omit<StackPortabilityResult, 'resultHash'> = {
    schemaVersion: STACK_PORTABILITY_SCHEMA_VERSION,
    profileFingerprint: profile.repository.fingerprint,
    status: blockingFindings.length === 0 ? 'ready' : 'needs_input',
    framework: frameworkResult,
    conventions: { http, responseTransform, requestTransform, mappingPolicy: 'named-feature-mapper' },
    assumptions,
    blockingFindings,
    advisories,
    evidencePaths,
  }
  return validateStackPortabilityResult({ ...withoutHash, resultHash: sha256(resultPayload(withoutHash)) })
}

function validateStringArray(value: unknown, label: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry === '') || JSON.stringify(value) !== JSON.stringify(stableUnique(value as string[]))) {
    throw new Error(`stack-portability: ${label} must be sorted unique non-empty strings`)
  }
  if (!allowEmpty && value.length === 0) throw new Error(`stack-portability: ${label} must not be empty`)
  return value as string[]
}

function validateDecision<T extends string>(value: unknown, adapters: readonly T[], label: string): ConventionDecision<T> {
  if (!isRecord(value)) throw new Error(`stack-portability: ${label} must be an object`)
  exactFields(value, ['state', 'adapter', 'symbol', 'targetSpecific', 'evidence'], label)
  if (!['declared', 'observed', 'unknown', 'conflict'].includes(String(value.state))) throw new Error(`stack-portability: ${label}.state is invalid`)
  if (value.adapter !== null && !adapters.includes(value.adapter as T)) throw new Error(`stack-portability: ${label}.adapter is invalid`)
  if (value.symbol !== null && (typeof value.symbol !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(value.symbol))) throw new Error(`stack-portability: ${label}.symbol is invalid`)
  if (typeof value.targetSpecific !== 'boolean') throw new Error(`stack-portability: ${label}.targetSpecific must be boolean`)
  validateStringArray(value.evidence, `${label}.evidence`, false)
  if ((value.state === 'unknown' || value.state === 'conflict') && (value.adapter !== null || value.symbol !== null || value.targetSpecific !== false)) throw new Error(`stack-portability: ${label} unresolved decision is contradictory`)
  if ((value.state === 'declared' || value.state === 'observed') && (value.adapter === null || value.symbol === null)) throw new Error(`stack-portability: ${label} resolved decision is incomplete`)
  if (value.targetSpecific !== (typeof value.adapter === 'string' && value.adapter.startsWith('openedx-'))) throw new Error(`stack-portability: ${label}.targetSpecific contradicts adapter`)
  return value as unknown as ConventionDecision<T>
}

export function validateStackPortabilityResult(value: unknown): StackPortabilityResult {
  if (!isRecord(value)) throw new Error('stack-portability: result must be an object')
  exactFields(value, ['schemaVersion', 'profileFingerprint', 'status', 'framework', 'conventions', 'assumptions', 'blockingFindings', 'advisories', 'evidencePaths', 'resultHash'], 'result')
  if (value.schemaVersion !== STACK_PORTABILITY_SCHEMA_VERSION) throw new Error(`stack-portability: unsupported schemaVersion ${String(value.schemaVersion)}`)
  if (typeof value.profileFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.profileFingerprint)) throw new Error('stack-portability: profileFingerprint must be lowercase SHA-256')
  if (value.status !== 'ready' && value.status !== 'needs_input') throw new Error('stack-portability: result status is invalid')
  if (!isRecord(value.framework)) throw new Error('stack-portability: framework must be an object')
  exactFields(value.framework, ['adapter', 'strategy', 'fallbackFiles', 'capabilityFiles', 'evidence'], 'framework')
  if (value.framework.adapter !== null && !FRAMEWORK_ADAPTERS.includes(value.framework.adapter as FrameworkAdapter)) throw new Error('stack-portability: framework.adapter is invalid')
  if (!['reference-first', 'framework-default', 'unresolved'].includes(String(value.framework.strategy))) throw new Error('stack-portability: framework.strategy is invalid')
  validateStringArray(value.framework.fallbackFiles, 'framework.fallbackFiles')
  validateStringArray(value.framework.capabilityFiles, 'framework.capabilityFiles')
  validateStringArray(value.framework.evidence, 'framework.evidence', false)
  if ((value.framework.adapter === null) !== (value.framework.strategy === 'unresolved')) throw new Error('stack-portability: framework resolution is contradictory')
  if (value.framework.adapter === null) {
    if (value.framework.fallbackFiles.length !== 0 || value.framework.capabilityFiles.length !== 0) throw new Error('stack-portability: unresolved framework must not declare files')
  } else if (JSON.stringify(value.framework.fallbackFiles) !== JSON.stringify(FALLBACK_FILES[value.framework.adapter as FrameworkAdapter])) {
    throw new Error('stack-portability: framework fallbackFiles contradict adapter')
  }
  if (!isRecord(value.conventions)) throw new Error('stack-portability: conventions must be an object')
  exactFields(value.conventions, ['http', 'responseTransform', 'requestTransform', 'mappingPolicy'], 'conventions')
  const http = validateDecision(value.conventions.http, HTTP_ADAPTERS, 'conventions.http')
  const responseTransform = validateDecision(value.conventions.responseTransform, TRANSFORM_ADAPTERS, 'conventions.responseTransform')
  const requestTransform = validateDecision(value.conventions.requestTransform, TRANSFORM_ADAPTERS, 'conventions.requestTransform')
  if (value.conventions.mappingPolicy !== 'named-feature-mapper') throw new Error('stack-portability: conventions.mappingPolicy is invalid')
  if (!Array.isArray(value.assumptions) || value.assumptions.length !== ASSUMPTION_IDS.length) throw new Error('stack-portability: assumptions must contain every declared target assumption')
  for (const [index, assumption] of value.assumptions.entries()) {
    if (!isRecord(assumption)) throw new Error(`stack-portability: assumptions[${index}] must be an object`)
    exactFields(assumption, ['id', 'active', 'evidence'], `assumptions[${index}]`)
    if (assumption.id !== ASSUMPTION_IDS[index]) throw new Error('stack-portability: assumption order or identity is invalid')
    if (typeof assumption.active !== 'boolean') throw new Error(`stack-portability: assumptions[${index}].active must be boolean`)
    validateStringArray(assumption.evidence, `assumptions[${index}].evidence`, false)
  }
  const expectedOpenedxAssumptions = [
    http.adapter === 'openedx-get-http-client',
    responseTransform.adapter === 'openedx-camel-case',
    requestTransform.adapter === 'openedx-snake-case',
  ]
  for (const [index, expected] of expectedOpenedxAssumptions.entries()) {
    if ((value.assumptions[index] as Record<string, unknown>).active !== expected) throw new Error(`stack-portability: assumptions[${index}].active contradicts convention decision`)
  }
  const blockingFindings = validateStringArray(value.blockingFindings, 'blockingFindings')
  const advisories = validateStringArray(value.advisories, 'advisories')
  validateStringArray(value.evidencePaths, 'evidencePaths', false)
  if (value.status !== (blockingFindings.length === 0 ? 'ready' : 'needs_input')) throw new Error('stack-portability: status contradicts blockingFindings')
  const requiredBlocking: Array<[boolean, string]> = [
    [value.framework.adapter === null, 'framework-unsupported-or-unknown'],
    [http.state === 'conflict', 'http-adapter-conflict'],
    [responseTransform.state === 'conflict', 'response-transform-conflict'],
    [requestTransform.state === 'conflict', 'request-transform-conflict'],
  ]
  for (const [required, finding] of requiredBlocking) {
    if (blockingFindings.includes(finding) !== required) throw new Error(`stack-portability: ${finding} contradicts resolved decisions`)
  }
  const expectedAdvisories = stableUnique([
    ...(http.state === 'unknown' ? ['http-client-requires-input-before-http-feature'] : []),
    ...(responseTransform.state === 'unknown' ? ['use-named-feature-mapper-without-project-transform-helper'] : []),
    ...(requestTransform.state === 'unknown' ? ['request-transform-requires-input-before-mutation'] : []),
  ])
  if (JSON.stringify(advisories) !== JSON.stringify(expectedAdvisories)) throw new Error('stack-portability: advisories contradict resolved decisions')
  if (typeof value.resultHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resultHash)) throw new Error('stack-portability: resultHash must be lowercase SHA-256')
  const result = value as unknown as StackPortabilityResult
  const { resultHash, ...withoutHash } = result
  if (resultHash !== sha256(resultPayload(withoutHash))) throw new Error('stack-portability: resultHash mismatch')
  return result
}

export function runStackPortabilityCli(argv = process.argv.slice(2)): number {
  if (argv.length !== 1 || argv[0].trim() === '') {
    console.error('usage: stack-portability.ts <repository-root>')
    return 2
  }
  try {
    const result = inspectStackPortability(argv[0])
    console.log(`${STACK_PORTABILITY_SENTINEL}${JSON.stringify(result)}`)
    return result.status === 'ready' ? 0 : 1
  } catch (error) {
    console.error(`stack-portability: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

if (require.main === module) process.exit(runStackPortabilityCli())
