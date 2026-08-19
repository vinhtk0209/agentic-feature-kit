# P17-018 R5C2A — Deterministic SBOM Evidence

Date: 2026-08-19
Status: local source and evidence qualification complete; remote pull-request qualification pending
Input lock: `delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1`

## Scope result

R5C2A generates deterministic SPDX 2.3 and CycloneDX 1.6 sidecars for the exact public source
inventory and all three provider archives. It validates both formats offline against pinned official
schemas, binds source dependencies to the reviewed license catalog, binds provider runtime components
to current esbuild metafiles, and expands the distribution checksum set from three to eleven rows.

Versions remain root `3.25.0`, prompt `v3.25`, provider `0.5.0`, and shared core `1.3.0`. The root
package remains private. This evidence does not claim final archive scanning, clean-clone
qualification, publication, release, tag, repository visibility, provenance signing, or provider
endorsement. R5C2B owns the strict final archive gate and R5D owns clean-clone qualification.

## Source authority

| Authority | Value |
|---|---|
| Qualified base | `ae84468ca1910a2ed565ad2974b4d0964c957306` |
| Source commit | `1090afdd2a13a6a874beacdfc0cfec94918b62bd` |
| Source tree | `0b06c87afbbf12111fa3e6f4a538578e0d7db367` |
| Source paths | 24 |
| Source path-manifest SHA-256 | `799a2547ace7505e98e7409f35dde7e98d93a7253b4fa599e056b8bb1232e74f` |
| Source diff | 9,811 insertions, 53 deletions |
| Commit hook | spec-integrity passed for 11 TypeScript files |

The source path set is exactly the approved plan manifest. Before commit, the staged set matched all
24 paths with zero delta, `git diff --cached --check` passed, and both unstaged and untracked counts
were zero.

## Architecture and deterministic identity

- `scripts/release-sbom-contract.ts` is a pure domain module. It performs canonical JSON mapping,
  component validation, deterministic identifiers, format mapping, and cross-document comparison.
  It imports no filesystem, process, network, Ajv, or builder adapter.
- `scripts/release-sbom-node.ts` performs bounded regular-file reads, normalized source inventory
  hashing, source-date resolution, schema registry validation, strict offline Ajv compilation,
  catalog-backed metafile resolution, semantic validation, and atomic sidecar writes.
- `scripts/build-provider-bundles.ts` remains the distribution orchestrator. It captures esbuild
  metafiles, creates the three unchanged-format ZIP archives, writes eight sidecars under the stage,
  recaptures source inputs before promotion, and writes the exact checksum set last.
- An explicit source epoch takes precedence over environment and Git inputs. Tests use epoch
  `1754000000`, which maps to `2025-07-31T22:13:20.000Z` in both document formats.
- Source inventory membership is not represented as runtime reachability. Provider dependency edges
  contain only packages proven embedded by the current metafiles.

The measured archives are approximately 1.42 MB and the implementation remains TypeScript/Node.
No measured threshold justified Rust, Go, or Python for this slice.

## Schema provenance

