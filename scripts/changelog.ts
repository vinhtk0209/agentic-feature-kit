#!/usr/bin/env node
/**
 * changelog.ts — dependency-free changelog automation (C-04).
 *
 * Generates a Keep-a-Changelog section from Conventional Commits since the last release, and
 * (with --write) inserts it into CHANGELOG.md. Intentionally NO changesets/standard-version:
 * the kit's version is the hand-edited `PROMPT_VERSION` (source of truth), while this tool
 * defaults to an Unreleased section and accepts only an explicit canonical semantic version.
 *
 * Shares its commit parser with the commit-msg hook (commit-msg.ts) — one grammar, one test.
 *
 * Usage:
 *   npx tsx scripts/changelog.ts                 # preview the next section (default --dry)
 *   npx tsx scripts/changelog.ts --since v3.17   # range from a git ref
 *   npx tsx scripts/changelog.ts --write         # insert a new Unreleased section
 *   npx tsx scripts/changelog.ts --version 3.19.0 --write
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// ─── Conventional-commit grammar (shared with commit-msg.ts) ─────────────────────

export const COMMIT_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'] as const;
export type CommitType = (typeof COMMIT_TYPES)[number];

export interface ParsedCommit { type: CommitType; scope?: string; breaking: boolean; description: string }

const HEADER_RE = /^(\w+)(?:\(([\w./\- ]+)\))?(!)?:\s+(.+)$/;

/** Parse a commit subject line; returns null if it isn't a valid conventional commit. */
export function parseCommit(subject: string): ParsedCommit | null {
  const m = HEADER_RE.exec(subject.trim());
  if (!m) return null;
  const type = m[1] as CommitType;
  if (!COMMIT_TYPES.includes(type)) return null;
  return { type, scope: m[2]?.trim() || undefined, breaking: m[3] === '!', description: m[4].trim() };
}

/** Validate a full commit message (used by the commit-msg hook). Allows merge/revert/fixup. */
export function validateCommitMessage(message: string): { ok: boolean; error?: string } {
  const first = message.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
  if (/^(Merge|Revert|fixup!|squash!)/.test(first)) return { ok: true };
  if (parseCommit(first)) return { ok: true };
  return {
    ok: false,
    error:
      `Commit message must follow Conventional Commits:\n` +
      `  <type>(<scope>)?: <description>\n` +
      `  type ∈ {${COMMIT_TYPES.join(', ')}}; add "!" for a breaking change.\n` +
      `Got: "${first}"`,
  };
}

// ─── Grouping + version logic ────────────────────────────────────────────────────

const SECTION_OF: Record<CommitType, string> = {
  feat: 'Added', fix: 'Fixed',
  perf: 'Changed', refactor: 'Changed', build: 'Changed', ci: 'Changed', chore: 'Changed', style: 'Changed', revert: 'Changed',
  docs: 'Documentation', test: 'Documentation',
};
const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Documentation', 'Other'];

export function groupCommits(subjects: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const raw of subjects) {
    const c = parseCommit(raw);
    const section = c ? SECTION_OF[c.type] : 'Other';
    const line = c
      ? `${c.breaking ? '**BREAKING** ' : ''}${c.scope ? `**${c.scope}:** ` : ''}${c.description}`
      : raw.trim();
    (groups[section] ??= []).push(line);
  }
  return groups;
}

export function suggestBump(subjects: string[]): 'major' | 'minor' | 'patch' {
  let minor = false;
  for (const raw of subjects) {
    const c = parseCommit(raw);
    if (!c) continue;
    if (c.breaking) return 'major';
    if (c.type === 'feat') minor = true;
  }
  return minor ? 'minor' : 'patch';
}

export function bumpVersion(version: string, bump: 'major' | 'minor' | 'patch'): string {
  const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

export function renderSection(version: string, date: string, groups: Record<string, string[]>): string {
  const validatedVersion = version === 'Unreleased' ? version : resolveSectionVersion(version);
  const heading = validatedVersion === 'Unreleased'
    ? '## [Unreleased]'
    : `## [${validatedVersion}] — ${date}`;
  const lines = [heading, ''];
  let any = false;
  for (const section of SECTION_ORDER) {
    const items = groups[section];
    if (!items?.length) continue;
    any = true;
    lines.push(`### ${section}`, '');
    for (const it of items) lines.push(`- ${it}`);
    lines.push('');
  }
  if (!any) lines.push('_No notable changes._', '');
  return lines.join('\n');
}

/** Resolve the section target without turning the current source version into a release claim. */
export function resolveSectionVersion(explicitVersion: string | undefined): string {
  if (explicitVersion === undefined) return 'Unreleased';
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(explicitVersion)) {
    throw new Error(`Explicit version must be a canonical semantic version (MAJOR.MINOR.PATCH): ${JSON.stringify(explicitVersion)}`);
  }
  return explicitVersion;
}

function versionHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^## \[([^\]]+)\](?: — \d{4}-\d{2}(?:-\d{2})?)?\s*$/gm)]
    .map((match) => match[1]);
}

