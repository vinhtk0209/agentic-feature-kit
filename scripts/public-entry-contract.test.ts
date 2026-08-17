import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type JsonRecord = Record<string, unknown>

const root = process.cwd()
const packagePath = path.join(root, 'package.json')
const readmePath = path.join(root, 'README.md')
const providerAuthority = JSON.parse(
  fs.readFileSync(path.join(root, 'providers', 'provider-bundles.json'), 'utf8'),
) as {
  bundleVersion: string
  sharedCoreVersion: string
  providers: Array<{ id: string }>
}

const expectedKeywords = [
  'agentic-workflow',
  'software-delivery',
  'codex',
  'claude-code',
  'github-copilot',
  'developer-tools',
]
const expectedHeadings = [
  '# Agentic Feature Kit',
  '## Choose a provider',
  '## Audience and boundaries',
  '## Quickstart from a clean clone',
  '## Shared capabilities',
  '## Legacy Claude Code flagship',
  '## Verify from source',
  '## Version and release model',
  '## Security and data boundaries',
  '## Limitations',
  '## Documentation map',
  '## Contribution and support status',
]
const requiredRelativeLinks = [
  'LICENSE',
  'CHANGELOG.md',
  'providers/README.md',
  'providers/codex/agentic-feature-kit/README.md',
  'providers/claude/agentic-feature-kit/README.md',
  'providers/copilot/agentic-feature-kit/README.md',
  'packages/core/README.md',
  '.claude/SETUP.md',
  'docs/claude-commands/README.md',
  'docs/claude-commands/INTEGRATIONS.md',
  'docs/claude-commands/TOKEN-OPTIMIZATION.md',
  'docs/roadmap/p17-018-public-release-plan.md',
]
const allowedExternalLinks = new Set([
  'https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml',
  'https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml/badge.svg',
])

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePackage(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['package-not-object']
  const scripts = isRecord(value.scripts) ? value.scripts : {}
  const repository = isRecord(value.repository) ? value.repository : {}
  const bugs = isRecord(value.bugs) ? value.bugs : {}
  const engines = isRecord(value.engines) ? value.engines : {}
  const bin = isRecord(value.bin) ? value.bin : {}

  if (value.name !== 'feature-from-confluence-kit') errors.push('legacy-name-drift')
  if (value.version !== '3.25.0') errors.push('kit-version-drift')
  if (value.private !== true) errors.push('private-boundary-drift')
  if (value.type !== 'commonjs') errors.push('module-type-drift')
  if (engines.node !== '>=20') errors.push('node-engine-drift')
  if (bin.workflow !== 'bin/workflow.ts') errors.push('workflow-bin-drift')
  if (value.description !== 'Evidence-backed agentic software-delivery toolkit with deterministic bundles for Codex, Claude Code, and GitHub Copilot.') errors.push('description-drift')
  if (value.license !== 'Apache-2.0') errors.push('license-drift')
  if (repository.type !== 'git' || repository.url !== 'git+https://github.com/vinhtk0209/agentic-feature-kit.git') errors.push('repository-drift')
  if (value.homepage !== 'https://github.com/vinhtk0209/agentic-feature-kit#readme') errors.push('homepage-drift')
  if (bugs.url !== 'https://github.com/vinhtk0209/agentic-feature-kit/issues') errors.push('bugs-drift')
  if (!Array.isArray(value.keywords) || !value.keywords.every((entry) => typeof entry === 'string') || JSON.stringify(value.keywords) !== JSON.stringify(expectedKeywords)) errors.push('keywords-drift')
  if ('publishConfig' in value) errors.push('publish-config-forbidden')

  for (const lifecycle of ['publish', 'prepublish', 'prepublishOnly', 'postpublish']) {
    if (lifecycle in scripts) errors.push(`publish-lifecycle-forbidden:${lifecycle}`)
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') errors.push(`script-not-string:${name}`)
    else if (/\b(?:npm|pnpm|yarn)\s+publish\b/i.test(command)) errors.push(`publish-command-forbidden:${name}`)
  }
  if (/NPM_TOKEN|NODE_AUTH_TOKEN|npm_[A-Za-z0-9]{20,}/i.test(JSON.stringify(value))) errors.push('npm-credential-reference')
  return errors
}

