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

/** Spawn telemetry.ts directly (no network mock — only for tests that exit before any fetch). */
function runDirect(args: string[], env: Env = {}): SpawnSyncReturns<string> {
  const quoted = [TELEMETRY, ...args].map((a) => `"${a}"`).join(' ');
  return spawnSync(`npx tsx ${quoted}`, {
    env: buildEnv({ KIT_TOKEN: undefined, ...env }),
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

// ── Tests: KIT_TOKEN guard ────────────────────────────────────────────────────

test('missing KIT_TOKEN → verify exits 1 (no network call)', () => {
  const r = runDirect(['verify']);
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
  assert(r.stderr.includes('KIT_TOKEN'), 'stderr should mention KIT_TOKEN');
});

// ── Tests: verify command dispatch ───────────────────────────────────────────

test('verify — valid token → exits 0', () => {
  const r = runMocked(['verify'], { MOCK_VERIFY_RESULT: 'valid' });
  assert(r.status === 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  assert(r.stdout.includes('✅'), 'stdout should show valid checkmark');
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
