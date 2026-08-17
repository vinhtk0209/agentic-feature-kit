# P17-014 A2C State, Lease, Cancellation, Receipt, and Recovery Evidence

**Date:** 2026-08-16

## Verdict

P17-014 A2C is complete locally at source commit
`3b5ed4369e0c512802c2489f53d182caee52bbdf`.

The slice adds a pure, provider-neutral task-state and replay domain around the immutable A2B
execution envelope. It proves closed definition/attempt transitions, expected-version CAS, one
active lease, bounded heartbeat renewal, cooperative cancellation, metadata-only receipt hashing,
idempotent replay, quarantine, and conservative recovery decisions.

This verdict is limited to A2C. P17-014 remains `in_progress`.

## Immutable source checkpoint

- Source SHA: `3b5ed4369e0c512802c2489f53d182caee52bbdf`
- Sole parent: `cbdab90ee063a6d8abceb2102cf2106accf75f54`
- Diff: 1,911 insertions and 3 deletions
- Normal commit hook: PASS (`spec-integrity`, three TypeScript files)
- Worktree after commit: clean

Exact seven-file source manifest:

1. `docs/roadmap/p17-014-a2c-state-lease-replay-plan.md` — added, 330 lines
2. `docs/roadmap/p17-014-control-plane-implementation-plan.md` — ownership split only
3. `package.json` — plan/focused/full-kit registrations
4. `packages/core/README.md` — public A2C boundary and non-claims
5. `packages/core/src/control-plane-state.ts` — added, 984 lines
6. `packages/core/test/control-plane-state.test.ts` — added, 439 lines
7. `scripts/post-17-control-plane-a2c-plan.test.ts` — added, 137 lines

## Locked input and architecture

The executable plan locks:

`slice=A2C, state=S1, version=V1, lease=L1, cancel=C1, receipt=R1, recovery=U1, replay=I1, sequence=Q1, evidence=E1`.

Architecture outcomes:

- `control-plane.ts` remains the A2A/A2B registry, manifest, input, envelope, and canonical-envelope
  owner.
- `control-plane-state.ts` is a separate pure domain module, avoiding further coupling in the
  existing registry/envelope module.
- The state module imports only the public A2A/A2B core contract.
- The local P2 role-DAG scheduler is not imported or promoted into a remote wire/state authority.
- Definition approval and runtime approval use the same closed status vocabulary but different
  structural discriminators, preventing approval-path confusion.
- P17-015 progress state, evidence, binding, and retry lineage remain outside A2C.
- Every accepted non-idempotent mutation increments a positive safe resource version by exactly one.
- Rejected, conflicting, quarantined, and exact replay decisions do not mutate state.
- The immutable A2B envelope is never rewritten by heartbeat renewal.
- Receipt content contains identity and hashes only; it contains no result body, prompt, log, path,
  provider output, environment value, or credential.

## Plan-first and behavior RED evidence

The standalone readiness validator was created before the plan or registrations. Its first run exited
`1` with exactly these gaps:

1. A2C state/lease/replay plan;
2. focused package registration; and
3. full-kit registration.

After the plan and registrations passed, the registered behavior suite was added while the source
module was absent. It exited `1` with:

`Cannot find module '../src/control-plane-state'`.

No behavior assertion ran before this missing-module RED.

## Correction trail

The first implementation run passed groups 1–2 and exposed a test-fixture defect: an attempt-1
identity attack changed `commandRunId` without changing `rootRunId`, so A2B correctly rejected the
fixture before the A2C comparison. The attack was rebuilt with a separately valid mismatching tenant.

The second run passed groups 1–5 and exposed another test-fixture defect: a complete hashed cancel
intent was spread into the creator that intentionally accepts only unhashed input keys. The attack
was rebuilt from the exact canonical input fields. Production exact-key validation was not relaxed.

The first cached whitespace check exposed four Markdown hard-break suffixes. They were removed and
the gate was rerun with an explicit external-command exit assertion. No commit was created from the
failed staged candidate.

The exact-manifest audit itself had three documented harness corrections before PASS:

- include standard untracked files as well as tracked diff files;
- allow the optional key suffix in the service-role detector positive control; and
- distinguish credential-shaped/high-entropy assignments from a fixed test-only forbidden-field
  sentinel.

