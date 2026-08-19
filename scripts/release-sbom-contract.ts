const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SPDX_EXPRESSION_PATTERN = /^[A-Za-z0-9.+() -]+$/;
const MAX_EPOCH_SECONDS = 253_402_300_799;

export type SbomArtifactKind = 'source' | 'provider';
export type SbomComponentRole = 'workspace-root' | 'inventory-membership' | 'embedded-runtime';
export type SbomComponentProvenance =
  | 'package-root'
  | 'registry-manifest'
  | 'registry-tarball-license'
  | 'registry-tarball-readme';

export interface SbomArtifactIdentity {
  kind: SbomArtifactKind;
  targetId: string;
  name: string;
  version: string;
  purl: string;
  identitySha256: string;
  manifestSha256: string;
  artifactSha256?: string;
  createdEpochSeconds: number;
}

export interface SbomComponent {
  name: string;
  version: string;
  license: string;
  purl: string;
  provenance: SbomComponentProvenance;
  authorities: string[];
  role: SbomComponentRole;
}

export interface SbomBuildInput {
  artifact: SbomArtifactIdentity;
  components: SbomComponent[];
}

export interface SpdxPackage {
  SPDXID: string;
  name: string;
  versionInfo: string;
  downloadLocation: 'NOASSERTION';
  filesAnalyzed: false;
  licenseConcluded: string;
  licenseDeclared: string;
  copyrightText: 'NOASSERTION';
  externalRefs: Array<{
    referenceCategory: 'PACKAGE-MANAGER';
    referenceType: 'purl';
    referenceLocator: string;
  }>;
  checksums?: Array<{ algorithm: 'SHA256'; checksumValue: string }>;
  comment: string;
}

export interface SpdxRelationship {
  spdxElementId: string;
  relationshipType: 'CONTAINS' | 'DEPENDS_ON' | 'DESCRIBES' | 'OTHER';
  relatedSpdxElement: string;
  comment?: string;
}

export interface SpdxDocument {
  SPDXID: 'SPDXRef-DOCUMENT';
  spdxVersion: string;
  dataLicense: string;
  name: string;
  documentNamespace: string;
  creationInfo: {
    created: string;
    creators: ['Tool: agentic-feature-kit-release-sbom/1.0.0'];
  };
  packages: SpdxPackage[];
  relationships: SpdxRelationship[];
}

export interface CycloneDxProperty {
  name: string;
  value: string;
}

export interface CycloneDxComponent {
  type: 'application' | 'library';
  'bom-ref': string;
  name: string;
  version: string;
  purl: string;
  licenses: Array<{ expression: string }>;
  properties: CycloneDxProperty[];
  hashes?: Array<{ alg: 'SHA-256'; content: string }>;
}

export interface CycloneDxDocument {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: 1;
  metadata: {
    timestamp: string;
    tools: { components: Array<{ type: 'application'; name: string; version: string }> };
    component: CycloneDxComponent;
  };
  components: CycloneDxComponent[];
  dependencies: Array<{ ref: string; dependsOn: string[] }>;
}

export interface SbomPair {
  spdx: SpdxDocument;
  cycloneDx: CycloneDxDocument;
  spdxText: string;
  cycloneDxText: string;
}

