# P17-016 Wave C5: Authorized live migration and cutover plan

**Status:** Authorized under standing continuation authority — C5A plan/readiness in progress; no external execution
**Date:** 2026-08-16
**Roadmap task:** P17-016
**Deciders:** repository owner for local planning; named-project operator for every external packet
**Parent decisions:** ADR-002, Wave C1-C4, P17-014 topology, and P17-019 credential boundary
**Input lock:** `project=P1, snapshot=S1, migration=M1, bootstrap=B1, keys=K1, credential=C1, grant=G1, route=R1, legacy=L1, rollback=O1, evidence=E1, execution=X1`

## Outcome

C5 is the production-bound portion of Wave C. It turns the verification capability proven by C4D
into a live, tenant-scoped path only after the target, recovery, bootstrap, credential, grant,
route, compatibility, and evidence inputs are independently proven. Applying schema is not the
same as enabling a writer, and enabling a writer is not the same as safely changing the sync guard.

C5A changes planning, validation, package registration, evidence, and handoff only. It creates no
live runner, route, migration wrapper, tenant, membership, credential, grant, key, central row,
legacy mapping, provider resource, or dashboard state. P17-016 remains `in_progress` through C5A.
P17-014 is now `in_progress` under its implementation plan; P17-019 remains input-blocked.

## Reconciled starting state

The exact source migrations and rollback artifacts exist:

- `0018_p17_016_tenant_foundation_quarantine.sql` creates the five foundation relations, six
  tenant-requiring RPCs, forced-RLS/no-policy boundaries, and additive legacy quarantine columns;
- `0019_p17_016_verification_sink.sql` creates the typed verification table and one exact
  service-role-only persistence RPC;
- both migrations use a five-second lock timeout, a 30-second statement timeout, advisory locks,
  collision refusal, and exact post-state assertions; and
- both rollback artifacts are source-controlled and were exercised by C4D.

C4D applies exact `0018` then `0019` on digest-pinned PostgreSQL 17.11 and passes 17 scenario groups
across two synthetic tenants. Only the verification writer and sink are `capability_ready` in
source. Both default kit CLI branches remain B2B-blocked. The live project has not received either
migration, and no live tenant, membership, processing grant, credential binding, attestation key,
opaque-identifier key, nonce, verification row, server route, or replacement sync-guard reader is
claimed.

The last live catalog evidence was a separately authorized metadata-only C2 inventory. It is an
input for drift comparison, not a current preflight or a backup. The repository contains no C5 live
runner, the current workstation exposes no installed Supabase CLI, and SQL Editor history is not a
database backup. The signed-in browser session may support a later authorized metadata read, but it
does not satisfy recovery, restore rehearsal, or external execution authority.

## Constraints and non-functional requirements

- **Privacy:** only the ADR-002 verification allowlist may leave the kit. Project identity, raw
  repository identity, email, key bytes, credentials, application rows, function bodies, backup
  bytes, and evidence bodies never enter source or durable evidence.
- **Consistency:** project, catalog, migration SHA, bootstrap policy, route release, writer release,
  and reader release are one versioned cutover set. Mixed versions fail closed.
- **Recovery:** no live apply starts without a verified provider recovery point, an encrypted
  logical backup, and a successful isolated restore rehearsal from the same preflight state.
- **Availability:** C5 does not claim zero downtime. A later authorization packet must name a writer
  freeze or maintenance window. Failure to obtain the lock inside the migration's five-second
  timeout aborts rather than expanding the timeout in production.
- **Bounded execution:** every external command is an enumerated operation with `shell:false`, an
  exact project assertion, bounded output, timeout, cleanup, and a closed reason code. Arbitrary SQL
  text and arbitrary shell are not operator inputs.
- **Least privilege:** browser, client, kit, and worker code never receive a service-role client.
  Service-role access remains behind exact server repositories/RPCs with mandatory tenant context.
- **Portability:** the plan does not require one desktop UI. Provider-managed backup, logical dump,
  migration, and proof steps have explicit capabilities so a later runner can support approved
  CLI/API implementations without changing domain contracts.
- **Observability:** events contain only step IDs, closed outcomes, timings, counts, and hashes. No
  SQL body, row body, connection string, host, token, or provider error text is logged.
