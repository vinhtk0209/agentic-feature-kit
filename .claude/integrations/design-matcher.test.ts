/**
 * design-matcher.test.ts — tests for design-matcher.ts
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/design-matcher.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 *
 * These regression-lock the behaviour proven by the two Figma spike rounds:
 *   - synonym map resolves the Module<->Session domain-noun divergence (not NONE)
 *   - generic-verb/multi-button collisions go AMBIGUOUS via tie-detection (never auto-picked)
 *   - the full cross-domain mismatch set stays 0 HIGH / 0 confident-wrong (PRECISION lock)
 *   - structural-noise names are filtered out, never scored
 *
 * NOTE: these lock PRECISION. RECALL (finding a TRUE match) is not covered — no real
 * Figma design + its intended spec has been tested yet. Do not read a pass here as
 * proof of recall.
 */

import {
  isNoise,
  filterNodes,
  createMatcher,
  loadSynonyms,
  buildCanonMap,
  tokenize,
  DEFAULT_FILTER_PATTERNS,
  FigmaNode,
} from './design-matcher';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`❌ ${name}\n     ${(e as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// The real ClassDetailsModuleList Component-descriptions rows (spike feature).
const CANDIDATES: string[] = [
  'Session List Section', 'Search Session Input', 'Session Filter Panel', 'Filter – Start Date',
  'Filter – End Date', 'Filter – Assigned Instructor(s)', 'Session List Item', 'Empty Session List State',
  'Add Session Button', 'Add New Session Modal', 'Session Name', 'Session Type', 'Session Mode',
  'Session Location / Meeting Link', 'Assigned Instructor(s)', 'Session Start Date', 'Session End Date',
  'Session Start Time', 'Session End Time', 'Session Description', 'Save Session Button', 'Delete Session Button',
  'Read-only Lock State', 'Add Course / Exam Button', 'Select Content(s) Modal', 'Learning Content List',
  'Exam Item', 'Filter Content Button', 'Filter Modal', 'Add Selected Content Button', 'Unit Card',
  'Unit Reorder Handle', 'Remove Unit Action', 'View Unit Detail Redirect', 'Exam Card', 'Remove Exam Action',
  'View Exam Detail Redirect', 'Session Content Read-only State',
];

// ─── Capability 2: synonym map resolves Module<->Session ───────────────────────

test('synonym map: "Module ..." resolves to its "Session ..." row (not NONE)', () => {
  const node: FigmaNode = { name: 'Module List Section' };
  const withSyn = createMatcher(CANDIDATES); // loads the JSON sidecar (has module<->session)
  const r = withSyn.match(node);
  assert(r.verdict !== 'NONE', `expected a resolved match, got NONE (${r.reason})`);
  assert(r.best!.candidate === 'Session List Section', `top should be the Session row, got "${r.best!.candidate}"`);
  assert(r.verdict === 'HIGH', `Module==Session after folding should be HIGH, got ${r.verdict} (${r.reason})`);
});

test('synonym map is load-bearing: turning it off strictly lowers the same match', () => {
  const node: FigmaNode = { name: 'Module List Section' };
  const on = createMatcher(CANDIDATES).match(node);
  const off = createMatcher(CANDIDATES, { synonyms: [] }).match(node);
  assert(on.best!.score > off.best!.score, `synonym should raise the score (on=${on.best!.score.toFixed(3)} off=${off.best!.score.toFixed(3)})`);
});

test('synonym JSON sidecar loads and contains the Module<->Session seed', () => {
  const groups = loadSynonyms();
  assert(groups.length > 0, 'expected synonym groups from the JSON sidecar');
  const canon = buildCanonMap(groups);
  assert(canon.get('module') === 'session', 'module should canonicalize to session');
});

// ─── Capability 4: tie-detection on generic-verb / multi-button collisions ─────

test('multi-button collision → AMBIGUOUS (tie), not a silent pick', () => {
  const r = createMatcher(CANDIDATES).match({ name: 'Session button' });
  assert(r.verdict === 'AMBIGUOUS', `multiple "... Session Button" rows must tie → AMBIGUOUS, got ${r.verdict} (${r.reason})`);
  assert(r.best!.score - r.runnerUp!.score < 0.15, `top-2 must be within tie margin (${r.best!.score.toFixed(3)} vs ${r.runnerUp!.score.toFixed(3)})`);
});

test('bare generic verbs "Add"/"Filter" are never auto-picked as HIGH', () => {
  const add = createMatcher(CANDIDATES).match({ name: 'Add' });
  const filter = createMatcher(CANDIDATES).match({ name: 'Filter' });
  assert(add.verdict !== 'HIGH', `bare "Add" must not confidently pick one of the Add* rows (${add.reason})`);
  assert(filter.verdict !== 'HIGH', `bare "Filter" must not confidently pick one of the Filter* rows (${filter.reason})`);
});

// ─── Capability 3: TEXT content is weighted higher than a frame name ───────────

test('TEXT content outweighs a generic frame name', () => {
  const m = createMatcher(CANDIDATES);
  const nameOnly = m.score({ name: 'Frame' }, 'Assigned Instructor(s)');
  const withText = m.score({ name: 'Frame', text: 'Assigned Instructor(s)' }, 'Assigned Instructor(s)');
  assert(withText > nameOnly, `TEXT content should raise the score (name=${nameOnly.toFixed(3)} text=${withText.toFixed(3)})`);
});

// ─── PRECISION regression: cross-domain mismatch stays 0 HIGH ──────────────────

test('cross-domain mismatch set: 0 HIGH / 0 confident-wrong (round-2 precision lock)', () => {
  const m = createMatcher(CANDIDATES);
  // Real names + TEXT from the eLearning "Course detail" Figma (unrelated domain).
  const crossDomain: FigmaNode[] = [
    { name: 'Course detail' }, { name: 'Course Hero Section' }, { name: 'Button' },
    { name: 'Video/Preview Card' }, { name: 'Ready to Start Banner' }, { name: 'Important Dates Card' },
    { name: 'Curriculum List' }, { name: 'Curriculum Header' }, { name: 'Footer' }, { name: 'Tab Control' },
    { name: 'Course Tools Card' }, { name: 'Notification' }, { name: 'Top bar' },
    { name: 'Icon', text: 'Instructor' }, { name: 'Text', text: 'Start Course' },
    { name: 'Text', text: 'Passing grade: 50%' }, { name: 'Text', text: '14 lessons · 5 sections' },
    { name: 'Text', text: 'Section 1: Introduction to Automation Testing' },
  ];
  const highs = crossDomain.map((n) => m.match(n)).filter((r) => r.verdict === 'HIGH');
  assert(highs.length === 0, `expected 0 HIGH on cross-domain, got ${highs.length}: ${highs.map((h) => `${h.input.name || h.input.text}→${h.best!.candidate}`).join(', ')}`);
});

// ─── Capability 1: filter stage drops noise, never scores it ───────────────────

test('isNoise catches one of each of the 5 noise classes; keeps real names', () => {
  assert(isNoise('Frame 1321316117'), 'auto-numbered default must be noise');
  assert(isNoise('Container'), 'layout wrapper must be noise');
  assert(isNoise('Background+Border+Shadow'), 'compound +-name must be noise');
  assert(isNoise('vuesax/linear/menu'), 'icon-library path must be noise');
  assert(isNoise('ádasdasdasdasdas'), 'keyboard-mash garbage must be noise');
  assert(isNoise('Title'), 'placeholder "Title" must be noise');
  // real component names must survive (incl. a real row that legitimately contains "/")
  assert(!isNoise('Add Session Button'), 'real component name must not be filtered');
  assert(!isNoise('Course Hero Section'), 'real frame name must not be filtered');
  assert(!isNoise('Session Location / Meeting Link'), 'real "/" row must not be mistaken for an icon path');
});

test('filterNodes / matchAll never score a filtered noise node', () => {
  const nodes: FigmaNode[] = [
    { name: 'Frame 1321316117' }, { name: 'Container' }, { name: 'vuesax/linear/menu' },
    { name: 'Session List Section' }, { name: 'Add Session Button' },
  ];
  const kept = filterNodes(nodes);
  assert(kept.length === 2, `expected 2 kept, got ${kept.length}`);
  const results = createMatcher(CANDIDATES).matchAll(nodes);
  assert(results.length === 2, `matchAll should only score the 2 non-noise nodes, got ${results.length}`);
  assert(!results.some((r) => r.input.name === 'Container'), 'a filtered node must never appear in results');
});

// ─── sanity: DEFAULT_FILTER_PATTERNS + tokenize wiring ─────────────────────────

test('DEFAULT_FILTER_PATTERNS is a non-empty, extensible array', () => {
  assert(Array.isArray(DEFAULT_FILTER_PATTERNS) && DEFAULT_FILTER_PATTERNS.length >= 5, 'expected the configurable pattern array');
});

test('tokenize drops stopwords/digits and folds synonyms', () => {
  const canon = buildCanonMap(loadSynonyms());
  const toks = tokenize('Add New Module 3', canon);
  assert(toks.includes('session') && toks.includes('add'), `expected folded tokens, got ${JSON.stringify(toks)}`);
  assert(!toks.includes('3') && !toks.includes('the'), 'digits/stopwords should be dropped');
});

// ─── summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
