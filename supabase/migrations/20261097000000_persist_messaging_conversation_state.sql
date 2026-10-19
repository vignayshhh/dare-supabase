-- Keep user-visible conversation controls durable while restricting callers to
-- the small allow-list below. Realtime broadcasts remain the fast path; this
-- payload is the reload/reconnect source of truth.
create or replace function public.update_conversation_state(
  p_conversation_id uuid,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  conversation_row public.conversations;
  next_payload jsonb;
begin
  if actor is null or not public.is_conversation_member(p_conversation_id) then
    raise exception 'conversation_access_denied';
  end if;

  select * into conversation_row
  from public.conversations
  where id = p_conversation_id
  for update;

  if conversation_row.id is null then
    raise exception 'conversation_not_found';
  end if;

  next_payload := coalesce(conversation_row.legacy_payload, '{}'::jsonb);
  if p_patch ? 'last_message_id' then
    next_payload := jsonb_set(next_payload, '{last_message_id}', coalesce(p_patch->'last_message_id', 'null'::jsonb), true);
  end if;
  if p_patch ? 'is_active' then
    next_payload := jsonb_set(next_payload, '{is_active}', coalesce(p_patch->'is_active', 'null'::jsonb), true);
  end if;
  if p_patch ? 'is_frozen' then
    next_payload := jsonb_set(next_payload, '{is_frozen}', coalesce(p_patch->'is_frozen', 'null'::jsonb), true);
  end if;
  if p_patch ? 'frozen_by' then
    next_payload := jsonb_set(next_payload, '{frozen_by}', coalesce(p_patch->'frozen_by', 'null'::jsonb), true);
  end if;
  if p_patch ? 'mood_block' then
    next_payload := jsonb_set(next_payload, '{mood_block}', coalesce(p_patch->'mood_block', 'null'::jsonb), true);
  end if;

  update public.conversations
  set legacy_payload = next_payload
  where id = p_conversation_id
  returning * into conversation_row;

  return to_jsonb(conversation_row) || jsonb_build_object(
    'conversation_members', (
      select coalesce(
        jsonb_agg(jsonb_build_object('user_id', member.user_id)),
        '[]'::jsonb
      )
      from public.conversation_members member
      where member.conversation_id = p_conversation_id
    )
  );
end;
$$;

revoke all on function public.update_conversation_state(uuid, jsonb) from public, anon;
grant execute on function public.update_conversation_state(uuid, jsonb) to authenticated, service_role;
