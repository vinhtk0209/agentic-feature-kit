# P17-016 Wave C5B Connection-Material Capability Plan

**Status:** Approved local dependency-unblocking slice; live C5B remains incomplete
**Date:** 2026-08-20
**Roadmap task:** P17-016
**Parent:** P17-016 Wave C5B executable-capability qualification
**Decision lock:** `qualification=A1, files=F1, services=S1, credentials=C1, encryption=E1, environment=N1, freshness=R1, integration=I1, result=M1, runtime=T1`

## Context

The merged C5B logical-backup adapter has fixed `pg_dump -> age` and `age -> pg_restore`
pipelines, and the merged executable qualifier binds the exact three tool bytes and versions. The
remaining local process boundary is not yet qualified: named libpq services, the libpq credential
file, age recipient and identity files, and the destination directory are ordinary configuration.
The pipeline executor also omits an explicit child environment, so Node can inherit ambient
PostgreSQL variables even when argv contains a named service.

That is a fail-closed gap. An inherited `PGSERVICEFILE`, `PGPASSFILE`, `PGPASSWORD`, or related
variable can redirect or recredential a fixed-argv command. A replaced recipient or identity file
can split encryption and restore authority. A textual destination capability ID does not bind the
directory that receives the encrypted artifact.

This local slice adds an exact connection-material qualifier and requires its fresh capability at
the logical-backup adapter. It uses only synthetic attempt-owned fixtures. It does not read a real
credential, contact a project, connect to PostgreSQL, create a backup, prove directory ACLs, or
replace the separate named-project/project-attestation/provider-recovery gates.

## Decision

Implement one Node infrastructure module that validates and snapshots exact connection-material
files and the destination directory, parses only the closed fields needed to prevent configuration
redirection, returns an in-memory unforgeable capability, and constructs sanitized per-process
environments. The logical-backup adapter must bind and revalidate that capability before each port
and pass an explicit environment to every child process.

### A1 — Infrastructure qualification boundary

The canonical module lives in `packages/core`. It may use Node filesystem, path, crypto, and process
types because it qualifies operating-system resources. The provider-neutral preflight core and
operator service remain unchanged and import no Node, filesystem, environment, credential, or
process dependency.

Qualification receives exact paths, expected digests, closed service/capability IDs, TTL and size
limits, a deterministic clock, the exact current runtime platform, and an environment source. A
caller-provided platform mismatch is refused so it cannot weaken native permission rules. It performs no discovery,
default-home lookup, registry lookup, network call, command execution, database connection, secret-
manager call, or provider operation. Invalid configuration returns one closed refusal.

### F1 — Exact file and directory binding

The qualifier accepts absolute already-resolved paths for the libpq service file, libpq pass file,
age recipient file, age identity file, and canonical destination directory. Each file must be a
non-empty canonical regular file. The directory must be canonical, non-root, and an existing
directory. A path alias, relative path, symlink, junction, or reparse point is refused.

All four files must have distinct native paths and identities. None may be inside the destination,
and the destination may not be inside any file path. Each file is read once through a bounded
stream, checked against its exact SHA-256 expectation, then re-statted and re-hashed so a concurrent
replacement cannot qualify. Qualification records only byte counts, hashes, native identity tokens,
and permission mode metadata in module-private state.

The destination binding proves exact identity and location continuity only. It does not claim a
Windows DACL, POSIX ownership, encryption-at-rest policy, retention authority, or provider-backed
protected destination; those remain external C5B inputs.

### S1 — Closed libpq service selection

The service file is UTF-8 without BOM or NUL/control injection and has exactly one section for each
of the distinct source and isolated service names. Names use the existing closed identifier grammar.
Both sections explicitly provide `host`, `port`, `dbname`, `user`, `sslmode=verify-full`, and bounded
`connect_timeout`, plus `sslrootcert=system`; these seven keys are the complete allowlist and no
field may be blank or duplicated. Client-key, certificate-path, options, environment, and other
libpq fields require a separately planned capability rather than passing through this parser.

