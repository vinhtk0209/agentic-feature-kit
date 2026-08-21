# P17-007 A2 Pure Provider-Parity Evaluator Evidence

**Date:** 2026-08-21
**Status:** Locally qualified pure evaluation slice; provider execution has not started
**Branch:** `p17-007-a2-pure-evaluator`
**Source commit:** `bcaec7e300b607a9ff3ca607a958b52e75bc5810`
**Source parent:** `8e28d10041580c312300790598e4131dab3e7ec9`
**Source tree:** `04e2e872e06981d127b582212c25b38128d6103a`

## Outcome

P17-007 A2 adds a provider-neutral, side-effect-free evaluator for independently produced Codex,
Claude Code, and GitHub Copilot parity receipts. It validates closed request and report contracts,
binds every result to the A1 golden and execution identity, conserves semantic and independently
verified evidence, and aggregates the three provider outcomes without inventing missing input.

A2 does not discover or launch a provider CLI, authenticate a provider, execute a model, materialize
a repository, run trusted tests, persist a run, or rank incomplete samples. Those capabilities remain
outside the pure domain boundary.

## Architecture boundary

The dependency direction remains inward:

`future provider/process adapters -> evaluator request port -> pure evaluator domain -> immutable report`

The evaluator imports only Node's hashing and performance primitives. It has no filesystem, process,
network, environment, provider SDK, credential, session, dashboard, database, or target-repository
dependency. Adapter-specific state is admitted only as closed metadata in the request schema.

TypeScript/Node remains the selected implementation. The final focused 10,000-receipt profile was
p95 `0.381 ms` with an incremental RSS delta of `1,482,752` bytes; the full-suite observation was
p95 `0.370 ms` and `1,007,616` bytes. Both are far below the locked 50 ms and 64 MiB reconsideration
thresholds, so no measured Rust, Go, or Python ADR trigger exists.

## Contract result

The A2 contracts enforce these invariants:

- Provider order is exactly Codex, Claude Code, then GitHub Copilot.
- Request, golden, receipt, and report records are exact-key plain data with no accessors, inherited
  fields, cycles, non-finite numbers, or undeclared properties.
- Stable canonical JSON and SHA-256 bind the admitted request and produced report.
- Completed and failed receipts bind CLI, entitlement, authorization, adapter, source tree,
  materialized tree, execution policy, model, timestamps, and independent verification identities.
- A `needs_input` receipt may omit unavailable runtime identities only when correlated closed reason
  codes explain the absence; it cannot claim a materialized tree.
- Acceptance criteria, artifact hashes, gate outcomes, API observations, and trusted verification are
  conserved against the golden rather than inferred from provider prose.
- Pairwise Jaccard and implementation-tree equality are metadata-only informational comparisons.
- Aggregate status is one of `needs_input`, `passed`, `failed`, or `incomplete` under closed rules.
- Performance ranking is forbidden unless all providers contribute five comparable, priced, passed
  samples with latency, token, and cost metrics.

## Source authority

The immutable source commit contains exactly nine paths:

1. `docs/roadmap/p17-007-a2-provider-parity-evaluator-plan.md`
2. `docs/roadmap/post-17-roadmap.md`
3. `docs/schemas/provider-parity-evaluation-report.schema.json`
4. `docs/schemas/provider-parity-evaluation-request.schema.json`
5. `package.json`
6. `packages/core/src/provider-parity-evaluator.ts`
7. `packages/core/test/provider-parity-evaluator.test.ts`
8. `release/public-release-manifest.json`
9. `scripts/post-17-provider-parity-evaluator-plan.test.ts`

The source commit records 1,919 insertions and 2 deletions. Cached and worktree whitespace checks
were clean, no unstaged portion existed, and the normal spec-integrity commit hook passed.

## RED-to-GREEN evidence

The implementation advanced through these observed fail-closed boundaries:

