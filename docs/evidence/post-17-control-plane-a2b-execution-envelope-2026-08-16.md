# P17-014 Control Plane A2B execution-envelope evidence

**Date:** 2026-08-16
**Scope:** A2B unsigned execution envelope and P17-015-compatible identity references
**Input lock:** `slice=A2B, envelope=E1, identity=I1, operation=O1, timing=T1, evidence=D1, hashing=H1, binding=B1, sequence=Q1, verification=V1`
**Kit source commit:** `3e1d016914f3ad8896b6d97e255b863f14473ce4`
**Kit source parent:** `4f56e5cf822a38df0b13310d00a6204ec90ae750`

## Outcome

A2B adds one exact, unsigned, content-addressed execution envelope to the pure Control Plane domain.
It binds a mandatory tenant and P17-015-compatible identity reference to one canonical A2A operation
descriptor/input, canonical bounded timing, and a metadata-only P17-015 evidence policy.

The envelope is validation data, not execution authority. It contains no signature, key, nonce,
clock read, state/lease action, persistence, network, runtime adapter, or availability claim. A2B is
locally complete, while P17-014 remains `in_progress`. A2C task/lease/cancel/receipt/recovery state is
the next ordered pure-core slice.

## Source manifest

The source commit contains exactly six files with 1,225 insertions and one deletion:

- `docs/roadmap/p17-014-a2b-execution-envelope-plan.md`;
- `package.json`;
- `packages/core/README.md`;
- `packages/core/src/control-plane.ts`;
- `packages/core/test/control-plane-envelope.test.ts`; and
- `scripts/post-17-control-plane-a2b-plan.test.ts`.

The dashboard tracked tree remained unchanged. A2B has no persistence, server, worker, or UI
consumer, so no dashboard mirror or production change is justified.

## Implemented contracts

- `ControlPlaneExecutionIdentity` requires lowercase tenant/run/delivery/lease/machine/repository
  UUIDs, one `P17-000`–`P17-999` task ID, attempt 1–50, root/parent self-consistency, distinct
  delivery/lease IDs, and the lowercase P17-015 binding hash.
- `ControlPlaneExecutionOperation` embeds one descriptor selected from the fully validated A2A
  registry plus the operation input validated by that descriptor code. Adapter, capability, replay,
  budget, contract hash, and input rules cannot be overridden by the envelope.
- Repository-bearing operation input must equal the envelope repository identity. `evidence.verify`
  remains repository-bound through identity without widening its A2A input.
- Canonical timing requires `issuedAt < leaseExpiresAt <= deadlineAt`, a maximum 60-second initial
  lease, and a maximum 30-minute deadline. The domain reads no current clock.
- Evidence policy is exactly `metadata_only` to `p17_015_progress` with `short_lived` or `standard`
  retention. It contains no locator or body.
- The canonical envelope, including its lowercase hash, is bounded to 256 KiB. Creation, validation,
  and serialization are deterministic and deeply frozen.
- `serializeControlPlaneExecutionEnvelope` is the sole canonical full-envelope JSON serializer. A3
  must use its exact UTF-8 text as the signing payload instead of reimplementing field ordering.
- A2B carries only the progress identity reference. A2D must validate the complete P17-015 binding,
  retention, lineage, and event authority before a running state can be accepted.

## RED, correction, and review history

1. The standalone readiness validator exited `1` with exactly three expected gaps: the A2B plan,
   focused package registration, and full-kit registration.
2. The first plan passed, but pre-behavior architecture review found that A3 would need canonical
   signing bytes without an owned serializer. The plan and validator were strengthened to require
   `serializeControlPlaneExecutionEnvelope` before runtime implementation.
3. The focused behavior suite then exited `1` at its first guard with the missing
   `createControlPlaneExecutionEnvelope` export, proving behavior RED before source implementation.
4. The first implementation run passed 11 of 12 groups. The lowercase-UUID attack used an
   all-numeric UUID, so uppercasing produced no mutation. Only the fixture changed to include one
   lowercase hexadecimal letter; production validation did not change.
5. The first strict TypeScript 5.9.3 run found one production narrowing gap for numeric `attempt`,
   plus readonly mutation setup and intentional casts in tests. Runtime behavior was already green.
   The source added an explicit numeric type guard, and tests retained readonly public contracts
   through a mutable fixture type and `unknown` attack casts.
6. The second strict run cleared every production diagnostic but exposed 11 remaining test errors
   from one callback still annotated with the readonly public input. Only that callback annotation
   changed; the third strict run passed with zero diagnostics.
7. Review made the deadline constant alias the existing global 30-minute bound and added key-order
   permutation proof. Equivalent object-key permutations create byte-identical envelopes, while
   ordering-sensitive capability lists remain strict.
8. The ambient npm shim pointed at a missing roaming npm CLI, and the sandboxed runtime retained the
   known Windows user-resolution boundary. Tests ran unchanged through bundled Node and repository
   dependencies.

## Verification

| Gate | Result |
|---|---|
| A2B plan validator | PASS: `E1/I1/O1/T1/D1/H1/B1/Q1/V1`, exact contracts, attacks, serializer ownership, rollback, and non-claims |
| A2A focused domain | PASS: 11 contract/attack groups |
| A2B focused envelope | PASS: 12 create/validate/serialize and attack groups |
| Exact A2 TypeScript 5.9.3 | PASS: strict, `skipLibCheck=false`, NodeNext, zero diagnostics |
| A1/topology/roadmap/C5A companions | PASS: accepted locks, 22 topology sections, 22 tasks/4 initiatives, and privacy cutover plan |
| P17-015 progress companion | PASS: 6 assertions and 22 attacks |
| Project Intelligence companion | PASS: 5 fixtures and 11 negative controls |
| Workflow Orchestrator companion | PASS: 24 phase boundaries and 26 attacks |
| Provider bundle companion | PASS: 3 providers, 2 byte-identical skills, 5 shared runtimes |
| Source-candidate full kit | PASS: exit `0`; 239.4 seconds; 1,691 output lines |
| Exact-SHA full kit | PASS at `3e1d016914f3ad8896b6d97e255b863f14473ce4`: exit `0`; 236.3 seconds; 1,691 output lines |
| Version and prompt budget | PASS: v3.25 stamps; 163,206/176,128 bytes |
| Lesson synchronization | PASS: 60/60 |
| Normal source-commit hook | PASS: `spec-integrity`, 3 TypeScript files |

The exact six-file status, cached manifest, JSON parse, tracked and untracked whitespace/final
newlines, and English-only feature content were checked before commit. Positive-controlled scans
found no secret-shaped assignment, internal absolute path, or runtime/platform import in the pure
source. The source worktree was clean after commit, and all exact-SHA commands asserted the immutable
HEAD before execution.

## Workspace preservation and non-claims

The 2026-08-16 kit and dashboard backups existed before edits. The source commit is local on `main`.
The dashboard's user-owned untracked settings file was not read, modified, staged, or deleted.

A2B does not sign or authorize an envelope, validate a machine key/nonce/current clock, prove a
P17-015 row or tenant ownership, create/claim/renew a lease, change task state, cancel, accept a
receipt, recover an unknown outcome, write progress, execute an adapter, or package a worker/plugin.

No database, migration, browser action, network call, provider call, deployment, sync, push, merge,
target edit, or target `.Codex` modification occurred. This evidence does not claim P17-014,
P17-016, or P17-021 is complete.
