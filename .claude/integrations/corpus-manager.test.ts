/**
 * Tests for corpus-manager.ts — schema validation, tag filtering, scaffolding (no LLM, no quota).
 *   npx tsx .claude/integrations/corpus-manager.test.ts   (or: npm run test:corpus-manager)
 * Exit 0 = all pass, 1 = a test failed.
 */
import {
  validateCase, caseTags, filterCases, scaffoldCase, slugify, nextPrefix, parseFlags,
  type LoadedCase, type RawCase,
} from './corpus-manager';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

const validGate: RawCase = {
  id: 'x', kind: 'gate', description: 'd',
  files: { 'feat/a.ts': 'x' },
  lint: { folder: 'feat' },
  expect: { gate: 'pass' },
};
const validDetector: RawCase = {
  id: 'y', kind: 'detector', description: 'd',
  files: { 'docs/specs/.feedback-history.md': 'x' },
  expect: { patterns: ['p'] },
};

test('a well-formed gate case passes validation', () => {
  assert(validateCase(validGate, 'f').length === 0, 'should be valid');
});

test('a well-formed detector case passes validation', () => {
  assert(validateCase(validDetector, 'f').length === 0, 'should be valid');
});

test('missing/invalid fields are reported', () => {
  const errs = validateCase({ kind: 'gate' }, 'f');
  assert(errs.some((e) => e.includes('`id`')), 'flags missing id');
  assert(errs.some((e) => e.includes('`description`')), 'flags missing description');
  assert(errs.some((e) => e.includes('`files`')), 'flags missing files');
});

test('gate without lint.folder or bad expect.gate is rejected', () => {
  const errs = validateCase({ ...validGate, lint: {}, expect: { gate: 'maybe' } }, 'f');
  assert(errs.some((e) => e.includes('lint.folder')), 'flags lint.folder');
  assert(errs.some((e) => e.includes('expect.gate')), 'flags expect.gate');
});

test('detector with empty expect is rejected', () => {
  const errs = validateCase({ ...validDetector, expect: {} }, 'f');
  assert(errs.some((e) => e.includes('patterns/notPatterns/minTotalRuns')), 'flags empty expect');
});

test('non-string tags are rejected', () => {
  assert(validateCase({ ...validGate, tags: [1, 2] }, 'f').length > 0, 'should reject numeric tags');
  assert(validateCase({ ...validGate, tags: ['UI'] }, 'f').length === 0, 'string tags ok');
});

test('caseTags reads/normalizes the optional tags field', () => {
  assert(caseTags({ tags: ['A', 'B'] }).length === 2, 'two tags');
  assert(caseTags({}).length === 0, 'no tags → empty');
  assert(caseTags({ tags: 'nope' as unknown }).length === 0, 'non-array → empty');
});

test('filterCases by tag (case-insensitive) and kind', () => {
  const cases: LoadedCase[] = [
    { file: '1.case.json', raw: { kind: 'gate', tags: ['UI', 'L-03'] } },
    { file: '2.case.json', raw: { kind: 'detector', tags: ['data'] } },
    { file: '3.case.json', raw: { kind: 'gate' } },
  ];
  assert(filterCases(cases, { tag: 'ui' }).length === 1, 'tag ui → 1');
  assert(filterCases(cases, { kind: 'gate' }).length === 2, 'kind gate → 2');
  assert(filterCases(cases, { tag: 'ui', kind: 'gate' }).length === 1, 'combined → 1');
  assert(filterCases(cases, {}).length === 3, 'no filter → all');
});

test('slugify + nextPrefix', () => {
  assert(slugify('Modal Close!') === 'modal-close', `got ${slugify('Modal Close!')}`);
  assert(nextPrefix(['01-a.case.json', '06-b.case.json']) === '07', `got ${nextPrefix(['01-a.case.json', '06-b.case.json'])}`);
  assert(nextPrefix([]) === '01', 'empty → 01');
});

test('scaffoldCase produces a valid, numbered gate case with tags', () => {
  const { file, content } = scaffoldCase({ name: 'modal close', kind: 'gate', tags: ['UI'], existingFiles: ['06-x.case.json'] });
  assert(file === '07-modal-close.case.json', `got ${file}`);
  const obj = JSON.parse(content) as RawCase;
  assert(validateCase(obj, file).length === 0, 'scaffolded gate must be schema-valid');
  assert(caseTags(obj).includes('UI'), 'carries tags');
});

test('scaffoldCase detector is also schema-valid', () => {
  const { content } = scaffoldCase({ name: 'b11 fail', kind: 'detector', tags: [], existingFiles: [] });
  assert(validateCase(JSON.parse(content), 'f').length === 0, 'scaffolded detector must be schema-valid');
});

test('parseFlags handles values and bare booleans', () => {
  const f = parseFlags(['--name', 'foo bar', '--kind', 'detector', '--verbose']);
  assert(f.name === 'foo bar' && f.kind === 'detector' && f.verbose === true, JSON.stringify(f));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
