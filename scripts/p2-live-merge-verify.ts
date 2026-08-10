#!/usr/bin/env node
/** Deterministic verifier for the operator-captured P2 live merge evidence. */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  verifyFinalMerge,
  type AgentHandoff,
  type EvidenceVerifier,
  type LeaseLedger,
  type RoleAgent,
  type RoleDag,
} from '../.claude/integrations/multi-agent-orchestration';
import { verifyBackendBoundBundle } from '../.claude/integrations/evidence-bundle';

const RESULT_SENTINEL = '@@P2_LIVE_MERGE_RESULT@@';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ROLES = ['dev', 'design', 'ui', 'figma'] as const;
const TOP_KEYS = ['schemaVersion', 'capturedAt', 'runId', 'planHash', 'predecessor', 'expectedOutput', 'roles'];
const PREDECESSOR_KEYS = ['featureName', 'phase', 'manifestHash', 'bindingHash'];
const ROLE_KEYS = [
  'taskId', 'role', 'commandRunId', 'status', 'agentMessage', 'agentMessageCount',
  'logTailSha256', 'inputTokens', 'cacheReadTokens', 'outputTokens', 'reasoningOutputTokens',
  'usageSource', 'usageStatus', 'pricingStatus',
];

type LiveRole = {
  taskId: string; role: RoleAgent; commandRunId: string; status: 'passed';
  agentMessage: string; agentMessageCount: 1; logTailSha256: string;
  inputTokens: number; cacheReadTokens: number; outputTokens: number; reasoningOutputTokens: number;
  usageSource: 'codex_exec_jsonl'; usageStatus: 'captured'; pricingStatus: 'unpriced';
};
type LiveEvidence = {
  schemaVersion: 1; capturedAt: string; runId: string; planHash: string;
  predecessor: { featureName: string; phase: string; manifestHash: string; bindingHash: string };
  expectedOutput: string; roles: LiveRole[];
};

