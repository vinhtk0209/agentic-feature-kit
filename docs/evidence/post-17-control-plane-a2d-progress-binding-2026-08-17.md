# P17-014 A2D Progress Binding, Receipt, and Linear-Retry Evidence

**Date:** 2026-08-17

## Verdict

P17-014 A2D is complete locally at source commit
`38888187c4191206dbb81562ccb387463fcbbc76`.

The slice closes the cumulative A2 pure-contract layer by composing the A2B execution envelope and
A2C state/receipt/recovery decisions with the real P17-015 cross-machine progress validator through
an injected type-only port. It adds content-addressed repository-mapping, active binding/projection,
terminal receipt, and single-successor retry proofs without importing the Node-backed progress
runtime into emitted Control Plane code.

This verdict is limited to A2D. P17-014 remains `in_progress`; A3 and all persistence, application,
worker, remote-E2E, and Control Panel slices remain open.

## Immutable source checkpoint

- Source SHA: `38888187c4191206dbb81562ccb387463fcbbc76`
- Sole parent: `c09f2de3b2574716780c28adf693f89e5ef0a277`
- Diff: 1,810 insertions and 2 deletions
- Final normal commit hook: PASS (`spec-integrity`, one staged TypeScript test amendment)
- Initial source-candidate hook: PASS (`spec-integrity`, three TypeScript files)
- Worktree after final source commit: clean

Exact seven-file source manifest:

1. `docs/roadmap/p17-014-a2d-progress-binding-plan.md` — added, 313 lines
2. `docs/roadmap/p17-014-control-plane-implementation-plan.md` — one ownership row
3. `package.json` — plan/focused/full-kit registrations only
4. `packages/core/README.md` — public A2D boundary and non-claims
5. `packages/core/src/control-plane-progress.ts` — added, 760 lines
6. `packages/core/test/control-plane-progress.test.ts` — added, 568 lines
7. `scripts/post-17-control-plane-a2d-plan.test.ts` — added, 149 lines

The earlier local candidate `009d57d1f6643df7b4be923648182e4bd13bf428` was amended after the
pre-evidence coverage audit. It is superseded and is not the evidence identity.

## Locked input and ownership

The executable plan locks:

`slice=A2D, progress=P1, repository=R1, binding=B1, projection=S1, receipt=C1, retry=L1, hashing=H1, sequence=Q1, evidence=E1`.

Ownership remains separated:

- A2A owns exact operations, inputs, budgets, capabilities, and worker manifests.
- A2B owns the unsigned canonical execution envelope and immutable execution identity.
- A2C owns state, expected-version CAS, lease, heartbeat, cancellation, receipt acceptance,
  quarantine decisions, and conservative recovery.
- P17-015 remains the authority for progress binding/event/evidence hashes, transitions, event
  chains, current-attempt resolution, and linear retry validation.
- A2D owns only the pure composition proofs and the explicit repository UUID-to-slug mapping.
- A3 owns signing, key identity, nonce/time-window authority, and durable journal behavior.
- A4–A7 own persistence, application/API composition, worker execution, and network-separated E2E.

## Implemented contracts

### Pure progress port

`ControlPlaneProgressLedgerPort` accepts an opaque ledger and expected task ID, then returns an
unknown task view. A2D catches all port failures without echoing provider content and validates a
plain, exact, bounded view before trusting its fields.

The production module has only a type import from P17-015. Focused tests wire the port to the real
`buildProgressTaskView`, so binding hashes, event hashes, evidence rules, transition legality, clock
classification, and retry lineage are exercised by their actual owner.

### Repository mapping

The mapping binds one lowercase tenant UUID and canonical repository UUID to one configured P17-015
repository slug. Its fixed-key canonical JSON is hashed through `ControlPlaneHashPort`. Dot segments,
paths, URLs, extra fields, malformed IDs, hash drift, and unsafe hash ports fail closed.

### Binding and state projection

The active binding proof matches task/run/root/parent/attempt, machine, progress binding hash,
repository mapping, retention, creation time, current attempt, current event tail, runner, nullable
provider execution ID, ledger hash, and A2C/P17 state projection.

Ordinary proofs are limited to queued/running/waiting/runtime-approval active states. Definition,
terminal, and recovery-required states cannot use the ordinary proof path. Terminal claims require a
receipt proof.

