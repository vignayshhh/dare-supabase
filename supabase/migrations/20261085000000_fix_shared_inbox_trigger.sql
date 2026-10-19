-- `broadcast_inbox_change` is attached to both messages and conversations.
-- Accessing `NEW.conversation_id` directly is invalid for a conversations row,
-- even when guarded by a CASE expression. Read the generic trigger records as
-- JSON instead so both row shapes are safe.
create or replace function public.broadcast_inbox_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_uuid uuid;
  member_row record;
begin
  if tg_table_name = 'messages' then
    conversation_uuid := coalesce(
      (to_jsonb(new)->>'conversation_id')::uuid,
      (to_jsonb(old)->>'conversation_id')::uuid
    );
  else
    conversation_uuid := coalesce(
      (to_jsonb(new)->>'id')::uuid,
      (to_jsonb(old)->>'id')::uuid
    );
  end if;

  if conversation_uuid is null then
    return coalesce(new, old);
  end if;

  for member_row in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = conversation_uuid
  loop
    perform realtime.send(
      jsonb_build_object(
        'conversationId', conversation_uuid,
        'changedAt', timezone('utc', now())
      ),
      'inbox_changed',
      'inbox:' || member_row.user_id::text,
      true
    );
  end loop;

  return coalesce(new, old);
end;
$$;
