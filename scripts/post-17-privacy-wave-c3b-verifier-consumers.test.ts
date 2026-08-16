import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')

interface Sources {
  plan: string
  workflow: string
  config: string
  telemetry: string
  telemetryMock: string
  telemetryTest: string
}

function loadSources(): Sources {
  return {
    plan: fs.readFileSync(
      path.join(root, 'docs', 'roadmap', 'p17-016-wave-c3-tenant-foundation-execution-plan.md'),
      'utf8',
    ),
    workflow: fs.readFileSync(path.join(root, 'bin', 'workflow.ts'), 'utf8'),
    config: fs.readFileSync(path.join(root, 'bin', 'lib', 'local-config.ts'), 'utf8'),
    telemetry: fs.readFileSync(path.join(root, '.claude', 'integrations', 'telemetry.ts'), 'utf8'),
    telemetryMock: fs.readFileSync(path.join(root, '.claude', 'integrations', 'telemetry-mock-runner.ts'), 'utf8'),
    telemetryTest: fs.readFileSync(path.join(root, '.claude', 'integrations', 'telemetry.test.ts'), 'utf8'),
  }
}

function validate(sources: Sources): string[] {
  const errors: string[] = []
  const normalizedPlan = sources.plan.replace(/\s+/g, ' ')
  for (const phrase of [
    'The same C3B source checkpoint removes the legacy owner dependency',
    'New verification results, logs, and saved configs contain no raw owner field',
    'does not claim historical local-data purge',
  ]) {
    if (!normalizedPlan.includes(phrase)) errors.push(`plan:${phrase}`)
  }
  for (const [name, source] of [
    ['workflow', sources.workflow],
    ['telemetry', sources.telemetry],
  ] as const) {
    if (!source.includes("{ valid: true; runs_used: number; max_runs: number | null }")) {
      errors.push(`${name}:bounded-valid-result`)
    }
    if (!source.includes("{ valid: false; reason: string }")) errors.push(`${name}:closed-reason-result`)
    if (/result\.owner\b/.test(source)) errors.push(`${name}:raw-owner-use`)
    if (/valid:\s*true;\s*owner:/.test(source)) errors.push(`${name}:raw-owner-type`)
    if (!source.includes('p_checkpoint:')) errors.push(`${name}:three-argument-verifier`)
  }

  if (/\n\s*owner:\s*string;/.test(sources.config)) errors.push('config:raw-owner-field')
  if (/\n\s*owner:\s*result\.owner/.test(sources.workflow)) errors.push('workflow:raw-owner-persist')
  if (/Owner\s+:/.test(sources.workflow)) errors.push('workflow:raw-owner-display')
  if (!sources.workflow.includes('Token verified. Token saved to')) errors.push('workflow:bounded-login-message')
  if (!sources.workflow.includes('Status      : ✅ Valid (runs:')) errors.push('workflow:bounded-status-message')
  if (!sources.telemetry.includes('Token valid (runs:')) errors.push('telemetry:bounded-success-message')
  if (/valid:\s*true,\s*owner:/.test(sources.telemetryMock)) errors.push('telemetry-mock:raw-owner-field')
  if (!sources.telemetryTest.includes("assert(!r.stdout.toLowerCase().includes('owner')")) {
    errors.push('telemetry-test:owner-denial')
  }
  if (!sources.telemetryTest.includes('valid verifier response is bounded')) {
    errors.push('telemetry-test:bounded-contract')
  }
  return errors
}

const sources = loadSources()
assert.deepEqual(validate(sources), [], `unsafe verifier consumer contract: ${validate(sources).join(', ')}`)

const attacks: Array<[string, Sources, string]> = [
  [
    'workflow owner output',
    { ...sources, workflow: `${sources.workflow}\nvoid result.owner\n` },
    'workflow:raw-owner-use',
  ],
  [
    'telemetry owner output',
    { ...sources, telemetry: `${sources.telemetry}\nvoid result.owner\n` },
    'telemetry:raw-owner-use',
  ],
  [
    'config owner persistence',
    { ...sources, config: `${sources.config}\ninterface Forged {\n  owner: string;\n}\n` },
    'config:raw-owner-field',
  ],
  [
    'mock owner response',
    { ...sources, telemetryMock: `${sources.telemetryMock}\nconst forged = { valid: true, owner: 'private' }\n` },
    'telemetry-mock:raw-owner-field',
  ],
  [
    'two-argument workflow call',
    { ...sources, workflow: sources.workflow.replace('p_checkpoint:', 'legacy_checkpoint:') },
    'workflow:three-argument-verifier',
  ],
]

for (const [name, attacked, expected] of attacks) {
  assert.ok(validate(attacked).includes(expected), `${name} attack was not rejected with ${expected}`)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
assert.equal(
  packageJson.scripts['test:post-17-privacy-wave-c3b-verifier-consumers'],
  'npx tsx scripts/post-17-privacy-wave-c3b-verifier-consumers.test.ts',
)
assert.ok(
  packageJson.scripts['test:kit'].includes('npm run test:post-17-privacy-wave-c3b-verifier-consumers'),
  'C3B verifier consumer gate is not registered in the full kit suite',
)

console.log('P17-016 Wave C3B verifier consumers: PASS (bounded response, no raw owner, 3-arg only, 5 attacks)')
