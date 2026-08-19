import * as path from 'node:path';

const MAX_LINK_DESTINATION_BYTES = 4_096;

export interface SourceManifestEntry {
  path: string;
  decision: 'include' | 'exclude';
  contentKind: 'text' | 'binary';
}

export interface MarkdownSourceFile {
  path: string;
  text: string;
}

export interface MarkdownLinkAnalysisInput {
  manifestEntries: SourceManifestEntry[];
  trackedPaths: string[];
  regularPaths: string[];
  markdownFiles: MarkdownSourceFile[];
}

export interface MarkdownLinkFinding {
  code:
    | 'link-fragment-missing'
    | 'link-reference-duplicate'
    | 'link-reference-missing'
    | 'link-source-invalid'
    | 'link-target-absolute'
    | 'link-target-backslash'
    | 'link-target-case-mismatch'
    | 'link-target-excluded'
    | 'link-target-invalid-encoding'
    | 'link-target-invalid-path'
    | 'link-target-missing'
    | 'link-target-not-regular'
    | 'link-target-nul'
    | 'link-target-too-long'
    | 'link-target-traversal'
    | 'link-target-untracked';
  sourcePath: string;
  line: number;
  target?: string;
}

export interface MarkdownLinkAnalysis {
  markdownFiles: number;
  relativeLinks: number;
  validLinks: number;
  findings: MarkdownLinkFinding[];
}

interface ReferenceDefinition {
  destination: string;
  line: number;
}

