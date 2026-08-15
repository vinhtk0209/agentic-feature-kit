# P17-016 Wave B2C: Run-version writer adapter plan

**Status:** Approved — implementation authorized; completion unproven
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent decision:** P17-016 Wave B2A `T1/R1/X1/C1/S1/L1/E1`
**Previous slice:** P17-016 Wave B2B verification adapter
**Authority:** The user-provided durable goal grants every required permission except push.
**Locked scope:** `writer=U1, core=C1, auth=X1, marker=M1, context=A1, run=R1, receipt=L1, sink=S1, docs=D1, evidence=E1`

## Outcome

Wave B2C removes the legacy `repo_runs` REST mutation reachable from
`kit.telemetry.central-upsert` and replaces that one writer with a fail-closed, in-process adapter.
The adapter cannot construct a central record or find a sink because trusted v2 tenant attestation
and the Wave C sink do not exist. A valid legacy token remains an authentication result only.

The command emits one exact local L1 compatibility receipt for the blocked run-version attempt.
It does not persist the receipt. `kit.sync.install-report` stays `adapter_planned`; the generic raw
telemetry insert and token RPC entries stay `migration_blocked`. P17-016 remains `in_progress`.

## Decisions

### U1 — One writer only

The only behavior cut over in B2C is `kit.telemetry.central-upsert`, specifically the
`repo_runs` mutation invoked after a successful `telemetry verify` authentication result.
`kit.sync.install-report`, `kit.telemetry.central-insert`, `kit.telemetry.token-rpc`, and
`kit.bin.platform-rpc` are outside this cutover.

### C1 — Shared pure compatibility core

UUID validation, command-boundary UUID creation, exact receipt-key validation, canonical timestamp
validation, frozen output, and non-echo refusal errors belong in a writer-neutral pure core. The
existing verification adapter becomes a compatibility-preserving thin wrapper over that core. Its
exported function names, writer ID, exact receipt shape, and observed behavior remain unchanged.

The new run-version adapter is a second thin wrapper with writer ID
`kit.telemetry.central-upsert`. This extraction prevents two security-sensitive adapters from
carrying forked copies of the same validation logic and prepares the later install writer without
prematurely cutting it over.

### X1 — Legacy RPC remains auth-only

`verify_kit_token` behavior is not redesigned in this wave. Valid, invalid, quota, missing-token,
and infrastructure-failure results retain their existing command exit semantics. The RPC result,
including owner or quota data, is never supplied to the run-version adapter and never treated as
tenant context, processing consent, or sink capability.

### M1 — Existing kit-event marker is conserved

The successful verify path continues to emit the existing `@@KIT_EVENT@@` meta event with the
canonical kit version, runner, and optional run nonce. B2C does not rename, repurpose, or add fields
to that marker. The privacy receipt is a separate `@@PRIVACY_RECEIPT@@` line.

### A1 — Current tenant context is unavailable

The run-version adapter accepts no environment, configuration, repository, token, RPC response,
or CLI tenant input. The current state is always `unavailable`; the adapter blocks before central
record construction with `tenant_attestation_unavailable`.

### R1 — One verify-command UUID

The `verify` CLI case creates one UUID at its command boundary and passes it unchanged to the
run-version adapter. The low-level adapter validates only and never creates a missing identity.
`KIT_RUN_ID`, `KIT_EVENT_NONCE`, repository names, timestamps, tokens, and payload hashes are not
run-ID authorities. Test-only pure functions may accept an explicit UUID and injected generator so
generation count and preservation are deterministic.

### L1 — Exact closed in-process receipt

The blocked receipt contains exactly `schemaVersion`, `policyVersion`, `writerId`, `runId`,
`tenantContextStatus`, `outcome`, `reasonCode`, and `createdAt`. It is frozen, canonical, and emits
once on the valid-auth writer-attempt path. It contains no repository, owner, token, kit version,
tenant, subject, feature, path, prompt, argument, log, URL, error text, or sink data. No receipt file
or durable store is created.

