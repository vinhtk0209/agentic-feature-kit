# P17-016 Wave C5B Logical Backup and Isolated Restore Adapter Evidence

**Date:** 2026-08-20

**Scope:** Local Node infrastructure adapter only

**Source commit:** `f28fef55f4243a0b98c1527e610df6e6a109294e`

**Qualified source tree:** `709a0eb39a969812642d063a5bb7077ab5c10099`

## Outcome

The C5B logical-backup adapter is locally source-qualified. It implements the two infrastructure
ports that the provider-neutral C5B operator intentionally left external:
`createEncryptedLogicalBackup` and `restoreIsolatedBackup`.

The adapter streams a custom-format database dump directly into authenticated encryption, verifies
the encrypted temporary artifact through a decrypt-to-manifest pipeline, and publishes it without
overwriting an existing attempt artifact. Restore is bound to the exact packet, attempt, artifact
metadata, and isolated destination capability.

This slice did not access a live provider or database. It did not create backup bytes outside test
fixtures, restore a database, freeze writers, create a provider recovery point, clean live resources,
or complete C5B or P17-016.

## Locked decisions

The registered plan validator locks:

- `adapter=A1` — one narrow Node adapter behind the existing core ports;
- `pipeline=P1` — fixed direct-spawn two-process pipelines with enumerated arguments;
- `encryption=E1` — streaming authenticated encryption without plaintext backup at rest;
- `storage=S1` — a pre-provisioned protected destination with attempt-scoped artifacts;
- `restore=R1` — manifest verification followed by exact isolated restore;
- `cleanup=C1` — bounded, non-recursive cleanup of only the current temporary artifact;
- `metadata=M1` — closed, metadata-only decisions and evidence; and
- `runtime=T1` — TypeScript and Node remain selected without a measured threshold breach.

The architecture review kept provider recovery-point creation, storage provisioning, key lifecycle,
database service definitions, writer freeze, and cleanup authority outside this adapter. The testing
review derived attacks from each trust boundary before implementation and retained every valid RED
case as a regression test.

## Runtime contract

Backup uses these fixed command shapes:

1. `pg_dump --dbname=service=<source-service> --format=custom --no-password`;
2. `age --encrypt --recipients-file <protected-reference>`;
3. `age --decrypt --identity <protected-reference>` piped to `pg_restore --list`.

Restore uses:

1. `age --decrypt --identity <protected-reference>`;
2. `pg_restore --dbname=service=<isolated-service> --exit-on-error --single-transaction --no-password`.

Every process uses `shell:false`, closed standard streams, bounded output, and a bounded timeout.
Owner and access-control replay remain enabled because the isolated restore must prove fidelity; the
adapter does not silently strip them. No command string, SQL body, connection string, credential,
key material, process stderr, or provider exception is returned in a decision.

## Storage and binding controls

- The protected destination must already exist and cannot be a filesystem root.
- Native real-path equality rejects a symlink or junction parent that escapes the configured
  destination capability.
- Recipient and identity references must resolve outside the artifact destination.
- The temporary artifact is created exclusively with restrictive file mode.
- Publication uses a same-directory hard link to the final attempt name and then unlinks only the
  temporary name. An existing final artifact is never overwritten.
- Hash and size are recomputed from the encrypted file before manifest verification and publication.
- One packet and attempt can bind one backup artifact and at most one restore.
- Cross-attempt, forged, mismatched, repeated, or malformed bindings stop before process creation.

## Red-to-green evidence

1. The plan validator first exited `1` only because the plan did not exist. The completed plan then
   passed with `A1/P1/E1/S1/R1/C1/M1/T1` locked.
2. The nine-group runtime attack file first reached an exact missing-module error for the absent
   adapter. No implementation existed at that RED checkpoint.
3. Two fake-process harness defects were corrected without changing product expectations: listener
   registration order and write-after-end behavior after a simulated kill.
4. Adversarial command review produced a valid three-group RED: the initial service syntax was
   wrong, restore stripped owner/access-control fidelity, and a second-spawn exception orphaned the
   first child. Fixed keyword syntax, noninteractive arguments, fidelity-preserving restore, and
   first-child termination made all nine groups pass.
5. A second adversarial review produced a valid path/publication RED: the configuration accepted an
   unsafe destination/reference shape and rename could overwrite a colliding final artifact on some
   platforms. Pre-provisioning, native real-path equality, and exclusive hard-link publication closed
   those paths.

