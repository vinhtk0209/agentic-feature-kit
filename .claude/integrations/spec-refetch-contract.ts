/** Shared fail-closed contract for scheduler and interactive Confluence refetch actors. */
import { sha256 } from './spec-ir';

export const SPEC_REFETCH_SENTINEL = '@@SPEC_REFETCH_RESULT@@';

export interface SpecRefetchEnvelope {
  v: 1;
  sourceRef: string;
  sourceSha256: string;
  sourceText: string;
}

export class SpecRefetchContractError extends Error {
  constructor(message: string) {
    super(`spec-refetch-contract: ${message}`);
    this.name = 'SpecRefetchContractError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SpecRefetchContractError(`${label} must be non-empty text`);
  }
  return value;
}

/**
 * Actor protocol is deliberately single-line / single-sentinel: any logging, missing marker,
 * duplicate marker, malformed JSON, source-ref mismatch, or fake source hash is a hard error.
 */
export function parseSpecRefetchEnvelope(output: string, expectedSourceRef: string): SpecRefetchEnvelope {
  const lines = output.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim() !== '');
  const sentinelLines = lines.filter((line) => line.trimStart().startsWith(SPEC_REFETCH_SENTINEL));
  if (sentinelLines.length !== 1) {
    throw new SpecRefetchContractError(`actor requires exactly one ${SPEC_REFETCH_SENTINEL} sentinel; found ${sentinelLines.length}`);
  }
  if (lines.length !== 1) throw new SpecRefetchContractError('actor emitted non-sentinel output; refusing ambiguous provenance');
  const encoded = sentinelLines[0].trimStart().slice(SPEC_REFETCH_SENTINEL.length).trim();
  let parsed: unknown;
  try { parsed = JSON.parse(encoded); } catch (error) {
    throw new SpecRefetchContractError(`sentinel JSON is malformed: ${(error as Error).message}`);
  }
  if (!isObject(parsed)) throw new SpecRefetchContractError('sentinel must carry an object');
  if (parsed.v !== 1) throw new SpecRefetchContractError(`sentinel has unsupported v=${String(parsed.v)}`);
  const sourceRef = requiredText(parsed.sourceRef, 'sentinel sourceRef');
  const sourceSha256 = requiredText(parsed.sourceSha256, 'sentinel sourceSha256');
  const sourceText = requiredText(parsed.sourceText, 'sentinel sourceText');
  if (sourceRef !== expectedSourceRef) throw new SpecRefetchContractError(`sourceRef mismatch: expected "${expectedSourceRef}", got "${sourceRef}"`);
  if (!/^[a-f0-9]{64}$/i.test(sourceSha256)) throw new SpecRefetchContractError('sourceSha256 must be a 64-character hex digest');
  if (sha256(sourceText) !== sourceSha256.toLowerCase()) throw new SpecRefetchContractError('sourceSha256 does not identify the exact actor sourceText');
  return { v: 1, sourceRef, sourceSha256: sourceSha256.toLowerCase(), sourceText };
}
