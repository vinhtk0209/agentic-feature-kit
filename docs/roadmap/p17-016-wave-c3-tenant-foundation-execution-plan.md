# P17-016 Wave C3 Tenant Foundation Execution Plan

**Status:** ACCEPTED FOR LOCAL IMPLEMENTATION — 2026-08-16
**Parent decisions:** ADR-002, P17-016 policy v1, topology v1, Wave B2A/B2B input locks, C1, and C2
**Locked decisions:** `foundation=F1, membership=M1, grants=G1, attestation=A1, quarantine=Q1, sink=S1, execution=X1, rollback=R1, evidence=E1`

## Purpose and current truth

C3 converts the reviewed C2 design into source-controlled tenant foundation and quarantine
capabilities without pretending that a tenant, consent grant, central sink, or live migration
already exists. The existing production central writers remain blocked. Existing local encrypted
compatibility stores remain authoritative for the writer families cut over in Wave B.

The reconciled pre-C3C dashboard baseline had one exported global service-role client and 31
invocations across 28 consumer files. The inherited 27/30 count omitted the version-metrics route;
the executable manifest binds the corrected 28/31 truth. Those calls had no tenant argument and
could not be repaired by adding a nullable column or an application-side filter. C3 removes that
direct capability before any live migration.
Wave E owns functional tenant-safe reads, actions, and dashboard restoration. Between C3C and Wave
E, legacy application surfaces fail closed and state why data or an action is unavailable.

The accepted C1 decision tuple remains unchanged. C3 is split into four isolated source/evidence
checkpoints so a failed migration or adapter change cannot leave an ambiguous half-state.

## C3A — Canonical attestation and repository contracts

C3A adds one canonical pure module, `packages/core/src/tenant-attestation.ts`, next to the existing
privacy policy and writer modules. It contains the exact attestation envelope, runtime validators,
canonical proof input, issuance and verification algorithms, membership/credential/grant/nonce
repository ports, result contracts, and closed reason codes. It has no environment, filesystem,
network, database, Supabase, framework, provider, or secret-key implementation.

The dashboard privacy-core mirror expands transactionally from three files to exactly four files.
The existing staging/backup/promote/restore algorithm remains the only distribution path, and the
new file must be byte-identical to the kit canonical source. Missing, drifted, extra, symlinked,
partially promoted, or rollback-faulted mirrors fail closed.

### Exact attestation boundary

The envelope contains only these exact fields:

- `schemaVersion`, `attestationVersion`, `tenantId`, `subjectId`, and `sourceKind`;
- `credentialBindingId`, `policyVersion`, and `purposeCode`;
- `issuedAt`, `expiresAt`, `keyVersion`, `nonce`, and `proof`.

Unknown, missing, inherited, nested, oversized, non-canonical, control-character, or prototype
fields are rejected. UUIDs, timestamps, versions, purpose, nonce, and proof use bounded canonical
grammars. The maximum attestation lifetime is five minutes; the allowed future clock skew is 30
seconds. Provider tokens, cookies, headers, repository paths, email/name fields, prompts, content,
logs, and arbitrary metadata cannot enter the envelope or proof input.

Under this contract, no tenant context is accepted from a producer payload. The verifier reconstructs the canonical
proof input, verifies the configured key version through an injected proof port, resolves the exact
credential binding, checks source/subject/tenant/policy/time equality, then resolves authorization:

- `server_session` requires an active same-tenant membership and an authenticated subject that
  exactly matches the attested subject; and
- `worker_credential` requires an active same-tenant credential binding whose machine subject
  exactly matches the attested subject.

The repository ports expose no list-all, optional-tenant, implicit-current-tenant, or raw-client
method. Processing-grant resolution requires tenant, subject, scope, policy, purpose, and evaluation
time. A missing, denied, expired, revoked, ambiguous, cross-tenant, or version-mismatched result is
closed. The existing `classifyLegacyRecord` sanitizer/mapping contract remains canonical: there is
no silent mapping and no tenant visibility for unmapped or rejected legacy rows.

Nonce reservation and consumption use hashes, not raw nonce storage. Nonce consumption is atomic
and occurs only after every other verification succeeds. A false consume result is replay denial;
an unavailable consume repository is attestation unavailability. Only the fully verified result may
construct the existing `TrustedTenantContext`. Errors expose bounded reason/rule codes and never the
attestation, proof, subject, binding, membership, credential, key, or database error.

### C3A implementation manifest

Kit source checkpoint:

- this plan, its executable validator, package registration, and root handoff transitions;
- `packages/core/src/tenant-attestation.ts`;
- `packages/core/test/tenant-attestation.test.ts`; and
- the shared writer-registry schema/validator enum expansion required for target Wave C3; and
- one C3A evidence-only closeout file after exact-SHA verification.

