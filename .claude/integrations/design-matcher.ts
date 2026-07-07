#!/usr/bin/env node
/**
 * design-matcher.ts — match real Figma node names/text against a feature's
 * Component-descriptions rows (the reuse/enrichment matcher for the future
 * Design-to-UI agent).
 *
 * WHY THIS EXISTS: two spike rounds proved the approach and shaped every knob here.
 *   - Round 1 (stand-in data): token-overlap beats Levenshtein; a naive matcher has a
 *     ~10% CONFIDENT-WRONG rate from (a) domain-noun divergence ("Module" in design vs
 *     "Session" in spec) and (b) generic-verb collision (many "Add"/"Filter" buttons).
 *   - Round 2 (real Figma REST data, cross-domain mismatch): 0 HIGH / 0 confident-wrong
 *     across raw names (n=63), filtered names (n=21), and TEXT labels (n=65) — PRECISION
 *     validated. Also found: real trees are ~2/3 structural NOISE (auto-numbered frames,
 *     layout wrappers, icon-library paths) that MUST be filtered before matching; real
 *     TEXT-node content is richer signal than frame names; and the tie threshold holds
 *     but is thin without IDF down-weighting of generic tokens (section/content/card/…).
 *
 * The four capabilities below are the direct implementation of those findings:
 *   1. FILTER STAGE  — drop noise nodes before any scoring (DEFAULT_FILTER_PATTERNS).
 *   2. SYNONYM MAP   — fold domain synonyms (JSON: design-matcher.synonyms.json).
 *   3. TEXT WEIGHTING— weight a node's TEXT-node content higher than its frame name.
 *   4. TIE-DETECTION — IDF-down-weight generic tokens, score ALL candidates, and flag
 *                      AMBIGUOUS (never auto-pick) on a top-2 tie or a bare-floor top.
 *
 * ⚠️ KNOWN LIMITATION — PRECISION is validated (round-2 cross-domain test: 0 false
 *    positives). RECALL is NOT yet validated: no real Figma design + its intended spec
 *    (a true match) has been tested. Do NOT claim recall is proven. The tie/floor
 *    thresholds are tuned for precision; recall tuning waits on a real matched pair.
 *
 * Standalone — no external deps. Run:
 *   npx tsx .claude/integrations/design-matcher.ts [nodes-and-candidates.json]
 *   (JSON shape: { "candidates": string[], "nodes": [{ "name": string, "text"?: string }] })
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

/** One design element to match. `name` = frame/component/instance name; `text` = its
 *  TEXT-node content when available (weighted higher — capability 3). */
export interface FigmaNode {
  name: string;
  text?: string;
}

export type Verdict = 'HIGH' | 'AMBIGUOUS' | 'NONE';

export interface MatchResult {
  input: FigmaNode;
  verdict: Verdict;
  best: { candidate: string; score: number } | null;
  runnerUp: { candidate: string; score: number } | null;
  reason: string;
}

export interface MatchOptions {
  /** Synonym groups (first token = canonical). Default: loaded from the JSON sidecar. */
  synonyms?: string[][];
  /** Noise patterns; a node name matching any is dropped pre-match. Default: DEFAULT_FILTER_PATTERNS. */
  filterPatterns?: RegExp[];
  /** Extra stopwords (folded into the built-in connective list). */
  stopwords?: string[];
  /** Multiplier applied to tokens sourced from TEXT content. Default 2. */
  textWeight?: number;
  /** Top-2 score gap below which a result is AMBIGUOUS regardless of absolute score. Default 0.15. */
  tieMargin?: number;
  /** A top score must clear this to be HIGH; between noneFloor and this → AMBIGUOUS. Default 0.34. */
  highFloor?: number;
  /** A top score below this → NONE. Default 0.20. */
  noneFloor?: number;
}

// ─── Capability 1: FILTER STAGE (configurable array, not hardcoded inline) ─────

/**
 * Noise patterns from spike round 2. A Figma node whose NAME matches any of these is
 * structural/library junk (never a real UI component) and is dropped before matching.
 * Grouped by the five observed classes; extend by pushing to this array or passing
 * `filterPatterns` in MatchOptions.
 */
