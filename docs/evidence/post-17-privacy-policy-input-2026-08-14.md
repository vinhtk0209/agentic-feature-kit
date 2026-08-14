# P17-016 Privacy Policy Input Packet Evidence — 2026-08-14

## Outcome

The operator decision packet for P17-016 is complete and locally verified. The proposed policy is
recorded in `docs/design/adr-002-privacy-tenant-retention-boundary.md` with exact choices
`T1/R1/C1/L1/E1` and a copyable approval statement.

This is input preparation only. The ADR remains **Proposed**, P17-016 remains `backlog`, and its
readiness remains false with `operator-approved retention and tenant policy` missing. No runtime,
schema, dashboard UI, migration, external database, provider, sync, or push action occurred.

## Current-state reconciliation

The packet was derived from the current source and migration boundaries, including:

- dashboard `command_runs.args` and `command_runs.log_tail` free text plus its legacy anonymous
  policy;
- kit telemetry feature names and raw error messages;
- verification repository/feature/path/spec-name metadata and legacy anonymous access;
- P17-015 closed progress metadata, expiry, and service-role RPCs without tenant identity;
- version dossier/lesson JSON or title content protected by permanent delete-rejecting triggers;
- Semantic Spec source references, requirement/scenario text, contract values, and exact quotes;
- local evidence manifest paths, feature names, and transcripts; and
- dashboard email/role RBAC without tenant membership context.

The proposed boundary therefore centralizes only exact-field, tenant-scoped operational metadata.
Private content remains local by default, optional learning/RAG/provider reuse is off by default,
and append-only evidence is immutable only during a finite retention window.

## Proposed operator choices

| Choice | Proposal |
|---|---|
| `T1` | Opaque multi-tenant identity and metadata-only central storage. |
| `R1` | 0d private central content; 24h short-lived; 30d standard; 180d learning aggregate; 365d audit/release. |
| `C1` | Essential operations only when enabled; learning, indexing, cross-provider evaluation, and diagnostic content off. |
| `L1` | Quarantine legacy rows, map/sanitize explicitly, and purge unmapped rows within 30 days. |
| `E1` | Finite immutability, central metadata references only, and no default legal hold. |

Required approval statement:

`APPROVE P17-016 POLICY v1: tenant=T1, retention=R1, consent=C1, legacy=L1, evidence=E1.`

Approval unlocks readiness reconciliation only. Separate authorization remains required for any
external database write/migration, provider execution, installation, publication, sync, or push.

## Verification

1. `npm run test:post-17-privacy-decision`
   - First run: RED because one required sentence wrapped across a Markdown newline while the test
     expected a literal physical line.
   - Correction: normalize whitespace in the assertion; policy wording and readiness stayed
     unchanged.
   - Authoritative rerun: PASS — 16 sections, five data classes, `T1/R1/C1/L1/E1` proposed, and
     P17-016 still input-blocked.
2. `npm run test:post-17-roadmap`
   - PASS — 22 tasks, four initiatives.
3. `git diff --check`
   - PASS before the evidence write.
4. Exact changed-file secret scan
   - PASS — one positive control, three files, zero hits before this evidence file was added.
5. `npm run test:kit`
   - PASS — exit `0` in 211.2 seconds.
   - The chain includes the new privacy decision gate plus all existing Project Intelligence,
     Orchestrator, provider distribution, routing, cross-platform, worktree/browser, Playwright,
     prompt-budget, version/index, and lesson-sync coverage.

Final diff and exact-file secret scans are required after this evidence file is added and before a
local proposal checkpoint is created.

## Safety and limitations

- No claim of legal or regulatory compliance is made.
- No P17-016 implementation is complete or authorized.
- No Supabase migration or live write occurred.
- No target `.Codex` directory was touched.
- No sync or push occurred.
- The verified 2026-08-14 kit/dashboard rollback snapshots remain the recovery boundary.
