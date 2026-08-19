# P17-018 R5C2A — Deterministic SBOM Sidecars

Date: 2026-08-19
Status: approved implementation plan
Parent: `docs/roadmap/p17-018-r5c1-source-readiness-plan.md`
Input lock: `delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1`

## Outcome and delivery boundary

Generate deterministic, offline-validated SPDX 2.3 and CycloneDX 1.6 SBOM sidecars for the exact
public source inventory and all three provider archives. Bind every document to reviewed package,
license, manifest, and artifact identities without changing provider runtime behavior or requiring a
network connection during build, validation, or CI.

R5C2A is one supply-chain feature and one PR. It produces two source sidecars and six provider
sidecars, expands the release checksum file to an exact 11-row SHA256SUMS, and keeps the three
existing provider ZIPs. It does not implement or claim the strict final-archive gate, clean-clone
qualification, release-candidate authorization, provenance signing, publication, or repository
visibility. Versions remain `3.25.0 / v3.25 / 0.5.0 / 1.3.0`.

## Reconciled starting state

- Qualified base is merged R5C1 commit `ae84468ca1910a2ed565ad2974b4d0964c957306`.
- The public source manifest contains 628 include-only paths: 625 text files and three reviewed
  binaries. Link, dependency-license, and ten-family secret gates pass with status
  `eligible-for-r5c2`; they do not prove a final artifact.
- Four lockfiles now produce 754 dependency occurrences and 617 unique dependency components in the
  committed license catalog. Every catalog row has an exact name, version, license, provenance, and
  one or more lockfile authorities.
- The current provider builder emits three deterministic Deflate ZIP archives, one directory
  manifest per provider, and a three-row checksum file. The archives are approximately 1.42 MB each.
- A measured provider build completes in 4,005 ms with a 20,455,424-byte RSS increase. The complete
  existing distribution test completes in 26,364 ms and proves three double-built archives, 15
  extracted runtime smokes, shared-runtime parity, and three directory-level mutations.
- The current ZIP extractor follows local headers and is test-only. It does not establish final
  central-directory, CRC, collision, reparse, or bounded-expansion authority; R5C2B owns those checks.
- No source file implements `bomFormat`, `spdxVersion`, or a named SBOM generator. There is no stale
  generated sidecar that can be reused as evidence.
- `ajv@8.20.0`, `fast-deep-equal@3.1.3`,
  `json-schema-traverse@1.0.0`, and `require-from-string@2.0.2` are already exact reviewed catalog
  identities through the two MCP lockfiles. Root Ajv resolves patched `fast-uri@3.1.5`, replacing a
  rejected vulnerable `3.1.2` override; the exact 3.1.5 registry integrity, BSD-3-Clause license,
  installed license digest, repository, and zero-vulnerability audit are independently reviewed.
  This adds one unique build-only identity; every authority/count change remains gated.

## Locked R5C2A decisions

### Q1 — Deliver SBOM and archive integrity as sequential PRs

R5C2A owns sidecar generation, offline schema validation, canonical serialization, exact component
inventory, artifact binding, checksum-set expansion, documentation, and evidence. R5C2B owns the
strict ZIP parser and final-artifact aggregate gate after R5C2A merges through a qualified PR.

The two PRs remain independently reversible. R5C2A cannot weaken or pre-claim R5C2B, and R5C2B must
consume the exact R5C2A public contracts rather than duplicate its SBOM or license rules. Each PR
requires its own source commit, evidence commit, exact-head Linux/Windows/aggregate CI, retained
branch, and standard PR-only merge.

### I1 — Preserve product and artifact identity

Keep canonical product name **Agentic Feature Kit**, slug `agentic-feature-kit`, provider IDs
`codex`, `claude`, and `copilot`, archive root `agentic-feature-kit/`, and archive naming
`agentic-feature-kit-<provider>-0.5.0.zip`. Keep the root package private.

Use these exact sidecar names in the `0.5.0` output directory:

- `agentic-feature-kit-source-3.25.0.spdx.json`
- `agentic-feature-kit-source-3.25.0.cdx.json`
- `agentic-feature-kit-codex-0.5.0.spdx.json`
- `agentic-feature-kit-codex-0.5.0.cdx.json`
- `agentic-feature-kit-claude-0.5.0.spdx.json`
- `agentic-feature-kit-claude-0.5.0.cdx.json`
- `agentic-feature-kit-copilot-0.5.0.spdx.json`
- `agentic-feature-kit-copilot-0.5.0.cdx.json`

`SHA256SUMS` contains exactly the three ZIPs plus these eight sidecars, sorted ordinally by filename.
It never includes itself, a stage path, directory output, timestamp, absolute path, or machine name.
An absent, extra, duplicate, renamed, stale, or partially written output fails before stage promotion.

Do not bump a version in this slice. The new sidecars are release-control metadata for an unpublished
candidate; provider runtime files, schemas, sentinels, and capability compatibility remain unchanged.
Public-version selection remains a later release-candidate decision.

### S1 — Generate two exact offline SBOM formats

Produce one SPDX 2.3 JSON document and one CycloneDX 1.6 JSON document from one normalized inventory.
The normalized inventory is the only business-rule owner; format mappers cannot independently infer
components, licenses, relationships, hashes, versions, or artifact names.

The source identity is a SHA-256 over an ordinal canonical inventory of every include row in
`release/public-release-manifest.json`, including path, content kind, bytes, and content digest.
The source SBOM describes the four reviewed workspace package roots and the 617 unique catalog
dependencies. Every dependency carries an npm Package URL, exact reviewed license, provenance, and
ordinal lockfile authorities. Multiple authorities merge into one component; conflicting name,
version, license, provenance, or authority data fails closed.

Each provider identity is the SHA-256 of its exact ZIP plus the already-validated distribution
manifest hash. Provider SBOMs describe the first-party provider package and only third-party code
embedded in the shipped runtime. Esbuild metafiles provide the embedded input inventory; every
`node_modules` input must map to one exact reviewed catalog row. The reconciled expected runtime
third party is `typescript@4.9.5`. An unknown, missing, extra, ambiguous, or license-conflicting
embedded package fails the build.

SPDX documents use `spdxVersion: SPDX-2.3`, `dataLicense: CC0-1.0`, one deterministic document
namespace derived from the artifact identity, stable SPDX identifiers, `filesAnalyzed: false`, exact
package checksums where an artifact exists, exact concluded/declared license expressions, package
URLs, and ordinal relationships. CycloneDX documents use `bomFormat: CycloneDX`, `specVersion: 1.6`,
version `1`, one deterministic UUID derived from the same identity, an exact metadata component,
ordinal components/dependencies, SHA-256 hashes, Package URLs, license expressions, and bounded
`agentic-feature-kit:*` properties for source/manifest/authority identity.

Both formats use canonical JSON with recursively ordinal object keys, ordinal arrays where the
standard does not assign semantic order, UTF-8, no BOM, LF endings, two-space indentation, and one
final LF. Serialization never includes a temporary directory, current working directory, username,
hostname, locale, timezone, process ID, random value, or wall-clock default.

### T1 — Keep a pure TypeScript domain and thin Node adapter

Use TypeScript and Node.js with three boundaries:

1. `scripts/release-sbom-contract.ts` owns normalized inventory validation, identifiers, deterministic
   UUID/namespace construction, SPDX/CycloneDX mapping, sidecar naming, and canonical serialization.
   It imports no filesystem, process, child-process, network, Ajv, or builder adapter.
2. `scripts/release-sbom-node.ts` owns bounded file reads, public-manifest/catalog/policy loading,
   schema registry loading, Ajv compilation, source-date resolution, cryptographic hashing, schema
   validation, and structured CLI reporting. Normal operation is offline.
3. `scripts/build-provider-bundles.ts` remains the distribution orchestrator. It supplies esbuild
   metafiles and built manifests, writes all outputs under the existing stage root, calls the SBOM
   adapter, verifies the complete set, writes checksums last, and promotes the stage atomically.

