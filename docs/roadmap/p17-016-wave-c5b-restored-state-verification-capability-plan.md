# P17-016 Wave C5B: Restored-state verification capability plan

**Status:** Approved local capability design; implementation not yet qualified
**Date:** 2026-08-20
**Roadmap task:** P17-016
**Parent contract:** `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`
**Operator authority:** `APPROVE P17-016 C5B PREFLIGHT v1` plus the continuing Post-17 goal
**Decision lock:** `boundary=A1, binding=P1, hashing=H1, source=S1, rollback=R1, bounds=B1, quarantine=Q1, result=M1, integration=O1, runtime=N1`

## Context

The C5B core and operator define `verify_restored_state` as the seventh canonical operation. The
project, initial catalog/ACL probe, writer freeze, provider recovery point, encrypted logical backup,
and isolated restore now have qualified local capability surfaces. Read-only reconciliation proved
that operations five and six are already supplied by `createC5BLogicalBackupNodePorts`; duplicating
them would add drift rather than close a gap.

The prerequisite designs remain
`docs/roadmap/p17-016-wave-c5b-catalog-acl-probe-capability-plan.md` and
`docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md`; this slice preserves both contracts.
Admission and result integration remain governed by `packages/core/src/live-cutover-preflight.ts` and
`packages/core/src/live-cutover-preflight-operator.ts`; neither core contract is modified here.

The remaining verification port is still caller-injected. A caller can therefore self-assert the
initial catalog and ACL hashes, copy the packet's source binding, and set both final booleans to true.
This slice replaces that assertion boundary with independent metadata and rollback capabilities. It
does not read a live database, execute rollback code, clean an isolated service, or compose a live
provider. Local tests prove only the provider-neutral admission, hashing, binding, lifecycle, and
operator contract.

## Decision

### A1 — Independent metadata and rollback capabilities

The factory accepts independent metadata and rollback capabilities. The metadata capability reads
only restored catalog/ACL scalar rows plus the four independently observed source digests. The
rollback capability executes the configured closed suite and returns a structured transcript. Their
source objects and callable identities cannot alias. All config, expected test identifiers, and
callable data properties are snapped at construction; accessor, symbol, proxy, or inherited
surfaces fail closed.

Neither capability can return the final five-field evidence object. No project identity, URL, host,
connection material, resource address, SQL body, application row value, command line, process
output, credential, key, or provider exception is accepted or propagated.

### P1 — Exact six-receipt admission and single use

Only an exact operator context whose exact next operation is `verify_restored_state` is admitted.
The exact six-receipt prefix must contain passed project attestation, initial catalog/ACL probe,
writer freeze, provider recovery point, encrypted logical backup, and isolated restore receipts in
canonical order. Core validation must prove the restore is isolated and bound to the backup and
manifest before either capability is called.

The packet hash is consumed immediately before the first source call. Concurrent replay, sequential
replay, or an overlapping packet causes no second capability call. Each factory is single use after
one admitted verification begins, regardless of success, refusal, timeout, or late settlement.
Invalid context, wrong next operation, or missing restore receipt does not consume the factory.

### H1 — One canonical catalog/ACL transcript

The initial probe and restored verifier use one canonical catalog/ACL transcript implementation.
Scalar validation, exact data-property checks, Unicode normalization, row-key limits, field/row/byte
bounds, row canonicalization, byte ordering, duplicate rejection, server-version treatment, schema
version, policy version, and SHA-256 domain separation live in
`packages/core/src/live-cutover-catalog-acl-transcript.ts`.

The existing probe is refactored to consume that shared implementation without changing its output
or accepted transcript. Verification hashes the restored rows into the same domain-separated hash
bytes and compares them to the initial probe receipt with timing-safe equality. No caller-supplied
catalog or ACL digest is trusted. Catalog drift or ACL drift refuses the operation.

### S1 — Independently observed source binding

The metadata observation contains exactly the four source digest fields already committed by the
validated packet: migration 0018, migration 0019, rollback 0018, and rollback 0019. Each value must
be a canonical lowercase SHA-256 digest. The verifier compares each observed digest to its packet
counterpart with timing-safe equality.

Only after all four exact comparisons pass may the result contain the packet's existing
`sourceBindingHash` and `sourceParity=true`. The capability never accepts a precomputed
`sourceBindingHash` or `sourceParity` from infrastructure, preventing a source from merely echoing
the desired final claim. In short, `sourceParity=true` only after exact digest comparison.

### R1 — Closed rollback-suite transcript

Configuration provides an immutable, unique, ordinal-sorted set of closed expected rollback test
identifiers. The rollback request is bound to the attempt, packet, backup, and restore manifest,
environment class, expected identifiers, and the same bounded signal. The capability returns exactly
schema version, attempt ID, packet hash, source backup hash, restore-manifest hash, started/completed
times, and a bounded array of exact `{id, passed}` results.