export const DEFAULT_FILTER_PATTERNS: RegExp[] = [
  // (a) Auto-numbered Figma defaults: "Frame 1321316117", "Rectangle 3", "Vector", "Group 52"
  /^(frame|group|rectangle|ellipse|vector|line|component|instance|star|polygon|slice|union|subtract)\s*\d*$/i,
  // (b) Layout-wrapper frames: "Container", "Margin", "Main Content Area", "Left Column: Canvas"
  /^(container|wrapper|row|col|column|stack|content|margin|overlay|background|border|shadow|spacer|divider|mask|clip)\b.*$/i,
  /^(main content|left column|right column|aside)\b.*$/i,
  /^(vertical|horizontal)border$/i,
  /^heading\s*\d+(\s*:\s*margin)?$/i,
  // (c) Compound "+"/":"-concatenated export-plugin names: "Background+Border+Shadow", "Heading 1:margin"
  /\+/,
  /:\s*margin\s*$/i,
  // (d) Icon-library path names: "vuesax/linear/menu", "UI icon/notification/light", "3D Avatars / 30"
  /(vuesax|ui\s*icon|3d\s*avatars?|material|feather|heroicons?|iconoir|phosphor|lucide)\s*\//i,
  /\/\s*(linear|outline|filled|bold|light|solid|regular|duotone)(\s*\/|$)/i,
  // (e) Placeholder/garbage text: "Title", "CP", "Step Title", keyboard-mash ("ádasdasdasd")
  /^(title|subtitle|step\s*title|cp|untitled|placeholder|lorem\b.*|text|label|body|heading)$/i,
  /(.{2,4})\1{2,}/i,                       // a 2–4 char group repeated 3+ times (asdasdasd)
  /^[bcdfghjklmnpqrstvwxyz]{6,}$/i,        // long all-consonant run (gibberish)
];

/** True if `name` is structural/library noise per `patterns`. */
export function isNoise(name: string, patterns: RegExp[] = DEFAULT_FILTER_PATTERNS): boolean {
  const n = (name ?? '').trim();
  if (!n) return true;
  return patterns.some((re) => re.test(n));
}

/** Drop noise nodes (matched on `name`) before any scoring happens. */
export function filterNodes(nodes: FigmaNode[], patterns: RegExp[] = DEFAULT_FILTER_PATTERNS): FigmaNode[] {
  return nodes.filter((nd) => !isNoise(nd.name, patterns));
}

// ─── Capability 2: SYNONYM MAP (loaded from JSON sidecar) ──────────────────────

const SYNONYMS_FILE = path.join(__dirname, 'design-matcher.synonyms.json');

/** Load synonym groups from the JSON sidecar (co-located with this module so it travels
 *  with a copy). Returns [] if the file is missing/unreadable — matching still works,
 *  just without domain folding. */
export function loadSynonyms(file: string = SYNONYMS_FILE): string[][] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { groups?: string[][] };
    return Array.isArray(parsed.groups) ? parsed.groups : [];
  } catch {
    return [];
  }
}

/** token -> canonical token (first member of its synonym group). */
export function buildCanonMap(groups: string[][]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) {
    if (!g.length) continue;
    const canon = g[0].toLowerCase();
    for (const w of g) m.set(w.toLowerCase(), canon);
  }
  return m;
}

// ─── Tokenization ──────────────────────────────────────────────────────────────

const BASE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'by', 'for', 'in', 'on', 'with', 'list',
]);

/** Lowercase → strip punctuation → split → drop stopwords/lone digits → fold synonyms. */
export function tokenize(s: string, canon?: Map<string, string>, extraStop?: Set<string>): string[] {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ ]+/gi, ' ') // keep letters (incl. accents) + digits
    .split(/\s+/)
    .filter((w) => w && !BASE_STOPWORDS.has(w) && !(extraStop && extraStop.has(w)) && !/^\d+$/.test(w))
    .map((w) => (canon && canon.get(w)) || w);
}

// ─── Capability 4: IDF + tie-detection matcher ─────────────────────────────────

interface CandidateModel {
  raw: string;
  tokens: string[];
}

/** Inverse-document-frequency over the candidate set: generic tokens that appear in many
 *  candidate rows (section/content/card/button/…) get a LOW weight so they can't alone
 *  push a match to HIGH; rare, discriminating tokens get a HIGH weight. */
export function computeIdf(candidateTokenSets: string[][]): { idf: Map<string, number>; unseen: number } {
  const N = candidateTokenSets.length || 1;
  const df = new Map<string, number>();
  for (const toks of candidateTokenSets) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(N / d) + 1);
  // A token never seen among candidates is maximally discriminating (rarer than df=1).
  const unseen = Math.log(N / 0.5) + 1;
  return { idf, unseen };
}

export interface Matcher {
  candidates: string[];
  match(node: FigmaNode): MatchResult;
  matchAll(nodes: FigmaNode[]): MatchResult[];
  /** Debug: raw score of one node against one candidate string. */
  score(node: FigmaNode, candidate: string): number;
}

/**
 * Build a matcher bound to a fixed candidate list (the feature's Component-descriptions
 * rows). Precomputes candidate tokens + IDF once.
 */
