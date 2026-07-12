/**
 * record-verify.test.ts — proves the B11 verify-record wire fires and FAILS CLOSED, and (v3.22, W.3)
 * that content_hash is split into an explicit code-path + spec-name.
 *
 * §5 fail-closed contract (measurement-layer-b11-wire.md):
 *   §5(a) git-note write failure  → the wrapper THROWS (CLI exits ≠ 0) → B11 must STOP, no B12.
 *   §5(b) a real failing tier      → verified === false (record written, verdict false) → rollback.
 *   §5(c) Supabase push failure    → pushVerifyRecord is FAIL-OPEN; the sync guard stays FAIL-CLOSED.
 * W.3 split (measurement-layer-content-hash-split.md):
 *   §1   computeContentHash({ codePath, specName }) covers the nested code tree + flat ux-states.json.
 *   §7.1 missing/empty codePath → throw. §7.2 Tier B ran w/o ux-states → throw.
 *   §7.4 assertLeafFeatureDir — HARD REFUSAL of a module/container dir via a POSITIVE data/ property.
 *   §4   the pre-commit hook validates staged SCOPE against the note (no feature-root guessing).
 * Plus A1.1 target-run enforcement + writer/hook no-drift (same computeContentHash module).
 *
 * NOTHING here touches real Supabase or any real sync path: network only via a mocked global.fetch.
 * Run: npx tsx .claude/integrations/record-verify.test.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  computeVerified,
  computeContentHash,
  assertLeafFeatureDir,
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
function throws(fn: () => void, re: RegExp, label: string): void {
  let msg = '';
  try { fn(); } catch (e) { msg = (e as Error).message; }
  assert(msg !== '', `${label}: expected a throw, got none`);
  assert(re.test(msg), `${label}: message ${JSON.stringify(msg)} did not match ${re}`);
}

const KIT_ROOT = process.cwd();
const git = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** Run a kit .ts script via `npx tsx` from an arbitrary cwd (quoted space-containing path; shell for npx.cmd). */
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
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@target/app' }), 'utf8');
  if (withCommit) { git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init', '--no-verify']); }
  return dir;
}