/** Insert one validated section while preserving a single Unreleased-first authority. */
export function insertSection(existing: string, section: string, version: string): string {
  const target = version === 'Unreleased' ? version : resolveSectionVersion(version);
  if (existing.includes('\r') || section.includes('\r')) throw new Error('CHANGELOG.md and generated sections must use LF line endings.');

  const headings = versionHeadings(existing);
  const seen = new Set<string>();
  for (const heading of headings) {
    if (seen.has(heading)) throw new Error(`Changelog heading [${heading}] already exists more than once.`);
    seen.add(heading);
  }
  if (seen.has(target)) throw new Error(`Changelog heading [${target}] already exists.`);

  const generatedHeadings = versionHeadings(section);
  if (generatedHeadings.length !== 1 || generatedHeadings[0] !== target) {
    throw new Error(`Generated section must contain exactly one [${target}] heading.`);
  }

  const firstVersion = /^## \[/m.exec(existing);
  let insertAt = firstVersion?.index ?? existing.length;
  if (target !== 'Unreleased') {
    const unreleased = /^## \[Unreleased\]\s*$/m.exec(existing);
    if (unreleased) {
      const nextHeading = /^## \[/gm;
      nextHeading.lastIndex = unreleased.index + unreleased[0].length;
      insertAt = nextHeading.exec(existing)?.index ?? existing.length;
    }
  }

  const before = existing.slice(0, insertAt).trimEnd();
  const after = existing.slice(insertAt).trimStart();
  return after
    ? `${before}\n\n${section.trim()}\n\n${after.trimEnd()}\n`
    : `${before}\n\n${section.trim()}\n`;
}

// ─── Source-of-truth version (PROMPT_VERSION) ────────────────────────────────────

export function resolvePromptVersion(root: string): string | null {
  try {
    const file = path.join(root, '.claude', 'commands', 'feature-from-confluence.md');
    const m = fs.readFileSync(file, 'utf8').match(/PROMPT_VERSION:\s*v([\d.]+)/);
    if (!m) return null;
    const parts = m[1].split('.');
    return parts.length === 2 ? `${m[1]}.0` : m[1]; // normalize major.minor → major.minor.0
  } catch {
    return null;
  }
}

// ─── Git ─────────────────────────────────────────────────────────────────────────

export type GitRunner = (args: string[]) => string;

const defaultGitRunner: GitRunner = (args) => execFileSync('git', args, { encoding: 'utf8' });

export function lastReleaseTag(runGit: GitRunner = defaultGitRunner): string | null {
  try {
    const tags = runGit(['tag', '--sort=-creatordate']).split('\n').map((t) => t.trim());
    return tags.find((t) => /^v?\d+\.\d+(\.\d+)?$/.test(t)) ?? null;
  } catch {
    return null;
  }
}

export function commitSubjects(since: string | null, runGit: GitRunner = defaultGitRunner): string[] {
  try {
    const range = since ? `${since}..HEAD` : 'HEAD';
    const out = runGit(['log', range, '--no-merges', '--format=%s']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

export interface ChangelogArgs {
  since?: string;
  version?: string;
  write?: true;
}

/** Parse only the supported CLI shape so malformed input fails before any file write. */
export function parseArgs(argv: string[]): ChangelogArgs {
  const out: ChangelogArgs = {};
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected positional argument: ${JSON.stringify(a)}`);
    const key = a.slice(2);
    if (!['since', 'version', 'write'].includes(key)) throw new Error(`Unknown option: --${key}`);
    if (seen.has(key)) throw new Error(`Duplicate option: --${key}`);
    seen.add(key);

    if (key === 'write') {
      out.write = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Option --${key} requires a value.`);
    if (/[\0\r\n]/.test(value)) throw new Error(`Option --${key} contains a forbidden control character.`);
    if (key === 'since') {
      if (value.startsWith('-')) throw new Error('Option --since must be a Git revision, not a Git option.');
      out.since = value;
    } else {
      out.version = resolveSectionVersion(value);
    }
    i += 1;
  }
  if (out.since === '') {
    throw new Error('Option --since requires a value.');
  }
  if (out.version === '') {
    throw new Error('Option --version requires a value.');
  }
  return out;
}

function failCli(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Changelog generation failed: ${message}`);
  process.exit(2);
}

function main(): void {
  const root = process.cwd();
  let args: ChangelogArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    failCli(error);
  }

  const since = args.since ?? lastReleaseTag();
  const subjects = commitSubjects(since);

  if (subjects.length === 0) {
    console.error(`No commits found${since ? ` since ${since}` : ''}. Nothing to record.`);
    process.exit(1);
  }

  const groups = groupCommits(subjects);
  const bump = suggestBump(subjects);
  const prompt = resolvePromptVersion(root);
  const version = resolveSectionVersion(args.version);
  const date = new Date().toISOString().slice(0, 10);
  const section = renderSection(version, date, groups);

  console.log(`\nRange: ${since ? `${since}..HEAD` : 'all history'} · ${subjects.length} commit(s)`);
  console.log(`Suggested bump (from commits): ${bump}`);
  console.log(prompt ? `PROMPT_VERSION (source of truth): ${prompt}` : 'PROMPT_VERSION: not found');
  console.log(`Section target: ${version}\n`);
  console.log('─'.repeat(70));
  console.log(section);
  console.log('─'.repeat(70));

  if (args.write) {
    const file = path.join(root, 'CHANGELOG.md');
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Changelog\n';
    let next: string;
    try {
      next = insertSection(existing, section, version);
    } catch (error) {
      failCli(error);
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log(`\n✅ Inserted the [${version}] section into CHANGELOG.md`);
    console.log('   Review it, then commit. No tag, release, publish, or push was performed.');
  } else {
    console.log('\n(dry run — pass --write to insert this section into CHANGELOG.md)');
  }
}

if (process.argv[1] && /changelog\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
