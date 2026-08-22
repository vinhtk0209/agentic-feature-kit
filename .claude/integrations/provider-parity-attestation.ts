/**
 * P17-007 A3B3A — pure provider-parity policy and evidence attestation.
 *
 * This module validates and hashes caller-supplied metadata only. It has no filesystem,
 * environment, process, provider, credential, network, clock, persistence, or evidence-sink port.
 */
import * as crypto from 'node:crypto';

export const PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const;
export const PROVIDER_PARITY_ATTESTATION_PROVIDERS = ['codex', 'claude', 'copilot'] as const;
export const PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA = ['AC-1', 'AC-2', 'AC-3'] as const;
export const PROVIDER_PARITY_ATTESTATION_ARTIFACTS = ['plan', 'implementation', 'test', 'trusted-verification'] as const;
export const PROVIDER_PARITY_ATTESTATION_PHASES = [
  { phaseId: 'B3', phaseContractSha256: '0c79cc6c07014a8c8ef4a839045173aa184a05520b534ab4bb788315e01f287d' },
  { phaseId: 'B10', phaseContractSha256: 'beb5485a673d62153b07c6484fe376296f7b3a27ffdc0058981256f092567a12' },
  { phaseId: 'B11', phaseContractSha256: '73dfec19182b0e365648998f54f1067ce1260feb1797dd55b950c6b973a67000' },
] as const;

const FIXTURE_ID = 'p17-007-provider-parity-golden';
const FIXTURE_REVISION = 1;
const FIXTURE_SHA256 = '64000b8e960e22138e15462f24f6eca69f2a436f13be4c3d7aa66b87c8ab21db';
const SEMANTIC_SPEC_SHA256 = '206ae7026488f0d1ea9cfd90d392bb946ebc6726ebf1adbd6936157486d19830';
const TASK_PROMPT_SHA256 = '07b1eb213bba17b07c38d76019bd0265948d72b939350387f93d1caca5c9509c';
const SEED_TREE_SHA256 = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const TEST_TIMEOUT_MS = 1_200_000;
const TEST_OUTPUT_BYTES = 16_777_216;
const MAX_RECORD_NODES = 2_000;
const MAX_STRING_BYTES = 512;
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const POLICY_KEYS = [
  'schemaVersion', 'provider', 'runId', 'executionPolicySha256', 'adapterCapabilitySha256',
  'runtimeEntitlementEvidenceSha256', 'authorizationReceiptSha256', 'environment', 'filesystem',
  'network', 'settings', 'managedPolicy', 'hooks', 'issuedAt', 'expiresAt',
] as const;
const POLICY_RECEIPT_KEYS = [...POLICY_KEYS, 'policyAttestationSha256'] as const;
const MODE_KEYS = ['mode', 'evidenceSha256'] as const;
const EVIDENCE_INPUT_KEYS = [
  'schemaVersion', 'policyAttestation', 'identity', 'acceptanceCriteria', 'artifacts', 'gates',
  'apiContract', 'candidateVerification', 'cleanup', 'metrics',
] as const;
const EVIDENCE_RECEIPT_KEYS = [
  'schemaVersion', 'policyAttestation', 'policyAttestationSha256', 'identity', 'acceptanceCriteria',
  'artifacts', 'gates', 'apiContract', 'candidateVerification', 'cleanup', 'cleanupFailed', 'metrics',
  'eligibleForA2Composition', 'evidenceAttestationSha256',
] as const;
const IDENTITY_KEYS = [
  'provider', 'runId', 'fixtureId', 'fixtureRevision', 'fixtureSha256', 'semanticSpecSha256',
  'taskPromptSha256', 'seedTreeSha256', 'phaseBindings', 'runnerId', 'cliVersion', 'modelId',
  'reasoningEffort', 'sourceCommit', 'startedAt', 'completedAt', 'observedAt', 'timeoutMs',
  'maxCapturedOutputBytes', 'attemptOrdinal', 'materializedTreeSha256',
] as const;
const DECISION_KEYS = ['id', 'satisfied', 'evidenceSha256'] as const;
const GATE_KEYS = ['phaseId', 'phaseContractSha256', 'conserved', 'evidenceSha256'] as const;
const API_KEYS = ['conserved', 'evidenceSha256'] as const;
const METRIC_KEYS = [
  'durationMs', 'durationSource', 'inputTokens', 'outputTokens', 'cacheTokens', 'tokenSource',
  'pricingStatus', 'priceBasisSha256', 'costUsd', 'costSource',
] as const;
const CANDIDATE_KEYS = [
  'state', 'fixtureId', 'fixtureRevision', 'candidateTreeSha256', 'preTestTreeSha256',
  'postTestTreeSha256', 'candidateStateSha256', 'pathInventorySha256',
  'lockedPathEvidenceSha256', 'allowedPathEvidenceSha256', 'testCommandSha256', 'fileCount',
  'totalBytes', 'permissionRule', 'processCallCount', 'mutationDetected', 'violations',
  'reasonCodes', 'trustedTest', 'verificationEvidenceSha256',
] as const;
const CANDIDATE_VIOLATION_KEYS = [
  'lockedPathEdit', 'undeclaredPath', 'externalDependency', 'secretOrPathDisclosure',
  'permissionWidening',
] as const;
const TRUSTED_TEST_KEYS = [
  'status', 'exitCode', 'timedOut', 'outputCapped', 'signaled', 'stderrPresent', 'processFailure',
  'outputBytes', 'durationMs', 'evidenceSha256',
] as const;
const CANDIDATE_REASON_ORDER = [
  'locked-path-edit', 'undeclared-path', 'external-dependency', 'secret-or-path-disclosure',
  'permission-widening', 'trusted-test-failed', 'candidate-mutated',
] as const;
const CANDIDATE_SUMMARY_KEYS = [
  'state', 'candidateTreeSha256', 'verificationEvidenceSha256', 'trustedTest', 'violations',
  'reasonCodes', 'mutationDetected',
] as const;
const TRUSTED_SUMMARY_KEYS = ['status', 'exitCode', 'evidenceSha256'] as const;
const CLEANUP_SUMMARY_KEYS = ['state', 'evidenceSha256'] as const;
const CLEANUP_SUCCESS_KEYS = [
  'state', 'fixtureId', 'fixtureRevision', 'materializedTreeSha256', 'removedNodeCount', 'zeroResidue',
] as const;
const CLEANUP_FAILURE_KEYS = [
  'state', 'fixtureId', 'fixtureRevision', 'materializedTreeSha256', 'failureEvidenceSha256',
] as const;

