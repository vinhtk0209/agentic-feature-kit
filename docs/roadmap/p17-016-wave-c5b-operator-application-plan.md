# P17-016 Wave C5B: Operator application service contract plan

**Status:** Approved local dependency-unblocking slice; live C5B remains incomplete

**Decision lock:** `application=A1`, `gate=G1`, `ports=P1`, `compensation=C1`, `result=R1`, `runtime=T1`

## Context

The qualified C5B preflight/snapshot contract owns the nine-operation sequence, packet and receipt
validation, metadata-only completion evidence, and final fail-closed reducer. It intentionally does
not invoke provider, database, filesystem, process, browser, backup, restore, cleanup, or writer
capabilities.

The parent plan requires a later operator application service with fake-port contract tests before
provider-specific or live work. No such service exists. The current live attempt also failed closed
before mutation because the required recovery, logical-backup, and isolated-restore capability chain
was not available. That failure does not authorize a weaker recovery claim.

This slice supplies the missing provider-neutral application boundary. It is not a provider adapter,
does not execute a disposable restore, and is not a substitute for authorized live C5B evidence.

## Decision

Implement a pure TypeScript operator application service around the existing C5B core. Core owns
success semantics through a new incremental prefix gate. The application service invokes narrowly
typed ports exactly once and in canonical order, stops after the first closed refusal, performs only
reached-state cleanup and unfreeze compensation, and returns a closed metadata-only operator result.

### A1 — Application service boundary

The service accepts one validated C5B packet and one exact dependency object. It imports only the
provider-neutral C5B core. It has no environment, filesystem, child-process, network, browser,
provider SDK, database client, secret-manager, SQL, or arbitrary-command dependency.

The service is not a provider adapter. Infrastructure ports are configured outside this boundary.
Project identity remains inside a configured port closure and never enters the packet, port input,
receipt, result, log, test snapshot, or durable evidence.

The service invokes these capabilities:

1. project attestation;
2. catalog and ACL probe;
3. writer freeze;
4. provider recovery point;
5. encrypted logical backup;
6. isolated restore;
7. restored-state verification;
8. isolated cleanup; and
9. writer unfreeze compensation.

`complete_preflight` is core-owned and never delegated to infrastructure.

### G1 — Core-owned incremental gate

Add an incremental prefix gate to the existing C5B core. It validates a receipt prefix against the
packet, exact sequence, monotonic freeze-window time, refusal state, and every operation-specific
semantic that is knowable at that prefix. A full nine-receipt prefix delegates to the existing final
reducer so there is one completion authority.

The operator calls the incremental prefix gate after every receipt. Project mismatch stops before
catalog access. A malformed or semantically false passed receipt cannot authorize the next port.
First refusal stops later ports. Core owns success semantics; provider ports only supply candidate
closed metadata.

The prefix gate is additive and does not weaken the existing final reducer, schema, reason codes,
packet hash, receipt hash, source binding, or completion hash.

### P1 — Narrow typed ports

The dependency interface has one method per external capability plus a deterministic clock. Each
method receives only the immutable packet and already validated metadata-only receipts required by
that step. Each method returns either one candidate evidence object or a closed refusal reason.

Ports cannot choose an operation name, sequence number, executable, argv, SQL body, path, host,
project identity, connection material, credential, key, raw provider result, backup bytes, or log
message. The application service constructs and validates every receipt.

Provider errors collapse to a closed reason code. Thrown values, raw provider error text, and unknown
fields never cross the application result boundary. There is no arbitrary SQL or shell input. A
future process-owning infrastructure adapter must use enumerated argv, bounded output and timeout,
`shell:false`, and direct adapter tests; this slice does not execute a process.

### C1 — Exact compensation

Compensation is reached-state driven and at-most-once:

- cleanup only after an isolated restore attempt;
- never retry the same cleanup operation under one attempt;
- do not call cleanup again if the canonical cleanup port was already attempted;
- unfreeze writers exactly once after a successful freeze;
- unfreeze occurs before the core-owned `complete_preflight` receipt;
- cleanup failure blocks with `cleanup_incomplete`;
- unfreeze failure blocks with `provider_operation_refused`; and
- a failed compensation never causes a later operational port or completion claim.

