# P17-016 Wave C5B Executable Capability Qualification Plan

**Status:** Approved local dependency-unblocking slice; live C5B remains incomplete
**Date:** 2026-08-20
**Roadmap task:** P17-016
**Parent:** P17-016 Wave C5B logical-backup and isolated-restore adapter
**Decision lock:** `qualification=A1`, `bytes=B1`, `versions=V1`, `paths=P1`, `probes=E1`, `freshness=F1`, `integration=I1`, `result=M1`, `runtime=T1`

## Context

The merged C5B logical-backup Node adapter owns three fixed pipelines around `pg_dump`,
`pg_restore`, and `age`, but its parent plan intentionally deferred version pinning and supply-chain
qualification. Absolute paths alone do not prove that the expected executable bytes are present,
that the tools report an accepted release, or that an operator-approved provenance receipt still
matches. A replaced binary could otherwise enter the backup pipeline after configuration validation.

This slice closes only that local infrastructure gap. It qualifies exact local executable and
provenance-receipt bytes, returns a short-lived capability, and makes the logical-backup adapter
revalidate the same binding before each port. It does not discover tools from `PATH`, download or
install software, verify a live PostgreSQL server version, create a provider recovery point, reach a
database, or authorize live C5B.

The executable contracts follow the primary tool surfaces: PostgreSQL documents `pg_dump` and
`pg_restore --version`, custom archives, and restore behavior at
<https://www.postgresql.org/docs/17/app-pgdump.html> and
<https://www.postgresql.org/docs/17/app-pgrestore.html>; the age manual documents `age --version`
at <https://github.com/FiloSottile/age/blob/main/doc/age.1.ronn>. These references justify the
non-mutating probe surface. Operator policy, not the network or this source tree, supplies the exact
accepted release and digests.

## Decision

Implement one Node infrastructure qualification module and integrate its opaque capability into the
existing logical-backup adapter configuration. Qualification is explicit and fail-closed. It uses
operator-supplied expectations, local regular-file inspection, bounded hashing, fixed version probes,
and post-probe reinspection. A caller receives either one metadata-only qualified result or the
single closed reason `executable_qualification_invalid`.

### A1 — Infrastructure qualification boundary

The new module owns filesystem hashing and single-process version probes. It imports no C5B domain,
operator, provider, database, network, browser, secret-manager, or environment-discovery client. The
logical-backup adapter imports only its capability type and revalidation function.

Configuration is injected once. It contains three explicit tool expectations, bounded file/output/
time limits, one bounded qualification lifetime, and a deterministic clock. There is no `PATH`
lookup, registry lookup, package-manager call, download, update, arbitrary executable, arbitrary
argument, arbitrary environment, or arbitrary command surface.

### B1 — Exact byte and provenance binding

Each tool expectation binds an absolute executable path to an exact SHA-256, an exact accepted
version, an absolute externally verified provenance receipt path, and its exact provenance receipt
digest. The operator or release authority verifies receipt authenticity outside this module. The
module proves only that the locally supplied receipt bytes and executable bytes match those approved
digests; it does not claim to validate a vendor signature, package registry, Sigsum proof, or code-
signing chain.

Both executable and receipt are hashed before the version probe. The same paths are statted and
hashed again afterward. Qualification requires matching pre-probe and post-probe hashes, sizes, and
file identities. Reads are bounded by separately configured maximum executable and receipt sizes.
No executable bytes or receipt body enters a result, log, source file, or evidence document.

### V1 — Strict version and tool-family compatibility

The only probe argv values are:

- `pg_dump --version`;
- `pg_restore --version`; and
- `age --version`.

`pg_dump` and `pg_restore` must report the same exact PostgreSQL release selected by policy. Their
strictly parsed tool names cannot be exchanged, and suffix text is accepted only as bounded printable
vendor text after the canonical version token. The exact executable digest remains authoritative, so
a version string alone cannot qualify different bytes.

