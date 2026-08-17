# ADR-002: Use a tenant-scoped, metadata-only central data boundary

**Status:** Accepted — policy input locked; implementation in progress (Wave A)
**Date:** 2026-08-14
**Deciders:** Workflow-kit operator and maintainers
**Roadmap task:** P17-016

## Context

Post-17 learning, evaluation, cross-machine progress, optional retrieval, and the distributed
Control Panel need one explicit privacy boundary. The current system has useful integrity controls,
but it was built as a private single-admin deployment and does not yet provide a tenant model or a
uniform retention/deletion contract.

Current-state reconciliation found these concrete boundaries:

| Surface | Current state | Required P17-016 treatment |
|---|---|---|
| `command_runs` | Persists raw `args` and the last 4,000 characters of `log_tail`; the original migration grants `anon` all access. | Stop central free-text persistence, revoke browser writes, tenant-scope every row, and retain only closed operational metadata. |
| `usage_logs` / `error_reports` | Feature names and raw joined error messages can be persisted. | Replace private names/messages with an opaque feature signal and closed error/reason codes. |
| `verify_records` | Can store repository, feature, exact `code_path`, and `spec_name`; legacy policies permit anonymous mutation/read. | Keep hashes, version, verdict, exit codes, and opaque IDs only; remove public mutation and tenant-scope reads/writes. |
| Progress ledger | Uses closed fields, hash chains, service-role RPC writes, and injected expiry, but has no `tenant_id`. | Preserve the closed event contract, add tenant identity to keys/RPCs/read paths, and bind retention classes to this policy. |
| Version dossiers/lessons | Append-only JSON snapshots can retain lesson titles; triggers currently reject deletion even for service-role callers. | Remove lesson free text from central snapshots and make immutability finite: retention purge must remain possible. |
| Semantic Spec and evidence bundles | Can contain source references, titles, requirement text, Given/When/Then statements, exact quotes, paths, and transcripts. They are currently local artifacts. | Keep bodies local-only by default. Central systems may receive bounded hashes and closed metadata, never raw specification or transcript content. |
| Dashboard RBAC | Resolves an email to a global role; there is no tenant membership context. | Resolve tenant membership server-side before every read/action; role alone is insufficient. |

This is an engineering data-handling decision, not a claim of compliance with any jurisdiction.
Deployment owners remain responsible for applicable legal, employment, contractual, and data
residency requirements.

## Decision

Adopt **Option T1: opaque multi-tenant identity plus a strict metadata-only central store**.
Installation or provider use does not grant permission to warehouse specification content.
Unknown fields and unclassified data fail closed before persistence.

The operator accepted all five policy choices in `Operator decision required` on 2026-08-14.
P17-016 input readiness is complete and the task is `in_progress` under the locked Wave A plan; no
migration or external write is implied by acceptance or by the pure shared-core implementation.

## Acceptance record

- Accepted on: 2026-08-14.
- Accepted choice set: `T1/R1/C1/L1/E1`.
- Exact approval: `APPROVE P17-016 POLICY v1: tenant=T1, retention=R1, consent=C1, legacy=L1, evidence=E1.`
- Effect: closes only `operator-approved retention and tenant policy`; implementation and every
  external action retain their separate gates.

## Data classification

| Class | Meaning | Examples | Central handling |
|---|---|---|---|
| `D0_public_contract` | Public, bounded product contract data. | Schema versions, kit versions, closed phase/state/reason codes. | Allowlisted with tenant context where associated with a run. |
| `D1_opaque_operational` | Pseudonymous operational identity or measurement. | Tenant UUID, run/event UUID, tenant-keyed repository HMAC, hashes, counts, durations, token/cost aggregates. | Allowlisted, purpose-limited, expiring, and tenant-scoped. |
| `D2_sensitive_metadata` | Metadata that can reveal people, projects, or private work. | Email, raw repository name/path, feature/spec name, source reference, command args, lesson title, error text, log tail. | Local-only by default. A central contract must replace it with a closed code or tenant-keyed opaque value; redaction alone does not authorize storage. |
| `D3_private_content` | Source or generated content. | Raw spec, prompt, quote, requirement, scenario, contract value, file content, provider output, transcript, screenshot. | Never stored in the central operational/learning store. Local ephemeral use only unless a separate content-indexing grant is explicitly enabled. |
| `D4_secret` | Authentication or credential material. | Tokens, cookies, authorization headers, service keys, secret-bearing environment values, private keys. | Reject before write, never log/index/hash as an identifier, and emit only a closed rejection code. |

