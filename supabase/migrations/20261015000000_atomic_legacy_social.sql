-- Atomic SQL replacements for still-active legacy-shaped social mutations.
-- Server routes authenticate the actor before calling these service-role RPCs.

create or replace function public.create_legacy_post_comment(
  p_post_id text,
  p_comment_id text,
  p_author_id text,
  p_content text,
  p_parent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  post_data jsonb;
  now_text text := timezone('utc', now())::text;
begin
  select data into post_data
    from public.data_documents
   where collection = 'posts' and document_id = p_post_id
   for update;
  if post_data is null then raise exception using errcode='P0002', message='post_not_found'; end if;

  insert into public.data_documents(collection, document_id, data, updated_at)
  values ('post_comments', p_comment_id,
    jsonb_build_object('post_id',p_post_id,'user_id',p_author_id,'content',p_content,
      'text',p_content,'likes',0,'parent_id',nullif(p_parent_id,''),
      'created_at',now_text,'updated_at',now_text), timezone('utc',now()));

  update public.data_documents
     set data = jsonb_set(data, '{comments_count}',
       to_jsonb(coalesce((data->>'comments_count')::integer,0)+1)),
         updated_at = timezone('utc', now())
   where collection='posts' and document_id=p_post_id;
  return jsonb_build_object('id',p_comment_id);
end;
$$;

create or replace function public.create_legacy_friend_request(
  p_friendship_id text,
  p_requester_id text,
  p_addressee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare now_text text := timezone('utc', now())::text;
begin
  if exists(select 1 from public.data_documents where collection='friendships' and document_id=p_friendship_id)
    then raise exception using errcode='23505', message='friendship_exists'; end if;
  insert into public.data_documents(collection,document_id,data,updated_at)
  values ('friendships',p_friendship_id,
    jsonb_build_object('requester_id',p_requester_id,'addressee_id',p_addressee_id,
      'status','pending','created_at',now_text,'accepted_at',null),timezone('utc',now()));
  return jsonb_build_object('id',p_friendship_id,'created_at',now_text);
end;
$$;

create or replace function public.record_legacy_truth_vote(
  p_truth_id text,
  p_voter_id text,
  p_vote text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  truth_data jsonb;
  vote_collection text := 'truths/' || p_truth_id || '/votes';
  duplicate boolean;
  truth_votes integer;
  lie_votes integer;
  total integer;
  next_state text;
  now_text text := timezone('utc', now())::text;
begin
  if p_vote not in ('TRUTH','LIE') then raise exception 'bad_vote'; end if;
  select data into truth_data from public.data_documents
   where collection='truths' and document_id=p_truth_id for update;
  if truth_data is null then raise exception using errcode='P0002', message='truth_not_found'; end if;
  duplicate := exists(select 1 from public.data_documents where collection=vote_collection and document_id=p_voter_id);
  if not duplicate then
    insert into public.data_documents(collection,document_id,data,updated_at)
    values(vote_collection,p_voter_id,jsonb_build_object('voter_id',p_voter_id,'vote',p_vote,'created_at',now_text),timezone('utc',now()));
    update public.data_documents set data =
      jsonb_set(jsonb_set(data,'{votes,' || lower(p_vote) || '}',to_jsonb(coalesce((data#>>ARRAY['votes',lower(p_vote)])::integer,0)+1)),
        '{votes,total}',to_jsonb(coalesce((data#>>'{votes,total}')::integer,0)+1)), updated_at=timezone('utc',now())
      where collection='truths' and document_id=p_truth_id;
  end if;
  select count(*) filter(where data->>'vote'='TRUTH'), count(*) filter(where data->>'vote'='LIE'), count(*)
    into truth_votes,lie_votes,total from public.data_documents where collection=vote_collection;
  next_state := null;
  if total >= 3 then
    next_state := case when truth_votes > lie_votes then 'APPROVED' else 'REJECTED' end;
    update public.data_documents set data=jsonb_set(jsonb_set(data,'{state}',to_jsonb(next_state)),'{reviewed_at}',to_jsonb(now_text)),updated_at=timezone('utc',now())
      where collection='truths' and document_id=p_truth_id;
  end if;
  return jsonb_build_object('duplicate',duplicate,'total',total,'truthVotes',truth_votes,'lieVotes',lie_votes,'state',next_state);
end;
$$;

revoke all on function public.create_legacy_post_comment(text,text,text,text,text) from public;
revoke all on function public.create_legacy_friend_request(text,text,text) from public;
revoke all on function public.record_legacy_truth_vote(text,text,text) from public;
grant execute on function public.create_legacy_post_comment(text,text,text,text,text) to service_role;
grant execute on function public.create_legacy_friend_request(text,text,text) to service_role;
grant execute on function public.record_legacy_truth_vote(text,text,text) to service_role;

create or replace function public.create_legacy_post_with_event(
  p_post_id text,
  p_post_data jsonb,
  p_event_id text,
  p_event_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.data_documents(collection,document_id,data,updated_at)
  values ('posts',p_post_id,p_post_data,timezone('utc',now()));
  insert into public.data_documents(collection,document_id,data,updated_at)
  values ('feed_events',p_event_id,p_event_data,timezone('utc',now()));
  return jsonb_build_object('postId',p_post_id,'eventId',p_event_id);
end;
$$;
revoke all on function public.create_legacy_post_with_event(text,jsonb,text,jsonb) from public;
grant execute on function public.create_legacy_post_with_event(text,jsonb,text,jsonb) to service_role;

create or replace function public.toggle_legacy_post_like(
  p_post_id text,
  p_user_id text,
  p_liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  post_data jsonb;
  like_id text := p_post_id || '_' || p_user_id;
  like_data jsonb;
  duplicate boolean := false;
  next_count integer;
  author_id text;
  milestone integer;
  reward integer;
  aura_data jsonb;
  aura_event_id text;
  current_aura integer;
  lifetime_aura integer;
  next_aura integer;
  next_lifetime integer;
  now_text text := timezone('utc', now())::text;
begin
  select data into post_data from public.data_documents
   where collection='posts' and document_id=p_post_id for update;
  if post_data is null then raise exception using errcode='P0002', message='post_not_found'; end if;

  if p_liked then
    select data into like_data from public.data_documents
     where collection='post_likes' and document_id=like_id for update;
    if like_data is not null then
      duplicate := true;
      update public.data_documents set data=jsonb_set(data,'{tap_count}',to_jsonb(coalesce((data->>'tap_count')::integer,0)+1)),updated_at=timezone('utc',now())
       where collection='post_likes' and document_id=like_id;
    else
      next_count := greatest(0,coalesce((post_data->>'likes_count')::integer,0))+1;
      insert into public.data_documents(collection,document_id,data,updated_at)
      values('post_likes',like_id,jsonb_build_object('post_id',p_post_id,'user_id',p_user_id,'tap_count',1,'counter_applied',true,'created_at',now_text,'updated_at',now_text),timezone('utc',now()));
      update public.data_documents set data=jsonb_set(data,'{likes_count}',to_jsonb(next_count)),updated_at=timezone('utc',now())
       where collection='posts' and document_id=p_post_id;
      author_id := coalesce(post_data->>'author_id',post_data->>'user_id');
      milestone := case when next_count in (25,50,100) then next_count else null end;
      reward := case next_count when 25 then 100 when 50 then 200 when 100 then 500 else null end;
      if milestone is not null and author_id is not null and reward is not null then
        aura_event_id := md5(author_id || '|post_like_milestone|post|' || p_post_id || '|' || milestone::text);
        if not exists(select 1 from public.data_documents where collection='aura_events' and document_id=aura_event_id) then
          select data into aura_data from public.data_documents where collection='users' and document_id=author_id for update;
          current_aura := greatest(0,coalesce((aura_data->>'current_aura')::integer,(aura_data->>'aura')::integer,100));
          lifetime_aura := greatest(current_aura,coalesce((aura_data->>'lifetime_aura')::integer,100));
          next_aura := current_aura + reward;
          next_lifetime := lifetime_aura + reward;
          update public.data_documents set data=jsonb_set(jsonb_set(data,'{current_aura}',to_jsonb(next_aura)),'{lifetime_aura}',to_jsonb(next_lifetime)),updated_at=timezone('utc',now()) where collection='users' and document_id=author_id;
          insert into public.data_documents(collection,document_id,data,updated_at) values('aura_events',aura_event_id,jsonb_build_object('user_id',author_id,'kind','post_like_milestone','amount',reward,'source_type','post','source_id',p_post_id,'qualifier',milestone::text,'current_aura_after',next_aura,'lifetime_aura_after',next_lifetime,'created_at',now_text),timezone('utc',now()));
        end if;
      end if;
    end if;
    return jsonb_build_object('liked',true,'duplicate',duplicate,'milestone',milestone,'nextCount',coalesce(next_count,(post_data->>'likes_count')::integer),'authorId',author_id);
  end if;

  if exists(select 1 from public.data_documents where collection='post_likes' and document_id=like_id) then
    delete from public.data_documents where collection='post_likes' and document_id=like_id;
    update public.data_documents set data=jsonb_set(data,'{likes_count}',to_jsonb(greatest(0,coalesce((data->>'likes_count')::integer,0)-1))),updated_at=timezone('utc',now()) where collection='posts' and document_id=p_post_id;
  end if;
  return jsonb_build_object('liked',false,'duplicate',false);
end;
$$;
revoke all on function public.toggle_legacy_post_like(text,text,boolean) from public;
grant execute on function public.toggle_legacy_post_like(text,text,boolean) to service_role;
