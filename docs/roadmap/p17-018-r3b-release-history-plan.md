# P17-018 R3B — Release History and Notes Plan

**Date:** 2026-08-17
**Task:** P17-018
**Scope lock:** `slice=R3B, history=H1, notes=N1, versions=V1, generator=G1, privacy=P1, evidence=E1`
**Starting commit:** `35e91b59e723b05c859304762c55e29ea3e7f7d1`

## Outcome

Create one truthful, provider-neutral history surface for external evaluators without converting
internal version authority into a release claim. Reconcile the missing v3.19–v3.25 history, own the
current candidate in one unreleased note, and make local changelog generation fail closed on unsafe
arguments or duplicate sections.

## Reconciled starting state

- `CHANGELOG.md` stops at 3.18.0 and still presents the legacy product name. It has no
  `Unreleased` section and no entries for version-authority milestones v3.19 through v3.25.
- Numeric tags v3.17 and v3.18 are the only historical release tags. The remote has two additional
  backup tags, which are recovery references rather than product releases.
- GitHub Releases count is zero. No missing tag or GitHub Release is fabricated in R3B.
- v3.19 through v3.25 are untagged version-authority milestones, not published releases. Their
  source commits and dates are recoverable from Git history.
- Root package `3.25.0`, provider bundle `0.5.0`, and shared core `1.3.0` remain independent
  authorities. Post-v3.25 changes belong under `Unreleased`.
- `docs/releasing/` is absent. README links the changelog but has no canonical current-note owner and
  still lists changelog reconciliation as a release blocker.
- `scripts/changelog.ts` builds a shell command containing an operator-supplied `--since` value,
  accepts an unvalidated `--version`, defaults generated output to the current prompt version, and
  prepends sections without rejecting duplicate headings.
- P17-018 R1 remains contract-valid but intentionally blocked by 31 unresolved marker dispositions.
  R3A has added the governance surface, but P17-018 remains open.
