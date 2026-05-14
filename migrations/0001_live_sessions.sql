-- Lives tracking: per-affiliate live session log.
-- Idempotent — safe to re-run.

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  product_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  gmv numeric(12,2) default 0,
  units integer default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists live_sessions_profile_started on public.live_sessions (profile_id, started_at desc);

-- Enforce at most one in-progress (ended_at is null) session per profile.
create unique index if not exists live_sessions_one_active on public.live_sessions (profile_id) where ended_at is null;

alter table public.live_sessions enable row level security;

drop policy if exists "live_sessions_select_own" on public.live_sessions;
create policy "live_sessions_select_own" on public.live_sessions
  for select using (auth.uid() = profile_id);

drop policy if exists "live_sessions_insert_own" on public.live_sessions;
create policy "live_sessions_insert_own" on public.live_sessions
  for insert with check (auth.uid() = profile_id);

drop policy if exists "live_sessions_update_own" on public.live_sessions;
create policy "live_sessions_update_own" on public.live_sessions
  for update using (auth.uid() = profile_id);

drop policy if exists "live_sessions_delete_own" on public.live_sessions;
create policy "live_sessions_delete_own" on public.live_sessions
  for delete using (auth.uid() = profile_id);
