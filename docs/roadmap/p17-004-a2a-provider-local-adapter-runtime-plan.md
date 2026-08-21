# P17-004 A2A: Provider-Local Specification Adapter Runtime

**Status:** In progress under standing Post-17 continuation authority
**Date:** 2026-08-21
**Roadmap task:** P17-004
**Parent checkpoint:** P17-004 A1 input lock, merged through PR #35
**Decision lock:** `contract=S1, discovery=D1, bytes=B1, mapping=M1, jira=J1, azure=A1, failure=E1, privacy=R1, language=T1, scope=N1`

## Outcome

A2A creates the first executable P17-004 boundary without contacting a provider. It adds one
provider-neutral application contract, deterministic offline capability discovery, and two bounded
local parsers for the approved Jira and Azure DevOps synthetic exports. Both adapters return the
same `SpecAdapterResult` shape and unchanged P17-003 `SemanticSourceInput` contract.

This slice proves local byte-to-contract behavior only. Existing Confluence and local-file intake
still cross the older `SpecIR` staging boundary and need a separate A2B composition decision. No
network, credential, environment, filesystem, CLI, provider-bundle, or tenant capability enters
A2A.

## Reconciled inputs

- A1 source/evidence are merged as PR #35; the exact evidence head is `20a0e8ab…` and qualified
  tree is `a559f153…`.
- P17-003 `SemanticSourceInput` and `normalizeSemanticSpec` remain canonical in
  `packages/core/src/semantic-spec.ts`.
- Approved provider inputs are only
  `docs/roadmap/fixtures/p17-004-jira-minimal.json` and
  `docs/roadmap/fixtures/p17-004-azure-devops-minimal.json`.
- The task remains `in_progress`; A2A is not sufficient to claim Confluence/local-file parity or
  P17-004 completion.

## Architecture decision record

### Context

The public kit needs provider-neutral specification ingestion while retaining exact input bytes,
literal provenance, explicit unsupported fields, deterministic capability discovery, and a small
cross-platform distribution surface. Payloads are bounded to 256 KiB and parsing performs no I/O.

### Decision

Use a pure TypeScript application contract plus provider-local TypeScript parsers. Keep the Node
SHA-256 implementation behind an injected `SpecAdapterHashPort`; provider parsers import neither
Node APIs nor provider clients. A tiny Node hash factory is the only runtime-specific file.

### Options considered

| Option | Complexity | Distribution | Capability fit | Decision |
|---|---:|---:|---:|---|
| TypeScript with injected hash port | Low | Existing Node 20+ archives | Complete for bounded JSON/ADF/HTML | Adopt |
| Rust native addon or sidecar | High | Per-platform binaries, FFI/signing/SBOM expansion | No missing capability demonstrated | Defer |
| Go sidecar | High | Extra process and archive matrix | No missing capability demonstrated | Defer |
| Python helper | Medium | Interpreter/version dependency | No missing capability demonstrated | Defer |

Rust, Go, or Python may be reconsidered only if the exact 256 KiB fixture benchmark exceeds 50 ms
p95 on a qualification runner, incremental RSS exceeds 64 MiB, or a required safe parser capability
cannot be implemented within the closed TypeScript grammar. A2A records a non-gating timing
observation; it does not hide a threshold breach by weakening payload budgets.

### Consequences

- Provider business rules stay outside the semantic model.
- Exact-byte hashing can be replaced or accelerated without changing adapter semantics.
- A future live connector can inject bytes after its own auth/network boundary.
- A2B must explicitly compose legacy Confluence/local-file transports instead of importing them
  into shared core by convenience.

## Locked contracts

### S1 — One application result schema

`SpecAdapterResult` schema `1.0.0` has exact fields:

- `schemaVersion`;
- `adapterId` and `providerId`;
- one immutable capability descriptor;
- one unchanged `SemanticSourceInput`; and
- JavaScript-ordinal-sorted unsupported field names.

