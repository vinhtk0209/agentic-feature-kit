/**
 * pre-commit-target.ts — TARGET-repo Tier A/B verify-gate pre-commit validator.
 *
 * Measurement Layer v1 §3.1 + §7 Amendment A1.2 (TARGET side). Runs in a TARGET repo (where the
 * feature code lives and where B11 executed the real tests). Deployed to <target>/.git/hooks/
 * pre-commit by install-hooks.ts; reaches the target via the sync allowlist (.claude/integrations/).
 *
 * Tier A (LIVE, fast, no external deps): `lint-feature --gate` on each staged feature (src/<F>).
 * Tier B (READ ONLY — NEVER re-runs Playwright): validate the refs/notes/verify note on HEAD —
 *   exists + verified === true + its content_hash equals the RECOMPUTED hash of the tested tree
 *   (src/<F> + ux-states.json). It imports computeContentHash from record-verify so the recompute
 *   is byte-identical to what the writer produced — a reimplementation could drift and never match.
 *   Missing / stale / unverified → block with an actionable message (never a silent pass, §3.1).
 *
 * Timing model: at pre-commit HEAD is the parent commit; the note was attached to that HEAD by the
 * B11 wrapper (recordVerify), and we recompute over the current tested-tree bytes — the same
 * working-tree bytes recordVerify hashed. A code/ux-states change since verify → hash mismatch →
 * blocked as stale.
 */

import { execFileSync, spawnSync } from 'child_process';
import { computeContentHash, VERIFY_NOTES_REF } from './record-verify';
import { parseArgs, lint, gateExitCode } from './lint-feature';

interface Problem { msg: string; fix: string; }

function repoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function stagedPaths(): string[] {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Feature name from a staged path: `src/<F>/…` (code) or `docs/specs/<F>/ux-states.json` (test def). */
function featureFromStaged(p: string): string | null {
  const parts = p.split('/');
  if (parts[0] === 'src' && parts.length >= 3 && !parts[1].startsWith('.')) return parts[1];
  if (parts[0] === 'docs' && parts[1] === 'specs' && parts.length >= 4 &&
      parts[parts.length - 1] === 'ux-states.json' && !parts[2].startsWith('.')) return parts[2];
  return null;
}

/** The verify note body on HEAD, or null if absent/empty. */
function readVerifyNote(): string | null {
  const r = spawnSync('git', ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').trim();
  return out ? out : null;
}

function main(): void {
  const started = Date.now();
  const root = repoRoot();

  const features = new Set<string>();
  for (const p of stagedPaths()) { const f = featureFromStaged(p); if (f) features.add(f); }

  if (features.size === 0) {
    console.log(`✓ verify-gate: no feature (src/<F> or ux-states.json) staged — nothing to check (${Date.now() - started}ms)`);
    process.exit(0);
  }

  const problems: Problem[] = [];

  // ── Tier A — lint-feature --gate on each staged feature (LIVE, IN-PROCESS) ──
  // In-process, NOT a child process: reuses lint-feature's exact gate logic (parseArgs → lint →
  // gateExitCode — the same path its CLI main() runs) while avoiding (a) a second tsx/npx
  // cold-start, keeping the whole hook to ONE startup (well under the <5s budget), and (b) the
  // Windows `spawnSync('npx', …)` ENOENT a cross-process call hits (npx is npx.cmd there).
  // lint() reads the feature folder relative to cwd, which git sets to the repo root for the hook.
  for (const f of features) {
    const args = parseArgs([`src/${f}`, '--gate']);
    const errs = lint(args).filter((finding) => finding.level === 'error');
    if (gateExitCode(args, errs.length) !== 0) {
      for (const e of errs) console.error(`    [lint ${e.rule}] ${e.msg}`);
      problems.push({
        msg: `Tier A: lint-feature --gate failed for src/${f} (${errs.length} error(s), listed above)`,
        fix: `fix the lint violations for src/${f}, then re-stage (full detail: npx tsx .claude/integrations/lint-feature.ts src/${f} --gate).`,
      });
    }
  }

  // ── Tier B — READ + validate the verify note on HEAD (no re-run) ──
  const raw = readVerifyNote();
  if (raw === null) {
    problems.push({
      msg: 'Tier B: no verify record (refs/notes/verify note) on HEAD',
      fix: 'run the B11 wrapper to produce a fresh verify record, then re-commit.',
    });
  } else {
    let note: Record<string, unknown> | null = null;
    try { note = JSON.parse(raw) as Record<string, unknown>; } catch {
      problems.push({ msg: 'Tier B: verify note on HEAD is not valid JSON',
        fix: 'run the B11 wrapper to rewrite a fresh verify record, then re-commit.' });
    }
    if (note) {
      if (note.verified !== true) {
        problems.push({ msg: `Tier B: verify record says verified=${JSON.stringify(note.verified)} (tests did not pass)`,
          fix: 'fix the failing tests and re-run the B11 wrapper, then re-commit.' });
      }
      // Every staged feature must be the one this note attests (a note covers one feature/HEAD).
      for (const f of features) {
        if (f !== note.feature) {
          problems.push({ msg: `Tier B: feature "${f}" is staged but the verify note covers "${String(note.feature)}"`,
            fix: `run the B11 wrapper for "${f}", then re-commit.` });
        }
      }
      // Staleness — recompute the tested-tree hash for the note's feature and compare.
      if (typeof note.feature === 'string' && typeof note.content_hash === 'string') {
        const { hash } = computeContentHash(root, note.feature);
        if (hash !== note.content_hash) {
          problems.push({
            msg: `Tier B: content_hash mismatch for "${note.feature}" — tested files changed since verify (STALE)`,
            fix: 're-run the B11 wrapper to re-verify the current code/ux-states, then re-commit.',
          });
        }
      }
    }
  }

  const ms = Date.now() - started;
  if (problems.length > 0) {
    console.error(`\n✗ verify-gate pre-commit FAILED — ${problems.length} problem(s) (${ms}ms):\n`);
    for (const p of problems) { console.error(`  • ${p.msg}`); console.error(`      → ${p.fix}`); }
    console.error(`\nTier A runs live; Tier B only READS the B11 verify record (no Playwright re-run).`);
    console.error(`To bypass consciously (NOT recommended): git commit --no-verify.\n`);
    process.exit(1);
  }

  console.log(`✓ verify-gate OK — ${features.size} feature(s): Tier A gate passed + Tier B record valid (${ms}ms)`);
  process.exit(0);
}

main();
