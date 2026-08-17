# P17-016 Wave C3D Cross-Repository Disposable PostgreSQL Evidence

**Date:** 2026-08-16
**Scope:** executable kit gate for the dashboard's disposable PostgreSQL migration proof
**Source commit:** `d3b8f479a6f63b406b0a0dd36f16ad6b475d48fb`
**Source parent:** `07175ab2c87d6c2ed385e6bd8508cd14db1d31ba`
**Dashboard peer source:** `8f3bc8109c82bad577aa7a578e909168bea60052`

## Outcome

The accepted C3 execution plan now records the resolved PostgreSQL 17.11 environment and the
digest-pinned disposable boundary. A new fail-closed cross-repository validator is registered in
the authoritative full kit suite. It binds the dashboard runner, fixtures, package script,
migration and rollback, transient-input controls, cleanup restrictions, and all ten scenario
groups.

The validator requires 20 legacy relations, five foundation relations, six tenant-required RPCs,
two synthetic tenants, immutable image selection, disabled container networking, tmpfs storage,
no published port, no image pull, label-gated cleanup, exact H1 digest/byte metadata, and explicit
`liveProjectTouched=false` and `functionBodiesPersisted=false` output.

## Exact source manifest

The authoritative parent diff contains exactly four files, 153 insertions, and 7 deletions:

- `docs/roadmap/p17-016-wave-c3-tenant-foundation-execution-plan.md`;
- `package.json`;
- `scripts/post-17-privacy-wave-c3-tenant-foundation-execution.test.ts`; and
- `scripts/post-17-privacy-wave-c3d-disposable-postgres.test.ts`.

The normal `spec-integrity` hook passed. The source commit is on local `main`; its parent, manifest,
stat, whitespace, and clean worktree read back exactly. No push or sync occurred.

## Environment and input boundary

The official image is pinned as
`postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`, and the
runtime reports PostgreSQL 17.11. PostgreSQL 16.14 was rejected before migration because it cannot
represent the required `MAINTAIN` privilege; the exact migration was not downgraded or rewritten.

The H1 definitions were retrieved through a separately approved metadata-only query and were
transported only through a workspace `_tmp` fixture. Durable evidence contains only the three
expected MD5 and byte-length tuples. The fixture and logs were deleted after proof, no decoded
function body entered either repository, and Docker Desktop was shut down after its labelled
container cleanup.

## Validator and attack coverage

The source validator executes from both source and isolated compiled CommonJS and reports:

`P17-016 Wave C3D disposable PostgreSQL: PASS (20 legacy, 5 foundation, 6 RPCs, 10 scenario groups)`

Its static attacks reject mutable image tags, wrong digests, network/publish/pull paths, missing
tmpfs or label checks, unsafe fixture paths, wrong function hashes/lengths, client-side decoded-body
persistence, missing relations/RPCs, incomplete scenario sets, weak SQL fixtures, and claims that a
live project was touched.

The peer authoritative runner then applies the unmodified migration and rollback on digest-pinned
PostgreSQL 17.11. It passes engine, forward migration, two-tenant attacks, table/RPC denials, retry
refusal, non-empty rollback refusal, safe rollback, object-collision atomicity, partial-DDL
atomicity, and rollback-drift refusal. It records two synthetic tenants, no live-project touch, no
persisted function bodies, and leaves no labelled container.

## Corrections retained as evidence

The initial RED was the missing dashboard runner. The first PostgreSQL 17 execution corrected only
the retry expectation because the exact H1 preflight reaches three-argument verifier drift first.
A second harness correction accounted for cluster-global synthetic roles. Review rejected filtered
`information_schema` grant counts and replaced them with exact raw-ACL symmetry. The runner was
then hardened with network isolation, bounded non-busy readiness, exact policy/ACL and no-extra-sink
checks, missing-function assertions, and post-failure schema atomicity. No migration safety gate was
removed or weakened.

## Exact-SHA full regression

The authoritative `npm run test:kit` at source SHA
`d3b8f479a6f63b406b0a0dd36f16ad6b475d48fb` exits `0` in 266.2 seconds with 1,614 captured output
lines. The C3D validator runs in-chain. Prompt budget is 163,206/176,128 bytes, version stamps remain
v3.25, and lesson sync is 60/60.

The peer dashboard at source SHA `8f3bc8109c82bad577aa7a578e909168bea60052` passes 84 files and
543 tests in 10.51 seconds. Its exact disposable run passes all ten scenario groups on PostgreSQL
17.11 with Docker networking disabled.

Five positive-controlled credential detectors plus long-base64 and live-project-reference checks
found zero source hits. Cached whitespace and exact TypeScript gates pass.

## Non-claims

This evidence does not claim migration `0018` was applied to the live project, live data was read or
migrated, live two-tenant isolation or tenant-safe application functionality exists, a central sink
is available, or C3/Wave C/P17-016 is complete. No live SQL, sync, push, merge, deploy, provider
mutation, target command, or target `.Codex` edit occurred.
