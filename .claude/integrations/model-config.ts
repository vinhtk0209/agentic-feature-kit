#!/usr/bin/env node
/**
 * model-config.ts — multi-model support (A-03).
 *
 * Declares the model the kit runs with: a `primary` plus a `fallback` chain, and a registry
 * mapping short keys (opus/sonnet/…) to concrete model ids + labels. Reads
 * `.claude/model-config.json`; falls back to a sane built-in default if the file is missing
 * or malformed, so nothing breaks when it's absent.
 *
 * Consumers:
 *   - eval-feature.ts tags scorecards with the model used (`--model`, default = primary).
 *   - dashboard /performance filters runs by model.
 *
 * CLI: `npx tsx .claude/integrations/model-config.ts` prints the resolved chain.
 */

import * as fs from 'fs';
import * as path from 'path';

export const REASONING_EFFORTS = ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

/** A model entry. `provider` groups models by backend (claude/copilot/codex/…); defaults to 'claude'. */
export interface ModelEntry { id: string; label: string; provider: string; reasoningEfforts: ReasoningEffort[] }
export interface ModelConfig {
  version: number;
  primary: string;
  fallback: string[];
  models: Record<string, ModelEntry>;
}

export const DEFAULT_PROVIDER = 'claude';

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  version: 2,
  primary: 'opus',
  fallback: ['sonnet', 'haiku'],
  models: {
    opus: { id: 'claude-opus-4-8', label: 'Opus 4.8', provider: 'claude', reasoningEfforts: ['default'] },
    sonnet: { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', provider: 'claude', reasoningEfforts: ['default'] },
    haiku: { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', provider: 'claude', reasoningEfforts: ['default'] },
    fable: { id: 'claude-fable-5', label: 'Fable 5', provider: 'claude', reasoningEfforts: ['default'] },
    copilot: { id: 'github-copilot', label: 'GitHub Copilot (legacy selector)', provider: 'copilot', reasoningEfforts: ['default'] },
    'copilot-gpt-5.3-codex': { id: 'gpt-5.3-codex', label: 'Copilot · GPT-5.3 Codex', provider: 'copilot', reasoningEfforts: ['default', 'low', 'medium', 'high', 'xhigh'] },
    'copilot-gpt-5.4': { id: 'gpt-5.4', label: 'Copilot · GPT-5.4', provider: 'copilot', reasoningEfforts: ['default', 'none', 'low', 'medium', 'high', 'xhigh'] },
    codex: { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'codex', reasoningEfforts: ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'] },
    'grok-4.5': { id: 'grok-4.5', label: 'Grok 4.5', provider: 'grok', reasoningEfforts: ['default'] },
  },
};

export function modelConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, '.claude', 'model-config.json');
}

/** Validate + normalize a parsed object into a ModelConfig (throws on a fatal shape error). */
export function normalizeConfig(raw: unknown): ModelConfig {
  if (!raw || typeof raw !== 'object') throw new Error('model-config must be an object');
  const o = raw as Record<string, unknown>;
  const models = o.models;
  if (!models || typeof models !== 'object') throw new Error('model-config.models is required');
  const reg: Record<string, ModelEntry> = {};
  for (const [key, v] of Object.entries(models as Record<string, unknown>)) {
    const e = v as Record<string, unknown>;
    if (!e || typeof e.id !== 'string') throw new Error(`model "${key}" needs a string id`);
    const rawReasoningEfforts = e.reasoningEfforts;
    let reasoningEfforts: ReasoningEffort[] = ['default'];
    if (rawReasoningEfforts !== undefined) {
      if (!Array.isArray(rawReasoningEfforts) || rawReasoningEfforts.length === 0) {
        throw new Error(`model "${key}" reasoningEfforts must be a non-empty array`);
      }
      const normalized = rawReasoningEfforts.map((effort) => {
        if (typeof effort !== 'string' || !(REASONING_EFFORTS as readonly string[]).includes(effort)) {
          throw new Error(`model "${key}" has unsupported reasoning effort`);
        }
        return effort as ReasoningEffort;
      });
      reasoningEfforts = [...new Set(normalized)];
      if (!reasoningEfforts.includes('default')) throw new Error(`model "${key}" reasoningEfforts must include default`);
    }
    reg[key] = {
      id: e.id,
      label: typeof e.label === 'string' ? e.label : key,
      provider: typeof e.provider === 'string' && e.provider.trim() ? e.provider : DEFAULT_PROVIDER,
      reasoningEfforts,
    };
  }
  const primary = typeof o.primary === 'string' ? o.primary : Object.keys(reg)[0];
  if (!primary || !reg[primary]) throw new Error(`primary "${primary}" is not in models`);
  const fallback = Array.isArray(o.fallback)
    ? o.fallback.filter((f): f is string => typeof f === 'string' && !!reg[f])
    : [];
  return { version: typeof o.version === 'number' ? o.version : 1, primary, fallback, models: reg };
}

