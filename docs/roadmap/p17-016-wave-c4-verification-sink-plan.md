# P17-016 Wave C4: Verification-family tenant sink plan

**Status:** Authorized under standing continuation authority — C4A plan in progress; no runtime or SQL implementation
**Date:** 2026-08-16
**Roadmap task:** P17-016
**Parent decisions:** ADR-002, Wave B2A/B2B, C1/C2, and completed C3A-C3D evidence
**Input lock:** `family=V1, storage=T1, boundary=B1, attestation=A1, retention=R1, idempotency=I1, cutover=C1, rollback=K1, evidence=E1`

## Outcome

C4 makes one central family capability-ready at a time. The first family is `verification`; no
other writer, registry entry, table, or RPC is relabeled by association. C4A records the exact
architecture, source ownership, trust boundary, schema, idempotency, retention, rollback, attack,
and evidence contracts before implementation.

C4A itself changes only this plan, its executable validator, package registration, one later
evidence file, and the workspace handoff. It creates no migration, table, RPC, sink, attestation
key, route, network transport, central row, browser state, target file, or live capability.

## Reconciled starting state

The canonical policy defines eight central families. The current machine-readable registries
contain 22 dashboard entries and seven kit entries. Only `kit.verification.record` has the exact
B2B approval, retained local proof, caller-owned command UUID, construct-exact verification
allowlist, and dedicated blocked adapter needed for the smallest first cutover.

The current source has no `0019` migration, no `privacy_verification_records` table, no
`p17_016_persist_verification` RPC, no dashboard runtime attestation composition, and no runtime
sink capability. The kit verification call site returns only the B2B blocked receipt. C3D proved
the exact C3 foundation and rollback on digest-pinned PostgreSQL 17.11, but migration `0018` has not
been applied to the live project and no live tenant, membership, processing grant, credential
binding, nonce, attestation key, or opaque-identifier key exists.

## Locked decisions

### V1 — Verification is the only first family

C4 handles only writer `kit.verification.record` and family `verification`. The retained local git
note remains the authoritative target-repository proof. Its raw feature, repository, path, spec,
coverage list, and note body never enter a central request.

The construct-exact payload remains:

- `runId`;
- `repoLocalId`, used only by a tenant-keyed opaque-identifier port and never persisted or sent;
- `contentHash`;
- `kitVersion`;
- `verified`;
- at most 16 bounded `tierExitCodes`; and
- `observedAt`.

The central representation contains `repoOpaqueId` and `opaqueKeyVersion`, never `repoLocalId`.
Install/run, progress, release, error, usage, identity, and legacy telemetry families remain in
their current fail-closed, local, external, or migration-blocked states.

### T1 — One explicit typed table and one exact RPC

The dashboard remains the sole SQL ledger owner. C4B may add exactly one additive migration named
`0019_p17_016_verification_sink.sql` and one operator rollback artifact named
`p17-016-wave-c4b-verification-sink-rollback.sql`.

The migration adds exactly one family-specific table, `public.privacy_verification_records`. It
uses typed columns for schema/policy version, tenant, writer, run, opaque repository ID/key
version, content hash, kit version, verdict, tier exit-code array, observed/recorded/expiry time,
record hash, persistence UUID, and stored time. It contains no JSON/JSONB, generic payload, raw
text body, repository name/path, feature/spec name, message, log, prompt, URL, token, or secret
column.

The table has non-null tenant ownership, a foreign key to `privacy_tenants`, exact closed checks,
enabled and forced RLS, and no direct privilege for PUBLIC, `anon`, `authenticated`, or
`service_role`. No browser policy is created. The only write surface is the exact
`public.p17_016_persist_verification(...)` security-definer RPC with fixed
`search_path = public, pg_temp`; only `service_role` receives EXECUTE.

The RPC accepts every exact verification field plus the trusted context identifiers required to
recheck tenant, credential binding, processing grant, policy, and purpose. It returns exactly
`persistence_id`, `replayed`, and `stored_at`. There is no optional tenant, list, raw-table,
arbitrary-family, arbitrary-RPC, REST, or browser mutation overload.

### B1 — Server-only injected transport

The dashboard infrastructure adapter accepts one injected RPC client whose public TypeScript
surface names only `p17_016_persist_verification`. It validates exact request and response shapes,
collapses provider errors to fixed closed failures, and never exports or returns the raw client.

The capability factory binds one already verified `TrustedTenantContext`, one current same-tenant
`essential_operations` grant whose purpose is `verification_record`, and exactly the
`verification` family. It exposes only the B1 `CentralWriterSinkCapability`. Browser code, kit
code, targets, and workers never receive a service-role client or service-role credential.

