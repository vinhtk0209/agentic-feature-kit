/**
 * eval-feature.ts — quality scorecard + regression harness for a workflow-generated feature.
 *
 * Aggregates the existing gates into ONE measurable score so prompt changes can be *measured*,
 * not just reasoned about. Five categories:
 *   1. Artifacts     — required spec-folder files present & non-trivial
 *   2. Checklist     — 5 sections present (REQ/UI/ACT/UX/Playwright) + row-count sanity
 *   3. Code quality  — lint-feature HR33 + quality + test-quality + HR34 (0 errors = 100)
 *   4. AC coverage   — lint-feature HR36 (% of ACT rows with a real test)
 *   5. Verification  — lint-feature HR35 (% of UI+ACT rows verified, from checklist Summary)
 *
 * Regression mode: --write-baseline <file> snapshots the scorecard; --baseline <file> compares and
 * flags any category that dropped vs the baseline. --gate exits 1 on regression or overall < --min.
 *
 * Usage:
 *   npx tsx .claude/integrations/eval-feature.ts <feature-src-folder> --spec docs/specs/<F> \
 *     [--response-transform transformResponse] [--min 80] [--gate] [--json] \
 *     [--write-baseline <f.json>] [--baseline <f.json>]
 */

import * as fs from 'fs';
import * as path from 'path';
import { lint } from './lint-feature';
import { loadModelConfig } from './model-config';

export interface CatScore { name: string; score: number; status: 'pass' | 'warn' | 'fail'; detail: string; }
export interface Scorecard { feature: string; categories: CatScore[]; overall: number; model?: string; }

/** Categories that dropped vs a baseline scorecard (regression detection). */
export function compareBaseline(card: Scorecard, base: Scorecard): string[] {
  const regressions: string[] = [];
  for (const c of card.categories) {
    const b = base.categories.find((x) => x.name === c.name);
    if (b && c.score < b.score) regressions.push(`${c.name}: ${b.score}→${c.score}`);
  }
  if (card.overall < base.overall) regressions.push(`overall: ${base.overall}→${card.overall}`);
  return regressions;
}

