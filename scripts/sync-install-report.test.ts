import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { reportInstalls, type InstallReport } from './sync-to-targets'

const source = fs.readFileSync(path.resolve(__dirname, 'sync-to-targets.ts'), 'utf8')
const UUID_A = '123e4567-e89b-42d3-a456-426614174000'
const NOW = '2026-08-15T12:34:56.000Z'

interface Capture {
  logs: string[]
  warnings: string[]
}

function dependencies(capture: Capture) {
  return {
    now: () => NOW,
    log: (message: string) => capture.logs.push(message),
    warn: (message: string) => capture.warnings.push(message),
  }
}

function receipts(capture: Capture): Record<string, unknown>[] {
  return capture.logs
    .filter((line) => line.startsWith('@@PRIVACY_RECEIPT@@ '))
    .map((line) => JSON.parse(line.slice('@@PRIVACY_RECEIPT@@ '.length)) as Record<string, unknown>)
}

assert.equal(source.includes('/rest/v1/installs'), false, 'legacy installs endpoint must be removed')
assert.equal(source.includes('resolveInstallCommandRunId'), true, 'normal sync must own a command UUID')
assert.equal(source.includes('createBlockedInstallReceipt'), true, 'sync reporter must cross the install adapter')
assert.equal(source.includes('KIT_RUN_ID'), false, 'environment run identity must not be authoritative')

const rollbackBoundary = source.indexOf('if (process.argv.includes("--rollback"))')
const runIdBoundary = source.indexOf('const commandRunId = resolveInstallCommandRunId(undefined)')
const admissionBoundary = source.indexOf('assertCleanClaudeTree(dryRun, forceDirty)')
const targetBoundary = source.indexOf('const result = syncTarget(targetRel, relFiles, dryRun)')
assert.ok(rollbackBoundary >= 0 && rollbackBoundary < runIdBoundary, 'rollback must classify before install identity')
assert.ok(runIdBoundary < admissionBoundary && admissionBoundary < targetBoundary, 'run UUID must precede admission and target work')
assert.equal((source.match(/resolveInstallCommandRunId\(/g) ?? []).length, 1, 'command UUID generation must have one production call site')

const reporterSource = reportInstalls.toString()
for (const pattern of [/fetch\s*\(/, /process\.env/, /SUPABASE/, /\/rest\/v1\//]) {
  assert.doesNotMatch(reporterSource, pattern, `reporter contains forbidden dependency ${pattern}`)
}

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('fetch tripwire reached')
  }

  try {
    const empty: Capture = { logs: [], warnings: [] }
    await reportInstalls([], false, UUID_A, dependencies(empty))
    assert.deepEqual(empty, { logs: [], warnings: [] })

    const one: Capture = { logs: [], warnings: [] }
    await reportInstalls([{ repo: 'private-one', kitVersion: '3.25.0' }], false, UUID_A, dependencies(one))
    assert.equal(receipts(one).length, 1)
    assert.equal(one.warnings.length, 0)

    const touched: string[] = []
    const malicious = [
      Object.defineProperties({}, {
        repo: { get: () => { touched.push('repo'); throw new Error('repo getter reached') } },
        kitVersion: { get: () => { touched.push('kitVersion'); throw new Error('version getter reached') } },
      }),
      { repo: 'private-two', kitVersion: '3.25.0' },
    ] as InstallReport[]
    const many: Capture = { logs: [], warnings: [] }
    await reportInstalls(malicious, false, UUID_A, dependencies(many))
    assert.deepEqual(touched, [], 'non-dry blocked reporting must not inspect observation elements')
    const manyReceipts = receipts(many)
    assert.equal(manyReceipts.length, 1, 'a multi-target batch emits one command receipt')
    assert.deepEqual(manyReceipts[0], {
      schemaVersion: 1,
      policyVersion: 'p17-016-v1',
      writerId: 'kit.sync.install-report',
      runId: UUID_A,
      tenantContextStatus: 'unavailable',
      outcome: 'blocked',
      reasonCode: 'tenant_attestation_unavailable',
      createdAt: NOW,
    })
    const nonDryOutput = many.logs.join('\n')
    for (const forbidden of ['private-one', 'private-two', '3.25.0', 'targetCount', 'repository']) {
      assert.equal(nonDryOutput.includes(forbidden), false, `non-dry output leaked ${forbidden}`)
    }

    const dry: Capture = { logs: [], warnings: [] }
    await reportInstalls([
      { repo: 'preview-one', kitVersion: '3.25.0' },
      { repo: 'preview-two', kitVersion: '3.25.0' },
    ], true, 'not-used-in-dry-run', dependencies(dry))
    assert.equal(receipts(dry).length, 0)
    assert.match(dry.logs[0], /dry run — central persistence is disabled/)
    assert.match(dry.logs.join('\n'), /preview-one/)
    assert.match(dry.logs.join('\n'), /preview-two/)

    const refused: Capture = { logs: [], warnings: [] }
    await reportInstalls([{ repo: 'not-read', kitVersion: '3.25.0' }], false, 'legacy-run-id', dependencies(refused))
    assert.equal(receipts(refused).length, 0)
    assert.deepEqual(refused.warnings, ['\n⚠️  Install report blocked locally.'])
    assert.doesNotMatch(refused.warnings[0], /legacy-run-id|not-read|3\.25\.0|tenant|token|secret/i)

    assert.equal(fetchCalls, 0, 'install reporter must never touch fetch')
    console.log('sync-install-report.test: PASS (0/1/N batch, dry-run, refusal, and fetch tripwire)')
  } finally {
    globalThis.fetch = originalFetch
  }
}

void main()
