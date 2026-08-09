/** D1/D1.5 consume the D0.5 handoff only; they never read a spec path or contact Figma. */
import * as fs from 'fs';
import { createMatcher, FigmaNode, MatchOptions, MatchResult } from './design-matcher';
import { DesignModel } from './design-source';
import { DESIGN_MODEL_SCHEMA_VERSION, StoredDesignModel } from './design-intake';
import { SpecIR } from './spec-ir';

export type HandoffFailure = { ok: false; reason: 'handoff-malformed-designmodel' | 'handoff-schema-version-mismatch'; detail: string };
export interface D1Success { ok: true; spec: SpecIR; model: StoredDesignModel; matches: MatchResult[]; needsConfirmation: MatchResult[] }
export type D1Result = D1Success | HandoffFailure;

/** Reads only a completed, versioned D0.5 artifact. No cache repair or migration is permitted. */
export function loadDesignHandoff(modelPath: string): StoredDesignModel | HandoffFailure {
  try {
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as StoredDesignModel;
    if (model.schemaVersion !== DESIGN_MODEL_SCHEMA_VERSION) return { ok: false, reason: 'handoff-schema-version-mismatch', detail: `expected schemaVersion ${DESIGN_MODEL_SCHEMA_VERSION}, received ${String(model.schemaVersion)}` };
    if (model.source !== 'figma' || !Array.isArray(model.screens) || !model.screens.length || !model.fileKey || !model.fileVersion || !model.refsHash) {
      return { ok: false, reason: 'handoff-malformed-designmodel', detail: 'D0.5 handoff is missing required model metadata' };
    }
    return model;
  } catch (error) { return { ok: false, reason: 'handoff-malformed-designmodel', detail: error instanceof Error ? error.message : String(error) }; }
}

function isFailure(value: unknown): value is HandoffFailure {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as { ok?: unknown }).ok === false;
}

/** D1: deterministic, filter-first matching over cached components/text, never over live Figma. */
export function runD1(modelPath: string, spec: SpecIR, candidates: string[], options: MatchOptions = {}): D1Result {
  const model = loadDesignHandoff(modelPath);
  if (isFailure(model)) return model;
  if (!candidates.length) return { ok: false, reason: 'handoff-malformed-designmodel', detail: 'D1 requires at least one existing component-description candidate' };
  const nodes: FigmaNode[] = model.screens.flatMap((screen) => [
    ...screen.components.map((component) => ({ name: component.name })),
    ...screen.textNodes.map((text) => ({ name: text.name || text.characters, text: text.characters })),
  ]);
  const matches = createMatcher(candidates, options).matchAll(nodes);
  return { ok: true, spec, model, matches, needsConfirmation: matches.filter((match) => match.verdict !== 'HIGH') };
}

export interface D15Observation { name: string; source: 'component' | 'text'; ref: string }
export interface D15Result { ok: true; observations: D15Observation[]; requiresConfirmation: true; log: string }

/**
 * D1.5 deliberately returns observations, not inferred data-contract fields. A Figma label does
 * not prove API shape; every potential new field must pass the documented human checkpoint before
 * any Component-description table is changed.
 */
export function runD15(d1: D1Success): D15Result {
  const observations: D15Observation[] = d1.model.screens.flatMap((screen) => [
    ...screen.components.map((component) => ({ name: component.name, source: 'component' as const, ref: `${screen.ref}#${component.id}` })),
    ...screen.textNodes.filter((text) => text.characters.trim()).map((text) => ({ name: text.characters.trim(), source: 'text' as const, ref: `${screen.ref}#${text.id}` })),
  ]);
  return { ok: true, observations, requiresConfirmation: true, log: `[D1.5-enrichment] observations=${observations.length} checkpoint=required` };
}
