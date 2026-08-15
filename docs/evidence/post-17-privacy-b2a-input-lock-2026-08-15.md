# P17-016 Wave B2A input-lock evidence — 2026-08-15

## Outcome

PASS for the approved B2A planning/contract checkpoint. The trusted runtime-context, run-identity,
legacy-RPC quarantine, eligible-writer cutover, pre-Wave-C sink, local receipt, and evidence inputs
are locked as Accepted `T1/R1/X1/C1/S1/L1/E1`.

P17-016 remains `in_progress`. No production writer was changed, no writer is claimed converted,
and no central persistence capability was created.

## Authorization and boundary

The operator supplied:

`APPROVE P17-016 WAVE B2A INPUT-LOCK v1: tenant=T1, run=R1, rpc=X1, cutover=C1, sink=S1, legacy=L1, evidence=E1`

Authorized files are limited to the Accepted decision artifact, fail-closed validator,
package/full-suite registration, B1 next-slice cross-reference, and this evidence file. Production
writer code, dashboard code, migrations, live/external data, browser/provider calls, sync, push,
and target `.Codex` edits are outside scope.

## Backup and starting state

The existing daily snapshots were verified before the first kit edit:

| Repository | Bytes | SHA-256 | Entries | Forbidden path hits |
|---|---:|---|---:|---:|
| claude-workflow-kit | 20,291,659 | `9F1D633152C7AEE9416A6A90B3AB22E82F2E4D6E3F2AED525687267E5CFA7655` | 494 | 0 |
| kit-dashboard | 5,495,854 | `250F66A557078FEB60B9FEE67CF72882D251853DD34C13F74650F21D1FA003D4` | 474 | 0 |

The forbidden-segment check covered `.git`, `.codegraph`, `node_modules`, `.next`, and `dist` at
any archive depth. Both worktrees were clean. The kit rollback tag `backup/2026-08-15` points to
`faa10e29c77ea00127f33e6d917f9288e2bc6bcc`; the dashboard tag points to
`f61c25043ff2e334ef03b017e301e1d99ed21f2e`.

## Decision result

- T1 accepts only server-attested tenant context derived from authenticated subject/enrollment and
  blocks every central attempt before v2 attestation exists.
- R1 creates one caller-owned UUID at the command boundary and passes it unchanged.
- X1 keeps `verify_kit_token` authentication-only; it cannot attest tenant, consent, or sink access.
- C1 makes only `kit.sync.install-report`, `kit.telemetry.central-upsert`, and
  `kit.verification.record` eligible for a later separately approved B2 adapter cutover.
- `kit.bin.platform-rpc`, `kit.telemetry.central-insert`, and `kit.telemetry.token-rpc` remain
  `migration_blocked` with their exact registry rationale codes.
- S1 returns `central_sink_unavailable` until separately approved and proven Wave C tenant
  schema/RLS supplies an explicit sink capability.
- L1 permits only a closed local receipt and prohibits raw content, paths, repository/feature names,
  prompts, arguments, logs, URLs, tokens, secrets, and raw tenant/subject identity.
- E1 requires focused, companion, full-regression, diff, and positive-control credential evidence.

## RED and correction history

1. Direct `npx tsx scripts/post-17-privacy-b2a-input-lock.test.ts` exited `1` before the decision
   existed with `missing accepted P17-016 Wave B2A input-lock decision artifact`. This is the
   authoritative fail-closed negative control.
2. The first post-ADR run exited `1` because the normative lowercase phrase
   `migration-blocked entries cannot be claimed converted` was not byte-present. The ADR wording
   was normalized; no assertion or registry disposition was weakened.
3. The second post-ADR run exited `1` because the honest negative sentence `No production writer is
   converted` matched the forbidden affirmative grammar. It was rewritten to `No production
   writer conversion occurs`; the anti-completion regex remained unchanged.

## Focused and companion evidence

All commands exited `0`:

| Command | Result |
|---|---|
| `npm run test:post-17-privacy-b2a-input-lock` | PASS — all seven accepted decisions, six exact B2 registry entries, plan/package/roadmap/non-claim contracts |
| `npm run test:post-17-privacy-decision` | PASS — 17 sections, five data classes |
| `npm run test:post-17-privacy-implementation-plan` | PASS — 25 sections, six waves |
| `npm run test:post-17-privacy-writer-plan` | PASS — 21 sections, five refinements, no-I/O B1 boundary |
| `npm run test:post-17-kit-writer-registry` | PASS — seven entries, five source files, eight attacks |
| `npm run test:privacy-policy` | PASS — eight families, ten contract groups, 15 attack groups |
| `npm run test:privacy-writer` | PASS — four contract groups, seven attack groups, eight families |
| `npm run test:post-17-roadmap` | PASS — 22 tasks, four initiatives |
| `npm run test:synced-core` | PASS — four fail-closed/atomic/drift/extra-file assertions |
| `npm run check:synced-core` | PASS — four byte-identical files |

Before the full run, `git diff --check` exited `0`, the kit had exactly the four pre-evidence B2A
paths, and the dashboard worktree remained clean.

## Full regression

`npm run test:kit` exited `0` in 293.5 seconds. The main chain executed the new B2A validator and
retained all prior gates, including deterministic provider distribution, cross-platform release,
worktree/browser boundary, Playwright runner, version/index consistency, prompt budget
`162,860/176,128` bytes, four byte-identical shared-core files, and `60/60` lesson annotations.

## Final review

The first exact staged review contains five files: this evidence, the B2A decision, the B1 plan
cross-reference, `package.json`, and the focused validator. `git diff --cached --check` exits `0`.
A closed five-pattern credential detector proves each pattern against a synthetic in-memory positive
control and reports zero hits across the staged blobs. The dashboard worktree is clean, and the
staged set contains no production writer, shared runtime, dashboard, migration, target, or generated
mirror file.

After the first evidence update, the exact gate was repeated with 5 staged and 0 unstaged paths,
480 insertions and 3 deletions, cached whitespace exit `0`, all five positive controls passing, and
zero credential hits. After recording that result, this evidence file was restaged and the same
immutable exact-set, cached-diff, status, and credential gate passed again before the local commit.

## Rollback and non-claims

Rollback is the verified 2026-08-15 snapshot/tag or one local commit revert. B2A made no database,
browser, provider, remote, generated-mirror, dashboard, target, or sync state. It does not authorize
the later B2 adapter implementation, v2 attestation, local receipt storage, Wave C schema/RLS,
migration-blocked writer conversion, push, merge, or publication.
