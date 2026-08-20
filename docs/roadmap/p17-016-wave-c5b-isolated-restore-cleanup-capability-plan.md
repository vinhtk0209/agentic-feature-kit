# P17-016 Wave C5B Isolated-Restore Cleanup Capability Plan

Date: 2026-08-20
Status: accepted for local implementation under the continuing Post-17 input lock
Parent: `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`

## Context

The C5B core and operator define `cleanup_isolated_restore` as canonical operation eight. The
operator already routes normal and reached-state compensation cleanup at most once, validates the
two-field cleanup receipt, and prevents completion when cleanup is refused or residual resources
remain. Those controls currently depend on an injected port. There is no provider-neutral runtime
that owns the capability boundary, proves attempt ownership, correlates destruction with a separate
residual observer, bounds both calls under one deadline, or protects opaque correlation material.

The logical-backup adapter deliberately leaves isolated cleanup external, and restored-state
verification deliberately does not own it. Combining cleanup with restore or verification would
hide operation-eight evidence and weaken reached-state compensation. This slice supplies only the
missing local capability. It performs no live provider or database operation.

References:

- `docs/roadmap/p17-016-wave-c5b-operator-application-plan.md` owns order and compensation;
- `docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md` keeps cleanup external;
- `docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md` hands successful
  verification to operation eight; and
- `packages/core/src/live-cutover-preflight.ts` remains the final receipt authority.

## Decision

Input lock:

`APPROVE P17-016 C5B CLEANUP CAPABILITY v1: boundary=A1, admission=P1, ownership=O1, deadline=D1, custody=Z1, residual=R1, quarantine=Q1, result=M1, integration=I1, runtime=N1`

### A1 — Independent cleanup and residual-observation capabilities

The factory accepts exactly two non-aliased capability objects: one cleanup control and one
residual observer. Their functions must also be distinct own enumerable data properties. Accessor,
symbol, hidden, extra, hostile proxy, or inherited configuration is refused before any capability
call. This establishes independent cleanup and residual-observation capabilities without claiming
that local tests prove organizational independence in a future provider composition root.

The cleanup control receives one frozen request and may perform only the operation for which it was
configured. The observer receives a separately frozen request plus an owned copy of the opaque
correlation token. Neither callback is imported from a provider SDK or database client by shared
core.

### P1 — Exact seven-receipt admission and single use

Admission requires a validated C5B packet and the exact seven-receipt prefix ending in a passed
`verify_restored_state` receipt. The exact next operation is `cleanup_isolated_restore`. A missing
verification receipt, refused or forged receipt, wrong next operation, wrong order, duplicate, or
different packet is rejected before either capability executes.

The factory is factory-wide single use after the first admitted context. Concurrent replay,
sequential replay, or a second packet is refused. An invalid context does not consume the factory,
but every admitted attempt becomes terminal regardless of result.

### O1 — Attempt-owned opaque cleanup authority

The capability is preconfigured outside shared core for one attempt-owned isolated target. The
packet cannot choose a resource identifier, service, database, project, host, path, namespace,
label selector, SQL statement, or deletion scope. The request carries only packet-owned metadata
already admitted by core: attempt, environment class, packet hash, source backup digest, restore
manifest digest, and freeze expiry.

Control and observation results are bound to the attempt, packet, backup, and restore manifest and
to one configured cleanup capability ID. Any attempt binding mismatch, packet binding mismatch,
backup binding mismatch, restore-manifest binding mismatch, or cleanup capability mismatch is a
closed cleanup failure. There is no wildcard, list, query, or caller-provided target surface.

### D1 — One total deadline and trusted chronology

Cleanup and residual observation share one total AbortSignal deadline. Its effective duration is
the minimum of configured timeout, packet maximum step duration, and remaining freeze-window time.
The same signal is passed to both callbacks. Observation begins only after cleanup returns a valid
confirmation and the signal remains active.

An injected trusted clock must return canonical UTC instants inside the packet freeze window and
move monotonically before cleanup, between cleanup and observation, and after observation. Timeout,
aborted signal, clock exception, clock rollback, expired window, non-positive remainder, or late
settlement fails closed. A late cleanup result cannot start observation after the deadline.

### Z1 — Terminal token custody

Successful cleanup returns an opaque `Uint8Array` correlation token. Shared core validates a plain
non-shared byte buffer, bounds its size, copies it into owned memory, and terminally zeroized both
the source token and every owned/request copy. Malformed and oversized token values are refused;
any visible token bytes in the public result or thrown message are prohibited.

