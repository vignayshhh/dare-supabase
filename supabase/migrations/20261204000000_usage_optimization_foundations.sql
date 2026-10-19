-- Additive foundations for bounded cache invalidation and feed keyset reads.
create index if not exists cache_entries_expires_at_idx on public.cache_entries (expires_at) where expires_at is not null;
create index if not exists posts_circle_created_id_idx on public.posts (circle_id, created_at desc, id desc);

create or replace function public.increment_cache_entries(
  p_keys text[], p_ttl_ms bigint default 300000, p_refresh_expiry boolean default true
)
returns table(key text, value bigint, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare k text; v bigint; e timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  foreach k in array coalesce(p_keys, '{}'::text[]) loop
    select x.value, x.expires_at into v, e
    from public.increment_cache_entry(k, 1, p_ttl_ms, p_refresh_expiry) x;
    key := k; value := v; expires_at := e; return next;
  end loop;
end; $$;
revoke all on function public.increment_cache_entries(text[], bigint, boolean) from public, anon, authenticated;
grant execute on function public.increment_cache_entries(text[], bigint, boolean) to service_role;

-- Newly uploaded objects are tracked for safe, delayed cleanup. Historical objects
-- are intentionally outside this registry and therefore cannot be deleted by it.
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  bucket text not null,
  object_path text not null,
  upload_group_id uuid not null default gen_random_uuid(),
  role text not null default 'primary' check (role in ('primary','preview','poster')),
  state text not null default 'uploaded_unattached' check (state in ('pending_upload','uploaded_unattached','attached','pending_deletion','deleted','cleanup_failed')),
  created_at timestamptz not null default timezone('utc', now()),
  attached_at timestamptz,
  cleanup_eligible_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  retry_count integer not null default 0,
  last_error text,
  unique (bucket, object_path)
);
create index if not exists media_assets_cleanup_idx on public.media_assets (state, cleanup_eligible_at);
create index if not exists media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
alter table public.media_assets enable row level security;
drop policy if exists media_assets_owner_read on public.media_assets;
create policy media_assets_owner_read on public.media_assets for select to authenticated using (owner_id = auth.uid());
drop policy if exists media_assets_owner_insert on public.media_assets;
create policy media_assets_owner_insert on public.media_assets for insert to authenticated with check (owner_id = auth.uid());
revoke all on public.media_assets from anon;
grant select, insert on public.media_assets to authenticated;
grant all on public.media_assets to service_role;

create table if not exists public.media_asset_references (
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  reference_type text not null,
  reference_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (asset_id, reference_type, reference_id)
);
create index if not exists media_asset_refs_reference_idx on public.media_asset_references (reference_type, reference_id);
alter table public.media_asset_references enable row level security;
revoke all on public.media_asset_references from anon, authenticated;
grant all on public.media_asset_references to service_role;

create or replace function public.attach_media_asset(
  p_asset_id uuid, p_reference_type text, p_reference_id text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare changed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  insert into public.media_asset_references(asset_id, reference_type, reference_id)
  values (p_asset_id, p_reference_type, p_reference_id)
  on conflict do nothing;
  update public.media_assets
  set state = 'attached', attached_at = coalesce(attached_at, timezone('utc', now())), last_error = null
  where id = p_asset_id and state <> 'pending_deletion';
  changed := found;
  return changed;
end; $$;
revoke all on function public.attach_media_asset(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_media_asset(uuid, text, text) to service_role;

create or replace function public.detach_media_asset(
  p_asset_id uuid, p_reference_type text, p_reference_id text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare remaining integer; changed boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  delete from public.media_asset_references
  where asset_id = p_asset_id and reference_type = p_reference_type and reference_id = p_reference_id;
  select count(*) into remaining from public.media_asset_references where asset_id = p_asset_id;
  if remaining = 0 then
    update public.media_assets
    set state = 'uploaded_unattached', cleanup_eligible_at = timezone('utc', now()) + interval '24 hours'
    where id = p_asset_id and state = 'attached';
  end if;
  changed := found;
  return changed;
end; $$;
revoke all on function public.detach_media_asset(uuid, text, text) from public, anon, authenticated;
grant execute on function public.detach_media_asset(uuid, text, text) to service_role;

create or replace function public.cleanup_expired_cache_entries(p_limit integer default 500)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  with candidates as (
    select key from public.cache_entries
    where expires_at is not null and expires_at <= timezone('utc', now())
    order by expires_at asc limit greatest(1, least(p_limit, 500))
  )
  delete from public.cache_entries c using candidates x where c.key = x.key;
  get diagnostics removed = row_count;
  return removed;
end; $$;
revoke all on function public.cleanup_expired_cache_entries(integer) from public, anon, authenticated;
grant execute on function public.cleanup_expired_cache_entries(integer) to service_role;

create or replace function public.claim_unattached_media_assets(p_limit integer default 100)
returns setof public.media_assets language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  return query
  with candidates as (
    select a.id from public.media_assets a
    where a.state in ('uploaded_unattached','cleanup_failed')
      and a.retry_count < 5
      and a.cleanup_eligible_at <= timezone('utc', now())
      and not exists (select 1 from public.media_asset_references r where r.asset_id = a.id)
    order by a.cleanup_eligible_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.media_assets a
  set state = 'pending_deletion', last_error = null
  from candidates c where a.id = c.id
  returning a.*;
end; $$;
revoke all on function public.claim_unattached_media_assets(integer) from public, anon, authenticated;
grant execute on function public.claim_unattached_media_assets(integer) to service_role;
