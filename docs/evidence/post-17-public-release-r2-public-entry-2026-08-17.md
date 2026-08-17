# P17-018 R2 Provider-Neutral Public Entry Evidence

**Date:** 2026-08-17
**Task:** P17-018 implementation step 3 (R2)
**Scope lock:** `identity=I1, metadata=M1, readme=D1, links=L1, compatibility=C1, privacy=P1, evidence=E1`
**Source commit:** `5153c055ba6fc3a94466cf0deccd8060de149c70`
**Source parent:** `cbf645c152ac3cd251c723dda0a86af21861316f`
**Kit version:** `3.25.0`

## Outcome

R2 gives the repository a provider-neutral public entry without changing the legacy package identity,
runtime, provider bundles, workflow behavior, package visibility, or publication state.

The root README now starts from the product name **Agentic Feature Kit**, lets a reader choose Codex,
Claude Code, or GitHub Copilot, states audience and boundaries before setup, provides a clean-clone
quickstart, and links to deeper authorities instead of duplicating them. Root package metadata now has
an Apache-2.0 license identifier, repository, homepage, issue tracker, description, and discoverability
keywords while retaining:

- package name `feature-from-confluence-kit`;
- version `3.25.0`;
- `private: true`;
- Node.js `>=20`;
- the existing CLI binary, scripts, dependencies, and lockfile; and
- all provider/runtime behavior.

This evidence proves the R2 public entry contract. It does not claim that the repository is ready for
publication: the fail-closed release candidate remains intentionally blocked by 31 unresolved marker
dispositions.

## Exact source manifest

The source commit changes exactly seven paths:

- `README.md`;
- `package.json`;
- `docs/roadmap/p17-018-r2-public-entry-plan.md`;
- `release/public-release-manifest.json`;
- `scripts/post-17-public-release-r2-plan.test.ts`;
- `scripts/public-entry-contract.test.ts`; and
- `scripts/public-release-contract-node.test.ts`.

The commit contains 996 insertions and 142 deletions. Its normal tracked pre-commit hook passed
`spec-integrity` over three TypeScript files. The commit has the exact parent recorded above and the
worktree was clean before every immutable-source gate.

## Plan-first and TDD trail

The work followed the locked R2 plan and preserved each meaningful RED rather than treating a test
harness failure as a product result:

1. The unchanged readiness validator failed only for the missing provider-neutral R2 plan.
2. The first plan attempt failed one exact no-side-effect wording contract; adding the locked summary
   sentence made `I1/M1/D1/L1/C1/P1/E1` pass without widening scope.
3. Four synthetic public-entry groups passed while the unchanged root failed for six missing package
   metadata fields and the legacy README identity, structure, quickstart, and link contract.
4. Updating only the root README and package metadata made all five public-entry groups pass.
5. Adversarial review found that arbitrary HTTPS links, `mailto:` identities, and missing local
   fragments could bypass the first link policy. New attacks failed before implementation.
6. The hardened parser now discovers nested badge targets, allows only the two canonical CI URLs,
   rejects mail identities, and resolves unique local and linked-document fragments. All five groups
   pass again.
7. The first companion run reached a real claim-registry failure after twelve green gates because the
   README rewrite removed three established claim anchors. The anchors were restored in compact,
   provider-neutral legacy-boundary prose; public-entry remained 5/5 and claim-runtime returned 8/8.
8. The staged-index audit found two Markdown trailing-space suffixes that the earlier untracked-file
   diff could not see. Only those suffixes were removed; the plan gate and staged whitespace gate then
   passed.
9. The first immutable strict command accidentally selected repository-local TypeScript 4.9.5 and
   failed to parse installed Node 26 declarations. The source was not changed and `skipLibCheck` was
   not weakened. The cached TypeScript 5.9.3 compiler was invoked directly and produced zero
   diagnostics for the same six-file scope.

## Public-entry behavior coverage

`test:public-entry-contract` passes five groups:

1. canonical package metadata and provider-neutral README acceptance;
2. package identity, visibility, metadata, and publication attacks;
3. README identity, information architecture, claim, and workspace-only attacks;
4. traversal, missing path, case drift, duplicate target, unapproved external host, mail identity,
   missing fragment, duplicate fragment, and nested badge-link attacks; and
5. the exact current root package and README.

The README contract requires these reader-first areas:

- product identity and provider choice;
- audience and boundaries;
- clean-clone quickstart;
- shared capabilities;
- explicit legacy Claude Code flagship compatibility;
- verification;
- three distinct version/release concepts;
- security and data boundaries;
- limitations;
- a non-duplicating documentation map; and
- contribution and support status without dead governance links.

## Release contract and privacy proof

The staged and committed Git-index candidate reports:

- `contractValid=true`;
- `candidateStatus=blocked`;
- 573 included paths;
- 5 excluded paths;
- 73 classified marker occurrences; and
- exactly 31 `unresolved-marker-disposition` blockers.

The manifest contains 578 source-state entries and 22 digest-bound binary entries. Its marker-registry
digest is still:

`73c343099eb530726b27c3cafd4f1ad1a2ff3b7fba60a73dcb3d1ed8f333a6c3`

The registry still contains six marker IDs, 73 classified occurrences, and 31 pending remediation
records. R2 does not relabel, hide, or resolve any of those records.

The exact seven source paths:

- decode under strict UTF-8;
- contain no BOM;
- contain no Vietnamese feature content;
- contain no private host, local-user-path, workspace-target, or service-role assignment marker after
  positive controls proved the detector path;
- have LF Git attributes and LF Git-index blobs; and
- pass the staged whitespace gate.

The package lock retains the same root name and version as `package.json` and is byte-unchanged. No
provider, shared runtime, workflow, generated archive, dashboard, database, target repository, or
credential file changed.

## Focused and companion proof

At the immutable source commit, the following focused gates pass:

- R2 plan: `I1/M1/D1/L1/C1/P1/E1`;
- public entry: 5/5 groups;
- pure release contract: 18/18 groups;
- Node/Git-index release adapter: 7/7 groups; and
- direct Git-index candidate evaluation: contract-valid and unresolved-only blocked.

TypeScript `5.9.3` strict checking with `skipLibCheck=false` reports zero diagnostics across the R1
domain/adapter source and test files plus the R2 plan and public-entry tests.

One uninterrupted 16-command matrix passes in 48.3 seconds:

- canonical post-17 roadmap and repository-boundary refresh;
- parent, R1, and R2 public-release plans;
- public-entry, pure release, and Node/Git-index release gates;
- provider bundles and deterministic provider distribution;
- Project Intelligence and Workflow Orchestrator;
- claim-runtime audit 8/8;
- cross-platform release 11/11;
- version alignment at `v3.25`; and
- five byte-identical synced-core files.

HEAD remained exact before and after the matrix.

## Complete-suite proof

The pre-commit source candidate passed the complete registered kit in 251.5 seconds. Its temporary log
contains 1,522 file lines with SHA-256:

`3e95d5aa726bb90d513e7599392906ce4711b9b95314868e00aed02646bfd880`

The immutable source commit then passed the complete registered kit again:

- exit code: `0`;
- duration: 294.9 seconds;
- temporary log file lines: 1,522;
- log SHA-256: `a6e6e1586917722e72ef549b6e2004e82de739894e6163f8927ed0be3697b570`;
- HEAD after the run: exact source commit;
- worktree status entries after the run: zero;
- version stamps: `v3.25` aligned;
- prompt budget: 163,206 of 176,128 bytes; and
- lesson annotations: 60/60 synchronized.

The four existing lesson normalization warnings remain non-fatal and are unrelated to R2.

## Architecture and language decision

R2 is a documentation and release-contract slice. Provider-neutral metadata stays at the repository
composition boundary, the README points inward to existing provider and core authorities, and the
fail-closed release evaluator remains separate from presentation content. No runtime dependency was
introduced and no architecture layer was inverted.

TypeScript remains the measured-fit implementation language for the focused validators because they
reuse repository-local types, JSON contracts, and test infrastructure. R2 performs no CPU-bound
scanning beyond the already bounded release contract and exposes no capability gap requiring native
filesystem control, parallel compute, or a separate service. Rust, Go, and Python would add a second
toolchain and distribution surface without measured benefit in this slice, so none was introduced.

## Backup, preservation, and rollback

Before R2 source changes, the daily kit backup tag resolved to
`38888187c4191206dbb81562ccb387463fcbbc76`. The verified kit ZIP SHA-256 is
`d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`; the separate dashboard ZIP
SHA-256 is `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`. The dashboard tracked
worktree and index remained clean at its preserved checkpoint.

Local rollback order is evidence commit first, then source commit. The verified daily snapshot is the
fallback if a partial update cannot be reverted cleanly.

## Explicit non-claims

R2 does not:

- make the package public or publish it;
- create a tag, release, marketplace listing, or registry artifact;
- resolve the 31 public-tree marker blockers;
- add governance, community, support-policy, SBOM, nightly, or clean-clone release automation;
- change the legacy package identity, version, CLI, provider bundles, shared runtime, or workflow;
- execute a provider, database, dashboard, sync, deployment, or target mutation;
- push directly to `main`; or
- make the complete post-17 roadmap finished.

Remote branch, pull-request, Linux/Windows/aggregate, and merge receipts are recorded only after this
local source/evidence pair is immutable and are not prerequisites silently backfilled into this file.