type JsonRecord = Record<string, unknown>;
export type ProviderParityAttestationProvider = typeof PROVIDER_PARITY_ATTESTATION_PROVIDERS[number];

export type ProviderParityAttestationErrorCode =
  | 'invalid-input'
  | 'invalid-policy'
  | 'invalid-identity'
  | 'invalid-evidence'
  | 'invalid-candidate'
  | 'invalid-cleanup'
  | 'invalid-metrics';

export class ProviderParityAttestationError extends Error {
  readonly code: ProviderParityAttestationErrorCode;

  constructor(code: ProviderParityAttestationErrorCode) {
    super(`Provider parity attestation: ${code}`);
    this.name = 'ProviderParityAttestationError';
    this.code = code;
  }
}

export interface ProviderParityPolicyModeEvidence {
  readonly mode: string;
  readonly evidenceSha256: string;
}

export interface ProviderParityPolicyAttestationInput {
  readonly schemaVersion: typeof PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION;
  readonly provider: ProviderParityAttestationProvider;
  readonly runId: string;
  readonly executionPolicySha256: string;
  readonly adapterCapabilitySha256: string;
  readonly runtimeEntitlementEvidenceSha256: string;
  readonly authorizationReceiptSha256: string;
  readonly environment: ProviderParityPolicyModeEvidence;
  readonly filesystem: ProviderParityPolicyModeEvidence;
  readonly network: ProviderParityPolicyModeEvidence;
  readonly settings: ProviderParityPolicyModeEvidence;
  readonly managedPolicy: ProviderParityPolicyModeEvidence;
  readonly hooks: ProviderParityPolicyModeEvidence;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ProviderParityPolicyAttestation extends ProviderParityPolicyAttestationInput {
  readonly policyAttestationSha256: string;
}

export interface ProviderParityEvidenceIdentity {
  readonly provider: ProviderParityAttestationProvider;
  readonly runId: string;
  readonly fixtureId: typeof FIXTURE_ID;
  readonly fixtureRevision: typeof FIXTURE_REVISION;
  readonly fixtureSha256: typeof FIXTURE_SHA256;
  readonly semanticSpecSha256: typeof SEMANTIC_SPEC_SHA256;
  readonly taskPromptSha256: typeof TASK_PROMPT_SHA256;
  readonly seedTreeSha256: typeof SEED_TREE_SHA256;
  readonly phaseBindings: readonly { readonly phaseId: string; readonly phaseContractSha256: string }[];
  readonly runnerId: string;
  readonly cliVersion: string;
  readonly modelId: string;
  readonly reasoningEffort: string | null;
  readonly sourceCommit: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly observedAt: string;
  readonly timeoutMs: typeof TEST_TIMEOUT_MS;
  readonly maxCapturedOutputBytes: typeof TEST_OUTPUT_BYTES;
  readonly attemptOrdinal: 1;
  readonly materializedTreeSha256: string;
}

export interface ProviderParityEvidenceDecision {
  readonly id: string;
  readonly satisfied: boolean;
  readonly evidenceSha256: string;
}

export interface ProviderParityGateDecision {
  readonly phaseId: string;
  readonly phaseContractSha256: string;
  readonly conserved: boolean;
  readonly evidenceSha256: string;
}

export interface ProviderParityMetricEvidence {
  readonly durationMs: number | null;
  readonly durationSource: 'trusted-runner' | 'unavailable';
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheTokens: number | null;
  readonly tokenSource: 'provider' | 'unavailable';
  readonly pricingStatus: 'priced' | 'unpriced';
  readonly priceBasisSha256: string | null;
  readonly costUsd: number | null;
  readonly costSource: 'provider' | 'trusted-runner' | 'unavailable';
}

export interface ProviderParityEvidenceAttestationInput {
  readonly schemaVersion: typeof PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION;
  readonly policyAttestation: unknown;
  readonly identity: ProviderParityEvidenceIdentity;
  readonly acceptanceCriteria: readonly ProviderParityEvidenceDecision[];
  readonly artifacts: readonly ProviderParityEvidenceDecision[];
  readonly gates: readonly ProviderParityGateDecision[];
  readonly apiContract: { readonly conserved: boolean; readonly evidenceSha256: string };
  readonly candidateVerification: unknown;
  readonly cleanup: unknown;
  readonly metrics: ProviderParityMetricEvidence;
}

export interface ProviderParityEvidenceAttestation {
  readonly schemaVersion: typeof PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION;
  readonly policyAttestation: ProviderParityPolicyAttestation;
  readonly policyAttestationSha256: string;
  readonly identity: ProviderParityEvidenceIdentity;
  readonly acceptanceCriteria: readonly ProviderParityEvidenceDecision[];
  readonly artifacts: readonly ProviderParityEvidenceDecision[];
  readonly gates: readonly ProviderParityGateDecision[];
  readonly apiContract: { readonly conserved: boolean; readonly evidenceSha256: string };
  readonly candidateVerification: {
    readonly state: 'passed' | 'failed';
    readonly candidateTreeSha256: string;
    readonly verificationEvidenceSha256: string;
    readonly trustedTest: {
      readonly status: 'not-run' | 'passed' | 'failed';
      readonly exitCode: number | null;
      readonly evidenceSha256: string;
    };
    readonly violations: {
      readonly lockedPathEdit: boolean;
      readonly undeclaredPath: boolean;
      readonly externalDependency: boolean;
      readonly secretOrPathDisclosure: boolean;
      readonly permissionWidening: boolean;
    };
    readonly reasonCodes: readonly string[];
    readonly mutationDetected: boolean;
  };
  readonly cleanup: {
    readonly state: 'cleaned' | 'failed';
    readonly evidenceSha256: string;
  };
  readonly cleanupFailed: boolean;
  readonly metrics: ProviderParityMetricEvidence;
  readonly eligibleForA2Composition: boolean;
  readonly evidenceAttestationSha256: string;
}

function fail(code: ProviderParityAttestationErrorCode): never {
  throw new ProviderParityAttestationError(code);
}

function inspectPlain(value: unknown, code: ProviderParityAttestationErrorCode): void {
  let nodes = 0;
  const seen = new Set<object>();
  const walk = (entry: unknown): void => {
    nodes += 1;
    if (nodes > MAX_RECORD_NODES) fail(code);
    if (entry === null || typeof entry === 'boolean' || typeof entry === 'number') return;
    if (typeof entry === 'string') {
      if (Buffer.byteLength(entry, 'utf8') > MAX_STRING_BYTES || /[\u0000-\u001f\u007f]/.test(entry)) fail(code);
      return;
    }
    if (typeof entry !== 'object') fail(code);
    if (seen.has(entry)) fail(code);
    seen.add(entry);
    if (Object.getOwnPropertySymbols(entry).length !== 0) fail(code);
    if (Array.isArray(entry)) {
      if (entry.length > 64 || Object.keys(entry).length !== entry.length) fail(code);
      for (const item of entry) walk(item);
    } else {
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) fail(code);
      for (const key of Object.getOwnPropertyNames(entry)) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key);
        if (!descriptor?.enumerable || !('value' in descriptor)) fail(code);
        walk(descriptor.value);
      }
    }
    seen.delete(entry);
  };
  try { walk(value); } catch (error) {
    if (error instanceof ProviderParityAttestationError) throw error;
    fail(code);
  }
}

