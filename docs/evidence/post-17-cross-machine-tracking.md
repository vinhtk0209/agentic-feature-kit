# P17-015 Detailed Cross-machine Progress Tracking Evidence

Date: 2026-08-14
Roadmap task: P17-015
Result: PASS — ALL REQUIRED TIERS 1–8 COMPLETE

## Scope and result boundary

The implementation follows `docs/roadmap/p17-015-cross-machine-progress-plan.md`. It provides a
provider-neutral shared contract, an immutable/append-only Supabase persistence design, a strict
writer and reader boundary, and an authenticated read-only dashboard drill-down. The local
implementation passed tiers 1–7 before the separately authorized live tier. Migration 0017 is now
applied to the named external project, the bounded tier-8 fixture passed, the same ledger was proven
in the authenticated UI, and every temporary row was removed.

This checkpoint does not claim remote worker enrollment or transport (P17-014), final tenant
privacy/retention policy (P17-016), Control Panel mutations (P17-021), provider execution, target
sync, deployment, installation, publication, or push.

## Shared identity and event contract

- Schema/sentinel version `1` uses immutable task, command-run, configured opaque machine UUID,
  repository, runner, optional provider execution, root/parent, attempt, retention-class, and
  deterministic binding-hash fields.
- Retry history is one linear chain: one task root, one child per parent, contiguous attempts, no
  branches, and no retry from a passed or non-terminal parent.
- Events are append-only and limited to 200 per attempt. Sequence, previous hash, timestamps,
  state/reason/phase, immutable binding identity, and deterministic event hash are cross-validated.
- Passed state requires exact verified terminal evidence. Evidence contains only a SHA-256,
  manifest version, media type, byte count, safe label, verification state, and binding identity.
- Contracts are closed. Unknown fields, raw logs/prompts/paths/hosts/environment values, invalid
  clock skew, forged hashes, contradictory transitions, and oversize events fail closed.
- A task view derives the exact current attempt/state, ordered attempt timelines, terminal evidence,
  per-attempt clock status, and deterministic ledger hash without mutating source envelopes.

## Persistence, read, and presentation boundaries

- The additive migration defines immutable `progress_run_bindings`, append-only `progress_events`,
  service-role-only `register_progress_run` / `append_progress_event` RPCs, task/tail advisory
  locks, unique linear retry indexes, bounded retention fields, event-tail CAS, RLS, and an explicit
  rollback sequence.
- The dashboard writer validates the shared contract before I/O, obtains `expiresAt` only from an
  injected server policy, sends exact RPC parameter sets, accepts only exact closed receipts, and
  translates conflicts/storage failures without returning database messages.
- The reader selects at most 51 bindings and 10,001 events to detect truncation around the public
  50-attempt / 200-events-per-attempt bounds. Exact row keys, types, expiry, evidence, binding/event
  identities, and the shared ledger are revalidated before any progress is rendered.
- Generated dashboard core is byte-identical to the kit source and has missing, extra, content, and
  check-without-repair controls.
- `/roadmap/[taskId]` authenticates before reading, validates the canonical task before querying
  progress storage, returns 404 for unknown IDs, and is read-only. Loading, empty/legacy-untracked,
  unavailable, integrity-conflict, current/terminal, clock, truncation, expiry, retry, and evidence
  states are explicit.

## Focused and attack proof

- Kit core: `npm run test:cross-machine-progress` — PASS, 6 assertions and 22 attacks.
- Dashboard mirror: 4/4 tests; live check reports 23,268 byte-identical bytes.
- Migration contract: 5/5 static tests for immutable identity, retry uniqueness, CAS, terminal
  evidence, service-role mutation, bounded indexes, and rollback text.
- Reader/read model: 6/6 tests covering two-machine retry, exact evidence, empty versus unavailable,
  identity corruption, extra/partial/wrong-type rows, unknown bindings, invalid expiry/clock,
  truncation, and retention expiry.
- Writer/concurrency: 6/6 tests covering exact params/receipts, injected retention, redaction,
  zero-call invalid input, conflict/storage translation, malformed receipts, and a concurrent
  two-machine harness. Exactly one competing retry child succeeds, exact replay is idempotent, and
  a different-machine overwrite is rejected.
- Route/component: 5/5 tests covering auth/catalog/query order, invalid-task 404 before storage,
  loading semantics, card routing, read-only boundaries, named failure states, accessible retry
  timeline/table semantics, and exact identity/evidence rendering.
- Combined dashboard P17-015 suites: 5 files / 26 tests PASS. Dashboard TypeScript and both
  repository diff checks exit 0.

## Full regression and browser proof

- Full kit `npm test`: exit 0 in 240.6 seconds. The P17-015 core test is registered in `test:kit`.
- Full dashboard `npm test`: 62 files / 446 tests PASS in 6.88 seconds.
- Dashboard `npm run build`: exit 0 on Next.js 16.2.9; compilation and TypeScript pass and the build
  manifest contains dynamic `/roadmap/[taskId]`. One non-failing pre-existing Turbopack trace
  warning points through `next.config.ts`, `runner.ts`, and `/api/run/ticket`, not P17-015.
