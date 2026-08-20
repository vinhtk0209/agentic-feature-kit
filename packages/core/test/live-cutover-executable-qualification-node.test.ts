import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import {
  C5B_EXECUTABLE_QUALIFICATION_POLICY_VERSION,
  C5B_EXECUTABLE_QUALIFICATION_SCHEMA_VERSION,
  createNodeC5BExecutableProbeExecutor,
  isC5BExecutableQualificationCurrent,
  qualifyC5BExecutableCapabilities,
  type C5BExecutableProbeExecution,
  type C5BExecutableProbeExecutor,
  type C5BExecutableProbeRequest,
  type C5BExecutableQualificationConfig,
  type C5BExecutableQualificationResult,
  type C5BProbeSpawnFactory,
} from '../src/live-cutover-executable-qualification-node'

const rawSecretControl = 'raw-executable-probe-secret-must-not-escape'

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

interface Fixture {
  readonly root: string
  readonly pgDump: string
  readonly pgRestore: string
  readonly age: string
  readonly postgresReceipt: string
  readonly ageReceipt: string
}

function fixture(root: string): Fixture {
  const bin = path.join(root, 'bin')
  const receipts = path.join(root, 'receipts')
  fs.mkdirSync(bin, { recursive: true })
  fs.mkdirSync(receipts, { recursive: true })
  const value = {
    root,
    pgDump: path.join(bin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'),
    pgRestore: path.join(bin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore'),
    age: path.join(bin, process.platform === 'win32' ? 'age.exe' : 'age'),
    postgresReceipt: path.join(receipts, 'postgres.receipt'),
    ageReceipt: path.join(receipts, 'age.receipt'),
  }
  fs.writeFileSync(value.pgDump, 'qualified-pg-dump-bytes')
  fs.writeFileSync(value.pgRestore, 'qualified-pg-restore-bytes')
  fs.writeFileSync(value.age, 'qualified-age-bytes')
  fs.writeFileSync(value.postgresReceipt, 'externally-verified-postgres-receipt')
  fs.writeFileSync(value.ageReceipt, 'externally-verified-age-receipt')
  return value
}

function expectation(executablePath: string, provenanceReceiptPath: string, expectedVersion: string) {
  return {
    executablePath,
    executableSha256: sha256(fs.readFileSync(executablePath)),
    provenanceReceiptPath,
    provenanceReceiptSha256: sha256(fs.readFileSync(provenanceReceiptPath)),
    expectedVersion,
  }
}

function config(value: Fixture, overrides: Partial<C5BExecutableQualificationConfig> = {}): C5BExecutableQualificationConfig {
  return {
    pgDump: expectation(value.pgDump, value.postgresReceipt, '17.11'),
    pgRestore: expectation(value.pgRestore, value.postgresReceipt, '17.11'),
    age: expectation(value.age, value.ageReceipt, '1.2.1'),
    qualificationTtlMs: 300_000,
    maxQualificationTtlMs: 900_000,
    maxExecutableBytes: 8_000_000,
    maxProvenanceBytes: 1_000_000,
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
    now: () => '2026-08-20T02:00:00.000Z',
    ...overrides,
  }
}

function probeExecution(stdout: string, overrides: Partial<C5BExecutableProbeExecution> = {}): C5BExecutableProbeExecution {
  return {
    ok: true,
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputCapped: false,
    stdout,
    stderr: '',
    ...overrides,
  }
}

class FakeProbeExecutor implements C5BExecutableProbeExecutor {
  readonly calls: C5BExecutableProbeRequest[] = []
  readonly queue: C5BExecutableProbeExecution[] = []
  onProbe: ((request: C5BExecutableProbeRequest, index: number) => void) | null = null

  async probe(request: C5BExecutableProbeRequest): Promise<C5BExecutableProbeExecution> {
    this.calls.push(request)
    this.onProbe?.(request, this.calls.length - 1)
    const fallback = request.role === 'pg_dump'
      ? probeExecution('pg_dump (PostgreSQL) 17.11\n')
      : request.role === 'pg_restore'
        ? probeExecution('pg_restore (PostgreSQL) 17.11\n')
        : probeExecution('v1.2.1\n')
    return this.queue.shift() ?? fallback
  }
}

function assertRefused(value: C5BExecutableQualificationResult): void {
  assert.deepEqual(value, { status: 'refused', reasonCode: 'executable_qualification_invalid' })
  assert.equal(JSON.stringify(value).includes(rawSecretControl), false)
}

async function qualify(value: Fixture, overrides: Partial<C5BExecutableQualificationConfig> = {}, executor = new FakeProbeExecutor()) {
  return qualifyC5BExecutableCapabilities(config(value, overrides), executor)
}

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed += 1
    console.log(`  PASS ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  FAIL ${name}`)
    console.error(error)
  }
}

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid = 4242
  killed = false

  kill(): boolean {
    this.killed = true
    return true
  }
}

