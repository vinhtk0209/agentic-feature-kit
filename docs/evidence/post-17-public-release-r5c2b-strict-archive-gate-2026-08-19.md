# P17-018 R5C2B — Strict Final Archive Admission Evidence

Date: 2026-08-19
Scope: `delivery=Q1, identity=I1, sbom=S1, archive=A1, gate=G1, architecture=T1, determinism=D1, evidence=E1`
Status: locally qualified source commit; remote PR qualification pending

## Claim boundary

This evidence proves the strict final archive-admission implementation and tests described below for
one exact local source commit. It is not a release announcement, release-candidate approval,
publication authorization, provenance signature, provider endorsement, clean-clone qualification,
or visibility decision. R5D still owns committed clean-clone Windows/Linux builds, isolated installs,
runtime/quickstart proof, and the supported-OS qualification receipt.

No sync, target edit, database action, dashboard mutation, direct-main push, tag, release,
publication, package/marketplace upload, or visibility change occurred in this slice.

## Exact source authority

- Branch: `p17-018-r5c2b-strict-archive-gate`
- Qualified base / PR #19 merge: `76cbe150f364ca23c1c4749f910693c405f7c4e6`
- Source commit: `36a55553a9019232429483c5274b58154b8b37c5`
- Source tree: `63f68ab9fd46dad42b912925707664ffd32fec64`
- Subject: `feat(release): enforce strict archive admission (P17-018 R5C2B)`
- Source-stage paths: 15
- Source path-manifest SHA-256:
  `93909b7b5f1eefda453d214ef57e70ccde5e227a32d5da95b3b85908ce25c128`
- Source-stage residue before commit: zero unstaged paths and zero untracked paths
- Pre-commit result: spec-integrity OK for ten TypeScript files

Versions remain root/prompt/provider/shared-core `3.25.0 / v3.25 / 0.5.0 / 1.3.0`.

## Delivered architecture

### Pure archive contract

`scripts/release-archive-contract.ts` has no filesystem, process, child-process, network, zlib,
crypto, Ajv, SBOM-adapter, source-readiness-adapter, or builder import. It owns:

- the final 22-byte EOCD and central directory as the only entry authority;
- rejection of multi-disk, ZIP64, encryption, data descriptors, unsupported flags/methods/versions,
  extras, comments, external attributes, gaps, overlaps, prepended/trailing bytes, and partial ranges;
- fatal UTF-8, NFC, exact archive-root, traversal/absolute/backslash/ADS/device/trailing-dot-space,
  duplicate/case-collision, and ordinal-name enforcement;
- exact local/central name, flag, method, time, CRC-32, size, offset, and layout parity;
- bounded stored/raw-Deflate payload validation with redacted failures;
- exact LF-final checksum grammar and output-set policy; and
- strict distribution-manifest identity, hash, file-set, size, and content-digest parity.

Locked parser caps are 512 MiB per archive, 20,000 entries, 512 UTF-8 bytes per name, 128 MiB
compressed per entry, 256 MiB uncompressed per entry, 512 MiB aggregate uncompressed output, and a
200:1 per-entry expansion ratio.

### Node admission and promotion adapter

`scripts/release-archive-node.ts` owns bounded regular-file reads, lstat/realpath containment, raw
Deflate and SHA-256 ports, expanded-directory byte parity, exact license/notice payload authority,
R5C1 Git-index source readiness, R5C2A schema/semantic revalidation, decompressed-entry and sidecar
secret scanning, final recapture, and rollback-safe promotion. It imports no HTTP/network client.

The builder writes checksums last, calls the admission/promotion adapter, and no longer removes or
renames the release directory directly. A rejected stage is removed before the prior release is
touched. A successful replacement retains the prior release in one bounded rollback sibling until
the admitted stage rename succeeds.

## RED/GREEN ladder

1. R5C2B readiness RED: package/full-kit routes were valid; the only gap was the absent plan.
2. Unchanged readiness GREEN: `PASS (A1/G1/T1/D1/E1 locked)`.
3. Pure contract RED: `MODULE_NOT_FOUND: ./release-archive-contract`.
4. Pure contract GREEN: two canonical ZIP methods, 65 ZIP attacks, ten checksum attacks, two
   output-set attacks, and eleven manifest attacks.
5. Node adapter RED: `MODULE_NOT_FOUND: ./release-archive-node`; the builder had not run.
6. Node adapter GREEN: three archives, 71 entries, eight sidecars, eleven checksums, 79 text scans,
   six coherent candidate attacks, and two promotion paths.
7. Provider integration GREEN: three strict-admitted deterministic archives, 71 entries, eight
   schema-valid/secret-clean sidecars, eleven checksums, 79 text scans, fifteen clean runtime smokes,
   shared-core/version/content integrity, and four existing attacks.

Reported corrections retained every safety assertion:

- canonical fixture bytes were corrected from an arithmetic typo (`31` to exact `30`);
- provider directories were reconciled as an exact set while distributable/checksum files remain
  ordinal, because registry order is `codex, claude, copilot`;
- manifest hashing was bound to the existing recursive canonical `stableJson` authority rather than
  a pretty-print surrogate; and
- the intended Git-index fail-closed transition was resolved by staging the exact 15-path source set,
  not by weakening the source-readiness gate.

## Current-tree qualification

- Git-index source readiness: `eligible-for-r5c2`
  - manifest paths: 646
  - Markdown files: 192
  - relative links: 48
  - valid links: 48
  - lockfiles: 4
  - dependency occurrences: 754
  - unique dependencies: 617
  - reviewed dependencies: 5
  - metadata overrides: 4
  - text files: 643
  - secret detector families: 10
  - issues: 0
