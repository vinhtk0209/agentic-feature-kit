# P17-016 Wave C2 schema inventory and migration design evidence

**Date:** 2026-08-16
**Status:** Complete locally — offline design only
**Roadmap task:** P17-016
**Locked scope:** `inventory=I1, ownership=O1, ordering=D1, foundation=F1, quarantine=Q1, access=A1, auth=H1, rollback=R1, execution=X1, evidence=E1`

## Result

Wave C2 now has a reproducible live `public` catalog, an exact direct table-ACL supplement, one
dashboard-owned additive forward design, one fail-closed rollback design, and executable static
attacks in both repositories. The artifacts cover all 20 live relations and the exact 17-policy
manifest without creating a migration file or enabling a central sink.

This is offline design evidence. No migration was promoted or executed, no tenant was created, no
legacy row was read or mapped, and no two-tenant isolation or rollback rehearsal is claimed.

## Preconditions and rollback boundary

- Starting kit head: `013ec62e2ca55132ef4f7eeffc0d037efa893688`, local `main`.
- Starting dashboard head: `8d021898944cbf2f062f3b81231b0139c1e1c767`, required feature branch.
- Verified 2026-08-16 kit backup: 20,403,218 bytes, SHA-256
  `B4CE146D7F510A3A7938B508F66529670991ECB5626C68B4D6119A3A4677C45C`, 529 entries, zero
  forbidden path segments, tag `backup/2026-08-16` at the starting kit head.
- Verified 2026-08-16 dashboard backup: 5,593,016 bytes, SHA-256
  `8AF683C6AFDF1E47FA0FD2D4C0F9FBEAFF2C2F83925AF90FECDF0F944A1B897B`, 510 entries, zero
  forbidden path segments, tag `backup/2026-08-16` at the starting dashboard head.
- CodeGraph was absent in both repositories, so exact source and migration anchors were inspected
  directly.

## Live read-only inputs

The signed-in Supabase SQL Editor used separate snippets so the operator's previous draft remained
untouched. Only metadata `SELECT` statements ran on project `vkuojxgvkxndftenrdno`.

The primary normalized catalog binds canonical source SHA-256
`e21954c4d0c30f15839a9fee3e15478135a54e4f5337f33ec872ea10c7fa7144` over 127,644 bytes:

- 20 relations, 199 columns, 96 constraints, 53 indexes, 17 policies;
- 507 `information_schema.role_table_grants` rows, 12 function signatures/hashes, 3 triggers;
- zero public enums/sequences; and
- RLS enabled on all 20 relations, with `FORCE RLS` on none.

Final review proved the information-schema view omitted live `MAINTAIN` ACL entries and was not a
sufficient `PUBLIC`-grantee proof. The supplemental `aclexplode` query binds 580 direct ACL entries
under SHA-256 `7e4be34c27d919534204a3a850f9714308ae8ba98527c596b938496ffe836996`:

- 20/20 expected relations, grantor only `postgres`;
- grantees exactly `anon`, `authenticated`, `postgres`, and `service_role`;
- zero `PUBLIC` and zero grantable entries; and
- progress service-role privileges exactly
  `MAINTAIN/REFERENCES/SELECT/TRIGGER/TRUNCATE`, not the initially assumed select-only shape.

No application row body was read. No application function was invoked. Raw function bodies from
the bounded verifier audit were not persisted.

## Review findings corrected

1. The live three-argument verifier mutates counters, inserts usage events, and returns raw owner
   identity; the two-argument overload also mutates/inserts; `token_id_for` is an exposed security-
   definer lookup. H1 now blocks before DDL until C3 supplies one bounded `STABLE` three-argument
   auth function, removes raw owner output and dynamic/DML behavior, drops the obsolete overload,
   and makes the helper unavailable to all app roles including inherited `PUBLIC` execution.
2. Forward preflight originally checked only allowed grant principals. It now compares the exact
   expected and live 580-entry relation/grantor/grantee/privilege/grantable sets in both directions.
3. Relation coverage originally relied on occurrence counts. Tests now parse and compare both exact
   `FOREACH relation_name` manifests.
4. Rollback restores exactly 17 prior policies and broad direct anon/authenticated grants for only
   the 17 relations that had them. It refuses any foundation row or classified legacy row and never
   runs row DML or `CASCADE`.

## Verification results

| Gate | Result |
|---|---|
| Missing-plan RED | PASS — validator exited on the absent accepted plan |
| Missing-design RED | PASS — accepted plan advanced to the absent forward artifact |
| Dashboard focused design attacks | PASS — 1 file, 5/5 tests |
| Kit cross-repository C2 validator | PASS — I1/O1/D1/F1/Q1/A1/H1/R1/X1/E1 |
| Exact TypeScript | PASS — 5.9.3, ES2022/bundler, strict, `skipLibCheck=false` |
| SQL static structure | PASS — balanced quotes/parentheses/dollar tags and one transaction each |
| C1/B2–B4/privacy/registry/roadmap/topology companions | PASS |
| Full kit on exact source SHA | PASS — exit 0, 253.5 seconds, 1,577 output lines |
| Full dashboard on exact source SHA | PASS — 80 files, 536/536 tests, 11.32 seconds |
| Prompt budget | PASS — 163,206 / 176,128 bytes |
| Lesson synchronization | PASS — 60/60 |

The dashboard-specific `pending-todos` memory has no file or callable provider in this session, so
the workspace `HANDOFF.md` remains the durable cross-session mirror.

## Source and credential denial

Two independent matchers first matched synthetic controls, then found zero row-DML statements in
the four SQL artifacts and zero staged migration/runtime/generated-source paths in either exact
manifest. Focused attacks additionally reject dynamic row DML, destructive legacy drops, missing
preconditions, asymmetric ACL comparison, `PUBLIC` substitutions, missing `MAINTAIN`, non-null
legacy tenant IDs, and replacement browser policies.

Five credential detectors matched all synthetic controls and found zero GitHub token, Supabase
service key, bearer token, JWT, or private-key hits over 731 kit and 6,528 dashboard staged added
lines. Both cached diff whitespace gates passed.

## Local source closeout

- Kit source commit: `65c1a4d28d8147bb4f4957a2d767eb1b533ddb9b`
  (`docs: lock wave c2 migration design`), exactly 3 files, 731 insertions, 1 deletion.
- Dashboard source commit: `d4d363def16cc00e7ea97159319777613efd644f`
  (`docs: add wave c2 schema catalog`), exactly 8 files, 6,528 insertions.
- Normal kit `spec-integrity` hook passed.
- No push, sync, migration, deploy, canary, target edit, or target `.Codex` mutation occurred.

## Next gate and non-claims

C3 must re-capture/reconcile both catalog hashes, prove migration-number availability, implement
tenant-required repositories/RPCs and trusted attestation, remediate H1, remove unscoped service-
role application access, and promote the design only after static plus authorized disposable-
database proof. C5 remains the only live migration/two-tenant/rollback-rehearsal gate.

C2 does not claim a tenant-safe database, membership or consent enforcement, legacy sanitization,
central persistence, migration readiness for production, rollback proof, Wave C completion, or
P17-016 completion.