The qualifier refuses duplicate service sections, a missing service section, service name collision,
unknown duplicate keys, `service` recursion, and `password` and `passfile` overrides. Those overrides
would bypass the exact `PGPASSFILE` binding. Source and isolated connection coordinates must differ.
No host, database, user, project identifier, or service-file content enters a receipt or error.

This is configuration binding, not project attestation. A later project capability must independently
prove that the source service resolves to the approved named project before catalog or backup access.

### C1 — Credential-file boundary

The pass file is a bounded canonical regular file with an expected digest. Its parsed records use
the libpq five-field form and must have an exact non-wildcard host, port, database, and user tuple for
both selected service sections. A wildcard credential entry, duplicate tuple, empty password,
malformed escape, extra field, or unmatched entry is refused. The password value is never copied
into a capability, environment, receipt, log, assertion message, or durable evidence.

On POSIX, group/other permission bits must be zero. On Windows, this module binds bytes and identity
but does not claim DACL protection; the external protected-credential capability remains required.
`PGPASSWORD` is always removed. The child receives only the exact `PGPASSFILE` path, never password
bytes.

### E1 — Age recipient and identity binding

The age recipient file is a bounded canonical regular file containing unique, non-comment X25519
age recipients, one per line. Blank records, recipient injection, options, shell fragments, duplicate
recipients, and unsupported recipient families are refused.

The age identity file is a distinct bounded canonical regular file. Comments are allowed, but it
must contain exactly one well-formed X25519 age secret identity and no unrelated key material. An
identity format mismatch, multiple secret identities, public recipient substitution, PEM/OpenSSH
private-key block, or control character is refused. The secret line and raw file contents never cross
the module boundary. Only the exact file path is supplied to fixed age argv after capability proof.
On POSIX, the identity file also requires zero group/other permission bits.

This local syntax and digest binding does not prove key ownership, secret-manager policy, recipient
custody, recovery escrow, or successful encryption/decryption. Those are external operator inputs.

### N1 — Sanitized per-process environments

Every `C5BPipelineProcess` carries its own deeply frozen environment and the executor passes it
explicitly to `spawn`. PostgreSQL processes receive only `LANG=C`, `LC_ALL=C`, exact
`PGSERVICEFILE`, exact `PGPASSFILE`, and the bounded `PGCONNECT_TIMEOUT`. Age processes receive only
the locale variables. On Windows, non-blank `SystemRoot` and `WINDIR` may be copied only when they
equal the active runtime values so a caller cannot redirect system lookup; no other ambient value
is inherited.

`PATH`, `HOME`, `USERPROFILE`, `PGPASSWORD`, ambient PostgreSQL variables, Supabase variables,
tokens, proxy variables, loader variables, and arbitrary caller keys are absent. Fixed argv,
`shell:false`, bounded output, bounded timeout, absolute executable paths, and process-tree cleanup
remain mandatory. The source and sink receive separate per-process environment objects, so age does
not receive libpq paths and PostgreSQL does not receive age identity data.

### R1 — Fresh in-memory capability

Successful qualification creates a deeply frozen, in-memory unforgeable capability. A module-local
`WeakMap` binds object identity to exact configuration identity, file/directory snapshots, material
hashes, qualified time, expiry, and last-observed time. The public object exposes only a kind and a
metadata-only receipt hash.

The capability is short-lived. Currentness revalidates configuration binding, monotonic trusted time,
TTL, path identity, size, and exact SHA-256 for every file plus destination identity. A forged
capability, stale capability, time rollback, file replacement, deleted resource, cross-configuration
reuse, or destination relink is refused. Requalification creates a new capability; there is no
deserialize, refresh, warning-only, or stale-grace path.

### I1 — Logical-backup adapter integration

`C5BLogicalBackupNodeConfig` requires the opaque connection-material capability plus the exact four
file paths, destination binding, source and isolated service names. Construction proves that the
capability is bound to the same configuration. It is revalidated before each logical-backup port,
before executable revalidation, and before storage or process access.

The adapter obtains frozen PostgreSQL and age environments from the qualified module and attaches
them to the exact pipeline roles. `pg_dump` and `pg_restore` use the PostgreSQL environment; both age
roles use the age environment. A missing, forged, stale, reused, replaced, or mismatched capability
returns the existing closed reason (`logical_backup_invalid` or `restore_invalid`) and makes zero
pipeline calls. There is no ambient-environment fallback.