- **Stop safety:** any unexplained drift, missing snapshot, failed restore, partial phase, stale
  credential, missing grant, privilege widening, or evidence leak stops the wave. It never converts
  a refusal into a warning.

## Locked decisions

### P1 — Named project without durable project identity

Every C5B-C5E packet names exactly one project in the operator's external approval. The runner
receives the approved identity and connection material through an ephemeral, non-logged channel,
derives the actual target identity independently, and compares them before any catalog read or
write. A wrong project stops before snapshot, SQL, or application-row access.

Source, git, logs, and evidence do not persist the project identifier or URL. Durable evidence
records only `project_match=true`, the approval packet version, the target environment class, and a
session-scoped evidence ID that cannot be used to address the project.

### S1 — Two-layer rollback-grade snapshot

C5B requires one verified provider recovery point and one encrypted logical backup created after
the writer freeze and before migration. The provider recovery point is the disaster-recovery
authority. The logical backup supplies a portable schema/data/ACL manifest and must complete a
restore rehearsal against an isolated database before live apply.

The logical artifact is encrypted, access-controlled, stored outside the repositories, and deleted
under the operator-approved recovery retention. Backup bytes never enter either repository or
evidence. Durable evidence retains only closed backup type/status, byte count, SHA-256 digest,
creation/expiry timestamps, restore outcome, and bounded catalog/table counts. SQL Editor history
is not a database backup, and a query-result download is not a logical backup.

If the provider cannot produce a restorable recovery point, the logical backup cannot be verified,
or the isolated restore differs in the migration-owned catalog/ACL manifest, C5 stops before live
SQL. Snapshot creation alone never authorizes migration.

### M1 — Exact additive migration sequence

C5C revalidates the live catalog and exact source SHA immediately before apply, then applies exact
`0018` then `0019`, one bounded transaction at a time. Generated SQL, edited SQL Editor copies,
concatenated ad-hoc scripts, skipped preflights, and out-of-order apply are forbidden. Each commit is
followed by the migration's own post-state verifier plus an independent catalog/ACL/RPC inventory.

No bootstrap row is inserted until both migrations pass. If `0018` fails, its transaction must
leave the catalog unchanged. If `0018` succeeds and `0019` fails, execution stops: the operator may
run the exact empty-foundation `0018` rollback only after proving its preconditions, or restore the
verified snapshot. The runner never retries from a half-migrated baseline.

### B1 — Explicit bootstrap identities and no automatic legacy mapping

The first deployment uses one operator-provided tenant UUID. The initial membership is created from
an independently authenticated subject UUID: `auth.uid()` is the membership subject; email is never
the key. A worker path uses its approved opaque machine UUID, not hostname or repository identity.
All values are supplied through typed parameters and are redacted from evidence.

Bootstrap runs as one idempotent, compare-and-set transaction with exact expected absence or exact
same-value replay. Conflicting tenant, subject, role, policy, or version aborts. Legacy rows remain
`legacy_unclassified` until an explicit mapping passes the sanitizer. Automatic legacy-to-bootstrap
assignment is forbidden, including the apparently convenient single-tenant case.

### K1 — Separate externally held keys

Attestation and opaque-identifier keys remain separate by purpose and by bytes. They are generated
with an approved cryptographic random source, stored in an operator-controlled secret manager, and
injected only into the server-side composition root. The database stores key versions or binding
metadata, never secrets. Key bytes never enter SQL, source, logs, or evidence.

Enrollment binds the approved key version to one tenant and credential lifecycle. Rotation accepts
a bounded overlap only when both versions are explicitly active; stale versions fail at both the
application and database boundaries. Key reuse, equality, unknown version, silent fallback, and
provider error echo are blocked.

### C1 — Expiring tenant-bound credentials

Every live caller uses a credential bound to exactly one tenant and either one authenticated server
subject or one approved machine. The database persists only the typed credential-binding metadata;
raw tokens and signing material remain outside it. Issuance, expiry, revocation, rotation, replay,
and clock-skew behavior must be executable before route enablement.

P17-019 must be input-complete or a separately accepted C5-scoped credential lifecycle must exist.
P17-019's eventual Playwright refresh adapter does not automatically authorize a control-plane or
worker credential. Unsupported refresh and mid-run expiry return closed outcomes and never fall
back to a global token.

