# P17-007 A3B3A Policy and Evidence Attestation Evidence

Status: locally requalified after pre-merge review; zero provider execution.
Initial qualification date: 2026-08-21
Review-repair qualification date: 2026-08-22
Final qualified source commit: `ab34c0ea34c8c04038a29e2a34c634b9aabab0ad`
Final qualified source tree: `e88c9fbe42cafc44e78b7a3409c0befb64765b52`
Review-repair parent: initial evidence commit `3514d53c6d1a0c14a2f87b3fad23c426ffae52a6`
Original source commit: `5a48709bcc4289d1d1d3d2687923875e3bf8911a`
Original parent: exact qualified `main` `081f5af62cd03d8fbdbc2dd7c484830a25e45963`
Decision lock: `domain=D1, identity=I1, policy=P1, hooks=H1, evidence=E1, metrics=M1, verification=V1, cleanup=C1, privacy=R1, runtime=N1, scope=O1`

## Qualified outcome

A3B3A adds a pure provider-neutral trust boundary with two content-addressed records:

1. a pre-run policy attestation binding exact provider/run identity, execution policy, adapter
   capability, runtime entitlement, authorization, and distinct environment/filesystem/network/
   settings/managed-policy/hook evidence; and
2. a post-run evidence attestation binding the admitted policy, exact A1/A2 identity, ordered
   AC/artifact/gate/API decisions, A3B2B candidate verification, A3B2A cleanup outcome, and nullable
   metric provenance.

The durable receipt retains the complete metadata-only policy fields and a closed candidate summary
needed by later A3B3B. It exposes no source bytes, prompt, diff, transcript, provider response,
credential, session, environment value, username, absolute path, or exception text. Both creation and
durable re-admission are exact-key, canonical-hash, fail-closed, and deeply immutable.

This qualification does not execute or discover a provider/model/CLI, inspect settings or hooks,
read environment/filesystem/network state, access credentials, persist a receipt, emit an A2
candidate receipt, call a dashboard/database/target, edit target `.Codex`, sync, publish, or release.

## Evidence-first control

The plan, ADR, validator, nine-path source ceiling, package/full-suite route, roadmap/design anchors,
and public-manifest rows were registered before the production module. The first native plan-validator
run exited `1` at exactly:

`source manifest path missing: .claude/integrations/provider-parity-attestation.test.ts`

That RED proves the contract gate existed before the runtime/test implementation. Package and
manifest JSON parsing plus `git diff --check` were clean at registration.

## Architecture and self-review findings

Read-only predecessor tracing rejected a direct A2 receipt composer. A3B2B deliberately allows an
optional `docs/plan.md` and exposes aggregate verification metadata, while A2 requires independent
plan/implementation/test/trusted-verification evidence plus AC/gate/API proof. Reusing the aggregate
hash for every row would fabricate absent evidence. A3A also does not establish runtime entitlement,
authorization, managed policy, hooks, phase conservation, metrics provenance, or cleanup.

The accepted architecture therefore separates trusted evidence production, pure A3B3A attestation,
and later A3B3B A2 composition. Self-review additionally enforced:

- candidate tree equals post-test tree and mutation matches pre/post identity;
- passed/not-run/failed trusted-test states match process count, exit, and terminal flags;
- candidate file and byte ceilings remain exact;
- durable re-admission rechecks policy hash, exact identity, distinct evidence rows, candidate reason
  derivation, cleanup state, metrics, eligibility, and evidence hash; and
- full policy metadata plus trusted-test/violation/reason summary remains available to A3B3B without
  retaining raw candidate content.

Pre-merge review on 2026-08-22 found two correctness gaps in that initial qualification. Neither
gap could make a candidate eligible, but both weakened the fail-closed contract and contradicted the
durable evidence wording:

1. a lexically valid UTC timestamp containing an impossible calendar date reached
   `Date.prototype.toISOString()` and raised a raw `RangeError` instead of the requested closed
   `ProviderParityAttestationError` code; and
2. `trustedTest.status=failed` with one process call, zero exit, and every terminal failure flag false
   was structurally admitted even though it contained no genuine failure signal.

The retained attack tests produced two independent REDs after the plan guard passed `9` paths / `11`
headings / `27` phrases: the first received `RangeError: Invalid time value` instead of
`invalid-policy`; the second reported `Missing expected exception` for the false failed candidate.
The repair maps impossible calendar values to the requested closed error code and requires a nonzero
exit, timeout, output cap, signal, stderr, or process failure for a failed trusted test. A positive
nonzero-exit failed receipt remains admitted and non-eligible.

## Exact source inventory

Original source commit `5a48709bcc4289d1d1d3d2687923875e3bf8911a` changes exactly:

