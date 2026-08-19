# P17-016 Wave C5B Preflight and Snapshot Contract Evidence

**Source qualification date:** 2026-08-19
**Evidence finalized:** 2026-08-20
**Source commit:** `4230aa6b7c754bfd39427b6efc60c1a124475952`
**Source parent:** `df2c9ea16079f83c0c16ff16a95d8bfe14df9923`
**Source tree:** `9b9338aa615404bd60f428c1725562e8051f6131`
**Branch:** `p17-016-c5b-preflight-snapshot-contract`
**Local decision lock:** `boundary=B1, project=P1, operations=O1, receipt=R1, failure=F1, schema=S1, runtime=T1`

## Result

The local C5B preflight and snapshot contract is source-qualified. It provides a pure,
deterministic, fail-closed packet, operation-receipt, and completion-receipt state machine for the
nine ordered preflight operations required before a later authorized live cutover slice.

The qualified contract does not execute those operations. Live C5B remains input-blocked because
the operator has not supplied the separate named-project packet with an exact freeze window,
protected backup destination capability, isolated restore capability, cleanup authority, and
evidence authority. P17-016 therefore remains `in_progress`.

## Architecture and testing-strategy influence

The architecture workflow selected a Clean Architecture boundary with a pure core and injected
future infrastructure ports. Project identity, provider clients, credentials, SQL, filesystem,
process, browser, and network access stay outside the packet and receipts. The core imports only
deterministic SHA-256 hashing. Canonical source lives in `packages/core/src`; the existing
synced-core generator owns the byte-identical `.claude` production mirror.

The decision record rejected a shell workflow, provider-shaped core, runtime-specific schema, and
premature Rust, Go, or Python port. TypeScript remains sufficient because the work is bounded
validation, hashing, and state reduction, and no measured capability or performance threshold was
breached. A Draft-07 JSON Schema publishes the language-neutral envelope.

The testing-strategy workflow produced four evidence layers:

1. plan and dependency truth;
2. canonical runtime and direct schema attacks;
3. mirror, repository-boundary, public-source, strict-type, and static safety gates; and
4. complete staged-tree and immutable-source kit regressions.

A lower layer is not treated as proof for a higher layer.

## Contract and failure boundary

The exact operation order is:

1. `attest_project`;
2. `probe_catalog_acl`;
3. `freeze_writers`;
4. `create_provider_recovery_point`;
5. `create_encrypted_logical_backup`;
6. `restore_isolated_backup`;
7. `verify_restored_state`;
8. `cleanup_isolated_restore`; and
9. `complete_preflight`.

Completion requires exact packet and receipt hashes, project-class agreement, one bounded freeze
window, zero active writers after freeze, a live recovery point, a non-empty encrypted backup,
isolated restore bound to that backup, catalog/ACL/source parity, a passing rollback suite, zero
cleanup residue, unexpired recovery artifacts, and the exact derived completion hash.

Receipts are metadata-only. They contain closed identifiers, hashes, counts, timestamps, statuses,
and reason codes. They cannot contain project IDs, URLs, hosts, paths, connection material, backup
bytes, raw provider errors, credentials, secrets, SQL, row bodies, or free-form evidence.

## RED and correction evidence

The implementation retained the complete fail-first chain:

- the plan validator first failed only because the C5B plan was absent;
- the first plan GREEN attempt exposed a polarity defect where a truthful `Non-claims` sentence was
  scanned as an affirmative completion claim;
- the runtime attack suite then failed exactly on the absent core module;
- strict TypeScript found three test-only diagnostics: duplicate import, nullable evidence access,
  and an incomplete schema-inspection type;
- adversarial review proved the first JSON Schema accepted `passed` with null evidence, exposing
  missing status/reason and operation/sequence/evidence bindings;
- the first exact Git-index public-source run blocked because new paths lacked ordinal admission;
- the first full-kit pretest rejected a dashboard-dependent workspace command that had been wired
  into `test:kit`;
- the second full-kit run reached synced-core and rejected two directly authored generated extras;
  canonical ownership was moved to `packages/core`; and
- the moved canonical test then failed on one stale sibling import before it was corrected to
  `../src/live-cutover-preflight`.

No failed gate was suppressed. The language-neutral schema now binds status to reason/evidence,
operation to sequence, and every passed operation to its exact evidence shape. Repository-boundary
tests keep the eight workspace-only commands outside `test:kit`, and synced-core refuses unexpected
generated files.

Three intermediate static-audit wrapper failures were also retained as harness evidence: one
PowerShell quote parse error, one disproven broad-range language false positive, and one malformed
synthetic secret-control tuple. Each was corrected without weakening a source detector.

## Exact source manifest

Source commit `4230aa6b7c754bfd39427b6efc60c1a124475952` contains exactly nine paths,
2,385 insertions, and one deletion:

