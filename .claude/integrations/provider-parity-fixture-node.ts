/**
 * P17-007 A3B2A — provider-neutral one-use lifecycle for the public parity fixture.
 *
 * This module performs bounded local filesystem work only. It launches no process, reads no
 * environment or credentials, executes no test, and never follows aliases during inventory/cleanup.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURE_ID = 'p17-007-provider-parity-golden';
const FIXTURE_REVISION = 1;
const TASK_PROMPT_SHA256 = '07b1eb213bba17b07c38d76019bd0265948d72b939350387f93d1caca5c9509c';
const SEMANTIC_SPEC_SHA256 = '206ae7026488f0d1ea9cfd90d392bb946ebc6726ebf1adbd6936157486d19830';
const SEED_TREE_SHA256 = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const MAX_JSON_NODES = 10_000;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_PATH_BYTES = 512;

const EXPECTED_SEED_FILES = Object.freeze([
  ['AGENTS.md', '6044d236a7c76d0a25e88dc21453bb2cdcaa839e083b1e92cabc666e6ab4396e'],
  ['package.json', '0945ef226fa02944423b5243c32cc4cad9f4bc696db1cce6db3cd3f21d2064bf'],
  ['spec/semantic-spec.json', '5da3ec32fd475b13c83b72e9a2f736747a3d3e7da5d9b3a969ada217e76b89e9'],
  ['src/report.js', 'eca48acaad517dc0b3ae373ddc314b41dbac6ba715d7323a9f6392d7e3363057'],
  ['test/report.test.js', '4cf18bb64bba77d42c1ed6c6cb523840c09f362ea637bfc0bcada5c4ee07eb5e'],
] as const);
const EXPECTED_LOCKED_PATHS = Object.freeze([
  'AGENTS.md',
  'package.json',
  'spec/semantic-spec.json',
  'test/report.test.js',
]);
const EXPECTED_ALLOWED_WRITE_PATHS = Object.freeze([
  'docs/plan.md',
  'src/report.js',
  'test/report.additional.test.js',
]);
const EXPECTED_PHASE_BINDINGS = Object.freeze([
  ['B3', 'planning', '0c79cc6c07014a8c8ef4a839045173aa184a05520b534ab4bb788315e01f287d'],
  ['B10', 'implementation', 'beb5485a673d62153b07c6484fe376296f7b3a27ffdc0058981256f092567a12'],
  ['B11', 'verification', '73dfec19182b0e365648998f54f1067ce1260feb1797dd55b950c6b973a67000'],
] as const);

type JsonRecord = Record<string, unknown>;
type LifecycleState = 'new' | 'materializing' | 'materialized' | 'cleaning' | 'cleaned' | 'failed';

export type ProviderParityFixtureLifecycleErrorCode =
  | 'invalid-options'
  | 'invalid-golden'
  | 'invalid-parent'
  | 'invalid-state'
  | 'materialization-failed'
  | 'cleanup-failed';

export class ProviderParityFixtureLifecycleError extends Error {
  readonly code: ProviderParityFixtureLifecycleErrorCode;

  constructor(code: ProviderParityFixtureLifecycleErrorCode) {
    super(`Provider parity fixture lifecycle: ${code}`);
    this.name = 'ProviderParityFixtureLifecycleError';
    this.code = code;
  }
}

export interface ProviderParityFixtureLifecycleOptions {
  parentRoot: string;
  golden: unknown;
}

export interface ProviderParityFixtureFileMetadata {
  readonly path: string;
  readonly sha256: string;
}

export interface ProviderParityMaterializationReceipt {
  readonly state: 'materialized';
  /** Ephemeral local capability for the later runner; never persist this path as evidence. */
  readonly isolatedRoot: string;
  readonly fixtureId: typeof FIXTURE_ID;
  readonly fixtureRevision: typeof FIXTURE_REVISION;
  readonly seedTreeSha256: typeof SEED_TREE_SHA256;
  readonly materializedTreeSha256: string;
  readonly pathInventorySha256: string;
  readonly fileCount: number;
  readonly files: readonly ProviderParityFixtureFileMetadata[];
  readonly lockedPaths: readonly string[];
  readonly allowedWritePaths: readonly string[];
}

