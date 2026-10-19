-- Native challenge transitions. These replace the last data_documents-backed
-- dare/truth answer, proof, review, and validation operations.

create or replace function public.answer_truth_native(p_truth_id uuid, p_answer text, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.truths;
begin
  if coalesce(auth.uid(), p_actor_id) is null or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'truth_forbidden'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  update public.truths
  set answer = p_answer, status = 'ANSWERED', updated_at = timezone('utc', now())
  where id = p_truth_id and receiver_id = p_actor_id and status = 'OPEN'
  returning * into v_row;
  if not found then
    if not exists(select 1 from public.truths where id = p_truth_id) then raise exception using errcode='P0002', message='truth_not_found'; end if;
    if not exists(select 1 from public.truths where id = p_truth_id and receiver_id = p_actor_id) then raise exception using errcode='42501', message='truth_forbidden'; end if;
    raise exception using errcode='P0001', message='truth_not_answerable';
  end if;
  return to_jsonb(v_row) || jsonb_build_object('challenger_id', v_row.creator_id, 'state', 'APPROVED', 'answered_at', v_row.updated_at, 'reviewed_at', v_row.updated_at);
end;
$$;

create or replace function public.submit_dare_proof_native(p_dare_id uuid, p_media_url text, p_media_type text, p_thumbnail_url text default null, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dares; v_now timestamptz := timezone('utc', now());
begin
  if coalesce(auth.uid(), p_actor_id) is null or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_forbidden'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  update public.dares
  set status = 'COMPLETED', submitted_at = v_now, completed_at = v_now, updated_at = v_now,
      metadata = metadata || jsonb_build_object('proof_media_url', p_media_url, 'proof_media_type', p_media_type, 'proof_thumbnail_url', coalesce(nullif(p_thumbnail_url,''), p_media_url))
  where id = p_dare_id and receiver_id = p_actor_id and status = 'ACCEPTED'
  returning * into v_row;
  if not found then
    if not exists(select 1 from public.dares where id = p_dare_id) then raise exception using errcode='P0002', message='dare_not_found'; end if;
    if not exists(select 1 from public.dares where id = p_dare_id and receiver_id = p_actor_id) then raise exception using errcode='42501', message='dare_forbidden'; end if;
    raise exception using errcode='P0001', message='dare_not_submittable';
  end if;
  insert into public.dare_proofs(dare_id, submitter_id, body, object_path)
  values (v_row.id, p_actor_id, '', p_media_url);
  return to_jsonb(v_row) || jsonb_build_object('challenger_id', v_row.creator_id, 'description', v_row.body, 'state', 'ACCEPTED_REAL', 'proof_media_url', p_media_url, 'proof_media_type', p_media_type, 'proof_thumbnail_url', coalesce(nullif(p_thumbnail_url,''), p_media_url), 'proof_submitted_at', v_now, 'completed_at', v_now);
end;
$$;

create or replace function public.review_dare_native(p_dare_id uuid, p_decision text, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dares; v_status text; v_now timestamptz := timezone('utc', now());
begin
  if coalesce(auth.uid(), p_actor_id) is null or p_decision not in ('ACCEPT','REJECT') or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_forbidden'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  v_status := case when p_decision = 'ACCEPT' then 'COMPLETED' else 'REJECTED' end;
  update public.dares
  set status = v_status, completed_at = v_now, updated_at = v_now,
      metadata = metadata || jsonb_build_object('review_decision', p_decision)
  where id = p_dare_id and creator_id = p_actor_id and status = 'SUBMITTED'
  returning * into v_row;
  if not found then
    if not exists(select 1 from public.dares where id = p_dare_id) then raise exception using errcode='P0002', message='dare_not_found'; end if;
    if not exists(select 1 from public.dares where id = p_dare_id and creator_id = p_actor_id) then raise exception using errcode='42501', message='dare_forbidden'; end if;
    raise exception using errcode='P0001', message='dare_not_reviewable';
  end if;
  return to_jsonb(v_row) || jsonb_build_object('challenger_id', v_row.creator_id, 'description', v_row.body, 'state', case when p_decision = 'ACCEPT' then 'ACCEPTED_REAL' else 'REJECTED_FAKE' end, 'completed_at', v_now);
end;
$$;

create or replace function public.record_dare_vote_native(p_dare_id uuid, p_vote text, p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dare public.dares; v_total integer; v_approve integer; v_reject integer; v_result text := null; v_status text;
begin
  if coalesce(auth.uid(), p_actor_id) is null or p_vote not in ('REAL','FAKE') or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id) then raise exception 'dare_not_voteable'; end if;
  p_actor_id := coalesce(auth.uid(), p_actor_id);
  select * into v_dare from public.dares where id = p_dare_id for update;
  if not found then raise exception using errcode='P0002', message='dare_not_found'; end if;
  if v_dare.status <> 'SUBMITTED' or p_actor_id in (v_dare.creator_id, v_dare.receiver_id) then raise exception using errcode='42501', message='dare_not_voteable'; end if;
  insert into public.dare_votes(dare_id, voter_id, vote) values(p_dare_id, p_actor_id, case when p_vote = 'REAL' then 'APPROVE' else 'REJECT' end)
  on conflict(dare_id, voter_id) do update set vote = excluded.vote;
  select count(*)::integer, count(*) filter(where vote='APPROVE')::integer, count(*) filter(where vote='REJECT')::integer into v_total, v_approve, v_reject from public.dare_votes where dare_id = p_dare_id;
  if v_total >= 3 then
    v_result := case when v_approve > v_reject then 'REAL' else 'FAKE' end;
    v_status := case when v_result = 'REAL' then 'COMPLETED' else 'REJECTED' end;
    update public.dares set status = v_status, completed_at = timezone('utc', now()), updated_at = timezone('utc', now()) where id = p_dare_id returning * into v_dare;
  end if;
  return jsonb_build_object('total', v_total, 'realVotes', v_approve, 'fakeVotes', v_reject, 'result', v_result, 'challengerId', v_dare.creator_id, 'receiverId', v_dare.receiver_id);
end;
$$;

revoke all on function public.answer_truth_native(uuid,text,uuid) from public;
revoke all on function public.submit_dare_proof_native(uuid,text,text,text,uuid) from public;
revoke all on function public.review_dare_native(uuid,text,uuid) from public;
revoke all on function public.record_dare_vote_native(uuid,text,uuid) from public;
grant execute on function public.answer_truth_native(uuid,text,uuid) to service_role;
grant execute on function public.submit_dare_proof_native(uuid,text,text,text,uuid) to service_role;
grant execute on function public.review_dare_native(uuid,text,uuid) to service_role;
grant execute on function public.record_dare_vote_native(uuid,text,uuid) to service_role;

create or replace function public.create_friendship_request_native(p_addressee_id uuid, p_actor_id uuid default null)
returns public.friendships language plpgsql security definer set search_path = public as $$
declare v_actor uuid := coalesce(auth.uid(), p_actor_id); v_row public.friendships;
begin
  if v_actor is null or p_addressee_id is null or v_actor = p_addressee_id then raise exception 'bad_friendship'; end if;
  if auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id then raise exception 'forbidden'; end if;
  insert into public.friendships(requester_id, addressee_id, status)
  values(v_actor, p_addressee_id, 'PENDING')
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception using errcode='23505', message='friendship_exists';
end;
$$;
revoke all on function public.create_friendship_request_native(uuid,uuid) from public;
grant execute on function public.create_friendship_request_native(uuid,uuid) to service_role;

-- Keep the transitional response shape for still-active typed callers, but no
-- longer expose data_documents through the runtime view.
create or replace view public.app_documents with (security_invoker=true) as
select 'users'::text collection,p.id::text document_id,p.legacy_payload || jsonb_build_object('user_id',p.id,'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,'visibility',p.visibility,'current_aura',p.current_aura,'lifetime_aura',p.lifetime_aura,'has_completed_profile_creation',p.has_completed_profile_creation,'is_18_plus',p.is_18_plus,'consent_accepted',p.consent_accepted,'is_online',p.is_online,'last_active_at',p.last_active_at,'created_at',p.created_at,'updated_at',p.updated_at) data,p.updated_at from public.profiles p
union all select 'friendships',coalesce(f.legacy_document_id,f.id::text),f.legacy_payload || jsonb_build_object('requester_id',f.requester_id,'addressee_id',f.addressee_id,'status',lower(f.status),'created_at',f.created_at,'updated_at',f.updated_at),f.updated_at from public.friendships f
union all select 'posts',p.id::text,p.legacy_payload || jsonb_build_object('author_id',p.author_id,'content',p.body,'visibility',p.visibility,'media_url',p.metadata->'media_url','media_urls',p.metadata->'media_urls','media_type',p.metadata->'media_type','view_count',p.view_count,'likes_count',p.reaction_count,'comments_count',p.comment_count,'created_at',p.created_at,'updated_at',p.updated_at),p.updated_at from public.posts p
union all select 'post_likes',r.post_id::text||'_'||r.user_id::text,jsonb_build_object('post_id',r.post_id,'user_id',r.user_id,'reaction',r.reaction,'taps',r.taps,'created_at',r.created_at,'updated_at',r.updated_at),r.updated_at from public.post_reactions r
union all select 'post_comments',c.id::text,c.legacy_payload || jsonb_build_object('post_id',c.post_id,'user_id',c.author_id,'author_id',c.author_id,'parent_id',c.parent_id,'content',c.body,'likes_count',c.reaction_count,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.post_comments c
union all select 'stories',s.id::text,s.legacy_payload || jsonb_build_object('userId',s.author_id,'user_id',s.author_id,'mediaUrl',coalesce(s.legacy_payload->>'mediaUrl',s.media_path),'mediaType',coalesce(s.legacy_payload->>'mediaType','image'),'caption',s.body,'createdAt',s.created_at,'expiresAt',s.expires_at,'viewCount',(select count(*) from public.story_views v where v.story_id=s.id)),s.created_at from public.stories s
union all select 'story_views',v.story_id::text||'_'||v.viewer_id::text,jsonb_build_object('storyId',v.story_id,'storyOwnerId',s.author_id,'userId',v.viewer_id,'viewCount',1,'firstViewedAt',v.viewed_at,'lastViewedAt',v.viewed_at),v.viewed_at from public.story_views v join public.stories s on s.id=v.story_id
union all select 'story_view_stats',s.id::text,jsonb_build_object('storyId',s.id,'storyOwnerId',s.author_id,'uniqueViewCount',count(v.viewer_id),'updatedAt',max(v.viewed_at)),coalesce(max(v.viewed_at),s.created_at) from public.stories s left join public.story_views v on v.story_id=s.id group by s.id
union all select 'story_reactions',r.story_id::text||'_'||r.user_id::text,jsonb_build_object('storyId',r.story_id,'userId',r.user_id,'type',r.reaction,'createdAt',r.created_at),r.created_at from public.story_reactions r
union all select 'story_reaction_stats',s.id::text,jsonb_build_object('storyId',s.id,'likeCount',count(r.*) filter(where r.reaction='like'),'hateCount',count(r.*) filter(where r.reaction='hate')),coalesce(max(r.created_at),s.created_at) from public.stories s left join public.story_reactions r on r.story_id=s.id group by s.id
union all select 'conversations',c.id::text,c.legacy_payload || jsonb_build_object('participant_ids',(select coalesce(jsonb_agg(m.user_id),'[]'::jsonb) from public.conversation_members m where m.conversation_id=c.id),'last_message_at',c.last_message_at,'created_at',c.created_at,'updated_at',c.updated_at),c.updated_at from public.conversations c
union all select 'user_chat_inbox/'||m.user_id::text||'/threads',m.conversation_id::text,m.inbox_payload || jsonb_build_object('conversation_id',m.conversation_id,'user_id',m.user_id,'last_read_at',m.last_read_at),coalesce(c.updated_at,m.joined_at) from public.conversation_members m join public.conversations c on c.id=m.conversation_id
union all select 'messages',m.id::text,m.legacy_payload || jsonb_build_object('conversation_id',m.conversation_id,'sender_id',m.sender_id,'content',m.body,'body',m.body,'media_url',m.media_path,'reply_to_id',m.reply_to_id,'created_at',m.created_at,'updated_at',m.updated_at),m.updated_at from public.messages m where m.deleted_at is null
union all select 'message_events',e.id::text,e.payload || jsonb_build_object('conversation_id',e.conversation_id,'message_id',e.message_id,'user_id',e.actor_id,'event_type',e.event_type,'created_at',e.created_at),e.created_at from public.message_events e
union all select 'alerts',a.id::text,a.legacy_payload || jsonb_build_object('userId',a.recipient_id,'recipient_id',a.recipient_id,'actorId',a.actor_id,'actor_id',a.actor_id,'type',a.type,'metadata',a.payload,'isRead',a.read_at is not null,'createdAt',a.created_at,'updatedAt',coalesce(a.read_at,a.created_at)),coalesce(a.read_at,a.created_at) from public.alerts a
union all select 'feed_events',e.id::text,e.payload || jsonb_build_object('user_id',e.actor_id,'event_type',e.event_type,'related_post_id',e.related_post_id,'related_dare_id',e.related_dare_id,'created_at',e.created_at),e.created_at from public.feed_events e;

grant select on public.app_documents to authenticated,service_role;
