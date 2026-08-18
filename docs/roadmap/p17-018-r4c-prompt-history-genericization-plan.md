# P17-018 R4C — Prompt-History Alias Plan

**Date:** 2026-08-18
**Task:** P17-018
**Scope lock:** `slice=R4C, history=H1, aliases=A1, regression=G1, registry=R1, evidence=E1`
**Starting commit:** `6ddc006ed4cb743b38047e32de685a54b638cbda`

## Outcome

Genericize the two workspace-target identities recorded in the public prompt-evolution history while
preserving the history's ordering, lesson annotations, headings, change references, URLs, paths,
and explanatory meaning. R4C replaces 23 learning-target and two authoring-target identity
occurrences with stable public aliases, removes exactly two marker-registry bindings, and keeps all
remaining genericization and private-archive work visible as release blockers.

R4C changes no executable runtime and does not claim public-release eligibility. It creates a
recomputable history contract so reviewers can distinguish an exact identity-only transform from a
lossy rewrite of operational history.

## Reconciled starting state

- R4B is merged through PR #11 at `6ddc006ed4cb743b38047e32de685a54b638cbda` after exact-head
  Linux, Windows, and aggregate CI passed. Its retained feature branch remains available.
- The committed release authority is contract-valid but intentionally blocked: 608 total paths,
  603 includes, five excludes, 46 classified occurrences, and 22 unresolved-disposition blockers.
- The remaining registry groups are `genericize` at 16 bindings and 40 occurrences and
  `move-to-private-archive` at six bindings and six occurrences.
- One prompt-history file owns two genericize bindings: 23 learning-target and two authoring-target
  identity occurrences. Those 25 occurrences are the highest-delta path-bounded remediation left.
- Canonical LF bytes of the starting prompt history have SHA-256
  `28cca65197070069287da54c539f1ac63abd27a560b61587a7b99ce78b1fe1a9`. The exact alias-only
  transform has SHA-256 `709873d9ebdb4571be12e17563c0e0493dee360b07f49cf2a5c51712841feb90`.
- The starting history has 1,836 lines, 182 headings, 60 lesson annotations, and 158 Change tokens.
- Pre-change lesson-registry, sync, release-domain, and Git-index authority tests are green.
- Today's verified rollback authority remains tag `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02` plus worktree ZIP SHA-256
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4C changes exactly one historical content file, adds one readiness contract and one adversarial
history contract, evolves the R4A and R4B regression contracts to monotonic ceilings, removes two
registry bindings, updates Node/package/public-manifest authorities, and records evidence in a later
evidence-only commit.

R4C does not rewrite dates, lesson IDs, headings, change labels, paths other than the identity
component, localhost behavior, or historical conclusions. It does not remediate the other 20
bindings, move evidence to a private archive, change sync topology, alter runtime code, modify a
dashboard snapshot, run sync, touch target repositories, bump a version, create a tag or release,
publish a package/plugin, push a branch, or change repository visibility.

## Locked R4C decisions

### H1 — Preserve prompt-history semantics and structure

The transform operates on canonical UTF-8 text after normalizing CRLF or lone CR to LF. It changes
only the 25 bound identity spans. Reversing the two aliases to their historical source forms must
reconstruct the exact canonical starting SHA-256. This proves that prose, punctuation, ordering,
dates, links, and paths outside the identity spans did not drift.

The transformed file must retain exactly 1,836 lines, 182 Markdown headings, 60 `@lesson`
annotations, and 158 change-reference tokens matching the contract's explicit grammar. It must use
LF with one final newline and contain no raw target identity. Lesson-registry parsing and sync
behavior remain integration gates rather than being inferred from counts alone.

### A1 — Use stable provider-neutral aliases

The approved aliases are `example-learning-app` and `example-authoring-app`.

The learning target becomes `example-learning-app` in exactly 23 places. The authoring target,
including its historical workspace-prefix component, becomes `example-authoring-app` in exactly
two places. The aliases are lower-case, kebab-case, role-descriptive, independent of a company,
customer, person, local directory, framework, provider, or deployment environment.

The contract rejects partial prefixes, nested historical workspace prefixes, alias count drift,
alias substitution in unrelated text, reintroduced source identities, near-miss aliases, and any
new occurrence that cannot be reversed to the starting authority.

### G1 — Prior release contracts become remediation-safe

The R4B synthetic-fixture contract keeps exact fixture, Confluence, project-reference, and
manifest-path coverage. Its registry and Node-current-authority assertions change from frozen R4B
counts to explicit monotonic ceilings. It still rejects reintroduction of any R4B-remediated marker,
new disposition classes, count increases, or loss of fail-closed Node authority.

The new R4C contract owns exact post-transform history, alias, marker, package, and manifest counts.
This separates historical regression protection from the current remediation authority so later
reviewed slices may reduce blockers without weakening earlier privacy boundaries.

### R1 — Marker authority changes exactly

Remove only the `.claude/prompt-evolution.md` occurrence from each workspace-target marker after the
raw identities are absent. Workspace-target authoring falls from ten to eight occurrences;
workspace-target learning falls from 30 to seven. Classified occurrences fall from 46 to 21 and
release blockers fall from 22 to 20.

The remaining authority is `genericize` at 14 bindings and 15 occurrences plus
`move-to-private-archive` at six bindings and six occurrences. No marker fingerprint, detector,
reason code, remaining occurrence, or disposition changes. Source-stage manifest authority is 611
total paths, 606 include, and five exclude. Evidence-stage manifest authority is 612 total paths,
607 include, and five exclude.

### E1 — Evidence remains immutable and separate

