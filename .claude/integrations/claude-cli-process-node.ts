/**
 * P17-007 A3B1 — deny-default Node implementation of the Claude process port.
 *
 * The caller supplies an exact isolated root and environment. This module never reads process.env,
 * discovers credentials, or launches a shell. Tests inject every process and termination boundary.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import type { ClaudeProcessExecution, ClaudeProcessPort, ClaudeProcessRequest } from './claude-cli-adapter';

const MAX_ENVIRONMENT_ENTRIES = 64;
const MAX_ENVIRONMENT_BYTES = 32_768;
const MAX_ENVIRONMENT_VALUE_BYTES = 8_192;
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_BYTES = 65_536;
const MAX_STDIN_BYTES = 65_536;
const MAX_TIMEOUT_MS = 1_200_000;
const MAX_OUTPUT_BYTES = 16_777_216;
const MAX_TERMINATION_GRACE_MS = 30_000;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const SUPPORTED_PLATFORMS = new Set<NodeJS.Platform>([
  'aix', 'android', 'cygwin', 'darwin', 'freebsd', 'haiku', 'linux', 'openbsd', 'sunos', 'win32',
]);

export type ClaudeNodeSpawnFactory = (
  executable: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: false;
    detached: boolean;
    stdio: ['pipe', 'pipe', 'pipe'];
    windowsHide: true;
  },
) => ChildProcessWithoutNullStreams;

export type ClaudeNodeTimerHandle = number | NodeJS.Timeout;

export interface ClaudeNodeProcessPortOptions {
  isolatedRoot: string;
  environment: Readonly<Record<string, string>>;
  terminationGraceMs?: number;
  spawnFactory?: ClaudeNodeSpawnFactory;
  platform?: NodeJS.Platform;
  /** Injectable so offline tests never issue OS-level process termination. */
  terminateTree?: (child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform) => void;
  /** Injectable so lifecycle attacks can prove timer ownership without waiting on the wall clock. */
  timer?: {
    set(callback: () => void, delayMs: number): ClaudeNodeTimerHandle;
    clear(handle: ClaudeNodeTimerHandle): void;
  };
}

export class ClaudeNodeProcessPortError extends Error {
  constructor(message: string) {
    super(`Claude Node process port: ${message}`);
    this.name = 'ClaudeNodeProcessPortError';
  }
}

function fail(message: string): never {
  throw new ClaudeNodeProcessPortError(message);
}

function boundedPositiveInteger(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    fail(`${field} must be a positive safe integer at most ${maximum}`);
  }
  return value as number;
}

