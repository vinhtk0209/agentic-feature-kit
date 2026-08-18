# P17-018 R5B — Binary Privacy Evidence

Date: 2026-08-18

Local source status: complete. Evidence-tree qualification, the evidence commit, and remote
pull-request qualification are pending and must be recorded from observed state. Scope lock:
`slice=R5B, binary=B1, archive=A1, review=R1, fixture=F1, history=H1, evidence=E1`.

## Outcome and nonclaims

R5B removes 19 private specification screenshots from the future public candidate while retaining
their exact bytes in a verified private archive. It binds every retained public binary to an exact
review record and a fail-closed media parser, corrects two JPEG files that had `.png` extensions,
and removes credential-shaped text from two deterministic test fixtures without weakening their
behavioral assertions.

This is privacy remediation, not publication. It does not claim link, dependency-license, SBOM,
distribution-archive, clean-clone, deterministic-build, release-candidate, package, plugin,
provider, database, sync, tag, release, or repository-visibility readiness. Versions remain
`3.25.0 / v3.25 / 0.5.0 / 1.3.0`, and the root package remains `private: true`.

## Source identity

- Parent and archive source: `ab2bdf6d9810bae96937494fd649178ece74d6a3`
- Source commit: `699ef24ff5998d87d0352b52055a23287bafec51`
- Source tree: `1a9c20b3d03bd478ea69f6e1de948b4968a48a83`
- Subject: `feat(release): enforce binary privacy boundary`
- Exact staged source scope: 34 paths, path-manifest SHA-256
  `2a23cd12d573878c0982602b153305b0c03b67884cd2d6f70027902d87aad30d`
- Commit hook: `spec-integrity` passed for six TypeScript files.

The source commit parent and tree were re-read after commit and matched the qualified parent and
staged tree exactly. The branch worktree was clean. The separate evidence commit and evidence tree
cannot be embedded in a file that contributes to their own hashes; they are bound immediately
after commit in the workspace handoff and again by the exact-head PR/CI record. The ordinal
evidence-only path manifest is exactly this file plus `release/public-release-manifest.json`,
LF-terminated UTF-8, two paths, SHA-256
`04767e165ba65787974f30e119f2dca2a5f6b5ab2b0e05f695fff8dd1c5bd457`.

## Private archive authority

Before deletion, all 19 tracked files under `docs/specs/ClassDetailsModuleList/images/` matched
their exact Git blobs at the qualified archive source. The verified aggregate authority is:

| Field | Observed value |
|---|---|
| Archive ID | `p17-018-r5b-private-binary-archive-2026-08-18` |
| Artifact count | `19` |
| Total source bytes | `19,343,925` |
| ZIP bytes | `18,437,037` |
| ZIP SHA-256 | `ab67e5adc38d69b023a469366f2d6464c4f390214be98a7782126d39d3d11e74` |
| Private-manifest SHA-256 | `721d28c4ece6e2152481a0833e3cddbffb7021fdbf3f0b20523aea68e943c6fa` |
| Public receipt | `release/private-binary-archive-receipt.json` |
| Verdict | `verified-private` |

The ZIP contains exactly the private manifest plus the 19 source images. A fresh bounded expansion
re-proved the exact 20-entry set, every per-file byte count and digest, the aggregate total, and the
private-manifest digest. Temporary staging and verification directories were removed afterward.
The public receipt intentionally exposes only aggregate recovery authority, not private paths or
per-file details. The private archive is outside the repository and is not a public artifact.

## Retained public binary authority

`release/public-binary-review.json` contains exactly three review rows and no wildcard, directory
allow rule, mutable approval, external URL, or user identity:

| Path | Bytes | SHA-256 | Container verdict |
|---|---:|---|---|
| `docs/evidence/o2-continuous-assurance-pass-2026-08-11.jpg` | 83,215 | `c84b5fe1a47426ff5d72b83dd222a9b685265a05471d768633c12a4435ed4eb0` | JPEG/JFIF, 1253x705 |
| `docs/evidence/o2-continuous-assurance-progress-2026-08-11.jpg` | 88,081 | `a50486cbcdaa884a7fd4c33f3fa90eaaae1b88f2d8d81db1cc992f24b6be1c4b` | JPEG/JFIF, 1253x705 |
| `docs/evidence/o2-continuous-assurance-status-2026-08-11.jpg` | 83,617 | `4973cda46645127c1fc9ef35858c2903ca833ec0e52eee3a4e5390f329330902` | JPEG/JFIF, 1253x705 |

Visual review found operational run identifiers but no visible email address, credential, private
hostname, customer name, or user name. The two extension corrections are byte-identical renames;
all three reviewed digests remain unchanged.

The binary gate derives its candidate set from the canonical public manifest. It rejects missing
or extra review rows, unknown binaries, path traversal/case drift, wrong size or digest, media-type
or extension drift, malformed PNG structure/CRC/metadata/trailing data/dimensions, and malformed
JPEG structure/EXIF/comments/trailing data/dimensions. Current files must be tracked and included
as `binary`; deleted private images must be absent from both the index and manifest.

