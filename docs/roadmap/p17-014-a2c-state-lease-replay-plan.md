# P17-014 A2C — Task State, Lease, Cancellation, Receipt, and Recovery Plan

**Date:** 2026-08-16
**Status:** Authorized under standing continuation authority — A2C plan-first; no state implementation
**Parent:** `docs/roadmap/p17-014-control-plane-implementation-plan.md`
**Predecessors:** A2A registry/capability source `4764c2666547fec10942c857c7fed422c9e38434`; A2B envelope source `3e1d016914f3ad8896b6d97e255b863f14473ce4`
**Input lock:** `slice=A2C, state=S1, version=V1, lease=L1, cancel=C1, receipt=R1, recovery=U1, replay=I1, sequence=Q1, evidence=E1`

## Outcome

A2C adds the smallest pure domain contract that can decide task-definition and attempt state,
expected-version mutations, one active lease, cooperative cancellation, unsigned metadata-only
receipts, idempotent replay, quarantine, and conservative recovery around the immutable A2B
execution envelope.

The contract is deterministic and receives time and hashing through arguments or existing ports. It
does not read a clock, launch a process, write P17-015 progress, persist a row, authorize an actor,
sign content, open a network connection, or execute an operation.

## Reconciled starting state

- A2A owns the four closed operation descriptors, resource budgets, capability vocabulary, worker
  manifests, and validated operation inputs.
- A2B owns the unsigned content-addressed execution envelope, execution identity, initial lease
  window, deadline, operation binding, evidence destination policy, and canonical signing bytes.
- P17-015 owns progress bindings, attempt lineage, progress events, evidence references, retention,
  and its own closed state/event transition rules. A2C must not copy that ledger.
- ADR-003 accepts at-least-once delivery, stable delivery identity, CAS, one active lease, cooperative
  cancellation, receipt replay, quarantine, and manual unknown-outcome recovery.
- The existing `.claude/integrations/multi-agent-orchestration.ts` lease ledger is a local P2 role-DAG
  scheduler. It has role owners and millisecond clocks but no tenant, run, delivery, machine, CAS,
  cancellation, receipt, or remote replay authority. A2C does not import it.
- P17-016 still gates persistence and live remote execution. P17-021 still owns final RBAC and Control
  Panel action composition.

## Locked A2C decisions

### S1 — Definition and attempt state are discriminated

The pure task snapshot uses a closed state object, not an unqualified status string. The definition
path is `draft → awaiting_approval → approved → queued`. The attempt path is
`queued → leased → running`, followed only by the closed wait, cancel, terminal, or recovery rules
below.

Definition `awaiting_approval` and runtime `awaiting_approval` are structurally distinct through the
exact discriminator `approvalContext: definition | runtime`. Every other state rejects that field.
This prevents a runtime resume from approving an unapproved definition and prevents a definition
approval from jumping directly to running.

The closed state codes are `draft`, `awaiting_approval`, `approved`, `queued`, `leased`, `running`,
`awaiting_input`, `cancel_requested`, `passed`, `failed`, `recovery_required`, and `cancelled`.
`passed`, `failed`, and `cancelled` are terminal. `recovery_required` has no automatic exit in A2C.

Only these non-lease transitions are allowed:

- `draft → awaiting_approval(definition)`;
- `awaiting_approval(definition) → approved`;
- `approved → queued`;
- `running → awaiting_input → running`;
- `running → awaiting_approval(runtime) → running`;
- an execution receipt owns `running → passed | failed | recovery_required`;
- a cancellation receipt owns `cancel_requested → cancelled`;
- cancellation without an active worker owns pre-lease state to `cancelled`; and
- a conservative expiry decision may own `leased → queued` only when no execution-start evidence is
  present, or an active attempt state to `recovery_required` otherwise.

There is no generic arbitrary `from/to` mutation API and no illegal rollback path.

### V1 — Every mutation is expected-version checked

Every accepted mutation carries `expectedResourceVersion` and requires exact equality with the
snapshot `resourceVersion`. The version is a positive safe integer. An accepted non-idempotent
mutation makes `resourceVersion increments by exactly one`; overflow is rejected before mutation.

A stale expected version, malformed intent, unsupported transition, integrity conflict, quarantine,
or unavailable recovery authority produces zero state mutation. An exact idempotent replay returns
the existing immutable snapshot without a version increment.

