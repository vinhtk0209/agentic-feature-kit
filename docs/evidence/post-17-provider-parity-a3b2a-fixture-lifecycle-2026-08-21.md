# P17-007 A3B2A Isolated Fixture Lifecycle Qualification

**Date:** 2026-08-21

**Roadmap item:** P17-007

**Slice:** A3B2A — provider-neutral isolated fixture lifecycle

**Result:** Source-qualified locally; remote qualification is not claimed by this document.

## Exact source identity

| Field | Value |
|---|---|
| Source commit | `9082caf31ec1e983f63ba49264737f3a5c7c9e79` |
| Parent | `ec67b899220f51a4b7e340e0891d82189dac2e84` |
| Source tree | `345d11edc3949ef93e6f1c522d0529c148a8adfb` |
| Branch | `p17-007-a3b2a-fixture-lifecycle` |
| Source paths | 8 |
| Diff | 1,298 insertions, 3 deletions |

The parent is the exact qualified main merge for P17-007 A3B1. The source commit contains only the
ceiling declared in `docs/roadmap/p17-007-a3b2a-fixture-lifecycle-plan.md`.

## Reconciled boundary

A1 already owns one exact public synthetic golden: five dependency-free seed files, four locked
paths, three allowed-write paths, the canonical tree hash, one fixed trusted-test argv, and closed
run/output limits. A2 requires a materialized-tree identity plus independent trusted verification
and successful cleanup before a completed parity receipt can qualify. A3B1 supplies a deny-default
process boundary but intentionally owns no filesystem.

A3B2A fills only the filesystem lifecycle gap. It does not execute the fixed test command, launch a
provider, verify a candidate after edits, inspect policy/hooks, or assemble an A2 receipt.

## Architecture result

`createProviderParityFixtureLifecycle` is a provider-neutral, one-use Node boundary with these closed
properties:

- strict admission of the exact A1 fixture identity, public provenance, prompt/spec/phase/file/tree
  hashes, seed/locked/allowed inventories, test command, and evaluation policy;
- descriptor-based JSON cloning that rejects accessors, Symbols, hostile prototypes, sparse arrays,
  proxies, cycles, excessive data, caller mutation, and non-finite values;
- one canonical absolute non-root parent pinned by lexical path and `dev`/`ino` identity;
- one random owned direct child, with parent/root identity rechecked before and after materialization;
- portable ordinal paths, exact inventories, exclusive `O_EXCL`/`O_NOFOLLOW` file creation, and
  alias-free regular-file readback bound to the canonical A1 tree hash;
- frozen metadata-only file, locked-path, allowed-write, and inventory-digest receipts;
- internally owned cleanup using `lstat`, non-following unlink for symbolic links and Windows
  junctions, canonical containment for real directories, root identity checks, and final absence;
- fixed opaque errors that do not interpolate attacker bytes, paths, usernames, or OS diagnostics;
- no child process, environment, credential, network, package, test runner, database, dashboard,
  target, sync, release, publication, or visibility capability.

The materialization receipt exposes the ephemeral isolated root only as a local capability required
by later runner composition. Its documentation explicitly forbids persisting that path as evidence.

## Evidence-first ladder and repairs

1. The plan, validator, package registrations, roadmap/architecture notes, and public-manifest rows
   were registered before production code.
2. The first product validator run exited `1` exactly because
   `.claude/integrations/provider-parity-fixture-node.test.ts` did not exist.
3. The first implementation run passed the 100-cycle sentinel and seven attack groups; two harness
   assertions were corrected for Markdown line wrapping and transpiled frozen-array assignment.
   Production policy did not change for either repair.
4. Manual review added parent `dev`/`ino` pinning, post-readback root identity verification, earlier
   partial-failure cleanup ownership, parent-replacement attacks, and explicit exclusive/mode guards.
5. Registering A3B2A exposed a real Windows launch failure before any product test:
   `The command line is too long.` The pre-existing monolithic `test:kit` value was 8,158 characters.
6. The identical 192-command route was repaired inside `package.json`: the first 32 commands remain
   fail-fast in `test:kit:foundation` (1,020 characters), and the main route invokes that segment then
   retains the remaining commands directly (7,165 characters). Existing Post-17 registration checks
   remain authoritative, and the complete Windows-native suite proves the route now starts and ends.

## Focused qualification

