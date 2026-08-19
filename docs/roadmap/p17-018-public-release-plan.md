# P17-018 Public Release and GitHub Adoption Plan

**Input status:** Locked (`A1/L1`); implementation and final readiness evidence complete under R6
**Date:** 2026-08-14
**Task:** P17-018

## Outcome

Prepare Agentic Feature Kit for deliberate public source distribution and clean GitHub adoption by
external software-delivery users without publishing a package, changing repository visibility, or
claiming unsupported provider/runtime behavior.

The public entry point must let a new evaluator understand the product, select the correct Codex,
Claude Code, or GitHub Copilot bundle, verify an archive, reach a first local result in under five
minutes after dependency installation, report a vulnerability privately, and contribute without
access to internal Confluence, Supabase, target repositories, or workspace history.

This document locks the audience and engineering license inputs. It is not legal advice and it does
not authorize a public release, marketplace submission, npm publication, push, tag, or visibility
change.

## Decision authority

P17-018's only named readiness gap was `operator decision on intended audience and license`. Both
parts now have durable authority:

- The operator's post-17 objective explicitly requires a kit developed for public users, with
  detailed naming and README quality appropriate for a mature developer tool.
- The repository root `LICENSE` is Apache License 2.0. The accepted provider packaging contract
  states that source artifacts are public-ready under Apache-2.0, and the Codex/Claude manifests
  already declare `Apache-2.0`.

Decision `A1/L1` completes the input gap. P17-009 now supplies accepted remote Linux/Windows and
aggregate release-gate evidence; every P17-018 implementation, verification, and external-release
gate remains in force.

## Audience decision A1

### Primary audience

- External software engineers and technical leads evaluating evidence-backed feature workflows.
- Repository/platform maintainers installing a repository-local provider bundle for Codex, Claude
  Code, or GitHub Copilot.
- Maintainers integrating Project Intelligence, Stack Portability, Conditional Quality Gates,
  Workflow Orchestrator, or Phase Model Routing through the shared core contracts.

### Secondary audience

- Contributors extending provider-neutral schemas, fixtures, adapters, tests, or documentation.
- Security researchers reviewing local execution, credential, evidence, and provider boundaries.
- Tooling evaluators comparing deterministic packaging and cross-platform behavior.

### Explicit non-audience and support boundary

- The repository is not a hosted SaaS, managed control plane, or turnkey no-code product.
- It does not promise compatibility with every framework, provider feature, authentication flow,
  source system, or enterprise topology.
- Public source availability does not include an uptime, response-time, migration, or production
  support SLA.
- Marketplace consumers remain outside the audience until each provider submission is separately
  approved and verified.

## License decision L1

Retain **Apache-2.0** for repository source, documentation, shared-core code, generated runtime
sources, and provider distribution bundles.

- Every source and binary/source archive includes the root `LICENSE` byte-for-byte.
- Modified redistributions must preserve required notices and mark changed files as required by the
  license. Contributions intentionally submitted for inclusion follow Apache-2.0 section 5 unless a
  separately published contribution agreement says otherwise.
- The license grants no trademark permission. `Agentic Feature Kit`, provider names, and logos may
  describe compatibility but must not imply endorsement by OpenAI, Anthropic, GitHub, or Microsoft.
- A dependency/license inventory must determine whether a `NOTICE` or third-party notices file is
  required. Absence of a current `NOTICE` is not proof that none is needed.
- No re-licensing, dual licensing, CLA, trademark policy, or commercial support promise is inferred.
- Legal review remains the operator's responsibility before an actual public release; engineering
  readiness does not claim jurisdiction-specific compliance.

## Current-state reconciliation

