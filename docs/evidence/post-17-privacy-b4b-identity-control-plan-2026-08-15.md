# P17-016 Wave B4B identity-control plan evidence

**Date:** 2026-08-15
**Scope:** `I1/V1/A1/M1/S1/U1/R1/G1/E1`
**Kit source commit:** `e48b97ad2a7bcd040f23bbddfe04d7c3204e804b`
**Dashboard source commit:** `ad3d7933069c439108c10573484ca123b74db0a5`

## Result

The executable B4B plan and dashboard identity-control hardening are locally implemented and
proven. Seven essential private-admin identity operations now use exact bounded contracts, retain
their existing authorization and storage behavior, close raw infrastructure failures, and require
an operation-specific success result. Non-atomic token regeneration is disabled in the UI and
returns one fixed HTTP 409 response before client creation or secret generation.

The approved I1 exception remains explicit: existing raw owner name, owner email, role email, and
bypass label storage is private-admin behavior, not tenant-safe storage. P17-016 remains
`in_progress`; Wave C still owns tenant attestation, tenant-scoped persistence, RLS, migration,
atomic token rotation, and cutover.

## Plan-first and RED proof

The first plan-validator run failed on one case-sensitive normative phrase. After the plan locked
all nine inputs and the prohibition on production side effects, the executable validator passed
before production code changed.

Offline RED proved five missing cutover boundaries: no typed bootstrap, raw identity error echoes,
live revoke-then-insert regeneration, ignored UI failures/refresh, and deferred registry truth.
The new domain and client suites also failed before collection because their clean-boundary modules
did not exist. RED diagnostics contained only source booleans, fixed fake values, registry states,
and missing paths. They invoked no production global client, create-admin provider, browser,
network, Supabase, provider, target, sync, deploy, canary, or external state.

## Locked contract

- Mutation bodies are exact plain JSON objects and are capped at 4,096 actual UTF-8 bytes.
- Authorization precedes parsing, secret generation, client construction, and storage access.
- Token/bypass inserts require one valid ID receipt; status/revoke requires the exact changed
  `id,status` receipt; zero-row and malformed results do not become success.
- Existing role grant/revoke RPCs remain the atomic role-plus-audit boundary. B4B makes no
  affected-row claim for their existing void-RPC success contract.
- API failures use fixed allowlisted codes/messages and never echo raw provider/database text.
- UI refresh occurs only after a valid HTTP success envelope; previous one-time secrets are cleared
  before a new create attempt.
- Token regeneration performs no client, crypto, read, revoke, insert, or refresh path.
- Registry truth is exactly seven `identity_hardened` entries plus one explicit `fail_closed`
  regeneration entry.

## Verification

| Gate | Result |
|---|---|
| Final B4B plan validator | PASS — `I1/V1/A1/M1/S1/U1/R1/G1/E1` locked |
| Focused dashboard aggregate | PASS — 7 files / 41 tests |
| B4A/B4B registry truth | PASS — 3 files / 14 tests |
| Exact B4B core TypeScript | PASS with `skipLibCheck=false` |
| Exact routes/UI TypeScript | PASS with framework declaration checks skipped |
| Full dashboard TypeScript comparison | Only the pre-existing assurance missing-export diagnostic; no B4B diagnostic |
| Exact dashboard full suite | PASS — 79 files / 531 tests / 27.71 seconds |
| Exact full kit suite at source commit | PASS — exit 0 / 294.9 seconds / 1,567 output lines |
| Prompt budget | PASS — 163,206 / 176,128 bytes |
| Lesson annotations | PASS — 60 / 60 |
| Kit source hook | PASS — `spec-integrity`, one TypeScript file checked |

Five credential detectors matched their synthetic controls and found zero private-key, JWT,
provider-token, named environment-secret assignment, or credential-URI hits across both exact
staged source additions. Cached whitespace checks passed.

Exact kit source readback:

- commit: `e48b97ad2a7bcd040f23bbddfe04d7c3204e804b`
- parent: `ff6ac57068653ccda73d84766b91f47badba630e`
- manifest: 3 files, 392 insertions, 1 deletion
- branch: `main`, local only
- source worktree after commit: clean

## Backup, rollback, and external-state proof

The verified 2026-08-15 kit snapshot is 20,291,659 bytes with SHA-256
`9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`. The dashboard snapshot is
5,495,854 bytes with SHA-256
`250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`. Rollback is the verified
snapshot/tag or a local revert of the isolated source/evidence commits.

No sync, push, live canary, browser, database, provider, migration, deployment, target edit, or
target command occurred.

## Non-claims

This evidence does not claim identity data tenant safe, token rotation atomic, historical identity
rows migrated, Wave C complete, P17-016 complete, or the unrelated dashboard assurance TypeScript
baseline fixed. It grants no authority to sync, push, merge, deploy, mutate Supabase, run a
provider, operate a browser, or edit a target.