function markdownTargets(markdown: string): string[] {
  const targets: string[] = []
  for (const pattern of [
    /!\[[^\]]*\]\(([^)]+)\)/g,
    /\[!\[[^\]]*\]\([^)]+\)\]\(([^)]+)\)/g,
    /(?<!!)\[[^\]]*\]\(([^)]+)\)/g,
  ]) {
    for (const match of markdown.matchAll(pattern)) targets.push(match[1].trim().split(/\s+['"]/)[0])
  }
  return targets
}

function headingCounts(markdown: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(?:#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue
    const slug = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[`*_~]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

function exactCasePathExists(base: string, relativePath: string): boolean {
  let current = base
  for (const segment of relativePath.split('/')) {
    if (!segment) return false
    let entries: string[]
    try {
      entries = fs.readdirSync(current)
    } catch {
      return false
    }
    if (!entries.includes(segment)) return false
    current = path.join(current, segment)
  }
  return fs.existsSync(current)
}

function validateLinks(markdown: string, base: string): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const localHeadings = headingCounts(markdown)
  for (const rawTarget of markdownTargets(markdown)) {
    if (/^https?:/i.test(rawTarget)) {
      if (!allowedExternalLinks.has(rawTarget)) errors.push(`external-link-not-allowlisted:${rawTarget}`)
      continue
    }
    if (/^mailto:/i.test(rawTarget)) {
      errors.push('mail-link-forbidden')
      continue
    }
    if (rawTarget.startsWith('#')) {
      const fragment = rawTarget.slice(1).toLowerCase()
      if (!fragment || localHeadings.get(fragment) !== 1) errors.push(`fragment-missing-or-ambiguous:${rawTarget}`)
      continue
    }
    let decoded: string
    try {
      decoded = decodeURIComponent(rawTarget)
    } catch {
      errors.push('link-invalid-encoding')
      continue
    }
    const [pathAndQuery, fragment = ''] = decoded.split('#', 2)
    const target = pathAndQuery.split('?')[0]
    if (!target || target.includes('\\') || target.startsWith('/') || /^[A-Za-z]:/.test(target) || /^file:/i.test(target)) {
      errors.push(`link-unsafe:${rawTarget}`)
      continue
    }
    const normalized = path.posix.normalize(target)
    if (normalized === '..' || normalized.startsWith('../') || normalized !== target) {
      errors.push(`link-noncanonical:${rawTarget}`)
      continue
    }
    if (seen.has(target)) errors.push(`link-duplicate:${target}`)
    seen.add(target)
    if (!exactCasePathExists(base, target)) {
      errors.push(`link-missing-or-case-drift:${target}`)
      continue
    }
    if (fragment) {
      const absolute = path.join(base, ...target.split('/'))
      let targetHeadings = new Map<string, number>()
      try {
        if (fs.statSync(absolute).isFile()) targetHeadings = headingCounts(fs.readFileSync(absolute, 'utf8'))
      } catch {
        errors.push(`fragment-target-unreadable:${target}`)
      }
      if (targetHeadings.get(fragment.toLowerCase()) !== 1) errors.push(`fragment-missing-or-ambiguous:${rawTarget}`)
    }
  }
  for (const required of requiredRelativeLinks) {
    if (!seen.has(required)) errors.push(`link-required:${required}`)
  }
  return errors
}

function validateReadme(markdown: string, packageJson: JsonRecord, checkLinks = true): string[] {
  const errors: string[] = []
  const headings = markdown.split(/\r?\n/).filter((line) => /^#{1,2} /.test(line))
  let previous = -1
  for (const heading of expectedHeadings) {
    const index = headings.indexOf(heading)
    if (index < 0) errors.push(`heading-missing:${heading}`)
    else if (index <= previous) errors.push(`heading-order:${heading}`)
    previous = Math.max(previous, index)
  }
  if (!markdown.startsWith('# Agentic Feature Kit\n')) errors.push('root-identity-drift')
  if (!/evidence-backed software delivery/i.test(markdown)) errors.push('outcome-missing')
  if (!/not yet public-release eligible/i.test(markdown)) errors.push('blocked-status-missing')
  if (!/external software engineers/i.test(markdown)) errors.push('audience-missing')
  if (!/Codex/.test(markdown) || !/Claude Code/.test(markdown) || !/GitHub Copilot/.test(markdown)) errors.push('provider-selector-incomplete')
  if (!markdown.includes(`agentic-feature-kit-<provider>-${providerAuthority.bundleVersion}.zip`)) errors.push('archive-pattern-drift')
  if (!markdown.includes(`Shared core | ${providerAuthority.sharedCoreVersion}`)) errors.push('shared-core-version-missing')
  if (!markdown.includes('feature-from-confluence-kit')) errors.push('legacy-package-boundary-missing')
  if (!/shared provider packages do not imply flagship workflow parity/i.test(markdown)) errors.push('flagship-parity-boundary-missing')
  if (!/Kit\/prompt version/.test(markdown) || !/Provider bundle version/.test(markdown) || !/Shared core version/.test(markdown)) errors.push('version-model-incomplete')

  const quickstartCommands = [
    'git clone https://github.com/vinhtk0209/agentic-feature-kit.git',
    'cd agentic-feature-kit',
    'npm ci',
    'npm run build:providers',
    'npm run test:provider-distribution',
  ]
  previous = -1
  for (const command of quickstartCommands) {
    const index = markdown.indexOf(command)
    if (index < 0) errors.push(`quickstart-command-missing:${command}`)
    else if (index <= previous) errors.push(`quickstart-command-order:${command}`)
    previous = Math.max(previous, index)
  }
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {}
  for (const script of ['build:providers', 'test:provider-distribution']) {
    if (typeof scripts[script] !== 'string') errors.push(`quickstart-script-missing:${script}`)
  }

  for (const [pattern, code] of [
    [/\b(?:official|endorsed)\b/i, 'provider-endorsement-claim'],
    [/\b(?:already\s+)?published\b/i, 'publication-claim'],
    [/\bmarketplace\s+(?:available|published|ready)\b/i, 'marketplace-claim'],
    [/\b(?:is|now)\s+public[- ]release ready\b/i, 'public-ready-claim'],
    [/kit-dashboard|sync\.config\.json|SUPABASE_|\/api\/sync|target repos|Database migrations \(Supabase\)/i, 'workspace-only-entry'],
    [/(?:[A-Za-z]:\\|file:\/\/|\.\.\/)/, 'host-or-traversal-path'],
  ] as Array<[RegExp, string]>) {
    if (pattern.test(markdown)) errors.push(code)
  }
  if (/\]\((?:CONTRIBUTING|SECURITY|SUPPORT|CODE_OF_CONDUCT)\.md(?:[#)]|$)/.test(markdown)) errors.push('premature-governance-link')
  if (checkLinks) errors.push(...validateLinks(markdown, root))
  return errors
}

const canonicalPackage: JsonRecord = {
  name: 'feature-from-confluence-kit',
  version: '3.25.0',
  private: true,
  type: 'commonjs',
  bin: { workflow: 'bin/workflow.ts' },
  engines: { node: '>=20' },
  description: 'Evidence-backed agentic software-delivery toolkit with deterministic bundles for Codex, Claude Code, and GitHub Copilot.',
  license: 'Apache-2.0',
  repository: { type: 'git', url: 'git+https://github.com/vinhtk0209/agentic-feature-kit.git' },
  homepage: 'https://github.com/vinhtk0209/agentic-feature-kit#readme',
  bugs: { url: 'https://github.com/vinhtk0209/agentic-feature-kit/issues' },
  keywords: expectedKeywords,
  scripts: { 'build:providers': 'safe', 'test:provider-distribution': 'safe' },
}
const canonicalReadme = `${expectedHeadings.join('\n\n')}

Evidence-backed software delivery for external software engineers.
Codex, Claude Code, and GitHub Copilot.
agentic-feature-kit-<provider>-${providerAuthority.bundleVersion}.zip
Shared core | ${providerAuthority.sharedCoreVersion}
Legacy package: feature-from-confluence-kit.
Shared provider packages do not imply flagship workflow parity.
Kit/prompt version; Provider bundle version; Shared core version.
This candidate is not yet public-release eligible.

git clone https://github.com/vinhtk0209/agentic-feature-kit.git
cd agentic-feature-kit
npm ci
npm run build:providers
npm run test:provider-distribution
`

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed += 1
  } catch (error) {
    console.error(`❌ ${name}`)
    console.error(error)
    failed += 1
  }
}

async function main(): Promise<void> {
  await test('canonical package metadata and provider-neutral README structure are accepted', () => {
    assert.deepEqual(validatePackage(canonicalPackage), [])
    assert.deepEqual(validateReadme(canonicalReadme, canonicalPackage, false), [])
  })

  await test('package contract rejects identity, visibility, metadata, and publication attacks', () => {
    const attacks: Array<[string, JsonRecord]> = [
      ['name', { ...clone(canonicalPackage), name: 'agentic-feature-kit' }],
      ['private', { ...clone(canonicalPackage), private: false }],
      ['license', { ...clone(canonicalPackage), license: 'MIT' }],
      ['repository', { ...clone(canonicalPackage), repository: { type: 'git', url: 'https://example.invalid/repo' } }],
      ['keywords', { ...clone(canonicalPackage), keywords: [...expectedKeywords].reverse() }],
      ['publishConfig', { ...clone(canonicalPackage), publishConfig: { access: 'public' } }],
      ['publish script', { ...clone(canonicalPackage), scripts: { publish: 'npm publish' } }],
      ['credential', { ...clone(canonicalPackage), scripts: { release: 'echo NPM_TOKEN' } }],
    ]
    for (const [name, attack] of attacks) assert.notDeepEqual(validatePackage(attack), [], `attack accepted: ${name}`)
  })

  await test('README contract rejects identity, structure, claim, and workspace-only attacks', () => {
    const attacks: Array<[string, string]> = [
      ['identity', canonicalReadme.replace('# Agentic Feature Kit', '# Claude Workflow Kit')],
      ['missing provider', canonicalReadme.replace('GitHub Copilot', 'another provider')],
      ['missing quickstart', canonicalReadme.replace('npm ci', 'npm install')],
      ['official claim', `${canonicalReadme}\nOfficial provider integration.`],
      ['public-ready claim', canonicalReadme.replace('not yet public-release eligible', 'is public-release ready')],
      ['workspace entry', `${canonicalReadme}\nSee kit-dashboard for target repos.`],
      ['premature governance', `${canonicalReadme}\n[Security](SECURITY.md)`],
      ['host path', `${canonicalReadme}\nC:\\Users\\example\\secret.txt`],
    ]
    for (const [name, attack] of attacks) assert.notDeepEqual(validateReadme(attack, canonicalPackage, false), [], `attack accepted: ${name}`)
  })

  await test('link gate rejects traversal, missing paths, case drift, duplicates, external hosts, mail, and bad fragments', () => {
    const validLinks = requiredRelativeLinks.map((target) => `[${target}](${target})`).join('\n')
    assert.deepEqual(validateLinks(validLinks, root), [])
    for (const attack of [
      `${validLinks}\n[x](../outside.md)`,
      `${validLinks}\n[x](missing.md)`,
      `${validLinks}\n[x](readme.md)`,
      `${validLinks}\n[x](LICENSE)`,
      `${validLinks}\n[x](C:\\private.txt)`,
      `${validLinks}\n[x](https://example.invalid)`,
      `${validLinks}\n[x](mailto:private@example.invalid)`,
      `${validLinks}\n[x](#missing-heading)`,
    ]) assert.notDeepEqual(validateLinks(attack, root), [])
  })

  await test('current root package and README satisfy the exact R2 public-entry contract', () => {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as JsonRecord
    const readme = fs.readFileSync(readmePath, 'utf8')
    assert.deepEqual({ packageErrors: validatePackage(packageJson), readmeErrors: validateReadme(readme, packageJson) }, { packageErrors: [], readmeErrors: [] })
  })

  console.log(`\npublic-entry-contract.test: ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
