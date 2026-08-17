# P17-018 R2 — Provider-Neutral Public Entry Plan

**Date:** 2026-08-17
**Task:** P17-018, implementation step 3 only
**Decision lock:** `slice=R2, identity=I1, metadata=M1, readme=D1, links=L1, compatibility=C1, privacy=P1, evidence=E1`

## Outcome

Give an external software-delivery evaluator one provider-neutral repository entry point for
Agentic Feature Kit. The root package metadata and README will describe the shared outcome first,
route readers to the Codex, Claude Code, or GitHub Copilot package, and make the legacy Claude Code
flagship boundary explicit without renaming it or overstating public-release readiness.

R2 is documentation and metadata work. It neither resolves the 31 marker dispositions discovered
by R1 nor completes the governance, supply-chain, nightly, clean-clone, or authorized-release
steps that follow it.

## Reconciled starting state

- Exact starting evidence head is `cbf645c152ac3cd251c723dda0a86af21861316f`; PR #5 is open and
  its Linux, Windows, and aggregate Workflow Kit CI jobs are green.
- The root README heading and package description still lead with the Claude-specific
  `feature-from-confluence` workflow even though three provider bundles now expose five shared
  capabilities.
- The README has a provider table and current build boundary, but no explicit audience map,
  clean-clone quickstart, release/version model, limitations section, or provider-neutral
  documentation map.
- The README currently gives workspace sync, dashboard, and historical database details a root
  navigation position. Those topics are not the first decision an external evaluator needs.
- Root `package.json` is `feature-from-confluence-kit@3.25.0`, `private: true`, Node `>=20`, with
  the `workflow` bin. It lacks `license`, `repository`, `homepage`, `bugs`, and `keywords`, and its
  description names only Claude Code.
- Root `README.md` and `package.json` are already included by the R1 manifest and have no classified
  marker occurrence binding. Unknown tracked paths fail closed through the R1 release manifest.
- Formal `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, and community templates do not exist and
  remain implementation step 4, not hidden R2 dependencies.
- Today's backup is verified: tag `backup/2026-08-17` resolves to
  `38888187c4191206dbb81562ccb387463fcbbc76`, and the kit snapshot SHA256 is
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`.

## Scope and non-goals

R2 owns only:

1. provider-neutral root package metadata;
2. a reader-first root README and clean-clone command path;
3. repository-relative root navigation that resolves against the exact candidate tree;
4. explicit compatibility and not-yet-public-ready language;
5. a focused plan gate, a focused content/attack gate, manifest updates, and durable evidence.

R2 does not add governance/community files, update the changelog, add nightly CI, generate an SBOM,
perform dependency-license review, execute clean-clone qualification, remediate classified markers,
change provider sources or shared runtime code, rename the package, enable npm publication, publish
an artifact, create a tag or release, alter repository visibility, sync to targets, merge a PR, use
credentials, write a database, or edit a dashboard.

## Locked R2 decisions

### I1 — Agentic Feature Kit is the root public identity

The canonical public display name is Agentic Feature Kit. Root prose starts with the shared
software-delivery outcome and then routes to provider-specific packages. Provider names are
compatibility labels only; the README must not say official, endorsed, equivalent, or provider
owned.

Provider IDs remain `codex`, `claude`, and `copilot`. Archive names remain
`agentic-feature-kit-<provider>-<bundleVersion>.zip`. The display name, provider IDs, and archive
grammar must agree with the R1 manifest and provider packaging authority.

### M1 — Package metadata is complete but remains private

The legacy package name remains `feature-from-confluence-kit`. Root package remains `private: true`.
Version `3.25.0`, CommonJS type, Node `>=20`, the `workflow` bin, scripts, dependencies, and package
lock authority are preserved.

R2 adds the exact public-source metadata fields `repository`, `homepage`, `bugs`, `license`, and
`keywords`, and replaces only the description with provider-neutral wording. The values are:

```text
description = Evidence-backed agentic software-delivery toolkit with deterministic bundles for Codex, Claude Code, and GitHub Copilot.
license = Apache-2.0
repository.type = git
repository.url = git+https://github.com/vinhtk0209/agentic-feature-kit.git
homepage = https://github.com/vinhtk0209/agentic-feature-kit#readme
bugs.url = https://github.com/vinhtk0209/agentic-feature-kit/issues
keywords = agentic-workflow, software-delivery, codex, claude-code, github-copilot, developer-tools
```

These fields describe the intended repository identity. They do not change package visibility or
authorize `npm publish`.

### D1 — README is a provider-neutral decision tree

The root README answers these questions in order:

1. What is Agentic Feature Kit and what result does it produce?
2. Is the reader an evaluator, provider-package maintainer, contributor, or security reviewer?
3. Which provider package should the reader select?
4. How does a clean clone produce a first local result?
5. Which shared capabilities and provider-specific surfaces are included?
6. How is the legacy Claude Code flagship different from shared provider-neutral capabilities?
7. Which verification commands and version domains apply?
8. What is not yet supported or release-ready?
9. Where is each authoritative document?

