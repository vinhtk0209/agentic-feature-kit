# P17-016 Privacy Writer Wave B1 Evidence

Date: 2026-08-14
Task: P17-016 — Privacy-safe specification and usage data criteria
Verdict: Wave B1 PASS; P17-016 remains in progress
Policy: `T1/R1/C1/L1/E1`

## Scope proved

Wave B1 adds a pure, capability-gated central writer boundary without changing any production
writer call site. It also refines five Wave A contract details needed to represent current runtime
behavior honestly:

- `prompt` and `execute_roadmap_phase` are closed command codes;
- unavailable pricing requires both `costMicros` and `pricingVersion` to be null, while current or
  stale pricing requires both to be present;
- install and run observations are separate `installed|ran` events;
- an error signal may bind a run, a token subject, or both, but never neither; and
- provider execution IDs accept bounded UUID-style identifiers while rejecting paths, URLs, and
  secret-shaped content.

## Pure writer boundary

`packages/core/src/privacy-writer.ts` constructs and validates an exact immutable write attempt
before any sink can be called. A caller must provide an explicit sink capability bound to the same
schema version, policy version, tenant, and allowed family. The sink receipt must bind the writer,
tenant, family, record hash, persistence UUID, replay flag, and storage timestamp.

Missing or mismatched capabilities, policy rejection, sink exceptions, and malformed receipts return
only closed reason codes. Rejected values and sink exception text are never returned. A request with
no sink is construct-only and is never described as persisted.

The shared writer imports only `./privacy-policy`. Source attacks reject storage, provider,
environment, process, filesystem, network, and UI dependencies. The policy and writer are generated
byte-identically into `.claude/integrations/core`; the generator remains atomic and refuses unknown
files.

## Registry proof

The closed registry schema rejects unknown fields, unsafe source paths, duplicate IDs or anchors,
unknown dispositions, non-canonical ordering, and secret material. The kit registry has seven entry
points across exactly five discovered source files:

- platform and telemetry RPC transports;
- telemetry central insert and upsert transports;
- install reporting;
- verification reporting; and
- local P2 operator transport.

Every entry records its current state and target wave. No entry is marked converted. An injected
unregistered PostgREST writer makes the coverage comparison fail.

## Focused proof

```text
npm run test:post-17-privacy-writer-plan
PASS: 21 sections, five refinements, no-I/O B1 boundary

npm run test:privacy-policy
PASS: 8 families, 10 contract groups, 15 attack groups

npm run test:privacy-writer
PASS: 4 contract groups, 7 attack groups, 8 families

npm run test:post-17-kit-writer-registry
PASS: 7 entries, 5 source files, 8 attacks

npm run test:synced-core
PASS: missing, byte identity, drift, extra-file refusal, atomic write

npm run check:synced-core
PASS: 4 byte-identical files
```

Compatible static type proof:

```text
..\kit-dashboard\node_modules\.bin\tsc.cmd --noEmit --target ES2022 --module commonjs
  --moduleResolution node --esModuleInterop --skipLibCheck --types node
  packages/core/src/privacy-policy.ts packages/core/src/privacy-writer.ts
  packages/core/test/privacy-policy.test.ts packages/core/test/privacy-writer.test.ts
exit 0
```

Companion gates also pass for the accepted privacy decision, six-wave privacy plan, 22-task roadmap,
approved control-plane topology, RBAC and UX readiness, cross-machine progress with 22 attacks,
provider bundles, deterministic provider distribution, and multi-provider null-cost behavior.

## Full regression proof

```text
npm run test:kit
exit 0 in 217.5 seconds

dashboard npm test
65 files / 456 tests PASS in 8.69 seconds

dashboard npx tsc --noEmit
exit 0
```

## RED and correction history

1. The plan validator first treated capitalized `Full` as missing lowercase prose. The assertion was
   corrected without weakening the required full-suite gate.
2. The first refined policy fixture proved UUID-style provider execution IDs were rejected by the old
   closed-code validator.
3. The first pricing implementation admitted a stale record with a version but null cost. Explicit
   unavailable versus priced branches closed the partial-pair hole.
4. A writer mutation attack incorrectly required strict-mode exception behavior. It now asserts the
   actual invariant: the frozen record is unchanged and prohibited content is absent.
5. The dashboard registry test path was not collected by the existing `tests/**`-only Vitest config.
   The include was expanded narrowly to the approved privacy-infrastructure directory.
6. A file-wide discovery heuristic mistook `createHash(...).update(token)` plus a later read-only
   `.from('tokens').select(...)` for a mutation. Source inspection proved the route read-only; the
   detector now requires a bounded forward chain from `.from(...)` to a mutation method and retains
   the injected-writer attack.

## Non-claims and safety boundary

Wave B1 does not cut over a production writer, add a database migration, provide tenant storage/RLS,
backfill or purge legacy rows, execute tenant deletion, or prove live database isolation. Those remain
later confirmed waves. P17-016 stays `in_progress`.

- No Supabase, browser, provider, deployment, or remote CI operation ran.
- No target `.Codex` path was modified.
- No `npm run sync`, publication, push, or merge occurred.
- The verified 2026-08-14 backups and kit tag remain the rollback boundary.

## Final staged review

`git diff --cached --check` exits 0 for exactly 16 files. The cached file set matches the approved B1
manifest. A credential-pattern scan first identified the deliberate `BEGIN PRIVATE KEY` rejection
fixture. That marker was independently verified as one exact short synthetic line with no end marker
or key body. The rerun used an exact file-and-line allowlist for only that fixture, retained all
detectors elsewhere, passed its positive control, and reported zero credential hits.
