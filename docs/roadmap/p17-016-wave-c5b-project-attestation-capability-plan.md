# P17-016 Wave C5B Project-Attestation Capability Plan

Date: 2026-08-20
Status: implementation locked; local capability only
Parent: `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`
Dependency: merged C5B operator application contract
Scope lock: `boundary=A1, identity=E1, timeout=B1, match=I1, replay=R1, receipt=T1, integration=O1, result=M1, runtime=N1`

## Context

The canonical C5B sequence starts with `attest_project`, and the parent plan requires an
infrastructure adapter to receive the operator-approved project identity through an ephemeral
channel, independently derive the observed project identity, compare both values in memory, and
return metadata only. The current shared core correctly stops after a `projectMatch=false` receipt,
but its generic `attestProject` port can still self-assert `{ projectMatch: true }`. No production
capability currently proves that approved and observed identities came from distinct inputs.

The project receipt also omits the `attestedAt` field required by the parent P1 decision. Its outer
receipt timestamps prove only when the application service called the port, not when the
infrastructure adapter completed the identity observation. A caller-authored boolean and an omitted
attestation time are insufficient gates before catalog access.

This slice adds the smallest provider-neutral Node capability that closes those local gaps. It does
not configure a named provider, connect to a database, read a credential, or claim that any live
project has been matched. The later provider-specific source implementations and the named-project
C5B run remain separate external work.

## Decision

### A1 — Trust-separated capability boundary

The adapter factory accepts distinct approval and observation sources. The approval source resolves
the identity authorized by the packet's closed `approvalRef`; the observation source independently
derives the identity currently selected by external infrastructure. The sources must be different
object identities and expose different resolver function identities. The adapter refuses invalid
configuration before creating a port.

The approval source receives only `attemptId`, `approvalRef`, and a bounded `AbortSignal`. The
observation source receives only `attemptId`, the packet's expected environment class, and the same
bounded signal. The approved identity never reaches the observation source, and the observed
identity never reaches the approval source. Neither source receives the other source object or
result.

This separation is a local trust-boundary contract, not proof of provider authenticity. A later
provider adapter must independently bind the observation source to the selected live service and
bind the approval source to protected operator authority.

### E1 — Ephemeral identity ownership

For each returned byte view, ownership transfers to the adapter as one non-empty bounded
`Uint8Array` identity. The
adapter rejects text, objects, shared or overlapping identity storage, empty identity, oversized
identity, detached views, and any malformed result. It copies no identity into configuration,
capabilities, receipts, errors, logs, assertions, durable evidence, or provider bundles.

Both transferred arrays are zeroized in a finally block on match, mismatch, exception, timeout,
invalid time, and invalid output. The adapter does not retain an identity digest because named
project identifiers can have low entropy and a durable digest would enable offline guessing. Source
implementations must also discard any upstream representation after transferring the owned bytes.

### B1 — Bounded abortable resolution

One factory-configured positive safe-integer timeout bounds the complete approval-plus-observation
sequence. The effective bound is the lower of that timeout and the packet's `maxStepDurationMs`.
The adapter creates one `AbortController`, shares only its bounded AbortSignal with both sources,
and uses one deadline across their sequential calls. Expiry aborts the signal and returns a closed
provider refusal. Source exception text never crosses the boundary.

The adapter clears the timer in `finally`. A source that ignores an aborted signal can continue its
own work after the local promise settles; therefore provider source conformance and cancellation are
explicit later integration requirements, not local claims.

### I1 — Exact identity and environment match

The adapter compares equal-length owned identities with Node's timing-safe comparison. Length
mismatch, byte mismatch, or a source attempting to reuse the same backing buffer is an identity
mismatch. No normalized, case-folded, substring, hostname-derived, or caller-supplied boolean match
is accepted.

The observation result includes exactly one closed C5B environment class. This exact environment class
must equal the packet's environment class. Identity mismatch and environment mismatch return `project_mismatch`; later
ports never run. Source contract failure, exception, or timeout collapses to a closed provider
reason without revealing which identity was observed.

### R1 — Single-use packet binding

The port first validates the exact C5B packet and incremental prefix, requires zero prior receipts,
and requires `attest_project` as the next operation. Only then does it consume the packet hash. Each
factory instance treats the binding as single use and accepts one call per packet hash, including failed, concurrent, timed-out, or
mismatched calls. A retry requires a new attempt ID and packet hash.

