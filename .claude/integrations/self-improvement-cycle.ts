#!/usr/bin/env node
/**
 * Provenance-gated 6F N→N+1 cycle registry.
 *
 * The registry records one honest before/after measurement without turning a
 * single case into a population claim. It is suggest-only: an improvement is
 * verified, a regression is retained as rolled_back, and an unchanged metric
 * remains staged. No prompt file is mutated by this module.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export type CycleStatus = 'verified' | 'rolled_back' | 'staged';

export interface VerifiedRunEvidence {
  runnerRunId: string;
  headSha: string;
  feature: string;
  taskType: string;
  phase: string;
  kitVersion: string;
  tierAExit: number;
  tierBExit: number;
  verified: boolean;
  contentHash: string;
  recordedAt: string;
}

export interface LessonCandidate {
  id: string;
  title: string;
  classification: 'automated_gate';
  rootCause: 'workflow_design_flaw';
  phase: string;
  taskType: string;
  kitVersion: string;
  generatedFromRunId: string;
  enforcedBy: string[];
  liveValidated: true;
  observedAt: string;
}

export interface SourceArtifact {
  ref: string;
  sha256: string;
}

export interface CycleProvenance {
  projectRef: string;
  snapshotSha256: string;
  verifiedGitNoteSha256: string;
  sourceArtifacts: SourceArtifact[];
  rows: [VerifiedRunEvidence, VerifiedRunEvidence];
}

export interface CycleInput {
  lesson: LessonCandidate;
  provenance: CycleProvenance;
}

export interface SelfImprovementCycle extends CycleInput {
  schemaVersion: 1;
  metric: {
    name: 'computed_verify_pass';
    before: 0 | 1;
    after: 0 | 1;
    delta: -1 | 0 | 1;
  };
  status: CycleStatus;
  rollbackRequired: boolean;
  previousCycleHash: string | null;
  cycleHash: string;
}

export interface SelfImprovementRegistry {
  schemaVersion: 1;
  cycles: SelfImprovementCycle[];
  registryHash: string;
}

export class SelfImprovementCycleError extends Error {
  constructor(message: string) {
    super(`self-improvement-cycle: ${message}`);
    this.name = 'SelfImprovementCycleError';
  }
}

const RUN_KEYS = ['contentHash', 'feature', 'headSha', 'kitVersion', 'phase', 'recordedAt', 'runnerRunId', 'taskType', 'tierAExit', 'tierBExit', 'verified'];
const LESSON_KEYS = ['classification', 'enforcedBy', 'generatedFromRunId', 'id', 'kitVersion', 'liveValidated', 'observedAt', 'phase', 'rootCause', 'taskType', 'title'];
const ARTIFACT_KEYS = ['ref', 'sha256'];
const PROVENANCE_KEYS = ['projectRef', 'rows', 'snapshotSha256', 'sourceArtifacts', 'verifiedGitNoteSha256'];
const INPUT_KEYS = ['lesson', 'provenance'];
const METRIC_KEYS = ['after', 'before', 'delta', 'name'];
const CYCLE_KEYS = ['cycleHash', 'lesson', 'metric', 'previousCycleHash', 'provenance', 'rollbackRequired', 'schemaVersion', 'status'];
const REGISTRY_KEYS = ['cycles', 'registryHash', 'schemaVersion'];

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, expected: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};
const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isCommitSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isCanonicalVersion = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/.test(value);
const isCanonicalTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value;
const isNonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function parseRun(value: unknown): VerifiedRunEvidence {
  if (!isRecord(value) || !exactKeys(value, RUN_KEYS)) throw new SelfImprovementCycleError('run evidence schema is malformed');
  if (!/^run-[A-Za-z0-9-]+$/.test(String(value.runnerRunId)) || !isCommitSha(value.headSha)
    || !isNonBlank(value.feature) || !isNonBlank(value.taskType) || !/^B(?:\d+(?:\.\d+)?|D-cross-2)$/.test(String(value.phase))
    || !isCanonicalVersion(value.kitVersion) || !Number.isSafeInteger(value.tierAExit) || !Number.isSafeInteger(value.tierBExit)
    || typeof value.verified !== 'boolean' || !isSha256(value.contentHash) || !isCanonicalTimestamp(value.recordedAt)) {
    throw new SelfImprovementCycleError('run evidence contains invalid values');
  }
  const computed = value.tierAExit === 0 && value.tierBExit === 0;
  if (value.verified !== computed) throw new SelfImprovementCycleError('run verified flag does not match computed tier exits');
  return value as unknown as VerifiedRunEvidence;
}

function parseLesson(value: unknown): LessonCandidate {
  if (!isRecord(value) || !exactKeys(value, LESSON_KEYS)) throw new SelfImprovementCycleError('lesson schema is malformed');
  const enforcement = value.enforcedBy;
  if (!/^L-\d{4}-\d{2}-\d{2}-\d{3}$/.test(String(value.id)) || !isNonBlank(value.title)
    || value.classification !== 'automated_gate' || value.rootCause !== 'workflow_design_flaw'
    || !/^B(?:\d+(?:\.\d+)?|D-cross-2)$/.test(String(value.phase)) || !isNonBlank(value.taskType)
    || !isCanonicalVersion(value.kitVersion) || !/^run-[A-Za-z0-9-]+$/.test(String(value.generatedFromRunId))
    || !Array.isArray(enforcement) || enforcement.length === 0 || enforcement.some((entry) => !isNonBlank(entry))
    || new Set(enforcement).size !== enforcement.length || value.liveValidated !== true || !isCanonicalTimestamp(value.observedAt)) {
    throw new SelfImprovementCycleError('lesson is unproven or malformed');
  }
  return value as unknown as LessonCandidate;
}

function parseArtifact(value: unknown): SourceArtifact {
  if (!isRecord(value) || !exactKeys(value, ARTIFACT_KEYS) || !isNonBlank(value.ref) || !isSha256(value.sha256)) {
    throw new SelfImprovementCycleError('source artifact provenance is malformed');
  }
  if (/(?:^|[:/\\])\.env(?:\.|$)|credential|password|private[_-]?key/i.test(value.ref)) {
    throw new SelfImprovementCycleError('source artifact provenance references a sensitive path');
  }
  return value as unknown as SourceArtifact;
}

function canonicalRows(rows: readonly VerifiedRunEvidence[]): string {
  return JSON.stringify(rows.map((row) => ({
    runnerRunId: row.runnerRunId,
    headSha: row.headSha,
    feature: row.feature,
    taskType: row.taskType,
    phase: row.phase,
    kitVersion: row.kitVersion,
    tierAExit: row.tierAExit,
    tierBExit: row.tierBExit,
    verified: row.verified,
    contentHash: row.contentHash,
    recordedAt: row.recordedAt,
  })));
}

function parseProvenance(value: unknown): CycleProvenance {
  if (!isRecord(value) || !exactKeys(value, PROVENANCE_KEYS) || !/^[a-z0-9]{20}$/.test(String(value.projectRef))
    || !isSha256(value.snapshotSha256) || !isSha256(value.verifiedGitNoteSha256)
    || !Array.isArray(value.sourceArtifacts) || value.sourceArtifacts.length < 2
    || !Array.isArray(value.rows) || value.rows.length !== 2) {
    throw new SelfImprovementCycleError('provenance schema is malformed');
  }
  const artifacts = value.sourceArtifacts.map(parseArtifact);
  if (new Set(artifacts.map((artifact) => artifact.ref)).size !== artifacts.length) {
    throw new SelfImprovementCycleError('source artifact provenance is duplicated');
  }
  const rows = value.rows.map(parseRun) as [VerifiedRunEvidence, VerifiedRunEvidence];
  if (sha256(canonicalRows(rows)) !== value.snapshotSha256) throw new SelfImprovementCycleError('verify-record snapshot hash mismatch');
  return { ...value, sourceArtifacts: artifacts, rows } as unknown as CycleProvenance;
}

function parseInput(value: unknown): CycleInput {
  if (!isRecord(value) || !exactKeys(value, INPUT_KEYS)) throw new SelfImprovementCycleError('cycle input schema is malformed');
  return { lesson: parseLesson(value.lesson), provenance: parseProvenance(value.provenance) };
}

function registryHash(cycles: readonly SelfImprovementCycle[]): string {
  return sha256(canonical({ schemaVersion: 1, cycleHashes: cycles.map((cycle) => cycle.cycleHash) }));
}

export function buildCycle(rawInput: unknown, previousCycleHash: string | null): SelfImprovementCycle {
  const input = parseInput(rawInput);
  if (previousCycleHash !== null && !isSha256(previousCycleHash)) throw new SelfImprovementCycleError('previous cycle hash is malformed');
  const [before, after] = input.provenance.rows;
  if (before.runnerRunId === after.runnerRunId || Date.parse(before.recordedAt) >= Date.parse(after.recordedAt)) {
    throw new SelfImprovementCycleError('N and N+1 ordering is invalid');
  }
  for (const field of ['headSha', 'feature', 'taskType', 'phase', 'kitVersion', 'contentHash'] as const) {
    if (before[field] !== after[field]) throw new SelfImprovementCycleError(`N and N+1 ${field} binding differs`);
  }
  const lesson = input.lesson;
  if (lesson.generatedFromRunId !== before.runnerRunId || lesson.phase !== before.phase
    || lesson.taskType !== before.taskType || lesson.kitVersion !== before.kitVersion
    || Date.parse(lesson.observedAt) < Date.parse(after.recordedAt)) {
    throw new SelfImprovementCycleError('lesson is not bound to the measured N→N+1 pair');
  }
  const metric = {
    name: 'computed_verify_pass' as const,
    before: (before.verified ? 1 : 0) as 0 | 1,
    after: (after.verified ? 1 : 0) as 0 | 1,
    delta: ((after.verified ? 1 : 0) - (before.verified ? 1 : 0)) as -1 | 0 | 1,
  };
  const status: CycleStatus = metric.delta > 0 ? 'verified' : metric.delta < 0 ? 'rolled_back' : 'staged';
  const withoutHash = {
    schemaVersion: 1 as const,
    lesson,
    provenance: input.provenance,
    metric,
    status,
    rollbackRequired: status === 'rolled_back',
    previousCycleHash,
  };
  return { ...withoutHash, cycleHash: sha256(canonical(withoutHash)) };
}

export function emptyRegistry(): SelfImprovementRegistry {
  return { schemaVersion: 1, cycles: [], registryHash: registryHash([]) };
}

export function verifyRegistry(raw: unknown): raw is SelfImprovementRegistry {
  if (!isRecord(raw) || !exactKeys(raw, REGISTRY_KEYS) || raw.schemaVersion !== 1
    || !Array.isArray(raw.cycles) || !isSha256(raw.registryHash)) return false;
  const seenLessons = new Set<string>();
  const seenPairs = new Set<string>();
  let previous: string | null = null;
  const cycles: SelfImprovementCycle[] = [];
  try {
    for (const candidate of raw.cycles) {
      if (!isRecord(candidate) || !exactKeys(candidate, CYCLE_KEYS) || candidate.schemaVersion !== 1
        || !isRecord(candidate.metric) || !exactKeys(candidate.metric, METRIC_KEYS)) return false;
      const rebuilt = buildCycle({ lesson: candidate.lesson, provenance: candidate.provenance }, previous);
      if (canonical(candidate) !== canonical(rebuilt)) return false;
      if (seenLessons.has(rebuilt.lesson.id)) return false;
      const pair = rebuilt.provenance.rows.map((row) => row.runnerRunId).join('\0');
      if (seenPairs.has(pair)) return false;
      seenLessons.add(rebuilt.lesson.id);
      seenPairs.add(pair);
      cycles.push(rebuilt);
      previous = rebuilt.cycleHash;
    }
  } catch {
    return false;
  }
  return raw.registryHash === registryHash(cycles);
}

export function admitCycle(rawRegistry: unknown, rawInput: unknown): SelfImprovementRegistry {
  if (!verifyRegistry(rawRegistry)) throw new SelfImprovementCycleError('registry hash chain is invalid');
  const input = parseInput(rawInput);
  if (rawRegistry.cycles.some((cycle) => cycle.lesson.id === input.lesson.id)) throw new SelfImprovementCycleError('duplicate lesson id');
  const pair = input.provenance.rows.map((row) => row.runnerRunId).join('\0');
  if (rawRegistry.cycles.some((cycle) => cycle.provenance.rows.map((row) => row.runnerRunId).join('\0') === pair)) {
    throw new SelfImprovementCycleError('duplicate N→N+1 evidence pair');
  }
  const previous = rawRegistry.cycles.length ? rawRegistry.cycles[rawRegistry.cycles.length - 1].cycleHash : null;
  const cycles = [...rawRegistry.cycles, buildCycle(input, previous)];
  return { schemaVersion: 1, cycles, registryHash: registryHash(cycles) };
}

export function readAndVerifyRegistry(registryPath: string): SelfImprovementRegistry {
  const resolved = path.resolve(registryPath);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
  if (!verifyRegistry(parsed)) throw new SelfImprovementCycleError('registry file failed validation');
  return parsed;
}

if (process.argv[1] && /self-improvement-cycle\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const [command, registryPath] = process.argv.slice(2);
  if (command !== 'verify' || !registryPath) {
    console.error('Usage: npx tsx .claude/integrations/self-improvement-cycle.ts verify <registry.json>');
    process.exit(2);
  }
  try {
    const registry = readAndVerifyRegistry(registryPath);
    console.log(JSON.stringify({ valid: true, cycles: registry.cycles.length, registryHash: registry.registryHash,
      statuses: registry.cycles.map((cycle) => ({ lessonId: cycle.lesson.id, status: cycle.status, metric: cycle.metric })) }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
