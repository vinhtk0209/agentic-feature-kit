# Post-17 Roadmap

This roadmap begins after the original roadmap was honestly completed at **17/17**. It does not
reopen or renumber those phases. The machine-readable source for status and dashboard rendering is
[`post-17-roadmap.json`](./post-17-roadmap.json).

## Execution rule

No implementation task starts until its `readiness.complete` value is `true` and its `missing`
list is empty. Priority does not bypass this rule. A task with incomplete or contradictory inputs
stays `needs_input`.

The required input contract covers scope boundaries, source authority and freshness, positive and
failure examples, packaging surfaces, measurable acceptance criteria, focused and negative tests,
durable evidence, security/permissions, rollback, and operator decisions.

## Distribution model

The roadmap uses one provider-neutral shared core. Provider packages are thin adapters:

- **Codex:** repository/user skills while authoring, then an installable plugin for distribution.
- **Claude:** Claude-compatible skills, commands, and specialized-agent adapters.
- **Copilot:** project skills and custom-agent adapters; prompt files remain optional because their
  availability is surface-specific and preview.
- **Shared core:** normalized schemas, deterministic scripts, fixtures, and evidence contracts.

Provider adapters must not fork business rules or evidence semantics. A transport/action smoke is
never reported as planning or implementation parity.

## Priority initiatives

### P17-I1 — Project Intelligence

Detect the repository's actual stack, conventions, router, i18n, styling, task taxonomy, reference
features, and evidence boundaries before planning or editing.

When complete:

- React Native is not treated as React web.
- Vue receives Vue-specific structure instead of a React fallback.
- A repository without i18n does not receive a fabricated `messages.ts` gate.
- Router and style checks activate only when the project profile proves those systems exist.

### P17-I2 — Provider-neutral Workflow Orchestrator

Split the current 2,691-line flagship command into bounded phase contracts with content-addressed
evidence handoffs, fail-closed resume semantics, and provider adapters.

When complete:

- Codex, Claude, and Copilot consume the same normalized intake/profile/evidence contracts.
- A failed phase resumes from a verified bundle instead of replaying the full workflow.
- Provider-specific transport cannot silently weaken gates.
- Model selection may vary by phase without changing task or evidence semantics.

## Task catalog

| ID | Priority | Wave | Status | Task | What completion handles |
|---|---:|---:|---|---|---|
| P17-000 | P0 | 0 | done | Tracking and readiness foundation | A malformed catalog or missing input fails closed and is visible on `/roadmap`. |
| P17-001 | P0 | 1 | done | Project Intelligence skill and agent contract | Prevents wrong-framework, fake-i18n, wrong-router, and target-specific fallback scaffolding. |
| P17-002 | P0 | 1 | done | Workflow Orchestrator decomposition contract | Replaces the monolith with bounded phases that can resume from verified evidence. |
| P17-003 | P1 | 2 | done | Provider-neutral semantic specification model | Makes equivalent Confluence/Jira/file requirements normalize to the same intent. |
| P17-004 | P1 | 2 | in_progress | Provider-neutral specification adapters | Removes operational dependence on one Confluence source or instance. |
| P17-005 | P1 | 2 | done | Project-derived conditional quality gates | Adds relevant i18n/router/style checks without false framework assumptions. |
| P17-006 | P1 | 3 | done | Phase-aware model selection and routing | Allows explicit quality/cost/latency routing without silent provider substitution. |
| P17-007 | P1 | 4 | backlog | Normalized same-input provider parity | Separates action smoke from real planning/implementation parity. |
| P17-008 | P0 | 3 | done | Installable distribution bundles | Produces validated Codex, Claude, and Copilot bundles over one shared core. |
| P17-009 | P1 | 2 | done | Cross-platform release qualification | Proves Windows and Linux behavior in CI, including paths, quoting, setup, and process cleanup. |
| P17-010 | P1 | 2 | done | CLI reliability and direct integration tests | Makes malformed input and I/O failures explicit for feedback/KPI/public CLI paths. |
| P17-011 | P1 | 2 | done | Honest isolated-worktree browser verification | Stops `infra-blocked` from being confused with verified browser behavior. |
| P17-012 | P1 | 2 | done | Convention and stack portability audit | Gates Open edX conventions instead of treating them as universal defaults. |
| P17-013 | P1 | 2 | done | Documentation and runtime claim audit | Detects version, parity, generated-edition, and documentation drift. |
| P17-014 | P2 | 5 | in_progress | Opt-in distributed control plane | Coordinates typed remote work without default remote execution or arbitrary shell. |
| P17-015 | P2 | 4 | done | Detailed cross-machine progress tracking | Links each task to the exact machine-safe run, retry lineage, and evidence hash. |
| P17-016 | P1 | 3 | in_progress | Privacy-safe specification and usage data criteria | Prevents private specs, secrets, or cross-tenant data from leaking into learning data. |
| P17-017 | P2 | 5 | backlog | Provider-neutral build harness with optional RAG | Keeps repository facts authoritative while measuring any retrieval benefit safely. |
| P17-018 | P2 | 4 | done | Public-release and GitHub adoption readiness | Adds clean-clone onboarding, governance, nightly CI, and a deliberate release boundary. |
| P17-019 | P2 | 4 | backlog | Credential lifecycle adapter | Handles token expiry only through an explicit project auth capability. |
| P17-020 | P2 | 4 | backlog | Self-improvement drift, bias, and evolution tracking | Prevents one feature cluster from overfitting prompt evolution and adds golden rollback. |
| P17-021 | P1 | 5 | backlog | Distributed Control Panel UI and Remote Operations Console | Proves authorized machine/task operations through a real Control Plane, remote worker, execution, evidence, and browser-visible terminal state. |

