# P17-016 Wave C5B catalog and ACL metadata-probe capability evidence

**Date:** 2026-08-20
**Status:** source implemented and locally qualified; live provider capability not configured
**Source commit:** `d416dccfdfbcda115e2ca3472dfde021135ead56`
**Source parent:** `6e36cf5ece0a8624e9e77dfbabaaff8323c9fb73`
**Qualified source tree:** `d9af36301dfb259dd2c455b3e24d2bc8ec72e7a5`
**Branch:** `p17-016-c5b-catalog-acl-probe-capability`

## Outcome

The second canonical C5B operation now has a provider-neutral Node capability boundary. It no longer
needs to trust an application callback that returns precomputed catalog hashes. A future fixed-query
infrastructure adapter supplies seven exact scalar rowsets; the capability validates and
canonicalizes those rows, derives five domain-separated SHA-256 hashes, verifies the approved server
version and source expectations, derives two bounded counts, and returns only the existing C5B
metadata receipt shape.

The capability contains no SQL, provider SDK, database client, network client, filesystem access,
environment lookup, child process, browser access, or logging. It performs no live operation. The
live provider query adapter, protected capability composition, source expectation capture, and exact
named-project execution remain separate required work.

## Locked architecture

The accepted decision lock is:

`boundary=A1, rows=R1, hashing=H1, version=V1, bounds=B1, replay=S1, integration=O1, result=M1, runtime=N1`

### Trust boundary

- Factory configuration and the observation source are exact own-enumerable data-property objects.
- The source method, expected hashes, expected server version, limits, and trusted clock are
  snapshotted at factory creation.
- The observation source receives only attempt ID, environment class, source-binding hash, and one
  bounded `AbortSignal`.
- It never receives the approval reference, project identity, credentials, connection material,
  destination capability, backup path, or prior receipt bodies.
- The observation returns raw fixed-domain rows, not caller-supplied evidence hashes.

### Exact observation model

The seven fixed domains are:

1. `catalog`;
2. `acl`;
3. `rpc`;
4. `policy`;
5. `extension`;
6. `migrationObject`; and
7. `writerActivity`.

Every row is a non-empty plain object with lower-case ASCII keys and scalar values only. Strings must
already be NFC and contain no control characters. Numbers must be safe integers and cannot be
negative zero. Accessors, Symbols, inherited fields, nested values, unknown top-level fields, sparse
or widened arrays, non-finite numbers, bigint, functions, and hostile proxies fail closed.

### Canonical hashes and counts

- Row keys are ordinal-sorted and serialized to canonical JSON.
- Rowsets are sorted by canonical UTF-8 bytes, so input order does not affect the result.
- A duplicate canonical row is refused instead of silently deduplicated.
- Each transcript includes schema version, policy version, and domain name.
- The catalog transcript additionally includes exact `serverVersionNum`.
- The module derives `catalogHash`, `aclHash`, `rpcHash`, `policyHash`, and `extensionHash`.
- `migrationObjectCount` and `writerActivityCount` are derived from validated count-only rowsets.
- All five derived hashes must match snapshotted source expectations before success.

### Bounds and ordering

- Array length is bounded before descriptor enumeration.
- Individual strings and canonical rows are bounded before `Buffer` allocation.
- Canonical-array bytes are accounted incrementally before retaining the whole rowset.
- Effective timeout is bounded by configuration, packet step duration, and remaining freeze window.
- Trusted start and completion times must be canonical, inside the freeze window, and monotonic.
- The packet hash is consumed before source access, so concurrent and sequential replay make no
  repeated source call.
- Only a valid prefix whose next operation is `probe_catalog_acl` can call the source.
- A valid project-attestation receipt must therefore precede this capability.

Pre-freeze writer activity is recorded but is not misrepresented as a writer freeze. The existing
`freeze_writers` rule remains responsible for proving zero active writers after freeze.

## Source manifest and integrity

The source commit changes exactly eight paths:

- `.claude/integrations/core/live-cutover-catalog-acl-probe-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-catalog-acl-probe-capability-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-catalog-acl-probe-node.ts`;
- `packages/core/test/live-cutover-catalog-acl-probe-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-catalog-acl-probe-capability-plan.test.ts`.

Source-scope audit results:

- eight paths and `243,652` bytes;
- UTF-8, no BOM, final LF, no CRLF, no replacement character, and zero trailing whitespace;
- zero Vietnamese feature-content candidates;
- six positive-controlled identity/credential detector families with zero source findings;
- canonical and `.claude` mirror SHA-256
  `d8c0e7797f08e64bf9eb27259f336850260c0504fba901b2d8fffd4c74c686ac`;
- canonical and mirror Git blob `8f4bd5931dae0e165a577943069e5ac73885d4e4`; and
- public manifest `701` unique ordinal entries at source qualification, including exactly five new
  catalog/ACL-probe entries.

## TDD and correction record

Every failed attempt below was retained as a distinct state transition in `HANDOFF.md`.

1. The first sandboxed plan run was harness-invalid because Node 24 `os.userInfo()` returned
   environment `ENOMEM` before loading the validator. The identical host command was used instead.
2. Plan-absent RED was valid: the validator failed on exactly one missing plan and every registration
   was already correct.
3. Three successive plan runs found exact lexical gaps for `single use`, `inside the freeze window`,
   and `live C5B remains incomplete`. The plan wording was corrected without changing scope.
