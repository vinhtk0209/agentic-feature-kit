/**
 * Deterministic feature identity resolver.
 *
 * A ticket may have only one canonical docs/specs/<ticket>-* folder. New sessions reuse that
 * folder regardless of title wording; multiple matches fail closed instead of relying on directory
 * enumeration order. The resolver is read-only.
 */

import * as fs from 'fs';
import * as path from 'path';

const SENTINEL = '@@FEATURE_IDENTITY@@';
const TICKET_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const SUGGESTED_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/;

export type FeatureIdentityReason =
  | 'invalid-ticket-id'
  | 'invalid-suggested-name'
  | 'ambiguous-ticket-folders'
  | 'invalid-existing-folder'
  | 'malformed-sentinel';

export class FeatureIdentityError extends Error {
  constructor(public readonly reason: FeatureIdentityReason, public readonly detail: string) {
    super(`feature-identity: ${reason}: ${detail}`);
    this.name = 'FeatureIdentityError';
  }
}

export interface FeatureIdentity {
  v: 1;
  ticketId: string;
  featureName: string;
  source: 'existing' | 'proposed';
  path: string;
}

export interface ResolveFeatureIdentityInput {
  cwd?: string;
  ticketId: string;
  suggestedFeatureName: string;
}

function validateTicketId(ticketId: string): string {
  const value = typeof ticketId === 'string' ? ticketId.trim() : '';
  if (!TICKET_RE.test(value)) throw new FeatureIdentityError('invalid-ticket-id', String(ticketId));
  return value;
}

function validateSuggestedName(ticketId: string, suggestedFeatureName: string): string {
  const value = typeof suggestedFeatureName === 'string' ? suggestedFeatureName.trim() : '';
  if (!SUGGESTED_RE.test(value)) throw new FeatureIdentityError('invalid-suggested-name', String(suggestedFeatureName));
  const prefix = `${ticketId}-`;
  const suffix = value.toLowerCase().startsWith(prefix.toLowerCase()) ? value.slice(prefix.length) : value;
  if (!SUGGESTED_RE.test(suffix)) throw new FeatureIdentityError('invalid-suggested-name', String(suggestedFeatureName));
  return suffix;
}

export function resolveFeatureIdentity(input: ResolveFeatureIdentityInput): FeatureIdentity {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const ticketId = validateTicketId(input.ticketId);
  const suggestion = validateSuggestedName(ticketId, input.suggestedFeatureName);
  const specsRoot = path.join(cwd, 'docs', 'specs');
  const prefix = `${ticketId}-`.toLowerCase();
  const matches = fs.existsSync(specsRoot)
    ? fs.readdirSync(specsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.toLowerCase().startsWith(prefix))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
    : [];

  if (matches.length > 1) {
    throw new FeatureIdentityError('ambiguous-ticket-folders', matches.join(','));
  }

  const featureName = matches[0] ?? `${ticketId}-${suggestion}`;
  if (!SUGGESTED_RE.test(featureName) || !featureName.toLowerCase().startsWith(prefix)) {
    throw new FeatureIdentityError('invalid-existing-folder', featureName);
  }
  const proposedPath = path.join(specsRoot, featureName);
  if (matches.length === 0 && fs.existsSync(proposedPath)) {
    const stat = fs.lstatSync(proposedPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new FeatureIdentityError('invalid-existing-folder', featureName);
  }

  return {
    v: 1,
    ticketId,
    featureName,
    source: matches.length === 1 ? 'existing' : 'proposed',
    path: `docs/specs/${featureName}`,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseFeatureIdentityOutput(raw: string, cwd: string = process.cwd()): FeatureIdentity {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');
  const sentinelLines = lines.filter((line) => line.includes(SENTINEL));
  if (lines.length !== 1 || sentinelLines.length !== 1 || !sentinelLines[0].startsWith(`${SENTINEL} `)) {
    throw new FeatureIdentityError('malformed-sentinel', `expected exactly one ${SENTINEL} line`);
  }
  let value: unknown;
  try { value = JSON.parse(sentinelLines[0].slice(SENTINEL.length + 1)); }
  catch { throw new FeatureIdentityError('malformed-sentinel', 'payload is not JSON'); }
  if (!isPlainRecord(value) || Object.keys(value).sort().join(',') !== 'featureName,path,source,ticketId,v') {
    throw new FeatureIdentityError('malformed-sentinel', 'payload keys are not exact');
  }
  const resolved = resolveFeatureIdentity({ ticketId: String(value.ticketId), suggestedFeatureName: String(value.featureName), cwd });
  if (value.v !== 1 || value.featureName !== resolved.featureName || value.source !== resolved.source || value.path !== resolved.path) {
    throw new FeatureIdentityError('malformed-sentinel', 'payload does not match deterministic resolution');
  }
  return resolved;
}

if (require.main === module) {
  const [command, ticketId, suggestedFeatureName, ...extra] = process.argv.slice(2);
  try {
    if (command !== 'resolve' || !ticketId || !suggestedFeatureName || extra.length > 0) {
      throw new FeatureIdentityError('invalid-suggested-name', 'usage: feature-identity resolve <ticket-id> <suggested-feature-name>');
    }
    const result = resolveFeatureIdentity({ ticketId, suggestedFeatureName });
    process.stdout.write(`${SENTINEL} ${JSON.stringify(result)}\n`);
  } catch (error) {
    const known = error instanceof FeatureIdentityError ? error : new FeatureIdentityError('invalid-existing-folder', String(error));
    process.stderr.write(`${JSON.stringify({ name: known.name, reason: known.reason })}\n`);
    process.exitCode = 2;
  }
}
