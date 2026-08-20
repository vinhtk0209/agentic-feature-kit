# P17-016 Wave C5B Logical Backup and Isolated Restore Adapter Plan

**Status:** Accepted local implementation slice; no external execution

**Date:** 2026-08-20

**Roadmap task:** P17-016

**Parent plan:** `docs/roadmap/p17-016-wave-c5b-operator-application-plan.md`

**Decision lock:** `adapter=A1, pipeline=P1, encryption=E1, storage=S1, restore=R1, cleanup=C1, result=M1, runtime=T1`

## Context

The C5B core packet, incremental gate, and provider-neutral operator application service are merged.
The operator still has no infrastructure implementation for its encrypted logical-backup and
isolated-restore ports. Its parent plan explicitly deferred a process-owning adapter with direct
argv, `shell:false`, bounded output, bounded timeout, and direct attacks.

This slice supplies only that local Node infrastructure boundary. It is not a provider recovery-point
adapter, project-attestation adapter, catalog probe, writer freezer, restored-state verifier, isolated
database provisioner, cleanup authority, or live runner. It cannot satisfy S1 by itself because a
provider recovery point and a separately controlled isolated destination still remain mandatory.

The command surface was reconciled against the current official PostgreSQL `pg_dump` and
`pg_restore` documentation and the upstream `age` CLI usage before this lock. PostgreSQL custom
archives support streaming output and `pg_restore`; `age` accepts standard input/output with
recipients and identity files. No interactive passphrase mode is permitted.

Live C5B remains incomplete. The current project has no proven provider recovery point, protected
destination, connection service capability, age identity capability, isolated database capability,
or cleanup authority in this repository. No local test may substitute for those external inputs.

## Decision

Implement one Node infrastructure adapter that provides exactly the operator's
`createEncryptedLogicalBackup` and `restoreIsolatedBackup` port methods. It owns three fixed
two-process pipelines, stores one encrypted artifact per validated attempt, and returns only closed
evidence fields already accepted by the C5B core.

The adapter validates the operator context and expected prefix before every capability call. A
successful backup is bound in memory to the packet hash, attempt ID, destination capability, byte
count, backup digest, manifest digest, and expiry. Restore accepts only that exact binding and may run
at most once per adapter instance and attempt.

### A1 — Infrastructure adapter boundary

The adapter imports the C5B packet/prefix core and operator port types. It does not change the core or
operator semantics. It exposes only two compatible port methods and one production Node pipeline
executor factory. The remaining seven operator capabilities must be composed independently.

Configuration is a trusted composition-root closure. It contains closed executable paths, a source
PostgreSQL service capability, an isolated restore service capability, protected age recipients and
identity file references, a protected destination directory, retention duration, and execution
limits. None of those values enters packet data, receipts, results, error messages, logs, or durable
evidence.

Connection material is resolved by libpq's named service capability. There is no connection string in
argv, packet, result, environment mutation, or evidence. Raw password/token/key bytes are never
accepted by this adapter. Service, file, executable, and destination values cannot be supplied by an
operator packet or request payload.

### P1 — Fixed two-process pipelines

Every pipeline contains exactly one source process and one sink process, both spawned directly with
`shell:false`, hidden windows, fixed argv, closed stdio, one shared timeout, and one shared output cap.
The adapter never accepts command names, options, arguments, SQL, shell fragments, environment
overrides, or working directories from the packet.

The exact pipelines are:

1. source-to-encrypt pipeline:
   - `pg_dump --dbname=service=<source-capability> --format=custom --no-password`;
   - `age --encrypt --recipients-file <protected-recipients-reference>`;
   - the binary encrypted stdout is written with exclusive create and owner-only mode to an
     attempt-scoped temporary file, then published without clobber through a same-directory hard
     link followed by removal of the temporary name.
2. decrypt-to-manifest pipeline against the temporary encrypted artifact, before publication:
   - `age --decrypt --identity <protected-identity-reference>`;
   - `pg_restore --list`;
   - bounded list output is hashed in memory and discarded.
