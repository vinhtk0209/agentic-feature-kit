# Post-17 Wave 1 Input Contracts

## Outcome

Wave 1 implementation is now gated by three machine-readable contracts rather than by assumptions:

- [`post-17-orchestrator-boundaries.json`](../roadmap/post-17-orchestrator-boundaries.json) binds
  the decomposition to the current 2,691-line flagship source, all 23 mandatory phases, the
  conditional `D-cross-2` phase, the eight visible stage groups, gate ownership, side effects, and
  evidence/resume rules.
- [`post-17-orchestrator-golden.json`](../roadmap/post-17-orchestrator-golden.json) binds future
  same-input comparisons to the sanctioned `US-AD-095-ProgressReports` capture and distinguishes
  required semantic/gate/evidence conservation from acceptable provider or formatting differences.
- [`post-17-provider-packaging.json`](../roadmap/post-17-provider-packaging.json) records the
  current official packaging surfaces and limits distribution to private, local repository
  artifacts until a separate publication or installation decision is authorized.

The focused validator checks the current source hash and phase lines, runtime phase registry,
stage ownership, required gates, golden proof identity, artifact classes, official documentation
hosts, provider paths, and seven negative controls. A flagship change must deliberately regenerate
and revalidate these contracts.

## Decomposition boundary

| Stage | Current phases | Reusable boundary | What completion handles |
|---|---|---|---|
| Intake | B0, B0.5, B1-B3 | Project intake/profile skill plus bounded spec, image, and convention workers | Prevents wrong source identity, wrong repository, and context-heavy parallel discovery. |
| Scope | B4, D-cross-2 | Scope and contract-reconciliation skill | Keeps human scope/contract decisions outside provider adapters. |
| Design | B5-B7 | Feature design/plan skill with an optional isolated design worker | Produces bounded plans without letting a worker approve its own design. |
| Approve | B8-B9 | Plan approval and deterministic contract probes | Preserves literal final approval and conflict checks. |
| Prep | B9.5-B9.6 | Implementation preflight skill | Contains git/network/package side effects behind one auditable authority. |
| Build | B10-B11 | Implementation and verification agents over one shared evidence contract | Separates writing from verification while retaining one computed final verdict. |
| Done | B12 | Verified closeout skill | Prevents a worker or provider transport from claiming done independently. |
| Learn | B12.5-B12.8 | Feedback/reconciliation skill | Keeps prompt mutation explicit and contract reconciliation report-only. |

The phase map is not permission to split all phases at once. It defines the conservation target and
the boundaries that every later slice must preserve.

## Golden comparison rule

The reference input is Confluence page `830569842`, source SHA-256
`dd36b30b0c1c162bafac9f6b464105da6ad3310014a13ce81931f02d41c9ea93`, with 19,310 bytes,
95 paragraphs, and 19 anchored acceptance criteria. The sanctioned reference verification is run
`run-1786560631191-1cd57bdc`, Tier A/B `0/0`, computed `verified=true`, and bundle-only resume
`DONE` across all 23 mandatory phases.

A decomposed candidate does not need byte-identical code. It must conserve the input identity,
feature identity, AC set, phase disposition, human/computed gate semantics, required artifact
classes, evidence validity, and trusted verification derivation. Provider/model metadata,
timestamps, run IDs, latency, cost, formatting, and semantically equivalent file partitioning may
differ when reported explicitly.

## Provider packaging decisions

The sources were checked on 2026-08-13:

- Codex skills use `SKILL.md` and repository discovery under `.agents/skills`; distribution uses
  `.codex-plugin/plugin.json`. See [OpenAI skills](https://developers.openai.com/codex/skills/) and
  [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins).
- Claude Code plugins use `.claude-plugin/plugin.json`, with skills under `skills/<name>/SKILL.md`
  and agents under `agents/*.md`. See [Claude plugin creation](https://code.claude.com/docs/en/plugins)
  and [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference).
- GitHub Copilot supports project skills and custom agents under `.github/skills` and
  `.github/agents/*.agent.md`. See [Copilot Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
  and [custom agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration).
  Prompt files are optional because their support is surface-specific and preview. No synthetic
  Copilot plugin manifest is introduced.

The current boundary allows repository-owned bundles and offline validation only. User/admin
installation, provider execution, marketplace registration, public release, sync, and push require
separate authorization.

## Implementation order

1. Build the provider-neutral Project Intelligence schema and deterministic repository discovery
   against React web, Vue, React Native, no-i18n, and conflicting-router fixtures.
2. Prove stable profiles, evidence paths, confidence/conflict reporting, and absence-safe behavior.
3. Author the two Project Intelligence provider skills and the thin Claude/Copilot agent profiles;
   scaffold the Codex and Claude plugin containers without installing or publishing them.
4. Introduce the provider-neutral phase envelope and evidence handoff types for the Orchestrator.
5. Move one bounded stage at a time behind the new contract and compare it with the golden before
   advancing to the next stage.
6. Package both priority capabilities over the same shared core version and run offline manifest,
   allowlist, and clean-copy discovery checks.

This order makes Project Intelligence the first consumer of the shared provider packaging, then
uses its repository profile as an explicit input to later Orchestrator stages.

## Rollback and evidence

All Wave 1 changes remain local to `claude-workflow-kit` and, when progress rendering changes, the
dashboard feature branch. Rollback uses the verified 2026-08-13 repository snapshots plus normal
local Git commits. No target `.Codex` directory is edited. Each implementation slice must add a
focused test, a negative control, full-regression evidence proportionate to its risk, a durable
evidence file, and immediate updates to both post-17 handoffs.
