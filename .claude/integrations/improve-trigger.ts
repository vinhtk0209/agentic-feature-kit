#!/usr/bin/env node
/**
 * improve-trigger.ts — Collect → Analyze → Decide → Act → Verify
 *
 * Reads feedback history, applies thresholds, and writes amendment proposals
 * to docs/specs/.amendments/. On each run, also verifies applied amendments
 * by comparing post-amendment pattern frequency against the pre-amendment
 * baseline (≥30% relative drop → verified; timeout → ineffective).
 *
 * Usage:
 *   npx tsx .claude/integrations/improve-trigger.ts
 *   npx tsx .claude/integrations/improve-trigger.ts --dry-run
 *   npx tsx .claude/integrations/improve-trigger.ts --status
 *   npx tsx .claude/integrations/improve-trigger.ts --bootstrap  (print applicable amendments)
 *   npx tsx .claude/integrations/improve-trigger.ts --history-file path/to/file.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { analyze } from './feedback-analyzer';
import type { Pattern, AnalysisResult } from './feedback-analyzer';
import { applyLearnedKnob, revertLearnedKnob } from './learned-config';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AmendmentStatus =
  | 'proposed'
  | 'approved'
  | 'applied'
  | 'verified'
  | 'rolled_back'
  | 'ineffective';

export type AmendmentRisk = 'low' | 'high';
export type AmendmentActionType = 'prompt_patch' | 'gate_addition' | 'test_addition';

export interface AmendmentFrontmatter {
  id: string;
  triggeredBy: string[];
  patternId: string;
  patternCount: number;
  patternFrequency: number;
  evidenceFeatures: string[];
  risk: AmendmentRisk;
  actionType: AmendmentActionType;
  targetSection: string;
  status: AmendmentStatus;
  proposedAt: string;
  verifyAfterNRuns: number;
  preAmendmentFrequency: number;
  preAmendmentTotalRuns?: number;
  appliedAtRun?: number;
  regression?: boolean;
}

export interface Amendment extends AmendmentFrontmatter {
  filePath: string;
  proposalText: string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  lowRisk: { minCount: 3, minFrequency: 0.40, minDistinctFeatures: 2 },
  highRisk: { minCount: 2, minFrequency: 0.30 },
  verifyRelativeDrop: 0.30,     // ≥30% relative frequency drop → verified
  ineffectiveBuffer: 2,          // grace runs after verifyAfterNRuns before marking ineffective
  deadManIneffective: 10,        // halt auto-proposals at this many ineffective amendments
  minRunsForProposals: 10,       // require ≥10 runs before any amendment is proposed
} as const;

// ─── Frontmatter helpers ─────────────────────────────────────────────────────

export function serializeFrontmatter(fm: AmendmentFrontmatter): string {
  const lines = [
    '---',
    `id: ${fm.id}`,
    `triggered_by: [${fm.triggeredBy.join(', ')}]`,
    `pattern_id: ${fm.patternId}`,
    `pattern_count: ${fm.patternCount}`,
    `pattern_frequency: ${fm.patternFrequency.toFixed(2)}`,
    `evidence_features: [${fm.evidenceFeatures.map((f) => `"${f}"`).join(', ')}]`,
    `risk: ${fm.risk}`,
    `action_type: ${fm.actionType}`,
    `target_section: "${fm.targetSection}"`,
    `status: ${fm.status}`,
    `proposed_at: ${fm.proposedAt}`,
    `verify_after_n_runs: ${fm.verifyAfterNRuns}`,
    `pre_amendment_frequency: ${fm.preAmendmentFrequency.toFixed(2)}`,
  ];
  if (fm.preAmendmentTotalRuns !== undefined) {
    lines.push(`pre_amendment_total_runs: ${fm.preAmendmentTotalRuns}`);
  }
  if (fm.appliedAtRun !== undefined) {
    lines.push(`applied_at_run: ${fm.appliedAtRun}`);
  }
  if (fm.regression) {
    lines.push(`regression: true`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function parseFrontmatter(content: string): AmendmentFrontmatter | null {
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return null;

  const get = (key: string): string => {
    const m = match[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const getNum = (key: string): number | undefined => {
    const v = get(key);
    return v ? parseFloat(v) : undefined;
  };

  const getList = (key: string): string[] => {
    const v = get(key);
    if (!v || v === '[]') return [];
    return v
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  };

  const id = get('id');
  if (!id) return null;

  const numRaw = (k: string, fallback: number): number => {
    const n = getNum(k);
    return n !== undefined ? n : fallback;
  };

  return {
    id,
    triggeredBy: getList('triggered_by'),
    patternId: get('pattern_id'),
    patternCount: Math.round(numRaw('pattern_count', 0)),
    patternFrequency: numRaw('pattern_frequency', 0),
    evidenceFeatures: getList('evidence_features'),
    risk: (get('risk') as AmendmentRisk) || 'high',
    actionType: (get('action_type') as AmendmentActionType) || 'prompt_patch',
    targetSection: get('target_section').replace(/^"|"$/g, ''),
    status: (get('status') as AmendmentStatus) || 'proposed',
    proposedAt: get('proposed_at'),
    verifyAfterNRuns: Math.round(numRaw('verify_after_n_runs', 5)),
    preAmendmentFrequency: numRaw('pre_amendment_frequency', 0),
    preAmendmentTotalRuns: getNum('pre_amendment_total_runs'),
    appliedAtRun: (() => { const n = getNum('applied_at_run'); return n !== undefined ? Math.round(n) : undefined; })(),
    regression: get('regression') === 'true' ? true : undefined,
  };
}

// ─── Amendment reader ─────────────────────────────────────────────────────────

function amendmentsDir(): string {
  return path.join(process.cwd(), 'docs', 'specs', '.amendments');
}

function archiveDir(): string {
  return path.join(amendmentsDir(), 'archive');
}

function readAmendmentsFromDir(dir: string): Amendment[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const amendments: Amendment[] = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fm = parseFrontmatter(content);
    if (!fm) continue;
    const bodyMatch = content.match(/^---\n[\s\S]+?\n---\n([\s\S]*)$/);
    amendments.push({ ...fm, filePath, proposalText: bodyMatch ? bodyMatch[1].trim() : '' });
  }
  return amendments;
}

export function readAmendments(): Amendment[] {
  return readAmendmentsFromDir(amendmentsDir());
}

export function readArchive(): Amendment[] {
  return readAmendmentsFromDir(archiveDir());
}

// ─── Amendment ID ─────────────────────────────────────────────────────────────

export function makeAmendmentId(existing: Amendment[], pendingThisRun: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount =
    existing.filter((a) => a.id.startsWith(`AME-${today}-`)).length +
    pendingThisRun +
    1;
  return `AME-${today}-${String(todayCount).padStart(3, '0')}`;
}

// ─── Decision engine ──────────────────────────────────────────────────────────

/**
 * Count distinct feature names from pattern examples.
 * Examples are formatted as "FeatureName @ date" or "FeatureName: detail".
 * pattern.examples.length is NOT a valid proxy — a single feature can
 * appear 3 times and fill all 3 example slots.
 */