Invalid context does not call either source and does not consume another valid packet. Concurrent
replay and sequential replay fail before source access. The consumed set contains only packet hashes,
never project identities or identity-derived values.

### T1 — Attestation-time receipt

The adapter obtains `attestedAt` from its configured clock only after both source resolutions and the
comparison complete. It must be a canonical ISO instant inside the freeze window declared by the packet. Success
returns exactly `projectMatch=true`, the observed environment class, and `attestedAt`.

The shared receipt schema and validator add required `attestedAt`. Prefix evaluation requires it to
be inside both the packet freeze window and the outer operation receipt's `startedAt`/`completedAt`
interval. A forged attestedAt, missing timestamp, non-canonical timestamp, or timestamp outside the
operation interval fails closed before catalog access.

### O1 — Operator fail-closed integration

The factory returns only the narrow `attestProject` port shape consumed by the existing C5B operator.
The operator remains the application service and the shared core remains the owner of operation
order and success semantics. The capability cannot emit a completion receipt or call catalog,
freeze, recovery, backup, restore, verification, cleanup, or unfreeze ports.

An integration attack runs the real operator with the project capability plus counting later ports.
Project mismatch stops before catalog access; malformed or stale attestation evidence also produces
zero later-port calls. Successful attestation permits only the next canonical port.

### M1 — Metadata-only result

The only successful evidence is `{ projectMatch: true, environmentClass, attestedAt }`. Refusals use
existing closed C5B reason codes. Results are recursively frozen and contain no project identifier,
URL, host, service name, provider payload, identity bytes, identity hash, credential, token, key,
path, machine identifier, or raw error.

Raw project identity never crosses the infrastructure capability. Static privacy controls and
runtime sentinel attacks prove raw identity leakage and provider error leakage are absent from
serialized decisions, thrown configuration errors, and parent operator results.

### N1 — TypeScript and Node threshold

Use TypeScript and Node because the work is bounded orchestration, `AbortController`, owned byte
handling, and `timingSafeEqual`; no measured threshold breach justifies Rust, Go, Python, FFI, or a
sidecar. Adding another runtime would enlarge packaging, cancellation, memory-zeroization, and
supply-chain surfaces without measured benefit.

## Options considered

| Option | Decision | Reason |
|---|---|---|
| Keep the generic self-authored boolean | Rejected | It cannot prove two input trust sources or an observation time. |
| Put the approved project in the packet | Rejected | Packet and durable receipt must stay free of project identity. |
| Persist an identity hash | Rejected | Low-entropy project names remain dictionary-attackable. |
| Compare inside the core | Rejected | The provider-neutral core must not receive identity bytes. |
| One source returns approved and observed values | Rejected | It collapses the trust boundary into one self-attestation. |
| Provider-specific network adapter now | Deferred | No concrete named project, protected authority, or provider source input is present. |
| Rust/Go/Python sidecar | Rejected | No measured performance or capability gap exists. |

## Attack and test strategy

### Plan and registration controls

- plan-absent RED with all registrations already present;
- required decision headings and exact source manifest;
- full-kit reachability without entering workspace-contract execution;
- public-manifest ordinal uniqueness and privacy positive controls.

### Capability attacks

- invalid configuration, same source object, same resolver function, missing clock, zero/unsafe
  bounds, and extra source methods;
- invalid context, unknown context field, corrupted packet, existing receipt, and wrong next
  operation, all with zero source calls;
- concurrent replay and sequential replay, both with zero repeated source calls;
- source exception, timeout, aborted signal, and late source settlement without raw provider text;
- non-byte, detached, empty identity, oversized identity, and shared identity buffer;
- identity mismatch, equal-length byte mismatch, and environment mismatch;
- invalid attestation time, time before freeze, time after freeze, and non-canonical time;
- identity zeroization for success, mismatch, exception-after-first-source, invalid time, and timeout;
- raw identity leakage, identity-hash leakage, and provider error leakage in decisions/errors;
- frozen exact success/refusal shapes and absence of arbitrary metadata.

### Core and operator attacks

