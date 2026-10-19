create or replace function public.get_story_view_counts(p_story_ids uuid[])
returns table(story_id uuid, view_count bigint)
language sql
security invoker
set search_path = public
as $$
  select sv.story_id, count(*)::bigint
  from public.story_views sv
  where sv.story_id = any(coalesce(p_story_ids, '{}'::uuid[]))
  group by sv.story_id;
$$;

revoke all on function public.get_story_view_counts(uuid[]) from public;
grant execute on function public.get_story_view_counts(uuid[]) to authenticated;
