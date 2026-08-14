#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteTextFile } from '../.claude/integrations/cli-reliability';

type BoundaryPhase = { id: string; sourceLines: [number, number] };
type BoundaryDocument = {
  generatedOn: string;
  source: { path: string; gitCommit: string; gitBlob: string; sha256: string; lineCount: number };
  phases: BoundaryPhase[];
};

function git(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0 || result.stderr.trim()) throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  return result.stdout.trim();
}

function gitRaw(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  if (result.status !== 0 || result.stderr.trim()) throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  return result.stdout;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function withoutGeneratedMetadata(boundary: BoundaryDocument): unknown {
  return {
    ...boundary,
    generatedOn: '',
    source: { ...boundary.source, gitCommit: '', gitBlob: '', sha256: '', lineCount: 0 },
  };
}

function replaceUniqueProperty(raw: string, property: string, previous: string | number, next: string | number): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPrevious = JSON.stringify(previous).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`("${escapedProperty}"\\s*:\\s*)${escapedPrevious}`, 'g');
  const matches = [...raw.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`expected exactly one ${property} metadata field, found ${matches.length}`);
  return raw.replace(pattern, (_match, prefix: string) => `${prefix}${JSON.stringify(next)}`);
}

export function refreshBoundarySource(root: string, generatedOn: string): BoundaryDocument {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedOn)) throw new Error('generatedOn must be YYYY-MM-DD');
  const boundaryRelativePath = 'docs/roadmap/post-17-orchestrator-boundaries.json';
  const boundaryPath = path.join(root, ...boundaryRelativePath.split('/'));
  const worktreeBoundaryRaw = fs.readFileSync(boundaryPath, 'utf8');
  const boundary = JSON.parse(worktreeBoundaryRaw) as BoundaryDocument;
  const committedBoundaryRaw = gitRaw(root, ['show', `HEAD:${boundaryRelativePath}`]);
  const committedBoundary = JSON.parse(committedBoundaryRaw) as BoundaryDocument;
  if (JSON.stringify(withoutGeneratedMetadata(boundary)) !== JSON.stringify(withoutGeneratedMetadata(committedBoundary))) {
    throw new Error('boundary structure is dirty; commit semantic boundary changes before refreshing metadata');
  }
  const sourcePath = boundary.source.path;
  if (sourcePath !== '.claude/commands/feature-from-confluence.md') throw new Error('unexpected flagship source path');
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const headBlob = git(root, ['rev-parse', `HEAD:${sourcePath}`]);
  const worktreeBlob = git(root, ['hash-object', sourcePath]);
  if (headBlob !== worktreeBlob) throw new Error('flagship source is dirty; commit it before refreshing the boundary');
  const lines = source.split(/\r?\n/);
  const sourceLineCount = lines.length - (source.endsWith('\n') ? 1 : 0);
  for (const [index, phase] of boundary.phases.entries()) {
    const [start, end] = phase.sourceLines;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) throw new Error(`invalid sourceLines for ${phase.id}`);
    const escaped = phase.id.replace('.', '\\.');
    if (!new RegExp(`^## ${escaped}(?:\\s|$)`).test(lines[start - 1] ?? '')) throw new Error(`phase anchor drifted: ${phase.id}`);
    const nextStart = boundary.phases[index + 1]?.sourceLines[0];
    const expectedEnd = nextStart === undefined ? sourceLineCount : nextStart - 1;
    if (end !== expectedEnd) throw new Error(`phase range drifted: ${phase.id}`);
  }
  const nextSource = {
    path: sourcePath,
    gitCommit: commit,
    gitBlob: headBlob,
    sha256: sha256(source),
    lineCount: sourceLineCount,
  };
  let refreshed = committedBoundaryRaw;
  refreshed = replaceUniqueProperty(refreshed, 'generatedOn', committedBoundary.generatedOn, generatedOn);
  refreshed = replaceUniqueProperty(refreshed, 'gitCommit', committedBoundary.source.gitCommit, nextSource.gitCommit);
  refreshed = replaceUniqueProperty(refreshed, 'gitBlob', committedBoundary.source.gitBlob, nextSource.gitBlob);
  refreshed = replaceUniqueProperty(refreshed, 'sha256', committedBoundary.source.sha256, nextSource.sha256);
  refreshed = replaceUniqueProperty(refreshed, 'lineCount', committedBoundary.source.lineCount, nextSource.lineCount);
  atomicWriteTextFile(boundaryPath, refreshed);
  boundary.generatedOn = generatedOn;
  boundary.source = nextSource;
  return boundary;
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    process.stderr.write('usage: refresh-post17-orchestrator-boundary.ts\n');
    process.exitCode = 2;
  } else {
    try {
      const result = refreshBoundarySource(process.cwd(), new Date().toISOString().slice(0, 10));
      process.stdout.write(`refreshed ${result.source.path} at ${result.source.gitCommit}\n`);
    } catch (error) {
      process.stderr.write(`boundary refresh failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