`age` must report the exact configured stable age semantic version, with an optional leading `v` and
no development, dirty, unknown, or empty version. A mismatched pg_dump and pg_restore release,
wrong tool label, duplicate executable identity, unparseable output, embedded control character, or
extra line refuses qualification.

This local version proof does not establish live server compatibility. Before live C5B, the separate
catalog capability must prove the source server is not newer than the qualified dump tool and that
the isolated target can accept the selected archive. The PostgreSQL documentation remains the
authority for that external compatibility decision.

### P1 — Canonical path and file identity

Every executable and provenance receipt must be an existing canonical regular file at the exact
configured absolute path. Native real-path equality is required, case-normalized only on Windows.
Root paths, directories, special files, missing files, and a symlink, junction, or reparse point are
refused. All three executable identities must be distinct. An executable cannot also be used as a
provenance receipt.

The module records only internal canonical paths and stable file identity metadata in a module-local
binding. Public receipts omit paths, filenames, device/inode values, and local account information.
Hard links are not presented as independent provenance: duplicate file identity across tool roles is
refused even when the configured paths differ.

### E1 — Enumerated non-mutating probes

The production executor accepts one closed tool role and constructs its executable and `--version`
argv from the already validated binding. Every child uses `shell:false`, fixed argv, a sanitized
environment, a canonical executable-parent working directory, hidden Windows process UI, bounded
output, and a bounded timeout. Standard input is closed. The executor never forwards operator text,
credentials, connection values, service names, SQL, or project identity.

Only printable single-line version output is accepted. A non-zero exit, signal termination, timeout,
output cap, unexpected stderr, missing stdout, spawn error, or process-tree cleanup failure returns
the same closed refusal. Raw process errors never cross the boundary. The sanitized environment
contains only locale controls and the minimum Windows system-root values needed to start an absolute
executable; it does not inherit tokens, database variables, proxy variables, or user profile paths.

### F1 — Fresh in-memory capability

Successful qualification creates one deeply frozen, in-memory unforgeable capability. A module-local
`WeakMap` owns its canonical bindings; a structurally similar object is not valid. The public result
contains a policy version, qualification and expiry timestamps, exact tool versions, executable
digests, and provenance receipt digests, but no path or body.

The capability is short-lived. Its expiry is bounded by policy, and the logical-backup adapter's
trusted clock must be within `[qualifiedAt, expiresAt)`. Time rollback, invalid clock output, expiry,
forged capability, or cross-configuration reuse refuses before any logical-backup process or artifact
access.

### I1 — Logical-backup adapter integration

`C5BLogicalBackupNodeConfig` requires the opaque executable capability in addition to the existing
absolute paths. Construction binds the capability to the exact three configured paths. Each
`createEncryptedLogicalBackup` and `restoreIsolatedBackup` invocation is revalidated before each
logical-backup port reaches protected storage or a process. Revalidation rechecks freshness,
canonical identity, exact executable and provenance digests, and the configuration binding.

A replaced, deleted, relinked, resized, or changed executable or receipt invalidates the capability.
The adapter returns its existing closed port reason (`logical_backup_invalid` or `restore_invalid`)
and performs zero pipeline calls. Requalification must produce a new capability; there is no warning,
automatic refresh, stale fallback, or bypass flag.

### M1 — Metadata-only result

The qualified receipt is a closed value containing only:

- schema and policy versions;
- qualification and expiry timestamps;
- three closed tool roles;
- exact normalized versions;
- executable SHA-256 values; and
- provenance receipt SHA-256 values.

The refusal contains only `executable_qualification_invalid`. It never contains a path, filename,
stdout, stderr, exception, environment value, user name, host, project identity, connection material,
credential, key, SQL, binary byte, receipt body, or provider response. The receipt may support later
metadata-only evidence, but is not itself live C5B evidence.

### T1 — TypeScript and Node threshold