Hashing is not anonymization. Low-entropy identifiers such as repository or feature names must use a
tenant-specific keyed HMAC with key rotation metadata; raw SHA-256 of such names is not an accepted
pseudonymization boundary.

## Central persistence allowlist

Central writers must construct a new exact-field object from the allowlist below. They must not
spread, serialize, or redact-and-forward the producer object. No central table in this policy accepts
arbitrary free text.

| Data family | Allowed fields | Explicitly excluded |
|---|---|---|
| Command run | `tenant_id`, run UUID, tenant-keyed opaque repo ID, closed command/runner/model/status/reason, kit version, timestamps, duration, exit code. | `args`, prompt summary, `log_tail`, full log, path, hostname, provider response. |
| Token/usage aggregate | `tenant_id`, run UUID, numeric token/cache/cost aggregates, model ID, pricing snapshot version/status, observed timestamp. | Prompt, completion, user identity, raw provider receipt body. |
| Progress | `tenant_id`, bounded task/run/machine/provider IDs, attempt lineage, closed state/phase/reason, event/evidence hashes, evidence media type/bytes/verification status, timestamps, retention class. | Evidence body, display alias, environment, generic message, path, URL, host, headers. |
| Verification | `tenant_id`, run UUID, tenant-keyed opaque repo ID, content hash, version, boolean verdict, bounded tier exit codes, timestamp. | Raw repo, feature, `code_path`, `spec_name`, spec body. |
| Install/run version | `tenant_id`, tenant-keyed opaque repo ID, kit version and timestamps. | Raw repository name/path. |
| Error signal | `tenant_id`, run/token subject ID, closed error type, phase, reason code, kit version, timestamp. | Error message, stack trace, file/path excerpt, provider output. |
| Learning aggregate | `tenant_id`, policy/schema version, closed lesson/metric ID, counts/rates, evidence hash, time bucket. | Lesson title, prompt evolution prose, spec/feature name, example body. |
| Release dossier | `tenant_id`, version, input/verdict hashes, numeric aggregates, closed recommendation/canary status, opaque lesson IDs, timestamps. | Arbitrary JSON snapshots, lesson title, content excerpts. |

Local repository evidence may retain content under the repository owner's own access, version
control, and deletion policy. A central evidence reference may carry only its hash, schema version,
media type, byte count, closed label, verification status, and expiry. A hash reference never grants
the Control Panel permission to retrieve the body.

## Tenant isolation

1. `tenant_id` is an opaque UUID created by the control plane. Email, repository name, machine ID,
   token prefix, or provider account is never a tenant key.
2. Browser sessions resolve `auth.uid()` to an active tenant membership and role on the server.
   Every page, API, repository port, and action requires both values.
3. Worker credentials are enrolled to exactly one tenant. Writers derive the tenant from that
   credential; a producer-supplied `tenant_id` is rejected or ignored, never trusted.
4. Every central data row includes non-null `tenant_id`. Natural uniqueness, foreign keys, RPC
   lookups, evidence references, retry lineage, caches, and indexes include the tenant boundary.
5. Browser roles receive no direct table mutation. Service-role code must use tenant-requiring
   repository functions/RPCs with no unscoped overload. Because service role bypasses RLS, tests
   must prove that application code cannot issue an unscoped query.
6. The current private deployment is represented by one generated bootstrap tenant; no global or
   hardcoded implicit tenant remains after migration.
7. A deployment that requires stronger physical isolation may use one Supabase project per tenant,
   but it must preserve the same application contract and evidence semantics.

## Processing grants and consent

Use versioned, auditable per-tenant grants. Revocation affects new processing immediately and queues
deletion for data that no longer has another approved purpose.

| Scope | Recommended default `C1` | Meaning |
|---|---|---|
| `essential_operations` | Enabled only when the operator enables the control plane for that tenant. | Metadata required to run, resume, secure, and display the service. |
| `learning_metrics` | Off. | De-identified/opaque aggregate signals used to improve prompts or routing. |
| `content_indexing` | Off. | Tenant-private RAG index over explicitly selected sources. |
| `cross_provider_evaluation` | Off. | Sending an approved test input to more than one provider. |
| `diagnostic_content` | Off. | Time-limited support access to explicitly selected content; it is not enabled by an error event. |

Grant records contain tenant/user opaque IDs, scope, policy version, decision, purpose, and
timestamps only. Consent is not inferred from installing a plugin, selecting a provider, opening a
dashboard route, or retaining a repository evidence file.

