# P17-016 Privacy Boundary Wave A Evidence

Date: 2026-08-14
Task: P17-016 — Privacy-safe specification and usage data criteria
Verdict: Wave A PASS; P17-016 remains in progress
Baseline: kit `f7d8db4`; dashboard `9b7c3b0`

## Scope proved

Wave A implements only the pure shared-core boundary accepted in ADR-002 `T1/R1/C1/L1/E1`:

- five closed data classes and five processing scopes;
- trusted tenant context derived separately from producer payloads;
- versioned same-tenant processing grants with optional scopes off by default;
- exact allowlist construction for all eight central record families;
- tenant-keyed repository pseudonymization through an opaque HMAC port;
- server-clock R1 retention decisions for 24-hour, 30-day, 180-day, and 365-day profiles;
- central-content rejection instead of zero-duration persistence;
- secret-safe closed rejection decisions;
- bounded, integrity-bound deletion receipts;
- legacy quarantine/mapping/rejection dispositions; and
- JSON Schema 2020-12 contracts for five public envelope types and eight bound record families.

The implementation is pure policy code. It imports only `node:crypto`; it has no Supabase, React,
Next.js, provider SDK, environment, process, filesystem, network, or browser dependency.

## Construct-exact and minimization proof

Every producer payload is checked against one exact family key set before transformation. Central
records are constructed field by field and never spread or redact-and-forward the producer object.
Repository-local identifiers are absent from serialized records and are replaced by
`hmac_<sha256>` plus closed key-version metadata returned by `OpaqueIdentifierPort`.

Public record validation repeats exact-key, content, field-vocabulary, family-retention, expiry, and
integrity checks. An attacker cannot recompute the outer SHA-256 to authorize an invalid status,
longer retention class, mismatched progress retention, or non-canonical dossier lesson order.

High-entropy exemptions are an exact field set for UUIDs, opaque IDs, and hashes. A raw local
repository identifier is not exempt and secret-like high-entropy input is rejected.

## Focused contract proof

```text
npm run test:privacy-policy
PASS: 8 central families
PASS: 9 contract groups
PASS: 14 attack groups

npm run test:post-17-privacy-implementation-plan
PASS: 25 sections, six waves, Wave A fail-closed boundary

npm run test:post-17-privacy-decision
PASS: 17 sections, five data classes, T1/R1/C1/L1/E1 accepted, P17-016 in progress

npm run test:post-17-roadmap
PASS: 22 tasks, 4 initiatives

npm run test:post-17-control-plane-topology
PASS: 22 sections; P17-014 remains dependency-blocked

npm run test:post-17-control-panel-rbac
PASS: 21 sections; P17-021 retains 10 gaps

npm run test:post-17-control-panel-ux
PASS: 19 sections; P17-021 retains 10 gaps
```

Compatible static type proof:

```text
..\kit-dashboard\node_modules\.bin\tsc.cmd --noEmit --target ES2022 --module commonjs
  --moduleResolution node --esModuleInterop --skipLibCheck --types node
  packages/core/src/privacy-policy.ts packages/core/test/privacy-policy.test.ts
exit 0
```

The repository-declared TypeScript 4.9.5 versus installed Node 26 declaration parser mismatch is a
pre-existing toolchain issue. This evidence uses the already-installed compatible dashboard
compiler and does not change dependencies or hide the mismatch.

## Attack proof

The focused suite proves rejection of:

- email, path, URL, prompt/spec, log, stack, and evidence body fields;
- unknown and nested fields plus JSON `__proto__` input;
- producer-selected tenant and expiry values;
- wrong-tenant, revoked, expired, denied, wrong-scope, and absent grants;
- authorization/private-key markers, high-entropy values, double encoding, bidi, and control chars;
- malformed context, inherited context objects, raw SHA-256 surrogates, malformed HMAC key versions,
  and opaque-port extra fields;
- outer hash tampering and recomputed-hash semantic tampering;
- `central_content` persistence attempts;
- deletion comments, count overflow, unsorted stores, and receipt tampering; and
- legacy migration without an explicit tenant mapping and passing sanitizer.

Errors expose only a closed `reasonCode` and `ruleId`; rejected values are not echoed.

## RED and correction history

The implementation did not conceal failed attempts:

1. The plan validator exposed five presentation/copy mismatches and one real missing Wave A
   prohibition sentence. Assertions were made markup-neutral where appropriate and the missing
   boundary was added to the plan.
2. The first runtime found that deletion factory object spread could admit already-built schema/hash
   extras. The factory now validates exact input and copies each field explicitly.
3. The opaque port returned generic `invalid_field` for a malformed key version. All malformed port
   results now use `invalid_opaque_identifier`.
4. Two deletion attacks incorrectly reused built receipts. They now use clean factory inputs so each
   intended invariant is isolated.
5. A whole-file dependency grep mistook `playwright_verify` domain vocabulary for a dependency. The
   source audit now checks import specifiers and concrete process/network call sites.
6. Compatible static type initially found one consent-union narrowing issue and two widened fixture
   literals. Literal discrimination and public-contract annotation corrected all three.

The first multi-command wrapper continued after a privacy failure and ended with exit `0`; that
wrapper is explicitly invalid evidence. All authoritative focused gates were rerun independently.

## Full regression proof

```text
npm run test:kit
exit 0 in 290.8 seconds

dashboard npx vitest run
64 files / 452 tests PASS in 11.37 seconds

dashboard npx tsc --noEmit
exit 0
```

The kit's `verify_records` warnings are simulated negative-path fixtures. No live Supabase read or
write occurred.

## Canonical tracking result

- P17-016 moved from `ready` to `in_progress`; readiness stays complete.
- Dashboard summary is 22 total, 11 done, 3 in progress, 0 ready, and 16/22 input-complete.
- P17-014 remains backlog/dependency-blocked.
- P17-021 remains backlog with all ten readiness gaps.
- No production dashboard UI changed; `/roadmap` derives this status from the canonical kit catalog.

## Unproved work that keeps P17-016 open

Wave A does not prove writer cutover, migrations, tenant repositories/RPCs/RLS, live database
isolation, purge scheduling, tenant deletion execution, dashboard minimized reads/actions, legacy
backfill/purge, optional RAG isolation, or authorized browser/database E2E. These remain Waves B–F
in `docs/roadmap/p17-016-privacy-implementation-plan.md`.

## Safety boundary

- No migration or live database command ran.
- No browser or provider process ran.
- No target `.Codex` path was modified.
- No sync, installation, publication, deployment, or push occurred.
- The verified 2026-08-14 backups and kit tag remain the rollback boundary.
