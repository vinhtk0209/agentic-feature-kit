#!/usr/bin/env tsx
/**
 * baseline-http-gen.ts — synthesize a baseline `.http` API contract from an EXISTING feature's
 * `data/api.ts` + `data/types.ts`.
 *
 * ENHANCE sub-case: a feature has real code but the kit never produced a `<Feature>.full.http`, so
 * D-cross-2 has nothing to diff Figma-revealed fields against. This synthesizes that baseline
 * FROM the existing code — read-only over the source, emits ONE `.http`. It NEVER edits api.ts /
 * types.ts (§7 never-auto-edit).
 *
 * Output is the canonical `### EXPECTED RESPONSE SHAPES` TS-prose format
 * (`templates/http-contract.template.md`), so the result is round-trip-verifiable by
 * `contract-probe.ts` (probe now parses that format — the 2026-07-08 Wall-2 fix).
 *
 * Reuse (verified 2026-07-08, not assumed — see §12 of design-to-ui-agent-architecture.md):
 *   - routes  ← parseApiReturnTypes()  (4/4 on the real ProgressReports api.ts)
 *   - shapes  ← extractInterfaces()    (10 shapes on the real types.ts)
 * Net-new here = the emitter + `RouteType.rawPath` (added to contract-probe.ts for emit-ready URLs;
 * `RouteType.path` is normalized-for-comparison and drops the query + param names).
 *
 * Standalone tsx; no deps beyond contract-probe + node stdlib.
 *   npx tsx .claude/integrations/baseline-http-gen.ts --api <api.ts> --types <types.ts> \
 *     --feature <Name> [--out <path>] [--check]
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseApiReturnTypes,
  extractInterfaces,
  probeContractDetailed,
  type RouteType,
  type Shape,
  type FieldType,
} from './contract-probe';

// ─── URL helpers ─────────────────────────────────────────────────────────────────

const camelToSnake = (s: string): string => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/**
 * Turn a raw resolved URL (`RouteType.rawPath`, e.g.
 * `${getConfig().API_BASE_URL}/api/.../classes/${classId}/…/?assessment_id=${assessmentId}`)
 * into an emit-ready `.http` request URL: `{{baseUrl}}` + the `/api…` path, with each simple
 * `${ident}` placeholder rewritten to a `{{snake_case}}` variable (query string preserved).
 * Complex `${expr}` (non-identifier) is left verbatim — rare, and flagged by leaving it visible.
 * Returns the set of `{{var}}` names produced (minus baseUrl) so the caller can emit `@var` lines.
 */
export function toRequestUrl(rawPath: string): { url: string; vars: string[] } {
  const apiAt = rawPath.indexOf('/api');
  const pathPart = apiAt >= 0 ? rawPath.slice(apiAt) : rawPath;
  const vars: string[] = [];
  const url = pathPart.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, (_whole, ident: string) => {
    const v = camelToSnake(ident);
    if (!vars.includes(v)) vars.push(v);
    return `{{${v}}}`;
  });
  return { url: `{{baseUrl}}${url}`, vars };
}

const VAR_DEFAULTS: Record<string, string> = { class_id: '1', assessment_id: 'all' };

// ─── Shape rendering (types.ts model → EXPECTED RESPONSE SHAPES prose) ──────────────

/** Render a FieldType back to TS prose that `parseExpectedShapes`→`extractInterfaces` re-parses identically. */
export function renderFieldType(ft: FieldType): string {
  let base: string;
  if (ft.kind === 'primitive') base = ft.name;
  else if (ft.kind === 'array') base = `${renderFieldType(ft.element)}[]`;
  else base = ft.name; // ref (interface OR a type/union alias — round-trips as a ref-vs-ref skip)
  return ft.nullable ? `${base} | null` : base;
}

/** All interface refs reachable from a field type (arrays unwrapped). */
function refsOf(ft: FieldType, acc: Set<string>): void {
  if (ft.kind === 'ref') acc.add(ft.name);
  else if (ft.kind === 'array') refsOf(ft.element, acc);
}

/**
 * Ordered transitive closure of interface names reachable from the given roots, restricted to names
 * that actually exist in `shapes` (type/union aliases are refs but not interfaces → skipped, so they
 * are never fabricated — the same caveat `extractInterfaces` has). Roots first, then dependencies.
 */
export function reachableInterfaces(roots: string[], shapes: Map<string, Shape>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const shape = shapes.get(name);
    if (!shape) return; // not an interface (alias / external) — don't emit
    out.push(name);
    const nested = new Set<string>();
    for (const [, field] of shape) refsOf(field.type, nested);
    for (const n of nested) visit(n);
  };
  for (const r of roots) visit(r);
  return out;
}

/** One interface → `#`-commented multi-line prose block (bare-opener form parseExpectedShapes expects). */
function renderInterface(name: string, shape: Shape): string {
  const lines = [`# ${name} {`];
  for (const [, field] of shape) {
    lines.push(`#   ${field.name}${field.optional ? '?' : ''}: ${renderFieldType(field.type)};`);
  }
  lines.push('# }');
  return lines.join('\n');
}

