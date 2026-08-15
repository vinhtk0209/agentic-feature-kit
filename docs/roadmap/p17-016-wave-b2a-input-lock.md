# P17-016 Wave B2A: Trusted context and writer cutover input lock

**Status:** Accepted — B2 input locked; writer cutover not started
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent policy:** ADR-002 `T1/R1/C1/L1/E1`
**Parent implementation plan:** P17-016 Wave B1 v2
**Operator acceptance:** `APPROVE P17-016 WAVE B2A INPUT-LOCK v1: tenant=T1, run=R1, rpc=X1, cutover=C1, sink=S1, legacy=L1, evidence=E1`

## Context

Wave B1 created a pure privacy policy, a capability-gated writer port, sync-safe mirrors, and an
exact inventory of current mutation entry points. It deliberately did not change a production
writer. The B2 registry now exposes two boundaries that cannot be inferred safely from the current
runtime:

1. no command supplies a server-attested runtime context that binds an authenticated subject to a
   tenant; and
2. the external `verify_kit_token` contract mixes legacy authentication/telemetry behavior without
   returning a trustworthy tenant attestation.

Accepting a tenant from an environment variable, repository, command argument, or legacy RPC
response would allow caller-controlled tenant selection. Constructing a central sink before the
approved tenant schema and row-level security exist would turn a planning decision into an unsafe
cross-tenant persistence path. B2 therefore needs an explicit input lock before production adapter
work can be scoped.

## Decision

The accepted B2A decision is `T1/R1/X1/C1/S1/L1/E1`. This artifact fixes the trust, identity,
quarantine, cutover, sink, compatibility, and evidence boundaries. It does not implement them.

### T1 — Server-attested tenant context

Central-writing adapters may accept tenant context only as server-attested runtime context derived
from the authenticated subject and trusted enrollment mapping. The future attestation must bind a
canonical tenant UUID, subject UUID, attestation version, issued time, expiry time, and integrity
proof. Validation belongs to a trusted server boundary; the shared writer never invents or repairs
tenant identity.

Tenant identity from an environment variable, local configuration, command argument, payload
field, or repository content is untrusted and must be rejected. A producer-supplied `tenantId`
cannot override the attested tenant. Missing, expired, malformed, mismatched, or unsupported
attestation is blocked before record construction or sink invocation. No bootstrap tenant,
single-tenant fallback, or last-known context is allowed.

Before v2 attestation is available, every central write attempt returns `blocked` with the closed
reason `tenant_attestation_unavailable`. The current runtime therefore cannot claim a tenant-safe
central write.

### R1 — One command-boundary run UUID

Each command invocation creates one caller-created UUID at the command boundary. That `runId` is
passed unchanged through every adapter and writer attempt belonging to the invocation. Libraries,
writers, retries, and sinks must not generate replacement run IDs or derive them from timestamps,
repository names, feature names, tokens, or payload hashes.

A missing or malformed run UUID blocks any family that requires a run identity. Retrying the same
logical writer attempt reuses the command run UUID and a deterministic attempt identity; starting a
new operator command creates a new UUID. This keeps verification, install/run observations, and
local compatibility receipts correlatable without exposing repository or feature identity.

### X1 — Auth-only legacy RPC quarantine

`verify_kit_token` remains an authentication-only legacy RPC. Its result may answer whether a
legacy token operation is authorized, but it must never be used as tenant attestation, processing
consent, a privacy-writer receipt, or proof that a central side effect is tenant-isolated.

The existing RPC-associated mutation entries `kit.bin.platform-rpc` and
`kit.telemetry.token-rpc` remain `migration_blocked`. The generic/raw side effects reachable through
those boundaries are quarantined from B2 conversion until an external contract explicitly
separates authentication from tenant attestation and legacy telemetry mutation. Authentication
success alone never unlocks a sink.

### C1 — Adapter-planned cutover only

A later, separately approved B2 implementation may cut over only the current
`adapter_planned` entries:

- `kit.sync.install-report`;
- `kit.telemetry.central-upsert`; and
- `kit.verification.record`.

That cutover must replace each raw central mutation with the B1 privacy-writer boundary, require T1
and R1 inputs, and preserve closed blocked outcomes. It must not silently keep the legacy write as a
fallback.

