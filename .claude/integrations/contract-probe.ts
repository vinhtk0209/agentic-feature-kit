#!/usr/bin/env node
/**
 * contract-probe.ts — verify a feature's API contract against its TypeScript types.
 *
 * THE PROBLEM IT CATCHES: api.ts blind-casts a raw HTTP response as a typed value (e.g. `transformResponse(data) as SomeType`), so
 * there is ZERO runtime validation that the backend's response actually matches the
 * types the app relies on. If the contract and the types drift — a hallucinated field,
 * a renamed key, a wrong primitive — nothing fails until USE_MOCK flips off and it
 * breaks silently in production. This probe makes that drift visible at build time.
 *
 * WHAT IT COMPARES (mode B — no OpenAPI spec):
 *   contract  = the mock responses in the `.http` file comments (snake_case)
 *   expected  = the interfaces in data/types.ts (camelCase), extracted via the
 *               TypeScript compiler API (NOT regex — so this tool can't itself
 *               hallucinate a shape)
 *   mapping   = data/api.ts `Promise<T>` return type per endpoint URL
 *
 * It snake→camel's the contract (mirroring a typical response transform) and structurally diffs:
 *   - missing:       a required type field absent from the response  → error
 *   - type_mismatch: leaf primitive differs / non-nullable got null  → error
 *   - extra:         response field not modeled in the type          → warn
 *   - unmapped:      an endpoint with no matching api.ts return type → warn
 *   - no_response:   endpoint has no JSON body (blob / 204)          → info (skipped)
 *
 * Live mode is intentionally out of scope here (policy: advisory, USE_MOCK=true). When
 * the real API is integrated, swap the `.http` mock comments for live captures and the
 * same differ applies.
 *
 * Usage:
 *   npx tsx .claude/integrations/contract-probe.ts \
 *     --http docs/specs/AnalyzeData/AnalyzeData.full.http \
 *     --types src/sample-app/analyze-data/data/types.ts \
 *     --api   src/sample-app/analyze-data/data/api.ts \
 *     [--get-only] [--gate] [--json]
 *
 * Exit code: 0 by default (advisory). With --gate: 1 if any error-level finding.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type FieldType =
  | { kind: 'primitive'; name: 'string' | 'number' | 'boolean' | 'unknown'; nullable: boolean }
  | { kind: 'ref'; name: string; nullable: boolean }
  | { kind: 'array'; element: FieldType; nullable: boolean };

export interface Field { name: string; optional: boolean; type: FieldType; }
export type Shape = Map<string, Field>;

export interface ContractFinding {
  endpoint: string;
  level: 'error' | 'warn' | 'info';
  kind: 'missing' | 'type_mismatch' | 'extra' | 'unmapped' | 'no_response' | 'fallback_masking' | 'suspect_value';
  path: string;
  msg: string;
}

export interface ProbeInput {
  httpText: string;
  typesText: string;
  apiText: string;
  getOnly?: boolean;
}

// ─── types.ts → interface shapes (via TS AST) ────────────────────────────────────

function isNullish(t: ts.TypeNode): boolean {
  if (t.kind === ts.SyntaxKind.NullKeyword || t.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword) return true;
  return false;
}

function parseType(t: ts.TypeNode): FieldType {
  if (ts.isUnionTypeNode(t)) {
    const nonNull = t.types.filter((x) => !isNullish(x));
    const nullable = nonNull.length !== t.types.length;
    const inner = parseType(nonNull[0] ?? t.types[0]);
    return { ...inner, nullable: nullable || inner.nullable };
  }
  if (ts.isArrayTypeNode(t)) {
    return { kind: 'array', element: parseType(t.elementType), nullable: false };
  }
  if (ts.isTypeReferenceNode(t)) {
    const name = t.typeName.getText();
    if (name === 'Array' && t.typeArguments && t.typeArguments[0]) {
      return { kind: 'array', element: parseType(t.typeArguments[0]), nullable: false };
    }
    return { kind: 'ref', name, nullable: false };
  }
  switch (t.kind) {
    case ts.SyntaxKind.StringKeyword: return { kind: 'primitive', name: 'string', nullable: false };
    case ts.SyntaxKind.NumberKeyword: return { kind: 'primitive', name: 'number', nullable: false };
    case ts.SyntaxKind.BooleanKeyword: return { kind: 'primitive', name: 'boolean', nullable: false };
    default: return { kind: 'primitive', name: 'unknown', nullable: false };
  }
}

export function extractInterfaces(src: string): Map<string, Shape> {
  const sf = ts.createSourceFile('types.ts', src, ts.ScriptTarget.Latest, true);
  const out = new Map<string, Shape>();
  sf.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;
    const shape: Shape = new Map();
    node.members.forEach((m) => {
      if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.type) {
        shape.set(m.name.text, { name: m.name.text, optional: !!m.questionToken, type: parseType(m.type) });
      }
    });
    out.set(node.name.text, shape);
  });
  return out;
}

// ─── api.ts → endpoint → return type ─────────────────────────────────────────────

export interface RouteType {
  method: string;
  path: string;
  typeName: string;
  isArray: boolean;
  /**
   * Raw resolved URL BEFORE `normalizePath` (query string + `${param}` placeholders intact).
   * `path` is normalized for comparison (params→`:p`, query stripped) and cannot drive an `.http`
   * request line; `rawPath` is the emit-ready source for the baseline `.http` generator. Optional:
   * the contract-probe verifier never reads it — only `baseline-http-gen.ts` does.
   */
  rawPath?: string;
}

