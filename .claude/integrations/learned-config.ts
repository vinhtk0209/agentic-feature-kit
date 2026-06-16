#!/usr/bin/env node
/**
 * learned-config.ts — deterministic, strengthen-only configuration promoted from
 * VERIFIED amendments. This is the "Act" half of the self-improvement loop.
 *
 * Unlike the soft per-run advisory (SESSION BOOTSTRAP Step 0.C), a learned knob
 * PERSISTS and is machine-read thereafter:
 *   - improve-trigger.ts calls applyLearnedKnob() when an amendment is verified,
 *     and revertLearnedKnob() when one is rolled back / regresses.
 *   - lint-feature.ts enforces requireLoadingState / requireErrorState as hard gates.
 *   - the workflow prompt reads selfEvalThreshold / maxRecoveries / manualCorrectionBudget
 *     at SESSION BOOTSTRAP Step 0.D.
 *
 * SOURCE OF TRUTH = the provenance log. The `config` block is a cache that is always
 * recomputed by replaying every non-reverted provenance entry from DEFAULTS. This is
 * what makes rollback safe: reverting is just marking an entry `reverted` and replaying.
 *
 * SAFETY INVARIANTS (enforced in code, not prose):
 *   1. Allowlist — only patterns in KNOBS can change config.
 *   2. Strengthen-only — clampStrengthen() guarantees every field moves toward a
 *      STRICTER check or stays put, regardless of what a knob function does. A buggy
 *      or hostile knob can never relax a gate.
 *   3. Clamped — thresholds cannot run away (selfEvalThreshold ≤ 98, budgets ≥ 1).
 *   4. Idempotent per amendment — an amendmentId already applied is a no-op, so
 *      repeated verification passes cannot ratchet a knob multiple times.
 *   5. Reversible — revert never relaxes below DEFAULTS; it replays from DEFAULTS
 *      without the reverted entry, so the result is exactly "as if it never applied".
 *
 * Usage:
 *   npx tsx .claude/integrations/learned-config.ts --show
 *   npx tsx .claude/integrations/learned-config.ts --json
 *   npx tsx .claude/integrations/learned-config.ts --apply  <patternId> <amendmentId> [--dry-run]
 *   npx tsx .claude/integrations/learned-config.ts --revert <amendmentId> [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface LearnedConfig {
  /** ★3 SELF-EVALUATE pass bar (%). Higher = stricter. */
  selfEvalThreshold: number;
  /** SELF-RECOVER attempts before halting to the user. Lower = stricter. */
  maxRecoveries: number;
  /** Manual corrections tolerated before an auto-lesson fires. Lower = stricter. */
  manualCorrectionBudget: number;
  /** Gate: ux-states.json MUST include a loading state. */
  requireLoadingState: boolean;
  /** Gate: ux-states.json MUST include an error state. */
  requireErrorState: boolean;
}

export const DEFAULTS: LearnedConfig = {
  selfEvalThreshold: 90,
  maxRecoveries: 3,
  manualCorrectionBudget: 2,
  requireLoadingState: false,
  requireErrorState: false,
};

export interface ProvenanceEntry {
  patternId: string;
  amendmentId: string;
  at: string;
  reverted?: boolean;
  revertedAt?: string;
  // Informational snapshot of the change this entry caused (recomputed at apply time).
  key?: keyof LearnedConfig | '(none)';
  before?: unknown;
  after?: unknown;
}

export interface ConfigFile {
  version: number;
  updatedAt: string;
  config: LearnedConfig; // cache — always === replayProvenance(provenance)
  provenance: ProvenanceEntry[];
}

// ─── Knobs (allowlist) ────────────────────────────────────────────────────────
// CONTRACT: keys MUST be pattern IDs emitted by feedback-analyzer.detectPatterns().
// Each knob returns a PROPOSED config; clampStrengthen() is the real safety gate.

export type Knob = (c: LearnedConfig) => LearnedConfig;

export const KNOBS: Record<string, Knob> = {
  low_reflection_score:    (c) => ({ ...c, selfEvalThreshold: c.selfEvalThreshold + 5 }),
  high_recovery_count:     (c) => ({ ...c, maxRecoveries: c.maxRecoveries - 1 }),
  manual_correction_spike: (c) => ({ ...c, manualCorrectionBudget: c.manualCorrectionBudget - 1 }),
  user_loading_state:      (c) => ({ ...c, requireLoadingState: true }),
  user_error_state:        (c) => ({ ...c, requireErrorState: true }),
};

// ─── Strengthen-only clamp (the structural safety net) ────────────────────────
// For EVERY field, pick the stricter of {before, proposed}, then clamp to bounds.
// Thresholds that mean "higher is stricter" use max(); budgets that mean "lower is
// stricter" use min(); booleans use OR (false→true only). This holds even if a
// knob tries to relax a value — the relaxation is discarded here.

export function clampStrengthen(before: LearnedConfig, proposed: LearnedConfig): LearnedConfig {
  return {
    selfEvalThreshold: Math.min(98, Math.max(before.selfEvalThreshold, proposed.selfEvalThreshold)),
    maxRecoveries: Math.max(1, Math.min(before.maxRecoveries, proposed.maxRecoveries)),
    manualCorrectionBudget: Math.max(1, Math.min(before.manualCorrectionBudget, proposed.manualCorrectionBudget)),
    requireLoadingState: before.requireLoadingState || proposed.requireLoadingState,
    requireErrorState: before.requireErrorState || proposed.requireErrorState,
  };
}

// ─── Replay (the source of truth) ─────────────────────────────────────────────
// config = fold(DEFAULTS, non-reverted knobs, in order). Deterministic; reverting
// an entry and replaying yields the config exactly as if that amendment never applied.

