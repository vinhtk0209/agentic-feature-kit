/** Offline attacks for the xAI Grok adapter. No network request or API key is used. */
import * as assert from 'assert';
import { createGrokApiAdapter, createGrokFetchExecutor, type GrokHttpExecutor, type GrokHttpRequest, type GrokHttpResponse } from './grok-api-adapter';
import { backendKey, ProviderRegistry } from './multi-provider-backends';
import { normalizeConfig } from './model-config';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const CONFIG = normalizeConfig({ version: 2, primary: 'grok', models: {
  grok: { id: 'grok-4.5', provider: 'grok' }, codex: { id: 'gpt-fixture', provider: 'codex' },
} });
const response = (body: unknown, override: Partial<GrokHttpResponse> = {}): GrokHttpResponse => ({
  status: 200, body: typeof body === 'string' ? body : JSON.stringify(body), timedOut: false,
  outputCapped: false, redirected: false, ...override,
});
const execution = (text = 'I2_PROVIDER_LIVE_OK', usage: unknown = { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 20 } }) => response({
  id: 'resp-1', model: 'grok-4.5', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage,
});

class FakeHttp implements GrokHttpExecutor {
  calls: GrokHttpRequest[] = [];
  constructor(private readonly results: GrokHttpResponse[]) {}
  async execute(request: GrokHttpRequest): Promise<GrokHttpResponse> {
    this.calls.push(request);
    const next = this.results.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  }
}
const create = (http: FakeHttp, override: Partial<Parameters<typeof createGrokApiAdapter>[0]> = {}) => createGrokApiAdapter({
  baseUrl: 'https://api.x.ai/v1', apiKey: 'test-secret-not-real', modelConfig: CONFIG, modelKey: 'grok',
  adapterVersion: 'grok-responses-v1', timeoutMs: 60_000, maxOutputBytes: 1_000_000, ...override,
}, http);
async function rejects(fn: () => unknown | Promise<unknown>, contains: string) {
  let caught: unknown;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, new RegExp(contains));
  assert.equal(caught.message.includes('test-secret-not-real'), false);
}

async function main() {
  await test('missing key, non-Grok key, and unsafe base URLs reject before any request', async () => {
    const cases = [
      { apiKey: '' }, { modelKey: 'codex' }, { baseUrl: 'http://api.x.ai/v1' },
      { baseUrl: 'https://user:pass@api.x.ai/v1' }, { baseUrl: 'https://api.x.ai/v1/extra' },
    ];
    for (const override of cases) {
      const http = new FakeHttp([]);
      await rejects(() => create(http, override), 'Grok API adapter');
      assert.equal(http.calls.length, 0);
    }
  });

  await test('model capability probe requires exact identity and never exposes the bearer key', async () => {
    const http = new FakeHttp([response({ id: 'grok-4.5' })]);
    const adapter = create(http);
    const probe = await adapter.capabilityProbe();
    assert.equal(http.calls[0].url, 'https://api.x.ai/v1/models/grok-4.5');
    assert.equal(probe.provider, 'grok');
    assert.ok(probe.capabilities.includes('xai-model:grok-4.5'));
    assert.equal(JSON.stringify(probe).includes('test-secret-not-real'), false);
  });

  await test('HTTP auth failure, redirect, timeout, cap, malformed JSON, and model mismatch fail closed', async () => {
    const cases: Array<[GrokHttpResponse, string]> = [
      [response('', { status: 401 }), 'HTTP 401'], [response('', { status: 302, redirected: true }), 'redirect'],
      [response('', { timedOut: true }), 'timed out'], [response('', { outputCapped: true }), 'response cap'],
      [response('{bad'), 'malformed JSON'], [response({ id: 'grok-other' }), 'identity mismatch'],
    ];
    for (const [result, message] of cases) {
      const http = new FakeHttp([result]);
      await rejects(() => create(http).capabilityProbe(), message);
    }
  });

  await test('production fetch executor stops streaming at the cumulative byte cap', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('1234'));
        controller.enqueue(new TextEncoder().encode('5678'));
      },
      cancel() { cancelled = true; },
    });
    const executor = createGrokFetchExecutor(async () => new Response(stream, { status: 200 }) as never);
    const result = await executor.execute({
      url: 'https://api.x.ai/v1/models/grok-4.5', method: 'GET', headers: {}, timeoutMs: 1_000, maxOutputBytes: 5,
    });
    assert.equal(result.outputCapped, true);
    assert.equal(result.body, '');
    assert.equal(cancelled, true);
  });

  await test('prompt is inert JSON data and missing pricing keeps canonical unknown cost', async () => {
    const http = new FakeHttp([execution()]);
    const prompt = 'line one\n"; DROP TABLE lessons; $(whoami)';
    const result = await create(http).executePhase(prompt);
    assert.equal(result.output, 'I2_PROVIDER_LIVE_OK');
    assert.equal(result.cost?.status, 'unknown');
    assert.deepEqual(JSON.parse(http.calls[0].body!), { model: 'grok-4.5', input: [{ role: 'user', content: prompt }] });
    assert.equal(http.calls[0].method, 'POST');
  });

  await test('ambiguous/malformed output and unsafe usage fail before the shared gate', async () => {
    const bad = [
      response({ model: 'grok-4.5', output: [], usage: { input_tokens: 1, output_tokens: 1 } }),
      response({ model: 'grok-4.5', output: [{ type: 'message', content: [{ type: 'output_text', text: 'a' }, { type: 'output_text', text: 'b' }] }], usage: { input_tokens: 1, output_tokens: 1 } }),
      execution('ok', { input_tokens: -1, output_tokens: 1 }),
      execution('ok', { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 2 } }),
    ];
    for (const item of bad) {
      const http = new FakeHttp([item]);
      await rejects(() => create(http).executePhase('prompt'), 'execution');
    }
  });

  await test('operator-pinned complete rates produce a known finite cost; partial/malformed rates reject', async () => {
    const http = new FakeHttp([execution()]);
    const result = await create(http, { ratesUsdPerMillion: { input: 2, cachedInput: 0.3, output: 6 } }).executePhase('prompt');
    assert.equal(result.cost?.status, 'known');
    if (result.cost?.status === 'known') assert.equal(result.cost.costUsd, ((80 * 2) + (20 * 0.3) + (10 * 6)) / 1_000_000);
    for (const rates of [{ input: 1, cachedInput: 1 } as never, { input: -1, cachedInput: 1, output: 1 }]) {
      const noHttp = new FakeHttp([]);
      await rejects(() => create(noHttp, { ratesUsdPerMillion: rates }), 'ratesUsdPerMillion');
      assert.equal(noHttp.calls.length, 0);
    }
  });

  await test('trusted Grok output uses the exact same gate object as another provider registry entry', async () => {
    const http = new FakeHttp([response({ id: 'grok-4.5' }), execution('wrong')]);
    const adapter = create(http);
    const registry = new ProviderRegistry([adapter]);
    const key = backendKey(adapter.identity);
    await registry.trust(key);
    const gate = async (output: string) => ({ passed: output === 'I2_PROVIDER_LIVE_OK', detail: 'fixed provider gate' });
    const result = await registry.execute(key, 'prompt', gate);
    assert.equal(result.gate.passed, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
