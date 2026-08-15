# P17-016 Wave B2B verification adapter evidence

**Date:** 2026-08-15
**Status:** Complete
**Roadmap task:** P17-016
**Approved scope:** `APPROVE P17-016 WAVE B2B VERIFY-ADAPTER v1: writer=V1, note=N1, context=A1, run=R1, receipt=L1, sink=S1, evidence=E1`

## Preconditions

- Kit starting HEAD: `1022fc4e66c0414218205f1691a56350e3d95ed7` on local `main`, clean.
- Dashboard starting HEAD: `4fab8ce2` on the required feature branch, clean.
- Existing 2026-08-15 backups were reverified before edits:
  - kit ZIP SHA-256: `9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655`;
  - dashboard ZIP SHA-256: `250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4`.
- `.codegraph/` was absent, so exact source anchors were read directly.
- Scope start and each material state transition were recorded immediately in both root handoffs.

## Scope and non-scope

The implementation changes only `kit.verification.record` and its contracts, tests, registry,
documentation, package registration, and evidence.

It retains the local git-note verification proof. It does not add a durable compatibility store,
trusted tenant attestation, central sink, migration, live database operation, dashboard change,
browser/provider operation, target `.Codex` edit, sync, or push. It does not modify the sync install
writer or telemetry writer.

## Contract outcome

| Input | Implemented outcome |
|---|---|
| V1 | Only `kit.verification.record` is adapted. |
| N1 | `refs/notes/verify` remains the authoritative local verification proof. |
| A1 | Missing trusted v2 server tenant attestation blocks before central record construction or sink work. |
| R1 | One UUID is created or validated at the record/capture command boundary and passed unchanged; environment state is not input authority. |
| L1 | One exact, frozen, in-process blocked receipt is emitted with no durable receipt store. |
| S1 | The legacy `verify_records` REST side effect is removed; no central sink is called. |
| E1 | Focused, historical, registry, compatibility, type, full, diff, and credential gates are recorded here. |

The closed receipt contains exactly `schemaVersion`, `policyVersion`, `writerId`, `runId`,
`tenantContextStatus`, `outcome`, `reasonCode`, and `createdAt`. Its fixed outcome is `blocked` with
`reasonCode=tenant_attestation_unavailable`. It contains no local note, repository, feature, path,
prompt, log, token, or secret field.

## Test-first evidence

1. The initial adapter contract test exited `1` with
   `Cannot find module './verification-writer-adapter'`, proving the old tree could not satisfy the
   UUID/context/receipt/no-I/O contract.
2. The initial integration test produced one pass and four failures, proving the old writer still
   contained the REST side effect, generated a legacy run ID, accepted environment authority, and
   did not reject a legacy explicit ID before tier execution.
3. After the pure adapter and call-site integration, the focused adapter test passed 7/7 and the
   integration test passed 5/5.
4. Historical reconciliation first produced 26 passes and two expected failures from the removed
   `pushVerifyRecord` tests. Review then found that an untyped low-level call could still generate a
   missing ID. A validation-only low-level path was added; the adapter suite expanded to 8/8.
5. The historical suite passed 28/28 after explicit UUID fixtures and exact receipt/no-fetch/no-raw
   assertions replaced the obsolete fail-open REST tests.
6. The B2B integration suite expanded to 6/6 with a real CLI proof that exactly one closed receipt
   is emitted, its UUID matches the retained note, and raw local-note identifiers are absent.

## Current verification results

| Gate | Result |
|---|---|
| `npm run test:record-verify` | PASS: adapter 8/8, B2B integration 6/6, historical 28/28 |
| `npm run test:post-17-kit-writer-registry` | PASS: 7 entries, 5 discovered source files, 8 attacks |
| `npm run test:post-17-privacy-b2a-input-lock` | PASS: accepted input lock retained; central B2 cutover blocked |
| `npm run test:post-17-privacy-writer-plan` | PASS: B1 boundary compatibility retained |
| TypeScript 5.9 exact-file check (`ES2022`/`bundler`, `--noEmit`) | PASS: seven changed/adjacent files plus imports |
| `npm run test:privacy-policy` | PASS: 8 families, 10 contract groups, 15 attack groups |
| `npm run test:privacy-writer` | PASS: 4 contract groups, 7 attack groups, 8 families |
| `npm run test:sync-verify-guard` | PASS: mocked/dry guard canary; no real sync |
| `npm run test:post-17-roadmap` | PASS: 22 tasks, 4 initiatives |
| `npm run test:synced-core` | PASS: 4 attack assertions |
| `npm run check:synced-core` | PASS: 4 byte-identical files |
| Third full `npm run test:kit` | PASS: exit 0 in 281.1 seconds |
| First source-commit cached review | PASS: exact 14-file manifest; production/test/docs diff reviewed |
| First source-commit `git diff --cached --check` | PASS after correcting three evidence-only trailing-space findings |
| First source-commit credential scan | PASS: 5/5 synthetic controls, 673 added lines, 0 hits |
| Closeout cached review | PASS: exact four-file generated-metadata/evidence manifest |
| Closeout `git diff --cached --check` | PASS |
| Closeout credential scan | PASS: 5/5 synthetic controls, 45 added lines, 0 hits |

