#!/usr/bin/env node
/**
 * feedback-analyzer.ts — Level 8: Pattern clustering for ★6 LEARN
 *
 * Reads docs/specs/.feedback-history.md, clusters failure patterns
 * by type and frequency, and outputs structured JSON.
 *
 * Usage:
 *   npx tsx .claude/integrations/feedback-analyzer.ts
 *   npx tsx .claude/integrations/feedback-analyzer.ts --history-file path/to/file.md
 *   npx tsx .claude/integrations/feedback-analyzer.ts --summary   (human-readable)
 *   npx tsx .claude/integrations/feedback-analyzer.ts --classify-friction  (per-run breakdown)
 */

import fs from 'fs';
import path from 'path';
import {
  CliReliabilityError,
  classifyFileReadError,
  emitCliError,
  parseStrictFlags,
} from './cli-reliability';

// ─── Friction Types ──────────────────────────────────────────────────────────

export interface FrictionMetrics {
  clarificationCycles: number;   // ×5  — back-and-forth with user to clarify spec
  gateRevisions: number;         // ×10 — gate output revised before approval
  recoveries: number;            // ×3  — self-recover attempts
  manualCorrections: number;     // ×15 — user had to manually correct generated output
  rePlans: number;               // ×8  — had to redo the design/plan phase
  implementationRetries: number; // ×7  — had to retry an implementation step
  verificationRetries: number;   // ×5  — had to retry a verification step
}

export type FrictionLevel = 'smooth' | 'minor' | 'moderate' | 'high' | 'failed';

const FRICTION_WEIGHTS: Record<keyof FrictionMetrics, number> = {
  manualCorrections: 15,
  gateRevisions: 10,
  rePlans: 8,
  implementationRetries: 7,
  clarificationCycles: 5,
  verificationRetries: 5,
  recoveries: 3,
};

export function computeFrictionScore(m: FrictionMetrics): number {
  const raw = (Object.keys(FRICTION_WEIGHTS) as Array<keyof FrictionMetrics>).reduce(
    (sum, key) => sum + (m[key] ?? 0) * FRICTION_WEIGHTS[key],
    0,
  );
  return Math.min(100, raw);
}

export function classifyFriction(score: number): FrictionLevel {
  if (score === 0) return 'smooth';
  if (score <= 12) return 'minor';
  if (score <= 28) return 'moderate';
  if (score <= 55) return 'high';
  return 'failed';
}

// ─── Root Cause Taxonomy ─────────────────────────────────────────────────────

export type RootCauseCategory =
  | 'req_ambiguity'         // spec/requirements unclear or contradictory
  | 'br_ambiguity'          // business rule poorly specified
  | 'ui_ambiguity'          // UI/UX details missing or conflicting
  | 'api_uncertainty'       // backend contract unknown or inconsistent
  | 'contract_drift'        // API changed after spec was written
  | 'ownership_confusion'   // unclear who owns part of the feature
  | 'missing_project_knowledge' // workflow didn't know something about the project
  | 'missing_validation'    // a gate should have caught this earlier
  | 'hallucination'         // model fabricated an incorrect implementation detail
  | 'workflow_design_flaw'; // the workflow process itself caused the problem

export interface RootCauseSummary {
  category: RootCauseCategory;
  count: number;
  frequency: number;
  examples: string[];
}

// Heuristic mapping from patterns → most likely root causes
const PATTERN_ROOT_CAUSES: Record<string, RootCauseCategory[]> = {
  b11_agent_a_fail:        ['missing_validation', 'hallucination'],
  b11_agent_b_fail:        ['ui_ambiguity', 'missing_validation'],
  design_cycleback:        ['ui_ambiguity', 'missing_project_knowledge'],
  low_reflection_score:    ['req_ambiguity', 'hallucination'],
  high_recovery_count:     ['req_ambiguity', 'workflow_design_flaw'],
  gate_revision:           ['req_ambiguity', 'br_ambiguity'],
  user_loading_state:      ['ui_ambiguity', 'missing_validation'],
  user_steps_vague:        ['req_ambiguity', 'workflow_design_flaw'],
  user_error_state:        ['ui_ambiguity', 'missing_validation'],
  user_wrong_component:    ['missing_project_knowledge', 'ui_ambiguity'],
  b9_6_install_fail:       ['missing_project_knowledge', 'workflow_design_flaw'],
  pkg_manager_conflict:    ['missing_project_knowledge'],
  high_friction_run:       ['req_ambiguity', 'workflow_design_flaw'],
  manual_correction_spike: ['hallucination', 'req_ambiguity'],
  spec_ambiguity_cluster:  ['req_ambiguity', 'br_ambiguity'],
};

