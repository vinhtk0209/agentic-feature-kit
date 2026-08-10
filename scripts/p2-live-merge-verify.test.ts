import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { verifyP2LiveMergeEvidence } from './p2-live-merge-verify';

let passed = 0;
let failed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try { await run(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}`, error); }
}

const root = path.resolve(__dirname, '..');
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'evidence', 'p2-live-merge-2026-08-10.json'), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function main(): Promise<void> {
  await test('live four-role snapshot passes strict P1/I2 handoffs and the unchanged equality gate', async () => {
    const result = await verifyP2LiveMergeEvidence(evidence, root);
    assert.equal(result.passed, true);
    assert.equal(result.roleCount, 4);
    assert.equal(result.gate?.passed, true);
    assert.match(result.evidenceHash ?? '', /^[a-f0-9]{64}$/);
    assert.match(result.mergedOutputHash ?? '', /^[a-f0-9]{64}$/);
  });

  await test('missing/duplicate role and changed live output fail before a merge pass', async () => {
    const missing = clone(evidence); missing.roles.pop();
    const duplicate = clone(evidence); duplicate.roles[1].role = duplicate.roles[0].role;
    const changed = clone(evidence); changed.roles[2].agentMessage = 'PLAUSIBLE_BUT_WRONG';
    for (const attack of [missing, duplicate, changed]) {
      assert.equal((await verifyP2LiveMergeEvidence(attack, root)).passed, false);
    }
  });

  await test('a forged four-role consensus cannot replace the strict P1 transcript', async () => {
    const consensus = clone(evidence);
    consensus.expectedOutput = 'PLAUSIBLE_BUT_WRONG';
    for (const role of consensus.roles) role.agentMessage = consensus.expectedOutput;
    assert.equal((await verifyP2LiveMergeEvidence(consensus, root)).passed, false);
  });

  await test('forged log/token/run provenance fails closed', async () => {
    const badHash = clone(evidence); badHash.roles[0].logTailSha256 = 'A'.repeat(64);
    const badTokens = clone(evidence); badTokens.roles[0].cacheReadTokens = badTokens.roles[0].inputTokens + 1;
    const badStatus = clone(evidence); badStatus.roles[0].status = 'running';
    const extra = clone(evidence); extra.roles[0].extra = true;
    for (const attack of [badHash, badTokens, badStatus, extra]) {
      assert.equal((await verifyP2LiveMergeEvidence(attack, root)).passed, false);
    }
  });

  await test('forged P1 manifest or I2 binding identity cannot reach the gate', async () => {
    const manifest = clone(evidence); manifest.predecessor.manifestHash = 'b'.repeat(64);
    const binding = clone(evidence); binding.predecessor.bindingHash = 'c'.repeat(64);
    for (const attack of [manifest, binding]) {
      assert.equal((await verifyP2LiveMergeEvidence(attack, root)).passed, false);
    }
  });

  await test('extra top-level fields and malformed scalar identities fail closed', async () => {
    const extra = clone(evidence); extra.extra = true;
    const run = clone(evidence); run.runId = '';
    const plan = clone(evidence); plan.planHash = 'not-a-hash';
    for (const attack of [extra, run, plan]) {
      assert.equal((await verifyP2LiveMergeEvidence(attack, root)).passed, false);
    }
  });

  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
