# P17-016 Wave B4A: Dashboard central-writer adapters plan

**Status:** Authorized — inputs locked; implementation unproven
**Date:** 2026-08-15
**Roadmap task:** P17-016
**Parent decision:** P17-016 Wave B4 `I1/P1/R1/D1/K1/U1/L1/C1/F1/E1`
**Authority:** The operator approved B4 local implementation and evidence, but not sync or push.
**Locked scope:** `progress=P1, release=R1, deploy=D1, core=K1, run=U1, receipt=L1, canary=C1, cutover=F1, evidence=E1`

## Outcome

Wave B4A cuts over the four non-identity B4 writers: production progress RPC, lesson operator
persistence, version-analysis operator persistence, and deployment-history persistence. Each path
returns the canonical unavailable-tenant receipt without central I/O, fallback, raw spool, or
payload echo. The eight identity/control writers remain unchanged for the separately planned B4B
slice under the approved temporary I1 exception.

The dashboard receives byte-identical generated mirrors of exactly `blocked-central-writer.ts`,
`privacy-policy.ts`, and `privacy-writer.ts` from the kit canonical core. B4A changes no tenant
schema, RLS, identity table, historical read model, deploy admission rule, target copy behavior, or
P17-015 cleanup contract. P17-016 remains `in_progress` after B4A.

## Decisions

### P1 — Production progress fails closed before RPC

The production progress infrastructure validates the existing binding or event and then constructs
one blocked receipt. Registration reuses `binding.commandRunId`; append reuses
`event.commandRunId`. Production contains no `register_progress_run` or `append_progress_event`
RPC and accepts no Supabase client. The application result has an exact discriminant for
`tenant_attestation_unavailable` and carries only the canonical receipt.

The raw RPC adapter moves to a clearly named P17-015 canary-only module. Only the already reviewed
canary and its focused tests may import it. A source gate rejects any production import or generic
export that could silently restore the legacy sink.

### R1 — Release operators validate locally, then stop

The lesson operator retains confirmation, kit version discovery, bounded child execution, and
strict lesson-envelope validation. The version-analysis operator retains confirmation, version
discovery, local I2 receipt/hash verification, and local pricing-snapshot parsing. Each command
creates one UUID after confirmation and before its first fallible producer step. After local
producer validation, it emits one exact blocked receipt and exits successfully as an honest
compatibility result.

Neither command reads Supabase credentials, performs central REST/readback, persists lesson titles,
uploads dossier JSON, or emits lesson count, title, dossier, repository, version, email, token, URL,
or raw provider evidence in its receipt. Existing historical read helpers remain read-model code;
they are not called by these operator commands in B4A.

### D1 — Verified deploy survives; history becomes closed

The deploy route retains authentication, exact version validation, tagged-command verification,
verified-run admission, rollback/deploy execution, stdout parsing, response shape, and error
semantics. After request admission it creates one command UUID for the deploy attempt. Successful
execution no longer inserts raw repository/operator rows into `deployments`; it returns one exact
blocked deployment-history receipt alongside the existing deploy result.

History failure cannot fail or relabel a successful deploy, and the adapter cannot reach a global
client. No test invokes deploy, sync, a child process, Git, or a target.

### K1 — Atomic canonical privacy-core distribution

The dashboard generator owns exactly three files under `src/lib/generated/privacy-core`:
`blocked-central-writer.ts`, `privacy-policy.ts`, and `privacy-writer.ts`. Its canonical source is
`claude-workflow-kit/packages/core/src`; `KIT_DIR` is only a CLI root override and is never read by
the pure sync function.

Check mode fails closed on missing, drifted, extra, non-file, symlink, or reparse-point content and
never repairs. Write mode stages all three files in a sibling directory, verifies byte identity,
renames the old directory to a backup, promotes the complete stage, and removes the backup only
after promotion. Any injected failure restores the complete previous directory. It never performs
a per-file partial update or deletes an unrecognized extra.

### U1 — One authoritative command UUID

Each release-operator and deploy attempt creates one UUID at its admitted command boundary and
passes it unchanged to the adapter. Progress reuses its exact command-run UUID and never generates
a second identity. Environment values, repository/version strings, database IDs, hashes, timestamps,
and payload data cannot become the command identity.

The one command UUID per operator attempt rule is mandatory and independently tested.

### L1 — Exact bounded unavailable-tenant receipts

