/**
 * prompt-budget.test.ts — tests for the prompt size ratchet.
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/prompt-budget.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { splitSections, analyzeBudget } from './prompt-budget';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

const DOC = [
  'preamble line',
  '## Alpha',
  'a'.repeat(100),
  '### Alpha sub (not a top-level section)',
  'more alpha',
  '## Beta',
  'b'.repeat(50),
].join('\n');

test('splitSections — preamble + top-level ## sections, ### stays inside its parent', () => {
  const s = splitSections(DOC);
  const titles = s.map((x) => x.title);
  assert(titles.includes('(preamble)'), 'has preamble');
  assert(titles.includes('Alpha') && titles.includes('Beta'), 'has Alpha and Beta');
  assert(!titles.includes('Alpha sub (not a top-level section)'), '### is not split into its own section');
  const alpha = s.find((x) => x.title === 'Alpha')!;
  const beta = s.find((x) => x.title === 'Beta')!;
  assert(alpha.bytes > beta.bytes, 'Alpha (100 chars + sub) larger than Beta (50)');
});

test('analyzeBudget — within budget → not over, exit-safe', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
  try {
    const f = path.join(tmp, 'doc.md');
    fs.writeFileSync(f, 'x'.repeat(1024), 'utf8'); // 1 KB
    const r = analyzeBudget(f, 2); // budget 2 KB
    assert(r.kb >= 1 && r.kb <= 1.1, `~1 KB, got ${r.kb}`);
    assert(r.overBudget === false, 'within budget');
    assert(r.approxTokens > 0, 'token estimate present');
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } }
});

test('analyzeBudget — over budget is detected (the ratchet bites)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
  try {
    const f = path.join(tmp, 'doc.md');
    fs.writeFileSync(f, 'x'.repeat(3 * 1024), 'utf8'); // 3 KB
    const r = analyzeBudget(f, 2); // budget 2 KB
    assert(r.overBudget === true, 'must flag over-budget');
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } }
});

test('analyzeBudget — null budget never reports over (report-only mode)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-'));
  try {
    const f = path.join(tmp, 'doc.md');
    fs.writeFileSync(f, 'x'.repeat(9 * 1024), 'utf8');
    const r = analyzeBudget(f, null);
    assert(r.overBudget === false, 'no budget → never over');
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
