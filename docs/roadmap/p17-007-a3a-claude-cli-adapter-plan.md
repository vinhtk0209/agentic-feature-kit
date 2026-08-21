# P17-007 A3A Claude CLI Adapter Foundation

Status: approved A3A offline adapter implementation; no provider execution.
Date: 2026-08-21
Parent: exact qualified `main` `0793d5df02a1bce435e1e73d69964c5e3628da28`
Decision lock: `transport=C1, process=P1, version=V1, identity=I1, permissions=T1, output=O1, privacy=D1, performance=N1, scope=S1`

## Outcome

A3A adds the missing Claude Code CLI adapter behind the existing provider-neutral `ProviderAdapter`
port. The slice proves a fixed direct-argv command profile, exact capability identity, closed JSON
result normalization, and fail-closed behavior through an injected fake process port. It does not
launch Claude Code or any other provider process.

This is the smallest independently testable A3 slice allowed by A2. Existing Codex and Copilot
adapters remain unchanged. A3A does not bridge their older output contract into the A2 parity
receipt, and it does not claim that P17-007 A3 is complete.

## Current evidence and prerequisites

Read-only reconciliation established all of the following before source work:

- A1 is input-complete and A2 is merged plus exact-main qualified.
- `codex-cli-adapter.ts` and `copilot-cli-adapter.ts` already implement direct output adapters.
- a known-positive `createCodex*` source query succeeds, while the same file-list and symbol queries
  find no Claude CLI adapter or `createClaude*` factory;
- the existing `ProviderAdapter` port owns identity, capability probing, output, and optional cost,
  but not P17-007 fixture materialization, trusted verification, cleanup, or A2 receipt derivation;
- the current official Claude Code CLI reference documents `--version`, `-p`, `--output-format
  json`, `--model`, `--effort`, `--max-turns`, `--max-budget-usd`, `--safe-mode`,
  `--permission-mode dontAsk`, `--tools`, `--allowed-tools`, `--disallowed-tools`, `--no-chrome`,
  and `--no-session-persistence`; and
- official permission documentation states that `dontAsk` denies non-pre-approved tools, while
  `--tools` restricts built-in tool availability and bare-name deny rules remove tools.

Documentation establishes a supported command surface only. It does not establish an installed
CLI, authentication, runtime entitlement, model availability, authoritative pricing, or execution
authority for a real run.

## Scope and non-scope

A3A includes:

- one Claude-specific adapter using the shared model registry and existing provider-neutral port;
- one injected `ClaudeProcessPort` whose request requires fixed `shell:false` semantics;
- strict configuration validation for executable, model key, adapter version, expected CLI
  version, working directory, timeout, output cap, turn cap, budget cap, and reasoning effort;
- one exact capability probe and one fixed non-interactive execution argv/stdin profile;
- strict bounded JSON success-envelope normalization;
- opaque omission of session, diagnostic, permission, path, transcript, and response metadata;
- offline fake-process attacks plus same-gate conservation through `ProviderRegistry`; and
- plan, roadmap, architecture, package, and public-manifest registration.

A3A includes no production spawn implementation, environment construction, CLI discovery, user
configuration discovery, session-store inspection, credential handling, runtime entitlement
probing, provider/model execution, network access, fixture materialization, path enforcement,
trusted test execution, tree inventory, cleanup, A2 receipt derivation, storage, dashboard UI,
provider bundles, sync, release, publication, and visibility changes.

## Architecture decision record

### C1 — One thin infrastructure adapter

`claude-cli-adapter.ts` is an infrastructure adapter. It depends inward on `ModelConfig`,
`ProviderAdapter`, and `BackendCost`; the existing domain/evaluator code never imports it. The
adapter receives a `ClaudeProcessPort` through dependency injection and never imports Node spawn,
filesystem, environment, network, or credential APIs.

