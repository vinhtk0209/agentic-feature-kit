# P17-004 A2E Conditional Live-Proof Boundary Evidence

**Task:** P17-004
**Slice:** A2E
**Date:** 2026-08-21
**Contract status:** Qualified
**Current live compatibility:** `needs_input` for Jira and Azure DevOps
**Source commit:** `7af56e99e26f162707b69e4b654cdc76b9016765`
**Source parent:** `5a7dbeff332ef7323c382874b51b9983037305d1`
**Source tree:** `b447df85d928b34a47804c07cf61d7d08bada205`

## Result

A2E qualifies an honest boundary between the offline P17-004 adapter stack and later conditional
live evidence:

- the pure contract returns exact frozen `ready` or `needs_input` readiness and validates exact
  content-addressed `needs_input`, `passed`, or `failed` receipts;
- the Node runner accepts one exact A2C item input plus one already-created A2D bearer descriptor;
- the Node runner internally calls `createNodeSpecAdapterFetchCapability(config, credential)` with no
  caller-supplied dependency argument, then performs at most one A2C execution;
- receipts admit only safe provider/status/reason/time/hash/count metadata; and
- null item and credential inputs return `needs_input` before any transport construction or I/O.

The current workspace contains neither named non-secret live item coordinates nor in-process bearer
capabilities. Exact-commit readiness execution therefore produced two valid `needs_input` receipts
and a fetch tripwire count of zero. No live provider compatibility claim is made.

P17-004 remains `in_progress`. Real Jira and Azure DevOps receipts and later provider-package
exposure are separate gates.

## Architecture and authority

The approved decision lock is
`boundary=B1/input=I1/readiness=R1/provenance=P1/execution=X1/receipt=E1/integrity=H1/failure=F1/privacy=V1/testing=T1/language=L1/scope=N1`.

The pure contract owns schema validation, closed reason codes, canonical integrity bytes, immutable
output, and metadata admission. It has no clock read, network, environment, filesystem, process,
credential, provider, console, or durable-sink authority.

The Node runner owns conditional execution. It accepts no raw token, authorization header, fetch
implementation, A2C capability, timer, transport factory, hash override, or dependency bag. A valid
caller must already hold an A2D `SpecAdapterBearerCredential`; A2E does not acquire, refresh, locate,
or persist credential material.

An arbitrary injected A2C port cannot establish live provenance. A2E uses the A2D default Node
transport path internally. Synthetic tests temporarily replace the process-global fetch function to
exercise the success contract, but those receipts are recorded only as synthetic contract evidence.
Content addressing detects receipt mutation; it is not a signature or independent proof that a
provider was contacted.

A durable live `passed` claim additionally requires a fresh standalone run on an exact source
commit, unmodified default Node globals, named non-secret item coordinates, real in-process bearer
authority, and captured metadata-only output.

## Exact source manifest

The source commit changed exactly twelve paths:

| Path | Bytes | SHA-256 |
|---|---:|---|
| `.claude/integrations/core/spec-adapter-live-proof-node.ts` | 5,122 | `0B2F346F9B291827EAED1EFD98544BCABF183278E9A1275A6CD653C0C92F981B` |
| `.claude/integrations/core/spec-adapter-live-proof.ts` | 12,892 | `C86E51C0284D05B21326C2D77A97E9EAD939B284A5220DCE9C458CDC3E0EC5FD` |
| `docs/roadmap/p17-004-a2e-live-proof-boundary-plan.md` | 12,101 | `0FDF1F4C897693A71920DE8085ADEEDC0A6D35910B2339B7323EE6CCDEC38FF0` |
| `docs/roadmap/post-17-roadmap.md` | 11,191 | `71C35E6416879A6D94ED72694FF676882DADA46732208654A75BD701AB4B805E` |
| `package.json` | 36,696 | `A8AE5D82372A14E45060BA20099B4CA6A740024ECBCCF5663E62A14775A7793E` |
| `packages/core/README.md` | 16,685 | `936CCCC653CE1C60ECDF567E273C5EDDCC79FE019D76C315872194EBA3075E4B` |
| `packages/core/src/spec-adapter-live-proof-node.ts` | 5,122 | `0B2F346F9B291827EAED1EFD98544BCABF183278E9A1275A6CD653C0C92F981B` |
| `packages/core/src/spec-adapter-live-proof.ts` | 12,892 | `C86E51C0284D05B21326C2D77A97E9EAD939B284A5220DCE9C458CDC3E0EC5FD` |
| `packages/core/test/spec-adapter-live-proof.test.ts` | 15,116 | `1BA1E4067CA398758116A0ACA164AE4236221CA2C78092F04080FACE16FA62BD` |
| `release/public-release-manifest.json` | 135,976 | `53795DB8FF36B9299F095A525681532CFF8A3E01F476662998DC11A88ED81902` |
| `scripts/build-synced-core.ts` | 4,196 | `842C8A1D79F4399FE9AF5B4F137625D2BB9EDED043C60445E2669457E47613C0` |
| `scripts/post-17-spec-adapter-live-proof-boundary-plan.test.ts` | 4,827 | `87BB285FF9F64736A740C5154D765482F904CFB7CFFCCCA658D4D9BABC3235D7` |

