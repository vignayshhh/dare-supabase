create or replace function public.join_community_challenge(
  p_join_id text,
  p_challenge_id uuid,
  p_challenge_title text,
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_avatar_url text,
  p_total_days integer,
  p_official_dare boolean
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_status text;
  now_value timestamptz := timezone('utc', now());
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'community_join_actor_mismatch';
  end if;

  select status into existing_status
    from public.community_challenge_joins
   where id = p_join_id
   for update;

  if existing_status is not null
     and existing_status not in ('completed', 'eliminated') then
    return true;
  end if;

  insert into public.community_challenge_joins (
    id, challenge_id, challenge_title, user_id, username, display_name,
    avatar_url, status, current_day, total_days, proof_due_at,
    proof_window_hours, last_proof_day, last_proof_at, eliminated_at,
    completed_at, elimination_reason, official_dare, created_at, updated_at
  ) values (
    p_join_id, p_challenge_id, left(coalesce(p_challenge_title, ''), 240),
    p_user_id, left(coalesce(p_username, ''), 80),
    left(coalesce(p_display_name, 'Dare User'), 80),
    left(coalesce(p_avatar_url, ''), 2000), 'waiting', 1,
    greatest(1, least(coalesce(p_total_days, 7), 365)), null, 24, 0,
    null, null, null, '', coalesce(p_official_dare, false), now_value, now_value
  )
  on conflict (id) do update set
    challenge_id = excluded.challenge_id,
    challenge_title = excluded.challenge_title,
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    status = excluded.status,
    current_day = excluded.current_day,
    total_days = excluded.total_days,
    proof_due_at = excluded.proof_due_at,
    proof_window_hours = excluded.proof_window_hours,
    last_proof_day = excluded.last_proof_day,
    last_proof_at = excluded.last_proof_at,
    eliminated_at = excluded.eliminated_at,
    completed_at = excluded.completed_at,
    elimination_reason = excluded.elimination_reason,
    official_dare = excluded.official_dare,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.join_community_challenge(text, uuid, text, uuid, text, text, text, integer, boolean)
  from public, anon;
grant execute on function public.join_community_challenge(text, uuid, text, uuid, text, text, text, integer, boolean)
  to authenticated;
