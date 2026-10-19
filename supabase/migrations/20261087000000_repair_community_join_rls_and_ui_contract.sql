-- Repair the deployed self-referential SELECT policy. The membership helper
-- runs with its owner privileges so it can safely answer membership without
-- recursively applying this table's policy.
create or replace function public.is_community_challenge_member(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.community_challenge_joins
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_community_challenge_member(uuid) from public;
grant execute on function public.is_community_challenge_member(uuid) to authenticated;

drop policy if exists community_joins_read on public.community_challenge_joins;
create policy community_joins_read
on public.community_challenge_joins
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_community_challenge_member(challenge_id)
);
