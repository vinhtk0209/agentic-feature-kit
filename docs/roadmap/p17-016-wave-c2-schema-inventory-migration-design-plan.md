# P17-016 Wave C2: Exact schema inventory and additive migration design

**Status:** Authorized under standing continuation authority — C2 offline design in progress; no SQL execution or sink
**Date:** 2026-08-16
**Roadmap task:** P17-016
**Parent policy:** ADR-002 `T1/R1/C1/L1/E1`
**Parent topology:** ADR-003 `T1/M1/X1/R1/E1/S1`
**Parent Wave C plan:** C1 `F1/M1/G1/A1/Q1/S1/X1/R1/E1`
**Locked C2 scope:** `inventory=I1, ownership=O1, ordering=D1, foundation=F1, quarantine=Q1, access=A1, auth=H1, rollback=R1, execution=X1, evidence=E1`

## Outcome

Wave C2 turns the exact live `public` catalog and both repository migration histories into one
offline, reviewable, collision-safe migration design. It defines the tenant foundation, additive
legacy quarantine, direct-access quarantine, promotion order, and forward rollback before any
production migration or repository adapter exists.

C2 is design-only. Its SQL artifacts live under dashboard `docs/roadmap`, are marked `DESIGN ONLY —
DO NOT APPLY`, and are rejected if they appear under either repository's `migrations/` directory.
Accordingly, no file is promoted into either `migrations/` directory in C2.
No SQL execution and no sink are part of this scope. P17-016 remains `in_progress`.

## Authorized catalog boundary

The operator's standing continuation authority allowed a read-only catalog query on Supabase
project `vkuojxgvkxndftenrdno`. A separate SQL Editor snippet preserved the pre-existing operator
draft and executed one `WITH ... SELECT jsonb_pretty(...)` statement against schema `public`.

The query collected relation, column, constraint, index, policy, grant, function-signature/hash,
trigger, enum, sequence, RLS, and catalog-estimate metadata. It did not read application row bodies,
call an application RPC, persist function bodies, execute DDL/DML, or create a sink. The exact query
and normalized snapshot are durable dashboard evidence.

A final review found that `information_schema.role_table_grants` does not expose the PostgreSQL
`MAINTAIN` ACL entries present in this project and does not provide a sufficient proof about the
`PUBLIC` grantee. A second metadata-only query therefore expands each of the 20 relation ACLs with
`aclexplode`. Its exact 580-entry manifest has SHA-256
`7e4be34c27d919534204a3a850f9714308ae8ba98527c596b938496ffe836996`: all grants originate from
`postgres`, none is grantable, and no entry targets `PUBLIC`. The query and a lossless access-class
normalization are separate dashboard evidence; neither query reads application rows.

The canonical source-object SHA-256 is
`e21954c4d0c30f15839a9fee3e15478135a54e4f5337f33ec872ea10c7fa7144` over `127,644` canonical
bytes. C3 must re-prove the live catalog hash or stop for reconciliation. A changed hash is not an
automatic migration failure when only catalog statistics drift; it is a mandatory human-reviewed
diff gate before promotion.

## Exact live inventory

The captured schema contains 20 public relations, 199 columns, 96 constraints, 53 indexes, 17
policies, 507 table grants, 12 functions, and 3 triggers. It has no public enum or sequence object.
All 20 relations have RLS enabled; none has `FORCE ROW LEVEL SECURITY`.

The `507 table grants` count is the original information-schema view. Direct ACL expansion is the
authoritative access manifest and contains 580 entries because it also includes 73 `MAINTAIN`
privileges. Seventeen relations give all eight table privileges to `anon`, `authenticated`,
`postgres`, and `service_role`. Each progress relation gives all eight to `postgres` and
`MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE` to `service_role`; `role_audit` gives all eight to
`postgres` and `INSERT/SELECT` to `service_role`.

Seventeen relations expose direct `anon` and `authenticated` table privileges inherited from the
current Supabase defaults. The two progress relations and `role_audit` are the three exceptions.
Policies still allow anonymous all-access to command/token usage, anonymous insert/update/select
for install/run/verification records, anonymous inserts for usage/error signals, anonymous reads
for orchestration tables, and a public role-audit insert policy.

The live function manifest contains:

