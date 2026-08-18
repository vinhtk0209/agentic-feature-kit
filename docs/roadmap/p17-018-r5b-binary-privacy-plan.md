# P17-018 R5B — Binary privacy boundary

Date: 2026-08-18
Status: approved implementation plan
Parent: `docs/roadmap/p17-018-public-release-plan.md`
Input lock: `slice=R5B, binary=B1, archive=A1, review=R1, fixture=F1, history=H1, evidence=E1`

## Outcome

Remove private corporate screenshots from the future public candidate without losing their private evidentiary value, and make every retained public binary fail closed against an exact reviewed digest and bounded media structure. Sanitize the two credential-shaped text fixtures identified by the R5B read-only audit without weakening their behavioral tests.

R5B is privacy remediation, not a product capability or release. Versions remain `3.25.0 / v3.25 / 0.5.0 / 1.3.0`. This slice does not claim link, dependency-license, SBOM, archive-distribution, clean-clone, release-candidate, publication, or visibility readiness.

## Reconciled baseline

- Qualified base and archive source commit: `ab2bdf6d9810bae96937494fd649178ece74d6a3`.
- The current public manifest contains 629 included paths and 22 binary entries.
- Three O2 continuous-assurance captures were visually reviewed. They show operational run identifiers but no visible email address, credential, private hostname, customer name, or user name. Magic-byte inspection proves all three are JPEG/JFIF streams; the two base paths ending in `.png` must be renamed to `.jpg` without changing their bytes or reviewed digests.
- `docs/specs/ClassDetailsModuleList/images/` contains exactly 19 tracked private images totaling `19,343,925 bytes`. Their prior path/size/digest inventory digest is `6ba6bd5f366e1e01e083a49dbc72376747ba9c94cc44d5fa17ae738688b4eea2`.
- Visual review proves those 19 images contain FPT/eLearning branding, a private product hostname, identifiable people, and real internal feature/specification content. They are not public fixtures.
- The image tree entered canonical Git history at `e5080c0c5114a01cb0b5c66ce4c1e6c633faf9e1` and therefore cannot be made safe by deleting only the current files or by flipping repository visibility.
- Positive-controlled fixed-string search finds `ClassDetailsModuleList` only in the 19 current manifest rows. No separate current-tree historical/test text reference exists, so the earlier genericization proposal is a no-op.
- The Figma REST fixture contains an `X-Amz-Credential` query field and synthetic-but-credential-shaped signed URL values. The privacy-policy test contains a raw PEM private-key marker.

## B1 — Fail-closed public binary policy

Add a dedicated binary contract that derives the candidate binary set from the canonical public manifest and rejects:

1. an included binary path absent from the review registry;
2. a reviewed path absent from the manifest or tracked Git index;
3. path duplication, non-normalized paths, unsupported extensions, or `contentKind` drift;
4. byte count or SHA-256 drift;
5. magic-byte/extension mismatch;
6. truncated, trailing, oversized, over-dimensioned, or over-pixel-budget PNG/JPEG containers;
7. unsafe ancillary text, comment, EXIF, XMP, ICC, Photoshop/IPTC, or application metadata;
8. unknown PNG chunks or JPEG segments outside the small format allowlist proven by the retained fixtures;
9. newly added or renamed binary files that have not received an exact digest review.

The contract must use only bounded reads and integer checks, validate PNG chunk CRCs, and reject before allocating from attacker-controlled dimensions or lengths. It is a source-candidate gate; the final packaged-archive scanner remains R5C.

After remediation, the public manifest must contain exactly the three reviewed O2 binaries, all with `.jpg` paths matching their JPEG magic, and no `docs/specs/ClassDetailsModuleList/images/` entry.

## A1 — Verified private binary archive

Before deleting any tracked image, create a separately governed private archive at `_private_archives/claude-workflow-kit/2026-08-18/p17-018-r5b/`. The directory is outside the Git repository and remains excluded from public source.

The archive sequence is fail closed:

1. Re-read the exact 19 tracked paths from Git and require every worktree blob to equal `ab2bdf6d9810bae96937494fd649178ece74d6a3`.
2. Write a private manifest containing the 19 repo-relative paths, byte counts, SHA-256 digests, source commit, and canonical totals.
3. Create one ZIP containing the 19 byte-identical images plus the private manifest.
4. Expand the ZIP into a new bounded verification directory and re-prove the exact entry set, per-file bytes/digests, artifact count, source-byte total, archive digest, and source commit.
5. Delete only the bounded temporary staging and verification directories after proof; retain the ZIP and private manifest.
6. Add a public metadata-only receipt with aggregate fields only. It must not expose private paths, filenames, per-file digests, people, hostnames, project identifiers, or content.

The archive and private canonical Git history are the rollback sources. Source removal is forbidden until all six gates pass.

## R1 — Digest-bound retained binary registry

Create `release/public-binary-review.json` with an exact schema and only these three reviewed files:

- `docs/evidence/o2-continuous-assurance-pass-2026-08-11.jpg`, SHA-256 `c84b5fe1a47426ff5d72b83dd222a9b685265a05471d768633c12a4435ed4eb0`;
- `docs/evidence/o2-continuous-assurance-progress-2026-08-11.jpg`, SHA-256 `a50486cbcdaa884a7fd4c33f3fa90eaaae1b88f2d8d81db1cc992f24b6be1c4b`;
- `docs/evidence/o2-continuous-assurance-status-2026-08-11.jpg`, SHA-256 `4973cda46645127c1fc9ef35858c2903ca833ec0e52eee3a4e5390f329330902`.

Each row binds normalized path, media type, exact byte count, exact digest, and the bounded visual-review decision. The registry has no wildcard, directory allow rule, mutable approval state, external URL, or user identity. Any digest or metadata change requires a new explicit review and a reviewed source change.

## F1 — Credential-safe public fixtures

Replace the Figma fixture's signed thumbnail with a stable `https://example.invalid/` URL and generic identifiers. Remove all credential-shaped query fields and values while preserving the fetch/parser assertions for URL extraction, HTTP status handling, response shape, and deterministic source output.

Replace the raw PEM private-key marker in the privacy-policy attack fixture with an equivalent marker constructed from non-secret fragments at runtime. The test must still prove denial of the same reconstructed private-key boundary; changing the policy, detector, or expected verdict is forbidden.

Run fixed-string scans with positive controls to prove the old credential-shaped identifier, signature fields, and raw contiguous private-key boundary are absent from the public candidate after remediation.

## H1 — Private canonical history and sanitized export

The current canonical repository remains private. R5B performs no history rewrite, force push, visibility change, publication, or public repository creation.

The 19 current files and manifest entries are removed only from the new R5B tree after private-archive verification. Existing canonical history remains private and auditable. Any later public GitHub source must be a deterministic historyless sanitized export from a separately qualified eligible tree, unless the user separately approves a destructive history rewrite with its own backup and rollback plan.

## Test and attack matrix

1. Plan contract: required headings, exact input lock, source commit, counts, versions, retained digests, fixture and history boundaries.
2. Expected RED before implementation: missing review registry/receipt, 19 private images still tracked and included, unsafe fixtures still present, and binary contract not registered.
3. Archive attacks: invalid JSON, extra private fields, wrong source commit, zero/wrong counts, wrong byte total, malformed digest, unverified status, and archive/source digest mismatch.
4. Registry attacks: extra keys, duplicate paths, traversal/case drift, unsupported extension/media type, wrong size/digest, unknown binary, missing binary, and manifest `contentKind` drift.
5. PNG attacks: bad signature, truncated chunk, invalid length, CRC mismatch, duplicate/missing IHDR/IEND, trailing bytes, unsafe metadata, unknown chunk, excessive dimensions, and excessive pixel count.
6. JPEG attacks: bad SOI/EOI, truncated/invalid segment length, trailing bytes, missing frame, unsafe EXIF/XMP/ICC/IPTC/comment metadata, excessive dimensions, and unsupported segment.
7. Fixture regression: Figma integration tests and privacy-policy tests retain their semantic assertions with no literal credential or raw secret marker.
8. Predecessor/public gates: R4A–R5A plan/domain/history/archive/alias/nightly/cross-platform contracts plus public entry/governance/release and Node Git-index authority.
9. Strict TypeScript compile over every changed TypeScript source with TypeScript 5.9.3, `strict`, `noEmit`, and `skipLibCheck=false`.
10. Complete `test:kit` with native exit code, duration, stdout/stderr byte counts and SHA-256 receipts, followed by exact staged index/tree/path and diff checks.

## Evidence contract

The durable R5B evidence must bind:

- exact base, source commit, evidence commit, and Git trees;
- exact source/evidence path manifests and SHA-256 digests;
- private archive ID, source commit, artifact count, total source bytes, archive SHA-256, private-manifest SHA-256, and fresh-expansion result without publishing private per-file details;
- retained public binary paths, byte counts, digests, media/container verdicts, and visual-review boundary;
- exact fixture substitutions and positive-controlled absence proofs;
- focused attack totals, strict compiler command/version/verdict, full-kit receipt, public-manifest counts, and zero residue;
- retained branch, draft PR, exact-head Linux/Windows/aggregate CI, artifact digests, and explicit nonclaims.

## Rollback and stop conditions

- Stop before deletion if any source blob differs from the qualified base, the archive entry set/digest differs, or fresh expansion fails.
- Stop if a retained binary cannot pass the strict media parser without broadening an allowlist beyond its observed structure.
- Stop if fixture sanitization changes parser/policy semantics or reduces an attack assertion.
- Stop if manifest authority becomes non-ordinal, contains unknown paths, or reports any blocker/classification drift outside R5B.
- Roll back source edits from the feature branch/base commit. Recover removed images only from the verified private ZIP or private canonical Git history.
- Never use sync or modify target `.Codex/` trees as a rollback path.

## Deferred beyond R5B

R5C owns the 13 internal-link repairs, dependency-license policy, text secret gate, deterministic CycloneDX/SPDX sidecars, and final distribution-archive scanner. R5D owns clean-clone and cross-platform double-build qualification. Sanitized public-repository creation, release-candidate/version decisions, dashboard release routing, tags, releases, publication, and any visibility change remain later separately gated work.
