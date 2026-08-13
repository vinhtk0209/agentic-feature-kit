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

## Stability

- Schema version: `1.0.0`
- Sentinel: `@@PROJECT_PROFILE@@`
- Traversal: depth two, ignored build/dependency segments, never follow symlinks
- License: Apache-2.0 (repository root `LICENSE`)
