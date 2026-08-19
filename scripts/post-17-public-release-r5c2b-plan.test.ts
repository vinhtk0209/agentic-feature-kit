import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5c2b-strict-archive-gate-plan.md')
const predecessorPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5c2a-deterministic-sbom-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r5c2b-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r5c2b-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R5C2B strict archive admission plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R5C2B readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const predecessorPlan = fs.readFileSync(predecessorPlanPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const expectedSourcePaths = [
  'docs/releasing/UNRELEASED.md',
  'docs/roadmap/p17-018-r5c2b-strict-archive-gate-plan.md',
  'package.json',
  'providers/README.md',
  'release/public-release-manifest.json',
  'scripts/build-provider-bundles.test.ts',
  'scripts/build-provider-bundles.ts',
  'scripts/post-17-public-release-r5c2b-plan.test.ts',
  'scripts/public-release-history-contract.test.ts',
  'scripts/public-source-readiness-contract.ts',
  'scripts/public-source-readiness-docs.test.ts',
  'scripts/release-archive-contract.test.ts',
  'scripts/release-archive-contract.ts',
  'scripts/release-archive-node.test.ts',
  'scripts/release-archive-node.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r5c2b-strict-archive-gate-2026-08-19.md',
  'release/public-release-manifest.json',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R5C2B — Strict Final Archive Admission',
  '## Outcome and delivery boundary',
  '## Reconciled starting state',
  '## Locked R5C2B decisions',
  '### A1 — Parse ZIP structures from one bounded central-directory authority',
  '### G1 — Admit only one complete release candidate',
  '### T1 — Keep a pure contract and a thin Node adapter',
  '### D1 — Preserve deterministic output and fail-clean promotion',
  '### E1 — Bind source, evidence, and remote qualification',
  '## ZIP grammar and filesystem boundary',
  '## Final artifact aggregate gate',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and stop conditions',
  '## Deferred beyond R5C2B',
]) assert.ok(plan.includes(heading), `missing R5C2B plan heading: ${heading}`)

for (const phrase of [
  'delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1',
  '76cbe150f364ca23c1c4749f910693c405f7c4e6',
  'three ZIP archives, eight SBOM sidecars, and one 11-row SHA256SUMS',
  'central directory is the sole entry authority',
  'multi-disk, ZIP64, encryption, data descriptors, and unsupported compression methods',
  'invalid UTF-8, non-NFC names, absolute paths, traversal, backslashes, ADS, device names, trailing dots or spaces',
  'case-folded or NFC collisions',
  'CRC-32, compressed size, uncompressed size, and local-header parity',
  '512 MiB',
  '256 MiB',
  '30 seconds',
  'TypeScript and Node.js',
  'no new dependency',
  '3.25.0 / v3.25 / 0.5.0 / 1.3.0',
  'R5D owns clean-clone Windows and Linux qualification',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R5C2B plan contract: ${phrase}`)

for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R5C2B source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R5C2B evidence manifest path: ${evidencePath}`)
}
assert.ok(plan.includes(`\`${manifestIdentity(expectedSourcePaths)}\``), 'missing R5C2B source path-manifest digest')
assert.ok(plan.includes(`\`${manifestIdentity(expectedEvidencePaths)}\``), 'missing R5C2B evidence path-manifest digest')
assert.match(predecessorPlan, /R5C2B owns the strict ZIP parser and final-artifact aggregate gate/)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /(?:tag|release|publication|visibility) (?:was|is) completed/i)

console.log('post-17-public-release-r5c2b-plan.test: PASS (A1/G1/T1/D1/E1 locked)')