- missing, extra, malformed, or forged attestedAt in project evidence;
- attestation earlier than receipt start, later than receipt completion, or outside freeze;
- updated canonical fixtures through preflight, operator, and logical-adapter tests;
- real operator success ordering with a qualified port;
- identity mismatch and forged attestedAt with zero later port after mismatch;
- canonical/generated core mirror byte equality and strict TypeScript diagnostics.

### Broader qualification

- focused plan, preflight, operator, project capability, and logical-adapter suites;
- synced-core builder attacks/check, provider bundle contract, and provider-distribution contract;
- post-17 roadmap and full kit;
- public source readiness, links, dependency-license catalog, secret scanning, and exact-index Node
  release contract;
- fresh Linux/Windows/aggregate exact-head CI before merge.

## Implementation sequence

1. Register the plan/runtime scripts, synced-core filename, and five new public-manifest rows.
2. Prove the validator fails only because this plan is absent.
3. Add this plan and prove `A1/E1/B1/I1/R1/T1/O1/M1/N1` GREEN.
4. Add runtime attacks and prove missing-module/export RED.
5. Implement the provider-neutral project-attestation capability only.
6. Extend `attestedAt` in the schema/core and update canonical fixtures.
7. Run the real operator integration attacks and zero-downstream assertions.
8. Generate the canonical core mirror and prove byte equality.
9. Audit the exact source index, run affected/public/full gates, and commit source normally.
10. Add one metadata-only evidence document and manifest row, requalify, and commit evidence.
11. Push only the exact evidence HEAD to a retained feature branch, create a Draft PR, require fresh
    exact-head Linux/Windows/aggregate GREEN, then mark Ready and standard-merge with expected SHA.

## Exact source manifest

This source slice may modify only:

- `docs/roadmap/p17-016-wave-c5b-project-attestation-capability-plan.md`;
- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
- `packages/core/src/live-cutover-project-attestation-node.ts`;
- `packages/core/test/live-cutover-project-attestation-node.test.ts`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `packages/core/test/live-cutover-preflight-operator.test.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `.claude/integrations/core/live-cutover-project-attestation-node.ts`;
- `.claude/integrations/core/live-cutover-preflight.ts`;
- `scripts/post-17-privacy-wave-c5b-project-attestation-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The separate closeout commit may add only
`docs/evidence/post-17-privacy-wave-c5b-project-attestation-capability-2026-08-20.md` and its one
ordered row in `release/public-release-manifest.json`.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Invalid factory configuration | Throw one sanitized configuration error | Create a partially trusted port |
| Invalid context or wrong operation | Closed refusal and zero source calls | Probe a project before packet validation |
| Approval source failure | Abort/zeroize any transferred bytes and refuse | Fall back to packet text or environment |
| Observation source failure | Abort and zeroize approved bytes | Treat successful authentication as identity proof |
| Timeout | Abort once, zeroize, consume attempt, refuse | Retry under the same packet |
| Identity/environment mismatch | `project_mismatch`, zero later ports | Continue to catalog or writer control |
| Invalid time | `freeze_window_invalid`, zeroize, stop | Substitute the outer receipt timestamp |
| Schema/core regression | Keep source unstaged and fix locally | Relax exact evidence validation |
| Broader test failure | Roll back to the daily snapshot if update is partial | Leave generated/core mirrors divergent |

Source rollback is the exact pre-slice main commit or the verified 2026-08-20 daily snapshot. No
external rollback is needed because this slice performs no external project operation.

## External capability boundary

This local capability does not resolve the user's placeholder packet into live authority. A later
adapter still needs a concrete named project, a protected approval source, an independently bound
observation source, provider/network/database access, a bounded freeze window, protected backup
destination, isolated restore authority, cleanup authority, and evidence sink.

The local slice authorizes no Supabase action, provider API call, database connection, catalog read,
writer freeze, snapshot, backup, restore, migration, DDL/DML, route, deployment, canary, cutover,
sync, tag, release, publication, or visibility change.

## Non-claims

Live C5B remains incomplete. This plan and local implementation do not claim a named project was
matched, a provider identity source is configured, project credentials are proven, catalog or ACL
state was read, writers were frozen, a recovery point exists, a logical backup exists, a restore was
performed, cleanup ran, or P17-016 is complete.

The capability proves only that, for a local invocation, two distinct injected source boundaries
returned transferred byte identities which the adapter compared under a bounded single-use packet
and reduced to exact metadata. Provider authenticity and the live named-project receipt remain
external evidence requirements.
