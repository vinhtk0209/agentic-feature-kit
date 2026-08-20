# P17-016 Wave C5B Isolated-Restore Cleanup Capability Evidence

Date: 2026-08-20
Status: local source qualified; remote qualification follows this evidence head

## Scope

This checkpoint implements canonical C5B operation eight as one provider-neutral application
capability. It closes the gap between the existing operator's injected `cleanupIsolatedRestore`
port and a future provider composition root without introducing provider, database, process,
network, SQL, filesystem, or live destructive behavior into shared core.

Decision plan:
`docs/roadmap/p17-016-wave-c5b-isolated-restore-cleanup-capability-plan.md`.

Source commit: `7377a9ab84c922f2ef9240c5387c48c4a560dcd4`

Source parent: `91d256c6a60daa23ab59010b910cf8a501e3491c`

Source tree: `5923848e906f38ce2a132f652a0cd83c40fd09d0`

The source commit contains exactly:

1. `.claude/integrations/core/live-cutover-isolated-restore-cleanup-node.ts`;
2. `docs/roadmap/p17-016-wave-c5b-isolated-restore-cleanup-capability-plan.md`;
3. `package.json`;
4. `packages/core/src/live-cutover-isolated-restore-cleanup-node.ts`;
5. `packages/core/test/live-cutover-isolated-restore-cleanup-node.test.ts`;
6. `release/public-release-manifest.json`;
7. `scripts/build-synced-core.ts`; and
8. `scripts/post-17-privacy-wave-c5b-isolated-restore-cleanup-capability-plan.test.ts`.

## Read-only reconciliation

Fixed-string and semantic searches found `cleanup_isolated_restore` in the schema, core reducer,
operator, and fake tests. They found no cleanup runtime, focused runtime test, synced mirror,
decision plan, package route, or public admission. The logical-backup plan explicitly leaves the
isolated database cleanup port external, while the restored-state verifier explicitly refuses
cleanup ownership. Operations five and six were already implemented by the logical adapter;
operation eight was therefore the first real capability gap after restored-state verification.

## RED history

The following failures were observed before qualification:

1. The first plan-validator launch stopped in the desktop sandbox at Node `userInfo` with the known
   `uv_os_get_passwd ENOMEM` launcher failure. It never loaded the validator and was not counted.
2. The unchanged validator then ran outside that sandbox and exited `1` for exactly the absent
   cleanup decision plan.
3. After the plan passed, the grouped runtime harness exited `1` at the exact absent module
   `../src/live-cutover-isolated-restore-cleanup-node`.
4. TypeScript 5.9.3 strict checking found one test-only control-flow narrowing around a signal set
   from an async callback. An explicit local test-boundary assertion fixed it; production types were
   not weakened.
5. Review found that a plain malformed cleanup result could expose an accessible token before
   exact-shape rejection. The boundary now captures and zeroizes that token before shape checking.
6. Review also added direct accessor, Symbol, hostile-proxy, residual-observation timeout, abort,
   late-settlement, and failure-path token-zeroization attacks.
7. The first strict byte audit found Markdown hard-break spaces on two plan header lines. Only those
   spaces were removed before the complete encoding audit was rerun.
8. Before staging, the Git-index public authority passed `6/7` and failed only because five newly
   declared cleanup paths were absent from the prior index. After exact staging, the same unchanged
   gate passed `7/7`.

No runtime guard, reason code, privacy detector, public authority, or parent behavior was weakened
to obtain GREEN.

## Implemented contract

The runtime enforces:

- exact seven-receipt admission with next operation `cleanup_isolated_restore`;
- factory-wide single use after the first admitted context;
- two exact, non-aliased capability objects and distinct functions for cleanup and residual
  observation;
- a preconfigured capability ID while the packet cannot select any resource identifier;
- attempt, packet, source-backup, restore-manifest, and capability binding on both responses;
- one total `AbortSignal` deadline across cleanup and residual observation;
- trusted canonical, monotonic time inside the packet freeze window;
- observation only after a valid cleanup confirmation and while the same signal remains active;
- bounded plain `Uint8Array` correlation material copied into owned memory;
- terminal source, owned, request, malformed, timeout, and late-result token zeroization;
- factory quarantine and no retry after any admitted uncertainty;
- independent `cleanupConfirmed=true` and `residualResourceCount=0` observation; and
- an exact frozen two-field metadata-only success result.

