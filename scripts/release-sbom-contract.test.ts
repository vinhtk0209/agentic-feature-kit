import assert from 'node:assert/strict';
import {
  buildSbomPair,
  canonicalJson,
  evaluateSbomPair,
  npmPackageUrl,
  type SbomBuildInput,
  type SbomPair,
} from './release-sbom-contract';

const hashA = '11'.repeat(32);
const hashB = '22'.repeat(32);
const hashC = '33'.repeat(32);
const epoch = 1_754_000_000;

const sourceInput: SbomBuildInput = {
  artifact: {
    kind: 'source',
    targetId: 'source',
    name: 'agentic-feature-kit-source',
    version: '3.25.0',
    purl: 'pkg:generic/agentic-feature-kit-source@3.25.0',
    identitySha256: hashA,
    manifestSha256: hashB,
    createdEpochSeconds: epoch,
  },
  components: [
    {
      name: '@agentic-feature-kit/confluence-mcp',
      version: '1.0.0',
      license: 'Apache-2.0',
      purl: npmPackageUrl('@agentic-feature-kit/confluence-mcp', '1.0.0'),
      provenance: 'package-root',
      authorities: ['.claude/mcp-server/package.json'],
      role: 'workspace-root',
    },
    {
      name: 'ajv',
      version: '8.20.0',
      license: 'MIT',
      purl: npmPackageUrl('ajv', '8.20.0'),
      provenance: 'registry-manifest',
      authorities: ['.claude/mcp-server/package-lock.json', '.claude/mcp-workflow/package-lock.json'],
      role: 'inventory-membership',
    },
    {
      name: 'typescript',
      version: '4.9.5',
      license: 'Apache-2.0',
      purl: npmPackageUrl('typescript', '4.9.5'),
      provenance: 'registry-manifest',
      authorities: ['package-lock.json'],
      role: 'inventory-membership',
    },
  ],
};

const providerInput: SbomBuildInput = {
  artifact: {
    kind: 'provider',
    targetId: 'codex',
    name: 'agentic-feature-kit-codex',
    version: '0.5.0',
    purl: 'pkg:generic/agentic-feature-kit-codex@0.5.0',
    identitySha256: hashC,
    manifestSha256: hashB,
    artifactSha256: hashA,
    createdEpochSeconds: epoch,
  },
  components: [
    {
      name: 'typescript',
      version: '4.9.5',
      license: 'Apache-2.0',
      purl: npmPackageUrl('typescript', '4.9.5'),
      provenance: 'registry-manifest',
      authorities: ['package-lock.json'],
      role: 'embedded-runtime',
    },
  ],
};

assert.equal(
  npmPackageUrl('@scope/package', '1.2.3'),
  'pkg:npm/%40scope/package@1.2.3',
  'scoped npm Package URLs must encode the leading at-sign',
);
assert.equal(npmPackageUrl('plain', '1.2.3'), 'pkg:npm/plain@1.2.3');
assert.throws(() => npmPackageUrl('../plain', '1.2.3'), /npm package name/);
assert.throws(() => npmPackageUrl('plain', 'latest'), /package version/);

assert.equal(
  canonicalJson({ z: 1, a: { y: true, b: ['x', { d: 4, c: 3 }] } }),
  '{\n  "a": {\n    "b": [\n      "x",\n      {\n        "c": 3,\n        "d": 4\n      }\n    ],\n    "y": true\n  },\n  "z": 1\n}\n',
  'canonical JSON must recursively sort object keys and end with one LF',
);
assert.throws(() => canonicalJson({ value: Number.NaN }), /finite JSON number/);
assert.throws(() => canonicalJson({ value: undefined }), /unsupported JSON value/);

const source = buildSbomPair(sourceInput);
const sourceReordered = buildSbomPair({
  ...sourceInput,
  components: [...sourceInput.components].reverse(),
});
assert.equal(source.spdxText, sourceReordered.spdxText, 'SPDX bytes must ignore input component order');
assert.equal(source.cycloneDxText, sourceReordered.cycloneDxText, 'CycloneDX bytes must ignore input component order');
assert.equal(source.spdx.spdxVersion, 'SPDX-2.3');
assert.equal(source.spdx.dataLicense, 'CC0-1.0');
assert.equal(source.spdx.creationInfo.created, '2025-07-31T22:13:20.000Z');
assert.equal(source.spdx.packages.length, 4, 'source SPDX contains artifact plus all components');
assert.equal(source.cycloneDx.bomFormat, 'CycloneDX');
assert.equal(source.cycloneDx.specVersion, '1.6');
assert.equal(source.cycloneDx.components.length, 3);
assert.match(source.cycloneDx.serialNumber, /^urn:uuid:[0-9a-f-]{36}$/);
assert.equal(source.cycloneDx.dependencies[0].dependsOn.length, 0, 'source inventory is not mislabeled runtime reachability');
assert.ok(source.spdxText.endsWith('\n') && !source.spdxText.endsWith('\n\n'));
assert.ok(source.cycloneDxText.endsWith('\n') && !source.cycloneDxText.endsWith('\n\n'));
assert.equal(evaluateSbomPair(sourceInput, source).length, 0, 'canonical source pair must pass');

