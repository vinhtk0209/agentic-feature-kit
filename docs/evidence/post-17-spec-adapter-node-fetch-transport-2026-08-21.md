# P17-004 A2D Node Fetch Transport Evidence

**Task:** P17-004
**Slice:** A2D
**Date:** 2026-08-21
**Status:** Qualified source and draft evidence; final-byte qualification pending
**Source commit:** `d867c475daeea096f4485ee776e4302bd6ac0e7a`
**Source parent:** `ad9be743363b8c8478f804bc69746b180ce52772`
**Source tree:** `71d75ef23e1abe00d6bcf416c5ad88df83ea5fc9`

## Result

A2D adds the smallest production Node transport for the A2C single-item Jira Cloud and Azure
DevOps Services request contract. The shared application request remains credential-free; a
separate single-use bearer capability owns authorization and the Node boundary owns bounded I/O.

- Jira OAuth 2.0 3LO requests retain the exact
  `https://api.atlassian.com/ex/jira/<cloudId>` destination prefix.
- Azure DevOps requests remain bound to exact `https://dev.azure.com` and API version `7.1`.
- The caller transfers a dedicated visible-ASCII token byte view. Creation copies it into private
  state and zeroizes the transferred view; terminal execution zeroizes the private copy.
- One frozen transport capability accepts one exact request, consumes one matching credential
  before I/O, performs at most one injected `fetch`, and cannot be reused.
- Redirects are refused, one 12-second deadline owns fetch plus body streaming, and both declared
  and cumulative 256 KiB response limits fail closed.
- Successful response bytes are newly owned. Node failures expose only a provider ID and a closed
  reason code; A2C continues to collapse port failures to `PORT_FAILURE`.
- The canonical source and kit-facing generated mirror are byte-identical.

P17-004 remains `in_progress`. A2D does not read or acquire a credential, contact a provider, expose
the runtime through provider bundles, prove live compatibility, or complete provider packaging.

## Architecture and authority

The decision lock is
`destination=D1/auth=A1/credential=C1/transport=T1/timeout=O1/bytes=B1/failure=E1/privacy=P1/testing=V1/language=L1/scope=N1`.

A2C remains authoritative for request construction, response admission, exact final-URL matching,
and provider parsing. A2D supplies only an injected Node transport capability. The production source
does not read process state, environment variables, files, provider SDKs, MCP servers, token stores,
or ambient global configuration. It does not retry, follow redirects, discover resources, paginate,
write, cache, emit telemetry, or log.

Jira supports only OAuth 2.0 3LO bearer access in this slice, with classic read scope
`read:jira-work`. Azure DevOps supports only Microsoft Entra bearer access, with scope `vso.work`.
Jira Basic/API-token authentication, Azure PATs, acquisition, consent, exchange, refresh, cookies,
proxies, client certificates, and managed identity are separate decisions.

The destination correction is part of A2D because an origin-only Jira request would discard the
required `/ex/jira/<cloudId>` gateway prefix and could be test-green while incompatible with the
recommended live OAuth route. Credential binding therefore covers the exact destination base URL,
not merely its origin.

## Official contract inputs

- Node documents standards-compatible `fetch` and abort support:
  <https://nodejs.org/docs/latest-v20.x/api/globals.html#fetch> and
  <https://nodejs.org/docs/latest-v20.x/api/globals.html#static-method-abortsignaltimeoutdelay>.
- Jira documents the 3LO gateway route and external-integration OAuth guidance:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/> and
  <https://developer.atlassian.com/cloud/jira/platform/security-for-other-integrations/>.
- Jira single-issue GET documents the read contract and classic `read:jira-work` scope:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/>.
- Azure DevOps documents Microsoft Entra bearer access and the Azure DevOps resource ID:
  <https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops>.
- Azure DevOps single-work-item GET documents API version `7.1` and scope `vso.work`:
  <https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1>.

These sources define protocol shape only. They do not authorize or prove a provider call, tenant,
site, organization, project, issue, token, consent, permission, or account identity.

## Exact source manifest

Source commit `d867c475daeea096f4485ee776e4302bd6ac0e7a` changes exactly 13 paths:

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

The source commit has 1,909 insertions and 73 deletions. Pre-commit `spec-integrity` passed for eight
TypeScript files. This evidence checkpoint changes only this document and its ordered public
manifest entry.

## RED and failure chain

No failure was relabeled as success:

1. The first npm wrapper invocation failed before product code because its user-level shim selected
   a missing npm installation. Repo `tsx` inside the desktop sandbox then hit the known
   `uv_os_get_passwd` / `ENOMEM` launcher fault. The same validator outside that sandbox reached the
   intended missing `spec-adapter-fetch-node.ts` RED.
