# P17-007 A1 Provider-Parity Input-Lock Evidence

**Date:** 2026-08-21
**Status:** Locally qualified input/readiness slice; provider execution has not started
**Branch:** `p17-007-a1-provider-parity-input-lock`
**Source commit:** `558b87ec646dab45d8054ac24df3b88111d07d13`
**Source parent:** `68f080257b1180f0ea0754f3f872c84be177f5be`
**Source tree:** `07a20fe568162f3efe302a03f62e144d9fd3f8a1`

## Outcome

P17-007 A1 supplies a versioned public synthetic golden and locks the trust, execution, evidence,
comparison, cost, repetition, failure, and privacy boundaries for later same-input provider runs.
It moves P17-007 from `backlog` to `in_progress` and makes its input readiness complete.

A1 does not execute Codex, Claude, or GitHub Copilot. It does not produce a candidate, quality score,
cost receipt, latency sample, performance ranking, or cross-provider parity claim.

## Locked decision

The accepted tuple is:

`golden=G1, boundary=B1, identity=I1, execution=E1, providers=P1, semantics=S1, verification=V1, cost=C1, repetition=R1, failure=F1, privacy=D1, language=T1, scope=N1`

- One Apache-2.0 synthetic fixture binds exact prompt, normalized `SemanticSpec`, repository seed,
  B3/B10/B11 phase contracts, trusted test, hashes, and closed thresholds.
- A future evaluator core remains pure. Provider process, authentication, session, and event parsing
  stay in infrastructure adapters that depend inward on core ports.
- Every future result must bind the exact fixture revision, phase contracts, adapter capability, CLI,
  model, entitlement, execution policy, source tree, timestamps, and independent verification.
- Future execution uses isolated sanitized copies, fixed direct argv, `shell:false`, one attempt, no
  tools, bounded time/output, and no ambient repository or credential discovery.
- Transport or discovery smoke is never parity. Incomplete provider sets or sample counts cannot be
  ranked.
- Durable evidence is metadata-only. Prompt/spec bodies, model output, logs, transcripts, paths,
  repository content, credentials, and provider session material are excluded.
- TypeScript/Node remains selected. Rust, Go, or Python requires a later measured p95/RSS/capability
  ADR rather than an unmeasured rewrite.

## Golden identity

The source fixture is `docs/roadmap/fixtures/p17-007-provider-parity-golden.json` with these exact
authorities:

| Authority | SHA-256 |
|---|---|
| Task prompt | `07b1eb213bba17b07c38d76019bd0265948d72b939350387f93d1caca5c9509c` |
| Normalized SemanticSpec fixture | `206ae7026488f0d1ea9cfd90d392bb946ebc6726ebf1adbd6936157486d19830` |
| Semantic identity | `c4b4ea2509bc61fd326f99e60c6bdeb75d5af697d4f34326c68048c678e5267b` |
| Provenance identity | `2b8fa221bcd7467f4d2180f1f554404d0bcf9a8c521ec5a820a8bed81d9a01e2` |
| Repository seed tree | `08493cec29eb682c7188783317a69cc554117b32c625357e7e910213f7ba0ae7` |
| B3 contract | `0c79cc6c07014a8c8ef4a839045173aa184a05520b534ab4bb788315e01f287d` |
| B10 contract | `beb5485a673d62153b07c6484fe376296f7b3a27ffdc0058981256f092567a12` |
| B11 contract | `73dfec19182b0e365648998f54f1067ce1260feb1797dd55b950c6b973a67000` |

The five-file seed is materialized byte-for-byte in a temporary directory. Its dependency-free
trusted Node test must initially fail with `P17-007 fixture: implementation missing`; a passing seed
would invalidate the fixture rather than count as provider evidence.

## Source authority

The immutable source commit contains exactly seven paths:

1. `docs/roadmap/fixtures/p17-007-provider-parity-golden.json`
2. `docs/roadmap/p17-007-a1-provider-parity-input-lock-plan.md`
3. `docs/roadmap/post-17-roadmap.json`
4. `docs/roadmap/post-17-roadmap.md`
5. `package.json`
6. `release/public-release-manifest.json`
7. `scripts/post-17-provider-parity-input-lock-plan.test.ts`

The exact cached audit reported 800 insertions, 6 deletions, zero unstaged paths, and a clean
whitespace check. The normal `spec-integrity` commit hook passed for the TypeScript path.

