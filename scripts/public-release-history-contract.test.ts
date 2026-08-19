import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type Manifest = {
  entries?: Array<{ path?: string; decision?: string; contentKind?: string; reasonCode?: string }>
}

type Milestone = {
  version: string
  date: string
  commit: string
}

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const commandName = 'test:public-release-history-contract'
const expectedCommand = 'npx tsx scripts/public-release-history-contract.test.ts'
assert.equal(packageJson.scripts[commandName], expectedCommand, 'release-history command is not registered')
assert.ok(packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`), 'release-history contract is not in test:kit')

const milestones: readonly Milestone[] = [
  { version: '3.25.0', date: '2026-07-16', commit: 'a6d118d1b95962ff41c6db035d76f49136649d77' },
  { version: '3.24.0', date: '2026-07-13', commit: 'a52260be905dd72089b9ee7e9b707e6c44b29f67' },
  { version: '3.23.0', date: '2026-07-12', commit: 'c324caf5feb8e4137c2493b319ef5e6bf37abb5f' },
  { version: '3.22.0', date: '2026-07-12', commit: 'e853b41c8ae754e1e6d29948061143ebdd2e1527' },
  { version: '3.21.0', date: '2026-07-12', commit: '9a72054f4388590ffcbb27fd7721f4fc51087b42' },
  { version: '3.20.0', date: '2026-07-12', commit: '3e55521ced24e1b72a2d49484929366a67a2084c' },
  { version: '3.19.0', date: '2026-07-11', commit: 'f5fb28187b1d4249c3afbb06b7319a6c35fcc53c' },
] as const

const r3bManifestPaths = [
  'docs/releasing/UNRELEASED.md',
  'docs/roadmap/p17-018-r3b-release-history-plan.md',
  'scripts/post-17-public-release-r3b-plan.test.ts',
  'scripts/public-release-history-contract.test.ts',
] as const

function count(text: string, value: string): number {
  return text.split(value).length - 1
}

function commonPublicErrors(text: string): string[] {
  const errors: string[] = []
  if (text.includes('\r')) errors.push('crlf')
  if (!text.endsWith('\n')) errors.push('missing-final-newline')
  if (/ +$/m.test(text)) errors.push('trailing-whitespace')
  if (/(?:[A-Za-z]:\\|file:\/\/)/.test(text)) errors.push('host-or-traversal-path')
  if (/\b(?:localhost|(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-z0-9.-]+\.(?:local|internal|corp))(?::\d+)?(?:\/|\b)/i.test(text)) errors.push('private-host')
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) errors.push('email-address')
  if (/\b(?:password|client[_ -]?secret|service[_ -]?role[_ -]?key)\s*[:=]\s*[^\s<][^\s]*/i.test(text)) errors.push('secret-value')
  if (/\b(?:is|now|ready for) public[- ]release(?: ready)?\b/i.test(text)) errors.push('public-ready-claim')
  if (/\bofficial(?:ly)? (?:OpenAI|Anthropic|GitHub|Microsoft|provider)[ -](?:endorsed|supported)\b/i.test(text)) errors.push('endorsement-claim')
  return errors
}

function versionHeadings(text: string): string[] {
  return [...text.matchAll(/^## \[([^\]]+)\](?: — \d{4}-\d{2}(?:-\d{2})?)?\s*$/gm)].map((match) => match[1])
}

function validateChangelog(text: string): string[] {
  const errors = commonPublicErrors(text)
  if (!text.startsWith('# Changelog\n')) errors.push('changelog-title')
  if (!text.includes('All notable changes to **Agentic Feature Kit** are documented here.')) errors.push('product-name')
  if (!text.includes('Source version authority, Git tags, and GitHub Releases are separate facts.')) errors.push('authority-boundary')
  if (!text.includes('Numeric Git tags exist for v3.17 and v3.18 only.')) errors.push('numeric-tag-truth')
  if (!text.includes('No GitHub Releases exist as of 2026-08-17.')) errors.push('github-release-truth')
  if (count(text, '## [Unreleased]') !== 1) errors.push('unreleased-count')
  if (/^## \[Unreleased\] —/m.test(text)) errors.push('unreleased-must-not-have-date')

  const headings = versionHeadings(text)
  const expectedPrefix = ['Unreleased', ...milestones.map(({ version }) => version), '3.18.0']
  if (JSON.stringify(headings.slice(0, expectedPrefix.length)) !== JSON.stringify(expectedPrefix)) errors.push('version-order')
  if (new Set(headings).size !== headings.length) errors.push('duplicate-version-heading')

  for (const milestone of milestones) {
    const heading = `## [${milestone.version}] — ${milestone.date}`
    if (count(text, heading) !== 1) errors.push(`milestone-heading:${milestone.version}`)
    const start = text.indexOf(heading)
    const end = start < 0 ? -1 : text.indexOf('\n## [', start + heading.length)
    const section = start < 0 ? '' : text.slice(start, end < 0 ? text.length : end)
    if (!section.includes('**Status:** Untagged version milestone; no GitHub Release.')) errors.push(`milestone-status:${milestone.version}`)
    if (!section.includes(`**Source commit:** \`${milestone.commit}\``)) errors.push(`milestone-commit:${milestone.version}`)
    if (!/^### (?:Added|Changed|Fixed|Security)$/m.test(section)) errors.push(`milestone-content:${milestone.version}`)
  }

  if (/\bv3\.(?:19|20|21|22|23|24|25)\b[^\n.]{0,60}\b(?:was|is|became)\s+(?:tagged|released|published)\b/i.test(text)) errors.push('fabricated-publication-claim')
  if (!text.includes('Changes after the v3.25 source milestone are collected here until a later release decision.')) errors.push('unreleased-boundary')
  return errors
}

