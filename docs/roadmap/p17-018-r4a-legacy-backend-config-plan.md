# P17-018 R4A — Legacy Backend Configuration Hardening Plan

**Date:** 2026-08-17
**Task:** P17-018
**Scope lock:** `slice=R4A, config=C1, telemetry=T1, cli=K1, sync=S1, registry=R1, evidence=E1`
**Starting commit:** `88005e5bd14764c2d57bd02a261dcc637307bf02`

## Outcome

Remove the repository-specific Supabase endpoint and JWT-like anonymous credential from every
public-candidate runtime path. Replace those embedded values with one pure, provider-neutral,
injected-map configuration contract while preserving the distinct behavior of optional telemetry,
the legacy workflow CLI, and fail-closed real-sync admission.

R4A reduces a bounded release blocker without claiming that the legacy backend is a hosted public
service, a tenant-safe central writer, or part of the provider-bundle quickstart.

## Reconciled starting state

- `.claude/integrations/telemetry.ts`, `bin/lib/supabase.ts`, and
  `scripts/sync-to-targets.ts` each embed the same live project URL and JWT-like anonymous key.
- A positive-controlled tracked-tree scan finds JWT-like values and the live project URL in exactly
  those three paths. No raw value is copied into this plan, a test diagnostic, or later evidence.
- The public release registry classifies the same project reference in 11 occurrences across ten
  bindings. The three runtime bindings are `genericize`; eight occurrences in historical evidence,
  plans, and synthetic fixtures remain outside R4A.
- The current release authority is contract-valid but intentionally blocked by 31 unresolved
  marker dispositions and 73 classified occurrences.
- Optional telemetry intentionally fails open when its legacy backend is unavailable. The workflow
  CLI requires the backend for login/init/update. Real sync requires a reachable verified-record
  backstop unless a dry-run or explicit reasoned override follows the existing guard contract.
- P17-016 classifies the token RPC and legacy telemetry insert paths as migration-blocked. R4A does
  not convert those writers, invent a tenant, or enable a central sink.
- The initial verified 2026-08-17 backup tag is
  `38888187c4191206dbb81562ccb387463fcbbc76d6`; the worktree ZIP SHA-256 is
  `d175cad9f64b9e02ac4a037151a27adbace3e0d76d6e9eb21ecf56c0844df196`. After the
  date rollover, the verified 2026-08-18 tag resolves to
  `88005e5bd14764c2d57bd02a261dcc637307bf02` and the new worktree ZIP SHA-256 is
  `468184283a30dd995f8513bea6e262d66fe93242ab75c19397c9def1fae812c0`.

## Scope and non-goals

R4A adds a pure shared-core configuration contract and its byte-identical portable mirror; adapts
legacy telemetry, workflow CLI RPC, and sync verification to resolve configuration at the call
boundary; adds hermetic attack tests and public-release checks; updates integration guidance,
package routing, release manifest, and the exact marker registry counts; and records immutable
evidence separately.

R4A does not remediate the other 28 marker bindings, rewrite the Confluence baseline, move historical
evidence to a private archive, genericize target identities or user paths, add link/license/SBOM/
dependency/archive/clean-clone/nightly gates, change a schema or tenant policy, execute a database or
provider, run sync, update the dashboard, touch target repositories, bump a version, create a tag or
release, publish a package/plugin, or change repository/package visibility.

## Locked R4A decisions

### C1 — One pure paired-configuration contract

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are an atomic pair. A missing member, blank value, malformed
URL, URL credentials/query/fragment/non-root path, unsafe scheme, whitespace/control character, or
oversized key fails with a closed reason code whose message never contains either input value.

The URL is normalized to its origin. HTTPS is required except for explicit loopback development
URLs on `localhost`, `127.0.0.1`, or `[::1]`. The key contract accepts bounded printable Supabase
anonymous or publishable credentials without assuming the historical JWT format.

