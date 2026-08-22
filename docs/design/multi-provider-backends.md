# Multi-provider execution backends

> I2-A foundation for `i2-multi-model-backends`. This document defines a pure trust and
> evidence-binding boundary. It neither launches a provider CLI nor reads a credential, contacts a
> provider, writes Supabase, modifies an evidence bundle, or changes a workflow gate.

## §1. Scope, invariants, and deferred compatibility work

The existing `.claude/model-config.json` remains the canonical model/provider registry. I2-A adds
an execution-facing identity derived from that registry: `provider`, `modelKey`, `modelId`, and
`adapterVersion`. It supplies a provider registry that permits execution only after a successful
capability probe, and it returns a gate verdict supplied by the same deterministic gate function
for every backend.

The following are intentionally out of scope for I2-A:

- a live Codex, Copilot, Gemini, Grok, or other provider transport;
- CLI spawning, token/environment lookup, HTTP calls, telemetry uploads, and dashboard changes;
- a mutation of P1's on-disk `EvidenceManifest` v1; and
- a claim of live provider cost parity.

`EvidenceManifest` v1 has no backend-identity or measured-cost fields. Retrofitting those fields
without an additive compatibility proof would risk invalidating P1's hash contract. I2-B therefore
uses a separately hash-bound sidecar record instead of changing the v1 manifest shape; its precise
compatibility and strict-verification rules are locked in §5.

## §2. Execution adapter and capability trust contract

Every adapter implements this minimal injectable interface:

```ts
interface ProviderAdapter {
  identity: { provider, modelKey, modelId, adapterVersion };
  capabilityProbe(): Promise<{ provider, capabilities }>;
  executePhase(prompt): Promise<{ output, cost? }>;
}
```

The registry accepts registration but does **not** confer permission to execute. Before execution,
the adapter must return a probe whose provider exactly matches the declared identity and which
contains both required capabilities:

1. `execute-phase` — the adapter can receive a canonical phase prompt; and
2. `evidence-binding` — the adapter can carry the immutable identity binding through its future
   transport result.

Type declarations are not a trust boundary: the runtime rejects a missing/non-string provider,
non-array capability list, or blank/non-string capability before granting trust. Registration
snapshots the full four-field identity and checks it before and after asynchronous probing and
execution; a model ID or adapter-version substitution therefore cannot inherit trust. Execution
also rejects a non-string output before it invokes the injected gate.

The registry hashes the canonical identity plus sorted capability list. Execution is refused if
the provider is unregistered, untrusted, insufficiently capable, or its identity changes after
trust. I2-C1 now supplies the Codex CLI production adapter through an injected direct-process
boundary; tests inject a local process boundary and never invoke a provider.

Registry/trust/execution lookup uses the canonical backend key `percentEncode(provider) + ":" +
percentEncode(modelKey)`, rather than `provider` alone. The delimiter cannot alias encoded input,
so two configured models from the same provider can coexist without sharing capability trust.

## §3. Gate invariance, identity binding, and cost semantics

An adapter returns only output. The caller injects the same gate function used for a single-agent
run; no provider-specific pass path exists. Therefore a plausible diff that misses an acceptance
criterion fails when that identical gate fails. The backend count and provider name never change a
gate threshold, required artifact, or verify verdict.

`createEvidenceBinding` forms a SHA-256-protected record over the complete backend identity,
capability hash, and cost state. Replacing `provider`, model, adapter version, capabilities, or
cost after creation invalidates `verifyEvidenceBinding`. This is the I2-A proof of immutable
identity; I2-B is responsible for placing it durably beside/inside a backward-compatible P1
manifest.

Cost has two honest states only:

| State | Token/cost fields | Meaning |
|---|---|---|
| `known` | safe non-negative integer token counts and finite non-negative USD cost, including genuine zeros | backend reported a measurement |
| `unknown` | `null` for input tokens, output tokens, and USD cost | no measurement was supplied |

Only an absent measurement (`undefined`) yields `unknown`; a supplied malformed measurement is an
error and is never downgraded to `unknown`. Capability and binding hashes must be canonical 64-char
lowercase SHA-256 hex before a binding can be created or verified. The current dashboard's Claude OTLP reader cannot establish
cost parity for another backend; I2-C must add an explicitly measured neutral ingestion path or
continue to surface `unknown`.

## §4. I2-A attack evidence and next slices

The pure attack suite `multi-provider-backends.test.ts` must prove all of the following without a
provider call:

1. an untrusted registered backend cannot execute;
2. a plausible-but-wrong alternative output fails the same injected gate;
3. a provider/model identity mutation invalidates its evidence binding; and
4. absent cost is `unknown`/`null`, while a reported zero remains distinct and `known`;
5. malformed supplied cost and malformed capability hashes fail closed; and
6. two distinct trusted keys (Claude and Codex) pass the exact same gate function object and both
   reject a plausible wrong result, while two Claude model keys remain non-aliasing.

I2-C:
implement one operator-configured non-Claude transport plus a capability smoke test and a neutral
measured-cost contract. Only after I2-C's same-prompt/same-gates run and cost evidence may the
roadmap's full I2 definition of done be claimed.

## §5. I2-B — v1-compatible durable backend bindings

`buildBundle` accepts an optional pre-validated `EvidenceBackendBinding`. When present, it writes
exactly one generated `.evidence/<phase>/backend-binding.json` sidecar and adds its repository-
relative path, bytes, SHA-256, and reserved `backend-binding` role to the existing manifest's
`files` array. `schemaVersion` remains `1`; legacy builders do not pass the optional value, produce
the same file-list semantics, and continue to use the unchanged `verifyBundle` and
`resumeFromBundles` paths.

The builder calls `verifyEvidenceBinding` before creating any evidence directory, transcript,
sidecar, or manifest. An absent field means no backend claim; a supplied malformed binding throws
and leaves no partial bundle writes.

`verifyBackendBoundBundle` is the mandatory strict read path when an I2 execution claims backend
evidence. It first requires the ordinary v1 hash verification to pass, then requires exactly one
sentinel identified by the reserved path or role, with both exact expected values. It parses the
hash-bound sidecar and reuses `verifyEvidenceBinding`. Sidecar removal/tampering, a duplicated or
aliased sentinel, and any identity/capability/cost mutation all fail closed. Generic P1 callers do
not infer an I2 claim from an old v1 bundle and retain their existing verification/resume behavior.

## §6. I2-C1 — operator-pinned Codex CLI transport foundation

`codex-cli-adapter.ts` is the first non-Claude adapter. It takes an injected process executor and
a non-secret operator configuration that pins the executable, canonical model key, adapter version,
expected Codex CLI semver, timeout, output cap, and optional per-million
input/cached-input/output USD rates. It takes an injected `ModelConfig`, calls
`identityFromModelConfig`, and refuses an unknown key or any provider other than `codex`; arbitrary
model ID/model-key pairs are impossible. It does not read credentials, environment variables, or
the registry from disk. The required non-interactive argv is fixed as:

```text
<executable> exec --ephemeral --json --sandbox read-only --model <pinned-model> -
```

The phase prompt is passed only on stdin. The adapter always asks its executor for `shell: false`;
the pinned model is one direct argv value, and prompt text is never interpolated into a shell
command. Blank prompts are refused before spawning, while normal multiline prompts are preserved.
Its capability probe is the separate direct argv `<executable> --version`, accepted only for the
strict `codex-cli X.Y.Z` response form and an exact match with `expectedCliVersion`. The observed
version is included as `codex-cli-version:<version>` in the capabilities, so the capability hash
binds the actual CLI version rather than just the operator's assertion.

Execution accepts JSONL only when it contains exactly one `turn.completed` usage sentinel and one
non-empty completed `agent_message`. It validates safe non-negative `input_tokens`,
`cached_input_tokens`, and `output_tokens`, with cached input no larger than input. Nonzero exit,
timeout, malformed/duplicate/missing sentinels, missing final message, and combined stdout/stderr
output-cap overflow are errors before the shared gate is invoked. The production Node executor
captures direct-argv output only, returns deterministic exit/signal state, and terminates its child
tree on timeout (Windows `taskkill /T /F`; detached process group on POSIX where available).

If all three configured rates are present, C1 computes a finite USD estimate and returns a known
`BackendCost`. If rates are absent, it returns the canonical all-null `unknown` cost. This is an
intentional C1 limitation: the existing binding schema cannot truthfully retain measured tokens
with an unknown USD amount, so it does not fabricate zero or partially measured values. I2-C2 must
add an additive receipt schema before token-only data can be persisted; a later live/operator slice
must prove the selected CLI profile, same phase/gates, and dashboard `token_usage` parity.

## §7. I2-C2 — live usage receipt and completion bundle

