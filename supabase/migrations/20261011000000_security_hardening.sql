-- Additive security and concurrency hardening for the fresh Dare schema.
-- Apply after 20261010000000_fresh_dare_schema.sql.

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.data_document_collection_allowed(collection_name text)
returns boolean
language sql
immutable
as $$
  select split_part(collection_name, '/', 1) = any (array[
    'users','profile_private','friendships','blocks','posts','post_likes',
    'post_comments','feed_events','stories','story_views','story_view_stats',
    'story_reactions','dares','dare_votes','dare_proofs','truths','truth_votes',
    'predictions','prediction_votes','verdicts','verdict_votes','verdict_comments',
    'conversations','conversation_members','messages','message_receipts',
    'chat_invites','alerts','aura_events','daily_challenges',
    'daily_challenge_entries','community_challenges','community_challenge_joins',
    'community_challenge_members','challenge_room_proofs','birthday_rooms',
    'birthday_room_participants','birthday_drops','birthday_drop_comments',
    'birthday_drop_reactions','birthday_drop_private','drama_posts','presence',
    'reports','moderation_actions','rate_limits','user_feeds','feed_fanout_jobs',
    'impersonation_sessions','impersonation_secrets','relationships','deals',
    'promises','rumours','customs','jails','circle_members','game_sessions',
    'game_invites','game_rounds','typing','conversations_meta','birthday_party_snapshots','cant_sleep_rooms',
    'challenge_comment_likes','challenge_proof_comments','challenge_proof_votes',
    'community_challenge_rooms','community_challenge_summaries','dare_comment_likes',
    'dare_comments','dare_media_likes','dare_views','message_events','override_votes',
    'security_alerts','security_logs','truth_comments','typing_indicators','user_chat_inbox','circles'
  ]);
$$;

