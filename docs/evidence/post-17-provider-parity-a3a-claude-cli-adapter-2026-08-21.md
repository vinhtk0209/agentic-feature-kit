# P17-007 A3A Claude CLI Adapter Foundation Evidence

**Date:** 2026-08-21
**Status:** Locally qualified offline adapter foundation; real provider execution has not started
**Branch:** `p17-007-a3a-claude-cli-adapter`
**Source commit:** `6e822c36138cbac5dac58059753c16f00e2a98b7`
**Source parent:** `0793d5df02a1bce435e1e73d69964c5e3628da28`
**Source tree:** `d46500348484603caf9827ee71fc8bb429a9694c`

## Outcome

P17-007 A3A adds a thin Claude Code CLI output adapter behind an injected process port. It binds
the canonical model registry identity, exact CLI version, optional reasoning effort, fixed
deny-default command profile, no-session policy, and untrusted client-cost source into one
capability identity. It validates a closed process receipt and Claude JSON result before returning
only normalized output and canonical unknown cost to the shared provider-neutral gate.

All A3A runtime tests use fake processes. No Claude executable or model was invoked, no provider
authentication or entitlement was read, and no production process implementation was added.

## Architecture boundary

The dependency direction remains inward:

`future isolated process executor -> ClaudeProcessPort -> Claude output adapter -> ProviderAdapter port -> shared gate`

The adapter has no filesystem, environment, network, credential, session, dashboard, database, or
target-repository dependency. The exact task specification is carried only as standard-input bytes;
argv contains a fixed wrapper and bounded configuration values. The process port must enforce
future operating-system isolation, deny-default environment policy, and bounded process cleanup.
A3A does not claim those controls merely because the adapter requests `shell:false`.

TypeScript/Node remains authoritative. The final focused 1,000-parse sentinel completed in
`24.447 ms` with `1,409,024` bytes incremental RSS; the full-suite observation was `5.980 ms` and
`2,338,816` bytes. Both remain below the locked 5-second and 32-MiB reconsideration thresholds, so
no measured Rust, Go, or Python ADR trigger exists.

## Official interface inputs

The command contract was reconciled against the current official Claude Code references on
2026-08-21:

