create or replace function public.get_dare_interaction_counts(p_dare_ids uuid[])
returns table(dare_id uuid, view_count bigint, comment_count bigint)
language sql
security invoker
set search_path = public
as $$
  select ids.dare_id,
    (select count(*)::bigint from public.dare_views v where v.dare_id = ids.dare_id),
    (select count(*)::bigint from public.dare_comments c where c.dare_id = ids.dare_id)
  from unnest(coalesce(p_dare_ids, '{}'::uuid[])) as ids(dare_id);
$$;

revoke all on function public.get_dare_interaction_counts(uuid[]) from public;
grant execute on function public.get_dare_interaction_counts(uuid[]) to authenticated;
