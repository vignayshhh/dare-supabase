create or replace function public.answer_legacy_truth(
  p_truth_id text, p_actor_id text, p_answer text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; now_text text := timezone('utc',now())::text;
begin
  select data into d from public.data_documents where collection='truths' and document_id=p_truth_id for update;
  if d is null then raise exception using errcode='P0002',message='truth_not_found'; end if;
  if d->>'receiver_id' <> p_actor_id then raise exception using errcode='42501',message='truth_forbidden'; end if;
  if d->>'state' <> 'SENT' then raise exception using errcode='P0001',message='truth_not_answerable'; end if;
  d := jsonb_set(jsonb_set(jsonb_set(jsonb_set(d,'{answer}',to_jsonb(p_answer)),'{state}','"APPROVED"'::jsonb),'{answered_at}',to_jsonb(now_text)),'{reviewed_at}',to_jsonb(now_text));
  update public.data_documents set data=d,updated_at=timezone('utc',now()) where collection='truths' and document_id=p_truth_id;
  return d;
end; $$;
revoke all on function public.answer_legacy_truth(text,text,text) from public;
grant execute on function public.answer_legacy_truth(text,text,text) to service_role;

create or replace function public.submit_legacy_dare_proof(
  p_dare_id text, p_actor_id text, p_media_url text, p_media_type text, p_thumbnail_url text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; now_text text := timezone('utc',now())::text; event_id text; aura_data jsonb; cur integer; life integer; nxt integer;
begin
  select data into d from public.data_documents where collection='dares' and document_id=p_dare_id for update;
  if d is null then raise exception using errcode='P0002',message='dare_not_found'; end if;
  if d->>'receiver_id' <> p_actor_id then raise exception using errcode='42501',message='dare_forbidden'; end if;
  if d->>'state' <> 'ACCEPTED' then raise exception using errcode='P0001',message='dare_not_submittable'; end if;
  d := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(d,'{state}','"ACCEPTED_REAL"'::jsonb),'{proof_media_url}',to_jsonb(p_media_url)),'{proof_media_type}',to_jsonb(p_media_type)),'{proof_thumbnail_url}',to_jsonb(coalesce(nullif(p_thumbnail_url,''),p_media_url))),'{proof_submitted_at}',to_jsonb(now_text));
  d := jsonb_set(d,'{completed_at}',to_jsonb(now_text));
  update public.data_documents set data=d,updated_at=timezone('utc',now()) where collection='dares' and document_id=p_dare_id;
  event_id := md5(p_actor_id||'|dare_real|completed|'||p_dare_id);
  if not exists(select 1 from public.data_documents where collection='aura_events' and document_id=event_id) then
    select data into aura_data from public.data_documents where collection='users' and document_id=p_actor_id for update;
    cur := greatest(0,coalesce(nullif(aura_data->>'current_aura','')::integer,100)); life := greatest(cur,coalesce(nullif(aura_data->>'lifetime_aura','')::integer,100)); nxt:=cur+200;
    update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(nxt)),'{lifetime_aura}',to_jsonb(life+200)),updated_at=timezone('utc',now()) where collection='users' and document_id=p_actor_id;
    insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',event_id,jsonb_build_object('user_id',p_actor_id,'kind','dare_real','amount',200,'source_id',p_dare_id,'created_at',now_text),timezone('utc',now()));
  end if;
  return d;
end; $$;
revoke all on function public.submit_legacy_dare_proof(text,text,text,text,text) from public;
grant execute on function public.submit_legacy_dare_proof(text,text,text,text,text) to service_role;

create or replace function public.review_legacy_dare(
  p_dare_id text, p_actor_id text, p_decision text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb; now_text text := timezone('utc',now())::text; result text; amount integer; event_id text; aura_data jsonb; cur integer; life integer; nxt integer;
begin
  if p_decision not in ('ACCEPT','REJECT') then raise exception 'bad_decision'; end if;
  select data into d from public.data_documents where collection='dares' and document_id=p_dare_id for update;
  if d is null then raise exception using errcode='P0002',message='dare_not_found'; end if;
  if d->>'challenger_id' <> p_actor_id then raise exception using errcode='42501',message='dare_forbidden'; end if;
  if d->>'state' not in ('PROOF_SUBMITTED','FRIENDS_VALIDATION') then raise exception using errcode='P0001',message='dare_not_reviewable'; end if;
  result := case when p_decision='ACCEPT' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end; amount := case when p_decision='ACCEPT' then 200 else -100 end;
  d := jsonb_set(jsonb_set(d,'{state}',to_jsonb(result)),'{completed_at}',to_jsonb(now_text));
  update public.data_documents set data=d,updated_at=timezone('utc',now()) where collection='dares' and document_id=p_dare_id;
  event_id := md5(coalesce(d->>'receiver_id','')||'|dare|'||p_dare_id||'|'||p_decision);
  if not exists(select 1 from public.data_documents where collection='aura_events' and document_id=event_id) then
    select data into aura_data from public.data_documents where collection='users' and document_id=d->>'receiver_id' for update;
    cur := greatest(0,coalesce(nullif(aura_data->>'current_aura','')::integer,100)); life:=greatest(cur,coalesce(nullif(aura_data->>'lifetime_aura','')::integer,100)); nxt:=greatest(0,cur+amount);
    update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(nxt)),'{lifetime_aura}',to_jsonb(life+greatest(0,nxt-cur))),updated_at=timezone('utc',now()) where collection='users' and document_id=d->>'receiver_id';
    insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',event_id,jsonb_build_object('user_id',d->>'receiver_id','kind',case when p_decision='ACCEPT' then 'dare_real' else 'dare_fake' end,'amount',amount,'source_id',p_dare_id,'created_at',now_text),timezone('utc',now()));
  end if;
  return d;
end; $$;
revoke all on function public.review_legacy_dare(text,text,text) from public;
grant execute on function public.review_legacy_dare(text,text,text) to service_role;
