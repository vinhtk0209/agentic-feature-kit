#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteTextFile, parseStrictFlags } from '../.claude/integrations/cli-reliability';

export const CROSS_PLATFORM_SENTINEL = '@@CROSS_PLATFORM@@';
export const CROSS_PLATFORM_SCHEMA_VERSION = '1.0.0';
export type QualifiedPlatform = 'linux' | 'windows';

export interface PlatformProbeResult {
  id: 'node-runtime' | 'path-and-argv' | 'line-endings' | 'process-cleanup';
  status: 'pass' | 'fail';
  evidence: string[];
}

export interface CrossPlatformResult {
  schemaVersion: typeof CROSS_PLATFORM_SCHEMA_VERSION;
  platform: QualifiedPlatform;
  status: 'pass' | 'fail';
  probes: PlatformProbeResult[];
  contentHash: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function resultHash(value: Omit<CrossPlatformResult, 'contentHash'>): string {
  return sha256(JSON.stringify(value));
}

export function finalizeCrossPlatformResult(
  platform: QualifiedPlatform,
  probes: PlatformProbeResult[],
): CrossPlatformResult {
  const base: Omit<CrossPlatformResult, 'contentHash'> = {
    schemaVersion: CROSS_PLATFORM_SCHEMA_VERSION,
    platform,
    status: probes.every((probe) => probe.status === 'pass') ? 'pass' : 'fail',
    probes,
  };
  return { ...base, contentHash: resultHash(base) };
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

export function qualifiedPlatform(platform = process.platform): QualifiedPlatform | null {
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return null;
}

export function validateCrossPlatformResult(value: unknown): value is CrossPlatformResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(['contentHash', 'platform', 'probes', 'schemaVersion', 'status'])
    || result.schemaVersion !== CROSS_PLATFORM_SCHEMA_VERSION || !['linux', 'windows'].includes(String(result.platform))
    || !['pass', 'fail'].includes(String(result.status)) || typeof result.contentHash !== 'string'
    || !Array.isArray(result.probes) || result.probes.length !== 4) return false;
  const expectedIds = ['node-runtime', 'path-and-argv', 'line-endings', 'process-cleanup'];
  for (let index = 0; index < result.probes.length; index += 1) {
    const probe = result.probes[index] as Record<string, unknown>;
    if (!probe || JSON.stringify(Object.keys(probe).sort()) !== JSON.stringify(['evidence', 'id', 'status'])
      || probe.id !== expectedIds[index] || !['pass', 'fail'].includes(String(probe.status))
      || !Array.isArray(probe.evidence) || probe.evidence.length === 0
      || probe.evidence.some((entry) => typeof entry !== 'string')) return false;
    const sorted = [...probe.evidence as string[]].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(probe.evidence) || new Set(sorted).size !== sorted.length) return false;
  }
  const probes = result.probes as PlatformProbeResult[];
  if (result.status !== (probes.every((probe) => probe.status === 'pass') ? 'pass' : 'fail')) return false;
  const base = {
    schemaVersion: result.schemaVersion,
    platform: result.platform,
    status: result.status,
    probes: result.probes,
  } as Omit<CrossPlatformResult, 'contentHash'>;
  return result.contentHash === resultHash(base);
}

function pass(id: PlatformProbeResult['id'], evidence: string): PlatformProbeResult {
  return { id, status: 'pass', evidence: [evidence] };
}

function fail(id: PlatformProbeResult['id'], error: unknown): PlatformProbeResult {
  return { id, status: 'fail', evidence: [error instanceof Error ? error.message : String(error)] };
}

function terminateChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.killed) return;
  child.kill();
}

async function processCleanupProbe(fixture: string): Promise<PlatformProbeResult> {
  const id = 'process-cleanup' as const;
  const child = spawn(process.execPath, [fixture, '--linger'], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('child readiness timed out')), 5_000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.stdout?.once('data', (chunk) => {
        clearTimeout(timeout);
        if (String(chunk).trim() !== 'READY') reject(new Error('child readiness output drifted'));
        else resolve();
      });
      child.once('close', () => { clearTimeout(timeout); reject(new Error('child exited before cleanup')); });
    });
    const closed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('child cleanup timed out')), 5_000);
      child.once('close', () => { clearTimeout(timeout); resolve(); });
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
    terminateChild(child);
    terminateChild(child);
    await closed;
    return pass(id, 'direct Node child terminated within 5000ms; repeated cleanup was safe');
  } catch (error) {
    terminateChild(child);
    return fail(id, error);
  }
}

export async function runCrossPlatformSmoke(expected?: QualifiedPlatform): Promise<CrossPlatformResult> {
  const platform = qualifiedPlatform();
  if (!platform) throw new Error(`unsupported qualification platform: ${process.platform}`);
  if (expected && expected !== platform) throw new Error(`platform mismatch: expected ${expected}, observed ${platform}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow kit Ω '));
  const fixture = path.join(root, 'opaque child.js');
  const tricky = 'space " quote & amp ; semi $ dollar (paren) Ω';
  fs.writeFileSync(fixture, [
    "if (process.argv[2] === '--linger') { process.stdout.write('READY'); setInterval(() => {}, 1000); }",
    'else process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));',
  ].join('\n'), 'utf8');
  const probes: PlatformProbeResult[] = [];
  try {
    const major = Number(process.versions.node.split('.')[0]);
    probes.push(major >= 20 ? pass('node-runtime', `Node major=${major}; required>=20`) : fail('node-runtime', `Node major=${major}; required>=20`));
    try {
      const child = spawnSync(process.execPath, [fixture, tricky], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10_000 });
      const parsed = JSON.parse(child.stdout) as { argv?: unknown; cwd?: unknown };
      if (child.status !== 0 || JSON.stringify(parsed.argv) !== JSON.stringify([tricky]) || path.resolve(String(parsed.cwd)) !== path.resolve(root)) {
        throw new Error('path or opaque argv was not preserved');
      }
      probes.push(pass('path-and-argv', 'space/Unicode path and metacharacter argv preserved with shell=false'));
    } catch (error) { probes.push(fail('path-and-argv', error)); }
    const crlf = 'alpha\r\nbeta\r\n';
    probes.push(normalizeLineEndings(crlf) === 'alpha\nbeta\n' && normalizeLineEndings('alpha\nbeta\n') === 'alpha\nbeta\n'
      ? pass('line-endings', 'CRLF normalized to LF; LF input remains byte-stable')
      : fail('line-endings', 'line-ending normalization drifted'));
    probes.push(await processCleanupProbe(fixture));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return finalizeCrossPlatformResult(platform, probes);
}

const launcher = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (require.main === module && /cross-platform-smoke\.(?:ts|js|cjs|mjs)$/.test(launcher)) {
  void (async () => {
    try {
      const flags = parseStrictFlags(process.argv.slice(2), { '--platform': 'value', '--out': 'value' });
      const rawPlatform = flags.get('--platform') ?? process.env.QUALIFICATION_PLATFORM;
      if (rawPlatform !== undefined && rawPlatform !== 'linux' && rawPlatform !== 'windows') throw new Error('--platform must be linux or windows');
      const result = await runCrossPlatformSmoke(rawPlatform as QualifiedPlatform | undefined);
      const rawOut = flags.get('--out') ?? process.env.QUALIFICATION_OUT;
      if (typeof rawOut === 'string') atomicWriteTextFile(path.resolve(rawOut), `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${CROSS_PLATFORM_SENTINEL}${JSON.stringify(result)}\n`);
      process.exitCode = result.status === 'pass' ? 0 : 1;
    } catch (error) {
      process.stderr.write(`Cross-platform qualification failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  })();
}
