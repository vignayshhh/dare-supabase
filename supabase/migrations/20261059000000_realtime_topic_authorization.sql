-- Authorize current private Broadcast/Presence topics from relational membership.
create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (
      topic like 'presence:user:%'
      and public.safe_uuid(split_part(topic, ':', 3)) is not null
      and (
        public.safe_uuid(split_part(topic, ':', 3)) = auth.uid()
        or public.are_friends(auth.uid(), public.safe_uuid(split_part(topic, ':', 3)))
      )
    )
    or (
      topic like 'typing:%'
      and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2)))
    )
    or (
      topic like 'draft:%'
      and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2)))
    )
    or (
      topic like 'conversation-state:%'
      and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2)))
    )
    or (
      topic like 'birthday-room:%'
      and exists (
        select 1
        from public.birthday_rooms room
        where room.id = public.safe_uuid(split_part(topic, ':', 2))
          and (
            room.birthday_user_id = auth.uid()
            or exists (
              select 1 from public.birthday_room_members member
              where member.room_id = room.id and member.user_id = auth.uid()
            )
            or exists (
              select 1 from public.birthday_room_participants participant
              where participant.room_id = room.id and participant.user_id = auth.uid()
            )
          )
      )
    )
  );
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated, service_role;
