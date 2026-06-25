/**
 * lesson-registry.test.ts — tests for lesson-registry.ts
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/lesson-registry.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 */

import { parseLessons, buildReport, parseCliArgs, syncCheck } from './lesson-registry';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`❌ ${name}\n     ${(e as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SINGLE_LESSON = `
<!-- @lesson id="L-2026-06-01-001"
             classification="automated_gate"
             priority="high"
             root_cause="missing_validation"
             enforced_by="lint-feature.ts:HR33"
             test_status="enforced" -->
### HR33 — No blind cast
Every response must go through a mapper.
`;

const TWO_LESSONS = `
<!-- @lesson id="L-2026-06-01-001" classification="prompt_rule" priority="low" root_cause="hallucination" enforced_by="none" test_status="exempt" -->
### Improvement 1
Some exempt lesson.

<!-- @lesson id="L-2026-06-01-002" classification="validation_rule" priority="high" root_cause="req_ambiguity" enforced_by="none" test_status="pending" -->
### Improvement 2
A high-priority pending lesson.
`;

const NO_LESSONS = `
# Prompt Evolution Log
Just prose, no lesson annotations.

## Change 1
Some change.
`;

const MALFORMED = `
<!-- @lesson classification="automated_gate" priority="high" enforced_by="none" test_status="pending" -->
Missing id — should be skipped.
`;

const INLINE_ATTRS = `
<!-- @lesson id="L-2026-01-01-001" classification="project_knowledge" priority="medium" root_cause="missing_project_knowledge" enforced_by="none" test_status="pending" -->
Inline single-line annotation.
`;

// ─── Tests ───────────────────────────────────────────────────────────────────

test('parseLessons — single multi-line annotation', () => {
  const lessons = parseLessons(SINGLE_LESSON);
  assert(lessons.length === 1, `expected 1 lesson, got ${lessons.length}`);
  const l = lessons[0];
  assert(l.id === 'L-2026-06-01-001', `wrong id: ${l.id}`);
  assert(l.classification === 'automated_gate', `wrong classification: ${l.classification}`);
  assert(l.priority === 'high', `wrong priority: ${l.priority}`);
  assert(l.testStatus === 'enforced', `wrong testStatus: ${l.testStatus}`);
  assert(l.enforcedBy === 'lint-feature.ts:HR33', `wrong enforcedBy: ${l.enforcedBy}`);
});

test('parseLessons — two annotations parsed correctly', () => {
  const lessons = parseLessons(TWO_LESSONS);
  assert(lessons.length === 2, `expected 2 lessons, got ${lessons.length}`);
  assert(lessons[0].testStatus === 'exempt', `first should be exempt`);
  assert(lessons[1].testStatus === 'pending', `second should be pending`);
  assert(lessons[1].priority === 'high', `second should be high priority`);
});

test('parseLessons — file with no annotations returns empty', () => {
  const lessons = parseLessons(NO_LESSONS);
  assert(lessons.length === 0, `expected 0 lessons, got ${lessons.length}`);
});

test('parseLessons — annotation missing id is skipped', () => {
  const lessons = parseLessons(MALFORMED);
  assert(lessons.length === 0, `malformed annotation without id must be skipped`);
});

test('parseLessons — inline single-line annotation', () => {
  const lessons = parseLessons(INLINE_ATTRS);
  assert(lessons.length === 1, `expected 1 lesson, got ${lessons.length}`);
  assert(lessons[0].id === 'L-2026-01-01-001', `wrong id`);
  assert(lessons[0].classification === 'project_knowledge', `wrong classification`);
});

test('buildReport — counts match', () => {
  const lessons = parseLessons(TWO_LESSONS);
  const report = buildReport(lessons);
  assert(report.total === 2, `total should be 2`);
  assert(report.enforced === 0, `enforced should be 0`);
  assert(report.pending === 1, `pending should be 1`);
  assert(report.exempt === 1, `exempt should be 1`);
  assert(report.unenforcedHigh === 1, `unenforcedHigh should be 1 (one HIGH pending)`);
});

test('buildReport — unenforced HIGH is 0 when all HIGH are enforced', () => {
  const lessons = parseLessons(SINGLE_LESSON);
  const report = buildReport(lessons);
  assert(report.unenforcedHigh === 0, `single enforced HIGH should give unenforcedHigh=0`);
});

// Regression: a typo in an enum value (e.g. test_status="active") must NOT crash
// parseLessons/buildReport. It used to throw `byStatus[undefined].push`, taking down
// `npm test` (lesson-registry runs inside test:kit). Now coerced to a safe default.
const BAD_ENUMS = `
<!-- @lesson id="L-BAD-001" classification="tooling_improvement" priority="urgent" root_cause="x" enforced_by="none" test_status="active" -->
### Bad enums
Unknown classification/priority/test_status values.
`;

test('parseLessons — unknown enum values coerce to defaults (no crash)', () => {
  const lessons = parseLessons(BAD_ENUMS);
  assert(lessons.length === 1, 'should parse the lesson');
  assert(lessons[0].testStatus === 'pending', `test_status → pending, got ${lessons[0].testStatus}`);
  assert(lessons[0].priority === 'low', `priority → low, got ${lessons[0].priority}`);
  assert(lessons[0].classification === 'prompt_rule', `classification → prompt_rule, got ${lessons[0].classification}`);
});

test('buildReport — bad-enum lesson does not throw and buckets under defaults', () => {
  const report = buildReport(parseLessons(BAD_ENUMS));
  assert(report.total === 1, 'total should be 1');
  assert(report.pending === 1, 'coerced lesson should land in the pending bucket');
});

test('parseCliArgs — defaults', () => {
  const opts = parseCliArgs([]);
  assert(opts.summary === false, 'summary default false');
  assert(opts.gate === false, 'gate default false');
  assert(opts.json === false, 'json default false');
  assert(opts.syncCheck === false, 'syncCheck default false');
  assert(opts.evolutionFile.includes('prompt-evolution.md'), 'default file includes prompt-evolution.md');
});

test('parseCliArgs — flags parsed', () => {
  const opts = parseCliArgs(['--summary', '--gate', '--json', '--sync-check', '--evolution-file', 'my-file.md']);
  assert(opts.summary === true, 'summary');
  assert(opts.gate === true, 'gate');
  assert(opts.json === true, 'json');
  assert(opts.syncCheck === true, 'syncCheck');
  assert(opts.evolutionFile === 'my-file.md', 'evolutionFile');
});

// ─── syncCheck ───────────────────────────────────────────────────────────────

test('syncCheck — annotation immediately followed by heading → paired', () => {
  const content = `
