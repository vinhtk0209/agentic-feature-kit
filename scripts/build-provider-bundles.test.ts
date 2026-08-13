import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import zlib from 'node:zlib'
import { buildProviderBundles, validateBuiltBundle } from './build-provider-bundles'

const repositoryRoot = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-feature-kit-distribution-'))

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
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
}

async function main(): Promise<void> {
  try {
    const first = await buildProviderBundles({ repositoryRoot, outputRoot: path.join(scratch, 'first') })
    const second = await buildProviderBundles({ repositoryRoot, outputRoot: path.join(scratch, 'second') })
    assert.deepEqual(first.map((entry) => entry.provider), ['codex', 'claude', 'copilot'])
    assert.deepEqual(first.map((entry) => entry.archiveSha256), second.map((entry) => entry.archiveSha256))

    const runtimeHashes = new Map<string, Set<string>>()
    const fixture = createFixture(scratch)
    for (const entry of first) {
      const manifest = validateBuiltBundle(entry.bundleRoot, { provider: entry.provider, bundleVersion: '0.3.0', sharedCoreVersion: '1.1.0' })
      assert.equal(manifest.manifestHash, entry.manifestHash)
      assert.equal(manifest.files.some((file) => /(^|\/)(\.env|node_modules)(\/|$)/i.test(file.path)), false)
      assert.ok(manifest.files.some((file) => file.path === 'THIRD_PARTY_NOTICES.md'))
      assert.ok(manifest.files.some((file) => file.path === 'licenses/typescript-LICENSE.txt'))
      assert.match(fs.readFileSync(path.join(entry.bundleRoot, 'licenses', 'typescript-LICENSE.txt'), 'utf8'), /Apache License/)
      for (const runtime of ['runtime/project-intelligence.cjs', 'runtime/conditional-quality-gates.cjs', 'runtime/workflow-orchestrator.cjs']) {
        const hash = manifest.files.find((file) => file.path === runtime)?.sha256
        assert.ok(hash)
        const values = runtimeHashes.get(runtime) ?? new Set<string>()
        values.add(hash)
        runtimeHashes.set(runtime, values)
      }
      const conditionalRuntime = manifest.files.find((file) => file.path === 'runtime/conditional-quality-gates.cjs')
      assert.ok(conditionalRuntime && conditionalRuntime.bytes < 200_000, 'conditional gate runtime must reuse the adjacent profiler instead of duplicating TypeScript')
      assert.match(fs.readFileSync(path.join(entry.bundleRoot, 'runtime', 'conditional-quality-gates.cjs'), 'utf8'), /project-intelligence\.cjs/)
      assert.equal(fs.readFileSync(entry.archivePath).readUInt32LE(0), 0x04034b50)
      assert.equal(sha256(entry.archivePath), entry.archiveSha256)
      const cleanRoot = extractGeneratedZip(entry.archivePath, path.join(scratch, 'clean', entry.provider))
      validateBuiltBundle(cleanRoot, { provider: entry.provider, bundleVersion: '0.3.0', sharedCoreVersion: '1.1.0' })
      runCleanSmoke(cleanRoot, fixture)
    }
    for (const hashes of runtimeHashes.values()) assert.equal(hashes.size, 1)

    const sums = fs.readFileSync(path.join(scratch, 'first', '0.3.0', 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)
    assert.equal(sums.length, 3)
    for (const entry of first) assert.ok(sums.includes(`${entry.archiveSha256}  ${path.basename(entry.archivePath)}`))

    const tampered = path.join(scratch, 'tampered')
    fs.cpSync(first[0].bundleRoot, tampered, { recursive: true })
    fs.appendFileSync(path.join(tampered, 'runtime', 'project-intelligence.cjs'), '\n// tamper\n')
    assert.throws(() => validateBuiltBundle(tampered, { provider: 'codex', bundleVersion: '0.3.0', sharedCoreVersion: '1.1.0' }), /file hash mismatch/)

    const noisy = path.join(scratch, 'noisy')
    fs.cpSync(first[1].bundleRoot, noisy, { recursive: true })
    fs.writeFileSync(path.join(noisy, 'undeclared.txt'), 'noise')
    assert.throws(() => validateBuiltBundle(noisy, { provider: 'claude', bundleVersion: '0.3.0', sharedCoreVersion: '1.1.0' }), /undeclared or missing files/)

    const drifted = path.join(scratch, 'drifted')
    fs.cpSync(first[2].bundleRoot, drifted, { recursive: true })
    const manifestPath = path.join(drifted, 'bundle-manifest.json')
    const driftedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    driftedManifest.sharedCoreVersion = '9.9.9'
    fs.writeFileSync(manifestPath, JSON.stringify(driftedManifest))
    assert.throws(() => validateBuiltBundle(drifted, { provider: 'copilot', bundleVersion: '0.3.0', sharedCoreVersion: '1.1.0' }), /version mismatch/)

    console.log('build-provider-bundles.test: PASS (3 deterministic archives, 9 clean runtime smokes, shared-core/version/content integrity, 3 attacks)')
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

void main()
