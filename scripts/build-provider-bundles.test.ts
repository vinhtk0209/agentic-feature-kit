import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import zlib from 'node:zlib'
import { buildProviderBundles, validateBuiltBundle } from './build-provider-bundles'
import { loadSchemaRegistry, validateSbomPairAgainstSchemas } from './release-sbom-node'
import type { SbomPair } from './release-sbom-contract'
import { scanTextSecrets } from './public-source-readiness-contract'

const repositoryRoot = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-feature-kit-distribution-'))

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256Value(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function extractGeneratedZip(archive: string, destination: string): string {
  const zip = fs.readFileSync(archive)
  let offset = 0
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8)
    const compressedSize = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8')
    assert.match(name, /^agentic-feature-kit\/[A-Za-z0-9._/-]+$/)
    assert.equal(name.includes('..'), false)
    const contentStart = nameStart + nameLength + extraLength
    const compressed = zip.subarray(contentStart, contentStart + compressedSize)
    const content = method === 8 ? zlib.inflateRawSync(compressed) : compressed
    const relative = name.slice('agentic-feature-kit/'.length)
    const target = path.resolve(destination, 'agentic-feature-kit', ...relative.split('/'))
    assert.equal(target.startsWith(`${path.resolve(destination)}${path.sep}`), true)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    offset = contentStart + compressedSize
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50)
  return path.join(destination, 'agentic-feature-kit')
}

