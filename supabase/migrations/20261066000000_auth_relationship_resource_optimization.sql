-- Reduce auth hydration requests and replace broad relationship changes with
-- authorized atomic transitions plus participant-scoped Broadcast events.

alter table public.truths add column if not exists workflow_state text;
update public.truths set workflow_state = case status when 'ANSWERED' then 'ANSWERED' when 'EXPIRED' then 'REJECTED' else 'SENT' end where workflow_state is null;
alter table public.truths alter column workflow_state set default 'SENT';
alter table public.truths alter column workflow_state set not null;
alter table public.truths drop constraint if exists truths_workflow_state_check;
alter table public.truths add constraint truths_workflow_state_check check (workflow_state in ('SENT','ANSWERED','UNDER_REVIEW','APPROVED','REJECTED'));
create index if not exists truths_creator_cursor_idx on public.truths(creator_id, created_at desc, id desc);
create index if not exists truths_receiver_cursor_idx on public.truths(receiver_id, created_at desc, id desc);

alter table public.dares add column if not exists workflow_state text;
update public.dares set workflow_state = coalesce(metadata->>'state', case status when 'ACCEPTED' then 'ACCEPTED' when 'SUBMITTED' then 'PROOF_SUBMITTED' when 'COMPLETED' then 'ACCEPTED_REAL' when 'REJECTED' then 'REJECTED_FAKE' else 'SENT' end) where workflow_state is null;
alter table public.dares alter column workflow_state set default 'SENT';
alter table public.dares alter column workflow_state set not null;
alter table public.dares drop constraint if exists dares_workflow_state_check;
alter table public.dares add constraint dares_workflow_state_check check (workflow_state in ('SENT','ACCEPTED','CHICKEN_OUT','PROOF_SUBMITTED','UNDER_REVIEW','FRIENDS_VALIDATION','ACCEPTED_REAL','REJECTED_FAKE'));
create index if not exists dares_creator_cursor_idx on public.dares(creator_id, created_at desc, id desc);
create index if not exists dares_receiver_workflow_cursor_idx on public.dares(receiver_id, workflow_state, created_at desc, id desc);

create or replace function public.sync_dare_workflow_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.workflow_state is null or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.workflow_state is not distinct from old.workflow_state) then
    new.workflow_state := case new.status when 'ACCEPTED' then 'ACCEPTED' when 'SUBMITTED' then 'PROOF_SUBMITTED' when 'COMPLETED' then 'ACCEPTED_REAL' when 'REJECTED' then 'REJECTED_FAKE' else 'SENT' end;
  end if;
  return new;
end;
$$;
drop trigger if exists dares_sync_workflow_state on public.dares;
create trigger dares_sync_workflow_state before insert or update on public.dares for each row execute function public.sync_dare_workflow_state();
revoke all on function public.sync_dare_workflow_state() from public, anon, authenticated;

create or replace function public.sync_truth_workflow_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workflow_state is null or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.workflow_state is not distinct from old.workflow_state) then
    new.workflow_state := case new.status when 'ANSWERED' then 'ANSWERED' when 'EXPIRED' then 'REJECTED' else 'SENT' end;
  end if;
  return new;
end;
$$;
drop trigger if exists truths_sync_workflow_state on public.truths;
create trigger truths_sync_workflow_state before insert or update on public.truths for each row execute function public.sync_truth_workflow_state();
revoke all on function public.sync_truth_workflow_state() from public, anon, authenticated;

