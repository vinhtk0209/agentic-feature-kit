/**
 * P17-007 A3B3B — pure successful A3B3A-to-A2 candidate-receipt composition.
 *
 * The only input is one durable A3B3A attestation. This module performs no provider,
 * process, clock, environment, filesystem, network, credential, session, or persistence I/O.
 */
import {
  PROVIDER_PARITY_SCHEMA_VERSION,
  assertProviderParityCandidateReceipt,
  hashProviderParityReceipt,
  type ProviderParityArtifactClass,
  type ProviderParityCandidateReceipt,
  type ProviderParityPhaseId,
  type ProviderParityProvider,
} from '../../packages/core/src/provider-parity-evaluator';
import {
  admitProviderParityEvidenceAttestation,
  type ProviderParityEvidenceAttestation,
} from './provider-parity-attestation';

export type ProviderParityReceiptCompositionErrorCode =
  | 'invalid-attestation'
  | 'ineligible-attestation'
  | 'invalid-composition';

export class ProviderParityReceiptCompositionError extends Error {
  readonly code: ProviderParityReceiptCompositionErrorCode;

  constructor(code: ProviderParityReceiptCompositionErrorCode) {
    super(`Provider parity receipt composition: ${code}`);
    this.name = 'ProviderParityReceiptCompositionError';
    this.code = code;
  }
}

function fail(code: ProviderParityReceiptCompositionErrorCode): never {
  throw new ProviderParityReceiptCompositionError(code);
}

function admit(value: unknown): ProviderParityEvidenceAttestation {
  try {
    return admitProviderParityEvidenceAttestation(value);
  } catch {
    fail('invalid-attestation');
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function composeProviderParityA2Receipt(value: unknown): ProviderParityCandidateReceipt {
  const attestation = admit(value);
  if (attestation.eligibleForA2Composition !== true) fail('ineligible-attestation');
  if (attestation.candidateVerification.trustedTest.status !== 'passed' ||
      attestation.candidateVerification.trustedTest.exitCode !== 0 ||
      attestation.candidateVerification.state !== 'passed' ||
      attestation.cleanupFailed || attestation.cleanup.state !== 'cleaned') {
    fail('invalid-attestation');
  }

  const withoutHash: Omit<ProviderParityCandidateReceipt, 'receiptHash'> = {
    schemaVersion: PROVIDER_PARITY_SCHEMA_VERSION,
    runId: attestation.identity.runId,
    provider: attestation.identity.provider as ProviderParityProvider,
    execution: { state: 'completed', reasonCodes: [] },
    identity: {
      fixtureId: attestation.identity.fixtureId,
      fixtureRevision: attestation.identity.fixtureRevision,
      fixtureSha256: attestation.identity.fixtureSha256,
      semanticSpecSha256: attestation.identity.semanticSpecSha256,
      taskPromptSha256: attestation.identity.taskPromptSha256,
      seedTreeSha256: attestation.identity.seedTreeSha256,
      phaseBindings: attestation.identity.phaseBindings.map((entry) => ({
        phaseId: entry.phaseId as ProviderParityPhaseId,
        phaseContractSha256: entry.phaseContractSha256,
      })),
      runnerId: attestation.identity.runnerId,
      cliVersion: attestation.identity.cliVersion,
      modelId: attestation.identity.modelId,
      reasoningEffort: attestation.identity.reasoningEffort,
      adapterCapabilitySha256: attestation.policyAttestation.adapterCapabilitySha256,
      runtimeEntitlementEvidenceSha256: attestation.policyAttestation.runtimeEntitlementEvidenceSha256,
      materializedTreeSha256: attestation.candidateVerification.candidateTreeSha256,
      executionPolicySha256: attestation.policyAttestation.executionPolicySha256,
      authorizationReceiptSha256: attestation.policyAttestation.authorizationReceiptSha256,
      sourceCommit: attestation.identity.sourceCommit,
      observedAt: attestation.identity.observedAt,
      timeoutMs: attestation.identity.timeoutMs,
      maxCapturedOutputBytes: attestation.identity.maxCapturedOutputBytes,
      attemptOrdinal: attestation.identity.attemptOrdinal,
    },
    evidence: {
      acceptanceCriteria: attestation.acceptanceCriteria.map((entry) => ({
        id: entry.id,
        evidenceSha256: entry.evidenceSha256,
      })),
      artifacts: attestation.artifacts.map((entry) => ({
        artifactClass: entry.id as ProviderParityArtifactClass,
        evidenceSha256: entry.evidenceSha256,
      })),
      gates: attestation.gates.map((entry) => ({
        phaseId: entry.phaseId as ProviderParityPhaseId,
        conserved: entry.conserved,
        evidenceSha256: entry.evidenceSha256,
      })),
      apiContractConserved: attestation.apiContract.conserved,
      trustedVerification: {
        exitCode: attestation.candidateVerification.trustedTest.exitCode,
        evidenceSha256: attestation.candidateVerification.trustedTest.evidenceSha256,
      },
      violations: {
        lockedPathEdit: attestation.candidateVerification.violations.lockedPathEdit,
        undeclaredPath: attestation.candidateVerification.violations.undeclaredPath,
        externalDependency: attestation.candidateVerification.violations.externalDependency,
        secretOrPathDisclosure: attestation.candidateVerification.violations.secretOrPathDisclosure,
        permissionWidening: attestation.candidateVerification.violations.permissionWidening,
        cleanupFailed: attestation.cleanupFailed,
      },
    },
    metrics: {
      durationMs: attestation.metrics.durationMs,
      inputTokens: attestation.metrics.inputTokens,
      outputTokens: attestation.metrics.outputTokens,
      cacheTokens: attestation.metrics.cacheTokens,
      pricingStatus: attestation.metrics.pricingStatus,
      priceBasisSha256: attestation.metrics.priceBasisSha256,
      costUsd: attestation.metrics.costUsd,
    },
  };
  const receipt: ProviderParityCandidateReceipt = {
    ...withoutHash,
    receiptHash: hashProviderParityReceipt(withoutHash),
  };
  try {
    assertProviderParityCandidateReceipt(receipt);
  } catch {
    fail('invalid-composition');
  }
  return deepFreeze(receipt);
}
