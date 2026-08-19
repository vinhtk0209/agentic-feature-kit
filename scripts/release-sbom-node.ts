import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv';
import {
  buildSbomPair,
  canonicalJson,
  evaluateSbomPair,
  npmPackageUrl,
  sidecarNames,
  type SbomBuildInput,
  type SbomComponent,
  type SbomPair,
} from './release-sbom-contract';

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_SCHEMA_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_EPOCH_SECONDS = 253_402_300_799;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REQUIRED_SCHEMA_ROLES = [
  'cyclonedx-document',
  'cyclonedx-jsf',
  'cyclonedx-spdx',
  'spdx-document',
] as const;

type SchemaRole = typeof REQUIRED_SCHEMA_ROLES[number];

export interface SchemaRegistryEntry {
  format: 'cyclonedx-1.6' | 'spdx-2.3';
  role: SchemaRole;
  localPath: string;
  upstreamRef: string;
  sourceUrl: string;
  sha256: string;
  schemaId: string;
  draft: 'draft-07';
  license: 'Apache-2.0' | 'CC-BY-3.0';
  schema: AnySchema;
}

export interface LoadedSchemaRegistry {
  entries: SchemaRegistryEntry[];
  validators: {
    spdx: ValidateFunction;
    cycloneDx: ValidateFunction;
  };
}

export interface SourceDateOptions {
  explicit?: number;
  environmentValue?: string;
  gitEpochSeconds?: () => number;
}

export interface GenerateSourceSbomOptions {
  repoRoot: string;
  outputDir: string;
  sourceDateEpoch?: number;
  environmentValue?: string;
  expectedWorkspaceRoots: number;
  expectedDependencies: number;
}

export interface SbomOutputFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface WrittenSbomPair {
  pair: SbomPair;
  files: SbomOutputFile[];
}

export interface GeneratedSourceSbom extends WrittenSbomPair {
  input: SbomBuildInput;
  sourceDateEpoch: number;
  identitySha256: string;
  manifestSha256: string;
  sourcePaths: number;
  sourceBytes: number;
  workspaceRoots: number;
  dependencies: number;
}

interface SourceManifestEntry {
  path: string;
  decision: 'include';
  contentKind: 'text' | 'binary';
}

interface SourceManifest {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-public-release';
  entries: SourceManifestEntry[];
}

interface PackageRoot {
  path: string;
  name: string;
  version: string;
  private: true;
  license: 'Apache-2.0';
}

interface DependencyPolicy {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-dependency-license-policy';
  packageRoots: PackageRoot[];
}

interface CatalogPackage {
  id: string;
  name: string;
  version: string;
  license: string;
  provenance: 'registry-manifest' | 'registry-tarball-license' | 'registry-tarball-readme';
  authorities: string[];
}

interface DependencyCatalog {
  schemaVersion: '1.0.0';
  artifactId: 'agentic-feature-kit-dependency-license-catalog';
  packages: CatalogPackage[];
}

export interface CapturedSourceSbom {
  input: SbomBuildInput;
  sourcePaths: number;
  sourceBytes: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string, label: string): unknown {
  if (text.includes('\0')) throw new Error(`${label} contains NUL`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function safeRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value.includes('\\')
    || value.includes('\0')
    || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
    || value.normalize('NFC') !== value
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => segment === '..' || segment === '' || segment.endsWith('.') || segment.endsWith(' '))
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return value;
}

