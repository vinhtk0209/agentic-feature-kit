# P17-018 R4A — Legacy Backend Configuration Hardening Evidence

**Evidence date:** 2026-08-18
**Decision lock:** `slice=R4A, config=C1, telemetry=T1, cli=K1, sync=S1, registry=R1, evidence=E1`
**Qualified source commit:** `df91c42d05cbb282436d06aaa6321cf7769adab4`
**Source parent:** `88005e5bd14764c2d57bd02a261dcc637307bf02`
**Candidate status:** source-qualified; public-release candidate remains blocked by 28 unresolved marker dispositions

## Outcome

R4A removes the embedded legacy backend endpoint and anonymous credential from the three public
runtime candidates that owned the same fallback:

- `.claude/integrations/telemetry.ts`;
- `bin/lib/supabase.ts`; and
- `scripts/sync-to-targets.ts`.

One pure shared-core resolver now validates an injected `SUPABASE_URL` and
`SUPABASE_ANON_KEY` pair. The Claude runtime consumes a byte-identical portable mirror. Optional
telemetry remains local-first and performs zero fetches when the pair is unavailable. Workflow CLI
RPC and real sync verification remain fail-closed. Existing dry-run and explicit reasoned
`--force-unverified` behavior is unchanged.

The public marker authority moves from 73 classified occurrences and 31 unresolved dispositions to
70 occurrences and 28 unresolved dispositions. The candidate remains intentionally blocked; R4A
does not suppress or relabel the remaining findings.

## Backup and rollback authorities

Work started under the verified 2026-08-17 snapshot and crossed a date boundary. Before any
2026-08-18 source work continued, both repositories received new verified snapshots.

| Repository | 2026-08-18 backup tag | ZIP SHA-256 | Archive checks |
|---|---|---|---|
| `claude-workflow-kit` | `88005e5bd14764c2d57bd02a261dcc637307bf02` | `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0` | 637 entries; no `.git`, `node_modules`, `.next`, `dist`, or `.codegraph` segment |
| `kit-dashboard` | `1c5442a56e127ad5b35a684d47f9c40b787ee9ed` | `4ca35874243a3b0081d7be7f3be9d813d2a16f7ac154aa36bbc803c6b2b3fd70` | 555 entries; same exclusions |

Rollback before the source commit is the kit ZIP or `backup/2026-08-18`. Rollback after the source
commit is a normal revert of `df91c42d05cbb282436d06aaa6321cf7769adab4`. No target repository
received R4A content, so no target rollback is required.

## Architecture and implementation

### Pure paired-configuration core

`packages/core/src/legacy-backend-config.ts` owns the canonical contract and
`.claude/integrations/core/legacy-backend-config.ts` is its byte-identical generated mirror.

The resolver:

- accepts only own data properties, refusing inherited and accessor-backed values without invoking
  getters;
- requires the URL and anonymous key atomically;
- trims nothing silently and rejects blank, padded, non-string, control, Unicode, and oversized
  inputs;
- accepts HTTPS origins and exact HTTP loopback origins only (`localhost`, `127.0.0.1`, `[::1]`);
- rejects URL credentials, paths, queries, fragments, invalid ports, and deceptive loopback names;
- accepts bounded printable non-space ASCII key formats needed by legacy JWT and publishable-key
  deployments;
- returns a frozen value; and
- exposes only closed rule IDs with one value-redacted error message.

The pure source imports no environment, process, filesystem, network, provider SDK, or adapter.

### Adapter boundaries

`bin/lib/supabase.ts` resolves configuration per RPC call and accepts injected env/fetch ports for
hermetic tests. `bin/lib/bundle.ts` retains only a credential-independent connection-close header.

`.claude/integrations/telemetry.ts` resolves configuration at request time. Legacy verify remains
fail-open on backend/configuration failure, but it never claims a valid token. Feature and error
commands report truthful skipped outcomes when no remote write occurs. The deterministic local error
event remains available to the sidecar.

`scripts/sync-to-targets.ts` resolves configuration before its verification fetch. Missing, partial,
or malformed configuration reaches zero fetches. Dry-run converts the closed admission result into
the existing warning; a non-forced real sync remains denied. The explicit reasoned override remains
the only unverified escape.

### Coupled authorities

The implementation also updates:

- `docs/claude-commands/INTEGRATIONS.md` with the runtime pair and asymmetric failure contract;
- `docs/roadmap/p17-016-kit-writer-registry.json` with exact anchors for the two refactored legacy
  adapters, without changing their `legacy_raw` and `migration_blocked` states;