- tenant-unaware progress RPCs `register_progress_run` and `append_progress_event`;
- resume RPCs `pause_codex_run` and `claim_codex_resume`;
- global-email role RPCs `grant_role` and `revoke_role`;
- append-only trigger functions for version analysis, canaries, and lessons;
- legacy `token_id_for`; and
- two- and three-argument `verify_kit_token` overloads.

Function definitions are represented only by MD5/length metadata in the evidence snapshot. No
function body was persisted by C2.

## Canonical SQL ownership and ordering

`kit-dashboard` is the only Wave C SQL owner. It owns the application database, its migration
history reaches `0017`, and it already owns the majority of the live tables and RPCs. The kit
migrations `0001` through `0004` are immutable legacy inputs; the kit does not create a competing
`0005` Wave C migration.

C2 reserves future dashboard promotion number `0018` but does not create it. The two design files
are not migration inputs. C3 may promote the reviewed forward design to exactly
`kit-dashboard/migrations/0018_p17_016_tenant_foundation_quarantine.sql` and retain the reviewed
rollback as the matching operator rollback artifact only after all C3 source gates pass.

Promotion order is fail-closed:

1. re-run the exact metadata query and reconcile its canonical hash/count/manifest;
2. prove no `0018` collision and no Wave C migration exists in the kit;
3. replace the legacy verifier with a bounded read-only three-argument auth path, revoke the
   two-argument overload/token helper from public roles, and implement tenant-required repository/
   attestation adapters with production writers still blocked;
4. copy the reviewed design into the reserved dashboard migration path without semantic drift;
5. run static SQL/TypeScript/full regressions and credential/source-denial gates;
6. rehearse forward plus rollback on an authorized disposable database; and
7. only C5 may apply the named migration to the authorized live project after its own snapshot and
   two-tenant proof gates.

## Locked design decisions

### I1 — Reproducible catalog input

The dashboard queries and normalized JSON snapshots are mandatory inputs. The validator binds the
project reference, metadata-only boundary, source hash/byte count, aggregate counts, ordered 20-
relation list, 17-policy count, RLS state, and absence of persisted function bodies. Any missing,
reordered, broadened, or data-reading query fails C2.

The forward preflight returns `p17_016_c2_policy_manifest_drift` when the exact policy set differs
and `p17_016_c2_grant_principal_drift` when an unexpected table-grant principal exists. It also
returns `p17_016_c2_grant_manifest_drift` unless the exact 580 relation/grantor/grantee/privilege/
grantable ACL tuples match the supplemental snapshot, including zero `PUBLIC` and zero grantable
entries. These gates run before foundation DDL and complement, rather than replace, both catalog-
hash reviews.

### O1 — Dashboard-only Wave C SQL owner

All new Wave C database objects and changes have one canonical owner: `kit-dashboard`. Kit code may
consume generated privacy contracts and blocked writer receipts, but it may not own a parallel SQL
ledger. C2 adds no migration file to either repository.

### D1 — Collision-safe promotion order

The design declares future migration `0018` without creating it. C3 must prove that the dashboard's
latest migration is still `0017`, that neither repository contains another Wave C migration, and
that the live catalog has been reconciled. If any condition changes, promotion stops and receives a
new plan/evidence update instead of renumbering or applying silently.

### F1 — Closed tenant foundation

The forward design creates five empty, opaque foundation tables:

1. `privacy_tenants` — tenant UUID, policy version, closed state, optimistic version, retention/
   deletion state, and timestamps;
2. `privacy_tenant_memberships` — tenant/subject UUID, closed tenant role/state, policy version,
   issuance/revocation, and optimistic version;
3. `privacy_processing_grants` — tenant/subject UUID, one ADR-002 scope, closed decision/purpose,
   policy version, issuance/expiry/revocation, and optimistic version;
4. `privacy_credential_bindings` — tenant-scoped browser-subject or worker-machine binding, closed
   source/state, key/policy version, lifetime, and optimistic version; and
5. `privacy_attestation_nonces` — tenant/binding/purpose-bound nonce hash, expiry, and one-use time.

All five enable and force RLS, expose no policy, and revoke direct table access from `PUBLIC`,
`anon`, `authenticated`, and `service_role`. C3 must supply exact tenant-requiring security-definer
RPCs before any row can be created. No bootstrap tenant is created. Email, organization name,
repository name, hostname, token prefix, provider account, or machine label is absent from every
foundation identity.