function readRegularFile(root: string, relativePath: string, maxBytes: number, label: string): Buffer {
  const safePath = safeRelativePath(relativePath, label);
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...safePath.split('/'));
  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes repository root`);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    throw new Error(`${label} is missing: ${safePath}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not a regular file: ${safePath}`);
  if (stat.size > maxBytes) throw new Error(`${label} exceeds byte limit: ${safePath}`);
  return fs.readFileSync(absolutePath);
}

function readJsonFile(root: string, relativePath: string, maxBytes = MAX_JSON_BYTES): { bytes: Buffer; value: unknown } {
  const bytes = readRegularFile(root, relativePath, maxBytes, relativePath);
  return { bytes, value: parseJson(bytes.toString('utf8'), relativePath) };
}

function assertEpoch(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPOCH_SECONDS) {
    throw new Error(`${label} must be a non-negative integer epoch within ISO-8601 range`);
  }
  return value;
}

export function resolveSourceDateEpoch(options: SourceDateOptions): number {
  if (options.explicit !== undefined) return assertEpoch(options.explicit, 'sourceDateEpoch');
  if (options.environmentValue !== undefined) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(options.environmentValue)) {
      throw new Error('SOURCE_DATE_EPOCH must be a canonical non-negative integer');
    }
    return assertEpoch(Number(options.environmentValue), 'SOURCE_DATE_EPOCH');
  }
  if (!options.gitEpochSeconds) throw new Error('Git source date fallback is required');
  return assertEpoch(options.gitEpochSeconds(), 'Git source date fallback');
}

function gitEpochSeconds(repoRoot: string): number {
  const output = execFileSync('git', ['log', '-1', '--format=%ct'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(output)) throw new Error('Git source date fallback returned an invalid epoch');
  return Number(output);
}

function immutableSchemaSource(entry: Record<string, unknown>): boolean {
  if (typeof entry.sourceUrl !== 'string' || typeof entry.upstreamRef !== 'string') return false;
  let url: URL;
  try { url = new URL(entry.sourceUrl); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
  if (url.hostname !== 'raw.githubusercontent.com' && url.hostname !== 'cyclonedx.org') return false;
  if (/(?:^|\/)(?:main|master|latest|HEAD)(?:\/|$)/i.test(url.pathname)) return false;
  return entry.upstreamRef.length > 0 && url.pathname.split('/').includes(entry.upstreamRef);
}

function validDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function validAbsoluteUri(value: string): boolean {
  if (/\s|[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}

function validIriReference(value: string): boolean {
  if (/\s|[\u0000-\u001f\u007f]/u.test(value) || /%(?![0-9A-Fa-f]{2})/.test(value)) return false;
  try {
    new URL(value, 'https://schema-validation.invalid/');
    return true;
  } catch {
    return false;
  }
}

function validIdnEmail(value: string): boolean {
  if (value.length > 254 || /\s|[\u0000-\u001f\u007f]/u.test(value)) return false;
  const at = value.lastIndexOf('@');
  if (at <= 0 || at > 64 || at === value.length - 1 || value.indexOf('@') !== at) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[^(),:;<>\[\]"\\]+$/u.test(local)) return false;
  try {
    const hostname = new URL(`https://${domain}/`).hostname;
    return hostname.length > 0 && !hostname.startsWith('.') && !hostname.endsWith('.');
  } catch {
    return false;
  }
}

function compileSchemaRegistry(entries: SchemaRegistryEntry[]): LoadedSchemaRegistry['validators'] {
  const ajv = new Ajv({
    strict: true,
    // The official CycloneDX 1.6 schema has oneOf branches whose required keys
    // are declared by an adjacent shared schema. This disables only that schema
    // lint; runtime required-key validation remains unchanged.
    strictRequired: false,
    allErrors: true,
    validateFormats: true,
    addUsedSchema: true,
  });
  ajv.addFormat('date-time', { type: 'string', validate: validDateTime });
  ajv.addFormat('idn-email', { type: 'string', validate: validIdnEmail });
  ajv.addFormat('iri-reference', { type: 'string', validate: validIriReference });
  ajv.addFormat('uri', { type: 'string', validate: validAbsoluteUri });
  // CycloneDX uses this single namespaced annotation to retain SPDX enum metadata.
  // Register it explicitly so strict mode still rejects every unknown schema keyword.
  ajv.addKeyword('meta:enum');
  for (const entry of entries) ajv.addSchema(entry.schema, entry.schemaId);
  const spdxId = entries.find(({ role }) => role === 'spdx-document')!.schemaId;
  const cycloneDxId = entries.find(({ role }) => role === 'cyclonedx-document')!.schemaId;
  const spdx = ajv.getSchema(spdxId);
  const cycloneDx = ajv.getSchema(cycloneDxId);
  if (!spdx || !cycloneDx) throw new Error('document schema compiler did not return both validators');
  return { spdx, cycloneDx };
}

