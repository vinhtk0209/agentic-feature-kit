import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { composeSpecAdapterArtifactsFromFile } from './spec-adapter-compose'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-adapter-compose-'))
const sourcePath = path.join(root, 'private-feature.md')
const irPath = path.join(root, 'result.ir.json')
const payload = [
  '# Export report',
  '',
  'AC1: Given a ready report, when export runs, then a file downloads.',
].join('\n')
fs.writeFileSync(sourcePath, payload, 'utf8')

const composed = composeSpecAdapterArtifactsFromFile(sourcePath)
assert.equal(composed.ir.sourceKind, 'raw-us')
assert.match(composed.ir.sourceRef, /^local:raw-us:[0-9a-f]{64}$/)
assert.equal(composed.ir.sourceRef, composed.result.source.sourceRef)
assert.equal(composed.ir.sourceSha256, composed.result.source.sourceSha256)
assert.doesNotMatch(JSON.stringify(composed), /private-feature|spec-adapter-compose-/)

const cli = path.join(__dirname, 'spec-adapter-compose.ts')
function runCli(args: string[]) {
  if (process.platform === 'win32') {
    const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`
    return spawnSync(`npx tsx ${quote(cli)} ${args.map(quote).join(' ')}`, {
      encoding: 'utf8',
      shell: true,
    })
  }
  const executable = path.join(process.cwd(), 'node_modules', '.bin', 'tsx')
  return spawnSync(executable, [cli, ...args], { encoding: 'utf8' })
}

const success = runCli([sourcePath, '--ir-output', irPath])
assert.equal(success.status, 0, success.stderr)
const cliResult = JSON.parse(success.stdout)
const cliIr = JSON.parse(fs.readFileSync(irPath, 'utf8'))
assert.equal(cliResult.source.sourceRef, cliIr.sourceRef)
assert.deepEqual(cliResult.source.acceptanceCriteria, cliIr.acceptanceCriteria)
assert.doesNotMatch(success.stdout, /private-feature|spec-adapter-compose-/)
assert.equal(success.stderr, '')

const missingPath = path.join(root, 'secret-missing.md')
const missing = runCli([missingPath, '--ir-output', irPath])
assert.notEqual(missing.status, 0)
assert.equal(missing.stdout, '')
assert.equal(missing.stderr.trim(), 'spec-adapter-compose:SPEC_INPUT_READ_FAILED')
assert.doesNotMatch(missing.stderr, /secret-missing|spec-adapter-compose-/)

const invalid = runCli([sourcePath, '--unknown', 'value'])
assert.notEqual(invalid.status, 0)
assert.equal(invalid.stdout, '')
assert.equal(invalid.stderr.trim(), 'spec-adapter-compose:USAGE_INVALID')

console.log('spec-adapter-compose.test: PASS (single-parse artifacts, opaque provenance, and closed CLI)')
