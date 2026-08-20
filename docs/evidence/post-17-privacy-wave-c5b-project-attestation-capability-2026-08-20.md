# P17-016 Wave C5B Project-Attestation Capability Evidence

Date: 2026-08-20
Status: local source slice qualified; live C5B remains incomplete
Plan: `docs/roadmap/p17-016-wave-c5b-project-attestation-capability-plan.md`

## Outcome

The local C5B application boundary now has a provider-neutral project-attestation capability instead
of relying only on a caller-authored `projectMatch` boolean. The capability accepts distinct
ephemeral approval and observation sources, snapshots their validated dependencies, resolves both
under one bounded abort signal, compares transferred byte identities with a timing-safe operation,
zeroizes transferred bytes, binds each packet hash to one attempt, and emits exact metadata only.

The shared preflight receipt now requires `attestedAt`. Core prefix evaluation proves that timestamp
is inside the packet freeze window and the outer attestation operation interval before catalog access
can continue.

This evidence proves local contract and implementation behavior only. No named project, provider,
network, database, credential, catalog, writer, recovery point, backup, restore, cleanup, migration,
sync, release, publication, or visibility operation occurred.

## Qualified source identity

| Identity | Exact value |
|---|---|
| Branch | `p17-016-c5b-project-attestation-capability` |
| Source commit | `8c3a6c7e30c108175b7e3bd23c49efcc50ed8d2f` |
| Source parent | `d3eb777a6916504b8c6b134ab50cb62c079e4f60` |
| Source tree | `7e71369e06b66d0fb0c1bd4f78a2573779521129` |
| Project capability SHA-256 | `4abd2efb3b8f53e215612c34b79d7e8188bd804970d82fc439b714f3e8dae70a` |
| Preflight core SHA-256 | `e1ce53bec938ebc3eef601bd7e2347903548857e553b975b8dd5d0bc26ebce94` |
| Package version | `3.25.0` |

The canonical project capability and its generated core mirror are byte-identical. The canonical
preflight core and its generated mirror are also byte-identical. The source commit contains exactly
the 14 paths locked by the plan and was created by a normal commit with repository hooks enabled.

## Rollback authority

The verified daily backup predates this slice:

- archive: `_backups/claude-workflow-kit/2026-08-20/claude-workflow-kit-2026-08-20.zip`;
- archive SHA-256: `f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`;
- backup tag: `backup/2026-08-20`;
- backup tag target: `4230aa6b7c754bfd39427b6efc60c1a124475952`.

The immediate source rollback point is the source parent. No external rollback is required because
the slice performed no external action.

## Locked decisions

The plan validator proved these exact decisions:

- `boundary=A1`: approval and observation sources are separate trust boundaries;
- `identity=E1`: source byte views transfer ownership and are zeroized without durable digesting;
- `timeout=B1`: one deadline and one abort signal bound the complete resolution sequence;
- `match=I1`: exact bytes and exact closed environment class must match;
- `replay=R1`: the validated packet hash is single-use per factory instance;
- `receipt=T1`: `attestedAt` is required and interval-bound;
- `integration=O1`: the real operator stops before unauthorized later ports;
- `result=M1`: success and refusal remain frozen metadata-only shapes; and
- `runtime=N1`: TypeScript and Node remain justified without a measured native-runtime gap.

## Negative controls and corrections

### Plan-absent RED

The registered validator exited `1` with exactly one readiness gap:

`C5B project-attestation capability plan`

All registration, parent, full-kit, synced-core, and privacy preconditions were valid. The plan then
passed all nine locked decisions. Three sequential plan attempts exposed only literal wording gaps;
a deterministic phrase audit found the final two missing literals before the plan passed. No runtime
work was claimed from those failures.

### Module-absent RED

The runtime attack file loaded until the exact absent import and exited with
`MODULE_NOT_FOUND` for `live-cutover-project-attestation-node`. That proves the attack harness reached
the intended implementation boundary before the module existed.

### Test-only expectation correction

The first runtime implementation passed eight of nine groups. One test treated an unsupported
environment string as a supported-but-wrong environment. The implementation correctly classified
the unsupported value as malformed provider output. The test expectation was corrected to the
closed provider refusal; a separate supported wrong-class attack continues to prove
`project_mismatch`.

### Strict compiler correction

Strict TypeScript initially reported two TS2367 diagnostics for intentional identity comparisons
between structurally disjoint source interfaces. Replacing direct equality with `Object.is` preserved
the runtime identity checks and produced zero diagnostics.

### Review hardening

Direct review found two trust-boundary risks before broader qualification:

1. the factory validated configuration and sources but still closed over mutable caller objects;
2. an accessor result could return a different identity byte view on repeated reads.

The final implementation snapshots validated scalar/function dependencies, requires exact own
enumerable data-properties, rejects accessor, Symbol, hidden, extra, and hostile proxy inputs, reads
each transferred identity through its data descriptor, and returns only sanitized configuration
errors. Mutation and accessor attacks prove those corrections.

### Harness-only failures

Two harness failures produced no product verdict:

- sandboxed Node/npm and the first normal commit hook hit the known `uv_os_get_passwd ENOMEM`
  launcher failure; unchanged external-runtime runs passed and hooks were never bypassed;
- the first manifest audit queried a nonexistent `files` property instead of canonical `entries` and
  was rerun in full with the correct property.

A source audit also found Markdown header hard-break whitespace. Those spaces were removed before
the exact source candidate was staged.

## Runtime behavior evidence

### Trust separation

- factory configuration has an exact three-field shape;
- the source container and both nested source objects have exact own data-properties;
- the approval and observation objects must differ;
- their resolver functions must differ;
- approved identity is not passed to the observation request;
- observed identity is not passed to the approval request;
- mutation after port creation cannot redirect the snapshotted clock or resolver functions; and
- hostile proxy errors collapse to one sanitized configuration message.

