#!/usr/bin/env tsx
/**
 * d-cross-2.ts — ENHANCE-mode Design ↔ existing-contract reconciliation (design §13).
 *
 * Runs after B4 when `contractStatus == REAL`. Produces a DETERMINISTIC, structured diff of
 * "what the frozen code models today" (BEFORE) vs "what the target contract requires" (AFTER),
 * so a human can additively update data/types.ts + data/api.ts (§7 never-auto-edit). It is a
 * PARALLEL report — it never feeds B8.6.
 *
 *   BEFORE = baseline-http-gen(frozen api.ts + types.ts)     — current code truth (§13.1)
 *   AFTER  = the declared <Feature>.full.http via resolveContractHttp — target contract (§13.1)
 *
 * Both comparands are the canonical `### EXPECTED RESPONSE SHAPES` TS-prose `.http` format, so both
 * parse to `Map<string, Shape>` via the SAME `parseExpectedShapes` — no casing/shape skew. This is
 * a THIN wrapper: the field diff is `compareShapeVsShape` / `compareFieldType` reused AS-IS.
 *
 * Reuse verified against contract-probe.ts (2026-07-09, not assumed — the Step-2 mistake not repeated):
 *   - parseExpectedShapes / compareShapeVsShape / compareFieldType — reused unchanged for
 *     added / removed / (name & array) type_changed.
 *   - GAP FOUND: `compareFieldType` compares ONLY the primitive/ref `name`; it NEVER compares
 *     `FieldType.nullable` (contract-probe.ts:531-538) — so §13.2/§13.7's claim that it "flags the
 *     nullability mismatch" is FALSE. Optionality (`Field.optional`) is likewise ignored. Both
 *     dimensions are covered here by the sanctioned net-new `optNullPass` (§13.5 net-new #2), which
 *     does NOT reimplement the type differ — it only reads the two flags compareFieldType omits.
 *   - GAP FOUND: baseline-http-gen emits the marker line as `### CONTRACT: baseline — synthesized
 *     from existing code` (three `#`, baseline-http-gen.ts:129), NOT the `# CONTRACT: baseline …`
 *     §13.4 wrote. Same-source detection matches the `#`-agnostic substring below.
 *
 * Output (§13.3): RECONCILE.json (primary, deterministic source) + RECONCILE.md (pure projection).
 *
 *   npx tsx .claude/integrations/d-cross-2.ts --api <api.ts> --types <types.ts> --feature <Name> \
 *     [--after <contract.http>] [--components <dir>] [--specs <dir>] [--out-dir <dir>]
 *
 * Exit code: 0 for clean/changes; 1 for breaking or error (fail-closed).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  parseExpectedShapes,
  compareShapeVsShape,
  parseApiReturnTypes,
  resolveContractHttp,
  type Shape,
  type FieldType,
  type ContractFinding,
  type RouteType,
} from './contract-probe';
import { generateBaselineHttp, renderFieldType } from './baseline-http-gen';

// ─── Public types (mirror the §13.3 RECONCILE.json schema) ────────────────────────

export type ChangeKind = 'added' | 'removed' | 'type_changed' | 'optionality_changed' | 'suspected_rename';
export type ChangeClass = 'additive' | 'requires-implementation' | 'breaking' | 'hint';
export type Verdict = 'clean' | 'changes' | 'breaking' | 'error';

/** Fail-closed reason codes (§13.4). (a)=genuine data problem, (b)=wrong invocation — see §13.4.1. */
export type ReasonCode =
  | 'not-enhance-no-existing-code' // (b) wrong invocation — nothing to enhance
  | 'missing-declared-contract'    // (a) data problem — ENHANCE target, contract absent
  | 'malformed-existing-code'      // (a) data problem — code parses to 0 routes/shapes
  | 'malformed-contract'           // (a) data problem — contract parses to 0 shapes
  | 'same-source-degeneracy'       // (a) data problem — AFTER is a baseline mirror of BEFORE
  | 'vacuous-no-compared-shapes';  // (a) data problem — nothing was actually compared