export interface ProviderParityCleanupReceipt {
  readonly state: 'cleaned';
  readonly fixtureId: typeof FIXTURE_ID;
  readonly fixtureRevision: typeof FIXTURE_REVISION;
  readonly materializedTreeSha256: string;
  readonly removedNodeCount: number;
  readonly zeroResidue: true;
}

interface SeedFile {
  path: string;
  content: string;
  sha256: string;
}

interface AdmittedGolden {
  files: readonly SeedFile[];
  lockedPaths: readonly string[];
  allowedWritePaths: readonly string[];
}

interface RootIdentity {
  dev: bigint;
  ino: bigint;
}

function fail(code: ProviderParityFixtureLifecycleErrorCode): never {
  throw new ProviderParityFixtureLifecycleError(code);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  if (Buffer.isBuffer(value)) return crypto.createHash('sha256').update(value).digest('hex');
  const bytes = typeof value === 'string' ? value : JSON.stringify(stableValue(value));
  return crypto.createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function clonePlainJson(value: unknown): unknown {
  const budget = { nodes: 0, bytes: 0 };

  function clone(entry: unknown, depth: number): unknown {
    budget.nodes += 1;
    if (budget.nodes > MAX_JSON_NODES || depth > 64) fail('invalid-golden');
    if (entry === null || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) fail('invalid-golden');
      return entry;
    }
    if (typeof entry === 'string') {
      budget.bytes += Buffer.byteLength(entry, 'utf8');
      if (budget.bytes > MAX_JSON_BYTES) fail('invalid-golden');
      return entry;
    }
    if (typeof entry !== 'object') fail('invalid-golden');

    let prototype: object | null;
    let descriptors: Record<string, PropertyDescriptor>;
    let symbols: symbol[];
    try {
      prototype = Object.getPrototypeOf(entry);
      descriptors = Object.getOwnPropertyDescriptors(entry);
      symbols = Object.getOwnPropertySymbols(entry);
    } catch {
      fail('invalid-golden');
    }
    if (symbols.length !== 0) fail('invalid-golden');

    if (Array.isArray(entry)) {
      if (prototype !== Array.prototype) fail('invalid-golden');
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) fail('invalid-golden');
      const length = lengthDescriptor.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_JSON_NODES) fail('invalid-golden');
      const names = Object.keys(descriptors).filter((name) => name !== 'length');
      if (names.length !== length) fail('invalid-golden');
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('invalid-golden');
        result.push(clone(descriptor.value, depth + 1));
      }
      return result;
    }

    if (prototype !== Object.prototype && prototype !== null) fail('invalid-golden');
    const result: JsonRecord = {};
    for (const name of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[name];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('invalid-golden');
      budget.bytes += Buffer.byteLength(name, 'utf8');
      if (budget.bytes > MAX_JSON_BYTES) fail('invalid-golden');
      result[name] = clone(descriptor.value, depth + 1);
    }
    return result;
  }

  return clone(value, 0);
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-golden');
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((entry, index) => entry !== sortedExpected[index])) {
    fail('invalid-golden');
  }
}

function exactArray(value: unknown, expected: readonly unknown[]): void {
  if (!Array.isArray(value) || value.length !== expected.length) fail('invalid-golden');
  for (let index = 0; index < expected.length; index += 1) {
    if (value[index] !== expected[index]) fail('invalid-golden');
  }
}

function validatePortablePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES) {
    fail('invalid-golden');
  }
  if (value.includes('\\') || /[\u0000-\u001f\u007f<>:"|?*]/.test(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail('invalid-golden');
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment))) {
    fail('invalid-golden');
  }
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  if (segments.some((segment) => reserved.test(segment))) fail('invalid-golden');
  return value;
}

function validateUniqueOrdinalPaths(value: unknown, expected: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) fail('invalid-golden');
  const paths = value.map(validatePortablePath);
  if (paths.length !== expected.length || new Set(paths).size !== paths.length) fail('invalid-golden');
  if (paths.some((entry, index) => entry !== [...paths].sort()[index])) fail('invalid-golden');
  const folded = new Set(paths.map((entry) => entry.toLowerCase()));
  if (folded.size !== paths.length) fail('invalid-golden');
  exactArray(paths, expected);
  return Object.freeze([...paths]);
}