export type P2LiveMergeResult = {
  passed: boolean; reason?: string; roleCount: number; evidenceHash?: string;
  mergedOutputHash?: string; gate?: { passed: boolean; detail: string };
};

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseEvidence(value: unknown): LiveEvidence | null {
  if (!exact(value, TOP_KEYS) || value.schemaVersion !== 1 || typeof value.capturedAt !== 'string'
    || new Date(value.capturedAt).toISOString() !== value.capturedAt || typeof value.runId !== 'string'
    || !UUID.test(value.runId) || typeof value.planHash !== 'string' || !HASH.test(value.planHash)
    || typeof value.expectedOutput !== 'string' || !value.expectedOutput.trim()
    || !exact(value.predecessor, PREDECESSOR_KEYS) || !Array.isArray(value.roles) || value.roles.length !== 4) return null;
  const predecessor = value.predecessor as Record<string, unknown>;
  if (typeof predecessor.featureName !== 'string' || !predecessor.featureName.trim()
    || typeof predecessor.phase !== 'string' || !predecessor.phase.trim()
    || typeof predecessor.manifestHash !== 'string' || !HASH.test(predecessor.manifestHash)
    || typeof predecessor.bindingHash !== 'string' || !HASH.test(predecessor.bindingHash)) return null;
  const seenRoles = new Set<string>();
  const seenTasks = new Set<string>();
  const seenRuns = new Set<string>();
  for (const candidate of value.roles) {
    if (!exact(candidate, ROLE_KEYS)) return null;
    const role = candidate as Record<string, unknown>;
    if (typeof role.role !== 'string' || !ROLES.includes(role.role as RoleAgent)
      || role.taskId !== `task-${role.role}` || typeof role.commandRunId !== 'string' || !UUID.test(role.commandRunId)
      || role.status !== 'passed' || role.agentMessage !== value.expectedOutput || role.agentMessageCount !== 1
      || typeof role.logTailSha256 !== 'string' || !HASH.test(role.logTailSha256)
      || !nonNegativeSafeInteger(role.inputTokens) || !nonNegativeSafeInteger(role.cacheReadTokens)
      || !nonNegativeSafeInteger(role.outputTokens) || !nonNegativeSafeInteger(role.reasoningOutputTokens)
      || (role.cacheReadTokens as number) > (role.inputTokens as number)
      || role.usageSource !== 'codex_exec_jsonl' || role.usageStatus !== 'captured' || role.pricingStatus !== 'unpriced'
      || seenRoles.has(role.role) || seenTasks.has(role.taskId as string) || seenRuns.has(role.commandRunId)) return null;
    seenRoles.add(role.role); seenTasks.add(role.taskId as string); seenRuns.add(role.commandRunId);
  }
  if (ROLES.some(role => !seenRoles.has(role))) return null;
  return value as unknown as LiveEvidence;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function verifyP2LiveMergeEvidence(value: unknown, cwd = process.cwd()): Promise<P2LiveMergeResult> {
  let evidence: LiveEvidence | null = null;
  try { evidence = parseEvidence(value); } catch { evidence = null; }
  if (!evidence) return { passed: false, reason: 'evidence-invalid', roleCount: 0 };
  const expectedOutputHash = sha256(evidence.expectedOutput);
  const strict = verifyBackendBoundBundle(evidence.predecessor.featureName, evidence.predecessor.phase, cwd);
  const transcriptFiles = strict.bundle.manifest?.files.filter(file => file.role === 'transcript') ?? [];
  if (!strict.valid || strict.bundle.manifest?.manifestHash !== evidence.predecessor.manifestHash
    || strict.backendBinding?.bindingHash !== evidence.predecessor.bindingHash
    || transcriptFiles.length !== 1 || transcriptFiles[0].sha256 !== expectedOutputHash) {
    return { passed: false, reason: 'predecessor-invalid', roleCount: evidence.roles.length };
  }
  const ordered = ROLES.map(role => evidence!.roles.find(item => item.role === role)!);
  const nowMs = Date.parse(evidence.capturedAt);
  const dag: RoleDag = {
    contractHash: evidence.planHash,
    tasks: ordered.map(item => ({ id: item.taskId, role: item.role, dependsOn: [], evidencePhase: evidence!.predecessor.phase, contextBudgetTokens: 1_000_000, timeoutMs: 180_000 })),
  };
  const active = Object.fromEntries(ordered.map(item => [item.taskId, {
    leaseId: `lease-${item.role}`, taskId: item.taskId, ownerId: item.commandRunId,
    issuedAtMs: nowMs, expiresAtMs: nowMs + 180_000,
  }]));
  const ledger: LeaseLedger = { active };
  const handoffs: AgentHandoff[] = ordered.map(item => ({
    taskId: item.taskId, role: item.role, agentId: item.commandRunId, leaseId: `lease-${item.role}`,
    featureName: evidence!.predecessor.featureName, phase: evidence!.predecessor.phase,
    contractHash: evidence!.planHash, contextTokens: item.inputTokens, passClaim: true, requireBackendBinding: true,
  }));
  const verifier: EvidenceVerifier = {
    verify(request) {
      return { valid: request.featureName === evidence!.predecessor.featureName
        && request.phase === evidence!.predecessor.phase && request.requireBackendBinding === true && strict.valid };
    },
  };
  const mergedOutput = evidence.expectedOutput;
  const evidenceHash = sha256(JSON.stringify(evidence));
  const mergedOutputHash = expectedOutputHash;
  let decision;
  try {
    decision = await verifyFinalMerge({
      dag, ledger, handoffs, nowMs, evidenceVerifier: verifier,
      expectedFeatureName: evidence.predecessor.featureName, mergedOutput,
      finalGate: async output => ({ passed: output === evidence!.expectedOutput, detail: 'fixed-output equality gate' }),
    });
  } catch {
    return { passed: false, reason: 'merge-rejected', roleCount: ordered.length, evidenceHash, mergedOutputHash };
  }
  return decision.passed
    ? { passed: true, roleCount: ordered.length, evidenceHash, mergedOutputHash, gate: decision.gate }
    : { passed: false, reason: decision.reason ?? 'merge-rejected', roleCount: ordered.length, evidenceHash, mergedOutputHash, gate: decision.gate };
}

async function main(): Promise<void> {
  const cwd = path.resolve(__dirname, '..');
  const evidenceRoot = path.join(cwd, 'docs', 'evidence');
  const target = path.resolve(process.argv[2] ?? path.join(evidenceRoot, 'p2-live-merge-2026-08-10.json'));
  if (process.argv.length > 3 || (target !== evidenceRoot && !target.startsWith(evidenceRoot + path.sep))) throw new Error('evidence path refused');
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 1_048_576) throw new Error('evidence file refused');
  const result = await verifyP2LiveMergeEvidence(JSON.parse(fs.readFileSync(target, 'utf8')), cwd);
  process.stdout.write(`${RESULT_SENTINEL}${JSON.stringify({ schemaVersion: 1, ...result })}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`P2 live merge verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
