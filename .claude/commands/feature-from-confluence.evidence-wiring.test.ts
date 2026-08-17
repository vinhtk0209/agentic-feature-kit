/** Prompt-runtime contract test for P1 evidence bundle integration. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.log(`❌ ${name}\n     ${(error as Error).message}`); }
}

const command = fs.readFileSync(path.join(__dirname, 'feature-from-confluence.md'), 'utf8');
const requireText = (text: string): void => assert.ok(command.includes(text), `missing prompt contract: ${text}`);

test('protocol explicitly covers all B-phases including automatic and skipped phases', () => {
  requireText('the 23 B-phases');
  requireText('from `B0` through `B12.8`');
  requireText('including automatic and dynamically skipped phases');
});

test('every successful phase requires build plus hash verification before advance', () => {
  requireText('evidence-bundle.ts build');
  requireText('evidence-bundle.ts verify');
  requireText('Continue only on `valid:true`');
  requireText('do not emit `✅`, do not advance');
});

test('over-budget bundles require explicit user authority and skipped phases retain evidence', () => {
  requireText('user explicitly approves the recorded overage');
  requireText('Skipped does not mean\n   evidence-free.');
});

test('resume follows the durable bundle state and fails closed on invalid history', () => {
  requireText('evidence-bundle.ts resume');
  requireText('Follow only its `resumeFromPhase`');
  requireText('never skip past a tampered or missing bundle');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
