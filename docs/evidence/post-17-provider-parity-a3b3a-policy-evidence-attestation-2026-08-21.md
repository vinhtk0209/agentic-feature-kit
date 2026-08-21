# P17-007 A3B3A Policy and Evidence Attestation Evidence

Status: locally qualified source checkpoint; zero provider execution.
Date: 2026-08-21
Source commit: `5a48709bcc4289d1d1d3d2687923875e3bf8911a`
Source tree: `7e754fc9b5115ae1d3af1aab15635b1f43270e3c`
Parent: exact qualified `main` `081f5af62cd03d8fbdbc2dd7c484830a25e45963`
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

## Exact source inventory

Source commit `5a48709bcc4289d1d1d3d2687923875e3bf8911a` changes exactly:

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

## Focused and strict qualification

| Gate | Result |
|---|---|
| A3B3A plan validator | PASS — 9 paths, 11 headings, 27 boundary phrases |
| A3B3A runtime attacks | PASS — 57 assertions |
| Performance sentinel | PASS — 10,000 compositions, latest focused wall 2,655.398 ms, p95 0.428 ms, RSS delta 9,908,224 bytes |
| Full-suite A3B3A sentinel | PASS — wall 2,603.753 ms, p95 0.412 ms, RSS delta 9,994,240 bytes |
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

The full public contract first failed as designed with `link-source-invalid` while the new plan was
untracked. After staging exactly the nine declared source paths, the identical gate passed:

- 814 public manifest paths and 247 Markdown files;
- 48/48 valid relative links;
- four lockfiles, 754 dependency occurrences, and 617 unique dependencies;
- 811 text files across ten secret-detector families with zero findings; and
- final status `eligible-for-r5c2`.

`npm.cmd run test:kit` then exited `0` across the unchanged 193 top-level route chain. Provider,
privacy, public-release, sync-guard contract/dry paths, control-plane, cross-platform, version,
workflow-index, prompt-budget, and lessons-sync gates all remained GREEN. Prompt size was 157.6 KB
under the 172 KB ceiling; lessons synchronization was 60/60.

## Backup, rollback, and next gate

The verified daily rollback anchors remained unchanged before implementation:

- archive SHA-256 `08634E703FBE2EB85F4DDDAE899636352A3C6EAADD7EA637E67C31AA7E8825AB`;
- tag `backup/2026-08-21=aa7a5c3453a2158d58b03215c1e5ef945dcb9982`.

Rollback is revert of the evidence commit followed by source commit
`5a48709bcc4289d1d1d3d2687923875e3bf8911a`, or restoration from the verified backup. No external
resource cleanup is required.

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
change occurred in this source qualification.