- `release/internal-marker-classification.json` to 70 occurrences and 28 unresolved bindings;
- `release/public-release-manifest.json` to bind the updated registry SHA-256
  `81f39be962e1bb4cfa88952880251ee0a7d86782ebda363275e1b86517b7d432`;
- `scripts/public-release-contract-node.test.ts` to assert the new current-tree authority; and
- the existing record-verify fixture to inject synthetic configuration instead of depending on an
  embedded fallback.

## Exact source scope

The source commit contains exactly 21 paths:

- `.claude/integrations/core/legacy-backend-config.ts`
- `.claude/integrations/record-verify.test.ts`
- `.claude/integrations/telemetry.test.ts`
- `.claude/integrations/telemetry.ts`
- `bin/lib/bundle.ts`
- `bin/lib/supabase.test.ts`
- `bin/lib/supabase.ts`
- `docs/claude-commands/INTEGRATIONS.md`
- `docs/roadmap/p17-016-kit-writer-registry.json`
- `docs/roadmap/p17-018-r4a-legacy-backend-config-plan.md`
- `package.json`
- `packages/core/src/legacy-backend-config.ts`
- `packages/core/test/legacy-backend-config.test.ts`
- `release/internal-marker-classification.json`
- `release/public-release-manifest.json`
- `scripts/build-synced-core.ts`
- `scripts/post-17-public-release-r4a-plan.test.ts`
- `scripts/public-release-contract-node.test.ts`
- `scripts/public-release-legacy-backend-contract.test.ts`
- `scripts/sync-to-targets.ts`
- `scripts/sync-verify-guard.test.ts`

The normal commit hook passed `spec-integrity` over 15 TypeScript files. Authoritative commit
readback proves the sole parent, exact 21-path scope, blob parity `21/21`, canonical stat of 1,274
insertions and 105 deletions, and a clean worktree.

## TDD and failure ledger

Every behavior-changing boundary was tested before implementation or hardening.

| Stage | RED or invalid observation | Correction and accepted result |
|---|---|---|
| Plan readiness | Sandboxed npm and direct tsx launchers failed before loading the validator; neither was product evidence. | The same validator ran outside the broken identity shim, failed only on the missing plan, then passed unchanged with C1/T1/K1/S1/R1/E1 locked. |
| Pure config | The new attack suite failed at module resolution because the canonical resolver did not exist. | Seven groups passed after the pure resolver and byte-identical mirror were added. |
| Public boundary | The first RED assertion printed a credential-like match and was rejected as unsafe evidence. | Boolean-only bounded diagnostics produced a safe four-category RED, then the final public contract passed `7/7`. |
| CLI RPC | Four tests hit a global-fetch tripwire before configuration injection existed. | The env-only RPC adapter passed `4/4` with exact request and zero-fetch refusal behavior. |
| Telemetry | The expanded suite passed 18 and failed four missing/partial/truthful-outcome cases. | The sanitized adapter passed `22/22`; no credential-bearing temporary source remained. |
| Sync guard | Injected dependency tests rejected the fallback/global-fetch path. | Missing, partial, malformed, configured, dry-run, and reasoned-override contracts passed without a real sync. |
| Accessor hardening | An accessor-backed map was accepted and the test reported `Missing expected exception`. | Own data-descriptor reads now refuse accessors with zero getter calls; all C1 and adapter suites remained green. |
| Git-index authority | The first staged scratch exposed the stale `11/73/31` authority test. | The existing Node authority test was added to scope and updated to `8/70/28`. |
| Registry binding | The next staged run failed closed on `marker-registry-digest-mismatch`. | The manifest was rebound to the exact updated registry digest; Node authority passed `7/7`. |
| Full-kit fixture | The first full scratch run failed only because record-verify called the env-only counter without a synthetic pair. | The fixture now injects the pair and fetch double; its complete suite passed. |
| Writer anchors | The second full scratch run reported two exact anchor drifts. | The writer registry now points at the new unique signatures while preserving all privacy dispositions. |
| Audit wrappers | Wrong manifest schema, culture-sensitive sorting, a sentinel-space assumption, path separator comparison, and two PowerShell output-token wrappers were rejected as harness evidence. | Correct schema/ordinal/sentinel/canonical-path/formatted wrappers passed; no product source was weakened to accommodate them. |

The meaningful full-kit scratch receipts are:

| Candidate | Exit | Duration | Lines | Log SHA-256 | Result |
|---|---:|---:|---:|---|---|
| 19-path scratch | 1 | 35.5 s | 175 | `a53252326c60392513717c259b63f2153c8b8ee8414eed1d20aa57dc391d8e10` | Exposed the record-verify fixture dependency |
| 20-path scratch | 1 | 135.0 s | 1,086 | `bd1acf46a8a41ba0aebf5b3fc47dc9b26be99bf4ab5495dedd65a80f1452ce62` | Exposed two writer-anchor drifts |
| 21-path scratch | 0 | 290.3 s | 1,922 | `8f8f426a207751a872e676954ca592b84c687476225521e656e78b186a638383` | Exact staged candidate GREEN |

All scratch dependency trees were physical copies with zero reparse points. Scratch cleanup removed
only the disposable worktree and preserved the real index. External logs remained outside the
repository.

## Verification receipts

### Static and public-safety audit

- exact source scope: `21/21`;
- strict UTF-8, no BOM, LF, final newline, and no trailing whitespace: `21/21`;
- package, writer registry, marker registry, and release manifest: valid JSON;
- release manifest: 603 ordinal-sorted unique source entries before this evidence entry;
- source manifest coverage: all 21 paths are public text includes;
- writer anchors: two exact unique matches, privacy states unchanged;
- synced core: six byte-identical files;
- five positive-controlled detectors: zero candidate hits for JWT-like values, live project URLs,
  private company domains, private email addresses, and local user paths;
- unsafe TypeScript suppression controls: zero;
- package lock: unchanged;
- package/prompt version authority: remains `3.25.0` / v3.25; and
- `git diff --check`: pass.

### Staged-candidate authority

The final scratch and real staged index both proved:

- Node Git-index contract: `7/7`;
- direct candidate: `contractValid=true`, status `blocked`;
- total paths: 603 (`598` include, `5` exclude);
- classified occurrences: 70;
- blockers: 28, all `unresolved-marker-disposition`;
- TypeScript 5.9.3: strict ESNext/Bundler graph, `skipLibCheck=false`, zero diagnostics; and
- exact staged blob parity with zero residual worktree paths.

### Immutable source commit

Exact clean source `df91c42d05cbb282436d06aaa6321cf7769adab4` passed the focused, Node,
direct-index, provider, synced-core, and strict TypeScript matrix. It then completed the entire
`test:kit` chain:

| Gate | Exit | Duration | Lines | Log SHA-256 |
|---|---:|---:|---:|---|
| Immutable source full kit | 0 | 282.7 s | 1,922 | `9f5a2158747c89873aaa427fb2f9b3c5cd1b2d243a1d64100766bdfbdf2a0978` |

HEAD was exact before and after; cached, unstaged, and untracked counts remained zero.

## Language, performance, naming, and version decisions

TypeScript and Node remain the measured implementation choice. This boundary performs bounded
string validation and low-volume request setup inside existing TypeScript runtimes. Rust, Go, or
Python would add packaging and cross-runtime risk without a measured latency, throughput, or API
capability gap.

The name `legacy-backend-config` is deliberate: it describes the quarantined compatibility
boundary without presenting Supabase as the product architecture. Public guidance uses generic
runtime configuration terms while preserving exact environment variable compatibility.

R4A does not bump v3.25. The repository already records post-v3.25 work under `Unreleased`, and the
public candidate still has 28 marker blockers plus later supply-chain, clean-clone, and release
gates. A version decision belongs at the release-readiness gate, not in an incomplete remediation
slice.

## External-effect audit

R4A performed no:

- sync or target `.claude`/`.Codex` write;
- database migration, query, canary row, or provider execution;
- dashboard source/UI mutation;
- direct-main push, feature-branch push, PR, merge, tag, GitHub Release, package publication, or
  visibility change; or
- runtime call using a real backend endpoint or credential.

`kit-dashboard` remained at `1c5442a56e127ad5b35a684d47f9c40b787ee9ed` on
`feature/ISUITE2026-Codex-custom-workflows`. Its pre-existing forbidden untracked local settings
file was visible only through status; its contents were never read, edited, staged, or deleted.

## Completion boundary and remaining work

This evidence qualifies the R4A source behavior and exact source commit. The separate evidence
commit, feature branch, pull request, exact-head Linux/Windows CI, and qualified merge must still
pass before R4A is remotely complete.

R4A does not prove public-release eligibility, tenant-safe central writing, external legacy-backend
availability, or completion of P17-018. Exactly 28 marker dispositions remain unresolved. License,
dependency/SBOM/secret/archive/clean-clone/nightly, version, tag, release, publication, visibility,
sync, dashboard, provider, database, and target gates remain owned by later separately evidenced
slices.
