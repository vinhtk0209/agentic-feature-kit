# P17-014 A2A operation registry and capability-manifest plan

**Status:** Authorized under standing continuation authority — A2A plan-first; no runtime implementation
**Date:** 2026-08-16
**Roadmap task:** P17-014
**Parent:** P17-014 A1 implementation plan and ADR-003
**Input lock:** `slice=A2A, registry=R1, capability=C1, input=I1, budget=B1, hashing=H1, availability=A1, sequence=Q1, evidence=E1`

## Outcome

Implement the smallest security-bearing part of the P17-014 shared domain: exactly four closed
operation descriptors, their opaque bounded inputs and resource budgets, plus a deterministic worker
capability manifest. The registry says what the protocol can describe. A manifest says what one
future worker explicitly claims it has installed. Registry presence alone does not prove an adapter
is installed, a worker exists, or remote execution is available.

A2A creates pure contracts only. It does not implement the execution envelope, tenant/task/run/
attempt/delivery/lease identities, state machine, signatures, worker journal, application ports,
server persistence, API, worker process, provider distribution, or dashboard UI. Those remain in
A2B-A2D and A3-A7.

## Reconciled starting state

- `packages/core/src/control-plane.ts` does not exist.
- Project Intelligence, Workflow Orchestrator, P17-015 progress, privacy policy/writer, and provider
  build sources already exist and retain their current ownership.
- Project Intelligence is a real read-only runtime but resolves a local repository root; the Control
  Plane may send only an opaque repository identity.
- Workflow Orchestrator owns phase/gate/evidence semantics; the Control Plane must not fork those
  rules or transport raw phase bodies.
- P17-015 owns run/attempt/machine/evidence identity. A2A defines no competing identity or progress
  event.
- P17-016 remains in progress and blocks persistence and remote execution.
- The root package owns dependencies and scripts; `packages/core` has no package-local manifest.
- Provider distribution already builds selected shared runtimes. A2A does not add a bundle or plugin;
  distribution waits for A6.

## Locked A2A decisions

### R1 — Exact four-operation registry

The canonical registry contains exactly these codes:

1. `project_intelligence.inspect`;
2. `workflow_phase.execute`;
3. `workflow_verify.execute`; and
4. `evidence.verify`.

Every descriptor has exact keys: schema/contract version, operation code, fixed adapter ID and
version, input kind, sorted required capability IDs, replay class, resource budget, and operation
contract hash. The hash binds every descriptor field except itself. The registry is canonical and
sorted by operation code. Duplicate, missing, extra, reordered, unknown, or hash-drifted descriptors
fail closed.

Adapter IDs are identifiers for later compiled adapters, not executable paths. No descriptor stores
an executable, argv, environment, path, URL, header, credential alias, or provider secret. The
registry is data and validation only; it performs no dynamic import or adapter discovery.

### C1 — Explicit worker capability manifest

A future worker capability manifest is created only from an explicit list of installed operation
codes and active capability IDs supplied by a composition root. It is a strict subset of the
registry. Each advertised operation repeats the exact operation code and contract hash pair plus
the fixed adapter ID/version, so version or contract drift cannot be hidden behind the same code.
The worker manifest is a strict subset of the registry.

Capability IDs are closed and sorted:

- `repository.read`;
- `project_intelligence.inspect`;
- `workflow_orchestrator.execute`;
- `provider.execute`;
- `workflow_verification.execute`; and
- `evidence.verify`.

The manifest rejects an operation when any required capability is absent. It rejects duplicate,
unknown, unsorted, extra, or changed entries. A manifest contains only schema/contract version,
worker semantic version, operation entries, capability IDs, and manifest hash. It contains no
machine, tenant, hostname, OS, repository alias, credential, provider token, or environment value.

Creating or validating a manifest does not inspect installed files or assert that an adapter really
exists. A6 must bind an actual compiled adapter inventory to this contract before runtime
availability can be claimed.

### I1 — Opaque bounded operation inputs

All operation input objects are schema version 1 with exact keys:

| Operation | Exact input |
|---|---|
| `project_intelligence.inspect` | `schemaVersion`, opaque `repositoryId` |
| `workflow_phase.execute` | `schemaVersion`, opaque `repositoryId`, bounded `phaseId`, `phaseEnvelope` content reference |
| `workflow_verify.execute` | `schemaVersion`, opaque `repositoryId`, `verificationRequest` content reference |
| `evidence.verify` | `schemaVersion`, `evidence` content reference |

