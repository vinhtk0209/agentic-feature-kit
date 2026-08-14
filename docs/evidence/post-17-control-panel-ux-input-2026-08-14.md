# P17-021 Control Panel UX and Accessibility Input Evidence

Date: 2026-08-14
Task: P17-021 — Distributed Control Panel UI and Remote Operations Console
Evidence tier: information-architecture/accessibility input only
Verdict: GREEN proposal checkpoint; implementation remains blocked

## Scope boundary

This checkpoint proposes the Control Panel route, navigation, progressive-disclosure, responsive,
accessibility, operational-state, performance, and browser-evidence contracts. It adds no production
route, component, dependency, identity, database object, remote execution, migration, deployment,
sync, publication, or push.

The 2026-08-14 kit/dashboard backups remain present. Both repositories were clean before this
proposal scope started.

## Current-state evidence

The dashboard sources were inspected directly:

- `src/app/layout.tsx` owns the root shell but has no skip link or stable main-content target;
- `src/components/nav.tsx` and `nav-links.ts` provide a static client top row with a `More`
  disclosure, but no server-authorized Control Plane destination or mobile dialog contract;
- `/roadmap` and `/roadmap/[taskId]` provide canonical planning and bounded read-only progress;
- `/orchestrator` is a dense read-only local queue/audit surface and is not remote Control Plane
  truth;
- current primitives provide cards, badges, buttons, semantic tables, sorting, and pagination; and
- existing tests assert selected ARIA strings but do not constitute a WCAG, keyboard, responsive,
  zoom, forced-color, multi-browser, NVDA, or real-worker proof.

This is a bounded gap reconciliation, not a negative judgment on the current local-admin UI.

## Proposed decision

ADR-005 recommends `IA1/N1/P1/A11Y1/R1/S1/PERF1/V1`:

- dedicated `/control-plane` overview and list/detail routes for machines, tasks, runs, evidence, and
  audit;
- server-derived global navigation, adaptive Control Plane sub-navigation, a keyboard-safe mobile
  dialog menu, and a skip link;
- URL-addressable bounded lists, dedicated details, and contextual server-authorized actions;
- WCAG 2.2 AA plus exact keyboard, focus, live-region, dialog, table, zoom, contrast, target-size,
  reduced-motion, and announcement-rate acceptance;
- required 360×800, 768×1024, 1280×720, and 1440×900 proof plus a 320–2,560 CSS pixel support range;
- closed non-success/freshness presentation states;
- bounded rows/events/SSE/polling and measured reference-topology performance budgets; and
- component semantics, axe, keyboard, geometry, three-engine Playwright, Windows NVDA, and the real
  network-separated worker E2E.

Recommended operator statement:

`APPROVE P17-021 UX v1: routes=IA1, navigation=N1, progression=P1, accessibility=A11Y1, responsive=R1, states=S1, performance=PERF1, verification=V1.`

Approval removes only the information-architecture/accessibility missing input. P17-021 remains
blocked by every other unresolved dependency and readiness item.

## Checkpoint files

- `docs/design/adr-005-control-panel-information-architecture-accessibility.md`
- `scripts/post-17-control-panel-ux.test.ts`
- `package.json`
- `docs/evidence/post-17-control-panel-ux-input-2026-08-14.md`

## Focused proof

The first focused run failed closed only because the ADR said `no page-level horizontal scroll`
while the contract expected `no page-level horizontal scrolling`. The ADR terminology was
normalized without weakening the requirement.

Final focused output:

```text
post-17-control-panel-ux.test: PASS (19 sections, IA1/N1/P1/A11Y1/R1/S1/PERF1/V1 proposed, P17-021 still has 10 gaps)
post-17-control-panel-rbac.test: PASS (21 sections, I1/A1/S1/M1/D1/B1/U1/E1 proposed, P17-021 still has 10 gaps)
post-17-roadmap.test: PASS (22 tasks, 4 initiatives)
package-json: PASS
git diff --check: exit 0
```

Before full regression, the exact three-file set passed tracked/untracked whitespace checks. The
bounded secret scan used the same expression against a known-positive synthetic string and those
files:

```text
EXACT_FILE_SET=PASS
WHITESPACE_CHECK=PASS
SECRET_SCAN_POSITIVE_CONTROL=1
SECRET_SCAN_HITS=0
```

## Full regression proof

`npm run test:kit`

```text
exit code: 0
elapsed: 251.6 seconds
new UX validator: PASS in the registered full-suite chain
version: v3.25 stamps agree
feature index: in sync
lesson annotations: 60/60 paired
```

The suite's `verify_records` messages are simulated failure-path warnings. No live verification,
sync, or external write occurred.

## Browser evidence boundary

No browser session was opened because this checkpoint changes no production UI, CSS, route, or
runtime behavior. ADR-005 explicitly requires browser, multi-engine, assistive-technology, geometry,
and real-worker evidence after implementation. An architecture document or screenshot cannot
satisfy those tiers.

## Remaining gate

P17-021 stays `backlog`, `readiness.complete=false`, with all ten canonical gaps. The immediate UX
decision is explicit operator acceptance or replacement of `IA1/N1/P1/A11Y1/R1/S1/PERF1/V1`.