2. An A2C regression using the official-form Jira 3LO gateway failed with `INVALID_INPUT`, proving
   the origin-only destination model was incompatible before the minimum A2C correction.
3. The new Node test harness then failed on its missing production module.
4. The first implementation rejected a valid response `Uint8Array.subarray` because a credential
   full-view predicate was reused for stream chunks. Credential and response-view ownership rules
   were separated without weakening proxy, detached-buffer, or shared-buffer refusal.
5. A test expected a title different from the locked synthetic fixture. The assertion was bound to
   the fixture field rather than changing product behavior.
6. The timeout test initially fired its fake timer before fetch attached an abort observer. It was
   corrected to prove a real in-flight race.
7. A synchronous timer attack exposed the port's own `TIMEOUT` being remapped to
   `INVALID_CONFIGURATION`. The closed error is now preserved and cannot become an unhandled
   rejection.
8. Strict TypeScript found one missing terminal control-flow statement after `try/catch/finally`.
   A closed unreachable throw removed the diagnostic without adding a success path.
9. The byte audit found six Markdown hard-break spaces. Only those bytes were removed before
   staging.
10. The public link gate correctly rejected the new plan while it was untracked. Exact staging made
    the Git index authoritative and the same gate passed.
11. Adversarial review found plain typed arrays could shadow intrinsic bounds and methods with own
    properties. Credential admission now rejects decorated views and response copying uses
    intrinsic typed-array getters and methods; attack hooks never execute.

## Contract and attack evidence

The final A2D runtime passes 12 behavior groups and 33 negative controls:

- exact Jira gateway and Azure endpoint binding with bearer-only `GET` options;
- caller-view transfer zeroization, private terminal zeroization, single-use, and at-most-once I/O;
- rejection of request/provider/destination/path/query confusion before credential consumption;
- closed network errors with no low-level exception or credential disclosure;
- declared and cumulative response caps, stream cancellation, and owned successful bytes;
- in-flight and synchronous deadline races, abort propagation, and late-result refusal;
- redirect, final-URL drift, null/empty body, malformed chunk, and malformed response refusal; and
- accessor, proxy, sparse/decorated typed-array, diagnostic, and mutation attacks without hook
  execution or secret echo.

The A2C parent passes 9 behavior groups / 33 attacks. The A2A provider parent passes 14 behavior
cases / 35 attacks across two providers. A2B SpecIR composition remains green. The final source-run
A2D benchmark measured 100 fake-fetch iterations at p95 `0.175 ms` on Node `v24.15.0`, below the
existing 50 ms TypeScript reconsideration threshold.

The source boundary contains no ambient credential read, filesystem, provider SDK, MCP, subprocess,
retry, write, discovery, telemetry, console, or package-distribution permission. Provider bundles
remain exactly three providers, two byte-identical skills, and five shared runtimes.

## Review repairs

Architecture, testing-strategy, and adversarial code review retained the narrow injected-port
boundary and requested these bounded repairs:

- preserve the exact Jira 3LO destination prefix and bind credentials to the full base URL;
- transfer token bytes into private single-use state and zeroize both transferred and private views;
- validate the exact request before consuming the credential;
- own one deadline across fetch and streaming, including synchronous and late-settlement races;
- enforce declared and cumulative caps and cancel overflow;
- snapshot response shape without invoking hostile accessors;
- use typed-array intrinsics at the trust boundary and reject decorated credential views; and
- collapse all low-level failures without URL, identifier, header, token, body, or exception echo.

No unresolved Critical or High finding remains in the reviewed source checkpoint.

## Qualification receipts

### Focused, compiler, and byte identity

- A2D plan: PASS, 13 paths, 11 decisions, 5 non-claims, and 6 official-source groups.
- A2D runtime: PASS, 12 behavior groups, 33 attacks, bearer-only single-use transport.
- A2C parent: PASS, 9 behavior groups and 33 attacks.
- A2A provider parent: PASS, 14 behavior cases and 35 attacks.
- A2B SpecIR/composition and Post-17 roadmap 22 tasks / 4 initiatives: PASS.
- TypeScript 5.9.3 strict/no-emit NodeNext with `skipLibCheck=false`: exit `0`, no diagnostics over
  the affected graph.
- Synced core: PASS, 24 byte-identical files and 4 generator attacks.
- The canonical and generated Node sources are each 22,026 bytes and share SHA-256
  `018C6C4132A624339B3D7F99FCE2442235FED280FDFD191F727D02572F083FD1`.
