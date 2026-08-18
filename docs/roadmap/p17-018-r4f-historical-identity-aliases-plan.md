# P17-018 R4F — Historical Identity Alias Plan

**Date:** 2026-08-18
**Task:** P17-018
**Scope lock:** `slice=R4F, surfaces=H1, aliases=A1, transition=T1, registry=R1, evidence=E1`
**Starting commit:** `f29236c8805c36b5efa9dfb4cedf891912d847f5`

## Outcome

Genericize the complete final set of ten bound identity spans across seven historical design,
evidence, and roadmap files. The transformation preserves the facts, dates, measurements, paths by
role, line structure, and conclusions while removing a live project identifier, one local user
path, six authoring-target occurrences, and two learning-target occurrences from the public
candidate.

R4F drives classified marker authority from ten occurrences and nine unresolved bindings to zero.
That transition may make the static release contract report `eligible-for-later-gates`; it does not
make the repository public-ready and does not authorize a tag, release, publication, visibility
change, package publication, marketplace action, or deployment.

## Reconciled starting state

- R4E merged through PR #14 as exact merge commit
  `f29236c8805c36b5efa9dfb4cedf891912d847f5`. Its ordered parents and tree were verified, local
  `main` was fast-forwarded, and the retained R4E branch remains unchanged.
- Native Git-index evaluation is contract-valid and blocked at 620 included paths, zero excluded
  paths, ten classified occurrences, and nine unresolved-marker blockers. Contract mode exits zero;
  eligibility mode exits one with the same path-scoped findings.
- The registry contains nine historical-design/evidence bindings. Seven are one-occurrence bindings
  and two design files bind both learning and authoring identities; one authoring design binding has
  two occurrences. The exact total is therefore nine bindings and ten occurrences.
- The seven candidate files have these canonical source/transformed SHA-256 pairs and invariant line
  counts:
  - `docs/design/_review/section-10-clean.md`: 263 lines,
    `95c036fe0369d1408d9e20220f5c77d740e7258a4b431677a956ae5e70fc9f3a` to
    `7d04f0b4c16186645854380973441a556fd7c5f985c3b00e4f3319579643b34c` after adding its missing
    terminal LF.
  - `docs/design/measurement-layer-b11-gate-and-version-bootstrap.md`: 148 lines,
    `1651897d6e32edb15d0c07f3f99c24b8b52fd13072eb9c56c45e262aa55438b5` to
    `3b5eb4ec1eac502cb3e94abd3fd690fbcf51e3826ede223c6e469d76026c04f1`.
  - `docs/design/measurement-layer-b11-wire.md`: 211 lines,
    `30ee188222275efa7d95ef97fd65842b5205e91c28677280d647ca608ca9ebd6` to
    `031fded2528de9bf49179746c67fe12aaff8e9decea02cb3af5eff7a94373954`.
  - `docs/design/measurement-layer-tier-b-environment.md`: 874 lines,
    `b756d4646cc73194cb6565d0a083c9861bb199eef5571ae5971674f73694ebf9` to
    `0da19c4a22a5dcfdb9b3b61fca7a735aecf7eeb4823b7f2a73192fe91038cfcf` after adding its missing
    terminal LF.
  - `docs/design/measurement-layer-v1.md`: 452 lines,
    `ff68f3e782c0edb75607fb2b14a6389c1480ec763e409ea876a478897dad93e3` to
    `c69d79259b9cd7b8dd954ebe39df9a956e8c196ab5ceab71302f813a1b1ed86e`.
  - `docs/evidence/post-17-worktree-browser-verification.md`: 119 lines,
    `99bdc3f12ebc5e22022cb00c9c7735de914682bc0ddede54311b03e4bef89b18` to
    `9d7c7fc5e34b94b135189fa76fca5eaa57ab5f4848afa3b8d1cd1b78fb292696`.
  - `docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md`: 369 lines,
    `a739f2da60b3e557ce960850e4109c9e0d6eb67e80d9462662edacad418f326b` to
    `a355abce17a847f8405d8d4d8103d2b89a0348c4ae60245145a1bc6ce9b6b571`.
- Today's rollback authority remains verified tag `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02` and worktree ZIP SHA-256
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4F changes exactly the seven historical files above, adds one readiness contract and one
adversarial historical-alias contract, makes R4B, R4C, R4D, and R4E current-authority assertions
remediation-safe,
retains all six marker definitions as zero-count regression guards, updates Node/package/manifest
authority, and records qualification in a later evidence-only commit.

R4F does not change executable runtime logic, measurement formulas, database schemas, URLs,
credentials, workflow gates, sync behavior, provider bundles, generated target code, or dashboard
state. It does not rename the package, change the public product name, or claim completion of
supply-chain, clean-clone, nightly, SBOM, packaging, version, tag, release, publication, or
distribution gates. Root package version 3.25.0 and `PROMPT_VERSION: v3.25` remain unchanged because
identity redaction is neither a capability addition nor a compatibility break.

