# P17-019 A1 Credential Lifecycle Input-Lock Evidence

**Date:** 2026-08-21
**Status:** Locally qualified planning/input-lock slice; runtime readiness remains blocked
**Branch:** `p17-019-a1-credential-lifecycle-input-lock`
**Source commit:** `457367a1fe1798be87c10f2477fff5dd006c41e1`
**Source parent:** `f12e5df81837ca682b05318ed113da040152ec44`
**Source tree:** `a99dae3d1b047e8dc1eda118036c81bab3545eb7`

## Outcome

P17-019 A1 locks the architecture, authority, privacy, compatibility, evidence, and performance
inputs for a future credential-lifecycle adapter. It corrects one false setup claim and adds an
executable regression validator. It deliberately does not implement token refresh.

The roadmap remains `backlog`, `readiness.complete` remains `false`, and the unresolved input remains
exactly `project-specific refresh capability fixture and security approval`.

## Locked decision

The accepted tuple is:

`boundary=B1, authority=A1, ownership=O1, expiry=E1, refresh=R1, execution=X1, receipt=C1, privacy=P1, compatibility=L1, evidence=V1, performance=T1, scope=N1`

- Shared core owns metadata, lifecycle decisions, closed reason codes, and receipt validation only.
- A project supplies a non-serializable `ProjectCredentialRefreshCapability`; no global or inferred
  refresh authority exists.
- Refresh may run once before browser launch. Mid-run expiry closes as `expired_mid_run`; browser
  interactions are never replayed transparently.
- In-process TypeScript is the default. A project executable is conditional and must be absolute,
  digest/version pinned, direct-argv with `shell:false`, secret-free in argv/output, bounded, and
  independently qualified.
- A built-in generic HTTP refresh path is rejected.
- Durable receipts contain allowlisted metadata only. Tokens, cookies, codes, headers, provider
  payloads, paths, URLs, output, and secret-derived fingerprints are forbidden.
- Rust or Go is reconsidered only after measured TypeScript p95/RSS/coordinator thresholds are
  breached or Node lacks a required operating-system protection. Python is considered only when the
  approved project authority already uses Python.

## Source authority

The immutable source commit contains exactly seven paths:

1. `.claude/SETUP.md`
2. `docs/roadmap/p17-019-a1-credential-lifecycle-input-lock-plan.md`
3. `docs/roadmap/post-17-roadmap.json`
4. `docs/roadmap/post-17-roadmap.md`
5. `package.json`
6. `release/public-release-manifest.json`
7. `scripts/post-17-credential-lifecycle-input-lock-plan.test.ts`

Readback reports 538 insertions and 3 deletions. The normal `spec-integrity` hook passed for the one
TypeScript path. No production credential, B11, Playwright runner, provider runtime, dashboard,
target, sync, or distribution source belongs to this slice.

## Reconciled current behavior

Read-only source reconciliation established that:

- B11 reads the existing Playwright credential inputs and fails closed for missing, expired, or
  under-six-hour access tokens before browser execution.
- `version-check.ts` classifies credential expiry but does not refresh credentials.
- `playwright-runner.ts` injects configured access/refresh/expiry values but implements no refresh
  protocol.
- `workflow:login` verifies and stores the kit license token only. It does not mint or populate
  Playwright access, refresh, or expiry credentials.

The corrected setup guide now states this separation explicitly.

## External design inputs

The design uses primary sources only:

- [Playwright authentication guidance](https://playwright.dev/docs/auth) treats stored browser state
  as sensitive and recommends keeping it out of repositories. This supports the closed secret-
  ownership and evidence boundary.
- [OAuth 2.0 refresh-token processing](https://www.rfc-editor.org/rfc/rfc6749#section-6) makes refresh
  dependent on authorization-server and client-authentication rules. A provider-neutral core cannot
  safely invent those project-specific rules.
- [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/info/rfc9700/) is the current
  security BCP used as the review baseline for future project adapters.
- [Node.js child-process documentation](https://nodejs.org/api/child_process.html) supports direct
  process execution without a shell; any future executable adapter keeps `shell:false` and fixed
  argument boundaries.

These sources inform the architecture. They do not prove a project adapter or live refresh.

## RED-to-GREEN evidence

The same focused validator was advanced one boundary at a time:

1. RED: the A1 plan was absent.
2. RED: Markdown wrapping split a required plan phrase.
3. RED: a case-sensitive prose oracle rejected an existing option label.
4. RED: the roadmap did not register the new plan input.
5. RED: setup blockquote wrapping interrupted the corrected truth phrase.
6. RED: a Node-version-specific assertion expected error prose instead of the structural operator.
7. RED: the new test manifest row was placed before `control-*` instead of after it under JavaScript
   ordinal sorting.
8. GREEN: focused validator passed 7 source paths, 12 decisions, 3 readiness mutation attacks, and
   1 documentation regression attack.
9. Expected pre-stage boundary: public link readiness returned `link-source-invalid` for the new
   untracked plan; the same gate passed after exact Git-index staging.
10. RED: TypeScript 5.9.3 found one local TS7022 inference diagnostic in the validator.
11. GREEN: an explicit `JsonRecord[]` local annotation resolved the diagnostic without a cast or
    weakened runtime assertion; focused behavior remained unchanged.

Two infrastructure attempts are excluded from product evidence: the first byte-audit helper had a
PowerShell loop-pipe parser error, and the first full-suite receipt wrapper split the spaced npm-cli
path and failed before npm. Both were corrected and rerun successfully without source drift.

## Verification receipts

| Gate | Result |
|---|---|
| Focused P17-019 A1 | PASS: 7 paths, 12 decisions, 3 readiness attacks, 1 documentation attack |
| Post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| B11 runner | PASS: 51/51 |
| Playwright runner | PASS: 63/63 |
| Version | PASS: all stamps at `v3.25` |
| Public release aggregate | PASS: 18 core attacks; 735 manifest paths; 222 Markdown files; 48/48 links; 4 lockfiles; 754 dependency occurrences; 617 unique dependencies; 732 text files; 10 secret detector families; zero findings |
| Pre-commit | PASS: 3/3 |
| Provider source | PASS: 3 providers, 2 byte-identical skills, 5 shared runtimes |
| Provider distribution | PASS: 3 strict-admitted deterministic archives, 71 entries, 8 sidecars, 11 checksums, 79 text scans, 15 clean smokes, 4 attacks |
| TypeScript | PASS: ephemeral 5.9.3, strict, no emit, `skipLibCheck=false`, zero diagnostics |
| Full `test:kit` | PASS: native exit 0 in 414,095 ms; terminal version `v3.25`, prompt 160,919/176,128 bytes, lessons 60/60 |

Full-suite stdout is 146,822 bytes / 2,393 lines with SHA-256
`6fdf88430fc3eacd9463b25ea72061140ce86ebddc75a21371c1e57dba140fce`. Stderr is
1,074 bytes / 10 expected fixture-warning lines with SHA-256
`f25c87f7941dec1b07a5a85085ea1fa9c93113f9af422643c6b6cb49377d94fb`.

After the suite, HEAD, source tree, seven-path index, zero-residue status, and cached diff-check were
unchanged. Before commit, all staged blobs were UTF-8, no-BOM, LF-only, and final-newline terminated.
JSON parsing, English-only feature-content scanning with a positive control, and public secret
scanning were GREEN.

## Security and privacy result

No secret or live browser state was read. No token, cookie, authorization code, client credential,
provider response, environment value, endpoint, or project identity was added to source or evidence.
The public secret gate used ten detector families over all 732 public text files and reported zero
findings. Provider bundles were not widened with a refresh capability.

## A2 gate

A2 may start only after an exact synthetic project fixture digest and accepted security reference
are available. The action template is not itself approval:

`APPROVE P17-019 A2 INPUT-LOCK v1: project=<opaque-profile>, authority=A1, ownership=O1, expiry=E1, refresh=R1, execution=<in-process|executable>, fixture=<sha256>, security=<accepted-ref>, evidence=V1`

Placeholder, stale, secret-bearing, partial, or cross-project packets remain incomplete.

## Rollback

Revert the evidence commit and source commit through normal Git history. Because A1 adds no runtime,
credential write, external call, migration, sync, target edit, or release side effect, rollback does
not require token revocation, browser cleanup, database recovery, or provider action.

## Non-claims

This evidence does not claim refresh implementation, refresh success, provider compatibility, live
authentication, browser execution, credential rotation, runtime readiness, package publication,
release eligibility, sync, push, PR creation, merge, tag, release, or visibility change. P17-019
remains backlog and blocked on the exact project fixture and security approval.
