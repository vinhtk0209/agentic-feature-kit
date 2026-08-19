# P17-016 Wave C5B: Preflight and snapshot operator contract plan

**Status:** Local contract implementation approved under standing continuation authority; live C5B remains input-blocked
**Date:** 2026-08-19
**Roadmap task:** P17-016
**Parent:** `p17-016-wave-c5-live-cutover-plan.md`
**Decisions:** `boundary=B1, project=P1, operations=O1, receipt=R1, failure=F1, schema=S1, runtime=T1`

## Outcome

This slice creates the provider-neutral local contract that a later authorized C5B operator adapter
must satisfy. It is not a substitute for authorized live C5B evidence. It defines exact packet,
operation, receipt, completion, privacy, and failure semantics before a provider recovery point,
logical backup, or isolated restore can be attempted.

The source checkpoint contains only deterministic TypeScript, a language-neutral JSON Schema,
tests, this plan, package registration, and metadata-only evidence. It does not connect to a live
project, run a backup tool, freeze a writer, create or restore a snapshot, or inspect application
rows. P17-016 remains `in_progress` after this local checkpoint.

## Reconciled authority and dependency state

- C5A is complete and already locks P1/S1/M1/B1/K1/C1/G1/R1/L1/O1/E1/X1.
- C4D proves exact migrations and rollback behavior on disposable PostgreSQL, not a named project.
- P17-014 is `in_progress`; its A4 route work depends on C5 tenant persistence and credential/grant
  composition.
- P17-021 is backlog and depends on completed P17-014, P17-015, and P17-016.
- The live C5B input matrix is incomplete: there is no current freeze window, protected backup
  destination capability, provider recovery authority, isolated restore target, or cleanup receipt.
- Earlier catalog snapshots are drift inputs only. They are not current preflight or recovery proof.
- Standing continuation authority covers local source, tests, branch, PR, and qualified merge. It
  does not replace the separate named-project C5B authorization packet required by C5A.

The critical path therefore starts with a provider-neutral contract that makes incomplete or unsafe
external inputs unrepresentable as a successful C5B completion.

## Requirements and constraints

- **Privacy:** no project identifier, URL, host, or connection material enters the packet or receipt.
  Project identity remains inside the infrastructure adapter. Backup bytes, SQL bodies, row values,
  provider errors, credentials, keys, and subject identities never cross the core boundary.
- **Recovery:** completion requires a provider recovery point plus encrypted logical backup, a
  successful isolated restore, restored-state verification, and cleanup with zero residual resource.
- **Ordering:** all operations execute exactly once and in canonical order. No step can be skipped,
  duplicated, retried under the same attempt, or completed outside the approved freeze window.
- **Binding:** every operation receipt binds the same attempt, packet hash, source SHA-256 binding,
  policy version, and environment class.
- **Bounded execution:** infrastructure adapters use enumerated argv with `shell:false`, bounded
  output, bounded timeout, and no arbitrary SQL or shell input.
- **Evidence:** only closed status, reason codes, counts, durations, timestamps, hashes, booleans,
  and capability identifiers can enter durable evidence.
- **Portability:** the core is independent of Supabase, filesystem, process, browser, environment,
  CLI, secret manager, backup provider, and database clients.
- **Honesty:** local tests prove contract behavior only. They cannot claim a writer freeze, snapshot,
  restore, provider capability, live catalog match, or C5B completion.

## Decisions

### B1 — Clean Architecture boundary

The shared core owns packet validation, the canonical operation sequence, closed reason codes,
receipt validation, state reduction, and completion hashing. It accepts already-redacted metadata
from ports and has no filesystem, process, environment, network, browser, provider, or database
imports.

Infrastructure adapters own project identity comparison, catalog queries, writer control, provider
recovery APIs, encrypted logical backup execution, isolated restore lifecycle, and cleanup. The
operator application service invokes those ports in the core-defined order. Provider adapters never
define success semantics.

### P1 — Ephemeral project attestation

The operator approval names one project outside source and durable evidence. An infrastructure port
receives approved identity through an ephemeral channel, independently derives observed identity,
compares them in memory, and returns only:

- `projectMatch`;
- target environment class;
- attestation time; and
- closed reason code.

Project identity remains inside the infrastructure adapter. No project identifier, URL, host, or
connection material enters the packet or receipt. `projectMatch=false` stops before catalog access,
writer freeze, snapshot, or backup work.

### O1 — Ordered enumerated operations

The contract has exactly nine operations:

1. `attest_project`;
2. `probe_catalog_acl`;
3. `freeze_writers`;
4. `create_provider_recovery_point`;
5. `create_encrypted_logical_backup`;
6. `restore_isolated_backup`;
7. `verify_restored_state`;
8. `cleanup_isolated_restore`; and
9. `complete_preflight`.

They occur exactly once and in canonical order. A failed or refused operation terminates the
attempt. A retry always uses a new attempt ID and new packet hash. The operation set contains no
arbitrary SQL, shell, provider method name, executable, path, host, or user-supplied command.