This preserves pure-domain attack tests and keeps I/O policy in adapters. Adding SBOM logic directly
to the 440-line builder was rejected because it would couple standards mapping, schema validation,
runtime bundling, and filesystem promotion. A separate Rust, Go, or Python sidecar was rejected for
now because measured archives are roughly 1.42 MB, build RSS growth is roughly 20.5 MB, and build
time is roughly four seconds. Reconsider a native component only if an archive exceeds 512 MiB,
measured peak scanner memory exceeds 256 MiB, or a representative scan exceeds 30 seconds.

### D1 — Make every build input explicit and reproducible

The normalized build input includes root/provider/core versions, public-manifest rows and bytes,
four package roots, dependency catalog and policy, provider registry, distribution manifests,
esbuild embedded-package inventory, four schema-registry rows and schema bytes, and a non-negative
integer source date epoch.

Resolve the timestamp from an explicit `sourceDateEpoch` option first, then `SOURCE_DATE_EPOCH`, then
the current Git commit timestamp. Reject fractions, negative values, overflow, malformed environment
input, or a missing Git fallback. Convert once to UTC ISO 8601 and use the same value in both formats.
Tests always pass an explicit epoch. A build outside Git must provide `SOURCE_DATE_EPOCH`.

Capture every input fingerprint before building and re-evaluate it before stage promotion. Any
mid-build input drift fails and removes the stage. Build twice from the same captured inputs into two
independent temporary roots and require byte identity for all eight sidecars, all three ZIPs, and the
11-row checksum file. Semantic validation is required in both roots; byte equality alone cannot
substitute for schema, inventory, license, or artifact binding.

### E1 — Bind source, evidence, and remote qualification

Use plan/readiness RED then GREEN, implementation RED before production code, pure canonical and
mutation suites, Node adapter attacks, current-artifact integration, predecessor/source-readiness
gates, TypeScript 5.9.3 strict compilation, and the complete kit suite. Record native exit codes,
durations, test/attack/component/output counts, stdout/stderr byte counts and SHA-256 digests, exact
source/evidence path manifests, Git trees, commits, and remote CI identities.

Create one source commit and one immutable evidence commit. Push only the retained feature branch,
open one PR into `main`, bind Linux/Windows/aggregate to the exact evidence head, and merge only
through the standard PR flow after all checks and no-conflict proof pass. No sync, target edit,
database/provider action, tag, release, publication, or visibility change is part of R5C2A.

## Schema provenance and offline validation

Vendor exactly four upstream schema inputs:

- SPDX v2.3 `schemas/spdx-schema.json` as `release/schemas/spdx/spdx-2.3.schema.json`.
- CycloneDX 1.6 `bom-1.6.schema.json`.
- The exact CycloneDX 1.6 `spdx.schema.json` license-enumeration dependency.
- The exact CycloneDX 1.6 `jsf-0.82.schema.json` signature dependency.

`release/sbom-schema-sources.json` records one ordinal row per file: format/role, local path, immutable
upstream release or tag, canonical HTTPS source URL, SHA-256, schema `$id`, draft, and license. Reject
mutable branch URLs, redirects as authority, missing hashes, duplicate roles/paths/IDs, wrong draft,
unreviewed licenses, or local bytes that differ from the registry digest.

Use exact root development dependency Ajv 8.20.0. Compile all schemas with strict mode and offline
reference resolution; no runtime schema download or permissive unknown-format fallback is allowed.
Validate the generated documents against the pinned official draft-07 schemas, then run domain-level
cross-document checks that JSON Schema cannot express: deterministic identity, unique component
references, closed relationships, exact artifact/source hash, catalog parity, sidecar pairing, and
SPDX/CycloneDX semantic parity.

Preserve the official schema notices. CycloneDX schemas are Apache-2.0. SPDX v2.3 material receives
the applicable upstream attribution/copyright notice. Update `THIRD_PARTY_NOTICES.md` with exact
sources, versions, roles, and license treatment; do not imply provider endorsement.

## Dependency and provider inventory semantics

- Source package roots are the four exact policy roots. The SBOM records their private build-time
  status without claiming registry publication.
- Catalog components remain unique by normalized `name@version`; Package URLs encode scoped names
  correctly and never include credentials, registry tokens, absolute paths, or lockfile URLs.
