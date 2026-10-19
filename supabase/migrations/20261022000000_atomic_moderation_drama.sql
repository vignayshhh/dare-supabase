create or replace function public.apply_legacy_aura_delta(p_user_id text,p_event_id text,p_kind text,p_amount integer,p_source_type text,p_source_id text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u jsonb; cur integer; life integer; nxt integer; next_life integer; now_text text:=timezone('utc',now())::text;
begin
  if exists(select 1 from public.data_documents where collection='aura_events' and document_id=p_event_id) then return jsonb_build_object('userId',p_user_id,'awarded',false); end if;
  select data into u from public.data_documents where collection='users' and document_id=p_user_id for update;
  if u is null then raise exception using errcode='P0002',message='user_not_found'; end if;
  cur:=greatest(0,coalesce(nullif(u->>'current_aura','')::integer,nullif(u->>'aura','')::integer,100)); life:=greatest(cur,coalesce(nullif(u->>'lifetime_aura','')::integer,cur)); nxt:=greatest(0,cur+p_amount); next_life:=life+greatest(0,nxt-cur);
  update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(nxt)),'{lifetime_aura}',to_jsonb(next_life)),updated_at=timezone('utc',now()) where collection='users' and document_id=p_user_id;
  insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',p_event_id,jsonb_build_object('user_id',p_user_id,'kind',p_kind,'amount',nxt-cur,'source_type',p_source_type,'source_id',p_source_id,'metadata',p_metadata,'current_aura_after',nxt,'lifetime_aura_after',next_life,'created_at',now_text),timezone('utc',now()));
  return jsonb_build_object('userId',p_user_id,'awarded',true,'amount',nxt-cur,'currentAura',nxt,'lifetimeAura',next_life);
end; $$;

create or replace function public.apply_legacy_moderation_aura(p_action text,p_admin_id text,p_target_id text,p_source_id text,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jsonb; uid text; event_id text; kind text; amount integer;
begin
  if p_action='award_exceptional_dare' then
    select data into d from public.data_documents where collection='dares' and document_id=p_source_id for update;
    if d is null or d->>'state'<>'ACCEPTED_REAL' then raise exception 'Only a verified REAL Dare can be exceptional'; end if;
    uid:=d->>'receiver_id'; kind:='dare_exceptional'; amount:=500; event_id:=md5(uid||'|dare_exceptional|'||p_source_id);
  elsif p_action='deduct_aura' then
    select data into d from public.data_documents where collection='reports' and document_id=p_source_id for update;
    uid:=coalesce(d->>'target_user_id',d->>'reported_user_id');
    if d is null or d->>'status'<>'resolved' or uid<>p_target_id then raise exception 'Aura deductions require a resolved report for this user'; end if;
    kind:='moderation_deduction'; amount:=-greatest(1,least(10000,p_amount)); event_id:=md5(uid||'|moderation_deduction|'||p_source_id);
  else raise exception 'bad_action'; end if;
  return public.apply_legacy_aura_delta(uid,event_id,kind,amount,case when p_action='deduct_aura' then 'report' else 'dare' end,p_source_id,jsonb_build_object('adminId',p_admin_id,'reason',left(coalesce(p_reason,''),500)));
end; $$;

create or replace function public.resolve_legacy_drama(p_post_id text,p_actor_id text,p_value text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jsonb; kind text; creator text; subject_id text; deadline_text text; winner text; pair record; result jsonb; results jsonb:='[]'::jsonb; event_id text; now_text text:=timezone('utc',now())::text;
begin
  select data into d from public.data_documents where collection='drama_posts' and document_id=p_post_id for update;
  if d is null then raise exception using errcode='P0002',message='drama_not_found'; end if;
  kind:=d->>'kind'; creator:=d->>'creator_id'; subject_id:=d#>>'{data,subject,id}';
  if p_actor_id<>creator and not(kind in ('prediction','deal','rumour') and d#>>'{data,subject,type}'='friend' and subject_id=p_actor_id) then raise exception using errcode='42501',message='drama_forbidden'; end if;
  if (kind='prediction' and p_value not in ('happened','didnt_happen')) or (kind='rumour' and p_value not in ('confirmed','false')) or (kind='deal' and p_value not in ('won','lost')) or (kind='promise' and p_value not in ('kept','broken')) then raise exception 'drama_bad_value'; end if;
  if nullif(d->>'resolution','') is not null and d->>'resolution'<>p_value then raise exception 'drama_already_resolved'; end if;
  deadline_text:=case kind when 'prediction' then d#>>'{data,deadline}' when 'deal' then d#>>'{data,resolutionDate}' when 'promise' then d#>>'{data,dueAt}' when 'rumour' then d#>>'{data,deadline}' else null end;
  if nullif(d->>'resolution','') is null and deadline_text is not null and deadline_text::timestamptz>timezone('utc',now()) then raise exception 'drama_not_due'; end if;
  if kind='prediction' then
    winner:=case when p_value='happened' then 'happens' else 'wont' end;
    for pair in select key,value from jsonb_each_text(coalesce(d->'votes','{}'::jsonb)) loop
      if pair.value=winner then event_id:=md5(pair.key||'|prediction_correct|'||p_post_id||'|'||p_value); result:=public.apply_legacy_aura_delta(pair.key,event_id,'prediction_correct',100,'prediction',p_post_id,jsonb_build_object('verdict',p_value)); results:=results||jsonb_build_array(result); end if;
    end loop;
  elsif (kind='rumour' and p_value='confirmed') or (kind='deal' and p_value='won') or (kind='promise' and p_value='kept') then
    event_id:=md5(creator||'|'||kind||'|'||p_post_id||'|'||p_value); result:=public.apply_legacy_aura_delta(creator,event_id,case kind when 'rumour' then 'rumour_confirmed' when 'deal' then 'deal_completed' else 'promise_fulfilled' end,100,kind,p_post_id,'{}'::jsonb); results:=results||jsonb_build_array(result);
  end if;
  d:=jsonb_set(jsonb_set(d,'{resolution}',to_jsonb(p_value)),'{resolved_at}',to_jsonb(now_text)); update public.data_documents set data=d,updated_at=timezone('utc',now()) where collection='drama_posts' and document_id=p_post_id;
  return jsonb_build_object('aura',results,'kind',kind,'creatorId',creator);
end; $$;
revoke all on function public.apply_legacy_aura_delta(text,text,text,integer,text,text,jsonb) from public;
revoke all on function public.apply_legacy_moderation_aura(text,text,text,text,integer,text) from public;
revoke all on function public.resolve_legacy_drama(text,text,text) from public;
grant execute on function public.apply_legacy_moderation_aura(text,text,text,text,integer,text) to service_role;
grant execute on function public.resolve_legacy_drama(text,text,text) to service_role;
