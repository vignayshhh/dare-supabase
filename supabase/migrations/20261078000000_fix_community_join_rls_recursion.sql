-- Prepared during QA; do not apply automatically. The previous policy queried
-- community_challenge_joins from its own USING clause and therefore recursed.
create or replace function public.is_community_challenge_member(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
