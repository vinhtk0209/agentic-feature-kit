/**
 * Tests for memory.ts — the resume core (load / save / clear + CRLF tolerance).
 * Run: npx tsx .claude/integrations/memory.test.ts
 *
 * Closes the audit "untested core" gap and regression-guards the documented CRLF
 * resume bug (git autocrlf rewrote LF→\r\n, and an LF-only regex failed to parse
 * memory.ts's own committed output). All I/O is sandboxed in a temp CWD.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  saveContext, loadContext, clearContext, getCurrentFeatureName, getContextPath,
} from './memory';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

// Sandbox: run inside a temp CWD so SPECS_DIR ('docs/specs') is isolated from the repo.
const origCwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
process.chdir(tmp);

try {
  test('fresh session → loadContext returns null (no pointer)', () => {
    assert(getCurrentFeatureName() === null, 'expected no active feature');
    assert(loadContext() === null, 'expected null context on fresh session');
  });

  test('save → pointer set + round-trip load', () => {
    saveContext('scope_confirmed', { featureName: 'Alpha', taskType: 'NEW' });
    assert(getCurrentFeatureName() === 'Alpha', 'pointer should be Alpha');
    const ctx = loadContext();
    assert(ctx !== null, 'context should load');
    assert(ctx!.featureName === 'Alpha', 'featureName round-trips');
    assert(ctx!.taskType === 'NEW', 'taskType round-trips');
    assert(ctx!.phase === 'scope_confirmed', 'phase round-trips');
  });

  test('save-merge preserves prior fields (silent field-drop guard)', () => {
    saveContext('plan_confirmed', { featureName: 'Alpha', decisions: { a: 'b' } });
    const ctx = loadContext();
    assert(ctx!.taskType === 'NEW', 'taskType retained across saves');
    assert(ctx!.phase === 'plan_confirmed', 'phase updated');
    assert(ctx!.decisions.a === 'b', 'new decision merged');
  });

  test('finalConfirmed save round-trips (digest branch must not throw)', () => {
    saveContext('final_confirmed', { featureName: 'Alpha', finalConfirmed: true });
    const ctx = loadContext();
    assert(ctx!.finalConfirmed === true, 'finalConfirmed round-trips');
  });

  test('CRLF-encoded context-summary parses (the documented resume bug)', () => {
    clearContext();
    const name = 'Beta';
    const specsDir = path.join(tmp, 'docs', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '.current-feature'), name, 'utf-8');
    const ctxPath = getContextPath(name);
    fs.mkdirSync(path.dirname(ctxPath), { recursive: true });
    const json = JSON.stringify({ phase: 'scope_confirmed', featureName: name, taskType: 'BASELINE' }, null, 2);
    // CRLF line endings simulate git autocrlf on checkout.
    const md = `# Context Summary\n\n## Raw JSON\n\n\`\`\`json\n${json}\n\`\`\`\n`.replace(/\n/g, '\r\n');
    fs.writeFileSync(ctxPath, md, 'utf-8');
    const ctx = loadContext();
    assert(ctx !== null, 'CRLF context must parse (regression: LF-only regex failed here)');
    assert(ctx!.featureName === 'Beta', 'CRLF featureName parses');
    assert(ctx!.taskType === 'BASELINE', 'CRLF taskType parses');
  });

  test('clear removes context + pointer', () => {
    saveContext('scope_confirmed', { featureName: 'Gamma', taskType: 'NEW' });
    clearContext();
    assert(getCurrentFeatureName() === null, 'pointer cleared');
    assert(loadContext() === null, 'context cleared');
  });
} finally {
  process.chdir(origCwd);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