Mutation intents contain exact tenant/task scope, opaque lowercase UUID `actorId`, closed action and
reason codes, lowercase UUID `idempotencyKey`, canonical UTC timestamp, expected version, and a
content hash. A2C validates and hashes the intent but does not decide actor membership or RBAC. A4
persists intent receipts transactionally; A5 authorizes them; P17-021 supplies the final matrix.

### L1 — One bounded active A2B lease

A claim binds exactly one validated A2B execution envelope to one queued task attempt. The base
tenant/task/run/root/parent/attempt/repository/progress-binding identity and operation descriptor
must match the snapshot. The supplied validated worker manifest must contain that exact operation
contract and every required capability. This pure match does not prove enrollment or server RBAC.

There is one active lease per task attempt. A second claim, a second machine, a changed delivery,
or a changed envelope is rejected while the lease is present. Claim observation time must be within
the canonical A2B lease window. Starting requires the same lease before current expiry.

The state module owns a 15-second heartbeat interval. A heartbeat has a unique lowercase UUID,
monotonic canonical observation time, and a requested current expiry. One accepted renewal may add
at most one interval, may not revive an expired lease, and is never past `deadlineAt`. The immutable
A2B envelope and its hash do not change when current lease authority is renewed.

When state is `cancel_requested`, heartbeat returns the cancellation intent and cannot extend lease
authority. Control Plane outage or worker disconnect is not cancellation and grants no offline
renewal or new work.

### C1 — Cancellation is intent-first and cooperative

`requestControlPlaneCancellation` validates a content-addressed cancel intent under CAS. An exact
replay of the same idempotency key and intent hash is idempotent. Reusing the key with different
content is an integrity conflict with zero mutation.

Without an active worker, cancellation moves `draft`, definition approval, `approved`, or `queued`
directly to terminal `cancelled`. With a leased or running/waiting worker it commits
`cancel_requested`; heartbeat returns that intent and the worker later reports a cancellation
receipt. `recovery_required` cannot be cancelled into a false terminal state.

Completion committed before cancellation returns conflict. Cancellation committed before success
quarantines the success receipt. Neither ordering is decided by arrival time outside the committed
resource version.

### R1 — Receipts are unsigned metadata-only content

A2C defines one canonical unsigned metadata-only receipt. Exact content includes schema/contract
version, the complete A2B execution identity, `envelopeHash`, operation code and contract hash,
closed outcome, canonical completion time, `progressBindingHash`, `progressTailHash`, sorted unique
`evidenceHashes`, nullable `resultHash`, and `receiptHash`.

No raw result, prompt, repository path, log, environment value, credential material, stack trace,
provider response, or evidence body is allowed. Evidence count uses the A2A limit. Passed outcomes
require a result hash; cancelled and unknown-outcome receipts forbid one. A3 wraps these canonical
bytes with machine identity and signature without changing content.

Receipt acceptance requires exact active lease, machine, delivery, envelope, operation, task/run,
attempt, repository, progress binding, and hash equality. A2D later proves that the referenced
P17-015 binding, progress tail, and evidence hashes actually exist and belong to the attempt.

### U1 — Recovery is conservative and explicit

An injected journal observation is closed as `not_started`, `receipt_available`,
`execution_started`, or `unknown`. It is evidence input, not authority invented by the state module.
Before expiry the only decision is to wait.

After expiry, no execution-start evidence may reclaim the same attempt by returning it to `queued`
and clearing the active lease. An available receipt is routed to normal receipt validation. A
started read-only operation can only recommend a new-attempt retry owned by A2D. A started
`manual_recovery` operation, an unknown journal outcome, or an expired cancellation becomes
`recovery_required`; an unknown side effect is never auto-dispatched.

Recovery decisions do not create a successor, change lineage, accept a late result, or leave
`recovery_required`. Explicit reconciliation requires A2D ledger proof and later A3/A5 authority.

### I1 — Replay is idempotent or quarantined

Replaying the same receipt is idempotent and returns the existing terminal/recovery snapshot without
a version change. Reusing the same delivery or receipt identity with different content is an
integrity conflict. A conflicting receipt produces zero state mutation.

A matching receipt after current lease expiry is late and quarantined. A success receipt after
`cancel_requested` is quarantined. Quarantine is a pure decision containing only closed reason and
receipt hash; A2C does not mutate the task or persist a quarantine row. No late receipt silently wins.

### Q1 — A2C does not absorb successor ownership

A2C imports A2A/A2B public validators and types only. It lives in a separate pure
`control-plane-state` domain module so the already large registry/envelope module remains cohesive.
The parent implementation plan source-ownership table is updated to name both modules.

