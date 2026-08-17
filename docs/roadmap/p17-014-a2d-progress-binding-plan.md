# P17-014 A2D — P17-015 Progress Binding, Receipt, and Linear-Retry Proof Plan

**Date:** 2026-08-16
**Status:** Authorized under standing continuation authority — A2D plan-first; no progress-proof implementation
**Parent:** `docs/roadmap/p17-014-control-plane-implementation-plan.md`
**Predecessors:** A2B envelope source `3e1d016914f3ad8896b6d97e255b863f14473ce4`; A2C state source `3b5ed4369e0c512802c2489f53d182caee52bbdf`; completed P17-015 progress ledger
**Input lock:** `slice=A2D, progress=P1, repository=R1, binding=B1, projection=S1, receipt=C1, retry=L1, hashing=H1, sequence=Q1, evidence=E1`

## Outcome

A2D closes the cumulative A2 pure-contract layer by proving that one A2B execution envelope and
one A2C state/receipt/recovery decision refer to the current immutable P17-015 binding, hash-chained
event tail, bounded evidence reference, and linear retry lineage.

The slice produces three content-addressed metadata proofs: binding/projection, terminal receipt,
and retry successor. It neither appends a P17-015 event nor creates a database row. The real P17-015
validator remains the source of truth for binding hashes, event hashes, transition legality, evidence
identity, and lineage.

## Reconciled starting state

- A2A owns exact operations, budgets, capabilities, inputs, and worker manifests.
- A2B owns the unsigned execution envelope and its task/run/root/parent/attempt/delivery/lease/
  machine/repository/progress-binding identity.
- A2C owns task state, expected-version CAS, active lease, heartbeat, cancellation, unsigned receipt,
  quarantine, and conservative recovery decisions.
- P17-015 owns `ProgressRunBinding`, `ProgressEvent`, `EvidenceRef`, `ProgressLedger`, canonical hashes,
  event chains, current-attempt resolution, and linear retry validation.
- P17-015 intentionally stores a configured `repoId` slug, while A2B intentionally carries a
  canonical repository UUID. Equality cannot be guessed from those different representations.
- P17-015 is tenant-neutral and imports Node crypto. A2D must not claim tenant row ownership or add a
  runtime dependency from the pure Control Plane domain to that module.
- P17-016 still gates tenant persistence and remote execution. A3 still owns signing and the durable
  worker journal.

## Locked A2D decisions

### P1 — Real P17-015 validation stays behind a pure port

`control-plane-progress.ts` defines a type-only `ControlPlaneProgressLedgerPort`. Its single method
accepts an opaque ledger plus expected task ID and returns the validated P17-015 task view. The A2D
domain has no emitted `cross-machine-progress` import and no Node/platform import.

Focused and integration tests compose the port with the real `buildProgressTaskView`. Therefore the
proof exercises the actual P17-015 binding hash, event hash, evidence, transition, clock, and linear
retry rules. Port exceptions become one closed non-echoing error. A malformed ledger-port view is
rejected structurally before any field is trusted.

The port is an application boundary, not a second progress implementation. A5 later wires the same
boundary to tenant-scoped repositories; A6 wires it to worker/application flows.

### R1 — Repository UUID and progress slug require an explicit mapping

A2D defines one tenant-bound content-addressed repository mapping with exact fields:

- schema and contract version;
- A2B `tenantId`;
- canonical lowercase UUID `repositoryId`;
- safe configured P17-015 `progressRepoId`; and
- lowercase `repositoryBindingHash`.

The mapping is canonical JSON hashed through `ControlPlaneHashPort`. It contains no path, URL,
hostname, credential alias, provider token, or filesystem locator. It proves only that the caller has
selected one explicit UUID/slug pair for a tenant. A4 proves tenant row ownership and persistence;
A2D does not.

### B1 — Binding proof matches every shared immutable field

`createControlPlaneProgressBindingProof` validates the A2B envelope, A2C snapshot, repository mapping,
and P17 view, then requires exact equality for:

The shared immutable identity and policy field names are `taskId`, `commandRunId`, `rootRunId`,
`parentRunId`, `attempt`, `machineId`, `progressBindingHash`, and `retentionClass`.

