#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import { ProjectProfile, validateProjectProfile } from './project-intelligence'

export const CONDITIONAL_GATES_SCHEMA_VERSION = '1.0.0' as const
export const CONDITIONAL_GATES_SENTINEL = '@@CONDITIONAL_GATES@@' as const

export type ConditionalGateId = 'i18n-completeness' | 'router-registration' | 'style-ownership'
export type ConditionalGateStatus = 'pass' | 'fail' | 'needs_input' | 'not_applicable'

export interface FeatureChangeFile {
  path: string
  content: string
}

export interface ConditionalGateRequest {
  profile: ProjectProfile
  feature: {
    changeScope: 'ui' | 'non-ui'
    desiredRoute: string | null
    files: FeatureChangeFile[]
  }
}

export interface ConditionalGateDecision {
  id: ConditionalGateId
  applicable: boolean
  status: ConditionalGateStatus
  evidence: string[]
  findings: string[]
}

export interface ConditionalGateResult {
  schemaVersion: typeof CONDITIONAL_GATES_SCHEMA_VERSION
  profileFingerprint: string
  status: 'pass' | 'fail' | 'needs_input'
  gates: ConditionalGateDecision[]
  resultHash: string
}

const GATE_ORDER: ConditionalGateId[] = ['i18n-completeness', 'router-registration', 'style-ownership']
const MAX_FILES = 512
const MAX_CONTENT_BYTES = 2 * 1024 * 1024

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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`conditional-gates: ${label} fields must be exactly ${expected.join(', ')}`)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function safeRelativePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`conditional-gates: ${label} must be a non-empty path`)
  const normalized = value.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some((segment) => segment === '..' || segment === '')) {
    throw new Error(`conditional-gates: ${label} must stay inside the feature evidence root`)
  }
  return normalized
}

function validateRequest(value: unknown): ConditionalGateRequest {
  if (!isRecord(value)) throw new Error('conditional-gates: request must be an object')
  exactFields(value, ['profile', 'feature'], 'request')
  const profile = validateProjectProfile(value.profile)
  if (!isRecord(value.feature)) throw new Error('conditional-gates: feature must be an object')
  exactFields(value.feature, ['changeScope', 'desiredRoute', 'files'], 'feature')
  if (value.feature.changeScope !== 'ui' && value.feature.changeScope !== 'non-ui') throw new Error('conditional-gates: feature.changeScope must be ui or non-ui')
  const requestedRoute = value.feature.desiredRoute
  let desiredRoute: string | null
  if (requestedRoute === null) desiredRoute = null
  else if (typeof requestedRoute === 'string' && requestedRoute.trim() !== '') desiredRoute = requestedRoute
  else throw new Error('conditional-gates: feature.desiredRoute must be a non-empty string or null')
  if (!Array.isArray(value.feature.files) || value.feature.files.length > MAX_FILES) throw new Error(`conditional-gates: feature.files must contain at most ${MAX_FILES} files`)
  const seen = new Set<string>()
  let bytes = 0
  const files = value.feature.files.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`conditional-gates: feature.files[${index}] must be an object`)
    exactFields(entry, ['path', 'content'], `feature.files[${index}]`)
    const filePath = safeRelativePath(entry.path, `feature.files[${index}].path`)
    if (seen.has(filePath)) throw new Error(`conditional-gates: duplicate feature file ${filePath}`)
    seen.add(filePath)
    if (typeof entry.content !== 'string') throw new Error(`conditional-gates: feature.files[${index}].content must be a string`)
    bytes += Buffer.byteLength(entry.content)
    return { path: filePath, content: entry.content }
  }).sort((left, right) => compareText(left.path, right.path))
  if (bytes > MAX_CONTENT_BYTES) throw new Error(`conditional-gates: feature file content exceeds ${MAX_CONTENT_BYTES} bytes`)
  return {
    profile,
    feature: {
      changeScope: value.feature.changeScope,
      desiredRoute,
      files,
    },
  }
}

