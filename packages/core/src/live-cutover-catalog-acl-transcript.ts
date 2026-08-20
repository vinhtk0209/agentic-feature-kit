import { createHash, timingSafeEqual } from 'node:crypto'

export const C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION = 1 as const
export const C5B_CATALOG_ACL_PROBE_POLICY_VERSION = 'p17-016-c5b-catalog-acl-probe-v1' as const

export type C5BCatalogAclProbeScalar = string | number | boolean | null
export type C5BCatalogAclProbeRow = Readonly<Record<string, C5BCatalogAclProbeScalar>>
export type C5BCatalogAclHashDomain = 'catalog' | 'acl' | 'rpc' | 'policy' | 'extension'

export interface C5BCatalogAclTranscriptBudget {
  bytes: number
  readonly maxBytes: number
}

const ROW_KEY = /^[a-z][a-z0-9_]{0,63}$/
const HASH = /^[0-9a-f]{64}$/
const CONTROL = /[\u0000-\u001f\u007f]/
const MAX_FIELDS_PER_ROW = 64
const MAX_ROWS = 1_000_000
const MAX_ROW_BYTES = 65_536
const MAX_TOTAL_BYTES = 16 * 1024 * 1024
const MIN_SERVER_VERSION_NUM = 100_000
const MAX_SERVER_VERSION_NUM = 999_999

export class C5BCatalogAclTranscriptError extends Error {
  constructor() {
    super('C5B catalog/ACL transcript refused')
    this.name = 'C5BCatalogAclTranscriptError'
  }
}

function refused(): never {
  throw new C5BCatalogAclTranscriptError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function exactArray(value: unknown, maximumLength: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  const length = value.length
  if (!Number.isSafeInteger(length) || length > maximumLength) return false
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some((key) => typeof key !== 'string')) return false
  const expected = Array.from({ length }, (_item, index) => String(index)).concat('length').sort()
  const actual = (ownKeys as string[]).sort()
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) return false
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
  if (!lengthDescriptor || !('value' in lengthDescriptor) || lengthDescriptor.enumerable) return false
  return Array.from({ length }, (_item, index) => String(index)).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return !!descriptor && 'value' in descriptor && descriptor.enumerable === true
  })
}

function scalar(value: unknown): value is C5BCatalogAclProbeScalar {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isSafeInteger(value) && !Object.is(value, -0)
  if (typeof value !== 'string') return false
  return value.normalize('NFC') === value && !CONTROL.test(value)
}

function canonicalRow(value: unknown, maxRowBytes: number): { text: string; bytes: Buffer } {
  if (!isRecord(value)) refused()
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.length === 0 || ownKeys.length > MAX_FIELDS_PER_ROW
    || ownKeys.some((key) => typeof key !== 'string' || !ROW_KEY.test(key))) refused()
  const keys = (ownKeys as string[]).sort()
  const canonical: Record<string, C5BCatalogAclProbeScalar> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true || !scalar(descriptor.value)) refused()
    if (typeof descriptor.value === 'string'
      && (descriptor.value.length > maxRowBytes || Buffer.byteLength(descriptor.value, 'utf8') > maxRowBytes)) refused()
    canonical[key] = descriptor.value
  }
  const text = JSON.stringify(canonical)
  if (text.length > maxRowBytes || Buffer.byteLength(text, 'utf8') > maxRowBytes) refused()
  return { text, bytes: Buffer.from(text, 'utf8') }
}

export function createC5BCatalogAclTranscriptBudget(maxBytes: number): C5BCatalogAclTranscriptBudget {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_TOTAL_BYTES) refused()
  return { bytes: 0, maxBytes }
}

export function canonicalizeC5BCatalogAclRows(
  value: unknown,
  maximumRows: number,
  maxRowBytes: number,
  budget: C5BCatalogAclTranscriptBudget,
): readonly string[] {
  try {
    if (!Number.isSafeInteger(maximumRows) || maximumRows <= 0 || maximumRows > MAX_ROWS
      || !Number.isSafeInteger(maxRowBytes) || maxRowBytes <= 0 || maxRowBytes > MAX_ROW_BYTES
      || !isRecord(budget) || !Number.isSafeInteger(budget.bytes) || budget.bytes < 0
      || !Number.isSafeInteger(budget.maxBytes) || budget.maxBytes <= 0 || budget.maxBytes > MAX_TOTAL_BYTES) refused()
    if (!exactArray(value, maximumRows)) refused()
    const rows: Array<{ text: string; bytes: Buffer }> = []
    budget.bytes += 2
    if (budget.bytes > budget.maxBytes) refused()
    for (let index = 0; index < value.length; index += 1) {
      const row = canonicalRow(value[index], maxRowBytes)
      budget.bytes += row.bytes.byteLength + (index === 0 ? 0 : 1)
      if (budget.bytes > budget.maxBytes) refused()
      rows.push(row)
    }
    rows.sort((left, right) => Buffer.compare(left.bytes, right.bytes))
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index - 1].text === rows[index].text) refused()
    }
    return Object.freeze(rows.map((row) => row.text))
  } catch (error) {
    if (error instanceof C5BCatalogAclTranscriptError) throw error
    refused()
  }
}

export function isC5BCatalogAclServerVersion(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= MIN_SERVER_VERSION_NUM
    && (value as number) <= MAX_SERVER_VERSION_NUM
}

export function hashC5BCatalogAclDomain(
  domain: C5BCatalogAclHashDomain,
  rows: readonly string[],
  serverVersionNum: number,
): string {
  if (!['catalog', 'acl', 'rpc', 'policy', 'extension'].includes(domain)
    || !isC5BCatalogAclServerVersion(serverVersionNum)
    || !Array.isArray(rows)) refused()
  const parsedRows = rows.map((row) => JSON.parse(row) as C5BCatalogAclProbeRow)
  const transcript = domain === 'catalog'
    ? {
      schemaVersion: C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION,
      policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
      domain,
      serverVersionNum,
      rows: parsedRows,
    }
    : {
      schemaVersion: C5B_CATALOG_ACL_PROBE_SCHEMA_VERSION,
      policyVersion: C5B_CATALOG_ACL_PROBE_POLICY_VERSION,
      domain,
      rows: parsedRows,
    }
  return createHash('sha256').update(JSON.stringify(transcript), 'utf8').digest('hex')
}

export function sameC5BCatalogAclHash(left: unknown, right: unknown): boolean {
  return typeof left === 'string' && HASH.test(left)
    && typeof right === 'string' && HASH.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}