function record(value: unknown, code: ProviderParityAttestationErrorCode): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], code: ProviderParityAttestationErrorCode): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function sha(value: unknown, code: ProviderParityAttestationErrorCode): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function safeId(value: unknown, code: ProviderParityAttestationErrorCode): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) fail(code);
  return value;
}

function boolean(value: unknown, code: ProviderParityAttestationErrorCode): boolean {
  if (typeof value !== 'boolean') fail(code);
  return value;
}

function nonNegative(value: unknown, integer: boolean, code: ProviderParityAttestationErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) fail(code);
  return value;
}

function timestamp(value: unknown, code: ProviderParityAttestationErrorCode): string {
  if (typeof value !== 'string' || !ISO_UTC.test(value)) fail(code);
  let normalized: string;
  try {
    normalized = new Date(value).toISOString();
  } catch {
    fail(code);
  }
  if (normalized !== value) fail(code);
  return value;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as JsonRecord).sort().map((key) => [key, stable((value as JsonRecord)[key])]));
  }
  return value;
}

export function hashProviderParityAttestationValue(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as JsonRecord)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, entry]) => [key, clone(entry)])) as T;
  }
  return value;
}

function modeEvidence(value: unknown, allowedMode: readonly string[], code: ProviderParityAttestationErrorCode): ProviderParityPolicyModeEvidence {
  const item = record(value, code);
  exactKeys(item, MODE_KEYS, code);
  if (typeof item.mode !== 'string' || !allowedMode.includes(item.mode)) fail(code);
  return { mode: item.mode, evidenceSha256: sha(item.evidenceSha256, code) };
}

