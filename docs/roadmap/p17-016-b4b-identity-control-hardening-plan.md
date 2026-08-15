# P17-016 Wave B4B: Identity-control hardening plan

**Status:** Authorized — inputs locked; implementation unproven
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent decision:** P17-016 Wave B4 `identity=I1`
**Authority:** The operator approved local implementation and evidence, but not sync or push.
**Locked scope:** `identity=I1, validation=V1, authorization=A1, mutation=M1, secrecy=S1, ui=U1, regeneration=R1, registry=G1, evidence=E1`

## Outcome

Wave B4B hardens eight dashboard identity/control paths without pretending that they belong to the
Wave A evidence privacy families. The seven essential private-admin operations retain their existing
Supabase/Auth behavior behind exact request contracts, server-side role checks, safe error codes,
mutation proof, and bounded client failure states. Non-atomic token regeneration becomes an honest
closed operation until Wave C provides one atomic tenant-aware rotation contract.

The approved I1 exception temporarily permits raw owner name, owner email, role email, and bypass
label storage in the existing private-admin identity plane. It does not make those tables tenant
safe, does not route identity secrets through the privacy writer, and does not authorize a new
global evidence sink. P17-016 remains `in_progress` after B4B.

## Decisions

### I1 — Separate typed private-admin plane

The identity plane covers exactly:

- one-time external admin bootstrap;
- token mint and token active/revoked status;
- bypass mint and bypass revoke;
- role grant and role revoke; and
- token regeneration, which is blocked in B4B.

Identity routes may pass the minimum raw identity/secret values required by their existing
Supabase/Auth operation. They may not add telemetry, privacy-writer calls, general evidence rows,
raw spools, debug payloads, or console logs. Secrets are returned only once to the already
authorized caller after a proven insert. Raw email, provider ID, token, bypass code, and provider or
database messages never enter logs or error responses.

### V1 — Exact bounded inputs before secret generation or I/O

Mutation bodies must be plain JSON objects, use exactly their allowlisted keys, and fit within
4,096 UTF-8 bytes. Invalid JSON, arrays, non-plain objects, extra keys, accessors/prototypes, blank
or control-character text, malformed UUIDs, malformed email, non-canonical timestamps, unsafe
integers, and unknown enum values return the same closed `invalid_request` result before a client
is created, a secret is generated, or an RPC is called.

The shared domain validator normalizes email to lowercase and locks these maximums:

| Field | Contract |
|---|---|
| owner name | trimmed UTF-8 text, 1–100 characters, no C0/C1 controls |
| email | trimmed lowercase ASCII, 3–254 characters, one `@`, bounded local/domain labels |
| bypass label | trimmed UTF-8 text, 1–100 characters, no C0/C1 controls |
| maximum runs | `null` or safe integer 1–1,000,000 |
| expiry | `null` or canonical UTC ISO timestamp strictly in the future |
| path ID | RFC 4122 variant UUID, versions 1–5 |
| role | exactly `viewer`, `operator`, or `admin` |
| token status | exactly `active` or `revoked` |

Token mint accepts exactly `owner_name`, `owner_email`, `max_runs`, and `expires_at`; bypass mint
accepts exactly `label` and `expires_at`; role grant accepts exactly `email` and `role`; role revoke
accepts exactly `email`; token status accepts exactly `status`. Revoke routes with no body accept no
payload contract. The one-time admin bootstrap validates bounded email/password environment values
before constructing the provider client.

### A1 — Authorization remains authoritative and precedes parsing

Token and bypass mutations require `authorize('admin')`. Role mutations require
`authorize('super_admin')`; `super_admin` remains environment-only and cannot be granted/revoked.
Authorization executes before body parsing, secret generation, database client creation, or
provider access. The one-time create-admin command is not a dashboard session route; it remains an
explicit local bootstrap that requires the service-role environment and never logs identity.

401 and 403 use stable closed codes. No client-side visibility rule is treated as authorization.

### M1 — Prove mutation outcome and preserve atomic boundaries

Token/bypass inserts select exactly one new ID before returning a one-time secret. Token status and
bypass revoke select the changed `id,status` row; zero rows are `not_found`, multiple/malformed
receipts are `response_refused`, and storage errors are `storage_unavailable`. A successful direct
mutation is never inferred merely from an absent error.

Role grant/revoke continue through the existing `grant_role`/`revoke_role` RPCs, where role change
and append-only audit are one database transaction. The routes send one exact normalized actor and
target set and return success only when the RPC succeeds. Existing void-RPC semantics are stated
honestly; B4B does not claim an affected-row count for roles.

No B4B route adds multi-call compensation. Token regeneration performs zero read, revoke, insert,
or secret generation until Wave C provides a single atomic RPC with an exact receipt.

### S1 — Closed errors, bounded logging, and one-time secrets

