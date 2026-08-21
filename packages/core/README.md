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

## Control Plane pure contracts (P17-014 A2A–A3B)

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

### P17-015 progress composition (P17-014 A2D)

`src/control-plane-progress.ts` closes the pure A2 layer without importing the Node-backed P17-015
runtime. It accepts a type-only ledger-view port; tests and later application adapters compose that
port with the real `buildProgressTaskView` validator. This preserves P17-015 as the sole binding,
event-chain, evidence, and retry-lineage authority while keeping emitted Control Plane code free of
platform imports.

A tenant-bound content-addressed mapping explicitly joins the A2B repository UUID to the configured
P17-015 repo slug. Binding proofs match all shared identity, retention, current-attempt, state, and
event-tail fields. Receipt proofs require the exact terminal tail and evidence hash set. Retry proofs
call the A2C recovery decision, preserve the entire validated ledger prefix, and bind exactly one
queued `retry_started` successor plus its new A2B envelope. Outputs contain hashes and bounded IDs
only; they do not append progress, persist tenant ownership, sign content, or dispatch work.

### Detached envelope and receipt signing (P17-014 A3A)

`src/control-plane-signing.ts` adds a pure detached-signature boundary over the A2-owned canonical
serializers. Envelope signatures use only `serializeControlPlaneExecutionEnvelope`; receipt
signatures use the A2C-owned `serializeControlPlaneExecutionReceipt`. Fixed-key signing bytes carry
distinct envelope/receipt domains plus exact tenant, signer, key version, signing time, and payload
hash metadata. They never embed or rewrite the payload.

The pure module accepts injected signer, verifier, and hash ports. It rejects structural, metadata,
encoding, payload, cross-protocol, and port failures with closed errors. Receipt signer identity must
equal the immutable envelope machine. A valid signature proves only possession over exact bytes; it
does not authorize a key, tenant, operation, or execution.

`src/control-plane-signing-node.ts` is the isolated real Ed25519 adapter. It exposes a public SPKI
key and a signer closure, never a private-key property. The A3B domain consumes these ports without
moving authorization policy or key lifecycle into the platform adapter.

### Worker request authentication and machine key lifecycle (P17-014 A3B)

`src/control-plane-machine-keys.ts` owns the exact, public-only machine key-set contract. A set has at
most eight version-sorted records, exactly one highest-version active key or no active key, and a
monotonic CAS version. Rotation requires the current active key and creates one non-renewable grace
window of at most five minutes. Revocation is immediate, clears any retirement deadline, and never
promotes an older key. The module contains no key generation, secret material, storage, or platform
dependency.

`src/control-plane-worker-request-auth.ts` owns one exact Ed25519 wrapper for the five closed worker
request kinds. It derives the canonical POST path from request kind and lease identity, hashes at
most 64 KiB of exact UTF-8 body text, accepts only the fixed 60-second age and 30-second future-skew
bounds, and composes an injected clock, tenant/machine key-set lookup, verifier factory, and atomic
authorized-nonce port. The nonce port receives a domain-separated tenant/machine/key-bound hash and
the observed key-set version, never the raw nonce.

A3B proves pure policy and port ordering only. It does not create enrollment grants, key or nonce
storage, database transactions, HTTP handlers, worker processes, execution state, network delivery,
dashboard UI, or remote execution. Those remain disabled until their separately reviewed A4–A6 and
privacy-gated adapters are implemented.

### Transactional signed-delivery worker journal (P17-014 A3C)

`src/control-plane-worker-journal.ts` owns the exact journal entry and monotonic compare-and-set
application boundary. A prepared entry retains the A2B envelope and A3A detached signature, binds
the tenant, machine, and delivery identity, and must commit before a future executor can start. Its
states reuse A2C's `not_started`, `execution_started`, `receipt_available`, and `unknown` recovery
vocabulary. Same-delivery redelivery resumes only an unstarted entry, routes ambiguous execution to
A2C recovery, or replays the exact stored signed receipt. Acknowledgement never deletes that receipt.

Every loaded entry is bounded before cryptographic validation, structurally exact, domain-hashed,
and revalidated through the injected Control Plane and worker verifiers. Prepare/start are bounded
by the signed envelope's initial lease window; late signed receipts remain replayable but A2C alone
decides whether server state accepts or quarantines them. The pure source imports no platform,
filesystem, process, network, database, or execution adapter.

`src/control-plane-worker-journal-node.ts` is an explicit disposable proof adapter. It requires an
injected absolute non-root directory, rejects symlink/junction roots, hashes journal keys into path
names, flushes bounded temporary segments, and publishes immutable revisions through an exclusive
hard link. Restart selects only contiguous integrity-checked committed history; torn temporary files
are ignored and corrupt committed history fails closed. The adapter has no default location and does
not claim encrypted storage, malicious-local-user tamper resistance, cross-platform power-loss
durability, retention, compaction, a worker process, an executor, or remote execution.

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

### Provider-neutral specification adapters (P17-004 A2A–A2B)

`src/spec-adapter.ts` defines the provider-neutral `SpecAdapterResult` schema `1.1.0`, exact frozen
capability discovery, bounded byte/result contracts, stable closed errors, and field-conservation
rules. Discovery reads only caller-registered descriptors; it does not inspect packages, execute an
adapter, read environment or credentials, or contact a provider.

`src/spec-adapter-jira.ts` and `src/spec-adapter-azure-devops.ts` parse only the closed ADF and HTML
subsets documented by the A2A plan. They accept exact `Uint8Array` input, use an injected SHA-256
port before fatal UTF-8/JSON parsing, preserve literal anchors, and expose unsupported field names
without their values. `src/spec-adapter-node.ts` is the isolated Node SHA-256 implementation.

The public result schema is `docs/schemas/spec-adapter-result.schema.json`. A2A performs no network,
filesystem, auth, CLI, or provider-bundle work.

`src/spec-ir.ts` is the single `SpecIR` authority. `src/spec-adapter-spec-ir.ts` validates an already
parsed IR and maps it to the same result contract without source I/O or reparsing. The A2B integration
composer gives local files opaque `local:<kind>:<sha256>` identities, while Confluence B0 uses
`confluence:<page-id>`; both write the compatibility IR plus a provider-neutral result and B1 consumes
only `adapterResult.source`. Warning text remains private and is represented only by the unsupported
field name `warnings`.

P17-004 remains in progress because live Jira/Azure DevOps I/O, credentials, and provider-package
exposure are separate slices. A2B does not add network access, tokens, sync, target writes, a version
bump, or plugin publication.

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
