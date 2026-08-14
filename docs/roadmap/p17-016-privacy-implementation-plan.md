# P17-016 Privacy-Safe Data Boundary Implementation Plan

**Status:** Locked for implementation — Wave A opened
**Date:** 2026-08-14
**Task:** P17-016 — Privacy-safe specification and usage data criteria
**Accepted policy:** ADR-002 `T1/R1/C1/L1/E1`

## Outcome

P17-016 will replace implicit, single-admin data handling with a versioned, tenant-scoped,
metadata-only boundary that fails closed before central persistence. Completion requires more than
a shared validator: every central writer and read/action path must use the boundary, retention and
deletion must be executable and observable, legacy data must be quarantined or purged, and the
dashboard must prove that excluded content cannot cross tenant or API boundaries.

This plan is an implementation sequence, not authorization to run migrations or write live data.
Each wave has an independent rollback point and evidence gate.

## Locked inputs

- Tenant policy `T1`: opaque control-plane tenant UUIDs and metadata-only central storage.
- Retention policy `R1`: `central_content=0d`, `short_lived=24h`, `standard=30d`,
  `learning_aggregate=180d`, and `audit_release=365d`.
- Consent policy `C1`: essential operations require explicit enablement; all optional processing
  scopes default off.
- Legacy policy `L1`: quarantine first, explicitly map and sanitize, purge unmapped data within
  30 days.
- Evidence policy `E1`: finite immutability, metadata-only central references, and no default legal
  hold.
- Canonical data classes `D0_public_contract` through `D4_secret` and the exact central allowlists
  in ADR-002.

## Non-goals

- Storing raw specifications, prompts, completions, logs, stack traces, screenshots, evidence
  bodies, credentials, or arbitrary diagnostic text in the central store.
- Treating hashing or redaction as automatic permission to persist data.
- Trusting a producer-supplied tenant ID, retention expiry, consent decision, or user role.
- Implementing provider-specific business rules in the shared core.
- Running a live migration, provider process, sync, publication, installation, or push without its
  own explicit authorization.

## Architecture boundary

The implementation follows ports and adapters:

1. `packages/core` owns language-neutral schemas, pure validation, canonical decisions, retention
   calculations, and opaque port interfaces.
2. Kit integrations adapt current producers into exact allowlisted records. They construct new
   objects and never spread or redact-and-forward producer payloads.
3. Dashboard server repositories resolve tenant membership and call tenant-requiring storage
   functions. Browser code receives only closed response contracts and never mutates tables
   directly.
4. Migrations create tenant-scoped storage, RPCs, purge/deletion support, and a legacy quarantine
   path. Service-role access does not weaken application-layer tenant requirements.
5. Workers derive tenant context from enrolled credentials. The request body cannot select or
   override the tenant.

Pure shared-core code must not import React, Next.js, Supabase, provider SDKs, environment state,
filesystem APIs, process APIs, or network clients. Time and tenant-keyed HMAC capabilities enter
through explicit ports.

## Shared-core contract

### Versioned vocabulary

- Data classes: `D0_public_contract`, `D1_opaque_operational`, `D2_sensitive_metadata`,
  `D3_private_content`, `D4_secret`.
- Consent scopes: `essential_operations`, `learning_metrics`, `content_indexing`,
  `cross_provider_evaluation`, `diagnostic_content`.
- Retention profiles: `central_content`, `short_lived`, `standard`, `learning_aggregate`,
  `audit_release`.
- Central families: `command_run`, `token_usage`, `progress`, `verification`, `install_run`,
  `error_signal`, `learning_aggregate`, `release_dossier`.
- Legacy states: `current`, `legacy_unclassified`, `legacy_mapped`, `legacy_rejected`,
  `purge_pending`, `purged`.
- Closed rejection reasons include malformed envelopes, unknown fields, untrusted tenant context,
  disabled processing scope, prohibited content, suspected secret, invalid opaque identifier,
  invalid timestamp, invalid retention profile, and attempted retention extension.

The vocabulary is explicit and bounded. Generic extension maps, arbitrary messages, display names,
paths, URLs, headers, environments, and producer-defined reason strings are forbidden.

### Trusted tenant context

The core accepts a server- or worker-derived context containing an opaque tenant UUID, an opaque
subject UUID, source kind, credential binding identifier, and policy version. Tenant context is a
separate argument to policy evaluation, never a trusted field inside a producer record. A mismatch
between trusted context and an already-bound record fails closed.

### Consent decision

A processing grant contains only opaque tenant/subject IDs, a closed scope, policy version,
decision, purpose code, issuance time, optional revocation time, and expiry. Evaluation uses an
injected time value. Revoked, expired, wrong-tenant, wrong-policy, or absent grants deny processing.
Optional scopes remain denied when no grant exists; installation, provider selection, or route
access cannot imply consent.

