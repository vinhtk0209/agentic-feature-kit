#!/usr/bin/env node
/** Build and verify the durable I2 live Codex identity/usage evidence bundle. */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  buildBundle,
  verifyBackendBoundBundle,
  type EvidenceManifest,
} from '../.claude/integrations/evidence-bundle';
import type { EvidenceBackendBinding } from '../.claude/integrations/multi-provider-backends';
import {
  exactI2CodexLiveGate,
  I2_CODEX_LIVE_OK,
  I2_CODEX_LIVE_PROMPT,
} from './i2-codex-live-smoke';

export const I2_LIVE_RESULT_SENTINEL = '@@I2_LIVE_EVIDENCE_RESULT@@';
export const I2_LIVE_FEATURE = 'i2-codex-live-completion';
export const I2_LIVE_PHASE = 'B0';
export const I2_LIVE_EVIDENCE_PATH = 'docs/evidence/i2-live-completion-2026-08-10.json';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TOP_KEYS = ['schemaVersion', 'capturedAt', 'prompt', 'expectedOutput', 'cliVersion', 'sourceBundle', 'commandRun', 'tokenUsage'];
const SOURCE_KEYS = ['featureName', 'phase', 'manifestHash', 'bindingHash'];
const RUN_KEYS = ['id', 'runner', 'model', 'status', 'startedAt', 'endedAt', 'exitCode', 'logTailSha256', 'logTailBytes', 'exactOutputOccurrences'];
const USAGE_KEYS = ['runId', 'inputTokens', 'cacheReadTokens', 'outputTokens', 'reasoningOutputTokens', 'costEstUsd', 'usageSource', 'usageStatus', 'usageError', 'completionCount', 'pricingStatus', 'pricingSnapshot', 'usageObservedAt'];

type I2LiveReceipt = {
  schemaVersion: 1;
  capturedAt: string;
  prompt: string;
  expectedOutput: string;
  cliVersion: string;
  sourceBundle: { featureName: string; phase: string; manifestHash: string; bindingHash: string };
  commandRun: {
    id: string; runner: 'codex'; model: string; status: 'passed'; startedAt: string; endedAt: string;
    exitCode: 0; logTailSha256: string; logTailBytes: number; exactOutputOccurrences: 1;
  };
  tokenUsage: {
    runId: string; inputTokens: number; cacheReadTokens: number; outputTokens: number;
    reasoningOutputTokens: number; costEstUsd: null; usageSource: 'codex_exec_jsonl';
    usageStatus: 'captured'; usageError: null; completionCount: 1; pricingStatus: 'unpriced';
    pricingSnapshot: null; usageObservedAt: string;
  };
};

export type I2LiveEvidenceResult = {
  passed: boolean;
  reason?: string;
  evidenceHash?: string;
  manifestHash?: string;
  bindingHash?: string;
  commandRunId?: string;
  inputTokens?: number;
  outputTokens?: number;
  pricingStatus?: 'unpriced';
};

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function parseReceipt(value: unknown): I2LiveReceipt | null {
  if (!exact(value, TOP_KEYS) || value.schemaVersion !== 1 || !canonicalTimestamp(value.capturedAt)
    || value.prompt !== I2_CODEX_LIVE_PROMPT || value.expectedOutput !== I2_CODEX_LIVE_OK
    || typeof value.cliVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.cliVersion)
    || !exact(value.sourceBundle, SOURCE_KEYS) || !exact(value.commandRun, RUN_KEYS)
    || !exact(value.tokenUsage, USAGE_KEYS)) return null;
  const source = value.sourceBundle as Record<string, unknown>;
  const run = value.commandRun as Record<string, unknown>;
  const usage = value.tokenUsage as Record<string, unknown>;
  if (source.featureName !== 'i2-codex-live-smoke' || source.phase !== 'B0'
    || typeof source.manifestHash !== 'string' || !HASH.test(source.manifestHash)
    || typeof source.bindingHash !== 'string' || !HASH.test(source.bindingHash)
    || typeof run.id !== 'string' || !UUID.test(run.id) || run.runner !== 'codex'
    || typeof run.model !== 'string' || !run.model.trim() || run.status !== 'passed'
    || !canonicalTimestamp(run.startedAt) || !canonicalTimestamp(run.endedAt)
    || Date.parse(run.startedAt) >= Date.parse(run.endedAt) || Date.parse(run.endedAt) > Date.parse(value.capturedAt as string)
    || run.exitCode !== 0 || typeof run.logTailSha256 !== 'string' || !HASH.test(run.logTailSha256)
    || !safeInteger(run.logTailBytes, 1) || run.exactOutputOccurrences !== 1
    || usage.runId !== run.id || !safeInteger(usage.inputTokens) || !safeInteger(usage.cacheReadTokens)
    || !safeInteger(usage.outputTokens) || !safeInteger(usage.reasoningOutputTokens)
    || (usage.cacheReadTokens as number) > (usage.inputTokens as number) || usage.costEstUsd !== null
    || usage.usageSource !== 'codex_exec_jsonl' || usage.usageStatus !== 'captured'
    || usage.usageError !== null || usage.completionCount !== 1 || usage.pricingStatus !== 'unpriced'
    || usage.pricingSnapshot !== null || !canonicalTimestamp(usage.usageObservedAt)
    || usage.usageObservedAt !== run.endedAt) return null;
  return value as unknown as I2LiveReceipt;
}

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function bindingHasHonestUnknownCost(binding: EvidenceBackendBinding, receipt: I2LiveReceipt): boolean {
  return binding.identity.provider === 'codex'
    && binding.identity.modelId === receipt.commandRun.model
    && binding.cost.status === 'unknown'
    && binding.cost.inputTokens === null
    && binding.cost.outputTokens === null
    && binding.cost.costUsd === null
    && receipt.tokenUsage.costEstUsd === null
    && receipt.tokenUsage.pricingStatus === 'unpriced'
    && receipt.tokenUsage.pricingSnapshot === null;
}