The public JSON Schema is `docs/schemas/spec-adapter-result.schema.json`. Runtime validation also
checks descriptor/result identity, provider/source identity, sorted uniqueness, source shape, and
literal semantic provenance. Provider-specific payload fields cannot escape through the wrapper.

### D1 — Discovery is explicit, exact, frozen, and offline

`discoverSpecAdapters` accepts only an explicitly registered descriptor list. It returns one exact
schema `1.0.0` envelope sorted by adapter ID. Adapter IDs are unique; descriptors are deep-frozen;
and discovery performs no adapter execution, dynamic import, environment read, credential probe,
filesystem access, network request, or tenant crawl.

Each descriptor declares provider ID, `utf8-json` input, output schema version, exact
`base-url`/`field-mapping` configuration requirements, and `explicit-field-names` unsupported
behavior.

### B1 — Exact bytes are hashed before decoding or parsing

Adapters accept `Uint8Array`, never a parsed provider object. They reject empty or greater-than
256 KiB inputs, invoke the injected hash port on those exact bytes, require lowercase SHA-256, then
perform fatal UTF-8 decoding and JSON parsing. Invalid JSON still proves the hash port observed the
original bytes; no partial result is returned.

Source references are bounded opaque identifiers. URLs, query strings, fragments, paths, control
characters, and credential-shaped references are rejected.

### M1 — Mapping conservation precedes value access

Configuration contains exactly one title field, an ordered non-empty paragraph-field list, and a
non-empty unsupported-field list. Every provider `fields` key belongs to exactly one category.
Duplicate ownership, absent required fields, unaccounted fields, extra mapping keys, or invalid
field names fail closed before unsupported values are accessed.

The shared criterion extractor promotes only literal AC-shaped paragraphs; it assigns ordered
`AC-<n>` identifiers and copies the paragraph text as both criterion text and source quote. If no
acceptance criterion exists, the adapter returns no result.

### J1 — Jira parser supports one closed ADF subset

The Jira adapter accepts exact top-level `id`, `key`, and `fields`. Mapped paragraph fields must be
ADF documents with `type=doc`, `version=1`, paragraph nodes, and plain text nodes only. Node keys,
ordering, node count, paragraph count, and text budget are bounded. Marks, nested blocks, media,
tables, unknown nodes, malformed/truncated documents, empty paragraphs, and extra node keys fail
closed.

### A1 — Azure DevOps parser supports one closed HTML subset

The Azure DevOps adapter accepts exact top-level `id`, `rev`, `fields`, and `url`. The payload URL
must share the configured origin and cannot override it. Paragraph fields accept only ordered,
non-nested `<p>...</p>` blocks with text and the fixed entities `amp`, `lt`, `gt`, `quot`, `apos`,
`#39`, and `#x27`. Attributes, comments, scripts, unknown/nested tags, text outside paragraphs,
unknown entities, malformed/truncated HTML, empty paragraphs, and budget overflow fail closed.

### E1 — Typed closed failures reveal no source data

`SpecAdapterError` exposes only fixed adapter ID and closed reason code. Its message is derived only
from those labels. It never includes raw payloads, normalized text, unsupported values, URLs, paths,
credentials, or provider responses. Hash-port, schema, parser, and semantic-validation failures are
collapsed to the corresponding stable code.

### R1 — Durable evidence is metadata only

Tests may read the approved synthetic fixtures. Durable evidence records only code/test identities,
adapter/provider IDs, counts, hashes, timing, and closed attack names. It never records raw payload
or normalized requirement text. Unsupported values are seeded with a sentinel and proven absent
from results, errors, logs, and evidence.

### T1 — TypeScript remains measured, not assumed

A2A adds no language runtime. The exact bounded fixture loop is measured after implementation and
reported as an observation alongside Node version and iteration count. A threshold breach blocks
evidence acceptance and opens a new ADR; it does not silently introduce a native component.