export interface SbomSidecarNames {
  spdx: string;
  cycloneDx: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertString(value: string, pattern: RegExp, label: string): void {
  if (!pattern.test(value)) throw new Error(`${label} is invalid`);
}

function assertSha256(value: string | undefined, label: string): asserts value is string {
  if (value === undefined || !SHA256_PATTERN.test(value)) throw new Error(`${label} must be lowercase SHA-256`);
}

function assertSpdxExpression(value: string): void {
  if (
    value.length === 0
    || value.length > 128
    || ['NOASSERTION', 'UNKNOWN', 'UNLICENSED'].includes(value)
    || !SPDX_EXPRESSION_PATTERN.test(value)
  ) {
    throw new Error('component license must be a reviewed SPDX expression');
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON requires a finite JSON number');
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('canonical JSON cannot contain a cycle');
    seen.add(value);
    const result = value.map((item) => canonicalValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) throw new Error('canonical JSON cannot contain a cycle');
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareText)) result[key] = canonicalValue(value[key], seen);
    seen.delete(value);
    return result;
  }
  throw new Error('canonical JSON contains an unsupported JSON value');
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalValue(value, new Set<object>()), null, 2)}\n`;
}

export function npmPackageUrl(name: string, version: string): string {
  const unscoped = /^[a-z0-9][a-z0-9._~-]*$/;
  const scoped = /^@([a-z0-9][a-z0-9._~-]*)\/([a-z0-9][a-z0-9._~-]*)$/;
  let encodedName: string;
  const scopedMatch = scoped.exec(name);
  if (scopedMatch) encodedName = `%40${scopedMatch[1]}/${scopedMatch[2]}`;
  else if (unscoped.test(name)) encodedName = name;
  else throw new Error('npm package name is invalid');
  assertString(version, SEMVER_PATTERN, 'package version');
  return `pkg:npm/${encodedName}@${version}`;
}

function validateArtifact(artifact: SbomArtifactIdentity): void {
  if (!['source', 'provider'].includes(artifact.kind)) throw new Error('artifact kind is invalid');
  assertString(artifact.targetId, /^[a-z0-9][a-z0-9-]{0,63}$/, 'artifact targetId');
  assertString(artifact.name, /^[a-z0-9][a-z0-9-]{0,127}$/, 'artifact name');
  assertString(artifact.version, SEMVER_PATTERN, 'artifact version');
  if (
    !artifact.purl.startsWith('pkg:generic/')
    || artifact.purl.length > 512
    || /[?#\\\s]/.test(artifact.purl)
    || artifact.purl.includes('@localhost')
  ) {
    throw new Error('artifact purl is invalid');
  }
  assertSha256(artifact.identitySha256, 'artifact identity');
  assertSha256(artifact.manifestSha256, 'artifact manifest');
  if (!Number.isSafeInteger(artifact.createdEpochSeconds)
    || artifact.createdEpochSeconds < 0
    || artifact.createdEpochSeconds > MAX_EPOCH_SECONDS) {
    throw new Error('artifact source date epoch is invalid');
  }
  if (artifact.kind === 'provider') assertSha256(artifact.artifactSha256, 'provider archive');
  else if (artifact.artifactSha256 !== undefined) throw new Error('source artifact must not declare an archive hash');
}

function validateComponents(input: SbomBuildInput): SbomComponent[] {
  if (!Array.isArray(input.components) || input.components.length === 0 || input.components.length > 10_000) {
    throw new Error('component inventory size is invalid');
  }
  const seenPurls = new Set<string>();
  const normalized = [...input.components].sort((left, right) => compareText(left.purl, right.purl));
  for (const component of normalized) {
    if (component.purl !== npmPackageUrl(component.name, component.version)) {
      throw new Error(`component purl does not match ${component.name}@${component.version}`);
    }
    if (seenPurls.has(component.purl)) throw new Error(`duplicate component purl: ${component.purl}`);
    seenPurls.add(component.purl);
    assertSpdxExpression(component.license);
    if (!['package-root', 'registry-manifest', 'registry-tarball-license', 'registry-tarball-readme'].includes(component.provenance)) {
      throw new Error(`component provenance is invalid: ${component.purl}`);
    }
    if (!Array.isArray(component.authorities) || component.authorities.length === 0) {
      throw new Error(`component authorities are required: ${component.purl}`);
    }
    for (let index = 0; index < component.authorities.length; index += 1) {
      const authority = component.authorities[index];
      if (
        typeof authority !== 'string'
        || authority.length === 0
        || authority.length > 512
        || authority.includes('\\')
        || authority.includes('\0')
        || authority.startsWith('/')
        || authority.normalize('NFC') !== authority
        || (index > 0 && compareText(component.authorities[index - 1], authority) >= 0)
      ) {
        throw new Error(`component authorities must be unique ordinal relative paths: ${component.purl}`);
      }
    }
    if (input.artifact.kind === 'source') {
      if (!['workspace-root', 'inventory-membership'].includes(component.role)) {
        throw new Error('source components may only describe roots or inventory membership');
      }
      if (component.role === 'workspace-root' && component.provenance !== 'package-root') {
        throw new Error('workspace roots require package-root provenance');
      }
      if (component.role === 'inventory-membership' && component.provenance === 'package-root') {
        throw new Error('inventory dependencies require registry provenance');
      }
    } else if (component.role !== 'embedded-runtime' || component.provenance === 'package-root') {
      throw new Error('provider components must be registry-proven embedded runtime packages');
    }
  }
  if (input.artifact.kind === 'source') {
    if (!normalized.some(({ role }) => role === 'workspace-root')) throw new Error('source inventory requires a workspace root');
    if (!normalized.some(({ role }) => role === 'inventory-membership')) throw new Error('source inventory requires dependency membership');
  }
  return normalized;
}

function deterministicUuid(sha256: string): string {
  const chars = sha256.slice(0, 32).split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function componentComment(component: SbomComponent): string {
  return [
    `agentic-feature-kit:role=${component.role}`,
    `agentic-feature-kit:provenance=${component.provenance}`,
    `agentic-feature-kit:authorities=${JSON.stringify(component.authorities)}`,
  ].join(';');
}

function componentProperties(component: SbomComponent): CycloneDxProperty[] {
  return [
    { name: 'agentic-feature-kit:authorities', value: JSON.stringify(component.authorities) },
    { name: 'agentic-feature-kit:provenance', value: component.provenance },
    { name: 'agentic-feature-kit:role', value: component.role },
  ].sort((left, right) => compareText(left.name, right.name));
}

function artifactProperties(artifact: SbomArtifactIdentity): CycloneDxProperty[] {
  return [
    { name: 'agentic-feature-kit:identity-sha256', value: artifact.identitySha256 },
    { name: 'agentic-feature-kit:kind', value: artifact.kind },
    { name: 'agentic-feature-kit:manifest-sha256', value: artifact.manifestSha256 },
    { name: 'agentic-feature-kit:target-id', value: artifact.targetId },
  ].sort((left, right) => compareText(left.name, right.name));
}

function buildSpdx(input: SbomBuildInput, components: SbomComponent[], timestamp: string): SpdxDocument {
  const rootId = 'SPDXRef-Package-Artifact';
  const packages: SpdxPackage[] = [
    {
      SPDXID: rootId,
      name: input.artifact.name,
      versionInfo: input.artifact.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'Apache-2.0',
      licenseDeclared: 'Apache-2.0',
      copyrightText: 'NOASSERTION',
      externalRefs: [{
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: input.artifact.purl,
      }],
      ...(input.artifact.artifactSha256
        ? { checksums: [{ algorithm: 'SHA256' as const, checksumValue: input.artifact.artifactSha256 }] }
        : {}),
      comment: [
        `agentic-feature-kit:kind=${input.artifact.kind}`,
        `agentic-feature-kit:identity-sha256=${input.artifact.identitySha256}`,
        `agentic-feature-kit:manifest-sha256=${input.artifact.manifestSha256}`,
        `agentic-feature-kit:target-id=${input.artifact.targetId}`,
      ].join(';'),
    },
    ...components.map((component, index): SpdxPackage => ({
      SPDXID: `SPDXRef-Package-${String(index + 1).padStart(5, '0')}`,
      name: component.name,
      versionInfo: component.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: component.license,
      licenseDeclared: component.license,
      copyrightText: 'NOASSERTION',
      externalRefs: [{
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: component.purl,
      }],
      comment: componentComment(component),
    })),
  ];
  const documentRelationship: SpdxRelationship = {
    spdxElementId: 'SPDXRef-DOCUMENT',
    relationshipType: 'DESCRIBES',
    relatedSpdxElement: rootId,
  };
  const relationships: SpdxRelationship[] = [
    documentRelationship,
    ...components.map((component, index): SpdxRelationship => {
      const relatedSpdxElement = `SPDXRef-Package-${String(index + 1).padStart(5, '0')}`;
      if (component.role === 'workspace-root') {
        return { spdxElementId: rootId, relationshipType: 'CONTAINS', relatedSpdxElement };
      }
      if (component.role === 'embedded-runtime') {
        return { spdxElementId: rootId, relationshipType: 'DEPENDS_ON', relatedSpdxElement };
      }
      return {
        spdxElementId: rootId,
        relationshipType: 'OTHER',
        relatedSpdxElement,
        comment: 'inventory membership from reviewed lockfile authority; not runtime reachability',
      };
    }),
  ].sort((left, right) => compareText(
    `${left.spdxElementId}\0${left.relationshipType}\0${left.relatedSpdxElement}\0${left.comment ?? ''}`,
    `${right.spdxElementId}\0${right.relationshipType}\0${right.relatedSpdxElement}\0${right.comment ?? ''}`,
  ));
  return {
    SPDXID: 'SPDXRef-DOCUMENT',
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    name: `${input.artifact.name}-${input.artifact.identitySha256.slice(0, 12)}`,
    documentNamespace: `https://sbom.agentic-feature-kit.invalid/${input.artifact.targetId}/${input.artifact.identitySha256}`,
    creationInfo: {
      created: timestamp,
      creators: ['Tool: agentic-feature-kit-release-sbom/1.0.0'],
    },
    packages,
    relationships,
  };
}

