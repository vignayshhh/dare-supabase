-- Deliver durable direct-message mutations through one member-authorized
-- private Broadcast topic. This avoids Postgres Changes' per-subscriber row
-- authorization work and its lack of the browser's x-circle-id header.
create or replace function public.broadcast_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id uuid;
  payload jsonb;
begin
  if TG_OP = 'DELETE' then
    conversation_id := old.conversation_id;
    payload := jsonb_build_object('eventType', 'DELETE', 'old', to_jsonb(old), 'new', null);
  elsif TG_OP = 'UPDATE' then
    conversation_id := new.conversation_id;
    payload := jsonb_build_object('eventType', 'UPDATE', 'old', to_jsonb(old), 'new', to_jsonb(new));
  else
    conversation_id := new.conversation_id;
    payload := jsonb_build_object('eventType', 'INSERT', 'old', null, 'new', to_jsonb(new));
  end if;

  perform realtime.send(payload, 'message', 'conversation-messages:' || conversation_id::text, true);
  return null;
end;
$$;

drop trigger if exists messages_broadcast_conversation_delivery on public.messages;
create trigger messages_broadcast_conversation_delivery
after insert or update or delete on public.messages
for each row execute function public.broadcast_conversation_message();
