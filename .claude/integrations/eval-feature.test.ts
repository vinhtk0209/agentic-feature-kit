/**
 * Tests for eval-feature.ts (the regression harness's own logic).
 *   npx tsx .claude/integrations/eval-feature.test.ts   (or: npm run test:eval-feature)
 * Exit 0 = all pass, 1 = a test failed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  evalArtifacts, evalChecklist, compareBaseline, Scorecard,
} from './eval-feature';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-feature-test-'));
function write(rel: string, content: string) { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); return f; }

const NINE = ['raw-spec.md', 'processed.md', 'task-type.md', 'context-summary.md', 'diagram.md', 'steps.md', 'checklist.md', 'ux-states.json', 'speckit-lenses.md'];
const body = 'x'.repeat(80); // non-trivial (>40 bytes)

// full spec dir
const full = path.join(tmp, 'full');
NINE.forEach((f) => write(`full/${f}`, body));

test('Artifacts — all 9 present → 100% pass', () => {
  const c = evalArtifacts(full);
  assert(c.score === 100 && c.status === 'pass', `got ${c.score}/${c.status}`);
});

test('Artifacts — missing one → <100% fail, names it', () => {
  fs.rmSync(path.join(full, 'diagram.md'));
  const c = evalArtifacts(full);
  assert(c.score < 100 && c.status === 'fail', `got ${c.score}/${c.status}`);
  assert(c.detail.includes('diagram.md'), 'should name the missing file');
  write('full/diagram.md', body); // restore
});

test('Artifacts — present but trivial (≤40 bytes) does not count', () => {
  const partial = path.join(tmp, 'partial');
  NINE.forEach((f) => write(`partial/${f}`, f === 'steps.md' ? 'tiny' : body));
  const c = evalArtifacts(partial);
  assert(c.score < 100, `trivial steps.md should not count, got ${c.score}`);
});

// checklist with all 5 sections + healthy counts
const ui = Array.from({ length: 14 }, (_, i) => `| UI-${String(i + 1).padStart(2, '0')} | c | s | ⬜ |`).join('\n');
const act = Array.from({ length: 15 }, (_, i) => `| ACT-${String(i + 1).padStart(2, '0')} | t | s | ⬜ |`).join('\n');
write('full/checklist.md', `## Requirements\n## UI Verification\n${ui}\n## ACT — Acceptance Test Cases\n${act}\n## UX States\n## Playwright Verify\n`);

test('Checklist — 5 sections + counts in range → pass', () => {
  const c = evalChecklist(full);
  assert(c.status !== 'fail', `expected not-fail, got ${c.status} (${c.detail})`);
  assert(c.detail.includes('ui=14') && c.detail.includes('act=15'), `counts wrong: ${c.detail}`);
});

test('Checklist — missing a section → fail', () => {
  write('full/checklist.md', '## Requirements\n## UI Verification\n## ACT\n## UX States\n'); // no Playwright
  const c = evalChecklist(full);
  assert(c.status === 'fail' && c.detail.includes('Playwright'), `expected fail naming Playwright, got ${c.status} ${c.detail}`);
});

// regression compare
const base: Scorecard = { feature: 'F', overall: 80, categories: [{ name: 'Code quality', score: 100, status: 'pass', detail: '' }, { name: 'AC coverage', score: 90, status: 'pass', detail: '' }] };
test('compareBaseline — flags a dropped category + overall', () => {
  const now: Scorecard = { feature: 'F', overall: 70, categories: [{ name: 'Code quality', score: 100, status: 'pass', detail: '' }, { name: 'AC coverage', score: 75, status: 'fail', detail: '' }] };
  const regs = compareBaseline(now, base);
  assert(regs.some((r) => r.startsWith('AC coverage')), 'should flag AC coverage drop');
  assert(regs.some((r) => r.startsWith('overall')), 'should flag overall drop');
});
test('compareBaseline — no regression when equal or better', () => {
  const now: Scorecard = { feature: 'F', overall: 85, categories: [{ name: 'Code quality', score: 100, status: 'pass', detail: '' }, { name: 'AC coverage', score: 95, status: 'pass', detail: '' }] };
  assert(compareBaseline(now, base).length === 0, 'no regression expected');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
