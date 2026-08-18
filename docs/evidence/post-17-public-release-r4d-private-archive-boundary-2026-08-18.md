# P17-018 R4D Private-Archive Boundary Evidence

**Date:** 2026-08-18
**Task:** P17-018
**Scope:** `slice=R4D, topology=T1, archive=A1, history=H1, sync=S1, export=X1, evidence=E1`
**Starting commit:** `57d6a5d7de4ffffffa51a9fea79cc3501e48bf54`
**Primary source commit:** `74db6a0fc8712fd34b0094f7819dfca3805819f8`
**Evidence-transition correction:** `9b83ed21457eec0966e12df48ee0c3deacaeda7e`
**Qualified source tree:** `7935dafa430df0c492522e84edc5c9f922e98e92`

## Outcome

R4D established a private-source/public-export boundary without rewriting canonical Git history.
The canonical repository remains private. Five operational or historical artifacts were preserved
in a separately governed private ZIP before four evidence artifacts left current HEAD and the
tracked sync configuration changed to neutral example targets.

Real operational sync targets now live only in fixed-name ignored `sync.config.local.json`.
Fresh clones use public-safe tracked defaults. The loader accepts only those two fixed filenames,
prefers the local override, never falls back from a malformed override, and rejects unsafe shape or
path traversal before copy, telemetry, or network behavior.

The current release contract is valid but intentionally blocked. R4D removes archive dispositions
and excluded paths; it does not suppress the remaining 14 genericization blockers, publish an
artifact, or claim release eligibility.

## Architecture and recovery authority

- ADR-006 selects a private canonical repository plus a later deterministic historyless export.
- Canonical commits remain immutable. No force push, history rewrite, visibility flip, or in-place
  evidence redaction is part of R4D.
- A later public surface must originate from one exact eligible tree with no parent history and
  rerun marker, secret, license, link, SBOM, archive, and clean-clone gates.
- The verified daily backup tag is `backup/2026-08-18` at
  `88005e5bd14764c2d57bd02a261dcc637307bf02`.
- The verified daily kit ZIP SHA-256 is
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.
- The R4D private archive receipt is closed and metadata-only:
  - archive ID: `p17-018-r4d-private-archive-2026-08-18`;
  - format: `zip`;
  - source commit: `57d6a5d7de4ffffffa51a9fea79cc3501e48bf54`;
  - artifact count: `5`;
  - aggregate source bytes: `23,454`;
  - archive SHA-256:
    `aab8a81ebe9d30ec8363721e53cbc7ca496558cb503d90f400ae2de92dbd41d9`;
  - status: `verified-private`.
- Per-file archive paths, hashes, private-manifest authority, and local archive location are
  deliberately absent from this public evidence.
- Primary source manifest: 20 ordinal LF-final paths, SHA-256
  `0c788abe3d66b2233749e17e761ba26b3cb6fa0126bd42045446d9406b3b5722`.
- Correction manifest: two ordinal LF-final paths, SHA-256
  `acb0e2c1c1ba66cc493ab49ded93a14bfb69bf0b6042c7e9cd7dbd8bd8b673e5`.
- Evidence manifest: this file plus `release/public-release-manifest.json`, ordinal LF-final
  SHA-256 `b00b88b78b03e2473caf99df4405e8dc1d439c6379e630fab2a11accbf86f362`.
- TypeScript and Node remain the measured implementation choice. This slice is bounded JSON,
  filesystem, Git-index, and deterministic contract logic; no Rust, Go, or Python capability or
  performance gap was found.

## Test-first chronology

1. The calculation-bound readiness validator first failed only because the plan and ADR were
   absent. After T1/A1/H1/S1/X1/E1 were documented, the unchanged readiness gate passed.
2. `test:sync-config` first failed at exact `MODULE_NOT_FOUND: ./sync-config`. The implemented
   fixed-name loader then passed all 14 selection, parse, duplication, traversal, and freeze cases.
3. The archive contract passed nine receipt/attack assertions and initially reported exactly seven
   current-tree gaps. After remediation it failed only while the four deletions had not entered the
   Git index; exact staging closed that final gap.
4. All five original archive inputs were rehashed before copy. Fresh expansion proved the exact
   entry set, aggregate byte count, and copied bytes before any source removal or replacement.
5. The first complete staged kit failed after all nine self-improvement unit cases because the
   package command still invoked the CLI against an archived private evidence fixture. The source
   scope expanded from 19 to 20 paths. A generated synthetic registry now exercises the real CLI in
   a bounded temporary directory, passes as test 10, and removes the private fixture dependency.
6. The first 20-path restage command was rejected before mutation because plain `git add` cannot
   match deletions already absent from both index and worktree. Present paths were staged explicitly
   while the four cached deletions were verified independently.
7. Before evidence writing, transition review found two exact 615-path assertions that would reject
   the planned 616th evidence row. A separate correction attack-tests both 615-without-evidence and
   616-with-evidence states and binds Node included authority to the exact Git-index path count.

## Implementation receipts

- Public receipt SHA-256:
  `510fdf22168648fedad58c675f2554e78e54e20b29e44341e576926da74b6fb3`.
