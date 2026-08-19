# P17-018 R6 — Final Public-Release Readiness Reconciliation

**Task:** P17-018
**Scope lock:** `scope=R6, chain=C1, identity=I1, status=S1, dashboard=D1, evidence=E1, boundary=B1`
**Starting authority:** merged `main` commit `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e`
**Date:** 2026-08-19

## Outcome and delivery boundary

R6 closes the implementation/evidence ladder for P17-018 without performing a public release. It
reconciles the durable R1–R5D evidence chain, proves the completion predicate against the canonical
catalog and public-release manifest, creates the final evidence record, and lets the dashboard show
the resulting canonical state. P17-018 is the only task whose status may change, from `ready` to
`done`, and only in the same qualified tree that contains the admitted final evidence.

Public-ready means an authorized operator can select the proven source without discovering an
undocumented audience, license, security, privacy, packaging, onboarding, or verification decision.
It does not mean that a repository, package, plugin, bundle, tag, or release is publicly available.
No public artifact is required or authorized to prove readiness.

## Reconciled starting state

- The original 17/17 roadmap remains closed and must not be reopened.
- P17-018 is `ready`, input-complete, and depends on P17-008, P17-009, and P17-013; all dependencies
  remain `done` at the starting authority.
- R1–R5D are represented by sixteen durable evidence documents. Their accepted branches and PRs
  were merged through exact-head qualification; the final R5D merge is
  `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e`.
- R5D exact evidence head `1185b9dd683a5307a2d6fd54d876bc582b538422` passed Workflow Kit CI
  run `32257876893`: Linux job `96083785935`, Windows job `96083786167`, and aggregate job
  `96086552834`. Its qualified tree is `c8446375d63d923eaec8bff417c2c5a9a5d462fe`.
- The public candidate remains bounded by the manifest, internal-marker registry, three deterministic
  provider archives, eight SBOM sidecars, 11 checksums, 79 text scans, 15 runtime smokes, and clean
  Windows/Linux clone receipts. Root `package.json` remains `private: true`.
- The canonical final path `docs/evidence/post-17-public-release-readiness.md` is absent at the
  starting authority. Catalog and dashboard tests therefore correctly require `ready`, not `done`.
- The dashboard reads the canonical kit catalog; it does not own a second task-status database.

## Locked R6 decisions

### C1 — Require one complete evidence chain

R6 admits completion only when every required R1–R5D evidence document exists as a regular tracked
file, the release manifest admits the final evidence path, and current focused gates independently
re-prove the public source, governance, nightly, provider distribution, SBOM, archive, clean-clone,
privacy, marker, and documentation contracts. A missing, duplicate, untracked, or renamed authority
is a hard gap. A prose statement cannot replace a machine-checkable receipt.

### I1 — Bind completion to immutable identities

The closeout records the exact starting merge, R5D evidence head/tree, CI run and three job IDs,
provider output/admission identities, backup authorities, and the final source/evidence path manifests.
The final PR must run on its exact head. Any base/head/tree transition, stale CI reuse, missing
artifact, or merge-ref-only result stops completion and requires fresh qualification.

### S1 — Make the status transition fail closed

The pure readiness contract compares the immutable starting catalog with the candidate catalog.
It requires the original baseline to remain closed, preserves task IDs and all non-P17-018 statuses,
requires the P17-018 transition from `ready` to `done`, keeps readiness complete with zero missing
inputs, verifies that all dependencies remain `done`, and requires the canonical final evidence path
to exist and be manifest-admitted. P17-018 is the only task whose status may change.

The candidate cannot temporarily claim `done` in a tree that lacks the final evidence. Catalog,
human-readable roadmap, parent release-plan wording, tests, manifest, and evidence change together.
Rollback restores the complete pre-R6 tree rather than leaving status and evidence inconsistent.

### D1 — Reconcile the dashboard without duplicating authority

The dashboard reads the canonical kit catalog through its existing fail-closed server loader. R6
changes no dashboard data source, authentication, Supabase state, progress-event route, or command
runtime. Dashboard tests must prove P17-018 is `done`, the summary changes from 13 to 14 done and from
one ready to zero ready, all other canonical counts remain stable, and the done filter contains
P17-018. A dashboard evidence document records the focused/full/type-check receipts. No browser proof
is required because the production UI already renders status and counts directly from the catalog;
the test must prove that dataflow and prevent a hardcoded R6 badge.

