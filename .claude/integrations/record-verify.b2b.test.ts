import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { captureAndRecord, VERIFY_NOTES_REF } from './record-verify'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPLICIT_RUN_ID = '123e4567-e89b-42d3-a456-426614174000'

let passed = 0
let failed = 0

async function test(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function git(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function makeTargetRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-b2b-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'b2b@example.test'])
  git(dir, ['config', 'user.name', 'B2B Test'])
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@target/b2b-test' }))
  const commandDir = path.join(dir, '.claude', 'commands')
  fs.mkdirSync(commandDir, { recursive: true })
  fs.writeFileSync(path.join(commandDir, 'feature-from-confluence.md'), 'PROMPT_VERSION: v3.25\n')
  const featureDir = path.join(dir, 'src', 'demo')
  fs.mkdirSync(path.join(featureDir, 'data'), { recursive: true })
  fs.writeFileSync(path.join(featureDir, 'data', 'api.ts'), 'export const api = true\n')
  fs.writeFileSync(path.join(featureDir, 'index.ts'), 'export const demo = true\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'fixture', '--no-verify'])
  return dir
}

function inDir<T>(dir: string, body: () => T): T {
  const previous = process.cwd()
  try {
    process.chdir(dir)
    return body()
  } finally {
    process.chdir(previous)
  }
}

function remove(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function readNote(dir: string): Record<string, unknown> {
  const result = git(dir, ['notes', `--ref=${VERIFY_NOTES_REF}`, 'show', 'HEAD'])
  assert.equal(result.status, 0, String(result.stderr || result.stdout))
  return JSON.parse(String(result.stdout)) as Record<string, unknown>
}

async function main(): Promise<void> {
  await test('V1 source contains no legacy central REST writer or environment run-ID authority', () => {
    const source = fs.readFileSync(path.join(__dirname, 'record-verify.ts'), 'utf8')
    for (const pattern of [
      /\/rest\/v1\/verify_records/,
      /SUPABASE_URL|SUPABASE_ANON_KEY/,
      /pushVerifyRecord/,
      /generateRunId/,
      /process\.env\.KIT_RUN_ID/,
    ]) assert.doesNotMatch(source, pattern)
  })

  await test('R1 capture boundary creates one UUID and stores it in the retained local git note', () => {
    const dir = makeTargetRepo()
    try {
      inDir(dir, () => captureAndRecord({
        codePath: 'src/demo',
        specName: null,
        tierACmd: 'node -e "process.exit(0)"',
      }))
      const note = readNote(dir)
      assert.equal(typeof note.runner_run_id, 'string')
      assert.match(String(note.runner_run_id), UUID)
    } finally {
      remove(dir)
    }
  })

  await test('R1 ignores a spoofed KIT_RUN_ID environment value as input authority', () => {
    const dir = makeTargetRepo()
    const previous = process.env.KIT_RUN_ID
    process.env.KIT_RUN_ID = 'run-env-spoof'
    try {
      inDir(dir, () => captureAndRecord({
        codePath: 'src/demo',
        specName: null,
        tierACmd: 'node -e "process.exit(0)"',
      }))
      const note = readNote(dir)
      assert.match(String(note.runner_run_id), UUID)
      assert.notEqual(note.runner_run_id, 'run-env-spoof')
    } finally {
      if (previous === undefined) delete process.env.KIT_RUN_ID
      else process.env.KIT_RUN_ID = previous
      remove(dir)
    }
  })

  await test('R1 rejects a legacy explicit run ID before launching tier commands', () => {
    const dir = makeTargetRepo()
    try {
      const sentinel = path.join(dir, 'tier-ran.txt')
      assert.throws(() => inDir(dir, () => captureAndRecord({
        codePath: 'src/demo',
        specName: null,
        tierACmd: 'node -e "require(\'fs\').writeFileSync(\'tier-ran.txt\',\'x\')"',
        runner_run_id: 'run-legacy',
      })), /verification writer adapter refused/)
      assert.equal(fs.existsSync(sentinel), false)
    } finally {
      remove(dir)
    }
  })

  await test('R1 preserves one explicit UUID in child process context and the local note', () => {
    const dir = makeTargetRepo()
    try {
      inDir(dir, () => captureAndRecord({
        codePath: 'src/demo',
        specName: null,
        tierACmd: 'node -e "require(\'fs\').writeFileSync(\'seen-run.txt\',process.env.KIT_RUN_ID||\'\')"',
        runner_run_id: EXPLICIT_RUN_ID,
      }))
      assert.equal(fs.readFileSync(path.join(dir, 'seen-run.txt'), 'utf8'), EXPLICIT_RUN_ID)
      assert.equal(readNote(dir).runner_run_id, EXPLICIT_RUN_ID)
    } finally {
      remove(dir)
    }
  })

  await test('L1 CLI emits one closed receipt and no raw local-note identifiers', () => {
    const dir = makeTargetRepo()
    try {
      const script = path.join(__dirname, 'record-verify.ts')
      const result = spawnSync(
        `npx tsx "${script}" record --feature-path src/demo --tierA 0`,
        { cwd: dir, encoding: 'utf8', shell: true },
      )
      const output = `${result.stdout || ''}${result.stderr || ''}`
      assert.equal(result.status, 0, output)
      const receipts = output.split(/\r?\n/).filter((line) => line.startsWith('@@PRIVACY_RECEIPT@@ '))
      assert.equal(receipts.length, 1, output)
      const receipt = JSON.parse(receipts[0].slice('@@PRIVACY_RECEIPT@@ '.length)) as Record<string, unknown>
      assert.deepEqual(Object.keys(receipt).sort(), [
        'createdAt', 'outcome', 'policyVersion', 'reasonCode', 'runId', 'schemaVersion',
        'tenantContextStatus', 'writerId',
      ])
      assert.equal(receipt.outcome, 'blocked')
      assert.equal(receipt.reasonCode, 'tenant_attestation_unavailable')
      const note = readNote(dir)
      assert.equal(receipt.runId, note.runner_run_id)
      assert.match(String(receipt.runId), UUID)
      assert.match(output, /verify note written[^\n]*verified=true/)
      for (const raw of ['src/demo', '@target/b2b-test', '"feature":', '"code_path":', '"spec_name":']) {
        assert.equal(output.includes(raw), false, `CLI output leaked ${raw}: ${output}`)
      }
    } finally {
      remove(dir)
    }
  })

  console.log(`record-verify.b2b.test: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
