# P17-016 Privacy Policy Approval Evidence

Date: 2026-08-14
Task: P17-016 — Privacy-safe specification and usage data criteria
Verdict: policy input accepted; task ready; implementation not started

## Accepted decision

The operator accepted the exact ADR-002 choice set:

`APPROVE P17-016 POLICY v1: tenant=T1, retention=R1, consent=C1, legacy=L1, evidence=E1.`

The accepted policy is:

- `T1`: opaque tenant identity and metadata-only central persistence;
- `R1`: zero-day private central content, 24-hour short-lived, 30-day standard, 180-day learning
  aggregate, and 365-day audit/release retention;
- `C1`: essential operation only when enabled; optional learning, indexing, cross-provider
  evaluation, and diagnostic content remain off;
- `L1`: quarantine legacy data, map and sanitize explicitly, and purge unmapped data within 30 days;
  and
- `E1`: finite immutability, metadata-only central evidence references, and no default legal hold.

## Canonical effect

- ADR-002 status is `Accepted — policy input locked; implementation not started`.
- P17-016 readiness is `complete=true` with no missing inputs.
- P17-016 status is `ready` because its only dependency, P17-000, is done.
- The human roadmap moves the decision from open inputs to locked inputs.
- Canonical roadmap readiness becomes 16/22 input-complete; this decision contributes one of those
  two newly completed inputs.

Acceptance does not prove any schema, runtime, tenant repository, sanitizer, deletion worker,
dashboard view, or migration. Those remain P17-016 implementation work.

## Focused proof

```text
post-17-privacy-decision.test: PASS (17 sections, 5 data classes, T1/R1/C1/L1/E1 accepted, P17-016 ready)
post-17-control-plane-topology.test: PASS (22 sections, T1/M1/X1/R1/E1/S1 accepted, P17-014 dependency-blocked)
post-17-control-panel-rbac.test: PASS (21 sections, P17-021 still has 10 gaps)
post-17-roadmap.test: PASS (22 tasks, 4 initiatives)
git diff --check: exit 0
```

Dashboard reconciliation focused proof:

```text
post17-roadmap.test.ts: 4/4 PASS
post17-phase-capability-input.test.ts + post17-roadmap.test.ts: 2 files / 7 tests PASS
TypeScript: exit 0
```

The first full dashboard run exposed one stale P17-006 test assumption that globally expected no
`ready` task. The test was corrected to own only P17-006's done/readiness contract; P17-016's state
was not weakened or hidden.

## Full regression proof

```text
kit npm run test:kit: exit 0 in 246.4 seconds
dashboard npx vitest run: 64 files / 452 tests PASS in 10.6 seconds
```

The kit suite's `verify_records` messages are simulated negative-path warnings. No live verification
or external write was performed.

## Safety boundary

- No P17-016 implementation is claimed.
- No Supabase migration, tenant row, content write, deletion, provider run, identity, or browser
  session was created.
- No target `.Codex` path was modified.
- No sync, deployment, publication, or push occurred.
