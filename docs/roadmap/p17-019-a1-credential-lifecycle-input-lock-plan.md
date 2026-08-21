# P17-019 A1: Credential Lifecycle Input Lock

**Status:** Accepted for A1 planning and documentation repair; A2 runtime remains blocked
**Date:** 2026-08-21
**Roadmap task:** P17-019
**Dependencies:** P17-004 provider-neutral specification adapters and P17-009 cross-platform release qualification
**Decision lock:** `boundary=B1, authority=A1, ownership=O1, expiry=E1, refresh=R1, execution=X1, receipt=C1, privacy=P1, compatibility=L1, evidence=V1, performance=T1, scope=N1`

## Context

P17-019 exists because the current Playwright authentication path can detect a stale credential but
cannot refresh it safely. `.claude/integrations/b11-runner.ts` reads `.env.playwright`, requires an
access token and expiry, and fails closed before browser launch when either is missing, expired, or
inside the six-hour warning window. `.claude/integrations/version-check.ts` owns the expiry
classification. `.claude/integrations/playwright-runner.ts` injects access, refresh, and expiry
values supplied by the process, but it does not own a refresh flow.

The root `npm run workflow:login` command is unrelated: `bin/workflow.ts` verifies and saves a kit
license token. It does not populate Playwright access, refresh, or expiry credentials. The shortcut
claim in `.claude/SETUP.md` is therefore incorrect and is repaired in A1 without inventing a new
credential path.

OAuth refresh behavior is provider- and client-specific. RFC 6749 defines refresh tokens as
credentials bound to the client and requires TLS plus client binding; RFC 9700 strengthens replay
protection with sender constraint or rotation for public clients. Playwright also warns that saved
authenticated state can impersonate the account and must not be committed. These constraints make
a built-in generic endpoint or generic token payload unsafe.

Official references:

- https://playwright.dev/docs/auth
- https://www.rfc-editor.org/rfc/rfc6749#section-6
- https://www.rfc-editor.org/info/rfc9700/
- https://nodejs.org/api/child_process.html

P17-019 remains `backlog`. Its exact unresolved input is still a project-specific refresh
capability fixture and security approval. A1 defines what those inputs must prove; it does not
fabricate or waive them.

## Decision

The accepted A1 decision is `B1/A1/O1/E1/R1/X1/C1/P1/L1/V1/T1/N1`. A future runtime may coordinate
refresh only through a project-supplied `ProjectCredentialRefreshCapability`. Shared core owns exact
metadata contracts, lifecycle decisions, reason codes, and receipt validation. A project adapter
owns provider protocol, endpoint, client binding, secrets, and credential replacement.

### B1 — Clean Architecture boundary

The shared domain accepts only a trusted clock, an opaque credential-binding descriptor, the
minimum required validity window, and a non-serializable capability reference. It decides whether
the credential is `valid`, `refresh_required`, `needs_input`, `refused`, or `expired_mid_run`.

The application layer coordinates one preflight attempt and validates one closed receipt. The
infrastructure adapter owns provider-specific OAuth, SSO, browser, SDK, operating-system, or
executable mechanics. Neither shared core nor the Playwright runner hardcodes a token endpoint,
grant payload, cookie name, tenant URL, client secret, or provider response shape.

### A1 — Project-provided authority only

A `ProjectCredentialRefreshCapability` is supplied by explicit project configuration and accepted
only after its fixture and security decision match the configured project profile. The capability
binds an opaque project-auth profile ID, credential-binding ID, supported purpose, capability
version, minimum/maximum lifetime, execution mode, and integrity hash. The workflow cannot derive
or select it from repository absence, target `.env` content, provider name, URL, or a global default.

No capability means `needs_input/refresh_not_supported`. An unknown version, wrong project,
purpose mismatch, stale binding, malformed descriptor, or missing security reference is refused
before any credential or adapter operation.

### O1 — Secret ownership never enters shared core

Access tokens, refresh tokens, cookies, authorization codes, client credentials, signing keys, and
authenticated browser state remain inside the project adapter's private storage or closure. The
capability passed to shared/application code is non-serializable capability authority, not a secret
value, environment-variable name, file path, URL, header, or generic key-value bag.

When rotation returns replacement material, the adapter owns atomic replacement, revocation or
rotation semantics, old-byte zeroization where the runtime permits it, and failure cleanup. A
future Playwright injection adapter receives a separate single-use access capability. It cannot
read the refresh credential or serialize the access credential into evidence.

