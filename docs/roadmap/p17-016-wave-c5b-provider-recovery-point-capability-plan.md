# P17-016 Wave C5B: Provider recovery-point capability plan

**Status:** Approved local capability design; implementation not yet qualified
**Date:** 2026-08-20
**Roadmap task:** P17-016
**Parent contract:** `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`
**Operator authority:** `APPROVE P17-016 C5B PREFLIGHT v1` plus the continuing Post-17 goal
**Decision lock:** `boundary=A1, binding=P1, bounds=B1, recovery=R1, lifecycle=L1, quarantine=Q1, result=M1, integration=O1, runtime=N1`

## Context

The C5B core and operator define `create_provider_recovery_point` as the fourth canonical operation.
Project attestation, catalog/ACL probing, and the writer-freeze lease capability are qualified and
merged. `createProviderRecoveryPoint` still exists only as an injected operator port, so a caller can
self-assert `recoveryPointCreated=true` without proving that an independently observed restorable
provider artifact exists.

This is now the first unmet C5B dependency. The operation must consume the exact passed writer freeze
receipt while its bounded window remains active. It must verify a provider-managed disaster-recovery
artifact without disclosing or persisting an addressable provider identifier. The encrypted logical
backup remains a separate fifth operation and cannot substitute for the provider recovery point.

This slice builds no provider adapter and performs no provider request. It defines one provider-
neutral Node infrastructure capability around injected, independent creation and observation sources.
Local attacks prove admission, lifetime, observation, hashing, timeout, zeroization, quarantine, and
operator wiring. They do not prove that any live artifact exists.

## Decision

### A1 — Trust-separated creation and observation ports

The capability accepts independent creation and observation sources. Creation receives only the
attempt ID, environment class, packet hash, freeze expiry, and a bounded `AbortSignal`. It returns an
opaque correlation token whose only use is to ask the independently implemented observation source
about the same provider artifact. Callable identities and source objects cannot alias, and all
validated dependencies are snapped at factory construction.

Creation cannot attest its own success. Only observation can report the closed recovery metadata.
Raw provider text, project identity, provider artifact ID, URL, host, path, credential, SQL, command,
SDK object, or arbitrary provider method name is neither accepted nor returned.

### P1 — Freeze-bound packet admission and single use

Only an exact operator context whose exact next operation is `create_provider_recovery_point` can
invoke creation. The prefix must contain exactly the passed project, catalog, and writer freeze
receipts in canonical order. The writer freeze receipt must say `freezeConfirmed=true` and
`activeWriterCount=0`, and all receipt times must remain inside the packet freeze window.

The packet hash is consumed before the first source call. Concurrent replay, sequential replay, and
an overlapping packet cause zero additional creation calls. One factory is single use: after any
exact creation attempt begins, success or failure requires a fresh factory. Invalid contexts do not
consume it.

### B1 — Bounded abortable creation and trusted chronology

Creation and observation each run through a bounded AbortSignal. Their timeout is the minimum of the
configured timeout, packet maximum step duration, and remaining writer-freeze time. Timeout aborts
the active call; no retry occurs. Late settlement is ignored, and any late opaque token is zeroized
without changing the already closed result.

The trusted clock must return canonical UTC timestamps inside the freeze window and advance
monotonically. The independently observed recovery `createdAt` must be created after writer freeze,
not precede the freeze receipt completion, and not follow the operation completion. Clock exception,
rollback, expired freeze, non-positive remaining duration, or completion after freeze expiry fails
closed.

### R1 — Independently verified restorable recovery point

Observation returns exactly a closed provider capability identifier, attempt ID, packet hash,
`recoveryPointCreated`, `restorable`, `createdAt`, and `expiresAt`. The attempt, packet, and capability
must equal the configured and admitted values; both booleans must be true. The capability identifier
is a closed non-addressable class such as `provider-managed-recovery-v1`, never a resource locator.

Retention is validated against configured minimum and maximum retention durations. Expiry must be
canonical, strictly after the packet freeze expiry, and the observed `expiresAt - createdAt` duration
must remain inside those bounds. A point that is not restorable, expires too early, or claims an
unbounded lifetime is refused.

### L1 — Opaque correlation ownership and zeroization

Creation transfers a bounded non-empty `Uint8Array` into capability ownership. The caller's array is
copied before use. A fresh copy is passed to observation, and both that copy and the capability-owned
bytes are zeroized after observation or refusal. Opaque correlation bytes remain in memory only;
they never enter the receipt, metadata hash, log, error, source, or durable evidence.

