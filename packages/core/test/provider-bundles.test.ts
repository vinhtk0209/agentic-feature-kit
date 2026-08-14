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
  orchestratorSkill: string
  orchestratorAgent: string | null
}

interface ProviderRegistry {
  schemaVersion: string
  product: string
  bundleVersion: string
  sharedCoreVersion: string
  sourceMode: string
  distribution: {
    builder: string
    outputRoot: string
    archiveFormat: string
    checksumFile: string
    manifest: string
    nodeEngine: string
    runtime: { projectIntelligence: string; stackPortability: string; conditionalQualityGates: string; workflowOrchestrator: string; phaseModelRouting: string }
  }
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

function assertSkill(relative: string, expectedHash: string | null, skillName: 'project-intelligence' | 'workflow-orchestrator'): string {
  const content = read(relative)
  assertNoPlaceholders(relative, content)
  assert.match(content, new RegExp(`^---\\nname: ${skillName}\\ndescription: .+\\nlicense: Apache-2\\.0\\n---\\n`))
  if (skillName === 'project-intelligence') {
    assert.match(content, /@@PROJECT_PROFILE@@/)
    assert.match(content, /@@STACK_PORTABILITY@@/)
    assert.match(content, /@@CONDITIONAL_GATES@@/)
    assert.match(content, /status` is `needs_input`/)
    assert.match(content, /Do not reproduce its detection rules/)
    assert.ok(!content.includes('react-dom'), `${relative} must not copy framework business rules`)
  } else {
    assert.match(content, /@@ORCHESTRATOR_RESULT@@/)
    assert.match(content, /@@PHASE_MODEL_ROUTING@@/)
    assert.match(content, /`selected` grants no execution authority/)
    assert.match(content, /Do not reproduce selection, qualification, fallback, or performance-ranking rules/)
    assert.match(content, /Provider adapters never auto-approve a gate/)
    assert.match(content, /B11 requires the trusted verifier's computed pass/)
    assert.ok(!content.includes('sourceLines'), `${relative} must not copy phase-boundary business rules`)
  }
  const hash = sha256(content)
  if (expectedHash) assert.equal(hash, expectedHash, `${skillName} provider adapters must stay byte-identical`)
  return hash
}

const registry = parseJson<ProviderRegistry>('providers/provider-bundles.json')
assert.equal(registry.schemaVersion, '1.0.0')
assert.equal(registry.product, 'agentic-feature-kit')
assert.equal(registry.bundleVersion, '0.5.0')
assert.equal(registry.sharedCoreVersion, '1.3.0')
assert.equal(registry.sourceMode, 'monorepo')
assert.deepEqual(registry.distribution, {
  builder: 'scripts/build-provider-bundles.ts',
  outputRoot: 'dist/provider-bundles',
  archiveFormat: 'zip',
  checksumFile: 'SHA256SUMS',
  manifest: 'bundle-manifest.json',
  nodeEngine: '>=20',
  runtime: {
    projectIntelligence: 'runtime/project-intelligence.cjs',
    stackPortability: 'runtime/stack-portability.cjs',
    conditionalQualityGates: 'runtime/conditional-quality-gates.cjs',
    workflowOrchestrator: 'runtime/workflow-orchestrator.cjs',
    phaseModelRouting: 'runtime/phase-model-router.cjs',
  },
})
assert.deepEqual(registry.providers.map((entry) => entry.id), ['codex', 'claude', 'copilot'])

const projectCore = read('packages/core/src/project-intelligence.ts')
assert.match(projectCore, /PROJECT_PROFILE_SCHEMA_VERSION = '1\.0\.0'/)
assert.match(projectCore, /PROJECT_PROFILE_SENTINEL = '@@PROJECT_PROFILE@@'/)
assert.match(projectCore, /export function validateProjectProfile/)
assert.match(projectCore, /export function parseProjectProfileEnvelope/)
assert.match(projectCore, /project-intelligence\\\.\(\?:ts\|js\|cjs\|mjs\)/)
assert.doesNotMatch(projectCore, /\.writeFile|\.appendFile|\.mkdir|\.rmSync|\.unlink/)

const stackPortabilityCore = read('packages/core/src/stack-portability.ts')
assert.match(stackPortabilityCore, /STACK_PORTABILITY_SCHEMA_VERSION = '1\.0\.0'/)
assert.match(stackPortabilityCore, /STACK_PORTABILITY_SENTINEL = '@@STACK_PORTABILITY@@'/)
assert.match(stackPortabilityCore, /export function inspectStackPortability/)
assert.match(stackPortabilityCore, /export function validateStackPortabilityResult/)
assert.doesNotMatch(stackPortabilityCore, /(?:import|require)\s*(?:\(|[^'"\n]*from\s*)['"]@(?:edx|openedx)\//)

const orchestratorCore = read('packages/core/src/workflow-orchestrator.ts')
assert.match(orchestratorCore, /ORCHESTRATOR_CONTRACT_VERSION = '1\.0\.0'/)
assert.match(orchestratorCore, /export function validatePhaseEnvelope/)
assert.match(orchestratorCore, /export function resumeFromPhaseEnvelopes/)
assert.match(orchestratorCore, /export function compareCandidateToGolden/)
assert.doesNotMatch(orchestratorCore, /\.writeFile|\.appendFile|\.mkdir|\.rmSync|\.unlink/)

const conditionalGatesCore = read('packages/core/src/conditional-quality-gates.ts')
assert.match(conditionalGatesCore, /CONDITIONAL_GATES_SCHEMA_VERSION = '1\.0\.0'/)
assert.match(conditionalGatesCore, /CONDITIONAL_GATES_SENTINEL = '@@CONDITIONAL_GATES@@'/)
assert.match(conditionalGatesCore, /export function evaluateConditionalQualityGates/)
assert.match(conditionalGatesCore, /export function validateConditionalGateResult/)
assert.doesNotMatch(conditionalGatesCore, /\.writeFile|\.appendFile|\.mkdir|\.rmSync|\.unlink/)

const phaseModelRouterCore = read('packages/core/src/phase-model-router.ts')
assert.match(phaseModelRouterCore, /PHASE_MODEL_ROUTING_SCHEMA_VERSION = '1\.0\.0'/)
assert.match(phaseModelRouterCore, /export function routePhaseModel/)
assert.match(phaseModelRouterCore, /export function validatePhaseModelRoutingDecision/)
assert.match(phaseModelRouterCore, /export function verifyPhaseModelRoutingDecision/)
assert.doesNotMatch(phaseModelRouterCore, /process\.env|\.writeFile|\.appendFile|\.mkdir|\.rmSync|\.unlink|spawn|exec\(/)

const phaseModelRouterCli = read('packages/core/src/phase-model-router-cli.ts')
assert.match(phaseModelRouterCli, /PHASE_MODEL_ROUTING_SENTINEL = '@@PHASE_MODEL_ROUTING@@'/)
assert.match(phaseModelRouterCli, /PHASE_MODEL_ROUTING_STDIN_MAX_BYTES = 512 \* 1024/)
assert.doesNotMatch(phaseModelRouterCli, /process\.env|readFile|writeFile|spawn|exec\(/)

const profileSchema = parseJson<Record<string, unknown>>('docs/schemas/project-profile.schema.json')
assert.equal(profileSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((profileSchema.properties as Record<string, { const?: string }>).schemaVersion.const, '1.0.0')
const stackPortabilitySchema = parseJson<Record<string, unknown>>('docs/schemas/stack-portability.schema.json')
assert.equal(stackPortabilitySchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((stackPortabilitySchema.properties as Record<string, { const?: string }>).schemaVersion.const, '1.0.0')
const conditionalGatesSchema = parseJson<Record<string, unknown>>('docs/schemas/conditional-quality-gates.schema.json')
assert.equal(conditionalGatesSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((conditionalGatesSchema.properties as Record<string, { const?: string }>).schemaVersion.const, '1.0.0')
const orchestratorSchema = parseJson<Record<string, unknown>>('docs/schemas/orchestrator-phase-envelope.schema.json')
assert.equal(orchestratorSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((orchestratorSchema.properties as Record<string, { const?: string }>).contractVersion.const, '1.0.0')
const phaseRoutingRequestSchema = parseJson<Record<string, unknown>>('docs/schemas/phase-model-routing-request.schema.json')
assert.equal(phaseRoutingRequestSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((phaseRoutingRequestSchema.properties as Record<string, { const?: string }>).schemaVersion.const, '1.0.0')
const phaseRoutingDecisionSchema = parseJson<Record<string, unknown>>('docs/schemas/phase-model-routing-decision.schema.json')
assert.equal(phaseRoutingDecisionSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal((phaseRoutingDecisionSchema.properties as Record<string, { const?: string }>).schemaVersion.const, '1.0.0')

let projectSkillHash: string | null = null
let orchestratorSkillHash: string | null = null
for (const provider of registry.providers) {
  assert.ok(fs.statSync(path.join(root, provider.root)).isDirectory())
  const readme = read(`${provider.root}/README.md`)
  assertNoPlaceholders(`${provider.root}/README.md`, readme)
  assert.match(readme, /Apache-2\.0/)
  assert.match(readme, /0\.5\.0/)
  assert.match(readme, /stack-portability\.cjs/)
  assert.match(readme, /conditional-quality-gates\.cjs/)
  assert.match(readme, /phase-model-router\.cjs/)
  assert.match(readme, /Selection never executes a\s+provider/)
  assert.ok(readme.split(/\s+/).length >= 120, `${provider.id} README is too thin for a public source package`)

  projectSkillHash = assertSkill(`${provider.root}/${provider.skill}`, projectSkillHash, 'project-intelligence')
  orchestratorSkillHash = assertSkill(`${provider.root}/${provider.orchestratorSkill}`, orchestratorSkillHash, 'workflow-orchestrator')
  if (provider.agent) {
    const agent = read(`${provider.root}/${provider.agent}`)
    assertNoPlaceholders(`${provider.root}/${provider.agent}`, agent)
    assert.match(agent, /^---\nname: project-intelligence\ndescription: .+\n/)
    assert.match(agent, /Do not edit files/)
    assert.match(agent, /Stack\s+Portability/)
  }
  if (provider.orchestratorAgent) {
    const agent = read(`${provider.root}/${provider.orchestratorAgent}`)
    assertNoPlaceholders(`${provider.root}/${provider.orchestratorAgent}`, agent)
    assert.match(agent, /^---\nname: workflow-orchestrator\ndescription: .+\n/)
    assert.match(agent, /Never\s+auto-approve/)
    assert.match(agent, /phase-model-router/)
    assert.match(agent, /selected decision never\s+grants provider execution/)
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
assert.equal(codex.orchestratorAgent, null, 'Codex bundle must not invent a standalone orchestrator agent manifest')
assert.match(read(`${codex.root}/skills/workflow-orchestrator/agents/openai.yaml`), /Route model-eligible phases only from qualified evidence/)
assert.ok((codexManifest.interface as { capabilities: string[] }).capabilities.includes('Phase-aware model routing'))

const claude = registry.providers.find((entry) => entry.id === 'claude')!
const claudeManifest = parseJson<Record<string, unknown>>(`${claude.root}/${claude.manifest}`)
assert.deepEqual(claudeManifest.agents, ['./agents/project-intelligence.md', './agents/workflow-orchestrator.md'])
assert.match(read(`${claude.root}/${claude.agent}`), /disallowedTools: Write, Edit/)
assert.match(read(`${claude.root}/${claude.orchestratorAgent}`), /skills: project-intelligence, workflow-orchestrator/)

const copilot = registry.providers.find((entry) => entry.id === 'copilot')!
assert.equal(copilot.manifest, null, 'Copilot must use repository skill/agent surfaces, not a fabricated plugin manifest')
assert.match(read(`${copilot.root}/${copilot.agent}`), /tools: \["read", "search", "execute"\]/)
assert.match(read(`${copilot.root}/${copilot.orchestratorAgent}`), /tools: \["read", "search", "edit", "execute", "agent"\]/)

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

console.log('provider-bundles.test: PASS (3 providers, 2 byte-identical skills, 5 shared runtimes, version/schema/manifest/agent/security contracts)')
