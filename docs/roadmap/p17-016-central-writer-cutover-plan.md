# P17-016 Wave B1 v2: Central writer boundary and coverage plan

**Status:** Approved — B1/B2A complete; B2B verification adapter implemented, broader cutover pending
**Date:** 2026-08-14
**Roadmap task:** P17-016
**Policy:** ADR-002 `T1/R1/C1/L1/E1`
**Operator approval:** `APPROVE P17-016 WAVE B1 v2`

## Outcome

Wave B1 establishes the reusable privacy writer boundary that every later central writer cutover
must cross. It refines the pure Wave A contract where current runtime evidence proved a semantic
mismatch, adds a capability-gated sink port with closed receipts, distributes the boundary to the
sync-safe target runtime, and records every current kit/dashboard mutation entry point in
independently testable registries.

B1 is intentionally a no-I/O implementation checkpoint. It does not change a production writer,
call a database, apply a migration, use a provider, use a browser, sync to a target, or push a
branch. A registry status is evidence of classification, not evidence that a writer was converted.

## Locked inputs

- ADR-002 is accepted as `T1/R1/C1/L1/E1`.
- P17-016 is `in_progress`, readiness is complete, and Wave A is committed at `cac4370`.
- The exact operator scope statement is `APPROVE P17-016 WAVE B1 v2`.
- The 2026-08-14 kit/dashboard ZIPs and kit rollback tag were verified before editing.
- Both worktrees were clean on their required branches before editing.
- The writer inventory used fixed-string positive controls before recording any zero-hit finding.
- TypeScript is selected because this low-volume deterministic boundary must run byte-identically
  in the kit, synced target runtime, and later dashboard adapters. Rust, Go, or Python would add a
  process/distribution boundary without a measured performance requirement.

## B1 change boundary

In scope:

1. Correct the five proven Wave A/runtime semantic mismatches without weakening ADR-002.
2. Add a pure application port that constructs and validates a central record before invoking an
   explicitly supplied sink capability.
3. Validate an exact, tenant/policy/family/hash-bound sink receipt and expose closed failure codes.
4. Add `privacy-policy.ts` and the new writer module to the atomic sync-safe core mirror.
5. Add separate machine-readable kit and dashboard writer registries with independent coverage
   tests and canonical ordering.
6. Register focused gates in full regressions and write durable cross-repo evidence.

Out of scope:

- production writer call-site changes or legacy payload changes;
- Supabase schema/RPC changes, migrations, live reads/writes, or credentials;
- local durable compatibility storage for args, logs, questions, or transcripts;
- tenant membership/enrollment, HMAC key storage/rotation, purge, or deletion orchestration;
- dashboard UI/read paths, browser verification, provider execution, target sync, or remote push.

## Reconciled contract refinements

### Command vocabulary

Add closed central command codes `prompt` and `execute_roadmap_phase`. Existing codes remain
unchanged. Raw command arguments remain prohibited.

### Honest unavailable pricing

Legacy `unpriced` maps to central `pricingStatus=unavailable`. In that state both `costMicros` and
`pricingVersion` are `null`; zero cost is not inferred. `current` or `stale` requires both an
integer cost and a non-null pricing version. Mixed pairs fail closed.

### Install/run observations

Replace the combined install/last-run snapshot with an exact event payload:
`repoLocalId`, `eventCode=installed|ran`, `kitVersion`, and `observedAt`. This allows the sync writer
and runtime writer to report only what each actually observed.

### Error subject identity

`error_signal` accepts nullable `runId` and `tokenSubjectId`, but at least one must be a UUID. This
supports sidecar-owned runs and standalone token-scoped telemetry without manufacturing an ID.

### Provider execution identity

Progress accepts a nullable bounded provider execution ID using the P17-015 safe identifier shape.
Paths, URLs, whitespace, control characters, secret markers, and oversized identifiers remain
rejected by exact validation and content scanning.

## Architecture and dependency rule

`packages/core/src/privacy-policy.ts` remains the domain policy. The new
`packages/core/src/privacy-writer.ts` is an application boundary that depends only on the policy
types/functions and injected ports. Neither file may import filesystem, environment, process,
network, Supabase, React, Next.js, provider SDKs, or UI code.

