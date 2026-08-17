/** Runtime prompt-contract evidence that /split-feature output is B0-consumable. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.log(`❌ ${name}\n     ${(error as Error).message}`); }
}

const commandDir = __dirname;
const splitter = fs.readFileSync(path.join(commandDir, 'split-feature.md'), 'utf8');
const flagship = fs.readFileSync(path.join(commandDir, 'feature-from-confluence.md'), 'utf8');
const requireSplitter = (text: string): void => assert.ok(splitter.includes(text), `missing split contract: ${text}`);
const requireFlagship = (text: string): void => assert.ok(flagship.includes(text), `missing B0 contract: ${text}`);

test('split decision is delegated to deterministic tooling with conservation errors fail-closed', () => {
  requireSplitter('feature-splitter.ts');
  requireSplitter('AcConservationError');
  requireSplitter('do not paper\n     over it');
  requireSplitter('CyclicSplitDependencyError');
});

test('each emitted sub-feature writes its own raw-spec artifact and dependency ledger', () => {
  requireSplitter('docs/specs/<parentName>-<suffix>/raw-spec.md');
  requireSplitter('SPLIT.json');
  requireSplitter('dependsOn');
});

test('emitted raw-spec markdown is accepted by B0 as raw-US input', () => {
  requireFlagship('Ends with `.md` or `.txt`');
  requireFlagship('`raw-us`');
  requireFlagship('Canonical Spec-IR gate (mandatory, fail-closed)');
});

test('B0 requires the shared executable adapter before downstream processing', () => {
  requireFlagship('spec-intake.ts "$SPEC_INPUT"');
  requireFlagship('**B1 consumes Spec-IR only:**');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
