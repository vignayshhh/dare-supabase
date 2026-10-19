-- Read-only counter diagnostics and bounded administrative repair.
-- Normal writes remain delta-maintained by the preceding migration.

create or replace function public.report_post_counter_drift(p_limit integer default 500)
returns table(post_id uuid, stored_reactions integer, actual_reactions integer, stored_comments integer, actual_comments bigint)
language sql stable security definer set search_path = public
as $$
  with ids as (
    select id from public.posts order by id limit greatest(1, least(coalesce(p_limit, 500), 5000))
  )
  select p.id, p.reaction_count,
    coalesce((select sum(r.taps)::integer from public.post_reactions r where r.post_id=p.id),0),
    p.comment_count,
    (select count(*) from public.post_comments c where c.post_id=p.id)
  from public.posts p join ids on ids.id=p.id
  where p.reaction_count is distinct from coalesce((select sum(r.taps)::integer from public.post_reactions r where r.post_id=p.id),0)
     or p.comment_count is distinct from (select count(*)::integer from public.post_comments c where c.post_id=p.id);
$$;
revoke all on function public.report_post_counter_drift(integer) from public, anon, authenticated;
grant execute on function public.report_post_counter_drift(integer) to service_role;

create or replace function public.repair_post_counters(p_post_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare changed integer := 0;
begin
  update public.posts p set
    reaction_count=coalesce((select sum(r.taps)::integer from public.post_reactions r where r.post_id=p.id),0),
    comment_count=(select count(*)::integer from public.post_comments c where c.post_id=p.id)
  where p_post_ids is null or p.id = any(p_post_ids);
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.repair_post_counters(uuid[]) from public, anon, authenticated;
grant execute on function public.repair_post_counters(uuid[]) to service_role;

create or replace function public.report_verdict_counter_drift(p_limit integer default 500)
returns table(verdict_id uuid, stored_choice_one integer, actual_choice_one bigint, stored_choice_two integer, actual_choice_two bigint, stored_total integer, actual_total bigint)
language sql stable security definer set search_path = public
as $$
  with actual as (
    select v.id,
      v.choice_one_votes, v.choice_two_votes, v.total_votes,
      count(*) filter (where vv.choice='one') as one_count,
      count(*) filter (where vv.choice='two') as two_count,
      count(*) as total_count
    from public.verdicts v left join public.verdict_votes vv on vv.verdict_id=v.id
    group by v.id, v.choice_one_votes, v.choice_two_votes, v.total_votes
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
  )
  select id, choice_one_votes, one_count, choice_two_votes, two_count, total_votes, total_count
  from actual
  where choice_one_votes is distinct from one_count or choice_two_votes is distinct from two_count or total_votes is distinct from total_count;
$$;
revoke all on function public.report_verdict_counter_drift(integer) from public, anon, authenticated;
grant execute on function public.report_verdict_counter_drift(integer) to service_role;

create or replace function public.repair_verdict_counters(p_verdict_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare changed integer := 0;
begin
  with counts as (
    select v.id,
      count(*) filter (where vv.choice='one')::integer as one_count,
      count(*) filter (where vv.choice='two')::integer as two_count,
      count(vv.*)::integer as total_count
    from public.verdicts v left join public.verdict_votes vv on vv.verdict_id=v.id
    where p_verdict_ids is null or v.id = any(p_verdict_ids)
    group by v.id
  )
  update public.verdicts v set choice_one_votes=c.one_count, choice_two_votes=c.two_count, total_votes=c.total_count, updated_at=timezone('utc',now())
  from counts c where c.id=v.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.repair_verdict_counters(uuid[]) from public, anon, authenticated;
grant execute on function public.repair_verdict_counters(uuid[]) to service_role;