### E1 — Expiry and refresh triggers are explicit

The trusted clock and project policy decide the refresh threshold. A producer cannot extend expiry
or lower the required-validity window. A preflight may return `still_valid` without invoking the
refresh operation when the existing binding is provably valid for the entire bounded run window.

Refresh is allowed only before the browser context launches. If the credential expires or an
authentication rejection is observed after interaction begins, the run returns the structured
outcome `expired_mid_run`. There is no transparent interaction replay because browser actions may
have unknown side effects. A new run must repeat preflight under a fresh attempt identity.

### R1 — One single-use refresh attempt

The coordinator consumes one attempt identity before invoking refresh and permits one invocation at
most. Concurrent or repeated use of the same attempt is replay. Timeout, abort, malformed output,
clock rollback, changed binding, rotation conflict, or uncertain provider outcome is terminal for
that attempt and cannot fall back to the stale credential.

The project adapter may internally follow its approved protocol only within its own bounded
contract. Shared code performs no automatic retry, discovery, polling, browser login, device flow,
tenant search, or refresh-token reuse.

### X1 — In-process first; executable adapter is conditional

The default future adapter shape is an injected in-process capability because it minimizes process,
filesystem, distribution, and output-parsing surfaces. A project may instead approve an executable
adapter only when its authentication mechanism cannot be exposed safely in-process or an existing
project-owned tool is the authority.

An executable adapter must be absolute-path and digest/version pinned, use direct fixed argv with
`shell:false`, receive no secret through argv, expose a sanitized environment allowlist, use bounded
stdin/stdout, own one timeout/abort, emit one exact sentinel, and return a non-serializable access
capability through an explicitly protected local handoff. Raw stdout/stderr and process errors are
never receipts. Node's direct-spawn semantics are the baseline; Rust, Go, or Python does not bypass
the same manifest, signature, capability, cleanup, and distribution gates.

### C1 — Metadata-only closed receipts

The durable receipt allowlist is limited to schema version, project-auth profile ID hash,
credential-binding ID hash, attempt ID, capability version, trigger code, status, reason code,
observed/expiry timestamps, bounded duration, rotation indicator, access-capability hash, and
receipt integrity. Closed statuses are `still_valid`, `refreshed`, `needs_input`, `refused`,
`failed`, and `expired_mid_run`.

The receipt has no token, cookie, code, secret, header, environment variable, file path, URL,
provider response, output, error text, user identity, repository identity, browser state, or
credential fingerprint derived directly from secret bytes. Content addressing proves receipt
integrity only; it does not prove a live provider refresh occurred.

### P1 — Privacy and disclosure stay closed

No credential material enters source, fixtures, logs, errors, metrics, evidence, central storage,
dashboard responses, provider bundles, archives, screenshots, or public documentation. Synthetic
fixtures use reserved identities and deterministic fake capability ports, never realistic bearer or
refresh-token strings. Secret and high-entropy detectors require known-positive controls.

The adapter must collapse provider errors to closed reason codes without echo. Diagnostics may
include bounded counts, elapsed time, and closed lifecycle state only. Tenant or subject binding,
when required by P17-016/P17-014, enters through a separately trusted attestation and cannot be
inferred from a Playwright credential.

### L1 — Compatibility is fail-closed

The current manual `.env.playwright` path remains the only supported compatibility input until a
future A2 runtime is approved and proven. A1 corrects `.claude/SETUP.md` to state that
`workflow:login` is kit-license authentication and does not populate Playwright credentials.

Future A2 must preserve the B11 fail-closed preflight and reconcile the direct Playwright runner's
warning-only missing-token path. Unsupported refresh stays `needs_input`; the implementation never
guesses an endpoint or silently uses a global, last-known, license, control-plane, or provider token.

### V1 — Evidence ladder cannot skip live proof

Evidence is cumulative:

1. A1 plan, roadmap, documentation regression, registration, manifest, and attack validator;
2. A2 pure lifecycle schemas, state transitions, capability/receipt validators, and synthetic ports;
3. A3 project adapter conformance against the approved synthetic fixture and secret/replay attacks;
4. A4 disposable target integration with exact project profile, bounded browser preflight, cleanup,
   and no credential disclosure; and
5. separately authorized live proof that binds one exact project adapter/version/profile/run without
   persisting or displaying credential material.

Synthetic or fake-port success cannot claim live refresh compatibility. A provider login, browser
session, or pre-existing token cannot substitute for an admitted project capability and receipt.