Dashboard source checkpoint:

- `scripts/sync-privacy-core.ts` and `tests/privacy-core-sync.test.ts`;
- generated `src/lib/generated/privacy-core/tenant-attestation.ts` only through the mirror tool;
- a framework-neutral tenant-foundation adapter under `src/features/privacy/` that accepts an
  injected exact RPC transport and never imports the global service client;
- one canonical dashboard writer-registry entry plus its validator enum expansion;
- focused attestation/repository adapter attacks and package registration; and
- one C3A evidence-only closeout file after exact-SHA verification.

No migration, route/page cutover, central writer enablement, live database, or browser operation is
part of C3A.

## C3B — Migration 0018 and tenant-required RPCs

C3B promotes the reviewed C2 design into exactly one dashboard migration named
`0018_p17_016_tenant_foundation_quarantine.sql`. The dashboard remains the only SQL ledger owner.
The kit migration history is immutable input and receives no competing `0018`. Promotion first
re-captures the authorized metadata-only catalog and exact ACL manifest; any unexplained hash,
relation, policy, function, trigger, or ACL change stops implementation for reconciliation.

The migration is one bounded transaction with advisory lock, lock timeout, statement timeout,
object-collision gates, exact old-state hashes/manifests, and deterministic object names. It first
matches the known unsafe legacy function definitions, then performs H1 remediation before the C2
foundation preflight:

- the two-argument `verify_kit_token` overload is dropped;
- the three-argument verifier is read-only and returns no raw owner identity, performs no usage,
  quota, counter, run, install, error, or evidence write, is `STABLE SECURITY DEFINER`, and has an
  exact `search_path = public, pg_temp`;
- `token_id_for` is not executable by PUBLIC, anon, authenticated, or service_role; and
- the compatibility verifier output is bounded to validity, closed reason, and quota numbers. It
  is authentication-only and cannot create `TrustedTenantContext`, membership, consent, grant,
  credential binding, nonce, sink capability, or receipt.

The same C3B source checkpoint removes the legacy owner dependency from `bin/workflow.ts`,
`bin/lib/local-config.ts`, and `.claude/integrations/telemetry.ts`, updates the hermetic telemetry
mock/test, and registers a fail-closed kit consumer validator. New verification results, logs, and
saved configs contain no raw owner field. Historical pre-C3 local config files may still contain an
unused extra owner property until a later retention/deletion workflow rewrites or removes them;
C3B neither reads nor displays that property and does not claim historical local-data purge.

The migration then creates the five reviewed closed tables: tenants, memberships, processing
grants, credential bindings, and attestation nonces. All enable and force RLS and grant no direct
table access to application roles. It adds the seven nullable quarantine fields and exact shape
constraints/indexes to all 20 cataloged legacy relations, removes the exact 17 broad policies, and
revokes direct legacy-table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`.
All 20 legacy relations remain legacy_unclassified after migration; C3 performs no bootstrap,
assignment, sanitizer decision, mapping, backfill, rejection, or purge row write.
The `service_role` receives no direct table privilege on the 20 legacy relations.

Only exact security-definer foundation RPCs may be executable by `service_role`. Each accepts a
required `p_tenant_id` plus every subject/binding/scope identifier required for its one operation,
sets a fixed search path, returns a minimized exact record, and checks tenant state, policy version,
membership/binding/grant state, and time server-side. There is no unscoped repository or RPC
overload. The nonce consume RPC performs one conditional update and returns only consumed/not
consumed. No RPC lists tenants, memberships, grants, bindings, nonces, or legacy rows.

The matching C3 rollback artifact is operator-owned and fail-closed. It verifies exact post-state,
requires all five foundation tables empty, requires every legacy row to remain the untouched
`legacy_unclassified` shape, restores only the captured policies/ACLs that C3 removed, removes only
C3 RPCs/columns/constraints/indexes/tables in dependency order, and never restores the unsafe
two-argument verifier, raw-owner output, exposed helper, or side-effectful authentication. It has no
row `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `COPY`, or `TRUNCATE`.

C3B static tests mutate every manifest, privilege, function property, RPC signature, policy,
relation, constraint, transaction delimiter, rollback precondition, and no-row-DML control. They
also prove partial DDL cannot commit and detect rollback count drift. Existing production central
writers remain blocked.

## C3C — Direct service-role denial and closed application cutover

C3C deletes the exported global service-role data client and forbids direct `.from(...)`, `.rpc(...)`,
or raw REST use with service credentials in routes, pages, RBAC, feature modules, and server
runtimes. One private infrastructure adapter may construct a service-role SDK client, but its public
surface exposes only the allowlisted tenant-required foundation RPC methods from C3A/C3B. The raw
client never escapes and cannot issue table queries or arbitrary RPC names.

