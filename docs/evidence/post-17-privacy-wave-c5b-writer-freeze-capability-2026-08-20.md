# P17-016 Wave C5B writer-freeze capability evidence

**Date:** 2026-08-20
**Status:** Source-qualified; exact-head remote qualification pending
**Roadmap task:** P17-016
**Decision lock:** `A1/L1/P1/B1/C1/U1/O1/M1/N1`
**Source commit:** `3044de25546d4e2b165e58ed949bc53a5a3f6b06`
**Source parent:** `2a75ae8612c107377a30bc706ed22f7548479f81`
**Source tree:** `5a063399d8a2d07c59490ba32093a5c792e911cc`

## Outcome

The third canonical C5B operation now has one provider-neutral Node capability that owns both
`freezeWriters` and `unfreezeWriters`. It accepts separately implemented control and observation
sources, acquires one bounded opaque automatically expiring lease, and passes only after independent
observation reports that the exact lease is active with zero active writers.

The same factory binds release to the exact packet, attempt, receipt prefix, and owned lease. A
post-acquire refusal attempts one bounded release and one independent inactive-state observation.
Explicit unfreeze returns true only when both control release and inactive observation are exact.

This is local infrastructure qualification. No provider adapter, database command, project writer
freeze, writer release, recovery point, backup, restore, cutover, or publication occurred.

## Qualified source boundary

The source commit changes exactly eight paths:

- `.claude/integrations/core/live-cutover-writer-freeze-node.ts`;
- `docs/roadmap/p17-016-wave-c5b-writer-freeze-capability-plan.md`;
- `package.json`;
- `packages/core/src/live-cutover-writer-freeze-node.ts`;
- `packages/core/test/live-cutover-writer-freeze-node.test.ts`;
- `release/public-release-manifest.json`;
- `scripts/build-synced-core.ts`; and
- `scripts/post-17-privacy-wave-c5b-writer-freeze-capability-plan.test.ts`.

The canonical module and generated mirror are byte-identical with SHA-256
`4275fd4375513c17a2f4a994ef7211e3b0e06c7a4e31b19507df05b0e2e15fd6`. The manifest has `707`
unique sorted entries and exactly five new source admissions. Existing package and builder rows were
reused rather than duplicated.

## Runtime contract

### Admission and replay

- The context must be an exact validated C5B packet and receipt prefix whose next operation is
  `freeze_writers`.
- The packet hash is consumed before the first source call.
- Concurrent replay, sequential replay, and an overlapping active packet perform no second acquire.
- Any uncertain acquire or release state quarantines that factory and requires a fresh composition.

### Lease ownership

- Acquire returns only a bounded non-empty `Uint8Array` plus the exact packet expiry.
- Shared buffers, oversized or empty tokens, malformed shapes, and expiry drift are refused.
- Source-owned token bytes are copied into capability ownership and immediately zeroized.
- Every request token copy is zeroized after its source call.
- A successful session arms an unref'ed timer from trusted start to exact packet expiry; automatic
  expiry zeroizes the owned token and clears the local session.
- Explicit release, compensation, and every terminal refusal clear the timer and token material.

### Trust separation and bounded calls

- Control and observation source objects and callable identities cannot alias.
- Acquire, observe, release, and release-observe receive bounded `AbortSignal` instances.
- The deadline is the minimum of configured timeout, packet step maximum, and remaining freeze time.
- A source result settling after abort cannot create a session or trigger a later observation.
- The parent packet limits the entire freeze window to 24 hours, below the Node timer ceiling.

### Closed results

- Freeze success emits only `freezeConfirmed=true` and `activeWriterCount=0`.
- Freeze refusal emits only an existing closed C5B reason code.
- Unfreeze emits only `{ unfreezeConfirmed: boolean }`.
- Provider text, token bytes, expiry, project identity, URL, host, path, SQL, query, writer identity,
  and application values never cross the shared result boundary.

## RED and review chronology

1. The registered plan validator first failed only because the decision plan did not exist.
2. The first plan draft had one lexical gap, the exact attack label `raw lease leakage`; the design
   already prohibited serialization and was clarified without widening runtime scope.
3. The first missing-module attempt was harness-invalid because CommonJS rejected top-level awaits.
   Wrapping grouped attacks in `main()` reached the intended absent-module RED.
4. The corrected runtime suite then failed on the absent canonical module/export.
5. The first implementation passed all nine groups.
6. Manual review found that malformed acquire or unconfirmed release could leave an external lease
   active while allowing a new packet. Factory quarantine and no-second-acquire attacks closed it.
7. Strict TypeScript found callback-flow and deliberate readonly-fixture diagnostics. Typed mutable
   holders and a test-only writable shape fixed them without casts in production or weaker checks.
8. Review found that a settled release exception or malformed response skipped independent
   observation. Release now still observes inactive state while requiring both confirmations.
9. Final lifetime review found that successful-session token material persisted until explicit
   unfreeze. The exact-expiry unref'ed timer and post-expiry success guard narrowed that lifetime.
10. One requested 5.9.3 command resolved the repository-local 4.9.5 compiler and failed while parsing
    newer Node declarations. The cached exact 5.9.3 executable then produced zero diagnostics.

No test assertion, timeout, privacy detector, strictness flag, provider boundary, or parent schema
was weakened to obtain GREEN.

## Focused attack matrix

The focused suite passes nine grouped attacks:

