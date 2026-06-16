/**
 * improve-trigger.test.ts — tests for improve-trigger.ts
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/improve-trigger.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 */

import {
  parseFrontmatter,
  serializeFrontmatter,
  classifyPatternRisk,
  countDistinctFeatures,
  hasSectionConflict,
  sectionsOverlap,
  extractStepTokens,
  isDeadManTripped,
  verifyAmendments,
  main,
  makeAmendmentId,
  readArchive,
  readTotalRunsFromKpi,
  readKpiHistory,
  computeGroundTruth,
  groundTruthImproved,
  markApplied,
  hasVerifiedInArchive,
  THRESHOLDS,
  PATTERN_GROUND_TRUTH,
  MACHINE_MEASURED,
  type Amendment,
  type AmendmentFrontmatter,
  type RunKPIPartial,
} from './improve-trigger';
import type { Pattern, AnalysisResult } from './feedback-analyzer';

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

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'manual_correction_spike',
    description: 'Run required ≥2 manual corrections from user',
    count: 4,
    total: 8,
    frequency: 0.50,
    priority: 'HIGH',
    watch_steps: ['B5', 'B10'],
    examples: ['FeatureA @ 2026-01-01', 'FeatureB @ 2026-01-02', 'FeatureC @ 2026-01-03'],
    proposal: {
      section: 'B5 + B10 — Spec clarity + agent brief',
      summary: 'Strengthen spec completeness checks.',
    },
    ...overrides,
  };
}

function makeAmendment(overrides: Partial<AmendmentFrontmatter> = {}): Amendment {
  return {
    id: 'AME-2026-01-01-001',
    triggeredBy: ['manual_correction_spike'],
    patternId: 'manual_correction_spike',
    patternCount: 4,
    patternFrequency: 0.50,
    evidenceFeatures: ['FeatureA', 'FeatureB', 'FeatureC'],
    risk: 'low',
    actionType: 'test_addition',
    targetSection: 'B5 + B10 — Spec clarity + agent brief',
    status: 'proposed',
    proposedAt: '2026-01-01',
    verifyAfterNRuns: 5,
    preAmendmentFrequency: 0.50,
    preAmendmentTotalRuns: 8,
    filePath: '/fake/AME-2026-01-01-001.md',
    proposalText: 'placeholder',
    ...overrides,
  };
}

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    totalRuns: 12,
    userEntries: 2,
    patterns: [],
    topPatterns: [],
    highPriority: [],
    ...overrides,
  };
}

// ─── Frontmatter round-trip ───────────────────────────────────────────────────

test('serializeFrontmatter → parseFrontmatter round-trip', () => {
  const fm: AmendmentFrontmatter = {
    id: 'AME-2026-06-01-001',
    triggeredBy: ['high_friction_run', 'manual_correction_spike'],
    patternId: 'high_friction_run',
    patternCount: 3,
    patternFrequency: 0.43,
    evidenceFeatures: ['Feat1', 'Feat2'],
    risk: 'low',
    actionType: 'prompt_patch',
    targetSection: 'B0 — Pre-flight',
    status: 'proposed',
    proposedAt: '2026-06-01',
    verifyAfterNRuns: 5,
    preAmendmentFrequency: 0.43,
    preAmendmentTotalRuns: 7,
  };

  const serialized = serializeFrontmatter(fm);
  const parsed = parseFrontmatter(serialized + '\n\nSome body text.');

  assert(parsed !== null, 'parseFrontmatter must return non-null');
  assert(parsed!.id === fm.id, `id mismatch: ${parsed!.id}`);
  assert(parsed!.patternId === fm.patternId, `patternId mismatch: ${parsed!.patternId}`);
  assert(parsed!.patternCount === fm.patternCount, `patternCount mismatch: ${parsed!.patternCount}`);
  assert(Math.abs(parsed!.patternFrequency - fm.patternFrequency) < 0.01, `frequency mismatch`);
  assert(parsed!.risk === fm.risk, `risk mismatch: ${parsed!.risk}`);
  assert(parsed!.status === fm.status, `status mismatch: ${parsed!.status}`);
  assert(parsed!.triggeredBy.length === 2, `triggeredBy length: ${parsed!.triggeredBy.length}`);
  assert(parsed!.evidenceFeatures.length === 2, `evidenceFeatures length`);
  assert(parsed!.preAmendmentTotalRuns === 7, `preAmendmentTotalRuns: ${parsed!.preAmendmentTotalRuns}`);
});

