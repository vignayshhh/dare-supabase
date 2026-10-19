create table if not exists public.daily_challenge_matches (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  status text not null default 'matched' check (status in ('matched','accepted','rejected')),
  matched_friend_id uuid not null references public.profiles(id) on delete cascade,
  matched_friend_username text not null default '', matched_friend_name text not null default '', matched_friend_avatar text not null default '',
  question text, conversation_id uuid references public.conversations(id) on delete set null, accepted_at timestamptz, rejected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()), unique(user_id, local_date)
);
create index if not exists daily_challenge_matches_user_date on public.daily_challenge_matches(user_id, local_date desc);
alter table public.daily_challenge_matches enable row level security;
create policy daily_challenge_matches_member on public.daily_challenge_matches for all to authenticated using (user_id=auth.uid() or matched_friend_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update on public.daily_challenge_matches to authenticated;