/** Scaffold a valid LEAF feature dir: <codePath>/data/api.ts + an entry + a co-located test. */
function scaffoldFeature(dir: string, codePath: string): void {
  fs.mkdirSync(path.join(dir, codePath, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, codePath, 'data', 'api.ts'), 'export const getX = async () => ({});\n');
  fs.writeFileSync(path.join(dir, codePath, 'index.tsx'), 'export const A = 1;\n');
  fs.mkdirSync(path.join(dir, codePath, 'utils'), { recursive: true });
  fs.writeFileSync(path.join(dir, codePath, 'utils', 'calc.ts'), 'export const add = (a: number, b: number): number => a + b;\n');
  fs.writeFileSync(path.join(dir, codePath, 'utils', 'calc.test.ts'),
    "import { add } from './calc';\ntest('add', () => { expect(add(2, 3)).toBe(5); });\n");
}
function scaffoldSpec(dir: string, specName: string): void {
  fs.mkdirSync(path.join(dir, 'docs', 'specs', specName), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'specs', specName, 'ux-states.json'), '{"routes":["/x"]}\n');
}
function rm(dir: string): void { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
function inDir<T>(dir: string, fn: () => T): T {
  const prev = process.cwd();
  try { process.chdir(dir); return fn(); } finally { process.chdir(prev); }
}

// A deeply-nested leaf path like the real authoring layout (the whole point of W.3).
const NESTED = 'src/studio-home/tabs-section/class-management/tabs/ProgressReports';

async function main(): Promise<void> {
  // ── computeVerified truth table ──
  await test('computeVerified: 0/0→true, 0/null→true, 1/0→false, 0/1→false', () => {
    assert(computeVerified(0, 0) === true, '0/0');
    assert(computeVerified(0, null) === true, '0/null');
    assert(computeVerified(1, 0) === false, '1/0');
    assert(computeVerified(0, 1) === false, '0/1');
  });

  // ── §5(a) note write failure → recordVerify throws (fail-closed anchor) ──
  await test('§5(a) note write fails (no HEAD) → recordVerify throws → wrapper exits ≠ 0, B11 STOPs', () => {
    const dir = makeTargetRepo(false); // no commit → git notes add HEAD cannot resolve
    scaffoldFeature(dir, 'src/demo'); // valid leaf so assertLeafFeatureDir passes; failure is the note write
    try {
      inDir(dir, () => throws(
        () => recordVerify({ phase: 'verify_complete', codePath: 'src/demo', specName: null, tierA_exit: 0, tierB_exit: null }),
        /git notes add failed/, '§5(a)'));
    } finally { rm(dir); }
  });

  await test('§5(a) CLI: `record` against a no-HEAD repo exits ≠ 0 for the note-write reason (no success, no B12)', () => {
    const dir = makeTargetRepo(false);
    scaffoldFeature(dir, 'src/demo');
    try {
      const r = runTsx('.claude/integrations/record-verify.ts', 'record --feature-path src/demo --tierA 0', dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status !== 0, `CLI must exit non-zero, got ${r.status}`);
      assert(/git notes add failed/.test(out), `CLI must fail for the note-write reason; got:\n${out}`);
      assert(!/verify note written/.test(out), 'no success banner when the note failed');
    } finally { rm(dir); }
  });

  // ── §5(b) real failing tier → verified=false, note still written ──
  await test('§5(b) captureAndRecord: real failing Tier A (exit 1) → verified===false, note written', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, 'src/demo'); scaffoldSpec(dir, 'demo');
    try {
      inDir(dir, () => {
        const note = captureAndRecord({ codePath: 'src/demo', specName: 'demo', tierACmd: 'exit 1', tierBCmd: 'exit 0' });
        assert(note.verified === false, `verified should be false, got ${note.verified}`);
        assert(note.tierA_exit === 1, `tierA_exit should be 1, got ${note.tierA_exit}`);
        assert(note.code_path === 'src/demo' && note.spec_name === 'demo', 'note carries code_path+spec_name');
        const shown = git(dir, ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD']);
        assert(shown.status === 0 && /"verified":\s*false/.test(shown.stdout), 'failing verdict recorded on HEAD');
      });
    } finally { rm(dir); }
  });

  await test('§5(b) Tier A pass + Tier B skipped (null) → verified===true (no spec required)', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, 'src/demo');
    try {
      inDir(dir, () => {
        const note = captureAndRecord({ codePath: 'src/demo', specName: null, tierACmd: 'exit 0' });
        assert(note.verified === true, `verified should be true, got ${note.verified}`);
        assert(note.tierB_exit === null, `tierB_exit should be null, got ${note.tierB_exit}`);
      });
    } finally { rm(dir); }
  });

  await test('§5(b) real failing Tier B (exit 1) → verified===false', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, 'src/demo'); scaffoldSpec(dir, 'demo');
    try {
      inDir(dir, () => {
        const note = captureAndRecord({ codePath: 'src/demo', specName: 'demo', tierACmd: 'exit 0', tierBCmd: 'exit 1' });
        assert(note.verified === false, `verified should be false, got ${note.verified}`);
      });
    } finally { rm(dir); }
  });

  // ── A1.1 target-run enforcement ──
  await test('A1.1 capture from a KIT repo (sync.config.json targets[]) → THROWS, refuses', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-fakekit-'));
    try {
      git(dir, ['init', '-q']); git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 'T']);
      fs.writeFileSync(path.join(dir, 'sync.config.json'), JSON.stringify({ targets: ['x'] }), 'utf8');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init', '--no-verify']);
      inDir(dir, () => throws(
        () => captureAndRecord({ codePath: 'src/demo', specName: null, tierACmd: 'exit 0' }),
        /REFUSING to write a verify note/, 'A1.1 sync.config'));
    } finally { rm(dir); }
  });

  await test('A1.1 also fires on the kit package name marker', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-fakekit2-'));
    try {
      git(dir, ['init', '-q']); git(dir, ['config', 'user.email', 't@t.t']); git(dir, ['config', 'user.name', 'T']);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'feature-from-confluence-kit' }), 'utf8');
      git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'init', '--no-verify']);
      inDir(dir, () => throws(
        () => recordVerify({ phase: 'verify_complete', codePath: 'src/demo', specName: null, tierA_exit: 0, tierB_exit: null }),
        /package\.json name/, 'A1.1 package'));
    } finally { rm(dir); }
  });

  // ── W.3 §1 — content_hash covers the NESTED code tree + flat ux-states.json ──
  await test('§1 computeContentHash: nested codePath + flat specName cover BOTH trees; deterministic + rename-sensitive', () => {
    const dir = makeTargetRepo(false);
    scaffoldFeature(dir, NESTED); scaffoldSpec(dir, 'US-AD-095-ProgressReports');
    try {
      const a = computeContentHash(dir, { codePath: NESTED, specName: 'US-AD-095-ProgressReports' });
      assert(a.coverage.includes(`${NESTED}/data/api.ts`), 'covers nested feature code');
      assert(a.coverage.includes(`${NESTED}/utils/calc.test.ts`), 'covers co-located tests');
      assert(a.coverage.includes('docs/specs/US-AD-095-ProgressReports/ux-states.json'), 'covers flat ux-states.json');
      const b = computeContentHash(dir, { codePath: NESTED, specName: 'US-AD-095-ProgressReports' });
      assert(a.hash === b.hash, 'deterministic');
      fs.renameSync(path.join(dir, NESTED, 'index.tsx'), path.join(dir, NESTED, 'main.tsx'));
      const c = computeContentHash(dir, { codePath: NESTED, specName: 'US-AD-095-ProgressReports' });
      assert(c.hash !== a.hash, 'a rename changes the hash');
    } finally { rm(dir); }
  });

  // ── W.3 §7 attack suite — fail closed, never silently hash a partial tree ──
  await test('§7.1 missing codePath → throws (never hashes spec-only)', () => {
    const dir = makeTargetRepo(false);
    try { throws(() => computeContentHash(dir, { codePath: 'src/nope', specName: null }), /does not exist/, '§7.1'); }
    finally { rm(dir); }
  });

  await test('§7.4 module dir (nested data/, no own data/) → HARD REFUSAL', () => {
    const dir = makeTargetRepo(false);
    fs.mkdirSync(path.join(dir, 'src/mod/featA/data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/mod/featA/data/api.ts'), 'export const x=1;\n');
    try { throws(() => computeContentHash(dir, { codePath: 'src/mod', specName: null }), /module\/container|not a leaf/, '§7.4 module'); }
    finally { rm(dir); }
  });

  await test('§7.4 NOVEL/unknown module dir (name in no denylist) → HARD REFUSAL by the same positive rule', () => {
    const dir = makeTargetRepo(false);
    fs.mkdirSync(path.join(dir, 'src/zzz-brand-new-module/sub/data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/zzz-brand-new-module/sub/data/api.ts'), 'export const x=1;\n');
    try { throws(() => computeContentHash(dir, { codePath: 'src/zzz-brand-new-module', specName: null }), /module\/container|not a leaf/, '§7.4 novel'); }
    finally { rm(dir); }
  });

  await test('§7.4 codePath with own data/ AND a nested data/ → refused (nested sub-features)', () => {
    const dir = makeTargetRepo(false);
    fs.mkdirSync(path.join(dir, 'src/multi/data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/multi/data/api.ts'), 'export const x=1;\n');
    fs.mkdirSync(path.join(dir, 'src/multi/child/data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/multi/child/data/api.ts'), 'export const y=1;\n');
    try { throws(() => computeContentHash(dir, { codePath: 'src/multi', specName: null }), /nested sub-feature|multiple data/, '§7.4 nested'); }
    finally { rm(dir); }
  });

  await test('§7.4 empty/non-feature dir (no data/ at all) → refused', () => {
    const dir = makeTargetRepo(false);
    fs.mkdirSync(path.join(dir, 'src/empty/x'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/empty/x/note.txt'), 'hi\n');
    try { throws(() => computeContentHash(dir, { codePath: 'src/empty', specName: null }), /no data\/ layer|not a leaf/, '§7.4 empty'); }
    finally { rm(dir); }
  });

  await test('§7.4 assertLeafFeatureDir passes for a real leaf feature', () => {
    const dir = makeTargetRepo(false);
    scaffoldFeature(dir, NESTED);
    try { assertLeafFeatureDir(dir, NESTED); /* no throw */ } finally { rm(dir); }
  });

  await test('§7.2 Tier B ran but ux-states.json missing → recordVerify throws', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, 'src/demo'); // NO scaffoldSpec → docs/specs/demo/ux-states.json absent
    try {
      inDir(dir, () => throws(
        () => captureAndRecord({ codePath: 'src/demo', specName: 'demo', tierACmd: 'exit 0', tierBCmd: 'exit 0' }),
        /ux-states\.json is missing/, '§7.2 missing ux-states'));
    } finally { rm(dir); }
  });

  await test('§7.2 Tier B ran but no --spec-name → recordVerify throws', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, 'src/demo');
    try {
      inDir(dir, () => throws(
        () => recordVerify({ phase: 'verify_complete', codePath: 'src/demo', specName: null, tierA_exit: 0, tierB_exit: 0 }),
        /no --spec-name given/, '§7.2 no spec-name'));
    } finally { rm(dir); }
  });

  // ── §5(c) pushVerifyRecord FAIL-OPEN; sync guard FAIL-CLOSED ──
  const fakeNote: VerifyNote = {
    phase: 'verify_complete', feature: 'US-AD-095-ProgressReports', code_path: NESTED,
    spec_name: 'US-AD-095-ProgressReports', tierA_exit: 0, tierB_exit: 0, verified: true,
    content_hash: 'deadbeef', coverage: [], runner_run_id: 'run-test', kit_version: '3.22.0',
    at: new Date().toISOString(),
  };
  await test('§5(c) pushVerifyRecord: fetch throws (network dead) → does NOT throw (fail-open)', async () => {
    const realFetch = global.fetch;
    global.fetch = (() => { throw new Error('ECONNREFUSED (simulated)'); }) as unknown as typeof fetch;
    try { await pushVerifyRecord(fakeNote); } finally { global.fetch = realFetch; }
  });
  await test('§5(c) pushVerifyRecord: HTTP non-ok → does NOT throw, warns (fail-open)', async () => {
    const realFetch = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 503, text: async () => 'down' })) as unknown as typeof fetch;
    try { await pushVerifyRecord(fakeNote); } finally { global.fetch = realFetch; }
  });
  await test('§5(c) countVerifiedRuns: empty verify_records (content-range */0) → 0 → guard refuses', async () => {
    const realFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true, status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-range' ? '*/0' : null) },
      text: async () => '[]',
    })) as unknown as typeof fetch;
    try { const n = await countVerifiedRuns('3.22.0'); assert(n === 0, `empty table → 0, got ${n}`); }
    finally { global.fetch = realFetch; }
  });

  // ── §4 pre-commit hook staged-SCOPE validation (no feature-root guessing) ──
  // Build a real note on HEAD, then run the installed hook against various staged sets.
  function repoWithNote(): { dir: string; note: VerifyNote } {
    const dir = makeTargetRepo(false);
    scaffoldFeature(dir, NESTED); scaffoldSpec(dir, 'US-AD-095-ProgressReports');
    git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'feat', '--no-verify']);
    const note = inDir(dir, () => recordVerify({
      phase: 'verify_complete', codePath: NESTED, specName: 'US-AD-095-ProgressReports', tierA_exit: 0, tierB_exit: 0,
    }));
    return { dir, note };
  }
  const runHook = (dir: string) => runTsx('.claude/integrations/pre-commit-target.ts', '', dir);

  await test('§4 hook: correct-scope staged (a file under the feature) + up-to-date note → PASSES', () => {
    const { dir } = repoWithNote();
    try {
      fs.mkdirSync(path.join(dir, NESTED, 'components'), { recursive: true });
      fs.writeFileSync(path.join(dir, NESTED, 'components', 'X.tsx'), 'export const X=1;\n'); // still under codePath
      git(dir, ['add', `${NESTED}/components/X.tsx`]);
      // Re-verify so the note hash matches the new tree, then stage only in-scope + re-run hook.
      inDir(dir, () => recordVerify({ phase: 'verify_complete', codePath: NESTED, specName: 'US-AD-095-ProgressReports', tierA_exit: 0, tierB_exit: 0 }));
      const r = runHook(dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status === 0, `in-scope + fresh note must pass; got ${r.status}:\n${out}`);
      assert(/verify-gate OK/.test(out), `expected pass banner; got:\n${out}`);
    } finally { rm(dir); }
  });

  await test('§4 hook: EXTRA out-of-feature file staged → BLOCKS (scope violation)', () => {
    const { dir } = repoWithNote();
    try {
      fs.mkdirSync(path.join(dir, 'src/other-feature/data'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src/other-feature/data/api.ts'), 'export const z=1;\n');
      git(dir, ['add', 'src/other-feature/data/api.ts']);
      const r = runHook(dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status === 1, `out-of-scope stage must block; got ${r.status}`);
      assert(/outside the verify note's feature/.test(out), `expected scope-violation msg; got:\n${out}`);
    } finally { rm(dir); }
  });

  await test('§4 hook: feature file CHANGED after verify (staged) → BLOCKS (stale content_hash)', () => {
    const { dir } = repoWithNote();
    try {
      fs.writeFileSync(path.join(dir, NESTED, 'index.tsx'), 'export const A = 999; // changed\n');
      git(dir, ['add', `${NESTED}/index.tsx`]);
      const r = runHook(dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status === 1, `stale tree must block; got ${r.status}`);
      assert(/content_hash mismatch|STALE/.test(out), `expected staleness msg; got:\n${out}`);
    } finally { rm(dir); }
  });

  await test('canary-2 hook: no verify note → BLOCKS with the CONCRETE --feature-path/--spec-name command', () => {
    const dir = makeTargetRepo(true);
    scaffoldFeature(dir, NESTED); scaffoldSpec(dir, 'US-AD-095-ProgressReports');
    try {
      git(dir, ['add', '-A']);
      const r = runHook(dir);
      const out = `${r.stdout || ''}${r.stderr || ''}`;
      assert(r.status === 1, `staged feature + no note must block; got ${r.status}`);
      assert(/record-verify\.ts capture --feature-path/.test(out), `must name --feature-path; got:\n${out}`);
      assert(new RegExp(NESTED.replace(/[/]/g, '\\/')).test(out), 'command hint uses the nested leaf codePath');
      assert(/--spec-name US-AD-095-ProgressReports/.test(out), 'command hint includes --spec-name');
      assert(!/--feature \b/.test(out), 'the removed single --feature flag must not appear');
    } finally { rm(dir); }
  });

  // ── structural + no-drift ──
  await test('structural: B11 wire issues capture with --feature-path + --spec-name + §5 contract', () => {
    const cmd = fs.readFileSync(path.join(KIT_ROOT, '.claude/commands/feature-from-confluence.md'), 'utf8');
    assert(/record-verify\.ts capture/.test(cmd), 'B11 calls record-verify.ts capture');
    assert(/--feature-path/.test(cmd) && /--spec-name/.test(cmd), 'wire passes --feature-path + --spec-name');
    assert(/--tierA-cmd/.test(cmd) && /--tierB-cmd/.test(cmd), 'both tier commands present');
    assert(/b11-runner\.ts[^\n]*--feature-path/.test(cmd), 'Tier B b11-runner gets --feature-path');
    assert(/verified === true/.test(cmd), 'B12 gated on verified === true');
    assert(/Do NOT proceed to B12/.test(cmd), 'STOP on non-zero wrapper exit');
    assert(/sync is still BLOCKED/.test(cmd), 'warn sync stays blocked on push failure');
  });

  await test('no-drift: pre-commit-target.ts imports computeContentHash from record-verify (single source)', () => {
    const hook = fs.readFileSync(path.join(KIT_ROOT, '.claude/integrations/pre-commit-target.ts'), 'utf8');
    assert(/import\s*\{[^}]*computeContentHash[^}]*\}\s*from\s*'\.\/record-verify'/.test(hook),
      'hook imports computeContentHash from ./record-verify (no reimplementation)');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
