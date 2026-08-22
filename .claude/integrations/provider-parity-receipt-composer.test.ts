import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  PROVIDER_PARITY_ARTIFACT_CLASSES,
  PROVIDER_PARITY_PHASE_IDS,
  PROVIDER_PARITY_PROVIDERS,
  assertProviderParityCandidateReceipt,
  evaluateProviderParity,
  hashProviderParityReceipt,
  type ProviderParityCandidateReceipt,
  type ProviderParityGoldenIdentity,
} from '../../packages/core/src/provider-parity-evaluator';
import {
  PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA,
  PROVIDER_PARITY_ATTESTATION_ARTIFACTS,
  PROVIDER_PARITY_ATTESTATION_PHASES,
  createProviderParityEvidenceAttestation,
  createProviderParityPolicyAttestation,
  hashProviderParityAttestationValue,
  type ProviderParityEvidenceAttestationInput,
  type ProviderParityPolicyAttestationInput,
} from './provider-parity-attestation';
import {
  ProviderParityReceiptCompositionError,
  composeProviderParityA2Receipt,
} from './provider-parity-receipt-composer';

const fixtureSha256 = '64000b8e960e22138e15462f24f6eca69f2a436f13be4c3d7aa66b87c8ab21db';
const semanticSpecSha256 = '206ae7026488f0d1ea9cfd90d392bb946ebc6726ebf1adbd6936157486d19830';
const taskPromptSha256 = '07b1eb213bba17b07c38d76019bd0265948d72b939350387f93d1caca5c9509c';
const seedTreeSha256 = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const initialMaterializedTreeSha256 = 'fe'.repeat(32);
const candidateTreeSha256 = '14'.repeat(32);
const testCommandSha256 = hashProviderParityAttestationValue(['node', '--test', 'test/report.test.js']);

function hash(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(32);
}

function policyInput(): ProviderParityPolicyAttestationInput {
  return {
    schemaVersion: '1.0.0', provider: 'claude', runId: 'run-a3b3b-001',
    executionPolicySha256: hash(1), adapterCapabilitySha256: hash(2),
    runtimeEntitlementEvidenceSha256: hash(3), authorizationReceiptSha256: hash(4),
    environment: { mode: 'explicit-allowlist-v1', evidenceSha256: hash(5) },
    filesystem: { mode: 'isolated-root-only-v1', evidenceSha256: hash(6) },
    network: { mode: 'provider-control-only-v1', evidenceSha256: hash(7) },
    settings: { mode: 'isolated-empty-v1', evidenceSha256: hash(8) },
    managedPolicy: { mode: 'absent-v1', evidenceSha256: hash(9) },
    hooks: { mode: 'disabled-v1', evidenceSha256: hash(10) },
    issuedAt: '2026-08-22T00:00:00.000Z', expiresAt: '2026-08-22T01:00:00.000Z',
  };
}

function candidateReceipt(): Record<string, unknown> {
  const partial = {
    state: 'passed', fixtureId: 'p17-007-provider-parity-golden', fixtureRevision: 1,
    candidateTreeSha256, preTestTreeSha256: candidateTreeSha256,
    postTestTreeSha256: candidateTreeSha256, candidateStateSha256: hash(21),
    pathInventorySha256: hash(22), lockedPathEvidenceSha256: hash(23),
    allowedPathEvidenceSha256: hash(24), testCommandSha256, fileCount: 7, totalBytes: 4096,
    permissionRule: 'windows-node-kind-v1', processCallCount: 1, mutationDetected: false,
    violations: {
      lockedPathEdit: false, undeclaredPath: false, externalDependency: false,
      secretOrPathDisclosure: false, permissionWidening: false,
    },
    reasonCodes: [],
    trustedTest: {
      status: 'passed', exitCode: 0, timedOut: false, outputCapped: false, signaled: false,
      stderrPresent: false, processFailure: false, outputBytes: 128, durationMs: 12.5,
      evidenceSha256: hash(25),
    },
  };
  return { ...partial, verificationEvidenceSha256: hashProviderParityAttestationValue(partial) };
}

