# P17-007 A3B3B Exact A2 Receipt Composition Evidence

Status: locally qualified; zero provider execution.
Qualification date: 2026-08-22
Qualified source commit: `0c2a3ab6df17e0a295e888a908d3e23cd82696af`
Qualified source tree: `5def96a8fa5a44c9960de3be048507655e53e190`
Qualified parent: exact merged and remotely qualified `main` `19cf96372507cc7ad51324443e70bf729b2ee3c1`
Decision lock: `domain=D1, source=S1, eligibility=E1, mapping=M1, validation=V1, hash=H1, privacy=P1, immutability=I1, runtime=N1, scope=O1`

## Qualified outcome

A3B3B adds one provider-neutral pure composer from a durable, re-admitted A3B3A policy/evidence
attestation to the exact A2 `ProviderParityCandidateReceipt`. It emits a successful `completed`
receipt only after A3B3A re-admission proves every policy, identity, evidence, candidate, cleanup,
and metric invariant and `eligibleForA2Composition` is exactly `true`.

The composer constructs a fresh exact A2 object field by field, derives its canonical A2 receipt
hash with the existing A2 hasher, re-runs the existing exact A2 validator, and returns deeply frozen
metadata. It does not retain or alias the caller's objects and performs no I/O.

Ineligible A3B3A receipts fail closed. This is required because the A2 schema intentionally omits
the A3B3A `satisfied` booleans: mapping a false AC or artifact decision would otherwise fabricate
coverage. Infrastructure `needs_input` and `failed` receipt production remains outside this slice.

## Exact semantic mapping

- A2 schema/provider/run identity maps from locked constants and the admitted A3B3A identity.
- Execution becomes `{ state: "completed", reasonCodes: [] }` only after eligibility succeeds.
- Fixture/spec/prompt/seed/phase, runner/CLI/model/effort, source/time/budget, and attempt identity map
  from the admitted A3B3A identity.
- Adapter capability, runtime entitlement, execution policy, and authorization hashes map from the
  re-admitted policy receipt.
- A2 `identity.materializedTreeSha256` maps to
  `candidateVerification.candidateTreeSha256`, not A3B3A `identity.materializedTreeSha256`. The A2
  field represents the independently verified final candidate tree; the A3B2A identity represents
  pre-run materialization and cleanup scope.
- AC, artifact, gate, API conservation, and trusted-verification rows retain their own exact evidence
  identities. No aggregate hash is copied across unrelated rows.
- The five candidate violations plus derived `cleanupFailed` map to the six A2 violation flags.
- Nullable duration, token, pricing, price-basis, and cost fields map from provenance-validated
  A3B3A metrics. A3B3A-only policy-mode/provenance fields are intentionally absent from A2.

## Evidence-first control

The accepted plan, eleven-path source ceiling, plan validator, package/full-suite route,
roadmap/design anchors, and sorted public-manifest rows were registered before the production
composer. Package and manifest JSON parsing plus `git diff --check` were clean.

Two managed-sandbox attempts did not reach the contract because Node/tsx failed while resolving
Windows `os.userInfo()` with `uv_os_get_passwd ENOMEM`; they are recorded as invalid launcher
results, not product evidence. The identical native route outside that boundary exited `1` exactly
at:

`source manifest path missing: .claude/integrations/provider-parity-receipt-composer.test.ts`

That missing-module RED proves the contract gate preceded the runtime and attack test.

## Test-oracle corrections

Two focused failures corrected the attack oracle without relaxing or changing production behavior:

1. CommonJS can silently ignore a write to a frozen object instead of always raising `TypeError`, so
   the immutability attack now proves that the value remains unchanged; and
2. the first privacy-field expression matched the legitimate metadata field `taskPromptSha256`, so
   it was narrowed to content-bearing prompt/source/response/transcript/path/error fields.

The production composer was unchanged across both corrections and then passed the same focused gate.

## Architecture and structured review

The `engineering:code-review` review verdict is **Approve**. It found no eligibility bypass,
tree/hash misrouting, mutable alias, raw-content leak, unbounded loop, or I/O capability. Review
hardening added static attacks proving that:

- the production composer imports no filesystem, process, network, environment, or clock capability;
- A3B3A-only provenance and policy-mode fields do not leak into the exact A2 output;
- every durable hash/identity/privacy substitution is rejected by A3B3A re-admission;
- direct arbitrary A2 input with a recomputed but contradictory hash remains rejected; and
- caller mutation and consumer mutation cannot alter the admitted output.

The module intentionally does not orchestrate A3B2A, A3B2B, or A3B3A. Those boundaries retain
materialization/cleanup, candidate/trusted-test verification, and policy/evidence admission
ownership respectively; A2 remains the semantic owner of evaluation.

## Exact source inventory

Source commit `0c2a3ab6df17e0a295e888a908d3e23cd82696af` changes exactly:

1. `.claude/integrations/provider-parity-receipt-composer.test.ts`
2. `.claude/integrations/provider-parity-receipt-composer.ts`
3. `docs/design/multi-provider-backends.md`
4. `docs/roadmap/p17-007-a3b3b-a2-receipt-composition-plan.md`
5. `docs/roadmap/post-17-roadmap.md`
6. `package.json`
7. `packages/core/src/provider-parity-evaluator.ts`
8. `release/public-release-manifest.json`
9. `scripts/post-17-provider-parity-attestation-plan.test.ts`
10. `scripts/post-17-provider-parity-candidate-verifier-plan.test.ts`
11. `scripts/post-17-provider-parity-receipt-composition-plan.test.ts`

