/** P17-007 A3A offline attacks. No Claude process, credential, session, or network is used. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createClaudeCliAdapter,
  type ClaudeCliAdapterConfig,
  type ClaudeProcessExecution,
  type ClaudeProcessPort,
  type ClaudeProcessRequest,
} from './claude-cli-adapter';
import { backendKey, createEvidenceBinding, ProviderRegistry } from './multi-provider-backends';
import { normalizeConfig } from './model-config';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const CONFIG = normalizeConfig({
  version: 2,
  primary: 'claude-opus',
  models: {
    'claude-opus': { id: 'claude-opus-4-8', provider: 'claude', reasoningEfforts: ['default', 'high'] },
    'claude-sonnet': { id: 'claude-sonnet-4-6', provider: 'claude', reasoningEfforts: ['default', 'xhigh'] },
    'claude-legacy-effort': { id: 'claude-test', provider: 'claude', reasoningEfforts: ['default', 'none'] },
    'claude-unsafe-model': { id: '--fallback-model', provider: 'claude', reasoningEfforts: ['default'] },
    codex: { id: 'gpt-5.6-sol', provider: 'codex', reasoningEfforts: ['default'] },
  },
});

function processResult(stdout: string, override: Partial<ClaudeProcessExecution> = {}): ClaudeProcessExecution {
  return { exitCode: 0, signal: null, stdout, stderr: '', timedOut: false, outputCapped: false, ...override };
}

function version(value = '2.1.227', suffix = true): ClaudeProcessExecution {
  return processResult(`${value}${suffix ? ' (Claude Code)' : ''}\n`);
}

function success(output = 'A3A_OK', override: Record<string, unknown> = {}): ClaudeProcessExecution {
  return processResult(JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: output,
    num_turns: 3,
    stop_reason: 'end_turn',
    total_cost_usd: 0.0123,
    permission_denials: [],
    session_id: 'opaque-session-must-not-escape',
    uuid: 'opaque-uuid-must-not-escape',
    ...override,
  }));
}

class FakePort implements ClaudeProcessPort {
  readonly calls: ClaudeProcessRequest[] = [];
  constructor(private readonly results: ClaudeProcessExecution[]) {}
  async execute(input: ClaudeProcessRequest): Promise<ClaudeProcessExecution> {
    this.calls.push({ ...input, args: [...input.args] });
    const next = this.results.shift();
    if (!next) throw new Error('unexpected fake process call');
    return next;
  }
}

function config(overrides: Partial<ClaudeCliAdapterConfig> = {}): ClaudeCliAdapterConfig {
  return {
    executable: 'claude',
    modelConfig: CONFIG,
    modelKey: 'claude-opus',
    adapterVersion: 'claude-cli-a3a-v1',
    expectedCliVersion: '2.1.227',
    cwd: 'isolated-fixture',
    timeoutMs: 1_200_000,
    maxOutputBytes: 1_000_000,
    maxTurns: 8,
    maxBudgetUsdCents: 125,
    ...overrides,
  };
}

async function mustReject(fn: () => unknown | Promise<unknown>, contains: string, forbidden = '') {
  let error: unknown;
  try { await fn(); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error, 'expected rejection');
  assert.match(error.message, new RegExp(contains));
  if (forbidden) assert.equal(error.message.includes(forbidden), false, 'error leaked forbidden provider data');
}

async function main() {
  await test('unknown and cross-provider model identities fail before the process port', async () => {
    for (const modelKey of ['missing', 'codex', 'claude-unsafe-model']) {
      const port = new FakePort([]);
      await mustReject(
        () => createClaudeCliAdapter(config({ modelKey }), port),
        modelKey === 'missing' ? 'not registered' : modelKey === 'codex' ? 'provider' : 'argv-safe',
      );
      assert.equal(port.calls.length, 0);
    }
  });

  await test('invalid config, unsupported effort, and invalid port fail before execution', async () => {
    const cases: Partial<ClaudeCliAdapterConfig>[] = [
      { expectedCliVersion: '2.1' }, { expectedCliVersion: '2.1.227\n' }, { timeoutMs: 0 },
      { maxOutputBytes: 0 }, { maxTurns: 33 }, { maxBudgetUsdCents: 10_001 },
      { cwd: '' }, { modelKey: 'claude-legacy-effort', reasoningEffort: 'none' },
      { reasoningEffort: 'secret-effort' as ClaudeCliAdapterConfig['reasoningEffort'] },
    ];
    for (const candidate of cases) {
      const port = new FakePort([]);
      assert.throws(() => createClaudeCliAdapter(config(candidate), port));
      assert.equal(port.calls.length, 0);
    }
    assert.throws(() => createClaudeCliAdapter(config(), {} as ClaudeProcessPort), /process port/);
  });

  await test('strict version probe binds Claude, CLI, model, effort, tools, session, and cost source', async () => {
    for (const suffix of [true, false]) {
      const port = new FakePort([version('2.1.227', suffix)]);
      const probe = await createClaudeCliAdapter(config(), port).capabilityProbe();
      assert.deepEqual(port.calls[0], {
        executable: 'claude', args: ['--version'], stdin: '', cwd: 'isolated-fixture',
        timeoutMs: 1_200_000, maxOutputBytes: 1_000_000, shell: false,
      });
      assert.equal(probe.provider, 'claude');
      for (const capability of [
        'claude-cli-version:2.1.227', 'model-selection:claude-opus-4-8',
        'reasoning-effort:default', 'tool-profile:fixture-edit-v1',
        'session-persistence:disabled', 'cost-source:client-estimate-untrusted',
      ]) assert.ok(probe.capabilities.includes(capability), `missing ${capability}`);
    }
  });

  await test('version mismatch, extra text, process failure, timeout, cap, and stderr fail closed', async () => {
    const cases: Array<[ClaudeProcessExecution, string]> = [
      [version('2.1.226'), 'does not match'],
      [processResult('Claude Code 2.1.227\n'), 'strict Claude'],
      [processResult('2.1.227 (Claude Code)\nextra\n'), 'strict Claude'],
      [processResult('', { exitCode: 1 }), 'nonzero'],
      [processResult('', { timedOut: true }), 'timed out'],
      [processResult('', { outputCapped: true }), 'output cap'],
      [processResult('', { stderr: 'provider-secret-value' }), 'stderr'],
    ];
    for (const [result, message] of cases) {
      const port = new FakePort([result]);
      await mustReject(() => createClaudeCliAdapter(config(), port).capabilityProbe(), message, 'provider-secret-value');
      assert.equal(port.calls.length, 1);
    }
  });

  await test('prompt injection remains exact stdin data under the fixed deny-default argv profile', async () => {
    const prompt = '--model attacker\n$(touch owned); `whoami` & calc.exe';
    const port = new FakePort([success('NORMALIZED_OUTPUT')]);
    const execution = await createClaudeCliAdapter(config(), port).executePhase(prompt);
    assert.equal(execution.output, 'NORMALIZED_OUTPUT');
    assert.equal(execution.cost?.status, 'unknown');
    assert.deepEqual(port.calls[0], {
      executable: 'claude',
      args: [
        '-p', 'Apply the exact task specification provided on standard input.',
        '--output-format', 'json', '--model', 'claude-opus-4-8',
        '--max-turns', '8', '--max-budget-usd', '1.25', '--safe-mode',
        '--permission-mode', 'dontAsk', '--tools', 'Read,Edit,Write',
        '--allowed-tools', 'Read,Edit,Write', '--disallowed-tools', 'mcp__*',
        '--no-chrome', '--no-session-persistence',
      ],
      stdin: prompt, cwd: 'isolated-fixture', timeoutMs: 1_200_000,
      maxOutputBytes: 1_000_000, shell: false,
    });
  });

  await test('non-default effort is one inert argv value and changes capability trust', async () => {
    const defaultPort = new FakePort([version()]);
    const highPort = new FakePort([version(), success()]);
    const defaultAdapter = createClaudeCliAdapter(config(), defaultPort);
    const highAdapter = createClaudeCliAdapter(config({ reasoningEffort: 'high' }), highPort);
    const defaultRegistry = new ProviderRegistry([defaultAdapter]);
    const highRegistry = new ProviderRegistry([highAdapter]);
    const defaultTrusted = await defaultRegistry.trust(backendKey(defaultAdapter.identity));
    const highTrusted = await highRegistry.trust(backendKey(highAdapter.identity));
    assert.notEqual(defaultTrusted.capabilityHash, highTrusted.capabilityHash);
    assert.ok(highTrusted.capabilities.includes('reasoning-effort:high'));
    await highAdapter.executePhase('prompt');
    assert.deepEqual(highPort.calls[1].args.slice(-2), ['--effort', 'high']);
  });

  await test('blank, NUL, and oversized prompts fail without a process call', async () => {
    for (const prompt of ['', '   ', 'bad\u0000prompt', 'x'.repeat(32_769)]) {
      const port = new FakePort([]);
      await mustReject(() => createClaudeCliAdapter(config(), port).executePhase(prompt), 'prompt');
      assert.equal(port.calls.length, 0);
    }
  });

  await test('execution process failures and bounded-output violations fail before normalization', async () => {
    const cases: Array<[ClaudeProcessExecution, string]> = [
      [processResult('', { exitCode: 1 }), 'nonzero'],
      [processResult('', { signal: 'SIGTERM' }), 'nonzero'],
      [processResult('', { timedOut: true }), 'timed out'],
      [processResult('', { outputCapped: true }), 'output cap'],
      [processResult('ok', { stderr: 'secret-diagnostic' }), 'stderr'],
      [processResult('x'.repeat(1_000_001)), 'output cap'],
    ];
    for (const [result, message] of cases) {
      const port = new FakePort([result]);
      await mustReject(() => createClaudeCliAdapter(config(), port).executePhase('prompt'), message, 'secret-diagnostic');
    }
  });

  await test('malformed process receipts fail without exposing attacker-controlled fields', async () => {
    const secret = 'process-secret-value';
    const cases = [
      { ...processResult('{}'), timedOut: 'false', stderr: secret },
      { ...processResult('{}'), outputCapped: 0, stderr: secret },
      { ...processResult('{}'), exitCode: 0.5, stderr: secret },
      { ...processResult('{}'), signal: 123, stderr: secret },
      { ...processResult('{}'), stdout: 123, stderr: secret },
    ];
    for (const candidate of cases) {
      const port = new FakePort([candidate as unknown as ClaudeProcessExecution]);
      await mustReject(() => createClaudeCliAdapter(config(), port).executePhase('prompt'), 'malformed process result', secret);
    }
  });

  await test('malformed, error, contradictory, blank, excess-turn, refusal, cost, and denial envelopes fail closed', async () => {
    const secret = 'provider-secret-must-not-leak';
    const cases: Array<[ClaudeProcessExecution, string]> = [
      [processResult(`not-json-${secret}`), 'malformed JSON'],
      [processResult('[]'), 'non-object'],
      [success('x', { subtype: 'error_during_execution', errors: [secret] }), 'non-success'],
      [success('x', { is_error: true }), 'non-success'],
      [success('   '), 'blank result'],
      [success('x', { num_turns: 9 }), 'turn count'],
      [success('x', { stop_reason: 'refusal' }), 'refusal'],
      [success('x', { total_cost_usd: -1 }), 'cost'],
      [success('x', { permission_denials: [{ tool_name: 'Write', tool_input: { path: secret } }] }), 'permission denials'],
      [success('x', { permission_denials: null }), 'permission denials'],
    ];
    for (const [result, message] of cases) {
      const port = new FakePort([result]);
      await mustReject(() => createClaudeCliAdapter(config(), port).executePhase('prompt'), message, secret);
    }
  });

  await test('session, UUID, diagnostics, and client price metadata never cross the adapter result', async () => {
    const secret = 'provider-private-session-token';
    const port = new FakePort([success('PUBLIC_RESULT', {
      session_id: secret,
      uuid: secret,
      errors: [secret],
      modelUsage: { privateModel: { costUSD: 123 } },
      cwd: `C:\\Users\\private\\${secret}`,
    })]);
    const result = await createClaudeCliAdapter(config(), port).executePhase('prompt');
    assert.deepEqual(result, {
      output: 'PUBLIC_RESULT',
      cost: { status: 'unknown', inputTokens: null, outputTokens: null, costUsd: null },
    });
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  await test('two Claude models keep independent trust keys and share the exact external gate contract', async () => {
    const opusPort = new FakePort([version(), success('OK')]);
    const sonnetPort = new FakePort([version(), success('wrong')]);
    const opus = createClaudeCliAdapter(config(), opusPort);
    const sonnet = createClaudeCliAdapter(config({ modelKey: 'claude-sonnet' }), sonnetPort);
    const registry = new ProviderRegistry([opus, sonnet]);
    const opusKey = backendKey(opus.identity);
    const sonnetKey = backendKey(sonnet.identity);
    assert.notEqual(opusKey, sonnetKey);
    const trustedOpus = await registry.trust(opusKey);
    await registry.trust(sonnetKey);
    const gate = async (output: string) => ({ passed: output === 'OK', detail: 'exact OK' });
    const opusResult = await registry.execute(opusKey, 'prompt', gate);
    const sonnetResult = await registry.execute(sonnetKey, 'prompt', gate);
    assert.equal(opusResult.gate.passed, true);
    assert.equal(sonnetResult.gate.passed, false);
    const binding = createEvidenceBinding({ trusted: trustedOpus, cost: opusResult.cost! });
    assert.equal(binding.identity.provider, 'claude');
    assert.equal(binding.identity.modelId, 'claude-opus-4-8');
  });

  await test('1,000 offline parses stay below the A3A time and incremental RSS sentinels', async () => {
    let calls = 0;
    const port: ClaudeProcessPort = {
      async execute() { calls += 1; return success('OK'); },
    };
    const adapter = createClaudeCliAdapter(config(), port);
    const rssBefore = process.memoryUsage().rss;
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) await adapter.executePhase(`prompt-${index}`);
    const elapsedMs = performance.now() - started;
    const rssDelta = Math.max(0, process.memoryUsage().rss - rssBefore);
    assert.equal(calls, 1_000);
    assert.ok(elapsedMs < 5_000, `offline parse sentinel exceeded 5 s: ${elapsedMs.toFixed(3)} ms`);
    assert.ok(rssDelta < 32 * 1024 * 1024, `offline parse RSS exceeded 32 MiB: ${rssDelta}`);
    console.log(`  offline parse sentinel: ${elapsedMs.toFixed(3)} ms, RSS delta ${rssDelta} bytes`);
  });

  console.log(`\n${passed} passed, ${failed} failed (0 real provider/model calls)`);
  process.exit(failed ? 1 : 0);
}

main();
