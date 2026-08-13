#!/usr/bin/env node
/**
 * kpi-report.ts — KPI history reader and dashboard generator
 *
 * Reads docs/specs/.kpi-history.jsonl (NDJSON) and produces:
 *   - Trend report (friction over time, by prompt version)
 *   - Dashboard markdown for docs/claude-commands/DASHBOARD.md
 *
 * Usage:
 *   npx tsx .claude/integrations/kpi-report.ts
 *   npx tsx .claude/integrations/kpi-report.ts --last-n 10
 *   npx tsx .claude/integrations/kpi-report.ts --by-version
 *   npx tsx .claude/integrations/kpi-report.ts --json
 *   npx tsx .claude/integrations/kpi-report.ts --dashboard
 *   npx tsx .claude/integrations/kpi-report.ts --kpi-file path/to/file.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FrictionLevel } from './feedback-analyzer';
import {
  CliReliabilityError,
  atomicWriteTextFile,
  classifyFileReadError,
  emitCliError,
  parseStrictFlags,
} from './cli-reliability';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RunKPI {
  timestamp: string;
  featureName: string;
  promptVersion: string;
  frictionScore: number;
  frictionLevel: FrictionLevel;
  clarificationCycles: number;
  gateRevisions: number;
  recoveries: number;
  manualCorrections: number;
  rePlans: number;
  implementationRetries: number;
  verificationRetries: number;
  b11_a: string;
  b11_b: string;
  b9_6: string;
  reflectionFinal: number | null;
  designCycleback: boolean;
  rootCauses: string[];
  escapedDefects: number;
}

interface VersionSummary {
  version: string;
  runs: number;
  avgFriction: number;
  smoothPct: number;
  highOrFailedPct: number;
  b11aPassPct: number;
  avgReflection: number | null;
}

interface KpiReport {
  totalRuns: number;
  window: { first: string; last: string } | null;
  avgFriction: number;
  frictionLevelCounts: Record<FrictionLevel, number>;
  topRootCauses: Array<{ category: string; count: number }>;
  recentRuns: RunKPI[];
  versionSummaries: VersionSummary[];
}

// ─── Reader ──────────────────────────────────────────────────────────────────

function readKpiHistory(filePath: string, requireFile = false): RunKPI[] {
  if (!fs.existsSync(filePath)) {
    if (requireFile) throw new CliReliabilityError('INPUT_NOT_FOUND', `input file not found: ${filePath}`);
    return [];
  }
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  } catch (error) {
    throw classifyFileReadError(error, filePath);
  }
  const lines = content.split('\n');
  const records: RunKPI[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t) as RunKPI);
    } catch {
      throw new CliReliabilityError('MALFORMED_INPUT', `malformed KPI JSON at line ${lineIndex + 1}`);
    }
  }
  return records;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function buildReport(records: RunKPI[], lastN?: number): KpiReport {
  const all = lastN ? records.slice(-lastN) : records;
  if (all.length === 0) {
    return {
      totalRuns: 0,
      window: null,
      avgFriction: 0,
      frictionLevelCounts: { smooth: 0, minor: 0, moderate: 0, high: 0, failed: 0 },
      topRootCauses: [],
      recentRuns: [],
      versionSummaries: [],
    };
  }

  const levelCounts: Record<FrictionLevel, number> = { smooth: 0, minor: 0, moderate: 0, high: 0, failed: 0 };
  const rootCauseMap = new Map<string, number>();

  for (const r of all) {
    levelCounts[r.frictionLevel] = (levelCounts[r.frictionLevel] ?? 0) + 1;
    (r.rootCauses ?? []).forEach((rc) => rootCauseMap.set(rc, (rootCauseMap.get(rc) ?? 0) + 1));
  }

  const topRootCauses = [...rootCauseMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  // Per-version summaries
  const versionMap = new Map<string, RunKPI[]>();
  for (const r of all) {
    const v = r.promptVersion ?? 'unknown';
    const list = versionMap.get(v) ?? [];
    list.push(r);
    versionMap.set(v, list);
  }

  const versionSummaries: VersionSummary[] = [...versionMap.entries()].map(([version, runs]) => {
    const reflections = runs.map((r) => r.reflectionFinal).filter((x): x is number => x !== null);
    return {
      version,
      runs: runs.length,
      avgFriction: avg(runs.map((r) => r.frictionScore)),
      smoothPct: pct(runs.filter((r) => r.frictionLevel === 'smooth' || r.frictionLevel === 'minor').length, runs.length),
      highOrFailedPct: pct(runs.filter((r) => r.frictionLevel === 'high' || r.frictionLevel === 'failed').length, runs.length),
      b11aPassPct: pct(runs.filter((r) => r.b11_a === 'pass').length, runs.length),
      avgReflection: reflections.length > 0 ? avg(reflections) : null,
    };
  });

  return {
    totalRuns: all.length,
    window: { first: all[0].timestamp.slice(0, 10), last: all[all.length - 1].timestamp.slice(0, 10) },
    avgFriction: avg(all.map((r) => r.frictionScore)),
    frictionLevelCounts: levelCounts,
    topRootCauses,
    recentRuns: all.slice(-10),
    versionSummaries,
  };
}

// ─── Dashboard markdown ───────────────────────────────────────────────────────

function frictionBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
}

function levelBadge(level: FrictionLevel): string {
  if (level === 'smooth') return '✅ smooth';
  if (level === 'minor') return '🟢 minor';
  if (level === 'moderate') return '🟡 moderate';
  if (level === 'high') return '🔴 high';
  return '💀 failed';
}

function buildDashboard(report: KpiReport, allRecords: RunKPI[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Workflow KPI Dashboard`);
  lines.push(`\n_Last updated: ${date}_\n`);
  lines.push(`---\n`);

  if (report.totalRuns === 0) {
    lines.push('No KPI data yet. Run a feature through the full B0–B12 workflow to populate this dashboard.');
    return lines.join('\n');
  }

  lines.push(`## Summary (${report.totalRuns} runs${report.window ? `, ${report.window.first} – ${report.window.last}` : ''})\n`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Avg friction score | ${report.avgFriction}/100 |`);
  lines.push(`| Smooth/Minor runs | ${report.frictionLevelCounts.smooth + report.frictionLevelCounts.minor}/${report.totalRuns} (${pct(report.frictionLevelCounts.smooth + report.frictionLevelCounts.minor, report.totalRuns)}%) |`);
  lines.push(`| High/Failed runs | ${report.frictionLevelCounts.high + report.frictionLevelCounts.failed}/${report.totalRuns} (${pct(report.frictionLevelCounts.high + report.frictionLevelCounts.failed, report.totalRuns)}%) |`);

  lines.push(`\n## Friction Distribution\n`);
  lines.push(`| Level | Count |`);
  lines.push(`|-------|-------|`);
  ((['smooth', 'minor', 'moderate', 'high', 'failed']) as FrictionLevel[]).forEach((lv) => {
    lines.push(`| ${levelBadge(lv)} | ${report.frictionLevelCounts[lv]} |`);
  });

  if (report.versionSummaries.length > 0) {
    lines.push(`\n## By Prompt Version\n`);
    lines.push(`| Version | Runs | Avg Friction | Smooth+Minor% | High+Failed% | B11-A Pass% |`);
    lines.push(`|---------|------|-------------|---------------|--------------|-------------|`);
    for (const vs of report.versionSummaries) {
      lines.push(`| ${vs.version} | ${vs.runs} | ${vs.avgFriction} | ${vs.smoothPct}% | ${vs.highOrFailedPct}% | ${vs.b11aPassPct}% |`);
    }
  }

  if (report.topRootCauses.length > 0) {
    lines.push(`\n## Top Root Causes\n`);
    lines.push(`| Root Cause | Occurrences |`);
    lines.push(`|------------|-------------|`);
    for (const rc of report.topRootCauses) {
      lines.push(`| ${rc.category} | ${rc.count} |`);
    }
  }

  lines.push(`\n## Last 10 Runs\n`);
  lines.push(`| Feature | Date | Friction | Level | B11-A | B11-B |`);
  lines.push(`|---------|------|----------|-------|-------|-------|`);
  for (const r of report.recentRuns) {
    lines.push(`| ${r.featureName} | ${r.timestamp.slice(0, 10)} | ${r.frictionScore} | ${levelBadge(r.frictionLevel)} | ${r.b11_a} | ${r.b11_b} |`);
  }

  lines.push(`\n---\n_Generated by \`kpi-report.ts\`. Run \`npm run workflow:kpis\` to update._\n`);
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runKpiReportCli(args: readonly string[], cwd = process.cwd()): void {
  const flags = parseStrictFlags(args, {
    '--kpi-file': 'value',
    '--last-n': 'value',
    '--json': 'boolean',
    '--by-version': 'boolean',
    '--dashboard': 'boolean',
  });
  const modes = ['--json', '--by-version', '--dashboard'].filter((flag) => flags.has(flag));
  if (modes.length > 1) throw new CliReliabilityError('ARGUMENT_ERROR', `output modes are mutually exclusive: ${modes.join(', ')}`);
  const explicitKpiFile = flags.get('--kpi-file');
  const kpiFile = typeof explicitKpiFile === 'string'
    ? path.resolve(cwd, explicitKpiFile)
    : path.join(cwd, 'docs', 'specs', '.kpi-history.jsonl');
  const rawLastN = flags.get('--last-n');
  const lastN = typeof rawLastN === 'string' ? Number(rawLastN) : undefined;
  if (lastN !== undefined && (!Number.isSafeInteger(lastN) || lastN <= 0)) {
    throw new CliReliabilityError('ARGUMENT_ERROR', '--last-n must be a positive safe integer');
  }
  const allRecords = readKpiHistory(kpiFile, typeof explicitKpiFile === 'string');
  const report = buildReport(allRecords, lastN);

  if (flags.has('--dashboard')) {
    const md = buildDashboard(report, allRecords);
    const dashboardPath = path.join(cwd, 'docs', 'claude-commands', 'DASHBOARD.md');
    atomicWriteTextFile(dashboardPath, md);
    console.log(`Dashboard written to ${dashboardPath}`);
  } else if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (flags.has('--by-version')) {
    if (report.versionSummaries.length === 0) {
      console.log('No KPI data found.');
    } else {
      console.log('\n📊 KPI by Prompt Version\n');
      console.log('Version'.padEnd(12) + 'Runs'.padEnd(6) + 'AvgFriction'.padEnd(13) + 'Smooth+Minor%'.padEnd(15) + 'B11-A Pass%');
      console.log('─'.repeat(60));
      for (const vs of report.versionSummaries) {
        console.log(
          vs.version.padEnd(12) +
          String(vs.runs).padEnd(6) +
          String(vs.avgFriction).padEnd(13) +
          `${vs.smoothPct}%`.padEnd(15) +
          `${vs.b11aPassPct}%`
        );
      }
    }
  } else {
    if (report.totalRuns === 0) {
      console.log('No KPI data found. Run a feature to populate .kpi-history.jsonl');
    } else {
      console.log(`\n📈 KPI Summary — ${report.totalRuns} runs\n`);
      console.log(`  Avg friction: ${frictionBar(report.avgFriction)}`);
      const lc = report.frictionLevelCounts;
      console.log(`  Levels: smooth=${lc.smooth} minor=${lc.minor} moderate=${lc.moderate} high=${lc.high} failed=${lc.failed}`);
      if (report.topRootCauses.length > 0) {
        console.log(`  Top root causes: ${report.topRootCauses.slice(0, 3).map((r) => `${r.category}(${r.count})`).join(', ')}`);
      }
      console.log('');
      console.log('  Last 5 runs:');
      for (const r of report.recentRuns.slice(-5)) {
        console.log(`    ${r.timestamp.slice(0, 10)} ${r.featureName}: score=${r.frictionScore} [${r.frictionLevel}] b11_a=${r.b11_a}`);
      }
    }
  }
}

const kpiLauncher = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (require.main === module && /kpi-report\.(?:ts|js|cjs|mjs)$/.test(kpiLauncher)) {
  try {
    runKpiReportCli(process.argv.slice(2));
  } catch (error) {
    process.exitCode = emitCliError('kpi-report', error);
  }
}
