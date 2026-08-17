# P17-014 A3C — Transactional Worker Journal and Crash Recovery Evidence

Date: 2026-08-17
Status: source complete and locally proven; evidence commit pending at capture time
Roadmap task: P17-014
Slice: A3C

Decision lock:

`slice=A3C, journal=J1, binding=B1, state=S1, transaction=T1, storage=F1, crash=C1, replay=R1, recovery=Q1, evidence=E1`

## Verdict

P17-014 A3C is complete locally at source commit
`f84ce1c536c3144e40ac2c51d507792538a001cd`.

The slice adds two Clean Architecture components:

- a pure signed-delivery journal domain and application boundary; and
- an explicit disposable Node filesystem adapter for append-only journal revisions.

The source commit has the exact predecessor
`f76c657f7ff1d70517cdbd8971e4677343906401`, changes ten files, and contains 2,590 insertions and
6 deletions. A normal Git commit ran the tracked `spec-integrity` hook successfully.

The immutable source passes:

- the A3C plan gate;
- 11 pure journal behavior groups;
- 9 filesystem-adapter behavior groups;
- TypeScript 5.9.3 strict with `skipLibCheck=false` and zero diagnostics;
- 28 focused and predecessor/neighbor commands;
- the complete `test:kit` suite with exit `0`; and
- exact source-SHA, clean-worktree, backup, and dashboard-preservation checks.

No worker executor, process lifecycle, network listener, database, production storage default,
remote dispatch, key store, dashboard, provider, distribution, sync, or target behavior is claimed.

## Starting state and predecessors

The accepted P17-014 topology is ADR-003 M1. A3C is the final locally derivable A3 boundary before
the privacy-gated A4 persistence and transport work.

The exact predecessor chain is:

| Boundary | Source/evidence identity |
|---|---|
| A3A detached-signing source | `2a96bd7e052b6e7753e96cc255cba20583369b3c` |
| A3A detached-signing evidence | `f56288ca19bb727d228fbaf6c4a95b315acda2c6` |
| Clean-checkout boundary evidence | `ecd4d8e04717765d0a0ed389b068c841de5b4962` |
| A3B worker-request source | `a836decd6b49da4f0977dba18932ebeea6c94303` |
| A3B worker-request evidence / A3C parent | `f76c657f7ff1d70517cdbd8971e4677343906401` |

Read-only reconciliation positively located the A2C recovery contract, A2D progress binding, A3A
signing boundary, and A3B machine/request authentication boundary. A separately controlled A3C
inventory found no worker-journal plan, source, or tests. No prior implementation was overwritten or
silently reclassified.

## Scope and ownership

### Pure journal boundary

`packages/core/src/control-plane-worker-journal.ts` owns:

- exact schema and contract versions;
- the tenant, machine, and delivery UUID journal key;
- the immutable signed A3A delivery envelope retained for restart validation;
- the four states `not_started`, `execution_started`, `receipt_available`, and `unknown`;
- monotonic compare-and-set transitions and revision checks;
- prepare-before-execute ordering;
- same-envelope idempotent redelivery and changed-envelope conflict denial;
- durable signed-receipt recording before replay or acknowledgement;
- explicit unknown/manual recovery semantics;
- A2C restart and late-receipt quarantine composition;
- a 384 KiB serialized entry cap, depth 32 cap, and 8,192-node cap; and
- stable bounded public failures that do not echo attacker-controlled values.

It owns no filesystem, environment, process, network, provider, database, dashboard, executor,
production path, or private key material.

### Disposable Node adapter

`packages/core/src/control-plane-worker-journal-node.ts` owns one infrastructure implementation of
the journal compare-and-set port:

- an explicitly injected absolute non-root directory;
- rejection of symbolic links, junctions, and other reparse-point roots;
- digest-only key directories with no raw tenant, machine, or delivery value in path names;
- append-only revision segments;
- write, flush, close, and exclusive hard-link publication ordering;
- restart selection of the latest complete committed revision;
- exact temporary-file recognition and torn-temporary ignore behavior;
- fail-closed committed-history corruption and revision mismatch handling; and
- stable storage errors that do not expose paths, keys, or payloads.

The unkeyed SHA-256 record digest is an integrity check, not authentication or malicious-local-user
tamper resistance. The adapter does not claim directory-metadata durability across sudden power
loss. It has no default directory and cannot become production persistence without an explicit A4+
composition decision.

### Dependency direction

The dependency direction is:

`A2C recovery + A3A signed envelopes/receipts -> A3C pure journal <- injected journal port`

