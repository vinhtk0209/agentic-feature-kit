#!/usr/bin/env node
/**
 * evidence-bundle.ts — p1-harness-evidence: harness engineering for the flagship workflow.
 *
 * Three capabilities, all local-filesystem-only (no network, no Supabase writes, no schema
 * change — see NOTE below):
 *
 *   1. buildBundle()   — collect a B-phase's declared inputs/outputs (existing files already on
 *                        disk under docs/specs/<Feature>/ or docs/components/<Feature>/) plus any
 *                        inline probe transcripts into an addressable, sha256-manifested bundle at
 *                        docs/specs/<Feature>/.evidence/<phase>/manifest.json.
 *   2. verifyBundle()  — rehash every referenced artifact + the manifest's own file-list against
 *                        the recorded hashes. A changed artifact (or a hand-edited manifest.json)
 *                        both surface as valid:false — fail-closed, never a silent pass.
 *   3. resumeFromBundles() — walk the canonical B-phase order and report the last phase with a
 *                        VALID bundle, using only manifest.json files on disk (no memory.ts
 *                        context-summary, no conversation state). Stops at the first missing
 *                        (not-yet-run — normal resume point) or invalid (tampered — fail-closed,
 *                        cannot trust anything past it) bundle.
 *
 * Per-phase context budgets (DoD part 3) are declared in DEFAULT_PHASE_BUDGET_TOKENS and enforced
 * inside buildBundle(): a bundle whose estimated token size exceeds its phase's declared budget
 * throws ContextBudgetExceededError instead of being written (fail-closed, opt-out via
 * `allowOverBudget: true` for a conscious override). Token estimate reuses prompt-budget.ts's
 * chars/4 heuristic (estimateTokens) rather than a second formula.
 *
 * NOTE on "uses existing command_runs/token_usage read contract — no schema change" (roadmap
 * constraint): this module makes zero Supabase calls. token_usage is SESSION-level, not
 * per-step (kit-dashboard/migrations/0003_command_runs.sql:22), so it cannot answer a per-phase
 * budget question directly — and command_runs/token_usage live in the *dashboard's* Supabase
 * project, reached today only via bin/lib/supabase.ts, which is deliberately NOT synced into
 * .claude/ (see that file's own header comment — .claude/ ships standalone into target repos
 * without bin/). Reaching those tables from here would either duplicate credentials into a
 * portable folder or silently break on sync. The constraint is satisfied by construction: no
 * Supabase table is touched, so there is nothing to change the schema of.
 *
 * CLI:
 *   npx tsx .claude/integrations/evidence-bundle.ts build <feature> <phase> \
 *     [--inputs a.json,b.md] [--outputs c.md,d.json] \
 *     [--transcript name=inline text] [--transcript-file name=path/to/file] \
 *     [--budget N] [--allow-over-budget]
 *   npx tsx .claude/integrations/evidence-bundle.ts verify <feature> <phase>
 *   npx tsx .claude/integrations/evidence-bundle.ts resume <feature>
 */

import * as fs from 'fs';
import * as path from 'path';
import { sha256 } from './spec-ir';
import { estimateTokens } from './prompt-budget';
import { verifyEvidenceBinding, type EvidenceBackendBinding } from './multi-provider-backends';

// ─── Canonical B-phase order (feature-from-confluence.md `## B*` headings) ───────────────────

export const PHASE_ORDER = [
  'B0', 'B0.5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B6.5', 'B7', 'B8', 'B8.5', 'B8.6',
  'B9', 'B9.5', 'B9.6', 'B10', 'B10.5', 'B11', 'B12', 'B12.5', 'B12.6', 'B12.8',
] as const;
export type Phase = typeof PHASE_ORDER[number];

export function isKnownPhase(phase: string): phase is Phase {
  return (PHASE_ORDER as readonly string[]).includes(phase);
}

