#!/usr/bin/env node
/**
 * friction-meter.ts — machine-COUNT of friction signals that leave an on-disk artifact.
 *
 * HONESTY NOTE (important — do not overstate this): this counts the model's own
 * contemporaneous, structured log (recovery.log), NOT a hardware/subprocess sensor.
 * It is SEMI-independent: harder to game than the single end-of-run summary number
 * (it is written as recovery happens, in a fixed format), but still model-authored
 * text. Treat it as the "derived" tier — one notch below b11's exit-code verdicts,
 * which are true machine sensors. Most friction dimensions (clarification cycles,
 * manual corrections, re-plans) have NO machine artifact and remain self-reported.
 *
 * Usage:
 *   npx tsx .claude/integrations/friction-meter.ts <featureName>
 */

import * as fs from 'fs';
import * as path from 'path';

// A genuine ★1 SELF-RECOVER attempt is logged (feature-from-confluence.md §★1) as:
//   [ISO] [Step: BX] [Attempt N/3] [strategy: ...] [result: fail/success] [reason: ...]
// The `[Attempt N/M]` token is specific to SELF-RECOVER and absent from the many
// other tagged lines ([autonomy], [B0], [B11-coverage], …), so it is a safe marker.
const ATTEMPT_RE = /\[Attempt\s+\d+\s*\/\s*\d+\]/;

export function countAttemptsInText(text: string): number {
  return text.replace(/\r\n/g, '\n').split('\n').filter((ln) => ATTEMPT_RE.test(ln)).length;
}

/** Count recovery attempts from a feature's recovery.log. Returns null when absent. */
export function countRecoveryAttempts(recoveryLogPath: string): number | null {
  if (!fs.existsSync(recoveryLogPath)) return null;
  try { return countAttemptsInText(fs.readFileSync(recoveryLogPath, 'utf-8')); } catch { return null; }
}

export function recoveryLogPath(featureName: string): string {
  return path.join(process.cwd(), 'docs', 'specs', featureName, 'recovery.log');
}

if (process.argv[1] && /friction-meter\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const featureName = process.argv[2];
  if (!featureName) { console.error('Usage: friction-meter.ts <featureName>'); process.exit(1); }
  const n = countRecoveryAttempts(recoveryLogPath(featureName));
  console.log(JSON.stringify({ featureName, recoveries: n, source: n === null ? 'absent' : 'recovery-log' }));
}
