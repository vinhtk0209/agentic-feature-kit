import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA,
  PROVIDER_PARITY_ATTESTATION_ARTIFACTS,
  PROVIDER_PARITY_ATTESTATION_PHASES,
  ProviderParityAttestationError,
  admitProviderParityEvidenceAttestation,
  admitProviderParityPolicyAttestation,
  createProviderParityEvidenceAttestation,
  createProviderParityPolicyAttestation,
  hashProviderParityAttestationValue,
  type ProviderParityEvidenceAttestationInput,
  type ProviderParityPolicyAttestationInput,
} from './provider-parity-attestation';

const fixtureSha256 = '64000b8e960e22138e15462f24f6eca69f2a436f13be4c3d7aa66b87c8ab21db';
const semanticSpecSha256 = '206ae7026488f0d1ea9cfd90d392bb946ebc6726ebf1adbd6936157486d19830';
const taskPromptSha256 = '07b1eb213bba17b07c38d76019bd0265948d72b939350387f93d1caca5c9509c';
const seedTreeSha256 = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const materializedTreeSha256 = 'fe'.repeat(32);
const testCommandSha256 = hashProviderParityAttestationValue(['node', '--test', 'test/report.test.js']);

function hash(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(32);
}

function policyInput(): ProviderParityPolicyAttestationInput {
  return {
    schemaVersion: '1.0.0',
    provider: 'claude',
    runId: 'run-a3b3a-001',
    executionPolicySha256: hash(1),
    adapterCapabilitySha256: hash(2),
    runtimeEntitlementEvidenceSha256: hash(3),
    authorizationReceiptSha256: hash(4),
    environment: { mode: 'explicit-allowlist-v1', evidenceSha256: hash(5) },
    filesystem: { mode: 'isolated-root-only-v1', evidenceSha256: hash(6) },
    network: { mode: 'provider-control-only-v1', evidenceSha256: hash(7) },
    settings: { mode: 'isolated-empty-v1', evidenceSha256: hash(8) },
    managedPolicy: { mode: 'absent-v1', evidenceSha256: hash(9) },
    hooks: { mode: 'disabled-v1', evidenceSha256: hash(10) },
    issuedAt: '2026-08-21T00:00:00.000Z',
    expiresAt: '2026-08-21T01:00:00.000Z',
  };
}

function candidateReceipt(): Record<string, unknown> {
  const partial = {
    state: 'passed',
    fixtureId: 'p17-007-provider-parity-golden',
    fixtureRevision: 1,
    candidateTreeSha256: hash(20),
    preTestTreeSha256: hash(20),
    postTestTreeSha256: hash(20),
    candidateStateSha256: hash(21),
    pathInventorySha256: hash(22),
    lockedPathEvidenceSha256: hash(23),
    allowedPathEvidenceSha256: hash(24),
    testCommandSha256,
    fileCount: 7,
    totalBytes: 4096,
    permissionRule: 'windows-node-kind-v1',
    processCallCount: 1,
    mutationDetected: false,
    violations: {
      lockedPathEdit: false,
      undeclaredPath: false,
      externalDependency: false,
      secretOrPathDisclosure: false,
      permissionWidening: false,
    },
    reasonCodes: [],
    trustedTest: {
      status: 'passed',
      exitCode: 0,
      timedOut: false,
      outputCapped: false,
      signaled: false,
      stderrPresent: false,
      processFailure: false,
      outputBytes: 128,
      durationMs: 12.5,
      evidenceSha256: hash(25),
    },
  };
  return { ...partial, verificationEvidenceSha256: hashProviderParityAttestationValue(partial) };
}

function evidenceInput(): ProviderParityEvidenceAttestationInput {
  const policy = createProviderParityPolicyAttestation(policyInput());
  return {
    schemaVersion: '1.0.0',
    policyAttestation: policy,
    identity: {
      provider: 'claude',
      runId: 'run-a3b3a-001',
      fixtureId: 'p17-007-provider-parity-golden',
      fixtureRevision: 1,
      fixtureSha256,
      semanticSpecSha256,
      taskPromptSha256,
      seedTreeSha256,
      phaseBindings: PROVIDER_PARITY_ATTESTATION_PHASES.map((entry) => ({ ...entry })),
      runnerId: 'claude-cli-node-v1',
      cliVersion: '2.1.227',
      modelId: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      sourceCommit: 'a'.repeat(40),
      startedAt: '2026-08-21T00:10:00.000Z',
      completedAt: '2026-08-21T00:20:00.000Z',
      observedAt: '2026-08-21T00:20:00.000Z',
      timeoutMs: 1_200_000,
      maxCapturedOutputBytes: 16_777_216,
      attemptOrdinal: 1,
      materializedTreeSha256,
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
      state: 'cleaned',
      fixtureId: 'p17-007-provider-parity-golden',
      fixtureRevision: 1,
      materializedTreeSha256,
      removedNodeCount: 9,
      zeroResidue: true,
    },
    metrics: {
      durationMs: 600_000,
      durationSource: 'trusted-runner',
      inputTokens: null,
      outputTokens: null,
      cacheTokens: null,
      tokenSource: 'unavailable',
      pricingStatus: 'unpriced',
      priceBasisSha256: null,
      costUsd: null,
      costSource: 'unavailable',
    },
  };
}