### M1 — Metadata-only result

Qualification returns either `qualified` with the capability and a closed receipt or `refused` with
one reason code. The receipt may contain schema/policy versions, material binding hash, file count,
recipient count, service count, qualified/expiry times, destination identity hash, and receipt hash.
It contains no path, service name, host, port, database, user, password, recipient, identity, project,
provider response, environment value, or raw file content.

Raw filesystem errors, parse excerpts, raw credential values, and raw file contents never cross.
Unexpected exceptions collapse to the same closed refusal. Error messages are static.

### T1 — TypeScript and Node threshold

TypeScript and Node are selected because the existing adapter, executor, provider distributions,
and synced-core generation already use them. This work performs bounded local parsing and hashing;
there is no measured threshold breach. Rust, Go, or Python would add distribution, signing, FFI or
sidecar, and cross-platform trust surfaces without a demonstrated benefit.

## Options considered

| Option | Isolation | Credential safety | Complexity | Decision |
|---|---|---|---|---|
| Keep ambient environment and named service argv | Weak; environment can redirect | Hidden inheritance | Low | Rejected |
| Set one shared sanitized environment for both pipeline processes | Better | Age still sees libpq paths | Medium | Rejected |
| Bind exact material and use separate explicit environments per process | Strong local boundary | Password bytes remain in pass file | Medium | Selected |
| Embed connection strings/passwords in argv or environment | Weak and observable | High leakage risk | Low | Rejected |
| Add a new Rust/Go/Python sidecar | Similar semantics | Larger supply-chain surface | High | Rejected without measurement |

The selected option deliberately separates local byte/identity binding from external protection and
live project proof. It removes ambient behavior without claiming that synthetic files establish a
real credential, protected destination, or authorized target.

## Attack and test strategy

### Qualification and file attacks

- invalid configuration, unknown field, path alias, relative/root path, symlink, junction/reparse
  point, missing file, empty file, oversized file, digest mismatch, duplicate path, and concurrent
  file replacement;
- destination alias/relink, file inside destination, destination inside material path, and non-
  directory destination;
- stale capability, time rollback, forged capability, cross-configuration reuse, and mutation of a
  deeply frozen result.

### Libpq and credential attacks

- service name collision, missing service section, duplicate service section, duplicate field,
  missing coordinate, invalid port, weak SSL mode, invalid timeout, password override, passfile
  override, service recursion, and identical source/isolated coordinates;
- malformed pass record, malformed escape, wildcard credential entry, empty password, duplicate
  tuple, unmatched tuple, extra credential record, POSIX permission widening before or after
  qualification, and raw credential in any error/result serialization.

### Age and environment attacks

- recipient injection, unsupported/duplicate/blank recipient, identity format mismatch, multiple
  identities, public-recipient substitution, PEM/OpenSSH block, and control character;
- caller-platform spoofing and Windows `SystemRoot`/`WINDIR` spoofing;
- environment leakage from `PATH`, `HOME`, `USERPROFILE`, `PGPASSWORD`, `PGSERVICEFILE`,
  `PGPASSFILE`, Supabase/token/proxy/loader keys, and arbitrary caller entries;
- proof that PostgreSQL roles receive only qualified libpq paths, age roles receive neither libpq
  path, Windows receives only `SystemRoot` and `WINDIR`, and every spawn keeps `shell:false`.

### Parent-integration attacks

- missing, forged, stale, replaced, relinked, deleted, or cross-config capability produces zero
  pipeline calls and the existing closed parent reason;
- exact source/sink environment separation for backup, restore, and manifest inspection;
- no ambient fallback, no raw stderr, no raw credential, no path or service identifier in results;
  and byte-identical canonical/generated modules on Windows and Linux.

Focused plan/runtime/parent tests precede strict TypeScript, synced-core, provider bundles,
provider distribution, exact-index public/privacy gates, and one complete native kit run. Negative
searches use positive controls. Source and evidence commits remain separate.

## Implementation sequence

1. Reconcile exact merged main, retained branch, daily backup, C5B plans, parent adapter, package
   registration, public manifest, and live nonclaims.