| Role | Upstream ref | Bytes | SHA-256 | License |
|---|---:|---:|---|---|
| SPDX 2.3 document | `spdx/spdx-spec@v2.3` | 45,312 | `239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b` | CC-BY-3.0 |
| CycloneDX 1.6 document | `CycloneDX/specification@1.6.1` | 262,597 | `efc54d749e32a6e16abd19394b80b4c67d846e12c782e04505130375f94ea541` | Apache-2.0 |
| CycloneDX JSF 0.82 | `CycloneDX/specification@1.6.1` | 8,058 | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` | Apache-2.0 |
| CycloneDX SPDX enumeration | `CycloneDX/specification@1.6.1` | 14,830 | `c41917196639055e9f9670811bac23ef777732144f3ff5a2f39686f61580dbe6` | Apache-2.0 |

`release/sbom-schema-sources.json` binds exact immutable raw source URLs, release refs, local paths,
schema identifiers, draft-07 declarations, licenses, and file digests. Ajv `8.20.0` compiles all four
without network access. Four formats are registered with bounded validators; CycloneDX's single
`meta:enum` annotation keyword is registered explicitly. `strictRequired=false` disables only a
known schema-lint incompatibility where official CycloneDX branches declare required keys beside
shared properties; runtime required-key validation remains enabled.

## Dependency authority correction

The root Ajv lock initially exposed that a forced `fast-uri@3.1.2` identity would retain high-severity
host-confusion advisories. That override was rejected. The final tree uses `fast-uri@3.1.5`, bound to:

- registry tarball integrity `sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==`;
- BSD-3-Clause registry and installed package metadata;
- installed license SHA-256 `b010b0dfdfdb23d7396e03b82cd4621fc9bb8f95d6b0aea70b9c24e12074c786`;
- repository authority `fastify/fast-uri`;
- npm audit with zero vulnerabilities.

The regenerated four-lock authority contains 754 occurrences and 617 unique packages. Ajv and
fast-uri are build-only. Provider metafiles resolve exactly `typescript@4.9.5`; any other embedded
identity fails before sidecar generation.

## TDD receipts

| Gate | Expected RED | GREEN result |
|---|---|---|
| Plan/readiness | missing R5C2A plan | `Q1/I1/S1/T1/D1/E1 locked` |
| Pure domain | `MODULE_NOT_FOUND: ./release-sbom-contract` | 2 canonical pairs, 11 document mutations, 11 input attacks |
| Node adapter | `MODULE_NOT_FOUND: ./release-sbom-node` | 2 sidecars, 4 schema fixtures, 3 epoch paths, 8 attacks |
| Metafile resolver | missing `resolveEmbeddedComponents` export | 1 exact embedded package, duplicate collapse, traversal and unknown-package denial |
| Provider integration | checksum count `3 !== 11` | 3 ZIPs, 8 sidecars, 11 checksums, 15 smokes, 4 attacks |
| Strict compiler | widened DESCRIBES relationship type | TypeScript 5.9.3 strict/noEmit/skipLibCheck=false exit 0 |

The provider integration builds into two independent temporary roots and compares every ZIP,
sidecar, and checksum byte. It validates all eight sidecars against official schemas, verifies source
and provider component counts and dependency semantics, runs the existing 15 extracted runtime
smokes, and passes four content/version/fail-clean attacks. Eight generated sidecars also pass all ten
existing secret detector families with zero findings.

## Source-commit artifact receipt

This table was generated from source commit `1090afdd2a13a6a874beacdfc0cfec94918b62bd` with explicit
epoch `1754000000`. Temporary output was removed after hashing. The evidence-only manifest row changes
the later source-sidecar identity by design; remote CI qualifies that final evidence head.

| Output | Bytes | SHA-256 |
|---|---:|---|
| `SHA256SUMS` | 1,179 | `622bbafbb667000c9eda41dbd483cbacae7b3a44a523be023a7ad5d2ea87f6d5` |
| `agentic-feature-kit-claude-0.5.0.cdx.json` | 2,462 | `f51e9a4ba46f9b95657f6f6746af8a5860f8394184a692f9bfd83a41aa5a04b0` |
| `agentic-feature-kit-claude-0.5.0.spdx.json` | 2,450 | `5ae688ab8dc67b9261b0c9c5f26d606736569635c4f40dc14488d0d445cdb643` |
| `agentic-feature-kit-claude-0.5.0.zip` | 1,421,329 | `0f4960b29b1994cced32fa1b76dffc5b889a387342134f2aa1915b0453039f6c` |
| `agentic-feature-kit-codex-0.5.0.cdx.json` | 2,457 | `6eb9e902da6a0054cf07652010e71fa4387a150b5f840d9adc2a6e27c490e4fe` |
| `agentic-feature-kit-codex-0.5.0.spdx.json` | 2,445 | `4ed20ce2f780677fe3ab26d6869f5ed3519f5ec0430816990e16121335abedfb` |
| `agentic-feature-kit-codex-0.5.0.zip` | 1,421,017 | `f8cd735cba8bd44fcf907e5e7c06cd7ee9bac7d6a77b17a7ef56a4ffab24b4e5` |
| `agentic-feature-kit-copilot-0.5.0.cdx.json` | 2,467 | `05ca20f56b9ac4af90e711d364b11757fe1028460d9cc2acb0c9f5b23fd5bb1f` |
| `agentic-feature-kit-copilot-0.5.0.spdx.json` | 2,455 | `cb8736964571e6f1f220e42febd4a2e3d53296d1a1b0278c175f22be3afcd544` |
| `agentic-feature-kit-copilot-0.5.0.zip` | 1,420,830 | `1c966b08c8d6cdd9418c986f03045c566e6de11789690f1e238d1ec4502bced4` |
| `agentic-feature-kit-source-3.25.0.cdx.json` | 466,522 | `797961b11ff10cf919e6f2daa888ba426b04e5a24770620404139b0c63e643c8` |
| `agentic-feature-kit-source-3.25.0.spdx.json` | 582,179 | `ee30665bb45c5dfd9ee7893890264e594b50d0a0fc7352c0795956dbe9dc778e` |

Provider distribution manifest hashes are Codex `a51b11b3cc16d1cedf5bc11e3415769064349a90f9d3bdfb30c819a8cc72a48d`,
Claude `aa9bf6dd62e97bc4c296987f21d0c2515cacd0df4cb3dda33a4ef377d0dbcc7f`, and
Copilot `2488258bb67bd16888eaef10914550d70df0ed1ddd2145bcd4a841f09d7abcc0`.

## Qualification summary

- The 27-command predecessor and Git-index matrix passes every R4A through R5C2A plan and all public
  entry, governance, history, privacy, alias, manifest, link, license, secret, and docs authorities.
- Git-index public-source readiness reports 639 source-stage paths, 190 Markdown files, 48/48 valid
  links, 754 dependency occurrences, 617 unique dependencies, 636 text files, ten detector families,
  and zero issues or findings.
- TypeScript 5.9.3 strict/noEmit/skipLibCheck=false exits zero over every changed TypeScript file.
- npm audit reports zero vulnerabilities across 46 total installed dependencies.
- Complete native `npm test` exits zero in 360,285 ms. Stdout is 128,226 bytes with SHA-256
  `9c3f9953e5e5d07ba879deace5b9519cfdbd2c34bc84dabd05d6449a475785cd`. Stderr is 1,074 bytes with
  SHA-256 `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb` and contains only existing
  synthetic/legacy lesson-registry warnings.
- Terminal full-suite gates confirm v3.25 stamp agreement, feature index sync, prompt budget within
  172 KB, and 60/60 lesson annotations paired with Change sections.

## Rollback and remote boundary

The verified 2026-08-19 backup and the dedicated feature branch provide local rollback. Reverting the
source commit removes the feature without changing a target repository. No sync, direct-main push,
target edit, database mutation, tag, release, publication, visibility change, or provider invocation
occurred.

Remote Linux, Windows, and aggregate qualification must bind to the final evidence commit before a
standard pull-request merge can be recommended. The retained branch must not be deleted.
