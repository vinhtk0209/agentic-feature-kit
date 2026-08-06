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
import {
  parseRowDefer, validateRowDefer, ChecklistDeferError, LOCKED_ANCHORS,
  stampRowDefer, buildPredicateCaptureInput,
} from './checklist-defer';

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

// ── §10.9 D9.2 — stampRowDefer: writer-side capture-time evaluation (C3b-iv, this session) ──

test('stampRowDefer — well-formed marker, predicate UNSATISFIED → stamp:unsatisfied written', () => {
  const line = row('§10.4 ; predicate:no-published-assessment');
  const out = stampRowDefer(line, { assessments: [] }, 'run-abc');
  const parsed = parseRowDefer(out);
  assert.ok(parsed, 'stamped line must still parse as a defer marker');
  assert.equal(parsed!.anchor, '§10.4', 'anchor preserved');
  assert.equal(parsed!.predicateKey, 'no-published-assessment', 'predicate key preserved');
  assert.deepEqual(parsed!.stamp, { outcome: 'unsatisfied', runRef: 'run-abc' }, 'stamp reflects the evaluated outcome + supplied run-ref');
});

test('stampRowDefer — well-formed marker, predicate SATISFIED → stamp:satisfied written', () => {
  const line = row('§10.4 ; predicate:no-published-assessment');
  const out = stampRowDefer(line, { assessments: [{ examId: 1 }] }, 'run-abc');
  const parsed = parseRowDefer(out);
  assert.deepEqual(parsed!.stamp, { outcome: 'satisfied', runRef: 'run-abc' });
});

test('stampRowDefer — specific-exam-filter predicate, no non-empty chart → unsatisfied', () => {
  const line = row('§10.4 ; predicate:specific-exam-filter');
  const out = stampRowDefer(line, { perExamCharts: [{ empty: true }, { empty: true }] }, 'run-xyz');
  assert.deepEqual(parseRowDefer(out)!.stamp, { outcome: 'unsatisfied', runRef: 'run-xyz' });
});

test('stampRowDefer — specific-exam-filter predicate, one non-empty chart → satisfied', () => {
  const line = row('§10.4 ; predicate:specific-exam-filter');
  const out = stampRowDefer(line, { perExamCharts: [{ empty: true }, { empty: false }] }, 'run-xyz');
  assert.deepEqual(parseRowDefer(out)!.stamp, { outcome: 'satisfied', runRef: 'run-xyz' });
});

test('stampRowDefer — re-stamping replaces a stale stamp, does not duplicate the clause', () => {
  const already = row('§10.4 ; predicate:no-published-assessment ; stamp:satisfied@old-run');
  const out = stampRowDefer(already, { assessments: [] }, 'new-run');
  const parsed = parseRowDefer(out)!;
  assert.deepEqual(parsed.stamp, { outcome: 'unsatisfied', runRef: 'new-run' }, 'fresh evaluation overwrites the stale stamp');
  const stampClauseCount = (out.match(/stamp:/g) ?? []).length;
  assert.equal(stampClauseCount, 1, 'exactly one stamp: clause must remain, never two');
});

test('stampRowDefer — no DEFER marker on the row → line returned byte-identical', () => {
  const plain = '| ACT-03 | another AC | Playwright | ✅ Pass | run-ref |';
  assert.equal(stampRowDefer(plain, { assessments: [] }, 'run-1'), plain);
});

test('stampRowDefer — malformed marker (no predicate key) → left untouched, not this function\'s job to fix', () => {
  const line = row('§10.4');
  const out = stampRowDefer(line, { assessments: [] }, 'run-1');
  assert.equal(out, line, 'anchorless/predicate-less markers are the READER\'s (validateRowDefer\'s) STOP, not silently patched here');
});

test('stampRowDefer — unknown predicate key → left untouched (governed lookup, not a throw here)', () => {
  const line = row('§10.4 ; predicate:some-future-key-not-yet-registered');
  const out = stampRowDefer(line, { assessments: [] }, 'run-1');
  assert.equal(out, line);
});

// ── buildPredicateCaptureInput — duck-typed, feature-agnostic extraction from raw network
//    observations (ApiResponseObservation-shaped: {url, status, bodyText}). Matches on RESPONSE
//    SHAPE (a boolean `.empty` field ⇒ a charts-like observation; an `.assessments` array ⇒ an
//    assessments-like observation), never on URL substrings — so this stays feature-agnostic even
//    though PREDICATE_REGISTRY's 2 keys are themselves feature-specific. ──

test('buildPredicateCaptureInput — extracts perExamCharts from empty-boolean-shaped bodies', () => {
  const obs = [
    { url: 'https://x/reports/assessments/charts?exam_id=157', status: 200, bodyText: JSON.stringify({ empty: true, exam_id: 157 }) },
    { url: 'https://x/reports/overview', status: 200, bodyText: JSON.stringify({ totalEnrolled: 5 }) },
  ];
  const input = buildPredicateCaptureInput(obs);
  assert.deepEqual(input.perExamCharts, [{ empty: true }]);
});

test('buildPredicateCaptureInput — extracts + flattens assessments-shaped bodies', () => {
  const obs = [
    { url: 'https://x/reports/assessments', status: 200, bodyText: JSON.stringify({ assessments: [{ exam_id: 157 }, { exam_id: 177 }] }) },
  ];
  const input = buildPredicateCaptureInput(obs);
  assert.equal(input.assessments?.length, 2);
});

test('buildPredicateCaptureInput — non-JSON / unrelated bodies are skipped, never throw', () => {
  const obs = [
    { url: 'https://x/health', status: 200, bodyText: 'OK' },
    { url: 'https://x/reports/learners', status: 200, bodyText: JSON.stringify({ content: [] }) },
  ];
  const input = buildPredicateCaptureInput(obs);
  assert.deepEqual(input, { perExamCharts: [], assessments: [] });
});

test('round-trip — live-shaped capture (charts.empty=true, real exam) resolves specific-exam-filter as UNSATISFIED (matches the real backend state documented in GAPS-ROADMAP/HANDOFF)', () => {
  const obs = [
    { url: 'https://x/reports/assessments/charts?exam_id=157', status: 200, bodyText: JSON.stringify({ empty: true, exam_id: 157, exam_title: 'Bổ trợ thêm', status_chart: { passed: 0, incomplete: 0, not_attempted: 2 } }) },
  ];
  const line = row('§10.4 ; predicate:specific-exam-filter');
  const out = stampRowDefer(line, buildPredicateCaptureInput(obs), 'run-live-shape');
  assert.deepEqual(parseRowDefer(out)!.stamp, { outcome: 'unsatisfied', runRef: 'run-live-shape' });
});
