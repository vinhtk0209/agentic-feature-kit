#!/usr/bin/env node
/**
 * eval-ab.ts — A/B compare two prompt versions on the SAME spec cases (A-01).
 *
 * The deterministic part is the SCORE → DELTA comparison (this file): it imports the pure
 * `scoreFeature` from eval-feature.ts and diffs the two versions' scorecards per category.
 *
 * Generation is NOT done here (re-running the LLM workflow per version costs quota and isn't
 * reproducible in a script). Workflow:
 *   1. Generate the feature with the BASE prompt version    → <baseFolder> (+ docs/specs/<F> = specDir)
 *   2. Generate the feature with the CANDIDATE prompt version → <candFolder> (same specDir)
 *   3. npx tsx eval-ab.ts --base v3.16 --candidate v3.17 \
 *        --case "<baseFolder>::<candFolder>::<specDir>" [--case ...] [--response-transform transformResponse]
 *
 * Output: a markdown table of per-category score (base vs candidate vs Δ) averaged across cases,
 * with win/loss/tie per category and an overall verdict. Exit 1 if the candidate regresses overall.
 */
import { scoreFeature, type Scorecard } from './eval-feature';

export interface AbCategory {
  name: string;
  base: number;
  candidate: number;
  delta: number;
  verdict: 'win' | 'loss' | 'tie';
}
export interface AbResult {
  categories: AbCategory[];
  baseOverall: number;
  candOverall: number;
  overallDelta: number;
  wins: number;
  losses: number;
  ties: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Average a category's score across scorecards (missing category = 0). */
function avgCat(cards: Scorecard[], cat: string): number {
  if (cards.length === 0) return 0;
  const sum = cards.reduce((a, c) => a + (c.categories.find((x) => x.name === cat)?.score ?? 0), 0);
  return sum / cards.length;
}

/** Pure A/B diff of two sets of scorecards (one per case, per version). Unit-tested. */
export function computeAbDelta(base: Scorecard[], cand: Scorecard[], threshold = 0.5): AbResult {
  const names = Array.from(new Set([...base, ...cand].flatMap((c) => c.categories.map((x) => x.name))));
  const categories: AbCategory[] = names.map((name) => {
    const b = r1(avgCat(base, name));
    const c = r1(avgCat(cand, name));
    const delta = r1(c - b);
    return { name, base: b, candidate: c, delta, verdict: delta > threshold ? 'win' : delta < -threshold ? 'loss' : 'tie' };
  });
  const overall = (cards: Scorecard[]) => (cards.length ? cards.reduce((a, c) => a + c.overall, 0) / cards.length : 0);
  const baseOverall = r1(overall(base));
  const candOverall = r1(overall(cand));
  return {
    categories,
    baseOverall,
    candOverall,
    overallDelta: r1(candOverall - baseOverall),
    wins: categories.filter((c) => c.verdict === 'win').length,
    losses: categories.filter((c) => c.verdict === 'loss').length,
    ties: categories.filter((c) => c.verdict === 'tie').length,
  };
}

export function renderMarkdown(baseLabel: string, candLabel: string, res: AbResult): string {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const icon = (v: string) => (v === 'win' ? '🟢' : v === 'loss' ? '🔴' : '⚪');
  const rows = res.categories
    .map((c) => `| ${c.name} | ${c.base} | ${c.candidate} | ${sign(c.delta)} | ${icon(c.verdict)} ${c.verdict} |`)
    .join('\n');
  return [
    `### A/B eval — base \`${baseLabel}\` vs candidate \`${candLabel}\``,
    '',
    '| Category | Base | Candidate | Δ | Verdict |',
    '|----------|------|-----------|---|---------|',
    rows,
    `| **Overall** | **${res.baseOverall}** | **${res.candOverall}** | **${sign(res.overallDelta)}** | ${res.overallDelta >= 0 ? '🟢 keep/ship' : '🔴 regression'} |`,
    '',
    `Wins ${res.wins} · Losses ${res.losses} · Ties ${res.ties}.`,
  ].join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const opt: Record<string, string> = {};
  const cases: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') cases.push(argv[++i]);
    else if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
  }
  const baseLabel = opt.base ?? 'base';
  const candLabel = opt.candidate ?? 'candidate';
  if (cases.length === 0) {
    console.error('usage: eval-ab.ts --base <label> --candidate <label> --case "<baseFolder>::<candFolder>::<specDir>" [--case ...] [--response-transform fn]');
    process.exit(2);
  }
  const baseCards: Scorecard[] = [];
  const candCards: Scorecard[] = [];
  for (const c of cases) {
    const [baseFolder, candFolder, specDir] = c.split('::');
    if (!baseFolder || !candFolder || !specDir) { console.error(`bad --case (need base::cand::spec): ${c}`); process.exit(2); }
    baseCards.push(scoreFeature({ folder: baseFolder, specDir, responseTransform: opt['response-transform'] }));
    candCards.push(scoreFeature({ folder: candFolder, specDir, responseTransform: opt['response-transform'] }));
  }
  const res = computeAbDelta(baseCards, candCards);
  if (opt.json !== undefined || process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else console.log(renderMarkdown(baseLabel, candLabel, res));
  process.exit(res.overallDelta < 0 ? 1 : 0);
}

if (process.argv[1] && /[\\/]eval-ab\.ts$/.test(process.argv[1])) main();
