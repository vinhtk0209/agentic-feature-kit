# P17-016 Wave C5B: Writer-freeze lease capability plan

**Status:** Approved local capability design; implementation not yet qualified
**Date:** 2026-08-20
**Roadmap task:** P17-016
**Parent contract:** `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`
**Operator authority:** `APPROVE P17-016 C5B PREFLIGHT v1` plus the continuing Post-17 goal
**Decision lock:** `boundary=A1, lease=L1, binding=P1, bounds=B1, compensation=C1, unfreeze=U1, integration=O1, result=M1, runtime=N1`

## Context

The C5B core and operator already define `freeze_writers` as the third canonical operation. The
preceding project-attestation and catalog/ACL metadata-probe capabilities are qualified and merged,
but `freezeWriters` and `unfreezeWriters` still exist only as injected operator ports. A caller can
currently supply a test double that self-asserts `freezeConfirmed=true` and `activeWriterCount=0`.

That gap is now the first unmet C5B operation dependency. The next provider recovery point must not
run unless writer admission is actually held and a separate observation reports zero active writers.
The same capability must own unfreeze because a split implementation could lose the attempt-owned
lease, leak opaque control material, or let a failed freeze leave writers blocked indefinitely.

This slice builds no provider adapter. It defines one provider-neutral Node infrastructure capability
around injected, separately controlled sources. Local attacks prove lifecycle, validation, timeout,
compensation, and operator wiring. They do not prove any live project or provider was frozen.

## Decision

### A1 — Trust-separated control and observation ports

The capability accepts independent control and observation sources. The control source exposes only
bounded acquire and release operations. The observation source independently observes whether the
attempt-owned lease is active, its exact expiry, and a bounded active-writer count. The two source
objects and their callable identities must not alias. Configuration and sources are snapped at
factory construction so later mutation cannot replace a validated dependency.

The control result cannot claim success by itself. A freeze passes only after the observation source
reports the exact acquired lease active with zero active writers. Release confirmation is observed
independently after the control source releases the same lease. Raw provider text, project identity,
host, URL, path, credentials, SQL, and arbitrary method names are not accepted or returned.

### L1 — Bounded automatically expiring lease

Acquire returns one owned opaque lease token plus a canonical expiry. The lease token is a bounded,
non-empty `Uint8Array` transferred into capability ownership. Opaque lease bytes remain in memory
only. They never enter a receipt, log, error, hash, source file, or durable evidence and are zeroized
after release or refusal.

The control source contract guarantees an automatically expiring lease. Its expiry and the
independently observed expiry must equal each other and the packet `freezeExpiresAt`; therefore the
lease expires no later than the packet freeze window. A missing, earlier, later, non-canonical, or
unobserved expiry is refused. Automatic expiry is the final safety boundary if explicit release
cannot be confirmed; it is not permission to ignore release failure.

A successful session also arms an unref'ed local timer from the trusted start to the exact packet
expiry. If the operator never calls unfreeze, that timer zeroizes the capability-owned token and
clears the local session at automatic expiry without keeping the Node process alive.

### P1 — Packet prefix and single-active binding

Only an exact validated operator context whose exact next operation is `freeze_writers` can acquire.
The packet hash is consumed before the first source call, making the capability single use per packet
hash. Concurrent replay and sequential replay perform no second acquire. One factory permits a
single active attempt; an overlapping packet is refused until the active lease is released or the
exact bounded expiry clears the local session. Any uncertain acquire or release state quarantines
that factory and requires a fresh factory even after external auto-expiry.

The active session is bound to the exact packet hash, attempt ID, environment class, freeze expiry,
and lease bytes. `unfreezeWriters` accepts only the same packet and a structurally valid receipt prefix
containing the passed freeze receipt. Later passed or refused receipts may be present because the
operator compensates after downstream failure. A wrong-packet unfreeze cannot release another
attempt's lease.

### B1 — Bounded abortable transitions

Acquire, post-acquire observation, release, and post-release observation run through bounded
AbortSignal calls. Every transition uses the minimum of configured timeout, packet maximum step
duration, and remaining freeze-window time. Timeout aborts the active source call and returns only a
closed reason. Late settlement is ignored. No retry occurs inside one transition or invocation.

Trusted time must be canonical, inside the freeze window, and monotonic across calls. Clock rollback,
expired windows, invalid times, non-positive remaining duration, or a source call that outlives its
deadline fails closed. The shared module uses no filesystem, environment, process, network, provider
SDK, database client, browser, or logging surface.

### C1 — Internal refusal compensation