### G1 — Purpose-limited essential-operations grant

Bootstrap creates only a finite `essential_operations` processing grant with purpose
`verification_record`, policy `p17-016-v1`, explicit issue/expiry timestamps, and the exact subject
used by the credential binding. Optional learning, indexing, evaluation, and diagnostic grants stay
off. Missing or revoked grant, wrong purpose, wrong subject, wrong tenant, expired grant, or future
grant performs zero sink calls.

Grant creation and revocation use a typed server repository and CAS version. Browser code cannot
write the table. A later broader family requires its own plan, purpose, retention, attacks, and
registry transition.

### R1 — Server-only route and capability composition

The route belongs behind the P17-014 server composition boundary. It accepts one versioned typed
verification envelope, authenticates the server session or signed worker, derives tenant and
subject from the credential, verifies and consumes the attestation nonce, resolves the current
grant, then injects the C4C writer capability and C4B sink. No caller-supplied tenant is trusted.

There is no direct kit-to-Supabase access, browser-to-table access, service key in a client bundle,
generic RPC name, arbitrary payload passthrough, or global service client. The response is the
closed C4 receipt. Timeouts and provider failures collapse to reason codes without raw detail.

Route implementation cannot begin merely because C5C applied SQL. P17-014 must supply the accepted
typed envelope, authorization, idempotency, replay, lease, and audit composition or C5 must record a
separately reviewed narrower route ADR with identical trust properties.

### L1 — Versioned fail-closed legacy cutover

Migration does not silently change the legacy `verify_records` reader or sync guard. Before route
cutover, the legacy guard remains authoritative and the new live route is disabled. C5D exercises
the new path only with named canary identities and does not run real sync.

C5E releases a versioned writer/reader pair. The new writer sends only the allowlisted verification
envelope to the server route. The new guard resolves the tenant-scoped verdict through an authorized
read capability. There is no permissive OR dual-read and no new write to the raw legacy table. A
shadow comparison may observe both sources, but a mismatch blocks verification and sync eligibility;
neither source can make the other source's refusal pass.

The cutover requires exact writer/reader/policy versions and a closed release flag. Missing or mixed
versions fail closed. Rollback disables the new route and leaves sync blocked until a valid writer
and reader are restored; it must never restore anonymous legacy writes. The legacy rows remain
quarantined for explicit mapping/export/purge handling. No real sync is used as a guard test: only
the dry-run guard path is permitted during C5 evidence.

### O1 — Restore-or-continue operator decision

After every live phase the runner stops at a typed decision boundary. `CONTINUE` requires all
post-state, privilege, canary, cleanup, and evidence checks to pass. `RESTORE` first disables the
route/writer, proves the exact canary scope, and selects either the source-controlled rollback or
the verified recovery point according to current row state.

Rollback `0019` refuses after a persisted verification row. Canary cleanup may delete only exact
approved canary IDs and must prove zero residual rows before empty rollback. If any non-canary row
exists, destructive table rollback is forbidden; the operator must continue forward or perform the
separately authorized full recovery. Restores reapply deletion tombstones before data becomes
queryable. No retry starts until the baseline catalog/ACL and application visibility match the
recorded preflight.

### E1 — Metadata-only evidence ladder

Evidence strength is ordered and cannot be substituted downward:

1. static plan/readiness validation and source-denial controls;
2. exact migration/route/unit/contract attacks;
3. digest-pinned disposable PostgreSQL execution;
4. isolated restore of the encrypted logical backup;
5. authorized live read-only project/catalog/ACL snapshot;
6. authorized live migration/bootstrap/RPC and two-tenant/service-role proof;
7. versioned route/writer/reader canary plus dry-run sync-guard proof; and
8. post-cutover observation, exact canary cleanup, restore-or-continue receipt, and completion audit.

Evidence records source SHAs, closed step outcomes, migration hashes, schema/ACL hashes, bounded
counts, durations, backup digest metadata, policy/version IDs, and cleanup counts. It contains no
project identity, connection value, key/credential, SQL/function body, application row, raw
repository identifier, auth subject, email, machine identity, provider response, backup body, or
evidence body.

### X1 — C5A is local plan/readiness only

