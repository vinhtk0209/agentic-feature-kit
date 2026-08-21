# P17-004 A2B SpecIR Composition Evidence

**Task:** P17-004
**Slice:** A2B
**Date:** 2026-08-21
**Status:** Qualified
**Source commit:** `2e2faad952db036b935a95565b83407434751042`
**Source parent:** `428498ba5a2cd2802c6afb8c48648d134443fc18`
**Source tree:** `94ebad3804cb554c7c0c11d0c53dded5f88ff56d`
**Qualified dependency head:** `9c4e106f22dd712b09c812b5bd5c6004eb35d8b2`
**Qualified dependency tree:** `473efb6fddd6a1c616fb179750e04b4c825c3ffd`

## Result

A2B converges the existing Confluence and local-file intake paths on the provider-neutral
`SpecAdapterResult` contract without duplicating semantic or provenance rules.

- `SpecAdapterResult` schema `1.1.0` declares exact source kinds and accepts either bounded UTF-8
  JSON or a validated `spec-ir-v1` input.
- The canonical `SpecIR` implementation now lives in shared core and is mirrored byte-for-byte into
  the kit integration surface.
- A pure bridge validates one `SpecIR` and produces one `SemanticSourceInput` plus one closed adapter
  result without filesystem, environment, process, network, or provider-client access.
- The local composer parses `.md`, `.txt`, `.docx`, `.pdf`, or `.xlsx` exactly once, writes the
  validated IR artifact, and emits the closed adapter result. Local provenance is
  `local:<kind>:<sha256>` and never contains a filesystem path.
- Confluence staging constructs and validates source, IR, and adapter-result candidates before
  publication, rejects unsafe destinations, and restores the prior artifact set on failure.
  Confluence provenance is `confluence:<page-id>`.
- B0 retains `.incoming-spec.ir.json` as a compatibility/evidence artifact and adds
  `.incoming-spec.adapter-result.json`; B1 consumes only the validated adapter result source.

P17-004 remains `in_progress`. Live Jira/Azure DevOps I/O, credentials, remote provider calls,
provider-bundle connector exposure, and P17-019 installation readiness are not claimed by A2B.

## Architecture and language decision

The domain contract, SpecIR validator, bridge, composer, and transactional staging remain
TypeScript. The shared core owns canonical semantic rules; kit integrations are orchestration
adapters, and generated mirrors are verified byte-for-byte.

Rust, Go, and Python were reconsidered before implementation. None supplies a missing capability
for the bounded offline document grammar or closed bridge. Introducing another language would add
per-platform artifacts, process/FFI protocol handling, dependency and license inventory, SBOM and
signature inputs, and another clean-clone matrix. The final source qualification observed a
100-iteration paired Jira/Azure p95 of `1.080 ms` on Node `v24.15.0`, so the existing TypeScript
reconsideration threshold was not approached.

## Exact source manifest

The source commit changes exactly 29 paths:

1. `.claude/commands/feature-from-confluence.md`
2. `.claude/commands/feature-from-confluence.spec-ir-wiring.test.ts`
3. `.claude/integrations/confluence-b0-intake.test.ts`
4. `.claude/integrations/confluence-b0-intake.ts`
5. `.claude/integrations/core/semantic-spec.ts`
6. `.claude/integrations/core/spec-adapter-spec-ir.ts`
7. `.claude/integrations/core/spec-adapter.ts`
8. `.claude/integrations/core/spec-ir.ts`
9. `.claude/integrations/spec-adapter-compose.test.ts`
10. `.claude/integrations/spec-adapter-compose.ts`
11. `.claude/integrations/spec-intake.cli.test.ts`
12. `.claude/integrations/spec-intake.ts`
13. `.claude/integrations/spec-ir.ts`
14. `docs/design/spec-intake-ir.md`
15. `docs/roadmap/p17-004-a2b-spec-ir-composition-plan.md`
16. `docs/roadmap/post-17-roadmap.md`
17. `docs/schemas/spec-adapter-result.schema.json`
18. `package.json`
19. `packages/core/README.md`
20. `packages/core/src/spec-adapter-azure-devops.ts`
21. `packages/core/src/spec-adapter-jira.ts`
22. `packages/core/src/spec-adapter-spec-ir.ts`
23. `packages/core/src/spec-adapter.ts`
24. `packages/core/src/spec-ir.ts`
25. `packages/core/test/spec-adapter-spec-ir.test.ts`
26. `packages/core/test/spec-adapter.test.ts`
27. `release/public-release-manifest.json`
28. `scripts/build-synced-core.ts`
29. `scripts/post-17-spec-adapter-spec-ir-composition-plan.test.ts`

