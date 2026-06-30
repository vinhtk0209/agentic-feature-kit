-- Migration 0002 — per-repo "running version" tracking (Part B, follow-up)
-- Run this manually in the Supabase SQL editor. Telemetry never runs DDL.
--
-- Why a separate table instead of a `repo` column on usage_logs:
--   `verify` events are inserted SERVER-SIDE by the verify_kit_token RPC. Adding a
--   param to that function is exactly what caused the overload-ambiguity bug on
--   2026-06-24, and the RPC source is not in this repo. So telemetry upserts the
--   repo's last run here via a DIRECT REST call instead — zero RPC risk.
--
-- Mirrors `installs` (one row per repo, upsert on `repo`) so the dashboard can
-- join the two per-repo:  installs = synced version · repo_runs = running version.

create table if not exists public.repo_runs (
  repo             text primary key,
  last_run_version text not null,
  last_run_at      timestamptz not null default now()
);

alter table public.repo_runs enable row level security;

-- Anon may insert a new repo_run row.
drop policy if exists "anon insert repo_runs" on public.repo_runs;
create policy "anon insert repo_runs"
  on public.repo_runs
  for insert
  to anon
  with check (true);

-- Anon may update an existing repo_run row (needed for upsert merge-duplicates).
drop policy if exists "anon update repo_runs" on public.repo_runs;
create policy "anon update repo_runs"
  on public.repo_runs
  for update
  to anon
  using (true)
  with check (true);

-- Anon may read repo_run rows (the dashboard reads with the anon key).
drop policy if exists "anon select repo_runs" on public.repo_runs;
create policy "anon select repo_runs"
  on public.repo_runs
  for select
  to anon
  using (true);