1. RED: the A2 plan did not exist.
2. RED: one plan sentence did not contain the exact ranking-boundary wording required by the plan
   validator; the policy wording was made explicit without changing the decision.
3. RED: package and public-manifest registration did not yet exist.
4. RED: the public-link gate reported `link-source-invalid` while a manifest-listed plan remained
   untracked. Staging the exact nine paths made the same gate pass without weakening it.
5. RED: the first full-suite attempt placed A2 commands in `pretest:kit`; the repository-boundary
   guard rejected the expanded prehook. Restoring the prehook and registering A2 directly in the
   existing `test:kit` chain repaired the boundary.
6. GREEN: the corrected suite ran from the beginning and completed with exit 0.

Structured code review also found that the initial `needs_input` shape forced unavailable providers
to fabricate runtime identities. The final contract makes those fields nullable only under
correlated closed reasons, keeps completed and failed receipts fully bound, orders reasons by the
closed vocabulary, and treats missing performance metrics as ranking-blocking input.

## Verification receipts

| Gate | Result |
|---|---|
| A2 plan | PASS: 9 source paths, 11 headings, 12 boundary phrases |
| A2 runtime | PASS: 3 schema/contract groups, 8 identity attacks, 11 evidence attacks, 14 structure/privacy attacks, 5 aggregate modes, 10,000 admitted receipts |
| A1 compatibility | PASS: 7 source paths, 13 decisions, 3 readiness attacks, 1 executable RED fixture |
| Post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Pre-commit | PASS: 3/3 |
| Provider distribution | PASS: 3 archives, 71 entries, 8 sidecars, 11 checksums, 79 text scans, 15 runtime smokes, 4 attacks |
| Public release contract | PASS: 18 contract tests plus link, license, secret, and documentation gates |
| Public links before evidence registration | PASS: 236 Markdown files, 48/48 relative links |
| Public secrets before evidence registration | PASS: 785 text files, 10 detector families, 0 findings |
| Public aggregate before evidence registration | PASS: `eligible-for-r5c2`, 788 manifest paths, zero issues |
| TypeScript | PASS: 5.9.3, strict, no emit, `skipLibCheck=false`, zero diagnostics |
| Full `test:kit` | PASS: native exit 0; version, index, prompt-budget, and 60/60 lesson-sync gates passed |

The repository-pinned TypeScript 4.9.5 parser is incompatible with the newer installed Node type
declarations and stopped in dependency syntax before A2 checking. TypeScript 5.9.3 already present
in the workspace then checked the exact A2 source and tests without an install or dashboard change.
This dependency-toolchain diagnostic is not product failure evidence.

## Security and privacy result

No credential, environment value, provider session, prompt or specification body, model output,
transcript, repository content, local path, customer identity, or live-project coordinate is stored
by the evaluator or added to this evidence. No provider process, network write, database write,
dashboard mutation, sync, or target edit occurred. Public secret scanning reported zero findings.

## A3 gate

A3 may add only one thin provider/process adapter slice after its own input lock, expected RED, exact
runtime identity, direct-argv policy, sanitized execution root, bounded output and time, and
metadata-only receipt authority are proven. A provider discovery smoke is not parity evidence.

No external comparison may claim completion until all three providers use the same A1 golden,
preserve independent verification, and produce equal admitted sample counts. Missing Copilot CLI
availability, stale authentication, incomplete receipts, or incomparable cost metrics must remain
`needs_input` or `incomplete`; they cannot be converted into a partial ranking.

## Rollback

Revert the evidence commit and source commit through normal Git history. A2 creates no runtime,
credential, provider, database, dashboard, target, sync, tag, release, publication, or visibility
side effect, so rollback requires no external cleanup.

## Non-claims

This evidence does not claim provider execution, generated implementation parity, output equivalence,
quality parity, performance ranking, cost completeness, provider availability, authentication,
process-adapter completion, A3 readiness, P17-007 completion, sync, push, PR creation, merge, tag,
release, publication, or visibility change.
