create or replace function public.mutate_legacy_verdict_vote(
  p_verdict_id text,p_user_id text,p_choice text,p_voter jsonb,p_remove boolean default false
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb; old jsonb; vote_id text:=p_verdict_id||'_'||p_user_id; previous text; one_count integer; two_count integer; total integer; preview jsonb; now_text text:=timezone('utc',now())::text;
begin
  select data into v from public.data_documents where collection='verdicts' and document_id=p_verdict_id for update;
  if v is null then raise exception using errcode='P0002',message='verdict_not_found'; end if;
  select data into old from public.data_documents where collection='verdict_votes' and document_id=vote_id for update;
  previous:=old->>'choice'; one_count:=greatest(0,coalesce((v->>'choice_one_votes')::integer,0)); two_count:=greatest(0,coalesce((v->>'choice_two_votes')::integer,0)); total:=greatest(0,coalesce((v->>'total_votes')::integer,0));
  preview:=coalesce(v->'voter_preview','[]'::jsonb);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into preview from jsonb_array_elements(preview) x where x->>'id'<>p_user_id;
  if p_remove then
    if old is not null then
      if previous='one' then one_count:=greatest(0,one_count-1); elsif previous='two' then two_count:=greatest(0,two_count-1); end if; total:=greatest(0,total-1);
      delete from public.data_documents where collection='verdict_votes' and document_id=vote_id;
    end if;
  else
    if p_choice not in ('one','two') then raise exception 'bad_choice'; end if;
    if previous is distinct from p_choice then
      if previous='one' then one_count:=greatest(0,one_count-1); elsif previous='two' then two_count:=greatest(0,two_count-1); else total:=total+1; end if;
      if p_choice='one' then one_count:=one_count+1; else two_count:=two_count+1; end if;
    end if;
    preview:=jsonb_build_array(p_voter||jsonb_build_object('id',p_user_id,'choice',p_choice))||preview;
    preview:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select x from jsonb_array_elements(preview) x limit 5) q);
    insert into public.data_documents(collection,document_id,data,updated_at) values('verdict_votes',vote_id,jsonb_build_object('verdict_id',p_verdict_id,'user_id',p_user_id,'choice',p_choice,'username',p_voter->>'username','display_name',p_voter->>'display_name','avatar_url',p_voter->>'avatar_url','created_at',coalesce(old->>'created_at',now_text),'updated_at',now_text),timezone('utc',now())) on conflict(collection,document_id) do update set data=excluded.data,updated_at=excluded.updated_at;
  end if;
  v:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v,'{choice_one_votes}',to_jsonb(one_count)),'{choice_two_votes}',to_jsonb(two_count)),'{total_votes}',to_jsonb(total)),'{voter_preview}',preview);
  update public.data_documents set data=v,updated_at=timezone('utc',now()) where collection='verdicts' and document_id=p_verdict_id;
  return v;
end; $$;

create or replace function public.create_legacy_verdict_comment(
  p_verdict_id text,p_comment_id text,p_user_id text,p_text text,p_parent_id text,p_author jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb; c jsonb; count_value integer; now_text text:=timezone('utc',now())::text;
begin
  select data into v from public.data_documents where collection='verdicts' and document_id=p_verdict_id for update;
  if v is null then raise exception using errcode='P0002',message='verdict_not_found'; end if;
  if p_parent_id is not null and not exists(select 1 from public.data_documents where collection='verdict_comments' and document_id=p_parent_id and data->>'verdict_id'=p_verdict_id) then raise exception using errcode='P0002',message='parent_comment_not_found'; end if;
  c:=jsonb_build_object('verdict_id',p_verdict_id,'user_id',p_user_id,'author_username',coalesce(p_author->>'username',''),'author_display_name',coalesce(p_author->>'display_name',''),'author_avatar_url',coalesce(p_author->>'avatar_url',''),'text',p_text,'parent_id',p_parent_id,'created_at',now_text,'updated_at',now_text);
  insert into public.data_documents(collection,document_id,data,updated_at) values('verdict_comments',p_comment_id,c,timezone('utc',now()));
  count_value:=coalesce((v->>'comments_count')::integer,0)+1;
  update public.data_documents set data=jsonb_set(data,'{comments_count}',to_jsonb(count_value)),updated_at=timezone('utc',now()) where collection='verdicts' and document_id=p_verdict_id;
  return jsonb_build_object('comment',c,'commentsCount',count_value);
end; $$;
revoke all on function public.mutate_legacy_verdict_vote(text,text,text,jsonb,boolean) from public;
revoke all on function public.create_legacy_verdict_comment(text,text,text,text,text,jsonb) from public;
grant execute on function public.mutate_legacy_verdict_vote(text,text,text,jsonb,boolean) to service_role;
grant execute on function public.create_legacy_verdict_comment(text,text,text,text,text,jsonb) to service_role;
