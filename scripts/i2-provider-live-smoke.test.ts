/** Offline attack suite for the provider-neutral I2 live smoke. No provider is contacted. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProcessExecution, ProcessExecutor } from '../.claude/integrations/codex-cli-adapter';
import type { GrokHttpExecutor, GrokHttpRequest, GrokHttpResponse } from '../.claude/integrations/grok-api-adapter';
import { normalizeConfig } from '../.claude/integrations/model-config';
import { verifyBackendBoundBundle } from '../.claude/integrations/evidence-bundle';
import {
  executeI2ProviderLiveSmoke,
  I2_PROVIDER_LIVE_OK,
  I2_PROVIDER_LIVE_PROMPT,
  I2_PROVIDER_SMOKE_RESULT_SENTINEL,
  runI2ProviderLiveSmokeCli,
  type ProviderSmokeDependencies,
  type ProviderSmokeResult,
} from './i2-provider-live-smoke';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const MODEL_CONFIG = normalizeConfig({
  primary: 'codex',
  models: {
    codex: { id: 'gpt-5.6-sol', provider: 'codex', reasoningEfforts: ['default', 'high'] },
    'copilot-gpt-5.3-codex': { id: 'gpt-5.3-codex', provider: 'copilot', reasoningEfforts: ['default', 'high'] },
    'gemini-2.5-pro': { id: 'gemini-2.5-pro', provider: 'gemini' },
    'grok-4.5': { id: 'grok-4.5', provider: 'grok' },
  },
});

const processResult = (stdout: string, overrides: Partial<ProcessExecution> = {}): ProcessExecution => ({
  exitCode: 0, signal: null, stdout, stderr: '', timedOut: false, outputCapped: false, ...overrides,
});
const codexJsonl = (output = I2_PROVIDER_LIVE_OK): string => [
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: output } }),
  JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 } }),
].join('\n');

class FakeProcessExecutor implements ProcessExecutor {
  readonly calls: Array<{ executable: string; args: readonly string[]; stdin: string; shell: false }> = [];
  constructor(private readonly results: ProcessExecution[]) {}
  async execute(input: { executable: string; args: readonly string[]; stdin: string; cwd: string; timeoutMs: number; maxOutputBytes: number; shell: false }): Promise<ProcessExecution> {
    this.calls.push(input);
    const result = this.results.shift();
    if (!result) throw new Error('unexpected process execution');
    return result;
  }
}

class FakeHttpExecutor implements GrokHttpExecutor {
  readonly calls: GrokHttpRequest[] = [];
  constructor(private readonly responses: GrokHttpResponse[]) {}
  async execute(request: GrokHttpRequest): Promise<GrokHttpResponse> {
    this.calls.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error('unexpected HTTP execution');
    return response;
  }
}

function http(body: unknown): GrokHttpResponse {
  return { status: 200, body: JSON.stringify(body), timedOut: false, outputCapped: false, redirected: false };
}

function grokExecution(output = I2_PROVIDER_LIVE_OK): GrokHttpResponse {
  return http({
    model: 'grok-4.5',
    output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }],
    usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } },
  });
}

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'i2-provider-live-smoke-'));
}

function common(root: string, provider: string, modelKey: string): string[] {
  return ['--confirm-live', '--provider', provider, '--model-key', modelKey, '--evidence-root', root];
}

function cliArgs(root: string, provider: 'codex' | 'copilot', modelKey: string): string[] {
  return [...common(root, provider, modelKey), '--executable', provider, '--expected-cli-version', '1.2.3'];
}

function geminiArgs(root: string): string[] {
  return [
    ...common(root, 'gemini', 'gemini-2.5-pro'),
    '--executable', 'node',
    '--entrypoint', 'C:\\gemini\\bundle\\gemini.js',
    '--expected-cli-version', '0.54.4',
  ];
}

function grokArgs(root: string): string[] {
  return [...common(root, 'grok', 'grok-4.5'), '--base-url', 'https://api.x.ai/v1'];
}

function dependencies(root: string, overrides: Partial<ProviderSmokeDependencies> = {}): ProviderSmokeDependencies {
  return { cwd: root, modelConfigLoader: () => MODEL_CONFIG, ...overrides };
}

function evidencePath(root: string, provider: string): string {
  return path.join(root, 'docs', 'specs', `i2-provider-live-smoke-${provider}`, '.evidence');
}

function assertNoEvidence(root: string, provider: string): void {
  assert.equal(fs.existsSync(evidencePath(root, provider)), false);
}

async function runCli(argv: readonly string[], deps: ProviderSmokeDependencies): Promise<{ exitCode: number; result: ProviderSmokeResult; line: string }> {
  const lines: string[] = [];
  const exitCode = await runI2ProviderLiveSmokeCli(argv, (line) => lines.push(line), deps);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split(I2_PROVIDER_SMOKE_RESULT_SENTINEL).length - 1, 1);
  return { exitCode, result: JSON.parse(lines[0].slice(I2_PROVIDER_SMOKE_RESULT_SENTINEL.length)), line: lines[0] };
}

async function main() {
  await test('missing confirmation and invalid provider-specific options cause zero transport and zero evidence', async () => {
    const root = tempRoot();
    const processExecutor = new FakeProcessExecutor([]);
    const httpExecutor = new FakeHttpExecutor([]);
    const noConfirm = cliArgs(root, 'copilot', 'copilot-gpt-5.3-codex').filter((value) => value !== '--confirm-live');
    assert.equal((await executeI2ProviderLiveSmoke(noConfirm, dependencies(root, { processExecutor, httpExecutor }))).pass, false);
    assert.equal((await executeI2ProviderLiveSmoke([...grokArgs(root), '--executable', 'grok'], dependencies(root, { processExecutor, httpExecutor, apiKeyLoader: () => 'secret' }))).pass, false);
    assert.equal(processExecutor.calls.length, 0);
    assert.equal(httpExecutor.calls.length, 0);
    assertNoEvidence(root, 'copilot');
    assertNoEvidence(root, 'grok');
  });

  await test('Copilot direct CLI passes the shared gate and writes a strict provider-bound bundle', async () => {
    const root = tempRoot();
    const processExecutor = new FakeProcessExecutor([
      processResult('GitHub Copilot CLI 1.2.3.\nRun \'copilot update\' to check for updates.\n'),
      processResult(`  ${I2_PROVIDER_LIVE_OK}\n`),
    ]);
    const { exitCode, result, line } = await runCli(cliArgs(root, 'copilot', 'copilot-gpt-5.3-codex'), dependencies(root, { processExecutor }));
    assert.equal(exitCode, 0);
    assert.equal(result.pass, true);
    assert.equal(result.provider, 'copilot');
    assert.equal(result.modelId, 'gpt-5.3-codex');
    assert.equal(result.runtimeVersion, '1.2.3');
    assert.equal(result.costStatus, 'unknown');
    assert.equal(result.strictValid, true);
    assert.equal(verifyBackendBoundBundle('i2-provider-live-smoke-copilot', 'B0', root).valid, true);
    assert.deepEqual(processExecutor.calls[0].args, ['--version']);
    assert.equal(processExecutor.calls[1].args[0], '-p');
    assert.equal(processExecutor.calls[1].args[1], I2_PROVIDER_LIVE_PROMPT);
    assert.equal(processExecutor.calls[1].args.includes('gpt-5.3-codex'), true);
    assert.equal(processExecutor.calls.every((call) => call.shell === false), true);
    assert.equal(line.includes('stdout'), false);
    assert.equal(line.includes('stderr'), false);
  });

  await test('Codex direct CLI remains compatible with the same provider-neutral evidence contract', async () => {
    const root = tempRoot();
    const processExecutor = new FakeProcessExecutor([
      processResult('codex-cli 1.2.3\n'),
      processResult(codexJsonl()),
    ]);
    const result = await executeI2ProviderLiveSmoke(cliArgs(root, 'codex', 'codex'), dependencies(root, { processExecutor }));
    assert.equal(result.pass, true);
    assert.equal(result.provider, 'codex');
    assert.equal(result.modelId, 'gpt-5.6-sol');
    assert.equal(result.strictValid, true);
    assert.equal(processExecutor.calls[1].stdin, I2_PROVIDER_LIVE_PROMPT);
    assert.equal(verifyBackendBoundBundle('i2-provider-live-smoke-codex', 'B0', root).valid, true);
  });

  await test('selected reasoning effort is carried through argv, result, and strict evidence capability binding', async () => {
    const root = tempRoot();
    const processExecutor = new FakeProcessExecutor([
      processResult('codex-cli 1.2.3\n'),
      processResult(codexJsonl()),
    ]);
    const result = await executeI2ProviderLiveSmoke(
      [...cliArgs(root, 'codex', 'codex'), '--reasoning-effort', 'high'],
      dependencies(root, { processExecutor }),
    );
    assert.equal(result.pass, true);
    assert.equal(result.reasoningEffort, 'high');
    assert.deepEqual(processExecutor.calls[1].args.slice(-3), ['-c', 'model_reasoning_effort="high"', '-']);
    const highBinding = JSON.parse(fs.readFileSync(path.join(evidencePath(root, 'codex'), 'B0', 'backend-binding.json'), 'utf8'));
    const defaultRoot = tempRoot();
    const defaultExecutor = new FakeProcessExecutor([
      processResult('codex-cli 1.2.3\n'),
      processResult(codexJsonl()),
    ]);
    assert.equal((await executeI2ProviderLiveSmoke(
      cliArgs(defaultRoot, 'codex', 'codex'),
      dependencies(defaultRoot, { processExecutor: defaultExecutor }),
    )).pass, true);
    const defaultBinding = JSON.parse(fs.readFileSync(path.join(evidencePath(defaultRoot, 'codex'), 'B0', 'backend-binding.json'), 'utf8'));
    assert.notEqual(highBinding.capabilityHash, defaultBinding.capabilityHash, 'effort must alter the trusted capability hash');
  });

  await test('Gemini direct CLI passes the shared gate with pinned entrypoint/model evidence', async () => {
    const root = tempRoot();
    const processExecutor = new FakeProcessExecutor([
      processResult('0.54.4\n'),
      processResult(JSON.stringify({ response: I2_PROVIDER_LIVE_OK, stats: { models: {} } })),
    ]);
    const result = await executeI2ProviderLiveSmoke(geminiArgs(root), dependencies(root, { processExecutor }));
    assert.equal(result.pass, true);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.modelId, 'gemini-2.5-pro');
    assert.equal(result.runtimeVersion, '0.54.4');
    assert.equal(result.costStatus, 'unknown');
    assert.equal(result.strictValid, true);
    assert.deepEqual(processExecutor.calls[0].args, ['C:\\gemini\\bundle\\gemini.js', '--version']);
    assert.deepEqual(processExecutor.calls[1].args, [
      'C:\\gemini\\bundle\\gemini.js', '-p', I2_PROVIDER_LIVE_PROMPT, '--output-format', 'json',
      '--model', 'gemini-2.5-pro', '--approval-mode', 'plan', '--skip-trust',
    ]);
    assert.equal(verifyBackendBoundBundle('i2-provider-live-smoke-gemini', 'B0', root).valid, true);
  });

  await test('missing Grok key fails before HTTP and never serializes a credential field', async () => {
    const root = tempRoot();
    const httpExecutor = new FakeHttpExecutor([]);
    const { exitCode, result, line } = await runCli(grokArgs(root), dependencies(root, { httpExecutor, apiKeyLoader: () => undefined }));
    assert.equal(exitCode, 1);
    assert.equal(result.pass, false);
    assert.equal(httpExecutor.calls.length, 0);
    assert.equal(line.includes('apiKey'), false);
    assert.equal(line.includes('authorization'), false);
    assertNoEvidence(root, 'grok');
  });

  await test('Grok probe and response pass the same gate with inert JSON input and strict evidence', async () => {
    const root = tempRoot();
    const httpExecutor = new FakeHttpExecutor([http({ id: 'grok-4.5' }), grokExecution()]);
    const result = await executeI2ProviderLiveSmoke(grokArgs(root), dependencies(root, { httpExecutor, apiKeyLoader: () => 'test-secret-not-output' }));
    assert.equal(result.pass, true);
    assert.equal(result.provider, 'grok');
    assert.equal(result.modelId, 'grok-4.5');
    assert.equal(result.runtimeVersion, null);
    assert.equal(result.costStatus, 'unknown');
    assert.equal(result.strictValid, true);
    assert.equal(httpExecutor.calls.length, 2);
    assert.equal(httpExecutor.calls[0].method, 'GET');
    assert.equal(httpExecutor.calls[1].method, 'POST');
    assert.deepEqual(JSON.parse(httpExecutor.calls[1].body!), { model: 'grok-4.5', input: [{ role: 'user', content: I2_PROVIDER_LIVE_PROMPT }] });
    assert.equal(verifyBackendBoundBundle('i2-provider-live-smoke-grok', 'B0', root).valid, true);
  });

  await test('plausible wrong output from every transport is rejected before evidence', async () => {
    const copilotRoot = tempRoot();
    const copilot = new FakeProcessExecutor([processResult('GitHub Copilot CLI 1.2.3.\n'), processResult(`${I2_PROVIDER_LIVE_OK} extra`)]);
    assert.equal((await executeI2ProviderLiveSmoke(cliArgs(copilotRoot, 'copilot', 'copilot-gpt-5.3-codex'), dependencies(copilotRoot, { processExecutor: copilot }))).pass, false);
    assertNoEvidence(copilotRoot, 'copilot');

    const grokRoot = tempRoot();
    const grok = new FakeHttpExecutor([http({ id: 'grok-4.5' }), grokExecution('plausible but wrong')]);
    assert.equal((await executeI2ProviderLiveSmoke(grokArgs(grokRoot), dependencies(grokRoot, { httpExecutor: grok, apiKeyLoader: () => 'secret' }))).pass, false);
    assertNoEvidence(grokRoot, 'grok');

    const geminiRoot = tempRoot();
    const gemini = new FakeProcessExecutor([
      processResult('0.54.4\n'),
      processResult(JSON.stringify({ response: `${I2_PROVIDER_LIVE_OK} extra`, stats: {} })),
    ]);
    assert.equal((await executeI2ProviderLiveSmoke(geminiArgs(geminiRoot), dependencies(geminiRoot, { processExecutor: gemini }))).pass, false);
    assertNoEvidence(geminiRoot, 'gemini');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