function admitPolicy(value: unknown): ProviderParityPolicyAttestation {
  inspectPlain(value, 'invalid-policy');
  const input = record(value, 'invalid-policy');
  exactKeys(input, POLICY_RECEIPT_KEYS, 'invalid-policy');
  const { policyAttestationSha256: claimed, ...withoutHash } = input;
  const recreated = createPolicy(withoutHash, true);
  if (claimed !== recreated.policyAttestationSha256) fail('invalid-policy');
  return recreated;
}

export function admitProviderParityPolicyAttestation(value: unknown): ProviderParityPolicyAttestation {
  return admitPolicy(value);
}

function createPolicy(value: unknown, admitted = false): ProviderParityPolicyAttestation {
  if (!admitted) inspectPlain(value, 'invalid-policy');
  const input = record(value, 'invalid-policy');
  exactKeys(input, POLICY_KEYS, 'invalid-policy');
  if (input.schemaVersion !== PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION) fail('invalid-policy');
  if (!PROVIDER_PARITY_ATTESTATION_PROVIDERS.includes(input.provider as ProviderParityAttestationProvider)) fail('invalid-policy');
  const runId = safeId(input.runId, 'invalid-policy');
  const issuedAt = timestamp(input.issuedAt, 'invalid-policy');
  const expiresAt = timestamp(input.expiresAt, 'invalid-policy');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail('invalid-policy');
  const environment = modeEvidence(input.environment, ['explicit-allowlist-v1'], 'invalid-policy');
  const filesystem = modeEvidence(input.filesystem, ['isolated-root-only-v1'], 'invalid-policy');
  const network = modeEvidence(input.network, ['provider-control-only-v1'], 'invalid-policy');
  const settings = modeEvidence(input.settings, ['isolated-empty-v1', 'independently-attested-v1'], 'invalid-policy');
  const managedPolicy = modeEvidence(input.managedPolicy, ['absent-v1', 'independently-attested-v1'], 'invalid-policy');
  const hooks = modeEvidence(input.hooks, ['disabled-v1', 'independently-attested-empty-v1'], 'invalid-policy');
  const partial: ProviderParityPolicyAttestationInput = {
    schemaVersion: PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION,
    provider: input.provider as ProviderParityAttestationProvider,
    runId,
    executionPolicySha256: sha(input.executionPolicySha256, 'invalid-policy'),
    adapterCapabilitySha256: sha(input.adapterCapabilitySha256, 'invalid-policy'),
    runtimeEntitlementEvidenceSha256: sha(input.runtimeEntitlementEvidenceSha256, 'invalid-policy'),
    authorizationReceiptSha256: sha(input.authorizationReceiptSha256, 'invalid-policy'),
    environment, filesystem, network, settings, managedPolicy, hooks, issuedAt, expiresAt,
  };
  const evidenceHashes = [
    partial.executionPolicySha256, partial.adapterCapabilitySha256,
    partial.runtimeEntitlementEvidenceSha256, partial.authorizationReceiptSha256,
    environment.evidenceSha256, filesystem.evidenceSha256, network.evidenceSha256,
    settings.evidenceSha256, managedPolicy.evidenceSha256, hooks.evidenceSha256,
  ];
  if (new Set(evidenceHashes).size !== evidenceHashes.length) fail('invalid-policy');
  const receipt = { ...partial, policyAttestationSha256: hashProviderParityAttestationValue(partial) };
  return deepFreeze(clone(receipt));
}

export function createProviderParityPolicyAttestation(value: unknown): ProviderParityPolicyAttestation {
  return createPolicy(value);
}

