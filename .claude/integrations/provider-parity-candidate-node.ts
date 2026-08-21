/**
 * P17-007 A3B2B — provider-neutral candidate inventory and trusted-test boundary.
 *
 * Candidate bytes and process output remain ephemeral. The module discovers no executable,
 * environment, credential, provider, network, cleanup target, or evidence sink.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

const FIXTURE_ID = 'p17-007-provider-parity-golden';
const FIXTURE_REVISION = 1;
const SEED_TREE_SHA256 = '08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7';
const MAX_FILE_BYTES = 1_048_576;
const MAX_TOTAL_BYTES = 4_194_304;
const MAX_NODES = 64;
const MAX_PATH_BYTES = 512;
const TEST_TIMEOUT_MS = 1_200_000;
const TEST_OUTPUT_BYTES = 16_777_216;
const TEST_ARGS = Object.freeze(['--test', 'test/report.test.js'] as const);

const EXPECTED_FILES = Object.freeze([
  ['AGENTS.md', '6044d236a7c76d0a25e88dc21453bb2cdcaa839e083b1e92cabc666e6ab4396e'],
  ['package.json', '0945ef226fa02944423b5243c32cc4cad9f4bc696db1cce6db3cd3f21d2064bf'],
  ['spec/semantic-spec.json', '5da3ec32fd475b13c83b72e9a2f736747a3d3e7da5d9b3a969ada217e76b89e9'],
  ['src/report.js', 'eca48acaad517dc0b3ae373ddc314b41dbac6ba715d7323a9f6392d7e3363057'],
  ['test/report.test.js', '4cf18bb64bba77d42c1ed6c6cb523840c09f362ea637bfc0bcada5c4ee07eb5e'],
] as const);
const LOCKED_PATHS = Object.freeze(['AGENTS.md', 'package.json', 'spec/semantic-spec.json', 'test/report.test.js'] as const);
const ALLOWED_WRITE_PATHS = Object.freeze(['docs/plan.md', 'src/report.js', 'test/report.additional.test.js'] as const);
const DECLARED_PATHS = Object.freeze([...LOCKED_PATHS, ...ALLOWED_WRITE_PATHS].sort());
const REQUIRED_PATHS = Object.freeze(EXPECTED_FILES.map(([filePath]) => filePath));
const DECLARED_PATH_SET = new Set<string>(DECLARED_PATHS);
const LOCKED_PATH_SET = new Set<string>(LOCKED_PATHS);
const ALLOWED_WRITE_PATH_SET = new Set<string>(ALLOWED_WRITE_PATHS);
const DECLARED_DIRECTORIES = new Set(
  DECLARED_PATHS.flatMap((filePath) => {
    const segments = filePath.split('/');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
  }),
);
const EXPECTED_FILE_HASHES = new Map<string, string>(EXPECTED_FILES);
const ALLOWED_ADDITIONAL_TEST_BUILTINS = new Set(['node:assert', 'node:assert/strict', 'node:test']);

type JsonRecord = Record<string, unknown>;
type VerifierState = 'new' | 'verifying' | 'verified' | 'failed';

interface RootIdentity {
  dev: bigint;
  ino: bigint;
}

interface CandidateFile {
  path: string;
  sha256: string;
  bytes: number;
  mode: number;
  content: Buffer;
}

interface CandidateSnapshot {
  files: readonly CandidateFile[];
  treeSha256: string;
  stateSha256: string;
  lockedPathEvidenceSha256: string;
  allowedPathEvidenceSha256: string;
  fileCount: number;
  totalBytes: number;
  lockedPathEdit: boolean;
  undeclaredPath: boolean;
  externalDependency: boolean;
  secretOrPathDisclosure: boolean;
  permissionWidening: boolean;
}

export type ProviderParityCandidateErrorCode =
  | 'invalid-options'
  | 'invalid-materialization'
  | 'invalid-executable'
  | 'invalid-process-port'
  | 'invalid-state'
  | 'candidate-scan-failed'
  | 'verification-failed';

export class ProviderParityCandidateError extends Error {
  readonly code: ProviderParityCandidateErrorCode;

  constructor(code: ProviderParityCandidateErrorCode) {
    super(`Provider parity candidate verifier: ${code}`);
    this.name = 'ProviderParityCandidateError';
    this.code = code;
  }
}

export interface ProviderParityCandidateProcessRequest {
  readonly executable: string;
  readonly args: readonly string[];
  readonly stdin: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly shell: false;
}

export interface ProviderParityCandidateProcessExecution {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly outputCapped: boolean;
}

export interface ProviderParityCandidateProcessPort {
  execute(input: ProviderParityCandidateProcessRequest): Promise<ProviderParityCandidateProcessExecution>;
}

export interface ProviderParityCandidateVerifierOptions {
  readonly materializationReceipt: unknown;
  readonly nodeExecutable: string;
  readonly processPort: ProviderParityCandidateProcessPort;
}

export interface ProviderParityCandidateViolations {
  readonly lockedPathEdit: boolean;
  readonly undeclaredPath: boolean;
  readonly externalDependency: boolean;
  readonly secretOrPathDisclosure: boolean;
  readonly permissionWidening: boolean;
}

export type ProviderParityCandidateReasonCode =
  | 'locked-path-edit'
  | 'undeclared-path'
  | 'external-dependency'
  | 'secret-or-path-disclosure'
  | 'permission-widening'
  | 'trusted-test-failed'
  | 'candidate-mutated';

export interface ProviderParityTrustedTestMetadata {
  readonly status: 'not-run' | 'passed' | 'failed';
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly outputCapped: boolean;
  readonly signaled: boolean;
  readonly stderrPresent: boolean;
  readonly processFailure: boolean;
  readonly outputBytes: number;
  readonly durationMs: number;
  readonly evidenceSha256: string;
}

export interface ProviderParityCandidateVerificationReceipt {
  readonly state: 'passed' | 'failed';
  readonly fixtureId: typeof FIXTURE_ID;
  readonly fixtureRevision: typeof FIXTURE_REVISION;
  readonly candidateTreeSha256: string;
  readonly preTestTreeSha256: string;
  readonly postTestTreeSha256: string;
  readonly candidateStateSha256: string;
  readonly pathInventorySha256: string;
  readonly lockedPathEvidenceSha256: string;
  readonly allowedPathEvidenceSha256: string;
  readonly testCommandSha256: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly permissionRule: 'posix-mode-v1' | 'windows-node-kind-v1';
  readonly processCallCount: 0 | 1;
  readonly mutationDetected: boolean;
  readonly violations: ProviderParityCandidateViolations;
  readonly reasonCodes: readonly ProviderParityCandidateReasonCode[];
  readonly trustedTest: ProviderParityTrustedTestMetadata;
  readonly verificationEvidenceSha256: string;
}

interface AdmittedOptions {
  isolatedRoot: string;
  nodeExecutable: string;
  processPort: ProviderParityCandidateProcessPort;
  pathInventorySha256: string;
}

function fail(code: ProviderParityCandidateErrorCode): never {
  throw new ProviderParityCandidateError(code);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
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

function exactKeys(value: JsonRecord, expected: readonly string[], code: ProviderParityCandidateErrorCode): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((entry, index) => entry !== wanted[index])) fail(code);
}

function plainDataRecord(value: unknown, code: ProviderParityCandidateErrorCode): JsonRecord {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
        Object.getOwnPropertySymbols(value).length !== 0) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    }
    return value as JsonRecord;
  } catch (error) {
    if (error instanceof ProviderParityCandidateError) throw error;
    fail(code);
  }
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function contained(root: string, candidate: string): boolean {
  if (samePath(root, candidate)) return true;
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function portablePath(value: unknown): string {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES ||
      value.includes('\\') || /[\u0000-\u001f\u007f<>:"|?*]/.test(value) ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail('invalid-materialization');
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment))) {
    fail('invalid-materialization');
  }
  return value;
}

function exactFrozenStringArray(value: unknown, expected: readonly string[]): void {
  if (!Array.isArray(value) || !Object.isFrozen(value) || value.length !== expected.length) fail('invalid-materialization');
  value.forEach((entry, index) => {
    if (portablePath(entry) !== expected[index]) fail('invalid-materialization');
  });
}

function admitMaterialization(value: unknown): { isolatedRoot: string; pathInventorySha256: string } {
  const receipt = plainDataRecord(value, 'invalid-materialization');
  if (!Object.isFrozen(value)) fail('invalid-materialization');
  exactKeys(receipt, [
    'state', 'isolatedRoot', 'fixtureId', 'fixtureRevision', 'seedTreeSha256',
    'materializedTreeSha256', 'pathInventorySha256', 'fileCount', 'files',
    'lockedPaths', 'allowedWritePaths',
  ], 'invalid-materialization');
  if (receipt.state !== 'materialized' || receipt.fixtureId !== FIXTURE_ID ||
      receipt.fixtureRevision !== FIXTURE_REVISION || receipt.seedTreeSha256 !== SEED_TREE_SHA256 ||
      receipt.materializedTreeSha256 !== SEED_TREE_SHA256 || receipt.fileCount !== EXPECTED_FILES.length ||
      typeof receipt.pathInventorySha256 !== 'string') fail('invalid-materialization');

  exactFrozenStringArray(receipt.lockedPaths, LOCKED_PATHS);
  exactFrozenStringArray(receipt.allowedWritePaths, ALLOWED_WRITE_PATHS);
  const expectedInventory = digest({ lockedPaths: LOCKED_PATHS, allowedWritePaths: ALLOWED_WRITE_PATHS });
  if (receipt.pathInventorySha256 !== expectedInventory) fail('invalid-materialization');

  if (!Array.isArray(receipt.files) || !Object.isFrozen(receipt.files) || receipt.files.length !== EXPECTED_FILES.length) {
    fail('invalid-materialization');
  }
  receipt.files.forEach((entry, index) => {
    const file = plainDataRecord(entry, 'invalid-materialization');
    if (!Object.isFrozen(entry)) fail('invalid-materialization');
    exactKeys(file, ['path', 'sha256'], 'invalid-materialization');
    if (portablePath(file.path) !== EXPECTED_FILES[index][0] || file.sha256 !== EXPECTED_FILES[index][1]) {
      fail('invalid-materialization');
    }
  });

  if (typeof receipt.isolatedRoot !== 'string' || !receipt.isolatedRoot.trim() ||
      /[\u0000-\u001f\u007f]/.test(receipt.isolatedRoot) || !path.isAbsolute(receipt.isolatedRoot)) {
    fail('invalid-materialization');
  }
  const isolatedRoot = path.resolve(receipt.isolatedRoot);
  if (samePath(isolatedRoot, path.parse(isolatedRoot).root)) fail('invalid-materialization');
  return { isolatedRoot, pathInventorySha256: expectedInventory };
}

function admitOptions(value: ProviderParityCandidateVerifierOptions): AdmittedOptions {
  const options = plainDataRecord(value, 'invalid-options');
  exactKeys(options, ['materializationReceipt', 'nodeExecutable', 'processPort'], 'invalid-options');
  const materialization = admitMaterialization(options.materializationReceipt);
  if (typeof options.nodeExecutable !== 'string' || !options.nodeExecutable.trim() ||
      /[\u0000-\u001f\u007f]/.test(options.nodeExecutable) || !path.isAbsolute(options.nodeExecutable)) {
    fail('invalid-executable');
  }
  const nodeExecutable = path.resolve(options.nodeExecutable);
  const processPort = plainDataRecord(options.processPort, 'invalid-process-port');
  exactKeys(processPort, ['execute'], 'invalid-process-port');
  if (typeof processPort.execute !== 'function') fail('invalid-process-port');
  return {
    ...materialization,
    nodeExecutable,
    processPort: options.processPort as ProviderParityCandidateProcessPort,
  };
}

function identity(stat: fs.BigIntStats): RootIdentity {
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left: RootIdentity, right: RootIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function rootIdentityFromHandle(handle: number): RootIdentity {
  const stat = fs.fstatSync(handle, { bigint: true });
  if (!stat.isDirectory()) fail('candidate-scan-failed');
  return identity(stat);
}

function assertPinnedRoot(root: string, canonicalRoot: string, handle: number, expected: RootIdentity): void {
  const liveHandle = rootIdentityFromHandle(handle);
  const stat = fs.lstatSync(root, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(liveHandle, expected) ||
      !sameIdentity(identity(stat), expected)) fail('candidate-scan-failed');
  const canonical = fs.realpathSync.native(root);
  if (!samePath(canonical, canonicalRoot)) fail('candidate-scan-failed');
}

function stripComments(source: string): string {
  let result = '';
  let index = 0;
  let quote: '"' | "'" | '`' | null = null;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (quote) {
      result += current;
      if (current === '\\') {
        if (next !== undefined) { result += next; index += 2; continue; }
      } else if (current === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (current === '"' || current === "'" || current === '`') {
      quote = current;
      result += current;
      index += 1;
      continue;
    }
    if (current === '/' && next === '/') {
      result += '  ';
      index += 2;
      while (index < source.length && source[index] !== '\n') { result += ' '; index += 1; }
      continue;
    }
    if (current === '/' && next === '*') {
      result += '  ';
      index += 2;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          result += '  ';
          index += 2;
          break;
        }
        result += source[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }
    result += current;
    index += 1;
  }
  return result;
}

function hasExternalDependency(filePath: string, bytes: Buffer): boolean {
  if (!filePath.endsWith('.js')) return false;
  const source = stripComments(bytes.toString('utf8'));
  if (/\brequire\s*\(|\bcreateRequire\b|\bmodule\s*\.\s*require\b|\bimport\s*\.\s*meta\s*\.\s*resolve\b/.test(source)) {
    return true;
  }
  const specifiers: string[] = [];
  const staticPattern = /\b(?:import|export)\s+(?:[^'"\r\n]*?\sfrom\s*)?(['"])([^'"\r\n]+)\1/g;
  const dynamicPattern = /\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) specifiers.push(match[2]);
  }
  const dynamicCount = source.match(/\bimport\s*\(/g)?.length ?? 0;
  const literalDynamicCount = [...source.matchAll(dynamicPattern)].length;
  if (dynamicCount !== literalDynamicCount) return true;
  return specifiers.some((specifier) => {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      if (specifier.includes('\\') || /[?#\u0000-\u001f\u007f]/.test(specifier)) return true;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier));
      return resolved === '..' || resolved.startsWith('../') || !DECLARED_PATH_SET.has(resolved);
    }
    return filePath !== 'test/report.additional.test.js' || !ALLOWED_ADDITIONAL_TEST_BUILTINS.has(specifier);
  });
}

function hasDisclosure(bytes: Buffer, isolatedRoot?: string): boolean {
  const text = bytes.toString('utf8');
  if (isolatedRoot && (process.platform === 'win32'
    ? text.toLowerCase().includes(isolatedRoot.toLowerCase())
    : text.includes(isolatedRoot))) return true;
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(text) ||
    /\b(?:gh[pousr]_|sk-(?:proj-)?|AKIA)[A-Za-z0-9_-]{12,}/.test(text) ||
    /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*['"][^'"\r\n]{8,}['"]/i.test(text) ||
    /(?:\b[A-Za-z]:[\\/][^\s'\"<>|]+|\/(?:Users|home|root|tmp|workspace)\/[^\s'\"<>]*)/i.test(text) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
}

function permissionWidened(mode: number, directory: boolean): boolean {
  if (process.platform === 'win32') return false;
  return directory ? (mode & 0o022) !== 0 : (mode & 0o133) !== 0;
}

function readRegularFile(target: string, stat: fs.BigIntStats): Buffer {
  if (stat.size > BigInt(MAX_FILE_BYTES)) fail('candidate-scan-failed');
  const flags = fs.constants.O_RDONLY | (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);
  const handle = fs.openSync(target, flags);
  try {
    const openedBefore = fs.fstatSync(handle, { bigint: true });
    if (!openedBefore.isFile() || !sameIdentity(identity(openedBefore), identity(stat))) fail('candidate-scan-failed');
    const content = fs.readFileSync(handle);
    const openedAfter = fs.fstatSync(handle, { bigint: true });
    if (content.byteLength > MAX_FILE_BYTES || !sameIdentity(identity(openedBefore), identity(openedAfter)) ||
        openedBefore.size !== openedAfter.size) fail('candidate-scan-failed');
    return content;
  } finally {
    fs.closeSync(handle);
  }
}

function inventoryCandidate(root: string, canonicalRoot: string, handle: number, rootIdentity: RootIdentity): CandidateSnapshot {
  assertPinnedRoot(root, canonicalRoot, handle, rootIdentity);
  const files: CandidateFile[] = [];
  let totalBytes = 0;
  let nodeCount = 0;
  let undeclaredPath = false;
  let permissionWidening = false;

  function walk(directory: string, relativeDirectory: string): void {
    const directoryStat = fs.lstatSync(directory, { bigint: true });
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('candidate-scan-failed');
    const canonicalDirectory = fs.realpathSync.native(directory);
    if (!contained(canonicalRoot, canonicalDirectory)) fail('candidate-scan-failed');
    if (permissionWidened(Number(directoryStat.mode), true)) permissionWidening = true;

    const names = fs.readdirSync(directory, { encoding: 'utf8' }).sort();
    for (const name of names) {
      nodeCount += 1;
      if (nodeCount > MAX_NODES) fail('candidate-scan-failed');
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      if (Buffer.byteLength(relativePath, 'utf8') > MAX_PATH_BYTES) fail('candidate-scan-failed');
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target, { bigint: true });
      if (stat.isSymbolicLink()) {
        undeclaredPath = true;
        continue;
      }
      if (stat.isDirectory()) {
        if (!DECLARED_DIRECTORIES.has(relativePath)) {
          undeclaredPath = true;
          continue;
        }
        walk(target, relativePath);
        continue;
      }
      if (!stat.isFile() || !DECLARED_PATH_SET.has(relativePath)) {
        undeclaredPath = true;
        continue;
      }
      const content = readRegularFile(target, stat);
      totalBytes += content.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) fail('candidate-scan-failed');
      const mode = Number(stat.mode) & 0o777;
      if (permissionWidened(mode, false)) permissionWidening = true;
      files.push({ path: relativePath, sha256: digest(content), bytes: content.byteLength, mode, content });
    }
  }

  walk(root, '');
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const observed = new Map(files.map((file) => [file.path, file]));
  const lockedPathEdit = LOCKED_PATHS.some((filePath) => observed.get(filePath)?.sha256 !== EXPECTED_FILE_HASHES.get(filePath));
  if (REQUIRED_PATHS.some((filePath) => !observed.has(filePath))) undeclaredPath = true;
  if (files.length > DECLARED_PATHS.length) undeclaredPath = true;

  const writableFiles = files.filter((file) => ALLOWED_WRITE_PATH_SET.has(file.path));
  const externalDependency = writableFiles.some((file) => hasExternalDependency(file.path, file.content));
  const secretOrPathDisclosure = writableFiles.some((file) => hasDisclosure(file.content, root));
  const metadata = files.map(({ path: filePath, sha256, bytes, mode }) => ({ path: filePath, sha256, bytes, mode }));
  const tree = metadata.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 }));
  const locked = metadata.filter((file) => LOCKED_PATH_SET.has(file.path));
  const allowed = metadata.filter((file) => ALLOWED_WRITE_PATH_SET.has(file.path));
  assertPinnedRoot(root, canonicalRoot, handle, rootIdentity);
  return {
    files: Object.freeze(files),
    treeSha256: digest(tree),
    stateSha256: digest(metadata),
    lockedPathEvidenceSha256: digest(locked),
    allowedPathEvidenceSha256: digest(allowed),
    fileCount: files.length,
    totalBytes,
    lockedPathEdit,
    undeclaredPath,
    externalDependency,
    secretOrPathDisclosure,
    permissionWidening,
  };
}

function safeProcessExecution(value: unknown): ProviderParityCandidateProcessExecution | null {
  try {
    const result = plainDataRecord(value, 'verification-failed');
    exactKeys(result, ['exitCode', 'signal', 'stdout', 'stderr', 'timedOut', 'outputCapped'], 'verification-failed');
    if ((result.exitCode !== null && (!Number.isSafeInteger(result.exitCode) || (result.exitCode as number) < 0 || (result.exitCode as number) > 255)) ||
        (result.signal !== null && (typeof result.signal !== 'string' || /[\u0000-\u001f\u007f]/.test(result.signal) || result.signal.length > 64)) ||
        typeof result.stdout !== 'string' || typeof result.stderr !== 'string' ||
        typeof result.timedOut !== 'boolean' || typeof result.outputCapped !== 'boolean') return null;
    return result as unknown as ProviderParityCandidateProcessExecution;
  } catch {
    return null;
  }
}

function candidateViolations(snapshot: CandidateSnapshot): ProviderParityCandidateViolations {
  return Object.freeze({
    lockedPathEdit: snapshot.lockedPathEdit,
    undeclaredPath: snapshot.undeclaredPath,
    externalDependency: snapshot.externalDependency,
    secretOrPathDisclosure: snapshot.secretOrPathDisclosure,
    permissionWidening: snapshot.permissionWidening,
  });
}

function hasViolation(violations: ProviderParityCandidateViolations): boolean {
  return Object.values(violations).some(Boolean);
}

function notRunMetadata(violations: ProviderParityCandidateViolations): ProviderParityTrustedTestMetadata {
  const closed = {
    status: 'not-run' as const,
    exitCode: null,
    timedOut: false,
    outputCapped: false,
    signaled: false,
    stderrPresent: false,
    processFailure: false,
    outputBytes: 0,
    durationMs: 0,
  };
  return Object.freeze({ ...closed, evidenceSha256: digest({ ...closed, violations }) });
}

function reasonCodes(
  violations: ProviderParityCandidateViolations,
  trustedTest: ProviderParityTrustedTestMetadata,
  mutationDetected: boolean,
): readonly ProviderParityCandidateReasonCode[] {
  const reasons: ProviderParityCandidateReasonCode[] = [];
  if (violations.lockedPathEdit) reasons.push('locked-path-edit');
  if (violations.undeclaredPath) reasons.push('undeclared-path');
  if (violations.externalDependency) reasons.push('external-dependency');
  if (violations.secretOrPathDisclosure) reasons.push('secret-or-path-disclosure');
  if (violations.permissionWidening) reasons.push('permission-widening');
  if (trustedTest.status === 'failed') reasons.push('trusted-test-failed');
  if (mutationDetected) reasons.push('candidate-mutated');
  return Object.freeze(reasons);
}

export class ProviderParityCandidateVerifier {
  private readonly options: AdmittedOptions;
  private state: VerifierState = 'new';

  constructor(options: ProviderParityCandidateVerifierOptions) {
    this.options = admitOptions(options);
  }

  getState(): VerifierState {
    return this.state;
  }

  async verify(): Promise<ProviderParityCandidateVerificationReceipt> {
    if (this.state !== 'new') fail('invalid-state');
    this.state = 'verifying';
    const { isolatedRoot, nodeExecutable, processPort, pathInventorySha256 } = this.options;
    let handle: number | undefined;
    try {
      const lexicalStat = fs.lstatSync(isolatedRoot, { bigint: true });
      if (!lexicalStat.isDirectory() || lexicalStat.isSymbolicLink()) fail('candidate-scan-failed');
      const canonicalRoot = fs.realpathSync.native(isolatedRoot);
      if (!samePath(isolatedRoot, canonicalRoot)) fail('candidate-scan-failed');
      const flags = fs.constants.O_RDONLY |
        (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0) |
        (typeof fs.constants.O_DIRECTORY === 'number' ? fs.constants.O_DIRECTORY : 0);
      handle = fs.openSync(isolatedRoot, flags);
      const pinnedIdentity = rootIdentityFromHandle(handle);
      if (!sameIdentity(identity(lexicalStat), pinnedIdentity)) fail('candidate-scan-failed');

      const before = inventoryCandidate(isolatedRoot, canonicalRoot, handle, pinnedIdentity);
      let violations = candidateViolations(before);
      let processCallCount: 0 | 1 = 0;
      let trustedTest = notRunMetadata(violations);

      if (!hasViolation(violations)) {
        processCallCount = 1;
        const request: ProviderParityCandidateProcessRequest = Object.freeze({
          executable: nodeExecutable,
          args: TEST_ARGS,
          stdin: '',
          cwd: isolatedRoot,
          timeoutMs: TEST_TIMEOUT_MS,
          maxOutputBytes: TEST_OUTPUT_BYTES,
          shell: false as const,
        });
        const started = performance.now();
        let rawResult: unknown;
        let processFailure = false;
        try {
          rawResult = await processPort.execute(request);
        } catch {
          rawResult = null;
          processFailure = true;
        }
        const durationMs = Math.max(0, Number((performance.now() - started).toFixed(3)));
        const result = safeProcessExecution(rawResult);
        if (!result) processFailure = true;
        const stdout = result?.stdout ?? '';
        const stderr = result?.stderr ?? '';
        const measuredBytes = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8');
        const outputBytes = Math.min(measuredBytes, TEST_OUTPUT_BYTES + 1);
        const outputDisclosure = hasDisclosure(Buffer.from(`${stdout}\n${stderr}`, 'utf8'), isolatedRoot);
        if (outputDisclosure) {
          violations = Object.freeze({ ...violations, secretOrPathDisclosure: true });
        }
        const timedOut = result?.timedOut ?? false;
        const outputCapped = (result?.outputCapped ?? false) || measuredBytes > TEST_OUTPUT_BYTES;
        const signaled = result?.signal !== null && result?.signal !== undefined;
        const stderrPresent = stderr.length !== 0;
        const passed = !processFailure && result?.exitCode === 0 && !timedOut && !outputCapped && !signaled &&
          !stderrPresent && !outputDisclosure;
        const closed = {
          status: passed ? 'passed' as const : 'failed' as const,
          exitCode: result?.exitCode ?? null,
          timedOut,
          outputCapped,
          signaled,
          stderrPresent,
          processFailure,
          outputBytes,
          durationMs,
        };
        trustedTest = Object.freeze({
          ...closed,
          evidenceSha256: digest({
            ...closed,
            stdoutSha256: digest(stdout),
            stderrSha256: digest(stderr),
            testCommandSha256: digest(['node', ...TEST_ARGS]),
          }),
        });
      }

      const after = inventoryCandidate(isolatedRoot, canonicalRoot, handle, pinnedIdentity);
      const afterViolations = candidateViolations(after);
      violations = Object.freeze({
        lockedPathEdit: violations.lockedPathEdit || afterViolations.lockedPathEdit,
        undeclaredPath: violations.undeclaredPath || afterViolations.undeclaredPath,
        externalDependency: violations.externalDependency || afterViolations.externalDependency,
        secretOrPathDisclosure: violations.secretOrPathDisclosure || afterViolations.secretOrPathDisclosure,
        permissionWidening: violations.permissionWidening || afterViolations.permissionWidening,
      });
      const mutationDetected = before.stateSha256 !== after.stateSha256;
      const reasons = reasonCodes(violations, trustedTest, mutationDetected);
      const state = reasons.length === 0 && trustedTest.status === 'passed' ? 'passed' as const : 'failed' as const;
      const receiptWithoutHash: Omit<ProviderParityCandidateVerificationReceipt, 'verificationEvidenceSha256'> = {
        state,
        fixtureId: FIXTURE_ID,
        fixtureRevision: FIXTURE_REVISION,
        candidateTreeSha256: after.treeSha256,
        preTestTreeSha256: before.treeSha256,
        postTestTreeSha256: after.treeSha256,
        candidateStateSha256: after.stateSha256,
        pathInventorySha256,
        lockedPathEvidenceSha256: after.lockedPathEvidenceSha256,
        allowedPathEvidenceSha256: after.allowedPathEvidenceSha256,
        testCommandSha256: digest(['node', ...TEST_ARGS]),
        fileCount: after.fileCount,
        totalBytes: after.totalBytes,
        permissionRule: process.platform === 'win32' ? 'windows-node-kind-v1' as const : 'posix-mode-v1' as const,
        processCallCount,
        mutationDetected,
        violations,
        reasonCodes: reasons,
        trustedTest,
      };
      const receipt = Object.freeze({
        ...receiptWithoutHash,
        verificationEvidenceSha256: digest(receiptWithoutHash),
      });
      this.state = state === 'passed' ? 'verified' : 'failed';
      return receipt;
    } catch (error) {
      this.state = 'failed';
      if (error instanceof ProviderParityCandidateError) throw error;
      return fail('verification-failed');
    } finally {
      if (handle !== undefined) {
        try {
          fs.closeSync(handle);
        } catch {
          this.state = 'failed';
          fail('verification-failed');
        }
      }
    }
  }
}

export function createProviderParityCandidateVerifier(
  options: ProviderParityCandidateVerifierOptions,
): ProviderParityCandidateVerifier {
  return new ProviderParityCandidateVerifier(options);
}
