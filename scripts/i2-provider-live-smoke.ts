#!/usr/bin/env node
/** Explicit provider-neutral I2 live smoke for Codex CLI, Copilot CLI, and xAI Grok. */
import * as path from 'path';
import {
  createCodexCliAdapter,
  createNodeProcessExecutor,
  type ProcessExecutor,
} from '../.claude/integrations/codex-cli-adapter';
import { createCopilotCliAdapter } from '../.claude/integrations/copilot-cli-adapter';
import {
  createGrokApiAdapter,
  createGrokFetchExecutor,
  type GrokHttpExecutor,
} from '../.claude/integrations/grok-api-adapter';
import { buildBundle, verifyBackendBoundBundle } from '../.claude/integrations/evidence-bundle';
import {
  backendKey,
  createEvidenceBinding,
  normalizeCost,
  ProviderRegistry,
  type BackendCost,
  type GateVerdict,
  type ProviderAdapter,
} from '../.claude/integrations/multi-provider-backends';
import { loadModelConfig, type ModelConfig } from '../.claude/integrations/model-config';

export const I2_PROVIDER_LIVE_OK = 'I2_PROVIDER_LIVE_OK';
export const I2_PROVIDER_LIVE_PROMPT = 'Reply with exactly I2_PROVIDER_LIVE_OK and nothing else.';
export const I2_PROVIDER_SMOKE_RESULT_SENTINEL = '@@I2_PROVIDER_SMOKE_RESULT@@';

const SMOKE_TIMEOUT_MS = 60_000;
const SMOKE_MAX_OUTPUT_BYTES = 1_000_000;
type SmokeProvider = 'codex' | 'copilot' | 'grok';

export interface ProviderSmokeResult {
  schemaVersion: 1;
  pass: boolean;
  provider: SmokeProvider | null;
  modelKey: string | null;
  modelId: string | null;
  adapterVersion: string | null;
  runtimeVersion: string | null;
  costStatus: 'known' | 'unknown' | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  bundlePath: string | null;
  bundleHash: string | null;
  strictValid: boolean;
}

export interface ProviderSmokeDependencies {
  processExecutor?: ProcessExecutor;
  httpExecutor?: GrokHttpExecutor;
  modelConfigLoader?: (cwd: string) => ModelConfig;
  apiKeyLoader?: () => string | undefined;
  cwd?: string;
}

interface SmokeOptions {
  confirmed: boolean;
  provider?: SmokeProvider;
  modelKey?: string;
  evidenceRoot?: string;
  executable?: string;
  expectedCliVersion?: string;
  baseUrl?: string;
}

function emptyResult(): ProviderSmokeResult {
  return {
    schemaVersion: 1,
    pass: false,
    provider: null,
    modelKey: null,
    modelId: null,
    adapterVersion: null,
    runtimeVersion: null,
    costStatus: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    bundlePath: null,
    bundleHash: null,
    strictValid: false,
  };
}

function withCost(result: ProviderSmokeResult, cost: BackendCost): ProviderSmokeResult {
  return {
    ...result,
    costStatus: cost.status,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costUsd: cost.costUsd,
  };
}

function parseArgs(argv: readonly string[]): SmokeOptions {
  const options: SmokeOptions = { confirmed: false };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--confirm-live') {
      if (seen.has(arg)) throw new Error('duplicate --confirm-live');
      seen.add(arg);
      options.confirmed = true;
      continue;
    }
    if (!['--provider', '--model-key', '--evidence-root', '--executable', '--expected-cli-version', '--base-url'].includes(arg)) {
      throw new Error('unknown provider smoke CLI argument');
    }
    if (seen.has(arg)) throw new Error(`duplicate ${arg}`);
    const value = argv[index + 1];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    seen.add(arg);
    index += 1;
    if (arg === '--provider') {
      if (value !== 'codex' && value !== 'copilot' && value !== 'grok') throw new Error('unsupported provider');
      options.provider = value;
    }
    if (arg === '--model-key') options.modelKey = value;
    if (arg === '--evidence-root') options.evidenceRoot = value;
    if (arg === '--executable') options.executable = value;
    if (arg === '--expected-cli-version') options.expectedCliVersion = value;
    if (arg === '--base-url') options.baseUrl = value;
  }
  return options;
}

function requireOperatorInputs(options: SmokeOptions): asserts options is SmokeOptions & Required<Pick<SmokeOptions, 'provider' | 'modelKey' | 'evidenceRoot'>> {
  if (!options.confirmed) throw new Error('live smoke requires --confirm-live');
  if (!options.provider || !options.modelKey || !options.evidenceRoot) throw new Error('missing common live smoke option');
  if (options.provider === 'grok') {
    if (!options.baseUrl) throw new Error('Grok live smoke requires --base-url');
    if (options.executable || options.expectedCliVersion) throw new Error('Grok live smoke rejects CLI options');
  } else {
    if (!options.executable || !options.expectedCliVersion) throw new Error('CLI live smoke requires executable and expected version');
    if (options.baseUrl) throw new Error('CLI live smoke rejects --base-url');
  }
}