All four writer IDs use the canonical shared core. Inputs are exactly `writerId`, `runId`, and
`createdAt`; receipts contain exactly `schemaVersion`, `policyVersion`, `writerId`, `runId`,
`tenantContextStatus`, `outcome`, `reasonCode`, and `createdAt`. Results are frozen, canonical-time
validated, non-durable, and contain no payload, count, raw identifier, endpoint, error, or secret.

### C1 — Canary source retained but never executed

The P17-015 raw progress RPC implementation and exact cleanup transaction remain available only for
the separately authorized test-only canary. B4A tests may import the canary adapter with a fake RPC
client, but never run the canary main, load `.env.local`, use browser/network, or write Supabase.

### F1 — Zero raw fallback or hidden sink

Converted writer branches contain no Supabase mutation, REST write/readback, service-role lookup,
webhook substitute, generic persistence callback, local raw spool, or best-effort fallback. The
deploy route retains its existing verified-run admission read outside the converted history-writer
branch. Four registry entries become `in_process`, `contract_validated`, and `fail_closed`. All
eight B4B identity entries stay `deferred_identity` until the next slice.

### E1 — Highest practical local evidence

Evidence proceeds plan validator, RED controls, pure unit/contract tests, mirror attacks, canary
isolation, deploy-route static/runtime isolation, exact strict TypeScript graphs, registry discovery,
full dashboard Vitest, kit registry/plan companions, full kit suite, two independent source-denial
searches with positive controls, exact diff/whitespace review, and five positive-control credential
detectors. Source and evidence use separate local commits with exact readback.

## Architecture decision record

### Context

The dashboard must stop four central writers before a Wave C tenant repository exists, while
preserving local/operator behavior and the disposable P17-015 proof harness.

### Decision

Use generated canonical policy/core code plus thin writer-specific fail-closed adapters. Keep the
raw progress transport in a named canary-only boundary. Preserve deployment execution while making
history unambiguously unavailable.

### Options considered

| Option | Assessment | Decision |
|---|---|---|
| Keep best-effort central writes | Low code churn but violates F1 and cannot prove tenant authority | Rejected |
| Freeze deploy and all operator commands | Strong isolation but breaks behavior not owned by the writer boundary | Rejected |
| Duplicate dashboard receipt logic | Fast initially but creates policy drift and a second security authority | Rejected |
| Canonical generated core plus thin adapters | Deterministic, reviewable, fail-closed, and compatible with Wave C replacement | Accepted |

### Consequences

- Operator commands report `blocked` instead of claiming persistence.
- P17-015 remains reproducible only through its explicit canary module and authorization.
- Deployment succeeds independently of unavailable history.
- Wave C can replace thin adapters with tenant-attested sink capabilities without changing the
  canonical receipt/policy authority.

## Clean architecture boundaries

| Layer | Responsibility | Forbidden dependency |
|---|---|---|
| Kit canonical core | Exact policy, UUID/time validation, writer allowlist, immutable receipt | dashboard, env, filesystem, network, Supabase |
| Dashboard generated core | Byte-identical compile-time distribution | hand edits or divergent behavior |
| Application adapters | Bind exact writer ID and map closed result | database client, request object, raw payload |
| Infrastructure call sites | Own command boundary and existing local validation | tenant invention, fallback, receipt mutation |
| Canary-only transport | Preserve disposable P17-015 RPC proof | production import or implicit execution |

Dependencies point inward: routes/scripts depend on application adapters; adapters depend on the
generated canonical core; the core has no infrastructure dependency.

## Runtime sequences

### Progress

1. Existing application validation accepts a binding/event.
2. The production adapter reuses its command-run UUID and canonical source timestamp.
3. The canonical core returns one immutable blocked receipt.
4. No client is created and no RPC is attempted.

### Release operators

1. Exact confirmation is checked before environment or producer access.
2. One command UUID is created.
3. Existing local producer inputs and evidence are strictly validated.
4. One closed receipt is emitted; execution stops before credential lookup or REST/readback.

### Deploy

1. Auth and exact request validation run unchanged.
2. One command UUID is created before verified deploy execution.
3. One closed history receipt is constructed before the deploy side effect, so receipt refusal
   cannot relabel an already executed deploy.
4. Verified deploy runs unchanged.
5. Existing deploy response data is computed and the receipt replaces the best-effort insert.

## Implementation manifest

### Kit plan and canonical core

- add this plan and `scripts/post-17-privacy-b4a-dashboard-adapters-plan.test.ts`;
- register the plan gate in `package.json` and the full kit chain;
- extend only the canonical blocked-writer allowlist/tests with the four dashboard writer IDs;
- retain the existing `.claude/integrations/core` mirror as byte-identical canonical output;
- add final kit evidence at `docs/evidence/post-17-privacy-b4a-dashboard-adapters-plan-2026-08-15.md`.

