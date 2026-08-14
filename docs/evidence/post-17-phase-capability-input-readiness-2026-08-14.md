# P17-006 phase-capability input readiness — 2026-08-14

## Verdict

The provider-neutral phase capability input is complete and P17-006 may move from `backlog` to
`ready`. This verdict authorizes design planning only. It does not claim that any configured model
is currently phase-qualified, does not enable automatic routing, and does not authorize a provider
run, credential access, installation, publication, sync, or push.

## Reconciled inputs

- `docs/roadmap/post-17-orchestrator-boundaries.json` supplies the exact 24 mandatory and
  conditional phase contracts, stage ownership, inputs, outputs, and gate types. Matrix binding:
  SHA-256 `56edbe192eac7ff7fcff39031e1cac923d3a18349027611beabe6389685e7c71`.
- `docs/roadmap/post-17-orchestrator-golden.json` supplies the same-input conservation and trusted
  gate/evidence boundary. Matrix binding: SHA-256
  `5c8e446ad17874b68d221809540c9a4ca3436c73382b27a0f365c367431d34e2`.
- `.claude/integrations/model-config.ts` and the dashboard runner catalog are treated only as local
  configured inventory. Their hashes are bound in the matrix; neither file proves entitlement or
  phase quality.
- The 2026-08-11 Codex and GitHub Copilot canaries prove bounded transport and then-current exact
  entitlement for selected tuples. They are explicitly classified as `runtime-entitled`, not
  `phase-qualified`. Claude and Gemini remain configured-only in this snapshot.
- Current dashboard performance aggregation is by runner + kit version. It cannot support a
  phase-aware quality/cost/latency ranking because it is not keyed by phase, phase-contract hash,
  model, effort, and adapter capability hash.

## Locked input decisions

1. Phase requirements contain no provider or model names. Decision authority, model use, model
   capabilities, runtime permissions, and exact gate bindings are separate dimensions.
2. A route requires `phase-qualified` evidence for the exact phase-contract and adapter capability
   hashes. Official documentation, configuration, and runtime entitlement are lower independent
   tiers.
3. Unknown or expired capability, entitlement, provenance, context fit, quality, cost, or latency
   returns `needs_input` before provider execution.
4. A fallback must be independently phase-qualified, preserve all gates/artifact/evidence
   semantics and the permission ceiling, and be recorded explicitly before retry. Silent provider
   substitution is forbidden.
5. The performance optimizer starts disabled. It may become a tie-breaker only after each candidate
   has at least five comparable completed observations on the same phase/contract/capability key;
   correctness and gate conservation remain hard filters.
6. Official model documentation is volatile advisory input with a seven-day expiry. Runtime
   entitlement and exact resolved identity still require local, credential-safe probes.

## Official source ledger

The matrix records fetch and expiry dates for these primary sources:

- OpenAI model guidance: `https://developers.openai.com/api/docs/guides/latest-model`
- Anthropic model overview: `https://platform.claude.com/docs/en/about-claude/models/overview`
- Claude Code CLI reference: `https://docs.anthropic.com/en/docs/claude-code/cli-usage`
- GitHub Copilot supported models:
  `https://docs.github.com/en/copilot/reference/ai-models/supported-models`
- GitHub Copilot CLI programmatic reference:
  `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference`
- Gemini Models API: `https://ai.google.dev/api/models`
- Gemini CLI configuration:
  `https://google-gemini.github.io/gemini-cli/docs/get-started/configuration.html`

No documentation claim is promoted to local availability or phase quality.

## Executable evidence

```text
npm run test:post-17-phase-capabilities
post-17-phase-capability-matrix.test: PASS
24 phases, 7 official sources, 13 negative controls
exit 0

npm test
full kit regression, including test:post-17-phase-capabilities
exit 0 in 210.5 seconds

git diff --check
exit 0

changed-file secret-pattern scan
positive control: true; hits: 0
```

Final matrix SHA-256: `aaaac3906f94bb1903e13d8e10b8e4a25cded3be67f7a2da432eb7a9fa414971`.

The negative controls reject a missing or duplicate phase, weakened B9 gate, provider-coupled phase
requirements, unknown capability, model invocation in a deterministic phase, a lowered evidence
tier, source hash drift, expired official input, prematurely enabled optimizer, silent fallback,
missing B11 verifier isolation, and an unqualified candidate marked routable.

## Remaining boundary

P17-006 implementation has not started. The next allowed step is a system-design plan for a pure,
fail-closed policy engine and explicit provider-config ports. No production candidate becomes
routable until it has fresh exact phase qualification; P17-007 owns normalized cross-provider
same-input evidence rather than transport-smoke promotion.
