# P17-016 Wave C1: Tenant-foundation and migration sequencing plan

**Status:** Authorized under standing continuation authority — C1 plan-only inputs complete; C2-C5 not authorized for external execution
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent policy:** ADR-002 `T1/R1/C1/L1/E1`
**Parent writer input:** B2A `T1/R1/X1/C1/S1/L1/E1`
**Topology compatibility:** ADR-003 `T1/M1/X1/R1/E1/S1`
**Locked C1 scope:** `foundation=F1, membership=M1, grants=G1, attestation=A1, quarantine=Q1, sink=S1, execution=X1, rollback=R1, evidence=E1`

## Outcome

Wave C1 locks the smallest safe sequence from the completed fail-closed writer boundary to a
tenant-scoped data plane. C1 is plan and executable readiness only. It creates no tenant, schema,
migration, repository, attestation, key, processing grant, central sink, or live row.

The sequence preserves every B2-B4 blocked receipt until a later subwave proves all prerequisites
for that exact capability. A schema file is not proof that a migration ran; a service-role key is
not tenant context; a legacy authentication result is not attestation; and assigning old rows to a
bootstrap tenant is prohibited.

P17-016 remains `in_progress`. Only C1 is input-complete. C2 requires an exact local/live schema
inventory and a separately recorded read-only inventory boundary. C5 migration execution requires
explicit authorization for the named disposable or live project, a pre-migration export/snapshot,
and tested rollback SQL.

## Read-only reconciliation

Wave B is complete at the writer boundary:

- kit verification, run-version, and install writers are `contract_validated` and `fail_closed`;
- dashboard central writers are local or `fail_closed`;
- seven private-admin identity operations are `identity_hardened` under the temporary non-tenant-
  safe exception; and
- token regeneration is `fail_closed` until one atomic tenant-aware rotation contract exists.

Current persistence cannot satisfy Wave C:

| Surface | Reconciled fact | Required later treatment |
|---|---|---|
| `command_runs`, `token_usage` | global rows; legacy migration grants anon all operations | revoke public access, add nullable tenant/quarantine state, tenant keys and repositories |
| `installs`, `repo_runs`, `verify_records` | raw repository/feature identity and broad anon insert/update/select | keep legacy hidden, replace with tenant-keyed opaque records, remove legacy query paths |
| `user_roles`, `role_audit` | global email identity and no tenant membership | server-resolved opaque subject membership; preserve only bounded audit metadata |
| progress bindings/events/RPCs | closed ledger but no tenant key; RPC identity is global | tenant in every key, lookup, RPC, lineage, and read path |
| orchestrator/release tables | global rows and some anon select or permanent delete blockers | quarantine legacy rows; finite retention and tenant-only repositories in later waves |
| dashboard service-role client | unrestricted client constructor with no tenant argument | tenant-requiring repository ports with no unscoped overload |
| external legacy tables | `usage_logs`, `error_reports`, tokens/bypass and other live schema are not fully defined by repository migrations | inventory exact live shape before C2 SQL; do not infer columns or ownership |

No tenant table, tenant membership, processing grant, trusted attestation verifier, tenant-keyed
opaque identifier capability, tenant-scoped central sink, or tenant-safe read repository currently
exists.

## Locked decisions

### F1 — Opaque tenant foundation

The future foundation uses opaque UUIDs and closed states only. A tenant row may contain policy
version, state, optimistic version, creation time, and closed deletion/retention state. It may not
use email, organization name, repository name, machine label, token prefix, hostname, or provider
account as identity.

C1 does not create a bootstrap tenant. A later bootstrap operation must create one explicit tenant
and mapping under operator control. Historical rows are never assigned to it automatically.

### M1 — Server-resolved membership

Browser context begins with the authenticated `auth.uid()` subject UUID. The server resolves one
active tenant membership and closed role before every tenant read or action. Email may remain a
private display/bootstrap attribute, but it is not a membership key or tenant selector.

