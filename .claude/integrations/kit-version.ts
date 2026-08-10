/**
 * Canonical kit-version resolution.
 *
 * PROMPT_VERSION in feature-from-confluence.md is the only version authority for
 * kit runtime artifacts. This module never invents a version when the authority
 * is absent or ambiguous.
 */
import * as fs from 'fs';
import * as path from 'path';

const CANONICAL_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/;
const PROMPT_VERSION_LINE = /^\s*PROMPT_VERSION\s*:\s*v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.0)?)\s*$/;

export class KitVersionError extends Error {
  constructor(message: string) {
    super(`kit-version: ${message}`);
    this.name = 'KitVersionError';
  }
}

/** Accept only the documented vN.N (or already-normalized vN.N.0) source form. */
export function normalizePromptVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:\.0)?$/.exec(value.trim());
  return match ? `${match[1]}.0` : null;
}

/** True only for the exact storage/report form N.N.0. */
export function isCanonicalKitVersion(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_VERSION.test(value);
}

/**
 * Parse PROMPT_VERSION from command content.  A null result is deliberately
 * absent/malformed/duplicate source. Callers that need authoritative output use
 * the throwing resolver below so it can never become proof.
 */
export function parseCanonicalPromptVersion(source: string): string | null {
  const declarations = source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => /PROMPT_VERSION\s*:/.test(line));
  if (declarations.length !== 1) return null;
  const match = PROMPT_VERSION_LINE.exec(declarations[0]);
  return match ? normalizePromptVersion(`v${match[1]}`) : null;
}

/** Resolve the single PROMPT_VERSION authority or fail closed. */
export function resolveCanonicalKitVersion(repoRoot: string): string {
  const commandFile = path.join(repoRoot, '.claude', 'commands', 'feature-from-confluence.md');
  let source: string;
  try {
    source = fs.readFileSync(commandFile, 'utf8');
  } catch (error) {
    throw new KitVersionError(`cannot read PROMPT_VERSION authority at ${commandFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const declarations = source.replace(/\r\n/g, '\n').split('\n').filter((line) => /PROMPT_VERSION\s*:/.test(line));
  if (declarations.length !== 1) {
    throw new KitVersionError(`requires exactly one PROMPT_VERSION declaration; found ${declarations.length}`);
  }
  const version = parseCanonicalPromptVersion(source);
  if (!version) throw new KitVersionError('PROMPT_VERSION must be exactly vN.N or vN.N.0');
  return version;
}
