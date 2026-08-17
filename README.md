# Agentic Feature Kit

[![Workflow Kit CI](https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml/badge.svg)](https://github.com/vinhtk0209/agentic-feature-kit/actions/workflows/workflow-kit-ci.yml)

Agentic Feature Kit is an evidence-backed software delivery toolkit. It packages deterministic,
fail-closed workflow capabilities for Codex, Claude Code, and GitHub Copilot while keeping shared
business rules in one provider-neutral core.

> **Release status:** the source tree has a validated release manifest and provider distributions,
> but it is not yet public-release eligible. Governance, marker remediation, supply-chain gates,
> nightly qualification, and clean-clone evidence remain required before an external release.

## Choose a provider

| Provider | Repository surface | Start here |
|---|---|---|
| Codex | `.codex-plugin/plugin.json` and Agent Skills | [Codex package guide](providers/codex/agentic-feature-kit/README.md) |
| Claude Code | `.claude-plugin/plugin.json`, skills, and read-only agents | [Claude Code package guide](providers/claude/agentic-feature-kit/README.md) |
| GitHub Copilot | `.github/skills` and `.github/agents/*.agent.md` | [GitHub Copilot bundle guide](providers/copilot/agentic-feature-kit/README.md) |

All three archives use `agentic-feature-kit-<provider>-0.5.0.zip` and extract to
`agentic-feature-kit/`. A provider label identifies the discovery surface; it does not expand a
capability beyond the compatibility declared by that package.

## Audience and boundaries

Agentic Feature Kit is designed for:

- external software engineers and technical leads evaluating evidence-backed feature workflows;
- maintainers installing a repository-local package for one of the three provider surfaces;
- contributors extending shared schemas, pure contracts, adapters, fixtures, tests, or docs;
- security reviewers assessing local execution, credentials, evidence, and archive boundaries.

It is not a hosted service, managed control plane, no-code product, or promise of compatibility
with every framework, authentication flow, source system, or enterprise topology. Public source
readiness does not imply an uptime, migration, or response-time SLA.

## Quickstart from a clean clone

Requirements: Git, npm, and Node `>=20`; Node 24 is the qualification runtime pinned by `.nvmrc`.

```bash
git clone https://github.com/vinhtk0209/agentic-feature-kit.git
cd agentic-feature-kit
npm ci
npm run build:providers
npm run test:provider-distribution
```

After dependency installation, the build creates three ignored local archives and SHA-256
checksums under `dist/provider-bundles/0.5.0/`. The distribution test extracts every archive into
an isolated directory and runs all shared capabilities without the source checkout or repository
`node_modules`. A later release slice will measure the complete quickstart on clean Linux and
Windows clones; this README does not claim that timing yet.

These commands do not install into a real user directory, invoke a provider, load credentials, or
perform an external write.

No installation, package publication, marketplace registration, provider execution,
sync, or push is performed by the build/test flow.

## Shared capabilities

Every provider bundle carries the same Node 20+ capability set:

- Project Intelligence
- Stack Portability
- Conditional Quality Gates
- Workflow Orchestrator
- Phase Model Routing

Shared core | 1.3.0

The [shared-core contract and stability guide](packages/core/README.md) owns capability behavior.
The [provider package model](providers/README.md) owns bundle layout, validation, checksums, and the
distribution security boundary. Provider-specific setup and removal stay in the selector guides
above.

## Legacy Claude Code flagship

The repository also retains the mature Claude Code B0–B12 workflow and its slash commands. The npm
compatibility name remains `feature-from-confluence-kit`, and `/feature-from-confluence` remains the
flagship command for turning a spec into convention-compliant, PR-ready code with human gates.

Shared provider packages do not imply flagship workflow parity. They expose the versioned shared
capabilities listed above; they do not claim the complete Claude Code command workflow on Codex or
GitHub Copilot.

The flagship accepts local Markdown, pasted text, PDF, Word, or an optional Confluence connector.
Missing connector configuration does not block the local sources. See the [Claude Code setup
guide](.claude/SETUP.md) for that legacy surface.

The legacy one-way installation path retains its existing guard contract. Real sync is fail-closed:
the current kit version needs a live `verified=true` record, `--force-unverified` requires an
explicit reason, and dirty source also requires `--force-dirty`. That operator path is not part of
the public quickstart and R2 performs no sync.

## Verify from source

```bash
npm test
npm run test:provider-distribution
npm run test:cross-platform-release
npm run check:public-release-contract
```

`npm test` runs the complete integration and drift suite. Provider distribution tests rebuild and
exercise all extracted archives. The cross-platform release gate validates platform-qualified
artifacts. The public-release contract checks the exact Git-index tree and classifications; its
current result is intentionally `contractValid=true` and `candidateStatus=blocked` until later
release work resolves every blocker.

## Version and release model

| Domain | Current authority | Meaning |
|---|---|---|
| Kit/prompt version | `v3.25` | Flagship prompt and repository toolchain version |
| Provider bundle version | `0.5.0` | Provider archive and manifest version |
| Shared core version | `1.3.0` | Provider-neutral capability contract version |

Kit version **v3.25** is the current prompt authority and remains consistent with package version
`3.25.0`.

A kit version does not imply that a provider bundle changed, and a bundle version does not claim
that the complete flagship workflow was requalified. Historical missing tags are not fabricated.
See the [changelog](CHANGELOG.md), [public-release readiness plan](docs/roadmap/p17-018-public-release-plan.md),
and [Apache-2.0 license](LICENSE) for the current authorities. The root npm package remains private;
source-release readiness is separate from package distribution.

## Security and data boundaries

- Never commit `.env` files, tokens, private specifications, user paths, or service credentials.
- Provider archives are built from explicit allowlists and include only repository-local runtime
  sources, schemas, manifests, docs, checksums, and the license.
- Build and verification flows require no provider credential and perform no remote provider or
  data-service action.
- Formal vulnerability-reporting and support policies are a required later release slice. They are
  intentionally not linked before the corresponding files exist.

Do not expose sensitive findings through a public issue while the private reporting policy is
unfinished. The absence of a formal policy is a release blocker, not permission to disclose data.

## Limitations

- The package does not provide a hosted runtime, remote orchestration service, or production SLA.
- Provider bundles expose the shared capabilities listed here, not the entire legacy flagship.
- Optional source connectors need their own configuration and are not required for local inputs.
- Root package visibility remains private, and no package-distribution path is enabled.
- Governance, dependency-license inventory, SBOM, nightly CI, clean-clone timing, and unresolved
  internal-marker dispositions remain outside this slice.

## Documentation map

- [Claude Code developer guide](docs/claude-commands/README.md) — flagship workflow behavior.
- [Integration map](docs/claude-commands/INTEGRATIONS.md) — toolchain wiring and data flow.
- [Token optimization guide](docs/claude-commands/TOKEN-OPTIMIZATION.md) — context and lazy loading.

Provider package and shared-core authorities are linked from their owning sections above so the
root entry does not duplicate their install or API contracts.

## Contribution and support status

Contribution, security, support, and community policies are the next P17-018 implementation slice.
Until those tracked policies and templates exist, treat this repository as an evaluation candidate,
sanitize all reproduction evidence, and do not infer a support SLA or public contribution process.
