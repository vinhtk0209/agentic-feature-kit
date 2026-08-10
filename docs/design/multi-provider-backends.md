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
without an additive version/parser compatibility proof would risk invalidating P1's hash contract.
I2-B must define an additive manifest version (or a separately hash-bound sidecar record), prove
old-manifest readers remain valid, then bind the I2-A identity hash into that durable form. Until
then, the I2-A binding is an in-memory/pure artifact only and cannot be represented as an existing
P1 bundle completion.

## §2. Execution adapter and capability trust contract

Every adapter implements this minimal injectable interface:

```ts
interface ProviderAdapter {
  identity: { provider, modelKey, modelId, adapterVersion };
  capabilityProbe(): Promise<{ provider, capabilities }>;
  executePhase(prompt): Promise<{ output }>;
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
trust. A production adapter is supplied only by a future transport boundary; tests inject a local
adapter and never invoke a provider.

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

I2-B: prove manifest-version/sidecar backward compatibility and persist identity bindings. I2-C:
implement one operator-configured non-Claude transport plus a capability smoke test and a neutral
measured-cost contract. Only after I2-C's same-prompt/same-gates run and cost evidence may the
roadmap's full I2 definition of done be claimed.
