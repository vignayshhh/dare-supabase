-- Make tracked-media cleanup recoverable after worker crashes and prevent
-- attachments racing a claimed deletion.
alter table if exists public.media_assets
  add column if not exists cleanup_claimed_at timestamptz;

create index if not exists media_assets_claimed_idx
  on public.media_assets (state, cleanup_claimed_at)
  where state = 'pending_deletion';

create or replace function public.attach_media_asset(
  p_asset_id uuid, p_reference_type text, p_reference_id text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare asset_state text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select state into asset_state from public.media_assets where id = p_asset_id for update;
  if asset_state is null or asset_state in ('pending_deletion','deleted') then return false; end if;
  insert into public.media_asset_references(asset_id, reference_type, reference_id)
  values (p_asset_id, p_reference_type, p_reference_id)
  on conflict do nothing;
  update public.media_assets
  set state = 'attached', attached_at = coalesce(attached_at, timezone('utc', now())),
      cleanup_claimed_at = null, last_error = null
  where id = p_asset_id;
  return true;
end; $$;
revoke all on function public.attach_media_asset(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_media_asset(uuid, text, text) to service_role;

create or replace function public.claim_unattached_media_assets(p_limit integer default 100)
returns setof public.media_assets language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  -- A crashed worker must not leave assets permanently pending. The two-hour
  -- lease is longer than one bounded Storage deletion batch.
  update public.media_assets
  set state = 'cleanup_failed', cleanup_claimed_at = null,
      last_error = coalesce(last_error, 'cleanup lease expired')
  where state = 'pending_deletion'
    and cleanup_claimed_at < timezone('utc', now()) - interval '2 hours'
    and not exists (select 1 from public.media_asset_references r where r.asset_id = media_assets.id);

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
  set state = 'pending_deletion', cleanup_claimed_at = timezone('utc', now()), last_error = null
  from candidates c where a.id = c.id
  returning a.*;
end; $$;
revoke all on function public.claim_unattached_media_assets(integer) from public, anon, authenticated;
grant execute on function public.claim_unattached_media_assets(integer) to service_role;
