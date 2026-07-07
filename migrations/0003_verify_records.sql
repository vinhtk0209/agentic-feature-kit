-- Migration 0003 — verify_records: computed verify verdicts, per feature-run (A1.3).
-- Run this manually in the Supabase SQL editor. record-verify.ts never runs DDL.
--
-- WHAT: one row per feature verification run, written TARGET-side by the B11 capture wrapper
--   (record-verify.ts pushVerifyRecord) right after it writes the local git note. Carries the
--   COMPUTED verdict (verified = f(tier_a_exit, tier_b_exit)) + the content_hash pin.
--
-- WHY: the kit-side sync guard (assertVerifiedForSync in sync-to-targets.ts) cannot read a target
--   repo's local git note, so it consults THIS table instead. The guard's check is GLOBAL, not
--   per-target (Gap B):
--       SELECT count(*) FROM verify_records WHERE kit_version = <version> AND verified = true;
--   i.e. "has the kit version being synced been proven by >=1 real exit-code-based verification
--   ANYWHERE?" Evolutions in commands/ / prompt-evolution.md are global — proven by any clean run,
--   NOT tied to the specific target being synced (a target that never ran B0-B12 must still be
--   syncable once the version is proven elsewhere). Fail-CLOSED: no row => sync refuses.
--
-- HONEST SCOPE (A1.4 — KNOWN, ACCEPTED v1 LIMIT): the anon key that writes this table is PUBLIC
--   (the same one telemetry.ts exposes target-side), so a verify_records row is exactly as forgeable
--   as the git note. This table is NOT an adversarial control and must not be described as one. Its
--   job is (1) give the sync guard verify VISIBILITY it otherwise has zero of, and (2) catch
--   NON-adversarial self-report (a run that never computed a real exit code). True tamper-resistance
--   needs an off-host secret (CI / out-of-band runner token) — a v2 requirement.
--
-- Mirrors installs / repo_runs: one row per run (upsert on runner_run_id), anon insert/update/select
--   under RLS. tier_a_exit / tier_b_exit are snake_case (Postgres folds unquoted identifiers to
--   lowercase; record-verify.ts sends matching snake_case keys).

create table if not exists public.verify_records (
  runner_run_id text primary key,
  repo          text not null,
  head_sha      text not null default '',
  feature       text not null,
  verified      boolean not null,
  tier_a_exit   integer not null,          -- Tier A always runs, so never null
  tier_b_exit   integer,                   -- null when Tier B legitimately skipped (opt-out at B10.5)
  content_hash  text not null,
  kit_version   text not null,
  created_at    timestamptz not null default now()
);

-- Matches the kit-side sync guard's exact query (global count by version, verified rows only).
create index if not exists verify_records_kitver_verified_idx
  on public.verify_records (kit_version)
  where verified;

alter table public.verify_records enable row level security;

-- Anon may insert a new verify_records row (target-side B11 wrapper).
drop policy if exists "anon insert verify_records" on public.verify_records;
create policy "anon insert verify_records"
  on public.verify_records
  for insert
  to anon
  with check (true);

-- Anon may update an existing row (needed for upsert merge-duplicates on re-verify).
drop policy if exists "anon update verify_records" on public.verify_records;
create policy "anon update verify_records"
  on public.verify_records
  for update
  to anon
  using (true)
  with check (true);

-- Anon may read rows (the kit-side sync guard reads with the anon key).
drop policy if exists "anon select verify_records" on public.verify_records;
create policy "anon select verify_records"
  on public.verify_records
  for select
  to anon
  using (true);
