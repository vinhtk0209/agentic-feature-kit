/**
 * record-verify.ts — the SINGLE trusted writer of the verify verdict.
 *
 * Measurement Layer v1 (docs/design/measurement-layer-v1.md §3.2, §3.4, §4).
 *
 * The trusted-writer invariant (§4): `verify_complete` / `final_confirmed` — and the
 * `verified` boolean they carry — are ONLY ever written here, and `verified` is computed
 * INSIDE this module as a pure function of test-runner EXIT CODES observed directly. It is
 * never accepted as an input from any caller. `memory.ts save` refuses to set it (§3.2), so
 * this is the only path that can.
 *
 * Two entry points:
 *   - recordVerify({ tierA_exit, tierB_exit, ... }) — the writer. Takes captured exit codes,
 *     computes `verified`, and writes a `git note` on refs/notes/verify at HEAD (§3.4).
 *   - captureAndRecord({ tierACmd, tierBCmd?, ... }) — the capture wrapper. RUNS the tier
 *     commands, captures their real exit codes, then calls recordVerify. No boolean crosses
 *     the boundary; only exit codes do.
 *
 * CLI (W.3 v3.22 — separate code-path + spec-name; the single `--feature` string is removed):
 *   npx tsx .claude/integrations/record-verify.ts record  --feature-path <src/dir> [--spec-name <folder>] --tierA <int> [--tierB <int|null>] [--run-id <id>] [--kit-version <v>]
 *   npx tsx .claude/integrations/record-verify.ts capture --feature-path <src/dir> [--spec-name <folder>] --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"] [--run-id <id>]
 *   npx tsx .claude/integrations/record-verify.ts show    # print the note on HEAD
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';

export const VERIFY_NOTES_REF = 'refs/notes/verify';

/** The kit source-of-truth package name — one of the A1.1 repo-role markers (see assertNotKitRepo). */
const KIT_PACKAGE_NAME = 'feature-from-confluence-kit';

// Supabase (public anon creds — RLS-protected). Hardcoded fallback mirrors telemetry.ts so the
// target-side verify_records write works even without a .env; env vars override if present (Gap C).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vkuojxgvkxndftenrdno.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdW9qeGd2a3huZGZ0ZW5yZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjgwMzMsImV4cCI6MjA5NzAwNDAzM30.MrTuIuN1kghxMXu0yyOW9MtmXVY7xH0-2HSCwTKo2cU';

export interface RecordVerifyInput {
  /** The workflow phase this verdict is for. */
  phase: 'verify_complete' | 'final_confirmed';
  /**
   * Repo-relative path to the feature's LEAF code dir — e.g.
   * `src/studio-home/tabs-section/class-management/tabs/ProgressReports` (W.3 split, v3.22). The hash
   * walks this tree; it is validated as a leaf feature dir (assertLeafFeatureDir) first.
   */
  codePath: string;
  /**
   * The flat `docs/specs/<specName>/` folder name — e.g. `US-AD-095-ProgressReports` — whose
   * `ux-states.json` is folded into the hash. `null` only when Tier B was skipped (no E2E states to
   * pin); a non-null tierB_exit with a missing ux-states.json is refused (§7.2).
   */
  specName: string | null;
  /** lint-feature --gate + tsc exit code, captured by the wrapper. */
  tierA_exit: number;
  /** b11-runner exit code, or null if Tier B was legitimately skipped (§3.3). */
  tierB_exit: number | null;
  /** Ties this record to a specific command run (marker stream); remote-backstop seam (§3.6). */
  runner_run_id?: string;
  /** Kit version; defaults to the resolved PROMPT_VERSION. */
  kit_version?: string;
  /** ISO8601 timestamp; metadata only — never a validity input (§3.4). */
  at?: string;
}

/** The note body written to refs/notes/verify (§3.4). */
export interface VerifyNote {
  phase: string;
  /** Human/DB label — derived (= spec_name, or codePath basename when spec_name is null). Never a hash input. */
  feature: string;
  /** NEW (W.3 v3.22): the exact repo-relative code dir the hash walked. The hook recomputes with this. */
  code_path: string;
  /** NEW (W.3 v3.22): the exact docs/specs folder whose ux-states.json was hashed, or null if none. */
  spec_name: string | null;
  tierA_exit: number;
  tierB_exit: number | null;
  /** COMPUTED from exit codes (§3.2) — never received. */
  verified: boolean;
  /** Hash over the verified feature files' current bytes — the load-bearing field (§3.4). */
  content_hash: string;
  /** The file set (repo-relative) content_hash was computed over; a verify covers only these (§3.4). */
  coverage: string[];
  runner_run_id: string;
  kit_version: string;
  at: string;
}