The root document links instead of duplicating provider install/uninstall detail or shared-core API
contracts. Formal governance, support, and security policy links remain deferred until their files
exist; R2 must never introduce knowingly broken placeholder links.

### L1 — Root links are repository-relative and fail closed

Every repository-relative README link resolves to a tracked file or directory with exact case.
Fragment-only links resolve to a unique README heading. External URLs are limited to the repository
CI badge and canonical repository metadata in R2; network reachability is not claimed by the focused
offline gate.

The focused gate rejects traversal, absolute host paths, Windows drive paths, `file:` URLs, private
hostnames, workspace-only target references, missing paths, case-only aliases, and links to the
separate dashboard workspace.

### C1 — Legacy package and flagship compatibility are explicit

The Claude Code `feature-from-confluence` flagship and slash commands remain supported repository
content, but they move under a clearly labeled legacy flagship section. The README states that
shared provider packages do not imply flagship workflow parity. No command, path, manifest, archive
root, provider ID, package name, version authority, or compatibility promise changes in R2.

### P1 — Public prose carries no workspace-only dependency

The root README must be usable without internal Confluence, Supabase, dashboard, target repository,
or workspace history access. Confluence may appear only as an optional spec-source connector for the
legacy flagship. Credential examples use placeholders and never real projects, hosts, tokens, user
paths, or target names.

The root README must not claim public-ready, published, official, endorsed, or marketplace
availability. It must state that release-manifest classification is valid but public-release
eligibility remains blocked pending later P17-018 gates.

### E1 — Evidence and publication remain separate

R2 uses local tests, one source commit, one metadata-only evidence commit, a stacked feature PR, and
authorized remote CI. These prove the public-entry slice only. They do not authorize or perform a
public release, package publication, tag, repository visibility change, provider installation,
sync, merge, or any other external write beyond the separately authorized feature branch and PR.

## README information architecture

The rewritten root README uses this exact high-level architecture:

1. `# Agentic Feature Kit`
2. release-status callout and CI badge;
3. `## Choose a provider`;
4. `## Audience and boundaries`;
5. `## Quickstart from a clean clone`;
6. `## Shared capabilities`;
7. `## Legacy Claude Code flagship`;
8. `## Verify from source`;
9. `## Version and release model`;
10. `## Security and data boundaries`;
11. `## Limitations`;
12. `## Documentation map`;
13. `## Contribution and support status`.

The provider selector links to the three tracked provider READMEs and `providers/README.md`. Shared
capabilities link once to `packages/core/README.md`. Version and release text links to `CHANGELOG.md`
and the parent P17-018 plan. The license link resolves to `LICENSE`.

## Package metadata contract

The focused content gate parses `package.json` and rejects:

- a changed legacy name, version, CommonJS type, Node lower bound, bin path, or `private` boundary;
- absent, unexpected, or malformed public metadata fields;
- a non-Apache license identifier;
- non-HTTPS homepage/bugs URLs or a repository URL outside the canonical repository;
- reordered, duplicated, blank, provider-missing, or marketing-only keywords;
- any `publishConfig`, npm-token reference, prepublish/publish script, or ordinary-CI publication
  reachability;
- package-lock identity drift caused by an unnecessary lockfile rewrite.

## Clean-clone quickstart contract

The clean-clone path is intentionally small and cross-platform:

```bash
git clone https://github.com/vinhtk0209/agentic-feature-kit.git
cd agentic-feature-kit
npm ci
npm run build:providers
npm run test:provider-distribution
```

`npm ci` installs the committed lockfile. The first local result after dependency installation is
three deterministic provider archives plus their checksums, followed by isolated extracted-runtime
smokes. R2 verifies that every command exists and that the documented artifact pattern matches the
provider packaging authority. It does not claim a measured five-minute result until the later
clean-clone evidence slice runs on both Linux and Windows.

No quickstart command installs into a real user directory, calls a provider, loads credentials,
writes Supabase, syncs targets, publishes a package, or mutates the repository beyond ignored build
output.

## Clean Architecture and ownership

- Root `package.json` owns npm/repository metadata and preserves the legacy package compatibility
  boundary.
- Root `README.md` owns only entry-point decisions and navigation.
- `providers/README.md` owns shared bundle/distribution semantics.
- `providers/<provider>/agentic-feature-kit/README.md` owns exact provider install/use/uninstall
  guidance.
- `packages/core/README.md` owns shared capability contracts and stability.
- `docs/roadmap/p17-018-public-release-plan.md` owns the complete release-readiness ladder.
- `release/public-release-manifest.json` owns the exact candidate tree.
- `scripts/public-entry-contract.test.ts` is the focused R2 reader/metadata/link attack gate; it
  does not become the full step-5 documentation-link or release qualification implementation.

TypeScript and Node remain the measured implementation choice because R2 parses two small text/JSON
documents and the existing test/runtime stack is already Node-based. Rust, Go, or Python would add
a toolchain without a measured latency, memory, binary-distribution, or API capability gap.