The first full `npm run test:kit` attempt reached `test:post-17-wave-1-inputs` after all earlier
suites passed, then failed closed on generated flagship-boundary drift: recorded source SHA
`bb33e2a5...f410`, current source SHA `60d9a194...4053`. Scope was minimally expanded to refresh
only the repository-owned boundary artifact through its canonical generator and validator.

The canonical generator requires the flagship source to be committed and clean. The intended
non-circular protocol is therefore two local commits: the first contains the approved B2B source
set; the second contains regenerated boundary metadata and finalized evidence. The boundary keeps
the source commit identity while later metadata may have a newer commit identity.

The source commit is `7643eea39c5fc79cfefd75c0ad9d4f0cb8b3a57e`. The canonical generator
then changed only `docs/roadmap/post-17-orchestrator-boundaries.json`, binding source blob
`6123ddf81f4ba344048601099090e7b4a401e786`, canonical SHA-256
`60d9a1946c4b9cd4fa0c8a40ce0e7b55fe35c76c3b1815a759f6136cad9a4053`, date 2026-08-15, and
unchanged 2686-line count. `test:post17-boundary-refresh` passes 6/6 attacks;
`test:post-17-wave-1-inputs` passes 23 mandatory phases, one conditional phase, three providers,
and seven negative controls. The registered record aggregate remains 8/8 + 6/6 + 28/28.

The second full regression passed the refreshed Wave-1 boundary in-chain, then failed closed at
`test:post-17-phase-capabilities`: the capability matrix pinned prior boundary hash
`80a544ba...5ac` instead of current `5c688a72...182`. Scope was minimally expanded to reconcile
the downstream generated-hash chain and refresh only canonical dependent metadata, without
changing semantic capabilities or routing.

Live SHA reconciliation confirmed current boundary hash `5c688a72987311ba7d88bd98bf9de1434175dac5fc57c266508eb8a460a03182`.
Only the matrix generation date, pinned boundary hash, and validator's exact date assertion changed;
semantic capability and routing content did not. The refreshed matrix passes 24 phases, seven
official sources, and 15 negative controls. Its downstream routing plan passes 16 sections, 24
phases, and five conditions; provider bundles pass three providers, two skills, and five runtimes;
provider distribution passes three archives, 15 clean runtime smokes, and three attacks. Historical
cross-platform evidence remains unchanged because its pinned matrix hash identifies that earlier
CI artifact.

The third full `npm run test:kit` passed in 281.1 seconds. The full chain includes the registered
B2B 8/8 + 6/6 + 28/28 suites, all post-17 boundary/capability/routing/privacy gates,
provider/distribution, mock-only sync guard, cross-platform release, Playwright, version/index,
prompt budget (`163,206/176,128` bytes), and 60/60 lesson synchronization.

The first isolated type invocation intentionally used `--module commonjs` and failed only with
existing `TS1343` in imported `scripts/sync-to-targets.ts`, whose `import.meta` requires an ES
module-compatible compiler mode. Re-running the identical file set with repository-compatible
`--module ES2022 --moduleResolution bundler` passed with no diagnostics.

The registry now classifies the exact adapter source as `in_process`, `contract_validated`, with
no prohibited-field observations and disposition
`fail_closed/tenant_attestation_and_sink_unavailable`. The other two B2 candidates remain
`adapter_planned` and separately scoped.

## Closeout result

The exact four-file closeout candidate passed full diff review, whitespace validation, and the
positive-control credential scan. Commit content and repository cleanliness are verified by the
post-commit readback recorded in the workspace handoff; this evidence intentionally does not embed
its own commit identity.

No sync or push is authorized by this evidence.
