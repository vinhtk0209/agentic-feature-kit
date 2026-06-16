#!/usr/bin/env node
/**
 * b12-logger.ts — B12.5 feedback logging
 *
 * Appends a structured auto-log entry to:
 *   - docs/specs/<featureName>/feedback.log  (per-feature)
 *   - docs/specs/.feedback-history.md        (global, trimmed to 10 entries)
 *   - docs/specs/.kpi-history.jsonl          (global KPI history, NDJSON, appended)
 *
 * Usage:
 *   npx tsx .claude/integrations/b12-logger.ts <featureName> '<metrics-json>'
 *
 * Metrics JSON fields (all optional):
 *   {
 *     reflectionFinal?: string | number,    // e.g. "95%" or 95
 *     recoveries?: number,
 *     b11_a?: "pass" | "fail",
 *     b11_b?: "pass" | "fail" | "skip",
 *     b9_6?: "pass" | "fail" | "skip",
 *     peerConflict?: boolean,
 *     skipped?: string[],
 *     designCycleback?: boolean,
 *     gatesRevised?: string[],
 *     userFeedback?: string,
 *     // Friction fields (optional)
 *     clarificationCycles?: number,
 *     gateRevisions?: number,
 *     manualCorrections?: number,
 *     rePlans?: number,
 *     implementationRetries?: number,
 *     verificationRetries?: number,
 *     // Root causes / prompt version
 *     rootCauses?: string[],
 *     promptVersion?: string,
 *     escapedDefects?: number
 *   }
 *
 * Output (JSON to stdout):
 *   { ok: true, entryCount: N, frictionScore: N, frictionLevel: "..." }
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  FrictionMetrics,
  computeFrictionScore,
  classifyFriction,
  FrictionLevel,
} from './feedback-analyzer';
import { countRecoveryAttempts } from './friction-meter';

type MetricSource = 'machine' | 'derived' | 'self_reported';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Metrics {
  reflectionFinal?: string | number;
  recoveries?: number;
  b11_a?: 'pass' | 'fail';
  b11_b?: 'pass' | 'fail' | 'skip';
  b9_6?: 'pass' | 'fail' | 'skip';
  peerConflict?: boolean;
  skipped?: string[];
  designCycleback?: boolean;
  gatesRevised?: string[];
  userFeedback?: string;
  // Friction dimensions
  clarificationCycles?: number;
  gateRevisions?: number;
  manualCorrections?: number;
  rePlans?: number;
  implementationRetries?: number;
  verificationRetries?: number;
  // Metadata
  rootCauses?: string[];
  promptVersion?: string;
  escapedDefects?: number;
}

interface RunKPI {
  timestamp: string;
  featureName: string;
  promptVersion: string;
  // Friction
  frictionScore: number;
  frictionLevel: FrictionLevel;
  clarificationCycles: number;
  gateRevisions: number;
  recoveries: number;
  manualCorrections: number;
  rePlans: number;
  implementationRetries: number;
  verificationRetries: number;
  // Quality signals
  b11_a: string;
  b11_b: string;
  b9_6: string;
  reflectionFinal: number | null;
  designCycleback: boolean;
  // Learning
  rootCauses: string[];
  escapedDefects: number;
  // Provenance — how each metric was obtained this run, so honesty is machine-readable.
  // 'machine'      = subprocess verdict (b11 exit code)
  // 'derived'      = counted from a structured artifact the model wrote (recovery.log)
  // 'self_reported'= end-of-run summary number from the model
  metricSources: Record<string, MetricSource>;
}

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx tsx b12-logger.ts <featureName> \'<metrics-json>\'');
  process.exit(1);
}

const featureName = args[0];
const metricsRaw = args.slice(1).join(' ');

// Reject placeholder/test names. The analyzer and improve-trigger treat every
// distinct featureName as a real run (it drives frequency denominators and
// distinct-feature counts), so a stray "FeatureName"/"test" entry quietly skews
// the whole learning loop. Block it at the source instead of cleaning up later.
const PLACEHOLDER_NAMES = /^(featurename|feature|test|testfeat|example|placeholder|myfeature|yourfeature|sample|demo|tbd|xxx|foo|bar)$/i;
if (!featureName || !featureName.trim() || PLACEHOLDER_NAMES.test(featureName.trim())) {
  console.error(`Refusing to log placeholder/empty feature name: "${featureName}". Pass the real feature name.`);
  process.exit(1);
}

let metrics: Metrics = {};
try {
  metrics = JSON.parse(metricsRaw) as Metrics;
} catch {
  console.error(`Invalid metrics JSON: ${metricsRaw}`);
  process.exit(1);
}

const cwd = process.cwd();
const specsDir = path.join(cwd, 'docs', 'specs');
const featureDir = path.join(specsDir, featureName);
const globalHistoryPath = path.join(specsDir, '.feedback-history.md');
const kpiHistoryPath = path.join(specsDir, '.kpi-history.jsonl');
const featureLogPath = path.join(featureDir, 'feedback.log');

// ─── Reconcile B11 fields from the machine-measured verdict (audit Fix 2) ─────
// b11-runner.ts writes .b11-result.json with the real types/lint/Playwright
// verdicts. Prefer those over hand-passed metrics so the learning loop is never
// graded on self-reported pass/fail. Consume-and-delete so a stale verdict can't
// leak into a later run of the same feature. Must run BEFORE the entry/KPI are
// built, since both read metrics.b11_a / metrics.b11_b.
const b11ResultPath = path.join(featureDir, '.b11-result.json');
let b11Source: 'runner' | 'self-reported' = 'self-reported';
const b11Drift: string[] = [];
try {
  if (fs.existsSync(b11ResultPath)) {
    const r = JSON.parse(fs.readFileSync(b11ResultPath, 'utf-8')) as {
      b11_a?: 'pass' | 'fail';
      b11_b?: 'pass' | 'fail' | 'skip';
    };
    if (r.b11_a === 'pass' || r.b11_a === 'fail') {
      if (metrics.b11_a !== undefined && metrics.b11_a !== r.b11_a) {
        b11Drift.push(`b11_a: self-reported=${metrics.b11_a} → runner=${r.b11_a}`);
      }
      metrics.b11_a = r.b11_a;
    }
    if (r.b11_b === 'pass' || r.b11_b === 'fail' || r.b11_b === 'skip') {
      if (metrics.b11_b !== undefined && metrics.b11_b !== r.b11_b) {
        b11Drift.push(`b11_b: self-reported=${metrics.b11_b} → runner=${r.b11_b}`);
      }
      metrics.b11_b = r.b11_b;
    }
    b11Source = 'runner';
    fs.unlinkSync(b11ResultPath); // consume — don't let it leak into the next run
  }
} catch { /* non-fatal — fall back to self-reported metrics */ }