export interface Change {
  kind: ChangeKind;
  path: string;
  before?: string;
  after?: string;
  breaking: boolean;
  class: ChangeClass;
  /** suspected_rename only — the independently-emitted removed/added it links (never collapses them). */
  removedPath?: string;
  addedPath?: string;
}

export interface EndpointReconcile {
  endpoint: string;
  /** Set when a side lacks this endpoint's root shape (§13.7 partial contract) — never counted "clean". */
  skipped?: ReasonCode | 'root-shape-missing-in-after' | 'root-shape-missing-in-before';
  changes: Change[];
}

export interface ReconcileSummary {
  added: number;
  removed: number;
  type_changed: number;
  optionality_changed: number;
  suspected_rename: number;
  breaking: number;
}

export interface ReconcileResult {
  schemaVersion: 1;
  feature: string;
  contractStatus: string;
  before: { source: 'baseline-http-gen'; from: string; sha256: string; shapes: number; routes: number };
  after: { source: 'declared-contract'; path: string; sha256: string; shapes: number };
  comparedShapes: number;
  verifiedFields: number;
  stale: boolean;
  endpoints: EndpointReconcile[];
  summary: ReconcileSummary;
  verdict: Verdict;
  reason: ReasonCode | null;
}

// ─── Small utilities (navigation & rendering — NOT diffing) ────────────────────────

const sha256 = (s: string): string => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** `T`, `T[]`, `T | null`, with a trailing `?` when the FIELD (not the type) is optional. */
function typeStr(ft: FieldType, optional = false): string {
  return `${renderFieldType(ft)}${optional ? '?' : ''}`;
}

/** Direct ref name reachable from a field type (arrays unwrapped). null if not a ref. */
function refOf(ft: FieldType): string | null {
  if (ft.kind === 'ref') return ft.name;
  if (ft.kind === 'array') return refOf(ft.element);
  return null;
}

/**
 * Resolve the FieldType at a dot-path (e.g. `status.passed`, `exams[0].id`) within `shapes`, starting
 * at `rootType`. Pure navigation over the parsed shapes — it does not diff anything. Returns null if
 * the path cannot be followed (e.g. it descends into an unresolvable alias ref).
 */
function typeAt(shapes: Map<string, Shape>, rootType: string, dotPath: string): FieldType | null {
  const segs = dotPath.split('.');
  let shape: Shape | undefined = shapes.get(rootType);
  let cur: FieldType | null = null;
  for (const seg of segs) {
    if (!shape) return null;
    const isArr = seg.endsWith('[0]');
    const name = isArr ? seg.slice(0, -3) : seg;
    const field = shape.get(name);
    if (!field) return null;
    let ft = field.type;
    if (isArr && ft.kind === 'array') ft = ft.element;
    cur = ft;
    const nextRef = refOf(ft);
    shape = nextRef ? shapes.get(nextRef) : undefined;
  }
  return cur;
}

/** Structural type equality for the rename rule (§13.2): same kind, name, nullable, and (recursively) element. */
export function fieldTypeEqual(a: FieldType, b: FieldType): boolean {
  if (a.kind !== b.kind || a.nullable !== b.nullable) return false;
  if (a.kind === 'array' && b.kind === 'array') return fieldTypeEqual(a.element, b.element);
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.name === b.name;
  if (a.kind === 'ref' && b.kind === 'ref') return a.name === b.name;
  return false;
}

const parentOf = (p: string): string => {
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(0, i);
};

// ─── optionality + nullability pass (§13.5 net-new #2 — the compareFieldType gap) ──

/**
 * Walk the BOTH-sides fields of one endpoint's shape tree comparing ONLY the two dimensions
 * `compareFieldType` structurally ignores: `Field.optional` and `FieldType.nullable`. It delegates
 * every other diff to `compareShapeVsShape`; added/removed fields (present on one side only) are skipped
 * here. Cycle-guarded independently of compareShapeVsShape (fresh `seen` per endpoint).
 */
