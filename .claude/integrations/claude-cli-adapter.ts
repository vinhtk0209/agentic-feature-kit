/**
 * P17-007 A3A — offline-testable Claude Code CLI output adapter.
 *
 * The adapter has no production spawn, credential, environment, filesystem, or network access.
 * Callers inject a process port; A3A tests use only fakes and never launch Claude Code.
 */
import { identityFromModelConfig, normalizeCost, type ProviderAdapter } from './multi-provider-backends';
import { reasoningEffortForModel, type ModelConfig, type ReasoningEffort } from './model-config';

export interface ClaudeProcessExecution {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputCapped: boolean;
}

export interface ClaudeProcessRequest {
  executable: string;
  args: readonly string[];
  stdin: string;
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  shell: false;
}

export interface ClaudeProcessPort {
  execute(input: ClaudeProcessRequest): Promise<ClaudeProcessExecution>;
}

export interface ClaudeCliAdapterConfig {
  executable: string;
  modelConfig: ModelConfig;
  modelKey: string;
  adapterVersion: string;
  expectedCliVersion: string;
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  maxTurns: number;
  maxBudgetUsdCents: number;
  reasoningEffort?: ReasoningEffort;
}

const SEMVER = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
const SEMVER_RE = new RegExp(`^${SEMVER}$`);
const VERSION_RE = new RegExp(`^(${SEMVER})(?: \\(Claude Code\\))?\\r?\\n?$`);
const CLAUDE_EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const TOOL_PROFILE = 'Read,Edit,Write';
const FIXED_QUERY = 'Apply the exact task specification provided on standard input.';
const MAX_PROMPT_BYTES = 32_768;
const MAX_TURNS = 32;
const MAX_BUDGET_CENTS = 10_000;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class ClaudeCliAdapterError extends Error {
  constructor(message: string) {
    super(`Claude CLI adapter: ${message}`);
    this.name = 'ClaudeCliAdapterError';
  }
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new ClaudeCliAdapterError(`${field} must be a non-blank control-character-free string`);
  }
  return value;
}

function boundedPositiveInteger(value: unknown, field: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new ClaudeCliAdapterError(`${field} must be a positive safe integer at most ${maximum}`);
  }
  return value as number;
}

function strictSemver(value: unknown): string {
  const version = nonBlank(value, 'expectedCliVersion');
  if (!SEMVER_RE.test(version)) throw new ClaudeCliAdapterError('expectedCliVersion must be strict semver');
  return version;
}

function assertProcessSucceeded(result: ClaudeProcessExecution, maxOutputBytes: number, purpose: string): void {
  if (!result || typeof result !== 'object') throw new ClaudeCliAdapterError(`${purpose} returned a malformed process result`);
  if (
    typeof result.stdout !== 'string' || typeof result.stderr !== 'string' ||
    (result.exitCode !== null && !Number.isSafeInteger(result.exitCode)) ||
    (result.signal !== null && typeof result.signal !== 'string') ||
    typeof result.timedOut !== 'boolean' || typeof result.outputCapped !== 'boolean'
  ) {
    throw new ClaudeCliAdapterError(`${purpose} returned a malformed process result`);
  }
  if (result.timedOut === true) throw new ClaudeCliAdapterError(`${purpose} timed out`);
  if (result.outputCapped === true || Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') > maxOutputBytes) {
    throw new ClaudeCliAdapterError(`${purpose} exceeded the output cap`);
  }
  if (result.exitCode !== 0 || result.signal !== null) throw new ClaudeCliAdapterError(`${purpose} exited nonzero or by signal`);
  if (result.stderr.length !== 0) throw new ClaudeCliAdapterError(`${purpose} emitted unexpected stderr`);
}