Every former application consumer moves to one of two explicit outcomes:

1. an authentication-only cookie client call that reads only the current authenticated user; or
2. a closed `tenant_foundation_unavailable` result/view because Wave E has not yet delivered that
   functional tenant-safe read or action.

C3C renders legacy application paths explicitly unavailable. Pages render an accessible bounded
status without old rows; APIs return a closed status/code and no data body; action clients preserve
the failure visibly instead of refreshing as success. Identity/control operations lose their Wave
B4 temporary raw-identity exception at this boundary and remain closed until a tenant-scoped action
repository exists. The external Auth user bootstrap is not performed by these paths.

Source gates enumerate the baseline consumer manifest and require zero imports/calls of the old
global client, zero service-key SDK construction outside the one adapter, zero direct legacy table
access, zero arbitrary RPC transport, and zero raw central REST fallback. Two independent matchers
with positive controls cover unscoped service-role access. Focused page/API/client tests prove the
closed status, no false success, no raw response content, and no network in unit tests.

This temporary closed interval is deliberate: changing legacy pages into apparently tenant-aware
queries before explicit bootstrap/membership and Wave-E response minimization would be a false
security claim.

## C3D — Disposable database proof

C3D applies the exact C3B migration to a disposable PostgreSQL/Supabase-compatible environment,
loads synthetic schema-only fixtures plus two synthetic tenants, and proves forward/rollback and
the following structural attacks without real project rows or credentials:

- forged producer tenant, wrong tenant, wrong policy, wrong key version, expired attestation,
  future attestation, nonce replay, removed membership, and stale credential;
- unscoped service-role access, anonymous table/RPC access, cross-tenant natural-key collision,
  cross-tenant nonce/binding/grant lookup, and missing tenant arguments;
- silent bootstrap assignment, legacy visibility, row mutation during migration, and writer/sink
  creation; and
- retry, object collision, partial DDL, rollback count drift, non-empty rollback refusal, and
  unsafe verifier restoration.

The current workstation has the Docker CLI but reports **Docker daemon unavailable**; it has no
local PostgreSQL server/client and no Supabase CLI. C3D therefore stays an explicit environment
gate until a disposable engine exists. This does not weaken C3A–C3C static/offline gates and cannot
be substituted with mocks or the live project.

## Verification and evidence ladder

Each slice has its own source commit and evidence-only commit per affected repository. Before a
source commit:

1. prove the dedicated RED test fails only on the missing capability;
2. pass focused runtime attacks and exact TypeScript with repository compiler settings;
3. pass predecessor C1/C2, privacy policy/writer, writer registry, topology, and roadmap gates;
4. run `git diff --check`, exact manifest review, two source-denial matchers with positive controls,
   and five credential detectors with positive controls;
5. run the full dashboard and full kit regressions on the source candidates; and
6. read back exact SHA, parent, file list/stat, whitespace, required branches, and clean worktrees.

Database evidence must distinguish static SQL proof, disposable execution, and live execution.
No mocked or parsed SQL result may be described as an applied migration or two-tenant database
proof. Every failed attempt and correction is recorded without secrets or application row bodies.

## Rollback boundaries

- C3A rollback restores the previous three-file mirror transaction and reverts isolated source
  commits; no database state exists.
- C3B source rollback reverts the migration/rollback artifacts before execution. Database rollback
  uses only the reviewed operator artifact and only when its post-state/count/empty-foundation
  preconditions pass.
- C3C rollback restores the closed application source checkpoint. It must not restore a global
  unscoped service-role client after `0018` has been applied.
- C3D destroys only its explicitly resolved disposable environment. It never targets the workspace,
  live project, target repositories, or a junctioned dependency tree.

The verified 2026-08-16 repository snapshots/tags remain the source rollback anchors.

## External-action boundary and non-claims

No live project migration occurs in C3. No central sink is available in C3. C3 performs no live
bootstrap, legacy mapping, purge, writer enablement, sync or push, merge, deploy, canary, provider
run, target command, or target `.Codex` edit.
There is no sync or push.

C3 does not claim tenant safety is proven, attestation is live, consent is granted, a central sink
is available, live migration is applied, two-tenant isolation is proven, Wave C is complete, or
P17-016 is complete. Live migration, live rollback rehearsal, and live two-tenant proof belong to
C5; functional tenant-safe reads/actions/UI belong to Wave E; retention/deletion belongs to Wave D;
legacy mapping/purge/non-null completion belongs to Wave F.
