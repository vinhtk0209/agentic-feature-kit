# P17-004 A2A Provider-Local Specification Adapter Runtime Evidence

**Task:** P17-004
**Slice:** A2A
**Date:** 2026-08-21
**Status:** Qualified
**Source commit:** `e083675d63b42ec1ce6226877ba902c44f477682`
**Source parent:** `f12e5df81837ca682b05318ed113da040152ec44`
**Source tree:** `878f50de40682dab16a70c60dc3b1c7cee97337b`

## Result

A2A implements the first executable P17-004 boundary without provider I/O. One provider-neutral
`SpecAdapterResult` schema `1.0.0` and one offline discovery contract now serve two provider-local
parsers:

- `jira-cloud-json-v1` for the locked Jira ADF subset; and
- `azure-devops-work-item-json-v1` for the locked Azure DevOps paragraph-HTML subset.

Both consume exact `Uint8Array` input, hash those bytes through an injected port before fatal UTF-8
and JSON parsing, produce unchanged P17-003 `SemanticSourceInput`, and return unsupported field
names without unsupported values. The approved synthetic fixtures normalize to one semantic hash
while preserving different source/provenance hashes.

P17-004 remains `in_progress`. Confluence/local-file composition, live provider I/O, credentials,
CLI/provider packaging, and P17-019 readiness are not claimed by A2A.

## Architecture and language decision

The application contract, discovery, and provider parsers remain TypeScript. The only Node-specific
surface is the injected SHA-256 port in `spec-adapter-node.ts`.

Rust, Go, and Python were evaluated before implementation. They would add native or sidecar process
boundaries, per-platform archives, FFI/protocol handling, dependency and license inventory, SBOM and
signature inputs, and another clean-clone/runtime matrix. No missing capability was found for the
closed JSON/ADF/HTML grammar.

The decision threshold was locked before runtime: reopen the language ADR if a 256 KiB bounded
fixture exceeds 50 ms p95, incremental RSS exceeds 64 MiB, or a required safe parser capability is
not implementable inside the closed TypeScript grammar. The final full-suite observation was a
100-iteration paired Jira/Azure p95 of `1.020 ms` on Node `v24.15.0`; no threshold was breached.

## Exact source manifest

The source commit changes exactly 13 paths:

1. `docs/roadmap/p17-004-a2a-provider-local-adapter-runtime-plan.md`
2. `docs/roadmap/post-17-roadmap.md`
3. `docs/schemas/spec-adapter-result.schema.json`
4. `package.json`
5. `packages/core/README.md`
6. `packages/core/src/spec-adapter-azure-devops.ts`
7. `packages/core/src/spec-adapter-jira.ts`
8. `packages/core/src/spec-adapter-node.ts`
9. `packages/core/src/spec-adapter.ts`
10. `packages/core/test/spec-adapter-providers.test.ts`
11. `packages/core/test/spec-adapter.test.ts`
12. `release/public-release-manifest.json`
13. `scripts/post-17-spec-adapter-runtime-plan.test.ts`

This evidence checkpoint changes only this file and the ordered public-manifest entry that admits it.

## RED and failure chain

No failure was relabeled as success:

1. The first focused invocation stopped in `tsx` startup with
   `ERR_SYSTEM_ERROR/uv_os_get_passwd/ENOMEM`; it never reached feature assertions and was recorded
   as environmental pre-RED only.
2. The first outside-sandbox validator reached feature code and reported the missing public result
   schema. Diagnostic ordering was then aligned with the plan without adding runtime behavior.
3. The registered plan validator failed exactly on absent
   `packages/core/src/spec-adapter.ts`.
4. Behavioral tests were added before runtime and failed with
   `MODULE_NOT_FOUND: ../src/spec-adapter`.
5. The first public-link pass failed with `link-source-invalid` because the new public Markdown was
   not yet in the Git index. Staging exactly the declared 13 paths resolved source admission.
6. Cached diff review found four trailing-space findings in the plan header; all four were removed
   and the gate reran cleanly.
7. Repository TypeScript 4.9 could not parse the installed newer Node declaration syntax, so it was
   not used as source evidence.
8. Workspace-qualified TypeScript 5.9.3 reached source and found two implicit-`any` adapter inputs.
   Both were explicitly typed and strict/no-emit then passed.

## Contract and attack evidence

Focused runtime qualification passes:

- 6 provider-neutral contract cases;
- 13 provider behavior cases;
- 33 closed attacks;
- two provider descriptors in exact JavaScript-ordinal discovery order; and
- JSON Schema plus runtime-validator round trips.

