create or replace function public.send_message(
  p_conversation_id uuid,p_body text,p_media_bucket text default null,p_media_path text default null,p_reply_to_id uuid default null
) returns public.messages language plpgsql security invoker set search_path=public as $$
declare v_message public.messages;
begin
  if not exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'conversation_access_denied'; end if;
  insert into public.messages(conversation_id,sender_id,body,media_bucket,media_path,reply_to_id)
  values(p_conversation_id,auth.uid(),coalesce(p_body,''),p_media_bucket,p_media_path,p_reply_to_id)
  returning * into v_message;
  update public.conversations set last_message_at=v_message.created_at,updated_at=v_message.created_at where id=p_conversation_id;
  insert into public.message_receipts(message_id,user_id,delivered_at)
  select v_message.id,user_id,v_message.created_at from public.conversation_members where conversation_id=p_conversation_id and user_id<>auth.uid()
  on conflict(message_id,user_id) do update set delivered_at=coalesce(public.message_receipts.delivered_at,excluded.delivered_at);
  return v_message;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid,p_message_id uuid default null)
returns void language plpgsql security invoker set search_path=public as $$
declare v_at timestamptz;
begin
  if not exists(select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'conversation_access_denied'; end if;
  select coalesce(m.created_at,timezone('utc',now())) into v_at from public.messages m where m.id=p_message_id;
  v_at:=coalesce(v_at,timezone('utc',now()));
  update public.conversation_members set last_read_at=v_at where conversation_id=p_conversation_id and user_id=auth.uid();
  update public.message_receipts mr set read_at=v_at where mr.user_id=auth.uid() and exists(select 1 from public.messages m where m.id=mr.message_id and m.conversation_id=p_conversation_id and m.created_at<=v_at);
end;
$$;
revoke all on function public.send_message(uuid,text,text,text,uuid) from public;
revoke all on function public.mark_conversation_read(uuid,uuid) from public;
grant execute on function public.send_message(uuid,text,text,text,uuid) to authenticated,service_role;
grant execute on function public.mark_conversation_read(uuid,uuid) to authenticated,service_role;