export function detectRootCauses(frictionScore: number, firedPatternIds: string[]): RootCauseCategory[] {
  const seen = new Set<RootCauseCategory>();
  for (const id of firedPatternIds) {
    const causes = PATTERN_ROOT_CAUSES[id] ?? [];
    causes.forEach((c) => seen.add(c));
  }
  // Infer from friction score when no specific pattern fired
  if (seen.size === 0 && frictionScore >= 29) {
    seen.add('workflow_design_flaw');
  }
  return [...seen];
}

// ─── Core Types ──────────────────────────────────────────────────────────────

interface AutoEntry {
  timestamp: string;
  featureName: string;
  type: 'auto';
  reflectionFinal: number | null;
  recoveries: number | null;
  b11A: 'pass' | 'fail' | null;
  b11B: 'pass' | 'fail' | 'skipped' | null;
  b9_6: 'pass' | 'fail' | 'skip' | null;
  peerConflict: boolean;
  skipped: string[];
  designCycleback: boolean;
  gatesRevised: string[];
  // Friction extension (optional — backwards-compatible with old entries)
  frictionMetrics?: Partial<FrictionMetrics>;
  frictionScore?: number;
  frictionLevel?: FrictionLevel;
  rootCauses?: RootCauseCategory[];
  promptVersion?: string;
}

interface UserEntry {
  timestamp: string;
  featureName: string;
  type: 'user';
  text: string;
}

type Entry = AutoEntry | UserEntry;

export interface Pattern {
  id: string;
  description: string;
  count: number;
  total: number;
  frequency: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  watch_steps: string[];
  examples: string[];
  /** Pre-defined proposal for B12.6 self-rewriting */
  proposal: {
    section: string;
    summary: string;
  } | null;
}

export interface FrictionSummary {
  smooth: number;
  minor: number;
  moderate: number;
  high: number;
  failed: number;
  avgScore: number;
  runs: Array<{ feature: string; timestamp: string; score: number; level: FrictionLevel }>;
}

export interface AnalysisResult {
  totalRuns: number;
  userEntries: number;
  patterns: Pattern[];
  topPatterns: Pattern[];
  highPriority: Pattern[];
  frictionSummary?: FrictionSummary;
  rootCauseFrequency?: RootCauseSummary[];
}

// ─── Watch steps map ─────────────────────────────────────────────────────────

const WATCH_STEPS: Record<string, string[]> = {
  b11_agent_a_fail:     ['B10'],
  b11_agent_b_fail:     ['B10', 'B11'],
  design_cycleback:     ['B6.5'],
  low_reflection_score: ['B5', 'B7'],
  high_recovery_count:  ['B1', 'B2', 'B10'],
  gate_revision:        ['B5', 'B6'],
  user_loading_state:   ['B10'],
  user_steps_vague:     ['B5'],
  user_error_state:     ['B10'],
  user_wrong_component: ['B6.5'],
  b9_6_install_fail:    ['B9.6'],
  pkg_manager_conflict: ['B9.6'],
  high_friction_run:    ['B0', 'B5', 'B10'],
  manual_correction_spike: ['B5', 'B10', 'B12'],
  spec_ambiguity_cluster:  ['B0', 'B2', 'B5'],
};

// ─── Proposals ───────────────────────────────────────────────────────────────