C5A may read local source and create this plan, its validator, package registration, evidence, and
handoff transitions. It performs no database, browser, provider, network, backup, migration,
bootstrap, route, deploy, canary, application-row, target, sync, or push action. Every C5B-C5E
external phase needs a separate named-project authorization packet after all prior inputs are
concrete.

## Options considered

### Recovery options

| Option | Recovery strength | Portability | Risk | Decision |
|---|---|---|---|---|
| SQL Editor history or result download | No database restore guarantee | Low | Silent incomplete recovery | Rejected |
| Logical backup only | Restorable migration scope | High | Managed roles/extensions may differ | Insufficient alone |
| Provider recovery point only | Strong project recovery | Provider-bound | Restore timing and inspection may be opaque | Insufficient alone |
| Provider recovery point plus encrypted logical backup and restore rehearsal | Independent recovery plus inspectable portability | Medium | More operator work and protected storage | Selected S1 |

### Cutover options

| Option | Consistency | Rollback | Privacy | Decision |
|---|---|---|---|---|
| Big-bang schema/writer/reader activation | Weak under partial deployment | Difficult | May re-enable raw paths | Rejected |
| Permissive legacy OR tenant read | Availability-biased | Easy but unsafe | A legacy pass can bypass tenant refusal | Rejected |
| Permanent dual-write | Split-brain and replay risk | Ambiguous | Continues prohibited raw writes | Rejected |
| Versioned fail-closed writer/reader release with blocking shadow comparison | Strong and observable | Route-off plus forward recovery | No new legacy writes | Selected L1 |

### Bootstrap options

| Option | Identity quality | Legacy safety | Decision |
|---|---|---|---|
| Infer tenant from email/repository/project | Low | Cross-tenant ambiguity | Rejected |
| Assign all historical rows to one bootstrap tenant | Superficially simple | Violates ADR-002 L1 | Rejected |
| Explicit opaque tenant, authenticated subject, typed machine, and separately approved mappings | Strong | Quarantine preserved | Selected B1 |

## Execution sequence

### C5A — Plan and executable readiness

Create only this plan, its fail-closed validator, package/full-suite registration, metadata-only
evidence, and handoff state. Prove predecessor SHAs/artifacts, roadmap/dependency truth, exact input
codes, attacks, forbidden claims, and identity/credential positive controls. Exit with local source
and evidence commits. No external execution is part of C5A.

### C5B — Authorized live read-only preflight and snapshot

Require the exact C5B packet. Re-read current catalog, ACL, RPC, policy, extension, migration-owned
object, row-count, and writer-activity metadata and compare it with C2 plus source expectations.
Freeze relevant writers, create S1 recovery artifacts, verify hashes/expiry/access, restore the
logical backup to an isolated database, and rerun the C4D migration/rollback suite from that state.
Any drift or restore mismatch stops before live apply.

### C5C — Authorized additive migration and bootstrap

Require the separate C5C packet and a fresh C5B receipt. Recheck target identity, source SHAs,
snapshot freshness, writer freeze, and pre-state hashes; apply exact `0018` then `0019`; verify every
post-state; and create the explicit tenant, membership or machine binding, finite credential
binding, and essential-operations verification grant in one typed transaction. Do not map legacy
rows or enable a route. Stop for the operator's restore-or-continue decision.

### C5D — Authorized server composition and verification canary

Require implemented P17-014-equivalent route and credential boundaries plus a separate C5D packet.
Deploy the exact versioned server composition disabled, prove auth/tenant/grant/nonce and unscoped
service-role attacks, enable it only for named canary identities, write bounded tenant-safe
verification canaries, prove replay/conflict/two-tenant/stale-credential/retention behavior, and
read back only closed receipt/count/hash metadata. Real sync remains prohibited.

### C5E — Versioned legacy cutover and recovery decision

Require a separate cutover packet. Release the matched route, writer, tenant-scoped reader, and
guard policy version behind the closed flag. Run shadow comparisons that block on every mismatch,
then run only `sync:dry` against an authorized successful canary. Revoke or retain legacy access
only as specified by `0018`; never add anonymous writes. Clean exact canaries, observe the bounded
window, and require the operator to choose continue or restore.

### C5F — Completion audit and dependent-task release

