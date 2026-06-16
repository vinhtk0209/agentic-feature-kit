/**
 * feature-index.test.ts — tests for feature-index.ts
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/feature-index.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseContextJson, collectFeatures, renderIndex } from './feature-index';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`❌ ${name}\n     ${(e as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ctxMd(json: Record<string, unknown>, crlf = false): string {
  const body = `# Context Summary\n\n## Raw JSON\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
  return crlf ? body.replace(/\n/g, '\r\n') : body;
}

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feat-index-'));
}

// ─── parseContextJson ───────────────────────────────────────────────────────

test('parseContextJson — extracts LF-delimited block', () => {
  const parsed = parseContextJson(ctxMd({ phase: 'final_confirmed', featureName: 'X' }));
  assert(parsed?.phase === 'final_confirmed', `phase: ${parsed?.phase}`);
});

test('parseContextJson — tolerates CRLF line endings', () => {
  const parsed = parseContextJson(ctxMd({ phase: 'plan_confirmed', featureName: 'Y' }, true));
  assert(parsed?.featureName === 'Y', `featureName: ${parsed?.featureName}`);
});

test('parseContextJson — returns null when no json block', () => {
  assert(parseContextJson('# nothing here') === null, 'should be null');
});

// ─── collectFeatures ────────────────────────────────────────────────────────

test('collectFeatures — only includes dirs with context-summary.md', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'FeatA'));
  fs.writeFileSync(path.join(dir, 'FeatA', 'context-summary.md'),
    ctxMd({ phase: 'verify_complete', featureName: 'FeatA', taskType: 'NEW', updatedAt: '2026-01-02T00:00:00Z' }));
  fs.mkdirSync(path.join(dir, 'SpecOnly')); // no context-summary → skipped
  fs.writeFileSync(path.join(dir, 'SpecOnly', 'raw-spec.md'), 'spec');
  fs.mkdirSync(path.join(dir, '.amendments')); // dot-dir → skipped

  const rows = collectFeatures(dir);
  assert(rows.length === 1, `expected 1 row, got ${rows.length}`);
  assert(rows[0].feature === 'FeatA', `feature: ${rows[0].feature}`);
  assert(rows[0].taskType === 'NEW', `taskType: ${rows[0].taskType}`);
});

test('collectFeatures — finalConfirmed true from phase or flag; eval from baseline', () => {
  const dir = mkTmp();
  fs.mkdirSync(path.join(dir, 'Done'));
  fs.writeFileSync(path.join(dir, 'Done', 'context-summary.md'),
    ctxMd({ phase: 'final_confirmed', featureName: 'Done', updatedAt: '2026-01-03T00:00:00Z' }));
  fs.writeFileSync(path.join(dir, 'Done', 'eval-baseline.json'), JSON.stringify({ overall: 91 }));

  fs.mkdirSync(path.join(dir, 'Flagged'));
  fs.writeFileSync(path.join(dir, 'Flagged', 'context-summary.md'),
    ctxMd({ phase: 'verify_complete', featureName: 'Flagged', finalConfirmed: true, evalOverall: '88%', updatedAt: '2026-01-01T00:00:00Z' }));

  const rows = collectFeatures(dir);
  const done = rows.find((r) => r.feature === 'Done')!;
  const flagged = rows.find((r) => r.feature === 'Flagged')!;
  assert(done.finalConfirmed === true, 'phase=final_confirmed → finalConfirmed');
  assert(done.evalScore === '91', `eval from baseline: ${done.evalScore}`);
  assert(flagged.finalConfirmed === true, 'finalConfirmed flag honored');
  assert(flagged.evalScore === '88%', `eval from context fallback: ${flagged.evalScore}`);
});

test('collectFeatures — sorts most-recently-updated first', () => {
  const dir = mkTmp();
  for (const [name, ts] of [['Old', '2026-01-01T00:00:00Z'], ['New', '2026-06-01T00:00:00Z']] as const) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'context-summary.md'),
      ctxMd({ phase: 'scope_confirmed', featureName: name, updatedAt: ts }));
  }
  const rows = collectFeatures(dir);
  assert(rows[0].feature === 'New', `newest first, got ${rows[0].feature}`);
});

test('collectFeatures — empty/missing specs dir returns []', () => {
  assert(collectFeatures(path.join(os.tmpdir(), 'does-not-exist-xyz')).length === 0, 'missing → []');
});

// ─── renderIndex ────────────────────────────────────────────────────────────

test('renderIndex — deterministic table with final marker', () => {
  const out = renderIndex([
    { feature: 'A', phase: 'final_confirmed', taskType: 'BASELINE', evalScore: '91', finalConfirmed: true, lastUpdated: '2026-01-03T00:00:00Z' },
  ]);
  assert(out.includes('| A | final_confirmed | BASELINE | 91 | ✅ | 2026-01-03 |'), `row missing:\n${out}`);
  assert(out.includes('1 final-confirmed'), 'should count final-confirmed');
  // Determinism: same input → identical bytes.
  assert(out === renderIndex([
    { feature: 'A', phase: 'final_confirmed', taskType: 'BASELINE', evalScore: '91', finalConfirmed: true, lastUpdated: '2026-01-03T00:00:00Z' },
  ]), 'render must be deterministic');
});

test('renderIndex — empty rows renders placeholder', () => {
  assert(renderIndex([]).includes('_No feature folders found._'), 'empty placeholder');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