/** Load the config from disk; on any error return the built-in default (never throws). */
export function loadModelConfig(cwd: string = process.cwd()): ModelConfig {
  const file = modelConfigPath(cwd);
  try {
    if (!fs.existsSync(file)) return DEFAULT_MODEL_CONFIG;
    return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return DEFAULT_MODEL_CONFIG;
  }
}

/** The ordered, deduped model keys to try: primary first, then fallbacks. */
export function resolveModelChain(cfg: ModelConfig): string[] {
  return [...new Set([cfg.primary, ...cfg.fallback])].filter((k) => cfg.models[k]);
}

/** Human label for a model key (falls back to the key itself). */
export function modelLabel(cfg: ModelConfig, key: string): string {
  return cfg.models[key]?.label ?? key;
}

/** Concrete model id for a key (e.g. "opus" → "claude-opus-4-8"), or undefined. */
export function modelId(cfg: ModelConfig, key: string): string | undefined {
  return cfg.models[key]?.id;
}

/** Provider of a model key (e.g. "opus" → "claude", "copilot" → "copilot"). */
export function providerOf(cfg: ModelConfig, key: string): string | undefined {
  return cfg.models[key]?.provider;
}

/** Validate a requested effort against the exact selected model; missing means provider default. */
export function reasoningEffortForModel(cfg: ModelConfig, key: string, requested: unknown = 'default'): ReasoningEffort {
  if (typeof requested !== 'string' || !(REASONING_EFFORTS as readonly string[]).includes(requested)) {
    throw new Error(`reasoning effort is invalid for model "${key}"`);
  }
  const model = cfg.models[key];
  if (!model || !Array.isArray(model.reasoningEfforts) || !model.reasoningEfforts.includes(requested as ReasoningEffort)) {
    throw new Error(`reasoning effort "${requested}" is not supported by model "${key}"`);
  }
  return requested as ReasoningEffort;
}

/** Distinct providers configured, in first-seen order. */
export function providersOf(cfg: ModelConfig): string[] {
  return [...new Set(Object.values(cfg.models).map((m) => m.provider))];
}

/** Model keys grouped by provider. */
export function modelsByProvider(cfg: ModelConfig): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, e] of Object.entries(cfg.models)) (out[e.provider] ??= []).push(key);
  return out;
}

if (process.argv[1] && /model-config\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const cfg = loadModelConfig();
  const chain = resolveModelChain(cfg);
  console.log(`\n🤖 Model chain (primary → fallback):`);
  chain.forEach((k, i) => console.log(`  ${i === 0 ? '★' : ' '} ${k.padEnd(8)} ${modelLabel(cfg, k)}  [${providerOf(cfg, k)}]  (${modelId(cfg, k)})`));
  const byProv = modelsByProvider(cfg);
  console.log(`\nProviders: ${providersOf(cfg).map((p) => `${p} (${byProv[p].join(', ')})`).join(' · ')}`);
  console.log('');
}
