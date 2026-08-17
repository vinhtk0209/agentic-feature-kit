# PR #2 Clean-Checkout Repository-Boundary Remediation Evidence - 2026-08-17

## Verdict

The clean-checkout repository-boundary remediation is complete at source commit
`3b1fab07ca7274a35d3cad64d1cdd04417c4da85`.

The source commit has sole parent
`f56288ca19bb727d228fbaf6c4a95b315acda2c6`, the metadata-only evidence commit for
P17-014 A3A detached signing.

GitHub Actions run `31998865978` proves that the exact source passes from a public kit checkout on
both Linux and Windows. The fail-closed release qualification gate also passes. The earlier run
`31963670605` failed on both runners because the default kit test chain required a sibling dashboard
checkout. That repository-boundary defect is no longer present.

This remediation does not weaken or delete any substantive cross-repository contract. It gives the
two test surfaces explicit ownership:

- `test:kit` is self-contained and suitable for public kit CI;
- `test:workspace-contracts` remains fail-closed and requires both repositories; and
- the dashboard remains the sole editable source of truth for dashboard SQL, migrations, runtime,
  fixtures, and evidence.

## Incident evidence

### Original remote failure

Pull request #2 initially ran GitHub Actions workflow run `31963670605`:

- Linux job `95205398821`: failed;
- Windows job `95205398793`: failed; and
- aggregate job `95205784463`: failed closed.

Both platform jobs stopped at
`scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts:68` with the same missing artifact:

`kit-dashboard/docs/evidence/p17-016-wave-c2-live-catalog-query-2026-08-15.sql`

The validator resolved that path through a sibling repository. Local verification passed because
the development workspace contained both repositories. GitHub checked out only the public kit, so
the same default test chain could not be reproduced there.

### Complete dependency inventory

The defect was not limited to the first missing C2 artifact. Exactly eight package commands directly
read the sibling dashboard repository:

1. `test:post-17-privacy-wave-c2-schema-migration-design`;
2. `test:post-17-privacy-wave-c3-tenant-foundation-execution`;
3. `test:post-17-privacy-wave-c3c-service-role-denial`;
4. `test:post-17-privacy-wave-c3d-disposable-postgres`;
5. `test:post-17-privacy-wave-c4-verification-sink-plan`;
6. `test:post-17-privacy-wave-c4d-disposable-verification`;
7. `test:post-17-privacy-wave-c5-live-cutover-plan`; and
8. `test:post-17-control-plane-implementation-plan`.

Fixing or copying only the first missing artifact would have moved the public CI failure to the next
sibling-dependent command. Copying dashboard artifacts into the kit would also have created a second
editable source of truth. Both alternatives were rejected.

## Locked plan and ownership

The implementation followed
`docs/roadmap/pr2-clean-checkout-repository-boundary-remediation-plan.md`.

Its dependency direction is:

`kit checks -> kit-owned files`

`dashboard checks -> dashboard-owned files`

`workspace composition -> kit + dashboard`

The public kit never assumes that its parent directory contains a repository named `kit-dashboard`.
The workspace composition gate intentionally requires that sibling and fails when any required
dashboard artifact is absent.

The source commit does not copy, generate, modify, or reclassify any dashboard-owned SQL, migration,
runtime, fixture, or evidence file.

## Exact source manifest

The source commit contains exactly 11 files, 403 insertions, and 14 deletions:

1. `docs/roadmap/pr2-clean-checkout-repository-boundary-remediation-plan.md` - 123 additions.
2. `package.json` - four additions and one deletion.
3. `scripts/ci-repository-boundary.test.ts` - 247 additions.
4. `scripts/post-17-control-plane-implementation-plan.test.ts` - three additions and one deletion.
5. `scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts` - three additions and one deletion.
6. `scripts/post-17-privacy-wave-c3-tenant-foundation-execution.test.ts` - four additions and two deletions.
7. `scripts/post-17-privacy-wave-c3c-service-role-denial.test.ts` - five additions and one deletion.
8. `scripts/post-17-privacy-wave-c3d-disposable-postgres.test.ts` - four additions and two deletions.
9. `scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts` - four additions and two deletions.
10. `scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts` - four additions and two deletions.
11. `scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts` - two additions and two deletions.

The normal commit hook passed `spec-integrity` over all nine changed TypeScript files.

## Package graph contract

`package.json` now registers:

- `test:ci-repository-boundary` as the executable boundary validator;
- `pretest:kit` as an automatic boundary check before every default kit run; and
- `test:workspace-contracts` as the exact ordered composition of the eight commands above.

Only the eight sibling-dependent invocations were removed from `test:kit`. Each validator's package
registration assertion now checks `test:workspace-contracts` ownership. Its SQL, privacy, migration,
tenant, verification, runtime, topology, evidence, and attack assertions remain unchanged.

The boundary validator reads `package.json` and expands the real command graph instead of trusting a
documentation list. It follows:

- direct `npm run` and `npm run-script` invocations;
- supported npm flags before `run` or `run-script`;
- nested package commands;
- `pre<command>` and `post<command>` lifecycle hooks; and
- executable TypeScript and JavaScript entrypoints reached through `tsx` or `node`.