function boundedText(value: unknown, field: string, allowLineBreaks = false): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-blank string`);
  const forbidden = allowLineBreaks ? /\u0000/ : /[\u0000-\u001f\u007f]/;
  if (forbidden.test(value)) fail(`${field} contains a forbidden control character`);
  return value;
}

function validateIsolatedRoot(value: unknown): string {
  const supplied = boundedText(value, 'isolatedRoot');
  if (!path.isAbsolute(supplied)) fail('isolatedRoot must be absolute');
  const resolved = path.resolve(supplied);
  if (resolved === path.parse(resolved).root) fail('isolatedRoot must not be a filesystem root');
  return resolved;
}

function copyEnvironment(value: unknown, platform: NodeJS.Platform): Readonly<NodeJS.ProcessEnv> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('environment must be a plain object');
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    fail('environment must be inspectable without side effects');
  }
  if (prototype !== Object.prototype && prototype !== null) fail('environment must have a plain or null prototype');
  if (symbols.length !== 0) fail('environment must not contain symbol keys');
  const names = Object.keys(descriptors).sort();
  if (names.length > MAX_ENVIRONMENT_ENTRIES) fail(`environment must contain at most ${MAX_ENVIRONMENT_ENTRIES} entries`);

  const result = Object.create(null) as NodeJS.ProcessEnv;
  const folded = new Set<string>();
  let totalBytes = 0;
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      fail('environment entries must be own string data properties');
    }
    if (!ENVIRONMENT_NAME.test(name)) fail('environment contains an invalid variable name');
    const canonicalName = platform === 'win32' ? name.toUpperCase() : name;
    if (folded.has(canonicalName)) fail('environment contains a duplicate variable name');
    folded.add(canonicalName);
    const entryValue = descriptor.value;
    if (entryValue.includes('\u0000')) fail('environment contains a NUL value');
    const valueBytes = Buffer.byteLength(entryValue, 'utf8');
    if (valueBytes > MAX_ENVIRONMENT_VALUE_BYTES) fail(`environment value exceeds ${MAX_ENVIRONMENT_VALUE_BYTES} bytes`);
    totalBytes += Buffer.byteLength(name, 'utf8') + valueBytes;
    if (totalBytes > MAX_ENVIRONMENT_BYTES) fail(`environment exceeds ${MAX_ENVIRONMENT_BYTES} bytes`);
    result[name] = entryValue;
  }
  return Object.freeze(result);
}

function validateRequest(input: ClaudeProcessRequest, isolatedRoot: string, platform: NodeJS.Platform): ClaudeProcessRequest {
  if (!input || typeof input !== 'object') fail('request is required');
  const suppliedExecutable = boundedText(input.executable, 'executable');
  if (!path.isAbsolute(suppliedExecutable)) fail('executable must be absolute');
  const executable = path.resolve(suppliedExecutable);
  if (!Array.isArray(input.args) || input.args.length > MAX_ARGUMENTS) fail(`args must contain at most ${MAX_ARGUMENTS} entries`);
  let argumentBytes = 0;
  const args = input.args.map((entry) => {
    if (typeof entry !== 'string' || /[\u0000\r\n]/.test(entry)) fail('args must contain NUL-free single-line strings');
    argumentBytes += Buffer.byteLength(entry, 'utf8');
    if (argumentBytes > MAX_ARGUMENT_BYTES) fail(`args exceed ${MAX_ARGUMENT_BYTES} bytes`);
    return entry;
  });
  if (typeof input.stdin !== 'string' || input.stdin.includes('\u0000')) fail('stdin must be a NUL-free string');
  if (Buffer.byteLength(input.stdin, 'utf8') > MAX_STDIN_BYTES) fail(`stdin exceeds ${MAX_STDIN_BYTES} bytes`);
  if (input.shell !== false) fail('shell must be false');
  const cwd = boundedText(input.cwd, 'cwd');
  const resolvedCwd = path.resolve(cwd);
  const comparable = (candidate: string) => platform === 'win32' ? candidate.toLowerCase() : candidate;
  if (comparable(resolvedCwd) !== comparable(isolatedRoot)) fail('cwd must resolve to the configured isolatedRoot');
  return {
    executable,
    args,
    stdin: input.stdin,
    cwd: isolatedRoot,
    timeoutMs: boundedPositiveInteger(input.timeoutMs, 'timeoutMs', MAX_TIMEOUT_MS),
    maxOutputBytes: boundedPositiveInteger(input.maxOutputBytes, 'maxOutputBytes', MAX_OUTPUT_BYTES),
    shell: false,
  };
}

function defaultTerminateTree(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform): void {
  if (platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore', windowsHide: true });
    killer.once('error', () => { try { child.kill('SIGKILL'); } catch { /* bounded grace owns settlement */ } });
    killer.unref();
    return;
  }
  if (platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* fall through to direct child kill */ }
  }
  try { child.kill('SIGKILL'); } catch { /* the child may already have exited */ }
}

function fixedFailure(code: string, timedOut = false, outputCapped = false): ClaudeProcessExecution {
  return { exitCode: null, signal: null, stdout: '', stderr: code, timedOut, outputCapped };
}

function isChildBoundary(value: unknown): value is ChildProcessWithoutNullStreams {
  try {
    if (!value || typeof value !== 'object') return false;
    const child = value as Partial<ChildProcessWithoutNullStreams>;
    return typeof child.on === 'function' && typeof child.removeListener === 'function' && typeof child.kill === 'function' &&
      !!child.stdout && typeof child.stdout.on === 'function' && typeof child.stdout.removeListener === 'function' &&
      !!child.stderr && typeof child.stderr.on === 'function' && typeof child.stderr.removeListener === 'function' &&
      !!child.stdin && typeof child.stdin.on === 'function' && typeof child.stdin.removeListener === 'function' &&
      typeof child.stdin.write === 'function' && typeof child.stdin.end === 'function';
  } catch {
    return false;
  }
}

/** Create a deny-default Node process port without launching or discovering any process. */
export function createClaudeNodeProcessPort(options: ClaudeNodeProcessPortOptions): ClaudeProcessPort {
  if (!options || typeof options !== 'object') fail('options are required');
  const platform = options.platform ?? process.platform;
  if (!SUPPORTED_PLATFORMS.has(platform)) fail('platform is unsupported');
  const isolatedRoot = validateIsolatedRoot(options.isolatedRoot);
  const environment = copyEnvironment(options.environment, platform);
  const terminationGraceMs = boundedPositiveInteger(options.terminationGraceMs ?? 5_000, 'terminationGraceMs', MAX_TERMINATION_GRACE_MS);
  const spawnFactory = options.spawnFactory ?? (spawn as unknown as ClaudeNodeSpawnFactory);
  const terminateTree = options.terminateTree ?? defaultTerminateTree;
  const timer = options.timer ?? { set: setTimeout, clear: clearTimeout };

  return {
    async execute(rawInput: ClaudeProcessRequest): Promise<ClaudeProcessExecution> {
      const input = validateRequest(rawInput, isolatedRoot, platform);
      return new Promise<ClaudeProcessExecution>((resolve) => {
        let child: ChildProcessWithoutNullStreams;
        try {
          child = spawnFactory(input.executable, input.args, {
            cwd: isolatedRoot,
            env: environment,
            shell: false,
            detached: platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } catch {
          resolve(fixedFailure('CLAUDE_PROCESS_SPAWN_FAILED'));
          return;
        }
        if (!isChildBoundary(child)) {
          try { (child as ChildProcessWithoutNullStreams)?.kill?.('SIGKILL'); } catch { /* malformed boundary */ }
          resolve(fixedFailure('CLAUDE_PROCESS_BOUNDARY_INVALID'));
          return;
        }

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let outputBytes = 0;
        let settled = false;
        let terminating = false;
        let timedOut = false;
        let outputCapped = false;
        let infrastructureFailure: string | null = null;
        let timeoutHandle: ClaudeNodeTimerHandle | undefined;
        let graceHandle: ClaudeNodeTimerHandle | undefined;

        const cleanupListeners = () => {
          child.stdout.removeListener('data', onStdout);
          child.stderr.removeListener('data', onStderr);
          child.stdin.removeListener('error', onStdinError);
          child.removeListener('error', onChildError);
          child.removeListener('close', onClose);
        };

        const finish = (exitCode: number | null, signal: string | null, forcedFailure?: string) => {
          if (settled) return;
          settled = true;
          if (timeoutHandle) timer.clear(timeoutHandle);
          if (graceHandle) timer.clear(graceHandle);
          cleanupListeners();
          const failure = forcedFailure ?? infrastructureFailure;
          if (failure) {
            resolve(fixedFailure(failure, timedOut, outputCapped));
            return;
          }
          resolve({
            exitCode,
            signal,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
            timedOut,
            outputCapped,
          });
        };

        const beginTermination = (reason: 'timeout' | 'output-cap' | 'stdin' | 'child') => {
          if (settled || terminating) return;
          terminating = true;
          timedOut = reason === 'timeout';
          outputCapped = reason === 'output-cap';
          if (reason === 'stdin') infrastructureFailure = 'CLAUDE_PROCESS_STDIN_FAILED';
          if (reason === 'child') infrastructureFailure = 'CLAUDE_PROCESS_CHILD_ERROR';
          try {
            terminateTree(child, platform);
          } catch {
            if (settled) return;
            infrastructureFailure = 'CLAUDE_PROCESS_TERMINATION_FAILED';
            try { child.kill('SIGKILL'); } catch { /* bounded grace still guarantees settlement */ }
          }
          if (!settled) {
            graceHandle = timer.set(
              () => finish(null, null, infrastructureFailure ?? 'CLAUDE_PROCESS_TERMINATION_GRACE_EXPIRED'),
              terminationGraceMs,
            );
          }
        };

        const capture = (target: Buffer[], data: Buffer | string) => {
          if (settled || terminating) return;
          const chunk = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, 'utf8');
          if (outputBytes + chunk.byteLength > input.maxOutputBytes) {
            beginTermination('output-cap');
            return;
          }
          outputBytes += chunk.byteLength;
          target.push(chunk);
        };

        function onStdout(data: Buffer | string) { capture(stdoutChunks, data); }
        function onStderr(data: Buffer | string) { capture(stderrChunks, data); }
        function onStdinError() { beginTermination('stdin'); }
        function onChildError() { beginTermination('child'); }
        function onClose(exitCode: number | null, signal: string | null) { finish(exitCode, signal); }

        child.stdout.on('data', onStdout);
        child.stderr.on('data', onStderr);
        child.stdin.on('error', onStdinError);
        child.on('error', onChildError);
        child.on('close', onClose);
        timeoutHandle = timer.set(() => beginTermination('timeout'), input.timeoutMs);
        try {
          child.stdin.write(input.stdin, 'utf8');
          child.stdin.end();
        } catch {
          beginTermination('stdin');
        }
      });
    },
  };
}