1. `.claude/integrations/provider-parity-attestation.test.ts`
2. `.claude/integrations/provider-parity-attestation.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b3a-policy-evidence-attestation-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `release/public-release-manifest.json`
8. `scripts/post-17-provider-parity-attestation-plan.test.ts`
9. `scripts/post-17-provider-parity-candidate-verifier-plan.test.ts`

The staged source diff was `1,341` insertions and `4` deletions. Commit hooks remained enabled;
`spec-integrity` passed for four TypeScript paths and zero feature folders.

Review-repair source commit `ab34c0ea34c8c04038a29e2a34c634b9aabab0ad` changes exactly the
attestation runtime and attack test (items 1 and 2 above): `33` insertions and `2` deletions. Commit
hooks remained enabled; `spec-integrity` passed for two TypeScript paths and zero feature folders.

## Focused and strict qualification

| Gate | Result |
|---|---|
| A3B3A plan validator | PASS — 9 paths, 11 headings, 27 boundary phrases |
| A3B3A runtime attacks | PASS — 60 assertions, including both review attacks and the genuine-failure positive case |
| Performance sentinel | PASS — 10,000 compositions, latest focused wall 3,085.488 ms, p95 0.594 ms, RSS delta 10,272,768 bytes |
| Full-suite A3B3A sentinel | PASS — 60 assertions / 10,000 compositions, wall 3,115.834 ms, p95 0.544 ms, RSS delta 10,158,080 bytes |
| Strict TypeScript | PASS — TypeScript 5.9.3 / Node 20 types, zero diagnostics |

The repository-local TypeScript is 4.9.5 while the pre-existing local Node types are 26.1.0; that
compiler cannot parse those definitions before reaching A3B3A. No dependency was changed or
installed. The existing dashboard TypeScript 5.9.3 and Node 20 types were used read-only for the
strict source/test gate.

## Compatibility qualification

- A2 evaluator PASS: 10,000 admitted receipts, p95 1.336 ms.
- A3A Claude adapter `13/13` PASS; A3B1 Node process port `12/12` PASS.
- A3B2A lifecycle `9/9` PASS with 100 cycles and zero residue.
- A3B2B verifier `12/12` PASS with one fixed trusted Node test per admitted candidate.
- Post-17 roadmap PASS: 22 tasks and four initiatives.
- Provider bundles PASS: three providers, two byte-identical skills, five shared runtimes.
- Provider distribution PASS: 71 entries and 15 clean runtime smokes.
- Cross-platform release `11/11` PASS.
- Privacy-policy neighbor PASS: eight families, ten contract groups, 15 attack groups.

Every provider-related qualification above used synthetic/fake/local trusted-test boundaries only;
real provider/model call count remained zero.

## Public-source and complete-suite qualification

The original full public contract first failed as designed with `link-source-invalid` while the new
plan was untracked. After staging exactly the nine declared source paths, the identical gate passed
with 814 manifest paths, 247 Markdown files, and 811 text files. The Git-index-aware gate on the
review-repaired source then passed with:

- 815 public manifest paths and 248 Markdown files;
- 48/48 valid relative links;
- four lockfiles, 754 dependency occurrences, and 617 unique dependencies;
- 812 text files across ten secret-detector families with zero findings; and
- final status `eligible-for-r5c2`.

`npm.cmd run test:kit` then exited `0` across the unchanged 193 top-level route chain. Provider,
privacy, public-release, sync-guard contract/dry paths, control-plane, cross-platform, version,
workflow-index, prompt-budget, and lessons-sync gates all remained GREEN. Prompt size was 157.6 KB
under the 172 KB ceiling; lessons synchronization was 60/60.

## Backup, rollback, and next gate

The verified daily rollback anchors for the review repair are:

- archive `_backups/claude-workflow-kit/2026-08-22/claude-workflow-kit-2026-08-22.zip`,
  `3,508,408` bytes, SHA-256
  `2642CB6CD9371D4949194FCFA023BD7403CC657C741EE3E9EF86C71B1D29B65C`, with `854` entries and
  zero excluded path segments; and
- tag `backup/2026-08-22=3514d53c6d1a0c14a2f87b3fad23c426ffae52a6`.

Rollback is revert of the evidence-only review commit followed by source repair
`ab34c0ea34c8c04038a29e2a34c634b9aabab0ad`; complete A3B3A rollback then reverts initial evidence
`3514d53c6d1a0c14a2f87b3fad23c426ffae52a6` and original source
`5a48709bcc4289d1d1d3d2687923875e3bf8911a`, or restores the verified backup. No external resource
cleanup is required.

A3B3B may next compose the exact A2 receipt only from an admitted A3B3A receipt and must prove schema
compatibility with the existing A2 validator. A4 remains prohibited until trusted provider-specific
producers establish executable/version/flag identity, runtime entitlement, authorization, cost
policy, managed-policy/hook enforcement, isolated execution, evidence capture, cleanup, and an
approved evidence sink for Codex, Claude, and Copilot.

## Non-claims

This evidence does not claim that any provider is installed, authenticated, entitled, authorized,
model-ready, executed, policy-safe, hook-safe, cleaned, equivalent, or ranked. It does not claim an
A2 candidate receipt exists, A3 is complete, P17-007 is done, or external publication is eligible.

No provider/model/process execution, credential/session access, package install, real sync,
dashboard/database/target mutation, direct-main push, force, tag, release, publication, or visibility
change occurred in this source or review-repair qualification. Workflow run `32548516022` is bound
to the pre-repair head and therefore cannot qualify the repaired branch.
