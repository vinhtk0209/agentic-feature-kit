#!/usr/bin/env node
/**
 * O2 continuous assurance — deterministic nightly battery core.
 *
 * This module deliberately has no scheduler, database, or Slack side effect.  The P0 scheduler
 * invokes this executable and stores its stdout as the probe transcript; a Slack-capable caller
 * can post the returned `slackDigest` verbatim.  Keeping the assessment here pure means a failed
 * or malformed run cannot manufacture a green audit record.
 *
 * The manifest is a narrowly typed data contract, not a shell script.  Command checks use argv
 * (never a shell), contract checks call `probeContractDetailed` directly, and all manifest/sentinel
 * ambiguity is rejected before any check starts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { probeContractDetailed } from './contract-probe';
import { SpecAc, SpecIR, validateSpecIR } from './spec-ir';

export const ASSURANCE_SENTINEL = 'continuous-assurance/v1';

export class AssuranceManifestError extends Error {
  constructor(message: string) {
    super(`continuous-assurance-manifest: ${message}`);
    this.name = 'AssuranceManifestError';
  }
}

export class SpecDriftAmbiguityError extends Error {
  constructor(message: string) {
    super(`continuous-assurance-drift: ${message}`);
    this.name = 'SpecDriftAmbiguityError';
  }
}

export interface CommandCheck {
  id: string;
  kind: 'command';
  /** argv only. The runner never passes this to a shell. */
  command: string[];
}

export interface ContractProbeCheck {
  id: string;
  kind: 'contract-probe';
  httpPath: string;
  typesPath: string;
  apiPath: string;
  getOnly?: boolean;
}

export type AssuranceCheck = CommandCheck | ContractProbeCheck;

export interface QuarantineEntry {
  checkId: string;
  reason: string;
}

export interface AssuranceManifest {
  sentinel: typeof ASSURANCE_SENTINEL;
  schemaVersion: 1;
  checks: AssuranceCheck[];
  quarantine: QuarantineEntry[];
}

export type CheckStatus = 'pass' | 'fail' | 'error';
export interface BatteryCheckResult {
  id: string;
  kind: AssuranceCheck['kind'];
  executed: true;
  quarantined: boolean;
  status: CheckStatus;
  output: string;
}

export interface BatteryReport {
  schemaVersion: 1;
  generatedAt: string;
  gatePassed: boolean;
  results: BatteryCheckResult[];
  slackDigest: string;
}

export interface CommandRunResult { exitCode: number | null; output: string; }
export interface BatteryExecutor {
  runCommand?: (argv: string[]) => CommandRunResult | Promise<CommandRunResult>;
  cwd?: string;
}

export interface SpecDrift {
  kind: 'added' | 'removed' | 'changed';
  /** Stable when available; never fabricated from arbitrary prose. */
  acId: string | null;
  before?: Pick<SpecAc, 'id' | 'sourceAnchor' | 'sourceQuote'>;
  after?: Pick<SpecAc, 'id' | 'sourceAnchor' | 'sourceQuote'>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Count a property name at the top JSON object level without trusting JSON.parse's last-key-wins. */
function topLevelPropertyCount(raw: string, key: string): number {
  let depth = 0;
  let count = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char !== '"') continue;
      const end = i;
      inString = false;
      if (depth !== 1) continue;
      const candidate = raw.slice(i - 1, end + 1);
      // The scan position alone cannot recover the start of escaped strings. Re-read it safely.
      let start = end - 1;
      while (start >= 0 && raw[start] !== '"') start -= 1;
      const token = raw.slice(start, end + 1);
      const after = raw.slice(end + 1).match(/^\s*:/);
      if (token === `"${key}"` && after) count += 1;
      void candidate;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
  }
  return count;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new AssuranceManifestError(`${label} must be a non-empty string`);
  return value;
}

function uniqueIds(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new AssuranceManifestError(`duplicate ${label} "${value}"`);
    seen.add(value);
  }
}

function parseCheck(value: unknown, index: number): AssuranceCheck {
  if (!isObject(value)) throw new AssuranceManifestError(`checks[${index}] must be an object`);
  const id = requiredText(value.id, `checks[${index}].id`);
  if (value.kind === 'command') {
    if (!Array.isArray(value.command) || value.command.length === 0 || value.command.some((v) => typeof v !== 'string' || v.length === 0)) {
      throw new AssuranceManifestError(`command check "${id}" must have a non-empty argv array`);
    }
    return { id, kind: 'command', command: value.command as string[] };
  }
  if (value.kind === 'contract-probe') {
    return {
      id,
      kind: 'contract-probe',
      httpPath: requiredText(value.httpPath, `contract-probe "${id}" httpPath`),
      typesPath: requiredText(value.typesPath, `contract-probe "${id}" typesPath`),
      apiPath: requiredText(value.apiPath, `contract-probe "${id}" apiPath`),
      ...(value.getOnly === true ? { getOnly: true } : {}),
    };
  }
  throw new AssuranceManifestError(`check "${id}" has unsupported kind "${String(value.kind)}"`);
}