export function normalizePath(tpl: string): string {
  const i = tpl.indexOf('/api');
  let p = i >= 0 ? tpl.slice(i) : tpl;
  p = p.replace(/\$\{[^}]+\}/g, ':p').replace(/\{\{[^}]+\}\}/g, ':p');
  return p.split(/[?\s]/)[0].replace(/\/+$/, '');
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

/** Raw text of a template/string literal with the outer delimiters stripped, `${…}` preserved. */
function literalText(node: ts.Node): string | null {
  if (
    ts.isTemplateExpression(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isStringLiteral(node)
  ) {
    let t = node.getText();
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '`' || first === "'" || first === '"') && last === first) t = t.slice(1, -1);
    return t;
  }
  return null;
}

/** First `return <template/string>` in a block, if any (URL-builder helpers use this shape). */
function returnLiteral(block: ts.Block): string | null {
  for (const stmt of block.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      const t = literalText(stmt.expression);
      if (t !== null) return t;
    }
  }
  return null;
}

/** Textually expand `${helper(...)}` occurrences using the helper-template map (bounded recursion). */
function expandTemplate(tpl: string, helpers: Map<string, string>): string {
  let out = tpl;
  for (let i = 0; i < 10; i += 1) {
    let changed = false;
    out = out.replace(/\$\{\s*([A-Za-z0-9_]+)\s*\([^}]*\)\s*\}/g, (whole, fn) => {
      if (helpers.has(fn)) { changed = true; return helpers.get(fn) as string; }
      return whole;
    });
    if (!changed) break;
  }
  return out;
}

/**
 * api.ts → endpoint return types (TS Compiler API — NOT regex).
 *
 * Handles BOTH real-feature convention (`export async function getX(): Promise<T>` + a URL-builder
 * helper call `getXUrl(id)`) AND the older inline convention (`export const getX = async (): Promise<T>
 * => { …get(`…`)… }`). URL-builder helpers are resolved to their literal path so `normalizePath`
 * yields the same path the `.http` request line does. Output interface is unchanged (RouteType[]).
 */
