# P17-021 Control Panel Roadmap Scope Evidence

Date: 2026-08-14  
Scope: catalog, system-design plan, readiness gate, and dashboard tracking only  
Implementation verdict: not started; P17-021 remains `backlog` with incomplete inputs

## Change authority

The operator explicitly approved appending P17-021 without changing or renumbering P17-000 through
P17-020. The requested product is a real Control Panel for machines, tasks, runs, progress, evidence,
and RBAC-governed approve/cancel/retry operations. Mock/static UI cannot satisfy completion.

## Canonical artifacts

- `docs/roadmap/post-17-roadmap.json` appends P17-021 as task 22.
- `docs/roadmap/post-17-roadmap.md` mirrors the task and Wave 5/input requirements.
- `docs/roadmap/p17-021-distributed-control-panel-plan.md` records clean-architecture boundaries,
  proposed routes/APIs/domain models, races/failure states, readiness inputs, rollback, trade-offs,
  and the required evidence ladder.

P17-021 depends on P17-014, P17-015, and P17-016. Readiness is deliberately incomplete with ten
named gaps covering topology/API, identity/retry, privacy, RBAC, UI/accessibility, worker fixture,
test identities, evidence adapter, network-separated E2E, and failure injection.

## Machine checks

- `npm run test:post-17-roadmap` — PASS: 22 tasks, 4 initiatives.
- The catalog test asserts the exact ordered IDs P17-000 through P17-021, so existing tasks cannot be
  silently renumbered.
- The catalog test asserts the dependency list, incomplete readiness, two-node E2E gap, non-mock
  acceptance language, exact Playwright/real-worker test, and required system-design plan anchors.
- Dashboard focused tests — PASS: 2 files, 6 tests.
- Dashboard TypeScript (`npx tsc --noEmit`) — PASS.
- Both repositories' `git diff --check` — PASS.

## Browser corroboration

The authenticated in-app browser opened the running dashboard server at
`http://localhost:3000/roadmap`; the document title was `Post-17 Roadmap — Kit Admin`. Semantic DOM
inspection showed:

- total tasks `22`, in progress `2`, done `9`, input complete `12/22`;
- P17-021 under Wave 5 with `Backlog`, `P1`, and `10 input gaps`;
- the exact completion example references `/control-plane`, one least-privilege worker, the run, and
  the evidence hash returning to the terminal Control Panel state;
- all ten readiness blockers are rendered under `Required before execution`;
- searching for `remote worker` narrows the board to P17-014 and P17-021 (`2 of 22 tasks shown`).

The browser tab was closed and the browser session finalized after inspection.

## Honest boundary

This evidence proves that the future Control Panel is explicitly planned, input-gated, searchable,
and visible on `/roadmap`. It does not prove that `/control-plane`, a Control Plane service, a remote
worker, RBAC mutations, or the end-to-end execution/evidence loop exists. Those claims require the
P17-021 acceptance tiers and cannot be satisfied by this catalog update.