export function loadSchemaRegistry(repoRoot: string): LoadedSchemaRegistry {
  const registryValue = readJsonFile(repoRoot, 'release/sbom-schema-sources.json').value;
  if (!isRecord(registryValue)
    || registryValue.schemaVersion !== '1.0.0'
    || registryValue.artifactId !== 'agentic-feature-kit-sbom-schema-sources'
    || !Array.isArray(registryValue.schemas)) {
    throw new Error('SBOM schema registry is invalid');
  }
  if (registryValue.schemas.length !== REQUIRED_SCHEMA_ROLES.length) throw new Error('SBOM schema registry must contain exactly four rows');
  const entries: SchemaRegistryEntry[] = [];
  for (const value of registryValue.schemas) {
    if (!isRecord(value)) throw new Error('SBOM schema registry row is invalid');
    const role = value.role;
    const format = value.format;
    const localPath = safeRelativePath(value.localPath, 'schema localPath');
    if (!REQUIRED_SCHEMA_ROLES.includes(role as SchemaRole)) throw new Error(`unsupported schema role: ${String(role)}`);
    if (format !== 'cyclonedx-1.6' && format !== 'spdx-2.3') throw new Error(`unsupported schema format: ${String(format)}`);
    if (value.draft !== 'draft-07') throw new Error(`schema draft must be draft-07: ${localPath}`);
    if (value.license !== 'Apache-2.0' && value.license !== 'CC-BY-3.0') throw new Error(`schema license is not reviewed: ${localPath}`);
    if (!immutableSchemaSource(value)) throw new Error(`schema source must be immutable upstream authority: ${localPath}`);
    if (typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) throw new Error(`schema digest is invalid: ${localPath}`);
    if (typeof value.schemaId !== 'string' || value.schemaId.length === 0 || value.schemaId.length > 512) throw new Error(`schema id is invalid: ${localPath}`);
    const schemaBytes = readRegularFile(repoRoot, localPath, MAX_SCHEMA_BYTES, 'schema');
    if (sha256(schemaBytes) !== value.sha256) throw new Error(`schema digest drift: ${localPath}`);
    const schema = parseJson(schemaBytes.toString('utf8'), `schema ${localPath}`);
    if (!isRecord(schema) || schema.$schema !== 'http://json-schema.org/draft-07/schema#' || schema.$id !== value.schemaId) {
      throw new Error(`schema authority metadata drift: ${localPath}`);
    }
    entries.push({
      format,
      role: role as SchemaRole,
      localPath,
      upstreamRef: String(value.upstreamRef),
      sourceUrl: String(value.sourceUrl),
      sha256: value.sha256,
      schemaId: value.schemaId,
      draft: 'draft-07',
      license: value.license,
      schema: schema as AnySchema,
    });
  }
  const ordered = [...entries].sort((left, right) => compareText(left.localPath, right.localPath));
  if (entries.some((entry, index) => entry.localPath !== ordered[index].localPath)) throw new Error('schema registry rows must be ordinal by localPath');
  if (new Set(entries.map(({ role }) => role)).size !== REQUIRED_SCHEMA_ROLES.length
    || REQUIRED_SCHEMA_ROLES.some((role) => !entries.some((entry) => entry.role === role))) {
    throw new Error('schema registry roles must be exact and unique');
  }
  if (new Set(entries.map(({ localPath }) => localPath.toLowerCase())).size !== entries.length) throw new Error('schema registry paths collide');
  if (new Set(entries.map(({ schemaId }) => schemaId)).size !== entries.length) throw new Error('schema registry ids collide');
  return { entries, validators: compileSchemaRegistry(entries) };
}