### Dashboard core distribution

- add `scripts/sync-privacy-core.ts` plus missing/drift/extra/rollback attacks;
- add `build:privacy-core` and `check:privacy-core` scripts;
- generate exactly three files in `src/lib/generated/privacy-core`;
- add dashboard evidence at
  `docs/evidence/post-17-privacy-b4a-central-adapters-2026-08-15.md`.

### Dashboard adapters and call sites

- add one application-level blocked-dashboard-writer adapter with four exact writer bindings;
- replace production `supabase-progress-writer.ts` with the clearly named
  `blocked-progress-writer.ts` fail-closed adapter;
- move raw progress RPC behavior to `scripts/p17-015-supabase-progress-writer.ts` and rewire only
  the P17-015 canary plus its focused fake-client tests;
- cut over `o1-lessons-operator-run.ts`, `o1-version-analysis-operator-run.ts`, and deploy history;
- update only the four B4A registry entries and affected truthful docs/tests.

## RED controls

Before production changes:

1. core mirror check/test fails because the generator and three dashboard mirrors do not exist;
2. adapter tests fail because the four dashboard writer IDs are not allowlisted and the adapter is
   absent;
3. source-denial tests fail on production progress RPC, release REST/readback, and deploy-history
   insert tokens; and
4. the registry still reports the four entries as central legacy/adapter/migration states.

No RED control may import an operator `main`, invoke deploy or sync, spawn a child, load credentials,
reach browser/network/Supabase, edit a target, or execute the P17-015 canary.

## Verification and attack matrix

| Group | Required proof |
|---|---|
| Core mirror | exact 3-file set; byte identity; missing/drift/extra/non-file/link refusal; idempotence; injected stage/backup/promote rollback |
| Canonical core | four exact new IDs; unknown valid ID, malformed UUID/time, extra key, prototype pollution, and receipt tampering refuse without echo |
| Progress | binding/event validation; exact reused command-run UUID; frozen closed receipt; zero client/RPC/fetch; canary-only fake RPC behavior retained |
| Release | confirmation order; one UUID; local validation retained; closed sentinel; zero credential/REST/readback; no title/count/dossier/raw evidence output |
| Deploy | auth/request/deploy ordering retained; one UUID; no deployments insert/client; receipt response exact; no route execution in tests |
| Registry | only four B4A rows transition; eight B4B rows remain deferred; canary rows stay test-only |
| Regression | focused tests, exact TypeScript, full dashboard, plan/registry/mirror companions, then full kit |
| Release hygiene | exact manifests, two source scans with controls, diff check, five credential detectors, hooks, separate local commits/readback |

## Edge cases and failure handling

- Empty or malformed release evidence fails locally before a receipt and cannot reach a legacy sink.
- A malformed progress UUID/time returns the existing closed invalid-contract result without I/O.
- Replayed progress operations still report blocked; B4A does not claim persistence or replay.
- A missing canonical file, generated extra, link, or interrupted directory promotion restores or
  preserves the complete previous mirror.
- Receipt construction occurs before verified deploy execution; if it unexpectedly refuses, no
  deploy side effect has started and the existing generic closed error path emits no raw receipt.
- Raw canary RPC code cannot be imported from `src`, `server`, or an application route.
- Existing central rows and historical read pages are not deleted or reclassified as tenant-safe.
- If any bulk edit/generator/test command fails after partial repository mutation, restore the
  verified 2026-08-15 snapshot before retrying the failed bulk operation.

## Evidence and completion

B4A is complete only when the three generated files are byte-identical, the four writer call sites
are source-backed fail-closed, registry discovery agrees, focused/full tests and attack gates pass,
durable evidence and handoffs are current, exact local source/evidence commits are read back, both
repos are clean, and no sync, push, live canary, browser, database, provider, or target action
occurred. Completion does not authorize B4B or Wave C automatically.

## Rollback

Reuse the verified 2026-08-15 ZIP snapshots. The kit also retains its daily rollback tag. Before
commit, a failed bulk update restores the relevant snapshot. After commit, revert only the isolated
B4A source/evidence commits. Generated-core write failures restore the prior directory in-process.
Never use sync as rollback and do not push.

## Non-claims

This plan does not claim B4A implemented, identity hardened, tenant isolation available, historical
data migrated, Wave B complete, or P17-016 done. It does not authorize a live canary, database
operation, browser operation, provider execution, target edit, real sync, or push.
