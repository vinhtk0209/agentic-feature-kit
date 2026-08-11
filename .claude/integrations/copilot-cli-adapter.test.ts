/** Offline attacks for the direct Copilot CLI adapter. No Copilot process or credential is used. */
import * as assert from 'assert';
import { createCopilotCliAdapter } from './copilot-cli-adapter';
import { backendKey, createEvidenceBinding, ProviderRegistry } from './multi-provider-backends';
import { normalizeConfig } from './model-config';
import type { ProcessExecution, ProcessExecutor } from './codex-cli-adapter';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const CONFIG = normalizeConfig({
  version: 2,
  primary: 'copilot-codex',
  models: {
    claude: { id: 'claude-fixture', provider: 'claude' },
    legacy: { id: 'github-copilot', provider: 'copilot' },
    'copilot-codex': { id: 'gpt-5.3-codex', provider: 'copilot' },
    'copilot-gpt': { id: 'gpt-5.4', provider: 'copilot' },
  },
});

const result = (stdout: string, override: Partial<ProcessExecution> = {}): ProcessExecution => ({
  exitCode: 0, signal: null, stdout, stderr: '', timedOut: false, outputCapped: false, ...override,
});
const version = (value = '1.0.79') => result(`GitHub Copilot CLI ${value}.\nRun 'copilot update' to check for updates.\n`);

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

const create = (executor: FakeExecutor, modelKey = 'copilot-codex', expectedCliVersion = '1.0.79') => createCopilotCliAdapter({
  executable: 'copilot', modelConfig: CONFIG, modelKey, adapterVersion: 'copilot-cli-v1',
  expectedCliVersion, timeoutMs: 60_000, maxOutputBytes: 1_000_000, cwd: 'fixture',
}, executor);

async function mustReject(fn: () => unknown | Promise<unknown>, contains: string) {
  let error: unknown;
  try { await fn(); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error, 'expected rejection');
  assert.match(error.message, new RegExp(contains));
}

async function main() {
  await test('unknown, Claude, and legacy selector keys reject before spawning', async () => {
    for (const key of ['missing', 'claude', 'legacy']) {
      const executor = new FakeExecutor([]);
      await mustReject(() => create(executor, key), key === 'missing' ? 'not registered' : key === 'claude' ? 'provider' : 'legacy');
      assert.equal(executor.calls.length, 0);
    }
  });

  await test('strict CLI version probe binds provider, version, and selected model capability', async () => {
    const executor = new FakeExecutor([version()]);
    const adapter = create(executor);
    const probe = await adapter.capabilityProbe();
    assert.deepEqual(executor.calls[0].args, ['--version']);
    assert.equal(probe.provider, 'copilot');
    assert.ok(probe.capabilities.includes('copilot-cli-version:1.0.79'));
    assert.ok(probe.capabilities.includes('model-selection:gpt-5.3-codex'));
  });

  await test('version mismatch and malformed version envelope fail before trust', async () => {
    for (const observed of [version('1.0.78'), result('Copilot 1.0.79\n'), result('GitHub Copilot CLI 1.0.79. extra\n')]) {
      const executor = new FakeExecutor([observed]);
      await mustReject(() => create(executor).capabilityProbe(), 'capability probe');
      assert.equal(executor.calls.length, 1);
    }
  });

  await test('prompt and model remain inert single argv values with shell/write and built-in MCP denied', async () => {
    const executor = new FakeExecutor([result('I2_PROVIDER_LIVE_OK\n')]);
    const adapter = create(executor);
    const prompt = 'line one\n$(Write-Output injected); `whoami`';
    const execution = await adapter.executePhase(prompt);
    assert.equal(execution.output.trim(), 'I2_PROVIDER_LIVE_OK');
    assert.deepEqual(executor.calls[0].args, [
      '-p', prompt, '-s', '--model', 'gpt-5.3-codex', '--no-ask-user', '--allow-all-tools',
      '--deny-tool=shell,write', '--disable-builtin-mcps',
    ]);
    assert.equal(executor.calls[0].stdin, '');
    assert.equal(executor.calls[0].shell, false);
    assert.equal(execution.cost?.status, 'unknown');
  });

  await test('auth/nonzero, timeout, cap, stderr, blank output, and oversized prompt fail closed', async () => {
    const cases: Array<[ProcessExecution, string]> = [
      [result('', { exitCode: 1, stderr: 'No authentication information found.' }), 'nonzero'],
      [result('', { timedOut: true }), 'timed out'],
      [result('', { outputCapped: true }), 'output cap'],
      [result('ok', { stderr: 'unexpected warning' }), 'stderr'],
      [result('   \n'), 'empty'],
    ];
    for (const [processResult, message] of cases) {
      const executor = new FakeExecutor([processResult]);
      await mustReject(() => create(executor).executePhase('prompt'), message);
    }
    const executor = new FakeExecutor([]);
    await mustReject(() => create(executor).executePhase('x'.repeat(32_769)), '32 KiB');
    assert.equal(executor.calls.length, 0);
  });

  await test('two Copilot models get independent trust keys and the exact same gate object', async () => {
    const aExec = new FakeExecutor([version(), result('OK')]);
    const bExec = new FakeExecutor([version(), result('wrong')]);
    const a = create(aExec, 'copilot-codex');
    const b = create(bExec, 'copilot-gpt');
    const registry = new ProviderRegistry([a, b]);
    const aKey = backendKey(a.identity), bKey = backendKey(b.identity);
    assert.notEqual(aKey, bKey);
    const trustedA = await registry.trust(aKey);
    await registry.trust(bKey);
    const gate = async (output: string) => ({ passed: output === 'OK', detail: 'exact OK' });
    const aResult = await registry.execute(aKey, 'prompt', gate);
    const bResult = await registry.execute(bKey, 'prompt', gate);
    assert.equal(aResult.gate.passed, true);
    assert.equal(bResult.gate.passed, false);
    const binding = createEvidenceBinding({ trusted: trustedA, cost: aResult.cost! });
    assert.equal(binding.identity.modelId, 'gpt-5.3-codex');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