`repositoryId` is an opaque UUID. A content reference has exact `schemaVersion`, opaque UUID
`referenceId`, closed `purpose`, lowercase SHA-256, closed media type, and bounded byte count. Its
purpose must match the operation field: `phase_envelope`, `verification_request`, or `evidence`.

The canonical operation input is at most 32 KiB and a referenced body is at most 64 MiB. The body is
not embedded. There is no alias, path, URL, header, secret, credential, shell, executable, argv,
environment, or free text. A later worker resolves opaque repository/content identities only through
local or server application ports.

### B1 — Hard resource budgets

Every descriptor carries exact positive integer limits and a closed profile ID. Global maxima are
30 minutes wall time, 256 KiB result metadata, 16 evidence references, and 200 progress events.

| Operation | Profile | Wall time | Result bytes | Evidence refs | Progress events |
|---|---|---:|---:|---:|---:|
| `project_intelligence.inspect` | `inspect_small` | 60,000 ms | 262,144 | 4 | 20 |
| `workflow_phase.execute` | `workflow_standard` | 1,800,000 ms | 262,144 | 16 | 200 |
| `workflow_verify.execute` | `verification_standard` | 900,000 ms | 262,144 | 16 | 200 |
| `evidence.verify` | `evidence_small` | 120,000 ms | 65,536 | 4 | 20 |

These budgets are contract limits, not proof of process enforcement. A6 must apply stricter local
timeouts/resource controls where required and must never expand a signed budget.

### H1 — Injected deterministic hashing

The domain defines `ControlPlaneHashPort` with one synchronous SHA-256 operation over canonical UTF-8
text. The core imports no Node, filesystem, process, environment, network, provider, dashboard, or
platform import. Tests inject the repository's Node SHA-256 primitive; A3 will own production crypto
adapters.

Canonicalization uses explicit field order for each contract. The port must return exactly one
lowercase SHA-256 value. A thrown port error or malformed result becomes a closed `HASH_UNAVAILABLE`
contract error without echoing source input. Contract and manifest hash mismatches have separate
closed reason codes.

### A1 — Registration is not runtime availability

The canonical registry is protocol vocabulary. A worker manifest is an explicit configuration
claim. Neither is runtime proof. A2A exposes no `isAvailable=true` flag, auto-discovery, filesystem
probe, environment fallback, provider check, worker start, or network call.

Only later composition may prove a descriptor has one compiled adapter, verify its build hash, and
construct a manifest. Missing capability remains unavailable; it never falls back to a generic shell,
local path, default provider, global credential, or unregistered adapter.

### Q1 — A2 sub-slice sequence

1. A2A registry and capability manifest;
2. A2B execution envelope and identity;
3. A2C task, lease, cancellation, receipt, and recovery state; and
4. A2D P17-015 binding plus complete A2 audit.

A2B must consume the A2A operation code/hash/input/budget contracts. A2C must consume A2B identity
and may not redefine registry or progress semantics. A2D proves the combined pure core and updates
distribution inputs only if its separately reviewed manifest requires them.

### E1 — Evidence and mutation discipline

A2A starts with this executable plan gate, then a missing-module behavior RED. Tests cover positive
contracts, property-style permutations, mutation of every exact field, and named attacks. Strict
TypeScript uses `skipLibCheck=false` at the exact boundary. Full kit regression, exact manifests,
positive-controlled secret/internal/path scans, and separate source/evidence commits are required.

No database, network, browser, provider, process, sync, deployment, or target action may be used as
A2A evidence. Mocks do not claim an adapter exists; the hash fixture proves only deterministic
contract behavior.

## Exact contracts

### Operation descriptor

The operation descriptor fields are:

- `schemaVersion` = `1`;
- `contractVersion` = `1.0.0`;
- closed `code`, `adapterId`, `adapterVersion`, and `inputKind`;
- sorted exact `requiredCapabilities`;
- `replayClass` = `read_only` or `manual_recovery`;
- exact `resourceBudget`; and
- lowercase `contractHash` over every prior field.

`project_intelligence.inspect` and `evidence.verify` are `read_only`. Workflow phase and verification
are `manual_recovery`; A2A does not claim they are idempotent or safe to auto-replay.

### Resource budget

The exact budget fields are profile ID, maximum wall time, maximum result-metadata bytes, maximum
evidence references, and maximum progress events. Values outside the locked table or global bounds
are contract drift, not a caller-selectable enlargement.

### Worker capability manifest