function evidenceInput(): ProviderParityEvidenceAttestationInput {
  return {
    schemaVersion: '1.0.0',
    policyAttestation: createProviderParityPolicyAttestation(policyInput()),
    identity: {
      provider: 'claude', runId: 'run-a3b3b-001', fixtureId: 'p17-007-provider-parity-golden',
      fixtureRevision: 1, fixtureSha256, semanticSpecSha256, taskPromptSha256, seedTreeSha256,
      phaseBindings: PROVIDER_PARITY_ATTESTATION_PHASES.map((entry) => ({ ...entry })),
      runnerId: 'claude-cli-node-v1', cliVersion: '2.1.227', modelId: 'claude-sonnet-4-6',
      reasoningEffort: 'high', sourceCommit: 'a'.repeat(40),
      startedAt: '2026-08-22T00:10:00.000Z', completedAt: '2026-08-22T00:20:00.000Z',
      observedAt: '2026-08-22T00:20:00.000Z', timeoutMs: 1_200_000,
      maxCapturedOutputBytes: 16_777_216, attemptOrdinal: 1,
      materializedTreeSha256: initialMaterializedTreeSha256,
    },
    acceptanceCriteria: PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA.map((id, index) => ({
      id, satisfied: true, evidenceSha256: hash(40 + index),
    })),
    artifacts: PROVIDER_PARITY_ATTESTATION_ARTIFACTS.map((id, index) => ({
      id, satisfied: true, evidenceSha256: hash(50 + index),
    })),
    gates: PROVIDER_PARITY_ATTESTATION_PHASES.map((entry, index) => ({
      ...entry, conserved: true, evidenceSha256: hash(60 + index),
    })),
    apiContract: { conserved: true, evidenceSha256: hash(70) },
    candidateVerification: candidateReceipt(),
    cleanup: {
      state: 'cleaned', fixtureId: 'p17-007-provider-parity-golden', fixtureRevision: 1,
      materializedTreeSha256: initialMaterializedTreeSha256, removedNodeCount: 9, zeroResidue: true,
    },
    metrics: {
      durationMs: 600_000, durationSource: 'trusted-runner',
      inputTokens: null, outputTokens: null, cacheTokens: null, tokenSource: 'unavailable',
      pricingStatus: 'unpriced', priceBasisSha256: null, costUsd: null, costSource: 'unavailable',
    },
  };
}

function golden(): ProviderParityGoldenIdentity {
  return {
    fixtureId: 'p17-007-provider-parity-golden', fixtureRevision: 1, fixtureSha256,
    semanticSpecSha256, taskPromptSha256, seedTreeSha256,
    providers: [...PROVIDER_PARITY_PROVIDERS], acceptanceCriterionIds: ['AC-1', 'AC-2', 'AC-3'],
    requiredArtifactClasses: [...PROVIDER_PARITY_ARTIFACT_CLASSES],
    phaseBindings: PROVIDER_PARITY_ATTESTATION_PHASES.map((entry) => ({
      phaseId: entry.phaseId, phaseContractSha256: entry.phaseContractSha256,
    })),
    policy: {
      minimumSemanticRunsPerProvider: 1, minimumPerformanceRunsPerProvider: 5,
      maxRunDurationMs: 1_200_000, maxCapturedOutputBytes: 16_777_216,
      attemptsPerRun: 1, rankingWhenIncomplete: 'forbidden',
    },
  };
}

function expectCode(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) =>
    error instanceof ProviderParityReceiptCompositionError && error.code === code);
}

let assertions = 0;
const check = (condition: unknown, message?: string): void => { assertions += 1; assert.ok(condition, message); };

const attestation = createProviderParityEvidenceAttestation(evidenceInput());
const receipt = composeProviderParityA2Receipt(attestation);
assertProviderParityCandidateReceipt(structuredClone(receipt)); assertions += 1;
check(receipt.schemaVersion === '1.0.0' && receipt.runId === attestation.identity.runId);
check(receipt.provider === 'claude' && receipt.execution.state === 'completed' && receipt.execution.reasonCodes.length === 0);
check(receipt.identity.materializedTreeSha256 === candidateTreeSha256);
check(receipt.identity.materializedTreeSha256 !== attestation.identity.materializedTreeSha256);
check(receipt.identity.adapterCapabilitySha256 === attestation.policyAttestation.adapterCapabilitySha256);
check(receipt.identity.runtimeEntitlementEvidenceSha256 === attestation.policyAttestation.runtimeEntitlementEvidenceSha256);
check(receipt.identity.executionPolicySha256 === attestation.policyAttestation.executionPolicySha256);
check(receipt.identity.authorizationReceiptSha256 === attestation.policyAttestation.authorizationReceiptSha256);
check(JSON.stringify(receipt.evidence.acceptanceCriteria.map((entry) => entry.evidenceSha256)) ===
  JSON.stringify(attestation.acceptanceCriteria.map((entry) => entry.evidenceSha256)));
check(JSON.stringify(receipt.evidence.artifacts.map((entry) => entry.artifactClass)) ===
  JSON.stringify(PROVIDER_PARITY_ARTIFACT_CLASSES));
check(JSON.stringify(receipt.evidence.gates.map((entry) => entry.phaseId)) === JSON.stringify(PROVIDER_PARITY_PHASE_IDS));
check(receipt.evidence.trustedVerification?.evidenceSha256 === attestation.candidateVerification.trustedTest.evidenceSha256);
check(Object.values(receipt.evidence.violations ?? {}).every((entry) => entry === false));
check(receipt.metrics.durationMs === 600_000 && receipt.metrics.pricingStatus === 'unpriced' && receipt.metrics.costUsd === null);
const { receiptHash: _ignored, ...withoutHash } = receipt;
check(receipt.receiptHash === hashProviderParityReceipt(withoutHash));
check(Object.isFrozen(receipt) && Object.isFrozen(receipt.identity) && Object.isFrozen(receipt.identity.phaseBindings[0]));
check(JSON.stringify(receipt) === JSON.stringify(composeProviderParityA2Receipt(structuredClone(attestation))));
try { (receipt.identity as { modelId: string }).modelId = 'mutated'; } catch (error) { assert.ok(error instanceof TypeError); }
check(receipt.identity.modelId === 'claude-sonnet-4-6', 'frozen output must reject or ignore mutation');
const report = evaluateProviderParity({
  schemaVersion: '1.0.0', evaluationId: 'a3b3b-evaluation', mode: 'qualification',
  golden: golden(), receipts: [structuredClone(receipt)],
});
check(report.receiptEvaluations[0]?.status === 'passed' && report.receiptEvaluations[0]?.implementationTreeSha256 === candidateTreeSha256);

