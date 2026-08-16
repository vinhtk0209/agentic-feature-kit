# P17-014 Control Plane A2A registry/capability evidence

**Date:** 2026-08-16
**Scope:** A2A pure registry, operation-input, resource-budget, hash-port, and worker-manifest contracts
**Input lock:** `slice=A2A, registry=R1, capability=C1, input=I1, budget=B1, hashing=H1, availability=A1, sequence=Q1, evidence=E1`
**Kit source commit:** `4764c2666547fec10942c857c7fed422c9e38434`
**Kit source parent:** `65fa48024c0b94b186dc3b8ce7610c4a98fc7057`

## Outcome

A2A implements the first pure shared-domain slice of P17-014. It defines exactly four closed
operation descriptors, exact opaque and bounded operation inputs, fixed resource budgets, an
injected SHA-256 port, and explicit worker capability manifests. The operation registry is protocol
vocabulary; a worker manifest is a configured subset claim. Neither artifact proves that an adapter
is installed, a worker exists, or execution is available.

The core imports no runtime or platform package and performs no filesystem, process, environment,
network, database, provider, dashboard, or target operation. P17-014 remains `in_progress`; this
checkpoint closes A2A only. A2B execution-envelope and identity design is the next ordered slice.

## Source manifest

The source commit contains exactly six files with 1,539 insertions and one deletion:

- `docs/roadmap/p17-014-a2a-registry-capability-plan.md`;
- `package.json`;
- `packages/core/README.md`;
- `packages/core/src/control-plane.ts`;
- `packages/core/test/control-plane.test.ts`; and
- `scripts/post-17-control-plane-a2a-plan.test.ts`.

The dashboard tracked tree remained unchanged. Its route already consumes the canonical roadmap,
and A2A has no server or UI consumer. No dashboard production or test file was required.

## Implemented contracts

- The canonical sorted registry contains only `evidence.verify`,
  `project_intelligence.inspect`, `workflow_phase.execute`, and `workflow_verify.execute`.
- Every descriptor binds schema/contract version, fixed adapter ID/version, input kind, sorted
  required capabilities, replay class, exact budget, and a unique lowercase contract hash.
- Inputs carry only opaque UUID identities, a bounded phase ID, and exact content references. They
  cannot carry paths, URLs, headers, secrets, credentials, shell commands, executables, arguments,
  environment values, or free text.
- Referenced bodies are capped at 64 MiB; canonical input metadata is capped at 32 KiB. Operation
  budgets cannot exceed 30 minutes, 256 KiB of result metadata, 16 evidence references, or 200
  progress events.
- Worker manifests advertise an explicit canonical operation subset and closed capability set. Each
  operation repeats its registry contract hash and fixed adapter identity. Missing capabilities,
  unknown entries, duplicates, reordering, drift, and extra fields fail closed.
- Hashing is injected through `ControlPlaneHashPort`. Thrown, malformed, or constant hash providers
  cannot create an accepted registry, and closed errors never echo caller-controlled content.
- Created and validated contracts are deeply frozen. Registry presence and manifest creation expose
  no runtime-availability flag or fallback behavior.

## RED, correction, and review history

1. The readiness validator first exited `1` with exactly three gaps: the A2A plan, focused package
   registration, and full-kit registration.
2. Four plan-validator runs exposed only assertion wording or harness boundaries: the stronger
   `closed` phrase, an ambiguous manifest subject, Markdown-wrapped predecessor text, and a required
   non-claim matching the premature-claim detector. The plan contract was not weakened.
3. The focused behavior test then exited `1` with `Cannot find module '../src/control-plane'`, proving
   the missing-core RED before implementation.
4. The first implementation run passed 10 of 11 groups. The remaining test assumed mutation of a
   frozen object must throw, while the CommonJS test transform silently rejected the assignment.
   The assertion was corrected to prove before/after immutability without changing production code.
5. The first strict TypeScript 5.9.3 run reported five test-fixture readonly casts and no production
   diagnostic. The fixtures were made explicitly mutable through `unknown`; runtime assertions were
   unchanged.
6. Pre-full-suite review found a real fail-closed gap: an unknown descriptor `inputKind` could reach
   canonicalization before closed-enum validation and escape as a generic runtime error. Closed
   adapter ID/version and input-kind checks were added before canonicalization.
7. Review also expanded registry mutation coverage across schema/contract version, adapter ID and
   version, `__proto__` input kind, replay class, required capabilities, every budget field, nested
   extras, and contract hash drift.
8. The first absolute-path scan misclassified the validator regex fragment `Status:\*` as a drive
   path. The detector gained a non-word left boundary while retaining a real `C:\positive-control`;
   the unchanged source then passed.
9. The ambient npm shim pointed at a missing roaming npm CLI, and the sandboxed runtime had the known
   Windows user-resolution boundary. Tests ran unchanged through the bundled Node runtime and the
   repository-local dependencies.

## Verification

| Gate | Result |
|---|---|
| A2A plan validator | PASS: `R1/C1/I1/B1/H1/A1/Q1/E1`, exact four operations, A2A-A2D order, attacks, rollback, and non-claims |
| Focused domain suite | PASS: 11 contract/attack groups |
| Exact A2A TypeScript 5.9.3 | PASS: strict, `skipLibCheck=false`, NodeNext, zero diagnostics |
| A1/topology/roadmap/C5A companions | PASS: accepted implementation locks, 22 topology sections, 22 tasks/4 initiatives, and live-cutover plan |
| P17-015 progress companion | PASS: 6 assertions and 22 attacks |
| Project Intelligence companion | PASS: 5 fixtures and 11 negative controls |
| Workflow Orchestrator companion | PASS: 24 phase boundaries and 26 attacks |
| Provider bundle companion | PASS: 3 providers, 2 byte-identical skills, 5 shared runtimes |
| Source-candidate full kit | PASS: exit `0`; 276 seconds; 1,669 output lines |
| Exact-SHA full kit | PASS at `4764c2666547fec10942c857c7fed422c9e38434`: exit `0`; 273 seconds; 1,669 output lines |
| Version and prompt budget | PASS: v3.25 stamps; 163,206/176,128 bytes |
| Lesson synchronization | PASS: 60/60 |
| Normal source-commit hook | PASS: `spec-integrity`, 3 TypeScript files |

The exact six-file status, cached manifest, JSON parse, tracked and untracked whitespace/final
newlines, and English-only feature content were checked before commit. Positive-controlled scans
found no secret-shaped assignment or internal absolute path. The source worktree was clean after the
source commit, and all exact-SHA gates asserted the immutable HEAD before execution.

## Workspace preservation and non-claims

The 2026-08-16 kit and dashboard backups existed before edits. The source commit is local on `main`.
The dashboard's user-owned untracked settings file was not read, modified, staged, or deleted.

A2A does not implement an execution envelope, task/run/attempt/delivery/lease identity, state
machine, cancellation, receipt, journal, production crypto adapter, persistence, API, worker
process, provider distribution change, plugin, or Control Panel UI. It does not prove adapter
installation, machine enrollment, remote execution, database isolation, or end-to-end operation.

No migration, database row, browser action, network call, provider call, deployment, sync, push,
merge, target edit, or target `.Codex` modification occurred. This evidence does not claim P17-014,
P17-016, or P17-021 is complete.
