/**
 * I2-A — pure multi-provider trust foundation.
 *
 * This module deliberately contains no CLI spawn, credential lookup, network call, telemetry
 * upload, or evidence-bundle write. A future provider transport supplies ProviderAdapter through
 * dependency injection only after its capability probe has established trust.
 */
import { createHash } from 'crypto';
import { modelId, providerOf, type ModelConfig } from './model-config';

export interface BackendIdentity {
  provider: string;
  modelKey: string;
  modelId: string;
  adapterVersion: string;
}

export interface CapabilityProbe {
  provider: string;
  capabilities: readonly string[];
}

export interface ProviderAdapter {
  readonly identity: BackendIdentity;
  capabilityProbe(): Promise<CapabilityProbe>;
  executePhase(prompt: string): Promise<{ output: string }>;
}

export interface GateVerdict {
  passed: boolean;
  detail: string;
}

export interface TrustedBackend {
  identity: BackendIdentity;
  capabilities: readonly string[];
  capabilityHash: string;
}

export type BackendCost =
  | { status: 'unknown'; inputTokens: null; outputTokens: null; costUsd: null }
  | { status: 'known'; inputTokens: number; outputTokens: number; costUsd: number };

export interface EvidenceBackendBinding {
  schemaVersion: 1;
  identity: BackendIdentity;
  capabilityHash: string;
  cost: BackendCost;
  bindingHash: string;
}

const REQUIRED_CAPABILITIES = ['execute-phase', 'evidence-binding'] as const;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function identityText(identity: BackendIdentity): string {
  return [identity.provider, identity.modelKey, identity.modelId, identity.adapterVersion].join('\n');
}

function capabilityText(identity: BackendIdentity, capabilities: readonly string[]): string {
  return `${identityText(identity)}\n${[...new Set(capabilities)].sort().join('\n')}`;
}

function bindingText(input: Omit<EvidenceBackendBinding, 'bindingHash'>): string {
  const cost = input.cost;
  return [
    String(input.schemaVersion),
    identityText(input.identity),
    input.capabilityHash,
    cost.status,
    String(cost.inputTokens),
    String(cost.outputTokens),
    String(cost.costUsd),
  ].join('\n');
}

function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`backend ${field} must be non-empty`);
  return normalized;
}

/**
 * Canonical registry key. Percent encoding keeps the provider/model-key boundary
 * unambiguous while allowing multiple configured models from one provider.
 */
export function backendKey(identity: Pick<BackendIdentity, 'provider' | 'modelKey'>): string {
  return `${encodeURIComponent(nonBlank(identity.provider, 'provider'))}:${encodeURIComponent(nonBlank(identity.modelKey, 'model key'))}`;
}

/** Derive one immutable backend identity from the existing provider-aware model registry. */
export function identityFromModelConfig(config: ModelConfig, modelKey: string, adapterVersion: string): BackendIdentity {
  const provider = providerOf(config, modelKey);
  const id = modelId(config, modelKey);
  if (!provider || !id) throw new Error(`model key "${modelKey}" is not registered`);
  return {
    provider: nonBlank(provider, 'provider'),
    modelKey: nonBlank(modelKey, 'model key'),
    modelId: nonBlank(id, 'model id'),
    adapterVersion: nonBlank(adapterVersion, 'adapter version'),
  };
}

/** Preserve the epistemic distinction: an observed zero is valid; no measurement is unknown. */
export function normalizeCost(input: { inputTokens: number; outputTokens: number; costUsd: number } | undefined): BackendCost {
  if (input === undefined) {
    return { status: 'unknown', inputTokens: null, outputTokens: null, costUsd: null };
  }
  if (
    !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 0 ||
    !Number.isSafeInteger(input.outputTokens) || input.outputTokens < 0 ||
    !Number.isFinite(input.costUsd) || input.costUsd < 0
  ) throw new Error('backend cost measurement is malformed');
  return { status: 'known', inputTokens: input.inputTokens, outputTokens: input.outputTokens, costUsd: input.costUsd };
}

/** Create a tamper-evident identity/cost binding for a future evidence-bundle schema extension. */
export function createEvidenceBinding(input: { trusted: TrustedBackend; cost: BackendCost }): EvidenceBackendBinding {
  if (!SHA256_HEX.test(input.trusted.capabilityHash)) throw new Error('backend capability hash is malformed');
  const cost = input.cost.status === 'known' ? normalizeCost(input.cost) : normalizeCost(undefined);
  const partial: Omit<EvidenceBackendBinding, 'bindingHash'> = {
    schemaVersion: 1,
    identity: { ...input.trusted.identity },
    capabilityHash: input.trusted.capabilityHash,
    cost,
  };
  return { ...partial, bindingHash: hash(bindingText(partial)) };
}