const PROPOSALS: Record<string, { section: string; summary: string }> = {
  b11_agent_a_fail: {
    section: 'B10 — agent brief',
    summary:
      'After writing each file, run `npx tsc --noEmit` on that file before moving to the next. Catch type errors early inside the subagent.',
  },
  b11_agent_b_fail: {
    section: 'B11 — Agent B prompt',
    summary:
      'Explicitly verify ALL 4 UX states (loading / error / empty / success). For loading state: add an artificial 500 ms delay to the mock before screenshotting.',
  },
  design_cycleback: {
    section: 'B6.5 — Design Review',
    summary:
      'Approval requires: (1) every src/generic/ reuse explicitly justified, (2) all 4 UX states named in the component decomposition.',
  },
  low_reflection_score: {
    section: '★3 SELF-EVALUATE',
    summary:
      'Threshold raised from ≥90% to ≥95%. Two silent revision attempts allowed before escalating to user.',
  },
  high_recovery_count: {
    section: 'HARD RULES',
    summary:
      'New rule: if any step requires > 2 SELF-RECOVER attempts, STOP and report to user before continuing.',
  },
  gate_revision: {
    section: 'B5 — 3 File Output',
    summary:
      'Before B6, explicitly cross-check each file against every ACP item — mark which ACP item each diagram node or step covers.',
  },
  user_loading_state: {
    section: 'B10 — STOP conditions',
    summary:
      'Add STOP condition: "Missing loading state in the main component" — subagent must add skeleton/spinner before marking a UI file complete.',
  },
  user_steps_vague: {
    section: 'B5 — steps.md',
    summary:
      'Each step must include a "Verify:" line with the exact observable check (e.g. "npm run types exits 0" or "loading spinner appears on network tab throttle").',
  },
  user_error_state: {
    section: 'B10 — STOP conditions',
    summary:
      'Add STOP condition: "Missing error state UI" — subagent must handle the API error case (show error message, retry button if needed) in the main component.',
  },
  user_wrong_component: {
    section: 'B6.5 — Design Review',
    summary:
      "Before approving B6.5, grep src/generic/ for components matching the feature's pattern (table, list, toolbar). Justify in writing if none are reused.",
  },
  b9_6_install_fail: {
    section: 'B9.6 — Package Install',
    summary:
      'Before B10, verify all NEW packages from B7 are installable via a dry-run (`npm install --dry-run`). Surface network/registry errors before implementation begins.',
  },
  pkg_manager_conflict: {
    section: 'B9.6 — Package Install',
    summary:
      'When peer dependency conflict detected: show the conflicting version range and suggest the nearest compatible version. Offer `--legacy-peer-deps` (npm only) as a last resort.',
  },
  high_friction_run: {
    section: 'B0 — Pre-flight + B5 spec quality',
    summary:
      'Multiple runs scored "high" or "failed" friction. Audit B0 for ambiguous spec signals before B2 Confluence fetch. Add explicit friction-threshold check at B12.5: if score ≥29, halt and request clarification on the next run.',
  },
  manual_correction_spike: {
    section: 'B5 + B10 — Spec clarity + agent brief',
    summary:
      'User is frequently having to correct generated output manually. Strengthen spec completeness checks at B5 and add a "manual-correction budget" check at B12.5: >2 manual corrections triggers an auto-lesson proposal.',
  },
  spec_ambiguity_cluster: {
    section: 'B0 — Spec quality gate',
    summary:
      'Multiple runs show high clarification cycles, pointing to spec ambiguity. Add a structured ambiguity-scoring pass at B2/B5: score each acceptance criterion for measurability before proceeding.',
  },
};

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseFrictionLine(line: string): Partial<FrictionMetrics> {
  const get = (key: string): number => {
    const m = line.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    clarificationCycles: get('clarification_cycles'),
    gateRevisions: get('gate_revisions'),
    recoveries: get('recoveries'),
    manualCorrections: get('manual_corrections'),
    rePlans: get('re_plans'),
    implementationRetries: get('impl_retries'),
    verificationRetries: get('verif_retries'),
  };
}