### N1 — A2A local runtime only

This slice does not:

- fetch Jira, Azure DevOps, or Confluence;
- read environment variables, credential stores, or local specification files;
- migrate `SpecIR`, Confluence B0 staging, or local-file ingestion;
- expose a CLI, provider skill/agent/plugin capability, or generated bundle;
- change P17-004 status to `done` or make P17-019 ready;
- bump v3.25, sync targets, change dashboard state, push, merge, tag, release, publish, or change
  repository visibility.

## Acceptance and attacks

1. The plan validator is registered before runtime and fails on the first missing core source.
2. Discovery returns the two registered descriptors in exact sorted frozen form and rejects
   duplicates, extra keys, unknown versions, and invalid configuration declarations.
3. Jira and Azure fixtures produce exact A1 expected titles, paragraphs, criteria, and unsupported
   field names.
4. Both results normalize through unchanged P17-003 to identical semantic hashes and different
   provenance hashes.
5. Byte hash, fatal UTF-8, JSON, payload shape, source reference, input-size, field-count,
   paragraph-count, node-count, and text-size boundaries fail closed.
6. Mapping attacks cover missing, duplicated, unaccounted, unknown, and extra-key ownership.
7. Jira attacks cover unknown/extra/malformed/truncated ADF nodes.
8. Azure attacks cover base-URL scheme/userinfo/query/fragment/path confusion, payload-origin
   mismatch, attributes, nesting, scripts, unknown entities, and truncated HTML.
9. A seeded unsupported value cannot appear in serialized result, error text, or captured output.
10. JSON Schema, TypeScript runtime validator, public manifest, roadmap, provider distribution,
    clean-source gates, and the full native suite remain GREEN.

## Implementation sequence

1. Add this plan and register `post-17-spec-adapter-runtime-plan.test.ts`; retain the exact
   missing-`spec-adapter.ts` RED.
2. Add the provider-neutral contract/discovery and JSON Schema; make contract tests GREEN.
3. Add the injected Node hash adapter and Jira parser; preserve provider-suite RED for Azure.
4. Add the Azure parser and make fixture parity plus attack tests GREEN.
5. Update core documentation, roadmap checkpoint, public manifest, package routes, and exact source
   manifest assertions.
6. Run focused, related, public-source, provider-distribution, and full-suite qualification.
7. Review for boundary leakage, secret/source echo, unbounded parsing, mutation, and provider rule
   duplication; repair before source commit.
8. Record metadata-only evidence separately. Remote work requires exact-head authorization and CI.

## Exact source manifest

The A2A source checkpoint may change exactly these thirteen paths:

- `docs/roadmap/p17-004-a2a-provider-local-adapter-runtime-plan.md`;
- `docs/roadmap/post-17-roadmap.md`;
- `docs/schemas/spec-adapter-result.schema.json`;
- `package.json`;
- `packages/core/README.md`;
- `packages/core/src/spec-adapter-azure-devops.ts`;
- `packages/core/src/spec-adapter-jira.ts`;
- `packages/core/src/spec-adapter-node.ts`;
- `packages/core/src/spec-adapter.ts`;
- `packages/core/test/spec-adapter-providers.test.ts`;
- `packages/core/test/spec-adapter.test.ts`;
- `release/public-release-manifest.json`; and
- `scripts/post-17-spec-adapter-runtime-plan.test.ts`.

The evidence checkpoint adds only
`docs/evidence/post-17-spec-adapter-runtime-2026-08-21.md` and its ordered public-manifest entry.

## Rollback and non-claims

Any partial source failure restores the verified 2026-08-21 backup before retrying. Parser failure
returns no adapter result; evidence or manifest failure blocks commit. A2A does not claim live
provider compatibility, Confluence/local-file parity, provider packaging, P17-004 completion,
credential lifecycle, release eligibility, or publication.
