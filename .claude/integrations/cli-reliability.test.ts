import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteTextFile, type AtomicFileOps } from './cli-reliability';

const ROOT = path.resolve(__dirname, '..', '..');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const FEEDBACK = path.join(__dirname, 'feedback-analyzer.ts');
const KPI = path.join(__dirname, 'kpi-report.ts');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'post17-cli-reliability-'));
let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void): void {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}\n  ${(error as Error).message}`); }
}

function run(script: string, args: string[], cwd = scratch) {
  return spawnSync(process.execPath, [TSX, script, ...args], {
    cwd, encoding: 'utf8', shell: false, timeout: 30_000,
  });
}

function write(name: string, value: string): string {
  const target = path.join(scratch, name);
  fs.writeFileSync(target, value, 'utf8');
  return target;
}

function parseError(stderr: string): Record<string, unknown> {
  const lines = stderr.trim().split(/\r?\n/).filter(Boolean);
  assert(lines.length === 1, `expected exactly one stderr line, got ${JSON.stringify(lines)}`);
  assert(lines[0].startsWith('@@CLI_ERROR@@'), `missing error sentinel: ${stderr}`);
  return JSON.parse(lines[0].slice('@@CLI_ERROR@@'.length));
}

const feedback = write('feedback.md', [
  '[2026-08-13T00:00:00.000Z] [FeatureA] [auto]',
  'reflection_final: 95% | recoveries: 0 | b11_a: pass | b11_b: pass',
  'b9_6: pass | peer_conflict: no | skipped: [none] | design_cycleback: no | gates_revised: [none]',
  'friction_score: 0 | friction_level: smooth | clarification_cycles: 0 | gate_revisions: 0 | manual_corrections: 0 | re_plans: 0 | impl_retries: 0 | verif_retries: 0 | prompt_version: v3.25',
].join('\n'));

const kpiRecord = {
  timestamp: '2026-08-13T00:00:00.000Z', featureName: 'FeatureA', promptVersion: 'v3.25',
  frictionScore: 0, frictionLevel: 'smooth', clarificationCycles: 0, gateRevisions: 0,
  recoveries: 0, manualCorrections: 0, rePlans: 0, implementationRetries: 0,
  verificationRetries: 0, b11_a: 'pass', b11_b: 'pass', b9_6: 'pass',
  reflectionFinal: 95, designCycleback: false, rootCauses: [], escapedDefects: 0,
};
const kpi = write('kpi.jsonl', `${JSON.stringify(kpiRecord)}\n`);

test('feedback CLI emits one valid JSON document for an explicit history file', () => {
  const result = run(FEEDBACK, ['--history-file', feedback]);
  assert(result.status === 0, `exit=${result.status}; stderr=${result.stderr}`);
  assert(JSON.parse(result.stdout).totalRuns === 1, `unexpected output: ${result.stdout}`);
});

test('feedback CLI classifies missing and malformed input without stdout', () => {
  const unreadable = path.join(scratch, 'input-directory');
  fs.mkdirSync(unreadable);
  for (const [args, code] of [
    [['--history-file', path.join(scratch, 'missing.md')], 'INPUT_NOT_FOUND'],
    [['--history-file', write('malformed-feedback.md', '[bad] [FeatureA] [auto]\ntruncated')], 'MALFORMED_INPUT'],
    [['--history-file', unreadable], 'INPUT_READ_FAILED'],
  ] as const) {
    const result = run(FEEDBACK, [...args]);
    assert(result.status === 2, `expected exit 2, got ${result.status}`);
    assert(result.stdout === '', `failure wrote stdout: ${result.stdout}`);
    assert(parseError(result.stderr).code === code, `expected ${code}: ${result.stderr}`);
  }
});

test('feedback CLI rejects unknown, duplicate, and value-less flags before analysis', () => {
  for (const args of [['--wat'], ['--summary', '--summary'], ['--history-file']]) {
    const result = run(FEEDBACK, args);
    assert(result.status === 2, `expected exit 2 for ${args.join(' ')}`);
    assert(parseError(result.stderr).code === 'ARGUMENT_ERROR', result.stderr);
  }
});

test('KPI CLI emits one valid JSON document and is side-effect-free when imported', () => {
  const result = run(KPI, ['--kpi-file', kpi, '--json']);
  assert(result.status === 0, `exit=${result.status}; stderr=${result.stderr}`);
  assert(JSON.parse(result.stdout).totalRuns === 1, result.stdout);
  const imported = spawnSync(process.execPath, [TSX, '-e', `import ${JSON.stringify(KPI)}`], {
    cwd: scratch, encoding: 'utf8', shell: false, timeout: 30_000,
  });
  assert(imported.status === 0 && imported.stdout === '' && imported.stderr === '', `import side effect: ${JSON.stringify(imported)}`);
});

test('KPI CLI rejects malformed JSON and ambiguous argv without committing output', () => {
  const bad = write('malformed-kpi.jsonl', '{bad json}\n');
  for (const args of [
    ['--kpi-file', bad, '--dashboard'],
    ['--kpi-file', kpi, '--json', '--json'],
    ['--kpi-file', kpi, '--last-n', '0'],
    ['--unknown'],
  ]) {
    const result = run(KPI, args);
    assert(result.status === 2, `expected exit 2 for ${args.join(' ')}; stderr=${result.stderr}`);
    const error = parseError(result.stderr);
    assert(['MALFORMED_INPUT', 'ARGUMENT_ERROR'].includes(String(error.code)), result.stderr);
  }
  assert(!fs.existsSync(path.join(scratch, 'docs', 'claude-commands', 'DASHBOARD.md')), 'invalid input committed a dashboard');
});

test('KPI dashboard success uses the public output location', () => {
  const result = run(KPI, ['--kpi-file', kpi, '--dashboard']);
  const dashboard = path.join(scratch, 'docs', 'claude-commands', 'DASHBOARD.md');
  assert(result.status === 0, `exit=${result.status}; stderr=${result.stderr}`);
  assert(fs.readFileSync(dashboard, 'utf8').includes('Workflow KPI Dashboard'), 'dashboard was not committed');
});

test('atomic replacement restores the previous report when final rename fails', () => {
  const target = write('previous-dashboard.md', 'PREVIOUS');
  const real = fs as unknown as AtomicFileOps;
  let renameCount = 0;
  const hostile: AtomicFileOps = {
    ...real,
    renameSync(from, to) {
      renameCount += 1;
      if (renameCount === 2) throw Object.assign(new Error('simulated permission failure'), { code: 'EACCES' });
      real.renameSync(from, to);
    },
  };
  let rejected = false;
  try { atomicWriteTextFile(target, 'NEW', hostile); } catch { rejected = true; }
  assert(rejected, 'simulated rename failure must reject');
  assert(fs.readFileSync(target, 'utf8') === 'PREVIOUS', 'previous report was not restored');
  assert(!fs.readdirSync(scratch).some((name) => name.includes('.previous-dashboard.md.')), 'staging/rollback debris remains');
});

try {
  console.log(`cli-reliability: ${passed} assertions passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
