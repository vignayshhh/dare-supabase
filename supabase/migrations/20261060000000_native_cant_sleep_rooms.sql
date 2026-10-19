-- Typed, bounded Can't Sleep rooms. Participants are ephemeral Realtime Presence;
-- only rooms and durable messages are stored in Postgres.
create table if not exists public.cant_sleep_rooms (
  id text primary key,
  local_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  open_at timestamptz not null,
  close_at timestamptz not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (close_at > open_at),
  check (expires_at >= close_at)
);

create table if not exists public.cant_sleep_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.cant_sleep_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text,
  content text not null check (length(btrim(content)) between 1 and 700),
  kind text not null default 'user' check (kind in ('user', 'capsule', 'system')),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index if not exists cant_sleep_rooms_expiry_idx
  on public.cant_sleep_rooms(expires_at);
create index if not exists cant_sleep_messages_room_page_idx
  on public.cant_sleep_messages(room_id, created_at desc, id desc);
create index if not exists cant_sleep_messages_expiry_idx
  on public.cant_sleep_messages(expires_at);

alter table public.cant_sleep_rooms enable row level security;
alter table public.cant_sleep_messages enable row level security;

drop policy if exists cant_sleep_rooms_read on public.cant_sleep_rooms;
create policy cant_sleep_rooms_read on public.cant_sleep_rooms
  for select to authenticated
  using (expires_at > timezone('utc', now()));

drop policy if exists cant_sleep_messages_read on public.cant_sleep_messages;
create policy cant_sleep_messages_read on public.cant_sleep_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.cant_sleep_rooms room
      where room.id = room_id and room.expires_at > timezone('utc', now())
    )
  );

create or replace function public.ensure_cant_sleep_room(
  p_room_id text,
  p_local_date date,
  p_open_at timestamptz,
  p_close_at timestamptz,
  p_expires_at timestamptz
) returns public.cant_sleep_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_room public.cant_sleep_rooms;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if p_room_id !~ '^cant_sleep(_test)?_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or p_close_at <= p_open_at or p_expires_at < p_close_at then
    raise exception 'invalid_room_window';
  end if;

  insert into public.cant_sleep_rooms(
    id, local_date, status, open_at, close_at, expires_at, created_by
  ) values (
    p_room_id, p_local_date, 'open', p_open_at, p_close_at, p_expires_at, v_actor
  )
  on conflict (id) do update set
    status = case when public.cant_sleep_rooms.expires_at > timezone('utc', now()) then 'open' else public.cant_sleep_rooms.status end,
    updated_at = timezone('utc', now())
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.send_cant_sleep_message(
  p_room_id text,
  p_content text,
  p_kind text default 'user'
) returns public.cant_sleep_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles;
  v_room public.cant_sleep_rooms;
  v_message public.cant_sleep_messages;
begin
  if v_actor is null then raise exception 'unauthorized'; end if;
  if length(btrim(coalesce(p_content, ''))) not between 1 and 700
     or p_kind not in ('user', 'capsule', 'system') then
    raise exception 'invalid_message';
  end if;

  select * into v_room from public.cant_sleep_rooms
  where id = p_room_id for share;
  if v_room.id is null or v_room.status <> 'open'
     or v_room.expires_at <= timezone('utc', now()) then
    raise exception 'room_closed';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if v_profile.id is null then raise exception 'profile_not_found'; end if;

  insert into public.cant_sleep_messages(
    room_id, sender_id, username, display_name, avatar_url,
    content, kind, expires_at
  ) values (
    v_room.id, v_actor, v_profile.username,
    coalesce(nullif(v_profile.display_name, ''), v_profile.username),
    v_profile.avatar_url, btrim(p_content), p_kind, v_room.expires_at
  ) returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.ensure_cant_sleep_room(text, date, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.send_cant_sleep_message(text, text, text) from public;
grant execute on function public.ensure_cant_sleep_room(text, date, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.send_cant_sleep_message(text, text, text) to authenticated, service_role;
grant select on public.cant_sleep_rooms, public.cant_sleep_messages to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.cant_sleep_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Extend private Realtime authorization for active nightly rooms.
create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (
      topic like 'presence:user:%'
      and public.safe_uuid(split_part(topic, ':', 3)) is not null
      and (
        public.safe_uuid(split_part(topic, ':', 3)) = auth.uid()
        or public.are_friends(auth.uid(), public.safe_uuid(split_part(topic, ':', 3)))
      )
    )
    or (topic like 'typing:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'draft:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'conversation-state:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (
      topic like 'birthday-room:%'
      and exists (
        select 1 from public.birthday_rooms room
        where room.id = public.safe_uuid(split_part(topic, ':', 2))
          and (
            room.birthday_user_id = auth.uid()
            or exists (select 1 from public.birthday_room_members member where member.room_id = room.id and member.user_id = auth.uid())
            or exists (select 1 from public.birthday_room_participants participant where participant.room_id = room.id and participant.user_id = auth.uid())
          )
      )
    )
    or (
      topic like 'cant-sleep:%'
      and exists (
        select 1 from public.cant_sleep_rooms room
        where room.id = substring(topic from 12)
          and room.status = 'open'
          and room.expires_at > timezone('utc', now())
      )
    )
  );
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated, service_role;