The pure contract imports no environment, process, filesystem, network, or provider SDK. It accepts
an injected string map and returns one immutable configuration object or throws one typed,
value-redacted error. Node adapters alone pass `process.env` and construct request headers.

`packages/core/src/legacy-backend-config.ts` is canonical. The sync-safe
`.claude/integrations/core/legacy-backend-config.ts` mirror remains byte-identical through the
existing atomic synced-core generator and drift gate.

### T1 — Optional telemetry stays local-first and fetch-free when unconfigured

Telemetry resolves configuration only when a command reaches a legacy RPC or insert. Missing or
malformed configuration reaches zero fetch calls. Optional telemetry preserves its existing
fail-open workflow outcome: verify emits one bounded unavailable warning and returns success after a
token is present, feature telemetry is skipped locally, and error reporting still emits its local
sidecar error marker without a remote write.

A configured hermetic test supplies a synthetic loopback URL and synthetic key through environment
variables before the mock fetch is installed. Tests observe only request kind and method; they never
print URL, headers, token, or body. Version-authority and runner/nonce checks still precede network
use.

### K1 — Workflow CLI fails closed before network use

The legacy CLI imports the same pure contract through `bin/lib/supabase.ts`. `rpc()` resolves the
pair at call time and throws the typed, redacted configuration error before fetch. Workflow login,
init, update, and a non-forced real sync remain fail-closed. `status` retains its existing bounded
"verification unavailable" observation and does not claim a valid remote session.

Bundle download keeps only a provider-neutral connection-close constant; it no longer imports a
credential-bearing module-level header object. R4A does not change archive extraction behavior.

### S1 — Real sync admission remains fail-closed

`countVerifiedRuns()` uses the same pure contract after the existing kit `.env` loader has had the
opportunity to populate process state. Missing or invalid configuration throws before fetch; the
admission decision converts that into its existing unreachable-backstop result. A real sync is
denied. Dry-run and an explicit reasoned `--force-unverified` override retain their existing
behavior and never become an implicit third bypass.

Tests inject configuration and fetch dependencies. They prove the configured verified/unverified
paths, the zero-fetch missing/partial/malformed paths, dry-run warning, and explicit override without
running real sync or touching a target.

### R1 — Marker authority changes exactly

The three runtime project-reference bindings are removed from
`release/internal-marker-classification.json` only after the source values are absent. The
live-project marker falls from 11 to eight occurrences and keeps the exact eight deferred bindings.
The other marker IDs and their counts remain byte-for-byte stable.

Release blockers fall from 31 to 28 without suppressing the remaining findings. Total classified
occurrences fall from 73 to 70. A new public-release legacy-backend contract independently asserts
zero JWT-like literals and zero live Supabase project URLs in the three runtime paths, exact registry
delta, shared-core mirror parity, no raw secret diagnostics, and no external side effects.

### E1 — Evidence remains immutable and separate

The source commit contains the locked plan, pure contract/mirror, adapters, tests, documentation,
package routing, manifest, and exact registry delta. A later evidence-only commit records the plan
RED, contract RED, focused/strict/static/full GREEN receipts, exact source/evidence SHAs, blocker
delta, rollback authority, remote CI, and non-claims.

## Threat model and attack matrix

Focused tests reject:

- neither variable, only URL, only key, blank strings, non-string injected values, oversized input,
  control characters, leading/trailing whitespace, and inherited/prototype-only keys;
- HTTP non-loopback, unsupported schemes, username/password, query, fragment, non-root path,
  deceptive loopback suffixes, Unicode host confusion, and invalid ports;
- a key containing spaces, newlines, controls, or a value longer than the bounded contract;
- config errors that echo URL/key values, fetch reached before validation, or module-level config
  capture that ignores per-call injection;
- telemetry missing-config paths that fetch, emit a valid-auth marker, or suppress the required
  local error marker;
- sync missing-config paths that allow a real run, and forced/dry-run paths that unexpectedly touch
  the resolver or fetch;
- reintroduced JWT-like literals, live project URLs, stale registry counts, mirror drift, manifest
  omission, unknown tracked files, CRLF, traversal, or private-value diagnostics.

