/**
 * checklist-defer.test.ts — §10.4 C3a: STATIC marker-validation for row-level declared-defers.
 *
 * Attack-tests T2–T4 (design §10.5). Hermetic: in-memory row/marker fixtures only. C3a validates
 * the `<!-- DEFER: … -->` marker and STOPs on a malformed one; it does NOT yet exclude a valid
 * defer from HR35/HR36 (that is C3b). Mirrors contract-probe.defer.test.ts (§17.7 suite).
 * Run:  npx tsx .claude/integrations/checklist-defer.test.ts   (or `npx tsx --test …`)
 *
 * RED-FIRST: authored BEFORE the checklist-defer.ts module exists → this file fails to import
 * (ERR_MODULE_NOT_FOUND) → all tests RED. It turns GREEN when C3a ships parseRowDefer /
 * validateRowDefer / ChecklistDeferError / LOCKED_ANCHORS with the contract asserted below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRowDefer, validateRowDefer, ChecklistDeferError, LOCKED_ANCHORS } from './checklist-defer';

// A checklist ROW carrying an inline defer marker, mirroring the BE channel `<!-- enforced-by: BE -->`
// (lint-feature.ts:125). The reason between `DEFER:` and `-->` is what parseRowDefer dissects.
const row = (reason: string) => `| ACT-02 | some AC | Playwright | ⬜ Pending | <!-- DEFER: ${reason} --> |`;

// Drive parseRowDefer → validateRowDefer(parsed, LOCKED_ANCHORS); assert it STOPs with `expected`.
function assertDeferStop(reason: string, expected: string): void {
  const parsed = parseRowDefer(row(reason));
  assert.ok(parsed !== null, `parseRowDefer must surface the present marker for reason: ${reason}`);
  let err: ChecklistDeferError | null = null;
  try {
    validateRowDefer(parsed!, LOCKED_ANCHORS);
  } catch (e) {
    if (e instanceof ChecklistDeferError) err = e;
    else throw e;
  }
  assert.ok(err !== null, `validateRowDefer must STOP (throw ChecklistDeferError) on reason: ${reason}`);
  assert.equal(err!.verdict, expected, `verdict for "${reason}"`);
}

// ── T2 (design §10.5) — anchorless defer: predicate present, NO §-anchor → STOP ──
test('T2 — anchorless defer → STOP tierB-defer-anchorless', () => {
  assertDeferStop('predicate:secondRouteCapturesClean', 'tierB-defer-anchorless');
});

// ── T3 (design §10.5) — predicate-less defer: §-anchor present, NO predicate key → STOP ──
test('T3 — predicate-less defer → STOP tierB-defer-predicate-less', () => {
  assertDeferStop('§10.4', 'tierB-defer-predicate-less');
});

// ── T4 (design §10.5) — defer-inflation: §-anchor is well-formed but NOT a LOCKED decision → STOP ──
test('T4 — anchor not in lockedAnchorSet → STOP tierB-defer-anchor-not-locked', () => {
  assertDeferStop('§99.9 ; predicate:secondRouteCapturesClean', 'tierB-defer-anchor-not-locked');
});

// ── Happy-path guard (mirrors §17.7 T5 "no-divergence → PASS"): a well-formed marker whose anchor
//    IS locked and which carries a predicate key is ADMITTED (no throw). Prevents an over-eager
//    validator that throws on everything from passing T2–T4 for the wrong reason. C3a admits it but
//    does NOT exclude the row yet (exclusion = C3b). ──
test('valid defer (§10.4 + predicate, locked) → admitted, no throw', () => {
  const parsed = parseRowDefer(row('§10.4 ; predicate:secondRouteCapturesClean'));
  assert.ok(parsed !== null, 'a present, well-formed marker must parse');
  assert.doesNotThrow(() => validateRowDefer(parsed!, LOCKED_ANCHORS));
});

// ── Channel sanity: a row with NO `<!-- DEFER: … -->` marker → parseRowDefer returns null (nothing
//    to validate; today's rows are all unaffected). ──
test('no defer marker on the row → parseRowDefer returns null', () => {
  const plain = '| ACT-03 | another AC | Playwright | ✅ Pass | run-ref |';
  assert.equal(parseRowDefer(plain), null);
});
