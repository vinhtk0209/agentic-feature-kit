#!/usr/bin/env node
/**
 * figma-rest-source.ts — `FigmaRestSource`, the V1 DesignSource (Figma REST API).
 *
 * Proven end-to-end by the two Figma spike rounds (real GET /v1/files/{key}/nodes fetch →
 * real node tree → matcher ran against it). This module ONLY fetches + normalizes a Figma
 * node cluster into the `DesignModel` shape from design-source.ts. It does NOT filter noise
 * (that is the matcher's job — see design-source.ts header) and it is NOT wired into D0 /
 * the flagship / `/design-to-ui` yet (Phase 2).
 *
 * Auth: reads `FIGMA_TOKEN` from the environment (the kit's established convention —
 * see .claude/_content/images.md). The token value is NEVER logged.
 *
 * Standalone — global `fetch` (Node 18+) + design-source.ts. No external deps.
 *   npx tsx .claude/integrations/figma-rest-source.ts "<figma-url>" ["<figma-url>" …]
 */

import {
  DesignModel,
  DesignNode,
  DesignSource,
  ScreenModel,
  TextNode,
  ComponentRef,
  DesignTokens,
  ColorToken,
  TextStyleToken,
  NamedStyle,
  Rgba,
  hashScreens,
} from './design-source';

// ─── Raw Figma REST shapes (only the fields we read) ───────────────────────────

interface RawColor { r: number; g: number; b: number; a: number }
interface RawFill { type?: string; color?: RawColor; opacity?: number }
interface RawTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}
interface RawNode {
  id: string;
  name?: string;
  type: string;
  characters?: string;
  style?: RawTextStyle;
  fills?: RawFill[];
  styles?: Record<string, string>; // { fill: '57:329', text: '57:344' }
  componentId?: string;
  children?: RawNode[];
}
interface RawComponentMeta { key?: string; name?: string; componentSetId?: string }
interface RawStyleMeta { key?: string; name?: string; styleType?: string }
interface RawNodeEntry {
  document: RawNode;
  components?: Record<string, RawComponentMeta>;
  componentSets?: Record<string, RawComponentMeta>;
  styles?: Record<string, RawStyleMeta>;
}
interface RawNodesResponse {
  name?: string;
  nodes: Record<string, RawNodeEntry>;
}
interface RawFileResponse { version?: string }

// ─── Options ───────────────────────────────────────────────────────────────────

export interface FigmaRestSourceOptions {
  /** Personal access token. Defaults to process.env.FIGMA_TOKEN. Never logged. */
  token?: string;
  /** Injectable fetch (for tests). Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Base URL override (tests / self-host). Defaults to the public API. */
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://api.figma.com';
const SEMANTIC_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

// ─── Ref parsing (URL → { fileKey, nodeId }) ───────────────────────────────────

export interface ParsedRef {
  fileKey: string;
  /** API (colon) form, e.g. "6713:66557" — converted from the URL dash form. */
  nodeId: string;
}

/**
 * Parse a Figma design URL into { fileKey, nodeId }. Handles the real forms:
 *   https://www.figma.com/design/<FILE_KEY>/<slug>?node-id=<NODE_ID>&…
 *   https://www.figma.com/file/<FILE_KEY>/<slug>?node-id=<NODE_ID>
 * The URL node-id uses the dash form (6713-66557); the API needs the colon form
 * (6713:66557) — this conversion is done automatically here. Throws a clear error on an
 * unparseable ref (missing file key or node-id).
 */
export function parseRef(ref: string): ParsedRef {
  let url: URL;
  try {
    url = new URL(ref.trim());
  } catch {
    throw new Error(`Unparseable Figma ref (not a URL): "${ref}"`);
  }
  const m = url.pathname.match(/\/(?:design|file)\/([A-Za-z0-9]+)/);
  if (!m) {
    throw new Error(`Unparseable Figma ref (no /design/<fileKey> or /file/<fileKey> segment): "${ref}"`);
  }
  const fileKey = m[1];
  const rawNodeId = url.searchParams.get('node-id');
  if (!rawNodeId) {
    throw new Error(`Unparseable Figma ref (missing ?node-id=): "${ref}"`);
  }
  // URL dash form → API colon form. Only the FIRST dash separates the two id parts
  // (node ids are "<num>-<num>"); replace it deterministically.
  const nodeId = rawNodeId.replace('-', ':');
  return { fileKey, nodeId };
}

// ─── Token normalization helpers ───────────────────────────────────────────────

function rgbaToHex(c: RawColor): string {
  const to = (v: number): string => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

// ─── FigmaRestSource ───────────────────────────────────────────────────────────

export class FigmaRestSource implements DesignSource {
  public readonly id = 'figma-rest';
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: FigmaRestSourceOptions = {}) {
    this.token = opts.token ?? process.env.FIGMA_TOKEN;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '');
  }

