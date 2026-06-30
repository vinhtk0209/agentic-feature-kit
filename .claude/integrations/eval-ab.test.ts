/**
 * Tests for eval-ab.ts — the A/B score-delta logic (no LLM, no quota).
 *   npx tsx .claude/integrations/eval-ab.test.ts   (or: npm run test:eval-ab)
 * Exit 0 = all pass, 1 = a test failed.
 */
import { computeAbDelta, renderMarkdown } from './eval-ab';
import type { Scorecard } from './eval-feature';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const card = (overall: number, cats: Record<string, number>): Scorecard => ({
  feature: 'F',
  overall,
  categories: Object.entries(cats).map(([name, score]) => ({ name, score, status: 'pass', detail: '' })),
});

test('candidate better on a category → win + positive overall delta', () => {
  const base = [card(70, { Artifacts: 80, Checklist: 60 })];
  const cand = [card(85, { Artifacts: 100, Checklist: 70 })];
  const r = computeAbDelta(base, cand);
  const art = r.categories.find((c) => c.name === 'Artifacts')!;
  assert(art.delta === 20 && art.verdict === 'win', `Artifacts ${art.delta}/${art.verdict}`);
  assert(r.overallDelta === 15, `overallDelta ${r.overallDelta}`);
  assert(r.wins === 2 && r.losses === 0, `wins ${r.wins} losses ${r.losses}`);
});

test('candidate worse → loss + negative overall (exit-1 condition)', () => {
  const base = [card(90, { Code: 100 })];
  const cand = [card(75, { Code: 60 })];
  const r = computeAbDelta(base, cand);
  assert(r.categories[0].verdict === 'loss', 'should be loss');
  assert(r.overallDelta === -15, `overallDelta ${r.overallDelta}`);
});

test('small diff under threshold → tie', () => {
  const r = computeAbDelta([card(80, { X: 80 })], [card(80, { X: 80.3 })]);
  assert(r.categories[0].verdict === 'tie', `got ${r.categories[0].verdict}`);
});

test('averages across multiple cases', () => {
  const base = [card(60, { A: 60 }), card(80, { A: 80 })]; // avg 70 / A 70
  const cand = [card(80, { A: 80 }), card(100, { A: 100 })]; // avg 90 / A 90
  const r = computeAbDelta(base, cand);
  assert(r.baseOverall === 70 && r.candOverall === 90 && r.overallDelta === 20, `${r.baseOverall}/${r.candOverall}/${r.overallDelta}`);
});

test('renderMarkdown emits a table with the verdict row', () => {
  const md = renderMarkdown('v3.16', 'v3.17', computeAbDelta([card(70, { A: 70 })], [card(90, { A: 90 })]));
  assert(md.includes('| Category | Base | Candidate'), 'has header');
  assert(md.includes('Overall') && md.includes('keep/ship'), 'has overall verdict');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
