import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

interface ProviderEntry {
  id: 'codex' | 'claude' | 'copilot'
  root: string
  manifest: string | null
  skill: string
  agent: string | null
}

interface ProviderRegistry {
  schemaVersion: string
  product: string
  bundleVersion: string
  sharedCoreVersion: string
  sourceMode: string
  providers: ProviderEntry[]
}

const root = process.cwd()
const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8')
const parseJson = <T>(relative: string): T => JSON.parse(read(relative)) as T
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

function assertNoPlaceholders(relative: string, value: string): void {
  assert.ok(!value.includes('[TODO:'), `${relative} contains a scaffold placeholder`)
  assert.ok(!value.includes('Local developer'), `${relative} contains scaffold author metadata`)
}

function assertSkill(relative: string, expectedHash: string | null): string {
  const content = read(relative)
  assertNoPlaceholders(relative, content)
  assert.match(content, /^---\nname: project-intelligence\ndescription: .+\nlicense: Apache-2\.0\n---\n/)
  assert.match(content, /@@PROJECT_PROFILE@@/)
  assert.match(content, /status` is `needs_input`/)
  assert.match(content, /Do not reproduce its detection rules/)
  assert.ok(!content.includes('react-dom'), `${relative} must not copy framework business rules`)
  const hash = sha256(content)
  if (expectedHash) assert.equal(hash, expectedHash, 'provider skill adapters must stay byte-identical')
  return hash
}

const registry = parseJson<ProviderRegistry>('providers/provider-bundles.json')
assert.equal(registry.schemaVersion, '1.0.0')
assert.equal(registry.product, 'agentic-feature-kit')
assert.equal(registry.bundleVersion, '0.1.0')
assert.equal(registry.sharedCoreVersion, '1.0.0')
assert.equal(registry.sourceMode, 'monorepo')
assert.deepEqual(registry.providers.map((entry) => entry.id), ['codex', 'claude', 'copilot'])

const coreSource = read('packages/core/src/project-intelligence.ts')
assert.match(coreSource, /PROJECT_PROFILE_SCHEMA_VERSION = '1\.0\.0'/)
assert.match(coreSource, /PROJECT_PROFILE_SENTINEL = '@@PROJECT_PROFILE@@'/)
assert.match(coreSource, /export function validateProjectProfile/)
assert.match(coreSource, /export function parseProjectProfileEnvelope/)
assert.doesNotMatch(coreSource, /\.writeFile|\.appendFile|\.mkdir|\.rmSync|\.unlink/)

const schema = parseJson<Record<string, unknown>>('docs/schemas/project-profile.schema.json')
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((schema.properties as Record<string, { const?: string }>).schemaVersion.const, registry.sharedCoreVersion)

let skillHash: string | null = null
for (const provider of registry.providers) {
  assert.ok(fs.statSync(path.join(root, provider.root)).isDirectory())
  const readme = read(`${provider.root}/README.md`)
  assertNoPlaceholders(`${provider.root}/README.md`, readme)
  assert.match(readme, /Apache-2\.0/)
  assert.match(readme, /0\.1\.0/)
  assert.ok(readme.split(/\s+/).length >= 70, `${provider.id} README is too thin for a public source package`)

  skillHash = assertSkill(`${provider.root}/${provider.skill}`, skillHash)
  if (provider.agent) {
    const agent = read(`${provider.root}/${provider.agent}`)
    assertNoPlaceholders(`${provider.root}/${provider.agent}`, agent)
    assert.match(agent, /^---\nname: project-intelligence\ndescription: .+\n/)
    assert.match(agent, /Do not edit files/)
  }

  if (provider.manifest) {
    const manifest = parseJson<Record<string, unknown>>(`${provider.root}/${provider.manifest}`)
    assert.equal(manifest.name, registry.product)
    assert.equal(manifest.version, registry.bundleVersion)
    assert.equal(manifest.license, 'Apache-2.0')
    assertNoPlaceholders(`${provider.root}/${provider.manifest}`, JSON.stringify(manifest))
  }
}

const codex = registry.providers.find((entry) => entry.id === 'codex')!
const codexManifest = parseJson<Record<string, unknown>>(`${codex.root}/${codex.manifest}`)
assert.equal(codexManifest.skills, './skills/')
assert.equal(codex.agent, null, 'Codex bundle must not invent a standalone agent manifest')

const claude = registry.providers.find((entry) => entry.id === 'claude')!
const claudeManifest = parseJson<Record<string, unknown>>(`${claude.root}/${claude.manifest}`)
assert.deepEqual(claudeManifest.agents, ['./agents/project-intelligence.md'])
assert.match(read(`${claude.root}/${claude.agent}`), /disallowedTools: Write, Edit/)

const copilot = registry.providers.find((entry) => entry.id === 'copilot')!
assert.equal(copilot.manifest, null, 'Copilot must use repository skill/agent surfaces, not a fabricated plugin manifest')
assert.match(read(`${copilot.root}/${copilot.agent}`), /tools: \["read", "search", "execute"\]/)

const packaging = parseJson<{ providers: Array<{ id: string; distributionRoot: string }> }>('docs/roadmap/post-17-provider-packaging.json')
for (const provider of registry.providers) {
  const contract = packaging.providers.find((entry) => entry.id === provider.id)
  assert.ok(contract)
  assert.equal(contract.distributionRoot.replace('<bundle-name>', registry.product), provider.root)
}

for (const entry of fs.readdirSync(path.join(root, 'providers'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue
  assert.ok(!/^\.env(?:\.|$)/.test(entry.name), `provider package contains forbidden environment file ${entry.name}`)
}

console.log('provider-bundles.test: PASS (3 providers, one core version, identical thin skills, manifest/agent/security contracts)')
