/**
 * I2-C1 — Codex CLI adapter foundation.
 *
 * The adapter has no credential lookup and never creates a shell. The operator supplies a pinned,
 * non-secret transport configuration; tests inject ProcessExecutor, so no Codex process is run.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { identityFromModelConfig, normalizeCost, type BackendCost, type ProviderAdapter } from './multi-provider-backends';
import type { ModelConfig } from './model-config';

export interface ProcessExecution {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputCapped: boolean;
}

export type SpawnFactory = (
  executable: string,
  args: readonly string[],
  options: { cwd: string; shell: false; detached: boolean; stdio: ['pipe', 'pipe', 'pipe'] },
) => ChildProcessWithoutNullStreams;

export interface NodeProcessExecutorOptions {
  spawnFactory?: SpawnFactory;
  platform?: NodeJS.Platform;
  /** Injectable so tests never issue OS-level process termination. */
  terminateTree?: (child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform) => void;
}

export interface ProcessExecutor {
  execute(input: {
    executable: string;
    args: readonly string[];
    stdin: string;
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    shell: false;
  }): Promise<ProcessExecution>;
}

export interface CodexRatesUsdPerMillion {
  input: number;
  cachedInput: number;
  output: number;
}

export interface CodexCliAdapterConfig {
  executable: string;
  /** Injected canonical registry; C1 deliberately never reads it from the filesystem. */
  modelConfig: ModelConfig;
  modelKey: string;
  adapterVersion: string;
  expectedCliVersion: string;
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  /** All three rates must be present to derive USD; absent means explicitly unknown. */
  ratesUsdPerMillion?: CodexRatesUsdPerMillion;
}

interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const VERSION_RE = /^codex-cli ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)\r?\n?$/;

export class CodexCliAdapterError extends Error {
  constructor(message: string) {
    super(`Codex CLI adapter: ${message}`);
    this.name = 'CodexCliAdapterError';
  }
}

function defaultTerminateTree(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform): void {
  if (platform === 'win32' && child.pid) {
    // taskkill traverses the Windows child tree. It is deliberately direct argv, never a shell.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
    killer.unref();
    return;
  }
  if (platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* fall through to child */ }
  }
  try { child.kill('SIGKILL'); } catch { /* already exited */ }
}

/**
 * Production executor for an operator-authorized adapter invocation. It uses direct Node spawn,
 * sends prompt text through stdin, caps combined stdout/stderr in memory, and returns a stable
 * exit/signal record. No caller is created by C1; offline tests inject the spawn boundary.
 */
