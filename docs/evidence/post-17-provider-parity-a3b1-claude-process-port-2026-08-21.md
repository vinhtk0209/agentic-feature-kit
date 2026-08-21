# P17-007 A3B1 Deny-Default Claude Process Port Qualification

**Date:** 2026-08-21

**Roadmap item:** P17-007

**Slice:** A3B1 — deny-default Claude Node process port

**Result:** Source-qualified locally; remote qualification is not claimed by this document.

## Exact source identity

| Field | Value |
|---|---|
| Source commit | `35cb146dec744ef8d2738c9f43efbfff01a6993f` |
| Parent | `f043d0ef39c47d66992f24dc11e86d4fc668b46f` |
| Source tree | `6c1125e7fba307eb4723d1ebc6603e2ec5044294` |
| Branch | `p17-007-a3b1-claude-process-port` |
| Source paths | 8 |
| Diff | 952 insertions, 3 deletions |

The parent is the exact qualified main merge for P17-007 A3A. The commit contains only the source
ceiling declared in `docs/roadmap/p17-007-a3b1-claude-process-port-plan.md`.

## Reconciled boundary

A3A already supplied the provider-specific Claude command/result adapter but deliberately had no
production process implementation. Read-only A3B reconciliation established that the older shared
Codex Node executor omits an explicit spawn environment and therefore inherits ambient process state.
Connecting A3A directly to it could not support a deny-default claim.

Local discovery observed the command version `2.1.227 (Claude Code)` only. No executable path is
stored here. Presence and version were not treated as authentication, subscription, entitlement,
model availability, provider authority, or a successful model execution.

## Architecture result

`createClaudeNodeProcessPort` is an outer Node infrastructure adapter implementing the existing
`ClaudeProcessPort`. It adds no provider logic to the A3A adapter and has these closed properties:

- one absolute caller-selected isolated root;
- one copied, frozen, explicit environment map with no `process.env` read or spread;
- one normalized absolute executable path, preventing ambient/default command lookup;
- exact direct argv with `shell:false`, piped stdio, and non-Windows detached process groups;
- raw-byte combined stdout/stderr accounting before UTF-8 decoding;
- bounded stdin, argv, environment, timeout, output, and termination-grace limits;
- injected spawn, platform, tree termination, and timer boundaries for offline attacks;
- Windows tree termination through direct `taskkill` argv with a direct-child fallback;
- first-terminal-state semantics and no post-settlement grace timer;
- fixed opaque infrastructure failures with no exception, path, argv, or environment interpolation.

This is a process boundary only. It does not choose the later authenticated environment, inspect
managed policy/hooks, materialize a fixture, or construct a parity receipt.

## Evidence-first ladder

1. The plan, validator, package registrations, roadmap, architecture note, and public-manifest rows
   were created before implementation.
2. The first validator run failed exactly because
   `.claude/integrations/claude-cli-process-node.test.ts` did not exist.
3. The first implementation run produced 10 passing groups and one test-harness RED: after correct
   listener cleanup, a deliberately late fake `error` event had no independent observer and Node
   raised it. The test received a separate no-op observer; production cleanup was not weakened.
4. Manual review found and repaired a synchronous-termination grace-timer race, malformed child
   diagnostic leakage, and missing Windows `taskkill` error fallback.
5. TypeScript strict qualification then found three test/timer type diagnostics. A shared timer-handle
   type and explicit adversarial cast removed the diagnostics without changing runtime policy.
6. Manual command-resolution review found that a basename could trigger OS search-path lookup before
   the child environment was installed. Requiring an absolute executable path closed the gap and a
   positive attack now guards it.

## Focused qualification

| Gate | Result |
|---|---|
| A3B1 plan validator | PASS — 8 paths, 11 headings, 12 boundary phrases |
| A3B1 fake-child attacks | PASS — 12/12 |
| Fake execution sentinel | PASS — 1,000 executions in 44.035 ms |
| Incremental RSS sentinel | PASS — 7,876,608 bytes, below 32 MiB |
| Real provider/model calls | 0 |
| TypeScript | PASS — 5.9.3, strict, no emit, `skipLibCheck=false`, zero diagnostics |
| Roadmap | PASS — 22 tasks, 4 initiatives |
| Git-index public adapter | PASS — 7/7 |
| Repository boundary | PASS — 8 workspace commands excluded |