### Q1 — Additive legacy quarantine

All 20 cataloged relations receive nullable `tenant_id` plus closed quarantine metadata:
`privacy_state`, `privacy_policy_version`, `privacy_retention_class`, `privacy_expires_at`,
`privacy_mapped_at`, and `privacy_purge_after`.
The allowlist covers all 20 cataloged relations and the access manifest covers all 17 cataloged policies.

`privacy_state` defaults to `legacy_unclassified`, so existing rows remain explicitly unmapped.
Allowed later states are `legacy_unclassified`, `legacy_mapped`, `legacy_rejected`, and
`purge_pending`, matching the existing shared privacy core. Only `legacy_mapped` may carry a tenant and requires policy, retention, expiry,
and mapping time. Rejected/purge-due rows remain tenantless and require a purge deadline. A partial
tenant mapping or arbitrary state shape is rejected by one table-local check constraint.

No historical row is assigned to a tenant. The design contains no bootstrap insert, data backfill,
sanitizer claim, `tenant_id NOT NULL`, delete, purge, or legacy content exposure. Mapping, sanitizer,
30-day purge scheduling, and later tenant-safe views/repositories belong to C3/C5.

### A1 — Direct-access quarantine

The forward design drops all 17 cataloged policies by exact table/name, revokes all direct table
privileges from `PUBLIC`, `anon`, and `authenticated` on every legacy relation, and forces RLS. It
does not grant a replacement browser policy. Dashboard access must later flow through tenant-
requiring server repositories/RPCs.

Existing `service_role` grants are not broadened. The two progress relations keep their current
service-role `MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE` table privileges and RPC write boundary.
C3 must remove unscoped service-role application access before promotion; SQL/RLS alone cannot
constrain a BYPASSRLS role.

### H1 — Legacy auth remediation gate

The focused live function-body audit proves legacy `verify_kit_token` cannot be treated as
authentication-only. The three-argument overload updates bypass/token counters, inserts usage
events, and returns raw owner identity. The two-argument overload also updates/inserts and returns
owner identity. `token_id_for` is a security-definer token lookup executable through public app
roles. C2 records only this bounded behavior summary; raw function bodies are not persisted.

The forward design therefore fails before its first DDL with closed code
`p17_016_c2_legacy_auth_side_effects_present` while the three-argument definition contains row DML
or raw owner output. It refuses `p17_016_c2_legacy_auth_not_read_only` unless PostgreSQL classifies
the replacement as `STABLE`, `p17_016_c2_legacy_two_param_present` while the obsolete overload
exists at all, and `p17_016_c2_token_helper_exposed` while `anon`, `authenticated`, or `service_role`
can execute `token_id_for` (including inherited `PUBLIC` execution).

C3 must keep a compatible three-argument authentication input but replace its body with a bounded,
`STABLE`, read-only result that contains no raw owner identity, counter mutation, usage insert,
dynamic SQL, tenant context, processing grant, or sink capability. C3 must drop the two-argument
overload and revoke all app-role execution of the token helper. Authentication success still does not produce
`TrustedTenantContext`; only the separately verified attestation path may do so. The design
establishes only that no central sink is available in C2.

### R1 — Forward rollback contract

The rollback is exact and fail-closed. It first locks and verifies that all five foundation tables
are empty and every legacy relation remains `legacy_unclassified` with null tenant/mapping/policy/
retention/expiry/purge metadata. Rollback refuses a non-empty foundation or classified legacy row.
In exact contract form, rollback refuses a non-empty foundation or classified legacy row.

Only after those preconditions pass may rollback restore the exact 17 prior policies, restore prior
direct `anon`/`authenticated` grants only on the 17 relations that had them, remove forced RLS,
drop quarantine indexes/constraints/columns, and drop the five empty foundation tables in dependency
order. It never deletes application rows or guesses a tenant mapping.
It does not restore unsafe legacy verifier side effects or public token-helper/two-argument
execution, because H1 remediation is a prerequisite outside the C2-owned objects.

A failed uncommitted forward transaction rolls back atomically. The separate forward rollback is
for a committed-but-not-used additive schema and must be rehearsed on a disposable database before
live execution.

### X1 — Offline design execution

C2 reads local files and the already authorized metadata snapshot. It may run Node/TypeScript/
Vitest/static source checks. It does not connect to Supabase, run SQL, call an RPC, use a provider,
run a migration tool, sync, deploy, execute a canary, edit a target, or touch target `.Codex`.