No assertion, static denial, timeout, output cap, or public-source gate was weakened to obtain GREEN.

## Focused and type qualification

- Logical-backup adapter: `9/9` grouped checks passed.
- Parent operator regression: `9/9` grouped checks passed.
- Parent core regression: `9/9` grouped checks passed.
- Plan validator: `A1/P1/E1/S1/R1/C1/M1/T1` locked.
- TypeScript `5.9.3`: strict, no emit, and `skipLibCheck=false` with zero diagnostics.
- Synced-core generator attacks: `4/4` passed.
- Synced-core check: nine byte-identical generated files.
- Static audit: cached diff clean; JSON valid; English-only feature content; positive-controlled
  project-identity, endpoint, token, private-key, and credential scans found no candidate leakage.

## Provider and public-source qualification

- Provider core remained green for three providers, two byte-identical skills, and five default
  shared runtimes.
- Provider distribution passed three deterministic archives, `71` entries, eight schema-valid and
  secret-clean sidecars, `11` checksums, `79` text scans, `15` runtime smokes, and four attacks.
- Public release readiness passed one canonical case plus `40` attacks.
- Public release contract passed `18/18` tests.
- Public Git-index Node adapter passed `7/7` tests.
- Link readiness covered `202` Markdown files and `48/48` valid relative links.
- License readiness covered four lockfiles, `754` dependency occurrences, and `617` unique
  dependencies.
- Secret readiness covered `674` text files and ten detector families with zero findings.
- Final source-checkpoint status was `eligible-for-r5c2` across `677` manifest paths before this
  evidence row.

The optional adapter is public source but is not advertised as a sixth default provider runtime.
Its external executables, protected storage, database services, and key references require an
explicit deployment packet and independent operational qualification.

## Full-kit qualification

Native `npm test` completed with exit code `0` in `356.1` seconds and produced `2,245` output lines on
the exact qualified source tree. Final checks retained:

- package and prompt version `v3.25`;
- prompt size `163,206` bytes within budget; and
- lesson synchronization `60/60`.

The only warnings were the existing malformed lesson-fixture warnings used by negative tests.

## Exact source manifest

The source commit contains exactly:

- `.claude/integrations/core/live-cutover-logical-backup-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-logical-backup-adapter-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-logical-backup-node.ts`;
- `packages/core/test/live-cutover-logical-backup-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-logical-backup-adapter-plan.test.ts`.

The canonical adapter and generated integration mirror are byte-identical.

## Rollback and failure behavior

Before remote publication, the source commit can be reverted as one unit from its exact parent. The
daily repository tag and working-tree archive provide the independent workspace recovery point.

At runtime, failure removes only the current attempt's unpublished temporary artifact. Cleanup is
non-recursive and fails closed if exact removal cannot be confirmed. A published final artifact is
never recursively removed or silently replaced by this adapter. Restore failure returns a closed
reason and does not fabricate a successful restore receipt.

## Inputs required before live use

A later operational packet must independently prove all of the following before any live invocation:

- the exact named project and source database service;
- a bounded writer-freeze window and the canonical operator packet;
- a provider recovery point from an authorized capability;
- a pre-provisioned protected destination with capacity, retention, and cleanup authority;
- protected recipient and identity references with lifecycle and access controls;
- an isolated destination service that cannot address production;
- installed and independently qualified executable versions;
- trusted archive provenance, because restoring an untrusted archive can execute source-controlled
  database actions; and
- evidence retention and post-restore catalog, access-control, extension, and checksum comparisons.

Missing or ambiguous live input remains a stop condition. The local adapter does not convert absent
capabilities into readiness.

## Non-claims

This evidence does not claim a live project matched, a writer freeze occurred, a provider recovery
point exists, a protected destination or key capability exists, a source database was reached, a
logical backup was created, encrypted bytes were retained, an isolated restore ran, owner or
access-control parity was observed, cleanup ran, writers were unfrozen, live C5B completed, P17-016
completed, or a dependent task became ready.

It records no project identity, URL, host, service definition, connection material, credential, key,
artifact path, backup bytes, manifest body, SQL body, row value, subject identity, or machine
identity. No sync, target, target `.Codex`, provider mutation, database mutation, push, merge, tag,
release, publication, visibility change, credential/key/grant operation, or broad deletion occurred
in this checkpoint.