- task ID, command run ID, root run ID, parent run ID, and attempt;
- machine ID and `progressBindingHash`;
- mapped repository UUID/slug;
- A2B evidence-policy retention class versus P17 binding retention class;
- `createdAt <= issuedAt`;
- the current linear attempt and its non-null event tail; and
- A2C state projection at that tail.

`runner` and `providerExecutionId` remain committed by the P17-015 binding hash. The proof records
both exact bounded values but does not invent an expected provider policy that A2B does not contain.
Later application policy may additionally restrict them without changing this binding proof.

If an A2C snapshot already has a lease, its immutable envelope hash must equal the supplied envelope.
A queued post-reclaim snapshot may prove a new envelope only against the same immutable P17 machine
binding; moving to a different machine requires a new P17 attempt.

### S1 — State projection composes; it does not copy P17-015

Definition states have no progress projection and are rejected by A2D. Closed projections are:

- A2C `queued` or `leased` → P17 `queued`;
- A2C `running` → P17 `running`;
- A2C `awaiting_input` → P17 `awaiting_input`;
- A2C runtime `awaiting_approval` → P17 `awaiting_approval`;
- A2C `passed`, `failed`, or `cancelled` → the same P17 terminal state.

`cancel_requested` does not invent a P17-015 state. It permits only the already committed active tail
`running`, `awaiting_input`, or `awaiting_approval` until a cancellation receipt/event becomes
terminal. `recovery_required` has no ordinary projection and must use receipt/retry/reconciliation
proof instead of pretending that recovery is a progress state.

A2D never exports a competing progress-state enum or transition table. It compares A2C discriminated
state to the actual P17 view returned by the port.

### C1 — Receipt proof closes tail and evidence references

`createControlPlaneReceiptProgressProof` validates the A2C terminal/recovery snapshot and canonical
A2C receipt against the same A2B envelope, then rebuilds the current P17 view through P1.

It requires:

- receipt identity, envelope, operation, progress binding, and accepted receipt hash match;
- `progressTailHash` equals the exact latest P17 event hash;
- `evidenceHashes` equal the terminal P17-015 evidence set exactly: zero hashes for no evidence or
  one hash for the single terminal `EvidenceRef`;
- passed → P17 `passed` with verified evidence and A2C `passed`;
- failed → P17 `failed` and A2C `failed`;
- cancelled → P17 `cancelled` and A2C `cancelled`; and
- `unknown_outcome` maps only to `tracking_failed` with A2C `recovery_required`.

No evidence body is copied. A terminal state, tail, or evidence mismatch produces a closed rejection,
never a repaired receipt or partial proof.

### L1 — Retry proof adds exactly one linear successor

`createControlPlaneRetryProgressProof` receives the parent A2C snapshot, the same injected recovery
observation used by A2C, the current P17 ledger, a proposed successor ledger, the successor A2B
envelope, and the repository mapping.

It calls the real A2C recovery decision and proceeds only when the action is `retry_new_attempt`.
The current P17 attempt must be terminal and non-passed. The proposed ledger must preserve the entire
prior ledger prefix unchanged, then add exactly one successor binding and queued `retry_started`
event. The real P17 validator must accept that ledger, thereby rejecting a sibling retry, cycle,
ordinal gap, non-terminal parent, changed root, or changed exact parent.

The entire prior ledger prefix is unchanged; this is an exact binding/event-tail invariant, not a
best-effort comparison.

The successor must bind a new command run, delivery, and lease; use `attempt = parent + 1`; retain
task, tenant, root, repository mapping, retention, and operation; name the exact prior command run as
parent; and may use the same or a new machine only through the new P17 binding. The successor becomes
the current linear attempt. A2D returns proof metadata but does not persist the binding or dispatch.

### H1 — Every proof is content-addressed

Repository mapping, binding proof, receipt-progress proof, and retry-progress proof use fixed-key
canonical JSON and `ControlPlaneHashPort`. Each has a lowercase SHA-256 hash and deep-frozen output.

