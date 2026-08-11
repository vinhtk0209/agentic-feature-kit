/**
 * Tests for model-config.ts — load/normalize/resolve (A-03). No LLM, no quota.
 *   npx tsx .claude/integrations/model-config.test.ts   (or: npm run test:model-config)
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizeConfig, loadModelConfig, resolveModelChain, modelLabel, modelId,
  providerOf, providersOf, modelsByProvider, reasoningEffortForModel, DEFAULT_MODEL_CONFIG,
} from './model-config';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

test('normalizeConfig accepts a well-formed config', () => {
  const cfg = normalizeConfig({
    version: 1, primary: 'opus', fallback: ['sonnet'],
    models: { opus: { id: 'claude-opus-4-8', label: 'Opus' }, sonnet: { id: 'claude-sonnet-4-6' } },
  });
  assert(cfg.primary === 'opus', 'primary');
  assert(cfg.models.sonnet.label === 'sonnet', 'label defaults to key when absent');
});

test('normalizeConfig drops fallback keys not in models', () => {
  const cfg = normalizeConfig({ primary: 'a', fallback: ['b', 'ghost'], models: { a: { id: 'x' }, b: { id: 'y' } } });
  assert(JSON.stringify(cfg.fallback) === JSON.stringify(['b']), `got ${cfg.fallback}`);
});

test('normalizeConfig throws when primary is not a known model', () => {
  let threw = false;
  try { normalizeConfig({ primary: 'nope', models: { a: { id: 'x' } } }) } catch { threw = true }
  assert(threw, 'should throw');
});

test('normalizeConfig defaults primary to first model when omitted', () => {
  const cfg = normalizeConfig({ models: { a: { id: 'x' }, b: { id: 'y' } } });
  assert(cfg.primary === 'a', `got ${cfg.primary}`);
});

test('resolveModelChain is primary-first and deduped', () => {
  const cfg = normalizeConfig({ primary: 'opus', fallback: ['opus', 'sonnet', 'haiku'], models: { opus: { id: '1' }, sonnet: { id: '2' }, haiku: { id: '3' } } });
  assert(JSON.stringify(resolveModelChain(cfg)) === JSON.stringify(['opus', 'sonnet', 'haiku']), `got ${resolveModelChain(cfg)}`);
});

test('modelLabel / modelId resolve, and fall back gracefully', () => {
  assert(modelLabel(DEFAULT_MODEL_CONFIG, 'opus') === 'Opus 4.8', 'label');
  assert(modelId(DEFAULT_MODEL_CONFIG, 'opus') === 'claude-opus-4-8', 'id');
  assert(modelLabel(DEFAULT_MODEL_CONFIG, 'unknown') === 'unknown', 'label fallback');
  assert(modelId(DEFAULT_MODEL_CONFIG, 'unknown') === undefined, 'id undefined for unknown');
});

test('loadModelConfig returns the default when the file is missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  const cfg = loadModelConfig(tmp);
  assert(cfg.primary === DEFAULT_MODEL_CONFIG.primary, 'default primary');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('loadModelConfig reads + normalizes a real file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  fs.mkdirSync(path.join(tmp, '.claude'));
  fs.writeFileSync(path.join(tmp, '.claude', 'model-config.json'),
    JSON.stringify({ primary: 'sonnet', fallback: ['haiku'], models: { sonnet: { id: 's', label: 'S' }, haiku: { id: 'h', label: 'H' } } }));
  const cfg = loadModelConfig(tmp);
  assert(cfg.primary === 'sonnet' && resolveModelChain(cfg).join(',') === 'sonnet,haiku', `got ${JSON.stringify(cfg)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('normalizeConfig defaults provider to claude, keeps explicit provider', () => {
  const cfg = normalizeConfig({ primary: 'a', models: { a: { id: 'x' }, b: { id: 'y', provider: 'copilot' } } });
  assert(providerOf(cfg, 'a') === 'claude', 'default provider claude');
  assert(providerOf(cfg, 'b') === 'copilot', 'explicit provider kept');
});

test('providersOf + modelsByProvider group correctly', () => {
  const cfg = normalizeConfig({
    primary: 'opus',
    models: { opus: { id: '1', provider: 'claude' }, sonnet: { id: '2', provider: 'claude' }, cop: { id: '3', provider: 'copilot' } },
  });
  assert(JSON.stringify(providersOf(cfg)) === JSON.stringify(['claude', 'copilot']), `providers ${providersOf(cfg)}`);
  const g = modelsByProvider(cfg);
  assert(g.claude.length === 2 && g.copilot[0] === 'cop', `grouped ${JSON.stringify(g)}`);
});

test('DEFAULT_MODEL_CONFIG ships a copilot provider entry', () => {
  assert(providerOf(DEFAULT_MODEL_CONFIG, 'copilot') === 'copilot', 'copilot provider');
  assert(providersOf(DEFAULT_MODEL_CONFIG).includes('copilot'), 'copilot listed');
});

test('reasoning effort is model-scoped, defaults explicitly, and rejects malformed declarations', () => {
  const cfg = normalizeConfig({
    primary: 'a',
    models: {
      a: { id: 'x', reasoningEfforts: ['default', 'low', 'high'] },
      b: { id: 'y' },
    },
  });
  assert(reasoningEffortForModel(cfg, 'a') === 'default', 'missing request resolves to provider default');
  assert(reasoningEffortForModel(cfg, 'a', 'high') === 'high', 'declared effort accepted');
  let unsupported = false;
  try { reasoningEffortForModel(cfg, 'b', 'high') } catch { unsupported = true }
  assert(unsupported, 'undeclared effort must fail closed');
  for (const invalid of [[], ['high'], ['default', 'turbo']]) {
    let threw = false;
    try { normalizeConfig({ primary: 'x', models: { x: { id: 'x', reasoningEfforts: invalid } } }) } catch { threw = true }
    assert(threw, `invalid effort declaration must throw: ${JSON.stringify(invalid)}`);
  }
});

test('the canonical repository model config registers pinned runner-specific model identities', () => {
  const cfg = loadModelConfig(process.cwd());
  assert(cfg.primary === 'codex', 'Codex must be the active primary after Claude subscription removal');
  assert(JSON.stringify(cfg.fallback) === JSON.stringify(['copilot-gpt-5.3-codex', 'gemini-2.5-pro', 'copilot-gpt-5.4', 'gemini-2.5-flash']), 'fallback order must preserve runner/model identity');
  assert(providerOf(cfg, 'codex') === 'codex', 'codex provider');
  assert(modelId(cfg, 'codex') === 'gpt-5.6-sol', 'pinned Codex model id');
  assert(JSON.stringify(modelsByProvider(cfg).codex) === JSON.stringify(['codex', 'codex-terra', 'codex-luna']), 'Codex model set');
  assert(JSON.stringify(modelsByProvider(cfg).copilot) === JSON.stringify([
    'copilot', 'copilot-gpt-5.3-codex', 'copilot-gpt-5.4', 'copilot-claude-sonnet-4.6',
    'copilot-claude-haiku-4.5', 'copilot-gemini-3.1-pro-preview', 'copilot-gemini-3.5-flash',
    'copilot-gemini-3.6-flash',
  ]), 'Copilot model set');
  assert(JSON.stringify(modelsByProvider(cfg).gemini) === JSON.stringify(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']), 'Gemini model set');
  assert(JSON.stringify(cfg.models.codex.reasoningEfforts) === JSON.stringify(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max']), 'Codex effort set');
  assert(JSON.stringify(cfg.models['copilot-gpt-5.4'].reasoningEfforts) === JSON.stringify(['default', 'none', 'low', 'medium', 'high', 'xhigh']), 'Copilot GPT-5.4 effort set');
  assert(JSON.stringify(cfg.models['gemini-2.5-pro'].reasoningEfforts) === JSON.stringify(['default']), 'Gemini direct CLI does not expose an effort flag');
});

test('loadModelConfig falls back to default on malformed JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  fs.mkdirSync(path.join(tmp, '.claude'));
  fs.writeFileSync(path.join(tmp, '.claude', 'model-config.json'), '{ not json');
  assert(loadModelConfig(tmp).primary === DEFAULT_MODEL_CONFIG.primary, 'default on bad json');
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
