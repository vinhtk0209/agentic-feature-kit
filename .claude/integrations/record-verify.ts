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
 * CLI:
 *   npx tsx .claude/integrations/record-verify.ts record  --feature <F> --tierA <int> [--tierB <int|null>] [--run-id <id>] [--kit-version <v>]
 *   npx tsx .claude/integrations/record-verify.ts capture --feature <F> --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"] [--run-id <id>]
 *   npx tsx .claude/integrations/record-verify.ts show    [--feature <F>]   # print the note on HEAD
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';

export const VERIFY_NOTES_REF = 'refs/notes/verify';

/** The kit source-of-truth package name — one of the A1.1 repo-role markers (see assertNotKitRepo). */
const KIT_PACKAGE_NAME = 'feature-from-confluence-kit';

export interface RecordVerifyInput {
  /** The workflow phase this verdict is for. */
  phase: 'verify_complete' | 'final_confirmed';
  /** Feature name — the TARGET repo's tested tree (src/<feature>/ + ux-states.json) is the hash-pin scope (§7 A1.1). */
  feature: string;
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
  feature: string;
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

/**
 * Per-feature content hash over the TARGET repo's TESTED TREE (§7 A1.1, superseding §3.4's
 * docs/specs scope). Covers:
 *   - every file under src/<feature>/ — the feature code AND its co-located *.test.ts (v3.16 puts
 *     unit tests at src/<feature>/utils/*.test.ts, so a recursive walk captures them), and
 *   - docs/specs/<feature>/ux-states.json IF present — it is target-side and DEFINES the E2E
 *     states / ac_assertions / unit_tests, so editing it changes what was verified (A1.1).
 * Deterministic: files hashed in sorted repo-relative-path order, path bytes mixed in so a rename
 * changes the hash. A stale verify (tested files changed since) or one copied from another feature
 * cannot match. Returns { hash, coverage } — coverage is the file set the sync guard must re-hash.
 */
export function computeContentHash(
  repoRoot: string,
  feature: string
): { hash: string; coverage: string[] } {
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

  // The tested code + its co-located tests (target repo).
  walk(path.join(repoRoot, 'src', feature));

  // ux-states.json — target-side E2E test definition (A1.1). Single file; include if present.
  const uxStates = path.join(repoRoot, 'docs', 'specs', feature, 'ux-states.json');
  if (fs.existsSync(uxStates) && fs.statSync(uxStates).isFile()) files.push(uxStates);

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
  const { hash, coverage } = computeContentHash(repoRoot, input.feature);

  const note: VerifyNote = {
    phase: input.phase,
    feature: input.feature,
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
  feature: string;
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
    feature: opts.feature,
    tierA_exit,
    tierB_exit,
    runner_run_id: opts.runner_run_id,
  });
}

function generateRunId(): string {
  return `run-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
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

function main(): void {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);

  switch (command) {
  case 'record': {
    if (!flags.feature) {
      console.error('Usage: record-verify.ts record --feature <F> --tierA <int> [--tierB <int|null>]');
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
      feature: flags.feature,
      tierA_exit,
      tierB_exit: parseExit(flags.tierB),
      runner_run_id: flags['run-id'],
      kit_version: flags['kit-version'],
    });
    console.log(JSON.stringify(note, null, 2));
    console.log(`\n✅ verify note written to ${VERIFY_NOTES_REF} @ HEAD — verified=${note.verified}`);
    break;
  }

  case 'capture': {
    if (!flags.feature || !flags['tierA-cmd']) {
      console.error('Usage: record-verify.ts capture --feature <F> --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"]');
      process.exit(1);
    }
    const note = captureAndRecord({
      phase: (flags.phase as 'verify_complete' | 'final_confirmed') ?? 'verify_complete',
      feature: flags.feature,
      tierACmd: flags['tierA-cmd'],
      tierBCmd: flags['tierB-cmd'] ?? null,
      runner_run_id: flags['run-id'],
    });
    console.log(JSON.stringify(note, null, 2));
    console.log(`\n✅ verify note written to ${VERIFY_NOTES_REF} @ HEAD — verified=${note.verified}`);
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
  npx tsx .claude/integrations/record-verify.ts record  --feature <F> --tierA <int> [--tierB <int|null>] [--run-id <id>] [--kit-version <v>]
  npx tsx .claude/integrations/record-verify.ts capture --feature <F> --tierA-cmd "<cmd>" [--tierB-cmd "<cmd>"] [--run-id <id>]
  npx tsx .claude/integrations/record-verify.ts show    # print the verify note on HEAD

record  — writer: given captured exit codes, compute verified + write the git note.
capture — wrapper: run the tier commands, capture their exit codes, then write the note.

verified is COMPUTED from exit codes inside recordVerify; it is never accepted as input.
`);
  }
}

if (process.argv[1] && /record-verify\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