TypeScript and Node remain selected because the parent adapter and provider distributions already use
them, Node provides portable spawn/file/hash primitives, and there is no measured threshold breach.
The tests must run on Linux and Windows. Rust, Go, Python, FFI, native add-ons, and a sidecar would add
distribution and supply-chain surfaces without a measured security, latency, or throughput benefit.

## Options considered

| Option | Byte identity | Freshness | Integration safety | Decision |
|---|---:|---:|---:|---|
| Trust absolute paths and `--version` only | Weak | None | Spoofed or replaced bytes can execute | Rejected |
| Hash once and persist a JSON receipt | Strong initially | Stale after replacement | Forgeable/replayable across configurations | Rejected |
| Package-manager discovery or auto-install | Variable | Mutable network state | Expands authority and supply chain | Rejected |
| OS-specific signature verification only | Platform-specific | Strong on one platform | Not portable and incomplete for all tools | Rejected |
| Exact byte/receipt binding plus bounded probes and fresh in-memory revalidation | Strong local binding | Bounded and rechecked | Fail-closed before every parent port | Selected |

The selected option deliberately separates byte binding from provenance authenticity. A later live
packet must name the external authority that verified each receipt. This module neither downloads
the receipt nor upgrades that external assertion into a cryptographic claim it did not perform.

## Attack and test strategy

### Plan and static controls

- plan-absent RED, exact decision headings, parent dependency, package/full-suite reachability, and
  exact source manifest;
- feature content is English and positive-controlled privacy scans reject project URLs, JWTs,
  service credentials, private keys, and database-password assignments;
- source scans reject network/provider SDKs, package-manager/download calls, arbitrary shell, `PATH`
  lookup, broad environment inheritance, raw exception echo, and live-completion claims; and
- canonical and generated modules remain byte-identical.

### Qualification attacks

- invalid configuration, unknown fields, blank/control values, invalid limits, invalid clock, and
  invalid digest or version grammar;
- path alias, relative path, root path, symlink, junction/reparse point, missing executable,
  directory/special file, duplicate file identity, and executable/receipt identity collision;
- oversized executable, executable digest mismatch, missing provenance receipt, oversized receipt,
  and provenance digest mismatch;
- wrong PostgreSQL version, wrong tool label, mismatched pg_dump and pg_restore versions,
  development age version, multi-line or control-character version-output injection;
- timeout, output cap, non-zero exit, signal termination, spawn failure, raw stderr, and raw error
  controls;
- environment leakage control proves a synthetic secret is absent from the spawned environment;
- executable replacement and receipt replacement between the two hashes refuse qualification; and
- successful fake probes prove exact tool order, fixed args, `shell:false`, sanitized environment,
  bounded working directory/output/time, normalized versions, and metadata-only receipts.

### Capability and parent-integration attacks

- forged capability, stale capability, time rollback, cross-configuration reuse, wrong executable
  path binding, duplicate qualification, and mutation attempts;
- executable replacement, receipt replacement, deletion, relink, and identity drift after
  qualification refuse currentness;
- both logical-backup ports perform zero pipeline calls when currentness fails;
- each parent port invokes currentness once before protected-destination or process access; and
- existing logical-backup backup/manifest/restore, replay, cleanup, timeout, no-clobber, and Windows
  canonical-temp attacks remain GREEN with a valid fake qualification fixture.

Focused plan and runtime tests precede strict TypeScript, parent C5B tests, synced-core parity,
roadmap/provider/public-source gates, and one complete native kit run. Every negative search has a
positive control. Fake files and fake probes prove local policy only; they do not prove a production
tool, live project, database, provider, backup, or restore.

## Implementation sequence

1. Reconcile the parent adapter, package registration, current branch/main identity, backup, public
   manifest, and live-input nonclaims.
2. Add the plan validator and focused/full parent registration before the plan; prove exact
   plan-absent RED.
3. Add this locked plan and rerun the unchanged validator to GREEN.
4. Add complete qualification and parent-integration attacks before runtime; prove exact missing-
   module RED.