### T1 — TypeScript first with measured reconsideration thresholds

TypeScript/Node remains the selected coordinator because current token checks, Playwright runtime,
provider-neutral capability patterns, cross-platform CI, bundle builders, and attack harnesses are
already TypeScript. The future pure lifecycle fixture must target p95 at or below 2 ms over 1,000
iterations, incremental RSS below 32 MiB, and coordinator overhead below 10 ms excluding the
project adapter's external authentication time.

Reconsider Rust or Go only after a reproducible profile breaches one of those thresholds or Node
lacks a required memory-protection/operating-system credential capability. Reconsider Python only
when the approved project authority is already a Python tool or library and a direct adapter avoids
reimplementation. Any non-TypeScript adapter requires pinned toolchain and dependency inventory,
deterministic cross-platform artifacts, direct-process or FFI threat analysis, secret-memory and
crash cleanup proof, SBOM/license review, provider-package changes, and clean-install evidence.

### N1 — A1 locks inputs only

A1 changes plan/readiness documentation, one validator, package test registration, public source
manifest entries, and the false setup sentence. No refresh runtime, token read, credential write,
provider call, browser launch, or target mutation is authorized.

P17-019 remains `backlog` with incomplete readiness. A2 cannot start until the exact project fixture
and security approval below exist and P17-004's required dependency state is revalidated.

## Boundary state machine

| State | Required facts | Allowed result | Forbidden behavior |
|---|---|---|---|
| `unsupported` | No admitted project capability | `needs_input/refresh_not_supported` | infer endpoint, use license/global token, read target secret |
| `valid` | Binding and trusted expiry cover the full run window | `still_valid` without refresh invocation | producer expiry extension, unnecessary refresh |
| `refresh_required` | Exact capability, fixture, security reference, clock, and fresh attempt | one bounded capability call | retry, concurrent use, discovery, stale fallback |
| `refreshed` | Exact new access capability and metadata receipt validate | browser preflight may consume access capability once | serialize token, expose refresh material, reuse capability |
| `uncertain` | Timeout, abort, malformed response, clock/binding/rotation conflict | closed `failed` and terminal attempt | treat as refreshed, reuse old token, echo provider error |
| `interaction_started` | Browser action has begun | `expired_mid_run` on expiry/auth rejection | no transparent interaction replay |

## Options Considered

| Option | Complexity | Security boundary | Portability | Decision |
|---|---:|---|---|---|
| Injected in-process project capability | Medium | Smallest; secrets stay in a closure/private adapter | Native to current TypeScript runtime | Accepted default |
| Pinned project executable adapter | High | Extra process/filesystem/output boundary; can isolate project tooling | Supports Node, Rust, Go, Python, or existing approved tools | Conditional escape hatch |
| Built-in generic HTTP refresh | Superficially low | Hardcodes endpoint/payload/client assumptions and centralizes secrets | False portability across auth systems | Rejected |
| Manual credential replacement only | Low | Existing operator-controlled path | Works today but cannot satisfy lifecycle automation | Retained compatibility fallback |

## Trade-off Analysis

Capability injection keeps the shared contract provider-neutral and makes secret authority explicit,
but every project must supply a conformance fixture and security decision. An executable adapter can
reuse a mature project-owned auth tool, including one written in Rust, Go, or Python, but increases
supply-chain, process, IPC, cleanup, signing, and cross-platform costs. A generic HTTP refresh would
look simpler while silently assuming token endpoint, client authentication, rotation, error, and
tenant semantics that RFC 6749 leaves to the authorization system. Manual replacement stays honest
and safe for unsupported projects but does not solve mid-run lifecycle automation.

The accepted balance is in-process first, executable only with evidence, and no generic network
fallback. Availability loss is explicit and reversible; leaked or replayed refresh credentials are
not.

## Consequences

### Positive

- Shared core remains free of provider endpoints, token formats, secrets, environment, filesystem,
  browser, SDK, and process dependencies.
- Unsupported projects receive a stable `needs_input` outcome instead of guessed authentication.
- One attempt, one capability, closed receipts, and no interaction replay bound replay and unknown
  side effects.
- Existing TypeScript distribution remains authoritative unless measurements justify another
  language.

### Negative

- No project becomes refresh-capable merely by merging A1.
- Each project must own and secure its adapter fixture and lifecycle policy.
- Executable adapters require additional supply-chain and clean-install qualification.
- A mid-run expiry stops the run instead of replaying browser actions automatically.

### Neutral

