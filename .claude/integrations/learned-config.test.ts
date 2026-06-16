/**
 * learned-config.test.ts — tests for the deterministic "Act" store.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/learned-config.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 *
 * The write/idempotency tests run inside a temp cwd (process.chdir) so they never
 * touch the real docs/specs/.learned-config.json.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULTS,
  KNOBS,
  clampStrengthen,
  applyLearnedKnob,
  revertLearnedKnob,
  replayProvenance,
  loadConfig,
  type LearnedConfig,
  type ProvenanceEntry,
} from './learned-config';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ─── clampStrengthen — the structural safety net ──────────────────────────────

test('clampStrengthen — discards a relaxing proposal (can only tighten)', () => {
  const before: LearnedConfig = {
    selfEvalThreshold: 95, maxRecoveries: 2, manualCorrectionBudget: 1,
    requireLoadingState: true, requireErrorState: true,
  };
  // Every field below tries to RELAX the gate.
  const relaxing: LearnedConfig = {
    selfEvalThreshold: 80, maxRecoveries: 5, manualCorrectionBudget: 3,
    requireLoadingState: false, requireErrorState: false,
  };
  const r = clampStrengthen(before, relaxing);
  assert(r.selfEvalThreshold === 95, 'threshold must not drop');
  assert(r.maxRecoveries === 2, 'maxRecoveries must not rise');
  assert(r.manualCorrectionBudget === 1, 'budget must not rise');
  assert(r.requireLoadingState === true, 'cannot turn a required state off');
  assert(r.requireErrorState === true, 'cannot turn a required state off');
});

test('clampStrengthen — accepts a strengthening proposal', () => {
  const r = clampStrengthen(DEFAULTS, {
    selfEvalThreshold: 95, maxRecoveries: 2, manualCorrectionBudget: 1,
    requireLoadingState: true, requireErrorState: true,
  });
  assert(r.selfEvalThreshold === 95 && r.maxRecoveries === 2 && r.manualCorrectionBudget === 1, 'stricter values accepted');
  assert(r.requireLoadingState && r.requireErrorState, 'flags turned on');
});

test('clampStrengthen — clamps runaway values to bounds', () => {
  const r = clampStrengthen(DEFAULTS, {
    selfEvalThreshold: 200, maxRecoveries: -5, manualCorrectionBudget: 0,
    requireLoadingState: true, requireErrorState: false,
  });
  assert(r.selfEvalThreshold === 98, 'threshold clamped to 98');
  assert(r.maxRecoveries === 1, 'maxRecoveries floored at 1');
  assert(r.manualCorrectionBudget === 1, 'budget floored at 1');
});

// ─── KNOBS — each strengthens in the correct direction ────────────────────────

test('KNOBS — strengthen in the stricter direction', () => {
  const strengthen = (id: string) => clampStrengthen(DEFAULTS, KNOBS[id](DEFAULTS));
  assert(strengthen('low_reflection_score').selfEvalThreshold === 95, 'reflection threshold 90→95');
  assert(strengthen('high_recovery_count').maxRecoveries === 2, 'recoveries 3→2');
  assert(strengthen('manual_correction_spike').manualCorrectionBudget === 1, 'budget 2→1');
  assert(strengthen('user_loading_state').requireLoadingState === true, 'loading state required');
  assert(strengthen('user_error_state').requireErrorState === true, 'error state required');
});

// ─── applyLearnedKnob — allowlist + idempotency + persistence ─────────────────

test('applyLearnedKnob — unknown pattern is a no-op (allowlist)', () => {
  const r = applyLearnedKnob('not_a_known_pattern', 'AME-x', true);
  assert(!r.applied && !r.changed, 'unknown pattern must not change config');
});

test('applyLearnedKnob — writes, then is idempotent per amendment (temp cwd)', () => {
  const origCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learned-config-test-'));
  try {
    process.chdir(tmp);

    const r1 = applyLearnedKnob('user_loading_state', 'AME-1');
    assert(r1.applied && r1.changed, 'first apply changes config');
    assert(loadConfig().requireLoadingState === true, 'config persisted to disk');

    // Same amendment again → must NOT ratchet anything.
    const r2 = applyLearnedKnob('user_loading_state', 'AME-1');
    assert(!r2.applied, 'same amendmentId is idempotent');

    // A different verified amendment can still tighten a different knob.
    const r3 = applyLearnedKnob('low_reflection_score', 'AME-2');
    assert(r3.applied && r3.changed, 'distinct amendment applies');
    assert(loadConfig().selfEvalThreshold === 95, 'threshold tightened and persisted');

    // Repeated low_reflection_score amendments keep tightening but stop at the clamp.
    applyLearnedKnob('low_reflection_score', 'AME-3');
    const r5 = applyLearnedKnob('low_reflection_score', 'AME-4'); // 95→98 then clamp
    assert(loadConfig().selfEvalThreshold === 98, 'threshold clamped at 98');
    const r6 = applyLearnedKnob('low_reflection_score', 'AME-5'); // already at clamp
    assert(r6.applied && !r6.changed, 'at clamp: applied but no change');
    void r5;
  } finally {
    process.chdir(origCwd);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── replayProvenance — reverted entries are skipped ──────────────────────────

test('replayProvenance — skips reverted entries, keeps the rest', () => {
  const entries: ProvenanceEntry[] = [
    { patternId: 'user_loading_state', amendmentId: 'A', at: '', reverted: true }, // retracted
    { patternId: 'low_reflection_score', amendmentId: 'B', at: '' },               // active
  ];
  const cfg = replayProvenance(entries);
  assert(cfg.requireLoadingState === false, 'reverted loading rule must not apply');
  assert(cfg.selfEvalThreshold === 95, 'active reflection knob still applies');
});

// ─── revertLearnedKnob — rollback retracts one knob, leaves others ────────────

test('revertLearnedKnob — retracts its own knob and leaves others intact (temp cwd)', () => {
  const origCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learned-config-revert-'));
  try {
    process.chdir(tmp);
    applyLearnedKnob('user_loading_state', 'AME-1');
    applyLearnedKnob('low_reflection_score', 'AME-2');
    assert(loadConfig().requireLoadingState === true && loadConfig().selfEvalThreshold === 95, 'both applied');

    const r = revertLearnedKnob('AME-1');
    assert(r.reverted && r.changed, 'revert reports a change');
    assert(loadConfig().requireLoadingState === false, 'loading rule retracted');
    assert(loadConfig().selfEvalThreshold === 95, 'the OTHER learned knob is untouched');

    // Idempotent: reverting again finds no active entry.
    const r2 = revertLearnedKnob('AME-1');
    assert(!r2.reverted, 'second revert is a no-op');

    // Unknown amendment → no-op.
    const r3 = revertLearnedKnob('AME-nonexistent');
    assert(!r3.reverted, 'unknown amendment revert is a no-op');
  } finally {
    process.chdir(origCwd);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('revertLearnedKnob — never relaxes below DEFAULTS (re-apply after revert restores)', () => {
  const origCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'learned-config-revert2-'));
  try {
    process.chdir(tmp);
    applyLearnedKnob('high_recovery_count', 'AME-1'); // maxRecoveries 3 → 2
    assert(loadConfig().maxRecoveries === 2, 'tightened');
    revertLearnedKnob('AME-1');
    assert(loadConfig().maxRecoveries === 3, 'restored exactly to DEFAULT, not below');
    // A new verified amendment can tighten again from the restored baseline.
    applyLearnedKnob('high_recovery_count', 'AME-2');
    assert(loadConfig().maxRecoveries === 2, 're-tightens from default after revert');
  } finally {
    process.chdir(origCwd);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
