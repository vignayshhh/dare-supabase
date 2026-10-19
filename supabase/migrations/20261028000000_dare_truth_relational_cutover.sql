-- Move Dare and Truth records to their dedicated relational tables.
-- This only materializes records already created in this fresh Supabase backend.

insert into public.dares(id,creator_id,receiver_id,title,body,status,visibility,metadata,created_at,updated_at)
select public.try_uuid(d.document_id),
       public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')),
       public.try_uuid(d.data->>'receiver_id'),
       left(coalesce(d.data->>'description',d.data->>'title','Dare'),200),
       coalesce(d.data->>'description',d.data->>'body',''),
       case coalesce(d.data->>'state',d.data->>'status','SENT')
         when 'ACCEPTED' then 'ACCEPTED' when 'PROOF_SUBMITTED' then 'SUBMITTED'
         when 'UNDER_REVIEW' then 'SUBMITTED' when 'FRIENDS_VALIDATION' then 'SUBMITTED'
         when 'ACCEPTED_REAL' then 'COMPLETED' when 'REJECTED_FAKE' then 'REJECTED'
         when 'CHICKEN_OUT' then 'REJECTED' else 'PENDING' end,
       case when upper(coalesce(d.data->>'visibility','FRIENDS')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(d.data->>'visibility','FRIENDS')) else 'FRIENDS' end,
       d.data,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at),
       coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at)
from public.data_documents d
where d.collection='dares'
  and public.try_uuid(d.document_id) is not null
  and public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')) is not null
  and exists(select 1 from public.profiles p where p.id=public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')))
on conflict(id) do update set metadata=public.dares.metadata||excluded.metadata,updated_at=greatest(public.dares.updated_at,excluded.updated_at);

insert into public.truths(id,creator_id,receiver_id,question,answer,status,visibility,created_at,updated_at)
select public.try_uuid(d.document_id),
       public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')),
       public.try_uuid(d.data->>'receiver_id'),
       coalesce(d.data->>'question',''),d.data->>'answer',
       case coalesce(d.data->>'state',d.data->>'status','SENT') when 'ANSWERED' then 'ANSWERED' else 'OPEN' end,
       case when upper(coalesce(d.data->>'visibility','FRIENDS')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(d.data->>'visibility','FRIENDS')) else 'FRIENDS' end,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at),
       coalesce(nullif(d.data->>'updated_at','')::timestamptz,d.updated_at)
from public.data_documents d
where d.collection='truths'
  and public.try_uuid(d.document_id) is not null
  and public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')) is not null
  and exists(select 1 from public.profiles p where p.id=public.try_uuid(coalesce(d.data->>'challenger_id',d.data->>'creator_id')))
on conflict(id) do update set answer=coalesce(excluded.answer,public.truths.answer),updated_at=greatest(public.truths.updated_at,excluded.updated_at);

insert into public.dare_votes(dare_id,voter_id,vote,created_at)
select public.try_uuid(d.data->>'dare_id'),public.try_uuid(d.data->>'voter_id'),
       case upper(coalesce(d.data->>'vote','FAKE')) when 'REAL' then 'APPROVE' when 'APPROVE' then 'APPROVE' else 'REJECT' end,
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at)
from public.data_documents d
where d.collection='dare_votes'
  and exists(select 1 from public.dares x where x.id=public.try_uuid(d.data->>'dare_id'))
  and exists(select 1 from public.profiles p where p.id=public.try_uuid(d.data->>'voter_id'))
on conflict(dare_id,voter_id) do update set vote=excluded.vote;

insert into public.truth_votes(truth_id,voter_id,vote,created_at)
select coalesce(public.try_uuid(d.data->>'truth_id'),public.try_uuid(split_part(d.collection,'/',2))),
       public.try_uuid(d.data->>'voter_id'),upper(coalesce(d.data->>'vote','TRUTH')),
       coalesce(nullif(d.data->>'created_at','')::timestamptz,d.created_at)
from public.data_documents d
where (d.collection='truth_votes' or d.collection like 'truths/%/votes')
  and exists(select 1 from public.truths x where x.id=coalesce(public.try_uuid(d.data->>'truth_id'),public.try_uuid(split_part(d.collection,'/',2))))
  and exists(select 1 from public.profiles p where p.id=public.try_uuid(d.data->>'voter_id'))
on conflict(truth_id,voter_id) do update set vote=excluded.vote;