### Retention decision

The server maps the record family and approved purpose to one locked profile. It computes
`expiresAt` from an injected observed time and the R1 maximum; a producer expiry is not accepted.
`central_content` is a rejection decision, not a zero-length persistence window. Boundary tests use
exact millisecond clocks at expiry and purge deadlines.

### Central record construction

Every family has an exact input schema and a canonical output schema. The evaluator:

1. verifies the trusted tenant context and required processing grant;
2. rejects unknown top-level or nested fields before any transformation;
3. validates closed identifiers, numeric bounds, timestamps, hashes, versions, states, and codes;
4. rejects secret labels, private-key markers, control characters, suspicious high-entropy values,
   encoded secret candidates, and forbidden free-text fields without echoing their values;
5. obtains tenant-keyed opaque identifiers only through the HMAC port when a low-entropy local
   identifier must be represented centrally;
6. constructs a new exact-field record with server-computed retention metadata; and
7. returns a closed allow/reject decision whose diagnostic data contains rule IDs and counts only.

### Port interfaces

- `OpaqueIdentifierPort`: converts a canonical local identifier into a tenant-keyed opaque ID and
  returns key-version metadata. The core never owns or reads the key.
- `ClockPort`: supplies the authoritative current time for expiry and grant decisions.
- `TenantContextProvider`: adapter-side interface that derives trusted tenant/subject bindings from
  a server session or enrolled worker credential.
- Repository ports added in later waves require tenant context on every method and expose no
  unscoped overload.

### Deletion contract

A deletion request and receipt contain opaque tenant/request IDs, policy/schema versions, requested
and completed timestamps, closed store IDs, bounded counts, closed outcome, retry ordinal, and a
receipt hash. Partial failures remain durable and retryable. Receipts contain no comments, paths,
object keys, query text, or raw errors. Tombstones must be reapplied before restored data becomes
queryable.

### Legacy contract

Legacy input is classified without making it tenant-visible. Unmapped rows remain
`legacy_unclassified`; an operator-provided mapping plus a passing exact sanitizer may produce
`legacy_mapped`. Rejected records become `legacy_rejected` and are scheduled for purge. No default
bootstrap-tenant assignment is permitted.

## Delivery waves

### Wave A — Pure policy contracts and attack harness

Artifacts:

- `packages/core/src/privacy-policy.ts`
- `packages/core/test/privacy-policy.test.ts`
- `docs/schemas/privacy-policy.schema.json`
- `npm run test:privacy-policy` registered in the full kit suite
- focused Wave A evidence under `docs/evidence/`

Scope:

- closed vocabulary and exact-field runtime validators;
- trusted tenant-context validation;
- consent and retention decisions using injected context/time;
- exact central-family allowlist construction;
- opaque identifier and clock ports without key or storage implementations;
- deletion receipt and legacy quarantine contracts; and
- secret-safe error behavior plus adversarial fixtures.

Wave A must not touch migrations, live data, dashboard writers/UI, provider runs, sync, or push.

Exit gate:

- positive fixture for all eight central families;
- schema/runtime agreement and deterministic canonical output;
- all Wave A attacks pass;
- focused TypeScript-compatible runtime tests, diff check, bounded secret scan with a proven
  positive control, and full kit regression pass; and
- durable evidence records any failed attempts and their correction.

### Wave B — Writer cutover before migration

Inventory and adapt every kit/dashboard central writer. New writers must construct Wave A records
and stop persisting raw args, log tails, error messages, feature/spec names, repository paths,
lesson titles, or arbitrary dossier JSON. Compatibility output remains local-only where required.

Exit gate: exact writer fixtures, no-prohibited-field source audit, error-path secret attacks, and
proof that every existing write entry point is either converted or fail-closed.

### Wave C — Tenant repositories and additive legacy migration

Add the bootstrap tenant model, memberships, worker enrollment, nullable tenant columns,
`privacy_state`, tenant-scoped keys/RPCs/policies, quarantine views, and rollback SQL. Keep legacy
rows hidden. Migration execution requires an explicitly authorized disposable or live project.

Exit gate: migration up/down or forward-rollback proof, two-tenant collision attacks, revoked
membership/stale-credential attacks, and a service-role unscoped-query source audit.

### Wave D — Retention, purge, and tenant deletion

Implement server-computed expiry, scheduled purge, finite append-only deletion exceptions,
idempotent deletion orchestration, cache/object cleanup ports, tombstones, and bounded receipts.

Exit gate: injected-clock boundaries, producer extension attacks, partial-failure retries, purge
idempotency, restore-with-tombstone, and 24-hour/72-hour deadline status proof.

### Wave E — Tenant-safe reads, actions, and dashboard

