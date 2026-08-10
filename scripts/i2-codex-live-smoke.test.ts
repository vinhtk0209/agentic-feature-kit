/** Offline attack suite for the explicit I2-C Codex live-smoke CLI. No Codex process is started. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  executeI2CodexLiveSmoke,
  I2_CODEX_LIVE_OK,
  I2_CODEX_LIVE_PROMPT,
  I2_CODEX_SMOKE_FEATURE,
  I2_CODEX_SMOKE_RESULT_SENTINEL,
  runI2CodexLiveSmokeCli,
  type SmokeResult,
} from './i2-codex-live-smoke';
import type { ProcessExecution, ProcessExecutor } from '../.claude/integrations/codex-cli-adapter';
import { verifyBackendBoundBundle } from '../.claude/integrations/evidence-bundle';
import { normalizeConfig } from '../.claude/integrations/model-config';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const MODEL_CONFIG = normalizeConfig({
  primary: 'claude',
  models: {
    claude: { id: 'claude-fixture', provider: 'claude' },
    codex: { id: 'gpt-5.6-sol', provider: 'codex' },
  },
});

const phaseResult = (stdout: string, overrides: Partial<ProcessExecution> = {}): ProcessExecution => ({
  exitCode: 0, signal: null, stdout, stderr: '', timedOut: false, outputCapped: false, ...overrides,
});
const versionResult = (version = '1.2.3'): ProcessExecution => phaseResult(`codex-cli ${version}\n`);
const jsonl = (output = I2_CODEX_LIVE_OK, usage = { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 }): string => [
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: output } }),
  JSON.stringify({ type: 'turn.completed', usage }),
].join('\n');

class FakeExecutor implements ProcessExecutor {
  readonly calls: Array<{ executable: string; args: readonly string[]; stdin: string; shell: false }> = [];
  constructor(private readonly results: ProcessExecution[]) {}
  async execute(input: { executable: string; args: readonly string[]; stdin: string; cwd: string; timeoutMs: number; maxOutputBytes: number; shell: false }): Promise<ProcessExecution> {
    this.calls.push(input);
    const result = this.results.shift();
    if (!result) throw new Error('unexpected process invocation');
    return result;
  }
}

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'i2-codex-live-smoke-'));
}

function args(root: string, extra: readonly string[] = []): string[] {
  return ['--confirm-live', '--executable', 'codex', '--expected-cli-version', '1.2.3', '--evidence-root', root, ...extra];
}

function dependencies(executor: FakeExecutor, cwd: string) {
  return { executor, cwd, modelConfigLoader: () => MODEL_CONFIG };
}

function assertNoEvidence(root: string): void {
  assert.equal(fs.existsSync(path.join(root, 'docs', 'specs', I2_CODEX_SMOKE_FEATURE, '.evidence')), false);
}

async function runCli(argv: readonly string[], executor: FakeExecutor, cwd: string): Promise<{ exitCode: number; lines: string[]; result: SmokeResult }> {
  const lines: string[] = [];
  const exitCode = await runI2CodexLiveSmokeCli(argv, (line) => lines.push(line), dependencies(executor, cwd));
  assert.equal(lines.length, 1, 'CLI must emit exactly one result line');
  assert.equal(lines[0].split(I2_CODEX_SMOKE_RESULT_SENTINEL).length - 1, 1, 'result sentinel must be unique');
  return { exitCode, lines, result: JSON.parse(lines[0].slice(I2_CODEX_SMOKE_RESULT_SENTINEL.length)) as SmokeResult };
}

async function main() {
  await test('missing --confirm-live invokes zero processes, writes zero evidence, and emits one safe failure sentinel', async () => {
    const root = tempRoot();
    const executor = new FakeExecutor([]);
    const { exitCode, result } = await runCli(args(root).filter((arg) => arg !== '--confirm-live'), executor, root);
    assert.equal(exitCode, 1);
    assert.equal(result.pass, false);
    assert.equal(executor.calls.length, 0);
    assertNoEvidence(root);
  });

  await test('a plausible wrong response reaches the exact deterministic gate and leaves zero evidence', async () => {
    const root = tempRoot();
    const executor = new FakeExecutor([versionResult(), phaseResult(jsonl('I2_CODEX_LIVE_OK with extra text'))]);
    const result = await executeI2CodexLiveSmoke(args(root), dependencies(executor, root));
    assert.equal(result.pass, false);
    assert.equal(executor.calls.length, 2);
    assert.equal(executor.calls[1].stdin, I2_CODEX_LIVE_PROMPT);
    assertNoEvidence(root);
  });

  await test('valid JSONL writes one strict-valid B0 bundle with sanitized unknown cost and root-relative result path', async () => {
    const root = tempRoot();
    const executor = new FakeExecutor([versionResult(), phaseResult(jsonl(`  ${I2_CODEX_LIVE_OK}\n`))]);
    const { exitCode, result, lines } = await runCli(args(root), executor, root);
    assert.equal(exitCode, 0);
    assert.equal(result.pass, true);
    assert.equal(result.provider, 'codex');
    assert.equal(result.modelKey, 'codex');
    assert.equal(result.modelId, 'gpt-5.6-sol');
    assert.equal(result.adapterVersion, 'i2-codex-live-smoke-v1');
    assert.equal(result.cliVersion, '1.2.3');
    assert.equal(result.costStatus, 'unknown');
    assert.equal(result.inputTokens, null);
    assert.equal(result.outputTokens, null);
    assert.equal(result.costUsd, null);
    assert.equal(result.strictValid, true);
    assert.ok(result.bundleHash && /^[a-f0-9]{64}$/.test(result.bundleHash));
    assert.ok(result.bundlePath && !path.isAbsolute(result.bundlePath) && !result.bundlePath.includes('..'));
    assert.equal(verifyBackendBoundBundle(I2_CODEX_SMOKE_FEATURE, 'B0', root).valid, true);
    assert.equal(fs.readFileSync(path.join(root, result.bundlePath!, 'transcripts', 'codex-live-smoke-output.txt'), 'utf8'), I2_CODEX_LIVE_OK);
    assert.equal(lines[0].includes('stdout'), false);
    assert.equal(lines[0].includes('stderr'), false);
  });

  await test('malformed, missing, or duplicate usage sentinels fail before any evidence write', async () => {
    const malformedCases = [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: I2_CODEX_LIVE_OK } }),
      `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: I2_CODEX_LIVE_OK } })}\nnot-json`,
      `${jsonl()}\n${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } })}`,
    ];
    for (const stdout of malformedCases) {
      const root = tempRoot();
      const executor = new FakeExecutor([versionResult(), phaseResult(stdout)]);
      const result = await executeI2CodexLiveSmoke(args(root), dependencies(executor, root));
      assert.equal(result.pass, false);
      assert.equal(executor.calls.length, 2);
      assertNoEvidence(root);
    }
  });

  await test('the smoke binds canonical model and exact CLI provenance through direct fixed argv', async () => {
    const root = tempRoot();
    const executor = new FakeExecutor([versionResult('1.2.3'), phaseResult(jsonl())]);
    const result = await executeI2CodexLiveSmoke(args(root), dependencies(executor, root));
    assert.equal(result.pass, true);
    assert.deepEqual(executor.calls[0].args, ['--version']);
    assert.deepEqual(executor.calls[1].args, ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--model', 'gpt-5.6-sol', '-']);
    assert.equal(executor.calls.every((call) => call.shell === false), true);
    assert.equal(result.cliVersion, '1.2.3');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
