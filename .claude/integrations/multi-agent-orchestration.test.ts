/** Offline attack suite for the P2 pure multi-agent orchestration foundation. */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBundle } from './evidence-bundle';
import {
  claimLease,
  createP1EvidenceBundleVerifier,
  recommendRecovery,
  recoverExpiredLeases,
  OrchestrationValidationError,
  validateRoleDag,
  verifyAgentHandoff,
  verifyFinalMerge,
  type AgentHandoff,
  type EvidenceVerifier,
  type LeaseLedger,
  type RoleDag,
} from './multi-agent-orchestration';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed += 1; console.log(`✅ ${name}`); }
  catch (error) { failed += 1; console.error(`❌ ${name}\n${(error as Error).stack ?? error}`); }
}

const CONTRACT = 'a'.repeat(64);
const EMPTY_LEDGER: LeaseLedger = { active: {} };
const ALWAYS_VALID: EvidenceVerifier = { verify: () => ({ valid: true }) };

function dag(tasks: RoleDag['tasks'] = [{ id: 'design', role: 'design', dependsOn: [], evidencePhase: 'B1', contextBudgetTokens: 100, timeoutMs: 1_000 }]): RoleDag {
  return { contractHash: CONTRACT, tasks };
}

function leaseFor(plan: RoleDag, taskId = 'design', nowMs = 100): LeaseLedger {
  const claim = claimLease(plan, [], EMPTY_LEDGER, { leaseId: `${taskId}-lease`, taskId, ownerId: `${taskId}-agent`, nowMs, ttlMs: 100 });
  assert.equal(claim.accepted, true);
  return claim.ledger;
}

function handoff(overrides: Partial<AgentHandoff> = {}): AgentHandoff {
  return {
    taskId: 'design', role: 'design', agentId: 'design-agent', leaseId: 'design-lease',
    featureName: 'Feature', phase: 'B1', contractHash: CONTRACT, contextTokens: 50,
    passClaim: true, requireBackendBinding: false, ...overrides,
  };
}