The 1,000-run timing and RSS values are sentinels, not a provider latency benchmark. TypeScript/Node
remains the selected runtime because this boundary is external-process dominated and the measured
fake boundary is far below the 5-second and 32-MiB reconsideration thresholds. Rust, Go, and Python
would add packaging/runtime surfaces without a missing capability or measured benefit in this slice.

## Compatibility and public qualification

Before the source commit, the affected matrix passed:

- A3A Claude adapter: 13/13 with zero real calls;
- shared multi-provider core: 7/7;
- Codex, Copilot, Gemini, and Grok adapters: 14/14, 7/7, 8/8, and 8/8;
- A1 input lock: 7 paths, 13 decisions, 3 readiness attacks, one executable RED fixture;
- A2 plan/evaluator: 9 paths / 11 headings / 12 phrases and
  3 schemas / 8 identity / 11 evidence / 14 structure/privacy attacks / 5 aggregate modes / 10,000
  admitted receipts;
- provider distribution: 3 archives, 71 entries, 8 sidecars, 11 checksums, 79 text scans,
  15 clean runtime smokes, and 4 attacks;
- cross-platform release: 11/11.

Git-index public qualification reported `eligible-for-r5c2` with 798 manifest paths, 240 Markdown
files, 48/48 internal links, four lockfiles, 754 dependency occurrences / 617 unique dependencies,
795 text files, ten detector families, and zero issues or secret findings.

## Complete regression receipt

One complete native `npm run test:kit` ran from the beginning against the exact staged source bytes
and exited `0`. Inside that chain:

- A3B1 stayed 12/12; its 1,000 fake executions completed in 46.800 ms with 8,175,616 bytes
  incremental RSS and zero real provider/model calls;
- A3A stayed 13/13 with zero real calls;
- A2's 10,000-receipt evaluator reported p95 0.425 ms and 1,187,840 bytes incremental RSS;
- public readiness remained `eligible-for-r5c2` with zero findings;
- provider distribution remained 3/71/8/11/79/15/4;
- 26 synchronized core files stayed byte-identical;
- every registered Post-17, privacy, control-plane, release, sync-guard, telemetry, browser-target,
  Playwright, design, version, index, prompt-budget, and lesson-sync gate passed.

The final staged-byte rerun again passed A3B1 12/12, TypeScript strict qualification, roadmap 22/4,
and Git-index public adapter 7/7 before the source commit was created.

## Privacy and external effects

The public source was checked with positive-controlled searches. A known existing
`process.env.XAI_API_KEY` read proved the environment-access regex; both regex and fixed-string
variants found no `process.env` property access in the new production source. A deliberate
`shell:true` test attack proved the shell search, while production source contained no such value.

No Claude/provider/model process ran. No credential, session, account, subscription, or model state
was read. No provider request, network product write, fixture materialization, package install,
database/dashboard/target mutation, target `.Codex` edit, sync, direct-main push, force, tag, release,
publication, or visibility change occurred.

## Rollback

Local rollback is a revert of source commit `35cb146dec744ef8d2738c9f43efbfff01a6993f` or restoration
from the verified 2026-08-21 backup. The slice created no external process, fixture root, credential,
network state, or database row, so no external cleanup is required.

## Next gates and non-claims

A3B2 must supply the public-golden materializer, immutable seed/locked-path inventory, independent
candidate-tree verifier, fixed trusted-test runner, and zero-residue cleanup. A3B3 must assemble the
metadata-only A2 receipt and attest or isolate Claude managed policy/hooks. A4 remains prohibited
until exact installed executable/version/flags, authentication, runtime entitlement, exact model
availability, cost policy, per-run authorization receipt, isolated fixture, cleanup, privacy, and
evidence-sink inputs are all qualified.

This evidence does not claim Claude authentication, entitlement, model availability, provider
execution, a fixture edit, trusted-test success, cleanup proof, an A2 candidate receipt,
three-provider parity, performance ranking, A3 completion, P17-007 completion, release eligibility,
publication, or production readiness.
