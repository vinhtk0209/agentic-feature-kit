# P17-016 Wave C4D Cross-Repository Verification Evidence

**Date:** 2026-08-16
**Kit source commit:** `7d93446e0dac96bc6f5f9e1dc67253149e4c5d49`
**Kit source parent:** `ccf42c576b2dd7f3d268e106dcd09fb9f11b2087`
**Dashboard peer source commit:** `cacf8d61f7b83b75945ce4e396956dd6f648f09d`
**Dashboard peer source parent:** `431c83c6842601dc419dacefe7e2313c80e267f6`
**Input lock:** `writer=V1, note=N1, context=A1, run=R1, receipt=L1, sink=S1, evidence=E1`

## Result

Wave C4D is complete locally as an exact-SHA, cross-repository disposable PostgreSQL proof. The
kit verification capability bridge writes through the dashboard tenant foundation and
verification sink for two synthetic tenants, and all 17 execution, attack, and rollback scenario
groups pass on PostgreSQL 17.11.

The canonical kit writer registry now classifies `kit.verification.record` as target Wave `C4`
and `capability_ready`, with rationale `disposable_verified_default_runtime_blocked`. This is a
non-live capability label. Both default `record-verify` CLI branches still create the exact B2B
blocked receipt and do not discover a tenant, grant, credential, sink, or provider implicitly.

## Exact kit source manifest

The source commit contains exactly nine files and reports 228 insertions and 13 deletions:

- `docs/roadmap/p17-016-kit-writer-registry.json`;
- `docs/roadmap/p17-016-wave-c4-verification-sink-plan.md`;
- `docs/schemas/privacy-writer-registry.schema.json`;
- `package.json`;
- `scripts/post-17-kit-writer-registry.test.ts`;
- `scripts/post-17-privacy-b2a-input-lock.test.ts`;
- `scripts/post-17-privacy-wave-c-tenant-foundation-plan.test.ts`;
- `scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts`; and
- `scripts/post-17-privacy-wave-c4d-disposable-verification.test.ts`.

The normal commit hook passed `spec-integrity`; it was not bypassed. No command prompt, generated
core, target, or target `.Codex` file changed in this commit.

## Cross-repository and fail-closed evidence

The C4D validator binds both exact repositories, two synthetic tenants, the pinned PostgreSQL
image, exact C3/C4 migrations and rollback, the C4C bridge, the C4B sink, and these 17 required
groups: engine lock, both forward migrations, synthetic attestation, cross-repository write,
replay, conflict, both concurrency races, tenant isolation, stale-credential refusal, retention,
privilege denials, non-empty rollback, empty rollback, forward-again, and rollback privilege-drift
refusal.

The registry and historical plan validators preserve the default boundary:

- seven canonical writer entries and six discovered source files;
- exactly two approved entries changed to `capability_ready` across the repository pair;
- exactly two default `createVerificationWriterReceipt(note)` call sites remain;
- canonical schema accepts the new state while invalid state/rationale combinations remain closed;
  and
- the dashboard sink rationale explicitly states that live migration is still pending.

The initial validator self-reference scan incorrectly treated a negative project-identity matcher
as runtime identity use, and its bridge matcher incorrectly required an `async` keyword. Both were
corrected to inspect the actual execution artifacts and stable exported bridge plus capability
call. A compiled temporary validator was used because the local `tsx` launcher hit the known
`uv_os_get_passwd ENOMEM` environment boundary; every temporary output directory was removed.

## Authoritative test evidence

- Exact source-pair disposable proof: 17/17 scenarios, two synthetic tenants, PostgreSQL 17.11,
  `liveProjectTouched=false`, and `functionBodiesPersisted=false`.
- Exact-SHA full kit at `7d93446e0dac96bc6f5f9e1dc67253149e4c5d49`: exit `0` in 282.5
  seconds with 1,638 output lines.
- Kit registry: seven entries, six source files, and eight attacks passed.
- C4 plan and C4D cross-repository validators passed.
- Exact-peer full dashboard at `cacf8d61f7b83b75945ce4e396956dd6f648f09d`: 86 files and 558
  tests passed in 12.62 seconds.
- Version stamps remain v3.25, prompt budget is `163,206/176,128`, and lesson sync is 60/60.

Cached whitespace, JSON parsing, exact manifests, dependency state, and positive-controlled
credential, live-project-identity, and long-base64 scans passed. Kit `node_modules/.ignored`
contains zero files. The dashboard user-owned `.claude/settings.local.json` remained untracked and
untouched.

## Cleanup and non-claims

The transient H1 fixture is absent. Proof and diagnostic container inventories are zero, the full
running-container inventory is zero, and the proof-started Docker Desktop stopped with exit `0`.
No function body, credential, application row, container, or proof background workload remains.

This evidence does not claim live Supabase migration, tenant/key/grant bootstrap, live cutover,
default CLI activation, legacy-path removal, or P17-016 completion. The legacy `verify_records`
path and sync guard remain unchanged. No live DDL, DML, RPC, application-row read or write, sync,
push, merge, deploy, provider mutation, target edit, or target `.Codex` modification occurred.
