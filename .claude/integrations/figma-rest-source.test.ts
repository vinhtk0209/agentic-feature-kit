/**
 * figma-rest-source.test.ts — tests for figma-rest-source.ts (the V1 DesignSource).
 *
 * Standalone, no jest. Run:
 *   npx tsx .claude/integrations/figma-rest-source.test.ts
 * Exit 0 = all pass, 1 = a test failed.
 *
 * Deterministic + offline: driven by `figma-rest-source.fixture.json`, a REDUCED fixture
 * derived from the REAL spike capture (file QwSquTxduuodo0r4tIqiNq "e-learning", node
 * 6713:66557 "Course detail"). It preserves the exact REST shape (top-level + nodes +
 * document with real children incl. a TEXT node, a variant INSTANCE, and noise nodes,
 * plus the real components/styles maps). No live token or network is used.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FigmaRestSource, parseRef } from './figma-rest-source';
import { hashScreens } from './design-source';
import { createMatcher, FigmaNode } from './design-matcher';

// ─── async-capable micro harness (mirrors design-matcher.test.ts) ──────────────

let passed = 0;
let failed = 0;
const tests: { name: string; fn: () => void | Promise<void> }[] = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
async function assertThrows(fn: () => unknown | Promise<unknown>, needle: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const m = (e as Error).message;
    assert(m.includes(needle), `${label}: expected error containing "${needle}", got "${m}"`);
    return;
  }
  throw new Error(`${label}: expected a throw containing "${needle}", but nothing threw`);
}

// ─── fixture + mock fetch ──────────────────────────────────────────────────────

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'figma-rest-source.fixture.json'), 'utf8'));
const REAL_URL = 'https://www.figma.com/design/QwSquTxduuodo0r4tIqiNq/e-learning?node-id=6713-66557&t=Tr2Ji42MT1U52Oba-0';

/** A minimal Response-like object. A fresh one is built per call so `.json()`/`.text()`
 *  (single-use bodies) never get double-read across multiple refs. */
function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
function errResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: status === 403 ? 'Forbidden' : 'Error',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}
/** fetch mock returning the fixture (fresh Response) for every call, re-keyed under the
 *  node id requested in the URL's `?ids=` param — so multiple refs each resolve. */
function fixtureFetch(): typeof fetch {
  return (async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const ids = new URL(url).searchParams.get('ids') || '6713:66557';
    return okResponse({ ...FIXTURE, nodes: { [ids]: FIXTURE.nodes['6713:66557'] } });
  }) as unknown as typeof fetch;
}

// ─── 1. URL parsing (dash → colon) ─────────────────────────────────────────────

test('parseRef: real /design/ URL → { fileKey, nodeId } with dash→colon node-id', () => {
  const r = parseRef(REAL_URL);
  assert(r.fileKey === 'QwSquTxduuodo0r4tIqiNq', `fileKey wrong: ${r.fileKey}`);
  assert(r.nodeId === '6713:66557', `nodeId should be colon form, got ${r.nodeId}`);
});

test('parseRef: legacy /file/ URL form also parses', () => {
  const r = parseRef('https://www.figma.com/file/ABC123def/Proto?node-id=10-20');
  assert(r.fileKey === 'ABC123def', `fileKey wrong: ${r.fileKey}`);
  assert(r.nodeId === '10:20', `nodeId wrong: ${r.nodeId}`);
});

test('parseRef: only the first dash is converted (node ids are <num>-<num>)', () => {
  assert(parseRef('https://figma.com/design/K/slug?node-id=6713-66557').nodeId === '6713:66557', 'single dash → single colon');
});

test('parseRef: unparseable refs throw clearly (no node-id, not a URL)', async () => {
  await assertThrows(() => parseRef('https://www.figma.com/design/K/slug'), 'node-id', 'missing node-id');
  await assertThrows(() => parseRef('not a url'), 'Unparseable', 'not a URL');
  await assertThrows(() => parseRef('https://www.figma.com/files/recent'), 'fileKey', 'no design/file segment');
});