export function countDistinctFeatures(examples: string[]): number {
  const names = new Set<string>();
  for (const ex of examples) {
    const match = ex.match(/^(.+?)(?:\s+@|\s*:\s)/);
    names.add(match ? match[1].trim() : ex.trim());
  }
  return names.size;
}

export function classifyPatternRisk(
  pattern: Pattern
): { propose: boolean; risk: AmendmentRisk } | null {
  const distinctFeatures = countDistinctFeatures(pattern.examples);

  if (
    pattern.count >= THRESHOLDS.lowRisk.minCount &&
    pattern.frequency >= THRESHOLDS.lowRisk.minFrequency &&
    distinctFeatures >= THRESHOLDS.lowRisk.minDistinctFeatures
  ) {
    return { propose: true, risk: 'low' };
  }

  if (
    pattern.count >= THRESHOLDS.highRisk.minCount &&
    pattern.frequency >= THRESHOLDS.highRisk.minFrequency
  ) {
    return { propose: true, risk: 'high' };
  }

  return null;
}

function inferActionType(patternId: string): AmendmentActionType {
  const gatePatterns = [
    'b11_agent_a_fail',
    'b11_agent_b_fail',
    'b9_6_install_fail',
    'user_loading_state',
    'user_error_state',
  ];
  const testPatterns = ['manual_correction_spike', 'spec_ambiguity_cluster'];
  if (gatePatterns.includes(patternId)) return 'gate_addition';
  if (testPatterns.includes(patternId)) return 'test_addition';
  return 'prompt_patch';
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/**
 * Extract B-step tokens from a target_section string.
 * "B5 + B10 — Spec clarity" → {B5, B10}; "B6.5 — Design Review" → {B6.5}.
 * Decimal sub-steps (B6.5, B8.6, B9.6) are kept whole — B6.5 ≠ B6.
 */
export function extractStepTokens(section: string): Set<string> {
  const tokens = section.match(/\bB\d+(?:\.\d+)?\b/g) ?? [];
  return new Set(tokens.map((t) => t.toUpperCase()));
}

/**
 * Two target sections conflict when they touch the same workflow step.
 * Replaces exact string comparison (so "B5" and "B5 + B10" now conflict).
 * When BOTH sections carry B-step tokens, they overlap iff the token sets
 * intersect. When a section has NO B-token (e.g. "★3 SELF-EVALUATE",
 * "HARD RULES"), fall back to a normalized exact-string match so those
 * non-step targets still behave as before.
 */
export function sectionsOverlap(a: string, b: string): boolean {
  const ta = extractStepTokens(a);
  const tb = extractStepTokens(b);
  if (ta.size > 0 && tb.size > 0) {
    for (const t of ta) if (tb.has(t)) return true;
    return false;
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

export function hasSectionConflict(
  newSection: string,
  existing: Amendment[]
): boolean {
  return existing
    .filter((a) =>
      a.status === 'proposed' ||
      a.status === 'approved' ||
      a.status === 'applied'
    )
    .some((a) => sectionsOverlap(a.targetSection, newSection));
}

// ─── Proposal text ────────────────────────────────────────────────────────────

function buildProposalText(
  pattern: Pattern,
  risk: AmendmentRisk,
  totalRuns: number,
  isRegression = false
): string {
  const pct = Math.round(pattern.frequency * 100);
  const targetSection = pattern.proposal?.section ?? 'workflow prompt';
  const proposedChange =
    pattern.proposal?.summary ??
    `Address recurring pattern "${pattern.id}" (${pct}% of runs).`;

  return [
    `## Amendment: ${pattern.id}`,
    '',
    isRegression ? `> ⚠️ **REGRESSION**: This pattern was previously verified as fixed but has recurred. Forced high-risk.` : '',
    isRegression ? '' : '',
    `**Pattern:** ${pattern.description}`,
    `**Frequency:** ${pct}% (${pattern.count}/${totalRuns} runs)`,
    `**Risk:** ${risk}`,
    `**Watch steps:** ${pattern.watch_steps.join(', ') || 'none'}`,
    '',
    `### Evidence`,
    '',
    ...pattern.examples.slice(0, 3).map((ex) => `- ${ex}`),
    '',
    `### Proposed Change`,
    '',
    `**Target section:** ${targetSection}`,
    '',
    proposedChange,
    '',
    `### Expected Effect`,
    '',
    `Reduce \`${pattern.id}\` frequency from ${pct}% to <${Math.round(pct * 0.6)}%.`,
    '',
    `### Verification`,
    '',
    `After this amendment is applied, run 5 more features through the workflow.`,
    `If frequency drops by ≥30% relative to baseline (${pct}%), status → \`verified\`. Otherwise → \`ineffective\`.`,
    '',
    `### How to Apply`,
    '',
    risk === 'low'
      ? `This is a **low-risk** amendment. The SESSION BOOTSTRAP reads it at B0 and applies the described behavior change automatically. No manual action required unless you want to reject it (\`status: rolled_back\`).`
      : `This is a **high-risk** amendment. Review the proposed change above, then set \`status: approved\` to enable auto-application at SESSION BOOTSTRAP.`,
  ].join('\n');
}

// ─── Status update ────────────────────────────────────────────────────────────

function updateAmendmentStatus(amendment: Amendment, newStatus: AmendmentStatus): void {
  const content = fs.readFileSync(amendment.filePath, 'utf-8');
  const updated = content.replace(/^status: \w+$/m, `status: ${newStatus}`);
  if (newStatus === 'verified' || newStatus === 'ineffective') {
    const archDir = archiveDir();
    fs.mkdirSync(archDir, { recursive: true });
    fs.writeFileSync(path.join(archDir, path.basename(amendment.filePath)), updated, 'utf-8');
    fs.unlinkSync(amendment.filePath);
  } else {
    fs.writeFileSync(amendment.filePath, updated, 'utf-8');
  }
}

// ─── Verification pass ────────────────────────────────────────────────────────

export function verifyAmendments(
  amendments: Amendment[],
  result: AnalysisResult,
  currentRun: number,
  dryRun: boolean,
  kpis: RunKPIPartial[] = []
): { verified: string[]; ineffective: string[]; undetectable: string[] } {
  const verified: string[] = [];
  const ineffective: string[] = [];
  const undetectable: string[] = [];
  // Run-count timing MUST come from the monotonic, never-trimmed KPI history
  // (currentRun = readTotalRunsFromKpi), NOT result.totalRuns. The latter is
  // derived from .feedback-history.md, which b12-logger trims to MAX_ENTRIES.
  // appliedAtRun is also recorded from the KPI count (markApplied), so both
  // sides of `runsSinceApplied` now share one scale. Mixing the two froze
  // verification permanently once KPI history grew past the feedback window
  // (runsSinceApplied went to ≤2 / negative → never reached verifyAfterNRuns).
  // Frequency comparison still uses result.patterns (recent-window frequency).
  const totalRuns = currentRun;

  for (const amendment of amendments) {
    if (amendment.status !== 'applied') continue;
    if (amendment.appliedAtRun === undefined) continue;

    const runsSinceApplied = totalRuns - amendment.appliedAtRun;
    const verifyAt = amendment.verifyAfterNRuns;
    const cutoff = verifyAt + THRESHOLDS.ineffectiveBuffer;

    if (runsSinceApplied < verifyAt) continue;

    const currentPattern = result.patterns.find((p) => p.id === amendment.patternId);
    if (!currentPattern) {
      // Pattern no longer detectable — analyzer may have renamed or removed it.
      // Do NOT treat as 0% frequency (would produce a spurious "verified" result).
      // Skip this cycle; human must investigate before this amendment can resolve.
      undetectable.push(amendment.id);
      continue;
    }

    const currentFreq = currentPattern.frequency;
    const preFreq = amendment.preAmendmentFrequency;
    const relDrop = preFreq > 0 ? (preFreq - currentFreq) / preFreq : 0;
    const freqDropOK = relDrop >= THRESHOLDS.verifyRelativeDrop;

    // Cross-check the self-reported frequency drop against an INDEPENDENT signal.
    // Only machine-measured KPI fields (MACHINE_MEASURED — b11 verdicts) count as
    // independent. Self-reported friction counts are derived from the same data the
    // model authors, so treating them as ground truth would be circular: for those,
    // gtImproved stays null → frequency-only (provisional) verification. When a
    // machine signal says the metric did NOT improve (false), we withhold verified
    // even on a big frequency drop, and let the cutoff route it to ineffective.
    const gtField = PATTERN_GROUND_TRUTH[amendment.patternId];
    const independent = gtField !== undefined && MACHINE_MEASURED.has(gtField);
    const gtImproved = independent
      ? groundTruthImproved(computeGroundTruth(amendment.patternId, amendment.appliedAtRun, kpis))
      : null;

    if (freqDropOK && gtImproved !== false) {
      if (!dryRun) {
        updateAmendmentStatus(amendment, 'verified');
        // ACT: promote the verified pattern into the persisted, machine-read config.
        // This is the deterministic, strengthen-only change that outlives the run —
        // not the soft per-run advisory. clampStrengthen guarantees it can only tighten.
        const act = applyLearnedKnob(amendment.patternId, amendment.id);
        if (act.applied && act.changed) console.log(`   ⚙️  Learned config updated: ${act.note}`);
      }
      verified.push(amendment.id);
    } else if (runsSinceApplied >= cutoff) {
      if (!dryRun) updateAmendmentStatus(amendment, 'ineffective');
      ineffective.push(amendment.id);
    }
  }

  return { verified, ineffective, undetectable };
}

// ─── Dead-man switch ──────────────────────────────────────────────────────────

export function isDeadManTripped(amendments: Amendment[]): boolean {
  return (
    amendments.filter((a) => a.status === 'ineffective').length >=
    THRESHOLDS.deadManIneffective
  );
}

// ─── Regression detection ─────────────────────────────────────────────────────

export function hasVerifiedInArchive(patternId: string, archive: Amendment[]): boolean {
  return archive.some((a) => a.patternId === patternId && a.status === 'verified');
}

// ─── Ground-truth signals ─────────────────────────────────────────────────────

export interface RunKPIPartial {
  timestamp?: string;
  b11_a?: string;
  b11_b?: string;
  frictionScore?: number;
  manualCorrections?: number;
  clarificationCycles?: number;
  gateRevisions?: number;
  recoveries?: number;
  rePlans?: number;
  implementationRetries?: number;
  verificationRetries?: number;
}

// Independent (machine-recorded) signal for each amendable pattern.
// CONTRACT: keys MUST be pattern IDs emitted by feedback-analyzer.detectPatterns()
// — a key that no detector produces can never match a real amendment, so it is
// dead weight and masks drift. Values MUST be keys of RunKPIPartial. When a
// pattern has no entry here, verification falls back to self-reported frequency.
export const PATTERN_GROUND_TRUTH: Partial<Record<string, keyof RunKPIPartial>> = {
  b11_agent_a_fail: 'b11_a',
  b11_agent_b_fail: 'b11_b',
  high_friction_run: 'frictionScore',
  manual_correction_spike: 'manualCorrections',
  spec_ambiguity_cluster: 'clarificationCycles',
  gate_revision: 'gateRevisions',
  high_recovery_count: 'recoveries',
};

// Fields recorded by a MACHINE (b11-runner's type/lint/Playwright verdicts), not the
// model. ONLY these provide independent confirmation in verifyAmendments. The other
// KPI fields are self-reported friction counts, derived from the same data the model
// authors — treating them as "ground truth" would be circular, so they fall back to
// frequency-only (provisional) verification.
export const MACHINE_MEASURED: Set<keyof RunKPIPartial> = new Set(['b11_a', 'b11_b']);

export function readKpiHistory(kpiFile: string): RunKPIPartial[] {
  if (!fs.existsSync(kpiFile)) return [];
  return fs.readFileSync(kpiFile, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => { try { return JSON.parse(l) as RunKPIPartial; } catch { return null; } })
    .filter((x): x is RunKPIPartial => x !== null);
}

export function readTotalRunsFromKpi(kpiFile: string): number {
  return readKpiHistory(kpiFile).length;
}

export interface GroundTruthResult {
  field: string;
  preAvg: number | null;
  postAvg: number | null;
  isBinary: boolean;
}

export function computeGroundTruth(
  patternId: string,
  appliedAtRun: number,
  kpis: RunKPIPartial[]
): GroundTruthResult | null {
  const field = PATTERN_GROUND_TRUTH[patternId];
  if (!field) return null;

  const isBinary = field === 'b11_a' || field === 'b11_b';
  const preWindow = kpis.slice(0, appliedAtRun);
  const postWindow = kpis.slice(appliedAtRun);

  const avgField = (arr: RunKPIPartial[]): number | null => {
    const vals = arr.map((r) => r[field]).filter((v) => v !== undefined && v !== null);
    if (vals.length === 0) return null;
    if (isBinary) {
      const pass = vals.filter((v) => v === 'pass').length;
      return pass / vals.length;
    }
    const nums = vals.map(Number).filter((n) => !isNaN(n));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  return { field: String(field), preAvg: avgField(preWindow), postAvg: avgField(postWindow), isBinary };
}

/**
 * Reduce a ground-truth comparison to a verdict the verifier can gate on:
 *   true  → the independent KPI metric improved after the amendment
 *   false → it did NOT improve (or got worse) — contradicts a self-reported fix
 *   null  → no independent signal available (no mapping, or empty pre/post window)
 *
 * Binary fields (b11_a/b11_b) are pass rates → higher is better.
 * Numeric fields (friction, corrections, cycles, recoveries) are counts → lower is better.
 */
export function groundTruthImproved(gt: GroundTruthResult | null): boolean | null {
  if (!gt || gt.preAvg === null || gt.postAvg === null) return null;
  return gt.isBinary ? gt.postAvg > gt.preAvg : gt.postAvg < gt.preAvg;
}

// ─── Mark applied ─────────────────────────────────────────────────────────────

export function markApplied(
  amendmentId: string,
  totalRuns: number,
  dryRun: boolean
): boolean {
  const dir = amendmentsDir();
  if (!fs.existsSync(dir)) return false;

  const file = fs.readdirSync(dir).find((f) => f === `${amendmentId}.md`);
  if (!file) return false;

  const filePath = path.join(dir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm) return false;

  const updated: AmendmentFrontmatter = { ...fm, status: 'applied', appliedAtRun: totalRuns };
  const newFrontmatter = serializeFrontmatter(updated);
  const bodyMatch = content.match(/^---\n[\s\S]+?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : '';
  const newContent = newFrontmatter + '\n\n' + body;

  if (!dryRun) fs.writeFileSync(filePath, newContent, 'utf-8');
  return true;
}

// ─── Bootstrap printer ────────────────────────────────────────────────────────

function printBootstrap(amendments: Amendment[]): void {
  const applicable = amendments.filter(
    (a) =>
      a.status === 'approved' ||
      (a.status === 'proposed' && a.risk === 'low')
  );

  if (applicable.length === 0) {
    console.log('<!-- No amendments to apply at SESSION BOOTSTRAP -->');
    return;
  }

  console.log('<!-- SESSION BOOTSTRAP: Apply the following amendments at B0 -->');
  console.log('<!-- Log applied IDs in recovery.log before proceeding to B1 -->\n');
  for (const a of applicable) {
    const riskTag = a.risk === 'low' ? '🟢 auto-apply' : '🔵 approved';
    console.log(`[${a.id}] ${riskTag} — ${a.patternId} (${Math.round(a.patternFrequency * 100)}%)`);
    console.log(`Target: ${a.targetSection}`);
    console.log(a.proposalText.split('\n').slice(0, 5).join('\n'));
    console.log('');
  }
}

// ─── Status printer ───────────────────────────────────────────────────────────

function printStatus(amendments: Amendment[], archive: Amendment[], kpiFile: string): void {
  if (amendments.length === 0 && archive.length === 0) {
    console.log('No amendments. Run a feature to populate docs/specs/.amendments/.');
    return;
  }

  const all = [...amendments, ...archive];
  const byStatus = new Map<AmendmentStatus, Amendment[]>();
  for (const a of all) {
    const list = byStatus.get(a.status) ?? [];
    list.push(a);
    byStatus.set(a.status, list);
  }

  const badge: Record<AmendmentStatus, string> = {
    proposed: '🟡',
    approved: '🟢',
    applied: '🔵',
    verified: '✅',
    ineffective: '💀',
    rolled_back: '🔙',
  };

  console.log('\n📋 Amendment Status\n');
  const order: AmendmentStatus[] = [
    'proposed',
    'approved',
    'applied',
    'verified',
    'ineffective',
    'rolled_back',
  ];

  const kpis = readKpiHistory(kpiFile);

  for (const status of order) {
    const list = byStatus.get(status) ?? [];
    if (list.length === 0) continue;
    const archiveNote = (status === 'verified' || status === 'ineffective') ? ' [archived]' : '';
    console.log(`${badge[status]} ${status.toUpperCase()} (${list.length})${archiveNote}`);
    for (const a of list) {
      const regressionNote = a.regression ? ' ⚠️ REGRESSION' : '';
      console.log(
        `   ${a.id} — ${a.patternId} (${Math.round(a.patternFrequency * 100)}%) [${a.risk}]${regressionNote}`
      );
      if (status === 'applied' && a.appliedAtRun !== undefined) {
        const gt = computeGroundTruth(a.patternId, a.appliedAtRun, kpis);
        if (gt) {
          const fmt = (v: number | null) => v === null ? 'n/a' : gt.isBinary ? `${Math.round(v * 100)}%` : v.toFixed(1);
          const arrow = gt.preAvg !== null && gt.postAvg !== null
            ? (gt.isBinary
                ? (gt.postAvg > gt.preAvg ? '📈' : '📉')
                : (gt.postAvg < gt.preAvg ? '📉 ✓' : '📈 ✗'))
            : '';
          console.log(
            `      ground-truth [${gt.field}]: pre=${fmt(gt.preAvg)} → post=${fmt(gt.postAvg)} ${arrow}`
          );
        }
      }
    }
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function main(
  historyFile: string,
  dryRun: boolean,
  statusMode: boolean,
  bootstrapMode: boolean
): { proposed: number; verified: number; ineffective: number; undetectable: number } {
  const amendments = readAmendments();
  const archive = readArchive();
  const kpiFile = path.join(process.cwd(), 'docs', 'specs', '.kpi-history.jsonl');

  if (statusMode) {
    printStatus(amendments, archive, kpiFile);
    return { proposed: 0, verified: 0, ineffective: 0, undetectable: 0 };
  }

  if (bootstrapMode) {
    printBootstrap(amendments);
    return { proposed: 0, verified: 0, ineffective: 0, undetectable: 0 };
  }

  const result = analyze(historyFile);

  // 1. Verification pass (uses stale amendments before any status updates).
  //    Timing is measured against the monotonic KPI run count, not the trimmed
  //    feedback window — see verifyAmendments. appliedAtRun is set from the same
  //    KPI count in markApplied, so the two stay on one scale. The same KPI
  //    history supplies the independent ground-truth cross-check.
  const kpis = readKpiHistory(kpiFile);
  const currentRun = kpis.length;
  const { verified, ineffective, undetectable } = verifyAmendments(amendments, result, currentRun, dryRun, kpis);
  if (verified.length > 0) console.log(`✅ Verified: ${verified.join(', ')}`);
  if (ineffective.length > 0) console.log(`⚠️  Ineffective: ${ineffective.join(', ')}`);
  if (undetectable.length > 0) {
    console.log(`🔍 Undetectable (pattern renamed/removed — skipped): ${undetectable.join(', ')}`);
  }

  // Re-read after verification status updates (archive may have gained files)
  const current = dryRun ? amendments : readAmendments();
  const currentArchive = dryRun ? archive : readArchive();

  // Config rollback: retract the learned knob of any amendment a human marked
  // rolled_back. revertLearnedKnob is idempotent (no active entry → no-op), so
  // this is safe to run every cycle. (`ineffective` amendments were never verified,
  // so their knob was never promoted — nothing to revert there.)
  for (const a of [...current, ...currentArchive]) {
    if (a.status === 'rolled_back') {
      const r = revertLearnedKnob(a.id, dryRun);
      if (r.reverted && r.changed) console.log(`↩️  Reverted learned config from rolled-back ${a.id}: ${r.note}`);
    }
  }

  // 2. Dead-man switch
  if (isDeadManTripped(current)) {
    console.error(
      `🚨 Dead-man switch: ${THRESHOLDS.deadManIneffective} ineffective amendments. ` +
        'Auto-proposals halted. Review docs/specs/.amendments/ before continuing.'
    );
    return { proposed: 0, verified: verified.length, ineffective: ineffective.length, undetectable: undetectable.length };
  }

  // 3. Decision pass — require minimum run count before proposing anything
  if (result.totalRuns < THRESHOLDS.minRunsForProposals) {
    if (result.totalRuns > 0) {
      console.log(
        `⏳ Not enough data: ${result.totalRuns}/${THRESHOLDS.minRunsForProposals} runs ` +
          'required before amendment proposals are generated.'
      );
    }
    return { proposed: 0, verified: verified.length, ineffective: ineffective.length, undetectable: undetectable.length };
  }

  const activePatternIds = new Set(
    current
      .filter((a) => a.status !== 'ineffective' && a.status !== 'rolled_back')
      .map((a) => a.patternId)
  );

  const dir = amendmentsDir();
  let pendingThisRun = 0;

  for (const pattern of result.patterns) {
    if (activePatternIds.has(pattern.id)) continue;

    const decision = classifyPatternRisk(pattern);
    if (!decision) continue;

    const targetSection = pattern.proposal?.section ?? 'workflow prompt';
    if (hasSectionConflict(targetSection, current)) continue;

    // Regression detection: previously verified → force high risk
    const isRegression = hasVerifiedInArchive(pattern.id, currentArchive);
    const effectiveRisk: AmendmentRisk = isRegression ? 'high' : decision.risk;

    // A recurrence proves the previously-verified fix (and the config knob it
    // promoted) did not hold. Retract that stale knob so the new high-risk
    // amendment can re-establish it cleanly only if it verifies again.
    if (isRegression) {
      for (const old of currentArchive.filter((a) => a.patternId === pattern.id && a.status === 'verified')) {
        const r = revertLearnedKnob(old.id, dryRun);
        if (r.reverted && r.changed) console.log(`↩️  Regression on ${pattern.id}: reverted stale learned config from ${old.id}`);
      }
    }

    const id = makeAmendmentId(current, pendingThisRun);
    const fm: AmendmentFrontmatter = {
      id,
      triggeredBy: [pattern.id],
      patternId: pattern.id,
      patternCount: pattern.count,
      patternFrequency: pattern.frequency,
      evidenceFeatures: pattern.examples.slice(0, 5),
      risk: effectiveRisk,
      actionType: inferActionType(pattern.id),
      targetSection,
      status: 'proposed',
      proposedAt: new Date().toISOString().slice(0, 10),
      verifyAfterNRuns: 5,
      preAmendmentFrequency: pattern.frequency,
      preAmendmentTotalRuns: result.totalRuns,
      regression: isRegression || undefined,
    };

    const body = buildProposalText(pattern, effectiveRisk, result.totalRuns, isRegression);
    const fileContent = serializeFrontmatter(fm) + '\n\n' + body + '\n';

    if (!dryRun) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.md`), fileContent, 'utf-8');
    }

    const riskBadge = effectiveRisk === 'low' ? '🟢' : isRegression ? '🔴 ⚠️ REGRESSION' : '🔴';
    console.log(
      `${riskBadge} [${effectiveRisk.toUpperCase()}] Amendment proposed: ${id} — ${pattern.id} ` +
        `(${Math.round(pattern.frequency * 100)}%)`
    );
    pendingThisRun++;
  }

  return { proposed: pendingThisRun, verified: verified.length, ineffective: ineffective.length, undetectable: undetectable.length };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('improve-trigger') && !process.argv[1].includes('.test.')) {
  const cliArgs = process.argv.slice(2);
  const histIdx = cliArgs.indexOf('--history-file');
  const historyFile =
    histIdx >= 0
      ? cliArgs[histIdx + 1]
      : path.join(process.cwd(), 'docs', 'specs', '.feedback-history.md');

  const dryRun = cliArgs.includes('--dry-run');
  const statusMode = cliArgs.includes('--status');
  const bootstrapMode = cliArgs.includes('--bootstrap');

  const markIdx = cliArgs.indexOf('--mark-applied');
  if (markIdx >= 0) {
    const amendmentId = cliArgs[markIdx + 1];
    if (!amendmentId || amendmentId.startsWith('--')) {
      console.error('Usage: --mark-applied <AME-ID>');
      process.exit(1);
    }
    const kpiFile = path.join(process.cwd(), 'docs', 'specs', '.kpi-history.jsonl');
    const totalRuns = readTotalRunsFromKpi(kpiFile);
    const ok = markApplied(amendmentId, totalRuns, dryRun);
    if (ok) {
      console.log(JSON.stringify({ ok: true, amendmentId, appliedAtRun: totalRuns }));
    } else {
      console.error(`Amendment not found in active amendments: ${amendmentId}`);
      process.exit(1);
    }
    process.exit(0);
  }

  const result = main(historyFile, dryRun, statusMode, bootstrapMode);
  if (!statusMode && !bootstrapMode) {
    console.log(JSON.stringify({ ok: true, ...result }));
  }
}