create or replace view public.feature_records with (security_invoker=true) as
select 'dares'::text collection,d.id::text document_id,
       d.metadata || jsonb_build_object(
         'challenger_id',d.creator_id,'creator_id',d.creator_id,'receiver_id',d.receiver_id,
         'description',coalesce(d.metadata->>'description',d.body,d.title),
         'state',coalesce(d.metadata->>'state',case d.status when 'PENDING' then 'SENT' when 'SUBMITTED' then 'PROOF_SUBMITTED' when 'COMPLETED' then 'ACCEPTED_REAL' when 'REJECTED' then 'REJECTED_FAKE' else d.status end),
         'created_at',d.created_at,'updated_at',d.updated_at,'accepted_at',d.metadata->'accepted_at',
         'proof_submitted_at',coalesce(d.metadata->'proof_submitted_at',to_jsonb(d.submitted_at)),
         'completed_at',coalesce(d.metadata->'completed_at',to_jsonb(d.completed_at))) data,d.updated_at
from public.dares d
union all
select 'dare_votes',v.dare_id::text||'_'||v.voter_id::text,
       jsonb_build_object('dare_id',v.dare_id,'voter_id',v.voter_id,'vote',case v.vote when 'APPROVE' then 'REAL' else 'FAKE' end,'created_at',v.created_at),v.created_at
from public.dare_votes v
union all
select 'truths',t.id::text,
       jsonb_build_object('challenger_id',t.creator_id,'creator_id',t.creator_id,'receiver_id',t.receiver_id,'question',t.question,'answer',t.answer,
         'state',case t.status when 'ANSWERED' then 'ANSWERED' else 'SENT' end,'votes',jsonb_build_object(
           'truth',(select count(*) from public.truth_votes v where v.truth_id=t.id and v.vote='TRUTH'),
           'lie',(select count(*) from public.truth_votes v where v.truth_id=t.id and v.vote='LIE'),
           'total',(select count(*) from public.truth_votes v where v.truth_id=t.id)),
         'created_at',t.created_at,'updated_at',t.updated_at),t.updated_at
from public.truths t
union all
select 'truth_votes',v.truth_id::text||'_'||v.voter_id::text,
       jsonb_build_object('truth_id',v.truth_id,'voter_id',v.voter_id,'vote',v.vote,'created_at',v.created_at),v.created_at
from public.truth_votes v
union all
select 'truths/'||v.truth_id::text||'/votes',v.truth_id::text||'_'||v.voter_id::text,
       jsonb_build_object('truth_id',v.truth_id,'voter_id',v.voter_id,'vote',v.vote,'created_at',v.created_at),v.created_at
from public.truth_votes v;

grant select on public.feature_records to authenticated,service_role;

