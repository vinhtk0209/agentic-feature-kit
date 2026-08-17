#!/usr/bin/env node
/**
 * lesson-registry.ts — Lesson enforcement tracker
 *
 * Parses `<!-- @lesson ... -->` HTML comment blocks from prompt-evolution.md
 * and reports enforced/pending/exempt lesson counts. Provides a --gate flag
 * that fails when unenforced HIGH-priority lessons exist.
 *
 * Annotation format (in prompt-evolution.md, immediately before the lesson prose):
 *   <!-- @lesson id="L-YYYY-MM-DD-NNN"
 *               classification="prompt_rule|validation_rule|automated_gate|regression_test|project_knowledge|temporary_observation|reject"
 *               priority="high|medium|low"
 *               root_cause="req_ambiguity|br_ambiguity|ui_ambiguity|api_uncertainty|contract_drift|ownership_confusion|missing_project_knowledge|missing_validation|hallucination|workflow_design_flaw"
 *               enforced_by="none|<script>[:check]"
 *               test_status="enforced|pending|exempt" -->
 *
 * Usage:
 *   npx tsx .claude/integrations/lesson-registry.ts
 *   npx tsx .claude/integrations/lesson-registry.ts --evolution-file path/to/file.md
 *   npx tsx .claude/integrations/lesson-registry.ts --summary
 *   npx tsx .claude/integrations/lesson-registry.ts --gate         (exits 1 if unenforced HIGH > 0)
 *   npx tsx .claude/integrations/lesson-registry.ts --json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LessonClassification =
  | 'prompt_rule'
  | 'validation_rule'
  | 'automated_gate'
  | 'regression_test'
  | 'project_knowledge'
  | 'temporary_observation'
  | 'reject';

export type LessonPriority = 'high' | 'medium' | 'low';

export type LessonTestStatus = 'enforced' | 'pending' | 'exempt';

export interface Lesson {
  id: string;
  classification: LessonClassification;
  priority: LessonPriority;
  rootCause: string;
  enforcedBy: string;
  testStatus: LessonTestStatus;
  /** Prose snippet immediately following the annotation (first 120 chars) */
  snippet: string;
  /** Optional authoritative O1 binding; legacy lessons remain unversioned. */
  kitVersion: string | null;
  observedAt: string | null;
  liveValidated: boolean | string | null;
  title: string;
}

export interface VersionScopedLesson {
  kitVersion: string;
  id: string;
  title: string;
  evidenceHash: string;
  observedAt: string;
}

export interface LessonReport {
  total: number;
  enforced: number;
  pending: number;
  exempt: number;
  unenforcedHigh: number;
  lessons: Lesson[];
  byStatus: Record<LessonTestStatus, Lesson[]>;
  byPriority: Record<LessonPriority, Lesson[]>;
}

// ─── Sync check ──────────────────────────────────────────────────────────────

export interface SyncOrphan {
  id: string;
  lineNumber: number;
}

export interface SyncCheckResult {
  total: number;
  paired: number;
  orphaned: SyncOrphan[];
  /** true when orphaned.length <= maxOrphaned */
  ok: boolean;
}

/**
 * Verify every `<!-- @lesson id=... -->` annotation in `content` is followed
 * by a Markdown heading (##, ###, ####) within `lookAhead` lines.
 * Allows up to `maxOrphaned` unpaired annotations (default 1 — one in-flight entry).
 */
export function syncCheck(
  content: string,
  { lookAhead = 5, maxOrphaned = 1 }: { lookAhead?: number; maxOrphaned?: number } = {},
): SyncCheckResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const orphaned: SyncOrphan[] = [];
  let paired = 0;
  let total = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/<!--\s*@lesson\s+id="([^"]+)"/);
    if (!m) continue;
    total++;
    const id = m[1];

    let found = false;
    for (let j = i + 1; j <= Math.min(i + lookAhead, lines.length - 1); j++) {
      if (/^#{2,4}\s/.test(lines[j].trim())) { found = true; break; }
    }

    if (found) { paired++; } else { orphaned.push({ id, lineNumber: i + 1 }); }
  }

  return { total, paired, orphaned, ok: orphaned.length <= maxOrphaned };
}

// ─── Parser ──────────────────────────────────────────────────────────────────