### E1 — Evidence ladder

C2 requires the initial missing-plan RED control, plan-first GREEN, dashboard forward/rollback RED/
GREEN attacks, exact TypeScript, C1/privacy/registry/roadmap companions, full kit/dashboard tests,
positive-control source denial, five credential detectors, exact manifests, separate source and
evidence commits per repository, clean readback, and immediate handoff transitions. Static SQL
proof is labeled offline and never substituted for C3/C5 database evidence.

## Exact relation and policy manifest

| Relation | Source/owner before Wave C | Primary privacy issue | C2 treatment |
|---|---|---|---|
| `admin_bypass` | external legacy/dashboard | label and credential-derived hash/prefix | quarantine; revoke direct roles |
| `command_runs` | dashboard `0003`–`0016` | raw args/log/repo plus anon all | quarantine; drop `command_runs_anon_all` |
| `deployments` | dashboard `0002` | raw repo/deployer | quarantine; revoke direct roles |
| `error_reports` | external legacy | raw message/token link | quarantine; drop `anon can insert errors` |
| `installs` | kit `0001` | raw repo plus anon write/read | quarantine; drop three install policies |
| `needs_input_requests` | dashboard `0009` | free-text question/answer/actor | quarantine; drop anon read |
| `orchestrator_events` | dashboard `0009` | free-text detail | quarantine; drop anon read |
| `phase_queue` | dashboard `0009` | raw repo/probe output | quarantine; drop anon read |
| `progress_events` | dashboard `0017` | no tenant key | quarantine; retain closed service RPC boundary |
| `progress_run_bindings` | dashboard `0017` | raw repo and no tenant key | quarantine; retain closed service RPC boundary |
| `repo_runs` | kit `0002` | raw repo plus anon write/read | quarantine; drop three repo-run policies |
| `role_audit` | dashboard `0008` | global emails/public insert policy | quarantine; drop public insert policy |
| `token_usage` | dashboard `0003/0010/0015` | global run plus anon all | quarantine; drop `token_usage_anon_all` |
| `tokens` | external legacy | owner identity and auth-token metadata | quarantine; revoke direct roles |
| `usage_logs` | external legacy | feature name plus anon insert | quarantine; drop `anon can insert logs` |
| `user_roles` | dashboard `0005` | global email membership surrogate | quarantine; revoke direct roles |
| `verify_records` | kit `0003/0004` | raw repo/feature/path plus anon write/read | quarantine; drop three verify policies |
| `version_analysis` | dashboard `0011` | arbitrary JSON snapshot | quarantine; finite-retention redesign later |
| `version_canaries` | dashboard `0012` | global dossier identity | quarantine; finite-retention redesign later |
| `version_lessons` | dashboard `0013` | lesson title | quarantine; finite-retention redesign later |

The exact policy names removed by the forward design and restored by rollback are:

- `command_runs.command_runs_anon_all`;
- `error_reports.anon can insert errors`;
- `installs.anon insert installs`, `anon select installs`, `anon update installs`;
- `needs_input_requests.needs_input_requests_anon_select`;
- `orchestrator_events.orchestrator_events_anon_select`;
- `phase_queue.phase_queue_anon_select`;
- `repo_runs.anon insert repo_runs`, `anon select repo_runs`, `anon update repo_runs`;
- `role_audit.role_audit_insert_only`;
- `token_usage.token_usage_anon_all`;
- `usage_logs.anon can insert logs`; and
- `verify_records.anon insert verify_records`, `anon select verify_records`, `anon update verify_records`.

## Forward design contract

The dashboard forward-design SQL must:

1. begin and commit one transaction with a transaction-scoped advisory lock;
2. assert the exact 20 relations exist before mutation;
3. assert the exact 17-policy set and exact 580-entry direct ACL manifest, including no `PUBLIC` or
   grantable entry;
4. create the five empty foundation tables with exact closed checks and no direct app-role access;
5. enable/force RLS on the foundation and all 20 legacy relations;
6. add the seven quarantine columns, one shape constraint, and one bounded tenant/state/expiry index
   per legacy relation using an exact allowlisted loop;