function validateUnreleasedNote(text: string): string[] {
  const errors = commonPublicErrors(text)
  const required = [
    '# Unreleased Candidate Notes',
    '**Status:** Not a release announcement',
    '## Candidate snapshot',
    '## Version authorities',
    '## Changes after v3.25',
    '## Evidence boundaries',
    '## Remaining release gates',
    '## Compatibility and upgrade notes',
    '## Non-claims',
    'Root package | `3.25.0`',
    'Provider bundle | `0.5.0`',
    'Shared core | `1.3.0`',
    'The repository remains private.',
    'The root npm package remains `private: true`.',
    'v3.25 has no numeric Git tag and no GitHub Release.',
    'Internal-marker and private-binary remediation are complete for the current source candidate',
    'Nightly and manual qualification use the same read-only Linux/Windows matrix',
    'Dependency license catalog: 617 unique packages and 754 occurrences across four lockfiles',
    'Deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars now cover the exact source and provider candidates',
    'Strict final archive admission now validates all three ZIP archives',
    'Complete clean-clone qualification',
    'No version bump is selected by this note.',
    '[changelog](../../CHANGELOG.md)',
    '[public-release readiness plan](../roadmap/p17-018-public-release-plan.md)',
  ] as const
  for (const value of required) if (!text.includes(value)) errors.push(`note-missing:${value}`)
  if (text.includes('31 unresolved marker dispositions')) errors.push('stale-marker-disposition-gap')
  if (text.includes('dependency-license inventory and SBOM')) errors.push('stale-license-inventory-gap')
  if (text.includes('Run the final distribution-archive scanner')) errors.push('stale-final-archive-gap')
  if (/^- nightly qualification\s*$/im.test(text)) errors.push('stale-nightly-gap')
  if (/\b(?:release announcement|published release)\b/i.test(text.replace('Not a release announcement', ''))) errors.push('release-announcement-claim')
  return errors
}

function validateReadme(text: string): string[] {
  const errors: string[] = []
  const link = '[current unreleased notes](docs/releasing/UNRELEASED.md)'
  if (count(text, link) !== 1) errors.push('unreleased-note-link')
  if (/changelog reconciliation/i.test(text)) errors.push('stale-changelog-blocker')
  return errors
}