function admitIdentity(value: unknown, policy: ProviderParityPolicyAttestation): ProviderParityEvidenceIdentity {
  const input = record(value, 'invalid-identity');
  exactKeys(input, IDENTITY_KEYS, 'invalid-identity');
  if (input.provider !== policy.provider || input.runId !== policy.runId) fail('invalid-identity');
  if (input.fixtureId !== FIXTURE_ID || input.fixtureRevision !== FIXTURE_REVISION ||
      input.fixtureSha256 !== FIXTURE_SHA256 || input.semanticSpecSha256 !== SEMANTIC_SPEC_SHA256 ||
      input.taskPromptSha256 !== TASK_PROMPT_SHA256 || input.seedTreeSha256 !== SEED_TREE_SHA256) fail('invalid-identity');
  if (JSON.stringify(input.phaseBindings) !== JSON.stringify(PROVIDER_PARITY_ATTESTATION_PHASES)) fail('invalid-identity');
  const startedAt = timestamp(input.startedAt, 'invalid-identity');
  const completedAt = timestamp(input.completedAt, 'invalid-identity');
  const observedAt = timestamp(input.observedAt, 'invalid-identity');
  if (Date.parse(policy.issuedAt) > Date.parse(startedAt) || Date.parse(startedAt) > Date.parse(completedAt) ||
      completedAt !== observedAt || Date.parse(completedAt) > Date.parse(policy.expiresAt)) fail('invalid-identity');
  if (input.timeoutMs !== TEST_TIMEOUT_MS || input.maxCapturedOutputBytes !== TEST_OUTPUT_BYTES || input.attemptOrdinal !== 1) fail('invalid-identity');
  if (typeof input.sourceCommit !== 'string' || !SOURCE_COMMIT.test(input.sourceCommit)) fail('invalid-identity');
  if (input.reasoningEffort !== null) safeId(input.reasoningEffort, 'invalid-identity');
  return deepFreeze(clone({
    provider: input.provider, runId: input.runId, fixtureId: input.fixtureId,
    fixtureRevision: input.fixtureRevision, fixtureSha256: input.fixtureSha256,
    semanticSpecSha256: input.semanticSpecSha256, taskPromptSha256: input.taskPromptSha256,
    seedTreeSha256: input.seedTreeSha256, phaseBindings: input.phaseBindings,
    runnerId: safeId(input.runnerId, 'invalid-identity'), cliVersion: safeId(input.cliVersion, 'invalid-identity'),
    modelId: safeId(input.modelId, 'invalid-identity'), reasoningEffort: input.reasoningEffort,
    sourceCommit: input.sourceCommit, startedAt, completedAt, observedAt,
    timeoutMs: input.timeoutMs, maxCapturedOutputBytes: input.maxCapturedOutputBytes,
    attemptOrdinal: input.attemptOrdinal, materializedTreeSha256: sha(input.materializedTreeSha256, 'invalid-identity'),
  })) as ProviderParityEvidenceIdentity;
}

function decisions(value: unknown, ids: readonly string[], code: ProviderParityAttestationErrorCode): ProviderParityEvidenceDecision[] {
  if (!Array.isArray(value) || value.length !== ids.length) fail(code);
  return value.map((raw, index) => {
    const item = record(raw, code);
    exactKeys(item, DECISION_KEYS, code);
    if (item.id !== ids[index]) fail(code);
    return { id: item.id as string, satisfied: boolean(item.satisfied, code), evidenceSha256: sha(item.evidenceSha256, code) };
  });
}

function gates(value: unknown): ProviderParityGateDecision[] {
  if (!Array.isArray(value) || value.length !== PROVIDER_PARITY_ATTESTATION_PHASES.length) fail('invalid-evidence');
  return value.map((raw, index) => {
    const item = record(raw, 'invalid-evidence');
    exactKeys(item, GATE_KEYS, 'invalid-evidence');
    const expected = PROVIDER_PARITY_ATTESTATION_PHASES[index];
    if (item.phaseId !== expected.phaseId || item.phaseContractSha256 !== expected.phaseContractSha256) fail('invalid-evidence');
    return {
      phaseId: item.phaseId as string, phaseContractSha256: item.phaseContractSha256 as string,
      conserved: boolean(item.conserved, 'invalid-evidence'), evidenceSha256: sha(item.evidenceSha256, 'invalid-evidence'),
    };
  });
}