export function verifyEvidenceBinding(binding: EvidenceBackendBinding): boolean {
  try {
    if (binding.schemaVersion !== 1 || !SHA256_HEX.test(binding.capabilityHash) || !SHA256_HEX.test(binding.bindingHash)) return false;
    nonBlank(binding.identity.provider, 'provider');
    nonBlank(binding.identity.modelKey, 'model key');
    nonBlank(binding.identity.modelId, 'model id');
    nonBlank(binding.identity.adapterVersion, 'adapter version');
    const costStatus = (binding.cost as { status?: unknown }).status;
    const normalizedCost = costStatus === 'known'
      ? normalizeCost(binding.cost as Extract<BackendCost, { status: 'known' }>)
      : costStatus === 'unknown' ? normalizeCost(undefined) : undefined;
    if (!normalizedCost) return false;
    if (JSON.stringify(normalizedCost) !== JSON.stringify(binding.cost)) return false;
    const partial: Omit<EvidenceBackendBinding, 'bindingHash'> = {
      schemaVersion: binding.schemaVersion,
      identity: binding.identity,
      capabilityHash: binding.capabilityHash,
      cost: binding.cost,
    };
    return hash(bindingText(partial)) === binding.bindingHash;
  } catch {
    return false;
  }
}

/** Registry that makes successful capability probing a prerequisite to any backend execution. */
export class ProviderRegistry {
  private readonly adapters = new Map<string, { adapter: ProviderAdapter; registeredIdentity: string }>();
  private readonly trusted = new Map<string, TrustedBackend>();

  constructor(adapters: readonly ProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ProviderAdapter): void {
    nonBlank(adapter.identity.modelId, 'model id');
    nonBlank(adapter.identity.adapterVersion, 'adapter version');
    const key = backendKey(adapter.identity);
    if (this.adapters.has(key)) throw new Error(`backend "${key}" is already registered`);
    this.adapters.set(key, { adapter, registeredIdentity: identityText(adapter.identity) });
  }

  async trust(key: string): Promise<TrustedBackend> {
    const registered = this.adapters.get(key);
    if (!registered) throw new Error(`backend "${key}" is not registered`);
    const { adapter } = registered;
    this.assertRegisteredIdentity(key, registered);
    const probe = await adapter.capabilityProbe();
    this.assertRegisteredIdentity(key, registered);
    if (!probe || typeof probe.provider !== 'string' || !Array.isArray(probe.capabilities) || !probe.capabilities.every((capability) => typeof capability === 'string' && capability.trim().length > 0)) {
      throw new Error(`backend "${key}" capability probe is malformed`);
    }
    if (probe.provider !== adapter.identity.provider) throw new Error(`backend "${key}" capability identity mismatch`);
    const capabilities = [...new Set(probe.capabilities)].sort();
    if (!REQUIRED_CAPABILITIES.every((capability) => capabilities.includes(capability))) {
      throw new Error(`backend "${key}" capability probe is insufficient`);
    }
    const trusted: TrustedBackend = {
      identity: { ...adapter.identity },
      capabilities,
      capabilityHash: hash(capabilityText(adapter.identity, capabilities)),
    };
    this.trusted.set(key, trusted);
    return trusted;
  }

  getTrusted(key: string): TrustedBackend | undefined {
    const trusted = this.trusted.get(key);
    return trusted ? { ...trusted, identity: { ...trusted.identity }, capabilities: [...trusted.capabilities] } : undefined;
  }

  async execute(key: string, prompt: string, gate: (output: string) => Promise<GateVerdict>): Promise<{ trusted: TrustedBackend; output: string; gate: GateVerdict }> {
    const registered = this.adapters.get(key);
    const trusted = this.trusted.get(key);
    if (!registered || !trusted) throw new Error(`backend "${key}" is not trusted`);
    const { adapter } = registered;
    this.assertRegisteredIdentity(key, registered);
    if (identityText(adapter.identity) !== identityText(trusted.identity)) throw new Error(`backend "${key}" identity changed after trust`);
    const result = await adapter.executePhase(prompt);
    this.assertRegisteredIdentity(key, registered);
    if (!result || typeof result.output !== 'string') throw new Error(`backend "${key}" execution output is malformed`);
    // The caller supplies exactly the same deterministic gate contract for every backend.
    const gateVerdict = await gate(result.output);
    return { trusted: { ...trusted, identity: { ...trusted.identity }, capabilities: [...trusted.capabilities] }, output: result.output, gate: gateVerdict };
  }

  private assertRegisteredIdentity(key: string, registered: { adapter: ProviderAdapter; registeredIdentity: string }): void {
    if (backendKey(registered.adapter.identity) !== key || identityText(registered.adapter.identity) !== registered.registeredIdentity) {
      throw new Error(`backend "${key}" identity changed after registration`);
    }
  }
}