- Manual Playwright credential injection remains supported and unchanged.
- Kit license, Playwright, provider API, tenant, and control-plane credentials remain distinct.
- P17-019 status and readiness do not advance.

## Input completeness and approval packet

A2 requires both inputs below:

1. a synthetic project-specific conformance fixture that binds project-auth profile, purpose,
   expiry/rotation behavior, capability version, execution mode, expected metadata receipt, timeout,
   and negative cases without real credential values; and
2. a security approval that accepts secret ownership/storage, refresh trigger, client binding,
   rotation/revocation, clock source/skew, single-use transfer, timeout/uncertain outcome, executable
   boundary when applicable, cleanup, evidence, and rollback.

The action template is not itself approval:

`APPROVE P17-019 A2 INPUT-LOCK v1: project=<opaque-profile>, authority=A1, ownership=O1, expiry=E1, refresh=R1, execution=<in-process|executable>, fixture=<sha256>, security=<accepted-ref>, evidence=V1`

Placeholder, partial, stale, cross-project, unsigned, or secret-bearing packets remain incomplete.
Standing roadmap authority cannot invent the fixture digest or security reference.

## Verification and attack plan

The A1 validator proves the exact 12-decision lock, source manifest, roadmap backlog/incomplete
readiness, setup correction, package registration, ordinal public manifest, and current separation
between kit login and Playwright credentials. Negative controls mutate roadmap status, readiness,
missing-input truth, and the stale setup sentence.

Future layers use a testing pyramid:

- unit/property: exact schemas, clocks, expiry boundaries, state transitions, canonical receipts,
  one-attempt/replay, immutable capabilities, secret-safe errors, and performance/RSS benchmarks;
- integration: in-process and conditional executable adapters, rotation, abort/timeout, zeroization,
  direct `shell:false` process control, output caps, crash cleanup, and cross-platform behavior;
- E2E: disposable project preflight, browser launch, expiry before and during interaction, no replay,
  metadata-only evidence, teardown, and manual-fallback behavior; and
- live: separately authorized exact-project proof with no token/log/storage disclosure.

Attacks include unknown fields, prototype/accessor/proxy/cycle inputs, malformed/oversized time and
IDs, producer expiry extension, wrong project/purpose/binding, capability forgery, concurrent replay,
clock rollback, timeout/late settlement, rotation conflict, raw token in argv/stdout/stderr/error,
environment inheritance, endpoint injection, executable replacement, digest/version drift, secret
fixture content, forged receipt hash, and an automatic browser replay claim.

## Rollback

The verified 2026-08-21 kit ZIP and tag `backup/2026-08-21` are the rollback boundary. A1 has no
runtime, provider, browser, credential, database, dashboard, target, or generated distribution state.
Rollback is one local source commit revert or restoration of the exact seven-path manifest. If an
edit or qualification command leaves a partial change, restore that exact scope before retry.

## Action Items

1. Pass the focused A1 validator, roadmap, documentation, public-source, provider non-widening, and
   full kit gates; record durable English evidence and separate source/evidence commits.
2. Obtain the project-specific synthetic fixture and security approval packet without collecting a
   real token or browser state.
3. Revalidate P17-004 and P17-009 dependency evidence before any A2 status transition.
4. Implement A2 pure lifecycle contracts only after roadmap readiness becomes complete.
5. Implement and qualify the selected project adapter independently; preserve manual fallback for
   unsupported projects.
6. Require separate disposable and live proof before any compatibility or availability claim.

## A1 source manifest

- `.claude/SETUP.md`
- `docs/roadmap/p17-019-a1-credential-lifecycle-input-lock-plan.md`
- `docs/roadmap/post-17-roadmap.json`
- `docs/roadmap/post-17-roadmap.md`
- `package.json`
- `release/public-release-manifest.json`
- `scripts/post-17-credential-lifecycle-input-lock-plan.test.ts`

No production credential, Playwright, B11, provider, dashboard, target, or package-distribution file
belongs to A1.

## Non-claims

A1 does not implement, execute, or prove refresh; read or write a credential; launch a browser;
contact an auth or provider endpoint; infer a project profile; change a production runner; enable a
control-plane route; alter a target; sync; push; merge; tag; release; publish; or change visibility.
No refresh runtime, token read, credential write, provider call, browser launch, or target mutation is authorized.

P17-019 does not become ready, in progress, or done. No project, provider, tenant, dashboard,
Codex/Claude/Copilot package, or public user gains refresh support from this input lock.
