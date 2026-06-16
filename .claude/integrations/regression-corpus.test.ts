/**
 * Tests for regression-corpus.ts — the deterministic golden-case guard itself.
 * Run: npx tsx .claude/integrations/regression-corpus.test.ts
 *
 * Closes the audit "untested core" gap: the guard that protects every other gate
 * had no test of its own. Verifies the corpus loads, every golden case holds, and
 * the prompt-size budget check passes for the pinned command file.
 */
import * as fs from 'fs';
import { runCorpus, runBudgetChecks, corpusDir } from './regression-corpus';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

test('corpus dir exists and holds the golden cases', () => {
  const dir = corpusDir();
  assert(fs.existsSync(dir), `corpus dir missing: ${dir}`);
  const cases = fs.readdirSync(dir).filter((f) => f.endsWith('.case.json'));
  assert(cases.length >= 6, `expected ≥6 *.case.json, got ${cases.length}`);
});

test('all golden corpus cases hold (no toolchain regression)', () => {
  const results = runCorpus(corpusDir());
  assert(results.length >= 6, `expected ≥6 results, got ${results.length}`);
  const regressions = results.filter((r) => !r.ok);
  assert(
    regressions.length === 0,
    `regressions: ${regressions.map((r) => `${r.id}: ${r.messages.join('; ')}`).join(' | ')}`,
  );
});

test('prompt-size budget check passes for the pinned command file', () => {
  const results = runBudgetChecks();
  assert(results.length >= 1, 'expected at least one budget-checked file');
  const over = results.filter((r) => !r.ok);
  assert(over.length === 0, `over budget: ${over.map((r) => `${r.id}: ${r.messages.join('; ')}`).join(' | ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