The source diff is `714` insertions and `5` deletions. Commit hooks remained enabled;
`spec-integrity` passed over six TypeScript paths and zero feature folders.

## Focused and strict qualification

| Gate | Result |
|---|---|
| A3B3A prerequisite | PASS — 60 assertions / 10,000 compositions |
| A3B3B plan validator | PASS — 11 paths, 11 headings, 21 boundary phrases |
| A3B3B composer attacks | PASS — 36 assertions |
| Performance sentinel | PASS — 10,000 compositions; wall 4,996.946 ms, p95 0.861 ms, RSS delta 10,448,896 bytes |
| Full-suite A3B3B sentinel | PASS — 36 assertions / 10,000 compositions; wall 4,442.512 ms, p95 0.626 ms, RSS delta 10,027,008 bytes |
| Strict TypeScript | PASS — TypeScript 5.9.3 / Node 20 types, zero diagnostics over the exact A2/A3B3A/A3B3B graph |

The TypeScript/Node implementation remains well below the locked N1 threshold of p95 50 ms and
64 MiB RSS delta for 10,000 compositions. Rust, Go, or Python would add serialization, packaging,
SBOM, signing, and platform surface without a measured capability or performance need.

## Compatibility qualification

- A2 evaluator PASS: 10,000 admitted receipts; local p95 1.063 ms and embedded full-suite p95
  0.387 ms.
- A3B2A lifecycle `9/9` PASS with 100 cycles and zero residue.
- A3B2B verifier `12/12` PASS with 100 bounded verification cycles.
- A3B3A attestation PASS: 60 assertions / 10,000 compositions.
- Post-17 roadmap PASS: 22 tasks and four initiatives.
- Provider bundles PASS: three providers, two byte-identical skills, five shared runtimes.
- Provider distribution PASS: 71 entries and 15 clean runtime smokes.
- Cross-platform release `11/11` PASS.
- Privacy policy PASS: eight families, ten contract groups, 15 attack groups.

All provider-related checks above use synthetic/fake/local boundaries only. Real provider/model and
external process call counts remain zero.

## Public-source and complete-suite qualification

The complete public contract first failed as designed with `link-source-invalid` while the new plan
was untracked. After staging exactly the eleven declared source paths, the identical gate passed:

- status `eligible-for-r5c2`;
- 819 public manifest paths and 249 Markdown files;
- 48/48 valid relative links;
- four lockfiles, 754 dependency occurrences, and 617 unique dependencies; and
- 816 text files across ten secret-detector families with zero findings.

After adding this evidence file and its one sorted manifest row, the exact two-path staged evidence
candidate was requalified at 820 public manifest paths, 250 Markdown files, and 817 text files. It
retained 48/48 links, four lockfiles, 754 dependency occurrences, 617 unique dependencies, ten
secret-detector families, zero findings, and status `eligible-for-r5c2`.

`npm.cmd run test:kit` then exited `0` across all 193 unique top-level commands. Provider,
lifecycle/verifier, public source, privacy, control-plane, sync guard/rollback/report contract,
cross-platform, version, workflow-index, prompt-budget, and lessons-sync routes remained GREEN.
Version remained `v3.25`; prompt size remained 157.6 KB under the 172 KB ceiling; lessons remained
60/60. No real sync or provider execution occurred; sync coverage used contract, dry-run, and
fetch-tripwire boundaries.

The exact evidence-candidate full-suite sentinels were: A2 10,000 admitted receipts at p95
`0.438 ms`; A3B3A 60 assertions / 10,000 compositions (`2,528.458 ms` wall, p95 `0.390 ms`, RSS
delta `10,211,328` bytes); and A3B3B 36 assertions / 10,000 compositions (`4,501.441 ms` wall,
p95 `0.652 ms`, RSS delta `10,493,952` bytes).

## Backup, rollback, and next gate

The verified rollback anchors are:

- archive `_backups/claude-workflow-kit/2026-08-22/claude-workflow-kit-2026-08-22.zip`,
  `3,508,408` bytes, SHA-256
  `2642CB6CD9371D4949194FCFA023BD7403CC657C741EE3E9EF86C71B1D29B65C`, with `854` entries and
  zero excluded path segments; and
- tag `backup/2026-08-22=3514d53c6d1a0c14a2f87b3fad23c426ffae52a6`.

Rollback is normal revert of the evidence-only commit followed by source commit
`0c2a3ab6df17e0a295e888a908d3e23cd82696af`, or restore from the verified backup. The pure composer
owns no resource and requires no external cleanup.

The next gate is evidence-only commit qualification, then a retained feature branch, Draft PR,
exact-head Linux/Windows/aggregate and digest-bound artifacts, no-conflict review, normal PR merge,
and exact-main qualification. A4 remains prohibited until provider-specific trusted producers prove
executable/version/flags, entitlement, authorization, cost policy, managed-policy/hooks, isolated
execution, evidence capture, zero-residue cleanup, and an approved evidence sink for Codex, Claude,
and Copilot.

## Non-claims

This evidence does not claim that any provider is installed, authenticated, entitled, authorized,
model-ready, executed, policy-safe, hook-safe, cleaned, equivalent, or ranked. It does not claim a
real A2 candidate receipt exists, A3/A4 is complete, evidence is persisted, or P17-007 is done.

No provider/model/process execution, credential/session access, package install, real sync,
dashboard/database/target mutation, target `.Codex` edit, direct-main push, force, tag, release,
publication, or visibility change occurred in this qualification.
