/**
 * telemetry.test.ts — tests for the token-verification + usage telemetry CLI.
 *
 * Network is fully mocked via telemetry-mock-runner.ts — Supabase is never contacted.
 * Subprocess exit codes and output are checked against expected behaviour.
 *
 * Run: npx tsx .claude/integrations/telemetry.test.ts
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ── Helpers ───────────────────────────────────────────────────────────────────

// Use absolute paths so the scripts are found regardless of CWD.
const TELEMETRY = path.resolve(__dirname, 'telemetry.ts');
const MOCK_RUNNER = path.resolve(__dirname, 'telemetry-mock-runner.ts');

type Env = Record<string, string | undefined>;

function buildEnv(overrides: Env): Record<string, string> {
  const merged: Env = { ...process.env, ...overrides };
  return Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
}

/**
 * Spawn telemetry.ts directly (no network mock — only for tests that exit before any fetch).
 *
 * Redirects the config-dir env vars to a fresh empty temp dir so getToken()'s on-disk fallback
 * (telemetry.ts:105-112) reads ENOENT → returns null, keeping "direct" runs truly offline even
 * on a machine where `workflow login` has written a real %APPDATA%\workflow\claude\config.json
 * (E-01). Without this, the leaked APPDATA lets getToken() find a real token, verify() skips the
 * missing-token branch (telemetry.ts:140-142) and fires a live Supabase RPC at :146. APPDATA
 * covers the win32 branch; HOME/USERPROFILE cover os.homedir() on posix and the win32 fallback.
 * These sit in the overrides object, which buildEnv spreads AFTER process.env, so they win.
 */
function runDirect(args: string[], env: Env = {}): SpawnSyncReturns<string> {
  const quoted = [TELEMETRY, ...args].map((a) => `"${a}"`).join(' ');
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-tel-'));
  return spawnSync(`npx tsx ${quoted}`, {
    env: buildEnv({
      KIT_TOKEN: undefined,
      APPDATA: emptyHome,
      HOME: emptyHome,
      USERPROFILE: emptyHome,
      ...env,
    }),
    encoding: 'utf8',
    shell: true,
    timeout: 30000,
  });
}

/** Spawn via mock-runner so globalThis.fetch is replaced before telemetry.ts runs. */
function runMocked(args: string[], env: Env = {}): SpawnSyncReturns<string> {
  const quoted = [MOCK_RUNNER, ...args].map((a) => `"${a}"`).join(' ');
  return spawnSync(`npx tsx ${quoted}`, {
    env: buildEnv({ KIT_TOKEN: 'test-token', ...env }),
    encoding: 'utf8',
    shell: true,
    timeout: 30000,
  });
}

