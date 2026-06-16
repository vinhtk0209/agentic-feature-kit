/**
 * feature-digest.test.ts — tests for feature-digest.ts
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/feature-digest.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isFinalConfirmed, gatherInputs, buildDigest, generateDigest } from './feature-digest';

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

function ctxMd(json: Record<string, unknown>): string {
  return `# Context Summary\n\n## Raw JSON\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
}

function mkFeature(json: Record<string, unknown>, extra: Record<string, string> = {}): { specs: string; name: string } {
  const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-digest-'));
  const name = (json.featureName as string) ?? 'Feat';
  const dir = path.join(specs, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'context-summary.md'), ctxMd(json));
  for (const [file, content] of Object.entries(extra)) {
    const fp = path.join(dir, file);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
  return { specs, name };
}

// ─── isFinalConfirmed ───────────────────────────────────────────────────────

test('isFinalConfirmed — true via phase or flag, false otherwise', () => {
  assert(isFinalConfirmed({ phase: 'final_confirmed' }), 'phase final_confirmed');
  assert(isFinalConfirmed({ phase: 'verify_complete', finalConfirmed: true }), 'flag');
  assert(!isFinalConfirmed({ phase: 'verify_complete' }), 'neither → false');
  assert(!isFinalConfirmed(null), 'null → false');
});

// ─── generateDigest trigger ─────────────────────────────────────────────────

test('generateDigest — skips when not final, unless --force', () => {
  const { specs, name } = mkFeature({ featureName: 'NotDone', phase: 'verify_complete' });
  const skipped = generateDigest(name, { specsDir: specs });
  assert(!skipped.written, 'should skip non-final');
  assert(!fs.existsSync(skipped.digestPath), 'no file written');

  const forced = generateDigest(name, { specsDir: specs, force: true });
  assert(forced.written, 'force should write');
  assert(fs.existsSync(forced.digestPath), 'digest file exists');
});

test('generateDigest — writes when final-confirmed', () => {
  const { specs, name } = mkFeature({ featureName: 'Done', phase: 'final_confirmed' });
  const res = generateDigest(name, { specsDir: specs });
  assert(res.written, 'should write for final feature');
  assert(fs.readFileSync(res.digestPath, 'utf-8').includes('# Feature Digest — Done'), 'has heading');
});

test('generateDigest — missing folder reports reason, does not throw', () => {
  const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-digest-'));
  const res = generateDigest('Ghost', { specsDir: specs });
  assert(!res.written && /not found/.test(res.reason ?? ''), `reason: ${res.reason}`);
});

// ─── buildDigest projection ─────────────────────────────────────────────────

test('buildDigest — projects eval, gates, AC, browser, fixes, BE headings', () => {
  const { specs, name } = mkFeature(
    {
      featureName: 'Rich',
      phase: 'final_confirmed',
      taskType: 'INCREMENTAL_UPDATE',
      jiraId: 'JIRA-1',
      gatesGreen: { jest: '10/10', tsc: 'clean' },
      regenerated: ['api.ts', 'transform.ts'],
      kept: ['types.ts'],
    },
    {
      'eval-baseline.json': JSON.stringify({
        overall: 94,
        categories: [
          { name: 'AC coverage', score: 100, status: 'pass', detail: '100% [HR36]' },
          { name: 'Verification', score: 75, status: 'pass', detail: '75% [HR35]' },
        ],
      }),
      'checklist.md': '| REQ-01 | x |\n| REQ-02 | y |\n| UI-01 | z |\n| ACT-01 | w |',
      'BE-integration-report.md': '## Summary\n\n## FIX-01\nKnown limitation: backend pending.',
      'screenshots/a.png': 'x',
      'screenshots/b.png': 'y',
      'ux-states.json': JSON.stringify([{ s: 1 }, { s: 2 }, { s: 3 }]),
    }
  );
  const inputs = gatherInputs(path.join(specs, name), name);
  const out = buildDigest(inputs);

  assert(out.includes('**94/100** overall'), 'eval overall');
  assert(out.includes('| jest | 10/10 |'), 'gate row');
  assert(out.includes('100% [HR36]'), 'AC coverage detail');
  assert(out.includes('REQ=2, UI=1, ACT=1'), `checklist counts: ${out.match(/REQ=.*/)?.[0]}`);
  assert(out.includes('Screenshots captured: 2'), 'screenshot count');
  assert(out.includes('UX states mapped: 3'), 'ux state count');
  assert(out.includes('- api.ts'), 'regenerated list');
  assert(out.includes('- FIX-01'), 'BE headings projected');
  assert(out.includes('limitation'), 'known-limitations flag picks up BE caveat');
});

test('buildDigest — degrades gracefully on sparse feature', () => {
  const { specs, name } = mkFeature({ featureName: 'Sparse', phase: 'final_confirmed', taskType: 'BASELINE' });
  const inputs = gatherInputs(path.join(specs, name), name);
  const out = buildDigest(inputs);
  assert(out.includes('_No eval-baseline.json recorded._'), 'no-eval placeholder');
  assert(out.includes('_No BE-integration-report.md in this folder._'), 'no-BE placeholder');
  assert(out.includes('_None recorded'), 'no-limitations placeholder');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
