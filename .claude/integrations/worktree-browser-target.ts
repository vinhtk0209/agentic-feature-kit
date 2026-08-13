import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const BROWSER_TARGET_SCHEMA_VERSION = '1.0.0';
export type BrowserTargetMode = 'managed' | 'byte_identity';
export type BrowserTargetStatus = 'verified' | 'needs_input' | 'rejected';

interface BrowserTargetBase {
  schemaVersion: typeof BROWSER_TARGET_SCHEMA_VERSION;
  mode: BrowserTargetMode;
  worktreeRoot: string;
  serverUrl: string;
}

export interface ManagedBrowserTargetConfig extends BrowserTargetBase {
  mode: 'managed';
  managed: {
    executable: string;
    args: string[];
    readyPath: string;
    timeoutMs: number;
  };
}

export interface ByteIdentityBrowserTargetConfig extends BrowserTargetBase {
  mode: 'byte_identity';
  byteIdentity: {
    localPath: string;
    publicPath: string;
  };
}

export type BrowserTargetConfig = ManagedBrowserTargetConfig | ByteIdentityBrowserTargetConfig;

export interface BrowserTargetProvenance {
  schemaVersion: typeof BROWSER_TARGET_SCHEMA_VERSION;
  status: BrowserTargetStatus;
  reasonCode: string;
  mode: BrowserTargetMode | null;
  worktreeRoot: string;
  serverOrigin: string | null;
  routeUrl: string | null;
  localHash: string | null;
  remoteHash: string | null;
  processId: number | null;
  evidence: string[];
  contentHash: string;
}

export interface BrowserTargetSession {
  provenance: BrowserTargetProvenance;
  serverUrl: string | null;
  close: () => Promise<void>;
}

interface PrepareBrowserTargetInput {
  cwd: string;
  route: string;
  config: BrowserTargetConfig;
  fetchImpl?: typeof fetch;
}

const MAX_IDENTITY_BYTES = 1024 * 1024;