function optNullPass(rootType: string, after: Map<string, Shape>, before: Map<string, Shape>): Change[] {
  const changes: Change[] = [];
  const seen = new Set<string>();
  const walk = (dotPath: string, typeName: string): void => {
    const guard = `${typeName}@${dotPath}`;
    if (seen.has(guard)) return;
    seen.add(guard);
    const aShape = after.get(typeName);
    const bShape = before.get(typeName);
    if (!aShape || !bShape) return; // unresolvable on a side — advisory-safe skip (mirrors compareShapeVsShape)
    for (const [fname, aField] of aShape) {
      const bField = bShape.get(fname);
      if (!bField) continue; // added — owned by compareShapeVsShape
      const here = dotPath ? `${dotPath}.${fname}` : fname;
      // (1) optionality: optional→required = breaking (§13.7); required→optional = safe.
      if (aField.optional !== bField.optional) {
        const breaking = bField.optional && !aField.optional;
        changes.push({
          kind: 'optionality_changed', path: here,
          before: typeStr(bField.type, bField.optional), after: typeStr(aField.type, aField.optional),
          breaking, class: breaking ? 'breaking' : 'additive',
        });
      }
      // (2) nullability at leaf/array-element (compareFieldType never compares .nullable).
      walkNullable(here, aField.type, bField.type, changes);
      // recurse through refs present on both sides (arrays unwrapped)
      const aRef = refOf(aField.type);
      const bRef = refOf(bField.type);
      if (aRef && bRef && aRef === bRef) walk(here, aRef);
    }
  };
  walk('', rootType);
  return changes;
}

/** T→T|null = breaking-for-consumer (§13.7); T|null→T = narrowing = safe. Only when the base type matches. */
function walkNullable(here: string, at: FieldType, bt: FieldType, changes: Change[]): void {
  if (at.kind === 'array' && bt.kind === 'array') { walkNullable(`${here}[0]`, at.element, bt.element, changes); return; }
  const sameBase =
    (at.kind === 'primitive' && bt.kind === 'primitive' && at.name === bt.name) ||
    (at.kind === 'ref' && bt.kind === 'ref' && at.name === bt.name);
  if (sameBase && at.nullable !== bt.nullable) {
    const breaking = at.nullable && !bt.nullable; // after gained null
    changes.push({
      kind: 'type_changed', path: here,
      before: typeStr(bt), after: typeStr(at),
      breaking, class: breaking ? 'breaking' : 'additive',
    });
  }
}

// ─── suspected_rename pairing (§13.2 exact rule) ──────────────────────────────────

/**
 * Emit hint-only rename pairs within ONE endpoint. Per §13.2: for each parent shape, iterate removed
 * fields in declaration order and pair each with the first not-yet-paired added field whose RESOLVED
 * type is structurally identical (fieldTypeEqual) — NO name/string similarity. A rename is ALWAYS only a
 * hint: the underlying added & removed stay emitted independently, and it contributes 0 to `breaking`.
 */
function suspectedRenames(
  rootType: string, added: Change[], removed: Change[],
  after: Map<string, Shape>, before: Map<string, Shape>,
): Change[] {
  const hints: Change[] = [];
  const byParent = (cs: Change[]): Map<string, Change[]> => {
    const m = new Map<string, Change[]>();
    for (const c of cs) { const p = parentOf(c.path); (m.get(p) ?? m.set(p, []).get(p)!).push(c); }
    return m;
  };
  const addedByParent = byParent(added);
  const removedByParent = byParent(removed);
  for (const [parent, rems] of removedByParent) {
    const adds = addedByParent.get(parent);
    if (!adds || adds.length === 0) continue;
    const usedAdd = new Set<number>();
    for (const rem of rems) {
      const rType = typeAt(before, rootType, rem.path);
      if (!rType) continue;
      for (let i = 0; i < adds.length; i += 1) {
        if (usedAdd.has(i)) continue;
        const aType = typeAt(after, rootType, adds[i].path);
        if (aType && fieldTypeEqual(rType, aType)) {
          usedAdd.add(i);
          hints.push({
            kind: 'suspected_rename', path: `${rem.path}→${adds[i].path}`,
            before: rem.before, after: adds[i].after,
            breaking: false, class: 'hint',
            removedPath: rem.path, addedPath: adds[i].path,
          });
          break;
        }
      }
    }
  }
  return hints;
}

