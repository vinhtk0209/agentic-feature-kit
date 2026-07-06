/**
 * install-hooks.ts — install the TARGET-repo verify-gate pre-commit hook (distribution = Option B).
 *
 * Measurement Layer v1 §7 A1.2. Run this INSIDE a target repo AFTER `npm run sync` has pushed the
 * kit's .claude/integrations/ into it:
 *
 *     npx tsx .claude/integrations/install-hooks.ts
 *
 * Writes <target>/.git/hooks/pre-commit (a shell wrapper that execs pre-commit-target.ts). Uses
 * .git/hooks/ directly — NOT core.hooksPath — so the target needs no extra git config. Refuses to
 * run in the kit source-of-truth repo (the hook is a TARGET artifact); the marker check is inlined
 * here (A1.1's assertNotKitRepo is private to record-verify.ts — duplicated deliberately, per the
 * Step-3 decision, to avoid coupling the installer to that module).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const KIT_PACKAGE_NAME = 'feature-from-confluence-kit';

/**
 * The shell wrapper written to <target>/.git/hooks/pre-commit — the SINGLE SOURCE OF TRUTH for the
 * target hook (there is no separate .githooks/ file; .githooks/ is not synced and would only be a
 * dead copy). Prefers the local tsx bin; falls back to npx.
 */
const WRAPPER = `#!/bin/sh
# Target-repo verify-gate pre-commit hook — Measurement Layer v1 §7 A1.2 (TARGET side).
# Installed by .claude/integrations/install-hooks.ts. Prefer the local tsx bin; fall back to npx
# (targets usually lack a local tsx — npx path ~3s, still within budget).
if [ -x node_modules/.bin/tsx ]; then
  exec node_modules/.bin/tsx .claude/integrations/pre-commit-target.ts
else
  exec npx tsx .claude/integrations/pre-commit-target.ts
fi
`;

function repoRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('✗ install-hooks: not inside a git repository. Run this from the target repo root.');
    process.exit(1);
  }
}

/** Inline A1.1 markers — refuse to install in the kit source-of-truth repo (this hook is TARGET-only). */
function refuseIfKit(root: string): void {
  const reasons: string[] = [];
  const sc = path.join(root, 'sync.config.json');
  if (fs.existsSync(sc)) {
    try { if (Array.isArray((JSON.parse(fs.readFileSync(sc, 'utf8')) as { targets?: unknown }).targets)) reasons.push('sync.config.json (with targets[])'); } catch { /* ignore */ }
  }
  const pkg = path.join(root, 'package.json');
  if (fs.existsSync(pkg)) {
    try { if ((JSON.parse(fs.readFileSync(pkg, 'utf8')) as { name?: unknown }).name === KIT_PACKAGE_NAME) reasons.push(`package.json name === "${KIT_PACKAGE_NAME}"`); } catch { /* ignore */ }
  }
  if (reasons.length > 0) {
    console.error(`✗ install-hooks: REFUSING — this is the KIT source-of-truth repo (${reasons.join(', ')}).`);
    console.error('  The verify-gate hook is a TARGET-repo artifact. Run it inside a synced target repo instead.');
    process.exit(1);
  }
}

function main(): void {
  const root = repoRoot();
  refuseIfKit(root);

  // The hook's entry point must be present — i.e. the kit was synced into this target.
  const entry = path.join(root, '.claude', 'integrations', 'pre-commit-target.ts');
  if (!fs.existsSync(entry)) {
    console.error(`✗ install-hooks: ${path.relative(root, entry)} not found.`);
    console.error('  Sync the kit into this target first: from the kit repo run `npm run sync`.');
    process.exit(1);
  }

  const hooksDir = path.join(root, '.git', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const dest = path.join(hooksDir, 'pre-commit');

  // Don't silently clobber an existing, different pre-commit hook — back it up first.
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== WRAPPER) {
    const bak = `${dest}.pre-kit.${Date.now()}.bak`;
    fs.copyFileSync(dest, bak);
    console.log(`ℹ existing pre-commit backed up → ${path.relative(root, bak)}`);
  }

  fs.writeFileSync(dest, WRAPPER, 'utf8');
  fs.chmodSync(dest, 0o755); // executable bit (correct on POSIX; harmless on Windows)

  // .git/hooks is bypassed if the target has set core.hooksPath — warn rather than fail silently.
  const hp = execFileSync('git', ['config', '--default', '', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim();
  if (hp) {
    console.log(`⚠ core.hooksPath is set to "${hp}" in this repo — .git/hooks may be ignored. Unset it or place the hook there.`);
  }

  console.log('✅ verify-gate pre-commit hook installed.');
  console.log(`   • wrote:  ${path.relative(root, dest)}`);
  console.log('   • runs:   .claude/integrations/pre-commit-target.ts (Tier A lint-feature --gate + Tier B verify-note read)');
  console.log('   • next:   make a feature commit; if it blocks with "no verify record", run the B11 wrapper first.');
  console.log('   • re-run: npx tsx .claude/integrations/install-hooks.ts');
}

main();