No HTTP route is added in C4. A future P17-014/C5 server composition may inject the transport only
after the live foundation, tenant bootstrap, membership/binding/grant, and credential lifecycle
are proven. Direct kit-to-Supabase access and a global client fallback are forbidden.

### A1 — Real crypto adapters, injected key material, no implicit trust

C4 may add Node crypto adapters for the existing attestation and opaque-identifier ports. The
attestation proof uses HMAC-SHA-256 with base64url output and constant-time verification. The nonce
port uses 32 random bytes and SHA-256. The repository opaque identifier uses a distinct
tenant-scoped HMAC-SHA-256 key and emits the existing `hmac_<64 hex>` shape.

Key rings are exact, versioned, injected byte inputs of at least 32 bytes. Attestation and opaque
identifier keys are separate by construction and cannot share a key object or purpose. Adapters do
not read environment variables, files, browser storage, repositories, command arguments, payload
fields, or legacy RPC responses. They do not log, serialize, return, or persist key material.

Before capability creation, the trusted server composition must successfully run
`verifyTenantAttestation`, consume the nonce, re-resolve the active membership or worker binding,
and resolve the exact processing grant. Missing, expired, future, replayed, wrong-key,
wrong-principal, wrong-tenant, removed-membership, stale-credential, missing-grant, revoked-grant,
or wrong-purpose input invokes no sink.

The runtime key source, enrollment delivery, and route authorization remain unavailable until C5
and the relevant P17-014/P17-019 boundaries. C4 source tests use synthetic keys only and do not
claim a deployed key ring.

### R1 — Exact standard retention

Verification uses the `standard` retention profile: exactly 30 days from `recordedAt`. The core
computes `expiresAt`; the RPC rejects a different interval, a future `recordedAt`, an already
expired record, and any attempted expiry extension. `storedAt` is database time and does not alter
the record's retention window.

Application roles cannot update or delete verification rows. Wave D owns service-role-only expiry
purge and tenant deletion. C4 creates no legal hold, permanent immutability, producer-selected
retention, or purge bypass.

### I1 — Tenant/writer/run idempotency with conflict refusal

The exact idempotency key is `(tenant_id, writer_id, run_id)`. One transaction inserts a new UUID
and server timestamp. A retry with the same key and exact `record_hash` returns the original
`persistence_id` and `stored_at` with `replayed=true`; it performs no update and cannot extend
retention. The first insert returns `replayed=false`.

A retry with the same key and a different hash fails with the closed database code
`p17_016_c4_verification_idempotency_conflict`. The RPC never overwrites the verdict, tier exits,
hash, time, tenant, or opaque repository identity. Concurrent same-hash retries converge on one
row; concurrent different-hash attempts leave exactly one row and at least one refusal.

The same run UUID may exist in two tenants without collision or cross-tenant lookup. A new logical
verification command uses a new command-boundary UUID rather than mutating the prior record.

### C1 — Capability-ready source, default-blocked runtime

C4 executes in four separately evidenced source slices:

1. **C4A — Plan and input lock:** this document, validator, package registration, and evidence.
2. **C4B — Typed storage and dashboard sink:** migration `0019`, rollback, exact RPC adapter,
   crypto/opaque ports, static/runtime attacks, and no route.
3. **C4C — Kit verification capability path:** a thin construct-exact verification writer accepts
   explicit trusted context, grant, clock, opaque port, and sink capability; the existing call
   site remains B2B-blocked when those inputs are absent.
4. **C4D — Disposable cross-repository proof:** apply exact `0018` then `0019` on the pinned
   PostgreSQL 17 image, compose real synthetic crypto and injected RPC transport, prove write,
   replay, conflict, two-tenant, stale credential, retention, privilege, and rollback attacks, and
   remove the labelled environment.

After C4D, the verification family may be described only as `capability_ready` in source. The
default production call remains `fail_closed/tenant_attestation_and_sink_unavailable` until C5
applies the live migrations and proves the bootstrap, keys, credentials, grant, route, and cutover.
The legacy `verify_records` reader and sync guard are not changed in C4; their live replacement is
a C5 cutover concern.

### K1 — Forward rollback before implementation

Migration `0019` is one bounded transaction with an advisory lock, timeouts, exact predecessor
checks, collision gates, privilege manifest, and post-state assertions. It must refuse if `0018`
foundation objects/signatures are missing or drifted.