// Every false completion decision remains visible in A3B3A and is refused before A2 emission.
for (const mutate of [
  (value: any) => { value.acceptanceCriteria[0].satisfied = false; },
  (value: any) => { value.artifacts[0].satisfied = false; },
  (value: any) => { value.gates[0].conserved = false; },
  (value: any) => { value.apiContract.conserved = false; },
]) {
  const input = structuredClone(evidenceInput()) as any;
  mutate(input);
  expectCode('ineligible-attestation', () => composeProviderParityA2Receipt(createProviderParityEvidenceAttestation(input)));
  assertions += 1;
}
const failedCandidate = structuredClone(evidenceInput()) as any;
failedCandidate.candidateVerification.state = 'failed';
failedCandidate.candidateVerification.violations.lockedPathEdit = true;
failedCandidate.candidateVerification.reasonCodes = ['locked-path-edit'];
delete failedCandidate.candidateVerification.verificationEvidenceSha256;
failedCandidate.candidateVerification.verificationEvidenceSha256 = hashProviderParityAttestationValue(failedCandidate.candidateVerification);
expectCode('ineligible-attestation', () => composeProviderParityA2Receipt(createProviderParityEvidenceAttestation(failedCandidate))); assertions += 1;
const cleanupFailure = structuredClone(evidenceInput()) as any;
cleanupFailure.cleanup = {
  state: 'failed', fixtureId: 'p17-007-provider-parity-golden', fixtureRevision: 1,
  materializedTreeSha256: initialMaterializedTreeSha256, failureEvidenceSha256: hash(90),
};
expectCode('ineligible-attestation', () => composeProviderParityA2Receipt(createProviderParityEvidenceAttestation(cleanupFailure))); assertions += 1;

// Durable tamper and raw/private additions are normalized to one closed composition error.
for (const mutate of [
  (value: any) => { value.evidenceAttestationSha256 = hash(91); },
  (value: any) => { value.identity.runId = 'other-run'; },
  (value: any) => { value.rawTranscript = 'C:\\Users\\operator\\secret'; },
]) {
  const attacked = structuredClone(attestation) as any;
  mutate(attacked);
  expectCode('invalid-attestation', () => composeProviderParityA2Receipt(attacked));
  assertions += 1;
}
const contradictory = structuredClone(receipt) as ProviderParityCandidateReceipt;
contradictory.execution.reasonCodes.push('process_failed');
contradictory.receiptHash = hashProviderParityReceipt((({ receiptHash: _drop, ...rest }) => rest)(contradictory));
assert.throws(() => assertProviderParityCandidateReceipt(contradictory), /completed execution must have no reason codes/); assertions += 1;
check(!/rawPrompt|promptBody|transcript|localPath|sourceFile|credential|sessionId/i.test(JSON.stringify(receipt)));
check(!/policyAttestationSha256|evidenceAttestationSha256|durationSource|tokenSource|costSource/.test(JSON.stringify(receipt)));

// The production composer retains no hidden I/O, clock, process, or environment capability.
const source = fs.readFileSync(path.join(process.cwd(), '.claude', 'integrations', 'provider-parity-receipt-composer.ts'), 'utf8');
check(!/from ['"]node:(?:fs|child_process|http|https|net|tls|os|path|process|perf_hooks)['"]/.test(source));
check(!/process\.(?:env|cwd|argv)|Date\.now\(|performance\.now\(/.test(source));

const samples: number[] = [];
const rssBefore = process.memoryUsage().rss;
const wallStarted = performance.now();
for (let index = 0; index < 10_000; index += 1) {
  const started = performance.now();
  composeProviderParityA2Receipt(attestation);
  samples.push(performance.now() - started);
}
const wallMs = performance.now() - wallStarted;
const rssDelta = Math.max(0, process.memoryUsage().rss - rssBefore);
samples.sort((left, right) => left - right);
const p95 = samples[Math.floor(samples.length * 0.95)];
check(p95 < 50, `p95 ${p95.toFixed(3)} ms exceeded 50 ms`);
check(rssDelta < 64 * 1024 * 1024, `RSS delta ${rssDelta} exceeded 64 MiB`);

console.log(`provider-parity-receipt-composer.test: PASS (${assertions} assertions, 10,000 compositions, wall ${wallMs.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, RSS delta ${rssDelta} bytes)`);
