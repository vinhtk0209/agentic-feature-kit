export interface LegacyBackendConfig {
  readonly url: string
  readonly anonKey: string
}

export type LegacyBackendConfigRuleId =
  | 'legacy_config.input_shape'
  | 'legacy_config.missing'
  | 'legacy_config.incomplete'
  | 'legacy_config.value_type'
  | 'legacy_config.whitespace'
  | 'legacy_config.blank'
  | 'legacy_config.url_format'
  | 'legacy_config.url_scope'
  | 'legacy_config.url_transport'
  | 'legacy_config.key_format'

export class LegacyBackendConfigError extends Error {
  readonly ruleId: LegacyBackendConfigRuleId

  constructor(ruleId: LegacyBackendConfigRuleId) {
    super('legacy backend configuration refused')
    this.name = 'LegacyBackendConfigError'
    this.ruleId = ruleId
  }
}

const URL_KEY = 'SUPABASE_URL'
const ANON_KEY = 'SUPABASE_ANON_KEY'
const ASCII_NO_SPACE = /^[\x21-\x7e]+$/
const MIN_KEY_LENGTH = 16
const MAX_KEY_LENGTH = 4096
const MAX_URL_LENGTH = 2048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface OwnDataProperty {
  readonly present: boolean
  readonly value: unknown
}

function readOwnDataProperty(value: Record<string, unknown>, key: string): OwnDataProperty {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) return { present: false, value: undefined }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new LegacyBackendConfigError('legacy_config.input_shape')
  }
  return { present: descriptor.value !== undefined, value: descriptor.value }
}

function validatePairValue(value: unknown): string {
  if (typeof value !== 'string') throw new LegacyBackendConfigError('legacy_config.value_type')
  if (value.trim() !== value) throw new LegacyBackendConfigError('legacy_config.whitespace')
  if (value.length === 0) throw new LegacyBackendConfigError('legacy_config.blank')
  return value
}

function normalizeUrl(value: string): string {
  if (value.length > MAX_URL_LENGTH || !ASCII_NO_SPACE.test(value)) {
    throw new LegacyBackendConfigError('legacy_config.url_format')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new LegacyBackendConfigError('legacy_config.url_format')
  }

  if (
    parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.search.length > 0
    || parsed.hash.length > 0
    || parsed.pathname !== '/'
    || parsed.origin === 'null'
  ) throw new LegacyBackendConfigError('legacy_config.url_scope')

  const loopback = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new LegacyBackendConfigError('legacy_config.url_transport')
  }
  return parsed.origin
}

function validateKey(value: string): string {
  if (
    value.length < MIN_KEY_LENGTH
    || value.length > MAX_KEY_LENGTH
    || !ASCII_NO_SPACE.test(value)
  ) throw new LegacyBackendConfigError('legacy_config.key_format')
  return value
}

export function resolveLegacyBackendConfig(input: unknown): LegacyBackendConfig {
  if (!isRecord(input)) throw new LegacyBackendConfigError('legacy_config.input_shape')

  const urlProperty = readOwnDataProperty(input, URL_KEY)
  const keyProperty = readOwnDataProperty(input, ANON_KEY)
  if (!urlProperty.present && !keyProperty.present) {
    throw new LegacyBackendConfigError('legacy_config.missing')
  }
  if (!urlProperty.present || !keyProperty.present) {
    throw new LegacyBackendConfigError('legacy_config.incomplete')
  }

  const url = normalizeUrl(validatePairValue(urlProperty.value))
  const anonKey = validateKey(validatePairValue(keyProperty.value))
  return Object.freeze({ url, anonKey })
}
