# P17-004 A2E Conditional Live-Proof Boundary Input Lock

**Status:** Approved input lock; implementation must start from the registered missing-source RED.
**Parent:** A2D evidence `5a7dbeff332ef7323c382874b51b9983037305d1`.
**Decision tuple:** `boundary=B1, input=I1, readiness=R1, provenance=P1, execution=X1, receipt=E1, integrity=H1, failure=F1, privacy=V1, testing=T1, language=L1, scope=N1`.

## Outcome

A2E adds the smallest honest boundary between the qualified offline adapter stack and conditional
provider compatibility evidence. A pure contract assesses closed input readiness and validates
metadata-only receipts. A separate Node runner accepts one exact A2C item input and one already-
created A2D bearer descriptor, constructs the A2D transport internally with its production/default
dependencies, performs at most one A2C execution, and emits one content-addressed outcome.

The current workspace has neither named live item coordinates nor in-process bearer capabilities.
Its only honest A2E outcome is therefore `needs_input`. This input lock and synthetic tests do not
contact Jira or Azure DevOps and do not prove live compatibility.

## Current authoritative inputs

- Node 20 provides the production `fetch` and SHA-256 primitives used by the existing qualified Node
  boundaries: <https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch> and
  <https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptocreatehashalgorithm-options>.
- Jira Cloud OAuth 2.0 3LO REST calls use the exact API gateway resource path and bearer scopes
  already locked by A2D: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/> and
  <https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/>.
- Azure DevOps recommends Microsoft Entra OAuth, and the single-work-item API remains read-only API
  version 7.1: <https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops> and
  <https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1>.

These references define protocol shape only. They grant no tenant, item, credential, consent, or
network authority and cannot substitute for a real execution receipt.

## Architecture decision record

### B1 — Pure contract and Node execution stay separate

`spec-adapter-live-proof.ts` owns the exact readiness and receipt schemas, canonical integrity
payload, validation, deep freezing, stable reason codes, and metadata allowlist. It performs no
network, clock, environment, file, process, credential, or provider operation.

`spec-adapter-live-proof-node.ts` is the only live execution authority. It may use the pure contract,
A2C fetch service, A2D bearer descriptor and transport, and the Node SHA-256 port. It may not accept a
fetch implementation, A2C port, timer, transport factory, hash override, or dependency bag from its
caller.

### I1 — One exact item input plus an existing bearer capability

One invocation targets exactly one `jira` issue or one `azure-devops` work item using the existing
A2C exact input shapes. The second input is an already-created, destination-bound, single-use A2D
`SpecAdapterBearerCredential`. A2E never accepts token bytes, token text, an authorization header,
credential location, environment name, file path, refresh state, account identity, or consent data.

Missing item input or capability is `needs_input` before I/O. Present but malformed, mismatched, or
forged input is a closed `failed` outcome, not `needs_input` and never a thrown low-level diagnostic.

### R1 — Readiness is explicit and cannot imply execution

The pure readiness assessment returns exactly `ready` or `needs_input`. Its input contains only a
safe provider label and two presence booleans; it never inspects coordinates or credentials. A
`ready` result means only that the caller reports both required inputs present. It is not durable
compatibility evidence and does not authorize or imply a provider call.

The Node runner independently validates real inputs. It never converts `needs_input` into `passed`,
and it performs zero I/O when either required input is absent.

### P1 — Live provenance requires the default Node transport

The public A2C capability shape is intentionally injectable and can be implemented by a fake port;
therefore an arbitrary A2C capability can never establish live provenance. The A2E Node runner must
call `createNodeSpecAdapterFetchCapability` with exactly its configuration and bearer descriptor,
omitting the optional dependency argument so the A2D production/default Node dependencies are used.

Unit tests may temporarily replace the process-global `fetch` only to exercise the offline success
contract. Such a receipt is labelled and reported as synthetic test evidence. A durable live
`passed` claim additionally requires a fresh standalone execution on the exact source commit,
unmodified default Node globals, named non-secret item coordinates, a real in-process bearer
capability, and captured metadata-only output.

### X1 — At most one read-only execution

After readiness and input validation, the Node runner constructs one A2D capability and calls the
A2C `fetchSpecAdapterResult` service exactly once. The existing GET-only, redirect-refusing,
12-second, 256 KiB, exact-destination, and single-use credential controls remain authoritative.

There is no retry, fallback, redirect follow, search, discovery, pagination, attachment, comment,
history, cache, telemetry, mutation, or second provider call. Jira and Azure proofs are separate
invocations and separate receipts.

### E1 — Durable outcomes are closed metadata only

The Node runner returns exactly one frozen receipt with status `needs_input`, `passed`, or `failed`.
All receipts contain the schema version, provider label, execution mode, observed UTC time, closed
reason codes, and integrity SHA-256. A passed receipt may additionally contain adapter/result schema
IDs, response source SHA-256, paragraph count, acceptance-criterion count, and unsupported-field
count. A failed receipt contains one closed reason code only.

No receipt contains a base URL, cloud ID, organization, project, issue/work-item coordinate,
`sourceRef`, title, paragraph, acceptance text, unsupported field name, response bytes, header,
token, token hash, account, scope, consent, low-level error, or stack.