The capability imports only `node:crypto` plus the existing C5B core/operator types. Static tests
reject filesystem, process, environment, network, provider, database, SQL/tool, browser, and logging
surfaces.

## Focused and strict qualification

The decision validator passes all ten locks:

`A1/P1/O1/D1/Z1/R1/Q1/M1/I1/N1`.

The focused runtime passes `8/8` grouped attacks:

1. exact configuration and trust separation;
2. seven-receipt admission plus concurrent/sequential replay refusal;
3. cleanup binding, malformed output, refusal, hostile values, and token bounds;
4. independent observation, zero residue, binding, hostile values, and error sanitization;
5. one deadline, abort, late cleanup/observation, suppression, and clock rollback;
6. source/owned/request token zeroization and exact immutable output;
7. real operator success/refusal integration with unfreeze/completion guards; and
8. static no-infrastructure boundary.

TypeScript `5.9.3` strict/no-emit checking with ES2022, Node16 module resolution, and
`skipLibCheck=true` reports zero diagnostics for the new source and test. Library declaration
compatibility is outside this focused source check and is separately exercised by the full suite.

## Parent and distribution qualification

Parent C5B suites pass:

- preflight core: `9/9`;
- operator: `9/9`;
- executable qualification: `9/9`;
- connection material: `8/8`;
- logical backup/isolated restore: `11/11`;
- restored-state verification: `9/9`;
- project attestation: `9/9`;
- catalog/ACL probe: `9/9`;
- writer freeze: `9/9`; and
- provider recovery point: `9/9`.

Synced-core generation/check reports `18 byte-identical files`. Canonical and generated cleanup
runtime SHA-256 are both
`00cb45225d21a5734c03ace9c88c9db66ad77e0a275f1596ac308b63596bac68`.

Additional gates pass:

- roadmap: `22 tasks / 4 initiatives`;
- synced-core generator attacks: `4/4`;
- provider bundles: `3 providers / 2 skills / 5 shared runtimes`;
- provider distribution: `3/71/8/11/79/15/4` qualification counts; and
- public release readiness: `1 canonical + 40 attacks`.

## Public-source qualification

The source candidate uses exactly eight strict UTF-8 paths with no BOM, CR, trailing whitespace,
or missing final LF. Both worktree and cached diff checks pass. The manifest has `727` unique,
JavaScript-ordinal-sorted entries and exactly five cleanup source admissions.

On the exact staged source tree:

- Git-index authority: `7/7`;
- public contract: `18/18`;
- Markdown files: `218`;
- internal links: `48/48`;
- text files: `724`;
- lockfiles/dependency occurrences/unique dependencies: `4/754/617`;
- secret detector families: `10`; and
- findings/issues: `0/0`.

## Full-suite qualification

Full source-state `npm test` exited `0` in `340.4s` with `2397` output lines on the exact staged
eight-path candidate. The post-suite index remained unchanged with no unstaged side effect.

Version and release identity remain unchanged:

- package and prompt identity: `v3.25` / `3.25.0`;
- prompt budget: `163,206 / 176,128` bytes;
- lesson sync: `60/60`; and
- package visibility: `private`.

## Security and privacy result

Shared core receives no project ID, resource name, host, path, database name, SQL, credential, key,
provider response, stderr/stdout, or deletion selector. The future composition root must configure
the exact attempt-owned target outside this boundary. Provider errors collapse to closed reason
codes and opaque tokens never enter public results.

The public success object contains exactly `cleanupConfirmed=true` and
`residualResourceCount=0`. Cleanup uncertainty, timeout, malformed output, observer failure, or
residual resources returns `cleanup_incomplete`; sequence/window refusals remain closed. No retry
occurs after an admitted destructive attempt.

## External-effect statement

This checkpoint changed source files and created one local source commit. It did not access or
mutate a provider, database, project, backup destination, secret manager, dashboard, or target
repository. It performed no live cleanup, SQL, DDL/DML, migration, bootstrap, route, deploy,
canary, cutover, sync, target `.Codex` edit, tag, release, publication, or visibility change.

Local tests do not prove a live isolated restore was cleaned, residual resources were observed,
writers were unfrozen, C5B completed, or P17-016 completed. Live C5B remains incomplete until a
separately authorized composition root supplies concrete capabilities and durable live evidence.
