# P17-016 Wave B4A dashboard-adapter plan evidence

**Date:** 2026-08-15
**Scope:** `P1/R1/D1/K1/U1/L1/C1/F1/E1`
**Kit source commit:** `a830802b868c52592c65360e34694ae4b8846d1a`
**Dashboard source commit:** `fa611f9d39a899eb87f0666a2aa7314f220da775`

## Result

The executable B4A plan, canonical blocked-writer allowlist, and dashboard distribution contract
are locally implemented and proven. The kit owns the exact privacy policy/writer/blocked-receipt
logic; the dashboard receives byte-identical generated copies and binds four thin fail-closed
adapters. P17-016 remains `in_progress` because B4B identity hardening and Wave C tenant storage are
not implemented.

## Plan-first and RED proof

The first plan-validator run failed on one missing exact normative phrase: `one command UUID per
operator attempt`. After that phrase was added, the validator locked all nine inputs before any
production edit.

Offline RED then proved:

- four dashboard IDs were refused by the old canonical allowlist;
- production progress, release, and deploy-history source still exposed their legacy central
  transports; and
- dashboard mirror/adapter modules were absent.

No RED test invoked an operator main, deploy, sync, live canary, child process, browser, network,
Supabase, provider, target, or external state.

## Canonical source changes

- Added exactly four dashboard IDs to `BLOCKED_CENTRAL_WRITER_IDS`.
- Kept `packages/core/src` and `.claude/integrations/core` byte-identical.
- Corrected a TypeScript 5 narrowing issue in release `lessonCodes` without changing runtime
  validation semantics.
- Added the executable B4A plan validator to the full kit chain.

The canonical source, `.claude` mirror, and dashboard generated mirror share these hashes:

| File | SHA-256 |
|---|---|
| `blocked-central-writer.ts` | `9DEBE0ECC95FF70EEDDE7C40742CFB698E2A5C93E5123247E2036D3710EE64E8` |
| `privacy-policy.ts` | `66C2083291466C0FEB5A7734087F04E718ABB2608C046CC12AA08F21CF7FEFC5` |
| `privacy-writer.ts` | `B8F27BAAF5C9C3E39F3FD21C233E994109CDDE38819F0C5195C8D2034F026EE8` |

## Verification

| Gate | Result |
|---|---|
| Final B4A plan validator | PASS — all nine locked inputs |
| Canonical blocked-writer suite | PASS — seven writer IDs and closed attack cases |
| Privacy-policy suite | PASS — eight families, ten contract groups, fifteen attacks |
| Canonical mirror test/check | PASS — five kit mirror files remain identical |
| Dashboard privacy mirror | PASS — three files / 60,931 bytes / byte-identical |
| Dashboard final full suite | PASS — 74 files / 507 tests / 8.37 seconds |
| Exact full kit suite at source commit | PASS — exit 0 / 248.4 seconds / 1,566 output lines |
| Prompt budget | PASS — 163,206 / 176,128 bytes |
| Lesson annotations | PASS — 60 / 60 |
| Source commit hook | PASS — `spec-integrity`, 6 TypeScript files checked |

The exact kit source manifest contained 8 files, 380 insertions, and 11 deletions. Staged and
parent-commit whitespace checks passed. Five credential detectors matched all synthetic controls
and found zero GitHub-token, Supabase-service-key, bearer-token, JWT, or private-key hits across all
380 staged additions.

Exact source readback:

- commit: `a830802b868c52592c65360e34694ae4b8846d1a`
- parent: `98a929b7e76b2dfc9a4134be96065a69d8782742`
- branch: `main`, local only
- source worktree after commit: clean

## Backup, rollback, and external-state proof

The verified 2026-08-15 kit snapshot is 20,291,659 bytes with SHA-256
`9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`. The dashboard snapshot is
5,495,854 bytes with SHA-256
`250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`. Rollback is the snapshot/tag
or a local revert of the isolated source/evidence commits.

No sync, push, live canary, browser, database, provider, migration, deployment, target edit, or
target command occurred.

## Non-claims

This evidence does not claim B4B identity hardening, token-regeneration atomicity, tenant
attestation, tenant-safe persistence, historical migration, Wave B completion, P17-016 completion,
or third-party declaration cleanliness. It grants no authority to sync, push, merge, deploy, mutate
Supabase, run a provider, operate a browser, or edit a target.
