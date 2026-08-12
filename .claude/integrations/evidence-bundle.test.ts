/**
 * evidence-bundle.test.ts — attack-suite for p1-harness-evidence.
 *
 * Required canaries (ROADMAP-AUTONOMOUS-SDLC.md p1-harness-evidence DoD):
 *   (a) bundle builder collects the emitted artifacts into an addressable bundle.
 *   (b) sha256 manifest: per-file + top-level hash.
 *   (c) tamper attack-test: modify one bundled artifact => manifest mismatch => fail-closed.
 *   (d) resume: interrupted run resumes from last completed B-phase using bundles alone.
 *   (e) per-phase context budgets: declared + enforced (separable DoD part 3).
 *
 * Standalone, no jest. Run:  npx tsx .claude/integrations/evidence-bundle.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  buildBundle, verifyBundle, verifyBackendBoundBundle, resumeFromBundles, PHASE_ORDER,
  CONDITIONAL_EVIDENCE_PHASES,
  UnknownPhaseError, MissingArtifactError, EmptyBundleError, ContextBudgetExceededError,
} from './evidence-bundle';
import { createEvidenceBinding, normalizeCost, verifyEvidenceBinding, type EvidenceBackendBinding } from './multi-provider-backends';
import { sha256 } from './spec-ir';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).stack ?? (e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }
function assertThrows(fn: () => void, ctor: Function, label: string) {
  try { fn(); } catch (e) { assert(e instanceof ctor, `${label}: expected ${ctor.name}, got ${(e as Error)?.constructor?.name}: ${(e as Error).message}`); return; }
  throw new Error(`${label}: expected a throw, got a normal return`);
}
function assertUnsafeArtifact(fn: () => void, label: string) {
  try { fn(); } catch (e) { assert((e as Error).name === 'UnsafeArtifactError', `${label}: expected UnsafeArtifactError, got ${(e as Error)?.constructor?.name}: ${(e as Error).message}`); return; }
  throw new Error(`${label}: expected an unsafe-artifact throw, got a normal return`);
}

function mkTmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-bundle-'));
}
function writeRepoFile(cwd: string, relPath: string, content: string): void {
  const abs = path.join(cwd, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function resolveLoadedTsxCli(): string {
  const local = path.resolve(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (fs.existsSync(local)) return local;
  const loaded = Object.keys(require.cache).find((candidate) => /[\\/]node_modules[\\/]tsx[\\/]dist[\\/]register-[^\\/]+\.cjs$/.test(candidate));
  if (!loaded) throw new Error('test harness: unable to locate the loaded tsx runtime');
  const packageMarker = `${path.sep}node_modules${path.sep}tsx${path.sep}`;
  const packageIndex = loaded.lastIndexOf(packageMarker);
  if (packageIndex < 0) throw new Error('test harness: loaded tsx path is malformed');
  return path.join(loaded.slice(0, packageIndex), 'node_modules', 'tsx', 'dist', 'cli.mjs');
}

function backendBinding(): EvidenceBackendBinding {
  return createEvidenceBinding({
    trusted: {
      identity: { provider: 'codex', modelKey: 'codex', modelId: 'codex-fixture', adapterVersion: 'test-v1' },
      capabilities: ['execute-phase', 'evidence-binding'],
      capabilityHash: 'a'.repeat(64),
    },
    cost: normalizeCost(undefined),
  });
}

function manifestHash(files: Array<{ role: string; path: string; sha256: string; bytes: number }>): string {
  return sha256([...files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.role}|${file.path}|${file.sha256}|${file.bytes}`).join('\n'));
}

// ─── (a) bundle builder collects declared artifacts into an addressable bundle ───────────────

test('(a) build: collects inputs + outputs + transcripts into files[], manifest addressable on disk', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/ux-states.json', '{"states":[]}');
  writeRepoFile(cwd, 'docs/specs/Foo/checklist.md', '# checklist');
  const manifest = buildBundle({
    featureName: 'Foo', phase: 'B5', cwd,
    inputs: ['docs/specs/Foo/ux-states.json'],
    outputs: ['docs/specs/Foo/checklist.md'],
    transcripts: { probe: 'npm run types 2>&1 -> 0 errors' },
  });
  assert(manifest.files.length === 3, `expected 3 file entries, got ${manifest.files.length}`);
  assert(manifest.files.some((f) => f.role === 'input' && f.path.endsWith('ux-states.json')), 'input entry present');
  assert(manifest.files.some((f) => f.role === 'output' && f.path.endsWith('checklist.md')), 'output entry present');
  const transcriptEntry = manifest.files.find((f) => f.role === 'transcript');
  assert(!!transcriptEntry, 'transcript entry present');
  const manifestOnDisk = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B5', 'manifest.json');
  assert(fs.existsSync(manifestOnDisk), `manifest not written to expected addressable path: ${manifestOnDisk}`);
  assert(fs.existsSync(path.resolve(cwd, transcriptEntry!.path)), 'transcript content actually persisted into the bundle');
});

test('(a) build: fail-closed on a declared-but-missing artifact (never a silent partial bundle)', () => {
  const cwd = mkTmpRepo();
  assertThrows(() => buildBundle({ featureName: 'Foo', phase: 'B5', cwd, outputs: ['docs/specs/Foo/does-not-exist.md'] }), MissingArtifactError, 'missing artifact');
  assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence')), 'no partial bundle dir left behind after a missing-artifact failure');
});

test('(a-security) build rejects secret-bearing env and runner credential paths before manifest writes', () => {
  for (const relPath of ['.env.playwright', '.claude/mcp-server/.env', 'kit-dashboard/runner.secrets.json']) {
    const cwd = mkTmpRepo();
    writeRepoFile(cwd, relPath, 'SECRET_VALUE=must-not-be-hashed');
    assertUnsafeArtifact(() => buildBundle({ featureName: 'Foo', phase: 'B0.5', cwd, inputs: [relPath] }), relPath);
    assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence')), `unsafe ${relPath} must not leave a partial evidence directory`);
  }
});

test('(a-security) build rejects a repo-escape path before reading or writing evidence', () => {
  const parent = mkTmpRepo();
  const cwd = path.join(parent, 'repo');
  fs.mkdirSync(cwd);
  writeRepoFile(parent, 'outside.txt', 'outside secret material');
  assertUnsafeArtifact(() => buildBundle({ featureName: 'Foo', phase: 'B0', cwd, inputs: ['../outside.txt'] }), 'repo escape');
  assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence')), 'repo escape must not leave a partial evidence directory');
});

test('(a-security) documentation env examples remain eligible evidence', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, '.env.example', 'SAFE_PLACEHOLDER=');
  writeRepoFile(cwd, '.claude/mcp-server/.env.test.example', 'SAFE_PLACEHOLDER=');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0.5', cwd, inputs: ['.env.example', '.claude/mcp-server/.env.test.example'] });
  assert(manifest.files.length === 2, `expected two safe example inputs, got ${manifest.files.length}`);
});

test('(a-security) verifier rejects a self-consistent forged manifest that references a secret path', () => {
  const cwd = mkTmpRepo();
  const content = 'PLAYWRIGHT_ACCESS_TOKEN=must-not-be-verified';
  writeRepoFile(cwd, '.env.playwright', content);
  const files = [{ role: 'input', path: '.env.playwright', sha256: sha256(content), bytes: Buffer.byteLength(content) }];
  const forged = { schemaVersion: 1, feature: 'Foo', phase: 'B0.5', builtAt: new Date().toISOString(), files, manifestHash: manifestHash(files), estimatedTokens: 1, budgetTokens: 1500 };
  writeRepoFile(cwd, 'docs/specs/Foo/.evidence/B0.5/manifest.json', `${JSON.stringify(forged, null, 2)}\n`);
  const result = verifyBundle('Foo', 'B0.5', cwd);
  assert(result.valid === false, 'secret-referencing forged manifest must fail verification');
  assert(result.fileMismatches.some((m) => (m as { reason: string }).reason === 'unsafe-path'), `expected unsafe-path mismatch: ${JSON.stringify(result.fileMismatches)}`);
});

test('(a-security) CLI rejects a secret transcript-file source before copying its content', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, '.env.playwright', 'PLAYWRIGHT_ACCESS_TOKEN=must-not-be-copied');
  const cli = path.resolve(__dirname, 'evidence-bundle.ts');
  const tsxCli = resolveLoadedTsxCli();
  const result = spawnSync(process.execPath, [tsxCli, cli, 'build', 'Foo', 'B0.5', '--transcript-file', 'preflight=.env.playwright'], { cwd, encoding: 'utf8' });
  assert(result.status !== 0, `secret transcript-file must fail closed, got ${result.status}`);
  assert(result.stderr.includes('UnsafeArtifactError'), `CLI must expose the named bounded failure: ${result.stderr}`);
  assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence')), 'secret transcript-file must not leave a copied transcript or manifest');
});

test('(a-security) flagship workflow forbids secret-bearing evidence references at B0.5', () => {
  const prompt = fs.readFileSync(path.resolve(__dirname, '..', 'commands', 'feature-from-confluence.md'), 'utf8');
  assert(prompt.includes('Never bundle secret-bearing configuration.'), 'global evidence protocol must forbid secret configuration');
  assert(prompt.includes('Do not reference `.env.playwright` or any other environment/credential file.'), 'B0.5 must explicitly use non-sensitive status evidence');
});

test('(a) build: rejects an unknown phase id (typo-safety over PHASE_ORDER)', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/x.md', 'x');
  assertThrows(() => buildBundle({ featureName: 'Foo', phase: 'B999', cwd, outputs: ['docs/specs/Foo/x.md'] }), UnknownPhaseError, 'unknown phase');
});

test('(a) build: refuses an empty bundle (zero inputs/outputs/transcripts)', () => {
  const cwd = mkTmpRepo();
  assertThrows(() => buildBundle({ featureName: 'Foo', phase: 'B4', cwd }), EmptyBundleError, 'empty bundle');
});

test('PHASE_ORDER covers all 23 B-phases from the flagship command (B0..B12.8)', () => {
  assert(PHASE_ORDER.length === 23, `expected 23 phases, got ${PHASE_ORDER.length}: ${PHASE_ORDER.join(',')}`);
  assert(PHASE_ORDER[0] === 'B0' && PHASE_ORDER[PHASE_ORDER.length - 1] === 'B12.8', 'order runs B0 -> B12.8');
});

test('D-cross-2 has a fail-closed evidence contract without becoming an unconditional resume phase', () => {
  assert(CONDITIONAL_EVIDENCE_PHASES.length === 1 && CONDITIONAL_EVIDENCE_PHASES[0] === 'D-cross-2', 'conditional evidence registry must contain exact D-cross-2');
  assert(!(PHASE_ORDER as readonly string[]).includes('D-cross-2'), 'conditional D-cross-2 must not block ineligible CREATE resumes');

  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/components/Foo/RECONCILE.json', '{"verdict":"clean"}\n');
  const built = buildBundle({
    featureName: 'Foo',
    phase: 'D-cross-2',
    cwd,
    outputs: ['docs/components/Foo/RECONCILE.json'],
    transcripts: { parser: 'parser=exact-existing-contract-parser\nverdict=clean\n' },
  });
  assert(built.phase === 'D-cross-2');
  assert(verifyBundle('Foo', 'D-cross-2', cwd).valid, 'executed D-cross-2 must produce a verifiable manifest');
  assert(resumeFromBundles('Foo', cwd).resumeFromPhase === 'B0', 'conditional evidence must not reorder the 23 B-phase resume chain');

  const prompt = fs.readFileSync(path.resolve(__dirname, '..', 'commands', 'feature-from-confluence.md'), 'utf8');
  assert(prompt.includes('MUST be **two separate tool invocations**'), 'STOP-gate emitters must never be compounded into duplicate sentinel output');
  assert(prompt.includes('evidence-bundle.ts build "<FeatureName>" "D-cross-2"'), 'executed D-cross-2 must build a durable manifest');
  assert(prompt.includes('evidence-bundle.ts verify "<FeatureName>" "D-cross-2"'), 'executed D-cross-2 must verify before branching');
});

// ─── (b) sha256 manifest: per-file + top-level hash ──────────────────────────────────────────

test('(b) manifest: every file entry carries a real sha256, and the top-level manifestHash is a deterministic function of them', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'alpha content');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'] });
  for (const f of manifest.files) assert(/^[0-9a-f]{64}$/.test(f.sha256), `entry sha256 must be 64 hex chars, got "${f.sha256}" for ${f.path}`);
  assert(/^[0-9a-f]{64}$/.test(manifest.manifestHash), `manifestHash must be 64 hex chars, got "${manifest.manifestHash}"`);

  // Rebuilding from the SAME inputs must reproduce the SAME manifestHash (deterministic, not a
  // random/time-based value) — builtAt differs but manifestHash must not.
  const cwd2 = mkTmpRepo();
  writeRepoFile(cwd2, 'docs/specs/Foo/a.md', 'alpha content');
  const manifest2 = buildBundle({ featureName: 'Foo', phase: 'B0', cwd: cwd2, outputs: ['docs/specs/Foo/a.md'] });
  assert(manifest.manifestHash === manifest2.manifestHash, 'same content -> same manifestHash across independent builds');
  assert(manifest.files[0].sha256 === manifest2.files[0].sha256, 'same file content -> same per-file sha256');
});

test('(b) manifest: verifyBundle reports valid:true and manifestSelfConsistent:true on a freshly built, untouched bundle', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'alpha content');
  buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'] });
  const v = verifyBundle('Foo', 'B0', cwd);
  assert(v.exists && v.valid && v.manifestSelfConsistent, `expected clean valid bundle, got ${JSON.stringify(v)}`);
  assert(v.fileMismatches.length === 0, 'no mismatches on a clean bundle');
});

// ─── (c) tamper attack-test: modified artifact => manifest mismatch => fail-closed ───────────

test('(c) tamper: editing a BUNDLED OUTPUT FILE after build() is caught by verifyBundle -> invalid, fail-closed', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/checklist.md', '# original checklist');
  buildBundle({ featureName: 'Foo', phase: 'B11', cwd, outputs: ['docs/specs/Foo/checklist.md'] });

  // Tamper: mutate the live artifact the bundle referenced, WITHOUT rebuilding the bundle.
  writeRepoFile(cwd, 'docs/specs/Foo/checklist.md', '# TAMPERED — attacker forged a pass');

  const v = verifyBundle('Foo', 'B11', cwd);
  assert(v.valid === false, 'tampered artifact must fail verification (fail-closed)');
  assert(v.manifestSelfConsistent === true, 'manifest.json itself was untouched — only the referenced file drifted');
  assert(v.fileMismatches.some((m) => m.reason === 'hash-mismatch' && m.path.endsWith('checklist.md')), `expected a hash-mismatch on checklist.md: ${JSON.stringify(v.fileMismatches)}`);
});

test('(c) tamper: hand-editing manifest.json itself (forging a hash) is caught via manifestSelfConsistent -> invalid, fail-closed', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/checklist.md', '# original checklist');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B11', cwd, outputs: ['docs/specs/Foo/checklist.md'] });

  // Attacker forges the recorded hash in manifest.json to match a different (tampered) file,
  // WITHOUT recomputing manifestHash — the self-consistency check must still catch it.
  const mPath = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B11', 'manifest.json');
  const forged = { ...manifest, files: manifest.files.map((f) => ({ ...f, sha256: 'deadbeef'.repeat(8) })) };
  fs.writeFileSync(mPath, JSON.stringify(forged, null, 2), 'utf8');

  const v = verifyBundle('Foo', 'B11', cwd);
  assert(v.valid === false, 'a manifest.json whose file-list no longer matches its own manifestHash must fail-closed');
  assert(v.manifestSelfConsistent === false, 'self-consistency check must detect the forged file list');
});

test('(c) tamper: a missing (deleted) bundled artifact is reported as a mismatch, not silently valid', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/checklist.md', '# original checklist');
  buildBundle({ featureName: 'Foo', phase: 'B11', cwd, outputs: ['docs/specs/Foo/checklist.md'] });
  fs.unlinkSync(path.join(cwd, 'docs', 'specs', 'Foo', 'checklist.md'));

  const v = verifyBundle('Foo', 'B11', cwd);
  assert(v.valid === false, 'deleted artifact must fail verification');
  assert(v.fileMismatches.some((m) => m.reason === 'missing'), `expected a "missing" mismatch: ${JSON.stringify(v.fileMismatches)}`);
});

// ─── (d) resume: from any completed B-phase, using bundles alone ────────────────────────────

test('(d) resume: no bundles at all -> resume from PHASE_ORDER[0], zero completed', () => {
  const cwd = mkTmpRepo();
  const r = resumeFromBundles('Foo', cwd);
  assert(r.completedPhases.length === 0, 'nothing completed yet');
  assert(r.lastCompletedPhase === null, 'no last-completed phase');
  assert(r.resumeFromPhase === PHASE_ORDER[0], `expected resume at ${PHASE_ORDER[0]}, got ${r.resumeFromPhase}`);
  assert(r.blockedAt?.reason === 'missing', 'first phase never ran -> "missing", not "invalid"');
});

test('(d) resume: an INTERRUPTED run (B0, B0.5, B1 bundled; B2 never ran) resumes exactly at B2, using bundles alone', () => {
  const cwd = mkTmpRepo();
  for (const phase of ['B0', 'B0.5', 'B1'] as const) {
    writeRepoFile(cwd, `docs/specs/Foo/${phase}.txt`, `output of ${phase}`);
    buildBundle({ featureName: 'Foo', phase, cwd, outputs: [`docs/specs/Foo/${phase}.txt`] });
  }
  const r = resumeFromBundles('Foo', cwd);
  assert(JSON.stringify(r.completedPhases) === JSON.stringify(['B0', 'B0.5', 'B1']), `expected B0,B0.5,B1 completed, got ${JSON.stringify(r.completedPhases)}`);
  assert(r.lastCompletedPhase === 'B1', `expected lastCompletedPhase=B1, got ${r.lastCompletedPhase}`);
  assert(r.resumeFromPhase === 'B2', `expected resumeFromPhase=B2, got ${r.resumeFromPhase}`);
});

test('(d) resume: re-running resumeFromBundles on the SAME on-disk bundles is idempotent (no duplication, same answer twice)', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/B0.txt', 'out');
  buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/B0.txt'] });
  const r1 = resumeFromBundles('Foo', cwd);
  const r2 = resumeFromBundles('Foo', cwd);
  assert(JSON.stringify(r1) === JSON.stringify(r2), 'resume must be a pure read — identical bundles on disk -> identical resume state, every call');
});

test('(d) resume: a TAMPERED completed phase blocks resume there (fail-closed), even though later phases look fine on their own', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/B0.txt', 'out0');
  buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/B0.txt'] });
  writeRepoFile(cwd, 'docs/specs/Foo/B1.txt', 'out1');
  buildBundle({ featureName: 'Foo', phase: 'B1', cwd, outputs: ['docs/specs/Foo/B1.txt'] });

  // Tamper with B0's artifact after the fact.
  writeRepoFile(cwd, 'docs/specs/Foo/B0.txt', 'TAMPERED');

  const r = resumeFromBundles('Foo', cwd);
  assert(r.resumeFromPhase === 'B0', `a tampered B0 must block resume AT B0, not skip to B1/B2 (got ${r.resumeFromPhase})`);
  assert(r.blockedAt?.reason === 'invalid', 'must be reported as "invalid" (tamper), not "missing"');
  assert(r.completedPhases.length === 0, 'nothing counts as trustworthy-completed once the very first phase is tampered');
});

test('(d) resume: every phase bundled and valid -> resumeFromPhase = DONE', () => {
  const cwd = mkTmpRepo();
  for (const phase of PHASE_ORDER) {
    writeRepoFile(cwd, `docs/specs/Foo/${phase}.txt`, `output of ${phase}`);
    buildBundle({ featureName: 'Foo', phase, cwd, outputs: [`docs/specs/Foo/${phase}.txt`] });
  }
  const r = resumeFromBundles('Foo', cwd);
  assert(r.resumeFromPhase === 'DONE', `expected DONE, got ${r.resumeFromPhase}`);
  assert(r.completedPhases.length === PHASE_ORDER.length, `expected all ${PHASE_ORDER.length} phases completed, got ${r.completedPhases.length}`);
});

// ─── (e) per-phase context budgets: declared + enforced ─────────────────────────────────────

test('(e) budget: a declared default budget exists for every phase in PHASE_ORDER', () => {
  // Import lazily via require to check the exported const without a second import binding —
  // simpler: re-derive from a build that intentionally uses the DEFAULT (no override).
  const cwd = mkTmpRepo();
  for (const phase of PHASE_ORDER) {
    writeRepoFile(cwd, `docs/specs/Foo/${phase}-small.txt`, 'tiny');
    const manifest = buildBundle({ featureName: 'Foo', phase, cwd, outputs: [`docs/specs/Foo/${phase}-small.txt`] });
    assert(typeof manifest.budgetTokens === 'number' && manifest.budgetTokens > 0, `phase ${phase} must have a positive declared budget, got ${manifest.budgetTokens}`);
  }
});

test('(e) budget: a bundle whose content exceeds its declared budget is REFUSED (fail-closed), not silently written', () => {
  const cwd = mkTmpRepo();
  const bigContent = 'x'.repeat(20_000); // ~5000 tokens at chars/4, well over a 1000-token budget
  writeRepoFile(cwd, 'docs/specs/Foo/huge.md', bigContent);
  assertThrows(
    () => buildBundle({ featureName: 'Foo', phase: 'B4', cwd, outputs: ['docs/specs/Foo/huge.md'], budgetTokens: 1000 }),
    ContextBudgetExceededError,
    'over-budget bundle',
  );
  assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B4', 'manifest.json')), 'no manifest written when the budget gate refuses the bundle');
});

test('(e) budget: allowOverBudget:true is a conscious, explicit escape hatch that still writes the true estimatedTokens', () => {
  const cwd = mkTmpRepo();
  const bigContent = 'x'.repeat(20_000);
  writeRepoFile(cwd, 'docs/specs/Foo/huge.md', bigContent);
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B4', cwd, outputs: ['docs/specs/Foo/huge.md'], budgetTokens: 1000, allowOverBudget: true });
  assert(manifest.estimatedTokens > manifest.budgetTokens, 'the override must not lie about being over budget');
});

test('(e) budget: a small bundle within its declared budget builds normally (the gate does not false-positive)', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/small.md', 'tiny content');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B4', cwd, outputs: ['docs/specs/Foo/small.md'] });
  assert(manifest.estimatedTokens <= manifest.budgetTokens, 'a small bundle must not be flagged over budget');
});

// ─── I2-B: optional v1-compatible backend-binding sidecar ───────────────────────────────────

test('(I2-B) legacy v1 bundle keeps its file-list semantics while strict backend verification refuses an absent claim', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'legacy output');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'] });
  assert(manifest.schemaVersion === 1, 'legacy manifest schema must remain v1');
  assert(manifest.files.length === 1 && manifest.files[0].role === 'output', 'legacy file-list must contain only the declared output');
  assert(verifyBundle('Foo', 'B0', cwd).valid, 'legacy verifyBundle semantics must remain valid');
  const strict = verifyBackendBoundBundle('Foo', 'B0', cwd);
  assert(!strict.valid && strict.reason === 'binding-missing', 'strict verifier must not infer a backend claim from a legacy bundle');
});

test('(I2-B) bound v1 bundle hashes exactly one valid backend-binding sidecar', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'bound output');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'], backendBinding: backendBinding() });
  const entry = manifest.files.find((file) => file.role === 'backend-binding');
  assert(manifest.schemaVersion === 1 && manifest.files.length === 2, 'sidecar must be additive to schema v1');
  assert(!!entry && entry.path.endsWith('/backend-binding.json'), 'manifest must hash the generated sidecar');
  assert(verifyBundle('Foo', 'B0', cwd).valid, 'generic verifier must hash-check a bound sidecar');
  assert(verifyBackendBoundBundle('Foo', 'B0', cwd).valid, 'strict verifier must accept the valid bound bundle');
});

test('(I2-B) sidecar tamper or removal fails generic hash verification and strict binding verification', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'bound output');
  buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'], backendBinding: backendBinding() });
  const sidecar = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B0', 'backend-binding.json');
  const tampered = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as EvidenceBackendBinding;
  tampered.identity.provider = 'claude';
  assert(!verifyEvidenceBinding(tampered), 'identity mutation must invalidate the binding itself');
  fs.writeFileSync(sidecar, JSON.stringify(tampered, null, 2), 'utf8');
  assert(!verifyBundle('Foo', 'B0', cwd).valid, 'tampered sidecar must fail generic file hashing');
  assert(!verifyBackendBoundBundle('Foo', 'B0', cwd).valid, 'tampered sidecar must fail strict verification');
  fs.unlinkSync(sidecar);
  assert(!verifyBundle('Foo', 'B0', cwd).valid, 'removed sidecar must fail generic verification');
  assert(!verifyBackendBoundBundle('Foo', 'B0', cwd).valid, 'removed sidecar must fail strict verification');
});

test('(I2-B) duplicate binding sentinel is rejected even if an attacker recomputes the v1 manifest hash', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'bound output');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'], backendBinding: backendBinding() });
  const sidecar = manifest.files.find((file) => file.role === 'backend-binding')!;
  const forgedFiles = [...manifest.files, { ...sidecar }];
  const forged = { ...manifest, files: forgedFiles, manifestHash: manifestHash(forgedFiles) };
  const manifestPath = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B0', 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(forged, null, 2), 'utf8');
  assert(verifyBundle('Foo', 'B0', cwd).valid, 'generic v1 verifier permits duplicate hashed paths by legacy design');
  const strict = verifyBackendBoundBundle('Foo', 'B0', cwd);
  assert(!strict.valid && strict.reason === 'binding-duplicate', 'strict verifier must reject ambiguous backend-binding sentinels');
});

test('(I2-B) malformed binding sentinel is rejected even if an attacker recomputes the v1 file and manifest hashes', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'bound output');
  const manifest = buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'], backendBinding: backendBinding() });
  const sidecarPath = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B0', 'backend-binding.json');
  const malformed = Buffer.from('{"identity":', 'utf8');
  fs.writeFileSync(sidecarPath, malformed);
  const forgedFiles = manifest.files.map((file) => file.role === 'backend-binding'
    ? { ...file, sha256: sha256(malformed), bytes: malformed.length }
    : file);
  const forged = { ...manifest, files: forgedFiles, manifestHash: manifestHash(forgedFiles) };
  const manifestPath = path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B0', 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(forged, null, 2), 'utf8');
  assert(verifyBundle('Foo', 'B0', cwd).valid, 'generic v1 verifier must accept the attacker-rehashed malformed sidecar');
  const strict = verifyBackendBoundBundle('Foo', 'B0', cwd);
  assert(!strict.valid && strict.reason === 'binding-invalid', 'strict verifier must reject malformed backend-binding JSON');
});

test('(I2-B) invalid binding is refused before the builder creates any partial evidence files', () => {
  const cwd = mkTmpRepo();
  writeRepoFile(cwd, 'docs/specs/Foo/a.md', 'bound output');
  const invalid = { ...backendBinding(), bindingHash: 'not-a-valid-hash' };
  assertThrows(
    () => buildBundle({ featureName: 'Foo', phase: 'B0', cwd, outputs: ['docs/specs/Foo/a.md'], backendBinding: invalid }),
    Error,
    'invalid backend binding',
  );
  assert(!fs.existsSync(path.join(cwd, 'docs', 'specs', 'Foo', '.evidence', 'B0')), 'invalid binding must leave zero partial bundle writes');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