test('parseFrontmatter — with appliedAtRun round-trip', () => {
  const fm: AmendmentFrontmatter = {
    ...makeAmendment({ status: 'applied', appliedAtRun: 10 }),
  };
  const serialized = serializeFrontmatter(fm);
  const parsed = parseFrontmatter(serialized + '\n\nbody');
  assert(parsed !== null, 'should parse');
  assert(parsed!.appliedAtRun === 10, `appliedAtRun: ${parsed!.appliedAtRun}`);
  assert(parsed!.status === 'applied', `status: ${parsed!.status}`);
});

test('parseFrontmatter — missing id returns null', () => {
  const result = parseFrontmatter('---\nrisk: low\nstatus: proposed\n---\nbody');
  assert(result === null, 'should return null when id is missing');
});

// ─── classifyPatternRisk ──────────────────────────────────────────────────────

test('classifyPatternRisk — qualifies as LOW when all thresholds met', () => {
  const pattern = makePattern({ count: 3, frequency: 0.45, examples: ['A', 'B', 'C'] });
  const result = classifyPatternRisk(pattern);
  assert(result !== null, 'should propose');
  assert(result!.risk === 'low', `expected low, got ${result!.risk}`);
});

test('classifyPatternRisk — qualifies as HIGH when count ≥ 2 and frequency ≥ 30% but < LOW thresholds', () => {
  const pattern = makePattern({ count: 2, frequency: 0.32, examples: ['A'] });
  const result = classifyPatternRisk(pattern);
  assert(result !== null, 'should propose');
  assert(result!.risk === 'high', `expected high, got ${result!.risk}`);
});

test('classifyPatternRisk — below all thresholds returns null', () => {
  const pattern = makePattern({ count: 1, frequency: 0.10, examples: ['A'] });
  const result = classifyPatternRisk(pattern);
  assert(result === null, 'should not propose');
});

test('classifyPatternRisk — 3 examples but only 25% frequency → high-risk not low-risk', () => {
  const pattern = makePattern({ count: 3, frequency: 0.25, examples: ['A', 'B', 'C'] });
  const result = classifyPatternRisk(pattern);
  // 25% < LOW_RISK minFrequency (40%), but count >= 2 and >= 30% no — so should be null or high
  // Actually 0.25 < 0.30, so below high-risk threshold too
  assert(result === null, 'should not propose at 25%');
});

// ─── hasSectionConflict ───────────────────────────────────────────────────────

test('hasSectionConflict — returns true when active amendment targets same section', () => {
  const existing = [makeAmendment({ status: 'proposed', targetSection: 'B5 + B10 — Spec clarity' })];
  assert(
    hasSectionConflict('B5 + B10 — Spec clarity', existing),
    'should detect conflict'
  );
});

test('hasSectionConflict — no conflict if existing is verified or rolled_back', () => {
  const existing = [
    makeAmendment({ status: 'verified', targetSection: 'B5 + B10 — Spec clarity' }),
    makeAmendment({ status: 'rolled_back', targetSection: 'B5 + B10 — Spec clarity' }),
  ];
  assert(
    !hasSectionConflict('B5 + B10 — Spec clarity', existing),
    'verified/rolled_back should not block'
  );
});

