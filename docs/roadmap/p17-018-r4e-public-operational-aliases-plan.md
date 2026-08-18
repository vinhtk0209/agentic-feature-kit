# P17-018 R4E — Public Operational Alias Plan

**Date:** 2026-08-18
**Task:** P17-018
**Scope lock:** `slice=R4E, surfaces=S1, aliases=A1, regression=G1, registry=R1, evidence=E1`
**Starting commit:** `8220db9b79193f6aa16b8b2ed377b4d94cbc2297`

## Outcome

Genericize the five remaining workspace identities exposed by public operational examples while
preserving the behavior, structure, and explanatory meaning of every affected surface. R4E changes
four learning-target and one authoring-target occurrences across the image-reuse guidance, public
API reference, sync rollback example, and source-of-truth comments. It reuses the stable aliases
`example-learning-app` and `example-authoring-app`, removes exactly five marker-registry bindings,
and leaves the historical design and evidence findings visible for the next reviewable slice.

R4E changes no executable control flow and does not claim public-release eligibility. The release
candidate remains fail-closed until the nine historical-design/evidence bindings and all later
release gates are complete.

## Reconciled starting state

- R4D is merged through PR #13 at `8220db9b79193f6aa16b8b2ed377b4d94cbc2297` after exact-head
  Linux, Windows, and aggregate CI passed. Its retained feature branch remains available.
- The committed release authority is contract-valid but intentionally blocked: 616 total paths,
  616 includes, zero excludes, 15 classified occurrences, and 14 unresolved dispositions.
- All remaining marker bindings use the `genericize` disposition. Five of the 14 bindings are
  public operational examples; nine are historical design or evidence records.
- The four candidate files have exact canonical source/transformed SHA-256 pairs and invariant line
  counts:
  - `.claude/_content/images.md`: `8b7cea3c9e4a354753fd925817b0e0d34a293cc464c58599544a3867cb1a8fa2`
    to `2af4469dce889d39abebdb6a43d135506672ff3b8b35d954619f33f49e0b37a2`, 321 lines.
  - `.gitignore`: `c11d7b239ca25f1480d848187c2e8203faa9ee273289dd22208d6c17bd0c2790`
    to `03042f82c599e1627837a359698361ae7831c29260a830709637c7b509a6a384`, 52 lines.
  - `docs-site/pages/api-reference.mdx`:
    `3196e7205a07ceeaecf738babf678ff15dc220ab228b136cd0091f1f7fccfe57` to
    `637bbe2dc5677f8d07f3910f520a9a215ac89a4bf873a6fa2002308ed7e5178f`, 82 lines.
  - `scripts/sync-to-targets.ts`:
    `dfcfe7468d387e8bb6421738e19b023cfdee9ee44ee21c372c5a14358b3129e3` to
    `312fc77e346f50bbd64046fd752cf2ea2ae96dd405970c71172a95ce48448360`, 726 lines.
- Pre-change R4D plan, private-archive, prompt-history, Node Git-index, and sync-config tests pass.
  Contract mode returns success with an honest blocked sentinel; eligibility mode exits one.
- Today's verified rollback authority remains tag `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02` plus worktree ZIP SHA-256
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4E changes exactly four public operational surfaces, adds one readiness contract and one
adversarial operational-alias contract, makes the R4C and R4D current-authority checks monotonic,
removes five registry bindings, updates Node/package/public-manifest authority, and records evidence
in a later evidence-only commit.

R4E does not rewrite historical design or evidence, replace the live project-reference marker,
replace the local-path marker, change a runtime option, alter sync admission, run sync, modify a
dashboard snapshot, touch target repositories, rename a package or provider, or change provider
bundle/core/prompt compatibility. Root package version 3.25.0 and `PROMPT_VERSION: v3.25` remain
unchanged because this privacy remediation adds no user-visible capability or compatibility break.

## Locked R4E decisions

### S1 — Remediate only public operational surfaces

The exact candidate set is `.claude/_content/images.md`, `.gitignore`,
`docs-site/pages/api-reference.mdx`, and `scripts/sync-to-targets.ts`. The transformation changes
only five bound identity spans. Reversing aliases to the source forms must reconstruct every exact
canonical starting SHA-256, proving that comments, commands, punctuation, ordering, routes, and
runtime code outside those spans did not drift.