create or replace function public.get_my_auth_profile(p_touch_activity boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null then raise exception 'unauthorized'; end if;
  if p_touch_activity then
    update public.profiles
    set last_active_at = timezone('utc', now())
    where id = actor
      and (last_active_at is null or last_active_at < timezone('utc', now()) - interval '1 minute');
  end if;
  select to_jsonb(profile_row) || jsonb_build_object(
    'notification_preferences', private_row.notification_preferences
  )
  into result
  from public.profiles profile_row
  left join public.profile_private private_row on private_row.user_id = profile_row.id
  where profile_row.id = actor;
  return result;
end;
$$;

revoke all on function public.get_my_auth_profile(boolean) from public, anon;
grant execute on function public.get_my_auth_profile(boolean) to authenticated, service_role;

create or replace function public.answer_truth_native(
  p_truth_id uuid,
  p_answer text,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := coalesce(auth.uid(), p_actor_id);
  result public.truths;
begin
  if actor is null
     or (auth.uid() is not null and p_actor_id is not null and auth.uid() <> p_actor_id)
     or nullif(btrim(coalesce(p_answer, '')), '') is null
     or char_length(p_answer) > 5000 then
    raise exception 'truth_forbidden_or_invalid_answer';
  end if;

  update public.truths
  set answer = btrim(p_answer),
      status = 'ANSWERED',
      workflow_state = 'APPROVED',
      updated_at = timezone('utc', now())
  where id = p_truth_id
    and receiver_id = actor
    and workflow_state = 'SENT'
  returning * into result;

  if result.id is null then
    if not exists(select 1 from public.truths where id = p_truth_id) then
      raise exception using errcode = 'P0002', message = 'truth_not_found';
    end if;
    raise exception using errcode = '42501', message = 'truth_not_answerable';
  end if;
  return to_jsonb(result) || jsonb_build_object(
    'challenger_id', result.creator_id,
    'state', result.workflow_state,
    'answered_at', result.updated_at,
    'reviewed_at', result.updated_at
  );
end;
$$;

revoke all on function public.answer_truth_native(uuid, text, uuid) from public, anon;
grant execute on function public.answer_truth_native(uuid, text, uuid) to authenticated;
grant execute on function public.answer_truth_native(uuid, text, uuid) to service_role;
grant execute on function public.submit_dare_proof_native(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.record_dare_vote_native(uuid, text, uuid) to authenticated;

create or replace function public.update_truth_workflow(p_truth_id uuid, p_patch jsonb)
returns public.truths
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_row public.truths;
  next_state text;
  next_status text;
  total_votes integer;
  truth_votes integer;
begin
  if actor is null then raise exception 'unauthorized'; end if;
  select * into current_row from public.truths where id = p_truth_id for update;
  if current_row.id is null then raise exception 'truth_not_found'; end if;

  next_state := coalesce(p_patch->>'workflow_state', current_row.workflow_state);
  if next_state not in ('SENT','ANSWERED','UNDER_REVIEW','APPROVED','REJECTED') then
    raise exception 'invalid_truth_state';
  end if;

  if p_patch ? 'answer' and actor <> current_row.receiver_id then
    raise exception 'only_receiver_may_answer';
  end if;

  if next_state is distinct from current_row.workflow_state then
    if actor = current_row.receiver_id
       and current_row.workflow_state = 'SENT'
       and next_state in ('ANSWERED','APPROVED','REJECTED') then
      null;
    elsif actor = current_row.creator_id
       and current_row.workflow_state in ('ANSWERED','UNDER_REVIEW')
       and next_state in ('APPROVED','REJECTED') then
      null;
    elsif exists (
      select 1 from public.truth_votes vote
      where vote.truth_id = p_truth_id and vote.voter_id = actor
    ) and next_state in ('APPROVED','REJECTED') then
      select count(*), count(*) filter (where vote = 'TRUTH')
      into total_votes, truth_votes
      from public.truth_votes where truth_id = p_truth_id;
      if total_votes < 3
         or (next_state = 'APPROVED') <> (truth_votes > total_votes - truth_votes) then
        raise exception 'truth_vote_result_not_final';
      end if;
    else
      raise exception 'invalid_truth_transition';
    end if;
  elsif actor <> current_row.creator_id and actor <> current_row.receiver_id then
    raise exception 'truth_forbidden';
  end if;

  next_status := case next_state
    when 'SENT' then 'OPEN'
    when 'REJECTED' then 'EXPIRED'
    else 'ANSWERED'
  end;

  update public.truths
  set answer = case when p_patch ? 'answer' then nullif(p_patch->>'answer', '') else current_row.answer end,
      workflow_state = next_state,
      status = next_status,
      updated_at = timezone('utc', now())
  where id = p_truth_id
  returning * into current_row;
  return current_row;
end;
$$;

revoke all on function public.update_truth_workflow(uuid, jsonb) from public, anon;
grant execute on function public.update_truth_workflow(uuid, jsonb) to authenticated, service_role;

create or replace function public.update_dare_workflow(p_dare_id uuid, p_patch jsonb)
returns public.dares
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_row public.dares;
  next_state text;
  next_status text;
  next_metadata jsonb;
begin
  if actor is null then raise exception 'unauthorized'; end if;
  select * into current_row from public.dares where id = p_dare_id for update;
  if current_row.id is null then raise exception 'dare_not_found'; end if;
  if actor is distinct from current_row.creator_id and actor is distinct from current_row.receiver_id
     and not exists(select 1 from public.dare_votes where dare_id = p_dare_id and voter_id = actor) then
    raise exception 'dare_forbidden';
  end if;
  next_state := coalesce(p_patch->>'workflow_state', current_row.workflow_state);
  if next_state not in ('SENT','ACCEPTED','CHICKEN_OUT','PROOF_SUBMITTED','UNDER_REVIEW','FRIENDS_VALIDATION','ACCEPTED_REAL','REJECTED_FAKE') then raise exception 'invalid_dare_state'; end if;
  if next_state <> current_row.workflow_state then
    if next_state in ('ACCEPTED','CHICKEN_OUT') and actor <> current_row.receiver_id then raise exception 'dare_forbidden'; end if;
    if next_state in ('PROOF_SUBMITTED','UNDER_REVIEW','FRIENDS_VALIDATION') and actor <> current_row.receiver_id then raise exception 'dare_forbidden'; end if;
    if next_state in ('ACCEPTED_REAL','REJECTED_FAKE') and actor <> current_row.creator_id
       and not exists(select 1 from public.dare_votes where dare_id = p_dare_id and voter_id = actor) then raise exception 'dare_forbidden'; end if;
  end if;
  next_status := case next_state when 'ACCEPTED' then 'ACCEPTED' when 'PROOF_SUBMITTED' then 'SUBMITTED' when 'UNDER_REVIEW' then 'SUBMITTED' when 'FRIENDS_VALIDATION' then 'SUBMITTED' when 'ACCEPTED_REAL' then 'COMPLETED' when 'REJECTED_FAKE' then 'REJECTED' when 'CHICKEN_OUT' then 'REJECTED' else 'PENDING' end;
  next_metadata := current_row.metadata || coalesce(p_patch->'metadata', '{}'::jsonb);
  update public.dares set
    workflow_state = next_state,
    status = next_status,
    metadata = next_metadata,
    submitted_at = coalesce(nullif(p_patch->>'submitted_at', '')::timestamptz, current_row.submitted_at),
    completed_at = coalesce(nullif(p_patch->>'completed_at', '')::timestamptz, current_row.completed_at),
    updated_at = timezone('utc', now())
  where id = p_dare_id returning * into current_row;
  return current_row;
end;
$$;
revoke all on function public.update_dare_workflow(uuid, jsonb) from public, anon;
grant execute on function public.update_dare_workflow(uuid, jsonb) to authenticated, service_role;

-- Workflow RPCs are the only authenticated mutation path. This prevents a
-- participant from changing ownership, visibility, counters, or lifecycle
-- fields through a direct PostgREST update.
drop policy if exists truths_update_participants on public.truths;
drop policy if exists dares_update_participants on public.dares;
revoke update on public.truths from authenticated;
revoke update on public.dares from authenticated;

create or replace function public.update_conversation_state(p_conversation_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  conversation_row public.conversations;
  next_payload jsonb;
begin
  if actor is null or not public.is_conversation_member(p_conversation_id) then raise exception 'conversation_access_denied'; end if;
  select * into conversation_row from public.conversations where id = p_conversation_id for update;
  if conversation_row.id is null then raise exception 'conversation_not_found'; end if;
  next_payload := coalesce(conversation_row.legacy_payload, '{}'::jsonb);
  if p_patch ? 'last_message_id' then next_payload := jsonb_set(next_payload, '{last_message_id}', coalesce(p_patch->'last_message_id', 'null'::jsonb), true); end if;
  if p_patch ? 'is_active' then next_payload := jsonb_set(next_payload, '{is_active}', coalesce(p_patch->'is_active', 'null'::jsonb), true); end if;
  if p_patch ? 'is_frozen' then next_payload := jsonb_set(next_payload, '{is_frozen}', coalesce(p_patch->'is_frozen', 'null'::jsonb), true); end if;
  if p_patch ? 'frozen_by' then next_payload := jsonb_set(next_payload, '{frozen_by}', coalesce(p_patch->'frozen_by', 'null'::jsonb), true); end if;
  update public.conversations set legacy_payload = next_payload, updated_at = timezone('utc', now()) where id = p_conversation_id returning * into conversation_row;
  return to_jsonb(conversation_row) || jsonb_build_object('conversation_members', (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', member.user_id)), '[]'::jsonb)
    from public.conversation_members member where member.conversation_id = p_conversation_id
  ));
end;
$$;
revoke all on function public.update_conversation_state(uuid, jsonb) from public, anon;
grant execute on function public.update_conversation_state(uuid, jsonb) to authenticated, service_role;

create or replace function public.create_relationship_with_alert(
  p_target_id uuid,
  p_type text,
  p_reason text,
  p_month_key text default null
) returns public.relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  owner_profile public.profiles;
  target_profile public.profiles;
  result public.relationships;
  message text;
begin
  if actor is null then raise exception 'unauthorized'; end if;
  if p_target_id is null or p_target_id = actor then raise exception 'invalid_relationship_target'; end if;
  if p_type not in ('conflict', 'alliance', 'favorite', 'rival') then raise exception 'invalid_relationship_type'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'invalid_relationship_reason'; end if;
  select * into owner_profile from public.profiles where id = actor;
  select * into target_profile from public.profiles where id = p_target_id;
  if owner_profile.id is null or target_profile.id is null then raise exception 'profile_not_found'; end if;
  if not public.can_view_profile(p_target_id) then raise exception 'relationship_target_not_visible'; end if;

  insert into public.relationships(
    owner_id, target_id, type, reason, target_reason, status,
    owner_snapshot, target_snapshot, month_key, watchers_count, resolved_by
  ) values (
    actor, p_target_id, p_type, btrim(p_reason), null,
    case when p_type = 'conflict' then 'unacknowledged' else 'mutual' end,
    jsonb_build_object('id', owner_profile.id, 'display_name', owner_profile.display_name, 'username', owner_profile.username, 'avatar_url', owner_profile.avatar_url),
    jsonb_build_object('id', target_profile.id, 'display_name', target_profile.display_name, 'username', target_profile.username, 'avatar_url', target_profile.avatar_url),
    case when p_type = 'favorite' then p_month_key else null end,
    case when p_type = 'conflict' then 8 when p_type = 'rival' then 5 else 3 end,
    '{}'::jsonb
  ) returning * into result;

  message := case when p_type = 'conflict'
    then owner_profile.display_name || ' declared conflict. Everyone in their circle can see it.'
    else owner_profile.display_name || ' declared a ' || p_type || ' status with you.' end;
  insert into public.alerts(recipient_id, actor_id, type, payload)
  values (p_target_id, actor, 'SYSTEM_NOTIFICATION', jsonb_build_object(
    'entityId', result.id,
    'actorName', owner_profile.display_name,
    'actorUsername', owner_profile.username,
    'actorAvatar', owner_profile.avatar_url,
    'message', message,
    'metadata', jsonb_build_object('relationshipId', result.id, 'relationshipType', p_type, 'reason', btrim(p_reason), 'targetUserId', p_target_id)
  ));
  return result;
end;
$$;

revoke all on function public.create_relationship_with_alert(uuid, text, text, text) from public, anon;
grant execute on function public.create_relationship_with_alert(uuid, text, text, text) to authenticated, service_role;

create or replace function public.respond_to_relationship_conflict(
  p_relationship_id uuid,
  p_response text,
  p_reason text default null
) returns public.relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  result public.relationships;
begin
  if actor is null then raise exception 'unauthorized'; end if;
  if p_response not in ('accept', 'counter') then raise exception 'invalid_response'; end if;
  if p_response = 'counter' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'counter_reason_required';
  end if;

  select * into result
  from public.relationships
  where id = p_relationship_id
  for update;

  if result.id is null then raise exception 'relationship_not_found'; end if;
  if result.target_id <> actor then raise exception 'only_target_may_respond'; end if;
  if result.type <> 'conflict' or result.status <> 'unacknowledged' then
    raise exception 'invalid_relationship_transition';
  end if;

  update public.relationships
  set status = case when p_response = 'accept' then 'mutual' else 'countered' end,
      target_reason = case when p_response = 'counter' then btrim(p_reason) else target_reason end,
      updated_at = timezone('utc', now())
  where id = p_relationship_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.respond_to_relationship_conflict(uuid, text, text) from public, anon;
grant execute on function public.respond_to_relationship_conflict(uuid, text, text) to authenticated, service_role;

drop policy if exists relationships_update on public.relationships;
drop policy if exists relationships_insert on public.relationships;
revoke insert, update on public.relationships from authenticated;

create or replace function public.can_use_realtime_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    (topic like 'inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'alerts:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'story-feed:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'relationship-profile:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'truth-inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'dare-inbox:%' and public.safe_uuid(split_part(topic, ':', 2)) = auth.uid())
    or (topic like 'presence:user:%' and public.safe_uuid(split_part(topic, ':', 3)) is not null and (public.safe_uuid(split_part(topic, ':', 3)) = auth.uid() or public.are_friends(auth.uid(), public.safe_uuid(split_part(topic, ':', 3)))))
    or (topic like 'typing:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'draft:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'conversation-state:%' and public.is_conversation_member(public.safe_uuid(split_part(topic, ':', 2))))
    or (topic like 'birthday-room:%' and exists (select 1 from public.birthday_rooms room where room.id = public.safe_uuid(split_part(topic, ':', 2)) and (room.birthday_user_id = auth.uid() or exists (select 1 from public.birthday_room_members member where member.room_id = room.id and member.user_id = auth.uid()) or exists (select 1 from public.birthday_room_participants participant where participant.room_id = room.id and participant.user_id = auth.uid()))))
    or (topic like 'cant-sleep:%' and exists (select 1 from public.cant_sleep_rooms room where room.id = substring(topic from 12) and room.status = 'open' and room.expires_at > timezone('utc', now())))
  );
$$;

revoke execute on function public.can_use_realtime_topic(text) from public, anon;
grant execute on function public.can_use_realtime_topic(text) to authenticated, service_role;

create or replace function public.broadcast_relationship_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  relationship_row public.relationships;
  recipient uuid;
begin
  relationship_row := coalesce(new, old);
  foreach recipient in array array[relationship_row.owner_id, relationship_row.target_id]
  loop
    perform realtime.send(
      jsonb_build_object('operation', tg_op, 'record', to_jsonb(relationship_row)),
      'relationship_changed',
      'relationship-profile:' || recipient::text,
      true
    );
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists relationships_broadcast_change on public.relationships;
create trigger relationships_broadcast_change
after insert or update or delete on public.relationships
for each row execute function public.broadcast_relationship_change();

revoke all on function public.broadcast_relationship_change() from public, anon, authenticated;
grant execute on function public.broadcast_relationship_change() to service_role;

create or replace function public.broadcast_alert_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alert_row public.alerts;
begin
  alert_row := coalesce(new, old);
  perform realtime.send(
    jsonb_build_object('operation', tg_op, 'record', to_jsonb(alert_row)),
    'alert_changed',
    'alerts:' || alert_row.recipient_id::text,
    true
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists alerts_broadcast_change on public.alerts;
create trigger alerts_broadcast_change
after insert or update or delete on public.alerts
for each row execute function public.broadcast_alert_change();

revoke all on function public.broadcast_alert_change() from public, anon, authenticated;
grant execute on function public.broadcast_alert_change() to service_role;

create or replace function public.broadcast_truth_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  truth_row public.truths;
  recipient uuid;
begin
  if tg_table_name = 'truth_votes' then
    select * into truth_row from public.truths where id = coalesce(new.truth_id, old.truth_id);
  else
    truth_row := coalesce(new, old);
  end if;
  if truth_row.id is null then return coalesce(new, old); end if;
  foreach recipient in array array[truth_row.creator_id, truth_row.receiver_id]
  loop
    if recipient is not null then
      perform realtime.send(jsonb_build_object('truthId', truth_row.id), 'truth_changed', 'truth-inbox:' || recipient::text, true);
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists truths_broadcast_change on public.truths;
create trigger truths_broadcast_change after insert or update or delete on public.truths for each row execute function public.broadcast_truth_change();
drop trigger if exists truth_votes_broadcast_change on public.truth_votes;
create trigger truth_votes_broadcast_change after insert or update or delete on public.truth_votes for each row execute function public.broadcast_truth_change();
revoke all on function public.broadcast_truth_change() from public, anon, authenticated;
grant execute on function public.broadcast_truth_change() to service_role;

create or replace function public.broadcast_dare_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare dare_row public.dares; recipient uuid;
begin
  if tg_table_name = 'dare_votes' then select * into dare_row from public.dares where id = coalesce(new.dare_id, old.dare_id); else dare_row := coalesce(new, old); end if;
  if dare_row.id is null then return coalesce(new, old); end if;
  foreach recipient in array array[dare_row.creator_id, dare_row.receiver_id] loop
    if recipient is not null then perform realtime.send(jsonb_build_object('dareId', dare_row.id), 'dare_changed', 'dare-inbox:' || recipient::text, true); end if;
  end loop;
  return coalesce(new, old);
end;
$$;
drop trigger if exists dares_broadcast_change on public.dares;
create trigger dares_broadcast_change after insert or update or delete on public.dares for each row execute function public.broadcast_dare_change();
drop trigger if exists dare_votes_broadcast_change on public.dare_votes;
create trigger dare_votes_broadcast_change after insert or update or delete on public.dare_votes for each row execute function public.broadcast_dare_change();
revoke all on function public.broadcast_dare_change() from public, anon, authenticated;
grant execute on function public.broadcast_dare_change() to service_role;