The committed flagship change required three fail-closed dependency checkpoints:

1. `8803430ffc0a4a8b867a1d7b78235c54783b2bb3` migrates only 24 orchestrator phase ranges.
2. `2d9087b69943fc71a326e4d1b54a1425ce20ce26` refreshes only five generated source-binding fields.
3. `9c4e106f22dd712b09c812b5bd5c6004eb35d8b2` rebinds one phase-capability matrix SHA.

This evidence checkpoint changes only this file and its ordered public-manifest entry.

## RED and failure chain

No failure was relabeled as success:

1. The registered plan validator failed first on missing
   `packages/core/src/spec-adapter-spec-ir.ts`.
2. Bridge, composer, prompt-wiring, and Confluence behavior tests failed before their runtimes
   existed; Confluence also exposed the legacy `raw-us` provenance mismatch.
3. Review attacks proved sparse descriptor and SpecIR arrays could reach indexed getters and that a
   directory destination could produce a path-bearing partial Confluence publication.
4. TypeScript 5.9.3 strict mode then found that an aggregate `.every()` predicate did not narrow the
   four acceptance-criterion fields. Explicit field guards repaired the source without casts.
5. The first full suite found a stable diagnostic regression: the duplicate-criterion error no
   longer contained `duplicate AC id`. The phrase was restored without echoing the caller's ID.
6. The next full suite found B0 budget-safe evidence wording drift. The third artifact prohibition
   was split into an adjacent sentence without relaxing the no-bundle rule.
7. The next full suite proved the inherited A2A `test:spec-adapters` route was immutable. A2B moved
   to independent `test:spec-adapter-composition` routing.
8. The flagship source change invalidated the orchestrator boundary. Canonical refresh refused both
   a dirty source and stale phase anchors, requiring separate semantic and generated checkpoints.
9. The updated boundary invalidated the phase-capability matrix. Its sole source-binding SHA was
   rederived independently and its 15 negative controls reran before commit.

## Contract and attack evidence

The final focused runtime proves:

- 8 provider-neutral adapter contract cases;
- 13 provider behavior cases and 33 closed attacks;
- a pure SpecIR bridge with identity, privacy, and fail-closed cases;
- a single-parse local composer with opaque provenance and closed CLI behavior;
- 23 canonical SpecIR cases, 5 intake CLI cases, 4 B0/B1 wiring cases, and 3 Confluence-source
  staging cases; and
- 22 byte-identical generated core mirrors.

Attack coverage includes descriptor accessor/sparsity/size attacks, configuration conservation,
invalid UTF-8 and JSON, source/hash binding, oversized semantic arrays and cumulative text,
fabricated anchors and quotes, warning/value non-echo, local path secrecy, Confluence destination
type/symlink/partial-publication attacks, rollback restoration, and prompt-injection-as-data cases.

## Review repairs

Structured architecture and code review retained the pure application boundary and requested two
bounded hardening groups:

- pre-bound descriptor and SpecIR collections before indexed access, copy validated values into
  clean frozen objects, and cap paragraphs (256), criteria (256), warnings (64), per-warning text
  (1,024 characters), and cumulative semantic text (128 KiB); and
- make Confluence publication transactional by building all candidates first, preflighting regular
  destinations, backing up prior files on the same filesystem, and restoring/removing the complete
  set on failure.