The current `migration_blocked` entries remain outside that cutover:

- `kit.bin.platform-rpc`;
- `kit.telemetry.central-insert`; and
- `kit.telemetry.token-rpc`.

The rule is explicit: migration-blocked entries cannot be claimed converted, adapter-backed, or
privacy-safe merely because an adjacent writer uses the new boundary. Their registry disposition
may change only with separate contract/migration evidence and source-anchor coverage.

### S1 — No central sink before Wave C

No central sink capability may be constructed, injected, or enabled until the Wave C tenant schema
and RLS are separately approved, migrated, and proven with cross-tenant attack tests. Until then,
an otherwise valid adapter request returns `blocked` with `central_sink_unavailable`; it never falls
back to a service-role REST call, legacy table, global client, or best-effort raw write.

B2 may later establish fail-closed adapters around the B1 boundary, but central persistence remains
disabled. A sink receipt can be accepted only after Wave C proves tenant-bound storage and supplies
the explicitly scoped capability.

### L1 — Local closed compatibility receipt

While central persistence is blocked, compatibility evidence is a local closed receipt only. Its
allowlist is `schemaVersion`, `writerId`, `runId`, `policyVersion`, `tenantContextStatus`, `outcome`,
`reasonCode`, `recordHash`, and `createdAt`. `recordHash` is omitted when record construction was
blocked. Closed enums and existing UUID/time/hash validators apply; unknown fields fail closed.

The receipt contains no raw text, path, repository name, feature name, prompt, argument, log, URL,
token, or secret. It also omits raw tenant/subject identity and legacy payload fragments. Receipt
storage, rotation, permissions, atomicity, and retention require a separately approved B2
implementation; this input lock does not create a file or durable store.

### E1 — Evidence ladder

B2A acceptance requires:

1. a focused fail-closed validator that first proves the missing-decision RED state;
2. the existing privacy decision, Wave A implementation, B1 writer-plan, writer-registry, policy,
   writer, roadmap, and sync-mirror companion gates;
3. Full `npm run test:kit` after focused gates are green;
4. `git diff --check`, exact status/diff review, and a positive-control credential scan covering
   every changed or untracked file; and
5. durable English evidence plus one local kit commit.

Dashboard tests and browser proof are not applicable because B2A changes no dashboard source,
route, UI, or data. Database, provider, remote CI, migration, sync, push, and target evidence are
not authorized by this decision.

## Boundary state machine

| State | Required facts | Allowed result | Forbidden behavior |
|---|---|---|---|
| `unattested` | No valid v2 server attestation | `blocked/tenant_attestation_unavailable` plus an L1 receipt when a later local store is authorized | record construction, sink lookup, legacy raw fallback |
| `attested_no_sink` | Valid T1 context and R1 run UUID; no Wave C sink capability | `blocked/central_sink_unavailable` plus an L1 receipt when authorized | Supabase/global/service-role fallback |
| `attested_sink_capable` | T1, R1, explicit Wave C sink, accepted policy/grant | B1 writer validation and closed sink receipt | trusting RPC auth as tenant proof or converting migration-blocked entries |
| `legacy_rpc_authorized` | Legacy RPC authentication succeeds | Continue only the legacy auth decision | infer tenant, consent, sink access, or conversion status |

The current implementation is `unattested`. B2A acceptance does not advance runtime state.

## Options Considered

