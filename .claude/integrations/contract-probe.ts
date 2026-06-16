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

export interface RouteType { method: string; path: string; typeName: string; isArray: boolean; }

export function normalizePath(tpl: string): string {
  const i = tpl.indexOf('/api');
  let p = i >= 0 ? tpl.slice(i) : tpl;
  p = p.replace(/\$\{[^}]+\}/g, ':p').replace(/\{\{[^}]+\}\}/g, ':p');
  return p.split(/[?\s]/)[0].replace(/\/+$/, '');
}

export function parseApiReturnTypes(apiText: string): RouteType[] {
  const out: RouteType[] = [];
  const chunks = apiText.split(/export const /).slice(1);
  for (const chunk of chunks) {
    const ret = chunk.match(/:\s*Promise<\s*([A-Za-z0-9_]+)\s*(\[\])?\s*>/);
    const url = chunk.match(/\.(get|delete|post|put|patch)\(\s*`([^`]+)`/);
    if (!ret || !url) continue;
    out.push({ method: url[1].toUpperCase(), path: normalizePath(url[2]), typeName: ret[1], isArray: !!ret[2] });
  }
  return out;
}

// ─── .http → endpoints + mock JSON ───────────────────────────────────────────────

export interface HttpEndpoint { method: string; path: string; json: unknown | null; }

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

export function parseHttp(httpText: string): HttpEndpoint[] {
  const blocks = httpText.split(/^###.*$/m);
  const out: HttpEndpoint[] = [];
  for (const block of blocks) {
    const req = block.match(/^\s*(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/m);
    if (!req) continue;
    out.push({ method: req[1].toUpperCase(), path: normalizePath(req[2]), json: extractMockJson(block) });
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

// ─── Probe ───────────────────────────────────────────────────────────────────────

export function probeContract(input: ProbeInput): ContractFinding[] {
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
  const findings = probeContract({
    httpText: fs.readFileSync(httpPath, 'utf-8'),
    typesText: fs.readFileSync(typesPath, 'utf-8'),
    apiText: fs.readFileSync(apiPath, 'utf-8'),
    getOnly: process.argv.includes('--get-only'),
  });
  const errors = findings.filter((f) => f.level === 'error');
  const warns = findings.filter((f) => f.level === 'warn');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, findings }, null, 2));
  } else {
    console.log(`\n🔌 contract-probe — ${httpPath}\n`);
    if (findings.length === 0) {
      console.log('   ✅ contract matches types for all mapped endpoints\n');
    } else {
      for (const f of findings) {
        const icon = f.level === 'error' ? '❌' : f.level === 'warn' ? '⚠️ ' : 'ℹ️ ';
        console.log(`   ${icon} [${f.kind}] ${f.endpoint}${f.path ? ` · ${f.path}` : ''}\n        ${f.msg}`);
      }
      console.log(`\n   ${errors.length} error(s), ${warns.length} warning(s)\n`);
    }
  }
  process.exit(process.argv.includes('--gate') && errors.length > 0 ? 1 : 0);
}