Empty, shared, wrong-type, accessor-backed, aliased, or oversized correlation material is refused.
Late creation settlement is attached to a cleanup path so a transferred token is zeroized even after
the public operation has already timed out.

### Q1 — Uncertain-state quarantine without destructive compensation

Once the creation source is called, any exception, timeout, malformed result, observation failure,
binding mismatch, or invalid recovery metadata leaves provider state uncertain and quarantines the
factory. The operation returns only `provider_operation_refused`, and no later packet can use that
factory.

The shared capability never deletes or expires a recovery point automatically. Destructive cleanup
would remove the disaster-recovery authority precisely when creation state is uncertain. Retention
and any later deletion remain separate operator-approved provider capabilities outside this slice.

### M1 — Canonical metadata-only result

Success returns one exact frozen `C5BPortDecision` containing only
`recoveryPointCreated=true`, `recoveryPointMetadataHash`, and `expiresAt`. The canonical metadata hash
is SHA-256 over a domain-separated, length-bounded UTF-8 JSON object with sorted fixed keys for the
closed capability ID, attempt ID, packet hash, created/expiry times, and the two true booleans.

No raw correlation token, provider response, resource ID, project identity, URL, host, path, SQL,
credential, secret, application-row value, or process output crosses the port. Provider error text
never crosses the shared boundary. All failures collapse to existing C5B reason codes.

### O1 — Operator fail-closed integration

The factory exposes exactly `createProviderRecoveryPoint`, directly compatible with the existing
operator port. A passed call lets the operator validate the receipt. A successful recovery reaches
only `create_encrypted_logical_backup` in the focused integration test.

Malformed context, missing freeze receipt, expired freeze, replay, creation failure, observation
failure, binding mismatch, non-restorable state, or invalid retention stops before logical-backup
creation. Existing operator compensation still unfreezes writers after this downstream refusal; this
capability neither owns nor duplicates writer release.

### N1 — TypeScript and Node threshold

The implementation uses the existing TypeScript/Node baseline, injected ports, `AbortController`,
bounded timers, strict UTF-8 canonicalization, and `node:crypto`. Strict TypeScript 5.9.3 and a byte-
identical generated `.claude` mirror are mandatory.

Rust, Go, or Python would add a runtime/compiler, dependency inventory, process or FFI boundary,
signing, and multi-platform distribution without solving a measured issue here. There is no measured
threshold breach. A future provider-specific high-volume inventory may reconsider another language
only after representative latency and memory evidence.

## Options considered

| Option | Safety | Portability | Decision |
|---|---|---|---|
| Trust creation's `created=true` | Self-attested and not restorable proof | High | Rejected |
| Persist a raw provider resource ID | Addressable secret-like durable data | Medium | Rejected |
| Treat the logical dump as provider recovery | Removes the independent DR layer | High | Rejected |
| Independent create/observe with opaque correlation | Bound, observable, metadata-only | High | Selected |
| Delete on uncertain creation | Can destroy the only rollback authority | Low | Rejected |
| Embed a provider SDK in shared core | Reverses dependency direction | Low | Rejected |
| Add Rust, Go, or Python now | New supply chain without measured gain | Low | Rejected |

## Attack and test strategy

The focused suite groups attacks as follows:

1. invalid configuration, missing/extra fields, accessor property, symbol property, hostile proxy, invalid
   limits, mutated methods, and aliased creation and observation source;
2. invalid context, wrong next operation, missing freeze receipt, forged receipt, concurrent replay,
   sequential replay, overlapping packet, and zero source calls before admission;
3. creation exception, malformed result, timeout, aborted signal, late settlement, provider error
   leakage, and factory quarantine;
4. correlation ownership: empty/wrong/shared/accessor/oversized correlation token, caller mutation,
   observation-copy isolation, terminal zeroization, and raw correlation leakage;
5. observation exception, timeout, malformed/accessor/symbol/hostile output, attempt binding mismatch,
   packet binding mismatch, capability mismatch, false creation, not restorable, and raw leakage;
6. chronology and retention: creation before freeze, creation after completion, non-canonical time,
   expiry before freeze end, expiry outside retention bounds, clock exception, and clock rollback;
7. canonical metadata: exact domain-separated hash, deterministic fixed-key encoding, immutable
   result, no addressable identifier, and provider error leakage;
