# P2 Multi-Agent Orchestration

## 1. Scope and safety boundary

P2 coordinates bounded `dev`, `design`, `ui`, and `figma` role tasks only where a declared DAG
allows parallelism. It is not a second runner: this foundation starts no process, creates no
worktree, calls no provider, and writes no dashboard state. A later runtime adapter may supply
those effects only through the contracts below.

The hard runtime precondition remains an honest single-agent verification signal (F1). This
foundation does not claim that precondition is satisfied; it makes the P2 handoff/merge contract
testable without pretending to run a multi-agent job.

## 2. Role DAG and scheduling

Each task has one allowed role, stable task id, B-phase evidence location, finite context budget,
finite timeout, and dependency ids. The plan is refused before scheduling if an id is duplicated,
a role/phase/hash is malformed, a dependency is unknown, or the graph is cyclic. A task may be
leased only after every declared dependency is completed. Therefore parallelism is a property of
the DAG, never a reason to bypass a phase or gate.

The shared `contractHash` is the canonical cross-role interface digest. Every handoff must echo it
exactly. A design artifact produced against one contract cannot silently be consumed by a UI task
declaring another.

## 3. Leases, timeout, and recovery

Leases are deterministic caller-supplied records (`leaseId`, task, owner, issued/expiry time), so
the pure core neither creates clocks nor relies on process-local random state. An active task has
at most one lease. Releasing an expired lease is an explicit recovery action; a new claim is
refused until recovery has removed the old record. A submitted handoff must match the current
lease and arrive strictly before its expiry.

Every runtime ledger is fail-closed validated at each entry point: `active` is a plain record,
every key names the same known task as its lease, ids are globally unique, and finite issued/expiry
times are ordered. Completion ids are likewise known and unique. A lease may not outlive its
task's declared timeout or overflow its expiry arithmetic.

The recovery decision is intentionally conservative: reclaim expired leases and retry the same
task; wait if an active lease remains; dispatch if an unleased task is ready; otherwise report a
deadlock. Cycles are rejected during DAG validation, before any role is dispatched.

## 4. Evidence-only handoff protocol

Role agents hand off a claim plus a P1 bundle reference (`featureName`, `phase`), not an
unverified conversational assertion. The verifier calls the injected P1 evidence verifier and
rejects absent, tampered, or mismatched bundles. If a role claims backend-derived evidence, the
same verifier must additionally require I2's `verifyBackendBoundBundle`; a generic legacy P1
manifest is never sufficient for that stronger claim.

The core is pure because the evidence check is injected. `createP1EvidenceBundleVerifier` is the
small filesystem boundary for production integration and delegates to existing P1 verification.
It performs no writes. A future merge executor must consume artifacts only after this verifier has
accepted their bundle references.

## 5. Merge semantics and gate invariance

The final merge accepts only a complete set of valid, unexpired, contract-aligned handoffs. A
handoff over its context budget does not produce a partial pass: it is rejected with the recovery
action `summarize-and-retry`. This makes context starvation visible and bounded rather than
silently truncating one role's input.

The final gate has the exact single-agent signature `(mergedOutput) => GateVerdict`; it receives
neither role count nor role identity. The orchestrator invokes that one supplied gate once only
after all handoffs are valid. Adding agents can change the merged content, but cannot select a
different gate, turn a failing verdict into a pass, or bypass evidence verification.

## 6. Source-only runtime boundary (P2-B)

`multi-agent-runtime.ts` executes validated DAG waves only through an injected `RoleExecutor`.
Requests are structured data with literal `shell:false`; the kit does not choose a CLI, construct a
command string, spawn a process, create a worktree, or own a scheduler. The dashboard sidecar is
the future transport owner. Each role receives only its own prompt/context plus verified predecessor
bundle references. A timeout explicitly reclaims its lease and may retry within the declared bound.
The merger is unreachable until every role handoff has passed P1/I2 verification, and its output is
then evaluated by the unchanged final gate.

## 7. Canonical cross-repo transport manifest (P2-C1)

`p2-transport-manifest.ts` is the sole versioned manifest contract between the kit runtime and a
future dashboard sidecar. The dashboard must invoke this validator (or an exported kit command),
not copy its types or reimplement its checks. A single-line `@@P2_ROLE_TRANSPORT@@` JSON envelope
contains exactly one `p2-role-transport/v1` manifest and binds the plan hash, run/task/role,
timeout, output cap, backend-binding requirement, predecessor P1/I2 bundle references, and stop
receipt schema.

An operator supplies one approved worktree base. Each manifest names a canonical workspace id and
a path strictly below that base, with only `kind: "git-worktree"`; traversal, `.git`,
`node_modules`, junction intent, duplicate workspaces, and ambiguous sentinels are rejected before
the sidecar can take an action. The contract expressly does not create or remove worktrees. In
particular, a consumer must never use a `node_modules` junction: one worktree per role/run has its
own normal filesystem directory.

String checks cannot prove the resulting filesystem has no reparse point. Before a future
consumer launches a role, it must `lstat` the created workspace and relevant parent chain, resolve
the real path, and reject any junction/reparse point or resolved path outside the approved base.
That post-creation check is mandatory consumer work; C1 deliberately grants no filesystem action.

Predecessors are bundle references only, validated through existing P1 verification and strict I2
verification when required. A stop receipt is checked against the manifest's run/workspace identity
and output cap. Thus malformed runner output, over-cap output, or a missing/forged receipt cannot
become a handoff or final merge. Process launch, timeout killing, and database writes remain
outside this C1 contract and require a later consumer integration.
