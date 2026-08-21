import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const requiredPaths = [
  'packages/core/src/spec-adapter-spec-ir.ts',
  '.claude/commands/feature-from-confluence.md',
  '.claude/commands/feature-from-confluence.spec-ir-wiring.test.ts',
  '.claude/integrations/confluence-b0-intake.test.ts',
  '.claude/integrations/confluence-b0-intake.ts',
  '.claude/integrations/core/semantic-spec.ts',
  '.claude/integrations/core/spec-adapter-spec-ir.ts',
  '.claude/integrations/core/spec-adapter.ts',
  '.claude/integrations/core/spec-ir.ts',
  '.claude/integrations/spec-adapter-compose.test.ts',
  '.claude/integrations/spec-adapter-compose.ts',
  '.claude/integrations/spec-intake.cli.test.ts',
  '.claude/integrations/spec-intake.ts',
  '.claude/integrations/spec-ir.ts',
  'docs/design/spec-intake-ir.md',
  'docs/roadmap/p17-004-a2b-spec-ir-composition-plan.md',
  'docs/roadmap/post-17-roadmap.md',
  'docs/schemas/spec-adapter-result.schema.json',
  'package.json',
  'packages/core/README.md',
  'packages/core/src/spec-adapter-azure-devops.ts',
  'packages/core/src/spec-adapter-jira.ts',
  'packages/core/src/spec-adapter.ts',
  'packages/core/src/spec-ir.ts',
  'packages/core/test/spec-adapter-spec-ir.test.ts',
  'packages/core/test/spec-adapter.test.ts',
  'release/public-release-manifest.json',
  'scripts/build-synced-core.ts',
  'scripts/post-17-spec-adapter-spec-ir-composition-plan.test.ts',
]

for (const relativePath of requiredPaths) {
  assert.equal(
    existsSync(resolve(repoRoot, relativePath)),
    true,
    `A2B source inventory is missing ${relativePath}`,
  )
}

const plan = readFileSync(
  resolve(repoRoot, 'docs/roadmap/p17-004-a2b-spec-ir-composition-plan.md'),
  'utf8',
)
for (const marker of [
  'migration=M1',
  'authority=A1',
  'bridge=B1',
  'confluence=C1',
  'local=L1',
  'staging=S1',
  'privacy=P1',
  'language=T1',
  'scope=N1',
]) {
  assert.match(plan, new RegExp(marker), `A2B plan is missing decision ${marker}`)
}

const packageJson = readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
for (const route of [
  'test:post-17-spec-adapter-spec-ir-composition-plan',
  'test:spec-adapter-spec-ir',
  'test:spec-adapter-compose',
  'npm run test:spec-intake',
  'npm run test:spec-intake-wiring',
  'npm run test:spec-intake-confluence',
]) {
  assert.match(packageJson, new RegExp(route), `package scripts are missing ${route}`)
}

const bridge = readFileSync(resolve(repoRoot, 'packages/core/src/spec-adapter-spec-ir.ts'), 'utf8')
assert.match(bridge, /validateSpecIR/)
assert.doesNotMatch(bridge, /readFile|fetch\(|process\.env|https?:\/\//)

const schema = readFileSync(
  resolve(repoRoot, 'docs/schemas/spec-adapter-result.schema.json'),
  'utf8',
)
assert.match(schema, /"1\.1\.0"/)
assert.match(schema, /"spec-ir-v1"/)

const compatibilityWrapper = readFileSync(
  resolve(repoRoot, '.claude/integrations/spec-ir.ts'),
  'utf8',
).trim()
assert.equal(compatibilityWrapper, "export * from './core/spec-ir'")

for (const filename of [
  'semantic-spec.ts',
  'spec-adapter.ts',
  'spec-adapter-spec-ir.ts',
  'spec-ir.ts',
]) {
  assert.equal(
    readFileSync(resolve(repoRoot, 'packages/core/src', filename), 'utf8'),
    readFileSync(resolve(repoRoot, '.claude/integrations/core', filename), 'utf8'),
    `${filename} must be byte-identical in the generated target-facing mirror`,
  )
}

const prompt = readFileSync(
  resolve(repoRoot, '.claude/commands/feature-from-confluence.md'),
  'utf8',
)
assert.match(prompt, /\.incoming-spec\.adapter-result\.json/)
assert.match(prompt, /adapterResult\.source/)

console.log('P17-004 A2B SpecIR composition plan: PASS')