Once acquire transfers a lease, every later refusal path performs release on refusal before returning
to the operator. The capability then asks the independent observation source to prove the lease is no
longer active. Both operations remain bounded by the packet window. The lease token is zeroized and
the active session is cleared in a finalizer regardless of provider behavior.

If compensation release or observation cannot be confirmed, the freeze call returns the closed
`provider_operation_refused` reason. The automatically expiring lease still bounds the external
effect. The capability never fabricates a passed freeze receipt merely to make the operator invoke
its later unfreeze path, and it never reports provider error text.

### U1 — Exact unfreeze lifecycle

A successful freeze keeps exactly one attempt-owned lease in the factory until the operator calls
`unfreezeWriters` or the exact bounded expiry clears it. Unfreeze performs one bounded control
release, then one independent inactive-state observation. Only exact release plus
`freezeActive=false` returns the frozen exact object
`{ unfreezeConfirmed: true }`.

Release exception, timeout, malformed response, expiry mismatch, active-state observation, wrong
packet, missing passed freeze receipt, or double unfreeze returns the frozen exact object
`{ unfreezeConfirmed: false }`. No raw reason or lease material crosses the port. The lease token is
always zeroized after the first unfreeze attempt; a second call cannot repeat release I/O.

### O1 — Operator fail-closed integration

The factory returns one frozen object exposing exactly `freezeWriters` and `unfreezeWriters`, directly
compatible with the existing operator ports. A successful freeze returns only
`freezeConfirmed=true` and `activeWriterCount=0`; the operator constructs and validates the receipt.
The successful freeze reaches only `create_provider_recovery_point` in the focused integration test.

Malformed context, catalog drift, non-zero writer activity, acquire/observe failure, or lifecycle
replay stops before provider recovery. After a passed freeze, any downstream refusal causes the
operator to call this capability's exact unfreeze once. Unfreeze failure prevents completion under
the existing operator contract.

### M1 — Metadata-only result

Freeze success is one exact frozen `C5BPortDecision` containing only `freezeConfirmed=true` and
`activeWriterCount=0`. Unfreeze returns only one exact frozen boolean object. This is metadata-only;
no lease token, lease expiry, provider response, project identity, URL, host, path, SQL, query,
credential, secret, process output, active-writer identity, or application-row value is emitted.

All configuration, source, proxy, validation, timeout, clock, acquire, observe, release, and cleanup
failures collapse to existing C5B reason codes or `unfreezeConfirmed=false`. Provider error text never
crosses the shared boundary.

### N1 — TypeScript and Node threshold

The implementation targets the repository's existing TypeScript/Node baseline and uses only
`AbortController`, timers, and injected ports. Strict TypeScript 5.9.3 qualification and a
byte-identical generated `.claude` mirror are mandatory.

Rust, Go, or Python would add a compiler/runtime, FFI or process boundary, dependency inventory,
signing, and multi-platform distribution without solving a measured problem in this bounded
coordination slice. No measured threshold breach exists. A future provider-specific high-volume
observer may reconsider another language only after representative timing and memory evidence.

## Options considered

| Option | Safety | Portability | Decision |
|---|---|---|---|
| Let one callback return `freezeConfirmed=true` | Self-asserted and cannot prove zero writers | High | Rejected |
| Split freeze and unfreeze across unrelated adapters | Attempt lease can be lost on refusal | Medium | Rejected |
| Use an indefinite provider lock | Release failure can block writers indefinitely | Low | Rejected |
| Independent control/observation with an expiring lease | Bounded, observable, compensatable | High | Selected |
| Embed provider SQL or SDK in shared core | Violates dependency direction and exposes secrets | Low | Rejected |
| Add Rust, Go, or Python now | Adds supply-chain surface without measured need | Low | Rejected |

## Attack and test strategy

The focused runtime suite groups attacks as follows:

1. invalid configuration: missing/extra/accessor fields, symbol property, hostile proxy, unsafe
   token/time bounds, mutated methods, and aliased control and observation source;
2. invalid context, wrong next operation, forged packet/receipts, concurrent replay, sequential
   replay, overlapping packet, and zero source calls before exact admission;
3. control exception, malformed acquire, timeout, aborted signal, late settlement, and provider
   error leakage;
4. observation exception, malformed observation, accessor property, symbol property, hostile proxy,
   inactive freeze, active writer after freeze, unsafe count, and raw observation leakage;
5. token and expiry: empty/wrong/shared/oversized lease token, lease expiry mismatch, non-canonical
   expiry, token mutation isolation, raw lease leakage, and exact zeroization after terminal paths;
6. trusted time: start/end outside the window, window expiry, clock exception, clock rollback, and
   timeout bounded by remaining packet duration;