// ─── Derive `recoveries` from the contemporaneous recovery.log (audit Fix #1) ─
// Semi-independent: counts SELF-RECOVER `[Attempt N/M]` lines written as recovery
// happened, rather than trusting the single end-of-run summary number. Harder to
// game (an under-reported count is corrected here), but it is still model-authored
// text, NOT a sensor — see friction-meter.ts. So `recoveries` is tagged 'derived',
// a tier below the machine-measured b11 verdicts, and is NOT promoted to the
// independent-verification set in improve-trigger (that cross-check would be circular).
const measuredRecoveries = countRecoveryAttempts(path.join(featureDir, 'recovery.log'));
let recoveriesSource: MetricSource = 'self_reported';
if (measuredRecoveries !== null) {
  if (metrics.recoveries !== undefined && metrics.recoveries !== measuredRecoveries) {
    console.error(`⚠️  recoveries corrected from recovery.log: self-reported=${metrics.recoveries} → counted=${measuredRecoveries}`);
  }
  metrics.recoveries = measuredRecoveries;
  recoveriesSource = 'derived';
}

// ─── Compute friction ─────────────────────────────────────────────────────────

const frictionMetrics: FrictionMetrics = {
  clarificationCycles: metrics.clarificationCycles ?? 0,
  gateRevisions: metrics.gateRevisions ?? 0,
  recoveries: metrics.recoveries ?? 0,
  manualCorrections: metrics.manualCorrections ?? 0,
  rePlans: metrics.rePlans ?? 0,
  implementationRetries: metrics.implementationRetries ?? 0,
  verificationRetries: metrics.verificationRetries ?? 0,
};

const frictionScore = computeFrictionScore(frictionMetrics);
const frictionLevel = classifyFriction(frictionScore);

// ─── Format entry ────────────────────────────────────────────────────────────

function formatAutoEntry(ts: string, name: string, m: Metrics): string {
  const rf = m.reflectionFinal !== undefined
    ? (typeof m.reflectionFinal === 'number' ? `${m.reflectionFinal}%` : String(m.reflectionFinal))
    : 'N/A';
  const rec = m.recoveries !== undefined ? String(m.recoveries) : '0';
  const b11a = m.b11_a ?? 'N/A';
  const b11b = m.b11_b ?? 'N/A';
  const b96 = m.b9_6 ?? 'skip';
  const conflict = m.peerConflict ? 'yes' : 'no';
  const skipped = m.skipped && m.skipped.length > 0 ? m.skipped.join(', ') : 'none';
  const cycleback = m.designCycleback ? 'yes' : 'no';
  const gates = m.gatesRevised && m.gatesRevised.length > 0 ? m.gatesRevised.join(', ') : 'none';
  const version = m.promptVersion ?? 'N/A';

  // Line 3 carries friction data for the extended parser in feedback-analyzer.ts
  const frictionLine = [
    `friction_score: ${frictionScore}`,
    `friction_level: ${frictionLevel}`,
    `clarification_cycles: ${frictionMetrics.clarificationCycles}`,
    `gate_revisions: ${frictionMetrics.gateRevisions}`,
    `manual_corrections: ${frictionMetrics.manualCorrections}`,
    `re_plans: ${frictionMetrics.rePlans}`,
    `impl_retries: ${frictionMetrics.implementationRetries}`,
    `verif_retries: ${frictionMetrics.verificationRetries}`,
    `prompt_version: ${version}`,
  ].join(' | ');

  return [
    `[${ts}] [${name}] [auto]`,
    `reflection_final: ${rf} | recoveries: ${rec} | b11_a: ${b11a} | b11_b: ${b11b}`,
    `b9_6: ${b96} | peer_conflict: ${conflict} | skipped: [${skipped}] | design_cycleback: ${cycleback} | gates_revised: [${gates}]`,
    frictionLine,
  ].join('\n');
}