function admitGolden(input: unknown): AdmittedGolden {
  const golden = record(clonePlainJson(input));
  exactKeys(golden, [
    'schemaVersion', 'fixtureId', 'fixtureRevision', 'classification', 'provenance',
    'providerTargets', 'taskPrompt', 'taskPromptSha256', 'semanticSpec', 'semanticSpecSha256',
    'phaseBindings', 'repositorySeed', 'evaluationPolicy',
  ]);
  if (golden.schemaVersion !== '1.0.0' || golden.fixtureId !== FIXTURE_ID ||
      golden.fixtureRevision !== FIXTURE_REVISION || golden.classification !== 'synthetic-public') fail('invalid-golden');
  exactArray(golden.providerTargets, ['codex', 'claude', 'copilot']);

  const provenance = record(golden.provenance);
  exactKeys(provenance, [
    'kind', 'createdFor', 'license', 'containsCustomerData', 'containsCredentials',
    'containsPrivateSpecification', 'containsPersonalData',
  ]);
  if (provenance.kind !== 'synthetic' || provenance.createdFor !== 'P17-007' || provenance.license !== 'Apache-2.0') {
    fail('invalid-golden');
  }
  for (const field of ['containsCustomerData', 'containsCredentials', 'containsPrivateSpecification', 'containsPersonalData']) {
    if (provenance[field] !== false) fail('invalid-golden');
  }

  if (typeof golden.taskPrompt !== 'string' || golden.taskPromptSha256 !== TASK_PROMPT_SHA256 ||
      digest(golden.taskPrompt) !== TASK_PROMPT_SHA256 || golden.semanticSpecSha256 !== SEMANTIC_SPEC_SHA256 ||
      digest(golden.semanticSpec) !== SEMANTIC_SPEC_SHA256) fail('invalid-golden');

  if (!Array.isArray(golden.phaseBindings) || golden.phaseBindings.length !== EXPECTED_PHASE_BINDINGS.length) {
    fail('invalid-golden');
  }
  golden.phaseBindings.forEach((value, index) => {
    const binding = record(value);
    exactKeys(binding, ['phaseId', 'purpose', 'phaseContractSha256']);
    exactArray([binding.phaseId, binding.purpose, binding.phaseContractSha256], EXPECTED_PHASE_BINDINGS[index]);
  });

  const seed = record(golden.repositorySeed);
  exactKeys(seed, [
    'runtime', 'files', 'seedTreeSha256', 'lockedPaths', 'allowedWritePaths', 'testCommand',
    'expectedInitialStatus', 'expectedInitialFailureMarker',
  ]);
  if (seed.runtime !== 'node>=20' || seed.seedTreeSha256 !== SEED_TREE_SHA256 ||
      seed.expectedInitialStatus !== 'failed' || seed.expectedInitialFailureMarker !== 'P17-007 fixture: implementation missing') {
    fail('invalid-golden');
  }
  exactArray(seed.testCommand, ['node', '--test', 'test/report.test.js']);
  const lockedPaths = validateUniqueOrdinalPaths(seed.lockedPaths, EXPECTED_LOCKED_PATHS);
  const allowedWritePaths = validateUniqueOrdinalPaths(seed.allowedWritePaths, EXPECTED_ALLOWED_WRITE_PATHS);

  if (!Array.isArray(seed.files) || seed.files.length !== EXPECTED_SEED_FILES.length) fail('invalid-golden');
  const files: SeedFile[] = seed.files.map((value, index) => {
    const file = record(value);
    exactKeys(file, ['path', 'content', 'sha256']);
    const filePath = validatePortablePath(file.path);
    if (typeof file.content !== 'string' || typeof file.sha256 !== 'string') fail('invalid-golden');
    exactArray([filePath, file.sha256], EXPECTED_SEED_FILES[index]);
    if (digest(file.content) !== file.sha256) fail('invalid-golden');
    return Object.freeze({ path: filePath, content: file.content, sha256: file.sha256 });
  });
  const seedPaths = files.map((file) => file.path);
  if (new Set(seedPaths).size !== seedPaths.length || seedPaths.some((entry, index) => entry !== [...seedPaths].sort()[index])) {
    fail('invalid-golden');
  }
  if (digest(files.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 }))) !== SEED_TREE_SHA256) {
    fail('invalid-golden');
  }

  const policy = record(golden.evaluationPolicy);
  exactKeys(policy, [
    'requiredProviderCount', 'minimumSemanticRunsPerProvider', 'minimumPerformanceRunsPerProvider',
    'requiredAcceptanceCriterionCoverage', 'requiredArtifactCoverage', 'requiredGateConservation',
    'trustedVerificationRequired', 'transportSmokeMayQualify', 'providerRankingWhenIncomplete',
    'maxRunDurationMs', 'maxCapturedOutputBytes', 'attemptsPerRun', 'retainedContent',
  ]);
  const expectedPolicy: JsonRecord = {
    requiredProviderCount: 3,
    minimumSemanticRunsPerProvider: 1,
    minimumPerformanceRunsPerProvider: 5,
    requiredAcceptanceCriterionCoverage: 1,
    requiredArtifactCoverage: 1,
    requiredGateConservation: 1,
    trustedVerificationRequired: true,
    transportSmokeMayQualify: false,
    providerRankingWhenIncomplete: 'forbidden',
    maxRunDurationMs: 1_200_000,
    maxCapturedOutputBytes: 16_777_216,
    attemptsPerRun: 1,
  };
  for (const [key, expected] of Object.entries(expectedPolicy)) if (policy[key] !== expected) fail('invalid-golden');
  exactArray(policy.retainedContent, ['closed-status', 'counts', 'hashes', 'timings', 'token-usage', 'cost']);

  return Object.freeze({ files: Object.freeze(files), lockedPaths, allowedWritePaths });
}

