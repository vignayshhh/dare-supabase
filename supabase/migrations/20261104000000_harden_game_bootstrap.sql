create or replace function public.activate_conversation_game(p_conversation_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); s public.conversation_game_sessions;
begin
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if actor is null or not public.is_conversation_member(p_conversation_id) or not actor=any(s.participants) then raise exception 'conversation_access_denied'; end if;
  if s.status='waiting' and not (select bool_and(s.joined_by ? member_id::text) from unnest(s.participants) member_id) then raise exception 'game_waiting_for_players'; end if;
  update public.conversation_game_sessions set status=case when s.status='waiting' then 'active' else s.status end,updated_at=timezone('utc',now()) where id=s.id returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.create_conversation_game_round(p_conversation_id uuid,p_session_id uuid,p_type text,p_prompt text,p_left_option text default null,p_right_option text default null,p_symbol text default null,p_custom boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); s public.conversation_game_sessions; r public.conversation_game_rounds; next_index integer;
begin
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if actor is null or not public.is_conversation_member(p_conversation_id) or not actor=any(s.participants) then raise exception 'conversation_access_denied'; end if;
  if s.status<>'active' then raise exception 'game_not_active'; end if;
  select * into r from public.conversation_game_rounds where session_id=s.id and status='voting' order by round_index asc limit 1;
  if found then return to_jsonb(r); end if;
  next_index:=s.round_index+1;
  insert into public.conversation_game_rounds(conversation_id,session_id,type,status,round_index,created_by,prompt,left_option,right_option,symbol,custom,participants)
  values(p_conversation_id,s.id,p_type,'voting',next_index,actor,left(trim(p_prompt),240),nullif(left(trim(coalesce(p_left_option,'')),180),''),nullif(left(trim(coalesce(p_right_option,'')),180),''),nullif(left(trim(coalesce(p_symbol,'')),20),''),p_custom,s.participants) returning * into r;
  update public.conversation_game_sessions set current_round_id=r.id,round_index=next_index,updated_at=timezone('utc',now()) where id=s.id;
  return to_jsonb(r);
end $$;

grant execute on function public.activate_conversation_game(uuid,uuid), public.create_conversation_game_round(uuid,uuid,text,text,text,text,text,boolean) to authenticated;