The resulting review has no unresolved Critical or High finding.

## Qualification receipts

### Focused and related

- A2B plan: PASS with `migration=M1`, `authority=A1`, `bridge=B1`, `confluence=C1`, `local=L1`,
  `staging=S1`, `privacy=P1`, `language=T1`, and `scope=N1`.
- A2A immutable runtime plan: PASS, 13 source paths, 10 decisions, 5 non-claims, and 6 offline
  pattern families.
- Adapter/composition: PASS, 8 contracts, 13 provider cases, 33 attacks, bridge/composer, 23 IR,
  5 CLI, 4 wiring, and 3 Confluence cases.
- TypeScript 5.9.3 exact strict/no-emit graph over 18 runtime/test/builder/validator files: exit `0`.
- Boundary refresh: PASS, 6 attacks; wave-1: PASS, 23 mandatory phases, 1 conditional phase,
  3 providers, and 7 negative controls.
- Phase-capability matrix: PASS, 24 phases, 7 official sources, and 15 negative controls.
- Roadmap: PASS, 22 tasks / 4 initiatives.

### Public and distribution

- Public-source authority before this evidence row: 754 manifest paths, 224 Markdown files, 751
  text files, 48/48 relative links, 4 lockfiles, 754 dependency occurrences, 617 unique
  dependencies, 10 secret-detector families, zero issues, and status `eligible-for-r5c2`.
- Provider distribution: PASS, 3 providers, 2 byte-identical skills, 5 shared runtimes, 3
  deterministic strict-admitted archives, 71 entries, 8 schema-valid/secret-clean sidecars, 11
  checksums, 79 text scans, 15 clean runtime smokes, and 4 attacks.

### Full source-chain qualification

`npm test` exited `0` after `422.015s` on exact qualified dependency HEAD
`9c4e106f22dd712b09c812b5bd5c6004eb35d8b2`. The full run included all public-release,
SBOM/archive/clean-clone, Control Plane, privacy, provider, sync-guard, cross-platform,
browser-runner, version, prompt-budget, and lesson-sync gates. Version authority remained v3.25;
the flagship measured 163,643 bytes and approximately 40,023 tokens under its 172 KB budget.

### Evidence-index qualification

After this evidence document and its ordered manifest entry were staged, the affected gates passed
again: A2B plan/bridge/composer/intake/wiring/Confluence, roadmap 22/4, R6 readiness 1 canonical +
40 attacks, 48/48 internal links, and zero findings across 10 secret-detector families.

Full `npm test` then exited `0` after `415.511s` on that exact two-path draft evidence index. The
in-suite public authority was 755 manifest paths, 225 Markdown files, 752 text files, 4 lockfiles,
754 dependency occurrences / 617 unique dependencies, 10 secret-detector families, zero issues,
and status `eligible-for-r5c2`. The in-suite paired adapter p95 was `1.495 ms` on Node `v24.15.0`;
version authority remained v3.25.

These receipt bytes are admitted only if a subsequent final-byte `npm test` also exits zero. The
durable evidence commit is not created otherwise; its final sentinel is recorded in the workspace
handoff and commit checkpoint to avoid a self-referential document rewrite.

## Privacy and external effects

Durable evidence contains only public contract names, closed reason labels, counts, hashes, commit
identities, and test timings. It contains no raw specification/provider payload, normalized
requirement text, unsupported value, tenant/person data, credential, token, authorization header,
provider response, or local input path.

There was no live provider call, credential read, database write, dashboard mutation, sync, target
`.Codex` edit, branch push, direct-main push, PR mutation, tag, release, publication, visibility
change, or version bump in the source/dependency checkpoints.

## Non-claims and next boundary

A2B does not prove live Jira or Azure DevOps access, credential management, retry/rate-limit
behavior, provider webhooks, remote connector packaging, or plugin installation. The next P17-004
boundary must plan and attack-test live provider I/O and connector exposure without changing the
provider-neutral semantic core or silently widening runtime permissions.