// Matches <!-- @lesson ... --> with any attributes on one or multiple lines.
// The HTML comment ends at the first `-->`.
const LESSON_COMMENT_RE = /<!--\s*@lesson\s+([\s\S]*?)-->/g;

function attr(raw: string, name: string): string {
  const m = raw.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1].trim() : '';
}

// Allowed enum values — used to coerce unknown annotation values to a safe default
// instead of crashing. A single typo in prompt-evolution.md (e.g. test_status="active")
// must NOT take down the whole tool / `npm test` (this runs inside test:kit).
const VALID_CLASSIFICATIONS: ReadonlySet<string> = new Set<LessonClassification>([
  'prompt_rule', 'validation_rule', 'automated_gate', 'regression_test',
  'project_knowledge', 'temporary_observation', 'reject',
]);
const VALID_PRIORITIES: ReadonlySet<string> = new Set<LessonPriority>(['high', 'medium', 'low']);
const VALID_TEST_STATUSES: ReadonlySet<string> = new Set<LessonTestStatus>(['enforced', 'pending', 'exempt']);

function coerce<T extends string>(value: string, valid: ReadonlySet<string>, fallback: T, field: string, id: string): T {
  if (valid.has(value)) return value as T;
  if (value) console.warn(`⚠️  lesson-registry: lesson ${id} has unknown ${field}="${value}" → treating as "${fallback}"`);
  return fallback;
}

