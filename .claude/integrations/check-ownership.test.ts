/**
 * Tests for check-ownership.ts (audit F9) — the script that prevents implementing a feature
 * into the wrong MFE. Run: npx tsx .claude/integrations/check-ownership.test.ts
 */
import { classifyOwnership, exitCodeFor } from './check-ownership';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`✅ ${name}`); } catch (e) { failed += 1; console.log(`❌ ${name}\n     ${(e as Error).message}`); }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

test('sibling MFE route → mismatch (exit 1) — the demonstrated wrong-repo case', () => {
  const r = classifyOwnership('/my-app-authoring/class-management/edit/9', '/my-app-learning/');
  assert(r.verdict === 'mismatch', `expected mismatch, got ${r.verdict}`);
  assert(exitCodeFor(r.verdict) === 1, 'mismatch must exit 1 (block)');
});

test('same MFE route → match (exit 0)', () => {
  const r = classifyOwnership('/my-app-learning/course-dashboard/home', '/my-app-learning/');
  assert(r.verdict === 'match', `expected match, got ${r.verdict}`);
  assert(exitCodeFor(r.verdict) === 0, 'match must not block');
});

test('bare feature route (no MFE prefix) → indeterminate, non-blocking', () => {
  const r = classifyOwnership('/course-dashboard/home', '/my-app-learning/');
  assert(r.verdict === 'indeterminate', `expected indeterminate, got ${r.verdict}`);
  assert(exitCodeFor(r.verdict) === 0, 'indeterminate must not block');
});

test('no PUBLIC_PATH resolved → unknown-app-path, non-blocking', () => {
  const r = classifyOwnership('/my-app-learning/x', '');
  assert(r.verdict === 'unknown-app-path', `expected unknown-app-path, got ${r.verdict}`);
  assert(exitCodeFor(r.verdict) === 0, 'unknown-app-path must not block');
});

test('absolute-URL route is normalized (scheme+host stripped) before comparison', () => {
  const r = classifyOwnership('http://localhost:3000/my-app-authoring/x', '/my-app-learning/');
  assert(r.verdict === 'mismatch', `expected mismatch for absolute sibling URL, got ${r.verdict}`);
});

test('unrelated app family route → indeterminate (not a false mismatch)', () => {
  const r = classifyOwnership('/other-app/some-route', '/my-app-learning/');
  assert(r.verdict === 'indeterminate', `expected indeterminate, got ${r.verdict}`);
});

test('shell-mangled route (MSYS rewrites leading / to a Windows path) is STILL caught as mismatch', () => {
  // git-bash turns "/my-app-authoring/x" into "C:/Program Files/Git/my-app-authoring/x"
  const r = classifyOwnership('C:/Program Files/Git/my-app-authoring/class-management', '/my-app-learning/');
  assert(r.verdict === 'mismatch', `mangled sibling route must still be mismatch, got ${r.verdict}`);
  assert(r.routeSlug === 'my-app-authoring', `expected recovered slug, got ${r.routeSlug}`);
});

test('mangled bare route (no MFE family segment) → indeterminate, not a false mismatch', () => {
  const r = classifyOwnership('C:/Program Files/Git/course-dashboard/home', '/my-app-learning/');
  assert(r.verdict === 'indeterminate', `expected indeterminate, got ${r.verdict}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
