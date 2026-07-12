/**
 * record-verify.test.ts — proves the B11 verify-record wire fires and FAILS CLOSED.
 *
 * Covers the Measurement Layer v1 §5 fail-closed contract wired into feature-from-confluence.md
 * B11 (docs/design/measurement-layer-b11-wire.md, Block 4 canary 1):
 *   §5(a) git-note write failure  → the wrapper THROWS (CLI exits ≠ 0) → B11 must STOP, no B12.
 *   §5(b) a real failing tier      → verified === false (record written, verdict false) → rollback.
 *   §5(c) Supabase push failure    → pushVerifyRecord is FAIL-OPEN (no throw); the sync guard's
 *                                    data source (countVerifiedRuns) stays FAIL-CLOSED (returns 0).
 * Plus:
 *   - A1.1 target-run enforcement  : assertNotKitRepo fires if capture is invoked from the kit.
 *   - shared-code / no-drift       : the note's content_hash uses the SAME computeContentHash the
 *                                    target-side hook imports (asserted structurally + by re-hash).
 *   - structural presence          : the B11 step actually issues `record-verify.ts capture …`.
 *
 * NOTHING here touches real Supabase or any real sync path: network is exercised only via a mocked
 * global.fetch, and the "guard refuses" proof reads a mocked content-range (07-06 incident rule).
 *
 * Run: npx tsx .claude/integrations/record-verify.test.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  computeVerified,
  computeContentHash,
  recordVerify,
  captureAndRecord,
  pushVerifyRecord,
  VERIFY_NOTES_REF,
  VerifyNote,
} from './record-verify';
import { countVerifiedRuns } from '../../scripts/sync-to-targets';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`✅ ${name}`); })
    .catch((e) => { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); });
}
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

const KIT_ROOT = process.cwd();
const git = (cwd: string, args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8' });

/**
 * Run a kit .ts script via `npx tsx` from an arbitrary cwd. Uses a single shell command string with
 * the (space-containing) absolute script path double-quoted — passing it in an args array with
 * shell:true splits on the space in "DEV AZURE" and yields ERR_MODULE_NOT_FOUND. shell:true is
 * needed on win32 so `npx` (npx.cmd) resolves.
 */
function runTsx(scriptRel: string, argStr: string, cwd: string) {
  const abs = path.join(KIT_ROOT, scriptRel);
  return spawnSync(`npx tsx "${abs}" ${argStr}`, { cwd, encoding: 'utf8', shell: true });
}

/** A throwaway git repo that is NOT the kit (no sync.config.json, non-kit package name). */
function makeTargetRepo(withCommit: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-target-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 't@t.t']);
  git(dir, ['config', 'user.name', 'T']);
  // Non-kit identity so assertNotKitRepo does NOT fire.
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@target/app' }), 'utf8');
  if (withCommit) {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'init', '--no-verify']);
  }
  return dir;
}

function rm(dir: string): void { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }

async function main(): Promise<void> {
  // ── computeVerified truth table (the whole invariant in one function) ──
  await test('computeVerified: 0/0→true, 0/null→true, 1/0→false, 0/1→false', () => {
    assert(computeVerified(0, 0) === true, '0/0 should be verified');
    assert(computeVerified(0, null) === true, '0/null (Tier B skipped) should be verified');
    assert(computeVerified(1, 0) === false, 'Tier A fail → not verified');
    assert(computeVerified(0, 1) === false, 'Tier B fail → not verified');
    assert(computeVerified(1, 1) === false, 'both fail → not verified');
  });

  // ── §5(a) — git-note write failure → recordVerify THROWS (wrapper exit ≠ 0 → B11 STOPs) ──
  await test('§5(a) note write fails (no HEAD) → recordVerify throws → wrapper exits ≠ 0, B11 STOPs', () => {
    const dir = makeTargetRepo(false); // NO commit → `git notes add HEAD` cannot resolve HEAD
    const prev = process.cwd();
    try {
      process.chdir(dir);
      let threw = false;
      try {
        recordVerify({ phase: 'verify_complete', feature: 'demo', tierA_exit: 0, tierB_exit: 0 });
      } catch (e) {
        threw = true;
        assert(/git notes add failed/.test((e as Error).message), `expected git-notes failure, got: ${(e as Error).message}`);
      }
      assert(threw, 'recordVerify must throw when the git note cannot be written (fail-closed anchor)');
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  // Prove the CLI surfaces that as a non-zero exit (the exact thing B11 keys "STOP" on).
  await test('§5(a) CLI: `record` against a no-HEAD repo exits ≠ 0 (no success, no B12)', () => {
    const dir = makeTargetRepo(false);
    try {
      const r = runTsx('.claude/integrations/record-verify.ts', 'record --feature demo --tierA 0 --tierB 0', dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status !== 0, `CLI must exit non-zero on note-write failure, got status=${r.status}`);
      assert(/git notes add failed/.test(out), `CLI must fail for the note-write reason, not a spawn error; got:\n${out}`);
      assert(!/verify note written/.test(out), 'CLI must NOT print the success banner when the note failed');
    } finally {
      rm(dir);
    }
  });

  // ── §5(b) — a REAL failing tier → verified === false, note still written → routes to rollback ──
  await test('§5(b) captureAndRecord: real failing Tier A (exit 1) → verified===false, note written', () => {
    const dir = makeTargetRepo(true);
    const prev = process.cwd();
    try {
      process.chdir(dir);
      const note = captureAndRecord({ feature: 'demo', tierACmd: 'exit 1', tierBCmd: 'exit 0' });
      assert(note.verified === false, `Tier A exit 1 must yield verified=false, got ${note.verified}`);
      assert(note.tierA_exit === 1, `tierA_exit should be 1, got ${note.tierA_exit}`);
      // The record was still WRITTEN (a truthful record of a failing verify) — B11 keys "proceed" on
      // verified===true, so this correctly does NOT advance to B12.
      const shown = git(dir, ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD']);
      assert(shown.status === 0 && /"verified":\s*false/.test(shown.stdout), 'the failing verdict must be recorded on HEAD');
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  await test('§5(b) captureAndRecord: Tier A pass + Tier B skipped (null) → verified===true', () => {
    const dir = makeTargetRepo(true);
    const prev = process.cwd();
    try {
      process.chdir(dir);
      const note = captureAndRecord({ feature: 'demo', tierACmd: 'exit 0' /* no tierBCmd → null */ });
      assert(note.verified === true, `Tier A pass + Tier B null must be verified=true, got ${note.verified}`);
      assert(note.tierB_exit === null, `tierB_exit should be null when skipped, got ${note.tierB_exit}`);
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  await test('§5(b) captureAndRecord: real failing Tier B (exit 1) → verified===false', () => {
    const dir = makeTargetRepo(true);
    const prev = process.cwd();
    try {
      process.chdir(dir);
      const note = captureAndRecord({ feature: 'demo', tierACmd: 'exit 0', tierBCmd: 'exit 1' });
      assert(note.verified === false, `Tier B exit 1 must yield verified=false, got ${note.verified}`);
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  // ── A1.1 — target-run enforcement: assertNotKitRepo fires if capture runs in the kit ──
  await test('A1.1 capture invoked from a KIT repo (sync.config.json targets[]) → THROWS, refuses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-fakekit-'));
    const prev = process.cwd();
    try {
      git(dir, ['init', '-q']);
      git(dir, ['config', 'user.email', 't@t.t']);
      git(dir, ['config', 'user.name', 'T']);
      fs.writeFileSync(path.join(dir, 'sync.config.json'), JSON.stringify({ targets: ['x'] }), 'utf8');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init', '--no-verify']);
      process.chdir(dir);
      let threw = false;
      try {
        captureAndRecord({ feature: 'demo', tierACmd: 'exit 0' });
      } catch (e) {
        threw = true;
        assert(/REFUSING to write a verify note/.test((e as Error).message), `expected A1.1 refusal, got: ${(e as Error).message}`);
        assert(/sync\.config\.json/.test((e as Error).message), 'refusal should name the kit marker it detected');
      }
      assert(threw, 'captureAndRecord must refuse to run in the kit source-of-truth repo');
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  await test('A1.1 also fires on the kit package name marker', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-fakekit2-'));
    const prev = process.cwd();
    try {
      git(dir, ['init', '-q']);
      git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 'T']);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'feature-from-confluence-kit' }), 'utf8');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init', '--no-verify']);
      process.chdir(dir);
      let threw = false;
      try { recordVerify({ phase: 'verify_complete', feature: 'demo', tierA_exit: 0, tierB_exit: 0 }); }
      catch (e) { threw = true; assert(/package\.json name/.test((e as Error).message), `expected package-name marker, got: ${(e as Error).message}`); }
      assert(threw, 'must refuse when package.json name === the kit package');
    } finally {
      process.chdir(prev);
      rm(dir);
    }
  });

  // ── content_hash scope + rename sensitivity (the field the target hook re-hashes) ──
  await test('computeContentHash: covers src/<feature> + ux-states.json, deterministic, rename-sensitive', () => {
    const dir = makeTargetRepo(false);
    try {
      fs.mkdirSync(path.join(dir, 'src', 'demo', 'utils'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'demo', 'index.tsx'), 'export const A = 1;\n');
      fs.writeFileSync(path.join(dir, 'src', 'demo', 'utils', 'calc.test.ts'), 'test("x",()=>{});\n');
      fs.mkdirSync(path.join(dir, 'docs', 'specs', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs', 'specs', 'demo', 'ux-states.json'), '{}\n');
      const a = computeContentHash(dir, 'demo');
      assert(a.coverage.includes('src/demo/index.tsx'), 'coverage must include feature code');
      assert(a.coverage.includes('src/demo/utils/calc.test.ts'), 'coverage must include co-located tests');
      assert(a.coverage.includes('docs/specs/demo/ux-states.json'), 'coverage must include ux-states.json');
      const b = computeContentHash(dir, 'demo');
      assert(a.hash === b.hash, 'hash must be deterministic across calls on unchanged bytes');
      // Rename one file → hash changes (path bytes are mixed in).
      fs.renameSync(path.join(dir, 'src', 'demo', 'index.tsx'), path.join(dir, 'src', 'demo', 'main.tsx'));
      const c = computeContentHash(dir, 'demo');
      assert(c.hash !== a.hash, 'a rename must change the hash (rename-sensitive)');
    } finally {
      rm(dir);
    }
  });

  // ── §5(c) part 1 — pushVerifyRecord is FAIL-OPEN (never throws, even on network death) ──
  const fakeNote: VerifyNote = {
    phase: 'verify_complete', feature: 'demo', tierA_exit: 0, tierB_exit: 0, verified: true,
    content_hash: 'deadbeef', coverage: [], runner_run_id: 'run-test', kit_version: '3.21.0',
    at: new Date().toISOString(),
  };
  await test('§5(c) pushVerifyRecord: fetch throws (network dead) → does NOT throw (fail-open)', async () => {
    const realFetch = global.fetch;
    global.fetch = (() => { throw new Error('ECONNREFUSED (simulated — no real network)'); }) as unknown as typeof fetch;
    try {
      await pushVerifyRecord(fakeNote); // must resolve, not reject
    } finally {
      global.fetch = realFetch;
    }
  });
  await test('§5(c) pushVerifyRecord: HTTP non-ok → does NOT throw, warns (fail-open)', async () => {
    const realFetch = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 503, text: async () => 'down' })) as unknown as typeof fetch;
    try {
      await pushVerifyRecord(fakeNote);
    } finally {
      global.fetch = realFetch;
    }
  });

  // ── §5(c) part 2 — the sync guard's data source stays FAIL-CLOSED (0 verified → refuse) ──
  await test('§5(c) countVerifiedRuns: empty verify_records (content-range */0) → 0 → guard refuses', async () => {
    const realFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true, status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-range' ? '*/0' : null) },
      text: async () => '[]',
    })) as unknown as typeof fetch;
    try {
      const n = await countVerifiedRuns('3.21.0');
      assert(n === 0, `empty table must yield 0 verified runs, got ${n}`);
      // assertVerifiedForSync (sync-to-targets.ts:624-635) refuses (process.exit(1)) when count===0.
    } finally {
      global.fetch = realFetch;
    }
  });

  // ── structural — the wire is actually present in B11 (no-drift + capture command literal) ──
  await test('structural: B11 issues `record-verify.ts capture` with both tier cmds + §5 contract', () => {
    const cmd = fs.readFileSync(path.join(KIT_ROOT, '.claude/commands/feature-from-confluence.md'), 'utf8');
    assert(/record-verify\.ts capture/.test(cmd), 'B11 must call record-verify.ts capture');
    assert(/--tierA-cmd/.test(cmd) && /--tierB-cmd/.test(cmd), 'the capture call must pass both tier commands');
    assert(/lint-feature\.ts[^\n]*--gate/.test(cmd), 'Tier A cmd must be lint-feature --gate');
    assert(/b11-runner\.ts/.test(cmd), 'Tier B cmd must be b11-runner');
    assert(/verified === true/.test(cmd), 'B11 must gate B12 on verified === true, not "record wrote"');
    assert(/Do NOT proceed to B12/.test(cmd), 'B11 must STOP (no B12) on a non-zero wrapper exit');
    assert(/sync is still BLOCKED/.test(cmd), 'B11 must warn sync stays blocked on a push failure');
  });

  await test('canary-2: pre-commit-target hook FAILS with the CONCRETE record-verify capture command (not "the B11 wrapper")', () => {
    const dir = makeTargetRepo(true);
    try {
      // Stage a feature file so the hook has a feature to check but there is NO verify note on HEAD.
      fs.mkdirSync(path.join(dir, 'src', 'demo'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'demo', 'index.tsx'), 'export const A = 1;\n');
      git(dir, ['add', '-A']);
      const r = runTsx('.claude/integrations/pre-commit-target.ts', '', dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status === 1, `hook must block (exit 1) with a feature staged + no verify note, got ${r.status}`);
      assert(/record-verify\.ts capture --feature demo/.test(out),
        `hook message must name the concrete capture command; got:\n${out}`);
      assert(/b11-runner\.ts demo/.test(out), 'the concrete command must include the Tier B runner');
      assert(!/run the B11 wrapper\b/.test(out), 'the abstract "run the B11 wrapper" phrasing must be gone');
    } finally {
      rm(dir);
    }
  });

  await test('no-drift: pre-commit-target.ts imports computeContentHash from record-verify (single source)', () => {
    const hook = fs.readFileSync(path.join(KIT_ROOT, '.claude/integrations/pre-commit-target.ts'), 'utf8');
    assert(/import\s*\{[^}]*computeContentHash[^}]*\}\s*from\s*'\.\/record-verify'/.test(hook),
      'the target hook must import computeContentHash from ./record-verify (no reimplementation)');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