function buildCycloneDx(input: SbomBuildInput, components: SbomComponent[], timestamp: string): CycloneDxDocument {
  const rootRef = `urn:agentic-feature-kit:${input.artifact.kind}:${input.artifact.targetId}:${input.artifact.identitySha256}`;
  const root: CycloneDxComponent = {
    type: 'application',
    'bom-ref': rootRef,
    name: input.artifact.name,
    version: input.artifact.version,
    purl: input.artifact.purl,
    licenses: [{ expression: 'Apache-2.0' }],
    properties: artifactProperties(input.artifact),
    ...(input.artifact.artifactSha256
      ? { hashes: [{ alg: 'SHA-256' as const, content: input.artifact.artifactSha256 }] }
      : {}),
  };
  const cycloneComponents = components.map((component): CycloneDxComponent => ({
    type: component.role === 'workspace-root' ? 'application' : 'library',
    'bom-ref': component.purl,
    name: component.name,
    version: component.version,
    purl: component.purl,
    licenses: [{ expression: component.license }],
    properties: componentProperties(component),
  }));
  const embedded = components
    .filter(({ role }) => role === 'embedded-runtime')
    .map(({ purl }) => purl)
    .sort(compareText);
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${deterministicUuid(input.artifact.identitySha256)}`,
    version: 1,
    metadata: {
      timestamp,
      tools: {
        components: [{ type: 'application', name: 'agentic-feature-kit-release-sbom', version: '1.0.0' }],
      },
      component: root,
    },
    components: cycloneComponents,
    dependencies: [
      { ref: rootRef, dependsOn: embedded },
      ...cycloneComponents.map((component) => ({ ref: component['bom-ref'], dependsOn: [] as string[] })),
    ],
  };
}

export function sidecarNames(artifact: SbomArtifactIdentity): SbomSidecarNames {
  validateArtifact(artifact);
  const base = artifact.kind === 'source'
    ? `agentic-feature-kit-source-${artifact.version}`
    : `agentic-feature-kit-${artifact.targetId}-${artifact.version}`;
  return { spdx: `${base}.spdx.json`, cycloneDx: `${base}.cdx.json` };
}

export function buildSbomPair(input: SbomBuildInput): SbomPair {
  validateArtifact(input.artifact);
  const components = validateComponents(input);
  const timestamp = new Date(input.artifact.createdEpochSeconds * 1_000).toISOString();
  const spdx = buildSpdx(input, components, timestamp);
  const cycloneDx = buildCycloneDx(input, components, timestamp);
  return {
    spdx,
    cycloneDx,
    spdxText: canonicalJson(spdx),
    cycloneDxText: canonicalJson(cycloneDx),
  };
}

export function evaluateSbomPair(input: SbomBuildInput, pair: SbomPair): string[] {
  const expected = buildSbomPair(input);
  const findings: string[] = [];
  if (canonicalJson(pair.spdx) !== expected.spdxText) findings.push('spdx-semantic-drift');
  if (canonicalJson(pair.cycloneDx) !== expected.cycloneDxText) findings.push('cyclonedx-semantic-drift');
  if (pair.spdxText !== canonicalJson(pair.spdx)) findings.push('spdx-serialization-drift');
  if (pair.cycloneDxText !== canonicalJson(pair.cycloneDx)) findings.push('cyclonedx-serialization-drift');
  return findings.sort(compareText);
}
