-- Codemine (VibePlatform) — master backend schema.
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Storage buckets are created by scripts/setup-buckets.mjs; this file creates the
-- tables, RLS policies, and the storage access policies.

-- ── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Untitled project',
  prompt       text,
  skill        text,
  sandbox_id   text,
  preview_url  text,
  deploy_url   text,
  snapshot_path text,                 -- storage path of the latest file snapshot
  tokens_used  bigint not null default 0,  -- cumulative model tokens spent on this project
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ── runs + run_events (durable-runs STEP 1: run rows + dual-write event log) ──
-- A `run` is one generation invocation. `run_events` is the canonical append-only
-- log of every server-emitted stream part (a shadow copy of the live SSE stream),
-- enabling reconnect/replay via GET /api/runs/:id/stream. Server writes with the
-- service role (RLS bypass); browsers read RLS-scoped to the owning user.
create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  project_id    text,
  status        text not null default 'running',
  phase_cursor  int not null default 0,
  manifest      jsonb,
  brief         jsonb,
  sandbox_id    text,
  snapshot_path text,
  tokens_used   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.run_events (
  id         bigserial primary key,
  run_id     uuid references public.runs(id) on delete cascade,
  seq        bigserial,
  type       text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists run_events_run_seq_idx on public.run_events(run_id, seq);

alter table public.runs enable row level security;
alter table public.run_events enable row level security;

drop policy if exists "runs_select_own" on public.runs;
create policy "runs_select_own" on public.runs for select using (auth.uid() = user_id);

drop policy if exists "run_events_select_own" on public.run_events;
create policy "run_events_select_own" on public.run_events for select using (
  exists (select 1 from public.runs r where r.id = run_events.run_id and r.user_id = auth.uid())
);

-- ── storage policies (buckets created by scripts/setup-buckets.mjs) ───────────
-- project-snapshots (private): each user only sees their own  user_id/...  folder.
-- The server uses the service role (bypasses RLS) for save/restore; these policies
-- are defense-in-depth for any client access.
drop policy if exists "snapshots_rw_own" on storage.objects;
create policy "snapshots_rw_own" on storage.objects for all
  using (bucket_id = 'project-snapshots' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'project-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- assets (public-read): users write only into their own folder; anyone can read
-- (so the generated apps can reference the CDN URL).
drop policy if exists "assets_write_own" on storage.objects;
drop policy if exists "assets_read_public" on storage.objects;
create policy "assets_write_own" on storage.objects for insert
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "assets_read_public" on storage.objects for select
  using (bucket_id = 'assets');