// ─── Core reconcile (pure — texts in, ReconcileResult out) ────────────────────────

export interface ReconcileInput {
  beforeHttpText: string;   // baseline-http-gen output (current code truth)
  afterHttpText: string;    // declared contract .http
  apiText: string;          // frozen api.ts — drives endpoint enumeration (reused parseApiReturnTypes)
  feature: string;
  contractStatus?: string;  // default 'REAL'
  stale?: boolean;          // advisory mtime flag from the orchestrator
  afterPath?: string;       // for reporting only
}

/** Baseline-mirror marker baseline-http-gen writes (verified: three `#`, not §13.4's one). */
const BASELINE_MARKER = 'CONTRACT: baseline — synthesized from existing code';

function baseResult(input: ReconcileInput, before: { shapes: number; routes: number }, after: { shapes: number }): ReconcileResult {
  return {
    schemaVersion: 1,
    feature: input.feature,
    contractStatus: input.contractStatus ?? 'REAL',
    before: { source: 'baseline-http-gen', from: 'data/api.ts+types.ts', sha256: sha256(input.beforeHttpText), shapes: before.shapes, routes: before.routes },
    after: { source: 'declared-contract', path: input.afterPath ?? '', sha256: sha256(input.afterHttpText), shapes: after.shapes },
    comparedShapes: 0,
    verifiedFields: 0,
    stale: !!input.stale,
    endpoints: [],
    summary: { added: 0, removed: 0, type_changed: 0, optionality_changed: 0, suspected_rename: 0, breaking: 0 },
    verdict: 'error',
    reason: null,
  };
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const beforeShapes = parseExpectedShapes(input.beforeHttpText);
  const routes = parseApiReturnTypes(input.apiText);
  const afterShapes = parseExpectedShapes(input.afterHttpText);

  const result = baseResult(input, { shapes: beforeShapes.size, routes: routes.length }, { shapes: afterShapes.size });

  // ── Fail-closed guardrails (§13.4). Orchestrator handles not-enhance / missing-contract (fs). ──
  if (routes.length === 0 || beforeShapes.size === 0) { result.reason = 'malformed-existing-code'; return result; }
  if (input.afterHttpText.includes(BASELINE_MARKER)) { result.reason = 'same-source-degeneracy'; return result; }
  if (afterShapes.size === 0) { result.reason = 'malformed-contract'; return result; }

  const comparedShapes = [...beforeShapes.keys()].filter((k) => afterShapes.has(k)).length;
  result.comparedShapes = comparedShapes;
  if (comparedShapes === 0) { result.reason = 'vacuous-no-compared-shapes'; return result; } // never "clean"

  // ── Diff, per endpoint, driven by api.ts routes (mirrors probeShapeMode pairing). ──
  const stats = { n: 0 };
  const endpoints: EndpointReconcile[] = [];
  for (const route of routes) {
    const label = `${route.method} ${route.path}`;
    const ep: EndpointReconcile = { endpoint: label, changes: [] };
    if (!afterShapes.has(route.typeName)) { ep.skipped = 'root-shape-missing-in-after'; endpoints.push(ep); continue; }
    if (!beforeShapes.has(route.typeName)) { ep.skipped = 'root-shape-missing-in-before'; endpoints.push(ep); continue; }

    // AFTER = source-of-truth polarity (§13.1): missing→added, extra→removed, type_mismatch→type_changed.
    const findings: ContractFinding[] = [];
    compareShapeVsShape(label, '', afterShapes, beforeShapes, route.typeName, findings, new Set(), stats);

    const added: Change[] = [];
    const removed: Change[] = [];
    const structural: Change[] = [];
    for (const f of findings) {
      if (f.kind === 'missing') { // AFTER has, BEFORE lacks → added
        const t = typeAt(afterShapes, route.typeName, f.path);
        const isOptional = fieldOptionalAt(afterShapes, route.typeName, f.path);
        const c: Change = {
          kind: 'added', path: f.path, after: t ? typeStr(t) : undefined,
          breaking: false, class: isOptional ? 'additive' : 'requires-implementation',
        };
        added.push(c); structural.push(c);
      } else if (f.kind === 'extra') { // BEFORE has, AFTER lacks → removed (breaking: code reads undefined, §13.7)
        const t = typeAt(beforeShapes, route.typeName, f.path);
        const c: Change = { kind: 'removed', path: f.path, before: t ? typeStr(t) : undefined, breaking: true, class: 'breaking' };
        removed.push(c); structural.push(c);
      } else if (f.kind === 'type_mismatch') { // name/array change → breaking
        const bt = typeAt(beforeShapes, route.typeName, f.path);
        const at = typeAt(afterShapes, route.typeName, f.path);
        structural.push({ kind: 'type_changed', path: f.path, before: bt ? typeStr(bt) : undefined, after: at ? typeStr(at) : undefined, breaking: true, class: 'breaking' });
      }
    }

    // net-new dimensions compareFieldType ignores (optional + nullable), deduped against structural.
    const seenKey = new Set(structural.map((c) => `${c.kind}@${c.path}`));
    const optNull = optNullPass(route.typeName, afterShapes, beforeShapes).filter((c) => !seenKey.has(`${c.kind}@${c.path}`));

    const renames = suspectedRenames(route.typeName, added, removed, afterShapes, beforeShapes);

    ep.changes = [...structural, ...optNull, ...renames];
    endpoints.push(ep);
  }

  result.verifiedFields = stats.n;
  result.endpoints = endpoints;

  // ── Summary + verdict (breaking derived ONLY from real changes; suspected_rename contributes 0). ──
  const all = endpoints.flatMap((e) => e.changes);
  const summary: ReconcileSummary = {
    added: all.filter((c) => c.kind === 'added').length,
    removed: all.filter((c) => c.kind === 'removed').length,
    type_changed: all.filter((c) => c.kind === 'type_changed').length,
    optionality_changed: all.filter((c) => c.kind === 'optionality_changed').length,
    suspected_rename: all.filter((c) => c.kind === 'suspected_rename').length,
    breaking: all.filter((c) => c.kind !== 'suspected_rename' && c.breaking).length,
  };
  result.summary = summary;
  const realChanges = summary.added + summary.removed + summary.type_changed + summary.optionality_changed;
  result.verdict = summary.breaking > 0 ? 'breaking' : realChanges > 0 ? 'changes' : 'clean';
  result.reason = null;
  return result;
}