export function parseApiReturnTypes(apiText: string): RouteType[] {
  const sf = ts.createSourceFile('api.ts', apiText, ts.ScriptTarget.Latest, true);

  // Pass 1: collect URL-builder helpers (const arrow / function returning a single template/string).
  const helpers = new Map<string, string>();
  sf.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isArrowFunction(decl.initializer)) {
          const body = decl.initializer.body;
          const t = ts.isBlock(body) ? returnLiteral(body) : literalText(body);
          if (t !== null) helpers.set(decl.name.text, t);
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const t = returnLiteral(node.body);
      if (t !== null) helpers.set(node.name.text, t);
    }
  });

  // Pass 2: collect endpoints (function-likes with a Promise<T> return type + an http-method call).
  const out: RouteType[] = [];

  const returnTypeInfo = (typeNode: ts.TypeNode | undefined): { typeName: string; isArray: boolean } | null => {
    if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return null;
    if (typeNode.typeName.getText() !== 'Promise' || !typeNode.typeArguments || !typeNode.typeArguments[0]) return null;
    let inner: ts.TypeNode = typeNode.typeArguments[0];
    let isArray = false;
    if (ts.isArrayTypeNode(inner)) { isArray = true; inner = inner.elementType; }
    else if (ts.isTypeReferenceNode(inner) && inner.typeName.getText() === 'Array' && inner.typeArguments?.[0]) {
      isArray = true; inner = inner.typeArguments[0];
    }
    const typeName = ts.isTypeReferenceNode(inner) ? inner.typeName.getText() : inner.getText();
    return { typeName, isArray };
  };

  const findHttpCall = (body: ts.Node): { method: string; urlArg: ts.Expression } | null => {
    let hit: { method: string; urlArg: ts.Expression } | null = null;
    const visit = (n: ts.Node): void => {
      if (hit) return;
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const m = n.expression.name.text.toLowerCase();
        if (HTTP_METHODS.has(m) && n.arguments.length > 0) {
          hit = { method: m.toUpperCase(), urlArg: n.arguments[0] };
          return;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
    return hit;
  };

  const resolveUrl = (arg: ts.Expression): string | null => {
    // Helper call: getXUrl(...) → expand its template.
    if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) && helpers.has(arg.expression.text)) {
      return expandTemplate(helpers.get(arg.expression.text) as string, helpers);
    }
    // Inline template/string literal.
    const t = literalText(arg);
    if (t !== null) return expandTemplate(t, helpers);
    return null;
  };

  const handle = (typeNode: ts.TypeNode | undefined, body: ts.Node | undefined): void => {
    const rt = returnTypeInfo(typeNode);
    if (!rt || !body) return;
    const call = findHttpCall(body);
    if (!call) return;
    const url = resolveUrl(call.urlArg);
    if (url === null) return;
    out.push({ method: call.method, path: normalizePath(url), typeName: rt.typeName, isArray: rt.isArray, rawPath: url });
  };

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.body) {
      handle(node.type, node.body);
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          handle(decl.initializer.type, decl.initializer.body);
        }
      }
    }
  });

  return out;
}

// ─── .http contract-file resolution (B11 lookup) ─────────────────────────────────

/**
 * f2-resolver-hardening: pickHttpFile used to silently pick the first `Array.find` match
 * (effectively `fs.readdirSync` order) whenever a directory held more than one `.http`
 * candidate at the winning tier. That is not a real selection signal — it fails closed here
 * instead, unless exactly one candidate carries the explicit `.primary.http`/`.primary.full.http`
 * marker (rename the intended file to add `.primary` before `.http` to disambiguate).
 */
export class AmbiguousHttpFileError extends Error {
  constructor(public readonly candidates: string[], public readonly dir?: string) {
    super(
      `tierB-http-contract-ambiguous: ${candidates.length} .http candidates found` +
      `${dir ? ` in ${dir}` : ''} (${candidates.join(', ')}) and none uniquely carries an ` +
      `explicit ".primary.http"/".primary.full.http" selection marker. Rename the intended ` +
      'file to add ".primary" before ".http", or remove the extra candidates.',
    );
    this.name = 'AmbiguousHttpFileError';
  }
}

/** Pick the best `.http` from a filename list: prefer `*.full.http`, else any `*.http`, else ''.
 *  Fails closed (throws `AmbiguousHttpFileError`) if more than one candidate exists at the
 *  winning tier and no single `.primary.http`/`.primary.full.http` marker resolves it. */
