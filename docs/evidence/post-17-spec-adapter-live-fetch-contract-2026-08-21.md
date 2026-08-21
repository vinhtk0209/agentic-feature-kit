# P17-004 A2C Single-Item Fetch Contract Evidence

**Task:** P17-004
**Slice:** A2C
**Date:** 2026-08-21
**Status:** Qualified
**Source commit:** `57df59dd083da2c1a9986b95975937cd5bcd159a`
**Source parent:** `8b33f094721143bc928b8a80e2c2e415d00a94db`
**Source tree:** `ec9c750c4b07f49095299c2f69114d5ed7ebb7b1`

## Result

A2C adds a provider-neutral application contract for fetching exactly one Jira Cloud issue or one
Azure DevOps Services work item through an injected, destination-bound transport capability.

- The application service builds one deterministic credential-free GET request from a closed input.
- The capability owns authorization and transport; tokens, cookies, headers, account identity, and
  refresh state never enter the public request, result, error, or evidence contracts.
- Only a status-200 JSON response with the exact requested final URL and a body of 1..256 KiB is
  accepted. The service owns one byte copy and passes those exact bytes to the qualified A2A parser.
- Jira admits only the official optional top-level metadata names `self` and `expand`; Azure DevOps
  admits only `_links`. Their values are never traversed, copied, logged, or returned.
- The shared source and kit-facing generated mirror are byte-identical.

P17-004 remains `in_progress`. A2C does not implement a Node HTTP port, read a credential, contact a
provider, expose a CLI/MCP connector, add provider packages, or prove live compatibility.

## Architecture and authority

The decision lock is
`boundary=B1/request=Q1/bytes=Y1/jira=J1/azure=Z1/auth=C1/failure=E1/privacy=P1/testing=T1/language=L1/scope=N1`.

The pure TypeScript application service is the authority for request construction and response
admission. Existing A2A adapters remain the authority for JSON parsing, field conservation,
semantic normalization, source hashing, and `SpecAdapterResult` 1.1.0. A transport implementation
is an injected port, not a hidden global `fetch`, environment reader, provider SDK, or MCP client.

This separation preserves exact provider-response provenance. Projecting a live response into the
minimal A1 fixture shape and reserializing it was rejected because the resulting digest would
identify derived bytes rather than the provider bytes. Reusing the Confluence MCP server was also
rejected because it mixes unrelated HTTP, auth, browser, image, and file concerns.

Rust, Go, and Python were reconsidered. None provides a missing capability for one bounded JSON
request, while each would add process/FFI, per-platform artifact, license, SBOM, signing, and
clean-clone obligations. The affected provider benchmark measured paired p95 `0.990 ms` on Node
`v24.15.0`, below the existing 50 ms reconsideration threshold.

## Official contract inputs

- Jira Cloud REST v3 documents `GET /rest/api/3/issue/{issueIdOrKey}`, optional `fields`, and the
  issue response envelope:
  <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/>.
- Jira's official authentication guidance recommends OAuth for apps and limits API-token Basic auth
  to simple/manual clients:
  <https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/>.
- Azure DevOps REST 7.1 documents
  `GET https://dev.azure.com/{organization}/{project}/_apis/wit/workitems/{id}`, optional `fields`,
  `api-version=7.1`, and `vso.work`:
  <https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/get-work-item?view=azure-devops-rest-7.1>.
- Azure DevOps authentication guidance recommends Microsoft Entra ID for new applications and PATs
  only when a stronger method is unavailable:
  <https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops>.

These sources bind URL and read-scope expectations only. They do not authorize or prove a live call.

## Exact source manifest

Source commit `57df59dd083da2c1a9986b95975937cd5bcd159a` changes exactly 13 paths:

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

The commit has 1,413 insertions and 10 deletions. This evidence checkpoint changes only this file
and its ordered public-manifest entry.

## RED and failure chain

No failure was relabeled as success:

