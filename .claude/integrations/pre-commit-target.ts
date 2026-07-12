/**
 * pre-commit-target.ts — TARGET-repo Tier A/B verify-gate pre-commit validator.
 *
 * Measurement Layer v1 §3.1 + §7 Amendment A1.2 (TARGET side). Runs in a TARGET repo (where the
 * feature code lives and where B11 executed the real tests). Deployed to <target>/.git/hooks/
 * pre-commit by install-hooks.ts; reaches the target via the sync allowlist (.claude/integrations/).
 *
 * Tier A (LIVE, fast, no external deps): `lint-feature --gate` on the note's LEAF code_path.
 * Tier B (READ ONLY — NEVER re-runs Playwright): validate the refs/notes/verify note on HEAD —
 *   exists + verified === true + its content_hash equals the RECOMPUTED hash of the tested tree. W.3
 *   v3.22: the note stores code_path (the nested leaf feature dir) + spec_name (the flat docs/specs
 *   folder) separately; the recompute calls computeContentHash({codePath, specName}) with the note's
 *   OWN stored paths, so writer and hook are byte-identical (a reimplementation could drift).
 *   Staged-SCOPE (no feature-root guessing): every staged src/** file must be UNDER code_path and any
 *   staged ux-states.json must be the note's spec's — a commit staging out-of-feature files is blocked.
 *   Missing / stale / unverified / out-of-scope → block with an actionable message (§3.1).
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

/** Staged feature signals — NO feature-root guessing (W.3 v3.22). */
function stagedFeatureSignals(): { srcFiles: string[]; uxStates: string[] } {
  const srcFiles: string[] = [], uxStates: string[] = [];
  for (const p of stagedPaths()) {
    const parts = p.split('/');
    if (parts[0] === 'src' && parts.length >= 2 && !parts[1].startsWith('.')) srcFiles.push(p);
    else if (parts[0] === 'docs' && parts[1] === 'specs' && parts.length >= 4 &&
      parts[parts.length - 1] === 'ux-states.json' && !parts[2].startsWith('.')) uxStates.push(p);
  }
  return { srcFiles, uxStates };
}

/** Longest common DIRECTORY prefix of repo-relative paths — a display hint only, never authoritative. */
function commonDirPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const split = paths.map((p) => p.split('/'));
  const first = split[0];
  let n = first.length - 1; // exclude the filename segment
  for (const s of split) {
    let i = 0;
    while (i < n && i < s.length - 1 && s[i] === first[i]) i++;
    n = i;
  }
  return n > 0 ? first.slice(0, n).join('/') : null;
}

/** repo-relative path `f` is inside dir `d` (exact dir or a descendant). */
function isUnder(f: string, d: string): boolean {
  const dd = d.replace(/\/$/, '');
  return f === dd || f.startsWith(dd + '/');
}