export function pickHttpFile(files: string[], dir?: string): string {
  const pickTier = (candidates: string[], primarySuffix: string): string => {
    if (candidates.length === 0) return '';
    if (candidates.length === 1) return candidates[0];
    const primary = candidates.filter((f) => f.endsWith(primarySuffix));
    if (primary.length === 1) return primary[0];
    throw new AmbiguousHttpFileError(primary.length > 1 ? primary : candidates, dir);
  };

  const fullCandidates = files.filter((f) => f.endsWith('.full.http'));
  if (fullCandidates.length > 0) return pickTier(fullCandidates, '.primary.full.http');

  const plainCandidates = files.filter((f) => f.endsWith('.http'));
  if (plainCandidates.length > 0) return pickTier(plainCandidates, '.primary.http');

  return '';
}

/**
 * Resolve a feature's `.http` contract for the B11 probe. The flagship writes it to
 * `docs/components/<Feature>/<Feature>.full.http` (B8.6), so look there first; fall back to
 * `docs/specs/<Feature>/`. Returns '' if neither has one. Propagates `AmbiguousHttpFileError`
 * (fail-closed) rather than swallowing it into a silent pick.
 */
export function resolveContractHttp(componentsDir: string, specsDir: string): string {
  const inDir = (dir: string): string => {
    let files: string[];
    try { files = fs.readdirSync(dir); } catch { return ''; }
    const hit = pickHttpFile(files, dir);
    return hit ? path.join(dir, hit) : '';
  };
  const inComponents = inDir(componentsDir);
  return inComponents || inDir(specsDir);
}

// ─── .http → endpoints + mock JSON ───────────────────────────────────────────────

export interface HttpEndpoint { method: string; path: string; json: unknown | null; deferReason?: string; }

function extractMockJson(block: string): unknown | null {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /#\s*Mock response:/i.test(l));
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim().startsWith('#')) break; // comment block ended
    const stripped = raw.replace(/^\s*#\s?/, '');
    if (/^HTTP\/\d/.test(stripped)) continue;          // status line
    if (/^(Content-Type|Content-Disposition):/i.test(stripped)) continue; // headers
    if (/^<.*>$/.test(stripped.trim())) continue;      // <binary blob>
    body.push(stripped);
  }
  const text = body.join('\n').trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** §17.7.2: extract a `# DEFER: <reason>` marker from a request-block, if present. Mirrors
 *  `extractMockJson` — scans the block's comment lines for the first DEFER marker. Returns the
 *  reason text (trimmed), or null. The §-anchor requirement on the reason is enforced downstream
 *  in `deriveFeatureEndpoints` (§17.7.3), not here — this parser only surfaces the raw reason. */
function extractDefer(block: string): string | null {
  const m = block.match(/^#\s*DEFER:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

export function parseHttp(httpText: string): HttpEndpoint[] {
  const blocks = httpText.split(/^###.*$/m);
  const out: HttpEndpoint[] = [];
  for (const block of blocks) {
    const req = block.match(/^\s*(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/m);
    if (!req) continue;
    const ep: HttpEndpoint = { method: req[1].toUpperCase(), path: normalizePath(req[2]), json: extractMockJson(block) };
    const defer = extractDefer(block);
    if (defer) ep.deferReason = defer;
    out.push(ep);
  }
  return out;
}

// ─── snake_case → camelCase (mirrors a typical response transform) ────────────────────────────

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
function camelKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camelKeys);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) o[toCamel(k)] = camelKeys((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

// ─── Shape diff ──────────────────────────────────────────────────────────────────

function pushUnique(findings: ContractFinding[], f: ContractFinding) {
  if (!findings.some((x) => x.endpoint === f.endpoint && x.kind === f.kind && x.path === f.path)) findings.push(f);
}

function compareValue(
  endpoint: string, pathStr: string, value: unknown, ft: FieldType,
  interfaces: Map<string, Shape>, findings: ContractFinding[],
) {
  if (value === null || value === undefined) {
    if (!ft.nullable) {
      pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `type is non-nullable but contract value is null` });
    }
    return;
  }
  if (ft.kind === 'primitive') {
    if (ft.name === 'unknown') return;
    const actual = typeof value;
    if (actual !== ft.name) {
      pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `type expects ${ft.name} but contract has ${actual}` });
    }
    return;
  }
  if (ft.kind === 'array') {
    if (!Array.isArray(value)) {
      pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `type expects an array but contract has ${typeof value}` });
      return;
    }
    if (value.length > 0) compareValue(endpoint, `${pathStr}[0]`, value[0], ft.element, interfaces, findings);
    return;
  }
  // ref
  const shape = interfaces.get(ft.name);
  if (!shape) return; // unknown ref (e.g. external type) — can't verify
  if (typeof value !== 'object' || Array.isArray(value)) {
    pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `type expects object ${ft.name} but contract has ${Array.isArray(value) ? 'array' : typeof value}` });
    return;
  }
  compareShape(endpoint, pathStr, value as Record<string, unknown>, shape, interfaces, findings);
}

