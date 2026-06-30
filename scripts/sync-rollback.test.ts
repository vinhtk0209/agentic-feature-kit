/**
 * Tests for the A-05 sync rollback helpers in sync-to-targets.ts.
 *   npx tsx scripts/sync-rollback.test.ts   (or: npm run test:sync-rollback)
 * Pure FS logic only — does not run the real sync (no git/source/network).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listSnapshots, pruneSnapshots, applyRollback } from './sync-to-targets';

let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

function tmpdir(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-')); }

test('listSnapshots returns dirs sorted, ignoring files', () => {
  const d = tmpdir();
  for (const n of ['2026-01-02', '2026-01-01', '2026-01-03']) fs.mkdirSync(path.join(d, n));
  fs.writeFileSync(path.join(d, '.gitignore'), '*');
  assert(JSON.stringify(listSnapshots(d)) === JSON.stringify(['2026-01-01', '2026-01-02', '2026-01-03']), `got ${listSnapshots(d)}`);
  fs.rmSync(d, { recursive: true, force: true });
});

test('pruneSnapshots keeps only the newest N', () => {
  const d = tmpdir();
  for (const n of ['s1', 's2', 's3', 's4', 's5']) fs.mkdirSync(path.join(d, n));
  pruneSnapshots(d, 3);
  assert(JSON.stringify(listSnapshots(d)) === JSON.stringify(['s3', 's4', 's5']), `got ${listSnapshots(d)}`);
  fs.rmSync(d, { recursive: true, force: true });
});

test('applyRollback restores updated pre-images and deletes added files', () => {
  const root = tmpdir();
  const targetClaude = path.join(root, 'target', '.claude');
  const snapDir = path.join(root, 'snap');

  // Post-sync state in the target:
  fs.mkdirSync(path.join(targetClaude, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(targetClaude, 'commands', 'a.md'), 'NEW');   // was updated
  fs.writeFileSync(path.join(targetClaude, 'b.md'), 'ADDED-BY-SYNC');     // was added

  // Snapshot holds the pre-image of the updated file only:
  fs.mkdirSync(path.join(snapDir, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(snapDir, '.claude', 'commands', 'a.md'), 'OLD');

  const res = applyRollback(targetClaude, snapDir, { at: 'x', updated: ['commands/a.md'], added: ['b.md'] });

  assert(fs.readFileSync(path.join(targetClaude, 'commands', 'a.md'), 'utf8') === 'OLD', 'a.md restored to pre-image');
  assert(!fs.existsSync(path.join(targetClaude, 'b.md')), 'added file removed');
  assert(res.restored === 1 && res.removed === 1, `counts ${JSON.stringify(res)}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('applyRollback is a no-op-safe when files are already gone', () => {
  const root = tmpdir();
  const targetClaude = path.join(root, '.claude');
  fs.mkdirSync(targetClaude, { recursive: true });
  const res = applyRollback(targetClaude, path.join(root, 'missing-snap'), { at: 'x', updated: ['nope.md'], added: ['gone.md'] });
  assert(res.restored === 0 && res.removed === 0, `counts ${JSON.stringify(res)}`);
  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