/** Whether the field at a dot-path is declared optional (for added-field class). */
function fieldOptionalAt(shapes: Map<string, Shape>, rootType: string, dotPath: string): boolean {
  const segs = dotPath.split('.');
  let shape: Shape | undefined = shapes.get(rootType);
  let optional = false;
  for (const seg of segs) {
    if (!shape) return false;
    const isArr = seg.endsWith('[0]');
    const name = isArr ? seg.slice(0, -3) : seg;
    const field = shape.get(name);
    if (!field) return false;
    optional = field.optional;
    let ft = field.type;
    if (isArr && ft.kind === 'array') ft = ft.element;
    const nextRef = refOf(ft);
    shape = nextRef ? shapes.get(nextRef) : undefined;
  }
  return optional;
}

// ─── Orchestrator (fs guards + baseline generation) ───────────────────────────────

export interface ReconcileFeatureOptions {
  apiPath: string;
  typesPath: string;
  feature: string;
  afterPath?: string;      // explicit AFTER; else resolved from componentsDir/specsDir
  componentsDir?: string;
  specsDir?: string;
  contractStatus?: string;
}

function errorResult(feature: string, reason: ReasonCode, contractStatus = 'REAL', afterPath = ''): ReconcileResult {
  return {
    schemaVersion: 1, feature, contractStatus,
    before: { source: 'baseline-http-gen', from: 'data/api.ts+types.ts', sha256: '', shapes: 0, routes: 0 },
    after: { source: 'declared-contract', path: afterPath, sha256: '', shapes: 0 },
    comparedShapes: 0, verifiedFields: 0, stale: false, endpoints: [],
    summary: { added: 0, removed: 0, type_changed: 0, optionality_changed: 0, suspected_rename: 0, breaking: 0 },
    verdict: 'error', reason,
  };
}

