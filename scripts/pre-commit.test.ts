import * as assert from 'node:assert/strict';
import { featureIsListed, featureRequiresIndex } from './pre-commit';

let passed = 0;
let failed = 0;

function test(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`❌ ${name}\n   ${(error as Error).message}`);
  }
}

test('evidence-only and raw-spec-only folders do not require an INDEX row', () => {
  const missingContext = () => null;
  assert.equal(featureRequiresIndex('i2-codex-live-smoke', missingContext), false);
  assert.equal(featureRequiresIndex('raw-spec-only', missingContext), false);
});

test('a staged or tracked context-summary keeps the INDEX requirement fail-closed', () => {
  const reads: string[] = [];
  const contextExists = (pathRel: string) => { reads.push(pathRel); return '# context'; };
  assert.equal(featureRequiresIndex('real-feature', contextExists), true);
  assert.deepEqual(reads, ['docs/specs/real-feature/context-summary.md']);
});

test('INDEX matching is exact at feature-token boundaries', () => {
  const index = '| real-feature-extra | final_confirmed |\n| real-feature | verify_complete |';
  assert.equal(featureIsListed(index, 'real-feature'), true);
  assert.equal(featureIsListed(index, 'feature'), false);
  assert.equal(featureIsListed(index, 'missing'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
