create or replace function public.celebrate_legacy_aura_event(p_event_id text,p_user_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare d jsonb;
begin
  select data into d from public.data_documents where collection='aura_events' and document_id=p_event_id for update;
  if d is null or d->>'user_id' <> p_user_id or d->>'celebrated_at' is not null then return false; end if;
  update public.data_documents set data=jsonb_set(data,'{celebrated_at}',to_jsonb(timezone('utc',now())::text)),updated_at=timezone('utc',now()) where collection='aura_events' and document_id=p_event_id;
  return true;
end; $$;
revoke all on function public.celebrate_legacy_aura_event(text,text) from public;
grant execute on function public.celebrate_legacy_aura_event(text,text) to service_role;