/**
 * THE derivation. `verified` is a pure function of the captured exit codes and nothing else.
 * There is deliberately no parameter through which a caller can inject `true` (§3.2).
 *
 * tierB_exit === null means Tier B was legitimately skipped (opt-out at B10.5). Whether `null`
 * is *acceptable* for a given feature is the SYNC backstop's decision (§3.3 visual/overlay rule),
 * not this writer's — here a skipped Tier B does not by itself make the verdict false.
 */
export function computeVerified(tierA_exit: number, tierB_exit: number | null): boolean {
  return tierA_exit === 0 && (tierB_exit === 0 || tierB_exit === null);
}

/** Resolve the git repo root for the directory this script runs in. */
function resolveRepoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}

/**
 * A1.1 repo-role guard (measurement-layer-v1.md §7 A1.1). A code-verify note is a TARGET-repo
 * fact: it attests that a target repo's tests passed and must attach to the TARGET feature commit,
 * never kit HEAD. Attaching it to the kit source-of-truth repo is a category error (the kit has no
 * src/<Feature>, and its HEAD is a spec/evolution commit). This module ships to targets via the
 * sync allowlist, so it WILL run in target repos — it must self-detect the kit and hard-error only
 * there. Refuse if EITHER marker is present (err toward refusing on any kit signal):
 *   1. sync.config.json with a `targets` array at repoRoot — the DEFINITIONAL source-of-truth
 *      marker (it names the repos the kit syncs TO). Not in the sync allowlist, so it never
 *      propagates to a target; its presence uniquely identifies the kit.
 *   2. package.json name === KIT_PACKAGE_NAME — the kit package identity. Targets keep their own
 *      names (@edx/frontend-app-*), so this never matches a target.
 */
function assertNotKitRepo(repoRoot: string): void {
  const reasons: string[] = [];

  const syncConfigPath = path.join(repoRoot, 'sync.config.json');
  if (fs.existsSync(syncConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(syncConfigPath, 'utf8'));
      if (Array.isArray(cfg.targets)) reasons.push('sync.config.json (with targets[])');
    } catch {
      /* a malformed sync.config.json is not a positive kit signal — ignore */
    }
  }

  const pkgPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && pkg.name === KIT_PACKAGE_NAME) {
        reasons.push(`package.json name === "${KIT_PACKAGE_NAME}"`);
      }
    } catch {
      /* ignore unreadable/invalid package.json */
    }
  }

  if (reasons.length > 0) {
    throw new Error(
      `record-verify: REFUSING to write a verify note — cwd resolves to the kit source-of-truth ` +
        `repo (${repoRoot}), detected by: ${reasons.join(', ')}. A code-verify note attests that a ` +
        `TARGET repo's tests passed and must attach to the TARGET feature commit, never kit HEAD ` +
        `(measurement-layer-v1.md §7 A1.1). Run the capture wrapper from the target repo.`
    );
  }
}

/** Resolve kit version from commands/feature-from-confluence.md PROMPT_VERSION (mirrors telemetry.ts). */
function resolveKitVersion(repoRoot: string): string {
  try {
    const cmdFile = path.join(repoRoot, '.claude', 'commands', 'feature-from-confluence.md');
    const content = fs.readFileSync(cmdFile, 'utf8');
    const match = content.match(/PROMPT_VERSION:\s*v([\d.]+)/);
    if (match) return match[1] + '.0';
  } catch {
    /* fall through */
  }
  return '3.18.0';
}

/** Recursively list every `data/` directory at-or-under `root` (the kit's per-feature marker). */
function findDataDirs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'data') out.push(full);
      else walk(full);
    }
  };
  walk(root);
  return out;
}

/**
 * W.3 over-broad-path guard (v3.22, measurement-layer-content-hash-split.md §7.4). HARD REFUSAL via a
 * POSITIVE property, NOT a denylist: a valid `codePath` is a LEAF feature dir — it owns exactly one
 * `data/` layer (the kit's per-feature convention, HR32/33) and that `data/` sits directly at
 * `codePath/data`. A framework MODULE dir (e.g. `src/studio-home`) has no `data/` at its own root and
 * many nested feature `data/` dirs → throws, regardless of name (so a novel/unknown module dir is
 * caught by the same rule). An empty/non-feature dir has zero `data/` → throws. Folded into
 * computeContentHash so the writer and the pre-commit hook enforce it identically.
 */
