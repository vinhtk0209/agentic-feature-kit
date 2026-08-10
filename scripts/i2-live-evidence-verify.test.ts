import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  I2_LIVE_EVIDENCE_PATH,
  verifyI2LiveEvidence,
} from './i2-live-evidence-verify';

let passed = 0;
let failed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try { await run(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}`, error); }
}

const root = path.resolve(__dirname, '..');
const evidence = JSON.parse(fs.readFileSync(path.join(root, ...I2_LIVE_EVIDENCE_PATH.split('/')), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function copyEvidenceRepo(): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'i2-live-evidence-'));
  for (const relative of [
    I2_LIVE_EVIDENCE_PATH,
    'docs/specs/i2-codex-live-smoke/.evidence/B0',
    'docs/specs/i2-codex-live-completion/.evidence/B0',
  ]) {
    const from = path.join(root, ...relative.split('/'));
    const to = path.join(target, ...relative.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
  return target;
}

async function main(): Promise<void> {
  await test('live Codex bundle binds shared gate, immutable backend identity, tokens, and honest unpriced cost', async () => {
    const result = await verifyI2LiveEvidence(evidence, root);
    assert.equal(result.passed, true);
    assert.equal(result.commandRunId, 'c4a2d3ee-c49c-48a0-b7e7-7fb7d6b1619b');
    assert.equal(result.inputTokens, 16613);
    assert.equal(result.outputTokens, 11);
    assert.equal(result.pricingStatus, 'unpriced');
    assert.match(result.evidenceHash ?? '', /^[a-f0-9]{64}$/);
  });

  await test('plausible wrong output and duplicate/missing output occurrence fail closed', async () => {
    const wrong = clone(evidence); wrong.expectedOutput = 'PLAUSIBLE_BUT_WRONG';
    const duplicate = clone(evidence); duplicate.commandRun.exactOutputOccurrences = 2;
    const missing = clone(evidence); missing.commandRun.exactOutputOccurrences = 0;
    for (const attack of [wrong, duplicate, missing]) assert.equal((await verifyI2LiveEvidence(attack, root)).passed, false);
  });

  await test('runner, model, status, exit, and backend binding substitution fail closed', async () => {
    const runner = clone(evidence); runner.commandRun.runner = 'claude';
    const model = clone(evidence); model.commandRun.model = 'different-model';
    const status = clone(evidence); status.commandRun.status = 'running';
    const exit = clone(evidence); exit.commandRun.exitCode = 1;
    const binding = clone(evidence); binding.sourceBundle.bindingHash = 'b'.repeat(64);
    for (const attack of [runner, model, status, exit, binding]) assert.equal((await verifyI2LiveEvidence(attack, root)).passed, false);
  });

  await test('fabricated zero price, pricing snapshot, usage error, and malformed counts fail closed', async () => {
    const zero = clone(evidence); zero.tokenUsage.costEstUsd = 0;
    const snapshot = clone(evidence); snapshot.tokenUsage.pricingSnapshot = { source: 'invented' };
    const usageError = clone(evidence); usageError.tokenUsage.usageError = 'ignored-error';
    const cache = clone(evidence); cache.tokenUsage.cacheReadTokens = cache.tokenUsage.inputTokens + 1;
    const fractional = clone(evidence); fractional.tokenUsage.outputTokens = 1.5;
    for (const attack of [zero, snapshot, usageError, cache, fractional]) assert.equal((await verifyI2LiveEvidence(attack, root)).passed, false);
  });

  await test('cross-run, malformed timestamps, extra keys, and log hash forgery fail closed', async () => {
    const crossRun = clone(evidence); crossRun.tokenUsage.runId = '11111111-1111-4111-8111-111111111111';
    const timestamp = clone(evidence); timestamp.commandRun.endedAt = '2026-08-10T12:36:09.453+00:00';
    const extra = clone(evidence); extra.extra = true;
    const logHash = clone(evidence); logHash.commandRun.logTailSha256 = 'A'.repeat(64);
    for (const attack of [crossRun, timestamp, extra, logHash]) assert.equal((await verifyI2LiveEvidence(attack, root)).passed, false);
  });

  await test('tampered receipt or backend binding file invalidates the completion bundle', async () => {
    const receiptRepo = copyEvidenceRepo();
    fs.appendFileSync(path.join(receiptRepo, ...I2_LIVE_EVIDENCE_PATH.split('/')), '\n');
    assert.equal((await verifyI2LiveEvidence(evidence, receiptRepo)).passed, false);
    const bindingRepo = copyEvidenceRepo();
    const bindingPath = path.join(bindingRepo, 'docs', 'specs', 'i2-codex-live-completion', '.evidence', 'B0', 'backend-binding.json');
    const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
    binding.identity.modelId = 'forged-model';
    fs.writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
    assert.equal((await verifyI2LiveEvidence(evidence, bindingRepo)).passed, false);
  });

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
