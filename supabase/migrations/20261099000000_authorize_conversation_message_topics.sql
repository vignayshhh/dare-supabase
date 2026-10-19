-- Open-message subscriptions use one private topic per conversation. Restrict
-- access to conversation members, matching typing and conversation-state.
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
    or (topic like 'relationship-profile:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'truth-inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'dare-inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'presence:user:%' and public.safe_uuid(split_part(topic, ':', 3)) is not null and (public.safe_uuid(split_part(topic, ':', 3)) = auth.uid() or public.are_friends(auth.uid(), public.safe_uuid(split_part(topic, ':', 3)))))
    or (topic like 'typing:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'draft:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'conversation-state:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'conversation-messages:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'birthday-room:%' and exists (select 1 from public.birthday_rooms room where room.id = public.safe_uuid(split_part(topic, ':', 2)) and (room.birthday_user_id = auth.uid() or exists (select 1 from public.birthday_room_members member where member.room_id = room.id and member.user_id = auth.uid()) or exists (select 1 from public.birthday_room_participants participant where participant.room_id = room.id and participant.user_id = auth.uid()))))
    or (topic like 'cant-sleep:%' and exists (select 1 from public.cant_sleep_rooms room where room.id = substring(topic from 12) and room.status = 'open' and room.expires_at > timezone('utc', now())))
  );
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated, service_role;
