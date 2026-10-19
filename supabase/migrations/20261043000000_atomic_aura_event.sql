create or replace function public.apply_aura_event(p_event_id text,p_user_id uuid,p_kind text,p_amount integer,p_source_type text,p_source_id uuid,p_qualifier text,p_title text,p_message text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event uuid; v_current integer; v_lifetime integer; v_next integer; v_next_lifetime integer; v_applied integer; result jsonb;
begin
  if p_user_id is null then raise exception 'missing user'; end if;
  begin v_event:=p_event_id::uuid; exception when others then v_event:=gen_random_uuid(); end;
  if exists(select 1 from public.aura_events where idempotency_key=p_event_id) then select jsonb_build_object('eventId',id,'userId',user_id,'awarded',false,'amount',delta,'currentAura',current_aura_after,'lifetimeAura',lifetime_aura_after) into strict result from public.aura_events where idempotency_key=p_event_id; return result; end if;
  select current_aura,lifetime_aura into v_current,v_lifetime from public.profiles where id=p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  v_current:=greatest(0,coalesce(v_current,100));v_lifetime:=greatest(v_current,coalesce(v_lifetime,v_current));v_applied:=p_amount;v_next:=greatest(0,v_current+v_applied);v_next_lifetime:=greatest(v_lifetime,v_next);
  update public.profiles set current_aura=v_next,lifetime_aura=v_next_lifetime,updated_at=timezone('utc',now()) where id=p_user_id;
  insert into public.aura_events(id,user_id,delta,reason,source_type,source_id,kind,amount,qualifier,title,message,metadata,idempotency_key,current_aura_after,lifetime_aura_after) values(v_event,p_user_id,v_applied,p_kind,p_source_type,p_source_id,p_kind,p_amount,p_qualifier,p_title,p_message,coalesce(p_metadata,'{}'),p_event_id,v_next,v_next_lifetime);
  return jsonb_build_object('eventId',v_event,'userId',p_user_id,'awarded',true,'amount',v_applied,'currentAura',v_next,'lifetimeAura',v_next_lifetime);
end $$;
revoke all on function public.apply_aura_event(text,uuid,text,integer,text,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_aura_event(text,uuid,text,integer,text,uuid,text,text,text,jsonb) to service_role;
