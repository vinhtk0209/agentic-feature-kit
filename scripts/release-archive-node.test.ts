import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildProviderBundles } from './build-provider-bundles'
import {
  promoteAdmittedReleaseCandidate,
  scanArchiveTextEntries,
  validateFinalReleaseCandidate,
} from './release-archive-node'

const repositoryRoot = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-feature-kit-archive-admission-'))
const sourceDateEpoch = 1_754_000_000

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function copyRelease(source: string, label: string): string {
  const target = path.join(scratch, label)
  fs.cpSync(source, target, { recursive: true })
  return target
}

function rewriteChecksum(releaseRoot: string, name: string): void {
  const checksumPath = path.join(releaseRoot, 'SHA256SUMS')
  const rows = fs.readFileSync(checksumPath, 'utf8').trimEnd().split('\n').map((row) => {
    const currentName = row.slice(66)
    return currentName === name ? `${sha256(path.join(releaseRoot, name))}  ${name}` : row
  })
  fs.writeFileSync(checksumPath, `${rows.join('\n')}\n`, 'utf8')
}

const admissionOptions = (releaseRoot: string) => ({
  repositoryRoot,
  releaseRoot,
  sourceDateEpoch,
  providerIds: ['codex', 'claude', 'copilot'],
  bundleVersion: '0.5.0',
  sharedCoreVersion: '1.3.0',
  sourceVersion: '3.25.0',
})

async function main(): Promise<void> {
  try {
    const built = await buildProviderBundles({
      repositoryRoot,
      outputRoot: path.join(scratch, 'build'),
      sourceDateEpoch,
    })
    const releaseRoot = path.dirname(built[0].archivePath)
    const report = validateFinalReleaseCandidate(admissionOptions(releaseRoot))
    assert.equal(report.schemaVersion, '1.0.0')
    assert.equal(report.status, 'admitted')
    assert.equal(report.archives, 3)
    assert.equal(report.sidecars, 8)
    assert.equal(report.checksums, 11)
    assert.equal(report.providers.join(','), 'codex,claude,copilot')
    assert.equal(report.secretDetectorFamilies, 10)
    assert.ok(report.archiveEntries > 0)
    assert.ok(report.textFiles >= report.archiveEntries + report.sidecars)

    const reconstructedSecret = ['ghp', '_', 'A'.repeat(36)].join('')
    const secretResult = scanArchiveTextEntries([
      { path: 'agentic-feature-kit/runtime/secret.txt', bytes: Buffer.from(`token=${reconstructedSecret}\n`) },
    ])
    assert.equal(secretResult.detectorFamilies, 10)
    assert.equal(secretResult.findings.length, 1)
    assert.equal(secretResult.findings[0].path, 'agentic-feature-kit/runtime/secret.txt')
    assert.doesNotMatch(JSON.stringify(secretResult), new RegExp(reconstructedSecret))

    const extra = copyRelease(releaseRoot, 'attack-extra')
    fs.writeFileSync(path.join(extra, 'noise.txt'), 'noise\n')
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(extra)), /release-archive/)

    const missing = copyRelease(releaseRoot, 'attack-missing')
    fs.rmSync(path.join(missing, 'agentic-feature-kit-codex-0.5.0.spdx.json'))
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(missing)), /release-archive/)

    const checksumDrift = copyRelease(releaseRoot, 'attack-checksum')
    fs.appendFileSync(path.join(checksumDrift, 'agentic-feature-kit-codex-0.5.0.cdx.json'), '\n')
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(checksumDrift)), /release-archive/)

    const archiveDrift = copyRelease(releaseRoot, 'attack-archive')
    const archiveName = 'agentic-feature-kit-codex-0.5.0.zip'
    fs.appendFileSync(path.join(archiveDrift, archiveName), Buffer.of(0))
    rewriteChecksum(archiveDrift, archiveName)
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(archiveDrift)), /release-archive/)

    const schemaDrift = copyRelease(releaseRoot, 'attack-schema')
    const sidecarName = 'agentic-feature-kit-codex-0.5.0.cdx.json'
    const sidecarPath = path.join(schemaDrift, sidecarName)
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
    sidecar.specVersion = '1.5'
    fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8')
    rewriteChecksum(schemaDrift, sidecarName)
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(schemaDrift)), /release-archive/)

    const directoryDrift = copyRelease(releaseRoot, 'attack-directory')
    fs.appendFileSync(path.join(directoryDrift, 'codex', 'agentic-feature-kit', 'runtime', 'project-intelligence.cjs'), '\n// drift\n')
    assert.throws(() => validateFinalReleaseCandidate(admissionOptions(directoryDrift)), /release-archive/)

    const failedOutputRoot = path.join(scratch, 'promotion-failed')
    const failedStage = path.join(failedOutputRoot, '.stage-0.5.0-test')
    const retainedRelease = path.join(failedOutputRoot, '0.5.0')
    fs.mkdirSync(failedOutputRoot, { recursive: true })
    fs.cpSync(releaseRoot, failedStage, { recursive: true })
    fs.mkdirSync(retainedRelease)
    fs.writeFileSync(path.join(retainedRelease, 'retained.txt'), 'retained\n')
    fs.appendFileSync(path.join(failedStage, 'SHA256SUMS'), 'invalid\n')
    assert.throws(() => promoteAdmittedReleaseCandidate({
      ...admissionOptions(failedStage),
      outputRoot: failedOutputRoot,
      stageRoot: failedStage,
      releaseRoot: retainedRelease,
    }), /release-archive/)
    assert.equal(fs.existsSync(failedStage), false)
    assert.equal(fs.readFileSync(path.join(retainedRelease, 'retained.txt'), 'utf8'), 'retained\n')
    assert.deepEqual(fs.readdirSync(failedOutputRoot).sort(), ['0.5.0'])

    const successOutputRoot = path.join(scratch, 'promotion-success')
    const successStage = path.join(successOutputRoot, '.stage-0.5.0-test')
    const replacedRelease = path.join(successOutputRoot, '0.5.0')
    fs.mkdirSync(successOutputRoot, { recursive: true })
    fs.cpSync(releaseRoot, successStage, { recursive: true })
    fs.mkdirSync(replacedRelease)
    fs.writeFileSync(path.join(replacedRelease, 'old.txt'), 'old\n')
    const promoted = promoteAdmittedReleaseCandidate({
      ...admissionOptions(successStage),
      outputRoot: successOutputRoot,
      stageRoot: successStage,
      releaseRoot: replacedRelease,
    })
    assert.equal(promoted.status, 'admitted')
    assert.equal(fs.existsSync(successStage), false)
    assert.equal(fs.existsSync(path.join(replacedRelease, 'old.txt')), false)
    assert.equal(validateFinalReleaseCandidate(admissionOptions(replacedRelease)).status, 'admitted')
    assert.deepEqual(fs.readdirSync(successOutputRoot).sort(), ['0.5.0'])

    const adapterSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'release-archive-node.ts'), 'utf8')
    assert.doesNotMatch(adapterSource, /(?:node:https|node:http|\bfetch\s*\(|https?:\/\/)/)
    console.log(`release-archive-node.test: PASS (3 archives, ${report.archiveEntries} entries, 8 sidecars, 11 checksums, ${report.textFiles} text scans, 6 candidate attacks, 2 promotion paths)`)
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

void main()