The Node adapter points inward by implementing the pure port. The pure module does not import the
adapter. Neither module owns request authentication, lease authority, task mutation, transport, or
execution.

## Plan-before-code evidence

The standalone validator existed before the A3C plan, source, or registrations. After correcting
three launcher-only environment failures, the unchanged validator reached the repository and exited
`1` on exactly these readiness gaps:

1. `A3C transactional worker-journal plan`;
2. `focused package registration`; and
3. `full-kit registration`.

The plan then locked J1/B1/S1/T1/F1/C1/R1/Q1/E1, exact ownership, attack matrix, source manifest,
rollback, language decision, and non-claims. The unchanged validator passed before either production
module existed:

`P17-014 A3C plan: PASS (J1/B1/S1/T1/F1/C1/R1/Q1/E1 locked)`

## Behavior RED evidence

Both focused suites and their package/full-kit registrations were present before production source.

The pure suite exited `1` at the missing module:

`../src/control-plane-worker-journal`

The adapter suite was deliberately import-ordered and independently exited `1` at:

`../src/control-plane-worker-journal-node`

Neither suite reached an assertion. These are separate pre-implementation behavior boundaries.

## First implementation runs

The first unchanged pure-journal implementation run passed all 11 groups:

1. exact signed prepare and frozen `not_started` entry;
2. same-envelope idempotent redelivery and changed-envelope conflict;
3. monotonic start CAS and exact idempotency;
4. receipt durability before replay and retained acknowledgement;
5. receipt identity, envelope, key, and signature denial;
6. started-only explicit unknown/manual recovery;
7. A2C late-receipt quarantine composition;
8. concurrent redelivery and transition CAS;
9. exact shape, prototype, accessor, cycle, hidden, and symbol attacks;
10. malformed/failing port closure without value echo; and
11. pure source ownership.

The adapter reached real assertions immediately. Four fixture corrections were required before the
first complete green result:

| Fixture RED | Correction |
|---|---|
| Seed CAS returned an extra `next` property rejected by the exact pure port contract | Removed only the extra fixture property |
| Torn-file fixture used a name the adapter could never create | Changed it to the adapter's exact temporary-name grammar |
| Infrastructure fault expected an adapter error through the pure application wrapper | Invoked the adapter port directly for that infrastructure assertion |
| Empty-store enumeration fault was unreachable | Seeded one valid revision before injecting enumeration failure |

A final static detector was narrowed from generic `exec(` to actual process-execution APIs because
`RegExp.exec` is not a subprocess call.

The unchanged adapter behavior then passed all 9 groups:

1. empty-store commit and digest-only restart;
2. append-only latest-complete revision selection;
3. exclusive two-adapter CAS publication;
4. torn-temporary ignore and committed-corruption denial;
5. write/flush/close/publish/exhaustion preservation;
6. relative/root/symlink/reparse-point path denial;
7. segment bounds, committed names, and revision integrity;
8. stable non-echoing storage errors; and
9. no default path, network, database, executor, or provider coupling.

The combined focused result is 20/20 groups.

## Type-safety and adversarial review corrections

The first exact TypeScript 5.9.3 run found only test-harness diagnostics: two unknown CAS results,
two literal timestamp defaults, and five intentional hostile-object casts. Explicit test narrowing,
string annotations, and `unknown` bridges corrected those diagnostics without changing runtime rules.

Manual security/correctness review then found and closed these production gaps:

| Finding | Correction and regression |
|---|---|
| Prepare/start did not fully bind state times to the signed envelope lease | Prepare and start now enforce issued/lease time bounds and persisted-state time invariants |
| The direct Node port could execute a journal-key accessor before rejection | Key descriptors are inspected before any property read |
| Corrupt out-of-range committed revisions used a live-transition overflow code | Committed revision corruption now reports the stable corrupt-history boundary |
| Digest prose implied authentication | Documentation now claims integrity checking only |
| A validly signed changed envelope lacked a direct conflict attack | Added a real changed-envelope regression |
| Mixed sync/async error helpers could return after unexpected synchronous success | Helpers now fail explicitly when no rejection occurs |
| Oversized/deep port-supplied entries reached crypto validation before resource limits | Added bounded pre-crypto tree and UTF-8 size validation |

The resource boundary now rejects depth above 32, more than 8,192 nodes, excessive cumulative
string units, or serialized entries above 384 KiB before cryptographic work. Exact-shape, cycle,
accessor, hidden, and symbol denials remain active.