The dashboard's additive Codex JSONL receipt preserves measured tokens independently from price:
`usage_status=captured`, `pricing_status=unpriced`, and `cost_est_usd=NULL`. This is compatible with
the original binding's all-null `unknown` cost; neither side manufactures a zero price. A known USD
cost remains unavailable until an operator pins an approved rate snapshot.

`scripts/i2-live-evidence-verify.ts` binds the authorized live receipt to a new P1 v1 bundle without
changing the manifest schema. The bundle contains exactly one backend-binding sidecar, one fixed
shared-gate transcript, and one run-scoped usage receipt. The verifier reuses the strict I2-B reader,
replays the same backend-neutral gate, and requires exact provider/model/run identity, one terminal
completion, safe token counts, a single output occurrence, canonical timestamps, immutable file
hashes, and honest `NULL`/`unpriced` cost semantics. Wrong but plausible output, cross-run usage,
fabricated zero price, malformed counts, duplicate output, receipt tamper, and backend substitution
all fail closed.

## §8. ADR — one direct normalized transport for Codex, Copilot, and Grok

**Status:** Accepted
**Date:** 2026-08-11
**Decider:** operator

### Context

Claude Code subscription access is no longer available on the operator host. A real Codex feature
run also proved that routing machine-readable JSONL through a 120-column Windows ConPTY can insert
redraw/wrap bytes and make otherwise valid usage fail closed. The same run proved that an MCP
process is not the sidecar child process: telemetry invoked from MCP does not inherit the
sidecar-injected runner secrets. GitHub Copilot CLI is an official non-interactive transport with
explicit model selection, while Grok exposes an official Responses/streaming API rather than a
required local CLI.

### Decision

The kit remains the sole owner of provider identity, capability probing, same-gate semantics, and
evidence binding. Production adapters use direct `shell:false` process or HTTP boundaries and
return one provider-neutral result. The dashboard may implement a bounded provider transport
decoder for live streaming and usage capture, but it must not invent provider identity, gate, or
evidence semantics; its decoder must be attack-tested against the same pinned wire contract and it
must never infer identity from a UI label.

- **Codex:** keep the existing direct native CLI adapter and exact JSONL usage sentinel.
- **Copilot:** use the official `copilot -p <prompt> --model <pinned-model>` non-interactive mode as
  direct argv. The prompt is one bounded, non-secret argv value because the CLI has no stdin prompt
  contract. Disable built-in MCPs and deny shell/write tools for the fixed smoke. CLI version and
  the requested model are capability-bound; absent OAuth/token state is `unavailable`, never pass.
- **Grok:** use the official xAI `/v1/models/<id>` probe and `/v1/responses` execution endpoint with
  redirect refusal, timeout, response cap, strict output/usage parsing, and an injected API key.
  Missing `XAI_API_KEY` means `unavailable` and performs zero requests.
- **All providers:** use the same fixed prompt and the exact same gate function. Unknown pricing
  remains all-null; token counts must never be converted to zero merely because USD pricing is
  absent. Every live result is bound to provider, model key/id, adapter version, observed runtime
  capability, output evidence hash, and strict P1 bundle verification.

### Options considered

| Option | Complexity | Evidence quality | Decision |
|---|---:|---:|---|
| Keep every CLI behind PTY and add more escape-sequence heuristics | low initially | low; real Codex JSONL was corrupted | rejected |
| Direct provider adapter with one normalized result/evidence contract | medium | high; raw transport is parsed before UI/PTY | accepted |
| Implement separate provider parsing and gates inside the dashboard | high | low; creates a second source of truth | rejected |

### Consequences

- Adding a model under an already supported provider is a registry/config change plus capability
  smoke, not a new gate implementation.
- Adding a provider still requires one adapter and attacks for executable/API substitution,
  authentication absence, malformed/duplicate output, timeout/cap, identity mutation, and same-gate
  rejection. If the provider is also launched from the dashboard, add one registry entry, one
  direct transport implementation, one bounded decoder when the wire format is structured, and a
  conformance canary proving the decoder cannot manufacture kit evidence. A registry entry alone
  does not make a provider usable.
- TypeScript remains appropriate because execution is network/process bound and the measured local
  parser is not a hot path. A Rust/Go/Python rewrite requires new profiling evidence under the
  existing performance ADR; language novelty is not evidence of a faster end-to-end run.

## §9. Model-scoped reasoning effort and Gemini CLI

Reasoning effort is an execution capability, not a cosmetic UI preference. Each model entry may
declare a non-empty `reasoningEfforts` list and must include `default`. Missing declarations are
normalized to `default` only for backward compatibility. A request that is not in the selected
model's list fails before any capability or execution process starts.

