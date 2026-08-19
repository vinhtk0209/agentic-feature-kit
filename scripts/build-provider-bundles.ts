#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { build, type Plugin } from 'esbuild'
import { canonicalJson, type SbomBuildInput } from './release-sbom-contract'
import {
  captureSourceSbomInput,
  generateSourceSbomSidecars,
  loadSchemaRegistry,
  resolveEmbeddedComponents,
  writeValidatedSbomPair,
  type SbomOutputFile,
} from './release-sbom-node'

export const PROVIDER_BUNDLE_RESULT_SENTINEL = '@@PROVIDER_BUNDLE_RESULT@@' as const

type ProviderId = 'codex' | 'claude' | 'copilot'

interface ProviderRegistryEntry {
  id: ProviderId
  root: string
  manifest: string | null
  skill: string
  agent: string | null
  orchestratorSkill: string
  orchestratorAgent: string | null
}

interface ProviderRegistry {
  schemaVersion: '1.0.0'
  product: 'agentic-feature-kit'
  bundleVersion: string
  sharedCoreVersion: string
  sourceMode: 'monorepo'
  distribution: {
    builder: 'scripts/build-provider-bundles.ts'
    outputRoot: 'dist/provider-bundles'
    archiveFormat: 'zip'
    checksumFile: 'SHA256SUMS'
    manifest: 'bundle-manifest.json'
    nodeEngine: '>=20'
    runtime: { projectIntelligence: 'runtime/project-intelligence.cjs'; stackPortability: 'runtime/stack-portability.cjs'; conditionalQualityGates: 'runtime/conditional-quality-gates.cjs'; workflowOrchestrator: 'runtime/workflow-orchestrator.cjs'; phaseModelRouting: 'runtime/phase-model-router.cjs' }
  }
  providers: ProviderRegistryEntry[]
}

export interface BundleFileEntry {
  path: string
  bytes: number
  sha256: string
}

export interface DistributionManifest {
  schemaVersion: 1
  product: 'agentic-feature-kit'
  provider: ProviderId
  bundleVersion: string
  sharedCoreVersion: string
  nodeEngine: '>=20'
  capabilities: ['project-intelligence', 'stack-portability', 'conditional-quality-gates', 'workflow-orchestrator', 'phase-model-routing']
  files: BundleFileEntry[]
  manifestHash: string
}

export interface ProviderBuildResult {
  provider: ProviderId
  bundleRoot: string
  archivePath: string
  archiveSha256: string
  manifestHash: string
  sidecars: SbomOutputFile[]
}

const SOURCE_ALLOWED = [
  /^README\.md$/,
  /^\.codex-plugin\/plugin\.json$/,
  /^\.claude-plugin\/plugin\.json$/,
  /^skills\/(project-intelligence|workflow-orchestrator)\/SKILL\.md$/,
  /^skills\/(project-intelligence|workflow-orchestrator)\/agents\/openai\.yaml$/,
  /^agents\/(project-intelligence|workflow-orchestrator)\.md$/,
  /^\.github\/skills\/(project-intelligence|workflow-orchestrator)\/SKILL\.md$/,
  /^\.github\/agents\/(project-intelligence|workflow-orchestrator)\.agent\.md$/,
]

const COMMON_FILES = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/schemas/project-profile.schema.json',
  'docs/schemas/stack-portability.schema.json',
  'docs/schemas/conditional-quality-gates.schema.json',
  'docs/schemas/orchestrator-phase-envelope.schema.json',
  'docs/schemas/phase-model-routing-request.schema.json',
  'docs/schemas/phase-model-routing-decision.schema.json',
  'docs/roadmap/post-17-orchestrator-boundaries.json',
  'docs/roadmap/post-17-orchestrator-golden.json',
  'docs/roadmap/post-17-phase-capability-matrix.json',
] as const

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...keys].sort(compareText)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields must be exactly ${expected.join(', ')}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function relativePosix(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

function assertWithin(root: string, candidate: string, label: string): void {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidate)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`${label} escapes its root`)
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
}

