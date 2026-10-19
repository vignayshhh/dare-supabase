-- Promote a community batch as soon as it reaches its required member count.
-- The prior join RPC persisted every member as `waiting`, but never started a
-- qualifying batch, leaving the authenticated challenge room unreachable.
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
security definer
set search_path = public
set row_security = off
as $$
declare
  now_value timestamptz := timezone('utc', now());
  minimum_members integer := 2;
  eligible_members integer := 0;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'community_join_actor_mismatch';
  end if;

  select greatest(1, coalesce(max(min_required_members), 2))
    into minimum_members
    from public.community_challenge_summaries
   where id = p_challenge_id or challenge_id = p_challenge_id;

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
    null, null, '', coalesce(p_official_dare, false), now_value, now_value
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now_value;

  select count(*)::integer
    into eligible_members
    from public.community_challenge_joins
   where challenge_id = p_challenge_id
     and status in ('waiting', 'active', 'submitted');

  if eligible_members >= minimum_members then
    update public.community_challenge_joins
       set status = 'active',
           proof_due_at = coalesce(proof_due_at, now_value + interval '24 hours'),
           updated_at = now_value
     where challenge_id = p_challenge_id
       and status = 'waiting';

    update public.community_challenge_summaries
       set joined_count = eligible_members,
           waiting_count = 0,
           active_count = eligible_members,
           batch_status = 'started',
           batch_started_at = coalesce(batch_started_at, now_value),
           updated_at = now_value
     where id = p_challenge_id or challenge_id = p_challenge_id;
  else
    update public.community_challenge_summaries
       set joined_count = eligible_members,
           waiting_count = eligible_members,
           active_count = 0,
           batch_status = case when eligible_members > 0 then 'waiting' else 'open' end,
           registration_started_at = case when eligible_members > 0 then coalesce(registration_started_at, now_value) else null end,
           updated_at = now_value
     where id = p_challenge_id or challenge_id = p_challenge_id;
  end if;

  return true;
end;
$$;

revoke all on function public.join_community_challenge(text, uuid, text, uuid, text, text, text, integer, boolean)
  from public, anon;
grant execute on function public.join_community_challenge(text, uuid, text, uuid, text, text, text, integer, boolean)
  to authenticated;

-- Repair already-created qualifying batches, including the retained A/B QA
-- fixture that exposed the missing transition.
with eligible as (
  select
    j.challenge_id,
    count(*)::integer as member_count
  from public.community_challenge_joins j
  left join public.community_challenge_summaries s
    on s.id = j.challenge_id or s.challenge_id = j.challenge_id
  where j.status in ('waiting', 'active', 'submitted')
  group by j.challenge_id
  having count(*) >= greatest(1, coalesce(max(s.min_required_members), 2))
), promoted as (
  update public.community_challenge_joins j
     set status = 'active',
         proof_due_at = coalesce(j.proof_due_at, timezone('utc', now()) + interval '24 hours'),
         updated_at = timezone('utc', now())
    from eligible e
   where j.challenge_id = e.challenge_id
     and j.status = 'waiting'
  returning j.challenge_id
)
update public.community_challenge_summaries s
   set joined_count = e.member_count,
       waiting_count = 0,
       active_count = e.member_count,
       batch_status = 'started',
       batch_started_at = coalesce(s.batch_started_at, timezone('utc', now())),
       updated_at = timezone('utc', now())
  from eligible e
 where s.id = e.challenge_id or s.challenge_id = e.challenge_id;
