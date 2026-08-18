# P17-018 R4B Synthetic Fixture Privacy Evidence

**Date:** 2026-08-18
**Task:** P17-018
**Scope:** `slice=R4B, baseline=B1, confluence=C1, projectRef=P1, regression=G1, registry=R1, evidence=E1`
**Starting commit:** `15606c0476bf657372fe4b518c434673c0aa74a3`
**Immutable source commit:** `307b10d64504403f379a33ddb677077d990a0b3b`
**Immutable source tree:** `5aac4281698cdfa087ed35505cc36895a4812dec`

## Outcome

R4B replaced all six `replace-with-synthetic-fixture` bindings and their 24 classified
occurrences without changing a production runtime, dashboard snapshot, provider, database, or
target repository. The semantic baseline is now deterministic synthetic English data; Confluence
tests use reserved origins; project-reference tests are value-independent; and the R4A regression
contract permits only monotonic remediation.

The public-release candidate contract remains intentionally blocked by the 22 deferred
genericization/private-archive bindings. This evidence does not claim release eligibility or that
any artifact or repository was published.

## Backup and input authority

- Verified daily backup tag: `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02`.
- Verified kit worktree ZIP SHA-256:
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.
- Bound source manifest: 15 ordinal LF-final paths, SHA-256
  `e16fd7305c29152f4dd20f76e42223e47423974edfe8c6fc8e49471ad142669f`.
- Bound evidence manifest: this file plus `release/public-release-manifest.json`, SHA-256
  `f5527395df91a8ac8b9c953e13bf8eb7dc6d54bc82e877167fb7cc1fc3dd227e`.
- TypeScript/Node remained the measured implementation choice. The slice is static fixture and
  contract validation; no Rust, Go, or Python performance/capability gap was found.

## Test-first chronology

1. The R4B readiness validator was package-registered first and failed only on
   `R4B synthetic-fixture plan`.
2. The locked B1/C1/P1/G1/R1/E1 plan was added; the unchanged readiness validator passed.
3. The synthetic-fixture contract was added before fixture/registry edits. Four harness defects
   were isolated without accepting them as product evidence: an `AC-*` work-item false positive,
   case-sensitive person-field matching, JSON-escaped path representation, and expected-error text.
4. With all 11 adversarial mutations passing, the current tree failed on exactly seven groups:
   semantic baseline, Confluence origins, project references, R4A monotonic regression, marker
   registry, Node index authority, and release-manifest paths.
5. The bounded source changes reduced those seven groups to one canonical-hash mismatch. A
   category-only audit proved every semantic/privacy check was valid and exposed a PowerShell
   transport mistake that had hashed literal escape characters. Direct byte computation produced
   the canonical hash below; no validation was weakened.
6. The unchanged synthetic-fixture contract then passed all 11 attacks and seven current surfaces.

## Synthetic baseline receipts

- Paragraphs: `95`; unique anchors: `95`.
- Acceptance criteria: `19`; structured Given/When/Then scenarios: `19`.
- Literal provenance resolutions: `19`; each requirement has exactly one source provenance.
- Canonical source SHA-256:
  `0ad01bee97a2d662654b98aea6d6f4a260cfd8d011beab8bedc47b595a937efc`.
- Semantic hash:
  `aa823e08db5a6d27fd22e86b3bb12ce3beee306c726adbf900ca86258927d487`.
- Provenance hash:
  `ebc76d11789e26023f32bf6e4603210cb071e9148beb8a81d70c08a57f45569b`.
- Fixture bytes: UTF-8, ASCII English, LF-only, one final LF, no trailing whitespace, no network
  URL, internal work-item/person/email/user-path/file-URI/JWT-like/live-project-shaped content.

## Release-authority delta