function readReceipt(cwd: string): unknown {
  const target = path.join(cwd, ...I2_LIVE_EVIDENCE_PATH.split('/'));
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 1_048_576) throw new Error('I2 live evidence file refused');
  return JSON.parse(fs.readFileSync(target, 'utf8')) as unknown;
}

export async function verifyI2LiveEvidence(value: unknown, cwd = process.cwd()): Promise<I2LiveEvidenceResult> {
  let receipt: I2LiveReceipt | null = null;
  try { receipt = parseReceipt(value); } catch { receipt = null; }
  if (!receipt) return { passed: false, reason: 'receipt-invalid' };
  const gate = await exactI2CodexLiveGate(receipt.expectedOutput);
  if (!gate.passed) return { passed: false, reason: 'shared-gate-rejected' };

  const source = verifyBackendBoundBundle(receipt.sourceBundle.featureName, receipt.sourceBundle.phase, cwd);
  if (!source.valid || !source.backendBinding || source.bundle.manifest?.manifestHash !== receipt.sourceBundle.manifestHash
    || source.backendBinding.bindingHash !== receipt.sourceBundle.bindingHash
    || !bindingHasHonestUnknownCost(source.backendBinding, receipt)) {
    return { passed: false, reason: 'source-bundle-invalid' };
  }

  const completion = verifyBackendBoundBundle(I2_LIVE_FEATURE, I2_LIVE_PHASE, cwd);
  if (!completion.valid || !completion.backendBinding || completion.backendBinding.bindingHash !== receipt.sourceBundle.bindingHash
    || !bindingHasHonestUnknownCost(completion.backendBinding, receipt)) {
    return { passed: false, reason: 'completion-bundle-invalid' };
  }
  const files = completion.bundle.manifest?.files ?? [];
  const receiptFiles = files.filter(file => file.path === I2_LIVE_EVIDENCE_PATH || file.role === 'output');
  const transcriptFiles = files.filter(file => file.role === 'transcript');
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  const outputBytes = Buffer.from(receipt.expectedOutput, 'utf8');
  if (files.length !== 3 || receiptFiles.length !== 1 || receiptFiles[0].role !== 'output'
    || receiptFiles[0].path !== I2_LIVE_EVIDENCE_PATH || receiptFiles[0].sha256 !== hash(receiptBytes)
    || receiptFiles[0].bytes !== receiptBytes.length || transcriptFiles.length !== 1
    || transcriptFiles[0].sha256 !== hash(outputBytes) || transcriptFiles[0].bytes !== outputBytes.length) {
    return { passed: false, reason: 'completion-files-invalid' };
  }
  return {
    passed: true,
    evidenceHash: hash(receiptBytes),
    manifestHash: completion.bundle.manifest?.manifestHash,
    bindingHash: completion.backendBinding.bindingHash,
    commandRunId: receipt.commandRun.id,
    inputTokens: receipt.tokenUsage.inputTokens,
    outputTokens: receipt.tokenUsage.outputTokens,
    pricingStatus: receipt.tokenUsage.pricingStatus,
  };
}

export async function buildI2LiveEvidenceBundle(cwd = process.cwd()): Promise<EvidenceManifest> {
  const receipt = parseReceipt(readReceipt(cwd));
  if (!receipt) throw new Error('I2 live receipt is invalid');
  const source = verifyBackendBoundBundle(receipt.sourceBundle.featureName, receipt.sourceBundle.phase, cwd);
  if (!source.valid || !source.backendBinding || source.bundle.manifest?.manifestHash !== receipt.sourceBundle.manifestHash
    || source.backendBinding.bindingHash !== receipt.sourceBundle.bindingHash
    || !bindingHasHonestUnknownCost(source.backendBinding, receipt)) throw new Error('I2 source bundle is invalid');
  const gate = await exactI2CodexLiveGate(receipt.expectedOutput);
  if (!gate.passed) throw new Error('I2 shared gate rejected live output');
  return buildBundle({
    featureName: I2_LIVE_FEATURE,
    phase: I2_LIVE_PHASE,
    cwd,
    outputs: [I2_LIVE_EVIDENCE_PATH],
    transcripts: { 'codex-live-shared-gate': receipt.expectedOutput },
    backendBinding: source.backendBinding,
  });
}

async function main(): Promise<void> {
  const cwd = path.resolve(__dirname, '..');
  const mode = process.argv[2] ?? 'verify';
  if (!['build', 'verify'].includes(mode) || process.argv.length > 3) throw new Error('usage: i2-live-evidence-verify.ts [build|verify]');
  if (mode === 'build') await buildI2LiveEvidenceBundle(cwd);
  const result = await verifyI2LiveEvidence(readReceipt(cwd), cwd);
  process.stdout.write(`${I2_LIVE_RESULT_SENTINEL}${JSON.stringify({ schemaVersion: 1, ...result })}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`I2 live evidence verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
