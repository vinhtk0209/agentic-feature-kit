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

Version `0.5.0` contains Project Intelligence, fingerprint-bound Stack Portability,
Project-Derived Conditional Quality Gates, the Workflow Orchestrator, and fail-closed Phase Model
Routing over shared core `1.3.0`. Run
`npm run build:providers` to create three self-contained directories, deterministic ZIP archives,
per-bundle content manifests, two source SBOM sidecars, six provider SBOM sidecars, and an exact
11-row `SHA256SUMS` under `dist/provider-bundles/0.5.0/`.

The sidecars use SPDX 2.3 and CycloneDX 1.6, validate offline against the pinned official schemas,
and share one explicit source-date epoch. Source documents describe the reviewed workspace roots and
dependency inventory without claiming runtime reachability. Provider documents contain only packages
proven embedded by the current esbuild metafiles; the expected third-party runtime is
`typescript@4.9.5`.

Before promotion, the final admission gate parses every ZIP from one bounded central-directory
authority, rejects unsupported ZIP features and unsafe/colliding names, verifies local-header,
CRC-32, manifest, expanded-directory, license, notice, SBOM, checksum, and secret parity, and
recaptures all source/output identities. A rejected stage is removed without replacing an existing
qualified release directory.

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
never infer a missing stack. Phase Model Routing accepts only closed, bounded evidence, requires
exact unexpired entitlement and phase qualification, and never executes or silently substitutes a
provider. Installation, marketplace registration, publication, external provider execution, sync,
and push are not performed by repository validation.

## Validation

Run `npm run test:provider-distribution` for strict final admission, deterministic archive and
sidecar bytes, official-schema validation, 11-row checksum integrity, version-sync, and isolated
runtime smoke coverage. Run the provider-specific manifest/skill validators documented
in the evidence before release. Generated archives belong in ignored `dist/`; never edit generated
artifacts as source.

All packages are licensed under Apache-2.0; see the repository root `LICENSE`.
