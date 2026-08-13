# P17-013 — Documentation and Runtime Claim Audit Plan

Status: APPROVED BY ACTIVE ROADMAP GOAL  
Date: 2026-08-13  
Owner boundary: local deterministic tooling only

## Objective

Make critical public documentation claims executable: every registered claim must resolve to an
exact source location and a deterministic local probe. Version drift and generated-edition drift
must fail closed before a release can describe behavior that the runtime does not provide.

## Architecture

1. **Claim registry (data):** a versioned, closed JSON catalog declares stable claim IDs, document
   anchors, probe IDs, severity, and expected evidence. It contains no shell command strings.
2. **Audit core (application):** a TypeScript module validates the registry, resolves repository-safe
   paths, executes only an allowlisted in-process probe adapter, and emits a content-addressed result.
3. **Probe adapters (infrastructure):** narrow adapters inspect version authorities, provider bundle
   parity, generated Copilot reproducibility, and named runtime contract tests. No arbitrary command
   execution is accepted from catalog data.
4. **CLI adapter:** one stdin-free command emits exactly one machine sentinel and deterministic exit
   codes. Invalid registry/input exits separately from a failed claim.
5. **CI/test composition:** a focused attack suite and package script join the existing full kit gate.

## Initial critical claims

- the original roadmap remains 17/17 complete and is not reopened by post-17 work;
- the source-of-truth prompt, package, README, and workflow-visible version stamps agree;
- Codex, Claude, and Copilot source bundles expose the declared Project Intelligence and Workflow
  Orchestrator capabilities over shared contracts;
- generated Copilot output is reproducible from tracked source;
- provider distribution archives are generated output, not evidence of installation/publication;
- sync remains fail-closed and is not described as an automatic unverified release path.

## Edge cases and attacks

- duplicate claim ID, unknown probe, extra field, invalid severity, and path traversal;
- missing document, missing/duplicated anchor, stale expected text, and a claim mapped to no probe;
- package/prompt/README/provider version mismatch;
- omitted provider capability or non-identical shared skill;
- generated Copilot missing/extra/stale file and line-ending-only drift;
- forged result hash, unsorted evidence, and a passing summary containing a failed claim;
- no network, credential, install, publication, sync, push, or target `.Codex` dependency.

## Acceptance and evidence

- Focused tests must include positive claim-to-probe mapping plus every attack above.
- Existing version, provider-bundle, Copilot-generation, roadmap, and full kit suites remain green.
- Dashboard `/roadmap` must reflect the canonical state without task-specific UI branches.
- Durable evidence: `docs/evidence/post-17-claim-runtime-audit.md` plus dashboard reconciliation.

## Explicit non-goals

No automatic release publication, prompt rewriting, remote provider execution, marketplace install,
sync, push, credential access, or broad documentation rewrite. Python, Rust, or Go is considered only
if measured TypeScript behavior cannot satisfy the deterministic local audit.