7. drop exactly the 17 policies and revoke direct `PUBLIC`/`anon`/`authenticated` table access;
8. fail before DDL until the exact H1 read-only/removal preconditions pass; and
9. contain no row DML, bootstrap seed, tenant backfill, central writer/sink, free-text copy, migration
   runner directive, or destructive legacy DDL.

## Rollback design contract

The dashboard rollback-design SQL must:

1. begin and commit one transaction under the same advisory lock;
2. lock all 20 relations and five foundation tables;
3. refuse any foundation row or any non-default/classified quarantine state;
4. restore exactly the 17 cataloged policies with their prior commands/roles/expressions;
5. restore prior direct `anon` and `authenticated` table grants on only the 17 applicable relations;
6. remove forced RLS without disabling RLS;
7. drop only C2-owned indexes, constraints, and seven columns; and
8. drop only the five empty C2 foundation tables in dependency order.

Rollback contains no `DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, tenant assignment, purge, or sink.

## C3 promotion gate

C3 receives this design as input, not as applied state. Before promotion it must implement tenant-
requiring repositories/RPCs, trusted attestation verification, closed membership/grant resolution,
legacy sanitizer/mapping contracts, and direct service-role source denial. All existing production
central writers stay blocked.

C3 then re-captures the catalog, proves the old/new difference is understood, validates the future
`0018` collision and exact SQL drift, and may use an explicitly authorized disposable database.
Live project migration, bootstrap tenant creation, mapping, two-tenant proof, rollback rehearsal,
or writer cutover remains C5 work even if C3 static/disposable tests pass.

## C2 implementation manifest

Kit source scope:

- `docs/roadmap/p17-016-wave-c2-schema-inventory-migration-design-plan.md`;
- `scripts/post-17-privacy-wave-c2-schema-migration-design.test.ts`;
- `package.json` registration; and
- predecessor C1 cross-reference if required by truth reconciliation.

Dashboard source scope:

- `docs/evidence/p17-016-wave-c2-live-catalog-query-2026-08-15.sql`;
- `docs/evidence/p17-016-wave-c2-live-catalog-snapshot-2026-08-15.json`;
- `docs/evidence/p17-016-wave-c2-live-table-acl-query-2026-08-16.sql`;
- `docs/evidence/p17-016-wave-c2-live-table-acl-snapshot-2026-08-16.json`;
- `docs/roadmap/p17-016-wave-c2-additive-design.sql`;
- `docs/roadmap/p17-016-wave-c2-rollback-design.sql`;
- `tests/p17-016-wave-c2-migration-design.test.ts`; and
- `package.json` registration.

One evidence-only closeout file per repository and root handoff transitions are added after exact-
SHA regressions. No production runtime, route, UI, registry state, migration directory, target, or
`.Codex` file belongs to C2.

## Attack matrix

- missing/tampered catalog or ACL artifact, wrong project/schema/hash/byte count/counts, reordered
  or missing relation, policy/ACL drift, `PUBLIC`/grantable ACL, stored function body, or catalog
  query DDL/DML/RPC;
- competing kit migration, dashboard `0018` collision, SQL under `migrations/` during C2, or
  forward/rollback file with runnable-status language;
- missing foundation table/check, raw identity column, service-role direct grant, browser policy,
  bootstrap row, implicit tenant, or optional grant enabled by default;
- missing legacy relation, omitted/extra policy, surviving anon/auth privilege, non-forced RLS,
  non-null tenant, automatic backfill, cross-table tenant guess, or sink/writer creation;
- missing H1 remediation, side-effectful/raw-owner verifier, exposed legacy overload/helper,
  treating auth output as attestation, unscoped repository, or tenant-aware completion claim;
- rollback with foundation rows, mapped/rejected/purge-pending legacy state, partial metadata, missing
  restored policy/grant, data DML, destructive legacy table drop, or broad wildcard target; and
- false completion/availability statements for migration, tenant safety, sink, Wave C, or P17-016.

## Non-claims

C2 does not claim a tenant exists, membership or consent is enforced, attestation is issued or
verified, legacy data is mapped/sanitized/purged, direct service-role access is removed, a tenant
repository or central sink is available, migration SQL is promoted/applied, rollback is rehearsed,
two-tenant isolation is proven, or Wave C/P17-016 is complete.

C2 performs no database write, application-row read, RPC call, browser mutation after catalog
capture, provider operation, migration execution, sync, push, merge, deploy, canary, target command,
or target `.Codex` edit.
