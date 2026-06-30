-- Migration 0001 — install-based version reporting (Part B)
-- Run this manually in the Supabase SQL editor. The sync script never runs DDL.
--
-- `installs` answers a DIFFERENT question than `usage_logs`:
--   usage_logs = what has been RUN (telemetry when someone runs the kit)
--   installs   = what has been SYNCED onto a repo (written by `npm run sync`)
-- One row per repo (upsert on `repo`); no history is kept by design.

create table if not exists public.installs (
  repo        text primary key,
  kit_version text not null,
  synced_at   timestamptz not null default now()
);

-- Row-Level Security: the sync script uses the PUBLIC anon key (same as telemetry).
-- RLS is what keeps that safe — anon may only insert/update/select THIS table.
alter table public.installs enable row level security;

-- Anon may insert a new install row.
drop policy if exists "anon insert installs" on public.installs;
create policy "anon insert installs"
  on public.installs
  for insert
  to anon
  with check (true);

-- Anon may update an existing install row.
-- Required for upsert: PostgREST `Prefer: resolution=merge-duplicates` performs
-- INSERT ... ON CONFLICT DO UPDATE, which needs the UPDATE policy too.
drop policy if exists "anon update installs" on public.installs;
create policy "anon update installs"
  on public.installs
  for update
  to anon
  using (true)
  with check (true);

-- Anon may read install rows (the dashboard reads with the anon key).
drop policy if exists "anon select installs" on public.installs;
create policy "anon select installs"
  on public.installs
  for select
  to anon
  using (true);
