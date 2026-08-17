/**
 * Direct GitHub Copilot CLI adapter.
 *
 * The adapter never discovers credentials and never starts a shell. Authentication stays in the
 * official Copilot credential store or one of the CLI's documented environment variables. The
 * caller pins a registered model key and the expected observed CLI version.
 */
import { identityFromModelConfig, normalizeCost, type ProviderAdapter } from './multi-provider-backends';
import { reasoningEffortForModel, type ModelConfig, type ReasoningEffort } from './model-config';
import type { ProcessExecution, ProcessExecutor } from './codex-cli-adapter';

export interface CopilotCliAdapterConfig {
  executable: string;
  modelConfig: ModelConfig;
  modelKey: string;
  adapterVersion: string;
  expectedCliVersion: string;
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  reasoningEffort?: ReasoningEffort;
}

const SEMVER = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
const SEMVER_RE = new RegExp(`^${SEMVER}$`);
const VERSION_RE = new RegExp(`^GitHub Copilot CLI (${SEMVER})\\.\\r?\\n(?:Run 'copilot update' to check for updates\\.\\r?\\n?)?$`);

export class CopilotCliAdapterError extends Error {
  constructor(message: string) {
    super(`Copilot CLI adapter: ${message}`);
    this.name = 'CopilotCliAdapterError';
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new CopilotCliAdapterError(`${field} must be a non-blank control-character-free string`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CopilotCliAdapterError(`${field} must be a positive safe integer`);
  }
  return value as number;
}

function processSucceeded(result: ProcessExecution, maxOutputBytes: number, purpose: string): void {
  if (!result || result.timedOut) throw new CopilotCliAdapterError(`${purpose} timed out`);
  if (result.exitCode !== 0 || result.signal !== null) throw new CopilotCliAdapterError(`${purpose} exited nonzero or by signal`);
  if (
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string' ||
    result.outputCapped ||
    Buffer.byteLength(result.stdout, 'utf8') + Buffer.byteLength(result.stderr, 'utf8') > maxOutputBytes
  ) throw new CopilotCliAdapterError(`${purpose} exceeded output cap or returned non-text output`);
}

/** Create one pinned Copilot model adapter. Different model keys get independent trust records. */
export function createCopilotCliAdapter(input: CopilotCliAdapterConfig, executor: ProcessExecutor): ProviderAdapter {
  if (!input?.modelConfig || typeof input.modelConfig !== 'object') throw new CopilotCliAdapterError('modelConfig is required');
  if (!executor || typeof executor.execute !== 'function') throw new CopilotCliAdapterError('process executor is required');
  const executable = text(input.executable, 'executable');
  const modelKey = text(input.modelKey, 'modelKey');
  const adapterVersion = text(input.adapterVersion, 'adapterVersion');
  const expectedCliVersion = text(input.expectedCliVersion, 'expectedCliVersion');
  if (!SEMVER_RE.test(expectedCliVersion)) throw new CopilotCliAdapterError('expectedCliVersion must be strict semver');
  const timeoutMs = positiveInteger(input.timeoutMs, 'timeoutMs');
  const maxOutputBytes = positiveInteger(input.maxOutputBytes, 'maxOutputBytes');
  const cwd = input.cwd ? text(input.cwd, 'cwd') : process.cwd();
  let identity;
  try { identity = identityFromModelConfig(input.modelConfig, modelKey, adapterVersion); }
  catch (error) { throw new CopilotCliAdapterError(`modelKey is not registered: ${(error as Error).message}`); }
  if (identity.provider !== 'copilot') throw new CopilotCliAdapterError('modelKey must resolve to provider "copilot"');
  if (identity.modelId === 'github-copilot') throw new CopilotCliAdapterError('legacy Copilot selector is not an executable model id');
  let reasoningEffort: ReasoningEffort;
  try { reasoningEffort = reasoningEffortForModel(input.modelConfig, modelKey, input.reasoningEffort); }
  catch (error) { throw new CopilotCliAdapterError((error as Error).message); }

  return {
    identity,
    async capabilityProbe() {
      const result = await executor.execute({
        executable, args: ['--version'], stdin: '', cwd, timeoutMs, maxOutputBytes, shell: false,
      });
      processSucceeded(result, maxOutputBytes, 'capability probe');
      const match = VERSION_RE.exec(result.stdout);
      if (!match) throw new CopilotCliAdapterError('capability probe did not return the strict Copilot CLI version envelope');
      if (match[1] !== expectedCliVersion) throw new CopilotCliAdapterError('capability probe version does not match expectedCliVersion');
      return {
        provider: 'copilot',
        capabilities: ['execute-phase', 'evidence-binding', `copilot-cli-version:${match[1]}`, `model-selection:${identity.modelId}`, `reasoning-effort:${reasoningEffort}`],
      };
    },
    async executePhase(prompt: string) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new CopilotCliAdapterError('phase prompt must be non-blank');
      if (Buffer.byteLength(prompt, 'utf8') > 32_768) throw new CopilotCliAdapterError('phase prompt exceeds 32 KiB');
      const result = await executor.execute({
        executable,
        args: [
          '-p', prompt,
          '-s',
          '--model', identity.modelId,
          ...(reasoningEffort === 'default' ? [] : ['--reasoning-effort', reasoningEffort]),
          '--no-ask-user',
          '--allow-all-tools',
          '--deny-tool=shell,write',
          '--disable-builtin-mcps',
        ],
        stdin: '', cwd, timeoutMs, maxOutputBytes, shell: false,
      });
      processSucceeded(result, maxOutputBytes, 'execution');
      if (result.stderr.trim()) throw new CopilotCliAdapterError('execution emitted unexpected stderr');
      if (!result.stdout.trim()) throw new CopilotCliAdapterError('execution returned an empty response');
      return { output: result.stdout, cost: normalizeCost(undefined) };
    },
  };
}