/**
 * Full ENHANCE reconciliation from disk. Applies the two fs-level guards §13.4 owns — the BOTH-sides
 * disambiguator (§13.4.1): the presence of the existing feature code is the on-disk evidence this IS an
 * ENHANCE target. Absent → cause (b) `not-enhance-no-existing-code`. Present but contract missing →
 * cause (a) `missing-declared-contract`. Then generates BEFORE and delegates to `reconcile`.
 */
export function reconcileFeature(opts: ReconcileFeatureOptions): ReconcileResult {
  const contractStatus = opts.contractStatus ?? 'REAL';
  // (b) wrong-invocation: no existing code → nothing to enhance.
  if (!fs.existsSync(opts.apiPath) || !fs.existsSync(opts.typesPath)) {
    return errorResult(opts.feature, 'not-enhance-no-existing-code', contractStatus);
  }
  // (a) data problem: ENHANCE target, but the declared contract is absent.
  const afterPath = opts.afterPath && fs.existsSync(opts.afterPath)
    ? opts.afterPath
    : resolveContractHttp(opts.componentsDir ?? '', opts.specsDir ?? '');
  if (!afterPath || !fs.existsSync(afterPath)) {
    return errorResult(opts.feature, 'missing-declared-contract', contractStatus, afterPath);
  }

  const apiText = fs.readFileSync(opts.apiPath, 'utf8');
  const typesText = fs.readFileSync(opts.typesPath, 'utf8');
  const afterHttpText = fs.readFileSync(afterPath, 'utf8');
  const beforeHttpText = generateBaselineHttp(apiText, typesText, opts.feature);

  const codeMtime = Math.max(fs.statSync(opts.apiPath).mtimeMs, fs.statSync(opts.typesPath).mtimeMs);
  const stale = fs.statSync(afterPath).mtimeMs < codeMtime;

  return reconcile({ beforeHttpText, afterHttpText, apiText, feature: opts.feature, contractStatus, stale, afterPath });
}

// ─── RECONCILE.md (PURE projection of the JSON — no independent logic) ─────────────

const VERDICT_ICON: Record<Verdict, string> = { clean: '✅', changes: '🔧', breaking: '🛑', error: '❌' };