test('hasSectionConflict — no conflict for different section', () => {
  const existing = [makeAmendment({ status: 'proposed', targetSection: 'B0 — Pre-flight' })];
  assert(
    !hasSectionConflict('B5 + B10 — Spec clarity', existing),
    'different sections should not conflict'
  );
});

// ─── section overlap (B-step) ──────────────────────────────────────────────────

test('extractStepTokens — pulls B-steps incl. decimals, ignores prose', () => {
  const t = extractStepTokens('B5 + B10 — Spec clarity + agent brief');
  assert(t.has('B5') && t.has('B10') && t.size === 2, `got ${[...t].join(',')}`);
  const d = extractStepTokens('B6.5 — Design Review');
  assert(d.has('B6.5') && !d.has('B6') && d.size === 1, `decimal kept whole: ${[...d].join(',')}`);
});

test('sectionsOverlap — "B5" conflicts with "B5 + B10" (partial step overlap)', () => {
  assert(sectionsOverlap('B5 — steps.md', 'B5 + B10 — Spec clarity'), 'B5 must overlap B5+B10');
  assert(sectionsOverlap('B5 + B10 — Spec clarity', 'B5 — steps.md'), 'overlap is symmetric');
});

test('sectionsOverlap — disjoint B-steps do not conflict', () => {
  assert(!sectionsOverlap('B0 — Pre-flight', 'B5 + B10 — Spec clarity'), 'B0 vs B5/B10 disjoint');
  assert(!sectionsOverlap('B6.5 — Design Review', 'B6 — something'), 'B6.5 ≠ B6');
});

test('sectionsOverlap — non-B sections fall back to normalized exact match', () => {
  assert(sectionsOverlap('★3 SELF-EVALUATE', '★3  self-evaluate '), 'normalized equal → conflict');
  assert(!sectionsOverlap('HARD RULES', '★3 SELF-EVALUATE'), 'different non-B sections → no conflict');
});

test('hasSectionConflict — partial B-step overlap blocks a new proposal', () => {
  const existing = [makeAmendment({ status: 'proposed', targetSection: 'B5 + B10 — Spec clarity' })];
  assert(hasSectionConflict('B5 — steps.md', existing), 'B5 should conflict with active B5+B10');
});

// ─── isDeadManTripped ─────────────────────────────────────────────────────────

test('isDeadManTripped — false below limit', () => {
  const amendments = Array.from({ length: THRESHOLDS.deadManIneffective - 1 }, (_, i) =>
    makeAmendment({ id: `AME-2026-01-01-00${i}`, status: 'ineffective' })
  );
  assert(!isDeadManTripped(amendments), 'should not trip below limit');
});

test('isDeadManTripped — true at or above limit', () => {
  const amendments = Array.from({ length: THRESHOLDS.deadManIneffective }, (_, i) =>
    makeAmendment({ id: `AME-2026-01-01-${String(i).padStart(3, '0')}`, status: 'ineffective' })
  );
  assert(isDeadManTripped(amendments), 'should trip at limit');
});

// ─── verifyAmendments (pure mode, dryRun=true) ───────────────────────────────

test('verifyAmendments — marks verified when frequency drops ≥30%', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
  });
  // currentPattern frequency = 0.20 (60% drop — above threshold)
  const result = makeResult({
    totalRuns: 14,
    patterns: [makePattern({ frequency: 0.20 })],
  });
  const { verified, ineffective } = verifyAmendments([amendment], result, 14, true);
  assert(verified.includes(amendment.id), 'should be verified');
  assert(ineffective.length === 0, 'should not be ineffective');
});

test('verifyAmendments — marks ineffective after buffer runs with insufficient drop', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
  });
  // currentPattern frequency = 0.45 (only 10% drop — below 30% threshold)
  // totalRuns = 16, applied at 8, runs since = 8, cutoff = 5 + 2 = 7 → exceeds
  const result = makeResult({
    totalRuns: 16,
    patterns: [makePattern({ frequency: 0.45 })],
  });
  const { verified, ineffective } = verifyAmendments([amendment], result, 16, true);
  assert(ineffective.includes(amendment.id), 'should be ineffective');
  assert(verified.length === 0, 'should not be verified');
});