function inspectOptions(value: unknown): { parentRoot: string; golden: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-options');
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
      fail('invalid-options');
    }
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-options');
  }
  const names = Object.keys(descriptors).sort();
  if (names.length !== 2 || names[0] !== 'golden' || names[1] !== 'parentRoot') fail('invalid-options');
  for (const name of names) {
    if (!descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value')) fail('invalid-options');
  }
  const parentRoot = descriptors.parentRoot?.value;
  if (typeof parentRoot !== 'string') fail('invalid-parent');
  return { parentRoot, golden: descriptors.golden?.value };
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  if (samePath(root, candidate)) return true;
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateParentRoot(value: string): { lexical: string; canonical: string; identity: RootIdentity } {
  if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value) || !path.isAbsolute(value)) fail('invalid-parent');
  const lexical = path.resolve(value);
  if (samePath(lexical, path.parse(lexical).root)) fail('invalid-parent');
  try {
    const stat = fs.lstatSync(lexical, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('invalid-parent');
    const canonical = fs.realpathSync.native(lexical);
    if (!samePath(lexical, canonical)) fail('invalid-parent');
    return { lexical, canonical, identity: { dev: stat.dev, ino: stat.ino } };
  } catch (error) {
    if (error instanceof ProviderParityFixtureLifecycleError) throw error;
    fail('invalid-parent');
  }
}

function resolveContained(root: string, relativePath: string): string {
  const candidate = path.resolve(root, ...relativePath.split('/'));
  if (!isWithinOrEqual(root, candidate) || samePath(root, candidate)) fail('materialization-failed');
  return candidate;
}