The token is correlation material only. It is not a resource selector and cannot be accepted from
the packet or operator context. Observation receives it only after exact cleanup result binding.

### R1 — Independent zero-residual observation

The separately controlled residual observation must return the exact configured capability ID,
attempt, packet, backup, and restore-manifest bindings plus `cleanupConfirmed=true` and integer
`residualResourceCount=0`. The public result may set `residualResourceCount=0 only after independent
observation`; the cleanup callback cannot self-attest zero residue.

A residual resource, malformed result, cleanup refusal, observer refusal, token mismatch, or
provider exception returns `cleanup_incomplete`. Unknown provider text never crosses the boundary.

### Q1 — Uncertain-state quarantine and no retry

Once cleanup is admitted, any exception, malformed output, timeout, late settlement, binding drift,
or residual resource quarantines the factory. There is no retry under the same attempt. This is
required because a timed-out or malformed destructive operation has uncertain external state.

The operator may invoke this capability only once for either canonical or compensation cleanup.
The capability does not retry, broaden scope, infer success, or create a partial-success receipt.

### M1 — Exact metadata-only cleanup result

Success returns one deeply frozen `C5BPortDecision` with exactly:

- `cleanupConfirmed: true`; and
- `residualResourceCount: 0`.

The result is metadata-only. It contains no capability ID, project, resource, address, host, path,
database name, SQL, credential, token, provider output, exception, timestamp, backup bytes, or raw
observation. Refusal contains only `status=refused` and `reasonCode=cleanup_incomplete` or the
closed sequence/window reason selected by this boundary.

### I1 — Operator fail-closed integration

The factory exposes exactly `cleanupIsolatedRestore`, directly compatible with the existing
operator port. Successful cleanup reaches only writer unfreeze; no core completion receipt is
created before the operator's separate unfreeze succeeds. A cleanup refusal remains
`cleanup_incomplete`, causes one unfreeze attempt when writers were frozen, and cannot reach
`complete_preflight`.

The focused integration proves both the normal path after successful verification and the
compensation path after a restore or verification failure use one cleanup call. This slice does not
change the operator or make completion/unfreeze part of the cleanup capability.

### N1 — TypeScript and Node threshold

The implementation uses the established TypeScript/Node baseline, injected functions,
`AbortController`, bounded timers, exact own-data validation, `Uint8Array` ownership, and the
existing C5B core. There is no measured threshold breach. Rust, Go, or Python would introduce a new
compiler/runtime, cross-platform packaging, signing, FFI/process, and supply-chain boundary without
improving this bounded two-call coordination.

A future provider-specific cleanup tool may reconsider its own language only after representative
measurement and must preserve this capability contract, exact target ownership, abort behavior,
and metadata-only result.

## Options considered

| Option | Ownership safety | Residual proof | Decision |
|---|---|---|---|
| Trust the cleanup callback's boolean | Self-attested and target-opaque | None | Rejected |
| Let the packet supply a resource name | Caller can broaden deletion scope | Weak | Rejected |
| Combine restore, verify, and cleanup | Hides operation-eight evidence | Coupled | Rejected |
| Separate preconfigured cleanup and residual capabilities | Attempt-bound and observable | Strong | Selected |
| Execute provider SQL/processes in shared core | Leaks credentials and destructive mechanics | Provider-coupled | Rejected |
| Retry after timeout | Destructive state is uncertain | Can double-delete | Rejected |
| Add Rust, Go, or Python now | New supply chain without measured gain | No benefit | Rejected |

## Attack and test strategy

The focused suite groups attacks as follows:

1. invalid configuration, missing/extra fields, accessor property, symbol property, hidden field,
   hostile proxy, mutated functions, invalid ID/timeout/token limits, and aliased cleanup and
   observation capability;
2. invalid context, wrong next operation, missing verification receipt, forged receipt, concurrent
   replay, sequential replay, different packet, and zero calls before admission;
3. cleanup refusal/exception, malformed result, cleanup capability mismatch, attempt binding
   mismatch, packet binding mismatch, backup binding mismatch, restore-manifest binding mismatch,
   invalid or oversized token, token transfer, and provider error leakage;
4. residual observation refusal/exception, malformed/accessor/symbol/proxy result, residual
   resource, false confirmation, binding mismatch, and absence of observer calls before cleanup;
5. one combined timeout, aborted signal propagation, late settlement, observation suppression after
   timeout, clock exception, clock rollback, expired freeze window, and completion outside window;