1. The plan validator first failed only because
   `packages/core/src/spec-adapter-fetch.ts` did not exist.
2. The first runtime-test invocation exposed a CJS top-level-`await` harness error. Wrapping the
   harness in `async main()` then produced the intended missing-module RED before runtime creation.
3. Initial focused tests reached 8 behavior groups / 21 attacks. Adversarial review then proved a
   decorated mapping array with an extra enumerable property reached the port and failed too late as
   `INVALID_RESPONSE`; the new attack required pre-I/O `INVALID_INPUT`.
4. Snapshot and exact-array hardening closed accessor, proxy, sparse, decorated-array, and
   whitespace-mutated path cases. The focused suite advanced to 9 groups / 27 attacks.
5. Final review found the injected hash capability was validated only after transport execution and
   otherwise-valid response metadata had no character bound. Preflight validation plus base URL,
   content-type, and final-URL limits advanced the suite to 9 groups / 29 attacks.
6. A draft exact-index full suite exited zero after approximately `386.7s`, but the mandatory
   post-suite cached-diff audit found four Markdown hard breaks with trailing spaces. The source
   commit stayed blocked; only those eight space bytes were removed.
7. Corrected bytes reran affected gates and one final full suite. The final suite exited zero after
   approximately `413.25s` and post-suite inventory remained exactly 13 staged paths.
8. The first `git commit` attempt was blocked before product validation by the desktop sandbox's
   known `uv_os_get_passwd` / `ENOMEM` launcher fault. The identical tested index was committed
   outside that sandbox with hooks enabled; `spec-integrity` passed for eight TypeScript files.

## Contract and attack evidence

The final focused runtime proves 9 behavior groups and 29 negative controls:

- exact Jira and Azure DevOps 7.1 URL construction with ordinal field sorting;
- one credential-free capability call per successful provider case;
- exact response-byte hashing and caller-mutation isolation;
- provider, destination, base-origin, identifier, mapping, and capability refusal before I/O;
- closed port exceptions and status, content-type, redirect, envelope, empty-body, and size failures;
- accessor-free snapshots for input, response, transport, and hash capabilities;
- rejection of sparse/decorated arrays, hostile proxies, typed-array proxies, and whitespace path
  confusion;
- acceptance of only the locked provider wire metadata names and rejection of unknown top-level
  fields; and
- stable errors and public requests with no credential-bearing field or low-level source content.

The parent provider suite passes 14 behavior cases and 35 closed attacks across both providers. It
proves official wire metadata values stay absent from results while unknown `changelog` or
`relations` fields fail closed. The existing A2A/A2B chain also passes 8 core contracts, canonical
SpecIR `23/23`, intake CLI `5/5`, flagship wiring `4/4`, and Confluence staging `3/3`.

## Review repairs

Architecture, test-strategy, and adversarial code review retained the injected-port boundary and
requested these bounded repairs:

- snapshot closed plain-data records without invoking accessors;
- require dense exact-key mapping arrays and copy validated values;
- require exact-trim Azure organization/project segments;
- validate both transport and hash capabilities before provider I/O;
- own the response bytes before downstream parsing;
- bound base URL, content type, final URL, timeout declaration, and response size; and
- preserve stable closed errors for proxy, typed-array, and low-level failures.

The resulting review has no unresolved Critical or High finding.

## Qualification receipts

### Focused and compiler

- A2C plan: PASS, 13 source paths, 11 decisions, 5 non-claims, and 6 static boundary attacks.
- A2C runtime: PASS, 9 behavior groups, 29 attacks, one fake credential-free call per provider.
- Provider parent: PASS, 14 behavior cases, 35 closed attacks, paired p95 `0.990 ms`.
- A2A input/runtime plans, A2B composition, Post-17 roadmap 22 tasks / 4 initiatives, boundary
  refresh 6/6, wave-1 23 mandatory + 1 conditional, and capability matrix 24 phases / 7 official
  sources / 15 controls: PASS.
