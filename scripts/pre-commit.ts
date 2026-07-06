/**
 * pre-commit.ts — kit-repo spec-integrity pre-commit validator (Tier-A-LITE).
 *
 * Measurement Layer v1 §7 Amendment A1.2 (KIT side). This is the kit half of the split hook: it
 * validates that the spec artifacts being committed are well-formed. It makes NO code-verify claim.
 *
 * Checks (all kit-side-possible, no external/network deps, single process):
 *   - staged docs/specs/<Feature>/checklist.md   → header-lock (v3.10/3.11) + ACT header format
 *   - staged docs/specs/<Feature>/ux-states.json → LOCKED v2 schema + `expected` enum (v3.7)
 *   - INDEX consistency: a staged feature must appear in the (staged) docs/specs/INDEX.md
 *   - staged *.ts → SYNTAX check via esbuild (the same engine `tsx --check` uses)
 *
 * NOT done (impossible/wrong kit-side — A1.2): no Tier B / no verify-note read; no lint-feature
 * --gate. See the .githooks/pre-commit banner for why.
 *
 * TYPE-CHECK DEGRADATION (intentional, documented): the .ts check is SYNTAX ONLY (esbuild = what
 * `tsx --check` runs), NOT a type-check. A real `tsc` cannot run in this repo right now — it pins
 * typescript@4.9.5 but has @types/node@26 installed, whose .d.ts uses TS5.0+ syntax 4.9.5 cannot
 * parse (~47 parse errors in @types/node/ffi.d.ts, unrelated to kit source). Until the toolchain is
 * reconciled (bump TS ≥5.x OR pin @types/node to a 4.9-compatible major), syntax-only is the only
 * honest kit-side signal. Do NOT silently upgrade this to `tsc` — it will fail on the lib, not code.
 *
 * Fast by design: a slow/cryptic pre-commit trains `--no-verify` and is itself a design failure
 * (§3.1). Validation logic runs in tens of ms; startup dominates (~1.2s via the local tsx bin).
 */

import { execFileSync } from 'child_process';

interface Problem { file: string; msg: string; fix: string; }

/** LOCKED `expected` enum (ux-states.json v2, v3.7). */
const EXPECTED_ENUM = /^(visible|hidden|text:.+|i18n:.+|count:\d+|attr:[^=\s]+=.*)$/;

/** esbuild is lazy-loaded only when a .ts is staged, so the common fast path pays nothing for it. */
let _transform: typeof import('esbuild').transformSync | null = null;
function transform(): typeof import('esbuild').transformSync {
  if (!_transform) _transform = (require('esbuild') as typeof import('esbuild')).transformSync;
  return _transform;
}