The exact manifest fields are schema/contract version, semantic `workerVersion`, sorted operation
entries, sorted capability IDs, and `manifestHash`. The hash binds the complete manifest except
itself. An empty manifest is valid and means the worker advertises no operation. It does not mean
offline workflows are unavailable.

### Closed error reasons

The domain exposes only: `INVALID_SHAPE`, `UNSUPPORTED_VERSION`, `UNKNOWN_OPERATION`,
`UNKNOWN_CAPABILITY`, `DUPLICATE_VALUE`, `NON_CANONICAL_ORDER`, `CONTRACT_HASH_MISMATCH`,
`MANIFEST_HASH_MISMATCH`, `MISSING_CAPABILITY`, `LIMIT_EXCEEDED`, and `HASH_UNAVAILABLE`.
Messages identify the contract category and never echo caller values.

## Clean Architecture and source ownership

`packages/core/src/control-plane.ts` is the only A2A domain source. It may use built-in language
types, deterministic pure functions, and injected `ControlPlaneHashPort`. It imports no other kit
runtime because A2A references existing operation ownership by stable identifiers, not by executing
or cloning those modules.

`packages/core/test/control-plane.test.ts` owns the focused behavior/attack proof. The root
`package.json` owns registration. `packages/core/README.md` documents availability semantics. No
dashboard source change is needed in A2A; dashboard mirroring waits for the first server consumer and
must use an atomic generator/checker rather than manual copying.

## Attack and test matrix

- duplicate operation code, missing descriptor, unknown operation, changed adapter/input/replay/
  budget field, contract hash tampering, and non-canonical order;
- duplicate capability, unknown capability, missing required capability, operation/hash mismatch,
  extra manifest operation, manifest hash tampering, and malformed worker version;
- unknown top-level field, unknown nested field, prototype-bearing object, array/object confusion,
  unsupported schema/contract version, non-integer/negative/over-global budget;
- malformed UUID, uppercase/short hash, oversized content reference, oversized canonical input,
  mismatched content purpose, unknown media type, and non-canonical timestamp-like/free-text data;
- raw path, URL, header, shell, executable, argv, environment, secret, and credential alias injection;
- hash-port failure, malformed hash-port output, constant malicious hash, and mutation after create;
- permutation/property tests proving only canonical sorted lists pass and equivalent explicit inputs
  produce the same descriptor/manifest hashes.

Every zero-hit source claim requires a positive control or independent matcher. Tests must prove
errors do not echo injected raw values.

## Implementation and verification sequence

1. Run this validator RED on missing plan/registrations; add plan and registrations; require GREEN.
2. Add the focused test importing the absent core; record the missing-module RED.
3. Implement exact errors, plain-object/exact-key checks, bounds, content references, operation
   inputs, budgets, registry, hash port, and worker manifest in that order.
4. Keep the focused tests unchanged through the first GREEN; add attacks only to strengthen, never to
   relax a failing contract.
5. Run strict TypeScript 5.9.3 with `skipLibCheck=false`, predecessor A1/topology/progress/project/
   orchestrator/provider gates, then full kit.
6. Review exact source/secret/diff manifests, create a local source commit, run exact-SHA proof, and
   create a separate metadata-only evidence commit.

## A2A source manifest

The source checkpoint may contain only:

- `docs/roadmap/p17-014-a2a-registry-capability-plan.md`;
- `scripts/post-17-control-plane-a2a-plan.test.ts`;
- `packages/core/src/control-plane.ts`;
- `packages/core/test/control-plane.test.ts`;
- `packages/core/README.md`; and
- `package.json` focused/full-suite registrations.

Closeout adds one kit evidence file and handoff entries. No dashboard file changes in A2A.

## Rollback

Before commit, restore only the six-file A2A manifest from the daily backup or discard its isolated
changes while preserving unrelated work. After local commit, revert the A2A source commit and its
evidence commit. No migration, external state, generated provider distribution, target, or dashboard
rollback exists because A2A creates none.

## Non-claims

A2A does not claim an operation adapter is installed, a worker manifest reflects a real build, an
execution envelope exists, a task can be approved or claimed, a lease/state/receipt/journal exists,
P17-015 is wired to delivery, signatures or keys exist, persistence/API/UI exists, provider bundles
changed, remote execution is enabled, or P17-014 is complete.

No runtime implementation, database, migration, browser, network, provider, worker process, key,
route, deployment, sync, push, merge, target edit, or target `.Codex` modification occurs in A2A.