export function replayProvenance(entries: ProvenanceEntry[]): LearnedConfig {
  let cfg: LearnedConfig = { ...DEFAULTS };
  for (const e of entries) {
    if (e.reverted) continue;
    const knob = KNOBS[e.patternId];
    if (knob) cfg = clampStrengthen(cfg, knob(cfg));
  }
  return cfg;
}

function changedKey(before: LearnedConfig, after: LearnedConfig): keyof LearnedConfig | undefined {
  return (Object.keys(after) as (keyof LearnedConfig)[]).find((k) => after[k] !== before[k]);
}

// ─── IO ───────────────────────────────────────────────────────────────────────

export function configPath(): string {
  return path.join(process.cwd(), 'docs', 'specs', '.learned-config.json');
}

export function loadConfigFile(): ConfigFile {
  const file = configPath();
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<ConfigFile>;
      const provenance = Array.isArray(parsed.provenance) ? parsed.provenance : [];
      // Provenance is authoritative — recompute config from it (self-heals any drift).
      return {
        version: parsed.version ?? 1,
        updatedAt: parsed.updatedAt ?? '',
        config: replayProvenance(provenance),
        provenance,
      };
    } catch {
      /* corrupt → fall through to defaults */
    }
  }
  return { version: 1, updatedAt: '', config: { ...DEFAULTS }, provenance: [] };
}

/** Merged config for consumers (gates, prompt). Never throws. */
export function loadConfig(): LearnedConfig {
  return loadConfigFile().config;
}

function writeConfigFile(file: ConfigFile): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(file, null, 2) + '\n', 'utf-8');
}

// ─── Apply ──────────────────────────────────────────────────────────────────

export interface ApplyResult { applied: boolean; changed: boolean; note: string; }

/** Promote a verified amendment's pattern into the persisted config. */
export function applyLearnedKnob(patternId: string, amendmentId: string, dryRun = false): ApplyResult {
  const knob = KNOBS[patternId];
  if (!knob) return { applied: false, changed: false, note: `no knob for pattern "${patternId}"` };

  const file = loadConfigFile();

  // Idempotency: an amendment already in the log never ratchets the knob again.
  if (file.provenance.some((p) => p.amendmentId === amendmentId)) {
    return { applied: false, changed: false, note: `amendment ${amendmentId} already recorded` };
  }

  const before = file.config; // = replay(current provenance)
  const entry: ProvenanceEntry = { patternId, amendmentId, at: new Date().toISOString() };
  const provenance = [...file.provenance, entry];
  const after = replayProvenance(provenance);
  const key = changedKey(before, after);

  entry.key = key ?? '(none)';
  entry.before = key ? before[key] : null;
  entry.after = key ? after[key] : null;

  if (!dryRun) writeConfigFile({ version: file.version, updatedAt: entry.at, config: after, provenance });

  return {
    applied: true,
    changed: key !== undefined,
    note: key ? `${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}` : 'no-op (already at clamp)',
  };
}

// ─── Revert (rollback) ─────────────────────────────────────────────────────────

export interface RevertResult { reverted: boolean; changed: boolean; note: string; }

/**
 * Retract a previously-applied knob (amendment rolled back or regressed). Marks the
 * provenance entry reverted and recomputes config by replay — never relaxes below
 * DEFAULTS, and leaves every OTHER learned knob intact.
 */
export function revertLearnedKnob(amendmentId: string, dryRun = false): RevertResult {
  const file = loadConfigFile();
  const entry = file.provenance.find((p) => p.amendmentId === amendmentId && !p.reverted);
  if (!entry) return { reverted: false, changed: false, note: `no active knob for amendment ${amendmentId}` };

  const before = file.config;
  entry.reverted = true;
  entry.revertedAt = new Date().toISOString();
  const after = replayProvenance(file.provenance);
  const changed = JSON.stringify(before) !== JSON.stringify(after);

  if (!dryRun) writeConfigFile({ version: file.version, updatedAt: entry.revertedAt, config: after, provenance: file.provenance });

  return { reverted: true, changed, note: `reverted ${entry.patternId} (${amendmentId})${changed ? '' : ' — no config change (was shadowed/at clamp)'}` };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && /learned-config\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');

  if (argv.includes('--show') || argv.includes('--json')) {
    const file = loadConfigFile();
    if (argv.includes('--json')) {
      console.log(JSON.stringify(file, null, 2));
    } else {
      console.log('\n⚙️  Learned config (promoted from verified amendments)\n');
      for (const [k, v] of Object.entries(file.config)) console.log(`   ${k}: ${JSON.stringify(v)}`);
      const active = file.provenance.filter((p) => !p.reverted).length;
      console.log(`\n   ${active} active / ${file.provenance.length} total provenance record(s); updated ${file.updatedAt || '(never)'}\n`);
    }
  } else if (argv.includes('--apply')) {
    const i = argv.indexOf('--apply');
    const patternId = argv[i + 1];
    const amendmentId = argv[i + 2];
    if (!patternId || !amendmentId) { console.error('Usage: learned-config.ts --apply <patternId> <amendmentId>'); process.exit(1); }
    console.log(JSON.stringify({ ok: true, ...applyLearnedKnob(patternId, amendmentId, dryRun) }));
  } else if (argv.includes('--revert')) {
    const i = argv.indexOf('--revert');
    const amendmentId = argv[i + 1];
    if (!amendmentId || amendmentId.startsWith('--')) { console.error('Usage: learned-config.ts --revert <amendmentId>'); process.exit(1); }
    console.log(JSON.stringify({ ok: true, ...revertLearnedKnob(amendmentId, dryRun) }));
  } else {
    console.log('Usage: learned-config.ts [--show | --json | --apply <patternId> <amendmentId> | --revert <amendmentId>] [--dry-run]');
  }
}