6. source/request/owned token zeroization on success and every failure, including late cleanup;
7. exact two-field result, deep immutability, deterministic values, no raw identity/token leakage,
   factory quarantine, and no retry; and
8. real operator integration: exact seven receipts call cleanup once, success reaches unfreeze then
   completion, cleanup refusal reaches unfreeze but not completion, and compensation remains once.

Static inspection must prove the runtime imports no filesystem, environment, process, network,
database, provider SDK, shell, SQL, browser, or logging surface. Parent preflight/operator/logical-
backup/restored-verification suites, strict TypeScript, synced-core identity, roadmap/provider/
distribution gates, public admission, full native kit, exact encoding/privacy, and positive-
controlled negative searches are mandatory before closeout.

## Implementation sequence

1. Register the focused plan/runtime routes and synced-core filename.
2. Prove plan-absent RED with all other readiness dependencies valid.
3. Add this plan and make the unchanged decision validator GREEN.
4. Add grouped runtime attacks and prove the exact missing module/export RED.
5. Implement only the provider-neutral cleanup capability and make focused attacks GREEN.
6. Run strict TypeScript, parent C5B suites, architecture/security review, and operator integration.
7. Generate the registered byte-identical core mirror.
8. Add exact public-manifest rows, audit the locked source allowlist, and run public/full gates.
9. Commit source normally, add durable evidence separately, requalify, then use Draft PR exact-head
   Linux/Windows/aggregate/artifact/Ready/standard-merge while retaining the branch.

## Exact source manifest

The source commit may change only:

- `docs/roadmap/p17-016-wave-c5b-isolated-restore-cleanup-capability-plan.md`;
- `packages/core/src/live-cutover-isolated-restore-cleanup-node.ts`;
- `packages/core/test/live-cutover-isolated-restore-cleanup-node.test.ts`;
- `.claude/integrations/core/live-cutover-isolated-restore-cleanup-node.ts`;
- `scripts/post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The parent contracts remain read-only references:

- `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`;
- `docs/roadmap/p17-016-wave-c5b-operator-application-plan.md`;
- `docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md`;
- `docs/roadmap/p17-016-wave-c5b-restored-state-verification-capability-plan.md`;
- `packages/core/src/live-cutover-preflight.ts`; and
- `packages/core/src/live-cutover-preflight-operator.ts`.

The evidence commit may add only
`docs/evidence/post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-2026-08-20.md` and its
ordinal-sorted public-manifest row.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden fallback |
|---|---|---|
| Invalid prefix or replay | Refuse before capability calls | Repair or retry the packet |
| Cleanup malformed/refused | Quarantine and return cleanup failure | Start observer or infer deletion |
| Cleanup timeout | Abort and suppress later observation | Extend deadline or retry deletion |
| Token malformed/oversized | Zeroize available material and refuse | Copy it into result/log |
| Observation malformed/residual | Quarantine and return cleanup failure | Trust cleanup callback |
| Clock/window failure | Refuse and ignore late settlement | Continue outside freeze window |
| Operator cleanup refusal | Unfreeze reached writer state, no completion | Skip unfreeze or mint completion |
| Source/test/build edit fails | Restore today's verified snapshot | Continue from half-written tree |

The rollback boundary is the verified 2026-08-20 kit ZIP and tag. Generated-core writes are atomic
and refuse unexpected files. This local slice creates no external resource, so source rollback uses
the exact feature commits or today's snapshot.

## External capability boundary

A future provider composition root must preconfigure the exact attempt-owned cleanup target and
supply the cleanup and observation capabilities from separately controlled authorities. It owns
provider identity, credentials, endpoint, database/service naming, SQL/tool argv, deletion
mechanics, target scoping, and post-delete observation. Shared core neither sees nor selects them.

This slice authorizes no live provider/database access, project action, SQL, DDL/DML, migration,
bootstrap, route, deploy, canary, cutover, sync, tag, release, publication, or visibility change.
Writer unfreeze and the final completion receipt remain separate operator responsibilities. Live
C5B remains incomplete until a concrete named-project composition executes every capability and
records durable evidence.

## Non-claims

This plan and local tests do not claim a live isolated restore is or was cleaned, residual resources
were measured, writers are or were unfrozen, a provider/database was accessed, C5B is complete, or
P17-016 is complete.

The slice reads or writes no provider, database, browser, secret manager, target repository, target
`.Codex`, or dashboard; and performs no live cleanup, project mutation, SQL, migration, bootstrap,
credential/key/grant action, route, deploy, canary, cutover, sync, tag, release, publication, or
visibility change.
