-- Read-optimized feed membership. Postgres remains authoritative for posts;
-- this table stores only per-user delivery/order metadata.
create table if not exists public.feed_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post','truth','dare')),
  source_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  participant_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, kind, source_id)
);
create index if not exists feed_items_user_kind_cursor
  on public.feed_items(user_id, kind, created_at desc, source_id desc);
create index if not exists feed_items_source on public.feed_items(source_id, kind);
alter table public.feed_items enable row level security;
drop policy if exists feed_items_owner_read on public.feed_items;
create policy feed_items_owner_read on public.feed_items for select to authenticated using (user_id = auth.uid());
drop policy if exists feed_items_owner_write on public.feed_items;
create policy feed_items_owner_write on public.feed_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.feed_items from anon;
grant select,insert,update,delete on public.feed_items to authenticated, service_role;
