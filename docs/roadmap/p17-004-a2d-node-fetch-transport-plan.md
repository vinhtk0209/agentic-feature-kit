# P17-004 A2D Node Fetch Transport Input Lock

**Status:** Approved input lock; implementation must start from the registered missing-source RED.
**Parent:** A2C evidence `ad9be743363b8c8478f804bc69746b180ce52772`.
**Decision tuple:** `destination=D1, auth=A1, credential=C1, transport=T1, timeout=O1, bytes=B1, failure=E1, privacy=P1, testing=V1, language=L1, scope=N1`.

## Outcome

A2D adds the smallest production Node boundary that can execute the A2C single-item request without
turning the shared application contract into ambient network or credential authority. It also
corrects the A2C Jira destination model so the recommended OAuth 2.0 3LO gateway path is preserved
and credential binding covers the exact cloud resource, not only `api.atlassian.com`.

A2D remains local and provider-inert. Tests use an injected fake `fetch` implementation and
synthetic access-token bytes. No real credential is read and no Jira or Azure DevOps endpoint is
contacted.

## Current official inputs

- Node 20 exposes standards-compatible `fetch` and `AbortSignal`; the port still owns explicit
  redirect refusal, deadline enforcement, bounded streaming, and safe error collapse:
  <https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch> and
  <https://nodejs.org/docs/latest-v20.x/api/globals.html#static-method-abortsignaltimeoutdelay>.
- Jira Cloud recommends OAuth 2.0 authorization-code grants for external integrations and routes
  3LO REST calls through `https://api.atlassian.com/ex/jira/<cloudId>/...`:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/> and
  <https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/>.
- Jira single-issue GET recommends classic read scope `read:jira-work`:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/>.
- Azure DevOps recommends Microsoft Entra OAuth for new applications, uses Azure DevOps resource ID
  `499b84ac-1321-427f-aa17-267ca6975798`, and sends the resulting token as a bearer credential:
  <https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops>.
- Azure DevOps single-work-item GET uses API version `7.1` and read scope `vso.work`:
  <https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1>.

These sources define protocol shape only. They do not authorize a provider call or prove any tenant,
site, organization, project, issue, token, consent, or permission.

## Architecture decision record

### D1 — Bind the exact destination base URL

Replace A2C's origin-only capability binding with `destinationBaseUrl`. Jira OAuth input must be
exactly `https://api.atlassian.com/ex/jira/<cloudId>` where `<cloudId>` is a canonical lowercase UUID.
The request appends `/rest/api/3/issue/<issueIdOrKey>` without discarding that prefix. Azure DevOps
Services remains exactly `https://dev.azure.com`, and the request appends its organization/project
work-item path.

The application request remains credential-free. URL username, password, query, fragment, trailing
slash ambiguity, encoded slash/backslash, dot segment, non-HTTPS, non-default port, unsupported host,
and destination descriptor mismatch fail before transport execution. Tests use official-form URL
strings behind fake fetch; `.invalid` destinations are rejected rather than granted a test-only
production bypass.

### A1 — Bearer-only recommended authentication

Jira supports only OAuth 2.0 3LO bearer access in this slice. Azure DevOps supports only Microsoft
Entra bearer access. Jira Basic/API-token, Azure PAT, OAuth acquisition, consent UI, token exchange,
refresh, managed-identity lookup, CLI login, cookies, proxies, client certificates, and provider SDKs
are outside A2D. They require separate decisions and evidence.

### C1 — Single-use owned credential capability

`createSpecAdapterBearerCredential` accepts an exact plain record containing provider ID, exact
destination base URL, and a dedicated full-view `Uint8Array` of bounded visible-ASCII token bytes.
Creation copies the token into private module state and zeroizes the transferred caller view. The
public frozen descriptor exposes no token, header, method, byte count, account, scope, or expiry.

Exactly one bound transport execution may consume the credential. Consumption is recorded before
I/O and the private bytes are zeroized in `finally`, including timeout, abort, stream, and fetch
failure. Reuse and cross-provider/destination binding fail before I/O. Node necessarily materializes
one ephemeral header string for `fetch`; it is never returned, logged, placed in an error, retained in
the public capability, or written to durable evidence.

### T1 — Narrow Node fetch capability

`createNodeSpecAdapterFetchCapability` returns the exact A2C port shape. It accepts only the frozen
A2C GET contract for the bound provider and destination and independently validates the provider
endpoint path and exact query-key set before consuming a credential. It invokes the injected fetch
implementation at most once with `Accept: application/json`, `Authorization: Bearer <token>`,
`redirect: 'error'`, and an abort signal.

No retry, redirect follow, discovery, accessible-resources lookup, pagination, fallback, write,
cache, telemetry, console output, response JSON parsing, or provider-specific business mapping occurs
inside the transport.

### O1 — Deadline owns the entire operation

The port starts one `AbortController` immediately before fetch, arms the exact A2C 12-second limit,
and clears the timer in `finally`. Timeout aborts the request and any active stream. A late fetch or
stream resolution after abort is refused; the port never treats a response racing the deadline as
success.