function formatUserEntry(ts: string, name: string, text: string): string {
  return `[${ts}] [${name}] [user]\n${text}`;
}

// ─── KPI record ───────────────────────────────────────────────────────────────

function buildKpi(ts: string, name: string, m: Metrics): RunKPI {
  const rf = m.reflectionFinal !== undefined
    ? (typeof m.reflectionFinal === 'number' ? m.reflectionFinal : parseInt(String(m.reflectionFinal), 10) || null)
    : null;

  return {
    timestamp: ts,
    featureName: name,
    promptVersion: m.promptVersion ?? 'unknown',
    frictionScore,
    frictionLevel,
    clarificationCycles: frictionMetrics.clarificationCycles,
    gateRevisions: frictionMetrics.gateRevisions,
    recoveries: frictionMetrics.recoveries,
    manualCorrections: frictionMetrics.manualCorrections,
    rePlans: frictionMetrics.rePlans,
    implementationRetries: frictionMetrics.implementationRetries,
    verificationRetries: frictionMetrics.verificationRetries,
    b11_a: m.b11_a ?? 'N/A',
    b11_b: m.b11_b ?? 'N/A',
    b9_6: m.b9_6 ?? 'skip',
    reflectionFinal: rf,
    designCycleback: m.designCycleback ?? false,
    rootCauses: m.rootCauses ?? [],
    escapedDefects: m.escapedDefects ?? 0,
    metricSources: {
      b11_a: b11Source === 'runner' ? 'machine' : 'self_reported',
      b11_b: b11Source === 'runner' ? 'machine' : 'self_reported',
      recoveries: recoveriesSource,
      clarificationCycles: 'self_reported',
      gateRevisions: 'self_reported',
      manualCorrections: 'self_reported',
      rePlans: 'self_reported',
      implementationRetries: 'self_reported',
      verificationRetries: 'self_reported',
      frictionScore: 'self_reported',
    },
  };
}

// ─── Trim to N most recent entries ───────────────────────────────────────────

const ENTRY_SEPARATOR = '\n\n---\n\n';
const MAX_ENTRIES = 10;

function trimHistory(content: string): string {
  const entries = content.split(ENTRY_SEPARATOR).filter((e) => e.trim().length > 0);
  if (entries.length <= MAX_ENTRIES) return content;
  return entries.slice(0, MAX_ENTRIES).join(ENTRY_SEPARATOR) + '\n';
}

// ─── Write ────────────────────────────────────────────────────────────────────

function appendEntry(filePath: string, entry: string): number {
  let existing = '';
  try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new file */ }

  const newContent = entry + ENTRY_SEPARATOR + existing;
  const trimmed = trimHistory(newContent);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, trimmed, 'utf-8');

  return trimmed.split(ENTRY_SEPARATOR).filter((e) => e.trim().length > 0).length;
}

function appendKpi(filePath: string, kpi: RunKPI): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(kpi) + '\n', 'utf-8');
  } catch { /* non-fatal */ }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const ts = new Date().toISOString();
const autoEntry = formatAutoEntry(ts, featureName, metrics);

// Write to per-feature log (append, chronological)
try {
  fs.mkdirSync(featureDir, { recursive: true });
  fs.appendFileSync(featureLogPath, autoEntry + '\n\n');
} catch { /* non-fatal */ }

// Write to global history (prepend, trimmed)
const entryCount = appendEntry(globalHistoryPath, autoEntry);

// Write KPI to NDJSON history
const kpi = buildKpi(ts, featureName, metrics);
appendKpi(kpiHistoryPath, kpi);

// Optional user feedback
if (metrics.userFeedback) {
  const userEntry = formatUserEntry(new Date().toISOString(), featureName, metrics.userFeedback);
  appendEntry(globalHistoryPath, userEntry);
}

if (b11Drift.length > 0) {
  console.error(`⚠️  B11 metrics corrected from runner ground truth: ${b11Drift.join('; ')}`);
}

console.log(JSON.stringify({ ok: true, entryCount, frictionScore, frictionLevel, b11Source, recoveriesSource }));

// Fire-and-forget: run improve-trigger after every logged run so the control loop stays current
try {
  spawn(
    'npx',
    ['tsx', '.claude/integrations/improve-trigger.ts', '--history-file', globalHistoryPath],
    { cwd: process.cwd(), detached: true, stdio: 'ignore', shell: true }
  ).unref();
} catch { /* non-fatal — improve-trigger is best-effort */ }
