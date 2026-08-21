# P17-007 A3B1 Deny-Default Claude Node Process Port

Status: approved A3B1 offline process-boundary implementation; zero provider execution.

## Outcome

A3B1 adds the smallest production-capable infrastructure boundary needed below the A3A Claude CLI
adapter: a Node implementation of `ClaudeProcessPort` that never inherits the parent environment,
binds execution to one caller-selected isolated root, uses direct `shell:false` process launch, and
terminates the complete child tree on timeout or output overflow.

This slice is qualified entirely with fake child processes. It launches no Claude process, performs
no model call, reads no authentication or session state, and materializes no provider-parity fixture.
It is one prerequisite for A3B, not a claim that A3B, A3, or P17-007 is complete.

## Reconciled evidence and prerequisites

- Exact qualified remote main is `f043d0ef39c47d66992f24dc11e86d4fc668b46f`.
- A3A already owns strict Claude argv construction, version/result parsing, privacy-safe failures,
  model identity, and an injected `ClaudeProcessPort`.
- The existing `createNodeProcessExecutor` is useful cross-platform evidence but inherits the parent
  environment because its spawn options omit `env`; it cannot establish the A3B deny-default claim.
- Local read-only discovery observed Claude Code `2.1.227`, but presence/version is not authentication,
  runtime entitlement, model availability, provider authority, or execution evidence.
- The A1 public synthetic golden and A2 pure evaluator remain the authoritative fixture and receipt
  contracts. A3B1 does not change either contract.

## Scope and non-scope

A3B1 includes one Node process port, its offline fake-child attack suite, this plan and validator,
package/full-suite registration, roadmap and architecture notes, and public-manifest registration.

A3B1 excludes environment discovery, credential/session inspection, provider authentication,
entitlement/model probing, any real CLI or model call, fixture materialization, managed-policy/hook
inspection, filesystem inventory, trusted test execution, A2 receipt assembly, durable evidence
storage, dashboard/database/target changes, sync, release, publication, and visibility changes.

## Architecture decision record

### Context

The A3A adapter must remain provider-specific and free of Node process/environment APIs. The runtime
boundary must be fakeable, fail closed, cross-platform, and independently reusable by the later
isolated fixture runner without exposing credentials or local diagnostics to the adapter.

### Options

| Option | Isolation | Coupling | Decision |
|---|---:|---:|---|
| Reuse the Codex executor unchanged | Low: inherits ambient environment | Low | Rejected |
| Put `spawn` directly in the Claude adapter | Medium | High: mixes transport and parsing | Rejected |
| Add a Claude-port Node infrastructure adapter | High: explicit environment and root | Low | Selected |
| Add a second runtime in Rust, Go, or Python | No unique control gained in this slice | High | Rejected |

### Decision

Implement `createClaudeNodeProcessPort` as an outer infrastructure adapter depending inward on the
existing `ClaudeProcessPort` request/receipt contract. Its constructor receives an exact isolated
root and an explicit environment object. It never reads `process.env`; therefore omitted variables
stay omitted. Tests inject spawn, tree termination, timers, and platform behavior.

### Consequences

Later A3B materialization can construct a per-run environment and root before connecting this port.
No caller can mistake default construction for inherited authority. A later slice still must prove
that the selected environment, managed-policy/hook surface, fixture tree, and cleanup policy are safe.

## Process and environment contract

The constructor accepts only a non-empty absolute isolated root, a plain own-data-property environment
map, and bounded termination grace. Environment names must match the portable process-name grammar;
values must be strings without NUL; inherited/accessor-backed/prototype-polluted maps, case-insensitive
Windows duplicates, excessive entries, and excessive encoded bytes fail before spawn. The port keeps
an internal frozen copy and never mutates or logs caller values.

Each request must use the exact configured root after lexical resolution, an absolute normalized
executable path, `shell:false`, non-empty direct argv, positive timeout/output limits, and NUL-free
stdin/arguments. Requiring an absolute executable prevents ambient/default `PATH` lookup before the
child environment exists. Spawn receives exactly the validated executable, argv, cwd, explicit
environment, `shell:false`, piped stdio, and detached process groups on non-Windows. No shell, command
concatenation, fallback executable, retry, or ambient lookup is introduced by the port.

