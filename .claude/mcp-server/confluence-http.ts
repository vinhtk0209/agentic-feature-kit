import axios from 'axios';
import { existsSync, lstatSync } from 'node:fs';
import type { Agent } from 'node:https';
import { isAbsolute } from 'node:path';

export const CONFLUENCE_JSON_MAX_BYTES = 4 * 1024 * 1024;
export const CONFLUENCE_DIRECT_TIMEOUT_MS = 12_000;
export const CONFLUENCE_BROWSER_TIMEOUT_MS = 40_000;

export interface ConfluenceRawResponse {
  status: number;
  headers: Record<string, unknown>;
  body: string;
}

export interface ConfluenceHttpRequest {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBodyBytes: number;
  executablePath?: string;
  httpsAgent?: Agent;
}

export interface ConfluenceHttpDependencies {
  directGet?: (request: ConfluenceHttpRequest) => Promise<ConfluenceRawResponse>;
  browserGet?: (request: ConfluenceHttpRequest) => Promise<ConfluenceRawResponse>;
}

export class ConfluenceHttpError extends Error {
  readonly response?: { status: number };

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ConfluenceHttpError';
    if (status !== undefined) this.response = { status };
  }
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  if (Array.isArray(value)) return value.map(String).join(',');
  return value === undefined || value === null ? '' : String(value);
}

export function isCloudflareManagedChallenge(response: Pick<ConfluenceRawResponse, 'status' | 'headers'>): boolean {
  return response.status === 403
    && headerValue(response.headers, 'cf-mitigated').trim().toLowerCase() === 'challenge';
}

export function isSameOriginUrl(targetUrl: string, candidateUrl: string): boolean {
  try {
    return new URL(targetUrl).origin === new URL(candidateUrl).origin;
  } catch {
    return false;
  }
}

function validateHttpsUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfluenceHttpError('confluence-http: URL is malformed');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ConfluenceHttpError('confluence-http: URL must be credential-free HTTPS');
  }
  return url.toString();
}

function validateBrowserExecutable(env: NodeJS.ProcessEnv): string {
  const executablePath = env.CONFLUENCE_BROWSER_EXECUTABLE?.trim();
  if (!executablePath) {
    throw new ConfluenceHttpError(
      'confluence-http: Cloudflare challenge requires CONFLUENCE_BROWSER_EXECUTABLE',
    );
  }
  if (!isAbsolute(executablePath) || !existsSync(executablePath)) {
    throw new ConfluenceHttpError('confluence-http: browser executable must be an existing absolute path');
  }
  const stat = lstatSync(executablePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new ConfluenceHttpError('confluence-http: browser executable must be a regular non-symlink file');
  }
  return executablePath;
}

function parseJsonResponse(
  response: ConfluenceRawResponse,
  transport: 'direct' | 'browser',
  maxBodyBytes: number,
): unknown {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new ConfluenceHttpError(
      `confluence-http: ${transport} transport returned HTTP ${response.status}`,
      response.status,
    );
  }
  const contentType = headerValue(response.headers, 'content-type');
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ConfluenceHttpError(`confluence-http: ${transport} transport returned non-JSON content`);
  }
  if (typeof response.body !== 'string') {
    throw new ConfluenceHttpError(`confluence-http: ${transport} transport returned a non-text body`);
  }
  if (Buffer.byteLength(response.body, 'utf8') > maxBodyBytes) {
    throw new ConfluenceHttpError(`confluence-http: ${transport} response exceeded ${maxBodyBytes} bytes`);
  }
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new ConfluenceHttpError(`confluence-http: ${transport} transport returned malformed JSON`);
  }
}

async function axiosDirectGet(request: ConfluenceHttpRequest): Promise<ConfluenceRawResponse> {
  const response = await axios.get<string>(request.url, {
    headers: request.headers,
    httpsAgent: request.httpsAgent,
    timeout: request.timeoutMs,
    responseType: 'text',
    transformResponse: [(body) => body],
    maxContentLength: request.maxBodyBytes,
    maxBodyLength: request.maxBodyBytes,
    maxRedirects: 0,
    validateStatus: () => true,
  });
  return {
    status: response.status,
    headers: response.headers as Record<string, unknown>,
    body: typeof response.data === 'string' ? response.data : String(response.data),
  };
}

async function isolatedBrowserGet(request: ConfluenceHttpRequest): Promise<ConfluenceRawResponse> {
  if (!request.executablePath) {
    throw new ConfluenceHttpError('confluence-http: browser executable is required');
  }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    executablePath: request.executablePath,
    headless: true,
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: request.headers,
      serviceWorkers: 'block',
    });
    try {
      await context.route('**/*', async (route) => {
        if (!isSameOriginUrl(request.url, route.request().url())) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      const response = await page.goto(request.url, {
        waitUntil: 'domcontentloaded',
        timeout: request.timeoutMs,
      });
      if (!response) throw new ConfluenceHttpError('confluence-http: browser navigation returned no response');
      if (!isSameOriginUrl(request.url, response.url())) {
        throw new ConfluenceHttpError('confluence-http: browser transport crossed the approved origin');
      }
      const contentLength = Number(response.headers()['content-length']);
      if (Number.isFinite(contentLength) && contentLength > request.maxBodyBytes) {
        throw new ConfluenceHttpError(`confluence-http: browser response exceeded ${request.maxBodyBytes} bytes`);
      }
      const body = (await response.body()).toString('utf8');
      return { status: response.status(), headers: response.headers(), body };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export async function getConfluenceJson(
  rawUrl: string,
  headers: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ConfluenceHttpDependencies = {},
  httpsAgent?: Agent,
): Promise<unknown> {
  const url = validateHttpsUrl(rawUrl);
  const request: ConfluenceHttpRequest = {
    url,
    headers: { ...headers },
    timeoutMs: CONFLUENCE_DIRECT_TIMEOUT_MS,
    maxBodyBytes: CONFLUENCE_JSON_MAX_BYTES,
    httpsAgent,
  };
  const directResponse = await (dependencies.directGet ?? axiosDirectGet)(request);
  if (!isCloudflareManagedChallenge(directResponse)) {
    return parseJsonResponse(directResponse, 'direct', request.maxBodyBytes);
  }

  const executablePath = validateBrowserExecutable(env);
  const browserResponse = await (dependencies.browserGet ?? isolatedBrowserGet)({
    ...request,
    executablePath,
    timeoutMs: CONFLUENCE_BROWSER_TIMEOUT_MS,
  });
  return parseJsonResponse(browserResponse, 'browser', request.maxBodyBytes);
}