function admitCandidate(value: unknown): JsonRecord {
  const input = record(value, 'invalid-candidate');
  exactKeys(input, CANDIDATE_KEYS, 'invalid-candidate');
  if (input.fixtureId !== FIXTURE_ID || input.fixtureRevision !== FIXTURE_REVISION) fail('invalid-candidate');
  for (const key of CANDIDATE_KEYS.filter((key) => key.endsWith('Sha256'))) sha(input[key], 'invalid-candidate');
  if (input.testCommandSha256 !== hashProviderParityAttestationValue(['node', '--test', 'test/report.test.js'])) fail('invalid-candidate');
  if (!['passed', 'failed'].includes(input.state as string) || !['posix-mode-v1', 'windows-node-kind-v1'].includes(input.permissionRule as string)) fail('invalid-candidate');
  if (input.processCallCount !== 0 && input.processCallCount !== 1) fail('invalid-candidate');
  boolean(input.mutationDetected, 'invalid-candidate');
  if (nonNegative(input.fileCount, true, 'invalid-candidate') > 7 || nonNegative(input.totalBytes, true, 'invalid-candidate') > 4_194_304) fail('invalid-candidate');
  const violationRecord = record(input.violations, 'invalid-candidate');
  exactKeys(violationRecord, CANDIDATE_VIOLATION_KEYS, 'invalid-candidate');
  for (const key of CANDIDATE_VIOLATION_KEYS) boolean(violationRecord[key], 'invalid-candidate');
  if (!Array.isArray(input.reasonCodes) || input.reasonCodes.some((reason) => !CANDIDATE_REASON_ORDER.includes(reason as typeof CANDIDATE_REASON_ORDER[number]))) fail('invalid-candidate');
  const expectedReasons = [
    ...(violationRecord.lockedPathEdit ? ['locked-path-edit'] : []),
    ...(violationRecord.undeclaredPath ? ['undeclared-path'] : []),
    ...(violationRecord.externalDependency ? ['external-dependency'] : []),
    ...(violationRecord.secretOrPathDisclosure ? ['secret-or-path-disclosure'] : []),
    ...(violationRecord.permissionWidening ? ['permission-widening'] : []),
  ];
  const trusted = record(input.trustedTest, 'invalid-candidate');
  exactKeys(trusted, TRUSTED_TEST_KEYS, 'invalid-candidate');
  if (!['not-run', 'passed', 'failed'].includes(trusted.status as string)) fail('invalid-candidate');
  if (trusted.exitCode !== null) nonNegative(trusted.exitCode, true, 'invalid-candidate');
  for (const key of ['timedOut', 'outputCapped', 'signaled', 'stderrPresent', 'processFailure'] as const) boolean(trusted[key], 'invalid-candidate');
  nonNegative(trusted.outputBytes, true, 'invalid-candidate');
  nonNegative(trusted.durationMs, false, 'invalid-candidate');
  sha(trusted.evidenceSha256, 'invalid-candidate');
  if (trusted.status === 'failed') expectedReasons.push('trusted-test-failed');
  if (input.mutationDetected) expectedReasons.push('candidate-mutated');
  if (JSON.stringify(input.reasonCodes) !== JSON.stringify(expectedReasons)) fail('invalid-candidate');
  const passed = input.state === 'passed';
  const trustedPassed = trusted.status === 'passed' && trusted.exitCode === 0 && trusted.timedOut === false &&
    trusted.outputCapped === false && trusted.signaled === false && trusted.stderrPresent === false &&
    trusted.processFailure === false && input.processCallCount === 1;
  const trustedNotRun = trusted.status === 'not-run' && trusted.exitCode === null && trusted.timedOut === false &&
    trusted.outputCapped === false && trusted.signaled === false && trusted.stderrPresent === false &&
    trusted.processFailure === false && trusted.outputBytes === 0 && trusted.durationMs === 0 && input.processCallCount === 0;
  const trustedFailed = trusted.status === 'failed' && input.processCallCount === 1 && (
    (trusted.exitCode !== null && trusted.exitCode !== 0) || trusted.timedOut === true ||
    trusted.outputCapped === true || trusted.signaled === true || trusted.stderrPresent === true ||
    trusted.processFailure === true
  );
  if ((trusted.status === 'passed' && !trustedPassed) || (trusted.status === 'not-run' && !trustedNotRun) ||
      (trusted.status === 'failed' && !trustedFailed)) fail('invalid-candidate');
  if (input.candidateTreeSha256 !== input.postTestTreeSha256 ||
      input.mutationDetected !== (input.preTestTreeSha256 !== input.postTestTreeSha256)) fail('invalid-candidate');
  if (passed !== (expectedReasons.length === 0 && trusted.status === 'passed') ||
      (passed && (!trustedPassed || input.preTestTreeSha256 !== input.postTestTreeSha256))) fail('invalid-candidate');
  const { verificationEvidenceSha256, ...withoutHash } = input;
  if (verificationEvidenceSha256 !== hashProviderParityAttestationValue(withoutHash)) fail('invalid-candidate');
  return deepFreeze(clone(input));
}

function admitCleanup(value: unknown, identity: ProviderParityEvidenceIdentity): { state: 'cleaned' | 'failed'; evidenceSha256: string } {
  const input = record(value, 'invalid-cleanup');
  if (input.state === 'cleaned') {
    exactKeys(input, CLEANUP_SUCCESS_KEYS, 'invalid-cleanup');
    if (input.fixtureId !== FIXTURE_ID || input.fixtureRevision !== FIXTURE_REVISION ||
        input.materializedTreeSha256 !== identity.materializedTreeSha256 || input.zeroResidue !== true) fail('invalid-cleanup');
    nonNegative(input.removedNodeCount, true, 'invalid-cleanup');
    return { state: 'cleaned', evidenceSha256: hashProviderParityAttestationValue(input) };
  }
  exactKeys(input, CLEANUP_FAILURE_KEYS, 'invalid-cleanup');
  if (input.state !== 'failed' || input.fixtureId !== FIXTURE_ID || input.fixtureRevision !== FIXTURE_REVISION ||
      input.materializedTreeSha256 !== identity.materializedTreeSha256) fail('invalid-cleanup');
  return { state: 'failed', evidenceSha256: sha(input.failureEvidenceSha256, 'invalid-cleanup') };
}

function admitMetrics(value: unknown): ProviderParityMetricEvidence {
  const input = record(value, 'invalid-metrics');
  exactKeys(input, METRIC_KEYS, 'invalid-metrics');
  const durationMs = input.durationMs === null ? null : nonNegative(input.durationMs, false, 'invalid-metrics');
  if ((durationMs === null) !== (input.durationSource === 'unavailable') || (durationMs !== null && input.durationSource !== 'trusted-runner')) fail('invalid-metrics');
  const tokens = ['inputTokens', 'outputTokens', 'cacheTokens'].map((key) => input[key] === null ? null : nonNegative(input[key], true, 'invalid-metrics'));
  const tokenAbsent = tokens.every((entry) => entry === null);
  if ((!tokenAbsent && tokens.some((entry) => entry === null)) || (tokenAbsent ? input.tokenSource !== 'unavailable' : input.tokenSource !== 'provider')) fail('invalid-metrics');
  if (input.pricingStatus === 'priced') {
    if (tokenAbsent || (input.costSource !== 'provider' && input.costSource !== 'trusted-runner')) fail('invalid-metrics');
    sha(input.priceBasisSha256, 'invalid-metrics');
    nonNegative(input.costUsd, false, 'invalid-metrics');
  } else if (input.pricingStatus !== 'unpriced' || input.priceBasisSha256 !== null || input.costUsd !== null || input.costSource !== 'unavailable') fail('invalid-metrics');
  return deepFreeze(clone(input)) as unknown as ProviderParityMetricEvidence;
}