## Code-review hardening

Strict TypeScript passed before review. Manual security/correctness review then identified and closed
five fail-closed gaps, each with a regression:

1. lifecycle intent is structurally validated before reading `action`; accessor input is rejected
   without invoking its getter;
2. receipt identity comparison is field-exact and independent of object key order;
3. a same-hash receipt replay revalidates the complete exact receipt and the `accept_receipt` intent;
4. receipt completion cannot predate claim/start, and observation cannot predate completion; and
5. snapshot validation rejects impossible accepted-receipt and cancellation-state combinations.

The final review found no remaining correctness, security, or scope issue in the seven-file slice.

## Focused exact-SHA proof

All commands below asserted source SHA
`3b5ed4369e0c512802c2489f53d182caee52bbdf` before and after execution.

- TypeScript 5.9.3, `strict`, `skipLibCheck=false`: PASS, zero diagnostics
- A2C plan validator: PASS (`S1/V1/L1/C1/R1/U1/I1/Q1/E1`)
- A2C state/lease/replay suite: PASS, 12 groups
- A2A registry/capability plan and domain: PASS, 11 groups
- A2B envelope plan and domain: PASS, 12 groups
- P17-015 cross-machine progress: PASS, 6 assertions and 22 attacks
- Accepted Control Plane topology: PASS, 22 sections
- P17-014 parent implementation plan: PASS
- Post-17 roadmap: PASS, 22 tasks and 4 initiatives
- P17-016 C5A live-cutover plan: PASS
- Project Intelligence: PASS, 5 fixtures and 11 negative controls
- Workflow Orchestrator: PASS, 24 phase boundaries and 26 attacks
- Provider bundles: PASS, 3 providers, 2 byte-identical skills, and 5 shared runtimes

The A2C focused groups prove:

1. exact initial state and definition/runtime lifecycle discrimination;
2. CAS, version overflow, and zero mutation;
3. envelope identity, operation, capability manifest, and one-worker claim binding;
4. claim/start authority windows;
5. monotonic, bounded, deadline-capped, idempotent heartbeat;
6. direct pre-lease and cooperative active-worker cancellation;
7. exact canonical metadata-only receipts and tamper detection;
8. terminal receipt acceptance, replay idempotency, and conflict handling;
9. cancellation-won and late-receipt quarantine;
10. conservative recovery without successor creation;
11. extras, prototype, accessor, impossible-state, and input-mutation attacks; and
12. pure source ownership with no P2, P17-015, platform, runtime, or external-system coupling.

## Authoritative full-suite proof

Source-candidate full kit:

- exit: `0`
- elapsed: 253.7 seconds
- captured output: 1,713 lines

Exact-SHA full kit:

- exit: `0`
- elapsed: 241.9 seconds
- captured output: 1,713 lines
- version stamps: v3.25
- prompt budget: 163,206 / 176,128 bytes
- lesson synchronization: 60 / 60

The known lesson-registry normalization warnings remained warnings; the sync gate passed.

## Static and workspace preservation proof

- Exact tracked-plus-standard-untracked manifest: PASS, seven files before source commit
- Cached manifest: PASS, seven files
- Cached and worktree whitespace: PASS after the documented formatting correction
- Package JSON parse: PASS
- English-only feature content scan: PASS
- Credential-shaped assignment scan: PASS after a synthetic positive control
- Long-base64 scan: PASS after a synthetic positive control
- Internal absolute-path scan: PASS after a synthetic positive control
- Pure-source coupling scan: PASS
- Dashboard tracked tree: unchanged
- The forbidden dashboard user-owned settings file was not read, staged, edited, or deleted
- Both required 2026-08-16 daily backups remained present

## Non-claims

- This evidence does not claim A2D P17-015 binding or retry-lineage proof.
- This evidence does not claim A3 signing, key management, nonce handling, or durable journal behavior.
- This evidence does not claim persistence, transaction, outbox, quarantine storage, migration, auth,
  RBAC, API, worker process, provider execution, or Control Panel behavior.
- This evidence does not claim remote execution is enabled.
- No database, browser, provider, network, external application, sync, push, merge, deployment, target,
  or target `.Codex` action occurred.
- P17-014 remains `in_progress`; A2D is the next pure-contract slice.