function adapterVersion(provider: SmokeProvider): string {
  return `i2-provider-live-smoke-${provider}-v1`;
}

function featureName(provider: SmokeProvider): string {
  return `i2-provider-live-smoke-${provider}`;
}

function createAdapter(
  options: SmokeOptions & Required<Pick<SmokeOptions, 'provider' | 'modelKey' | 'evidenceRoot'>>,
  modelConfig: ModelConfig,
  cwd: string,
  dependencies: ProviderSmokeDependencies,
): ProviderAdapter {
  if (options.provider === 'grok') {
    const apiKey = (dependencies.apiKeyLoader ?? (() => process.env.XAI_API_KEY))();
    return createGrokApiAdapter({
      baseUrl: options.baseUrl!,
      apiKey: apiKey ?? '',
      modelConfig,
      modelKey: options.modelKey,
      adapterVersion: adapterVersion(options.provider),
      timeoutMs: SMOKE_TIMEOUT_MS,
      maxOutputBytes: SMOKE_MAX_OUTPUT_BYTES,
    }, dependencies.httpExecutor ?? createGrokFetchExecutor());
  }
  const processExecutor = dependencies.processExecutor ?? createNodeProcessExecutor();
  const common = {
    executable: options.executable!,
    modelConfig,
    modelKey: options.modelKey,
    adapterVersion: adapterVersion(options.provider),
    expectedCliVersion: options.expectedCliVersion!,
    timeoutMs: SMOKE_TIMEOUT_MS,
    maxOutputBytes: SMOKE_MAX_OUTPUT_BYTES,
    cwd,
  };
  return options.provider === 'codex'
    ? createCodexCliAdapter(common, processExecutor)
    : createCopilotCliAdapter(common, processExecutor);
}

/** The exact backend-neutral gate object shared by all providers. */
export async function exactI2ProviderLiveGate(output: string): Promise<GateVerdict> {
  return {
    passed: typeof output === 'string' && output.trim() === I2_PROVIDER_LIVE_OK,
    detail: 'trimmed response must equal the fixed provider-neutral I2 smoke sentinel',
  };
}

export function formatI2ProviderSmokeResult(result: ProviderSmokeResult): string {
  return `${I2_PROVIDER_SMOKE_RESULT_SENTINEL}${JSON.stringify(result)}`;
}

export async function executeI2ProviderLiveSmoke(
  argv: readonly string[],
  dependencies: ProviderSmokeDependencies = {},
): Promise<ProviderSmokeResult> {
  let result = emptyResult();
  try {
    const options = parseArgs(argv);
    requireOperatorInputs(options);
    const cwd = dependencies.cwd ?? process.cwd();
    const evidenceRoot = path.resolve(options.evidenceRoot);
    const modelConfig = (dependencies.modelConfigLoader ?? loadModelConfig)(cwd);
    const adapter = createAdapter(options, modelConfig, cwd, dependencies);
    result = {
      ...result,
      provider: options.provider,
      modelKey: adapter.identity.modelKey,
      modelId: adapter.identity.modelId,
      adapterVersion: adapter.identity.adapterVersion,
      runtimeVersion: options.provider === 'grok' ? null : options.expectedCliVersion!,
    };
    const registry = new ProviderRegistry([adapter]);
    const key = backendKey(adapter.identity);
    const trusted = await registry.trust(key);
    const execution = await registry.execute(key, I2_PROVIDER_LIVE_PROMPT, exactI2ProviderLiveGate);
    const cost = execution.cost ?? normalizeCost(undefined);
    result = withCost(result, cost);
    if (!execution.gate.passed) throw new Error('fixed provider smoke gate rejected output');

    const binding = createEvidenceBinding({ trusted, cost });
    const feature = featureName(options.provider);
    const manifest = buildBundle({
      featureName: feature,
      phase: 'B0',
      cwd: evidenceRoot,
      transcripts: { [`${options.provider}-live-smoke-output`]: execution.output.trim() },
      backendBinding: binding,
    });
    const strict = verifyBackendBoundBundle(feature, 'B0', evidenceRoot);
    if (!strict.valid) throw new Error('strict backend-bound provider evidence verification failed');
    return {
      ...result,
      pass: true,
      bundlePath: path.posix.join('docs', 'specs', feature, '.evidence', 'B0'),
      bundleHash: manifest.manifestHash,
      strictValid: true,
    };
  } catch {
    return result;
  }
}

export async function runI2ProviderLiveSmokeCli(
  argv: readonly string[],
  writeLine: (line: string) => void = console.log,
  dependencies: ProviderSmokeDependencies = {},
): Promise<number> {
  const result = await executeI2ProviderLiveSmoke(argv, dependencies);
  writeLine(formatI2ProviderSmokeResult(result));
  return result.pass ? 0 : 1;
}

if (require.main === module) {
  runI2ProviderLiveSmokeCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