5. Implement the provider-neutral configuration/result contracts, Node file/hash/probe executor,
   opaque capability, and currentness validator.
6. Require and revalidate the capability in the existing logical-backup adapter without changing its
   command pipelines, privacy results, artifact semantics, or closed reason codes.
7. Add the new module to synced-core generation and write mirrors only through the canonical builder.
8. Run focused, strict TypeScript, parent core/operator/logical-backup, synced-core, roadmap,
   provider distribution, public-source, exact-index, and full native kit qualification.
9. Commit source with normal hooks, then add one metadata-only evidence document plus one lexical
   public-manifest row and repeat affected/public/full qualification before a separate evidence commit.
10. Only after exact identity and clean-tree checks may a later remote packet push the retained branch,
    open a Draft PR, require exact-head Linux/Windows/aggregate GREEN, and standard-merge through the
    PR. No publication or live capability is implied.

## Exact source manifest

The source commit may contain only:

- `docs/roadmap/p17-016-wave-c5b-executable-capability-qualification-plan.md`;
- `packages/core/src/live-cutover-executable-qualification-node.ts`;
- `packages/core/test/live-cutover-executable-qualification-node.test.ts`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `.claude/integrations/core/live-cutover-executable-qualification-node.ts`;
- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `scripts/post-17-privacy-wave-c5b-executable-capability-plan.test.ts`;
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The separate closeout commit may add only
`docs/evidence/post-17-privacy-wave-c5b-executable-capability-qualification-2026-08-20.md` and its
ordered row in `release/public-release-manifest.json`. Workspace handoff/router files are outside the
kit commit manifest and update at every scope transition.

## Failure and rollback behavior

| Failure | Required response | Forbidden response |
|---|---|---|
| Invalid configuration/path/file | Closed refusal before probe | Search `PATH` or guess another binary |
| Digest or provenance mismatch | Refuse and require a new approved packet | Accept matching version text |
| Probe timeout/output/exit/signal/error | Kill bounded tree and return closed refusal | Echo raw process detail or retry another command |
| Pre/post identity or hash mismatch | Refuse the entire qualification | Keep the first hash as success |
| Capability forged/stale/reused | Parent port refuses before storage/process access | Deserialize or refresh it implicitly |
| Post-qualification replacement | Currentness fails; create a new qualification | Execute because the receipt was once valid |
| Parent regression | Stop, revert this slice, and rerun parent qualification | Weaken existing artifact/path/cleanup controls |

No live rollback exists because this slice performs no live capability. Source rollback reverts the
exact source commit; generated rollback reruns the canonical synced-core builder from the reverted
source. Tests create only attempt-owned temporary regular files and remove only those exact paths.
They do not recursively delete a workspace, use a worktree junction, or modify external software.

## External capability boundary

Live execution still requires the complete concrete C5B named-project packet, writer-freeze window,
provider recovery point, protected destination, source and isolated libpq services, recipients and
identity refs, isolated lifecycle and cleanup authority, project/catalog/ACL capabilities, restored-
state verification, and metadata-only evidence sink.

The executable portion additionally requires installed immutable tool files, approved exact digests,
an externally verified provenance receipt and digest for every tool, accepted versions, a trusted
clock, and an operator-confirmed live server/archive compatibility decision. This local module does
not create or discover any of those external inputs. Missing or ambiguous input remains a stop
condition even under standing Post-17 continuation authority.

## Non-claims

This plan and local slice do not claim supply-chain authenticity is proven, a vendor signature or
Sigsum proof was verified, production executables exist, a live PostgreSQL server is compatible, a
named project matched, a writer freeze occurred, a provider recovery point exists, a live logical
backup was created, an isolated live restore completed, a database was read or changed, live C5B is
complete, Wave C is complete, or P17-016 is complete.

No provider, network, browser, database, migration, SQL, project, secret-manager, credential, key,
backup, restore, cleanup, sync, target, target `.Codex`, tag, release, publication, or visibility
action occurs in this slice.