- Lockfile authorities express observed inventory membership, not direct runtime reachability.
  Format relationships must preserve that distinction and must not label every source dependency as
  shipped runtime code.
- Provider embedded inputs come only from esbuild metafiles generated during the current build.
  Built JavaScript is not heuristically reparsed to guess packages.
- Node built-ins are platform capabilities, not npm dependency components. Esbuild itself and Ajv are
  build tools and are absent from provider runtime SBOMs unless a metafile proves they were embedded.
- The copied TypeScript license and `THIRD_PARTY_NOTICES.md` must agree with the exact TypeScript
  component. A provider sidecar with no matching license payload fails.
- The SPDX and CycloneDX documents for the same target must have identical target identity, versions,
  component IDs, licenses, Package URLs, authorities, relationships, and hashes after normalization.

## Threat model and attack matrix

1. Schema provenance: missing/extra/duplicate/reordered registry row, mutable URL, wrong upstream ref,
   digest drift, `$id` drift, wrong draft, unsupported license, unresolved `$ref`, permissive Ajv mode,
   or network resolution attempt.
2. Input identity: malformed public manifest/catalog/policy/provider registry, missing include path,
   binary/text drift, content hash drift, duplicate/case/NFC path collision, version mismatch, or
   mid-build mutation.
3. Dependency inventory: missing/extra/duplicate/conflicting package, invalid scoped purl, missing
   authority, unknown license/provenance, Ajv authority drift, and special-license policy bypass.
4. Embedded inventory: missing metafile, unexpected node_modules input, ambiguous package root,
   TypeScript version/license drift, build-only package mislabeled as runtime, or missing notice.
5. SPDX: wrong version/data license/namespace, random or unstable identifier, duplicate SPDXID,
   dangling relationship, wrong checksum, invalid license expression, non-ordinal package/relationship,
   absolute path leakage, or schema failure.
6. CycloneDX: wrong format/spec version, nondeterministic serial, duplicate bom-ref, dangling
   dependency, wrong hash/purl/license, unsupported property, non-ordinal components, or schema failure.
7. Cross-format: source/provider identity mismatch, component/license/purl/authority mismatch,
   artifact hash mismatch, one missing format, unexpected target, or different deterministic epoch.
8. Output set: wrong filename, missing/extra/duplicate sidecar, stale archive binding, checksum row
   count not equal to 11, unsorted/absolute checksum name, self-checksum, partial write, or stage leak.
9. Bounds and confidentiality: schema/catalog/manifest/metafile too large, excessive component count,
   invalid UTF-8/NUL, secret detector finding in sidecar, username/hostname/temp path/process ID leak,
   or diagnostic that echoes candidate secret bytes.
10. Determinism: second root changes any byte, locale/timezone changes order or timestamp, environment
    overrides an explicit epoch, or semantic validation differs despite equal filenames.

## TDD and verification ladder

1. Register the focused plan command and full-kit route; prove expected RED is exactly the missing
   R5C2A plan.
2. Add this plan only; rerun the unchanged readiness harness GREEN before implementation.
3. Add production contract tests with canonical in-memory inventory and sidecar fixtures; prove RED
   for the missing domain module and no unrelated failure.
4. Implement the pure domain until canonical documents and all format/cross-format mutations pass.
5. Add Node adapter tests with temporary schema/source fixtures; prove RED before adapter code, then
   validate pinned schemas, Ajv strict/offline behavior, bounds, source-date precedence, and failures.
6. Pin the four official schemas and registry, add exact Ajv 8.20.0, regenerate the dependency catalog,
   and rerun the complete R5C1 license/source-readiness authority before builder integration.
7. Extend the builder using esbuild metafiles and staged sidecars. Build twice in separate temporary
   roots; require 3 ZIPs + 8 sidecars + exact 11-row checksums, byte equality, schema validity,
   component parity, and all existing 15 extracted runtime smokes.
8. Update provider/release documentation only after the integration gate passes. Keep R5C2B/R5D and
   all publication boundaries explicitly deferred.
9. Run predecessor R4/R5 gates, current public-release/source-readiness gates, provider bundle tests,
   strict TypeScript 5.9.3 with `noEmit` and `skipLibCheck=false`, static artifact-secret scan, and
   `git diff --check` over the exact staged source manifest.