- Synced core: PASS, 23 byte-identical files and 4 generator attacks.
- Ephemeral TypeScript 5.9.3 strict/no-emit NodeNext check over the affected core, parsers, tests,
  generator, and validator: exit `0`, no diagnostics, no package or lockfile change.

### Public and provider distribution

Before this evidence row, public-source authority is 760 manifest paths, 226 Markdown files, 757
text files, 48/48 relative links, 4 lockfiles, 754 dependency occurrences, 617 unique dependencies,
10 secret-detector families, zero issues, and status `eligible-for-r5c2`.

Provider parity/distribution passes with 3 providers, 2 byte-identical skills, 5 shared runtimes, 3
strict-admitted deterministic archives, 71 entries, 8 schema-valid and secret-clean sidecars, 11
checksums, 79 text scans, 15 clean runtime smokes, and 4 attacks.

### Full source qualification

Final native `npm test` exited `0` after approximately `413.25s` on the exact staged bytes that
became source commit `57df59dd083da2c1a9986b95975937cd5bcd159a`. The suite includes all
public-release, SBOM/archive/clean-clone, privacy, Control Plane, provider, sync-guard,
cross-platform, browser-runner, version, prompt-budget, and lesson-sync gates.

The final tail confirms cross-platform `11/11`, worktree-browser `11/11`, Playwright `63/63`,
version v3.25, 163,643 prompt bytes / approximately 40,023 tokens below 172 KB, and lesson pairing
`60/60`. The post-suite index remained 13 staged paths, zero unstaged paths, with a clean cached
diff before the source commit.

### Evidence-index qualification

After this document and its ordered manifest row were staged, affected qualification passed again:
A2C 13/11/5/6 and 9 groups / 29 attacks, provider parent 14/35, roadmap 22/4, R6 one canonical +
40 attacks, 48/48 internal links, and zero findings across 10 secret-detector families. Public
authority was 761 manifest paths, 227 Markdown files, 758 text files, 4 lockfiles, 754 dependency
occurrences / 617 unique dependencies, and status `eligible-for-r5c2`. Provider parity and
distribution remained 3 providers / 2 skills / 5 runtimes and 3 archives / 71 entries / 8 sidecars
/ 11 checksums / 79 scans / 15 smokes / 4 attacks.

Complete native `npm test` then exited `0` after approximately `393.17s` on that exact two-path
draft evidence index. The in-suite paired provider p95 was `0.933 ms` on Node `v24.15.0`; version
authority remained v3.25, prompt budget remained 163,643 bytes / approximately 40,023 tokens under
172 KB, and lessons remained 60/60.

These updated receipt bytes are admitted only if a subsequent final-byte native suite also exits
zero. The durable evidence commit is forbidden otherwise. Its final sentinel is recorded in the
workspace handoff and commit checkpoint so this document does not rewrite itself after the
qualifying run.

## Privacy and external effects

Evidence contains only public contract names, closed attack labels, counts, limits, timings, hashes,
and commit identities. It contains no provider response, normalized requirement text, item key or
URL, organization/project name, tenant/person data, credential, authorization header, cookie,
low-level exception, or local source path.

There was no provider call, credential read, database write, dashboard mutation, target `.Codex`
edit, sync, push, PR mutation, direct-main push, tag, release, publication, visibility change, or
version bump in A2C.

## Non-claims and next boundary

A2C does not prove live Jira or Azure DevOps access, OAuth/PAT/API-token behavior, TLS/redirect and
rate-limit handling, credential refresh, retries, pagination, search, attachments, comments,
history, writes, Jira Data Center, Azure DevOps Server, connector packaging, plugin installation, or
P17-019 readiness.

The next P17-004 slice must separately plan and attack-test a production Node port, explicit
credential capability, conditional metadata-only live proof, and provider-package exposure without
widening the provider-neutral core or silently granting network/secret permissions.