function validateManifest(manifest: Manifest): string[] {
  const errors: string[] = []
  const entries = manifest.entries ?? []
  const counts = new Map<string, number>()
  for (const entry of entries) if (entry.path) counts.set(entry.path, (counts.get(entry.path) ?? 0) + 1)
  for (const expectedPath of r3bManifestPaths) {
    const matches = entries.filter(({ path: entryPath }) => entryPath === expectedPath)
    if (matches.length !== 1) errors.push(`manifest-path:${expectedPath}`)
    else if (matches[0].decision !== 'include' || matches[0].contentKind !== 'text' || matches[0].reasonCode !== 'public-source') errors.push(`manifest-contract:${expectedPath}`)
  }
  for (const [entryPath, entryCount] of counts) if (entryCount > 1) errors.push(`manifest-duplicate:${entryPath}`)
  return errors
}

function validChangelog(): string {
  const milestoneSections = milestones.map((milestone) => [
    `## [${milestone.version}] — ${milestone.date}`,
    '',
    '**Status:** Untagged version milestone; no GitHub Release.',
    `**Source commit:** \`${milestone.commit}\``,
    '',
    '### Changed',
    '',
    '- Recorded source-authority change.',
  ].join('\n')).join('\n\n')
  return [
    '# Changelog',
    '',
    'All notable changes to **Agentic Feature Kit** are documented here.',
    'Source version authority, Git tags, and GitHub Releases are separate facts.',
    'Numeric Git tags exist for v3.17 and v3.18 only.',
    'No GitHub Releases exist as of 2026-08-17.',
    '',
    '## [Unreleased]',
    '',
    'Changes after the v3.25 source milestone are collected here until a later release decision.',
    '',
    '### Added',
    '',
    '- Candidate work.',
    '',
    milestoneSections,
    '',
    '## [3.18.0] — 2026-06-30',
    '',
    '### Changed',
    '',
    '- Historical content.',
    '',
  ].join('\n')
}

function validNote(): string {
  return [
    '# Unreleased Candidate Notes',
    '',
    '**Status:** Not a release announcement',
    '',
    '## Candidate snapshot',
    '',
    'The repository remains private. The root npm package remains `private: true`.',
    'v3.25 has no numeric Git tag and no GitHub Release.',
    '',
    '## Version authorities',
    '',
    '| Domain | Authority |',
    '|---|---|',
    '| Root package | `3.25.0` |',
    '| Provider bundle | `0.5.0` |',
    '| Shared core | `1.3.0` |',
    '',
    '## Changes after v3.25',
    '',
    '- Internal-marker and private-binary remediation are complete for the current source candidate.',
    '- Nightly and manual qualification use the same read-only Linux/Windows matrix.',
    '- Dependency license catalog: 617 unique packages and 754 occurrences across four lockfiles.',
    '- Deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars now cover the exact source and provider candidates.',
    '- Strict final archive admission now validates all three ZIP archives.',
    '',
    '## Evidence boundaries',
    '',
    '- Evidence distinguishes local and remote qualification.',
    '',
    '## Remaining release gates',
    '',
    '- Complete clean-clone qualification.',
    '',
    '## Compatibility and upgrade notes',
    '',
    'No version bump is selected by this note.',
    '',
    '## Non-claims',
    '',
    'See the [changelog](../../CHANGELOG.md) and [public-release readiness plan](../roadmap/p17-018-public-release-plan.md).',
    '',
  ].join('\n')
}