| Area | Current evidence | Release gap or preserved boundary |
|---|---|---|
| Product identity | Provider IDs, manifests, registry, archive roots, and repository URL use `agentic-feature-kit`. | Root README/package description still lead with a Claude-specific `feature-from-confluence` identity. |
| License | Root Apache-2.0 text; Codex/Claude manifests and provider docs declare Apache-2.0. | Root package metadata omits `license`; third-party notice need has not been proven. |
| Distribution | Three deterministic `agentic-feature-kit-<provider>-<bundleVersion>.zip` archives, checksums, manifests, and isolated runtime smokes. | Generated archives are local/ignored; no authorized GitHub Release or provenance attestation exists. |
| Package metadata | Node engine is `>=20`; `.nvmrc` pins 24; root package is intentionally `private: true`. | Root metadata omits repository, homepage, bugs, keywords, and a provider-neutral description. |
| Main README | CI badge, requirements, provider table, setup, tests, security note. | No audience map, clean-clone quickstart, support/contribution links, release/version model, limitations, or complete provider-neutral navigation. |
| Governance | `CHANGELOG.md` exists. | `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, Code of Conduct, issue templates, and PR template are absent; changelog stops at 3.18 while current authority is 3.25. |
| CI | Linux/Windows PR and `develop`/`main` push matrix plus aggregate release gate. | No `schedule`, manual nightly dispatch, documentation link gate, release-manifest gate, or nightly status surface. |
| Tags | Historical `v3.17` and `v3.18` tags; prompt/package authority is now 3.25. | Later version tags/releases are absent; history must not be fabricated or rewritten. |
| Public-data boundary | Provider archives use explicit content allowlists and exclude secrets. | Tracked source/docs still include workspace target names, customer/project examples, a local user temp path, and hardcoded project-specific Supabase URLs/refs. |

The internal-marker inventory is a release blocker, not an instruction to erase historical evidence
blindly. Each occurrence must be classified as genericized public documentation, moved to an
excluded private archive, replaced with a synthetic fixture, or retained only after explicit review.

## Product and naming contract

- Canonical public display name: **Agentic Feature Kit**.
- Canonical repository and manifest slug: `agentic-feature-kit`.
- Stable provider IDs: `codex`, `claude`, and `copilot`.
- Stable archive name: `agentic-feature-kit-<provider>-<bundleVersion>.zip`.
- Stable extracted root: `agentic-feature-kit/`.
- Stable capability IDs remain `project-intelligence`, `stack-portability`,
  `conditional-quality-gates`, `workflow-orchestrator`, and `phase-model-routing`.
- `feature-from-confluence-kit` remains a legacy/internal npm package identity while the package is
  `private: true`. Do not silently rename it; any future npm/public package rename requires a major
  compatibility decision and separate publication authorization.
- Provider names are compatibility labels. Public prose says “for Codex”, “for Claude Code”, or
  “for GitHub Copilot”, never “official”, “endorsed”, or provider-equivalent without evidence.

## Version and release model

The repository has three intentionally independent version domains:

1. **Kit/prompt version** — `v<major>.<minor>` in `PROMPT_VERSION`; package metadata mirrors it as
   `<major>.<minor>.0`. Existing public tag style is `v<major>.<minor>` and must remain stable unless
   a separately reviewed migration is approved.
2. **Provider bundle version** — semantic version in `providers/provider-bundles.json` and all
   provider manifests/archive names.
3. **Shared core version** — semantic version in the provider registry and bundle manifest.

A release note must state all three. A kit tag never implies a provider bundle changed; a bundle
version never claims the full flagship workflow was requalified. Historical missing tags are
documented as missing and are not backfilled without evidence.

Root `package.json` remains `private: true`. GitHub source/archive readiness is separate from npm
package publication. `npm publish`, provider marketplace submission, GitHub Release creation, tag
creation, signing, and repository visibility changes each remain separate authorized actions.

## Documentation architecture

Follow a link-first hierarchy so contracts have one owner:

- `README.md` — provider-neutral product outcome, audience, five-minute clean-clone quickstart,
  provider selector, support/security links, release status, limitations, and documentation map.
- `providers/README.md` — shared provider-package model, current bundle/core versions, checksums,
  security boundary, and links to provider-specific guides.
- `providers/<provider>/agentic-feature-kit/README.md` — exact install/discovery/use/uninstall and
  provider compatibility; no duplicated business rules.
- `packages/core/README.md` — public API/capability contracts, stability, and integration examples.
- `CONTRIBUTING.md` — development setup, architecture boundaries, plan/readiness rule, test ladder,
  commit/PR expectations, generated-file rules, and evidence requirements.
- `SECURITY.md` — supported versions, private GitHub Security Advisory reporting path, expected
  report contents, safe-harbor wording, response targets explicitly labeled best-effort, and public
  disclosure coordination.
- `SUPPORT.md` — questions/bugs/security routing, required reproduction/evidence, no-SLA boundary,
  and unsupported use cases.
- `CODE_OF_CONDUCT.md` — an explicitly versioned, attributed community conduct policy.
- `CHANGELOG.md` — current entries for every released kit version; unreleased work stays under
  `Unreleased` and is never retroactively described as shipped.
- `docs/architecture/` and `docs/releasing/` — clean architecture/data flow and maintainer runbooks;
  link existing authoritative design/evidence instead of copying it.

Every public command example must be runnable from a clean clone or extracted bundle. Internal
workspace paths, target repository names, private hostnames, real project references, local user
paths, or credential-bearing `.env` examples are forbidden.

## Governance, support, and security boundary

- Use GitHub Issues for reproducible bugs and bounded feature requests; route usage questions to
  GitHub Discussions only after that surface is enabled.
- Security reports use GitHub Private Vulnerability Reporting/Security Advisories. Do not direct
  reporters to a personal or internal corporate email in committed public docs.
- Issue forms capture version, provider, OS, Node version, minimal reproduction, expected/actual
  result, and sanitized evidence. They must warn against secrets and private specs.
- Pull requests require a linked plan/task, scope, tests/evidence, generated-drift result, security
  impact, compatibility note, and explicit declaration of external writes.
- `CODEOWNERS` may be added only when stable public maintainer identities are approved. Do not
  expose internal team aliases or create an unmaintained ownership claim.
- Public contribution does not bypass the input-readiness, clean-architecture, source-of-truth,
  no-target-edit, sync, verification, or evidence rules.

## CI, nightly, and failure visibility

P17-009 has proven the current Windows/Linux workflow through real remote run `31827980057`.
P17-018 adds a public-adoption workflow without weakening that matrix:

- PR/push: Node 24, `npm ci`, full kit, provider distribution, roadmap/claim/version/drift gates,
  documentation link check, release-manifest allowlist, license/secret/internal-marker scans.
- Nightly: `schedule` plus `workflow_dispatch`, the same Linux/Windows matrix, no provider
  credentials, no external provider execution, no Supabase write, and no release publication.
- Nightly failure visibility: a stable workflow badge/link and job summary. The workflow retains
  read-only repository permissions and does not auto-create issues or mutate the repository.
- Release candidate: clean-clone qualification, deterministic provider archives from two isolated
  builds, checksum comparison, dependency/SBOM/license inventory, and an aggregate fail-closed gate.
- Actual authorized release: build only from the exact tag commit; attach SHA256SUMS, SBOM,
  provenance/attestation where supported, and release notes mapping kit/bundle/core versions.

GitHub Actions must be pinned to reviewed immutable commit SHAs before the first public release.
Dependabot or Renovate may propose updates, but no bot receives release, secret, or write authority
by default.

## Clean-clone and package contract

The highest local authenticity tier uses a fresh `git clone --no-hardlinks` of the exact committed
source, not the dirty development tree:

1. Verify Node 24 and npm lockfile compatibility.
2. Run `npm ci` with lifecycle behavior documented and bounded.
3. Run the full test suite and documentation/release gates.
4. Build provider bundles twice in isolated roots and require byte-identical archives/checksums.
5. Extract each archive into a clean directory with no monorepo `node_modules` and run all shared
   runtime smokes.
6. Verify `LICENSE`, manifest, README, schemas, runtime, checksums, and only allowlisted paths.
7. Verify quickstart and uninstall instructions for each provider without installing into real user
   or admin directories.

The public repository release manifest must fail closed on unknown files and explicitly exclude
`.env`, credentials, local backups, target repositories, generated `dist`, `node_modules`, private
evidence, and workspace-only configuration.

## Supply-chain and provenance boundary

- The committed lockfile is authoritative; release CI uses `npm ci`, never an unlocked install.
- Generate an SPDX or CycloneDX SBOM for the exact release tree and provider archives.
- Run dependency license review and secret scanning before archive creation and again on final
  artifacts. A passing source scan cannot substitute for an archive scan.
- Bind release notes, archive manifest, SHA256SUMS, SBOM, and attestation to the exact commit/tag.
- Deterministic bundle hashes prove byte identity, not publisher identity. Provenance/signing is a
  separate release control.
- A compromised, missing, stale, or partial artifact fails the aggregate release gate; never upload
  the surviving subset as a complete release.

## Compatibility and deprecation policy

- Supported runtime is Node `>=20`; CI/release qualification uses Node 24. Any lower-bound change is
  a documented breaking compatibility decision.
- Provider surfaces and official-source claims are versioned and audited. Preview surfaces remain
  explicitly labeled and cannot become required silently.
- Shared-core contracts use semantic versions. Breaking schema/CLI/sentinel changes require a major
  version and migration notes; additive optional fields require exact-schema versioning.
- Deprecations name the replacement, first deprecated version, final supported version, and test
  proving the warning. Removal without a prior supported migration is forbidden.
- Public release notes distinguish implemented, locally verified, remotely verified, preview,
  input-blocked, and not supported.

## Edge cases and failure modes

- Fresh clone on Windows paths with spaces or Unicode; CRLF checkout; path-length limits.
- Offline provider runtime after archive extraction; absent provider CLI; provider feature drift.
- Missing/corrupt lockfile, partial npm cache, install-script failure, or unsupported Node version.
- Broken relative links, case-only path mismatch, stale anchors, renamed docs, and external link
  timeout that must not hide internal-link failure.
- Archive traversal, symlink/reparse entries, duplicate/case-colliding names, unknown files,
  nondeterministic timestamps, checksum mismatch, or missing license.
- Secret/internal marker inside source, generated runtime, archive, README example, evidence, SBOM,
  source map, or workflow log.
- Scheduled workflow disabled, skipped, permission-denied, matrix-partial, stale badge, or aggregate
  gate running without all platform artifacts.
- Repository public while docs still point to private Confluence/Supabase/target resources.
- Package visibility accidentally changed from `private: true`, npm token present, or publication
  command reachable from ordinary PR/nightly CI.
- Security report path unavailable or pointing to personal/internal identity.
- Tag/version/bundle/core/changelog mismatch and historical tag gaps misrepresented as releases.

## Implementation plan

Implementation may now start because P17-009 provides accepted remote Windows/Linux evidence.

1. Checkpoint this plan/readiness transition separately.
2. Add a release-manifest contract and internal/private marker classification with positive and
   negative fixtures; do not scrub evidence ad hoc.
3. Make root product metadata and README provider-neutral while preserving version-check authority,
   provider IDs, archive names, and legacy package compatibility.
4. Add governance/support/security/community files and current changelog/release notes.
5. Add documentation link, license, package allowlist, SBOM/dependency, secret, internal-marker,
   archive, and clean-clone gates.
6. Add nightly/manual CI while preserving P17-009's proven matrix, read-only permissions, and no
   external provider/database/release action.
7. Run clean-clone Linux/Windows evidence, deterministic double-build, extracted runtime smokes,
   and documentation quickstart/browser checks.
8. Complete P17-018 only when all local and authorized remote evidence is durable. Keep repository
   visibility, tag, GitHub Release, marketplace, npm, sync, and push as separately authorized acts.

## Verification and evidence ladder

1. Plan validator: audience/license authority, headings, naming/version boundaries, current gaps,
   implementation dependency, external-action prohibition, and roadmap readiness state.
2. Focused source gates: release manifest, metadata/docs links, governance contracts, changelog,
   nightly workflow static validation, action pinning, package allowlist, and attack fixtures.
3. Full local kit regression, TypeScript where applicable, diff check, and positive-control secret/
   internal-marker scans over exact changed files and built artifacts.
4. Clean committed clone on Windows and Linux, two deterministic builds, all extracted provider
   runtime smokes, and quickstart/link verification.
5. Authorized GitHub Actions PR/nightly evidence with complete matrix artifacts and aggregate gate.
6. Durable final evidence at `docs/evidence/post-17-public-release-readiness.md` plus dashboard
   reconciliation. No public artifact is required or authorized to prove readiness.

## Rollback and external-action boundary

- Documentation/governance/release gates are additive and can be reverted to the input checkpoint.
- Nightly workflow can be disabled without changing runtime/provider behavior.
- A failed release-manifest migration restores the pre-change source from the verified daily backup;
  never leave a half-scrubbed tree or delete evidence without a reviewed classification.
- Root `private: true`, provider IDs, archive names, version authorities, and existing release gates
  remain compatibility anchors unless a separate migration is approved.
- No sync, push, tag, release, visibility change, npm publish, marketplace submission, provider run,
  credential use, or external database write is authorized by this plan.

## Completion boundary

P17-018 readiness is complete because `A1/L1` are locked, all dependencies remain done, the R1–R5D
implementation ladder is durable, and R6 admits the final evidence at
`docs/evidence/post-17-public-release-readiness.md` together with dashboard reconciliation. P17-018
is therefore `done`. “Public-ready” means an
authorized operator can publish the exact proven commit without discovering an undocumented
audience, license, security, packaging, privacy, or onboarding decision; it does not mean any
artifact or repository has already been made public.