### Receipt proof

The receipt proof validates the canonical A2C receipt and accepted receipt hash against the same A2B
envelope and current P17 tail. It binds exactly zero or one terminal evidence hash:

- passed -> P17 passed, A2C passed, and one verified evidence reference;
- failed -> P17 failed and A2C failed;
- cancelled -> P17 cancelled and A2C cancelled; and
- unknown outcome -> P17 tracking-failed and A2C recovery-required.

No evidence body, result body, log, path, provider response, environment value, or credential is
copied into the proof.

### Linear retry proof

Retry creation first calls the real A2C recovery decision and requires `retry_new_attempt`. The
current P17 parent must be terminal and non-passed. The proposed ledger must preserve every prior
binding/event hash and tail, then add exactly one next attempt with a queued `retry_started` event.

The successor keeps tenant/task/root/repository/retention/operation, names the exact prior run as its
parent, and uses new command-run, delivery, lease, envelope, and progress-binding identities. The
proof creates no binding, event, envelope, row, or dispatch.

## Plan-first and behavior RED evidence

The standalone readiness validator was created before the plan or registrations. Its first run
exited `1` with exactly three gaps:

1. A2D progress-binding plan;
2. focused package registration; and
3. full-kit registration.

The plan gate then exposed and corrected four exact-language requirements without weakening their
meaning: `commandRunId`, `retentionClass`, the entire prior ledger prefix invariant, and explicit A3
signature/key/journal ownership.

After the plan passed, the registered focused behavior suite was added while the source module was
absent. It exited `1` with:

`Cannot find module '../src/control-plane-progress'`.

No behavior assertion ran before that missing-module RED. The unchanged first implementation run
then passed all ten grouped tests.

## Code-review and coverage hardening

Manual security/correctness review closed these production gaps with regressions:

1. ordinary binding proofs cannot bypass terminal receipt proof requirements;
2. standalone proof validators use closed active-state and receipt-outcome vocabularies;
3. proof command/root/parent/successor IDs are canonical lowercase UUIDs;
4. runner and provider execution identifiers use bounded safe vocabularies;
5. receipt outcome/state/evidence cardinality must remain internally consistent;
6. retry successors cannot reuse command, delivery, lease, envelope, progress-binding, or ledger
   identities;
7. malformed port views reject deep prototypes, accessors, cycles, extra, hidden, or symbol keys;
8. nested binding/event/evidence fields, bounds, identities, chains, reasons, timestamps, and lineage
   are checked before use; and
9. repository dot segments and constant/invalid/throwing hash ports fail closed.

Before evidence writing, the plan's attack matrix was compared line by line with the focused suite.
Although the implementation and aggregate companions were green, direct A2D invocations were
missing for several already-enforced paths. Source evidence was reopened, and the focused suite was
expanded to directly exercise:

- forged task/tenant/repository identity and unsafe path/URL mapping;
- binding hash, machine, run, retention, creation-time, current-attempt, tail, and projection drift;
- leased, definition, active, terminal, cancellation, and recovery projection boundaries;
- receipt tail, evidence, unverified-pass, outcome, accepted-hash, and proof-hash drift;
- retry recovery authority, non-terminal/passed parents, prior-prefix mutation, sibling branch,
  ordinal gap, root/parent change, reused IDs, successor state/reason drift, and binding mismatch; and
- proof permutation/deep-freeze, raw-field smuggling, port-shape, and non-echoing hash failures.

The source commit was amended only after focused, strict, companion, manifest, and full-kit gates
passed again. The final review found no remaining correctness, security, coverage, or scope issue in
the seven-file slice.

## Harness correction trail

The source verdict excludes several documented environment/harness failures:

- ambient Node/tsx aborted before tests with `uv_os_get_passwd ENOMEM`;
- a temporary `os.userInfo` preload fixed tsx startup, but a relative preload failed when an existing
  B2B test intentionally changed its child working directory;
- the absolute no-space OS-temp preload resolved that boundary;
- the disposable-copy B2B case then required npm cache/registry access for its hardcoded `npx tsx`,
  which the default sandbox denied with `EACCES`; the unchanged suite passed with explicit
  network/cache permission;