After all corrections, focused tests remain 20/20 and TypeScript 5.9.3 strict reports zero
diagnostics.

## Crash, replay, and concurrency evidence

Execution cannot be marked started until the prepared entry is durably accepted by the injected
port. A same-envelope redelivery observes the committed entry; a different signed envelope for the
same exact journal key is a conflict.

A signed receipt is validated and committed before it can be returned for replay. Acknowledgement
records time without deleting the receipt. Restart therefore preserves the signed receipt and its
binding. An `execution_started` entry never guesses whether a side effect happened: A2C decides
wait, eligible read-only retry with a new attempt, or manual recovery. An explicit `unknown` state
always remains manual.

CAS uses the expected prior revision. Concurrent writers may compute candidates, but exclusive
publication accepts at most one next revision. Failed write, flush, close, link publication, or
storage exhaustion leaves the prior committed revision readable.

## Focused and companion proof

At immutable source SHA `f84ce1c536c3144e40ac2c51d507792538a001cd`, TypeScript 5.9.3 strict
passed with zero diagnostics. A 28-command focused and companion batch then passed in 36.2 seconds.

| Proof family | Terminal result |
|---|---|
| A3C plan | PASS: J1/B1/S1/T1/F1/C1/R1/Q1/E1 |
| Pure journal | PASS: 11 groups |
| Disposable Node adapter | PASS: 9 groups |
| Post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Public-release plan | PASS: 18 sections; input complete |
| Topology and parent implementation plan | PASS: accepted topology and local A1-A3 ownership |
| A2A, A2B, A2C, A2D, A3A, and A3B plans | PASS |
| A2A registry/capability | PASS: 11 groups |
| A2B execution envelope | PASS: 12 groups |
| A2C state/lease/replay | PASS: 12 groups |
| A2D progress binding | PASS: 10 groups |
| A3A detached signing | PASS: 10 groups |
| A3B machine keys and worker request auth | PASS: 7 and 10 groups |
| P17-015 inputs and capability matrix | PASS |
| Project Intelligence | PASS |
| Workflow Orchestrator | PASS: 24 phases and 26 attacks |
| Provider bundles | PASS: three providers and shared-runtime integrity |
| Tenant attestation and privacy policy | PASS |
| Cross-platform release | PASS: 11 groups |

One parent-plan validator initially rejected a truthful status update because it still expected the
old A1-only text. The A3C source manifest was expanded by exactly that validator, and its assertion
was updated to the truthful A1-A3-local/A4-gated state. One cross-platform companion required the
real npm executable path supplied by npm in normal runs; the unchanged test then passed 11/11.

## Complete-suite proof

The first source-candidate attempt was not a product verdict. It exceeded a 600-second launcher
ceiling while output was buffered and was terminated with exit `124`. No failure assertion was
available.

The second attempt used a durable log. It advanced through A3C and predecessor gates for 676.2
seconds, then an unchanged phase-router CLI test deliberately spawned a child with only `PATH`.
The restricted sandbox could not resolve the operating-system user for `tsx`; the child stopped
before product logic. Running that exact registered test outside the restricted environment passed
all selected/needs-input, input, bounds, sanitization, sentinel, and no-I/O assertions.

With no preload and the real operating-system user path, the source candidate full suite passed:

- exit: `0`;
- elapsed: 288.6 seconds;
- captured output: 1,477 lines;
- version stamps: v3.25 aligned;
- prompt budget: 163,206 of 176,128 bytes; and
- lesson sync: 60/60.

After source commit, the authoritative immutable-SHA rerun passed:

- source SHA: `f84ce1c536c3144e40ac2c51d507792538a001cd`;
- exit: `0`;
- elapsed: 268.8 seconds;
- captured output: 1,477 lines;
- HEAD before/after: exact source SHA;
- version stamps: v3.25 aligned;
- prompt budget: 163,206 of 176,128 bytes; and
- lesson sync: 60/60.

## Static, naming, and documentation audit

The exact source audit proved:

- exactly ten authorized files;
- final LF and zero trailing whitespace in every file;
- parseable `package.json` with all three A3C commands registered in `test:kit`;
- English-only feature content, with non-ASCII limited to English dashes and one pre-existing
  package-script check mark;
- four positive-controlled credential, internal-domain, live-project, host-path, and key detectors
  with zero source hits;
- no Node/platform import in the pure journal boundary;
- no default path, network, database, executor, or provider dependency in the adapter; and
- no temporary preload after any applicable gate.