Membership records require tenant UUID, subject UUID, closed role, state, policy version, issuance,
revocation, and optimistic version. Removed, suspended, cross-tenant, ambiguous, or missing
membership returns one closed denial without a cross-tenant existence signal. `super_admin`
remains an explicit deployment recovery boundary and is not a tenant membership role.

### G1 — Versioned processing grants

Processing grants use the ADR-002 exact scopes and contain only opaque tenant/subject IDs, policy
version, decision, purpose code, issuance, expiry, and optional revocation. `essential_operations`
is enabled only by an explicit tenant operation; optional scopes default off. Route access,
installation, provider choice, legacy auth, or membership never implies consent.

### A1 — Trusted attestation boundary

The trusted server boundary may emit one exact attestation containing schema/attestation version,
tenant UUID, subject UUID, source kind, credential-binding UUID, policy version, issued time,
expiry time, key version, nonce, and integrity proof. Browser input, environment variables,
repository files, command arguments, payload fields, and legacy `verify_kit_token` output are not
attestation sources.

The verifier checks exact keys, canonical time, bounded lifetime, supported key version, one-use or
purpose-bound nonce, integrity proof, active membership or worker binding, and tenant/policy match
before constructing the existing `TrustedTenantContext`. Invalid or unavailable attestation keeps
the existing `tenant_attestation_unavailable` result and invokes no sink.

Worker credential binding remains compatible with ADR-003 machine enrollment but C1 creates no
machine or key. Provider credentials stay on the worker and never enter attestation.

### Q1 — Additive quarantine before mapping

Later legacy migration is additive first. Owned legacy tables receive nullable `tenant_id` plus a
closed `privacy_state` defaulting to `legacy_unclassified`; legacy rows remain hidden from tenant
views and learning/RAG inputs. Mapping requires an operator-supplied tenant map and a passing exact
sanitizer. Rejected or unmapped rows are scheduled for purge within 30 days.

No SQL may silently backfill every row to one tenant, mark raw data current, make `tenant_id`
non-null before reconciliation, or delete legacy rows during the additive subwave. Tables absent
from repository-owned migration sources require exact schema inventory before SQL is written.

### S1 — Central sink remains unavailable

C1 does not construct or enable a central sink. C2 schema design alone also cannot enable it. A
sink capability may exist only after tenant schema/RLS, tenant-requiring RPCs/repositories,
attestation, processing grant resolution, two-tenant attacks, and rollback proof all pass for the
exact store. Service-role REST, anon fallback, a global client, or a legacy table is never a sink
fallback.

### X1 — Offline-only C1 execution

C1 may change only the kit plan, validator registration, evidence, and handoff. Tests read local
source-of-truth files and use no database client, browser, network, provider, process operator,
migration runner, target, sync, deploy, canary, or external state. No dashboard production or SQL
file changes in C1.

### R1 — Forward rollback is designed before SQL

Every later migration file contains an exact forward-rollback section and an executable static
contract test. Before C5 execution, rollback is rehearsed on a disposable project from the same
starting schema, and a named pre-migration snapshot/export is verified. A failed migration restores
the verified snapshot before retry; the workspace and database do not remain half-migrated.

Rollback never uses sync, target edits, or destructive broad commands. Tenant and legacy counts,
policies, grants, functions, and visibility are checked before and after rollback.

### E1 — Evidence ladder and truth labels

Each subwave uses plan-first RED/GREEN controls, exact TypeScript/SQL contract tests, full relevant
regressions, positive-control source denial, five credential detectors, exact manifests, separate
source/evidence commits, and immediate handoff updates. Mock/static SQL proof is labeled offline;
only a named authorized database run can satisfy migration/RLS claims.

## Wave C sequencing

### C1 — Plan and readiness gate

Scope is exactly this plan, its executable validator, package registration, one evidence file, and
handoff transitions. Exit requires the validator, privacy/registry companions, full kit regression,
diff/credential review, local commits, and clean readback. C1 makes no runtime or migration claim.