create or replace function public.write_dare_truth_record(p_collection text,p_document_id text,p_data jsonb,p_mode text default 'set')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_id uuid:=public.try_uuid(p_document_id); v_data jsonb:=coalesce(p_data,'{}'::jsonb); v_existing jsonb; v_now timestamptz:=timezone('utc',now()); v_state text;
begin
  if p_mode in ('merge','update') then
    select data into v_existing from public.feature_records where collection=p_collection and document_id=p_document_id;
    if p_mode='update' and v_existing is null then raise exception 'record_not_found'; end if;
    v_data:=coalesce(v_existing,'{}'::jsonb)||v_data;
  end if;
  if p_collection='dares' then
    v_state:=coalesce(v_data->>'state','SENT');
    insert into public.dares(id,creator_id,receiver_id,title,body,status,visibility,submitted_at,completed_at,metadata,created_at,updated_at)
    values(v_id,public.try_uuid(coalesce(v_data->>'challenger_id',v_data->>'creator_id')),public.try_uuid(v_data->>'receiver_id'),left(coalesce(v_data->>'description','Dare'),200),coalesce(v_data->>'description',''),
      case v_state when 'ACCEPTED' then 'ACCEPTED' when 'PROOF_SUBMITTED' then 'SUBMITTED' when 'UNDER_REVIEW' then 'SUBMITTED' when 'FRIENDS_VALIDATION' then 'SUBMITTED' when 'ACCEPTED_REAL' then 'COMPLETED' when 'REJECTED_FAKE' then 'REJECTED' when 'CHICKEN_OUT' then 'REJECTED' else 'PENDING' end,
      case when upper(coalesce(v_data->>'visibility','FRIENDS')) in ('PUBLIC','FRIENDS','PRIVATE') then upper(coalesce(v_data->>'visibility','FRIENDS')) else 'FRIENDS' end,
      nullif(v_data->>'proof_submitted_at','')::timestamptz,nullif(v_data->>'completed_at','')::timestamptz,v_data,
      coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),v_now)
    on conflict(id) do update set receiver_id=excluded.receiver_id,title=excluded.title,body=excluded.body,status=excluded.status,submitted_at=coalesce(excluded.submitted_at,public.dares.submitted_at),completed_at=coalesce(excluded.completed_at,public.dares.completed_at),metadata=excluded.metadata,updated_at=v_now;
  elsif p_collection='dare_votes' then
    insert into public.dare_votes(dare_id,voter_id,vote,created_at) values(public.try_uuid(v_data->>'dare_id'),public.try_uuid(v_data->>'voter_id'),case upper(v_data->>'vote') when 'REAL' then 'APPROVE' else 'REJECT' end,coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now))
    on conflict(dare_id,voter_id) do update set vote=excluded.vote;
  elsif p_collection='truths' then
    insert into public.truths(id,creator_id,receiver_id,question,answer,status,visibility,created_at,updated_at)
    values(v_id,public.try_uuid(coalesce(v_data->>'challenger_id',v_data->>'creator_id')),public.try_uuid(v_data->>'receiver_id'),coalesce(v_data->>'question',''),v_data->>'answer',case when coalesce(v_data->>'state','SENT')='ANSWERED' then 'ANSWERED' else 'OPEN' end,'FRIENDS',coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now),v_now)
    on conflict(id) do update set receiver_id=excluded.receiver_id,question=excluded.question,answer=excluded.answer,status=excluded.status,updated_at=v_now;
  elsif p_collection in ('truth_votes') or p_collection like 'truths/%/votes' then
    insert into public.truth_votes(truth_id,voter_id,vote,created_at) values(coalesce(public.try_uuid(v_data->>'truth_id'),public.try_uuid(split_part(p_collection,'/',2))),public.try_uuid(v_data->>'voter_id'),upper(v_data->>'vote'),coalesce(nullif(v_data->>'created_at','')::timestamptz,v_now))
    on conflict(truth_id,voter_id) do update set vote=excluded.vote;
  else raise exception 'unsupported_feature_collection'; end if;
  select data into v_data from public.feature_records where collection=case when p_collection like 'truths/%/votes' then 'truth_votes' else p_collection end and (document_id=p_document_id or document_id like '%'||coalesce(v_data->>'voter_id','')) limit 1;
  return v_data;
end;
$$;

create or replace function public.delete_dare_truth_record(p_collection text,p_document_id text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_collection='dares' then delete from public.dares where id=public.try_uuid(p_document_id);
  elsif p_collection='dare_votes' then delete from public.dare_votes where dare_id=public.try_uuid(split_part(p_document_id,'_',1)) and voter_id=public.try_uuid(split_part(p_document_id,'_',2));
  elsif p_collection='truths' then delete from public.truths where id=public.try_uuid(p_document_id);
  elsif p_collection='truth_votes' or p_collection like 'truths/%/votes' then delete from public.truth_votes where truth_id=public.try_uuid(split_part(p_document_id,'_',1)) and voter_id=public.try_uuid(split_part(p_document_id,'_',2));
  else raise exception 'unsupported_feature_collection'; end if;
end;
$$;

revoke all on function public.write_dare_truth_record(text,text,jsonb,text) from public;
revoke all on function public.delete_dare_truth_record(text,text) from public;
grant execute on function public.write_dare_truth_record(text,text,jsonb,text) to authenticated,service_role;
grant execute on function public.delete_dare_truth_record(text,text) to authenticated,service_role;

drop policy if exists dares_delete_creator on public.dares;
create policy dares_delete_creator on public.dares for delete to authenticated using(creator_id=auth.uid());
drop policy if exists truths_delete_creator on public.truths;
create policy truths_delete_creator on public.truths for delete to authenticated using(creator_id=auth.uid());

delete from public.data_documents d where d.collection='dares' and exists(select 1 from public.dares x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='truths' and exists(select 1 from public.truths x where x.id=public.try_uuid(d.document_id));
delete from public.data_documents d where d.collection='dare_votes' and exists(select 1 from public.dare_votes x where x.dare_id=public.try_uuid(d.data->>'dare_id') and x.voter_id=public.try_uuid(d.data->>'voter_id'));
delete from public.data_documents d where (d.collection='truth_votes' or d.collection like 'truths/%/votes') and exists(select 1 from public.truth_votes x where x.truth_id=coalesce(public.try_uuid(d.data->>'truth_id'),public.try_uuid(split_part(d.collection,'/',2))) and x.voter_id=public.try_uuid(d.data->>'voter_id'));
