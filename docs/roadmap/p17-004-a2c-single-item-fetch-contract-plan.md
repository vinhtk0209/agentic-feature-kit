# P17-004 A2C: Single-Item Fetch Contract and Wire Envelope

**Status:** Approved local implementation plan under standing Post-17 authority
**Date:** 2026-08-21
**Roadmap task:** P17-004
**Parent checkpoint:** qualified A2B evidence `8b33f094721143bc928b8a80e2c2e415d00a94db`
**Decision lock:** `boundary=B1, request=Q1, bytes=Y1, jira=J1, azure=Z1, auth=C1, failure=E1, privacy=P1, testing=T1, language=L1, scope=N1`

## Outcome

A2C adds one provider-neutral application contract for fetching exactly one Jira Cloud issue or one
Azure DevOps Services work item through an injected transport capability. The contract constructs a
deterministic credential-free GET request, accepts one bounded exact-byte JSON response, and passes
those unchanged bytes to the already-qualified A2A provider parser.

A2C also hardens the two parsers for the bounded wire metadata present in official responses. Jira
may include `self` and `expand`; Azure DevOps may include `_links`. Those names are admitted without
reading or copying their values. Unknown top-level fields still fail closed. This preserves exact
provider-response byte identity instead of projecting and reserializing a reduced object.

This slice does not implement a Node HTTP client, read environment variables, acquire or refresh a
credential, contact a provider, expose a CLI or MCP tool, or add provider packages. Those operations
remain separately gated after the pure fetch contract and its negative controls are qualified.

## Reconciled inputs

- A2A provides `SpecAdapterResult` 1.1.0, exact-byte hashing, closed field mappings, and Jira ADF /
  Azure DevOps HTML parsers.
- A2B composes Confluence and local file inputs through canonical SpecIR without live provider I/O.
- Jira Cloud REST v3 documents `GET /rest/api/3/issue/{issueIdOrKey}`, an optional `fields` query,
  and read authorization. Its response model includes provider metadata outside `id`, `key`, and
  `fields`: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/>.
- Azure DevOps REST 7.1 documents
  `GET https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/{id}`, optional `fields`,
  mandatory `api-version=7.1`, and `vso.work` read scope:
  <https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1>.
- Official authentication guidance recommends OAuth for application integrations. Jira API-token
  Basic auth is limited to simple/manual clients; Azure DevOps recommends Microsoft Entra ID for new
  applications and PATs only when a stronger method is unavailable. A2C therefore keeps credential
  material entirely inside the injected transport capability and does not choose a refresh scheme.

## Architecture decision record

### Context

The local A1 fixtures intentionally contain only parser-owned fields. Live provider responses often
add top-level navigation or expansion metadata. Connecting the existing exact-shape parsers directly
to HTTP would either reject a legitimate response or require a lossy projection whose hash no longer
identifies the bytes returned by the provider. The shared core must also stay portable across Codex,
Claude, and Copilot and must not acquire secret, environment, filesystem, or provider-SDK coupling.

### Decision

Adopt a pure TypeScript application service with an injected, destination-bound fetch capability.
The application service validates a closed provider request, builds one deterministic URL, invokes
the capability exactly once, verifies the bounded response envelope, and sends the exact returned
bytes to the existing adapter. The capability owns authorization and transport mechanics; neither
authorization headers nor tokens enter the request object, result, error, log, or evidence.

### Options considered

| Option | Complexity | Provenance | Secret boundary | Decision |
|---|---:|---|---|---|
| Injected destination-bound fetch capability | Medium | Exact provider bytes | Credential stays in port | Adopt |
| Fetch inside Jira/Azure parser | Low initially | Exact | Mixes auth/network with parsing | Reject |
| Reuse the Confluence MCP server | High coupling | Source-specific | Mixed HTTP/file/image surface | Reject |
| Project and reserialize provider JSON | Low | Hash identifies derived bytes | Neutral | Reject |
| Add Rust/Go/Python sidecar | High | Exact | Extra process/supply chain | Defer |

The rejected projection option would make the current minimal fixtures easy to reuse, but it would
contradict A1/A2A exact-byte provenance. A native sidecar has no measured capability or performance
benefit for one bounded JSON response and would expand distribution and trust surfaces.

