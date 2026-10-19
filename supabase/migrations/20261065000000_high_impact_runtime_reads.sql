-- High-impact runtime read reductions. Forward-only; safe for fresh or upgraded projects.

create or replace function public.get_friend_stories(
  p_user_id uuid,
  p_limit integer default 100
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select
      s.id,
      s.author_id,
      s.body,
      s.media_path,
      s.expires_at,
      s.created_at,
      s.legacy_payload,
      p.username as author_username,
      p.display_name as author_display_name,
      p.avatar_url as author_avatar,
      dedicated.id as dedicated_to_id,
      dedicated.username as dedicated_to_username,
      dedicated.display_name as dedicated_to_display_name,
      dedicated.avatar_url as dedicated_to_avatar,
      (select count(*)::integer from public.story_views v where v.story_id = s.id) as view_count,
      exists (
        select 1 from public.story_views viewer_state
        where viewer_state.story_id = s.id and viewer_state.viewer_id = p_user_id
      ) as has_viewed
    from public.stories s
    join public.profiles p on p.id = s.author_id
    left join public.profiles dedicated on dedicated.id = public.safe_uuid(
      coalesce(
        s.legacy_payload ->> 'dedicatedToUserId',
        s.legacy_payload ->> 'dedicated_to_user_id'
      )
    )
    where (p_user_id = auth.uid() or auth.role() = 'service_role')
      and s.expires_at > timezone('utc', now())
      and (
        s.author_id = p_user_id
        or (
          s.visibility in ('PUBLIC', 'FRIENDS')
          and exists (
            select 1 from public.friendships f
            where upper(f.status) = 'ACCEPTED'
              and ((f.requester_id = p_user_id and f.addressee_id = s.author_id)
                or (f.addressee_id = p_user_id and f.requester_id = s.author_id))
          )
        )
      )
    order by s.created_at desc, s.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'author_id', author_id,
      'body', body,
      'media_path', media_path,
      'expires_at', expires_at,
      'created_at', created_at,
      'metadata', coalesce(legacy_payload, '{}'::jsonb),
      'view_count', view_count,
      'has_viewed', has_viewed,
      'author_username', author_username,
      'author_display_name', author_display_name,
      'author_avatar', author_avatar
      ,'dedicated_to_id', dedicated_to_id
      ,'dedicated_to_username', dedicated_to_username
      ,'dedicated_to_display_name', dedicated_to_display_name
      ,'dedicated_to_avatar', dedicated_to_avatar
    ) order by created_at desc, id desc
  ), '[]'::jsonb)
  from eligible;
$$;

revoke all on function public.get_friend_stories(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_friend_stories(uuid, integer) to service_role;

create or replace function public.get_alert_page(p_limit integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with actor as (
    select auth.uid() as id
  ), page as (
    select a.id, a.recipient_id, a.actor_id, a.type, a.payload, a.read_at, a.created_at
    from public.alerts a, actor
    where actor.id is not null and a.recipient_id = actor.id
    order by a.created_at desc, a.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.created_at desc, page.id desc) from page), '[]'::jsonb),
    'unread_count', coalesce((select count(*) from public.alerts a, actor where a.recipient_id = actor.id and a.read_at is null), 0)
  );
$$;

revoke all on function public.get_alert_page(integer) from public, anon;
grant execute on function public.get_alert_page(integer) to authenticated, service_role;

create or replace function public.get_profile_social_context(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'friends_count', (
      select count(*) from public.friendships f
      where upper(f.status) = 'ACCEPTED'
        and (f.requester_id = p_profile_id or f.addressee_id = p_profile_id)
    ),
    'friends_preview', (
      select coalesce(jsonb_agg(to_jsonb(preview) order by preview.updated_at desc), '[]'::jsonb)
      from (
        select p.id, p.id as user_id, p.username, p.display_name, p.avatar_url,
               p.visibility, p.updated_at
        from public.friendships f
        join public.profiles p on p.id = case
          when f.requester_id = p_profile_id then f.addressee_id
          else f.requester_id
        end
        where upper(f.status) = 'ACCEPTED'
          and (f.requester_id = p_profile_id or f.addressee_id = p_profile_id)
          and public.can_view_profile(p.id)
        order by f.updated_at desc, f.id desc
        limit 6
      ) preview
    ),
    'friendship', (
      select jsonb_build_object(
        'id', f.id,
        'requesterId', f.requester_id,
        'addresseeId', f.addressee_id,
        'status', lower(f.status),
        'createdAt', f.created_at,
        'updatedAt', f.updated_at
      )
      from public.friendships f
      where auth.uid() is not null
        and ((f.requester_id = auth.uid() and f.addressee_id = p_profile_id)
          or (f.addressee_id = auth.uid() and f.requester_id = p_profile_id))
      limit 1
    )
  )
  where auth.uid() is not null
    and public.can_view_profile(p_profile_id);