async function main(): Promise<void> {
  const canonicalTempRoot = fs.realpathSync.native(os.tmpdir())
  const scratch = fs.mkdtempSync(path.join(canonicalTempRoot, 'c5b-executable-qualification-'))

  await test('configuration, paths, file roles, and approved digests fail closed', async () => {
    const base = fixture(path.join(scratch, 'configuration'))
    const attacks: Array<Partial<C5BExecutableQualificationConfig>> = [
      { qualificationTtlMs: 0 },
      { qualificationTtlMs: 1_000_000 },
      { maxExecutableBytes: 1 },
      { maxProvenanceBytes: 1 },
      { timeoutMs: 0 },
      { maxOutputBytes: 0 },
      { now: () => 'not-a-time' },
      { pgDump: { ...config(base).pgDump, executablePath: 'relative-pg-dump' } },
      { pgDump: { ...config(base).pgDump, executableSha256: '0'.repeat(64) } },
      { age: { ...config(base).age, provenanceReceiptSha256: 'f'.repeat(64) } },
      { pgRestore: { ...config(base).pgRestore, executablePath: base.pgDump } },
      { age: { ...config(base).age, provenanceReceiptPath: base.age } },
      { pgDump: { ...config(base).pgDump, expectedVersion: 'latest' } },
      { age: { ...config(base).age, expectedVersion: 'devel' } },
    ]
    for (const attack of attacks) assertRefused(await qualify(base, attack))

    const missingReceiptConfig = config(base)
    fs.rmSync(base.ageReceipt)
    assertRefused(await qualifyC5BExecutableCapabilities(missingReceiptConfig, new FakeProbeExecutor()))

    const aliasRoot = path.join(scratch, 'alias')
    const alias = fixture(aliasRoot)
    const aliasedPath = `${path.dirname(alias.pgDump)}${path.sep}..${path.sep}bin${path.sep}${path.basename(alias.pgDump)}`
    assertRefused(await qualify(alias, { pgDump: { ...config(alias).pgDump, executablePath: aliasedPath } }))

    const emptyExecutable = fixture(path.join(scratch, 'empty-executable'))
    fs.writeFileSync(emptyExecutable.age, '')
    assertRefused(await qualify(emptyExecutable))

    const emptyReceipt = fixture(path.join(scratch, 'empty-receipt'))
    fs.writeFileSync(emptyReceipt.ageReceipt, '')
    assertRefused(await qualify(emptyReceipt))
  })

  await test('qualification binds exact bytes, receipt digests, versions, order, and metadata-only result', async () => {
    const value = fixture(path.join(scratch, 'success'))
    const executor = new FakeProbeExecutor()
    const result = await qualify(value, {}, executor)
    assert.equal(result.status, 'qualified')
    if (result.status !== 'qualified') return
    assert.deepEqual(executor.calls.map((call) => call.role), ['pg_dump', 'pg_restore', 'age'])
    for (const call of executor.calls) {
      assert.deepEqual(call.args, ['--version'])
      assert.equal(call.shell, false)
      assert.equal(call.timeoutMs, 5_000)
      assert.equal(call.maxOutputBytes, 4_096)
      assert.equal(path.dirname(call.executablePath), call.cwd)
    }
    assert.equal(result.receipt.schemaVersion, C5B_EXECUTABLE_QUALIFICATION_SCHEMA_VERSION)
    assert.equal(result.receipt.policyVersion, C5B_EXECUTABLE_QUALIFICATION_POLICY_VERSION)
    assert.equal(result.receipt.qualifiedAt, '2026-08-20T02:00:00.000Z')
    assert.equal(result.receipt.expiresAt, '2026-08-20T02:05:00.000Z')
    assert.deepEqual(result.receipt.tools.map((tool) => [tool.role, tool.version]), [
      ['pg_dump', '17.11'], ['pg_restore', '17.11'], ['age', '1.2.1'],
    ])
    assert.deepEqual(Object.keys(result.receipt).sort(), ['expiresAt', 'policyVersion', 'qualifiedAt', 'schemaVersion', 'tools'])
    assert.equal(JSON.stringify(result).includes(value.root), false)
    assert.equal(Object.isFrozen(result), true)
    assert.equal(Object.isFrozen(result.receipt), true)
    assert.equal(Object.isFrozen(result.receipt.tools), true)
    assert.equal(await isC5BExecutableQualificationCurrent(result.capability, {
      pgDumpExecutable: value.pgDump,
      pgRestoreExecutable: value.pgRestore,
      ageExecutable: value.age,
      observedAt: '2026-08-20T02:01:00.000Z',
    }), true)
  })

  await test('tool labels and exact stable versions reject spoof, mismatch, development, and output injection', async () => {
    const cases: C5BExecutableProbeExecution[][] = [
      [probeExecution('pg_restore (PostgreSQL) 17.11\n')],
      [probeExecution('pg_dump (PostgreSQL) 17.10\n')],
      [probeExecution('pg_dump (PostgreSQL) 17.11\n'), probeExecution('pg_restore (PostgreSQL) 17.10\n')],
      [probeExecution('pg_dump (PostgreSQL) 17.11\n'), probeExecution('pg_restore (PostgreSQL) 17.11\n'), probeExecution('(devel)\n')],
      [probeExecution('pg_dump (PostgreSQL) 17.11\nforged\n')],
      [probeExecution('pg_dump (PostgreSQL) 17.11\u0000forged\n')],
    ]
    for (const [index, queue] of cases.entries()) {
      const value = fixture(path.join(scratch, `version-${index}`))
      const executor = new FakeProbeExecutor()
      executor.queue.push(...queue)
      assertRefused(await qualify(value, {}, executor))
    }
  })

  await test('probe failure states and raw output collapse to one closed refusal', async () => {
    const failures: C5BExecutableProbeExecution[] = [
      probeExecution('', { ok: false, exitCode: 2, stderr: rawSecretControl }),
      probeExecution('', { ok: false, signal: 'SIGKILL', stderr: rawSecretControl }),
      probeExecution('', { ok: false, timedOut: true, stderr: rawSecretControl }),
      probeExecution('', { ok: false, outputCapped: true, stderr: rawSecretControl }),
      probeExecution('', { stderr: rawSecretControl }),
      probeExecution(''),
    ]
    for (const [index, failure] of failures.entries()) {
      const value = fixture(path.join(scratch, `failure-${index}`))
      const executor = new FakeProbeExecutor()
      executor.queue.push(failure)
      assertRefused(await qualify(value, {}, executor))
    }
  })

  await test('replacement during qualification invalidates pre/post byte and provenance bindings', async () => {
    const executableValue = fixture(path.join(scratch, 'replace-executable'))
    const executableProbe = new FakeProbeExecutor()
    executableProbe.onProbe = (request) => {
      if (request.role === 'pg_dump') fs.writeFileSync(executableValue.pgDump, 'replaced-during-probe')
    }
    assertRefused(await qualify(executableValue, {}, executableProbe))

    const receiptValue = fixture(path.join(scratch, 'replace-receipt'))
    const receiptProbe = new FakeProbeExecutor()
    receiptProbe.onProbe = (request) => {
      if (request.role === 'pg_dump') fs.writeFileSync(receiptValue.postgresReceipt, 'replaced-receipt-during-probe')
    }
    assertRefused(await qualify(receiptValue, {}, receiptProbe))
  })

  await test('capability is unforgeable, fresh, configuration-bound, and invalidated by later drift', async () => {
    const value = fixture(path.join(scratch, 'currentness'))
    const result = await qualify(value)
    assert.equal(result.status, 'qualified')
    if (result.status !== 'qualified') return
    const binding = {
      pgDumpExecutable: value.pgDump,
      pgRestoreExecutable: value.pgRestore,
      ageExecutable: value.age,
      observedAt: '2026-08-20T02:01:00.000Z',
    }
    assert.equal(await isC5BExecutableQualificationCurrent({ ...result.capability }, binding), false)
    assert.equal(await isC5BExecutableQualificationCurrent(result.capability, { ...binding, observedAt: '2026-08-20T01:59:59.999Z' }), false)
    assert.equal(await isC5BExecutableQualificationCurrent(result.capability, { ...binding, observedAt: '2026-08-20T02:05:00.000Z' }), false)
    assert.equal(await isC5BExecutableQualificationCurrent(result.capability, { ...binding, ageExecutable: value.pgDump }), false)

    fs.writeFileSync(value.age, 'changed-after-qualification')
    assert.equal(await isC5BExecutableQualificationCurrent(result.capability, binding), false)
  })

  await test('Node probe executor uses absolute fixed argv, sanitized environment, and bounded output', async () => {
    const child = new FakeChild()
    const calls: Array<{ executable: string; args: readonly string[]; options: Record<string, unknown> }> = []
    const spawnFactory: C5BProbeSpawnFactory = (executable, args, options) => {
      calls.push({ executable, args, options })
      queueMicrotask(() => {
        child.stdout.end('pg_dump (PostgreSQL) 17.11\n')
        child.stderr.end()
        child.emit('close', 0, null)
      })
      return child as never
    }
    const executor = createNodeC5BExecutableProbeExecutor({
      spawnFactory,
      environmentSource: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: rawSecretControl,
        PGPASSWORD: rawSecretControl,
        SUPABASE_SERVICE_ROLE_KEY: rawSecretControl,
      },
    })
    const executablePath = process.execPath
    const result = await executor.probe({
      role: 'pg_dump', executablePath, args: ['--version'], cwd: path.dirname(executablePath),
      timeoutMs: 5_000, maxOutputBytes: 4_096, shell: false,
    })
    assert.equal(result.ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].executable, executablePath)
    assert.deepEqual(calls[0].args, ['--version'])
    assert.equal(calls[0].options.shell, false)
    assert.equal(calls[0].options.windowsHide, true)
    const environment = calls[0].options.env as Record<string, string>
    assert.equal(Object.values(environment).includes(rawSecretControl), false)
    assert.equal('PATH' in environment, false)
    assert.equal('PGPASSWORD' in environment, false)
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in environment, false)
    assert.equal(child.stdin.writableEnded, true)
  })

  await test('Node probe executor refuses malformed requests, caps output, and never echoes spawn errors', async () => {
    let spawnCalls = 0
    const executor = createNodeC5BExecutableProbeExecutor({
      spawnFactory: (() => {
        spawnCalls += 1
        throw new Error(rawSecretControl)
      }) as C5BProbeSpawnFactory,
    })
    const malformed = await executor.probe({
      role: 'pg_dump', executablePath: 'relative', args: ['--version'], cwd: scratch,
      timeoutMs: 1, maxOutputBytes: 1, shell: false,
    })
    assert.equal(malformed.ok, false)
    assert.equal(spawnCalls, 0)
    const thrown = await executor.probe({
      role: 'pg_dump', executablePath: process.execPath, args: ['--version'], cwd: path.dirname(process.execPath),
      timeoutMs: 1, maxOutputBytes: 1, shell: false,
    })
    assert.equal(thrown.ok, false)
    assert.equal(JSON.stringify(thrown).includes(rawSecretControl), false)

    const request = {
      role: 'pg_dump' as const,
      executablePath: process.execPath,
      args: ['--version'] as const,
      cwd: path.dirname(process.execPath),
      timeoutMs: 100,
      maxOutputBytes: 8,
      shell: false as const,
    }
    let terminations = 0
    const outputChild = new FakeChild()
    const outputExecutor = createNodeC5BExecutableProbeExecutor({
      spawnFactory: (() => {
        queueMicrotask(() => outputChild.stdout.write('output-over-cap'))
        return outputChild as never
      }) as C5BProbeSpawnFactory,
      terminateTree: () => { terminations += 1 },
    })
    const capped = await outputExecutor.probe(request)
    assert.equal(capped.ok, false)
    assert.equal(capped.outputCapped, true)
    assert.equal(terminations, 1)

    const timeoutChild = new FakeChild()
    const timeoutExecutor = createNodeC5BExecutableProbeExecutor({
      spawnFactory: (() => timeoutChild as never) as C5BProbeSpawnFactory,
      terminateTree: () => { terminations += 1 },
    })
    const timedOut = await timeoutExecutor.probe({ ...request, timeoutMs: 1 })
    assert.equal(timedOut.ok, false)
    assert.equal(timedOut.timedOut, true)
    assert.equal(terminations, 2)

    for (const [index, [exitCode, signal]] of ([[2, null], [null, 'SIGTERM']] as const).entries()) {
      const terminalChild = new FakeChild()
      const terminalExecutor = createNodeC5BExecutableProbeExecutor({
        spawnFactory: (() => {
          queueMicrotask(() => terminalChild.emit('close', exitCode, signal))
          return terminalChild as never
        }) as C5BProbeSpawnFactory,
      })
      const terminalResult = await terminalExecutor.probe(request)
      assert.equal(terminalResult.ok, false, `terminal branch ${index} must refuse`)
      assert.equal(terminalResult.exitCode, exitCode)
      assert.equal(terminalResult.signal, signal)
    }
  })

  await test('source statically preserves the local-only process and privacy boundary', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages', 'core', 'src', 'live-cutover-executable-qualification-node.ts'), 'utf8')
    for (const required of [
      "['--version']", 'shell: false', 'windowsHide: true', 'realpathSync.native', 'isSymbolicLink', "createHash('sha256')",
      'WeakMap', 'executable_qualification_invalid', 'PGPASSWORD', 'SUPABASE_SERVICE_ROLE_KEY',
    ]) assert.ok(source.includes(required), `qualification source missing control: ${required}`)
    const forbidden = [
      /https?:\/\//, /fetch\s*\(/, /axios/, /@supabase/, /child_process\.exec/, /shell:\s*true/,
      /process\.env\.PATH/, /npm\s+(?:install|view)/, /curl\s/, /wget\s/,
    ]
    const controls = ['https://control.invalid', 'fetch(', 'axios', '@supabase', 'child_process.exec', 'shell: true', 'process.env.PATH', 'npm install', 'curl ', 'wget ']
    for (let index = 0; index < forbidden.length; index += 1) {
      assert.match(controls[index], forbidden[index], `static positive control ${index} failed`)
      assert.doesNotMatch(source, forbidden[index], `qualification source contains forbidden surface ${forbidden[index]}`)
    }
  })

  const resolvedScratch = path.resolve(scratch)
  assert.equal(path.dirname(resolvedScratch), canonicalTempRoot)
  fs.rmSync(resolvedScratch, { recursive: true, force: true })

  console.log(`P17-016 C5B executable-capability qualification: ${passed}/${passed + failed} grouped checks passed`)
  if (failed > 0) process.exit(1)
}

void main()
