#!/usr/bin/env node
/**
 * I2-C — explicit, reproducible Codex CLI smoke.
 *
 * This is intentionally the only live-capable I2 entrypoint. It never reads environment
 * variables or credentials: an operator must explicitly provide every transport selector and
 * `--confirm-live`. The test suite injects a ProcessExecutor, so it never starts Codex.
 */
import * as path from 'path';
import { createCodexCliAdapter, createNodeProcessExecutor, type ProcessExecutor } from '../.claude/integrations/codex-cli-adapter';
import { buildBundle, verifyBackendBoundBundle } from '../.claude/integrations/evidence-bundle';
import {
  backendKey,
  createEvidenceBinding,
  normalizeCost,
  ProviderRegistry,
  type BackendCost,
  type GateVerdict,
} from '../.claude/integrations/multi-provider-backends';
import { loadModelConfig, type ModelConfig } from '../.claude/integrations/model-config';

export const I2_CODEX_LIVE_OK = 'I2_CODEX_LIVE_OK';
export const I2_CODEX_LIVE_PROMPT = 'Reply with exactly I2_CODEX_LIVE_OK and nothing else.';
export const I2_CODEX_SMOKE_FEATURE = 'i2-codex-live-smoke';
export const I2_CODEX_SMOKE_ADAPTER_VERSION = 'i2-codex-live-smoke-v1';
export const I2_CODEX_SMOKE_RESULT_SENTINEL = '@@I2_CODEX_SMOKE_RESULT@@';

const SMOKE_TIMEOUT_MS = 60_000;
const SMOKE_MAX_OUTPUT_BYTES = 1_000_000;

export interface SmokeResult {
  schemaVersion: 1;
  pass: boolean;
  provider: string | null;
  modelKey: string | null;
  modelId: string | null;
  adapterVersion: string | null;
  /** Observed only after a trusted probe has exactly matched the requested version. */
  cliVersion: string | null;
  costStatus: 'known' | 'unknown' | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  /** Always relative to the caller-selected evidence root. */
  bundlePath: string | null;
  bundleHash: string | null;
  strictValid: boolean;
}

export interface SmokeDependencies {
  /** Tests inject this; production creates the direct Node spawn executor only after confirm. */
  executor?: ProcessExecutor;
  modelConfigLoader?: (cwd: string) => ModelConfig;
  cwd?: string;
}

interface SmokeOptions {
  confirmed: boolean;
  executable?: string;
  expectedCliVersion?: string;
  evidenceRoot?: string;
  modelKey: string;
}

function emptyResult(): SmokeResult {
  return {
    schemaVersion: 1,
    pass: false,
    provider: null,
    modelKey: null,
    modelId: null,
    adapterVersion: null,
    cliVersion: null,
    costStatus: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    bundlePath: null,
    bundleHash: null,
    strictValid: false,
  };
}

function withCost(result: SmokeResult, cost: BackendCost): SmokeResult {
  return {
    ...result,
    costStatus: cost.status,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costUsd: cost.costUsd,
  };
}

function parseArgs(argv: readonly string[]): SmokeOptions {
  const options: SmokeOptions = { confirmed: false, modelKey: 'codex' };
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--confirm-live') {
      if (seen.has(arg)) throw new Error('duplicate --confirm-live');
      seen.add(arg);
      options.confirmed = true;
      continue;
    }
    if (!['--executable', '--expected-cli-version', '--evidence-root', '--model-key'].includes(arg)) {
      throw new Error('unknown smoke CLI argument');
    }
    if (seen.has(arg)) throw new Error(`duplicate ${arg}`);
    const value = argv[index + 1];
    if (typeof value !== 'string' || !value.trim() || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    seen.add(arg);
    index += 1;
    if (arg === '--executable') options.executable = value;
    if (arg === '--expected-cli-version') options.expectedCliVersion = value;
    if (arg === '--evidence-root') options.evidenceRoot = value;
    if (arg === '--model-key') options.modelKey = value;
  }
  return options;
}

function requireOperatorInputs(options: SmokeOptions): asserts options is SmokeOptions & Required<Pick<SmokeOptions, 'executable' | 'expectedCliVersion' | 'evidenceRoot'>> {
  if (!options.confirmed) throw new Error('live smoke requires --confirm-live');
  if (!options.executable || !options.expectedCliVersion || !options.evidenceRoot) throw new Error('missing required live smoke option');
}

