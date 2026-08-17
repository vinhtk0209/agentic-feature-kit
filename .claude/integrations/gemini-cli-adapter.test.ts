/** Offline attacks for the direct Gemini CLI adapter. No Gemini process or credential is used. */
import * as assert from 'assert';
import * as path from 'path';
import { createGeminiCliAdapter } from './gemini-cli-adapter';
import { backendKey, ProviderRegistry } from './multi-provider-backends';
import { normalizeConfig } from './model-config';
import type { ProcessExecution, ProcessExecutor } from './codex-cli-adapter';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const CONFIG = normalizeConfig({
  primary: 'gemini-pro',
  models: {
    codex: { id: 'gpt-5.6-sol', provider: 'codex' },
    'gemini-pro': { id: 'gemini-2.5-pro', provider: 'gemini' },
    'gemini-flash': { id: 'gemini-2.5-flash', provider: 'gemini' },
  },
});

const result = (stdout: string, override: Partial<ProcessExecution> = {}): ProcessExecution => ({
  exitCode: 0, signal: null, stdout, stderr: '', timedOut: false, outputCapped: false, ...override,
});
const response = (output = 'I2_PROVIDER_LIVE_OK') => result(JSON.stringify({ response: output, stats: { models: {} } }));
const FIXTURE_ROOT = path.parse(path.resolve('.')).root;
const GEMINI_ENTRYPOINT = path.join(FIXTURE_ROOT, 'gemini', 'bundle', 'gemini.js');

class FakeExecutor implements ProcessExecutor {
  calls: Array<{ executable: string; args: readonly string[]; stdin: string; shell: false }> = [];
  constructor(private readonly results: ProcessExecution[]) {}
  async execute(input: Parameters<ProcessExecutor['execute']>[0]): Promise<ProcessExecution> {
    this.calls.push(input);
    const next = this.results.shift();
    if (!next) throw new Error('unexpected process call');
    return next;
  }
}

const create = (executor: FakeExecutor, modelKey = 'gemini-pro', entrypoint = GEMINI_ENTRYPOINT) => createGeminiCliAdapter({
  executable: process.execPath, entrypoint, modelConfig: CONFIG, modelKey,
  adapterVersion: 'gemini-cli-v1', expectedCliVersion: '0.54.4', timeoutMs: 60_000,
  maxOutputBytes: 1_000_000, cwd: 'fixture',
}, executor);

async function mustReject(fn: () => unknown | Promise<unknown>, contains: string) {
  let error: unknown;
  try { await fn(); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error, 'expected rejection');
  assert.match(error.message, new RegExp(contains));
}