<!-- @lesson id="L-2026-01-01-001" classification="prompt_rule" priority="high" root_cause="hallucination" enforced_by="none" test_status="pending" -->
### Change A.1 — Some rule
Prose here.
`;
  const r = syncCheck(content);
  assert(r.total === 1, `expected 1 total, got ${r.total}`);
  assert(r.paired === 1, `expected 1 paired, got ${r.paired}`);
  assert(r.orphaned.length === 0, 'expected no orphans');
  assert(r.ok === true, 'expected ok');
});

test('syncCheck — annotation with no heading within 5 lines → orphaned', () => {
  const content = `
<!-- @lesson id="L-2026-01-01-002" classification="prompt_rule" priority="high" root_cause="hallucination" enforced_by="none" test_status="pending" -->
Some prose without a heading.
More prose.
Even more prose.
Still no heading.
And another line.
Still nothing — should be flagged.
`;
  const r = syncCheck(content);
  assert(r.total === 1, `expected 1 total, got ${r.total}`);
  assert(r.paired === 0, `expected 0 paired, got ${r.paired}`);
  assert(r.orphaned.length === 1, `expected 1 orphan, got ${r.orphaned.length}`);
  assert(r.orphaned[0].id === 'L-2026-01-01-002', `wrong orphan id: ${r.orphaned[0].id}`);
  assert(r.ok === true, '1 orphan is within default maxOrphaned=1');
});

test('syncCheck — two orphans exceeds maxOrphaned=1 → not ok', () => {
  const content = `
<!-- @lesson id="L-2026-01-01-003" classification="prompt_rule" priority="high" root_cause="hallucination" enforced_by="none" test_status="pending" -->
prose prose prose prose prose prose prose

<!-- @lesson id="L-2026-01-01-004" classification="prompt_rule" priority="high" root_cause="hallucination" enforced_by="none" test_status="pending" -->
more prose more prose more prose more prose
`;
  const r = syncCheck(content);
  assert(r.total === 2, `expected 2 total, got ${r.total}`);
  assert(r.orphaned.length === 2, `expected 2 orphans, got ${r.orphaned.length}`);
  assert(r.ok === false, 'expected ok=false when 2 orphans > maxOrphaned=1');
});

test('syncCheck — heading 5 lines away is still within lookAhead → paired', () => {
  const content = `
<!-- @lesson id="L-2026-01-01-005" classification="prompt_rule" priority="high" root_cause="hallucination" enforced_by="none" test_status="pending" -->
line 1
line 2
line 3
line 4
### Change A.5 — Exactly at lookAhead boundary
`;
  const r = syncCheck(content);
  assert(r.paired === 1, `heading at distance 5 should be paired, got paired=${r.paired}`);
  assert(r.orphaned.length === 0, 'expected no orphans');
});

test('syncCheck — empty content → zero totals, ok', () => {
  const r = syncCheck('');
  assert(r.total === 0, 'total should be 0');
  assert(r.ok === true, 'empty content is ok');
});

test('syncCheck — real prompt-evolution.md passes (all W-series paired)', () => {
  // Structural regression: every @lesson in the live file must have a Change section
  const fs = require('fs');
  const path = require('path');
  const evo = path.join(process.cwd(), '.claude', 'prompt-evolution.md');
  if (!fs.existsSync(evo)) {
    console.log('   (skipped — prompt-evolution.md not found)');
    return;
  }
  const r = syncCheck(fs.readFileSync(evo, 'utf-8'));
  assert(r.ok, `prompt-evolution.md has ${r.orphaned.length} orphaned annotation(s) > max 1: ${r.orphaned.map((o: { id: string; lineNumber: number }) => o.id).join(', ')}`);
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
