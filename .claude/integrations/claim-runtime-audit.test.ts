import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CLAIM_AUDIT_SENTINEL,
  auditRuntimeClaims,
  executeClaimProbe,
  hashFileTree,
  parseRuntimeClaimRegistry,
  validateClaimAuditResult,
} from './claim-runtime-audit';

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'claims', 'runtime-claims.json'), 'utf8'));
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI = path.join(__dirname, 'claim-runtime-audit.ts');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-runtime-audit-'));
let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}\n  ${(error as Error).message}`); }
}
function clone<T>(value: T): T { return structuredClone(value); }
function rejects(value: unknown, needle: string): void {
  let message = '';
  try { parseRuntimeClaimRegistry(value); } catch (error) { message = (error as Error).message; }
  assert(message.includes(needle), `expected ${needle}, got ${message || 'no rejection'}`);
}
function fixture(): string {
  const target = fs.mkdtempSync(path.join(scratch, 'root-'));
  for (const relative of ['README.md', 'package.json', '.gitignore']) fs.copyFileSync(path.join(ROOT, relative), path.join(target, relative));
  for (const relative of ['.claude/commands', 'docs/roadmap', 'providers', 'scripts']) {
    fs.cpSync(path.join(ROOT, relative), path.join(target, relative), { recursive: true });
  }
  return target;
}

test('canonical claims resolve to executable passing evidence', () => {
  const result = auditRuntimeClaims(REGISTRY, ROOT);
  assert(result.status === 'pass', JSON.stringify(result.claims.filter((claim) => claim.status !== 'pass'), null, 2));
  assert(result.claims.length === 6 && validateClaimAuditResult(result), 'canonical result invalid');
});

test('source CLI emits exactly one validated sentinel envelope', () => {
  const child = spawnSync(process.execPath, [TSX, CLI], { cwd: ROOT, encoding: 'utf8', shell: false, timeout: 60_000 });
  assert(child.status === 0, `exit=${child.status}; stderr=${child.stderr}`);
  const lines = child.stdout.trim().split(/\r?\n/);
  assert(lines.length === 1 && lines[0].startsWith(CLAIM_AUDIT_SENTINEL), child.stdout);
  assert(validateClaimAuditResult(JSON.parse(lines[0].slice(CLAIM_AUDIT_SENTINEL.length))), 'CLI envelope invalid');
});

test('registry rejects duplicate IDs, unknown probes, extra fields, unsafe paths, and invalid severity', () => {
  const duplicate = clone(REGISTRY); duplicate.claims[1].id = duplicate.claims[0].id; rejects(duplicate, 'duplicated');
  const unknown = clone(REGISTRY); unknown.claims[0].probe = 'shell-command'; rejects(unknown, 'unknown');
  const extra = clone(REGISTRY); extra.claims[0].command = 'npm test'; rejects(extra, 'malformed');
  const traversal = clone(REGISTRY); traversal.claims[0].document = '../README.md'; rejects(traversal, 'unsafe');
  const severity = clone(REGISTRY); severity.claims[0].severity = 'low'; rejects(severity, 'severity');
});

test('release-version probe fails a package authority mismatch', () => {
  const root = fixture();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); pkg.version = '9.9.0';
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg), 'utf8');
  assert(!executeClaimProbe('release-version', root).passed, 'version mismatch passed');
});

test('provider probe fails an omitted capability and shared-skill drift', () => {
  const root = fixture();
  fs.rmSync(path.join(root, 'providers', 'copilot', 'agentic-feature-kit', '.github', 'skills', 'workflow-orchestrator', 'SKILL.md'));
  assert(!executeClaimProbe('provider-capabilities', root).passed, 'omitted capability passed');
  const root2 = fixture();
  fs.appendFileSync(path.join(root2, 'providers', 'claude', 'agentic-feature-kit', 'skills', 'project-intelligence', 'SKILL.md'), '\ndrift\n');
  assert(!executeClaimProbe('provider-capabilities', root2).passed, 'shared-skill drift passed');
});

test('generated-output diff gate detects missing, extra, content, and line-ending drift', () => {
  const a = fs.mkdtempSync(path.join(scratch, 'generated-a-'));
  const b = fs.mkdtempSync(path.join(scratch, 'generated-b-'));
  fs.writeFileSync(path.join(a, 'one.md'), 'alpha\nbeta\n');
  fs.writeFileSync(path.join(b, 'one.md'), 'alpha\nbeta\n');
  assert(hashFileTree(a) === hashFileTree(b), 'identical trees differ');
  fs.writeFileSync(path.join(b, 'one.md'), 'alpha\r\nbeta\r\n');
  assert(hashFileTree(a) !== hashFileTree(b), 'line-ending drift passed');
  fs.writeFileSync(path.join(b, 'one.md'), 'changed');
  assert(hashFileTree(a) !== hashFileTree(b), 'content drift passed');
  fs.writeFileSync(path.join(b, 'extra.md'), 'extra');
  assert(hashFileTree(a) !== hashFileTree(b), 'extra file passed');
  fs.rmSync(path.join(b, 'one.md'));
  assert(hashFileTree(a) !== hashFileTree(b), 'missing file passed');
});

test('missing, duplicated, and stale documentation anchors fail their claims', () => {
  for (const mode of ['missing', 'duplicate', 'stale'] as const) {
    const root = fixture();
    const readmePath = path.join(root, 'README.md');
    const anchor = 'Real sync is fail-closed:';
    const content = fs.readFileSync(readmePath, 'utf8');
    if (mode === 'missing') fs.writeFileSync(readmePath, content.replace(anchor, 'Sync guard:'), 'utf8');
    if (mode === 'duplicate') fs.writeFileSync(readmePath, `${content}\n${anchor}\n`, 'utf8');
    const registry = clone(REGISTRY);
    if (mode === 'stale') registry.claims.find((claim: any) => claim.id === 'sync-is-fail-closed').anchor = 'stale wording';
    const result = auditRuntimeClaims(registry, root);
    assert(result.claims.find((claim) => claim.id === 'sync-is-fail-closed')?.status === 'fail', `${mode} anchor passed`);
  }
});

test('result validator rejects forged hash, unsorted evidence, and contradictory summary', () => {
  const valid = auditRuntimeClaims(REGISTRY, ROOT);
  const hash = clone(valid); hash.contentHash = '0'.repeat(64); assert(!validateClaimAuditResult(hash), 'forged hash passed');
  const unsorted = clone(valid); unsorted.claims[0].evidence.reverse(); assert(!validateClaimAuditResult(unsorted), 'unsorted evidence passed');
  const summary = clone(valid); summary.status = 'fail'; assert(!validateClaimAuditResult(summary), 'contradictory summary passed');
});

try {
  console.log(`claim-runtime-audit: ${passed} assertions passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