3. decrypt-to-restore pipeline:
   - `age --decrypt --identity <protected-identity-reference>`;
   - `pg_restore --dbname=service=<isolated-capability> --exit-on-error --single-transaction
     --no-password`.

Executable and capability values are individually validated as non-blank, control-character-free
configuration. Service names and destination capability IDs use a closed identifier grammar. Fixed
flag placement means shell injection and argument injection candidates remain inert values or are
rejected before spawn.

The pipeline executor never returns raw stderr, provider exceptions, paths, argv, or child output.
It returns closed exit/signal/timeout/cap booleans, byte count, SHA-256, and bounded captured output
only for the internal manifest hash step. Process trees are terminated once on timeout, cap breach,
stream failure, or peer failure.

### E1 — Streaming authenticated encryption

The PostgreSQL custom archive flows directly from `pg_dump` stdout to `age` stdin. Encrypted `age`
stdout flows directly to an exclusive protected file. No plaintext backup at rest exists in the
adapter's design. Restore and manifest inspection decrypt the artifact directly into `pg_restore`
stdin; decrypted bytes are never written to a file or returned.

Only recipients-file encryption and identity-file decryption are permitted. Passphrase mode,
interactive prompts, armor, plaintext input/output paths, caller-provided recipients, caller-provided
identity bytes, and `age --output` are forbidden. The Node file sink, rather than `age`, owns
exclusive-create semantics so an existing artifact cannot be overwritten.

The encrypted artifact SHA-256 and byte count are computed over the bytes actually accepted by the
exclusive file sink. The manifest digest is SHA-256 over the bounded `pg_restore --list` output from
that same encrypted artifact. Zero-byte artifacts, cap breaches, digest absence, or manifest absence
are closed failures.

### S1 — Protected attempt-scoped storage

Configuration binds one closed destination capability ID to one absolute protected directory. The
packet's destination capability ID must match exactly. The adapter never uses that packet value as a
path. The artifact filename is derived only from the validated UUID attempt ID and a fixed suffix.

Temporary and final paths must remain immediate children of the configured directory after native
resolution. The destination cannot be a filesystem root, and protected recipient/identity references
must stay outside it. After creation, native realpath must equal the configured destination so a
symlink, junction, or reparse-point parent cannot redirect writes. The adapter uses exclusive create,
owner-only mode where supported, same-directory no-clobber hard-link publication, and collision
refusal. It never overwrites or recursively deletes.

One adapter instance admits one artifact binding per attempt. A repeated backup request, existing
temporary/final file, destination mismatch, or cross-attempt collision returns
`logical_backup_invalid` before a new process starts.

### R1 — Isolated restore binding

Restore requires a valid C5B prefix whose next operation is `restore_isolated_backup`, the same
packet hash and attempt ID as the stored artifact, and an immediately preceding validated backup
receipt whose backup and manifest digests equal the stored binding.

The target is a separately configured isolated service capability. The packet cannot choose it and
the source and isolated service capability IDs must differ. The restore pipeline never uses
`--create`, `--clean`, arbitrary list filters, or parallel jobs. Owner and ACL entries remain in the
archive and are replayed because parent S1 requires schema/data/ACL fidelity; the isolated authority
must pre-provision the bounded role inventory, provide an empty attempt-owned database, and separately
own teardown. Missing roles fail the transaction rather than silently stripping ACL evidence.

A successful pipeline returns `restored=true`, `isolated=true`, the stored backup digest, and the
stored manifest digest. A second restore for the same attempt is refused. This prevents accidental
replay while leaving the operator's canonical cleanup and full restored-state verification steps
unchanged.

### C1 — Closed failure cleanup

Before no-clobber publication, every failure attempts a non-recursive deletion of only the exact
attempt-scoped temporary file. Manifest verification reads that temporary encrypted artifact; only a
successful manifest check permits publication of the binding. Deletion refusal
keeps the adapter blocked and never converts the attempt to success.

A successful encrypted artifact is not deleted by restore failure or operator compensation; it is a
recovery artifact governed by its approved retention. This adapter has no broad cleanup method and
cannot remove a directory, database, provider recovery point, or another attempt's artifact.