export function parseLessons(content: string): Lesson[] {
  const lessons: Lesson[] = [];
  // Normalise line endings
  const text = content.replace(/\r\n/g, '\n');
  let match: RegExpExecArray | null;

  // Reset lastIndex on each call
  LESSON_COMMENT_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = LESSON_COMMENT_RE.exec(text)) !== null) {
    const raw = match[1];
    const endIdx = match.index + match[0].length;
    // Grab up to 200 chars of content after the comment for the snippet
    const afterComment = text.slice(endIdx, endIdx + 300).replace(/\s+/g, ' ').trim();
    const snippet = afterComment.slice(0, 120);
    const heading = text.slice(endIdx).split('\n').slice(0, 6)
      .map((line) => line.trim().match(/^#{2,4}\s+(.+)$/)?.[1]?.trim() || '')
      .find(Boolean) || '';

    const id = attr(raw, 'id');
    if (!id) continue; // skip malformed annotations

    const classification = coerce<LessonClassification>(attr(raw, 'classification') || 'prompt_rule', VALID_CLASSIFICATIONS, 'prompt_rule', 'classification', id);
    const priority = coerce<LessonPriority>(attr(raw, 'priority') || 'low', VALID_PRIORITIES, 'low', 'priority', id);
    const rootCause = attr(raw, 'root_cause') || 'unknown';
    const enforcedBy = attr(raw, 'enforced_by') || 'none';
    const testStatus = coerce<LessonTestStatus>(attr(raw, 'test_status') || 'pending', VALID_TEST_STATUSES, 'pending', 'test_status', id);
    const kitVersion = attr(raw, 'kit_version') || null;
    const observedAt = attr(raw, 'observed_at') || null;
    const liveValidatedText = attr(raw, 'live_validated');
    const liveValidated = liveValidatedText === '' ? null : liveValidatedText === 'true' ? true : liveValidatedText === 'false' ? false : liveValidatedText;

    lessons.push({ id, classification, priority, rootCause, enforcedBy, testStatus, snippet, kitVersion, observedAt, liveValidated, title: heading });
  }

  return lessons;
}

const isCanonicalVersion = (value: string): boolean => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.0$/.test(value);
const isCanonicalTimestamp = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

/**
 * Uses the established lesson parser, then applies the stricter O1 evidence boundary.
 * Legacy unversioned lessons remain valid for the registry but cannot enter an O1 dossier.
 */
export function extractVersionScopedLessons(content: string, version: string): VersionScopedLesson[] {
  if (!isCanonicalVersion(version)) throw new Error('version-scoped lessons require canonical N.N.0');
  const normalized = content.replace(/\r\n/g, '\n');
  LESSON_COMMENT_RE.lastIndex = 0;
  const rawAnnotations: Array<{ raw: string; start: number; end: number }> = [];
  let rawMatch: RegExpExecArray | null;
  // Count any annotation that attempts a kit_version binding so missing/malformed ids cannot be skipped silently.
  // eslint-disable-next-line no-cond-assign
  while ((rawMatch = LESSON_COMMENT_RE.exec(normalized)) !== null) {
    rawAnnotations.push({ raw: rawMatch[1], start: rawMatch.index, end: rawMatch.index + rawMatch[0].length });
  }
  const rawScoped = rawAnnotations.filter((entry) => /\bkit_version\s*=/.test(entry.raw));
  const expectedAttributes = ['classification', 'enforced_by', 'id', 'kit_version', 'live_validated', 'observed_at', 'priority', 'root_cause', 'test_status'];
  for (const entry of rawScoped) {
    const attributeNames = [...entry.raw.matchAll(/\b([a-z_]+)="[^"]*"/g)].map((match) => match[1]).sort();
    if (attributeNames.length !== expectedAttributes.length || attributeNames.some((name, index) => name !== expectedAttributes[index])) {
      throw new Error('version-scoped lesson annotation has duplicate, missing, or unexpected attributes');
    }
  }
  const parsed = parseLessons(normalized);
  const scoped = parsed.filter((lesson) => lesson.kitVersion !== null);
  if (rawScoped.length !== scoped.length) throw new Error('version-scoped lesson annotation is malformed');

  const seen = new Set<string>();
  const output: VersionScopedLesson[] = [];
  for (const lesson of scoped) {
    if (!lesson.kitVersion || !isCanonicalVersion(lesson.kitVersion)
      || !lesson.observedAt || !isCanonicalTimestamp(lesson.observedAt)
      || typeof lesson.liveValidated !== 'boolean'
      || !/^L-[A-Za-z0-9][A-Za-z0-9-]*$/.test(lesson.id)
      || lesson.title.trim() === '') {
      throw new Error(`version-scoped lesson ${lesson.id || '(missing)'} has malformed evidence`);
    }
    const key = `${lesson.kitVersion}\u0000${lesson.id}`;
    if (seen.has(key)) throw new Error(`duplicate version-scoped lesson ${lesson.id}`);
    seen.add(key);
    if (lesson.kitVersion !== version) continue;
    const sourceIndex = rawAnnotations.findIndex((entry) => attr(entry.raw, 'id') === lesson.id && attr(entry.raw, 'kit_version') === lesson.kitVersion);
    if (sourceIndex < 0) throw new Error(`version-scoped lesson ${lesson.id} has no exact source block`);
    const source = rawAnnotations[sourceIndex];
    const nextStart = rawAnnotations[sourceIndex + 1]?.start ?? normalized.length;
    const body = normalized.slice(source.end, nextStart).replace(/[ \t]+$/gm, '').trim();
    if (body === '') throw new Error(`version-scoped lesson ${lesson.id} has no evidence body`);
    const evidenceHash = createHash('sha256').update(JSON.stringify({
      kitVersion: lesson.kitVersion,
      id: lesson.id,
      title: lesson.title,
      classification: lesson.classification,
      priority: lesson.priority,
      rootCause: lesson.rootCause,
      enforcedBy: lesson.enforcedBy,
      testStatus: lesson.testStatus,
      liveValidated: lesson.liveValidated,
      observedAt: lesson.observedAt,
      body,
    })).digest('hex');
    output.push({ kitVersion: lesson.kitVersion, id: lesson.id, title: lesson.title, evidenceHash, observedAt: lesson.observedAt });
  }
  if (output.length === 0) throw new Error(`no authoritative lessons for ${version}`);
  return output.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildReport(lessons: Lesson[]): LessonReport {
  const byStatus: Record<LessonTestStatus, Lesson[]> = { enforced: [], pending: [], exempt: [] };
  const byPriority: Record<LessonPriority, Lesson[]> = { high: [], medium: [], low: [] };

  for (const l of lessons) {
    byStatus[l.testStatus].push(l);
    byPriority[l.priority].push(l);
  }

  const unenforcedHigh = lessons.filter(
    (l) => l.priority === 'high' && l.testStatus === 'pending',
  ).length;

  return {
    total: lessons.length,
    enforced: byStatus.enforced.length,
    pending: byStatus.pending.length,
    exempt: byStatus.exempt.length,
    unenforcedHigh,
    lessons,
    byStatus,
    byPriority,
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function statusBadge(s: LessonTestStatus): string {
  if (s === 'enforced') return '✅';
  if (s === 'pending') return '⏳';
  return '⚪'; // exempt
}

function priorityBadge(p: LessonPriority): string {
  if (p === 'high') return '🔴';
  if (p === 'medium') return '🟡';
  return '🟢';
}

function printSummary(report: LessonReport): void {
  const { total, enforced, pending, exempt, unenforcedHigh } = report;
  console.log(`\n📚 Lesson Registry — ${total} lessons\n`);
  console.log(`   ✅ enforced: ${enforced}  ⏳ pending: ${pending}  ⚪ exempt: ${exempt}`);
  if (unenforcedHigh > 0) {
    console.log(`   ⚠️  ${unenforcedHigh} HIGH-priority lesson(s) have no gate yet\n`);
  } else {
    console.log(`   ✅ All HIGH-priority lessons are enforced or exempt\n`);
  }

  // Pending lessons (most important to show)
  if (pending > 0) {
    console.log('── Pending (no gate yet) ───────────────────────────────────────');
    for (const l of report.byStatus.pending) {
      console.log(`  ${priorityBadge(l.priority)} ${l.id} [${l.classification}]`);
      console.log(`     root_cause: ${l.rootCause}  enforced_by: ${l.enforcedBy}`);
      if (l.snippet) console.log(`     "${l.snippet}"`);
    }
    console.log('');
  }

  // Enforced lessons
  if (enforced > 0) {
    console.log('── Enforced ────────────────────────────────────────────────────');
    for (const l of report.byStatus.enforced) {
      console.log(`  ${statusBadge(l.testStatus)} ${l.id} [${l.classification}] → ${l.enforcedBy}`);
    }
    console.log('');
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): {
  evolutionFile: string;
  summary: boolean;
  gate: boolean;
  json: boolean;
  syncCheck: boolean;
  versionScoped: string | null;
} {
  const fileIdx = argv.indexOf('--evolution-file');
  const evolutionFile =
    fileIdx >= 0
      ? argv[fileIdx + 1]
      : path.join(process.cwd(), '.claude', 'prompt-evolution.md');
  const versionIdx = argv.indexOf('--version-scoped');
  return {
    evolutionFile,
    summary: argv.includes('--summary'),
    gate: argv.includes('--gate'),
    json: argv.includes('--json'),
    syncCheck: argv.includes('--sync-check'),
    versionScoped: versionIdx >= 0 ? argv[versionIdx + 1] || '' : null,
  };
}

// Run CLI only when invoked directly
if (process.argv[1] && /lesson-registry\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const opts = parseCliArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.evolutionFile)) {
    if (opts.syncCheck) {
      // No prompt-evolution.md (e.g. a fresh kit-standalone clone) — 0 annotations, trivially synced.
      console.log('✅ Sync check passed: no prompt-evolution.md found (0 annotations to verify).');
      process.exit(0);
    }
    console.error(`lesson-registry: file not found: ${opts.evolutionFile}`);
    process.exit(2);
  }

  const content = fs.readFileSync(opts.evolutionFile, 'utf-8');
  const lessons = parseLessons(content);
  const report = buildReport(lessons);

  if (opts.versionScoped !== null) {
    try {
      const scoped = extractVersionScopedLessons(content, opts.versionScoped);
      console.log(`@@VERSION_SCOPED_LESSONS@@${JSON.stringify({ schemaVersion: 1, kitVersion: opts.versionScoped, lessons: scoped })}`);
      process.exit(0);
    } catch (error) {
      console.error(`lesson-registry: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  if (opts.syncCheck) {
    const result = syncCheck(content);
    if (result.orphaned.length === 0) {
      console.log(`✅ Sync check passed: ${result.paired}/${result.total} lesson annotations paired with Change sections.`);
    } else {
      console.warn(`⚠️  ${result.orphaned.length} orphaned annotation(s) (no Change heading within 5 lines):`);
      for (const o of result.orphaned) {
        console.warn(`   line ${o.lineNumber}: ${o.id}`);
      }
      if (!result.ok) {
        console.error(`❌ Sync check failed: ${result.orphaned.length} orphaned > max 1 allowed.`);
        process.exit(1);
      }
    }
    process.exit(0);
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (opts.summary || opts.gate) {
    printSummary(report);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  if (opts.gate && report.unenforcedHigh > 0) {
    console.error(`\n❌ Gate failed: ${report.unenforcedHigh} HIGH-priority lesson(s) lack enforcement.\n`);
    process.exit(1);
  }
}
