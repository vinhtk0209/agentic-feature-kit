# Agentic Feature Kit Core

`packages/core` is the provider-neutral source of truth for deterministic workflow contracts.
Provider bundles must invoke this core; they must not copy its discovery or gate rules.

## Project Intelligence

The first public contract is Project Profile schema `1.0.0`:

```bash
npx tsx packages/core/src/project-intelligence.ts <repository-root>
```

The command is read-only and emits exactly one `@@PROJECT_PROFILE@@` JSON envelope. Exit code `0`
means the profile is ready. Exit code `1` means the profile is valid but requires input, or the
repository could not be inspected safely. Exit code `2` means CLI usage is invalid.

The JSON Schema lives at `docs/schemas/project-profile.schema.json`. Consumers must also validate
the envelope fingerprint, gate/capability consistency, and ready/issues consistency with the
runtime validator exported from `src/project-intelligence.ts`.

## Stack Portability

`src/stack-portability.ts` consumes a validated Project Profile and a bounded scan of source and
instruction evidence. It resolves a framework adapter, capability-file layout, HTTP transport,
optional request/response transforms, and target-specific assumptions without changing Project
Profile schema `1.0.0`.

```bash
npx tsx packages/core/src/stack-portability.ts <repository-root>
```

The read-only command emits exactly one `@@STACK_PORTABILITY@@` schema `1.0.0` envelope. Its
`profileFingerprint` must equal the Project Profile repository fingerprint. Explicit declarations
and observed imports/calls are evidence; package presence alone never activates Open edX helpers.
Unknown or conflicting framework/transport decisions produce structured `needs_input` findings.
The public schema is `docs/schemas/stack-portability.schema.json`.

## Runtime choice

The implementation remains TypeScript because it inspects Node package manifests, runs inside the
kit's existing Node 20+ runtime, and completes the bounded depth-two scan without a demonstrated
performance bottleneck. Python, Rust, or Go may replace a component only after a reproducible
benchmark or missing Node capability is recorded; language novelty alone is not a migration reason.

## Workflow Orchestrator

The Orchestrator contract validates all 23 mandatory phases plus conditional `D-cross-2`, exact
input/output keys, content-addressed artifact references, non-auto-approved gates, chained
transitions, resume prefixes, and conservation against the sanctioned golden capture.

```bash
npx tsx packages/core/src/workflow-orchestrator-cli.ts resume
```

Requests are bounded JSON on stdin. The CLI emits exactly one `@@ORCHESTRATOR_RESULT@@` envelope
and never writes files. Supported modes are `create-envelope`, `validate-envelope`, `resume`,
and `compare-golden`. Provider skills remain thin and cannot redefine ordering, gates, evidence,
or completion semantics.

## Control Plane pure contracts (P17-014 A2A–A2C)

`src/control-plane.ts` defines the closed four-operation registry, opaque bounded operation inputs,
hard resource-budget profiles, and explicit worker capability manifest used by later P17-014 slices.
The domain takes an injected `ControlPlaneHashPort`; it imports no runtime, filesystem, environment,
network, dashboard, or provider module.

The registry contains protocol vocabulary only. A capability manifest advertises an explicit sorted
subset and binds each operation to its contract hash and fixed adapter identifier/version. Neither
artifact proves an adapter is installed or a worker exists. Execution envelopes, machine/task/lease
identity, state/replay, signing, persistence, APIs, worker processes, and provider distribution are
not implemented in A2A and remain disabled.

### Unsigned execution envelope (P17-014 A2B)

The same module now creates and validates one exact, content-addressed execution envelope. It binds
tenant and P17-015-compatible identity references to one canonical A2A descriptor/input, canonical
lease/deadline timestamps, and a metadata-only P17-015 evidence policy. Identity UUIDs are lowercase,
attempt lineage is self-consistent, repository identity cannot diverge from an operation input, and
the fully serialized envelope is bounded to 256 KiB.

`serializeControlPlaneExecutionEnvelope` is the sole canonical full-envelope serializer for the
future A3 signing boundary. A2B does not contain a signature, key, nonce, clock read, state machine,
lease operation, P17-015 lookup/write, persistence, network, runtime adapter, or availability claim.
The validated value grants no execution authority by itself.

### Task state, lease, cancellation, receipt, and recovery (P17-014 A2C)

`src/control-plane-state.ts` is a separate pure domain module around the immutable A2B envelope. It
discriminates definition approval from runtime approval, enforces expected-resource-version CAS,
records at most one active envelope lease, bounds heartbeat renewal to 15 seconds and the envelope
deadline, and models cooperative cancellation without treating disconnect as cancellation.

Receipts contain only canonical identity and hashes. Exact replay is idempotent; conflicting, late,
or cancel-losing success receipts cannot mutate state and are returned as closed conflict/quarantine
decisions. Expiry recovery can reclaim an unstarted lease, route a stored receipt, recommend a new
P17-015 attempt for started read-only work, or require manual recovery for unknown/side-effecting
outcomes. A2C does not create that retry or prove P17-015 references; A2D owns binding and lineage.
Signing and durable journal behavior remain A3, and persistence, authorization, APIs, workers, UI,
and remote execution remain later privacy-gated slices.

## Semantic Specification

`src/semantic-spec.ts` converts source-backed acceptance criteria into schema `1.0.0` while keeping
semantic identity separate from source provenance. Equivalent Confluence, Jira, or file fixtures
can share a `semanticHash` while retaining different `provenanceHash` values and literal anchors.

Every requested contract is explicit: one source-backed value is `known`, conflicting values are
`conflict`, and missing values are `unknown`. For example, an unstated API contract produces
`API_CONTRACT_UNSPECIFIED`; the core never invents an endpoint. JSON round trips are fail-closed,
and semantic transforms must conserve requirement identities and provenance.

The public JSON Schema is `docs/schemas/semantic-spec.schema.json`. Source transports remain adapter
concerns and are deliberately outside this core contract.

## Conditional Quality Gates

`src/conditional-quality-gates.ts` consumes a validated Project Profile plus bounded feature-change
evidence. It activates i18n completeness, router registration, and style ownership checks only when
the profile positively detects those systems. Absent systems are `not_applicable`; unknown or
conflicting profiles are `needs_input` and cannot pass.

```bash
npx tsx packages/core/src/conditional-quality-gates.ts < request.json
```

The command is read-only and emits one `@@CONDITIONAL_GATES@@` envelope. Every verdict cites the
profile and/or feature files that produced it. CSS-in-JS, Tailwind, React Native styles, CSS, and
SCSS are evaluated only against detected implementations, so a CSS-in-JS project is never forced
through an SCSS-only rule. The result schema is `docs/schemas/conditional-quality-gates.schema.json`.

## Stability

- Schema version: `1.0.0`
- Sentinels: `@@PROJECT_PROFILE@@`, `@@STACK_PORTABILITY@@`
- Traversal: bounded per contract, ignored build/dependency segments at every depth, never follow symlinks
- License: Apache-2.0 (repository root `LICENSE`)
