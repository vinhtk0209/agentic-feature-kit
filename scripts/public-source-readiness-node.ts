#!/usr/bin/env node

import * as path from 'node:path';
import {
  INTERNAL_MARKER_REGISTRY_PATH,
  PUBLIC_RELEASE_MANIFEST_PATH,
  evaluatePublicReleaseCandidate,
  parsePublicReleaseManifest,
  type CandidateFile,
  type PublicReleaseManifest,
} from './public-release-contract';
import { loadGitIndexCandidate, nodeSha256 } from './public-release-contract-node';
import {
  analyzeMarkdownLinks,
  evaluateDependencyLicenseContract,
  evaluateSourceReadinessDocumentation,
  scanTextSecrets,
  type DependencyCatalog,
  type DependencyLicensePolicy,
  type SourceManifestEntry,
} from './public-source-readiness-contract';

export const PUBLIC_SOURCE_READINESS_SENTINEL = '@@PUBLIC_SOURCE_READINESS@@' as const;

export interface PublicSourceReadinessIssue {
  domain: 'adapter' | 'candidate' | 'documentation' | 'license' | 'link' | 'secret';
  code: string;
  path?: string;
}

export interface PublicSourceReadinessReport {
  schemaVersion: '1.0.0';
  status: 'blocked' | 'eligible-for-r5c2';
  summary: {
    manifestPaths: number;
    markdownFiles: number;
    relativeLinks: number;
    validLinks: number;
    lockfiles: number;
    dependencyOccurrences: number;
    uniqueDependencies: number;
    reviewedDependencies: number;
    metadataOverrides: number;
    textFiles: number;
    secretDetectorFamilies: number;
  };
  issues: PublicSourceReadinessIssue[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strictText(file: CandidateFile, label: string): string {
  if (file.bytes.includes(0)) throw new Error(`${label} contains NUL`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

function strictJson<T>(file: CandidateFile, label: string): T {
  try {
    return JSON.parse(strictText(file, label)) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON`);
    throw error;
  }
}

function requiredFile(files: Map<string, CandidateFile>, relativePath: string): CandidateFile {
  const file = files.get(relativePath);
  if (!file) throw new Error(`required Git-index file is missing: ${relativePath}`);
  return file;
}

function issueSort(left: PublicSourceReadinessIssue, right: PublicSourceReadinessIssue): number {
  return compareText(left.domain, right.domain)
    || compareText(left.code, right.code)
    || compareText(left.path ?? '', right.path ?? '');
}

function emptySummary(): PublicSourceReadinessReport['summary'] {
  return {
    manifestPaths: 0,
    markdownFiles: 0,
    relativeLinks: 0,
    validLinks: 0,
    lockfiles: 0,
    dependencyOccurrences: 0,
    uniqueDependencies: 0,
    reviewedDependencies: 0,
    metadataOverrides: 0,
    textFiles: 0,
    secretDetectorFamilies: 10,
  };
}

export function evaluatePublicSourceReadinessCandidate(files: CandidateFile[]): PublicSourceReadinessReport {
  const issues: PublicSourceReadinessIssue[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifestFile = requiredFile(byPath, PUBLIC_RELEASE_MANIFEST_PATH);
  const registryFile = requiredFile(byPath, INTERNAL_MARKER_REGISTRY_PATH);
  const manifestValue = strictJson<unknown>(manifestFile, PUBLIC_RELEASE_MANIFEST_PATH);
  const manifest: PublicReleaseManifest = parsePublicReleaseManifest(manifestValue);
  const candidate = evaluatePublicReleaseCandidate({
    manifestBytes: manifestFile.bytes,
    registryBytes: registryFile.bytes,
    files,
    sha256: nodeSha256,
  });
  if (!candidate.contractValid) issues.push({ domain: 'candidate', code: 'public-release-contract-invalid' });
  if (candidate.candidateStatus !== 'eligible-for-later-gates') {
    issues.push({ domain: 'candidate', code: 'public-release-candidate-blocked' });
  }

  const manifestEntries: SourceManifestEntry[] = manifest.entries.map((entry) => ({
    path: entry.path,
    decision: entry.decision,
    contentKind: entry.contentKind,
  }));
  const trackedPaths = files.map((file) => file.path);
  const regularPaths = files
    .filter((file) => !file.reparsePoint && (file.gitMode === '100644' || file.gitMode === '100755'))
    .map((file) => file.path);
  const markdownFiles = manifest.entries
    .filter((entry) => entry.decision === 'include' && entry.contentKind === 'text' && entry.path.toLowerCase().endsWith('.md'))
    .map((entry) => {
      const file = requiredFile(byPath, entry.path);
      return { path: entry.path, text: strictText(file, entry.path) };
    });
  const linkResult = analyzeMarkdownLinks({ manifestEntries, trackedPaths, regularPaths, markdownFiles });
  issues.push(...linkResult.findings.map((finding) => ({ domain: 'link' as const, code: finding.code, path: finding.sourcePath })));

  const policyFile = requiredFile(byPath, 'release/dependency-license-policy.json');
  const catalogFile = requiredFile(byPath, 'release/dependency-license-catalog.json');
  const policy = strictJson<DependencyLicensePolicy>(policyFile, policyFile.path);
  const catalog = strictJson<DependencyCatalog>(catalogFile, catalogFile.path);
  const licenseResult = evaluateDependencyLicenseContract({
    policy,
    catalog,
    lockfiles: policy.lockfiles.map((lockPath) => {
      const file = requiredFile(byPath, lockPath);
      return { path: lockPath, value: strictJson<unknown>(file, lockPath) };
    }),
    packageRoots: policy.packageRoots.map((root) => {
      const file = requiredFile(byPath, root.path);
      return { path: root.path, value: strictJson<unknown>(file, root.path) };
    }),
  });
  issues.push(...licenseResult.findings.map((finding) => ({ domain: 'license' as const, code: finding.code, path: finding.path })));

  const textFiles = manifest.entries
    .filter((entry) => entry.decision === 'include' && entry.contentKind === 'text')
    .map((entry) => {
      const file = requiredFile(byPath, entry.path);
      return { path: entry.path, contentKind: entry.contentKind, bytes: file.bytes };
    });
  const secretResult = scanTextSecrets({
    files: textFiles,
    sha256: nodeSha256,
    maxFileBytes: manifest.limits.maxTextFileBytes,
    maxFindingsPerFile: 20,
    maxFindings: 200,
  });
  issues.push(...secretResult.findings.map((finding) => ({ domain: 'secret' as const, code: finding.code, path: finding.path })));

  const docsResult = evaluateSourceReadinessDocumentation(
    strictText(requiredFile(byPath, 'docs/releasing/UNRELEASED.md'), 'docs/releasing/UNRELEASED.md'),
    strictText(requiredFile(byPath, 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md'),
  );
  issues.push(...docsResult.map((finding) => ({ domain: 'documentation' as const, code: finding.code, path: finding.document })));
  issues.sort(issueSort);
  return {
    schemaVersion: '1.0.0',
    status: issues.length === 0 ? 'eligible-for-r5c2' : 'blocked',
    summary: {
      manifestPaths: manifest.entries.filter((entry) => entry.decision === 'include').length,
      markdownFiles: linkResult.markdownFiles,
      relativeLinks: linkResult.relativeLinks,
      validLinks: linkResult.validLinks,
      lockfiles: licenseResult.lockfiles,
      dependencyOccurrences: licenseResult.occurrences,
      uniqueDependencies: licenseResult.uniquePackages,
      reviewedDependencies: licenseResult.reviewedPackages,
      metadataOverrides: licenseResult.metadataOverrides,
      textFiles: secretResult.textFiles,
      secretDetectorFamilies: secretResult.detectorFamilies,
    },
    issues,
  };
}

export function runPublicSourceReadiness(repositoryRoot: string): PublicSourceReadinessReport {
  try {
    return evaluatePublicSourceReadinessCandidate(loadGitIndexCandidate(path.resolve(repositoryRoot)));
  } catch {
    return {
      schemaVersion: '1.0.0',
      status: 'blocked',
      summary: emptySummary(),
      issues: [{ domain: 'adapter', code: 'source-readiness-adapter-failure' }],
    };
  }
}

function parseArgs(args: string[]): string {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === '--repository-root') return path.resolve(args[1]);
  throw new Error('usage: public-source-readiness-node [--repository-root <path>]');
}

function main(): void {
  let report: PublicSourceReadinessReport;
  try {
    report = runPublicSourceReadiness(parseArgs(process.argv.slice(2)));
  } catch {
    report = {
      schemaVersion: '1.0.0',
      status: 'blocked',
      summary: emptySummary(),
      issues: [{ domain: 'adapter', code: 'source-readiness-argument-failure' }],
    };
  }
  process.stdout.write(`${PUBLIC_SOURCE_READINESS_SENTINEL}${JSON.stringify(report)}\n`);
  process.exitCode = report.status === 'eligible-for-r5c2' ? 0 : 1;
}

if (require.main === module) main();