### H1 — Canonical integrity covers every admitted field

Receipt integrity is lowercase SHA-256 over an explicit UTF-8 canonical JSON payload that excludes
only the integrity field itself. Exact key order, exact arrays, exact count bounds, RFC 3339 UTC
timestamp form, and lowercase 64-hex hashes are validated before freezing. Unknown, missing,
accessor-backed, inherited, proxied, oversized, duplicate, reordered, or contradictory fields fail
closed.

### F1 — Failures never expose provider diagnostics

Missing inputs return closed `needs_input` reason codes without constructing transport. Present
invalid inputs, forged/mismatched capabilities, A2C/A2D refusal, network failure, HTTP refusal,
timeout, response failure, parser failure, clock failure, or integrity failure collapse into closed
A2E reason codes. The runner never returns or logs a caught message, URL, identifier, body, provider
payload, header, token, exception name, or stack.

### V1 — Input and evidence privacy are deny-by-default

No A2E source reads `process.env`, `.env`, stdin, argv, config files, secret stores, credential
helpers, browser state, or provider SDK state. The source has no console call or durable sink. Item
coordinates and provider content live only in caller memory and the already bounded A2C/A2D path.

Evidence may record source/commit/tree identities, closed statuses/reasons, safe provider labels,
counts, hashes, timestamps, test names, durations, and public manifest counts only. Input presence
audits inspect environment variable names, never values.

### T1 — Synthetic qualification and conditional live proof are distinct

Tests first register a missing-runtime RED, then cover readiness, exact receipt validation,
integrity, immutability, absent-input zero-I/O, forged descriptor refusal, default-transport source
inspection, one-call semantics, synthetic success, failure collapse, accessor/proxy attacks, and
privacy negative scans. Existing A2A–A2D, strict TypeScript, synced-core, roadmap, public-source,
provider non-widening, and complete native gates remain parent regressions.

Synthetic tests prove the contract only. The current `needs_input` receipt is valid evidence of
readiness state, not provider compatibility. P17-004 can complete only after separate real Jira and
Azure DevOps `passed` receipts qualify on an exact commit and the later provider-package gate passes.

### L1 — TypeScript and Node remain authoritative

The existing reconsideration threshold remains unchanged: measured p95 above 50 ms for the bounded
contract, incremental RSS above 64 MiB, or a missing safe capability opens a new ADR. A2E adds no
language runtime, native extension, subprocess, sidecar, SDK, or dependency.

### N1 — Live-proof boundary only

A2E does not acquire or refresh credentials, read token material, expose a CLI/MCP connector, add a
provider runtime or permission, edit provider bundles, modify dashboard or target repositories,
sync, push, create a PR, merge, bump a version, tag, release, publish, or change visibility. It does
not mark P17-004 done or P17-019 ready without both qualified live receipts and later packaging.

## Exact source manifest

The A2E source checkpoint may change exactly these twelve paths:

1. `.claude/integrations/core/spec-adapter-live-proof-node.ts`
2. `.claude/integrations/core/spec-adapter-live-proof.ts`
3. `docs/roadmap/p17-004-a2e-live-proof-boundary-plan.md`
4. `docs/roadmap/post-17-roadmap.md`
5. `package.json`
6. `packages/core/README.md`
7. `packages/core/src/spec-adapter-live-proof-node.ts`
8. `packages/core/src/spec-adapter-live-proof.ts`
9. `packages/core/test/spec-adapter-live-proof.test.ts`
10. `release/public-release-manifest.json`
11. `scripts/build-synced-core.ts`
12. `scripts/post-17-spec-adapter-live-proof-boundary-plan.test.ts`

The later evidence checkpoint adds only
`docs/evidence/post-17-spec-adapter-live-proof-boundary-2026-08-21.md` and its ordered public-manifest
row.

## Implementation sequence

1. Register this plan and validator; preserve the absent pure/Node runtime RED.
2. Add and attack-test the pure readiness, receipt, canonical-integrity, and validation contract.
3. Add the no-injection Node runner, absent-input zero-I/O path, closed failures, and synthetic
   default-global-fetch success test without claiming live compatibility.
4. Generate byte-identical core mirrors and update core/roadmap/public manifests.
5. Emit and validate the current metadata-only `needs_input` receipts for Jira and Azure DevOps.
6. Run focused tests, strict TypeScript, A2A–A2D parents, synced-core, roadmap, public/provider gates,
   adversarial review, and one complete native suite.
7. Commit the exact source inventory, then author and fully requalify metadata-only evidence as a
   separate commit.

## Rollback and next gates

Any partial source failure restores the verified 2026-08-21 backup before retrying. Current live
readiness remains `needs_input`; it is not an implementation failure and cannot be promoted by a
synthetic receipt. When exact non-secret Jira and Azure inputs plus real in-process bearer
capabilities exist, run each proof separately and capture only the admitted metadata.

Only after both live receipts qualify may the next provider-package gate decide which Codex, Claude
Code, and GitHub Copilot surfaces expose the capability and independently qualify permissions,
manifests, README instructions, archives, SBOMs, clean-clone behavior, PRs, and merges.

A2E does not claim that a provider was contacted, a credential works, live compatibility is proven,
optional connectors are packaged, P17-004 is complete, or P17-019 is ready.