function createFixture(root: string): string {
  const fixture = path.join(root, 'sample-react-project')
  fs.mkdirSync(path.join(fixture, 'src', 'features', 'profile'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'package.json'), `${JSON.stringify({
    name: 'sample-react-project',
    private: true,
    scripts: { test: 'vitest', build: 'tsc --noEmit' },
    dependencies: { react: '19.0.0', 'react-dom': '19.0.0', 'react-router-dom': '7.0.0' },
    devDependencies: { typescript: '5.7.3', vitest: '2.1.9' },
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(fixture, 'package-lock.json'), '{"lockfileVersion":3}\n')
  fs.writeFileSync(path.join(fixture, 'tsconfig.json'), '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}\n')
  fs.writeFileSync(path.join(fixture, 'src', 'features', 'profile', 'index.tsx'), 'export const Profile = () => null\n')
  fs.writeFileSync(path.join(fixture, 'AGENTS.md'), '# Sample project instructions\n')
  return fixture
}

function runCleanSmoke(bundleRoot: string, fixture: string): void {
  assert.equal(fs.existsSync(path.join(bundleRoot, 'node_modules')), false)
  assert.equal(fs.existsSync(path.join(bundleRoot, 'packages')), false)
  const project = spawnSync(process.execPath, [path.join(bundleRoot, 'runtime', 'project-intelligence.cjs'), fixture], {
    cwd: fixture,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.equal(project.status, 0, `${project.stderr}\n${project.stdout}`)
  const projectLines = project.stdout.trim().split(/\r?\n/)
  assert.equal(projectLines.length, 1)
  assert.match(projectLines[0], /^@@PROJECT_PROFILE@@/)
  const profile = JSON.parse(projectLines[0].slice('@@PROJECT_PROFILE@@'.length))
  assert.equal(profile.status, 'ready')
  assert.equal(profile.framework.value, 'react-web')

  const portability = spawnSync(process.execPath, [path.join(bundleRoot, 'runtime', 'stack-portability.cjs'), fixture], {
    cwd: fixture,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.equal(portability.status, 0, `${portability.stderr}\n${portability.stdout}`)
  const portabilityLines = portability.stdout.trim().split(/\r?\n/)
  assert.equal(portabilityLines.length, 1)
  assert.match(portabilityLines[0], /^@@STACK_PORTABILITY@@/)
  const portabilityResult = JSON.parse(portabilityLines[0].slice('@@STACK_PORTABILITY@@'.length))
  assert.equal(portabilityResult.status, 'ready')
  assert.equal(portabilityResult.profileFingerprint, profile.repository.fingerprint)
  assert.equal(portabilityResult.framework.adapter, 'react-web')
  assert.equal(portabilityResult.conventions.http.state, 'unknown')

  const gates = spawnSync(process.execPath, [path.join(bundleRoot, 'runtime', 'conditional-quality-gates.cjs')], {
    cwd: fixture,
    encoding: 'utf8',
    input: JSON.stringify({
      profile,
      feature: {
        changeScope: 'ui',
        desiredRoute: '/profile',
        files: [
          { path: 'src/features/profile/index.tsx', content: 'export const Profile = () => null' },
          { path: 'src/routes.tsx', content: "export const routes = [{ path: '/profile' }]" },
        ],
      },
    }),
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.equal(gates.status, 0, `${gates.stderr}\n${gates.stdout}`)
  const gateLines = gates.stdout.trim().split(/\r?\n/)
  assert.equal(gateLines.length, 1)
  assert.match(gateLines[0], /^@@CONDITIONAL_GATES@@/)
  const gateResult = JSON.parse(gateLines[0].slice('@@CONDITIONAL_GATES@@'.length))
  assert.equal(gateResult.status, 'pass')
  assert.deepEqual(gateResult.gates.map((gate: { status: string }) => gate.status), ['not_applicable', 'pass', 'not_applicable'])

  const orchestrator = spawnSync(process.execPath, [path.join(bundleRoot, 'runtime', 'workflow-orchestrator.cjs'), 'resume'], {
    cwd: fixture,
    encoding: 'utf8',
    input: JSON.stringify({ envelopes: [], conditionalDisposition: { 'D-cross-2': 'pending' } }),
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.equal(orchestrator.status, 0, orchestrator.stderr)
  const orchestratorLines = orchestrator.stdout.trim().split(/\r?\n/)
  assert.equal(orchestratorLines.length, 1)
  assert.match(orchestratorLines[0], /^@@ORCHESTRATOR_RESULT@@/)
  const result = JSON.parse(orchestratorLines[0].slice('@@ORCHESTRATOR_RESULT@@'.length))
  assert.equal(result.ok, true)
  assert.equal(result.result.resumeFromPhase, 'B0')
  assert.equal(result.result.blockedAt.reason, 'missing')

  const routingMatrix = JSON.parse(fs.readFileSync(path.join(bundleRoot, 'docs', 'roadmap', 'post-17-phase-capability-matrix.json'), 'utf8'))
  const routingPhase = routingMatrix.phases.find((entry: { id: string }) => entry.id === 'B0')
  assert.ok(routingPhase)
  const routing = spawnSync(process.execPath, [path.join(bundleRoot, 'runtime', 'phase-model-router.cjs'), 'route'], {
    cwd: fixture,
    encoding: 'utf8',
    input: JSON.stringify({
      matrix: routingMatrix,
      request: {
        schemaVersion: '1.0.0',
        requestId: 'clean-bundle-routing-smoke',
        phaseId: 'B0',
        phaseContractHash: sha256Value(stableJson({ matrixSchemaVersion: routingMatrix.schemaVersion, gate: routingMatrix.phaseGateBindings.B0, phase: routingPhase })),
        matrixHash: sha256Value(stableJson(routingMatrix)),
        activeConditionIds: [],
        estimatedInputTokens: 1_000,
        candidateIds: ['unqualified-clean-bundle-candidate'],
        requestedEffort: null,
        fallback: null,
      },
      candidates: [],
    }),
    env: { PATH: process.env.PATH ?? '' },
  })
  assert.equal(routing.status, 1, `${routing.stderr}\n${routing.stdout}`)
  const routingLines = routing.stdout.trim().split(/\r?\n/)
  assert.equal(routingLines.length, 1)
  assert.match(routingLines[0], /^@@PHASE_MODEL_ROUTING@@/)
  const routingResult = JSON.parse(routingLines[0].slice('@@PHASE_MODEL_ROUTING@@'.length))
  assert.equal(routingResult.ok, true)
  assert.equal(routingResult.result.status, 'needs_input')
  assert.deepEqual(routingResult.result.reasonCodes, ['candidate_unknown'])
}

async function main(): Promise<void> {
  try {
    const first = await buildProviderBundles({ repositoryRoot, outputRoot: path.join(scratch, 'first'), sourceDateEpoch: 1_754_000_000 })
    const second = await buildProviderBundles({ repositoryRoot, outputRoot: path.join(scratch, 'second'), sourceDateEpoch: 1_754_000_000 })
    assert.deepEqual(first.map((entry) => entry.provider), ['codex', 'claude', 'copilot'])
    assert.deepEqual(first.map((entry) => entry.archiveSha256), second.map((entry) => entry.archiveSha256))

    const runtimeHashes = new Map<string, Set<string>>()
    const fixture = createFixture(scratch)
    for (const entry of first) {
      const manifest = validateBuiltBundle(entry.bundleRoot, { provider: entry.provider, bundleVersion: '0.5.0', sharedCoreVersion: '1.3.0' })
      assert.equal(manifest.manifestHash, entry.manifestHash)
      assert.equal(manifest.files.some((file) => /(^|\/)(\.env|node_modules)(\/|$)/i.test(file.path)), false)
      assert.ok(manifest.files.some((file) => file.path === 'THIRD_PARTY_NOTICES.md'))
      assert.ok(manifest.files.some((file) => file.path === 'licenses/typescript-LICENSE.txt'))
      assert.match(fs.readFileSync(path.join(entry.bundleRoot, 'licenses', 'typescript-LICENSE.txt'), 'utf8'), /Apache License/)
      assert.ok(manifest.files.some((file) => file.path === 'docs/schemas/phase-model-routing-request.schema.json'))
      assert.ok(manifest.files.some((file) => file.path === 'docs/schemas/phase-model-routing-decision.schema.json'))
      assert.ok(manifest.files.some((file) => file.path === 'docs/roadmap/post-17-phase-capability-matrix.json'))
      for (const runtime of ['runtime/project-intelligence.cjs', 'runtime/stack-portability.cjs', 'runtime/conditional-quality-gates.cjs', 'runtime/workflow-orchestrator.cjs', 'runtime/phase-model-router.cjs']) {
        const hash = manifest.files.find((file) => file.path === runtime)?.sha256
        assert.ok(hash)
        const values = runtimeHashes.get(runtime) ?? new Set<string>()
        values.add(hash)
        runtimeHashes.set(runtime, values)
      }
      const conditionalRuntime = manifest.files.find((file) => file.path === 'runtime/conditional-quality-gates.cjs')
      assert.ok(conditionalRuntime && conditionalRuntime.bytes < 200_000, 'conditional gate runtime must reuse the adjacent profiler instead of duplicating TypeScript')
      assert.match(fs.readFileSync(path.join(entry.bundleRoot, 'runtime', 'conditional-quality-gates.cjs'), 'utf8'), /project-intelligence\.cjs/)
      const portabilityRuntime = manifest.files.find((file) => file.path === 'runtime/stack-portability.cjs')
      assert.ok(portabilityRuntime && portabilityRuntime.bytes < 200_000, 'stack portability runtime must reuse the adjacent profiler instead of duplicating TypeScript')
      assert.match(fs.readFileSync(path.join(entry.bundleRoot, 'runtime', 'stack-portability.cjs'), 'utf8'), /project-intelligence\.cjs/)
      assert.equal(fs.readFileSync(entry.archivePath).readUInt32LE(0), 0x04034b50)
      assert.equal(sha256(entry.archivePath), entry.archiveSha256)
      const cleanRoot = extractGeneratedZip(entry.archivePath, path.join(scratch, 'clean', entry.provider))
      validateBuiltBundle(cleanRoot, { provider: entry.provider, bundleVersion: '0.5.0', sharedCoreVersion: '1.3.0' })
      runCleanSmoke(cleanRoot, fixture)
    }
    for (const hashes of runtimeHashes.values()) assert.equal(hashes.size, 1)

    const firstRelease = path.join(scratch, 'first', '0.5.0')
    const secondRelease = path.join(scratch, 'second', '0.5.0')
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
    const sums = fs.readFileSync(path.join(firstRelease, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)
    assert.equal(sums.length, 11)
    const checksumRows = sums.map((line) => {
      const match = /^([0-9a-f]{64})  ([a-z0-9][a-z0-9.-]*)$/.exec(line)
      assert.ok(match, `invalid checksum row: ${line}`)
      return { sha256: match[1], name: match[2] }
    })
    assert.deepEqual(checksumRows.map(({ name }) => name), expectedChecksumNames)
    for (const entry of first) assert.ok(sums.includes(`${entry.archiveSha256}  ${path.basename(entry.archivePath)}`))
    for (const row of checksumRows) {
      assert.equal(sha256(path.join(firstRelease, row.name)), row.sha256)
      assert.equal(fs.readFileSync(path.join(firstRelease, row.name)).equals(fs.readFileSync(path.join(secondRelease, row.name))), true, `${row.name} must be byte-identical`)
    }
    assert.equal(fs.readFileSync(path.join(firstRelease, 'SHA256SUMS')).equals(fs.readFileSync(path.join(secondRelease, 'SHA256SUMS'))), true)

    const schemaRegistry = loadSchemaRegistry(repositoryRoot)
    const readPair = (target: string, version: string): SbomPair => {
      const prefix = `agentic-feature-kit-${target}-${version}`
      const spdxText = fs.readFileSync(path.join(firstRelease, `${prefix}.spdx.json`), 'utf8')
      const cycloneDxText = fs.readFileSync(path.join(firstRelease, `${prefix}.cdx.json`), 'utf8')
      return {
        spdx: JSON.parse(spdxText),
        cycloneDx: JSON.parse(cycloneDxText),
        spdxText,
        cycloneDxText,
      } as SbomPair
    }
    const sourcePair = readPair('source', '3.25.0')
    assert.deepEqual(validateSbomPairAgainstSchemas(sourcePair, schemaRegistry), [])
    assert.equal(sourcePair.spdx.packages.length, 622)
    assert.equal(sourcePair.cycloneDx.components.length, 621)
    assert.equal(sourcePair.cycloneDx.dependencies[0].dependsOn.length, 0)
    for (const entry of first) {
      const pair = readPair(entry.provider, '0.5.0')
      assert.deepEqual(validateSbomPairAgainstSchemas(pair, schemaRegistry), [])
      assert.equal(pair.spdx.packages.length, 2)
      assert.equal(pair.cycloneDx.components.length, 1)
      assert.equal(pair.cycloneDx.components[0].name, 'typescript')
      assert.equal(pair.cycloneDx.components[0].version, '4.9.5')
      assert.deepEqual(pair.cycloneDx.dependencies[0].dependsOn, ['pkg:npm/typescript@4.9.5'])
      assert.equal(pair.cycloneDx.metadata.component.hashes?.[0].content, entry.archiveSha256)
    }
    const sidecarText = expectedChecksumNames
      .filter((name) => name.endsWith('.json'))
      .map((name) => fs.readFileSync(path.join(firstRelease, name), 'utf8'))
      .join('\n')
    assert.doesNotMatch(sidecarText, /(?:[A-Za-z]:\\|\\Users\\|localhost|token=|password=|processId)/i)
    const sidecarSecretScan = scanTextSecrets({
      files: expectedChecksumNames
        .filter((name) => name.endsWith('.json'))
        .map((name) => ({ path: name, contentKind: 'text' as const, bytes: fs.readFileSync(path.join(firstRelease, name)) })),
      sha256: (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
      maxFileBytes: 2 * 1024 * 1024,
      maxFindingsPerFile: 4,
      maxFindings: 16,
    })
    assert.equal(sidecarSecretScan.textFiles, 8)
    assert.equal(sidecarSecretScan.detectorFamilies, 10)
    assert.deepEqual(sidecarSecretScan.findings, [])

    const failedOutput = path.join(scratch, 'failed-output')
    await assert.rejects(
      buildProviderBundles({ repositoryRoot, outputRoot: failedOutput, sourceDateEpoch: -1 }),
      /sourceDateEpoch/,
    )
    assert.equal(
      fs.existsSync(failedOutput) ? fs.readdirSync(failedOutput).length : 0,
      0,
      'failed build must leave no stage, release, sidecar, or checksum residue',
    )

    const tampered = path.join(scratch, 'tampered')
    fs.cpSync(first[0].bundleRoot, tampered, { recursive: true })
    fs.appendFileSync(path.join(tampered, 'runtime', 'project-intelligence.cjs'), '\n// tamper\n')
    assert.throws(() => validateBuiltBundle(tampered, { provider: 'codex', bundleVersion: '0.5.0', sharedCoreVersion: '1.3.0' }), /file hash mismatch/)

    const noisy = path.join(scratch, 'noisy')
    fs.cpSync(first[1].bundleRoot, noisy, { recursive: true })
    fs.writeFileSync(path.join(noisy, 'undeclared.txt'), 'noise')
    assert.throws(() => validateBuiltBundle(noisy, { provider: 'claude', bundleVersion: '0.5.0', sharedCoreVersion: '1.3.0' }), /undeclared or missing files/)

    const drifted = path.join(scratch, 'drifted')
    fs.cpSync(first[2].bundleRoot, drifted, { recursive: true })
    const manifestPath = path.join(drifted, 'bundle-manifest.json')
    const driftedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    driftedManifest.sharedCoreVersion = '9.9.9'
    fs.writeFileSync(manifestPath, JSON.stringify(driftedManifest))
    assert.throws(() => validateBuiltBundle(drifted, { provider: 'copilot', bundleVersion: '0.5.0', sharedCoreVersion: '1.3.0' }), /version mismatch/)

    console.log('build-provider-bundles.test: PASS (3 deterministic archives, 8 deterministic schema-valid/secret-clean sidecars, 11 checksums, 15 clean runtime smokes, shared-core/version/content integrity, 4 attacks)')
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

void main()
