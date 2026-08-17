#!/usr/bin/env node
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import {
  BROWSER_TARGET_SCHEMA_VERSION,
  parseBrowserTargetConfig,
  prepareBrowserTarget,
} from '../../.claude/integrations/worktree-browser-target';

export const P17_011_BROWSER_SENTINEL = '@@P17_011_BROWSER@@';

async function reservePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unable to reserve a browser fixture port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function parseHoldMs(argv: readonly string[]): number {
  if (argv.length !== 2 || argv[0] !== '--hold-ms') throw new Error('usage: p17-011-browser-fixture.ts --hold-ms <1000..300000>');
  const value = Number(argv[1]);
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) throw new Error('--hold-ms must be an integer from 1000 to 300000');
  return value;
}

async function main(): Promise<void> {
  const holdMs = parseHoldMs(process.argv.slice(2));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p17-011 linked worktree Ω '));
  const serverFile = path.join(root, 'exact worktree server.js');
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: disposable-evidence-fixture\n', 'utf8');
  const port = await reservePort();
  const page = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<title>P17-011 Worktree Browser Evidence</title></head><body>',
    '<main><h1>P17-011 exact worktree browser target</h1>',
    '<dl><dt>Target mode</dt><dd>managed exact-worktree server</dd>',
    '<dt>Route</dt><dd>/feature</dd><dt>Browser verdict</dt><dd>visible content pending browser inspection</dd></dl>',
    '</main></body></html>',
  ].join('');
  fs.writeFileSync(serverFile, [
    "const http=require('http');",
    `const page=${JSON.stringify(page)};`,
    "http.createServer((req,res)=>{ res.setHeader('content-type','text/html; charset=utf-8'); if(req.url==='/ready')res.end('READY'); else if(req.url==='/feature')res.end(page); else {res.statusCode=404;res.end('missing');} }).listen(Number(process.argv[2]),'127.0.0.1');",
  ].join('\n'), 'utf8');

  const config = parseBrowserTargetConfig({
    schemaVersion: BROWSER_TARGET_SCHEMA_VERSION,
    mode: 'managed',
    worktreeRoot: root,
    serverUrl: `http://127.0.0.1:${port}`,
    managed: {
      executable: process.execPath,
      args: [serverFile, String(port)],
      readyPath: '/ready',
      timeoutMs: 10_000,
    },
  });
  const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config });
  try {
    process.stdout.write(`${P17_011_BROWSER_SENTINEL}${JSON.stringify({
      url: `${config.serverUrl}/feature`,
      provenance: session.provenance,
      fixtureKind: 'disposable-linked-worktree',
    })}\n`);
    if (session.provenance.status !== 'verified') {
      process.exitCode = 1;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, holdMs));
  } finally {
    await session.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`P17-011 browser fixture failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