Every zero-hit claim uses a positive control or independent fixed-string/content-anchored search.
Synthetic values use reserved example or loopback namespaces only.

## TDD and verification ladder

1. Register the R4A plan validator and prove RED only on the missing plan.
2. Add this plan and require the unchanged C1/T1/K1/S1/R1/E1 validator to pass.
3. Add pure shared-core attacks first and prove RED on the missing implementation; implement the
   contract, add it to the atomic mirror, and require unit plus drift tests GREEN.
4. Add the public-release legacy-backend contract and adapter tests before source edits. Prove the
   current tree fails only on the three embedded runtime configurations and old registry authority.
5. Adapt telemetry, workflow CLI RPC/bundle, and sync verification without changing their locked
   availability/admission semantics. Require hermetic zero-fetch and configured-fetch tests GREEN.
6. Update integration guidance, registry, manifest, and package routing. Require exact 70 classified
   occurrences, 28 unresolved blockers, and no JWT-like/live-project literal in the three paths.
7. Run TypeScript 5.9.3 with `strict` and `skipLibCheck=false`, synced-core parity, focused privacy/
   release gates, UTF-8/LF/final-newline/whitespace, JSON/link/English checks, and positive-controlled
   secret/internal-marker scans over the exact source manifest.
8. Run the complete kit on the exact staged candidate, commit through normal hooks, and rerun focused
   plus full gates on the immutable source SHA. Write and separately commit evidence plus its sorted
   manifest entry, then use a retained feature branch, PR, exact-head Linux/Windows/aggregate CI, and
   qualified PR merge under the standing approval.

TypeScript and Node remain the measured implementation choice. This path performs bounded string
validation and low-volume request setup inside existing TypeScript runtimes; Rust, Go, or Python
would add packaging, FFI, process, and cross-platform distribution costs without a measured latency,
memory, concurrency, cryptography, or systems-API benefit.

## Exact source and evidence manifests

The intended source commit is limited to:

- `.claude/integrations/core/legacy-backend-config.ts`
- `.claude/integrations/record-verify.test.ts`
- `.claude/integrations/telemetry.test.ts`
- `.claude/integrations/telemetry.ts`
- `bin/lib/bundle.ts`
- `bin/lib/supabase.ts`
- `bin/lib/supabase.test.ts`
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

The later evidence commit is limited to:

- `docs/evidence/post-17-public-release-r4a-legacy-backend-config-2026-08-18.md`
- `release/public-release-manifest.json`

No generated log, archive, environment file, dashboard file, target path, local config, or private
marker value belongs to either commit.

## Rollback and external-action boundary

Each production edit is a bounded source/configuration change. A validation or test failure that
does not partially mutate a broad operation may be corrected only after exact worktree/index scope
inspection. If an atomic mirror build, bulk manifest update, commit, or other broad operation fails
after partial mutation, restore the affected repository from today's verified snapshot before
retrying; never leave a half-configured runtime.

No database, provider execution, sync, publish, release, tag, visibility, or direct-main push side
effect belongs to R4A local verification. No dashboard or target repository is modified. A retained
feature-branch push, PR, and qualified merge may occur only after immutable local evidence under the
standing approval; the source branch is not deleted.

## Completion boundary

R4A is complete only when the three runtime paths contain no embedded live project URL or JWT-like
credential; one pure paired-config contract and byte-identical portable mirror own validation;
optional telemetry is zero-fetch when unconfigured; workflow CLI and real sync preserve their
closed boundaries; registry/candidate counts are exactly 70/28; focused/full local and exact-head
remote CI evidence pass; the PR is merged; retained refs are read back; and no excluded external
side effect occurred.

R4A does not prove every marker disposition has been remediated, public-release eligibility,
legacy-backend availability for external users, tenant-safe central writing, or any supply-chain,
nightly, clean-clone, version, tag, release, publication, visibility, sync, dashboard, provider, or
target claim.