function validateRegistry(value: unknown, repositoryRoot: string): ProviderRegistry {
  if (!isRecord(value)) throw new Error('provider registry must be an object')
  exactKeys(value, ['schemaVersion', 'product', 'bundleVersion', 'sharedCoreVersion', 'sourceMode', 'distribution', 'providers'], 'provider registry')
  if (value.schemaVersion !== '1.0.0' || value.product !== 'agentic-feature-kit' || value.sourceMode !== 'monorepo') throw new Error('unsupported provider registry')
  if (typeof value.bundleVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.bundleVersion)) throw new Error('bundleVersion must be semver')
  if (typeof value.sharedCoreVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.sharedCoreVersion)) throw new Error('sharedCoreVersion must be semver')
  if (!isRecord(value.distribution)) throw new Error('provider distribution contract must be an object')
  exactKeys(value.distribution, ['builder', 'outputRoot', 'archiveFormat', 'checksumFile', 'manifest', 'nodeEngine', 'runtime'], 'provider distribution contract')
  if (
    value.distribution.builder !== 'scripts/build-provider-bundles.ts'
    || value.distribution.outputRoot !== 'dist/provider-bundles'
    || value.distribution.archiveFormat !== 'zip'
    || value.distribution.checksumFile !== 'SHA256SUMS'
    || value.distribution.manifest !== 'bundle-manifest.json'
    || value.distribution.nodeEngine !== '>=20'
  ) throw new Error('unsupported provider distribution contract')
  if (!isRecord(value.distribution.runtime)) throw new Error('provider distribution runtime contract must be an object')
  exactKeys(value.distribution.runtime, ['projectIntelligence', 'stackPortability', 'conditionalQualityGates', 'workflowOrchestrator', 'phaseModelRouting'], 'provider distribution runtime contract')
  if (
    value.distribution.runtime.projectIntelligence !== 'runtime/project-intelligence.cjs'
    || value.distribution.runtime.stackPortability !== 'runtime/stack-portability.cjs'
    || value.distribution.runtime.conditionalQualityGates !== 'runtime/conditional-quality-gates.cjs'
    || value.distribution.runtime.workflowOrchestrator !== 'runtime/workflow-orchestrator.cjs'
    || value.distribution.runtime.phaseModelRouting !== 'runtime/phase-model-router.cjs'
  ) throw new Error('unsupported provider runtime contract')
  if (!Array.isArray(value.providers) || value.providers.length !== 3) throw new Error('provider registry must contain exactly three providers')
  const ids = new Set<string>()
  for (const [index, provider] of value.providers.entries()) {
    if (!isRecord(provider)) throw new Error(`providers[${index}] must be an object`)
    exactKeys(provider, ['id', 'root', 'manifest', 'skill', 'agent', 'orchestratorSkill', 'orchestratorAgent'], `providers[${index}]`)
    if (!['codex', 'claude', 'copilot'].includes(String(provider.id)) || ids.has(String(provider.id))) throw new Error('provider IDs must be unique and supported')
    ids.add(String(provider.id))
    for (const key of ['root', 'skill', 'orchestratorSkill']) if (typeof provider[key] !== 'string' || provider[key].length === 0) throw new Error(`providers[${index}].${key} is invalid`)
    for (const key of ['manifest', 'agent', 'orchestratorAgent']) if (provider[key] !== null && (typeof provider[key] !== 'string' || provider[key].length === 0)) throw new Error(`providers[${index}].${key} is invalid`)
    const sourceRoot = path.resolve(repositoryRoot, provider.root as string)
    assertWithin(repositoryRoot, sourceRoot, `providers[${index}].root`)
    if (!fs.existsSync(sourceRoot)) throw new Error(`provider source root is missing: ${provider.root}`)
    for (const key of ['manifest', 'skill', 'agent', 'orchestratorSkill', 'orchestratorAgent'] as const) {
      const relative = provider[key]
      if (typeof relative !== 'string') continue
      const referenced = path.resolve(sourceRoot, relative)
      assertWithin(sourceRoot, referenced, `providers[${index}].${key}`)
      if (!fs.existsSync(referenced) || !fs.statSync(referenced).isFile()) throw new Error(`provider source reference is missing: ${provider.root}/${relative}`)
    }
  }
  return value as unknown as ProviderRegistry
}

