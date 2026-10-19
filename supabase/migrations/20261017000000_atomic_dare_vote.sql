create or replace function public.record_legacy_dare_vote(
  p_dare_id text, p_voter_id text, p_vote text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dare_data jsonb; vote_data jsonb; vote_collection text := 'dare_votes';
  vote_doc_id text := p_dare_id || '_' || p_voter_id;
  total integer; real_votes integer; fake_votes integer;
  resolved_result text; receiver_id text; challenger_id text;
  aura_data jsonb; event_id text; current_aura integer; lifetime_aura integer;
  next_aura integer; next_lifetime integer; reward integer;
  now_text text := timezone('utc',now())::text;
begin
  if p_vote not in ('REAL','FAKE') then raise exception 'bad_vote'; end if;
  select data into dare_data from public.data_documents where collection='dares' and document_id=p_dare_id for update;
  if dare_data is null then raise exception using errcode='P0002', message='dare_not_found'; end if;
  challenger_id := coalesce(dare_data->>'challenger_id',dare_data->>'creator_id');
  receiver_id := dare_data->>'receiver_id';
  if coalesce(dare_data->>'state','') <> 'FRIENDS_VALIDATION' or p_voter_id in (challenger_id,receiver_id) then raise exception using errcode='42501', message='dare_not_voteable'; end if;

  select data into vote_data from public.data_documents where collection=vote_collection and document_id=vote_doc_id for update;
  insert into public.data_documents(collection,document_id,data,updated_at)
  values(vote_collection,vote_doc_id,jsonb_build_object('dare_id',p_dare_id,'voter_id',p_voter_id,'vote',p_vote,'created_at',coalesce(vote_data->>'created_at',now_text),'updated_at',now_text),timezone('utc',now()))
  on conflict(collection,document_id) do update set data=excluded.data,updated_at=excluded.updated_at;

  select count(*) filter(where data->>'vote'='REAL'), count(*) filter(where data->>'vote'='FAKE'), count(*)
    into real_votes,fake_votes,total from public.data_documents where collection=vote_collection and data->>'dare_id'=p_dare_id;
  if total >= 3 then
    resolved_result := case when real_votes > fake_votes then 'REAL' else 'FAKE' end;
    update public.data_documents set data=jsonb_set(jsonb_set(jsonb_set(data,'{votes_count}',to_jsonb(total)),'{real_votes}',to_jsonb(real_votes)),'{fake_votes}',to_jsonb(fake_votes)),updated_at=timezone('utc',now()) where collection='dares' and document_id=p_dare_id;
    update public.data_documents set data=jsonb_set(jsonb_set(data,'{state}',to_jsonb(case when resolved_result='REAL' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end)),'{completed_at}',to_jsonb(now_text)),updated_at=timezone('utc',now()) where collection='dares' and document_id=p_dare_id;
    reward := case when resolved_result='REAL' then 200 else -100 end;
    event_id := md5(receiver_id || '|dare|' || p_dare_id || '|' || resolved_result);
    if receiver_id is not null and not exists(select 1 from public.data_documents where collection='aura_events' and document_id=event_id) then
      select data into aura_data from public.data_documents where collection='users' and document_id=receiver_id for update;
      current_aura := greatest(0,coalesce(nullif(aura_data->>'current_aura','')::integer,nullif(aura_data->>'aura','')::integer,100));
      lifetime_aura := greatest(current_aura,coalesce(nullif(aura_data->>'lifetime_aura','')::integer,100));
      next_aura := greatest(0,current_aura+reward); next_lifetime := lifetime_aura+greatest(0,next_aura-current_aura);
      update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(next_aura)),'{lifetime_aura}',to_jsonb(next_lifetime)),updated_at=timezone('utc',now()) where collection='users' and document_id=receiver_id;
      insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',event_id,jsonb_build_object('user_id',receiver_id,'kind',case when resolved_result='REAL' then 'dare_real' else 'dare_fake' end,'amount',reward,'source_type','dare','source_id',p_dare_id,'created_at',now_text),timezone('utc',now()));
    end if;
  else
    update public.data_documents set data=jsonb_set(jsonb_set(jsonb_set(data,'{votes_count}',to_jsonb(total)),'{real_votes}',to_jsonb(real_votes)),'{fake_votes}',to_jsonb(fake_votes)),updated_at=timezone('utc',now()) where collection='dares' and document_id=p_dare_id;
  end if;
  return jsonb_build_object('total',total,'realVotes',real_votes,'fakeVotes',fake_votes,'result',resolved_result,'challengerId',challenger_id,'receiverId',receiver_id);
end; $$;
revoke all on function public.record_legacy_dare_vote(text,text,text) from public;
grant execute on function public.record_legacy_dare_vote(text,text,text) to service_role;