- The verified 2026-08-17 backup tag is
  `38888187c4191206dbb81562ccb387463fcbbc76`; the worktree ZIP SHA-256 is
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`.

## Scope and non-goals

R3B updates the changelog, adds one current unreleased-note owner, links it from README, registers
the new public paths in the explicit release manifest, adds a plan validator and adversarial history
contract, and hardens the existing changelog generator and unit tests.

R3B does not resolve private-marker dispositions, build an SBOM, inventory dependency licenses, pin
CI actions, add nightly CI, run clean-clone qualification, bump any version, create a tag or GitHub
Release, publish a package or plugin, change repository/package visibility, execute a provider,
write a database, update the dashboard, sync, or touch a target repository.

## Locked R3B decisions

### H1 — Changelog separates version authority from publication

`CHANGELOG.md` uses the public product name Agentic Feature Kit and follows Keep a Changelog
structure. It starts with one `Unreleased` section, followed by one section per version milestone.
Each v3.19–v3.25 section states that it is an untagged version milestone with no GitHub Release and
binds the milestone to its exact source commit and date. Existing 3.18.0, 3.17.1, 3.17.0, and
3.16.0 content remains historical and is not rewritten into claims unsupported by Git.

The changelog distinguishes three facts: a version authority recorded in source, a Git tag, and a
GitHub Release. A version heading alone proves only source authority. Numeric tags v3.17 and v3.18
are the only historical release tags, and GitHub Releases count is zero.

### N1 — One unreleased note owns the current candidate

`docs/releasing/UNRELEASED.md` is the canonical human-readable note for changes after v3.25. It
states that it is not a release announcement, the repository and root package remain private, v3.25
has no numeric tag or GitHub Release, and the current release candidate remains blocked.

The note summarizes implemented provider-neutral packaging, shared-core, control-plane, privacy,
governance, and qualification work at a capability level. It distinguishes merged source, locally
verified work, remote CI evidence, and deferred work. It names the remaining release gates without
copying private marker values or claiming publication.

### V1 — Three version domains remain independent

The note and README repeat the exact current version triple: root package `3.25.0`, provider bundle
`0.5.0`, and shared core `1.3.0`. A change in one domain does not imply a bump or qualification in
another. R3B does not select the next public version and does not rewrite provider manifests.

### G1 — Changelog generation is fail-closed

The default generator target is `Unreleased` unless an explicit validated semantic version is
supplied. Explicit versions use canonical `MAJOR.MINOR.PATCH` syntax. Invalid, empty, duplicated, or
ambiguous headings are rejected before any write.

Git arguments are passed without shell interpolation by using an argv-based child-process API. The
operator-supplied `--since` value remains one literal Git argument. Generated version sections are
inserted after the existing Unreleased section; a new Unreleased section is inserted before the
first version section. Duplicate Unreleased or version headings fail closed rather than overwrite,
merge implicitly, or prepend a second authority.

`--write` remains a local file edit only. The script does not commit, tag, release, publish, push, or
call a network API. Pure parsing, rendering, heading discovery, and insertion functions carry the
behavioral tests; one injected Git runner proves literal argument forwarding without invoking Git.

### P1 — Release prose is public-safe and non-promotional

The changelog and note contain no credentials, private hostname, live project reference, target
repository identity, personal filesystem path, internal customer name, provider endorsement, SLA,
or public-ready claim. Examples use placeholders. Historical statements are bounded to recorded
source and remote metadata.

All 31 unresolved marker dispositions remain deferred. R3B does not suppress, reclassify, or scrub
those records. The release manifest remains contract-valid and intentionally blocked.

### E1 — Evidence is immutable and separate

The source commit contains only the plan, production documentation, generator hardening, contracts,
tests, package routing, and manifest updates. A later evidence-only commit records the initial
missing-plan RED, current-surface RED, unit and attack GREEN results, strict/static checks, release
manifest authority, full-suite results, immutable SHAs, remote CI, and non-claims.

## Historical authority matrix

| Authority | Date | Source commit | Tag state | GitHub Release state |
|---|---|---|---|---|
| v3.19 | 2026-07-11 | `f5fb28187b1d4249c3afbb06b7319a6c35fcc53c` | Untagged | None |
| v3.20 | 2026-07-12 | `3e55521ced24e1b72a2d49484929366a67a2084c` | Untagged | None |
| v3.21 | 2026-07-12 | `9a72054f4388590ffcbb27fd7721f4fc51087b42` | Untagged | None |
| v3.22 | 2026-07-12 | `e853b41c8ae754e1e6d29948061143ebdd2e1527` | Untagged | None |
| v3.23 | 2026-07-12 | `c324caf5feb8e4137c2493b319ef5e6bf37abb5f` | Untagged | None |
| v3.24 | 2026-07-13 | `a52260be905dd72089b9ee7e9b707e6c44b29f67` | Untagged | None |
| v3.25 | 2026-07-16 | `a6d118d1b95962ff41c6db035d76f49136649d77` | Untagged | None |

The existing v3.17 and v3.18 numeric tags are historical Git references. The 3.17.1 changelog entry
is retained as a source milestone rather than promoted to a tag claim. The remote metadata snapshot
is an input to this plan, not a live network dependency of tests.

## Threat model and attack matrix

The history contract constructs valid synthetic changelog/note inputs, then proves rejection of:

- a missing or duplicate Unreleased section, missing milestone, duplicate version, wrong ordering,
  wrong date or source commit, and a v3.19–v3.25 tag/release claim;
- a wrong root/provider/core version, a version-domain implication, a public-ready statement, a
  release announcement, or an omitted private/blocked boundary;
- CRLF, case-drifted canonical paths, unresolved links, traversal, local paths, private hosts,
  secrets, live service markers, target identities, and raw internal marker values;
- shell metacharacters in `--since`, malformed `--version`, duplicate insertion, accidental file
  mutation on validation failure, and a generated dated Unreleased heading;
- release-manifest omission, unknown tracked path, stale candidate count, or a change to the existing
  marker registry and its 31 unresolved dispositions.

Every zero-hit privacy or secret result uses a positive control or an independent fixed-string
search. Tests never query GitHub, mutate Git metadata, or publish anything.

## TDD and verification ladder

1. Register the standalone R3B plan validator and prove RED only on the missing plan.
2. Add this plan and require the unchanged validator to pass H1/N1/V1/G1/P1/E1.
3. Register the release-history contract and prove current-root RED only on the named changelog,
   note, README, and manifest gaps while all synthetic attacks pass.
4. Reconcile `CHANGELOG.md`, add `docs/releasing/UNRELEASED.md`, update README, and add the exact
   public-manifest paths. Require the history contract to turn GREEN.
5. Add changelog-generator unit attacks first, then implement argv-safe Git invocation, strict
   semantic-version validation, Unreleased default rendering, and duplicate-safe insertion.
6. Require focused plan/history/changelog/public-release domain and Node-index contracts, exact
   TypeScript 5.9.3 with `strict` and `skipLibCheck=false`, UTF-8/LF/final-newline/whitespace, link,
   English, privacy, and positive-controlled secret/internal-marker scans.
7. Run the complete kit on the exact staged candidate, review and commit the source manifest through
   normal hooks, then rerun focused/full gates on the immutable source SHA.
8. Write and separately commit the English evidence file plus its manifest entry. Run final
   immutable local proof, then use a retained feature branch, PR, exact-head Linux/Windows/aggregate
   CI, and qualified PR merge under the standing approval.

TypeScript and Node remain the measured implementation choice. R3B performs small text transforms,
Git subprocess argument forwarding, and Markdown/JSON validation; no measured throughput, memory,
binary-distribution, concurrency, or systems-API gap justifies Rust, Go, Python, FFI, or a sidecar.

## Exact source and evidence manifests

The intended source commit is limited to:

- `CHANGELOG.md`
- `README.md`
- `docs/releasing/UNRELEASED.md`
- `docs/roadmap/p17-018-r3b-release-history-plan.md`
- `package.json`
- `release/public-release-manifest.json`
- `scripts/changelog.test.ts`
- `scripts/changelog.ts`
- `scripts/post-17-public-release-r3b-plan.test.ts`
- `scripts/public-release-history-contract.test.ts`

The later evidence commit is limited to:

- `docs/evidence/post-17-public-release-r3b-release-history-2026-08-17.md`
- `release/public-release-manifest.json`

`release/internal-marker-classification.json` is not changed. Its current digest, 73 classified
occurrences, and exactly 31 unresolved-disposition blockers remain an external authority for R3B.

## Rollback and external-action boundary

Every R3B production edit is a bounded text or test change. A validation failure must occur before
the changelog write. If a content, manifest, build, commit, or broad update fails after partial
mutation, restore the affected repository from today's verified snapshot before retrying the broad
operation. A narrow edit may be corrected only after exact worktree/index inspection proves scope.

No network, credential, database, provider execution, sync, publish, release, tag, visibility, or
merge side effect belongs to R3B local verification. A feature-branch push, PR, and qualified merge
may occur only after immutable local evidence under the existing approval. No direct-main push or
source-branch deletion is authorized.

## Completion boundary

R3B is complete only when changelog history and the current unreleased note are truthful and linked,
the three version domains agree with their source authorities, unsafe generator inputs and duplicate
headings fail closed, focused/full local evidence and exact-head cross-platform CI pass, the PR is
merged, retained branches are read back, and no excluded side effect occurred.

R3B completion proves release-history ownership only. It does not prove public-release eligibility,
marker remediation, supply-chain integrity, nightly qualification, clean-clone portability, public
visibility, a version bump, a tag, a GitHub Release, package/plugin publication, or completion of
P17-018 and the post-17 roadmap.