function formatAjvErrors(format: string, errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${format}:${error.instancePath || '/'}:${error.keyword}`).sort(compareText);
}

export function validateSbomPairAgainstSchemas(pair: SbomPair, registry: LoadedSchemaRegistry): string[] {
  const findings: string[] = [];
  if (!registry.validators.spdx(pair.spdx)) findings.push(...formatAjvErrors('spdx', registry.validators.spdx.errors));
  if (!registry.validators.cycloneDx(pair.cycloneDx)) findings.push(...formatAjvErrors('cyclonedx', registry.validators.cycloneDx.errors));
  return findings.sort(compareText);
}

function readSourceManifest(repoRoot: string): { bytes: Buffer; manifest: SourceManifest } {
  const { bytes, value } = readJsonFile(repoRoot, 'release/public-release-manifest.json');
  if (!isRecord(value)
    || value.schemaVersion !== '1.0.0'
    || value.artifactId !== 'agentic-feature-kit-public-release'
    || !Array.isArray(value.entries)) throw new Error('public source manifest is invalid');
  const entries: SourceManifestEntry[] = value.entries.map((item, index) => {
    if (!isRecord(item) || item.decision !== 'include' || (item.contentKind !== 'text' && item.contentKind !== 'binary')) {
      throw new Error(`public source manifest row ${index} is invalid or not include-only`);
    }
    return {
      path: safeRelativePath(item.path, `public source manifest row ${index}`),
      decision: 'include',
      contentKind: item.contentKind,
    };
  });
  const ordered = [...entries].sort((left, right) => compareText(left.path, right.path));
  if (entries.some((entry, index) => entry.path !== ordered[index].path)) throw new Error('public source manifest rows must be ordinal');
  if (new Set(entries.map(({ path: itemPath }) => itemPath.toLowerCase())).size !== entries.length) throw new Error('public source manifest paths collide');
  return { bytes, manifest: { schemaVersion: '1.0.0', artifactId: 'agentic-feature-kit-public-release', entries } };
}

function readPolicy(repoRoot: string): DependencyPolicy {
  const value = readJsonFile(repoRoot, 'release/dependency-license-policy.json').value;
  if (!isRecord(value)
    || value.schemaVersion !== '1.0.0'
    || value.artifactId !== 'agentic-feature-kit-dependency-license-policy'
    || !Array.isArray(value.packageRoots)) throw new Error('dependency license policy is invalid');
  return value as unknown as DependencyPolicy;
}

function readCatalog(repoRoot: string): DependencyCatalog {
  const value = readJsonFile(repoRoot, 'release/dependency-license-catalog.json').value;
  if (!isRecord(value)
    || value.schemaVersion !== '1.0.0'
    || value.artifactId !== 'agentic-feature-kit-dependency-license-catalog'
    || !Array.isArray(value.packages)) throw new Error('dependency license catalog is invalid');
  return value as unknown as DependencyCatalog;
}

export function resolveEmbeddedComponents(repoRoot: string, metafileInputs: string[]): SbomComponent[] {
  if (!Array.isArray(metafileInputs) || metafileInputs.length > 100_000) throw new Error('metafile input inventory is invalid');
  const catalog = readCatalog(repoRoot);
  const catalogById = new Map(catalog.packages.map((item) => [item.id, item]));
  const resolved = new Map<string, SbomComponent>();
  for (const rawInput of [...new Set(metafileInputs)].sort(compareText)) {
    const input = safeRelativePath(rawInput, 'metafile input');
    const segments = input.split('/');
    const marker = segments.lastIndexOf('node_modules');
    if (marker < 0) continue;
    const first = segments[marker + 1];
    const scoped = first?.startsWith('@');
    const second = scoped ? segments[marker + 2] : undefined;
    if (!first || (scoped && !second)) throw new Error(`embedded package path is incomplete: ${input}`);
    const packageName = scoped ? `${first}/${second}` : first;
    const packageSegments = scoped ? [first, second!] : [first];
    const packageRootSegments = [...segments.slice(0, marker + 1), ...packageSegments];
    const packageJsonPath = [...packageRootSegments, 'package.json'].join('/');
    readRegularFile(repoRoot, input, MAX_SOURCE_BYTES, 'embedded package input');
    const packageValue = readJsonFile(repoRoot, packageJsonPath).value;
    if (!isRecord(packageValue)
      || packageValue.name !== packageName
      || typeof packageValue.version !== 'string'
      || typeof packageValue.license !== 'string') {
      throw new Error(`embedded package manifest identity is invalid: ${packageName}`);
    }
    const id = `${packageName}@${packageValue.version}`;
    const reviewed = catalogById.get(id);
    if (!reviewed) throw new Error(`embedded package is absent from reviewed catalog: ${id}`);
    if (reviewed.name !== packageName || reviewed.version !== packageValue.version || reviewed.license !== packageValue.license) {
      throw new Error(`embedded package conflicts with reviewed catalog: ${id}`);
    }
    const component: SbomComponent = {
      name: reviewed.name,
      version: reviewed.version,
      license: reviewed.license,
      purl: npmPackageUrl(reviewed.name, reviewed.version),
      provenance: reviewed.provenance,
      authorities: [...reviewed.authorities],
      role: 'embedded-runtime',
    };
    const previous = resolved.get(component.purl);
    if (previous && canonicalJson(previous) !== canonicalJson(component)) throw new Error(`embedded package resolution is ambiguous: ${id}`);
    resolved.set(component.purl, component);
  }
  return [...resolved.values()].sort((left, right) => compareText(left.purl, right.purl));
}

export function captureSourceSbomInput(
  repoRoot: string,
  sourceDateEpoch: number,
  expectedWorkspaceRoots: number,
  expectedDependencies: number,
): CapturedSourceSbom {
  const { bytes: manifestBytes, manifest } = readSourceManifest(repoRoot);
  let sourceBytes = 0;
  const inventory = manifest.entries.map((entry) => {
    const bytes = readRegularFile(repoRoot, entry.path, MAX_SOURCE_BYTES, 'public source path');
    sourceBytes += bytes.length;
    if (sourceBytes > MAX_SOURCE_BYTES) throw new Error('public source inventory exceeds aggregate byte limit');
    return { path: entry.path, contentKind: entry.contentKind, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const policy = readPolicy(repoRoot);
  const catalog = readCatalog(repoRoot);
  if (policy.packageRoots.length !== expectedWorkspaceRoots) throw new Error(`workspace root count drift: ${policy.packageRoots.length}`);
  if (catalog.packages.length !== expectedDependencies) throw new Error(`dependency count drift: ${catalog.packages.length}`);
  const rootPackage = policy.packageRoots.find(({ path: packagePath }) => packagePath === 'package.json');
  if (!rootPackage || rootPackage.version !== '3.25.0') throw new Error('root source package identity drift');
  const components: SbomComponent[] = [
    ...policy.packageRoots.map((item): SbomComponent => ({
      name: item.name,
      version: item.version,
      license: item.license,
      purl: npmPackageUrl(item.name, item.version),
      provenance: 'package-root',
      authorities: [safeRelativePath(item.path, 'package root path')],
      role: 'workspace-root',
    })),
    ...catalog.packages.map((item): SbomComponent => ({
      name: item.name,
      version: item.version,
      license: item.license,
      purl: npmPackageUrl(item.name, item.version),
      provenance: item.provenance,
      authorities: [...item.authorities],
      role: 'inventory-membership',
    })),
  ];
  return {
    input: {
      artifact: {
        kind: 'source',
        targetId: 'source',
        name: 'agentic-feature-kit-source',
        version: rootPackage.version,
        purl: `pkg:generic/agentic-feature-kit-source@${rootPackage.version}`,
        identitySha256: sha256(canonicalJson(inventory)),
        manifestSha256: sha256(manifestBytes),
        createdEpochSeconds: sourceDateEpoch,
      },
      components,
    },
    sourcePaths: inventory.length,
    sourceBytes,
  };
}

function writePair(outputDir: string, input: SbomBuildInput, pair: SbomPair): SbomOutputFile[] {
  const names = sidecarNames(input.artifact);
  const candidates = [
    { name: names.cycloneDx, text: pair.cycloneDxText },
    { name: names.spdx, text: pair.spdxText },
  ].sort((left, right) => compareText(left.name, right.name));
  fs.mkdirSync(outputDir, { recursive: true });
  const temporaryPaths = candidates.map(({ name }) => path.join(outputDir, `.${name}.tmp`));
  const finalPaths = candidates.map(({ name }) => path.join(outputDir, name));
  if ([...temporaryPaths, ...finalPaths].some((filePath) => fs.existsSync(filePath))) {
    throw new Error('SBOM output set must be absent before atomic write');
  }
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      fs.writeFileSync(temporaryPaths[index], candidates[index].text, { encoding: 'utf8', flag: 'wx' });
    }
    for (let index = 0; index < candidates.length; index += 1) fs.renameSync(temporaryPaths[index], finalPaths[index]);
  } catch (error) {
    for (const filePath of [...temporaryPaths, ...finalPaths]) fs.rmSync(filePath, { force: true });
    throw error;
  }
  return candidates.map(({ name, text }) => ({ name, bytes: Buffer.byteLength(text), sha256: sha256(text) }));
}

export function writeValidatedSbomPair(
  repoRoot: string,
  outputDir: string,
  input: SbomBuildInput,
  registry = loadSchemaRegistry(repoRoot),
): WrittenSbomPair {
  const pair = buildSbomPair(input);
  const findings = [...evaluateSbomPair(input, pair), ...validateSbomPairAgainstSchemas(pair, registry)];
  if (findings.length > 0) throw new Error(`SBOM validation failed: ${findings.join(', ')}`);
  return { pair, files: writePair(outputDir, input, pair) };
}

export function generateSourceSbomSidecars(options: GenerateSourceSbomOptions): GeneratedSourceSbom {
  const sourceDateEpoch = resolveSourceDateEpoch({
    explicit: options.sourceDateEpoch,
    environmentValue: options.sourceDateEpoch === undefined ? options.environmentValue ?? process.env.SOURCE_DATE_EPOCH : undefined,
    gitEpochSeconds: options.sourceDateEpoch === undefined && (options.environmentValue ?? process.env.SOURCE_DATE_EPOCH) === undefined
      ? () => gitEpochSeconds(options.repoRoot)
      : undefined,
  });
  const source = captureSourceSbomInput(
    options.repoRoot,
    sourceDateEpoch,
    options.expectedWorkspaceRoots,
    options.expectedDependencies,
  );
  const registry = loadSchemaRegistry(options.repoRoot);
  const written = writeValidatedSbomPair(options.repoRoot, options.outputDir, source.input, registry);
  return {
    ...written,
    input: source.input,
    sourceDateEpoch,
    identitySha256: source.input.artifact.identitySha256,
    manifestSha256: source.input.artifact.manifestSha256,
    sourcePaths: source.sourcePaths,
    sourceBytes: source.sourceBytes,
    workspaceRoots: options.expectedWorkspaceRoots,
    dependencies: options.expectedDependencies,
  };
}
