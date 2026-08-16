# P17-014 A2B execution-envelope and identity plan

**Status:** Authorized under standing continuation authority — A2B plan-first; no envelope implementation
**Date:** 2026-08-16
**Roadmap task:** P17-014
**Parent:** P17-014 A2A registry/capability contracts, A1 implementation plan, and ADR-003
**Input lock:** `slice=A2B, envelope=E1, identity=I1, operation=O1, timing=T1, evidence=D1, hashing=H1, binding=B1, sequence=Q1, verification=V1`

## Outcome

Implement exactly one unsigned content-addressed execution envelope in the pure Control Plane domain.
The envelope binds one canonical A2A descriptor and validated operation input to tenant-scoped
delivery identity, P17-015-compatible progress identity references, bounded canonical timing, and a
metadata-only evidence destination policy.

A2B is a data and validation boundary. It does not sign the envelope, prove a machine key, create or
renew a lease, change task state, execute an operation, persist data, call P17-015, or communicate
over a network. A3 owns signatures and keys; A2C owns state/lease/cancel/receipt/recovery decisions;
A2D owns complete P17-015 binding proof.

## Reconciled starting state

- A2A is locally complete at source commit `4764c2666547fec10942c857c7fed422c9e38434`
  with separate exact-SHA evidence.
- `packages/core/src/control-plane.ts` owns the closed four-operation registry, descriptor hashes,
  exact inputs, budgets, capability manifest, injected hash port, and closed contract errors.
- P17-015 remains the only progress authority. Its `ProgressRunBinding` owns task, command-run,
  machine, repository, root/parent run, attempt, retention, and binding-hash truth.
- P17-015 uses `P17-000` through `P17-999` task IDs, UUID command/root/parent/machine IDs, a safe
  repository slug, attempts 1–50, and a lowercase binding SHA-256. A canonical repository UUID is
  also valid under its safe-slug boundary.
- P17-015 currently imports Node crypto. A2B must not import that runtime module into the pure Control
  Plane domain or silently clone its event/state semantics.
- P17-016 is still in progress. Pure contracts may continue, while persistence, enrollment, routes,
  and remote execution remain disabled.
- A2A deliberately deferred envelope, state, crypto, persistence, API, worker, distribution, and UI
  implementation to later slices.

## Locked A2B decisions

### E1 — One unsigned content-addressed envelope

The A2B wire payload is exactly one `ControlPlaneExecutionEnvelope` with exact nested schemas. It is
unsigned in A2B: there is no signature or key field. A3 must later wrap or bind these canonical
envelope bytes to an Ed25519 key version without redefining the content hash.

The envelope carries schema/contract version, exact identity, exact operation, exact timing, exact
evidence policy, and lowercase `envelopeHash`. It is at most 256 KiB after canonical validation and
contains no extension map. Unknown, omitted, extra, accessor, prototype, cyclic, or reordered
ordering-sensitive list content fails closed; object key order is canonicalized explicitly.

The envelope is authorization data only after later A3-A5 composition verifies signature, nonce,
tenant policy, machine enrollment, lease state, and persistence. A valid A2B value alone grants no
authority and proves no availability.

### I1 — Tenant and P17-015-compatible identity reference

The exact identity fields are:

- `schemaVersion` = `1`;
- `tenantId` — canonical lowercase UUID;
- `taskId` — `P17-000` through `P17-999`;
- `commandRunId`, `rootRunId`, and optional `parentRunId` — canonical lowercase UUIDs;
- `attempt` — positive integer from 1 through 50;
- `deliveryId` and `leaseId` — distinct canonical lowercase UUIDs;
- `machineId` — canonical lowercase UUID;
- `repositoryId` — canonical lowercase UUID; and
- `progressBindingHash` — lowercase SHA-256 of the separately validated P17-015 binding.

Attempt 1 requires `rootRunId === commandRunId` and `parentRunId === null`. A later attempt requires
a non-null parent, a command run different from its root and parent, and does not claim that the
referenced parent actually exists. A2D performs ledger-aware lineage validation.

Identity values are opaque. Display label, hostname, username, IP, hardware fingerprint, repository
alias/path/URL, provider execution ID, actor, email, secret, credential, and arbitrary metadata are
not accepted. Tenant identity is mandatory even though the existing P17-015 binding is tenant
neutral; A4 later proves tenant ownership through persistence.

### O1 — Exact A2A operation binding

The exact operation fields are `descriptor` and `input`. `descriptor` must be byte-for-byte equal to
the canonical descriptor selected from the supplied, fully validated A2A registry. The input is
validated through `validateControlPlaneOperationInput(descriptor.code, input)` and then frozen.

This embeds the operation code/contract hash, fixed adapter ID/version, sorted required capability
IDs, replay class, and exact resource budget already owned by A2A. The envelope cannot override any
of them or select a provider, runtime path, executable, arguments, environment, credential alias, or
fallback.