function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`browser-target-invalid: ${label} fields must be exactly ${expected.join(', ')}`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`browser-target-invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validServerUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('browser-target-invalid: serverUrl must be a string');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('browser-target-invalid: serverUrl must be absolute'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('browser-target-invalid: serverUrl must be a credential-free HTTP(S) origin/base path');
  }
  return url.toString().replace(/\/$/, '');
}

function safeRelativePath(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !raw.trim() || path.isAbsolute(raw)) {
    throw new Error(`browser-target-invalid: ${label} must be a non-empty relative path`);
  }
  const normalized = path.normalize(raw);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`browser-target-invalid: ${label} escapes the worktree`);
  }
  return normalized;
}

function publicPath(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    throw new Error(`browser-target-invalid: ${label} must be a same-origin absolute path`);
  }
  return raw;
}

export function parseBrowserTargetConfig(value: unknown): BrowserTargetConfig {
  const root = objectValue(value, 'config');
  if (root.schemaVersion !== BROWSER_TARGET_SCHEMA_VERSION) {
    throw new Error(`browser-target-invalid: schemaVersion must be ${BROWSER_TARGET_SCHEMA_VERSION}`);
  }
  if (root.mode !== 'managed' && root.mode !== 'byte_identity') {
    throw new Error('browser-target-invalid: mode must be managed or byte_identity');
  }
  if (typeof root.worktreeRoot !== 'string' || !root.worktreeRoot.trim()) {
    throw new Error('browser-target-invalid: worktreeRoot is required');
  }
  const base = {
    schemaVersion: BROWSER_TARGET_SCHEMA_VERSION,
    mode: root.mode,
    worktreeRoot: root.worktreeRoot,
    serverUrl: validServerUrl(root.serverUrl),
  } as const;

  if (root.mode === 'managed') {
    exactKeys(root, ['schemaVersion', 'mode', 'worktreeRoot', 'serverUrl', 'managed'], 'config');
    const managed = objectValue(root.managed, 'managed');
    exactKeys(managed, ['executable', 'args', 'readyPath', 'timeoutMs'], 'managed');
    if (typeof managed.executable !== 'string' || !managed.executable.trim()) throw new Error('browser-target-invalid: managed.executable is required');
    if (/[;&|<>]/.test(managed.executable) || (/\s/.test(managed.executable) && !path.isAbsolute(managed.executable))) {
      throw new Error('browser-target-invalid: managed.executable must be one executable path, not a shell command');
    }
    if (!Array.isArray(managed.args) || managed.args.some((arg) => typeof arg !== 'string')) throw new Error('browser-target-invalid: managed.args must be string[]');
    if (!Number.isInteger(managed.timeoutMs) || Number(managed.timeoutMs) < 1_000 || Number(managed.timeoutMs) > 120_000) {
      throw new Error('browser-target-invalid: managed.timeoutMs must be an integer from 1000 to 120000');
    }
    return {
      ...base,
      mode: 'managed',
      managed: {
        executable: managed.executable,
        args: managed.args as string[],
        readyPath: publicPath(managed.readyPath, 'managed.readyPath'),
        timeoutMs: Number(managed.timeoutMs),
      },
    };
  }

  exactKeys(root, ['schemaVersion', 'mode', 'worktreeRoot', 'serverUrl', 'byteIdentity'], 'config');
  const identity = objectValue(root.byteIdentity, 'byteIdentity');
  exactKeys(identity, ['localPath', 'publicPath'], 'byteIdentity');
  return {
    ...base,
    mode: 'byte_identity',
    byteIdentity: {
      localPath: safeRelativePath(identity.localPath, 'byteIdentity.localPath'),
      publicPath: publicPath(identity.publicPath, 'byteIdentity.publicPath'),
    },
  };
}

export function loadBrowserTargetConfig(filePath: string): BrowserTargetConfig {
  return parseBrowserTargetConfig(JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')));
}

function samePath(left: string, right: string): boolean {
  const a = path.normalize(left);
  const b = path.normalize(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function isLinkedGitWorktree(root: string): boolean {
  try { return fs.lstatSync(path.join(root, '.git')).isFile(); } catch { return false; }
}

export function assertNoJunctionDependency(root: string): void {
  const dependencyPath = path.join(root, 'node_modules');
  try {
    if (fs.lstatSync(dependencyPath).isSymbolicLink()) {
      throw new Error('node-modules-junction: linked worktrees must copy or install dependencies; junction reuse is forbidden');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('node-modules-junction:')) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function finalizeProvenance(input: Omit<BrowserTargetProvenance, 'contentHash'>): BrowserTargetProvenance {
  const evidence = [...new Set(input.evidence)].sort();
  const base = { ...input, evidence };
  return { ...base, contentHash: hash(JSON.stringify(base)) };
}

export function validateBrowserTargetProvenance(value: unknown): value is BrowserTargetProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([
    'contentHash', 'evidence', 'localHash', 'mode', 'processId', 'reasonCode', 'remoteHash',
    'routeUrl', 'schemaVersion', 'serverOrigin', 'status', 'worktreeRoot',
  ].sort())) return false;
  if (result.schemaVersion !== BROWSER_TARGET_SCHEMA_VERSION || !['verified', 'needs_input', 'rejected'].includes(String(result.status))) return false;
  if (result.mode !== null && !['managed', 'byte_identity'].includes(String(result.mode))) return false;
  if (typeof result.reasonCode !== 'string' || typeof result.worktreeRoot !== 'string' || typeof result.contentHash !== 'string') return false;
  if (!Array.isArray(result.evidence) || result.evidence.length === 0 || result.evidence.some((entry) => typeof entry !== 'string')) return false;
  const evidence = result.evidence as string[];
  if (JSON.stringify(evidence) !== JSON.stringify([...new Set(evidence)].sort())) return false;
  const base = { ...result } as Record<string, unknown>;
  delete base.contentHash;
  return result.contentHash === hash(JSON.stringify(base));
}

function provenance(input: Partial<Omit<BrowserTargetProvenance, 'schemaVersion' | 'contentHash' | 'evidence'>> & {
  status: BrowserTargetStatus;
  reasonCode: string;
  worktreeRoot: string;
  evidence: string[];
}): BrowserTargetProvenance {
  return finalizeProvenance({
    schemaVersion: BROWSER_TARGET_SCHEMA_VERSION,
    status: input.status,
    reasonCode: input.reasonCode,
    mode: input.mode ?? null,
    worktreeRoot: input.worktreeRoot,
    serverOrigin: input.serverOrigin ?? null,
    routeUrl: input.routeUrl ?? null,
    localHash: input.localHash ?? null,
    remoteHash: input.remoteHash ?? null,
    processId: input.processId ?? null,
    evidence: input.evidence,
  });
}

export function createBrowserTargetRequirement(input: {
  cwd: string;
  route: string;
  status?: 'needs_input' | 'rejected';
  reasonCode: string;
  evidence: string[];
}): BrowserTargetProvenance {
  let realRoot = path.resolve(input.cwd);
  try { realRoot = fs.realpathSync(input.cwd); } catch { /* retain resolved input for evidence */ }
  return provenance({
    status: input.status ?? 'needs_input',
    reasonCode: input.reasonCode,
    worktreeRoot: realRoot,
    routeUrl: input.route,
    evidence: input.evidence,
  });
}

async function fetchBounded(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; bytes: Uint8Array }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_IDENTITY_BYTES) throw new Error('byte-identity-oversize: response exceeds 1 MiB');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IDENTITY_BYTES) throw new Error('byte-identity-oversize: response exceeds 1 MiB');
    return { ok: response.status >= 200 && response.status < 400, status: response.status, bytes };
  } finally { clearTimeout(timer); }
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function waitForClose(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once('close', () => { clearTimeout(timeout); resolve(); });
  });
}

function closedSession(result: BrowserTargetProvenance): BrowserTargetSession {
  return { provenance: result, serverUrl: null, close: async () => undefined };
}

export async function prepareBrowserTarget(input: PrepareBrowserTargetInput): Promise<BrowserTargetSession> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let realRoot = path.resolve(input.cwd);
  try { realRoot = fs.realpathSync(input.cwd); } catch { /* rejected below if config cannot resolve */ }
  const base = {
    mode: input.config.mode,
    worktreeRoot: realRoot,
    serverOrigin: new URL(input.config.serverUrl).origin,
    routeUrl: new URL(input.route, `${input.config.serverUrl}/`).toString(),
  } as const;
  try {
    if (new URL(base.routeUrl).origin !== base.serverOrigin) {
      return closedSession(provenance({ ...base, status: 'rejected', reasonCode: 'browser-route-cross-origin', evidence: ['feature route must remain on the verified server origin'] }));
    }
    const configuredRoot = fs.realpathSync(path.resolve(input.config.worktreeRoot));
    if (!samePath(realRoot, configuredRoot)) {
      return closedSession(provenance({ ...base, status: 'rejected', reasonCode: 'worktree-root-mismatch', evidence: ['configured root does not equal B11 cwd'] }));
    }
    assertNoJunctionDependency(realRoot);

    if (input.config.mode === 'byte_identity') {
      const localPath = path.resolve(realRoot, input.config.byteIdentity.localPath);
      if (!samePath(path.dirname(localPath), realRoot) && !localPath.startsWith(`${realRoot}${path.sep}`)) {
        return closedSession(provenance({ ...base, status: 'rejected', reasonCode: 'byte-identity-unsafe', evidence: ['identity file escapes worktree'] }));
      }
      const localBytes = fs.readFileSync(localPath);
      if (localBytes.byteLength > MAX_IDENTITY_BYTES) throw new Error('byte-identity-oversize: local file exceeds 1 MiB');
      const identityUrl = new URL(input.config.byteIdentity.publicPath, `${input.config.serverUrl}/`).toString();
      const remote = await fetchBounded(fetchImpl, identityUrl, 10_000);
      const localHash = hash(localBytes);
      const remoteHash = hash(remote.bytes);
      if (!remote.ok || localHash !== remoteHash) {
        return closedSession(provenance({ ...base, status: 'rejected', reasonCode: 'byte-identity-mismatch', localHash, remoteHash, evidence: [`identity status=${remote.status}`, `identity url=${identityUrl}`] }));
      }
      const route = await fetchBounded(fetchImpl, base.routeUrl, 10_000);
      if (!route.ok) {
        return closedSession(provenance({ ...base, status: 'needs_input', reasonCode: 'browser-route-unavailable', localHash, remoteHash, evidence: [`route status=${route.status}`, 'serve or deploy the feature route from this exact worktree'] }));
      }
      return closedSession(provenance({ ...base, status: 'verified', reasonCode: 'byte-identity-match', localHash, remoteHash, evidence: [`identity url=${identityUrl}`, `route status=${route.status}`] }));
    }

    const child = spawn(input.config.managed.executable, input.config.managed.args, {
      cwd: realRoot,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let spawnError: Error | null = null;
    child.once('error', (error) => { spawnError = error; });
    const readyUrl = new URL(input.config.managed.readyPath, `${input.config.serverUrl}/`).toString();
    const deadline = Date.now() + input.config.managed.timeoutMs;
    let readyStatus = 0;
    while (Date.now() < deadline && child.exitCode === null && !spawnError) {
      try {
        const ready = await fetchBounded(fetchImpl, readyUrl, 1_000);
        readyStatus = ready.status;
        if (ready.ok) break;
      } catch { /* bounded retry */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!readyStatus || readyStatus < 200 || readyStatus >= 400 || child.exitCode !== null || spawnError) {
      terminateProcessTree(child);
      await waitForClose(child);
      return closedSession(provenance({ ...base, status: 'needs_input', reasonCode: 'managed-server-unavailable', processId: child.pid ?? null, evidence: [spawnError?.message ?? `ready status=${readyStatus || 'unreachable'}`, 'fix the exact-worktree serve command'] }));
    }
    const route = await fetchBounded(fetchImpl, base.routeUrl, 10_000);
    if (!route.ok) {
      terminateProcessTree(child);
      await waitForClose(child);
      return closedSession(provenance({ ...base, status: 'needs_input', reasonCode: 'browser-route-unavailable', processId: child.pid ?? null, evidence: [`route status=${route.status}`, 'serve or deploy the feature route from this exact worktree'] }));
    }
    const result = provenance({ ...base, status: 'verified', reasonCode: 'exact-worktree-server', processId: child.pid ?? null, evidence: [`managed cwd=${realRoot}`, `ready status=${readyStatus}`, `route status=${route.status}`, 'spawn shell=false'] });
    let closed = false;
    return {
      provenance: result,
      serverUrl: input.config.serverUrl,
      close: async () => {
        if (closed) return;
        closed = true;
        terminateProcessTree(child);
        await waitForClose(child);
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reasonCode = message.split(':')[0];
    return closedSession(provenance({ ...base, status: reasonCode === 'node-modules-junction' ? 'rejected' : 'needs_input', reasonCode, evidence: [message] }));
  }
}