### E1 — Create one durable final evidence record

`docs/evidence/post-17-public-release-readiness.md` is the canonical closeout evidence. It records the
starting and candidate identities, all sixteen phase evidence paths, exact R5D CI/artifact identities,
current focused/full qualification receipts, dashboard reconciliation, known warnings, rollback, and
non-claims. The final evidence path exists and is manifest-admitted before `done` can pass.

The evidence must distinguish source readiness from publication. It cannot say a public repository,
package, plugin, archive, release, marketplace listing, signature, or attestation exists. The root
package remains private and all provider IDs/archive names/version compatibility anchors stay intact.

### B1 — Preserve the external-action boundary

R6 does not authorize a tag, version bump, GitHub Release, visibility change, package publication,
marketplace submission, signing, sync, target edit, or database mutation. It also does not authorize
provider-product execution, direct-main push, branch deletion, credential use, target `.Codex`
changes, or modification of the dashboard's local settings file. A normal feature-branch PR and its
read-only CI are the only remote operations in scope under the operator's standing authorization.

## Completion predicate

P17-018 may be `done` only when all predicates pass in one candidate tree:

1. Baseline stays closed; the 22 task IDs, four initiatives, and every non-P17-018 task status are
   identical to starting commit `c8e81bbe5ed5f21a166bae14a7849fe8dd57be3e`.
2. P17-018 moves only from `ready` to `done`; readiness stays complete, missing inputs stay empty,
   and all dependencies remain done.
3. All sixteen R1–R5D evidence documents and the final R6 evidence exist, are tracked regular files,
   and the manifest admits every new R6 source/evidence path with exact ordinals.
4. `package.json` remains `private: true`; public-source, marker, secret, license, link, governance,
   nightly, SBOM, archive, provider-distribution, clean-clone, version, and full-kit gates are GREEN.
5. Dashboard focused roadmap/page tests, full tests, and TypeScript are GREEN from the canonical
   candidate catalog, with 14 done, zero ready, two in progress, six backlog, and 16 input-complete.
6. Exact-head Linux, Windows, and aggregate CI are GREEN for the final PR head; required artifacts
   and receipt identities are revalidated before Ready and standard PR merge.

Any failed predicate keeps P17-018 `ready`. It is not acceptable to downgrade a failed check to a
warning or to reuse R5D source-head CI as the final R6 exact-head result.

## Threat model and attack matrix

The pure contract and repository test must cover at least:

- missing, empty, renamed, non-regular, untracked, or non-manifest final evidence;
- P17-018 `done` while any dependency is not done or readiness has a missing input;
- a second task status changed, task added/removed/reordered, dependency drift, or baseline reopened;
- final evidence omitting any R1–R5D authority, exact R5D merge/head/tree/run/job identity, dashboard
  reconciliation, rollback, or non-publication boundary;
- root `private` removed/false, a publication command exposed, or release/visibility language claiming
  an action that did not happen;
- manifest duplicate/case-colliding paths, wrong ordinal, excluded final evidence, or unsafe path;
- stale exact-head CI, only one platform, aggregate without both platforms, artifact identity drift,
  or branch/head movement between qualification and merge;
- dashboard hardcoding P17-018 instead of loading the canonical catalog, summary drift, partial-load
  rendering, auth bypass, or mutation of the forbidden local settings file;
- raw credential, internal hostname, service-role token, personal path, provider response, or private
  archive content appearing in final evidence or diagnostics.

Synthetic attacks use fake paths, statuses, digests, and identities. They never call GitHub,
Supabase, a provider, a package registry, a marketplace, or a target repository.

## TDD and verification ladder

1. Register the focused R6 plan validator and prove one exact RED gap while this plan is absent.
2. Add this plan and require the unchanged validator to turn GREEN before catalog/evidence changes.
3. Add the pure readiness contract and synthetic attack suite first; prove missing contract RED, then
   cover every attack group without filesystem, network, process, environment, or clock access.
4. Add the repository adapter test that reads the exact starting catalog through Git, current catalog,
   manifest, package metadata, and evidence files. Prove it stays RED until status, evidence, and
   manifest are changed atomically.