- TypeScript 5.9.3: strict, no emit, `skipLibCheck=false`, all ten changed TS files, exit 0.
- Predecessor/current matrix: 31 commands, exit 0.
- `npm audit --json`: zero info/low/moderate/high/critical vulnerabilities across 46 dependencies.
- Exact staged tree before source commit:
  `63f68ab9fd46dad42b912925707664ffd32fec64`.

The 31-command matrix covers R4A–R4F, R5A/R5B/R5C1/R5C2A/R5C2B plans; public
entry/governance/history/legacy/synthetic/prompt/private/binary/alias/domain/Node controls;
link/license/secret/docs/index source readiness; both R5C2A SBOM controls; and the pure archive
contract.

## Complete native kit receipt

One complete native `npm test` run on the exact staged source tree produced:

- exit: 0
- duration: 363,417 ms
- stdout: 129,103 bytes / 2,152 lines
- stdout SHA-256: `208a1cd1fbbdc0d38e5e59ae25feef3d80057b50bf6b604cc65b787f74f32cdd`
- stderr: 1,084 bytes / 10 lines
- stderr SHA-256: `5e02fd3cbb5d5316d362ef7ab15b0d1dd08f9da669fca63b195db4f9e304472a`
- lesson sync terminal state: 60/60 annotations paired

All stderr rows are existing lesson-registry synthetic/legacy invalid-enum fixture warnings. No new
runtime, archive, schema, source-readiness, or promotion warning occurred.

## Source-commit output receipt

An explicit `SOURCE_DATE_EPOCH` equivalent of `1754000000` was passed directly as the build option
on exact source commit `36a55553a9019232429483c5274b58154b8b37c5`. Final validation returned
`admitted` for three providers, three archives, 71 entries, eight sidecars, eleven checksums, 79 text
scans, and ten secret-detector families. The bounded temp output was removed after hashing.

| File | Bytes | SHA-256 |
|---|---:|---|
| `agentic-feature-kit-claude-0.5.0.cdx.json` | 2,462 | `f51e9a4ba46f9b95657f6f6746af8a5860f8394184a692f9bfd83a41aa5a04b0` |
| `agentic-feature-kit-claude-0.5.0.spdx.json` | 2,450 | `5ae688ab8dc67b9261b0c9c5f26d606736569635c4f40dc14488d0d445cdb643` |
| `agentic-feature-kit-claude-0.5.0.zip` | 1,421,329 | `0f4960b29b1994cced32fa1b76dffc5b889a387342134f2aa1915b0453039f6c` |
| `agentic-feature-kit-codex-0.5.0.cdx.json` | 2,457 | `6eb9e902da6a0054cf07652010e71fa4387a150b5f840d9adc2a6e27c490e4fe` |
| `agentic-feature-kit-codex-0.5.0.spdx.json` | 2,445 | `4ed20ce2f780677fe3ab26d6869f5ed3519f5ec0430816990e16121335abedfb` |
| `agentic-feature-kit-codex-0.5.0.zip` | 1,421,017 | `f8cd735cba8bd44fcf907e5e7c06cd7ee9bac7d6a77b17a7ef56a4ffab24b4e5` |
| `agentic-feature-kit-copilot-0.5.0.cdx.json` | 2,467 | `05ca20f56b9ac4af90e711d364b11757fe1028460d9cc2acb0c9f5b23fd5bb1f` |
| `agentic-feature-kit-copilot-0.5.0.spdx.json` | 2,455 | `cb8736964571e6f1f220e42febd4a2e3d53296d1a1b0278c175f22be3afcd544` |
| `agentic-feature-kit-copilot-0.5.0.zip` | 1,420,830 | `1c966b08c8d6cdd9418c986f03045c566e6de11789690f1e238d1ec4502bced4` |
| `agentic-feature-kit-source-3.25.0.cdx.json` | 466,522 | `8be9c74e99bf15db5e19478cd35831711539c1f0e0bfd4d8f7dd342860c417d9` |
| `agentic-feature-kit-source-3.25.0.spdx.json` | 582,179 | `a8841cb28de0121f286f53ee563e0014542305bded6e04df6473376059ed5335` |
| `SHA256SUMS` | 1,179 | `570d61e1ad755184973de2e7b1970ed9032c7283ff18e2259043d8e6bb8e260d` |

The six provider sidecars and three provider ZIPs remain byte-identical to the R5C2A receipt. R5C2B
adds an admission control and does not rewrite provider payloads. Source SBOM and checksum identities
change because the public source inventory now includes the six R5C2B source paths.

## Promotion and rollback evidence

- Invalid stage: checksum grammar was corrupted after copying a valid candidate. Admission rejected,
  the stage was deleted, the prior release sentinel remained byte-identical, and no rollback sibling
  remained.
- Valid replacement: a complete copied stage was admitted, the prior directory was retained until
  rename success, the promoted release revalidated as admitted, and neither stage nor rollback
  residue remained.
- Rollback authority: revert source/evidence commits on the retained branch or restore the verified
  2026-08-19 kit snapshot/tag. Target `.Codex/` trees are not rollback sources.

## Remote boundary

At evidence authoring time this branch has not been pushed and no R5C2B PR or CI receipt exists.
Remote qualification must bind the immutable evidence head to Linux, Windows, aggregate, and
no-conflict results before a standard PR-only merge. The feature branch must be retained.
