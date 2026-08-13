# Provider Packages

This directory contains the versioned source packages for Agentic Feature Kit provider adapters.
All product rules, schemas, gate semantics, and evidence validation live in `packages/core`.

| Provider | Source package | Discovery surface |
|---|---|---|
| Codex | `codex/agentic-feature-kit` | `.codex-plugin/plugin.json` + `skills/` |
| Claude Code | `claude/agentic-feature-kit` | `.claude-plugin/plugin.json` + `skills/` + `agents/` |
| GitHub Copilot | `copilot/agentic-feature-kit` | `.github/skills/` + `.github/agents/` |

`provider-bundles.json` pins the shared core and bundle versions. Copilot intentionally has no
invented plugin manifest: its supported distribution unit is the repository customization bundle.

## Development status

Version `0.2.0` contains both Project Intelligence and the Workflow Orchestrator source adapters.
Self-contained archive builds and clean-install smoke tests belong to `P17-008`.
Until that task is complete, use these packages from an Agentic Feature Kit source checkout.

## Security boundary

Project Intelligence is read-only, follows no symlinks, requires one fingerprint-valid envelope,
and stops on unknown or contradictory required signals. Provider adapters cannot weaken those
rules. Installation, marketplace registration, publication, external provider execution, sync,
and push are not performed by repository validation.

## Validation

Run the repository tests plus the provider-specific manifest/skill validators documented in the
evidence for the current wave. Generated archives belong in ignored `dist/`; never edit generated
artifacts as source.

All packages are licensed under Apache-2.0; see the repository root `LICENSE`.