The rollback is designed before promotion. The rollback refuses when the verification table is
non-empty, the RPC/table/constraint/index/grant manifest drifted, or an unexpected dependent
exists. It verifies the exact C4 post-state, removes only C4 objects, and leaves every C3 object untouched.
There is no broad recursive/destructive workspace operation and no live rollback in C4.

C4D rehearses forward, empty rollback, failed non-empty rollback atomicity, and forward-again on a
disposable engine. C5 requires a separate named live snapshot and explicit apply authority.

### E1 — Evidence ladder

Every implementation slice requires:

1. an executable plan or capability RED that fails only because the named artifact is absent;
2. focused exact-shape, TypeScript, SQL, registry, policy, writer, attestation, and predecessor
   gates;
3. PostgreSQL 17 disposable execution for migration/RPC claims, never parsed SQL or mocks as a
   substitute;
4. two independent source-denial methods with positive controls plus positive-controlled
   credential, key, long-base64, live-project-reference, and raw-field scans;
5. exact manifest, whitespace, branch, parent, and user-file preservation checks;
6. full dashboard and full kit regressions at the locked source SHAs; and
7. separate local source and evidence commits in each affected repository.

Failures, harness corrections, environment limitations, cleanup, and non-claims are recorded
immediately in the workspace handoff. No evidence contains key bytes, credentials, function
bodies, application rows, raw repository identifiers, or live project references.

## Architecture and dependency direction

Canonical privacy policy, tenant attestation, and writer contracts remain in kit `packages/core`.
Generated dashboard mirrors remain byte-identical through the existing atomic mirror tool.
Framework-neutral application code depends on ports. Dashboard infrastructure implements exact
RPC/crypto adapters. Routes and clients do not import infrastructure credentials. The kit writer
depends only on canonical core plus injected ports and has no dashboard, Supabase, fetch, env,
filesystem-spool, or global fallback dependency.

The database is defense in depth: it rechecks the active tenant, credential binding, essential
operations grant, purpose, policy, retention, exact fields, and idempotency key at write time. The
application boundary still validates the complete central record and closed receipt. Neither
layer treats legacy token authorization as tenant proof.

## C4 attack matrix

- unknown, missing, inherited, nested, oversized, control-character, secret-shaped, raw repo,
  feature, path, spec, message, prompt, URL, log, or generic JSON input;
- forged producer tenant, context/grant mismatch, wrong policy/purpose/family/writer, missing tenant
  argument, unscoped service-role call, anon/browser call, and direct table access;
- expired/future/replayed/wrong-key attestation, malformed proof, key-purpose reuse, nonce failure,
  removed membership, stale credential, revoked/expired grant, and provider error leakage;
- raw repository transmission, wrong opaque tenant, malformed opaque ID/key version, HMAC key echo,
  low-entropy raw hash surrogate, and cross-tenant local-name collision;
- producer expiry, retention extension, future record time, expired record, update/delete attempt,
  legal-hold claim, and missing future purge ownership;
- same-hash replay, conflicting-hash replay, concurrent same/different hash, cross-tenant same run,
  forged receipt, wrong persistence ID/time/hash/tenant/family, and sink exception;
- migration retry, missing/drifted `0018`, object/column/function collision, partial DDL, privilege
  drift, non-empty rollback, rollback count drift, and C3 object deletion; and
- global service client, direct kit REST/RPC, route/browser exposure, implicit env/config tenant,
  absent capability fallback, registry bulk relabel, live-availability claim, sync, or push.

## C4A implementation manifest

- `docs/roadmap/p17-016-wave-c4-verification-sink-plan.md`;
- `scripts/post-17-privacy-wave-c4-verification-sink-plan.test.ts`;
- `package.json`;
- `docs/evidence/post-17-privacy-wave-c4a-verification-sink-plan-2026-08-16.md` at closeout; and
- workspace `HANDOFF.md` transitions.

No dashboard file, migration, generated core, production writer, target, or `.Codex` path is in
C4A scope.

## Verification and closeout

C4A exits only after its validator is RED then GREEN, predecessor C1/C2/C3 and B2B contracts pass,
the full kit suite passes, the exact source/evidence manifests and hooks pass, and the local commits
read back clean. C4B may start only after that closeout.

## Non-claims

C4A does not claim a central sink exists, the verification writer is capability-ready, migration
`0018` or `0019` is live, tenant safety is proven, an attestation key or tenant exists, a central
verification row was written, the sync guard was migrated, or C4/Wave C/P17-016 is complete. It
does not authorize live SQL, application-row access, browser/provider execution, deploy, sync,
push, merge, target commands, or target `.Codex` edits.

No live SQL, sync, or push occurs in C4A.