Codex binds a non-default selection through the direct argv pair
`-c model_reasoning_effort="<effort>"`; Copilot uses
`--reasoning-effort <effort>`. Gemini CLI `0.54.4` exposes no equivalent option, so its configured
models accept only `default`. Every adapter includes `reasoning-effort:<value>` in the trusted
capability set. Consequently a different effort produces a different capability hash and a
different strict evidence binding even when provider, model, and adapter version are unchanged.

`gemini-cli-adapter.ts` follows the same direct-process contract as the other CLI adapters. The
operator pins native Node, an absolute JavaScript entrypoint, exact CLI semver, model key, timeout,
and output cap. Execution uses headless JSON, explicit model selection, plan approval mode, and
`--skip-trust`; malformed/error/blank response envelopes, missing stats, stderr, nonzero exit,
timeout, and cap overflow fail before the shared gate. Credentials remain outside the adapter.
The dashboard maps its masked `RUNNER_GEMINI_API_KEY` secret to the official `GEMINI_API_KEY`
environment variable only for Gemini processes.

Model availability is runtime evidence. A documented model ID is not added to the live-ready
catalog when the current account rejects it. Conversely, adding a model never creates a new gate:
it requires a registry entry, an exact entitlement probe, model-specific effort declarations, and
the same provider-neutral gate/evidence checks.

## §10. Claude CLI output-adapter foundation

P17-007 A3A adds one Claude-specific infrastructure adapter behind the existing `ProviderAdapter`
port. Its command profile is derived from the current official Claude Code CLI and permission
references: strict version probe; print-mode JSON; exact model and optional effort; bounded turns
and estimated USD; safe mode; `dontAsk`; only `Read,Edit,Write` available and pre-approved; all MCP
tools denied; Chrome disabled; and session persistence disabled.

The adapter receives a fakeable `ClaudeProcessPort`, constructs fixed direct argv with `shell:false`,
supplies the exact task prompt only through stdin, and normalizes only a successful bounded result
string. It does not import a process, filesystem, environment, network, or credential API. Raw
output, session IDs, UUIDs, permission denials,
diagnostics, local paths, and client-estimated cost never cross the provider-neutral port. Cost
remains `unknown` until an exact dated price-basis receipt can satisfy the parity evaluator.

This is an output-adapter foundation, not the P17-007 runner. A later provider-neutral slice must
still supply fresh fixture materialization, deny-default production environment, OS process-tree
cleanup, allowed-path/tree enforcement, independent trusted verification, metadata-only A2 receipt
assembly, managed-policy/hook attestation, and zero-residue deletion before any external provider
run is eligible.

## §11. Claude deny-default Node process boundary

P17-007 A3B1 adds the Node infrastructure implementation of the A3A `ClaudeProcessPort`. The port
receives one exact absolute isolated root and one explicit environment map at construction. It does
not read or spread `process.env`, so ambient credentials and unrelated process state cannot enter by
omission. Every request must target that root and uses direct `shell:false` spawn with piped stdio.

Raw stdout/stderr bytes share one cap. Timeout, overflow, stdin failure, or termination-grace expiry
delegates to an injected cross-platform process-tree terminator, while the first terminal state wins.
Infrastructure errors are opaque fixed codes and never interpolate paths, argv, environment values,
or child exceptions. Fake-child tests own this slice; no Claude process or model call is qualification
evidence.

This boundary does not choose a safe per-run environment or prove a session, managed policy, hook,
fixture, verifier, or cleanup policy. The later isolated materializer/runner must construct those
inputs, inventory the tree independently, execute the one trusted test, delete the run root, and
derive the metadata-only A2 receipt before any provider run may qualify.

## §12. Provider-neutral isolated fixture lifecycle

P17-007 A3B2A adds a provider-neutral one-use filesystem lifecycle below every future provider
runner. It admits only the exact A1 public synthetic golden, creates one random direct child beneath
a caller-selected real parent, writes the five seed files with exclusive create semantics, and
recomputes the canonical seed-tree hash from an alias-free readback. Locked and allowed-write paths
are cloned, frozen, and bound to one inventory digest rather than trusted from caller-owned arrays.