function compareShape(
  endpoint: string, pathStr: string, obj: Record<string, unknown>, shape: Shape,
  interfaces: Map<string, Shape>, findings: ContractFinding[],
) {
  for (const [fname, field] of shape) {
    const here = pathStr ? `${pathStr}.${fname}` : fname;
    if (!(fname in obj)) {
      if (!field.optional) {
        pushUnique(findings, { endpoint, level: 'error', kind: 'missing', path: here, msg: `type requires "${fname}" but the contract response has no such field` });
      }
      continue;
    }
    compareValue(endpoint, here, obj[fname], field.type, interfaces, findings);
  }
  for (const key of Object.keys(obj)) {
    if (!shape.has(key)) {
      const here = pathStr ? `${pathStr}.${key}` : key;
      pushUnique(findings, { endpoint, level: 'warn', kind: 'extra', path: here, msg: `contract returns "${key}" which is not modeled in the type` });
    }
  }
}

// ─── L-09 drift classes ──────────────────────────────────────────────────────────

/**
 * fallback_masking (error): the FE accesses a type-modeled field with a ?? fallback in
 * api/transform code, AND that field is absent from the contract response.
 * The fallback renders a default value (e.g. 0 / '' / false), silently hiding the gap.
 */
export function extractNullishFields(apiText: string): Set<string> {
  const out = new Set<string>();
  // Match .fieldName ?? <literal> OR ?.fieldName ?? <literal>
  const re = /(?:\?\.|\.)(\w+)\s*\?\?\s*(?:\d+(?:\.\d+)?|''|""|false|true|null|'[^']*'|"[^"]*")/g;
  let m;
  while ((m = re.exec(apiText)) !== null) out.add(m[1]);
  return out;
}

export function detectFallbackMasking(
  endpoint: string,
  contractObj: Record<string, unknown>,
  shape: Shape,
  nullishFields: Set<string>,
  findings: ContractFinding[],
): void {
  for (const fieldName of nullishFields) {
    if (!shape.has(fieldName)) continue; // not a modeled type field — skip
    if (!(fieldName in contractObj)) {
      pushUnique(findings, {
        endpoint, level: 'error', kind: 'fallback_masking', path: fieldName,
        msg: `"${fieldName}" is modeled in the type but absent from the contract; the FE reads it with a ?? fallback — renders the fallback value, masking the missing field`,
      });
    }
  }
}

/**
 * suspect_value (warn): two string fields in the contract response share the same
 * non-empty value, suggesting wrong-field data (e.g. text === id from the backend).
 * Flags for human review — the mock may not reflect real backend behavior.
 */
export function detectSuspectValues(
  endpoint: string,
  obj: Record<string, unknown>,
  shape: Shape,
  findings: ContractFinding[],
): void {
  const seen = new Map<string, string>(); // value → first fieldName with that value
  for (const [fieldName, value] of Object.entries(obj)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (!shape.has(fieldName)) continue; // extra field (already flagged) — skip
    if (seen.has(value)) {
      const otherField = seen.get(value)!;
      pushUnique(findings, {
        endpoint, level: 'warn', kind: 'suspect_value',
        path: `${otherField}/${fieldName}`,
        msg: `"${otherField}" and "${fieldName}" both equal "${value.slice(0, 40)}" — possible wrong-field data (e.g. text === id); verify the mock response reflects real backend behavior`,
      });
    } else {
      seen.set(value, fieldName);
    }
  }
}