2. Add this validator and package reachability before the plan; prove exact plan-absent RED.
3. Add only this locked plan and prove plan GREEN.
4. Add complete qualification/environment/parent attacks before runtime and prove exact missing-
   module or missing-export RED.
5. Implement the canonical Node qualifier, metadata receipt, module-local capability binding,
   currentness checks, and per-role environment builder.
6. Require the capability in the logical-backup adapter; pass explicit per-process environments and
   preserve fixed argv, `shell:false`, output/time caps, and closed parent results.
7. Regenerate only through `scripts/build-synced-core.ts`; require byte-identical mirrors and run
   focused, strict, provider, public, privacy, and full-kit qualification.
8. Commit the exact source tree with normal hooks; add metadata-only evidence and its public-manifest
   row separately; requalify the evidence tree and commit normally.
9. Under standing Post-17 remote authority, push only the exact evidence head non-force to a retained
   branch, open a Draft PR, require fresh exact-head Linux/Windows/aggregate GREEN plus artifacts and
   no conflicts, mark Ready, standard-merge through PR, and reconcile live/local refs. No publication
   or live C5B capability is implied.

## Exact source manifest

The source candidate is limited to:

- `docs/roadmap/p17-016-wave-c5b-connection-material-capability-plan.md`;
- `packages/core/src/live-cutover-connection-material-qualification-node.ts`;
- `packages/core/test/live-cutover-connection-material-qualification-node.test.ts`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `.claude/integrations/core/live-cutover-connection-material-qualification-node.ts`;
- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `scripts/post-17-privacy-wave-c5b-connection-material-capability-plan.test.ts`;
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The closeout adds only
`docs/evidence/post-17-privacy-wave-c5b-connection-material-capability-2026-08-20.md` and its ordered
public-manifest row. Generated provider bundles may change only through the canonical synced-core
builder when that builder declares them. No dashboard, migration, SQL, target, target `.Codex`,
credential, key, backup, or provider file belongs to this slice.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Material config invalid | Refuse before file or directory inspection beyond validation | Guess a default path or service |
| File/directory alias or replacement | Invalidate capability; zero parent process calls | Follow the alias or reuse cached success |
| Service/pass/age parse refusal | Static closed result; no raw excerpt | Echo credential, host, path, or secret line |
| Capability stale/forged/reused | Refuse and require requalification | Refresh or deserialize implicitly |
| Environment contains an unapproved key | Construct a new allowlisted environment | Delete from and reuse caller object |
| Parent revalidation fails | Existing closed parent reason; zero pipeline/storage access | Continue because executables remain qualified |
| Generated mirror differs | Stop qualification and regenerate canonically | Hand-edit provider copies |

No live rollback exists because this slice performs no live capability. Source rollback reverts the
exact source commit; generated rollback reruns the canonical builder from reverted source. Tests
create only attempt-owned temporary fixtures and remove only exact paths. They never use a worktree
junction or recursively delete a workspace.

## External capability boundary

Live execution still requires a complete concrete C5B packet, independently proven named project,
fresh catalog/ACL/server-version capability, writer-freeze window, provider recovery point,
externally protected destination and credential/key custody, exact executable provenance,
source/isolated database lifecycle, live-server/archive compatibility, restored-state verifier,
cleanup/unfreeze authority, trusted clock, and metadata-only evidence sink.

This module binds local synthetic structure and removes ambient environment inheritance. It does not
create a service/pass/recipient/identity file, obtain credentials or keys, verify a Windows DACL,
provision an isolated database, attest the source project, prove recipient custody, connect to a
server, or make the placeholder approval packet concrete. Missing input remains a stop condition.

## Non-claims

This plan and local slice do not claim credential protection is proven, a named project is matched,
a provider recovery point exists, a protected destination exists, a real connection succeeds, age
key custody is proven, a live logical backup is created, an isolated restore completes, live C5B is
complete, Wave C is complete, or P17-016 is complete.

No real credential/key/file, provider, network, browser, database, SQL, migration, project, backup,
restore, cleanup, sync, target, target `.Codex`, tag, release, publication, or visibility action
occurs in this slice.