function expectCode(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ProviderParityAttestationError && error.code === code);
}

let assertions = 0;
const check = (condition: unknown, message?: string): void => { assertions += 1; assert.ok(condition, message); };

// Happy paths are deterministic, immutable, metadata-only, and do not mutate caller input.
const rawPolicy = policyInput();
const rawPolicySnapshot = structuredClone(rawPolicy);
const policy = createProviderParityPolicyAttestation(rawPolicy);
check(JSON.stringify(rawPolicy) === JSON.stringify(rawPolicySnapshot));
check(Object.isFrozen(policy) && Object.isFrozen(policy.environment) && Object.isFrozen(policy.hooks));
check(policy.policyAttestationSha256 === createProviderParityPolicyAttestation(structuredClone(rawPolicy)).policyAttestationSha256);
check(admitProviderParityPolicyAttestation(structuredClone(policy)).policyAttestationSha256 === policy.policyAttestationSha256);
const rawEvidence = evidenceInput();
const rawEvidenceSnapshot = structuredClone(rawEvidence);
const receipt = createProviderParityEvidenceAttestation(rawEvidence);
check(JSON.stringify(rawEvidence) === JSON.stringify(rawEvidenceSnapshot));
check(Object.isFrozen(receipt) && Object.isFrozen(receipt.identity) && Object.isFrozen(receipt.acceptanceCriteria));
check(receipt.eligibleForA2Composition === true && receipt.cleanupFailed === false);
check(receipt.evidenceAttestationSha256 === createProviderParityEvidenceAttestation(structuredClone(rawEvidence)).evidenceAttestationSha256);
check(receipt.policyAttestation.executionPolicySha256 === rawPolicy.executionPolicySha256);
check(receipt.candidateVerification.trustedTest.exitCode === 0 && receipt.candidateVerification.reasonCodes.length === 0);
check(admitProviderParityEvidenceAttestation(structuredClone(receipt)).evidenceAttestationSha256 === receipt.evidenceAttestationSha256);
check(!JSON.stringify(receipt).includes('docs/plan.md') && !JSON.stringify(receipt).includes('Apply the exact task'));

// Policy shape, provenance classes, modes, identity, and time window fail closed.
for (const mutate of [
  (value: any) => { value.rawPrompt = 'forbidden'; },
  (value: any) => { value.environment.mode = 'inherit-all'; },
  (value: any) => { value.hooks.mode = 'enabled'; },
  (value: any) => { value.hooks.evidenceSha256 = value.settings.evidenceSha256; },
  (value: any) => { value.expiresAt = value.issuedAt; },
  (value: any) => { value.runId = '../escape'; },
]) {
  const attacked = structuredClone(rawPolicy) as any;
  mutate(attacked);
  expectCode('invalid-policy', () => createProviderParityPolicyAttestation(attacked));
  assertions += 1;
}
const inheritedPolicy = Object.assign(Object.create({ inherited: true }), rawPolicy);
expectCode('invalid-policy', () => createProviderParityPolicyAttestation(inheritedPolicy)); assertions += 1;
const accessorPolicy = structuredClone(rawPolicy) as any;
Object.defineProperty(accessorPolicy, 'runId', { enumerable: true, get: () => rawPolicy.runId });
expectCode('invalid-policy', () => createProviderParityPolicyAttestation(accessorPolicy)); assertions += 1;
const symbolPolicy = structuredClone(rawPolicy) as any;
symbolPolicy[Symbol('hidden')] = 'secret';
expectCode('invalid-policy', () => createProviderParityPolicyAttestation(symbolPolicy)); assertions += 1;

// Identity and exact policy binding cannot cross runs/providers or drift from A1.
for (const mutate of [
  (value: any) => { value.identity.runId = 'run-other'; },
  (value: any) => { value.identity.provider = 'codex'; },
  (value: any) => { value.identity.fixtureSha256 = hash(90); },
  (value: any) => { value.identity.phaseBindings[1].phaseContractSha256 = hash(91); },
  (value: any) => { value.identity.attemptOrdinal = 2; },
  (value: any) => { value.identity.startedAt = '2026-08-20T23:59:59.999Z'; },
  (value: any) => { value.identity.observedAt = '2026-08-21T00:20:00.001Z'; },
]) {
  const attacked = structuredClone(rawEvidence) as any;
  mutate(attacked);
  expectCode('invalid-identity', () => createProviderParityEvidenceAttestation(attacked));
  assertions += 1;
}
const policyHashAttack = structuredClone(rawEvidence) as any;
policyHashAttack.policyAttestation.policyAttestationSha256 = hash(92);
expectCode('invalid-policy', () => createProviderParityEvidenceAttestation(policyHashAttack)); assertions += 1;