### Consequences

- A future Node connector can implement the port without changing shared parsing semantics.
- Provider auth can evolve independently, including OAuth, without adding token fields to core.
- Only single-item reads are representable; search, pagination, attachments, comments, history,
  bulk reads, writes, and tenant crawling have no contract surface.
- Jira Data Center, Azure DevOps Server, redirects, proxy/browser fallbacks, and credential refresh
  require separate decisions and cannot be inferred from this cloud/services contract.

## Locked contracts

### B1 — Application boundary stays provider-neutral

`packages/core/src/spec-adapter-fetch.ts` is a pure application service. It may import the shared
adapter types and the two provider parsers, but not Node APIs, provider SDKs, MCP, filesystem,
environment, subprocess, sockets, or global `fetch`. Its generated target-facing mirror is
byte-identical.

The public request is a closed discriminated union for `jira` and `azure-devops`; the result remains
the unchanged `SpecAdapterResult` 1.1.0. No second semantic or result schema is introduced.

### Q1 — One deterministic credential-free GET request

Jira input contains only provider ID, HTTPS base origin, issue ID/key, opaque source reference, and
the existing field mapping. Azure DevOps input contains only provider ID, HTTPS base origin,
organization, project, integer work-item ID, opaque source reference, and the same mapping.

The service derives the requested field list from the complete mapping ownership set, sorts it by
JavaScript ordinal order, and emits one GET request with `Accept: application/json`, no request body,
a fixed response-byte ceiling, a fixed timeout declaration, and redirect policy `error`.

Jira uses `/rest/api/3/issue/<encoded-id-or-key>?fields=<encoded-sorted-fields>`. Azure DevOps uses
`/<encoded-organization>/<encoded-project>/_apis/wit/workitems/<id>?fields=<encoded-sorted-fields>&api-version=7.1`.
Path segments are encoded exactly once. Empty, overlong, control-bearing, slash-bearing, dot-segment,
query-bearing, fragment-bearing, or ambiguous identifiers fail before the port is invoked.

### Y1 — Exact response bytes cross into A2A

The port response is a closed object containing status, content type, final URL, and `Uint8Array`
body. Only status 200, JSON content type, byte-identical final URL, and body length 1..256 KiB are
accepted. Redirects, cross-origin responses, malformed URLs, non-JSON content, empty/oversized body,
and aliased or mutable envelope data fail before parsing.

The service copies response bytes once for ownership, then calls the selected A2A parser with those
exact bytes and the approved opaque source reference. It never parses, projects, stringifies, logs,
or persists the provider response itself.

### J1 — Jira wire metadata is bounded

A Jira response still requires exact `id`, `key`, and `fields`. It may additionally contain only
`self` and `expand`. Their values are not traversed, copied, logged, or exposed. Missing required
keys, any other top-level key, cross-provider shape, or malformed mapped fields fail closed.

### Z1 — Azure DevOps wire metadata is bounded

An Azure DevOps response still requires exact `id`, `rev`, `fields`, and `url`. It may additionally
contain only `_links`. Its value is not traversed, copied, logged, or exposed. The payload `url` must
retain the configured origin. Missing required keys, any other top-level key, or malformed mapped
fields fail closed.

### C1 — Credential and destination authority stays in the port

The injected capability publishes only provider ID and exact bound base origin plus its `execute`
method. Request base origin and provider must match that descriptor before execution. Credential
bytes, auth scheme, account identity, refresh state, scopes, cookies, proxy configuration, and TLS
material are never arguments to the application service.

A2C tests use an inert fake capability. A production port must later obtain a separately qualified
credential, disable redirects, enforce TLS, apply its own timeout/abort and response limit, and emit
no raw provider error. That future port is not fabricated in this slice.

### E1 — Closed failures and one-call semantics

`SpecAdapterFetchError` exposes only a fixed provider ID and closed reason code. The service never
includes a URL, identifier, provider body, field value, credential, header, or low-level exception
message. It invokes the port at most once and performs no retry, fallback, discovery, pagination, or
secondary request.