Each transformed file must preserve its exact line count, LF-final form, and all non-identity
bytes. The TypeScript surface changes only a documentation comment; strict compilation and sync
config/rollback/guard tests prove that operational behavior remains unchanged.

### A1 — Reuse stable public aliases

The aliases are `example-learning-app` and `example-authoring-app`, already established by R4C/R4D
and tracked public sync defaults. They are lower-case, kebab-case, role-descriptive, and independent
of a company, customer, person, local directory, provider, framework, or deployment environment.

The image guidance, API rollback example, and sync rollback example each receive one learning alias.
The source-of-truth comment receives one learning and one authoring alias. The contract rejects wrong
case, near-miss names, old workspace prefixes, extra aliases, partial replacement, or a replacement
outside the five bound spans.

### G1 — Preserve behavior and prior release contracts

The new contract owns exact reversible bytes, line counts, alias counts, marker deltas, package
routing, manifest entries, and current Node authority. It exercises attacks against raw identities,
wrong aliases, count drift, unrelated byte mutation, line-ending drift, registry suppression, and
stale prior-slice assertions.

R4C and R4D retain their historical boundaries but change exact current-authority assertions to
explicit monotonic ceilings. They continue to reject reintroduction, new dispositions, missing
archive receipts, lost Git-index binding, or count increases. The R4E contract owns exact current
counts so later reviewed remediation may lower them without weakening R4E's five-path guarantee.

### R1 — Reduce marker authority exactly

Remove the four candidate occurrences from `workspace-target-learning` and the `.gitignore`
occurrence from `workspace-target-authoring` only. Learning marker authority falls from six to two
occurrences/bindings. Authoring marker authority falls from seven occurrences/six bindings to six
occurrences/five bindings. The live-project and local-path markers remain one occurrence/binding
each.

Therefore classified occurrences fall from 15 to 10 and release blockers fall from 14 to nine.
The sole remaining disposition is `genericize` at nine bindings and ten occurrences. No marker
fingerprint, detector, reason code, remaining path/count, or other registry field changes.
Source-stage manifest authority is 619 total paths, 619 include, and zero exclude. Evidence-stage
manifest authority is 620 total paths, 620 include, and zero exclude.

### E1 — Keep evidence immutable and separate

The source commit contains the locked plan, readiness test, operational-alias contract, four exact
alias transforms, remediation-safe prior contracts, exact registry delta, package routing, Node
authority, and source-manifest update. A later evidence-only commit records RED/GREEN receipts,
canonical/reversible hashes, integration/static/staged and immutable verification, rollback, and
external-effect nonclaims.

Evidence records exact commit identities and aggregate marker authority without reproducing retired
workspace identities or turning local qualification into a publication claim.

## Threat model and attack matrix

The R4E contracts reject:

- a raw candidate identity, partial replacement, wrong alias, wrong case, near-miss alias, old
  workspace prefix, missing alias, extra alias, or alias introduced outside an approved span;
- any unrelated byte change, line-count change, CRLF or lone-CR drift, missing final newline, or
  comment/example semantic drift;
- executable changes in `scripts/sync-to-targets.ts`, altered sync configuration selection,
  rollback parsing, admission behavior, or target resolution;
- removal of any non-candidate registry binding, altered fingerprint/detector/reason/disposition,
  stale candidate binding, suppressed finding, or current authority other than 10/9;
- a missing package command, missing full-kit route, missing or incorrect public-manifest entry,
  unknown tracked path, and Node evaluation against worktree rather than Git-index bytes;
- diagnostics or evidence that echo a retired identity instead of a path/category/count.

Every absence assertion has an injected positive control plus a second count, reverse-hash, registry,
or Git-index authority. Attack fixtures construct retired values from fragments so test source does
not add classified findings.

## TDD and verification ladder