Infrastructure adapters remain outside shared core. The sink capability owns persistence; tenant
context, processing grant, clock, and tenant-keyed opaque repository identity are supplied by the
caller. No global fallback, hardcoded tenant, environment lookup, or implicit consent exists.

## Writer port contract

The application boundary accepts exactly:

- one writer ID from a closed safe identifier shape;
- trusted tenant context and one explicit processing grant;
- one central family and its construct-exact payload;
- injected clock and opaque repository identifier ports; and
- an optional versioned sink capability.

The boundary first calls the Wave A constructor. Missing or malformed context/grant/payload returns
a closed refusal without invoking the sink. Missing, wrong-policy, wrong-tenant, or family-disabled
sink capability returns `sink_capability_unavailable` without I/O. Only a validated record is sent
to the sink.

## Closed receipts

Successful persistence returns an exact receipt bound to schema version, policy version, tenant,
family, record hash, persistence UUID, replay flag, and canonical stored timestamp. Unknown fields,
wrong hashes, wrong tenant/family/policy, non-canonical time, or malformed UUIDs are refused.

Sink exceptions and malformed responses become closed codes such as `storage_unavailable` or
`sink_response_refused`. Error text and rejected values are never returned or logged by shared
core. A construct-only result is never labelled persisted.

## Registry contract

Each repository owns one registry using the same JSON schema. Every entry contains an ID, relative
source path, stable source anchor, transport, data families, current privacy state, prohibited-field
observations, target wave, and disposition rationale. Absolute paths, traversal, secrets, duplicate
IDs/anchors, unknown fields, and non-canonical ordering are rejected.

Coverage tests must discover central REST/RPC/Supabase mutation shapes in the owned production
tree and reconcile each discovery to exactly one registry entry. Identity/RBAC/deploy mutations,
external alert transports, and operator-only fixtures are retained in the registry with explicit
`deferred_identity`, `external_transport`, or `test_only` dispositions rather than silently ignored.

Initial writer groups:

| Group | Current entry points | B1 disposition |
|---|---|---|
| Kit token/usage | `telemetry.ts` token RPC and feature/error signals | `migration_blocked` |
| Kit install/run | `telemetry.ts`, `sync-to-targets.ts` | `adapter_planned` |
| Kit verification | `record-verify.ts` | `adapter_planned` |
| Dashboard run/usage | `pty-server.ts`, `codex-resume-persistence.ts` | `local_store_required` |
| Dashboard progress | Supabase progress RPC adapter | `migration_blocked` |
| Dashboard orchestrator | phase, event, probe, and needs-input writers | `local_only_required` |
| Release evidence | canary, lesson, and dossier operator writers | `adapter_planned` |
| Identity/control | token, bypass, role, and deployment routes | `deferred_identity` |
| Operator canary | P17-015 live canary | `test_only` |

## Exact file manifest

Kit plan/checkpoint files:

- `docs/roadmap/p17-016-central-writer-cutover-plan.md`
- `scripts/post-17-privacy-writer-plan.test.ts`
- `package.json`

Kit policy/writer files:

- `packages/core/src/privacy-policy.ts`
- `packages/core/test/privacy-policy.test.ts`
- `docs/schemas/privacy-policy.schema.json`
- `packages/core/src/privacy-writer.ts`
- `packages/core/test/privacy-writer.test.ts`
- `docs/schemas/privacy-writer.schema.json`

Kit distribution/registry files:

- `scripts/build-synced-core.ts`
- `.claude/integrations/core/privacy-policy.ts`
- `.claude/integrations/core/privacy-writer.ts`
- `docs/roadmap/p17-016-kit-writer-registry.json`
- `docs/schemas/privacy-writer-registry.schema.json`
- `scripts/post-17-kit-writer-registry.test.ts`

Dashboard registry files:

- `docs/roadmap/p17-016-dashboard-writer-registry.json`
- `src/features/privacy/infrastructure/central-writer-registry.test.ts`

Closeout files are one evidence file per repository plus immediate root handoff updates. No other
file is in scope unless a failing load-bearing test proves the manifest incomplete; any expansion
must be recorded in both handoffs before editing.

## Implementation order

