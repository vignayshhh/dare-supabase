create or replace function public.get_truth_vote_counts(p_truth_ids uuid[])
returns table(truth_id uuid, truth_count bigint, lie_count bigint, total_count bigint)
language sql
security invoker
set search_path = public
as $$
  select ids.truth_id,
    (select count(*)::bigint from public.truth_votes v where v.truth_id = ids.truth_id and v.vote = 'TRUTH'),
    (select count(*)::bigint from public.truth_votes v where v.truth_id = ids.truth_id and v.vote = 'LIE'),
    (select count(*)::bigint from public.truth_votes v where v.truth_id = ids.truth_id)
  from unnest(coalesce(p_truth_ids, '{}'::uuid[])) as ids(truth_id);
$$;

revoke all on function public.get_truth_vote_counts(uuid[]) from public;
grant execute on function public.get_truth_vote_counts(uuid[]) to authenticated;