## Retention and deletion

Adopt recommended schedule `R1`:

| Retention profile | Maximum central retention | Applies to |
|---|---:|---|
| `central_content` | `0` days | D3 private bodies and D4 secrets: prohibited from the central store. |
| `short_lived` | 24 hours | Disposable canaries, temporary progress, bounded diagnostic metadata. |
| `standard` | 30 days | Command/progress/verification operational metadata. |
| `learning_aggregate` | 180 days | Opted-in aggregate learning metrics with no free text. |
| `audit_release` | 365 days | Consent/deletion receipts, security audit metadata, and bounded release dossier metadata. |

There is no indefinite default and no silent legal hold. A future legal hold requires a separately
approved purpose, scope, owner, and expiry; it cannot retain D3/D4 data that this policy forbids from
central persistence.

- The server computes `expires_at`; clients and workers cannot extend it.
- Expired rows, derived caches, object references, and optional RAG chunks are purged within 24
  hours of expiry. A tenant deletion request completes within 72 hours or surfaces a durable failed
  deletion state for operator action.
- Append-only means immutable during the active evidence window, not permanent. Dedicated,
  service-role-only purge RPCs may delete expired or tenant-requested rows. Existing triggers that
  reject every delete must be replaced without permitting general update/delete access.
- Deletion is fail-closed and retryable. A receipt stores only tenant ID, policy version, request
  and completion timestamps, affected store identifiers/counts, outcome code, and receipt hash.
- Backups must follow the same maximum window or use tenant-key destruction. Restore procedures
  reapply tombstones before restored data becomes queryable.

## Redaction and rejection boundary

1. Exact allowlist validation runs before persistence; an unknown field rejects the event.
2. D4 patterns, high-entropy secret candidates, authorization/cookie/key labels, and private-key
   markers reject the write and return a closed reason code.
3. Permitted identifiers are canonicalized and converted to tenant-keyed opaque IDs before leaving
   the worker or server trust boundary.
4. Any permitted diagnostic transformation runs in memory and emits only a closed error/reason
   code. Replacing text with `[REDACTED]` does not make arbitrary surrounding text persistable.
5. Sanitizer errors never echo the rejected value. Metrics record only the rule ID and count.
6. Unicode normalization, nested JSON, encoded values, truncation boundaries, and log-control
   characters are handled before classification.

## Evidence, RAG, provider, and Control Plane boundaries

- Evidence bodies stay local or in an explicitly tenant-owned object store. The shared ledger and
  Control Panel use metadata references only and must not dereference them without a separate
  authorized capability.
- Optional RAG is a separate `content_indexing` grant. Its index, embeddings, cache, retrieval, and
  deletion are tenant-scoped. Retrieved content is advisory and cannot override deterministic
  repository facts, approval gates, or evidence verification.
- Provider adapters may transmit the minimum task content needed for an operator-selected run, but
  provider execution does not authorize central retention or cross-provider reuse. Cross-provider
  evaluation requires its own grant and a named golden fixture.
- The Control Panel displays closed states, opaque identities, aggregates, hashes, and deletion
  status. It does not expose raw args, logs, error text, specifications, or evidence bodies.
- Approve/cancel/retry actions require tenant membership plus role, use idempotency/race controls,
  and write an expiring audit event without arbitrary comments.

## Legacy data migration

Adopt recommended handling `L1`:

1. Stop new writes of raw `args`, `log_tail`, error messages, spec/path/name fields, and lesson
   titles before attempting tenant backfill.
2. Add nullable `tenant_id` plus `privacy_state='legacy_unclassified'` in an additive migration.
   Legacy rows are hidden from tenant views and cannot enter learning/RAG inputs.
3. Migrate only rows with an operator-provided tenant mapping and a passing allowlist sanitizer.
4. Purge unmapped or rejected legacy rows within 30 days after an optional operator export.
5. Make `tenant_id` non-null, add tenant-scoped keys/policies/RPCs, and remove legacy query paths
   only after migration counts and cross-tenant attacks pass.

Silently assigning all historical rows to the bootstrap tenant is not allowed.

## Verification and attack plan

Implementation evidence must include:

- exact-schema positive fixtures for every writer and negative fixtures for unknown/nested fields;
- emails, names, paths, URLs, prompt/spec text, stack traces, cookies, auth headers, private keys,
  high-entropy values, Unicode confusables, control characters, double encoding, and truncation;
