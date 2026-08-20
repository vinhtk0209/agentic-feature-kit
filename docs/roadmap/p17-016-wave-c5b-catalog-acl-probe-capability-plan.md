# P17-016 Wave C5B: Catalog and ACL metadata-probe capability

**Date:** 2026-08-20
**Status:** accepted and implemented locally; live provider capability not configured
**Parent:** `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md`
**Locked scope:** `boundary=A1, rows=R1, hashing=H1, version=V1, bounds=B1, replay=S1, integration=O1, result=M1, runtime=N1`

## Context

The C5B core and operator already define `probe_catalog_acl` as the second canonical operation, but
the port can still be satisfied by an arbitrary application callback returning caller-supplied
hashes. The preceding project-attestation capability proves an ephemeral identity match and stops a
wrong project before this operation. It does not read catalog metadata, verify the PostgreSQL server
version, canonicalize provider rows, compare the observation with source expectations, or produce
the five probe hashes.

The historical C2 metadata-only inventory remains a drift input, not fresh C5B proof. Its query
captured catalog and ACL structure but included provider-specific projection choices and an
operator-local project reference. This slice must not copy project identity into source or evidence.
It must create a provider-neutral boundary between a future fixed-query infrastructure adapter and
the existing C5B operator without performing live SQL itself.

## Decision

Implement one Node infrastructure capability factory for the `probe_catalog_acl` operation. The
factory snapshots a trusted observation function, exact source expectation hashes, one expected
`server_version_num`, bounded limits, and a trusted clock. At invocation it validates the canonical
C5B prefix, consumes the packet hash, calls the source through one bounded abort signal, validates
seven fixed metadata domains, canonicalizes every scalar row, derives five domain-separated SHA-256
hashes and two counts, compares the result with source expectations, and returns only the exact
metadata already admitted by the C5B receipt schema.

This slice uses TypeScript and Node because the workload is bounded validation and SHA-256 hashing;
there is no measured threshold breach that justifies Rust, Go, Python, FFI, a child process, or a
second runtime.

### A1 — Trust-separated observation port

The factory accepts exactly one observation source with one method. The source receives only the
attempt ID, environment class, source-binding hash, and a bounded AbortSignal. It does not receive
the approval reference, project identity, destination capability, backup paths, credentials, or
receipts. The method is snapped from an exact own enumerable data property at factory creation so a
later mutation or accessor cannot replace it.

The source returns raw structured observations, never precomputed hashes. The production query
adapter remains a future infrastructure concern and must use fixed metadata queries. This module has
no arbitrary SQL, query text, executable, shell, environment, filesystem, network, database,
provider SDK, browser, or logging surface.

### R1 — Exact scalar rowset contract

The observation is one exact plain object containing:

- `serverVersionNum` as one positive safe integer;
- `catalog`, `acl`, `rpc`, `policy`, and `extension` rowsets to hash;
- `migrationObject` rows to count; and
- `writerActivity` rows to count.

Each row is a non-empty plain object with exact own enumerable data properties. Keys are lower-case
ASCII identifiers with a strict length bound. Values are scalar values only: NFC strings without
control characters, safe integers, booleans, or null. Accessors, Symbols, inherited fields, sparse
arrays, nested values, non-finite numbers, negative zero, undefined, bigint, functions, unknown
domains, unknown fields, hostile proxies, and detached/mutating result shapes are refused.

Raw relation names, function identities, policy expressions, ACL principals, extension versions,
and writer observations may exist transiently inside the infrastructure boundary. Raw row values
never cross into the port decision, receipt, log, source, or durable evidence.

### H1 — Deterministic domain hashing

Every validated row becomes canonical UTF-8 JSON with lexicographically sorted keys. Rows are then
sorted by canonical UTF-8 byte order so a row-order permutation produces the same result. A duplicate
canonical row is refused rather than silently deduplicated.

Each hash transcript includes the capability policy version, domain name, and complete sorted rowset.
The catalog transcript additionally includes the observed server version. SHA-256 is therefore
domain separated: identical rows in two domains cannot produce the same digest. The module derives:

- `catalogHash`;
- `aclHash`;
- `rpcHash`;
- `policyHash`; and
- `extensionHash`.