Identity API errors contain exactly `ok=false`, one allowlisted code, and a fixed English message.
Allowed codes are `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`,
`response_refused`, `storage_unavailable`, and `operation_blocked`. Raw exception/provider/database
text is never returned. No error object, request body, email, provider ID, token, bypass code,
authorization value, hash, environment value, or secret prefix is logged.

Success responses are exact per operation. Token/bypass plaintext appears only in the one successful
mint response and is never stored in UI error state. The create-admin command prints only a fixed
success code and fixed next-step text; it does not print email, user ID, or provider error.

### U1 — Explicit client failure states

Token status, bypass revoke, and role revoke clients must inspect `response.ok`, parse only the
closed error envelope, render a bounded operation-specific error, and avoid `router.refresh()` on
failure. Token/bypass/role mint forms also map server codes to local fixed copy rather than
rendering arbitrary server text. Network, malformed response, unauthorized, forbidden, not-found,
conflict, storage, and blocked states are distinguishable without exposing raw payloads.

The regenerate button is disabled and labeled unavailable until atomic rotation exists. The direct
regenerate API still returns the exact `operation_blocked` envelope so bypassing the UI cannot
reach a database client or mint a secret. Successful one-time token/code displays remain explicit
and dismissible.

### R1 — Regeneration fails closed until Wave C

`POST /api/tokens/[id]/regenerate` retains admin authorization and exact path validation, then
returns HTTP 409 with `operation_blocked`. It imports no Supabase client or crypto secret generator
and contains no legacy fetch/revoke/insert sequence. The registry records this path as
`in_process`, `contract_validated`, and `fail_closed`.

### G1 — Registry and source discovery stay truthful

Seven retained identity writers become `identity_control`, `contract_validated`, and
`identity_hardened`; regeneration becomes the explicit fail-closed entry. Their rationales state
the private-admin exception and no-tenant-safety limitation. Discovery continues to find all eight
paths and an injected unregistered identity mutation. B4A entries and canary classifications do not
change.

### E1 — Highest practical local evidence

Evidence proceeds executable plan validator, offline RED route/UI/static controls, pure domain
tests, route tests with injected fake clients, client response-state tests, create-admin contract
tests, registry attacks, exact TypeScript, full dashboard Vitest, kit plan/registry companions,
full kit suite, two independent source-denial scans with positive controls, five credential
detectors, exact diff/whitespace review, and separate local source/evidence commits with readback.

## Architecture decision record

### Context

Identity operations are essential but do not fit the approved privacy evidence families. Existing
routes have authorization, yet validation, affected-row proof, error secrecy, regeneration
atomicity, and UI failure handling are inconsistent.

### Decision

Keep identity data in an explicitly temporary private-admin plane. Add one pure shared contract,
thin route adapters, and a shared closed client-error decoder. Preserve existing single-call
atomic role RPCs and one-row direct mutations. Block token rotation instead of simulating atomicity.

### Options considered

| Option | Assessment | Decision |
|---|---|---|
| Route identity through the Wave A privacy writer | Misclassifies secrets/identity and invents unsupported record families | Rejected |
| Freeze every identity mutation | Strong isolation but breaks required private administration | Rejected by approved I1 |
| Keep route-local ad hoc validation | Minimal diff but repeats ambiguous/error-leaking behavior | Rejected |
| Shared exact contract plus thin routes; block rotation | Preserves operations, reduces drift, and is honest about Wave C | Accepted |

### Consequences

- Seven essential identity operations remain available with stricter inputs and safe failures.
- Token rotation is temporarily unavailable rather than non-atomic.
- Existing raw private-admin identity rows remain; no tenant-isolation claim is possible.
- Wave C can replace infrastructure adapters without changing domain or client error contracts.

## Clean architecture boundaries

| Layer | Responsibility | Forbidden dependency |
|---|---|---|
| Domain identity contract | exact validation, normalized values, closed codes/envelopes | Next, env, filesystem, crypto, network, Supabase |
| Application helpers | map exact operation results and client-safe messages | raw provider errors, general telemetry, global mutable state |
| Route/bootstrap adapters | authorize, invoke one operation, prove exact receipt | unvalidated input, raw error echo, compensating multi-write rotation |
| Client components | render loading/success/closed failure from safe codes | arbitrary server text, refresh-on-failure, hidden authorization |
| Existing infrastructure | Supabase Auth/table/RPC behavior | new tenant-safety or central-evidence claim |

Dependencies point inward. The pure contract is reusable by routes and tests; UI consumes only the
closed response contract; infrastructure never defines validation policy.

## Runtime sequences

### Mint token or bypass code

1. Authorize admin.
2. Read at most 4,096 bytes and validate the exact body.
3. Generate one plaintext secret and hash/prefix locally.
4. Insert one exact row and require one exact ID receipt.
5. Return the plaintext once; otherwise return a fixed closed error without refresh.

### Status or revoke

1. Authorize the required role.
2. Validate exact path/body inputs.
3. Perform one update/RPC.
4. Require the operation-specific proof or atomic RPC success.
5. Refresh only after success; render a fixed closed error otherwise.