Proof hashes bind the relevant envelope, repository mapping, P17 binding, current event tail, ledger
hash, receipt hash/evidence set, or parent/successor identity. Hash failure, malformed output, key-order
permutation, or proof hash tampering fails closed without echoing caller content.

### Q1 — A2D closes A2 without absorbing A3+

After A2D, A2 has exact operations, envelope, state/replay, and P17 progress composition. A3 owns
signatures, keys, nonce/time-window authority, and durable journal behavior. A4 owns tenant-scoped
persistence, mapping rows, CAS, outbox, and quarantine. A5 owns authenticated application/API
composition. A6 owns the real worker and provider distribution. A7 owns network-separated E2E.

A3 owns signatures, keys, and durable journal behavior; A2D produces unsigned proof metadata only.

A2D changes no P17-015 schema, writer, migration, dashboard repository, or UI. No dashboard source
change is permitted in this slice.

### E1 — Evidence composes the real predecessor

A2D begins with a three-gap plan RED and a missing-module/export behavior RED. Focused tests must use
the real P17-015 `buildProgressTaskView` adapter for positive and adversarial ledgers, not a mock that
claims ledger validity.

Evidence then includes strict TypeScript, plan/focused tests, A2A/A2B/A2C, P17-015, topology/parent/
roadmap/C5A, provider-neutral neighbors, exact manifest/static scans, full kit, a hook-verified local
source commit, exact-SHA reruns, and one separate metadata-only evidence commit.

## Exact contracts

### Progress ledger port

The type-only port exposes `buildTaskView(ledger, expectedTaskId): unknown`. A2D catches every thrown
value, validates a plain closed view, and emits no source-specific error. The production domain never
imports or re-exports the P17 runtime function.

### Repository mapping

Creation and validation use exact keys and canonical hashing. Tenant/repository IDs are lowercase
UUIDs; `progressRepoId` uses the P17 safe-slug vocabulary. Unknown fields and unsafe locators fail.

### Binding proof

The proof contains schema/contract version, tenant/task/run/attempt, envelope hash, progress binding
hash, repository binding hash, runner, nullable provider execution ID, progress state, event tail,
ledger hash, and proof hash. It contains no event/evidence body.

### Receipt-progress proof

The proof adds receipt hash, terminal outcome, terminal state, exact sorted evidence hash list, event
tail, ledger hash, and proof hash. The receipt and P17 evidence metadata remain separate validated
inputs; proof output copies hashes only.

### Retry-progress proof

The proof binds parent and successor envelope/binding/event/ledger hashes, exact attempt/root/parent,
repository binding, recovery action, and proof hash. It creates no binding, event, envelope, or row.

## Clean Architecture and source ownership

| Layer | A2D owner | Responsibility |
|---|---|---|
| Registry/envelope | `packages/core/src/control-plane.ts` | A2A/A2B immutable operation and envelope contract |
| State/replay | `packages/core/src/control-plane-state.ts` | A2C CAS, lease, cancel, receipt, and recovery decisions |
| Progress composition | `packages/core/src/control-plane-progress.ts` | A2D repository mapping and binding/receipt/retry proofs through an injected port |
| Progress authority | `packages/core/src/cross-machine-progress.ts` | P17-015 canonical binding/event/evidence/ledger validation |
| Runtime composition | Future A5/A6 adapters | construct the port from a repository and the real P17 validator |

The only P17 dependency in the A2D source is type-only. Emitted A2D JavaScript has relative imports
only to the A2B/A2C pure Control Plane modules.

## Projection and retry tables

| A2C state | Required P17 tail | Result |
|---|---|---|
| definition state | none | proof unavailable |
| `queued` / `leased` | `queued` | binding proof |
| `running` | `running` | binding proof |
| `awaiting_input` | `awaiting_input` | binding proof |
| runtime `awaiting_approval` | `awaiting_approval` | binding proof |
| `cancel_requested` | active non-terminal tail | binding proof preserves cancellation separately |
| `passed` / `failed` / `cancelled` | matching terminal | receipt proof required for terminal receipt claims |
| `recovery_required` | `tracking_failed` only for unknown receipt | receipt/reconciliation proof, never ordinary projection |

