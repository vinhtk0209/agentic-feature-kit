# P17-018 R5C1 — Public Source Readiness Evidence

Date: 2026-08-19

Local source status: complete. Evidence-tree qualification, the evidence commit, and remote
pull-request qualification are pending and must be recorded only from observed state. Scope lock:
`slice=R5C1, links=L1, licenses=P1, secrets=S1, docs=D1, architecture=A1, evidence=E1`.

## Outcome and nonclaims

R5C1 makes the Git-index public source candidate fail closed on repository-local Markdown links,
dependency-license authority, high-confidence text-secret patterns, and release-document drift. A
single read-only Node adapter combines those domains with the existing public-release contract and
reports the current candidate as `eligible-for-r5c2` with zero issues.

This result is source readiness, not distribution or publication readiness. R5C2 must still create
and validate deterministic SPDX 2.3 and CycloneDX 1.6 sidecars and scan the exact final archives.
R5D must still qualify clean clones, isolated double builds, extracted runtime smokes, and the
quickstart on supported operating systems. No tag, release, package/plugin publication, repository
visibility change, sync, target edit, dashboard/database/provider mutation, or version bump is
authorized or claimed. Versions remain `3.25.0 / v3.25 / 0.5.0 / 1.3.0`, and the root package
remains `private: true`.

## Source identity

- Parent: `fdade1bedf9ce4798d24ccc24537637d316bfd07`
- Source commit: `6680cdcf9113aba8da801b15650eaef2159fbad3`
- Source tree: `412db21e9904bebe3a8c5357b7b81b6230adfcbb`
- Subject: `feat(release): enforce public source readiness`
- Exact staged source scope: 27 paths, including 11 additions
- Ordinal source path-manifest SHA-256:
  `dc37a48311cca6764a406120793a3d40d70266433dfb9c63dca49615d702c42b`
- Commit hook: `spec-integrity` passed for 11 TypeScript files.

The source commit parent and tree were re-read after commit and matched the qualified parent and
staged tree exactly. Index/worktree filter parity was 27/27, cached diff-check was clean, and the
branch worktree had no unstaged or untracked residue. One shell spelling of the Git tree expression
was rejected after PowerShell changed the argument; the authoritative tree above comes from the
independent `git show -s --format=%T` result.

The evidence commit and evidence tree cannot be embedded in a file that contributes to their own
hashes. They are bound after commit in the canonical workspace handoff and again by the future
exact-head pull request and CI records.

## Architecture and bounded execution

TypeScript and Node remain the implementation platform because the candidate is 627 paths and
comfortably within the existing bounded Git-index loader. A native implementation is reconsidered
only if an archive exceeds 512 MiB, scanner peak memory exceeds 256 MiB, or a representative scan
exceeds 30 seconds. R5C1 performs no archive extraction, package installation, subprocess network
access, provider call, database access, or worktree-byte fallback.

The pure domain contract owns link parsing, license policy, secret classification, and release-note
validation. The Node adapter owns Git-index byte acquisition and SHA-256. Findings are structured,
bounded, ordinal, and omit matched secret bytes. The aggregate CLI emits one machine sentinel and
fails closed on adapter or contract errors.

## Markdown link authority

The locked baseline found exactly 13 broken links across the historical prompt evolution and the
English/Vietnamese Claude-command guides. They referenced removed private clean-room evaluation,
hardening, or parity artifacts. R5C1 repaired only those references using retained changelog or
prompt-evolution authority, or non-link historical prose; it did not recreate private material or
add an ignore.

The final candidate contains 188 Markdown files and 48 repository-relative links. All 48 resolve to
tracked, included, regular files with exact path casing and valid fragments. The parser covers
inline, image, reference, query, duplicate-heading, and explicit-ID links; excludes external,
fragment-only, inline-code, and fenced-code destinations; and rejects traversal, absolute/drive,
backslash, malformed encoding, NUL, missing/excluded/untracked/non-regular/case-drift targets,
stale fragments, and duplicate or unresolved reference definitions.

## Dependency-license authority

Four npm lockfiles contain 749 dependency occurrences and 616 unique exact `name@version` records.
The generated ordinal catalog is SHA-256
`5a093cdd4d131b97a0547c138c2e041658f18fdbe6d4126f45b17be845bd834d` and was generated twice with
byte-identical output. Offline validation binds every catalog row to exact lockfile registry and
integrity authority.

The policy accepts six unconditional permissive expressions, requires exact review records for
five special packages, and requires exact MIT tarball-provenance overrides for four packages whose
lock metadata lacked a license. It rejects missing/corrupt/unsupported lock entries, non-registry
sources, integrity drift, catalog set or order drift, denied or wildcard licenses, unreviewed
special expressions, and unmatched overrides. Package metadata is provider-neutral, private,
Apache-2.0, and Node 20+. Non-root lock parity is 3/3 and dependency-declaration parity is 4/4; no
dependency range, resolved URL, or integrity value changed.

Reviewed exact packages:

- `@axe-core/playwright@4.11.3`
- `axe-core@4.11.4`
- `caniuse-lite@1.0.30001799`
- `dompurify@3.4.11`
- `robust-predicates@3.0.3`

