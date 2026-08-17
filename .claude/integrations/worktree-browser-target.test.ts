import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BROWSER_TARGET_SCHEMA_VERSION,
  assertNoJunctionDependency,
  isLinkedGitWorktree,
  parseBrowserTargetConfig,
  prepareBrowserTarget,
  validateBrowserTargetProvenance,
  type BrowserTargetConfig,
} from './worktree-browser-target';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`); }
}

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser worktree Ω '));
  fs.writeFileSync(path.join(root, '.git'), 'gitdir: safe-temp-fixture\n');
  return root;
}

async function withServer(handler: http.RequestListener, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

function byteConfig(root: string, serverUrl: string): BrowserTargetConfig {
  return parseBrowserTargetConfig({
    schemaVersion: BROWSER_TARGET_SCHEMA_VERSION,
    mode: 'byte_identity',
    worktreeRoot: root,
    serverUrl,
    byteIdentity: { localPath: 'public/identity.txt', publicPath: '/identity.txt' },
  });
}

async function main(): Promise<void> {
  await test('strict config rejects extra fields, shell strings, unsafe paths, and ambiguous modes', () => {
    const base = { schemaVersion: BROWSER_TARGET_SCHEMA_VERSION, mode: 'byte_identity', worktreeRoot: '.', serverUrl: 'http://localhost:3000', byteIdentity: { localPath: 'x', publicPath: '/x' } };
    for (const attacked of [
      { ...base, claim: 'verified' },
      { ...base, byteIdentity: { localPath: '../secret', publicPath: '/x' } },
      { ...base, byteIdentity: { localPath: 'x', publicPath: 'https://other.example/x' } },
      { schemaVersion: BROWSER_TARGET_SCHEMA_VERSION, mode: 'managed', worktreeRoot: '.', serverUrl: 'http://localhost:3000', managed: { executable: 'npm run dev', args: [], readyPath: '/ready', timeoutMs: 2000 } },
    ]) assert.throws(() => parseBrowserTargetConfig(attacked));
  });

  await test('linked worktree detection uses the .git file contract', () => {
    const root = tempRoot();
    try { assert.equal(isLinkedGitWorktree(root), true); fs.unlinkSync(path.join(root, '.git')); fs.mkdirSync(path.join(root, '.git')); assert.equal(isLinkedGitWorktree(root), false); }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('byte identity binds same-origin server bytes to the exact worktree', async () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'identity.txt'), 'EXACT-WORKTREE-BYTES');
    try {
      await withServer((request, response) => {
        if (request.url === '/identity.txt') response.end('EXACT-WORKTREE-BYTES');
        else if (request.url === '/feature') response.end('<h1>Exact feature</h1>');
        else { response.statusCode = 404; response.end('missing'); }
      }, async (serverUrl) => {
        const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config: byteConfig(root, serverUrl) });
        assert.equal(session.provenance.status, 'verified');
        assert.equal(session.provenance.reasonCode, 'byte-identity-match');
        assert.equal(session.provenance.localHash, session.provenance.remoteHash);
        assert.equal(validateBrowserTargetProvenance(session.provenance), true);
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('wrong-server bytes reject browser evidence before the route can pass', async () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'identity.txt'), 'WORKTREE-A');
    try {
      await withServer((_request, response) => response.end('WORKTREE-B'), async (serverUrl) => {
        const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config: byteConfig(root, serverUrl) });
        assert.equal(session.provenance.status, 'rejected');
        assert.equal(session.provenance.reasonCode, 'byte-identity-mismatch');
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('identity match plus unavailable route returns structured needs_input', async () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'identity.txt'), 'MATCH');
    try {
      await withServer((request, response) => { if (request.url === '/identity.txt') response.end('MATCH'); else { response.statusCode = 404; response.end('missing'); } }, async (serverUrl) => {
        const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config: byteConfig(root, serverUrl) });
        assert.equal(session.provenance.status, 'needs_input');
        assert.equal(session.provenance.reasonCode, 'browser-route-unavailable');
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('configured root mismatch rejects a main-workspace server substitution', async () => {
    const root = tempRoot(); const other = tempRoot();
    try {
      const config = byteConfig(other, 'http://127.0.0.1:9');
      const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config });
      assert.equal(session.provenance.status, 'rejected');
      assert.equal(session.provenance.reasonCode, 'worktree-root-mismatch');
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); }
  });

  await test('a full route URL cannot escape the identity-verified server origin', async () => {
    const root = tempRoot(); fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'identity.txt'), 'X');
    try {
      const session = await prepareBrowserTarget({ cwd: root, route: 'https://wrong.example/feature', config: byteConfig(root, 'http://127.0.0.1:9') });
      assert.equal(session.provenance.status, 'rejected');
      assert.equal(session.provenance.reasonCode, 'browser-route-cross-origin');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('managed mode launches a real server in the exact worktree and cleans it up twice safely', async () => {
    const root = tempRoot();
    const serverFile = path.join(root, 'fixture server.js');
    const portProbe = http.createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
    const address = portProbe.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    fs.writeFileSync(serverFile, [
      "const http=require('http');",
      "const fs=require('fs');",
      "http.createServer((req,res)=>{ if(req.url==='/ready')res.end(process.cwd()); else if(req.url==='/feature')res.end('<h1>Managed exact worktree</h1>'); else {res.statusCode=404;res.end('missing');} }).listen(Number(process.argv[2]),'127.0.0.1');",
    ].join('\n'));
    const config = parseBrowserTargetConfig({
      schemaVersion: BROWSER_TARGET_SCHEMA_VERSION, mode: 'managed', worktreeRoot: root,
      serverUrl: `http://127.0.0.1:${port}`,
      managed: { executable: process.execPath, args: [serverFile, String(port)], readyPath: '/ready', timeoutMs: 10_000 },
    });
    try {
      const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config });
      assert.equal(session.provenance.status, 'verified');
      assert.equal(session.provenance.reasonCode, 'exact-worktree-server');
      assert.equal(validateBrowserTargetProvenance(session.provenance), true);
      await session.close(); await session.close();
      await assert.rejects(() => fetch(`${config.serverUrl}/ready`));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('node_modules junction refusal uses only disposable temp directories', () => {
    const root = tempRoot(); const target = fs.mkdtempSync(path.join(os.tmpdir(), 'safe dependency target '));
    try {
      fs.symlinkSync(target, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => assertNoJunctionDependency(root), /node-modules-junction/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); }
  });

  await test('provenance rejects a forged content hash and extra claim field', async () => {
    const root = tempRoot(); fs.mkdirSync(path.join(root, 'public')); fs.writeFileSync(path.join(root, 'public', 'identity.txt'), 'X');
    try {
      await withServer((_request, response) => response.end('X'), async (serverUrl) => {
        const session = await prepareBrowserTarget({ cwd: root, route: '/feature', config: byteConfig(root, serverUrl) });
        const forged = { ...session.provenance, contentHash: '0'.repeat(64) };
        assert.equal(validateBrowserTargetProvenance(forged), false);
        assert.equal(validateBrowserTargetProvenance({ ...session.provenance, claim: 'browser passed' }), false);
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  await test('B11 and prompt wiring cannot retain the historical infra-blocked pass exception', () => {
    const b11 = fs.readFileSync(path.join(process.cwd(), '.claude', 'integrations', 'b11-runner.ts'), 'utf8');
    const prompt = fs.readFileSync(path.join(process.cwd(), '.claude', 'commands', 'feature-from-confluence.md'), 'utf8');
    assert.match(b11, /isLinkedGitWorktree\(cwd\)/);
    assert.match(b11, /browser-target-config-required/);
    assert.match(b11, /browserTargetRouteResult/);
    assert.match(prompt, /structured `needs_input`\/`rejected` provenance/);
    assert.doesNotMatch(prompt, /extended-checks=infra-blocked reason=worktree-route-not-deployed/);
  });

  console.log(`\nworktree-browser-target.test: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