### S1 — No central sink or fallback

The successful verify path performs the legacy authentication RPC and then stops the run-version
writer at the adapter. It sends zero requests to `/rest/v1/repo_runs`, does not call a generic
upsert helper, and does not fall back to `installs`, `usage_logs`, another REST table, a service-role
client, or a local raw spool. Central sink capability remains blocked until Wave C.

### D1 — Public truth documentation

The kit README and measurement-layer design must stop claiming that successful verify currently
upserts `repo_runs`. The sync source comment must describe the paused tenant-safe run-version side
of the comparison without changing sync behavior. Historical prompt-evolution entries remain
historical. No dashboard code or browser proof is required because no dashboard route, component,
query, or schema changes; existing rows are historical and expose their own timestamps.

### E1 — Evidence ladder

Evidence progresses from plan validation and RED controls to pure-unit, CLI-mock, compatibility,
registry, type, companion, full-suite, exact-diff, whitespace, and credential gates. Final evidence
must identify every intentionally unchanged legacy path and must not claim central persistence.

## Clean architecture boundaries

| Layer | Responsibility | Forbidden dependency |
|---|---|---|
| Shared compatibility core | UUID/time/exact-key validation and closed receipt construction | environment, filesystem, process, network, repository, RPC, sink |
| Verification adapter | Preserve B2B API and bind `kit.verification.record` | telemetry or run-version behavior |
| Run-version adapter | Bind `kit.telemetry.central-upsert` to the shared core | raw repository/version/auth payload or network |
| Telemetry CLI | Own command UUID, legacy auth, marker and receipt emission | tenant invention or central run-version fallback |
| Legacy telemetry insert/RPC | Remain explicit migration-blocked compatibility paths | conversion claims from adjacent adapter work |

Dependencies point inward: telemetry may import the run-version adapter; both thin adapters may
import the pure core; the pure core imports only policy/schema constants and `node:crypto` for the
default command-boundary generator.

## Runtime sequence

1. CLI dispatch recognizes `verify` and creates one command UUID.
2. Existing token lookup and `verify_kit_token` authentication execute unchanged.
3. Missing, invalid, quota, or infrastructure auth outcomes return with existing semantics and do
   not attempt the run-version writer.
4. Valid auth emits the existing meta event unchanged.
5. Telemetry calls the run-version adapter with only the command UUID and a canonical clock value.
6. The adapter returns `blocked/tenant_attestation_unavailable` as one exact frozen receipt.
7. Telemetry emits one `@@PRIVACY_RECEIPT@@` line and returns the existing success exit code.
8. No `repo_runs` or substitute central mutation occurs.

## Implementation manifest

### Plan and contracts

- add this plan and `scripts/post-17-privacy-b2c-run-version-plan.test.ts`;
- register the plan validator in `package.json` and the full kit chain;
- update the writer registry, discovery attacks, B2A compatibility assertions, and B1 next-slice
  truth only after source behavior proves the transition;
- write `docs/evidence/post-17-privacy-b2c-run-version-adapter-2026-08-15.md`.

### Pure core and adapters

- add canonical `packages/core/src/blocked-central-writer.ts`, its focused test under
  `packages/core/test`, and its generated byte-identical `.claude/integrations/core` mirror;
- refactor `.claude/integrations/verification-writer-adapter.ts` into a behavior-preserving wrapper;
- retain and rerun every verification adapter and B2B integration attack;
- add `.claude/integrations/run-version-writer-adapter.ts` and its focused test.

### Telemetry integration

- update `.claude/integrations/telemetry.ts` only at command UUID ownership and the `repo_runs`
  writer branch;
- update the existing telemetry mock harness to expose safe endpoint/method observations without
  token, authorization header, or request body output;
- extend telemetry CLI tests with exact fetch cardinality, marker, receipt, spoof, and legacy-path
  assertions.

### Truth documentation

- update `README.md`, `docs/design/measurement-layer-v1.md`, and the version-comparison comment in
  `scripts/sync-to-targets.ts`;