## RED-to-GREEN evidence

The same fail-closed validator advanced through these observed boundaries:

1. RED: the A1 plan was absent.
2. RED: two broad prose regexes matched truthful negative statements. They were replaced with exact
   required status/non-claim assertions and canonical roadmap state checks.
3. RED: the provider-parity validator row preceded `privacy` under JavaScript ordinal sorting.
4. GREEN: fixture hashes, normalized semantics, phase bindings, materialization, initial trusted-test
   failure, roadmap transition, package wiring, and public source registration passed.
5. RED: the full suite found a legacy P17-004 marker contract requiring exact `- **P17-007:**`.
6. GREEN: the exact marker was preserved and the decision tuple moved into following prose; both the
   P17-004 and P17-007 validators passed without weakening the older gate.
7. Expected pre-stage boundary: public-link readiness returned `link-source-invalid` because the new
   manifest-included plan was not yet present in the Git index.
8. GREEN: exact seven-path staging made the plan a tracked regular file; the unchanged public-link
   gate passed 234 Markdown files and 48/48 relative links.

The initial sandboxed `tsx` launch failed before test evaluation with `uv_os_get_passwd returned
ENOMEM`; the same command ran directly under scoped execution and produced the intended RED. A
PowerShell `HEAD^{tree}` readback was also parser-incompatible; `git show -s --format=%T HEAD`
returned the tree above. Neither infrastructure diagnostic changed product state or counts as a
product failure.

## Verification receipts

| Gate | Result |
|---|---|
| Focused P17-007 A1 | PASS: 7 source paths, 13 decisions, 3 readiness attacks, 1 executable RED fixture |
| P17-004 cross-task compatibility | PASS: 9 source paths, 2 providers, 3 positive-controlled privacy families, 5 attacks |
| Post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Phase routing | PASS: 16 sections, 24 phases, 5 conditions |
| SemanticSpec | PASS: 8 assertions, 12 attacks |
| Provider source | PASS: 3 providers, 2 byte-identical skills, 5 shared runtimes |
| Provider distribution | PASS: 3 strict-admitted archives, 71 entries, 8 sidecars, 11 checksums, 79 text scans, 15 clean smokes, 4 attacks |
| Public readiness | PASS: 1 canonical contract and 40 attacks |
| Public links | PASS: 235 Markdown files, 48/48 relative links after evidence registration |
| Public secrets | PASS: 779 text files, 10 detector families, 0 findings after evidence registration |
| Privacy policy | PASS: 8 families, 10 contract groups, 15 attack groups |
| Pre-commit | PASS: 3/3 |
| TypeScript | PASS: 5.9.3, strict, no emit, `skipLibCheck=false`, zero diagnostics |
| Full `test:kit` | PASS: native exit 0; version `v3.25`; prompt 161,357/176,128 bytes; lessons 60/60 |

All seven source files were verified as UTF-8 without BOM, LF-only, NUL-free, JSON-valid where
applicable, and English-only under a detector first proven against Vietnamese text in `AGENTS.md`.
`git diff --check` was clean.

## Security and privacy result

No credential, environment value, provider session, private prompt/specification, repository path,
customer identifier, model output, transcript, or live-project coordinate was read or added. No
provider login or process was invoked. The fixture uses only reserved public identities and a
synthetic implementation task. Public secret scanning reported zero findings.

## A2 gate

A2 may implement only the pure schemas/evaluator and deterministic fixture materializer. Provider
execution adapters and external runs remain separate later slices. Before any external provider run,
the operator must supply exact runtime entitlement, model/CLI/adapter identities, isolated execution
policy, retention acceptance, and independently verifiable receipt authority for all three providers.

Missing Copilot CLI availability, stale authentication, incomplete providers, or unequal samples
must remain `needs_input`; they cannot be converted into a partial ranking.

## Rollback

Revert the evidence commit and source commit through normal Git history. A1 creates no runtime,
credential, external provider, database, dashboard, target, sync, tag, release, publication, or
visibility side effect, so rollback requires no external cleanup.

## Non-claims

This evidence does not claim provider execution, output equivalence, quality parity, performance
ranking, cost completeness, model availability, authentication, runtime adapter completion, P17-007
completion, sync, push, PR creation, merge, tag, release, publication, or visibility change.
