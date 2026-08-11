#!/usr/bin/env tsx
/**
 * Scheduler-owned Confluence refetch actor for O2 continuous assurance.
 *
 * The actor delegates the actual page conversion to the existing Confluence MCP so nightly drift
 * compares the exact same B0 text shape as feature intake. Credentials remain process/local-env
 * concerns and are never accepted on argv or emitted in evidence.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import { SPEC_REFETCH_SENTINEL } from './continuous-assurance';
import { sha256 } from './spec-ir';

type Env = Record<string, string | undefined>;
type RpcMessage = { id?: number; result?: unknown; error?: { message?: string } };

const SOURCE_CAP_BYTES = 2 * 1024 * 1024;
const RPC_OUTPUT_CAP_BYTES = 4 * 1024 * 1024;
export const CONFLUENCE_MCP_RPC_TIMEOUT_MS = 90_000;

export class ConfluenceRefetchActorError extends Error {
  constructor(message: string) {
    super(`confluence-refetch-actor: ${message}`);
    this.name = 'ConfluenceRefetchActorError';
  }
}

export interface ConfluencePageIdentity {
  url: string;
  pageId: string;
  sourceRef: string;
}

export interface ConfluenceRefetchEnvelope {
  v: 1;
  sourceRef: string;
  sourceSha256: string;
  sourceText: string;
}

export function parseConfluencePageIdentity(rawUrl: string): ConfluencePageIdentity {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try { parsed = new URL(trimmed); }
  catch { throw new ConfluenceRefetchActorError('O2_CONFLUENCE_URL must be an absolute HTTPS URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new ConfluenceRefetchActorError('O2_CONFLUENCE_URL must be an absolute HTTPS URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfluenceRefetchActorError('O2_CONFLUENCE_URL must not contain credentials, query parameters, or fragments');
  }
  const pageMatch = parsed.pathname.match(/\/pages\/(\d+)(?:\/|$)/);
  if (!pageMatch) throw new ConfluenceRefetchActorError('O2_CONFLUENCE_URL must contain a numeric /pages/<id> path');
  return { url: parsed.toString(), pageId: pageMatch[1], sourceRef: `confluence:${pageMatch[1]}` };
}

export function buildConfluenceRefetchEnvelope(rawUrl: string, sourceText: string): ConfluenceRefetchEnvelope {
  const identity = parseConfluencePageIdentity(rawUrl);
  const bytes = Buffer.byteLength(sourceText, 'utf8');
  if (bytes === 0) throw new ConfluenceRefetchActorError('fetch returned empty source text');
  if (bytes > SOURCE_CAP_BYTES) throw new ConfluenceRefetchActorError(`fetch exceeded ${SOURCE_CAP_BYTES}-byte source cap`);
  return { v: 1, sourceRef: identity.sourceRef, sourceSha256: sha256(sourceText), sourceText };
}

export function formatConfluenceRefetchEnvelope(envelope: ConfluenceRefetchEnvelope): string {
  return `${SPEC_REFETCH_SENTINEL} ${JSON.stringify(envelope)}`;
}

/**
 * Map dashboard runner secrets into the existing MCP's canonical auth env names.
 * A complete Basic pair deliberately wins over a leftover PAT, matching the interactive runner.
 */
export function childEnvForMcp(env: Env): Env {
  const child = { ...env };
  const runnerUser = child.RUNNER_CONFLUENCE_USER?.trim();
  const runnerPass = child.RUNNER_CONFLUENCE_PASS?.trim();
  const directUser = child.CONFLUENCE_USER?.trim();
  const directPass = child.CONFLUENCE_PASS?.trim();
  if (!!runnerUser !== !!runnerPass) {
    throw new ConfluenceRefetchActorError('runner Basic auth requires both user and password');
  }
  if (!!directUser !== !!directPass) {
    throw new ConfluenceRefetchActorError('Basic auth requires both user and password');
  }
  if (runnerUser && runnerPass) {
    child.CONFLUENCE_USER = runnerUser;
    child.CONFLUENCE_PASS = runnerPass;
    delete child.CONFLUENCE_TOKEN;
  } else if (directUser && directPass) {
    child.CONFLUENCE_USER = directUser;
    child.CONFLUENCE_PASS = directPass;
    delete child.CONFLUENCE_TOKEN;
  } else if (!child.CONFLUENCE_TOKEN?.trim() && child.RUNNER_CONFLUENCE_TOKEN?.trim()) {
    child.CONFLUENCE_TOKEN = child.RUNNER_CONFLUENCE_TOKEN.trim();
  }
  delete child.RUNNER_CONFLUENCE_TOKEN;
  delete child.RUNNER_CONFLUENCE_USER;
  delete child.RUNNER_CONFLUENCE_PASS;
  return child;
}

