# P17-018 R3B — Release History and Notes Evidence

**Date:** 2026-08-17
**Task:** P17-018
**Scope lock:** `slice=R3B, history=H1, notes=N1, versions=V1, generator=G1, privacy=P1, evidence=E1`
**Result:** Qualified release-history ownership; public-release eligibility remains blocked

## Scope and immutable inputs

R3B reconciles source-version history, owns the current candidate in one unreleased note, and makes
local changelog generation fail closed. It does not select a new version or perform a publication
action.

- Starting merge: `35e91b59e723b05c859304762c55e29ea3e7f7d1`
- Source commit: `08c3555d47b4a4c5df533e746fd09d97ac73bb15`
- Source commit parent: `35e91b59e723b05c859304762c55e29ea3e7f7d1`
- Source commit subject: `feat(release): add truthful unreleased history`
- Source commit stat: ten files, 994 insertions, 42 deletions
- Backup tag authority: `38888187c4191206dbb81562ccb387463fcbbc76d6`
- Backup worktree ZIP SHA-256:
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`

The exact source manifest is:

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

The source commit was created through the normal hook. `spec-integrity` passed on four TypeScript
files in 239 milliseconds. No hook was bypassed.

## Reconciled release-history authority

The read-only reconciliation established these distinct facts:

- The only numeric remote tags are `v3.17` and `v3.18`.
- Two additional remote tags are backup references, not product release tags.
- The GitHub Releases count is zero.
- v3.19 through v3.25 are source-version milestones without numeric tags or GitHub Releases.
- Changes after the v3.25 source milestone belong under `Unreleased`.
- Current independent authorities remain root package `3.25.0`, provider bundle `0.5.0`, and shared
  core `1.3.0`.

One transient GraphQL service failure and one inconclusive REST child-endpoint response were rejected
as evidence. A later authenticated positive GraphQL query established the tag and release counts.
The changelog records the resulting dated source milestones with exact commits:

| Milestone | Date | Source commit |
|---|---|---|
| v3.19 | 2026-07-11 | `f5fb28187b1d4249c3afbb06b7319a6c35fcc53c` |
| v3.20 | 2026-07-12 | `3e55521ced24e1b72a2d49484929366a67a2084c` |
| v3.21 | 2026-07-12 | `9a72054f4388590ffcbb27fd7721f4fc51087b42` |
| v3.22 | 2026-07-12 | `e853b41c8ae754e1e6d29948061143ebdd2e1527` |
| v3.23 | 2026-07-12 | `c324caf5feb8e4137c2493b319ef5e6bf37abb5f` |
| v3.24 | 2026-07-13 | `a52260be905dd72089b9ee7e9b707e6c44b29f67` |
| v3.25 | 2026-07-16 | `a6d118d1b95962ff41c6db035d76f49136649d77` |

No absent tag, GitHub Release, version bump, or package availability was inferred or fabricated.

## TDD and correction history

| Transition | Observed result | Resolution |
|---|---|---|
| Initial package-script invocation | Invalid before test startup because the sandboxed npm shim could not load its user-profile CLI | Used the configured Node runtime outside the known sandbox launcher failure; did not count the invalid run |
| Plan readiness RED | Exit 1 on exactly `R3B release-history plan` | Added the locked H1/N1/V1/G1/P1/E1 plan; unchanged validator passed |
| First history-contract attempt | Invalid because a common detector rejected the required relative link as traversal | Restricted the host-path detector and kept exact link ownership in the note contract |
| Current history surface RED | Synthetic attacks passed; current tree failed on changelog, note, README routing, and four manifest paths | Added the four production owners and retained the strict contract |
| Intermediate documentation RED | README and manifest passed; changelog and note failed on two exact line-wrapped sentences | Reflowed only those factual sentences; all history checks passed |
| Generator unit RED | Eight legacy groups passed; six new groups failed because the safe APIs did not exist | Added strict parser/version/insertion and argv-based Git runner; 14 groups passed |
| Real duplicate-write proof | `--write` exited 2 on an existing Unreleased heading | Changelog SHA-256 stayed byte-identical at `0a19242c2a188475ebeafb45833542ecda06fce6672b52bb4a983b6c5b7dd01d` |
| First static whitespace result | Invalid because a single-quoted PowerShell escape matched ordinary lines ending in `t` | Replaced the harness rule with explicit byte escapes; no false finding was retained |
| Corrected byte audit | Found CRLF in the two modified changelog TypeScript files | Mechanically normalized only those files to LF and reran every static check |
| First staged Node authority | Six of seven groups passed; exact authority rejected unsorted manifest entries | Moved one history-contract entry to its lexical position; repeated authority passed 7/7 |
| Pre-stage security review | Found that a leading-hyphen `--since` value could be parsed as a Git option even without a shell | Added the attack first; it failed 13/14, then passed 14/14 after pre-invocation denial |
| First commit invocation | Invalid before hook test startup because sandboxed Git Bash lacked required shell utilities | Re-proved staged blobs and ran the same commit outside the sandbox; the normal hook passed |

The dry CLI preview targeted an undated `[Unreleased]` section. The revision expression
`HEAD~1..HEAD` reached two non-merge commits because the exact HEAD was a merge commit; that count was
recorded as a topology correction rather than described as a one-commit range.

## Generator security and correctness result

The hardened generator now provides these bounded guarantees:

- The default target is `Unreleased`; it never receives a date.
- Explicit versions must use canonical `MAJOR.MINOR.PATCH` syntax.
- Missing, duplicate, unknown, positional, or control-character CLI input fails before a write.
- A `--since` value beginning with `-` is rejected before Git invocation.
- Other metacharacters remain one literal argv element; no shell command is assembled.
- Git runs through `execFileSync` with an explicit argument array.
- Duplicate Unreleased or version headings fail closed.
- New release sections are inserted after Unreleased; a new Unreleased section precedes versions.
- File output occurs only after parsing, rendering, and insertion validation succeeds.
- The command does not commit, tag, release, publish, push, or call a network API.

The unit suite passes 14/14 groups. The literal-argv attack and leading-option denial are independent:
the former proves shell metacharacters are data, while the latter prevents Git option interpretation.

## Static and focused qualification

The final ten-path candidate passed:

- exact source scope `10/10`;
- strict UTF-8, no BOM, LF, final newline, and no trailing whitespace `10/10`;
- JSON parse `2/2`;
- canonical link targets `3/3`;
- eight positive-controlled credential, private-key, user-path, private-host, workspace-marker,
  live-reference, and non-English feature-text detectors with zero candidate hits;
- `git diff --check` and cached diff-check;
- worktree/index blob parity `10/10`;
- TypeScript 5.9.3 with `strict` and `skipLibCheck=false`;
- plan lock PASS;
- changelog `14/14`;
- public-entry `5/5`;
- governance `5/5`;
- release-history synthetic and current-tree contracts PASS;
- pure public-release domain `18/18`;
- Node Git-index authority `7/7`.

At the source commit, the public-release candidate contains 595 indexed paths: 590 includes and the
same five explicit excludes. The marker registry remains digest-bound, covers 73 classified
occurrences, and produces exactly the existing 31 unresolved-disposition blockers with no other
blocker. R3B does not change the marker registry.

## Full-suite receipts

### Final staged-scratch candidate

- Staged scope: exactly ten source paths
- Node Git-index authority: 7/7
- `test:kit` exit: 0
- Test duration: 400.5 seconds
- Captured lines: 1,880
- Log SHA-256: `72590488d6aa8e01a9df298c0df7b8189386aed0476d87238b236353ebe78ca7`
- Prompt authority: v3.25
- Prompt budget: 160,919 / 176,128 bytes
- Lesson sync: 60/60
- Physical root, connector, and documentation dependency trees: zero reparse points
- Temporary worktree: removed
- Real index after cleanup: unchanged, zero cached paths

### Immutable source commit

- Exact HEAD: `08c3555d47b4a4c5df533e746fd09d97ac73bb15`
- `test:kit` exit: 0
- Test duration: 341.3 seconds
- Captured lines: 1,880
- Log SHA-256: `c63ff1b9904c08e74ad148ae6e1c526cbc8ba85a0e6a6dcb72b842d55e8ca7c2`
- Prompt authority: v3.25
- Prompt budget: 163,206 / 176,128 Windows worktree bytes
- Lesson sync: 60/60
- HEAD after test: unchanged
- Dirty paths after test: zero

The immutable Git blob is 160,919 bytes while the clean Windows worktree is 163,206 bytes. The
2,287-byte difference equals the counted carriage-return bytes, proving a checkout line-ending
representation difference rather than source drift. Both representations pass the same budget.

## Architecture and language decision

TypeScript and Node remain the measured implementation choice. R3B performs bounded Markdown/JSON
validation, small text transforms, and one Git subprocess with explicit argv. There is no measured
throughput, memory, concurrency, binary-distribution, or systems-API gap that justifies Rust, Go,
Python, FFI, or a sidecar.

The boundaries remain:

- pure commit parsing, grouping, version validation, rendering, and insertion;
- one injectable Git-runner port for deterministic unit evidence;
- Node filesystem and child-process calls only in the CLI adapter;
- independent source-version, provider-bundle, and shared-core authorities;
- one unreleased-note owner instead of duplicated release claims.

## External-effect and completion boundaries

R3B local qualification performed no sync, target edit, provider execution, database write,
dashboard runtime/UI change, tag, GitHub Release, package/plugin publication, repository or package
visibility change, direct-main push, branch deletion, or other external release action.

The root package remains private. The repository remains private. The v3.25 source authority remains
untagged and has no GitHub Release. The release candidate remains blocked by 31 unresolved marker
dispositions plus deferred dependency-license/SBOM, supply-chain, nightly, and clean-clone work.

R3B completion proves truthful release-history and current-note ownership only. It does not complete
P17-018, public-release eligibility, or the post-17 roadmap.

## Rollback

Before a remote feature branch exists, revert the source commit and its separate evidence commit, or
restore the verified 2026-08-17 snapshot. After a pull request exists, use a normal revert commit;
do not rewrite the default branch. No database, provider, package registry, tag, release, sync, or
target rollback is required because R3B performed none of those actions.
