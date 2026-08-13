#!/usr/bin/env node
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCopilotEdition } from '../../scripts/build-copilot-edition';
import { checkVersions } from './version-check';

export const CLAIM_AUDIT_SENTINEL = '@@CLAIM_AUDIT@@';
export const CLAIM_AUDIT_SCHEMA_VERSION = '1.0.0';

export const CLAIM_PROBES = [
  'roadmap-baseline', 'release-version', 'provider-capabilities', 'copilot-reproducible',
  'distribution-local-only', 'sync-fail-closed',
] as const;
export type ClaimProbe = typeof CLAIM_PROBES[number];
export type ClaimSeverity = 'critical' | 'high';

export interface RuntimeClaim {
  id: string;
  severity: ClaimSeverity;
  document: string;
  anchor: string;
  probe: ClaimProbe;
}

export interface RuntimeClaimRegistry {
  schemaVersion: typeof CLAIM_AUDIT_SCHEMA_VERSION;
  claims: RuntimeClaim[];
}

export interface ClaimResult {
  id: string;
  severity: ClaimSeverity;
  status: 'pass' | 'fail';
  evidence: string[];
}

export interface ClaimProbeResult {
  passed: boolean;
  evidence: string[];
}

export interface ClaimAuditResult {
  schemaVersion: typeof CLAIM_AUDIT_SCHEMA_VERSION;
  status: 'pass' | 'fail';
  claims: ClaimResult[];
  contentHash: string;
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeRelative(value: string): boolean {
  return Boolean(value) && !path.isAbsolute(value) && !value.includes('\0')
    && value.split(/[\\/]+/).every((segment) => segment && segment !== '.' && segment !== '..');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableClaimPayload(result: Omit<ClaimAuditResult, 'contentHash'>): string {
  return JSON.stringify(result);
}

export function parseRuntimeClaimRegistry(value: unknown): RuntimeClaimRegistry {
  if (!exact(value, ['schemaVersion', 'claims']) || value.schemaVersion !== CLAIM_AUDIT_SCHEMA_VERSION
    || !Array.isArray(value.claims) || value.claims.length === 0 || value.claims.length > 64) {
    throw new Error('claim registry is malformed');
  }
  const claims: RuntimeClaim[] = [];
  const ids = new Set<string>();
  for (const candidate of value.claims) {
    if (!exact(candidate, ['id', 'severity', 'document', 'anchor', 'probe'])) throw new Error('claim entry is malformed');
    const claim = candidate as Record<string, unknown>;
    if (typeof claim.id !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(claim.id) || ids.has(claim.id)) throw new Error('claim id is invalid or duplicated');
    if (claim.severity !== 'critical' && claim.severity !== 'high') throw new Error('claim severity is invalid');
    if (typeof claim.document !== 'string' || !safeRelative(claim.document)) throw new Error('claim document path is unsafe');
    if (typeof claim.anchor !== 'string' || !claim.anchor.trim() || claim.anchor.length > 256) throw new Error('claim anchor is invalid');
    if (typeof claim.probe !== 'string' || !CLAIM_PROBES.includes(claim.probe as ClaimProbe)) throw new Error('claim probe is unknown');
    ids.add(claim.id);
    claims.push(claim as unknown as RuntimeClaim);
  }
  return { schemaVersion: CLAIM_AUDIT_SCHEMA_VERSION, claims };
}

function read(root: string, relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) { count += 1; offset += needle.length; }
  return count;
}

export function hashFileTree(root: string): string {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return sha256(files.map((file) => `${file}\0${sha256(fs.readFileSync(path.join(root, file), 'utf8'))}`).join('\n'));
}

function probeRoadmap(root: string): ClaimProbeResult {
  const roadmap = JSON.parse(read(root, 'docs/roadmap/post-17-roadmap.json')) as { baseline?: Record<string, unknown> };
  const pass = roadmap.baseline?.originalRoadmap === '17/17 complete' && roadmap.baseline?.reopened === false;
  return { passed: pass, evidence: [pass ? 'roadmap baseline=17/17 complete; reopened=false' : 'roadmap baseline drifted'] };
}

function probeVersion(root: string): ClaimProbeResult {
  const command = read(root, '.claude/commands/feature-from-confluence.md');
  const readme = read(root, 'README.md');
  const checked = checkVersions(command, readme, true);
  const packageVersion = String((JSON.parse(read(root, 'package.json')) as { version?: unknown }).version ?? '');
  const normalized = checked.source?.replace(/^v/, '');
  const pass = Boolean(normalized) && packageVersion === `${normalized}.0` && checked.missing.length === 0 && checked.mismatches.length === 0;
  return { passed: pass, evidence: [pass ? `version authorities=${checked.source}/${packageVersion}` : `version drift source=${checked.source}; package=${packageVersion}; missing=${checked.missing.join(',')}; mismatches=${checked.mismatches.length}`] };
}

interface ProviderBundleEntry {
  id: string;
  root: string;
  manifest: string | null;
  skill: string;
  orchestratorSkill: string;
}

interface ProviderBundleRegistry {
  bundleVersion: string;
  distribution?: { runtime?: Record<string, unknown> };
  providers?: ProviderBundleEntry[];
}

function probeProviders(root: string): ClaimProbeResult {
  const registry = JSON.parse(read(root, 'providers/provider-bundles.json')) as ProviderBundleRegistry;
  const requiredRuntime = ['projectIntelligence', 'conditionalQualityGates', 'workflowOrchestrator'];
  const providers = Array.isArray(registry.providers) ? registry.providers : [];
  const providerIds = providers.map((provider) => provider.id);
  const skillKinds = ['skill', 'orchestratorSkill'] as const;
  const hashes: Record<string, Set<string>> = { skill: new Set(), orchestratorSkill: new Set() };
  let complete = registry.bundleVersion === '0.3.0' && providerIds.join(',') === 'codex,claude,copilot'
    && requiredRuntime.every((key) => typeof registry.distribution?.runtime?.[key] === 'string');
  for (const provider of providers) {
    for (const kind of skillKinds) {
      const relative = path.join(provider.root, provider[kind]);
      if (!fs.existsSync(path.join(root, relative))) complete = false;
      else hashes[kind].add(sha256(read(root, relative)));
    }
    const providerReadme = read(root, path.join(provider.root, 'README.md'));
    if (!providerReadme.includes(`| Bundle version | \`${registry.bundleVersion}\` |`)
      || !providerReadme.includes('Conditional Quality Gates') || !providerReadme.includes('Workflow Orchestrator')) complete = false;
    if (provider.manifest) {
      const manifest = JSON.parse(read(root, path.join(provider.root, provider.manifest)));
      if (manifest.version !== registry.bundleVersion) complete = false;
    }
  }
  if (hashes.skill.size !== 1 || hashes.orchestratorSkill.size !== 1) complete = false;
  return { passed: complete, evidence: [complete ? `provider parity=${providerIds.join(',')}; bundle=${registry.bundleVersion}; runtimes=3` : 'provider capability or shared-skill parity drifted'] };
}

function probeCopilot(root: string): ClaimProbeResult {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-copilot-a-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-copilot-b-'));
  try {
    buildCopilotEdition(root, first);
    buildCopilotEdition(root, second);
    const a = hashFileTree(first);
    const b = hashFileTree(second);
    return { passed: a === b, evidence: [a === b ? `copilot generated tree=${a}` : `copilot generated drift=${a}/${b}`] };
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
}

function probeDistributionLocal(root: string): ClaimProbeResult {
  const ignored = read(root, '.gitignore').split('\n').some((line) => line.trim() === 'dist/');
  const readme = read(root, 'README.md');
  const honest = readme.includes('No installation, package publication, marketplace registration, provider execution,');
  const passed = ignored && honest;
  return { passed, evidence: [passed ? 'generated dist ignored; install/publication explicitly excluded' : 'generated distribution boundary drifted'] };
}

function probeSync(root: string): ClaimProbeResult {
  const readme = read(root, 'README.md');
  const runtime = read(root, 'scripts/sync-to-targets.ts');
  const pass = readme.includes('Real sync is fail-closed:') && readme.includes('verified=true')
    && readme.includes('--force-unverified') && runtime.includes('assertVerifiedForSync')
    && runtime.includes('--force-unverified') && runtime.includes('--force-dirty');
  return { passed: pass, evidence: [pass ? 'sync claim and runtime expose verified/dirty fail-closed guards' : 'sync fail-closed claim/runtime drifted'] };
}

export function executeClaimProbe(probe: ClaimProbe, root: string): ClaimProbeResult {
  switch (probe) {
    case 'roadmap-baseline': return probeRoadmap(root);
    case 'release-version': return probeVersion(root);
    case 'provider-capabilities': return probeProviders(root);
    case 'copilot-reproducible': return probeCopilot(root);
    case 'distribution-local-only': return probeDistributionLocal(root);
    case 'sync-fail-closed': return probeSync(root);
  }
}

export function auditRuntimeClaims(value: unknown, root: string): ClaimAuditResult {
  const registry = parseRuntimeClaimRegistry(value);
  const claims = registry.claims.map((claim): ClaimResult => {
    let evidence: string[];
    let passed = false;
    try {
      const document = read(root, claim.document);
      const anchorCount = occurrences(document, claim.anchor);
      const probe = executeClaimProbe(claim.probe, root);
      evidence = [`document=${claim.document}; anchorCount=${anchorCount}`, ...probe.evidence].sort();
      if (anchorCount !== 1) evidence.push('documentation anchor drifted');
      passed = anchorCount === 1 && probe.passed;
    } catch (error) {
      evidence = [`claim probe failed: ${error instanceof Error ? error.message : String(error)}`];
    }
    evidence = [...new Set(evidence)].sort();
    return { id: claim.id, severity: claim.severity, status: passed ? 'pass' : 'fail', evidence };
  });
  const base: Omit<ClaimAuditResult, 'contentHash'> = {
    schemaVersion: CLAIM_AUDIT_SCHEMA_VERSION,
    status: claims.every((claim) => claim.status === 'pass') ? 'pass' : 'fail',
    claims,
  };
  return { ...base, contentHash: sha256(stableClaimPayload(base)) };
}

export function validateClaimAuditResult(value: unknown): value is ClaimAuditResult {
  if (!exact(value, ['schemaVersion', 'status', 'claims', 'contentHash']) || value.schemaVersion !== CLAIM_AUDIT_SCHEMA_VERSION
    || (value.status !== 'pass' && value.status !== 'fail') || !Array.isArray(value.claims)
    || typeof value.contentHash !== 'string') return false;
  const claims = value.claims as unknown[];
  for (const item of claims) {
    if (!exact(item, ['id', 'severity', 'status', 'evidence'])) return false;
    const claim = item as Record<string, unknown>;
    if (typeof claim.id !== 'string' || (claim.severity !== 'critical' && claim.severity !== 'high')
      || (claim.status !== 'pass' && claim.status !== 'fail') || !Array.isArray(claim.evidence)
      || claim.evidence.length === 0 || claim.evidence.some((entry) => typeof entry !== 'string')) return false;
    const sorted = [...claim.evidence as string[]].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(claim.evidence) || new Set(sorted).size !== sorted.length) return false;
  }
  const overall = claims.every((item) => (item as ClaimResult).status === 'pass') ? 'pass' : 'fail';
  if (value.status !== overall) return false;
  const base = { schemaVersion: value.schemaVersion, status: value.status, claims: value.claims } as Omit<ClaimAuditResult, 'contentHash'>;
  return value.contentHash === sha256(stableClaimPayload(base));
}

const launcher = process.argv[1]?.replace(/\\/g, '/') ?? '';
if (require.main === module && /claim-runtime-audit\.(?:ts|js|cjs|mjs)$/.test(launcher)) {
  const root = path.resolve(__dirname, '..', '..');
  try {
    if (process.argv.length !== 2) throw new Error('usage: claim-runtime-audit.ts');
    const registry = JSON.parse(read(root, 'docs/claims/runtime-claims.json'));
    const result = auditRuntimeClaims(registry, root);
    process.stdout.write(`${CLAIM_AUDIT_SENTINEL}${JSON.stringify(result)}\n`);
    process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`Claim runtime audit failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
