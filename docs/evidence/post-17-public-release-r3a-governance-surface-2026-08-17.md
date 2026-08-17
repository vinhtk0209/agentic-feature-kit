# P17-018 R3A Public Governance Surface Evidence

**Date:** 2026-08-17
**Task:** P17-018 implementation step 4, governance slice R3A
**Scope lock:** `slice=R3A, governance=G1, security=S1, support=U1, community=C1, templates=T1, links=L1, evidence=E1`
**Starting commit:** `95169e18f73906b07245f0a22de9f947d0d91545`
**Source commit:** `ee591340794b180ac7d47c8fa81de0e44a4a6db6`
**Kit version:** `3.25.0`

## Outcome

R3A adds the bounded governance surface needed for an external evaluator to contribute, request
support, report a vulnerability privately, and understand community expectations. It adds four
canonical policy owners, typed issue forms, issue routing, a pull request template, README routing,
and adversarial contracts without changing the package version, provider runtime, release
eligibility, or publication state.

The release candidate remains intentionally blocked. R3A proves governance behavior only; it does
not prove a public release.

## Exact source manifest

The source commit changes exactly 16 paths:

- `.github/ISSUE_TEMPLATE/bug_report.yml`;
- `.github/ISSUE_TEMPLATE/config.yml`;
- `.github/ISSUE_TEMPLATE/feature_request.yml`;
- `.github/pull_request_template.md`;
- `CODE_OF_CONDUCT.md`;
- `CONTRIBUTING.md`;
- `README.md`;
- `SECURITY.md`;
- `SUPPORT.md`;
- `docs/roadmap/p17-018-r3a-governance-surface-plan.md`;
- `package.json`;
- `release/public-release-manifest.json`;
- `scripts/post-17-public-release-r3a-plan.test.ts`;
- `scripts/public-entry-contract.test.ts`;
- `scripts/public-governance-contract.test.ts`; and
- `scripts/public-release-contract-node.test.ts`.

Commit `ee59134…` contains 1,511 insertions and 25 deletions. Its normal tracked hook passed
`spec-integrity` over four TypeScript files in 318 ms. The source worktree and index were clean
before immutable verification.

## Governance ownership

- `CONTRIBUTING.md` owns clean-clone setup, architecture boundaries, plan readiness, verification,
  generated files, English public artifacts, pull request evidence, and external-effect declarations.
- `SECURITY.md` owns current supported-source status, private GitHub reporting, safe harbor,
  best-effort response targets, and disclosure coordination. It publishes no personal or corporate
  reporting email and promises no service-level agreement.
- `SUPPORT.md` routes bugs, feature requests, and sensitive reports; defines reproducible evidence;
  and explicitly denies hosted-service and SLA claims.
- `CODE_OF_CONDUCT.md` carries policy revision `1.0.0`, Contributor Covenant 2.1 attribution,
  enforcement scope, anti-retaliation language, proportionate consequences, and private routing.
- GitHub issue forms require bounded version, provider, runtime, reproduction, outcome, and
  sanitized-evidence fields. Mandatory checkboxes deny secrets and implicit external authorization.
- The pull request template requires plan, scope, verification, generated drift, security/privacy,
  compatibility, and explicit external effects.

`CODEOWNERS` remains absent because no stable public maintainer identity was approved.

## Plan-first and RED/GREEN trail

Meaningful failures were preserved and classified instead of being overwritten by later passing
commands:

1. The R3A readiness validator failed only on the missing governance plan, then passed after the
   exact `G1/S1/U1/C1/T1/L1/E1` plan was added.
2. Four synthetic governance/attack groups passed while current-root readiness failed only on the
   eight missing artifacts, four README routes, and eleven manifest paths.
3. The first implementation run found one real line-wrapping mismatch in the required security
   no-SLA phrase. The next run found one real machine-readable revision mismatch caused by Markdown
   emphasis in the conduct metadata. Both were corrected without changing policy meaning.
4. No repository YAML package or bundled PyYAML runtime was available. A bounded TypeScript parser
   was therefore added for the exact GitHub Issue Forms subset instead of introducing a dependency.
5. Review found two inert YAML attack mutations. The synthetic provider became a real dropdown and
   both attacks were rebound to present substrings before they were accepted as evidence.
6. Static review found CRLF in the two modified JSON files. Both were mechanically normalized to LF
   under the repository `eol=lf` contract.
7. Human review found that whole-line warning removal could hide a later unsafe request. Warning
   filtering now works by sentence or semicolon segment, and mixed-warning credential, raw-log,
   private-host, and CRLF attacks are rejected.
8. A real-index worktree run correctly failed because the new paths were not staged. A copied-index
   attempt was invalid because `GIT_INDEX_FILE` leaked into fixture repositories. A detached normal
   worktree removed that harness ambiguity.
9. The detached candidate exposed a real stale R2 inventory total (`579` versus `590`). The Node
   authority now derives total/include counts from exact index/manifest parity while locking the five
   excluded paths and reasons, 73 classified occurrences, and 31 unresolved blockers.
10. A small scratch run then found one real new marker occurrence: the governance test embedded the
    live Supabase project reference in its own detector. That literal was removed; the digest-bound
    marker registry remains the owner of live-reference detection.

