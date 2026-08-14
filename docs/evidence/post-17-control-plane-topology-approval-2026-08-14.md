# P17-014 Control Plane Topology Approval Evidence

Date: 2026-08-14
Task: P17-014 — Opt-in distributed control plane
Verdict: topology/trust input accepted; implementation dependency-blocked

## Accepted decision

The operator accepted the exact ADR-003 choice set:

`APPROVE P17-014 TOPOLOGY v1: topology=T1, machine=M1, execution=X1, replay=R1, e2e=E1, scale=S1.`

The accepted topology uses:

- `T1`: dashboard-hosted Control Plane API plus Supabase/Postgres transactional state;
- `M1`: one-time enrollment and per-machine Ed25519 request signing, replay checks, rotation, and
  revocation;
- `X1`: closed compiled operations, exact schemas/hashes, registered repo roots, `shell:false`, and
  worker-local credentials;
- `R1`: at-least-once delivery with stable IDs, a worker journal, CAS, and manual unknown-outcome
  recovery rather than false exactly-once claims;
- `E1`: a real network-separated/two-node deterministic operation/evidence proof with no shared
  filesystem; and
- `S1`: bounded single-region Postgres-first scale with measured broker/multi-region revisit points.

## Canonical effect

- ADR-003 status is `Accepted — topology/trust input locked; implementation dependency-blocked`.
- P17-014 readiness is `complete=true` with no missing inputs.
- P17-014 remains `backlog` because P17-015 is still `in_progress` and the accepted P17-016 policy
  has not been implemented.
- The human roadmap records the locked topology and removes it from open input gaps.
- P17-021 remains `backlog`, `readiness.complete=false`, with all ten gaps. Accepting P17-014's
  topology choice does not satisfy its requirement for a completed/versioned Control Plane or its
  separately approved E2E fixture.

## Focused and regression proof

```text
post-17-control-plane-topology.test: PASS (22 sections, T1/M1/X1/R1/E1/S1 accepted, P17-014 dependency-blocked)
post-17-privacy-decision.test: PASS (17 sections, T1/R1/C1/L1/E1 accepted, P17-016 ready)
post-17-control-panel-rbac.test: PASS (21 sections, P17-021 still has 10 gaps)
post-17-roadmap.test: PASS (22 tasks, 4 initiatives)
kit npm run test:kit: exit 0 in 246.4 seconds
dashboard npx vitest run: 64 files / 452 tests PASS in 10.6 seconds
dashboard TypeScript: exit 0
```

## Authenticity boundary

This is authoritative decision/readiness evidence, not runtime evidence. No Control Plane endpoint,
table, key, machine, enrollment grant, task, lease, delivery, worker journal, remote process,
provider call, or two-node E2E was created. Implementation still requires the ADR's full attack and
evidence ladder.

No browser run was needed because no production route/component changed. No sync or push occurred.
