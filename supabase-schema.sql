-- Clear Air: one row per user holding the app state as JSON.
create table if not exists public.quit_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.quit_state enable row level security;

create policy "read own"   on public.quit_state for select using (auth.uid() = user_id);
create policy "insert own" on public.quit_state for insert with check (auth.uid() = user_id);
create policy "update own" on public.quit_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.quit_state for delete using (auth.uid() = user_id);
