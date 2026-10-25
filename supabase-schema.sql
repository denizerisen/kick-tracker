-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
create table if not exists public.kicks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kicked_at timestamptz not null
);

alter table public.kicks enable row level security;

create policy "own kicks" on public.kicks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