## Locked R4F decisions

### H1 — Remediate the complete final marker set

The candidate set is the seven files in the reconciled starting state. Only the ten registry-bound
spans may change. Reversing each approved alias to its classified source value must reconstruct the
exact canonical source hash for every file. The two immutable source blobs that lacked a terminal LF
are normalized by adding exactly one; removing that LF after alias reversal must reconstruct their
original hashes. Every file preserves its exact line count, all other non-identity bytes, and
historical meaning, and the result is uniformly LF-final.

The atomic seven-file boundary is the smallest safe transition because all nine bindings feed one
fail-closed registry and the only truthful zero-marker proof is a single Git-index evaluation over
the complete candidate. Splitting the final bindings would preserve a blocked intermediate without
reducing implementation risk or authority coupling.

### A1 — Use role-neutral public aliases

The exact alias tuple is `example-learning-app`, `example-authoring-app`,
`<supabase-project-ref>`, and `%TEMP%\agentic-feature-kit linked worktree Ω`.

Use `example-learning-app` and `example-authoring-app` for target roles, matching the aliases already
established by R4C–R4E. Replace the project identity with `<supabase-project-ref>`. Replace the local
absolute user path with `%TEMP%\agentic-feature-kit linked worktree Ω`, preserving the evidence's
spaces, Unicode, linked-worktree role, and Windows path semantics without retaining a person,
machine, random suffix, or home-directory identity.

Aliases must be stable, English, role-descriptive, and independent of a company, customer, person,
host, provider account, framework, or deployment environment. The contract rejects old identities,
near misses, wrong case, extra aliases, lost aliases, path-shape changes, and any unrelated byte
mutation.

### T1 — Prove only the marker-gate transition

After the exact transformation, contract mode and `--require-eligible` mode must both exit zero with
one sentinel reporting `contractValid=true`, `candidateStatus=eligible-for-later-gates`, zero
excluded paths, zero classified occurrences, and zero blockers. The status name is intentionally
narrow: it proves that the manifest/marker gate is clear and nothing more.

Tests and evidence must explicitly reject `public-ready`, `released`, `published`, `deployed`,
`tagged`, or equivalent claims. Later release gates remain independently fail-closed and require
their own plans, tests, evidence, version decision, and authorized remote lifecycle.

### R1 — Retain zero-count marker guards

Keep all six registry markers, detector bindings, and fingerprints. Set `expectedTotal` to zero and
empty `occurrences` only for the four currently non-zero markers. Existing zero-count company and
hostname guards remain unchanged. This keeps reintroduction detectable instead of deleting the
knowledge needed to detect it.

Classified occurrences fall from 10 to zero and release blockers fall from nine to zero. The
registry still has six unique marker IDs and four detector kinds. No fingerprint, detector ID,
schema version, artifact ID, or fingerprint domain changes. Source-stage manifest authority is 623
total paths, 623 include, and zero exclude. Evidence-stage manifest authority is 624 total paths,
624 include, and zero exclude.

### E1 — Keep evidence immutable and separate

The source commit contains the plan, readiness test, historical-alias contract, seven exact
transformations, remediation-safe R4E regression, zero-count registry, Node/package authority, and
source-manifest update. A later evidence-only commit records RED/GREEN receipts, reversible hashes,
static and staged audits, immutable-source and immutable-evidence qualification, rollback, and
external-effect nonclaims.

Evidence records marker IDs, paths, counts, hashes, commit identities, and bounded aliases. It does
not repeat retired identities, credentials, live service values, or a local user directory.

## Threat model and attack matrix

R4F contracts reject:

- any retired target, project, or local-user identity; partial replacement; wrong alias; wrong case;
  missing or extra alias; random user suffix; or replacement outside the ten bound spans;
- a changed measurement, date, route, run ID, port, process ID, content hash, API observation,
  conclusion, punctuation span, line count, line ending, or any terminal-newline drift beyond the
  two explicitly normalized files;
- deletion of marker definitions or fingerprints, altered detector ownership, a non-zero registry
  binding, suppressed unclassified finding, or a current result other than zero occurrences and
  zero blockers;
- stale R4E exact-current assertions, a missing package route, a missing manifest row, an unknown
  tracked path, and evaluation against mutable worktree bytes instead of Git-index blobs;
- diagnostics or evidence that echo a retired identity or overstate `eligible-for-later-gates` as
  public-release completion.

Every absence assertion has an injected positive control plus a second independent count, reverse
hash, registry, or Git-index authority. Attack fixtures construct retired values from fragments so
test source itself adds no classified occurrence.

## TDD and verification ladder

