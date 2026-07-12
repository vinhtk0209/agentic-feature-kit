/**
 * b11-runner.test.ts — attack-tests the TWO-LINK join that Y.1 fixes (the critical false-proof).
 *
 * The 2026-07-12 false-proof (verify_records run-…827b5cdd: verified=true while Playwright failed)
 * lived at the JOIN between values: b11_b was derived correctly ('fail') but was NOT wired into the
 * exit gate. Testing only one link leaves the same gap one layer deeper, so BOTH pure links are
 * proven here (measurement-layer-b11-gate-and-version-bootstrap.md §1):
 *   Link 1  computeB11B(routeResults, tierBRan)  — routeResults → b11_b
 *   Link 2  computeGatesPass(b11_a, cov, b11_b)   — b11_a + coverage + b11_b → gatesPass (→ exit)
 * End to end: a failing route provably propagates route → b11_b='fail' → gatesPass=false → exit(1).
 *
 * A real browser-driven Playwright run is NOT unit-tested here (no browser/dev-server in the
 * deterministic suite — that integration is the Block-5 capture). This proves the LOGIC exhaustively.
 * Run: npx tsx .claude/integrations/b11-runner.test.ts
 */
import { computeB11B, computeGatesPass } from './b11-runner';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function eq<T>(got: T, want: T, msg: string) { if (got !== want) throw new Error(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
const exitOf = (gatesPass: boolean) => (gatesPass ? 0 : 1);

// ── Link 1 — routeResults → b11_b ──
test('Link1 computeB11B: all routes pass → "pass"', () => {
  eq(computeB11B([{ passed: true }, { passed: true }], true), 'pass', 'all-pass');
});
test('Link1 computeB11B: ≥1 route passed:false → "fail"', () => {
  eq(computeB11B([{ passed: true }, { passed: false }], true), 'fail', 'one-fail');
  eq(computeB11B([{ passed: false }], true), 'fail', 'single-fail');
});
test('Link1 computeB11B: Tier B skipped (tierBRan=false) → "skip"', () => {
  eq(computeB11B([], false), 'skip', 'not-ran');
  eq(computeB11B([{ passed: false }], false), 'skip', 'not-ran-ignores-results');
});
test('Link1 computeB11B: ran but no routes → "skip"', () => {
  eq(computeB11B([], true), 'skip', 'ran-empty');
});

// ── Link 2 — computeGatesPass FULL MATRIX (b11_b now gates; the Y.1 fix) ──
test('Link2 computeGatesPass matrix: (pass,0,pass) → exit 0', () => { eq(exitOf(computeGatesPass('pass', 0, 'pass')), 0, 'm1'); });
test('Link2 computeGatesPass matrix: (pass,0,fail) → exit 1  [THE false-proof case]', () => { eq(exitOf(computeGatesPass('pass', 0, 'fail')), 1, 'm2'); });
test('Link2 computeGatesPass matrix: (pass,0,skip) → exit 0  [Tier-B-less stays valid]', () => { eq(exitOf(computeGatesPass('pass', 0, 'skip')), 0, 'm3'); });
test('Link2 computeGatesPass matrix: (fail,0,pass) → exit 1', () => { eq(exitOf(computeGatesPass('fail', 0, 'pass')), 1, 'm4'); });
test('Link2 computeGatesPass matrix: (fail,0,fail) → exit 1', () => { eq(exitOf(computeGatesPass('fail', 0, 'fail')), 1, 'm5'); });
test('Link2 computeGatesPass matrix: (fail,0,skip) → exit 1', () => { eq(exitOf(computeGatesPass('fail', 0, 'skip')), 1, 'm6'); });
test('Link2 computeGatesPass matrix: (pass,1,pass) → exit 1  [coverage still gates]', () => { eq(exitOf(computeGatesPass('pass', 1, 'pass')), 1, 'm7'); });
test('Link2 computeGatesPass matrix: (pass,1,fail) → exit 1', () => { eq(exitOf(computeGatesPass('pass', 1, 'fail')), 1, 'm8'); });
test('Link2 computeGatesPass matrix: (pass,3,skip) → exit 1  [coverage>0 gates even with skip]', () => { eq(exitOf(computeGatesPass('pass', 3, 'skip')), 1, 'm9'); });

// ── End-to-end join: a failing ROUTE propagates all the way to exit 1 ──
test('JOIN: failing route → b11_b=fail → gatesPass=false → exit 1 (the false-proof, now closed)', () => {
  const routeResults = [{ passed: true }, { passed: false }]; // Playwright: 1/2 routes passed
  const b11_b = computeB11B(routeResults, true);
  eq(b11_b, 'fail', 'route→b11_b');
  const gatesPass = computeGatesPass('pass', 0, b11_b); // static+coverage clean, but Playwright failed
  eq(gatesPass, false, 'b11_b→gatesPass');
  eq(exitOf(gatesPass), 1, 'gatesPass→exit');
  // record-verify then reads this 1 as tier_b_exit=1 → computeVerified(0,1)=false (see record-verify.test.ts §5(b)).
});
test('JOIN: all routes pass → b11_b=pass → gatesPass=true → exit 0 (legitimate verified=true path)', () => {
  const b11_b = computeB11B([{ passed: true }, { passed: true }], true);
  eq(b11_b, 'pass', 'route→b11_b');
  eq(exitOf(computeGatesPass('pass', 0, b11_b)), 0, 'legit-pass');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