The cleanup capability is configured for the current attempt and may remove only attempt-owned
isolated resources. Backup partial-artifact cleanup remains inside the backup port because backup
addresses and bytes cannot cross this boundary.

### R1 — Closed operator result

The operator result is a deeply frozen discriminated union. Success contains the validated C5B
completion receipt, the nine validated receipts, and closed compensation booleans proving cleanup
and unfreeze completion. Failure contains no completion receipt and only:

- closed outcome and reason code;
- failed operation or boundary stage;
- validated receipts created before the stop;
- cleanup attempted/confirmed booleans; and
- unfreeze attempted/confirmed booleans.

It is metadata-only. It contains no project identity, URL, host, path, provider artifact address,
credential, key, SQL, backup bytes, row values, provider exception, or raw log. An unfreeze failure
after eight valid operation receipts cannot expose or reuse a core completion receipt because the
ninth receipt has not been created.

### T1 — TypeScript threshold

TypeScript is selected because this service coordinates nine bounded metadata operations and one
pure core reducer. There is no measured threshold breach. Rust, Go, or Python would add a runtime,
distribution, signing, and cross-platform boundary without improving provider throughput, which
remains outside this service.

A later streaming infrastructure adapter may reconsider its own language only after representative
measurement, while preserving the same packet, receipts, prefix gate, and operator result.

## Options considered

| Option | Safety | Coupling | Decision |
|---|---|---|---|
| Provider script owns order and success | Provider output can bypass core semantics | High | Rejected |
| Application service trusts passed port metadata until final reduction | Project mismatch may reach catalog or later ports | Medium | Rejected |
| Core incremental gate plus typed application ports | Fail-closed before every next capability | Low | Selected |
| Put provider/database clients in shared core | Leaks identity, credentials, paths, and tool behavior inward | Very high | Rejected |
| Documentation-only compensation checklist | Cannot prove at-most-once cleanup or unfreeze | Medium | Rejected |

The selected option adds a small core prefix API and a provider-neutral application service. It
preserves Clean Architecture direction and leaves provider mechanics independently replaceable.

## Attack and test strategy

### Plan and static controls

- exact decision lock, source manifest, parent-plan binding, and package/full-suite registration;
- positive-controlled project identity leakage and credential leakage detectors;
- no filesystem, environment, process, network, provider, database, browser, SQL, or backup-byte
  dependency in either new runtime file; and
- byte-identical canonical and generated core mirrors.

### Core prefix attacks

- invalid packet, empty/overlong prefix, wrong operation order, duplicate receipt, and refused step;
- project mismatch before catalog, forged evidence, wrong environment, and active writer;
- non-monotonic clock, stale freeze window, excessive duration, object/byte bounds, and expired
  recovery metadata;
- backup digest mismatch, restore source mismatch, restored catalog/ACL/source drift, rollback-suite
  refusal, cleanup residual, and forged completion hash; and
- equivalence between a full prefix result and the existing final reducer.

### Fake-port application attacks

- fake ports prove exact call order, one call per reached capability, and no infrastructure call for
  an invalid packet;
- project mismatch proves no catalog call;
- later port after refusal is absent for every operation boundary;
- wrong operation order and duplicate port call are impossible through the service-owned dispatcher;
- malformed passed evidence and forged evidence stop before the next port;
- port exception collapses without echo, including raw provider error controls;
- non-monotonic clock produces a closed invalid receipt result;
- isolated restore refusal triggers one cleanup attempt, while pre-restore refusal triggers none;
- cleanup residual and cleanup retry attacks remain blocked;
- successful freeze always triggers one unfreeze, including every later failure;
- unfreeze failure prevents `complete_preflight`; and
- raw project identity, credential leakage candidates, paths, and backup bytes are absent from
  serialized results and thrown messages.

