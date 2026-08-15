# P17-016 Wave B2D: Install writer adapter plan

**Status:** Authorized — inputs locked; implementation unproven
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent decision:** P17-016 Wave B2A `T1/R1/X1/C1/S1/L1/E1`
**Previous slices:** B2B verification adapter; B2C run-version adapter
**Authority:** The durable roadmap goal authorizes in-scope local work and external proof except push.
**Locked scope:** `writer=I1, core=C1, command=R1, batch=B1, context=T1, receipt=L1, sink=S1, dry=D1, compatibility=F1, evidence=E1`

## Outcome

Wave B2D cuts over only `kit.sync.install-report`, the final `adapter_planned` kit writer. The raw
post-sync `/rest/v1/installs` loop is removed. A non-dry sync command with at least one install
observation emits one exact local command-level blocked receipt instead of sending raw repository
and version rows. Trusted v2 tenant attestation and the Wave C sink remain unavailable.

This scope does not run sync. It does not alter target copying, snapshots, admission guards,
rollback, or migration-blocked telemetry/RPC paths. P17-016 remains `in_progress` after B2D because
dashboard writer waves, legacy migrations, and tenant-isolated persistence remain open.

## Decisions

### I1 — Final adapter-planned writer only

The only production behavior changed is `kit.sync.install-report`. `kit.telemetry.central-upsert`
and `kit.verification.record` retain their completed fail-closed adapters. The three
`migration_blocked` kit entries stay unchanged. No dashboard writer is included.

### C1 — Reuse the canonical compatibility core

`packages/core/src/blocked-central-writer.ts` remains the only UUID, canonical-time, exact-key,
writer-allowlist, frozen-receipt, and non-echo refusal implementation. Its exact allowlist gains
`kit.sync.install-report`. The generated `.claude/integrations/core` mirror remains byte-identical.
The install adapter is a thin writer-specific wrapper; it owns no environment, filesystem,
network, target, repository, version, or sink dependency.

### R1 — One sync-command UUID

The normal sync mode creates one UUID after rollback-mode classification and before sync admission
or any target write. It is passed unchanged to the install reporter and adapter. `KIT_RUN_ID`,
target paths, repository basenames, kit versions, timestamps, hashes, environment values, and
payload fields are not identity authorities. Rollback mode does not create an install-writer UUID
because it cannot attempt install reporting.

### B1 — One closed receipt per command batch

The existing writer accepts a list and performs one central row attempt per target. While tenant
attestation and opaque repository mapping do not exist, B2D treats the list as one blocked
command-level compatibility attempt. A non-dry invocation with one or more valid observations emits
exactly one receipt, regardless of target count. It exposes neither target cardinality nor a
per-target attempt identity. An empty batch emits no receipt.

This compatibility receipt is not a future install event or persistence acknowledgment. Wave C
must restore per-observation semantics only after trusted tenant context, tenant-keyed opaque
repository IDs, deterministic attempt identity, and an authorized sink exist.

### T1 — Tenant context remains unavailable

The reporter and adapter accept no tenant, subject, token, enrollment, repository, version, CLI,
config, or environment context. Current tenant status is always `unavailable`, so record
construction and sink selection cannot begin.

### L1 — Exact non-durable receipt

The adapter accepts exactly `runId` and `createdAt` and returns the shared exact receipt containing
only `schemaVersion`, `policyVersion`, `writerId`, `runId`, `tenantContextStatus`, `outcome`,
`reasonCode`, and `createdAt`. The result is frozen and emitted once as `@@PRIVACY_RECEIPT@@`.
There is no file, spool, cache, database row, raw target, repository, kit version, path, URL, token,
error text, target count, or secret in the receipt.

### S1 — No installs endpoint or fallback

Production sync contains no `/rest/v1/installs` request and no generic replacement write. It does
not fall back to `repo_runs`, `usage_logs`, service-role clients, anon REST, a local raw spool, or
another table. Central sink capability remains blocked until Wave C.

### D1 — Honest dry-run behavior

Dry-run remains non-writing and does not emit a blocked receipt because it does not attempt the
writer. It may retain the existing local per-target preview because that output describes what was
observed on the operator's machine, but its heading must state that central persistence is disabled.
Dry-run performs zero install-report fetches and never weakens the real-sync verification warning.

### F1 — Preserve sync and rollback semantics

Dirty-tree admission, verified-run admission, explicit overrides, source-ref resolution, target
allowlist, snapshots, pruning, file-copy order, reports, rollback mode, socket cleanup, and exit
semantics are unchanged. Install reporting remains post-copy and non-blocking. An unexpected local
adapter refusal produces one generic non-echo warning; it cannot retroactively label completed file
copies as failed and cannot trigger a legacy write.

### E1 — Highest practical local evidence

Evidence proceeds plan-first, RED, pure unit, reporter integration with a fetch tripwire, historical
compatibility, registry discovery, mirror, exact TypeScript, mock-only sync guard, full kit suite,
exact diff, whitespace, credential detectors with positive controls, normal hooks, local commit,
and readback. No real sync or browser is useful for a deliberately removed network writer.

## Clean architecture boundaries

| Layer | Responsibility | Forbidden dependency |
|---|---|---|
| Shared compatibility core | Validate UUID/time/keys/writer and construct closed receipt | process, env, filesystem, network, sync, repository, version, sink |
| Install writer adapter | Bind `kit.sync.install-report` to the shared core | raw install observation or I/O |
| Sync reporting seam | Own batch eligibility, dry-run output, generic warning, and receipt emission | tenant invention or central fallback |
| Sync command | Own one run UUID and existing file-sync lifecycle | per-target run-ID generation |
| Migration-blocked writers | Retain explicit legacy status | adjacent-conversion claims |

