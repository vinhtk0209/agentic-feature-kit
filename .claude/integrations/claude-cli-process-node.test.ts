/** P17-007 A3B1 offline process attacks. No Claude process, model, credential, or network is used. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { ClaudeProcessRequest } from './claude-cli-adapter';
import {
  ClaudeNodeProcessPortError,
  createClaudeNodeProcessPort,
  type ClaudeNodeProcessPortOptions,
  type ClaudeNodeSpawnFactory,
  type ClaudeNodeTimerHandle,
} from './claude-cli-process-node';

let passed = 0;
let failed = 0;
let realProviderCalls = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdinBytes: Buffer[] = [];
  pid = 4242;
  killCalls = 0;
  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => this.stdinBytes.push(Buffer.from(chunk)));
  }
  kill(): boolean { this.killCalls += 1; return true; }
  unref(): void {}
  input(): string { return Buffer.concat(this.stdinBytes).toString('utf8'); }
  close(exitCode: number | null = 0, signal: string | null = null): void { this.emit('close', exitCode, signal); }
  asProcess(): ChildProcessWithoutNullStreams { return this as unknown as ChildProcessWithoutNullStreams; }
}

const isolatedRoot = path.join(os.tmpdir(), 'p17-007-a3b1-fixture');
const executablePath = path.join(isolatedRoot, 'bin', 'claude.exe');
const baseRequest: ClaudeProcessRequest = {
  executable: executablePath,
  args: ['--version'],
  stdin: '',
  cwd: isolatedRoot,
  timeoutMs: 1_000,
  maxOutputBytes: 1_024,
  shell: false,
};

function setup(overrides: Partial<ClaudeNodeProcessPortOptions> = {}) {
  const children: FakeChild[] = [];
  const calls: Array<{ executable: string; args: readonly string[]; options: Parameters<ClaudeNodeSpawnFactory>[2] }> = [];
  const spawnFactory: ClaudeNodeSpawnFactory = (executable, args, options) => {
    const child = new FakeChild();
    children.push(child);
    calls.push({ executable, args: [...args], options });
    return child.asProcess();
  };
  const terminations: Array<{ child: ChildProcessWithoutNullStreams; platform: NodeJS.Platform }> = [];
  const port = createClaudeNodeProcessPort({
    isolatedRoot,
    environment: { PATH: 'fixture-bin', SYSTEMROOT: 'fixture-system' },
    terminationGraceMs: 25,
    platform: 'win32',
    spawnFactory,
    terminateTree: (child, platform) => { terminations.push({ child, platform }); },
    ...overrides,
  });
  return { port, children, calls, terminations };
}

async function reject(fn: () => unknown | Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught instanceof ClaudeNodeProcessPortError, 'expected ClaudeNodeProcessPortError');
  assert.match(caught.message, pattern);
}

async function run() {
  await test('direct spawn is shell-free, root-bound, explicit-env only, and stdin is byte-identical', async () => {
    const environment = { PATH: 'fixture-bin', SYSTEMROOT: 'fixture-system' };
    const state = setup({ environment });
    const pending = state.port.execute({ ...baseRequest, args: ['-p', 'fixed query'], stdin: 'line one\n--hostile-option' });
    assert.equal(state.calls.length, 1);
    const call = state.calls[0];
    assert.equal(call.executable, path.resolve(executablePath));
    assert.deepEqual(call.args, ['-p', 'fixed query']);
    assert.deepEqual({ ...call.options.env }, environment);
    assert.equal(call.options.env === process.env, false);
    assert.equal(call.options.cwd, path.resolve(isolatedRoot));
    assert.equal(call.options.shell, false);
    assert.equal(call.options.detached, false);
    assert.deepEqual(call.options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.equal(call.options.windowsHide, true);
    assert.equal(state.children[0].input(), 'line one\n--hostile-option');
    state.children[0].stdout.write('2.1.227 (Claude Code)\n');
    state.children[0].close();
    const result = await pending;
    assert.equal(result.stdout, '2.1.227 (Claude Code)\n');
    assert.equal(result.exitCode, 0);
  });

  await test('environment is copied, frozen, ordinal, and ambient variables are not inherited', async () => {
    const environment = { ZED: 'last', ALPHA: 'first' };
    const state = setup({ environment, platform: 'linux' });
    environment.ALPHA = 'mutated';
    const pending = state.port.execute(baseRequest);
    assert.deepEqual(Object.keys(state.calls[0].options.env), ['ALPHA', 'ZED']);
    assert.equal(state.calls[0].options.env.ALPHA, 'first');
    assert.equal(state.calls[0].options.env.USERPROFILE, undefined);
    assert.equal(Object.isFrozen(state.calls[0].options.env), true);
    assert.equal(state.calls[0].options.detached, true);
    state.children[0].close();
    await pending;
  });

  await test('environment validation rejects accessors, polluted prototypes, symbols, bad names, NUL, aliases, and ceilings', async () => {
    const accessor: Record<string, string> = {};
    Object.defineProperty(accessor, 'PATH', { enumerable: true, get: () => 'secret' });
    for (const environment of [
      accessor,
      Object.assign(Object.create({ inherited: 'blocked' }), { PATH: 'x' }),
      Object.assign({ PATH: 'x' }, { [Symbol('hidden')]: 'x' }),
      { 'BAD-NAME': 'x' },
      { PATH: 'x\u0000y' },
      { Path: 'one', PATH: 'two' },
      Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`K${index}`, 'x'])),
      { PATH: 'x'.repeat(8_193) },
    ]) {
      assert.throws(() => createClaudeNodeProcessPort({ isolatedRoot, environment, platform: 'win32' }), ClaudeNodeProcessPortError);
    }
  });

  await test('constructor and request validation fail before spawn for root, argv, stdin, shell, and limit drift', async () => {
    assert.throws(() => createClaudeNodeProcessPort({ isolatedRoot: 'relative', environment: {} }), /isolatedRoot must be absolute/);
    assert.throws(() => createClaudeNodeProcessPort({ isolatedRoot: path.parse(isolatedRoot).root, environment: {} }), /filesystem root/);
    assert.throws(() => createClaudeNodeProcessPort({ isolatedRoot, environment: {}, platform: 'unknown' as NodeJS.Platform }), /platform is unsupported/);
    const state = setup();
    const attacks: ClaudeProcessRequest[] = [
      { ...baseRequest, cwd: path.join(isolatedRoot, 'nested') },
      { ...baseRequest, executable: 'claude.exe' },
      { ...baseRequest, executable: '--bad\nvalue' },
      { ...baseRequest, args: ['ok', 'bad\narg'] },
      { ...baseRequest, stdin: 'bad\u0000input' },
      { ...baseRequest, shell: true as false },
      { ...baseRequest, timeoutMs: 0 },
      { ...baseRequest, timeoutMs: 1_200_001 },
      { ...baseRequest, maxOutputBytes: 16_777_217 },
    ];
    for (const request of attacks) await assert.rejects(() => state.port.execute(request), ClaudeNodeProcessPortError);
    assert.equal(state.calls.length, 0);
  });

  await test('raw-byte accounting preserves split UTF-8 at the exact cap and terminates on overflow', async () => {
    const exact = setup();
    const exactPending = exact.port.execute({ ...baseRequest, maxOutputBytes: 3 });
    const euro = Buffer.from('€');
    exact.children[0].stdout.write(euro.subarray(0, 1));
    exact.children[0].stdout.write(euro.subarray(1));
    exact.children[0].close();
    assert.equal((await exactPending).stdout, '€');

    const overflow = setup();
    const overflowPending = overflow.port.execute({ ...baseRequest, maxOutputBytes: 3 });
    overflow.children[0].stdout.write(Buffer.from('abc'));
    overflow.children[0].stderr.write(Buffer.from('d'));
    assert.equal(overflow.terminations.length, 1);
    overflow.children[0].close(null, 'SIGKILL');
    const result = await overflowPending;
    assert.equal(result.outputCapped, true);
    assert.equal(result.signal, 'SIGKILL');
  });

  await test('timeout delegates one process-tree termination and records the observed close', async () => {
    const state = setup({ terminationGraceMs: 50 });
    const pending = state.port.execute({ ...baseRequest, timeoutMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(state.terminations.length, 1);
    assert.equal(state.terminations[0].platform, 'win32');
    state.children[0].close(null, 'SIGKILL');
    const result = await pending;
    assert.equal(result.timedOut, true);
    assert.equal(result.signal, 'SIGKILL');
  });

  await test('termination grace settles a hostile child that never closes', async () => {
    const state = setup({ terminationGraceMs: 1 });
    const result = await state.port.execute({ ...baseRequest, timeoutMs: 1 });
    assert.deepEqual(result, {
      exitCode: null, signal: null, stdout: '', stderr: 'CLAUDE_PROCESS_TERMINATION_GRACE_EXPIRED',
      timedOut: true, outputCapped: false,
    });
    assert.equal(state.terminations.length, 1);
  });

  await test('spawn, child, stdin, and terminator failures stay opaque', async () => {
    const secret = 'PRIVATE-PATH-AND-TOKEN';
    const spawnPort = createClaudeNodeProcessPort({
      isolatedRoot, environment: {}, spawnFactory: (() => { throw new Error(secret); }) as ClaudeNodeSpawnFactory,
    });
    assert.equal((await spawnPort.execute(baseRequest)).stderr, 'CLAUDE_PROCESS_SPAWN_FAILED');

    const malformedPort = createClaudeNodeProcessPort({
      isolatedRoot,
      environment: {},
      spawnFactory: (() => Object.defineProperty({}, 'stdout', { get: () => { throw new Error(secret); } })) as unknown as ClaudeNodeSpawnFactory,
    });
    const malformed = await malformedPort.execute(baseRequest);
    assert.equal(malformed.stderr, 'CLAUDE_PROCESS_BOUNDARY_INVALID');
    assert.equal(JSON.stringify(malformed).includes(secret), false);

    const childState = setup({ terminationGraceMs: 1 });
    const childPending = childState.port.execute(baseRequest);
    childState.children[0].emit('error', new Error(secret));
    childState.children[0].close();
    assert.equal((await childPending).stderr, 'CLAUDE_PROCESS_CHILD_ERROR');

    const stdinState = setup({ terminationGraceMs: 1 });
    const stdinPending = stdinState.port.execute(baseRequest);
    stdinState.children[0].stdin.emit('error', new Error(secret));
    stdinState.children[0].close();
    assert.equal((await stdinPending).stderr, 'CLAUDE_PROCESS_STDIN_FAILED');

    const terminateState = setup({
      terminationGraceMs: 1,
      terminateTree: () => { throw new Error(secret); },
    });
    const terminateResult = await terminateState.port.execute({ ...baseRequest, timeoutMs: 1 });
    assert.equal(terminateResult.stderr, 'CLAUDE_PROCESS_TERMINATION_FAILED');
    assert.equal(terminateState.children[0].killCalls, 1);
    for (const result of [terminateResult]) assert.equal(JSON.stringify(result).includes(secret), false);
  });

  await test('nonzero and signal receipts remain exact without retry', async () => {
    const state = setup();
    const pending = state.port.execute(baseRequest);
    state.children[0].stderr.write('provider failure');
    state.children[0].close(7, null);
    assert.deepEqual(await pending, {
      exitCode: 7, signal: null, stdout: '', stderr: 'provider failure', timedOut: false, outputCapped: false,
    });
    assert.equal(state.calls.length, 1);
  });

  await test('first close wins and late data, errors, and duplicate close cannot alter the receipt', async () => {
    const state = setup();
    const pending = state.port.execute(baseRequest);
    state.children[0].stdout.write('first');
    state.children[0].close(0, null);
    const result = await pending;
    state.children[0].on('error', () => {});
    state.children[0].stdout.write('late');
    state.children[0].emit('error', new Error('late-secret'));
    state.children[0].close(9, 'SIGKILL');
    assert.deepEqual(result, {
      exitCode: 0, signal: null, stdout: 'first', stderr: '', timedOut: false, outputCapped: false,
    });
  });

  await test('a synchronously closing terminator cannot arm a post-settlement grace timer', async () => {
    let timerSets = 0;
    let timerClears = 0;
    const timer = {
      set(callback: () => void, delayMs: number) { timerSets += 1; return setTimeout(callback, delayMs); },
      clear(handle: ClaudeNodeTimerHandle) { timerClears += 1; clearTimeout(handle); },
    };
    const state = setup({
      timer,
      terminateTree: (child) => { (child as unknown as FakeChild).close(null, 'SIGKILL'); },
    });
    const pending = state.port.execute({ ...baseRequest, maxOutputBytes: 1 });
    state.children[0].stdout.write('overflow');
    const result = await pending;
    assert.equal(result.outputCapped, true);
    assert.equal(result.signal, 'SIGKILL');
    assert.equal(timerSets, 1, 'only the execution timeout may be armed');
    assert.equal(timerClears, 1, 'the execution timeout must be cleared on synchronous close');
  });

  await test('1,000 fake executions stay bounded and make zero real provider/model calls', async () => {
    const started = performance.now();
    const rssBefore = process.memoryUsage().rss;
    let fakeSpawns = 0;
    const port = createClaudeNodeProcessPort({
      isolatedRoot,
      environment: {},
      platform: 'linux',
      spawnFactory: (() => {
        fakeSpawns += 1;
        const child = new FakeChild();
        queueMicrotask(() => child.close());
        return child.asProcess();
      }) as ClaudeNodeSpawnFactory,
      terminateTree: () => { throw new Error('must not terminate'); },
    });
    for (let index = 0; index < 1_000; index += 1) await port.execute(baseRequest);
    const elapsedMs = performance.now() - started;
    const rssDelta = Math.max(0, process.memoryUsage().rss - rssBefore);
    assert.equal(fakeSpawns, 1_000);
    assert.equal(realProviderCalls, 0);
    assert.ok(elapsedMs < 5_000, `fake execution sentinel exceeded 5s: ${elapsedMs.toFixed(3)}ms`);
    assert.ok(rssDelta < 32 * 1024 * 1024, `fake execution RSS exceeded 32 MiB: ${rssDelta}`);
    console.log(`   1,000 fake executions: ${elapsedMs.toFixed(3)} ms, RSS delta ${rssDelta} bytes, real provider/model calls ${realProviderCalls}`);
  });

  console.log(`\nclaude-cli-process-node.test: ${passed} passed, ${failed} failed; real provider/model calls ${realProviderCalls}`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
