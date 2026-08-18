import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  evaluateDependencyLicenseContract,
  type DependencyCatalog,
  type DependencyLicenseContractInput,
  type DependencyLicensePolicy,
  type PackageLockInput,
  type PackageRootInput,
} from './public-source-readiness-contract';

let passed = 0;
let failed = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function lock(name: string, packages: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return {
    name,
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name,
        version: '1.0.0',
        private: true,
        license: 'Apache-2.0',
        engines: { node: '>=20' },
      },
      ...packages,
    },
  };
}

function dependency(version: string): Record<string, unknown> {
  return {
    version,
    resolved: `https://registry.npmjs.org/example/-/example-${version}.tgz`,
    integrity: `sha512-${'A'.repeat(86)}==`,
  };
}

function fixture(): DependencyLicenseContractInput {
  const lockfiles: PackageLockInput[] = [
    {
      path: 'package-lock.json',
      value: lock('agentic-feature-kit', {
        'node_modules/alpha': dependency('1.0.0'),
        'node_modules/reviewed': dependency('2.0.0'),
      }),
    },
    {
      path: 'tool/package-lock.json',
      value: lock('@agentic-feature-kit/tool', {
        'node_modules/alpha': dependency('1.0.0'),
        'node_modules/override': dependency('3.0.0'),
      }),
    },
  ];
  const catalog: DependencyCatalog = {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-dependency-license-catalog',
    packages: [
      {
        id: 'alpha@1.0.0', name: 'alpha', version: '1.0.0', license: 'MIT',
        provenance: 'registry-manifest', authorities: ['package-lock.json', 'tool/package-lock.json'],
      },
      {
        id: 'override@3.0.0', name: 'override', version: '3.0.0', license: 'MIT',
        provenance: 'registry-tarball-license', authorities: ['tool/package-lock.json'],
      },
      {
        id: 'reviewed@2.0.0', name: 'reviewed', version: '2.0.0', license: 'MPL-2.0',
        provenance: 'registry-manifest', authorities: ['package-lock.json'],
      },
    ],
  };
  const policy: DependencyLicensePolicy = {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-dependency-license-policy',
    lockfiles: ['package-lock.json', 'tool/package-lock.json'],
    allowedLicenses: ['0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MIT'],
    reviewedExceptions: [
      { id: 'reviewed@2.0.0', license: 'MPL-2.0', rationale: 'Development-only accessibility tooling.' },
    ],
    metadataOverrides: [
      {
        id: 'override@3.0.0', license: 'MIT', provenance: 'registry-tarball-license',
        evidence: 'Exact registry tarball contains the MIT license text.',
      },
    ],
    packageRoots: [
      {
        path: 'package.json', name: 'agentic-feature-kit', version: '1.0.0', private: true,
        license: 'Apache-2.0', description: 'Provider-neutral root.', node: '>=20',
      },
      {
        path: 'tool/package.json', name: '@agentic-feature-kit/tool', version: '1.0.0', private: true,
        license: 'Apache-2.0', description: 'Provider-neutral tool.', node: '>=20',
      },
    ],
  };
  const packageRoots: PackageRootInput[] = policy.packageRoots.map((expected) => ({
    path: expected.path,
    value: {
      name: expected.name,
      version: expected.version,
      private: expected.private,
      license: expected.license,
      description: expected.description,
      engines: { node: expected.node },
    },
  }));
  return { lockfiles, catalog, policy, packageRoots };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function codes(input: DependencyLicenseContractInput): string[] {
  return evaluateDependencyLicenseContract(input).findings.map((finding) => finding.code);
}

async function main(): Promise<void> {
  await test('canonical multi-lock catalog accepts permissive, reviewed, and tarball-provenance packages', () => {
    const result = evaluateDependencyLicenseContract(fixture());
    assert.deepEqual(result.findings, []);
    assert.equal(result.lockfiles, 2);
    assert.equal(result.occurrences, 4);
    assert.equal(result.uniquePackages, 3);
    assert.equal(result.reviewedPackages, 1);
    assert.equal(result.metadataOverrides, 1);
    assert.deepEqual(result.licenseCounts, { MIT: 2, 'MPL-2.0': 1 });
  });

  await test('missing, corrupt, unsupported, non-registry, and unbound lock entries fail closed', () => {
    const cases: Array<{ code: string; mutate: (value: DependencyLicenseContractInput) => void }> = [
      { code: 'license-lockfile-missing', mutate: (value) => value.lockfiles.pop() },
      { code: 'license-lockfile-invalid', mutate: (value) => { value.lockfiles[0].value = []; } },
      { code: 'license-lockfile-version', mutate: (value) => { (value.lockfiles[0].value as any).lockfileVersion = 1; } },
      {
        code: 'license-dependency-version-missing',
        mutate: (value) => { delete (value.lockfiles[0].value as any).packages['node_modules/alpha'].version; },
      },
      {
        code: 'license-dependency-resolved-invalid',
        mutate: (value) => { (value.lockfiles[0].value as any).packages['node_modules/alpha'].resolved = 'git+https://example.invalid/repo.git'; },
      },
      {
        code: 'license-dependency-integrity-missing',
        mutate: (value) => { delete (value.lockfiles[0].value as any).packages['node_modules/alpha'].integrity; },
      },
    ];
    for (const value of cases) {
      const input = clone(fixture());
      value.mutate(input);
      assert.ok(codes(input).includes(value.code), value.code);
    }
  });

  await test('catalog set, identity, authority, license, and ordering drift fail closed', () => {
    const cases: Array<{ code: string; mutate: (value: DependencyLicenseContractInput) => void }> = [
      { code: 'license-catalog-package-missing', mutate: (value) => value.catalog.packages.pop() },
      {
        code: 'license-catalog-package-extra',
        mutate: (value) => value.catalog.packages.push({
          id: 'zeta@1.0.0', name: 'zeta', version: '1.0.0', license: 'MIT',
          provenance: 'registry-manifest', authorities: ['package-lock.json'],
        }),
      },
      { code: 'license-catalog-id-invalid', mutate: (value) => { value.catalog.packages[0].id = 'wrong@1.0.0'; } },
      { code: 'license-catalog-authority-drift', mutate: (value) => { value.catalog.packages[0].authorities = ['package-lock.json']; } },
      { code: 'license-catalog-order-invalid', mutate: (value) => { value.catalog.packages.reverse(); } },
      { code: 'license-catalog-license-invalid', mutate: (value) => { value.catalog.packages[0].license = 'UNKNOWN'; } },
    ];
    for (const value of cases) {
      const input = clone(fixture());
      value.mutate(input);
      assert.ok(codes(input).includes(value.code), value.code);
    }
  });

  await test('unreviewed special, denied, wildcard, and mismatched exception licenses fail closed', () => {
    const unreviewed = clone(fixture());
    unreviewed.policy.reviewedExceptions = [];
    assert.ok(codes(unreviewed).includes('license-policy-review-required'));

    const denied = clone(fixture());
    denied.catalog.packages[0].license = 'GPL-3.0-only';
    assert.ok(codes(denied).includes('license-policy-denied'));

    const wildcard = clone(fixture());
    wildcard.policy.reviewedExceptions[0].id = 'reviewed@*';
    assert.ok(codes(wildcard).includes('license-policy-exception-invalid'));

    const mismatch = clone(fixture());
    mismatch.policy.reviewedExceptions[0].license = 'MIT';
    assert.ok(codes(mismatch).includes('license-policy-review-required'));
  });

  await test('non-manifest provenance requires one exact metadata override', () => {
    const missing = clone(fixture());
    missing.policy.metadataOverrides = [];
    assert.ok(codes(missing).includes('license-policy-override-required'));

    const wildcard = clone(fixture());
    wildcard.policy.metadataOverrides[0].id = 'override@*';
    assert.ok(codes(wildcard).includes('license-policy-override-invalid'));
  });

  await test('package-root metadata and lock root identity are exact', () => {
    const metadata = clone(fixture());
    (metadata.packageRoots[1].value as any).private = false;
    assert.ok(codes(metadata).includes('license-package-root-metadata-drift'));

    const lockRoot = clone(fixture());
    (lockRoot.lockfiles[1].value as any).packages[''].name = 'legacy-tool';
    assert.ok(codes(lockRoot).includes('license-lock-root-metadata-drift'));
  });

  await test('current four-lock dependency catalog and policy pass offline', () => {
    const root = process.cwd();
    const policy = JSON.parse(fs.readFileSync(path.join(root, 'release', 'dependency-license-policy.json'), 'utf8')) as DependencyLicensePolicy;
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'release', 'dependency-license-catalog.json'), 'utf8')) as DependencyCatalog;
    const lockfiles = policy.lockfiles.map((relativePath) => ({
      path: relativePath,
      value: JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8')) as unknown,
    }));
    const packageRoots = policy.packageRoots.map((expected) => ({
      path: expected.path,
      value: JSON.parse(fs.readFileSync(path.join(root, ...expected.path.split('/')), 'utf8')) as unknown,
    }));
    const result = evaluateDependencyLicenseContract({ lockfiles, catalog, policy, packageRoots });
    assert.deepEqual(result.findings, [], JSON.stringify(result.findings, null, 2));
    assert.equal(result.lockfiles, 4);
    assert.equal(result.occurrences, 749);
    assert.equal(result.uniquePackages, 616);
    assert.equal(result.reviewedPackages, 5);
    assert.equal(result.metadataOverrides, 4);
    assert.deepEqual(result.licenseCounts, {
      '0BSD': 1,
      '(MPL-2.0 OR Apache-2.0)': 1,
      'Apache-2.0': 22,
      'BSD-2-Clause': 5,
      'BSD-3-Clause': 12,
      'CC-BY-4.0': 1,
      ISC: 51,
      MIT: 520,
      'MPL-2.0': 2,
      Unlicense: 1,
    });
    console.log(`CURRENT lockfiles=${result.lockfiles} occurrences=${result.occurrences} unique=${result.uniquePackages}`);
  });

  if (failed > 0) {
    console.error(`public-source-readiness-license.test: FAIL (${passed} passed, ${failed} failed)`);
    process.exit(1);
  }
  console.log(`public-source-readiness-license.test: PASS (${passed} tests)`);
}

void main();
