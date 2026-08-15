#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SCHEMA_ID = 'https://schemas.workflow-kit.dev/privacy-writer-registry.schema.json'
const ROOT_KEYS = ['$schema', 'entries', 'policyVersion', 'repository', 'schemaVersion', 'scope']
const ENTRY_KEYS = [
  'currentPrivacyState', 'dataFamilies', 'disposition', 'id', 'prohibitedFieldObservations',
  'rationaleCode', 'sourceAnchor', 'sourcePath', 'targetWave', 'transport',
]
const TRANSPORTS = ['external_http', 'in_process', 'local_http', 'supabase_admin', 'supabase_client', 'supabase_rest', 'supabase_rpc']
const FAMILIES = [
  'command_run', 'error_signal', 'external_notification', 'identity_control', 'install_run',
  'legacy_feature_event', 'legacy_orchestrator_state', 'operator_execution', 'progress',
  'release_evidence', 'token_usage', 'verification',
]
const PRIVACY_STATES = ['contract_validated', 'legacy_raw', 'outside_central_scope', 'partially_minimized', 'test_fixture']
const PROHIBITED = [
  'arbitrary_content', 'auth_secret', 'raw_email', 'raw_feature_name', 'raw_log', 'raw_message',
  'raw_path', 'raw_prompt', 'raw_repository', 'raw_url',
]
const WAVES = ['B2', 'B3', 'B4', 'none']
const DISPOSITIONS = [
  'adapter_planned', 'deferred_identity', 'external_transport', 'fail_closed', 'local_only_required',
  'local_store_required', 'migration_blocked', 'test_only',
]

type JsonObject = Record<string, unknown>

