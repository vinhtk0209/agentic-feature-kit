#!/usr/bin/env tsx
/**
 * feature-splitter.ts — /split-feature tooling (f4-feature-splitter).
 *
 * See docs/design/spec-intake-ir.md §5-6 for the split-criteria / AC-conservation / naming design.
 * Splits a SpecIR's acceptanceCriteria[] into N sub-features deterministically (tag mode when
 * `[Area: X]` markers are present, size mode otherwise) and proves AC-conservation on its own
 * output before ever returning it — a bug here can never silently drop or duplicate an AC.
 *
 * CLI: npx tsx .claude/integrations/feature-splitter.ts <spec-ir.json> [--max-acs-per-subfeature N] [--json]
 * (the `/split-feature` command writes each sub-feature's spec file from this tool's JSON output —
 * the split DECISION is deterministic tooling, not LLM judgment, per the roadmap's DoD.)
 */

import * as fs from 'fs';
import { SpecIR, SpecAc } from './spec-ir';

export interface SubFeatureSpec {
  name: string;
  acceptanceCriteria: SpecAc[];
  dependsOn: string[];
}

export interface SplitResult {
  parentName: string;
  subFeatures: SubFeatureSpec[];
  order: string[];
  degenerate: boolean;
  warnings: string[];
}

export interface SplitOptions {
  maxAcsPerSubFeature?: number;
}

export class CyclicSplitDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`split-dependency-cycle: ${cycle.join(' -> ')}`);
    this.name = 'CyclicSplitDependencyError';
  }
}

export class AcConservationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`ac-conservation-violated: ${issues.join('; ')}`);
    this.name = 'AcConservationError';
  }
}

const AREA_TAG_RE = /\[Area:\s*([^\]]+)\]/i;
const DEPENDS_ON_RE = /\[DependsOn:\s*([^\]]+)\]/i;
const slugify = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'area';

/**
 * §6 AC-conservation invariant, checkable independently of splitFeature (used both internally,
 * fail-closed before returning, AND exposed for external/attack-test verification).
 */
export function verifyAcConservation(parentAcs: SpecAc[], subFeatures: SubFeatureSpec[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const parentIds = new Set(parentAcs.map((a) => a.id));
  const seen = new Map<string, string>(); // ac id -> owning sub-feature name
  for (const sf of subFeatures) {
    for (const ac of sf.acceptanceCriteria) {
      if (!parentIds.has(ac.id)) { issues.push(`${ac.id} in sub-feature "${sf.name}" is not a parent AC (fabricated)`); continue; }
      if (seen.has(ac.id)) { issues.push(`${ac.id} double-owned by "${seen.get(ac.id)}" and "${sf.name}"`); continue; }
      seen.set(ac.id, sf.name);
    }
  }
  for (const id of parentIds) {
    if (!seen.has(id)) issues.push(`${id} dropped — present in parent, absent from every sub-feature`);
  }
  return { ok: issues.length === 0, issues };
}

function topoSort(names: string[], dependsOn: Map<string, string[]>): string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (n: string, path: string[]): void => {
    const s = state.get(n);
    if (s === 'done') return;
    if (s === 'visiting') throw new CyclicSplitDependencyError([...path, n]);
    state.set(n, 'visiting');
    for (const dep of dependsOn.get(n) ?? []) visit(dep, [...path, n]);
    state.set(n, 'done');
    order.push(n);
  };
  for (const n of names) visit(n, []);
  return order;
}

export function splitFeature(ir: SpecIR, parentName: string, opts: SplitOptions = {}): SplitResult {
  const maxAcs = opts.maxAcsPerSubFeature ?? 5;
  const acs = ir.acceptanceCriteria;
  const warnings: string[] = [];

  const tagged = acs.map((ac) => ({ ac, area: ac.text.match(AREA_TAG_RE)?.[1]?.trim() ?? null }));
  const useTagMode = tagged.some((t) => t.area !== null);

  const groups: Array<{ name: string; acs: SpecAc[] }> = [];
  if (useTagMode) {
    const byArea = new Map<string, SpecAc[]>();
    for (const { ac, area } of tagged) {
      const key = area ?? '(untagged)';
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key)!.push(ac);
    }
    for (const [area, groupAcs] of byArea) {
      groups.push({ name: `${parentName}-${slugify(area)}`, acs: groupAcs });
      if (groupAcs.length > maxAcs) {
        warnings.push(`area "${area}" has ${groupAcs.length} ACs (> max ${maxAcs}) — recommend re-splitting this area`);
      }
    }
  } else {
    for (let i = 0; i < acs.length; i += maxAcs) {
      groups.push({ name: `${parentName}-part${groups.length + 1}`, acs: acs.slice(i, i + maxAcs) });
    }
    if (groups.length === 0) groups.push({ name: `${parentName}-part1`, acs: [] });
  }

  const dependsOn = new Map<string, string[]>();
  const namesInOrder = groups.map((g) => g.name);
  const explicitDeps = acs.some((ac) => DEPENDS_ON_RE.test(ac.text));
  if (explicitDeps) {
    for (const g of groups) {
      const deps = new Set<string>();
      for (const ac of g.acs) {
        const m = ac.text.match(DEPENDS_ON_RE);
        if (m) {
          const depName = m[1].trim();
          const resolved = namesInOrder.find((n) => n === depName || n.endsWith(`-${slugify(depName)}`)) ?? depName;
          if (resolved !== g.name) deps.add(resolved);
        }
      }
      dependsOn.set(g.name, [...deps]);
    }
  } else {
    // Default: linear chain in derivation order (sub-feature N depends on N-1) — acyclic by construction.
    namesInOrder.forEach((n, i) => dependsOn.set(n, i === 0 ? [] : [namesInOrder[i - 1]]));
  }

  const order = topoSort(namesInOrder, dependsOn); // throws CyclicSplitDependencyError on a cycle

  const subFeatures: SubFeatureSpec[] = groups.map((g) => ({
    name: g.name,
    acceptanceCriteria: g.acs,
    dependsOn: dependsOn.get(g.name) ?? [],
  }));

  const degenerate = subFeatures.length === 1;
  if (degenerate) warnings.push('degenerate split: only 1 sub-feature produced (parent may not need splitting)');

  const conservation = verifyAcConservation(acs, subFeatures);
  if (!conservation.ok) throw new AcConservationError(conservation.issues);

  return { parentName, subFeatures, order, degenerate, warnings };
}

// ─── CLI ────────────────────────────────────────────────────────────────────────────────────

function isCli(): boolean {
  return require.main === module;
}

if (isCli()) {
  const args = process.argv.slice(2);
  const jsonPath = args.find((a) => !a.startsWith('--'));
  const maxIdx = args.indexOf('--max-acs-per-subfeature');
  const maxAcsPerSubFeature = maxIdx >= 0 ? Number(args[maxIdx + 1]) : undefined;
  if (!jsonPath) {
    console.error(JSON.stringify({ error: 'usage: feature-splitter.ts <spec-ir.json> [--max-acs-per-subfeature N]' }));
    process.exit(1);
  }
  try {
    const ir = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as SpecIR;
    const parentName = ir.title?.replace(/[^a-zA-Z0-9-]+/g, '-') ?? 'Feature';
    const result = splitFeature(ir, parentName, { maxAcsPerSubFeature });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(JSON.stringify({ error: String(e), name: (e as Error).name }));
    process.exit(1);
  }
}