Sandbox launch failures from a broken global npm prefix and Windows `os.userInfo()` were recorded as
environment failures before assertions, not as source RED or GREEN results. The existing local npm
runtime and cached TypeScript compiler were used without installation or network access.

## Focused and adversarial proof

At source commit `ee59134…`:

- R3A plan contract: PASS for `G1/S1/U1/C1/T1/L1/E1`;
- governance contract: 5/5 groups;
- provider-neutral public entry: 5/5 groups;
- pure public-release domain: 18/18 groups;
- Node/Git-index adapter and current authority: 7/7 groups; and
- TypeScript 5.9.3: zero diagnostics with `strict` and `skipLibCheck=false`.

The governance attacks cover missing policy sections, personal email, guaranteed response, support
SLA, missing attribution, retaliation drift, local paths, workspace markers, unsafe credential or
raw-log requests, private hosts, CRLF, missing issue fields, malformed YAML indentation and keys,
duplicate top-level keys and IDs, unknown item types, missing validation/options, missing PR evidence,
and missing/duplicate/case-drifted/stale README routes.

## Static, privacy, and release-authority proof

The exact 16 source paths pass:

- strict UTF-8 without BOM;
- LF-only bytes and a final newline;
- zero trailing whitespace;
- exact worktree/index blob parity before commit; and
- cached and immutable `git diff --check`.

Eight positive-controlled detectors cover email addresses, mail routes, Windows user paths, private
hosts, workspace markers, Vietnamese product text, common secret forms, and the live project
reference. The new surface has zero unclassified hits. `package-lock.json` and
`release/internal-marker-classification.json` are unchanged.

The source candidate contains exactly 590 manifest entries:

- 585 included paths;
- 5 exact excluded paths;
- 73 classified marker occurrences; and
- 31 blockers, all `unresolved-marker-disposition`.

The marker-registry SHA-256 remains:

`73c343099eb530726b27c3cafd4f1ad1a2ff3b7fba60a73dcb3d1ed8f333a6c3`

After this evidence file is staged, the candidate contains 591 entries: 586 included and the same
five exact exclusions. The blocker and classified-occurrence totals remain unchanged.

## Complete-suite proof

The final pre-commit detached candidate used a normal Git index and physical copies of root,
MCP-server, and docs-site dependencies. Every source and destination dependency tree was proven free
of reparse points; no junction was created. The candidate staged exactly 16 paths and passed the
complete kit:

- exit code: `0`;
- captured lines: 1,863;
- test duration: 367.1 seconds;
- log SHA-256: `2dd47509004d2923b9d9ea797554dcac5b0fa4cbe904d43e33e8aef7a6d117ed`;
- cleanup: detached worktree removed; and
- real index after cleanup: unchanged with zero cached paths.

The immutable source commit then passed the complete kit directly:

- exit code: `0`;
- captured lines: 1,863;
- duration: 356.0 seconds;
- log SHA-256: `3abb3e4ed9c796c3a78d6e13abf8af3aa4a92025c3b55daa8f4f2c23d64b2078`;
- HEAD after the run: exact `ee591340794b180ac7d47c8fa81de0e44a4a6db6`; and
- worktree status entries after the run: zero.

Final gates report version `v3.25`, prompt budget 163,206 of 176,128 bytes, and lesson annotations
60/60 synchronized. The four existing lesson-normalization warnings remain non-fatal and unrelated
to R3A.

## Architecture and language decision

R3A is Markdown/YAML governance and bounded file-validation work. TypeScript and Node reuse the
existing contract types, Git-index adapter, package scripts, and cross-platform test runtime. The
work exposes no measured CPU, memory, concurrency, binary-distribution, native filesystem, or systems
API gap. Rust, Go, Python, an FFI layer, and a sidecar would add distribution and trust surfaces with
no measured benefit, so none was introduced.

## Backup, preservation, and rollback

Before R3A changes, the verified daily kit backup tag resolved to
`38888187c4191206dbb81562ccb387463fcbbc76`; the kit worktree ZIP SHA-256 is
`d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`. The separately preserved
dashboard ZIP SHA-256 is `5770c0b30ec09bbf58e082c3a9ff6cc3cca28f9646657e9c0e8f653085879b7e`.

Rollback order is evidence commit first, then source commit. The verified daily snapshot remains the
fallback if a partial update cannot be reverted cleanly.

## Explicit non-claims and external effects

R3A does not:

- make the repository or package public;
- create a version bump, tag, release, publication, marketplace listing, or registry artifact;
- resolve or relabel any of the 31 public-tree blockers;
- add changelog/release-note reconciliation, SBOM/license inventory, pinned actions, nightly CI, or
  clean-clone release qualification;
- change provider bundles, shared runtime, workflow behavior, package identity, or sync guards;
- read or mutate credentials, a provider, database, dashboard, sync target, or target `.Codex` tree;
- push directly to `main`; or
- complete P17-018 or the overall post-17 roadmap.

No sync, provider execution, database write, dashboard mutation, target mutation, tag, release,
publication, visibility change, or direct-main push occurred while producing the local source and
evidence commits. Remote branch, pull-request, CI, and merge receipts are recorded only after this
evidence commit is immutable.
