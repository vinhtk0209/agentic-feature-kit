# Agentic Feature Kit for Codex

This directory is a Codex plugin source package. Release ZIPs add a self-contained Node 20+ runtime,
schemas, contracts, license, and a content-addressed `bundle-manifest.json` without changing the
plugin discovery layout.

## Verify and use

1. Verify the release ZIP against the adjacent `SHA256SUMS` entry.
2. Extract it and keep `agentic-feature-kit/` as the plugin root; `.codex-plugin/plugin.json` must
   remain directly below that root.
3. Add that root to a configured local or team marketplace, or place it under the standard personal
   marketplace's `plugins/agentic-feature-kit` source path. Use Codex's supported plugin UI/CLI for
   that marketplace; do not copy only the `skills/` directory.
4. Verify local runtime availability without provider execution:
   `node runtime/project-intelligence.cjs <repository-root>`, then
   `node runtime/stack-portability.cjs <repository-root>`, and pipe a JSON request to
   `node runtime/conditional-quality-gates.cjs`, `node runtime/workflow-orchestrator.cjs resume`,
   or `node runtime/phase-model-router.cjs route`.
5. Restart or open a new Codex task after installation so discovery is refreshed.

The package does not modify marketplace configuration automatically and contains no credentials,
hooks, MCP servers, or standalone-agent manifest. Both skills call one bundled shared core.

The Codex source package exposes evidence-backed Project Intelligence as an Agent Skill. It profiles
the repository, then resolves framework layout and transport/mapping conventions through the
fingerprint-bound Stack Portability contract so Codex does not guess target-specific helpers.

## Release status

| Contract | Value |
|---|---|
| Bundle version | `0.5.0` |
| Shared core version | `1.3.0` |
| Runtime | Self-contained Node.js 20+ CommonJS launchers |
| License | Apache-2.0 |
| Distribution stage | Deterministic directory + ZIP archive |

The release directory and ZIP are self-contained and covered by clean-copy runtime smoke tests. The
source package in this repository intentionally omits generated runtime files; create them with
`npm run build:providers`.

## Package layout

```text
.codex-plugin/plugin.json
skills/project-intelligence/SKILL.md
skills/project-intelligence/agents/openai.yaml
skills/workflow-orchestrator/SKILL.md
skills/workflow-orchestrator/agents/openai.yaml
runtime/project-intelligence.cjs
runtime/stack-portability.cjs
runtime/conditional-quality-gates.cjs
runtime/workflow-orchestrator.cjs
runtime/phase-model-router.cjs
docs/schemas/*
docs/roadmap/post-17-orchestrator-*.json
docs/roadmap/post-17-phase-capability-matrix.json
bundle-manifest.json
LICENSE
THIRD_PARTY_NOTICES.md
licenses/typescript-LICENSE.txt
README.md
```

Codex discovers the skill through the plugin manifest. No standalone Codex agent manifest is
invented: the skill uses the host's normal bounded agent capabilities when the user requests them.

## Source-checkout verification

From the Agentic Feature Kit repository root:

```bash
npm ci
npx tsx packages/core/src/project-intelligence.ts <repository-root>
npm run test:project-intelligence
npm run test:stack-portability
npm run test:conditional-quality-gates
npm run test:phase-model-router
npm run test:phase-model-router-cli
npm run test:provider-bundles
npm run test:provider-distribution
```

The profiler emits one `@@PROJECT_PROFILE@@` JSON envelope. Exit `0` means the profile is ready;
exit `1` means the profile is valid but needs input (or inspection failed safely); exit `2` means
the CLI arguments are invalid. Provider instructions must not parse ad-hoc text or bypass the
runtime validator.

Stack Portability then emits one `@@STACK_PORTABILITY@@` schema `1.0.0` envelope bound to the
profile fingerprint. It selects only declared or observed framework/HTTP/mapping adapters, reports
target-specific assumptions, and returns `needs_input` rather than inventing an unavailable helper.

The Workflow Orchestrator then uses bounded stdin JSON and one `@@ORCHESTRATOR_RESULT@@` response to
create or validate phase envelopes, resume from a verified prefix, and compare semantic conservation
against the sanctioned golden. It never turns a provider action smoke into completion evidence.

The Phase Model Router accepts one closed `{ matrix, request, candidates }` object and emits one
`@@PHASE_MODEL_ROUTING@@` envelope. A B0 request without exact phase qualification exits `1` with
`needs_input`; a model-forbidden B0.5 request exits `0` with `no_model`; only an independently
qualified synthetic or future P17-007 candidate can return `selected`. Selection never executes a
provider, grants a gate, or permits an automatic fallback. See the two phase-routing schemas for
the exact request and decision shapes.

The Conditional Quality Gates runtime consumes the validated profile and bounded changed-file
evidence. It emits one `@@CONDITIONAL_GATES@@` envelope and activates i18n, router, or style checks
only when the profile proves that system exists. Unknown/conflicting profiles cannot pass.

## Failure and security behavior

- Repository inspection is read-only and does not use network credentials.
- Symlinks are not followed; build/dependency folders are excluded from bounded traversal.
- Unknown framework signals and contradictory router/package-manager signals block planning.
- Missing, duplicate, extra, malformed, or fingerprint-invalid envelopes are hard failures.
- Unknown, expired, mismatched, or unqualified model evidence fails closed before provider use.
- The skill must not recreate framework detection rules in prompt text.
- Installation, marketplace registration, sync, push, and provider execution are outside tests.

## Compatibility

The source package is validated against the local Codex plugin ingestion contract with the official
plugin and skill validators. Canonical source remains in `packages/core`; release launchers are
generated from that source, and the adapter contains discovery metadata and invocation policy only.

See [`providers/README.md`](../../README.md) for the cross-provider version contract and the
repository root `LICENSE` for Apache-2.0 terms.