### B1 — Declared and cumulative byte caps

A numeric non-negative `Content-Length` greater than the request maximum fails before streaming.
Missing or malformed `Content-Length` does not grant trust. The response body is read through its
reader with a cumulative cap; overflow cancels the reader and returns no bytes. A null body, zero
bytes, malformed chunk, detached/proxied typed array, or byte-count overflow fails closed.

On success the port returns an exact plain response record with integer status, bounded content type,
exact final URL, and one newly owned `Uint8Array`. A2C remains authoritative for 200/JSON/exact-URL
admission and parsing.

### E1 — Closed failures and no secret-bearing diagnostics

Direct Node-boundary failures use `SpecAdapterFetchNodeError` with only the safe provider ID and a
closed reason code. A2C collapses all port failures to its existing `PORT_FAILURE`. No URL, path,
identifier, body, header, token, response text, low-level exception name/message, timeout object, or
fetch implementation detail may enter an error or receipt.

### P1 — Durable evidence is metadata only

Evidence may include closed behavior/attack names, counts, durations, source/result hashes,
commit/tree identities, manifest counts, and platform receipts. It must not include destination URLs,
cloud IDs, organizations, projects, issue IDs/keys, response bytes/text, authorization state, headers,
tokens, token hashes, account identity, scopes, or low-level errors.

### V1 — Adversarial testing before live proof

Unit tests use only fake fetch responses and synthetic token bytes. They cover the corrected Jira
gateway path, Azure request preservation, exact header/request options, single use, transfer
zeroization, private zeroization on every exit, redirect/final-URL drift, deadline races, declared and
cumulative overflow, null/empty/malformed streams, malformed records/accessors/proxies, cross-binding,
endpoint/query confusion, response ownership, no raw leakage, and at-most-once semantics.

The existing A2A/A2B/A2C tests remain parent regressions. Strict TypeScript, byte-identical generated
core, roadmap, public-source, provider-bundle non-widening, and the complete native suite must pass.
No live E2E belongs in A2D.

### L1 — TypeScript/Node remains authoritative

The existing reconsideration threshold remains unchanged: measured p95 above 50 ms for the bounded
256 KiB path, incremental RSS above 64 MiB, or a missing safe capability opens a new ADR. A2D adds no
language runtime, native extension, subprocess, sidecar, SDK, or dependency.

### N1 — Core transport only

A2D does not perform credential acquisition/refresh, provider discovery, a provider call, live proof,
CLI/MCP wiring, plugin/skill/agent exposure, provider-bundle runtime addition, permission declaration,
dashboard/target mutation, sync, version bump, push, PR, merge, tag, release, publication, or
visibility change. It does not mark P17-004 done or P17-019 ready.

## Exact source manifest

The A2D source checkpoint may change exactly these thirteen paths:

1. `.claude/integrations/core/spec-adapter-fetch-node.ts`
2. `.claude/integrations/core/spec-adapter-fetch.ts`
3. `docs/roadmap/p17-004-a2d-node-fetch-transport-plan.md`
4. `docs/roadmap/post-17-roadmap.md`
5. `package.json`
6. `packages/core/README.md`
7. `packages/core/src/spec-adapter-fetch-node.ts`
8. `packages/core/src/spec-adapter-fetch.ts`
9. `packages/core/test/spec-adapter-fetch-node.test.ts`
10. `packages/core/test/spec-adapter-fetch.test.ts`
11. `release/public-release-manifest.json`
12. `scripts/build-synced-core.ts`
13. `scripts/post-17-spec-adapter-node-fetch-transport-plan.test.ts`

The later evidence checkpoint adds only
`docs/evidence/post-17-spec-adapter-node-fetch-transport-2026-08-21.md` and its ordered
public-manifest row.

## Implementation sequence

1. Register this plan and validator; preserve the missing `spec-adapter-fetch-node.ts` RED.
2. Correct A2C exact destination-base binding and Jira 3LO gateway request construction with parent
   regression tests.
3. Add the single-use bearer credential descriptor and its transfer/zeroization attacks.
4. Add the bounded Node fetch port behind injected fake fetch and cover timeout/stream/redirect races.
5. Generate the byte-identical core mirrors and update core/roadmap/public manifests.
6. Run focused tests, strict TypeScript, synced-core, A2A/A2B/A2C, roadmap, public/provider gates,
   adversarial review, and one complete native suite.
7. Commit the exact source inventory, then author and requalify metadata-only evidence separately.

## Rollback and next gates

Any partial source failure restores the verified 2026-08-21 backup before retrying. The next gate is
a conditional metadata-only live proof that requires explicit named non-secret configuration and an
already-qualified access-token capability; absent inputs cannot be reported as compatibility. Only
after that proof may a provider-package gate decide which Codex, Claude, and Copilot surfaces receive
the runtime and independently qualify permissions, manifests, README instructions, archives, SBOMs,
and clean-clone behavior.

A2D does not claim that a provider was contacted, credentials work, Jira or Azure live compatibility
is proven, optional connectors are packaged, P17-004 is complete, or P17-019 is ready.