export function createProviderParityEvidenceAttestation(value: unknown): ProviderParityEvidenceAttestation {
  inspectPlain(value, 'invalid-input');
  const input = record(value, 'invalid-input');
  exactKeys(input, EVIDENCE_INPUT_KEYS, 'invalid-input');
  if (input.schemaVersion !== PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION) fail('invalid-input');
  const policy = admitPolicy(input.policyAttestation);
  const identity = admitIdentity(input.identity, policy);
  const acceptanceCriteria = decisions(input.acceptanceCriteria, PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA, 'invalid-evidence');
  const artifacts = decisions(input.artifacts, PROVIDER_PARITY_ATTESTATION_ARTIFACTS, 'invalid-evidence');
  const gateEvidence = gates(input.gates);
  const apiInput = record(input.apiContract, 'invalid-evidence');
  exactKeys(apiInput, API_KEYS, 'invalid-evidence');
  const apiContract = { conserved: boolean(apiInput.conserved, 'invalid-evidence'), evidenceSha256: sha(apiInput.evidenceSha256, 'invalid-evidence') };
  const candidate = admitCandidate(input.candidateVerification);
  const cleanup = admitCleanup(input.cleanup, identity);
  const metrics = admitMetrics(input.metrics);
  const distinctEvidence = [
    ...acceptanceCriteria.map((entry) => entry.evidenceSha256),
    ...artifacts.map((entry) => entry.evidenceSha256),
    ...gateEvidence.map((entry) => entry.evidenceSha256), apiContract.evidenceSha256,
  ];
  if (new Set(distinctEvidence).size !== distinctEvidence.length) fail('invalid-evidence');
  const trusted = candidate.trustedTest as JsonRecord;
  const candidateSummary = {
    state: candidate.state as 'passed' | 'failed',
    candidateTreeSha256: candidate.candidateTreeSha256 as string,
    verificationEvidenceSha256: candidate.verificationEvidenceSha256 as string,
    trustedTest: {
      status: trusted.status as 'not-run' | 'passed' | 'failed',
      exitCode: trusted.exitCode as number | null,
      evidenceSha256: trusted.evidenceSha256 as string,
    },
    violations: clone(candidate.violations) as ProviderParityEvidenceAttestation['candidateVerification']['violations'],
    reasonCodes: clone(candidate.reasonCodes) as readonly string[],
    mutationDetected: candidate.mutationDetected as boolean,
  };
  const eligible = acceptanceCriteria.every((entry) => entry.satisfied) && artifacts.every((entry) => entry.satisfied) &&
    gateEvidence.every((entry) => entry.conserved) && apiContract.conserved && candidateSummary.state === 'passed' &&
    candidateSummary.trustedTest.status === 'passed' && candidateSummary.trustedTest.exitCode === 0 &&
    Object.values(candidateSummary.violations).every((entry) => entry === false) && !candidateSummary.mutationDetected && cleanup.state === 'cleaned';
  const partial = {
    schemaVersion: PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION,
    policyAttestation: policy,
    policyAttestationSha256: policy.policyAttestationSha256,
    identity, acceptanceCriteria, artifacts, gates: gateEvidence, apiContract,
    candidateVerification: candidateSummary,
    cleanup, cleanupFailed: cleanup.state === 'failed', metrics,
    eligibleForA2Composition: eligible,
  };
  const receipt = { ...partial, evidenceAttestationSha256: hashProviderParityAttestationValue(partial) };
  const frozen = deepFreeze(clone(receipt));
  const check = frozen as unknown as JsonRecord;
  exactKeys(check, EVIDENCE_RECEIPT_KEYS, 'invalid-evidence');
  return frozen;
}

