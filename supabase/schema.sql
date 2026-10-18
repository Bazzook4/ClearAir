-- Clear Air: one row per account holding the app state as JSON.
-- Safe to re-run.
create table if not exists public.quit_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.quit_state enable row level security;

drop policy if exists "read own"   on public.quit_state;
drop policy if exists "insert own" on public.quit_state;
drop policy if exists "update own" on public.quit_state;
drop policy if exists "delete own" on public.quit_state;

-- Only signed-in users, and only their own row.
create policy "read own"   on public.quit_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.quit_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.quit_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.quit_state for delete to authenticated using ((select auth.uid()) = user_id);
