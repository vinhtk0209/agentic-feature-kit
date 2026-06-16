#!/usr/bin/env node
/**
 * regression-corpus.ts — golden-case guard for the deterministic toolchain.
 *
 * WHY: learned rules (learned-config.ts), gate edits (lint-feature.ts), threshold
 * changes, and prompt/config evolution can silently regress behavior — a known-good
 * feature starts failing (false positive) or a known-bad one starts passing (false
 * negative). This runner replays a curated, growable corpus of cases and asserts the
 * EXPECTED verdict for each, so any such regression fails CI/B11 loudly.
 *
 * SCOPE (honest): this guards the DETERMINISTIC parts — the gates and analyzers the
 * learned loop touches. It does NOT re-run the LLM workflow end-to-end (not reproducible
 * in a script). Each gate case bundles its own learned-config state, so verdicts are
 * reproducible regardless of the live .learned-config.json.
 *
 * Cases live in .claude/integrations/corpus/*.case.json. Add one by dropping a file —
 * see corpus/README.md. Each case materializes its files in a temp dir, runs the tool,
 * and compares to `expect`.
 *
 * Usage:
 *   npx tsx .claude/integrations/regression-corpus.ts
 *   npx tsx .claude/integrations/regression-corpus.ts --json
 * Exit 0 = all cases hold, 1 = a regression.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lint, type Args } from './lint-feature';
import { analyze } from './feedback-analyzer';
import { analyzeBudget } from './prompt-budget';

// ─── Case schema ───────────────────────────────────────────────────────────────

interface GateCase {
  id: string;
  kind: 'gate';
  description: string;
  files: Record<string, string>;
  lint: {
    folder: string;
    uxStates?: string;
    checklist?: string;
    responseTransform?: string;
    minVerified?: number;
    codeOnly?: boolean;
  };
  expect: {
    gate: 'pass' | 'fail'; // pass = 0 error-level findings
    mustFlagRules?: string[];
    mustNotFlagRules?: string[];
  };
}

interface DetectorCase {
  id: string;
  kind: 'detector';
  description: string;
  files: Record<string, string>;
  historyFile?: string;
  expect: {
    patterns?: string[]; // pattern ids that MUST be detected
    notPatterns?: string[]; // pattern ids that must NOT be detected
    minTotalRuns?: number;
  };
}

type Case = GateCase | DetectorCase;

interface CaseResult { id: string; kind: string; ok: boolean; messages: string[]; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function materialize(files: Record<string, string>, root: string): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
}

function inTempCwd<T>(files: Record<string, string>, fn: () => T): T {
  const orig = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-'));
  try {
    materialize(files, tmp);
    process.chdir(tmp);
    return fn();
  } finally {
    process.chdir(orig);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ─── Runners ───────────────────────────────────────────────────────────────────

function runGateCase(c: GateCase): CaseResult {
  const messages: string[] = [];
  const result = inTempCwd(c.files, () => {
    const args: Args = {
      folder: c.lint.folder,
      checklist: c.lint.checklist,
      uxStates: c.lint.uxStates,
      responseTransform: c.lint.responseTransform ?? 'transformResponse',
      minVerified: c.lint.minVerified ?? 0.6,
      gate: false,
      json: false,
      codeOnly: c.lint.codeOnly ?? false,
    };
    return lint(args);
  });

  const errorRules = new Set(result.filter((f) => f.level === 'error').map((f) => f.rule));
  const errorCount = result.filter((f) => f.level === 'error').length;
  const gate: 'pass' | 'fail' = errorCount === 0 ? 'pass' : 'fail';

  if (gate !== c.expect.gate) {
    messages.push(`expected gate=${c.expect.gate} but got ${gate} (${errorCount} error-level finding(s): ${[...errorRules].join(', ') || 'none'})`);
  }
  for (const r of c.expect.mustFlagRules ?? []) {
    if (!errorRules.has(r)) messages.push(`expected rule "${r}" to be flagged as an error, but it was not`);
  }
  for (const r of c.expect.mustNotFlagRules ?? []) {
    if (errorRules.has(r)) messages.push(`rule "${r}" was flagged but the case forbids it (false positive / over-reach)`);
  }
  return { id: c.id, kind: c.kind, ok: messages.length === 0, messages };
}

function runDetectorCase(c: DetectorCase): CaseResult {
  const messages: string[] = [];
  const historyRel = c.historyFile ?? path.join('docs', 'specs', '.feedback-history.md');
  const res = inTempCwd(c.files, () => analyze(historyRel));

  const detected = new Set(res.patterns.map((p) => p.id));
  for (const p of c.expect.patterns ?? []) {
    if (!detected.has(p)) messages.push(`expected pattern "${p}" to be detected, but it was not (got: ${[...detected].join(', ') || 'none'})`);
  }
  for (const p of c.expect.notPatterns ?? []) {
    if (detected.has(p)) messages.push(`pattern "${p}" was detected but the case forbids it`);
  }
  if (c.expect.minTotalRuns !== undefined && res.totalRuns < c.expect.minTotalRuns) {
    messages.push(`expected totalRuns ≥ ${c.expect.minTotalRuns}, got ${res.totalRuns}`);
  }
  return { id: c.id, kind: c.kind, ok: messages.length === 0, messages };
}

// ─── Load + run ────────────────────────────────────────────────────────────────

export function corpusDir(): string {
  return path.join(__dirname, 'corpus');
}

function loadCases(dir: string): Case[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.case.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Case);
}

export function runCorpus(dir: string): CaseResult[] {
  return loadCases(dir).map((c) => (c.kind === 'gate' ? runGateCase(c) : runDetectorCase(c)));
}

// Prompt-size ratchet: files pinned in prompt-budget.json must stay within budget.
// Folded into the corpus so SESSION BOOTSTRAP Step 0.E enforces it with one command.
export function runBudgetChecks(): CaseResult[] {
  const cfgPath = path.join(process.cwd(), '.claude', 'integrations', 'prompt-budget.json');
  if (!fs.existsSync(cfgPath)) return [];
  let cfg: { files?: Record<string, number> };
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return []; }
  const out: CaseResult[] = [];
  for (const [rel, kb] of Object.entries(cfg.files ?? {})) {
    const file = path.join(process.cwd(), rel);
    if (!fs.existsSync(file)) {
      out.push({ id: `budget:${rel}`, kind: 'budget', ok: false, messages: [`file not found: ${rel}`] });
      continue;
    }
    const r = analyzeBudget(file, kb);
    out.push({
      id: `budget:${rel}`,
      kind: 'budget',
      ok: !r.overBudget,
      messages: r.overBudget ? [`${r.kb} KB exceeds budget ${kb} KB — trim a section or raise the budget in prompt-budget.json deliberately`] : [],
    });
  }
  return out;
}

if (process.argv[1] && /regression-corpus\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const dir = corpusDir();
  const cases = loadCases(dir);
  if (cases.length === 0) {
    console.error(`No corpus cases found in ${dir} (expected *.case.json).`);
    process.exit(2);
  }
  const results = [...runCorpus(dir), ...runBudgetChecks()];
  const failed = results.filter((r) => !r.ok);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  } else {
    console.log(`\n🧪 Regression corpus — ${results.length} case(s)\n`);
    for (const r of results) {
      console.log(`${r.ok ? '✅' : '❌'} [${r.kind}] ${r.id}`);
      for (const m of r.messages) console.log(`     ↳ ${m}`);
    }
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed\n`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}