- forged tenant IDs, same run/evidence IDs in two tenants, cross-tenant retry/evidence references,
  removed membership, stale worker credentials, and a service-role unscoped-query source audit;
- expiry boundary clocks, producer attempts to extend retention, purge idempotency, partial object/
  row/cache failure, retry, restore-with-tombstone, and tenant deletion receipts;
- append-only mutation refusal during retention plus authorized expiry deletion afterward;
- legacy quarantine, approved mapping, sanitizer rejection, and unmapped-row purge;
- RAG opt-in/off defaults, tenant index isolation, injection not overriding deterministic facts,
  and deletion cascading through chunks/embeddings/cache;
- RBAC approve/cancel/retry races and proof that the UI/API never returns excluded free text; and
- focused unit/contract tests, migration tests against an explicitly authorized disposable/live
  database, full kit/dashboard regressions, browser E2E, secret scan, diff check, and durable
  evidence at `docs/evidence/post-17-privacy-criteria.md`.

## Options considered

### Option T1: Tenant-scoped metadata-only central store — recommended

**Pros:** smallest privacy surface, supports public-quality multi-tenant control-plane work, keeps
learning and RAG optional, and makes deletion testable.

**Cons:** requires a two-phase legacy migration, tenant-aware repositories/RPCs, and reduced remote
diagnostic detail.

### Option T2: Keep a single-tenant/local-admin model

**Pros:** least schema work and appropriate for one private operator.

**Cons:** cannot honestly satisfy cross-tenant acceptance or the distributed public Control Panel;
would keep P17-014/P17-021 blocked.

### Option T3: Centralize encrypted specifications and logs

**Pros:** richer search, support, and learning inputs.

**Cons:** materially larger breach/deletion/provider risk, key-management burden, and no current
approved need. Encryption does not remove tenant, consent, retention, or content-injection duties.

## Trade-offs

The recommended option favors bounded operational proof over rich centralized debugging. Operators
lose a convenient remote log/spec view, but gain a smaller breach surface, deterministic deletion,
and one provider-neutral contract. Optional RAG remains possible, but it becomes a separate
tenant-owned subsystem rather than a hidden side effect of telemetry or evidence tracking.

## Consequences

- P17-015's current `short_lived` and `standard` labels gain exact durations, but its schema/RPCs
  require tenant-aware revision before production dependency use.
- P17-017 cannot index content until `content_indexing` consent, tenant isolation, benchmark,
  injection controls, and deletion propagation are proven.
- P17-021 cannot implement real control actions until tenant membership, data minimization, and
  deletion/status contracts are complete.
- Existing `anon` table policies and permanent append-only delete blockers must not survive the
  P17-016 migration.
- Local source/evidence files remain under repository-owner policy; this ADR does not silently
  delete or upload them.
- No sync, provider run, database migration, installation, publication, or push is authorized by
  accepting this ADR.

## Operator decision required

Approve or replace each choice:

| ID | Recommended choice | Alternative requiring explicit text |
|---|---|---|
| Tenant | `T1` metadata-only multi-tenant boundary | `T2` or `T3`, with accepted roadmap impact. |
| Retention | `R1` = 0d content, 24h short-lived, 30d standard, 180d learning, 365d audit/release | Exact replacement duration for every profile. |
| Consent | `C1` = essential only when enabled; all optional scopes off | Exact default for each named scope. |
| Legacy | `L1` = quarantine, explicit mapping/sanitization, purge unmapped within 30d | Exact mapping/export/purge policy. |
| Evidence | `E1` = finite immutability, metadata-only central references, no default legal hold | Exact exception, owner, purpose, and expiry. |

Recommended approval statement:

`APPROVE P17-016 POLICY v1: tenant=T1, retention=R1, consent=C1, legacy=L1, evidence=E1.`

Approval accepts the engineering defaults above and unlocks readiness reconciliation only. External
database writes, migrations, sync, push, provider execution, installation, and publication retain
their separate authorization gates.

## Action items after approval

1. Mark only the P17-016 input gap complete and checkpoint the accepted ADR; do not mark the task
   done.
2. Lock exact shared-core classification, consent, tenant-context, retention, deletion, and receipt
   schemas before storage changes.
3. Implement new writers first so prohibited free text stops entering central stores.
4. Apply the two-phase tenant/legacy migration only to an explicitly authorized project with
   rollback and cleanup evidence.
5. Add tenant-scoped read/action ports, retention purge, deletion status, and safe dashboard UI.
6. Run the full attack/evidence ladder before completing P17-016 or unlocking dependent tasks.
