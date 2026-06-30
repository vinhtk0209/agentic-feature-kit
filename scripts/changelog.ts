#!/usr/bin/env node
/**
 * changelog.ts — dependency-free changelog automation (C-04).
 *
 * Generates a Keep-a-Changelog section from Conventional Commits since the last release, and
 * (with --write) prepends it to CHANGELOG.md. Intentionally NO changesets/standard-version:
 * the kit's version is the hand-edited `PROMPT_VERSION` (source of truth), so this tool
 * SUGGESTS a semver bump from the commits but uses PROMPT_VERSION as the actual version
 * unless --version is passed. That keeps the "only edit PROMPT_VERSION" rule intact.
 *
 * Shares its commit parser with the commit-msg hook (commit-msg.ts) — one grammar, one test.
 *
 * Usage:
 *   npx tsx scripts/changelog.ts                 # preview the next section (default --dry)
 *   npx tsx scripts/changelog.ts --since v3.17   # range from a git ref
 *   npx tsx scripts/changelog.ts --write         # prepend the section to CHANGELOG.md
 *   npx tsx scripts/changelog.ts --version 3.19.0 --write
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
  const lines = [`## [${version}] — ${date}`, ''];
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

function lastReleaseTag(): string | null {
  try {
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8' }).split('\n').map((t) => t.trim());
    return tags.find((t) => /^v?\d+\.\d+(\.\d+)?$/.test(t)) ?? null;
  } catch {
    return null;
  }
}

function commitSubjects(since: string | null): string[] {
  try {
    const range = since ? `${since}..HEAD` : 'HEAD';
    const out = execSync(`git log ${range} --no-merges --format=%s`, { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { out[k] = n; i += 1; } else { out[k] = true; }
    }
  }
  return out;
}

if (process.argv[1] && /changelog\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const since = typeof args.since === 'string' ? args.since : lastReleaseTag();
  const subjects = commitSubjects(since);

  if (subjects.length === 0) {
    console.error(`No commits found${since ? ` since ${since}` : ''}. Nothing to release.`);
    process.exit(1);
  }

  const groups = groupCommits(subjects);
  const bump = suggestBump(subjects);
  const prompt = resolvePromptVersion(root);
  const version = typeof args.version === 'string'
    ? args.version
    : (prompt ?? bumpVersion('0.0.0', bump));
  const date = new Date().toISOString().slice(0, 10);
  const section = renderSection(version, date, groups);

  console.log(`\nRange: ${since ? `${since}..HEAD` : 'all history'} · ${subjects.length} commit(s)`);
  console.log(`Suggested bump (from commits): ${bump}`);
  console.log(prompt ? `PROMPT_VERSION (source of truth): ${prompt}` : 'PROMPT_VERSION: not found');
  console.log(`Section version: ${version}\n`);
  console.log('─'.repeat(70));
  console.log(section);
  console.log('─'.repeat(70));

  if (args.write) {
    const file = path.join(root, 'CHANGELOG.md');
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Changelog\n\n---\n';
    const marker = existing.indexOf('\n## [');
    const next = marker >= 0
      ? existing.slice(0, marker) + '\n' + section + existing.slice(marker + 1)
      : existing.trimEnd() + '\n\n' + section;
    fs.writeFileSync(file, next, 'utf8');
    console.log(`\n✅ Prepended the [${version}] section to CHANGELOG.md`);
    console.log('   Review it, then commit. (Version stays PROMPT_VERSION unless you pass --version.)');
  } else {
    console.log('\n(dry run — pass --write to prepend this to CHANGELOG.md)');
  }
}
