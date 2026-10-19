create table if not exists public.community_challenge_room_messages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '', display_name text not null default '', avatar_url text not null default '',
  content text not null check (char_length(content) between 1 and 700),
  client_created_at bigint,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists community_challenge_room_messages_cursor on public.community_challenge_room_messages(challenge_id, created_at asc, id asc);
alter table public.community_challenge_room_messages enable row level security;
create policy community_room_messages_member on public.community_challenge_room_messages for all to authenticated using (exists(select 1 from public.community_challenge_joins j where j.challenge_id=community_challenge_room_messages.challenge_id and j.user_id=auth.uid())) with check (sender_id=auth.uid() and exists(select 1 from public.community_challenge_joins j where j.challenge_id=community_challenge_room_messages.challenge_id and j.user_id=auth.uid()));
grant select,insert,update,delete on public.community_challenge_room_messages to authenticated;