## Bounded lifecycle and privacy

Stdout and stderr are counted as raw bytes before UTF-8 decoding. Reaching the combined byte cap,
timeout, stdin failure, or termination-grace expiry triggers the injected OS process-tree terminator.
The first terminal condition wins; duplicate and late child events cannot change the receipt. The
grace timer guarantees the promise settles even if a hostile fake or child never emits `close`.

Spawn/error details are normalized to fixed opaque stderr codes. The port never interpolates exception
text, absolute paths, executable names, argv, environment names/values, usernames, sessions, tokens,
or provider output into infrastructure failures. Successful bounded stdout/stderr remains in memory
only for A3A parsing; A3A already rejects unexpected stderr and does not persist raw provider envelopes.

## Attack and evidence ladder

1. Register the plan and source ceiling before implementation; record the expected missing-module RED.
2. Prove exact direct spawn options and byte-identical stdin through a fake child.
3. Prove no ambient environment access and that only the frozen explicit map reaches spawn.
4. Attack relative/root-drift cwd, basename/malformed executable, argv/stdin/limits, accessor/prototype maps,
   bad names/values, Windows case aliases, entry/byte ceilings, and caller mutation after construction.
5. Attack synchronous spawn failure, asynchronous child error, stdin write/end failure, nonzero/signal,
   split multibyte output, exact/overflow caps, timeout, termination grace, duplicate close/error/data,
   and post-settlement events.
6. Assert exact Windows and POSIX tree-termination delegation with no real OS termination.
7. Assert fixed opaque failures contain none of the attacker-supplied diagnostics.
8. Record fake spawn and termination counters; real Claude/provider/model call count must remain zero.
9. Run focused compatibility, strict TypeScript, public/provider gates, then the complete kit suite.
10. Commit source first; bind one separate metadata-only evidence document to the exact source identity.

## TypeScript performance decision

The boundary is dominated by one external process and bounded streams. Node already provides the
required direct spawn, Buffer byte accounting, timers, and cross-platform event contract. Rust, Go,
and Python add packaging and FFI surfaces without a capability or measured performance benefit here.
The fake-process suite includes 1,000 bounded executions with a 5-second and 32-MiB incremental-RSS
sentinel. A later measured breach requires a new ADR before changing runtime.

## Exact source manifest

The source commit may change exactly these eight paths:

1. `.claude/integrations/claude-cli-process-node.test.ts`
2. `.claude/integrations/claude-cli-process-node.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b1-claude-process-port-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-claude-process-port-plan.test.ts`

Qualification evidence later adds exactly
`docs/evidence/post-17-provider-parity-a3b1-claude-process-port-2026-08-21.md` plus its one sorted
`release/public-release-manifest.json` row in a separate commit.

## Rollback and next gates

Rollback is deletion/revert of the bounded branch commits or restoration from today's verified
backup. A3B1 creates no external process, network call, fixture tree, credential, database row, or
dashboard state, so rollback has no external cleanup.

A3B2 must provide the fresh golden materializer, immutable seed/locked-path inventory, independent
candidate-tree verifier, fixed trusted-test runner, and zero-residue cleanup. A3B3 must bind those
results into metadata-only A2 receipts and attest or isolate managed policy/hooks. A4 remains
prohibited until installed CLI/flags, authentication, runtime entitlement, exact model availability,
cost policy, authorization receipt, isolated fixture, cleanup, privacy, and evidence-sink inputs are
all concretely qualified.

## Non-claims

A3B1 does not claim Claude is authenticated, entitled, model-ready, authorized, isolated by safe
mode, free of managed policy/hooks, or successfully executed. It does not claim a fixture was
materialized or edited, trusted tests ran, cleanup succeeded, an A2 receipt exists, three-provider
parity is proven, ranking is allowed, A3 is complete, or P17-007 is done.

No Claude/provider/model process, credential/session read, network provider request, fixture
materialization, package install, dashboard/database/target mutation, target `.Codex` edit, sync,
direct-main push, force, tag, release, publication, or visibility change occurs in this slice.