Attack families cover:

- duplicate, extra, reordered, and version-drifted capability descriptors;
- result/provider/capability/source mismatch and extra fields;
- empty, oversized, invalid UTF-8, malformed JSON, and unsafe source references;
- hash-port exceptions and invalid digests;
- non-HTTPS, userinfo, query, fragment, and path-confused configured origins;
- missing, duplicate, unaccounted, extra-key, and over-budget mapping ownership;
- cross-provider payload wiring;
- unknown, extra, empty, malformed, truncated, node-overflow, and text-overflow Jira ADF;
- attributes, nesting, scripts, unknown entities, text outside paragraphs, truncation, text overflow,
  and payload-origin mismatch for Azure HTML; and
- seeded unsupported-value non-echo through result/error/output surfaces.

The source runtime imports no filesystem, process, environment, network, provider client, dynamic
import, or logging surface. Discovery is explicit and does not execute adapters.

## Review repairs

Architecture review retained a pure application boundary with an injected hash port. Structured
security/correctness review found and repaired:

- non-exact adapter input/result-constructor shapes;
- incomplete cumulative result text accounting;
- mapping ownership that did not cap the total at 64 fields;
- invalid result field names initially using the mapping error family;
- missing JSON Schema validation in the contract suite;
- missing provider cross-wire attacks; and
- missing Jira node/text budget attacks.

No Critical or High finding remains in the reviewed source checkpoint.

## Qualification receipts

### Focused and related

- `test:post-17-spec-adapter-runtime-plan`: PASS, 13 source paths, 10 decision markers, 5
  non-claims, 6 offline pattern families over 3 runtime sources.
- `test:spec-adapters`: PASS, 6 contract + 13 behavior cases, 33 attacks, 2 providers.
- TypeScript 5.9.3 strict/no-emit across four runtime and two test files: exit `0`.
- `test:semantic-spec`: PASS, 8 assertions + 12 attacks.
- A1 regression: PASS, 9 paths, 2 providers, 3 privacy families, 5 attacks.
- Roadmap: PASS, 22 tasks / 4 initiatives.

### Public and distribution

- R6 readiness: PASS, 1 canonical + 40 attacks.
- Public-source authority before this evidence row: 742 manifest paths, 222 Markdown files, 739 text
  files, 48/48 relative links, 4 lockfiles, 754 dependency occurrences, 617 unique dependencies,
  10 secret detector families, and zero issues.
- Provider distribution: PASS, 3 deterministic strict-admitted archives, 71 entries, 8
  schema-valid/secret-clean sidecars, 11 checksums, 79 text scans, 15 clean runtime smokes, and 4
  attacks.

### Full source-index qualification

`npm test` exited `0` in approximately `311.4s` on the exact 13-path source index. The run included
all existing R6/public-release, SBOM/archive/clean-clone, Control Plane, privacy, provider,
sync-guard, cross-platform, browser-runner, version, prompt-budget, and lesson-sync gates. Version
authority remained v3.25.

### Final evidence-index qualification

After this evidence document and its ordered manifest entry were staged, the affected gates passed
again: 13 exact source paths, 6 contract cases, 13 provider behavior cases, 33 closed attacks, 1
release-readiness canonical plus 40 attacks, 48/48 internal links, and zero findings across 10
secret-detector families.

Full `npm test` then exited `0` in approximately `350.9s` on that exact two-path evidence index. The
in-suite public authority was 743 manifest paths, 223 Markdown files, 740 text files, 4 lockfiles,
754 dependency occurrences / 617 unique dependencies, 10 secret-detector families, zero issues,
and status `eligible-for-r5c2`. The final in-suite paired parser p95 was `0.950 ms` on Node
`v24.15.0`; version authority remained v3.25.

## Privacy and external effects

Durable evidence contains identifiers, counts, hashes, timings, reason labels, and test results only.
It contains no raw provider payload, normalized requirement text, unsupported value, tenant/person
data, credential, token, authorization header, provider URL, local source path, or provider response.

There was no provider call, credential read, network adapter, database write, dashboard mutation,
sync, target `.Codex` edit, direct-main push, branch push, tag, release, publication, visibility
change, or version bump in the source/evidence checkpoints.

## Non-claims and next boundary

A2A does not prove a live Jira/Azure DevOps instance, migrate Confluence or local-file intake, expose
the adapters through provider plugins, or complete P17-004. The next dependency is A2B: decide and
test how the existing Confluence and local-file `SpecIR` paths enter `SpecAdapterResult` without
forking semantic or provenance rules. Live connectors remain separately credential- and
authorization-gated.