function profileEvidence(profile: ProjectProfile, capability: 'i18n' | 'router' | 'styling'): string[] {
  const evidence = profile[capability].evidence.map((entry) => `project-profile:${entry}`)
  return stableUnique([...evidence, `project-profile:gates.${capability}=${String(profile.gates[capability])}`])
}

function decision(
  id: ConditionalGateId,
  applicable: boolean,
  status: ConditionalGateStatus,
  evidence: string[],
  findings: string[] = [],
): ConditionalGateDecision {
  const normalizedEvidence = stableUnique(evidence)
  if (normalizedEvidence.length === 0) throw new Error(`conditional-gates: ${id} decision must cite evidence`)
  return { id, applicable, status, evidence: normalizedEvidence, findings: stableUnique(findings) }
}

function blockedDecisions(profile: ProjectProfile): ConditionalGateDecision[] {
  const issueEvidence = profile.issues.flatMap((issue) => [
    `project-profile:issue:${issue.code}`,
    ...issue.evidence.map((entry) => `project-profile:${entry}`),
  ])
  return GATE_ORDER.map((id) => {
    const capability = id === 'i18n-completeness' ? 'i18n' : id === 'router-registration' ? 'router' : 'styling'
    return decision(id, true, 'needs_input', [
      `project-profile:status=${profile.status}`,
      ...profileEvidence(profile, capability),
      ...issueEvidence,
    ], ['project-profile-needs-input'])
  })
}

function nonUiDecisions(profile: ProjectProfile): ConditionalGateDecision[] {
  return GATE_ORDER.map((id) => {
    const capability = id === 'i18n-completeness' ? 'i18n' : id === 'router-registration' ? 'router' : 'styling'
    return decision(id, false, 'not_applicable', [
      'feature-change:scope=non-ui',
      ...profileEvidence(profile, capability),
    ])
  })
}

function uiFiles(files: FeatureChangeFile[]): FeatureChangeFile[] {
  return files.filter((file) => /\.(?:[jt]sx|vue|html)$/.test(file.path) && !/\.(?:test|spec)\.[jt]sx?$/.test(file.path))
}