Focused tests precede strict TypeScript, synced-core parity, provider distribution, public-source
contracts, and one complete native kit run. Fake ports prove only the local application contract.
They do not prove provider access, backup creation, restore execution, writer freeze, or cleanup.

## Implementation sequence

1. Register the plan validator and runtime test, then prove plan-absent RED.
2. Add this plan and make the unchanged A1/G1/P1/C1/R1/T1 validator GREEN.
3. Add core prefix and operator attack tests before implementation; prove the exact missing export or
   missing module RED.
4. Refactor the existing core minimally so the final reducer and prefix gate share semantic checks.
5. Implement the typed operator application service and closed compensation result.
6. Add the operator file to synced-core generation and write both mirrors through the existing
   generator.
7. Run focused, strict TypeScript, parent C5B, roadmap, privacy, synced-core, provider/public-source,
   and full-kit qualification.
8. Freeze the source tree, write metadata-only evidence, and qualify that evidence tree again.
9. Commit source and evidence separately; remote PR work remains separately guarded by exact-head CI.

## Exact source manifest

The source checkpoint is limited to:

- `docs/roadmap/p17-016-wave-c5b-operator-application-plan.md`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `packages/core/src/live-cutover-preflight-operator.ts`;
- `packages/core/test/live-cutover-preflight-operator.test.ts`;
- `.claude/integrations/core/live-cutover-preflight.ts`;
- `.claude/integrations/core/live-cutover-preflight-operator.ts`;
- `scripts/post-17-privacy-wave-c5b-operator-application-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The separate closeout adds only
`docs/evidence/post-17-privacy-wave-c5b-operator-application-contract-2026-08-20.md` and its ordered
public-manifest admission row. No provider-specific adapter, migration, SQL, dashboard, target,
target `.Codex`, provider bundle output, backup artifact, or secret file belongs to this slice.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Invalid packet | Return closed failure before any port | Let an adapter inspect the target |
| Project mismatch | Stop before catalog access | Continue because credentials work |
| Port refusal or exception | Collapse to a closed reason and stop later ports | Echo provider output or retry in place |
| Receipt or prefix rejection | Stop and compensate reached state | Trust provider `passed` text |
| Restore attempted before failure | Attempt exact isolated cleanup once | Skip cleanup or delete unscoped resources |
| Canonical cleanup fails | Record closed cleanup failure; do not retry | Retry cleanup under the same attempt |
| Writers were frozen | Unfreeze exactly once before return | Leave freeze active or create completion first |
| Unfreeze fails | Return failure with no completion receipt | Expose the previously computable completion hash |
| Test/build/source update fails | Restore the daily source snapshot if source is left partial | Continue on a half-updated tree |

No live rollback is possible in this slice because no live capability executes. Source rollback uses
the verified daily backup and tag only if an update leaves the repository partial.

## External capability boundary

This local source scope does not resolve the missing provider recovery point, protected backup
destination, database connection material, isolated PostgreSQL runtime, or cleanup authority. It
does not make the external approval template concrete.

Live C5B still requires a separately concrete named-project packet plus real capabilities, a fresh
catalog/ACL preflight, writer-freeze window, provider recovery point, encrypted logical backup,
isolated restore, parity verification, exact cleanup, unfreeze, and metadata-only evidence.

Disposable backup/restore execution and direct `shell:false` infrastructure argv tests also remain
separate later slices. Neither fake ports nor a local GREEN suite can substitute for them.

## Non-claims

This plan does not claim live C5B is complete, P17-016 is complete, a project matched, catalog or ACL
metadata was read, writer freeze is active, a provider recovery point was created, an encrypted
logical backup exists, backup bytes were produced, an isolated database was restored, restored-state
parity was observed, cleanup ran, writers were unfrozen, or a live completion receipt exists.

It performs no provider, database, browser, network, filesystem, process, secret-manager, backup,
restore, SQL, DDL, DML, migration, bootstrap, route, canary, cutover, sync, target, target `.Codex`,
push, merge, release, tag, publication, visibility, credential, key, grant, or broad deletion action.