export function assertLeafFeatureDir(repoRoot: string, codePath: string): void {
  const abs = path.join(repoRoot, codePath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`record-verify: codePath "${codePath}" does not exist or is not a directory (§7.1).`);
  }
  const dataDirs = findDataDirs(abs).map((d) => path.relative(repoRoot, d).split(path.sep).join('/')).sort();
  const own = `${codePath.split(path.sep).join('/').replace(/\/$/, '')}/data`;
  if (dataDirs.length === 0) {
    throw new Error(
      `record-verify: codePath "${codePath}" is not a leaf feature dir — no data/ layer found under it ` +
        `(§7.4). Pass the LEAF feature folder (the one whose own data/api.ts is the frozen contract).`
    );
  }
  if (!dataDirs.includes(own)) {
    throw new Error(
      `record-verify: codePath "${codePath}" is a module/container dir, not a leaf feature — its own ` +
        `${own} does not exist; data/ found only in nested sub-dir(s): ${dataDirs.join(', ')} (§7.4).`
    );
  }
  if (dataDirs.length > 1) {
    throw new Error(
      `record-verify: codePath "${codePath}" contains nested sub-feature(s) — multiple data/ layers: ` +
        `${dataDirs.join(', ')}. Pass a single leaf feature dir (§7.4).`
    );
  }
}

/**
 * Per-feature content hash over the TARGET repo's TESTED TREE (§7 A1.1; W.3 split v3.22 — code and
 * spec locations are now supplied independently instead of derived from one `feature` string). Covers:
 *   - every file under `codePath/` — the feature code AND its co-located *.test.ts (recursive walk), and
 *   - `docs/specs/<specName>/ux-states.json` IF `specName` is given and the file exists — target-side,
 *     DEFINES the E2E states / ac_assertions / unit_tests, so editing it changes what was verified (A1.1).
 * FAIL-CLOSED: `assertLeafFeatureDir` first (§7.4), then a walk that must yield ≥1 file (§7.1) — a
 * missing/empty codePath throws rather than silently hashing a partial (or spec-only) tree.
 * Deterministic: files hashed in sorted repo-relative-path order, path bytes mixed in so a rename
 * changes the hash. Returns { hash, coverage } — coverage is the file set the sync guard must re-hash.
 */
export function computeContentHash(
  repoRoot: string,
  scope: { codePath: string; specName: string | null }
): { hash: string; coverage: string[] } {
  // §7.4 over-broad guard + §7.1 existence — both writer and hook run this identically.
  assertLeafFeatureDir(repoRoot, scope.codePath);

  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };

  // The tested code + its co-located tests (target repo), rooted at the LEAF feature dir.
  walk(path.join(repoRoot, scope.codePath));

  if (files.length === 0) {
    throw new Error(`record-verify: codePath "${scope.codePath}" hashed zero files (§7.1) — refusing an empty tree.`);
  }

  // ux-states.json — target-side E2E test definition (A1.1). Single file; include if present.
  if (scope.specName) {
    const uxStates = path.join(repoRoot, 'docs', 'specs', scope.specName, 'ux-states.json');
    if (fs.existsSync(uxStates) && fs.statSync(uxStates).isFile()) files.push(uxStates);
  }

  // Repo-relative, forward-slash paths so the hash is stable across OSes.
  const coverage = files
    .map((f) => path.relative(repoRoot, f).split(path.sep).join('/'))
    .sort();

  const h = crypto.createHash('sha256');
  for (const rel of coverage) {
    h.update(rel, 'utf8');
    h.update('\0');
    h.update(fs.readFileSync(path.join(repoRoot, rel)));
    h.update('\0');
  }
  return { hash: h.digest('hex'), coverage };
}

/**
 * THE trusted writer. Computes `verified` from the captured exit codes, hash-pins the feature
 * files, and writes the record as a git note on refs/notes/verify at HEAD (§3.4). The note is
 * overwritten (-f) on re-verify. Returns the written note.
 */
