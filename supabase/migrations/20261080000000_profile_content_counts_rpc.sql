create or replace function public.get_profile_content_counts(p_user_id uuid)
returns table(dares bigint, truths bigint)
language sql
security invoker
set search_path = public
as $$
  select
    (select count(*)::bigint from public.dares d
      where d.workflow_state = 'ACCEPTED_REAL'
        and (d.creator_id = p_user_id or d.receiver_id = p_user_id)),
    (select count(*)::bigint from public.truths t
      where t.workflow_state = 'APPROVED'
        and (t.creator_id = p_user_id or t.receiver_id = p_user_id));
$$;

revoke all on function public.get_profile_content_counts(uuid) from public;
grant execute on function public.get_profile_content_counts(uuid) to authenticated;