interface ParsedDestination {
  kind: 'external' | 'fragment-only' | 'relative' | 'unsafe';
  path?: string;
  fragment?: string;
  code?: MarkdownLinkFinding['code'];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(left: MarkdownLinkFinding, right: MarkdownLinkFinding): number {
  return compareText(left.sourcePath, right.sourcePath)
    || left.line - right.line
    || compareText(left.code, right.code)
    || compareText(left.target ?? '', right.target ?? '');
}

function normalizeReferenceId(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stripCode(lines: string[]): string[] {
  let fence: { marker: '`' | '~'; length: number } | null = null;
  return lines.map((line) => {
    if (fence !== null) {
      const closing = new RegExp(`^\\s{0,3}${fence.marker}{${fence.length},}\\s*$`);
      if (closing.test(line)) fence = null;
      return '';
    }
    const opening = /^\s{0,3}(`{3,}|~{3,})(?:[^`~]*)$/.exec(line);
    if (opening) {
      fence = { marker: opening[1][0] as '`' | '~', length: opening[1].length };
      return '';
    }
    return line.replace(/(`+)([^`]|`(?!\1))*?\1/g, '');
  });
}

function decodePart(value: string): { value?: string; code?: MarkdownLinkFinding['code'] } {
  if (/%(?:2f|5c)/i.test(value)) return { code: 'link-target-invalid-path' };
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes('\0')) return { code: 'link-target-nul' };
    return { value: decoded };
  } catch {
    return { code: 'link-target-invalid-encoding' };
  }
}

function parseDestination(rawValue: string): ParsedDestination {
  let raw = rawValue.trim();
  if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1);
  if (new TextEncoder().encode(raw).length > MAX_LINK_DESTINATION_BYTES) {
    return { kind: 'unsafe', code: 'link-target-too-long' };
  }
  if (raw.startsWith('#')) return { kind: 'fragment-only' };
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/')) {
    return { kind: 'unsafe', code: 'link-target-absolute' };
  }
  if (raw.includes('\\')) return { kind: 'unsafe', code: 'link-target-backslash' };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith('//')) return { kind: 'external' };

  const hashIndex = raw.indexOf('#');
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const rawFragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) : '';
  const queryIndex = beforeHash.indexOf('?');
  const rawPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  if (rawPath.length === 0) return { kind: 'fragment-only' };

  const decodedPath = decodePart(rawPath);
  if (decodedPath.code) return { kind: 'unsafe', code: decodedPath.code };
  const decodedFragment = decodePart(rawFragment);
  if (decodedFragment.code) return { kind: 'unsafe', code: decodedFragment.code };
  const linkPath = decodedPath.value!;
  if (linkPath.includes('\\')) return { kind: 'unsafe', code: 'link-target-backslash' };
  if (linkPath.startsWith('/') || /^[A-Za-z]:\//.test(linkPath)) {
    return { kind: 'unsafe', code: 'link-target-absolute' };
  }
  if (linkPath.normalize('NFC') !== linkPath) return { kind: 'unsafe', code: 'link-target-invalid-path' };
  const segments = linkPath.split('/');
  if (segments.some((segment) => segment.length === 0 || (segment !== '.' && segment !== '..' && (segment.endsWith('.') || segment.endsWith(' '))))) {
    return { kind: 'unsafe', code: 'link-target-invalid-path' };
  }
  return { kind: 'relative', path: linkPath, fragment: decodedFragment.value ?? '' };
}

function githubSlug(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function markdownAnchors(text: string): Set<string> {
  const lines = stripCode(text.split(/\r?\n/));
  const anchors = new Set<string>();
  const slugCounts = new Map<string, number>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) anchors.add(match[1]);
    let heading: string | null = null;
    const atx = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) heading = atx[1];
    else if (index + 1 < lines.length && /^\s*(?:=+|-+)\s*$/.test(lines[index + 1]) && line.trim()) heading = line.trim();
    if (heading === null) continue;
    const base = githubSlug(heading);
    if (!base) continue;
    const count = slugCounts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    slugCounts.set(base, count + 1);
  }
  return anchors;
}

function validateDestination(
  sourcePath: string,
  line: number,
  rawDestination: string,
  manifest: Map<string, SourceManifestEntry>,
  manifestByCase: Map<string, string>,
  tracked: Set<string>,
  regular: Set<string>,
  markdown: Map<string, string>,
  anchors: Map<string, Set<string>>,
): { relative: boolean; valid: boolean; finding?: MarkdownLinkFinding } {
  const parsed = parseDestination(rawDestination);
  if (parsed.kind === 'external' || parsed.kind === 'fragment-only') return { relative: false, valid: false };
  if (parsed.kind === 'unsafe') {
    return {
      relative: true,
      valid: false,
      finding: { code: parsed.code!, sourcePath, line, target: rawDestination },
    };
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), parsed.path!));
  if (resolved.startsWith('../') || resolved === '..') {
    return { relative: true, valid: false, finding: { code: 'link-target-traversal', sourcePath, line, target: rawDestination } };
  }
  const caseMatch = manifestByCase.get(resolved.toLowerCase());
  if (!manifest.has(resolved) && caseMatch && caseMatch !== resolved) {
    return { relative: true, valid: false, finding: { code: 'link-target-case-mismatch', sourcePath, line, target: rawDestination } };
  }
  const entry = manifest.get(resolved);
  if (!entry) {
    return { relative: true, valid: false, finding: { code: 'link-target-missing', sourcePath, line, target: rawDestination } };
  }
  if (entry.decision !== 'include') {
    return { relative: true, valid: false, finding: { code: 'link-target-excluded', sourcePath, line, target: rawDestination } };
  }
  if (!tracked.has(resolved)) {
    return { relative: true, valid: false, finding: { code: 'link-target-untracked', sourcePath, line, target: rawDestination } };
  }
  if (!regular.has(resolved)) {
    return { relative: true, valid: false, finding: { code: 'link-target-not-regular', sourcePath, line, target: rawDestination } };
  }
  if (parsed.fragment) {
    if (!markdown.has(resolved) || !anchors.get(resolved)?.has(parsed.fragment)) {
      return { relative: true, valid: false, finding: { code: 'link-fragment-missing', sourcePath, line, target: rawDestination } };
    }
  }
  return { relative: true, valid: true };
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

export function analyzeMarkdownLinks(input: MarkdownLinkAnalysisInput): MarkdownLinkAnalysis {
  assertUnique(input.manifestEntries.map((entry) => entry.path), 'manifest paths');
  assertUnique(input.trackedPaths, 'tracked paths');
  assertUnique(input.regularPaths, 'regular paths');
  assertUnique(input.markdownFiles.map((file) => file.path), 'Markdown paths');

  const manifest = new Map(input.manifestEntries.map((entry) => [entry.path, entry]));
  const manifestByCase = new Map<string, string>();
  for (const entry of input.manifestEntries) {
    const key = entry.path.toLowerCase();
    const previous = manifestByCase.get(key);
    if (previous && previous !== entry.path) throw new Error(`manifest contains case-colliding paths: ${previous}, ${entry.path}`);
    manifestByCase.set(key, entry.path);
  }
  const tracked = new Set(input.trackedPaths);
  const regular = new Set(input.regularPaths);
  const markdown = new Map(input.markdownFiles.map((file) => [file.path, file.text]));
  const anchors = new Map(input.markdownFiles.map((file) => [file.path, markdownAnchors(file.text)]));
  const findings: MarkdownLinkFinding[] = [];
  let relativeLinks = 0;
  let validLinks = 0;

  for (const file of [...input.markdownFiles].sort((left, right) => compareText(left.path, right.path))) {
    const entry = manifest.get(file.path);
    if (!entry || entry.decision !== 'include' || entry.contentKind !== 'text' || !tracked.has(file.path) || !regular.has(file.path)) {
      findings.push({ code: 'link-source-invalid', sourcePath: file.path, line: 1 });
      continue;
    }
    const lines = stripCode(file.text.split(/\r?\n/));
    const definitions = new Map<string, ReferenceDefinition>();
    const duplicateReferences = new Set<string>();
    const definitionLines = new Set<number>();
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(lines[index]);
      if (!match) continue;
      definitionLines.add(index);
      const id = normalizeReferenceId(match[1]);
      if (definitions.has(id)) {
        duplicateReferences.add(id);
        findings.push({ code: 'link-reference-duplicate', sourcePath: file.path, line: index + 1, target: id });
      } else {
        definitions.set(id, { destination: match[2] ?? match[3], line: index + 1 });
      }
    }

    const recordResult = (line: number, destination: string): void => {
      const result = validateDestination(
        file.path,
        line,
        destination,
        manifest,
        manifestByCase,
        tracked,
        regular,
        markdown,
        anchors,
      );
      if (!result.relative) return;
      relativeLinks += 1;
      if (result.valid) validLinks += 1;
      if (result.finding) findings.push(result.finding);
    };

    for (let index = 0; index < lines.length; index += 1) {
      if (definitionLines.has(index)) continue;
      const line = lines[index];
      for (const match of line.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g)) {
        recordResult(index + 1, match[1] ?? match[2]);
      }
      for (const match of line.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
        const id = normalizeReferenceId(match[2] || match[1]);
        if (duplicateReferences.has(id)) continue;
        const definition = definitions.get(id);
        if (!definition) {
          findings.push({ code: 'link-reference-missing', sourcePath: file.path, line: index + 1, target: id });
          continue;
        }
        recordResult(index + 1, definition.destination);
      }
    }
  }

  findings.sort(compareFindings);
  return { markdownFiles: input.markdownFiles.length, relativeLinks, validLinks, findings };
}

export type DependencyLicenseProvenance =
  | 'registry-manifest'
  | 'registry-tarball-license'
  | 'registry-tarball-readme';

export interface DependencyCatalogPackage {
  id: string;
  name: string;
  version: string;
  license: string;
  provenance: DependencyLicenseProvenance;
  authorities: string[];
}

export interface DependencyCatalog {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-dependency-license-catalog';
  packages: DependencyCatalogPackage[];
}

export interface ReviewedLicenseException {
  id: string;
  license: string;
  rationale: string;
}

export interface LicenseMetadataOverride {
  id: string;
  license: string;
  provenance: Exclude<DependencyLicenseProvenance, 'registry-manifest'>;
  evidence: string;
}

export interface PackageRootPolicy {
  path: string;
  name: string;
  version: string;
  private: true;
  license: 'Apache-2.0';
  description: string;
  node: '>=20';
}

export interface DependencyLicensePolicy {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-dependency-license-policy';
  lockfiles: string[];
  allowedLicenses: string[];
  reviewedExceptions: ReviewedLicenseException[];
  metadataOverrides: LicenseMetadataOverride[];
  packageRoots: PackageRootPolicy[];
}

export interface PackageLockInput {
  path: string;
  value: unknown;
}

export interface PackageRootInput {
  path: string;
  value: unknown;
}

export interface DependencyLicenseContractInput {
  lockfiles: PackageLockInput[];
  catalog: DependencyCatalog;
  policy: DependencyLicensePolicy;
  packageRoots: PackageRootInput[];
}

export interface DependencyLicenseFinding {
  code:
    | 'license-catalog-authority-drift'
    | 'license-catalog-id-invalid'
    | 'license-catalog-invalid'
    | 'license-catalog-license-invalid'
    | 'license-catalog-order-invalid'
    | 'license-catalog-package-extra'
    | 'license-catalog-package-missing'
    | 'license-dependency-integrity-missing'
    | 'license-dependency-resolved-invalid'
    | 'license-dependency-version-missing'
    | 'license-lock-root-metadata-drift'
    | 'license-lockfile-invalid'
    | 'license-lockfile-missing'
    | 'license-lockfile-unexpected'
    | 'license-lockfile-version'
    | 'license-package-root-metadata-drift'
    | 'license-package-root-missing'
    | 'license-package-root-unexpected'
    | 'license-policy-denied'
    | 'license-policy-exception-invalid'
    | 'license-policy-invalid'
    | 'license-policy-override-invalid'
    | 'license-policy-override-required'
    | 'license-policy-review-required';
  path?: string;
  id?: string;
}

export interface DependencyLicenseContractResult {
  lockfiles: number;
  occurrences: number;
  uniquePackages: number;
  reviewedPackages: number;
  metadataOverrides: number;
  licenseCounts: Record<string, number>;
  findings: DependencyLicenseFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || compareText(values[index - 1], value) < 0);
}

function dependencyNameFromLockPath(value: string): string | null {
  const marker = 'node_modules/';
  const index = value.lastIndexOf(marker);
  if (index < 0) return null;
  const name = value.slice(index + marker.length);
  return name.length > 0 && !name.includes('/node_modules/') ? name : null;
}

function packageRootForLock(lockPath: string): string {
  const directory = path.posix.dirname(lockPath);
  return directory === '.' ? 'package.json' : `${directory}/package.json`;
}

function validPackageId(value: string): boolean {
  if (value.includes('*') || value.includes(' ') || value.endsWith('@')) return false;
  const split = value.lastIndexOf('@');
  return split > 0 && split < value.length - 1;
}

function validSpdxExpression(value: string): boolean {
  return value.length > 0
    && value.length <= 128
    && !['NOASSERTION', 'UNKNOWN', 'UNLICENSED'].includes(value)
    && /^[A-Za-z0-9.+() -]+$/.test(value);
}

function findingSort(left: DependencyLicenseFinding, right: DependencyLicenseFinding): number {
  return compareText(left.code, right.code)
    || compareText(left.path ?? '', right.path ?? '')
    || compareText(left.id ?? '', right.id ?? '');
}

function metadataMatches(value: unknown, expected: PackageRootPolicy): boolean {
  if (!isRecord(value)) return false;
  const engines = value.engines;
  return value.name === expected.name
    && value.version === expected.version
    && value.private === true
    && value.license === 'Apache-2.0'
    && value.description === expected.description
    && isRecord(engines)
    && engines.node === '>=20';
}

function lockRootMatches(value: unknown, expected: PackageRootPolicy): boolean {
  if (!isRecord(value)) return false;
  const engines = value.engines;
  return value.name === expected.name
    && value.version === expected.version
    && isRecord(engines)
    && engines.node === '>=20';
}

export function evaluateDependencyLicenseContract(
  input: DependencyLicenseContractInput,
): DependencyLicenseContractResult {
  const findings: DependencyLicenseFinding[] = [];
  const occurrences = new Map<string, { name: string; version: string; count: number; authorities: Set<string> }>();
  let occurrenceCount = 0;

  const policy = input.policy;
  const policyValid = isRecord(policy)
    && policy.schemaVersion === '1.0.0'
    && policy.artifactId === 'agentic-feature-kit-dependency-license-policy'
    && Array.isArray(policy.lockfiles)
    && policy.lockfiles.every((value) => typeof value === 'string')
    && sortedUnique(policy.lockfiles)
    && Array.isArray(policy.allowedLicenses)
    && policy.allowedLicenses.every((value) => typeof value === 'string')
    && sortedUnique(policy.allowedLicenses)
    && Array.isArray(policy.reviewedExceptions)
    && Array.isArray(policy.metadataOverrides)
    && Array.isArray(policy.packageRoots);
  if (!policyValid) findings.push({ code: 'license-policy-invalid' });

  const expectedLocks = policyValid ? new Set(policy.lockfiles) : new Set<string>();
  const actualLocks = new Map<string, unknown>();
  for (const item of input.lockfiles) {
    if (actualLocks.has(item.path)) findings.push({ code: 'license-lockfile-invalid', path: item.path });
    actualLocks.set(item.path, item.value);
    if (policyValid && !expectedLocks.has(item.path)) findings.push({ code: 'license-lockfile-unexpected', path: item.path });
  }
  if (policyValid) {
    for (const lockPath of policy.lockfiles) {
      if (!actualLocks.has(lockPath)) findings.push({ code: 'license-lockfile-missing', path: lockPath });
    }
  }

  const packageRootValues = new Map(input.packageRoots.map((item) => [item.path, item.value]));
  const expectedRootPaths = new Set(policyValid ? policy.packageRoots.map((item) => item.path) : []);
  if (policyValid) {
    for (const expected of policy.packageRoots) {
      const value = packageRootValues.get(expected.path);
      if (value === undefined) findings.push({ code: 'license-package-root-missing', path: expected.path });
      else if (!metadataMatches(value, expected)) findings.push({ code: 'license-package-root-metadata-drift', path: expected.path });
    }
    for (const item of input.packageRoots) {
      if (!expectedRootPaths.has(item.path)) findings.push({ code: 'license-package-root-unexpected', path: item.path });
    }
  }

  for (const [lockPath, rawLock] of actualLocks) {
    if (!isRecord(rawLock) || !isRecord(rawLock.packages)) {
      findings.push({ code: 'license-lockfile-invalid', path: lockPath });
      continue;
    }
    if (rawLock.lockfileVersion !== 2 && rawLock.lockfileVersion !== 3) {
      findings.push({ code: 'license-lockfile-version', path: lockPath });
    }
    const rootRecord = rawLock.packages[''];
    if (policyValid) {
      const expectedRoot = policy.packageRoots.find((item) => item.path === packageRootForLock(lockPath));
      if (!expectedRoot || !lockRootMatches(rootRecord, expectedRoot)) {
        findings.push({ code: 'license-lock-root-metadata-drift', path: lockPath });
      }
    }
    for (const [lockKey, rawPackage] of Object.entries(rawLock.packages)) {
      const name = dependencyNameFromLockPath(lockKey);
      if (name === null) continue;
      if (!isRecord(rawPackage)) {
        findings.push({ code: 'license-lockfile-invalid', path: lockPath, id: name });
        continue;
      }
      const version = rawPackage.version;
      if (typeof version !== 'string' || version.length === 0) {
        findings.push({ code: 'license-dependency-version-missing', path: lockPath, id: name });
        continue;
      }
      const id = `${name}@${version}`;
      if (typeof rawPackage.resolved !== 'string' || !rawPackage.resolved.startsWith('https://registry.npmjs.org/')) {
        findings.push({ code: 'license-dependency-resolved-invalid', path: lockPath, id });
      }
      if (typeof rawPackage.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(rawPackage.integrity)) {
        findings.push({ code: 'license-dependency-integrity-missing', path: lockPath, id });
      }
      const current = occurrences.get(id) ?? { name, version, count: 0, authorities: new Set<string>() };
      current.count += 1;
      current.authorities.add(lockPath);
      occurrences.set(id, current);
      occurrenceCount += 1;
    }
  }

  const catalog = input.catalog;
  const catalogValid = isRecord(catalog)
    && catalog.schemaVersion === '1.0.0'
    && catalog.artifactId === 'agentic-feature-kit-dependency-license-catalog'
    && Array.isArray(catalog.packages);
  if (!catalogValid) findings.push({ code: 'license-catalog-invalid' });
  const catalogRows = catalogValid ? catalog.packages : [];
  const catalogIds = catalogRows.map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : '');
  if (!sortedUnique(catalogIds)) findings.push({ code: 'license-catalog-order-invalid' });
  const catalogById = new Map<string, DependencyCatalogPackage>();
  for (const rawRow of catalogRows) {
    if (!isRecord(rawRow)
      || typeof rawRow.id !== 'string'
      || typeof rawRow.name !== 'string'
      || typeof rawRow.version !== 'string'
      || typeof rawRow.license !== 'string'
      || !['registry-manifest', 'registry-tarball-license', 'registry-tarball-readme'].includes(String(rawRow.provenance))
      || !Array.isArray(rawRow.authorities)
      || !rawRow.authorities.every((value) => typeof value === 'string')) {
      findings.push({ code: 'license-catalog-invalid' });
      continue;
    }
    const row = rawRow as unknown as DependencyCatalogPackage;
    if (!validPackageId(row.id) || row.id !== `${row.name}@${row.version}` || catalogById.has(row.id)) {
      findings.push({ code: 'license-catalog-id-invalid', id: row.id });
    }
    if (!validSpdxExpression(row.license)) findings.push({ code: 'license-catalog-license-invalid', id: row.id });
    if (!sortedUnique(row.authorities)) findings.push({ code: 'license-catalog-authority-drift', id: row.id });
    catalogById.set(row.id, row);
  }

  for (const [id, occurrence] of occurrences) {
    const row = catalogById.get(id);
    if (!row) {
      findings.push({ code: 'license-catalog-package-missing', id });
      continue;
    }
    const expectedAuthorities = [...occurrence.authorities].sort(compareText);
    if (JSON.stringify(row.authorities) !== JSON.stringify(expectedAuthorities)) {
      findings.push({ code: 'license-catalog-authority-drift', id });
    }
  }
  for (const id of catalogById.keys()) {
    if (!occurrences.has(id)) findings.push({ code: 'license-catalog-package-extra', id });
  }

  const reviewed = new Map<string, ReviewedLicenseException>();
  const overrides = new Map<string, LicenseMetadataOverride>();
  if (policyValid) {
    for (const value of policy.reviewedExceptions) {
      if (!isRecord(value)
        || typeof value.id !== 'string'
        || !validPackageId(value.id)
        || typeof value.license !== 'string'
        || !validSpdxExpression(value.license)
        || typeof value.rationale !== 'string'
        || value.rationale.trim().length < 12
        || reviewed.has(value.id)) {
        findings.push({ code: 'license-policy-exception-invalid', id: isRecord(value) && typeof value.id === 'string' ? value.id : undefined });
        continue;
      }
      reviewed.set(value.id, value as unknown as ReviewedLicenseException);
    }
    for (const value of policy.metadataOverrides) {
      if (!isRecord(value)
        || typeof value.id !== 'string'
        || !validPackageId(value.id)
        || typeof value.license !== 'string'
        || !validSpdxExpression(value.license)
        || !['registry-tarball-license', 'registry-tarball-readme'].includes(String(value.provenance))
        || typeof value.evidence !== 'string'
        || value.evidence.trim().length < 12
        || overrides.has(value.id)) {
        findings.push({ code: 'license-policy-override-invalid', id: isRecord(value) && typeof value.id === 'string' ? value.id : undefined });
        continue;
      }
      overrides.set(value.id, value as unknown as LicenseMetadataOverride);
    }
  }

  const allowed = new Set(policyValid ? policy.allowedLicenses : []);
  const denied = /^(?:A?GPL|LGPL|SSPL|BUSL|Elastic|Commons-Clause)(?:[- .(]|$)/i;
  let reviewedPackages = 0;
  let metadataOverrides = 0;
  const licenseCounts: Record<string, number> = {};
  for (const [id, row] of [...catalogById.entries()].sort((left, right) => compareText(left[0], right[0]))) {
    licenseCounts[row.license] = (licenseCounts[row.license] ?? 0) + 1;
    if (!validSpdxExpression(row.license)) continue;
    if (!allowed.has(row.license)) {
      const exception = reviewed.get(id);
      if (exception?.license === row.license) reviewedPackages += 1;
      else if (denied.test(row.license)) findings.push({ code: 'license-policy-denied', id });
      else findings.push({ code: 'license-policy-review-required', id });
    }
    if (row.provenance !== 'registry-manifest') {
      const override = overrides.get(id);
      if (override?.license === row.license && override.provenance === row.provenance) metadataOverrides += 1;
      else findings.push({ code: 'license-policy-override-required', id });
    }
  }

  findings.sort(findingSort);
  return {
    lockfiles: actualLocks.size,
    occurrences: occurrenceCount,
    uniquePackages: occurrences.size,
    reviewedPackages,
    metadataOverrides,
    licenseCounts: Object.fromEntries(Object.entries(licenseCounts).sort(([left], [right]) => compareText(left, right))),
    findings,
  };
}

export interface TextSourceFile {
  path: string;
  contentKind: 'text' | 'binary';
  bytes: Uint8Array;
}

export type SecretSha256Port = (value: Uint8Array) => string;

export interface SecretScanInput {
  files: TextSourceFile[];
  sha256: SecretSha256Port;
  maxFileBytes: number;
  maxFindingsPerFile: number;
  maxFindings: number;
}

export interface SecretFinding {
  code:
    | 'secret-content-kind-mismatch'
    | 'secret-file-finding-limit'
    | 'secret-file-too-large'
    | 'secret-global-finding-limit'
    | 'secret-invalid-utf8'
    | 'secret-match'
    | 'secret-nul'
    | 'secret-path-duplicate';
  path: string;
  line: number;
  detectorId?: string;
  fingerprintSha256?: string;
}

export interface SecretScanResult {
  textFiles: number;
  detectorFamilies: 10;
  findings: SecretFinding[];
}

interface SecretDetector {
  id: string;
  source: string;
  flags: string;
  accept?: (match: RegExpExecArray) => boolean;
}

function secretDetectors(): SecretDetector[] {
  const awsAccess = `${'AK' + 'IA'}|${'AS' + 'IA'}`;
  const githubClassic = `${'gh'}[pousr]_`;
  const githubFine = `${'github' + '_pat_'}`;
  const slack = `${'xo' + 'x'}[baprs]-`;
  const google = `${'AI' + 'za'}`;
  const npm = `${'np' + 'm_'}`;
  const jwt = `${'ey' + 'J'}`;
  const privateKey = `${'PRIVATE' + ' KEY'}`;
  const stripe = `${'sk' + '_live_'}`;
  const amazonCredential = `${'X-' + 'Amz-' + 'Credential'}`;
  const amazonSignature = `${'X-' + 'Amz-' + 'Signature'}`;
  const googleCredential = `${'X-' + 'Goog-' + 'Credential'}`;
  const googleSignature = `${'X-' + 'Goog-' + 'Signature'}`;
  const placeholders = new Set(['password', 'placeholder', 'changeme', 'example', 'redacted', 'your-token', 'your_token']);
  const isReal = (value: string | undefined): boolean => {
    if (!value) return false;
    const normalized = value.replace(/^['"]|['"]$/g, '').replace(/^<|>$/g, '').toLowerCase();
    return !placeholders.has(normalized) && !normalized.startsWith('your-') && !normalized.startsWith('your_');
  };
  return [
    { id: 'aws-access-key', source: `\\b(?:${awsAccess})[A-Z0-9]{16}\\b`, flags: 'g' },
    { id: 'github-token', source: `\\b(?:${githubClassic}[A-Za-z0-9]{30,255}|${githubFine}[A-Za-z0-9_]{20,255})\\b`, flags: 'g' },
    { id: 'slack-token', source: `\\b${slack}[A-Za-z0-9-]{10,}\\b`, flags: 'g' },
    { id: 'google-api-key', source: `\\b${google}[0-9A-Za-z_-]{35}\\b`, flags: 'g' },
    { id: 'npm-token', source: `\\b${npm}[A-Za-z0-9]{36}\\b`, flags: 'g' },
    {
      id: 'jwt-bearer',
      source: `\\b${jwt}[A-Za-z0-9_-]{10,}\\.${jwt}[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{16,}\\b`,
      flags: 'g',
    },
    { id: 'pem-private-key', source: `-----BEGIN (?:RSA |EC |OPENSSH )?${privateKey}-----`, flags: 'g' },
    {
      id: 'credential-uri',
      source: '\\b(?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis):\\/\\/[^\\s:@/]+:([^\\s@/]+)@',
      flags: 'gi',
      accept: (match) => isReal(match[1]),
    },
    { id: 'stripe-live-key', source: `\\b${stripe}[A-Za-z0-9]{16,}\\b`, flags: 'g' },
    {
      id: 'signed-cloud-or-secret-assignment',
      source: `(?:${amazonCredential}|${amazonSignature}|${googleCredential}|${googleSignature})=([A-Za-z0-9%/+_-]{16,})|(?:client_secret|api_secret|service_role_key|password)\\s*[:=]\\s*["']?([A-Za-z0-9/+_=.-]{20,})`,
      flags: 'gi',
      accept: (match) => isReal(match[1] ?? match[2]),
    },
  ];
}

function secretFindingSort(left: SecretFinding, right: SecretFinding): number {
  return compareText(left.path, right.path)
    || left.line - right.line
    || compareText(left.detectorId ?? '', right.detectorId ?? '')
    || compareText(left.code, right.code);
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function positiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

export function scanTextSecrets(input: SecretScanInput): SecretScanResult {
  positiveSafeInteger(input.maxFileBytes, 'maxFileBytes');
  positiveSafeInteger(input.maxFindingsPerFile, 'maxFindingsPerFile');
  positiveSafeInteger(input.maxFindings, 'maxFindings');
  const detectors = secretDetectors();
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  let textFiles = 0;
  let matchedFindings = 0;
  let globalLimitReached = false;

  for (const file of [...input.files].sort((left, right) => compareText(left.path, right.path))) {
    if (seen.has(file.path)) {
      findings.push({ code: 'secret-path-duplicate', path: file.path, line: 1 });
      continue;
    }
    seen.add(file.path);
    if (file.contentKind !== 'text') {
      findings.push({ code: 'secret-content-kind-mismatch', path: file.path, line: 1 });
      continue;
    }
    textFiles += 1;
    if (file.bytes.byteLength > input.maxFileBytes) {
      findings.push({ code: 'secret-file-too-large', path: file.path, line: 1 });
      continue;
    }
    if (file.bytes.includes(0)) {
      findings.push({ code: 'secret-nul', path: file.path, line: 1 });
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    } catch {
      findings.push({ code: 'secret-invalid-utf8', path: file.path, line: 1 });
      continue;
    }
    let fileMatches = 0;
    for (const detector of detectors) {
      const regex = new RegExp(detector.source, detector.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (detector.accept && !detector.accept(match)) continue;
        if (fileMatches >= input.maxFindingsPerFile) {
          findings.push({ code: 'secret-file-finding-limit', path: file.path, line: lineNumberAt(text, match.index) });
          fileMatches = Number.POSITIVE_INFINITY;
          break;
        }
        if (matchedFindings >= input.maxFindings) {
          findings.push({ code: 'secret-global-finding-limit', path: file.path, line: lineNumberAt(text, match.index) });
          globalLimitReached = true;
          break;
        }
        const fingerprintSha256 = input.sha256(new TextEncoder().encode(match[0]));
        if (!/^[a-f0-9]{64}$/.test(fingerprintSha256)) throw new Error('sha256 port returned an invalid digest');
        findings.push({
          code: 'secret-match',
          path: file.path,
          line: lineNumberAt(text, match.index),
          detectorId: detector.id,
          fingerprintSha256,
        });
        fileMatches += 1;
        matchedFindings += 1;
      }
      if (!Number.isFinite(fileMatches) || globalLimitReached) break;
    }
    if (globalLimitReached) break;
  }

  findings.sort(secretFindingSort);
  return { textFiles, detectorFamilies: 10, findings };
}

export interface SourceReadinessDocumentationFinding {
  code:
    | 'docs-nonclaim-missing'
    | 'docs-required-statement-missing'
    | 'docs-stale-statement-present'
    | 'notice-nonclaim-missing'
    | 'notice-required-statement-missing';
  document: 'docs/releasing/UNRELEASED.md' | 'THIRD_PARTY_NOTICES.md';
  statement: string;
}

const REQUIRED_RELEASE_NOTE_STATEMENTS = [
  'Manifest-wide internal Markdown links: 48/48 valid',
  'Dependency license catalog: 617 unique packages and 754 occurrences across four lockfiles',
  'Manifest text secret scan: ten detector families, zero findings',
  'Nightly and manual qualification use the same read-only Linux/Windows matrix',
  'Internal-marker and private-binary remediation are complete for the current source candidate',
  'Deterministic SPDX 2.3 and CycloneDX 1.6 SBOM sidecars now cover the exact source and provider candidates',
  'Strict final archive admission now validates all three ZIP archives',
  'Committed-clone qualification runs the documented quickstart in two physical no-junction clones per platform',
  'Only exact-head Linux/Windows receipts, aggregate parity, and exact-commit browser corroboration may qualify R5D',
] as const;

const STALE_RELEASE_NOTE_STATEMENTS = [
  'Resolve and requalify all 31 unresolved marker dispositions',
  'Complete dependency-license inventory and SBOM generation',
  'Add nightly qualification with bounded retention and failure ownership',
  'Run the final distribution-archive scanner',
  'Complete clean-clone qualification',
] as const;

const REQUIRED_NOTICE_STATEMENTS = [
  'release/dependency-license-catalog.json',
  'release/dependency-license-policy.json',
  '617 unique name@version packages',
  '@axe-core/playwright@4.11.3',
  'axe-core@4.11.4',
  'caniuse-lite@1.0.30001799',
  'dompurify@3.4.11',
  'robust-predicates@3.0.3',
  'do not vendor `node_modules`',
  'R5C2B must re-evaluate the exact final archive contents',
] as const;

export function evaluateSourceReadinessDocumentation(
  releaseNotes: string,
  thirdPartyNotices: string,
): SourceReadinessDocumentationFinding[] {
  const findings: SourceReadinessDocumentationFinding[] = [];
  for (const statement of REQUIRED_RELEASE_NOTE_STATEMENTS) {
    if (!releaseNotes.includes(statement)) {
      findings.push({
        code: 'docs-required-statement-missing',
        document: 'docs/releasing/UNRELEASED.md',
        statement,
      });
    }
  }
  for (const statement of STALE_RELEASE_NOTE_STATEMENTS) {
    if (releaseNotes.includes(statement)) {
      findings.push({ code: 'docs-stale-statement-present', document: 'docs/releasing/UNRELEASED.md', statement });
    }
  }
  for (const statement of REQUIRED_NOTICE_STATEMENTS) {
    if (!thirdPartyNotices.includes(statement)) {
      findings.push({ code: 'notice-required-statement-missing', document: 'THIRD_PARTY_NOTICES.md', statement });
    }
  }
  for (const statement of ['not a release announcement', 'does not authorize publication']) {
    if (!releaseNotes.toLowerCase().includes(statement)) {
      findings.push({ code: 'docs-nonclaim-missing', document: 'docs/releasing/UNRELEASED.md', statement });
    }
  }
  if (!thirdPartyNotices.toLowerCase().includes('not legal advice')) {
    findings.push({ code: 'notice-nonclaim-missing', document: 'THIRD_PARTY_NOTICES.md', statement: 'not legal advice' });
  }
  findings.sort((left, right) => compareText(left.code, right.code)
    || compareText(left.document, right.document)
    || compareText(left.statement, right.statement));
  return findings;
}