### Regenerate

1. Authorize admin.
2. Validate the path UUID.
3. Return `operation_blocked` with HTTP 409.
4. Perform no read, revoke, insert, secret generation, or refresh.

### Create admin

1. Load only the named local bootstrap environment.
2. Validate service configuration plus bounded email/password.
3. Call the provider once.
4. Print fixed success/failure codes without identity or provider text.

## Implementation manifest

### Kit

- add this plan and `scripts/post-17-privacy-b4b-identity-control-plan.test.ts`;
- register the validator in `package.json` and the full kit chain;
- add final kit evidence at
  `docs/evidence/post-17-privacy-b4b-identity-control-plan-2026-08-15.md`.

### Dashboard domain/application

- add one pure identity-control contract with exact schemas and safe envelopes;
- add one shared client error-state decoder with fixed local copy;
- add pure contract and attack tests.

### Dashboard adapters and UI

- harden the seven route/bootstrap operations in the registry;
- replace token regeneration with the exact blocked route;
- update token, bypass, and role clients to show failure and refresh only on success;
- update all eight registry entries and registry discovery/tests;
- add final dashboard evidence at
  `docs/evidence/post-17-privacy-b4b-identity-control-hardening-2026-08-15.md`.

## RED controls

Before production changes, offline tests must prove that:

1. token/bypass/create-admin routes have no behavioral import tests;
2. invalid/extra/oversized bodies currently reach or can reach route-local parsing;
3. token/bypass status can report success without a changed row;
4. routes echo raw provider/database errors;
5. token regeneration contains the revoke-then-insert sequence; and
6. token/bypass/role revoke clients refresh after ignored non-2xx responses.

RED diagnostics expose only booleans, source locations, fixed codes, and fake values. No RED test
may import or invoke production side effects: operator mains, real routes with global clients,
create-admin provider code, deploy, sync, canary, child processes, browser, network, Supabase,
provider, target, or external state.

## Verification and attack matrix

| Group | Required proof |
|---|---|
| Domain | exact keys, byte cap, plain-object/prototype, controls, Unicode length, email, UUID, integer, timestamp, enum, immutable error envelope |
| Auth | 401/403 precede body/client/secret; admin versus super-admin verb matrix; pinned super-admin refusal |
| Mutation | one insert/update/RPC; exact one-row receipt; zero/multiple/malformed/error refuse; no inferred success |
| Secrets/errors | one-time secret only after proven insert; zero raw error/email/ID/secret logs; fixed response keys/codes/messages |
| Regeneration | 409 closed route; no client/crypto/read/revoke/insert; disabled UI; direct-call attack remains closed |
| UI | no refresh on non-2xx/network/malformed response; fixed error visible; loading resets; success refreshes once |
| Registry | exactly seven hardened plus one blocked identity entry; B4A/canary unchanged; unregistered mutation detected |
| Regression | focused routes/UI/domain, exact TypeScript, full dashboard, kit companions, then full kit |
| Release hygiene | exact manifests, dual source scans, five credential detectors, hooks, separate commits/readback |

## Edge cases and failure handling

- Authorization denial never parses an attacker-controlled body or creates a client.
- An absent or dishonest `Content-Length` does not bypass the 4,096-byte actual-body cap.
- Invalid expiry, `NaN`, floating, zero, negative, or oversized maximum runs refuse before crypto.
- A successful insert with a missing/malformed receipt does not expose the plaintext secret.
- A zero-row status/revoke result is not success and does not refresh the UI.
- A raw provider/database error becomes only `storage_unavailable`; original text is not logged.
- Role RPC failure cannot produce a success response; its database function remains the atomic
  role-plus-audit boundary.
- Regeneration cannot be re-enabled by client input, environment, optional callback, or UI bypass.
- Existing records and read pages are not deleted, migrated, or relabeled tenant safe.
- A failed bulk update restores the verified 2026-08-15 snapshot before retry.

## Evidence and completion

B4B is complete only when all eight registry paths are source-backed, exact validation/auth/error
and UI states pass their attacks, regeneration has zero mutation path, focused/full tests pass,
durable evidence and handoffs are current, separate source/evidence commits are read back, both
repos are clean, and no external action occurred. Completion closes Wave B4 only; it does not close
P17-016 or authorize Wave C automatically.

## Rollback

Reuse the verified 2026-08-15 ZIP snapshots and kit rollback tag. Before commit, restore a failed
bulk update from the snapshot. After commit, revert only isolated B4B source/evidence commits. Do
not use sync as rollback and do not push.

## Non-claims

This plan does not claim B4B implemented, identity data tenant safe, token rotation atomic,
historical data migrated, Wave C complete, or P17-016 done. It does not authorize a live canary,
database/migration operation, browser operation, provider execution, target edit, real sync, push,
merge, deployment, or publication.