function exactKeys(value: JsonObject, expected: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function canonical(values: string[]): boolean {
  return JSON.stringify(values) === JSON.stringify([...values].sort()) && new Set(values).size === values.length
}

function plain(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function safeRelativeSource(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 180 && !value.includes('\\')
    && !path.posix.isAbsolute(value) && !/^[A-Za-z]:/.test(value)
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function validateRegistry(value: unknown, root: string): string[] {
  const errors: string[] = []
  if (!plain(value) || !exactKeys(value, ROOT_KEYS)) return ['root_not_exact']
  if (value.$schema !== SCHEMA_ID || value.schemaVersion !== 1 || value.policyVersion !== 'p17-016-v1'
    || value.repository !== 'claude-workflow-kit' || value.scope !== 'writer-entry-points' || !Array.isArray(value.entries)) {
    return ['root_contract_invalid']
  }
  const ids: string[] = []
  const anchors: string[] = []
  for (const candidate of value.entries) {
    if (!plain(candidate) || !exactKeys(candidate, ENTRY_KEYS)) { errors.push('entry_not_exact'); continue }
    const entry = candidate as JsonObject
    if (typeof entry.id !== 'string' || !/^[a-z][a-z0-9.-]{2,79}$/.test(entry.id)) errors.push('id_invalid')
    if (!safeRelativeSource(entry.sourcePath)) errors.push('source_path_invalid')
    if (typeof entry.sourceAnchor !== 'string' || entry.sourceAnchor.length < 8 || entry.sourceAnchor.length > 180) errors.push('source_anchor_invalid')
    if (!TRANSPORTS.includes(String(entry.transport))) errors.push('transport_invalid')
    if (!Array.isArray(entry.dataFamilies) || entry.dataFamilies.length === 0
      || !entry.dataFamilies.every((item) => typeof item === 'string' && FAMILIES.includes(item))
      || !canonical(entry.dataFamilies as string[])) errors.push('families_invalid')
    if (!PRIVACY_STATES.includes(String(entry.currentPrivacyState))) errors.push('privacy_state_invalid')
    if (!Array.isArray(entry.prohibitedFieldObservations)
      || !entry.prohibitedFieldObservations.every((item) => typeof item === 'string' && PROHIBITED.includes(item))
      || !canonical(entry.prohibitedFieldObservations as string[])) errors.push('prohibited_fields_invalid')
    if (!WAVES.includes(String(entry.targetWave))) errors.push('wave_invalid')
    if (!DISPOSITIONS.includes(String(entry.disposition))) errors.push('disposition_invalid')
    if (typeof entry.rationaleCode !== 'string' || !/^[a-z][a-z0-9_]{2,79}$/.test(entry.rationaleCode)) errors.push('rationale_invalid')
    if (typeof entry.id === 'string') ids.push(entry.id)
    if (safeRelativeSource(entry.sourcePath) && typeof entry.sourceAnchor === 'string') {
      anchors.push(`${entry.sourcePath}\u0000${entry.sourceAnchor}`)
      const absolute = path.join(root, ...entry.sourcePath.split('/'))
      if (!fs.existsSync(absolute)) errors.push(`source_missing:${entry.sourcePath}`)
      else if (fs.readFileSync(absolute, 'utf8').split(entry.sourceAnchor).length - 1 !== 1) errors.push(`anchor_not_exact:${entry.id}`)
    }
  }
  if (!canonical(ids)) errors.push('ids_not_canonical')
  if (new Set(anchors).size !== anchors.length) errors.push('duplicate_anchor')
  const serialized = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]{20,}|sb_(?:secret|service_role)|Bearer\s+[A-Za-z0-9._-]{12,}/i.test(serialized)) errors.push('secret_material_present')
  return errors
}

function walk(root: string, relative: string, files: Map<string, string>): void {
  const absolute = path.join(root, ...relative.split('/'))
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`
    if (entry.isDirectory()) walk(root, child, files)
    else if (/\.(?:ts|mjs)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
      files.set(child, fs.readFileSync(path.join(root, ...child.split('/')), 'utf8'))
    }
  }
}

function discover(files: Map<string, string>): string[] {
  return [...files.entries()].filter(([, source]) => {
    const centralRestMutation = source.includes('/rest/v1/')
      && (source.includes('method: "POST"') || source.includes("method: 'POST'") || source.includes('method,'))
      && source.includes('body: JSON.stringify')
    const localOperatorMutation = source.includes("http://127.0.0.1:4001/p2/execute")
    const failClosedVerificationAdapter = source.includes("export const VERIFICATION_WRITER_ID = 'kit.verification.record'")
      && source.includes('export function createBlockedVerificationReceipt')
    const failClosedRunVersionAdapter = source.includes("export const RUN_VERSION_WRITER_ID = 'kit.telemetry.central-upsert'")
      && source.includes('export function createBlockedRunVersionReceipt')
    const failClosedInstallAdapter = source.includes("export const INSTALL_WRITER_ID = 'kit.sync.install-report'")
      && source.includes('export function createBlockedInstallReceipt')
    return centralRestMutation
      || localOperatorMutation
      || failClosedVerificationAdapter
      || failClosedRunVersionAdapter
      || failClosedInstallAdapter
  }).map(([file]) => file).sort()
}

function main(): void {
  const root = process.cwd()
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/privacy-writer-registry.schema.json'), 'utf8')) as JsonObject
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/p17-016-kit-writer-registry.json'), 'utf8')) as JsonObject
  assert.equal(schema.$id, SCHEMA_ID)
  assert.equal(schema.additionalProperties, false)
  assert.equal((schema.$defs as JsonObject).entry && ((schema.$defs as JsonObject).entry as JsonObject).additionalProperties, false)
  assert.deepEqual(validateRegistry(registry, root), [])

  const files = new Map<string, string>()
  for (const relative of ['.claude/integrations', 'scripts', 'bin']) walk(root, relative, files)
  const discovered = discover(files)
  const registered = [...new Set((registry.entries as JsonObject[]).map((entry) => String(entry.sourcePath)))].sort()
  assert.deepEqual(discovered, registered)

  const clone = () => structuredClone(registry) as JsonObject
  const invalids: JsonObject[] = []
  invalids.push({ ...clone(), unexpected: true })
  const unknownEntry = clone(); (unknownEntry.entries as JsonObject[])[0].unexpected = true; invalids.push(unknownEntry)
  const duplicateId = clone(); (duplicateId.entries as JsonObject[])[1].id = (duplicateId.entries as JsonObject[])[0].id; invalids.push(duplicateId)
  const duplicateAnchor = clone(); Object.assign((duplicateAnchor.entries as JsonObject[])[1], { sourcePath: (duplicateAnchor.entries as JsonObject[])[0].sourcePath, sourceAnchor: (duplicateAnchor.entries as JsonObject[])[0].sourceAnchor }); invalids.push(duplicateAnchor)
  const traversal = clone(); (traversal.entries as JsonObject[])[0].sourcePath = '../secrets.env'; invalids.push(traversal)
  const absolute = clone(); (absolute.entries as JsonObject[])[0].sourcePath = 'C:/private/writer.ts'; invalids.push(absolute)
  const disposition = clone(); (disposition.entries as JsonObject[])[0].disposition = 'converted'; invalids.push(disposition)
  const unordered = clone(); (unordered.entries as JsonObject[]).reverse(); invalids.push(unordered)
  for (const value of invalids) assert.ok(validateRegistry(value, root).length > 0)

  const injected = new Map(files)
  injected.set('scripts/unregistered-central-writer.ts', "fetch('https://example.invalid/rest/v1/new_rows', { method: 'POST', body: JSON.stringify(row) })")
  assert.notDeepEqual(discover(injected), registered)
  assert.ok((registry.entries as JsonObject[]).some((entry) => entry.disposition === 'external_transport'))
  assert.ok((registry.entries as JsonObject[]).some((entry) => entry.disposition === 'fail_closed'))
  assert.ok((registry.entries as JsonObject[]).some((entry) => entry.disposition === 'migration_blocked'))
  process.stdout.write(`post-17-kit-writer-registry.test: PASS (${(registry.entries as JsonObject[]).length} entries, ${discovered.length} source files, 8 attacks)\n`)
}

main()