A2D owns complete P17-015 binding and retry-lineage proof, including successor absence and linear
attempt creation. A3 owns signatures, keys, and the durable worker journal. A4 owns transactional
persistence, CAS, outbox, quarantine, and intent records. A5 owns auth/RBAC/API composition. A6 owns
the real worker and compiled operation adapters.

### E1 — Evidence is cumulative and immutable

A2C begins with a standalone three-gap readiness RED, then a registered missing-module/export
behavior RED, then focused state/race/attack GREEN. Strict TypeScript, A2A/A2B predecessors,
P17-015, topology, implementation-plan, provider-core neighbors, full kit, exact manifest, and
positive-controlled safety scans run before the source checkpoint.

The source commit is proven at exact SHA. One later metadata-only evidence file is committed with
that source commit as its sole parent. No evidence claim may promote A2D, A3, persistence, remote
execution, Control Panel E2E, sync, push, or target state.

## Exact contracts

### Task snapshot

The immutable snapshot contains exact schema/contract version, base task-attempt identity, exact
operation code/contract hash/replay class, closed discriminated state, positive `resourceVersion`,
nullable active lease, nullable cancellation intent, nullable accepted receipt hash, and nullable
last heartbeat identity. Unknown or accessor/prototype-bearing fields fail closed.

Base identity is the A2B identity without delivery-, lease-, or machine-specific fields. Claim must
prove every shared field against the full envelope before recording its lease.

### Mutation intent

Exact keys are `schemaVersion`, `contractVersion`, `tenantId`, `taskId`, `actorId`, `action`,
`reasonCode`, `idempotencyKey`, `requestedAt`, `expectedResourceVersion`, and `intentHash`. The
action vocabulary is closed to the A2C operations and reason codes contain no free text.

### Lease record

The lease keeps the validated full A2B envelope, `claimedAt`, nullable `startedAt`,
`lastHeartbeatAt`, nullable `lastHeartbeatId`, and `currentExpiresAt`. The envelope is never edited.
Current expiry can only increase under L1 and can never exceed its envelope deadline.

### Receipt

The receipt is canonical fixed-key JSON hashed through `ControlPlaneHashPort`. The full identity and
envelope/operation hashes bind it to one delivery. Hash arrays are lowercase, sorted, unique, and
bounded. Receipt creation and validation normalize nothing and expose no platform import.

### Decision

Every public mutation returns one closed decision: accepted, idempotent, rejected, conflict, or
quarantined. Rejection reasons are closed, stable codes and do not echo caller content. Only accepted
non-idempotent decisions return a snapshot with version plus one.

## Clean Architecture and source ownership

| Layer | A2C owner | Responsibility |
|---|---|---|
| Registry/envelope domain | `packages/core/src/control-plane.ts` | A2A/A2B descriptors, inputs, manifests, envelopes, canonical envelope bytes |
| State/replay domain | `packages/core/src/control-plane-state.ts` | A2C snapshot, intent, lease, heartbeat, cancel, receipt, replay, quarantine, recovery decisions |
| Progress ledger | `packages/core/src/cross-machine-progress.ts` | P17-015 binding/events/evidence; consumed only in A2D |
| Application/persistence | Future A4/A5 ports and dashboard adapters | transactions, RBAC, idempotency table, outbox, quarantine storage |
| Worker journal/crypto | Future A3/A6 modules | signed requests/receipts, local durable execution journal, process boundary |

The state domain may import only relative pure core modules. It has no Node, filesystem, process,
database, HTTP, provider, dashboard, or local P2 orchestration import.

## State and race table

| Existing committed state | Operation | Decision |
|---|---|---|
| `draft` | submit | `awaiting_approval(definition)` |
| `awaiting_approval(definition)` | approve | `approved` |
| `approved` | enqueue | `queued` |
| `queued` | valid claim | `leased` with one A2B envelope |
| `leased` | valid start | `running` |
| `running` | needs input / runtime approval | closed waiting state |
| waiting | matching resume | `running` |
| pre-lease | cancel | terminal `cancelled` |
| active lease | cancel | `cancel_requested`, no further renewal |
| `running` | matching on-time pass/fail receipt | terminal state |
| `cancel_requested` | success receipt | quarantine, zero mutation |
| terminal completion | later cancel | conflict, zero mutation |
| any receipt-bearing state | same receipt replay | idempotent, zero mutation |
| any receipt-bearing state | different receipt | integrity conflict, zero mutation |
| active state after expiry | late receipt | quarantine, zero mutation |
| expired `leased`, journal `not_started` | reclaim | `queued`, lease cleared |
| expired started read-only work | recover | recommend new A2D attempt |
| expired manual/unknown/cancelled work | recover | `recovery_required` |

