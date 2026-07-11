/**
 * d-cross-2.test.ts — tests the ENHANCE reconciliation wrapper (design §13).
 *
 * Acceptance bars specifically required by the task:
 *   - non-vacuity floor (0 compared shapes → error, never clean)
 *   - same-source degeneracy (AFTER is a baseline mirror of BEFORE → error)
 *   - the §13.2 rename-hint rule, incl. a wrong rename guess never hiding a real breaking removal
 *   - both §13.4.1 missing-input sub-causes, asserting the reason codes differ
 * Plus: verdict ladder (clean/changes/breaking), added-class ladder, optionality + the
 * compareFieldType nullability GAP remediation, and RECONCILE.md as a pure projection.
 *
 * Standalone, no jest. Run:  npx tsx .claude/integrations/d-cross-2.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateBaselineHttp } from './baseline-http-gen';
import {
  reconcile,
  reconcileFeature,
  renderReconcileMd,
  fieldTypeEqual,
  type ReconcileResult,
  type Change,
} from './d-cross-2';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// ─── fixtures: one-endpoint feature returning `Widget` ─────────────────────────────

const API = `
import { getHttpClient, getConfig } from 'x';
const getWidgetUrl = (id: string) => \`\${getConfig().API_BASE_URL}/api/widgets/\${id}\`;
export async function getWidget(id: string): Promise<Widget> {
  return getHttpClient().get(getWidgetUrl(id));
}
`;

/** Build a BEFORE baseline .http from api + the given types.ts source (the real pipeline). */
const before = (typesSrc: string): string => generateBaselineHttp(API, typesSrc, 'W');

/** Build an AFTER declared contract .http carrying the given EXPECTED RESPONSE SHAPES blocks. */
function afterHttp(...shapeBlocks: string[]): string {
  return [
    '### 1. widgets',
    'GET {{baseUrl}}/api/widgets/{{id}}',
    'Accept: application/json',
    '',
    '### =====================================================================',
    '### EXPECTED RESPONSE SHAPES',
    '### =====================================================================',
    ...shapeBlocks,
  ].join('\n');
}
const iface = (name: string, ...lines: string[]): string =>
  [`# ${name} {`, ...lines.map((l) => `#   ${l}`), '# }'].join('\n');

const run = (typesSrc: string, afterText: string): ReconcileResult =>
  reconcile({ beforeHttpText: before(typesSrc), afterHttpText: afterText, apiText: API, feature: 'W' });

const changesOf = (r: ReconcileResult): Change[] => r.endpoints.flatMap((e) => e.changes);
const kind = (r: ReconcileResult, k: string): Change[] => changesOf(r).filter((c) => c.kind === k);

const TYPES_BASE = `export interface Widget { id: string; name: string; size: number; }`;

// ─── verdict ladder ────────────────────────────────────────────────────────────────

test('clean: identical shapes → verdict clean, comparedShapes > 0', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;')));
  assert(r.verdict === 'clean', `expected clean, got ${r.verdict} (reason ${r.reason})`);
  assert(r.comparedShapes >= 1, `comparedShapes should be > 0, got ${r.comparedShapes}`);
  assert(r.verifiedFields === 3, `expected 3 verified fields, got ${r.verifiedFields}`);
});

test('added OPTIONAL field → additive, verdict changes, breaking 0', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;', 'color?: string;')));
  const added = kind(r, 'added');
  assert(added.length === 1 && added[0].path === 'color', `expected 1 added 'color', got ${JSON.stringify(added)}`);
  assert(added[0].class === 'additive' && added[0].breaking === false, `expected additive/non-breaking, got ${JSON.stringify(added[0])}`);
  assert(r.verdict === 'changes' && r.summary.breaking === 0, `expected changes/0 breaking, got ${r.verdict}/${r.summary.breaking}`);
});

test('added REQUIRED field → requires-implementation (a TODO gate, NOT breaking) → verdict changes', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;', 'riskBand: string;')));
  const added = kind(r, 'added');
  assert(added.length === 1 && added[0].class === 'requires-implementation', `expected requires-implementation, got ${JSON.stringify(added)}`);
  assert(added[0].breaking === false, 'added-required must not be breaking');
  assert(r.verdict === 'changes', `expected changes, got ${r.verdict}`);
});

