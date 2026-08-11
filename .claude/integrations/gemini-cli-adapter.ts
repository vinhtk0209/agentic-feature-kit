/** Direct Google Gemini CLI adapter using native Node plus the package's absolute JS entrypoint. */
import * as path from 'path';
import { identityFromModelConfig, normalizeCost, type ProviderAdapter } from './multi-provider-backends';
import { reasoningEffortForModel, type ModelConfig, type ReasoningEffort } from './model-config';
import type { ProcessExecution, ProcessExecutor } from './codex-cli-adapter';

export interface GeminiCliAdapterConfig {
  executable: string;
  entrypoint: string;
  modelConfig: ModelConfig;
  modelKey: string;
  adapterVersion: string;
  expectedCliVersion: string;
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  reasoningEffort?: ReasoningEffort;
}

const SEMVER_RE = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export class GeminiCliAdapterError extends Error {
  constructor(message: string) {
    super(`Gemini CLI adapter: ${message}`);
    this.name = 'GeminiCliAdapterError';
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new GeminiCliAdapterError(`${field} must be a non-blank control-character-free string`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new GeminiCliAdapterError(`${field} must be a positive safe integer`);
  }
  return value as number;
}

function processSucceeded(result: ProcessExecution, maxOutputBytes: number, purpose: string): void {
  if (!result || result.timedOut) throw new GeminiCliAdapterError(`${purpose} timed out`);
  if (result.exitCode !== 0 || result.signal !== null) throw new GeminiCliAdapterError(`${purpose} exited nonzero or by signal`);
  if (
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string' ||
    result.outputCapped ||
    Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') > maxOutputBytes
  ) throw new GeminiCliAdapterError(`${purpose} exceeded output cap or returned non-text output`);
}

function strictEntrypoint(value: unknown): string {
  const entrypoint = text(value, 'entrypoint');
  if (!path.isAbsolute(entrypoint) || !['.js', '.mjs', '.cjs'].includes(path.extname(entrypoint).toLowerCase())) {
    throw new GeminiCliAdapterError('entrypoint must be an absolute JavaScript module path');
  }
  return path.resolve(entrypoint);
}

function parseExecution(stdout: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); } catch { throw new GeminiCliAdapterError('execution returned malformed JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new GeminiCliAdapterError('execution returned malformed JSON object');
  const root = parsed as Record<string, unknown>;
  if (root.error !== undefined && root.error !== null) throw new GeminiCliAdapterError('execution returned an error envelope');
  if (typeof root.response !== 'string' || !root.response.trim()) throw new GeminiCliAdapterError('execution response is missing or blank');
  if (!root.stats || typeof root.stats !== 'object' || Array.isArray(root.stats)) throw new GeminiCliAdapterError('execution stats object is missing');
  return root.response;
}

export function createGeminiCliAdapter(input: GeminiCliAdapterConfig, executor: ProcessExecutor): ProviderAdapter {
  if (!input?.modelConfig || typeof input.modelConfig !== 'object') throw new GeminiCliAdapterError('modelConfig is required');
  if (!executor || typeof executor.execute !== 'function') throw new GeminiCliAdapterError('process executor is required');
  const executable = text(input.executable, 'executable');
  const entrypoint = strictEntrypoint(input.entrypoint);
  const modelKey = text(input.modelKey, 'modelKey');
  const adapterVersion = text(input.adapterVersion, 'adapterVersion');
  const expectedCliVersion = text(input.expectedCliVersion, 'expectedCliVersion');
  if (!SEMVER_RE.test(expectedCliVersion)) throw new GeminiCliAdapterError('expectedCliVersion must be strict semver');
  const timeoutMs = positiveInteger(input.timeoutMs, 'timeoutMs');
  const maxOutputBytes = positiveInteger(input.maxOutputBytes, 'maxOutputBytes');
  const cwd = input.cwd ? text(input.cwd, 'cwd') : process.cwd();
  let identity;
  try { identity = identityFromModelConfig(input.modelConfig, modelKey, adapterVersion); }
  catch (error) { throw new GeminiCliAdapterError(`modelKey is not registered: ${(error as Error).message}`); }
  if (identity.provider !== 'gemini') throw new GeminiCliAdapterError('modelKey must resolve to provider "gemini"');
  let reasoningEffort: ReasoningEffort;
  try { reasoningEffort = reasoningEffortForModel(input.modelConfig, modelKey, input.reasoningEffort); }
  catch (error) { throw new GeminiCliAdapterError((error as Error).message); }

  return {
    identity,
    async capabilityProbe() {
      const result = await executor.execute({
        executable, args: [entrypoint, '--version'], stdin: '', cwd, timeoutMs, maxOutputBytes, shell: false,
      });
      processSucceeded(result, maxOutputBytes, 'capability probe');
      if (result.stderr.trim()) throw new GeminiCliAdapterError('capability probe emitted unexpected stderr');
      const observed = result.stdout.trim();
      if (!SEMVER_RE.test(observed) || observed !== expectedCliVersion) {
        throw new GeminiCliAdapterError('capability probe version does not match expectedCliVersion');
      }
      return {
        provider: 'gemini',
        capabilities: ['execute-phase', 'evidence-binding', `gemini-cli-version:${observed}`, `model-selection:${identity.modelId}`, `reasoning-effort:${reasoningEffort}`, 'headless-json'],
      };
    },
    async executePhase(prompt: string) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new GeminiCliAdapterError('phase prompt must be non-blank');
      if (Buffer.byteLength(prompt, 'utf8') > 32_768) throw new GeminiCliAdapterError('phase prompt exceeds 32 KiB');
      const result = await executor.execute({
        executable,
        args: [
          entrypoint,
          '-p', prompt,
          '--output-format', 'json',
          '--model', identity.modelId,
          '--approval-mode', 'plan',
          '--skip-trust',
        ],
        stdin: '', cwd, timeoutMs, maxOutputBytes, shell: false,
      });
      processSucceeded(result, maxOutputBytes, 'execution');
      if (result.stderr.trim()) throw new GeminiCliAdapterError('execution emitted unexpected stderr');
      return { output: parseExecution(result.stdout), cost: normalizeCost(undefined) };
    },
  };
}