1. Make this plan executable and pass its focused validator.
2. Change the policy/schema/tests together and obtain a RED-then-GREEN focused result.
3. Add the writer port/schema/tests and obtain attack-matrix GREEN.
4. Extend the atomic sync-safe mirror and prove byte identity/missing/drift/extra refusal.
5. Add registries and independent source-coverage tests in both repositories.
6. Run compatible static type checks, focused companion gates, and both full regressions.
7. Run exact diff/whitespace/secret checks, write evidence, and commit each repository locally.

## Attack matrix

| Boundary | Positive proof | Required attacks |
|---|---|---|
| Contract refinements | Legitimate current runtime fixtures construct | fake zero cost, mixed pricing pair, unsupported command/event, empty error subject, path/URL provider ID |
| Sink capability | One exact record reaches one enabled sink | missing capability, wrong policy/tenant/family, duplicate family, unknown capability field |
| Sink receipt | Exact tenant/family/hash-bound receipt accepted | unknown field, wrong hash/tenant/family/policy, malformed UUID/time, echoed secret |
| Error behavior | Closed code only | sink throws token/path/message, policy rejects secret, malicious object/prototype |
| No-I/O core | Injected fake sink only | network/process/env/fs/UI imports or calls, global fallback |
| Sync-safe mirror | Four byte-identical files | missing file, content drift, extra file, failed atomic replacement |
| Registry schema | Every discovered writer classified once | unregistered mutation, stale anchor, duplicate ID/anchor, traversal/absolute path, unknown disposition |
| Registry scope | Central and deferred mutations are visible | identity/external/test mutation silently omitted, test fixture counted as production conversion |

## Verification ladder

1. Focused plan, privacy policy, writer, mirror, and both registry tests.
2. TypeScript 5.9-compatible isolated type check for the exact shared-core sources/tests.
3. Existing privacy decision/implementation, roadmap, topology, RBAC, UX, progress, provider, and
   distribution companion gates.
4. Full `npm run test:kit` and full dashboard `npm test` plus dashboard TypeScript.
5. Exact changed-file `git diff --check`, status/diff review, and secret scan with a proven positive
   control before each local commit.

Browser proof is intentionally not applicable because B1 changes no UI or live state. Database,
browser, provider, remote CI, and migration evidence belong to later separately authorized tiers.

## Rollback

- The verified 2026-08-14 ZIPs and kit tag `backup/2026-08-14` are the rollback boundary.
- Generated core writes remain atomic and refuse an owned directory containing extra files.
- If a bulk edit or generator fails mid-update, restore the affected repository from today's
  snapshot before retrying; do not continue from a half-written tree.
- Local commits are separate per repository. No sync or push is part of B1.

## B1 exit and non-claims

B1 passes only when every manifest file, attack, mirror, registry coverage check, type gate, full
regression, diff check, and secret scan is green with durable evidence. P17-016 remains
`in_progress`; Wave B is not complete, no writer is claimed converted, and no tenant-isolated
storage is claimed until later cutover/migration waves pass.

## Next slices

- B2A input contract is locked by `p17-016-wave-b2a-input-lock.md` as Accepted
  `T1/R1/X1/C1/S1/L1/E1`; it adds no writer behavior or persistence.
- B2B implements only `kit.verification.record`: one command-boundary UUID is passed unchanged,
  local git-note proof remains, the raw central REST mutation is removed, and missing v2 tenant
  attestation/Wave C sink returns one closed in-process receipt. No central row is claimed.
- The remaining `kit.sync.install-report` and `kit.telemetry.central-upsert` entries stay
  `adapter_planned` and require separately confirmed scopes. Central sink capability remains
  blocked until Wave C.
- B3: add local-only compatibility state and cut over dashboard run/orchestrator evidence producers.
- B4: complete every registry entry as converted or fail-closed before Wave C migration.
- Wave C and later retain their own authorization, migration, rollback, and evidence gates.

## Example outcomes

- A raw `log_tail`, feature name, path, URL, prompt, or error message is rejected before a sink call.
- An unpriced Codex run preserves token counts with null price data; it never reports a fabricated
  zero-dollar cost.
- A standalone error can be token-subject scoped without inventing a run UUID.
- A registry test fails when a new Supabase mutation is added without an explicit privacy
  disposition.
- A valid constructed record with no sink capability returns blocked, not persisted.