/** The exact backend-neutral gate shared by every smoke execution. */
export async function exactI2CodexLiveGate(output: string): Promise<GateVerdict> {
  return {
    passed: typeof output === 'string' && output.trim() === I2_CODEX_LIVE_OK,
    detail: 'trimmed response must equal the fixed I2 smoke sentinel',
  };
}

/** Serialize the only operator-facing stdout record. It deliberately contains no transport output. */
export function formatI2CodexSmokeResult(result: SmokeResult): string {
  return `${I2_CODEX_SMOKE_RESULT_SENTINEL}${JSON.stringify(result)}`;
}

/**
 * Execute the smoke contract. Failures return a safe, non-secret result and never write evidence
 * before the deterministic gate passes. Callers that want CLI output should use the wrapper below.
 */
export async function executeI2CodexLiveSmoke(argv: readonly string[], dependencies: SmokeDependencies = {}): Promise<SmokeResult> {
  let result = emptyResult();
  try {
    const options = parseArgs(argv);
    // This check deliberately precedes config loading, executor construction, and any write.
    requireOperatorInputs(options);
    const cwd = dependencies.cwd ?? process.cwd();
    const evidenceRoot = path.resolve(options.evidenceRoot);
    const modelConfig = (dependencies.modelConfigLoader ?? loadModelConfig)(cwd);
    const executor = dependencies.executor ?? createNodeProcessExecutor();
    const adapter = createCodexCliAdapter({
      executable: options.executable,
      modelConfig,
      modelKey: options.modelKey,
      adapterVersion: I2_CODEX_SMOKE_ADAPTER_VERSION,
      expectedCliVersion: options.expectedCliVersion,
      timeoutMs: SMOKE_TIMEOUT_MS,
      maxOutputBytes: SMOKE_MAX_OUTPUT_BYTES,
      cwd,
    }, executor);
    result = {
      ...result,
      provider: adapter.identity.provider,
      modelKey: adapter.identity.modelKey,
      modelId: adapter.identity.modelId,
      adapterVersion: adapter.identity.adapterVersion,
    };
    const registry = new ProviderRegistry([adapter]);
    const key = backendKey(adapter.identity);
    const trusted = await registry.trust(key);
    // capabilityProbe accepts only an exact expected version, so this is an observed bound value.
    result = { ...result, cliVersion: options.expectedCliVersion };
    const execution = await registry.execute(key, I2_CODEX_LIVE_PROMPT, exactI2CodexLiveGate);
    const cost = execution.cost ?? normalizeCost(undefined);
    result = withCost(result, cost);
    if (!execution.gate.passed) throw new Error('fixed smoke gate rejected output');

    const binding = createEvidenceBinding({ trusted, cost });
    const manifest = buildBundle({
      featureName: I2_CODEX_SMOKE_FEATURE,
      phase: 'B0',
      cwd: evidenceRoot,
      // The gate permits exactly this sentinel after trim, so only a fixed sanitized value persists.
      transcripts: { 'codex-live-smoke-output': execution.output.trim() },
      backendBinding: binding,
    });
    const strict = verifyBackendBoundBundle(I2_CODEX_SMOKE_FEATURE, 'B0', evidenceRoot);
    if (!strict.valid) throw new Error('strict backend-bound evidence verification failed');
    return {
      ...result,
      pass: true,
      bundlePath: path.posix.join('docs', 'specs', I2_CODEX_SMOKE_FEATURE, '.evidence', 'B0'),
      bundleHash: manifest.manifestHash,
      strictValid: true,
    };
  } catch {
    // Do not disclose CLI stdout/stderr, auth state, or an absolute filesystem path.
    return result;
  }
}

/** Emit exactly one sentinel record regardless of pass/fail, then return the appropriate CLI exit. */
export async function runI2CodexLiveSmokeCli(
  argv: readonly string[],
  writeLine: (line: string) => void = console.log,
  dependencies: SmokeDependencies = {},
): Promise<number> {
  const result = await executeI2CodexLiveSmoke(argv, dependencies);
  writeLine(formatI2CodexSmokeResult(result));
  return result.pass ? 0 : 1;
}

if (require.main === module) {
  runI2CodexLiveSmokeCli(process.argv.slice(2)).then((exitCode) => { process.exitCode = exitCode; });
}
