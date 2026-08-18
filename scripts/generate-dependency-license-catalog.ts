import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type DependencyCatalog,
  type DependencyCatalogPackage,
  type DependencyLicensePolicy,
  type DependencyLicenseProvenance,
} from './public-source-readiness-contract';

const OUTPUT_PATH = 'release/dependency-license-catalog.json';
const REGISTRY_ORIGIN = 'https://registry.npmjs.org';
const CONCURRENCY = 16;

interface LockedPackage {
  name: string;
  version: string;
  authorities: Set<string>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dependencyName(lockPath: string): string | null {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index < 0 ? null : lockPath.slice(index + marker.length);
}

function readJson<T>(root: string, relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8')) as T;
}

async function fetchRegistryLicense(name: string, version: string): Promise<string | null> {
  const response = await fetch(`${REGISTRY_ORIGIN}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`registry metadata request failed for ${name}@${version}: HTTP ${response.status}`);
  const metadata = await response.json() as { license?: string | { type?: string } };
  const declaredLicense = metadata.license;
  if (typeof declaredLicense === 'string' && declaredLicense.trim()) return declaredLicense.trim();
  if (declaredLicense && typeof declaredLicense === 'object'
    && typeof declaredLicense.type === 'string' && declaredLicense.type.trim()) {
    return declaredLicense.type.trim();
  }
  return null;
}

async function mapConcurrent<T, U>(values: readonly T[], worker: (value: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(values.length);
  let cursor = 0;
  async function consume(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, consume));
  return output;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const write = process.argv.slice(2).includes('--write');
  if (!write) throw new Error('refusing to generate without explicit --write');
  const policy = readJson<DependencyLicensePolicy>(root, 'release/dependency-license-policy.json');
  const packages = new Map<string, LockedPackage>();
  for (const lockPath of policy.lockfiles) {
    const lock = readJson<{ packages?: Record<string, { version?: string }> }>(root, lockPath);
    if (!lock.packages) throw new Error(`lockfile has no packages map: ${lockPath}`);
    for (const [packagePath, metadata] of Object.entries(lock.packages)) {
      const name = dependencyName(packagePath);
      if (!name) continue;
      if (!metadata.version) throw new Error(`dependency has no version: ${lockPath}:${packagePath}`);
      const id = `${name}@${metadata.version}`;
      const current = packages.get(id) ?? { name, version: metadata.version, authorities: new Set<string>() };
      current.authorities.add(lockPath);
      packages.set(id, current);
    }
  }
  const overrides = new Map(policy.metadataOverrides.map((value) => [value.id, value]));
  const ordered = [...packages.entries()].sort((left, right) => compareText(left[0], right[0]));
  const rows = await mapConcurrent(ordered, async ([id, locked]): Promise<DependencyCatalogPackage> => {
    const registryLicense = await fetchRegistryLicense(locked.name, locked.version);
    const override = overrides.get(id);
    if (!registryLicense && !override) throw new Error(`registry metadata omits license without reviewed override: ${id}`);
    if (registryLicense && override) throw new Error(`metadata override is stale because registry now asserts a license: ${id}`);
    const license = registryLicense ?? override!.license;
    const provenance: DependencyLicenseProvenance = registryLicense ? 'registry-manifest' : override!.provenance;
    return {
      id,
      name: locked.name,
      version: locked.version,
      license,
      provenance,
      authorities: [...locked.authorities].sort(compareText),
    };
  });
  const catalog: DependencyCatalog = {
    schemaVersion: '1.0.0',
    artifactId: 'agentic-feature-kit-dependency-license-catalog',
    packages: rows,
  };
  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  fs.writeFileSync(path.join(root, ...OUTPUT_PATH.split('/')), output, { encoding: 'utf8', flag: 'w' });
  console.log(`dependency-license-catalog: wrote ${rows.length} packages to ${OUTPUT_PATH}`);
}

void main();
