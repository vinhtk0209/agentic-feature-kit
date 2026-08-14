# P17-014 Control Plane Topology Input Packet Evidence — 2026-08-14

## Outcome

The P17-014 operator topology/trust decision packet is complete and locally verified. Proposed ADR
`docs/design/adr-003-distributed-control-plane-topology.md` recommends `T1/M1/X1/R1/E1/S1`:

- dashboard-hosted Control Plane API and Supabase/Postgres transactional leases/audit;
- outbound-only workers with one-time enrollment and per-machine Ed25519 request signing;
- compiled typed operations with exact schemas, `shell:false`, registered repo roots, and
  worker-local credential aliases;
- at-least-once delivery with stable delivery IDs, worker execution journal, transactional CAS, and
  manual recovery for unknown side-effect outcomes;
- a real two-node/network-separated deterministic execution/evidence E2E; and
- single-region bounded Postgres-first scale with measured broker/multi-region revisit thresholds.

This is input preparation only. P17-014 remains `backlog`, readiness remains false with
`operator-approved topology and trust boundaries` missing, P17-015 remains in progress, and P17-016
remains input-blocked. No remote/control-plane implementation or external action occurred.

## Current-contract reconciliation

- Existing P2 orchestration supplies pure role-DAG, lease, recovery, evidence handoff, and merge
  validation without network/database/process side effects.
- Existing runtime dispatches only through an injected executor and freezes `shell:false` requests.
- P17-002 remains authoritative for phase envelopes/gates/evidence/resume.
- P17-015 remains authoritative for task/run/machine/evidence identity and progress/retry lineage.
- P17-016 must supply accepted tenant/privacy/retention/deletion contracts before production
  persistence.
- P17-021 remains the owner of Control Panel presentation, RBAC action matrix, approve/cancel/retry
  UI, and authenticated browser E2E.

The ADR adds a network/trust topology around those contracts instead of creating a competing
orchestrator or allowing remote shell access.

## Verification

1. `npm run test:post-17-control-plane-topology`
   - First run: RED on benchmark naming (`Control API p95` versus the required public name `Control
     Plane API`). The 500 ms p95 target was preserved and the component name was normalized.
   - Second run: RED only because the final assertion expected literal `No sync, push` while the ADR
     already said it `does not authorize ... deployment, sync, or push`. The validator was bound to
     the existing prohibition sentence; policy did not change.
   - Authoritative rerun: PASS — 21 sections, `T1/M1/X1/R1/E1/S1` Proposed, P17-014 still
     input-blocked.
2. `npm run test:post-17-roadmap`
   - PASS — 22 tasks, four initiatives.
3. `npm run test:post-17-privacy-decision`
   - PASS — P17-016 remains explicitly input-blocked.
4. Pre-evidence `git diff --check`
   - PASS.
5. Exact changed-file secret scan
   - PASS — three files, one positive control, zero hits before this evidence file was added.
6. `npm run test:kit`
   - PASS — exit `0` in 212.3 seconds with the topology validator registered in the full chain.

Final diff and exact four-file secret checks remain required before a local Proposed-ADR commit.

## Operator input still required

Recommended approval statement:

`APPROVE P17-014 TOPOLOGY v1: topology=T1, machine=M1, execution=X1, replay=R1, e2e=E1, scale=S1.`

This approval closes topology/trust readiness only. It does not authorize implementation, Supabase
migration/write, enrollment, remote/provider execution, two-node environment use, deployment, sync,
or push.

## Safety and authenticity limits

- No network or database schema/API was created.
- No worker key, enrollment grant, task, lease, or evidence row was created.
- No remote/provider operation or two-node E2E was run.
- No dashboard production code or UI changed; no browser run was needed.
- No target `.Codex` directory was touched.
- No sync or push occurred.
