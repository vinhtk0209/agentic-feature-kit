import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type Manifest = { entries?: Array<{ path?: string }>; requiredPaths?: string[] }

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const commandName = 'test:public-governance-contract'
const expectedCommand = 'npx tsx scripts/public-governance-contract.test.ts'
assert.equal(packageJson.scripts[commandName], expectedCommand, 'public governance command is not registered')
assert.ok(packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`), 'public governance contract is not in test:kit')

const privateReportUrl = 'https://github.com/vinhtk0209/agentic-feature-kit/security/advisories/new'
const governanceFiles = [
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/pull_request_template.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
] as const
const governanceManifestPaths = [
  ...governanceFiles,
  'docs/roadmap/p17-018-r3a-governance-surface-plan.md',
  'scripts/post-17-public-release-r3a-plan.test.ts',
  'scripts/public-governance-contract.test.ts',
].sort()
const readmeLinks = [
  '[Contributing](CONTRIBUTING.md)',
  '[Security policy](SECURITY.md)',
  '[Support](SUPPORT.md)',
  '[Code of Conduct](CODE_OF_CONDUCT.md)',
] as const

function count(text: string, value: string): number {
  return text.split(value).length - 1
}

function commonErrors(text: string): string[] {
  const errors: string[] = []
  const requestText = text
    .split(/\n|(?<=[.!?;])\s+/)
    .filter((segment) => {
      const content = segment.replace(/^\s*(?:[-*]\s*)?(?:[a-z_]+:\s*)?/i, '')
      return !/^(?:do not|never|must not)\b/i.test(content)
    })
    .join('\n')
  if (text.includes('\r')) errors.push('crlf')
  if (!text.endsWith('\n')) errors.push('missing-final-newline')
  if (/ +$/m.test(text)) errors.push('trailing-whitespace')
  if (/(?:[A-Za-z]:\\|file:\/\/|\.\.\/)/.test(text)) errors.push('host-or-traversal-path')
  if (/\b(?:localhost|(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-z0-9.-]+\.(?:local|internal|corp))(?::\d+)?(?:\/|\b)/i.test(text)) errors.push('private-host')
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) errors.push('email-address')
  if (/\b(?:provide|include|paste|attach|enter|submit)\b[^\n]{0,80}\b(?:access[_ -]?token|password|client[_ -]?secret|service[_ -]?role[_ -]?key|credentials?)\b/i.test(requestText)) errors.push('credential-request')
  if (/\b(?:provide|include|paste|attach|enter|submit)\b[^\n]{0,80}\b(?:private specification|customer data|raw logs?|exploit details?)\b/i.test(requestText)) errors.push('sensitive-input-request')
  if (/\b(?:official|endorsed) (?:OpenAI|Anthropic|GitHub|Microsoft|provider)/i.test(text)) errors.push('endorsement-claim')
  if (/\b(?:is|now) public[- ]release ready\b/i.test(text)) errors.push('public-ready-claim')
  if (/\b(?:kit-dashboard|isu-elearner|insight\.fsoft)\b/i.test(text)) errors.push('workspace-marker')
  return errors
}

function requireText(text: string, values: readonly string[], errors: string[], prefix: string): void {
  for (const value of values) if (!text.includes(value)) errors.push(`${prefix}:${value}`)
}

function validateContributing(text: string): string[] {
  const errors = commonErrors(text)
  requireText(text, [
    '# Contributing to Agentic Feature Kit',
    '## Development setup',
    '## Architecture boundaries',
    '## Plan and readiness',
    '## Verification ladder',
    '## Generated files',
    '## Pull request requirements',
    'npm ci',
    'npm run test:kit',
    'English',
    'External effects',
    'Do not edit generated provider output by hand',
  ], errors, 'contributing-missing')
  return errors
}

function validateSecurity(text: string): string[] {
  const errors = commonErrors(text)
  requireText(text, [
    '# Security Policy',
    '## Supported versions',
    '## Report a vulnerability',
    '## What to include',
    '## Safe harbor',
    '## Response and disclosure',
    privateReportUrl,
    'current default branch',
    'best-effort',
    'no service-level agreement',
    'Do not use a public issue',
  ], errors, 'security-missing')
  if (/\bguarantee(?:d|s)?\b/i.test(text)) errors.push('guaranteed-response')
  if (/\b(?:v3\.17|v3\.18|3\.25\.x)\b.*\bsupported\b/i.test(text)) errors.push('unsupported-release-line')
  return errors
}

function validateSupport(text: string): string[] {
  const errors = commonErrors(text)
  requireText(text, [
    '# Support',
    '## Choose the right route',
    '## Reproduction evidence',
    '## Supported questions',
    '## Unsupported use cases',
    '## Service boundary',
    privateReportUrl,
    'bug report form',
    'feature request form',
    'no support SLA',
  ], errors, 'support-missing')
  if (/GitHub Discussions/i.test(text)) errors.push('unproven-discussions-route')
  return errors
}

function validateConduct(text: string): string[] {
  const errors = commonErrors(text)
  requireText(text, [
    '# Code of Conduct',
    'Policy revision: 1.0.0',
    'Contributor Covenant version 2.1',
    '## Our pledge',
    '## Expected behavior',
    '## Unacceptable behavior',
    '## Scope',
    '## Enforcement',
    '## Enforcement guidelines',
    '## Attribution',
    privateReportUrl,
    'retaliation',
    'https://www.contributor-covenant.org/version/2/1/code_of_conduct/',
  ], errors, 'conduct-missing')
  return errors
}

function formIds(text: string): Set<string> {
  return new Set([...text.matchAll(/^\s*-?\s*id:\s*([a-z][a-z0-9_]*)\s*$/gm)].map((match) => match[1]))
}

const yamlKeys = new Set([
  'name', 'description', 'title', 'body', 'type', 'id', 'attributes', 'label', 'placeholder',
  'options', 'validations', 'required', 'value', 'blank_issues_enabled', 'contact_links', 'url',
  'about',
])

function validateYamlSubset(text: string, kind: 'form' | 'config'): string[] {
  const errors: string[] = []
  const lines = text.split('\n')
  let blockIndent: number | null = null
  const topLevel = new Map<string, number>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
    if (line.includes('\t')) {
      errors.push(`yaml-tab:${index + 1}`)
      continue
    }
    const indent = line.length - line.trimStart().length
    if (blockIndent !== null && indent > blockIndent) continue
    blockIndent = null
    if (indent % 2 !== 0) errors.push(`yaml-odd-indent:${index + 1}`)
    const trimmed = line.trim()
    if (/^- [^:]+$/.test(trimmed)) continue
    const match = /^(?:- )?([a-z_][a-z0-9_]*):(?:\s*(.*))?$/.exec(trimmed)
    if (!match) {
      errors.push(`yaml-shape:${index + 1}`)
      continue
    }
    const [, key, value = ''] = match
    if (!yamlKeys.has(key)) errors.push(`yaml-key:${key}`)
    if (indent === 0) topLevel.set(key, (topLevel.get(key) ?? 0) + 1)
    if (value === '|') blockIndent = indent
  }

  const expectedTopLevel = kind === 'form'
    ? ['name', 'description', 'title', 'body']
    : ['blank_issues_enabled', 'contact_links']
  for (const key of expectedTopLevel) if (topLevel.get(key) !== 1) errors.push(`yaml-top-level:${key}`)
  for (const key of topLevel.keys()) if (!expectedTopLevel.includes(key)) errors.push(`yaml-top-level-unknown:${key}`)

  if (kind === 'form') {
    const starts = lines.flatMap((line, index) => /^  - type:\s*(\S+)\s*$/.test(line) ? [index] : [])
    if (starts.length === 0) errors.push('yaml-body-items')
    const ids: string[] = []
    for (let itemIndex = 0; itemIndex < starts.length; itemIndex += 1) {
      const start = starts[itemIndex]
      const end = starts[itemIndex + 1] ?? lines.length
      const chunk = lines.slice(start, end).join('\n')
      const type = /^  - type:\s*(\S+)\s*$/m.exec(chunk)?.[1] ?? ''
      if (!['markdown', 'input', 'dropdown', 'textarea', 'checkboxes'].includes(type)) errors.push(`yaml-item-type:${type}`)
      if (!/^    attributes:\s*$/m.test(chunk)) errors.push(`yaml-item-attributes:${itemIndex}`)
      if (type === 'markdown') continue
      const id = /^    id:\s*([a-z][a-z0-9_]*)\s*$/m.exec(chunk)?.[1]
      if (!id) errors.push(`yaml-item-id:${itemIndex}`)
      else ids.push(id)
      if (type !== 'checkboxes' && (!/^    validations:\s*$/m.test(chunk) || !/^      required:\s*true\s*$/m.test(chunk))) errors.push(`yaml-item-required:${id ?? itemIndex}`)
      if (type === 'checkboxes' && !/^          required:\s*true\s*$/m.test(chunk)) errors.push(`yaml-item-required:${id ?? itemIndex}`)
      if ((type === 'dropdown' || type === 'checkboxes') && !/^      options:\s*$/m.test(chunk)) errors.push(`yaml-item-options:${id ?? itemIndex}`)
    }
    if (new Set(ids).size !== ids.length) errors.push('yaml-duplicate-id')
  }
  return errors
}

function validateIssueForm(text: string, kind: 'bug' | 'feature'): string[] {
  const errors = [...commonErrors(text), ...validateYamlSubset(text, 'form')]
  requireText(text, [
    'name:',
    'description:',
    'title:',
    'body:',
    'type: checkboxes',
    'required: true',
    'Do not include credentials, private specifications, customer data, raw logs, or exploit details.',
  ], errors, `${kind}-form-missing`)
  const requiredIds = kind === 'bug'
    ? ['kit_version', 'provider', 'operating_system', 'node_version', 'reproduction', 'expected_behavior', 'actual_behavior', 'sanitized_evidence', 'security_confirmation']
    : ['problem', 'desired_outcome', 'provider', 'alternatives', 'scope', 'security_data', 'security_confirmation']
  const ids = formIds(text)
  for (const id of requiredIds) if (!ids.has(id)) errors.push(`${kind}-form-id:${id}`)
  if (kind === 'bug' && !text.includes('This public issue does not contain sensitive vulnerability details.')) errors.push('bug-security-routing')
  if (kind === 'feature' && !text.includes('No external write, provider execution, publication, or credential use is implied by this request.')) errors.push('feature-external-boundary')
  return errors
}

function validateIssueConfig(text: string): string[] {
  const errors = [...commonErrors(text), ...validateYamlSubset(text, 'config')]
  requireText(text, [
    'blank_issues_enabled: false',
    'contact_links:',
    'name: Report a vulnerability privately',
    `url: ${privateReportUrl}`,
  ], errors, 'issue-config-missing')
  return errors
}

function validatePullRequestTemplate(text: string): string[] {
  const errors = commonErrors(text)
  requireText(text, [
    '# Summary',
    '## Plan or task',
    '## Scope',
    '## Verification',
    '## Generated artifacts',
    '## Security and privacy',
    '## Compatibility',
    '## External effects',
    '## Checklist',
    '- [ ] Tests and evidence are listed with exact commands or durable links.',
    '- [ ] Generated provider artifacts were rebuilt, or this change does not affect them.',
    '- [ ] Security and privacy impact is described.',
    '- [ ] Compatibility and migration impact is described.',
    '- [ ] External writes are enumerated, or explicitly declared as none.',
  ], errors, 'pr-template-missing')
  return errors
}

function validateReadmeRouting(text: string): string[] {
  const errors = commonErrors(text)
  for (const link of readmeLinks) {
    if (count(text, link) !== 1) errors.push(`readme-link:${link}`)
  }
  if (/policies are the next P17-018 implementation slice/i.test(text)) errors.push('stale-governance-status')
  if (/private reporting policy is unfinished/i.test(text)) errors.push('stale-security-status')
  return errors
}

const syntheticContributing = `# Contributing to Agentic Feature Kit
## Development setup
npm ci
## Architecture boundaries
Provider adapters stay thin.
## Plan and readiness
Plan before implementation.
## Verification ladder
npm run test:kit
## Generated files
Do not edit generated provider output by hand.
## Pull request requirements
Use English and declare External effects.
`
const syntheticSecurity = `# Security Policy
## Supported versions
Only the current default branch is considered before the first release.
## Report a vulnerability
Use ${privateReportUrl}. Do not use a public issue.
## What to include
Provide sanitized steps. Do not include credentials, private specifications, customer data, raw logs, or exploit details.
## Safe harbor
Good-faith research is welcome.
## Response and disclosure
Targets are best-effort and provide no service-level agreement.
`
const syntheticSupport = `# Support
## Choose the right route
Use the bug report form, feature request form, or ${privateReportUrl}.
## Reproduction evidence
Provide sanitized evidence. Do not include credentials, private specifications, customer data, raw logs, or exploit details.
## Supported questions
Ask about documented local behavior.
## Unsupported use cases
No hosted service is offered.
## Service boundary
There is no support SLA.
`
const syntheticConduct = `# Code of Conduct
Policy revision: 1.0.0. Adapted from Contributor Covenant version 2.1.
## Our pledge
We welcome participation.
## Expected behavior
Be respectful.
## Unacceptable behavior
Harassment and retaliation are prohibited.
## Scope
This policy applies in project spaces.
## Enforcement
Report privately at ${privateReportUrl}.
## Enforcement guidelines
Responses are proportionate.
## Attribution
https://www.contributor-covenant.org/version/2/1/code_of_conduct/
`
const syntheticBug = `name: Bug report
description: Report reproducible behavior
title: "[Bug]: "
body:
  - type: input
    id: kit_version
    attributes:
      label: Kit version
    validations:
      required: true
  - type: dropdown
    id: provider
    attributes:
      label: Provider
      options:
        - Codex
    validations:
      required: true
  - type: input
    id: operating_system
    attributes:
      label: Operating system
    validations:
      required: true
  - type: input
    id: node_version
    attributes:
      label: Node version
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Reproduction
    validations:
      required: true
  - type: textarea
    id: expected_behavior
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual_behavior
    attributes:
      label: Actual behavior
    validations:
      required: true
  - type: textarea
    id: sanitized_evidence
    attributes:
      label: Sanitized evidence
    validations:
      required: true
  - type: checkboxes
    id: security_confirmation
    attributes:
      description: Do not include credentials, private specifications, customer data, raw logs, or exploit details.
      options:
        - label: This public issue does not contain sensitive vulnerability details.
          required: true
`
const syntheticFeature = `name: Feature request
description: Propose a bounded capability
title: "[Feature]: "
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
    validations:
      required: true
  - type: textarea
    id: desired_outcome
    attributes:
      label: Desired outcome
    validations:
      required: true
  - type: input
    id: provider
    attributes:
      label: Provider
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives
    validations:
      required: true
  - type: textarea
    id: scope
    attributes:
      label: Scope
    validations:
      required: true
  - type: textarea
    id: security_data
    attributes:
      label: Security and data
    validations:
      required: true
  - type: checkboxes
    id: security_confirmation
    attributes:
      description: Do not include credentials, private specifications, customer data, raw logs, or exploit details.
      options:
        - label: No external write, provider execution, publication, or credential use is implied by this request.
          required: true
`
const syntheticConfig = `blank_issues_enabled: false
contact_links:
  - name: Report a vulnerability privately
    url: ${privateReportUrl}
    about: Do not disclose sensitive details publicly.
`
const syntheticPr = `# Summary
## Plan or task
## Scope
## Verification
## Generated artifacts
## Security and privacy
## Compatibility
## External effects
## Checklist
- [ ] Tests and evidence are listed with exact commands or durable links.
- [ ] Generated provider artifacts were rebuilt, or this change does not affect them.
- [ ] Security and privacy impact is described.
- [ ] Compatibility and migration impact is described.
- [ ] External writes are enumerated, or explicitly declared as none.
`
const syntheticReadme = `${readmeLinks.join('\n')}\n`

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  PASS ${name}`)
    passed += 1
  } catch (error) {
    console.error(`  FAIL ${name}`)
    console.error(error)
    failed += 1
  }
}

