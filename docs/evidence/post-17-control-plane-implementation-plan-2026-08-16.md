# P17-014 Control Plane A1 implementation-plan evidence

**Date:** 2026-08-16
**Scope:** A1 plan, readiness, and truthful tracking only
**Accepted topology:** `T1/M1/X1/R1/E1/S1`
**Implementation lock:** `C1/O1/P1/V1/Q1/D1/E1/X0`
**Kit source commit:** `6efd3deb5a82af9f85b1e9f6719ac9e4adf66904`
**Kit source parent:** `9b66d77b4e30fec74517cbf50def3e21e0a3bd07`
**Dashboard source commit:** `5e4e59b02efd9647bb8df4d39f6c9ae48a4b5015`
**Dashboard source parent:** `a2f6468b39b3aefe5240d31f46c089d8be166329`

## Outcome

P17-014 moved from `ready` to `in_progress` because implementation planning started. The new plan
locks clean source ownership, reuse of the existing provider-neutral Project Intelligence and
Workflow Orchestrator runtimes, P17-015 progress authority, P17-016 privacy gating, seven ordered
implementation slices, provider distribution boundaries, and a cumulative evidence ladder.

A1 contains no Control Plane runtime. It adds no shared-core implementation, migration, route,
worker, key, database row, plugin, provider call, network service, browser state, or target change.
P17-015 remains `done`, P17-016 remains `in_progress`, and P17-021 remains `backlog` with nine
readiness gaps.

## Source manifest

The kit source commit contains exactly ten files with 544 insertions and 13 deletions:

- `docs/design/adr-003-distributed-control-plane-topology.md`;
- `docs/roadmap/p17-014-control-plane-implementation-plan.md`;
- `docs/roadmap/p17-016-wave-c5-live-cutover-plan.md`;
- `docs/roadmap/post-17-roadmap.json`;
- `docs/roadmap/post-17-roadmap.md`;
- `package.json`;
- `scripts/post-17-control-panel-rbac.test.ts`;
- `scripts/post-17-control-plane-implementation-plan.test.ts`;
- `scripts/post-17-control-plane-topology.test.ts`; and
- `scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts`.

The dashboard counterpart changes only `tests/post17-roadmap.test.ts`, with four insertions and four
deletions. The route already reads the canonical kit roadmap dynamically, so A1 requires no
dashboard production-file change.

## RED and correction history

1. The readiness validator first exited `1` with exactly seven expected gaps: implementation plan,
   focused and full-kit registration, canonical and human roadmap status, ADR implementation status,
   and dashboard expectation.
2. The first cross-repository run found only stale dashboard summary counts. The detailed P17-014
   assertion already described the new state; the summary was reconciled from two ready/one in
   progress to one ready/two in progress.
3. The kit companion chain then found one stale RBAC status assertion after eight preceding gates
   passed. Only that status assertion changed; all RBAC, authorization, and P17-021 gaps remained.
4. The ambient npm shim referenced a missing roaming npm CLI, and sandboxed `tsx` stopped at the
   known `uv_os_get_passwd` environment boundary before assertions. Tests were run unchanged through
   the bundled Node runtime and repository-local `tsx` outside that restriction.
5. Exact-diff review found that the required RBAC companion was absent from the A1 manifest and not
   pinned directly by the new validator. The manifest and validator were hardened to bind RBAC plus
   the exact C5 P17-014 status/readiness tuple.
6. The first final-source scan did not execute because a PowerShell diagnostic interpolation was
   malformed. Only the scan harness was corrected; every detector and source file stayed unchanged.
7. The first parallel exact-SHA dashboard/full-kit proof produced one unrelated C3C five-second
   timeout under contention. The A1 roadmap test still passed 4/4. The unchanged dashboard suite was
   rerun alone and passed all 558 tests, including C3C in 1.9 seconds. No timeout was increased.

## Architecture, testing, and review decisions

- Clean Architecture keeps the shared domain independent of Next.js, Supabase, filesystem,
  environment, process, network, provider SDKs, and platform packages.
- The local P2 role/worktree transport is explicitly excluded from the future network wire format.
- `cross-machine-progress.ts` remains the only progress-domain authority.
- The first four operation codes bind to compiled adapters and contract hashes, never executable
  paths, arbitrary arguments, raw environment, or caller-supplied credential aliases.
- Pure contracts and local crypto/journal work may proceed before persistence; production
  persistence and remote execution remain gated by P17-016.
- The evidence ladder does not let mocks satisfy process, database, network, browser, or provider
  claims.
- Review added direct regression guards for companion status truth instead of relying only on the
  full-suite chain.

## Verification

| Gate | Result |
|---|---|
| A1 implementation-plan validator | PASS: accepted topology plus implementation lock, A1-A7 sequence, 17 attack groups, and non-claims |
| Ten-gate focused aggregate | PASS: A1, topology, roadmap 22/4, C5, RBAC, UX, progress, Project Intelligence, Workflow Orchestrator, and provider bundles |
| Exact A1 TypeScript 5.9.3 | PASS: strict, `skipLibCheck=false`, NodeNext |
| Source-candidate dashboard | PASS: 86 files/558 tests; 12.2-second invocation |
| Source-candidate kit | PASS: exit `0`; 346.7 seconds; 1,648 captured lines |
| Exact-SHA dashboard | PASS at `5e4e59b02efd9647bb8df4d39f6c9ae48a4b5015`: 86 files/558 tests; 17.9 seconds |
| Exact-SHA kit | PASS at `6efd3deb5a82af9f85b1e9f6719ac9e4adf66904`: exit `0`; 293.3 seconds; 1,648 captured lines |
| Version and budget | PASS: v3.25 stamps; prompt 163,206/176,128 bytes |
| Lesson synchronization | PASS: 60/60 |
| Dashboard full TypeScript attribution | No A1 diagnostic; only the unchanged assurance-runner missing-export baseline remains |
| Normal commit hook | PASS: `spec-integrity`, four TypeScript files |

The source manifests, branches, JSON, whitespace, English-only feature content, and daily backups
were verified before staging. Eleven positive-controlled detectors covered both project-identity
forms, internal host, JWT, GitHub/OpenAI/Supabase token forms, private-key marker, service-role
assignment, bearer token, and long base64. They found zero source hits.

## Workspace preservation and non-claims

The kit source commit is on local `main`. The dashboard source commit is on
`feature/ISUITE2026-Codex-custom-workflows`. The dashboard's user-owned untracked settings file was
not read, modified, staged, or deleted. Both 2026-08-16 backups existed before the A1 edits.

No runtime implementation exists in A1. No database or browser was accessed for A1. No migration,
remote worker, process execution by the Control Plane, provider call, enrollment, key generation,
deployment, sync, push, merge, target edit,
or target `.Codex` modification occurred. This evidence does not claim P17-014, P17-016, or P17-021
is complete.