The verifier rejects a duplicate rollback test, missing rollback test, unexpected rollback test,
rollback test failure, attempt binding mismatch, packet binding mismatch, backup binding mismatch,
or restore-manifest binding mismatch. `rollbackSuitePassed=true` only after every expected test
passes and the transcript's chronology is valid. Arbitrary logs, test output, stack
traces, skipped status, or caller-supplied suite boolean cannot cross the boundary.

### B1 — One bounded deadline and trusted chronology

The metadata read and rollback execution share one bounded AbortSignal and one total deadline. The
effective limit is the minimum of configured timeout, packet maximum step duration, and remaining
freeze-window time. Metadata runs first; rollback runs only after metadata/source parity succeeds.
Timeout aborts the active capability, no retry occurs, and late settlement cannot mutate the closed
decision or start the next phase.

The trusted clock must produce canonical UTC instants inside the packet freeze window and move
monotonically. Rollback transcript start/completion must be canonical, ordered, contained within the
public operation interval, and within the freeze window. An aborted signal, clock exception, clock
rollback, expired window, non-positive remainder, or completion after expiry fails closed.

### Q1 — Uncertain-state quarantine without cleanup ownership

Once metadata observation starts, any exception, malformed result, drift, timeout, late settlement,
rollback refusal, chronology failure, or binding mismatch quarantines the factory. The operation
returns only an existing closed C5B reason code; provider error leakage is prohibited. No retry or
partial-success receipt exists.

This verification capability does not own isolated cleanup, writer unfreeze, backup deletion, or
provider recovery deletion. On refusal, the existing operator remains responsible for compensation
cleanup and writer unfreeze. Removing an isolated restore from inside this capability would cross
the operation-eight authority boundary and hide cleanup evidence.

### M1 — Exact metadata-only verification result

Success returns one exact frozen `C5BPortDecision` whose evidence has only `catalogHash`, `aclHash`,
`sourceBindingHash`, `sourceParity=true`, and `rollbackSuitePassed=true`. The hashes are either
computed from the restored observation by the shared transcript or carried from the already
validated packet after independent component comparison.

The result is metadata-only. It contains no raw row, source component digest, rollback test ID,
timestamp, provider response, error text, resource identity, address, path, SQL, credential, key,
process output, or mutable object. All failures collapse to existing reason codes.

### O1 — Operator fail-closed integration

The factory exposes exactly `verifyRestoredState`, directly compatible with the existing operator
port. Successful verification reaches only `cleanup_isolated_restore`; the focused integration uses
a refusing cleanup stub to prove no completion claim can skip operation eight. A verification
refusal reaches the operator's compensation cleanup and writer-unfreeze paths, not the normal final
receipt.

Wrong prefix, metadata drift, source mismatch, rollback failure, timeout, replay, or malformed
transcript cannot reach normal cleanup. This slice neither implements nor weakens compensation.

### N1 — TypeScript and Node threshold

The implementation uses the existing TypeScript/Node baseline, injected ports, `AbortController`,
bounded timers, exact own-data validation, strict UTF-8 canonicalization, and `node:crypto`. Strict
TypeScript 5.9.3 and byte-identical generated `.claude` mirrors are mandatory.

Rust, Go, or Python would add a runtime/compiler, process or FFI boundary, dependency inventory,
signing burden, and cross-platform distribution without solving a measured bottleneck. There is no
measured threshold breach. Another language can be reconsidered only after representative restored
catalog volume proves a concrete latency or memory target cannot be met in Node.

## Options considered

| Option | Safety | Maintenance | Decision |
|---|---|---|---|
| Trust five final fields from one callback | Self-attested parity and rollback | Low effort | Rejected |
| Re-run only the catalog probe factory | Cannot bind source or rollback suite | Medium | Rejected |
| Duplicate catalog/ACL canonicalization | Hash drift can create false mismatch | High risk | Rejected |
| Shared transcript plus two independent capabilities | Exact parity and closed evidence | Moderate | Selected |
| Execute SQL/processes in shared core | Leaks provider and connection concerns | High risk | Rejected |
| Combine verification and cleanup | Crosses canonical authority and hides residue | High risk | Rejected |
| Add Rust, Go, or Python now | New supply chain without measured gain | High | Rejected |

## Attack and test strategy

The focused suite groups attacks as follows:

1. invalid configuration, missing/extra fields, accessor property, symbol property, hostile proxy,
   mutated functions, invalid limits, duplicate/unsorted identifiers, and aliased metadata and
   rollback capability;
2. invalid context, wrong next operation, missing restore receipt, forged receipt, concurrent replay,
   sequential replay, overlapping packet, and zero capability calls before admission;
3. metadata exception, timeout, aborted signal, late settlement, malformed/accessor/symbol/proxy
   output, oversized metadata, invalid scalar/Unicode/row key, duplicate row, and provider error
   leakage;
4. shared transcript parity: unchanged initial probe vectors remain exact, restored order does not
   change hashes, catalog drift and ACL drift fail, server-version drift changes catalog only, and
   the initial probe and verifier consume one shared algorithm;
