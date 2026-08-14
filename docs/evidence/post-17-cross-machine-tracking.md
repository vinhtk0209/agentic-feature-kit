# P17-015 Detailed Cross-machine Progress Tracking Evidence

Date: 2026-08-14
Roadmap task: P17-015
Result: IMPLEMENTATION CHECKPOINT — LOCAL TIERS 1–7 PASS; LIVE TIER 8 NOT RUN

## Scope and result boundary

The implementation follows `docs/roadmap/p17-015-cross-machine-progress-plan.md`. It provides a
provider-neutral shared contract, an immutable/append-only Supabase persistence design, a strict
writer and reader boundary, and an authenticated read-only dashboard drill-down. P17-015 remains
`in_progress`: migration `kit-dashboard/migrations/0017_cross_machine_progress.sql` has not been
applied to the external Supabase project, and no live binding/event/evidence row was written.

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
| Dashboard migration `0017_cross_machine_progress.sql` | `12706ebfa99c4a91303955aad1440efeebf272c03559d2574a8746d5874b1e1a` |

## Required live completion gate

P17-015 cannot be marked done until an operator explicitly authorizes migration/application and
write access to the named Supabase project. Tier 8 must then prove exact schema/RPC readback, two
logical configured-machine canaries, one successful linear retry, competing-child and wrong-machine
zero-mutation attacks, exact task/run/attempt/evidence hashes in the authenticated UI, and cleanup or
retention confirmation. Until that evidence exists, P17-014 and P17-021 remain dependency-locked.