/** The verify note body on HEAD, or null if absent/empty. */
function readVerifyNote(): string | null {
  const r = spawnSync('git', ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').trim();
  return out ? out : null;
}

/**
 * The concrete "B11 wrapper" command (measurement-layer-b11-wire.md §4; W.3 v3.22 split). The abstract
 * phrase "run the B11 wrapper" is exactly THIS `record-verify.ts capture` CLI — named concretely so a
 * developer who hits this gate can reproduce the verify by hand. `codePath` is the LEAF feature dir,
 * `specName` the flat docs/specs folder (omit `--spec-name`/`--tierB-cmd` when there is no spec / Tier
 * B was opted out — Tier B = null is not a failure).
 */
function b11WrapperCmd(codePath: string, specName: string | null): string {
  const specPart = specName ? `--spec-name ${specName} ` : '';
  const checklist = specName ? `--checklist docs/specs/${specName}/checklist.md --ux-states docs/specs/${specName}/ux-states.json ` : '';
  const tierB = specName ? ` --tierB-cmd "npx tsx .claude/integrations/b11-runner.ts ${specName} --feature-path ${codePath}"` : '';
  return (
    `npx tsx .claude/integrations/record-verify.ts capture --feature-path ${codePath} ${specPart}` +
    `--tierA-cmd "npx tsx .claude/integrations/lint-feature.ts ${codePath} ${checklist}--min-verified 0.6 --gate"` +
    tierB
  );
}

function main(): void {
  const started = Date.now();
  const root = repoRoot();

  const { srcFiles, uxStates } = stagedFeatureSignals();
  if (srcFiles.length === 0 && uxStates.length === 0) {
    console.log(`✓ verify-gate: no feature (src/** or ux-states.json) staged — nothing to check (${Date.now() - started}ms)`);
    process.exit(0);
  }

  const problems: Problem[] = [];
  // Best-effort command hint for the "no note" / parse-fail cases (authoritative validation uses the note).
  const codeHint = commonDirPrefix(srcFiles) ?? (uxStates[0] ? `src/${uxStates[0].split('/')[2]}` : 'src/<leaf-feature-dir>');
  const specHint = uxStates[0] ? uxStates[0].split('/')[2] : null;

  // ── Tier B — READ + validate the verify note on HEAD (no re-run) ──
  const raw = readVerifyNote();
  let note: Record<string, unknown> | null = null;
  if (raw === null) {
    problems.push({
      msg: 'Tier B: no verify record (refs/notes/verify note) on HEAD',
      fix: `produce a fresh verify record, then re-commit:\n        ${b11WrapperCmd(codeHint, specHint)}`,
    });
  } else {
    try { note = JSON.parse(raw) as Record<string, unknown>; } catch {
      problems.push({ msg: 'Tier B: verify note on HEAD is not valid JSON',
        fix: `rewrite a fresh verify record, then re-commit:\n        ${b11WrapperCmd(codeHint, specHint)}` });
    }
    if (note) {
      const codePath = typeof note.code_path === 'string' ? note.code_path : '';
      const specName = (typeof note.spec_name === 'string' ? note.spec_name : null);
      if (note.verified !== true) {
        problems.push({ msg: `Tier B: verify record says verified=${JSON.stringify(note.verified)} (tests did not pass)`,
          fix: `fix the failing tests, then re-run:\n        ${b11WrapperCmd(codePath || codeHint, specName)}` });
      }
      // Staged-SCOPE validation (§4) — no feature-root guessing: every staged src file must be UNDER
      // the note's code_path; every staged ux-states.json must be the note's spec's. A commit that
      // stages files outside the attested feature is blocked (a note covers one feature/HEAD).
      for (const f of srcFiles) {
        if (!codePath || !isUnder(f, codePath)) {
          problems.push({ msg: `Tier B: staged "${f}" is outside the verify note's feature ("${codePath || '?'}")`,
            fix: `stage only files under ${codePath || 'the attested feature'}, or re-verify the intended feature:\n        ${b11WrapperCmd(codePath || codeHint, specName)}` });
        }
      }
      for (const u of uxStates) {
        const expected = specName ? `docs/specs/${specName}/ux-states.json` : null;
        if (u !== expected) {
          problems.push({ msg: `Tier B: staged "${u}" is not the verify note's spec (${expected ?? 'none — Tier B was skipped'})`,
            fix: `re-verify with the matching --spec-name:\n        ${b11WrapperCmd(codePath || codeHint, specName)}` });
        }
      }
      // ── Tier A — lint-feature --gate on the note's LEAF code_path (LIVE, IN-PROCESS) ──
      // In-process (reuses lint's exact gate logic; one startup; avoids the Windows npx.cmd ENOENT).
      if (codePath) {
        const args = parseArgs([codePath, '--gate']);
        const errs = lint(args).filter((finding) => finding.level === 'error');
        if (gateExitCode(args, errs.length) !== 0) {
          for (const e of errs) console.error(`    [lint ${e.rule}] ${e.msg}`);
          problems.push({
            msg: `Tier A: lint-feature --gate failed for ${codePath} (${errs.length} error(s), listed above)`,
            fix: `fix the lint violations for ${codePath}, then re-stage (full detail: npx tsx .claude/integrations/lint-feature.ts ${codePath} --gate).`,
          });
        }
      }
      // Staleness — recompute the tested-tree hash from the note's OWN stored code_path/spec_name
      // (W.3 v3.22) so writer and hook feed computeContentHash identical inputs → byte-identical hash.
      if (codePath && typeof note.content_hash === 'string') {
        const { hash } = computeContentHash(root, { codePath, specName });
        if (hash !== note.content_hash) {
          problems.push({
            msg: `Tier B: content_hash mismatch for "${String(note.feature)}" — tested files changed since verify (STALE)`,
            fix: `re-verify the current code/ux-states, then re-commit:\n        ${b11WrapperCmd(codePath, specName)}`,
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

  const feat = note && typeof note.feature === 'string' ? note.feature : '(feature)';
  console.log(`✓ verify-gate OK — "${feat}": Tier A gate passed + staged scope in-feature + Tier B record valid (${ms}ms)`);
  process.exit(0);
}

main();