/** Parse the exact O2 manifest. Missing/malformed/duplicate sentinel is a hard error. */
export function parseAssuranceManifest(raw: string): AssuranceManifest {
  if (topLevelPropertyCount(raw, 'sentinel') !== 1) {
    throw new AssuranceManifestError('requires exactly one top-level "sentinel" property');
  }
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch (error) {
    throw new AssuranceManifestError(`invalid JSON: ${(error as Error).message}`);
  }
  if (!isObject(decoded)) throw new AssuranceManifestError('root must be an object');
  if (decoded.sentinel !== ASSURANCE_SENTINEL) throw new AssuranceManifestError(`sentinel must be "${ASSURANCE_SENTINEL}"`);
  if (decoded.schemaVersion !== 1) throw new AssuranceManifestError(`unsupported schemaVersion ${String(decoded.schemaVersion)}`);
  if (!Array.isArray(decoded.checks) || decoded.checks.length === 0) throw new AssuranceManifestError('checks must be a non-empty array');
  if (!Array.isArray(decoded.quarantine)) throw new AssuranceManifestError('quarantine must be an array');

  const checks = decoded.checks.map(parseCheck);
  uniqueIds(checks.map((check) => check.id), 'check id');
  const quarantine = decoded.quarantine.map((value, index): QuarantineEntry => {
    if (!isObject(value)) throw new AssuranceManifestError(`quarantine[${index}] must be an object`);
    return {
      checkId: requiredText(value.checkId, `quarantine[${index}].checkId`),
      reason: requiredText(value.reason, `quarantine[${index}].reason`),
    };
  });
  uniqueIds(quarantine.map((entry) => entry.checkId), 'quarantine checkId');
  const known = new Set(checks.map((check) => check.id));
  for (const entry of quarantine) {
    if (!known.has(entry.checkId)) throw new AssuranceManifestError(`quarantine references unknown check "${entry.checkId}"`);
  }
  return { sentinel: ASSURANCE_SENTINEL, schemaVersion: 1, checks, quarantine };
}