- `packages/core/src/live-cutover-preflight.ts` — canonical pure contract;
- `packages/core/test/live-cutover-preflight.test.ts` — canonical runtime/schema attacks;
- `.claude/integrations/core/live-cutover-preflight.ts` — generated byte-identical production mirror;
- `docs/roadmap/p17-016-wave-c5b-preflight-snapshot-contract-plan.md` — decision record and input boundary;
- `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json` — language-neutral closed schema;
- `scripts/post-17-privacy-wave-c5b-preflight-snapshot-plan.test.ts` — plan/readiness validator;
- `scripts/build-synced-core.ts` — canonical mirror allowlist;
- `package.json` — focused and full-kit registrations; and
- `release/public-release-manifest.json` — six ordinal source admission rows.

The normal commit hook passed `spec-integrity` over five TypeScript files. The source commit has the
exact qualified tree `9b9338aa615404bd60f428c1725562e8051f6131` and parent
`df2c9ea16079f83c0c16ff16a95d8bfe14df9923`.

## Authoritative test evidence

- C5B plan: `B1/P1/O1/R1/F1/S1/T1` locked.
- Parent C5A plan: `P1/S1/M1/B1/K1/C1/G1/R1/L1/O1/E1/X1` locked.
- Canonical roadmap: 22 tasks and four initiatives; P17-016 remains `in_progress`.
- C5B runtime/schema: eight grouped tests passed, including six direct schema-binding attacks and
  project, freeze, recovery, backup, restore, parity, cleanup, expiry, ordering, and forgery attacks.
- Synced core: four generator attacks passed; seven production mirrors are byte-identical.
- Repository boundary: eight workspace commands remain excluded from `test:kit`.
- TypeScript 5.9.3: strict, no emit, `skipLibCheck=false`, zero diagnostics over canonical
  source/test, synced-core builder, and plan validator.
- Public release domain: 18/18 contract tests passed.
- Public-source readiness: 665 manifest paths, 198 Markdown files, 48/48 links, four lockfiles,
  754 dependency occurrences, 617 unique dependencies, 662 text files, ten secret detector
  families, and zero issues.
- Dependency audit: zero vulnerabilities.
- Complete staged-tree kit: exit `0` in 497.6 seconds with 2,206 output lines.
- Complete immutable-source kit at `4230aa6b7c754bfd39427b6efc60c1a124475952`: exit `0` in
  449.3 seconds with 2,206 output lines.
- Both complete runs ended with v3.25 stamps, prompt budget `163,206/176,128`, and lesson sync
  `60/60`.

## Static and privacy evidence

The exact nine-path candidate passed strict UTF-8 decoding, no BOM, final LF, three JSON parses,
cached whitespace, and explicit English-only feature-content checks. Canonical source and generated
mirror have the same SHA-256:
`0308fc43a6e8c3c11f059369e66bef8e1b65cc5477ffa796071f36bc7c4692ba`.

Five independent secret/identity detectors first matched their synthetic controls and then found
zero non-test source hits for GitHub tokens, JWTs, private keys, database DSNs, and Supabase project
URLs. The runtime test separately positive-controls six privacy patterns and proves that a serialized
success packet/receipt contains none of them.

The dashboard was not modified. Its forbidden user-owned local settings file was not read, edited,
staged, or committed. No target repository or target `.Codex` directory was modified.

## Rollback and external input boundary

The source commit can be reverted through the later PR if remote qualification fails. The verified
current-day rollback authorities are tag `backup/2026-08-20` at
`4230aa6b7c754bfd39427b6efc60c1a124475952` and the 2,872,644-byte worktree ZIP with SHA-256
`f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`.

Live C5B remains blocked until the operator supplies one exact packet:

`APPROVE P17-016 C5B PREFLIGHT v1: project=<named>, snapshot=S1, freeze=<bounded-window>, destination=<protected-capability>, restore=<isolated-capability>, cleanup=<authority>, evidence=E1`

That later packet authorizes only the named preflight/recovery/restore/cleanup slice. It does not
authorize C5C migration/bootstrap, C5D composition/canary, C5E cutover, sync, release, publication,
or visibility changes.

## Non-claims

This evidence does not claim that a live project was accessed, writers were frozen, a provider
recovery point was created, a logical backup exists, backup bytes were captured, a restore was
executed, restored state was verified, cleanup ran, SQL was applied, a tenant was bootstrapped,
credentials or grants were created, a route or canary ran, cutover occurred, sync eligibility
changed, C5 completed, Wave C completed, or P17-016 completed.

No live Supabase, provider, database, or browser network access; snapshot, backup-data, restore, SQL,
migration, bootstrap, deployment, canary, cutover, sync, target, publication, release tag, GitHub
Release, or visibility action occurred in this source/evidence slice.
