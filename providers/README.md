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

Version `0.4.0` contains Project Intelligence, fingerprint-bound Stack Portability,
Project-Derived Conditional Quality Gates, and the Workflow Orchestrator over shared core `1.2.0`. Run
`npm run build:providers` to create three self-contained directories, deterministic ZIP archives,
per-bundle content manifests, and `SHA256SUMS` under `dist/provider-bundles/0.4.0/`.

Each extracted bundle includes bundled Node 20+ launchers under `runtime/`; it does not need `tsx`,
the monorepo, or repository `node_modules`. Validate `SHA256SUMS` before extraction, then follow the
provider README. Building is local and offline after dependencies are installed; it never installs,
publishes, syncs, pushes, or invokes an external provider.

## Security boundary

Project Intelligence is read-only, follows no symlinks, requires one fingerprint-valid envelope,
and stops on unknown or contradictory required signals. Provider adapters cannot weaken those
rules. Stack Portability uses only explicit declarations or observed imports/calls, binds its result
to the profile fingerprint, and never activates Open edX helpers from package presence alone.
Conditional gates inspect bounded caller-supplied change evidence, cite every decision, and
never infer a missing stack. Installation, marketplace registration, publication, external provider execution, sync,
and push are not performed by repository validation.

## Validation

Run `npm run test:provider-distribution` for deterministic archive, content-integrity, version-sync,
and isolated runtime smoke coverage. Run the provider-specific manifest/skill validators documented
in the evidence before release. Generated archives belong in ignored `dist/`; never edit generated
artifacts as source.

All packages are licensed under Apache-2.0; see the repository root `LICENSE`.
