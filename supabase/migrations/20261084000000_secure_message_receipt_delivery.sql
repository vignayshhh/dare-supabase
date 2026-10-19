-- Deliberately unapplied: QA found that an authenticated sender can insert a
-- message but cannot create the recipient's delivery receipt under the
-- receipts_own RLS policy. Keep the authorization check inside this narrowly
-- scoped RPC, then run its multi-row write as the function owner.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_media_bucket text default null,
  p_media_path text default null,
  p_reply_to_id uuid default null
) returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  if not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  ) then
    raise exception 'conversation_access_denied';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    media_bucket,
    media_path,
    reply_to_id
  ) values (
    p_conversation_id,
    auth.uid(),
    coalesce(p_body, ''),
    p_media_bucket,
    p_media_path,
    p_reply_to_id
  ) returning * into v_message;

  update public.conversations
  set last_message_at = v_message.created_at,
      updated_at = v_message.created_at
  where id = p_conversation_id;

  insert into public.message_receipts(message_id, user_id, delivered_at)
  select v_message.id, user_id, v_message.created_at
  from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id <> auth.uid()
  on conflict(message_id, user_id) do update
  set delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at);

  return v_message;
end;
$$;

revoke all on function public.send_message(uuid, text, text, text, uuid) from public;
grant execute on function public.send_message(uuid, text, text, text, uuid)
  to authenticated, service_role;