1. Add and full-kit-register the R4F readiness validator; prove RED only because this plan is absent.
2. Add this plan and require the unchanged H1/A1/T1/R1/E1 readiness validator to pass.
3. Add and package-register the historical-alias contract before remediation. Require pure attacks
   to pass and current-tree checks to fail only on raw identities, missing aliases, stale registry/
   R4E/Node authority, ineligible status, and missing manifest paths.
4. Apply the ten deterministic replacements. Require all seven transformed hashes, original-blob
   reverse hashes, exact line counts, alias counts, LF/final-newline form, the two explicit one-LF
   normalizations, and zero raw candidate identities.
5. Convert four non-zero registry markers to zero-count guards; update R4E monotonic regression,
   Node/package/manifest authority, and require exact `0 occurrences / 0 blockers`.
6. Run readiness, R4F, R4E/R4D/R4C, public-release domain, Node Git-index, direct contract and
   eligibility modes. Compile affected TypeScript with TypeScript 5.9.3, `strict`, `noEmit`, and
   `skipLibCheck=false`.
7. Audit the exact source manifest for UTF-8, LF, final newline, trailing whitespace, JSON validity,
   English feature content, ordinal manifest/digest parity, positive-controlled identity absence,
   package routing, and Git-index blob/filter parity. Run the complete kit against the staged index.
8. Commit source through normal hooks; rerun focused/full qualification on the immutable source SHA.
   Add and separately commit evidence plus its manifest row; rerun focused/full qualification on the
   immutable evidence SHA. Remote branch/PR/CI remains a separately verified lifecycle.

TypeScript and Node remain the measured implementation choice. The slice needs deterministic text
normalization, SHA-256, JSON authority, and Git-index integration already owned by the current
toolchain. Rust, Go, or Python would add a compiler/runtime, packaging, cross-platform, SBOM,
supply-chain, and trust surface without a measured CPU, memory, concurrency, systems-API, or library
gap.

## Exact source and evidence manifests

The source manifest contains exactly these 18 paths in ordinal order:

- `docs/design/_review/section-10-clean.md`
- `docs/design/measurement-layer-b11-gate-and-version-bootstrap.md`
- `docs/design/measurement-layer-b11-wire.md`
- `docs/design/measurement-layer-tier-b-environment.md`
- `docs/design/measurement-layer-v1.md`
- `docs/evidence/post-17-worktree-browser-verification.md`
- `docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md`
- `docs/roadmap/p17-018-r4f-historical-identity-aliases-plan.md`
- `package.json`
- `release/internal-marker-classification.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r4f-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-historical-alias-contract.test.ts`
- `scripts/public-release-operational-alias-contract.test.ts`
- `scripts/public-release-private-archive-contract.test.ts`
- `scripts/public-release-prompt-history-contract.test.ts`
- `scripts/public-release-synthetic-fixture-contract.test.ts`

The LF-final source-manifest identity is SHA-256
`885535372dd3b8deecc62ac33b3adf9d0cc8748a54672f394fdbd0ac51f4b4d2`.

The later evidence manifest contains exactly:

- `docs/evidence/post-17-public-release-r4f-historical-identity-aliases-2026-08-18.md`
- `release/public-release-manifest.json`

The LF-final evidence-manifest identity is SHA-256
`056adb8673aa2e08f585312a99427113a8669a789ab86a18bc3d82418915e721`.

No generated log, archive, environment file, dashboard snapshot, target path, local configuration,
raw classified value, tag, or release artifact belongs to either commit.

## Rollback and external-action boundary

Edits are bounded to the exact source manifest and made through test-first checkpoints. If a broad
replacement, registry, manifest, staged-index, commit, or other operation fails after partial
mutation, restore the affected repository from today's verified snapshot before retrying; do not
retain a half-genericized surface or half-updated authority.

No sync, push, tag, release, publication, visibility, database, provider, dashboard, or target side
effect belongs to R4F local work. No dashboard source or snapshot is modified. A retained feature
branch, draft PR, exact-head Linux/Windows/aggregate CI, and PR-only merge require exact receipts
after immutable local evidence.

## Completion boundary

R4F is locally complete only when all ten bound spans use the approved aliases; all seven reversible
canonical hash and line-count contracts pass; all six registry markers remain as zero-count guards;
contract and eligibility modes both report `eligible-for-later-gates` with zero occurrences and zero
blockers; source/evidence manifest authority is exact; focused, strict, static, staged,
immutable-source, and immutable-evidence gates pass; and neither dashboard nor target state changed.

R4F does not complete P17-018, public-release readiness, supply-chain/nightly/clean-clone gates,
versioning, packaging, provider publication, plugin/marketplace distribution, npm/pnpm publication,
tagging, releasing, deployment, sync, dashboard, database, or target verification.