Require active tenant membership and role for every read/action repository. Return only minimized
closed contracts. Add tenant/deletion/consent status UI without raw content and integrate P17-021
RBAC/action governance when its inputs and dependencies are ready.

Exit gate: two-tenant API/browser attacks, removed-membership behavior, server-authoritative action
states, accessibility/responsive checks, and response-body scans proving excluded text is absent.

### Wave F — Legacy completion and task closeout

Map/sanitize explicitly approved legacy rows, purge rejected/unmapped rows, remove legacy query
paths, make tenant IDs non-null, and prove optional RAG remains off and isolated unless separately
enabled.

Exit gate: migration-count reconciliation, legacy quarantine/mapping/purge proof, full kit and
dashboard regressions, authorized database/browser E2E, secret scan, diff check, rollback rehearsal,
and final `docs/evidence/post-17-privacy-criteria.md`.

## Wave A attack matrix

| Boundary | Positive proof | Required attacks |
|---|---|---|
| Exact schema | One canonical fixture per central family | Unknown field, nested field, prototype key, missing field, wrong type, oversized value |
| Tenant | Trusted UUID context binds output | Forged producer tenant, context mismatch, malformed UUID, cross-tenant opaque ID reuse |
| Consent | Current same-tenant grant enables one scope | Missing, default-off, revoked, expired, wrong tenant/policy/scope, inferred consent |
| Retention | R1 expiry is computed deterministically | Producer expiry, extension, negative/future clock, prohibited central content |
| Classification | Closed D0/D1 fields pass | Email/name/path/URL/spec/prompt/log/stack/evidence body and arbitrary text |
| Secrets | Safe closed metadata passes | Cookie/auth headers, tokens, service keys, private keys, entropy, encoding, truncation |
| Unicode | Canonical closed identifiers pass | Confusables, bidi/control characters, null bytes, double encoding |
| Opaque IDs | Tenant-keyed port result and key version bind output | Raw SHA-256 surrogate, cross-tenant collision, malformed port output, value echo |
| Deletion | Canonical receipt hash verifies | Arbitrary comments, count overflow, receipt tampering, wrong tenant, invalid retry |
| Legacy | Explicit mapping plus sanitizer passes | Silent bootstrap assignment, unmapped visibility, rejected-row promotion |

## Verification ladder

1. Plan validator confirms this document remains aligned with ADR-002 and canonical P17-016 state.
2. Wave-focused unit/contract/attack tests run without network, credentials, filesystem writes, or
   environment dependencies.
3. JSON Schema fixtures and runtime validators accept/reject the same corpus.
4. Type validation uses the repository-compatible compiler path; the known TypeScript 4.9.5 versus
   installed Node 26 declaration parser mismatch is reported separately and never hidden.
5. `git diff --check` and an exact changed-file secret scan run with a known-positive control.
6. `npm run test:kit` passes before any local implementation checkpoint.
7. Later dashboard waves add focused Vitest, TypeScript, full regression, and browser evidence.
8. Database/live/provider/remote tests remain explicitly authorized tiers and cannot be reported as
   passed from mocks.

## Status and evidence rules

- Move P17-016 from `ready` to `in_progress` only when this plan is locked and Wave A production
  code begins.
- Do not mark P17-016 `done` at a Wave A checkpoint. All writer, tenant, retention/deletion,
  dashboard, legacy, and authorized E2E exit gates must pass.
- Every RED/invalid attempt is recorded immediately in both handoffs before remediation.
- Each wave produces dated durable evidence and a local commit with an exact reviewed file set.
- Dashboard roadmap tracking is reconciled whenever canonical task status changes.

## Rollback

- The verified 2026-08-14 backup and `backup/2026-08-14` tag are the current rollback boundary.
- Wave A rollback is a local commit revert or restoration of its exact files; it has no persisted
  external state.
- Later migration waves require their own same-day backup, additive migration plan, data export or
  snapshot, rollback SQL, and post-rollback count/tenant-isolation evidence before execution.
- A failed bulk update or migration is restored before retry; the workspace must not remain in a
  half-migrated state.

## Example outcomes

- A prompt-evolution metric stores `lesson_code=selector_contract` and bounded counts without a
  lesson title, feature name, prompt, or private specification body.
- Two tenants may use the same local repository name, but tenant-keyed opaque repository IDs and
  tenant-scoped keys prevent cross-tenant resolution.
- A producer sending `expiresAt` cannot extend a standard record beyond 30 days because the field is
  rejected and the server computes expiry.
- A support error containing an authorization token is rejected with `suspected_secret`; neither
  the token nor surrounding text appears in errors or metrics.
- A deleted tenant produces a bounded receipt and tombstone while raw object keys and error text
  remain absent from the central audit record.
