import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

type PackageJson = {
  scripts: Record<string, string>
}

const kitRoot = path.resolve(__dirname, '..')
const packagePath = path.join(kitRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson

const WORKSPACE_COMMANDS = [
  'test:post-17-privacy-wave-c2-schema-migration-design',
  'test:post-17-privacy-wave-c3-tenant-foundation-execution',
  'test:post-17-privacy-wave-c3c-service-role-denial',
  'test:post-17-privacy-wave-c3d-disposable-postgres',
  'test:post-17-privacy-wave-c4-verification-sink-plan',
  'test:post-17-privacy-wave-c4d-disposable-verification',
  'test:post-17-privacy-wave-c5-live-cutover-plan',
  'test:post-17-control-plane-implementation-plan',
] as const

const WORKSPACE_SOURCES: Record<(typeof WORKSPACE_COMMANDS)[number], string> = {
  'test:post-17-privacy-wave-c2-schema-migration-design':
    'scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts',
  'test:post-17-privacy-wave-c3-tenant-foundation-execution':
    'scripts/post-17-privacy-wave-c3-tenant-foundation-execution.test.ts',
  'test:post-17-privacy-wave-c3c-service-role-denial':
    'scripts/post-17-privacy-wave-c3c-service-role-denial.test.ts',
  'test:post-17-privacy-wave-c3d-disposable-postgres':
    'scripts/post-17-privacy-wave-c3d-disposable-postgres.test.ts',
  'test:post-17-privacy-wave-c4-verification-sink-plan':
    'scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts',
  'test:post-17-privacy-wave-c4d-disposable-verification':
    'scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts',
  'test:post-17-privacy-wave-c5-live-cutover-plan':
    'scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts',
  'test:post-17-control-plane-implementation-plan':
    'scripts/post-17-control-plane-implementation-plan.test.ts',
}

function npmRunTargets(script: string | undefined): string[] {
  if (!script) return []
  return [...script.matchAll(
    /\bnpm(?:\s+--[a-z0-9-]+(?:=[^\s&|]+)?)*\s+run(?:-script)?\s+([a-z0-9:._-]+)/gi,
  )]
    .map((match) => match[1])
}

function executableSourcePaths(script: string | undefined): string[] {
  if (!script) return []
  return [...script.matchAll(
    /\b(?:npx\s+)?(?:tsx|node)(?:\s+--[^\s]+)*\s+([a-z0-9_@./\\-]+\.(?:[cm]?js|tsx?))/gi,
  )].map((match) => match[1].replace(/\\/g, '/'))
}

function hasDashboardSiblingDependency(source: string): boolean {
  if (/['"]\.\.[\\/]kit-dashboard(?:[\\/][^'"]*)?['"]/i.test(source)) return true

  const constructsDashboardPath = /(?:path\.)?(?:join|resolve)\([^)]{0,300}['"]kit-dashboard['"][^)]{0,80}\)/is
    .test(source)
  const constructsParentRoot = /(?:path\.)?resolve\([^)]{0,300}['"]\.\.['"][^)]{0,80}\)/is
    .test(source)
  return constructsDashboardPath && constructsParentRoot
}

function reachableCommands(scripts: Record<string, string>, roots: string[]): Set<string> {
  const reachable = new Set<string>()
  const pending = [...roots]

  while (pending.length > 0) {
    const command = pending.shift()!
    if (reachable.has(command)) continue
    reachable.add(command)
    for (const lifecycle of [`pre${command}`, `post${command}`]) {
      if (scripts[lifecycle]) pending.push(lifecycle)
    }
    for (const nested of npmRunTargets(scripts[command])) pending.push(nested)
  }

  return reachable
}

function validateBoundary(
  scripts: Record<string, string>,
  sources: Readonly<Record<string, string>>,
): string[] {
  const errors: string[] = []
  const expectedWorkspace = WORKSPACE_COMMANDS.map((command) => `npm run ${command}`).join(' && ')

  if (scripts['pretest:kit'] !== 'npm run test:ci-repository-boundary') {
    errors.push('kit-boundary-prehook')
  }
  if (scripts['test:workspace-contracts'] !== expectedWorkspace) {
    errors.push('workspace-command-order')
  }

  const reachable = reachableCommands(scripts, ['test:kit'])
  for (const command of reachable) {
    const script = scripts[command]
    if (!script) {
      errors.push(`missing-kit-command:${command}`)
      continue
    }
    if (hasDashboardSiblingDependency(script)) errors.push(`kit-command-depends-on-dashboard:${command}`)
    for (const sourcePath of executableSourcePaths(script)) {
      const source = sources[sourcePath]
      if (source === undefined) errors.push(`missing-kit-source:${sourcePath}`)
      else if (hasDashboardSiblingDependency(source)) {
        errors.push(`kit-source-depends-on-dashboard:${sourcePath}`)
      }
    }
  }

  for (const command of WORKSPACE_COMMANDS) {
    if (!scripts[command]) errors.push(`missing-workspace-command:${command}`)
    if (reachable.has(command)) errors.push(`kit-reaches-workspace-command:${command}`)

    const sourcePath = WORKSPACE_SOURCES[command]
    const source = sources[sourcePath]
    if (source === undefined) errors.push(`missing-workspace-source:${sourcePath}`)
    else if (!source.includes('kit-dashboard')) errors.push(`unclassified-workspace-source:${sourcePath}`)
  }

  return errors
}

const packageSourcePaths = new Set(
  Object.values(packageJson.scripts).flatMap((script) => executableSourcePaths(script)),
)
const sources = Object.fromEntries([...packageSourcePaths].map((relative) => [
  relative,
  fs.readFileSync(path.join(kitRoot, relative), 'utf8'),
]))

assert.deepEqual(validateBoundary(packageJson.scripts, sources), [])

const expectedWorkspace = WORKSPACE_COMMANDS.map((command) => `npm run ${command}`).join(' && ')
const validScripts = {
  ...packageJson.scripts,
  'pretest:kit': 'npm run test:ci-repository-boundary',
  'test:kit': 'npm run test:ci-repository-boundary',
  'test:workspace-contracts': expectedWorkspace,
}

for (const [name, mutate, expectedError] of [
  [
    'missing aggregator',
    (scripts: Record<string, string>) => { delete scripts['test:workspace-contracts'] },
    'workspace-command-order',
  ],
  [
    'omitted command',
    (scripts: Record<string, string>) => {
      scripts['test:workspace-contracts'] = expectedWorkspace.replace(
        ` && npm run ${WORKSPACE_COMMANDS[3]}`,
        '',
      )
    },
    'workspace-command-order',
  ],
  [
    'duplicated command',
    (scripts: Record<string, string>) => {
      scripts['test:workspace-contracts'] = `${expectedWorkspace} && npm run ${WORKSPACE_COMMANDS[0]}`
    },
    'workspace-command-order',
  ],
  [
    'reordered command',
    (scripts: Record<string, string>) => {
      scripts['test:workspace-contracts'] = [
        `npm run ${WORKSPACE_COMMANDS[1]}`,
        `npm run ${WORKSPACE_COMMANDS[0]}`,
        ...WORKSPACE_COMMANDS.slice(2).map((command) => `npm run ${command}`),
      ].join(' && ')
    },
    'workspace-command-order',
  ],
  [
    'direct kit dependency',
    (scripts: Record<string, string>) => {
      scripts['test:kit'] = `npm run ${WORKSPACE_COMMANDS[0]}`
    },
    `kit-reaches-workspace-command:${WORKSPACE_COMMANDS[0]}`,
  ],
  [
    'nested kit dependency',
    (scripts: Record<string, string>) => {
      scripts['test:kit'] = 'npm run test:smuggled-workspace'
      scripts['test:smuggled-workspace'] = `npm run ${WORKSPACE_COMMANDS[1]}`
    },
    `kit-reaches-workspace-command:${WORKSPACE_COMMANDS[1]}`,
  ],
  [
    'lifecycle kit dependency',
    (scripts: Record<string, string>) => {
      scripts['test:kit'] = 'npm run test:self-contained'
      scripts['test:self-contained'] = 'node scripts/self-contained.js'
      scripts['pretest:self-contained'] = `npm --silent run-script ${WORKSPACE_COMMANDS[1]}`
    },
    `kit-reaches-workspace-command:${WORKSPACE_COMMANDS[1]}`,
  ],
  [
    'missing registered command',
    (scripts: Record<string, string>) => { delete scripts[WORKSPACE_COMMANDS[2]] },
    `missing-workspace-command:${WORKSPACE_COMMANDS[2]}`,
  ],
] as const) {
  const attacked = { ...validScripts }
  mutate(attacked)
  assert.ok(validateBoundary(attacked, sources).includes(expectedError), `attack not rejected: ${name}`)
}

const sourceAttack = { ...sources, [WORKSPACE_SOURCES[WORKSPACE_COMMANDS[0]]]: 'self-contained fixture' }
assert.ok(
  validateBoundary(validScripts, sourceAttack).includes(
    `unclassified-workspace-source:${WORKSPACE_SOURCES[WORKSPACE_COMMANDS[0]]}`,
  ),
  'source classification attack not rejected',
)

const dashboardSiblingName = ['kit', 'dashboard'].join('-')
const unknownSourceAttack = {
  ...sources,
  'scripts/new-self-contained.test.ts': [
    "import path from 'node:path'",
    "const kitRoot = process.cwd()",
    `const dashboard = path.resolve(kitRoot, '..', '${dashboardSiblingName}')`,
  ].join('\n'),
}
const unknownSourceScripts = {
  ...validScripts,
  'test:kit': 'npm run test:new-self-contained',
  'test:new-self-contained': 'npx tsx scripts/new-self-contained.test.ts',
}
assert.ok(
  validateBoundary(unknownSourceScripts, unknownSourceAttack).includes(
    'kit-source-depends-on-dashboard:scripts/new-self-contained.test.ts',
  ),
  'unknown dashboard source attack not rejected',
)

console.log(
  `ci-repository-boundary.test: PASS (${WORKSPACE_COMMANDS.length} workspace commands excluded from test:kit)`,
)