The port returns only exit/signal, stdout/stderr, timeout, and output-cap state. A later production
transport must separately prove deny-default environment construction, OS process-tree cleanup,
and isolated working-directory enforcement before any provider call.

### P1 — Fixed direct process request

Both capability and execution requests use `shell:false`. The executable, working directory,
timeout, and output cap come from validated non-secret configuration. The exact task prompt is one
bounded stdin value; argv contains only a fixed wrapper query, so prompt bytes are never parsed as
options or passed through a shell. No retry, resume,
continue, fallback model, remote session, browser, plugin, MCP configuration, or arbitrary flag is
accepted from callers.

The injected port is the only execution boundary. A3A tests provide a fake port and maintain zero
real provider/model calls.

### V1 — Strict version binding

Capability probing invokes only `--version`. The response must be one strict semantic version,
optionally followed by the documented product suffix `(Claude Code)`, with no extra line or control
text. The observed version must equal `expectedCliVersion` and becomes a capability value. A
different version therefore produces a different capability hash.

### I1 — Registry-owned identity

Provider, model ID, and supported reasoning effort come only from the injected canonical model
registry. The configured key must resolve to provider `claude`; unknown keys and cross-provider
keys fail before the process port is called. Model, effort, CLI version, adapter version, and fixed
tool profile are all capability-bound.

### T1 — Deny-default tool profile

Execution uses this exact semantic profile:

1. `--safe-mode` disables project/user customizations available to the normal session surface;
2. `--permission-mode dontAsk` converts unapproved tool prompts into denials;
3. `--tools Read,Edit,Write` makes only fixture file tools available;
4. `--allowed-tools Read,Edit,Write` pre-approves only that bounded tool set;
5. `--disallowed-tools mcp__*` removes all MCP tools;
6. `--no-chrome` disables browser integration;
7. `--no-session-persistence` prevents reusable session storage; and
8. exact turn and estimated-USD budget caps bound the agent loop.

This profile is necessary but not sufficient for a real run. A3B must start it inside a fresh
synthetic fixture copy, give the production process a deny-default environment, and independently
verify allowed paths and zero residue. Official documentation states that managed policy can remain
active under safe mode, so A3B must also attest an acceptable managed-policy/hook surface or use an
isolated environment where it is absent. A3A therefore cannot claim filesystem, hook, or environment
containment.

## Command profile contract

The capability argv is exactly:

```text
--version
```

The execution argv is exactly the following sequence, with the validated model, limits, and
optional non-default effort substituted as single argv values. The fixed wrapper is not
provider-controlled; the exact task prompt is supplied unchanged on stdin:

```text
-p "Apply the exact task specification provided on standard input."
--output-format json --model <model-id> --max-turns <turns>
--max-budget-usd <fixed-two-decimal-usd> --safe-mode --permission-mode dontAsk
--tools Read,Edit,Write --allowed-tools Read,Edit,Write
--disallowed-tools mcp__* --no-chrome --no-session-persistence
[--effort <effort>]
```

Prompt stdin is limited to 32 KiB, turns to `1..32`, budget to `1..10000` cents, timeout to a positive
safe integer, and captured output to a positive safe integer. Unknown input keys are not forwarded
because the adapter constructs the request from validated fields only.

## Result normalization and privacy

Execution must exit `0`, not time out, stay below the output cap, and emit no stderr. Stdout must be
one JSON object with `type=result`, `subtype=success`, `is_error=false`, a non-empty `result`, a
positive `num_turns` within the configured cap, and no permission denials. Malformed JSON, arrays,
error subtypes, contradictory success, blank output, excess turns, or permission denials fail
closed before the shared gate.

Only the normalized `result` text crosses the adapter port. `session_id`, `uuid`, raw stdout,
stderr, errors, permission-denial payloads, model-usage maps, local paths, and provider diagnostics
are never returned or interpolated into thrown errors. The old backend cost remains explicitly
`unknown`: Claude's documented `total_cost_usd` is a client-side estimate and A3A has no exact dated
price-basis receipt required by the A2 evaluator.