const REQUIRED_ARTIFACTS = ['raw-spec.md', 'processed.md', 'task-type.md', 'context-summary.md', 'diagram.md', 'steps.md', 'checklist.md', 'ux-states.json', 'speckit-lenses.md'];
const CHECKLIST_SECTIONS: [string, RegExp][] = [
  ['Requirements', /##\s*Requirements/i],
  ['UI Verification', /##\s*UI\s*Verification/i],
  ['ACT', /##\s*ACT/i],
  ['UX States', /##\s*UX\s*States/i],
  ['Playwright', /##\s*Playwright/i],
];

function pctFromFinding(msgs: string[], re: RegExp): number | null {
  for (const m of msgs) { const x = m.match(re); if (x) return Number(x[1]); }
  return null;
}

export function evalArtifacts(specDir: string): CatScore {
  const present = REQUIRED_ARTIFACTS.filter((f) => {
    const p = path.join(specDir, f);
    return fs.existsSync(p) && fs.statSync(p).size > 40; // non-trivial
  });
  const score = Math.round((present.length / REQUIRED_ARTIFACTS.length) * 100);
  const missing = REQUIRED_ARTIFACTS.filter((f) => !present.includes(f));
  return { name: 'Artifacts', score, status: score === 100 ? 'pass' : 'fail', detail: `${present.length}/${REQUIRED_ARTIFACTS.length} present${missing.length ? ` — missing: ${missing.join(', ')}` : ''}` };
}

export function evalChecklist(specDir: string): CatScore {
  const file = path.join(specDir, 'checklist.md');
  if (!fs.existsSync(file)) return { name: 'Checklist', score: 0, status: 'fail', detail: 'checklist.md absent' };
  const md = fs.readFileSync(file, 'utf8');
  const have = CHECKLIST_SECTIONS.filter(([, re]) => re.test(md));
  const missing = CHECKLIST_SECTIONS.filter(([, re]) => !re.test(md)).map(([n]) => n);
  const uniq = (re: RegExp) => new Set(md.match(re) || []).size; // unique IDs, not raw occurrences
  const ui = uniq(/\bUI-[\w.]+\b/g); const act = uniq(/\bACT-[\w.]+\b/g);
  let score = Math.round((have.length / CHECKLIST_SECTIONS.length) * 100);
  const notes: string[] = [`ui=${ui} act=${act}`];
  if (missing.length) notes.push(`missing: ${missing.join(', ')}`);
  // HR22 sanity (warn, small penalty)
  if (ui < 12 || ui > 22) { score -= 5; notes.push(`ui out of [12,22]`); }
  if (act < 13) { score -= 5; notes.push(`act < 13`); }
  score = Math.max(0, score);
  return { name: 'Checklist', score, status: missing.length ? 'fail' : (score < 100 ? 'warn' : 'pass'), detail: notes.join(' · ') };
}

/** Pure scorer — runs the 5 categories and returns the scorecard. Reusable / testable. */
export function scoreFeature(opts: { folder: string; specDir: string; responseTransform?: string; model?: string }): Scorecard {
  const checklist = path.join(opts.specDir, 'checklist.md');
  const uxStates = path.join(opts.specDir, 'ux-states.json');
  const findings = lint({ folder: opts.folder, checklist, uxStates, responseTransform: opts.responseTransform || 'transformResponse', minVerified: 0.6, gate: false, json: false, codeOnly: false });
  const allMsgs = findings.map((f) => f.msg);

  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  const codeErrors = findings.filter((f) => f.level === 'error' && ['HR33', 'HR34', 'quality', 'test-quality'].includes(f.rule)).length;
  const codeScore = codeErrors === 0 ? 100 : Math.max(0, 100 - codeErrors * 12);
  const acPct = clamp(pctFromFinding(allMsgs, /AC coverage (\d+)%/) ?? (allMsgs.some((m) => /AC coverage 100%/.test(m)) ? 100 : (findings.some((f) => f.rule === 'HR36') ? 0 : 100)));
  const verPct = clamp(pctFromFinding(allMsgs, /verified.*?=\s*(\d+)%/) ?? 100);

  const cats: CatScore[] = [
    evalArtifacts(opts.specDir),
    evalChecklist(opts.specDir),
    { name: 'Code quality', score: codeScore, status: codeErrors === 0 ? 'pass' : 'fail', detail: `${codeErrors} error(s) [HR33/HR34/quality/test-quality]` },
    { name: 'AC coverage', score: acPct, status: acPct >= 100 ? 'pass' : (acPct >= 80 ? 'warn' : 'fail'), detail: `${acPct}% [HR36]` },
    { name: 'Verification', score: verPct, status: verPct >= 60 ? 'pass' : 'fail', detail: `${verPct}% [HR35]` },
  ];
  const overall = clamp(Math.round(cats.reduce((s, c) => s + c.score, 0) / cats.length));
  // Tag the scorecard with the model used (A-03), when provided — kept optional so callers
  // that don't care (and existing baselines) are unaffected.
  return { feature: path.basename(opts.specDir), categories: cats, overall, ...(opts.model ? { model: opts.model } : {}) };
}

function main() {
  const argv = process.argv.slice(2);
  const rest: string[] = []; const opt: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--gate' || t === '--json') flags.add(t);
    else if (t.startsWith('--')) opt[t.slice(2)] = argv[++i];
    else rest.push(t);
  }
  const folder = rest[0];
  const specDir = opt.spec;
  if (!folder || !specDir) {
    console.error('usage: eval-feature.ts <feature-src-folder> --spec docs/specs/<F> [--response-transform fn] [--model opus] [--min 80] [--gate] [--json] [--write-baseline f] [--baseline f]');
    process.exit(2);
  }
  const min = Number(opt.min || '80');
  // Model tag (A-03): explicit --model wins, else the configured primary.
  const model = opt.model || loadModelConfig().primary;
  const card = scoreFeature({ folder, specDir, responseTransform: opt['response-transform'], model });
  const cats = card.categories;
  const overall = card.overall;

  // regression compare
  let regressions: string[] = [];
  if (opt.baseline && fs.existsSync(opt.baseline)) {
    const base: Scorecard = JSON.parse(fs.readFileSync(opt.baseline, 'utf8'));
    regressions = compareBaseline(card, base);
  }
  if (opt['write-baseline']) { fs.writeFileSync(opt['write-baseline'], JSON.stringify(card, null, 2)); }

  if (flags.has('--json')) {
    console.log(JSON.stringify({ ...card, regressions }, null, 2));
  } else {
    console.log(`\nEVAL · ${card.feature}${card.model ? ` · model=${card.model}` : ''}`);
    console.log('─'.repeat(64));
    for (const c of cats) {
      const icon = c.status === 'pass' ? '✅' : (c.status === 'warn' ? '⚠️' : '❌');
      console.log(`${icon} ${c.name.padEnd(14)} ${String(c.score).padStart(3)}%  ${c.detail}`);
    }
    console.log('─'.repeat(64));
    console.log(`Overall: ${overall}%  (min ${min}%)`);
    if (regressions.length) console.log(`⚠️  REGRESSIONS vs baseline: ${regressions.join(' · ')}`);
    if (opt['write-baseline']) console.log(`📌 baseline written: ${opt['write-baseline']}`);
    console.log('');
  }

  const failGate = (flags.has('--gate')) && (overall < min || regressions.length > 0);
  process.exit(failGate ? 1 : 0);
}

// Run the CLI only when invoked directly (not when imported by the test).
if (process.argv[1] && /eval-feature\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