// ─── EXPECTED RESPONSE SHAPES → contract shapes (TS-prose format, shape-vs-shape) ──

/**
 * Parse the `### EXPECTED RESPONSE SHAPES` section of a flagship-generated `.http` into the same
 * Shape/FieldType model `extractInterfaces` produces. It normalizes the comment-prefixed TS prose
 * back into compilable TS and reuses `extractInterfaces` (so the field parsing is identical to the
 * types.ts side). Returns an empty map if the section is absent. `type X = union` aliases stay
 * unmodeled — the same known caveat as extractInterfaces.
 */
export function parseExpectedShapes(httpText: string): Map<string, Shape> {
  const lines = httpText.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /EXPECTED RESPONSE SHAPES/i.test(l));
  if (start < 0) return new Map();

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const stripped = lines[i].replace(/^\s*#+\s?/, '').replace(/^\s*\/\/\s?/, '');
    const trimmed = stripped.trim();
    if (/^-{2,}/.test(trimmed)) continue; // --- Endpoint N: … --- markers
    if (/^={3,}/.test(trimmed)) continue; // ===== decorators
    body.push(stripped);
  }

  let src = body.join('\n');
  // `Name[] where Name {` → `Name {`  (array-response header form)
  src = src.replace(/^\s*[A-Za-z0-9_]+\s*\[\]\s+where\s+([A-Za-z0-9_]+\s*\{)/gm, '$1');
  // bare `Name {` opener (no keyword) → `interface Name {`
  src = src.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*\{)/gm, '$1interface $2$3');
  // `Name = …` type alias → `type Name = …` (keeps it compilable; extractInterfaces ignores it)
  src = src.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)/gm, '$1type $2$3');

  return extractInterfaces(src);
}

function fmtFieldType(ft: FieldType): string {
  if (ft.kind === 'primitive') return ft.name;
  if (ft.kind === 'array') return `${fmtFieldType(ft.element)}[]`;
  return ft.name;
}

/** Type-vs-type field compare (contract field vs types.ts field). Advisory: unresolvable refs skip. */
function compareFieldType(
  endpoint: string, pathStr: string, ct: FieldType, tt: FieldType,
  contractShapes: Map<string, Shape>, typesShapes: Map<string, Shape>,
  findings: ContractFinding[], seen: Set<string>, stats: { n: number },
): void {
  if (ct.kind === 'array' || tt.kind === 'array') {
    if (ct.kind !== 'array' || tt.kind !== 'array') {
      pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `contract ${fmtFieldType(ct)} vs data/types.ts ${fmtFieldType(tt)} (array mismatch)` });
      return;
    }
    compareFieldType(endpoint, `${pathStr}[0]`, ct.element, tt.element, contractShapes, typesShapes, findings, seen, stats);
    return;
  }
  if (ct.kind === 'primitive' && tt.kind === 'primitive') {
    if (ct.name === 'unknown' || tt.name === 'unknown') return; // e.g. a string-literal union — unresolvable, skip
    if (ct.name !== tt.name) {
      pushUnique(findings, { endpoint, level: 'error', kind: 'type_mismatch', path: pathStr, msg: `contract expects ${ct.name} but data/types.ts has ${tt.name}` });
    }
    return;
  }
  if (ct.kind === 'ref' && tt.kind === 'ref' && ct.name === tt.name) {
    compareShapeVsShape(endpoint, pathStr, contractShapes, typesShapes, ct.name, findings, seen, stats);
    return;
  }
  // ref-vs-primitive or differing ref names (e.g. a `type` alias like AssessmentFilterValue) → skip.
}

/**
 * Compare a contract interface against the data/types.ts interface of the same name, field by field.
 * Contract = source of truth: a contract field missing from types.ts is an error; a types.ts field the
 * contract doesn't declare is a warn. Skips silently if either side's interface can't be resolved.
 * `stats.n` counts fields present on BOTH sides — the real like-for-like verifications.
 */