function parseSuccessEnvelope(stdout: string, maxTurns: number): string {
  let value: unknown;
  try { value = JSON.parse(stdout); }
  catch { throw new ClaudeCliAdapterError('execution returned malformed JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClaudeCliAdapterError('execution returned a non-object JSON envelope');
  }
  const envelope = value as Record<string, unknown>;
  if (envelope.type !== 'result' || envelope.subtype !== 'success' || envelope.is_error !== false) {
    throw new ClaudeCliAdapterError('execution returned a non-success result envelope');
  }
  if (typeof envelope.result !== 'string' || !envelope.result.trim()) {
    throw new ClaudeCliAdapterError('execution returned a blank result');
  }
  if (!Number.isSafeInteger(envelope.num_turns) || (envelope.num_turns as number) <= 0 || (envelope.num_turns as number) > maxTurns) {
    throw new ClaudeCliAdapterError('execution returned an invalid turn count');
  }
  if (!Array.isArray(envelope.permission_denials) || envelope.permission_denials.length !== 0) {
    throw new ClaudeCliAdapterError('execution reported permission denials');
  }
  if (envelope.stop_reason === 'refusal') throw new ClaudeCliAdapterError('execution returned a refusal');
  if (envelope.total_cost_usd !== undefined && (!Number.isFinite(envelope.total_cost_usd) || (envelope.total_cost_usd as number) < 0)) {
    throw new ClaudeCliAdapterError('execution returned malformed client-estimated cost');
  }
  return envelope.result;
}

function budgetUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Create one exact Claude model adapter without launching or discovering any process. */
export function createClaudeCliAdapter(input: ClaudeCliAdapterConfig, processPort: ClaudeProcessPort): ProviderAdapter {
  if (!input?.modelConfig || typeof input.modelConfig !== 'object') throw new ClaudeCliAdapterError('modelConfig is required');
  if (!processPort || typeof processPort.execute !== 'function') throw new ClaudeCliAdapterError('process port is required');
  const executable = nonBlank(input.executable, 'executable');
  const modelKey = nonBlank(input.modelKey, 'modelKey');
  const adapterVersion = nonBlank(input.adapterVersion, 'adapterVersion');
  const expectedCliVersion = strictSemver(input.expectedCliVersion);
  const cwd = nonBlank(input.cwd, 'cwd');
  const timeoutMs = boundedPositiveInteger(input.timeoutMs, 'timeoutMs');
  const maxOutputBytes = boundedPositiveInteger(input.maxOutputBytes, 'maxOutputBytes');
  const maxTurns = boundedPositiveInteger(input.maxTurns, 'maxTurns', MAX_TURNS);
  const maxBudgetUsdCents = boundedPositiveInteger(input.maxBudgetUsdCents, 'maxBudgetUsdCents', MAX_BUDGET_CENTS);

  let identity;
  try { identity = identityFromModelConfig(input.modelConfig, modelKey, adapterVersion); }
  catch { throw new ClaudeCliAdapterError('modelKey is not registered'); }
  if (identity.provider !== 'claude') throw new ClaudeCliAdapterError('modelKey must resolve to provider "claude"');
  if (!SAFE_MODEL_ID.test(identity.modelId)) throw new ClaudeCliAdapterError('selected Claude model ID is not argv-safe');

  let reasoningEffort: ReasoningEffort;
  try { reasoningEffort = reasoningEffortForModel(input.modelConfig, modelKey, input.reasoningEffort); }
  catch { throw new ClaudeCliAdapterError('reasoningEffort is invalid or unsupported for the selected model'); }
  if (!(CLAUDE_EFFORTS as readonly string[]).includes(reasoningEffort)) {
    throw new ClaudeCliAdapterError(`reasoning effort "${reasoningEffort}" is not supported by Claude CLI`);
  }

  return {
    identity,
    async capabilityProbe() {
      const result = await processPort.execute({
        executable,
        args: ['--version'],
        stdin: '',
        cwd,
        timeoutMs,
        maxOutputBytes,
        shell: false,
      });
      assertProcessSucceeded(result, maxOutputBytes, 'capability probe');
      const match = VERSION_RE.exec(result.stdout);
      if (!match) throw new ClaudeCliAdapterError('capability probe did not return the strict Claude CLI version envelope');
      if (match[1] !== expectedCliVersion) throw new ClaudeCliAdapterError('capability probe version does not match expectedCliVersion');
      return {
        provider: 'claude',
        capabilities: [
          'execute-phase',
          'evidence-binding',
          `claude-cli-version:${match[1]}`,
          `model-selection:${identity.modelId}`,
          `reasoning-effort:${reasoningEffort}`,
          'tool-profile:fixture-edit-v1',
          'session-persistence:disabled',
          'cost-source:client-estimate-untrusted',
        ],
      };
    },
    async executePhase(prompt: string) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new ClaudeCliAdapterError('phase prompt must be non-blank');
      if (prompt.includes('\u0000')) throw new ClaudeCliAdapterError('phase prompt must not contain NUL');
      if (Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) throw new ClaudeCliAdapterError('phase prompt exceeds 32 KiB');
      const result = await processPort.execute({
        executable,
        args: [
          '-p', FIXED_QUERY,
          '--output-format', 'json',
          '--model', identity.modelId,
          '--max-turns', String(maxTurns),
          '--max-budget-usd', budgetUsd(maxBudgetUsdCents),
          '--safe-mode',
          '--permission-mode', 'dontAsk',
          '--tools', TOOL_PROFILE,
          '--allowed-tools', TOOL_PROFILE,
          '--disallowed-tools', 'mcp__*',
          '--no-chrome',
          '--no-session-persistence',
          ...(reasoningEffort === 'default' ? [] : ['--effort', reasoningEffort]),
        ],
        stdin: prompt,
        cwd,
        timeoutMs,
        maxOutputBytes,
        shell: false,
      });
      assertProcessSucceeded(result, maxOutputBytes, 'execution');
      return { output: parseSuccessEnvelope(result.stdout, maxTurns), cost: normalizeCost(undefined) };
    },
  };
}