test('verifyAmendments — too early to verify (< verifyAfterNRuns)', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 10,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
  });
  const result = makeResult({ totalRuns: 12 }); // only 2 runs since applied
  const { verified, ineffective } = verifyAmendments([amendment], result, 12, true);
  assert(verified.length === 0, 'too early to verify');
  assert(ineffective.length === 0, 'too early to mark ineffective');
});

test('verifyAmendments — skips non-applied amendments', () => {
  const proposed = makeAmendment({ status: 'proposed', appliedAtRun: undefined });
  const result = makeResult({ totalRuns: 20 });
  const { verified, ineffective } = verifyAmendments([proposed], result, 20, true);
  assert(verified.length === 0, 'proposed should be skipped');
  assert(ineffective.length === 0, 'proposed should be skipped');
});

// ─── makeAmendmentId ─────────────────────────────────────────────────────────

test('makeAmendmentId — increments sequence within a day', () => {
  const today = new Date().toISOString().slice(0, 10);
  const existing = [
    makeAmendment({ id: `AME-${today}-001` }),
    makeAmendment({ id: `AME-${today}-002` }),
  ];
  const id = makeAmendmentId(existing, 0);
  assert(id === `AME-${today}-003`, `expected 003, got ${id}`);
});

test('makeAmendmentId — pending-this-run offset prevents duplicate IDs', () => {
  const today = new Date().toISOString().slice(0, 10);
  const existing = [makeAmendment({ id: `AME-${today}-001` })];
  const id1 = makeAmendmentId(existing, 0); // → 002
  const id2 = makeAmendmentId(existing, 1); // → 003
  assert(id1 !== id2, 'ids within same run must differ');
  assert(id1 === `AME-${today}-002`, `id1: ${id1}`);
  assert(id2 === `AME-${today}-003`, `id2: ${id2}`);
});

// ─── Fix 1: missing-pattern false verification ───────────────────────────────

test('verifyAmendments — skips when pattern no longer exists in analyzer (undetectable)', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'old_pattern_that_was_renamed',
  });
  // Result contains a different pattern — old_pattern_that_was_renamed is gone
  const result = makeResult({
    totalRuns: 14,
    patterns: [makePattern({ id: 'some_other_pattern', frequency: 0.10 })],
  });
  const { verified, ineffective, undetectable } = verifyAmendments([amendment], result, 14, true);
  assert(verified.length === 0, 'must NOT mark verified when pattern is missing');
  assert(ineffective.length === 0, 'must NOT mark ineffective when pattern is missing');
  assert(undetectable.includes(amendment.id), `must report ${amendment.id} as undetectable`);
});

test('verifyAmendments — empty result.patterns does not false-verify applied amendments', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 5,
    preAmendmentFrequency: 0.60,
    verifyAfterNRuns: 5,
    patternId: 'manual_correction_spike',
  });
  // No patterns at all (e.g. analyzer refactored away all friction patterns)
  const result = makeResult({ totalRuns: 12, patterns: [] });
  const { verified, ineffective, undetectable } = verifyAmendments([amendment], result, 12, true);
  assert(verified.length === 0, 'empty patterns must not produce false verifications');
  assert(undetectable.includes(amendment.id), 'should be reported undetectable');
});

test('verifyAmendments — still verifies correctly when pattern IS present', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.60,
    verifyAfterNRuns: 5,
    patternId: 'manual_correction_spike',
  });
  // Same pattern still present, but at much lower frequency (70% relative drop)
  const result = makeResult({
    totalRuns: 14,
    patterns: [makePattern({ id: 'manual_correction_spike', frequency: 0.18 })],
  });
  const { verified, ineffective, undetectable } = verifyAmendments([amendment], result, 14, true);
  assert(verified.includes(amendment.id), 'should verify with present pattern + sufficient drop');
  assert(undetectable.length === 0, 'should not be undetectable when pattern exists');
});

