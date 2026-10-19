-- Game state is shared social state.  Do not let a browser choose another
-- participant's id or overwrite JSON answer/join maps with a stale snapshot.

create unique index if not exists conversation_game_rounds_session_round_unique
  on public.conversation_game_rounds(session_id, round_index);

create or replace function public.create_conversation_game_invite(
  p_conversation_id uuid, p_type text, p_title text, p_other_user_name text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); participant_ids uuid[]; session_row public.conversation_game_sessions; event_id uuid := gen_random_uuid();
begin
  if actor is null or not public.is_conversation_member(p_conversation_id) then raise exception 'conversation_access_denied'; end if;
  select array_agg(user_id order by user_id) into participant_ids from public.conversation_members where conversation_id=p_conversation_id;
  if coalesce(array_length(participant_ids,1),0) < 2 then raise exception 'game_requires_two_members'; end if;
  insert into public.conversation_game_sessions(id,conversation_id,type,title,participants,created_by,status,event_id)
  values(gen_random_uuid(),p_conversation_id,p_type,left(trim(p_title),80),participant_ids,actor,'waiting',event_id)
  returning * into session_row;
  insert into public.message_events(id,conversation_id,actor_id,event_type,payload)
  values(event_id,p_conversation_id,actor,'invite',jsonb_build_object('action','game_invite','game_type',p_type,'game_title',left(trim(p_title),80),'session_id',session_row.id,'inviter_id',actor,'other_user_name',left(trim(p_other_user_name),80),'participants',participant_ids));
  return to_jsonb(session_row);
end $$;

create or replace function public.join_conversation_game(p_conversation_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); s public.conversation_game_sessions;
begin
  if actor is null then raise exception 'unauthenticated'; end if;
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if not public.is_conversation_member(p_conversation_id) or not actor=any(s.participants) then raise exception 'conversation_access_denied'; end if;
  update public.conversation_game_sessions set joined_by=jsonb_set(s.joined_by,array[actor::text],to_jsonb(timezone('utc',now())),true),updated_at=timezone('utc',now()) where id=s.id returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.activate_conversation_game(p_conversation_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); s public.conversation_game_sessions;
begin
  select * into s from public.conversation_game_sessions where id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if actor is null or actor<>s.created_by or not public.is_conversation_member(p_conversation_id) then raise exception 'conversation_access_denied'; end if;
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
  if actor is null or actor<>s.created_by or s.status<>'active' or not public.is_conversation_member(p_conversation_id) then raise exception 'conversation_access_denied'; end if;
  if exists(select 1 from public.conversation_game_rounds where session_id=s.id and status='voting') then raise exception 'game_round_active'; end if;
  next_index:=s.round_index+1;
  insert into public.conversation_game_rounds(conversation_id,session_id,type,status,round_index,created_by,prompt,left_option,right_option,symbol,custom,participants)
  values(p_conversation_id,s.id,p_type,'voting',next_index,actor,left(trim(p_prompt),240),nullif(left(trim(coalesce(p_left_option,'')),180),''),nullif(left(trim(coalesce(p_right_option,'')),180),''),nullif(left(trim(coalesce(p_symbol,'')),20),''),p_custom,s.participants) returning * into r;
  update public.conversation_game_sessions set current_round_id=r.id,round_index=next_index,updated_at=timezone('utc',now()) where id=s.id;
  return to_jsonb(r);
end $$;

create or replace function public.answer_conversation_game_round(p_conversation_id uuid,p_session_id uuid,p_round_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); r public.conversation_game_rounds; answers jsonb; choices text[]; result_value text;
begin
  select * into r from public.conversation_game_rounds where id=p_round_id and session_id=p_session_id and conversation_id=p_conversation_id for update;
  if not found then raise exception 'game_round_not_found'; end if;
  if actor is null or not public.is_conversation_member(p_conversation_id) or not actor=any(r.participants) then raise exception 'conversation_access_denied'; end if;
  if r.status<>'voting' or r.answers ? actor::text then return to_jsonb(r); end if;
  answers:=jsonb_set(r.answers,array[actor::text],jsonb_build_object('choice',left(trim(p_choice),32),'answered_at',timezone('utc',now())),true);
  if (select bool_and(answers ? member_id::text) from unnest(r.participants) member_id) then
    select array_agg(value->>'choice' order by key) into choices from jsonb_each(answers) where key=any(array(select member_id::text from unnest(r.participants) member_id));
    result_value:=case when (select count(distinct value) from unnest(choices) value)=1 then 'match' else 'split' end;
  end if;
  update public.conversation_game_rounds set answers=answers,status=case when result_value is null then 'voting' else 'revealed' end,result=result_value,darren_line=case when result_value='split' then 'Interesting.' else null end,updated_at=timezone('utc',now()) where id=r.id returning * into r;
  if result_value is not null then update public.conversation_game_sessions set darren_line=r.darren_line,updated_at=timezone('utc',now()) where id=p_session_id; end if;
  return to_jsonb(r);
end $$;

drop policy if exists conversation_game_sessions_member on public.conversation_game_sessions;
drop policy if exists conversation_game_rounds_member on public.conversation_game_rounds;
create policy conversation_game_sessions_read on public.conversation_game_sessions for select to authenticated using (public.is_conversation_member(conversation_id));
create policy conversation_game_rounds_read on public.conversation_game_rounds for select to authenticated using (public.is_conversation_member(conversation_id));
revoke insert,update,delete on public.conversation_game_sessions,public.conversation_game_rounds from authenticated;
revoke all on function public.create_conversation_game_invite(uuid,text,text,text),public.join_conversation_game(uuid,uuid),public.activate_conversation_game(uuid,uuid),public.create_conversation_game_round(uuid,uuid,text,text,text,text,text,boolean),public.answer_conversation_game_round(uuid,uuid,uuid,text) from public;
grant execute on function public.create_conversation_game_invite(uuid,text,text,text),public.join_conversation_game(uuid,uuid),public.activate_conversation_game(uuid,uuid),public.create_conversation_game_round(uuid,uuid,text,text,text,text,text,boolean),public.answer_conversation_game_round(uuid,uuid,uuid,text) to authenticated;