  /** Cheap version probe used by D0.5 before accepting an on-branch cache artifact. */
  async getFileVersion(fileKey: string): Promise<string> {
    if (!this.token) throw new Error('FIGMA_TOKEN missing — set the FIGMA_TOKEN environment variable');
    if (typeof this.fetchImpl !== 'function') throw new Error('No fetch implementation available (Node 18+ global fetch or opts.fetchImpl)');
    const res = await this.fetchImpl(`${this.baseUrl}/v1/files/${encodeURIComponent(fileKey)}`, { headers: { 'X-Figma-Token': this.token } });
    if (!res.ok) throw new Error(`Figma API version request failed (${res.status} ${res.statusText}) for file ${fileKey}`);
    const body = await res.json() as RawFileResponse;
    if (!body.version || typeof body.version !== 'string') throw new Error(`Figma API returned no version for file ${fileKey}`);
    return body.version;
  }

  /** Fetch one node cluster. Clear, specific errors for the auth failures seen in real
   *  testing (missing token, 403 token-expired/invalid). Never logs the token value. */
  async fetchNodes(fileKey: string, nodeId: string): Promise<RawNodeEntry> {
    if (!this.token) {
      throw new Error('FIGMA_TOKEN missing — set the FIGMA_TOKEN environment variable');
    }
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('No fetch implementation available (Node 18+ global fetch or opts.fetchImpl)');
    }
    const uri = `${this.baseUrl}/v1/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}`;
    const res = await this.fetchImpl(uri, { headers: { 'X-Figma-Token': this.token } });