- Source-stage public manifest SHA-256:
  `cd69252785ed2bbd9904fdfaae0b7260d4e2a7c76c438e37ad6b4669ec768389`.
- Evidence-stage public manifest SHA-256:
  `254c69c7ffc3f34c782c6764cb06863a35491fd19ceb12e5ac185ebb32b22204`.
- Marker registry SHA-256:
  `db68f178a8c5db088c6de227f5bb755b26ff1da5d9276546ace9c48e2c1b1288`;
  the manifest binds the same digest.
- Tracked sync targets are exactly `example-learning-app` and `example-authoring-app`.
- The ignored local override was copied before tracked-default replacement, remained untracked,
  and was selected by the dry-run (`config: local`).
- Primary source commit hook: `spec-integrity` PASS over eight TypeScript files.
- Correction commit hook: `spec-integrity` PASS over two TypeScript files.

## Release-authority delta

| Authority | Before R4D | Source/correction | Evidence stage |
|---|---:|---:|---:|
| Manifest total paths | 612 | 615 | 616 |
| Included paths | 607 | 615 | 616 |
| Excluded paths | 5 | 0 | 0 |
| Classified occurrences | 21 | 15 | 15 |
| Unresolved blockers | 20 | 14 | 14 |
| Archive-disposition bindings | 6 | 0 | 0 |
| Genericize bindings/occurrences | 14/15 | 14/15 | 14/15 |

The source and correction sentinels return `contractValid=true`, `candidateStatus=blocked`, 615
included paths, zero excluded paths, 15 classified occurrences, and 14 blockers. The evidence-stage
sentinel must retain the same status and marker totals while included paths advance to 616.

## Verification receipts

### Focused, strict, and sync-safe gates

- R4D readiness: PASS (`T1/A1/H1/S1/X1/E1`) with calculated source/evidence manifest identities.
- Private-archive contract: PASS (`11` contract assertions, `7` current surfaces).
- Sync-config unit suite: PASS (`14/14`).
- Synthetic self-improvement and CLI suite: PASS (`10/10`).
- Sync rollback: PASS (`4/4`); verify guard and install-report suites: PASS.
- R4A legacy-backend regression: PASS (`7/7`).
- R4B synthetic-fixture regression: PASS (`11` attacks, `7` current surfaces).
- R4C prompt-history regression: PASS (`12` attacks, `5` current surfaces).
- Public history: PASS; pure release domain: PASS (`18/18`); Node adapter/index: PASS (`7/7`).
- TypeScript `5.9.3`: PASS with `strict`, `noEmit`, `skipLibCheck=false`, ES2022/DOM,
  ESNext/Bundler, and `esModuleInterop` across the affected graph.
- Live read-only preflight for kit `3.25.0`: HTTP `206`, exactly `5` `verified=true` records.
- `sync:dry`: exit `0`, `config: local`, verified count `5`, previewed `258` changes across two
  targets, and performed no target write, backup, or install persistence.

### Complete-kit gates

| Candidate | Result | Duration | Stdout lines | Stdout SHA-256 |
|---|---:|---:|---:|---|
| First staged source | RED: stale archived CLI fixture | 46,347 ms | 322 | `aec5acf76e4ab0eb5f4d2130908b87d4c82193ed381a28b80b6228c55cc6e0d2` |
| Corrected 20-path staged source | exit `0` | 286,075 ms | 1,621 | `7b450b50a0f385b3ade8d58fdcb4ad5eb31fa56fd0afe7a3192de19c20ca441e` |
| Immutable primary source `74db6a0fc871…` | exit `0` | 349,102 ms | 1,621 | `f62c3356359ba67a73dfc0caa07a247682b6b84f27136577a972a645c43a1e8f` |
| Immutable correction `9b83ed21457e…` | exit `0` | 284,315 ms | 1,623 | `289a44d5d9c3521761b97f8eaf69ace805f6cb1a0fb689fea822d5d9e65d5705` |

Every GREEN run reached lesson sync `60/60`. Their stderr contains the same ten expected
lesson-registry coercion warnings, SHA-256
`f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`. The RED run's separate
stderr receipt is SHA-256
`7828d2af928f767843402f7b956093cc6dec12dcbe5d91b68787d007594de980`.
Generated logs remain outside the repository and are not release artifacts.

## Safety, rollback, and non-claims

- The canonical repository and its history remain private. Package visibility remains private.
- No target workflow directory or dashboard source was modified.
- No real sync, database mutation, provider execution, package publication, public export,
  repository creation, visibility change, direct-main push, branch push, PR action, tag, or release
  occurred during local R4D work.
- The one database interaction was the documented read-only verified-record count before dry-run.
- Before commit, rollback uses the verified daily backup or closed private archive. After commit,
  revert primary source and correction as a unit; do not restore only a registry row, manifest row,
  deleted artifact, or tracked operational target.
- The ignored local override preserves machine operation but is never part of a commit or public
  export.
- Fourteen unresolved genericization bindings remain active. R4D does not claim public-release
  eligibility or completion of P17-018.
- This evidence commit is the commit that adds this document and its sorted manifest entry. Its
  immutable identity is recorded in the workspace handoff after normal-hook readback.
