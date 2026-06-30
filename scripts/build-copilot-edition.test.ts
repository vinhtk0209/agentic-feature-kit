/**
 * Tests for build-copilot-edition.ts — the Claude→Copilot transforms (no LLM, no FS writes).
 *   npx tsx scripts/build-copilot-edition.test.ts   (or: npm run test:build-copilot)
 */
import {
  parseCommandFile, transformBody, toPromptFile, renderCopilotInstructions,
} from './build-copilot-edition';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

test('parseCommandFile extracts description + body from frontmatter', () => {
  const p = parseCommandFile('---\ndescription: Do a thing\n---\n\nBody line\nmore');
  assert(p.description === 'Do a thing', `desc ${p.description}`);
  assert(p.body === 'Body line\nmore', `body ${JSON.stringify(p.body)}`);
});

test('parseCommandFile handles quoted description + no frontmatter', () => {
  assert(parseCommandFile('---\ndescription: "Quoted"\n---\nx').description === 'Quoted', 'quoted');
  const none = parseCommandFile('just a body');
  assert(none.description === '' && none.body === 'just a body', 'no frontmatter');
});

test('transformBody maps $ARGUMENTS to a VS Code input var', () => {
  assert(transformBody('Target: **$ARGUMENTS**') === 'Target: **${input:arguments}**', transformBody('Target: **$ARGUMENTS**'));
  assert(transformBody('a $ARGUMENTS b $ARGUMENTS') === 'a ${input:arguments} b ${input:arguments}', 'all occurrences');
});

test('toPromptFile emits agent-mode frontmatter + transformed body', () => {
  const md = toPromptFile('My desc', 'Run on $ARGUMENTS');
  assert(md.includes("mode: 'agent'"), 'mode');
  assert(md.includes("description: 'My desc'"), 'description');
  assert(md.includes('${input:arguments}'), 'arg transformed');
});

test('toPromptFile escapes single quotes in description (YAML-safe)', () => {
  assert(toPromptFile("don't break", 'x').includes("description: 'don’t break'"), 'apostrophe escaped');
});

test('renderCopilotInstructions lists every command as a slash prompt', () => {
  const md = renderCopilotInstructions([{ name: 'feature-from-confluence', description: 'flagship' }, { name: 'drop-mock', description: 'rm mocks' }], '3.17');
  assert(md.includes('v3.17'), 'version');
  assert(md.includes('`/feature-from-confluence`') && md.includes('flagship'), 'flagship row');
  assert(md.includes('`/drop-mock`'), 'drop-mock row');
  assert(md.toLowerCase().includes('anti-corruption'), 'carries a key convention');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