async function main() {
  await test('unknown and non-Gemini model keys reject before spawn', async () => {
    for (const key of ['missing', 'codex']) {
      const executor = new FakeExecutor([]);
      await mustReject(() => create(executor, key), key === 'missing' ? 'not registered' : 'provider');
      assert.equal(executor.calls.length, 0);
    }
  });

  await test('entrypoint must be an absolute JavaScript path', async () => {
    assert.equal(path.isAbsolute(GEMINI_ENTRYPOINT), true);
    for (const entrypoint of [
      'gemini.js',
      path.join(FIXTURE_ROOT, 'gemini', 'gemini.cmd'),
      `${path.join(FIXTURE_ROOT, 'gemini', 'bad')}\0.js`,
    ]) {
      const executor = new FakeExecutor([]);
      await mustReject(() => create(executor, 'gemini-pro', entrypoint), 'entrypoint');
      assert.equal(executor.calls.length, 0);
    }
  });

  await test('Gemini rejects unsupported reasoning effort before spawn and binds default into trust', async () => {
    const rejected = new FakeExecutor([]);
    assert.throws(() => createGeminiCliAdapter({
      executable: process.execPath, entrypoint: GEMINI_ENTRYPOINT, modelConfig: CONFIG, modelKey: 'gemini-pro',
      adapterVersion: 'gemini-cli-v1', expectedCliVersion: '0.54.4', timeoutMs: 60_000,
      maxOutputBytes: 1_000_000, reasoningEffort: 'high',
    }, rejected), /not supported/);
    assert.equal(rejected.calls.length, 0);
    const executor = new FakeExecutor([result('0.54.4\n')]);
    const probe = await create(executor).capabilityProbe();
    assert.ok(probe.capabilities.includes('reasoning-effort:default'));
  });

  await test('strict CLI version probe binds provider, version, model, and headless JSON', async () => {
    const executor = new FakeExecutor([result('0.54.4\n')]);
    const probe = await create(executor).capabilityProbe();
    assert.deepEqual(executor.calls[0].args, [GEMINI_ENTRYPOINT, '--version']);
    assert.equal(probe.provider, 'gemini');
    assert.ok(probe.capabilities.includes('gemini-cli-version:0.54.4'));
    assert.ok(probe.capabilities.includes('model-selection:gemini-2.5-pro'));
    assert.ok(probe.capabilities.includes('headless-json'));
  });

  await test('version mismatch, malformed version, and stderr fail before trust', async () => {
    for (const observed of [result('0.54.3\n'), result('Gemini CLI 0.54.4\n'), result('0.54.4\n', { stderr: 'warning' })]) {
      const executor = new FakeExecutor([observed]);
      await mustReject(() => create(executor).capabilityProbe(), 'capability probe');
      assert.equal(executor.calls.length, 1);
    }
  });

  await test('prompt and model remain inert argv values under plan mode with shell false', async () => {
    const executor = new FakeExecutor([response()]);
    const adapter = create(executor);
    const prompt = 'line one\n$(Write-Output injected); `whoami`';
    const execution = await adapter.executePhase(prompt);
    assert.equal(execution.output, 'I2_PROVIDER_LIVE_OK');
    assert.deepEqual(executor.calls[0].args, [
      GEMINI_ENTRYPOINT, '-p', prompt, '--output-format', 'json', '--model',
      'gemini-2.5-pro', '--approval-mode', 'plan', '--skip-trust',
    ]);
    assert.equal(executor.calls[0].stdin, '');
    assert.equal(executor.calls[0].shell, false);
    assert.equal(execution.cost?.status, 'unknown');
  });

  await test('auth/nonzero, timeout, cap, stderr, malformed/error/blank response fail closed', async () => {
    const cases: Array<[ProcessExecution, string]> = [
      [result('', { exitCode: 41 }), 'nonzero'],
      [result('', { timedOut: true }), 'timed out'],
      [result('', { outputCapped: true }), 'output cap'],
      [result('{}', { stderr: 'warning' }), 'stderr'],
      [result('not-json'), 'malformed JSON'],
      [result(JSON.stringify({ response: 'ok', stats: {}, error: { code: 41 } })), 'error envelope'],
      [result(JSON.stringify({ response: '  ', stats: {} })), 'blank'],
      [result(JSON.stringify({ response: 'ok' })), 'stats'],
    ];
    for (const [processResult, message] of cases) {
      const executor = new FakeExecutor([processResult]);
      await mustReject(() => create(executor).executePhase('prompt'), message);
    }
  });

  await test('two Gemini models get independent trust keys and the exact same gate object', async () => {
    const pro = create(new FakeExecutor([result('0.54.4\n'), response('OK')]), 'gemini-pro');
    const flash = create(new FakeExecutor([result('0.54.4\n'), response('wrong')]), 'gemini-flash');
    const registry = new ProviderRegistry([pro, flash]);
    const proKey = backendKey(pro.identity), flashKey = backendKey(flash.identity);
    assert.notEqual(proKey, flashKey);
    await registry.trust(proKey);
    await registry.trust(flashKey);
    const gate = async (output: string) => ({ passed: output === 'OK', detail: 'exact OK' });
    assert.equal((await registry.execute(proKey, 'prompt', gate)).gate.passed, true);
    assert.equal((await registry.execute(flashKey, 'prompt', gate)).gate.passed, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