Audit every P17-016 acceptance criterion against live/disposable/source evidence, retention and
deletion behavior, registry/runtime truth, legacy quarantine, credential/key/grant lifecycle,
route/reader compatibility, and cleanup. Only this audit may mark P17-016 done. Then reconcile
P17-021 and any other dependent readiness; do not infer their completion.

## Input readiness matrix

| Slice | Required input | Current state | Gate |
|---|---|---|---|
| C5A | C1-C4 evidence, ADR-002, roadmap/dependency state | Complete | Local validator and full kit |
| C5B | Named project, exact read/snapshot authority, writer-freeze window, backup capability and protected destination | Missing | Separate C5B packet and recovery preflight |
| C5C | Fresh C5B receipt, exact source SHAs, bootstrap tenant/subject/machine values, rollback decision owner | Missing | Separate C5C packet before DDL/DML |
| C5D | Implemented P17-014-equivalent server route, accepted credential lifecycle, secret-manager key refs, finite grant, canary IDs | Missing | Separate deploy/canary packet |
| C5E | Matched writer/reader/guard release, legacy disposition, observation window, cleanup and restore authority | Missing | Separate cutover packet |
| C5F | All prior evidence plus retention/deletion and completion audit | Missing | Requirement-by-requirement audit |

Input readiness is phase-specific. P17-016's roadmap-level readiness does not authorize or make
these external inputs complete.

## External authorization packets

The following are templates, not approvals. Placeholders are resolved in the operator channel and
must not be copied into source or evidence.

- `APPROVE P17-016 C5B PREFLIGHT v1: project=<named>, snapshot=S1, freeze=<window>, evidence=E1`
  authorizes only named-project catalog/ACL/row-count metadata, writer freeze, recovery point,
  encrypted logical backup, isolated restore, and cleanup. It authorizes no live DDL/DML.
- `APPROVE P17-016 C5C APPLY v1: project=<named>, source=<exact-pair>, bootstrap=<typed-ref>, rollback=O1`
  authorizes exact `0018 -> 0019` plus the typed bootstrap transaction after a fresh C5B receipt.
- `APPROVE P17-016 C5D ROUTE-CANARY v1: project=<named>, release=<exact>, canary=<bounded>, cleanup=<exact>`
  authorizes the disabled-first route deployment and bounded canary writes/reads/cleanup only.
- `APPROVE P17-016 C5E CUTOVER v1: project=<named>, release=<exact>, window=<bounded>, decision=<owner>`
  authorizes matched writer/reader/guard activation, blocking shadow comparison, dry-run guard proof,
  observation, cleanup, and the explicit continue/restore decision.

None of these packets authorizes sync, push, merge, target `.Codex` edits, public release, unrelated
application-row access, broad deletion, or arbitrary SQL.

## Failure handling and rollback

| Failure point | Required response | Forbidden response |
|---|---|---|
| Wrong project or stale approval | Stop before any read; invalidate session receipt | Continue because credentials work |
| Catalog drift after snapshot | Stop, unfreeze if safe, create a new preflight/snapshot | Apply against the earlier hash |
| Missing logical backup or failed restore rehearsal | Stop before DDL | Treat provider UI status as enough |
| `0018` transaction fails | Verify unchanged pre-state and diagnose offline | Increase live timeout or edit SQL in place |
| `0018` succeeds and `0019` fails | Freeze; prove empty foundation; exact rollback or full restore | Retry `0019` from an unproven state |
| Bootstrap transaction fails | Prove zero partial bootstrap rows | Patch rows individually in SQL Editor |
| Route/canary fails | Disable route, preserve closed evidence, clean only exact canaries | Fall back to direct Supabase or legacy write |
| Mixed-version writer and guard | Block writer and sync eligibility | Accept either reader's success |
| Rollback after a persisted verification row | Refuse destructive SQL; continue forward or authorize full recovery | Disable the non-empty rollback guard |
| Restore succeeds | Reapply deletion tombstones, verify catalog/ACL/visibility, rotate exposed credentials | Expose restored data before reconciliation |

Every retry needs a new attempt ID and links to the failed receipt. Failures never leave a half-
migrated workspace or silently change source. Database recovery uses only the exact named target and
validated artifact; there is no broad recursive delete or reset.

## Attack and test strategy

### Static and unit layer

