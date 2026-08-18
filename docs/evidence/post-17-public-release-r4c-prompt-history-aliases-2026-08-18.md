# P17-018 R4C Prompt-History Alias Evidence

**Date:** 2026-08-18
**Task:** P17-018
**Scope:** `slice=R4C, history=H1, aliases=A1, regression=G1, registry=R1, evidence=E1`
**Starting commit:** `6ddc006ed4cb743b38047e32de685a54b638cbda`
**Primary source commit:** `b1d7571fdc089385277e63de0fc2199274affc3f`
**Source-correction commit:** `0d3ee150398bbd08aff9959fb570e7c345384d79`
**Qualified source tree:** `f48627ce00a7ba5d315d6523fd6c1de970cc4436`

## Outcome

R4C replaced the 25 bound workspace-target identities in the prompt-evolution history with the
stable neutral aliases `example-learning-app` and `example-authoring-app`. The change preserves
the historical ledger's line, heading, lesson-annotation, and change-token structure and is
reversible to the exact canonical starting bytes.

The public-release candidate remains intentionally blocked by 20 unresolved marker bindings.
This evidence does not claim release eligibility, publication, or that the remaining historical
evidence is safe for a public artifact.

## Backup and input authority

- Verified daily backup tag: `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02`.
- Verified kit worktree ZIP SHA-256:
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.
- Primary source manifest: ten ordinal LF-final paths, SHA-256
  `98f146d4b36b314a1063bc2b069693bf06a73724efd824860606d0f560b2b44d`.
- Source-correction manifest: two ordinal LF-final paths, SHA-256
  `35d75ccc7861bd97c708b811a60f63319f002579b76c5ec1864adb546e49d5ea`.
- Evidence manifest: this file plus `release/public-release-manifest.json`, ordinal LF-final
  SHA-256 `7f2646d0f2fc060c9d129bb4e0463d78ad38bbef59a09f6282baa4384a863cd0`.
- TypeScript/Node remained the measured implementation choice. The slice is deterministic text,
  registry, and contract validation; no Rust, Go, or Python performance or capability gap was
  found.

## Test-first chronology

1. The package-registered R4C readiness validator failed only because the locked plan was absent.
2. After the H1/A1/G1/R1/E1 plan passed, the new prompt-history contract passed all 12 synthetic
   attacks and failed on exactly five current surfaces: alias transform, registry authority,
   remediation-safe R4B authority, Node index authority, and release-manifest paths.
3. The exact 25-span transform was applied before registry or authority changes. Canonical and
   reverse hashes plus all structural counts were proven before continuing.
4. Focused regression found one stale exact-equality assumption in the R4A contract. The primary
   source scope expanded from nine to ten paths, and that contract was changed to allow only
   monotonic disposition reductions from approved classes.
5. Static, strict-TypeScript, Git-index, direct-domain, and full-kit gates qualified the exact
   primary source tree before and after commit.
6. The first evidence audit calculated the exact two-path LF-final identity and found the plan's
   literal was stale. Evidence changes were restored; a calculation-bound readiness assertion
   produced RED; the plan was corrected; and readiness, strict TypeScript, and full kit passed at
   the immutable source-correction commit before evidence was recreated.

## Prompt-history receipts

- Canonical starting SHA-256:
  `28cca65197070069287da54c539f1ac63abd27a560b61587a7b99ce78b1fe1a9`.
- Canonical transformed SHA-256:
  `709873d9ebdb4571be12e17563c0e0493dee360b07f49cf2a5c51712841feb90`.
- Structure before and after: `1,836` lines, `182` headings, `60` lesson annotations, and
  `158` bounded Change tokens.
- Alias counts: `example-learning-app=23`; `example-authoring-app=2`.
- Bound raw target identifiers after remediation: `0`; retained historical workspace prefixes
  attached to either alias: `0`.
- Reverse-alias reconstruction is byte-identical to the starting prompt-history blob.

## Release-authority delta

| Authority | Before R4C | Primary source | Evidence stage |
|---|---:|---:|---:|
| Manifest total paths | 608 | 611 | 612 |
| Included paths | 603 | 606 | 607 |
| Excluded paths | 5 | 5 | 5 |
| Classified occurrences | 46 | 21 | 21 |
| Unresolved blockers | 22 | 20 | 20 |
| Prompt-history raw target occurrences | 25 | 0 | 0 |
| Prompt-history neutral aliases | 0 | 25 | 25 |