5. Update the parent release plan, machine/human roadmap catalogs, their tests, and final evidence.
   Run R6 contract, post-17 catalog, parent plan, public source, marker/privacy, release, provider,
   SBOM/archive/clean-clone, nightly, version, diff, and positive-control secret gates.
6. Reconcile dashboard tests/evidence on `feature/ISUITE2026-Codex-custom-workflows`; run focused page/
   catalog tests, TypeScript, full dashboard tests, diff check, and a bounded positive-control secret
   scan without reading `.claude/settings.local.json`.
7. Run one full native kit suite on the exact staged source/evidence tree. Commit only the exact
   manifests below, then open a draft PR and qualify its immutable head on Linux/Windows/aggregate.
8. Revalidate artifacts, PR state, base/head/tree, mergeability, and branch retention. Mark Ready and
   standard-merge only when every predicate remains GREEN; then reconcile handoffs and live main.

TypeScript and Node.js remain sufficient because R6 performs bounded catalog/evidence validation,
not CPU-heavy parsing or a new runtime service. Rust, Go, or Python would add distribution and
supply-chain surfaces without measured benefit. R6 adds no new dependency.

## Exact source and evidence manifests

The kit source commit may change exactly these sorted paths:

- `.githooks/pre-commit`
- `docs/evidence/post-17-public-release-readiness.md`
- `docs/roadmap/p17-018-public-release-plan.md`
- `docs/roadmap/p17-018-r6-final-readiness-plan.md`
- `docs/roadmap/post-17-roadmap.json`
- `docs/roadmap/post-17-roadmap.md`
- `package.json`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-plan.test.ts`
- `scripts/post-17-public-release-r6-plan.test.ts`
- `scripts/post-17-roadmap.test.ts`
- `scripts/public-release-readiness-contract.test.ts`
- `scripts/public-release-readiness-contract.ts`

Path-manifest SHA-256: `a370cc7b82aee1655332860c2420fbc5e4104f57818b36feaa75a8fb06d2f317`.

The final kit evidence subset is exactly:

- `docs/evidence/post-17-public-release-readiness.md`
- `release/public-release-manifest.json`

Evidence path-manifest SHA-256: `4b89d9d36b5debd6d1078cbbe8ae1fc39b0e1e286066cb9dac91566c14754a73`.

The dashboard reconciliation commit may change exactly these paths. The extra three paths close
pre-existing full-suite/type blockers exposed by R6: the I1 test switches from removed private
evidence to synthetic fixture data without changing the production probe, and the O1 operator uses
the already-approved encrypted local persistence/readback boundary instead of a removed central
writer.

- `docs/evidence/post-17-public-release-readiness-dashboard-2026-08-19.md`
- `scripts/o1-assurance-operator-run.ts`
- `tests/i1-roadmap-probe.test.ts`
- `tests/o1-assurance-operator-contract.test.ts`
- `tests/post17-roadmap.test.ts`

Dashboard path-manifest SHA-256: `81162d6903403b605303d8772067195c5402ca600a0084b25a2ab99b3e3432fa`.

Root `HANDOFF.md`, `POST-17-HANDOFF.md`, and `POST-17-CURRENT.md` are workspace state authorities,
not repository feature manifests. They are updated immediately as scope and results change.

## Rollback and stop conditions

- Stop on any unexpected dirty path, missing backup, starting-base mismatch, manifest drift, unsafe
  path, raw secret/internal marker, incomplete evidence chain, task-count/status drift, or failure in
  a focused/full/exact-head gate.
- Stop if final evidence would need an unverified claim, publication action, provider credential,
  database write, package upload, visibility change, signing key, sync, target edit, or forbidden
  dashboard settings access.
- Before commit, restore candidate paths from the verified 2026-08-19 backup or revert the complete
  feature-branch change. Never leave `done` without admitted final evidence.
- After commit, use a normal feature-branch revert or PR close. Never force-push, delete retained
  evidence branches, reset a user worktree, or write directly to `main`.

## Deferred beyond R6

Release-candidate/version selection, `v4.0.0-rc.1`, a sanitized historyless public export, dashboard
release/version routing, signed provenance/attestations, tags, GitHub Releases, npm/pnpm/plugin/
marketplace publication, repository visibility, provider endorsement, sync, and target rollout remain
separate future scopes. Their absence does not block readiness because this task explicitly proves a
deliberate private distribution boundary rather than an external publication.