The canonical and generated pure files are byte-identical. The canonical and generated Node files
are also byte-identical. All twelve source paths were strict UTF-8 without BOM, LF-only, final-LF,
and free of trailing whitespace. An explicit Vietnamese-character scan had a 65-line positive
control in the workspace HANDOFF and zero hits across the English A2E feature surfaces.

## Honest RED and repair chain

The implementation retained the complete failure history:

1. The first combined plan patch was rejected atomically because an abbreviated long `test:kit`
   context did not match. No repository file changed in that attempt.
2. The registered plan validator then executed and failed on the intentional missing authority
   `packages/core/src/spec-adapter-live-proof.ts`.
3. The first focused runtime reached synthetic Jira success, then exposed a test-oracle defect:
   the fixture had no `sourceSha256` property. The oracle was repaired to independently hash the
   exact response bytes.
4. The repository TypeScript 4.9.5 compiler failed while parsing the installed Node 26 type
   declarations before reaching A2E. The exact ephemeral TypeScript 5.9.3 gate was used without
   modifying package or lock files.
5. TypeScript 5.9.3 found one real source diagnostic because the broad semantic input type permits
   absent paragraphs. The runner now uses `paragraphs?.length ?? 0`; receipt validation rejects zero,
   so impossible invariant drift becomes closed `execution_rejected` rather than false success.
6. Public provider distribution found one ordinal manifest error. The Jira row was restored before
   the new live-proof rows, and the 774-row manifest then passed with zero ordinal errors.
7. The pre-stage link gate correctly refused the untracked plan declared by the worktree manifest.
   After staging exactly twelve paths, index-authoritative links passed 48 of 48.
8. Two language-audit launchers were invalid: one PowerShell interpolation parse failure and one
   overbroad Unicode range. Neither produced a finding. The final explicit-character audit supplied
   a positive control and zero feature hits.

No failure was hidden, converted into a pass, or repaired by widening the input, privacy, network,
provider, or publication boundary.

## Focused runtime and adversarial evidence

`test:spec-adapter-live-proof-boundary` passes ten behavior groups and 26 attacks:

- exact closed readiness, including both partial-input states;
- exact frozen passed receipts and independent integrity validation;
- status/result/reason contradictions, tampering, malformed hashes, and throwing hash ports;
- accessor, inherited-object, sparse-array, and proxy attacks without hook execution;
- Jira and Azure DevOps `needs_input` receipts with zero fetch calls;
- invalid outer envelope, invalid destination, forged bearer descriptor, and malformed nested mapping
  with zero fetch calls;
- exactly one synthetic default-global-fetch composition for Jira;
- exactly one synthetic default-global-fetch composition for Azure DevOps;
- provider failure collapse to `execution_rejected` with no low-level diagnostic; and
- 100 pure create/validate iterations below the 50 ms language-reconsideration threshold.

The focused standalone p95 values observed during qualification ranged from `0.210 ms` to
`1.562 ms` under concurrent load. The complete native suite measured `0.123 ms`. No Rust, Go,
Python, native extension, sidecar, subprocess, SDK, or dependency is justified by these results.

The A2D parent remains 12 behavior groups / 33 attacks. A2C remains 9 / 33. A2A remains eight core
contracts plus 14 provider behavior cases / 35 closed attacks across two providers. A2B bridge,
composer, SpecIR, CLI, flagship wiring, and Confluence staging all remain green.

## Strict TypeScript evidence

The exact TypeScript 5.9.3 command used `--noEmit --strict --skipLibCheck false --target ES2022
--module NodeNext --moduleResolution NodeNext --esModuleInterop --types node` across A2A-A2E core
sources, the A2E attack test, mirror generator, and plan validator. The final command exited `0` with
zero diagnostics and did not change package or lock files.

The repository-local TypeScript 4.9.5 parser result is explicitly not product evidence because it
cannot parse the installed Node 26 declarations.