The isolated database cleanup port remains external. Therefore a restore attempt still triggers the
operator's reached-state cleanup behavior even when this adapter returns a closed restore refusal.

### M1 — Metadata-only result

Passed backup evidence contains exactly `encrypted`, `byteCount`, `backupSha256`, `manifestSha256`,
and `expiresAt`. Passed restore evidence contains exactly `restored`, `isolated`,
`sourceBackupSha256`, and `restoreManifestSha256`. Refusals contain only a closed C5B reason code.

Raw process errors never cross the adapter boundary. No stderr, stdout, manifest text, object name,
project identity, service name, path, executable, argv, connection material, recipients, identity,
credential, key, SQL, backup bytes, or decrypted bytes enters a port decision or thrown message.

Expiry is computed from an injected deterministic clock plus the bounded retention duration and must
remain after the current step while not extending beyond an operator-approved maximum encoded in
configuration. The C5B core remains the final evidence validator.

### T1 — TypeScript and Node threshold

TypeScript and Node are selected because the adapter coordinates existing PostgreSQL and `age`
executables and Node streams. There is no measured threshold breach in encryption throughput,
memory, CPU, or restore latency, and the encrypted bytes never need to enter JavaScript memory.

Rust or Go would add a new binary distribution, signing, cross-compilation, and supply-chain surface.
Python would add an interpreter and packaging surface without improving the fixed native pipeline.
A later native replacement requires representative measurements and must preserve the same packet,
fixed argv, metadata, and failure contracts.

## Options considered

| Option | Plaintext at rest | Process safety | Portability | Decision |
|---|---:|---:|---:|---|
| `pg_dump --file`, then encrypt | Yes | Direct argv | High | Rejected |
| Shell pipe from `pg_dump` to encryption | No | Shell parsing/injection surface | Medium | Rejected |
| Buffer full dump in Node then encrypt | No file | Unbounded memory pressure | High | Rejected |
| Direct two-process stream into `age`, Node-owned exclusive sink | No | Fixed argv and `shell:false` | High | Selected |
| Provider-only backup without logical archive | Provider-managed | Strong but opaque | Low | Rejected by parent S1 |

`age` is used as an optional external executable capability because it provides a documented
streaming authenticated format and cross-platform CLI. It is not bundled, downloaded, or installed
by this slice. Missing or wrong-version capability fails closed before any live use; version pinning
and supply-chain verification belong to a later executable-capability qualification packet.

## Attack and test strategy

### Plan and static controls

- exact decision lock, parent-plan binding, source manifest, package/full-suite registration, and
  public manifest admission;
- positive-controlled project identity, connection-string leakage, credential leakage, key, and
  private material scans;
- static denial of `exec`, `execSync`, `spawnSync`, shell strings, SQL bodies, recursive deletion,
  arbitrary environment mutation, and network/provider SDK imports; and
- byte-identical canonical and generated adapter mirrors.

### Configuration and context attacks

- invalid context, invalid packet, wrong destination capability, same source/restore service,
  malformed service identifier, relative destination, control characters, invalid limits, expired
  retention, wrong operation prefix, and forged receipt;
- shell injection and argument injection strings in every configurable identifier;
- connection-string leakage, credential leakage, raw key material, and raw path candidates absent
  from decisions and errors; and
- cross-attempt restore, missing artifact binding, backup hash mismatch, manifest mismatch, repeated
  backup, double restore, and artifact collision.

### Pipeline attacks

- exact executable/argv order, `shell:false`, closed stdio, hidden window, bounded timeout, bounded
  output, and at-most-once termination;
- timeout, output cap, source failure, sink failure, source signal, sink signal, spawn exception,
  stream exception, premature close, and raw stderr controls;
- partial artifact removal, refusal when manifest cleanup fails,
  zero-byte artifact, backup size limit, digest mismatch, manifest absence, and manifest output cap;
- source-to-encrypt pipeline has no plaintext file and decrypt-to-restore pipeline has no decrypted
  file; and
- successful restore emits only the four closed evidence fields and cannot run twice.

