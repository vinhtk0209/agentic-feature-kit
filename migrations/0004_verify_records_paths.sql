-- Migration 0004 — verify_records: add code_path + spec_name columns (W.3 split, kit v3.22).
-- Run this manually in the Supabase SQL editor. record-verify.ts never runs DDL.
--
-- WHAT: two nullable text columns recording the exact locations the content_hash covered —
--   code_path (the LEAF feature code dir, possibly deeply nested, e.g.
--   src/studio-home/tabs-section/class-management/tabs/ProgressReports) and spec_name (the flat
--   docs/specs/<name> folder, e.g. US-AD-095-ProgressReports). Written by pushVerifyRecord
--   (record-verify.ts) alongside the existing feature/content_hash fields.
--
-- WHY: observability/debuggability only. The W.3 split means a feature's code and its spec no longer
--   share one name (the single `feature` string could not address both — see
--   docs/design/measurement-layer-content-hash-split.md). Recording both makes a verify_records row
--   self-describing: a reviewer can see exactly which code tree + spec a hash covered.
--
-- NOT LOAD-BEARING for the sync guard: assertVerifiedForSync / countVerifiedRuns
--   (sync-to-targets.ts:571-572) select only on kit_version + verified. These columns never gate sync.
--
-- SAFE + ADDITIVE: verify_records is empty (0 rows) as of kit v3.22, so there is nothing to
--   backfill; nullable columns are a no-op on existing rows regardless. Idempotent (IF NOT EXISTS).
--
-- FAIL-OPEN INTEROP: if this migration has NOT been applied when a v3.22 capture runs, the POST that
--   includes code_path/spec_name 400s; pushVerifyRecord's try/catch swallows it (best-effort by
--   design) and the local git note stays valid — sync simply stays blocked until the row lands. So
--   applying 0004 is a documented Block-5 prerequisite, not a hard coupling.

alter table public.verify_records
  add column if not exists code_path text;

alter table public.verify_records
  add column if not exists spec_name text;
