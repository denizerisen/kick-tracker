-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
create table if not exists public.kicks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kicked_at timestamptz not null
);

alter table public.kicks enable row level security;

drop policy if exists "own kicks" on public.kicks;
create policy "own kicks" on public.kicks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- one row per user: the baby's name, shown in the UI
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  baby_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
