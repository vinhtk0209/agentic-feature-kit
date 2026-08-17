/**
 * Tests for changelog.ts — conventional-commit parsing, grouping, bump, render, validate (C-04).
 *   npx tsx scripts/changelog.test.ts   (or: npm run test:changelog)
 */
import {
  parseCommit, validateCommitMessage, groupCommits, suggestBump, bumpVersion, renderSection,
  commitSubjects, insertSection, parseArgs, resolveSectionVersion,
} from './changelog';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
function expectThrows(fn: () => void, expected: RegExp, message: string) {
  try {
    fn()
  } catch (error) {
    assert(expected.test((error as Error).message), `${message}: ${(error as Error).message}`)
    return
  }
  throw new Error(`${message}: did not throw`)
}

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

test('Unreleased is the default section and never receives a date', () => {
  assert(resolveSectionVersion(undefined) === 'Unreleased', 'default target')
  const md = renderSection('Unreleased', '2026-08-17', groupCommits(['feat: candidate']))
  assert(md.startsWith('## [Unreleased]\n'), 'undated Unreleased heading')
  assert(!md.includes('Unreleased] —'), 'no date on Unreleased')
})

test('explicit versions require canonical semantic version syntax', () => {
  assert(resolveSectionVersion('4.0.0') === '4.0.0', 'canonical semver accepted')
  for (const invalid of ['v4.0.0', '4.0', '04.0.0', '4.0.0-beta.1', '4.0.0; echo unsafe', '']) {
    expectThrows(() => resolveSectionVersion(invalid), /semantic version/i, `reject ${JSON.stringify(invalid)}`)
  }
})

test('CLI parsing rejects missing, duplicate, and unknown values before writes', () => {
  const parsed = parseArgs(['--since', 'v3.18', '--version', '4.0.0', '--write'])
  assert(parsed.since === 'v3.18' && parsed.version === '4.0.0' && parsed.write === true, JSON.stringify(parsed))
  expectThrows(() => parseArgs(['--version']), /requires a value/i, 'missing version')
  expectThrows(() => parseArgs(['--version', '4.0.0', '--version', '4.0.1']), /duplicate/i, 'duplicate version')
  expectThrows(() => parseArgs(['--publish']), /unknown option/i, 'unknown option')
  expectThrows(() => parseArgs(['--since', '-n1']), /Git revision/i, 'Git option injection')
})

test('Git log receives operator input as one literal argv element', () => {
  const since = 'v3.18; echo never-executed'
  let received: string[] = []
  const subjects = commitSubjects(since, (args) => {
    received = [...args]
    return 'feat: safe subject\n'
  })
  assert(JSON.stringify(received) === JSON.stringify(['log', `${since}..HEAD`, '--no-merges', '--format=%s']), JSON.stringify(received))
  assert(JSON.stringify(subjects) === JSON.stringify(['feat: safe subject']), JSON.stringify(subjects))
})

test('section insertion preserves Unreleased-first ordering', () => {
  const existing = '# Changelog\n\n---\n\n## [Unreleased]\n\n- Pending.\n\n## [3.25.0] — 2026-07-16\n\n- Old.\n'
  const released = renderSection('4.0.0', '2026-08-17', groupCommits(['feat: release']))
  const next = insertSection(existing, released, '4.0.0')
  assert(next.indexOf('## [Unreleased]') < next.indexOf('## [4.0.0]'), 'Unreleased remains first')
  assert(next.indexOf('## [4.0.0]') < next.indexOf('## [3.25.0]'), 'new version follows Unreleased')

  const withoutUnreleased = '# Changelog\n\n---\n\n## [3.25.0] — 2026-07-16\n\n- Old.\n'
  const pending = renderSection('Unreleased', '2026-08-17', groupCommits(['fix: pending']))
  const withUnreleased = insertSection(withoutUnreleased, pending, 'Unreleased')
  assert(withUnreleased.indexOf('## [Unreleased]') < withUnreleased.indexOf('## [3.25.0]'), 'new Unreleased is first')
})

test('duplicate headings fail closed without changing the input', () => {
  const existing = '# Changelog\n\n## [Unreleased]\n\n- Existing.\n'
  const original = existing
  const duplicate = renderSection('Unreleased', '2026-08-17', groupCommits(['feat: duplicate']))
  expectThrows(() => insertSection(existing, duplicate, 'Unreleased'), /already exists/i, 'duplicate Unreleased')
  assert(existing === original, 'input remains unchanged')
})

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