async function main(): Promise<void> {
await test('canonical synthetic governance surface is accepted', () => {
  assert.deepEqual(validateContributing(syntheticContributing), [])
  assert.deepEqual(validateSecurity(syntheticSecurity), [])
  assert.deepEqual(validateSupport(syntheticSupport), [])
  assert.deepEqual(validateConduct(syntheticConduct), [])
  assert.deepEqual(validateIssueForm(syntheticBug, 'bug'), [])
  assert.deepEqual(validateIssueForm(syntheticFeature, 'feature'), [])
  assert.deepEqual(validateIssueConfig(syntheticConfig), [])
  assert.deepEqual(validatePullRequestTemplate(syntheticPr), [])
  assert.deepEqual(validateReadmeRouting(syntheticReadme), [])
})

await test('policy validators reject reporting, support, conduct, and workspace attacks', () => {
  for (const [name, errors] of [
    ['email reporting', validateSecurity(`${syntheticSecurity}mailto:security@example.com\n`)],
    ['guarantee', validateSecurity(syntheticSecurity.replace('best-effort', 'guaranteed'))],
    ['missing safe harbor', validateSecurity(syntheticSecurity.replace('## Safe harbor', '## Research'))],
    ['support SLA', validateSupport(syntheticSupport.replace('no support SLA', 'a support SLA'))],
    ['unproven discussions', validateSupport(`${syntheticSupport}Use GitHub Discussions.\n`)],
    ['missing attribution', validateConduct(syntheticConduct.replace('Contributor Covenant version 2.1', 'community policy'))],
    ['missing retaliation', validateConduct(syntheticConduct.replace('retaliation', 'reprisal'))],
    ['workspace path', validateContributing(`${syntheticContributing}C:\\private\\repo\n`)],
    ['mixed warning credential request', validateContributing(`${syntheticContributing}Do not ignore this warning; provide credentials.\n`)],
    ['sensitive input request', validateContributing(`${syntheticContributing}Please attach raw logs.\n`)],
    ['private hostname', validateSecurity(`${syntheticSecurity}Use https://security.internal/report.\n`)],
    ['CRLF', validateSupport(syntheticSupport.replace('\n', '\r\n'))],
  ] as Array<[string, string[]]>) assert.notDeepEqual(errors, [], `attack accepted: ${name}`)
})

await test('issue and pull request templates reject missing fields and sensitive-input attacks', () => {
  for (const [name, errors] of [
    ['bug provider', validateIssueForm(syntheticBug.replace('id: provider', 'id: integration'), 'bug')],
    ['bug public confirmation', validateIssueForm(syntheticBug.replace('This public issue does not contain sensitive vulnerability details.', 'Safe to publish.'), 'bug')],
    ['feature security field', validateIssueForm(syntheticFeature.replace('id: security_data', 'id: notes'), 'feature')],
    ['feature external boundary', validateIssueForm(syntheticFeature.replace('No external write, provider execution, publication, or credential use is implied by this request.', 'Approved.'), 'feature')],
    ['blank issues', validateIssueConfig(syntheticConfig.replace('blank_issues_enabled: false', 'blank_issues_enabled: true'))],
    ['PR external effects', validatePullRequestTemplate(syntheticPr.replace('## External effects', '## Other'))],
    ['PR evidence', validatePullRequestTemplate(syntheticPr.replace('- [ ] Tests and evidence are listed with exact commands or durable links.\n', ''))],
    ['odd indentation', validateIssueForm(syntheticBug.replace('  - type: input', '   - type: input'), 'bug')],
    ['unknown YAML key', validateIssueForm(syntheticBug.replace('    validations:', '    validationz:'), 'bug')],
    ['duplicate top level', validateIssueForm(`name: Duplicate\n${syntheticBug}`, 'bug')],
    ['duplicate id', validateIssueForm(syntheticBug.replace('id: operating_system', 'id: provider'), 'bug')],
    ['unknown item type', validateIssueForm(syntheticBug.replace('type: input', 'type: executable'), 'bug')],
    ['missing item validation', validateIssueForm(syntheticBug.replace('    validations:\n      required: true\n  - type: dropdown\n    id: provider', '  - type: dropdown\n    id: provider'), 'bug')],
    ['missing dropdown options', validateIssueForm(syntheticBug.replace('      options:\n        - Codex\n', ''), 'bug')],
  ] as Array<[string, string[]]>) assert.notDeepEqual(errors, [], `attack accepted: ${name}`)
})

await test('README routing rejects missing, duplicate, case-drifted, and stale policy links', () => {
  for (const [name, attacked] of [
    ['missing', syntheticReadme.replace(`${readmeLinks[0]}\n`, '')],
    ['duplicate', `${syntheticReadme}${readmeLinks[0]}\n`],
    ['case drift', syntheticReadme.replace('SECURITY.md', 'Security.md')],
    ['stale status', `${syntheticReadme}Contribution policies are the next P17-018 implementation slice.\n`],
  ]) assert.notDeepEqual(validateReadmeRouting(attacked), [], `attack accepted: ${name}`)
})

await test('current repository satisfies the exact R3A governance contract', () => {
  const readinessGaps: string[] = []
  const missingFiles = governanceFiles.filter((relative) => !fs.existsSync(path.join(root, relative)))
  if (missingFiles.length > 0) readinessGaps.push(`governance artifacts: ${missingFiles.join(', ')}`)

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  if (readmeLinks.some((link) => count(readme, link) !== 1)) readinessGaps.push('README governance routing')

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release', 'public-release-manifest.json'), 'utf8')) as Manifest
  const manifestPaths = new Set(manifest.entries?.map((entry) => entry.path) ?? [])
  const missingManifestPaths = governanceManifestPaths.filter((relative) => !manifestPaths.has(relative))
  const requiredPaths = new Set(manifest.requiredPaths ?? [])
  const missingRequiredPaths = governanceFiles.filter((relative) => !requiredPaths.has(relative))
  if (missingManifestPaths.length > 0 || missingRequiredPaths.length > 0) {
    readinessGaps.push(`release manifest governance paths: entries=${missingManifestPaths.join(', ') || 'none'}; required=${missingRequiredPaths.join(', ') || 'none'}`)
  }

  assert.equal(fs.existsSync(path.join(root, 'CODEOWNERS')) || fs.existsSync(path.join(root, '.github', 'CODEOWNERS')), false, 'CODEOWNERS requires approved public maintainers')
  assert.deepEqual(readinessGaps, [], `P17-018 R3A governance gaps: ${readinessGaps.join(' | ')}`)

  assert.deepEqual(validateContributing(fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8')), [])
  assert.deepEqual(validateSecurity(fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8')), [])
  assert.deepEqual(validateSupport(fs.readFileSync(path.join(root, 'SUPPORT.md'), 'utf8')), [])
  assert.deepEqual(validateConduct(fs.readFileSync(path.join(root, 'CODE_OF_CONDUCT.md'), 'utf8')), [])
  assert.deepEqual(validateIssueForm(fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'utf8'), 'bug'), [])
  assert.deepEqual(validateIssueForm(fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'feature_request.yml'), 'utf8'), 'feature'), [])
  assert.deepEqual(validateIssueConfig(fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'config.yml'), 'utf8')), [])
  assert.deepEqual(validatePullRequestTemplate(fs.readFileSync(path.join(root, '.github', 'pull_request_template.md'), 'utf8')), [])
  assert.deepEqual(validateReadmeRouting(readme), [])
})

console.log(`\npublic-governance-contract.test: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
}

void main()
