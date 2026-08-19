import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateSourceSbomSidecars,
  loadSchemaRegistry,
  resolveEmbeddedComponents,
  resolveSourceDateEpoch,
  validateSbomPairAgainstSchemas,
} from './release-sbom-node';

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r5c2a-sbom-node-'));

try {
  assert.equal(resolveSourceDateEpoch({
    explicit: 1_754_000_000,
    environmentValue: 'invalid',
    gitEpochSeconds: () => { throw new Error('must not call Git'); },
  }), 1_754_000_000, 'explicit source date must win');
  assert.equal(resolveSourceDateEpoch({
    environmentValue: '1754000001',
    gitEpochSeconds: () => 1,
  }), 1_754_000_001, 'environment source date must win over Git');
  assert.equal(resolveSourceDateEpoch({ gitEpochSeconds: () => 1_754_000_002 }), 1_754_000_002, 'Git fallback');
  for (const invalid of ['-1', '1.5', '0x10', '', '999999999999999999999']) {
    assert.throws(() => resolveSourceDateEpoch({ environmentValue: invalid }), /SOURCE_DATE_EPOCH/);
  }
  assert.throws(() => resolveSourceDateEpoch({}), /Git source date fallback/);

  const repoRoot = path.join(tempRoot, 'repo');
  const outputDir = path.join(tempRoot, 'output');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Fixture\n', 'utf8');
  writeJson(path.join(repoRoot, 'package.json'), {
    name: 'feature-from-confluence-kit',
    version: '3.25.0',
    private: true,
    license: 'Apache-2.0',
    description: 'Fixture.',
    engines: { node: '>=20' },
  });
  writeJson(path.join(repoRoot, 'release/public-release-manifest.json'), {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-public-release',
    product: { displayName: 'Agentic Feature Kit', slug: 'agentic-feature-kit', license: 'Apache-2.0', packageVisibility: 'private', providers: ['codex', 'claude', 'copilot'] },
    entries: [
      { path: 'README.md', decision: 'include', contentKind: 'text', reasonCode: 'public-source' },
      { path: 'package.json', decision: 'include', contentKind: 'text', reasonCode: 'public-source' },
    ],
  });
  writeJson(path.join(repoRoot, 'release/dependency-license-policy.json'), {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-dependency-license-policy',
    packageRoots: [{
      path: 'package.json',
      name: 'feature-from-confluence-kit',
      version: '3.25.0',
      private: true,
      license: 'Apache-2.0',
      description: 'Fixture.',
      node: '>=20',
    }],
  });
  writeJson(path.join(repoRoot, 'release/dependency-license-catalog.json'), {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-dependency-license-catalog',
    packages: [{
      id: 'typescript@4.9.5',
      name: 'typescript',
      version: '4.9.5',
      license: 'Apache-2.0',
      provenance: 'registry-manifest',
      authorities: ['package-lock.json'],
    }],
  });
  writeJson(path.join(repoRoot, 'node_modules/typescript/package.json'), {
    name: 'typescript',
    version: '4.9.5',
    license: 'Apache-2.0',
  });
  fs.mkdirSync(path.join(repoRoot, 'node_modules/typescript/lib'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/typescript/lib/typescript.js'), 'module.exports = {}\n', 'utf8');
  const embedded = resolveEmbeddedComponents(repoRoot, ['node_modules/typescript/lib/typescript.js']);
  assert.equal(embedded.length, 1);
  assert.deepEqual(embedded[0], {
    name: 'typescript',
    version: '4.9.5',
    license: 'Apache-2.0',
    purl: 'pkg:npm/typescript@4.9.5',
    provenance: 'registry-manifest',
    authorities: ['package-lock.json'],
    role: 'embedded-runtime',
  });
  assert.deepEqual(resolveEmbeddedComponents(repoRoot, [
    'node_modules/typescript/lib/typescript.js',
    'node_modules/typescript/lib/typescript.js',
  ]), embedded, 'duplicate metafile inputs must collapse to one package');
  assert.throws(() => resolveEmbeddedComponents(repoRoot, ['../node_modules/typescript/lib/typescript.js']), /metafile input/);
  assert.throws(() => resolveEmbeddedComponents(repoRoot, ['node_modules/missing/index.js']), /embedded package/);

  const spdxId = 'https://spdx.org/schema/spdx-2.3.schema.json';
  const cdxId = 'https://cyclonedx.org/schema/bom-1.6.schema.json';
  const cdxSpdxId = 'https://cyclonedx.org/schema/spdx.schema.json';
  const jsfId = 'https://cyclonedx.org/schema/jsf-0.82.schema.json';
  const schemas = [
    {
      role: 'cyclonedx-document',
      localPath: 'release/schemas/cyclonedx/bom-1.6.schema.json',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: cdxId,
        type: 'object',
        additionalProperties: true,
        required: ['bomFormat', 'specVersion', 'serialNumber', 'metadata', 'components', 'dependencies'],
        properties: {
          bomFormat: { const: 'CycloneDX' },
          specVersion: { const: '1.6' },
          serialNumber: { type: 'string', pattern: '^urn:uuid:' },
          metadata: { type: 'object' },
          components: { type: 'array' },
          dependencies: { type: 'array' },
        },
      },
      format: 'cyclonedx-1.6',
      upstreamRef: '1.6',
      sourceUrl: 'https://raw.githubusercontent.com/CycloneDX/specification/1.6/schema/bom-1.6.schema.json',
      license: 'Apache-2.0',
    },
    {
      role: 'cyclonedx-jsf',
      localPath: 'release/schemas/cyclonedx/jsf-0.82.schema.json',
      schema: { $schema: 'http://json-schema.org/draft-07/schema#', $id: jsfId, type: 'object' },
      format: 'cyclonedx-1.6',
      upstreamRef: '1.6',
      sourceUrl: 'https://raw.githubusercontent.com/CycloneDX/specification/1.6/schema/jsf-0.82.schema.json',
      license: 'Apache-2.0',
    },
    {
      role: 'cyclonedx-spdx',
      localPath: 'release/schemas/cyclonedx/spdx.schema.json',
      schema: { $schema: 'http://json-schema.org/draft-07/schema#', $id: cdxSpdxId, type: 'string' },
      format: 'cyclonedx-1.6',
      upstreamRef: '1.6',
      sourceUrl: 'https://raw.githubusercontent.com/CycloneDX/specification/1.6/schema/spdx.schema.json',
      license: 'Apache-2.0',
    },
    {
      role: 'spdx-document',
      localPath: 'release/schemas/spdx/spdx-2.3.schema.json',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: spdxId,
        type: 'object',
        additionalProperties: true,
        required: ['SPDXID', 'spdxVersion', 'dataLicense', 'documentNamespace', 'creationInfo', 'packages', 'relationships'],
        properties: {
          SPDXID: { const: 'SPDXRef-DOCUMENT' },
          spdxVersion: { const: 'SPDX-2.3' },
          dataLicense: { const: 'CC0-1.0' },
          documentNamespace: { type: 'string', pattern: '^https://' },
          creationInfo: { type: 'object' },
          packages: { type: 'array' },
          relationships: { type: 'array' },
        },
      },
      format: 'spdx-2.3',
      upstreamRef: 'v2.3',
      sourceUrl: 'https://raw.githubusercontent.com/spdx/spdx-spec/v2.3/schemas/spdx-schema.json',
      license: 'CC-BY-3.0',
    },
  ] as const;
  for (const item of schemas) writeJson(path.join(repoRoot, item.localPath), item.schema);
  writeJson(path.join(repoRoot, 'release/sbom-schema-sources.json'), {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-sbom-schema-sources',
    schemas: schemas.map((item) => ({
      format: item.format,
      role: item.role,
      localPath: item.localPath,
      upstreamRef: item.upstreamRef,
      sourceUrl: item.sourceUrl,
      sha256: sha256(fs.readFileSync(path.join(repoRoot, item.localPath))),
      schemaId: item.schema.$id,
      draft: 'draft-07',
      license: item.license,
    })),
  });

  const registry = loadSchemaRegistry(repoRoot);
  assert.equal(registry.entries.length, 4);
  assert.deepEqual(registry.entries.map(({ role }) => role), [
    'cyclonedx-document', 'cyclonedx-jsf', 'cyclonedx-spdx', 'spdx-document',
  ]);

  const result = generateSourceSbomSidecars({
    repoRoot,
    outputDir,
    sourceDateEpoch: 1_754_000_000,
    expectedWorkspaceRoots: 1,
    expectedDependencies: 1,
  });
  assert.equal(result.workspaceRoots, 1);
  assert.equal(result.dependencies, 1);
  assert.equal(result.sourcePaths, 2);
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.files.map(({ name }) => name), [
    'agentic-feature-kit-source-3.25.0.cdx.json',
    'agentic-feature-kit-source-3.25.0.spdx.json',
  ]);
  for (const file of result.files) {
    const bytes = fs.readFileSync(path.join(outputDir, file.name));
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha256(bytes), file.sha256);
    assert.ok(bytes.toString('utf8').endsWith('\n'));
  }
  assert.equal(validateSbomPairAgainstSchemas(result.pair, registry).length, 0);

  const secondOutput = path.join(tempRoot, 'output-second');
  const second = generateSourceSbomSidecars({
    repoRoot,
    outputDir: secondOutput,
    sourceDateEpoch: 1_754_000_000,
    expectedWorkspaceRoots: 1,
    expectedDependencies: 1,
  });
  assert.deepEqual(second.files, result.files, 'same source must produce byte-identical sidecars');

  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Changed fixture\n', 'utf8');
  const changed = generateSourceSbomSidecars({
    repoRoot,
    outputDir: path.join(tempRoot, 'output-changed'),
    sourceDateEpoch: 1_754_000_000,
    expectedWorkspaceRoots: 1,
    expectedDependencies: 1,
  });
  assert.notEqual(changed.identitySha256, result.identitySha256, 'source content drift must change identity');
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Fixture\n', 'utf8');

  const registryPath = path.join(repoRoot, 'release/sbom-schema-sources.json');
  const registryText = fs.readFileSync(registryPath, 'utf8');
  const registryValue = JSON.parse(registryText) as { schemas: Array<Record<string, unknown>> };
  registryValue.schemas[0].sha256 = '00'.repeat(32);
  writeJson(registryPath, registryValue);
  assert.throws(() => loadSchemaRegistry(repoRoot), /schema digest drift/);
  fs.writeFileSync(registryPath, registryText, 'utf8');

  const mutableValue = JSON.parse(registryText) as { schemas: Array<Record<string, unknown>> };
  mutableValue.schemas[0].sourceUrl = 'https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.6.schema.json';
  writeJson(registryPath, mutableValue);
  assert.throws(() => loadSchemaRegistry(repoRoot), /immutable upstream/);
  fs.writeFileSync(registryPath, registryText, 'utf8');

  const missingReadme = path.join(repoRoot, 'README.md');
  fs.renameSync(missingReadme, `${missingReadme}.missing`);
  assert.throws(() => generateSourceSbomSidecars({
    repoRoot,
    outputDir: path.join(tempRoot, 'output-missing'),
    sourceDateEpoch: 1_754_000_000,
    expectedWorkspaceRoots: 1,
    expectedDependencies: 1,
  }), /public source path/);
  fs.renameSync(`${missingReadme}.missing`, missingReadme);

  const adapterText = fs.readFileSync(path.join(process.cwd(), 'scripts/release-sbom-node.ts'), 'utf8');
  assert.doesNotMatch(adapterText, /node:(?:http|https|net|tls)|\bfetch\s*\(|\bundici\b/);
  console.log('release-sbom-node.test: PASS (2 deterministic sidecars, 4 schemas, 1 embedded package, 3 epoch paths, 10 adapter attacks)');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