function parseAutoEntry(lines: string[]): AutoEntry | null {
  if (lines.length < 2) return null;
  const headerMatch = lines[0].match(/\[([^\]]+)\] \[([^\]]+)\] \[auto\]/);
  if (!headerMatch) return null;
  const [, timestamp, featureName] = headerMatch;

  const m1 = lines[1] ?? '';
  const m2 = lines[2] ?? '';
  const m3 = lines[3] ?? '';

  const reflectionMatch = m1.match(/reflection_final:\s*(\d+)%/);
  const recoveriesMatch = m1.match(/recoveries:\s*(\d+)/);
  const b11AMatch = m1.match(/b11_a:\s*(pass|fail)/);
  const b11BMatch = m1.match(/b11_b:\s*(pass|fail|skipped)/);
  const b9_6Match = m2.match(/b9_6:\s*(pass|fail|skip)/);
  const peerConflictMatch = m2.match(/peer_conflict:\s*(yes|no)/);
  const skippedMatch = m2.match(/skipped:\s*\[([^\]]*)\]/);
  const cyclebackMatch = m2.match(/design_cycleback:\s*(yes|no)/);
  const gatesMatch = m2.match(/gates_revised:\s*\[([^\]]*)\]/);

  // Line 3 (optional): friction metrics
  let frictionMetrics: Partial<FrictionMetrics> | undefined;
  let frictionScore: number | undefined;
  let frictionLevel: FrictionLevel | undefined;
  let promptVersion: string | undefined;

  if (m3 && m3.includes('friction_score:')) {
    frictionMetrics = parseFrictionLine(m3);
    const scoreMatch = m3.match(/friction_score:\s*(\d+)/);
    const levelMatch = m3.match(/friction_level:\s*(smooth|minor|moderate|high|failed)/);
    const versionMatch = m3.match(/prompt_version:\s*([\w.]+)/);
    if (scoreMatch) frictionScore = parseInt(scoreMatch[1], 10);
    if (levelMatch) frictionLevel = levelMatch[1] as FrictionLevel;
    if (versionMatch) promptVersion = versionMatch[1];
  } else if (recoveriesMatch) {
    // Backfill friction for legacy entries using recoveries only
    const rec = parseInt(recoveriesMatch[1], 10);
    frictionMetrics = { recoveries: rec };
    frictionScore = computeFrictionScore({ clarificationCycles: 0, gateRevisions: 0, recoveries: rec, manualCorrections: 0, rePlans: 0, implementationRetries: 0, verificationRetries: 0 });
    frictionLevel = classifyFriction(frictionScore);
  }

  return {
    timestamp,
    featureName,
    type: 'auto',
    reflectionFinal: reflectionMatch ? parseInt(reflectionMatch[1], 10) : null,
    recoveries: recoveriesMatch ? parseInt(recoveriesMatch[1], 10) : null,
    b11A: b11AMatch ? (b11AMatch[1] as 'pass' | 'fail') : null,
    b11B: b11BMatch ? (b11BMatch[1] as 'pass' | 'fail' | 'skipped') : null,
    b9_6: b9_6Match ? (b9_6Match[1] as 'pass' | 'fail' | 'skip') : null,
    peerConflict: peerConflictMatch?.[1] === 'yes',
    skipped:
      skippedMatch && skippedMatch[1].trim() !== 'none'
        ? skippedMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    designCycleback: cyclebackMatch?.[1] === 'yes',
    gatesRevised:
      gatesMatch && gatesMatch[1].trim() !== 'none'
        ? gatesMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    frictionMetrics,
    frictionScore,
    frictionLevel,
    promptVersion,
  };
}

function parseUserEntry(lines: string[]): UserEntry | null {
  const headerMatch = lines[0].match(/\[([^\]]+)\] \[([^\]]+)\] \[user\]/);
  if (!headerMatch) return null;
  const [, timestamp, featureName] = headerMatch;
  const text = lines.slice(1).join(' ').trim();
  return { timestamp, featureName, type: 'user', text };
}