## Public and provider evidence

The exact staged source candidate passed:

- 774 unique ordinal public-manifest paths;
- 230 Markdown files and 48 of 48 internal links;
- four lockfiles, 754 dependency occurrences, and 617 unique dependencies;
- 771 text files, ten secret detector families, and zero findings;
- public-entry 5/5, public-governance 5/5, pre-commit 3/3, R6 1 canonical plus 40 attacks,
  aggregate public-release contract 18/18, and Git-index adapter 7/7;
- 26 byte-identical synced core files and four mirror-generator attacks; and
- public readiness `eligible-for-r5c2`.

A2E does not widen provider packages. Source bundle qualification remains exactly three providers,
two byte-identical skills, and five shared runtimes. Deterministic provider distribution remains
three archives, 71 entries, eight schema-valid secret-clean sidecars, 11 checksums, 79 text scans,
15 clean runtime smokes, and four attacks.

## Complete native suite

One uninterrupted native system-npm invocation ran the exact staged source bytes:

```text
node C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js run test:kit
```

The run completed with exit `0` after approximately eight minutes. Representative terminal
receipts were:

- A2E: 10 behavior groups / 26 attacks / p95 `0.123 ms`;
- A2D: 12 behavior groups / 33 attacks / p95 `0.202 ms`;
- A2A: 14 provider behavior cases / 35 attacks / paired p95 `1.457 ms`;
- public authority: 774/230/771, 48/48 links, zero secret findings;
- providers: 3/2/5 and distribution 71/8/11/79/15/4;
- cross-platform release: 11/11;
- worktree browser target: 11/11;
- Playwright runner: 63/63;
- prompt version: v3.25;
- prompt budget: 163,643 bytes; and
- lesson synchronization: 60/60.

The suite performed no real sync and did not contact Jira or Azure DevOps.

## Exact current readiness receipts

The committed runner was invoked with exact provider labels, `input: null`, `credential: null`, and
a process-global fetch tripwire. The command exited `0` with `fetchCalls=0`.

| Provider | Status | Observed at | Reason codes | Result | Integrity SHA-256 |
|---|---|---|---|---|---|
| Jira | `needs_input` | `2026-08-21T06:31:04.968Z` | `item_input_missing`, `bearer_capability_missing` | `null` | `69082d19ba3c7a94de7c5f97346e45f27fc3f84c04322a6627123d0f4d50b040` |
| Azure DevOps | `needs_input` | `2026-08-21T06:31:04.971Z` | `item_input_missing`, `bearer_capability_missing` | `null` | `944f335cf52a5225e527ac1857a0544cb4a38734ddb75a63aacfdd38fda1f76b` |

Both receipts use schema `1.0.0` and execution-mode label `node-default-fetch-v1`. The label identifies
the runner boundary; `needs_input` proves that no transport execution occurred. Neither receipt is a
provider compatibility pass.

## Privacy and non-claims

No A2E receipt, error, or durable evidence output contains a live base URL, cloud ID, organization,
project, issue key, work-item ID, source reference, title, paragraph, acceptance text, unsupported
field name, response body, authorization header, token, token hash, account, scope, consent record,
provider error, or stack. Source types necessarily name the existing A2C input fields, and offline
tests use only the locked synthetic provider shapes; the public secret scan reports zero findings.

A2E does not prove that Jira or Azure DevOps was contacted, a credential works, OAuth consent or
refresh works, TLS/rate-limit behavior is compatible, attachments/comments/history are supported,
writes are possible, Jira Data Center or Azure DevOps Server is supported, optional connectors are
packaged, provider permissions are granted, P17-004 is complete, or P17-019 is ready.

No dashboard or target repository was changed. No target `.Codex` directory was edited. No sync,
push, PR, merge, tag, version bump, release, publication, visibility change, or package installation
occurred.

## Next gates

P17-004 can advance only when the following inputs exist separately for Jira and Azure DevOps:

1. exact named non-secret item coordinates accepted by A2C;
2. a destination-bound real in-process A2D bearer capability;
3. a fresh standalone exact-commit run with unmodified default Node globals;
4. a metadata-only `passed` receipt qualified against this contract; and
5. independent provider-package scope for Codex, Claude Code, and GitHub Copilot, including
   permissions, manifests, README instructions, archives, SBOMs, clean-clone tests, PRs, and merges.

Until then, both providers remain honestly `needs_input`, P17-004 remains `in_progress`, and the
existing five-runtime provider bundles remain unchanged.
