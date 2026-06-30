/**
 * Tests for hooks.ts — the plugin hook bus + loader (A-06). No LLM, no quota.
 *   npx tsx .claude/integrations/hooks.test.ts   (or: npm run test:hooks)
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HookBus, isValidPlugin, pluginFiles, loadPlugins, KNOWN_EVENTS, type KitPlugin,
} from './hooks';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log(`✅ ${name}`); })
    .catch((e) => { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); });
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

async function run() {
  await test('isValidPlugin accepts/rejects by shape', () => {
    assert(isValidPlugin({ name: 'p', hooks: { 'before:lint': () => {} } }), 'valid');
    assert(!isValidPlugin({ name: '', hooks: {} }), 'empty name rejected');
    assert(!isValidPlugin({ name: 'p' }), 'missing hooks rejected');
    assert(!isValidPlugin({ name: 'p', hooks: { x: 'notfn' } }), 'non-fn handler rejected');
  });

  await test('bus runs handlers in registration order', async () => {
    const bus = new HookBus();
    const seen: string[] = [];
    bus.register({ name: 'a', hooks: { 'before:lint': () => { seen.push('a') } } });
    bus.register({ name: 'b', hooks: { 'before:lint': () => { seen.push('b') } } });
    await bus.emit('before:lint');
    assert(seen.join(',') === 'a,b', `order ${seen}`);
  });

  await test('bus passes payload + listeners() reports plugins', async () => {
    const bus = new HookBus();
    let got: unknown;
    bus.register({ name: 'p', hooks: { 'after:verify': (ctx) => { got = ctx.payload } } });
    await bus.emit('after:verify', { ok: true });
    assert(JSON.stringify(got) === '{"ok":true}', `payload ${JSON.stringify(got)}`);
    assert(bus.listeners('after:verify').join() === 'p', 'listeners');
  });

  await test('a throwing handler is isolated and reported', async () => {
    const bus = new HookBus();
    const seen: string[] = [];
    bus.register({ name: 'bad', hooks: { 'on:error': () => { throw new Error('boom') } } });
    bus.register({ name: 'good', hooks: { 'on:error': () => { seen.push('good') } } });
    const res = await bus.emit('on:error');
    assert(seen.includes('good'), 'good still ran after bad threw');
    const bad = res.find((r) => r.plugin === 'bad')!;
    assert(bad.ok === false && bad.error === 'boom', `bad result ${JSON.stringify(bad)}`);
  });

  await test('emit with no listeners returns []', async () => {
    assert((await new HookBus().emit('before:sync')).length === 0, 'empty');
  });

  await test('KNOWN_EVENTS includes the documented lifecycle events', () => {
    for (const e of ['before:lint', 'after:verify', 'on:error']) {
      assert((KNOWN_EVENTS as readonly string[]).includes(e), `missing ${e}`);
    }
  });

  // Loader: materialize a temp .claude/plugins dir with a real + an invalid + an ignored file.
  await test('pluginFiles + loadPlugins discover valid plugins, skip junk', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-'));
    const dir = path.join(tmp, '.claude', 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'good.ts'), `const p = { name: 'good', hooks: { 'before:lint': () => {} } }; export default p;\n`);
    fs.writeFileSync(path.join(dir, 'bad.ts'), `export default { nope: true };\n`);
    fs.writeFileSync(path.join(dir, '_ignored.ts'), `export default { name: 'ignored', hooks: {} };\n`);
    fs.writeFileSync(path.join(dir, 'notes.test.ts'), `export default { name: 'test', hooks: {} };\n`);

    const files = pluginFiles(dir);
    assert(files.length === 2, `expected 2 candidate files (good,bad), got ${files.length}`);

    const warnings: string[] = [];
    const plugins = await loadPlugins(dir, (m) => warnings.push(m));
    assert(plugins.length === 1 && plugins[0].name === 'good', `loaded ${plugins.map((p) => p.name)}`);
    assert(warnings.some((w) => w.includes('bad.ts')), 'warned about bad.ts');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await test('the shipped example-logger plugin is valid and loadable', async () => {
    const plugins = await loadPlugins(path.join(process.cwd(), '.claude', 'plugins'));
    assert(plugins.some((p: KitPlugin) => p.name === 'example-logger'), `got ${plugins.map((p) => p.name)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