Port throws, malformed capabilities, malformed responses, wrong status/content type/final URL,
size failures, and downstream adapter failures return no partial result. Downstream
`SpecAdapterError` remains unchanged and source-safe.

### P1 — Evidence is metadata only

Durable evidence may record provider IDs, closed test/attack names, source and result hashes, field
and paragraph counts, durations, commit/tree identities, and public-authority counts. It must not
record provider response bytes, normalized requirement text, item URLs/keys, organization/project,
credential configuration, headers, or low-level errors.

### T1 — Testing pyramid and acceptance

Unit tests cover exact request construction, closed unions/descriptors, encoding, field ordering,
response validation, byte ownership, one-call behavior, and stable errors. Integration-contract
tests feed official-shape synthetic Jira/Azure responses through fake capabilities and the real A2A
parsers. Negative controls cover provider/destination mismatch, URL and identifier confusion,
redirects, status/content/size failures, mutation/aliasing, extra wire metadata, source leakage, and
port exceptions.

No live E2E test belongs in A2C. A later conditional golden must require explicitly named provider
configuration and credentials, make one read-only request, persist metadata-only evidence, and skip
or fail closed without claiming compatibility when those inputs are absent.

### L1 — TypeScript remains authoritative

The existing TypeScript reconsideration threshold remains unchanged: a measured p95 above 50 ms for
the bounded 256 KiB contract, incremental RSS above 64 MiB, or a missing safe capability opens a new
ADR. A2C performs bounded orchestration and has no reason to add another language runtime.

### N1 — Narrow local scope

A2C does not implement or perform Node/network/provider I/O, credential acquisition/refresh, OAuth,
PAT/API-token parsing, Confluence changes, Jira Data Center, Azure DevOps Server, search, crawl,
pagination, attachments, comments, history, writes, retries, CLI/MCP/plugin/package exposure,
dashboard/target changes, sync, version bump, push, PR, merge, tag, release, publication, or
visibility change. It does not mark P17-004 done or P17-019 ready.

## Exact source manifest

The A2C source checkpoint may change exactly these thirteen paths:

1. `.claude/integrations/core/spec-adapter-fetch.ts`
2. `docs/roadmap/p17-004-a2c-single-item-fetch-contract-plan.md`
3. `docs/roadmap/post-17-roadmap.md`
4. `package.json`
5. `packages/core/README.md`
6. `packages/core/src/spec-adapter-azure-devops.ts`
7. `packages/core/src/spec-adapter-fetch.ts`
8. `packages/core/src/spec-adapter-jira.ts`
9. `packages/core/test/spec-adapter-fetch.test.ts`
10. `packages/core/test/spec-adapter-providers.test.ts`
11. `release/public-release-manifest.json`
12. `scripts/build-synced-core.ts`
13. `scripts/post-17-spec-adapter-live-fetch-contract-plan.test.ts`

The later evidence checkpoint adds only
`docs/evidence/post-17-spec-adapter-live-fetch-contract-2026-08-21.md` and its ordered public-manifest
entry.

## Implementation sequence

1. Add this plan and register its validator in the native suite; retain the exact missing
   `packages/core/src/spec-adapter-fetch.ts` RED.
2. Add request/capability/response/error contracts and unit tests before orchestration.
3. Preserve REDs for Jira and Azure official-shape wire metadata, then admit only the locked names.
4. Implement exact-byte single-call composition with the existing A2A adapters.
5. Generate the byte-identical core mirror and update core documentation/roadmap/public manifest.
6. Run focused tests, strict TypeScript, synced-core, parent A2A/A2B, roadmap, public/provider gates,
   review attacks, and the complete native suite.
7. Commit the exact source inventory, then author and requalify metadata-only evidence separately.

## Rollback and non-claims

Any partial source failure restores the verified 2026-08-21 backup before retrying. A malformed or
uncertain fetch returns no adapter result; source/evidence inventory drift blocks commit. A2C does
not claim that a provider was contacted, credentials work, live Jira/Azure compatibility is proven,
optional connectors are packaged, P17-004 is complete, P17-019 is ready, or any remote/publication
operation is authorized.