## Attack and test matrix

The focused suite must cover at least these independent groups:

1. unknown state field, nested extra field, prototype-bearing state, accessor-bearing state, and
   cyclic input;
2. stale expected version, zero/negative/unsafe version, resource version overflow, and mutation of
   rejected input;
3. illegal rollback, skipped approval/queue/lease, definition/runtime approval confusion, wait-kind
   mismatch, and terminal transition;
4. two-worker claim, duplicate lease, changed delivery, envelope identity mismatch, operation drift,
   capability mismatch, and missing capability;
5. claim outside lease window, start after expiry, malformed time, and non-canonical time;
6. heartbeat replay, heartbeat ID conflict, heartbeat rollback, heartbeat after expiry, extension
   over 15 seconds, renewal past deadline, and cancel-state renewal;
7. cancel idempotency conflict, wrong tenant/task/version, completion-before-cancel race,
   cancel-before-success race, recovery cancellation, and worker disconnect;
8. metadata-only receipt exact keys, result/outcome constraints, sorted unique bounded evidence,
   receipt identity mismatch, operation mismatch, progress-binding mismatch, receipt hash tampering,
   and hash-port failure;
9. same receipt replay, conflicting receipt replay, late receipt, cancel-won quarantine, and zero
   mutation for every reject/conflict/quarantine;
10. no-start reclaim, available-receipt routing, read-only retry recommendation, unknown side effect,
    recovery without authority, and no automatic recovery exit;
11. deep freeze, canonical key-order determinism, raw output/path/log/provider fields, credential
    material, platform imports, P2 imports, and P17-015 state duplication; and
12. predecessor/neighbor/full-suite regression plus exact source/evidence commit topology.

Positive controls are mandatory before recording every zero-hit safety claim.

## Implementation and verification sequence

1. Add only the standalone plan validator and prove the exact three-gap readiness RED.
2. Add this plan plus focused/full-kit plan registrations; make S1/V1/L1/C1/R1/U1/I1/Q1/E1
   plan assertions GREEN.
3. Add the registered focused behavior test while the state module is absent; record the missing
   module/export RED.
4. Implement the separate pure state module and update only the parent ownership sentence and core
   README needed to expose the new boundary.
5. Keep the first behavior test unchanged until first GREEN; fix harness-only mistakes separately
   from source defects.
6. Run strict TypeScript, focused plan/behavior gates, A2A/A2B, P17-015, topology, parent plan,
   provider-neutral core neighbors, package/whitespace/safety scans, and full kit.
7. Stage the exact source manifest and create a normal hook-verified local source commit.
8. Re-run the authoritative gates at the exact source SHA; create and validate one metadata-only
   evidence file; commit it separately with the source commit as sole parent.

## A2C source manifest

The source checkpoint may contain only:

- `docs/roadmap/p17-014-a2c-state-lease-replay-plan.md`;
- `scripts/post-17-control-plane-a2c-plan.test.ts`;
- `docs/roadmap/p17-014-control-plane-implementation-plan.md` for the ownership split only;
- `packages/core/src/control-plane-state.ts`;
- `packages/core/test/control-plane-state.test.ts`;
- `packages/core/README.md`; and
- `package.json`.

The evidence checkpoint later contains exactly one new A2C evidence Markdown file.

## Rollback

Before commit, revert only the seven-file source manifest. After commit, revert the A2C source and
evidence commits in reverse order. Do not reset unrelated work and do not extract a full backup over
the workspace. The verified 2026-08-16 daily snapshots remain the disaster-recovery boundary.

## Non-claims

- A2C is not complete at plan time.
- No receipt is signed; A3 owns signatures and durable worker journal behavior.
- No P17-015 binding, event, evidence, retry, or successor is created or proven; A2D owns that work.
- No actor is authorized and no RBAC decision is made.
- No state, intent, lease, receipt, quarantine, or audit row is persisted.
- No operation is executed and remote execution is not enabled.
- No dashboard source change, migration, API, browser, database, worker, provider, distribution,
  deployment, sync, push, merge, target edit, or target `.Codex` edit occurs in A2C.
