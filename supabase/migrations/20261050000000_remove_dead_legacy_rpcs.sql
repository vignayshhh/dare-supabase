-- Remove remaining dead RPC bodies that referenced retired storage and repair
-- the native Aura insert column list.

create or replace function public.apply_aura_event(p_event_id text,p_user_id uuid,p_kind text,p_amount integer,p_source_type text,p_source_id uuid,p_qualifier text,p_title text,p_message text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_event uuid; v_current integer; v_lifetime integer; v_next integer; v_next_lifetime integer; v_applied integer; result jsonb;
begin
  if p_user_id is null then raise exception 'missing user'; end if;
  begin v_event:=p_event_id::uuid; exception when others then v_event:=gen_random_uuid(); end;
  if exists(select 1 from public.aura_events where idempotency_key=p_event_id) then
    select jsonb_build_object('eventId',id,'userId',user_id,'awarded',false,'amount',delta,'currentAura',current_aura_after,'lifetimeAura',lifetime_aura_after) into strict result from public.aura_events where idempotency_key=p_event_id;
    return result;
  end if;
  select current_aura,lifetime_aura into v_current,v_lifetime from public.profiles where id=p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  v_current:=greatest(0,coalesce(v_current,100)); v_lifetime:=greatest(v_current,coalesce(v_lifetime,v_current)); v_applied:=p_amount; v_next:=greatest(0,v_current+v_applied); v_next_lifetime:=greatest(v_lifetime,v_next);
  update public.profiles set current_aura=v_next,lifetime_aura=v_next_lifetime,updated_at=timezone('utc',now()) where id=p_user_id;
  insert into public.aura_events(id,user_id,delta,reason,source_type,source_id,kind,qualifier,title,message,metadata,idempotency_key,current_aura_after,lifetime_aura_after)
  values(v_event,p_user_id,v_applied,p_kind,p_source_type,p_source_id,p_kind,p_qualifier,p_title,p_message,coalesce(p_metadata,'{}'),p_event_id,v_next,v_next_lifetime);
  return jsonb_build_object('eventId',v_event,'userId',p_user_id,'awarded',true,'amount',v_applied,'currentAura',v_next,'lifetimeAura',v_next_lifetime);
end;
$$;

create or replace function public.apply_moderation_aura_native(p_action text,p_admin_id uuid,p_target_id uuid,p_source_id uuid,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_kind text; v_delta integer; v_event text;
begin
  if p_action='award_exceptional_dare' then
    select receiver_id into v_user from public.dares where id=p_source_id and status='COMPLETED';
    if v_user is null then raise exception 'verified_dare_required'; end if;
    v_kind:='dare_exceptional'; v_delta:=500;
  elsif p_action='deduct_aura' then
    if p_target_id is null or not exists(select 1 from public.reports where id=p_source_id and status='RESOLVED') then raise exception 'resolved_report_required'; end if;
    v_user:=p_target_id; v_kind:='moderation_deduction'; v_delta:=-greatest(1,least(10000,coalesce(p_amount,1)));
  else raise exception 'bad_action'; end if;
  v_event:=md5(coalesce(v_user::text,'')||'|'||v_kind||'|'||coalesce(p_source_id::text,'')||'|'||coalesce(p_admin_id::text,''));
  return public.apply_aura_event(v_event,v_user,v_kind,v_delta,case when p_action='deduct_aura' then 'report' else 'dare' end,p_source_id,null,p_action,left(coalesce(p_reason,''),500),jsonb_build_object('adminId',p_admin_id));
end;
$$;
revoke all on function public.apply_moderation_aura_native(text,uuid,uuid,uuid,integer,text) from public;
grant execute on function public.apply_moderation_aura_native(text,uuid,uuid,uuid,integer,text) to service_role;

create or replace function public.mark_chat_invite_entered_native(p_invite_id text,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_data jsonb;
begin
  update public.feature_chat_invites_records
  set data=jsonb_set(data,'{entered_at}',to_jsonb(timezone('utc',now())::text)),updated_at=timezone('utc',now())
  where collection='chat_invites' and document_id=p_invite_id and data->>'invitee_id'=p_user_id::text and data->>'status'='accepted' and not (data ? 'entered_at')
  returning data into v_data;
  return v_data;
end;
$$;
revoke all on function public.mark_chat_invite_entered_native(text,uuid) from public;
grant execute on function public.mark_chat_invite_entered_native(text,uuid) to authenticated,service_role;

drop function if exists public.merge_data_document(text,text,jsonb,boolean);
drop function if exists public.ensure_legacy_aura_profile(text);
drop function if exists public.claim_legacy_feed_fanout_job(text);
drop function if exists public.mark_legacy_chat_invite_entered(text,text);
drop function if exists public.mutate_legacy_verdict_vote(text,text,text,jsonb,boolean);
drop function if exists public.create_legacy_verdict_comment(text,text,text,text,text,jsonb);
drop function if exists public.apply_legacy_aura_delta(text,text,text,integer,text,text,jsonb);
drop function if exists public.apply_legacy_moderation_aura(text,text,text,text,integer,text);
drop function if exists public.resolve_legacy_drama(text,text,text);