### R1 — Metadata-only receipts

Every step receipt has an exact envelope and one operation-specific metadata payload. Permitted
metadata includes:

- catalog, ACL, RPC, policy, extension, manifest, source, and artifact SHA-256 hashes;
- bounded object, row, writer, byte, and residual-resource counts;
- canonical timestamps and durations;
- encryption, restore, parity, cleanup, and pass/refusal booleans;
- closed provider capability identifiers and closed reason codes; and
- expiry timestamps for recovery artifacts.

Raw provider error text, backup bytes, SQL/function bodies, row bodies, paths, project identity,
connection values, tokens, keys, email, subject IDs, and machine IDs are forbidden. Backup bytes
remain outside source, logs, and evidence.

### F1 — Fail-closed completion

Completion is a deterministic reducer over one validated packet and nine validated receipts. All
nine operations must pass. The reducer additionally requires:

- successful project match before any other operation;
- source SHA-256 binding to exact `0018`, `0019`, and both rollback artifacts;
- a fresh catalog/ACL probe inside the freeze window;
- writer freeze with zero active writers;
- both recovery layers with unexpired metadata;
- encrypted logical backup with positive byte count and canonical digest;
- isolated restore bound to the same logical backup digest;
- restored catalog/ACL parity and disposable rollback suite pass;
- cleanup with zero residual resources; and
- a final hash computed from the canonical packet and prior receipts.

Unknown fields, missing steps, wrong operation order, duplicate operation, failure status, stale
timestamps, hash mismatch, or forged completion hash returns one closed reason and no success
receipt. Provider errors collapse to a reason code and never become evidence text.

### S1 — Language-neutral schema

`docs/schemas/p17-016-c5b-preflight-snapshot.schema.json` is the public wire contract for a future
dashboard operator service, optional agent service, or independently implemented provider adapter.
It uses closed objects, exact enums, bounded integers and strings, canonical UUID/timestamp/hash
formats, and discriminated operation payloads.

The TypeScript runtime validator remains the executable authority in this repository. Tests bind
its versions, operations, reason codes, and required fields to the JSON Schema so a Rust, Go, or
Python adapter cannot silently invent a wider contract.

### T1 — TypeScript implementation threshold

TypeScript remains the correct implementation for the pure contract: validation, canonicalization,
hashing, and state reduction are small bounded inputs and there is no measured threshold breach.
External backup/restore throughput is dominated by provider and database tools outside this core.

Rust, Go, or Python would add a compiler/runtime, distribution, FFI or process boundary, dependency
inventory, signing, and cross-platform qualification without solving a measured problem here. A
future streaming backup adapter may reconsider Rust or Go only after representative measurement
shows Node coordination or hashing is the bottleneck; Python may be used only for a provider SDK
that lacks a safe maintained TypeScript equivalent. None may weaken the same schema and receipts.

## Options considered

| Option | Boundary | Safety | Portability | Decision |
|---|---|---|---|---|
| Provider-specific script defines success | Infrastructure | Weak; provider output can become authority | Low | Rejected |
| Documentation-only checklist | Human convention | Cannot attack order, identity, or receipt forgery | Medium | Rejected |
| Core state machine plus provider ports and JSON Schema | Clean Architecture | Fail-closed and testable | High | Selected |
| Implement backup/restore in core | Shared core | Exposes paths, credentials, processes, and bytes | Low | Rejected |

For runtime language, TypeScript is selected now. Rust/Go/Python remain evidence-triggered adapter
options, not speculative dependencies.

## Contract model

### Packet

The packet includes schema/policy versions, attempt UUID, closed approval reference, environment
class, freeze window, protected destination capability ID, source artifact hashes, recovery
requirements fixed to `true`, evidence mode fixed to `metadata_only`, and maximum bounded durations.
It contains no project identity or secret-bearing value.

### Infrastructure ports

Future adapters implement narrowly typed capabilities:

- project attestation;
- catalog/ACL probe;
- writer freeze/unfreeze;
- provider recovery point;
- encrypted logical backup;
- isolated restore and restored-state verification; and
- isolated cleanup.

Each port returns a candidate receipt to the core validator. No port can emit a completion claim.
The application service stops on the first refusal and performs only the exact allowed cleanup or
unfreeze compensation for the reached state.

### Completion receipt

The only success receipt contains packet/attempt identity, environment class, source binding hash,
preflight catalog/ACL hashes, recovery/backup/restore hashes, freeze and artifact expiry times,
completion time, cleanup count zero, and receipt hash. It contains no provider artifact address.

## Attack and test strategy

### Fast unit and schema attacks