    if (res.status === 401 || res.status === 403) {
      let detail = '';
      try {
        const body = await res.json();
        detail = (body && (body.err || body.message)) || '';
      } catch {
        try { detail = await res.text(); } catch { detail = ''; }
      }
      throw new Error(
        `Figma API ${res.status}: token expired or invalid${detail ? ` — "${detail}"` : ''}. ` +
        `Refresh FIGMA_TOKEN and retry.`,
      );
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      throw new Error(`Figma API request failed (${res.status} ${res.statusText}) for node ${nodeId}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }

    const json = (await res.json()) as RawNodesResponse;
    const entry = json.nodes?.[nodeId];
    if (!entry || !entry.document) {
      throw new Error(`Figma API returned no node "${nodeId}" for file "${fileKey}" (check the node-id)`);
    }
    return entry;
  }

  /** Normalize one raw node entry into a ScreenModel. Recursive walk mirrors the spike's
   *  figma-extract.mjs `walk()`: collect TEXT contents, semantic component refs, and
   *  best-effort tokens. The raw (unfiltered) tree is preserved in `tree`. */
  toScreenModel(entry: RawNodeEntry, ref: string): ScreenModel {
    const componentsMap = entry.components ?? {};
    const stylesMap = entry.styles ?? {};

    const textNodes: TextNode[] = [];
    const components: ComponentRef[] = [];
    const colorByHex = new Map<string, ColorToken>();
    const textStyleByKey = new Map<string, TextStyleToken>();

    const styleName = (node: RawNode, kind: 'fill' | 'text'): string | undefined => {
      const id = node.styles?.[kind];
      const meta = id ? stylesMap[id] : undefined;
      return meta?.name;
    };

    const walk = (raw: RawNode): DesignNode => {
      const node: DesignNode = {
        id: raw.id,
        name: raw.name ?? '',
        type: raw.type,
        children: [],
      };
      if (raw.type === 'TEXT') {
        node.characters = raw.characters ?? '';
        textNodes.push({
          id: raw.id,
          name: raw.name ?? '',
          characters: raw.characters ?? '',
          style: raw.style ? { ...raw.style } : undefined,
        });
        if (raw.style && (raw.style.fontFamily || raw.style.fontSize)) {
          const key = `${raw.style.fontFamily ?? ''}|${raw.style.fontSize ?? ''}|${raw.style.fontWeight ?? ''}`;
          if (!textStyleByKey.has(key)) {
            textStyleByKey.set(key, { ...raw.style, name: styleName(raw, 'text') });
          }
        }
      }
      if (SEMANTIC_TYPES.has(raw.type)) {
        const ref2: ComponentRef = { id: raw.id, name: raw.name ?? '' };
        if (raw.type === 'INSTANCE' && raw.componentId && componentsMap[raw.componentId]) {
          const meta = componentsMap[raw.componentId];
          ref2.key = meta.key;
          ref2.componentSetId = meta.componentSetId;
          // Prefer the component/variant name from the map ("Property 1=Active - Start") —
          // it is the instance's semantic identity; the instance's own name is often an
          // auto-numbered default ("Frame 1321316116"). (Noise is still dropped downstream
          // by the matcher, not here.)
          if (meta.name) ref2.name = meta.name;
        }
        components.push(ref2);
      }
      // Best-effort color tokens from SOLID fills.
      for (const fill of raw.fills ?? []) {
        if (fill.type === 'SOLID' && fill.color) {
          const rgba: Rgba = { r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.color.a };
          const hex = rgbaToHex(fill.color);
          if (!colorByHex.has(hex)) {
            colorByHex.set(hex, { hex, rgba, name: styleName(raw, 'fill') });
          }
        }
      }
      node.children = (raw.children ?? []).map(walk);
      return node;
    };

    const tree = walk(entry.document);

    const namedStyles: NamedStyle[] = Object.entries(stylesMap).map(([id, meta]) => ({
      id,
      name: meta.name ?? '',
      styleType: meta.styleType ?? '',
    }));

    const tokens: DesignTokens = {
      colors: [...colorByHex.values()],
      textStyles: [...textStyleByKey.values()],
      namedStyles,
    };

    return {
      ref,
      name: entry.document.name ?? '',
      tokens,
      tree,
      components,
      assets: [], // image export (GET /v1/images) is a later concern — see design-source.ts
      textNodes,
    };
  }

  /** Resolve a cluster of Figma URLs into one aggregated DesignModel (one screen per ref). */
  async resolveCluster(refs: string[]): Promise<DesignModel> {
    if (!refs?.length) {
      throw new Error('resolveCluster: at least one Figma ref is required');
    }
    const screens: ScreenModel[] = [];
    for (const ref of refs) {
      const { fileKey, nodeId } = parseRef(ref);
      const entry = await this.fetchNodes(fileKey, nodeId);
      screens.push(this.toScreenModel(entry, ref));
    }
    return { schemaVersion: 1, source: 'figma', screens, hash: hashScreens(screens) };
  }
}

// ─── CLI (live path — needs FIGMA_TOKEN + network; not used by the test suite) ──

if (require.main === module) {
  const refs = process.argv.slice(2);
  if (!refs.length) {
    console.log('figma-rest-source — V1 DesignSource (Figma REST).');
    console.log('Usage: FIGMA_TOKEN=… npx tsx .claude/integrations/figma-rest-source.ts "<figma-url>" […]');
    process.exit(0);
  }
  new FigmaRestSource()
    .resolveCluster(refs)
    .then((model) => {
      for (const s of model.screens) {
        console.log(`\n# ${s.name}  (${s.ref})`);
        console.log(`  components=${s.components.length}  textNodes=${s.textNodes.length}  ` +
          `colors=${s.tokens.colors.length}  textStyles=${s.tokens.textStyles.length}  namedStyles=${s.tokens.namedStyles.length}`);
      }
      console.log(`\nhash=${model.hash}  screens=${model.screens.length}`);
    })
    .catch((e) => {
      console.error(`ERROR: ${(e as Error).message}`);
      process.exit(1);
    });
}