1. closed configuration, accessors, Symbols, proxies, mutation snapshots, and source aliasing;
2. invalid context/order, replay, concurrency, overlap, and zero I/O before admission;
3. acquire exception, malformed result, timeout, abort, actual late settlement, and text redaction;
4. malformed/inactive observations, active writers, expiry mismatch, unsafe counts, and hostile data;
5. empty, oversized, shared, malformed, and expiry-drift tokens plus copy and zeroization proofs;
6. invalid, outside-window, rollback, and completion clocks;
7. post-acquire compensation, observation timeout, release failure, and independent inactive proof;
8. exact unfreeze, wrong packet, missing receipt, malformed/failed release, active observation,
   automatic expiry, factory quarantine, and double-unfreeze; and
9. real operator ordering through provider recovery refusal plus static no-I/O/query/logging checks.

## Qualification matrix

| Gate | Result |
|---|---|
| Writer-freeze plan | PASS, nine decision locks |
| Writer-freeze runtime | PASS, `9/9` grouped attacks |
| Preflight core | PASS, `9/9` |
| Operator application | PASS, `9/9` |
| Project attestation | PASS, `9/9` |
| Catalog/ACL probe | PASS, `9/9` |
| Logical-backup chain | PASS, executable `9/9`, connection `8`, adapter `11` groups |
| Strict TypeScript 5.9.3 | PASS, zero diagnostics, `skipLibCheck=false` |
| Synced core | PASS, four generator attacks and `14` byte-identical files |
| Post-17 roadmap | PASS, `22` tasks and `4` initiatives |
| Provider bundles | PASS, `3` providers, `2` skills, `5` shared runtimes |
| Provider distribution | PASS, `71/8/11/79/15/4` qualification counts |
| R6 plan | PASS, six locks |
| Public readiness | PASS, one canonical plus `40` attacks |
| Git-index public adapter | PASS, `7/7` |
| Public release contract | PASS, `18/18` |
| Markdown links | PASS, `212/48/48` |
| Dependency catalog | PASS, `4` lockfiles, `754` occurrences, `617` unique |
| Secret readiness | PASS, `704` staged text files, ten families, zero findings |
| Full native kit | PASS, exit `0`, `381.3s`, `2,341` output lines |

The full run preserved v3.25, prompt budget `163,206/176,128`, the current feature index, and
`60/60` lesson synchronization.

## Calendar-expiry prerequisite

The first combined full suite reached an unchanged CLI test after all preceding writer and privacy
gates, then correctly returned `needs_input`: its fixture evidence expired at a fixed timestamp on
the qualification date. Read-only child instrumentation proved the closed reasons were
`documentation_expired`, `runtime_entitlement_expired`, and `availability_unknown`.

A separate one-file test-only branch changed all four evidence classes to one bounded window around
test start. Focused router/CLI, strict TypeScript, and a complete native suite passed. Draft PR #30
then passed fresh Linux, Windows, and aggregate CI with two artifacts and was standard-merged as
`2a75ae8612c107377a30bc706ed22f7548479f81`. Its exact tree is
`2148992c2ecc08d755d0b300e3742ed0adb791d4`, and its retained branch remains available.

The writer source was saved in an exact named stash, fast-forwarded to that prerequisite merge, and
replayed with all eight blob IDs unchanged. The named stash was dropped only after the exact writer
source commit existed. No hard reset or dependency junction was used.

## Encoding, privacy, and source audit

All eight source paths passed strict UTF-8, no BOM, final LF, no CR, no replacement character, and no
trailing whitespace. Feature content is English. Six positive-controlled credential families and
three positive-controlled runtime I/O/logging detectors found zero candidates. Cached diff-check and
the exact eight-path index both passed before commit.

The implementation imports no filesystem, process, network, provider SDK, database, browser, or
logging surface. It uses only validation, injected ports, abort control, timers, and in-memory token
ownership.

## Backup and rollback

The verified daily rollback boundary predates all source edits:

- ZIP SHA-256 `f4bdc06c3f55919cfa590d90809680885f8898d29099fb7108c4a6d1e06e837a`;
- Git tag `backup/2026-08-20` at `4230aa6b7c754bfd39427b6efc60c1a124475952`; and
- exact writer source commit/tree listed above.

The isolated prerequisite worktree used independent real dependency directories for all four
lockfile owners. It never used a Windows junction into the primary repository.

## External effects and non-claims

External effects before this evidence commit are limited to the retained prerequisite branch, Draft
PR #30, its CI/artifacts, and its standard merge. The writer-freeze source itself has not yet been
pushed or opened as a PR at the time of this evidence snapshot.

No direct-main push, branch deletion, database/provider mutation, dashboard mutation, target edit,
target `.Codex` edit, sync, tag, release, package publication, marketplace publication, or visibility
change occurred.

This evidence does not claim that a live project was attested, a live catalog was probed, writers
were frozen or released, a provider recovery point exists, a backup or isolated restore exists, C5B
is complete, or P17-016 is complete. Provider recovery remains the next unmet C5B operation after
this capability is merged.

## Remote qualification still required

The evidence commit must add only this document and its sorted manifest row. Its exact head must then
be pushed non-force to the retained writer-freeze branch, opened as a Draft PR into current `main`,
and pass fresh Linux, Windows, aggregate, artifact, exact-head, Ready, standard-merge, merge-parent,
merge-tree, and retained-branch verification before this capability is remotely complete.