/** AC semantic identity for false-positive suppression only; original quote/anchor is never discarded. */
function normalizeAcText(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:AC[-\s]?\d+|acceptance\s+criteria\s*\d+)\s*[:.)-]?\s*/i, '')
    .replace(/[.。]+$/u, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

function provenance(ac: SpecAc): Pick<SpecAc, 'id' | 'sourceAnchor' | 'sourceQuote'> {
  return { id: ac.id, sourceAnchor: ac.sourceAnchor, sourceQuote: ac.sourceQuote };
}

function mapUniqueBySemanticKey(acs: SpecAc[], side: 'baseline' | 'refetched'): Map<string, SpecAc> {
  const out = new Map<string, SpecAc>();
  for (const ac of acs) {
    const key = normalizeAcText(ac.text);
    if (!key) throw new SpecDriftAmbiguityError(`${side} ${ac.id} normalizes to empty acceptance-criterion text`);
    if (out.has(key)) throw new SpecDriftAmbiguityError(`${side} has duplicate semantic AC text (${out.get(key)?.id}, ${ac.id})`);
    out.set(key, ac);
  }
  return out;
}

/**
 * Compare two independently validated Spec-IRs. Cosmetic rewrites do not create drift, while an
 * AC change reports exact old/new quote and source-anchor provenance. The result is a set diff,
 * not an id diff: renumbering/reordering alone cannot invent a regression.
 */
export function detectSpecDrift(baseline: SpecIR, refetched: SpecIR): SpecDrift[] {
  validateSpecIR(baseline);
  validateSpecIR(refetched);
  const beforeByText = mapUniqueBySemanticKey(baseline.acceptanceCriteria, 'baseline');
  const afterByText = mapUniqueBySemanticKey(refetched.acceptanceCriteria, 'refetched');
  const remainingBefore = [...beforeByText.entries()].filter(([key]) => !afterByText.has(key)).map(([, ac]) => ac);
  const remainingAfter = [...afterByText.entries()].filter(([key]) => !beforeByText.has(key)).map(([, ac]) => ac);
  const afterById = new Map(remainingAfter.map((ac) => [ac.id, ac]));
  const consumedAfter = new Set<string>();
  const result: SpecDrift[] = [];

  for (const before of remainingBefore) {
    const after = afterById.get(before.id);
    if (after) {
      consumedAfter.add(after.id);
      result.push({ kind: 'changed', acId: before.id, before: provenance(before), after: provenance(after) });
    } else {
      result.push({ kind: 'removed', acId: before.id, before: provenance(before) });
    }
  }
  for (const after of remainingAfter) {
    if (!consumedAfter.has(after.id)) result.push({ kind: 'added', acId: after.id, after: provenance(after) });
  }
  return result;
}

function resolveInside(cwd: string, candidate: string): string {
  const resolved = path.resolve(cwd, candidate);
  const relative = path.relative(cwd, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new AssuranceManifestError(`artifact path escapes cwd: ${candidate}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new AssuranceManifestError(`artifact path is missing or not a file: ${candidate}`);
  }
  return resolved;
}

function defaultRunCommand(argv: string[], cwd: string): CommandRunResult {
  const [command, ...args] = argv;
  // `.cmd` launchers require cmd.exe on Windows, which would violate the no-shell invariant.
  // The shipped manifest therefore invokes Node + tsx's JS CLI directly; custom manifests should
  // likewise use a real executable, never npm/npx shell shims.
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error) return { exitCode: null, output: `${output}\n${result.error.message}`.trim() };
  return { exitCode: result.status, output };
}

function summarizeOutput(output: string): string {
  const compact = output.replace(/\s+/g, ' ').trim();
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact || '(no output)';
}

export function buildSlackDigest(results: BatteryCheckResult[], gatePassed: boolean): string {
  const lines = [`*Continuous assurance*: ${gatePassed ? 'PASS' : 'FAIL'} · ${results.length} check(s)`];
  for (const result of results) {
    const state = result.status === 'pass'
      ? 'PASSED'
      : result.quarantined ? 'QUARANTINED FAILED' : result.status === 'fail' ? 'FAILED' : 'ERROR';
    lines.push(`• ${state} — \`${result.id}\`${result.quarantined ? ' (quarantined; still executed)' : ''}: ${summarizeOutput(result.output)}`);
  }
  return lines.join('\n');
}

/** Run every check, including quarantined checks. Quarantine affects only gate aggregation. */
export async function runBattery(manifest: AssuranceManifest, executor: BatteryExecutor = {}): Promise<BatteryReport> {
  const cwd = executor.cwd ?? process.cwd();
  const quarantined = new Set(manifest.quarantine.map((entry) => entry.checkId));
  const results: BatteryCheckResult[] = [];
  for (const check of manifest.checks) {
    let status: CheckStatus = 'pass';
    let output = '';
    try {
      if (check.kind === 'command') {
        const command = await (executor.runCommand?.(check.command) ?? defaultRunCommand(check.command, cwd));
        status = command.exitCode === 0 ? 'pass' : command.exitCode === null ? 'error' : 'fail';
        output = command.output;
      } else {
        const { findings, verifiedFields } = probeContractDetailed({
          httpText: fs.readFileSync(resolveInside(cwd, check.httpPath), 'utf8'),
          typesText: fs.readFileSync(resolveInside(cwd, check.typesPath), 'utf8'),
          apiText: fs.readFileSync(resolveInside(cwd, check.apiPath), 'utf8'),
          getOnly: check.getOnly,
        });
        const errors = findings.filter((finding) => finding.level === 'error');
        status = errors.length === 0 ? 'pass' : 'fail';
        output = `${errors.length} contract error(s), ${verifiedFields} field(s) verified${errors.length ? `: ${errors.map((f) => `${f.endpoint} ${f.path}`).join('; ')}` : ''}`;
      }
    } catch (error) {
      status = 'error';
      output = error instanceof Error ? error.message : String(error);
    }
    results.push({ id: check.id, kind: check.kind, executed: true, quarantined: quarantined.has(check.id), status, output });
  }
  const gatePassed = results.every((result) => result.status === 'pass' || result.quarantined);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), gatePassed, results, slackDigest: buildSlackDigest(results, gatePassed) };
}

function readSpecIr(filePath: string): SpecIR {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SpecIR; } catch (error) {
    throw new AssuranceManifestError(`cannot read Spec-IR ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function usage(): string {
  return 'usage: continuous-assurance.ts run <manifest.json> [--json] | drift <baseline-ir.json> <refetched-ir.json> [--json]';
}

async function main(): Promise<void> {
  const [mode, ...args] = process.argv.slice(2);
  const json = args.includes('--json');
  const paths = args.filter((arg) => arg !== '--json');
  if (mode === 'run' && paths.length === 1) {
    const report = await runBattery(parseAssuranceManifest(fs.readFileSync(paths[0], 'utf8')));
    console.log(json ? JSON.stringify(report, null, 2) : report.slackDigest);
    process.exitCode = report.gatePassed ? 0 : 1;
    return;
  }
  if (mode === 'drift' && paths.length === 2) {
    const drift = detectSpecDrift(readSpecIr(paths[0]), readSpecIr(paths[1]));
    console.log(json ? JSON.stringify({ drift }, null, 2) : `${drift.length} drift item(s)`);
    process.exitCode = drift.length === 0 ? 0 : 1;
    return;
  }
  throw new AssuranceManifestError(usage());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