Dependencies point inward. The sync script may import the install adapter; the adapter may import
the generated shared core; shared core has no infrastructure dependency.

## Runtime sequence

1. Direct CLI dispatch classifies rollback mode. Rollback returns without install-writer identity.
2. Normal sync creates one UUID before admission and target writes.
3. Existing dirty-tree and verified-run admission executes unchanged.
4. Existing target snapshots and file copies execute unchanged.
5. Target versions are collected exactly as before.
6. Empty batches do nothing. Dry-run prints an honest local preview and emits no receipt.
7. A non-dry non-empty batch calls the adapter once with only run UUID and canonical time.
8. The reporter emits one exact blocked receipt, or one generic warning on an impossible local
   contract refusal, and continues existing sync completion.
9. No installs endpoint, substitute writer, or durable receipt is invoked.

## Implementation manifest

### Plan and gates

- add this plan and `scripts/post-17-privacy-b2d-install-writer-plan.test.ts`;
- register the plan gate, focused adapter/reporter tests, and full-suite ordering in `package.json`;
- add durable evidence at `docs/evidence/post-17-privacy-b2d-install-writer-adapter-2026-08-15.md`.

### Core and adapter

- extend the exact writer allowlist and its canonical core attacks;
- regenerate/check `.claude/integrations/core/blocked-central-writer.ts`;
- add `.claude/integrations/install-writer-adapter.ts` and its focused test.

### Sync integration

- change only install reporting and normal-command UUID ownership in `scripts/sync-to-targets.ts`;
- add `scripts/sync-install-report.test.ts` using an in-process reporter seam, injected clock/logger,
  and a fetch tripwire; never invoke the real sync CLI in B2D tests.

### Registry and truth

- move only `kit.sync.install-report` to `in_process/contract_validated/fail_closed`;
- update registry discovery, B2A current-state assertions, B1 next-slice truth, and README install
  reporting claims;
- retain historical migration DDL and historical evidence without rewriting them.

## RED controls

Before production changes:

1. the new install adapter test exits nonzero because its module does not exist;
2. an install writer ID attack fails because the shared exact allowlist has only two writers;
3. a source sink-denial test exits nonzero because `/rest/v1/installs` is still present; and
4. the registry still reports `kit.sync.install-report` as `adapter_planned/legacy_raw`.

No RED control may call `main`, invoke npm sync, reach Supabase, or touch a target.

## Verification and attack matrix

| Group | Required proof |
|---|---|
| Core | exact third writer only; unknown valid ID, malformed UUID/time, extra key, and polluted prototype refuse without echo |
| Adapter | exact writer ID; one generated UUID in pure test; explicit UUID preservation; no I/O/raw fields |
| Command | one UUID owned before admission/write; rollback has no install attempt; env/target/version cannot replace it |
| Batch | empty=0 receipts; one target=1; multiple targets=1; malicious element getters are not touched in non-dry mode |
| Receipt | exact keys/value enums/frozen result; no repo/version/path/target count/secret; one marker line |
| Sink denial | fetch tripwire remains untouched; production has zero installs endpoint and no substitute table/helper |
| Dry-run | local preview remains, heading is honest, no receipt, no fetch, no file write through the isolated seam |
| Compatibility | guard/rollback/version tests unchanged; adapter refusal warns generically and does not throw after copies |
| Registry/docs | only install writer transitions; three migration-blocked entries and completed B2B/B2C remain unchanged |
| Regression | plan/core/adapter/reporter/registry/B2A/B1/privacy/mirror/mock-sync/roadmap, exact TS, then full kit |
| Release hygiene | exact manifest, diff checks, five positive-control credential detectors, hooks, local commits/readback |

## Edge cases and failure handling

- A missing target version remains excluded from the batch under existing behavior.
- An empty eligible batch cannot manufacture a blocked attempt or receipt.
- Multiple targets cannot produce duplicate indistinguishable receipts or reveal cardinality.
- A malicious report object cannot expose getters in non-dry mode because elements are not read.
- A malformed command UUID blocks locally with a generic warning; it never enables central I/O.
- Dry-run must not be reused as proof that a real sync is admitted.
- If target copying fails, existing control flow prevents the post-copy reporter from running.
- If a bulk edit/generator/build fails mid-update, restore the verified daily snapshot before retry.

## Evidence and completion

B2D is complete only when source-backed discovery moves the install writer to
`in_process/contract_validated/fail_closed/tenant_attestation_and_sink_unavailable`, no
adapter-planned kit writer remains, all focused and full gates pass, evidence and handoffs are
current, exact local commits are read back, both worktrees are clean, and no push or real sync
occurred. This does not complete P17-016 or authorize Wave C.

## Rollback

The verified 2026-08-15 kit snapshot and `backup/2026-08-15` tag remain the rollback boundary.
B2D creates no database, dashboard, target, or external state. Before commit, restore the snapshot
if an update fails mid-change. After commit, revert the isolated B2D source/evidence commits.
Never use sync as rollback and do not push.

## Non-claims

This plan does not claim B2D implemented, installs tenant-safe, central persistence available,
Wave B complete, or P17-016 done. It does not authorize a database migration, browser operation,
dashboard change, target edit, real sync, or push. Existing `installs` rows remain historical data.