7. refusal compensation: post-acquire observation failure invokes one release and one release
   observation, release exception and release observation failure remain closed, session clears, and
   no downstream port runs;
8. unfreeze lifecycle: exact success, wrong-packet unfreeze, missing freeze receipt, release
   exception, release observation failure, still-active observation, double unfreeze, and no repeated
   source call; and
9. real operator integration: qualified project and catalog receipts reach freeze once, successful
   freeze reaches only provider recovery, downstream refusal invokes exact unfreeze once, and static
   source inspection proves no I/O/query/logging imports or lease serialization.

Focused core/operator/catalog parents, strict TypeScript, synced-core identity, roadmap, provider
distribution, public admission, full native kit, exact changed-path encoding/privacy, and positive-
controlled secret searches are required before closeout.

## Implementation sequence

1. Register focused plan/runtime commands and synced-core ownership.
2. Prove plan-absent RED with every other readiness dependency valid.
3. Author this decision lock and make the unchanged plan validator GREEN.
4. Add grouped attacks and prove exact missing-module/export RED.
5. Implement only the provider-neutral lease capability and make focused attacks GREEN.
6. Run real operator/parent integration, strict TypeScript, and manual architecture review.
7. Generate the one registered byte-identical core mirror.
8. Add exact public-manifest rows, audit the exact source allowlist, and run affected/public/full-kit
   qualification.
9. Commit source normally, author durable evidence separately, requalify its exact tree, then use the
   approved Draft PR/exact-head CI/artifact/Ready/standard-merge workflow while retaining the branch.

## Exact source manifest

The source commit may change only:

- `docs/roadmap/p17-016-wave-c5b-writer-freeze-capability-plan.md`;
- `packages/core/src/live-cutover-writer-freeze-node.ts`;
- `packages/core/test/live-cutover-writer-freeze-node.test.ts`;
- `.claude/integrations/core/live-cutover-writer-freeze-node.ts`;
- `scripts/post-17-privacy-wave-c5b-writer-freeze-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`, limited to five ordered admission rows for the new plan,
  canonical module/test, generated mirror, and plan validator. Existing package and builder rows stay.

Load-bearing read-only parents are:

- `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`;
- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/src/live-cutover-preflight-operator.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `packages/core/test/live-cutover-preflight-operator.test.ts`; and
- `packages/core/test/live-cutover-catalog-acl-probe-node.test.ts`.

The closeout commit adds only one English evidence document and its ordered public-manifest row. No
dashboard, migration, provider bundle, target, command prompt, or target `.Codex` file is in scope.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Invalid packet/prefix | Zero control or observation calls | Freeze because credentials work |
| Acquire refusal | Closed refusal, no observation/release claim | Fabricate a lease or retry |
| Post-acquire observation fails | Bounded release on refusal, observe inactive, zeroize | Return while holding an indefinite lock |
| Active writer remains | Release, refuse `writer_activity_detected` | Continue to provider recovery |
| Explicit release fails | Return false; rely only on bounded auto-expiry | Claim unfreeze confirmed |
| Wrong packet asks to release | Refuse without touching the active lease | Release another attempt's lease |
| Test/build/source edit fails | Restore today's verified snapshot before retry | Continue from a half-written tree |

The rollback boundary is the verified 2026-08-20 kit ZIP and tag. Generated-core writes remain
atomic and refuse unexpected files. This local slice creates no external lease, so source rollback
requires only the exact feature commits or today's snapshot.

## External capability boundary

A future provider composition root must supply two independently implemented capabilities: a writer
admission control that creates an attempt-owned automatically expiring lease, and an observation
capability that derives lease state and bounded writer count independently. It must resolve project,
credentials, provider endpoint, and any provider-specific command outside shared core and evidence.

The approved C5B packet authorizes a bounded writer freeze only as part of the named-project preflight.
This local capability does not resolve the packet's placeholder project, control service, observation
query, or external freeze window. Live use still requires exact ephemeral inputs, a qualified provider
adapter, and the existing project/catalog prefixes. It authorizes no arbitrary SQL, DDL/DML,
migration, bootstrap, route, canary, cutover, sync, or publication.

## Non-claims

This plan and its future local tests do not claim live C5B is complete, a named project was matched,
a live catalog was probed, writer freeze is active, writers were unblocked, a provider writer adapter
is configured, a recovery point exists, a backup exists, or P17-016 is complete. Live C5B remains
incomplete.

The slice reads or writes no provider, database, browser, backup destination, secret manager, target
repository, target `.Codex`, or dashboard; and performs no project action, SQL, migration, bootstrap,
key/credential/grant operation, route, deploy, canary, cutover, sync, tag, release, publication, or
visibility change.