Cleanup never accepts an arbitrary caller deletion path. It starts from the internally owned root,
uses `lstat` at each node, unlinks symbolic links and Windows junctions without following their
targets, and recurses only through real directories whose canonical paths remain inside the owned
root. A live read-only directory handle pins the original root identity until a terminal lifecycle
state, and cleanup compares that handle's `fstat` identity with the root `lstat`; delete/recreate
cannot qualify through filesystem inode reuse. The handle is closed on success and every failure
path, and a final absence readback is required. State transitions are single-use and all failures are
fixed opaque codes that exclude supplied paths, fixture contents, usernames, and OS diagnostics.

This boundary does not run the golden test or any child/provider/model process. A3B2B must inspect
the post-provider candidate independently, enforce locked/allowed paths and the closed violation
set, and run exactly one trusted test through A3B1. A3B3 must bind those results into a metadata-only
A2 receipt and attest or isolate managed policy/hooks before external parity execution may qualify.

## §13. Provider-neutral candidate verifier and trusted-test boundary

P17-007 A3B2B adds the provider-neutral candidate verifier above the A3B2A lifecycle and behind its
own structural process port. It admits only the exact immutable lifecycle receipt, opens and pins the
candidate root without following aliases, independently hashes the complete regular-file tree, and
derives locked-path, undeclared-path, dependency, disclosure, and permission-widening flags from
observed bytes and metadata rather than provider claims.

Only a candidate with zero pre-test violations reaches the process port. The verifier constructs the
single fixed `node --test test/report.test.js` request with empty stdin, the admitted root, `shell:false`,
and the A1 timeout/output caps. The supplied absolute Node executable and port are ephemeral
capabilities; the verifier never discovers a command, reads `PATH`, inherits an environment, or
spawns directly. Raw stdout/stderr are inspected only in memory and are never returned.

After the test settles, the verifier repeats the root-identity and full-inventory checks. Any test-
time byte, path, node-kind, permission, or root replacement fails closed even if exit code is zero.
The verifier closes only its read-only identity handle; A3B2A remains the sole cleanup owner. A3B3
must still compose these metadata with cleanup and managed-policy/hook evidence into an A2 receipt.
No provider/model execution, credential/session access, receipt assembly, persistence, sync, or
release authority is added by this boundary.

## §14. Provider-neutral policy and evidence attestation boundary

P17-007 A3B3A adds the provider-neutral pure attestation boundary between the existing offline
execution/verifier primitives and later A2 receipt composition. A pre-run policy receipt binds the
exact provider/run identity plus distinct hashes for environment, filesystem, network, settings,
managed-policy, hooks, runtime entitlement, authorization, adapter capability, and execution policy.
Closed settings/managed-policy/hook modes prevent an aggregate or provider-authored success claim
from standing in for independently established evidence.

The post-run receipt admits exact ordered AC/artifact/gate/API decisions, the hash-valid A3B2B
candidate-verification receipt, and an A3B2A cleanup success or metadata-only cleanup failure. It
preserves false decisions, nullable metric provenance, and cleanup failure while exposing no paths,
source, prompts, transcripts, response bodies, session IDs, environment values, or exceptions.

The module performs canonical validation and hashing only. It does not inspect settings or hooks,
launch a process/provider/model, discover credentials or environment, read the filesystem/network,
or emit the A2 receipt. Trusted producers must establish every evidence hash; A3B3B may compose only
from an admitted A3B3A receipt. A4 remains prohibited until all provider-specific producers and the
evidence sink are independently qualified.

## §15. Exact A2 success-receipt composition boundary

P17-007 A3B3B adds one pure success-only composer between durable A3B3A admission and the existing
A2 evaluator. It accepts no provider output or partial fields directly. The complete A3B3A receipt
is re-admitted first, and composition fails unless `eligibleForA2Composition` is exactly true.

Every A2 field has one explicit source. The verified post-provider
`candidateVerification.candidateTreeSha256` becomes A2's implementation-tree identity; the distinct
pre-run materialization identity remains bound to A3B2A cleanup and is not substituted. AC,
artifact, gate, API, trusted-test, violation, cleanup, policy, runtime identity, and nullable metric
metadata retain their intended meanings. Policy-mode and metric-provenance labels remain in A3B3A
instead of being relabelled into unrelated A2 hash fields.

The composer derives a fresh canonical A2 receipt hash, invokes the existing exact A2 validator,
and returns a deeply immutable metadata-only receipt. Ineligible evidence is rejected because A2
cannot represent false AC/artifact decisions without fabricating coverage. This boundary performs
no orchestration, persistence, evidence production, provider/model/process call, clock,
filesystem/environment/network access, credential/session operation, dashboard/database/target
write, sync, or release action. A4 remains prohibited.
