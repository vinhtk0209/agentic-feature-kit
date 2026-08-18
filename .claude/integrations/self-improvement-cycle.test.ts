import {
  admitCycle,
  buildCycle,
  emptyRegistry,
  verifyRegistry,
  type CycleInput,
  type SelfImprovementRegistry,
} from './self-improvement-cycle';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.log(`❌ ${name}\n   ${error instanceof Error ? error.message : String(error)}`); }
};
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const mustThrow = (fn: () => void, pattern: RegExp) => {
  let message = '';
  try { fn(); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert(pattern.test(message), `expected ${pattern}, got ${message || 'no error'}`);
};
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const runCli = (registryPath: string) => {
  const cli = path.join(process.cwd(), '.claude', 'integrations', 'self-improvement-cycle.ts');
  if (process.platform === 'win32') {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    return spawnSync(`npx tsx ${quote(cli)} verify ${quote(registryPath)}`, { encoding: 'utf8', shell: true });
  }
  return spawnSync(path.join(process.cwd(), 'node_modules', '.bin', 'tsx'), [cli, 'verify', registryPath], { encoding: 'utf8' });
};
const rows = [
  {
    runnerRunId: 'run-before-001', headSha: 'a'.repeat(40), feature: 'Feature-A', taskType: 'BASELINE', phase: 'B11', kitVersion: '3.25.0',
    tierAExit: 1, tierBExit: 1, verified: false, contentHash: 'b'.repeat(64), recordedAt: '2026-08-12T10:00:00.000Z',
  },
  {
    runnerRunId: 'run-after-001', headSha: 'a'.repeat(40), feature: 'Feature-A', taskType: 'BASELINE', phase: 'B11', kitVersion: '3.25.0',
    tierAExit: 0, tierBExit: 0, verified: true, contentHash: 'b'.repeat(64), recordedAt: '2026-08-12T11:00:00.000Z',
  },
] as const;
const canonicalRows = JSON.stringify(rows.map((row) => ({ ...row })));
const input = (): CycleInput => ({
  lesson: {
    id: 'L-2026-08-12-001', title: 'Preserve one-shot B11 evidence', classification: 'automated_gate', rootCause: 'workflow_design_flaw',
    phase: 'B11', taskType: 'BASELINE', kitVersion: '3.25.0', generatedFromRunId: 'run-before-001',
    enforcedBy: ['playwright-runner.test.ts:one-shot-state'], liveValidated: true, observedAt: '2026-08-12T11:30:00.000Z',
  },
  provenance: {
    projectRef: 'abcdefghijklmnopqrst', snapshotSha256: sha(canonicalRows), verifiedGitNoteSha256: 'c'.repeat(64),
    sourceArtifacts: [{ ref: 'capture@abc:docs/evidence/b11.md', sha256: 'd'.repeat(64) }, { ref: 'capture@abc:docs/evidence/b12.md', sha256: 'e'.repeat(64) }],
    rows: JSON.parse(JSON.stringify(rows)),
  },
});

test('honest N failure → N+1 pass is admitted as a verified cycle with machine metric', () => {
  const registry = admitCycle(emptyRegistry(), input());
  assert(verifyRegistry(registry), 'registry must verify');
  assert(registry.cycles[0].status === 'verified', 'cycle must be verified');
  assert(registry.cycles[0].metric.before === 0 && registry.cycles[0].metric.after === 1 && registry.cycles[0].metric.delta === 1, 'wrong metric');
  assert(registry.cycles[0].rollbackRequired === false, 'improvement must not roll back');
});

test('fake lesson without live provenance is rejected before admission', () => {
  const candidate = input() as unknown as { lesson: Record<string, unknown> } & Omit<CycleInput, 'lesson'>;
  candidate.lesson = { ...candidate.lesson, liveValidated: false };
  mustThrow(() => admitCycle(emptyRegistry(), candidate), /unproven or malformed/);
});

test('forged verified flag inconsistent with tier exits is rejected', () => {
  const candidate = input();
  candidate.provenance.rows[0].verified = true;
  mustThrow(() => admitCycle(emptyRegistry(), candidate), /does not match computed tier exits/);
});

test('snapshot mutation and missing artifact evidence fail closed', () => {
  const tampered = input();
  tampered.provenance.rows[0].recordedAt = '2026-08-12T09:59:59.000Z';
  mustThrow(() => admitCycle(emptyRegistry(), tampered), /snapshot hash mismatch/);
  const missing = input();
  missing.provenance.sourceArtifacts = [];
  mustThrow(() => admitCycle(emptyRegistry(), missing), /provenance schema is malformed/);
});

test('harmful N→N+1 regression is auto-flagged rolled_back and never verified', () => {
  const harmful = input();
  harmful.provenance.rows[0].tierAExit = 0; harmful.provenance.rows[0].tierBExit = 0; harmful.provenance.rows[0].verified = true;
  harmful.provenance.rows[1].tierAExit = 1; harmful.provenance.rows[1].tierBExit = 1; harmful.provenance.rows[1].verified = false;
  harmful.provenance.snapshotSha256 = sha(JSON.stringify(harmful.provenance.rows));
  const cycle = buildCycle(harmful, null);
  assert(cycle.status === 'rolled_back' && cycle.rollbackRequired, 'harmful lesson must roll back');
  assert(cycle.metric.delta === -1, 'harmful metric must be negative');
});

test('registry tamper breaks the hash chain', () => {
  const registry = admitCycle(emptyRegistry(), input());
  const tampered = JSON.parse(JSON.stringify(registry)) as SelfImprovementRegistry;
  tampered.cycles[0].lesson.title = 'tampered';
  assert(!verifyRegistry(tampered), 'tampered registry must fail');
  const forgedHash = JSON.parse(JSON.stringify(registry)) as SelfImprovementRegistry;
  forgedHash.registryHash = 'f'.repeat(64);
  assert(!verifyRegistry(forgedHash), 'forged registry hash must fail');
});

test('duplicate lesson id and duplicate evidence pair are rejected', () => {
  const registry = admitCycle(emptyRegistry(), input());
  mustThrow(() => admitCycle(registry, input()), /duplicate lesson id/);
  const second = input();
  second.lesson.id = 'L-2026-08-12-002';
  mustThrow(() => admitCycle(registry, second), /duplicate N→N\+1 evidence pair/);
});

test('exact schemas reject unknown fields and sensitive evidence paths', () => {
  const extra = input() as unknown as Record<string, unknown>;
  extra.unexpected = true;
  mustThrow(() => admitCycle(emptyRegistry(), extra), /cycle input schema is malformed/);
  const sensitive = input();
  sensitive.provenance.sourceArtifacts[0].ref = 'capture:.env.playwright';
  mustThrow(() => admitCycle(emptyRegistry(), sensitive), /sensitive path/);
});

test('canonical record-verify Tier A wiring retains checklist, ux-states, and hard gate arguments', () => {
  const prompt = fs.readFileSync('.claude/commands/feature-from-confluence.md', 'utf8');
  const capture = prompt.match(/--tierA-cmd "([^"]+)"/);
  assert(capture, 'canonical --tierA-cmd is missing');
  assert(capture![1].includes('--checklist docs/specs/<FeatureName>/checklist.md'), 'checklist binding is missing');
  assert(capture![1].includes('--ux-states docs/specs/<FeatureName>/ux-states.json'), 'ux-states binding is missing');
  assert(capture![1].includes('--min-verified 0.6 --gate'), 'hard gate binding is missing');
});

test('CLI verifies a generated synthetic registry without a private evidence dependency', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'self-improvement-cycle-cli-'));
  const registryPath = path.join(directory, 'synthetic-registry.json');
  try {
    const registry = admitCycle(emptyRegistry(), input());
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    const result = runCli(registryPath);
    assert(result.status === 0, `CLI exited ${result.status}: ${result.stderr}`);
    const output = JSON.parse(result.stdout) as { valid: boolean; cycles: number; registryHash: string };
    assert(output.valid === true && output.cycles === 1, 'CLI did not verify the synthetic cycle');
    assert(output.registryHash === registry.registryHash, 'CLI registry hash drifted');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