export function createMatcher(candidates: string[], opts: MatchOptions = {}): Matcher {
  const groups = opts.synonyms ?? loadSynonyms();
  const canon = buildCanonMap(groups);
  const extraStop = opts.stopwords ? new Set(opts.stopwords.map((w) => w.toLowerCase())) : undefined;
  const textWeight = opts.textWeight ?? 2;
  const tieMargin = opts.tieMargin ?? 0.15;
  const highFloor = opts.highFloor ?? 0.34;
  const noneFloor = opts.noneFloor ?? 0.2;

  const models: CandidateModel[] = candidates.map((raw) => ({ raw, tokens: tokenize(raw, canon, extraStop) }));
  const { idf, unseen } = computeIdf(models.map((m) => m.tokens));
  const w = (t: string): number => idf.get(t) ?? unseen;

  /** Weighted token map for a node: name tokens at weight 1×, text tokens at textWeight×
   *  (a token present in both keeps the larger multiplier). Weight = idf × multiplier. */
  function inputWeights(node: FigmaNode): Map<string, number> {
    const mult = new Map<string, number>();
    for (const t of tokenize(node.name, canon, extraStop)) mult.set(t, Math.max(mult.get(t) ?? 0, 1));
    if (node.text) for (const t of tokenize(node.text, canon, extraStop)) mult.set(t, Math.max(mult.get(t) ?? 0, textWeight));
    const out = new Map<string, number>();
    for (const [t, m] of mult) out.set(t, w(t) * m);
    return out;
  }

  function candWeights(m: CandidateModel): Map<string, number> {
    const out = new Map<string, number>();
    for (const t of m.tokens) out.set(t, w(t));
    return out;
  }

  /** IDF-weighted Jaccard (min/max form): Σ min over shared tokens / Σ max over the union.
   *  Symmetric, bounded [0,1]; text weighting enters through the boosted input weights. */
  function scoreMaps(A: Map<string, number>, B: Map<string, number>): number {
    if (!A.size || !B.size) return 0;
    let inter = 0;
    let union = 0;
    const keys = new Set([...A.keys(), ...B.keys()]);
    for (const k of keys) {
      const a = A.get(k) ?? 0;
      const b = B.get(k) ?? 0;
      inter += Math.min(a, b);
      union += Math.max(a, b);
    }
    return union === 0 ? 0 : inter / union;
  }

  function score(node: FigmaNode, candidate: string): number {
    return scoreMaps(inputWeights(node), candWeights({ raw: candidate, tokens: tokenize(candidate, canon, extraStop) }));
  }

  function match(node: FigmaNode): MatchResult {
    const A = inputWeights(node);
    const scored = models
      .map((m) => ({ candidate: m.raw, score: scoreMaps(A, candWeights(m)) }))
      .sort((x, y) => y.score - x.score);
    const best = scored[0] ?? null;
    const runnerUp = scored[1] ?? null;

    let verdict: Verdict;
    let reason: string;
    if (!best || best.score < noneFloor) {
      verdict = 'NONE';
      reason = `top score ${(best?.score ?? 0).toFixed(3)} < noneFloor ${noneFloor}`;
    } else if (runnerUp && best.score - runnerUp.score < tieMargin) {
      verdict = 'AMBIGUOUS';
      reason = `top-2 tie: ${best.score.toFixed(3)} vs ${runnerUp.score.toFixed(3)} within margin ${tieMargin}`;
    } else if (best.score < highFloor) {
      verdict = 'AMBIGUOUS';
      reason = `top ${best.score.toFixed(3)} clears noneFloor but not highFloor ${highFloor}`;
    } else {
      verdict = 'HIGH';
      reason = `top ${best.score.toFixed(3)} ≥ highFloor ${highFloor}, gap to 2nd ≥ ${tieMargin}`;
    }
    return { input: node, verdict, best, runnerUp, reason };
  }

  function matchAll(nodes: FigmaNode[]): MatchResult[] {
    return filterNodes(nodes, opts.filterPatterns ?? DEFAULT_FILTER_PATTERNS).map(match);
  }

  return { candidates, match, matchAll, score };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const arg = process.argv[2];
  if (arg) {
    const { candidates, nodes } = JSON.parse(fs.readFileSync(arg, 'utf8')) as {
      candidates: string[];
      nodes: FigmaNode[];
    };
    const matcher = createMatcher(candidates);
    const results = matcher.matchAll(nodes);
    const tally = { HIGH: 0, AMBIGUOUS: 0, NONE: 0 } as Record<Verdict, number>;
    for (const r of results) {
      tally[r.verdict] += 1;
      const b = r.best ? `"${r.best.candidate}" (${r.best.score.toFixed(3)})` : '—';
      console.log(`[${r.verdict.padEnd(9)}] "${r.input.name}" -> ${b}`);
    }
    console.log(`\nHIGH=${tally.HIGH}  AMBIGUOUS=${tally.AMBIGUOUS}  NONE=${tally.NONE}  (from ${nodes.length} nodes, ${nodes.length - results.length} filtered as noise)`);
  } else {
    console.log('design-matcher — precision-validated, recall-untested.');
    console.log('Usage: npx tsx .claude/integrations/design-matcher.ts <file.json>');
    console.log('  where file.json = { "candidates": string[], "nodes": [{"name": string, "text"?: string}] }');
  }
}