create or replace function public.data_document_actor_matches(payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and auth.uid() = any (array[
    public.safe_uuid(payload->>'user_id'),
    public.safe_uuid(payload->>'userId'),
    public.safe_uuid(payload->>'owner_id'),
    public.safe_uuid(payload->>'ownerId'),
    public.safe_uuid(payload->>'author_id'),
    public.safe_uuid(payload->>'authorId'),
    public.safe_uuid(payload->>'creator_id'),
    public.safe_uuid(payload->>'creatorId'),
    public.safe_uuid(payload->>'challenger_id'),
    public.safe_uuid(payload->>'challengerId'),
    public.safe_uuid(payload->>'sender_id'),
    public.safe_uuid(payload->>'senderId'),
    public.safe_uuid(payload->>'requester_id'),
    public.safe_uuid(payload->>'requesterId'),
    public.safe_uuid(payload->>'addressee_id'),
    public.safe_uuid(payload->>'addresseeId'),
    public.safe_uuid(payload->>'receiver_id'),
    public.safe_uuid(payload->>'receiverId'),
    public.safe_uuid(payload->>'recipient_id'),
    public.safe_uuid(payload->>'recipientId'),
    public.safe_uuid(payload->>'viewer_id'),
    public.safe_uuid(payload->>'viewerId'),
    public.safe_uuid(payload->>'voter_id'),
    public.safe_uuid(payload->>'voterId'),
    public.safe_uuid(payload->>'submitter_id'),
    public.safe_uuid(payload->>'submitterId'),
    public.safe_uuid(payload->>'reporter_id'),
    public.safe_uuid(payload->>'reporterId'),
    public.safe_uuid(payload->>'actor_id'),
    public.safe_uuid(payload->>'actorId'),
    public.safe_uuid(payload->>'profile_id'),
    public.safe_uuid(payload->>'profileId'),
    public.safe_uuid(payload->>'uid')
  ]);
$$;

create or replace function public.data_document_read_allowed(collection_name text, payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.data_document_collection_allowed(collection_name)
    and (
      public.data_document_actor_matches(payload)
      or upper(coalesce(payload->>'visibility', '')) = 'PUBLIC'
      or (
        upper(coalesce(payload->>'visibility', '')) = 'FRIENDS'
        and public.are_friends(
          public.safe_uuid(coalesce(payload->>'author_id', payload->>'authorId', payload->>'creator_id', payload->>'creatorId', payload->>'challenger_id', payload->>'challengerId')),
          auth.uid()
        )
      )
      or coalesce(payload->'participant_ids' ? auth.uid()::text, false)
      or public.is_conversation_member(
        public.safe_uuid(coalesce(payload->>'conversation_id', payload->>'conversationId'))
      )
      or public.safe_uuid(coalesce(payload->>'recipient_id', payload->>'recipientId')) = auth.uid()
      or split_part(collection_name, '/', 1) = any (array['daily_challenges','community_challenges'])
    );
$$;

create or replace function public.data_document_write_allowed(collection_name text, payload jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.data_document_collection_allowed(collection_name)
    and public.data_document_actor_matches(payload);
$$;

drop policy if exists data_documents_authenticated on public.data_documents;
create policy data_documents_read on public.data_documents
  for select to authenticated
  using (public.data_document_read_allowed(collection, data));
create policy data_documents_insert on public.data_documents
  for insert to authenticated
  with check (public.data_document_write_allowed(collection, data));
create policy data_documents_update on public.data_documents
  for update to authenticated
  using (public.data_document_write_allowed(collection, data))
  with check (public.data_document_write_allowed(collection, data));
create policy data_documents_delete on public.data_documents
  for delete to authenticated
  using (public.data_document_write_allowed(collection, data));

-- Friend request acceptance is recipient-controlled. Requesters cancel by
-- deleting their pending request; they cannot mutate its status.
create or replace function public.protect_friendship_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'Friendship participants cannot change';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() <> old.addressee_id
     or old.status <> 'PENDING'
     or new.status not in ('ACCEPTED', 'DECLINED')) then
    raise exception 'Only recipient can resolve pending friend request';
  end if;
  return new;
end;
$$;
drop trigger if exists friendships_protect_update on public.friendships;
create trigger friendships_protect_update
  before update on public.friendships
  for each row execute function public.protect_friendship_update();

drop policy if exists friendships_update on public.friendships;
create policy friendships_update_recipient on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'PENDING')
  with check (addressee_id = auth.uid());

drop policy if exists post_reactions_read on public.post_reactions;
create policy post_reactions_read_authorized on public.post_reactions
  for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id
      and (p.visibility = 'PUBLIC' or p.author_id = auth.uid()
        or (p.visibility = 'FRIENDS' and public.are_friends(p.author_id, auth.uid())))
  ));

alter table public.data_documents
  add constraint data_documents_collection_length check (char_length(collection) between 1 and 100),
  add constraint data_documents_id_length check (char_length(document_id) between 1 and 200),
  add constraint data_documents_payload_size check (octet_length(data::text) <= 524288);
create index if not exists data_documents_collection_created
  on public.data_documents(collection, created_at desc, document_id);
create index if not exists data_documents_payload_gin
  on public.data_documents using gin(data jsonb_path_ops);

-- Atomic multi-like update. RLS still applies because function is invoker-owned.
create or replace function public.record_post_reaction(
  p_post_id uuid,
  p_reaction text default 'LIKE',
  p_taps integer default 1
)
returns public.post_reactions
language plpgsql
security invoker
set search_path = public
as $$
declare result_row public.post_reactions;
begin
  if p_taps < 1 or p_taps > 50 then
    raise exception 'tap count must be between 1 and 50';
  end if;
  insert into public.post_reactions(post_id, user_id, reaction, taps)
  values (p_post_id, auth.uid(), p_reaction, p_taps)
  on conflict (post_id, user_id, reaction) do update
    set taps = least(50, public.post_reactions.taps + excluded.taps),
        updated_at = timezone('utc', now())
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.accept_friend_request(p_friendship_id uuid)
returns public.friendships
language plpgsql
security invoker
set search_path = public
as $$
declare result_row public.friendships;
begin
  update public.friendships
     set status = 'ACCEPTED', updated_at = timezone('utc', now())
   where id = p_friendship_id
     and addressee_id = auth.uid()
     and status = 'PENDING'
  returning * into result_row;
  if not found then raise exception 'Friend request cannot be accepted'; end if;
  return result_row;
