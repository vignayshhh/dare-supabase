create or replace function public.accept_chat_invite(p_invite_id text)
returns public.chat_invites language plpgsql security definer set search_path=public as $$
declare v_invite public.chat_invites;
declare v_now timestamptz:=timezone('utc',now());
begin
  select * into v_invite from public.chat_invites
  where (legacy_key=p_invite_id or id::text=p_invite_id) and recipient_id=auth.uid() and status='PENDING'
  for update;
  if v_invite.id is null then raise exception 'invite_not_found_or_unauthorized'; end if;
  update public.chat_invites set status='ACCEPTED',joined_at=v_now,ended_at=null,updated_at=v_now where id=v_invite.id returning * into v_invite;
  insert into public.conversation_members(conversation_id,user_id,role,joined_at)
  values(v_invite.conversation_id,auth.uid(),'MEMBER',v_now)
  on conflict(conversation_id,user_id) do update set joined_at=least(public.conversation_members.joined_at,excluded.joined_at);
  return v_invite;
end; $$;

create or replace function public.end_chat_invite_access(p_invite_id text,p_action text)
returns public.chat_invites language plpgsql security definer set search_path=public as $$
declare v_invite public.chat_invites;
declare v_now timestamptz:=timezone('utc',now());
begin
  if p_action not in ('removed','left') then raise exception 'invalid_invite_action'; end if;
  select * into v_invite from public.chat_invites where legacy_key=p_invite_id or id::text=p_invite_id for update;
  if v_invite.id is null or v_invite.status<>'ACCEPTED' then raise exception 'invite_not_found_or_inactive'; end if;
  if (p_action='left' and v_invite.recipient_id<>auth.uid()) or (p_action='removed' and not (v_invite.original_participant_ids ? auth.uid()::text)) then raise exception 'invite_action_not_authorized'; end if;
  update public.chat_invites set status=case when p_action='removed' then 'DECLINED' else 'EXPIRED' end,ended_at=v_now,updated_at=v_now where id=v_invite.id returning * into v_invite;
  delete from public.conversation_members where conversation_id=v_invite.conversation_id and user_id=v_invite.recipient_id;
  return v_invite;
end; $$;

revoke all on function public.accept_chat_invite(text) from public;
revoke all on function public.end_chat_invite_access(text,text) from public;
grant execute on function public.accept_chat_invite(text) to authenticated,service_role;
grant execute on function public.end_chat_invite_access(text,text) to authenticated,service_role;
