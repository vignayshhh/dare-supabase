create table if not exists public.conversation_game_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  type text not null,
  title text not null,
  participants uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('waiting','active','completed')),
  joined_by jsonb not null default '{}'::jsonb,
  exited_by jsonb not null default '{}'::jsonb,
  event_id uuid references public.message_events(id) on delete set null,
  current_round_id uuid,
  round_index integer not null default 0,
  darren_line text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists conversation_game_sessions_conversation on public.conversation_game_sessions(conversation_id, updated_at desc, id desc);

create table if not exists public.conversation_game_rounds (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  session_id uuid not null references public.conversation_game_sessions(id) on delete cascade,
  type text not null,
  status text not null check (status in ('voting','revealed','complete')),
  round_index integer not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  prompt text not null,
  left_option text,
  right_option text,
  symbol text,
  custom boolean not null default false,
  participants uuid[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  result text,
  darren_line text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists conversation_game_rounds_session on public.conversation_game_rounds(session_id, round_index asc, id asc);
alter table public.conversation_game_sessions enable row level security;
alter table public.conversation_game_rounds enable row level security;
create policy conversation_game_sessions_member on public.conversation_game_sessions for all to authenticated using (public.is_conversation_member(conversation_id)) with check (public.is_conversation_member(conversation_id));
create policy conversation_game_rounds_member on public.conversation_game_rounds for all to authenticated using (public.is_conversation_member(conversation_id)) with check (public.is_conversation_member(conversation_id));
grant select, insert, update, delete on public.conversation_game_sessions, public.conversation_game_rounds to authenticated;