- wrong project and project-identity persistence;
- catalog drift after snapshot, missing logical backup, failed restore rehearsal, stale backup, and
  backup digest mismatch;
- email used as tenant or membership identity and automatic legacy-to-bootstrap assignment;
- key reuse, key-byte leakage, unknown key version, and secret-manager exception echo;
- expired or revoked credential, unsupported refresh, replay, and cross-tenant credential binding;
- missing or revoked grant, wrong purpose/scope/subject/policy/time, and optional-scope activation;
- forged tenant, unscoped service-role call, raw client/table/RPC fallback, and unknown envelope fields;
- permissive dual-read, new legacy writes, mixed-version writer and guard, and unsafe rollback fallback;
- evidence body or application row leakage, project URL, JWT/token/private-key candidates, long
  base64, raw identifiers, and provider error text.

### Database and integration layer

- exact source SHA/order, transaction/lock timeout, retry/collision/post-state behavior, and the case
  where `0018` succeeds and `0019` fails;
- idempotent/conflicting bootstrap, email/tenant confusion, same IDs in two tenants, and legacy
  quarantine invisibility;
- key/grant/credential rotation boundaries, nonce replay, stale credential, forged tenant,
  unscoped service-role call, and cross-tenant same run;
- same-hash replay, different-hash conflict, concurrent same/different hash, exact retention, direct
  table/RPC denials, and receipt forgery;
- empty rollback, non-empty refusal, privilege drift, snapshot restore, and tombstone reapplication.

### Route, cutover, and highest-authenticity layer

- signed/authenticated route envelope, tenant derivation, idempotency, timeout, replay, cancellation,
  and provider failure collapse;
- disabled-by-default route, canary allowlist, no service credential in browser/worker, and exact
  cleanup;
- blocking shadow comparison, no permissive dual-read, mixed-version writer and guard, route-off
  rollback, dry-run sync guard, and proof that no real sync ran;
- live two-tenant proof with synthetic canary identities, closed readback only, provider recovery
  receipt, isolated logical restore, live pre/post catalog/ACL hashes, and bounded observation.

Focused tests must precede full kit/dashboard regressions. Source/evidence commits remain separate.
Every negative search has a positive control. A parsed SQL test cannot replace executable database
proof; a disposable proof cannot replace the named live phase; a live success cannot replace
rollback or cleanup evidence.

## Architecture and source ownership

Clean Architecture dependency direction is fixed:

1. kit shared-core owns privacy policy, tenant/attestation/writer contracts, closed results, and the
   new verification-reader port;
2. kit application adapters project `record-verify` into the writer/reader ports but own no database
   or credential discovery;
3. dashboard application services compose tenant context, grants, credentials, clocks, writer and
   reader capabilities;
4. dashboard infrastructure owns migrations, Supabase RPC adapters, secret-manager adapters, and a
   bounded C5 operator runner;
5. P17-014 owns remote signed envelopes/control-plane authorization; P17-019 owns project-specific
   credential refresh where applicable; and P17-021 owns operator UI, not data-plane policy.

Domain/application code never imports Supabase, browser, environment, filesystem, or process
clients. Infrastructure depends inward on ports. The C5 runner is an operator adapter, not business
logic, and accepts enumerated operations instead of arbitrary SQL or shell.

## C5A implementation manifest

The C5A source checkpoint contains exactly:

- `docs/roadmap/p17-016-wave-c5-live-cutover-plan.md`;
- `scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts`; and
- `package.json` registration.

The closeout adds `docs/evidence/post-17-privacy-wave-c5a-live-cutover-plan-2026-08-16.md` in a
separate evidence commit. Workspace `HANDOFF.md` changes with every state transition. No dashboard
production file, migration, runtime, route, generated core, target, or target `.Codex` file belongs
to C5A.

## Non-claims

C5A does not claim live migrations are applied, a live tenant is bootstrapped, recovery is proven,
a key or credential exists, a processing grant is active, a server route is available, a live
verification row was written, the legacy cutover is complete, sync eligibility changed, C5 is
complete, Wave C is complete, or P17-016 is complete.

No live SQL, catalog/application-row access, backup, browser, provider, network, migration,
bootstrap, route, deploy, canary, cleanup, sync, push, merge, target edit, or target `.Codex`
modification occurs in C5A.