// Order-of-magnitude budgets, not tuned measurements — gate/STOP phases (B4, B6, B8, B9, B9.5,
// B9.6, B10.5) produce little to no file output so get small budgets; content-generation phases
// (B1, B5, B7, B10, B11) get the largest. Override per-call via buildBundle's `budgetTokens`.
export const DEFAULT_PHASE_BUDGET_TOKENS: Record<Phase, number> = {
  'B0': 4000, 'B0.5': 1500, 'B1': 6000, 'B2': 2000, 'B3': 4000, 'B4': 1000,
  'B5': 8000, 'B6': 1000, 'B6.5': 3000, 'B7': 6000, 'B8': 1000, 'B8.5': 2000, 'B8.6': 4000,
  'B9': 1000, 'B9.5': 1000, 'B9.6': 1000, 'B10': 12000, 'B10.5': 1000, 'B11': 10000, 'B12': 3000,
  'B12.5': 2000, 'B12.6': 2000, 'B12.8': 2000,
};

// ─── Errors (fail-closed, named so attack-tests can assertThrows on them) ────────────────────

export class UnknownPhaseError extends Error {
  constructor(public readonly phase: string) {
    super(`evidence-bundle: "${phase}" is not a known B-phase (see PHASE_ORDER)`);
    this.name = 'UnknownPhaseError';
  }
}

export class MissingArtifactError extends Error {
  constructor(public readonly paths: string[]) {
    super(`evidence-bundle: declared artifact(s) not found on disk: ${paths.join(', ')}`);
    this.name = 'MissingArtifactError';
  }
}

export class EmptyBundleError extends Error {
  constructor(public readonly feature: string, public readonly phase: string) {
    super(`evidence-bundle: refusing to write an empty bundle for ${feature}/${phase} (zero inputs, outputs, and transcripts)`);
    this.name = 'EmptyBundleError';
  }
}

export class ContextBudgetExceededError extends Error {
  constructor(public readonly phase: string, public readonly estimatedTokens: number, public readonly budgetTokens: number) {
    super(`evidence-bundle: phase ${phase} bundle is ~${estimatedTokens} tokens, over its declared budget of ${budgetTokens} (pass allowOverBudget:true to override consciously)`);
    this.name = 'ContextBudgetExceededError';
  }
}