// Evidence order and distinct hashes are exact; false evidence is preserved without fabrication.
for (const mutate of [
  (value: any) => { value.acceptanceCriteria.pop(); },
  (value: any) => { value.artifacts.reverse(); },
  (value: any) => { value.gates[0].phaseId = 'B10'; },
  (value: any) => { value.gates[1].evidenceSha256 = value.gates[0].evidenceSha256; },
  (value: any) => { value.apiContract.rawDiff = 'forbidden'; },
]) {
  const attacked = structuredClone(rawEvidence) as any;
  mutate(attacked);
  expectCode('invalid-evidence', () => createProviderParityEvidenceAttestation(attacked));
  assertions += 1;
}
const failedArtifact = structuredClone(rawEvidence) as any;
failedArtifact.artifacts[0].satisfied = false;
const failedArtifactReceipt = createProviderParityEvidenceAttestation(failedArtifact);
check(failedArtifactReceipt.eligibleForA2Composition === false && failedArtifactReceipt.artifacts[0].satisfied === false);

// Candidate verification admission re-derives its hash and closed state/reasons.
for (const mutate of [
  (value: any) => { value.candidateVerification.verificationEvidenceSha256 = hash(93); },
  (value: any) => { value.candidateVerification.testCommandSha256 = hash(94); },
  (value: any) => { value.candidateVerification.state = 'failed'; },
  (value: any) => { value.candidateVerification.reasonCodes = ['trusted-test-failed']; },
  (value: any) => { value.candidateVerification.trustedTest.exitCode = 1; },
]) {
  const attacked = structuredClone(rawEvidence) as any;
  mutate(attacked);
  expectCode('invalid-candidate', () => createProviderParityEvidenceAttestation(attacked));
  assertions += 1;
}
const failedCandidateInput = structuredClone(rawEvidence) as any;
failedCandidateInput.candidateVerification.state = 'failed';
failedCandidateInput.candidateVerification.violations.lockedPathEdit = true;
failedCandidateInput.candidateVerification.reasonCodes = ['locked-path-edit'];
delete failedCandidateInput.candidateVerification.verificationEvidenceSha256;
failedCandidateInput.candidateVerification.verificationEvidenceSha256 = hashProviderParityAttestationValue(failedCandidateInput.candidateVerification);
const failedCandidateReceipt = createProviderParityEvidenceAttestation(failedCandidateInput);
check(failedCandidateReceipt.eligibleForA2Composition === false);

const candidateContradiction = structuredClone(rawEvidence) as any;
candidateContradiction.candidateVerification.trustedTest.timedOut = true;
delete candidateContradiction.candidateVerification.verificationEvidenceSha256;
candidateContradiction.candidateVerification.verificationEvidenceSha256 = hashProviderParityAttestationValue(candidateContradiction.candidateVerification);
expectCode('invalid-candidate', () => createProviderParityEvidenceAttestation(candidateContradiction)); assertions += 1;

const falseFailedCandidate = structuredClone(rawEvidence) as any;
falseFailedCandidate.candidateVerification.state = 'failed';
falseFailedCandidate.candidateVerification.trustedTest.status = 'failed';
falseFailedCandidate.candidateVerification.reasonCodes = ['trusted-test-failed'];
delete falseFailedCandidate.candidateVerification.verificationEvidenceSha256;
falseFailedCandidate.candidateVerification.verificationEvidenceSha256 = hashProviderParityAttestationValue(falseFailedCandidate.candidateVerification);
expectCode('invalid-candidate', () => createProviderParityEvidenceAttestation(falseFailedCandidate)); assertions += 1;

const genuineFailedCandidate = structuredClone(falseFailedCandidate) as any;
genuineFailedCandidate.candidateVerification.trustedTest.exitCode = 1;
delete genuineFailedCandidate.candidateVerification.verificationEvidenceSha256;
genuineFailedCandidate.candidateVerification.verificationEvidenceSha256 = hashProviderParityAttestationValue(genuineFailedCandidate.candidateVerification);
const genuineFailedReceipt = createProviderParityEvidenceAttestation(genuineFailedCandidate);
check(genuineFailedReceipt.eligibleForA2Composition === false && genuineFailedReceipt.candidateVerification.trustedTest.exitCode === 1);

