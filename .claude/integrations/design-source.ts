#!/usr/bin/env node
/**
 * design-source.ts — the `DesignSource` abstraction for the Design-to-UI (Figma) agent.
 *
 * WHAT THIS IS: the provider-agnostic INPUT side of the pipeline. A `DesignSource`
 * resolves a cluster of design refs (Figma URLs) into a normalized `DesignModel` that
 * D0 / the matcher / downstream consumers read — none of them know or care which
 * concrete provider produced it.
 *
 * V1 provider = `FigmaRestSource` (see figma-rest-source.ts), the REST-API implementation
 * proven end-to-end by the two Figma spike rounds. `FigmaDevModeSource` (MCP Dev Mode) is
 * the long-term direction for richer semantic fidelity (real component/variant names vs the
 * REST raw node tree) but is deferred until MCP infra (tool names, .mcp.json entries) is
 * resolved. Swapping providers later touches ONLY the class implementing `DesignSource` —
 * the interface + `DesignModel` shape below are the stable contract.
 *
 * The types are derived from the ACTUAL Figma REST response captured in the spikes
 * (GET /v1/files/{fileKey}/nodes?ids={nodeId}), not guessed:
 *   - a node tree of FRAME/COMPONENT/INSTANCE/TEXT/… nodes (`document` + `children`)
 *   - TEXT nodes carry `.characters` (the label) + `.style` (typography)
 *   - a `components` map (id -> { name: "Property 1=Active - Start", componentSetId, … })
 *     — this is where variant naming lives
 *   - a `styles` map (id -> { name: "Primary" | "Body/Lg_B_16px", styleType: FILL|TEXT })
 *   - SOLID `fills` with { color: { r,g,b,a } } floats 0..1
 *
 * NOTE ON FILTERING: this layer does NOT drop noise nodes. Noise filtering is the matcher's
 * job (design-matcher.ts `filterNodes()` / `isNoise()`); duplicating it here would split the
 * rule across two modules. `ScreenModel.tree` keeps the raw normalized tree so the matcher
 * filters downstream.
 *
 * Standalone — only Node stdlib (`crypto` for the content hash). No external deps.
 */

import { createHash } from 'crypto';

// ─── Core model (mirrors §5 of design-to-ui-agent-architecture.md) ─────────────

export interface DesignModel {
  /** Versioned artifact contract. Readers fail closed on an unsupported value. */
  schemaVersion: 1;
  source: 'figma';
  screens: ScreenModel[];
  /** Deterministic content hash of the resolved screens — for future re-run diffing
   *  (deferred M4 item). Computed now via hashScreens() so the interface is complete;
   *  nothing consumes it yet. */
  hash: string;
}

export interface ScreenModel {
  /** The design ref this screen was resolved from (the original Figma URL). */
  ref: string;
  /** Root node name — used to fuzzy-match against the Component-descriptions table. */
  name: string;
  tokens: DesignTokens;
  /** The normalized raw node tree (UNfiltered — the matcher filters downstream). */
  tree: DesignNode;
  components: ComponentRef[];
  assets: RenderedAsset[];
  textNodes: TextNode[];
}

export interface DesignSource {
  /** Stable provider id, e.g. 'figma-rest'. */
  id: string;
  /** Resolve a cluster of design refs (Figma URLs) into one aggregated DesignModel. */
  resolveCluster(refs: string[]): Promise<DesignModel>;
}

// ─── Node tree ─────────────────────────────────────────────────────────────────

/** A normalized design node. `type` is the raw Figma node type (FRAME/INSTANCE/TEXT/…);
 *  `characters` is present for TEXT nodes. The tree is kept raw so the matcher can filter. */
export interface DesignNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  children: DesignNode[];
}

// ─── TEXT nodes (richer signal than frame names — capability 3 of the matcher) ──

export interface TextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}

export interface TextNode {
  id: string;
  name: string;
  characters: string;
  style?: TextStyle;
}

// ─── Component references (variant naming lives here) ──────────────────────────

/** A component/instance reference. `name` keeps the real Figma name, incl. variant
 *  forms like "Property 1=Active - Start". `key`/`componentSetId` come from the REST
 *  `components` map when the node is a published component/instance. */
export interface ComponentRef {
  id: string;
  name: string;
  key?: string;
  componentSetId?: string;
}

// ─── Rendered assets (image export — later concern, field kept for completeness) ─

/** Placeholder for exported imagery (GET /v1/images). V1 populates []; the field exists
 *  so the DesignModel shape is complete and adding rendering later is non-breaking. */
export interface RenderedAsset {
  ref: string;
  type: string;
}

// ─── Design tokens (best-effort — see the module header) ───────────────────────

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A color used in the design. `name` is the Figma named style ("Primary", "Neutral/Dark
 *  Grey") when the fill references one; `hex` is derived from the raw SOLID fill. */
export interface ColorToken {
  name?: string;
  hex: string;
  rgba: Rgba;
}

/** A distinct typography combination observed on TEXT nodes. */
export interface TextStyleToken extends TextStyle {
  name?: string;
}

/** A named style entry from the REST `styles` map (FILL/TEXT/EFFECT/…). */
export interface NamedStyle {
  id: string;
  name: string;
  styleType: string;
}

export interface DesignTokens {
  colors: ColorToken[];
  textStyles: TextStyleToken[];
  namedStyles: NamedStyle[];
}

// ─── Hashing (deterministic content hash for re-run diffing) ───────────────────

/** Stable JSON serialization: object keys sorted recursively so the hash is invariant to
 *  key insertion order. Arrays keep their order (order is meaningful for a design tree). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Deterministic sha256 over the screens (the `hash` field itself is not part of the
 *  screens, so there is nothing to exclude). Same input → same hash, across runs/machines. */
export function hashScreens(screens: ScreenModel[]): string {
  return createHash('sha256').update(stableStringify(screens)).digest('hex');
}