5. source observation: exact four-digest success, missing/extra digest, uppercase/invalid digest,
   source digest mismatch in every position, caller precomputed binding rejection, and no component
   digest in the public result;
6. rollback transcript: malformed structure, duplicate rollback test, missing rollback test,
   unexpected rollback test, rollback test failure, attempt binding mismatch, packet binding
   mismatch, backup binding mismatch, restore-manifest binding mismatch, and false/skipped status;
7. chronology and bounds: timeout across the combined calls, aborted signal, late settlement, invalid
   timestamp, rollback before operation, completion after operation/freeze, clock exception, clock
   rollback, and bounded row/test/byte counts;
8. exact result and lifecycle: five fields only, deep immutability, deterministic values, single use,
   quarantine after every admitted failure, no cleanup method, no error/resource/raw-row leakage;
9. real operator integration: exact six receipts reach verifier once, success reaches only cleanup,
   verification refusal invokes compensation cleanup and unfreeze, and static inspection proves no
   filesystem/environment/network/database/process/provider-SDK/logging surface.

Parent preflight/operator/catalog/logical-backup suites, strict TypeScript, synced-core identity,
roadmap/provider/distribution gates, public admission, full native kit, exact encoding/privacy, and
positive-controlled negative searches are required before closeout.

## Implementation sequence

1. Register focused plan/runtime commands and both synced-core files.
2. Prove plan-absent RED with every other readiness dependency valid.
3. Author this decision lock and make the unchanged plan validator GREEN.
4. Add grouped attacks and prove exact missing-module/export RED.
5. Extract the existing canonical catalog/ACL transcript without changing initial probe semantics.
6. Implement only the provider-neutral restored-state verifier and make focused attacks GREEN.
7. Run parent/operator/catalog/logical-backup suites, strict TypeScript, and architecture review.
8. Generate registered byte-identical core mirrors.
9. Add exact public-manifest rows, audit the source allowlist, and run affected/public/full gates.
10. Commit source normally, add durable evidence separately, requalify, then use Draft PR/exact-head
    Linux/Windows/aggregate/artifact/Ready/standard-merge while retaining the branch.

## Exact source manifest

The source commit may change only:

- `docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md`;
- `packages/core/src/live-cutover-catalog-acl-transcript.ts`;
- `packages/core/src/live-cutover-catalog-acl-probe-node.ts`;
- `packages/core/src/live-cutover-restored-state-verification-node.ts`;
- `packages/core/test/live-cutover-restored-state-verification-node.test.ts`;
- `.claude/integrations/core/live-cutover-catalog-acl-transcript.ts`;
- `.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts`;
- `.claude/integrations/core/live-cutover-restored-state-verification-node.ts`;
- `scripts/post-17-privacy-wave-c5b-restored-state-verification-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The evidence commit may add only
`docs/evidence/post-17-privacy-wave-c5b-restored-state-verification-capability-2026-08-20.md` and its
ordinal-sorted public-manifest row.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden fallback |
|---|---|---|
| Invalid prefix or replay | Refuse before capability call | Repair or retry the packet |
| Metadata malformed or drifted | Quarantine and refuse | Trust expected receipt hashes |
| Source digest mismatch | Emit no source parity | Copy packet binding as proof |
| Rollback transcript incomplete | Emit no suite pass | Treat missing/skipped as pass |
| Timeout or clock failure | Abort, quarantine, ignore late result | Extend the freeze window |
| Verification refusal | Leave compensation to operator | Delete restore inside verifier |
| Source/test/build edit fails | Restore today's verified snapshot | Continue from half-written tree |

The rollback boundary is the verified 2026-08-20 kit ZIP and tag. Generated-core writes are atomic
and refuse unexpected files. This local slice creates no external artifact, so source rollback uses
the exact feature commits or today's snapshot.

## External capability boundary

A future provider composition root must supply a restored metadata reader and rollback-suite runner
that are independently controlled from the initial probe and logical restore. It resolves the named
project, isolated service, connection material, SQL/tool implementation, rollback executable, and
resource lifecycle outside shared core. It must also supply a separately authorized operation-eight
cleanup capability and writer-unfreeze authority.

This packet authorizes only verification of the exact isolated restore already represented by the
six-receipt prefix. It authorizes no arbitrary SQL, DDL/DML, migration, bootstrap, cleanup, route,
deploy, canary, cutover, sync, tag, release, or publication.

## Non-claims

This plan and its future local tests do not claim live C5B is complete, restored state is verified,
the rollback suite is passed, a live database was read, a rollback was executed, isolated restore is
cleaned, writers were unfrozen, or P17-016 is complete. Live C5B remains incomplete.

The slice reads or writes no provider, database, browser, backup destination, secret manager, target
repository, target `.Codex`, or dashboard; and performs no project action, SQL, migration, bootstrap,
key/credential/grant operation, cleanup, route, deploy, canary, cutover, sync, tag, release,
publication, or visibility change.