## Threat model and attack matrix

| Attack or drift | Required result |
|---|---|
| Claude/Confluence-specific root title or description | Reject |
| Missing canonical display name or provider-neutral outcome | Reject |
| Provider ID/order, bundle version, or archive grammar drift | Reject |
| Legacy package rename or `private: false` | Reject |
| Missing/malformed repository, homepage, bugs, license, keywords | Reject |
| `publishConfig`, publish lifecycle, token, marketplace, official, or endorsement claim | Reject |
| Missing audience, quickstart, legacy boundary, release model, limitations, or docs map | Reject |
| Quickstart command absent from package scripts | Reject |
| Internal workspace/dashboard/target/database path in root entry | Reject |
| Absolute, traversal, missing, case-mismatched, or duplicate relative link | Reject |
| Placeholder governance link before its target exists | Reject |
| README claims the repository or package is already public-ready/published | Reject |
| New plan/test/evidence path missing from the R1 manifest | Reject |
| R1 candidate changes from unresolved-only blocked status | Reject |
| Package lock or provider/runtime source changes | Reject |

Positive controls prove each detector rejects a hostile synthetic README or package object before a
zero-hit source scan is accepted. Diagnostics identify rule IDs and safe repository-relative paths,
never raw credentials or classified marker values.

## TDD and verification ladder

1. Register `test:post-17-public-release-r2-plan` in `package.json` and `test:kit` while the plan is
   absent; require the exact missing-plan RED.
2. Add only this plan; require the unchanged validator to pass `I1/M1/D1/L1/C1/P1/E1`.
3. Add/register `test:public-entry-contract` with hostile package/README fixtures while root content
   is unchanged; require true behavioral REDs for the current legacy title/description and missing
   metadata/information architecture.
4. Update only `package.json` metadata and root `README.md`; require the unchanged focused suite to
   pass every positive and negative group.
5. Update the exact release manifest and current-tree transition test for the 578-path source and
   579-path evidence states; require contract-valid, intentionally blocked, 73 classified
   occurrences, and exactly 31 unresolved-only blockers.
6. Run TypeScript 5.9.3 strict where the new test is in scope, package JSON/lockfile consistency,
   root-link resolution, version check, parent/R1/R2 plans, provider bundles/distribution,
   claim-runtime, cross-platform, and full `test:kit`.
7. Audit the exact changed-file manifest, English/public naming, LF/whitespace, secret/private-marker
   positive controls, no provider/runtime/lockfile drift, backup identity, dashboard preservation,
   and no temporary preload before staging.
8. Create a source commit and rerun focused/companion/full-kit gates on its immutable SHA.
9. Add the public-safe evidence file and its exact manifest entry, rerun all R2 and full-kit gates,
   then make one evidence-only commit.
10. Publish only a separately authorized stacked feature branch, create its PR only under the
    active external-action authorization, and record Linux/Windows/aggregate CI plus artifact
    digests before declaring R2 complete.

No verification step has a network, credential, database, provider execution, sync, publish,
release, tag, visibility, or merge side effect. Generated provider archives remain ignored local
test artifacts.

In summary, R2 has no network, credential, database, provider execution, sync, publish, release,
tag, visibility, or merge side effect.

## Exact source and evidence manifests

The R2 source commit may touch exactly:

- `README.md`
- `package.json`
- `docs/roadmap/p17-018-r2-public-entry-plan.md`
- `release/public-release-manifest.json`
- `scripts/post-17-public-release-r2-plan.test.ts`
- `scripts/public-entry-contract.test.ts`
- `scripts/public-release-contract-node.test.ts`

The R2 evidence commit may touch exactly:

- `docs/evidence/post-17-public-release-r2-public-entry-2026-08-17.md`
- `release/public-release-manifest.json`
- `scripts/public-release-contract-node.test.ts`

Any other source, generated artifact, lockfile, provider package, runtime, workflow, governance file,
or workspace change fails the R2 manifest audit.

## Rollback and external-action boundary

Before any R2 source edit, verify today's immutable backup tag and working-tree ZIP. If an update
fails mid-operation, restore the affected repository from today's verified snapshot before retrying;
do not leave a partial README/manifest transition.

Local rollback reverts the evidence commit, then the source commit. Before merge, remote rollback
deletes only the R2 feature branch or closes its PR. No database, provider installation, sync,
release, tag, package, dashboard, or target rollback is needed because R2 performs none of those
actions.

## Completion boundary

R2 is complete only when exact source and evidence commits pass focused attacks, strict checks,
companion gates, full local regression, exact manifest evaluation, a stacked PR, and accepted remote
Linux/Windows/aggregate evidence.

R2 completion means the root public entry and metadata are internally consistent and ready for the
next P17-018 governance slice. It does not mean P17-018 is complete, the 31 marker blockers are
resolved, governance/security/support files exist, clean-clone timing is proven, a public release is
authorized, or any repository/package/artifact has been published.