function evaluateI18n(profile: ProjectProfile, files: FeatureChangeFile[]): ConditionalGateDecision {
  const base = profileEvidence(profile, 'i18n')
  if (!profile.gates.i18n) return decision('i18n-completeness', false, 'not_applicable', base)
  const ui = uiFiles(files)
  if (ui.length === 0) return decision('i18n-completeness', true, 'needs_input', [...base, 'feature-change:ui-files=0'], ['i18n-ui-evidence-missing'])
  const messageFiles = files.filter((file) => /(^|\/)(?:messages?|i18n|locales?|translations?)(?:\/|\.)/i.test(file.path) || /defineMessages\s*\(/.test(file.content))
  const usageFiles = ui.filter((file) => /(?:\b(?:formatMessage|FormattedMessage|useIntl|useTranslation|useI18n|translate)\b|\$t\b|\$localize\b)/.test(file.content))
  const evidence = [...base, ...messageFiles.map((file) => `feature-file:${file.path}`), ...usageFiles.map((file) => `feature-file:${file.path}`)]
  const findings: string[] = []
  if (messageFiles.length === 0) findings.push('i18n-message-source-missing')
  if (usageFiles.length === 0) findings.push('i18n-usage-missing')
  return decision('i18n-completeness', true, findings.length === 0 ? 'pass' : 'fail', evidence.length > base.length ? evidence : [...base, `feature-change:file-count=${files.length}`], findings)
}

function normalizeRoute(value: string): string {
  const noQuery = value.trim().split(/[?#]/, 1)[0]
  const withSlash = noQuery.startsWith('/') ? noQuery : `/${noQuery}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/g, '') : withSlash
}

function evaluateRouter(profile: ProjectProfile, request: ConditionalGateRequest['feature']): ConditionalGateDecision {
  const base = profileEvidence(profile, 'router')
  if (!profile.gates.router) return decision('router-registration', false, 'not_applicable', base)
  if (request.desiredRoute === null) return decision('router-registration', true, 'needs_input', [...base, 'feature-change:desired-route=missing'], ['desired-route-missing'])
  const route = normalizeRoute(request.desiredRoute)
  const routeFiles = request.files.filter((file) => /(^|\/)(?:routes?|router)(?:\/|\.)/i.test(file.path) || /(^|\/)app\.[jt]sx?$/.test(file.path))
  const registered = routeFiles.filter((file) => file.content.includes(route))
  const expoFileRoute = profile.router.implementations.includes('expo-router')
    ? request.files.filter((file) => file.path.startsWith(`app${route}/`) || file.path === `app${route}.tsx` || file.path === `app${route}/index.tsx`)
    : []
  const hits = [...registered, ...expoFileRoute]
  const evidence = [...base, `feature-change:desired-route=${route}`, ...hits.map((file) => `feature-file:${file.path}`)]
  return decision('router-registration', true, hits.length > 0 ? 'pass' : 'fail', evidence, hits.length > 0 ? [] : ['route-registration-missing'])
}

function evaluateStyle(profile: ProjectProfile, files: FeatureChangeFile[]): ConditionalGateDecision {
  const base = profileEvidence(profile, 'styling')
  if (!profile.gates.styling) return decision('style-ownership', false, 'not_applicable', base)
  const ui = uiFiles(files)
  if (ui.length === 0) return decision('style-ownership', true, 'needs_input', [...base, 'feature-change:ui-files=0'], ['style-ui-evidence-missing'])
  const implementations = new Set(profile.styling.implementations)
  const hits: FeatureChangeFile[] = []
  for (const file of files) {
    if ((implementations.has('sass') || implementations.has('scss')) && file.path.endsWith('.scss')) hits.push(file)
    if ((implementations.has('sass') || implementations.has('scss')) && file.path.endsWith('.sass')) hits.push(file)
    if (implementations.has('css') && file.path.endsWith('.css')) hits.push(file)
    if (implementations.has('styled-components') && /(?:from\s+['"]styled-components['"]|\bstyled\.)/.test(file.content)) hits.push(file)
    if (implementations.has('emotion') && /(?:@emotion\/|\bcss=|\bstyled\()/.test(file.content)) hits.push(file)
    if (implementations.has('tailwind') && /\b(?:className|class)\s*=/.test(file.content)) hits.push(file)
    if (implementations.has('react-native-core') && /\b(?:StyleSheet\.create|style=)/.test(file.content)) hits.push(file)
  }
  const recognized = ['scss', 'sass', 'css', 'styled-components', 'emotion', 'tailwind', 'react-native-core'].some((entry) => implementations.has(entry))
  const evidence = [...base, ...stableUnique(hits.map((file) => `feature-file:${file.path}`))]
  if (!recognized) return decision('style-ownership', true, 'needs_input', [...evidence, 'project-profile:styling-implementation=unrecognized'], ['style-ownership-unknown'])
  return decision('style-ownership', true, hits.length > 0 ? 'pass' : 'fail', evidence.length > base.length ? evidence : [...base, `feature-change:file-count=${files.length}`], hits.length > 0 ? [] : ['detected-style-system-not-used'])
}

function resultPayload(result: Omit<ConditionalGateResult, 'resultHash'>): string {
  return stableJson(result)
}

export function evaluateConditionalQualityGates(value: unknown): ConditionalGateResult {
  const request = validateRequest(value)
  const gates = request.profile.status === 'needs_input'
    ? blockedDecisions(request.profile)
    : request.feature.changeScope === 'non-ui'
      ? nonUiDecisions(request.profile)
      : [evaluateI18n(request.profile, request.feature.files), evaluateRouter(request.profile, request.feature), evaluateStyle(request.profile, request.feature.files)]
  const status = gates.some((gate) => gate.status === 'needs_input') ? 'needs_input' : gates.some((gate) => gate.status === 'fail') ? 'fail' : 'pass'
  return validateConditionalGateResult({
    schemaVersion: CONDITIONAL_GATES_SCHEMA_VERSION,
    profileFingerprint: request.profile.repository.fingerprint,
    status,
    gates,
    resultHash: sha256(resultPayload({ schemaVersion: CONDITIONAL_GATES_SCHEMA_VERSION, profileFingerprint: request.profile.repository.fingerprint, status, gates })),
  })
}

export function validateConditionalGateResult(value: unknown): ConditionalGateResult {
  if (!isRecord(value)) throw new Error('conditional-gates: result must be an object')
  exactFields(value, ['schemaVersion', 'profileFingerprint', 'status', 'gates', 'resultHash'], 'result')
  if (value.schemaVersion !== CONDITIONAL_GATES_SCHEMA_VERSION) throw new Error(`conditional-gates: unsupported schemaVersion ${String(value.schemaVersion)}`)
  if (typeof value.profileFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(value.profileFingerprint)) throw new Error('conditional-gates: profileFingerprint must be lowercase SHA-256')
  if (!['pass', 'fail', 'needs_input'].includes(String(value.status))) throw new Error('conditional-gates: result status is invalid')
  if (!Array.isArray(value.gates) || value.gates.length !== GATE_ORDER.length) throw new Error('conditional-gates: result must contain exactly three gates')
  for (const [index, entry] of value.gates.entries()) {
    if (!isRecord(entry)) throw new Error(`conditional-gates: gates[${index}] must be an object`)
    exactFields(entry, ['id', 'applicable', 'status', 'evidence', 'findings'], `gates[${index}]`)
    if (entry.id !== GATE_ORDER[index]) throw new Error('conditional-gates: gate order or identity is invalid')
    if (typeof entry.applicable !== 'boolean') throw new Error(`conditional-gates: gates[${index}].applicable must be boolean`)
    if (!['pass', 'fail', 'needs_input', 'not_applicable'].includes(String(entry.status))) throw new Error(`conditional-gates: gates[${index}].status is invalid`)
    for (const key of ['evidence', 'findings'] as const) {
      if (!Array.isArray(entry[key]) || entry[key].some((item) => typeof item !== 'string') || JSON.stringify(entry[key]) !== JSON.stringify(stableUnique(entry[key] as string[]))) {
        throw new Error(`conditional-gates: gates[${index}].${key} must be sorted unique strings`)
      }
    }
    if ((entry.evidence as unknown[]).length === 0) throw new Error(`conditional-gates: gates[${index}] must cite evidence`)
    if (entry.status === 'not_applicable' && entry.applicable !== false) throw new Error(`conditional-gates: gates[${index}] not_applicable must have applicable=false`)
    if (entry.status !== 'not_applicable' && entry.applicable !== true) throw new Error(`conditional-gates: gates[${index}] active status must have applicable=true`)
  }
  const gates = value.gates as unknown as ConditionalGateDecision[]
  const expectedStatus = gates.some((gate) => gate.status === 'needs_input') ? 'needs_input' : gates.some((gate) => gate.status === 'fail') ? 'fail' : 'pass'
  if (value.status !== expectedStatus) throw new Error('conditional-gates: result status does not match gate decisions')
  if (typeof value.resultHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.resultHash)) throw new Error('conditional-gates: resultHash must be lowercase SHA-256')
  const result = value as unknown as ConditionalGateResult
  const expectedHash = sha256(resultPayload({ schemaVersion: result.schemaVersion, profileFingerprint: result.profileFingerprint, status: result.status, gates: result.gates }))
  if (result.resultHash !== expectedHash) throw new Error('conditional-gates: resultHash mismatch')
  return result
}

export function runConditionalQualityGatesCli(): number {
  try {
    const input = fs.readFileSync(0, 'utf8')
    if (Buffer.byteLength(input) > MAX_CONTENT_BYTES * 2) throw new Error('conditional-gates: stdin exceeds the bounded request size')
    const result = evaluateConditionalQualityGates(JSON.parse(input) as unknown)
    console.log(`${CONDITIONAL_GATES_SENTINEL}${JSON.stringify(result)}`)
    return result.status === 'pass' ? 0 : 1
  } catch (error) {
    console.error(`conditional-gates: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

if (require.main === module) process.exit(runConditionalQualityGatesCli())
