create or replace function public.create_conversation_game_invite(
  p_conversation_id uuid, p_type text, p_title text, p_other_user_name text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); participant_ids uuid[]; session_row public.conversation_game_sessions; event_id uuid := gen_random_uuid(); session_id uuid := gen_random_uuid(); clean_title text := left(trim(p_title),80);
begin
  if actor is null or not public.is_conversation_member(p_conversation_id) then raise exception 'conversation_access_denied'; end if;
  select array_agg(user_id order by user_id) into participant_ids from public.conversation_members where conversation_id=p_conversation_id;
  if coalesce(array_length(participant_ids,1),0) < 2 then raise exception 'game_requires_two_members'; end if;
  insert into public.message_events(id,conversation_id,actor_id,event_type,payload)
  values(event_id,p_conversation_id,actor,'invite',jsonb_build_object('action','game_invite','game_type',p_type,'game_title',clean_title,'session_id',session_id,'inviter_id',actor,'other_user_name',left(trim(p_other_user_name),80),'participants',participant_ids));
  insert into public.conversation_game_sessions(id,conversation_id,type,title,participants,created_by,status,event_id)
  values(session_id,p_conversation_id,p_type,clean_title,participant_ids,actor,'waiting',event_id)
  returning * into session_row;
  return to_jsonb(session_row);
end $$;
