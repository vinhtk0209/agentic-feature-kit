# P17-016 Wave C1 tenant-foundation plan evidence

**Date:** 2026-08-15
**Scope:** `F1/M1/G1/A1/Q1/S1/X1/R1/E1`
**Source commit:** `ea16e95095867b14433aa1fc80a0cfa73e778410`

## Result

Wave C1 is locally complete as a plan/readiness checkpoint. It locks the smallest safe path from
the completed fail-closed writer boundary to tenant-scoped storage and divides the remaining work
into separately provable C2-C5 subwaves. C1 changes no dashboard source, migration, SQL, runtime,
schema, database, browser, provider, target, or external state.

Only C1 is input-complete. C2 requires an exact repository/live schema inventory before additive
SQL can be written for externally defined tables. C5 requires separate authorization for the named
database project, a verified pre-migration snapshot/export, and rehearsed rollback SQL. Central
sink capability remains unavailable.

## Reconciled boundary

The executable plan records these source-backed facts:

- Wave B leaves new central writers local/fail-closed and seven private-admin identity mutations
  hardened without a tenant-safety claim.
- Legacy `command_runs`/`token_usage`, `installs`/`repo_runs`/`verify_records`, global-email roles,
  and unscoped progress identities cannot satisfy the accepted tenant policy.
- The dashboard service-role constructor has no required tenant argument or tenant-scoped
  repository boundary.
- Repository migrations do not define the complete live schema for all legacy identity/usage/error
  tables, so C2 may not infer their columns or migration ownership.
- No tenant, membership, processing grant, trusted attestation, tenant-keyed opaque-ID capability,
  tenant-scoped sink, or tenant-safe read repository currently exists.

## Locked C1 decisions

- `F1`: opaque UUID tenant identity and closed states; no silent bootstrap assignment.
- `M1`: server-resolved `auth.uid()` membership; email is not a tenant selector.
- `G1`: versioned exact processing grants; optional scopes default off.
- `A1`: exact integrity-bound attestation; environment/payload/repository/legacy RPC are untrusted.
- `Q1`: additive nullable tenant/quarantine state before explicit mapping and sanitization.
- `S1`: no central sink until schema/RLS/repository/attestation/grant/two-tenant/rollback proof.
- `X1`: C1 is offline plan/evidence only and touches no dashboard or SQL file.
- `R1`: forward rollback and verified database snapshot precede migration execution.
- `E1`: plan-first attacks, exact tests, positive controls, credential scan, isolated commits, and
  truthful offline/live labels.

## Verification

| Gate | Result |
|---|---|
| C1 executable validator | PASS — `F1/M1/G1/A1/Q1/S1/X1/R1/E1` locked |
| Policy decision | PASS — `T1/R1/C1/L1/E1` accepted |
| Privacy implementation plan | PASS — six waves retained |
| B2A input lock | PASS — central cutover remains blocked |
| B4A/B4B plan companions | PASS |
| Kit writer registry | PASS — 7 entries / 6 sources / 8 attacks |
| Control-plane topology | PASS — `T1/M1/X1/R1/E1/S1` retained |
| Post-17 roadmap | PASS — 22 tasks / 4 initiatives |
| Exact validator TypeScript 5.9.3 | PASS — ES2022/bundler, no emit |
| Exact full kit at source commit | PASS — exit 0 / 332.0 seconds / 1,572 output lines |
| Prompt budget gate | PASS — 163,206 / 176,128 bytes |
| Lesson annotations | PASS — 60 / 60 |
| Source hook | PASS — `spec-integrity`, one TypeScript file checked |

The first exact TypeScript command used the kit-pinned TypeScript 4.9 compiler and exited before
source checking because that compiler does not support `moduleResolution=bundler`. The identical
file passed with the already installed dashboard TypeScript 5.9.3 compiler. No source change was
made to hide the tool-version boundary.

The first plan-validator run failed only because a line-broken negative non-claim matched the
validator's positive-claim guard after whitespace normalization. Rewording that non-claim to
`central sink availability` made the intended guard unambiguous; no runtime or external file had
changed.

Five credential detectors matched their synthetic controls and found zero private-key, JWT,
provider-token, named environment-secret assignment, or credential-URI hits in the exact staged
source additions. Cached whitespace and exact manifest review passed.

Exact source readback:

- commit: `ea16e95095867b14433aa1fc80a0cfa73e778410`
- parent: `d0343274173d104ef9adfdaae009dedc20bf2510`
- manifest: 3 files, 343 insertions, 1 deletion
- branch: `main`, local only
- dashboard worktree: unchanged and clean
- source worktree after commit: clean

## Backup, rollback, and external-state proof

The verified 2026-08-15 kit snapshot is 20,291,659 bytes with SHA-256
`9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`. The dashboard snapshot is
5,495,854 bytes with SHA-256
`250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`. C1 rollback is restoration
from the verified kit snapshot/tag or a local revert of its isolated source/evidence commits.

No database/catalog query, migration, SQL execution, browser operation, provider run, sync, push,
merge, deploy, canary, target command, or target `.Codex` edit occurred.

## Non-claims

C1 does not claim tenant creation, membership enforcement, consent storage, attestation issuance or
verification, tenant-scoped repository/RLS, legacy quarantine, central sink availability,
migration SQL writing/execution, Wave C completion, or P17-016 completion. C2-C5 retain their own
input, external authorization, implementation, rollback, and evidence gates.