function parseHistory(content: string, strictInput = false): Entry[] {
  const entries: Entry[] = [];
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim());
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const lines = block.trim().split('\n');
    if (!lines[0]) continue;
    if (lines[0].includes('[auto]')) {
      const e = parseAutoEntry(lines);
      const complete = e
        && Number.isFinite(Date.parse(e.timestamp))
        && lines.length >= 3
        && /reflection_final:\s*\d+%/.test(lines[1])
        && /recoveries:\s*\d+/.test(lines[1])
        && /b11_a:\s*(pass|fail)/.test(lines[1])
        && /b11_b:\s*(pass|fail|skipped)/.test(lines[1])
        && /b9_6:\s*(pass|fail|skip)/.test(lines[2]);
      if (strictInput && !complete) {
        throw new CliReliabilityError('MALFORMED_INPUT', `malformed auto feedback entry at block ${blockIndex + 1}`);
      }
      if (e) entries.push(e);
    } else if (lines[0].includes('[user]')) {
      const e = parseUserEntry(lines);
      if (strictInput && (!e || !Number.isFinite(Date.parse(e.timestamp)) || !e.text)) {
        throw new CliReliabilityError('MALFORMED_INPUT', `malformed user feedback entry at block ${blockIndex + 1}`);
      }
      if (e) entries.push(e);
    }
  }
  return entries;
}

// ─── Pattern detection ──────────────────────────────────────────────────────

function priority(freq: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (freq >= 0.3) return 'HIGH';
  if (freq >= 0.15) return 'MEDIUM';
  return 'LOW';
}

function buildPattern(
  id: string,
  description: string,
  count: number,
  total: number,
  examples: string[]
): Pattern {
  const freq = total > 0 ? count / total : 0;
  return {
    id,
    description,
    count,
    total,
    frequency: freq,
    priority: priority(freq),
    watch_steps: WATCH_STEPS[id] ?? [],
    examples: examples.slice(0, 3),
    proposal: PROPOSALS[id] ?? null,
  };
}

