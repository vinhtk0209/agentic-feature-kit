/**
 * Tests for changelog.ts — conventional-commit parsing, grouping, bump, render, validate (C-04).
 *   npx tsx scripts/changelog.test.ts   (or: npm run test:changelog)
 */
import {
  parseCommit, validateCommitMessage, groupCommits, suggestBump, bumpVersion, renderSection,
} from './changelog';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

test('parseCommit parses type/scope/breaking/description', () => {
  const c = parseCommit('feat(runner): add queue support')!;
  assert(c.type === 'feat' && c.scope === 'runner' && !c.breaking && c.description === 'add queue support', JSON.stringify(c));
  const b = parseCommit('fix!: drop a field')!;
  assert(b.breaking === true, 'breaking via !');
});

test('parseCommit rejects non-conventional + unknown types', () => {
  assert(parseCommit('just some message') === null, 'free text rejected');
  assert(parseCommit('wibble: nope') === null, 'unknown type rejected');
});

test('validateCommitMessage accepts conventional + merge/revert, rejects junk', () => {
  assert(validateCommitMessage('feat: x').ok, 'conventional ok');
  assert(validateCommitMessage('Merge branch main').ok, 'merge ok');
  assert(validateCommitMessage('revert: thing\n\nbody').ok || validateCommitMessage('Revert "x"').ok, 'revert ok');
  const bad = validateCommitMessage('added a thing')
  assert(!bad.ok && !!bad.error && bad.error.includes('Conventional Commits'), 'junk rejected with help');
})

test('validateCommitMessage ignores comment lines', () => {
  assert(validateCommitMessage('# a comment\nfeat: real subject').ok, 'skips leading comments')
})

test('groupCommits buckets by section and formats scope/breaking', () => {
  const g = groupCommits(['feat(ui): a', 'fix: b', 'docs: c', 'chore: d', 'feat!: e', 'not conventional'])
  assert(g.Added.includes('**ui:** a'), `Added: ${JSON.stringify(g.Added)}`)
  assert(g.Added.includes('**BREAKING** e'), 'breaking flagged')
  assert(g.Fixed.includes('b'), 'fix → Fixed')
  assert(g.Changed.includes('d'), 'chore → Changed')
  assert(g.Documentation.includes('c'), 'docs → Documentation')
  assert(g.Other.includes('not conventional'), 'junk → Other')
})

test('suggestBump: breaking>feat>fix', () => {
  assert(suggestBump(['feat!: x']) === 'major', 'breaking → major')
  assert(suggestBump(['feat: x', 'fix: y']) === 'minor', 'feat → minor')
  assert(suggestBump(['fix: x', 'chore: y']) === 'patch', 'no feat → patch')
})

test('bumpVersion math', () => {
  assert(bumpVersion('3.17.2', 'major') === '4.0.0', 'major')
  assert(bumpVersion('3.17.2', 'minor') === '3.18.0', 'minor')
  assert(bumpVersion('3.17.2', 'patch') === '3.17.3', 'patch')
})

test('renderSection emits Keep-a-Changelog markdown in section order', () => {
  const md = renderSection('3.18.0', '2026-06-27', groupCommits(['feat: a', 'fix: b']))
  assert(md.startsWith('## [3.18.0] — 2026-06-27'), 'header')
  assert(md.indexOf('### Added') < md.indexOf('### Fixed'), 'Added before Fixed')
  assert(md.includes('- a') && md.includes('- b'), 'items present')
})

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