## Inputs still required before their implementation

- **P17-007:** a golden cross-provider fixture and explicit approval for bounded provider runs.
- **P17-017:** a measurable RAG benefit benchmark and approved indexing/privacy boundary.
- **P17-019:** a project-specific refresh capability fixture and security approval.
- **P17-020:** a representative multi-feature golden set and approved drift budget.
- **P17-021:** completed P17-014/P17-016 contracts (P17-015 is complete), approved RBAC/UI topology, disposable remote worker, test identities, evidence adapter, network-separated E2E topology, and failure injection.

These missing inputs are not all operator questions. Where the source workspace can produce a
deterministic artifact safely, the roadmap should prepare and test it before requesting a decision.

## Locked input decisions

- **P17-004 (`S1/F1/P1/M1/U1/C1/D1/R1/E1/N1`):** the P17-003 `SemanticSourceInput` remains
  canonical; approved Jira/Azure DevOps inputs are synthetic reserved-host exports with exact
  provider anchors, complete mapped-or-unsupported field ownership, and zero tenant/person data.
  Readiness is complete and P17-004 is `in_progress`; runtime adapters remain a separate A2 slice.
- **P17-014 (`T1/M1/X1/R1/E1/S1`):** dashboard-hosted single-region Control Plane with outbound-only
  signed workers, compiled typed `shell:false` operations, at-least-once delivery plus journal/CAS,
  real network-separated two-node evidence, and measured scale revisit thresholds. Input readiness
  is complete and P17-015 is now done. P17-014 is now `in_progress` under its implementation plan;
  no runtime or external action is authorized by this status transition.
- **P17-016 (`T1/R1/C1/L1/E1`):** opaque multi-tenant metadata-only central storage; exact finite
  retention profiles; optional learning/indexing/evaluation/diagnostic scopes off; quarantined
  explicitly mapped legacy data; and metadata-only evidence with no default legal hold. P17-016
  implementation is in progress under the locked six-wave plan; no migration or external write is
  authorized by this decision.
- **P17-018 (`A1/L1`):** target external software-delivery engineers, evaluators, maintainers,
  contributors, and security researchers; retain Apache-2.0 for repository source and provider
  bundles. The repository remains private and the package remains `private: true` until separately
  authorized. P17-018 is done because R1–R6 now provide admitted source, governance, privacy,
  supply-chain, archive, clean-clone, cross-platform, visual, final-readiness, and dashboard evidence.
  No repository, package, plugin, tag, or release was published by this status transition.

## Wave order

1. **Wave 0:** catalog, readiness validation, and dashboard tracking.
2. **Wave 1:** Project Intelligence shared core; prepare and approve the Orchestrator boundary map.
3. **Wave 2:** semantic spec, adapters, conditional gates, portability, CLI reliability, and honest
   worktree verification.
4. **Wave 3:** model routing, installable bundles, privacy criteria.
5. **Wave 4:** provider parity, tracking, release readiness, credentials, and drift control.
6. **Wave 5:** opt-in distributed control plane, real Control Panel UI, and optional RAG after
   privacy/topology/RBAC/E2E gates.

Every completed task must replace its planned evidence path with a durable evidence artifact and a
local commit reference. Sync and push remain separately authorized actions.