It rejects a reachable package command or executable source that constructs the dashboard sibling
path. It also proves that every workspace command exists, still points to a source classified as a
dashboard dependency, occurs exactly once, and remains in the locked dependency order.

## RED evidence before separation

The boundary validator was registered before the package graph was separated. Its first assertion
run exited `1` with exactly nine gaps:

- `workspace-command-order`; and
- one `kit-reaches-workspace-command:<command>` error for each of the eight registered commands.

This proves that the later GREEN did not come from an initially self-contained or unregistered test
chain.

The first launch stopped before assertions because the host launcher returned
`uv_os_get_passwd ENOMEM`. The disclosed OS-temporary `os.userInfo` preload was then used only to
reach the unchanged test. It was deleted immediately after each affected run and never entered the
repository.

## During-implementation corrections

### Registration ownership correction

The first complete workspace aggregate reached the C2 validator and then correctly failed its old
`test:kit` registration assertion. Only the eight registration-ownership assertions were moved to
`test:workspace-contracts`. No substantive contract assertion changed.

### Lifecycle and unknown-source hardening

Review found that the first command parser did not cover npm lifecycle hooks, flagged `run-script`
forms, or a newly reachable ninth source that constructed a dashboard path. Graph expansion and
source derivation were hardened, and explicit attacks were added for all three cases.

### Inert fixture false positive

A blanket text detector initially flagged
`.claude/integrations/evidence-bundle.test.ts`. Inspection proved that occurrence was an inert
secret-path rejection fixture, not a filesystem dependency. The detector was refined to identify
direct `../kit-dashboard` paths or executable parent-root plus dashboard path construction. The
novel-source attack still fails closed.

### Self-scan correction

The first hardened validator exempted its own source because an injected attack fixture contained
the literal sibling name. The fixture now builds that name from inert parts, and the validator scans
its own reachable source under the same rules as every other command.

## Boundary attack evidence

The final focused boundary suite passes the real package graph and proves rejection of:

1. a missing workspace aggregator;
2. an omitted workspace command;
3. a duplicated workspace command;
4. reordered workspace commands;
5. a direct `test:kit` dependency on a workspace command;
6. a nested package-command dependency;
7. an npm lifecycle-hook dependency using flagged `run-script` syntax;
8. a missing registered workspace command;
9. a registered source that no longer declares its dashboard dependency; and
10. a previously unknown reachable source that constructs the dashboard sibling path.

The validator scans itself, performs no network or database operation, and does not read a target
repository.

## Workspace contract evidence

The exact eight-command aggregate passes with both repositories present. The immutable-source run
at `3b1fab07ca7274a35d3cad64d1cdd04417c4da85` exits `0` in 24.5 seconds.

All C2, C3, C3C, C3D, C4, C4D, C5A, and P17-014 implementation-plan validators execute. A missing
dashboard repository or required dashboard artifact remains a hard failure; the gate is not skipped,
optional, or best-effort.

## TypeScript and dashboard-focused evidence

TypeScript 5.9.3 strict verification reports zero diagnostics across the boundary validator and all
eight registration-adjusted validators.

The relevant dashboard privacy and migration proof passes eight test files and 50 tests in 2.58
seconds. This verification made no dashboard source edit and did not read, edit, stage, delete, or
otherwise access the user-owned dashboard settings file.

## Normal full-kit evidence

The final self-scan source candidate passes the authoritative normal-workspace `test:kit` chain:

- exit code: `0`;
- duration: 293.6 seconds;
- captured output: 1,722 lines;
- kit version: v3.25;
- prompt budget: `163,206/176,128` bytes; and
- lesson synchronization: `60/60`.

After the source commit, the same default chain was rerun while asserting immutable HEAD
`3b1fab07ca7274a35d3cad64d1cdd04417c4da85`. It again exits `0` in 262.6 seconds with 1,722 lines,
the same version stamps, the same prompt budget, and `60/60` lessons.

The eight workspace-only commands do not execute in the public default chain. The boundary prehook
does execute first.

## Isolated clean-checkout evidence

The final source candidate was overlaid onto a detached Git worktree with these verified properties:

- it had real Git metadata required by existing attribute checks;
- its parent directory had no `kit-dashboard` sibling;
- dependency directories were real copied directories, not Windows junctions or reparse points;
- exactly the 11 source-candidate files differed from the detached base; and
- the boundary prehook executed before the default kit chain.

The isolated full kit exits `0` in 290.9 seconds with 1,722 lines, v3.25, prompt budget
`160,919/176,128` in the checkout-normalized tree, and `60/60` lessons.

An earlier archive-only scratch run passed the new boundary prehook but later stopped because the
existing live-evidence test legitimately requires `.git` metadata. That was a scratch-harness defect,
not a repository-boundary failure. The detached-worktree model corrected it.

One later isolated run returned transient Windows exit `3221226505` in one unchanged record-verify
case. The exact focused record-verify suite then passed 28/28 in 22.7 seconds, including that case,
and the subsequent complete isolated run passed. A separate non-escalated retry was blocked by npm
registry/cache permissions before the case ran; it was not treated as product evidence.