| Retry condition | Required result |
|---|---|
| A2C recovery is not `retry_new_attempt` | reject, zero proof |
| P17 parent is non-terminal or passed | reject |
| proposed ledger changes any prior binding/event tail | reject |
| proposed ledger adds zero or more than one attempt | reject |
| proposed child is not exact next/root/parent | real P17 validator rejects |
| proposed first event is not queued/retry_started | reject |
| successor envelope/binding identity differs | reject |
| all checks pass | content-addressed retry proof only |

## Attack and test matrix

The focused suite must cover at least:

1. ledger-port exception, malformed ledger-port view, prototype/accessor/cycle output, extra view key,
   and inconsistent event counts;
2. forged task identity, forged tenant mapping, repository UUID mismatch, progress slug mismatch,
   repository mapping hash tampering, unsafe slug/path/URL, and hash-port failure;
3. binding hash mismatch, machine mismatch, run mismatch, root or parent mismatch, attempt mismatch,
   retention mismatch, binding created after envelope, non-current attempt, and missing event tail;
4. every valid state projection plus definition-state, cancel-requested, recovery-required, and state
   projection mismatch attacks;
5. receipt tail mismatch, receipt evidence mismatch, unverified passed evidence, terminal outcome
   mismatch, unknown outcome drift, wrong accepted receipt hash, and proof hash tampering;
6. retry without A2C recovery decision, non-terminal retry parent, passed retry parent, changed prior
   ledger prefix, sibling retry, retry ordinal gap, changed retry root or parent, reused command run,
   reused delivery or lease, successor state or reason drift, and successor binding mismatch;
7. canonical key-order permutation, deep freeze, hash-port exception/invalid output/constant collision,
   raw evidence body, credential material, absolute locator, and platform import; and
8. predecessor/neighbor/full-suite regressions plus exact source/evidence commit topology.

Every zero-hit safety claim requires a positive control.

## Implementation and verification sequence

1. Add only the standalone validator and prove exactly three missing plan/registration gaps.
2. Add this plan and focused/full-kit plan registrations; make P1/R1/B1/S1/C1/L1/H1/Q1/E1 GREEN.
3. Add/register the focused behavior suite while `control-plane-progress.ts` is absent; record the
   missing-module/export RED.
4. Implement only the pure progress-composition module, parent ownership row, and core README.
5. Keep the behavior test unchanged through first execution; separate fixture/harness corrections
   from production defects.
6. Run strict TypeScript, A2A/A2B/A2C/P17-015, topology/parent/roadmap/C5A, provider-neutral neighbors,
   exact manifest/static scans, and full kit.
7. Commit the exact source manifest normally, rerun every authoritative gate at the exact SHA, then
   add and commit one metadata-only evidence file with source as sole parent.

## A2D source manifest

The source checkpoint may contain only:

- `docs/roadmap/p17-014-a2d-progress-binding-plan.md`;
- `scripts/post-17-control-plane-a2d-plan.test.ts`;
- `docs/roadmap/p17-014-control-plane-implementation-plan.md` for one ownership row only;
- `packages/core/src/control-plane-progress.ts`;
- `packages/core/test/control-plane-progress.test.ts`;
- `packages/core/README.md`; and
- `package.json`.

The evidence checkpoint later contains exactly one new A2D evidence Markdown file.

## Rollback

Before commit, revert only the seven-file A2D source manifest. After commit, revert the evidence and
source commits in reverse order. Do not reset unrelated work or extract a full snapshot over the
workspace. The verified 2026-08-16 backups remain the disaster-recovery boundary.

## Non-claims

- A2D is not complete at plan time.
- A2D does not append or persist P17-015 bindings, events, evidence, or retries.
- Tenant row ownership is not proven; A4/P17-016 owns that proof.
- No request or receipt is signed; A3 owns crypto and durable journal behavior.
- No actor/provider/worker is authenticated or authorized.
- No state/ledger row, migration, transaction, outbox, quarantine, route, API, worker, provider,
  dashboard, UI, database, browser, network, distribution, deployment, sync, push, merge, target, or
  target `.Codex` action occurs.
- Remote execution is not enabled.
