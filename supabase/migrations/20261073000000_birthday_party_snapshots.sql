create table if not exists public.birthday_party_snapshots (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.birthday_rooms(id) on delete cascade, birthday_user_id uuid not null references public.profiles(id) on delete cascade, author_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null default '', description text not null default '', participant_count integer not null default 0, energy integer not null default 0, created_at timestamptz not null default timezone('utc', now())
);
create index if not exists birthday_party_snapshots_room on public.birthday_party_snapshots(room_id, created_at desc, id desc);
alter table public.birthday_party_snapshots enable row level security;
create policy birthday_party_snapshots_member on public.birthday_party_snapshots for select to authenticated using (exists(select 1 from public.birthday_room_participants p where p.room_id=birthday_party_snapshots.room_id and p.user_id=auth.uid()) or birthday_user_id=auth.uid());
create policy birthday_party_snapshots_author on public.birthday_party_snapshots for insert to authenticated with check (author_id=auth.uid());
grant select,insert on public.birthday_party_snapshots to authenticated;