// ─── Emit ───────────────────────────────────────────────────────────────────────

export interface EmitInput { routes: RouteType[]; shapes: Map<string, Shape>; featureName: string; }

/** Build the full baseline `.http` string. Pure — no I/O. */
export function emitContract({ routes, shapes, featureName }: EmitInput): string {
  const reqs = routes.map((r) => {
    const raw = r.rawPath ?? r.path;
    return { route: r, ...toRequestUrl(raw) };
  });

  // Collect vars across all request lines, preserving encounter order.
  const varOrder: string[] = [];
  for (const rq of reqs) for (const v of rq.vars) if (!varOrder.includes(v)) varOrder.push(v);

  const header = [
    `### ${featureName} — API Contract (baseline, generated from data/api.ts + data/types.ts)`,
    '### CONTRACT: baseline — synthesized from existing code (NOT a spec). Verify against backend.',
    '### Base URL host only (HR26): {{baseUrl}} = {{API_BASE_URL}} (e.g. https://studio.example.com)',
    '### All /api/... path segments appear literally below.',
    '',
    '@baseUrl = {{API_BASE_URL}}',
    ...varOrder.map((v) => `@${v} = ${VAR_DEFAULTS[v] ?? ''}`),
  ].join('\n');

  const requestBlocks = reqs.map((rq, i) => {
    const arr = rq.route.isArray ? '[]' : '';
    const block = [
      `### ${i + 1}. ${rq.route.method} ${rq.route.typeName}${arr}`,
      `# Return type (from data/api.ts): ${rq.route.typeName}${arr}`,
      '# FE calls: ✅',
      `${rq.route.method} ${rq.url}`,
      'Accept: application/json',
    ];
    if (rq.route.method !== 'GET') {
      block.push('Content-Type: application/json', '', '{}');
    }
    return block.join('\n');
  });

  // EXPECTED RESPONSE SHAPES: each endpoint's return type, then remaining referenced interfaces.
  const rootTypes = routes.map((r) => r.typeName);
  const ordered = reachableInterfaces(rootTypes, shapes);
  const emittedRoots = new Set<string>();
  const shapeLines: string[] = [
    '### =====================================================================',
    '### EXPECTED RESPONSE SHAPES  (source of truth for data/types.ts)',
    '### =====================================================================',
  ];
  routes.forEach((r, i) => {
    const s = shapes.get(r.typeName);
    if (!s || emittedRoots.has(r.typeName)) return;
    emittedRoots.add(r.typeName);
    shapeLines.push('', `# --- Endpoint ${i + 1}: ${r.method} ${r.path} → ${r.typeName}${r.isArray ? '[]' : ''} ---`);
    shapeLines.push(renderInterface(r.typeName, s));
  });
  const nested = ordered.filter((n) => !emittedRoots.has(n));
  if (nested.length) {
    shapeLines.push('', '# --- Referenced types ---');
    for (const n of nested) shapeLines.push(renderInterface(n, shapes.get(n) as Shape));
  }

  return `${header}\n\n${requestBlocks.join('\n\n')}\n\n${shapeLines.join('\n')}\n`;
}

/** Read api.ts + types.ts, extract, emit. Convenience wrapper over the pure `emitContract`. */
export function generateBaselineHttp(apiText: string, typesText: string, featureName: string): string {
  return emitContract({
    routes: parseApiReturnTypes(apiText),
    shapes: extractInterfaces(typesText),
    featureName,
  });
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /baseline-http-gen\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const apiPath = arg('--api');
  const typesPath = arg('--types');
  const feature = arg('--feature');
  if (!apiPath || !typesPath || !feature) {
    console.error('Usage: baseline-http-gen.ts --api <api.ts> --types <types.ts> --feature <Name> [--out <path>] [--check]');
    process.exit(2);
  }
  const apiText = fs.readFileSync(apiPath, 'utf8');
  const typesText = fs.readFileSync(typesPath, 'utf8');
  const http = generateBaselineHttp(apiText, typesText, feature);

  const outPath = arg('--out') ?? path.join('docs', 'components', feature, `${feature}.full.http`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, http, 'utf8');
  console.log(`✍️  baseline contract written → ${outPath}`);

  if (process.argv.includes('--check')) {
    // Round-trip: the emitted contract must be probe-verifiable against the SAME types.ts.
    const { findings, verifiedFields } = probeContractDetailed({ httpText: http, typesText, apiText });
    const errors = findings.filter((f) => f.level === 'error');
    if (errors.length === 0 && verifiedFields > 0) {
      console.log(`   ✅ round-trip OK — ${verifiedFields} field(s) verified, 0 errors`);
    } else {
      console.log(`   ❌ round-trip FAILED — ${errors.length} error(s), ${verifiedFields} verified`);
      for (const f of errors) console.log(`      [${f.kind}] ${f.endpoint} · ${f.path} — ${f.msg}`);
      process.exit(1);
    }
  }
}