test('removed field → breaking (code reads undefined) → verdict breaking', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;')));
  const removed = kind(r, 'removed');
  assert(removed.length === 1 && removed[0].path === 'size', `expected removed 'size', got ${JSON.stringify(removed)}`);
  assert(removed[0].breaking === true && removed[0].class === 'breaking', 'removed must be breaking');
  assert(r.verdict === 'breaking' && r.summary.breaking === 1, `expected breaking/1, got ${r.verdict}/${r.summary.breaking}`);
});

test('type_changed (primitive name) → breaking, with before/after rendered', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: string;')));
  const tc = kind(r, 'type_changed');
  assert(tc.length === 1 && tc[0].path === 'size', `expected type_changed 'size', got ${JSON.stringify(tc)}`);
  assert(tc[0].before === 'number' && tc[0].after === 'string', `expected number→string, got ${tc[0].before}→${tc[0].after}`);
  assert(tc[0].breaking === true && r.verdict === 'breaking', 'type_changed must be breaking');
});

// ─── optionality (compareFieldType ignores Field.optional — net-new pass) ───────────

test('optionality optional→required = breaking; required→optional = additive', () => {
  const beforeOpt = `export interface Widget { id: string; name: string; size?: number; }`;
  // optional (before) → required (after): breaking
  const r1 = run(beforeOpt, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;')));
  const oc1 = kind(r1, 'optionality_changed');
  assert(oc1.length === 1 && oc1[0].breaking === true && oc1[0].class === 'breaking', `optional→required must be breaking: ${JSON.stringify(oc1)}`);
  assert(r1.verdict === 'breaking', `expected breaking, got ${r1.verdict}`);
  // required (before) → optional (after): additive
  const r2 = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size?: number;')));
  const oc2 = kind(r2, 'optionality_changed');
  assert(oc2.length === 1 && oc2[0].breaking === false && oc2[0].class === 'additive', `required→optional must be additive: ${JSON.stringify(oc2)}`);
  assert(r2.verdict === 'changes', `expected changes, got ${r2.verdict}`);
});

// ─── nullability GAP: compareFieldType compares only `name`, never `nullable` ───────

test('nullability T→T|null = breaking; T|null→T = additive (compareFieldType-gap remediation)', () => {
  // BEFORE size:number → AFTER size: number | null  = consumer must now handle null = breaking
  const r1 = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number | null;')));
  const tc1 = kind(r1, 'type_changed');
  assert(tc1.length === 1 && tc1[0].before === 'number' && tc1[0].after === 'number | null', `expected number→number|null, got ${JSON.stringify(tc1)}`);
  assert(tc1[0].breaking === true && r1.verdict === 'breaking', 'T→T|null must be breaking');
  // BEFORE size:number|null → AFTER size:number = narrowing = safe
  const beforeNull = `export interface Widget { id: string; name: string; size: number | null; }`;
  const r2 = run(beforeNull, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;')));
  const tc2 = kind(r2, 'type_changed');
  assert(tc2.length === 1 && tc2[0].breaking === false && tc2[0].class === 'additive', `T|null→T must be additive: ${JSON.stringify(tc2)}`);
  assert(r2.verdict === 'changes', `expected changes, got ${r2.verdict}`);
});

// ─── fail-closed guardrails (§13.4) ─────────────────────────────────────────────────

test('NON-VACUITY floor: 0 compared shapes → error/vacuous-no-compared-shapes, never clean', () => {
  // AFTER declares only a DIFFERENT-named shape → no name on both sides.
  const r = run(TYPES_BASE, afterHttp(iface('Gadget', 'id: string;')));
  assert(r.comparedShapes === 0, `expected 0 compared shapes, got ${r.comparedShapes}`);
  assert(r.verdict === 'error' && r.reason === 'vacuous-no-compared-shapes', `expected vacuous error, got ${r.verdict}/${r.reason}`);
});

test('SAME-SOURCE degeneracy: AFTER is a baseline mirror of BEFORE → error/same-source-degeneracy', () => {
  const mirror = generateBaselineHttp(API, TYPES_BASE, 'W'); // carries the baseline marker
  const r = reconcile({ beforeHttpText: before(TYPES_BASE), afterHttpText: mirror, apiText: API, feature: 'W' });
  assert(r.verdict === 'error' && r.reason === 'same-source-degeneracy', `expected same-source error, got ${r.verdict}/${r.reason}`);
});

test('malformed-contract: AFTER parses to 0 shapes → error/malformed-contract', () => {
  const r = run(TYPES_BASE, afterHttp('# (no shapes here)'));
  assert(r.verdict === 'error' && r.reason === 'malformed-contract', `expected malformed-contract, got ${r.verdict}/${r.reason}`);
});

test('malformed-existing-code: api.ts parses to 0 routes → error/malformed-existing-code', () => {
  const r = reconcile({ beforeHttpText: before(TYPES_BASE), afterHttpText: afterHttp(iface('Widget', 'id: string;')), apiText: '// no endpoints', feature: 'W' });
  assert(r.verdict === 'error' && r.reason === 'malformed-existing-code', `expected malformed-existing-code, got ${r.verdict}/${r.reason}`);
});

// ─── suspected_rename (§13.2 exact rule + safety property) ──────────────────────────

test('suspected_rename fires ONLY on identical resolved type (no name similarity)', () => {
  // same type (string↔string) → hint; different type (string↔number) → NO hint.
  const rSame = run(`export interface Widget { id: string; oldName: string; }`,
    afterHttp(iface('Widget', 'id: string;', 'newName: string;')));
  const hintsSame = kind(rSame, 'suspected_rename');
  assert(hintsSame.length === 1 && hintsSame[0].removedPath === 'oldName' && hintsSame[0].addedPath === 'newName',
    `expected oldName→newName hint, got ${JSON.stringify(hintsSame)}`);
  assert(hintsSame[0].breaking === false && hintsSame[0].class === 'hint', 'rename hint must be non-breaking');

  const rDiff = run(`export interface Widget { id: string; p: string; }`,
    afterHttp(iface('Widget', 'id: string;', 'q: number;')));
  assert(kind(rDiff, 'suspected_rename').length === 0, 'different-typed add/remove must NOT be paired as a rename');
});

test('SAFETY: a wrong rename guess never hides a real breaking removal', () => {
  // BEFORE {id, a:string, b:string}; AFTER {id, c:string}. Removed=a,b (both string); Added=c (string).
  // Pairing (decl order) guesses a↔c. Even if the TRUE rename were b↔c, the breaking removal of BOTH a
  // and b MUST remain fully emitted and fully counted — the hint suppresses nothing.
  const r = run(`export interface Widget { id: string; a: string; b: string; }`,
    afterHttp(iface('Widget', 'id: string;', 'c: string;')));
  const removed = kind(r, 'removed').map((c) => c.path).sort();
  assert(removed.length === 2 && removed[0] === 'a' && removed[1] === 'b', `both removals must survive: ${JSON.stringify(removed)}`);
  assert(kind(r, 'removed').every((c) => c.breaking), 'every removal stays breaking');
  const hints = kind(r, 'suspected_rename');
  assert(hints.length === 1, `expected exactly 1 rename hint, got ${hints.length}`);
  // suspected_rename contributes NOTHING to breaking; both removals do.
  assert(r.summary.breaking === 2, `breaking count must be the 2 removals (rename contributes 0), got ${r.summary.breaking}`);
  assert(r.verdict === 'breaking', `expected breaking, got ${r.verdict}`);
});

test('fieldTypeEqual: structural equality only', () => {
  assert(fieldTypeEqual({ kind: 'primitive', name: 'string', nullable: false }, { kind: 'primitive', name: 'string', nullable: false }), 'string==string');
  assert(!fieldTypeEqual({ kind: 'primitive', name: 'string', nullable: false }, { kind: 'primitive', name: 'number', nullable: false }), 'string!=number');
  assert(!fieldTypeEqual({ kind: 'primitive', name: 'string', nullable: false }, { kind: 'primitive', name: 'string', nullable: true }), 'nullable differs');
  assert(fieldTypeEqual({ kind: 'array', element: { kind: 'ref', name: 'X', nullable: false }, nullable: false },
    { kind: 'array', element: { kind: 'ref', name: 'X', nullable: false }, nullable: false }), 'X[]==X[]');
});

// ─── the two missing-input sub-causes (§13.4.1) — reason codes MUST differ ──────────

test('missing-input (b) wrong-invocation vs (a) data-problem → distinct reason codes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcross2-'));
  try {
    // (b) no existing code at all → not-enhance-no-existing-code
    const rB = reconcileFeature({
      apiPath: path.join(tmp, 'nope', 'api.ts'),
      typesPath: path.join(tmp, 'nope', 'types.ts'),
      feature: 'W',
    });
    assert(rB.verdict === 'error' && rB.reason === 'not-enhance-no-existing-code',
      `(b) expected not-enhance-no-existing-code, got ${rB.verdict}/${rB.reason}`);

    // (a) code present but declared contract absent → missing-declared-contract
    fs.writeFileSync(path.join(tmp, 'api.ts'), API, 'utf8');
    fs.writeFileSync(path.join(tmp, 'types.ts'), TYPES_BASE, 'utf8');
    const rA = reconcileFeature({
      apiPath: path.join(tmp, 'api.ts'),
      typesPath: path.join(tmp, 'types.ts'),
      feature: 'W',
      componentsDir: path.join(tmp, 'no-components'),
      specsDir: path.join(tmp, 'no-specs'),
    });
    assert(rA.verdict === 'error' && rA.reason === 'missing-declared-contract',
      `(a) expected missing-declared-contract, got ${rA.verdict}/${rA.reason}`);

    assert(rA.reason !== rB.reason, `the two missing-input causes MUST have distinct reason codes (${rA.reason} vs ${rB.reason})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reconcileFeature end-to-end (a happy path from disk) verifies against BEFORE', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcross2-'));
  try {
    fs.writeFileSync(path.join(tmp, 'api.ts'), API, 'utf8');
    fs.writeFileSync(path.join(tmp, 'types.ts'), TYPES_BASE, 'utf8');
    const afterPath = path.join(tmp, 'W.full.http');
    fs.writeFileSync(afterPath, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;', 'color?: string;')), 'utf8');
    const r = reconcileFeature({ apiPath: path.join(tmp, 'api.ts'), typesPath: path.join(tmp, 'types.ts'), feature: 'W', afterPath });
    assert(r.verdict === 'changes' && r.summary.added === 1, `expected changes/1 added, got ${r.verdict}/${r.summary.added}`);
    assert(r.after.path === afterPath && r.before.sha256.length === 64, 'result metadata populated');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── RECONCILE.md is a PURE projection of the JSON ─────────────────────────────────

test('RECONCILE.md projects the verdict, every change path, and the summary — no independent logic', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'riskBand: string;'))); // removed size + added riskBand
  const md = renderReconcileMd(r);
  assert(md.includes(r.verdict.toUpperCase()), 'verdict rendered');
  for (const c of changesOf(r)) assert(md.includes(c.path), `path ${c.path} must appear in md`);
  assert(md.includes(`breaking ${r.summary.breaking}`), 'summary breaking count rendered');
  // deterministic projection
  assert(renderReconcileMd(r) === md, 'md render not deterministic');
});

test('RECONCILE.md renders the error reason on a fail-closed result', () => {
  const r = run(TYPES_BASE, afterHttp(iface('Gadget', 'id: string;')));
  const md = renderReconcileMd(r);
  assert(md.includes('vacuous-no-compared-shapes'), 'error reason must be rendered');
  assert(md.includes('ERROR'), 'error verdict rendered');
});

test('reconcile is deterministic (same inputs → identical JSON)', () => {
  const a = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;', 'color?: string;')));
  const b = run(TYPES_BASE, afterHttp(iface('Widget', 'id: string;', 'name: string;', 'size: number;', 'color?: string;')));
  assert(JSON.stringify(a) === JSON.stringify(b), 'reconcile output not deterministic');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