| Decision | Option | Assessment |
|---|---|---|
| Tenant | T0 — accept env/config/payload tenant | Rejected: caller-controlled tenant selection and cross-tenant spoofing. |
| Tenant | T1 — server-attested subject/enrollment context | Accepted: establishes a verifiable trust boundary and fails closed before v2 exists. |
| Run identity | R0 — generate IDs independently inside writers | Rejected: retries and related evidence cannot be correlated honestly. |
| Run identity | R1 — one caller UUID at the command boundary | Accepted: stable invocation identity without raw repository/feature data. |
| Legacy RPC | X0 — treat `verify_kit_token` success as tenant proof | Rejected: the external contract does not attest tenant membership. |
| Legacy RPC | X1 — authentication-only quarantine | Accepted: preserves auth compatibility without laundering legacy mutation. |
| Cutover | C0 — convert every B2 registry entry together | Rejected: migration-blocked sources do not have valid policy families/contracts. |
| Cutover | C1 — only adapter-planned entries | Accepted: smallest source-covered production slice for later authorization. |
| Sink | S0 — create a best-effort central sink before schema/RLS | Rejected: cannot prove tenant isolation or safe service-role behavior. |
| Sink | S1 — block central persistence until Wave C | Accepted: makes the missing infrastructure explicit and safe. |
| Compatibility | L0 — spool legacy raw payloads locally | Rejected: reproduces the privacy risk on disk. |
| Compatibility | L1 — local closed receipts only | Accepted: retains bounded operational evidence without raw content. |

## Trade-off Analysis

T1 and S1 deliberately sacrifice current best-effort central telemetry availability to prevent
unattested or cross-tenant writes. R1 requires command entry points to own identity instead of
letting helpers improvise it, but it produces one explainable correlation boundary. X1 leaves the
legacy RPC migration unresolved, while preventing authentication from being promoted into a claim
the RPC cannot prove. C1 enables a small source-covered adapter slice, but three migration-blocked
entries remain explicit backlog. L1 preserves only coarse local diagnostics; detailed raw payload
debugging is intentionally unavailable.

This is the preferred balance because loss of optional telemetry is reversible, while a
misattributed tenant write or retained secret is not reliably recoverable.

## Consequences

### Positive

- Tenant selection cannot be spoofed through local process or repository inputs.
- One command run identity binds all later writer attempts and closed receipts.
- Registry claims remain honest: only source-covered adapter-planned writers are eligible.
- A missing Wave C capability produces an explicit blocked result instead of a hidden raw fallback.

### Negative

- Current kit runtimes cannot centrally persist through the B1 writer boundary.
- Later B2 adapter work must add command-boundary context plumbing before it can pass focused tests.
- Legacy RPC and raw usage-event migration remain separate work.

### Neutral

- P17-016 remains `in_progress`; B2A is an input decision, not Wave B completion.
- Existing legacy source remains unchanged in this scope.
- Dashboard and target repositories receive no B2A code.

## Verification and attack plan

The focused validator binds the exact accepted decision codes, trust sources, run identity,
registry IDs/dispositions/rationale codes, B1 cross-reference, roadmap state, and package/full-suite
registration. Attack expectations include caller/env tenant spoofing, expired or malformed
attestation, RPC-auth-as-tenant substitution, missing/changed run UUID, sink/global-client fallback,
migration-blocked conversion claims, raw local receipt fields, unknown receipt keys, secret marker
injection, and false Wave B completion wording.

Companion gates retain independent source discovery and exact registry anchors. The final review
must prove that no production writer file changed and that the only executable change is this
read-only validator.

## Rollback

The verified 2026-08-15 kit snapshot and `backup/2026-08-15` tag are the rollback boundary. B2A has
no database, generated mirror, or runtime state to roll back. If an edit or test-registration change
fails mid-update, restore the kit from that snapshot before retrying. The local B2A commit may also
be reverted as one documentation/test checkpoint. No target rollback is needed because no sync is
authorized.

## Action Items

1. Register and pass the focused B2A validator, companion privacy gates, and full kit suite.
2. Preserve the exact B2 registry dispositions until separately authorized implementation evidence
   supports a change.
3. Scope a later B2 production adapter cutover for only the three C1 entries, including command-
   boundary T1/R1 plumbing and L1 receipt implementation.
4. Define and approve the v2 attestation contract independently of `verify_kit_token`.
5. Complete Wave C tenant schema/RLS design, migration, cross-tenant attacks, and rollback before
   any central sink capability exists.
6. Treat each migration-blocked writer as its own contract/migration task before changing its
   registry status.

## Non-claims

B2A does not modify a production writer, construct a central sink, call a database, apply a
migration, use a browser or provider, sync, or push. It does not create tenant attestation, local
receipt storage, schema/RLS, or an external RPC contract. No production writer conversion occurs,
Wave B is not complete, and P17-016 remains `in_progress`.