| Authority | Before R4B | Source commit | Evidence stage |
|---|---:|---:|---:|
| Manifest total paths | 604 | 607 | 608 |
| Included paths | 599 | 602 | 603 |
| Excluded paths | 5 | 5 | 5 |
| Classified occurrences | 70 | 46 | 46 |
| Unresolved blockers | 28 | 22 | 22 |
| Internal-hostname occurrences | 21 | 0 | 0 |
| Live-project-reference occurrences | 8 | 5 | 5 |

The remaining dispositions are exactly `genericize` at 16 bindings/40 occurrences and
`move-to-private-archive` at six bindings/six occurrences. The source-stage registry bytes have
SHA-256 `94cb889012fd1fd1e7390cf670b1635129b33db1c154e3792abe84be1246c47e`;
the manifest binds that same digest. Source-stage manifest bytes have SHA-256
`82f124fbb31f69ad40e891df739f625b7766adc2e5f641e39c4a88e2ed8d29d7`.

## Verification receipts

### Focused behavior and attack gates

- R4B plan: PASS (`B1/C1/P1/G1/R1/E1`).
- Synthetic fixture: PASS (`11` attacks, `7` current surfaces).
- Semantic specification: PASS (`8` assertions, `12` attacks).
- Confluence HTTP, refetch actor, and B0 intake: PASS.
- P17-016 C2 schema/migration design: PASS.
- P17-016 C4D disposable verification: PASS (`2` repositories, `2` tenants, `17` scenarios).
- R4A legacy-backend regression: PASS (`7/7`).
- Direct public-release domain: PASS (`18/18`).
- Node Git-index public-release authority: PASS (`7/7`).
- Candidate sentinel: `contractValid=true`, `candidateStatus=blocked`, `602` source-stage includes,
  five excludes, 46 classified occurrences, and 22 unresolved-only blockers.

### Strict and static gates

- Absolute cached compiler readback: TypeScript `5.9.3`.
- Strict compile: PASS on ten affected TypeScript owners with `strict`, `skipLibCheck=false`,
  `CommonJS`, `Node`, `esModuleInterop`, and no emit.
- Static source audit: PASS on exactly 15 paths; UTF-8/LF/final-LF/no trailing whitespace, valid
  JSON, manifest sorted/unique, source-stage counts exact, and registry digest parity.
- Staged index: exactly 15 paths; zero unstaged paths; `git diff --cached --check` clean.
- Normal commit hook: `spec-integrity` PASS on ten TypeScript files in `419 ms`.
- Source commit readback: exactly 15 paths; clean worktree/index; `git diff --check HEAD^` clean.

### Complete-kit gates

| Candidate | Exit | Duration | Lines | Log SHA-256 |
|---|---:|---:|---:|---|
| Exact staged source | 0 | 444,730 ms | 1,943 | `9818c311e0379d1debde32c2cebc89fab23fd9d46ed787d403d54ce7ce368155` |
| Immutable source `307b10d64504…` | 0 | 399,198 ms | 1,943 | `08786c56d4a3ffd2cce9887da14caf26083fb402133e1c5a55f2864fba10e59a` |

Only pre-existing lesson-registry normalization warnings appeared; every suite exited green.
Temporary logs remained outside the repository and are not release artifacts.

## Safety, rollback, and non-claims

- No target `.Codex` directory was read or modified.
- No dashboard source or snapshot was modified. The cross-repository C2/C4D validators only read
  their already committed evidence/contracts.
- No sync, provider execution, database read/write, package publication, tag, release, visibility
  change, direct-main push, branch push, or PR action occurred during local R4B work.
- The remaining 22 blockers are not suppressed. P17-018 remains open for dependency-ordered
  genericization/private-archive and later supply-chain/release-readiness slices.
- Local rollback is the source commit parent
  `15606c0476bf657372fe4b518c434673c0aa74a3`; broader recovery uses the verified daily tag/ZIP.
- The evidence commit is the commit that adds this document and its sorted manifest entry; its
  immutable identity is recorded in the workspace handoff after normal-hook commit readback.