For `project_intelligence.inspect`, `workflow_phase.execute`, and `workflow_verify.execute`, the
repository identity must equal the operation input repository identity. `evidence.verify` has no
operation-level repository field but remains bound to the identity repository for tenant/task audit
and later evidence resolution.

### T1 — Canonical bounded timing

The exact timing fields are canonical UTC `issuedAt`, `leaseExpiresAt`, and `deadlineAt`. Their
ordering is `issuedAt < leaseExpiresAt <= deadlineAt`.

The initial lease interval is at most 60 seconds. The deadline interval from issue is at most 30
minutes. A2B uses only supplied timestamps and deterministic comparison; it reads no clock. A2C owns
renewal and must never extend authority past the deadline. A3-A5 later apply current-time, nonce, and
signed-request windows.

Timestamp strings must round-trip through the canonical `YYYY-MM-DDTHH:mm:ss.sssZ` representation.
Offsets, omitted milliseconds, invalid dates, non-finite parse results, and control characters fail
closed.

### D1 — Metadata-only evidence destination policy

The exact evidence policy fields are:

- `mode` = `metadata_only`;
- `sink` = `p17_015_progress`; and
- `retentionClass` = `short_lived` or `standard`.

The policy selects no table, bucket, path, URL, header, credential, region, tenant duration, or
evidence body. The A2A resource budget remains the maximum evidence-reference count. A2D must prove
the retention class equals the complete P17-015 binding; A4/P17-016 later resolves tenant retention
and deletion behavior.

### H1 — Canonical envelope hashing

A2B reuses `ControlPlaneHashPort`; it adds no crypto or platform import. Canonical hashing binds all
validated envelope fields except `envelopeHash` using explicit field order and validated nested
objects. Equivalent explicit inputs produce identical hashes. Changing any identity, descriptor,
operation input, timing, evidence policy, or ordering-sensitive list changes or invalidates the
envelope.

`serializeControlPlaneExecutionEnvelope` validates the complete envelope, then returns the one
canonical UTF-8 JSON text including `envelopeHash`. A3 must use these exact bytes as its signing
payload and may not reserialize, reorder, omit, or add fields.

The port must still produce one lowercase SHA-256. Thrown, malformed, or collapsing hash providers
fail through the A2A registry/hash boundary. Envelope hash mismatch uses the existing closed
`CONTRACT_HASH_MISMATCH` error and never echoes caller values.

### B1 — Deferred P17-015 binding proof

A2B carries a reference, not a copied `ProgressRunBinding` and not a new progress ledger. A2D must
validate the complete P17-015 ProgressRunBinding and prove exact equality for task ID, command run,
machine, repository, root/parent run, attempt, retention class, and binding hash before running state
can be accepted.

A2B validates only self-contained identity and operation invariants. It cannot prove the referenced
binding exists, belongs to the tenant, has the declared runner/provider identity, is the current
linear attempt, or has an acceptable event tail. Those claims remain unavailable until A2D plus
privacy-gated persistence/application composition.

### Q1 — Ordered ownership and successors

1. A2A remains the only registry/input/budget/capability owner.
2. A2B adds identity reference, unsigned envelope, canonical timing, evidence policy, and hash.
3. A2C consumes A2B identity/hash for task, lease, cancellation, receipt, and recovery state.
4. A2D consumes A2B plus the full P17-015 binding/ledger and closes the cumulative A2 audit.
5. A3 consumes A2B canonical bytes for signatures and worker-journal ports.

A2C may not redefine the envelope or P17-015 progress state. A3 may not mutate content while
signing. Later application/runtime adapters may resolve opaque identities but may not widen the wire
schema.

### V1 — Evidence and mutation discipline

A2B begins with this executable plan gate and a missing-export behavior RED. Tests cover every exact
field, all four operations, attempt-1 and retry identity, timestamp boundaries, evidence policy,
deterministic hashing/freezing, property-style permutations, and named attacks. Strict TypeScript
uses `skipLibCheck=false` at the exact source/test/plan boundary.

The A2A plan/domain, P17-015 progress, topology/A1, Project Intelligence, Workflow Orchestrator,
provider bundle, and full-kit gates remain companions. Exact manifests, positive-controlled scans,
and separate source/evidence commits are required. No mock may claim signing, persistence, worker,
network, or P17-015 binding proof.

## Exact contracts

### `ControlPlaneExecutionIdentity`

Exact keys: `schemaVersion`, `tenantId`, `taskId`, `commandRunId`, `rootRunId`, `parentRunId`,
`attempt`, `deliveryId`, `leaseId`, `machineId`, `repositoryId`, and `progressBindingHash`.

### `ControlPlaneExecutionOperation`

Exact keys: canonical A2A `descriptor` and validated `input`. The descriptor code selects the input
validator; no caller-supplied discriminator or adapter override exists.

### `ControlPlaneExecutionTiming`