test('verifyAmendments — uses monotonic KPI run count, not the trimmed feedback window', () => {
  // Regression for the counter scale-mismatch freeze. feedback-history is trimmed
  // to MAX_ENTRIES so result.totalRuns plateaus (~10), while KPI history
  // (currentRun) keeps growing. appliedAtRun is recorded from the KPI count.
  // Before the fix, runsSinceApplied = result.totalRuns - appliedAtRun went
  // negative once KPI > window → verification could never fire again.
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 45, // recorded from KPI count at apply time
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'manual_correction_spike',
  });
  const result = makeResult({
    totalRuns: 10, // trimmed feedback window — would freeze the old math
    patterns: [makePattern({ id: 'manual_correction_spike', frequency: 0.20 })],
  });
  // currentRun = 50 (KPI): 50 - 45 = 5 ≥ verifyAfterNRuns → eligible; 60% drop → verified
  const { verified } = verifyAmendments([amendment], result, 50, true);
  assert(verified.includes(amendment.id), 'must verify using KPI run count even when feedback window is small');
});

// ─── Ground-truth cross-check in verifyAmendments (machine fields only) ──────

test('MACHINE_MEASURED — only b11 verdicts count as independent, not self-reported friction', () => {
  assert(MACHINE_MEASURED.has('b11_a'), 'b11_a is machine-measured');
  assert(MACHINE_MEASURED.has('b11_b'), 'b11_b is machine-measured');
  assert(!MACHINE_MEASURED.has('manualCorrections'), 'manualCorrections is self-reported, not independent');
  assert(!MACHINE_MEASURED.has('frictionScore'), 'frictionScore is self-reported, not independent');
});

test('verifyAmendments — withholds verified when a MACHINE signal contradicts the frequency drop', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'b11_agent_a_fail', // → b11_a (machine-measured)
  });
  // Self-reported frequency dropped 60% (0.50 → 0.20) — would verify on its own.
  const result = makeResult({
    patterns: [makePattern({ id: 'b11_agent_a_fail', frequency: 0.20 })],
  });
  // But the MEASURED b11_a pass rate did NOT improve (fail before, fail after).
  const kpis: RunKPIPartial[] = [
    ...Array(8).fill({ b11_a: 'fail' }),
    ...Array(7).fill({ b11_a: 'fail' }),
  ]; // length 15 → runsSinceApplied = 7 ≥ cutoff (5 + 2)
  const { verified, ineffective } = verifyAmendments([amendment], result, 15, true, kpis);
  assert(!verified.includes(amendment.id), 'must NOT verify when the machine metric did not improve');
  assert(ineffective.includes(amendment.id), 'past cutoff with no real improvement → ineffective');
});

test('verifyAmendments — verifies when frequency drop AND machine ground-truth both improve', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'b11_agent_a_fail',
  });
  const result = makeResult({
    patterns: [makePattern({ id: 'b11_agent_a_fail', frequency: 0.20 })],
  });
  // Measured b11_a pass rate rose from 0% → 100% after applying.
  const kpis: RunKPIPartial[] = [
    ...Array(8).fill({ b11_a: 'fail' }),
    ...Array(7).fill({ b11_a: 'pass' }),
  ]; // length 15 → runsSinceApplied = 7
  const { verified, ineffective } = verifyAmendments([amendment], result, 15, true, kpis);
  assert(verified.includes(amendment.id), 'should verify when both signals agree');
  assert(ineffective.length === 0, 'should not be ineffective');
});