1. Add and package-register the R4E readiness validator; prove RED only because this plan is absent.
2. Add this plan and require the unchanged S1/A1/G1/R1/E1 readiness validator to pass.
3. Add/package-register the operational-alias contract before candidate remediation. Require pure
   attacks to pass and current-tree checks to fail only on raw candidate identities, missing aliases,
   stale registry/current-authority counts, and missing public-manifest paths.
4. Apply the five deterministic replacements. Require all four transformed hashes, reverse hashes,
   exact line counts, five alias counts, LF/final-newline form, and zero candidate identities.
5. Remove exactly five registry bindings; update R4C/R4D monotonic assertions plus Node/package/
   manifest authority. Require exactly 10 classified occurrences and nine blockers.
6. Run readiness, operational aliases, R4C/R4D, public-release domain, Node Git-index, sync config,
   sync rollback, sync verify guard, and direct candidate sentinel. Compile affected TypeScript with
   TypeScript 5.9.3, `strict`, `noEmit`, and `skipLibCheck=false`.
7. Audit the exact source manifest for UTF-8/LF/final newline/trailing whitespace, JSON validity,
   English feature content, ordinal manifest/digest parity, positive-controlled identity absence,
   package routing, and Git-index blob/filter parity. Run the complete kit against the staged index.
8. Commit source through normal hooks; rerun focused/full verification on the immutable source SHA.
   Add and separately commit evidence plus its manifest row; rerun focused/full verification on the
   immutable evidence SHA. Remote branch/PR/CI remains a separately verified lifecycle.

TypeScript and Node remain the measured implementation choice. This slice performs deterministic
text normalization, SHA-256 hashing, JSON authority checks, and Git-index integration already owned
by the Node toolchain. Rust, Go, or Python would add a compiler/runtime, distribution, cross-platform,
SBOM, and trust boundary without a measured CPU, memory, concurrency, systems-API, or library gap.

## Exact source and evidence manifests

The source manifest contains exactly these 13 paths in ordinal order:

- `.claude/_content/images.md`
- `.gitignore`
- `docs-site/pages/api-reference.mdx`
- `docs/roadmap/p17-018-r4e-public-operational-aliases-plan.md`
- `package.json`
- `release/internal-marker-classification.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r4e-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-operational-alias-contract.test.ts`
- `scripts/public-release-private-archive-contract.test.ts`
- `scripts/public-release-prompt-history-contract.test.ts`
- `scripts/sync-to-targets.ts`

The LF-final source-manifest identity is SHA-256
`c1544bbf499547ea825e8b07b03ea44246b425edb656751346ab28b51154abc7`.

The later evidence manifest contains exactly:

- `docs/evidence/post-17-public-release-r4e-operational-aliases-2026-08-18.md`
- `release/public-release-manifest.json`

The LF-final evidence-manifest identity is SHA-256
`caa319109c3c4b56c5035cdfe0a35440c4922cfc7523f6a39ec4adace4d15069`.

No generated log, archive, environment file, dashboard snapshot, target path, local configuration,
raw classified value, tag, or release artifact belongs to either commit.

## Rollback and external-action boundary

Edits are bounded to the exact source manifest and made through test-first checkpoints. If a broad
replacement, registry, manifest, staged-index, commit, or other operation fails after partial
mutation, restore the affected repository from today's verified snapshot before retrying; do not
retain a half-genericized surface or half-updated authority.

No sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side
effect belongs to R4E local work. No dashboard source or snapshot is modified. A retained feature
branch, draft PR, exact-head Linux/Windows/aggregate CI, and PR-only merge require exact receipts
after immutable local evidence.

## Completion boundary

R4E is locally complete only when the five candidate identity spans are replaced by the approved
aliases; all four reversible canonical hash and line-count contracts pass; sync behavior remains
green; prior release boundaries remain remediation-safe; registry authority is exactly 10 classified
occurrences and nine blockers; source/evidence manifest authority is exact; focused, strict, static,
staged, immutable-source, and immutable-evidence gates pass; and neither dashboard nor target state
changed.

R4E does not complete the nine historical-design/evidence genericizations, P17-018, public-release
eligibility, supply-chain/nightly/clean-clone readiness, version/tag/release/publication, provider
execution, sync, dashboard, database, or target verification.