export function recordVerify(input: RecordVerifyInput): VerifyNote {
  const repoRoot = resolveRepoRoot();
  // A1.1 repo-role guard: never attach a code-verify note to the kit source-of-truth repo.
  assertNotKitRepo(repoRoot);

  // §7.2 fail-closed: if Tier B actually ran (non-null exit), it tested E2E states that MUST be
  // pinned — the spec's ux-states.json has to exist. A null Tier B (skipped) may legitimately have
  // no spec. This guards against a Tier-B pass whose tested states are not covered by the hash.
  if (input.tierB_exit !== null) {
    if (!input.specName) {
      throw new Error(`record-verify: Tier B ran (exit ${input.tierB_exit}) but no --spec-name given — its E2E states cannot be hash-pinned (§7.2).`);
    }
    const uxStates = path.join(repoRoot, 'docs', 'specs', input.specName, 'ux-states.json');
    if (!fs.existsSync(uxStates)) {
      throw new Error(`record-verify: Tier B ran but docs/specs/${input.specName}/ux-states.json is missing — refusing to record an unpinned E2E verify (§7.2).`);
    }
  }

  const { hash, coverage } = computeContentHash(repoRoot, { codePath: input.codePath, specName: input.specName });
  // Derived display/DB label only (never a hash input) — spec name, else the code dir's basename.
  const label = input.specName ?? input.codePath.split(/[\\/]/).filter(Boolean).pop() ?? input.codePath;

  const note: VerifyNote = {
    phase: input.phase,
    feature: label,
    code_path: input.codePath.split(path.sep).join('/'),
    spec_name: input.specName,
    tierA_exit: input.tierA_exit,
    tierB_exit: input.tierB_exit,
    // Derived, not received. This is the whole point of the layer.
    verified: computeVerified(input.tierA_exit, input.tierB_exit),
    content_hash: hash,
    coverage,
    runner_run_id: input.runner_run_id ?? process.env.KIT_RUN_ID ?? generateRunId(),
    kit_version: input.kit_version ?? resolveKitVersion(repoRoot),
    at: input.at ?? new Date().toISOString(),
  };

  // Attach to the exact HEAD being attested. Args passed as an array (no shell) so the JSON
  // body needs no escaping. -f overwrites a prior note on re-verify (§3.4).
  const res = spawnSync(
    'git',
    ['notes', `--ref=${VERIFY_NOTES_REF}`, 'add', '-f', '-m', JSON.stringify(note), 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`git notes add failed (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
  return note;
}

/**
 * The capture wrapper. RUNS the tier commands, captures their real exit codes, and hands ONLY
 * those exit codes to recordVerify. This is the code the command flow calls at B11 — the model
 * never supplies the verdict, only the wrapper's observation of what the runners returned.
 */
export function captureAndRecord(opts: {
  phase?: 'verify_complete' | 'final_confirmed';
  codePath: string;
  specName: string | null;
  tierACmd: string;
  tierBCmd?: string | null;
  runner_run_id?: string;
}): VerifyNote {
  const repoRoot = resolveRepoRoot();
  // A1.1 repo-role guard — fail BEFORE running the tier commands if we're in the kit repo.
  assertNotKitRepo(repoRoot);

  const runExit = (cmd: string): number => {
    const r = spawnSync(cmd, { cwd: repoRoot, shell: true, stdio: 'inherit' });
    // Signal death or spawn failure → treat as failure, never as pass.
    return r.status === null ? 1 : r.status;
  };

  const tierA_exit = runExit(opts.tierACmd);
  const tierB_exit =
    opts.tierBCmd && opts.tierBCmd.trim() ? runExit(opts.tierBCmd) : null;

  return recordVerify({
    phase: opts.phase ?? 'verify_complete',
    codePath: opts.codePath,
    specName: opts.specName,
    tierA_exit,
    tierB_exit,
    runner_run_id: opts.runner_run_id,
  });
}

function generateRunId(): string {
  return `run-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Best-effort target-side upsert of the verdict into Supabase `verify_records` (A1.3 — the WRITE
 * half of the remote sync backstop). Called by the CLI right after the git note is written (the CLI
 * IS the B11-wrapper entry point). BEST-EFFORT by design: a telemetry outage must never fail a real
 * feature run — mirrors telemetry.ts. The asymmetry is intentional: this WRITE is fail-open, but the
 * kit-side SYNC guard that READS this table (assertVerifiedForSync) is fail-CLOSED.
 *
 * NOT an adversarial control (A1.4 — KNOWN, ACCEPTED v1 limit): the anon key is public, so this row
 * is exactly as forgeable as the git note — forging both costs no more than forging one. Its job is
 * (1) give the kit-side sync guard verify VISIBILITY it otherwise has zero of, and (2) catch
 * NON-adversarial self-report (a run that never computed a real exit code). It does NOT make sync
 * tamper-proof; do not describe it as security.
 */
export async function pushVerifyRecord(note: VerifyNote): Promise<void> {
  try {
    const repoRoot = resolveRepoRoot();
    const repo = path.basename(repoRoot);
    let head_sha = '';
    try {
      head_sha = (
        execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }) as string
      ).trim();
    } catch {
      /* unborn branch / no HEAD yet — leave blank */
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/verify_records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
        Connection: 'close', // avoid the Windows undici keep-alive teardown assert (see telemetry.ts)
      },
      body: JSON.stringify({
        runner_run_id: note.runner_run_id,
        repo,
        head_sha,
        feature: note.feature,
        // W.3 v3.22 — code_path/spec_name columns (migrations/0004). Additive; if the migration is not
        // yet applied the POST 400s and the fail-open catch below keeps the local note valid.
        code_path: note.code_path,
        spec_name: note.spec_name,
        verified: note.verified,
        // snake_case keys to match the verify_records columns (Postgres folds unquoted identifiers
        // to lowercase; values still come from the camelCase VerifyNote fields).
        tier_a_exit: note.tierA_exit,
        tier_b_exit: note.tierB_exit,
        content_hash: note.content_hash,
        kit_version: note.kit_version,
        created_at: note.at,
      }),
    });
    if (!res.ok) {
      console.error(`⚠️  verify_records upsert failed (${res.status}) — the sync backstop won't see this run.`);
    } else {
      console.log(`↑ verify_records upserted (repo=${repo}, kit_version=${note.kit_version}, verified=${note.verified}).`);
    }
  } catch (e) {
    console.error(`⚠️  verify_records upsert skipped: ${(e as Error).message}`);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

/** Parse a tier-exit flag: absent or "null"/"none" → null; otherwise a base-10 int. */
function parseExit(v: string | undefined): number | null {
  if (v === undefined || v === 'null' || v === 'none') return null;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) {
    console.error(`Invalid exit code: ${v}`);
    process.exit(1);
  }
  return n;
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);

  switch (command) {
  case 'record': {
    if (!flags['feature-path']) {
      console.error('Usage: record-verify.ts record --feature-path <src/dir> [--spec-name <docs/specs folder>] --tierA <int> [--tierB <int|null>]');
      process.exit(1);
    }
    if (flags.tierA === undefined) {
      console.error('--tierA <exit code> is required.');
      process.exit(1);
    }
    const tierA_exit = parseExit(flags.tierA);
    if (tierA_exit === null) {
      console.error('--tierA must be a real exit code (Tier A always runs); null is not allowed.');
      process.exit(1);
    }
    const note = recordVerify({
      phase: (flags.phase as 'verify_complete' | 'final_confirmed') ?? 'verify_complete',
      codePath: flags['feature-path'],
      specName: flags['spec-name'] ?? null,
      tierA_exit,
      tierB_exit: parseExit(flags.tierB),
      runner_run_id: flags['run-id'],
      kit_version: flags['kit-version'],
    });
    console.log(JSON.stringify(note, null, 2));
    console.log(`\n✅ verify note written to ${VERIFY_NOTES_REF} @ HEAD — verified=${note.verified}`);
    await pushVerifyRecord(note);
    break;
  }

  case 'capture': {
    if (!flags['feature-path'] || !flags['tierA-cmd']) {
      console.error('Usage: record-verify.ts capture --feature-path <src/dir> [--spec-name <docs/specs folder>] --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"]');
      process.exit(1);
    }
    const note = captureAndRecord({
      phase: (flags.phase as 'verify_complete' | 'final_confirmed') ?? 'verify_complete',
      codePath: flags['feature-path'],
      specName: flags['spec-name'] ?? null,
      tierACmd: flags['tierA-cmd'],
      tierBCmd: flags['tierB-cmd'] ?? null,
      runner_run_id: flags['run-id'],
    });
    console.log(JSON.stringify(note, null, 2));
    console.log(`\n✅ verify note written to ${VERIFY_NOTES_REF} @ HEAD — verified=${note.verified}`);
    await pushVerifyRecord(note);
    break;
  }

  case 'show': {
    const res = spawnSync('git', ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD'], {
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      console.error(res.stderr || 'No verify note on HEAD.');
      process.exit(1);
    }
    console.log(res.stdout.trim());
    break;
  }

  default:
    console.log(`
Usage:
  npx tsx .claude/integrations/record-verify.ts record  --feature-path <src/dir> [--spec-name <folder>] --tierA <int> [--tierB <int|null>] [--run-id <id>] [--kit-version <v>]
  npx tsx .claude/integrations/record-verify.ts capture --feature-path <src/dir> [--spec-name <folder>] --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"] [--run-id <id>]
  npx tsx .claude/integrations/record-verify.ts show    # print the verify note on HEAD

--feature-path is the LEAF feature code dir (e.g. src/studio-home/.../ProgressReports); --spec-name is
the flat docs/specs folder (e.g. US-AD-095-ProgressReports). content_hash covers both (W.3 v3.22).

record  — writer: given captured exit codes, compute verified + write the git note.
capture — wrapper: run the tier commands, capture their exit codes, then write the note.

verified is COMPUTED from exit codes inside recordVerify; it is never accepted as input.
`);
  }
}

if (process.argv[1] && /record-verify\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