- the first commit hook attempts lacked Git POSIX utilities in hook PATH; the same normal hook passed
  when invoked through the installed Git Bash environment; and
- three static-audit commands were corrected for PowerShell quote parsing, a single-quoted tab
  expression that matched literal backticks/`t`, and Unicode transport that degraded a broad
  Vietnamese range. Numeric code-point and synthetic positive controls replaced the faulty probes.

Every temporary preload file was removed after use. No source rule or test expectation was weakened
to accommodate these host failures.

## Final exact-SHA proof

All final commands asserted source SHA
`38888187c4191206dbb81562ccb387463fcbbc76` before and after execution.

- TypeScript 5.9.3, `strict`, `skipLibCheck=false`: PASS, zero diagnostics
- A2D plan validator: PASS (`P1/R1/B1/S1/C1/L1/H1/Q1/E1`)
- A2D focused suite: PASS, 10 grouped contract/attack areas
- A2A registry/capability plan and domain: PASS, 11 groups
- A2B envelope plan and domain: PASS, 12 groups
- A2C state/lease/replay plan and domain: PASS, 12 groups
- P17-015 cross-machine progress: PASS, 6 assertions and 22 attacks
- Accepted Control Plane topology: PASS, 22 sections
- P17-014 parent implementation plan: PASS
- Post-17 roadmap: PASS, 22 tasks and 4 initiatives
- P17-016 C5A live-cutover plan: PASS
- Project Intelligence: PASS, 5 fixtures and 11 negative controls
- Workflow Orchestrator: PASS, 24 phase boundaries and 26 attacks
- Provider bundles: PASS, 3 providers, 2 byte-identical skills, and 5 shared runtimes
- Exact fast aggregate: PASS, 16 registered commands in 31.9 seconds

## Authoritative full-suite proof

Expanded source-candidate full kit before final amend:

- exit: `0`
- elapsed: 242.4 seconds
- captured output: 1,733 lines

Final exact-SHA full kit:

- exit: `0`
- elapsed: 283.0 seconds
- captured output: 1,733 lines
- HEAD before/after: `38888187c4191206dbb81562ccb387463fcbbc76`
- version stamps: v3.25
- prompt budget: 163,206 / 176,128 bytes
- lesson synchronization: 60 / 60

The known lesson-registry normalization warnings remained warnings; the synchronization gate passed.

## Static, backup, and workspace preservation proof

- Exact source manifest: PASS, seven files
- Final commit manifest: PASS, seven files
- Package JSON parse and plan/focused/full-kit registration: PASS
- Tracked and untracked whitespace/final-newline checks: PASS
- English-only feature content: PASS through numeric code-point scanning
- Credential-shaped assignment scan: PASS after a synthetic positive control
- Internal absolute-path scan: PASS after a synthetic positive control
- Pure-source runtime/platform-coupling scan: PASS after synthetic positive controls
- Dashboard tracked tree: unchanged
- The dashboard's user-owned untracked settings file was not read, modified, staged, or deleted

Date-rollover backups were created and opened successfully before evidence editing:

- kit ZIP: 20,610,153 bytes, 549 files, SHA-256
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`;
  `backup/2026-08-17` points to the final source commit;
- dashboard ZIP: 6,018,083 bytes, 546 files, SHA-256
  `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`;
  its backup tag points to the unchanged dashboard HEAD; and
- both ZIPs contain zero `.git`, `.codegraph`, `node_modules`, `.next`, or `dist` path segments.

The seven-day retention helper pruned only the two dated 2026-08-09 backup directories.

## Non-claims

- No runtime implementation, runtime adapter, or remote executor is claimed by A2D.
- This evidence does not claim A3 signing, key management, nonce handling, current-clock authority,
  or durable journal behavior.
- It does not claim tenant row ownership, persistence, transaction, outbox, migration, authorization,
  API, worker process, provider execution, dashboard production behavior, or remote E2E.
- No Supabase/database write, migration, browser action, provider call, deployment, sync, push, merge,
  target edit, or target `.Codex` action occurred.
- Network/cache permission was used only for npm package resolution inside an existing disposable-copy
  test harness; A2D production code performed no network or external-service operation.
- P17-014 remains `in_progress`; A3 is the next ordered implementation slice.
