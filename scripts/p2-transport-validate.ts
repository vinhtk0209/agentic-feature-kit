#!/usr/bin/env node
/**
 * Effect-free CLI boundary for dashboard consumers of the kit-owned P2 contract.
 * The transport envelope is accepted only on stdin and the process emits exactly
 * one machine-readable result line. It never creates a worktree or starts a role.
 */
import * as path from 'path';
import { Readable } from 'stream';
import {
  parseP2RoleTransportEnvelope,
  parseP2TransportStopReceipt,
  validateP2RoleTransportSet,
  type P2RoleTransport,
  type P2TransportStopReceipt,
} from '../.claude/integrations/p2-transport-manifest';

export const P2_TRANSPORT_VALIDATION_RESULT_SENTINEL = '@@P2_TRANSPORT_VALIDATION_RESULT@@';
export const MAX_P2_TRANSPORT_INPUT_BYTES = 1_048_576;

export interface P2TransportValidationResult {
  schemaVersion: 1;
  kind: 'manifest' | 'manifest-set' | 'stop-receipt' | null;
  ok: boolean;
  manifest: P2RoleTransport | null;
  receipt: P2TransportStopReceipt | null;
  errorCode: 'invalid_transport' | null;
}

interface ValidationOptions {
  cwd: string;
  approvedWorkspaceBase: string;
  mode: 'manifest' | 'manifest-set' | 'stop-receipt';
}

function parseArgs(argv: readonly string[]): ValidationOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== '--cwd' && flag !== '--approved-workspace-base' && flag !== '--mode') throw new Error('unknown argument');
    if (values.has(flag)) throw new Error('duplicate argument');
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new Error('missing argument value');
    values.set(flag, value);
  }
  if (!values.has('--cwd') || !values.has('--approved-workspace-base')) throw new Error('missing required argument');
  const mode = values.get('--mode') ?? 'manifest';
  if (mode !== 'manifest' && mode !== 'manifest-set' && mode !== 'stop-receipt') throw new Error('invalid mode');
  return {
    cwd: path.resolve(values.get('--cwd')!),
    approvedWorkspaceBase: path.resolve(values.get('--approved-workspace-base')!),
    mode,
  };
}

function failedResult(): P2TransportValidationResult {
  return { schemaVersion: 1, kind: null, ok: false, manifest: null, receipt: null, errorCode: 'invalid_transport' };
}

function parseStopReceiptRequest(raw: string): { manifestEnvelope: string; stopReceipt: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid receipt request'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('invalid receipt request');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'manifestEnvelope' || keys[1] !== 'stopReceipt'
    || typeof record.manifestEnvelope !== 'string' || typeof record.stopReceipt !== 'string') {
    throw new Error('invalid receipt request');
  }
  return { manifestEnvelope: record.manifestEnvelope, stopReceipt: record.stopReceipt };
}

function parseManifestSetRequest(raw: string): string[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid manifest-set request'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('invalid manifest-set request');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, 'manifestEnvelopes')
    || !Array.isArray(record.manifestEnvelopes) || record.manifestEnvelopes.length < 1
    || record.manifestEnvelopes.length > 4 || !record.manifestEnvelopes.every(item => typeof item === 'string')) {
    throw new Error('invalid manifest-set request');
  }
  return record.manifestEnvelopes as string[];
}

export function formatP2TransportValidationResult(result: P2TransportValidationResult): string {
  return `${P2_TRANSPORT_VALIDATION_RESULT_SENTINEL}${JSON.stringify(result)}`;
}

/** Validate only; failures are deliberately non-diagnostic on stdout. */
export function executeP2TransportValidation(
  argv: readonly string[],
  rawEnvelope: string,
): P2TransportValidationResult {
  try {
    const options = parseArgs(argv);
    if (options.mode === 'manifest') {
      const manifest = parseP2RoleTransportEnvelope(rawEnvelope, options);
      return { schemaVersion: 1, kind: 'manifest', ok: true, manifest, receipt: null, errorCode: null };
    }
    if (options.mode === 'manifest-set') {
      const manifests = parseManifestSetRequest(rawEnvelope)
        .map(envelope => parseP2RoleTransportEnvelope(envelope, options));
      validateP2RoleTransportSet(manifests);
      return { schemaVersion: 1, kind: 'manifest-set', ok: true, manifest: null, receipt: null, errorCode: null };
    }
    const request = parseStopReceiptRequest(rawEnvelope);
    const manifest = parseP2RoleTransportEnvelope(request.manifestEnvelope, options);
    const receipt = parseP2TransportStopReceipt(request.stopReceipt, manifest);
    return { schemaVersion: 1, kind: 'stop-receipt', ok: true, manifest, receipt, errorCode: null };
  } catch {
    return failedResult();
  }
}

/** Read stdin with a cumulative byte cap before parsing any untrusted envelope. */
export async function readP2TransportInput(
  input: Readable = process.stdin,
  maxBytes = MAX_P2_TRANSPORT_INPUT_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid input cap');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    total += bytes.byteLength;
    if (total > maxBytes) throw new Error('input cap exceeded');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Emit exactly one result sentinel and use the exit code as the first fail-closed signal. */
export async function runP2TransportValidationCli(
  argv: readonly string[],
  dependencies: {
    readInput?: () => Promise<string>;
    writeLine?: (line: string) => void;
  } = {},
): Promise<number> {
  let result = failedResult();
  try {
    const raw = await (dependencies.readInput ?? (() => readP2TransportInput()))();
    result = executeP2TransportValidation(argv, raw);
  } catch {
    result = failedResult();
  }
  (dependencies.writeLine ?? console.log)(formatP2TransportValidationResult(result));
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  runP2TransportValidationCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