export function compareShapeVsShape(
  endpoint: string, pathStr: string,
  contractShapes: Map<string, Shape>, typesShapes: Map<string, Shape>,
  typeName: string, findings: ContractFinding[], seen: Set<string>, stats: { n: number },
): void {
  const cShape = contractShapes.get(typeName);
  const tShape = typesShapes.get(typeName);
  if (!cShape || !tShape) return; // unresolvable on one side — advisory-safe skip
  const guard = `${typeName}@${pathStr}`;
  if (seen.has(guard)) return;
  seen.add(guard);

  for (const [fname, cField] of cShape) {
    const here = pathStr ? `${pathStr}.${fname}` : fname;
    const tField = tShape.get(fname);
    if (!tField) {
      pushUnique(findings, { endpoint, level: 'error', kind: 'missing', path: here, msg: `contract declares "${fname}" but data/types.ts does not model it` });
      continue;
    }
    stats.n += 1; // present on both sides — a real field verification
    compareFieldType(endpoint, here, cField.type, tField.type, contractShapes, typesShapes, findings, seen, stats);
  }
  for (const [fname] of tShape) {
    if (!cShape.has(fname)) {
      const here = pathStr ? `${pathStr}.${fname}` : fname;
      pushUnique(findings, { endpoint, level: 'warn', kind: 'extra', path: here, msg: `data/types.ts models "${fname}" which the contract does not declare` });
    }
  }
}

/**
 * Shape-vs-shape probe for the real flagship `.http` format (`### EXPECTED RESPONSE SHAPES`).
 * The `.http` carries TS response shapes (source of truth for data/types.ts) rather than mock JSON,
 * so this compares contract interfaces against the generated data/types.ts interfaces per endpoint.
 */
function probeShapeMode(input: ProbeInput): { findings: ContractFinding[]; verifiedFields: number } {
  const typesShapes = extractInterfaces(input.typesText);
  const contractShapes = parseExpectedShapes(input.httpText);
  const routes = parseApiReturnTypes(input.apiText);
  const endpoints = parseHttp(input.httpText);
  const findings: ContractFinding[] = [];
  const stats = { n: 0 };

  for (const ep of endpoints) {
    if (input.getOnly && ep.method !== 'GET') continue;
    const label = `${ep.method} ${ep.path}`;
    const route = routes.find((r) => r.method === ep.method && r.path === ep.path);
    if (!route) {
      findings.push({ endpoint: label, level: 'warn', kind: 'unmapped', path: '', msg: 'no matching api.ts return type for this endpoint' });
      continue;
    }
    if (!contractShapes.has(route.typeName)) {
      findings.push({ endpoint: label, level: 'info', kind: 'no_response', path: '', msg: `no EXPECTED RESPONSE SHAPES entry for ${route.typeName}` });
      continue;
    }
    if (!typesShapes.has(route.typeName)) {
      findings.push({ endpoint: label, level: 'warn', kind: 'unmapped', path: '', msg: `api.ts returns ${route.typeName} but data/types.ts has no such interface` });
      continue;
    }
    compareShapeVsShape(label, '', contractShapes, typesShapes, route.typeName, findings, new Set(), stats);
  }
  return { findings, verifiedFields: stats.n };
}

// ─── Probe ───────────────────────────────────────────────────────────────────────

/**
 * Dispatch by `.http` format: a `# Mock response:` block → the value-vs-type path (legacy / sample-app
 * format); otherwise a `### EXPECTED RESPONSE SHAPES` section → the shape-vs-shape path (real flagship
 * format). `probeContract` keeps its original signature for callers that only need findings.
 */
export function probeContractDetailed(input: ProbeInput): { findings: ContractFinding[]; verifiedFields: number } {
  const hasMockResponse = /#\s*Mock response:/i.test(input.httpText);
  const hasExpectedShapes = /EXPECTED RESPONSE SHAPES/i.test(input.httpText);
  if (!hasMockResponse && hasExpectedShapes) return probeShapeMode(input);
  return { findings: probeValueMode(input), verifiedFields: 0 };
}

