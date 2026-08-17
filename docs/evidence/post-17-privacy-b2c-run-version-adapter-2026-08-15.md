# P17-016 Wave B2C run-version adapter evidence

**Date:** 2026-08-15
**Status:** Complete
**Roadmap task:** P17-016
**Locked scope:** `writer=U1, core=C1, auth=X1, marker=M1, context=A1, run=R1, receipt=L1, sink=S1, docs=D1, evidence=E1`
**Authority:** The user-provided durable goal grants every required permission except push.

## Result

`kit.telemetry.central-upsert` no longer sends the raw per-repository run-version mutation to
`repo_runs`. A successful legacy token authentication still emits the existing kit meta marker,
then creates one command-boundary UUID and emits one exact blocked in-process privacy receipt.
Legacy authentication success is not tenant attestation and does not unlock a central sink.

The shared UUID and compatibility-receipt rules now have one canonical source under
`packages/core`. The verification and run-version adapters are thin writer-specific wrappers. The
verification wrapper retains its public exports and every B2B behavior test. The generated kit core
mirror is byte-identical to canonical source.

No central row, durable local receipt, tenant context, sink capability, database migration,
dashboard change, target edit, sync, or push is claimed.

## Preconditions

- Starting kit head: `b84605f30e53a90a56c7d8280d714bbf9920eb6a`, local `main`, clean.
- Dashboard remained untouched at feature-branch head
  `4fab8ce2dae9a3821d099aaa66973cc3c4e21f07`, clean.
- Reused verified 2026-08-15 kit snapshot: 20,291,659 bytes, SHA-256
  `9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`.
- Reused verified 2026-08-15 dashboard snapshot: 5,495,854 bytes, SHA-256
  `250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`.
- CodeGraph was absent at the kit root, so exact source anchors were inspected directly.

## Plan-first proof

The formal plan was created and its validator passed before production code changed. It locks the
clean dependency direction, exact runtime sequence, file boundary, RED controls, attacks, public
truth updates, evidence ladder, exclusions, failure handling, and rollback. The full kit suite
registers this plan gate.

## RED controls

The pre-implementation candidate could not satisfy B2C:

| Control | Expected RED result |
|---|---|
| Shared compatibility core | Exit 1: `Cannot find module './blocked-central-writer'` |
| Run-version adapter | Exit 1: `Cannot find module './run-version-writer-adapter'` |
| Mocked valid telemetry verify | 17 passed, 1 failed; observed `verify_rpc,repo_runs_write` |

The mock harness exposed only a closed endpoint category and HTTP method. It did not output URL,
headers, body, token, owner data, or credentials. No live request was made.

## Implementation boundaries

### Shared pure core

The canonical core owns UUID generation/validation, exact input/receipt keys, writer-ID validation,
canonical timestamps, frozen receipts, and closed non-echo errors. Static attacks prove it imports
no environment, filesystem, process, network, repository, RPC, or sink dependency. The canonical
mirror generator now manages five byte-identical files instead of four.

### Compatibility wrappers

The verification wrapper maps core refusals back to the historical
`verification writer adapter refused` boundary and preserves all existing function names and exact
receipt behavior. The run-version wrapper binds only `kit.telemetry.central-upsert` and exposes no
repository, owner, token, kit-version, tenant, subject, or sink input.

### Telemetry command boundary

The `verify` CLI case owns one new UUID. It does not read `KIT_RUN_ID` as authority. Missing,
invalid, quota, and infrastructure authentication outcomes retain their prior exit semantics and do
not attempt the writer. Valid auth keeps the existing meta marker, emits one separate
`@@PRIVACY_RECEIPT@@` line, and makes zero `repo_runs` requests. Feature/error inserts and their
token RPC stay unchanged and explicitly migration-blocked.

### Registry and documentation

Only `kit.telemetry.central-upsert` changes to
`in_process/contract_validated/fail_closed/tenant_attestation_and_sink_unavailable`. The install
writer remains adapter-planned. Three legacy RPC/insert entries remain migration-blocked. README,
measurement design, telemetry comments, and the sync version-format comment state that new
run-version reporting is paused until a tenant-attested Wave C sink exists.

## Verification results