/** Render RECONCILE.md purely from a ReconcileResult. Reads only fields already on the object. */
export function renderReconcileMd(r: ReconcileResult): string {
  const L: string[] = [];
  L.push(`# RECONCILE — ${r.feature}`);
  L.push('');
  L.push(`> Generated by D-cross-2 (ENHANCE, contractStatus=${r.contractStatus}). Deterministic projection of RECONCILE.json — do not hand-edit.`);
  L.push('');
  L.push(`**Verdict: ${VERDICT_ICON[r.verdict]} ${r.verdict.toUpperCase()}**`);
  L.push('');

  if (r.verdict === 'error') {
    L.push(`Fail-closed: \`${r.reason}\`.`);
    L.push('');
    L.push('| reason | cause | meaning |');
    L.push('|---|---|---|');
    L.push(`| \`${r.reason}\` | ${r.reason === 'not-enhance-no-existing-code' ? '(b) wrong invocation' : '(a) data problem'} | ${REASON_HELP[r.reason as ReasonCode] ?? ''} |`);
    L.push('');
    return `${L.join('\n')}\n`;
  }

  L.push(`- BEFORE: baseline-http-gen (\`data/api.ts+types.ts\`) — ${r.before.shapes} shape(s), ${r.before.routes} route(s)`);
  L.push(`- AFTER: declared contract \`${r.after.path || '(inline)'}\` — ${r.after.shapes} shape(s)`);
  L.push(`- Compared shapes: ${r.comparedShapes} · Verified fields: ${r.verifiedFields}${r.stale ? ' · ⚠️ AFTER contract is older than the code (mtime)' : ''}`);
  L.push('');
  const s = r.summary;
  L.push(`Summary — added ${s.added} · removed ${s.removed} · type_changed ${s.type_changed} · optionality_changed ${s.optionality_changed} · suspected_rename ${s.suspected_rename} · **breaking ${s.breaking}**`);
  L.push('');

  const breakingChanges = r.endpoints.flatMap((e) => e.changes.filter((c) => c.breaking).map((c) => ({ e: e.endpoint, c })));
  if (breakingChanges.length > 0) {
    L.push('## 🛑 Breaking changes (checkpoint STOP)');
    L.push('');
    for (const { e, c } of breakingChanges) L.push(`- \`${e}\` · \`${c.path}\` — ${c.kind} (${c.before ?? '—'} → ${c.after ?? '—'})`);
    L.push('');
  }

  for (const ep of r.endpoints) {
    L.push(`## ${ep.endpoint}`);
    if (ep.skipped) { L.push(''); L.push(`_skipped: ${ep.skipped}_`); L.push(''); continue; }
    if (ep.changes.length === 0) { L.push(''); L.push('_no changes_'); L.push(''); continue; }
    L.push('');
    L.push('| kind | path | before | after | breaking | class |');
    L.push('|---|---|---|---|---|---|');
    for (const c of ep.changes) {
      L.push(`| ${c.kind} | \`${c.path}\` | ${c.before ?? '—'} | ${c.after ?? '—'} | ${c.breaking ? '**yes**' : 'no'} | ${c.class} |`);
    }
    L.push('');
  }
  return `${L.join('\n')}\n`;
}

const REASON_HELP: Record<ReasonCode, string> = {
  'not-enhance-no-existing-code': 'No existing api.ts/types.ts — this is not an ENHANCE target; do not run D-cross-2 here.',
  'missing-declared-contract': 'Existing feature, but its declared .full.http was not found — produce/restore it.',
  'malformed-existing-code': 'The existing code parsed to 0 routes/shapes — repair api.ts/types.ts.',
  'malformed-contract': 'The declared contract parsed to 0 shapes — repair the .full.http EXPECTED RESPONSE SHAPES.',
  'same-source-degeneracy': 'The AFTER contract is itself a baseline mirror of the code — no independent contract to reconcile.',
  'vacuous-no-compared-shapes': 'No shape name was present on both sides — nothing was compared; cannot assert "clean".',
};

// ─── CLI ──────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /d-cross-2\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const apiPath = arg('--api');
  const typesPath = arg('--types');
  const feature = arg('--feature');
  if (!apiPath || !typesPath || !feature) {
    console.error('Usage: d-cross-2.ts --api <api.ts> --types <types.ts> --feature <Name> [--after <.http>] [--components <dir>] [--specs <dir>] [--out-dir <dir>]');
    process.exit(2);
  }
  const result = reconcileFeature({
    apiPath, typesPath, feature,
    afterPath: arg('--after'),
    componentsDir: arg('--components') ?? path.join('docs', 'components', feature),
    specsDir: arg('--specs') ?? path.join('docs', 'specs', feature),
  });

  const outDir = arg('--out-dir') ?? path.join('docs', 'components', feature);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'RECONCILE.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'RECONCILE.md'), renderReconcileMd(result), 'utf8');

  if (result.verdict === 'error') {
    console.error(`❌ D-cross-2 fail-closed: ${result.reason}`);
  } else {
    console.log(`${VERDICT_ICON[result.verdict]} D-cross-2 verdict: ${result.verdict} — added ${result.summary.added}, removed ${result.summary.removed}, type_changed ${result.summary.type_changed}, optionality_changed ${result.summary.optionality_changed}, breaking ${result.summary.breaking}`);
  }
  console.log(`   → ${path.join(outDir, 'RECONCILE.json')} + RECONCILE.md`);
  process.exit(result.verdict === 'error' || result.verdict === 'breaking' ? 1 : 0);
}