- malformed shape, unknown field, wrong version, unsupported environment, unsafe capability ID;
- wrong operation order, missing or duplicate operation, sequence gap, packet-hash mismatch;
- project mismatch or a later operation appearing before attestation;
- stale freeze window, step outside window, non-monotonic timestamp, excessive duration;
- active writer after freeze or writer count outside bound;
- missing provider recovery point, expired recovery metadata, or missing recovery digest;
- unencrypted logical backup, zero/oversized byte count, backup digest mismatch;
- restore source mismatch, restore manifest mismatch, or restore not isolated;
- restored catalog drift, ACL drift, source mismatch, or rollback suite failure;
- cleanup residual or cleanup before verification;
- raw provider error, project identity leakage, credential leakage, key/private material, path/host;
- forged completion hash, replay under another attempt, or mixed environment class.

### Integration and highest-authenticity layers

Later slices must add adapter contract tests with fake ports, direct `shell:false` argv assertions,
disposable backup/restore execution, and the separately authorized named-project C5B run. The live
run must prove provider recovery metadata, encrypted backup digest/bytes, isolated restore parity,
cleanup, unfreeze behavior, and metadata-only evidence. Local success cannot substitute for it.

### Coverage targets

- every reason code has one positive refusal fixture;
- every operation-specific payload has canonical pass and at least two attacks;
- ordering has missing, duplicate, swapped, early-completion, and post-failure cases;
- privacy detectors have positive controls and zero candidate output;
- schema/runtime version, operations, enums, and required fields have exact parity; and
- full kit plus public/provider contract regressions remain green.

## Implementation sequence

1. Prove plan-first RED after registering the validator but before this plan exists.
2. Make the unchanged plan validator GREEN with B1/P1/O1/R1/F1/S1/T1 locked.
3. Add JSON Schema and a pure TypeScript module; prove missing-module RED first.
4. Add one canonical packet/receipt sequence and bounded attack fixtures.
5. Run focused schema/runtime/parent C5A/privacy/roadmap gates, strict TypeScript, and full kit.
6. Write metadata-only evidence after the source tree is immutable.
7. Commit source and evidence separately, then use one retained feature branch and Draft PR.
8. Require exact-head Linux, Windows, and aggregate CI before Ready or merge.
9. Reconcile—but do not fabricate—the separate external C5B authorization packet.

## Exact source manifest

The source checkpoint is limited to:

- `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`;
- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `.claude/integrations/core/live-cutover-preflight.ts`, generated byte-identically from canonical
  source;
- `scripts/post-17-privacy-wave-c5b-preflight-snapshot-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`, limited to the six ordered source admission rows required
  for the new plan, schema, canonical core, canonical attack test, generated core mirror, and plan
  validator. Existing tracked builder and package rows remain unchanged.

The separate closeout commit adds only
`docs/evidence/post-17-privacy-wave-c5b-preflight-snapshot-contract-2026-08-19.md` and its one
ordered evidence admission row in `release/public-release-manifest.json`. No dashboard, migration,
generated provider bundle, command prompt, target, or target `.Codex` file is in scope.

## External input boundary

The local contract does not authorize live execution. C5B remains blocked until the operator sends
one exact packet resolving the placeholders outside source and evidence:

`APPROVE P17-016 C5B PREFLIGHT v1: project=<named>, snapshot=S1, freeze=<bounded-window>, destination=<protected-capability>, restore=<isolated-capability>, cleanup=<authority>, evidence=E1`

That packet authorizes only the C5B project attestation, catalog/ACL metadata probe, writer freeze,
recovery artifacts, isolated restore, verification, cleanup, and unfreeze. It does not authorize
DDL/DML, migration apply, bootstrap, route deployment, canary, cutover, real sync, or publication.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Project mismatch | Stop before catalog read | Continue because credentials authenticate |
| Catalog drift or active writer | Stop and unfreeze if this attempt froze writers | Snapshot an unstable state |
| Provider recovery refusal | Stop before logical backup | Treat a logical dump as the provider recovery point |
| Backup encryption/digest failure | Delete only the attempt-owned partial artifact | Record path or bytes in evidence |
| Isolated restore failure | Clean the isolated target and stop | Apply migrations live to compensate |
| Restored-state drift | Preserve hashes, clean isolated target, stop | Edit restored objects manually |
| Cleanup residual | Fail C5B and retain closed operator alert | Mark completion with leaked resources |
| Evidence validation failure | Keep C5B incomplete | Fall back to provider output text |

No source rollback is needed for an external attempt because the local contract is immutable. A
future operator adapter owns exact unfreeze and attempt-owned cleanup compensation. It may not delete
unscoped resources, provider recovery points, or backup artifacts without explicit retention policy.

## Non-claims

This local slice does not claim live C5B is complete, a project was matched, writer freeze is active,
a provider recovery point was created, an encrypted logical backup exists, a logical backup was
restored, restored catalog/ACL parity was observed, cleanup ran, or a named-project receipt exists.

It does not read or write a provider, database, browser, backup destination, secret manager, target
repository, or target `.Codex`; and it performs no SQL, migration, bootstrap, key/credential/grant,
route, deploy, canary, cutover, sync, tag, release, publication, or visibility change.