function admitCandidateSummary(value: unknown): ProviderParityEvidenceAttestation['candidateVerification'] {
  const input = record(value, 'invalid-candidate');
  exactKeys(input, CANDIDATE_SUMMARY_KEYS, 'invalid-candidate');
  if (input.state !== 'passed' && input.state !== 'failed') fail('invalid-candidate');
  const trusted = record(input.trustedTest, 'invalid-candidate');
  exactKeys(trusted, TRUSTED_SUMMARY_KEYS, 'invalid-candidate');
  if (!['not-run', 'passed', 'failed'].includes(trusted.status as string)) fail('invalid-candidate');
  if (trusted.exitCode !== null) nonNegative(trusted.exitCode, true, 'invalid-candidate');
  sha(trusted.evidenceSha256, 'invalid-candidate');
  const violations = record(input.violations, 'invalid-candidate');
  exactKeys(violations, CANDIDATE_VIOLATION_KEYS, 'invalid-candidate');
  for (const key of CANDIDATE_VIOLATION_KEYS) boolean(violations[key], 'invalid-candidate');
  const mutationDetected = boolean(input.mutationDetected, 'invalid-candidate');
  const expectedReasons = [
    ...(violations.lockedPathEdit ? ['locked-path-edit'] : []),
    ...(violations.undeclaredPath ? ['undeclared-path'] : []),
    ...(violations.externalDependency ? ['external-dependency'] : []),
    ...(violations.secretOrPathDisclosure ? ['secret-or-path-disclosure'] : []),
    ...(violations.permissionWidening ? ['permission-widening'] : []),
    ...(trusted.status === 'failed' ? ['trusted-test-failed'] : []),
    ...(mutationDetected ? ['candidate-mutated'] : []),
  ];
  if (!Array.isArray(input.reasonCodes) || JSON.stringify(input.reasonCodes) !== JSON.stringify(expectedReasons) ||
      (trusted.status === 'not-run' && expectedReasons.length === 0)) fail('invalid-candidate');
  const passed = input.state === 'passed' && trusted.status === 'passed' && trusted.exitCode === 0 &&
    Object.values(violations).every((entry) => entry === false) && !mutationDetected;
  if ((input.state === 'passed') !== passed) fail('invalid-candidate');
  return deepFreeze(clone({
    state: input.state, candidateTreeSha256: sha(input.candidateTreeSha256, 'invalid-candidate'),
    verificationEvidenceSha256: sha(input.verificationEvidenceSha256, 'invalid-candidate'),
    trustedTest: trusted, violations, reasonCodes: input.reasonCodes, mutationDetected,
  })) as unknown as ProviderParityEvidenceAttestation['candidateVerification'];
}

/** Re-admit one durable A3B3A receipt before later A3B3B composition. */
export function admitProviderParityEvidenceAttestation(value: unknown): ProviderParityEvidenceAttestation {
  inspectPlain(value, 'invalid-input');
  const input = record(value, 'invalid-input');
  exactKeys(input, EVIDENCE_RECEIPT_KEYS, 'invalid-input');
  if (input.schemaVersion !== PROVIDER_PARITY_ATTESTATION_SCHEMA_VERSION) fail('invalid-input');
  const policy = admitPolicy(input.policyAttestation);
  if (input.policyAttestationSha256 !== policy.policyAttestationSha256) fail('invalid-policy');
  const identity = admitIdentity(input.identity, policy);
  const acceptanceCriteria = decisions(input.acceptanceCriteria, PROVIDER_PARITY_ATTESTATION_ACCEPTANCE_CRITERIA, 'invalid-evidence');
  const artifacts = decisions(input.artifacts, PROVIDER_PARITY_ATTESTATION_ARTIFACTS, 'invalid-evidence');
  const gateEvidence = gates(input.gates);
  const apiInput = record(input.apiContract, 'invalid-evidence');
  exactKeys(apiInput, API_KEYS, 'invalid-evidence');
  const apiContract = { conserved: boolean(apiInput.conserved, 'invalid-evidence'), evidenceSha256: sha(apiInput.evidenceSha256, 'invalid-evidence') };
  const distinctEvidence = [
    ...acceptanceCriteria.map((entry) => entry.evidenceSha256),
    ...artifacts.map((entry) => entry.evidenceSha256),
    ...gateEvidence.map((entry) => entry.evidenceSha256), apiContract.evidenceSha256,
  ];
  if (new Set(distinctEvidence).size !== distinctEvidence.length) fail('invalid-evidence');
  const candidateVerification = admitCandidateSummary(input.candidateVerification);
  const cleanupInput = record(input.cleanup, 'invalid-cleanup');
  exactKeys(cleanupInput, CLEANUP_SUMMARY_KEYS, 'invalid-cleanup');
  if (cleanupInput.state !== 'cleaned' && cleanupInput.state !== 'failed') fail('invalid-cleanup');
  const cleanup = { state: cleanupInput.state, evidenceSha256: sha(cleanupInput.evidenceSha256, 'invalid-cleanup') } as const;
  const cleanupFailed = boolean(input.cleanupFailed, 'invalid-cleanup');
  if (cleanupFailed !== (cleanup.state === 'failed')) fail('invalid-cleanup');
  const metrics = admitMetrics(input.metrics);
  const eligible = acceptanceCriteria.every((entry) => entry.satisfied) && artifacts.every((entry) => entry.satisfied) &&
    gateEvidence.every((entry) => entry.conserved) && apiContract.conserved && candidateVerification.state === 'passed' &&
    cleanup.state === 'cleaned';
  if (input.eligibleForA2Composition !== eligible) fail('invalid-evidence');
  const { evidenceAttestationSha256, ...withoutHash } = input;
  if (evidenceAttestationSha256 !== hashProviderParityAttestationValue(withoutHash)) fail('invalid-evidence');
  return deepFreeze(clone({ ...withoutHash, evidenceAttestationSha256 })) as unknown as ProviderParityEvidenceAttestation;
}