export function createNodeProcessExecutor(options: NodeProcessExecutorOptions = {}): ProcessExecutor {
  const spawnFactory = options.spawnFactory ?? (spawn as unknown as SpawnFactory);
  const platform = options.platform ?? process.platform;
  const terminateTree = options.terminateTree ?? defaultTerminateTree;
  return {
    execute(input) {
      return new Promise<ProcessExecution>((resolve) => {
        let child: ChildProcessWithoutNullStreams;
        try {
          child = spawnFactory(input.executable, input.args, {
            cwd: input.cwd,
            shell: false,
            detached: platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (error) {
          resolve({ exitCode: null, signal: null, stdout: '', stderr: String(error), timedOut: false, outputCapped: false });
          return;
        }

        let stdout = '';
        let stderr = '';
        let outputBytes = 0;
        let timedOut = false;
        let outputCapped = false;
        let settled = false;
        const finish = (exitCode: number | null, signal: string | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ exitCode, signal, stdout, stderr, timedOut, outputCapped });
        };
        const capture = (stream: 'stdout' | 'stderr', data: Buffer) => {
          if (settled) return;
          const text = data.toString('utf8');
          const nextBytes = outputBytes + Buffer.byteLength(text, 'utf8');
          if (nextBytes > input.maxOutputBytes) {
            outputCapped = true;
            terminateTree(child, platform);
            return;
          }
          outputBytes = nextBytes;
          if (stream === 'stdout') stdout += text; else stderr += text;
        };
        const timer = setTimeout(() => {
          timedOut = true;
          terminateTree(child, platform);
        }, input.timeoutMs);
        child.stdout.on('data', (data: Buffer) => capture('stdout', data));
        child.stderr.on('data', (data: Buffer) => capture('stderr', data));
        child.on('error', (error) => {
          stderr += String(error);
          finish(null, null);
        });
        child.on('close', (exitCode, signal) => finish(exitCode, signal));
        try {
          child.stdin.write(input.stdin, 'utf8');
          child.stdin.end();
        } catch (error) {
          stderr += String(error);
          terminateTree(child, platform);
        }
      });
    },
  };
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new CodexCliAdapterError(`${field} must be a non-blank control-character-free string`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new CodexCliAdapterError(`${field} must be a positive safe integer`);
  return value as number;
}

function strictSemver(value: unknown, field: string): string {
  const version = nonBlank(value, field);
  if (!SEMVER_RE.test(version)) throw new CodexCliAdapterError(`${field} must be strict semver`);
  return version;
}

function validateRates(rates: CodexRatesUsdPerMillion | undefined): CodexRatesUsdPerMillion | undefined {
  if (rates === undefined) return undefined;
  for (const [field, value] of Object.entries(rates)) {
    if (!Number.isFinite(value) || value < 0) throw new CodexCliAdapterError(`ratesUsdPerMillion.${field} must be finite and non-negative`);
  }
  if (!Object.prototype.hasOwnProperty.call(rates, 'input') || !Object.prototype.hasOwnProperty.call(rates, 'cachedInput') || !Object.prototype.hasOwnProperty.call(rates, 'output')) {
    throw new CodexCliAdapterError('ratesUsdPerMillion must provide input, cachedInput, and output together');
  }
  return rates;
}

function validateConfig(config: CodexCliAdapterConfig): Required<Omit<CodexCliAdapterConfig, 'ratesUsdPerMillion'>> & Pick<CodexCliAdapterConfig, 'ratesUsdPerMillion'> {
  if (!config.modelConfig || typeof config.modelConfig !== 'object') throw new CodexCliAdapterError('modelConfig is required');
  return {
    executable: nonBlank(config.executable, 'executable'),
    modelConfig: config.modelConfig,
    modelKey: nonBlank(config.modelKey, 'modelKey'),
    adapterVersion: nonBlank(config.adapterVersion, 'adapterVersion'),
    expectedCliVersion: strictSemver(config.expectedCliVersion, 'expectedCliVersion'),
    timeoutMs: positiveSafeInteger(config.timeoutMs, 'timeoutMs'),
    maxOutputBytes: positiveSafeInteger(config.maxOutputBytes, 'maxOutputBytes'),
    cwd: config.cwd ? nonBlank(config.cwd, 'cwd') : process.cwd(),
    ratesUsdPerMillion: validateRates(config.ratesUsdPerMillion),
  };
}

function assertProcessSuccess(result: ProcessExecution, maxOutputBytes: number, purpose: 'capability probe' | 'execution'): void {
  if (!result || result.timedOut) throw new CodexCliAdapterError(`${purpose} timed out`);
  if (result.exitCode !== 0 || result.signal !== null) throw new CodexCliAdapterError(`${purpose} exited nonzero or by signal`);
  if (
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string' ||
    result.outputCapped ||
    Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') > maxOutputBytes
  ) {
    throw new CodexCliAdapterError(`${purpose} exceeded output cap or returned non-text output`);
  }
}

function parseUsage(value: unknown): CodexUsage {
  if (!value || typeof value !== 'object') throw new CodexCliAdapterError('turn.completed usage is missing');
  const usage = value as Record<string, unknown>;
  const inputTokens = usage.input_tokens;
  const cachedInputTokens = usage.cached_input_tokens;
  const outputTokens = usage.output_tokens;
  for (const [field, token] of [['input_tokens', inputTokens], ['cached_input_tokens', cachedInputTokens], ['output_tokens', outputTokens]] as const) {
    if (!Number.isSafeInteger(token) || token < 0) throw new CodexCliAdapterError(`turn.completed ${field} is malformed`);
  }
  if ((cachedInputTokens as number) > (inputTokens as number)) throw new CodexCliAdapterError('turn.completed cached_input_tokens exceeds input_tokens');
  return { inputTokens: inputTokens as number, cachedInputTokens: cachedInputTokens as number, outputTokens: outputTokens as number };
}

export function parseCodexJsonl(stdout: string, rates: CodexRatesUsdPerMillion | undefined): { output: string; cost: BackendCost } {
  let agentMessage: string | undefined;
  let usage: CodexUsage | undefined;
  let completedTurns = 0;
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) throw new CodexCliAdapterError('execution returned no JSONL events');
  for (const line of lines) {
    let event: unknown;
    try { event = JSON.parse(line); } catch { throw new CodexCliAdapterError('execution emitted malformed JSONL'); }
    if (!event || typeof event !== 'object') throw new CodexCliAdapterError('execution emitted malformed JSONL event');
    const record = event as Record<string, unknown>;
    if (record.type === 'item.completed') {
      const item = record.item as Record<string, unknown> | undefined;
      if (item?.type === 'agent_message') {
        if (typeof item.text !== 'string' || !item.text.trim() || agentMessage !== undefined) throw new CodexCliAdapterError('completed agent_message is missing, malformed, or ambiguous');
        agentMessage = item.text;
      }
    }
    if (record.type === 'turn.completed') {
      completedTurns += 1;
      if (completedTurns !== 1) throw new CodexCliAdapterError('turn.completed usage sentinel is duplicated');
      usage = parseUsage(record.usage);
    }
  }
  if (completedTurns !== 1 || !usage) throw new CodexCliAdapterError('turn.completed usage sentinel is missing');
  if (agentMessage === undefined) throw new CodexCliAdapterError('completed agent_message is missing');
  if (rates === undefined) return { output: agentMessage, cost: normalizeCost(undefined) };
  const costUsd = ((usage.inputTokens - usage.cachedInputTokens) * rates.input + usage.cachedInputTokens * rates.cachedInput + usage.outputTokens * rates.output) / 1_000_000;
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new CodexCliAdapterError('derived USD cost is malformed');
  return { output: agentMessage, cost: normalizeCost({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd }) };
}

/** Create the one supported non-Claude I2-C1 adapter with the official direct Codex exec argv. */
export function createCodexCliAdapter(input: CodexCliAdapterConfig, executor: ProcessExecutor): ProviderAdapter {
  const config = validateConfig(input);
  if (!executor || typeof executor.execute !== 'function') throw new CodexCliAdapterError('process executor is required');
  let identity;
  try {
    identity = identityFromModelConfig(config.modelConfig, config.modelKey, config.adapterVersion);
  } catch (error) {
    throw new CodexCliAdapterError(`modelKey is not registered: ${(error as Error).message}`);
  }
  if (identity.provider !== 'codex') throw new CodexCliAdapterError('modelKey must resolve to provider "codex"');
  return {
    identity,
    async capabilityProbe() {
      const result = await executor.execute({
        executable: config.executable, args: ['--version'], stdin: '', cwd: config.cwd,
        timeoutMs: config.timeoutMs, maxOutputBytes: config.maxOutputBytes, shell: false,
      });
      assertProcessSuccess(result, config.maxOutputBytes, 'capability probe');
      const match = VERSION_RE.exec(result.stdout);
      if (!match) throw new CodexCliAdapterError('capability probe did not return strict "codex-cli X.Y.Z"');
      const observedVersion = match[1];
      if (observedVersion !== config.expectedCliVersion) throw new CodexCliAdapterError('capability probe version does not match expectedCliVersion');
      return { provider: 'codex', capabilities: ['execute-phase', 'evidence-binding', `codex-cli-version:${observedVersion}`] };
    },
    async executePhase(prompt: string) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new CodexCliAdapterError('phase prompt must be non-blank');
      const result = await executor.execute({
        executable: config.executable,
        args: ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--model', identity.modelId, '-'],
        stdin: prompt, cwd: config.cwd,
        timeoutMs: config.timeoutMs, maxOutputBytes: config.maxOutputBytes, shell: false,
      });
      assertProcessSuccess(result, config.maxOutputBytes, 'execution');
      return parseCodexJsonl(result.stdout, config.ratesUsdPerMillion);
    },
  };
}