## Fixture substitutions and absence proofs

The Figma REST fixture now uses generic deterministic metadata: project name `sample-learning`,
date `2026-01-01`, version `1`, and thumbnail URL
`https://example.invalid/design/thumbnail.jpg`. The old credential-shaped signed URL and its
AWS-style identifier are absent. The parser's URL extraction, HTTP status, response-shape, and
deterministic-output assertions remain intact and pass `13/13`.

The privacy-policy attack still tests the identical private-key boundary, but constructs it at
runtime from two non-secret fragments. The detector, expected denial, and attack coverage are
unchanged. Positive-controlled fixed-string searches plus independent
`Select-String -SimpleMatch` searches proved zero old `.png` evidence references, zero old
AWS-style identifier, and zero raw contiguous private-key delimiter in the public candidate.

## TDD, attacks, and regression evidence

The plan gate first failed only because the R5B plan was absent, then passed all 11 locked sections.
The binary contract passed its canonical in-memory registry/receipt and strict PNG/JPEG fixtures
before current-tree assertions were enabled. Its expected RED identified exactly seven intended
gaps: receipt, registry, private-image removal, public-manifest authority, JPEG extension
correction, Figma sanitization, and reconstructed private-key marker. After remediation it passed
all 21 attacks and all seven current surfaces.

| Gate | Result |
|---|---|
| R5B plan | PASS, 11 sections |
| Binary privacy | PASS, 21 attacks / 7 current surfaces |
| Figma REST fixture | PASS, 13/13 |
| Privacy policy | PASS, 8 families / 10 contract groups / 15 attacks |
| R4A backend boundary | PASS, 7/7 |
| R4B synthetic fixtures | PASS, 11 attacks / 7 surfaces |
| R4C prompt history | PASS, 12 attacks / 5 surfaces |
| R4D private archive | PASS, 11 assertions / 7 surfaces |
| R4E operational aliases | PASS, 10 attacks / 6 surfaces |
| R4F historical aliases | PASS, 14 attacks / 7 surfaces |
| R5A nightly workflow | PASS, canonical + 11 attacks |
| Cross-platform release | PASS, 11/11 |
| Public entry | PASS, 5/5 |
| Public governance | PASS, 5/5 |
| Public release core | PASS, 18/18 |
| Node Git-index adapter | PASS, 7/7 |

R4D, R4E, and R4F each contained a global manifest-count floor coupled to unrelated successor
content. R5B removed only those floors and, for R4E, replaced one R4D implementation-detail check
with explicit R4D-owned authority markers. Every predecessor-owned path, receipt/config marker,
evidence path, alias digest, include-only rule, current-surface assertion, and attack remained
mandatory and passed.

Cached TypeScript `5.9.3` compiled all six changed TypeScript files with `strict`, `noEmit`,
`skipLibCheck=false`, ES2022, and Node16 module/resolution without diagnostics.

## Complete-kit source receipt

The staged source tree, later proven byte-identical to the source commit tree, passed the complete
kit suite:

- native exit: `0`
- duration: `303457 ms`
- stdout: `123841` bytes / `1693` lines / SHA-256
  `729b6c7febc1739638e49d730d0e4800dc75cb50f06ab58e4ac2f1a3424e2d83`
- stderr: `1084` bytes / `10` lines / SHA-256
  `5e02fd3cbb5d5316d362ef7ab15b0d1dd08f9da669fca63b195db4f9e304472a`
- lesson synchronization: `60/60`

Stderr contains only the ten existing lesson-fixture normalization warnings. There was no test
failure, skipped R5B gate, sync, network mutation, provider/database invocation, or generated
worktree residue.

## Public candidate authority

Before the source commit, the exact Git-index candidate and public manifest matched `615/615`
unique tracked/included paths, with exactly three reviewed binaries, zero private-image paths,
zero excluded paths, and no classification blocker. The manifest remains ordinal and include-only.
Package/prompt authority remains unchanged and conservative.

## Remote qualification still required

The evidence head must be pushed non-force to retained branch
`p17-018-r5b-binary-privacy` and opened as a draft PR into `main`. Merge is allowed only after the
exact evidence head has GREEN Linux, Windows, and aggregate jobs, valid qualification artifacts,
no conflict, and an unchanged PR head. Remote PR/run/job/artifact/merge identities are absent until
observed and are recorded immediately in the canonical workspace handoff.

## Rollback and external-effect statement

Rollback is a revert of the source and evidence commits or restoration from the verified
2026-08-18 backup. Removed images can be recovered from private canonical Git history or the
verified private archive. The retained feature branch must not be deleted.

R5B performs no direct-main push, force push, sync, target `.Codex` edit, provider invocation,
Supabase/database write, dashboard mutation, tag, release, package/plugin publication, repository
visibility change, or user/admin installation.