async function main() {
  await test('forged pass claim without a valid P1 evidence bundle is rejected before merge gate', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-forged-'));
    const plan = dag();
    const ledger = leaseFor(plan);
    const verifier = createP1EvidenceBundleVerifier(root);
    const decision = verifyAgentHandoff(plan, ledger, handoff(), 150, verifier, 'Feature');
    assert.deepEqual(decision, { accepted: false, reason: 'evidence-invalid' });
    let gateCalls = 0;
    const merge = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: verifier, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(merge.reason, 'handoff-rejected');
    assert.equal(gateCalls, 0);
  });

  await test('a valid actual P1 bundle is accepted, while duplicate and expired leases fail closed with recovery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-p1-'));
    buildBundle({ featureName: 'Feature', phase: 'B1', cwd: root, transcripts: { result: 'evidence-only handoff' } });
    const plan = dag();
    const first = claimLease(plan, [], EMPTY_LEDGER, { leaseId: 'design-lease', taskId: 'design', ownerId: 'design-agent', nowMs: 100, ttlMs: 100 });
    assert.equal(first.accepted, true);
    const duplicate = claimLease(plan, [], first.ledger, { leaseId: 'other-lease', taskId: 'design', ownerId: 'other-agent', nowMs: 150, ttlMs: 100 });
    assert.equal(duplicate.reason, 'already-leased');
    assert.deepEqual(verifyAgentHandoff(plan, first.ledger, handoff(), 150, createP1EvidenceBundleVerifier(root), 'Feature'), { accepted: true });
    assert.deepEqual(verifyAgentHandoff(plan, first.ledger, handoff(), 200, createP1EvidenceBundleVerifier(root), 'Feature'), { accepted: false, reason: 'lease-expired', recovery: 'reclaim-and-retry' });
    const recovery = recommendRecovery(plan, [], first.ledger, 200);
    assert.equal(recovery.action, 'reclaim-expired-lease');
    assert.deepEqual(recovery.taskIds, ['design']);
    const afterRecovery = claimLease(plan, [], recovery.ledger, { leaseId: 'retry-lease', taskId: 'design', ownerId: 'retry-agent', nowMs: 200, ttlMs: 100 });
    assert.equal(afterRecovery.accepted, true);
  });

  await test('cycles are rejected before launch and timeout recovery is deterministic', () => {
    assert.throws(() => validateRoleDag(dag([
      { id: 'design', role: 'design', dependsOn: ['ui'], evidencePhase: 'B1', contextBudgetTokens: 10, timeoutMs: 10 },
      { id: 'ui', role: 'ui', dependsOn: ['design'], evidencePhase: 'B2', contextBudgetTokens: 10, timeoutMs: 10 },
    ])), /cycle/);
    const plan = dag();
    const ledger = leaseFor(plan);
    assert.deepEqual(recommendRecovery(plan, [], ledger, 150).action, 'await-active-lease');
    assert.deepEqual(recommendRecovery(plan, [], ledger, 200).action, 'reclaim-expired-lease');
  });

  await test('runtime-malformed lease ledgers and completion claims fail closed before scheduling or handoff verification', () => {
    const plan = dag();
    const malformed = { active: { design: { leaseId: 'same', taskId: 'other-task', ownerId: 'agent', issuedAtMs: 1, expiresAtMs: 2 } } } as unknown as LeaseLedger;
    assert.throws(() => recoverExpiredLeases(plan, malformed, 1), OrchestrationValidationError);
    assert.throws(() => claimLease(plan, ['design', 'design'], EMPTY_LEDGER, { leaseId: 'x', taskId: 'design', ownerId: 'agent', nowMs: 1, ttlMs: 1 }), OrchestrationValidationError);
    assert.throws(() => claimLease(plan, ['unknown'], EMPTY_LEDGER, { leaseId: 'x', taskId: 'design', ownerId: 'agent', nowMs: 1, ttlMs: 1 }), OrchestrationValidationError);
    assert.throws(() => verifyAgentHandoff(plan, malformed, handoff(), 1, ALWAYS_VALID, 'Feature'), OrchestrationValidationError);
    const short = dag([{ id: 'design', role: 'design', dependsOn: [], evidencePhase: 'B1', contextBudgetTokens: 10, timeoutMs: 10 }]);
    const forgedLongLease = { active: { design: { leaseId: 'forged', taskId: 'design', ownerId: 'agent', issuedAtMs: 1, expiresAtMs: 12 } } };
    assert.throws(() => recoverExpiredLeases(short, forgedLongLease, 1), OrchestrationValidationError);
  });

  await test('lease TTL exceeding the task timeout or overflowing expiry is refused with explicit reasons', () => {
    const short = dag([{ id: 'design', role: 'design', dependsOn: [], evidencePhase: 'B1', contextBudgetTokens: 10, timeoutMs: 10 }]);
    assert.equal(claimLease(short, [], EMPTY_LEDGER, { leaseId: 'long', taskId: 'design', ownerId: 'agent', nowMs: 1, ttlMs: 11 }).reason, 'ttl-exceeds-task-timeout');
    assert.equal(claimLease(short, [], EMPTY_LEDGER, { leaseId: 'overflow', taskId: 'design', ownerId: 'agent', nowMs: Number.MAX_SAFE_INTEGER, ttlMs: 1 }).reason, 'lease-expiry-overflow');
  });

  await test('context starvation degrades to summarize-and-retry instead of silently accepting a partial handoff', () => {
    const plan = dag();
    const decision = verifyAgentHandoff(plan, leaseFor(plan), handoff({ contextTokens: 101 }), 150, ALWAYS_VALID, 'Feature');
    assert.deepEqual(decision, { accepted: false, reason: 'context-starved', recovery: 'summarize-and-retry' });
  });

  await test('cross-agent contract drift is rejected at merge before the final gate', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    const drift = handoff({ contractHash: 'b'.repeat(64) });
    assert.equal(verifyAgentHandoff(plan, ledger, drift, 150, ALWAYS_VALID, 'Feature').reason, 'contract-drift');
    let gateCalls = 0;
    const merge = await verifyFinalMerge({ dag: plan, ledger, handoffs: [drift], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(merge.reason, 'handoff-rejected');
    assert.equal(gateCalls, 0);
  });

  await test('missing or malformed backend-binding claim never reaches a generic verifier or final gate', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    let verifierCalls = 0;
    const verifier: EvidenceVerifier = { verify: () => { verifierCalls += 1; return { valid: true }; } };
    const omitted = handoff({ requireBackendBinding: undefined as unknown as boolean });
    assert.deepEqual(verifyAgentHandoff(plan, ledger, omitted, 150, verifier, 'Feature'), { accepted: false, reason: 'malformed-handoff' });
    assert.equal(verifierCalls, 0);
    let gateCalls = 0;
    const merge = await verifyFinalMerge({ dag: plan, ledger, handoffs: [omitted], nowMs: 150, evidenceVerifier: verifier, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(merge.reason, 'handoff-rejected');
    assert.equal(verifierCalls, 0);
    assert.equal(gateCalls, 0);
  });

  await test('an injected evidence verifier throw fails closed and never reaches the final gate', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    const throwing: EvidenceVerifier = { verify: () => { throw new Error('fixture verifier failure'); } };
    assert.deepEqual(verifyAgentHandoff(plan, ledger, handoff(), 150, throwing, 'Feature'), { accepted: false, reason: 'evidence-invalid' });
    let gateCalls = 0;
    const merge = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: throwing, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(merge.reason, 'handoff-rejected');
    assert.equal(gateCalls, 0);
  });

  await test('malformed handoff collections fail closed before any final gate invocation', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    let gateCalls = 0;
    const result = await verifyFinalMerge({ dag: plan, ledger, handoffs: { not: 'an array' } as unknown as AgentHandoff[], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(result.reason, 'handoffs-malformed');
    assert.equal(gateCalls, 0);
    const nullMember = await verifyFinalMerge({ dag: plan, ledger, handoffs: [null as unknown as AgentHandoff], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { gateCalls += 1; return { passed: true, detail: 'must not run' }; } });
    assert.equal(nullMember.reason, 'handoffs-malformed');
    assert.equal(gateCalls, 0);
  });

  await test('malformed merged output or final gate boundaries are refused before invocation', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    const nonText = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 42 as unknown as string, finalGate: async () => ({ passed: true, detail: 'must not run' }) });
    assert.equal(nonText.reason, 'merge-input-malformed');
    const nonFunction = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: null as unknown as (output: string) => Promise<{ passed: boolean; detail: string }> });
    assert.equal(nonFunction.reason, 'merge-input-malformed');
  });

  await test('truthy, missing-detail, or unexpected gate verdict shapes cannot pass', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    const malformedGates = [
      async () => ({ passed: 'yes', detail: 'truthy is not boolean' } as unknown as { passed: boolean; detail: string }),
      async () => ({ passed: true } as unknown as { passed: boolean; detail: string }),
      async () => ({ passed: true, detail: 'valid-looking but extra', bypass: true } as unknown as { passed: boolean; detail: string }),
    ];
    for (const finalGate of malformedGates) {
      const result = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate });
      assert.equal(result.passed, false);
      assert.equal(result.reason, 'gate-malformed');
    }
  });

  await test('a throwing final gate returns a fail-closed gate-error instead of crashing orchestration', async () => {
    const plan = dag();
    const ledger = leaseFor(plan);
    const result = await verifyFinalMerge({ dag: plan, ledger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'approved', finalGate: async () => { throw new Error('fixture gate failure'); } });
    assert.deepEqual(result, { passed: false, reason: 'gate-error' });
  });

  await test('the exact same final gate rejects plausible wrong merged output regardless of agent count', async () => {
    const single = dag();
    const singleLedger = leaseFor(single);
    const parallel = dag([
      { id: 'dev', role: 'dev', dependsOn: [], evidencePhase: 'B1', contextBudgetTokens: 100, timeoutMs: 1_000 },
      { id: 'ui', role: 'ui', dependsOn: [], evidencePhase: 'B2', contextBudgetTokens: 100, timeoutMs: 1_000 },
    ]);
    const devLease = claimLease(parallel, [], EMPTY_LEDGER, { leaseId: 'dev-lease', taskId: 'dev', ownerId: 'dev-agent', nowMs: 100, ttlMs: 100 });
    const uiLease = claimLease(parallel, [], devLease.ledger, { leaseId: 'ui-lease', taskId: 'ui', ownerId: 'ui-agent', nowMs: 100, ttlMs: 100 });
    const sameGate = async (output: string) => ({ passed: output === 'exact-pass', detail: 'same deterministic gate' });
    const one = await verifyFinalMerge({ dag: single, ledger: singleLedger, handoffs: [handoff()], nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'plausible but wrong', finalGate: sameGate });
    const two = await verifyFinalMerge({
      dag: parallel, ledger: uiLease.ledger, nowMs: 150, evidenceVerifier: ALWAYS_VALID, expectedFeatureName: 'Feature', mergedOutput: 'plausible but wrong', finalGate: sameGate,
      handoffs: [
        handoff({ taskId: 'dev', role: 'dev', agentId: 'dev-agent', leaseId: 'dev-lease', phase: 'B1' }),
        handoff({ taskId: 'ui', role: 'ui', agentId: 'ui-agent', leaseId: 'ui-lease', phase: 'B2' }),
      ],
    });
    assert.equal(one.reason, 'gate-failed');
    assert.equal(two.reason, 'gate-failed');
    assert.equal(one.gate?.detail, two.gate?.detail);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