- [CLI reference](https://code.claude.com/docs/en/cli-usage) for print mode, JSON output, model,
  effort, turn and budget bounds, safe mode, tool controls, session controls, and version output.
- [Permission modes](https://code.claude.com/docs/en/permission-modes) for `dontAsk` behavior and
  the managed-policy boundary.
- [Headless mode](https://code.claude.com/docs/en/headless) for non-interactive and stdin use.
- [Cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking) for the explicit decision
  that client-reported cost remains untrusted in A3A.

These references define adapter inputs only. They are not evidence that a local binary, login,
entitlement, selected model, or managed policy is available on the qualification machine.

## Contract result

The A3A boundary enforces these invariants:

- Model selection comes only from the canonical registry and must identify the Claude provider.
- Expected and observed CLI versions are exact strict semantic versions.
- The task prompt is nonblank, NUL-free, bounded, byte-identical stdin data, and absent from argv.
- Execution is requested with `shell:false` and a fixed non-interactive JSON profile.
- Safe mode and `dontAsk` are required; only `Read,Edit,Write` are exposed and pre-approved.
- MCP tools are denied, Chrome is not enabled, and session persistence/resume is not requested.
- Turn count, budget, output, time, process exit, signal, and stderr states fail closed.
- Malformed, contradictory, refused, permission-denied, blank, or excess-turn result envelopes fail.
- Provider session IDs, UUIDs, diagnostics, raw JSON, and client price metadata never cross the
  adapter result.
- Two Claude models receive distinct capability keys while using the exact same external gate.

Claude safe mode may still retain centrally managed settings, policy, or hooks. A future real-run
slice must attest or isolate those surfaces; A3A deliberately does not infer their absence.

## Source authority

The immutable source commit contains exactly eight paths:

1. `.claude/integrations/claude-cli-adapter.test.ts`
2. `.claude/integrations/claude-cli-adapter.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3a-claude-cli-adapter-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-claude-adapter-plan.test.ts`

The source commit records 919 insertions and 3 deletions. Cached and worktree whitespace checks were
clean, and the normal spec-integrity hook passed for three TypeScript paths and zero feature folders.

## RED-to-GREEN evidence

The implementation advanced through these observed fail-closed boundaries:

1. RED: the A3A plan validator initially found one missing exact boundary phrase; the plan wording
   was normalized without changing scope.
2. RED: the repeated validator then failed exactly because the Claude adapter test did not exist.
3. GREEN: the first implementation passed the plan and offline fake-process suite.
4. Review finding: a task beginning with an option token could still be interpreted as CLI syntax
   when the task was an argv value even under `shell:false`.
5. GREEN hardening: the exact task moved to stdin under a constant argv wrapper; hostile prompt
   bytes are proven absent from argv and byte-identical on stdin. Closed process-receipt validation,
   generic non-echoing errors, and bounded model identifiers were added at the same boundary.
6. Registration RED: Windows rejected the expanded full-suite command line before product tests
   started. Grouping the two A3A commands alone was still above the platform ceiling.
7. GREEN registration: five unchanged provider-foundation commands were grouped behind one package
   aggregate. The equivalent `test:kit` chain became 8,056 characters, under the 8,191-character
   Windows boundary, and the independent aggregate proved every original test still ran.
8. GREEN: the complete native Windows suite then ran from the beginning and exited 0.

The sandbox npm shim pointed at a missing roaming npm CLI during early focused attempts and did not
enter a product gate. The authorized native workspace runtime produced the recorded RED and GREEN
results; no dependency installation or dashboard mutation was needed.

## Verification receipts

| Gate | Result |
|---|---|
| A3A plan | PASS: 8 source paths, 11 headings, 12 boundary phrases |
| A3A runtime | PASS: 13/13 offline fake-process tests, 1,000 parses, 0 real provider/model calls |
| Provider foundations | PASS: multi-provider 7/7, Codex 14/14, Copilot 7/7, Gemini 8/8, Grok 8/8 |
| A1 compatibility | PASS: 7 source paths, 13 decisions, 3 readiness attacks, 1 executable RED fixture |
| A2 compatibility | PASS: 3 schema groups, 8 identity attacks, 11 evidence attacks, 14 structure/privacy attacks, 5 aggregate modes, 10,000 receipts |
| Post-17 roadmap | PASS: 22 tasks, 4 initiatives |
| Pre-commit | PASS: 3/3 |
| TypeScript | PASS: 5.9.3, strict, no emit, `skipLibCheck=false`, zero diagnostics |
| Provider distribution | PASS: 3 archives, 71 entries, 8 sidecars, 11 checksums, 79 scans, 15 smokes, 4 attacks |
| Public release contract | PASS: 18 contract tests plus link, license, secret, documentation, and 7/7 node-adapter gates |
| Public aggregate before evidence registration | PASS: `eligible-for-r5c2`, 793 paths, 238 Markdown files, 48/48 links, 790 text files, 10 detector families, zero findings/issues |
| Full `test:kit` | PASS: native exit 0; all registered Post-17, privacy, control-plane, provider, distribution, sync, telemetry, cross-platform, browser, Playwright, design, version, index, budget, and lesson-sync gates passed |

## Security and privacy result

No credential, environment value, provider session, prompt or specification body, model output,
transcript, repository content, local user path, customer identity, or live-project coordinate is
stored in the adapter result or this evidence. Errors do not echo attacker-controlled process
fields. Public secret scanning reported zero findings.

No provider process, network write, database write, dashboard mutation, filesystem materialization,
sync, target edit, tag, release, publication, or visibility change occurred.

## A3B gate

A3B may add only the isolated Claude process-executor and discovery preflight needed to prove a
real execution boundary. Before any model call, it must lock binary path and version, authentication
and entitlement handling, exact model availability, deny-default environment, disposable execution
root, managed-policy and hook isolation or attestation, timeout/output/process-tree cleanup, budget,
privacy, and evidence retention decisions. Missing input remains `needs_input`; it cannot be replaced
with a local-machine assumption.

Materialization of the A1 golden, trusted verification, A2 receipt derivation, repeat sampling,
performance ranking, and other providers remain separate later gates.

## Rollback

Revert the evidence commit and source commit through normal Git history. A3A creates no runtime,
credential, provider, database, dashboard, target, sync, tag, release, publication, or visibility
side effect, so rollback requires no external cleanup. The verified 2026-08-21 workspace backup is
also available.

## Non-claims

This evidence does not claim a local Claude installation, authentication, entitlement, model
availability, authoritative pricing, provider execution, operating-system isolation, managed-policy
absence, generated implementation parity, trusted fixture verification, cleanup proof, an A2
provider receipt, three-provider parity, A3 completion, P17-007 completion, sync, push, PR creation,
merge, tag, release, publication, or visibility change.