The observation source cannot submit any of those fields. The implementation compares all five
derived values with the factory's source expectation hashes before returning success.

### V1 — Server and source expectation binding

The factory accepts one exact expected server version and five distinct lower-case SHA-256 source
expectation hashes. The observed `serverVersionNum` must equal the expected server version exactly;
a provider upgrade or downgrade is drift requiring a new reviewed expectation. The server version
is included in the catalog transcript but is not emitted as raw receipt metadata.

Expectation configuration is snapshotted and frozen at factory creation. It is trusted composition
input, not an operator-port observation and not a substitute for project attestation. A server
version mismatch or source expectation drift returns `integrity_mismatch` before writer freeze.

### B1 — Bounded abortable capture

Configuration sets positive safe limits for timeout, rows per domain, bytes per row, total canonical
bytes, and the two count-only domains. Hard ceilings prevent configuration from disabling the
bounds. Effective timeout is the smaller of the configured timeout, packet step-duration limit, and
remaining freeze-window duration.

The observation runs under one bounded AbortSignal. Timeout aborts the source and fails closed. A
late settlement is ignored. The adapter also refuses results whose validation or trusted completion
time falls outside the packet freeze window. Successful observation therefore completes inside the
freeze window. No retry occurs inside one invocation.

### S1 — Single-use packet binding

Only a valid packet and receipt prefix whose next operation is `probe_catalog_acl` can invoke the
source. The packet hash is consumed before the source call. Concurrent replay and sequential replay
return `operation_sequence_invalid` without a second source call. A retry requires a new attempt ID
and packet hash through the parent contract. The capability is single use for each packet hash.

### O1 — Operator fail-closed integration

The factory returns a frozen object exposing only `probeCatalogAcl`, directly compatible with the
existing operator port. A project-attestation receipt must already be valid. Project mismatch,
invalid attestation time, wrong order, malformed metadata, timeout, server mismatch, or expectation
drift prevents a passed probe receipt and stops before writer freeze.

Pre-freeze writer activity is observed but zero is enforced after freeze by the existing
`freeze_writers` completion rule. A non-zero probe count is therefore retained as metadata; it is not
misrepresented as a successful writer freeze. Catalog drift stops before writer freeze.

### M1 — Metadata-only result

Success is one exact frozen `C5BPortDecision` with the five derived hashes plus bounded
`migrationObjectCount` and `writerActivityCount`. No server version, row, raw name, ACL principal,
function or policy body, query, provider error, project identity, URL, host, path, token, key,
credential, machine identity, or application-row value is returned.

All configuration, source, proxy, validation, timeout, and clock failures collapse to an existing
closed C5B reason code. Provider error text never becomes output.

### N1 — TypeScript and Node threshold

The implementation targets the repository's current TypeScript/Node baseline and uses only
`node:crypto`, `AbortController`, timers, and injected ports. Strict TypeScript must compile with the
qualified TypeScript 5.9.3 toolchain. The canonical module and generated `.claude` mirror must remain
byte identical.

Rust, Go, and Python remain optional future choices only if measured live inventory volume, latency,
or memory crosses an approved threshold. No measured threshold breach exists in this bounded slice.

## Options considered

| Option | Integrity | Portability | Decision |
|---|---|---|---|
| Let the operator callback return hashes | Caller can forge or mis-canonicalize evidence | High | Rejected |
| Embed provider SQL and credentials in shared core | Query is concrete but violates dependency direction | Low | Rejected |
| Hash an unbounded provider JSON blob | Weak shape guarantees and denial-of-service risk | Medium | Rejected |
| Fixed scalar rowsets plus local domain-separated hashing | Deterministic, bounded, provider-neutral | High | Selected |
| Add Rust/Go/Python now | More toolchain and supply-chain surface without measured need | Low | Rejected |

## Attack and test strategy

The focused runtime suite groups attacks as follows:

1. invalid configuration: missing/extra/accessor fields, invalid hashes, aliased expectation object,
   mutated source method, unsafe limits, and invalid clock;
2. invalid context, wrong next operation, missing/forged attestation, concurrent replay, and
   sequential replay before a repeated source call;
