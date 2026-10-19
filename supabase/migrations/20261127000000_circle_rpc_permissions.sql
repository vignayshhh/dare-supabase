begin;
CREATE OR REPLACE FUNCTION public.celebrate_aura_event(p_event_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if auth.uid() is null or p_user_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if p_user_id is null then raise exception 'missing user' using errcode='22023'; end if;
  update public.aura_events set celebrated_at=coalesce(celebrated_at,timezone('utc',now()))
  where id=p_event_id and user_id=p_user_id;
  if not found then raise exception 'aura event not found' using errcode='P0002'; end if;
end;
$function$
;
grant execute on function public.celebrate_aura_event(uuid,uuid) to authenticated;
grant execute on function public.review_dare_native(uuid,text,uuid) to authenticated;
create or replace function public.is_conversation_member(c uuid) returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from conversation_members m join conversations v on v.id=m.conversation_id where m.conversation_id=c and m.user_id=auth.uid() and public.is_circle_member(v.circle_id,auth.uid()))
$$;
commit;