### C2 — Exact schema inventory and additive migration design

Reconcile every repository-owned migration with an explicitly authorized read-only catalog snapshot
for externally defined tables. Produce a canonical table/policy/RPC manifest, collision-safe
migration ordering across the kit/dashboard history, exact additive SQL, rollback SQL, and static
attack tests. No SQL execution and no sink.

### C3 — Tenant foundation, quarantine, and repository adapters

Implement tenant/membership/grant and credential-binding contracts, tenant-requiring repository
ports, server attestation verification, and additive quarantine migrations. All tests remain local
or use a disposable database only when separately authorized. Existing production writers remain
blocked.

### C4 — Tenant-scoped central sink and writer capability

Add exact tenant-scoped central-family storage/RPCs and an explicitly injected sink capability.
Unblock one writer family at a time only after its schema, grant, retention, receipt, idempotency,
two-tenant attack, stale credential, and rollback gates pass. No bulk registry relabeling.

### C5 — Authorized migration, rollback, and cutover proof

On the named authorized project, verify the pre-migration snapshot, apply additive SQL, prove two-
tenant/RLS/service-role boundaries, rehearse forward rollback, restore or continue explicitly, and
record exact counts/hashes. This step needs separate external authority and does not inherit the
C1 offline authorization.

## Architecture and dependency boundary

The existing pure privacy policy and writer remain the domain/application source of truth. Tenant
membership, attestation verification, repositories, Supabase RPCs, and migrations are adapters.
Dashboard routes depend on tenant-aware application ports, never on a global service-role client.
The kit and dashboard share generated contracts where byte identity is required; SQL ownership and
migration order are canonical and cannot be split ambiguously between repositories.

## C1 implementation manifest

- `docs/roadmap/p17-016-wave-c-tenant-foundation-plan.md`
- `scripts/post-17-privacy-wave-c-tenant-foundation-plan.test.ts`
- `package.json`
- `docs/evidence/post-17-privacy-wave-c1-plan-2026-08-15.md` at closeout
- root `HANDOFF.md` transitions

No dashboard file, migration file, generated core, target file, or `.Codex` path is in C1 scope.

## C1 executable checks

The validator binds the nine locked decision codes, P17-016 `in_progress`/ready state, accepted
policy/topology/input-lock references, completed B4 evidence, exact kit registry dispositions,
current unsafe schema findings, C2-C5 gates, external authorization boundary, rollback contract,
and full-suite registration. It refuses false language that claims tenant safety, attestation,
sink availability, migration execution, Wave C completion, or P17-016 completion.

## Edge cases and attacks reserved for later subwaves

- same subject in two tenants, ambiguous active membership, removed membership, suspended tenant;
- forged producer tenant, wrong tenant/policy/key, expired/future attestation, nonce replay;
- service-role unscoped select/mutation, anon access, cross-tenant natural-key collision;
- same run/event/repository opaque ID in two tenants and cross-tenant retry/evidence reference;
- legacy row visibility, silent bootstrap assignment, sanitizer rejection, unmapped purge deadline;
- migration retry, partial DDL, duplicate policy/function, out-of-order source histories;
- sink replay/conflicting receipt, producer expiry extension, raw field/secret insertion; and
- rollback count drift, restored-data visibility before tombstones, and stale worker credential.

## Rollback

C1 rollback is a local revert of its isolated plan/evidence commits or restoration from the
verified 2026-08-15 kit snapshot/tag. It has no dashboard or database state. Later subwaves must
name their own source/database rollback boundary before edits or execution.

## Non-claims

C1 does not claim a tenant exists, membership is enforced, consent is stored, attestation is
issued or verified, tenant-scoped repository/RLS exists, legacy data is quarantined, central sink
availability, migration SQL writing or execution, or Wave C/P17-016 completion. It authorizes no
database/catalog access, browser operation, provider run, migration, sync, push, merge, deploy,
canary, target command, or target `.Codex` edit.