end;
$$;

create or replace function public.mark_message_read(p_message_id uuid)
returns public.message_receipts
language plpgsql
security invoker
set search_path = public
as $$
declare result_row public.message_receipts;
begin
  if not exists (
    select 1 from public.messages m
    where m.id = p_message_id and public.is_conversation_member(m.conversation_id)
  ) then raise exception 'Message is not accessible'; end if;
  insert into public.message_receipts(message_id, user_id, delivered_at, read_at)
  values (p_message_id, auth.uid(), timezone('utc', now()), timezone('utc', now()))
  on conflict (message_id, user_id) do update
    set delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at),
        read_at = excluded.read_at
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.record_post_reaction(uuid,text,integer) from public;
revoke all on function public.accept_friend_request(uuid) from public;
revoke all on function public.mark_message_read(uuid) from public;
grant execute on function public.record_post_reaction(uuid,text,integer) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;

-- Storage reads follow the parent content's visibility. Uploads remain scoped
-- to the authenticated user's path and object owner.
drop policy if exists storage_owner_read on storage.objects;
drop policy if exists storage_owner_insert on storage.objects;
drop policy if exists storage_owner_update on storage.objects;
drop policy if exists storage_owner_delete on storage.objects;

create policy storage_authorized_read on storage.objects
  for select to authenticated
  using (
    owner_id = auth.uid()::text
    or (
      bucket_id = 'avatars'
      and public.can_view_profile(public.safe_uuid(split_part(name, '/', 2)))
    )
    or (
      bucket_id = 'post-media'
      and exists (
        select 1 from public.post_media pm
        join public.posts p on p.id = pm.post_id
        where pm.bucket_id = storage.objects.bucket_id
          and pm.object_path = storage.objects.name
          and (p.visibility = 'PUBLIC' or p.author_id = auth.uid()
            or (p.visibility = 'FRIENDS' and public.are_friends(p.author_id, auth.uid())))
      )
    )
    or (
      bucket_id = 'story-media'
      and exists (
        select 1 from public.stories s
        where s.media_bucket = storage.objects.bucket_id
          and s.media_path = storage.objects.name
          and s.expires_at > timezone('utc', now())
          and (s.visibility = 'PUBLIC' or s.author_id = auth.uid()
            or (s.visibility = 'FRIENDS' and public.are_friends(s.author_id, auth.uid())))
      )
    )
    or (
      bucket_id = 'dare-proofs'
      and exists (
        select 1 from public.dare_proofs dp
        join public.dares d on d.id = dp.dare_id
        where dp.bucket_id = storage.objects.bucket_id
          and dp.object_path = storage.objects.name
          and (d.creator_id = auth.uid() or d.receiver_id = auth.uid())
      )
    )
    or (
      bucket_id = 'chat-media'
      and exists (
        select 1 from public.messages m
        where m.media_bucket = storage.objects.bucket_id
          and m.media_path = storage.objects.name
          and public.is_conversation_member(m.conversation_id)
      )
    )
  );

create policy storage_owner_insert on storage.objects
  for insert to authenticated
  with check (
    owner_id = auth.uid()::text
    and public.safe_uuid(split_part(name, '/', 2)) = auth.uid()
  );
create policy storage_owner_update on storage.objects
  for update to authenticated
  using (owner_id = auth.uid()::text)
  with check (owner_id = auth.uid()::text);
create policy storage_owner_delete on storage.objects
  for delete to authenticated
  using (owner_id = auth.uid()::text);

create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (
      topic like 'dare:ephemeral:conversations_meta/%'
      and public.is_conversation_member(
        public.safe_uuid(split_part(topic, '/', 2))
      )
    )
    or topic like '%/' || auth.uid()::text || '%'
  );
$$;

drop policy if exists realtime_authenticated_read on realtime.messages;
drop policy if exists realtime_authenticated_send on realtime.messages;
create policy realtime_authorized_read on realtime.messages
  for select to authenticated
  using (public.can_use_realtime_topic(realtime.topic()));
create policy realtime_authorized_send on realtime.messages
  for insert to authenticated
  with check (public.can_use_realtime_topic(realtime.topic()));