10. Run one complete native `test:kit`; capture native exit, duration, stdout/stderr bytes and digests,
    lesson-sync terminal state, exact staged path/tree authority, and zero residue before source commit.
11. Add only the evidence file and public-manifest row, rescan/retest the evidence tree, create the
    evidence commit, then perform the retained-branch PR/CI/merge lifecycle.

## Exact source and evidence manifests

The source-stage path manifest is exactly 24 ordinal paths with LF-final SHA-256
`799a2547ace7505e98e7409f35dde7e98d93a7253b4fa599e056b8bb1232e74f`:

- `THIRD_PARTY_NOTICES.md`
- `docs/releasing/UNRELEASED.md`
- `docs/roadmap/p17-018-r5c2a-deterministic-sbom-plan.md`
- `package-lock.json`
- `package.json`
- `providers/README.md`
- `release/dependency-license-catalog.json`
- `release/public-release-manifest.json`
- `release/sbom-schema-sources.json`
- `release/schemas/cyclonedx/bom-1.6.schema.json`
- `release/schemas/cyclonedx/jsf-0.82.schema.json`
- `release/schemas/cyclonedx/spdx.schema.json`
- `release/schemas/spdx/spdx-2.3.schema.json`
- `scripts/build-provider-bundles.test.ts`
- `scripts/build-provider-bundles.ts`
- `scripts/post-17-public-release-r5c2a-plan.test.ts`
- `scripts/public-release-history-contract.test.ts`
- `scripts/public-source-readiness-contract.ts`
- `scripts/public-source-readiness-docs.test.ts`
- `scripts/public-source-readiness-license.test.ts`
- `scripts/release-sbom-contract.test.ts`
- `scripts/release-sbom-contract.ts`
- `scripts/release-sbom-node.test.ts`
- `scripts/release-sbom-node.ts`

Any required predecessor-contract repair must be reported as a scope change, added ordinally, rebound
to a new path-manifest digest, and requalified from the affected gate. Do not silently broaden this
list or restore a stale assertion.

The evidence-stage path manifest is exactly two ordinal paths with LF-final SHA-256
`835976fc89f440d36f45b813fcf6b5f4c2453fe52ea4dbbbede7d972774b7b40`:

- `docs/evidence/post-17-public-release-r5c2a-deterministic-sbom-2026-08-19.md`
- `release/public-release-manifest.json`

## Rollback and stop conditions

- Stop if any official schema cannot be pinned to an immutable upstream release/ref, exact SHA-256,
  resolvable offline reference set, and reviewed license/notice treatment.
- Stop if Ajv installation introduces an unreviewed unique dependency, changes production dependency
  resolution, or makes provider runtime depend on the validator.
- Stop if source/catalog/public-manifest authority disagrees, any generated component lacks an exact
  reviewed license, or esbuild embeds an unmapped package.
- Stop if canonical JSON needs locale, host, random, wall-clock, or filesystem-order input.
- Stop if one format loses information available to the other or schema success is used to excuse a
  cross-document identity/inventory mismatch.
- Stop if stage cleanup cannot prove that a failed or partial set is absent from the promoted output.
- Stop if R5C2A would claim strict archive safety, clean-clone qualification, provenance identity,
  release-candidate approval, publication, or visibility.
- Roll back with one feature-branch revert or the verified 2026-08-19 kit snapshot/tag. Never sync or
  edit a target `.Codex/` tree as a rollback mechanism.

## Deferred beyond R5C2A

R5C2B owns the strict ZIP parser and final-artifact aggregate gate: authoritative central-directory
parsing, traversal/collision/reparse/CRC/bounds enforcement, raw archive secret/license/manifest/SBOM
scanning, complete-set promotion, and attack evidence. R5D owns clean-clone Windows and Linux
qualification, isolated double builds, extracted runtime smokes from committed clones, and provider
quickstart/browser proof.

Sanitized public repository creation, release-candidate and version selection, dashboard release
routing, tags, GitHub Release, npm/pnpm/marketplace/plugin publication, provenance signing,
repository visibility, sync, and target installation remain later separately gated work.