test('verifyAmendments — self-reported field is frequency-only: a non-improving KPI does NOT block', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'manual_correction_spike', // → manualCorrections (self-reported, NOT independent)
  });
  const result = makeResult({
    patterns: [makePattern({ id: 'manual_correction_spike', frequency: 0.20 })],
  });
  // Self-reported manualCorrections did NOT fall — but it's not independent, so it
  // must not be treated as ground truth: verification falls back to frequency-only.
  const kpis: RunKPIPartial[] = [
    ...Array(8).fill({ manualCorrections: 3 }),
    ...Array(7).fill({ manualCorrections: 3 }),
  ];
  const { verified } = verifyAmendments([amendment], result, 15, true, kpis);
  assert(verified.includes(amendment.id), 'self-reported KPI must not gate verification (frequency-only fallback)');
});

test('verifyAmendments — falls back to frequency-only when no KPI ground-truth exists for the pattern', () => {
  const amendment = makeAmendment({
    status: 'applied',
    appliedAtRun: 8,
    preAmendmentFrequency: 0.50,
    verifyAfterNRuns: 5,
    patternId: 'design_cycleback', // not in PATTERN_GROUND_TRUTH → no independent signal
  });
  const result = makeResult({
    patterns: [makePattern({ id: 'design_cycleback', frequency: 0.20 })],
  });
  const { verified } = verifyAmendments([amendment], result, 14, true, [{ manualCorrections: 9 }]);
  assert(verified.includes(amendment.id), 'frequency-only fallback should still verify when no ground-truth mapping');
});

// ─── groundTruthImproved ──────────────────────────────────────────────────────

test('groundTruthImproved — null when no signal', () => {
  assert(groundTruthImproved(null) === null, 'null gt → null');
  assert(groundTruthImproved({ field: 'manualCorrections', preAvg: null, postAvg: 2, isBinary: false }) === null, 'null preAvg → null');
});

test('groundTruthImproved — binary pass-rate higher is better', () => {
  assert(groundTruthImproved({ field: 'b11_a', preAvg: 0.4, postAvg: 0.9, isBinary: true }) === true, 'pass rate up → improved');
  assert(groundTruthImproved({ field: 'b11_a', preAvg: 0.9, postAvg: 0.4, isBinary: true }) === false, 'pass rate down → not improved');
});

test('groundTruthImproved — numeric count lower is better', () => {
  assert(groundTruthImproved({ field: 'manualCorrections', preAvg: 3, postAvg: 1, isBinary: false }) === true, 'fewer corrections → improved');
  assert(groundTruthImproved({ field: 'manualCorrections', preAvg: 1, postAvg: 3, isBinary: false }) === false, 'more corrections → not improved');
});

// ─── Fix 2: countDistinctFeatures ────────────────────────────────────────────

test('countDistinctFeatures — "FeatureName @ date" format counts distinct names', () => {
  const examples = [
    'FeatureA @ 2026-01-01',
    'FeatureA @ 2026-01-02',   // same feature, second run
    'FeatureB @ 2026-01-03',
  ];
  assert(countDistinctFeatures(examples) === 2, `expected 2 distinct, got ${countDistinctFeatures(examples)}`);
});

test('countDistinctFeatures — "FeatureName: detail" format counts distinct names', () => {
  const examples = [
    'FeatureA: 2 corrections',
    'FeatureA: 3 corrections',  // same feature again
    'FeatureB: 1 corrections',
  ];
  assert(countDistinctFeatures(examples) === 2, `expected 2 distinct, got ${countDistinctFeatures(examples)}`);
});

test('countDistinctFeatures — all same feature returns 1', () => {
  const examples = [
    'FeatureA @ 2026-01-01',
    'FeatureA @ 2026-01-02',
    'FeatureA @ 2026-01-03',
  ];
  assert(countDistinctFeatures(examples) === 1, `expected 1 distinct, got ${countDistinctFeatures(examples)}`);
});

test('countDistinctFeatures — three distinct features returns 3', () => {
  const examples = [
    'Alpha @ 2026-01-01',
    'Beta: score=45 (high)',
    'Gamma: 2 cycles',
  ];
  assert(countDistinctFeatures(examples) === 3, `expected 3 distinct, got ${countDistinctFeatures(examples)}`);
});