$$;

revoke all on function public.get_profile_social_context(uuid) from public, anon;
grant execute on function public.get_profile_social_context(uuid) to authenticated, service_role;

-- One private inbox topic per user. Durable rows remain authoritative; payload only
-- identifies the affected conversation so clients can coalesce a scoped refresh.
create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (topic like 'inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'alerts:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'story-feed:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (
      topic like 'presence:user:%'
      and public.safe_uuid(split_part(topic, ':', 3)) is not null
      and (
        public.safe_uuid(split_part(topic, ':', 3)) = auth.uid()
        or public.are_friends(auth.uid(), public.safe_uuid(split_part(topic, ':', 3)))
      )
    )
    or (topic like 'typing:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'draft:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'conversation-state:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (
      topic like 'birthday-room:%'
      and exists (
        select 1 from public.birthday_rooms room
        where room.id = public.safe_uuid(split_part(topic, ':', 2))
          and (
            room.birthday_user_id = auth.uid()
            or exists (select 1 from public.birthday_room_members member where member.room_id = room.id and member.user_id = auth.uid())
            or exists (select 1 from public.birthday_room_participants participant where participant.room_id = room.id and participant.user_id = auth.uid())
          )
      )
    )
    or (
      topic like 'cant-sleep:%'
      and exists (
        select 1 from public.cant_sleep_rooms room
        where room.id = substring(topic from 12)
          and room.status = 'open'
          and room.expires_at > timezone('utc', now())
      )
    )
  );
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated, service_role;

create or replace function public.broadcast_inbox_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
  member_row record;
begin
  conversation_uuid := case
    when tg_table_name = 'messages' then coalesce(new.conversation_id, old.conversation_id)
    else coalesce(new.id, old.id)
  end;

  for member_row in
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = conversation_uuid
  loop
    perform realtime.send(
      jsonb_build_object('conversationId', conversation_uuid, 'changedAt', timezone('utc', now())),
      'inbox_changed',
      'inbox:' || member_row.user_id::text,
      true
    );
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists messages_broadcast_inbox_change on public.messages;
create trigger messages_broadcast_inbox_change
after insert or update or delete on public.messages
for each row execute function public.broadcast_inbox_change();

drop trigger if exists conversations_broadcast_inbox_change on public.conversations;
create trigger conversations_broadcast_inbox_change
after update on public.conversations
for each row execute function public.broadcast_inbox_change();

revoke all on function public.broadcast_inbox_change() from public, anon, authenticated;
grant execute on function public.broadcast_inbox_change() to service_role;

create or replace function public.broadcast_story_feed_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  story_row public.stories;
  recipient_row record;
begin
  story_row := coalesce(new, old);
  for recipient_row in
    select story_row.author_id as user_id
    union
    select case when f.requester_id = story_row.author_id then f.addressee_id else f.requester_id end
    from public.friendships f
    where upper(f.status) = 'ACCEPTED'
      and (f.requester_id = story_row.author_id or f.addressee_id = story_row.author_id)
  loop
    perform realtime.send(
      jsonb_build_object('storyId', story_row.id, 'changedAt', timezone('utc', now())),
      'story_changed',
      'story-feed:' || recipient_row.user_id::text,
      true
    );
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists stories_broadcast_feed_change on public.stories;
create trigger stories_broadcast_feed_change
after insert or update or delete on public.stories
for each row execute function public.broadcast_story_feed_change();

revoke all on function public.broadcast_story_feed_change() from public, anon, authenticated;
grant execute on function public.broadcast_story_feed_change() to service_role;

create index if not exists story_views_viewer_story_idx
  on public.story_views(viewer_id, story_id);
create index if not exists alerts_recipient_cursor_idx
  on public.alerts(recipient_id, created_at desc, id desc);
