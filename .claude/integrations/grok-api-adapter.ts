/** Direct xAI Responses API adapter for a registered Grok model. */
import { identityFromModelConfig, normalizeCost, type ProviderAdapter } from './multi-provider-backends';
import type { ModelConfig } from './model-config';

export interface GrokHttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface GrokHttpResponse {
  status: number;
  body: string;
  timedOut: boolean;
  outputCapped: boolean;
  redirected: boolean;
}

export interface GrokHttpExecutor {
  execute(request: GrokHttpRequest): Promise<GrokHttpResponse>;
}

export interface GrokRatesUsdPerMillion { input: number; cachedInput: number; output: number }

export interface GrokApiAdapterConfig {
  baseUrl: string;
  apiKey: string;
  modelConfig: ModelConfig;
  modelKey: string;
  adapterVersion: string;
  timeoutMs: number;
  maxOutputBytes: number;
  ratesUsdPerMillion?: GrokRatesUsdPerMillion;
}

export class GrokApiAdapterError extends Error {
  constructor(message: string) {
    super(`Grok API adapter: ${message}`);
    this.name = 'GrokApiAdapterError';
  }
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    throw new GrokApiAdapterError(`${field} must be a non-blank control-character-free string`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new GrokApiAdapterError(`${field} must be a positive safe integer`);
  return value as number;
}

function endpoint(value: unknown): string {
  const raw = nonBlank(value, 'baseUrl');
  let url: URL;
  try { url = new URL(raw); } catch { throw new GrokApiAdapterError('baseUrl must be an absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new GrokApiAdapterError('baseUrl must be credential-free HTTPS without query or fragment');
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/v1') throw new GrokApiAdapterError('baseUrl path must be exactly /v1');
  return `${url.origin}/v1`;
}

function rates(value: GrokRatesUsdPerMillion | undefined): GrokRatesUsdPerMillion | undefined {
  if (value === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(value, 'input') || !Object.prototype.hasOwnProperty.call(value, 'cachedInput') || !Object.prototype.hasOwnProperty.call(value, 'output')) {
    throw new GrokApiAdapterError('ratesUsdPerMillion must provide input, cachedInput, and output together');
  }
  for (const [field, amount] of Object.entries(value)) if (!Number.isFinite(amount) || amount < 0) throw new GrokApiAdapterError(`ratesUsdPerMillion.${field} must be finite and non-negative`);
  return value;
}

function json(text: string, purpose: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new GrokApiAdapterError(`${purpose} returned malformed JSON`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new GrokApiAdapterError(`${purpose} returned malformed JSON object`);
  return parsed as Record<string, unknown>;
}

function success(response: GrokHttpResponse, purpose: string): void {
  if (!response || response.timedOut) throw new GrokApiAdapterError(`${purpose} timed out`);
  if (response.redirected || response.status >= 300 && response.status < 400) throw new GrokApiAdapterError(`${purpose} redirect refused`);
  if (response.status < 200 || response.status >= 300) throw new GrokApiAdapterError(`${purpose} failed with HTTP ${response.status}`);
  if (response.outputCapped || typeof response.body !== 'string') throw new GrokApiAdapterError(`${purpose} exceeded response cap or returned non-text data`);
}

type ParsedResponse = { output: string; inputTokens: number; cachedInputTokens: number; outputTokens: number };
function parseResponse(body: string, expectedModel: string): ParsedResponse {
  const root = json(body, 'execution');
  if (root.model !== expectedModel) throw new GrokApiAdapterError('execution model identity mismatch');
  if (!Array.isArray(root.output)) throw new GrokApiAdapterError('execution output array is missing');
  const texts: string[] = [];
  for (const item of root.output) {
    if (!item || typeof item !== 'object' || (item as Record<string, unknown>).type !== 'message') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) throw new GrokApiAdapterError('message content is malformed');
    for (const part of content) {
      const value = part as Record<string, unknown> | null;
      if (value?.type === 'output_text') {
        if (typeof value.text !== 'string' || !value.text.trim()) throw new GrokApiAdapterError('output_text is malformed');
        texts.push(value.text);
      }
    }
  }
  if (texts.length !== 1) throw new GrokApiAdapterError('execution requires exactly one output_text');
  const usage = root.usage as Record<string, unknown> | undefined;
  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  const details = usage?.input_tokens_details as Record<string, unknown> | undefined;
  const cachedInputTokens = details?.cached_tokens ?? 0;
  for (const [field, value] of [['input_tokens', inputTokens], ['cached_tokens', cachedInputTokens], ['output_tokens', outputTokens]] as const) {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new GrokApiAdapterError(`execution usage ${field} is malformed`);
  }
  if ((cachedInputTokens as number) > (inputTokens as number)) throw new GrokApiAdapterError('execution cached input exceeds input tokens');
  return { output: texts[0], inputTokens: inputTokens as number, cachedInputTokens: cachedInputTokens as number, outputTokens: outputTokens as number };
}

/** Production HTTP boundary. Redirects are manual, errors never include headers or bodies. */
export function createGrokFetchExecutor(fetchImpl: typeof fetch = fetch): GrokHttpExecutor {
  return {
    async execute(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.body === undefined ? {} : { body: request.body }),
          redirect: 'manual',
          signal: controller.signal,
        });
        const declared = Number(response.headers.get('content-length') ?? 0);
        if (Number.isFinite(declared) && declared > request.maxOutputBytes) return { status: response.status, body: '', timedOut: false, outputCapped: true, redirected: response.status >= 300 && response.status < 400 };
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            totalBytes += next.value.byteLength;
            if (totalBytes > request.maxOutputBytes) {
              await reader.cancel().catch(() => undefined);
              return { status: response.status, body: '', timedOut: false, outputCapped: true, redirected: response.status >= 300 && response.status < 400 };
            }
            chunks.push(next.value);
          }
        }
        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { status: response.status, body: new TextDecoder().decode(bytes), timedOut: false, outputCapped: false, redirected: response.status >= 300 && response.status < 400 };
      } catch (error) {
        if (controller.signal.aborted) return { status: 0, body: '', timedOut: true, outputCapped: false, redirected: false };
        throw new GrokApiAdapterError(`network request failed: ${error instanceof Error ? error.name : 'unknown error'}`);
      } finally { clearTimeout(timer); }
    },
  };
}

