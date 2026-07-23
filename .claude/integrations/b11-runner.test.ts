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
import { computeB11B, computeGatesPass, assertPlaywrightTokenFresh, normalizeHeading, findHeadingLine, detectEol, buildPlaywrightInsert } from './b11-runner';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function eq<T>(got: T, want: T, msg: string) { if (got !== want) throw new Error(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
const exitOf = (gatesPass: boolean) => (gatesPass ? 0 : 1);

// ── Tier B token preflight fixtures (v3.24) ──
// Real .env.playwright is NEVER touched: each case writes an isolated temp file and
// removes it in finally (afterEach-equivalent for this flat sync harness).
function withEnvFixture(content: string | null, fn: (envPath: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b11-tok-'));
  const envPath = path.join(dir, '.env.playwright');
  if (content !== null) fs.writeFileSync(envPath, content); // null → file absent (file-not-found branch)
  try { fn(envPath); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const NOW = 1_000_000_000_000; // fixed injected clock — no wall-clock dependency
const H = 3_600_000;
const reasonCode = (e: unknown) => String((e as Error).message).split(':')[0];
/** Assert assertPlaywrightTokenFresh THROWS with a specific tierB-token-* reason code. */
function throwsCode(content: string | null, nowMs: number, wantCode: string, msg: string): void {
  withEnvFixture(content, (p) => {
    let e: unknown = null;
    try { assertPlaywrightTokenFresh(p, nowMs); } catch (err) { e = err; }
    if (e === null) throw new Error(`${msg}: expected throw ${wantCode}, got none`);
    eq(reasonCode(e), wantCode, msg);
  });
}
/** Assert it does NOT throw (token present + fresh). */
function noThrow(content: string, nowMs: number, msg: string): void {
  withEnvFixture(content, (p) => {
    try { assertPlaywrightTokenFresh(p, nowMs); }
    catch (err) { throw new Error(`${msg}: unexpected throw ${(err as Error).message}`); }
  });
}
const TOKEN = 'dummy.jwt.placeholder'; // non-credential placeholder — only presence matters

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

// ── Tier B auth preflight — fail-closed on every non-ok token state (v3.24) ──
// These guard the property proven with throwaway tests in Canary 1: a missing/stale/
// expiring token must THROW (exit ≠ 0) BEFORE Playwright launches, so a silent-empty
// 401 render can never reach an assertion. Reason codes must stay distinct.
test('preflight A missing: env file absent → tierB-token-missing', () => {
  throwsCode(null, NOW, 'tierB-token-missing', 'file-absent');
});
test('preflight A missing: EXPIRES_AT absent (token present) → tierB-token-missing', () => {
  throwsCode(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\n`, NOW, 'tierB-token-missing', 'no-expiry');
});
test('preflight GAP: valid future expiry BUT no PLAYWRIGHT_ACCESS_TOKEN → tierB-token-missing  [Z.3 blocker; status-only gate would pass this]', () => {
  throwsCode(`PLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW + 72 * H}\n`, NOW, 'tierB-token-missing', 'gap-absent-token');
});
test('preflight B expired: past EXPIRES_AT → tierB-token-expired  [nowMs injected]', () => {
  throwsCode(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\nPLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW - 3 * H}\n`, NOW, 'tierB-token-expired', 'expired');
});
test('preflight C expiring: EXPIRES_AT +5h (<6h) → tierB-token-expiring  [the decisive case: passes under exit-code gating]', () => {
  throwsCode(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\nPLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW + 5 * H}\n`, NOW, 'tierB-token-expiring', 'expiring');
});
test('preflight D ok: token present + expiry +72h → does NOT throw', () => {
  noThrow(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\nPLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW + 72 * H}\n`, NOW, 'ok');
});
test('preflight boundary: EXPIRES_AT exactly 6h ahead → still fresh (ok), not expiring  [AA.4 §9: threshold 24h→6h]', () => {
  noThrow(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\nPLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW + 6 * H}\n`, NOW, 'boundary-6h');
});
test('preflight AA.4 regression: fresh TTL_native-sized token (~23.5h) → does NOT throw  [§9: pre-fix this THREW under 24h threshold]', () => {
  noThrow(`PLAYWRIGHT_ACCESS_TOKEN=${TOKEN}\nPLAYWRIGHT_TOKEN_EXPIRES_AT=${NOW + 23.5 * H}\n`, NOW, 'aa4-fresh-ttl-native');
});

// ── W3 — normalizeHeading / findHeadingLine (heading-agnostic section resolution) ──
test('normalizeHeading: current-target Playwright heading', () => {
  eq(normalizeHeading('## Playwright Verify (B11)'), 'playwrightverifyb11', 'current-target-playwright');
});
test('normalizeHeading: template emoji Playwright heading', () => {
  eq(normalizeHeading('## 🔬 Playwright Verification Log'), 'playwrightverificationlog', 'template-emoji-playwright');
});
test('normalizeHeading: extra hashes + extra whitespace', () => {
  eq(normalizeHeading('###   playwright   verify'), 'playwrightverify', 'extra-hashes-whitespace');
});
test('normalizeHeading: template emoji Summary heading', () => {
  eq(normalizeHeading('## 📊 Summary'), 'summary', 'template-emoji-summary');
});
test('normalizeHeading: current-target Summary heading', () => {
  eq(normalizeHeading('## Summary'), 'summary', 'current-target-summary');
});
test('normalizeHeading: no ## prefix -> null', () => {
  eq(normalizeHeading('Playwright Verify'), null, 'no-hash-prefix');
});
test('normalizeHeading: no space after # -> null', () => {
  eq(normalizeHeading('##NoSpace'), null, 'no-space-after-hash');
});
test('normalizeHeading: heading not at line start -> null', () => {
  eq(normalizeHeading('- ## not a heading'), null, 'not-line-start');
});

// Fixtures: CURRENT_FORM mirrors the live target checklist's plain headings; TEMPLATE_FORM
// mirrors checklist.template.md's emoji-prefixed headings (§F / G-CHECKLIST-REGEN probe).
const CURRENT_FORM = [
  '## UX States', '', '| ID | State |', '|----|-------|', '',
  '## Playwright Verify (B11)', '', '| Check | Result | Notes |', '|-------|--------|-------|', '',
  '## Summary', '', '- done',
].join('\n');
const TEMPLATE_FORM = [
  '## UX States', '', '## 🌱 Seed Coverage', '',
  '## 🔬 Playwright Verification Log', '', '| Check ID | Description | Result | Evidence |', '|----------|-------------|--------|----------|', '',
  '## 📊 Summary', '', '- done',
].join('\n');
const NEITHER_FORM = ['## Requirements Coverage', '', '## UI Verification', '', '## ACT'].join('\n');

test('findHeadingLine: finds "playwright" in template emoji form', () => {
  eq(findHeadingLine(TEMPLATE_FORM, 'playwright'), 4, 'template-playwright-idx');
});
test('findHeadingLine: finds "playwright" in current target form', () => {
  eq(findHeadingLine(CURRENT_FORM, 'playwright'), 5, 'current-playwright-idx');
});
test('findHeadingLine: finds "summary" in template emoji form', () => {
  eq(findHeadingLine(TEMPLATE_FORM, 'summary'), 9, 'template-summary-idx');
});
test('findHeadingLine: finds "summary" in current target form', () => {
  eq(findHeadingLine(CURRENT_FORM, 'summary'), 10, 'current-summary-idx');
});
test('findHeadingLine: returns -1 when neither heading is present', () => {
  eq(findHeadingLine(NEITHER_FORM, 'playwright'), -1, 'neither-playwright-idx');
  eq(findHeadingLine(NEITHER_FORM, 'summary'), -1, 'neither-summary-idx');
});
test('findHeadingLine: CRLF content resolves identically to LF content', () => {
  const crlf = CURRENT_FORM.replace(/\n/g, '\r\n');
  eq(findHeadingLine(crlf, 'playwright'), findHeadingLine(CURRENT_FORM, 'playwright'), 'crlf-playwright-matches-lf');
  eq(findHeadingLine(crlf, 'summary'), findHeadingLine(CURRENT_FORM, 'summary'), 'crlf-summary-matches-lf');
});

// ── W3-fix — detectEol / buildPlaywrightInsert (preserve original EOL on insert) ──
test('detectEol: CRLF content -> \\r\\n', () => {
  eq(detectEol('## Summary\r\n\r\n- done\r\n'), '\r\n', 'crlf-content');
});
test('detectEol: LF content -> \\n', () => {
  eq(detectEol('## Summary\n\n- done\n'), '\n', 'lf-content');
});
test('detectEol: empty string -> \\n', () => {
  eq(detectEol(''), '\n', 'empty-content');
});
test('detectEol: single line, no newline at all -> \\n', () => {
  eq(detectEol('## Summary'), '\n', 'no-newline-content');
});
test('detectEol: mixed content containing at least one CRLF pair -> \\r\\n', () => {
  eq(detectEol('## UX States\n\n## Summary\r\n\n- done'), '\r\n', 'mixed-content');
});

// Round-trip: buildPlaywrightInsert is the pure string-assembly step extracted from
// updateChecklistPlaywright's else-branch (kit-side, not exported before this turn) so the
// EOL-preservation property is testable without exporting that function or touching its
// specsDir closure (both out of scope this turn — see prompt's R1 fallback clause).
test('buildPlaywrightInsert: CRLF content + existing Summary heading -> splice-insert stays CRLF', () => {
  const crlf = ['## UX States', '', '## Summary', '', '- done'].join('\r\n');
  const result = buildPlaywrightInsert(crlf, '| PLAYWRIGHT-ROUTE-001: /x | ✅ pass |  |', '\r\n');
  eq(result.includes('\r\n'), true, 'contains-crlf');
  eq(/(?<!\r)\n/.test(result), false, 'no-bare-lf');
});
test('buildPlaywrightInsert: CRLF content + no Summary heading -> append stays CRLF', () => {
  const crlf = ['## UX States', '', '- done'].join('\r\n');
  const result = buildPlaywrightInsert(crlf, '| PLAYWRIGHT-ROUTE-001: /x | ✅ pass |  |', '\r\n');
  eq(result.includes('\r\n'), true, 'contains-crlf');
  eq(/(?<!\r)\n/.test(result), false, 'no-bare-lf');
});
test('buildPlaywrightInsert: LF content + existing Summary heading -> splice-insert stays LF (no regression)', () => {
  const lf = ['## UX States', '', '## Summary', '', '- done'].join('\n');
  const result = buildPlaywrightInsert(lf, '| PLAYWRIGHT-ROUTE-001: /x | ✅ pass |  |', '\n');
  eq(result.includes('\r\n'), false, 'no-crlf-introduced');
  eq(result.includes('## Playwright Verify (B11)'), true, 'section-text-present');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
