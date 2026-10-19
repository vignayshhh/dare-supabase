create or replace function public.complete_conversation_game(p_conversation_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); s public.conversation_game_sessions;
begin
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if actor is null or not public.is_conversation_member(p_conversation_id) or not actor=any(s.participants) then raise exception 'conversation_access_denied'; end if;
  update public.conversation_game_sessions set status='completed', updated_at=timezone('utc',now()) where id=s.id returning * into s;
  if s.event_id is not null then
    update public.message_events set payload = payload || jsonb_build_object('action','game_played','completed_by',actor,'completed_at',timezone('utc',now())) where id=s.event_id;
  end if;
  return to_jsonb(s);
end $$;

create or replace function public.leave_conversation_game(p_conversation_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); s public.conversation_game_sessions; exited jsonb;
begin
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if actor is null or not public.is_conversation_member(p_conversation_id) or not actor=any(s.participants) then raise exception 'conversation_access_denied'; end if;
  exited := coalesce(s.exited_by,'{}'::jsonb) || jsonb_build_object(actor::text,timezone('utc',now()));
  update public.conversation_game_sessions set exited_by=exited, status=case when (select bool_and(exited ? member_id::text) from unnest(s.participants) member_id) then 'completed' else status end, updated_at=timezone('utc',now()) where id=s.id returning * into s;
  return to_jsonb(s);
end $$;

revoke all on function public.complete_conversation_game(uuid,uuid), public.leave_conversation_game(uuid,uuid) from public;
grant execute on function public.complete_conversation_game(uuid,uuid), public.leave_conversation_game(uuid,uuid) to authenticated;