Exact keys: `issuedAt`, `leaseExpiresAt`, and `deadlineAt`, with the canonical and interval rules in
T1.

### `ControlPlaneEvidencePolicy`

Exact keys: `mode`, `sink`, and `retentionClass`, with no destination locator.

### `ControlPlaneExecutionEnvelope`

Exact keys: `schemaVersion`, `contractVersion`, `identity`, `operation`, `timing`, `evidencePolicy`,
and `envelopeHash`. Its canonical serialized size, including the hash, cannot exceed 256 KiB.

### Canonical serializer

`serializeControlPlaneExecutionEnvelope` accepts an unknown envelope plus the canonical registry and
hash port, performs the same complete validation, and returns canonical JSON text including the
validated envelope hash. It performs no encoding, signing, I/O, or runtime detection.

### Creation input

The creator accepts exact `identity`, `operationCode`, `operationInput`, `timing`, and
`evidencePolicy` fields plus the separately supplied canonical registry and hash port. It derives the
descriptor and hash; a caller cannot supply either.

## Clean Architecture and source ownership

`packages/core/src/control-plane.ts` remains the only A2B domain source. It may use built-in language
types and the existing injected hash port. It imports no Node, filesystem, process, environment,
network, provider, dashboard, progress-runtime, or platform module.

`packages/core/test/control-plane-envelope.test.ts` owns focused behavior/attack proof. The root
package owns registration, and `packages/core/README.md` documents unsigned/no-authority semantics.
No dashboard source change is needed in A2B; mirroring waits for a reviewed server consumer and an
atomic generator/checker.

## Attack and test matrix

- unknown envelope field, omitted field, extra nested field, prototype-bearing object,
  accessor-bearing object, cyclic object, array/object confusion, and unsupported version;
- malformed tenant, uppercase UUID, invalid task ID, zero/overflow attempt, invalid attempt lineage,
  equal delivery/lease IDs, invalid binding hash, and repository mismatch;
- operation descriptor drift, operation/contract hash drift, operation input drift, wrong content
  purpose, capability reordering, budget/adapter/replay drift, and an operation input for another
  code;
- invalid timestamp, non-canonical offset, issue/expiry/deadline equality or reversal, lease past
  deadline, lease interval overflow, and deadline overflow;
- evidence policy drift, unknown sink/mode/retention, extra destination locator, and retention
  mismatch deferred honestly to A2D;
- envelope hash tampering, hash-port failure, malformed/collapsing hash output, non-deterministic
  creation, post-create mutation, and oversized canonical envelope;
- raw path, URL, header, shell, executable, argv, environment, secret, credential alias, hostname,
  IP, email, provider output, log, prompt, spec, signature, key, nonce, and generic message fields.

Every zero-hit source claim uses a positive control or an independent matcher. Closed errors identify
only a contract category and do not echo injected markers.

## Implementation and verification sequence

1. Run this validator RED on the missing plan/registrations; add only the plan and registrations;
   require GREEN.
2. Add the focused envelope test against missing exports and record behavior RED.
3. Add constants/types, exact identity validation, timing validation, evidence policy, canonical
   operation binding, create/validate/hash/size/freezing behavior, and the canonical serializer in
   that order.
4. Keep positive and attack expectations stable through first GREEN; strengthen any review finding
   with a regression before changing production code.
5. Run strict TypeScript, A2A/P17-015/topology/A1/neighbor companions, exact scans, and full kit.
6. Create a local six-file source commit, repeat exact-SHA proof, then add one metadata-only evidence
   file in a separate commit.

## A2B source manifest

The source checkpoint may contain only:

- `docs/roadmap/p17-014-a2b-execution-envelope-plan.md`;
- `scripts/post-17-control-plane-a2b-plan.test.ts`;
- `packages/core/src/control-plane.ts`;
- `packages/core/test/control-plane-envelope.test.ts`;
- `packages/core/README.md`; and
- `package.json` focused/full-suite registrations.

Closeout adds one kit evidence file and handoff entries. No dashboard file changes in A2B.

## Rollback

Before commit, restore only the six-file A2B manifest from the verified 2026-08-16 backup or discard
its isolated changes while preserving unrelated work. After local commit, revert the A2B source and
evidence commits. No database, migration, external state, generated bundle, dashboard, target, or
deployment rollback exists because A2B creates none.

## Non-claims

A2B does not claim the envelope is signed, a machine/key/nonce is authenticated, a P17-015 binding
exists or matches, a tenant owns the binding, a task/lease/state/receipt/journal exists, an adapter is
installed, a worker is available, an operation ran, persistence/API/UI exists, remote execution is
enabled, or A2B/P17-014 is complete beyond this scoped checkpoint.

No signature, key, nonce, current-clock check, state transition, lease claim/renewal, cancellation,
receipt, recovery, progress write, database, migration, browser, network, provider, worker process,
plugin/bundle change, deployment, sync, push, merge, target edit, or target `.Codex` modification
occurs in A2B.
