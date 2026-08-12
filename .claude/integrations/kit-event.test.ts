import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, 'kit-event.ts');
const TSX = path.resolve(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n   ${(error as Error).message}`); }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [TSX, SCRIPT, ...args], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: Object.fromEntries(Object.entries({ ...process.env, KIT_EVENT_NONCE: undefined, ...env }).filter(([, value]) => value !== undefined)) as NodeJS.ProcessEnv,
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
  });
}

test('emits exactly one canonical state sentinel', () => {
  const result = run(['state', 'B5']);
  assert(result.status === 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  assert(result.stdout === '@@KIT_EVENT@@ {"v":1,"type":"state","phase":"B5"}\n', `unexpected stdout: ${result.stdout}`);
});

test('binds the run nonce and designed gate metadata', () => {
  const nonce = 'a'.repeat(64);
  const result = run(['state', 'B6', '--awaiting', 'gate', '--expected', 'true'], { KIT_EVENT_NONCE: nonce });
  assert(result.status === 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  assert(result.stdout === `@@KIT_EVENT@@ {"v":1,"type":"state","phase":"B6","awaiting":"gate","expected":true,"runNonce":"${nonce}"}\n`, `unexpected stdout: ${result.stdout}`);
});

test('emits the exact canonical D-cross-2 phase token', () => {
  const result = run(['state', 'D-cross-2']);
  assert(result.status === 0, `expected exit 0, got ${result.status}: ${result.stderr}`);
  assert(result.stdout === '@@KIT_EVENT@@ {"v":1,"type":"state","phase":"D-cross-2"}\n', `unexpected stdout: ${result.stdout}`);
});

for (const args of [
  [], ['state'], ['state', '<BX>'], ['state', 'B99'], ['state', 'Dcross-2'], ['state', 'B5', '--awaiting', 'maybe'],
  ['state', 'B5', '--awaiting', 'gate', '--awaiting', 'gate'], ['state', 'B5', '--unknown', 'x'],
]) {
  test(`rejects malformed or ambiguous argv: ${JSON.stringify(args)}`, () => {
    const result = run(args);
    assert(result.status === 2, `expected exit 2, got ${result.status}: ${result.stdout} ${result.stderr}`);
    assert(!result.stdout.includes('@@KIT_EVENT@@'), 'invalid invocation must not emit a sentinel');
  });
}

test('workflow uses the emitter command and contains no literal sentinel example', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '..', 'commands', 'feature-from-confluence.md'), 'utf8');
  assert(!workflow.includes('@@KIT_EVENT@@'), 'workflow source must not contain literal marker output');
  assert(workflow.includes('npx tsx .claude/integrations/kit-event.ts state <BX>'), 'normal state emitter instruction is missing');
  assert(workflow.includes('--awaiting gate --expected true'), 'designed gate emitter instruction is missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
