/**
 * playwright-runner.test.ts — tests for the pure (non-browser) exports.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/playwright-runner.test.ts
 *
 * Strategy: only the pure exported functions (analyzeCascade) are tested here,
 * since the browser-driven path requires a real Playwright instance.
 */

import { analyzeCascade, CascadeAnalysis } from './playwright-runner';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ── analyzeCascade ────────────────────────────────────────────────────

test('analyzeCascade — all pass → no cascade', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: true, evidence: 'ok' },
    { name: 'state03', passed: true, evidence: 'ok' },
  ]);
  assert(r.rootFailure === null, 'no root failure when all pass');
  assert(r.cascadeBlockedCount === 0, 'no cascade-blocked states');
});

test('analyzeCascade — empty list → no cascade', () => {
  const r = analyzeCascade([]);
  assert(r.rootFailure === null, 'no root failure on empty list');
  assert(r.cascadeBlockedCount === 0, 'no cascade-blocked states');
});

test('analyzeCascade — failure in first state cascades to all others', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: false, evidence: 'element not found' },
    { name: 'state02', passed: true, evidence: 'would pass' },
    { name: 'state03', passed: true, evidence: 'would pass' },
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state01', `root failure must be state01, got ${r.rootFailure?.stateName}`);
  assert(r.rootFailure?.evidence === 'element not found', 'root failure evidence preserved');
  assert(r.cascadeBlockedCount === 3, `expected 3 cascade-blocked, got ${r.cascadeBlockedCount}`);
});

test('analyzeCascade — failure in middle cascades to subsequent states only', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: false, evidence: 'click failed' },
    { name: 'state03', passed: true, evidence: 'would pass' },
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state02', `root failure must be state02, got ${r.rootFailure?.stateName}`);
  assert(r.cascadeBlockedCount === 2, `expected 2 cascade-blocked, got ${r.cascadeBlockedCount}`);
});

test('analyzeCascade — failure in last state → 0 cascade-blocked', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: true, evidence: 'ok' },
    { name: 'state03', passed: false, evidence: 'timeout' },
  ]);
  assert(r.rootFailure?.stateName === 'state03', 'root failure is the last state');
  assert(r.cascadeBlockedCount === 0, 'no states after last one to cascade-block');
});

test('analyzeCascade — only the FIRST failure is the root cause (subsequent failures are cascade)', () => {
  const r = analyzeCascade([
    { name: 'state01', passed: true, evidence: 'ok' },
    { name: 'state02', passed: false, evidence: 'root cause' },
    { name: 'state03', passed: false, evidence: 'downstream failure' }, // cascade-blocked
    { name: 'state04', passed: true, evidence: 'would pass' },
  ]);
  assert(r.rootFailure?.stateName === 'state02', 'first failure is the root');
  assert(r.rootFailure?.evidence === 'root cause', 'root cause evidence is from state02');
  assert(r.cascadeBlockedCount === 2, 'state03 and state04 are both cascade-blocked');
});

// ── report ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