function walkFiles(root: string): string[] {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
      const full = path.join(directory, entry.name)
      const stat = fs.lstatSync(full)
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are forbidden in provider bundles: ${relativePosix(root, full)}`)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) files.push(full)
      else throw new Error(`unsupported provider source entry: ${relativePosix(root, full)}`)
    }
  }
  visit(root)
  return files.sort((a, b) => compareText(relativePosix(root, a), relativePosix(root, b)))
}

function copyProviderSource(sourceRoot: string, targetRoot: string): void {
  for (const source of walkFiles(sourceRoot)) {
    const relative = relativePosix(sourceRoot, source)
    if (!SOURCE_ALLOWED.some((pattern) => pattern.test(relative))) throw new Error(`provider source file is outside the allowlist: ${relative}`)
    if (/(^|\/)(\.env(?:\.|$)|node_modules|dist)(\/|$)/i.test(relative)) throw new Error(`sensitive or generated provider source is forbidden: ${relative}`)
    const target = path.join(targetRoot, ...relative.split('/'))
    assertWithin(targetRoot, target, 'provider target')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
}

function copyCommonFiles(repositoryRoot: string, targetRoot: string): void {
  for (const relative of COMMON_FILES) {
    const source = path.join(repositoryRoot, ...relative.split('/'))
    if (!fs.existsSync(source)) throw new Error(`required distribution file is missing: ${relative}`)
    const target = path.join(targetRoot, ...relative.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
  const typescriptPackage = require.resolve('typescript/package.json', { paths: [repositoryRoot] })
  const typescriptLicense = path.join(path.dirname(typescriptPackage), 'LICENSE.txt')
  if (!fs.existsSync(typescriptLicense)) throw new Error('TypeScript runtime license is missing')
  const licenseTarget = path.join(targetRoot, 'licenses', 'typescript-LICENSE.txt')
  fs.mkdirSync(path.dirname(licenseTarget), { recursive: true })
  fs.copyFileSync(typescriptLicense, licenseTarget)
}

async function buildRuntime(repositoryRoot: string, runtimeRoot: string): Promise<string[]> {
  fs.mkdirSync(runtimeRoot, { recursive: true })
  const shared = {
    bundle: true,
    platform: 'node' as const,
    target: 'node20',
    format: 'cjs' as const,
    legalComments: 'none' as const,
    logLevel: 'silent' as const,
    sourcemap: false,
    metafile: true,
  }
  const metafileInputs = new Set<string>()
  const run = async (options: Parameters<typeof build>[0]): Promise<void> => {
    const result = await build({ ...shared, ...options })
    if (!result.metafile) throw new Error('esbuild did not return the required runtime metafile')
    for (const input of Object.keys(result.metafile.inputs)) metafileInputs.add(input.split(path.sep).join('/'))
  }
  await run({ entryPoints: [path.join(repositoryRoot, 'packages/core/src/project-intelligence.ts')], outfile: path.join(runtimeRoot, 'project-intelligence.cjs') })
  const externalProjectIntelligence: Plugin = {
    name: 'shared-project-intelligence-runtime',
    setup(context) {
      context.onResolve({ filter: /^\.\/project-intelligence$/ }, () => ({ path: './project-intelligence.cjs', external: true }))
    },
  }
  await run({
    entryPoints: [path.join(repositoryRoot, 'packages/core/src/stack-portability.ts')],
    outfile: path.join(runtimeRoot, 'stack-portability.cjs'),
    plugins: [externalProjectIntelligence],
  })
  await run({
    entryPoints: [path.join(repositoryRoot, 'packages/core/src/conditional-quality-gates.ts')],
    outfile: path.join(runtimeRoot, 'conditional-quality-gates.cjs'),
    plugins: [externalProjectIntelligence],
  })
  await run({ entryPoints: [path.join(repositoryRoot, 'packages/core/src/workflow-orchestrator-cli.ts')], outfile: path.join(runtimeRoot, 'workflow-orchestrator.cjs') })
  await run({ entryPoints: [path.join(repositoryRoot, 'packages/core/src/phase-model-router-cli.ts')], outfile: path.join(runtimeRoot, 'phase-model-router.cjs') })
  return [...metafileInputs].sort(compareText)
}

function manifestPayload(manifest: Omit<DistributionManifest, 'manifestHash'>): string {
  return stableJson(manifest)
}

function writeDistributionManifest(bundleRoot: string, provider: ProviderId, registry: ProviderRegistry): DistributionManifest {
  const files = walkFiles(bundleRoot).map((file) => {
    const content = fs.readFileSync(file)
    return { path: relativePosix(bundleRoot, file), bytes: content.length, sha256: sha256(content) }
  })
  const withoutHash: Omit<DistributionManifest, 'manifestHash'> = {
    schemaVersion: 1,
    product: 'agentic-feature-kit',
    provider,
    bundleVersion: registry.bundleVersion,
    sharedCoreVersion: registry.sharedCoreVersion,
    nodeEngine: '>=20',
    capabilities: ['project-intelligence', 'stack-portability', 'conditional-quality-gates', 'workflow-orchestrator', 'phase-model-routing'],
    files,
  }
  const manifest = { ...withoutHash, manifestHash: sha256(manifestPayload(withoutHash)) }
  fs.writeFileSync(path.join(bundleRoot, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

export function validateBuiltBundle(bundleRoot: string, expected: { provider: ProviderId; bundleVersion: string; sharedCoreVersion: string }): DistributionManifest {
  const manifestPath = path.join(bundleRoot, 'bundle-manifest.json')
  const value = readJson(manifestPath)
  if (!isRecord(value)) throw new Error('distribution manifest must be an object')
  exactKeys(value, ['schemaVersion', 'product', 'provider', 'bundleVersion', 'sharedCoreVersion', 'nodeEngine', 'capabilities', 'files', 'manifestHash'], 'distribution manifest')
  if (value.schemaVersion !== 1 || value.product !== 'agentic-feature-kit' || value.provider !== expected.provider) throw new Error('distribution manifest identity mismatch')
  if (value.bundleVersion !== expected.bundleVersion || value.sharedCoreVersion !== expected.sharedCoreVersion) throw new Error('distribution manifest version mismatch')
  if (value.nodeEngine !== '>=20' || JSON.stringify(value.capabilities) !== JSON.stringify(['project-intelligence', 'stack-portability', 'conditional-quality-gates', 'workflow-orchestrator', 'phase-model-routing'])) throw new Error('distribution manifest capability contract mismatch')
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error('distribution manifest files must be non-empty')
  const files = value.files as unknown[]
  const paths = new Set<string>()
  for (const [index, raw] of files.entries()) {
    if (!isRecord(raw)) throw new Error(`distribution files[${index}] must be an object`)
    exactKeys(raw, ['path', 'bytes', 'sha256'], `distribution files[${index}]`)
    if (typeof raw.path !== 'string' || raw.path.includes('..') || path.isAbsolute(raw.path) || paths.has(raw.path)) throw new Error('distribution manifest paths must be safe and unique')
    paths.add(raw.path)
    const file = path.join(bundleRoot, ...raw.path.split('/'))
    assertWithin(bundleRoot, file, 'distribution file')
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error(`distribution file is missing or unsafe: ${raw.path}`)
    const content = fs.readFileSync(file)
    if (raw.bytes !== content.length || raw.sha256 !== sha256(content)) throw new Error(`distribution file hash mismatch: ${raw.path}`)
  }
  const actual = walkFiles(bundleRoot).map((file) => relativePosix(bundleRoot, file)).filter((file) => file !== 'bundle-manifest.json')
  if (JSON.stringify(actual) !== JSON.stringify([...paths].sort(compareText))) throw new Error('distribution bundle contains undeclared or missing files')
  const { manifestHash, ...withoutHash } = value
  if (typeof manifestHash !== 'string' || manifestHash !== sha256(manifestPayload(withoutHash as Omit<DistributionManifest, 'manifestHash'>))) throw new Error('distribution manifest hash mismatch')

  const providerManifest = expected.provider === 'codex'
    ? readJson(path.join(bundleRoot, '.codex-plugin', 'plugin.json'))
    : expected.provider === 'claude'
      ? readJson(path.join(bundleRoot, '.claude-plugin', 'plugin.json'))
      : null
  if (isRecord(providerManifest) && providerManifest.version !== expected.bundleVersion) throw new Error('provider manifest version differs from distribution version')
  return value as unknown as DistributionManifest
}

let crcTable: Uint32Array | undefined
function crc32(content: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function createDeterministicZip(sourceRoot: string, archivePath: string, archiveRoot: string): void {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const file of walkFiles(sourceRoot)) {
    const relative = `${archiveRoot}/${relativePosix(sourceRoot, file)}`
    const name = Buffer.from(relative, 'utf8')
    const content = fs.readFileSync(file)
    const compressed = zlib.deflateRawSync(content, { level: 9 })
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(33, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  const entries = centralParts.length / 2
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries, 8)
  end.writeUInt16LE(entries, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  fs.writeFileSync(archivePath, Buffer.concat([...localParts, centralDirectory, end]))
}

export async function buildProviderBundles(options: { repositoryRoot?: string; outputRoot?: string; sourceDateEpoch?: number } = {}): Promise<ProviderBuildResult[]> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? path.join(__dirname, '..'))
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repositoryRoot, 'dist', 'provider-bundles'))
  const registry = validateRegistry(readJson(path.join(repositoryRoot, 'providers', 'provider-bundles.json')), repositoryRoot)
  const releaseRoot = path.join(outputRoot, registry.bundleVersion)
  const stageRoot = path.join(outputRoot, `.stage-${registry.bundleVersion}-${process.pid}`)
  assertWithin(outputRoot, releaseRoot, 'release root')
  assertWithin(outputRoot, stageRoot, 'stage root')
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.rmSync(stageRoot, { recursive: true, force: true })
  fs.mkdirSync(stageRoot, { recursive: true })
  try {
    const sourceSbom = generateSourceSbomSidecars({
      repoRoot: repositoryRoot,
      outputDir: stageRoot,
      sourceDateEpoch: options.sourceDateEpoch,
      expectedWorkspaceRoots: 4,
      expectedDependencies: 617,
    })
    const runtimeRoot = path.join(stageRoot, '.shared-runtime')
    const runtimeInputs = await buildRuntime(repositoryRoot, runtimeRoot)
    const embeddedComponents = resolveEmbeddedComponents(repositoryRoot, runtimeInputs)
    if (JSON.stringify(embeddedComponents.map(({ name, version }) => `${name}@${version}`)) !== JSON.stringify(['typescript@4.9.5'])) {
      throw new Error(`provider embedded package inventory drift: ${embeddedComponents.map(({ name, version }) => `${name}@${version}`).join(', ')}`)
    }
    const schemaRegistry = loadSchemaRegistry(repositoryRoot)
    const results: ProviderBuildResult[] = []
    for (const provider of registry.providers) {
      const packageName = `agentic-feature-kit-${provider.id}-${registry.bundleVersion}`
      const bundleRoot = path.join(stageRoot, provider.id, 'agentic-feature-kit')
      copyProviderSource(path.resolve(repositoryRoot, provider.root), bundleRoot)
      copyCommonFiles(repositoryRoot, bundleRoot)
      fs.cpSync(runtimeRoot, path.join(bundleRoot, 'runtime'), { recursive: true })
      const manifest = writeDistributionManifest(bundleRoot, provider.id, registry)
      validateBuiltBundle(bundleRoot, { provider: provider.id, bundleVersion: registry.bundleVersion, sharedCoreVersion: registry.sharedCoreVersion })
      const archivePath = path.join(stageRoot, `${packageName}.zip`)
      createDeterministicZip(bundleRoot, archivePath, 'agentic-feature-kit')
      const archiveSha256 = sha256(fs.readFileSync(archivePath))
      const sbomInput: SbomBuildInput = {
        artifact: {
          kind: 'provider',
          targetId: provider.id,
          name: `agentic-feature-kit-${provider.id}`,
          version: registry.bundleVersion,
          purl: `pkg:generic/${packageName}@${registry.bundleVersion}`,
          identitySha256: sha256(canonicalJson({ archiveSha256, manifestHash: manifest.manifestHash })),
          manifestSha256: manifest.manifestHash,
          artifactSha256: archiveSha256,
          createdEpochSeconds: sourceSbom.sourceDateEpoch,
        },
        components: embeddedComponents,
      }
      const sidecars = writeValidatedSbomPair(repositoryRoot, stageRoot, sbomInput, schemaRegistry).files
      results.push({ provider: provider.id, bundleRoot, archivePath, archiveSha256, manifestHash: manifest.manifestHash, sidecars })
    }
    fs.rmSync(runtimeRoot, { recursive: true, force: true })
    const recapturedSource = captureSourceSbomInput(repositoryRoot, sourceSbom.sourceDateEpoch, 4, 617)
    if (canonicalJson(recapturedSource.input) !== canonicalJson(sourceSbom.input)) {
      throw new Error('provider release source input drifted during build')
    }
    const checksumFiles = [
      ...sourceSbom.files,
      ...results.flatMap(({ sidecars }) => sidecars),
      ...results.map((entry) => ({ name: path.basename(entry.archivePath), bytes: fs.statSync(entry.archivePath).size, sha256: entry.archiveSha256 })),
    ].sort((left, right) => compareText(left.name, right.name))
    const expectedChecksumNames = [
      'agentic-feature-kit-claude-0.5.0.cdx.json',
      'agentic-feature-kit-claude-0.5.0.spdx.json',
      'agentic-feature-kit-claude-0.5.0.zip',
      'agentic-feature-kit-codex-0.5.0.cdx.json',
      'agentic-feature-kit-codex-0.5.0.spdx.json',
      'agentic-feature-kit-codex-0.5.0.zip',
      'agentic-feature-kit-copilot-0.5.0.cdx.json',
      'agentic-feature-kit-copilot-0.5.0.spdx.json',
      'agentic-feature-kit-copilot-0.5.0.zip',
      'agentic-feature-kit-source-3.25.0.cdx.json',
      'agentic-feature-kit-source-3.25.0.spdx.json',
    ]
    if (JSON.stringify(checksumFiles.map(({ name }) => name)) !== JSON.stringify(expectedChecksumNames)) {
      throw new Error(`provider release checksum set drift: ${checksumFiles.map(({ name }) => name).join(', ')}`)
    }
    const sums = checksumFiles.map((entry) => `${entry.sha256}  ${entry.name}`)
    fs.writeFileSync(path.join(stageRoot, 'SHA256SUMS'), `${sums.join('\n')}\n`, 'utf8')
    fs.rmSync(releaseRoot, { recursive: true, force: true })
    fs.renameSync(stageRoot, releaseRoot)
    return results.map((entry) => ({
      ...entry,
      bundleRoot: entry.bundleRoot.replace(stageRoot, releaseRoot),
      archivePath: entry.archivePath.replace(stageRoot, releaseRoot),
    }))
  } catch (error) {
    fs.rmSync(stageRoot, { recursive: true, force: true })
    throw error
  }
}

if (require.main === module) {
  buildProviderBundles()
    .then((results) => process.stdout.write(`${PROVIDER_BUNDLE_RESULT_SENTINEL}${JSON.stringify({ schemaVersion: 1, ok: true, results })}\n`))
    .catch((error) => {
      process.stdout.write(`${PROVIDER_BUNDLE_RESULT_SENTINEL}${JSON.stringify({ schemaVersion: 1, ok: false, error: error instanceof Error ? error.message : String(error) })}\n`)
      process.exitCode = 1
    })
}