function directoryIdentity(directory: string): RootIdentity {
  const stat = fs.lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('materialization-failed');
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left: RootIdentity, right: RootIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function verifyRealDirectory(directory: string, canonicalRoot: string): void {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('materialization-failed');
  const canonical = fs.realpathSync.native(directory);
  if (!isWithinOrEqual(canonicalRoot, canonical)) fail('materialization-failed');
}

function inventoryRegularTree(root: string, canonicalRoot: string): readonly ProviderParityFixtureFileMetadata[] {
  verifyRealDirectory(root, canonicalRoot);
  const files: ProviderParityFixtureFileMetadata[] = [];

  function walk(directory: string, prefix: string): void {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      validatePortablePath(relative);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('materialization-failed');
      if (stat.isDirectory()) {
        verifyRealDirectory(absolute, canonicalRoot);
        walk(absolute, relative);
      } else if (stat.isFile()) {
        files.push(Object.freeze({ path: relative, sha256: digest(fs.readFileSync(absolute)) }));
      } else {
        fail('materialization-failed');
      }
    }
  }

  walk(root, '');
  return Object.freeze(files);
}

function removeTreeWithoutFollowingAliases(
  target: string,
  canonicalRoot: string,
  expectedRootIdentity: RootIdentity,
  isRoot: boolean,
): number {
  const stat = fs.lstatSync(target, { bigint: true });
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return 1;
  }
  if (stat.isDirectory()) {
    if (isRoot && !sameIdentity({ dev: stat.dev, ino: stat.ino }, expectedRootIdentity)) fail('cleanup-failed');
    const canonical = fs.realpathSync.native(target);
    if (!isWithinOrEqual(canonicalRoot, canonical)) fail('cleanup-failed');
    let removed = 1;
    for (const child of fs.readdirSync(target).sort()) {
      removed += removeTreeWithoutFollowingAliases(path.join(target, child), canonicalRoot, expectedRootIdentity, false);
    }
    fs.rmdirSync(target);
    return removed;
  }
  if (!stat.isFile()) fail('cleanup-failed');
  fs.unlinkSync(target);
  return 1;
}

function assertAbsent(target: string): void {
  try {
    fs.lstatSync(target);
    fail('cleanup-failed');
  } catch (error) {
    if (error instanceof ProviderParityFixtureLifecycleError) throw error;
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') fail('cleanup-failed');
  }
}

export class ProviderParityFixtureLifecycle {
  private readonly parentRoot: string;
  private readonly canonicalParentRoot: string;
  private readonly parentRootIdentity: RootIdentity;
  private readonly golden: AdmittedGolden;
  private state: LifecycleState = 'new';
  private isolatedRoot: string | undefined;
  private canonicalIsolatedRoot: string | undefined;
  private isolatedRootIdentity: RootIdentity | undefined;
  private materializedTreeSha256: string | undefined;

  constructor(options: ProviderParityFixtureLifecycleOptions) {
    const inspected = inspectOptions(options);
    const parent = validateParentRoot(inspected.parentRoot);
    this.parentRoot = parent.lexical;
    this.canonicalParentRoot = parent.canonical;
    this.parentRootIdentity = parent.identity;
    this.golden = admitGolden(inspected.golden);
  }

  getState(): LifecycleState {
    return this.state;
  }