### Ephemeral identity custody

- success, byte mismatch, class mismatch, invalid time, source exception, and timeout all zeroize
  transferred byte views;
- empty, oversized, non-byte, accessor-backed, shared-buffer, widened, and malformed results fail
  closed;
- identity bytes, project identity text, and identity digests are absent from decisions and operator
  results; and
- the capability source contains no filesystem, process, environment, network, provider, logging,
  or general hashing surface.

The test uses synthetic sentinel bytes only. No live project identity enters source or evidence.

### Deadline and replay

- one effective timeout is the lower of factory timeout and packet `maxStepDurationMs`;
- one `AbortSignal` is shared with both sequential sources;
- source exception text never crosses the decision boundary;
- abort is observed by a blocking source;
- concurrent and sequential replay make zero repeated source calls;
- invalid, corrupted, widened, or already-advanced contexts make zero source calls; and
- retry requires a new attempt and packet hash.

### Core and operator integration

- project evidence requires exactly `projectMatch`, `environmentClass`, and `attestedAt`;
- missing, malformed, extra, or forged attestation time fails closed;
- attestation time must be inside both packet freeze and operation receipt intervals;
- real-operator mismatch makes zero later-port calls;
- real-operator success reaches exactly the next catalog port, whose synthetic refusal stops the
  sequence; and
- existing preflight, operator, logical-backup, executable, and connection-material behavior remains
  GREEN.

## Test and qualification record

| Gate | Result |
|---|---|
| Project-attestation plan | PASS, `A1/E1/B1/I1/R1/T1/O1/M1/N1` |
| Project-attestation runtime | PASS, 9/9 grouped attacks |
| Preflight core | PASS, 9/9 |
| Operator application | PASS, 9/9 |
| Logical-backup parent | PASS, 11/11 |
| Executable qualification | PASS, 9/9 |
| Connection-material qualification | PASS, 8/8 |
| Strict TypeScript 5.9.3 | PASS, zero diagnostics |
| Synced-core attacks/check | PASS, 4 attacks and 12 byte-identical mirrors |
| Post-17 roadmap | PASS, 22 tasks and 4 initiatives |
| Provider bundles | PASS, 3 providers, 2 skills, 5 shared runtimes |
| Provider distribution | PASS, 71 entries, 8 sidecars, 11 checksums, 79 scans, 15 smokes, 4 attacks |
| Public readiness | PASS, 1 canonical plus 40 attacks |
| Public release contract | PASS, 18/18 |
| Public release Node adapter | PASS, 7/7 |
| Public Markdown links | PASS, 208 files, 48 relative, 48 valid |
| Dependency catalog | PASS, 4 lockfiles, 754 occurrences, 617 unique |
| Secret scan | PASS, 692 text files, 10 detector families, zero findings |
| Full native kit | PASS, exit 0, 374.6 seconds, 2,299 output lines |
| Prompt/version/lessons | PASS, v3.25, 163,206 bytes within budget, 60/60 lessons |

## Exact source manifest

The qualified source commit contains only:

1. `.claude/integrations/core/live-cutover-preflight.ts`;
2. `.claude/integrations/core/live-cutover-project-attestation-node.ts`;
3. `docs/roadmap/p17-016-wave-c5b-project-attestation-capability-plan.md`;
4. `docs/schemas/p17-016-c5b-preflight-snapshot.schema.json`;
5. `package.json`;
6. `packages/core/src/live-cutover-preflight.ts`;
7. `packages/core/src/live-cutover-project-attestation-node.ts`;
8. `packages/core/test/live-cutover-logical-backup-node.test.ts`;
9. `packages/core/test/live-cutover-preflight-operator.test.ts`;
10. `packages/core/test/live-cutover-preflight.test.ts`;
11. `packages/core/test/live-cutover-project-attestation-node.test.ts`;
12. `release/public-release-manifest.json`;
13. `scripts/build-synced-core.ts`; and
14. `scripts/post-17-privacy-wave-c5b-project-attestation-capability-plan.test.ts`.

The source candidate had 695 manifest paths, 208 Markdown files, 692 text files, three
digest-reviewed JPEGs, 48/48 valid internal links, 617 unique dependencies, and zero findings across
ten secret detector families.

## Privacy review

The plan, implementation, tests, generated mirror, schema, manifest, and this evidence contain no
live project identity, URL, host, connection value, provider token, credential, key, database row,
backup byte, path to protected material, machine identifier, or raw provider response. Privacy
detectors were positive-controlled before zero findings were accepted.

The success receipt intentionally excludes identity hashes. A digest of a low-entropy project name
would remain guessable and is not required for operation sequencing or evidence integrity.

## Remaining external gates

Local success does not clear the external C5B input boundary. A live attempt still requires:

- one concrete named project and protected approval authority;
- an independently bound provider/database observation source;
- fresh catalog, ACL, server-version, and writer-activity evidence;
- a bounded writer-freeze window;
- provider recovery authority;
- protected destination and encryption custody;
- an executable-qualified encrypted logical backup;
- isolated restore, parity verification, cleanup, and unfreeze authority; and
- a metadata-only evidence sink.

The user-supplied placeholder packet is not a live credential or live project identity and was not
treated as one.

## Non-claims

Live C5B remains incomplete. This evidence does not claim a named project was matched, an external
approval source was protected, an observation source was provider-bound, a database was contacted,
catalog or ACL state was read, writers were frozen, a recovery point was created, a logical backup
was created, an isolated restore occurred, cleanup ran, P17-016 completed, or P17-014 A4 became
unblocked.

No sync, target `.Codex` edit, direct-main push, tag, release, publication, package publication,
marketplace action, or repository visibility change occurred.