`packages/core/README.md` documents the A3C behavior, ownership split, injected composition, and
explicit non-claims. Public names use the `ControlPlaneWorkerJournal` prefix and do not mention a
provider, dashboard, database, or deployment location.

## Runtime-language decision

TypeScript remains the correct language for A3C. The pure boundary performs bounded validation,
hashing composition, and compare-and-set orchestration over existing TypeScript A2/A3 contracts.
The disposable adapter uses bounded native Node filesystem primitives.

No measured latency, throughput, memory, storage, binary-size, or capability threshold was breached.
Rust or Go would add a second build, distribution, serialization, and platform boundary before a
measured need. Python would add another runtime and packaging surface without supplying a missing
method. Reconsider Rust or Go only if later worker benchmarks miss an accepted journal latency,
durability, or resource budget; Python remains appropriate for offline analysis rather than this
transactional boundary without evidence.

## Backup and preservation proof

The verified pre-change kit backup is:

- path: `_backups/claude-workflow-kit/2026-08-17/claude-workflow-kit-2026-08-17.zip`;
- SHA-256: `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`; and
- immutable tag: `backup/2026-08-17` at
  `38888187c4191206dbb81562ccb387463fcbbc76`.

The dashboard tracked tree remained unchanged at
`1c5442a56e127ad5b35a684d47f9c40b787ee9ed`. Its user-owned local settings file was never read,
edited, staged, or deleted. No target `.Codex` directory was modified.

Logs and the warmed npm cache remain under the workspace scratch boundary and are not part of the
source manifest. Every disclosed host-temp preload was deleted immediately after its command.

## Commit evidence

Source commit:

`f84ce1c536c3144e40ac2c51d507792538a001cd`

Sole parent:

`f76c657f7ff1d70517cdbd8971e4677343906401`

Exact source manifest:

1. `docs/roadmap/p17-014-a3c-worker-journal-plan.md`
2. `docs/roadmap/p17-014-control-plane-implementation-plan.md`
3. `package.json`
4. `packages/core/README.md`
5. `packages/core/src/control-plane-worker-journal-node.ts`
6. `packages/core/src/control-plane-worker-journal.ts`
7. `packages/core/test/control-plane-worker-journal-node.test.ts`
8. `packages/core/test/control-plane-worker-journal.test.ts`
9. `scripts/post-17-control-plane-a3c-plan.test.ts`
10. `scripts/post-17-control-plane-implementation-plan.test.ts`

The normal commit path executed the tracked hook successfully:

`spec-integrity OK — 6 .ts, 0 feature(s) checked (241ms)`

This evidence file is intentionally excluded from the source commit and must be the only file in a
separate metadata commit whose sole parent is the source SHA.

## Pull request and merge recommendation

After the evidence-only commit is proven, publish one non-force branch:

`p17-014-a3c-worker-journal`

The stacked PR base is `p17-014-a3b-worker-request-auth` at exact evidence head
`f76c657f7ff1d70517cdbd8971e4677343906401`. The PR must therefore contain exactly two A3C commits:
one ten-file source commit and one evidence-only commit.

Merge recommendation: approve A3C only after its local and remote Linux/Windows checks are green
and after PR #3 plus every earlier stacked predecessor is accepted in dependency order. Do not merge
A3C directly into remote main while its base branch is unaccepted. Do not force-push or auto-merge.

No push or PR mutation occurred while writing this evidence.

## Rollback

Before publication, rollback is the exact evidence/source commit pair or the verified daily backup.
After publication, revert the A3C evidence commit and source commit in reverse order without
resetting or overwriting unrelated work.

A3C creates no configured production directory, database row, remote request, process, credential,
or target state. Its disposable test directories are removed by their fixtures. Rollback therefore
requires no migration, credential revocation, deployment, dashboard repair, or target repair.

## Non-claims

This evidence does not prove or enable:

- a worker polling loop or executor;
- process launch or termination;
- HTTP, RPC, or queue transport;
- database-backed CAS or multi-host coordination;
- malicious-local-user tamper resistance;
- directory-metadata power-loss durability;
- exactly-once transport or exactly-once external side effects;
- automatic retry of an unknown side effect;
- secret-key storage or enrollment;
- production persistence configuration;
- dashboard UI or routing;
- provider integration or distribution packaging;
- remote execution or deployment;
- P17-014 completion beyond the accepted local A1-A3 boundary; or
- merge readiness before the predecessor stack is accepted.

No sync, target edit, direct-main push, force push, merge, tag creation, release, database mutation,
dashboard source change, or target `.Codex` modification was performed by A3C.