8. lifecycle: success consumes factory, every post-create refusal quarantines the factory, no
   deletion/expiry source exists, and no repeated provider call; and
9. real operator integration: valid project/catalog/freeze prefix reaches recovery once, success
   reaches only logical backup, recovery refusal invokes writer unfreeze once, and static source
   inspection proves no filesystem/environment/network/database/provider-SDK/logging surface.

Parent preflight/operator/writer suites, strict TypeScript, synced-core identity, roadmap/provider/
distribution gates, public admission, full native kit, exact encoding/privacy, and positive-controlled
secret searches are required before closeout.

## Implementation sequence

1. Register focused plan/runtime commands and synced-core ownership.
2. Prove plan-absent RED with every other readiness dependency valid.
3. Author this decision lock and make the unchanged plan validator GREEN.
4. Add grouped attacks and prove exact missing-module/export RED.
5. Implement only the provider-neutral recovery capability and make focused attacks GREEN.
6. Run parent/operator/writer integration, strict TypeScript, and architecture review.
7. Generate one registered byte-identical core mirror.
8. Add exact public-manifest rows, audit the source allowlist, and run affected/public/full gates.
9. Commit source normally, add durable evidence separately, requalify, then use Draft PR/exact-head
   Linux/Windows/aggregate/artifact/Ready/standard-merge while retaining the branch.

## Exact source manifest

The source commit may change only:

- `docs/roadmap/p17-016-wave-c5b-provider-recovery-point-capability-plan.md`;
- `packages/core/src/live-cutover-provider-recovery-point-node.ts`;
- `packages/core/test/live-cutover-provider-recovery-point-node.test.ts`;
- `.claude/integrations/core/live-cutover-provider-recovery-point-node.ts`;
- `scripts/post-17-privacy-wave-c5b-provider-recovery-point-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`, limited to five sorted admission rows for the plan,
  canonical runtime/test, generated mirror, and plan validator.

Load-bearing read-only parents are:

- `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`;
- `docs/roadmap/p17-016-wave-c5-live-cutover-plan.md`;
- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/src/live-cutover-preflight-operator.ts`;
- `packages/core/src/live-cutover-writer-freeze-node.ts`; and
- `packages/core/test/live-cutover-writer-freeze-node.test.ts`.

The closeout commit adds only one English evidence document and its sorted public-manifest row. No
dashboard, migration, provider bundle, target, prompt, or target `.Codex` file is in scope.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Invalid prefix/freeze receipt | Zero source calls | Create because credentials work |
| Creation refuses or times out | Closed refusal and fresh-factory requirement | Retry or claim absence |
| Observation differs | Quarantine and preserve external artifact | Trust creation or auto-delete |
| Correlation token malformed | Zeroize any owned bytes and refuse | Serialize or reuse bytes |
| Recovery not restorable | Stop before logical backup | Treat creation as proof |
| Retention invalid | Stop with metadata-only refusal | Accept unbounded/early expiry |
| Clock rollback/window expiry | Stop before next operation | Extend the approved freeze |
| Source/test/build edit fails | Restore today's verified snapshot | Continue from half-written tree |

The rollback boundary is the verified 2026-08-20 kit ZIP and tag. Generated-core writes are atomic
and refuse unexpected files. This local slice creates no external artifact, so source rollback uses
the exact feature commits or today's snapshot.

## External capability boundary

A future provider composition root must supply independently implemented creation and observation
capabilities. It resolves the named project, credentials, endpoint, provider method, retention, and
any addressable recovery ID outside shared core and evidence. It must retain the provider artifact
under the approved recovery policy and provide a separate authorized restore/delete capability later.

This approved packet authorizes only the fourth preflight operation for the exact frozen attempt. The
local capability does not resolve the placeholder project or any live provider API. It authorizes no
arbitrary SQL, DDL/DML, migration, bootstrap, restore, cleanup, route, deploy, canary, cutover, sync,
tag, release, or publication.

## Non-claims

This plan and its future local tests do not claim live C5B is complete, a named project was matched,
writer freeze is active, a provider recovery point is created, a provider adapter is configured, a
logical backup exists, or P17-016 is complete. Live C5B remains incomplete.

The slice reads or writes no provider, database, browser, backup destination, secret manager, target
repository, target `.Codex`, or dashboard; and performs no project action, SQL, migration, bootstrap,
key/credential/grant operation, route, deploy, canary, cutover, sync, tag, release, publication, or
visibility change.