## Remote Linux and Windows proof

The exact source commit was pushed non-force only to the existing pull request head branch
`p17-014-a3a-detached-signing`.

GitHub Actions run `31998865978` completed successfully in 5 minutes 22 seconds:

- Linux job `95295356519`: success;
- Windows job `95295356555`: success;
- fail-closed aggregate job `95296176494`: success; and
- Supabase Preview job `95295355258`: skipped as expected because the branch has no Supabase branch.

The run produced both qualification artifacts:

- `qualification-linux`, digest
  `sha256:a719ada16eecde6e3e6e14f45c535ff8e92405323393c1ea4d02bbb3a71a9478`; and
- `qualification-windows`, digest
  `sha256:7797bc75e0c8405eb8af722ac28e20def04534c428da785c56dcf41ccff478b9`.

This is direct remote evidence that the original clean-checkout failure is fixed on both supported
runner families. The aggregate job confirms that neither matrix leg can fail silently.

## Public naming and documentation review

The public names state ownership and behavior without claiming a deployment topology:

- `test:ci-repository-boundary` describes a repository-boundary invariant;
- `test:workspace-contracts` describes intentional multi-repository composition;
- `WORKSPACE_COMMANDS` and `WORKSPACE_SOURCES` form one explicit registry; and
- `hasDashboardSiblingDependency` describes the concrete dependency being classified.

The plan documents the failure, ownership decision, exact registry, implementation sequence,
attack matrix, evidence contract, and non-claims. The names avoid vendor-internal terminology and do
not imply that workspace contracts are part of the standalone public kit package.

## Clean Architecture review

The remediation separates policy from composition:

- the kit CI boundary is a kit-owned policy;
- package-graph validation is a pure local application check;
- dashboard implementation remains in the dashboard repository; and
- cross-repository composition is exposed through one explicit workspace gate.

There is no reverse dependency from the dashboard into a copied kit fixture and no second source of
truth in the kit. The boundary validator reads only local package metadata and reachable local
sources. It does not import signing, privacy, database, dashboard runtime, provider, browser, sync,
or target code.

## Rust, Go, Python, and TypeScript decision

Rust, Go, and Python were considered for the boundary validator.

TypeScript remains the correct implementation language because the validator operates directly on a
Node package graph and TypeScript/JavaScript entrypoints already owned by the kit. The final focused
and full runs show no measured latency, throughput, memory, binary-size, or capability threshold that
another runtime would fix.

A Rust or Go binary would add cross-platform build, distribution, and package-discovery surfaces for
a small local graph check. Python would add a second runtime and parser/distribution dependency
without supplying a missing method. No claim is made that TypeScript is universally faster. The
decision is evidence-based for this bounded gate; it may be reopened if a future measured package
graph or source-analysis threshold is missed.

## Static audit and preservation evidence

The final source audit proves:

- exact 11-file source manifest and source/parent SHAs;
- zero tracked or untracked whitespace errors in the candidate;
- final LF in every changed file;
- parseable `package.json`;
- required public plan sections and exact command registry;
- zero added `U+00C0..U+024F` code points by numeric inspection;
- six credential, private-key, local-path, internal-domain, and Supabase detectors each passed a
  synthetic positive control and found zero added-content hit;
- clean kit and dashboard tracked states at the source checkpoint; and
- no temporary launcher preload left on the host.

The required 2026-08-17 backups remain readable:

- kit: 20,610,153 bytes, 549 files, SHA-256
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`;
- dashboard: 6,018,083 bytes, 546 files, SHA-256
  `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`; and
- kit backup tag `backup/2026-08-17`:
  `38888187c4191206dbb81562ccb387463fcbbc76`.

Both archives contain zero `.git`, `.codegraph`, `node_modules`, `.next`, or `dist` path segments.

## Rollback

Before merge, rollback is a non-force follow-up revert on the feature branch or restoration of only
the exact affected files from the verified daily backup. It must not reset or overwrite unrelated
user work.

No database, deployment, sync, target, or dashboard rollback is required because none of those
surfaces changed.

## Merge recommendation

The repository-boundary remediation is merge-recommended as part of pull request #2 because its
source passes local, isolated, Linux, Windows, and aggregate verification.

Pull request #2 remains a stacked feature PR. Its base is `p17-014-a2d-progress-receipts`, so merge
order is dependency-gated: accept the predecessor stack before merging this PR. This evidence does
not authorize automatic merge or a direct push to `main`.

## Non-claims

This remediation does not claim or perform:

- completion of P17-014, P17-016, or the full post-17 roadmap;
- a signing, privacy, tenant, schema, migration, RPC, database, or dashboard behavior change;
- a copied or generated dashboard source of truth inside the kit;
- sync to either target repository;
- modification of any target `.Codex` directory;
- direct-main push, force push, merge, tag, release, deployment, or live database access; or
- authorization to bypass the workspace composition contracts.

The change proves one bounded result: public `test:kit` is repository-self-contained while the exact
eight cross-repository contracts remain fail-closed under explicit workspace ownership.