/** Run an isolated copy with a broken installed PROMPT_VERSION; no fetch mock is needed because startup must fail first. */
function runBrokenVersionAuthority(promptSource: string): SpawnSyncReturns<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-tel-version-'));
  const integrationDir = path.join(root, '.claude', 'integrations');
  const commandDir = path.join(root, '.claude', 'commands');
  fs.mkdirSync(integrationDir, { recursive: true });
  fs.mkdirSync(commandDir, { recursive: true });
  fs.copyFileSync(TELEMETRY, path.join(integrationDir, 'telemetry.ts'));
  fs.copyFileSync(path.resolve(__dirname, 'kit-version.ts'), path.join(integrationDir, 'kit-version.ts'));
  fs.writeFileSync(path.join(commandDir, 'feature-from-confluence.md'), promptSource, 'utf8');
  try {
    return spawnSync(`npx tsx "${path.join(integrationDir, 'telemetry.ts')}" verify`, {
      // Use the existing local tsx dependency; module location, not cwd, defines the authority root.
      cwd: path.resolve(__dirname, '..', '..'),
      env: buildEnv({ KIT_TOKEN: 'test-token' }),
      encoding: 'utf8',
      shell: true,
      timeout: 30000,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ── Tests: KIT_TOKEN guard ────────────────────────────────────────────────────

test('missing KIT_TOKEN → verify exits 1 (no network call)', () => {
  const r = runDirect(['verify']);
  const out = `${r.stdout}\n${r.stderr}`;
  assert(r.status === 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stderr.includes('KIT_TOKEN'), 'stderr should mention KIT_TOKEN (missing-token branch)');
  // Prove the run stayed offline (zero RPC): if getToken() had found an on-disk token (E-01),
  // verify() would have reached rpc() at telemetry.ts:146 and emitted one of these markers.
  // The first two (rpc fn name / endpoint host) never print on any path — belt-and-suspenders;
  // the last three are the outputs the fetch path actually produces, so they catch a regression.
  for (const marker of [
    'verify_kit_token',               // rpc fn name
    'supabase.co',                    // rpc endpoint host
    'Token valid',                    // telemetry.ts:160 — only after a successful rpc
    'Token verification unavailable', // telemetry.ts:153 — only if rpc was attempted and threw
    '@@KIT_EVENT@@',                  // telemetry.ts:165 — meta marker, only on the valid rpc path
  ]) {
    assert(!out.includes(marker), `offline violated — output contained rpc-path marker "${marker}"`);
  }
});

test('malformed PROMPT_VERSION exits nonzero before telemetry can issue a network request', () => {
  const r = runBrokenVersionAuthority('PROMPT_VERSION: v3.25.1\n');
  const out = `${r.stdout}\n${r.stderr}`;
  assert(r.status !== 0, `broken authority must stop telemetry, got ${r.status}`);
  assert(out.includes('kit-version:'), `failure must identify authority parsing, got: ${out}`);
  assert(!out.includes('Token valid') && !out.includes('@@KIT_EVENT@@'), 'telemetry must not enter its network/write path after version failure');
});

// ── Tests: verify command dispatch ───────────────────────────────────────────

test('verify — valid token → exits 0', () => {
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'valid' });
  assert(r.status === 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stdout.includes('✅'), 'stdout should show valid checkmark');
  assert(r.stdout.includes('"kitVersion":"3.25.0"'), 'the telemetry marker must expose canonical PROMPT_VERSION N.N.0');
});

test('verify binds dashboard-injected runner identity and run nonce into the meta marker', () => {
  const nonce = 'b'.repeat(64);
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'valid', KIT_RUNNER_ID: 'codex', KIT_EVENT_NONCE: nonce });
  assert(r.status === 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stdout.includes(`"runner":"codex","runNonce":"${nonce}"`), `marker did not bind runner/nonce: ${r.stdout}`);
});

test('verify rejects malformed dashboard runner identity before network use', () => {
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'valid', KIT_RUNNER_ID: 'codex;forged' });
  assert(r.status !== 0, `invalid runner must fail closed, got ${r.status}`);
  assert(!r.stdout.includes('Token valid') && !r.stdout.includes('@@KIT_EVENT@@'), 'invalid runner must not enter telemetry or marker path');
});

test('verify — invalid token → exits 1', () => {
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'invalid' });
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
  assert(r.stderr.includes('❌'), 'stderr should contain failure marker');
});

test('verify — quota exceeded → exits 1', () => {
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'quota' });
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
});

test('verify — infra/network failure → exits 0 (fail-open)', () => {
  const r = runMocked(['verify'], { MOCK_FETCH_FAIL: '1' });
  assert(r.status === 0, `expected exit 0 (fail-open), got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stderr.includes('⚠️'), 'stderr should show a warning for infra failures');
});

// ── Tests: feature command dispatch ──────────────────────────────────────────

test('feature <name> → exits 0 (best-effort)', () => {
  const r = runMocked(['feature', 'TestFeature']);
  assert(r.status === 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stdout.includes('📊'), 'stdout should log the feature telemetry event');
});

test('feature missing arg → exits 2', () => {
  const r = runDirect(['feature'], { KIT_TOKEN: 'tok' });
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
});

// ── Tests: error command dispatch ─────────────────────────────────────────────

test('error <type> <phase> <msg> → exits 0 (best-effort)', () => {
  const r = runMocked(['error', 'step_failure', 'B11', 'tests failed']);
  assert(r.status === 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stdout.includes('📊'), 'stdout should log the error telemetry event');
});

test('error too few args → exits 2', () => {
  const r = runDirect(['error', 'type', 'phase'], { KIT_TOKEN: 'tok' });
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
});

// ── Tests: unknown command ────────────────────────────────────────────────────

test('unknown command → exits 2', () => {
  const r = runDirect(['badcmd']);
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