test('countDistinctFeatures — empty list returns 0', () => {
  assert(countDistinctFeatures([]) === 0, 'empty should return 0');
});

test('classifyPatternRisk — same feature 3×: demotes from low-risk to high-risk, not null', () => {
  // Before fix: examples.length === 3 >= 2 → low-risk
  // After fix:  countDistinctFeatures === 1 < 2 → fails low-risk, passes high-risk (count 4, freq 50%)
  const pattern = makePattern({
    count: 4,
    frequency: 0.50,
    examples: [
      'FeatureA @ 2026-01-01',
      'FeatureA @ 2026-01-02',
      'FeatureA @ 2026-01-03',
    ],
  });
  const result = classifyPatternRisk(pattern);
  assert(result !== null, 'should still propose (as high-risk, not null)');
  assert(result!.risk === 'high', `expected high-risk demotion, got ${result!.risk}`);
});

test('classifyPatternRisk — two distinct features qualifies as low-risk', () => {
  const pattern = makePattern({
    count: 3,
    frequency: 0.45,
    examples: [
      'FeatureA @ 2026-01-01',
      'FeatureA @ 2026-01-02',
      'FeatureB @ 2026-01-03',   // distinct second feature
    ],
  });
  const result = classifyPatternRisk(pattern);
  assert(result !== null, 'should propose');
  assert(result!.risk === 'low', `expected low-risk with 2 distinct features, got ${result!.risk}`);
});

// ─── Fix 3: minimum total-run threshold ──────────────────────────────────────

test('THRESHOLDS.minRunsForProposals is 10', () => {
  assert(THRESHOLDS.minRunsForProposals === 10, `expected 10, got ${THRESHOLDS.minRunsForProposals}`);
});

test('main — returns proposed:0 when totalRuns < minRunsForProposals (non-existent history file)', () => {
  // analyze() returns totalRuns:0 for a missing file; 0 < 10 must block proposals
  const result = main('/nonexistent-history-file-xyz.md', true, false, false);
  assert(result.proposed === 0, `expected 0 proposals below min-runs, got ${result.proposed}`);
  assert(result.undetectable === 0, 'no undetectable when no amendments are applied');
});



// ─── Regression detection ────────────────────────────────────────────────────

test('hasVerifiedInArchive — true when archive has verified entry for same patternId', () => {
  const archive = [makeAmendment({ status: 'verified', patternId: 'manual_correction_spike' })];
  assert(hasVerifiedInArchive('manual_correction_spike', archive), 'should detect verified in archive');
});

test('hasVerifiedInArchive — false when archive only has ineffective for that patternId', () => {
  const archive = [makeAmendment({ status: 'ineffective', patternId: 'manual_correction_spike' })];
  assert(!hasVerifiedInArchive('manual_correction_spike', archive), 'ineffective should not count as regression');
});

test('hasVerifiedInArchive — false when archive is empty', () => {
  assert(!hasVerifiedInArchive('manual_correction_spike', []), 'empty archive → no regression');
});

test('hasVerifiedInArchive — false when patternId differs', () => {
  const archive = [makeAmendment({ status: 'verified', patternId: 'some_other_pattern' })];
  assert(!hasVerifiedInArchive('manual_correction_spike', archive), 'different patternId → no regression');
});

// ─── Frontmatter regression field round-trip ──────────────────────────────────

test('serializeFrontmatter → parseFrontmatter — regression: true round-trip', () => {
  const fm: AmendmentFrontmatter = { ...makeAmendment({ regression: true }) };
  const serialized = serializeFrontmatter(fm);
  assert(serialized.includes('regression: true'), 'serialized should include regression: true');
  const parsed = parseFrontmatter(serialized + '\n\nbody');
  assert(parsed !== null, 'should parse');
  assert(parsed!.regression === true, `regression should be true, got ${parsed!.regression}`);
});