// ─── 2. Tree-walking produces the expected screen shape ────────────────────────

test('toScreenModel: walks the real fixture into the expected screen shape', () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  const screen = src.toScreenModel(FIXTURE.nodes['6713:66557'], REAL_URL);

  assert(screen.name === 'Course detail', `screen.name: ${screen.name}`);
  assert(screen.ref === REAL_URL, 'screen.ref should echo the input ref');

  // real semantic frame names survive into components
  const compNames = screen.components.map((c) => c.name);
  assert(compNames.includes('Course Hero Section'), `expected a real frame name, got ${JSON.stringify(compNames)}`);

  // the variant name is surfaced from the components map (instance node was "Frame 1321316116")
  assert(compNames.includes('Property 1=Active - Start'), `expected the variant name to survive, got ${JSON.stringify(compNames)}`);
  const variant = screen.components.find((c) => c.name === 'Property 1=Active - Start')!;
  assert(variant.componentSetId === '57:359', `variant should resolve its componentSetId from the map, got ${variant.componentSetId}`);
  assert(!!variant.key, 'variant should carry the component key from the map');

  // TEXT nodes carry real characters (incl. the rich label)
  const texts = screen.textNodes.map((t) => t.characters);
  assert(texts.includes('Section 1: Introduction to Automation Testing'), `expected the real TEXT label, got ${JSON.stringify(texts)}`);

  // raw tree is preserved UNfiltered (noise nodes still present — matcher filters later)
  assert(screen.tree.type === 'FRAME' && screen.tree.name === 'Course detail', 'tree root should be the FRAME');
  assert(screen.tree.children.length === 9, `raw tree should keep all 9 children unfiltered, got ${screen.tree.children.length}`);
  assert(screen.tree.children.some((c) => c.name === 'Container'), 'a noise node must survive in the raw tree (filtering is the matcher\'s job)');
});

test('toScreenModel: best-effort tokens (named color, typography, named styles)', () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  const { tokens } = src.toScreenModel(FIXTURE.nodes['6713:66557'], REAL_URL);

  assert(tokens.namedStyles.length === 12, `expected all 12 named styles from the real map, got ${tokens.namedStyles.length}`);
  assert(tokens.colors.length >= 1, 'expected at least one color token from SOLID fills');
  assert(tokens.colors.some((c) => /^#[0-9a-f]{6}$/.test(c.hex)), 'color token should have a #rrggbb hex');
  assert(tokens.colors.some((c) => c.name === 'Neutral/Light Grey'), 'a fill referencing a named style should carry that name');
  assert(tokens.textStyles.some((t) => t.fontFamily && t.fontSize), 'expected typography extracted from a TEXT node .style');
});

// ─── 3. Multiple refs aggregate into one DesignModel ───────────────────────────

test('resolveCluster: multiple refs aggregate into one DesignModel with a stable hash', async () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  const url2 = REAL_URL.replace('6713-66557', '3025-34563');
  const model = await src.resolveCluster([REAL_URL, url2]);

  assert(model.source === 'figma', 'source should be figma');
  assert(model.screens.length === 2, `expected 2 screens, got ${model.screens.length}`);
  assert(model.screens[0].ref === REAL_URL && model.screens[1].ref === url2, 'screens should keep their source refs in order');
  assert(/^[0-9a-f]{64}$/.test(model.hash), `hash should be a sha256 hex, got ${model.hash}`);

  // deterministic: same input → same hash
  const again = await new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() }).resolveCluster([REAL_URL, url2]);
  assert(again.hash === model.hash, 'hash must be deterministic across runs');
});

