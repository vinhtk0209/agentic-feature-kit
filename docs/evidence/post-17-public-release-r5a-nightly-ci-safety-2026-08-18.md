# P17-018 R5A — Nightly CI Safety Evidence

Date: 2026-08-18

Local status: complete. Remote pull-request qualification and the post-merge manual dispatch are
pending and must be recorded in the workspace handoff from observed GitHub state. No elapsed
scheduled run is claimed by this evidence.

Scope lock: `slice=R5A, workflow=W1, triggers=T1, pins=P1, visibility=V1, restrictions=S1, evidence=E1`.

## Outcome and nonclaims

R5A extends the existing Workflow Kit CI with one daily UTC schedule, input-free manual dispatch,
immutable first-party action pins, and an always-emitted aggregate job summary. It preserves the
P17-009 Node 24 Linux/Windows matrix, full kit suite, platform artifacts, and fail-closed aggregate
gate.

This is not clean-clone, supply-chain, SBOM, release-candidate, publication, visibility, provider,
database, sync, target-installation, tag, or GitHub Release evidence. The candidate remains
`eligible-for-later-gates`, not public-ready.

## Reconciled before-state

The sole workflow already had pull-request and `develop`/`main` push triggers, top-level
`contents: read`, equal Linux/Windows legs, platform artifacts, an aggregate release gate, and a
stable README badge. It had no `schedule`, no `workflow_dispatch`, no job summary, and six action
uses bound to floating `@v4` refs.

The smallest reversible slice was therefore CI trigger/dependency/visibility hardening only.
Documentation link, license/package/secret/archive/SBOM gates and clean-clone/deterministic-build
qualification remain separate later slices.

## Reviewed action authority

Read-only `git ls-remote` queries against the four official `https://github.com/actions/*`
repositories resolved each `refs/tags/v4` on 2026-08-18. The committed allowlist is:

| Action | Exact reviewed SHA | Expected uses |
|---|---|---:|
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` | 2 |
| `actions/setup-node` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | 2 |
| `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | 1 |
| `actions/download-artifact` | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | 1 |

The R5A contract rejects floating or shortened refs, changed SHAs, missing or duplicated uses,
and any use outside that exact first-party allowlist.

## RED and harness corrections

The plan contract passed before implementation. The first actual canonical workflow assertion
failed on exactly the intended gaps: missing cron, missing input-free dispatch, all four unpinned
action families/the wrong allowlist, and seven missing summary markers.

Two fail-closed validator defects were then exposed during GREEN work:

1. the action extractor accepted bare `uses:` but not the valid `- uses:` step form;
2. the legacy matrix-result check used substring matching and could be masked by the new
   `QUALIFICATION_MATRIX_RESULT` summary variable.

The fixes accept both YAML step forms while preserving exact action cardinality and replace the
matrix-result substring with an anchored exactly-one env-line check. Attack labels were added to
the six legacy mutations without relaxing their semantics.

## Implemented controls

- One cron, `17 3 * * *`, and one input-free `workflow_dispatch` augment the existing triggers.
- All six action uses are pinned to the reviewed 40-hex SHAs above.
- `permissions: contents: read` remains the only workflow permission.
- The aggregate job writes a bounded Markdown summary through `GITHUB_STEP_SUMMARY` under
  `if: always()`, using only `needs.kit-verify.result` and `job.status`.
- The summary exposes matrix result, aggregate result, Linux/Windows coverage, and the read-only
  permission statement; it does not interpolate branch, title, message, or dispatch-input text.
- The static contract rejects secret/credential bindings, write permissions, provider execution,
  Supabase, sync, git push, issue/PR/release mutation, deployment, tag, and publication commands.
- README status removes the completed marker-remediation claim while retaining the existing stable
  workflow badge and conservative later-gate nonclaims.

## Source identity

- Parent: `44bc487dbe61f48c1e0c4561833bde45218d8c6f`
- Source commit: `843a73a35aced6609d42c0f3e53385f361d149de`
- Source tree: `751253284e71c67fcf38418d07b51093380eae5c`
- Subject: `feat(release): harden nightly qualification`
- Ordinal source path manifest: 11 paths, SHA-256
  `20b690dc60ea318133c40e520aea3b4214ad379ef27abfbf6fd09b21e5a7203b`
- Commit hook: 6 TypeScript files checked; spec-integrity passed.

The 11 source paths are:

