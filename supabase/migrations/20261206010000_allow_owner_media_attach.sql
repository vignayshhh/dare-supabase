-- Browser-originated content mutations may attach their own newly uploaded
-- asset. Service-role maintenance can still attach on behalf of server writes.
create or replace function public.attach_media_asset(
  p_asset_id uuid, p_reference_type text, p_reference_id text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare asset_state text; asset_owner uuid;
begin
  select state, owner_id into asset_state, asset_owner
  from public.media_assets where id = p_asset_id for update;
  if asset_state is null or asset_state in ('pending_deletion','deleted') then return false; end if;
  if auth.role() <> 'service_role' and asset_owner <> auth.uid() then raise exception 'media_asset_owner_required'; end if;
  insert into public.media_asset_references(asset_id, reference_type, reference_id)
  values (p_asset_id, p_reference_type, p_reference_id)
  on conflict do nothing;
  update public.media_assets
  set state = 'attached', attached_at = coalesce(attached_at, timezone('utc', now())),
      cleanup_claimed_at = null, last_error = null
  where id = p_asset_id;
  return true;
end; $$;
revoke all on function public.attach_media_asset(uuid, text, text) from public, anon;
grant execute on function public.attach_media_asset(uuid, text, text) to authenticated, service_role;
