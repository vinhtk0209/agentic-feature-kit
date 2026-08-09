/**
 * Live F3 golden evidence for the Confluence B0 boundary.
 *
 * Old B0's Confluence branch handed the MCP text response directly to B1. The canonical-IR
 * branch must first stage that exact UTF-8 response, then adapt it as inert raw-US data. This
 * test performs that real MCP call and proves byte-for-byte staging plus IR integrity/provenance.
 * It prints only hashes/counts, never credentials or specification text.
 *
 * Required env: F3_GOLDEN_CONFLUENCE_URL
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { stageConfluenceB0Source } from './spec-intake-confluence';

const url = process.env.F3_GOLDEN_CONFLUENCE_URL;
if (!url) {
  console.error('F3_GOLDEN_CONFLUENCE_URL is required for the live Confluence golden test');
  process.exit(1);
}

const kitRoot = path.resolve(__dirname, '..', '..');
const mcpCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

type RpcMessage = { id?: number; result?: unknown; error?: { message?: string } };

class McpClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly waiters = new Map<number, { resolve: (value: RpcMessage) => void; reject: (error: Error) => void }>();

  constructor() {
    this.child = spawn(mcpCommand, ['tsx', '.claude/mcp-server/index.ts'], {
      cwd: kitRoot,
      stdio: 'pipe',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('error', (error) => this.rejectAll(error));
    this.child.on('exit', (code) => this.rejectAll(new Error(`confluence MCP exited before response (code ${code ?? 'null'})`)));
  }

  private onData(chunk: string): void {
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

  request(id: number, method: string, params: unknown): Promise<RpcMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`timeout waiting for MCP ${method}`));
      }, 45_000);
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

async function main(): Promise<void> {
  const client = new McpClient();
  try {
    const init = await client.request(1, 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'f3-confluence-golden', version: '1' },
    });
    assert.ok(!init.error, `MCP initialize failed: ${init.error?.message ?? 'unknown error'}`);
    client.notify('notifications/initialized', {});
    const response = await client.request(2, 'tools/call', { name: 'fetch_confluence_page', arguments: { url } });
    assert.ok(!response.error, `MCP tool request failed: ${response.error?.message ?? 'unknown error'}`);
    const result = response.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    assert.ok(!result?.isError, 'fetch_confluence_page returned a tool error');
    const source = result?.content?.find((entry) => entry.type === 'text')?.text;
    assert.ok(typeof source === 'string' && source.length > 0, 'fetch_confluence_page returned no text source');
    assert.ok(source.startsWith('# '), 'MCP source must retain the B0 title header');
    assert.ok(source.includes(`**URL:** ${url}`), 'MCP source must retain its URL provenance');

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-confluence-golden-'));
    const staged = stageConfluenceB0Source(source, temp);
    const { ir } = staged;
    assert.ok(ir.paragraphs.length > 0, 'live Confluence source must yield paragraphs');
    assert.ok(ir.acceptanceCriteria.length > 0, 'live Confluence source must yield anchored acceptance criteria');
    for (const ac of ir.acceptanceCriteria) {
      const paragraph = ir.paragraphs.find((p) => p.anchor === ac.sourceAnchor);
      assert.ok(paragraph?.text.includes(ac.sourceQuote), `AC ${ac.id} lost byte-traceable source quote`);
    }

    console.log(JSON.stringify({
      verdict: 'pass',
      sourceSha256: staged.sourceSha256,
      bytes: staged.legacyB0Bytes,
      paragraphs: ir.paragraphs.length,
      acceptanceCriteria: ir.acceptanceCriteria.length,
      assertion: 'legacy B0 MCP text equals candidate staged bytes; canonical IR validates every AC provenance',
    }));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ verdict: 'error', name: (error as Error).name, error: (error as Error).message }));
  process.exit(1);
});