const impossibleCalendarPolicy = structuredClone(rawPolicy) as any;
impossibleCalendarPolicy.issuedAt = '2026-13-21T00:00:00.000Z';
expectCode('invalid-policy', () => createProviderParityPolicyAttestation(impossibleCalendarPolicy)); assertions += 1;

// Cleanup is exact and a bounded failure remains visible.
const cleanupMismatch = structuredClone(rawEvidence) as any;
cleanupMismatch.cleanup.materializedTreeSha256 = hash(95);
expectCode('invalid-cleanup', () => createProviderParityEvidenceAttestation(cleanupMismatch)); assertions += 1;
const cleanupFailure = structuredClone(rawEvidence) as any;
cleanupFailure.cleanup = {
  state: 'failed', fixtureId: 'p17-007-provider-parity-golden', fixtureRevision: 1,
  materializedTreeSha256, failureEvidenceSha256: hash(96),
};
const cleanupFailureReceipt = createProviderParityEvidenceAttestation(cleanupFailure);
check(cleanupFailureReceipt.cleanupFailed === true && cleanupFailureReceipt.eligibleForA2Composition === false);
const cleanupLeak = structuredClone(cleanupFailure) as any;
cleanupLeak.cleanup.error = 'C:\\Users\\operator\\secret';
expectCode('invalid-cleanup', () => createProviderParityEvidenceAttestation(cleanupLeak)); assertions += 1;

// Metric nullability and provenance are closed.
for (const mutate of [
  (value: any) => { value.metrics.durationMs = null; },
  (value: any) => { value.metrics.inputTokens = 10; },
  (value: any) => { value.metrics.pricingStatus = 'priced'; },
  (value: any) => { value.metrics.costUsd = Number.NaN; },
]) {
  const attacked = structuredClone(rawEvidence) as any;
  mutate(attacked);
  expectCode('invalid-metrics', () => createProviderParityEvidenceAttestation(attacked));
  assertions += 1;
}
const priced = structuredClone(rawEvidence) as any;
Object.assign(priced.metrics, {
  inputTokens: 100, outputTokens: 50, cacheTokens: 25, tokenSource: 'provider',
  pricingStatus: 'priced', priceBasisSha256: hash(97), costUsd: 0.0125, costSource: 'trusted-runner',
});
check(createProviderParityEvidenceAttestation(priced).metrics.costUsd === 0.0125);

const durableTamper = structuredClone(receipt) as any;
durableTamper.candidateVerification.reasonCodes = ['trusted-test-failed'];
durableTamper.evidenceAttestationSha256 = hashProviderParityAttestationValue((({ evidenceAttestationSha256: _ignored, ...rest }) => rest)(durableTamper));
expectCode('invalid-candidate', () => admitProviderParityEvidenceAttestation(durableTamper)); assertions += 1;
const durableHashTamper = structuredClone(receipt) as any;
durableHashTamper.evidenceAttestationSha256 = hash(98);
expectCode('invalid-evidence', () => admitProviderParityEvidenceAttestation(durableHashTamper)); assertions += 1;

// The source imports only crypto; no hidden runtime boundary exists.
const source = fs.readFileSync(path.join(process.cwd(), '.claude', 'integrations', 'provider-parity-attestation.ts'), 'utf8');
check(!/from ['"]node:(?:fs|child_process|http|https|net|tls|os|path|process|perf_hooks)['"]/.test(source));
check(!/process\.(?:env|cwd|argv)|Date\.now\(|performance\.now\(/.test(source));

// N1: 10,000 pure compositions remain bounded and deterministic.
const beforeRss = process.memoryUsage().rss;
const samples: number[] = [];
const sentinelStarted = performance.now();
for (let index = 0; index < 10_000; index += 1) {
  const started = performance.now();
  const observed = createProviderParityEvidenceAttestation(rawEvidence);
  samples.push(performance.now() - started);
  if (index === 9_999) check(observed.evidenceAttestationSha256 === receipt.evidenceAttestationSha256);
}
const elapsedMs = performance.now() - sentinelStarted;
samples.sort((a, b) => a - b);
const p95Ms = samples[Math.floor(samples.length * 0.95)];
const rssDelta = Math.max(0, process.memoryUsage().rss - beforeRss);
check(p95Ms < 50, `p95 ${p95Ms.toFixed(3)} ms breached 50 ms`);
check(rssDelta < 64 * 1024 * 1024, `RSS delta ${rssDelta} breached 64 MiB`);

console.log(`provider-parity-attestation.test: PASS (${assertions} assertions, 10,000 compositions, ${elapsedMs.toFixed(3)} ms wall, p95 ${p95Ms.toFixed(3)} ms, RSS delta ${rssDelta})`);