| Gate | Result |
|---|---|
| A3B2A plan validator | PASS — 8 paths, 11 headings, 21 boundary phrases |
| A3B2A real-filesystem attacks | PASS — 9/9 |
| Repeated lifecycle sentinel | PASS — 100 complete cycles |
| Maximum observed elapsed time | 9,156.449 ms, below 15 seconds |
| Maximum observed incremental RSS | 1,327,104 bytes, below 64 MiB |
| Child/provider/model/network calls | 0 |
| TypeScript | PASS — 5.9.3, strict, no emit, NodeNext, `skipLibCheck=false`, zero diagnostics |
| Full-suite route | PASS — 192 unique ordered commands, Windows-safe segments |
| Roadmap | PASS — 22 tasks, 4 initiatives |
| Cross-platform release | PASS — 11/11 |

The timing and RSS values are local sentinels over five small seed files, not a provider-performance
benchmark. TypeScript/Node remains selected because no required filesystem primitive is missing and
the measured boundary remains far below the locked reconsideration thresholds.

## Compatibility and public qualification

Before the source commit, the affected matrix passed:

- A1 input lock: seven paths, 13 decisions, three readiness attacks, one executable RED fixture;
- A2 plan/evaluator: nine paths / 11 headings / 12 phrases and 10,000 admitted receipts;
- A3A Claude adapter: 13/13 with zero real calls;
- A3B1 Claude process port: 12/12 with 1,000 fake executions and zero real calls;
- shared multi-provider core: 7/7;
- Codex, Copilot, Gemini, and Grok adapters: 14/14, 7/7, 8/8, and 8/8;
- provider bundles and distribution: three providers; three archives, 71 entries, eight sidecars,
  11 checksums, 79 text scans, 15 clean runtime smokes, and four attacks;
- claim-runtime audit: 8/8;
- cross-platform release: 11/11;
- strict public release: contract 18/18, link 7/7, license 7/7, secret 6/6, and docs PASS.

Git-index public qualification reported `eligible-for-r5c2` with 803 manifest paths, 242 Markdown
files, 48/48 internal links, four lockfiles, 754 dependency occurrences / 617 unique dependencies,
800 text files, ten detector families, and zero issues or secret findings.

## Complete regression receipt

One complete native `npm run test:kit` ran from the beginning against the exact staged source bytes
and exited `0`. The command-length repair was therefore exercised on Windows, not inferred.

Inside that chain:

- A3B2A stayed 9/9; 100 lifecycle cycles completed in 2,675.204 ms with 1,032,192 bytes
  incremental RSS and zero child/provider/model/network calls;
- A3A stayed 13/13 and A3B1 stayed 12/12 with zero real provider/model calls;
- A2 admitted 10,000 receipts with p95 0.490 ms;
- public readiness remained `eligible-for-r5c2` at 803 paths with zero findings;
- provider distribution remained 3/71/8/11/79/15/4;
- 26 synchronized core files stayed byte-identical;
- all 192 ordered commands completed through the final lesson-sync check.

## Privacy and external effects

Positive-controlled fixed-string searches found known `process.env` and `node:child_process` uses in
existing repository files, while the new production lifecycle contained neither. The source also
contains no `rmSync`, shell, fetch, HTTP, package, test-runner, database, dashboard, target, sync, or
release adapter. Its only imports are Node crypto, filesystem, and path primitives.

All fixture trees were synthetic, disposable, OS-temporary test roots and were removed by the
no-follow cleanup helper. External alias victims remained byte-identical. No provider/model process,
credential/session read, network request, package install, database/dashboard/target mutation,
target `.Codex` edit, sync, direct-main push, force, tag, release, publication, or visibility change
occurred.

## Rollback

Local rollback is a revert of source commit `9082caf31ec1e983f63ba49264737f3a5c7c9e79` or restoration
from the verified 2026-08-21 backup. This source slice created no persistent fixture root or external
state, so rollback has no external cleanup.

## Next gates and non-claims

A3B2B must independently inventory the post-provider candidate, enforce locked/allowed paths and the
closed violation set, and invoke exactly one trusted Node test through A3B1. A3B3 must assemble the
metadata-only A2 receipt and attest or isolate managed policy/hooks. A4 remains prohibited until
runtime, authentication, entitlement, exact model, cost, authorization, fixture, cleanup, privacy,
and evidence-sink inputs are all qualified.

A3B2A does not claim a provider is authenticated, entitled, model-ready, authorized, executed, or
equivalent. It does not claim a candidate tree was verified, a trusted test ran, an A2 receipt exists,
three-provider parity is proven, ranking is allowed, A3 is complete, or P17-007 is done.