## Attack and evidence ladder

The implementation sequence is evidence-first:

1. add this plan, plan validator, registrations, architecture note, and public rows while the
   adapter/test files are absent; run the validator and record the expected missing-adapter RED;
2. add the adapter and fake process suite;
3. prove prompt injection stays inert stdin data and every call is fixed `shell:false` direct argv;
4. prove unknown/cross-provider models, unsupported effort, malformed config, bad/mismatched CLI
   version, and capability identity mutation fail closed;
5. prove nonzero exit, timeout, output cap, stderr, malformed/error/blank JSON, excess turns, and
   permission denials fail before the gate;
6. prove raw session/diagnostic/secret-shaped metadata is neither returned nor copied into errors;
7. prove two Claude models have independent trust keys and receive the exact same external gate;
8. register the plan and adapter under one bounded A3A aggregate token and compact the unchanged
   multi-provider/Codex/Copilot/Gemini/Grok foundation commands under one ordered package token so
   Windows `test:kit` stays below its command-line limit; then run plan, adapter, A1, A2, roadmap,
   TypeScript, public/provider, whitespace, secret, and complete native kit gates; and
9. commit the exact source inventory, then add one evidence document and its manifest row in a
   separate commit before remote qualification.

All A3A tests are offline. Fake-port invocation count is the zero-model-call proof; a passing fake
test is not a provider execution receipt.

## TypeScript performance decision

TypeScript remains authoritative. A2 measured 10,000 admitted receipts far below its p95 50 ms and
64 MiB thresholds, while A3A performs bounded validation and JSON parsing around a process-bound
operation. Node already exposes the required direct-argv port semantics. Rust, Go, and Python add
packaging, SBOM, FFI/sidecar, and cross-platform trust cost without a measured bottleneck, so no
language-change trigger is met.

Focused adapter tests must complete in under 5 seconds and keep incremental RSS below 32 MiB on the
qualification host. These are regression sentinels, not provider latency claims.

## Exact source manifest

The A3A source commit may change exactly these eight paths:

1. `.claude/integrations/claude-cli-adapter.test.ts`
2. `.claude/integrations/claude-cli-adapter.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3a-claude-cli-adapter-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-claude-adapter-plan.test.ts`

The evidence checkpoint adds only
`docs/evidence/post-17-provider-parity-a3a-claude-adapter-2026-08-21.md` and its one sorted
public-manifest row.

## Rollback and next gates

Before commit, restore only the eight declared paths from exact parent or today's verified backup
if an update fails partially. After commit, revert evidence before source, preserving unrelated
work. Because A3A has no production process, provider call, materialized copy, credential, network,
database, or dashboard action, rollback has no external cleanup.

A3B must supply the provider-neutral isolated materializer, deny-default production process port,
independent path/tree verifier, fixed trusted-test runner, metadata-only A2 receipt assembler, and
zero-residue cleanup proof. Later thin Codex/Copilot bridges must satisfy that same contract. A4
remains prohibited until current installed version/flag, runtime entitlement, authentication,
model availability, exact cost policy, authorization receipt, isolated fixture, cleanup, and
evidence-sink inputs are all materialized.

## Non-claims

A3A does not claim Claude Code is installed, authenticated, entitled, available, or authorized for
a real provider execution. It does not claim authoritative price or token evidence, a model call,
candidate output, fixture edit, path isolation, trusted verification, cleanup, an A2 candidate
receipt, three-provider parity, performance ranking, A3 completion, dashboard support, provider
bundle exposure, P17-007 completion, or public release readiness.

No credential/session read, real CLI/model process, network provider call, filesystem
materialization, package install, dashboard/database mutation, target edit, target `.Codex` edit,
sync, direct-main push, tag, release, publication, or visibility change occurs in A3A source scope.