3. source exception, timeout, aborted signal, late settlement, clock exception, and sanitized reason;
4. exact observation enforcement: accessor property, symbol property, hostile proxy, unknown domain,
   unknown field, sparse arrays, and empty rows;
5. scalar enforcement: nested value, non-NFC/control string, unsafe or non-finite number, negative
   zero, undefined, bigint, and function values;
6. bounds: oversized row, oversized rowset, total-byte overflow, migration-object overflow, and
   writer-activity overflow;
7. hashing: row-order permutation stability, key-order stability, duplicate canonical row refusal,
   domain separation, expected byte transcript, and input-mutation isolation;
8. server version mismatch, source expectation drift in every domain, invalid observation time,
   freeze-window expiry, exact frozen output, raw metadata leakage, and provider error leakage; and
9. real operator integration: project mismatch invokes zero later ports, successful attestation and
   probe reach only `freeze_writers`, plus static absence of I/O/query/logging surfaces.

The plan validator has positive controls for every secret/identity negative search. Focused runtime,
parent core/operator/logical suites, strict TypeScript, synced-core identity, provider distribution,
public-release admission, and the full native kit run are required before evidence closeout.

## Implementation sequence

1. Register the focused plan and runtime commands plus synced-core ownership.
2. Prove plan-absent RED with every other readiness dependency valid.
3. Author this decision lock and make the unchanged plan validator GREEN.
4. Add the complete attack suite and prove exact missing-module RED.
5. Implement only the provider-neutral capability and make the focused suite GREEN.
6. Generate the byte-identical core mirror and run parent/integration/strict gates.
7. Add exact public-manifest entries, audit privacy/source scope, and run full kit qualification.
8. Commit source, write durable evidence separately, requalify the evidence tree, and use the
   already-authorized exact-head Draft PR/CI/Ready/standard-merge workflow.

## Exact source manifest

New or changed source for this slice is limited to:

- `docs/roadmap/p17-016-wave-c5b-catalog-acl-probe-capability-plan.md`;
- `packages/core/src/live-cutover-catalog-acl-probe-node.ts`;
- `packages/core/test/live-cutover-catalog-acl-probe-node.test.ts`;
- `.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts`;
- `scripts/post-17-privacy-wave-c5b-catalog-acl-probe-capability-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The following are audited integration dependencies and change only if an attack proves their current
contract insufficient:

- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
- `packages/core/src/live-cutover-preflight.ts`;
- `packages/core/test/live-cutover-preflight.test.ts`;
- `packages/core/test/live-cutover-preflight-operator.test.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`; and
- `.claude/integrations/core/live-cutover-preflight.ts`.

The evidence closeout adds only
`docs/evidence/post-17-privacy-wave-c5b-catalog-acl-probe-capability-2026-08-20.md` after the source
commit.

## Failure and rollback behavior

Before the source commit, rollback is removal of the new plan/module/test/mirror/manifest entries and
restoration of the exact package and synced-core registrations from the verified base. After a local
commit, rollback is a new inverse commit or restoration from the verified 2026-08-20 backup; no hard
reset is required.

Runtime failure returns one closed reason, emits no receipt on behalf of this capability, and calls
no writer-freeze or later port. The module has no external state to clean up. Timeout aborts its one
source call; a late source result is ignored.

## External capability boundary

The approved C5B packet authorizes metadata-only project/catalog/ACL observation, writer freeze,
recovery, backup, isolated restore, cleanup, and evidence for one externally named project. This
local capability does not resolve the placeholder project, credentials, query transport, exact
server expectation, live source hashes, or provider authority. Those values must enter a later
operator composition through ephemeral protected capability channels and must not be copied into
source or durable evidence.

No sync, direct-main push, target `.Codex` edit, tag, release, publication, visibility change, live
DDL/DML, application-row access, writer freeze, snapshot, backup, restore, cleanup, or provider
operation is authorized by implementation tests for this slice.

## Non-claims

Live C5B remains incomplete. This plan and its local runtime do not claim that a named project is matched, a
live catalog is probed, a provider query adapter is configured, the observed server version matches,
the C2 snapshot still matches, writers are frozen, a recovery point or logical backup exists, an
isolated restore passed, live migration is safe, P17-016 is complete, sync is eligible, or a public
release is authorized.