const provider = buildSbomPair(providerInput);
assert.equal(provider.spdx.packages.length, 2);
assert.deepEqual(
  provider.cycloneDx.dependencies[0].dependsOn,
  [npmPackageUrl('typescript', '4.9.5')],
  'provider root must depend only on embedded runtime components',
);
assert.equal(evaluateSbomPair(providerInput, provider).length, 0, 'canonical provider pair must pass');

function clonePair(value: SbomPair): SbomPair {
  return structuredClone(value);
}

const mutations: Array<{ name: string; mutate: (pair: SbomPair) => void }> = [
  { name: 'SPDX version', mutate: (pair) => { pair.spdx.spdxVersion = 'SPDX-2.2'; } },
  { name: 'SPDX data license', mutate: (pair) => { pair.spdx.dataLicense = 'Apache-2.0'; } },
  { name: 'SPDX namespace', mutate: (pair) => { pair.spdx.documentNamespace += '-random'; } },
  { name: 'SPDX package license', mutate: (pair) => { pair.spdx.packages[1].licenseDeclared = 'NOASSERTION'; } },
  { name: 'SPDX dangling relationship', mutate: (pair) => { pair.spdx.relationships[0].relatedSpdxElement = 'SPDXRef-Missing'; } },
  { name: 'CycloneDX format', mutate: (pair) => { pair.cycloneDx.bomFormat = 'NotCycloneDX'; } },
  { name: 'CycloneDX version', mutate: (pair) => { pair.cycloneDx.specVersion = '1.5'; } },
  { name: 'CycloneDX serial', mutate: (pair) => { pair.cycloneDx.serialNumber = 'urn:uuid:00000000-0000-4000-8000-000000000000'; } },
  { name: 'CycloneDX license', mutate: (pair) => { pair.cycloneDx.components[0].licenses[0].expression = 'NOASSERTION'; } },
  { name: 'CycloneDX purl', mutate: (pair) => { pair.cycloneDx.components[0].purl += '?token=secret'; } },
  { name: 'CycloneDX dangling dependency', mutate: (pair) => { pair.cycloneDx.dependencies[0].dependsOn = ['pkg:npm/missing@1.0.0']; } },
];

for (const attack of mutations) {
  const mutated = clonePair(provider);
  attack.mutate(mutated);
  assert.ok(evaluateSbomPair(providerInput, mutated).length > 0, `${attack.name} mutation must fail`);
}

const invalidInputs: Array<{ name: string; input: SbomBuildInput }> = [
  { name: 'negative epoch', input: { ...sourceInput, artifact: { ...sourceInput.artifact, createdEpochSeconds: -1 } } },
  { name: 'fractional epoch', input: { ...sourceInput, artifact: { ...sourceInput.artifact, createdEpochSeconds: 1.5 } } },
  { name: 'bad identity hash', input: { ...sourceInput, artifact: { ...sourceInput.artifact, identitySha256: 'ABC' } } },
  { name: 'provider missing archive hash', input: { ...providerInput, artifact: { ...providerInput.artifact, artifactSha256: undefined } } },
  { name: 'source with archive hash', input: { ...sourceInput, artifact: { ...sourceInput.artifact, artifactSha256: hashC } } },
  { name: 'duplicate purl', input: { ...sourceInput, components: [sourceInput.components[0], sourceInput.components[0]] } },
  { name: 'unordered authorities', input: { ...sourceInput, components: [{ ...sourceInput.components[1], authorities: ['z', 'a'] }] } },
  { name: 'unreviewed license', input: { ...sourceInput, components: [{ ...sourceInput.components[0], license: 'NOASSERTION' }] } },
  { name: 'credential purl', input: { ...sourceInput, components: [{ ...sourceInput.components[0], purl: 'pkg:npm/plain@1.0.0?token=secret' }] } },
  { name: 'source embedded role', input: { ...sourceInput, components: [{ ...sourceInput.components[0], role: 'embedded-runtime' }] } },
  { name: 'provider inventory role', input: { ...providerInput, components: [{ ...providerInput.components[0], role: 'inventory-membership' }] } },
];

for (const attack of invalidInputs) {
  assert.throws(() => buildSbomPair(attack.input), Error, `${attack.name} input must fail`);
}

assert.doesNotMatch(source.spdxText + source.cycloneDxText, /(?:[A-Za-z]:\\|\\Users\\|localhost|username|hostname|processId|token=)/i);
console.log(`release-sbom-contract.test: PASS (2 canonical pairs, ${mutations.length} document mutations, ${invalidInputs.length} input attacks)`);
