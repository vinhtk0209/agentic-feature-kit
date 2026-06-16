/**
 * friction-meter.test.ts — tests for the recovery-attempt counter.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/friction-meter.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { countAttemptsInText, countRecoveryAttempts } from './friction-meter';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const sampleLog = [
  '[2026-06-12T10:00:00Z] [B0] confluence-mcp=unavailable fallback=paste',
  '[2026-06-12T10:01:00Z] [Step: B1] [Attempt 1/3] [strategy: default] [result: fail] [reason: parse error]',
  '[2026-06-12T10:02:00Z] [Step: B1] [Attempt 2/3] [strategy: re-fetch] [result: success] [reason: ok]',
  '[2026-06-12T10:03:00Z] [autonomy] gate=B6 action=auto-pass score=92% mode=auto',
  '[2026-06-12T10:04:00Z] [B11-coverage] ac_covered=8/8 unit=2 e2e=6 errors=0',
  '[2026-06-12T10:05:00Z] [Step: B11] [Attempt 1/3] [strategy: retry] [result: success] [reason: flaky]',
].join('\n');

test('countAttemptsInText — counts only [Attempt N/M] lines, ignores other tags', () => {
  assert(countAttemptsInText(sampleLog) === 3, `expected 3 attempts, got ${countAttemptsInText(sampleLog)}`);
});

test('countAttemptsInText — handles CRLF and spacing variants', () => {
  const t = '[Step: B2] [Attempt 1 / 3] [result: fail]\r\n[autonomy] noise\r\n[Step: B2] [Attempt 2/3] [result: success]';
  assert(countAttemptsInText(t) === 2, `expected 2, got ${countAttemptsInText(t)}`);
});

test('countAttemptsInText — zero when no recovery attempts present', () => {
  assert(countAttemptsInText('[B0] note\n[autonomy] gate=B5') === 0, 'no attempts → 0');
});

test('countRecoveryAttempts — null for a missing file, count for a present one', () => {
  assert(countRecoveryAttempts(path.join(os.tmpdir(), 'no-such-recovery-xyz.log')) === null, 'missing → null');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'friction-meter-test-'));
  try {
    const f = path.join(tmp, 'recovery.log');
    fs.writeFileSync(f, sampleLog, 'utf-8');
    assert(countRecoveryAttempts(f) === 3, 'present file → counted attempts');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