function safeErrorText(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/xox[baprs]-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/(token|pass(?:word)?|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 500);
}

class McpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private receivedBytes = 0;
  private readonly waiters = new Map<number, { resolve: (value: RpcMessage) => void; reject: (error: Error) => void }>();

  constructor(kitRoot: string, env: Env) {
    const tsxCli = path.join(kitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    this.child = spawn(process.execPath, [tsxCli, '.claude/mcp-server/index.ts'], {
      cwd: kitRoot,
      env: childEnvForMcp(env) as NodeJS.ProcessEnv,
      shell: false,
      stdio: 'pipe',
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.child.stderr.on('data', (chunk: Buffer | string) => {
      if (Buffer.byteLength(chunk) > RPC_OUTPUT_CAP_BYTES) this.rejectAndStop('Confluence MCP stderr exceeded output cap');
    });
    this.child.on('error', (error) => this.rejectAndStop(`Confluence MCP spawn failed: ${safeErrorText(error)}`));
    this.child.on('exit', (code) => this.rejectAll(new ConfluenceRefetchActorError(`Confluence MCP exited before response (code ${code ?? 'null'})`)));
  }

  private onData(chunk: string): void {
    this.receivedBytes += Buffer.byteLength(chunk, 'utf8');
    if (this.receivedBytes > RPC_OUTPUT_CAP_BYTES) {
      this.rejectAndStop('Confluence MCP stdout exceeded output cap');
      return;
    }
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: RpcMessage;
      try { message = JSON.parse(line) as RpcMessage; }
      catch { continue; }
      if (typeof message.id !== 'number') continue;
      const waiter = this.waiters.get(message.id);
      if (!waiter) continue;
      this.waiters.delete(message.id);
      waiter.resolve(message);
    }
  }

  private rejectAll(error: Error): void {
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
  }

  private rejectAndStop(message: string): void {
    this.rejectAll(new ConfluenceRefetchActorError(message));
    this.child.kill();
  }

  request(id: number, method: string, params: unknown): Promise<RpcMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(id);
        reject(new ConfluenceRefetchActorError(`timeout waiting for MCP ${method}`));
      }, CONFLUENCE_MCP_RPC_TIMEOUT_MS);
      this.waiters.set(id, {
        resolve: (message) => { clearTimeout(timeout); resolve(message); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string, params: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  close(): void {
    this.child.kill();
  }
}

function extractMcpSource(result: unknown): string {
  const response = result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | null;
  if (!response || response.isError) {
    const toolText = response?.content?.find((entry) => entry.type === 'text')?.text ?? 'tool returned no diagnostic';
    throw new ConfluenceRefetchActorError(`fetch_confluence_page failed: ${safeErrorText(toolText)}`);
  }
  const source = response.content?.find((entry) => entry.type === 'text')?.text;
  if (typeof source !== 'string' || source.length === 0) {
    throw new ConfluenceRefetchActorError('fetch_confluence_page returned no text source');
  }
  return source;
}

export async function fetchConfluencePageViaMcp(url: string, env: Env = process.env): Promise<string> {
  const kitRoot = path.resolve(__dirname, '..', '..');
  const client = new McpClient(kitRoot, env);
  try {
    const init = await client.request(1, 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'o2-confluence-refetch', version: '1' },
    });
    if (init.error) throw new ConfluenceRefetchActorError(`MCP initialize failed: ${safeErrorText(init.error.message)}`);
    client.notify('notifications/initialized', {});
    const response = await client.request(2, 'tools/call', { name: 'fetch_confluence_page', arguments: { url } });
    if (response.error) throw new ConfluenceRefetchActorError(`MCP tool request failed: ${safeErrorText(response.error.message)}`);
    return extractMcpSource(response.result);
  } finally {
    client.close();
  }
}

export async function runConfluenceRefetchActor(input: {
  env: Env;
  fetchPage?: (url: string, env: Env) => Promise<string>;
}): Promise<string> {
  const rawUrl = input.env.O2_CONFLUENCE_URL?.trim();
  if (!rawUrl) throw new ConfluenceRefetchActorError('O2_CONFLUENCE_URL is required');
  const identity = parseConfluencePageIdentity(rawUrl);
  const fetchPage = input.fetchPage ?? fetchConfluencePageViaMcp;
  const sourceText = await fetchPage(identity.url, input.env);
  return formatConfluenceRefetchEnvelope(buildConfluenceRefetchEnvelope(identity.url, sourceText));
}

if (require.main === module) {
  runConfluenceRefetchActor({ env: process.env })
    .then((line) => { process.stdout.write(`${line}\n`); })
    .catch((error) => {
      console.error(`confluence-refetch-actor: ${safeErrorText(error)}`);
      process.exitCode = 1;
    });
}