export function createGrokApiAdapter(input: GrokApiAdapterConfig, executor: GrokHttpExecutor): ProviderAdapter {
  if (!input?.modelConfig || typeof input.modelConfig !== 'object') throw new GrokApiAdapterError('modelConfig is required');
  if (!executor || typeof executor.execute !== 'function') throw new GrokApiAdapterError('HTTP executor is required');
  const baseUrl = endpoint(input.baseUrl);
  const apiKey = nonBlank(input.apiKey, 'apiKey');
  const modelKey = nonBlank(input.modelKey, 'modelKey');
  const adapterVersion = nonBlank(input.adapterVersion, 'adapterVersion');
  const timeoutMs = positiveInteger(input.timeoutMs, 'timeoutMs');
  const maxOutputBytes = positiveInteger(input.maxOutputBytes, 'maxOutputBytes');
  const pricing = rates(input.ratesUsdPerMillion);
  let identity;
  try { identity = identityFromModelConfig(input.modelConfig, modelKey, adapterVersion); }
  catch (error) { throw new GrokApiAdapterError(`modelKey is not registered: ${(error as Error).message}`); }
  if (identity.provider !== 'grok') throw new GrokApiAdapterError('modelKey must resolve to provider "grok"');
  const headers = { authorization: `Bearer ${apiKey}`, accept: 'application/json', 'content-type': 'application/json' };
  return {
    identity,
    async capabilityProbe() {
      const response = await executor.execute({
        url: `${baseUrl}/models/${encodeURIComponent(identity.modelId)}`, method: 'GET', headers,
        timeoutMs, maxOutputBytes,
      });
      success(response, 'capability probe');
      const body = json(response.body, 'capability probe');
      if (body.id !== identity.modelId) throw new GrokApiAdapterError('capability probe model identity mismatch');
      return { provider: 'grok', capabilities: ['execute-phase', 'evidence-binding', `xai-model:${identity.modelId}`, 'responses-api'] };
    },
    async executePhase(prompt: string) {
      if (typeof prompt !== 'string' || !prompt.trim()) throw new GrokApiAdapterError('phase prompt must be non-blank');
      if (Buffer.byteLength(prompt, 'utf8') > 32_768) throw new GrokApiAdapterError('phase prompt exceeds 32 KiB');
      const response = await executor.execute({
        url: `${baseUrl}/responses`, method: 'POST', headers,
        body: JSON.stringify({ model: identity.modelId, input: [{ role: 'user', content: prompt }] }),
        timeoutMs, maxOutputBytes,
      });
      success(response, 'execution');
      const parsed = parseResponse(response.body, identity.modelId);
      if (!pricing) return { output: parsed.output, cost: normalizeCost(undefined) };
      const costUsd = ((parsed.inputTokens - parsed.cachedInputTokens) * pricing.input + parsed.cachedInputTokens * pricing.cachedInput + parsed.outputTokens * pricing.output) / 1_000_000;
      return { output: parsed.output, cost: normalizeCost({ inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens, costUsd }) };
    },
  };
}