const changelogFixture = validChangelog()
assert.deepEqual(validateChangelog(changelogFixture), [])
assert.ok(validateChangelog(changelogFixture.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [Unreleased]\n')).includes('unreleased-count'))
assert.ok(validateChangelog(changelogFixture.replace('## [3.24.0]', '## [3.24.1]')).some((error) => error.includes('3.24.0')))
assert.ok(validateChangelog(changelogFixture.replace(milestones[0].commit, milestones[1].commit)).includes('milestone-commit:3.25.0'))
assert.ok(validateChangelog(changelogFixture.replace('Untagged version milestone; no GitHub Release.', 'v3.25 was released.')).includes('milestone-status:3.25.0'))
assert.ok(validateChangelog(changelogFixture.replace(/\n/g, '\r\n')).includes('crlf'))

const noteFixture = validNote()
assert.deepEqual(validateUnreleasedNote(noteFixture), [])
assert.ok(validateUnreleasedNote(noteFixture.replace('`3.25.0`', '`4.0.0`')).some((error) => error.includes('3.25.0')))
assert.ok(validateUnreleasedNote(noteFixture.replace('The repository remains private.', 'The repository is public-release ready.')).includes('public-ready-claim'))
assert.ok(validateUnreleasedNote(noteFixture.replace('Internal-marker and private-binary remediation are complete for the current source candidate.', 'Marker state omitted.')).some((error) => error.includes('Internal-marker')))
assert.ok(validateUnreleasedNote(noteFixture.replace('Deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars now cover the exact source and provider candidates.', 'SBOM state omitted.')).some((error) => error.includes('SPDX 2.3')))
assert.ok(validateUnreleasedNote(noteFixture.replace('- Strict final archive admission now validates all three ZIP archives.', '- Archive state omitted.')).some((error) => error.includes('Strict final archive admission')))
assert.ok(validateUnreleasedNote(noteFixture.replace('- Nightly and manual qualification use the same read-only Linux/Windows matrix.', '- nightly qualification')).includes('stale-nightly-gap'))
const syntheticPrivateHost = ['preview', 'example', 'internal'].join('.')
assert.ok(validateUnreleasedNote(`${noteFixture.slice(0, -1)}Preview: https://${syntheticPrivateHost}/\n`).includes('private-host'))
const syntheticLocalPath = ['C:', 'Users', 'example', 'artifact'].join('\\')
assert.ok(validateUnreleasedNote(`${noteFixture.slice(0, -1)}Path: ${syntheticLocalPath}\n`).includes('host-or-traversal-path'))

const syntheticManifest: Manifest = {
  entries: r3bManifestPaths.map((entryPath) => ({ path: entryPath, decision: 'include', contentKind: 'text', reasonCode: 'public-source' })),
}
assert.deepEqual(validateManifest(syntheticManifest), [])
assert.ok(validateManifest({ entries: syntheticManifest.entries?.slice(1) }).some((error) => error.includes(r3bManifestPaths[0])))
assert.ok(validateManifest({ entries: [...(syntheticManifest.entries ?? []), syntheticManifest.entries?.[0] ?? {}] }).some((error) => error.startsWith('manifest-duplicate:')))
assert.deepEqual(validateReadme(`See the [current unreleased notes](docs/releasing/UNRELEASED.md).\n`), [])
assert.ok(validateReadme('Changelog reconciliation remains pending.\n').includes('stale-changelog-blocker'))

console.log('public-release-history-contract.test: synthetic attacks PASS')

const currentGaps: string[] = []
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const changelogErrors = validateChangelog(changelog)
if (changelogErrors.length > 0) {
  console.error(`CHANGELOG.md categories: ${changelogErrors.join(', ')}`)
  currentGaps.push('CHANGELOG.md release history')
}
const notePath = path.join(root, 'docs', 'releasing', 'UNRELEASED.md')
if (!fs.existsSync(notePath)) {
  currentGaps.push('docs/releasing/UNRELEASED.md')
} else {
  const noteErrors = validateUnreleasedNote(fs.readFileSync(notePath, 'utf8'))
  if (noteErrors.length > 0) {
    console.error(`UNRELEASED.md categories: ${noteErrors.join(', ')}`)
    currentGaps.push('docs/releasing/UNRELEASED.md')
  }
}
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
if (validateReadme(readme).length > 0) currentGaps.push('README release routing')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'), 'utf8')) as Manifest
if (validateManifest(manifest).length > 0) currentGaps.push('release-manifest R3B paths')
assert.deepEqual(currentGaps, [], `P17-018 R3B release-history gaps: ${currentGaps.join(', ')}`)

console.log('public-release-history-contract.test: PASS (history, notes, versions, privacy, manifest)')