Tests inject deterministic spawn and filesystem boundaries. They never invoke real `pg_dump`,
`pg_restore`, `age`, a database, or a secret. Focused tests precede strict TypeScript, synced-core
parity, parent C5B/operator suites, provider distribution, public-source contracts, and one complete
native kit run.

## Implementation sequence

1. Register the plan validator and runtime test; prove one exact plan-absent RED.
2. Add this plan and make the unchanged A1/P1/E1/S1/R1/C1/M1/T1 validator GREEN.
3. Add adapter attacks before runtime and prove exact missing-module RED.
4. Implement config/context validation and fixed pipeline request construction.
5. Implement the Node two-process stream executor with bounded file/capture sinks and closed errors.
6. Implement the two operator-compatible ports and attempt binding/replay controls.
7. Add the adapter to synced-core generation and write the generated mirror only through the
   existing generator.
8. Run focused, strict TypeScript, parent C5B/operator, synced-core, roadmap, provider/public-source,
   and full-kit qualification.
9. Freeze the source tree, add metadata-only evidence, qualify the evidence tree, and commit source
   and evidence separately. Remote PR work remains exact-head guarded.

## Exact source manifest

The source checkpoint is limited to:

- `docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`;
- `scripts/build-synced-core.ts`;
- `package.json`; and
- `release/public-release-manifest.json`.

The separate evidence checkpoint adds only
`docs/evidence/post-17-privacy-wave-c5b-logical-backup-adapter-2026-08-20.md` and its ordered public
manifest row. No existing core/operator runtime, migration, SQL, provider-specific client, dashboard,
target, target `.Codex`, key, credential, connection service, backup artifact, generated provider
archive, or external configuration belongs to this slice.

## Failure and rollback behavior

| Failure | Required behavior | Forbidden behavior |
|---|---|---|
| Invalid config/context/prefix | Refuse before filesystem or process access | Probe capabilities opportunistically |
| Destination mismatch/collision | Refuse before spawn | Treat packet value as a path or overwrite |
| Source or encryption failure | Terminate peers and remove exact temporary file | Return stderr or keep partial plaintext |
| Timeout/output cap | Terminate both process trees once and refuse | Expand limits or continue draining unbounded output |
| Manifest failure | Remove the exact temporary artifact and refuse | Publish an unverified backup binding |
| Restore failure | Refuse and let operator invoke isolated cleanup | Delete retained encrypted recovery artifact |
| Hash/manifest mismatch | Refuse before restore | Trust caller-provided digest |
| Test/build/source update failure | Restore the daily source snapshot if the tree is partial | Continue on a half-updated tree |

Source rollback uses the verified 2026-08-20 backup/tag only if an edit leaves the repository partial.
There is no live rollback because no live capability executes in this slice.

## External capability boundary

This code does not install or qualify PostgreSQL or `age`, create a libpq service file, create age
keys, select a backup destination, provision an isolated database, create a provider recovery point,
freeze writers, or obtain project/database credentials. Those inputs remain outside source and must
be supplied through separately protected operator capabilities.

Live execution still requires a concrete named-project packet, a paid/provider-supported recovery
point or equivalent approved recovery authority, a protected destination, exact executable/version
attestations, named source and isolated service capabilities, recipients/identity authority, fresh
catalog/ACL preflight, bounded freeze, restore verification, exact isolated cleanup, unfreeze, and
metadata-only evidence.

The adapter is not proof that those capabilities exist. Fake processes prove only local control-flow,
argv, streaming, cleanup, and evidence contracts.

## Non-claims

This plan does not claim that a live project matched, writers were frozen, a provider recovery point
was created, a live logical backup was created, a backup artifact exists, backup bytes were produced,
an isolated live restore was completed, a database was provisioned, restored-state parity was
observed, cleanup ran, writers were unfrozen, live C5B completed, P17-016 completed, or a dependent
task became ready.

It performs no provider, database, browser, network, backup, restore, process, filesystem, SQL, DDL,
DML, migration, bootstrap, route, deploy, canary, cutover, sync, target, target `.Codex`, push, merge,
tag, release, publication, visibility, credential, key, grant, spend, plan upgrade, or broad deletion
action.
