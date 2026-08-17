import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { refreshBoundarySource } from './refresh-post17-orchestrator-boundary';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`); }
}

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(heading = '## B0 Test\nbody\n'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary refresh Ω '));
  fs.mkdirSync(path.join(root, '.claude', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'roadmap'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'commands', 'feature-from-confluence.md'), heading, 'utf8');
  fs.writeFileSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'), JSON.stringify({
    generatedOn: '2000-01-01',
    source: {
      path: '.claude/commands/feature-from-confluence.md',
      canonicalization: 'crlf-to-lf',
      gitCommit: '0'.repeat(40), gitBlob: '0'.repeat(40), sha256: '0'.repeat(64), lineCount: 0,
    },
    phases: [{ id: 'B0', sourceLines: [1, 2] }],
  }));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'boundary@example.invalid']);
  git(root, ['config', 'user.name', 'Boundary Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}

test('clean committed flagship refreshes commit, blob, SHA, date, and line count atomically', () => {
  const root = fixture();
  try {
    const result = refreshBoundarySource(root, '2026-08-14');
    const source = fs.readFileSync(path.join(root, '.claude', 'commands', 'feature-from-confluence.md'), 'utf8');
    assert.equal(result.generatedOn, '2026-08-14');
    assert.equal(result.source.gitCommit, git(root, ['rev-parse', 'HEAD']));
    assert.equal(result.source.gitBlob, git(root, ['rev-parse', 'HEAD:.claude/commands/feature-from-confluence.md']));
    assert.equal(result.source.canonicalization, 'crlf-to-lf');
    assert.equal(result.source.sha256, createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex'));
    assert.equal(result.source.lineCount, 2);
    assert.match(fs.readFileSync(path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json'), 'utf8'), /"phases":\[\{"id":"B0","sourceLines":\[1,2\]\}\]\}/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('LF and CRLF worktrees produce the same canonical source SHA', () => {
  const lfRoot = fixture('## B0 Test\nbody\n');
  const crlfRoot = fixture('## B0 Test\r\nbody\r\n');
  try {
    const lf = refreshBoundarySource(lfRoot, '2026-08-14');
    const crlf = refreshBoundarySource(crlfRoot, '2026-08-14');
    assert.equal(crlf.source.sha256, lf.source.sha256);
  } finally {
    fs.rmSync(lfRoot, { recursive: true, force: true });
    fs.rmSync(crlfRoot, { recursive: true, force: true });
  }
});

test('dirty boundary semantics refuse refresh and preserve the worktree boundary bytes', () => {
  const root = fixture();
  try {
    const boundaryPath = path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json');
    const dirty = fs.readFileSync(boundaryPath, 'utf8').replace('"sourceLines":[1,2]', '"sourceLines":[1,3]');
    fs.writeFileSync(boundaryPath, dirty, 'utf8');
    assert.throws(() => refreshBoundarySource(root, '2026-08-14'), /boundary structure is dirty/);
    assert.equal(fs.readFileSync(boundaryPath, 'utf8'), dirty);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('dirty flagship refuses refresh and leaves the boundary byte-identical', () => {
  const root = fixture();
  try {
    const boundaryPath = path.join(root, 'docs', 'roadmap', 'post-17-orchestrator-boundaries.json');
    const before = fs.readFileSync(boundaryPath, 'utf8');
    fs.appendFileSync(path.join(root, '.claude', 'commands', 'feature-from-confluence.md'), 'dirty\n');
    assert.throws(() => refreshBoundarySource(root, '2026-08-14'), /flagship source is dirty/);
    assert.equal(fs.readFileSync(boundaryPath, 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('phase anchor drift refuses refresh instead of blessing a moved boundary', () => {
  const root = fixture('## WRONG Test\nbody\n');
  try { assert.throws(() => refreshBoundarySource(root, '2026-08-14'), /phase anchor drifted: B0/); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('phase range drift refuses refresh instead of blessing gaps or trailing overlap', () => {
  const root = fixture('## B0 Test\nbody\nextra\n');
  try { assert.throws(() => refreshBoundarySource(root, '2026-08-14'), /phase range drifted: B0/); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});

console.log(`\nrefresh-post17-orchestrator-boundary.test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