test('serializeFrontmatter — omits regression field when not set', () => {
  const fm: AmendmentFrontmatter = { ...makeAmendment() };
  delete fm.regression;
  const serialized = serializeFrontmatter(fm);
  assert(!serialized.includes('regression'), 'should not include regression field when not set');
});

// ─── Ground-truth signals ─────────────────────────────────────────────────────

test('PATTERN_GROUND_TRUTH — maps known patternIds', () => {
  assert(PATTERN_GROUND_TRUTH['b11_agent_a_fail'] === 'b11_a', 'b11_agent_a_fail → b11_a');
  assert(PATTERN_GROUND_TRUTH['manual_correction_spike'] === 'manualCorrections', 'manual_correction_spike → manualCorrections');
  assert(PATTERN_GROUND_TRUTH['high_friction_run'] === 'frictionScore', 'high_friction_run → frictionScore');
});

test('computeGroundTruth — returns null for unknown patternId', () => {
  const result = computeGroundTruth('unknown_pattern', 5, []);
  assert(result === null, 'unknown pattern should return null');
});

test('computeGroundTruth — computes numeric averages pre/post', () => {
  const kpis: RunKPIPartial[] = [
    { manualCorrections: 3 },
    { manualCorrections: 4 },
    { manualCorrections: 1 }, // applied at run 2
    { manualCorrections: 1 },
  ];
  const result = computeGroundTruth('manual_correction_spike', 2, kpis);
  assert(result !== null, 'should return result');
  assert(result!.preAvg === 3.5, `preAvg should be 3.5, got ${result!.preAvg}`);
  assert(result!.postAvg === 1, `postAvg should be 1, got ${result!.postAvg}`);
  assert(!result!.isBinary, 'manualCorrections should not be binary');
});

test('computeGroundTruth — computes binary pass rate pre/post for b11_a', () => {
  const kpis: RunKPIPartial[] = [
    { b11_a: 'fail' },
    { b11_a: 'fail' },
    { b11_a: 'pass' }, // applied at run 2
    { b11_a: 'pass' },
  ];
  const result = computeGroundTruth('b11_agent_a_fail', 2, kpis);
  assert(result !== null, 'should return result');
  assert(result!.preAvg === 0, `preAvg pass rate should be 0, got ${result!.preAvg}`);
  assert(result!.postAvg === 1, `postAvg pass rate should be 1, got ${result!.postAvg}`);
  assert(result!.isBinary, 'b11_a should be binary');
});

test('computeGroundTruth — handles empty post-window', () => {
  const kpis: RunKPIPartial[] = [
    { manualCorrections: 2 },
    { manualCorrections: 3 },
  ];
  const result = computeGroundTruth('manual_correction_spike', 5, kpis); // appliedAtRun beyond all data
  assert(result !== null, 'should return result');
  assert(result!.postAvg === null, `postAvg should be null when no post data, got ${result!.postAvg}`);
});

// ─── readTotalRunsFromKpi ─────────────────────────────────────────────────────

test('readTotalRunsFromKpi — returns 0 for nonexistent file', () => {
  const count = readTotalRunsFromKpi('/nonexistent-kpi-file-xyz.jsonl');
  assert(count === 0, `expected 0 for missing file, got ${count}`);
});

// ─── markApplied (dry-run, no file I/O) ──────────────────────────────────────

test('markApplied — returns false when amendment not found (dryRun)', () => {
  const ok = markApplied('AME-9999-99-99-999', 5, true);
  assert(ok === false, 'should return false for nonexistent amendment');
});

// ─── Archive (readArchive with no dir) ───────────────────────────────────────

test('readArchive — returns empty array when archive dir does not exist', () => {
  // The archive dir may or may not exist; this just must not throw
  const result = readArchive();
  assert(Array.isArray(result), 'should return an array');
});


console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