export function probeContract(input: ProbeInput): ContractFinding[] {
  return probeContractDetailed(input).findings;
}

function probeValueMode(input: ProbeInput): ContractFinding[] {
  const interfaces = extractInterfaces(input.typesText);
  const routes = parseApiReturnTypes(input.apiText);
  const endpoints = parseHttp(input.httpText);
  const findings: ContractFinding[] = [];

  // L-09: pre-extract nullish fields from api text once; reused per endpoint
  const nullishFields = extractNullishFields(input.apiText);

  for (const ep of endpoints) {
    if (input.getOnly && ep.method !== 'GET') continue;
    const label = `${ep.method} ${ep.path}`;

    const route = routes.find((r) => r.method === ep.method && r.path === ep.path);
    if (!route) {
      findings.push({ endpoint: label, level: 'warn', kind: 'unmapped', path: '', msg: 'no matching api.ts return type for this endpoint' });
      continue;
    }
    const shape = interfaces.get(route.typeName);
    if (!shape) continue; // return type is not a modeled interface (void / Blob) — skip

    if (ep.json === null) {
      findings.push({ endpoint: label, level: 'info', kind: 'no_response', path: '', msg: 'no JSON mock response to verify (blob / 204 / absent)' });
      continue;
    }

    const observed = camelKeys(ep.json);
    if (route.isArray) {
      if (!Array.isArray(observed)) {
        findings.push({ endpoint: label, level: 'error', kind: 'type_mismatch', path: '', msg: `api.ts returns ${route.typeName}[] but contract is not an array` });
        continue;
      }
      if (observed.length > 0) {
        const item = observed[0] as Record<string, unknown>;
        compareShape(label, '', item, shape, interfaces, findings);
        detectFallbackMasking(label, item, shape, nullishFields, findings);
        detectSuspectValues(label, item, shape, findings);
      }
    } else if (observed && typeof observed === 'object' && !Array.isArray(observed)) {
      const obj = observed as Record<string, unknown>;
      compareShape(label, '', obj, shape, interfaces, findings);
      detectFallbackMasking(label, obj, shape, nullishFields, findings);
      detectSuspectValues(label, obj, shape, findings);
    } else {
      findings.push({ endpoint: label, level: 'error', kind: 'type_mismatch', path: '', msg: `api.ts returns object ${route.typeName} but contract is ${Array.isArray(observed) ? 'an array' : typeof observed}` });
    }
  }
  return findings;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /contract-probe\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const httpPath = arg('--http');
  const typesPath = arg('--types');
  const apiPath = arg('--api');
  if (!httpPath || !typesPath || !apiPath) {
    console.error('Usage: contract-probe.ts --http <.http> --types <types.ts> --api <api.ts> [--get-only] [--gate] [--json]');
    process.exit(2);
  }
  const { findings, verifiedFields } = probeContractDetailed({
    httpText: fs.readFileSync(httpPath, 'utf-8'),
    typesText: fs.readFileSync(typesPath, 'utf-8'),
    apiText: fs.readFileSync(apiPath, 'utf-8'),
    getOnly: process.argv.includes('--get-only'),
  });
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, verifiedFields, findings }, null, 2));
  } else {
    console.log(`\n🔌 contract-probe — ${httpPath}\n`);
    if (findings.length === 0) {
      console.log(`   ✅ contract matches types for all mapped endpoints (${verifiedFields} field(s) verified)\n`);
    } else {
      for (const f of findings) {
        const icon = f.level === 'error' ? '❌' : f.level === 'warn' ? '⚠️ ' : 'ℹ️ ';
        console.log(`   ${icon} [${f.kind}] ${f.endpoint}${f.path ? ` · ${f.path}` : ''}\n        ${f.msg}`);
      }
      console.log(`\n   ${errors.length} error(s), ${warns.length} warning(s), ${verifiedFields} field(s) verified\n`);
    }
  }
  process.exit(process.argv.includes('--gate') && errors.length > 0 ? 1 : 0);
}