export class InvalidBackendBindingError extends Error {
  constructor() {
    super('evidence-bundle: backend binding is malformed or fails its tamper-evident verification');
    this.name = 'InvalidBackendBindingError';
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────────────────

export interface EvidenceFileEntry {
  role: 'input' | 'output' | 'transcript' | 'backend-binding';
  path: string; // repo-relative, POSIX separators
  sha256: string;
  bytes: number;
}

export interface EvidenceManifest {
  schemaVersion: 1;
  feature: string;
  phase: Phase;
  builtAt: string;
  files: EvidenceFileEntry[];
  manifestHash: string;
  estimatedTokens: number;
  budgetTokens: number;
}

export interface BuildBundleInput {
  featureName: string;
  phase: string;
  cwd?: string;
  inputs?: string[];
  outputs?: string[];
  /** name -> inline text content; written into the bundle itself (not referenced externally). */
  transcripts?: Record<string, string>;
  /** Optional I2 backend-evidence claim; emitted as one hash-bound sidecar without changing manifest v1. */
  backendBinding?: EvidenceBackendBinding;
  budgetTokens?: number;
  allowOverBudget?: boolean;
}

export interface FileMismatch {
  path: string;
  role: string;
  reason: 'missing' | 'hash-mismatch';
  expectedSha256?: string;
  actualSha256?: string;
}

export interface VerifyResult {
  exists: boolean;
  valid: boolean;
  manifestSelfConsistent: boolean;
  fileMismatches: FileMismatch[];
  manifest?: EvidenceManifest;
}

export interface BackendBoundVerifyResult {
  exists: boolean;
  valid: boolean;
  /** The unchanged P1 verifier result, retained for callers that need generic v1 diagnostics. */
  bundle: VerifyResult;
  reason?: 'bundle-missing' | 'bundle-invalid' | 'binding-missing' | 'binding-duplicate' | 'binding-invalid';
  backendBinding?: EvidenceBackendBinding;
}

export interface ResumeBlockedAt {
  phase: Phase;
  reason: 'missing' | 'invalid';
  detail?: VerifyResult;
}

export interface ResumeState {
  completedPhases: Phase[];
  lastCompletedPhase: Phase | null;
  /** Next phase to run, or 'DONE' if every phase in PHASE_ORDER has a valid bundle. */
  resumeFromPhase: Phase | 'DONE';
  blockedAt?: ResumeBlockedAt;
}

// ─── Path helpers ──────────────────────────────────────────────────────────────────────────

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function bundleDir(cwd: string, feature: string, phase: string): string {
  return path.join(cwd, 'docs', 'specs', feature, '.evidence', phase);
}

function manifestFilePath(cwd: string, feature: string, phase: string): string {
  return path.join(bundleDir(cwd, feature, phase), 'manifest.json');
}

function backendBindingFilePath(cwd: string, feature: string, phase: string): string {
  return path.join(bundleDir(cwd, feature, phase), 'backend-binding.json');
}

/** Deterministic canonical serialization of the file list, sorted by path — the input to
 *  manifestHash. Fixed key order + explicit join (not JSON.stringify on the array) so the hash
 *  never drifts on object-key reordering. */
function canonicalFilesString(files: readonly EvidenceFileEntry[]): string {
  return [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.role}|${f.path}|${f.sha256}|${f.bytes}`)
    .join('\n');
}

// ─── Build ─────────────────────────────────────────────────────────────────────────────────

export function buildBundle(input: BuildBundleInput): EvidenceManifest {
  const cwd = input.cwd ?? process.cwd();
  if (!input.featureName) throw new Error('evidence-bundle: featureName is required');
  if (!isKnownPhase(input.phase)) throw new UnknownPhaseError(input.phase);
  const phase = input.phase;
  // An I2 claim must be fully valid before this builder creates a directory, transcript, sidecar,
  // or manifest. Legacy callers omit the field and keep the byte-level v1 build path unchanged.
  if (input.backendBinding !== undefined && !verifyEvidenceBinding(input.backendBinding)) throw new InvalidBackendBindingError();

  const inputs = input.inputs ?? [];
  const outputs = input.outputs ?? [];
  const transcripts = input.transcripts ?? {};

  // Pass 1 — resolve everything into in-memory entries WITHOUT writing anything yet, so a
  // failure (missing artifact, empty bundle, over budget) never leaves a partial bundle on disk.
  const missing: string[] = [];
  const refEntries: EvidenceFileEntry[] = [];
  const resolveRef = (role: 'input' | 'output', relPath: string): void => {
    const abs = path.resolve(cwd, relPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { missing.push(relPath); return; }
    const buf = fs.readFileSync(abs);
    refEntries.push({ role, path: toPosix(path.relative(cwd, abs)), sha256: sha256(buf), bytes: buf.length });
  };
  inputs.forEach((p) => resolveRef('input', p));
  outputs.forEach((p) => resolveRef('output', p));
  if (missing.length > 0) throw new MissingArtifactError(missing);

  const dir = bundleDir(cwd, input.featureName, phase);
  const transcriptsDir = path.join(dir, 'transcripts');
  const transcriptWrites: Array<{ absPath: string; buf: Buffer; entry: EvidenceFileEntry }> = [];
  for (const [name, content] of Object.entries(transcripts)) {
    const buf = Buffer.from(content, 'utf8');
    const safeName = name.replace(/[^a-zA-Z0-9_.-]+/g, '_') || 'transcript';
    const absPath = path.join(transcriptsDir, `${safeName}.txt`);
    const entry: EvidenceFileEntry = { role: 'transcript', path: toPosix(path.relative(cwd, absPath)), sha256: sha256(buf), bytes: buf.length };
    transcriptWrites.push({ absPath, buf, entry });
  }

  const backendBindingWrite = input.backendBinding === undefined ? undefined : (() => {
    const absPath = backendBindingFilePath(cwd, input.featureName, phase);
    const buf = Buffer.from(`${JSON.stringify(input.backendBinding, null, 2)}\n`, 'utf8');
    const entry: EvidenceFileEntry = {
      role: 'backend-binding',
      path: toPosix(path.relative(cwd, absPath)),
      sha256: sha256(buf),
      bytes: buf.length,
    };
    return { absPath, buf, entry };
  })();

  const allEntries = [...refEntries, ...transcriptWrites.map((t) => t.entry), ...(backendBindingWrite ? [backendBindingWrite.entry] : [])];
  if (allEntries.length === 0) throw new EmptyBundleError(input.featureName, phase);

  const totalBytes = allEntries.reduce((sum, e) => sum + e.bytes, 0);
  // bytes is a reasonable proxy for chars on the mostly-ASCII text artifacts this bundles
  // (json/md/http/screenshots-as-paths-not-bytes); same chars/4 heuristic as prompt-budget.ts.
  const estimatedTokens = estimateTokens('x'.repeat(totalBytes));
  const budgetTokens = input.budgetTokens ?? DEFAULT_PHASE_BUDGET_TOKENS[phase];
  if (!input.allowOverBudget && estimatedTokens > budgetTokens) {
    throw new ContextBudgetExceededError(phase, estimatedTokens, budgetTokens);
  }

  // Pass 2 — all checks passed; now actually write (transcripts + manifest).
  if (transcriptWrites.length > 0) fs.mkdirSync(transcriptsDir, { recursive: true });
  for (const t of transcriptWrites) fs.writeFileSync(t.absPath, t.buf);
  if (backendBindingWrite) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(backendBindingWrite.absPath, backendBindingWrite.buf);
  }

  const sortedFiles = [...allEntries].sort((a, b) => a.path.localeCompare(b.path));
  const manifest: EvidenceManifest = {
    schemaVersion: 1,
    feature: input.featureName,
    phase,
    builtAt: new Date().toISOString(),
    files: sortedFiles,
    manifestHash: sha256(canonicalFilesString(sortedFiles)),
    estimatedTokens,
    budgetTokens,
  };

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestFilePath(cwd, input.featureName, phase), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

// ─── Verify ────────────────────────────────────────────────────────────────────────────────

export function verifyBundle(featureName: string, phase: string, cwd: string = process.cwd()): VerifyResult {
  const mPath = manifestFilePath(cwd, featureName, phase);
  if (!fs.existsSync(mPath)) return { exists: false, valid: false, manifestSelfConsistent: false, fileMismatches: [] };

  let manifest: EvidenceManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')) as EvidenceManifest;
  } catch {
    return { exists: true, valid: false, manifestSelfConsistent: false, fileMismatches: [{ path: mPath, role: 'manifest', reason: 'hash-mismatch' }] };
  }

  // Self-consistency: recompute the top-level hash from the manifest's OWN file list. Catches a
  // hand-edited manifest.json (e.g. someone patches a sha256 field to match tampered content)
  // without needing to know what the "real" content should have been.
  const recomputed = sha256(canonicalFilesString(manifest.files ?? []));
  const manifestSelfConsistent = recomputed === manifest.manifestHash;

  // Per-file: rehash whatever is on disk NOW at each referenced path and compare to what was
  // recorded at build time. Catches a live artifact (e.g. checklist.md) edited after bundling,
  // even if manifest.json itself was left untouched.
  const fileMismatches: FileMismatch[] = [];
  for (const f of manifest.files ?? []) {
    const abs = path.resolve(cwd, f.path);
    if (!fs.existsSync(abs)) { fileMismatches.push({ path: f.path, role: f.role, reason: 'missing' }); continue; }
    const actual = sha256(fs.readFileSync(abs));
    if (actual !== f.sha256) {
      fileMismatches.push({ path: f.path, role: f.role, reason: 'hash-mismatch', expectedSha256: f.sha256, actualSha256: actual });
    }
  }

  return {
    exists: true,
    valid: manifestSelfConsistent && fileMismatches.length === 0,
    manifestSelfConsistent,
    fileMismatches,
    manifest,
  };
}

/**
 * Verify the optional I2 backend-evidence claim. This deliberately does not change
 * verifyBundle() or resumeFromBundles(): v1 bundles without a claim remain valid to P1 callers.
 * A caller that claims backend execution must instead use this strict verifier.
 */
export function verifyBackendBoundBundle(featureName: string, phase: string, cwd: string = process.cwd()): BackendBoundVerifyResult {
  const bundle = verifyBundle(featureName, phase, cwd);
  if (!bundle.exists) return { exists: false, valid: false, bundle, reason: 'bundle-missing' };
  if (!bundle.valid || !bundle.manifest) return { exists: true, valid: false, bundle, reason: 'bundle-invalid' };

  const expectedPath = toPosix(path.relative(cwd, backendBindingFilePath(cwd, featureName, phase)));
  const files = Array.isArray(bundle.manifest.files) ? bundle.manifest.files : [];
  // Treat either the reserved role or the reserved path as a sentinel. This makes an alias,
  // duplicate, or role substitution fail closed rather than letting it look like a legacy file.
  const sentinels = files.filter((file) => file.role === 'backend-binding' || file.path === expectedPath);
  if (sentinels.length === 0) return { exists: true, valid: false, bundle, reason: 'binding-missing' };
  if (sentinels.length !== 1) return { exists: true, valid: false, bundle, reason: 'binding-duplicate' };
  const [sidecar] = sentinels;
  if (sidecar.role !== 'backend-binding' || sidecar.path !== expectedPath) {
    return { exists: true, valid: false, bundle, reason: 'binding-invalid' };
  }

  try {
    const binding = JSON.parse(fs.readFileSync(backendBindingFilePath(cwd, featureName, phase), 'utf8')) as EvidenceBackendBinding;
    if (!verifyEvidenceBinding(binding)) return { exists: true, valid: false, bundle, reason: 'binding-invalid' };
    return { exists: true, valid: true, bundle, backendBinding: binding };
  } catch {
    return { exists: true, valid: false, bundle, reason: 'binding-invalid' };
  }
}

// ─── Resume ────────────────────────────────────────────────────────────────────────────────

/**
 * Bundles-only resume (DoD part 2): walks PHASE_ORDER and reports the last phase with a valid
 * bundle, using nothing but manifest.json files on disk under docs/specs/<feature>/.evidence/.
 * Never consults memory.ts's context-summary.md or any other state.
 */
export function resumeFromBundles(featureName: string, cwd: string = process.cwd()): ResumeState {
  const completed: Phase[] = [];
  for (const phase of PHASE_ORDER) {
    const v = verifyBundle(featureName, phase, cwd);
    if (!v.exists) {
      return { completedPhases: completed, lastCompletedPhase: completed[completed.length - 1] ?? null, resumeFromPhase: phase, blockedAt: { phase, reason: 'missing' } };
    }
    if (!v.valid) {
      return { completedPhases: completed, lastCompletedPhase: completed[completed.length - 1] ?? null, resumeFromPhase: phase, blockedAt: { phase, reason: 'invalid', detail: v } };
    }
    completed.push(phase);
  }
  return { completedPhases: completed, lastCompletedPhase: completed[completed.length - 1] ?? null, resumeFromPhase: 'DONE' };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────────────────

function isCli(): boolean {
  return require.main === module;
}

function parseListArg(args: string[], flag: string): string[] {
  const i = args.indexOf(flag);
  if (i < 0) return [];
  return (args[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function parseTranscripts(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  args.forEach((a, i) => {
    if (a === '--transcript') {
      const raw = args[i + 1] ?? '';
      const eq = raw.indexOf('=');
      if (eq > 0) out[raw.slice(0, eq)] = raw.slice(eq + 1);
    }
    if (a === '--transcript-file') {
      const raw = args[i + 1] ?? '';
      const eq = raw.indexOf('=');
      if (eq > 0) out[raw.slice(0, eq)] = fs.readFileSync(raw.slice(eq + 1), 'utf8');
    }
  });
  return out;
}

if (isCli()) {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === 'build') {
      const [feature, phase] = rest;
      const budgetIdx = rest.indexOf('--budget');
      const manifest = buildBundle({
        featureName: feature,
        phase,
        inputs: parseListArg(rest, '--inputs'),
        outputs: parseListArg(rest, '--outputs'),
        transcripts: parseTranscripts(rest),
        budgetTokens: budgetIdx >= 0 ? Number(rest[budgetIdx + 1]) : undefined,
        allowOverBudget: rest.includes('--allow-over-budget'),
      });
      console.log(JSON.stringify(manifest, null, 2));
      process.exit(0);
    } else if (cmd === 'verify') {
      const [feature, phase] = rest;
      const result = verifyBundle(feature, phase);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.valid ? 0 : 1);
    } else if (cmd === 'resume') {
      const [feature] = rest;
      const result = resumeFromBundles(feature);
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } else {
      console.log(`Usage:
  npx tsx .claude/integrations/evidence-bundle.ts build <feature> <phase> [--inputs a,b] [--outputs c,d] [--transcript name=text] [--transcript-file name=path] [--budget N] [--allow-over-budget]
  npx tsx .claude/integrations/evidence-bundle.ts verify <feature> <phase>
  npx tsx .claude/integrations/evidence-bundle.ts resume <feature>`);
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(JSON.stringify({ error: String(e), name: (e as Error).name }));
    process.exit(1);
  }
}