  materialize(): ProviderParityMaterializationReceipt {
    if (this.state !== 'new') fail('invalid-state');
    this.state = 'materializing';
    try {
      verifyRealDirectory(this.parentRoot, this.canonicalParentRoot);
      if (!sameIdentity(directoryIdentity(this.parentRoot), this.parentRootIdentity)) fail('materialization-failed');
      const isolatedRoot = fs.mkdtempSync(path.join(this.parentRoot, 'p17-007-'));
      if (!samePath(path.dirname(isolatedRoot), this.parentRoot)) fail('materialization-failed');
      this.isolatedRoot = isolatedRoot;
      this.isolatedRootIdentity = directoryIdentity(isolatedRoot);
      this.canonicalIsolatedRoot = isolatedRoot;
      this.canonicalIsolatedRoot = fs.realpathSync.native(isolatedRoot);
      if (!isWithinOrEqual(this.canonicalParentRoot, this.canonicalIsolatedRoot) ||
          samePath(this.canonicalParentRoot, this.canonicalIsolatedRoot)) fail('materialization-failed');

      const directories = new Set<string>();
      for (const file of this.golden.files) {
        const segments = file.path.split('/');
        for (let index = 1; index < segments.length; index += 1) directories.add(segments.slice(0, index).join('/'));
      }
      for (const relative of [...directories].sort((left, right) => {
        const depth = left.split('/').length - right.split('/').length;
        return depth || (left < right ? -1 : left > right ? 1 : 0);
      })) {
        const directory = resolveContained(isolatedRoot, relative);
        fs.mkdirSync(directory, { mode: 0o700 });
        verifyRealDirectory(directory, this.canonicalIsolatedRoot);
      }

      for (const file of this.golden.files) {
        const target = resolveContained(isolatedRoot, file.path);
        verifyRealDirectory(path.dirname(target), this.canonicalIsolatedRoot);
        const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
          (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);
        const handle = fs.openSync(target, flags, 0o600);
        try {
          fs.writeFileSync(handle, file.content, { encoding: 'utf8' });
          fs.fsyncSync(handle);
        } finally {
          fs.closeSync(handle);
        }
      }

      const files = inventoryRegularTree(isolatedRoot, this.canonicalIsolatedRoot);
      if (!sameIdentity(directoryIdentity(isolatedRoot), this.isolatedRootIdentity)) fail('materialization-failed');
      const materializedTreeSha256 = digest(files.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 })));
      if (materializedTreeSha256 !== SEED_TREE_SHA256) fail('materialization-failed');
      this.materializedTreeSha256 = materializedTreeSha256;
      this.state = 'materialized';

      const lockedPaths = Object.freeze([...this.golden.lockedPaths]);
      const allowedWritePaths = Object.freeze([...this.golden.allowedWritePaths]);
      return Object.freeze({
        state: 'materialized' as const,
        isolatedRoot,
        fixtureId: FIXTURE_ID,
        fixtureRevision: FIXTURE_REVISION,
        seedTreeSha256: SEED_TREE_SHA256,
        materializedTreeSha256,
        pathInventorySha256: digest({ lockedPaths, allowedWritePaths }),
        fileCount: files.length,
        files,
        lockedPaths,
        allowedWritePaths,
      });
    } catch (error) {
      this.state = 'failed';
      this.bestEffortCleanup();
      if (error instanceof ProviderParityFixtureLifecycleError && error.code === 'invalid-state') throw error;
      fail('materialization-failed');
    }
  }

  cleanup(): ProviderParityCleanupReceipt {
    if (this.state !== 'materialized' || !this.isolatedRoot || !this.canonicalIsolatedRoot ||
        !this.isolatedRootIdentity || !this.materializedTreeSha256) fail('invalid-state');
    this.state = 'cleaning';
    const isolatedRoot = this.isolatedRoot;
    const canonicalRoot = this.canonicalIsolatedRoot;
    const identity = this.isolatedRootIdentity;
    const materializedTreeSha256 = this.materializedTreeSha256;
    try {
      const removedNodeCount = removeTreeWithoutFollowingAliases(isolatedRoot, canonicalRoot, identity, true);
      assertAbsent(isolatedRoot);
      this.isolatedRoot = undefined;
      this.canonicalIsolatedRoot = undefined;
      this.isolatedRootIdentity = undefined;
      this.state = 'cleaned';
      return Object.freeze({
        state: 'cleaned' as const,
        fixtureId: FIXTURE_ID,
        fixtureRevision: FIXTURE_REVISION,
        materializedTreeSha256,
        removedNodeCount,
        zeroResidue: true as const,
      });
    } catch {
      this.state = 'failed';
      this.bestEffortCleanup();
      fail('cleanup-failed');
    }
  }

  private bestEffortCleanup(): void {
    if (!this.isolatedRoot || !this.canonicalIsolatedRoot || !this.isolatedRootIdentity) return;
    try {
      removeTreeWithoutFollowingAliases(
        this.isolatedRoot,
        this.canonicalIsolatedRoot,
        this.isolatedRootIdentity,
        true,
      );
    } catch {
      // Preserve the original fixed failure. This method never broadens the deletion target.
    }
  }
}

export function createProviderParityFixtureLifecycle(
  options: ProviderParityFixtureLifecycleOptions,
): ProviderParityFixtureLifecycle {
  return new ProviderParityFixtureLifecycle(options);
}