/** Read a path's STAGED (index) bytes — validates what is actually committed, not the worktree. */
function readStaged(pathRel: string): string | null {
  try {
    return execFileSync('git', ['show', `:${pathRel}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Staged, non-deleted paths (added/copied/modified). */
function stagedPaths(): string[] {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
    encoding: 'utf8',
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Derive <Feature> from a `docs/specs/<Feature>/<file>` path; null if not a feature-artifact path. */
function featureOf(pathRel: string): string | null {
  const parts = pathRel.split('/');
  if (parts.length < 4) return null;              // docs/specs/INDEX.md → not under a feature
  if (parts[0] !== 'docs' || parts[1] !== 'specs') return null;
  if (parts[2].startsWith('.')) return null;      // .amendments, .current-feature
  return parts[2];
}

function checkChecklist(pathRel: string, text: string, problems: Problem[]): void {
  const has = (re: RegExp): boolean => re.test(text);
  if (!has(/^##\s+Requirements Coverage\s*$/m)) {
    problems.push({ file: pathRel, msg: 'missing/renamed first section header',
      fix: 'use exactly `## Requirements Coverage` (not `## REQ — …`).' });
  }
  if (!has(/^##\s+UI Verification\s*$/m)) {
    problems.push({ file: pathRel, msg: 'missing/renamed second section header',
      fix: 'use exactly `## UI Verification` (not `## UI — …`).' });
  }
  if (!has(/^##\s*ACT\b/m)) {
    problems.push({ file: pathRel, msg: 'third section header must start with `## ACT`',
      fix: 'use `## ACT — Acceptance Test Cases` (the lint parser matches /##\\s*ACT/i).' });
  }
  if (has(/^##\s+Acceptance Test Cases\s*$/m)) {   // bare form, missing the ACT prefix
    problems.push({ file: pathRel, msg: 'bare `## Acceptance Test Cases` header (missing the `ACT` prefix)',
      fix: 'rename to `## ACT — Acceptance Test Cases`.' });
  }
}

/** Recursively collect every string value under an `expected` key. */
function collectExpected(node: unknown, acc: string[]): void {
  if (Array.isArray(node)) {
    for (const v of node) collectExpected(v, acc);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'expected' && typeof v === 'string') acc.push(v);
      else collectExpected(v, acc);
    }
  }
}

function checkUxStates(pathRel: string, text: string, problems: Problem[]): void {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    problems.push({ file: pathRel, msg: `invalid JSON — ${(e as Error).message}`,
      fix: 'fix the JSON syntax; ux-states.json must parse.' });
    return;
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.feature !== 'string' || !obj.feature) {
    problems.push({ file: pathRel, msg: 'missing string `feature`', fix: 'add a top-level "feature": "<Name>".' });
  }
  if (!Array.isArray(obj.states)) {
    problems.push({ file: pathRel, msg: 'missing array `states[]`', fix: 'add a "states": [ … ] array (LOCKED v2 schema).' });
  }
  for (const opt of ['negative_states', 'unit_tests'] as const) {
    if (obj[opt] !== undefined && !Array.isArray(obj[opt])) {
      problems.push({ file: pathRel, msg: `\`${opt}\` must be an array when present`, fix: `make "${opt}" an array or remove it.` });
    }
  }
  const expected: string[] = [];
  collectExpected(json, expected);
  for (const e of expected) {
    if (!EXPECTED_ENUM.test(e)) {
      problems.push({ file: pathRel, msg: `illegal \`expected\` value: ${JSON.stringify(e)}`,
        fix: 'enum is LOCKED: visible | hidden | text:… | i18n:… | count:N | attr:name=value.' });
    }
  }
}

function checkTsSyntax(pathRel: string, text: string, problems: Problem[]): void {
  try {
    // esbuild = the engine `tsx --check` uses. SYNTAX/transform only — NOT a type-check.
    transform()(text, { loader: 'ts', sourcefile: pathRel });
  } catch (e) {
    const err = e as { errors?: Array<{ text: string; location?: { line: number; column: number } }> };
    const first = err.errors && err.errors[0];
    const where = first?.location ? ` (line ${first.location.line}:${first.location.column})` : '';
    problems.push({ file: pathRel,
      msg: `TypeScript syntax error${where}: ${first?.text ?? (e as Error).message}`,
      fix: 'fix the syntax error (this is a syntax check only, not a type-check).' });
  }
}

function main(): void {
  const started = Date.now();
  const staged = stagedPaths();

  const tsFiles = staged.filter((p) => p.endsWith('.ts') && !p.endsWith('.d.ts'));
  const specFiles = staged.filter((p) => featureOf(p) !== null);

  if (tsFiles.length === 0 && specFiles.length === 0) {   // fast path
    console.log(`✓ spec-integrity: no spec artifacts or .ts staged — nothing to check (${Date.now() - started}ms)`);
    process.exit(0);
  }

  const problems: Problem[] = [];

  for (const p of tsFiles) {
    const text = readStaged(p);
    if (text !== null) checkTsSyntax(p, text, problems);
  }

  const features = new Set<string>();
  for (const p of specFiles) {
    const feature = featureOf(p)!;
    features.add(feature);
    const base = p.split('/').pop()!;
    const text = readStaged(p);
    if (text === null) continue;
    if (base === 'checklist.md') checkChecklist(p, text, problems);
    else if (base === 'ux-states.json') checkUxStates(p, text, problems);
  }

  if (features.size > 0) {
    const indexText = readStaged('docs/specs/INDEX.md');
    if (indexText === null) {
      problems.push({ file: 'docs/specs/INDEX.md',
        msg: 'not staged/tracked, but a feature spec is being committed',
        fix: 'run `npm run workflow:index` and stage docs/specs/INDEX.md.' });
    } else {
      for (const f of features) {
        const listed = new RegExp(`(^|[^\\w-])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`, 'm');
        if (!listed.test(indexText)) {
          problems.push({ file: 'docs/specs/INDEX.md',
            msg: `stale — feature "${f}" is being committed but is not listed`,
            fix: 'run `npm run workflow:index` and stage the refreshed docs/specs/INDEX.md.' });
        }
      }
    }
  }

  const ms = Date.now() - started;
  if (problems.length > 0) {
    console.error(`\n✗ spec-integrity pre-commit FAILED — ${problems.length} problem(s) (${ms}ms):\n`);
    for (const p of problems) {
      console.error(`  • ${p.file}: ${p.msg}`);
      console.error(`      → ${p.fix}`);
    }
    console.error(`\nThis hook only checks spec-artifact well-formedness (Tier-A-lite). Fix the above and re-stage.`);
    console.error(`To bypass consciously (NOT recommended): git commit --no-verify.\n`);
    process.exit(1);
  }

  console.log(`✓ spec-integrity OK — ${tsFiles.length} .ts, ${features.size} feature(s) checked (${ms}ms)`);
  process.exit(0);
}

main();