test('hashScreens: sensitive to a screen change', async () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  const model = await src.resolveCluster([REAL_URL]);
  const mutated = JSON.parse(JSON.stringify(model.screens));
  mutated[0].name = 'Changed';
  assert(hashScreens(mutated) !== model.hash, 'a changed screen must change the hash');
});

test('resolveCluster: empty ref list throws', async () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  await assertThrows(() => src.resolveCluster([]), 'at least one', 'empty cluster');
});

// ─── 4. Error paths (missing token, 403 expired) ───────────────────────────────

test('fetchNodes: missing FIGMA_TOKEN throws a clear error', async () => {
  const saved = process.env.FIGMA_TOKEN;
  delete process.env.FIGMA_TOKEN;
  try {
    const src = new FigmaRestSource({ fetchImpl: (() => { throw new Error('fetch must not be called'); }) as unknown as typeof fetch });
    await assertThrows(() => src.fetchNodes('K', '1:2'), 'FIGMA_TOKEN missing', 'missing token');
  } finally {
    if (saved !== undefined) process.env.FIGMA_TOKEN = saved;
  }
});

test('fetchNodes: 403 → clear "token expired or invalid" error (real 403 body shape)', async () => {
  const fetch403 = (async () => errResponse(403, { status: 403, err: 'Token expired' })) as unknown as typeof fetch;
  const src = new FigmaRestSource({ token: 'expired-xyz', fetchImpl: fetch403 });
  await assertThrows(() => src.fetchNodes('QwSquTxduuodo0r4tIqiNq', '6713:66557'), 'token expired or invalid', '403 message');
  // and it surfaces the API's own detail, not a generic failure
  await assertThrows(() => src.fetchNodes('QwSquTxduuodo0r4tIqiNq', '6713:66557'), 'Token expired', '403 detail');
});

test('fetchNodes: a non-403 failure surfaces status, not a silent throw', async () => {
  const fetch500 = (async () => errResponse(500, 'upstream boom')) as unknown as typeof fetch;
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fetch500 });
  await assertThrows(() => src.fetchNodes('K', '1:2'), '500', '500 message');
});

// ─── 5. Composition: FigmaRestSource output → design-matcher.matchAll ───────────

test('integration: FigmaRestSource output composes with design-matcher (0 HIGH cross-domain, noise filtered)', async () => {
  const src = new FigmaRestSource({ token: 'x', fetchImpl: fixtureFetch() });
  const model = await src.resolveCluster([REAL_URL]);
  const screen = model.screens[0];

  // feed the source's components + TEXT labels into the matcher as FigmaNodes
  const nodes: FigmaNode[] = [
    ...screen.components.map((c) => ({ name: c.name })),
    ...screen.textNodes.map((t) => ({ name: '', text: t.characters })),
  ];

  // cross-domain candidates (ClassDetails/Session rows) — unrelated to "Course detail"
  const candidates = [
    'Session List Section', 'Add Session Button', 'Session Name', 'Save Session Button',
    'Delete Session Button', 'Assigned Instructor(s)', 'Empty Session List State',
  ];
  const matcher = createMatcher(candidates);
  const results = matcher.matchAll(nodes);

  // the two modules actually compose: matcher ran over the source's output
  assert(results.length > 0, 'matcher should have produced results from the source output');
  // noise filtering is the matcher\'s job — it dropped nodes the source deliberately kept raw
  assert(results.length < nodes.length, `matcher should have filtered some noise nodes (in=${nodes.length}, scored=${results.length})`);
  // precision: unrelated domains must not produce a confident match
  const highs = results.filter((r) => r.verdict === 'HIGH');
  assert(highs.length === 0, `cross-domain must stay 0 HIGH, got ${highs.length}: ${highs.map((h) => `${h.input.name || h.input.text}→${h.best!.candidate}`).join(', ')}`);
});

// ─── run ───────────────────────────────────────────────────────────────────────

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`✅ ${t.name}`);
    } catch (e) {
      failed += 1;
      console.log(`❌ ${t.name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