| Gate | Result |
|---|---|
| B2C formal plan | PASS: U1/C1/X1/M1/A1/R1/L1/S1/D1/E1 locked |
| Shared compatibility core | PASS: 7/7 |
| Run-version adapter | PASS: 5/5 |
| Telemetry CLI/mock aggregate | PASS: 18/18 |
| B2B verification adapter | PASS: 8/8 |
| B2B integration | PASS: 6/6 |
| Historical record verification | PASS: 28/28 |
| Writer registry | PASS: 7 entries, 6 source files, 8 attacks |
| B2A compatibility | PASS: central sink remains blocked |
| B1 writer plan | PASS: 21 sections, 5 refinements |
| Privacy policy | PASS: 8 families, 10 contract groups, 15 attack groups |
| Privacy writer | PASS: 4 contract groups, 7 attack groups, 8 families |
| Canonical synced core | PASS: 4 attacks, 5 byte-identical files |
| Mock-only sync verification guard | PASS: guard remains fail-closed; no real sync |
| Canonical post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Exact TypeScript 5.9.3 | PASS under ES2022/bundler mode; no casts or `skipLibCheck` |
| First full `npm run test:kit` | PASS: exit 0 in 215.4 seconds before final writer allowlist hardening |
| Authoritative full `npm run test:kit` | PASS: exit 0 in 214.1 seconds after writer allowlist hardening |
| Prompt budget in full chain | PASS: 163,206 / 176,128 bytes |
| Lesson synchronization in full chain | PASS: 60/60 |

## Findings corrected during verification

1. The malformed-version telemetry fixture initially copied only telemetry and kit-version. The new
   dependency graph correctly failed module resolution before the intended authority assertion. The
   fixture now copies the exact adapter/core dependencies and the original malformed-version check
   passes unchanged.
2. The shared core was initially placed directly in the generated `.claude/integrations/core`
   directory. The canonical mirror gate refused it as an extra. Source and tests were moved to
   `packages/core`, the mirror manifest was extended, and canonical generation/check now passes.
3. The first requested TypeScript 5.9 command resolved the local 4.9 binary and rejected bundler
   mode before source analysis. The installed dashboard TypeScript 5.9.3 executable was used
   explicitly.
4. TypeScript 5.9.3 then exposed one boolean-discriminant narrowing issue in legacy telemetry. The
   branch now uses `result.valid === true`; runtime auth behavior and focused tests remain unchanged.
5. Exact production diff review found that the core validated writer syntax but did not enforce the
   documented allowlist. Receipt construction and validation now accept only the two implemented
   writer IDs. An unknown but syntactically valid writer attack passes. The future install adapter
   must extend this list only inside its separately approved cutover.

## Exact candidate manifest

The local commit candidate is limited to:

- shared canonical core, focused test, generated mirror, and mirror manifest;
- verification compatibility wrapper;
- run-version wrapper and focused test;
- telemetry implementation, test, and safe mock harness;
- B2C plan and validator;
- registry, discovery attack, B2A compatibility, and B1 next-slice truth;
- package/full-suite registration;
- README, measurement design, telemetry comments, and sync version-comment truth; and
- this evidence file.

The flagship command and generated orchestrator boundary are unchanged. Dashboard, migration,
provider, target, and external state are unchanged.

## Local source closeout

- Source commit: `7a604222f656b43dc076752a1282e2b9d597b255` (`feat: add fail-closed
  run-version adapter`).
- Exact source manifest: 21 files, 1,264 insertions, 170 deletions, zero unstaged files, and zero
  untracked files at the commit boundary.
- Cached and parent-commit whitespace checks passed. Commit readback contains the same 21 paths and
  the normal `spec-integrity` hook passed.
- The old `/rest/v1/repo_runs` path and generic `upsert` helper are absent from production telemetry
  under both fixed-string `rg` and `Select-String`; the mock harness and parent source supplied
  positive controls. Runtime mock proof independently observes one auth RPC and zero repo-run write.
- Five credential detectors first matched all five synthetic positive controls, then scanned all
  1,264 staged added lines: GitHub token 0, Supabase service key 0, bearer token 0, JWT 0, private
  key 0.
- The evidence-only closeout commit changes no runtime source. Final worktree and dashboard-state
  readback is recorded in the workspace handoffs because a commit cannot self-record its own SHA.
- No sync, push, migration, dashboard mutation, target edit, or live external I/O occurred.
