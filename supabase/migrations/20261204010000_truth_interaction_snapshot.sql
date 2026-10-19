-- Bounded truth interaction snapshots.  The RPC is security-invoker so the
-- existing truth visibility policies remain the source of authorization.
alter table public.truths
  add column if not exists truth_vote_count integer not null default 0,
  add column if not exists lie_vote_count integer not null default 0,
  add column if not exists interaction_revision bigint not null default 0;

update public.truths t
set truth_vote_count = s.truth_count,
    lie_vote_count = s.lie_count
from (
  select truth_id,
         count(*) filter (where upper(vote) = 'TRUTH')::integer as truth_count,
         count(*) filter (where upper(vote) = 'LIE')::integer as lie_count
  from public.truth_votes group by truth_id
) s
where t.id = s.truth_id;

create or replace function public.sync_truth_vote_totals()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_truth uuid := coalesce(new.truth_id, old.truth_id);
begin
  if tg_op = 'UPDATE' and old.vote is not distinct from new.vote then return new; end if;
  update public.truths t set
    truth_vote_count = (select count(*) from public.truth_votes v where v.truth_id = t.id and upper(v.vote) = 'TRUTH'),
    lie_vote_count = (select count(*) from public.truth_votes v where v.truth_id = t.id and upper(v.vote) = 'LIE'),
    interaction_revision = t.interaction_revision + 1,
    updated_at = timezone('utc', now())
  where t.id = v_truth;
  return coalesce(new, old);
end; $$;

drop trigger if exists truth_vote_totals on public.truth_votes;
create trigger truth_vote_totals after insert or update or delete on public.truth_votes
for each row execute function public.sync_truth_vote_totals();

create or replace function public.get_truth_interaction_snapshot(p_truth_id uuid)
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'truthCount', t.truth_vote_count,
    'lieCount', t.lie_vote_count,
    'total', t.truth_vote_count + t.lie_vote_count,
    'userVote', (select v.vote from public.truth_votes v where v.truth_id = t.id and v.voter_id = auth.uid()),
    'revision', t.interaction_revision,
    'voters', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.voter_id desc)
      from (select truth_id, voter_id, vote, created_at from public.truth_votes where truth_id = t.id order by created_at desc, voter_id desc limit 100) v), '[]'::jsonb)
  )
  from public.truths t where t.id = p_truth_id;
$$;
revoke all on function public.get_truth_interaction_snapshot(uuid) from public;
grant execute on function public.get_truth_interaction_snapshot(uuid) to authenticated, service_role;
