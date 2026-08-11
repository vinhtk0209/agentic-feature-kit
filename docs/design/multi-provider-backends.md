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