- do not edit the flagship command, generated orchestrator boundary, dashboard, migrations,
  provider bundles, target repositories, or `.claude/prompt-evolution.md`.

## RED controls

Before production implementation, tests must prove the baseline cannot satisfy B2C:

1. shared-core and run-version adapter tests fail because their modules do not exist;
2. a valid mocked verify observes the existing `repo_runs` REST request;
3. a valid mocked verify has no exact `@@PRIVACY_RECEIPT@@` line; and
4. the registry still reports `kit.telemetry.central-upsert` as `adapter_planned`.

The mock harness may be changed before the RED run solely to expose safe endpoint and method
observations. It must never print headers, bodies, tokens, owner data, or credentials.

## Verification and attack matrix

| Group | Required proof |
|---|---|
| Shared core | one generator call; explicit UUID preservation; missing/legacy/malformed UUID rejection; canonical timestamp; exact keys; frozen receipt |
| Compatibility | verification wrapper retains its exports, writer ID, receipt bytes/shape, refusal message, and all 8/8 adapter plus 6/6 B2B tests |
| Run-version adapter | writer ID cannot be substituted; raw/unknown fields, polluted prototypes, malformed time, tampered reason/context/hash, and secret markers fail without echo |
| Command authority | `KIT_RUN_ID` and `KIT_EVENT_NONCE` cannot replace the generated command UUID; one UUID reaches one receipt unchanged |
| Auth quarantine | valid auth does not attest tenant; invalid/quota/missing/network behavior retains existing exit/output contracts |
| Marker conservation | existing meta marker content is unchanged and remains separate from exactly one privacy receipt |
| Sink denial | valid auth issues the auth RPC but zero `repo_runs` or substitute writer request; adapter source contains no fetch/global client/sink |
| Legacy isolation | feature/error insert behavior remains covered and registry entries remain `migration_blocked` |
| Documentation | README/design/sync comment state central run-version reporting is paused until tenant-safe sink capability |
| Regression | compatible TypeScript, privacy/B2A/B1/registry/sync mock/roadmap/mirror companions, then full `npm run test:kit` |
| Release hygiene | exact manifest, `git diff --check`, cached diff review, five positive-control credential detectors, normal hooks, local commit readback |

## Failure handling

- If the shared extraction changes any B2B observable behavior, stop and restore the wrapper API
  before telemetry work.
- If a telemetry test can reach the network, redirect config homes and use the preloaded mock before
  rerunning; never use a live token as a test fixture.
- If auth fetch cardinality changes outside removal of `repo_runs`, stop and classify the adjacent
  RPC/insert behavior rather than broadening B2C.
- If public docs require dashboard behavior changes, record a separately confirmed dashboard scope;
  do not mix it into this local kit writer slice.
- If any bulk update or build fails mid-change, restore the verified daily snapshot before retrying
  as required by workspace policy.

## Evidence and completion

B2C is complete only when the source-backed registry reports `kit.telemetry.central-upsert` as
`in_process`, `contract_validated`, zero prohibited-field observations, and
`fail_closed/tenant_attestation_and_sink_unavailable`; `kit.sync.install-report` remains
`adapter_planned`; all migration-blocked entries remain unchanged; focused and full suites are
green; evidence and handoffs are current; the exact local commit is read back; and no push occurs.

## Rollback

The verified 2026-08-15 kit snapshot and `backup/2026-08-15` tag are the filesystem and git rollback
boundary. B2C creates no database, dashboard, target, or external state. Before commit, restore the
snapshot if an update fails mid-change. After commit, revert the isolated B2C commit if necessary.
Do not use sync as rollback and do not push.

## Non-claims

This plan does not claim B2C implemented, `repo_runs` tenant-safe, Wave B complete, or P17-016 done.
It does not authorize a central sink, migration, dashboard change, target edit, sync, or push. The
legacy authentication RPC and raw feature/error telemetry remain migration-blocked, not converted.