Exact metadata overrides:

- `busboy@1.6.0`
- `format@0.2.2`
- `khroma@2.1.0`
- `streamsearch@1.1.0`

The catalog and policy are engineering release controls, not legal advice. Provider archives do
not vendor `node_modules`, and R5C2 must re-evaluate the exact final archive contents.

## Text-secret and document authority

The scanner reconstructs positive controls for ten detector families without storing a candidate
credential: AWS, GitHub, Slack, Google, npm, JWT, PEM private key, credential URI, Stripe live, and
signed-cloud/high-confidence assignment. It rejects invalid UTF-8, NUL bytes, binary-kind drift,
duplicate paths, oversize inputs, and per-file/global finding overflows. Current authority is 624
manifest text files, ten detector families, and zero findings.

Two pre-existing literal NUL bytes inside control-range regular expressions were replaced with
escaped source ranges while preserving regex semantics. A self-detected credential-URI fixture was
split into non-secret source fragments while preserving runtime coverage. Findings expose only
path, line, detector ID, and a full SHA-256 fingerprint.

`UNRELEASED.md` and `THIRD_PARTY_NOTICES.md` now distinguish completed source controls from the
deferred R5C2/R5D gates. The predecessor R3B validator was changed from obsolete pending-language
requirements to exact completed/deferred state-transition assertions and stale-language attacks.
The R4C prompt-history validator was rebound to the intentional one-line private-link removal while
preserving 1,836 lines, 182 headings, 60 lessons, 158 Change tokens, 23 learning aliases, two
authoring aliases, reversibility, and all marker ceilings.

## TDD, attacks, and focused qualification

The plan validator first failed on the absent plan, then passed all 11 locked sections. Link tests
failed on the absent domain, then exposed the exact 13-link baseline before repair. License tests
failed on the absent evaluator and policy, secret tests failed on the absent scanner and then found
the two real NUL bytes, document tests failed on stale release notes, and the aggregate route failed
on the absent Node adapter. Each gate turned GREEN without an ignore or bypass.

| Gate | Observed result |
|---|---|
| R5C1 plan | PASS, 11 sections |
| Public release core | PASS, 18/18 |
| Markdown links | PASS, 7 tests; 48/48 links |
| Dependency licenses | PASS, 7 tests; 749/616 |
| Text secrets | PASS, 6 tests; 624 files / 10 families / 0 findings |
| Release documents | PASS, canonical plus mutation attacks |
| Aggregate Git-index adapter | PASS, `eligible-for-r5c2`, zero issues |
| R3B release history | PASS, synthetic attacks and current authority |
| R4A legacy backend | PASS, 7/7 |
| R4B synthetic fixture | PASS, 11 attacks / 7 surfaces |
| R4C prompt history | PASS, 12 attacks / 5 surfaces |
| Private archive | PASS, 11 assertions / 7 surfaces |
| Binary review | PASS, 21 attacks / 7 surfaces |
| Operational aliases | PASS, 10 attacks / 6 surfaces |
| Historical aliases | PASS, 14 attacks / 7 surfaces |
| Nightly workflow | PASS, canonical plus 11 attacks |
| Cross-platform release | PASS, 11/11 |
| Public Node adapter | PASS, 7/7 |
| Strict TypeScript 5.9.3 | PASS, 11-file graph, no diagnostics |

## Complete-kit source receipt

The staged source tree, later proven byte-identical to the source commit tree, passed the complete
kit suite:

- native exit: `0`
- duration: `349553 ms`
- stdout: `127329` bytes / SHA-256
  `15dc16d4ffc5d0092a08edad767669acfdb1da5f67ddc84e2efb0eb7389a2835`
- stderr: `1074` bytes / SHA-256
  `f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`
- lesson synchronization: `60/60`

The two logs are retained outside the repository under the verified 2026-08-19 backup. Stderr
contains only the ten existing lesson-fixture normalization warnings. There was no failed or
skipped R5C1 gate, sync, provider/database invocation, target mutation, or generated repo residue.

## Public candidate authority

Before the source commit, the exact Git-index candidate and public manifest matched 627/627 unique
tracked, include-only paths: 624 text files and three exact reviewed binaries, with 19 required
paths. The candidate reported zero classified identities and zero R5C1 issues. Package, prompt,
provider, and core versions remained unchanged and conservative.

## Remote qualification still required

The evidence head must be pushed non-force to retained branch
`p17-018-r5c1-source-readiness` and opened as a draft pull request into `main`. Merge is permitted
only after the unchanged exact evidence head has GREEN Linux, Windows, and fail-closed aggregate
jobs, valid qualification artifacts, and no conflict. Remote pull-request, run, job, artifact, and
merge identities are absent until observed and must be recorded in the canonical workspace handoff.

## Rollback and external-effect statement

Rollback is a revert of the source and evidence commits or restoration from the verified
2026-08-19 backup. The retained feature branch must not be deleted.

R5C1 performs no direct-main push, force push, sync, target `.Codex` edit, provider invocation,
Supabase/database write, dashboard mutation, tag, release, package/plugin publication, repository
visibility change, or user/admin installation.