The source commit contains the locked plan, readiness test, prompt-history contract, alias-only
history transform, remediation-safe R4B regression, exact registry delta, package routing, Node
authority, and source-manifest update. A later evidence-only commit records plan RED/GREEN,
contract RED/GREEN, structural/hash receipts, lesson/sync/release/Node gates, strict/static/staged
and immutable full-kit receipts, rollback authority, and external-effect nonclaims.

Evidence records exact commit identities, hashes, counts, and test receipts. It does not reproduce
the retired target identifiers or turn a local proof into a publication claim.

## Threat model and attack matrix

The R4C contracts reject:

- raw learning or authoring target identities, a retained historical workspace prefix, aliases with
  wrong spelling/case/count, and near-miss aliases;
- any byte change outside the 25 reversible identity spans, including punctuation, dates, paths,
  URLs, lesson prose, headings, or ordering;
- CRLF, lone CR, missing final newline, line-count drift, heading drift, lesson-annotation drift,
  and change-token drift;
- stale prompt-history registry bindings, incorrect marker totals, a disposition change, suppressed
  remaining findings, or a classified occurrence/blocker count other than 21/20;
- a package command missing from the full kit, a missing/incorrect public-manifest entry, unknown
  tracked files, and Node authority that evaluates worktree bytes instead of Git-index bytes;
- diagnostics that echo a retired identity instead of reporting a path/category/count.

Every absence claim uses an injected positive control and a second count/hash authority. Attack
fixtures build retired identities from fragments so the public test source does not introduce a new
classified occurrence.

## TDD and verification ladder

1. Add and package-register the R4C readiness validator; prove RED only because this plan is absent.
2. Add this plan and require the unchanged H1/A1/G1/R1/E1 readiness validator to pass.
3. Add the prompt-history alias contract before content remediation. Require its pure attacks to
   pass and current-tree checks to fail only on raw identities, missing aliases, stale registry and
   Node counts, missing package routing, and missing manifest paths.
4. Apply the deterministic identity-only transform. Require canonical source hash
   `709873d9ebdb4571be12e17563c0e0493dee360b07f49cf2a5c51712841feb90`, exact alias counts
   23/2, reversible starting hash, and exact 1,836/182/60/158 structure.
5. Remove exactly two registry bindings, update marker totals, make R4B authority monotonic, and
   update Node/package/manifest routing. Require exact 21 classified occurrences, 20 blockers, and
   only the two remaining disposition groups.
6. Run readiness and adversarial contracts, lesson-registry, sync, public history/domain, R4B,
   direct release candidate, and Node Git-index authority. Compile affected TypeScript with
   `strict` and `skipLibCheck=false`.
7. Audit the exact source manifest for UTF-8/LF/final newline/trailing whitespace, JSON validity,
   English feature content, ordinal manifest/digest parity, positive-controlled identity absence,
   package routing, and source-manifest identity. Stage only that manifest in an isolated index and
   run the complete kit.
8. Commit source through normal hooks; rerun focused/full verification on the immutable source SHA.
   Add and separately commit evidence plus its manifest entry; rerun focused/full verification on
   the immutable evidence SHA. Remote branch/PR/CI work remains a separately verified lifecycle.

TypeScript and Node remain the measured implementation choice. This slice performs deterministic
text normalization, cryptographic hashing, JSON authority checks, and Git-index integration already
owned by the Node toolchain. Rust, Go, or Python would add a distribution and cross-platform build
boundary without a measured CPU, memory, concurrency, systems-API, or library-capability gap.

## Exact source and evidence manifests

The source manifest contains exactly these ten paths, in ordinal order:

- `.claude/prompt-evolution.md`
- `docs/roadmap/p17-018-r4c-prompt-history-genericization-plan.md`
- `package.json`
- `release/internal-marker-classification.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r4c-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-legacy-backend-contract.test.ts`
- `scripts/public-release-prompt-history-contract.test.ts`
- `scripts/public-release-synthetic-fixture-contract.test.ts`

The LF-final source-manifest identity is SHA-256
`98f146d4b36b314a1063bc2b069693bf06a73724efd824860606d0f560b2b44d`.

The later evidence manifest contains exactly:

- `docs/evidence/post-17-public-release-r4c-prompt-history-aliases-2026-08-18.md`
- `release/public-release-manifest.json`

The LF-final evidence-manifest identity is SHA-256
`7f2646d0f2fc060c9d129bb4e0463d78ad38bbef59a09f6282baa4384a863cd0`.

No generated log, archive, environment file, dashboard snapshot, target path, local configuration,
or raw classified value belongs to either commit.

## Rollback and external-action boundary

Edits are bounded to the source manifest and made through test-first checkpoints. If a history,
registry, manifest, staged-index, commit, or other broad operation fails after partial mutation,
restore the affected repository from today's verified snapshot before retrying; do not retain a
half-genericized history or half-updated authority.

No sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side
effect belongs to R4C local work. No dashboard source or snapshot is modified. A retained feature
branch, draft PR, exact-head Linux/Windows/aggregate CI, and PR merge require their own exact
receipts after immutable local evidence.

## Completion boundary

R4C is locally complete only when the 25 prompt-history target identities are replaced by exact
public aliases; reversible canonical hash and 1,836/182/60/158 structure are proven; lesson and sync
behavior remains green; R4B is remediation-safe; registry authority is exactly 21 classified
occurrences and 20 blockers; source/evidence manifest authority is exact; focused, strict, static,
staged, immutable-source, and immutable-evidence gates pass; and neither dashboard nor target state
changed.

R4C does not complete the remaining genericization/private-archive remediation, P17-018, public
release eligibility, supply-chain/nightly/clean-clone readiness, version/tag/release/publication,
provider execution, sync, dashboard, database, or target verification.