function detectPatterns(entries: Entry[]): Pattern[] {
  const autoEntries = entries.filter((e) => e.type === 'auto') as AutoEntry[];
  const userEntries = entries.filter((e) => e.type === 'user') as UserEntry[];
  const total = autoEntries.length;
  const patterns: Pattern[] = [];

  if (total === 0) return patterns;

  // B11 Agent A failures
  const b11AFails = autoEntries.filter((e) => e.b11A === 'fail');
  if (b11AFails.length > 0) {
    patterns.push(
      buildPattern(
        'b11_agent_a_fail',
        'B11 Agent A (static analysis: types/lint) failed',
        b11AFails.length,
        total,
        b11AFails.map((e) => `${e.featureName} @ ${e.timestamp.slice(0, 10)}`)
      )
    );
  }

  // B11 Agent B failures (exclude skipped — skipped is a user choice, not a failure)
  const b11BFails = autoEntries.filter((e) => e.b11B === 'fail');
  if (b11BFails.length > 0) {
    patterns.push(
      buildPattern(
        'b11_agent_b_fail',
        'B11 Agent B (UI verification: Playwright/browser-use) failed',
        b11BFails.length,
        total,
        b11BFails.map((e) => `${e.featureName} @ ${e.timestamp.slice(0, 10)}`)
      )
    );
  }

  // B9.6 install failures
  const installFails = autoEntries.filter((e) => e.b9_6 === 'fail');
  if (installFails.length > 0) {
    patterns.push(
      buildPattern(
        'b9_6_install_fail',
        'B9.6 package install failed (network or registry error)',
        installFails.length,
        total,
        installFails.map((e) => `${e.featureName} @ ${e.timestamp.slice(0, 10)}`)
      )
    );
  }

  // Peer dependency conflicts at B9.6
  const peerConflicts = autoEntries.filter((e) => e.peerConflict);
  if (peerConflicts.length > 0) {
    patterns.push(
      buildPattern(
        'pkg_manager_conflict',
        'B9.6 encountered peer dependency conflict during package install',
        peerConflicts.length,
        total,
        peerConflicts.map((e) => `${e.featureName} @ ${e.timestamp.slice(0, 10)}`)
      )
    );
  }

  // High recovery count (> 3 attempts in a run)
  const highRecoveries = autoEntries.filter((e) => (e.recoveries ?? 0) > 3);
  if (highRecoveries.length > 0) {
    patterns.push(
      buildPattern(
        'high_recovery_count',
        'Run required > 3 self-recovery attempts',
        highRecoveries.length,
        total,
        highRecoveries.map((e) => `${e.featureName}: ${e.recoveries} attempts`)
      )
    );
  }

  // Design cycle-back
  const cyclebacks = autoEntries.filter((e) => e.designCycleback);
  if (cyclebacks.length > 0) {
    patterns.push(
      buildPattern(
        'design_cycleback',
        'B6.5 design review triggered cycle-back from B11',
        cyclebacks.length,
        total,
        cyclebacks.map((e) => e.featureName)
      )
    );
  }

  // Low final reflection score
  const lowScores = autoEntries.filter(
    (e) => e.reflectionFinal !== null && e.reflectionFinal < 85
  );
  if (lowScores.length > 0) {
    patterns.push(
      buildPattern(
        'low_reflection_score',
        'Final self-evaluation score below 85%',
        lowScores.length,
        total,
        lowScores.map((e) => `${e.featureName}: ${e.reflectionFinal}%`)
      )
    );
  }

  // Gate revision — frequency-based threshold (avoid false positives with few runs)
  const gateCount: Record<string, number> = {};
  autoEntries.forEach((e) =>
    e.gatesRevised.forEach((g) => {
      gateCount[g] = (gateCount[g] ?? 0) + 1;
    })
  );
  const topGate = Object.entries(gateCount).sort((a, b) => b[1] - a[1])[0];
  if (topGate) {
    const topGateFreq = topGate[1] / total;
    // Require both absolute count >= 2 AND frequency >= 25% to avoid false positives
    if (topGate[1] >= 2 && topGateFreq >= 0.25) {
      patterns.push(
        buildPattern(
          'gate_revision',
          `Gate ${topGate[0]} frequently required user revision before approval`,
          topGate[1],
          total,
          autoEntries
            .filter((e) => e.gatesRevised.includes(topGate[0]))
            .map((e) => e.featureName)
        )
      );
    }
  }

  // ── Friction patterns (new) ──────────────────────────────────────────────

  // High-friction runs (score ≥ 29)
  const highFrictionRuns = autoEntries.filter(
    (e) => e.frictionScore !== undefined && e.frictionScore >= 29
  );
  if (highFrictionRuns.length > 0) {
    patterns.push(
      buildPattern(
        'high_friction_run',
        'Run scored "high" or "failed" friction (score ≥ 29)',
        highFrictionRuns.length,
        total,
        highFrictionRuns.map((e) => `${e.featureName}: score=${e.frictionScore} (${e.frictionLevel})`)
      )
    );
  }

  // Manual correction spike (≥2 manual corrections in a run)
  const manualCorrectionSpikes = autoEntries.filter(
    (e) => (e.frictionMetrics?.manualCorrections ?? 0) >= 2
  );
  if (manualCorrectionSpikes.length > 0) {
    patterns.push(
      buildPattern(
        'manual_correction_spike',
        'Run required ≥2 manual corrections from user',
        manualCorrectionSpikes.length,
        total,
        manualCorrectionSpikes.map(
          (e) => `${e.featureName}: ${e.frictionMetrics?.manualCorrections} corrections`
        )
      )
    );
  }

  // Spec ambiguity cluster (≥2 clarification cycles in a run)
  const specAmbiguity = autoEntries.filter(
    (e) => (e.frictionMetrics?.clarificationCycles ?? 0) >= 2
  );
  if (specAmbiguity.length > 0) {
    patterns.push(
      buildPattern(
        'spec_ambiguity_cluster',
        'Run required ≥2 clarification cycles (spec ambiguity signal)',
        specAmbiguity.length,
        total,
        specAmbiguity.map(
          (e) => `${e.featureName}: ${e.frictionMetrics?.clarificationCycles} cycles`
        )
      )
    );
  }

  // User feedback keyword clusters — bilingual (EN + VI)
  const userTotal = userEntries.length;
  if (userTotal > 0) {
    const userKeywords: Record<string, { keywords: string[]; id: string; desc: string }> = {
      loading_state: {
        id: 'user_loading_state',
        keywords: [
          'loading', 'spinner', 'skeleton', 'loading state',
          'màn hình loading', 'spinner không', 'skeleton không', 'đang tải',
          'màn hình trắng', 'blank screen',
        ],
        desc: 'User feedback: loading state missing or wrong',
      },
      error_state: {
        id: 'user_error_state',
        keywords: [
          'error state', 'error handling', 'error message',
          'lỗi không hiện', 'không hiển thị lỗi', 'trạng thái lỗi',
          'xử lý lỗi', 'thông báo lỗi',
        ],
        desc: 'User feedback: error state missing or wrong',
      },
      steps_vague: {
        id: 'user_steps_vague',
        keywords: [
          'vague', 'unclear', 'not detailed', 'missing detail',
          'không rõ', 'thiếu chi tiết', 'mơ hồ', 'chưa đủ',
          'quá chung chung', 'cần cụ thể hơn',
        ],
        desc: 'User feedback: steps.md is too vague',
      },
      wrong_component: {
        id: 'user_wrong_component',
        keywords: [
          'wrong component', 'should use', 'generic', 'reuse',
          'dùng lại', 'generic component', 'sai component',
          'đã có sẵn', 'không cần tạo mới',
        ],
        desc: 'User feedback: should reuse existing src/generic/ component',
      },
    };

    for (const config of Object.values(userKeywords)) {
      const matches = userEntries.filter((e) =>
        config.keywords.some((kw) => e.text.toLowerCase().includes(kw))
      );
      if (matches.length >= 2) {
        patterns.push(
          buildPattern(
            config.id,
            config.desc,
            matches.length,
            userTotal,
            matches.map((e) => `"${e.text.slice(0, 70)}..."`)
          )
        );
      }
    }
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

// ─── Friction + Root Cause summaries ────────────────────────────────────────

function buildFrictionSummary(autoEntries: AutoEntry[]): FrictionSummary {
  const levels: Record<FrictionLevel, number> = { smooth: 0, minor: 0, moderate: 0, high: 0, failed: 0 };
  const runs: FrictionSummary['runs'] = [];
  let totalScore = 0;

  for (const e of autoEntries) {
    const score = e.frictionScore ?? 0;
    const level = e.frictionLevel ?? 'smooth';
    levels[level] = (levels[level] ?? 0) + 1;
    totalScore += score;
    runs.push({ feature: e.featureName, timestamp: e.timestamp.slice(0, 10), score, level });
  }

  return {
    ...levels,
    avgScore: autoEntries.length > 0 ? Math.round(totalScore / autoEntries.length) : 0,
    runs,
  };
}

function buildRootCauseFrequency(autoEntries: AutoEntry[], patterns: Pattern[]): RootCauseSummary[] {
  const causeMap = new Map<RootCauseCategory, { count: number; examples: string[] }>();

  for (const e of autoEntries) {
    const firedIds = patterns
      .filter((p) => p.examples.some((ex) => ex.includes(e.featureName)))
      .map((p) => p.id);
    const causes = detectRootCauses(e.frictionScore ?? 0, firedIds);
    causes.forEach((c) => {
      const entry = causeMap.get(c) ?? { count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 3) entry.examples.push(`${e.featureName} @ ${e.timestamp.slice(0, 10)}`);
      causeMap.set(c, entry);
    });
  }

  const total = autoEntries.length;
  return [...causeMap.entries()]
    .map(([category, { count, examples }]) => ({
      category,
      count,
      frequency: total > 0 ? count / total : 0,
      examples,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function analyze(
  historyFile: string,
  options: Readonly<{ strictInput?: boolean; requireFile?: boolean }> = {},
): AnalysisResult {
  if (!fs.existsSync(historyFile)) {
    if (options.requireFile) throw new CliReliabilityError('INPUT_NOT_FOUND', `input file not found: ${historyFile}`);
    return { totalRuns: 0, userEntries: 0, patterns: [], topPatterns: [], highPriority: [] };
  }

  let content: string;
  try {
    content = fs.readFileSync(historyFile, 'utf-8').replace(/\r\n/g, '\n');
  } catch (error) {
    throw classifyFileReadError(error, historyFile);
  }
  const entries = parseHistory(content, options.strictInput);
  const autoEntries = entries.filter((e) => e.type === 'auto') as AutoEntry[];
  const autoCount = autoEntries.length;
  const userCount = entries.filter((e) => e.type === 'user').length;
  const patterns = detectPatterns(entries);

  const frictionSummary = buildFrictionSummary(autoEntries);
  const rootCauseFrequency = buildRootCauseFrequency(autoEntries, patterns);

  return {
    totalRuns: autoCount,
    userEntries: userCount,
    patterns,
    topPatterns: patterns.slice(0, 3),
    highPriority: patterns.filter((p) => p.priority === 'HIGH'),
    frictionSummary,
    rootCauseFrequency,
  };
}

function printSummary(result: AnalysisResult, classifyFrictionMode: boolean): void {
  if (result.totalRuns === 0) {
    console.log('No run history found. Feedback will be collected after the first complete run.');
    return;
  }

  console.log(`\n📊 Feedback Analysis — ${result.totalRuns} runs, ${result.userEntries} user entries\n`);

  // Friction summary
  if (classifyFrictionMode && result.frictionSummary) {
    const fs2 = result.frictionSummary;
    console.log('── Friction Breakdown ──────────────────────────────────────────');
    console.log(`   smooth=${fs2.smooth}  minor=${fs2.minor}  moderate=${fs2.moderate}  high=${fs2.high}  failed=${fs2.failed}`);
    console.log(`   avg score: ${fs2.avgScore}`);
    console.log('');
    console.log('   Per-run:');
    for (const r of fs2.runs) {
      const badge = r.level === 'smooth' ? '✅' : r.level === 'minor' ? '🟢' : r.level === 'moderate' ? '🟡' : r.level === 'high' ? '🔴' : '💀';
      console.log(`     ${badge} ${r.feature} (${r.timestamp}): score=${r.score} [${r.level}]`);
    }
    console.log('');
  }

  // Root causes
  if (result.rootCauseFrequency && result.rootCauseFrequency.length > 0) {
    console.log('── Top Root Causes ─────────────────────────────────────────────');
    for (const rc of result.rootCauseFrequency.slice(0, 5)) {
      const pct = Math.round(rc.frequency * 100);
      console.log(`   ${rc.category}: ${rc.count} runs (${pct}%)`);
    }
    console.log('');
  }

  if (result.patterns.length === 0) {
    console.log('✅ No recurring patterns detected.');
    return;
  }

  console.log('── Top Patterns (sorted by frequency) ─────────────────────────');
  for (const p of result.topPatterns) {
    const pct = Math.round(p.frequency * 100);
    const badge = p.priority === 'HIGH' ? '🔴' : p.priority === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`\n  ${badge} [${p.priority}] ${p.description}`);
    console.log(`      ${p.count}/${p.total} runs (${pct}%)`);
    if (p.watch_steps.length > 0) {
      console.log(`      Watch steps: ${p.watch_steps.join(', ')}`);
    }
    if (p.proposal) {
      console.log(`      → Proposal: ${p.proposal.section}: ${p.proposal.summary}`);
    }
  }
  console.log('');

  if (result.highPriority.length > 0) {
    console.log(`⚠️  ${result.highPriority.length} HIGH priority pattern(s) ready for B12.6 prompt improvement proposal.\n`);
  }
}

export function runFeedbackAnalyzerCli(args: readonly string[], cwd = process.cwd()): void {
  const flags = parseStrictFlags(args, {
    '--history-file': 'value',
    '--summary': 'boolean',
    '--classify-friction': 'boolean',
  });
  const explicitHistory = flags.get('--history-file');
  const historyFile = typeof explicitHistory === 'string'
    ? path.resolve(cwd, explicitHistory)
    : path.join(cwd, 'docs/specs/.feedback-history.md');
  const summaryMode = flags.has('--summary');
  const classifyFrictionMode = flags.has('--classify-friction');
  const result = analyze(historyFile, { strictInput: true, requireFile: typeof explicitHistory === 'string' });

  if (summaryMode || classifyFrictionMode) {
    printSummary(result, classifyFrictionMode);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

const feedbackLauncher = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (require.main === module && /feedback-analyzer\.(?:ts|js|cjs|mjs)$/.test(feedbackLauncher)) {
  try {
    runFeedbackAnalyzerCli(process.argv.slice(2));
  } catch (error) {
    process.exitCode = emitCliError('feedback-analyzer', error);
  }
}
