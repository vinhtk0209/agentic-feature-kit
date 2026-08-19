import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const planPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5c2a-deterministic-sbom-plan.md')
const parentPlanPath = path.join(root, 'docs', 'roadmap', 'p17-018-r5c1-source-readiness-plan.md')
const packagePath = path.join(root, 'package.json')
const commandName = 'test:post-17-public-release-r5c2a-plan'
const expectedCommand = 'npx tsx scripts/post-17-public-release-r5c2a-plan.test.ts'

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> }
const readinessGaps: string[] = []
if (!fs.existsSync(planPath)) readinessGaps.push('R5C2A deterministic SBOM plan')
if (packageJson.scripts[commandName] !== expectedCommand) readinessGaps.push('focused package registration')
if (!packageJson.scripts['test:kit']?.includes(`npm run ${commandName}`)) readinessGaps.push('full-kit registration')
assert.deepEqual(readinessGaps, [], `P17-018 R5C2A readiness gaps: ${readinessGaps.join(', ')}`)

const plan = fs.readFileSync(planPath, 'utf8')
const parentPlan = fs.readFileSync(parentPlanPath, 'utf8')
const normalized = plan.replace(/`/g, '').replace(/\\/g, '/').replace(/\s+/g, ' ')
const normalizedLower = normalized.toLowerCase()
const expectedSourcePaths = [
  'THIRD_PARTY_NOTICES.md',
  'docs/releasing/UNRELEASED.md',
  'docs/roadmap/p17-018-r5c2a-deterministic-sbom-plan.md',
  'package-lock.json',
  'package.json',
  'providers/README.md',
  'release/dependency-license-catalog.json',
  'release/public-release-manifest.json',
  'release/sbom-schema-sources.json',
  'release/schemas/cyclonedx/bom-1.6.schema.json',
  'release/schemas/cyclonedx/jsf-0.82.schema.json',
  'release/schemas/cyclonedx/spdx.schema.json',
  'release/schemas/spdx/spdx-2.3.schema.json',
  'scripts/build-provider-bundles.test.ts',
  'scripts/build-provider-bundles.ts',
  'scripts/post-17-public-release-r5c2a-plan.test.ts',
  'scripts/public-release-history-contract.test.ts',
  'scripts/public-source-readiness-contract.ts',
  'scripts/public-source-readiness-docs.test.ts',
  'scripts/public-source-readiness-license.test.ts',
  'scripts/release-sbom-contract.test.ts',
  'scripts/release-sbom-contract.ts',
  'scripts/release-sbom-node.test.ts',
  'scripts/release-sbom-node.ts',
] as const
const expectedEvidencePaths = [
  'docs/evidence/post-17-public-release-r5c2a-deterministic-sbom-2026-08-19.md',
  'release/public-release-manifest.json',
] as const

function manifestIdentity(paths: readonly string[]): string {
  return createHash('sha256').update(`${paths.join('\n')}\n`, 'utf8').digest('hex')
}

for (const heading of [
  '# P17-018 R5C2A — Deterministic SBOM Sidecars',
  '## Outcome and delivery boundary',
  '## Reconciled starting state',
  '## Locked R5C2A decisions',
  '### Q1 — Deliver SBOM and archive integrity as sequential PRs',
  '### I1 — Preserve product and artifact identity',
  '### S1 — Generate two exact offline SBOM formats',
  '### T1 — Keep a pure TypeScript domain and thin Node adapter',
  '### D1 — Make every build input explicit and reproducible',
  '### E1 — Bind source, evidence, and remote qualification',
  '## Schema provenance and offline validation',
  '## Dependency and provider inventory semantics',
  '## Threat model and attack matrix',
  '## TDD and verification ladder',
  '## Exact source and evidence manifests',
  '## Rollback and stop conditions',
  '## Deferred beyond R5C2A',
]) assert.ok(plan.includes(heading), `missing R5C2A plan heading: ${heading}`)

for (const phrase of [
  'delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1',
  'ae84468ca1910a2ed565ad2974b4d0964c957306',
  'two source sidecars and six provider sidecars',
  '11-row SHA256SUMS',
  'SPDX 2.3',
  'CycloneDX 1.6',
  'Ajv 8.20.0',
  '617 unique dependency components',
  'typescript@4.9.5',
  'TypeScript and Node.js',
  '512 MiB',
  '256 MiB',
  '30 seconds',
  '3.25.0 / v3.25 / 0.5.0 / 1.3.0',
  'R5C2B owns the strict ZIP parser and final-artifact aggregate gate',
  'R5D owns clean-clone Windows and Linux qualification',
]) assert.ok(normalizedLower.includes(phrase.toLowerCase()), `missing R5C2A plan contract: ${phrase}`)

for (const sourcePath of expectedSourcePaths) {
  assert.ok(plan.includes(`- \`${sourcePath}\``), `missing R5C2A source manifest path: ${sourcePath}`)
}
for (const evidencePath of expectedEvidencePaths) {
  assert.ok(plan.includes(`- \`${evidencePath}\``), `missing R5C2A evidence manifest path: ${evidencePath}`)
}
const sourceIdentity = manifestIdentity(expectedSourcePaths)
const evidenceIdentity = manifestIdentity(expectedEvidencePaths)
assert.ok(plan.includes(`\`${sourceIdentity}\``), 'missing R5C2A source path-manifest digest')
assert.ok(plan.includes(`\`${evidenceIdentity}\``), 'missing R5C2A evidence path-manifest digest')
assert.match(parentPlan, /R5C2 owns deterministic SPDX 2\.3 and CycloneDX 1\.6 sidecars/)
assert.doesNotMatch(normalized, /(?:is|was) public[- ]release ready/i)
assert.doesNotMatch(normalized, /(?:tag|release|publication|visibility) (?:was|is) completed/i)

console.log('post-17-public-release-r5c2a-plan.test: PASS (Q1/I1/S1/T1/D1/E1 locked)')