- All 13 source paths are strict UTF-8, no BOM, LF-only, final-LF, and free of trailing whitespace;
  the Vietnamese-language detector has zero feature hits against a positive control.

### Public and provider distribution

Before this evidence row, public-source authority is 766 manifest paths, 228 Markdown files, 763
text files, 48/48 relative links, 4 lockfiles, 754 dependency occurrences, 617 unique dependencies,
10 secret-detector families, zero issues, and status `eligible-for-r5c2`.

Public entry passes 5/5 and governance passes 5/5. R6 readiness passes one canonical plus 40 attacks.
Provider parity/distribution remains 3 providers / 2 skills / 5 runtimes and 3 strict-admitted
archives / 71 entries / 8 sidecars / 11 checksums / 79 text scans / 15 clean runtime smokes / 4
attacks. A2D therefore does not silently widen any Codex, Claude Code, or GitHub Copilot package.

### Full source qualification

One uninterrupted native `test:kit` run exited `0` on the exact staged bytes that became source
commit `d867c475daeea096f4485ee776e4302bd6ac0e7a`. It re-proved every kit gate, including public
release, SBOM/archive/clean-clone, privacy, Control Plane, provider, sync guard, cross-platform,
browser target, Playwright, version, prompt budget, and lesson synchronization.

The final tail confirms cross-platform 11/11, browser target 11/11, Playwright 63/63, design matcher
11/11, Figma source 13/13, version v3.25, prompt budget 163,643 bytes / approximately 40,023 tokens
below 172 KB, and lesson pairing 60/60. The post-suite source index remained exactly 13 staged paths
with zero unstaged paths and a clean cached diff before commit.

### Evidence-index qualification

After this document and its ordered manifest row were staged, affected qualification passed:

- A2D 13-path/11-decision/5-non-claim/6-source plan plus 12 behavior groups / 33 attacks at p95
  `0.165 ms`;
- A2C 13/11/5/6 plus 9 behavior groups / 33 attacks;
- A2A 14 behavior cases / 35 attacks at paired p95 `1.165 ms`, with A2B composition green;
- roadmap 22/4, synced-core 24/four, pre-commit 3/3, and TypeScript 5.9.3 strict/no-emit with
  zero diagnostics;
- R6 one canonical plus 40 attacks, public entry 5/5, governance 5/5, and public authority at 767
  manifest paths / 229 Markdown / 764 text / 48 of 48 links / four lockfiles / 754 dependency
  occurrences / 617 unique / ten detector families / zero findings, `eligible-for-r5c2`; and
- provider parity/distribution unchanged at 3/2/5 and 3 archives / 71 entries / 8 sidecars / 11
  checksums / 79 scans / 15 smokes / 4 attacks.

One uninterrupted native draft-evidence `test:kit` then exited `0` after approximately `452.18s`
on the exact two-path index. Its in-suite A2D p95 was `0.162 ms`, its A2A paired p95 was `1.081 ms`,
and its public/provider/tail counts matched the affected receipts above. The post-suite index still
contained only this document and the manifest modification, with zero unstaged paths and a clean
cached diff.

These frozen receipt bytes are durable only if a second complete native suite exits zero on the
final document and manifest. That terminal result is recorded in the workspace handoff and commit
checkpoint so this evidence file does not rewrite itself after the final run. The evidence commit is
forbidden unless that final suite passes and the exact two-path index remains unchanged.

## Privacy and external effects

Evidence contains only public contract names, closed attack labels, counts, limits, timings, hashes,
and commit identities. It contains no provider response, normalized requirement text, cloud ID,
organization, project, issue identifier, destination URL, account/person/tenant data, credential,
authorization header, cookie, token hash, scope grant, or low-level exception.

There was no provider call, credential read, database write, dashboard mutation, target `.Codex`
edit, sync, push, PR mutation, direct-main push, tag, release, publication, visibility change, or
version bump in A2D.

## Non-claims and next boundary

A2D does not prove live Jira or Azure DevOps access, token validity, consent, permission, TLS/rate
limit behavior, credential acquisition or refresh, retry, pagination, search, attachments, comments,
history, writes, Jira Data Center, Azure DevOps Server, CLI/MCP wiring, provider-package permission,
plugin installation, P17-004 completion, or P17-019 readiness.

The next P17-004 gate is conditional metadata-only live proof. It may start only when exact named
non-secret destination/item inputs and an already-qualified bearer capability are present; absent
inputs remain `needs_input`, never a compatibility pass. Provider packaging is a separate later gate
that must independently qualify Codex, Claude Code, and GitHub Copilot permissions, manifests,
README instructions, archives, SBOMs, and clean-clone behavior.