- Authenticated localhost browser QA proves the 22-task roadmap has exactly one P17-015 progress
  link; clicking it traverses loading and renders the correct read-only task plus the honest
  missing-migration `Progress history unavailable` state. `/roadmap/not-a-task` renders 404.
- At a 1280×720 viewport the measured main/content widths are 1,152/1,120 px and the normal
  viewport screenshot renders cleanly in dark mode. A malformed browser-tool `fullPage` capture was
  rejected as evidence after DOM geometry and viewport recapture proved it was not a product bug.

## Artifact hashes

| Artifact | SHA-256 |
|---|---|
| `packages/core/src/cross-machine-progress.ts` | `79fed5797a3c223963ddbdcb8f10e0831747d1e86365f2da54ca4e246b8dbdb1` |
| `docs/schemas/cross-machine-progress.schema.json` | `7fb4ef3ef8df392546b62f427078373b1f0d9407153cd219138c00312e7f4cb2` |
| `packages/core/test/cross-machine-progress.test.ts` | `d743c7910765aaab97b95bc1b4cb4b4c188f82026987be3c855022f10f4a51b9` |
| `docs/roadmap/p17-015-cross-machine-progress-plan.md` | `734f6d63d11722d79d0ec9737d13948ceda0be4c90d7926912d67ddeef39175e` |
| Dashboard generated mirror | `79fed5797a3c223963ddbdcb8f10e0831747d1e86365f2da54ca4e246b8dbdb1` |
| Dashboard migration `0017_cross_machine_progress.sql` | `c309721fc292f67132b3e2ff67dda1baa33b6b1f9e01319b1b45e9d83c788859` |
| Dashboard live canary | `2a80e4406e4a12d6ffc27add3a305ec83f5e42434cb2e92d6c989da0821285bd` |
| Dashboard exact-ID cleanup | `67e83ee75b2680fc50eb46f80bd1b0c15dad8dd3282c820915d7216f5124daad` |

## Tier-8 live completion proof

The operator authorized Supabase project `vkuojxgvkxndftenrdno` and the exact disposable payload:
three deterministic `command_runs`, two progress bindings, six events, authenticated UI proof, and
cleanup. The live gate produced the following bounded evidence:

- applied schema/RPC readback retained the expected tables, service-role-only RPCs, RLS, locks,
  linear retry uniqueness, event-tail CAS, evidence checks, and closed ACLs;
- a live-only PL/pgSQL ambiguity was found when the retry lookup used the output variable name
  `binding_id`; the reviewed function-only hotfix qualifies `progress_event.binding_id`, with live
  `pg_get_functiondef` proving old marker false and qualified alias/source markers true;
- a PostgREST `timestamptz` offset exposed a reader-boundary mismatch; a RED live-shape fixture
  failed at canonical binding time, then passed after the adapter normalized only hash-bound
  binding/event timestamps to canonical UTC before shared-core validation;
- the final package-safe command exited 0 with winner retry B, loser retry C, 2 attempts, 6 events,
  competing-child conflict, exact replay, and wrong-machine rejection all true;
- terminal evidence SHA-256 was `d56f56ce0119644428a979f9becf42f39340ec0173cc30cc6d1c5c7161434e65`
  for a 377-byte verified JSON manifest; the derived ledger SHA-256 was
  `af58e41dd839f23973fb5ec7dcad06a15ec3978bbee022c7b1b06ec5de156ae7`;
- an independent SQL read proved exactly 3 command rows, 2 bindings, 6 events, and 1 verified
  terminal-evidence row;
- authenticated `http://localhost:3000/roadmap/P17-015` rendered Passed, current attempt 2, both
  exact command/machine/provider lineages, ordered 3+3 events, binding/event hashes, and the same
  terminal evidence hash and byte count; and
- the reviewed exact-ID cleanup returned 0 bindings / 0 events / 0 command rows, then a separate
  read-only query independently reconfirmed 0/0/0.

P17-015 therefore satisfies every tier in the approved evidence ladder and is `done`. P17-014 is
dependency-unblocked to `ready`; this does not start Control Plane implementation. P17-021 remains
blocked by its nine other named inputs. No provider run, target sync, target `.Codex` edit, release,
merge, or direct-main push occurred.

## Final closeout regression

- Kit roadmap/topology/RBAC/UX focused gates pass with P17-015 `done`, P17-014 `ready`, and P17-021
  still blocked by nine named inputs.
- Full kit `npm run test:kit` exits 0 in 322.8 seconds.
- Dashboard P17-015/reconciliation focused run passes 5 files / 25 tests.
- Full dashboard Vitest passes 65 files / 457 tests in 12.68 seconds.
- Dashboard `npx tsc --noEmit` exits 0.
