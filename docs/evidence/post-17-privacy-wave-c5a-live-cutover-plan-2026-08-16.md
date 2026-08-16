# P17-016 Wave C5A Live Cutover Plan Evidence

**Date:** 2026-08-16
**Source commit:** `52a4c869fcb6450ea2eb85392edc5036fa530dfa`
**Source parent:** `02df47f2350d2891bb03ac87ec59c83a62aa4799`
**Branch:** `main`
**Input lock:** `project=P1, snapshot=S1, migration=M1, bootstrap=B1, keys=K1, credential=C1, grant=G1, route=R1, legacy=L1, rollback=O1, evidence=E1, execution=X1`

## Result

C5A is complete locally as the architecture and executable readiness checkpoint for the
production-bound portion of P17-016. It defines the exact recovery, migration, bootstrap, key,
credential, grant, route, legacy compatibility, operator-decision, evidence, and external-authority
boundaries that must be satisfied before any live phase.

The plan intentionally separates C5 into six slices:

1. C5A local plan and readiness;
2. C5B authorized live read-only preflight, writer freeze, recovery point, encrypted logical backup,
   and isolated restore;
3. C5C authorized exact `0018 -> 0019` apply plus typed bootstrap;
4. C5D authorized server composition and bounded verification canary;
5. C5E versioned writer/reader/guard cutover plus recovery decision; and
6. C5F requirement-by-requirement completion audit.

Only C5A is input-complete. C5B-C5E retain separate named-project authorization packets and their
phase-specific missing inputs. P17-016 remains `in_progress`; P17-014 remains `ready`; P17-019
remains input-blocked.

## Architecture and testing influence

The architecture workflow caused the plan to record explicit alternatives and trade-offs instead
of treating the live path as a linear SQL checklist. It selects:

- one provider recovery point plus one encrypted logical backup and isolated restore over SQL
  Editor history, logical-only backup, or provider-only recovery;
- an explicit opaque bootstrap tenant and authenticated subject over inferred identity or automatic
  legacy assignment; and
- a versioned fail-closed writer/reader release over big-bang activation, permissive dual-read, or
  permanent dual-write.

The testing-strategy workflow separates fast static/readiness gates, executable database proof,
isolated restore, authorized live metadata, authorized live migration/RPC proof, route/cutover
canary, and post-cutover observation. A lower tier cannot substitute for a higher tier.

Code review found one safety-coverage gap before the source commit: the validator positive-controlled
only one of two project-identity forms and omitted explicit Supabase secret-token, PEM private-key,
and assigned service-role-key controls. The validator was hardened to cover both project forms and
eight credential/key/base64 patterns. Focused and strict gates remained green after the change.

## Exact source manifest

The source commit contains exactly three files and reports 689 insertions and one deletion:

- `docs/roadmap/p17-016-wave-c5-live-cutover-plan.md` — 450 added lines;
- `scripts/post-17-privacy-wave-c5-live-cutover-plan.test.ts` — 237 added lines; and
- `package.json` — focused and full-suite registration.

The normal commit hook passed `spec-integrity` for the new TypeScript validator. No dashboard,
migration, runtime, route, generated core, command prompt, target, or target `.Codex` file changed.

## RED and correction evidence

The standalone validator first exited `1` with exactly three readiness gaps:

- C5A architecture/readiness plan;
- focused package registration; and
- full kit registration.

After those artifacts were added, the validator reached plan content and rejected one implied but
unstated invariant: every external phase requires separate named-project authorization. The plan
now states that invariant explicitly.

The next run was harness-red because the synthetic JWT positive control incorrectly placed a dot
immediately after `eyJ`, leaving its first segment shorter than the detector contract. Only the
synthetic control was corrected; no denial pattern was weakened. The validator then passed.

A first strict compile attempt used the kit-local TypeScript 4.9.5 compiler and failed while parsing
Node 24 `@types/node/ffi.d.ts`, before any C5A source diagnostic. The installed workspace TypeScript
5.9.3 compiler then passed the exact validator with `strict` and `skipLibCheck=false`.

## Locked safety and recovery boundaries

The plan requires all of the following before live cutover:

- in-memory comparison of independently derived and operator-approved project identity, with no
  durable project identifier;
- a verified provider recovery point and encrypted logical backup whose bytes remain outside source
  and evidence;
- successful isolated restore before live apply;
- exact source SHA and migration order, with independent post-state inventory after each transaction;
- explicit tenant, authenticated subject or machine, finite credential binding, and purpose-limited
  `essential_operations` / `verification_record` grant;
- separate attestation and opaque-identifier keys held outside SQL and source;
- a P17-014-equivalent server-only composition boundary and accepted credential lifecycle;
- no direct kit/browser/worker Supabase access or global service client;
- no permissive OR dual-read and no new legacy write;
- mismatch-blocking versioned writer/reader/guard release;
- dry-run-only sync-guard evidence; and
- typed continue-or-restore decisions with non-empty rollback refusal preserved.

The attack matrix includes wrong project, snapshot/catalog drift, missing backup, failed restore,
partial migration, identity inference, automatic legacy mapping, key reuse/leakage, expired or
revoked credentials, grant failures, forged tenant, unscoped service-role access, cross-tenant run
collision, permissive dual-read, mixed releases, non-empty rollback, and evidence leakage.

## Authoritative test evidence

- Standalone C5A validator: pass with 12 locked decisions, six execution slices, 18 named attack
  groups, roadmap/dependency truth, and both default B2B-blocked CLI paths.
- Focused exact-SHA aggregate: seven commands passed — C1, C4, C4D, C5A, writer registry, canonical
  roadmap, and P17-014 topology.
- C4D companion: two repositories, two tenants, and 17 disposable scenarios passed.
- Writer registry: seven entries, six source files, and eight attacks passed.
- Canonical roadmap: 22 tasks and four initiatives passed; P17-014 remains ready.
- Exact strict TypeScript 5.9.3: passed with `skipLibCheck=false`.
- Source-candidate full kit: exit `0` in 267.3 seconds with 1,643 captured lines.
- Exact-SHA full kit at `52a4c869fcb6450ea2eb85392edc5036fa530dfa`: exit `0` in 283.2 seconds
  with 1,643 captured lines.
- Version stamps remain v3.25, prompt budget is `163,206/176,128`, and lesson sync is 60/60.

## Source and workspace review

Cached whitespace and package JSON passed. The staged source manifest contained exactly the three
reviewed files with zero unstaged tracked changes. Two project-identity controls and eight
credential/key/base64 controls pass in the validator; the independent staged scan also passes its
project control and all eight safety controls with zero source hits. Feature content contains no
Vietnamese text.

Both required 2026-08-16 workspace backups exist. Kit `node_modules/.ignored` contains zero files.
The transient C4D H1 fixture remains absent. The dashboard has zero tracked changes and its
user-owned untracked settings file was not read, edited, staged, or committed.

## Non-claims

C5A does not claim a rollback-grade live snapshot exists, live migrations were applied, a live
tenant was bootstrapped, keys or credentials were provisioned, a grant is active, a server route is
available, a live verification row was written, the legacy guard changed, cutover completed, sync
eligibility changed, C5 completed, Wave C completed, or P17-016 completed.

No live catalog/application-row access, SQL, backup, browser, provider, network, migration,
bootstrap, route, deployment, canary, cleanup, sync, push, merge, target edit, or target `.Codex`
modification occurred.