The remaining dispositions are exactly `genericize` at 14 bindings/15 occurrences and
`move-to-private-archive` at six bindings/six occurrences. The source-stage registry SHA-256 is
`6ba601fa8d03ad5231d1f27898fc29236f03cb446baa62c4f69f89923b829309`; the manifest binds the
same digest. Source-stage manifest SHA-256 is
`efe2043e72f307a18ccd25c8c820fe0b456461aeaf9c6cbaa49db33e1cf9e56d`; evidence-stage manifest
SHA-256 is `41f754c6fcb9d540845f073b05c064769a9719fa2ef4d842b30c1833e2fa8e97`.

## Verification receipts

### Focused behavior and attack gates

- R4C plan: PASS (`H1/A1/G1/R1/E1`), including calculated evidence-manifest identity.
- Prompt-history alias contract: PASS (`12` attacks, `5` current surfaces).
- R4A legacy-backend regression: PASS (`7/7`).
- R4B synthetic-fixture regression: PASS (`11` attacks, `7` current surfaces).
- Lesson registry: PASS (`20/20`); integration: PASS (`7/7`).
- Sync rollback, verify guard, and install report: PASS without running a real sync.
- Direct public-release domain: PASS (`18/18`).
- Node Git-index public-release authority: PASS (`7/7`).
- Primary source-stage sentinel: `contractValid=true`, `candidateStatus=blocked`, `606`
  includes, five excludes, 21 classified occurrences, and 20 unresolved-disposition blockers.
- Exact staged focused/strict receipt: 171 lines, SHA-256
  `01333d5a6724a30cef5bca021d6139bd915558a2ea94a6af45e5854f61239b8c`.
- Immutable primary-source focused/strict receipt: 171 lines, SHA-256
  `47853f432d4ac3bd8badc64052a154ab677980f0c7c068f83684880e9c926718`.

### Strict and static gates

- Absolute cached compiler readback: TypeScript `5.9.3`.
- Primary strict compile: PASS on the nine-file affected graph with `strict`, `noEmit`,
  `skipLibCheck=false`, ES2022/DOM, CommonJS, Node resolution, and `esModuleInterop`.
- Correction strict compile: PASS on the calculation-bound readiness validator.
- Static primary audit: PASS on exactly ten paths; UTF-8/LF/final-LF/no trailing whitespace,
  valid JSON, manifest sorted/unique, registry digest parity, and positive-controlled raw-identity
  absence.
- Primary staged index: exactly ten paths, zero unstaged/untracked paths, index tree
  `823a75967c2c3c2d7af20b5e517185d634901b19`, and clean cached diff-check.
- Normal hooks: primary `spec-integrity` PASS on five TypeScript files in `192 ms`; correction
  PASS on one TypeScript file in `125 ms`.
- Source and correction commit readbacks: exact parent/tree/path manifests and clean
  worktrees/indexes.

### Complete-kit gates

| Candidate | Completion | Duration | Lines | Stdout SHA-256 |
|---|---:|---:|---:|---|
| Exact staged primary source | terminal `&&` gate PASS | 280,274 ms | 1,955 | `05cf3e696f4141e2016cc5de38ad00c62d44068e80d11e95a02bb26539dc105d` |
| Immutable primary source `b1d7571fdc08…` | exit `0` | 277,927 ms | 1,955 | `c58c3b1905f0098ba6e5994e545acddc7822eb20d09683bc811f2bde40656b18` |
| Immutable corrected source `0d3ee150398b…` | exit `0` | 274,537 ms | 1,955 | `9ab40dad82da4e4a0e308113f8e00da5c4da1a31c61d48b1138a8f7a4ac95032` |

All three runs reached lesson sync `60/60`. Their stderr is the same ten expected lesson-registry
coercion warnings, SHA-256
`f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`. Temporary logs remain
outside the repository and are not release artifacts.

## Safety, rollback, and non-claims

- No target `.Codex` directory was read or modified.
- No dashboard source or snapshot was modified.
- No real sync, provider execution, database operation, package publication, tag, release,
  visibility change, direct-main push, branch push, or PR action occurred during local R4C work.
- The remaining 20 blockers are not suppressed. P17-018 remains open for private-archive and
  later supply-chain/release-readiness slices.
- Local rollback is the starting commit
  `6ddc006ed4cb743b38047e32de685a54b638cbda`; broader recovery uses the verified daily tag/ZIP.
- The evidence commit is the commit that adds this document and its sorted manifest entry. Its
  immutable identity is recorded in the workspace handoff after normal-hook commit readback.