1. `.github/workflows/workflow-kit-ci.yml`
2. `README.md`
3. `docs/roadmap/p17-018-r5a-nightly-ci-plan.md`
4. `package.json`
5. `release/public-release-manifest.json`
6. `scripts/cross-platform-release.test.ts`
7. `scripts/cross-platform-workflow-contract.ts`
8. `scripts/nightly-workflow-contract.test.ts`
9. `scripts/nightly-workflow-contract.ts`
10. `scripts/post-17-public-release-r5a-plan.test.ts`
11. `scripts/public-release-historical-alias-contract.test.ts`

All 11 staged blobs and worktree files were LF, `git diff --cached --check` passed, and no
unstaged residue existed at commit time.

## Focused and predecessor verification

| Gate | Result |
|---|---|
| R5A plan | PASS, 11 sections |
| Nightly workflow | PASS, canonical + 11 attacks |
| Cross-platform release | PASS, 11/11 |
| Public entry | PASS, 5/5 |
| R4A–R4F plan contracts | PASS |
| R4A backend boundary | PASS, 7/7 |
| R4B synthetic fixtures | PASS, 11 attacks / 7 surfaces |
| R4C prompt history | PASS, 12 attacks / 5 surfaces |
| R4D private archive | PASS, 11 assertions / 7 surfaces |
| R4E operational aliases | PASS, 10 attacks / 6 surfaces |
| R4F historical aliases | PASS, 14 attacks / 7 surfaces |
| Public governance | PASS, 5/5 |
| Public release core | PASS, 18/18 |
| Node Git-index adapter | PASS, 7/7 |

The successor-safe R4F remediation still requires every closed R4F path/evidence and all R4F
marker/alias authorities. It permits only additional successor paths that the canonical manifest
parser and current-candidate evaluation independently validate.

Cached TypeScript `5.9.3` compiled the six affected TypeScript files with `strict`, `noEmit`,
`skipLibCheck=false`, ES2022, and Node16 module/resolution without diagnostics. The repository-local
TypeScript `4.9.5` cannot parse the current `@types/node` `26.1.0` declarations; no dependency,
lockfile, declaration, or compiler option was changed to conceal that toolchain mismatch.

## Complete-kit receipt

The source staged tree, later proven byte-identical to the source commit tree, passed the full kit:

- exit: `0`
- duration: `353807 ms`
- stdout: `122514` bytes, SHA-256
  `0da78a0790c84ac53aa6c0b0bca2254f178b692c67d54356187750e3b43cf5cf`
- stderr: `1084` bytes, SHA-256
  `5e02fd3cbb5d5316d362ef7ab15b0d1dd08f9da669fca63b195db4f9e304472a`
- lesson synchronization: `60/60`

Stderr contains only the ten existing lesson-fixture normalization warnings. There was no test
failure, skipped R5A gate, sync, network mutation, or provider/database invocation.

## Public release authority

Before the source commit, the exact staged Git-index candidate evaluated as:

- `contractValid=true`
- `candidateStatus=eligible-for-later-gates`
- `includedPaths=628`
- `excludedPaths=0`
- `classifiedOccurrences=0`
- `blockers=[]`

The marker registry remained SHA-256
`bc7cdb54acfccc08166f7facc1c5b8c412489025f18d381852e11d4a1d2d5712` with all six zero-count
fingerprints retained as regression guards. Package/prompt authority remains `3.25.0` / `v3.25`,
and the root package remains `private: true`.

## Remote qualification still required

The evidence head must be pushed non-force to a retained R5A branch and opened as a draft PR into
`main`. Merge is allowed only after GitHub accepts the YAML and the exact evidence head has GREEN
Linux, Windows, and aggregate jobs with qualification artifact hashes and no conflict. After merge,
one input-free `workflow_dispatch` run on the exact merged `main` must also finish GREEN. That
manual run proves the dispatch path; it is not an elapsed scheduled-run claim.

Remote PR/run/job/artifact/merge identities are intentionally absent here until observed. They are
recorded immediately in the canonical workspace `HANDOFF.md`, which remains outside the product
candidate and does not change the already-qualified PR head.

## Rollback and external-effect statement

Rollback is a revert of the source and evidence commits or restoration from the verified
2026-08-18 backup. The retained feature branch must not be deleted.

R5A performs no direct-main push, force push, sync, target `.Codex` edit, provider invocation,
Supabase/database write, dashboard mutation, tag, GitHub Release, npm/marketplace publication,
repository visibility change, or user/admin installation.