4. Runtime missing-module RED was valid: the complete attack harness failed only because
   `live-cutover-catalog-acl-probe-node.ts` did not exist.
5. The first implementation passed all nine focused groups.
6. Strict TypeScript 5.9.3 then found two local typing defects: validated functions narrowed to
   generic `Function`, and a readonly-typed test fixture was mutated. Both were corrected without
   behavior changes.
7. Review added monotonic trusted-clock enforcement and canonical-array punctuation byte accounting.
8. Allocation review found that array descriptors were enumerated before length bounds and rowsets
   were accumulated before total-byte refusal. Validation now checks length first, accounts bytes
   incrementally, and rejects oversized strings/text before allocation; a huge sparse-array attack
   proves the order.
9. Review aligned the two count-domain maximums with the plan by requiring positive bounds and adding
   zero-value attacks.
10. One manifest audit used culture-aware PowerShell sorting and falsely reported entry-zero drift;
    `.NET StringComparer.Ordinal` proved `701` unique ordered rows.
11. Exact source audit found three Markdown hard-break spaces in the plan header; they were removed.
12. Two secret-scan wrapper attempts were harness-invalid: first from double escaping and then from
    PowerShell array-expression precedence. Isolated controls proved the cause; the corrected six-
    family positive-controlled scan produced zero findings.

No test or production guard was weakened to make a failure pass.

## Attack record

The focused runtime reports `9/9` grouped attacks:

1. configuration shape, accessors, Symbols, unsafe limits, invalid expectations, and mutation after
   factory creation;
2. invalid context, wrong operation, corrupt packet, concurrent replay, and sequential replay;
3. source exception, timeout, abort, late settlement, clock exception, and provider-text redaction;
4. exact observation shape, unknown fields, widened arrays, sparse arrays, huge sparse arrays,
   accessors, Symbols, and hostile proxies;
5. nested values, non-NFC/control strings, unsafe/non-finite numbers, negative zero, undefined,
   bigint, functions, and invalid keys;
6. row, rowset, total-byte, migration-object, writer-activity, and packet-object bounds;
7. row/key permutation stability, independent known transcript hashes, duplicate refusal, and domain
   separation;
8. server mismatch, per-domain source drift, invalid/out-of-window/backward time, exact frozen output,
   and raw metadata absence; and
9. real operator project-before-probe/probe-before-freeze ordering plus static no-I/O/query/logging
   checks.

## Qualification matrix

| Gate | Result |
|---|---|
| Catalog/ACL capability plan | PASS, `A1/R1/H1/V1/B1/S1/O1/M1/N1` |
| Catalog/ACL runtime | PASS, 9/9 grouped attacks |
| Preflight core | PASS, 9/9 |
| Operator application | PASS, 9/9 |
| Logical-backup parent | PASS, 11/11 |
| Project attestation | PASS, 9/9 |
| Executable qualification | PASS, 9/9 |
| Connection-material qualification | PASS, 8/8 |
| Strict TypeScript 5.9.3 | PASS, zero diagnostics, `skipLibCheck=false` |
| Synced-core | PASS, 4 attacks and 13 byte-identical files |
| Post-17 roadmap | PASS, 22 tasks and 4 initiatives |
| Provider bundles | PASS, 3 providers, 2 skills, 5 shared runtimes |
| Provider distribution | PASS, 71 entries, 8 sidecars, 11 checksums, 79 scans, 15 smokes, 4 attacks |
| Public readiness | PASS, 1 canonical plus 40 attacks |
| Git-index public adapter | PASS, 7/7 |
| Public release contract | PASS, 18/18 |
| Markdown links | Source PASS 210/48/48; evidence candidate 211/48/48 |
| Dependency catalog | PASS, 4 lockfiles, 754 occurrences, 617 unique |
| Secret readiness | Source PASS 698 files; evidence candidate 699 files, 10 families, zero findings |
| Dependency vulnerability audit | PASS, zero vulnerabilities |
| Full native kit | PASS, exit 0, 374.8 seconds, 2,322 output lines |

The complete run also preserved v3.25, the `163,206/176,128` prompt budget, current feature index,
and `60/60` lesson synchronization.

## Backup and rollback

The verified pre-change daily backup is:

- ZIP: `_backups/claude-workflow-kit/2026-08-20/claude-workflow-kit-2026-08-20.zip`;
- ZIP SHA-256: `f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`; and
- tag: `backup/2026-08-20` at `4230aa6b7c754bfd39427b6efc60c1a124475952`.

Before merge, rollback is an inverse commit on the feature branch or restoration from the verified
daily backup. The capability owns no external state and requires no database cleanup. A runtime
failure returns one closed reason and reaches no later operator port.

## External action boundary

This source/evidence work did not perform live SQL, application-row reads, writer freeze, provider
recovery, backup, restore, cleanup, sync, target `.Codex` edits, direct-main push, tag, release,
publication, visibility change, dashboard mutation, or database mutation.

The approved C5B operator packet remains a placeholder template until the protected channel supplies
an exact named project, server/source expectations, query capability, bounded freeze window,
recovery destination, isolated restore capability, cleanup authority, and live evidence authority.
None of those values is stored here.

## Non-claims

This evidence does not claim that a live project was matched, a live catalog was read, PostgreSQL
server version was observed, C2 still matches, writers were frozen, a recovery point or encrypted
logical backup exists, an isolated restore passed, live migration is safe, C5B is complete,
P17-016 is complete, sync is eligible, or a public release is authorized.
