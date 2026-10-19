create table if not exists public.close_friends (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  close_friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_id, close_friend_id),
  check (owner_id <> close_friend_id)
);
create index if not exists close_friends_target_idx on public.close_friends(close_friend_id, owner_id);
alter table public.close_friends enable row level security;
drop policy if exists close_friends_select on public.close_friends;
create policy close_friends_select on public.close_friends for select to authenticated using (owner_id = auth.uid() or close_friend_id = auth.uid());
drop policy if exists close_friends_insert on public.close_friends;
create policy close_friends_insert on public.close_friends for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists close_friends_delete on public.close_friends;
create policy close_friends_delete on public.close_friends for delete to authenticated using (owner_id = auth.uid());

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80), created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()), deleted_at timestamptz
);
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()), primary key (circle_id, user_id)
);
create index if not exists circles_owner_updated_idx on public.circles(owner_id, updated_at desc, id desc);
create index if not exists circle_members_user_idx on public.circle_members(user_id, circle_id);
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
drop policy if exists circles_owner_all on public.circles;
create policy circles_owner_all on public.circles for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists circle_members_owner_all on public.circle_members;
create policy circle_members_owner_all on public.circle_members for all to authenticated using (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid())) with check (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid()));
grant select, insert, update, delete on public.close_friends, public.circles, public.circle_members to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.close_friends; alter publication supabase_realtime add table public.circles; exception when duplicate_object then null; when undefined_object then null; end $$;
