# P17-018 R4D — Private-Archive Boundary Plan

**Date:** 2026-08-18
**Status:** Accepted; implementation in progress
**Scope lock:** `slice=R4D, topology=T1, archive=A1, history=H1, sync=S1, export=X1, evidence=E1`
**Starting commit:** `57d6a5d7de4ffffffa51a9fea79cc3501e48bf54`

## Reconciled starting state

R4C is merged and the repository is clean. The public-release manifest contains 612 tracked paths:
607 include and five exclude. The marker registry binds 21 classified occurrences through 20
bindings. The remaining dispositions are `genericize` at 14 bindings and 15 occurrences plus
`move-to-private-archive` at six bindings and six occurrences.

The six archive bindings occupy five artifacts and 23,454 source bytes: four private evidence files
plus the operational sync configuration, which contains two workspace-target bindings. The four
evidence paths and sync config are already excluded from the candidate archive, but the release
contract correctly scans excluded tracked bytes and keeps the candidate blocked.

The daily kit backup remains verified: tag `backup/2026-08-18` points to
`88005e5bd14764c2d57bd02a261dcc637307bf02`, and the worktree ZIP SHA-256 is
`468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4D archives the exact private current-tree payload, removes four evidence files from current HEAD,
replaces tracked sync targets with provider-neutral examples, adds a fixed-name local override,
updates release authority, and records bounded evidence. It does not implement the later export
builder or remove the remaining 14 genericize bindings.

R4D does not rewrite Git history, change repository visibility, create a public repository, publish
an archive, run sync, touch a target `.claude` tree, mutate dashboard/database/provider state, bump
versions, create a tag/release, or claim public-release eligibility.

## Locked R4D decisions

### T1 — Keep canonical history private

The canonical repository remains private and continues to own development, internal audit, and
rollback history. A release manifest is a tree contract, not permission to expose canonical Git
parents. No current or future R4D step may flip repository visibility.

### A1 — Archive before removal or replacement

Before changing any of the five bound artifacts, create archive ID
`p17-018-r4d-private-archive-2026-08-18` outside the repository. The private archive contains exact
relative paths, bytes, a detailed per-file SHA-256/size manifest, starting commit, item count, total
source bytes, and archive format. Verify all copied bytes and the final archive digest before source
deletion or sync-config replacement.

The public source receives only `release/private-archive-receipt.json`. It carries the archive ID,
format, starting commit, artifact count, total source bytes, final archive SHA-256, closed status,
and schema version. It contains no raw archived content, per-file hash, private relative path,
absolute path, user identity, host, token, or project reference.

### H1 — Preserve history without rewriting it

After archive proof, delete the four private evidence files only from current tracked HEAD. The
canonical private history and separate archive remain recovery authorities. No Git history rewrite,
force-push, tag movement, evidence mutation, or remote deletion belongs to R4D.

Rollback before source commit restores exact bytes from the verified archive or daily backup. After
source commit, revert the bounded source commit as one unit; never restore only a registry entry or
manifest row without its owning bytes.

### S1 — Separate public sync defaults from local operational targets

Tracked `sync.config.json` remains the fresh-clone schema/default and uses only
`example-learning-app and example-authoring-app`. Add fixed-name `sync.config.local.json` to
`.gitignore`. The loader checks only that local filename first and falls back to the tracked file;
there is no environment-selected or arbitrary path.

The ignored local file preserves the archived operational targets on this machine. Parsing and
validation remain fail-closed: invalid JSON, unknown keys, empty targets, empty sync paths, or a
non-string entry fails before copy, telemetry, or network use. Existing dry-run/rollback/verify
guard behavior must remain green; no real sync is executed.

### X1 — Export only a historyless eligible tree

A later public-source builder must consume one exact eligible Git-index tree and emit a deterministic
historyless export with no parent commits. It may include only manifest-approved paths and must rerun
marker, secret, license, link, SBOM, archive, and clean-clone gates on emitted bytes. R4D records
this architecture but does not create, push, publish, or expose an export.

Source-stage release authority becomes 615 total paths, 615 include, and zero exclude. Classified
authority becomes 15 classified occurrences and 14 blockers, all `genericize at 14 bindings and 15
occurrences`. Removing archive bindings does not suppress the remaining blockers.

### E1 — Split private and public receipts

The detailed archive manifest stays outside Git beside the private archive. The public receipt and
R4D evidence expose only bounded metadata and aggregate digests. Public tests use synthetic archive
fixtures and category-only failures; they never read or echo the private payload.

The evidence commit follows the immutable source commit and contains only the English evidence file
plus its sorted public-manifest row. HANDOFF records the local private archive location and detailed
verification receipts; the public evidence uses only the archive ID and aggregate receipt fields.

## Threat model and attack matrix

The R4D gates must reject:

- archive receipt extras, missing fields, wrong source authority, malformed digest, zero items,
  inconsistent byte totals, non-closed status, or any raw/private path field;
- a public receipt that contains a per-file hash, absolute path, hostname, user path, project-shaped
  value, token, or archived content excerpt;
- deletion/replacement before all five source files match the private manifest;
- an archive missing one file, adding an unapproved file, flattening paths, changing bytes, or using
  a source commit other than the exact R4D starting commit;
- a tracked operational target, raw workspace identity, environment-selected config path, arbitrary
  config filename, path traversal, unknown config key, invalid JSON, or empty config array;
- local override precedence drift, fallback drift, source mutation, sync execution during tests, or
  a tracked `sync.config.local.json`;
- a private-evidence path retained in HEAD, stale exclude row, archive disposition retained in the
  registry, stale registry digest, or release authority other than `615/615/0` and `15/14`;
- a claim that current canonical history or repository visibility is public-safe; and
- an evidence/log/temp/archive path entering the 19-path source commit.

## TDD and verification ladder

1. Register the R4D readiness validator and full-kit route. Prove RED only on missing plan/ADR.
2. Add this plan and ADR-006; require T1/A1/H1/S1/X1/E1 readiness GREEN.
3. Add unit attacks for config selection/parsing and private-archive receipt validation before
   production config/archive authority changes. Prove exact current-surface RED.
4. Create the external private archive from starting commit bytes, verify its detailed manifest and
   aggregate digest, then create the bounded public receipt.
5. Implement the fixed-name local config loader, ignored operational override, neutral tracked
   config, evidence deletions, registry/manifest updates, and prior-contract monotonicity.
6. Run config/archive attacks, sync dry-run/rollback/verify/install guards, R4A/R4B/R4C regressions,
   release-domain/Node-index gates, positive-controlled privacy scans, and strict TypeScript.
7. Audit and stage exactly the 20-path source manifest; require byte/filter parity, deletion proof,
   clean cached diff-check, zero residue, exact `615/615/0`, exact `15/14`, and blocked-only sentinel.
8. Run complete staged kit, commit through normal hooks, and repeat focused/strict/full qualification
   at the immutable source commit.
9. Add only the evidence file and manifest row, qualify the exact two-path index, commit, and repeat
   focused/Node/full-kit qualification at the immutable evidence head.
10. Prepare a retained feature branch/draft PR only after local evidence. Exact-head Linux, Windows,
    and aggregate CI must be GREEN before PR-only merge. Retain the branch.

TypeScript and Node remain the measured implementation choice. The work uses existing filesystem,
JSON, hashing, Git-index, sync, and test capabilities. Rust, Go, or Python would add a distribution
and cross-platform build boundary without a measured CPU, memory, concurrency, systems-API, or
library-capability gap.

## Exact source and evidence manifests

The source manifest contains exactly these 20 ordinal paths:

- `.claude/integrations/self-improvement-cycle.test.ts`
- `.gitignore`
- `docs/design/adr-006-private-source-public-export-boundary.md`
- `docs/evidence/i1-self-improvement-cycle-2026-08-12.json`
- `docs/evidence/i1-self-improvement-cycle-2026-08-12.md`
- `docs/evidence/post-17-cross-machine-tracking.md`
- `docs/evidence/post-17-privacy-wave-c2-schema-migration-design-2026-08-16.md`
- `docs/roadmap/p17-018-r4d-private-archive-boundary-plan.md`
- `package.json`
- `release/internal-marker-classification.json`
- `release/private-archive-receipt.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r4d-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-private-archive-contract.test.ts`
- `scripts/public-release-prompt-history-contract.test.ts`
- `scripts/sync-config.test.ts`
- `scripts/sync-config.ts`
- `scripts/sync-to-targets.ts`
- `sync.config.json`

The LF-final source-manifest SHA-256 is
`0c788abe3d66b2233749e17e761ba26b3cb6fa0126bd42045446d9406b3b5722`.

The later evidence manifest contains exactly:

- `docs/evidence/post-17-public-release-r4d-private-archive-boundary-2026-08-18.md`
- `release/public-release-manifest.json`

The LF-final evidence-manifest SHA-256 is
`b00b88b78b03e2473caf99df4405e8dc1d439c6379e630fab2a11accbf86f362`.

No private archive, detailed private manifest, local sync override, generated log, environment file,
dashboard snapshot, target path, or local configuration belongs to either commit.

## Rollback and external-action boundary

If archive creation or verification fails, preserve the original source tree and rebuild the archive
in a fresh bounded staging directory. If a source mutation fails after partial application, restore
the entire R4D source scope from the verified archive/daily snapshot before retrying; do not keep a
partial deletion, local-override loader, registry, or manifest.

R4D local work has no sync, direct-main push, tag, release, publication, visibility, database,
provider, dashboard, or target side effect. A retained branch, draft PR, CI, and PR-only merge require
exact receipts after immutable local evidence. The private archive is a local preservation action,
not a public artifact or release.

## Completion boundary

R4D is complete only when the five original artifacts are byte-preserved in the private archive;
the four evidence files are absent from current tracked HEAD; tracked sync defaults are neutral and
the ignored local override remains operational; archive receipt, registry, manifest, prior release
contracts, sync guards, strict/static/index/full-kit gates, immutable source/evidence commits, and
exact-head remote CI are GREEN; release authority is exactly `615/615/0` and `15/14`; and no
prohibited external side effect occurred.

R4D does not complete the remaining 14 genericize bindings, deterministic export builder,
clean-clone/SBOM/license/link/nightly gates, public-release eligibility, version/tag/release,
publication, visibility change, package submission, sync, provider execution, dashboard, database,
or target verification.
